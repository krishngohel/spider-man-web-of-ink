// Story walk (spec 19.4): every story beat, one after another in one page. Panels are saved as the
// in-engine images the comic shows; every other step gets a screenshot a moment after it starts.
// A contact sheet goes to <out>/sheet-N.png for review. Fails on page errors or a step that
// cannot start.
//   node scripts/story-walk.mjs [outDir] [url] [first step id] [last step id]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launchArgs, sleep } from './lib.mjs';
import { STEPS } from '../src/story/steps.js';

const out = process.argv[2] ?? 'story-walk';
const url = process.argv[3] ?? 'http://localhost:5310/';
const from = process.argv[4] ?? STEPS[0].id, to = process.argv[5] ?? STEPS[STEPS.length - 1].id;
mkdirSync(out, { recursive: true });
const list = STEPS.slice(STEPS.findIndex((s) => s.id === from), STEPS.findIndex((s) => s.id === to) + 1).filter((s) => !process.env.ONLY || process.env.ONLY.split(',').includes(s.type));

const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });

const tiles = [];
let bad = 0;
for (const s of list) {
  await p.evaluate((id) => window.__game.storyAt(id), s.id);
  if (s.type === 'panels') {
    await p.waitForFunction(() => window.__game.story().phase === 'read', null, { timeout: 15000 }).catch(() => {});
    await sleep(400);
    const imgs = await p.evaluate(() => [...document.querySelectorAll('.cpanel img')].map((i) => i.src));
    // Every page's panels: read through the comic, collecting each page's images.
    const all = [...imgs];
    for (let k = 0; k < 12; k++) {
      await p.keyboard.press('Space');
      await sleep(120);
      const now = await p.evaluate(() => [...document.querySelectorAll('.cpanel img')].map((i) => i.src));
      for (const src of now) if (!all.includes(src)) all.push(src);
      if (!(await p.evaluate(() => window.__game.story().blocking))) break;
    }
    const shotPage = path.join(out, `${s.id}-page.png`);
    if (!all.length) { bad++; console.log(`FAIL  ${s.id}: no panels drawn`); }
    all.forEach((src, i) => {
      const f = path.join(out, `${s.id}-${i + 1}.jpg`);
      writeFileSync(f, Buffer.from(src.split(',')[1], 'base64'));
      tiles.push({ f, label: `${s.id} ${i + 1}` });
    });
    void shotPage;
  } else {
    await sleep(s.type === 'title' ? 900 : 1600);
    const f = path.join(out, `${s.id}.png`);
    await p.screenshot({ path: f });
    tiles.push({ f, label: s.id });
  }
  const st = await p.evaluate(() => window.__game.story());
  console.log(`${st.step === s.id || st.done.includes(s.id) ? 'ok   ' : 'MOVED'} ${s.id} (${s.type}) phase ${st.phase}`);
}

// Contact sheets: 4 across, 4 down, labelled.
const W = 400, H = 225;
for (let sh = 0; sh * 16 < tiles.length; sh++) {
  const part = tiles.slice(sh * 16, sh * 16 + 16);
  const comp = await Promise.all(part.map(async (t, i) => {
    const label = Buffer.from(`<svg width="${W}" height="22"><rect width="${W}" height="22" fill="black" opacity="0.7"/><text x="6" y="16" font-size="14" font-family="sans-serif" fill="white">${t.label}</text></svg>`);
    const img = await sharp(t.f).resize(W, H, { fit: 'cover' }).composite([{ input: label, top: 0, left: 0 }]).toBuffer();
    return { input: img, left: (i % 4) * W, top: Math.floor(i / 4) * H };
  }));
  await sharp({ create: { width: W * 4, height: H * Math.ceil(part.length / 4), channels: 3, background: '#000' } }).composite(comp).png().toFile(path.join(out, `sheet-${sh + 1}.png`));
}
await b.close();
console.log(errors.length ? errors.slice(0, 8).join('\n') : 'no console errors');
console.log(bad || errors.length ? 'FAILED' : `ALL PASS (${list.length} steps, ${tiles.length} images)`);
process.exit(bad || errors.length ? 1 : 0);
