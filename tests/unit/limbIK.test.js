// tests/unit/limbIK.test.js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { solveTwoBone } from '../../src/hero/limbIK.js';

// root (yawed and moved, like a character) -> upper -> lower (1 m) -> end (0.8 m), hanging down.
function chain() {
  const root = new THREE.Group();
  root.position.set(3, 2, -1);
  root.rotation.y = 0.7;
  const upper = new THREE.Bone(), lower = new THREE.Bone(), end = new THREE.Bone();
  lower.position.set(0, -1, 0);
  end.position.set(0, -0.8, 0);
  root.add(upper); upper.add(lower); lower.add(end);
  root.updateMatrixWorld(true);
  return { root, upper, lower, end };
}
const world = (o) => o.getWorldPosition(new THREE.Vector3());

describe('solveTwoBone', () => {
  it('puts the end on a target within reach, bending toward the pole', () => {
    const { upper, lower, end } = chain();
    const target = world(upper).add(new THREE.Vector3(0.9, -0.6, 0.3));
    const miss = solveTwoBone(upper, lower, end, target, new THREE.Vector3(0, 0, -1));
    expect(miss).toBe(0);
    expect(world(end).distanceTo(target)).toBeLessThan(1e-4);
    expect(world(lower).z).toBeLessThan(world(upper).z); // the elbow went toward -z
    // Bone lengths are untouched.
    expect(world(upper).distanceTo(world(lower))).toBeCloseTo(1, 5);
    expect(world(lower).distanceTo(world(end))).toBeCloseTo(0.8, 5);
  });
  it('reaches straight toward a target out of reach and reports the shortfall', () => {
    const { upper, lower, end } = chain();
    const target = world(upper).add(new THREE.Vector3(0, 2.5, 0));
    const miss = solveTwoBone(upper, lower, end, target, new THREE.Vector3(1, 0, 0));
    expect(miss).toBeCloseTo(0.7, 2);
    expect(world(end).y).toBeGreaterThan(world(upper).y + 1.7);
  });
  it('leaves the pose alone at weight 0', () => {
    const { upper, lower, end } = chain();
    const before = world(end);
    solveTwoBone(upper, lower, end, new THREE.Vector3(0, 10, 0), new THREE.Vector3(1, 0, 0), 0);
    expect(world(end).distanceTo(before)).toBeLessThan(1e-9);
  });
  it('lands on the target again from its own solved pose (no drift frame to frame)', () => {
    const { upper, lower, end } = chain();
    const target = world(upper).add(new THREE.Vector3(0.5, -0.9, -0.4));
    for (let i = 0; i < 30; i++) solveTwoBone(upper, lower, end, target, new THREE.Vector3(1, 0, 0));
    expect(world(end).distanceTo(target)).toBeLessThan(1e-4);
    expect(world(upper).distanceTo(world(lower))).toBeCloseTo(1, 5);
  });
});
