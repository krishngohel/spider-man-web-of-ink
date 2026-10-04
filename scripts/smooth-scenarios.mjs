// Smoothness across the moments that matter: a swing run, ground moves (run, stop, turn, jump,
// land), walls (onto, up, off) and a short fight, played with real keys. Every frame records the
// camera, the body and the hands, feet and head in the body's own frame; the report lists the
// biggest jolts in each, labelled with the hero state and the clip or move playing, so pops can be
// traced to their transition.   node scripts/smooth-scenarios.mjs [url] [only: swing,ground,wall,fight]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5310/';
const only = process.argv[3]?.split(',') ?? ['swing', 'ground', 'wall', 'fight'];
const browser = await chromium.launch({ args: launchArgs(), headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url + '?at=swing');
await page.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await page.mouse.click(640, 360);
await sleep(300);
const ev = (f, a) => page.evaluate(f, a);
const H = () => ev(() => window.__game.hero());
const down = (k) => page.keyboard.down(k), up = (k) => page.keyboard.up(k);

const scenarios = {
  async swing() {
    await ev(() => { window.__game.teleport(0, 45, -400, 0, 0, 18, 'air', 0); window.__game.setLook(0, 0.15); });
    await down('KeyW');
    let holding = false, rel = 999, last = Date.now();
    const t0 = Date.now();
    while (Date.now() - t0 < 14000) {
      const h = await H(), now = Date.now(); rel += now - last; last = now;
      if (h.state === 'wall') { await up('ShiftLeft'); holding = false; await page.keyboard.press('Space'); }
      if (holding && h.state === 'swing' && h.swing.angle > 34 && h.v.y > 0) { await up('ShiftLeft'); holding = false; rel = 0; }
      else if (!holding && h.state === 'air' && rel > 150 && (h.v.y < 2 || h.p.y < 20)) { await down('ShiftLeft'); holding = true; }
      await sleep(10);
    }
    await up('ShiftLeft'); await up('KeyW');
  },
  async ground() {
    await ev(() => { const g = window.__game, s = g.spawn; g.teleport(s.x, s.y, s.z, 0, 0, 0, 'ground', 0); g.setLook(0, 0.15); });
    await sleep(400);
    await down('KeyW'); await sleep(1200); await up('KeyW'); await sleep(600);           // run, stop
    await down('KeyS'); await sleep(900); await up('KeyS'); await sleep(400);             // turn round and run back
    await down('KeyD'); await sleep(700); await down('KeyW'); await sleep(500); await up('KeyD'); await up('KeyW'); await sleep(400); // strafe into a diagonal
    await down('KeyW'); await down('ShiftLeft'); await sleep(1200);                       // parkour run
    await page.keyboard.press('Space'); await sleep(900);                                 // jump and land at speed
    await up('ShiftLeft'); await up('KeyW'); await sleep(800);
    await page.keyboard.press('Space'); await sleep(1000);                                // standing jump
  },
  async wall() {
    // A facade straight ahead: run at it holding swing (on, up), let go, jump off.
    const spot = await ev(() => window.__game.wallSpot(window.__game.spawn.x, window.__game.spawn.z, 80, 6));
    if (!spot) return;
    await ev(([x, z, nx, nz]) => { const g = window.__game; g.teleport(x, 1, z, 0, 0, 0, 'ground', 0); g.setLook(Math.atan2(-nx, -nz), 0.1); }, [spot.x, spot.z, spot.nx, spot.nz]);
    await sleep(500);
    await down('KeyW'); await down('ShiftLeft'); await sleep(2600);                       // onto the wall and up
    await down('KeyD'); await sleep(900); await up('KeyD');                                // across
    await up('ShiftLeft'); await sleep(300);
    await page.keyboard.press('Space'); await sleep(1600);                                // off
    await up('KeyW');
  },
  async fight() {
    await ev(() => { const g = window.__game; g.setSetting('crimes', false); g.teleport(0, 0.9, -200, 0, 0, 0, 'ground', 0); g.spawnGang(0, -192, { mix: ['brawler', 'brawler', 'brawler'], alert: true }); });
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {
      const s = await ev(() => window.__game.combatState()), h = await H();
      const live = s.enemies.filter((e) => !['out', 'webbed', 'pinned'].includes(e.state));
      if (!live.length) break;
      const n = live.reduce((a, e) => (Math.hypot(e.x - h.p.x, e.z - h.p.z) < Math.hypot(a.x - h.p.x, a.z - h.p.z) ? e : a));
      await ev((y) => window.__game.setLook(y, 0.12), Math.atan2(n.x - h.p.x, n.z - h.p.z));
      const due = live.some((e) => e.state === 'windup' && e.at - e.t < 0.2 && Math.hypot(e.x - h.p.x, e.z - h.p.z) < 3.6);
      if (due) { await page.keyboard.press('KeyC'); await sleep(140); continue; }
      await page.mouse.down(); await sleep(40); await page.mouse.up(); await sleep(120);
    }
  },
};

const ang = (ax, ay, az, bx, by, bz) => Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz)));
const qang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[7] * b[7] + a[8] * b[8] + a[9] * b[9] + a[10] * b[10])));
const pct = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))] ?? 0; };
const LIMBS = ['handL', 'handR', 'footL', 'footR', 'head'];

for (const name of only) {
  await ev(() => window.__game.startTrace());
  await scenarios[name]();
  const tr = await ev(() => window.__game.stopTrace());
  const rows = [];
  for (let i = 2; i < tr.length; i++) {
    const a = tr[i - 2], b = tr[i - 1], c = tr[i];
    if (a[0] < 0 || b[0] < 0 || c[0] < 0) continue;
    const d1 = b[0] / 1000, d2 = c[0] / 1000;
    const w1 = ang(a[4], a[5], a[6], b[4], b[5], b[6]) / d1, w2 = ang(b[4], b[5], b[6], c[4], c[5], c[6]) / d2;
    const cv1 = [(b[1] - a[1]) / d1, (b[2] - a[2]) / d1, (b[3] - a[3]) / d1], cv2 = [(c[1] - b[1]) / d2, (c[2] - b[2]) / d2, (c[3] - b[3]) / d2];
    const hv1 = [(b[11] - a[11]) / d1, (b[12] - a[12]) / d1, (b[13] - a[13]) / d1], hv2 = [(c[11] - b[11]) / d2, (c[12] - b[12]) / d2, (c[13] - b[13]) / d2];
    let limb = 0, limbName = '';
    for (let k = 0; k < 5; k++) {
      const o = 18 + k * 3;
      const lv1 = [(b[o] - a[o]) / d1, (b[o + 1] - a[o + 1]) / d1, (b[o + 2] - a[o + 2]) / d1];
      const lv2 = [(c[o] - b[o]) / d2, (c[o + 1] - b[o + 1]) / d2, (c[o + 2] - b[o + 2]) / d2];
      const acc = Math.hypot(lv2[0] - lv1[0], lv2[1] - lv1[1], lv2[2] - lv1[2]) / d2;
      if (acc > limb) { limb = acc; limbName = LIMBS[k]; }
    }
    rows.push({
      t: tr.slice(0, i).reduce((s, r) => s + Math.abs(r[0]), 0) / 1000,
      camTurn: Math.abs(w2 - w1) / d2,
      camAcc: Math.hypot(cv2[0] - cv1[0], cv2[1] - cv1[1], cv2[2] - cv1[2]) / d2,
      body: Math.abs(qang(b, c) / d2 - qang(a, b) / d1) / d2,
      heroAcc: Math.hypot(hv2[0] - hv1[0], hv2[1] - hv1[1], hv2[2] - hv1[2]) / d2,
      limb, limbName,
      label: `${b[15]}>${c[15]} ${b[17]}>${c[17]}`,
    });
  }
  console.log(`\n=== ${name}: ${tr.length} frames`);
  for (const [key, unit] of [['limb', 'm/s^2 (limb in body frame)'], ['body', 'rad/s^2'], ['camTurn', 'rad/s^2'], ['camAcc', 'm/s^2'], ['heroAcc', 'm/s^2']]) {
    const vals = rows.map((r) => r[key]);
    console.log(`${key.padEnd(8)} p50 ${pct(vals, 0.5).toFixed(0)} p95 ${pct(vals, 0.95).toFixed(0)} p99 ${pct(vals, 0.99).toFixed(0)} max ${Math.max(0, ...vals).toFixed(0)} ${unit}`);
    for (const r of [...rows].sort((x, y) => y[key] - x[key]).slice(0, 4)) console.log(`   t ${r.t.toFixed(2)}  ${r[key].toFixed(0)}${key === 'limb' ? ' ' + r.limbName : ''}  ${r.label}`);
  }
}
await browser.close();
