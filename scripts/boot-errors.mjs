// Loads a URL and prints every console error, warning and page error for up to 25 s, then whether
// the game reached its first frames (why does it not boot?). Headless and muted.
//   node scripts/boot-errors.mjs [url]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5300/';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage();
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 300)); });
p.on('pageerror', (e) => console.log('pageerror', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')));
await p.goto(url);
let ok = false;
for (let i = 0; i < 25; i++) {
  await sleep(1000);
  const r = await p.evaluate(() => ({ ready: !!window.__game?.state?.ready, frame: window.__game?.frame ?? -1, boot: document.querySelector('#loading')?.className ?? '' }));
  if (r.ready && r.frame > 10) { console.log('ready at', i, 's frame', r.frame); ok = true; break; }
  if (/error/.test(r.boot)) { console.log('boot failed:', await p.evaluate(() => document.querySelector('#loading .msg.err, #loading .msg.fail')?.innerText ?? '')); break; }
  if (i === 24) console.log('not ready', JSON.stringify(r));
}
await b.close();
process.exit(ok ? 0 : 1);
