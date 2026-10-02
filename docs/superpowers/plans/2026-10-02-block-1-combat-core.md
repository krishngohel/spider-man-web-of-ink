# Block 1: animation pipeline and combat core, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spider-Man fights by moving: one attacker at a time with readable white-to-red telegraphs,
a flip dodge with a perfect-dodge web counter, a 4-hit string with kicks that lands on real contact
frames, a launcher and air combo, per-body hitstop, a combat camera, and forgiving inputs.

**Architecture:** Pure rule modules (tuning, tokens, moves, warp, hitstop) carry every number and
decision and are unit tested. heroCombat.js becomes a move player that drives them; enemies.js asks
the token module before attacking; a new hero combat-animation layer plays clips (Quaternius
punches, Gotham's mocap kicks, Mixamo clips once downloaded) with phase speed curves while the
procedural swing poser stands aside. Clips load after the title so the load time does not grow.

**Tech Stack:** Three.js r186, Vite, vitest, playwright-core pilots, @gltf-transform (new dev
dependency, asset scripts only).

Spec: docs/superpowers/specs/2026-10-02-overhaul-research-spec.md (sections 1.1 to 1.5, 1.8, 2, C7, C8).

## Global Constraints
- No em or en dashes in any user-facing copy.
- Commits authored solely as Krishn Gohel (`git -c user.name="Krishn Gohel" -c user.email="gohel.krishn@gmail.com"`), no co-author trailers.
- Work in the worktree `web-of-ink-polish` (branch polish, dev :5310); merge to main only with `git merge --ff-only polish` after the block gate.
- Test browsers always muted; one test browser at a time; never grab the user's mouse.
- No deploy, no push.
- Every combat number lives in src/combat/tuning.js.
- GPU p95 at most 6.9 ms on the frozen build; load time at most 2.1 s (combat clips load after ready).
- Physics stays honest: moves change velocity through applyDv with a named source, never teleports.

## File map
| File | Responsibility |
|---|---|
| src/combat/tuning.js (new) | Every combat number from the spec, tagged |
| src/combat/tokens.js (new) | Melee token, job stealing, ranged slots, post-dodge hold, air safety, beat to the punch |
| src/combat/moves.js (new) | Move table, clip choice by distance and context, chain window and input buffer |
| src/combat/warp.js (new) | Motion warping of a clip's root track onto the target |
| src/combat/hitstop.js (new) | Per-body hitstop table and shake |
| src/combat/heroCombat.js | Rewritten move player (attack, launcher, air, strike, dodge, perfect dodge) |
| src/combat/enemies.js | Tokens instead of canAttack, red window events, per-body stop, reactions |
| src/hero/combatAnim.js (new) | Plays combat clips with phase speed curves; tells the poser to stand aside |
| src/hero/pose.js | Combat branch hands off to combatAnim |
| src/hero/model.js | loadCombatClips() after ready |
| src/combat/clipData.js (generated) | Durations, contact times, root tracks for combat clips |
| public/assets/anims_combat.glb (generated) | Combat clips on the game skeleton |
| scripts/retarget-mocap.mjs (ported) | Meshy and Mixamo maps, mirroring, explicit contact |
| scripts/fbx2glb.mjs (new) | FBX to GLB in headless Chromium (no Blender on this machine) |
| scripts/mixamo-fetch.js (new) | Page-context downloader run in the owner's logged-in Mixamo tab |
| src/camera/cameraRig.js | Combat framing |
| src/hero/controller.js | Jump buffer, coyote time, swing retry |
| src/core/input.js | Stick curve |
| src/ui/combatHud.js | White-to-red squiggle, heavy ring, off-screen arcs |
| scripts/combat-check.mjs | Updated pilot (dodges on red, air safety) |

---

### Task 1: Tuning and the enemy token rules

**Files:** Create `src/combat/tuning.js`, `src/combat/tokens.js`. Test `tests/unit/tokens.test.js`.

**Interfaces (produces):**
- `TUNE` object (below).
- `pickMeleeHolder(cands, heroP, current, dist)` returns enemy or null. `cands` are enemies able to melee now; `dist(e)` horizontal distance to hero.
- `rangedSlots(difficulty)` returns 1, 2 or 3.
- `airSafe(heroY, groundBelow)` returns true when the hero is more than `TUNE.airSafe` up.
- `beatsToPunch({ heroImpactIn, enemyImpactIn, sameMoveRun, heavy, boss })` returns true when the enemy windup is cancelled.
- `createTokens()` returns `{ update(dt, list, heroP, ctx), mayMelee(e), mayRanged(e), holdAll(s), get held }`.

- [ ] **Step 1: tuning.js**
```js
// Every combat number (spec 2026-10-02 sections 1.1 to 1.8). Tags: PUB published by Insomniac,
// COMM guides, REF another game's published number, EST our estimate. Tune here only.
export const TUNE = {
  // Enemy rules
  tokenRepick: 0.25, tokenFar: 6, tokenCloser: 2,          // PUB rule, EST numbers
  rangedSlots: { friendly: 1, amazing: 1, spectacular: 2, ultimate: 3 },
  offscreenDelay: 0.6,                                      // PUB rule, EST value
  dodgeHold: 1.0,                                           // PUB rule, EST value
  sameMoveLimit: 3,                                         // PUB
  airSafe: 1.5,                                             // PUB/COMM
  // Telegraphs
  windupLight: 0.6, windupHeavy: 0.9, redWindow: 0.12, sniperLaser: 1.5, rifleEvery: [3.0, 4.0],
  // Dodge
  dodgeTime: 0.45, dodgeIframes: 0.25, dodgeDist: 3.5,
  perfectStun: 1.5, perfectScale: 0.3, perfectSlow: 0.9, perfectRamp: 0.15,
  // Ground string
  lightTime: 0.33, lightImpact: 0.11, enderTime: 0.5, enderPush: 4,
  chainFrom: 0.55, buffer: 0.15,
  closeBand: 1.5, lungeBand: 4, strikeBand: 18, airBand: 1.5, wallBand: 2,
  contactGap: 1.0, warpClamp: 4, faceBy: 0.3,
  comboReset: 3.5,
  // Launcher and air
  launchHold: 0.3, launchHeight: 3.5, followWindow: 0.25,
  airHitTime: 0.27, airKeep: 0.6, slamSplash: 3,
  // Web strike
  strikeSpeed: 30, strikeStop: 1.2, rebound: 2.5,
  // Hitstop (seconds), REF Capcom 67 to 167 ms, Smash hitlag
  stop: { light: 0.05, ender: 0.08, launcher: 0.08, counter: 0.1, finisher: 0.14 }, stopCap: 0.15,
  shake: 0.04, shakeHero: 0.4,
  // Camera
  camKick: 0.06, fovPunch: 2,
};
```
- [ ] **Step 2: failing tests** (`tests/unit/tokens.test.js`)
```js
import { describe, it, expect } from 'vitest';
import { pickMeleeHolder, rangedSlots, airSafe, beatsToPunch, createTokens } from '../../src/combat/tokens.js';
const E = (id, x, z, o = {}) => ({ id, alive: true, state: 'engage', A: { ranged: false }, body: { p: { x, y: 0.9, z } }, ...o });
const H = { x: 0, y: 0.9, z: 0 };
const dist = (e) => Math.hypot(e.body.p.x, e.body.p.z);
describe('enemy tokens', () => {
  it('keeps the holder unless someone is 2 m closer or he is past 6 m', () => {
    const a = E(1, 3, 0), b = E(2, 2, 0), c = E(3, 0.5, 0);
    expect(pickMeleeHolder([a, b], H, a, dist)).toBe(a);
    expect(pickMeleeHolder([a, b, c], H, a, dist)).toBe(c);
    const far = E(4, 7, 0), b2 = E(5, 6.5, 0);
    expect(pickMeleeHolder([far, b2], H, far, dist)).toBe(b2); // past 6 m: handed on though not 2 m closer
    expect(pickMeleeHolder([a, b], H, null, dist)).toBe(b);
  });
  it('gives ranged slots by difficulty', () => {
    expect(rangedSlots('amazing')).toBe(1); expect(rangedSlots('ultimate')).toBe(3);
  });
  it('makes the air safe above 1.5 m', () => {
    expect(airSafe(2.6, 0.9)).toBe(true); expect(airSafe(1.9, 0.9)).toBe(false);
  });
  it('cancels a later enemy hit unless heavy, boss or a repeated move', () => {
    expect(beatsToPunch({ heroImpactIn: 0.05, enemyImpactIn: 0.2, sameMoveRun: 1 })).toBe(true);
    expect(beatsToPunch({ heroImpactIn: 0.3, enemyImpactIn: 0.2, sameMoveRun: 1 })).toBe(false);
    expect(beatsToPunch({ heroImpactIn: 0.05, enemyImpactIn: 0.2, sameMoveRun: 3 })).toBe(false);
    expect(beatsToPunch({ heroImpactIn: 0.05, enemyImpactIn: 0.2, heavy: true })).toBe(false);
  });
  it('one melee attacker at a time, and a dodge holds everyone for 1 s', () => {
    const t = createTokens(), a = E(1, 1, 0), b = E(2, 2, 0);
    t.update(0.3, [a, b], H, { difficulty: 'spectacular', groundBelow: 0.9, dist });
    expect(t.mayMelee(a)).toBe(true); expect(t.mayMelee(b)).toBe(false);
    t.holdAll(1.0); t.update(0.5, [a, b], H, { difficulty: 'spectacular', groundBelow: 0.9, dist });
    expect(t.mayMelee(a)).toBe(false);
    t.update(0.6, [a, b], H, { difficulty: 'spectacular', groundBelow: 0.9, dist });
    expect(t.mayMelee(a)).toBe(true);
  });
  it('no melee token while the hero is in the air', () => {
    const t = createTokens(), a = E(1, 1, 0);
    t.update(0.3, [a], { x: 0, y: 3, z: 0 }, { difficulty: 'amazing', groundBelow: 0.9, dist });
    expect(t.mayMelee(a)).toBe(false);
  });
});
```
- [ ] **Step 3:** `npx vitest run tests/unit/tokens.test.js`, expect FAIL (module missing).
- [ ] **Step 4: tokens.js**
```js
import { TUNE } from './tuning.js';
// The fight's director (spec 1.1): one melee attacker at a time on every difficulty, job stealing
// every 0.25 s, ranged slots by difficulty, a 1 s hold after the player dodges, and the air is safe.
const able = (e) => e.alive && !['out', 'webbed', 'pinned', 'away', 'down', 'getup', 'air', 'stagger'].includes(e.state);
export function pickMeleeHolder(cands, heroP, current, dist) {
  let best = null, bd = Infinity;
  for (const e of cands) { const d = dist(e); if (d < bd) { bd = d; best = e; } }
  if (!current || !cands.includes(current)) return best;
  const dc = dist(current);
  if (dc > TUNE.tokenFar) return best;
  return best && bd < dc - TUNE.tokenCloser ? best : current;
}
export const rangedSlots = (d) => TUNE.rangedSlots[d] ?? 1;
export const airSafe = (heroY, groundBelow) => heroY - groundBelow > TUNE.airSafe;
export function beatsToPunch({ heroImpactIn, enemyImpactIn, sameMoveRun = 1, heavy = false, boss = false }) {
  if (heavy || boss || sameMoveRun >= TUNE.sameMoveLimit) return false;
  return heroImpactIn <= enemyImpactIn;
}
export function createTokens() {
  let holder = null, repick = 0, hold = 0, slots = 1;
  const ranged = new Set();
  const meleeOK = (e) => able(e) && (!e.A.ranged || e.disarmed);
  return {
    update(dt, list, heroP, { difficulty = 'amazing', groundBelow = 0, dist }) {
      hold = Math.max(0, hold - dt);
      repick -= dt;
      slots = rangedSlots(difficulty);
      if (airSafe(heroP.y, groundBelow)) holder = null;
      else if (repick <= 0 || !holder || !meleeOK(holder)) { holder = pickMeleeHolder(list.filter(meleeOK), heroP, holder, dist); repick = TUNE.tokenRepick; }
      for (const e of [...ranged]) if (!able(e) || (e.state !== 'windup' && e.state !== 'strike')) ranged.delete(e);
    },
    mayMelee(e) { return hold <= 0 && e === holder; },
    // Claims a ranged slot (kept while that enemy winds up and fires).
    mayRanged(e) { if (hold > 0) return false; if (ranged.has(e)) return true; if (ranged.size >= slots) return false; ranged.add(e); return true; },
    holdAll(s) { hold = Math.max(hold, s); },
    get held() { return hold > 0; },
    get holder() { return holder; },
  };
}
```
- [ ] **Step 5:** tests pass. **Step 6:** commit `Combat tuning and token rules`.

### Task 2: Enemies use tokens, white-to-red telegraphs, readable windups

**Files:** Modify `src/combat/enemies.js`, `src/combat/combat.js`, `src/ui/combatHud.js`, `src/game/game.js` (sense feedback), CSS in the HUD stylesheet. Test `tests/unit/combat.test.js` (update the canAttack test to the token module; keep `canAttack` exported for bosses that still call it).

**Interfaces:**
- Consumes: `createTokens`, `TUNE`.
- Produces: events `enemyWindup { e, at, ranged, heavy }` (heavy replaces unblockable), `enemyRed { e }` fired when `strikeAt - t <= TUNE.redWindow`; enemy field `e.redAt`; `enemies.tokens` (the token object, so heroCombat can `holdAll`); `enemies.step` ctx gains `groundBelow`.

- [ ] Step 1: In `enemies.step`, create `tokens` once in `createEnemies`, call `tokens.update(dt, list.filter(non boss, non puppet), hp, { difficulty, groundBelow: ctx.groundBelow ?? 0, dist })` at the top. Replace `canAttack(list, maxA)` in `engage` with `(A.ranged && !e.disarmed ? tokens.mayRanged(e) : tokens.mayMelee(e))`. Off-screen shooters: `ctx.onScreen?.(e) === false` adds `TUNE.offscreenDelay` to `strikeAt`.
- [ ] Step 2: Windup length: melee `A.heavy ? TUNE.windupHeavy : TUNE.windupLight`; sniper keeps `TUNE.sniperLaser`; gunners `rng in TUNE.rifleEvery` as cooldown. Remove per-archetype `windup` for melee (keep for ranged and bosses).
- [ ] Step 3: Readable pose: on windup play the attack clip at `timeScale` such that the clip reaches 40% of its length at `strikeAt - redWindow` (slow anticipation), then at the red moment set `action.timeScale` so the remaining 60% plays in 0.18 s (the snap). Store the action as `e.windAction`.
- [ ] Step 4: Fire `enemyRed` once per attack when entering the red window; set `e.red = true`.
- [ ] Step 5: Ground melee does not swing at an airborne hero: when the strike lands and `airSafe(hp.y, groundBelow)` is true, it is a miss.
- [ ] Step 6: HUD: `sense(e, heavy, ranged)` shows the head squiggle white (light) or the yellow ring anchored over the enemy (heavy); a new `red(e)` turns it red. Off-screen arcs keep working.
- [ ] Step 7: Tests: token unit tests still pass; add a vitest for the windup timing helper `windupFor(A)` exported from enemies.js (light 0.6, heavy 0.9). Run `npx vitest run`.
- [ ] Step 8: commit `Enemies take turns, telegraph white to red, and leave the air alone`.

### Task 3: Combat clip pipeline (Gotham kicks now, Mixamo later)

**Files:** Port `scripts/retarget-mocap.mjs` from gotham-for-mansi with edits below; `package.json` devDependencies `@gltf-transform/core`, `@gltf-transform/extensions`; create `scripts/fbx2glb.mjs`, `scripts/mixamo-fetch.js`; create `src/combat/clipData.js` (generated), `public/assets/anims_combat.glb` (generated; starts as a copy of Gotham's `anims_mocap.glb`, whose hero_m.glb is byte-identical to ours); modify `src/hero/model.js`. Test `tests/unit/clips.test.js`.

**Interfaces (produces):**
- `loadCombatClips(assets, base)` async: loads `anims_combat.glb`, sanitizes, adds to `assets.clips`; resolves `true`; safe to call once after `state.ready`.
- `CLIP_DATA[name] = { duration, contact, limb, reach, fps, root: [x0,z0,x1,z1,...] }`.
- `hasClip(assets, name)`.

- [ ] Step 1: Copy `anims_mocap.glb` to `public/assets/anims_combat.glb` and Gotham's generated `mocapData.js` content to `src/combat/clipData.js` renamed `CLIP_DATA`.
- [ ] Step 2: Port the script. Changes: `--out` default `public/assets/anims_combat.glb`; data path `src/combat/clipData.js` with export `CLIP_DATA`; `--map mixamo|meshy` (Mixamo map strips `mixamorig:`/`mixamorig1:` prefixes then maps Hips, Spine, Spine1, Spine2, Neck, Head, Left/RightShoulder, Arm, ForeArm, Hand, UpLeg, Leg, Foot, ToeBase to pelvis, spine_01, spine_02, spine_03, neck_01, Head, clavicle, upperarm, lowerarm, hand, thigh, calf, foot, ball); `Name=file.glb[:limb][@contact]` where `@0.42` forces the contact time; `--mirror Name` emits `Name_M` with left and right swapped and x negated; `--append` merges with the clips already in the output file so batches can be added. Mixamo's Y Bot is a T-pose like our skeleton, so the world-delta transfer holds without uploading our mesh.
- [ ] Step 3: `scripts/fbx2glb.mjs in.fbx out.glb`: launches muted headless Chromium on a data page that imports three from node_modules via Vite's dev server (`http://localhost:5310/@fs/...`), parses with FBXLoader, exports with GLTFExporter `{ binary: true, animations }`, returns bytes. Runs one file per page, sequentially.
- [ ] Step 4: `scripts/mixamo-fetch.js`: a function to paste into the owner's logged-in mixamo.com tab (run through the Chrome extension's JavaScript tool, never the mouse). It searches each name from a list, exports FBX (skin on, 30 fps, no keyframe reduction) for Y Bot, polls the job and triggers the download. List lives at the top of the file (spec 2.2).
- [ ] Step 5: `loadCombatClips` in model.js plus a call in game.js after `state.ready = true` (not awaited by the loader screen).
- [ ] Step 6: Test: every `CLIP_DATA` entry has `0 < contact < duration`, `root.length === 2 * (round(duration * fps) + 1)`, and the five kicks exist.
- [ ] Step 7: Load-time check `node scripts/load-time.mjs` stays at or under 2.1 s. Commit `Combat clip pipeline with mocap kicks`.

### Task 4: Moves, clip choice and the input buffer

**Files:** Create `src/combat/moves.js`. Test `tests/unit/moves.test.js`.

**Interfaces (produces):**
- `MOVES`: `{ jab, cross, round, ender, launcher, air1..air4, spike, strike, dodge, perfect }`, each `{ clip, alt, time, impact, kind, push, lift, stop }` where `alt` is the Quaternius fallback and `stop` names a `TUNE.stop` key.
- `chooseMove({ d, dy, step, grounded, webbed, wallNear, holdT })` returns a move key: `strike` when `d > TUNE.lungeBand`, `launcher` when `holdT >= TUNE.launchHold` and grounded, air keys when `dy > TUNE.airBand` or not grounded, `throw` when webbed, otherwise the string step `['jab', 'cross', 'round', 'ender'][step % 4]`; lunge flag when `d > TUNE.closeBand`.
- `createBuffer()` returns `{ press(kind, now), take(kind, now) }`: a press is kept `TUNE.buffer` s.
- `canChain(move, t)`: `t >= move.time * TUNE.chainFrom`.

- [ ] Step 1: tests for each band, the hold launcher, the buffer expiring at 0.15 s, chain from 55%.
- [ ] Step 2: implement; clips: jab `Punch_Jab`, cross `Punch_Cross`, round `Kick_Round` (alt `Melee_Hook`), ender `Kick_Spin` or `Kick_Flying` alternating (alt `Melee_Hook`), launcher `Flip_Kick` (alt `Melee_Hook`), air hits `Kick_Front`, `Knee_Strike`, `Kick_Round`, spike `Kick_Flying`.
- [ ] Step 3: pass, commit `Move table, clip choice and input buffer`.

### Task 5: Motion warping

**Files:** Create `src/combat/warp.js`. Test `tests/unit/warp.test.js`.

**Interfaces (produces):** `planWarp({ root, fps, contact, from, facing, to, gap = TUNE.contactGap, clamp = TUNE.warpClamp })` returns `{ at(t) -> {x, z}, yaw(t), scale }`: the clip's root track rotated to face the target and scaled so the root at `contact` ends `gap` from `to`; extra travel is clamped at `clamp` m beyond the clip's own; `yaw(t)` turns from `facing` to the target over the first `TUNE.faceBy` of the clip.

- [ ] Step 1: tests: a straight root of 1 m with target 3 m ahead lands at 2 m (gap 1); target 10 m ahead clamps at 1 + 4 m; yaw is target-facing by 30%.
- [ ] Step 2: implement; heroCombat applies `at(t+dt) - at(t)` as a velocity through `applyDv(body, 'surface', ...)` so physics stays honest.
- [ ] Step 3: pass, commit `Motion warping onto the target`.

### Task 6: Hero move player, per-body hitstop and the animation layer

**Files:** Rewrite `src/combat/heroCombat.js`; create `src/combat/hitstop.js`, `src/hero/combatAnim.js`; modify `src/hero/pose.js`, `src/combat/enemies.js` (stopT, shake), `src/game/game.js` (hero freeze). Tests `tests/unit/hitstop.test.js`, extend `tests/unit/combat.test.js` with a headless move-player test using fake hero and enemies.

**Interfaces:**
- `hitstop.js`: `stopFor(kind)` returns seconds capped at `TUNE.stopCap`; `shake(t, amp)` returns an offset `{x, z}`.
- heroCombat state machine: `free | move | dodge | hurt`; `c.move = { key, t, plan, hitDone, clip }`; events `moveStart { key, clip, speed }`, `contact { e, key }`, `dodge { perfect }`, `perfectCounter { e }`; `c.heroStop` seconds (game.js advances the hero 0 steps while it is above 0); `enemies.freeze(e, s)` sets `e.stopT`.
- Combo counter resets after `TUNE.comboReset` without a hit or on damage; misses do not reset.
- Dodge: own input in a fight (C while any enemy is engaged; outside a fight C stays dive); cancels any non-finisher move at any time; `TUNE.dodgeTime`, `TUNE.dodgeIframes`, `TUNE.dodgeDist` away from the threat; calls `enemies.tokens.holdAll(TUNE.dodgeHold)`; perfect when the threat is in its red window: web shot to the face (enemy `stunned` for `TUNE.perfectStun`), slow motion `TUNE.perfectScale` for `TUNE.perfectSlow` with `TUNE.perfectRamp`, ended early by the next attack press.
- Beat to the punch: when a hero move is active, enemies whose `beatsToPunch` is true cancel their windup to `stagger`.
- Launcher: hold attack `TUNE.launchHold` next to a non-heavy target lifts it `TUNE.launchHeight`; an attack press within `TUNE.followWindow` jumps the hero after it; in the air both bodies get gravity cancelled (`applyDv 'assist'`) while hits land within `TUNE.airKeep`; air hit 4 spikes the enemy down; hold web in the air slams with `TUNE.slamSplash`.
- Web strike: zip at `TUNE.strikeSpeed`, stop `TUNE.strikeStop` short in a kick, rebound `TUNE.rebound` up and back.
- combatAnim: `play(key, clip, { speedCurve })` drives `action.time` per phase (anticipation x1.6, contact x1.0, recovery x1.3); `active` true while a combat clip runs; pose.js uses clips (procW 0) and an upright basis facing `c.faceYaw` while `active`, in the air too.

- [ ] Step 1: hitstop tests (cap, kinds).
- [ ] Step 2: move-player test with fakes: a jab started 1.2 m from a target lands exactly one hit at its impact time; a press at 60% chains, a press at 30% is buffered and fires at 55%; a dodge cancels a move; a perfect dodge in the red window stuns the attacker and holds the others.
- [ ] Step 3: implement; keep the existing takedown, special, gadget, yank, finisher and heal paths unchanged (they move to block 3).
- [ ] Step 4: game.js: `const heroDt = combat.heroCombat.c.heroStop > 0 ? 0 : gdt; const adv = fixed.advance(heroDt);` and decrement `heroStop` by real `dt`.
- [ ] Step 5: `npx vitest run`, all green. Commit `Hero move player, per-body hitstop and combat clips`.

### Task 7: Hit feel and enemy reactions

**Files:** `src/combat/enemies.js`, `src/combat/combat.js`, `src/game/fx.js`, `src/camera/cameraRig.js` (kick input).

- [ ] Reactions by hit: light stagger (`Hit_Chest`/`Hit_Head`), ender knockdown (`Hit_Knockback` then down then `LayToIdle` as kip-up), launcher launched (held `Hit_Knockback` pose), webbed: a held frame of `Hit_Knockback` with arms in (not Death01), pinned: the same frame against the wall, shrug for blocked. Death01 only for `out`.
- [ ] Camera kick `TUNE.camKick` and FOV punch `TUNE.fovPunch` on contact; impact frame on enders.
- [ ] Victim shakes `TUNE.shake`, hero `TUNE.shake * TUNE.shakeHero`; collision positions do not move during shake (draw offset only).
- [ ] Verify with `node scripts/moves-film.mjs` frame sheet. Commit `Hit feel and readable reactions`.

### Task 8: Combat camera, facing and forgiving inputs

**Files:** `src/camera/cameraRig.js`, `src/game/game.js` (view gets `fight: { enemies, threat }`), `src/hero/controller.js`, `src/core/input.js`, `src/combat/enemies.js` (`pickTarget` stick first). Tests: `tests/unit/camera.test.js`, `tests/unit/controller.test.js`, `tests/unit/combat.test.js`.

- [ ] Combat framing when an engaged enemy is within 14 m: distance `clamp(6 + 0.35 * spread, 6, 9.5)`, pitch toward 0.38, shoulder 0.1, FOV +4, focus pulled 25% toward the mean of the 3 nearest; auto-yaw toward the nearest threat after 0.5 s without look input (mouse moves under 1.5 px count as no input).
- [ ] `pickTarget(heroP, camFwd, enemies, max, stick)` scores by the stick direction when the stick is pushed, the camera otherwise.
- [ ] Jump buffer 0.12 s (use `lastJumpPress`), coyote time 0.08 s after leaving the ground, swing retry for 0.25 s when no anchor was found, pad curve `0.3x + 0.7x^3`.
- [ ] Tests for each; commit `Combat camera, stick targeting and forgiving inputs`.

### Task 9: Mixamo clips (needs the owner's login once)

- [ ] Owner logs into mixamo.com in Chrome. In that tab, run `scripts/mixamo-fetch.js` through the extension's JavaScript tool (no mouse). Files land in Downloads; move them to `assets-src/mixamo/` (gitignored, never redistributed raw).
- [ ] `node scripts/fbx2glb.mjs` each, then `node scripts/retarget-mocap.mjs --map mixamo --append Flip_Kick=... Aerial_Evade=... Corkscrew_Evade=... Backflip=... Martelo_2=... Armada=... Meia_Lua_De_Compasso=... Receiving_An_Uppercut=... Sweep_Fall=... Knocked_Down=... Kip_Up=... Hurricane_Kick=... Scissor_Kick=... Flying_Kick=...`.
- [ ] Point MOVES and reactions at them (dodge left and right use `Aerial_Evade` and its mirror, perfect dodge `Corkscrew_Evade`, launcher `Flip_Kick` paired with `Receiving_An_Uppercut`, knockdown `Knocked_Down` then `Kip_Up`).
- [ ] Credits list Mixamo and CMU. Clip tests updated. Commit `Mixamo combat clips`.

### Task 10: Pilots, films and the block gate

- [ ] combat-check.mjs: dodge on `red` instead of distance, prefer air hits when 3 or more are close; must win with no console errors.
- [ ] Gate: `npx vitest run`; `cd server && npx vitest run`; `npx playwright test`; swing, combat, roster, content, postgame, mp checks; story-walk; playthrough; boss-check (29); fps-check on a frozen build (GPU p95 at most 6.9 ms); load-time (at most 2.1 s); webkit-check.
- [ ] Films for the owner: combat before (main) and after (polish), frame sheets of a street fight and Kingpin.
- [ ] `git merge --ff-only polish` into main after a green gate. Update memory.
