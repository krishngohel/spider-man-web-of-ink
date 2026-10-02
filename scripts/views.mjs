// A fixed set of game views tiled into one image, for before/after comparisons of the look.
//   node scripts/views.mjs [url] [out.png]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const out = process.argv[3] ?? 'shots/views.png';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
// [x, y, z, state, yaw, pitch]: rooftop spawn, high over the avenue, street level, mid-air near a tower.
const views = [
  ['spawn', 0, 0, 0, 'ground', 0.5, 0.12],
  [null, 0, 70, -300, 'air', 0.25, 0.32],
  [null, 0, 1, -200, 'ground', 0.35, -0.12],
  [null, -20, 40, -60, 'air', -0.6, 0.05],
];
const shots = [];
for (const [tag, x, y, z, st, yaw, pitch] of views) {
  await p.evaluate(([t, a, b2, c, s, w, pt]) => {
    const g = window.__game;
    if (t === 'spawn') g.teleport(g.spawn.x, g.spawn.y, g.spawn.z, 0, 0, 0, s, w);
    else g.teleport(a, b2, c, 0, 0, 0, s, w);
    g.setLook(w, pt);
  }, [tag, x, y, z, st, yaw, pitch]);
  await sleep(700);
  shots.push(await p.screenshot());
}
await b.close();
const tiles = await Promise.all(shots.map((s) => sharp(s).resize(960, 540).toBuffer()));
await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % 2) * 960, top: Math.floor(i / 2) * 540 }))).png().toFile(out);
console.log('wrote', out);
