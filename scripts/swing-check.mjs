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
// Stops the preview server (and its child processes) however the script ends.
function stopServer() {
  if (!server) return;
  try { execSync(process.platform === 'win32' ? `taskkill /pid ${server.pid} /T /F` : `kill ${server.pid}`, { stdio: 'ignore' }); } catch { /* already gone */ }
  server = null;
}
process.on('exit', stopServer);
process.on('uncaughtException', (e) => { console.error(e); stopServer(); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error(e); stopServer(); process.exit(1); });
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
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };
const teleport = (x, y, z, vx, vy, vz, st = 'air', yaw = 0) => page.evaluate(([a, b, c, d, e, f, s, w]) => { window.__game.teleport(a, b, c, d, e, f, s, w); window.__game.setLook(w, 0.15); }, [x, y, z, vx, vy, vz, st, yaw]);
async function until(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const h = await H(); if (fn(h)) return { h, t: Date.now() - t0 }; await sleep(8); }
  return null;
}
async function releaseAll() { for (const k of ['Shift', 'Space', 'KeyD', 'KeyA', 'KeyW', 'KeyQ', 'KeyC']) await page.keyboard.up(k); }

// Aims the crosshair where a skilled player would web next (heading dx, dz), then holds Shift.
async function aimAndHold(dx = 0, dz = 1) {
  const t = await page.evaluate(([x, z]) => window.__game.suggest(x, z), [dx, dz]);
  if (!t) return null;
  const hit = await page.evaluate(([x, y, z]) => window.__game.aimAt(x, y, z), [t.x, t.y, t.z]);
  await page.keyboard.down('Shift');
  return hit;
}

// A. An aimed web sticks fast, exactly where the crosshair was.
await teleport(0, 50, -330, 0, 0, 22);
const aimed = await aimAndHold();
const att = await until((h) => h.swing.active, 1500);
check('aimed web sticks within 300 ms', !!aimed && !!att && att.t < 300, att ? `${att.t} ms` : 'never attached');
await releaseAll();

// B. A miss is a miss: out over the water past the city's edge nothing is in web range, so a
// press fires nothing (and the hero falls).
await teleport(700, 40, 0, 0, 0, 10);
await page.evaluate(() => window.__game.setLook(0, -0.6));
await page.keyboard.down('Shift');
const miss = await until((h) => h.swing.active, 600);
await releaseAll();
check('a press with nothing in range misses', !miss, miss ? 'a web attached' : 'no web');

// C. A swing carries the hero forward and lets go cleanly on the rise.
await teleport(0, 50, -330, 0, 0, 22);
await aimAndHold();
await until((h) => h.swing.active, 1500);
const c0 = await H();
const rel = await until((h) => !h.swing.active || (h.swing.angle > 25 && h.v.y > 0), 3000);
await releaseAll();
await sleep(50);
const after = await H();
check('a swing carries forward and releases', !!rel && after.state !== 'swing' && after.p.z - c0.p.z > 20 && after.speed > 12, `${(after.p.z - c0.p.z).toFixed(0)} m forward, ${(after.speed * 3.6).toFixed(0)} km/h, ${after.state}`);

// D. Swing-jump: Space mid-swing leaps off with a big boost up.
await teleport(0, 50, -330, 0, 0, 25);
await aimAndHold();
await until((h) => h.swing.active, 1500);
await sleep(300);
const sj0 = await H();
await page.keyboard.press('Space');
await sleep(60);
const sj1 = await H();
await releaseAll();
check('swing-jump leaps off the web', sj0.swing.active && !sj1.swing.active && sj1.v.y > sj0.v.y + 4, `vy ${sj0.v.y.toFixed(1)} -> ${sj1.v.y.toFixed(1)}`);

// E2. A skilled run down the avenue: aim each web, hold, let go on the rise, steer back toward
// the centre line. Covers the length of Midtown without touching the street.
await teleport(0, 45, -400, 0, 0, 18);
await page.keyboard.down('KeyW');
const start = await H();
const t0 = Date.now();
let touched = false, walls = 0, wasWall = false, steering = null, maxSpeed = 0, webs = 0, sinceRel = 999, lastT = Date.now(), holding = false;
while (Date.now() - t0 < 30000) {
  const h = await H();
  const now = Date.now(); sinceRel += now - lastT; lastT = now;
  maxSpeed = Math.max(maxSpeed, h.speed);
  if (h.state === 'ground' && h.p.y < 1.5) { touched = true; break; }
  if (h.p.z - start.p.z > 480 || h.p.z > 110) break;
  if (h.state === 'wall' && !wasWall) { walls++; await page.keyboard.up('Shift'); holding = false; await page.keyboard.press('Space'); }
  wasWall = h.state === 'wall';
  if (holding && h.state === 'swing' && ((h.swing.angle > 25 && h.v.y > 0) || (Math.abs(h.p.x) > 8 && Math.sign(h.p.x) * h.v.x > 5))) { await page.keyboard.up('Shift'); holding = false; sinceRel = 0; }
  else if (!holding && h.state === 'air' && sinceRel > 150 && (h.v.y < 2 || h.p.y < 20)) {
    const steerX = Math.max(-0.8, Math.min(0.8, -h.p.x * 0.05 - h.v.x * 0.04));
    if (await aimAndHold(steerX, 1)) { holding = true; webs++; }
  }
  const steer = -h.p.x * 0.06 - h.v.x * 0.05;
  const wantKey = steer > 0.25 ? 'KeyA' : steer < -0.25 ? 'KeyD' : null;
  if (wantKey !== steering) { if (steering) await page.keyboard.up(steering); if (wantKey) await page.keyboard.down(wantKey); steering = wantKey; }
  await sleep(10);
}
const end = await H();
await releaseAll();
const dist = end.p.z - start.p.z, secs = (Date.now() - t0) / 1000;
check('a skilled run covers Midtown (480 m) without touching the street', !touched && dist >= 480, `${dist.toFixed(0)} m in ${secs.toFixed(1)} s, avg ${(dist / secs * 3.6).toFixed(0)} km/h, top ${(maxSpeed * 3.6).toFixed(0)} km/h, ${webs} webs, ${walls} wall contacts${touched ? ', touched the ground' : ''}`);

// E. Wall stick and wall run.
const tower = await page.evaluate(() => {
  const c = window.__game.city;
  const b = c.boxes.find((x) => x.kind === 'building' && x.district === 'midtown' && x.max[1] > 100 && x.min[1] === 0 && x.min[0] > 15 && x.min[0] < 21);
  return b && { x0: b.min[0], z: (b.min[2] + b.max[2]) / 2 };
});
if (tower) {
  await teleport(tower.x0 - 8, 30, tower.z, 22, 0, 8, 'air', Math.PI / 2);
  const stuck = await until((h) => h.state === 'wall', 1500);
  check('flying into a wall at speed becomes a wall run that keeps speed', !!stuck && stuck.h.speed > 12, stuck ? `speed on the wall ${stuck.h.speed.toFixed(1)} m/s` : 'never reached the wall');
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
stopServer();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
