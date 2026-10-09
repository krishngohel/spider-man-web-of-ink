// Card art for the suit menu: every suit worn by the hero, rendered in game (comic shading, ink and
// all) from the front three-quarter view, saved as public/assets/suits/thumbs/<id>.webp.
//   node scripts/suit-thumbs.mjs [url] [ids comma-separated]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs';
import { launchArgs, sleep } from './lib.mjs';
import { SUITS } from '../src/progress/progression.js';
const url = process.argv[2] ?? 'http://localhost:5310/';
const ids = process.argv[3]?.split(',') ?? SUITS.map((s) => s.id);
const dir = 'public/assets/suits/thumbs';
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 360, height: 480 } });
await p.goto(url + '?at=swing&suits');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.evaluate(() => {
  for (const s of ['.lockhint', '.tip', '.hud', '#hud', '.objective', '.caption', '.fps']) document.querySelectorAll(s).forEach((e) => { e.style.display = 'none'; });
  const g = window.__game, s = g.spawn;
  g.teleport(s.x, s.y, s.z, 0, 0, 0, 'ground', 0);
  g.setSetting?.('hour', 17.4);
});
for (const id of ids) {
  await p.evaluate((i) => { const g = window.__game; g.save().progress.suit = i; g.progress().apply(); g.setCamOverride({ at: [1.3, 0.25, 3.7], fov: 30, lookY: 0.12 }); }, id);
  await sleep(1400); // the suit file loads and the idle settles
  await p.evaluate(() => document.querySelectorAll('.hud, #hud, .tip, .caption, .alert, .objective, .fps').forEach((e) => { e.style.display = 'none'; }));
  const shot = await p.screenshot();
  await sharp(shot).resize(150, 200).webp({ quality: 78 }).toFile(`${dir}/${id}.webp`);
  console.log(id);
}
await b.close();
