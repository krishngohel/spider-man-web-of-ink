// Measures the moves players called flings: a Q zip to a building (where the hero ends up after it
// arrives), Q in the air with nothing in reach (the zip boost dash), and climbing a wall up to the
// roof (how far past the edge and how high he goes). Real keys, headless.
//   node scripts/fling-probe.mjs [url]
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
const H = () => ev(() => { const h = window.__game.hero(); return { x: h.p.x, y: h.p.y, z: h.p.z, vx: h.v.x, vy: h.v.y, vz: h.v.z, s: h.state }; });
// A building with a clear street on its +x side and a roof 18-40 m up.
const B = await ev(() => {
  const boxes = window.__game.city.boxes.filter((b) => b.kind === 'building');
  for (const b of boxes) {
    const top = b.max[1];
    if (top < 18 || top > 40 || b.max[2] - b.min[2] < 14 || b.max[0] - b.min[0] < 14) continue;
    const x = b.max[0] + 14, z = (b.min[2] + b.max[2]) / 2;
    const clear = !boxes.some((o) => o !== b && x + 2 > o.min[0] && b.max[0] < o.max[0] && z > o.min[2] - 2 && z < o.max[2] + 2 && o.max[1] > 1);
    if (clear) return { face: b.max[0], top, z, minX: b.min[0], maxX: b.max[0] };
  }
  return null;
});
console.log('building', JSON.stringify(B));
async function track(ms) {
  const out = []; const t0 = Date.now();
  while (Date.now() - t0 < ms) { out.push({ t: Date.now() - t0, ...(await H()) }); await sleep(30); }
  return out;
}
const sum = (name, tr, refY) => {
  const top = Math.max(...tr.map((q) => Math.hypot(q.vx, q.vy, q.vz)));
  const peak = Math.max(...tr.map((q) => q.y)) - refY;
  const last = tr[tr.length - 1];
  console.log(`${name}: top speed ${top.toFixed(1)} m/s, peak ${peak.toFixed(1)} m above ref, ended ${last.s} at x ${last.x.toFixed(1)} y ${last.y.toFixed(1)} (states ${[...new Set(tr.map((q) => q.s))].join('>')})`);
  return { top, peak, last };
};

// 1. Q zip at the wall, well below the roof (8 m: within 6 m of the top a zip climbs over), from the street.
await ev(([x, z]) => window.__game.teleport(x, 1, z, 0, 0, 0, 'ground', -Math.PI / 2), [B.face + 14, B.z]);
await sleep(600);
await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [B.face, B.top - 8, B.z]);
await sleep(60);
await p.keyboard.press('KeyQ');
const z1 = await track(2500);
const r1 = sum('zip to the wall', z1, B.top);
console.log('   distance past the face onto the roof:', (B.face - r1.last.x).toFixed(1), 'm');

// 2. Q zip to the roof edge (aim at the top of the face).
await ev(([x, z]) => window.__game.teleport(x, 1, z, 0, 0, 0, 'ground', -Math.PI / 2), [B.face + 14, B.z]);
await sleep(600);
await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [B.face - 0.5, B.top + 0.1, B.z]);
await sleep(60);
await p.keyboard.press('KeyQ');
const z2 = await track(2500);
const r2 = sum('zip to the roof edge', z2, B.top);
console.log('   distance past the edge onto the roof:', (B.face - r2.last.x).toFixed(1), 'm');

// 3. Q in open air, nothing in reach: the zip boost dash.
await ev(([x, z]) => window.__game.teleport(x, 120, z, 0, 0, 0, 'air', Math.PI / 2), [B.face + 40, B.z]);
await sleep(100);
await ev(() => window.__game.setLook(Math.PI / 2, 0));
const a0 = await H();
await p.keyboard.press('KeyQ');
const z3 = await track(1200);
const l3 = z3[z3.length - 1];
console.log(`zip boost: top speed ${Math.max(...z3.map((q) => Math.hypot(q.vx, q.vy, q.vz))).toFixed(1)} m/s, moved ${Math.hypot(l3.x - a0.x, l3.z - a0.z).toFixed(1)} m in 1.2 s`);

// 4. Wall crawl up to the roof edge: on the face 6 m below the top, hold W.
await ev(([x, y, z]) => window.__game.teleport(x, y, z, -2, 0, 0, 'air', -Math.PI / 2), [B.face + 0.6, B.top - 6, B.z]);
await sleep(200);
await ev(() => window.__game.setLook(-Math.PI / 2, 0.6));
await p.keyboard.down('KeyW');
const z4 = await track(3000);
await p.keyboard.up('KeyW');
const r4 = sum('climb to the roof', z4, B.top);
console.log('   distance past the edge onto the roof:', (B.face - r4.last.x).toFixed(1), 'm');

// 5. Wall run (swing held) up to the roof edge at speed.
await ev(([x, y, z]) => window.__game.teleport(x, y, z, -2, 0, 0, 'air', -Math.PI / 2), [B.face + 0.6, B.top - 10, B.z]);
await sleep(200);
await ev(() => window.__game.setLook(-Math.PI / 2, 0.6));
await p.keyboard.down('KeyW'); await p.keyboard.down('ShiftLeft');
const z5 = await track(3000);
await p.keyboard.up('ShiftLeft'); await p.keyboard.up('KeyW');
// Only up to the first landing: still holding run, he crosses the roof and runs up the next wall.
const firstLand = z5.findIndex((q, i) => i > 0 && q.s === 'ground');
const r5 = sum('wall run to the roof', firstLand > 0 ? z5.slice(0, firstLand + 1) : z5, B.top);
console.log('   distance past the edge onto the roof:', (B.face - r5.last.x).toFixed(1), 'm');

await b.close();
// The limits (what a fling looked like: 60 m/s zips, 6 to 10 m launches off a wall top).
const checks = [
  ['a zip never goes much faster than its reel', r1.top < 40 && r2.top < 40],
  ['a zip into a wall sticks to it', r1.last.s === 'wall' && Math.abs(B.face - r1.last.x) < 1.5],
  ['a zip at a roof edge pops over and lands near the edge', r2.peak < 3.5 && B.face - r2.last.x > 0 && B.face - r2.last.x < 6],
  ['climbing over the top is a small hop', r4.peak < 2.5],
  ['a wall run over the top is a hop, not a launch', r5.peak < 3],
];
let ok = !errors.length;
for (const [n, c] of checks) { ok &&= c; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); }
console.log(errors.length ? errors.join('\n') : 'no page errors');
console.log(ok ? 'ALL PASS' : 'FAILED');
process.exit(ok ? 0 : 1);
