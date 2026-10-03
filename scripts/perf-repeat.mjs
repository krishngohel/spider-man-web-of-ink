// Composite cost where the browser has no GPU timer (Safari): the frame time with the ink
// composite drawn 1, 2 and 4 times; the slope is the composite's cost. Frame cap off.
//   node scripts/perf-repeat.mjs [url] [webkit|chromium]
import { chromium, webkit } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5312/';
const kind = process.argv[3] ?? 'webkit';
const b = kind === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ args: launchArgs(), headless: true });
const res = [];
for (const k of [1, 2, 4]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`${url}?at=swing&inkrepeat=${k}&uncapped=1`);
  await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
  await p.evaluate(() => { const v = document.querySelector('video, audio'); if (v) v.volume = 0; });
  await sleep(2000);
  const ms = await p.evaluate(() => new Promise((done) => { const t = []; let last = performance.now(); const f = (now) => { t.push(now - last); last = now; if (t.length < 240) requestAnimationFrame(f); else { t.sort((a, b) => a - b); done(t[Math.floor(t.length / 2)]); } }; requestAnimationFrame(f); }));
  res.push([k, ms]);
  await p.close();
}
await b.close();
for (const [k, ms] of res) console.log(`composite x${k}: median frame ${ms.toFixed(2)} ms`);
console.log(`composite cost about ${((res[2][1] - res[0][1]) / 3).toFixed(2)} ms per draw (${kind})`);
