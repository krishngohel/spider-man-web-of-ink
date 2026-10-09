// Checks that two builds of a clip file play the same, through the game's own path: three's
// GLTFLoader (with the meshopt decoder) parses both, then the same clip names, the same durations,
// and, sampled at 11 times through every clip by three's interpolants, every bone rotation within
// a small angle and the pelvis within a few millimetres.
//   node scripts/clip-compare.mjs <before.glb> <after.glb> [maxDegrees=0.5]
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const [aFile, bFile, maxDegArg] = process.argv.slice(2);
if (!aFile || !bFile) { console.error('usage: node scripts/clip-compare.mjs <before.glb> <after.glb> [maxDegrees]'); process.exit(2); }
const MAX_DEG = Number(maxDegArg ?? 0.5), MAX_MM = 5;

const parse = (f) => new Promise((res, rej) => {
  const b = readFileSync(f);
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '', res, rej);
});
const [a, b] = await Promise.all([parse(aFile), parse(bFile)]);
const A = new Map(a.animations.map((c) => [c.name, c])), B = new Map(b.animations.map((c) => [c.name, c]));
const problems = [];
let worstDeg = 0, worstMm = 0, worstAt = '', samples = 0;
for (const name of A.keys()) if (!B.has(name)) problems.push(`clip ${name} is gone`);
for (const name of B.keys()) if (!A.has(name)) problems.push(`clip ${name} is new`);
for (const [name, ca] of A) {
  const cb = B.get(name);
  if (!cb) continue;
  if (Math.abs(ca.duration - cb.duration) > 1e-4) problems.push(`${name}: duration ${ca.duration.toFixed(4)} -> ${cb.duration.toFixed(4)}`);
  if (ca.tracks.length !== cb.tracks.length) problems.push(`${name}: ${ca.tracks.length} tracks -> ${cb.tracks.length}`);
  for (const ta of ca.tracks) {
    const tb = cb.tracks.find((t) => t.name === ta.name);
    if (!tb) { problems.push(`${name}: track ${ta.name} is gone`); continue; }
    const ia = ta.createInterpolant(), ib = tb.createInterpolant();
    for (let s = 0; s <= 10; s++) {
      const t = (ca.duration * s) / 10;
      const va = ia.evaluate(t), vb = ib.evaluate(t);
      samples++;
      if (va.length === 4) {
        // Stored quaternions are not always unit length: compare directions only.
        const dot = Math.abs(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2] + va[3] * vb[3]) / (Math.hypot(...va) * Math.hypot(...vb));
        const deg = (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
        if (deg > worstDeg) { worstDeg = deg; worstAt = `${name} ${ta.name} at ${t.toFixed(2)} s`; }
      } else worstMm = Math.max(worstMm, Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]) * 1000);
    }
  }
}
if (worstDeg > MAX_DEG) problems.push(`a rotation moved ${worstDeg.toFixed(3)} deg (${worstAt})`);
if (worstMm > MAX_MM) problems.push(`the pelvis moved ${worstMm.toFixed(2)} mm`);
console.log(`${A.size} clips, ${samples} samples; worst rotation ${worstDeg.toFixed(4)} deg (${worstAt || 'none'}), worst pelvis ${worstMm.toFixed(3)} mm`);
console.log(problems.length ? `FAIL\n  ${problems.slice(0, 20).join('\n  ')}` : 'PASS  same clips, same durations, same poses');
process.exit(problems.length ? 1 : 0);
