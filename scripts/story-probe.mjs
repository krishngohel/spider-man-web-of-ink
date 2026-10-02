// Quick look at one story step: boots ?at=<step>, waits, screenshots, prints the story state.
//   node scripts/story-probe.mjs <step id> [out.png] [wait ms] [url]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const id = process.argv[2] ?? 'prologue.open';
const out = process.argv[3] ?? null;
const wait = Number(process.argv[4] ?? 2500);
const url = process.argv[5] ?? 'http://localhost:5310/';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' ')));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(`${url}?at=${id}`);
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await sleep(wait);
console.log(JSON.stringify(await p.evaluate(() => ({ mode: window.__game.mode, story: window.__game.story() }))));
if (out) await p.screenshot({ path: out });
console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no console errors');
await b.close();
