import { describe, it, expect } from 'vitest';
import { CLIP_DATA } from '../../src/combat/clipData.js';

describe('combat clips', () => {
  it('has the five mocap kicks', () => {
    for (const k of ['Kick_Front', 'Kick_Round', 'Kick_Spin', 'Kick_Flying', 'Knee_Strike']) expect(CLIP_DATA[k]).toBeTruthy();
  });
  it('every clip lands inside itself and carries a root track per frame', () => {
    for (const [name, c] of Object.entries(CLIP_DATA)) {
      expect(c.contact, name).toBeGreaterThan(0);
      expect(c.contact, name).toBeLessThan(c.duration);
      expect(c.root.length, name).toBe(2 * (Math.round(c.duration * c.fps) + 1));
    }
  });
});
