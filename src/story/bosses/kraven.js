import * as THREE from 'three';
import { applyDv, placeBody } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';
import { LAYER_FX } from '../../render/layers.js';

// Kraven's hunt in Central Park (spec 10, Act 3), after his hunters (a stealth step).
// The stalk: he moves through the treetops and throws spears from cover; the glint before a throw
// gives him away, the spider-sense scan (V) marks him, and a web yank while he is marked drags him
// out of the tree (a real pull on a 90 kg man) and he lands hard. Three falls and he comes down to
// fight. The duel on the great lawn: spear jabs, a wide sweep, bolas that snare your legs, a leaping
// strike from range. He respects a good fight: openings after his combos.

const L = (who, text) => ({ who, text });

export function createKraven(ctx) {
  const { site, hero, fx, say, word, shake, world, scene, city, combat } = ctx;
  // Treetops around the lawn: the tree crowns in the park near the site.
  const crowns = city.boxes.filter((b) => b.kind === 'tree' && b.style === 12 && Math.hypot((b.min[0] + b.max[0]) / 2 - site.x, (b.min[2] + b.max[2]) / 2 - site.z) < 75)
    .map((b) => ({ x: (b.min[0] + b.max[0]) / 2, y: b.max[1] + 0.9, z: (b.min[2] + b.max[2]) / 2 }));
  const lawn = { minX: site.x - 40, maxX: site.x + 40, minZ: site.z - 30, maxZ: site.z + 30, y: 0 };
  const perch0 = crowns[0] ?? { x: site.x, y: 12, z: site.z };
  const a = createBossActor(ctx, { char: 'kraven', hp: 480, armor: 0.6, poise: 999, mass: 90, at: perch0, facing: 0 });
  a.flying = true; a.poseState = 'perch';
  let phase = 1, done = false, think = 2.5, perch = perch0, falls = 0, markT = 0, glint = null, time = 0, leap = null, snareT = 0;
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
  const glintMesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), glintMat);
  glintMesh.layers.set(LAYER_FX); glintMesh.visible = false;
  scene.add(glintMesh);

  function nextPerch() {
    const h = hero.body.p;
    const opts = crowns.filter((c) => c !== perch && Math.hypot(c.x - h.x, c.z - h.z) > 18 && Math.hypot(c.x - h.x, c.z - h.z) < 50);
    perch = opts.length ? opts[Math.floor(Math.random() * opts.length)] : perch;
    // Through the branches: a long bound, his own legs.
    const p = a.body.p, T = 1.1;
    a.flying = false;
    applyDv(a.body, 'surface', (perch.x - p.x) / T - a.body.v.x, (perch.y - p.y + 0.5 * 22 * T * T) / T - a.body.v.y, (perch.z - p.z) / T - a.body.v.z);
    a.bounding = true;
    a.poseState = 'air';
  }
  function spear() {
    const p = a.body.p, h = hero.body.p, v = hero.body.v;
    combat.projectiles.fire('rocket', { x: p.x, y: p.y + 0.5, z: p.z }, { x: h.x + v.x * 0.5, y: h.y + 0.2, z: h.z + v.z * 0.5 }, { dmg: 12 });
    word('FWISH!', p, 'small');
  }

  ctx.onScan = () => { if (phase === 1) { markT = 5; word('THERE!', a.body.p, 'big'); } };
  a.onYank = () => {
    if (phase !== 1 || markT <= 0) return false;
    const h = hero.body.p, p = a.body.p;
    fx.tether({ x: h.x, y: h.y + 0.5, z: h.z }, { x: p.x, y: p.y, z: p.z });
    setTimeout(() => fx.tether(null), 250);
    a.flying = false; a.bounding = false; a.poseState = 'air';
    const dx = h.x - p.x, dz = h.z - p.z, l = Math.hypot(dx, dz) || 1;
    applyDv(a.body, 'rope', (dx / l) * 9 - a.body.v.x, 2 - a.body.v.y, (dz / l) * 9 - a.body.v.z);
    a.yanked = true;
    word('OUT OF THE TREE!', p, 'big');
    return true;
  };
  // In the trees he is out of reach; on the ground after a fall, he is open.
  const baseHit = a.hit;
  a.hit = (args) => (phase === 1 && !a.stunned() ? { dealt: 0, blocked: true } : baseHit(args));
  a.floor = () => (phase === 1 ? Math.max(0.55, 1 - falls * 0.15) : 0);

  function bolas() {
    const t = a.toHero();
    if (t.d < 26 && !ctx.heroInvuln()) {
      snareT = 1.4;
      a.hurtHero(6, { x: 0, z: 0 }, false);
      word('SNARED!', hero.body.p, 'big');
    } else combat.emit({ type: 'enemyMiss', e: a.e });
  }

  function updateStalk(dt) {
    markT -= dt;
    a.e.state = a.stunned() ? 'stun' : markT > 0 || a.yanked ? 'engage' : 'away';
    if (a.yanked) {
      if (a.grounded) {
        a.yanked = false; falls++;
        fx.shock({ x: a.body.p.x, y: 0.1, z: a.body.p.z }, 4); shake(0.6);
        a.stun(3.6);
        say([L('kraven', falls >= 3 ? 'Enough games. Face me on the grass, spider.' : 'Good. Again.')]);
      }
      a.step(dt);
      return;
    }
    if (a.stunned()) { a.step(dt); return; }
    if (falls >= 3) { phase = 2; a.flying = false; a.arena = lawn; a.e.state = 'engage'; think = 1.5; a.step(dt); return; }
    if (a.bounding) {
      if (Math.hypot(a.body.p.x - perch.x, a.body.p.z - perch.z) < 1.5 && a.body.p.y >= perch.y - 0.5) { a.bounding = false; a.flying = true; a.poseState = 'perch'; applyDv(a.body, 'surface', -a.body.v.x, -a.body.v.y, -a.body.v.z); }
      else if (a.grounded) { a.bounding = false; nextPerch(); }
      a.step(dt);
      return;
    }
    // Perched: hold, watch, throw.
    a.flying = true;
    const p = a.body.p;
    applyDv(a.body, 'assist', ((perch.x - p.x) * 3 - a.body.v.x) * Math.min(1, dt * 6), ((perch.y - p.y) * 3 - a.body.v.y) * Math.min(1, dt * 6), ((perch.z - p.z) * 3 - a.body.v.z) * Math.min(1, dt * 6));
    a.faceHero(dt, 3);
    think -= dt;
    if (glint) {
      glint.t -= dt;
      glintMesh.visible = true;
      glintMesh.position.set(p.x, p.y + 1, p.z);
      glintMesh.scale.setScalar(0.6 + Math.abs(Math.sin(time * 18)) * 0.8);
      if (glint.t <= 0) { glint = null; glintMesh.visible = false; spear(); think = 2.2; if (Math.random() < 0.45) nextPerch(); }
    } else if (think <= 0) {
      glint = { t: 1.1 };
      combat.emit({ type: 'enemyWindup', e: a.e, at: 1.1, ranged: true, unblockable: false });
    }
    a.step(dt);
  }

  function updateDuel(dt) {
    const e = a.e, t = a.toHero(), f = a.hpFrac();
    if (f <= 0 && e.state !== 'out') { a.defeat(); done = true; word('THE HUNTER FALLS!', a.body.p, 'big'); a.step(dt); return; }
    if (leap) {
      leap.t += dt;
      if (a.grounded && leap.t > 0.3) {
        fx.shock({ x: a.body.p.x, y: 0.1, z: a.body.p.z }, 3.5);
        if (t.d < 2.8) a.hurtHero(14, { x: t.ux, z: t.uz }, true);
        leap = null;
        a.state('recover'); // his landing is an opening
      }
      a.step(dt);
      return;
    }
    if (a.stunned() || a.attacking()) { a.step(dt); return; }
    a.faceHero(dt, 7);
    a.move(t.ux * (t.d > 3 ? 5.5 : 0), t.uz * (t.d > 3 ? 5.5 : 0), dt);
    think -= dt;
    if (think <= 0) {
      think = 1.1 + Math.random() * 0.7;
      if (t.d > 10 && Math.random() < 0.5) a.windup({ t: 0.7, ranged: true, reach: 30, recover: 0.6, pose: 'punch', onStrike: bolas });
      else if (t.d > 7) a.windup({ t: 0.65, ranged: true, unblockable: true, reach: 30, recover: 0.05, pose: 'none', onStrike: () => { const p = a.body.p, h = hero.body.p, T = 0.75; applyDv(a.body, 'surface', (h.x - p.x) / T - a.body.v.x, 8.5 - a.body.v.y, (h.z - p.z) / T - a.body.v.z); leap = { t: 0 }; } });
      else if (Math.random() < 0.55) a.windup({ t: 0.5, reach: 3.6, arc: 0.7, dmg: 11, pose: 'punch', recover: 0.6 });
      else a.windup({ t: 0.6, reach: 3.8, arc: 2.6, dmg: 10, push: 11, pose: 'uppercut', unblockable: true, recover: 0.9 });
    }
    a.step(dt);
  }

  return {
    actor: a,
    get done() { return done; },
    get phase() { return phase; },
    get state() { return { phase, hp: a.hpFrac(), falls, marked: markT > 0, perched: a.flying && !a.bounding, state: a.e.state }; },
    update(dt) {
      time += dt;
      // A snare holds the hero's legs: his ground speed is bled off for a moment.
      if (snareT > 0) { snareT -= dt; const v = hero.body.v; if (hero.state === 'ground') applyDv(hero.body, 'surface', -v.x * Math.min(1, dt * 12), 0, -v.z * Math.min(1, dt * 12)); }
      if (phase === 1) updateStalk(dt); else updateDuel(dt);
    },
    setPhase(n) { if (n >= 2 && phase < 2) { falls = 3; a.e.hp = a.e.maxHp * 0.55; placeBody(a.body, site.x, 0.9, site.z - 8); a.yanked = false; a.bounding = false; } },
    dispose() { a.dispose(); scene.remove(glintMesh); ctx.onScan = null; fx.tether(null); },
  };
}
