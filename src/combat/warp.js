import { TUNE } from './tuning.js';

// Motion warping (spec 1.4): a clip's own root travel, turned toward the target and stretched so
// the contact frame lands `gap` metres from it. The difference is spread over the clip up to the
// contact frame (eased), and capped at `clamp` metres beyond the clip's own travel, so a move never
// slides further than a lunge could. The heading turns to face the target over the first 30%.
// Clip space: x is the hero's left, z ahead (scripts/retarget-mocap.mjs aims each strike along z).

const ease = (k) => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function rootAt(root, fps, t) {
  const n = root.length / 2 - 1;
  const f = Math.min(n, Math.max(0, t * fps)), i = Math.floor(f), j = Math.min(n, i + 1), k = f - i;
  return { x: root[i * 2] + (root[j * 2] - root[i * 2]) * k, z: root[i * 2 + 1] + (root[j * 2 + 1] - root[i * 2 + 1]) * k };
}

export function planWarp({ root, fps, contact, duration, from, facing, to, gap = TUNE.contactGap, clamp = TUNE.warpClamp }) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const heading = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : facing;
  const c = rootAt(root, fps, contact);
  const want = Math.hypot(dx, dz) - gap;
  // Extra travel along the heading at contact: never back past the start, never over the clamp.
  const extra = Math.max(-c.z, Math.min(clamp, want - c.z));
  const sn = Math.sin(heading), cs = Math.cos(heading);
  const turn = wrap(heading - facing);
  const faceT = Math.max(1e-3, TUNE.faceBy * (duration ?? contact));
  return {
    heading, extra,
    at(t) {
      const r = rootAt(root, fps, t);
      const z = r.z + extra * ease(t / Math.max(1e-3, contact));
      // Clip x is the hero's left: with heading a, left is (cos a, -sin a) and ahead (sin a, cos a).
      return { x: from.x + r.x * cs + z * sn, z: from.z - r.x * sn + z * cs };
    },
    yaw(t) { return facing + turn * ease(t / faceT); },
  };
}
