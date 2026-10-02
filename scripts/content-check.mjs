// Open-world content check (spec 11): a backpack, a landmark photo, a bomb defused with the hang
// key held, a getaway car stopped with web shots, a street crime fought with real clicks, a race
// run through its rings, a research puzzle solved in its own UI, and the tracker screen.
//   node scripts/content-check.mjs [url]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5310/';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.mouse.click(640, 360);
await sleep(300);
const ev = (f, a) => p.evaluate(f, a);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };
await ev(() => window.__game.setSetting('crimes', true));

// A backpack: stand on it.
const bp = await ev(() => window.__game.catalog().backpacks.find((q) => !window.__game.save().collect.backpacks.includes(q.id)));
const before = await ev(() => window.__game.save().collect.backpacks.length);
await ev(([x, y, z]) => window.__game.teleport(x, y + 0.6, z, 0, 0, 0, 'air'), [bp.x, bp.y, bp.z]);
await sleep(800);
const after = await ev(() => window.__game.save().collect.backpacks.length);
check('a backpack is picked up by walking onto it', after === before + 1, `${before} -> ${after}`);

// A photo: aim at Fisk Tower from a roof and press P.
const fisk = await ev(() => window.__game.catalog().photos.find((q) => q.id === 'ph-fisk'));
await ev(([x, z]) => window.__game.teleport(x + 120, 80, z + 120, 0, 0, 0, 'air'), [fisk.x, fisk.z]);
await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [fisk.x, fisk.y, fisk.z]);
await p.keyboard.press('KeyP');
await sleep(300);
check('a landmark photo with P', await ev(() => window.__game.save().collect.photos.includes('ph-fisk')));

// A bomb: get there and hold the hang key.
await ev(() => window.__game.teleport(0, 0.9, -200, 0, 0, 0, 'ground', 0));
await sleep(300);
let kind = await ev(() => window.__game.forceCrime('bomb'));
let st = await ev(() => window.__game.content());
if (st.crime) {
  await ev(([x, z]) => window.__game.teleport(x, 0.9, z + 1, 0, 0, 0, 'ground'), [st.crime.x, st.crime.z]);
  await sleep(200);
  await p.keyboard.down('KeyE'); await sleep(2800); await p.keyboard.up('KeyE');
  await sleep(300);
}
const crimes1 = await ev(() => window.__game.save().activities.crimes);
check('a bomb defused by holding the hang key', kind === 'bomb' && crimes1 >= 1 && !(await ev(() => window.__game.content().crime)), `crimes ${crimes1}`);

// A getaway car: web shots until it stops, then the two who climb out.
kind = await ev(() => window.__game.forceCrime('chase'));
const t0 = Date.now();
let stopped = false;
while (Date.now() - t0 < 40000) {
  st = await ev(() => window.__game.content());
  if (!st.crime) { stopped = true; break; }
  const h = await ev(() => window.__game.hero());
  const c = await ev(() => window.__game.combatState().enemies.filter((e) => e.state !== 'out' && e.state !== 'webbed'));
  if (st.crime.car !== null && st.crime.car < 4) {
    await ev(([x, z]) => { const hp = window.__game.hero().p; if (Math.hypot(hp.x - x, hp.z - z) > 16) window.__game.teleport(x + 8, 4, z + 8, 0, 0, 0, 'air'); }, [st.crime.x, st.crime.z]);
    await ev(([x, z]) => window.__game.aimAt(x, 0.9, z), [st.crime.x, st.crime.z]);
    await p.mouse.down({ button: 'right' }); await sleep(40); await p.mouse.up({ button: 'right' });
    await sleep(250);
  } else if (c.length) {
    const n = c.reduce((a, e) => (Math.hypot(e.x - h.p.x, e.z - h.p.z) < Math.hypot(a.x - h.p.x, a.z - h.p.z) ? e : a));
    await ev(([y]) => window.__game.setLook(y, 0.1), [Math.atan2(n.x - h.p.x, n.z - h.p.z)]);
    await p.mouse.down(); await sleep(30); await p.mouse.up(); await sleep(120);
  }
}
check('a getaway car stopped with webs and the crew beaten', kind === 'chase' && stopped);

// A race: through every ring (flown through by teleporting between them: this checks the course
// logic and the medal, the swinging is checked by swing-check).
const race = await ev(() => window.__game.catalog().races[0]);
await ev(([x, z]) => window.__game.teleport(x, 0.9, z, 0, 0, 0, 'ground'), [race.x, race.z]);
await sleep(3600);
for (const r of race.rings) { await ev(([x, y, z]) => window.__game.teleport(x, y, z, 0, 0, 0, 'air'), [r.x, r.y, r.z]); await sleep(120); }
await sleep(300);
const medal = await ev((id) => window.__game.save().activities.races[id], race.id);
check('a race run through its rings earns a medal', !!medal && medal.medal >= 1, JSON.stringify(medal));

// Research: the circuit puzzle, solved in its own UI.
const rs = await ev(() => window.__game.catalog().research.find((q) => q.task === 'circuit'));
await ev(([x, y, z]) => window.__game.teleport(x + 1.5, y + 0.3, z, 0, 0, 0, 'air'), [rs.x, rs.y, rs.z]);
await sleep(700);
await p.keyboard.press('KeyE');
await sleep(500);
const open = await ev(() => !!document.querySelector('.puzzle:not(.hidden)'));
if (open) {
  const target = await ev(() => Number(/Target (\d+)/.exec(document.querySelector('.pread').textContent)[1]));
  let left = target;
  const sliders = await p.$$('.puzzle input[type=range]');
  for (let i = 0; i < sliders.length; i++) {
    const v = Math.max(1, Math.min(9, left - (sliders.length - 1 - i)));
    await sliders[i].evaluate((el, val) => { el.value = String(val); el.dispatchEvent(new Event('input')); }, v);
    left -= v;
  }
  await sleep(900);
}
check('a research station: the circuit puzzle solved', open && (await ev((id) => window.__game.save().activities.research.includes(id), rs.id)));

// The tracker opens from the pause menu and lists every district.
await ev(() => window.__game.play());
const rows = await ev(() => window.__game.tracker().rows.length);
check('the tracker covers every district', rows === 10, `${rows} rows`);

await b.close();
console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no console errors');
const failed = results.filter((x) => !x).length + (errors.length ? 1 : 0);
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
