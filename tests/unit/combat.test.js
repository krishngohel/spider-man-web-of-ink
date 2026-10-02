import { describe, it, expect } from 'vitest';
import { pickTarget, canAttack, hitDamage, isActive, ARCHETYPES, MAX_ATTACKERS } from '../../src/combat/enemies.js';
import { GADGETS } from '../../src/combat/gadgets.js';

const E = (id, x, z, state = 'engage', arch = 'brawler') => ({ id, arch, A: ARCHETYPES[arch], state, alive: true, body: { p: { x, y: 0.9, z } }, facing: 0, shieldBroken: false });

describe('combat rules', () => {
  it('targets the enemy the camera points at, not just the nearest', () => {
    const hero = { x: 0, y: 0.9, z: 0 };
    const ahead = E(1, 0, 6), side = E(2, 4, 0);
    expect(pickTarget(hero, { x: 0, y: 0, z: 1 }, [ahead, side]).id).toBe(1);
    expect(pickTarget(hero, { x: 1, y: 0, z: 0 }, [ahead, side]).id).toBe(2);
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
  it('every gadget has three levels of charges that never shrink', () => {
    expect(GADGETS.length).toBe(7);
    for (const g of GADGETS) {
      expect(g.charges.length).toBe(3);
      expect(g.charges[1]).toBeGreaterThanOrEqual(g.charges[0]);
      expect(g.charges[2]).toBeGreaterThanOrEqual(g.charges[1]);
    }
  });
});
