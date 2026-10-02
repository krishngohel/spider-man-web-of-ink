// Combat pilot with real inputs: a street gang on Midtown asphalt, the pilot aims at the nearest
// enemy, clicks to attack and dodges (C) when an attack winds up close. It must win without going
// down. Usage: node scripts/combat-check.mjs [url] [film.png]  (a film path saves a contact sheet)
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const film = process.argv[3] ?? null;
const frames = [];

const url = process.argv[2] ?? 'http://localhost:5310/';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.mouse.click(640, 360); // grabs the pointer
await sleep(300);
await p.evaluate(() => {
  const g = window.__game;
  g.setSetting('crimes', false);
  g.teleport(0, 0.9, -200, 0, 0, 0, 'ground', 0);
  g.spawnGang(0, -188, { mix: ['brawler', 'brawler', 'shield', 'gunner'], alert: true });
});
const t0 = Date.now();
let dodges = 0, attacks = 0, minHp = 100, result = 'timeout';
while (Date.now() - t0 < 60000) {
  const s = await p.evaluate(() => window.__game.combatState());
  minHp = Math.min(minHp, s.hp);
  const h = await p.evaluate(() => window.__game.hero());
  const live = s.enemies.filter((e) => !['out', 'webbed', 'pinned'].includes(e.state));
  if (!live.length) { result = 'won'; break; }
  if (s.hp <= 0) { result = 'lost'; break; }
  const near = live.reduce((a, e) => (Math.hypot(e.x - h.p.x, e.z - h.p.z) < Math.hypot(a.x - h.p.x, a.z - h.p.z) ? e : a));
  const yaw = Math.atan2(near.x - h.p.x, near.z - h.p.z);
  await p.evaluate((y) => window.__game.setLook(y, 0.12), yaw);
  const threat = live.some((e) => e.state === 'windup' && Math.hypot(e.x - h.p.x, e.z - h.p.z) < 3.4);
  if (threat && Math.random() < 0.7) { await p.keyboard.press('KeyC'); dodges++; await sleep(140); continue; }
  const d = Math.hypot(near.x - h.p.x, near.z - h.p.z);
  if (near.arch === 'shield' && d < 3 && Math.random() < 0.3) { await p.keyboard.press('Space'); await sleep(120); }
  await p.mouse.down(); await sleep(40); await p.mouse.up();
  attacks++;
  if (film && frames.length < 24 && attacks % 2 === 0) frames.push(await p.screenshot());
  await sleep(110);
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);
await b.close();
if (film && frames.length) {
  const tiles = await Promise.all(frames.map((f) => sharp(f).resize(480, 270).toBuffer()));
  await sharp({ create: { width: 1920, height: 270 * Math.ceil(tiles.length / 4), channels: 3, background: '#000' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 4) * 480, top: Math.floor(i / 4) * 270 }))).png().toFile(film);
}
const ok = result === 'won' && errors.length === 0;
console.log(`${ok ? 'PASS' : 'FAIL'}  combat pilot beats a four-man gang  ${result} in ${secs} s, ${attacks} attacks, ${dodges} dodges, lowest health ${Math.round(minHp)}`);
console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no console errors');
process.exit(ok ? 0 : 1);
