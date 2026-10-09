// Suits in motion (spec 2026-10-08 S4): each suit running, falling, swinging and punching, from a
// three-quarter camera, for checking fitted models for tears, stretching and floating parts.
//   node scripts/suit-motion.mjs [url] [out.png] [ids comma-separated]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const out = process.argv[3] ?? 'shots/suit-motion.png';
const ids = (process.argv[4] ?? 'amazing,scarlet,blackSuit,noir,2099,stealth,electric,punk,homemade,armor,ghost,shadow').split(',');
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 360, height: 480 } });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.mouse.click(180, 240);
await sleep(300);
const ev = (f, a) => p.evaluate(f, a);
await ev(() => { document.querySelector('.lockhint')?.remove(); document.querySelector('.tip')?.remove(); });
const spawn = await ev(() => window.__game.spawn);
const rows = [];
for (const id of ids) {
  await ev((i) => { const g = window.__game; g.save().progress.suit = i; g.progress().apply(); }, id);
  await ev(([s]) => window.__game.teleport(s.x, s.y, s.z, 0, 0, 0, 'ground', 0), [spawn]);
  await sleep(1500); // the suit file loads
  const frames = [];
  const cam = (at) => ev((a) => window.__game.setCamOverride({ at: a, fov: 40, lookY: 0.1 }), at);
  // Run.
  await cam([2.6, 0.6, 2.6]);
  await ev(() => window.__game.setLook(0, 0));
  await p.keyboard.down('KeyW'); await sleep(700); frames.push(await p.screenshot()); await sleep(180); frames.push(await p.screenshot()); await p.keyboard.up('KeyW');
  // Fall (high, then a few metres down).
  await ev(([s]) => window.__game.teleport(s.x, s.y + 40, s.z, 4, 0, 6, 'air', 0), [spawn]);
  await sleep(900); frames.push(await p.screenshot());
  // Swing: from high up, fire a swing web at the suggested anchor and film mid arc.
  await ev(([s]) => window.__game.teleport(s.x, s.y + 30, s.z, 0, 0, 14, 'air', 0), [spawn]);
  await sleep(150);
  const t = await ev(() => window.__game.suggest(0, 1));
  if (t) await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [t.x, t.y, t.z]);
  await p.keyboard.down('ShiftLeft'); await sleep(650); frames.push(await p.screenshot()); await sleep(300); frames.push(await p.screenshot()); await p.keyboard.up('ShiftLeft');
  // Punch (on the ground, nothing to hit: the string still plays).
  await ev(([s]) => window.__game.teleport(s.x, s.y, s.z, 0, 0, 0, 'ground', 0), [spawn]);
  await cam([2.2, 0.4, 2.0]);
  await sleep(500);
  for (let k = 0; k < 2; k++) { await p.mouse.down(); await sleep(40); await p.mouse.up(); await sleep(230); frames.push(await p.screenshot()); }
  rows.push(frames);
  console.log(id, frames.length);
}
await b.close();
const W = 180, H = 240, cols = Math.max(...rows.map((r) => r.length));
const comp = [];
for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) comp.push({ input: await sharp(rows[r][c]).resize(W, H).toBuffer(), left: c * W, top: r * H });
await sharp({ create: { width: W * cols, height: H * rows.length, channels: 3, background: '#000' } }).composite(comp).png().toFile(out);
console.log('wrote', out);
