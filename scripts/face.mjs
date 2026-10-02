// Head close-ups (front, three-quarter, side, high three-quarter) for judging the mask and lenses.
//   node scripts/face.mjs [url] [out.png]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const out = process.argv[3] ?? 'shots/face.png';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 600, height: 600 } });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.evaluate(() => { const s = window.__game.spawn; window.__game.teleport(s.x, s.y, s.z, 0, 0, 0, 'ground', 0); });
await sleep(400);
const head = Number(process.env.HEAD ?? 0.72);
const views = [[0, head, 2.4], [1.7, head, 1.7], [2.4, head, 0], [1.3, head + 1.0, 1.6]];
const shots = [];
for (const [x, y, z] of views) {
  await p.evaluate(([a, b2, c, h]) => window.__game.setCamOverride({ at: [a, b2, c], fov: 14, lookY: h }), [x, y, z, head]);
  await sleep(300);
  shots.push(await p.screenshot());
}
await b.close();
const tiles = await Promise.all(shots.map((s) => sharp(s).toBuffer()));
await sharp({ create: { width: 600 * tiles.length, height: 600, channels: 3, background: '#000' } }).composite(tiles.map((t, i) => ({ input: t, left: i * 600, top: 0 }))).png().toFile(out);
console.log('wrote', out);
