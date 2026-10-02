// Boots the game in WebKit (Safari's engine), or Firefox with ENGINE=firefox, enters play and
// swings for a few seconds. Usage: node scripts/webkit-check.mjs [url] [outDir]
// WebKit has no mute flag: master volume is set to 0 in storage before the page loads (the owner
// uses this laptop while tests run).
import { webkit, firefox } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { sleep } from './lib.mjs';

const engine = process.env.ENGINE ?? 'webkit';
const url = process.argv[2] ?? 'http://localhost:5300/';
const out = process.argv[3] ?? `shots/${engine}`;
mkdirSync(out, { recursive: true });
const b = engine === 'firefox'
  ? await firefox.launch({ firefoxUserPrefs: { 'webgl.force-enabled': true, 'media.volume_scale': '0.0' } })
  : await webkit.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.addInitScript(() => {
  try {
    const k = 'web-of-ink-settings-v1';
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.volume = { ...(s.volume || {}), master: 0 };
    localStorage.setItem(k, JSON.stringify(s));
  } catch { /* storage blocked */ }
});
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await p.goto(url);
await p.waitForFunction(() => window.__game?.state?.ready || document.querySelector('#loading.error'), null, { timeout: 180000 });
const bootMs = Date.now() - t0;
const err = await p.evaluate(() => !!document.querySelector('#loading.error'));
console.log(`${engine} boot ${bootMs} ms${err ? ' (LOADING ERROR)' : ''}`);
await p.screenshot({ path: `${out}/title.png` });
if (!err) {
  await p.locator('.title .mbtn.primary').click();
  await p.evaluate(() => {
    window.__game.teleport(0, 50, -330, 0, 0, 22, 'air', 0);
    const t = window.__game.suggest(0, 1);
    window.__game.aimAt(t.x, t.y, t.z);
  });
  await p.keyboard.down('Shift');
  await sleep(500);
  const h = await p.evaluate(() => window.__game.hero());
  await p.screenshot({ path: `${out}/swing.png` });
  await p.keyboard.up('Shift');
  console.log(`swing: state ${h.state}, rope ${h.rope.active}, speed ${h.speed.toFixed(1)} m/s, fps ${Math.round(await p.evaluate(() => window.__game.fps))}`);
}
console.log(errors.length ? 'errors:\n' + errors.slice(0, 10).join('\n') : 'no console errors');
await b.close();
process.exit(errors.length || err ? 1 : 0);
