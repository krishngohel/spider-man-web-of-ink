// A photo tour of the city: one shot per district and landmark from a fixed absolute camera.
//   node scripts/tour.mjs [url] [out.png] [filter]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const out = process.argv[3] ?? 'shots/tour.png';
const filter = process.argv[4] ?? '';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
const stops = await p.evaluate(() => {
  const c = window.__game.city;
  const out = [];
  for (const d of c.districts) out.push({ name: d.name, x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2, far: 260, h: 140 });
  for (const l of c.landmarks) out.push({ name: l.name, x: l.x, z: l.z, far: 170, h: 90 });
  return out;
});
const shots = [], names = [];
for (const s of stops) {
  if (filter && !s.name.toLowerCase().includes(filter)) continue;
  await p.evaluate((q) => {
    window.__game.teleport(q.x, 400, q.z, 0, 0, 0, 'air', 0);
    window.__game.setCamOverride({ pos: [q.x - q.far * 0.6, q.h, q.z + q.far], look: [q.x, 15, q.z], fov: 55 });
  }, s);
  await sleep(700);
  shots.push(await p.screenshot()); names.push(s.name);
}
await b.close();
const cols = 4, w = 480, h = 270;
const tiles = await Promise.all(shots.map((f, i) => sharp(f).resize(w, h).composite([{ input: Buffer.from(`<svg width="${w}" height="24"><text x="6" y="18" font-family="Arial" font-size="16" fill="#fff" stroke="#000" stroke-width="0.8">${names[i].replace(/'/g, '')}</text></svg>`), top: 0, left: 0 }]).toBuffer()));
await sharp({ create: { width: w * cols, height: h * Math.ceil(tiles.length / cols), channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * w, top: Math.floor(i / cols) * h }))).png().toFile(out);
console.log('wrote', out, shots.length, 'stops');
