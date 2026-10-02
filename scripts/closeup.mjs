// Close-ups of the hero standing on the spawn roof, in game rendering, from several angles.
//   node scripts/closeup.mjs [url] [out.png]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const out = process.argv[3] ?? 'shots/closeup.png';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 700, height: 900 } });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.evaluate(() => { const s = window.__game.spawn; window.__game.teleport(s.x, s.y, s.z, 0, 0, 0, 'ground', 0); });
await sleep(400);
const views = [[0, 0.2, 3.2], [2.3, 0.2, 2.3], [3.2, 0.2, 0], [0, 0.4, -3.2], [0, 0.85, 1.2]];
const shots = [];
for (const [x, y, z] of views) {
  const close = Math.hypot(x, z) < 2;
  await p.evaluate(([a, b2, c, cl]) => window.__game.setCamOverride({ at: [a, b2, c], fov: cl ? 30 : 34, lookY: cl ? 0.75 : 0.1 }), [x, y, z, close]);
  await sleep(250);
  shots.push(await p.screenshot());
}
await b.close();
const tiles = await Promise.all(shots.map((s) => sharp(s).resize(350, 450).toBuffer()));
await sharp({ create: { width: 350 * tiles.length, height: 450, channels: 3, background: '#000' } }).composite(tiles.map((t, i) => ({ input: t, left: i * 350, top: 0 }))).png().toFile(out);
console.log('wrote', out);
