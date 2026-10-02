import * as THREE from 'three';
import { applyDv } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';
import { comicToon } from '../../render/comicShade.js';
import { LAYER_FX } from '../../render/layers.js';

// Sandman at the Harbor shipyard (spec 10, Act 3). Blows go through sand ("PFFT"), so water is
// the weapon: break a fire hydrant (punch it or yank it) and the spray turns him to mud where it
// lands, slow and open. Phase 2 (60%): he rises into a sand giant four times his size, slamming
// the street and rolling sand waves out; two water tanks on stilts stand at the edge of the yard:
// yank one over onto him and the flood brings him down to size, soaked. Phase 3: finish him with
// the hydrants.

const L = (who, text) => ({ who, text });

export function createSandman(ctx) {
  const { site, hero, fx, say, word, shake, world, scene } = ctx;
  const ar = { minX: site.x - 36, maxX: site.x + 36, minZ: site.z - 30, maxZ: site.z + 30, y: 0 };
  const a = createBossActor(ctx, { char: 'sandman', hp: 460, armor: 0.88, poise: 999, mass: 110, at: { x: site.x + 8, y: 0.9, z: site.z }, arena: ar });
  let phase = 1, done = false, think = 1.4, soakT = 0, giant = 1, giantT = 0, time = 0;
  const hydrants = [], tanks = [], sprays = [], slams = [];
  const mats = { red: comicToon({ color: 0xc8302a }), steel: comicToon({ color: 0x6a7480 }), wood: comicToon({ color: 0x7a5a3a }), water: new THREE.MeshBasicMaterial({ color: 0x8ac8f0, transparent: true, opacity: 0.55, depthWrite: false }), ring: new THREE.MeshBasicMaterial({ color: 0xe8c878, transparent: true, opacity: 0.7, depthWrite: false }) };

  function hydrant(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 10), mats.red); body.position.y = 0.45;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.red); cap.position.y = 0.9;
    g.add(body, cap); g.position.set(x, 0, z); scene.add(g);
    hydrants.push({ g, x, y: 0.6, z, live: true });
  }
  function tank(x, z) {
    const g = new THREE.Group();
    for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 9, 0.25), mats.steel); l.position.set(ox, 4.5, oz); g.add(l); }
    const t = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 4, 16), mats.wood); t.position.y = 11;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.4, 16), mats.steel); roof.position.y = 13.7;
    g.add(t, roof); g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    tanks.push({ g, x, y: 11, z, live: true, fall: 0 });
  }
  for (const [dx, dz] of [[-26, -20], [26, -20], [-26, 20], [26, 20], [0, -26], [0, 26]]) hydrant(site.x + dx, site.z + dz);
  for (const [dx, dz] of [[-33, 0], [33, 0]]) tank(site.x + dx, site.z + dz);

  function burst(hy) {
    hy.live = false;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 2.2, 7, 12, 1, true), mats.water);
    m.layers.set(LAYER_FX); m.position.set(hy.x, 3.5, hy.z); scene.add(m);
    sprays.push({ m, x: hy.x, z: hy.z, t: 14, r: 4.5 });
    word('SPLOOSH!', { x: hy.x, y: 2, z: hy.z }, 'big');
  }
  function soak(t) { soakT = Math.max(soakT, t); word('MUD!', a.body.p, 'big'); }

  // Yank targets: a hydrant (any phase) or a water tank (phase 2).
  function yankAt(cam, heroP) {
    const all = [...hydrants.filter((q) => q.live).map((q) => ({ q, kind: 'hydrant' })), ...(phase === 2 ? tanks.filter((q) => q.live).map((q) => ({ q, kind: 'tank' })) : [])];
    let best = null, bestA = 0.14;
    for (const { q, kind } of all) {
      const dx = q.x - cam.x, dy = q.y - cam.y, dz = q.z - cam.z, d = Math.hypot(dx, dy, dz);
      if (Math.hypot(q.x - heroP.x, q.z - heroP.z) > 30) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * cam.fx + dy * cam.fy + dz * cam.fz) / d)));
      if (ang < bestA) { bestA = ang; best = { q, kind }; }
    }
    if (!best) return null;
    const h = hero.body.p;
    fx.tether({ x: h.x, y: h.y + 0.5, z: h.z }, { x: best.q.x, y: best.q.y, z: best.q.z });
    setTimeout(() => fx.tether(null), 200);
    if (best.kind === 'hydrant') burst(best.q);
    else { best.q.live = false; best.q.fall = 0.001; word('TIMBER!', { x: best.q.x, y: 12, z: best.q.z }, 'big'); }
    return best.q;
  }
  // A punch on a hydrant breaks it too.
  function punchHydrants() {
    const h = hero.body.p;
    for (const hy of hydrants) if (hy.live && Math.hypot(hy.x - h.x, hy.z - h.z) < 1.6) burst(hy);
  }

  a.onHit = (args) => {
    if (soakT <= 0 || giant > 1.01) { word('PFFT!', a.body.p, 'small'); return { dealt: a.damage((args.dmg ?? 10) * 0.08), blocked: false }; }
    return { dealt: a.damage(Math.min(args.dmg ?? 10, 40) * (a.stunned() ? 1.1 : 0.85)), blocked: false };
  };
  a.onWeb = () => {};
  a.onYank = () => false;
  a.floor = () => (phase === 1 ? 0.6 : phase === 2 ? 0.3 : 0);

  function sandWave() {
    const p = a.body.p;
    fx.shock({ x: p.x, y: 0.1, z: p.z }, 9 * giant * 0.5);
    shake(0.5);
    const t = a.toHero();
    if (t.d < 4 * giant && Math.abs(t.dy) < 2.5) { applyDv(hero.body, 'surface', t.ux * 10, 6, t.uz * 10); a.hurtHero(12, { x: t.ux, z: t.uz }, true); }
  }
  function giantSlam() {
    const h = hero.body.p;
    const at = { x: h.x, y: 0.1, z: h.z };
    const r = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.4, 28), mats.ring);
    r.layers.set(LAYER_FX); r.rotation.x = -Math.PI / 2; r.position.set(at.x, at.y, at.z); scene.add(r);
    slams.push({ r, at, t: 1.4 });
    a.pose('punch');
  }
  function setGiant(k) {
    giant = k;
    a.model.root.scale.setScalar(k);
  }

  function update(dt) {
    time += dt;
    soakT -= dt;
    // Sprays: anyone in the water gets wet (him, mainly).
    for (let i = sprays.length - 1; i >= 0; i--) {
      const s = sprays[i];
      s.t -= dt;
      if (!s.flood) s.m.scale.set(1, 0.9 + Math.sin(time * 14) * 0.1, 1);
      const inWater = Math.hypot(a.body.p.x - s.x, a.body.p.z - s.z) < s.r + (giant > 1.01 ? 3 : 0);
      if (inWater && giant < 1.01) soak(3.5);
      // A giant walking into the flood from a tank comes apart.
      if (inWater && giant > 1.01 && s.flood) { setGiant(1); soak(5); a.stun(5); word('KER-SPLASH!', a.body.p, 'big'); }
      if (s.t <= 0) { scene.remove(s.m); sprays.splice(i, 1); }
    }
    for (let i = slams.length - 1; i >= 0; i--) {
      const s = slams[i];
      s.t -= dt;
      s.r.material.opacity = 0.4 + 0.4 * Math.abs(Math.sin(time * 10));
      if (s.t <= 0) {
        fx.shock(s.at, 6); shake(0.8);
        const h = hero.body.p;
        if (Math.hypot(h.x - s.at.x, h.z - s.at.z) < 4.4 && h.y < 4 && !ctx.heroInvuln()) a.hurtHero(15, { x: h.x - s.at.x, z: h.z - s.at.z }, true);
        word('KRUNCH!', s.at, 'hit');
        scene.remove(s.r); slams.splice(i, 1);
      }
    }
    // Tanks tip over toward him.
    for (const tk of tanks) {
      if (!tk.fall) continue;
      tk.fall = Math.min(1.5, tk.fall + dt * 1.6);
      const ang = Math.atan2(a.body.p.z - tk.z, a.body.p.x - tk.x);
      tk.g.rotation.set(0, -ang, 0);
      tk.g.rotateZ(-tk.fall);
      if (tk.fall >= 1.5 && !tk.landed) {
        tk.landed = true;
        fx.shock({ x: (tk.x + a.body.p.x) / 2, y: 0.1, z: (tk.z + a.body.p.z) / 2 }, 10); shake(1);
        word('KER-SPLASH!', a.body.p, 'big');
        // The water spreads where it lands (a flood pool for a while), and a giant in reach is hit at once.
        const lx = tk.x + Math.cos(ang) * 14, lz = tk.z + Math.sin(ang) * 14;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.3, 24), mats.water);
        m.layers.set(LAYER_FX); m.position.set(lx, 0.15, lz); scene.add(m);
        sprays.push({ m, x: lx, z: lz, t: 12, r: 12, flood: true });
        if (Math.hypot(a.body.p.x - tk.x, a.body.p.z - tk.z) < 30) { setGiant(1); soak(5); a.stun(5); giantT = 0; say([L('sandman', 'Water... why is it always water...')]); }
      }
    }
    if (done) { a.step(dt); return; }
    const e = a.e, t = a.toHero(), f = a.hpFrac();
    a.e.model.hurt.value = Math.max(a.e.model.hurt.value, soakT > 0 ? 0.35 : 0);
    if (f <= 0 && e.state !== 'out') { a.defeat(); done = true; word('WASHED UP!', a.body.p, 'big'); a.step(dt); return; }
    if (phase === 1 && f <= 0.6 && !a.attacking()) { phase = 2; setGiant(4); a.dmgScale = 1.2; say([L('sandman', 'You want to see big? I will show you big.'), L('peter', 'Those water tanks on the edge of the yard. If I can tip one...')]); }
    if (phase === 2 && f <= 0.3 && giant < 1.01) { phase = 3; a.dmgScale = 1; }
    // Back up to giant size while there is still a tank to bring him down; with none left, he stays small.
    if (phase === 2 && giant < 1.01 && !a.stunned() && f > 0.3) { if (tanks.some((q) => q.live)) setGiant(4); else phase = 3; }
    if (a.stunned() || a.attacking()) { a.step(dt); return; }
    a.faceHero(dt, giant > 1 ? 2 : 6);
    const sp = (soakT > 0 ? 2.5 : 4.5) * (giant > 1 ? 0.7 : 1);
    if (t.d > 3 * giant) a.move(t.ux * sp, t.uz * sp, dt); else a.move(0, 0, dt);
    think -= dt;
    if (giant > 1) {
      giantT -= dt;
      if (giantT <= 0) { giantT = 2.4 + Math.random(); if (Math.random() < 0.6) giantSlam(); else a.windup({ t: 0.9, ranged: true, unblockable: true, reach: 20, recover: 0.6, pose: 'slamStart', onStrike: sandWave }); }
    } else if (think <= 0) {
      think = soakT > 0 ? 2 : 1.3 + Math.random() * 0.7;
      if (t.d < 4) a.windup({ t: 0.6, reach: 3.4, arc: 1.4, dmg: 12, push: 10, pose: 'punch' });
      else a.windup({ t: 0.85, ranged: true, unblockable: true, reach: 9, recover: 0.6, pose: 'slamStart', onStrike: sandWave });
    }
    a.step(dt);
  }

  return {
    actor: a,
    get done() { return done; },
    get phase() { return phase; },
    get state() { return { phase, hp: a.hpFrac(), soaked: soakT > 0, giant: giant > 1.01, state: a.e.state, hydrants: hydrants.filter((q) => q.live).map((q) => ({ x: q.x, y: q.y, z: q.z })), tanks: tanks.filter((q) => q.live).map((q) => ({ x: q.x, y: q.y, z: q.z })) }; },
    update,
    yankAt,
    onEvent(ev) { if (ev.type === 'punch' || ev.type === 'heroHit' || ev.type === 'whiff') punchHydrants(); },
    setPhase(n) { if (n >= 2 && phase < 2) { a.e.hp = a.e.maxHp * 0.6; } },
    dispose() {
      a.dispose();
      for (const q of [...hydrants, ...tanks]) scene.remove(q.g);
      for (const s of sprays) scene.remove(s.m);
      for (const s of slams) scene.remove(s.r);
      fx.tether(null);
    },
  };
}
