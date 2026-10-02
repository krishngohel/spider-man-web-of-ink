# Plan 7: Story framework, Prologue and Act 1

**Goal:** The story runs from a new save through the Prologue ("First Light at Fisk Tower") and
Act 1 ("The Bird and the Bull"): Kingpin, Shocker, Vulture and Rhino as real boss fights, with
comic pages, radio and Jameson broadcasts, and free roam between missions. Plans 8 to 10 then add
acts as content on the same framework.

**Architecture:** The story is data: a list of steps with stable ids. A pure runner (unit tested)
tracks the current step against `save.story`. A game-side director runs each step type: reach,
fight, boss, chase, radio, broadcast, panels, title, cinematic. Bosses are roster models (the same
ones the player can pick) driven by the poser through a puppet, registered in the enemy list so
every hero move (lunge, webs, yank, finishers, gadgets) works on them. Each boss module owns its
own AI and phases. Comic panels are rendered in engine: the cast stands in the city, the ink
pipeline draws one frame from a set camera, and the frame becomes the panel art.

**Tech:** Three.js, the ink pipeline, vitest, Playwright (playwright-core) scripts.

## Global constraints
- No em or en dashes in any game copy (the copy test scans every string).
- Saves are keyed by step id, never by index. An unknown step id falls back to the start of its
  act (by the id prefix), then to the first step.
- No teleports in story beats. The only position changes are mission retries and a fade cut to
  the next mission's start, which the player chooses.
- The physics rule holds for every boss: real forces, no mid-air jumps.
- Test browsers muted. Commits by Krishn Gohel only. No public deploy.

## Files
- `src/story/steps.js`: ACTS, STEPS (data), SITES (named spots resolved from landmarks).
- `src/story/runner.js`: pure runner: `createStoryRunner(steps, story)` returns `{ step, index,
  done, complete(id), jump(id), actOf(id) }`; `resolveStep(steps, id)` (migration fallback).
- `src/story/cast.js`: MJ, Aunt May, Captain Yuri Watanabe, J. Jonah Jameson, police officers, as
  roster-format defs for `buildCharacter`.
- `src/story/actors.js`: places cast and villain models in the world (puppet + poser) for panels
  and cinematics, and as idle figures at mission sites.
- `src/story/director.js`: runs steps, objective text, waypoint, mission env (hour, weather),
  retries on defeat, quiet streets during missions, rewards (XP `storyStep` / `storyMission` /
  `bossDefeated`).
- `src/story/bossActor.js`: shared boss body: roster model + poser + body on the collision world,
  enemy-list entry (`e.boss`), health bar, telegraphed attacks (spider-sense), stun windows, and
  hit routing to the boss module.
- `src/story/bosses/kingpin.js`, `shocker.js`, `vulture.js`, `rhino.js`.
- `src/ui/comic.js`: comic pages (panels slide in, captions, balloons, SFX words).
- `src/ui/radio.js` + `src/ui/portraits.js`: radio panel with code-drawn SVG portraits; Jameson
  broadcasts use the same panel with a "BUGLE RADIO" skin and crackle.
- `src/ui/objective.js`: objective card, boss bar, act title card, letterbox.
- `src/ui/copy.js`: story copy section; menus get Continue / New Game / Load with three slots.
- Changes: `combat/enemies.js` (bosses skip the generic AI, hits route to `e.boss.hit`),
  `combat/combat.js` (expose `emit`, `heroHit`, story spawn helpers), `game/game.js` (director,
  `?at=<stepId>`, story hooks), `ui/menus.js` (slots).
- Tests: `tests/unit/story.test.js`. Scripts: `scripts/story-walk.mjs` (every beat, screenshot
  sheet), `scripts/boss-check.mjs` (a pilot beats each boss at Amazing, no god mode).

## Step types
| type | done when | notes |
|---|---|---|
| `start` | the hero reaches the mission marker | free roam until then; the map shows the marker |
| `reach` | within `radius` of `site` (optionally above `minY`) | waypoint and objective |
| `radio` | its lines finish | play goes on |
| `broadcast` | its lines finish | Jameson, crackle |
| `panels` | the pages are read | game paused; in-engine panel art |
| `title` | the card has shown | act cards |
| `fight` | every wave is out | waves of `{ faction, mix }` at `site` |
| `boss` | the boss module says done | `boss: 'kingpin'`, arena site |
| `chase` | the module says done | Vulture's flight; fail if too far for too long |

## Story (Prologue and Act 1)
- `prologue.open` panels: dawn over Midtown, Peter's apartment window, Yuri on the phone: the raid
  on Fisk Tower starts at sunrise.
- `prologue.swing` reach Fisk Tower (tutorial prompts: swing, jump, zip).
- `prologue.yuri` radio. `prologue.plaza` fight: Fisk's guards at the tower's foot (two waves).
- `prologue.roofRadio` radio. `prologue.roof` reach the roof (climb or zip).
- `prologue.kingpin` boss. Kingpin: a brawler who uses the roof. Phase 1: haymakers and a cane
  sweep (dodge, punish). Phase 2 (60%): he rips up roof fixtures and throws them (dodge or web
  yank one back at him). Phase 3 (25%): his helicopter's rope ladder drops; he climbs; web the
  ladder and pull him down (hold yank, tug of war against the climb), then finish.
- `prologue.end` panels: Fisk in cuffs, MJ at the Bugle. `prologue.jameson` broadcast.
  `prologue.free` title: "The city is yours" (free roam unlocked caption).
- `act1.title` title card. `act1.bankStart` start (Financial District, Stock Exchange).
- `act1.bankRadio` radio (Yuri: the bank on Exchange Street). `act1.bank` fight: Maggia crew.
- `act1.shocker` boss. Shocker: vibro blasts are real impulses (they shove the hero; a building
  between him and you blocks them). Phase 1: blasts and a ground quake; after 3 blasts his
  gauntlets vent (stun window). Phase 2: he blasts loose debris (crates) around the street;
  web yank a crate into him for big damage. Phase 3: rapid blasts; finish.
- `act1.shockerEnd` broadcast. `act1.mjStart` start at the Daily Bugle. `act1.mj` panels: MJ's
  story about stolen Oscorp wing tech.
- `act1.oscorpStart` start (Oscorp Tower). `act1.vultureChase` chase: Vulture flies a loop
  through Midtown; keep within 90 m for 60 s and land 3 web hits (Mouse2) while in range.
- `act1.vulture` boss on the construction roofs: he circles and dives. Web yank him during a
  dive: a rope between you that drags him down (he is light); grounded, he is open. Phase 2 he
  throws feather darts while circling higher; three grounds and he is done.
- `act1.vultureEnd` broadcast. `act1.mayStart` start at the F.E.A.S.T. shelter (Harlem).
  `act1.may` panels.
- `act1.rhinoStart` start (Hell's Kitchen). `act1.rhinoRadio` radio. `act1.rhino` boss: he
  charges; a dodge sideways makes him hit a building or a girder (stun window). Web yank does
  nothing (he outweighs you: a "TOO HEAVY!" word). Phase 2 he chases you: reach the rail yard
  ahead of him. Phase 3 in the yard: charge him into containers; three stuns and webs pin him.
- `act1.end` panels (MJ and Peter on a roof), `act1.jameson` broadcast, `act1.done` title.

## Tasks
1. Runner, steps, copy and tests (pure). Unit tests: ids unique and dotted by act, known types,
   every `boss` names a module, copy has no dashes, runner order and jump, migration fallback,
   every site on land inside the city.
2. UI: comic, radio + portraits, objective card + boss bar + title card + letterbox. Styles.
3. Actors and cast; in-engine panel shots.
4. Director: step handlers, env override, mission retry on defeat, quiet streets, rewards,
   `?at=`, hooks `__game.story()`, `__game.storyComplete()`, `__game.bossPhase(n)`.
5. Boss actor + enemy-list integration (unit test: a boss entry takes hits through its module).
6. Bosses: Kingpin, Shocker, Vulture (+ chase), Rhino.
7. Title: Continue / New Game / Load (three slots).
8. Scripts: story-walk (contact sheet of every beat), boss-check (pilots for the four bosses).
9. Gate: unit, server, e2e, swing, combat, roster, mp, story-walk, boss-check, webkit, fps on a
   frozen build. Commit, merge to main.
