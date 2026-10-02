// Films the ledge mantle from the side as a strip of frames.
//   node scripts/moves-film.mjs [url] [out.png]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const out = process.argv[3] ?? 'shots/moves.png';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 560, height: 640 } });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
const ledge = await p.evaluate(() => {
  const boxes = window.__game.city.boxes.filter((b) => b.kind === 'building');
  for (const b of boxes) {
    const top = b.max[1];
    if (top < 18 || top > 45 || b.max[2] - b.min[2] < 12) continue;
    const x = b.max[0] + 5, z = (b.min[2] + b.max[2]) / 2, y = top - 0.6;
    const clear = !boxes.some((o) => o !== b && x + 1 > o.min[0] && b.max[0] < o.max[0] && z > o.min[2] - 1 && z < o.max[2] + 1 && y < o.max[1] + 2);
    if (clear) return { x, y, z };
  }
  return null;
});
await p.evaluate(() => window.__game.setCamOverride({ at: [0, 0.6, 6], fov: 45, lookY: 0.3 }));
await p.evaluate(([x, y, z]) => window.__game.teleport(x, y, z, -10, 3, 0, 'air', -Math.PI / 2), [ledge.x, ledge.y, ledge.z]);
const shots = [];
for (const t of [200, 380, 500, 620, 760, 1000]) {
  await sleep(t - (shots.length ? [200, 380, 500, 620, 760, 1000][shots.length - 1] : 0));
  shots.push(await p.screenshot());
}
await b.close();
const tiles = await Promise.all(shots.map((s) => sharp(s).resize(280, 320).toBuffer()));
await sharp({ create: { width: 280 * tiles.length, height: 320, channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: i * 280, top: 0 }))).png().toFile(out);
console.log('wrote', out);
