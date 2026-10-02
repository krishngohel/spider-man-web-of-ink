import { describe, it, expect } from 'vitest';
import { planWarp } from '../../src/combat/warp.js';

// A clip that walks 1 m straight ahead over 1 s (30 fps), landing at the end.
const fps = 30, n = 31;
const root = [];
for (let i = 0; i < n; i++) root.push(0, i / (n - 1));
const clip = { root, fps, contact: 1, duration: 1 };

describe('motion warping', () => {
  it('stretches the travel so the hit lands 1 m short of the target', () => {
    const w = planWarp({ ...clip, from: { x: 0, z: 0 }, facing: 0, to: { x: 0, z: 3 } });
    const p = w.at(1);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(2, 5);
  });
  it('clamps the extra travel at 4 m', () => {
    const w = planWarp({ ...clip, from: { x: 0, z: 0 }, facing: 0, to: { x: 0, z: 10 } });
    expect(w.at(1).z).toBeCloseTo(5, 5);
  });
  it('never walks backwards past the start when the target is close', () => {
    const w = planWarp({ ...clip, from: { x: 0, z: 0 }, facing: 0, to: { x: 0, z: 0.8 } });
    expect(w.at(1).z).toBeGreaterThanOrEqual(-1e-9);
  });
  it('turns the travel toward the target', () => {
    const w = planWarp({ ...clip, from: { x: 5, z: 5 }, facing: 0, to: { x: 8, z: 5 } });
    const p = w.at(1);
    expect(p.x).toBeCloseTo(7, 5);
    expect(p.z).toBeCloseTo(5, 5);
  });
  it('faces the target by 30% of the clip', () => {
    const w = planWarp({ ...clip, from: { x: 0, z: 0 }, facing: 0, to: { x: 4, z: 0 } });
    expect(w.yaw(0)).toBeCloseTo(0, 5);
    expect(w.yaw(0.3)).toBeCloseTo(Math.PI / 2, 5);
    expect(w.yaw(0.15)).toBeGreaterThan(0.2);
  });
  it('starts where the hero stands', () => {
    const w = planWarp({ ...clip, from: { x: 2, z: -3 }, facing: 1, to: { x: 2, z: 6 } });
    expect(w.at(0).x).toBeCloseTo(2, 5);
    expect(w.at(0).z).toBeCloseTo(-3, 5);
  });
});
