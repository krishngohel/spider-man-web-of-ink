// Every roster character standing on the spawn roof, front three-quarter view, tiled.
//   node scripts/roster-shots.mjs [url] [out.png]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const out = process.argv[3] ?? 'shots/roster.png';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 360, height: 480 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(url + '?at=swing&roster=1');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.evaluate(() => { document.querySelector('.lockhint')?.remove(); document.querySelector('.tip')?.remove(); window.__game.setSetting('crimes', false); });
const ids = await p.evaluate(() => window.__game.roster());
const shots = [];
for (const id of ids) {
  await p.evaluate((i) => { const g = window.__game, s = g.spawn; g.switchCharacter(i); g.teleport(s.x, s.y, s.z, 0, 0, 0, 'ground', 0); g.setCamOverride({ at: [1.6, 0.5, 3.4], fov: 40, lookY: 0.15 }); document.querySelector('.caption')?.classList.remove('show'); }, id);
  await sleep(500);
  shots.push(await p.screenshot());
}
await b.close();
const tiles = await Promise.all(shots.map((s, i) => sharp(s).resize(240, 320).composite([{ input: Buffer.from(`<svg width="240" height="24"><text x="6" y="18" font-family="Arial" font-size="15" fill="#fff" stroke="#000" stroke-width="0.7">${ids[i]}</text></svg>`), top: 0, left: 0 }]).toBuffer()));
await sharp({ create: { width: 240 * 7, height: 320 * Math.ceil(tiles.length / 7), channels: 3, background: '#000' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 7) * 240, top: Math.floor(i / 7) * 320 }))).png().toFile(out);
console.log('wrote', out, errors.length ? errors.join(' | ') : 'no errors');
