// Films a scripted moment from the side camera as a contact sheet.
//   node scripts/moment-film.mjs <url> <out.png> <moment> [every ms] [frames]
// moments: land (a hard drop onto the street), perch (stand on a roof until the idle crouch),
// launch (zip to a ledge and point-launch)
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const [url = 'http://localhost:5300/', out = 'shots/moment.png', moment = 'land', every = '120', count = '18'] = process.argv.slice(2);
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.evaluate(() => window.__game.setCamOverride({ side: 4, up: 0.2, fov: 34 }));
if (moment === 'land') await p.evaluate(() => window.__game.teleport(0, 26, -330, 0, 0, 3, 'air', 0));
if (moment === 'perch') await p.evaluate(() => { const s = window.__game.spawn; window.__game.teleport(s.x, s.y, s.z, 0, 0, 0, 'ground', 0); });
if (moment === 'launch') {
  await p.evaluate(() => { const s = window.__game.spawn; window.__game.teleport(s.x, s.y, s.z, 0, 0, 0, 'ground', 0); window.__game.setCamOverride(null); });
}
const frames = [], log = [];
const t0 = Date.now();
let launched = false;
while (frames.length < +count) {
  const h = await p.evaluate(() => ({ ...window.__game.hero(), pose: window.__game.poser() }));
  if (Date.now() - t0 >= frames.length * +every) { frames.push(await p.screenshot()); log.push(`${frames.length - 1}:${h.state}${h.pose.trick ? ' ' + h.pose.trick : ''}`); }
  await sleep(5);
}
await b.close();
const cols = 6, w = 300, hh = 225;
const tiles = await Promise.all(frames.map((f, i) => sharp(f).resize(w, hh).composite([{ input: Buffer.from(`<svg width="${w}" height="20"><text x="4" y="15" font-family="Arial" font-size="13" fill="#fff" stroke="#000" stroke-width="0.6">${log[i]}</text></svg>`), top: 0, left: 0 }]).toBuffer()));
await sharp({ create: { width: w * cols, height: hh * Math.ceil(tiles.length / cols), channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * w, top: Math.floor(i / cols) * hh }))).png().toFile(out);
console.log('wrote', out, errors.length ? errors.join(' | ') : 'no errors');
