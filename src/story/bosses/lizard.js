import { applyDv } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';
import { ZOO } from '../../world/city.js';

// The Lizard (spec 10, Act 2): Dr. Curt Connors, not himself.
// Chase: he bolts across Central Park, where there is next to nothing to web to (zip, run and
// glide), and climbs over whatever is in the way. Three hits and he turns at the zoo.
// Fight at the zoo: a quick bite, a wide tail swipe, a pounce from range, and a roar that calls
// three of his lizard-men. Phase 3 (25%): he is tiring; after each pounce he slumps (an opening),
// and webbing him six times while he is down holds him long enough for the cure.

const L = (who, text) => ({ who, text });
// The run: zoo, the great lawn (no anchors), past the reservoir, back round to the zoo.
const LOOP = [[-330, -540], [-250, -640], [-170, -760], [-60, -840], [60, -880], [170, -760], [210, -640], [90, -560], [-120, -520]];

export function createLizard(ctx) {
  const { site, step, hero, fx, say, word, shake, combat } = ctx;
  const chase = step.type === 'chase';
  const arena = { minX: ZOO.minX + 3, maxX: ZOO.maxX - 3, minZ: ZOO.minZ + 3, maxZ: ZOO.maxZ - 3, y: 0 };
  const start = chase ? { x: LOOP[1][0], y: 0.9, z: LOOP[1][1] } : { x: site.x + 6, y: 0.9, z: site.z };
  const a = createBossActor(ctx, { char: 'lizard', hp: 440, armor: 0.55, poise: 999, mass: 120, radius: 0.55, at: start, arena: chase ? null : arena, facing: 0 });
  let done = false, failed = false, hits = 0, hitCd = 0, wp = 2, farT = 0, hopT = 2;
  let phase = 1, think = 1.3, pounce = null, roared = 0, webs = 0, minions = [];

  function countHit(w) {
    if (hitCd > 0 || done) return;
    hitCd = 2; hits++;
    word(hits >= 3 ? 'GOT HIM!' : w, a.body.p, 'big');
    applyDv(a.body, 'surface', -a.body.v.x * 0.7, 0, -a.body.v.z * 0.7);
    if (hits >= 3) { done = true; say([L('peter', 'Doc, it is me. Please. Let me help.'), L('lizard', 'Connors is gone, little spider. Follow me to the cages and see.')]); }
  }
  if (chase) {
    a.onWeb = () => countHit('GOT HIM!');
    a.onHit = () => { countHit('WHAM!'); return { dealt: 0, blocked: false }; };
    a.onYank = () => { countHit('GOTCHA!'); return true; };
  } else {
    a.floor = () => (phase < 3 ? Math.max(0.25, phase === 1 ? 0.6 : 0.25) : 0.05);
    a.onYank = () => false;
    // Phase 3: webs while he is down hold him for the cure.
    a.onWeb = () => {
      if (phase !== 3 || !a.stunned()) { word('THWIP!', a.body.p, 'small'); return; }
      webs++;
      a.e.stunFor = Math.max(a.e.stunFor, 1.2);
      word(webs >= 6 ? 'HOLD STILL, DOC!' : `${webs} / 6`, a.body.p, webs >= 6 ? 'big' : 'small');
      if (webs >= 6) { done = true; a.defeat(); say([L('peter', 'Easy, Doc. Easy. The cure is right here.')]); }
    };
  }

  function roar() {
    word('RRRAAAWR!', a.body.p, 'big');
    shake(0.6);
    fx.shock({ x: a.body.p.x, y: 0.1, z: a.body.p.z }, 8);
    for (let i = 0; i < 2; i++) {
      const ang = Math.random() * Math.PI * 2;
      minions.push(combat.enemies.spawn({ x: a.body.p.x + Math.cos(ang) * 9, z: a.body.p.z + Math.sin(ang) * 9, faction: 'lizard', arch: i === 2 ? 'whip' : 'brawler', look: i, alert: true }));
    }
    a.stun(1.8); // the roar takes it out of him: a short opening
  }
  function startPounce() {
    const p = a.body.p, h = hero.body.p, T = 0.7;
    applyDv(a.body, 'surface', (h.x - p.x) / T - a.body.v.x, 9 - a.body.v.y, (h.z - p.z) / T - a.body.v.z);
    pounce = { t: 0, landed: false };
  }

  let bolted = false;
  function updateChase(dt) {
    hitCd -= dt;
    const p = a.body.p, h = hero.body.p, w = LOOP[wp];
    // He waits for you (hissing) and bolts when you get close.
    if (!bolted) {
      a.faceHero(dt, 4);
      if (Math.hypot(h.x - p.x, h.z - p.z) < 55) { bolted = true; word('HSSSS!', p, 'big'); }
      return;
    }
    const dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz);
    if (d < 8) wp = (wp + 1) % LOOP.length;
    const dh = Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z);
    const speed = dh > 70 ? 7 : dh < 16 ? 13 : 10.5;
    a.face(Math.atan2(dx, dz), dt, 6);
    a.move((dx / d) * speed, (dz / d) * speed, dt, 35);
    // Over obstacles: a bound off his legs (a real push), like a lizard over a wall.
    hopT -= dt;
    if ((a.hitWall || hopT <= 0) && a.grounded) { hopT = 1.6 + Math.random() * 2; applyDv(a.body, 'surface', 0, a.hitWall ? 11 : 6, 0); a.pose('launch'); }
    farT = dh > 200 ? farT + dt : 0;
    if (farT > 10) { failed = true; say([L('peter', 'He is too fast. He will head back to the zoo, he always does.')]); }
  }

  function updateFight(dt) {
    const e = a.e, t = a.toHero(), f = a.hpFrac();
    minions = minions.filter((m) => m.alive);
    if (phase === 1 && f <= 0.6 && !a.attacking() && !pounce) { phase = 2; say([L('lizard', 'The city will be ours. Cold, and patient, and ours.')]); }
    if (phase === 2 && f <= 0.25 && !a.attacking() && !pounce) { phase = 3; say([L('peter', 'He is slowing down. Webs, now, while he is down.')]); }
    if (done) { a.step(dt); return; }
    if (pounce) {
      pounce.t += dt;
      if (!pounce.landed && a.grounded && pounce.t > 0.25) {
        pounce.landed = true;
        fx.shock({ x: a.body.p.x, y: 0.1, z: a.body.p.z }, 3.5);
        if (t.d < 2.6) a.hurtHero(13, { x: t.ux, z: t.uz }, true);
        // Tiring: after a pounce he slumps (in phase 3 a long one, for the webs).
        if (phase === 3) { a.stun(4); word('EXHAUSTED', a.body.p, 'small'); } else if (Math.random() < 0.5) a.windup({ t: 0.55, reach: 4, arc: 3, dmg: 9, push: 11, pose: 'uppercut', unblockable: true, recover: 1 }); else { a.state('recover'); }
        pounce = null;
      }
      a.step(dt);
      return;
    }
    if (a.stunned() || a.attacking()) { a.step(dt); return; }
    // Roars at 80% and 45%.
    if ((roared === 0 && f <= 0.8) || (roared === 1 && f <= 0.45)) { roared++; roar(); a.step(dt); return; }
    a.faceHero(dt, 8);
    const want = t.d > 3 ? 1 : 0;
    a.move(t.ux * want * 6.5, t.uz * want * 6.5, dt);
    think -= dt;
    if (think <= 0) {
      think = (phase === 1 ? 1.2 : 0.9) + Math.random() * 0.6;
      if (t.d > 7 || phase === 3) a.windup({ t: 0.6, ranged: true, unblockable: true, reach: 30, recover: 0.05, pose: 'none', onStrike: startPounce });
      else if (Math.random() < 0.5) a.windup({ t: 0.45, reach: 2.6, arc: 1, dmg: 8, pose: 'punch', recover: 0.55 });
      else a.windup({ t: 0.6, reach: 4, arc: 2.8, dmg: 9, push: 12, pose: 'uppercut', unblockable: true, recover: 0.8 });
    }
    a.step(dt);
  }

  return {
    actor: a,
    get done() { return done; },
    get failed() { return failed; },
    get phase() { return phase; },
    get state() { return { chase, phase, hits, webs, hp: a.hpFrac(), state: a.e.state, minions: minions.length }; },
    update(dt) { if (chase) { if (!done && !failed) updateChase(dt); a.step(dt); } else updateFight(dt); },
    setPhase(n) { if (n >= 2 && phase < 2) { phase = 2; a.e.hp = a.e.maxHp * 0.6; } if (n >= 3 && phase < 3) { phase = 3; a.e.hp = a.e.maxHp * 0.25; roared = 2; } },
    dispose() { a.dispose(); for (const m of minions) combat.enemies.remove(m); },
  };
}
