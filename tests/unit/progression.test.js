import { describe, it, expect } from 'vitest';
import { SKILLS, TREES, SUITS, MODS, GADGET_COST, CONTENT_TOKENS, POWERS, levelFor, xpToNext, grantXp, learn, canLearn, skillEffects, MAX_LEVEL } from '../../src/progress/progression.js';
import { GADGETS } from '../../src/combat/gadgets.js';
import { newSave, TOKEN_TYPES } from '../../src/core/save.js';
import { DEFAULTS } from '../../src/physics/constants.js';

describe('progression', () => {
  it('three trees of fifteen skills, each requirement earlier in its own tree', () => {
    for (const t of TREES) expect(SKILLS.filter((s) => s.tree === t).length).toBe(15);
    const ids = new Set(SKILLS.map((s) => s.id));
    expect(ids.size).toBe(45);
    for (const s of SKILLS) {
      if (!s.req) continue;
      const r = SKILLS.find((x) => x.id === s.req);
      expect(r.tree).toBe(s.tree);
      expect(r.level).toBeLessThanOrEqual(s.level);
    }
  });
  it('traversal skills only touch real physics parameters that exist', () => {
    for (const s of SKILLS) if (s.effect.k) expect(DEFAULTS[s.effect.k]).toBeTypeOf('number');
  });
  it('level 50 is reachable and a skill point comes with each level', () => {
    const save = newSave();
    let total = 0;
    for (let n = 1; n < MAX_LEVEL; n++) total += xpToNext(n);
    grantXp(save, total);
    expect(save.progress.level).toBe(50);
    expect(save.progress.skillPoints).toBe(49);
    expect(levelFor(total + 999999).level).toBe(50);
  });
  it('a skill needs points, the level and its requirement', () => {
    const save = newSave();
    expect(canLearn(save, 'momentum')).toBe(false);
    save.progress.skillPoints = 3;
    expect(learn(save, 'longWebs')).toBe(false);
    expect(learn(save, 'momentum')).toBe(true);
    save.progress.level = 2;
    expect(learn(save, 'longWebs')).toBe(true);
    const fx = skillEffects(save.progress.skills);
    expect(fx.tune.cruiseSpeed).toBe(3);
    expect(fx.tune.webMax).toBe(10);
  });
  it('24 suits, 6 powers, 12 mods; every suit power exists', () => {
    expect(SUITS.length).toBe(24);
    expect(POWERS.length).toBe(6);
    expect(MODS.length).toBe(12);
    for (const s of SUITS) if (s.power) expect(POWERS.some((p) => p.id === s.power)).toBe(true);
  });
  it('the economy: everything can be bought with what 100% completion pays out', () => {
    const need = Object.fromEntries(TOKEN_TYPES.map((t) => [t, 0]));
    const add = (cost) => { for (const [k, v] of Object.entries(cost)) need[k] += v; };
    for (const s of SUITS) add(s.cost);
    for (const m of MODS) add(m.cost);
    for (let i = 0; i < GADGETS.length; i++) { add(GADGET_COST[2]); add(GADGET_COST[3]); }
    for (const t of TOKEN_TYPES) expect(need[t]).toBeLessThanOrEqual(CONTENT_TOKENS[t]);
  });
});
