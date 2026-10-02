# Web of Ink overhaul: research-backed spec

Status: research complete, nothing built or committed. Once approved, this replaces
docs/superpowers/plans/2026-10-02-overhaul-spidey-feel-and-look.md.

Tags on numbers: [PUB] published by the developer, [COMM] guides and community, [REF] a published
number from another game, [EST] our estimate, tuned in playtest. Insomniac has never published frame
data, so every millisecond value for their moves is an estimate anchored to REF numbers. All combat
numbers live in one tuning file so a playtest change is one line.

## 1. Combat

Insomniac's stated goal [PUB]: "fast-paced and sloppy, improvisational, not a perfectionist
martial-arts master like Batman." Spider-Man wins by moving: dodging, zipping, going up.

### 1.1 Enemy AI (the best-documented part)
- One melee attacker at a time, on every difficulty (the "Melee Manager", GDC 2019) [PUB].
- Job stealing: re-pick the attacker every 0.25 s; hand the token on if the holder is more than 6 m
  away or another enemy is 2 m closer [rule PUB, numbers EST].
- Ranged tokens 1 / 2 / 3 by difficulty. On-screen shooters fire first; off-screen shooters get
  +0.6 s of windup [rule PUB, value EST].
- After any player dodge, every enemy attack timer holds for 1.0 s, so you get a few free hits
  [rule PUB, value EST].
- Beat to the punch: while Spidey's hit is active, any enemy windup that would land after it is
  cancelled. Off when the same move is used 3 times in a row, for heavies and for bosses [PUB].
- The air is safe: ground melee enemies cannot attack a hero more than 1.5 m up. Only whips,
  jetpacks and guns can [PUB/COMM].
- Waiting enemies circle on a 6-slot ring (60 degrees apart), re-evaluated every 0.2 s [REF].

### 1.2 Spider-sense telegraphs
- Standard attack: white squiggle over Spidey's head from the start of the windup, turning red for
  the last 120 ms. Red is the perfect-dodge window [visual PUB, value EST].
- Heavy attack (cannot be beaten to the punch): yellow ring on the enemy turning red, with its own
  sound. Answer: dodge or jump.
- Ranged: a white laser line to Spidey that turns red. Sniper laser 1.5 s.
- Windups: light 0.6 s, heavy 0.9 s, rifle burst every 3.5 s +/- 0.5 s per gunner [EST].
- Every windup holds a readable anticipation pose, then snaps (the Gotham enemy.js pattern).
  Bosses too; today bossActor's windup pose only fires at the strike.

### 1.3 Dodge
- 0.45 s flip or vault, 3.5 m away from the threat, invulnerable for the first 0.25 s [EST].
- Every attack except finishers can be cancelled into a dodge at any moment [PUB: "absolutely every
  standard combat animation can be cancelled into a dodge"].
- Own input (C), no longer shared with dive and slam.
- Perfect dodge (inside the red window): automatic web shot to the attacker's face (1.5 s stun),
  white flash, time at 0.3x for 0.9 s with a 0.15 s ramp out. The next attack press ends the
  slow motion early [rewards PUB, values EST].
- No parry in this pass. Spider-Man 2 players complain the colours do not say dodge or parry;
  heavies here are answered by dodging or jumping.

### 1.4 Ground string with kicks
- 4 hits: jab, cross, roundhouse kick at 0.33 s each (impact at 0.11 s), then a spin or flying kick
  ender at 0.5 s that knocks the enemy back 4 m [EST].
- Chain window from 55% to 100% of each move; input buffer 150 ms [REF: Smash buffer 167 ms].
- Clip by distance: under 1.5 m a close clip, 1.5 to 4 m a lunge clip, 4 to 18 m a web-zip
  strike. Target more than 1.5 m up: air clip. Webbed target: throw. Wall within 2 m: wall-slam.
- Motion warping: the hero's root is warped over the clip's travel so the contact frame lands 1.0 m
  from the target (clamped at 4 m), and he turns to face the target during the first 30%. Today he
  only lunges past 1.3 m and never turns (controller.js:686-692).
- Target choice: stick direction first, camera second (Gotham targeting.js).
- Combo counter resets on taking damage or after 3.5 s without landing a hit. Misses never reset it
  [rule PUB-adjacent, time EST].

### 1.5 Launcher and air combo
- Hold attack 0.30 s: uppercut that lifts the enemy 3.5 m. Attack within 0.25 s follows him up.
- Air hits 0.27 s each. Gravity is off for both while hits keep landing within 0.6 s of each other.
  The 4th hit spikes him down.
- Hold web in the air: web slam with a 3 m splash.
- Jump and attack from height: a ground strike sized by the fall.

### 1.6 Web strike and web tools
- Web strike (tap web at a target): range 18 m, zip at 30 m/s, ends 1.2 m away in a kick, then a
  2 to 3 m rebound up and back, ready for the next one (Web of Shadows).
- Yank (hold web 0.30 s): pulls the enemy 6 m and spins him open. On a webbed enemy: swing him round
  and throw him along the stick.
- Webbing: 6 shots fully web a thug. With a wall or the ground within 1 m behind him, he sticks and
  is out, in a pinned pose (not the Death01 clip). Capacity 6, refilling 1 every 1.5 s [shot count
  COMM, refill EST].
- Web shots disarm gunners; rockets can be webbed and thrown back; highlighted objects can be
  yanked and flung.

### 1.7 Roster that forces variety
Thug, bat thug (launch him), shield (flip over or yank the shield), brute (web him, then hit or
throw), whip (anti-air), gunner, rocket, jetpack (web strike up to him). A hint when a move fails
("TOO HEAVY: WEB HIM").

### 1.8 Hit feel
- Hitstop on attacker and victim only: light 50 ms, ender 80 ms, launcher 80 ms, perfect counter
  100 ms, finisher or last enemy 140 ms plus slow motion; cap 150 ms [REF: Capcom 67 to 167 ms,
  Smash hitlag]. The victim shakes, the attacker less; hitboxes stay put.
- Camera kick of 2 to 4 frames and a +2 degree FOV punch; an impact frame on enders.
- Reactions: stagger, knockdown then kip-up, launch, webbed, pinned to wall, shrug for immune.
  The death clip is used only for knocked out.

### 1.9 Finishers and takedowns
Under 1.2 s, invulnerable, and the camera move never outlasts the finisher (locked slow-motion
finishers are a common Insomniac complaint). Finisher slow motion can be turned off. Stealth
takedowns get their own camera.

### 1.10 Bosses
Anticipation pose on every attack, visible openings (a glow when stunned), ground warnings before
area attacks, a short intro (letterbox, push-in), slow-motion defeat, retries resume the current
phase instead of phase 1.

### 1.11 Accessibility
Game speed 70 / 50 / 30%, a wider perfect window (+50%), hold to keep dodging [PUB, Spider-Man 2].

## 2. Animation

The current clips (Quaternius UAL, anims1/2.glb) have no kicks or flips, and enemies use Death01
for webbed, pinned, down and out (enemies.js:104).

### 2.1 Sources
- Mixamo (Adobe): free, royalty-free in games including commercial ones; raw files may not be
  redistributed; FBX only. Has the capoeira kicks, flips, evades and throws. Route: upload hero_m to
  Mixamo's auto-rigger, download the clips as FBX without skin, convert to GLB with the Blender
  command line, retarget. Needs an Adobe login.
- CMU motion capture: free, credit requested. Backup, and the source for a wall flip (90_08).
- Gotham's Meshy kicks (Kick_Front, Kick_Round, Kick_Spin, Kick_Flying, Knee_Strike): same skeleton,
  already retargeted. Licence depends on the Meshy plan: free-tier output is CC BY and personal use.
- Skipped: ActorCore (licence and cost), three's SkeletonUtils.retargetClip (unreliable).

### 2.2 Clip shortlist
- Ground kicks: Martelo 2, Armada, Meia Lua De Compasso, Leg Sweep.
- Launcher and air: Flip Kick (paired with Receiving An Uppercut), Flying Kick, Scissor Kick,
  Hurricane Kick, Front Flip.
- Dodges: Aerial Evade, Corkscrew Evade, Au To Role, Backflip.
- Webs and throws: Pulling A Rope (upper body only), Shoulder Throw (paired).
- Finishers: Inverted Double Kick To Kip Up, Spin Flip Kick.
- Enemy reactions: Sweep Fall, Knocked Down, Kip Up.
- Wall: CMU 90_08 or the Meshy wall flip.

### 2.3 Pipeline (about 1 day)
Port Gotham's scripts/retarget-mocap.mjs and extend it: a Mixamo bone map (strip "mixamorig:",
Spine to spine_01 and so on), a reference pose, per-move kind and contact times, a root yaw track,
mirroring, and paired export (attacker plus victim). Output one combat animation file, loaded after
the title screen so the 2.1 s load time does not grow. The credits list Mixamo and CMU.

### 2.4 Runtime techniques
- Sync points: each paired clip carries its contact time on both sides; the victim's reaction starts
  on the attacker's contact frame (Insomniac's sync joints [PUB]). Camera zooms hide small
  misalignment, as Insomniac did [PUB].
- Speed curves per phase (quick anticipation, sharp contact, eased follow-through), motion warping
  (1.4), upper-body masked clips (web shots while running), additive flinches, spring overshoot on
  landings, a light ragdoll for knockbacks, pinned poses, smear frames on kicks, animation on twos as
  a setting.

## 3. Graphics

### 3.1 What the code does today
- The whole scene is drawn twice per frame: once for colour, once with a normal material just to
  find edges. The post shader then reads about 30 samples per pixel.
- Dots and hatching are fixed to the screen, so the city slides under them while swinging.
- Hatching sits in near shadow and dots in far shadow: the reverse of every reference.
- Shadows use one fixed violet multiplier. Fog starts in the materials at 320 m but ink fades at
  70 to 180 m, so lines and fog disagree.
- addHullOutline exists in toon.js but nothing calls it, so heroes have no outline. Rim light wraps
  all the way round instead of only the lit side.
- cityMesh.js uses flat varyings, which put Safari's Metal backend on a very slow path (reports of
  60 fps dropping to seconds per frame).

### 3.2 Changes, in order
GPU costs are estimates on the 4060 laptop at 1080p. Budget 6.9 ms; today p95 is 5.9 ms.

| # | Change | Cost |
|---|---|---|
| G0 | Mac and Safari safety: first-vertex provoking convention at startup (or drop flat), integer hash instead of the sine hash, Mac default resolution scale 1 to 1.25, a repeat-the-pass harness to measure on Safari (its GPU timers are unreliable) | 0 |
| G1 | One-pass G-buffer: a second RGBA8 target carries normal, surface id and flags (character, no-ink, shadow amount). Every material writes it, including sky, rain, webs and effects (transparent ones write zero alpha). The normal pass is deleted. | saves about 0.8 to 2 ms |
| G2 | Composite rewrite: 2x2 edge test on depth, normal and id (about 12 samples instead of 30), ink on the near side of edges, lines 2.5 px near tapering to 1 px far, characters skipped (they get hulls), slight line wobble redrawn at 12 fps | saves about 0.1 ms |
| G3 | Fog in post: height and distance fog coloured from the sky, applied after the ink so lines fade with it; scene fog removed | +0.05 ms |
| G4 | Pattern rule: hatching only in core shadow, dots in the light falloff and glows, no hatching on characters. Building and ground patterns move into the materials and are fixed to the surfaces, with a level-of-detail crossfade, so they no longer swim. Screen dots stay for sky and characters, anchored to the character. | +0.1 to 0.3 ms |
| G5 | Shading v3: shadow colour from a small 3D colour volume over the island (per-area tint, as in Hi-Fi Rush) with a floor of 35% of the base colour; golden hour as the default; rim light on the lit side only | +0.03 ms |
| G6 | Characters: baked smooth normals, an inverted hull outline on heroes and bosses sized in pixels by distance, per-vertex line weight; a more heroic build; sharper suit lines and lenses | +0.05 ms |
| G7 | City silhouette: setback tiers on towers over 60 m with a cornice slab and parapet at each tier, also added to collision (with a test that mesh and collision match, or wall-runs snag); stair bulkheads, AC units and vents in a per-chunk detail mesh hidden past 350 m; painted fire escapes on brick; inset window shadows, 2 to 3 window types per building, lit clusters at night; a near-only interior hint | +0.2 to 0.5 ms, +1 draw per chunk |
| G8 | Skyline: 3 rings of silhouette cards in successive fog colours | under 0.05 ms |
| G9 | Effects: speed lines at swing speed and on finishers, colour misregistration for distance and speed, dot bursts, star sparks, impact frames (respecting the no-flash setting) | 0 idle, about 0.05 ms active |

G1 and G2 free 1 to 2 ms, which pays for G3 to G9.

### 3.3 Visual targets
- Into the Spider-Verse: magenta and violet shadows under warm light, cyan sky, dots that grow and
  shrink with the light, colour offset as depth of field, animation on twos.
- Hi-Fi Rush: 4-step tone, saturated mid-value environment so characters pop, dots in light,
  hatching in shadow, lines drawn inside the mesh edge.
- Ultimate Spider-Man (2005): simple boxes made rich with colour and line weight, not geometry.
- Insomniac's skyline: water towers, AC units and setbacks define the outline at distance.
- Palette rule: environment in mid values with violet or teal shadows; suit red and blue plus
  faction accents reserved for characters.

## 4. Camera and controls

### 4.1 What the code does today
- The anchor aim cone is 1.2 degrees (anchors.js:159), so you have to pitch up to find anchors.
  Pitch can reach -1.25 rad (cameraRig.js:13) and the camera sits back along the view
  (cameraRig.js:165-167), so while swinging it ends up low, staring at walls.
- The wall camera never runs: cameraRig.js:65 checks hero.wall, but the view passed in at
  game.js:526 has no wall.
- 0.01 px of mouse jitter resets auto-follow (cameraRig.js:56).
- The look-ahead collision (cameraRig.js:145-147) slams the camera in.
- The jump press is recorded (controller.js:108) but never read, so there is no jump buffer.

### 4.2 Changes
- C1 Aim: anchor search lifted 20 to 25 degrees above the view, cone widened to 4 to 6 degrees.
- C2 Swing camera: a height floor, looking up turns into a lifted look-at (Gotham camera.js:187),
  pitch limited to about -0.6 rad while airborne.
- C3 Wall camera wired up; 1.5 px mouse threshold; camera re-levels on web attach; heading smoothed
  over 0.4 s.
- C4 Collision: 0.25 m radius, side whiskers, blockers within 1 m of the hero ignored, look-ahead
  eased instead of slammed.
- C5 Shoulder offset by state: 0.6 m on foot, down to 0.1 to 0.15 m swinging and on walls.
- C6 FOV curve over 15 to 55 m/s, plus a short dolly kick on web attach.
- C7 Combat camera: distance clamp(6 + 0.35 x enemy spread, 6, 9.5) m, pitch 0.38 rad, +4 degree FOV,
  framing pulled 25% toward the 3 nearest enemies, auto-turn toward the nearest threat after 0.5 s
  without camera input (a Spider-Man 2 option [PUB]), an edge arc for off-screen attackers.
- C8 Input: jump buffer 0.12 s, coyote time 0.08 s, a 0.25 s swing retry if no anchor was found yet,
  gamepad stick curve 0.3x + 0.7x^3.

## 5. Missions and flow

### 5.1 What the code does today (Gotham comparison)
Tips expire before fights start (a 9 s timer in storyUi against a fight that starts at 70 m); there
are two tip systems; radio cannot be advanced with a key; boss retries start at phase 1.

### 5.2 Changes
- F1 One prompt queue (Gotham prompts.js): tips wait until relevant, go stale with their step, hide
  during finishers and takedowns, never more than two on screen; first-play and story tips merged.
- F2 The objective card pulses when it changes; a beacon for every travel step, hidden within 7 m.
- F3 Steps start with the hero facing the next site; retries face the objective after a short
  defeat beat; mission complete gives a beat and heals.
- F4 Radio advances with Enter and the pad; dialogue never stacks with tips.
- F5 Free roam stays quiet during act cards and comic pages; the boxy cars are replaced.
- F6 Boss intro and outro (shared with 1.10).

## 6. Order and gates
1. Animation pipeline and combat core: 1.1 to 1.5, 1.8, section 2, C7, C8. The biggest felt change.
2. Graphics G0 to G5.
3. Combat breadth (1.6, 1.7, 1.9, 1.10) and camera C1 to C6.
4. Graphics G6 to G9.
5. Missions F1 to F6.

After each block: unit tests, the combat pilot, all 29 boss pilots, story walk, fps on a frozen
build (GPU p95 at most 6.9 ms), load time (no growth past 2.1 s), WebKit, plus before and after
films and frame sheets for the owner. After block 1, a combat film and a short list of values to
judge. Work in the polish worktree; merge to main only at verified blocks. No deploy.
