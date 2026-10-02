// Real-key swing checks on a frozen build. Usage: node scripts/swing-check.mjs [url]
// Without a url it builds to a temp folder and serves it on :5302. Every measurement is taken in
// the hero's own frame (Gotham lesson: camera-frame numbers once hid mirrored steering).
import { chromium } from 'playwright-core';
import { execSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchArgs, sleep } from './lib.mjs';

let url = process.argv[2];
let server = null;
if (!url) {
  const out = path.join(tmpdir(), 'web-of-ink-dist');
  execSync(`npx vite build --outDir "${out}" --emptyOutDir`, { stdio: 'ignore' });
  server = spawn('npx', ['vite', 'preview', '--outDir', out, '--port', '5302', '--strictPort'], { shell: true, stdio: 'ignore' });
  url = 'http://localhost:5302/';
  await sleep(2500);
}

const browser = await chromium.launch({ args: launchArgs(), headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url + (url.includes('?') ? '&' : '?') + 'at=swing');
await page.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await page.mouse.click(640, 360); // the first click only grabs the pointer
await sleep(300);

const H = () => page.evaluate(() => window.__game.hero());
const G = 19.62;
const energy = (h) => 0.5 * h.speed ** 2 + G * h.p.y;
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };
const teleport = (x, y, z, vx, vy, vz, st = 'air', yaw = 0) => page.evaluate(([a, b, c, d, e, f, s, w]) => { window.__game.teleport(a, b, c, d, e, f, s, w); window.__game.setLook(w, 0.15); }, [x, y, z, vx, vy, vz, st, yaw]);
async function until(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const h = await H(); if (fn(h)) return { h, t: Date.now() - t0 }; await sleep(8); }
  return null;
}
async function releaseAll() { for (const k of ['Shift', 'Space', 'KeyD', 'KeyA', 'KeyW', 'KeyQ', 'KeyC']) await page.keyboard.up(k); }

// A. The web sticks fast.
await teleport(0, 50, -330, 0, 0, 22);
await page.keyboard.down('Shift');
const att = await until((h) => h.rope.active, 1500);
check('web attaches within 250 ms of Shift', !!att && att.t < 250, att ? `${att.t} ms` : 'never attached');
await releaseAll();

// B. Steering: holding D during a swing moves the hero to its own right.
async function lateral(key) {
  await teleport(0, 50, -330, 0, 0, 22);
  const h0 = await H();
  const fx = h0.v.x / Math.hypot(h0.v.x, h0.v.z), fz = h0.v.z / Math.hypot(h0.v.x, h0.v.z);
  const rx = -fz, rz = fx; // right of heading (y up, right-handed)
  await page.keyboard.down('Shift');
  if (key) await page.keyboard.down(key);
  await sleep(1100);
  const h1 = await H();
  await releaseAll();
  return (h1.p.x - h0.p.x) * rx + (h1.p.z - h0.p.z) * rz;
}
const none = await lateral(null), right = await lateral('KeyD'), left = await lateral('KeyA');
check('D steers right, A steers left (hero frame)', right > none + 1 && left < none - 1, `right ${right.toFixed(1)} m, none ${none.toFixed(1)} m, left ${left.toFixed(1)} m`);

// C. Reeling in pumps energy into the swing (the winch does work on the line).
async function swingEnergy(reel) {
  await teleport(0, 50, -330, 0, 0, 22);
  await page.keyboard.down('Shift');
  const t0 = Date.now();
  let space = false;
  while (Date.now() - t0 < 1300) {
    const h = await H();
    const want = reel && h.state === 'swing';
    if (want !== space) { space = want; if (space) await page.keyboard.down('Space'); else await page.keyboard.up('Space'); }
    await sleep(8);
  }
  const h = await H();
  await releaseAll();
  return energy(h);
}
const eNo = await swingEnergy(false), eReel = await swingEnergy(true);
check('reeling in adds energy', eReel > eNo + 30, `with reel ${eReel.toFixed(0)} J/kg, without ${eNo.toFixed(0)} J/kg`);

// D. Autopilot down the avenue: swing, release past the bottom (or before the swing carries us
// into a wall), repeat. No ground touches allowed.
await teleport(0, 45, -380, 0, 0, 24);
await page.keyboard.down('KeyW');
const start = await H();
const t0 = Date.now();
let touched = false, maxSpeed = 0, holding = false, releasedAt = 0, sawDown = false, heldAt = 0, webs = 0, walls = 0, pumping = false, minY = 99;
while (Date.now() - t0 < 30000) {
  const h = await H();
  maxSpeed = Math.max(maxSpeed, h.speed);
  minY = Math.min(minY, h.p.y);
  if (h.state === 'ground' && h.p.y < 1.5) { touched = true; break; }
  if (h.p.z - start.p.z > 600) break;
  if (h.state === 'wall') {
    // Kicked into a wall: push off and carry on (a player would too).
    walls++;
    if (holding) { await page.keyboard.up('Shift'); holding = false; }
    if (pumping) { await page.keyboard.up('Space'); pumping = false; }
    await page.keyboard.press('Space');
    releasedAt = Date.now();
    await sleep(120);
    continue;
  }
  const out = Math.sign(h.p.x) * h.v.x; // speed away from the avenue's centre line
  // Pump: reel in through the bottom of each arc, like a player would.
  const pump = holding && h.state === 'swing' && Math.abs(h.v.y) < 9;
  if (pump !== pumping) { pumping = pump; if (pump) await page.keyboard.down('Space'); else await page.keyboard.up('Space'); }
  if (!holding && Date.now() - releasedAt > 200 && (h.v.y < -1 || h.p.y < 25)) { await page.keyboard.down('Shift'); holding = true; sawDown = false; heldAt = Date.now(); webs++; }
  if (holding && h.rope.active && h.v.y < -1) sawDown = true;
  const pastBottom = sawDown && h.v.y > 2;
  const nearWall = Math.abs(h.p.x) > 7 && out > 4;
  if (holding && h.rope.active && (pastBottom || nearWall || Date.now() - heldAt > 2600)) { await page.keyboard.up('Shift'); holding = false; releasedAt = Date.now(); }
  await sleep(8);
}
const end = await H();
await releaseAll();
const dist = end.p.z - start.p.z, secs = (Date.now() - t0) / 1000;
check('autopilot covers 600 m without touching the street', !touched && dist >= 600, `${dist.toFixed(0)} m in ${secs.toFixed(1)} s, avg ${(dist / secs * 3.6).toFixed(0)} km/h, top ${(maxSpeed * 3.6).toFixed(0)} km/h, ${webs} webs, ${walls} wall kicks, lowest ${minY.toFixed(1)} m${touched ? ', touched the ground' : ''}`);

// E. Wall stick and wall run.
const tower = await page.evaluate(() => {
  const c = window.__game.city;
  const b = c.boxes.find((x) => x.kind === 'building' && x.district === 'midtown' && x.max[1] > 100 && x.min[1] === 0 && x.min[0] > 15 && x.min[0] < 21);
  return b && { x0: b.min[0], z: (b.min[2] + b.max[2]) / 2 };
});
if (tower) {
  await teleport(tower.x0 - 6, 30, tower.z, 15, 0, 0, 'air', Math.PI / 2);
  const stuck = await until((h) => h.state === 'wall', 1500);
  check('flying into a wall sticks to it', !!stuck, stuck ? `stuck at x ${stuck.h.p.x.toFixed(2)}` : 'never stuck');
  if (stuck) {
    const y0 = stuck.h.p.y;
    await page.keyboard.down('Shift');
    await sleep(1500);
    const h = await H();
    await releaseAll();
    check('holding swing runs up the wall', h.p.y > y0 + 8, `climbed ${(h.p.y - y0).toFixed(1)} m`);
  }
} else check('found a tower for the wall test', false, '');

// F. Zip: from a roof, look at a nearby facade and press Q.
await page.evaluate(() => { const s = window.__game.spawn; window.__game.teleport(s.x, s.y, s.z, 0, 0, 0, 'ground'); });
const best = await page.evaluate(() => {
  // Aim at the nearest taller building's facade from the spawn roof.
  const g = window.__game, s = g.spawn;
  let pick = null;
  for (const b of g.city.boxes) {
    if (b.kind !== 'building' || b.max[1] < s.y + 15) continue;
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const d = Math.hypot(cx - s.x, cz - s.z);
    if (d < 25 || d > 70) continue;
    if (!pick || d < pick.d) pick = { d, cx, cz };
  }
  return pick;
});
if (best) {
  const s = await page.evaluate(() => window.__game.spawn);
  const yaw = Math.atan2(best.cx - s.x, best.cz - s.z);
  await page.evaluate(([y]) => window.__game.setLook(y, -0.15), [yaw]);
  await sleep(150);
  await page.keyboard.press('KeyQ');
  const z = await until((h) => h.state === 'wall' || (h.state === 'ground' && h.p.y > s.y + 5), 3000);
  check('zip reaches a facade or roof', !!z, z ? `${z.h.state} after ${z.t} ms` : 'no arrival');
  if (z && z.h.state === 'wall') {
    await page.keyboard.press('Space');
    await sleep(80);
    const h = await H();
    check('point launch off the zip perch', h.speed > 12, `${h.speed.toFixed(1)} m/s`);
  }
} else check('found a zip target', false, '');

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
if (server) { server.kill(); try { execSync('npx kill-port 5302', { stdio: 'ignore' }); } catch { /* best effort */ } }
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
