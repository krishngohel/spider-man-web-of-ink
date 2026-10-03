# Block 3: combat breadth and the traversal camera, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The swing camera stops ending up low and staring at walls; webs connect without craning
up; webs become crowd control (cocoon, wall pins, throws, rockets back); failed moves say why;
finishers are short and cinematic; bosses telegraph and stage like set pieces.

**Architecture:** Camera rules stay in the pure, tested cameraRig.js (state-driven shoulder, pitch
limits, collision whiskers, eased look-ahead, FOV curve, attach kick). The aim search stays
crosshair-exact first, then falls back to a wider ring and an upward column (the HUD preview shows
the real point). Combat additions live in heroCombat.js and enemies.js with numbers in tuning.js.
Boss staging is a small director helper (intro, stun glow, ground warnings, slow-motion defeat,
retry from the current phase).

Spec: docs/superpowers/specs/2026-10-02-overhaul-research-spec.md 1.6, 1.7, 1.9, 1.10, C1 to C6.

## Global Constraints
- No em or en dashes in copy. Commits solely by Krishn Gohel, no trailers. Muted test browsers.
- Every gate, plus a boss film and a swing film reviewed by eye (block 1 lost boss poses because no
  gate looks at animation).
- The owner's rule stays: a web goes where the crosshair points when the crosshair is on something.

### Task 1: C1 aim fallback
- [ ] anchors.js findAimPoint: direct ray; else a ring at 1.2, then 5 degrees; else an upward column
  (5, 10, 15, 22 degrees above the crosshair, preferring the lowest hit that is in range). Tests:
  a wall straight ahead still takes the exact point; a building above-ahead is found from a level
  aim; nothing behind the hero is ever chosen.

### Task 2: C2 to C6 camera
- [ ] Airborne pitch limited to -0.6 rad (looking up); camera never more than 1 m below the hero
  while flying.
- [ ] View passes `wall`, so the wall camera runs; look input under 1 px counts as none for the
  auto-follow; on web attach the pitch eases back toward level unless the player is steering.
- [ ] Collision: two side whiskers 0.25 m out; the look-ahead ray eases the camera in (rate 3)
  instead of slamming it.
- [ ] Shoulder by state: ground 0.6, air 0.3, swing 0.15, zip 0.2, wall 0.1 (fight framing on top).
- [ ] FOV curve over 15 to 55 m/s; a 0.35 m dolly kick on web attach, decaying in 0.4 s.
- [ ] Tests for each rule in camera.test.js; swing-check stays green; swing film reviewed.

### Task 3: 1.6 webs as crowd control
- [ ] Web shots: 6 to cocoon a thug (TUNE.webShots); capacity 6 refilling 1 per 1.5 s, shown on the
  HUD as six pips; webbed thugs struggle (block 1) and break free after 8 s unless pinned.
- [ ] Yank a webbed enemy (hold the yank key 0.3 s): swing him round and throw him along the stick
  or camera; he sticks to a wall or the ground he hits (pinned, out).
- [ ] A rocket in flight can be webbed (web shot hits it) and is thrown back at its shooter.

### Task 4: 1.7 telling the player why
- [ ] Hints (word bubbles, rate-limited): launcher on a brute "TOO HEAVY: WEB HIM", punches into a
  shield "FLIP OVER OR YANK THE SHIELD", melee on a jetpack in the air "WEB STRIKE UP", ground
  attack on a whip at range "GET IN CLOSE". No em dashes.

### Task 5: 1.9 finishers and takedowns
- [ ] Finisher: a 1.0 s move (ender clip, invulnerable), hitstop and a short camera push-in that
  never outlasts it; setting `finisherSlowmo` (on by default) in accessibility.
- [ ] Stealth takedown: a 0.8 s low camera on the guard.

### Task 6: 1.10 boss staging
- [ ] Stun glow: a pulsing outline tint on the boss while stunned (an uniform on its material).
- [ ] Ground warnings: a red inked ring on the ground for area attacks (slam, quake, sand wave,
  pulse) for the windup's length.
- [ ] Intro: letterbox bars and a 1.2 s push-in on the boss when the fight starts (skippable).
- [ ] Defeat: 0.8 s slow motion and a held frame.
- [ ] Retry from the current phase: boss modules expose `phase` and accept `startPhase`; the
  director keeps the phase across a retry (health set to that phase's start).

### Task 7: gate
- [ ] Unit, server, e2e, swing, combat, roster, content, postgame, mp, story-walk, playthrough,
  boss-check, fps frozen, load, webkit, boss film, swing film; code review; merge.
