// The same street and skyline at several times and weathers, tiled.
//   node scripts/env-shots.mjs [url] [out.png]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const out = process.argv[3] ?? 'shots/env.png';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
const cases = [[11, 'clear'], [18.4, 'clear'], [22.5, 'clear'], [6.4, 'clear'], [13, 'overcast'], [15, 'rain']];
const shots = [];
for (const [h, w] of cases) {
  await p.evaluate(([hh, ww]) => {
    const g = window.__game;
    g.setTime(hh); g.setWeather(ww);
    g.teleport(0, 1, -200, 0, 0, 0, 'ground', 0);
    g.setCamOverride({ pos: [6, 14, -260], look: [0, 30, -120], fov: 62 });
  }, [h, w]);
  await sleep(900);
  shots.push(await p.screenshot());
}
await b.close();
const tiles = await Promise.all(shots.map((f) => sharp(f).resize(640, 360).toBuffer()));
await sharp({ create: { width: 1920, height: 720, channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % 3) * 640, top: Math.floor(i / 3) * 360 }))).png().toFile(out);
console.log('wrote', out);
