# Spider-Man: Web of Ink (unofficial fan game)

A comic-book Spider-Man game that runs in the browser: a 3 by 2 km city drawn in ink, a story in
four acts with thirteen bosses, an open world full of things to do, nineteen playable characters
and five-player multiplayer. Swinging is real physics: put the crosshair on a building, hold
swing, and you swing on a rope about that exact point. Let go to fly, aim the next web, and miss if
you aim at nothing.

> Unofficial fan game. Not affiliated with or endorsed by Marvel or Sony. Spider-Man and related
> characters are trademarks of Marvel. Made for fun, never sold.

## Play

```
npm install
npm run dev        # http://localhost:5300
```

Title screen: **Story** (three save slots, Continue, New Game, New Game+ after the credits),
**Free Swing**, **Multiplayer**, Settings and Controls. Click the game to capture the mouse. A
gamepad works too. Every key can be rebound.

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move and steer | W A S D | Left stick |
| Look | Mouse | Right stick |
| Swing (hold), parkour and wall run | Shift | RT / R2 |
| Jump, swing-jump, web wings (hold in the air) | Space | A / Cross |
| Web zip, point launch | Q | LT + RT |
| Web hang, web yank, hold to defuse or lift | E | Y / Triangle |
| Dive (air), dodge (ground, or a web pull mid-air) | C | B / Circle |
| Attack (silent takedown on an unaware guard) | Left mouse | X / Square |
| Web shot | Right mouse | RB / R1 |
| Finisher (tap), heal (hold) | X | L3 + R3 |
| Gadget, gadget wheel | F, Tab (hold) | LB |
| Suit power | Z | L3 |
| Spider-sense scan | V | R3 |
| Photo | P | |
| Map (subway fast travel, waypoints) | M | Back |
| Pause | Esc | Start |

## What is in it

- **Story** (`src/story/`): Prologue and four acts as data keyed by step ids, comic pages drawn in
  engine, radio and Jameson broadcasts, act cards, and boss fights for Kingpin, Shocker, Vulture,
  Rhino, Electro, Scorpion, Mysterio, Lizard, Kraven, Sandman, Venom, Doctor Octopus and the Green
  Goblin, Miles Morales missions, the Black Suit, the Sinister Six in pairs, the credits.
- **Open world** (`src/content/`): 55 backpacks with memories, 30 landmark photos, 12 Black Cat
  tags, 20 lost pigeons, ten kinds of street crime, nine hideouts, twelve Taskmaster challenges,
  twelve swing races, eight Oscorp research puzzles, ten Daily Bugle assignments, and a tracker.
- **Post-game**: New Game+ on Ultimate, the Villain Gauntlet (every boss back to back, timed),
  Crime Nights (escalating crime waves at night, a best score).
- **Characters** (`src/roster/`, `src/movers/`): 19 heroes and villains, each moving by its own
  physics (glider, wings, tentacles, sand, magnetism, recoil).
- **Multiplayer** (`src/net/`, `server/`): up to five players in one world over a Cloudflare
  Worker and Durable Object relay; free roam, race, tag, brawl, king of the hill, hide and seek.
  Runs locally with `cd server && npm run dev`; not deployed.

## Tests and checks

```
npm test                                   # unit tests
cd server && npx vitest run                # relay tests
npm run test:e2e                           # Playwright smoke tests (muted)
node scripts/swing-check.mjs <url>         # swing feel with real keys
node scripts/combat-check.mjs <url>        # a combat pilot
node scripts/roster-check.mjs <url>        # every character
node scripts/boss-check.mjs <url> [ids]    # a pilot beats every boss, no god mode
node scripts/story-walk.mjs <dir> <url>    # a contact sheet of every story beat
node scripts/content-check.mjs <url>       # collectibles, crimes, races, research, tracker
node scripts/mp-check.mjs                  # five clients on the local relay
node scripts/playthrough.mjs <url>         # title to credits on a frozen build (ENGINE=firefox)
node scripts/fps-check.mjs <url>           # frame budget on a frozen build
node scripts/load-time.mjs <url>           # under 4 s to the title at 40 Mbps
node scripts/webkit-check.mjs <url>        # the Safari engine (ENGINE=firefox for Firefox)
node scripts/bench.mjs <url>               # the ?bench=1 table headless (UNCAPPED=1: vsync off)
node scripts/boot-errors.mjs <url>         # every console error while it boots
node scripts/soak.mjs [minutes] <url>      # heap over a few minutes of teleports
node scripts/gpu-parts.mjs [hour] <url>    # GPU time with parts of the scene hidden
node scripts/clip-compare.mjs <a> <b>      # two builds of a clip file play the same
```

Every script browser is muted. `?at=<step id>` starts the story at any step in a scratch save.
`?bench=1` runs a benchmark on your own machine and shows a table to screenshot.

Assets: `node scripts/optimize-assets.mjs` packs the mocap clip sets (rotations as shorts,
meshopt); `node scripts/encode-music.mjs` re-encodes the soundtrack from `assets-src/music`.
A push to `main` runs the unit tests, builds and deploys to GitHub Pages
(`.github/workflows/pages.yml`).

## Credits

Bodies and base animations by Quaternius (CC0); motion capture from Mixamo (Adobe), retargeted to
the game skeleton; the classic film suit is "The Amazing Spider-Man 2 Spider-Man" by fredbear1211
on Sketchfab (CC BY 4.0, fitted to the game skeleton); six CC0 music tracks from OpenGameArt.org;
Bangers and Barlow Condensed fonts (OFL). The city, the ink look, comic pages, sound effects and
the story are made in code. Every source, author and licence is in [CREDITS.md](CREDITS.md).
