// Debug: trace hero state while holding keys. node scripts/trace.mjs <url> "<teleport args json>" "<keys>" <ms>
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';
const [url, tp = '[0,50,-330,0,0,22,"air",0]', keys = 'Shift', ms = '2000'] = process.argv.slice(2);
const browser = await chromium.launch({ args: launchArgs(), headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url + '?at=swing');
await page.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await page.mouse.click(640, 360);
await sleep(200);
await page.evaluate((a) => { window.__game.teleport(...a); window.__game.setLook(a[7], 0.15); }, JSON.parse(tp));
const pre = +(process.argv[6] ?? 0);
if (pre) await sleep(pre);
for (const k of keys.split(',').filter(Boolean)) await page.keyboard.down(k);
const t0 = Date.now();
while (Date.now() - t0 < +ms) {
  const h = await page.evaluate(() => window.__game.hero());
  console.log(((Date.now() - t0) / 1000).toFixed(2), h.state.padEnd(6), 'p', h.p.x.toFixed(1), h.p.y.toFixed(1), h.p.z.toFixed(1), 'v', h.v.x.toFixed(1), h.v.y.toFixed(1), h.v.z.toFixed(1), 'rope', h.rope.active ? h.rope.length.toFixed(1) + ' T' + (h.rope.tension / 1000).toFixed(1) + 'k' : '-');
  await sleep(60);
}
await browser.close();
