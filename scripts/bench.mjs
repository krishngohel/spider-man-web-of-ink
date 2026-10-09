// Runs the in-game ?bench=1 benchmark headless (muted) and prints its table. UNCAPPED=1 turns vsync
// and the frame-rate limit off, so the rows show how much each piece costs, not just 60 fps.
//   node scripts/bench.mjs [url]
import { chromium } from 'playwright-core';
import { launchArgs } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5300/';
const extra = process.env.UNCAPPED ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [];
const b = await chromium.launch({ args: launchArgs(extra), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(new URL('?bench=1', url).href);
await p.waitForFunction(() => window.__bench, null, { timeout: 240000, polling: 1000 });
const rows = await p.evaluate(() => window.__bench);
console.log(await p.evaluate(() => document.querySelector('.perf-bench')?.textContent ?? ''));
await b.close();
if (errors.length) console.log('errors:\n' + errors.slice(0, 5).join('\n'));
process.exit(Array.isArray(rows) && !errors.length ? 0 : 1);
