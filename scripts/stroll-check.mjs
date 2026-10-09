// Stroll gate: plays every stroll step (Peter out of the suit) headless and muted. For each one:
// it starts, Peter can walk up to everyone he needs to talk to, the talk key starts their lines,
// the lines play through, and the step completes. Saves a look at each scene to <outDir>.
//   node scripts/stroll-check.mjs [outDir] [url] [step id filter]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { launchArgs, sleep } from './lib.mjs';
import { STEPS } from '../src/story/steps.js';

const out = process.argv[2] ?? 'stroll-check';
const url = process.argv[3] ?? 'http://localhost:5310/';
const only = process.argv[4] ?? '';
mkdirSync(out, { recursive: true });
const list = STEPS.filter((s) => s.type === 'stroll' && s.id.includes(only));

const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(url + '?at=swing&nocine=1');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await sleep(4000); // the mocap clips load after ready

let bad = 0;
for (const s of list) {
  await p.evaluate((id) => window.__game.storyAt(id), s.id);
  const ok = await p.waitForFunction(() => window.__game.story().phase === 'stroll', null, { timeout: 8000 }).then(() => true, () => false);
  if (!ok) { bad++; console.log(`FAIL  ${s.id}: never started`); continue; }
  const site = await p.evaluate(() => window.__game.story().site);
  const base = { x: site.x, y: site.y - 0.9, z: site.z };
  // A look at the scene from behind the spawn, toward its people.
  const sp = s.spawn ?? [0, 0, 6, 180];
  const cx = s.npcs.reduce((a, n) => a + n.p[0], 0) / s.npcs.length, cz = s.npcs.reduce((a, n) => a + n.p[2], 0) / s.npcs.length;
  await p.evaluate(([pos, look]) => window.__game.setCamOverride({ pos, look, fov: 55 }), [[base.x + sp[0] - (cx - sp[0]) * 0.35, base.y + 3.2, base.z + sp[2] - (cz - sp[2]) * 0.35 + 3], [base.x + cx, base.y + 1.2, base.z + cz]]);
  await sleep(900);
  await p.screenshot({ path: path.join(out, `${s.id}.png`) });
  await p.evaluate(() => window.__game.setCamOverride(null));
  // Talk to everyone the scene needs, nearest first along the way.
  for (const n of s.npcs.filter((q) => q.talk && (q.need ?? true))) {
    const yaw = ((n.yaw ?? 0) * Math.PI) / 180;
    const at = { x: base.x + n.p[0] + Math.sin(yaw) * 1.4, z: base.z + n.p[2] + Math.cos(yaw) * 1.4 };
    await p.evaluate(([x, y, z]) => window.__game.teleport(x, y, z, 0, 0, 0, 'ground', 0), [at.x, base.y + (n.p[1] ?? 0) + 0.95, at.z]);
    await sleep(350);
    const prompt = await p.evaluate(() => { const e = document.querySelector('.st-prompt, .sprompt, [class*=prompt]:not(.hidden)'); return !!e; });
    await p.keyboard.down('KeyE'); await sleep(60); await p.keyboard.up('KeyE');
    await sleep(300);
    const talking = await p.evaluate(() => window.__game.story().talking);
    if (!talking) { bad++; console.log(`FAIL  ${s.id}: no talk with ${n.who} (prompt ${prompt})`); continue; }
    for (let k = 0; k < 40 && (await p.evaluate(() => window.__game.story().talking)); k++) { await p.keyboard.press('Enter'); await sleep(140); await p.keyboard.press('Enter'); await sleep(140); }
  }
  const done = await p.waitForFunction((id) => window.__game.story().step !== id, s.id, { timeout: 6000 }).then(() => true, () => false);
  console.log(`${done ? 'PASS ' : 'FAIL '} ${s.id}`);
  if (!done) bad++;
}
console.log(errors.length ? `console errors:\n${errors.slice(0, 5).join('\n')}` : 'no console errors');
console.log(bad || errors.length ? 'FAILED' : 'ALL PASS');
await b.close();
process.exit(bad || errors.length ? 1 : 0);
