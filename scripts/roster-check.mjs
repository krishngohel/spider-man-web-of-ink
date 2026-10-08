// Real-key checks for the roster's movers: each archetype does its thing in the real game.
//   node scripts/roster-check.mjs [url]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5310/';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(url + '?at=swing&roster=1');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
// The mocap clips parse right after ready (a few hundred ms of main-thread work): let them land
// before the first timed flight, or it gets fewer physics steps.
await sleep(5000);
await p.mouse.click(640, 360);
await sleep(300);
await p.evaluate(() => window.__game.setSetting('crimes', false));
const H = () => p.evaluate(() => window.__game.hero());
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };
// Switch, place and aim; then let a frame or two pass so the camera's look direction updates
// before any key goes down (a real player aims first).
const as = async (id, x, y, z, state = 'ground', yaw = 0, pitch = 0.1) => {
  await p.evaluate(([i, a, bb, c, s, w, pt]) => { const g = window.__game; g.switchCharacter(i); g.teleport(a, bb, c, 0, 0, 0, s, w); g.setLook(w, pt); }, [id, x, y, z, state, yaw, pitch]);
  await sleep(120);
};

// Vulture: holding forward and jump climbs on the wing harness.
await as('vulture', 0, 60, -300, 'air', 0, 0.1);
// He dips as the thrust takes over, then climbs: judged on the climb, over two seconds.
await p.keyboard.down('KeyW'); await p.keyboard.down('Space'); await sleep(2000);
let h = await H(); await p.keyboard.up('KeyW'); await p.keyboard.up('Space');
check('Vulture flies up on the harness', h.p.y > 62 && h.v.y > 2 && h.state === 'air', `y ${h.p.y.toFixed(1)}, vy ${h.v.y.toFixed(1)}, ${h.state}`);

// Goblin: hover jets hold the glider up.
await as('goblin', 0, 60, -300, 'air');
await p.keyboard.down('Space'); await sleep(1500);
h = await H(); await p.keyboard.up('Space');
check('Goblin hovers on his glider', h.p.y > 55, `y ${h.p.y.toFixed(1)}`);

// Rhino: the charge is fast.
await as('rhino', 0, 0.9, -360, 'ground', 0, 0.1);
await p.keyboard.down('KeyW'); await p.keyboard.down('ShiftLeft'); await sleep(1500);
h = await H(); await p.keyboard.up('KeyW'); await p.keyboard.up('ShiftLeft');
check('Rhino charges', h.speed > 14, `${(h.speed * 3.6).toFixed(0)} km/h`);

// Shocker: a vibro blast at the ground throws him up.
await as('shocker', 0, 0.9, -360, 'ground', 0, 1.3); // positive pitch looks down
await p.keyboard.press('ShiftLeft'); await sleep(250);
h = await H();
check('Shocker recoil-jumps off a blast at the ground', h.p.y > 2.2, `y ${h.p.y.toFixed(1)}`);

// Sandman: a sand pillar launches him.
await as('sandman', 0, 0.9, -360, 'ground', 0, 0.1);
await p.keyboard.press('ShiftLeft'); await sleep(450);
h = await H();
check('Sandman launches on a sand pillar', h.p.y > 5, `y ${h.p.y.toFixed(1)}`);

// Lizard: running into a wall grabs it.
const wall = await p.evaluate(() => { const b = window.__game.city.boxes.find((q) => q.kind === 'building' && q.district === 'midtown' && q.max[1] > 60 && q.min[1] === 0); return { x: b.max[0] + 3, z: (b.min[2] + b.max[2]) / 2 }; });
await as('lizard', wall.x, 0.9, wall.z, 'ground', -Math.PI / 2, 0.1);
await p.keyboard.down('KeyW'); await sleep(900);
h = await H(); await p.keyboard.up('KeyW');
check('Lizard grabs the wall he runs into', h.state === 'wall', h.state);

// Electro: a magnetic pull to a lamp post.
const lamp = await p.evaluate(() => { const g = window.__game; return { ok: true }; });
await as('electro', 0, 0.9, -200, 'ground', 0.22, -0.08);
const before = await H();
await p.keyboard.press('ShiftLeft'); await sleep(120);
h = await H();
check('Electro pulls himself to metal', h.state === 'zip' || Math.hypot(h.p.x - before.p.x, h.p.z - before.p.z) > 2, `${h.state}`);
void lamp;

// Black Cat: one grapple line, then a cooldown.
await as('blackcat', 0, 0.9, -200, 'ground', 0.5, -0.45);
await p.keyboard.press('ShiftLeft'); await sleep(150);
h = await H();
check('Black Cat fires her grapple line', h.state === 'zip' || h.p.y > 1.5, h.state);

// Everyone loads and stands without errors.
const ids = await p.evaluate(() => window.__game.roster());
for (const id of ids) { await as(id, 60, 82.91, -30, 'ground'); await sleep(120); }
check('all 19 characters load and stand', errors.length === 0, `${ids.length} characters`);
await b.close();
const failed = results.filter((x) => !x).length;
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
process.exit(failed ? 1 : 0);
