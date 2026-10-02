// Smoothness probe: plays the skilled swing run with real keys, records what the player sees every
// frame (camera position and aim, body orientation, fov), and reports the jerkiest moments:
// sudden changes in the camera's turn rate, camera position jerk, and body rotation snaps.
//   node scripts/smooth-probe.mjs [url] [seconds]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5310/';
const seconds = +(process.argv[3] ?? 20);
const browser = await chromium.launch({ args: launchArgs(), headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url + '?at=swing');
await page.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await page.mouse.click(640, 360);
await sleep(300);
const H = () => page.evaluate(() => window.__game.hero());
async function aimAndHold(dx, dz) {
  const t = await page.evaluate(([x, z]) => window.__game.suggest(x, z), [dx, dz]);
  if (!t) return false;
  await page.evaluate(([x, y, z]) => window.__game.aimAt(x, y, z), [t.x, t.y, t.z]);
  await page.keyboard.down('Shift');
  return true;
}
await page.evaluate(() => { window.__game.teleport(0, 45, -400, 0, 0, 18, 'air', 0); window.__game.setLook(0, 0.15); });
await page.keyboard.down('KeyW');
await page.evaluate(() => window.__game.startTrace());
const t0 = Date.now();
let holding = false, sinceRel = 999, lastT = Date.now();
while (Date.now() - t0 < seconds * 1000) {
  const h = await H();
  const now = Date.now(); sinceRel += now - lastT; lastT = now;
  if (h.p.z > 110) break;
  if (h.state === 'wall') { await page.keyboard.up('Shift'); holding = false; await page.keyboard.press('Space'); }
  if (holding && h.state === 'swing' && ((h.swing.angle > 25 && h.v.y > 0) || (Math.abs(h.p.x) > 8 && Math.sign(h.p.x) * h.v.x > 5))) { await page.keyboard.up('Shift'); holding = false; sinceRel = 0; }
  else if (!holding && h.state === 'air' && sinceRel > 150 && (h.v.y < 2 || h.p.y < 20)) {
    const steerX = Math.max(-0.8, Math.min(0.8, -h.p.x * 0.05 - h.v.x * 0.04));
    if (await aimAndHold(steerX, 1)) holding = true;
  }
  await sleep(10);
}
const tr = await page.evaluate(() => window.__game.stopTrace());
await page.keyboard.up('Shift'); await page.keyboard.up('KeyW');
await browser.close();

// Analysis. Rates are per second so uneven frames do not read as jerk by themselves.
const ang = (ax, ay, az, bx, by, bz) => Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz)));
const qang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[7] * b[7] + a[8] * b[8] + a[9] * b[9] + a[10] * b[10])));
const rows = [];
for (let i = 2; i < tr.length; i++) {
  if (tr[i][0] < 0 || tr[i - 1][0] < 0 || tr[i - 2][0] < 0) continue;
  const a = tr[i - 2], b = tr[i - 1], c = tr[i];
  const dt1 = b[0] / 1000, dt2 = c[0] / 1000;
  const w1 = ang(a[4], a[5], a[6], b[4], b[5], b[6]) / dt1, w2 = ang(b[4], b[5], b[6], c[4], c[5], c[6]) / dt2;
  const v1 = [(b[1] - a[1]) / dt1, (b[2] - a[2]) / dt1, (b[3] - a[3]) / dt1];
  const v2 = [(c[1] - b[1]) / dt2, (c[2] - b[2]) / dt2, (c[3] - b[3]) / dt2];
  const camAcc = Math.hypot(v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]) / dt2;
  const bodyW = qang(b, c) / dt2;
  const bodyW1 = qang(a, b) / dt1;
  rows.push({ i, t: tr.slice(0, i).reduce((s, r) => s + Math.abs(r[0]), 0) / 1000, dt: c[0], camTurnJerk: Math.abs(w2 - w1) / dt2, camAcc, bodyJerk: Math.abs(bodyW - bodyW1) / dt2, bodyW, fovStep: Math.abs(c[14] - b[14]) / dt2, state: `${b[15]}>${c[15]}` });
}
const pct = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const report = (key, unit) => {
  const vals = rows.map((r) => r[key]);
  console.log(`${key.padEnd(12)} p50 ${pct(vals, 0.5).toFixed(1)} p95 ${pct(vals, 0.95).toFixed(1)} p99 ${pct(vals, 0.99).toFixed(1)} max ${Math.max(...vals).toFixed(1)} ${unit}`);
  const top = [...rows].sort((x, y) => y[key] - x[key]).slice(0, 6);
  for (const r of top) console.log(`   t ${r.t.toFixed(2)}s  ${r[key].toFixed(1)}  dt ${r.dt.toFixed(1)}ms  ${r.state}`);
};
console.log(`${tr.length} frames, frame ms p50 ${pct(tr.map((r) => Math.abs(r[0])), 0.5).toFixed(1)} p99 ${pct(tr.map((r) => Math.abs(r[0])), 0.99).toFixed(1)}`);
report('camTurnJerk', 'rad/s^2');
report('camAcc', 'm/s^2');
{
  // The frames around the worst camera jolt after the first second.
  const worst = [...rows].filter((r) => r.t > 1).sort((x, y) => y.camAcc - x.camAcc)[0];
  for (let k = worst.i - 3; k <= worst.i + 2; k++) { const r = tr[k]; console.log(`   [${k}] pos ${r[1].toFixed(2)},${r[2].toFixed(2)},${r[3].toFixed(2)} hero ${r[11].toFixed(2)},${r[12].toFixed(2)},${r[13].toFixed(2)} close ${r[16].toFixed(2)} ${r[15]}`); }
}
report('bodyJerk', 'rad/s^2');
report('fovStep', 'deg/s');
