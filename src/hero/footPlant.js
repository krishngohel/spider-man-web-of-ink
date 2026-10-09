import * as THREE from 'three';
import { solveTwoBone } from './limbIK.js';

// Foot planting (Gotham's sole probe, plus leg IK): standing, idling or walking slowly, each foot
// is probed for the ground under its heel and ball, and the legs bend so the feet sit on a step, a
// kerb or a roof's lip instead of floating over it or sinking into it; the pelvis lowers to reach
// the lower foot. A foot out over a drop (a roof edge) hangs level with the other: there is nothing
// under it to stand on. The clip's own foot motion is kept on top (a step still lifts the foot), so
// on flat ground nothing changes at all. Never while swinging, in the air, on a wall, in a fighting
// move, an emote or a landing: the caller passes the weight (plantWeight) and fades it in and out.

export const PLANT = {
  maxUp: 0.45,    // the highest step a foot reaches up onto (m)
  maxDown: 0.35,  // the deepest a foot reaches down (more is a drop: the foot hangs level)
  walkFull: 1.0, walkOff: 2.4, // speed (m/s) where planting is full, and where it has faded out
  rate: 8,        // 1/s, the weight's fade
  upRate: 22, downRate: 12, // 1/s, how fast a foot's offset follows the ground (up quicker)
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// How much to plant (0 to 1) for this body state.
export function plantWeight({ state, speed = 0, busy = false }, P = PLANT) {
  if (state !== 'ground' || busy) return 0;
  return 1 - smooth(P.walkFull, P.walkOff, speed);
}

// The height of the ground under a foot, relative to the body's own ground (0), from its heel and
// ball probes (either can be -Infinity for nothing found). The higher of the two carries the foot;
// a drop past maxDown is no ground (the foot hangs level); past maxUp is not a step but a riser.
export function footOffset(base, heel, ball, P = PLANT) {
  const g = Math.max(heel, ball);
  if (!(g > -Infinity)) return 0;
  const off = g - base;
  // Too deep is a drop (hang level), too high is a riser in front of the foot, not ground under it.
  if (off < -P.maxDown || off > P.maxUp) return 0;
  return off;
}

// The pelvis lowers by the lower foot's offset (never rises: the body's ground is already the
// highest under it).
export function pelvisDrop(offL, offR) { return Math.min(0, offL, offR); }

const A = new THREE.Vector3(), B = new THREE.Vector3(), T = new THREE.Vector3(), pole = new THREE.Vector3();
const keep = new THREE.Quaternion(), pq = new THREE.Quaternion();

// model: the skinned character (bones thigh/calf/foot/ball _l/_r); its position.y is its rest
// offset under the root, which this lowers. groundAt(x, y, z): the highest surface under (x, z) at
// or below y.
export function createFootPlant(model, groundAt, P = PLANT) {
  const get = (n) => model.getObjectByName(n);
  const legs = ['l', 'r'].map((s) => ({ thigh: get(`thigh_${s}`), calf: get(`calf_${s}`), foot: get(`foot_${s}`), ball: get(`ball_${s}`), off: 0, want: 0,
    pre: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()], post: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()], solved: false }));
  const chain = (q) => [q.thigh, q.calf, q.foot];
  // A frame where nothing re-posed the legs (a paused mixer) still has last frame's solve on them:
  // put the clip's pose back first, or the bend would stack up frame on frame.
  const unsolve = () => {
    for (const q of legs) {
      if (!q.solved) continue;
      q.solved = false;
      const bs = chain(q);
      if (bs.every((b, i) => b.quaternion.equals(q.post[i]))) bs.forEach((b, i) => b.quaternion.copy(q.pre[i]));
    }
  };
  const ok = legs.every((q) => q.thigh && q.calf && q.foot);
  const restY = model.position.y;
  let w = 0, drop = 0;
  const state = { get weight() { return w; }, get drop() { return drop; }, get offsets() { return legs.map((q) => q.off); } };
  // After the clips and the procedural body have posed the skeleton this frame. base: the world
  // height of the body's own ground (the feet of the idle pose); want: plantWeight(); fwd: the
  // body's forward (the knees bend that way).
  // cut: off at once (left the ground, a fighting move began), never a fade with the feet in the air.
  state.enabled = true; // test hook: off films the clips alone (before and after shots)
  state.update = (dt, base, want, fwd, cut = false) => {
    if (!ok) return;
    if (!state.enabled) { want = 0; cut = true; }
    unsolve();
    w = cut ? 0 : w + (want - w) * Math.min(1, dt * P.rate);
    if (w < 1e-3 && Math.abs(drop) < 1e-4) { w = 0; drop = 0; model.position.y = restY; for (const q of legs) q.off = 0; return; }
    model.updateMatrixWorld(true);
    for (const q of legs) {
      q.foot.getWorldPosition(A);
      if (q.ball) q.ball.getWorldPosition(B); else B.copy(A);
      const top = base + P.maxUp;
      q.want = footOffset(base, groundAt(A.x, top, A.z), groundAt(B.x, top, B.z), P);
      const k = q.want > q.off ? P.upRate : P.downRate;
      q.off += (q.want - q.off) * Math.min(1, dt * k);
    }
    // The lower foot sets the pelvis; the higher one bends its knee to reach its ground.
    const d = pelvisDrop(legs[0].off, legs[1].off) * w;
    drop = d;
    model.position.y = restY + d;
    model.updateMatrixWorld(true);
    for (const q of legs) {
      const up = q.off * w - d;
      if (up < 1e-3) continue;
      chain(q).forEach((b, i) => q.pre[i].copy(b.quaternion));
      q.foot.getWorldQuaternion(keep);
      q.foot.getWorldPosition(T);
      T.y += up;
      pole.set(fwd.x, 0.05, fwd.z);
      solveTwoBone(q.thigh, q.calf, q.foot, T, pole, 1);
      // The foot keeps the clip's angle in the world (flat on a flat step), not its leg's new one.
      q.foot.parent.getWorldQuaternion(pq);
      q.foot.quaternion.copy(pq.invert().multiply(keep));
      q.foot.updateMatrixWorld(true);
      chain(q).forEach((b, i) => q.post[i].copy(b.quaternion));
      q.solved = true;
    }
  };
  return state;
}
