// Analytic two-bone IK (shoulder-elbow-wrist, hip-knee-ankle) applied on top of whatever the
// animation mixer posed this frame. Works in world space, so the character's yaw, tilt and scale
// don't matter. No allocation per call: every vector and quaternion is a module scratch.
import * as THREE from 'three';

const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
const T = new THREE.Vector3(), P = new THREE.Vector3(), goal = new THREE.Vector3();
const from = new THREE.Vector3(), to = new THREE.Vector3();
const q = new THREE.Quaternion(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion();
const ID = new THREE.Quaternion();

// Rotates `bone` in world space by the rotation taking direction `a` to `b` (both unit length),
// scaled by `weight`, and refreshes its subtree's world matrices.
function turnBone(bone, a, b, weight) {
  q.setFromUnitVectors(a, b);
  if (weight < 1) q.slerpQuaternions(ID, q, weight);
  bone.getWorldQuaternion(wq);
  bone.parent.getWorldQuaternion(pq);
  wq.premultiply(q);
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateMatrixWorld(true);
}

// Bends upper -> lower -> end so `end` reaches `target` (clamped to the limb's reach), with the
// middle joint bending toward `pole` (a world direction, e.g. out and down for an elbow).
// `weight` 0..1 blends from the animated pose to the solved one. Returns how far short of the
// target the end still is (0 when in reach).
export function solveTwoBone(upper, lower, end, target, pole, weight = 1) {
  if (weight <= 0) return 0;
  upper.getWorldPosition(A); lower.getWorldPosition(B); end.getWorldPosition(C);
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  T.subVectors(target, A);
  const want = T.length();
  const d = Math.min(Math.max(want, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  T.normalize();
  // The middle joint's spot: on the circle of solutions, the point nearest the pole side.
  P.copy(pole).addScaledVector(T, -pole.dot(T));
  if (P.lengthSq() < 1e-8) P.set(0, -1, 0).addScaledVector(T, T.y);
  P.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  goal.copy(A).addScaledVector(T, l1 * cosA).addScaledVector(P, l1 * sinA);
  from.subVectors(B, A).normalize(); to.subVectors(goal, A).normalize();
  turnBone(upper, from, to, weight);
  lower.getWorldPosition(B); end.getWorldPosition(C);
  goal.copy(A).addScaledVector(T, d);
  from.subVectors(C, B).normalize(); to.subVectors(goal, B).normalize();
  turnBone(lower, from, to, weight);
  return Math.max(0, want - d);
}
