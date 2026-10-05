import { describe, it, expect } from 'vitest';
import { pickTarget, pickMeleeTarget, canAttack, hitDamage, isActive, windupFor, ARCHETYPES, MAX_ATTACKERS } from '../../src/combat/enemies.js';
import { GADGETS } from '../../src/combat/gadgets.js';

const E = (id, x, z, state = 'engage', arch = 'brawler') => ({ id, arch, A: ARCHETYPES[arch], state, alive: true, body: { p: { x, y: 0.9, z } }, facing: 0, shieldBroken: false });

describe('combat rules', () => {
  it('targets the enemy the camera points at, not just the nearest', () => {
    const hero = { x: 0, y: 0.9, z: 0 };
    const ahead = E(1, 0, 6), side = E(2, 4, 0);
    expect(pickTarget(hero, { x: 0, y: 0, z: 1 }, [ahead, side]).id).toBe(1);
    expect(pickTarget(hero, { x: 1, y: 0, z: 0 }, [ahead, side]).id).toBe(2);
  });
  it('a melee press takes the thug at hand, not one down the camera line', () => {
    const hero = { x: 0, y: 0.9, z: 0 };
    const ahead = E(1, 0, 5), side = E(2, 2, 0), behind = E(3, 0, -1.2);
    const fwd = { x: 0, y: 0, z: 1 };
    expect(pickMeleeTarget(hero, fwd, [ahead, side, behind]).id).toBe(3);
    expect(pickMeleeTarget(hero, fwd, [ahead, side]).id).toBe(2);
    // Nobody within 4 m: the camera's line decides.
    expect(pickMeleeTarget(hero, fwd, [E(4, 0, 7), E(5, 7, 0)]).id).toBe(4);
  });
  it('the stick picks along its cone and keeps the current target unless another is clearly better', () => {
    const hero = { x: 0, y: 0.9, z: 0 };
    const a = E(1, 0.4, 2.6), b = E(2, -0.3, 2.4), side = E(3, 1.5, 0);
    expect(pickMeleeTarget(hero, null, [a, b, side], 14, { x: 0, z: 1 }).id).toBe(2);
    expect(pickMeleeTarget(hero, null, [a, b, side], 14, { x: 0, z: 1 }, a).id).toBe(1);
    expect(pickMeleeTarget(hero, null, [a, b, side], 14, { x: 1, z: 0 }).id).toBe(3);
    // A far thug off to the side of the stick is no web-strike target.
    expect(pickMeleeTarget(hero, { x: 0, y: 0, z: 1 }, [E(4, 4, 6), E(5, 0.5, 2)], 14, { x: 0, z: 1 }).id).toBe(5);
  });
  it('a downed thug is a target only when nobody upright is in range', () => {
    const hero = { x: 0, y: 0.9, z: 0 };
    expect(pickMeleeTarget(hero, { x: 0, y: 0, z: 1 }, [E(1, 0, 1, 'down'), E(2, 0, 3)]).id).toBe(2);
    expect(pickMeleeTarget(hero, { x: 0, y: 0, z: 1 }, [E(1, 0, 1, 'down')]).id).toBe(1);
  });
  it('never targets someone out of the fight, or out of range', () => {
    const hero = { x: 0, y: 0.9, z: 0 };
    expect(pickTarget(hero, { x: 0, y: 0, z: 1 }, [E(1, 0, 3, 'out'), E(2, 0, 4, 'webbed')])).toBe(null);
    expect(pickTarget(hero, { x: 0, y: 0, z: 1 }, [E(3, 0, 40)])).toBe(null);
    expect(isActive(E(4, 0, 0, 'stagger'))).toBe(true);
  });
  it('the director lets at most two attack at once on Amazing', () => {
    const list = [E(1, 0, 1, 'windup'), E(2, 1, 0, 'strike'), E(3, 2, 0)];
    expect(canAttack(list, MAX_ATTACKERS.amazing)).toBe(false);
    expect(canAttack(list.slice(1), MAX_ATTACKERS.amazing)).toBe(true);
    expect(canAttack(list, MAX_ATTACKERS.spectacular)).toBe(true);
  });
  it('a shield blocks hits from the front until it is broken, but not from the air', () => {
    const s = E(1, 0, 0, 'engage', 'shield');
    expect(hitDamage(s, 10, true)).toBe(0);
    expect(hitDamage(s, 10, false)).toBe(10);
    s.state = 'air';
    expect(hitDamage(s, 10, true)).toBe(10);
    const b = E(2, 0, 0);
    expect(hitDamage(b, 10, true)).toBe(10);
    b.state = 'down';
    expect(hitDamage(b, 10, true)).toBeGreaterThan(10);
  });
  it('light attacks wind up 0.7 s, heavies 1.0 s, guns keep their own', () => {
    expect(windupFor(ARCHETYPES.brawler)).toBe(0.7);
    expect(windupFor(ARCHETYPES.brute)).toBe(1.0);
    expect(windupFor(ARCHETYPES.gunner)).toBe(ARCHETYPES.gunner.windup);
  });
  it('every gadget has three levels of charges that never shrink', () => {
    expect(GADGETS.length).toBe(7);
    for (const g of GADGETS) {
      expect(g.charges.length).toBe(3);
      expect(g.charges[1]).toBeGreaterThanOrEqual(g.charges[0]);
      expect(g.charges[2]).toBeGreaterThanOrEqual(g.charges[1]);
    }
  });
});
