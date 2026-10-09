// Load time (spec 19.10): a cold load of the frozen build on a 40 Mbps link (40 ms latency) must
// reach the title screen, ready to play, in under 4 seconds. Also reports the bytes transferred.
//   node scripts/load-time.mjs [url]
import { chromium } from 'playwright-core';
import { launchArgs } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5312/';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 40e6 / 8, uploadThroughput: 10e6 / 8 });
let bytes = 0;
cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
const t0 = Date.now();
await p.goto(url);
await p.waitForFunction(() => window.__game?.state?.ready && !document.querySelector('.title.hidden'), null, { timeout: 60000 });
const ms = Date.now() - t0;
// Where the time went: the boot marks (game.js) as offsets from navigation start.
const marks = await p.evaluate(() => performance.getEntriesByType('mark').filter((m) => m.name.startsWith('boot:')).map((m) => `${m.name.slice(5)} ${Math.round(m.startTime)}`));
const res = await p.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.duration > 150).map((r) => `${r.name.split('/').pop().slice(0, 28)} ${Math.round(r.startTime)}-${Math.round(r.responseEnd)}`));
console.log('  marks:', marks.join(', '), ' programs', await p.evaluate(() => window.__game?.renderer?.info?.programs?.length ?? '?'));
if (process.env.VERBOSE) console.log('  slow resources:', res.join(' | '));
await b.close();
const ok = ms < 4000;
console.log(`${ok ? 'PASS' : 'FAIL'}  title ready in ${ms} ms at 40 Mbps  (${(bytes / 1e6).toFixed(2)} MB transferred)`);
process.exit(ok ? 0 : 1);
