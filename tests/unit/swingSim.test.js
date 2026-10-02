import { describe, it, expect } from 'vitest';
import { makeWorld, battery } from '../../scripts/swing-sim.mjs';

// The whole swing system end to end (controller + anchor search + rope) in the real test city,
// driven by the same human-like bot as scripts/swing-sim.mjs. Guards swing quality against
// regressions: most runs stay off the street, and they move.
describe('swing battery', () => {
  const { world } = makeWorld();
  for (const gravity of ['comic', 'real']) {
    it(`swings through Midtown cleanly (${gravity} gravity)`, () => {
      const rs = battery(world, { trials: 12, seconds: 16, gravity, seed: 41 });
      const clean = rs.filter((r) => r.groundSteps === 0).length;
      const avgKmh = (rs.reduce((s, r) => s + r.avg, 0) / rs.length) * 3.6;
      expect(clean).toBeGreaterThanOrEqual(10);
      expect(avgKmh).toBeGreaterThan(60);
    });
  }
});
