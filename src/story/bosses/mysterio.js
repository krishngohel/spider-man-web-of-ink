import * as THREE from 'three';
import { createBody, placeBody, applyDv } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';
import { characterById } from '../../roster/characters.js';
import { comicToon } from '../../render/comicShade.js';
import { LAYER_FX } from '../../render/layers.js';
import { ARCHETYPES } from '../../combat/enemies.js';
import { NEON_PLAZA } from '../../world/city.js';

// Mysterio's "Broadway Premiere" in Neon Square (spec 10, Act 2). Everything here is smoke and
// projection; the physics never lies (the camera tilts and the ink turns green, nothing else).
// Phase 1: four decoys and the real one. A hit pops a decoy (it comes back); the spider-sense scan
// (V) marks the real one for a few seconds; now and then he trades places with a decoy in smoke.
// Phase 2 (60%): the giant Mysterio, his own figure eight times over, looms over the plaza and
// brings a fist down on marked spots. Three projector drones keep him there: yank them down or
// knock them out of the air. Phase 3: the real Mysterio, dizzy in the middle of the plaza.

const L = (who, text) => ({ who, text });
let droneId = 600000;
// Shared shapes (attacks come every few seconds; no new geometry each time).
const GEO = { smallCloud: new THREE.SphereGeometry(1.8, 12, 8), bigCloud: new THREE.SphereGeometry(3, 12, 8), gasRing: new THREE.RingGeometry(2.4, 3, 24), fistRing: new THREE.RingGeometry(3.6, 4.6, 32), fist: new THREE.SphereGeometry(2.6, 14, 10) };
const FIST_MAT = comicToon({ color: 0x3a8a4a });

export function createMysterio(ctx) {
  const { site, hero, fx, say, word, shake, scene, combat, world } = ctx;
  const P = NEON_PLAZA;
  const rand = () => ({ x: P.minX + 6 + Math.random() * (P.maxX - P.minX - 12), y: 0.9, z: site.z - 40 + Math.random() * 80 });
  const ar = { minX: P.minX + 2, maxX: P.maxX - 2, minZ: site.z - 60, maxZ: site.z + 60, y: 0 };
  const a = createBossActor(ctx, { char: 'mysterio', hp: 380, armor: 0.35, poise: 999, mass: 80, at: rand(), arena: ar });
  const rematch = ctx.step.variant === 'rematch';
  let phase = 1, done = false, think = 1.5, swapT = 9, markT = 0, time = 0, giant = null, giantT = 0, disposed = false, scanCd = 0;
  const decoys = [], clouds = [], drones = [], fists = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0x7ad06a, transparent: true, opacity: 0.35, depthWrite: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x7ad06a, transparent: true, opacity: 0.7, depthWrite: false });
  const markRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 24), new THREE.MeshBasicMaterial({ color: 0xff4a3a, depthWrite: false }));
  markRing.rotation.x = -Math.PI / 2; markRing.visible = false; markRing.layers.set(LAYER_FX);
  scene.add(markRing);
  ctx.illusion?.(0.55);

  // Decoys: the same figure, one hit and they burst into smoke (and come back).
  function addDecoy(p = rand()) {
    const d = createBossActor(ctx, { char: 'mysterio', hp: 1, armor: 0, poise: 999, mass: 80, at: p, arena: ar });
    d.decoy = true;
    d.onHit = () => { pop(d); return { dealt: 1, blocked: false }; };
    d.onWeb = () => pop(d);
    d.onYank = () => { pop(d); return true; };
    d.think = 1 + Math.random() * 2;
    decoys.push(d);
    return d;
  }
  function pop(d) {
    if (d.popped) return;
    d.popped = true;
    fx.shock(d.body.p, 2.5);
    word('POP!', d.body.p, 'small');
    smoke(d.body.p, 1.2);
    d.dispose();
    setTimeout(() => { if (disposed) return; const i = decoys.indexOf(d); if (i >= 0) decoys.splice(i, 1); if (phase === 1 && !done) addDecoy(); }, 4500);
  }
  for (let i = 0; i < 4; i++) addDecoy();

  function smoke(p, life = 3, dps = 0) {
    const m = new THREE.Mesh(dps ? GEO.bigCloud : GEO.smallCloud, cloudMat);
    m.layers.set(LAYER_FX);
    m.position.set(p.x, p.y, p.z);
    scene.add(m);
    clouds.push({ m, p: { ...p }, t: life, life, dps });
  }
  // A gas bomb: a ring where it will land, then a cloud that hurts while you stand in it.
  function gasBomb(from) {
    const h = hero.body.p;
    const at = { x: h.x, y: world.groundHeight(h.x, h.y + 0.5, h.z) + 0.1, z: h.z };
    const r = new THREE.Mesh(GEO.gasRing, ringMat);
    r.layers.set(LAYER_FX); r.rotation.x = -Math.PI / 2; r.position.set(at.x, at.y, at.z);
    scene.add(r);
    fists.push({ kind: 'gas', m: r, at, t: 0.9 });
    void from;
  }

  // The giant and the drones (phase 2).
  function buildGiant() {
    const def = characterById('mysterio');
    const g = ctx.buildCharacter(ctx.assets, def);
    g.root.scale.setScalar(8);
    g.root.position.set((P.minX + P.maxX) / 2, 0, ar.minZ - 30);
    // A projection: see-through, on the giant's own outfit material (one per model, so the comic
    // shading stays; a cloned material would lose its shader hooks).
    if (g.outfitMat) { g.outfitMat.transparent = true; g.outfitMat.opacity = 0.82; g.outfitMat.needsUpdate = true; }
    for (const h of g.hulls ?? []) h.visible = false; // a projection has no drawn outline
    scene.add(g.root);
    const poser = ctx.createPoser(g);
    return { g, poser, puppet: { body: { p: { x: g.root.position.x, y: 0.9 * 8, z: g.root.position.z }, v: { x: 0, y: 0, z: 0 } }, state: 'ground', facing: { x: 0, z: 1 }, swing: { active: false, rope: { pivots: [] } }, rope: { active: false, pivots: [] }, wall: { nx: 0, nz: 1 }, speed: 0 }, events: [] };
  }
  const droneMat = comicToon({ color: 0x6a3a8a }), lensMat = new THREE.MeshBasicMaterial({ color: 0x7ad06a });
  function addDrone(i) {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), droneMat);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.3, 10), lensMat);
    lens.rotation.x = Math.PI / 2; lens.position.z = 0.5;
    root.add(body, lens);
    scene.add(root);
    const b = createBody({ mass: 20 });
    const home = { x: P.minX + 10 + i * ((P.maxX - P.minX - 20) / 2), y: 6 + i, z: ar.minZ + 18 + (i % 2) * 12 };
    placeBody(b, home.x, home.y, home.z);
    const dr = { home, hp: 30, root };
    const e = {
      id: droneId++, faction: 'boss', arch: 'jetpack', A: ARCHETYPES.jetpack, level: 1, body: b, hp: 30, maxHp: 30, state: 'engage', t: 0, alive: true, alerted: true, web: 0, facing: 0, onGround: false, strikeAt: 9, look: 0,
      model: { root, hurt: { value: 0 }, animator: { play() {}, update() {} }, mat: { dispose() {} } },
      boss: {
        hit: (args) => { dr.hp -= Math.min(30, args.kind === 'web' ? 8 : args.dmg ?? 10); word('KRZZT!', b.p, 'small'); if (dr.hp <= 0) downDrone(dr); return { dealt: 10, blocked: false }; },
        yank: () => { word('YANKED!', b.p, 'big'); downDrone(dr); return true; },
      },
    };
    dr.e = e;
    combat.enemies.list.push(e);
    drones.push(dr);
  }
  function downDrone(dr) {
    if (dr.down) return;
    dr.down = true;
    fx.shock(dr.e.body.p, 3);
    shake(0.4);
    dr.e.alive = false;
    const i = combat.enemies.list.indexOf(dr.e); if (i >= 0) combat.enemies.list.splice(i, 1);
    scene.remove(dr.root);
    const left = drones.filter((d) => !d.down).length;
    word(left ? `${left} LEFT` : 'THE SHOW IS OVER!', dr.e.body.p, 'big');
    if (giant) giant.flicker = 0.6;
    if (!left) endGiant();
  }
  function startGiant() {
    phase = 2;
    for (const d of [...decoys]) pop(d);
    a.setAway(true);
    a.e.model.root.visible = false;
    giant = buildGiant();
    for (let i = 0; i < 3; i++) addDrone(i);
    ctx.illusion?.(1);
    say([L('mysterio', 'Ladies and gentlemen, the main event!'), L('peter', 'Oh, come on. He is HUGE.'), L('peter', 'Projectors. Those drones are throwing the picture. Take them down.')]);
    giantT = 2.5;
  }
  function endGiant() {
    phase = 3;
    scene.remove(giant.g.root);
    giant.g.outfitMat?.dispose?.();
    giant = null;
    for (const f of fists) { scene.remove(f.m); if (f.fist) scene.remove(f.fist); }
    fists.length = 0;
    ctx.illusion?.(0.2);
    // The real one, dizzy where the giant stood.
    a.e.model.root.visible = true;
    placeBody(a.body, (P.minX + P.maxX) / 2, 0.9, ar.minZ + 12);
    a.setAway(false);
    a.stun(5);
    say([L('mysterio', 'My, my audience... where did everyone go?')]);
  }
  function slam() {
    const h = hero.body.p;
    const at = { x: h.x, y: world.groundHeight(h.x, h.y + 0.5, h.z) + 0.1, z: h.z };
    const r = new THREE.Mesh(GEO.fistRing, ringMat);
    r.layers.set(LAYER_FX); r.rotation.x = -Math.PI / 2; r.position.set(at.x, at.y, at.z);
    scene.add(r);
    const fist = new THREE.Mesh(GEO.fist, FIST_MAT);
    fist.position.set(at.x, at.y + 60, at.z);
    scene.add(fist);
    fists.push({ kind: 'fist', m: r, fist, at, t: 1.5 });
    giant.events.push({ type: 'punch', n: Math.floor(Math.random() * 3) });
  }

  a.floor = () => (phase === 1 ? 0.6 : phase === 2 ? 0.6 : 0);
  a.onYank = () => false;
  ctx.onScan = () => {
    if (phase !== 1 || scanCd > 0) return;
    scanCd = 7;
    markT = 4;
    word('THE REAL ONE!', a.body.p, 'big');
  };

  function stepDecoy(d, dt) {
    if (d.popped) return;
    const t = d.toHero();
    d.faceHero(dt, 5);
    const want = t.d < 7 ? -1 : t.d > 14 ? 1 : 0;
    d.move((t.ux * want - t.uz * 0.5) * 3.2, (t.uz * want + t.ux * 0.5) * 3.2, dt);
    d.think -= dt;
    if (d.think <= 0 && !d.attacking()) { d.think = 3 + Math.random() * 2.5; d.windup({ t: 0.8, ranged: true, reach: 30, recover: 0.5, pose: 'punch', onStrike: () => gasBomb(d.body.p) }); }
    d.step(dt);
  }

  function update(dt) {
    time += dt;
    scanCd -= dt;
    // Gas clouds and fists.
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.t -= dt;
      c.m.material.opacity = 0.35 * Math.min(1, c.t / 0.8);
      const h = hero.body.p;
      if (c.dps && Math.hypot(h.x - c.p.x, h.z - c.p.z) < 3 && Math.abs(h.y - c.p.y) < 3 && !ctx.heroInvuln()) { c.hurtT = (c.hurtT ?? 0) - dt; if (c.hurtT <= 0) { c.hurtT = 0.5; a.hurtHero(c.dps * 0.5, { x: 0, z: 0 }, true); } }
      if (c.t <= 0) { scene.remove(c.m); clouds.splice(i, 1); }
    }
    for (let i = fists.length - 1; i >= 0; i--) {
      const f = fists[i];
      f.t -= dt;
      f.m.material.opacity = 0.4 + 0.4 * Math.abs(Math.sin(time * 10));
      if (f.fist) f.fist.position.y = f.at.y + 2.6 + Math.max(0, f.t - 0.2) * 45;
      if (f.t <= 0) {
        const h = hero.body.p;
        if (f.kind === 'gas') smoke({ x: f.at.x, y: f.at.y + 1, z: f.at.z }, 4, 8);
        else {
          fx.shock(f.at, 6); shake(0.8);
          if (Math.hypot(h.x - f.at.x, h.z - f.at.z) < 4.6 && h.y - f.at.y < 4 && !ctx.heroInvuln()) { applyDv(hero.body, 'surface', 0, 7, 0); a.hurtHero(16, { x: h.x - f.at.x, z: h.z - f.at.z }, true); }
          word('KA-THOOM!', f.at, 'hit');
          scene.remove(f.fist);
        }
        scene.remove(f.m); fists.splice(i, 1);
      }
    }
    for (const d of decoys) stepDecoy(d, dt);
    // Drones bob around their spots.
    for (const dr of drones) {
      if (dr.down) continue;
      const b = dr.e.body, w = { x: dr.home.x + Math.sin(time * 0.8 + dr.home.y) * 4, y: dr.home.y + Math.sin(time * 1.7) * 0.6, z: dr.home.z + Math.cos(time * 0.6) * 3 };
      applyDv(b, 'assist', ((w.x - b.p.x) * 2 - b.v.x) * Math.min(1, dt * 4), ((w.y - b.p.y) * 2 - b.v.y) * Math.min(1, dt * 4), ((w.z - b.p.z) * 2 - b.v.z) * Math.min(1, dt * 4));
      b.p.x += b.v.x * dt; b.p.y += b.v.y * dt; b.p.z += b.v.z * dt;
      dr.root.position.set(b.p.x, b.p.y, b.p.z);
      dr.root.lookAt(giant ? giant.g.root.position.x : b.p.x, b.p.y + 10, giant ? giant.g.root.position.z : b.p.z);
    }
    markT -= dt;
    markRing.visible = markT > 0 && phase === 1;
    if (markRing.visible) markRing.position.set(a.body.p.x, a.body.p.y - 0.85, a.body.p.z);
    if (giant) {
      giantT -= dt;
      giant.flicker = Math.max(0, (giant.flicker ?? 0) - dt);
      giant.g.root.visible = !(giant.flicker > 0 && Math.sin(time * 60) > 0);
      giant.puppet.facing.x = 0; giant.puppet.facing.z = 1;
      giant.poser.update(giant.puppet, dt, giant.events, giant.puppet.body.p);
      giant.g.root.scale.setScalar(8);
      giant.events.length = 0;
      if (giantT <= 0) { giantT = 2.6 + Math.random(); slam(); }
    }
    if (done) { a.step(dt); return; }
    const e = a.e, f = a.hpFrac();
    if (phase === 3 && f <= 0 && e.state !== 'out') { a.defeat(); done = true; ctx.illusion?.(0); word('CURTAIN!', a.body.p, 'big'); a.step(dt); return; }
    // The rematch: no giant this time; his own smoke is all he has left.
    if (phase === 1 && f <= 0.6 && !a.attacking()) { if (rematch) { phase = 3; for (const d of [...decoys]) pop(d); ctx.illusion?.(0.2); } else startGiant(); }
    if (phase === 2) { a.step(dt); return; }
    if (a.stunned() || a.attacking()) { a.step(dt); return; }
    // The real one: keeps his distance, throws gas, swaps with a decoy now and then.
    const t = a.toHero();
    a.faceHero(dt, 5);
    const want = t.d < 6 ? -1 : t.d > 13 ? 1 : 0;
    a.move((t.ux * want + t.uz * 0.4) * 3.6, (t.uz * want - t.ux * 0.4) * 3.6, dt);
    swapT -= dt;
    if (phase === 1 && swapT <= 0 && decoys.length) {
      swapT = 8 + Math.random() * 3;
      const d = decoys[Math.floor(Math.random() * decoys.length)];
      if (!d.popped) {
        const pa = { ...a.body.p }, pd = { ...d.body.p };
        smoke(pa); smoke(pd);
        placeBody(a.body, pd.x, pd.y, pd.z); placeBody(d.body, pa.x, pa.y, pa.z);
        markT = 0;
      }
    }
    think -= dt;
    if (think <= 0) {
      think = 1.6 + Math.random();
      if (t.d < 3.5) a.windup({ t: 0.5, reach: 3, arc: 1.2, dmg: 9, pose: 'punch' });
      else a.windup({ t: 0.75, ranged: true, reach: 30, recover: 0.55, pose: 'punch', onStrike: () => gasBomb(a.body.p) });
    }
    a.step(dt);
  }

  return {
    actor: a,
    get done() { return done; },
    get phase() { return phase; },
    get state() {
      return { phase, hp: a.hpFrac(), state: a.e.state, marked: markT > 0, real: { ...a.body.p }, decoys: decoys.filter((d) => !d.popped).map((d) => ({ ...d.body.p })), drones: drones.filter((d) => !d.down).map((d) => ({ ...d.e.body.p })) };
    },
    update,
    setPhase(n) { if (n >= 2 && phase < 2) { a.e.hp = a.e.maxHp * 0.6; startGiant(); } if (n >= 3 && phase < 3) { for (const d of drones) downDrone(d); } },
    dispose() {
      disposed = true;
      a.dispose();
      for (const d of decoys) if (!d.popped) d.dispose();
      for (const dr of drones) if (!dr.down) { scene.remove(dr.root); const i = combat.enemies.list.indexOf(dr.e); if (i >= 0) combat.enemies.list.splice(i, 1); }
      for (const c of clouds) scene.remove(c.m);
      for (const f of fists) { scene.remove(f.m); if (f.fist) scene.remove(f.fist); }
      if (giant) { scene.remove(giant.g.root); giant.g.outfitMat?.dispose?.(); }
      scene.remove(markRing);
      ctx.illusion?.(0);
      ctx.onScan = null;
    },
  };
}
