import { applyDv } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';

// The Vulture (spec 10, Act 1), in two steps.
// Chase: he flies a loop over Midtown's avenues on his stolen harness (thrust against drag, no
// gravity cheat: the harness holds him up). He keeps a rubber band on the hero so a good swinger
// can close in; three web hits (or blows) and he goes down toward the Bugle. Too far for too long
// and he gets away (the chase restarts).
// Fight on the Daily Bugle roof: he circles and dives. Web yank him during a dive: a real pull
// that drags him out of the air onto the roof, where he is open. Phase 2 (55%) adds feather darts
// from the circle.

const L = (who, text) => ({ who, text });
// The chase loop: avenue x 360 and 120, streets z 180 and -300 (all open to the sky).
const LOOP = [[360, 62, 180], [360, 54, -60], [360, 68, -300], [240, 58, -300], [120, 52, -300], [120, 64, -60], [120, 56, 180], [240, 66, 180]];

export function createVulture(ctx) {
  const { site, hero, fx, say, word, shake, step, combat } = ctx;
  const chase = step.type === 'chase';
  const ar = site.arena;
  const start = chase ? { x: LOOP[0][0], y: LOOP[0][1], z: LOOP[0][2] } : { x: site.x, y: ar.y + 16, z: site.z };
  const a = createBossActor(ctx, { char: 'vulture', hp: 340, armor: 0.5, poise: 999, mass: 75, at: start, arena: chase ? null : ar, facing: 0 });
  a.flying = true;
  a.poseState = 'glide';
  let done = false, failed = false, hits = 0, hitCd = 0, wp = 1, farT = 0, time = 0, slowT = 0;
  let mode = chase ? 'chase' : 'circle', ang = 0, modeT = 0, dive = null, groundings = 0, phase = 1, dartT = 3;
  a.e.state = chase ? 'engage' : 'away';

  // Thrust toward a wanted velocity (the harness), limited like a real flyer.
  function fly(vx, vy, vz, dt, acc = 26) {
    const v = a.body.v, dx = vx - v.x, dy = vy - v.y, dz = vz - v.z, l = Math.hypot(dx, dy, dz), lim = acc * dt, k = l > lim ? lim / l : 1;
    applyDv(a.body, 'lift', dx * k, dy * k, dz * k);
    if (Math.hypot(v.x, v.z) > 1) a.face(Math.atan2(v.x, v.z), dt, 5);
  }

  function countHit(word0) {
    if (hitCd > 0 || done) return;
    hitCd = 0.8; hits++; slowT = 1.6;
    word(hits >= 3 ? 'GOING DOWN!' : word0, a.body.p, 'big');
    applyDv(a.body, 'lift', 0, -4, 0);
    if (hits >= 3) { done = true; say([L('vulture', 'My wing! You will pay for that, bug.'), L('peter', 'He is limping toward the Bugle. Of course he is.')]); }
  }

  if (chase) {
    a.onWeb = () => countHit('GOT HIM!');
    a.onHit = () => { countHit('WHACK!'); return { dealt: 0, blocked: false }; };
    a.onYank = () => { countHit('GOTCHA!'); return true; };
  } else {
    // In a dive he can be pulled down. Anywhere else a yank is a web strike.
    a.onYank = () => {
      if (mode !== 'dive' && mode !== 'diveWind') return false;
      const h = hero.body.p, p = a.body.p;
      fx.tether({ x: h.x, y: h.y + 0.5, z: h.z }, { x: p.x, y: p.y + 0.4, z: p.z });
      setTimeout(() => fx.tether(null), 300);
      const dx = h.x - p.x, dy = h.y - p.y, dz = h.z - p.z, d = Math.hypot(dx, dy, dz) || 1;
      applyDv(a.body, 'rope', (dx / d) * 14 - a.body.v.x, (dy / d) * 14 - 6 - a.body.v.y, (dz / d) * 14 - a.body.v.z);
      a.flying = false; mode = 'falling'; modeT = 0; dive = null;
      a.state('engage');
      word('YANKED!', p, 'big');
      shake(0.4);
      return true;
    };
  }
  const baseHit = a.hit;
  a.hit = (args) => (mode === 'circle' || mode === 'climb' ? { dealt: 0, blocked: true } : baseHit(args));
  // Each grounding can only take so much: three at least.
  a.floor = () => (chase ? 0 : Math.max(0, 0.75 - 0.25 * groundings));

  function updateChase(dt) {
    hitCd -= dt;
    const tgt = LOOP[wp];
    const p = a.body.p, h = hero.body.p;
    const dx = tgt[0] - p.x, dy = tgt[1] - p.y, dz = tgt[2] - p.z, d = Math.hypot(dx, dy, dz);
    if (d < 14) wp = (wp + 1) % LOOP.length;
    const dh = Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z);
    // Rubber band: slow when far ahead, fast when the hero is on him.
    slowT -= dt;
    const speed = slowT > 0 ? 9 : dh > 90 ? 11 : dh < 30 ? 19 : 16;
    const wob = Math.sin(time * 1.7) * 3;
    fly((dx / d) * speed, (dy / d) * speed + wob, (dz / d) * speed, dt);
    farT = dh > 170 ? farT + dt : 0;
    if (farT > 7) { failed = true; say([L('peter', 'Lost him. Okay, back to Oscorp, he will circle round.')]); }
  }

  function updateFight(dt) {
    const p = a.body.p, h = hero.body.p, t = a.toHero();
    modeT += dt;
    const f = a.hpFrac();
    if (phase === 1 && f <= 0.55) { phase = 2; say([L('vulture', 'Feathers and steel, bug. Feathers and steel.')]); }
    if (f <= 0 && a.e.state !== 'out') { a.defeat(); done = true; a.flying = false; word('GROUNDED!', p, 'big'); }
    if (done) { a.step(dt); return; }
    const cx = (ar.minX + ar.maxX) / 2, cz = (ar.minZ + ar.maxZ) / 2, top = ar.y + 18;
    switch (mode) {
      case 'circle': {
        a.e.state = a.e.state === 'windup' || a.e.state === 'recover' || a.e.state === 'strike' ? a.e.state : 'away';
        ang += dt * 0.42;
        const r = 17;
        const wx = cx + Math.cos(ang) * r, wz = cz + Math.sin(ang) * r;
        fly((wx - p.x) * 1.6, (top - p.y) * 1.4, (wz - p.z) * 1.6, dt);
        dartT -= dt;
        if (phase === 2 && dartT <= 0 && a.e.state === 'away') {
          dartT = 3.2;
          a.windup({ t: 0.7, ranged: true, reach: 40, recover: 0.3, pose: 'punch', track: false, onStrike: () => {
            for (let i = -1; i <= 1; i++) combat.projectiles.fire('bullet', { x: p.x, y: p.y + 0.5, z: p.z }, { x: h.x + i * 1.2, y: h.y + 0.2, z: h.z + i * 0.8 }, { dmg: 5 });
          } });
        }
        if (modeT > (phase === 2 ? 4 : 5.5) && a.e.state === 'away') {
          mode = 'diveWind'; modeT = 0;
          a.windup({ t: 0.9, ranged: true, unblockable: true, reach: 40, recover: 0.05, pose: 'none', onStrike: () => {} });
        }
        break;
      }
      case 'diveWind':
        // Hover and line up; the windup tells the spider-sense.
        fly(0, 0, 0, dt, 30);
        a.faceHero(dt, 6);
        if (modeT > 0.9) {
          mode = 'dive'; modeT = 0;
          const d = Math.hypot(t.dx, t.dy, t.dz) || 1;
          dive = { x: t.dx / d, y: (h.y - p.y) / Math.hypot(t.dx, h.y - p.y, t.dz), z: t.dz / d, hit: false };
          a.state('engage');
        }
        break;
      case 'dive': {
        const s = 26;
        fly(dive.x * s, dive.y * s, dive.z * s, dt, 60);
        if (!dive.hit && Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z) < 1.8) { dive.hit = true; a.hurtHero(14, { x: dive.x, z: dive.z }, true); word('SKREE!', p, 'hit'); }
        if (p.y < ar.y + 2.5 || modeT > 2.2) { mode = 'climb'; modeT = 0; }
        break;
      }
      case 'falling':
        a.poseState = 'air';
        if (a.grounded) { mode = 'grounded'; modeT = 0; groundings++; a.stun(3.4); fx.shock({ x: p.x, y: p.y - 0.9, z: p.z }, 5); shake(0.6); word('CRASH!', p, 'hit'); }
        break;
      case 'grounded':
        a.poseState = 'ground';
        if (!a.stunned() && modeT > 3.4) { mode = 'climb'; modeT = 0; a.flying = true; a.poseState = 'glide'; say([L('vulture', groundings > 1 ? 'Not again!' : 'Lucky shot.')]); }
        break;
      case 'climb':
        a.e.state = 'away';
        fly((cx - p.x) * 0.8, 12, (cz - p.z) * 0.8, dt);
        if (p.y > top - 2 || modeT > 3) { mode = 'circle'; modeT = 0; }
        break;
      default: break;
    }
    a.step(dt);
  }

  return {
    actor: a,
    get done() { return done; },
    get failed() { return failed; },
    get phase() { return chase ? 0 : phase; },
    get state() { return { chase, mode, hits, phase, hp: a.hpFrac(), groundings, state: a.e.state, wp }; },
    update(dt) {
      time += dt;
      if (chase) { if (!done && !failed) updateChase(dt); a.step(dt); } else updateFight(dt);
    },
    setPhase(n) { if (n >= 2 && phase < 2) { phase = 2; a.e.hp = a.e.maxHp * 0.55; } },
    dispose() { a.dispose(); fx.tether(null); },
  };
}
