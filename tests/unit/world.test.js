import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/physics/world.js';
import { createBody, SOURCES } from '../../src/physics/ledger.js';
import { createRng } from '../../src/core/rng.js';

function twoTowers() {
  const w = createWorld();
  w.addBox({ min: [10, 0, -20], max: [30, 80, 20] });
  w.addBox({ min: [-30, 0, -20], max: [-10, 60, 20] });
  w.build();
  return w;
}

describe('raycast', () => {
  it('hits the facing side with an outward normal', () => {
    const w = twoTowers();
    const h = w.raycast(0, 10, 0, 1, 0, 0, 100);
    expect(h.t).toBeCloseTo(10, 6);
    expect([h.nx, h.ny, h.nz]).toEqual([-1, 0, 0]);
    expect(h.box.minX).toBe(10);
  });
  it('hits the roof from above and the ground when nothing else is in the way', () => {
    const w = twoTowers();
    const roof = w.raycast(20, 100, 0, 0, -1, 0, 200);
    expect(roof.y).toBeCloseTo(80, 6);
    expect(roof.ny).toBe(1);
    const ground = w.raycast(0, 50, 0, 0, -1, 0, 200);
    expect(ground.box).toBe(null);
    expect(ground.y).toBe(0);
  });
  it('respects maxDist and finds boxes many cells away', () => {
    const w = twoTowers();
    expect(w.raycast(0, 10, 0, 1, 0, 0, 5)).toBe(null);
    const far = createWorld();
    far.addBox({ min: [300, 0, 300], max: [320, 50, 320] });
    far.build();
    const d = Math.SQRT1_2;
    const h = far.raycast(0, 10, 0, d, 0, d, 1000);
    expect(h).not.toBe(null);
    expect(h.box.minX).toBe(300);
  });
  it('line of sight is blocked by a tower', () => {
    const w = twoTowers();
    expect(w.lineOfSight(0, 10, 0, 50, 10, 0)).toBe(false);
    expect(w.lineOfSight(0, 10, 0, 0, 10, 50)).toBe(true);
  });
});

describe('capsule', () => {
  it('rests on a roof and reports ground', () => {
    const w = twoTowers();
    const b = createBody({ x: 20, y: 80.85, z: 0 });
    b.v.y = -3;
    const c = w.resolveCapsule(b, 0.4, 0.5, {});
    expect(c.ground).toBe(true);
    expect(b.p.y).toBeCloseTo(80.9, 6);
    expect(b.v.y).toBe(0);
    expect(b.log.surface.y).toBe(3);
  });
  it('stops against a wall and keeps the sliding velocity', () => {
    const w = twoTowers();
    const b = createBody({ x: 9.7, y: 10, z: 0 });
    b.v.x = 20; b.v.z = 5;
    const c = w.resolveCapsule(b, 0.4, 0.5, {});
    expect(c.wall).toBe(true);
    expect(c.nx).toBe(-1);
    expect(b.v.x).toBe(0);
    expect(b.v.z).toBe(5);
    expect(b.p.x).toBeCloseTo(9.6, 6);
  });
  it('never ends inside a box at speeds up to 110 m/s (10,000 trajectories)', () => {
    const rng = createRng(42);
    const w = createWorld();
    for (let i = 0; i < 60; i++) {
      const x = rng.range(-200, 200), z = rng.range(-200, 200);
      const sx = rng.range(4, 30), sz = rng.range(4, 30);
      w.addBox({ min: [x, 0, z], max: [x + sx, rng.range(5, 120), z + sz] });
    }
    w.build();
    const out = {};
    const dt = 1 / 240;
    let inside = 0;
    for (let n = 0; n < 10000; n++) {
      const b = createBody({ x: rng.range(-220, 220), y: rng.range(1, 130), z: rng.range(-220, 220) });
      if (w.pointInside(b.p.x, b.p.y, b.p.z, -0.5)) continue;
      const s = rng.range(20, 110);
      const th = rng.range(0, Math.PI * 2), ph = rng.range(-1.2, 1.2);
      b.v.x = Math.cos(th) * Math.cos(ph) * s; b.v.y = Math.sin(ph) * s; b.v.z = Math.sin(th) * Math.cos(ph) * s;
      for (let i = 0; i < 120; i++) {
        const dist = Math.hypot(b.v.x, b.v.y, b.v.z) * dt;
        const parts = Math.max(1, Math.ceil(dist / 0.3));
        for (let k = 0; k < parts; k++) {
          b.p.x += b.v.x * dt / parts; b.p.y += b.v.y * dt / parts; b.p.z += b.v.z * dt / parts;
          w.resolveCapsule(b, 0.4, 0.5, out);
        }
      }
      if (w.pointInside(b.p.x, b.p.y, b.p.z, 0.01)) inside++;
    }
    expect(inside).toBe(0);
  });
  it('only ever changes velocity through surface pushes', () => {
    const w = twoTowers();
    const b = createBody({ x: 9.7, y: 0.85, z: 0 });
    b.v.x = 10; b.v.y = -2;
    w.resolveCapsule(b, 0.4, 0.5, {});
    for (const s of SOURCES) if (s !== 'surface') expect(b.log[s]).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('groundHeight', () => {
  it('finds the roof under a point above it and the street elsewhere', () => {
    const w = twoTowers();
    expect(w.groundHeight(20, 100, 0)).toBe(80);
    expect(w.groundHeight(0, 100, 0)).toBe(0);
  });
});
