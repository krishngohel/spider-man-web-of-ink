import { describe, it, expect } from 'vitest';
import { ease, sampleShot, sampleSequence, totalDuration, orbitShots, clearShots, checkShots } from '../../src/ui/cinematicShots.js';

const P = (x, y, z) => ({ x, y, z });
const shotA = { from: P(0, 10, 0), to: P(100, 10, 0), look: P(50, 0, 50), dur: 4, fov: 40, sub: 'one' };
const shotB = { from: P(0, 20, 0), to: P(0, 20, 100), look: P(0, 0, 0), lookTo: P(0, 0, 100), dur: 3 };

describe('cinematic shot sampler', () => {
  it('eases with smoothstep: at rest at both ends, halfway in the middle', () => {
    expect(ease(-1)).toBe(0);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(1)).toBe(1);
    expect(ease(2)).toBe(1);
    expect(ease(0.1)).toBeLessThan(0.1);
  });
  it('a shot starts at from, ends at to, and holds the look and fov', () => {
    const s0 = sampleShot(shotA, 0), s1 = sampleShot(shotA, 4), sm = sampleShot(shotA, 2);
    expect([s0.x, s0.y, s0.z]).toEqual([0, 10, 0]);
    expect([s1.x, s1.y, s1.z]).toEqual([100, 10, 0]);
    expect(sm.x).toBeCloseTo(50);
    expect([s0.lx, s0.ly, s0.lz]).toEqual([50, 0, 50]);
    expect(s0.fov).toBe(40);
    expect(sampleShot(shotB, 1.5).lz).toBeCloseTo(50);
    expect(sampleShot(shotB, 9).z).toBe(100); // clamped to the end
  });
  it('a sequence reports the shot playing and when it is done, then holds the last frame', () => {
    const seq = [shotA, shotB];
    expect(totalDuration(seq)).toBe(7);
    expect(sampleSequence(seq, 1).index).toBe(0);
    expect(sampleSequence(seq, 4.5).index).toBe(1);
    expect(sampleSequence(seq, 4.5).done).toBe(false);
    const end = sampleSequence(seq, 7);
    expect(end.done).toBe(true);
    expect([end.x, end.y, end.z]).toEqual([0, 20, 100]);
    const past = sampleSequence(seq, 30);
    expect(past.done).toBe(true);
    expect(past.index).toBe(1);
    expect(sampleSequence([], 1).done).toBe(true);
  });
  it('an orbit keeps its radius and height and always looks at the centre', () => {
    const c = P(10, 5, -20);
    const shots = orbitShots(c, 8, 3, 6, 3, { sub: 'hi' });
    expect(shots).toHaveLength(3);
    expect(totalDuration(shots)).toBeCloseTo(6);
    for (const s of shots) {
      for (const q of [s.from, s.to]) { expect(Math.hypot(q.x - c.x, q.z - c.z)).toBeCloseTo(8); expect(q.y).toBeCloseTo(8); }
      expect(s.look).toEqual(c);
    }
    expect(shots[0].sub).toBe('hi');
    expect(shots[1].sub).toBeUndefined();
    // Consecutive segments join up.
    expect(shots[0].to).toEqual(shots[1].from);
  });
  it('clearShots lifts a shot that would pass through a building, by that building, and leaves the rest', () => {
    const boxes = [
      { min: [40, 0, -10], max: [60, 50, 10] }, // a 50 m tower across shot A's path at y 10
      { min: [500, 0, 500], max: [520, 300, 520] }, // far away
    ];
    const [a, b] = clearShots([shotA, shotB], boxes, 5);
    expect(a.lifted).toBeCloseTo(45);
    expect(a.from.y).toBeCloseTo(55);
    expect(a.to.y).toBeCloseTo(55);
    expect(a.from.x).toBe(0); // only the height changes
    expect(b.lifted).toBe(0);
    expect(b.from.y).toBe(20);
    expect(shotA.from.y).toBe(10); // the input is untouched
  });
  it('clearShots counts the margin beside a box too, so a camera does not skim a wall', () => {
    const boxes = [{ min: [40, 0, 3], max: [60, 30, 20] }]; // beside the path (z 0), within 5 m
    const [a] = clearShots([shotA], boxes, 5);
    expect(a.lifted).toBeCloseTo(25);
    const [far] = clearShots([shotA], [{ min: [40, 0, 6], max: [60, 30, 20] }], 5);
    expect(far.lifted).toBe(0);
  });
  it('checkShots enforces the house rules: 2.5 to 6 s a shot, under 14 s in all, above ground', () => {
    expect(checkShots([shotA, shotB])).toEqual([]);
    expect(checkShots([{ ...shotA, dur: 1 }])[0]).toMatch(/runs 1 s/);
    expect(checkShots([{ ...shotA, dur: 6 }, { ...shotB, dur: 6 }, { ...shotB, dur: 5 }])[0]).toMatch(/total 17/);
    expect(checkShots([{ ...shotA, from: P(0, -2, 0) }])[0]).toMatch(/under the ground/);
    expect(checkShots([])).toEqual(['no shots']);
  });
});
