import { applyDv } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';
import { BRIDGE } from '../../world/city.js';

// Scorpion on the Queensway Bridge (spec 10, Act 2).
// Chase: he runs and vaults along the deck toward Queens and back, keeping just ahead (a rubber
// band). Three hits (webs or blows) and he turns to fight. Too far for too long and he is gone.
// Fight on the deck between the towers: his tail sting poisons you, and the poison is a clock
// (beat him before it runs out; every perfect dodge buys a little time, every sting takes some).
// A long sting, a wide tail sweep, acid spit from range, and a pounce that buries his tail in the
// deck for a moment (the opening). Phase 2 (50%): double stings and faster pounces.

const L = (who, text) => ({ who, text });
const POISON = 100;

export function createScorpion(ctx) {
  const { site, step, hero, fx, say, word, shake, combat } = ctx;
  const chase = step.type === 'chase';
  const deck = { minX: BRIDGE.towers[0] + 5, maxX: BRIDGE.towers[1] - 5, minZ: BRIDGE.z - BRIDGE.width / 2, maxZ: BRIDGE.z + BRIDGE.width / 2, y: BRIDGE.deckY };
  // Away from the bridge (a pair in Act 4), he fights where the step puts him.
  const away = !chase && ctx.step.variant === 'duo';
  if (away) Object.assign(deck, { minX: site.x - 45, maxX: site.x + 45, minZ: site.z - 12, maxZ: site.z + 14, y: 0 });
  const start = chase ? { x: BRIDGE.x0 + 95, y: BRIDGE.deckY + 0.9, z: BRIDGE.z } : away ? { x: site.x + 4, y: 0.9, z: site.z + 2 } : { x: (deck.minX + deck.maxX) / 2 + 8, y: BRIDGE.deckY + 0.9, z: BRIDGE.z };
  const a = createBossActor(ctx, { char: 'scorpion', hp: 420, armor: 0.6, poise: 999, mass: 95, at: start, arena: chase ? { minX: BRIDGE.x0 - 100, maxX: BRIDGE.x1 + 100, minZ: deck.minZ, maxZ: deck.maxZ, y: deck.y } : deck, facing: Math.PI / 2 });
  let done = false, failed = false, hits = 0, hitCd = 0, farT = 0, dir = 1, hopT = 1.5;
  let phase = 1, think = 1.2, poison = POISON, pounce = null, stingN = 0;

  function countHit(w) {
    if (hitCd > 0 || done) return;
    hitCd = 2; hits++;
    word(hits >= 3 ? 'GOT YOU!' : w, a.body.p, 'big');
    applyDv(a.body, 'surface', -a.body.v.x * 0.8, 0, -a.body.v.z * 0.8);
    if (hits >= 3) { done = true; say([L('scorpion', 'Fine! Right here, then. You will not be walking off this bridge.')]); }
  }
  if (chase) {
    a.onWeb = () => countHit('GOT HIM!');
    a.onHit = () => { countHit('WHAM!'); return { dealt: 0, blocked: false }; };
    a.onYank = () => { countHit('GOTCHA!'); return true; };
  } else {
    a.floor = () => (phase === 1 ? 0.5 : 0);
    a.onYank = () => false;
  }

  function sting() {
    const hit = a.meleeHit(4.8, 0.55, 10, 7, false);
    if (hit) { poison = Math.max(0, poison - 8); word('POISONED!', hero.body.p, 'hit'); }
    stingN++;
  }
  function sweep() { a.meleeHit(4.2, 2.8, 9, 10, true); fx.shock({ x: a.body.p.x, y: a.body.p.y - 0.8, z: a.body.p.z }, 4.5); }
  function spit() {
    const p = a.body.p, h = hero.body.p, v = hero.body.v;
    combat.projectiles.fire('bullet', { x: p.x, y: p.y + 0.8, z: p.z }, { x: h.x + v.x * 0.25, y: h.y + 0.3, z: h.z + v.z * 0.25 }, { dmg: 8 });
    word('HSSS!', p, 'small');
  }
  function startPounce() {
    const p = a.body.p, h = hero.body.p;
    const dx = h.x - p.x, dz = h.z - p.z, T = 0.75;
    applyDv(a.body, 'surface', dx / T - a.body.v.x, 11 - a.body.v.y, dz / T - a.body.v.z);
    pounce = { t: 0, landed: false };
  }

  function updateChase(dt) {
    hitCd -= dt;
    const p = a.body.p, h = hero.body.p;
    if (p.x > BRIDGE.x1 + 40) dir = -1;
    if (p.x < BRIDGE.x0 - 20) dir = 1;
    const dh = Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z);
    const speed = dh > 70 ? 6 : dh < 18 ? 12.5 : 10;
    const weave = Math.sin(performance.now() / 700) * 5;
    a.face(Math.atan2(dir, 0), dt, 6);
    a.move(dir * speed, (BRIDGE.z + weave - p.z) * 0.8, dt, 40);
    // Vaults with his tail: a real push off the deck.
    hopT -= dt;
    if (hopT <= 0 && a.grounded) { hopT = 1.2 + Math.random() * 1.5; applyDv(a.body, 'surface', 0, 7.5, 0); a.pose('launch'); }
    farT = dh > 150 ? farT + dt : 0;
    if (farT > 8) { failed = true; say([L('peter', 'He is gone. Back to the Harbor end, he will double back.')]); }
  }

  function updateFight(dt) {
    const e = a.e, t = a.toHero(), f = a.hpFrac();
    if (done) { a.step(dt); return; }
    poison -= dt;
    ctx.timer?.('POISON', poison);
    if (poison <= 0 && !done) {
      // The poison wins: you black out (the step starts over).
      poison = POISON;
      word('BLACKED OUT', hero.body.p, 'big');
      ctx.knockOut();
    }
    if (phase === 1 && f <= 0.5 && !a.attacking() && !pounce) { phase = 2; say([L('scorpion', 'I can do this all night. Can you?')]); }
    if (f <= 0 && e.state !== 'out') { a.defeat(); done = true; ctx.timer?.(null); word('STUNG OUT!', a.body.p, 'big'); a.step(dt); return; }
    if (pounce) {
      pounce.t += dt;
      if (!pounce.landed && a.grounded && pounce.t > 0.25) {
        pounce.landed = true;
        fx.shock({ x: a.body.p.x, y: a.body.p.y - 0.8, z: a.body.p.z }, 4);
        shake(0.5);
        if (t.d < 2.8 && Math.abs(t.dy) < 2) a.hurtHero(14, { x: t.ux, z: t.uz }, true);
        // The tail is stuck in the deck: an opening.
        a.stun(phase === 2 ? 2 : 2.6);
        word('STUCK!', a.body.p, 'small');
        pounce = null;
      }
      a.step(dt);
      return;
    }
    if (a.stunned() || a.attacking()) { a.step(dt); return; }
    a.faceHero(dt, 7);
    const want = t.d < 3.5 ? -0.6 : t.d > 6 ? 1 : 0;
    a.move((t.ux * want - t.uz * 0.5) * 5.5, (t.uz * want + t.ux * 0.5) * 5.5, dt);
    think -= dt;
    if (think <= 0) {
      think = (phase === 2 ? 0.9 : 1.3) + Math.random() * 0.7;
      if (t.d > 9 && Math.random() < 0.55) a.windup({ t: 0.7, ranged: true, unblockable: true, reach: 30, recover: 0.05, pose: 'none', onStrike: startPounce });
      else if (t.d > 7) a.windup({ t: 0.65, ranged: true, reach: 30, recover: 0.5, pose: 'punch', onStrike: spit });
      else if (Math.random() < 0.6) {
        a.windup({ t: 0.6, reach: 4.8, arc: 0.55, dmg: 10, pose: 'uppercut', recover: phase === 2 ? 0.3 : 0.7, onStrike: () => { sting(); if (phase === 2 && stingN % 2 === 1) think = 0.1; } });
      } else a.windup({ t: 0.55, reach: 4.2, arc: 2.8, dmg: 9, pose: 'uppercut', unblockable: true, recover: 0.6, onStrike: sweep });
    }
    a.step(dt);
  }

  return {
    actor: a,
    get done() { return done; },
    get failed() { return failed; },
    get phase() { return phase; },
    get state() { return { chase, phase, hits, hp: a.hpFrac(), poison, state: a.e.state }; },
    update(dt) { if (chase) { if (!done && !failed) updateChase(dt); a.step(dt); } else updateFight(dt); },
    // Perfect dodges buy time against the poison.
    onEvent(ev) { if (!chase && ev.type === 'dodge' && ev.perfect) { poison = Math.min(POISON, poison + 5); word('+5 S', hero.body.p, 'small'); } },
    setPhase(n) { if (n >= 2 && phase < 2) { phase = 2; a.e.hp = a.e.maxHp * 0.5; } },
    dispose() { a.dispose(); ctx.timer?.(null); },
  };
}
