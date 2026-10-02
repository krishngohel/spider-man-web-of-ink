// Frame-time check along a fixed swing route. Usage: node scripts/fps-check.mjs [url] [quality]
// Reports p50/p95 of the frame interval, the game's own CPU work per frame, and GPU time (timer
// query, where the browser has it). Muted. A/B against the previous build in the same run when
// judging a change: this laptop is shared and its numbers drift.
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5300/';
const quality = process.argv[3] ?? 'high';
const browser = await chromium.launch({ args: launchArgs(['--disable-frame-rate-limit', '--disable-gpu-vsync']), headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url + (url.includes('?') ? '&' : '?') + 'at=swing&gputime=1');
await page.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await page.evaluate((q) => { window.__game.setSetting('quality', q); window.__game.setSetting('dynamicRes', false); }, quality);
await sleep(1500);

// Route: autopilot swing down the main avenue, then a dive past the landmark tower.
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
const all = { frame: [], work: [], gpu: [] };
async function leg(name, setup, ms) {
  await page.evaluate(setup);
  await sleep(300);
  await page.evaluate(() => { window.__game.resetTimes(); window.__game.resetProfile(); });
  await page.keyboard.down('KeyW');
  const t0 = Date.now();
  let holding = false, sawDown = false, rel = 0;
  while (Date.now() - t0 < ms) {
    const h = await page.evaluate(() => window.__game.hero());
    if (!holding && Date.now() - rel > 200 && h.v.y < -1) { await page.keyboard.down('Shift'); holding = true; sawDown = false; }
    if (holding && h.rope.active && h.v.y < -1) sawDown = true;
    if (holding && h.rope.active && sawDown && h.v.y > 2) { await page.keyboard.up('Shift'); holding = false; rel = Date.now(); }
    await sleep(30);
  }
  await page.keyboard.up('Shift'); await page.keyboard.up('KeyW');
  const t = await page.evaluate(() => ({ frame: window.__game.frameTimes, work: window.__game.workTimes, gpu: window.__game.gpuTimes }));
  for (const k of Object.keys(all)) all[k].push(...t[k]);
  const pr = await page.evaluate(() => window.__game.profile());
  console.log('   worst ms by section', JSON.stringify(Object.fromEntries(Object.entries(pr).map(([k, v]) => [k, +v.toFixed(2)]))));
  console.log(`${name.padEnd(10)} frames ${t.frame.length}  interval p50 ${pct(t.frame, 0.5).toFixed(2)} p95 ${pct(t.frame, 0.95).toFixed(2)} ms  cpu p50 ${pct(t.work, 0.5).toFixed(2)} p95 ${pct(t.work, 0.95).toFixed(2)} ms  gpu p50 ${pct(t.gpu, 0.5).toFixed(2)} p95 ${pct(t.gpu, 0.95).toFixed(2)} ms`);
}
await leg('avenue', () => window.__game.teleport(0, 45, -380, 0, 0, 24, 'air', 0), 6000);
await leg('crosstown', () => window.__game.teleport(-420, 30, -300, 22, 0, 0, 'air', Math.PI / 2), 6000);
await leg('tower', () => window.__game.teleport(-20, 200, -150, 0, -10, 20, 'air', 0), 5000);
const total = Math.max(pct(all.work, 0.95), pct(all.gpu, 0.95));
console.log(`ALL       cpu p95 ${pct(all.work, 0.95).toFixed(2)} ms, gpu p95 ${pct(all.gpu, 0.95).toFixed(2)} ms -> budget 6.9 ms: ${total <= 6.9 ? 'PASS' : 'OVER'}`);
await browser.close();
