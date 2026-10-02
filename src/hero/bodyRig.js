import * as THREE from 'three';
import { solveTwoBone } from './limbIK.js';

// Procedural body posing on the Quaternius skeleton. A pose is a flat vector of readable targets
// (see LAYOUT in poses.js): spine bend, head look, each hand's position relative to its shoulder in
// the chest's frame (plus an elbow pole), each foot's position relative to its hip in the pelvis
// frame (plus a knee pole), finger curls, wrist bend and toe point. apply() resets the skeleton to
// its rest pose (T-pose), bends the spine, solves both arms and legs with two-bone IK and curls the
// fingers. Model space: +x is the character's left, +y up, +z forward; the origin is between the
// feet.

const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const q = new THREE.Quaternion(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion(), mq = new THREE.Quaternion();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const target = new THREE.Vector3(), pole = new THREE.Vector3();
const chestQ = new THREE.Quaternion(), accQ = new THREE.Quaternion();

const FINGERS = ['index', 'middle', 'ring', 'pinky', 'thumb'];
// How far each joint of a finger bends at full curl (radians): base, middle, tip.
const CURL = { index: [1.35, 1.6, 1.1], middle: [1.4, 1.65, 1.1], ring: [1.45, 1.65, 1.1], pinky: [1.5, 1.6, 1.1], thumb: [0.6, 0.7, 0.7] };

// Rotates `bone` in world space by `rot` (a world-space quaternion) and refreshes its subtree.
function rotateWorld(bone, rot) {
  bone.getWorldQuaternion(wq);
  bone.parent.getWorldQuaternion(pq);
  wq.premultiply(rot);
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateMatrixWorld(true);
}

export function createBodyRig(model) {
  const bone = (n) => {
    const b = model.getObjectByName(n);
    if (!b) throw new Error(`no bone ${n}`);
    return b;
  };
  const bones = [];
  model.traverse((o) => { if (o.isBone) bones.push(o); });
  const rest = new Map(bones.map((b) => [b, b.quaternion.clone()]));
  const restPos = new Map(bones.map((b) => [b, b.position.clone()]));
  const spine = [bone('spine_01'), bone('spine_02'), bone('spine_03')];
  const neck = bone('neck_01'), head = bone('Head');
  const side = (s) => ({
    upper: bone(`upperarm_${s}`), lower: bone(`lowerarm_${s}`), hand: bone(`hand_${s}`),
    thigh: bone(`thigh_${s}`), calf: bone(`calf_${s}`), foot: bone(`foot_${s}`),
    fingers: FINGERS.map((f) => [1, 2, 3].map((i) => bone(`${f}_0${i}_${s}`))),
  });
  const L = side('l'), R = side('r');

  // Finger curl axes, found numerically in the rest pose: the bone-local axis that moves the next
  // joint most toward the palm. The palm faces down in the T-pose, so "toward the palm" is -y.
  function curlAxis(b, child) {
    let best = null, bestGain = -Infinity;
    model.updateMatrixWorld(true);
    const base = child.getWorldPosition(new THREE.Vector3());
    const q0 = b.quaternion.clone();
    for (const axis of [AX, AY, AZ]) for (const sgn of [1, -1]) {
      b.quaternion.copy(q0).multiply(q.setFromAxisAngle(axis, 0.3 * sgn));
      b.updateMatrixWorld(true);
      const gain = -(child.getWorldPosition(v1).y - base.y);
      if (gain > bestGain) { bestGain = gain; best = axis.clone().multiplyScalar(sgn); }
    }
    b.quaternion.copy(q0);
    b.updateMatrixWorld(true);
    return best;
  }
  const fingerAxes = new Map();
  for (const s of [L, R]) for (const chain of s.fingers) {
    for (let i = 0; i < 3; i++) {
      const child = i < 2 ? chain[i + 1] : chain[2].children.find((c) => c.isBone);
      fingerAxes.set(chain[i], child ? curlAxis(chain[i], child) : AZ.clone());
    }
  }
  // Wrist bend axis (hand back toward the forearm's top) and toe point axis, the same way.
  function bendAxis(b, child, dir) {
    let best = null, bestGain = -Infinity;
    model.updateMatrixWorld(true);
    const base = child.getWorldPosition(new THREE.Vector3());
    const q0 = b.quaternion.clone();
    for (const axis of [AX, AY, AZ]) for (const sgn of [1, -1]) {
      b.quaternion.copy(q0).multiply(q.setFromAxisAngle(axis, 0.3 * sgn));
      b.updateMatrixWorld(true);
      const gain = child.getWorldPosition(v1).sub(base).dot(dir);
      if (gain > bestGain) { bestGain = gain; best = axis.clone().multiplyScalar(sgn); }
    }
    b.quaternion.copy(q0);
    b.updateMatrixWorld(true);
    return best;
  }
  const UPW = new THREE.Vector3(0, 1, 0), DOWNW = new THREE.Vector3(0, -1, 0);
  const wristAxis = { l: bendAxis(L.hand, L.fingers[1][0], UPW), r: bendAxis(R.hand, R.fingers[1][0], UPW) };
  const toeAxis = { l: bendAxis(L.foot, bone('ball_l'), DOWNW), r: bendAxis(R.foot, bone('ball_r'), DOWNW) };

  // Model-space joint positions in the rest pose (for the pose authoring helpers).
  model.updateMatrixWorld(true);
  const toModel = (b) => model.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
  const restJoints = {
    shoulderL: toModel(L.upper), shoulderR: toModel(R.upper), hipL: toModel(L.thigh), hipR: toModel(R.thigh),
    armLen: toModel(L.upper).distanceTo(toModel(L.lower)) + toModel(L.lower).distanceTo(toModel(L.hand)),
    legLen: toModel(L.thigh).distanceTo(toModel(L.calf)) + toModel(L.calf).distanceTo(toModel(L.foot)),
  };

  function resetToRest() {
    for (const b of bones) { b.quaternion.copy(rest.get(b)); b.position.copy(restPos.get(b)); }
    model.updateMatrixWorld(true);
  }

  // Model-space direction to world.
  const modelQ = new THREE.Quaternion();
  const toWorldDir = (x, y, z, out) => out.set(x, y, z).applyQuaternion(modelQ);

  function solveArm(s, p, o, overrideWorld) {
    // Hand target: shoulder joint + offset in the chest frame.
    s.upper.getWorldPosition(v2);
    if (overrideWorld) target.copy(overrideWorld);
    else target.copy(v3.set(p[o], p[o + 1], p[o + 2]).applyQuaternion(chestQ)).add(v2);
    pole.set(p[o + 3], p[o + 4], p[o + 5]).applyQuaternion(chestQ);
    solveTwoBone(s.upper, s.lower, s.hand, target, pole, 1);
  }
  function solveLeg(s, p, o) {
    s.thigh.getWorldPosition(v2);
    target.copy(v3.set(p[o], p[o + 1], p[o + 2]).applyQuaternion(modelQ)).add(v2);
    pole.set(p[o + 3], p[o + 4], p[o + 5]).applyQuaternion(modelQ);
    solveTwoBone(s.thigh, s.calf, s.foot, target, pole, 1);
  }
  function curl(s, p, o) {
    for (let f = 0; f < 5; f++) {
      const amount = p[o + f];
      if (Math.abs(amount) < 1e-3) continue;
      const chain = s.fingers[f], c = CURL[FINGERS[f]];
      for (let i = 0; i < 3; i++) chain[i].quaternion.multiply(q.setFromAxisAngle(fingerAxes.get(chain[i]), c[i] * amount));
    }
  }

  // p: pose vector (see poses.js LAYOUT). webHand: optional { side: 'l'|'r', world: Vector3 }
  // to pin one hand onto the web line, overriding the pose's hand target.
  function apply(p, webHand = null) {
    resetToRest();
    model.getWorldQuaternion(modelQ);
    // Spine: pitch (forward crunch, about the model's +x... left axis), roll (lean to the left,
    // about +z) and yaw (twist to the left, about +y), split across the three spine bones.
    const share = [0.3, 0.35, 0.35];
    // The chest frame is the model frame carried through every spine bend: (bend2 bend1 bend0) model.
    accQ.identity();
    for (let i = 0; i < 3; i++) {
      toWorldDir(1, 0, 0, v1); mq.setFromAxisAngle(v1, p[0] * share[i]);
      toWorldDir(0, 0, 1, v1); q.setFromAxisAngle(v1, -p[1] * share[i]); mq.premultiply(q);
      toWorldDir(0, 1, 0, v1); q.setFromAxisAngle(v1, p[2] * share[i]); mq.premultiply(q);
      rotateWorld(spine[i], mq);
      accQ.premultiply(mq);
    }
    chestQ.copy(modelQ).premultiply(accQ);
    // Head: pitch (down) and yaw (left), on the neck and head.
    v1.set(1, 0, 0).applyQuaternion(chestQ); mq.setFromAxisAngle(v1, p[3] * 0.5);
    rotateWorld(neck, mq); rotateWorld(head, mq);
    v1.set(0, 1, 0).applyQuaternion(chestQ); mq.setFromAxisAngle(v1, p[4] * 0.5);
    rotateWorld(neck, mq); rotateWorld(head, mq);
    // Arms and legs.
    solveArm(L, p, 5, webHand && webHand.side === 'l' ? webHand.world : null);
    solveArm(R, p, 11, webHand && webHand.side === 'r' ? webHand.world : null);
    solveLeg(L, p, 17);
    solveLeg(R, p, 23);
    // Wrists, toes, fingers (local rotations on top of the solved limbs).
    L.hand.quaternion.multiply(q.setFromAxisAngle(wristAxis.l, p[39]));
    R.hand.quaternion.multiply(q.setFromAxisAngle(wristAxis.r, p[40]));
    L.foot.quaternion.multiply(q.setFromAxisAngle(toeAxis.l, p[41]));
    R.foot.quaternion.multiply(q.setFromAxisAngle(toeAxis.r, p[42]));
    curl(L, p, 29);
    curl(R, p, 34);
    model.updateMatrixWorld(true);
  }

  // Snapshot / blend helpers for crossfading against clip poses.
  const snapA = bones.map(() => new THREE.Quaternion());
  const snapPelvis = new THREE.Vector3();
  const pelvis = bone('pelvis');
  return {
    bones, restJoints, apply, resetToRest,
    // Saves the current (clip-driven) pose.
    snapshot() { bones.forEach((b, i) => snapA[i].copy(b.quaternion)); snapPelvis.copy(pelvis.position); },
    // Blends the current (procedural) pose back toward the snapshot by (1 - w).
    blendWithSnapshot(w) {
      if (w >= 0.999) return;
      bones.forEach((b, i) => b.quaternion.slerpQuaternions(snapA[i], b.quaternion.clone(), w));
      pelvis.position.lerpVectors(snapPelvis, pelvis.position.clone(), w);
      model.updateMatrixWorld(true);
    },
  };
}
