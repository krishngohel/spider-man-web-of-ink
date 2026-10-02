import * as THREE from 'three';
import { applyDv } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';
import { comicToon } from '../../render/comicShade.js';

// Venom (spec 10, Act 3). The chase: he bounds roof to roof across Harlem on his own legs (real
// leaps), waiting when you fall behind. Three hits and he makes for the bell tower.
// The bell tower fight on the church roof: the symbiote hates sound. Yank the bell rope and the
// toll staggers him (an opening); the bell needs a moment between tolls. His tendrils are ropes:
// a tendril pull drags you in (a real rope impulse) for a claw. Claw combos, a spike burst up close,
// a leaping slam from range. Phase 2 (50%): faster, double pulls.

const L = (who, text) => ({ who, text });

export function createVenom(ctx) {
  const { site, step, hero, fx, say, word, shake, world, scene, city } = ctx;
  const chase = step.type === 'chase';
  const church = (city.landmarkBoxes.church ?? []);
  const tower = church.find((b) => b.max[1] > 50 && b.kind === 'building') ?? null;
  const ar = site.arena;
  // The chase route: roof tops in a ring round the church.
  const route = [];
  if (chase) {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2, x = site.x + Math.cos(ang) * 150, z = site.z + Math.sin(ang) * 150;
      const top = world.groundHeight(x, 300, z);
      route.push({ x, y: top + 0.9, z });
    }
  }
  const start = chase ? route[0] : { x: site.x, y: site.y, z: site.z + 4 };
  const a = createBossActor(ctx, { char: 'venom', hp: 520, armor: 0.85, poise: 999, mass: 140, radius: 0.6, half: 0.55, at: start, arena: chase ? null : ar });
  let done = false, failed = false, hits = 0, hitCd = 0, wp = 1, farT = 0, waitT = 0, inLeap = false;
  let phase = 1, think = 1.5, bellCd = 0, pull = null, leap = null;

  // The bell rope at the foot of the tower.
  let bell = null;
  if (!chase && tower) {
    const g = new THREE.Group();
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 6), comicToon({ color: 0xc8b890 })); rope.position.y = 3;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 6, 14), comicToon({ color: 0xc8302a })); handle.position.y = 0.4;
    g.add(rope, handle);
    const bx = (tower.min[0] + tower.max[0]) / 2, bz = tower.max[2] + 1.2;
    g.position.set(bx, ar.y, bz);
    scene.add(g);
    bell = { g, x: bx, y: ar.y + 1.5, z: bz };
  }

  function countHit(w) {
    if (hitCd > 0 || done) return;
    hitCd = 2; hits++;
    word(hits >= 3 ? 'NOT SO FAST!' : w, a.body.p, 'big');
    if (hits >= 3) { done = true; say([L('venom', 'The bell tower, Peter. Come and let us finish this where it started.')]); }
  }
  if (chase) {
    a.onWeb = () => countHit('GOT HIM!');
    a.onHit = () => { countHit('WHAM!'); return { dealt: 0, blocked: false }; };
    a.onYank = () => { countHit('GOTCHA!'); return true; };
  } else {
    a.onYank = () => false;
    a.floor = () => (phase === 1 ? 0.5 : 0);
  }

  function toll() {
    if (bellCd > 0 || !bell) return null;
    bellCd = 9;
    fx.shock({ x: bell.x, y: ar.y + 0.2, z: bell.z }, 26);
    shake(0.9);
    word('BONNNG!', { x: bell.x, y: ar.y + 8, z: bell.z }, 'big');
    ctx.sfx?.({ type: 'stamp' });
    if (Math.hypot(a.body.p.x - bell.x, a.body.p.z - bell.z) < 34) { pull = null; leap = null; a.stun(4.2); word('GRAAAH!', a.body.p, 'hit'); }
    return bell;
  }
  function yankAt(cam, heroP) {
    if (!bell || bellCd > 0) return null;
    const dx = bell.x - cam.x, dy = bell.y - cam.y, dz = bell.z - cam.z, d = Math.hypot(dx, dy, dz);
    if (Math.hypot(bell.x - heroP.x, bell.z - heroP.z) > 26) return null;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * cam.fx + dy * cam.fy + dz * cam.fz) / d)));
    if (ang > 0.16) return null;
    const h = hero.body.p;
    fx.tether({ x: h.x, y: h.y + 0.5, z: h.z }, { x: bell.x, y: bell.y, z: bell.z });
    setTimeout(() => fx.tether(null), 200);
    return toll();
  }

  function startPull() {
    const h = hero.body.p, p = a.body.p;
    pull = { t: 0 };
    fx.tether({ x: p.x, y: p.y + 0.5, z: p.z }, { x: h.x, y: h.y + 0.5, z: h.z });
    word('GET OVER HERE!', p, 'small');
  }
  function spikes() {
    const p = a.body.p, t = a.toHero();
    fx.shock({ x: p.x, y: p.y - 0.8, z: p.z }, 5.5);
    shake(0.5);
    if (t.d < 5 && Math.abs(t.dy) < 2.4) { applyDv(hero.body, 'surface', t.ux * 9, 5, t.uz * 9); a.hurtHero(12, { x: t.ux, z: t.uz }, true); }
  }

  function updateChase(dt) {
    hitCd -= dt;
    const p = a.body.p, h = hero.body.p;
    const dh = Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z);
    farT = dh > 220 ? farT + dt : 0;
    if (farT > 10) { failed = true; say([L('peter', 'He is gone. He will go back to the church, he wants me to follow.')]); return; }
    if (inLeap) { if (a.grounded) { inLeap = false; waitT = 0.5; fx.shock({ x: p.x, y: p.y - 0.8, z: p.z }, 2.5); } return; }
    waitT -= dt;
    a.faceHero(dt, 4);
    // Waits for you when you fall behind; bounds on when you are close.
    if (waitT > 0 || dh > 90) return;
    const w = route[wp];
    wp = (wp + 1) % route.length;
    const T = Math.max(1, Math.min(2.2, Math.hypot(w.x - p.x, w.z - p.z) / 30));
    applyDv(a.body, 'surface', (w.x - p.x) / T - a.body.v.x, (w.y - p.y + 0.5 * 22 * T * T) / T - a.body.v.y, (w.z - p.z) / T - a.body.v.z);
    a.pose('launch');
    inLeap = true;
  }

  function updateFight(dt) {
    const e = a.e, t = a.toHero(), f = a.hpFrac();
    bellCd -= dt;
    if (phase === 1 && f <= 0.5 && !a.attacking() && !pull && !leap) { phase = 2; say([L('venom', 'We are stronger than you, Peter. We were always stronger.')]); }
    if (f <= 0 && e.state !== 'out') { a.defeat(); done = true; word('SILENCE!', a.body.p, 'big'); fx.tether(null); a.step(dt); return; }
    if (pull) {
      // The tendril reels you in: a rope pulling along the line to him for a moment.
      pull.t += dt;
      const h = hero.body.p, p = a.body.p, d = Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z) || 1;
      fx.tether({ x: p.x, y: p.y + 0.5, z: p.z }, { x: h.x, y: h.y + 0.5, z: h.z });
      if (!ctx.heroInvuln()) applyDv(hero.body, 'rope', ((p.x - h.x) / d) * 40 * dt, ((p.y - h.y) / d) * 40 * dt + 2 * dt, ((p.z - h.z) / d) * 40 * dt);
      if (pull.t > 0.55 || d < 2.4) {
        pull = null; fx.tether(null);
        a.windup({ t: 0.38, reach: 3.2, arc: 1.4, dmg: 13, push: 9, pose: 'punch', recover: 0.6 });
      }
      a.step(dt);
      return;
    }
    if (leap) {
      leap.t += dt;
      if (a.grounded && leap.t > 0.3) { fx.shock({ x: a.body.p.x, y: a.body.p.y - 0.8, z: a.body.p.z }, 4); if (t.d < 3) a.hurtHero(15, { x: t.ux, z: t.uz }, true); leap = null; a.state('recover'); }
      a.step(dt);
      return;
    }
    if (a.stunned() || a.attacking()) { a.step(dt); return; }
    a.faceHero(dt, 7);
    a.move(t.ux * (t.d > 3 ? 6.5 : 0), t.uz * (t.d > 3 ? 6.5 : 0), dt);
    think -= dt;
    if (think <= 0) {
      think = (phase === 2 ? 0.9 : 1.3) + Math.random() * 0.6;
      if (t.d > 6 && t.d < 26 && Math.random() < (phase === 2 ? 0.6 : 0.4)) a.windup({ t: 0.6, ranged: true, reach: 26, recover: 0.05, pose: 'none', onStrike: startPull });
      else if (t.d > 9) a.windup({ t: 0.7, ranged: true, unblockable: true, reach: 30, recover: 0.05, pose: 'none', onStrike: () => { const p = a.body.p, h = hero.body.p, T = 0.8; applyDv(a.body, 'surface', (h.x - p.x) / T - a.body.v.x, 9 - a.body.v.y, (h.z - p.z) / T - a.body.v.z); leap = { t: 0 }; } });
      else if (t.d < 4.5 && Math.random() < 0.3) a.windup({ t: 0.7, ranged: true, unblockable: true, reach: 6, recover: 0.7, pose: 'slamStart', onStrike: spikes });
      else a.windup({ t: 0.5, reach: 3.2, arc: 1.3, dmg: 12, pose: 'punch', recover: 0.55 });
    }
    a.step(dt);
  }

  return {
    actor: a,
    get done() { return done; },
    get failed() { return failed; },
    get phase() { return phase; },
    get state() { return { chase, phase, hits, hp: a.hpFrac(), state: a.e.state, bellReady: bellCd <= 0, bell: bell ? { x: bell.x, y: bell.y, z: bell.z } : null, pulling: !!pull }; },
    update(dt) { if (chase) { if (!done && !failed) updateChase(dt); a.step(dt); } else updateFight(dt); },
    yankAt,
    setPhase(n) { if (n >= 2 && phase < 2) { phase = 2; a.e.hp = a.e.maxHp * 0.5; } },
    dispose() { a.dispose(); if (bell) scene.remove(bell.g); fx.tether(null); },
  };
}
