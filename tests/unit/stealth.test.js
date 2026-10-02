import { describe, it, expect } from 'vitest';
import { sees, perceive, takedownKind, patrolWant, loopRoute, STEALTH } from '../../src/combat/stealth.js';

const guard = (x = 0, z = 0, facing = 0) => ({ stealth: true, alerted: false, alive: true, state: 'idle', facing, body: { p: { x, y: 0.9, z } }, suspicion: 0 });
const hero = (x, y, z, state = 'ground') => ({ state, body: { p: { x, y, z } } });

describe('stealth senses', () => {
  it('sees ahead in the cone, not behind, not past the range', () => {
    const g = guard(0, 0, 0); // facing +z
    expect(sees(g, { x: 0, y: 0.9, z: 10 })).toBe(true);
    expect(sees(g, { x: 0, y: 0.9, z: -10 })).toBe(false);
    expect(sees(g, { x: 0, y: 0.9, z: STEALTH.range + 1 })).toBe(false);
    // Point blank is noticed whatever the angle.
    expect(sees(g, { x: 0, y: 0.9, z: -2 })).toBe(true);
  });
  it('walls block the view', () => {
    expect(sees(guard(), { x: 0, y: 0.9, z: 10 }, () => false)).toBe(false);
  });
  it('a perch high above is seen at half range and only at shallow angles', () => {
    const g = guard();
    expect(sees(g, { x: 0, y: 20, z: 15 })).toBe(false); // above half range
    expect(sees(g, { x: 0, y: 8, z: 3.5 })).toBe(false); // too steep to look at
  });
  it('suspicion fills while seen and an alarm follows; it drains when you hide', () => {
    const g = guard();
    const h = hero(0, 0.9, 6);
    let out = null;
    for (let i = 0; i < 200 && !out; i++) out = perceive(g, h, 1 / 30);
    expect(out).toBe('alarm');
    const g2 = guard(); g2.suspicion = 0.5;
    perceive(g2, hero(0, 0.9, -15), 1);
    expect(g2.suspicion).toBeCloseTo(0.5 - STEALTH.fall, 5);
  });
  it('a noise close by spikes the meter', () => {
    const g = guard();
    perceive(g, hero(0, 0.9, -15), 0.01, null, { x: 3, y: 0.9, z: -3 });
    expect(g.suspicion).toBeGreaterThan(0.45);
  });
});

describe('takedowns', () => {
  it('ground takedown from behind, not from in front once wary', () => {
    const g = guard(0, 0, 0);
    expect(takedownKind(g, hero(0, 0.9, -1.8))).toBe('ground');
    g.suspicion = 0.6;
    expect(takedownKind(g, hero(0, 0.9, 1.8))).toBe(null);
  });
  it('perch takedown from above, hang takedown right overhead', () => {
    const g = guard();
    expect(takedownKind(g, hero(3, 8, 3, 'wall'))).toBe('perch');
    expect(takedownKind(g, hero(0.5, 4, 0.5, 'hang'))).toBe('hang');
  });
  it('no takedown on someone already alerted', () => {
    const g = guard(); g.alerted = true;
    expect(takedownKind(g, hero(0, 0.9, -1.5))).toBe(null);
  });
});

describe('patrols', () => {
  it('walks to the next point, pauses there, then moves on', () => {
    const g = guard(0, 0); g.patrol = [{ x: 0, z: 10 }, { x: 10, z: 10 }];
    const w = patrolWant(g, 0.1);
    expect(w.vz).toBeGreaterThan(0);
    g.body.p.z = 10;
    patrolWant(g, STEALTH.pause + 0.1);
    expect(g.pi).toBe(1);
    expect(loopRoute(0, 0, 5, 4)).toHaveLength(4);
  });
});
