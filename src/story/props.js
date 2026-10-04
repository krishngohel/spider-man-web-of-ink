import * as THREE from 'three';
import { comicToon } from '../render/comicShade.js';

// Loose things in a boss arena (spec 8.1, environmental throws): crates, AC units, debris. They
// lie where they fall; a boss can lift one and throw it; the hero can web yank one (aim at it and
// press the yank key) and it flies at the boss. Flights are ballistic with real gravity: a throw
// picks the launch speed that lands on the target, and the flight is not steered after that.

const GRAV = 22;
const mats = {};
const mat = (c) => (mats[c] ??= comicToon({ color: c }));
const KINDS = {
  crate: { size: [1.2, 1.0, 1.2], color: 0x9a6a3a, dmg: 48 },
  ac: { size: [1.6, 1.1, 1.2], color: 0xb8bcc2, dmg: 55 },
  debris: { size: [1.4, 0.8, 1.0], color: 0x8a8580, dmg: 45 },
  bin: { size: [0.75, 1.05, 0.75], color: 0x3f6a4a, dmg: 40 },
  box: { size: [0.9, 0.7, 0.9], color: 0xb08850, dmg: 36 },
};

export function createProps({ scene, world }) {
  const list = [];
  const _v = new THREE.Vector3();

  function add({ x, y, z, kind = 'crate' }) {
    const K = KINDS[kind];
    const m = new THREE.Mesh(new THREE.BoxGeometry(K.size[0], K.size[1], K.size[2]), mat(K.color));
    m.castShadow = true;
    const gy = world.groundHeight(x, y + 2, z);
    const p = { kind, K, mesh: m, p: { x, y: Math.max(gy, y) + K.size[1] / 2, z }, v: { x: 0, y: 0, z: 0 }, state: 'rest', owner: null, spin: 0 };
    m.position.set(p.p.x, p.p.y, p.p.z);
    m.rotation.y = Math.random() * Math.PI;
    scene.add(m);
    list.push(p);
    return p;
  }
  function remove(p) { scene.remove(p.mesh); p.mesh.geometry.dispose(); const i = list.indexOf(p); if (i >= 0) list.splice(i, 1); }

  // Launch velocity for a flight from a to b taking time t (gravity GRAV).
  function launch(p, to, t, owner) {
    p.v.x = (to.x - p.p.x) / t; p.v.z = (to.z - p.p.z) / t;
    p.v.y = (to.y - p.p.y + 0.5 * GRAV * t * t) / t;
    p.state = 'flying'; p.owner = owner; p.spin = (Math.random() - 0.5) * 12; p.age = 0;
  }

  // The hero's yank: the prop nearest the crosshair (within 8 degrees, 26 m) flies at the target.
  function tryYank(cam, heroP, target) {
    let best = null, bestA = 0.14;
    for (const p of list) {
      if (p.state !== 'rest') continue;
      const dx = p.p.x - cam.x, dy = p.p.y - cam.y, dz = p.p.z - cam.z, d = Math.hypot(dx, dy, dz);
      if (Math.hypot(p.p.x - heroP.x, p.p.z - heroP.z) > 26) continue;
      const a = Math.acos(Math.max(-1, Math.min(1, (dx * cam.fx + dy * cam.fy + dz * cam.fz) / d)));
      if (a < bestA) { bestA = a; best = p; }
    }
    if (!best || !target) return null;
    const tp = target.body.p;
    const d = Math.hypot(tp.x - best.p.x, tp.z - best.p.z);
    // First the pull toward the hero (a short hop), then on to the target: modelled as one throw
    // whose time grows with the distance.
    launch(best, { x: tp.x, y: tp.y + 0.4, z: tp.z }, Math.max(0.45, Math.min(1.1, d / 22)), 'hero');
    best.target = target;
    return best;
  }

  // A boss lifts one (held over its head) and throws it.
  function lift(p, holder) { p.state = 'held'; p.holder = holder; }
  // Let go of anything this holder carries (a stun knocks it out of his hands).
  function drop(holder) { for (const p of list) if (p.state === 'held' && p.holder === holder) { p.state = 'flying'; p.owner = null; p.v.x = 0; p.v.y = 0; p.v.z = 0; p.age = 0.1; p.holder = null; } }
  function throwAt(p, to, t = 0.8) { launch(p, to, t, 'boss'); p.holder = null; }

  function step(dt, { hero, heroInvuln, hitHero, hitBoss, onBreak }) {
    for (const p of [...list]) {
      if (p.state === 'held') {
        const h = p.holder.body.p;
        p.p.x = h.x; p.p.y = h.y + 2.2; p.p.z = h.z;
      } else if (p.state === 'flying') {
        p.age += dt;
        p.v.y -= GRAV * dt;
        const nx = p.p.x + p.v.x * dt, ny = p.p.y + p.v.y * dt, nz = p.p.z + p.v.z * dt;
        if (p.owner === 'hero' && p.target) {
          const t = p.target.body.p;
          if (Math.hypot(t.x - nx, t.y - ny, t.z - nz) < 1.9) { hitBoss(p.target, p); breakProp(p, onBreak); continue; }
        }
        if (p.owner === 'boss') {
          const h = hero.body.p;
          if (Math.hypot(h.x - nx, h.y - ny, h.z - nz) < 1.5 && !heroInvuln()) { hitHero(p, { x: p.v.x, z: p.v.z }); breakProp(p, onBreak); continue; }
        }
        const len = Math.hypot(nx - p.p.x, ny - p.p.y, nz - p.p.z);
        const hit = len > 1e-4 && p.age > 0.08 ? world.raycast(p.p.x, p.p.y, p.p.z, (nx - p.p.x) / len, (ny - p.p.y) / len, (nz - p.p.z) / len, len + 0.4) : null;
        if (hit || ny < 0.4 || p.age > 4) { breakProp(p, onBreak); continue; }
        p.p.x = nx; p.p.y = ny; p.p.z = nz;
        p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.z += p.spin * 0.6 * dt;
      }
      p.mesh.position.set(p.p.x, p.p.y, p.p.z);
    }
  }
  function breakProp(p, onBreak) { onBreak?.(p); remove(p); }

  void _v;
  return {
    list, add, remove, tryYank, lift, drop, throwAt, step,
    // A street throw (Insomniac's L1 + R1): the nearest loose thing within r metres of the hero
    // flies at the target.
    yankNearest(heroP, target, r = 9) {
      let best = null, bd = r;
      for (const p of list) { if (p.state !== 'rest') continue; const d = Math.hypot(p.p.x - heroP.x, p.p.z - heroP.z); if (d < bd) { bd = d; best = p; } }
      if (!best || !target) return null;
      const tp = target.body.p, d = Math.hypot(tp.x - best.p.x, tp.z - best.p.z);
      launch(best, { x: tp.x, y: tp.y + 0.4, z: tp.z }, Math.max(0.35, Math.min(0.9, d / 24)), 'hero');
      best.target = target;
      return best;
    },
    nearest(x, z, state = 'rest') { let b = null, bd = Infinity; for (const p of list) { if (p.state !== state) continue; const d = Math.hypot(p.p.x - x, p.p.z - z); if (d < bd) { bd = d; b = p; } } return b; },
    clear() { while (list.length) remove(list[0]); },
  };
}
