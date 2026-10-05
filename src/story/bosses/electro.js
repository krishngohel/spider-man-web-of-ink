import * as THREE from 'three';
import { applyDv } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';
import { comicToon } from '../../render/comicShade.js';
import { LAYER_FX } from '../../render/layers.js';

// Electro on the Harbor power station roof (spec 10, Act 2). Fully charged he is untouchable:
// blows shock you back and webs fizzle (an electric web does nothing to him). Three relay boxes
// on the roof feed him: smash one up close (they are too well grounded to yank loose) and it
// shorts, draining him for a window.
// Attacks: an arc bolt along a line (anything solid in between takes it), a ground pulse up close,
// slow ball lightning that follows you. Phase 2 (50%): the magnetic pull carries him up a
// chimney, he calls bolts down on marked circles; yank the relay at that chimney's foot and he
// drops, drained. A relay re-arms after a while.

const L = (who, text) => ({ who, text });
const BOLT_COLOR = 0x9ae8ff;
const GEO = { orb: new THREE.SphereGeometry(0.45, 10, 8), mark: new THREE.RingGeometry(2.2, 3, 28) };

export function createElectro(ctx) {
  const { site, hero, fx, say, word, shake, world, scene, city } = ctx;
  const ar = site.arena;
  const a = createBossActor(ctx, { char: 'electro', hp: 420, armor: 0.55, poise: 999, mass: 80, at: { x: site.x, y: site.y, z: site.z + 4 }, arena: ar });
  let phase = 1, think = 1.4, done = false, charged = true, time = 0, perch = null, strikeT = 3;
  const relays = [], orbs = [], marks = [];
  const mats = { box: comicToon({ color: 0x5a6068 }), live: new THREE.MeshBasicMaterial({ color: 0xf2e040 }), dead: new THREE.MeshBasicMaterial({ color: 0x3a3a40 }) };
  const boltMat = new THREE.LineBasicMaterial({ color: BOLT_COLOR });
  const orbMat = new THREE.MeshBasicMaterial({ color: BOLT_COLOR, transparent: true, opacity: 0.85 });
  const markMat = new THREE.MeshBasicMaterial({ color: BOLT_COLOR, transparent: true, opacity: 0.6, depthWrite: false });
  const bolts = [];

  // The chimneys of the station (the tall boxes) and a relay at the foot of each.
  const chimneys = (city.landmarkBoxes.power ?? []).filter((b) => b.max[1] - b.min[1] > 30).map((b) => ({ x: (b.min[0] + b.max[0]) / 2, z: (b.min[2] + b.max[2]) / 2, top: b.max[1], hz: (b.max[2] - b.min[2]) / 2 }));
  function relay(x, z, chimney = null) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.8), mats.box);
    box.position.y = 0.8;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.82), mats.live);
    lamp.position.y = 1.3;
    g.add(box, lamp);
    g.position.set(x, ar.y, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    const r = { g, lamp, x, y: ar.y + 0.8, z, live: true, t: 0, chimney };
    relays.push(r);
    return r;
  }
  // Three on the roof, one per chimney foot (used in phase 2).
  relay(ar.minX + 6, ar.minZ + 3); relay(ar.maxX - 6, ar.minZ + 3); relay((ar.minX + ar.maxX) / 2, ar.maxZ - 3);
  for (const c of chimneys) relay(c.x, Math.min(ar.maxZ - 1, c.z + c.hz + 1.4), c);

  function bolt(from, to, life = 0.18) {
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const k = i / n, j = i === 0 || i === n ? 0 : 0.7;
      pts.push(new THREE.Vector3(from.x + (to.x - from.x) * k + (Math.random() - 0.5) * j, from.y + (to.y - from.y) * k + (Math.random() - 0.5) * j, from.z + (to.z - from.z) * k + (Math.random() - 0.5) * j));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), boltMat);
    line.layers.set(LAYER_FX);
    line.frustumCulled = false;
    scene.add(line);
    bolts.push({ line, t: life });
  }

  // The chimney relay (phase 2): the yank key aimed at it (the director asks before props and
  // enemies). A roof relay in phase 1 is bolted down: the yank only says so (smash it instead).
  function yankAt(cam, heroP) {
    let best = null, bestA = 0.16;
    for (const r of relays) {
      if (!r.live) continue;
      if (phase === 1 && (r.chimney || !charged)) continue; // drained: the yank goes to him
      if (phase === 2 && (!perch || r.chimney !== perch)) continue;
      const dx = r.x - cam.x, dy = r.y - cam.y, dz = r.z - cam.z, d = Math.hypot(dx, dy, dz);
      if (Math.hypot(r.x - heroP.x, r.z - heroP.z) > 28) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * cam.fx + dy * cam.fy + dz * cam.fz) / d)));
      if (ang < bestA) { bestA = ang; best = r; }
    }
    if (!best) return null;
    if (phase === 1) { word('BOLTED DOWN! SMASH IT!', { x: best.x, y: best.y + 1.5, z: best.z }, 'small'); return { x: best.x, y: best.y, z: best.z }; }
    const h = hero.body.p;
    fx.tether({ x: h.x, y: h.y + 0.5, z: h.z }, { x: best.x, y: best.y, z: best.z });
    setTimeout(() => fx.tether(null), 200);
    short(best);
    return { x: best.x, y: best.y, z: best.z };
  }
  // A roof relay (phase 1): the attack key up close smashes it (the director asks first, so the
  // blow goes to the box and not to Electro).
  function attackAt(heroP) {
    if (phase !== 1 || !charged) return null;
    for (const r of relays) {
      if (!r.live || r.chimney || Math.hypot(r.x - heroP.x, r.z - heroP.z) > 3 || Math.abs(r.y - heroP.y) > 2.5) continue;
      short(r);
      return r;
    }
    return null;
  }
  function short(best) {
    best.live = false; best.t = 0;
    best.lamp.material = mats.dead;
    word('SHORTED!', { x: best.x, y: best.y + 1, z: best.z }, 'big');
    shake(0.4);
    bolt({ x: best.x, y: best.y + 1, z: best.z }, { x: a.body.p.x, y: a.body.p.y + 0.5, z: a.body.p.z }, 0.35);
    drain(phase === 2 ? 5 : 4.2);
  }
  function drain(t) {
    charged = false;
    if (perch) {
      // Off the chimney top and down onto the roof, where you can reach him.
      const p = a.body.p, cx = (ar.minX + ar.maxX) / 2, cz = (ar.minZ + ar.maxZ) / 2, dx = cx - p.x, dz = cz - p.z, l = Math.hypot(dx, dz) || 1;
      perch = null; a.flying = false; a.poseState = 'air'; a.arena = ar;
      applyDv(a.body, 'surface', (dx / l) * 7 - a.body.v.x, 3 - a.body.v.y, (dz / l) * 7 - a.body.v.z);
    }
    a.stun(t);
    word('DRAINED!', a.body.p, 'big');
  }

  a.onHit = (args) => {
    if (a.e.state === 'out') return { dealt: 0, blocked: true };
    if (charged) {
      // Live wire: the blow shocks you back and does nothing to him.
      const t = a.toHero();
      if (args.kind !== 'web' && t.d < 4) { applyDv(hero.body, 'surface', t.ux * 9, 4, t.uz * 9); a.hurtHero(6, { x: t.ux, z: t.uz }, true); bolt({ x: a.body.p.x, y: a.body.p.y + 0.6, z: a.body.p.z }, { x: hero.body.p.x, y: hero.body.p.y + 0.5, z: hero.body.p.z }); word('ZZAK!', hero.body.p, 'hit'); }
      return { dealt: 0, blocked: true };
    }
    return baseHit(args);
  };
  const baseHit = (args) => {
    let dmg = Math.min(args.dmg ?? 10, 60);
    if (args.dmg >= 999) dmg = a.e.maxHp * 0.08;
    return { dealt: a.damage(dmg * (a.stunned() ? 0.75 : 0.35)), blocked: false };
  };
  a.onWeb = () => word('FZZT!', a.body.p, 'small');
  a.floor = () => (phase === 1 ? 0.5 : 0);
  a.onYank = () => false;

  function arcBolt() {
    const p = a.body.p, h = hero.body.p;
    const from = { x: p.x, y: p.y + 0.8, z: p.z }, dx = h.x - from.x, dy = h.y + 0.3 - from.y, dz = h.z - from.z, d = Math.hypot(dx, dy, dz) || 1;
    const block = world.raycast(from.x, from.y, from.z, dx / d, dy / d, dz / d, d - 0.5, { ground: false });
    const end = block ? { x: block.x, y: block.y, z: block.z } : { x: h.x, y: h.y + 0.3, z: h.z };
    bolt(from, end, 0.22);
    ctx.sfx?.({ type: 'shot' });
    if (!block && d < 38 && !ctx.heroInvuln()) a.hurtHero(11, { x: dx / d, z: dz / d }, false);
  }
  function pulse() {
    const p = a.body.p, t = a.toHero();
    fx.shock({ x: p.x, y: p.y - 0.9, z: p.z }, 7);
    for (let i = 0; i < 6; i++) { const ang = (i / 6) * Math.PI * 2; bolt({ x: p.x, y: p.y, z: p.z }, { x: p.x + Math.cos(ang) * 6, y: p.y - 0.8, z: p.z + Math.sin(ang) * 6 }); }
    shake(0.5);
    if (t.d < 6 && Math.abs(t.dy) < 2.5) { applyDv(hero.body, 'surface', t.ux * 10, 5, t.uz * 10); a.hurtHero(12, { x: t.ux, z: t.uz }, true); }
  }
  function ball() {
    const p = a.body.p;
    const m = new THREE.Mesh(GEO.orb, orbMat);
    m.layers.set(LAYER_FX);
    m.position.set(p.x, p.y + 1, p.z);
    scene.add(m);
    orbs.push({ m, p: { x: p.x, y: p.y + 1, z: p.z }, t: 6 });
  }
  function markStrike() {
    const h = hero.body.p;
    const m = new THREE.Mesh(GEO.mark, markMat);
    m.layers.set(LAYER_FX);
    m.rotation.x = -Math.PI / 2;
    const y = world.groundHeight(h.x, h.y + 0.5, h.z) + 0.1;
    m.position.set(h.x, y, h.z);
    scene.add(m);
    marks.push({ m, x: h.x, y, z: h.z, t: 1.3 });
  }

  function update(dt) {
    time += dt;
    for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t -= dt; if (bolts[i].t <= 0) { scene.remove(bolts[i].line); bolts[i].line.geometry.dispose(); bolts.splice(i, 1); } }
    for (const r of relays) if (!r.live) { r.t += dt; if (r.t > 16) { r.live = true; r.lamp.material = mats.live; } }
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i], h = hero.body.p;
      o.t -= dt;
      const dx = h.x - o.p.x, dy = h.y + 0.3 - o.p.y, dz = h.z - o.p.z, d = Math.hypot(dx, dy, dz) || 1;
      o.p.x += (dx / d) * 8 * dt; o.p.y += (dy / d) * 8 * dt; o.p.z += (dz / d) * 8 * dt;
      o.m.position.set(o.p.x, o.p.y, o.p.z);
      o.m.scale.setScalar(0.9 + Math.sin(time * 20) * 0.15);
      if (d < 1.1 && !ctx.heroInvuln()) { a.hurtHero(10, { x: dx / d, z: dz / d }, true); word('ZAP!', h, 'hit'); o.t = 0; }
      if (o.t <= 0) { scene.remove(o.m); orbs.splice(i, 1); }
    }
    for (let i = marks.length - 1; i >= 0; i--) {
      const k = marks[i];
      k.t -= dt;
      k.m.material.opacity = 0.35 + 0.4 * Math.abs(Math.sin(time * 12));
      if (k.t <= 0) {
        bolt({ x: k.x, y: k.y + 40, z: k.z }, { x: k.x, y: k.y, z: k.z }, 0.25);
        fx.shock({ x: k.x, y: k.y, z: k.z }, 3);
        const h = hero.body.p;
        if (Math.hypot(h.x - k.x, h.z - k.z) < 3 && Math.abs(h.y - 0.9 - k.y) < 2.5 && !ctx.heroInvuln()) a.hurtHero(14, { x: 0, z: 0 }, true);
        scene.remove(k.m); marks.splice(i, 1);
      }
    }
    if (done) { a.step(dt); return; }
    const e = a.e, t = a.toHero();
    if (a.hpFrac() <= 0 && e.state !== 'out') { a.defeat(); done = true; charged = false; word('SHORT CIRCUIT!', a.body.p, 'big'); a.step(dt); return; }
    if (phase === 1 && a.hpFrac() <= 0.5 && !a.attacking()) { phase = 2; say([L('electro', 'You want power? Look up, bug.')]); goUp(); }
    if (a.stunned()) { a.step(dt); return; }
    if (!charged) { charged = true; word('RECHARGED', a.body.p, 'small'); if (phase === 2) goUp(); }
    // The glow while charged: the hurt flash reused as a crackle.
    a.e.model.hurt.value = Math.max(a.e.model.hurt.value, charged ? 0.25 + 0.2 * Math.sin(time * 30) : 0);

    if (phase === 2 && perch) {
      // Riding the pull up the chimney, then perched on top calling bolts down.
      const want = { x: perch.x, y: perch.top + 1.4, z: perch.z };
      const v = a.body.v, p = a.body.p;
      applyDv(a.body, 'assist', ((want.x - p.x) * 2 - v.x) * Math.min(1, dt * 3), ((want.y - p.y) * 2 - v.y) * Math.min(1, dt * 3), ((want.z - p.z) * 2 - v.z) * Math.min(1, dt * 3));
      a.faceHero(dt, 4);
      strikeT -= dt;
      if (strikeT <= 0 && Math.hypot(p.x - want.x, p.z - want.z) < 3) { strikeT = 2; markStrike(); if (Math.random() < 0.35) ball(); }
      a.step(dt);
      return;
    }
    a.faceHero(dt, 6);
    const keep = t.d < 6 ? -1 : t.d > 14 ? 1 : 0;
    a.move((t.ux * keep - t.uz * 0.4) * 4.2, (t.uz * keep + t.ux * 0.4) * 4.2, dt);
    think -= dt;
    if (think <= 0 && !a.attacking()) {
      think = 1.3 + Math.random() * 0.9;
      if (t.d < 5) a.windup({ t: 0.75, ranged: true, unblockable: true, reach: 7, recover: 0.6, pose: 'slamStart', onStrike: pulse });
      else if (Math.random() < 0.3) a.windup({ t: 0.6, ranged: true, reach: 40, recover: 0.4, pose: 'punch', onStrike: ball });
      else a.windup({ t: 0.75, ranged: true, reach: 40, recover: 0.5, pose: 'punch', onStrike: arcBolt });
    }
    a.step(dt);
  }
  function goUp() {
    if (!chimneys.length) return;
    // The chimney furthest from the hero.
    const h = hero.body.p;
    perch = chimneys.reduce((b, c) => (Math.hypot(c.x - h.x, c.z - h.z) > Math.hypot(b.x - h.x, b.z - h.z) ? c : b));
    a.flying = true; a.arena = null; a.poseState = 'glide';
    strikeT = 2.5;
  }

  return {
    actor: a,
    get done() { return done; },
    get phase() { return phase; },
    get state() { return { phase, hp: a.hpFrac(), charged, perched: !!perch, state: a.e.state, relays: relays.filter((r) => r.live && (phase === 1 ? !r.chimney : r.chimney === perch)).map((r) => ({ x: r.x, y: r.y, z: r.z })) }; },
    update,
    yankAt,
    attackAt,
    setPhase(n) { if (n >= 2 && phase < 2) { phase = 2; a.e.hp = a.e.maxHp * 0.5; goUp(); } },
    dispose() {
      a.dispose();
      for (const r of relays) scene.remove(r.g);
      for (const b of bolts) scene.remove(b.line);
      for (const o of orbs) scene.remove(o.m);
      for (const k of marks) scene.remove(k.m);
      fx.tether(null);
    },
  };
}
