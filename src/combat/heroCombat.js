import { applyDv } from '../physics/ledger.js';
import { pickTarget, isActive, ARCHETYPES } from './enemies.js';

// The hero's side of a fight (spec 8.1). Every move uses a real source of force: legs on the
// ground for lunges and launchers, the web for strikes and yanks, kicks pushing off an enemy's body
// to stay up in the air. The combat system never moves the hero by teleport.

// The base values; progression (skills, mods) rewrites COMBAT from these.
export const COMBAT = {
  hp: 100,
  punch: 10, comboBonus: 1.5, uppercutLift: 11, airLift: 4.6, slamDmg: 14, slamRadius: 4.5,
  strikeRange: 14, meleeRange: 2.8, webRange: 32, yankRange: 20,
  dodgeSpeed: 10, iframes: 0.38, perfectWindow: 0.34, slowmo: 0.6,
  focusPerHit: 0.09, focusPerfect: 0.4, healAmount: 38,
  regenDelay: 4, regenRate: 14,
};

export const COMBAT_BASE = { ...COMBAT };

const WORDS = ['POW!', 'THWACK!', 'BAM!', 'WHAM!', 'KRAK!', 'SMACK!'];

export function createHeroCombat({ hero, enemies, projectiles, onEvent = () => {} }) {
  const c = {
    hp: COMBAT.hp, maxHp: COMBAT.hp, focus: 0,
    state: 'free', t: 0, combo: 0, comboT: 9, target: null,
    iframes: 0, outOfCombat: 9, attackHeldT: 0, buffered: false, punchN: 0,
    timeScale: 1, slowT: 0, stopT: 0, finisherHoldT: 0, defeated: false, lastWord: 0,
    dmgMul: 1, // skills raise this (Plan 4)
    special: null, strikeMul: 1, comboKeep: 2.2, armor: 0, resilient: false, resilientUsed: false, focusMul: 1, brutalMul: 1,
  };
  const P = () => hero.body.p, V = () => hero.body.v;
  const toward = (e) => { const p = P(), q = e.body.p; const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz) || 1; return { x: dx / d, z: dz / d, d, dy: q.y - p.y }; };
  const word = (text, e, kind = 'small') => onEvent({ type: 'word', text, at: e ? e.body.p : P(), kind });
  const grounded = () => hero.state === 'ground';

  function hitstop(s) { c.stopT = Math.max(c.stopT, s); }
  function slowmo(s) { c.slowT = Math.max(c.slowT, s); }

  function landHit(e, { dmg, push, lift, kind = 'melee', heavy = false }) {
    const u = toward(e);
    const r = enemies.hit(e, { dmg: dmg * c.dmgMul, dir: { x: u.x, z: u.z }, push, lift, kind, from: P() });
    if (r.blocked) { word('CLANG!', e); onEvent({ type: 'blocked' }); return r; }
    c.combo++; c.comboT = 0;
    c.focus = Math.min(3, c.focus + COMBAT.focusPerHit * c.focusMul);
    hitstop(heavy ? 0.09 : 0.05);
    if (c.combo % 2 === 0 || heavy) word(WORDS[(c.punchN + c.combo) % WORDS.length], e, heavy ? 'hit' : 'small');
    onEvent({ type: 'heroHit', e, heavy, kind });
    return r;
  }

  // Pre-step: read the combat inputs, start moves, and steer the hero's intent while a move runs.
  function preStep(intent, dt, ctx) {
    const { camFwd } = intent;
    c.t += dt;
    c.comboT += dt;
    if (c.comboT > c.comboKeep) c.combo = 0;
    c.iframes = Math.max(0, c.iframes - dt);
    const engaged = enemies.engaged;
    c.outOfCombat = engaged.length ? 0 : c.outOfCombat + dt;
    if (c.outOfCombat > COMBAT.regenDelay) { c.hp = Math.min(c.maxHp, c.hp + COMBAT.regenRate * dt); c.resilientUsed = false; }
    // Keep a target while it is valid and near; else pick the one the camera points at.
    if (!c.target || !isActive(c.target) || toward(c.target).d > COMBAT.strikeRange + 4) c.target = null;
    const pick = pickTarget(P(), camFwd, enemies.list, COMBAT.strikeRange);
    if (pick && (!c.target || c.state === 'free')) c.target = pick;
    const tgt = c.target;
    const near = tgt ? toward(tgt) : null;

    if (c.defeated) { intent.moveX = intent.moveZ = 0; return; }

    // Moves in progress -------------------------------------------------------------------------
    if (c.state === 'attack') {
      intent.moveX = intent.moveZ = 0;
      if (tgt && c.t < 0.12 && near.d > 1.3) {
        // Lunge: legs on the ground, or a kick off the air (small), toward the target.
        const want = Math.min(16, (near.d - 1.1) / 0.12);
        const v = V(), k = grounded() ? 1 : 0.6;
        applyDv(hero.body, grounded() ? 'surface' : 'rope', (near.x * want - v.x) * k * Math.min(1, dt * 20), 0, (near.z * want - v.z) * k * Math.min(1, dt * 20));
      }
      if (!c.hitDone && c.t >= 0.12) {
        c.hitDone = true;
        if (tgt && near.d < COMBAT.meleeRange && Math.abs(near.dy) < 2.6) {
          const air = !grounded();
          const r = landHit(tgt, { dmg: COMBAT.punch + Math.min(8, c.combo * COMBAT.comboBonus), push: air ? 1.5 : 3.6, lift: air ? COMBAT.airLift : (c.combo % 4 === 3 ? 6 : 0) });
          // In the air the kick pushes off the enemy's body: the hero stays up for the next one.
          if (air && !r.blocked) { const v = V(); applyDv(hero.body, 'surface', -v.x * 0.6, Math.max(0, 4.2 - v.y), -v.z * 0.6); }
        } else onEvent({ type: 'whiff' });
      }
      if (c.t >= 0.27) { c.state = 'free'; if (c.buffered) { c.buffered = false; startAttack(intent); } }
      else if (intent.attackPressed) c.buffered = true;
      return;
    }
    if (c.state === 'strike') {
      // Web strike: a web to the target and a hard pull along it, ending in a flying kick.
      intent.moveX = intent.moveZ = 0;
      if (!tgt || !isActive(tgt)) { c.state = 'free'; return; }
      const q = tgt.body.p, p = P(), dx = q.x - p.x, dy = q.y + 0.3 - p.y, dz = q.z - p.z, d = Math.hypot(dx, dy, dz) || 1;
      const v = V(), s = 26;
      applyDv(hero.body, 'rope', (dx / d * s - v.x) * Math.min(1, dt * 14), (dy / d * s - v.y) * Math.min(1, dt * 14), (dz / d * s - v.z) * Math.min(1, dt * 14));
      onEvent({ type: 'strikeLine', from: p, to: q });
      if (d < 1.7 || c.t > 0.9) {
        landHit(tgt, { dmg: COMBAT.punch * 1.6 * c.strikeMul, push: 8, lift: 3, heavy: true });
        const v2 = V(); applyDv(hero.body, 'surface', -v2.x * 0.8, Math.max(0, 5 - v2.y), -v2.z * 0.8);
        c.state = 'free';
        onEvent({ type: 'strikeEnd' });
      }
      return;
    }
    if (c.state === 'slam') {
      intent.moveX = intent.moveZ = 0;
      if (grounded()) {
        c.state = 'free';
        onEvent({ type: 'slam', at: { ...P() } });
        for (const e of enemies.active) {
          const u = toward(e);
          if (u.d < COMBAT.slamRadius && Math.abs(u.dy) < 2.5) landHit(e, { dmg: COMBAT.slamDmg, push: 9, lift: 2, kind: 'slam', heavy: true });
        }
        word('KRAKOOM!', null, 'hit');
        hitstop(0.12);
      } else { const v = V(); if (v.y > -26) applyDv(hero.body, 'assist', 0, Math.max(-60 * dt, -26 - v.y), 0); }
      return;
    }
    if (c.state === 'dodge') {
      if (c.t > 0.3) c.state = 'free';
      return;
    }
    if (c.state === 'hurt') {
      intent.moveX = intent.moveZ = 0;
      if (c.t > 0.32) c.state = 'free';
      return;
    }

    // Starting moves ------------------------------------------------------------------------------
    // Hold attack on the ground next to a target: the launcher.
    if (intent.attack) c.attackHeldT += dt; else c.attackHeldT = 0;
    if (c.attackHeldT > 0.3 && grounded() && tgt && near.d < 2.6 && !tgt.A.heavy) {
      c.attackHeldT = -99;
      landHit(tgt, { dmg: 8, push: 0.5, lift: COMBAT.uppercutLift, heavy: true });
      const v = V(); applyDv(hero.body, 'surface', -v.x, 12 - Math.max(0, v.y), -v.z);
      hero.state = 'air'; hero.airTime = 0.15;
      onEvent({ type: 'uppercut' });
      word('UPPERCUT!', tgt, 'hit');
      return;
    }
    if (intent.attackPressed) {
      if (tgt && near.d < COMBAT.meleeRange + 0.4) { startAttack(intent); return; }
      if (tgt && near.d < COMBAT.strikeRange && hero.state !== 'wall') {
        // Out of reach: web strike (from the ground, the air or a swing).
        if (hero.swing.active) { hero.swing.release(); hero.state = 'air'; }
        c.state = 'strike'; c.t = 0;
        onEvent({ type: 'webStrike', e: tgt });
        return;
      }
      if (!grounded() && !hero.swing.active) { onEvent({ type: 'airTrick' }); return; }
      if (grounded()) { startAttack(intent); return; }
    }
    // Dive near enemies below: the ground slam.
    if (intent.divePressed && !grounded() && !hero.swing.active) {
      const below = enemies.active.some((e) => { const u = toward(e); return u.d < 8 && u.dy < -1.5; });
      const ground = ctx.groundBelow;
      if (below && P().y - ground > 2.5) { c.state = 'slam'; c.t = 0; onEvent({ type: 'slamStart' }); return; }
    }
    // Dodge: dive on the ground while enemies are about. In the air (mid combo) it is a web pull to
    // the side and down: a short rope impulse, not a jump off nothing.
    if (intent.divePressed && grounded() && engaged.length) { startDodge(intent, engaged); return; }
    if (intent.divePressed && !grounded() && !hero.swing.active && hero.state === 'air' && engaged.length && P().y - ctx.groundBelow < 6) { startDodge(intent, engaged, true); return; }
    // A character's own special replaces the web shot (Shocker's blast, Goblin's bombs...).
    if (intent.webPressed && c.special) { c.special(camFwd); onEvent({ type: 'special' }); return; }
    // Web shot.
    if (intent.webPressed) {
      const t2 = pickTarget(P(), camFwd, enemies.list, COMBAT.webRange);
      const from = { x: P().x, y: P().y + 0.5, z: P().z };
      if (t2) {
        // Lead a moving target (a flyer at 20 m/s moves metres while the web is in the air).
        const q0 = t2.body.p, tv = t2.body.v, lead = Math.hypot(q0.x - from.x, q0.y - from.y, q0.z - from.z) / 75;
        const q = { x: q0.x + tv.x * lead, y: q0.y + tv.y * lead, z: q0.z + tv.z * lead };
        projectiles.fire('web', from, { x: q.x, y: q.y + 0.3, z: q.z }, { owner: 'hero', dmg: 0.34 });
        onEvent({ type: 'thwip', x: q.x, y: q.y, z: q.z, combat: true });
      } else {
        const d = camFwd;
        projectiles.fire('web', from, { x: from.x + d.x * 30, y: from.y + d.y * 30, z: from.z + d.z * 30 }, { owner: 'hero', dmg: 0.34 });
        onEvent({ type: 'thwip', x: from.x + d.x * 30, y: from.y + d.y * 30, z: from.z + d.z * 30, combat: true });
      }
    }
    // Yank (the hang key, when a target is near and the hero is not on a web).
    if (intent.yankPressed && tgt && near.d < COMBAT.yankRange && !hero.swing.active) {
      intent.hangPressed = false;
      // A boss decides for itself what a yank does (tug of war, too heavy, pulled out of a dive).
      if (tgt.boss) { if (tgt.boss.yank(near)) onEvent({ type: 'yank', e: tgt }); else { c.state = 'strike'; c.t = 0; onEvent({ type: 'webStrike', e: tgt }); } return; }
      const A = ARCHETYPES[tgt.arch];
      if (A.ranged && !tgt.disarmed) { tgt.disarmed = true; word('YOINK!', tgt); onEvent({ type: 'disarm', e: tgt }); enemies.hit(tgt, { dmg: 2, dir: { x: -near.x, z: -near.z }, push: 1, from: P() }); }
      else if (A.heavy) { c.state = 'strike'; c.t = 0; onEvent({ type: 'webStrike', e: tgt }); }
      else {
        applyDv(tgt.body, 'rope', -near.x * 15 - tgt.body.v.x, 4, -near.z * 15 - tgt.body.v.z);
        enemies.hit(tgt, { dmg: 3, dir: { x: -near.x, z: -near.z }, push: 0, lift: 3.5, from: P() });
        word('YANK!', tgt);
        onEvent({ type: 'yank', e: tgt });
      }
      return;
    }
    // Finisher (tap) or heal (hold) on the finisher key.
    if (intent.finisher) c.finisherHoldT += dt; else {
      if (c.finisherHoldT > 0 && c.finisherHoldT < 0.45 && c.focus >= 1 && tgt && near.d < 3.2) {
        c.focus -= 1;
        enemies.hit(tgt, { dmg: 999, dir: { x: near.x, z: near.z }, push: 10, lift: 5, from: P() });
        slowmo(0.45); hitstop(0.12);
        word('FINISHER!', tgt, 'big');
        onEvent({ type: 'finisher', e: tgt });
      }
      c.finisherHoldT = 0;
    }
    if (c.finisherHoldT > 0.6 && c.focus >= 1 && c.hp < c.maxHp) {
      c.finisherHoldT = -99;
      c.focus -= 1;
      c.hp = Math.min(c.maxHp, c.hp + COMBAT.healAmount);
      onEvent({ type: 'heal' });
      word('PATCHED UP!', null);
    }
  }

  function startAttack() {
    c.state = 'attack'; c.t = 0; c.hitDone = false; c.punchN++;
    onEvent({ type: 'punch', air: !grounded(), n: c.punchN });
  }

  function startDodge(intent, engaged, air = false) {
    // Away from the nearest attacker, sideways if the stick says so.
    let threat = null, soon = Infinity;
    for (const e of engaged) {
      if (e.state !== 'windup') continue;
      const left = e.strikeAt - e.t;
      const u = toward(e);
      const reach = (e.A.ranged && !e.disarmed) ? 40 : e.A.reach + 0.8;
      if (u.d < reach && left < soon) { soon = left; threat = e; }
    }
    const ref = threat ?? engaged.reduce((a, b) => (toward(a).d < toward(b).d ? a : b));
    const u = toward(ref);
    const m = Math.hypot(intent.moveX, intent.moveZ);
    let dx = -u.z, dz = u.x;
    if (m > 0.2) { dx = intent.moveX / m; dz = intent.moveZ / m; } else if (Math.random() < 0.5) { dx = -dx; dz = -dz; }
    const v = V();
    if (air) applyDv(hero.body, 'rope', dx * COMBAT.dodgeSpeed - v.x, Math.min(0, -4 - v.y), dz * COMBAT.dodgeSpeed - v.z);
    else applyDv(hero.body, 'surface', dx * COMBAT.dodgeSpeed - v.x, Math.max(0, 2.5 - v.y), dz * COMBAT.dodgeSpeed - v.z);
    c.state = 'dodge'; c.t = 0; c.iframes = COMBAT.iframes;
    const perfect = threat && soon < COMBAT.perfectWindow;
    if (perfect) { slowmo(COMBAT.slowmo); c.focus = Math.min(3, c.focus + COMBAT.focusPerfect); word('PERFECT DODGE!', null, 'big'); }
    onEvent({ type: 'dodge', perfect: !!perfect, dir: { x: dx, z: dz }, air });
  }

  // An enemy's hit lands on the hero (called by the enemies).
  function takeHit({ dmg, dir, from, unblockable }) {
    if (c.iframes > 0 || c.defeated) return false;
    c.hp -= dmg * (1 - c.armor);
    if (!c.keepComboOnHit) c.combo = 0;
    c.state = 'hurt'; c.t = 0;
    c.iframes = 0.5;
    const v = V();
    applyDv(hero.body, 'surface', dir.x * 6 - v.x * 0.5, 2.5, dir.z * 6 - v.z * 0.5);
    if (hero.swing.active) { hero.swing.release(); hero.state = 'air'; }
    onEvent({ type: 'heroHurt', dmg, from, unblockable });
    if (c.hp <= 0 && c.resilient && !c.resilientUsed) { c.hp = 1; c.resilientUsed = true; word('NOT TODAY!', null, 'big'); }
    if (c.hp <= 0) { c.hp = 0; c.defeated = true; slowmo(1.2); onEvent({ type: 'heroDefeated' }); }
    return true;
  }

  // Real-time effects: hitstop freezes, slow motion slows. Returns the game time scale.
  function timeScale(realDt) {
    if (c.stopT > 0) { c.stopT -= realDt; return 0.06; }
    if (c.slowT > 0) { c.slowT -= realDt; return 0.32; }
    return 1;
  }

  return {
    c, preStep, takeHit, timeScale,
    revive() { c.hp = c.maxHp; c.defeated = false; c.state = 'free'; c.combo = 0; c.iframes = 1.5; },
    get inCombat() { return enemies.engaged.length > 0; },
  };
}
