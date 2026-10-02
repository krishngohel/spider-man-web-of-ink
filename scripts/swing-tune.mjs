// Random search over the anchor-scoring weights against the deterministic swing battery.
//   node scripts/swing-tune.mjs [iterations]
import { SCORE } from '../src/physics/anchors.js';
import { makeWorld, battery } from './swing-sim.mjs';
import { createRng } from '../src/core/rng.js';

const { world } = makeWorld();
const RANGES = {
  velLean: [0, 1.2], idealBase: [18, 40], idealPerSpeed: [0, 0.8], idealMax: [35, 68],
  dist: [0, 1.6], clear: [0, 1], vel: [0, 1.2],
  survive: [0.5, 5], progress: [0, 2.5], heading: [0, 3], keep: [0, 2],
};
const objective = (rs) => {
  const avg = rs.reduce((s, r) => s + r.avg, 0) / rs.length * 3.6;
  const walls = rs.reduce((s, r) => s + r.walls, 0) / rs.length;
  const dirty = rs.filter((r) => r.groundSteps > 0).length;
  return { score: avg - 8 * walls - 25 * dirty, avg, walls, dirty };
};
const evalNow = () => objective([
  ...battery(world, { trials: 16, seconds: 18, seed: 5 }),
  ...battery(world, { trials: 16, seconds: 18, seed: 6 }),
  ...battery(world, { trials: 12, seconds: 18, gravity: 'real', seed: 7 }),
]);
const base = { ...SCORE };
let best = { params: { ...SCORE }, ...evalNow() };
console.log('baseline', JSON.stringify(best));
const rng = createRng(17);
const iters = +(process.argv[2] ?? 120);
for (let i = 0; i < iters; i++) {
  const trial = { ...best.params };
  // Mutate a few weights around the current best (and occasionally jump anywhere).
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (rng.chance(0.35)) trial[k] = rng.chance(0.2) ? rng.range(lo, hi) : Math.min(hi, Math.max(lo, trial[k] + (hi - lo) * rng.range(-0.18, 0.18)));
  }
  Object.assign(SCORE, trial);
  const r = evalNow();
  if (r.score > best.score) { best = { params: trial, ...r }; console.log(i, 'better', r.score.toFixed(1), `avg ${r.avg.toFixed(0)} walls ${r.walls.toFixed(2)} dirty ${r.dirty}`); }
}
Object.assign(SCORE, base);
console.log('BEST', JSON.stringify(Object.fromEntries(Object.entries(best.params).map(([k, v]) => [k, +(+v).toFixed(3)]))));
