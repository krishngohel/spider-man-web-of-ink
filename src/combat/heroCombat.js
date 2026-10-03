import { applyDv } from '../physics/ledger.js';
import { pickTarget, isActive, ARCHETYPES } from './enemies.js';
import { TUNE } from './tuning.js';
import { MOVES, chooseMove, clipFor, canChain, createBuffer, clipTiming, clipTimeAt } from './moves.js';
import { planWarp } from './warp.js';
import { stopFor } from './hitstop.js';
import { beatsToPunch } from './tokens.js';
import { CLIP_DATA } from './clipData.js';

// The hero's side of a fight (spec 1.3 to 1.8). Spider-Man fights by moving: a 4-hit string with
// kicks that lands on each clip's contact frame (motion warped onto the target), a held launcher
// into an air string where both bodies hang, a web strike that rebounds, and a flip dodge that
// cancels anything but a finisher; dodging in the red window is a perfect dodge (web to the face,
// slow motion, everyone else waits). Every move uses a real source of force: legs on the ground,
// the web in the air. Numbers live in tuning.js.

// The base values; progression (skills, mods) rewrites COMBAT from these.
export const COMBAT = {
  hp: 100,
  punch: 10, comboBonus: 1.5, uppercutLift: 11, airLift: 4.6, slamDmg: 14, slamRadius: 4.5,
  strikeRange: TUNE.strikeBand, meleeRange: 2.8, webRange: 32, yankRange: 20,
  iframes: TUNE.dodgeIframes, perfectWindow: TUNE.redWindow, slowmo: TUNE.perfectSlow,
  focusPerHit: 0.09, focusPerfect: 0.4, healAmount: 38,
  regenDelay: 4, regenRate: 14,
};

export const COMBAT_BASE = { ...COMBAT };

const WORDS = ['POW!', 'THWACK!', 'BAM!', 'WHAM!', 'KRAK!', 'SMACK!'];
const KICKS = ['WHAP!', 'KRAK!', 'THOOM!', 'WHUD!'];

export function createHeroCombat({ hero, enemies, projectiles, onEvent = () => {}, clips = new Map() }) {
  const c = {
    hp: COMBAT.hp, maxHp: COMBAT.hp, focus: 0,
    state: 'free', t: 0, combo: 0, comboT: 9, target: null,
    iframes: 0, outOfCombat: 9, attackHeldT: 0, webHeldT: 0, punchN: 0,
    timeScale: 1, slowT: 0, slowKind: 'plain', finisherHoldT: 0, defeated: false, lastWord: 0,
    move: null, step: 0, airStep: 0, lastKey: '', sameRun: 0, airKeepT: 0, clock: 0,
    heroStop: 0, heroStopAll: 0, faceYaw: null,
    dmgMul: 1, // skills raise this (Plan 4)
    special: null, strikeMul: 1, comboKeep: TUNE.comboReset, armor: 0, resilient: false, resilientUsed: false, focusMul: 1, brutalMul: 1,
  };
  const buffer = createBuffer();
  const P = () => hero.body.p, V = () => hero.body.v;
  const toward = (e) => { const p = P(), q = e.body.p; const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz) || 1; return { x: dx / d, z: dz / d, d, dy: q.y - p.y }; };
  const word = (text, e, kind = 'small') => onEvent({ type: 'word', text, at: e ? e.body.p : P(), kind });
  const grounded = () => hero.state === 'ground';
  const heroYaw = () => Math.atan2(hero.facing.x, hero.facing.z);
  let G = 19.62;

  function slowmo(s, kind = 'plain') { if (s > c.slowT) { c.slowT = s; c.slowKind = kind; } }
  function face(yaw) {
    c.faceYaw = yaw;
    hero.combatYaw = yaw;
    hero.facing.x = Math.sin(yaw); hero.facing.z = Math.cos(yaw);
  }

  function landHit(e, { dmg, push, lift, kind = 'melee', heavy = false, stop = 'light' }) {
    const u = toward(e);
    const r = enemies.hit(e, { dmg: dmg * c.dmgMul, dir: { x: u.x, z: u.z }, push, lift, kind, from: P() });
    if (r.blocked) { word('CLANG!', e); onEvent({ type: 'blocked' }); return r; }
    c.combo++; c.comboT = 0;
    c.focus = Math.min(3, c.focus + COMBAT.focusPerHit * c.focusMul);
    // The last one down: a longer freeze and a beat of slow motion.
    const last = e.state === 'out' && enemies.engaged.length === 0;
    const s = stopFor(last ? 'finisher' : stop);
    c.heroStop = Math.max(c.heroStop, s); c.heroStopAll = c.heroStop;
    enemies.freeze?.(e, s);
    if (last) slowmo(0.45);
    if (c.combo % 2 === 0 || heavy) word(kind === 'kick' ? KICKS[c.combo % KICKS.length] : WORDS[(c.punchN + c.combo) % WORDS.length], e, heavy ? 'hit' : 'small');
    onEvent({ type: 'heroHit', e, heavy, kind, stop: s });
    return r;
  }

  // A move starts: pick its clip, plan its travel onto the target, beat slower enemies to it.
  function startMove(key) {
    const M = MOVES[key], tgt = c.target;
    if (hero.swing.active) { hero.swing.release(); hero.state = 'air'; }
    const clip = clipFor(M, clips);
    const dur = clips.get(clip)?.duration ?? 1;
    const tm = clipTiming(clip, dur);
    let plan = null;
    if (tgt && !M.air && !M.travel && grounded()) {
      // Root travel in game time: the clip's own (mocap) or none (Quaternius), then warped.
      const data = CLIP_DATA[clip], n = Math.max(2, Math.ceil(M.time * 60) + 1), root = [];
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1)) * M.time;
        if (!data) { root.push(0, 0); continue; }
        const ct = clipTimeAt(tm, M, t), f = Math.min(data.root.length / 2 - 1, ct * data.fps), a = Math.floor(f), b = Math.min(data.root.length / 2 - 1, a + 1), k = f - a;
        const s = Math.min(data.root.length / 2 - 1, Math.floor(tm.start * data.fps));
        root.push((data.root[a * 2] + (data.root[b * 2] - data.root[a * 2]) * k) - data.root[s * 2], (data.root[a * 2 + 1] + (data.root[b * 2 + 1] - data.root[a * 2 + 1]) * k) - data.root[s * 2 + 1]);
      }
      plan = planWarp({ root, fps: (n - 1) / M.time, contact: M.impact, duration: M.time, from: { x: P().x, z: P().z }, facing: heroYaw(), to: tgt.body.p });
    }
    c.move = { key, M, t: 0, clip, plan, hitDone: false, tgt, arrived: false };
    c.state = 'move'; c.t = 0;
    if (M.air) c.airStep++;
    else if (key === 'launcher' || key === 'strike') c.step = 0;
    else if (key !== 'throw') c.step++;
    c.sameRun = key === c.lastKey ? c.sameRun + 1 : 1;
    c.lastKey = key;
    c.punchN++;
    // Beat to the punch (PUB): a slower enemy blow near us is cancelled, unless heavy, a boss,
    // or the player keeps repeating one move.
    for (const e of enemies.engaged) {
      if (e.state !== 'windup' || e.boss) continue;
      const u = toward(e);
      if (u.d < 4 && beatsToPunch({ heroImpactIn: M.impact, enemyImpactIn: e.strikeAt - e.t, sameMoveRun: c.sameRun, heavy: !!e.A.heavy })) enemies.interrupt?.(e);
    }
    if (M.travel && grounded()) { const v = V(); applyDv(hero.body, 'surface', 0, Math.max(0, 3 - v.y), 0); hero.state = 'air'; hero.airTime = 0; }
    onEvent({ type: 'moveStart', key, clip, air: !grounded() || !!M.air, time: M.time, impact: M.impact, travel: !!M.travel, n: c.punchN });
  }

  function nextMove() {
    const tgt = c.target;
    const near = tgt ? toward(tgt) : null;
    const mv = tgt ? chooseMove({ d: near.d, dy: near.dy, step: c.step, airStep: c.airStep, grounded: grounded(), webbed: false, holdT: 0 }) : { key: grounded() ? 'jab' : 'air1' };
    if (!mv || (mv.key === 'strike' && hero.state === 'wall')) return false;
    if (grounded() && !MOVES[mv.key].air) c.airStep = 0;
    startMove(mv.key);
    return true;
  }

  function contact(m) {
    const M = m.M, tgt = m.tgt;
    const dmg = (COMBAT.punch + Math.min(8, c.combo * COMBAT.comboBonus)) * M.dmg * (m.key === 'strike' ? c.strikeMul : 1);
    let lift = M.lift;
    if (m.key === 'launcher') lift = COMBAT.uppercutLift;
    const r = landHit(tgt, { dmg, push: M.push, lift, kind: M.kick ? 'kick' : 'melee', heavy: !!M.knock || m.key === 'launcher', stop: M.stop });
    if (r.blocked) return;
    if (M.air && m.key !== 'spike') { enemies.hang?.(tgt, TUNE.airKeep); c.airKeepT = TUNE.airKeep; }
    if (m.key === 'spike') c.airKeepT = 0;
    onEvent({ type: 'contact', e: tgt, key: m.key });
  }

  function runMove(intent, dt) {
    const m = c.move, M = m.M, tgt = m.tgt;
    intent.moveX = intent.moveZ = 0;
    const t0 = m.t;
    m.t += dt;
    const alive = tgt && (isActive(tgt) || tgt.state === 'air' || tgt.state === 'stagger');
    if (m.key === 'strike') return strikeStep(m, dt);
    if (m.plan && dt > 0) {
      // Legs on the ground carry the hero along the warped root path.
      const a = m.plan.at(t0), b = m.plan.at(m.t), v = V();
      applyDv(hero.body, 'surface', (b.x - a.x) / dt - v.x, 0, (b.z - a.z) / dt - v.z);
      face(m.plan.yaw(m.t));
    } else if (alive) {
      const u = toward(tgt), want = Math.atan2(u.x, u.z), cur = c.faceYaw ?? heroYaw();
      face(cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 18));
    }
    if (M.air && alive && dt > 0) {
      // In the air: the web keeps the hero a metre off the target, level with it.
      const u = toward(tgt), v = V(), k = Math.min(1, dt * 10), gap = Math.max(0, u.d - 1.0);
      applyDv(hero.body, 'rope', (u.x * gap / 0.15 - v.x) * k, ((tgt.body.p.y - P().y) * 5 - v.y) * k, (u.z * gap / 0.15 - v.z) * k);
    }
    if (!m.hitDone && m.t >= M.impact) {
      m.hitDone = true;
      const u = alive ? toward(tgt) : null;
      if (u && u.d < COMBAT.meleeRange + 0.3 && Math.abs(u.dy) < 2.6) contact(m);
      else onEvent({ type: 'whiff' });
    }
    // Hold attack through a ground move next to a light enemy: the launcher.
    if (!M.air && m.key !== 'launcher' && m.hitDone && c.attackHeldT >= TUNE.launchHold && grounded() && alive && !tgt.boss && !tgt.A?.heavy && toward(tgt).d < 2.8) {
      c.attackHeldT = -99; startMove('launcher'); return;
    }
    if (canChain(M, m.t) && buffer.take('attack', c.clock)) {
      if (m.key === 'launcher' && m.hitDone && m.t - M.impact <= TUNE.followWindow + 0.15 && alive) {
        // Follow him up: legs push off the ground after the launched enemy.
        const v = V();
        applyDv(hero.body, 'surface', -v.x * 0.5, Math.sqrt(2 * G * TUNE.launchHeight) + 1 - Math.max(0, v.y), -v.z * 0.5);
        hero.state = 'air'; hero.airTime = 0.15;
        c.airStep = 0;
        startMove('air1');
        return;
      }
      if (nextMove()) return;
    }
    if (m.t >= M.time) { c.state = 'free'; c.move = null; }
  }

  function strikeStep(m, dt) {
    // Web strike: a web to the target and a hard pull along it, ending in a flying kick and a
    // rebound up and back off his body (Web of Shadows).
    const tgt = m.tgt;
    if (!tgt || !(isActive(tgt) || tgt.state === 'air')) { c.state = 'free'; c.move = null; onEvent({ type: 'strikeEnd' }); return; }
    const q = tgt.body.p, p = P(), dx = q.x - p.x, dy = q.y + 0.3 - p.y, dz = q.z - p.z, d = Math.hypot(dx, dy, dz) || 1;
    if (!m.arrived) {
      const v = V(), s = TUNE.strikeSpeed, k = Math.min(1, dt * 14);
      applyDv(hero.body, 'rope', (dx / d * s - v.x) * k, (dy / d * s - v.y) * k, (dz / d * s - v.z) * k);
      face(Math.atan2(dx, dz));
      onEvent({ type: 'strikeLine', from: p, to: q });
      if (d < TUNE.strikeStop + 0.5 || m.t > 1.0) {
        m.arrived = true; m.arrivedAt = m.t;
        onEvent({ type: 'strikeArrive' });
        if (d < TUNE.strikeStop + 1.5) contact(m);
        const v2 = V(), hl = Math.hypot(dx, dz) || 1;
        applyDv(hero.body, 'surface', -dx / hl * 4 - v2.x, Math.sqrt(2 * G * TUNE.rebound) - v2.y, -dz / hl * 4 - v2.z);
        hero.state = 'air';
        onEvent({ type: 'strikeEnd' });
      }
    } else if (m.t - m.arrivedAt > 0.3) { c.state = 'free'; c.move = null; }
    // A buffered press after the rebound chains into the next strike or air hit.
    if (m.arrived && m.t - m.arrivedAt > 0.15 && buffer.take('attack', c.clock)) nextMove();
  }

  // Pre-step: read the combat inputs, start moves, and steer the hero's intent while a move runs.
  function preStep(intent, dt, ctx) {
    const { camFwd } = intent;
    if (ctx.g) G = ctx.g;
    // Frozen in a hitstop: nothing of the hero's advances (the world still does).
    const live = c.heroStop > 0 ? 0 : dt;
    c.clock += dt;
    c.t += live;
    c.comboT += live;
    if (c.comboT > c.comboKeep) c.combo = 0;
    c.iframes = Math.max(0, c.iframes - live);
    const engaged = enemies.engaged;
    const fight = engaged.length > 0;
    c.outOfCombat = fight ? 0 : c.outOfCombat + dt;
    if (c.outOfCombat > COMBAT.regenDelay) { c.hp = Math.min(c.maxHp, c.hp + COMBAT.regenRate * dt); c.resilientUsed = false; }
    // Keep a target while it is valid and near; else pick the one the stick or camera points at.
    if (!c.target || !isActive(c.target) || toward(c.target).d > COMBAT.strikeRange + 4) c.target = null;
    const pick = pickTarget(P(), camFwd, enemies.list, COMBAT.strikeRange, { x: intent.moveX, z: intent.moveZ });
    if (pick && (!c.target || c.state === 'free')) c.target = pick;
    const tgt = c.target;
    const near = tgt ? toward(tgt) : null;

    if (c.defeated) { intent.moveX = intent.moveZ = 0; return; }
    if (intent.attackPressed) {
      buffer.press('attack', c.clock);
      // The next attack ends a perfect dodge's slow motion early.
      if (c.slowKind === 'perfect' && c.slowT > TUNE.perfectRamp) c.slowT = TUNE.perfectRamp;
    }
    if (intent.divePressed && fight) buffer.press('dodge', c.clock);
    if (intent.attack) c.attackHeldT += live; else c.attackHeldT = 0;
    if (intent.web) c.webHeldT += live; else c.webHeldT = 0;
    if (!fight) c.faceYaw = null;
    if (c.airKeepT > 0) {
      // The air string: hits keep both bodies hanging.
      c.airKeepT -= live;
      if (!grounded() && !hero.swing.active) { const v = V(); applyDv(hero.body, 'assist', 0, -v.y * Math.min(1, live * 14) + G * live * 0.85, 0); }
    }

    // The dodge cancels anything but a finisher (PUB).
    if (fight && c.state !== 'dodge' && buffer.take('dodge', c.clock)) { startDodge(intent, engaged); return; }

    // Moves in progress -------------------------------------------------------------------------
    if (c.state === 'move') { runMove(intent, live); return; }
    if (c.state === 'slam') {
      intent.moveX = intent.moveZ = 0;
      if (grounded()) {
        c.state = 'free';
        onEvent({ type: 'slam', at: { ...P() } });
        for (const e of enemies.active) {
          const u = toward(e);
          if (u.d < COMBAT.slamRadius && Math.abs(u.dy) < 2.5) landHit(e, { dmg: COMBAT.slamDmg, push: 9, lift: 2, kind: 'slam', heavy: true, stop: 'ender' });
        }
        word('KRAKOOM!', null, 'hit');
      } else { const v = V(); if (v.y > -26) applyDv(hero.body, 'assist', 0, Math.max(-60 * live, -26 - v.y), 0); }
      return;
    }
    if (c.state === 'dodge') {
      if (c.t < TUNE.dodgeTime * 0.7) intent.moveX = intent.moveZ = 0;
      if (c.t > TUNE.dodgeTime) c.state = 'free';
      return;
    }
    if (c.state === 'hurt') {
      intent.moveX = intent.moveZ = 0;
      if (c.t > 0.32) c.state = 'free';
      return;
    }

    // Starting moves ------------------------------------------------------------------------------
    // Hold attack on the ground next to a light target: the launcher.
    if (c.attackHeldT >= TUNE.launchHold && grounded() && tgt && near.d < 2.8 && !tgt.boss && !tgt.A?.heavy) {
      c.attackHeldT = -99; buffer.clear(); startMove('launcher'); return;
    }
    // A silent takedown on a guard who has not seen you.
    if (intent.attackPressed && enemies.takedownTarget) {
      const td = enemies.takedownTarget(hero);
      if (td) {
        buffer.clear();
        const q = td.e.body.p, p = P();
        if (td.kind === 'perch') { const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, d = Math.hypot(dx, dy, dz) || 1; applyDv(hero.body, 'rope', (dx / d) * 16 - V().x, (dy / d) * 16 - V().y, (dz / d) * 16 - V().z); }
        enemies.takedown(td.e, td.kind);
        word(td.kind === 'hang' ? 'YOINK!' : td.kind === 'perch' ? 'THWIP!' : 'SHH!', td.e, 'small');
        c.focus = Math.min(3, c.focus + 0.25);
        return;
      }
    }
    // From height over enemies: attack (or hold web) drives down into a ground strike.
    const ground = ctx.groundBelow;
    const height = P().y - ground;
    const below = !grounded() && !hero.swing.active && height > 2.5 && enemies.active.some((e) => { const u = toward(e); return u.d < 8 && u.dy < -1.5; });
    if (below && (c.webHeldT >= TUNE.launchHold || (buffer.peek('attack', c.clock) && (!tgt || near.dy < -1.5)))) {
      buffer.clear(); c.webHeldT = -99;
      c.state = 'slam'; c.t = 0; onEvent({ type: 'slamStart' }); return;
    }
    if (buffer.take('attack', c.clock)) {
      if (tgt) {
        const mv = chooseMove({ d: near.d, dy: near.dy, step: c.step, airStep: c.airStep, grounded: grounded(), webbed: false, holdT: 0 });
        if (mv && !(mv.key === 'strike' && hero.state === 'wall')) {
          if (grounded() && !MOVES[mv.key].air) c.airStep = 0;
          startMove(mv.key);
          return;
        }
      }
      if (!grounded() && !hero.swing.active) { onEvent({ type: 'airTrick' }); return; }
      if (grounded()) { startMove('jab'); return; }
    }
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
      if (tgt.boss) { if (tgt.boss.yank(near)) onEvent({ type: 'yank', e: tgt }); else startMove('strike'); return; }
      const A = ARCHETYPES[tgt.arch];
      if (A.ranged && !tgt.disarmed) { tgt.disarmed = true; word('YOINK!', tgt); onEvent({ type: 'disarm', e: tgt }); enemies.hit(tgt, { dmg: 2, dir: { x: -near.x, z: -near.z }, push: 1, from: P() }); }
      else if (A.heavy) startMove('strike');
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
        const s = stopFor('finisher');
        c.heroStop = Math.max(c.heroStop, s); c.heroStopAll = c.heroStop; enemies.freeze?.(tgt, s);
        slowmo(0.45);
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

  function startDodge(intent, engaged) {
    // Away from the soonest attacker, sideways unless the stick says otherwise.
    let threat = null, soon = Infinity;
    for (const e of engaged) {
      if (e.state !== 'windup') continue;
      const left = e.strikeAt - e.t;
      const u = toward(e);
      const reach = (e.A.ranged && !e.disarmed) ? 40 : e.A.reach + 1.2;
      if (u.d < reach && left < soon) { soon = left; threat = e; }
    }
    const ref = threat ?? engaged.reduce((a, b) => (toward(a).d < toward(b).d ? a : b));
    const u = toward(ref);
    const m = Math.hypot(intent.moveX, intent.moveZ);
    let dx = -u.z, dz = u.x;
    if (m > 0.2) { dx = intent.moveX / m; dz = intent.moveZ / m; } else if (Math.random() < 0.5) { dx = -dx; dz = -dz; }
    // A move in progress is dropped (every move but a finisher cancels into a dodge).
    c.move = null; c.airKeepT = 0;
    const v = V(), sp = TUNE.dodgeDist / TUNE.dodgeTime;
    const air = !grounded();
    if (air) applyDv(hero.body, 'rope', dx * sp - v.x, Math.max(0, 2 - v.y), dz * sp - v.z);
    else {
      // A flip or vault: off the ground for the whole dodge.
      applyDv(hero.body, 'surface', dx * sp - v.x, G * TUNE.dodgeTime / 2 - Math.max(0, v.y), dz * sp - v.z);
      hero.state = 'air'; hero.airTime = 0;
    }
    // Dodging a telegraphed blow clears that blow: covered until it has landed (at most 0.5 s),
    // however early in the windup the dodge came.
    c.state = 'dodge'; c.t = 0; c.iframes = threat ? Math.max(COMBAT.iframes, Math.min(0.5, soon + 0.08)) : COMBAT.iframes;
    enemies.tokens?.holdAll(TUNE.dodgeHold);
    const perfect = !!threat && soon <= COMBAT.perfectWindow + 1 / 60;
    // Which side relative to where the hero faces (the poser picks the flip).
    const side = dx * hero.facing.z - dz * hero.facing.x > 0 ? 'l' : 'r';
    if (perfect) {
      slowmo(COMBAT.slowmo, 'perfect');
      c.focus = Math.min(3, c.focus + COMBAT.focusPerfect);
      word('PERFECT DODGE!', null, 'big');
      // The counter: a web to the attacker's face.
      const from = { x: P().x, y: P().y + 0.6, z: P().z }, q = threat.body.p;
      projectiles.fire('web', from, { x: q.x, y: q.y + 0.7, z: q.z }, { owner: 'hero', dmg: 0 });
      if (!threat.boss) enemies.stun?.(threat, TUNE.perfectStun);
      onEvent({ type: 'perfectCounter', e: threat });
    }
    onEvent({ type: 'dodge', perfect, dir: { x: dx, z: dz }, air, side });
  }

  // An enemy's hit lands on the hero (called by the enemies).
  function takeHit({ dmg, dir, from, unblockable }) {
    if (c.iframes > 0 || c.defeated) return false;
    c.hp -= dmg * (1 - c.armor);
    if (!c.keepComboOnHit) c.combo = 0;
    c.state = 'hurt'; c.t = 0; c.move = null; c.airKeepT = 0;
    c.iframes = 0.5;
    const v = V();
    applyDv(hero.body, 'surface', dir.x * 6 - v.x * 0.5, 2.5, dir.z * 6 - v.z * 0.5);
    if (hero.swing.active) { hero.swing.release(); hero.state = 'air'; }
    onEvent({ type: 'heroHurt', dmg, from, unblockable });
    if (c.hp <= 0 && c.resilient && !c.resilientUsed) { c.hp = 1; c.resilientUsed = true; word('NOT TODAY!', null, 'big'); }
    if (c.hp <= 0) { c.hp = 0; c.defeated = true; slowmo(1.2); onEvent({ type: 'heroDefeated' }); }
    return true;
  }

  // Real-time effects: the hero's hitstop runs down in real time; slow motion slows the world.
  // A perfect dodge's slow motion eases back to full speed over its last 0.15 s.
  function timeScale(realDt) {
    c.heroStop = Math.max(0, c.heroStop - realDt);
    if (c.slowT > 0) {
      c.slowT -= realDt;
      const base = c.slowKind === 'perfect' ? TUNE.perfectScale : 0.32;
      if (c.slowKind === 'perfect' && c.slowT < TUNE.perfectRamp) return base + (1 - base) * (1 - Math.max(0, c.slowT) / TUNE.perfectRamp);
      return base;
    }
    return 1;
  }

  return {
    c, preStep, takeHit, timeScale,
    revive() { c.hp = c.maxHp; c.defeated = false; c.state = 'free'; c.combo = 0; c.iframes = 1.5; c.move = null; },
    // Down at once whatever the iframes (a poison clock running out), with the usual defeat event.
    knockOut() { if (c.defeated) return; c.hp = 0; c.defeated = true; slowmo(1.2); onEvent({ type: 'heroDefeated' }); },
    get inCombat() { return enemies.engaged.length > 0; },
  };
}
