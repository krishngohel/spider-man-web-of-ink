import * as THREE from 'three';
import { createBody, placeBody, applyDv } from '../physics/ledger.js';
import { applyGravity } from '../physics/aero.js';
import { G } from '../physics/constants.js';
import { buildEnemyModel } from './enemyModel.js';
import { perceive, patrolWant, takedownKind } from './stealth.js';
import { TUNE } from './tuning.js';
import { createTokens, airSafe } from './tokens.js';
import { shake } from './hitstop.js';

// Enemies (spec 8.1): a body each on the same collision world as the hero, a state machine per
// archetype, and a director (tokens.js) that lets one fist and a few guns go at a time. Attacks
// wind up visibly: a slow, readable anticipation pose while the spider-sense is white, then a fast
// snap through the last 120 ms (red, the perfect-dodge window), landing at a fixed moment.

export const ARCHETYPES = {
  brawler: { hp: 55, speed: 4.2, reach: 1.9, windup: 0.5, recover: 0.6, dmg: 8, ranged: false, mass: 80, clip: 'Punch_Cross' },
  brute: { hp: 120, speed: 3.2, reach: 2.4, windup: 0.85, recover: 1.0, dmg: 18, ranged: false, mass: 160, clip: 'Melee_Hook', unblockable: true, heavy: true },
  shield: { hp: 60, speed: 3.6, reach: 2.0, windup: 0.6, recover: 0.7, dmg: 10, ranged: false, mass: 95, clip: 'Shield_Dash', shield: true },
  gunner: { hp: 35, speed: 4.0, reach: 26, windup: 0.9, recover: 1.1, dmg: 6, ranged: true, keep: [9, 17], mass: 75, clip: 'Spell_Simple_Shoot', shot: 'bullet' },
  rocket: { hp: 45, speed: 3.4, reach: 34, windup: 1.3, recover: 2.2, dmg: 12, ranged: true, keep: [14, 24], mass: 85, clip: 'OverhandThrow', shot: 'rocket' },
  sniper: { hp: 30, speed: 3.6, reach: 60, windup: 1.6, recover: 2.0, dmg: 14, ranged: true, keep: [24, 40], mass: 75, clip: 'Spell_Simple_Shoot', shot: 'bullet' },
  jetpack: { hp: 45, speed: 5.0, reach: 22, windup: 1.0, recover: 1.2, dmg: 7, ranged: true, keep: [8, 14], mass: 85, clip: 'Spell_Simple_Shoot', shot: 'bullet', flies: true },
  whip: { hp: 50, speed: 4.0, reach: 3.6, windup: 0.55, recover: 0.7, dmg: 9, ranged: false, mass: 80, clip: 'Sword_Regular_A' },
};

// Attack slots: at most this many enemies winding up or striking at once, by difficulty.
export const MAX_ATTACKERS = { friendly: 1, amazing: 2, spectacular: 3, ultimate: 3 };
export const DIFFICULTY_DMG = { friendly: 0.55, amazing: 1, spectacular: 1.35, ultimate: 1.7 };

// Pure helpers (unit tested) ----------------------------------------------------------------------

// The enemy the player means: the one the stick points at when it is pushed (spec C3, as in
// Gotham), else near the camera's line of sight; close, and not already out.
export function pickTarget(heroP, camFwd, enemies, maxDist = 14, stick = null) {
  let best = null, bestScore = Infinity;
  const dir = stick && Math.hypot(stick.x, stick.z) > 0.3 ? stick : camFwd;
  for (const e of enemies) {
    if (!isActive(e)) continue;
    const dx = e.body.p.x - heroP.x, dy = e.body.p.y - heroP.y, dz = e.body.p.z - heroP.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > maxDist) continue;
    const fl = Math.hypot(dir.x, dir.z) || 1;
    const along = (dx * dir.x + dz * dir.z) / fl / Math.max(0.1, Math.hypot(dx, dz));
    const score = d * (1.6 - along);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

// The enemy an attack press means (fix spec A1, Arkham freeflow): with the stick pushed, the
// nearest in a 50 degree cone along it (a thug past lunge range only within 30 degrees), the
// current target kept unless another beats it by a fifth; with no stick, the current target while
// it is within 5 m, else the nearest within 4 m, and the camera's line only when nobody is close.
// A thug down or getting up is a target only when nobody upright is in range.
export function pickMeleeTarget(heroP, camFwd, enemies, maxDist = 14, stick = null, current = null) {
  const pool = [];
  for (const e of enemies) {
    if (!isActive(e)) continue;
    const dx = e.body.p.x - heroP.x, dy = e.body.p.y - heroP.y, dz = e.body.p.z - heroP.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > maxDist) continue;
    pool.push({ e, d, h: Math.hypot(dx, dz), dx, dz, low: e.state === 'down' || e.state === 'getup' });
  }
  const up = pool.filter((q) => !q.low);
  const cands = up.length ? up : pool;
  if (!cands.length) return null;
  const sl = stick ? Math.hypot(stick.x, stick.z) : 0;
  if (sl > 0.3) {
    let best = null, bs = Infinity;
    for (const q of cands) {
      const cos = (q.dx * stick.x + q.dz * stick.z) / (sl * Math.max(0.1, q.h));
      const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
      if (ang > 50 || (q.h > TUNE.lungeBand && ang > 30)) continue;
      const s = (ang / 50 + q.d / 8) * (q.e === current ? 0.8 : 1);
      if (s < bs) { bs = s; best = q.e; }
    }
    if (best) return best;
  }
  const cur = current && cands.find((q) => q.e === current);
  if (cur && cur.d <= 5) return current;
  let near = null;
  for (const q of cands) if (q.d <= TUNE.lungeBand && (!near || q.d < near.d)) near = q;
  if (near) return near.e;
  return pickTarget(heroP, camFwd, cands.map((q) => q.e), maxDist);
}

// How long an attack winds up (spec 1.2): light 0.6 s, heavy 0.9 s; guns keep their own.
export function windupFor(A) {
  if (A.ranged) return A.windup;
  return A.heavy ? TUNE.windupHeavy : TUNE.windupLight;
}

export const isActive = (e) => e.alive && !['out', 'webbed', 'pinned', 'away'].includes(e.state);

// May this enemy start an attack now? The director hands out at most `max` attack slots.
export function canAttack(enemies, max) {
  let n = 0;
  for (const e of enemies) if (e.alive && (e.state === 'windup' || e.state === 'strike')) n++;
  return n < max;
}

// Damage an enemy takes from a hit, after its shield and its webbing.
export function hitDamage(e, base, fromFront) {
  if (ARCHETYPES[e.arch].shield && fromFront && !e.shieldBroken && e.state !== 'air') return 0;
  return base * (e.state === 'down' ? 1.4 : 1);
}

let nextId = 1;

export function createEnemies({ scene, world, assets, onEvent = () => {} }) {
  const list = [];
  // One director per target (each player in co-op, the generator in a defend mission).
  const tokenSets = new Map();
  const tokensOf = (T) => { let ts = tokenSets.get(T.body); if (!ts) { ts = createTokens(); tokenSets.set(T.body, ts); } return ts; };
  const tokens = { holdAll(s) { for (const ts of tokenSets.values()) ts.holdAll(s); } };
  const tmp = new THREE.Vector3();
  const C = {};

  function spawn({ x, y = 0.9, z, faction = 'street', arch = 'brawler', look = 0, level = 1, alert = false }) {
    const A = ARCHETYPES[arch];
    const m = buildEnemyModel(assets, faction, look, arch);
    scene.add(m.root);
    const body = createBody({ mass: A.mass });
    placeBody(body, x, A.flies ? y + 5 : y, z, 0, 0, 0);
    const e = {
      id: nextId++, faction, arch, A, level, body,
      hp: A.hp * (1 + (level - 1) * 0.12), maxHp: A.hp * (1 + (level - 1) * 0.12),
      state: alert ? 'engage' : 'idle', t: 0, alive: true, alerted: alert,
      cooldown: 0.4 + Math.random() * 1.0, web: 0, facing: Math.random() * Math.PI * 2,
      onGround: true, model: m, strikeAt: 0, hitThisAttack: false, lastHitT: -10, shieldBroken: false,
      strafe: Math.random() < 0.5 ? 1 : -1, disarmed: false, outT: 0, pin: null, home: { x, z }, look,
    };
    m.root.position.set(x, y, z);
    m.animator.play('Idle_Loop');
    list.push(e);
    return e;
  }

  function remove(e) {
    e.alive = false; // anyone still holding it (a wave list) sees it is gone
    scene.remove(e.model.root);
    e.model.mat.dispose();
    const i = list.indexOf(e);
    if (i >= 0) list.splice(i, 1);
  }

  function setState(e, s) {
    e.state = s; e.t = 0;
    const a = e.model.animator;
    switch (s) {
      case 'idle': a.play('Idle_Loop'); break;
      case 'engage': break; // locomotion picks walk or jog each frame
      case 'windup': {
        // Anticipation: 40% of the clip spread over the white part of the windup, held and
        // readable; the red part snaps through the rest (see snapWindup).
        const act = a.play(e.disarmed ? 'Punch_Jab' : e.A.clip, { once: true, fade: 0.08, timeScale: 1 });
        const dur = act.getClip().duration, white = Math.max(0.05, (e.strikeAt || TUNE.windupLight) - TUNE.redWindow);
        act.timeScale = (dur * 0.4) / white;
        e.windAction = act;
        break;
      }
      case 'stagger': a.play(Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head', { once: true, fade: 0.05, timeScale: 1.3 }); break;
      case 'air': a.play('Hit_Knockback', { once: true, fade: 0.05 }); break;
      // Knocked down: the fall (until the Mixamo knockdown arrives); out: the same fall, for good.
      case 'down': case 'out': a.play('Death01', { once: true, fade: 0.1 }); break;
      // Webbed up or stuck to a wall: upright and struggling against the web, never a death.
      case 'webbed': case 'pinned': a.play('Idle_No_Loop', { fade: 0.12, timeScale: 1.7 }); break;
      case 'getup': a.play('LayToIdle', { once: true, fade: 0.1, timeScale: 1.6 }); break;
      case 'stunned': a.play('Hit_Head', { once: true, fade: 0.05, timeScale: 0.45 }); break;
      default: break;
    }
  }

  // A hit on an enemy. dir: unit push direction (x, z); lift: up speed; kind: 'melee', 'web', ...
  function hit(e, args = {}) {
    // A story boss: its own module decides what a hit does (src/story/bossActor.js).
    if (e.boss) return e.boss.hit(args);
    if (e.puppet || e.isPlayer) {
      // Someone else's: the host (or the other player) applies it. Show the hit here at once.
      e.model.hurt.value = 1;
      api.onPuppetHit?.(e, { dmg: 10, dir: { x: 0, z: 1 }, push: 3, lift: 0, kind: 'melee', ...args });
      return { dealt: args.dmg ?? 10, blocked: false };
    }
    const { dmg = 10, dir = { x: 0, z: 1 }, push = 3, lift = 0, kind = 'melee', from = null } = args;
    if (!e.alive || e.state === 'out' || e.state === 'pinned') return { dealt: 0, blocked: false };
    const front = from ? ((from.x - e.body.p.x) * Math.sin(e.facing) + (from.z - e.body.p.z) * Math.cos(e.facing)) > 0 : true;
    if (kind === 'web') {
      e.web = Math.min(1, e.web + dmg);
      e.alerted = true;
      if (e.web >= 1 && e.state !== 'webbed') { setState(e, 'webbed'); onEvent({ type: 'enemyWebbed', e }); return { dealt: 0, webbed: true }; }
      if (e.state !== 'air' && e.state !== 'down') setState(e, 'stagger');
      return { dealt: 0, blocked: false };
    }
    const dealt = hitDamage(e, dmg, front);
    if (dealt <= 0) { onEvent({ type: 'blocked', e }); if (push > 6) e.shieldBroken = true; return { dealt: 0, blocked: true }; }
    e.hp -= dealt;
    e.alerted = true;
    e.lastHitT = 0;
    e.model.hurt.value = 1;
    const k = e.A.heavy && kind !== 'slam' ? 0.35 : 1;
    applyDv(e.body, 'surface', dir.x * push * k - e.body.v.x * 0.5, lift * k, dir.z * push * k - e.body.v.z * 0.5);
    if (lift * k > 2) { setState(e, 'air'); e.onGround = false; }
    else if (e.hp <= 0) { setState(e, 'out'); onEvent({ type: 'enemyOut', e }); }
    else if (kind === 'slam' || push > 9) setState(e, 'down');
    // Brutes keep swinging through light hits (super armour while winding up).
    else if (e.A.heavy && (e.state === 'windup' || e.state === 'strike') && push < 6) { /* no flinch */ }
    else if (e.state !== 'air') setState(e, 'stagger');
    return { dealt, blocked: false };
  }

  function step(dt, ctx) {
    const { hero, heroInvuln, difficulty = 'amazing', gravity = 'comic', heroHit } = ctx;
    const heroCtl = hero; // the real hero (state, body), for the senses of guards on patrol
    const los = (p, h) => !world.raycast(p.x, p.y + 0.6, p.z, h.x - p.x, h.y + 0.3 - p.y - 0.6, h.z - p.z, 1, { ground: false, unit: true });
    // Everyone they can go for (in multiplayer, every player; alone, the hero).
    const targets = ctx.targets ?? [{ body: hero.body, invuln: heroInvuln, hit: heroHit }];
    const nearest = (p) => { let best = targets[0], bd = Infinity; for (const t of targets) { const d = Math.hypot(t.body.p.x - p.x, t.body.p.z - p.z); if (d < bd) { bd = d; best = t; } } return best; };
    const g = G[gravity] ?? G.comic;
    const groundUnder = (q) => world.groundHeight(q.x, q.y, q.z);
    // The director: who may swing and who may shoot (bosses and puppets run themselves).
    {
      const groups = new Map(targets.map((T) => [T, []]));
      for (const e of list) if (e.alive && !e.boss && !e.puppet && !e.isPlayer && e.alerted) groups.get(nearest(e.body.p))?.push(e);
      for (const [T, group] of groups) {
        const tp = T.body.p;
        tokensOf(T).update(dt, group, tp, { difficulty, groundBelow: groundUnder(tp), dist: (e) => Math.hypot(e.body.p.x - tp.x, e.body.p.z - tp.z) });
      }
    }
    // Puppets (enemies the host runs, other players) only follow what they are told.
    for (const e of list) if (e.puppet) puppetStep(e, dt);
    // Alerts spread: anyone near an alerted ally joins in.
    for (const e of list) {
      if (!e.alive || e.puppet || e.isPlayer || e.boss) continue;
      if (e.stealth) continue; // guards on patrol only learn from their own eyes and ears
      const hp = nearest(e.body.p).body.p;
      const dHero = Math.hypot(e.body.p.x - hp.x, e.body.p.z - hp.z);
      if (!e.alerted && (dHero < 20 || list.some((o) => o.alerted && o !== e && Math.hypot(o.body.p.x - e.body.p.x, o.body.p.z - e.body.p.z) < 25))) {
        e.alerted = true;
        onEvent({ type: 'enemyAlert', e });
      }
    }
    for (const e of list) {
      if (!e.alive || e.puppet || e.isPlayer || e.boss) continue;
      const T = nearest(e.body.p);
      const hp = T.body.p, hero = T, heroInvuln = T.invuln, heroHit = T.hit;
      const A = e.A, b = e.body, p = b.p, v = b.v;
      // Hitstop: frozen mid-blow for a few frames, shaking (drawn only; the body stays put).
      if (e.stopT > 0) {
        e.stopT -= dt;
        const s = shake(e.stopT, e.stopAll ?? 0.1);
        e.model.root.position.set(p.x + s.x, p.y, p.z + s.z);
        continue;
      }
      e.t += dt;
      e.cooldown -= dt;
      e.lastHitT += dt;
      e.model.hurt.value = Math.max(0, e.model.hurt.value - dt * 6);
      const dx = hp.x - p.x, dz = hp.z - p.z, dist = Math.hypot(dx, dz) || 1;
      const ux = dx / dist, uz = dz / dist;
      let wantVx = 0, wantVz = 0, face = null;

      // A guard who has not seen you: walks the patrol, looks, listens.
      const unaware = e.stealth && !e.alerted && !['out', 'webbed', 'pinned', 'air', 'down', 'getup'].includes(e.state);
      if (unaware) {
        const w = patrolWant(e, dt);
        wantVx = w.vx; wantVz = w.vz; face = w.face;
        e.model.animator.play(w.anim, { timeScale: 1 });
        if (perceive(e, heroCtl, dt, los, ctx.noise ?? null) === 'alarm') { e.alerted = true; setState(e, 'engage'); onEvent({ type: 'spotted', e }); }
      } else switch (e.state) {
        case 'idle':
          if (e.alerted) setState(e, 'engage');
          break;
        case 'engage': {
          face = Math.atan2(ux, uz);
          let want = 0;
          if (A.ranged && !e.disarmed) {
            const [near, far] = A.keep;
            if (dist < near) want = -1; else if (dist > far) want = 1;
          } else want = dist > A.reach * 0.85 ? 1 : dist < A.reach * 0.5 ? -0.5 : 0;
          // Circle the hero a little so they do not stack in a line.
          const sx = -uz * e.strafe, sz = ux * e.strafe;
          wantVx = (ux * want + sx * 0.35) * A.speed; wantVz = (uz * want + sz * 0.35) * A.speed;
          if (Math.random() < dt * 0.3) e.strafe = -e.strafe;
          const inRange = A.ranged && !e.disarmed ? dist < A.reach && lineOfSight(e, hero) : dist < A.reach * 1.05 && Math.abs(hp.y - p.y) < 2.2;
          const gun = A.ranged && !e.disarmed;
          const ts = tokensOf(T);
          if (inRange && e.cooldown <= 0 && (gun ? ts.mayRanged(e) : ts.mayMelee(e))) {
            // Off-screen shooters take longer, so the spider-sense gives more warning (PUB).
            e.strikeAt = (gun ? A.windup : windupFor(A)) + (gun && ctx.onScreen?.(e) === false ? TUNE.offscreenDelay : 0);
            e.red = false;
            e.dodged = false;
            setState(e, 'windup');
            e.hitThisAttack = false;
            onEvent({ type: 'enemyWindup', e, at: e.strikeAt, ranged: gun, unblockable: !!A.unblockable });
          }
          const moving = Math.hypot(wantVx, wantVz);
          e.model.animator.play(moving > 3.6 ? 'Jog_Fwd_Loop' : moving > 0.4 ? 'Walk_Loop' : 'Idle_Loop', { timeScale: Math.max(0.7, moving / 3.2) });
          break;
        }
        case 'windup':
          face = Math.atan2(ux, uz);
          if (!e.red && e.strikeAt - e.t <= TUNE.redWindow) {
            // The snap: the rest of the swing in 0.18 s.
            e.red = true;
            const act = e.windAction;
            if (act) act.timeScale = (act.getClip().duration * 0.6) / 0.18;
          }
          if (e.t >= e.strikeAt) {
            setState(e, 'strike');
            if (A.ranged && !e.disarmed) onEvent({ type: 'enemyShoot', e, kind: A.shot, dmg: A.dmg * (DIFFICULTY_DMG[difficulty] ?? 1), to: hero.body === heroCtl.body ? null : { x: hp.x, y: hp.y, z: hp.z } });
            else {
              // Melee lands if the hero is still in reach and in front, and not dodging.
              const reach = e.disarmed ? 1.9 : A.reach;
              // Fists cannot reach a hero in the air (spec 1.1, the air is safe); whips can.
              const up = airSafe(hp.y, groundUnder(hp)) && e.arch !== 'whip';
              if (!up && !e.dodged && dist < reach + 0.4 && Math.abs(hp.y - p.y) < 2.4 && !heroInvuln()) {
                heroHit({ dmg: A.dmg * (DIFFICULTY_DMG[difficulty] ?? 1), dir: { x: ux, z: uz }, from: e, unblockable: !!A.unblockable });
              } else onEvent({ type: 'enemyMiss', e });
            }
          }
          break;
        case 'strike':
          if (e.t > 0.15) { setState(e, 'recover'); }
          break;
        case 'recover':
          if (e.t > A.recover) {
            // Guns fire a burst every 3 to 4 s each (spec 1.2); fists wait for the token anyway.
            const [lo, hi] = TUNE.rifleEvery;
            e.cooldown = A.ranged && !e.disarmed ? Math.max(0.3, lo + Math.random() * (hi - lo) - A.windup - A.recover) : 0.4 + Math.random() * 0.6;
            setState(e, 'engage');
          }
          break;
        case 'stagger':
          if (e.t > 0.45) setState(e, e.hp <= 0 ? 'out' : 'engage');
          break;
        case 'stunned':
          // Webbed in the face by a perfect dodge: open for a beat.
          if (e.t > (e.stunT ?? 1.5)) setState(e, 'engage');
          break;
        case 'air':
          if (e.onGround && e.t > 0.25) {
            if (e.hp <= 0) { setState(e, 'out'); onEvent({ type: 'enemyOut', e }); } else setState(e, 'down');
          }
          break;
        case 'down':
          if (e.t > 1.4) setState(e, 'getup');
          break;
        case 'getup':
          if (e.t > 0.8) setState(e, 'engage');
          break;
        case 'out': case 'webbed': case 'pinned':
          e.outT += dt;
          break;
        default: break;
      }

      // Movement: ground friction toward the wanted velocity (feet on the ground), gravity, the
      // jetpack's thrust holding height, collisions.
      const groundy = e.onGround && !['air', 'webbed', 'out', 'pinned', 'down'].includes(e.state);
      if (groundy || (A.flies && isActive(e) && e.state !== 'air')) {
        const ax = (wantVx - v.x), az = (wantVz - v.z), lim = 30 * dt, l = Math.hypot(ax, az);
        const k = l > lim ? lim / l : 1;
        applyDv(b, 'surface', ax * k, 0, az * k);
      } else if (e.onGround) {
        // Lying or webbed on the ground: friction stops the slide.
        const k = Math.min(1, 8 * dt);
        applyDv(b, 'surface', -v.x * k, 0, -v.z * k);
      }
      if (e.state !== 'pinned') {
        if (e.float > 0) {
          // Suspension matrix: weightless, drifting up to about 2.5 m over the ground.
          e.float -= dt;
          const want = world.groundHeight(p.x, p.y, p.z) + 3.4;
          applyDv(b, 'assist', -v.x * Math.min(1, dt * 2), ((want - p.y) * 2 - v.y) * Math.min(1, dt * 3), -v.z * Math.min(1, dt * 2));
          if (e.state !== 'air' && isActive(e)) setState(e, 'air');
          e.onGround = false;
        } else if (A.flies && isActive(e) && e.state !== 'air') {
          // Jetpack thrust: hold about 5 m over the ground under the hero's height.
          const want = Math.max(4, Math.min(hp.y + 2, world.groundHeight(p.x, p.y, p.z) + 6));
          applyDv(b, 'assist', 0, ((want - p.y) * 3 - v.y) * Math.min(1, dt * 4), 0);
        } else if (e.hangT > 0) {
          // Juggled: the hero's hits keep him up (spec 1.5); he drifts, barely sinking.
          e.hangT -= dt;
          applyDv(b, 'assist', -v.x * Math.min(1, dt * 5), -v.y * Math.min(1, dt * 10) - g * dt * 0.15, -v.z * Math.min(1, dt * 5));
        } else applyGravity(b, g, dt);
        p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
        world.resolveCapsule(b, 0.35, 0.5, C);
        e.onGround = C.ground || p.y <= 0.91;
        if (p.y < 0.9) { p.y = 0.9; if (v.y < 0) v.y = 0; e.onGround = true; }
        // A webbed enemy knocked into a wall sticks there.
        if (e.state === 'webbed' && C.wall && Math.hypot(v.x, v.z) > 3) { e.state = 'pinned'; e.t = 0; e.pin = { nx: C.nx, nz: C.nz }; v.x = v.y = v.z = 0; onEvent({ type: 'enemyPinned', e }); }
        // A thrown webbed enemy bowls over whoever he flies into.
        if (e.thrownT > 0) {
          e.thrownT -= dt;
          if (Math.hypot(v.x, v.z) > 6) {
            for (const o of list) {
              if (o === e || !isActive(o) || o.boss || o.isPlayer || e.bowled?.has(o)) continue;
              if (Math.hypot(o.body.p.x - p.x, o.body.p.z - p.z) < 1.3 && Math.abs(o.body.p.y - p.y) < 1.6) {
                (e.bowled ??= new Set()).add(o);
                const l = Math.hypot(v.x, v.z) || 1;
                hit(o, { dmg: 18, dir: { x: v.x / l, z: v.z / l }, push: 10, lift: 2.5, kind: 'slam', from: { ...p } });
                onEvent({ type: 'heroHit', e: o, heavy: true, kind: 'throw' });
              }
            }
          }
        }
      }
      // Bodies keep apart (a soft push), from each other and from the hero.
      if (isActive(e)) {
        for (const o of list) {
          if (o === e || !isActive(o)) continue;
          const ox = p.x - o.body.p.x, oz = p.z - o.body.p.z, d = Math.hypot(ox, oz);
          if (d < 0.9 && d > 1e-4) { const k = (0.9 - d) * 0.5; p.x += (ox / d) * k; p.z += (oz / d) * k; }
        }
        if (dist < 0.85 && Math.abs(hp.y - p.y) < 1.6) { const k = 0.85 - dist; p.x -= ux * k; p.z -= uz * k; }
      }
      if (face !== null) {
        let df = face - e.facing;
        while (df > Math.PI) df -= Math.PI * 2;
        while (df < -Math.PI) df += Math.PI * 2;
        e.facing += df * Math.min(1, dt * 8);
      }
      // Draw.
      const r = e.model.root;
      r.position.set(p.x, p.y, p.z);
      if (e.state === 'pinned' && e.pin) {
        // Flat against the wall, webbed in place.
        r.rotation.set(0, Math.atan2(e.pin.nx, e.pin.nz), 0);
      } else r.rotation.set(0, e.facing, 0);
      e.model.animator.update(dt);
      // Out of the fight for a while: fade away and free the slot.
      if (e.outT > 25) { e.alive = false; remove(e); }
    }
  }

  function lineOfSight(e, hero) {
    const p = e.body.p, h = hero.body.p;
    const dx = h.x - p.x, dy = h.y + 0.4 - (p.y + 0.6), dz = h.z - p.z, d = Math.hypot(dx, dy, dz) || 1;
    const hit = world.raycast(p.x, p.y + 0.6, p.z, dx / d, dy / d, dz / d, d - 0.6, { ground: false });
    return !hit;
  }

  // Host snapshots drive puppets: spawn the ones we have not seen, steer the rest to where the
  // host says they are, drop the ones that left.
  function puppetSync(snap) {
    const seen = new Set();
    for (const s of snap) {
      seen.add(s.id);
      let e = list.find((q) => q.puppet && q.netId === s.id);
      if (!e) { e = spawn({ x: s.p.x, y: s.p.y, z: s.p.z, faction: s.faction, arch: s.arch, look: s.look, alert: true }); e.puppet = true; e.netId = s.id; }
      e.target = s.p; e.targetFacing = s.facing;
      e.hp = s.hp * e.maxHp; e.web = s.web;
      if (s.state !== e.state) setState(e, s.state);
      e.seenT = 0;
    }
    for (const e of [...list]) if (e.puppet && !seen.has(e.netId)) { e.seenT = (e.seenT ?? 0) + 1; if (e.seenT > 5) { e.alive = false; remove(e); } }
  }
  function puppetStep(e, dt) {
    if (!e.target) return;
    const k = Math.min(1, dt * 12), p = e.body.p;
    p.x += (e.target.x - p.x) * k; p.y += (e.target.y - p.y) * k; p.z += (e.target.z - p.z) * k;
    let df = e.targetFacing - e.facing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    e.facing += df * k;
    e.model.hurt.value = Math.max(0, e.model.hurt.value - dt * 6);
    if (e.state === 'engage') e.model.animator.play('Jog_Fwd_Loop');
    e.model.root.position.set(p.x, p.y, p.z);
    e.model.root.rotation.set(0, e.facing, 0);
    e.model.animator.update(dt);
  }

  // A silent takedown: webbed up where they stand (out of the fight). Guards who can see the
  // victim grow suspicious.
  function takedown(e, kind) {
    setState(e, 'webbed');
    e.web = 1;
    if (kind === 'hang') applyDv(e.body, 'rope', 0, 7, 0);
    onEvent({ type: 'takedown', e, kind });
    for (const o of list) {
      if (o === e || !o.stealth || o.alerted || !o.alive) continue;
      const dx = e.body.p.x - o.body.p.x, dz = e.body.p.z - o.body.p.z, d = Math.hypot(dx, dz);
      if (d < 16 && Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - o.facing), Math.cos(Math.atan2(dx, dz) - o.facing))) < 1.2) { o.suspicion = Math.min(1, (o.suspicion ?? 0) + 0.7); o.lastSeen = { ...e.body.p }; }
    }
  }
  void tmp;
  const api = {
    tokens,
    takedown,
    // Hitstop on this body (seconds).
    freeze(e, s) { if (e.boss || e.puppet || e.isPlayer) return; e.stopT = Math.max(e.stopT ?? 0, s); e.stopAll = e.stopT; },
    // Kept in the air by an air string.
    hang(e, s) { if (e.boss || e.puppet || e.isPlayer) return; e.hangT = s; if (e.state !== 'air' && isActive(e)) { setState(e, 'air'); } e.onGround = false; },
    // Open for a beat (a perfect dodge's web to the face).
    stun(e, s) { if (e.boss || e.puppet || e.isPlayer || !isActive(e)) return; e.stunT = s; setState(e, 'stunned'); onEvent({ type: 'enemyStunned', e }); },
    // Beaten to the punch: the swing never comes.
    interrupt(e) { if (e.boss || e.state !== 'windup') return; setState(e, 'stagger'); e.cooldown = 0.8 + Math.random() * 0.6; onEvent({ type: 'enemyMiss', e }); },
    // The guard nearest the hero open to a takedown, and which kind.
    takedownTarget(heroCtl) {
      let best = null, bd = Infinity;
      for (const e of list) {
        const kind = takedownKind(e, heroCtl);
        if (!kind) continue;
        const d = Math.hypot(e.body.p.x - heroCtl.body.p.x, e.body.p.z - heroCtl.body.p.z);
        if (d < bd) { bd = d; best = { e, kind }; }
      }
      return best;
    },
    list,
    spawn,
    hit,
    step,
    remove,
    puppetSync,
    onPuppetHit: null,
    clearPuppets() { for (const e of [...list]) if (e.puppet) { e.alive = false; remove(e); } },
    clear() { while (list.length) remove(list[0]); },
    get engaged() { return list.filter((e) => isActive(e) && e.alerted && !e.isPlayer); },
    get active() { return list.filter(isActive); },
  };
  return api;
}
