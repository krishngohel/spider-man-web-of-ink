// A lineup of suits on the hero (front and back), for judging the suit styles.
//   node scripts/suits.mjs [url] [out.png] [ids comma-separated]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const out = process.argv[3] ?? 'shots/suits.png';
const ids = (process.argv[4] ?? 'classic,blackSuit,iron,noir,2099,stealth,negative,gold').split(',');
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 420, height: 640 } });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.evaluate(() => { document.querySelector('.lockhint')?.remove(); document.querySelector('.tip')?.remove(); const s = window.__game.spawn; window.__game.teleport(s.x, s.y, s.z, 0, 0, 0, 'ground', 0); });
const shots = [];
for (const id of ids) {
  for (const z of [3.3, -3.3]) {
    await p.evaluate(([i, zz]) => { const g = window.__game; const s = g.save(); s.progress.suit = i; g.progress().apply(); g.setCamOverride({ at: [0.4, 0.3, zz], fov: 34, lookY: 0.05 }); }, [id, z]);
    await sleep(350);
    shots.push(await p.screenshot());
  }
}
await b.close();
const tiles = await Promise.all(shots.map((s) => sharp(s).resize(210, 320).toBuffer()));
await sharp({ create: { width: 210 * 8, height: 320 * Math.ceil(tiles.length / 8), channels: 3, background: '#000' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 8) * 210, top: Math.floor(i / 8) * 320 }))).png().toFile(out);
console.log('wrote', out);
