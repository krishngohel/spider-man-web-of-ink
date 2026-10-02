// Screenshots of each movement state with real keys, for a visual check of poses and strands.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5300/';
const out = process.argv[3] ?? 'shots/poses';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
const tp = (a) => p.evaluate((x) => { window.__game.teleport(...x); window.__game.setLook(x[7], 0.12); }, a);
const shot = async (name) => { await p.screenshot({ path: `${out}/${name}.png` }); console.log(name, JSON.stringify(await p.evaluate(() => { const h = window.__game.hero(); return { s: h.state, v: +h.speed.toFixed(1) }; }))); };
await tp([0, 50, -330, 0, 0, 22, 'air', 0]); await p.keyboard.down('Shift'); await sleep(900); await shot('swing-early'); await sleep(700); await shot('swing-bottom'); await p.keyboard.up('Shift');
await tp([0, 80, -330, 0, 0, 22, 'air', 0]); await sleep(250); await p.keyboard.down('Space'); await sleep(50); await p.keyboard.up('Space'); await p.keyboard.down('Space'); await sleep(900); await shot('glide'); await p.keyboard.up('Space');
await tp([0, 120, -330, 0, -5, 10, 'air', 0]); await p.keyboard.down('KeyC'); await sleep(1200); await shot('dive'); await p.keyboard.up('KeyC');
await tp([12, 30, -260, 15, 0, 0, 'air', Math.PI / 2]); await sleep(700); await shot('wall-idle'); await p.keyboard.down('KeyW'); await sleep(600); await shot('wall-crawl'); await p.keyboard.up('KeyW'); await p.keyboard.down('Shift'); await sleep(500); await shot('wall-run'); await p.keyboard.up('Shift');
await tp([0, 0.9, -330, 0, 0, 0, 'ground', 0]); await p.keyboard.down('KeyW'); await sleep(900); await shot('run'); await p.keyboard.down('Shift'); await sleep(700); await shot('parkour'); await p.keyboard.up('Shift'); await p.keyboard.up('KeyW');
await b.close();
