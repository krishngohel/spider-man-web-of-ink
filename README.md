# Spider-Man: Web of Ink (unofficial fan game)

A comic-book Spider-Man game that runs in the browser, built on real rope physics. Every web
sticks to a real building, and every bit of speed comes from gravity, the hero's own legs, or the
pull of the line. No mid-air jumps, no scripted arcs.

> Unofficial fan game. Not affiliated with or endorsed by Marvel or Sony. Spider-Man and related
> characters are trademarks of Marvel. Made for fun, never sold.

This is the Plan 1 build: the swing, in a blockout city. See `docs/superpowers/specs/` for the
full design and `docs/superpowers/plans/` for the build plans.

## Play

```
npm install
npm run dev        # http://localhost:5300
```

Click the screen to capture the mouse. A gamepad works too. Every key can be rebound in Settings.

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move (steer in the air by leaning) | W A S D | Left stick |
| Look | Mouse | Right stick |
| Swing (hold in the air), parkour run and wall run (hold) | Shift | RT / R2 |
| Jump. Swinging: hold to reel in, tap to flick. In the air: web wings | Space | A / Cross |
| Web zip to where you look, then Space to launch | Q | LT + RT |
| Dive (hold in the air) | C | B / Circle |
| Controls help | H | Back |
| Pause | Esc or P | Start |
| Physics tuning panel | ` (backquote), or open with `?dev=1` | |

Tips: reel in through the bottom of an arc to speed up (it really adds energy: the winch does
work on the line). A web stuck to one side swings you toward that side, so weave left and right
down an avenue. Settings > Gravity switches between Comic (2g, the default) and Real (1g).

## How the physics works

- `src/physics/` has no Three.js in it. It steps at a fixed 240 Hz.
- `ledger.js`: velocity only changes through `applyDv(body, source, ...)` with one of five physical
  sources (gravity, drag, lift, rope, surface). Anything else throws, and tests check that the
  sources add up to the total change.
- `rope.js`: the web is an inextensible line solved with SHAKE (a long swing neither gains nor
  bleeds energy), with a winch limited to 12 kN, slack hauled in, wrapping around building edges,
  and moving anchors that share the pull by mass.
- `anchors.js`: the web is shot along a fan of real directions and sticks to the first building it
  hits. The best few candidates are flown for 1.8 s with the same physics, and the one whose arc
  stays clear and keeps your heading wins. Weights are tuned by `scripts/swing-tune.mjs`.
- `src/hero/controller.js`: the movement state machine.

## Tests and checks

```
npm test                              # unit tests (physics invariants, swing battery, settings)
npm run test:e2e                      # Playwright smoke tests (muted browser)
node scripts/swing-check.mjs          # real key presses on a frozen build
node scripts/swing-sim.mjs 24 20      # deterministic swing battery in Node
node scripts/fps-check.mjs <url>      # frame times along a swing route
node scripts/webkit-check.mjs <url>   # Safari engine (ENGINE=firefox for Firefox)
```

Every script browser is muted.

## Credits

Character body and animations: Quaternius (CC0). Fonts: Bangers and Barlow Condensed (Google
Fonts, OFL). Everything else (city, suit, sound) is generated in code.
