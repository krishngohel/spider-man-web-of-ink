# Spider-Man: Web of Ink (unofficial fan game)

A comic-book Spider-Man game that runs in the browser. Swinging is Insomniac-style: hold swing and
the webs chain on their own, arcs follow where you steer, speed builds to a cruise, and a well
timed release or a swing-jump throws you further. Gravity, drag, the line and collisions are real
physics; the game-feel forces on top are logged separately (see spec 4.2).

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
| Move and steer (swings follow where you point) | W A S D | Left stick |
| Look | Mouse | Right stick |
| Swing (hold: webs chain while held), parkour run and wall run | Shift | RT / R2 |
| Jump. Swinging: swing-jump. In the air: web wings | Space | A / Cross |
| Web zip to where you look, then Space to launch | Q | LT + RT |
| Dive (hold in the air) | C | B / Circle |
| Controls help | H | Back |
| Pause | Esc or P | Start |
| Physics tuning panel | ` (backquote), or open with `?dev=1` | |

Tips: let go of swing just after the bottom of an arc, on the way up, for a perfect release
boost. Swing into a wall and you run along it. Settings > Gravity switches between Comic (2g, the
default) and Real (1g).

## How the swinging works

- `src/physics/` has no Three.js in it. It steps at a fixed 240 Hz.
- `ledger.js`: velocity only changes through `applyDv(body, source, ...)`: gravity, drag, lift,
  rope, surface, or assist (game feel). Tests check the sources add up to the total change.
- `swing.js`: the swing. The pivot sits ahead of and above you on your heading, the strand sticks
  to the nearest building at that height, the arc stays in the plane you steer, a pump through the
  bottom builds speed toward the cruise, and the line shortens rather than hit the street.
- `anchors.js` `findSwingAnchor`: where the next web goes (with altitude hold).
- `rope.js`: the real rope (SHAKE line, winch, wrapping) used for zips.
- `src/hero/controller.js`: the movement state machine.
- Feel constants live in `constants.js` (tuned by `scripts/swing-tune.mjs` against the swing
  simulator), and every one of them is a live slider in the dev panel (backquote).

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
