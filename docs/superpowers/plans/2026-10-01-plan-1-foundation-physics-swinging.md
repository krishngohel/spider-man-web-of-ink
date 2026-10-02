# Plan 1: Foundation, Physics and Swinging - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable free-swing build in a blockout city: real rope-physics swinging, zip, wall
run, web wings, dive, the comic ink look, a camera that keeps up, settings, and a dev tuning
panel. This is the build the owner playtests before anything else is stacked on it.

**Architecture:** A Three.js-free physics core (`src/physics`, `src/hero/controller.js`) runs at
a fixed 240 Hz and is fully unit-tested. Every velocity change goes through one impulse ledger
with a whitelist of physical sources. Rendering, input, camera and UI are thin layers around it,
ported from Gotham where Gotham already solved the problem.

**Tech Stack:** Vite 8, Three.js 0.186.1, vitest 5, Playwright 1.63 (playwright-core for scripts).

## Global Constraints

- Physics rule (spec 4.2): velocity changes only from gravity, air drag, aerodynamic lift (web
  wings and skydiver-style body lift used for steering), rope tension (pull only, toward the
  pivot), or a push off a real surface. No mid-air jumps, no scripted arcs.
- Fixed step 1/240 s, at most 8 substeps per frame.
- Gravity Comic 19.62 m/s^2 (default) or Real 9.81 m/s^2.
- Terminal velocity 60 m/s normal, 85 m/s dive, under both gravity settings.
- Web length 6 to 70 m, travel time 0.06 s, max winch tension 12 kN, winch speed 10 m/s.
- Hero mass 80 kg, capsule radius 0.4 m, height 1.8 m.
- No em or en dashes in any user-facing copy; tests build the dash characters from char codes.
- Every test browser is muted (Chromium `--mute-audio`, WebKit in-page volume 0).
- Commits are authored by Krishn Gohel only, with no AI co-author trailer.
- Title screen and README carry: "Unofficial fan game. Not affiliated with or endorsed by Marvel
  or Sony. Spider-Man and related characters are trademarks of Marvel."

## File map

```
package.json, vite.config.js, playwright.config.js, index.html, .gitignore, README.md
public/assets/hero_m.glb, anims1.glb, anims2.glb      (copied from Gotham's build, CC0 Quaternius)
src/main.js                    boot: WebGL2 check, phone screen, startGame
src/core/rng.js                seeded mulberry32 (port)
src/core/fixedStep.js          accumulator, 240 Hz, max 8 steps, reports alpha
src/core/bindings.js           actions + default keys + rebind (new action list)
src/core/input.js              keyboard/mouse/pad actions (simplified port)
src/core/settings.js           settings + sanitize + storage (new key)
src/physics/vec3.js            allocation-free vector helpers
src/physics/constants.js       every tunable, with a live `tune` object for the dev panel
src/physics/ledger.js          impulse ledger: applyDv(body, source, dx, dy, dz)
src/physics/world.js           static boxes, spatial hash, raycast, capsule overlap/resolve
src/physics/aero.js            drag, body lift steering, web-wing glide polar
src/physics/rope.js            rope constraint: slack, give, reel, tension cap, wrap, two-body
src/physics/anchors.js         raycast fan anchor search + scoring + assist levels
src/hero/controller.js         hero state machine (ground, air, swing, zip, wall, glide, dive)
src/world/testCity.js          blockout city data (boxes, districts, seeded per district)
src/world/cityMesh.js          merged chunk meshes, facade window shader, ground, trees
src/world/sky.js               gradient sky dome
src/render/*                   renderer, inkPipeline, toon, dynamicRes, frameCap, quality,
                               layers, palette (ports)
src/hero/model.js              hero body + procedural classic suit paint
src/hero/pose.js               animator + procedural swing/wall/dive poses with limb IK
src/hero/limbIK.js             two-bone IK (port)
src/hero/webLine.js            web strands (through wrap pivots)
src/camera/cameraRig.js        follow camera math (pure) + collision clamp
src/audio/sfx.js               WebAudio thwip, wind, land, zip
src/ui/style.css, title.js, hud.js, menu.js, devPanel.js, help.js
src/game/game.js               assembly, loop, test hooks (window.__game)
tests/unit/*.test.js, tests/e2e/smoke.spec.js
scripts/swing-check.mjs, scripts/webkit-check.mjs, scripts/shot.mjs, scripts/fps-check.mjs
```

---

### Task 1: Scaffold and ported basics

**Files:** package.json, vite.config.js, playwright.config.js, index.html, .gitignore, README.md,
src/main.js, src/core/rng.js, src/core/fixedStep.js, public/assets/*, tests/unit/core.test.js

**Produces:** `createRng(seed)` (next, range, int, pick, chance); `createFixedStep({step, maxSteps})`
with `advance(dt) -> {steps, alpha}`, dropping time beyond maxSteps (game slows, no spiral).

- [ ] Write tests: rng is deterministic per seed; fixedStep at dt=1/60 gives 4 steps; at dt=0.2
      gives 8 steps and does not carry the excess into the next frame.
- [ ] Run, see them fail. Implement. Run, see them pass.
- [ ] `npm run build` succeeds; dev page shows the loading screen.
- [ ] Commit "Scaffold: Vite, Three, tests, CC0 hero assets".

### Task 2: Vectors, constants, ledger, aero

**Produces:**
- `constants.js`: `G = { comic: 19.62, real: 9.81 }`, `STEP = 1/240`, `MAX_SUBSTEPS = 8`,
  `HERO = { mass: 80, radius: 0.4, height: 1.8 }`, `TERMINAL = 60`, `DIVE_TERMINAL = 85`,
  `WEB = { min: 6, max: 70, travel: 0.06, give: 0.03, winchSpeed: 10, winchTension: 12000,
  flickSpeed: 26, flickTension: 30000, flickTime: 0.12, zipSpeed: 34, zipTension: 30000 }`,
  `GLIDE = { cl: 0.049, ratio: 3.5, stall: 9 }`, `BODY_LIFT = 0.0045`, `MAX_SPEED = 110`, and a
  mutable `tune` object holding all of these for the dev panel.
- `ledger.js`: `SOURCES = ['gravity','drag','lift','rope','surface']`;
  `createBody({mass})` -> `{ p, v, mass, log }`; `applyDv(body, source, x, y, z)` throws on an
  unknown source and accumulates `body.log[source]`.
- `aero.js`: `dragK(g, terminal)` = g / terminal^2; `applyDrag(body, k, dt)`;
  `applyBodyLift(body, dirX, dirZ, amount, dt)` (perpendicular to velocity, magnitude
  BODY_LIFT * |v|^2 * amount, does no work); `applyGlide(body, pitch, g, dt)` lift/drag polar
  with stall fade.

- [ ] Tests: free fall reaches 60 m/s (Comic and Real) within 1%; dive k reaches 85; body lift
      never changes speed by more than 0.5% per second (only direction, minus nothing);
      glide at neutral pitch settles to a descent ratio of 3.5 +/- 0.3; ledger rejects
      'magic'; sum of logged dv equals v_end - v_start.
- [ ] Implement, pass, commit "Physics core: constants, impulse ledger, aero".

### Task 3: Collision world

**Produces:** `createWorld()` with `addBox({min:[x,y,z], max:[x,y,z], kind})`, `build()` (spatial
hash, 20 m cells, 2D xz), `raycast(ox,oy,oz, dx,dy,dz, maxDist) -> {t, x,y,z, nx,ny,nz, box} | null`,
`resolveCapsule(body, out)` that pushes a vertical capsule (3 spheres) out of boxes and the ground
plane y=0, removes inward velocity through the ledger ('surface'), and reports contact flags
`{ground, wall, ceiling, nx, nz, box}`. Kinds: 'building', 'tree', 'prop'.

- [ ] Tests: raycast hits the right face with the right normal; a ray inside a box reports the
      exit-free first hit as null-safe; capsule resting on a roof is grounded; 10,000 random
      trajectories at up to 110 m/s integrated at 240 Hz never end inside a box.
- [ ] Implement, pass, commit "Collision world: boxes, hash, raycast, capsule".

### Task 4: Rope

**Produces:** `createRope()` -> `{ active, pivots: [{x,y,z,sign}], anchor, length, tension,
attach(anchor, body), release(), reel(rate), step(body, dt, world) }`. Anchor is
`{x,y,z, body?}` (body for moving anchors, with mass and velocity).
Algorithm per substep (after gravity/drag/lift velocity update, before position update):
1. d = |p - pivot|. If taut (d >= length - eps) and radial velocity vr > -reelRate: the hold
   impulse removes vr up to 0; the extra reel impulse pushes vr to -reelRate. Tension =
   mass * dv / dt. If tension exceeds the winch limit, the reel part is dropped (the winch
   stalls, the rope still holds). Impulses go through the ledger as 'rope'.
2. After the position update: if d > length * (1 + give), project position back to the sphere.
3. Length shrinks by the realized reel distance.
4. Wrap: if the segment pivot->hero hits a building box, insert a pivot at that box's vertical
   edge crossed by the swept triangle (offset 0.05 m out), remaining length decreases by the
   new segment, store the turn sign. Unwrap when the turn sign flips.
5. Moving anchor: impulse shared by mass ratio.

- [ ] Tests: energy within 1% over 20 s with drag off (Comic and Real); angular momentum about
      the pivot within 2% during a reel from 30 m to 15 m; length never exceeded beyond 3%;
      slack rope applies zero impulse; winch stalls above 12 kN; wrap inserts a pivot when
      swinging past a corner and removes it on the way back; a light body is pulled by a heavy
      anchor more than the reverse.
- [ ] Implement, pass, commit "Rope: inextensible web with winch, wrap, moving anchors".

### Task 5: Anchor search

**Produces:** `findAnchor(world, hero, opts) -> {x,y,z, box, dist, score} | null` where opts =
`{ camX, camY, camZ (camera forward), moveX, moveZ (input dir in world), assist: 'off'|'normal'|'high', groundY }`.
Casts a fan of rays (elevations 30 to 75 degrees, azimuths around the preferred direction,
5 x 7 on Normal, 3 x 5 on Off, 7 x 9 on High), keeps hits with height above the hero >= 5 m and
distance 6 to 70 m, scores by direction match, distance from the ideal (20 + 0.4 * speed,
clamped 20 to 45), and swing-bottom clearance (pivot.y - dist >= groundY + 2). Assist only
changes the fan and the weights.

- [ ] Tests: in an avenue between two towers a forward anchor is found on a facade; in the open
      park with no trees there is none; never returns a point inside a box; line of sight holds;
      high assist finds an anchor in at least as many cases as off over 200 random positions.
- [ ] Implement, pass, commit "Anchor search: raycast fan with scoring".

### Task 6: Hero controller

**Produces:** `createHero(world, settings)` -> `{ body, state, rope, facing, contact, step(intent, dt),
debug }`. `intent` = `{ moveX, moveZ (world, length <= 1), camFwd:{x,y,z}, swing (held),
swingPressed, swingReleased, jump (held), jumpPressed, zipPressed, divePressed, dive (held) }`.
States: 'ground', 'air', 'swing', 'zip', 'wall', 'glide'. Moves follow spec 4.5:
- ground: accelerate toward target speed (run 9, parkour 14 while swing held) at 40 m/s^2 via
  'surface'; jump 9.5 m/s up ('surface'); walking off a roof is just falling.
- air: gravity, drag (dive k when dive held), body lift steering from input; swingPressed
  shoots a web (anchor search, 0.06 s travel delay) and enters 'swing' when it lands; space held
  with no rope enters 'glide'.
- swing: rope.step; space held reels at winch speed; space tap in the last 0.25 s before
  release (or release within 0.25 s of a tap) adds a 0.12 s flick reel at flickSpeed; releasing
  swing lets go. Ground contact releases the rope.
- zip: target from the camera ray (or best anchor within 15 degrees of it, 60 m max); rope reel at
  zipSpeed; arrival within 1.2 m: on a top surface -> ground (perch), on a wall -> wall; jump
  within 0.4 s of arrival is a point launch (surface push 16 m/s along camera forward tilted
  up 25 degrees).
- wall: stuck; tangential velocity decays at 12 m/s^2; swing held runs up at 9 m/s; WASD crawls
  at 3 m/s; jump pushes off (normal 8 + up 6); reaching the top edge with upward speed vaults
  (surface push up 5, inward 4) and lands on the roof.
- glide: aero glide, pitch from moveZ input; lands -> ground.
- Superhero landing flag when vertical impact speed > 18.
- Physics-rule harness: only the five ledger sources ever change velocity.

- [ ] Tests: standing still stays still; running reaches 9 m/s; a swing from a 30 m anchor carries
      forward after release; reel at the bottom increases speed; tapping jump mid-air without a
      rope or wall does nothing to velocity (no air jump); wall stick removes normal velocity;
      wall run gains height; zip reaches its target; point launch adds speed; random fuzz of
      2,000 intents keeps ledger sources inside the whitelist and Σdv == Δv.
- [ ] Implement, pass, commit "Hero controller: swing, zip, wall, glide, dive".

### Task 7: Blockout city

**Produces:** `buildTestCity(seed)` -> `{ boxes, districts, spawn, bounds }`. 1,000 x 800 m:
avenues every 120 m (30 m wide, N-S), streets every 60 m (18 m wide, E-W). Districts with their
own rng seeds: 'midtown' (towers 60 to 180 m), 'lowrise' (8 to 22 m), 'park' (200 x 300 m,
trees as 8 to 14 m boxes with 4 x 4 m crowns), 'harborEdge' (piers, cranes as tall thin boxes).
Plus one 260 m landmark tower. City-layout snapshot test (count and checksum of footprints).

- [ ] Tests: deterministic per seed; districts independent (changing park seed does not move
      midtown boxes); no box overlaps a street; spawn is on a roof.
- [ ] Implement, pass, commit "Blockout test city".

### Task 8: Rendering, look and city meshes

Port `renderer.js`, `inkPipeline.js` (keep wobble, edges, halftone, misreg, paper; drop the
detective and x-ray branches), `toon.js` (toonGradient, toonMaterial), `dynamicRes.js`,
`frameCap.js`, `quality.js` (low, medium, high), `layers.js`, and a new `palette.js` with a bright
comic day palette. `cityMesh.js` merges boxes per 250 m chunk into one geometry per chunk with a
facade shader (world-space window grid, lit windows at dusk), roofs darker, ground with roads,
sidewalks and lane marks from a world-space shader, trees as cylinders + crowns. `sky.js`
gradient dome on LAYER_FX.

- [ ] Unit tests for dynamicRes and frameCap come over with the ports.
- [ ] Visual check with scripts/shot.mjs (muted, headless): the city reads as a comic panel.
- [ ] Commit "Comic renderer and city meshes".

### Task 9: Hero model, suit paint, poses, web lines

`model.js` loads hero_m.glb, paints a classic red-and-blue suit per vertex from dominant bone and
bind position (red head, chest center, forearms, gloves, boots; blue sides, upper arms, thighs),
with a shader for black web lines (radial lines and rings around the chest and head centers), a
chest spider emblem, and white eye lenses with black rims. `pose.js` drives ground clips
(Idle_Loop, Jog_Fwd_Loop, Sprint_Loop, Jump_Loop, Jump_Land, Roll, NinjaJump_Idle_Loop) and
procedural air poses: in a swing the body's up axis follows the rope and the web hand is IK-locked
to the strand, legs tuck at the bottom; dive tucks; wall crawl orients to the wall; glide spreads
arms. `webLine.js` draws the strand as thin cylinders from the hand through every wrap pivot.

- [ ] Shot check: hero readable at swing distance; strand meets the hand.
- [ ] Commit "Hero model, suit paint, swing poses, web strands".

### Task 10: Camera

`cameraRig.js` (pure math, tested): yaw/pitch from look input; distance 4.5 m at rest to 7.5 m at
60 m/s; FOV 60 to 82 with speed; after 0.8 s without look input while moving fast, yaw eases
toward the velocity heading; sphere-cast from hero to the desired spot, stop 0.3 m short; never
below ground + 0.6.

- [ ] Tests: FOV and distance curves; collision clamp; ground clamp; auto-follow only after the
      idle time.
- [ ] Commit "Swing camera".

### Task 11: Input, settings, HUD, menus, dev panel, audio

Bindings: forward/back/left/right WASD, swing ShiftLeft, jump Space, zip KeyQ, dive KeyC, help KeyH,
pause Escape and KeyP, devPanel Backquote. Gamepad: RT swing, A jump, LT+RT zip, B dive, Start pause.
Settings (new key `web-of-ink-settings-v1`): bindings, gravity ('comic'|'real'), swingAssist
('off'|'normal'|'high'), swingToggle (bool), sensitivity, invertY, fov, cameraShake, impactFrames,
quality ('low'|'medium'|'high'), renderScale, dynamicRes, showFps, volume {master, music, sfx}.
HUD: center reticle, anchor preview dot (white when an anchor is available, grey ring "no anchor"),
speed (km/h), FPS. Title screen with the disclaimer, Free Swing, Settings, Controls. Pause menu
with Resume, Settings (all of the above plus rebinding), Controls, Quit to title. Dev panel
(?dev=1 or backquote): live sliders for every `tune` value and a "copy values" button. Audio:
thwip, wind (gain and filter by speed), rope creak by tension, landing thump, zip whoosh.

- [ ] Tests: settings sanitize (bad values fall back), rebind swaps, the dash scan over all copy
      strings in src/ui.
- [ ] Commit "Input, settings, HUD, menus, dev panel, audio".

### Task 12: Game assembly and test hooks

`game.js`: loading -> title -> play. Loop: input.update -> build intent from camera -> fixedStep
substeps of hero.step -> pose/camera/render -> HUD. `window.__game` = { ready, frame, fps, hero:
{p, v, state, ropeLength, pivots, tension}, teleport(x,y,z,vx,vy,vz,yaw), setSetting(k,v),
city, tune }. `?at=swing` skips the title. `?god` unused here. Pointer lock on click; the first
click after unlock only re-locks.

- [ ] e2e smoke: title renders without console errors; Free Swing enters play; settings persist
      (gravity Real survives reload); pause menu opens on Escape.
- [ ] Commit "Assemble the free-swing build".

### Task 13: Verification scripts and gate

- `scripts/swing-check.mjs <url>`: launches muted Chromium on the frozen build, teleports the hero
  onto the main avenue, and with real key presses measures: web attaches within 0.15 s of Shift;
  holding D in a swing moves the hero to its own right; reel at the bottom gains speed; a scripted
  autopilot (hold Shift until past the bottom of the arc, release, repeat) covers 600 m without
  touching the ground and reports average speed; wall stick and wall run up a tower.
- `scripts/fps-check.mjs <url>`: flies the autopilot route and reports p50/p95 frame times.
- `scripts/webkit-check.mjs <url>`: boots in WebKit (in-page mute), enters play, swings 5 s.
- Gate: unit + e2e green; swing-check all PASS; p95 under 6.9 ms on High at 1080p on the
  owner's laptop; WebKit boots without errors; code review. Then the owner playtests.
- [ ] Commit "Swing check, fps check, WebKit check".
