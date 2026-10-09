import { applyDv } from '../physics/ledger.js';
import { pickTarget, pickMeleeTarget, isActive, ARCHETYPES } from './enemies.js';
import { TUNE } from './tuning.js';
import { MOVES, GROUND_FINISHERS, chooseMove, clipFor, canChain, createBuffer, clipTiming, clipTimeAt } from './moves.js';
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
  webShot: 0, senseRange: 0, // skills: extra web per shot (Sticky Webs), metres of spider-sense (Wider Sense)
};

export const COMBAT_BASE = { ...COMBAT };

const WORDS = ['POW!', 'THWACK!', 'BAM!', 'WHAM!', 'KRAK!', 'SMACK!'];
const KICKS = ['WHAP!', 'KRAK!', 'THOOM!', 'WHUD!'];

export function createHeroCombat({ hero, enemies, projectiles, onEvent = () => {}, clips = new Map(), props = null }) {
  const c = {
    hp: COMBAT.hp, maxHp: COMBAT.hp, focus: 0,
    state: 'free', t: 0, combo: 0, comboT: 9, target: null,
    iframes: 0, outOfCombat: 9, attackHeldT: 0, webHeldT: 0, punchN: 0,
    timeScale: 1, slowT: 0, slowKind: 'plain', finisherHoldT: 0, finIdx: 0, defeated: false, lastWord: 0,
    webAmmo: TUNE.webCap, webRefillT: 0,
    move: null, step: 0, airStep: 0, lastKey: '', sameRun: 0, mash: 0, lastMoveAt: -9, lastMoveEnd: -9, airKeepT: 0, clock: 0, hclock: 0, counterUntil: -9, counterTgt: null, recent: [], used: {}, attackAt: -9, webAt: -9, stick: { x: 0, z: 0 }, camFwd: { x: 0, y: 0, z: 1 },
    heroStop: 0, heroStopAll: 0, faceYaw: null,
    // Mods and stealth skills (set by the progression runtime).
    webMul: 1, webRangeBonus: 0, heavyMul: 1, senseEarly: false, stealthFx: {},
    dmgMul: 1, // skills raise this (Plan 4)
    special: null, strikeMul: 1, comboKeep: TUNE.comboReset, armor: 0, resilient: false, resilientUsed: false, focusMul: 1, brutalMul: 1,
  };
  const buffer = createBuffer();
  const P = () => hero.body.p, V = () => hero.body.v;
  const toward = (e) => { const p = P(), q = e.body.p; const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz) || 1; return { x: dx / d, z: dz / d, d, dy: q.y - p.y }; };
  const word = (text, e, kind = 'small') => onEvent({ type: 'word', text, at: e ? e.body.p : P(), kind });
  const grounded = () => hero.state === 'ground';
  // On the ground, or about to be (falling within 0.6 m of it): a press here means a ground move.
  const nearGround = () => grounded() || (groundHere != null && P().y - 0.9 - groundHere < 0.6 && V().y <= 0.5);
  const heroYaw = () => Math.atan2(hero.facing.x, hero.facing.z);
  let G = 19.62;
  let groundAt = null, groundHere = 0;
  let finisherSlowmo = true;

  // Why a move did not work (spec 1.7), at most once every 6 s per hint.
  const hintAt = new Map();
  function hint(text) {
    if (c.clock - (hintAt.get(text) ?? -99) < 6) return;
    hintAt.set(text, c.clock);
    onEvent({ type: 'hint', text });
  }

  function slowmo(s, kind = 'plain') { if (s > c.slowT) { c.slowT = s; c.slowKind = kind; } }
  function face(yaw) {
    c.faceYaw = yaw;
    hero.combatYaw = yaw;
    hero.facing.x = Math.sin(yaw); hero.facing.z = Math.cos(yaw);
  }

  function landHit(e, { dmg, push, lift, kind = 'melee', heavy = false, stop = 'light' }) {
    const u = toward(e);
    const r = enemies.hit(e, { dmg: dmg * c.dmgMul * (e.A?.heavy ? c.heavyMul : 1), dir: { x: u.x, z: u.z }, push, lift, kind, from: P(), noInterrupt: c.sameRun >= TUNE.sameMoveLimit });
    if (r.ignored) return r;
    if (r.blocked) { word('CLANG!', e); onEvent({ type: 'blocked' }); if (e.arch === 'shield') hint('SHIELD UP: JUMP AT HIM TO VAULT OVER, OR YANK THE SHIELD AWAY'); return r; }
    c.combo++; c.comboT = 0;
    // Variety pays: four different moves in the last six fill focus half as fast again; the same
    // string over and over fills it at half speed.
    const kinds = new Set(c.recent).size;
    const style = kinds >= 4 ? 1.5 : c.mash > 4 ? 0.5 : 1;
    c.focus = Math.min(3, c.focus + COMBAT.focusPerHit * c.focusMul * style);
    // The last one down: a longer freeze and a beat of slow motion.
    const last = e.hp <= 0 && enemies.engaged.length === 0;
    const s = stopFor(last ? 'finisher' : stop);
    c.heroStop = Math.max(c.heroStop, s); c.heroStopAll = c.heroStop;
    enemies.freeze?.(e, s);
    if (last) slowmo(0.45);
    if (heavy) word(kind === 'kick' ? KICKS[c.combo % KICKS.length] : WORDS[(c.punchN + c.combo) % WORDS.length], e, heavy ? 'hit' : 'small');
    // ko: this blow put him down; counter: the counter after a perfect dodge (impact frames, tier 2).
    onEvent({ type: 'heroHit', e, heavy, kind, stop: s, ko: e.hp <= 0, counter: c.move?.key === 'counter' && !!c.counterPerfect });
    return r;
  }

  // A move starts: pick its clip, plan its travel onto the target, beat slower enemies to it.
  function startMove(key) {
    const M = MOVES[key], tgt = c.target;
    if (hero.swing.active) { hero.swing.release(); hero.state = 'air'; }
    const clip = clipFor(M, clips, c.used[key] ?? 0);
    const dur = clips.get(clip)?.duration ?? 1;
    const tm = clipTiming(clip, dur);
    let plan = null;
    if (tgt && !M.air && !M.travel && !M.noWarp && grounded()) {
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
    // Mashing: the ground string pressed on and on with nothing else (no dodge, web, launcher or
    // air move) counts as repeating one move; a full string of 4 is fine, more is mashing.
    const plain = !M.air && !M.travel && key !== 'launcher' && key !== 'throw';
    c.mash = plain && c.clock - c.lastMoveAt < 1.2 ? c.mash + 1 : plain ? 1 : 0;
    c.lastMoveAt = c.clock;
    c.sameRun = c.mash > 4 ? 3 : 1;
    c.lastKey = key;
    c.punchN++;
    c.recent.push(key); if (c.recent.length > 6) c.recent.shift();
    c.used[key] = (c.used[key] ?? 0) + 1;
    if (M.finisher && key !== 'finisher') c.used.finisher = (c.used.finisher ?? 0) + 1; // every finisher counts as one
    if (M.name) word(M.name, tgt, 'hit');
    if (key === 'pull' && tgt) {
      // The web pull: he flies in to arrive at the hero's fists on the impact frame.
      const u = toward(tgt), gap = Math.max(0, u.d - 1.1), v = tgt.body.v;
      enemies.airborne?.(tgt);
      applyDv(tgt.body, 'rope', -u.x * gap / M.impact - v.x, G * (M.impact + 0.1) / 2 - v.y, -u.z * gap / M.impact - v.z);
      onEvent({ type: 'thwip', x: tgt.body.p.x, y: tgt.body.p.y, z: tgt.body.p.z, combat: true });
    }
    // Beat to the punch (PUB): a slower blow from the enemy we are hitting is cancelled, unless
    // it is heavy, a boss, or the player is mashing.
    if (tgt && !tgt.boss && tgt.state === 'windup' && toward(tgt).d < 4 && beatsToPunch({ heroImpactIn: M.impact, enemyImpactIn: tgt.strikeAt - tgt.t, sameMoveRun: c.sameRun, heavy: !!tgt.A.heavy })) enemies.interrupt?.(tgt);
    if (key === 'strike' && tgt?.stealth && !tgt.alerted && c.stealthFx.strikeTakedown && isActive(tgt)) {
      enemies.takedown(tgt, 'strike');
      c.focus = Math.min(3, c.focus + 0.25 + (c.stealthFx.focusOnTakedown ?? 0));
      word('THWIP!', tgt, 'small');
    }
    if (key === 'strike') onEvent({ type: 'webStrike', e: tgt });
    if (key === 'launcher') onEvent({ type: 'uppercut' });
    if (M.travel && grounded()) { const v = V(); applyDv(hero.body, 'surface', 0, Math.max(0, 3 - v.y), 0); hero.state = 'air'; hero.airTime = 0; }
    onEvent({ type: 'moveStart', key, clip, air: !grounded() || !!M.air, time: M.time, impact: M.impact, travel: !!M.travel, n: c.punchN });
  }

  // Which combo move an attack press means, if any (else the plain string): a counter right after a
  // dodge, a web pull on a thug just webbed out of reach, a sweep after a pause in the string, a
  // back kick while steering away from the thug at your back.
  function comboMove(tgt, near, gap, stepBefore) {
    if (!grounded() && !nearGround()) return null;
    const ct = c.counterTgt;
    if (ct && c.clock < c.counterUntil && isActive(ct) && toward(ct).d < 6) { c.target = ct; c.counterUntil = -9; return 'counter'; }
    if (!tgt || tgt.boss) return null;
    if (tgt.webAgo < TUNE.pullWindow && near.d > 2.6 && near.d < 12 && !tgt.A?.heavy && tgt.state !== 'webbed') return 'pull';
    if (stepBefore >= 2 && gap >= TUNE.pauseFrom && gap <= TUNE.pauseTo && near.d < 3) { c.step = 0; return 'sweep'; }
    // Steering away from a thug at your back while you attack: kick back at him without turning.
    const sl = Math.hypot(c.stick.x, c.stick.z);
    if (near.d < 2.8 && sl > 0.3 && (c.stick.x * near.x + c.stick.z * near.z) / sl < -0.5) return 'backKick';
    return null;
  }

  function webbedNear() {
    let best = null, bd = TUNE.throwReach;
    for (const e of enemies.list) {
      if (!e.alive || e.state !== 'webbed' || e.boss || e.puppet || e.isPlayer) continue;
      const d = toward(e).d;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function nextMove() {
    // A string flows between thugs: the stick pushed at another one moves the next hit to him.
    if (Math.hypot(c.stick.x, c.stick.z) > 0.3) c.target = pickMeleeTarget(P(), c.camFwd, enemies.list, COMBAT.strikeRange, c.stick, c.target) ?? c.target;
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
    if (M.finisher) {
      const u = toward(tgt);
      if (M.fin === 'web') webFling(tgt, u.x * M.push, M.lift, u.z * M.push);
      else enemies.hit(tgt, { dmg: 999, dir: { x: u.x, z: u.z }, push: M.push, lift: M.lift, from: P() });
      const s = stopFor('finisher');
      c.heroStop = Math.max(c.heroStop, s); c.heroStopAll = c.heroStop; enemies.freeze?.(tgt, s);
      if (finisherSlowmo) slowmo(0.4);
      word(M.name ?? 'FINISHER!', tgt, 'big');
      onEvent({ type: 'finisher', e: tgt });
      return;
    }
    if (M.aoe) {
      for (const e of enemies.active) {
        const u = toward(e);
        if (e.boss || u.d > M.aoe || Math.abs(u.dy) > 1.6) continue;
        landHit(e, { dmg, push: M.push, lift: 0, kind: 'sweep', heavy: true, stop: M.stop });
      }
      onEvent({ type: 'contact', e: tgt, key: m.key });
      return;
    }
    const r = landHit(tgt, { dmg, push: M.push, lift, kind: M.kick ? 'kick' : 'melee', heavy: !!M.knock || m.key === 'launcher' || m.key === 'pull', stop: M.stop });
    if (r.blocked) return;
    // Air Juggler (a skill raising airLift) keeps them up longer.
    const keep = TUNE.airKeep * (COMBAT.airLift / COMBAT_BASE.airLift);
    if (M.air && m.key !== 'spike' && !tgt.boss) { enemies.hang?.(tgt, keep); c.airKeepT = keep; }
    if (m.key === 'spike') c.airKeepT = 0;
    onEvent({ type: 'contact', e: tgt, key: m.key });
  }

  function runMove(intent, dt) {
    const m = c.move, M = m.M, tgt = m.tgt;
    intent.moveX = intent.moveZ = 0;
    const t0 = m.t;
    m.t += dt;
    const alive = tgt && (isActive(tgt) || (!(tgt.hp <= 0) && (tgt.state === 'air' || tgt.state === 'stagger')));
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
      else { onEvent({ type: 'whiff' }); if (M.finisher) c.focus = Math.min(3, c.focus + 1); }
    }
    // Hold attack through a ground move next to a light enemy: the launcher.
    if (!M.finisher && !M.air && m.key !== 'launcher' && m.hitDone && c.attackHeldT >= TUNE.launchHold && grounded() && alive && !tgt.boss && !tgt.A?.heavy && toward(tgt).d < 2.8) {
      c.attackHeldT = -99; startMove('launcher'); return;
    }
    if (!M.finisher && canChain(M, m.t) && buffer.take('attack', c.hclock)) {
      if ((m.key === 'launcher' || m.key === 'pull') && m.hitDone && m.t - M.impact <= TUNE.followWindow + 0.15 && alive) {
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
    if (!M.finisher && !M.air && m.hitDone && m.t > M.impact + 0.08 && alive) {
      const sl = Math.hypot(c.stick.x, c.stick.z), u = toward(tgt);
      if (sl > 0.5 && (c.stick.x * u.x + c.stick.z * u.z) / sl < -0.17) { c.state = 'free'; c.move = null; c.lastMoveEnd = c.clock; return; }
    }
    if (m.t >= M.time) { c.state = 'free'; c.move = null; c.lastMoveEnd = c.clock; }
  }

  function strikeStep(m, dt) {
    // Web strike: a web to the target and a hard pull along it, ending in a flying kick and a
    // rebound up and back off his body (Web of Shadows).
    const tgt = m.tgt;
    if (!tgt || !(isActive(tgt) || tgt.state === 'air')) { c.state = 'free'; c.move = null; onEvent({ type: 'strikeEnd' }); onEvent({ type: 'moveAbort' }); return; }
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
    if (m.arrived && m.t - m.arrivedAt > 0.15 && buffer.take('attack', c.hclock)) nextMove();
  }

  // Pre-step: read the combat inputs, start moves, and steer the hero's intent while a move runs.
  function preStep(intent, dt, ctx) {
    const { camFwd } = intent;
    if (ctx.g) G = ctx.g;
    // Frozen in a hitstop: nothing of the hero's advances (the world still does).
    const live = c.heroStop > 0 ? 0 : dt;
    c.clock += dt;
    c.hclock += live; // the input buffer runs in hero time, so a hitstop never eats a press
    c.t += live;
    c.comboT += live;
    if (c.comboT > c.comboKeep) c.combo = 0;
    c.iframes = Math.max(0, c.iframes - live);
    const engaged = enemies.engaged;
    const fight = engaged.length > 0;
    c.outOfCombat = fight ? 0 : c.outOfCombat + dt;
    if (c.outOfCombat > COMBAT.regenDelay) { c.hp = Math.min(c.maxHp, c.hp + COMBAT.regenRate * dt); c.resilientUsed = false; }
    // Web cartridges refill one at a time.
    if (c.webAmmo < TUNE.webCap) { c.webRefillT += dt; if (c.webRefillT >= TUNE.webRefill) { c.webRefillT = 0; c.webAmmo++; } } else c.webRefillT = 0;
    // The target (fix spec A1): kept while valid and near, re-picked whenever the hero is free
    // (and at every chain point, in nextMove) from the stick, then nearness, then the camera.
    c.stick.x = intent.moveX; c.stick.z = intent.moveZ; c.camFwd = camFwd;
    if (!c.target || !isActive(c.target) || toward(c.target).d > COMBAT.strikeRange + 4) c.target = null;
    const repick = () => { c.target = pickMeleeTarget(P(), camFwd, enemies.list, COMBAT.strikeRange, c.stick, c.target) ?? c.target; };
    if (c.state === 'free' || !c.target) repick();
    let tgt = c.target;
    let near = tgt ? toward(tgt) : null;

    if (c.defeated) { intent.moveX = intent.moveZ = 0; return; }
    if (intent.webPressed) c.webAt = c.clock;
    if (intent.attackPressed) c.attackAt = c.clock;
    // Both buttons together on a long combo: the web blast webs everyone around (spends the combo).
    if ((intent.attackPressed || intent.webPressed) && intent.attack && intent.web && Math.abs(c.attackAt - c.webAt) < 0.08 && c.combo >= TUNE.blastCombo && !c.defeated) {
      let n = 0;
      for (const e of enemies.active) { const u = toward(e); if (!e.boss && u.d < TUNE.blastRadius && Math.abs(u.dy) < 3) { enemies.hit(e, { kind: 'web', dmg: 0.6 }); n++; } }
      c.combo = 0; c.attackAt = c.webAt = -9; buffer.clear(); intent.webPressed = false; intent.attackPressed = false;
      c.used.blast = (c.used.blast ?? 0) + 1;
      word('WEB BLAST!', null, 'big');
      onEvent({ type: 'webBlast', at: { ...P() }, n });
    }
    if (intent.attackPressed) {
      buffer.press('attack', c.hclock);
      // The next attack ends a perfect dodge's slow motion early.
      if (c.slowKind === 'perfect' && c.slowT > TUNE.perfectRamp) c.slowT = TUNE.perfectRamp;
    }
    // A dodge needs a fight nearby, or an attack on its way (a shot or a dive from far off).
    const close = engaged.some((e) => toward(e).d < 15 + COMBAT.senseRange || (e.state === 'windup' && toward(e).d < 45 + COMBAT.senseRange));
    hero.fightClose = close; // dive is a dodge here, not a wall dash
    const sensed = engaged.some((e) => e.state === 'windup' && (!e.atBody || e.atBody === hero.body));
    if (intent.divePressed && close && (['ground', 'air', 'wall'].includes(hero.state) || (sensed && (hero.state === 'swing' || hero.state === 'hang')))) buffer.press('dodge', c.hclock);
    groundAt = ctx.groundAt ?? null;
    finisherSlowmo = ctx.finisherSlowmo !== false;
    groundHere = ctx.groundBelow;
    if (intent.attack) c.attackHeldT += live; else c.attackHeldT = 0;
    if (intent.web) c.webHeldT += live; else c.webHeldT = 0;
    if (!fight) c.faceYaw = null;
    if (c.airKeepT > 0) {
      // The air string: hits keep both bodies hanging.
      c.airKeepT -= live;
      if (!grounded() && !hero.swing.active) { const v = V(); applyDv(hero.body, 'assist', 0, -v.y * Math.min(1, live * 14) + G * live * 0.85, 0); }
    }

    // The dodge cancels anything but a finisher (PUB).
    if (fight && (c.state !== 'dodge' || c.t > 0.3) && !c.move?.M.finisher && buffer.take('dodge', c.hclock)) { startDodge(intent, engaged); return; }

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
      // An attack pressed during the dodge comes out as soon as the feet are down (never as an air
      // kick off the flip, which floored the thug: review fix).
      if (c.t > TUNE.dodgeTime || (c.t > 0.25 && nearGround() && buffer.peek('attack', c.hclock))) { c.state = 'free'; repick(); tgt = c.target; near = tgt ? toward(tgt) : null; }
      else return;
    }
    if (c.state === 'hurt') {
      intent.moveX = intent.moveZ = 0;
      if (c.t > 0.32 || (c.t > 0.2 && nearGround() && buffer.peek('attack', c.hclock))) { c.state = 'free'; repick(); tgt = c.target; near = tgt ? toward(tgt) : null; }
      else return;
    }

    // Starting moves ------------------------------------------------------------------------------
    // Hold attack on the ground next to a light target: the launcher.
    if (c.attackHeldT >= TUNE.launchHold && grounded() && tgt && near.d < 2.8 && !tgt.boss && !tgt.A?.heavy) {
      c.attackHeldT = -99; buffer.clear(); startMove('launcher'); return;
    }
    if (c.attackHeldT >= TUNE.launchHold && tgt?.A?.heavy && !tgt.boss && near.d < 2.8) { c.attackHeldT = -99; hint('TOO HEAVY TO LAUNCH: WEB HIM, THEN HIT'); }
    if (intent.attackPressed && tgt?.A?.flies && grounded() && near.dy > 2.5) hint('HE IS UP THERE: WEB STRIKE UP TO HIM');
    // A silent takedown on a guard who has not seen you.
    if (intent.attackPressed && enemies.takedownTarget) {
      const td = enemies.takedownTarget(hero);
      if (td) {
        buffer.clear();
        const q = td.e.body.p, p = P();
        if (td.kind === 'perch') { const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, d = Math.hypot(dx, dy, dz) || 1; applyDv(hero.body, 'rope', (dx / d) * 16 - V().x, (dy / d) * 16 - V().y, (dz / d) * 16 - V().z); }
        enemies.takedown(td.e, td.kind, { silent: td.kind === 'perch' && !!c.stealthFx.silentPerch });
        c.focus = Math.min(3, c.focus + (c.stealthFx.focusOnTakedown ?? 0));
        word(td.kind === 'hang' ? 'YOINK!' : td.kind === 'perch' ? 'THWIP!' : 'SHH!', td.e, 'small');
        c.focus = Math.min(3, c.focus + 0.25);
        return;
      }
    }
    // From height over enemies: attack (or hold web) drives down into a ground strike.
    const ground = ctx.groundBelow;
    const height = P().y - ground;
    const below = !grounded() && !hero.swing.active && height > 2.5 && enemies.active.some((e) => { const u = toward(e); return u.d < 8 && u.dy < -1.5; });
    if (below && (c.webHeldT >= TUNE.launchHold || (buffer.peek('attack', c.hclock) && (!tgt || near.dy < -1.5)))) {
      buffer.clear(); c.webHeldT = -99;
      c.state = 'slam'; c.t = 0; onEvent({ type: 'slamStart' }); return;
    }
    // A shield thug facing you: jump at him to vault over onto his back (his shield is no use then).
    const stickToward = Math.hypot(c.stick.x, c.stick.z) > 0.3 && tgt && (c.stick.x * near.x + c.stick.z * near.z) / Math.hypot(c.stick.x, c.stick.z) > 0.5;
    const shieldFacing = tgt && Math.sin(tgt.facing) * -near.x + Math.cos(tgt.facing) * -near.z > 0.3;
    if (intent.jumpPressed && grounded() && tgt?.arch === 'shield' && !tgt.shieldBroken && near.d < 3.4 && isActive(tgt) && tgt.alerted && stickToward && shieldFacing) {
      const q = tgt.body.p, land = { x: q.x + near.x * 1.6, z: q.z + near.z * 1.6 };
      // A high arc (about 2 m up) so the body clears his head and shield.
      const T = 0.72, v = V();
      applyDv(hero.body, 'surface', (land.x - P().x) / T - v.x, G * T / 2 - v.y + 1.5, (land.z - P().z) / T - v.z);
      hero.state = 'air'; hero.airTime = 0;
      intent.jumpPressed = false; intent.jump = false;
      c.iframes = Math.max(c.iframes, T);
      c.used.vault = (c.used.vault ?? 0) + 1;
      word('HUP!', null, 'small');
      onEvent({ type: 'vault', e: tgt });
      return;
    }
    // Attack while swinging near a thug: a swing kick, off the web and feet first into him.
    if (hero.swing.active && tgt && !tgt.boss && near.d < 12 && buffer.take('attack', c.hclock)) {
      c.used.swingKick = (c.used.swingKick ?? 0) + 1;
      startMove('strike');
      word('SWING KICK!', tgt, 'hit');
      return;
    }
    if (buffer.take('attack', c.hclock)) {
      const gap = c.clock - c.lastMoveEnd, stepBefore = c.step;
      // Back after a pause: the string starts over.
      if (gap > 0.6) { c.step = 0; if (grounded()) c.airStep = 0; }
      const special = comboMove(tgt, near, gap, stepBefore);
      if (special) { startMove(special); return; }
      if (tgt) {
        const mv = chooseMove({ d: near.d, dy: near.dy, step: c.step, airStep: c.airStep, grounded: nearGround(), webbed: false, holdT: 0 });
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
    // Web shot (one cartridge each; empty, it just clicks).
    const webAtBoss = intent.webPressed && pickTarget(P(), camFwd, enemies.list, COMBAT.webRange)?.boss;
    if (intent.webPressed && c.webAmmo < 1 && !webAtBoss) { onEvent({ type: 'webEmpty' }); intent.webPressed = false; }
    if (intent.webPressed) {
      if (!webAtBoss) c.webAmmo--;
      const t2 = pickTarget(P(), camFwd, enemies.list, COMBAT.webRange + c.webRangeBonus);
      const from = { x: P().x, y: P().y + 0.5, z: P().z };
      if (t2) {
        // Lead a moving target (a flyer at 20 m/s moves metres while the web is in the air).
        const q0 = t2.body.p, tv = t2.body.v, lead = Math.hypot(q0.x - from.x, q0.y - from.y, q0.z - from.z) / 75;
        const q = { x: q0.x + tv.x * lead, y: q0.y + tv.y * lead, z: q0.z + tv.z * lead };
        projectiles.fire('web', from, { x: q.x, y: q.y + 0.3, z: q.z }, { owner: 'hero', dmg: (1 / TUNE.webShots + COMBAT.webShot) * c.webMul });
        onEvent({ type: 'thwip', x: q.x, y: q.y, z: q.z, combat: true });
      } else {
        const d = camFwd;
        projectiles.fire('web', from, { x: from.x + d.x * 30, y: from.y + d.y * 30, z: from.z + d.z * 30 }, { owner: 'hero', dmg: (1 / TUNE.webShots + COMBAT.webShot) * c.webMul });
        onEvent({ type: 'thwip', x: from.x + d.x * 30, y: from.y + d.y * 30, z: from.z + d.z * 30, combat: true });
      }
    }
    // A webbed enemy close by: the yank swings him round and throws him (spec 1.6), along the stick
    // or the camera; whoever he hits goes down, and a wall he hits keeps him.
    if (intent.yankPressed && !hero.swing.active) {
      const wb = webbedNear();
      if (wb && (!tgt || toward(wb).d < near.d)) {
        intent.hangPressed = false;
        const m = Math.hypot(intent.moveX, intent.moveZ);
        let dx = camFwd.x, dz = camFwd.z;
        if (m > 0.3) { dx = intent.moveX; dz = intent.moveZ; }
        const l = Math.hypot(dx, dz) || 1;
        const v = wb.body.v;
        applyDv(wb.body, 'rope', (dx / l) * TUNE.throwSpeed - v.x, TUNE.throwLift - v.y, (dz / l) * TUNE.throwSpeed - v.z);
        wb.thrownT = 1.2;
        wb.bowled = new Set();
        wb.onGround = false;
        word('THROWN!', wb);
        c.used.throw = (c.used.throw ?? 0) + 1;
        onEvent({ type: 'webThrow', e: wb });
        return;
      }
    }
    // Throw (the hang key with a loose prop in reach): it flies at the target and floors him and
    // whoever stands next to him. A gunner is disarmed first, as before.
    if (intent.yankPressed && tgt && !tgt.boss && props && !hero.swing.active && near.d < 20 && !(tgt.A?.ranged && !tgt.disarmed)) {
      const thrown = props.yankNearest(P(), tgt);
      if (thrown) {
        intent.hangPressed = false;
        c.used.propThrow = (c.used.propThrow ?? 0) + 1;
        word('YANK!', null, 'small');
        onEvent({ type: 'thwip', x: thrown.p.x, y: thrown.p.y, z: thrown.p.z, combat: true });
        return;
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
        if (!grounded()) {
          let name = 'SPIKED!';
          if (tgt.boss || tgt.puppet || tgt.isPlayer) enemies.hit(tgt, { dmg: 999, dir: { x: near.x, z: near.z }, push: 10, lift: 5, from: P() });
          else if (hero.state === 'wall') {
            // From a wall: webbed and yanked onto the wall beside you (he sticks there).
            webFling(tgt, -near.x * 14, 2, -near.z * 14);
            name = 'WALL ART!';
          } else {
            // In the air: webbed and spiked into the street.
            enemies.hit(tgt, { dmg: 999, dir: { x: near.x, z: near.z }, push: 3, lift: -16, kind: 'slam', from: P() });
            applyDv(tgt.body, 'rope', 0, -16 - tgt.body.v.y, 0); // a knockout pops him up; a spike sends him down
            onEvent({ type: 'slam', at: { x: tgt.body.p.x, y: tgt.body.p.y, z: tgt.body.p.z } });
          }
          const s = stopFor('finisher');
          c.heroStop = Math.max(c.heroStop, s); c.heroStopAll = c.heroStop; enemies.freeze?.(tgt, s);
          if (finisherSlowmo) slowmo(0.4);
          c.used.finisher = (c.used.finisher ?? 0) + 1;
          word(name, tgt, 'big');
          onEvent({ type: 'finisher', e: tgt });
        } else {
          // The ground finishers in turn (never the same one twice running); a brute is too big
          // to fling or flip, he takes the kick.
          const key = tgt.boss || tgt.A?.heavy ? 'finisher' : GROUND_FINISHERS[c.finIdx++ % GROUND_FINISHERS.length];
          startMove(key);
          c.iframes = Math.max(c.iframes, MOVES[key].time);
          enemies.freeze?.(tgt, MOVES[key].impact);
          onEvent({ type: 'finisherStart', e: tgt, time: MOVES[key].time });
        }
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

  // Webbed up for good and thrown: a webbed body that hits a wall sticks there (enemies.js).
  function webFling(e, vx, vy, vz) {
    if (e.boss || e.puppet || e.isPlayer || e.A?.heavy) { enemies.hit(e, { dmg: 999, dir: { x: vx, z: vz }, push: 10, lift: 5, from: P() }); return; }
    // Already webbed: a second web would knock him out of it (stagger); he is just flung.
    if (e.state !== 'webbed') enemies.hit(e, { kind: 'web', dmg: 99, from: P() });
    e.takenDown = true; // no breaking out of a finisher
    applyDv(e.body, 'rope', vx - e.body.v.x, vy - e.body.v.y, vz - e.body.v.z);
    onEvent({ type: 'enemyOut', e }); // a finisher pays like a knockout (XP, the KO mark)
  }

  function startDodge(intent, engaged) {
    // Away from the soonest attacker, sideways unless the stick says otherwise.
    let threat = null, soon = Infinity;
    const aimed = [];
    for (const e of engaged) {
      if (e.state !== 'windup' || (e.atBody && e.atBody !== hero.body)) continue;
      const left = e.strikeAt - e.t;
      const u = toward(e);
      const reach = (e.A.ranged && !e.disarmed) ? 40 : e.A.reach + 1.2;
      if (u.d < reach) aimed.push({ e, left });
      if (u.d < reach && left < soon) { soon = left; threat = e; }
    }
    const ref = threat ?? engaged.reduce((a, b) => (toward(a).d < toward(b).d ? a : b));
    const u = toward(ref);
    const m = Math.hypot(intent.moveX, intent.moveZ);
    // No stick: back and to one side, away from the attacker (fix spec A3). With the stick, where
    // it points, except that a dodge into the attacker turns sideways on the stick's side.
    const sgn = Math.random() < 0.5 ? 1 : -1;
    let dx = (-u.x - u.z * sgn) * Math.SQRT1_2, dz = (-u.z + u.x * sgn) * Math.SQRT1_2;
    if (m > 0.2) {
      dx = intent.moveX / m; dz = intent.moveZ / m;
      if (dx * u.x + dz * u.z > Math.SQRT1_2) { const s = dx * u.z - dz * u.x > 0 ? 1 : -1; dx = u.z * s; dz = -u.x * s; }
    }
    if (hero.state === 'wall') { hero.state = 'air'; hero.airTime = 0; }
    // Off a web: let go and flip clear.
    if (hero.swing.active) { hero.swing.release(); hero.state = 'air'; hero.airTime = 0; }
    // A move in progress is dropped (every move but a finisher cancels into a dodge).
    c.move = null; c.airKeepT = 0;
    const air = !grounded();
    // Never flip off a roof: a landing spot more than 2 m down turns the dodge the other way,
    // and with drops on both sides it is a short hop instead.
    let dist = TUNE.dodgeDist;
    // In the air too (a dodge off a jump near a roof edge used to fling him off the building).
    if (groundAt) {
      const drop = (x, z) => groundHere - groundAt(P().x + x * TUNE.dodgeDist, P().z + z * TUNE.dodgeDist) > 2;
      if (drop(dx, dz)) {
        if (!drop(-dx, -dz)) { dx = -dx; dz = -dz; }
        else dist = 1.2;
      }
    }
    const v = V(), sp = dist / TUNE.dodgeTime;
    if (air) applyDv(hero.body, 'rope', dx * sp - v.x, Math.max(0, 2 - v.y), dz * sp - v.z);
    else {
      // A flip or vault: off the ground for the whole dodge.
      applyDv(hero.body, 'surface', dx * sp - v.x, G * TUNE.dodgeTime / 2 - Math.max(0, v.y), dz * sp - v.z);
      hero.state = 'air'; hero.airTime = 0;
    }
    // Dodging a telegraphed blow clears that blow: covered until it has landed (at most 1 s),
    // however early in the windup the dodge came, and that swing can no longer hit at all.
    // Two fists spaced by the director's gap: one dodge clears both (fix spec B6).
    let last = soon;
    for (const q of aimed) if (q.left <= soon + TUNE.meleeGap + 0.1) { q.e.dodged = true; last = Math.max(last, q.left); }
    c.state = 'dodge'; c.t = 0; c.iframes = threat ? Math.max(COMBAT.iframes, Math.min(1.0, last + 0.1)) : COMBAT.iframes;
    if (threat && !threat.boss) { c.counterTgt = threat; c.counterUntil = c.clock + TUNE.dodgeTime + TUNE.counterWindow; }
    enemies.tokens?.holdAll(TUNE.dodgeHold);
    const perfect = !!threat && soon <= COMBAT.perfectWindow + 1 / 60;
    c.counterPerfect = perfect;
    // Which side relative to where the hero faces (the poser picks the flip).
    const side = dx * hero.facing.z - dz * hero.facing.x > 0 ? 'l' : 'r';
    if (perfect) {
      c.perfects = (c.perfects ?? 0) + 1;
      slowmo(COMBAT.slowmo, 'perfect');
      c.focus = Math.min(3, c.focus + COMBAT.focusPerfect);
      word('PERFECT DODGE!', null, 'big');
      // The counter: a web to the attacker's face.
      const from = { x: P().x, y: P().y + 0.6, z: P().z }, q = threat.body.p;
      projectiles.fire('web', from, { x: q.x, y: q.y + 0.7, z: q.z }, { owner: 'hero', dmg: 0 });
      if (!threat.boss) enemies.stun?.(threat, TUNE.perfectStun);
      onEvent({ type: 'perfectCounter', e: threat });
    }
    onEvent({ type: 'dodge', perfect, dir: { x: dx, z: dz }, air, side, e: threat });
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
    c, preStep, takeHit, timeScale, slowmo: (s) => slowmo(s),
    revive() { c.hp = c.maxHp; c.defeated = false; c.state = 'free'; c.combo = 0; c.iframes = 1.5; c.move = null; c.webAmmo = TUNE.webCap; },
    // Down at once whatever the iframes (a poison clock running out), with the usual defeat event.
    knockOut() { if (c.defeated) return; c.hp = 0; c.defeated = true; slowmo(1.2); onEvent({ type: 'heroDefeated' }); },
    get inCombat() { return enemies.engaged.length > 0; },
  };
}
