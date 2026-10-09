// Pure shot sampler for the in-engine cinematic camera (src/ui/cinematic.js): no three.js, no DOM,
// so it is cheap to unit test. A shot is
//   { from: {x,y,z}, to: {x,y,z}, look: {x,y,z}, lookTo?: {x,y,z}, dur, fov?, sub? }
// the camera eases from `from` to `to` over `dur` seconds, looking at `look` (easing to `lookTo`
// if given), with `sub` as the subtitle under the letterbox for that shot. Shots cut hard from one
// to the next: a sequence is a list of them.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// The same smoothstep ease the rest of the game uses for a scripted move.
export function ease(k) { const c = clamp01(k); return c * c * (3 - 2 * c); }
const lerp = (a, b, k) => a + (b - a) * k;

// Samples one shot at local time `t` (seconds since it started, clamped to its duration). Fills
// and returns `out` instead of allocating: { x, y, z, lx, ly, lz, fov }.
export function sampleShot(shot, t, out = {}) {
  const k = ease(shot.dur > 0 ? t / shot.dur : 1);
  out.x = lerp(shot.from.x, shot.to.x, k);
  out.y = lerp(shot.from.y, shot.to.y, k);
  out.z = lerp(shot.from.z, shot.to.z, k);
  const lookTo = shot.lookTo ?? shot.look;
  out.lx = lerp(shot.look.x, lookTo.x, k);
  out.ly = lerp(shot.look.y, lookTo.y, k);
  out.lz = lerp(shot.look.z, lookTo.z, k);
  out.fov = shot.fov ?? 50;
  return out;
}

export function totalDuration(shots) {
  let t = 0;
  for (const s of shots) t += s.dur;
  return t;
}

// Samples a whole sequence at global time `t`. `out` also gets `index` (the shot playing) and
// `done` (true once `t` reaches the total; the pose stays on the last shot's final frame, so a
// caller can always read a valid pose).
export function sampleSequence(shots, t, out = {}, total = totalDuration(shots)) {
  let acc = 0;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (t < acc + s.dur || i === shots.length - 1) {
      sampleShot(s, Math.min(s.dur, Math.max(0, t - acc)), out);
      out.index = i;
      out.done = t >= total;
      return out;
    }
    acc += s.dur;
  }
  out.index = -1;
  out.done = true;
  return out;
}

// An arc around `center` at `radius` and `height` over `dur` seconds, split into `segments`
// shots, always looking at `center`. opts: startAngle (radians, 0 = +z), sweep, fov, sub (on the
// first segment only).
export function orbitShots(center, radius, height, dur, segments = 2, opts = {}) {
  const { startAngle = 0, sweep = Math.PI * 0.6, fov = 42, sub = null } = opts;
  const n = Math.max(1, segments | 0);
  const per = dur / n;
  const shots = [];
  for (let i = 0; i < n; i++) {
    const a0 = startAngle + (sweep * i) / n, a1 = startAngle + (sweep * (i + 1)) / n;
    shots.push({
      from: { x: center.x + Math.sin(a0) * radius, y: center.y + height, z: center.z + Math.cos(a0) * radius },
      to: { x: center.x + Math.sin(a1) * radius, y: center.y + height, z: center.z + Math.cos(a1) * radius },
      look: { x: center.x, y: center.y, z: center.z },
      dur: per, fov,
      ...(i === 0 && sub ? { sub } : {}),
    });
  }
  return shots;
}

// Keeps a sequence out of the city: for every shot, the path from `from` to `to` is sampled and
// wherever a sample sits inside a box (x and z within it, below its top plus `margin`) the whole
// shot is lifted by what that sample needs, so a dolly keeps its line and only rises. Boxes are
// the city's { min: [x,y,z], max: [x,y,z] }. Returns new shots (the input is not touched) and
// records the lift on each as `lifted` (0 when nothing was in the way), for the tests and the
// film scripts to report.
export function clearShots(shots, boxes, defaultMargin = 5, samples = 9) {
  return shots.map((s) => {
    const margin = s.margin ?? defaultMargin; // a shot that means to sit close to things says so
    const minX = Math.min(s.from.x, s.to.x) - margin, maxX = Math.max(s.from.x, s.to.x) + margin;
    const minZ = Math.min(s.from.z, s.to.z) - margin, maxZ = Math.max(s.from.z, s.to.z) + margin;
    const near = boxes.filter((b) => b.max[0] >= minX && b.min[0] <= maxX && b.max[2] >= minZ && b.min[2] <= maxZ);
    let lift = 0;
    for (let i = 0; i <= samples; i++) {
      const k = i / samples, x = lerp(s.from.x, s.to.x, k), y = lerp(s.from.y, s.to.y, k), z = lerp(s.from.z, s.to.z, k);
      for (const b of near) {
        if (x < b.min[0] - margin || x > b.max[0] + margin || z < b.min[2] - margin || z > b.max[2] + margin) continue;
        const need = b.max[1] + margin - y;
        if (need > lift) lift = need;
      }
    }
    if (lift <= 0) return { ...s, lifted: 0 };
    return { ...s, from: { ...s.from, y: s.from.y + lift }, to: { ...s.to, y: s.to.y + lift }, lifted: lift };
  });
}

// The house rules for a story cinematic: every shot 2.5 to 6 s, the whole thing under 14 s,
// nothing underground. Returns a list of complaints (empty when the sequence is fine).
export function checkShots(shots, { minShot = 2.5, maxShot = 6, maxTotal = 14 } = {}) {
  const out = [];
  if (!shots.length) out.push('no shots');
  shots.forEach((s, i) => {
    if (!(s.dur >= minShot && s.dur <= maxShot)) out.push(`shot ${i} runs ${s.dur} s`);
    if (s.from.y < 1 || s.to.y < 1) out.push(`shot ${i} goes under the ground`);
    if (s.sub && s.sub.length > 72) out.push(`shot ${i} subtitle is long (${s.sub.length})`);
    for (const k of ['from', 'to', 'look']) if (!s[k] || ![s[k].x, s[k].y, s[k].z].every(Number.isFinite)) out.push(`shot ${i} ${k} is not a point`);
  });
  const total = totalDuration(shots);
  if (total > maxTotal) out.push(`total ${total.toFixed(1)} s`);
  return out;
}
