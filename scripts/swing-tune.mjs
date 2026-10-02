// Random search over the swing feel constants against the deterministic swing battery.
//   node scripts/swing-tune.mjs [iterations]
// Objective: a target feel, not "faster is better": mean speed near 140 km/h with real rise and
// fall, top speed under about 230 km/h, a steady working height, no street touches, no walls.
import { tune } from '../src/physics/constants.js';
import { makeWorld, battery, summary } from './swing-sim.mjs';
import { createRng } from '../src/core/rng.js';

const { world } = makeWorld();
const RANGES = {
  swingLenBase: [8, 24], swingLenPerSpeed: [0, 0.7], swingLenMax: [22, 45],
  swingStartAngle: [30, 70], cruiseSpeed: [30, 40], pumpAccel: [6, 30], pumpCone: [20, 60],
  releaseAngle: [25, 60], releaseBoost: [0, 7], chainApexVy: [-4, 8], chainDelay: [0.05, 0.4],
  swingTerminal: [60, 120], swingSideDamp: [3, 12], altTarget: [25, 45], altGain: [0, 1.5],
};
const objective = (rs) => {
  const s = summary(rs);
  const dirty = s.runs - s.clean;
  // Feel terms: a swing should rise and fall (arc of at least 9 m per cycle) and hold a working
  // height (25 to 50 m over the ground on average), not ride a flat rail or climb out of the city.
  const arcPen = 6 * Math.max(0, 9 - s.arc);
  const altPen = 2 * Math.max(0, s.alt - 50) + 2 * Math.max(0, 25 - s.alt);
  const speedPen = 2 * Math.abs(s.meanKmh - 140) + 1 * Math.max(0, s.topKmh - 230);
  return { score: 200 - speedPen - 12 * s.walls - 30 * dirty - 150 * Math.max(0, s.cv - 0.35) - arcPen - altPen, ...s };
};
const evalNow = () => objective([
  ...battery(world, { trials: 16, seconds: 18, seed: 5 }),
  ...battery(world, { trials: 16, seconds: 18, seed: 6 }),
  ...battery(world, { trials: 12, seconds: 18, gravity: 'real', seed: 7 }),
]);
const keys = Object.keys(RANGES);
const base = Object.fromEntries(keys.map((k) => [k, tune[k]]));
let best = { params: { ...base }, ...evalNow() };
const fmt = (r) => `score ${r.score.toFixed(1)} mean ${r.meanKmh.toFixed(0)} top ${r.topKmh.toFixed(0)} avg ${r.avgKmh.toFixed(0)} km/h cv ${r.cv.toFixed(2)} walls ${r.walls.toFixed(2)} clean ${r.clean}/${r.runs} swings ${r.swings.toFixed(1)} alt ${r.alt.toFixed(0)} arc ${r.arc.toFixed(1)}`;
console.log('baseline', fmt(best));
const rng = createRng(23);
const iters = +(process.argv[2] ?? 150);
for (let i = 0; i < iters; i++) {
  const trial = { ...best.params };
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (rng.chance(0.35)) trial[k] = rng.chance(0.2) ? rng.range(lo, hi) : Math.min(hi, Math.max(lo, trial[k] + (hi - lo) * rng.range(-0.15, 0.15)));
  }
  Object.assign(tune, trial);
  const r = evalNow();
  if (r.score > best.score) { best = { params: trial, ...r }; console.log(i, fmt(r)); }
}
Object.assign(tune, base);
console.log('BEST', JSON.stringify(Object.fromEntries(Object.entries(best.params).map(([k, v]) => [k, +(+v).toFixed(3)]))));
