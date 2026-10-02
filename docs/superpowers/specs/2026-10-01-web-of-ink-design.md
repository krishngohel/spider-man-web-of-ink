# Spider-Man: Web of Ink (unofficial fan game) - Design

Date: 2026-10-01
Status: draft, awaiting owner review

## 1. Summary

A long, comic-book styled, open-world Spider-Man game that runs in desktop browsers. The
swinging is built on real rope physics: the web is a true constraint attached to real geometry,
momentum carries through every release, and the only forces that change your velocity are
gravity, air drag, rope tension, and pushes off real surfaces.

- Platform: desktop Chrome, Edge, Firefox and Safari on Windows and macOS. Keyboard + mouse
  and gamepad (Xbox / PlayStation layouts). Phones and tablets get a "play on a computer" screen.
- Audience: public. Deployed to GitHub Pages from a public repo, after owner approval.
- Branding: "Spider-Man: Web of Ink", labeled everywhere as an unofficial, non-commercial fan
  game with a disclaimer on the title screen, in the README and in the credits. No Marvel logos
  or ripped assets. All art is code-authored or CC0.
- Multiplayer: up to 5 friends in one shared city, joined by a code, each playing any of 19
  characters (heroes and villains). One world runs at a time on a small Cloudflare relay.
- Length: main story about 6 to 8 hours (prologue + 4 acts, about 50 missions). Side content and
  collectibles bring 100% completion to about 15+ hours. New Game+ and post-game modes on top.
- Repo: `C:\Users\awsom\Documents\Projects\spider-man-web-of-ink`.

## 2. Goals and non-goals

Goals
- Swinging that feels great and is physically honest (section 4), proven by unit tests and
  real-key scripted checks.
- A big, readable comic city that runs at 60 fps on a 2021 M1 MacBook Air (medium preset) and
  has a p95 frame time under 6.9 ms at 1080p High on the owner's RTX 4060 laptop.
- A long story with 13 villains, varied boss fights, and a full open-world content loop.
- 19 playable characters with physics-honest traversal, and a 5-player shared world that stays
  smooth on ordinary home connections.
- Zero known bugs at each release: every release passes the gates in section 19.

Non-goals
- Touch controls or mobile performance tiers.
- Co-op story (the story is single-player), public matchmaking, online leaderboards, accounts,
  more than one world at a time, more than 5 players.
- Voice acting in v1 (all dialogue is comic text: speech bubbles, radio panels, broadcasts).
  Voices can be added later with an approved credit budget.
- AI-generated images or models. Art is authored in code; base bodies and animations are
  Quaternius CC0.

## 3. Approach

New repo. Port the proven engine modules from Gotham for Mansi rather than forking it:

| Ported from Gotham (adapted) | Purpose |
|---|---|
| render/inkPipeline, render/toon, render/dynamicRes, frameCap (Low Power detection) | Comic look, adaptive resolution, Safari 30 fps cap prompt |
| audio/synth, audio/sfx engine, audio/music engine, audio/ambience | Synthesized score and sound |
| ui/hud, ui/prompts, ui/comic, ui/comicArt, ui/cinematic, ui/menus, ui/photoMode | Comic UI, panels, cutscenes |
| core/input, core/bindings, core/settings, core/save | Input, rebinding, gamepad menus, saves |
| actors/limbIK, actors/verlet, poseAuthor | Procedural IK, cloth and tentacles, code-authored clips |
| scripts: playthrough, story-walk, webkit-check, fps-sweep, load-time, perfBench, optimize-assets | Verification harness |

Everything Batman-specific stays behind. Stack: Vite, Three.js (same pinned major as Gotham),
vitest, Playwright, gltf-transform for asset slimming. No external physics engine: the physics
core is our own fixed-step, deterministic code so it can be unit-tested exactly.

## 4. Physics (the heart of the game)

### 4.1 Integrator
- Fixed step 1/240 s, semi-implicit Euler, accumulator decoupled from render rate. At most 8
  substeps per frame; if a frame takes longer than that, game time slows instead of spiraling.
- Units are meters, seconds, kilograms. Hero mass 80 kg.
- Gravity setting: **Comic (2g, 19.62 m/s^2, default)** or **Real (1g, 9.81 m/s^2)**. Everything
  else is identical between the two.
- Air drag: quadratic, F = -k |v| v. k is set per pose from a drag area so free-fall terminal
  velocity is 60 m/s in the normal pose and 85 m/s in a dive tuck (smaller frontal area).

### 4.2 The feel rule (revised 2026-10-01 after the owner's playtest)
The first build kept strictly real physics (webs on real wall points, true pendulum). The owner's
playtest: swinging was not fluid, webs went to odd places, arcs were slow, timing was hard, and
swings pulled him into walls. Decision: Insomniac-style feel, fun first. Gravity, drag, the rope
constraint and collisions stay physical, and game-feel forces are added on top and logged in the
ledger as a sixth source, 'assist' (steering the swing plane, pumping toward cruise speed,
release boosts, air control, wall-run momentum). Velocity still only changes through the ledger.

### 4.3 Swing line
- The swing pivot is placed where a good arc needs it: ahead of and above the hero on his
  heading, at a length that grows with speed (16 to 34 m), starting about 50 degrees behind it.
- The strand attaches to the nearest real building surface at the pivot's height (rays from the
  ideal pivot to the sides and forward, up to 45 m). The pivot's height is capped by that
  building. No building in range (park lawns, open water): no swing; trees work in the park.
- The swing is planar: sideways velocity relative to the heading is damped, and steering turns
  the heading (and the pivot with it) at up to about 2.2 rad/s, so arcs carve around corners.
- The line shortens so the bottom of an arc stays at least 2 m over the ground.
- Zips and future web yanks still use the real rope (src/physics/rope.js) with wrapping.

### 4.4 Swing flow
- Pump: through the bottom of each arc the hero accelerates toward the cruise speed (about
  34 m/s), so momentum builds over a few swings and holds.
- Holding swing chains automatically: the hero lets go at the sweet spot (about 45 degrees past
  the bottom, rising) with a boost, and fires the next web near the top of the flight.
- Letting go by hand inside the sweet window (25 to 60 degrees past the bottom) gives a bigger
  "perfect release" boost. Jump during a swing is the swing-jump: a big forward and upward boost.
- Hitting a wall during a swing becomes a wall run that keeps the speed (projected onto the wall,
  with a bias upward). Holding swing runs up; at the top the hero vaults off with his speed.
- Air control is strong: the velocity turns toward the stick or camera heading at any speed.

### 4.5 Moves
- Swing: hold the swing input. Release to let go; momentum carries.
- Reel in: hold jump while swinging to winch the web in at up to 10 m/s, limited by a max
  tension (spider strength, 12 kN). Reeling near the bottom of an arc conserves angular
  momentum about the pivot and so increases speed. This is the "pump" skill.
- Release flick: tapping jump in the last 0.25 s before you release does a hard short reel
  (tension-limited) as you let go. It adds speed along the rope direction. It is still rope
  tension, so it is strongest when the rope points where you want to go.
- Web zip: pulls you to a targeted point with the winch. At the end you either perch or push off
  the surface (point launch). The push is a leg impulse against the perch surface.
- Wall contact: hitting a wall while airborne sticks you to it. Normal velocity is removed and
  tangential velocity is kept, minus contact friction. Hold swing on a wall to wall-run up at 9 m/s;
  reaching a top edge with upward speed vaults you over it.
- Wall crawl: slow surface movement on any building face, including ceilings of overpasses.
- Web wings: glide with a simple lift/drag polar (best glide ratio about 3.5:1, stall below
  9 m/s). Updrafts above vents and steam pipes are real upward air velocity.
- Dive: tuck pose, lower drag area. Pulling out of a dive is done with a web (tension), not by
  magic.
- Landing: no fall damage (he is Spider-Man). Vertical speed over 18 m/s plays a superhero
  landing or a roll that keeps horizontal speed.
- Web yank: a web between you and an enemy or object pulls both, scaled by mass. Light goons
  fly to you. Rhino (900 kg) pulls you to him instead.
- Thrown objects (crates, dumpsters, car doors, manhole covers, bins) are rigid bodies with real
  ballistics, restitution and friction. No stacking simulation.
- Stopping cars: each web to a car adds a rope between the car (1500 kg) and an anchor; tension
  decelerates it physically. Bigger vehicles need more webs.

### 4.6 Collision
- Hero is a capsule (radius 0.4 m, height 1.8 m). Buildings are boxes and oriented boxes in a
  spatial hash; detail geometry is visual only.
- Swept capsule test per substep, so 85 m/s never tunnels through a wall.
- The camera uses its own sphere-cast and is clamped above the ground under it (Gotham fix).

### 4.7 Physics tests (vitest)
- Rope (zip line): energy is conserved within 1% over 20 s with drag off.
- Angular momentum about the pivot is conserved within 2% during a reel-in.
- The rope never exceeds L x 1.03.
- No tunneling: 10,000 random high-speed trajectories against boxes never end inside one.
- Terminal velocity converges to 60 m/s (normal) and 85 m/s (dive) for both gravity settings.
- Rope wrap: a swing past a corner inserts and later removes the pivot correctly.
- Anchor selection never returns a point inside geometry or out of line of sight.
- The same input sequence produces bit-identical state (determinism).

### 4.8 Scripted feel checks
- `scripts/swing-check.mjs` presses real keys in a frozen build and measures in the hero's own
  frame: steering direction, chained swings holding one key, cruise speed, swing-jump boost,
  wall run keeping speed, zip and launch.
- `scripts/swing-sim.mjs`: deterministic bot battery over the city; tracks clean runs, average
  speed, speed smoothness and wall contacts.
- Owner playtest gate after Plan 1: swinging must feel right before anything is built on top.

## 5. City

- Fictional Manhattan in comic style, about 3.0 x 2.0 km, 9 districts:
  1. Midtown: tallest towers, best swinging, Avengers-style tower analog (unnamed).
  2. Neon Square: Times Square analog, giant signs, theaters (Mysterio).
  3. Financial District: narrow canyons, banks (Shocker), stock exchange.
  4. Hell's Kitchen: low rises, fire escapes, harder to swing.
  5. Chinatown and Little Italy: dense low blocks, lanterns, markets.
  6. Harlem: brownstones, rail viaduct, rooftops.
  7. Upper West and East: museums, prewar towers, the university (lab, Black Suit).
  8. Central Park: no buildings, trees only, zoo, reservoir (Lizard, Kraven).
  9. Harbor: piers, power station (Electro), shipyard and cranes, a suspension bridge to a
     small Queens island district (Forest Hills home: May's house, low houses, few anchors).
- Oscorp Tower on its own block in Midtown (Doc Ock and Goblin finale).
- Built from per-district seeded generators plus hand-placed landmarks. Each district has its
  own rng, so adding a prop never re-rolls other districts (Gotham lesson). A city-layout snapshot
  test fails if building footprints change unintentionally.
- Rendering: merged and instanced building geometry, impostor skyline beyond 600 m, facade
  windows in a shader, merged ink outlines (so frustum culling still works), streaming of detail
  props by cell. Draw-call budget: under 450 on High, under 250 on Low.
- Time of day: day, golden hour and night with a lit-window night shader. Weather: clear, overcast,
  rain. Story missions set their own time and weather; free roam cycles.
- City life: instanced pedestrians (cheap animated impostors past 40 m), moving traffic on the
  avenues, police cars, helicopters, pigeons.
- Fast travel: subway stations, unlocked by visiting them.

## 6. Look

- Ink outlines, cel shading with 3 bands, halftone and Ben-Day dots in shadows, offset-print
  color misregistration on impacts, Kirby Krackle on energy powers.
- Sound words (THWIP, THWACK, KRAKOOM) as 3D-anchored comic lettering that avoids the screen
  center for 1.3 s after a critical hit (Gotham fix).
- Speed lines and FOV widening with speed (60 to 82 degrees).
- Impact frames (flash, comic-panel freeze), with Full / Soft / Off for photosensitivity.
- Fonts from Google Fonts (comic lettering and a clean UI face).
- Suits are code-painted textures on the Quaternius superhero body: web lines, spider emblems,
  panel seams. 24 suits (section 9.3).

## 7. Characters and animation

- Base bodies: Quaternius CC0 Superhero Male/Female plus the CC0 animation libraries (already in
  Gotham's `assets-src`), slimmed by the optimize script.
- Swing poses are procedural: hand IK-locked to the web line, torso aligned along the rope,
  legs tuck at the bottom of the arc and extend at the top, flips on release flick.
- Feet planted with a per-foot sole probe while standing (Gotham fix).
- Villains get distinct silhouettes built from code geometry on the base bodies:
  Kingpin (huge suit), Shocker (gauntlets, quilted suit), Vulture (mechanical wings),
  Rhino (armored hulk), Electro (Krackle body), Scorpion (tail), Mysterio (fishbowl helmet,
  cape cloth via verlet), Lizard (tail, snout), Kraven (vest, mane), Sandman (sand particle
  giant form), Venom (bulked black body, tendrils), Doctor Octopus (four IK tentacles that
  plant on walls), Green Goblin (glider, pumpkin bombs).
- Allies: Miles Morales (playable missions), MJ, Aunt May, J. Jonah Jameson (broadcasts),
  Yuri Watanabe-style police captain analog (radio).

## 8. Combat, stealth, gadgets

### 8.1 Combat
- Melee combos, air launcher and air juggles, ground slam, web-up (pins enemies to walls and
  floors when a webbed enemy is knocked into one), web yank, environmental throws.
- Spider-sense: visual cue on incoming attacks. Perfect dodge slows time for 0.6 s.
- Focus meter: fills on combos and perfect dodges; spend on heal or finishers.
- Enemy archetypes per faction: brawler, brute (unblockable), shield, gunner, rocket, sniper,
  jetpack, whip, and faction specials. Factions: Kingpin thugs, Maggia (Hammerhead), Sable-style
  private army (Act 3 occupation), Oscorp tech, Sinister Six henchmen, Kraven hunters, symbiote
  goons.
- Enemy AI respects line of sight and spacing; at most 2 attack at once on Amazing difficulty.
- Difficulty: Friendly, Amazing (default), Spectacular, Ultimate (NG+).

### 8.2 Stealth
- Perches on gargoyles, lamp posts, and ceiling corners. Upside-down web hang takedown.
- Enemy vision cones and hearing, suspicion meter, alarm, reinforcement waves on discovery.
- Takedown types: perch, ground, web-strike on alone enemies, environmental (web trap on a
  ledge), gadget (trip mine pairs).

### 8.3 Gadgets (wheel, each upgradable 3 levels)
Web Shooter, Web Bomb, Impact Web, Trip Mine, Electric Web, Suspension Matrix (floats
enemies), Spider-Drone, Concussive Blast.

## 9. Progression and economy

### 9.1 XP and skills
- Levels 1 to 50. One skill point per level.
- Three trees, 15 skills each: Defender (combat), Webslinger (traversal, including air
  tricks for XP, double web zip, faster reel), Innovator (gadgets, stealth).
- No skill breaks the physics rule. Traversal skills raise winch speed, max tension, web
  length, glide efficiency and similar real parameters.

### 9.2 Tokens
Six token types earned from activity: Crime (street crimes), Base (hideouts), Challenge
(Taskmaster), Research (Oscorp stations), Landmark (photos), Backpack. Spent on suits, suit mods
and gadget upgrades. A unit test checks that every unlock is affordable with tokens reachable
by 100% completion.

### 9.3 Suits
24 code-painted suits, unlocked by level and tokens. Six suit powers (Web Blossom, Battle
Focus, Electric Punch, Spider-Drones, Sound Pulse, Rocket Rush style) and 12 suit mods. Any power
can be equipped with any suit after unlock. Noir suit switches the screen to monochrome.

## 10. Story (about 50 missions, 6 to 8 hours)

All copy is authored by Fable 5.1 in the controller session; no em dashes in game copy.

Prologue: "First Light at Fisk Tower"
- Tutorial swing to Fisk Tower, raid with the police, Kingpin boss fight (heavy hitter, uses
  the room). Unlocks free roam in Midtown. Jameson's first rant.

Act 1: "The Bird and the Bull" (Shocker, Vulture, Rhino)
- Bank job in the Financial District leads to Shocker (vibro blasts, use cover and web yank
  on debris).
- Stolen Oscorp wing tech: Vulture aerial chase through Midtown, then a fight on a moving
  freight elevator scaffold; you web his wings (moving anchor rope).
- Rhino rampage in Hell's Kitchen: dodge charges into walls and girders, web-yank isn't
  enough (he outweighs you), finish in a rail yard.
- Story beats with MJ (Daily Bugle reporter) and Aunt May (shelter volunteer).

Act 2: "Power and Illusions" (Electro, Scorpion, Mysterio, Lizard)
- Blackout across the Harbor: Electro at the power station, fight while rerouting power,
  water and grounding matter (Electric web does nothing to him).
- Scorpion hits an Oscorp transport on the bridge: a chase and a poison-timer fight.
- Mysterio's "Broadway Premiere": illusion funhouse in Neon Square (shifting rooms, fake
  gravity panels that are visual only, the physics rule still holds), giant Mysterio boss.
- Lizard in the sewers and Central Park zoo: rescue Dr. Connors from himself, chase through
  the park (no anchors, zip and run).
- Miles Morales playable mission 1 (venom blast, camouflage) during the blackout.

Act 3: "Hunters and Symbiotes" (Kraven, Sandman, Venom)
- Kraven's hunt across Central Park: traps, stalking, a three-stage hunt.
- Sandman at the Harbor shipyard: water tower and fire hydrant weaknesses, sand giant phase.
- Symbiote meteor sample at the university lab bonds to Peter: Black Suit unlocked with
  boosted strength and an anger meter. Story choice beats in panels (not branching).
- Bell tower: tear it off with the church bell's sound. Venom forms and becomes the act boss
  (rooftop chase, bell tower fight, symbiote tendrils pull you with real rope physics).
- Miles mission 2.

Act 4: "Sinister Six" (Doctor Octopus, the Six, Green Goblin)
- Doc Ock frees Electro, Vulture, Rhino, Scorpion and Mysterio. Sable-style occupation of the
  city (new enemy faction at checkpoints).
- Two-on-one fights: Electro + Vulture over the Harbor, Rhino + Scorpion in the Financial
  District, Mysterio solo rematch with his illusions turned against him.
- Doctor Octopus: three phases climbing Oscorp Tower, tentacles plant on walls (IK), final
  phase on the exterior in a storm.
- Green Goblin finale: glider chase across all districts (rope physics on a fast moving
  anchor), fight on the suspension bridge, catch MJ with webs (tension and a real fall).
- Epilogue: rooftop with MJ, May, Miles; Jameson's grudging broadcast; credits.
- Miles missions 3 and 4 between Act 4 beats.

Each mission is a story step with a stable id. Saves are keyed by step id from day one, never by
index.

## 11. Open world and side content (about 8+ more hours)

- Street crimes: 10 types (mugging, robbery, car chase, armored van, hostage, rooftop sniper
  nest, gang fight, drone strike, bomb, collapse rescue), weighted by district and act.
- Hideouts: 9 bases (one per district), 3 waves plus a lieutenant each.
- Taskmaster challenges: 12 (combat, stealth, drone chase, bomb rush, swing race), with
  bronze, silver, gold, and ultimate medals tuned from scripted pilots plus a human playtest.
- Swing races: 12 checkpoint courses, medals.
- Oscorp research stations: 8 (pipe puzzle, circuit puzzle, pollution drones, rescue pigeons,
  bridge cable tension puzzle that uses the real rope solver).
- Collectibles: 55 backpacks (each with a comic-panel memory note), 30 landmark photos, 12
  Black Cat tags (lead to 3 Black Cat missions), 20 lost pigeons.
- Daily Bugle photo assignments: 10, using photo mode.
- District completion tracking and a progress tracker screen (Gotham pattern).

## 12. Post-game
- New Game+ with Ultimate difficulty, keeping level, suits and gadgets.
- Villain Gauntlet: boss rush of all 13 bosses with medals.
- Endless Crime Nights: escalating crime waves, local best score.
- Free photo mode everywhere, suit select at any time.

## 13. Playable roster

Every character in the game is playable. All of them obey the physics rule (4.2): each has its
own real source of force, and none of them teleport or jump in mid-air.

| Character | Traversal (energy source) | Combat kit highlights |
|---|---|---|
| Spider-Man (Peter) | Web swing, reel, zip, wall run, web wings | Full combo set, gadgets |
| Miles Morales | Web swing (same rope model), wall run | Venom blast, camouflage |
| Spider-Gwen | Web swing, longer flips, air control from pose drag | Fast kicks, web yank combos |
| Spider-Man 2099 | Web swing, cape glider with a better glide polar (5:1) | Talons, accelerated vision |
| Spider-Man Noir | Web swing, shorter webs, stronger stealth | Silent takedowns, smoke |
| Black Cat | One grapple line (rope physics, longer cooldown), acrobatics | Claws, bad-luck trip |
| Venom | Symbiote swing: heavier body (110 kg), stronger winch, tendril zips | Tendril grabs, roar stun |
| Vulture | Flight: wing harness thrust plus lift and drag | Dive talons, feather darts |
| Green Goblin | Glider: jet thrust plus aero, hover at a fuel cost | Pumpkin bombs, razor bats |
| Doctor Octopus | Tentacle walk and climb: four arms plant on surfaces and push | Tentacle slams, car throws |
| Electro | Rides power lines and rails (magnetic force along the cable), short magnetic push-off from metal | Lightning arcs, overload |
| Rhino | Ground charge: very high mass and momentum, smashes breakables, cannot climb | Charge, horn toss, stomp |
| Lizard | Climbs any surface, pounce jumps off surfaces | Tail swipe, bite, roar |
| Scorpion | Tail as a rigid grapple (pole-vault and pivot), wall climb | Tail sting, acid spit |
| Shocker | Recoil jumps: vibro blasts push him the opposite way (Newton's third law) | Vibro blasts, quake punch |
| Sandman | Sand surfing on the ground, sand pillar launches (push off the ground) | Sand fists, giant form (mass grows) |
| Mysterio | Hover boots (thrust, limited fuel), smoke cover | Illusion decoys, gas bombs |
| Kraven | Parkour, high jumps, spear grapple (rope physics, long cooldown) | Spear, bolas, net traps |
| Kingpin | Heavy brawler on foot; calls a Fisk helicopter and rides its rope ladder (moving-anchor rope) | Cane throw, ground pound, grab |

- Traversal is built from shared archetypes in `src/movers/`: swinger, grappler, flyer (thrust +
  aero), glider, hover, climber, tentacle walker, ground heavy, cable rider, recoil jumper, sand
  surfer. Each archetype has its own physics unit tests.
- Villain models are the same code-built models the bosses use: built once, used as boss and as
  playable character.
- Solo: the roster unlocks in solo free roam after the story ends (Peter and Miles are playable
  in the story itself). Multiplayer: the whole roster is always available.
- Speed differences are real (Rhino is no match for Goblin over open distance). Versus modes
  offer a "fair speed cap" option that clamps every character to the same top speed.

## 14. Multiplayer

### 14.1 Shape
- Up to 5 players in one shared city. Only one world runs at a time.
- Join with a 6-character code (letters and digits without look-alikes, e.g. `K7WQ2M`).
- Every player picks any roster character and suit at the join screen, and can switch at any
  subway station.
- Multiplayer is its own sandbox: every character, suit, gadget and skill is unlocked, and it
  never reads or writes the story save. A small local profile stores your name, last character
  and settings.
- The story is single-player only.

### 14.2 What you do together
- Co-op free roam: street crimes, hideouts and research stations, scaled to player count
  (enemy count and health). Boss rematches: any of the 13 bosses at a boss arena, health scaled
  by player count.
- Versus modes, started by the host from the world menu:
  - Race: checkpoint courses for any characters, optional fair speed cap.
  - Tag: one player is "it", tag by touch or by a web or tendril hit.
  - Brawl: timed free-for-all KOs in an arena block.
  - King of the Rooftop: hold a rooftop zone; the zone moves every 60 s.
  - Hide and Seek: hiders can use stealth perches; the seeker has a spider-sense ping on a
    cooldown.
- Host world settings: friendly fire (off by default in free roam, always on in Brawl), time of
  day, weather, crime density, difficulty.
- Social: name tags, friends on the map, ping markers, a quick-chat wheel (8 lines), simple text
  chat, a scoreboard after each versus round. Subway fast travel can target the station nearest
  a friend.

### 14.3 Server: one Cloudflare Worker plus one Durable Object
- `server/` holds a Cloudflare Worker and a single Durable Object called World, using
  hibernatable WebSockets. The Worker routes every request to the one World instance
  (`idFromName("world")`), which makes "one world at a time" a hard guarantee.
- The World object is a relay, not a game simulation. It:
  - creates the world, generates the join code, and refuses a second one ("A world is already
    running. Join it with its code.");
  - admits at most 5 players and rejects the 6th ("World full");
  - assigns player ids and the host role. The host is the creator; when the host leaves, the
    longest-connected player takes over;
  - forwards messages between players and keeps nothing after the world ends;
  - ends the world when the host picks End World, or after 2 minutes with nobody connected.
- A player who drops can rejoin with the same code within 60 s and keeps their slot.
- Abuse limits: join attempts are rate limited per IP (10 per minute), messages are capped at
  4 KB and 60 per second per player (extra ones are dropped), and a client on a different game
  version is told to refresh.
- Deploy: `npx wrangler deploy` from `server/`. One-time owner step: create a free Cloudflare
  account and run `npx wrangler login`. The game reads the Worker URL from its build config.
- Cost check: at 15 Hz player updates plus 10 Hz host snapshots, 5 players use roughly 15,000
  billed requests per hour (Durable Object WebSocket messages bill at 20 per request). The free
  tier allows 100,000 a day, so about 6 hours of 5-player play per day, longer with fewer players.
  These limits are re-checked against Cloudflare's pricing page at plan time.

### 14.4 Netcode
- Each player's own character is simulated on their own machine (owner authority) and sent as a
  binary state packet at 15 Hz: position, velocity, orientation, mover state, animation state,
  web or tendril anchors with rope lengths, and character values (fuel, giant form), about 48
  bytes, quantized.
- The host's machine simulates the shared world (host authority): enemies, crimes, hideout waves,
  bosses, thrown objects, traffic seed, time and weather, versus state and scores. Snapshots go out
  at 10 Hz, covering only entities within 300 m of some player, delta compressed.
- Remote players are drawn 100 ms in the past with interpolation, and extrapolated by velocity
  for up to 250 ms when packets are late. Remote webs are drawn from their real anchor data, so
  they attach to the same building on every screen.
- Hits on NPCs: the attacker reports the hit, the host checks range and timing, then applies it.
  Hits on players (versus, friendly fire): the victim's client applies them. Friends only, so
  there is no anti-cheat beyond sanity checks.
- Host migration: the host sends a full world snapshot every 5 s, kept in the relay's memory;
  the new host resumes from it plus later deltas. Enemies may jump by up to 5 s of state, which
  is acceptable.
- Performance caps in the shared world: at most 24 active enemies and 30 thrown objects.
- The protocol is versioned; every message type has an encode/decode round-trip unit test.

### 14.5 Multiplayer tests
- Unit: protocol round trips and quantization error bounds, interpolation and extrapolation,
  host election, join code generator (no look-alike characters).
- Server: `@cloudflare/vitest-pool-workers` tests for one world only, the 5-player cap, rejoin
  within 60 s, empty timeout, rate limits, message caps and version mismatch.
- End to end: Playwright opens 5 muted headless clients against `wrangler dev`, joins by code,
  checks that a 6th is rejected, runs a race and a brawl round, kills the host and confirms
  migration, and adds artificial lag (150 ms, 30 ms jitter, 2% loss) to confirm remote players
  stay smooth.
- Live smoke test on the deployed Worker with 3 clients before any release.

## 15. UX, settings, accessibility

- Title, three save slots, continue, chapter select after completion.
- Pause, map with filters and waypoints, progress tracker, skills, suits, gadgets, photo mode,
  help, settings.
- Settings: graphics preset (Low / Medium / High / Ultra), resolution scale and dynamic res,
  FPS counter, gravity (Comic / Real), swing assist, hold or toggle swing, camera shake,
  impact frames (Full / Soft / Off), subtitles size, colorblind-safe prompts, slow-motion
  assist (0.75x game speed), invert axes, sensitivity, full key and gamepad rebinding.
- Low Power Mode (Safari / Chrome Energy Saver) detection prompt once; dynamic res caps to 30.
- Cards and prompts dismiss when you act (Gotham fix). No teleports in story beats (Gotham fix).

## 16. Default controls

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move / camera | WASD / mouse | Left / right stick |
| Swing (hold in air), parkour run (hold on ground) | Left Shift | RT / R2 |
| Jump, reel in while swinging, release flick | Space | A / Cross |
| Web wings (hold in air, not swinging) | Space (hold) | A (hold) |
| Web zip / point launch | Q | LT + RT / L2 + R2 |
| Dive (air), dodge (ground) | C | B / Circle |
| Attack | Left mouse | X / Square |
| Web shooter | Right mouse | RB / R1 |
| Web yank / web strike | E | Y / Triangle |
| Gadget wheel (hold), use gadget | Tab, R | LB hold, RB + LB |
| Finisher / suit power | X / Z | L3+R3 / L3 |
| Spider-sense scan / photo mode | V / P | Right stick click / Back+Y |
| Map / pause / help | M / Esc / H | Back / Start / Start+Back |

All rebindable. With the pointer unlocked, the first canvas click only re-locks.

## 17. Audio
- Synthesized score using the Gotham music engine: a hero theme, district layers, a swing layer
  whose intensity follows speed, boss themes per villain, stealth and combat stems.
- SFX: THWIP, web tension creak scaled by rope tension, wind by speed, impacts, villain
  powers. All synthesized. Master, music, SFX volumes.
- Jameson's broadcasts are text panels with a radio crackle sound.

## 18. Architecture

```
src/
  core/      loop (fixed step), input, bindings, settings, save (slots, step-id keys, migrate)
  physics/   integrator, rope (constraint, wrap, moving anchors), anchors (hash, scoring),
             collision (capsule sweep, boxes), bodies (thrown props, vehicles), aero (drag,
             glide polar), constants
  movers/    traversal archetypes (swinger, grappler, flyer, glider, hover, climber,
             tentacle walker, ground heavy, cable rider, recoil jumper, sand surfer)
  roster/    character definitions: model, mover, combat kit, special
  net/       socket client, binary versioned protocol, interpolation, host world authority,
             versus modes, lobby and join UI
  hero/      controller (state machine: ground, air, swing, zip, wall, glide, combat, stealth),
             pose (procedural swing IK), suits (painter), powers
  camera/    swing camera, combat camera, action camera (clamped), photo camera
  world/     districts/*, cityBuilder, landmarks, anchorsBake, cityLife, traffic, timeWeather
  render/    inkPipeline, toon, halftone, krackle, dynamicRes, frameCap, impostors
  combat/    combatSystem, enemies/*, factions, spiderSense, focus, finishers, throwables
  stealth/   vision, brain, perches, takedowns
  gadgets/   wheel, gadgets/*
  bosses/    one module per villain, each a phase state machine with test hooks
  story/     steps (ids), missions/*, panels, broadcasts, cinematics
  content/   crimes, hideouts, challenges, races, research, collectibles, photoOps, tracker
  progress/  xp, skills, tokens, suits, unlocks
  ui/        hud, prompts, comic, cinematic, menus, map, photoMode
  audio/     synth, sfx, music, ambience
  dev/       perfBench, test hooks (window.__game), ?at=stepId&god=1
server/      Cloudflare Worker + World Durable Object (relay, one world, 5 players)
```

- The physics core has no Three.js dependency, so it runs in vitest and in a worker-free
  headless harness.
- Every boss and mission exposes test hooks (phase jump, state read) under `window.__game`.

## 19. Verification and release gates

Each release must pass all of:
1. `npm test`: unit tests, including physics invariants (4.7), save migration, copy checks (no
   em dash, generated from char codes), economy reachability, city-layout snapshot.
2. `npm run test:e2e`: Playwright boot, menus, settings persistence, rebinding, saves, gamepad
   menu navigation.
3. `scripts/playthrough.mjs`: scripted title-to-credits run on a frozen build (vite build +
   preview), driving every story step.
4. `scripts/story-walk.mjs`: screenshot of every story beat, reviewed by the controller.
5. `scripts/swing-check.mjs`: real-key swing measurements in the hero frame.
6. Boss pilots: each boss is completed by a scripted pilot at Amazing without god mode, using
   real inputs where traversal is involved.
7. `scripts/webkit-check.mjs` (Safari engine) and Firefox check.
8. `scripts/fps-sweep.mjs` (skips comics and cinematics), A/B against the previous release in
   the same run; p95 under 6.9 ms on High at 1080p.
9. Multiplayer: server tests and the 5-client e2e run (14.5), live 3-client smoke test.
10. `scripts/load-time.mjs`: under 4 s to title at 40 Mbps.
11. Code review of the release diff.

Testing rules: all test browsers launch muted (Chromium `--mute-audio`, Firefox volume pref,
WebKit in-page mute). Verify on frozen builds, not the dev server. Scripted runs entering via
`?at=` spend one click to re-lock the pointer first. Pages can lag about a minute after a push:
poll the served bundle before smoke-testing.

## 20. Delivery plan (each is its own implementation plan)

1. Foundation + physics + swinging: repo, ported engine, physics core with full tests, hero
   controller, camera, a blockout test city. **Owner playtest gate.**
2. City: 9 districts, landmarks, anchor bake, time and weather, city life, traffic, map, fast
   travel, perf budget.
3. Combat core: enemies, factions, spider-sense, web-up, throwables, gadgets wheel.
4. Progression: XP, skills, tokens, suits painter (24 suits), powers, mods.
5. Roster: all 11 mover archetypes and 19 character models and kits, playable in a solo
   sandbox. Bosses later reuse these models.
6. Multiplayer: Worker + World object, protocol, netcode, lobby and join UI, co-op free roam,
   versus modes. Ships early so the owner can play with friends in the city while the story is
   still being built.
7. Story framework + Prologue + Act 1 (Kingpin, Shocker, Vulture, Rhino).
8. Act 2 (Electro, Scorpion, Mysterio, Lizard) + Miles mission 1.
9. Act 3 (Kraven, Sandman, Black Suit, Venom) + Miles mission 2 + stealth system.
10. Act 4 (Sinister Six fights, Doc Ock, Goblin finale, epilogue, credits) + Miles 3 and 4.
11. Open-world content: crimes, hideouts, challenges, races, research, collectibles, photo ops.
12. Post-game: NG+, Villain Gauntlet (solo and co-op), Crime Nights.
13. Release polish: full perf sweep, Mac and Safari tuning, load time, accessibility pass, final
    playthroughs, deploy (after owner approval).

Plans 1 and 2 run in order. After that, plans 3, 4, 5 and 11 can run in parallel worktrees, and
plan 6 follows 5. Acts 7 to 10 run in order because story steps are sequential. Worktree rules from Gotham: node_modules
junctions are never deleted, no `git merge | tail` before a push, nothing is pushed to the
public repo without the gates passing.

## 21. Risks

- Scope: this is several times the Gotham v1. Mitigation: the physics and city ship first and
  are verified; each act is a separate plan with its own gates.
- Draw-call limits in the city at swing speed. Mitigation: budget from Plan 2, impostors, merged
  outlines, fps sweeps along fixed swing routes.
- Swing feel is subjective. Mitigation: owner playtest gate after Plan 1, tunables exposed in
  a dev panel.
- Multiplayer edge cases (drops, host migration, lag). Mitigation: owner-authority movement,
  relay-only server, scripted 5-client tests with simulated lag and host kills.
- Cloudflare free-tier limits change. Mitigation: re-check at plan time; the paid Workers plan
  removes the cap if ever needed (owner decision).
- Takedown risk for a public Spider-Man fan game. Mitigation: unofficial label, non-commercial,
  no Marvel logos or ripped assets; owner accepted this risk.
