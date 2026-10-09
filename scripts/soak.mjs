// Soak: teleport round the districts for a few minutes, sampling the JS heap (leaks show as a climb).
// Headless and muted.
//   node scripts/soak.mjs [minutes] [url]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const mins = Number(process.argv[2] ?? 3);
const url = process.argv[3] ?? 'http://localhost:5300/';
const b = await chromium.launch({ args: launchArgs(['--enable-precise-memory-info']), headless: true });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(new URL('?at=swing', url).href);
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await sleep(5000);
const ds = await p.evaluate(() => window.__game.city.districts.filter((d) => d.id !== 'queens').map((d) => ({ x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2 })));
const t0 = Date.now(); let i = 0;
while (Date.now() - t0 < mins * 60000) {
  const d = ds[i++ % ds.length];
  await p.evaluate((d) => { const g = window.__game; g.teleport(d.x + 16.5, 1, d.z, 0, 0, 0, 'ground', 0); }, { x: Math.round((d.x + 1560) / 120) * 120 - 1560, z: d.z });
  await sleep(5000);
  if (i % 4 === 0) { await p.evaluate(() => window.gc?.()); const m = await p.evaluate(() => ({ heap: Math.round(performance.memory.usedJSHeapSize / 1048576), fps: Math.round(window.__game.fps) })); console.log(`t ${Math.round((Date.now() - t0) / 1000)}s heap ${m.heap} MB fps ${m.fps}`); }
}
console.log(errs.slice(0, 3).join('\n') || 'no errors');
await b.close();
process.exit(errs.length ? 1 : 0);
