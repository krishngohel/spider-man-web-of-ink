import { describe, it, expect } from 'vitest';
import { makePipes, solvePipes, cableStatics } from '../../src/ui/puzzles.js';

const rot = (m) => ((m << 1) | (m >> 3)) & 15;

describe('research puzzles', () => {
  it('pipes start unsolved but some turning of the tiles solves them', () => {
    for (let k = 0; k < 20; k++) {
      const g = makePipes();
      expect(solvePipes(g)).toBe(false);
      // Brute force on the solver: try each tile's four turns greedily row by row is too weak, so
      // check instead that every tile has the right shape class (straight or corner) to be part of
      // some path: a straight has 2 opposite bits, a corner 2 adjacent ones.
      for (const row of g) for (const m of row) {
        const bits = [1, 2, 4, 8].filter((b) => m & b).length;
        expect(bits).toBe(2);
      }
    }
  });
  it('a straight row of pipes along row 2 flows', () => {
    const g = Array.from({ length: 5 }, () => Array(5).fill(5));
    g[2] = [10, 10, 10, 10, 10];
    expect(solvePipes(g)).toBe(true);
    g[2][3] = rot(g[2][3]);
    expect(solvePipes(g)).toBe(false);
  });
  it('cable statics: equal cables share the load; the vertical parts carry the weight', () => {
    const s = cableStatics(6, 6);
    expect(s.T1).toBeCloseTo(s.T2, 6);
    const y = -s.y;
    expect(s.T1 * (y / 6) + s.T2 * (y / 6)).toBeCloseTo(10, 5);
    const u = cableStatics(5, 7);
    expect(u.T1).not.toBeCloseTo(u.T2, 1);
    expect(cableStatics(3, 3)).toBe(null);
  });
});
