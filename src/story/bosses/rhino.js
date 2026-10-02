import { applyDv, placeBody } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';
import { RAILYARD, GRID } from '../../world/city.js';

// Rhino in Hell's Kitchen (spec 10, Act 1). 320 kg of momentum: a charge is a straight line he
// cannot turn out of, so dodge it and let a building stop him (a stun window; his hide shrugs off
// most blows otherwise). A web yank does nothing to him, he outweighs you (it pulls you instead).
// Phase 2 (55%): he smashes off toward the West Side rail yard; get there. Phase 3 in the yard:
// freight cars and container stacks to charge him into, then finish him.

const L = (who, text) => ({ who, text });

export function createRhino(ctx) {
  const { site, hero, fx, say, word, shake } = ctx;
  const a = createBossActor(ctx, { char: 'rhino', hp: 460, armor: 0.85, poise: 999, mass: 320, radius: 0.85, half: 0.6, at: { x: site.x - 12, y: 0.9, z: site.z }, facing: Math.PI / 2 });
  let phase = 1, think = 1.5, charge = null, done = false, run = null, slowT = 0, stuns = 0, stuckT = 0, runT = 0, reroutes = 0;
  const yard = { minX: RAILYARD.minX, maxX: RAILYARD.maxX, minZ: RAILYARD.minZ, maxZ: RAILYARD.maxZ, y: 0 };

  a.onYank = () => {
    // Too heavy: the pull moves the hero instead.
    const t = a.toHero();
    applyDv(hero.body, 'rope', -t.ux * 7, 2, -t.uz * 7);
    word('TOO HEAVY!', a.body.p, 'big');
    return true;
  };
  a.onWeb = () => { slowT = 2.5; };
  a.floor = () => (phase === 1 ? 0.55 : phase === 2 ? 0.55 : 0);
  const baseHit = a.hit;
  a.hit = (args) => (phase === 2 ? { dealt: 0, blocked: true } : baseHit(args));

  // The run to the yard: along his avenue to the z = 0 street, then west into the yard.
  function startRun(again = false) {
    phase = 2;
    if (!again) { runT = 0; reroutes = 0; }
    const p = a.body.p;
    // Street centre lines only: out to his street, along it to an avenue, down the avenue to the
    // z = 0 street, west along it into the yard.
    const ax = Math.round((p.x - GRID.minX) / GRID.avenueEvery) * GRID.avenueEvery + GRID.minX;
    const sz = Math.round((p.z - GRID.minZ) / GRID.streetEvery) * GRID.streetEvery + GRID.minZ;
    const onAvenue = Math.abs(p.x - ax) < GRID.avenueWidth / 2;
    run = onAvenue ? [{ x: ax, z: p.z }] : [{ x: p.x, z: sz }, { x: ax, z: sz }];
    run.push({ x: ax, z: 0 }, { x: RAILYARD.maxX + 8, z: 0 }, { x: (RAILYARD.minX + RAILYARD.maxX) / 2, z: 0 });
    stuckT = 0;
    a.arena = null;
    charge = null;
    if (!again) say([L('rhino', 'Not here. Somewhere with room to run.'), L('yuri', 'He is heading west, toward the rail yard. Get there first.')]);
  }

  function update(dt) {
    if (done) { a.step(dt); return; }
    const t = a.toHero(), e = a.e;
    slowT -= dt;
    const slow = slowT > 0 ? 0.7 : 1;
    if (phase === 1 && a.hpFrac() <= 0.55 && !a.attacking() && !charge) startRun();
    if (phase === 3 && a.hpFrac() <= 0 && e.state !== 'out') { a.defeat(); done = true; word('DOWN FOR THE COUNT!', a.body.p, 'big'); shake(1); a.step(dt); return; }

    if (phase === 2) {
      // Running for the yard, flattening anything in the way.
      const w = run[0], dx = w.x - a.body.p.x, dz = w.z - a.body.p.z, d = Math.hypot(dx, dz);
      if (d < 3) run.shift();
      if (!run.length || (a.body.p.x < RAILYARD.maxX && a.body.p.x > RAILYARD.minX && Math.abs(a.body.p.z) < 40)) {
        phase = 3; a.arena = yard; e.state = 'engage'; think = 2; say([L('rhino', 'Here. Now nobody gets in my way.')]);
      } else {
        a.face(Math.atan2(dx, dz), dt, 6);
        a.move((dx / d) * 15, (dz / d) * 15, dt, 40);
        if (t.d < 2.2 && Math.abs(t.dy) < 2) a.hurtHero(18, { x: t.ux * 2, z: t.uz * 2 }, true);
        // Blocked (a parked car, a lamp): he backs off and takes the next leg.
        stuckT = Math.hypot(a.body.v.x, a.body.v.z) < 2 ? stuckT + dt : 0;
        runT += dt;
        if (stuckT > 1.2) { stuckT = 0; reroutes++; startRun(true); }
        // Truly wedged (or far too slow): he comes crashing into the yard from off screen.
        const h = hero.body.p;
        if ((reroutes > 4 || runT > 40) && Math.hypot(h.x - a.body.p.x, h.z - a.body.p.z) > 80) {
          placeBody(a.body, RAILYARD.maxX + 6, 0.9, 0);
          applyDv(a.body, 'surface', -12, 0, 0);
          run = [{ x: (RAILYARD.minX + RAILYARD.maxX) / 2, z: 0 }];
          reroutes = 0;
        }
      }
      a.step(dt);
      return;
    }
    if (a.stunned() || (a.attacking() && !charge)) { a.step(dt); return; }

    if (charge) {
      charge.t += dt;
      // A little homing in the first moments, then committed.
      if (charge.t < 0.3) { charge.x += (t.ux - charge.x) * dt * 3; charge.z += (t.uz - charge.z) * dt * 3; }
      const s = 19 * slow;
      a.face(Math.atan2(charge.x, charge.z), dt, 10);
      a.move(charge.x * s, charge.z * s, dt, 50);
      if (!charge.hit && t.d < 2.2 && Math.abs(t.dy) < 2.2) { charge.hit = true; applyDv(hero.body, 'surface', charge.x * 16, 8, charge.z * 16); a.hurtHero(18, { x: charge.x, z: charge.z }, true); word('GORE!', a.body.p, 'hit'); }
      const edge = a.arena && (a.body.p.x < a.arena.minX + 1.6 || a.body.p.x > a.arena.maxX - 1.6 || a.body.p.z < a.arena.minZ + 1.6 || a.body.p.z > a.arena.maxZ - 1.6);
      if (a.hitWall || edge) {
        charge = null; stuns++;
        applyDv(a.body, 'surface', -a.body.v.x * 1.1, 0, -a.body.v.z * 1.1);
        a.stun(4);
        fx.shock({ x: a.body.p.x, y: 0.2, z: a.body.p.z }, 5);
        shake(1); word('CRUNCH!', a.body.p, 'big');
        ctx.sfx?.({ type: 'land', hard: true, impact: 40 });
      } else if (charge.t > 3.2) { charge = null; think = 0.8; }
      a.step(dt);
      return;
    }

    a.faceHero(dt, 4);
    think -= dt;
    if (t.d > 3) a.move(t.ux * 4 * slow, t.uz * 4 * slow, dt); else a.move(0, 0, dt);
    if (think <= 0) {
      think = 1.4 + Math.random() * 0.8;
      if (t.d > 6 || Math.random() < 0.35) {
        a.windup({ t: 0.95, unblockable: true, reach: 40, recover: 0.05, pose: 'none', onStrike: () => { charge = { x: Math.sin(a.facing), z: Math.cos(a.facing), t: 0, hit: false }; } });
      } else a.windup({ t: 0.7, reach: 3.2, arc: 1.3, dmg: 12, push: 10, pose: 'uppercut' });
    }
    a.step(dt);
  }

  return {
    actor: a,
    get done() { return done; },
    get phase() { return phase; },
    get state() { return { phase, hp: a.hpFrac(), stuns, charging: !!charge, state: a.e.state }; },
    // While he runs for the yard the objective and the waypoint point there.
    get objective() { return phase === 2 ? 'Get to the West Side rail yard.' : null; },
    get waypoint() { return phase === 2 ? { x: (RAILYARD.minX + RAILYARD.maxX) / 2, z: 0 } : null; },
    update,
    setPhase(n) {
      if (n >= 2 && phase < 2) { a.e.hp = a.e.maxHp * 0.55; startRun(); }
      if (n >= 3 && phase < 3) { phase = 3; a.arena = yard; run = null; a.body.p.x = (RAILYARD.minX + RAILYARD.maxX) / 2 + 20; a.body.p.z = 0; }
    },
    dispose() { a.dispose(); },
  };
}
