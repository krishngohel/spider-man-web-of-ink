import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/core/rng.js';
import { createFixedStep } from '../../src/core/fixedStep.js';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(7), b = createRng(7), c = createRng(8);
    const sa = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(sa);
    expect(c.next()).not.toEqual(sa[0]);
  });
  it('int stays in range', () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) { const v = r.int(3, 6); expect(v).toBeGreaterThanOrEqual(3); expect(v).toBeLessThanOrEqual(6); }
  });
});

describe('fixedStep', () => {
  it('runs 4 steps of 1/240 in a 60 Hz frame', () => {
    const f = createFixedStep({ step: 1 / 240, maxSteps: 8 });
    expect(f.advance(1 / 60).steps).toBe(4);
  });
  it('caps a long frame at maxSteps and drops the excess', () => {
    const f = createFixedStep({ step: 1 / 240, maxSteps: 8 });
    expect(f.advance(0.2).steps).toBe(8);
    expect(f.advance(1 / 240).steps).toBe(1);
  });
  it('carries a remainder as alpha', () => {
    const f = createFixedStep({ step: 0.01, maxSteps: 8 });
    const r = f.advance(0.025);
    expect(r.steps).toBe(2);
    expect(r.alpha).toBeCloseTo(0.5, 5);
  });
});
