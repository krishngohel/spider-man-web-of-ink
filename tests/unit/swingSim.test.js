import { describe, it, expect } from 'vitest';
import { makeWorld, battery, summary } from '../../scripts/swing-sim.mjs';
import { createHero, emptyIntent } from '../../src/hero/controller.js';
import { STEP } from '../../src/physics/constants.js';

// The whole swing system end to end (controller + swing anchors + swing solver) in the real test
// city, driven by a bot that holds swing and forward like a player. Guards the tuned feel against
// regressions: clean runs, cruising speed, rise and fall, no walls.
describe('swing battery', () => {
  const { world } = makeWorld();
  for (const gravity of ['comic', 'real']) {
    it(`cruises through Midtown (${gravity} gravity)`, () => {
      const s = summary(battery(world, { trials: 12, seconds: 16, gravity, seed: 41 }));
      expect(s.clean).toBe(s.runs);
      expect(s.avgKmh).toBeGreaterThan(100);
      expect(s.walls).toBeLessThan(0.5);
      expect(s.arc).toBeGreaterThan(5);
      expect(s.topKmh).toBeLessThan(260);
    });
  }

  it('turns a corner from an avenue into a street without touching anything', () => {
    for (const dir of [1, -1]) {
      const turnZ = -180;
      const h = createHero(world);
      h.place(0, 40, turnZ - 160, 0, 0, 20);
      const it = emptyIntent(); it.swing = true; it.swingPressed = true;
      let bumps = 0, turned = false;
      for (let i = 0; i < 240 * 14 && Math.abs(h.body.p.x) < 220; i++) {
        const p = h.body.p;
        if (!turned && p.z >= turnZ - 10) turned = true;
        let hx = 0, hz = 1, off = p.x, lat = h.body.v.x;
        if (turned) { hx = dir; hz = 0; off = -(p.z - turnZ) * dir; lat = -h.body.v.z * dir; }
        const steer = Math.max(-0.8, Math.min(0.8, -off * 0.05 - lat * 0.04));
        it.moveX = hx + steer * hz; it.moveZ = hz - steer * hx;
        if (h.state === 'wall' || h.state === 'ground') bumps++;
        h.step(it, STEP);
        it.swingPressed = false; h.events.length = 0;
      }
      expect(bumps).toBe(0);
      expect(Math.abs(h.body.p.x)).toBeGreaterThan(100);
      expect(Math.abs(h.body.p.z - turnZ)).toBeLessThan(20);
    }
  });
});
