// Films one aimed swing and its release from the side (camera fixed beside the hero), as a
// contact sheet, for judging the animation. node scripts/swing-side.mjs [url] [out] [every ms] [frames] [jump]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5300/';
const out = process.argv[3] ?? 'shots/swing-side.png';
const SIDE = process.env.SIDE ?? 6;
const every = +(process.argv[4] ?? 100), count = +(process.argv[5] ?? 30);
const jump = process.argv[6] === 'jump';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
// Mid-avenue at 50 m, moving north at 20 m/s; the web goes where a skilled player would put it.
// The camera sits 9 m to the hero's left (west), looking at him.
await p.evaluate((S) => { window.__game.teleport(0, 50, -300, 0, 0, 20, 'air', 0); window.__game.setCamOverride({ side: S, up: 0.4, fov: 34 }); }, Number(SIDE));
await sleep(100);
const pick = await p.evaluate(() => window.__game.suggest(0, 1));
console.log('web target', JSON.stringify(pick));
await p.evaluate(([x, y, z]) => window.__game.aimAt(x, y, z), [pick.x, pick.y, pick.z]);
await p.keyboard.down('Shift');
const frames = [];
const log = [];
const t0 = Date.now();
let released = false, holding = true, swingsDone = 0, sinceRel = 0, lastT = Date.now();
while (frames.length < count) {
  const h = await p.evaluate(() => ({ ...window.__game.hero(), pose: window.__game.poser() }));
  const now = Date.now(); sinceRel += now - lastT; lastT = now;
  if (holding && h.state === 'swing' && h.swing.angle > 28 && h.v.y > 0) {
    if (jump && swingsDone === 0) await p.keyboard.press('Space');
    await p.keyboard.up('Shift'); holding = false; released = true; swingsDone++; sinceRel = 0;
  } else if (!holding && swingsDone < 3 && h.state === 'air' && sinceRel > 450 && h.v.y < 1) {
    const s = await p.evaluate(() => window.__game.suggest(0, 1));
    if (s) { await p.evaluate(([x, y, z]) => window.__game.aimAt(x, y, z), [s.x, s.y, s.z]); await p.keyboard.down('Shift'); holding = true; }
  }
  if (Date.now() - t0 >= frames.length * every) {
    frames.push(await p.screenshot());
    log.push(`${frames.length - 1}:${h.state}${h.swing.active ? ' a' + Math.round(h.swing.angle) : ''}${h.pose.trick ? ' ' + h.pose.trick : ''}`);
  }
  await sleep(5);
}
await p.keyboard.up('Shift');
await b.close();
const cols = Number(process.env.COLS ?? 6), w = Math.round(1800 / cols), hh = Math.round(w * 0.75);
const tiles = await Promise.all(frames.map((f, i) => sharp(f).resize(w, hh).composite([{ input: Buffer.from(`<svg width="${w}" height="20"><text x="4" y="15" font-family="Arial" font-size="13" fill="#fff" stroke="#000" stroke-width="0.6">${log[i]}</text></svg>`), top: 0, left: 0 }]).toBuffer()));
await sharp({ create: { width: w * cols, height: hh * Math.ceil(tiles.length / cols), channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * w, top: Math.floor(i / cols) * hh }))).png().toFile(out);
console.log('wrote', out, errors.length ? errors.join(' | ') : 'no errors');
console.log(log.join('  '));
