// Contact sheet of poses from three views (front, side, three-quarter back).
//   node scripts/pose-sheet.mjs [url] [out.png] [names comma separated]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5300/pose.html';
const out = process.argv[3] ?? 'shots/pose-sheet.png';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 360, height: 420 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto(url);
await p.waitForFunction(() => window.__poseReady, null, { timeout: 120000 });
const names = process.argv[4] ? process.argv[4].split(',') : await p.evaluate(() => ['rest', ...window.__pose.names]);
const views = [{ yaw: 0 }, { yaw: Math.PI / 2 }, { yaw: Math.PI * 0.8, pitch: 0.35 }];
const tiles = [];
for (const n of names) for (const v of views) {
  await p.evaluate(([name, view]) => window.__pose.show(name, view), [n, v]);
  const shot = await p.screenshot();
  const label = Buffer.from(`<svg width="200" height="24"><text x="6" y="18" font-family="Arial" font-size="16" fill="#222">${n}</text></svg>`);
  const base = await sharp(shot).resize(240, 280).toBuffer();
  tiles.push(await sharp(base).composite([{ input: label, top: 0, left: 0 }]).toBuffer());
}
await b.close();
const cols = 6, rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: 240 * cols, height: 280 * rows, channels: 3, background: '#fff' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 240, top: Math.floor(i / cols) * 280 }))).png().toFile(out);
console.log('wrote', out, tiles.length, 'tiles');
