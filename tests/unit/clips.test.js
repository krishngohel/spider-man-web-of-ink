import { describe, it, expect } from 'vitest';
import { CLIP_DATA } from '../../src/combat/clipData.js';
import { MOVES, clipTiming, clipFor } from '../../src/combat/moves.js';
import { CLIPS } from '../../scripts/mixamo-clips.mjs';

describe('combat clips', () => {
  it('has the five mocap kicks', () => {
    for (const k of ['Kick_Front', 'Kick_Round', 'Kick_Spin', 'Kick_Flying', 'Knee_Strike']) expect(CLIP_DATA[k]).toBeTruthy();
  });
  it('every move clip lands inside itself, inside the window the move plays', () => {
    for (const M of Object.values(MOVES)) {
      for (const name of M.clips) {
        const c = CLIP_DATA[name];
        expect(c, name).toBeTruthy();
        expect(c.contact, name).toBeGreaterThan(0);
        expect(c.contact, name).toBeLessThan(c.duration);
        const tm = clipTiming(name, c.duration);
        expect(tm.start, name).toBeLessThan(tm.contact);
        expect(tm.end, name).toBeGreaterThan(tm.contact);
      }
    }
  });
  it('carries a root track per frame, except the loops (no root motion)', () => {
    for (const [name, c] of Object.entries(CLIP_DATA)) {
      const loop = (CLIPS.combat[name]?.[1] ?? '').includes('%loop');
      expect(c.root.length, name).toBe(loop ? 0 : 2 * (Math.round(c.duration * c.fps) + 1));
    }
  });
  it('a move takes its loaded clips in turn', () => {
    const have = new Set(['Lead_Jab', 'Quad_Punch']);
    expect([0, 1, 2].map((n) => clipFor(MOVES.jab, have, n))).toEqual(['Lead_Jab', 'Quad_Punch', 'Lead_Jab']);
    expect(clipFor(MOVES.jab, new Set(), 3)).toBe('Punch_Jab');
  });
  it('every combat and social clip name is unique', () => {
    const names = [...Object.keys(CLIPS.combat), ...Object.keys(CLIPS.social)];
    expect(new Set(names).size).toBe(names.length);
  });
});
