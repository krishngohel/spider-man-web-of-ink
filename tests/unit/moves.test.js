import { describe, it, expect } from 'vitest';
import { MOVES, chooseMove, createBuffer, canChain, clipFor } from '../../src/combat/moves.js';

const base = { d: 1, dy: 0, step: 0, grounded: true, webbed: false, wallNear: false, holdT: 0, airStep: 0 };

describe('moves', () => {
  it('walks the ground string jab, cross, roundhouse, ender', () => {
    expect([0, 1, 2, 3, 4].map((step) => chooseMove({ ...base, step }).key)).toEqual(['jab', 'cross', 'round', 'ender', 'jab']);
  });
  it('lunges between 1.5 and 4 m, web strikes beyond', () => {
    expect(chooseMove({ ...base, d: 1.2 }).lunge).toBe(false);
    expect(chooseMove({ ...base, d: 3 }).lunge).toBe(true);
    expect(chooseMove({ ...base, d: 3 }).key).toBe('jab');
    expect(chooseMove({ ...base, d: 9 }).key).toBe('strike');
    expect(chooseMove({ ...base, d: 20 })).toBe(null);
  });
  it('a held attack next to the target is the launcher', () => {
    expect(chooseMove({ ...base, holdT: 0.3 }).key).toBe('launcher');
    expect(chooseMove({ ...base, holdT: 0.2 }).key).toBe('jab');
  });
  it('in the air, or at a target above, it is the air string ending in a spike', () => {
    expect([0, 1, 2, 3].map((airStep) => chooseMove({ ...base, grounded: false, airStep }).key)).toEqual(['air1', 'air2', 'air3', 'spike']);
    expect(chooseMove({ ...base, dy: 2 }).key).toBe('air1');
  });
  it('a webbed target is thrown', () => {
    expect(chooseMove({ ...base, webbed: true }).key).toBe('throw');
  });
  it('keeps a press for 0.15 s', () => {
    const b = createBuffer();
    b.press('attack', 1.0);
    expect(b.take('attack', 1.1)).toBe(true);
    expect(b.take('attack', 1.1)).toBe(false);
    b.press('attack', 2.0);
    expect(b.take('attack', 2.2)).toBe(false);
  });
  it('chains from 55% of a move', () => {
    expect(canChain(MOVES.jab, MOVES.jab.time * 0.5)).toBe(false);
    expect(canChain(MOVES.jab, MOVES.jab.time * 0.6)).toBe(true);
  });
  it('falls back to a Quaternius clip until the combat clips are loaded', () => {
    expect(clipFor(MOVES.round, new Set(['Melee_Hook']))).toBe('Melee_Hook');
    expect(clipFor(MOVES.round, new Set(['Melee_Hook', 'Kick_Round']))).toBe('Kick_Round');
  });
  it('every move lands inside its own length', () => {
    for (const [k, m] of Object.entries(MOVES)) {
      expect(m.impact, k).toBeGreaterThan(0);
      expect(m.impact, k).toBeLessThan(m.time);
    }
  });
});
