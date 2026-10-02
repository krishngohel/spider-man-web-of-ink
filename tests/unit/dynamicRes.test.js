import { describe, it, expect } from 'vitest';
import { createDynamicRes, snapRefresh, sanitizeResScale } from '../../src/render/dynamicRes.js';

// Feeds `seconds` of frames spaced `dt` ms apart, with a work estimate per frame.
const run = (d, seconds, dt, busy = null) => { for (let t = 0; t < seconds * 1000; t += dt) d.update(dt, typeof busy === 'function' ? busy(t) : busy); };
const hz144 = 1000 / 144;

describe('dynamic resolution', () => {
  it('snaps measured rates to common refresh rates', () => {
    expect(snapRefresh(143.2)).toBe(144);
    expect(snapRefresh(59.4)).toBe(60);
    expect(snapRefresh(238)).toBe(240);
  });

  it('measures the refresh rate from the first frames', () => {
    const d = createDynamicRes();
    run(d, 1, hz144, 2);
    expect(d.refreshHz).toBe(144);
    expect(d.scale).toBe(1);
  });

  it('holds full scale while frames arrive on time', () => {
    const d = createDynamicRes();
    run(d, 30, hz144, 3);
    expect(d.scale).toBe(1);
  });

  it('steps down when frames miss the refresh, never below the floor', () => {
    const changes = [];
    const d = createDynamicRes({ onChange: (s) => changes.push(s) });
    run(d, 1, hz144, 3);
    run(d, 30, hz144 * 2, 12);
    expect(d.scale).toBeCloseTo(0.6);
    expect(changes.every((s, i) => i === 0 || s < changes[i - 1])).toBe(true);
  });

  it('climbs back up once frames are on time again, and does not oscillate', () => {
    const changes = [];
    const d = createDynamicRes({ onChange: (s) => changes.push(s) });
    run(d, 1, hz144, 3);
    run(d, 3, hz144 * 2, 12);
    const low = d.scale;
    expect(low).toBeLessThan(1);
    run(d, 30, hz144, 2); // plenty of headroom: back to full
    expect(d.scale).toBe(1);
    const ups = changes.filter((s, i) => i > 0 && s > changes[i - 1]).length;
    const downs = changes.filter((s, i) => i > 0 && s < changes[i - 1]).length;
    expect(ups + downs).toBe(changes.length - 1);
    expect(changes.length).toBeLessThan(20);
  });

  it('backs off its upward probes when they bring misses back', () => {
    const d = createDynamicRes();
    run(d, 1, hz144, null);
    run(d, 4, hz144 * 2, null);
    const low = d.scale;
    // Frames miss whenever the scale is above `low`: probes must get rarer, not keep pumping.
    let changes = 0, last = d.scale;
    for (let t = 0; t < 120000; t += hz144) {
      d.update(d.scale > low + 1e-6 ? hz144 * 2 : hz144, null);
      if (d.scale !== last) { changes += 1; last = d.scale; }
    }
    expect(changes).toBeLessThan(14);
  });

  it('settles when misses come from load it cannot measure', () => {
    const d = createDynamicRes();
    run(d, 1, hz144, 2);
    run(d, 4, hz144 * 2, 2);
    const low = d.scale;
    let changes = 0, last = d.scale;
    for (let t = 0; t < 120000; t += hz144) {
      d.update(d.scale > low + 1e-6 ? hz144 * 2 : hz144, 2);
      if (d.scale !== last) { changes += 1; last = d.scale; }
    }
    expect(changes).toBeLessThan(14);
    expect(d.scale).toBeLessThanOrEqual(low + 0.05 + 1e-6);
  });

  it('reports full scale when switched off', () => {
    const d = createDynamicRes();
    run(d, 1, hz144, 3);
    run(d, 5, hz144 * 2, 12);
    d.setEnabled(false);
    expect(d.scale).toBe(1);
  });
});

describe('sanitizeResScale', () => {
  it('floors the product of Render scale and dynamic resolution, not each factor alone', () => {
    // 0.5 render scale * 0.6 dynres min = 0.3, which is below the floor.
    expect(sanitizeResScale(0.5, 0.6)).toBe(0.5);
    expect(sanitizeResScale(0.5, 0.5)).toBe(0.5);
  });
  it('leaves the product alone once it clears the floor', () => {
    expect(sanitizeResScale(1, 0.8)).toBeCloseTo(0.8);
    expect(sanitizeResScale(0.8, 0.8)).toBeCloseTo(0.64);
    expect(sanitizeResScale(1, 1)).toBe(1);
  });
  it('accepts a custom floor', () => {
    expect(sanitizeResScale(0.5, 0.5, 0.3)).toBeCloseTo(0.3);
    expect(sanitizeResScale(0.6, 0.6, 0.3)).toBeCloseTo(0.36);
  });
});

describe('capTo (the browser holding the page to a lower rate)', () => {
  it('stops judging 30 fps frames as misses and goes back to full sharpness', () => {
    const scales = [];
    const d = createDynamicRes({ onChange: (s) => scales.push(s) });
    for (let i = 0; i < 90; i++) d.update(16.7);           // a 60 Hz display
    for (let i = 0; i < 400; i++) d.update(33.3);          // then capped at 30: it drops resolution
    expect(d.scale).toBeLessThan(1);
    d.capTo(30);
    expect(d.scale).toBe(1);
    for (let i = 0; i < 400; i++) d.update(33.3);          // judged against 30 now: no more drops
    expect(d.scale).toBe(1);
  });
});

describe('aiming for a steady refresh, not "mostly on time"', () => {
  const hz60 = 1000 / 60;
  // One second at 60 Hz where `late` of every 100 frames misses a refresh (arrives a frame late).
  const second = (d, late) => { for (let i = 0; i < 100; i++) d.update(late && i % Math.round(100 / late) === 0 ? hz60 * 2 : hz60); };
  it('steps down when one frame in twelve is late (about 55 fps), which it used to tolerate', () => {
    const d = createDynamicRes({ missLimit: 0.03 });
    for (let i = 0; i < 2; i++) second(d, 0); // learn the refresh, settle
    for (let i = 0; i < 4; i++) second(d, 8);
    expect(d.scale).toBeLessThan(1);
    // The old 10% allowance sat at full scale through the same judder.
    const old = createDynamicRes();
    for (let i = 0; i < 2; i++) second(old, 0);
    for (let i = 0; i < 4; i++) second(old, 8);
    expect(old.scale).toBe(1);
  });
  it('ignores the odd late frame', () => {
    const d = createDynamicRes({ missLimit: 0.03 });
    for (let i = 0; i < 2; i++) second(d, 0);
    for (let i = 0; i < 10; i++) second(d, 1);
    expect(d.scale).toBe(1);
  });
  it('can start below full resolution and climbs to full when there is headroom', () => {
    const changes = [];
    const d = createDynamicRes({ start: 0.8, onChange: (s) => changes.push(s) });
    expect(d.scale).toBeCloseTo(0.8);
    for (let i = 0; i < 30; i++) second(d, 0);
    expect(d.scale).toBe(1);
    expect(changes.every((s, i) => i === 0 || s > changes[i - 1])).toBe(true);
  });
});
