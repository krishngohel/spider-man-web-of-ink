import * as THREE from 'three';
import { applyDv } from '../physics/ledger.js';
import { isActive, pickTarget } from './enemies.js';
import { comicToon } from '../render/comicShade.js';

// Gadgets (spec 8.3): a wheel of seven beside the web shooter, each with charges that refill over
// time and three upgrade levels (Plan 4 raises them). Every effect is a real push, a web or a
// stun: nothing teleports.

export const GADGETS = [
  { id: 'webBomb', name: 'Web Bomb', charges: [2, 3, 4], refill: 14, desc: 'Thrown: webs everyone near where it lands.' },
  { id: 'impactWeb', name: 'Impact Web', charges: [3, 4, 5], refill: 10, desc: 'Knocks one enemy back hard, and pins him to a wall.' },
  { id: 'tripMine', name: 'Trip Mine', charges: [2, 3, 4], refill: 16, desc: 'Stick it to a wall: the next one to pass is webbed to it.' },
  { id: 'electricWeb', name: 'Electric Web', charges: [2, 3, 3], refill: 15, desc: 'Shocks a target and the enemies around him.' },
  { id: 'suspension', name: 'Suspension Matrix', charges: [1, 2, 2], refill: 22, desc: 'Floats everyone near you off the ground for a few seconds.' },
  { id: 'drone', name: 'Spider-Drone', charges: [1, 1, 2], refill: 28, desc: 'A drone that fights beside you for ten seconds.' },
  { id: 'concussive', name: 'Concussive Blast', charges: [2, 3, 3], refill: 15, desc: 'A blast of air that knocks a crowd off its feet.' },
];

export function createGadgets({ scene, enemies, projectiles, hero, world, onEvent = () => {} }) {
  const state = {};
  for (const g of GADGETS) state[g.id] = { level: 1, charges: g.charges[0], t: 0 };
  let selected = 'webBomb';
  // Skill and mod modifiers (progression sets these).
  const mods = { refillMul: 1, extraCharge: 0, mineRadius: 0, chainExtra: 0, droneTime: 0, blastRange: 0 };
  const mines = [], drones = [];
  const mineMat = comicToon({ color: 0x2a2c30 }), droneMat = comicToon({ color: 0xd3232e });

  function setLevels(levels) {
    for (const g of GADGETS) {
      const lv = Math.max(0, Math.min(3, levels[g.id] ?? 1));
      state[g.id].level = lv;
      state[g.id].charges = Math.min(state[g.id].charges, lv ? g.charges[lv - 1] : 0);
    }
  }
  const maxCharges = (g) => (state[g.id].level ? g.charges[state[g.id].level - 1] + mods.extraCharge : 0);

  function use(camFwd) {
    const g = GADGETS.find((x) => x.id === selected);
    const s = state[g.id];
    if (!s.level || s.charges <= 0) { onEvent({ type: 'gadgetEmpty', id: g.id }); return false; }
    s.charges--;
    const p = hero.body.p, from = { x: p.x, y: p.y + 0.5, z: p.z };
    const tgt = pickTarget(p, camFwd, enemies.list, 30);
    const aim = tgt ? { x: tgt.body.p.x, y: tgt.body.p.y + 0.3, z: tgt.body.p.z } : { x: from.x + camFwd.x * 25, y: from.y + camFwd.y * 25, z: from.z + camFwd.z * 25 };
    const lv = s.level;
    switch (g.id) {
      case 'webBomb': projectiles.fire('web', from, aim, { owner: 'hero', dmg: 0.25, aoe: 3.5 + lv * 0.7, gadget: 'webBomb' }); break;
      case 'impactWeb': projectiles.fire('web', from, aim, { owner: 'hero', dmg: 0.5, gadget: 'impactWeb' }); break;
      case 'electricWeb': projectiles.fire('web', from, aim, { owner: 'hero', dmg: 0.2, gadget: 'electricWeb' }); break;
      case 'tripMine': {
        const d = camFwd, hit = world.raycast(from.x, from.y, from.z, d.x, d.y, d.z, 25, { ground: true });
        if (!hit) { s.charges++; onEvent({ type: 'noAnchor' }); return false; }
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 10), mineMat);
        mesh.position.set(hit.x + hit.nx * 0.05, hit.y + hit.ny * 0.05, hit.z + hit.nz * 0.05);
        mesh.lookAt(mesh.position.x + hit.nx, mesh.position.y + hit.ny, mesh.position.z + hit.nz);
        mesh.rotateX(Math.PI / 2);
        scene.add(mesh);
        mines.push({ x: hit.x, y: hit.y, z: hit.z, mesh, r: 2.6 + lv * 0.5 + mods.mineRadius, life: 60 });
        break;
      }
      case 'suspension':
        for (const e of enemies.active) {
          const d = Math.hypot(e.body.p.x - p.x, e.body.p.z - p.z);
          if (d < 6 + lv * 1.5 && !e.A.heavy) { e.float = 3 + lv; applyDv(e.body, 'assist', 0, 5, 0); enemies.hit(e, { dmg: 2, push: 0, lift: 3, from: p }); }
        }
        onEvent({ type: 'suspension', at: { ...p } });
        break;
      case 'drone': makeDrone(8 + lv * 2 + mods.droneTime); break;
      case 'concussive':
        for (const e of enemies.active) {
          const dx = e.body.p.x - p.x, dz = e.body.p.z - p.z, d = Math.hypot(dx, dz) || 1;
          const along = (dx * camFwd.x + dz * camFwd.z) / d;
          if (d < 9 + lv * 1.5 + mods.blastRange && along > 0.45) enemies.hit(e, { dmg: 8, dir: { x: dx / d, z: dz / d }, push: 12, lift: 3, from: p });
        }
        onEvent({ type: 'concussive', at: { ...p }, dir: camFwd });
        break;
      default: break;
    }
    onEvent({ type: 'gadget', id: g.id });
    return true;
  }

  // A spider-drone that circles the hero and shoots stun webs at the nearest enemy.
  function makeDrone(life, phase = Math.random() * 6) {
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), droneMat));
    for (let i = 0; i < 4; i++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), mineMat); leg.rotation.y = (i * Math.PI) / 4; mesh.add(leg); }
    scene.add(mesh);
    drones.push({ mesh, life, fireT: 0.4, a: phase });
  }

  // A hero web projectile with a gadget payload hit something.
  function payload(p, e) {
    if (p.gadget === 'webBomb') {
      for (const o of enemies.active) {
        const d = Math.hypot(o.body.p.x - p.x, o.body.p.z - p.z);
        if (d < p.aoe) enemies.hit(o, { kind: 'web', dmg: 0.65 });
      }
      onEvent({ type: 'webBomb', at: { x: p.x, y: p.y, z: p.z }, r: p.aoe });
      return true;
    }
    if (p.gadget === 'impactWeb' && e) {
      const dx = e.body.p.x - hero.body.p.x, dz = e.body.p.z - hero.body.p.z, d = Math.hypot(dx, dz) || 1;
      enemies.hit(e, { kind: 'web', dmg: 1 });
      applyDv(e.body, 'rope', (dx / d) * 14, 2, (dz / d) * 14);
      return true;
    }
    if (p.gadget === 'electricWeb' && e) {
      const chain = [e, ...enemies.active.filter((o) => o !== e && Math.hypot(o.body.p.x - e.body.p.x, o.body.p.z - e.body.p.z) < 6).slice(0, 3 + mods.chainExtra)];
      for (const o of chain) enemies.hit(o, { dmg: 9, push: 1, from: hero.body.p });
      onEvent({ type: 'electric', chain: chain.map((o) => ({ ...o.body.p })) });
      return true;
    }
    return false;
  }

  function step(dt) {
    for (const g of GADGETS) {
      const s = state[g.id];
      if (s.charges < maxCharges(g)) { s.t += dt; if (s.t >= g.refill * mods.refillMul) { s.t = 0; s.charges++; } }
    }
    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i];
      m.life -= dt;
      const victim = enemies.active.find((e) => Math.hypot(e.body.p.x - m.x, e.body.p.y - m.y, e.body.p.z - m.z) < m.r);
      if (victim || m.life <= 0) {
        if (victim) {
          const dx = m.x - victim.body.p.x, dy = m.y - victim.body.p.y, dz = m.z - victim.body.p.z, d = Math.hypot(dx, dy, dz) || 1;
          applyDv(victim.body, 'rope', (dx / d) * 10, (dy / d) * 10 + 2, (dz / d) * 10);
          enemies.hit(victim, { kind: 'web', dmg: 1 });
          onEvent({ type: 'mine', at: { x: m.x, y: m.y, z: m.z } });
        }
        scene.remove(m.mesh);
        mines.splice(i, 1);
      }
    }
    const hp = hero.body.p;
    for (let i = drones.length - 1; i >= 0; i--) {
      const d = drones[i];
      d.life -= dt; d.a += dt * 1.4; d.fireT -= dt;
      d.mesh.position.set(hp.x + Math.cos(d.a) * 1.6, hp.y + 1.4 + Math.sin(d.a * 2) * 0.2, hp.z + Math.sin(d.a) * 1.6);
      d.mesh.rotation.y += dt * 9;
      if (d.fireT <= 0) {
        d.fireT = 0.7;
        let best = null, bd = 25;
        for (const e of enemies.active) { const dd = Math.hypot(e.body.p.x - hp.x, e.body.p.z - hp.z); if (dd < bd) { bd = dd; best = e; } }
        if (best) projectiles.fire('web', d.mesh.position, { x: best.body.p.x, y: best.body.p.y + 0.3, z: best.body.p.z }, { owner: 'hero', dmg: 0.2 });
      }
      if (d.life <= 0) { scene.remove(d.mesh); drones.splice(i, 1); }
    }
  }

  return {
    state, use, payload, step, setLevels, mods,
    makeDrone,
    get selected() { return selected; },
    select(id) { if (state[id]) selected = id; },
    maxCharges,
    clear() { for (const m of mines) scene.remove(m.mesh); mines.length = 0; for (const d of drones) scene.remove(d.mesh); drones.length = 0; },
  };
}

export { isActive };
