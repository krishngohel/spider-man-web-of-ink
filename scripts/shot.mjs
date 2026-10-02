// Screenshots of the running game. Usage:
//   node scripts/shot.mjs <url> <out.png> [js to run after ready] [wait ms]
// The browser is muted: the owner uses this laptop while scripts run.
import { chromium } from 'playwright-core';
import { launchArgs } from './lib.mjs';

const [url = 'http://localhost:5300/?at=swing', out = 'shots/shot.png', js = '', wait = '1500'] = process.argv.slice(2);
const browser = await chromium.launch({ args: launchArgs(), headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url);
await page.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
if (js) await page.evaluate(js);
await page.waitForTimeout(parseInt(wait, 10));
await page.screenshot({ path: out });
const info = await page.evaluate(() => ({ fps: Math.round(window.__game.fps), hero: window.__game.hero() }));
console.log(JSON.stringify(info));
console.log(errors.length ? errors.slice(0, 12).join('\n') : 'no console errors');
await browser.close();
