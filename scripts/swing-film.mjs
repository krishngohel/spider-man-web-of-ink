// Contact sheets of real aimed swinging: the script aims each web like a skilled player (the
// simulator's pick), holds, lets go on the rise, and photographs every `every` ms.
//   node scripts/swing-film.mjs [url] [out.png] [every ms] [frames]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5300/';
const out = process.argv[3] ?? 'shots/swing-film.png';
const every = +(process.argv[4] ?? 150), count = +(process.argv[5] ?? 24);
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.evaluate(() => window.__game.teleport(0, 45, -400, 0, 0, 18, 'air', 0));
const frames = [];
let holding = false, sinceRelease = 999, last = Date.now();
const t0 = Date.now();
while (frames.length < count) {
  const h = await p.evaluate(() => window.__game.hero());
  const now = Date.now();
  sinceRelease += now - last; last = now;
  if (h.state === 'swing') {
    if (h.swing.angle > 25 && h.v.y > 0) { await p.keyboard.up('Shift'); holding = false; sinceRelease = 0; }
  } else if (!holding && sinceRelease > 250 && (h.v.y < 2 || h.p.y < 20) && h.state === 'air') {
    const s = await p.evaluate(() => window.__game.suggest(0, 1));
    if (s) { await p.evaluate(([x, y, z]) => window.__game.aimAt(x, y, z), [s.x, s.y, s.z]); await p.keyboard.down('Shift'); holding = true; }
  }
  if (now - t0 >= frames.length * every) frames.push(await p.screenshot());
  await sleep(10);
}
await p.keyboard.up('Shift');
await b.close();
const cols = 6, w = 320, hgt = 180;
const tiles = await Promise.all(frames.map((f) => sharp(f).resize(w, hgt).toBuffer()));
await sharp({ create: { width: w * cols, height: hgt * Math.ceil(tiles.length / cols), channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * w, top: Math.floor(i / cols) * hgt }))).png().toFile(out);
console.log('wrote', out, errors.length ? errors.join(' | ') : 'no errors');
