// What E (the yank) does in a street fight: aims at each enemy in turn (and at nothing), presses E,
// and records where the hero and the target go. A yank should pull the thug in, not move the hero.
//   node scripts/yank-probe.mjs [url]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.mouse.click(480, 270);
await sleep(300);
const ev = (f, a) => p.evaluate(f, a);
const H = () => ev(() => { const h = window.__game.hero(); return { x: h.p.x, y: h.p.y, z: h.p.z, s: h.state }; });
let bad = 0;
for (const [mix, d] of [[['brawler'], 8], [['brawler'], 15], [['brute'], 8], [['gunner'], 12], [['brawler'], 24], [['shield'], 8]]) {
  await ev(() => { window.__game.combat().clear(); });
  await ev(() => window.__game.teleport(0, 0.9, -200, 0, 0, 0, 'ground', 0));
  await sleep(400);
  await ev(([m, dd]) => window.__game.spawnGang(0, -200 + dd, { mix: m, alert: false }), [mix, d]);
  await sleep(700);
  const c0 = await ev(() => window.__game.combatState().enemies.filter((e) => e.state !== 'out'));
  const e = c0[0];
  if (!e) { console.log(mix[0], d, 'no enemy'); continue; }
  await ev(([x, y, z]) => window.__game.aimAt(x, y + 1, z), [e.x, e.y, e.z]);
  await sleep(80);
  const h0 = await H();
  await p.keyboard.press('KeyE');
  await sleep(900);
  const h1 = await H();
  const e1 = (await ev(() => window.__game.combatState().enemies)).find((q) => q.id === e.id) ?? e;
  const heroMoved = Math.hypot(h1.x - h0.x, h1.y - h0.y, h1.z - h0.z);
  const enemyMoved = Math.hypot(e1.x - e.x, e1.z - e.z);
  const ev2 = (await ev(() => window.__game.events?.() ?? [])).slice(-6).join(',');
  const flung = heroMoved > 4;
  if (flung) bad++;
  console.log(`${flung ? 'FLING' : 'ok   '}  ${mix[0]} at ${d} m: hero moved ${heroMoved.toFixed(1)} m (${h0.s}>${h1.s}, up ${(h1.y - h0.y).toFixed(1)}), enemy moved ${enemyMoved.toFixed(1)} m  [${ev2}]`);
}
// E at the sky with no one near.
await ev(() => window.__game.combat().clear());
await ev(() => window.__game.teleport(0, 0.9, -200, 0, 0, 0, 'ground', 0));
await sleep(400);
await ev(() => window.__game.setLook(0, 0.5));
const s0 = await H();
await p.keyboard.press('KeyE');
await sleep(900);
const s1 = await H();
console.log(`E with no enemy: hero moved ${Math.hypot(s1.x - s0.x, s1.y - s0.y, s1.z - s0.z).toFixed(1)} m (${s0.s}>${s1.s})`);
await b.close();
console.log(errors.length ? errors.join('\n') : 'no page errors');
console.log(bad ? `${bad} FLINGS` : 'NO FLINGS');
process.exit(bad || errors.length ? 1 : 0);
