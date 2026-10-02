import { applyDv } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';
import { buildHelicopter } from '../storyFx.js';

// Kingpin on the Fisk Tower roof (spec 10, Prologue). A heavy brawler who uses the room.
// Phase 1: haymakers, a wide cane sweep, a shoulder charge from range. Dodge and punish.
// Phase 2 (60%): he tears up the roof fixtures and throws them; web yank one back into him.
// Phase 3 (25%): his helicopter drops a rope ladder and he climbs for it. Web yank him off the
// ladder (each yank is a real pull against his climb), then finish him on the roof.

const L = (who, text) => ({ who, text });

export function createKingpin(ctx) {
  const { site, hero, props, fx, say, word, shake } = ctx;
  const ar = site.arena;
  const a = createBossActor(ctx, { char: 'kingpin', hp: 500, armor: 0.72, poise: 999, mass: 180, radius: 0.6, half: 0.55, at: { x: site.x + 6, y: site.y, z: site.z }, arena: ar, facing: -Math.PI / 2 });
  let phase = 1, think = 1.2, thrown = 0, heli = null, ladderTop = 0, climbing = false, pulls = 0, done = false, time = 0, charge = null, landed = false;
  const lines = {
    p2: [L('kingpin', 'You are costing me money. I do not like that.')],
    p3: [L('kingpin', 'Enough. My ride is here.'), L('peter', 'Oh no you do not.')],
    pulled: [L('kingpin', 'Put. Me. Down.')],
  };

  // Phase 2 needs things to throw: AC units and crates along the roof.
  function scatter(n) {
    for (let i = 0; i < n; i++) {
      const x = ar.minX + 3 + Math.random() * (ar.maxX - ar.minX - 6), z = ar.minZ + 2 + Math.random() * (ar.maxZ - ar.minZ - 4);
      props.add({ x, y: ar.y, z, kind: i % 2 ? 'ac' : 'crate' });
    }
  }

  a.onYank = () => {
    if (!climbing) return false; // a normal yank on a 180 kg man: a web strike instead
    // Tug of war: each yank pulls him down the ladder.
    const h = hero.body.p, p = a.body.p;
    fx.tether({ x: h.x, y: h.y + 0.5, z: h.z }, { x: p.x, y: p.y + 0.5, z: p.z });
    setTimeout(() => fx.tether(null), 180);
    applyDv(a.body, 'rope', 0, -5, 0);
    pulls++;
    word('PULL!', a.body.p, 'big');
    shake(0.3);
    if (pulls >= 3) {
      climbing = false;
      a.flying = false;
      applyDv(a.body, 'rope', (h.x - p.x) * 0.4, -2, (h.z - p.z) * 0.4);
      say(lines.pulled);
    }
    return true;
  };

  // Phase gates: the fight must go through each mechanic, so his health stops at each threshold.
  a.floor = () => (phase === 1 ? 0.6 : phase === 2 ? 0.25 : pulls < 3 ? 0.08 : 0);

  function begin3() {
    phase = 3;
    say(lines.p3);
    heli = buildHelicopter(ctx.scene);
    // Hovering off the long side of the roof, the ladder hanging onto it.
    heli.group.position.set((ar.minX + ar.maxX) / 2 + 4, ar.y + 15.5, ar.maxZ - 4.5);
    ladderTop = ar.y + 13.5;
  }

  function update(dt) {
    if (done) return;
    time += dt;
    const e = a.e, t = a.toHero();
    const f = a.hpFrac();
    if (phase === 1 && f <= 0.6 && !a.attacking()) { phase = 2; say(lines.p2); scatter(6); a.stun(1.2); }
    if (phase === 2 && f <= 0.25 && !a.attacking()) begin3();
    heli?.update(dt, time);

    if (e.state === 'out') { a.step(dt); return; }
    if (phase === 3 && !climbing && pulls < 3 && heli && !a.stunned() && !a.attacking()) {
      // Run for the ladder.
      const lx = heli.group.position.x + 0.4, lz = heli.group.position.z + 1.4;
      const dx = lx - a.body.p.x, dz = lz - a.body.p.z, d = Math.hypot(dx, dz);
      a.face(Math.atan2(dx, dz), dt);
      if (d > 0.8) a.move((dx / d) * 6, (dz / d) * 6, dt);
      else { climbing = true; a.flying = true; word('HE IS GETTING AWAY!', a.body.p, 'big'); }
      a.step(dt);
      return;
    }
    if (climbing) {
      // Hand over hand: a steady climb (his own force), the yanks pull him back down.
      const v = a.body.v;
      applyDv(a.body, 'surface', -v.x, (0.55 - v.y) * Math.min(1, dt * 4) - 0, -v.z);
      if (a.body.p.y > ladderTop) { a.body.p.y = ladderTop; v.y = 0; }
      a.poseState = 'hang';
      a.step(dt);
      return;
    }
    a.poseState = 'ground';
    if (phase === 3 && pulls >= 3 && heli) {
      // Pulled off: the helicopter gives up on him.
      if (a.grounded && !landed) { landed = true; a.stun(4); shake(0.8); fx.shock(a.body.p, 7); word('CRASH!', a.body.p, 'hit'); }
      heli.group.position.y += dt * 6; heli.group.position.x += dt * 14;
      if (heli.group.position.y > ar.y + 80) { heli.dispose(); heli = null; }
    }
    if (a.hpFrac() <= 0) { a.defeat(); done = true; word('KO!', a.body.p, 'big'); return; }
    if (a.stunned() || a.attacking()) { a.step(dt); return; }

    // A charge in flight.
    if (charge) {
      charge.t += dt;
      a.move(charge.x * 13, charge.z * 13, dt, 60);
      if (t.d < 1.6 && !charge.hit) { charge.hit = true; a.hurtHero(18, { x: t.ux * 2, z: t.uz * 2 }, true); }
      const edge = a.body.p.x < ar.minX + 1.3 || a.body.p.x > ar.maxX - 1.3 || a.body.p.z < ar.minZ + 1.3 || a.body.p.z > ar.maxZ - 1.3;
      if (charge.t > 1.1 || a.hitWall || edge) {
        if (edge || a.hitWall) { a.stun(1.8); word('THUD!', a.body.p, 'hit'); shake(0.5); }
        charge = null;
      }
      a.step(dt);
      return;
    }

    a.faceHero(dt, 6);
    think -= dt;
    const speed = t.d > 8 ? 5.5 : 3.4;
    if (t.d > 2.4) a.move(t.ux * speed, t.uz * speed, dt); else a.move(0, 0, dt);
    if (think <= 0) {
      think = phase === 1 ? 1.5 + Math.random() * 0.8 : 1.2 + Math.random() * 0.7;
      const held = props.list.find((p) => p.state === 'held' && p.holder === a);
      if (phase >= 2 && !held && thrown < 99 && t.d > 4 && Math.random() < 0.55) {
        const prop = props.nearest(a.body.p.x, a.body.p.z);
        if (prop && Math.hypot(prop.p.x - a.body.p.x, prop.p.z - a.body.p.z) < 9) {
          props.lift(prop, a);
          a.windup({ t: 0.9, ranged: true, recover: 0.6, pose: 'uppercut', onStrike: () => { const h = hero.body.p, v = hero.body.v; props.throwAt(prop, { x: h.x + v.x * 0.3, y: h.y, z: h.z + v.z * 0.3 }, 0.75); thrown++; } });
        }
      } else if (t.d > 7 && Math.random() < 0.6) {
        a.windup({ t: 0.8, unblockable: true, reach: 30, recover: 0.1, pose: 'none', onStrike: () => { charge = { x: t.ux, z: t.uz, t: 0, hit: false }; } });
      } else if (t.d < 3.8) {
        if (Math.random() < 0.5) a.windup({ t: 0.75, reach: 2.9, arc: 1.0, dmg: 16, push: 9, pose: 'punch' });
        else a.windup({ t: 0.6, reach: 3.5, arc: 2.3, dmg: 11, push: 6, pose: 'uppercut' });
      }
    }
    a.step(dt);
  }

  return {
    actor: a,
    get done() { return done; },
    get phase() { return phase; },
    get state() { return { phase, hp: a.hpFrac(), climbing, pulls, state: a.e.state }; },
    update,
    // Test hook: jump to a phase (a pilot then plays it).
    setPhase(n) {
      if (n >= 2 && phase < 2) { phase = 2; scatter(6); a.e.hp = a.e.maxHp * 0.6; }
      if (n >= 3 && phase < 3) { a.e.hp = a.e.maxHp * 0.25; begin3(); }
    },
    dispose() { a.dispose(); heli?.dispose(); props.clear(); fx.tether(null); },
  };
}
