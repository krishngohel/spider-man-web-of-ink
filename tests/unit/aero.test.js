import { describe, it, expect } from 'vitest';
import { createBody, applyDv, SOURCES } from '../../src/physics/ledger.js';
import { applyGravity, applyDrag, applyBodyLift, applyGlide, dragK } from '../../src/physics/aero.js';
import { G, tune } from '../../src/physics/constants.js';

const speed = (b) => Math.hypot(b.v.x, b.v.y, b.v.z);
const dt = 1 / 240;

describe('ledger', () => {
  it('rejects a non-physical source', () => {
    const b = createBody();
    expect(() => applyDv(b, 'magic', 0, 1, 0)).toThrow();
  });
  it('logged changes add up to the total change', () => {
    const b = createBody();
    applyDv(b, 'gravity', 0, -1, 0); applyDv(b, 'rope', 2, 0, 1); applyDv(b, 'surface', -1, 3, 0);
    const sum = SOURCES.reduce((a, s) => ({ x: a.x + b.log[s].x, y: a.y + b.log[s].y, z: a.z + b.log[s].z }), { x: 0, y: 0, z: 0 });
    expect(sum).toEqual(b.v);
  });
});

describe('aero', () => {
  for (const [name, g] of Object.entries(G)) {
    it(`free fall reaches 60 m/s terminal (${name})`, () => {
      const b = createBody();
      const k = dragK(g, tune.terminal);
      for (let i = 0; i < 240 * 40; i++) { applyGravity(b, g, dt); applyDrag(b, k, dt); }
      expect(speed(b)).toBeGreaterThan(59.4);
      expect(speed(b)).toBeLessThan(60.6);
    });
    it(`dive reaches 85 m/s terminal (${name})`, () => {
      const b = createBody();
      const k = dragK(g, tune.diveTerminal);
      for (let i = 0; i < 240 * 80; i++) { applyGravity(b, g, dt); applyDrag(b, k, dt); }
      expect(speed(b)).toBeGreaterThan(84.1);
      expect(speed(b)).toBeLessThan(85.9);
    });
  }
  it('body lift turns the velocity without changing its size', () => {
    const b = createBody();
    b.v.z = 40;
    for (let i = 0; i < 240; i++) applyBodyLift(b, 1, 0, 1, dt);
    expect(Math.abs(speed(b) - 40) / 40).toBeLessThan(0.005);
    expect(b.v.x).toBeGreaterThan(4);
  });
  it('web wings settle to a 3.5 glide ratio at neutral pitch', () => {
    const b = createBody();
    b.v.z = 20;
    const g = G.comic;
    for (let i = 0; i < 240 * 30; i++) { applyGravity(b, g, dt); applyGlide(b, 0, 0, dt); }
    const ratio = Math.hypot(b.v.x, b.v.z) / -b.v.y;
    expect(ratio).toBeGreaterThan(3.2);
    expect(ratio).toBeLessThan(3.8);
  });
  it('banking the wings turns toward the bank side', () => {
    const b = createBody();
    b.v.z = 20;
    for (let i = 0; i < 240; i++) { applyGravity(b, G.comic, dt); applyGlide(b, 0, 1, dt); }
    // Flying +z, the glider's right is -x (right-handed, y up).
    expect(b.v.x).toBeLessThan(-1);
  });
  it('web wings lose lift below the stall speed', () => {
    const slow = createBody(), fast = createBody();
    slow.v.z = 4; fast.v.z = 20;
    applyGlide(slow, 0, 0, dt); applyGlide(fast, 0, 0, dt);
    expect(slow.log.lift.y).toBeLessThan(fast.log.lift.y * 0.05);
  });
});
