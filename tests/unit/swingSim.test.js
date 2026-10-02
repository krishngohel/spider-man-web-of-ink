import { describe, it, expect } from 'vitest';
import { makeWorld, battery, summary, runBot } from '../../scripts/swing-sim.mjs';

// The whole swing system end to end (aimed webs on the real rope, assists, walls, ground) in the
// real test city, driven by a bot that aims like a skilled player. Guards the feel against
// regressions: clean runs, real speed, rise and fall, few walls.
describe('swing battery', () => {
  const { world } = makeWorld();
  for (const gravity of ['comic', 'real']) {
    it(`a skilled player swings through Midtown (${gravity} gravity)`, () => {
      const s = summary(battery(world, { trials: 12, seconds: 16, gravity, seed: 41 }));
      expect(s.clean).toBeGreaterThanOrEqual(s.runs - 1);
      expect(s.avgKmh).toBeGreaterThan(65);
      expect(s.walls).toBeLessThan(1);
      expect(s.arc).toBeGreaterThan(4);
      expect(s.topKmh).toBeLessThan(260);
    });
  }

  it('turns a corner from an avenue into a street', () => {
    for (const dir of [1, -1]) {
      const r = runBot(world, { x: 0, y: 40, z: -340, heading: 0, seconds: 14, turn: { z: -180, dir } });
      expect(r.groundSteps).toBe(0);
      expect(Math.abs(r.hero.body.p.x)).toBeGreaterThan(60);
      expect(Math.abs(r.hero.body.p.z + 180)).toBeLessThan(25);
    }
  });
});
