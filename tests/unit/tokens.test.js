import { describe, it, expect } from 'vitest';
import { pickMeleeHolder, rangedSlots, airSafe, beatsToPunch, createTokens } from '../../src/combat/tokens.js';

const E = (id, x, z, o = {}) => ({ id, alive: true, state: 'engage', A: { ranged: false }, body: { p: { x, y: 0.9, z } }, ...o });
const H = { x: 0, y: 0.9, z: 0 };
const dist = (e) => Math.hypot(e.body.p.x, e.body.p.z);

describe('enemy tokens', () => {
  it('keeps the holder unless someone is 2 m closer or he is past 6 m', () => {
    const a = E(1, 3, 0), b = E(2, 2, 0), c = E(3, 0.5, 0);
    expect(pickMeleeHolder([a, b], H, a, dist)).toBe(a);
    expect(pickMeleeHolder([a, b, c], H, a, dist)).toBe(c);
    const far = E(4, 7, 0), b2 = E(5, 6.5, 0);
    expect(pickMeleeHolder([far, b2], H, far, dist)).toBe(b2); // past 6 m: handed on though not 2 m closer
    expect(pickMeleeHolder([a, b], H, null, dist)).toBe(b);
  });
  it('gives ranged slots by difficulty', () => {
    expect(rangedSlots('amazing')).toBe(1);
    expect(rangedSlots('ultimate')).toBe(3);
  });
  it('makes the air safe above 1.5 m', () => {
    expect(airSafe(2.6, 0.9)).toBe(true);
    expect(airSafe(1.9, 0.9)).toBe(false);
  });
  it('cancels a later enemy hit unless heavy, boss or a repeated move', () => {
    expect(beatsToPunch({ heroImpactIn: 0.05, enemyImpactIn: 0.2, sameMoveRun: 1 })).toBe(true);
    expect(beatsToPunch({ heroImpactIn: 0.3, enemyImpactIn: 0.2, sameMoveRun: 1 })).toBe(false);
    expect(beatsToPunch({ heroImpactIn: 0.05, enemyImpactIn: 0.2, sameMoveRun: 3 })).toBe(false);
    expect(beatsToPunch({ heroImpactIn: 0.05, enemyImpactIn: 0.2, heavy: true })).toBe(false);
    expect(beatsToPunch({ heroImpactIn: 0.05, enemyImpactIn: 0.2, boss: true })).toBe(false);
  });
  it('one melee attacker at a time, and a dodge holds everyone for 1 s', () => {
    const t = createTokens(), a = E(1, 1, 0), b = E(2, 2, 0);
    const ctx = { difficulty: 'spectacular', groundBelow: 0.9, dist };
    t.update(0.3, [a, b], H, ctx);
    expect(t.mayMelee(a)).toBe(true);
    expect(t.mayMelee(b)).toBe(false);
    t.holdAll(1.0);
    t.update(0.5, [a, b], H, ctx);
    expect(t.mayMelee(a)).toBe(false);
    t.update(0.6, [a, b], H, ctx);
    expect(t.mayMelee(a)).toBe(true);
  });
  it('no melee token while the hero is in the air', () => {
    const t = createTokens(), a = E(1, 1, 0);
    t.update(0.3, [a], { x: 0, y: 3, z: 0 }, { difficulty: 'amazing', groundBelow: 0.9, dist });
    expect(t.mayMelee(a)).toBe(false);
  });
  it('ranged slots fill up and free when the shooter stops', () => {
    const t = createTokens(), g1 = E(1, 9, 0, { A: { ranged: true } }), g2 = E(2, 10, 0, { A: { ranged: true } });
    t.update(0.1, [g1, g2], H, { difficulty: 'amazing', groundBelow: 0.9, dist });
    expect(t.mayRanged(g1)).toBe(true);
    g1.state = 'windup';
    expect(t.mayRanged(g2)).toBe(false);
    g1.state = 'recover';
    t.update(0.1, [g1, g2], H, { difficulty: 'amazing', groundBelow: 0.9, dist });
    expect(t.mayRanged(g2)).toBe(true);
  });
});
