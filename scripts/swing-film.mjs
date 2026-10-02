// Contact sheet of a chained swing: frames every 250 ms while holding swing and forward.
//   node scripts/swing-film.mjs [url] [out.png]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5300/';
const out = process.argv[3] ?? 'shots/swing-film.png';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.evaluate(() => { window.__game.teleport(0, 45, -400, 0, 0, 20, 'air', 0); });
await p.keyboard.down('Shift'); await p.keyboard.down('KeyW');
const frames = [];
for (let i = 0; i < 16; i++) {
  await p.evaluate(() => window.__game.setLook(0, 0.12));
  frames.push(await p.screenshot());
  await sleep(250);
}
await b.close();
const tiles = await Promise.all(frames.map((f) => sharp(f).resize(480, 270).toBuffer()));
await sharp({ create: { width: 480 * 4, height: 270 * 4, channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % 4) * 480, top: Math.floor(i / 4) * 270 }))).png().toFile(out);
console.log('wrote', out);
