import { describe, it, expect } from 'vitest';
import { completionOf, createRewardWatch, REWARD_PAGES } from '../../src/story/rewardPages.js';
import { SITE_DEFS } from '../../src/story/sites.js';
import { newSave } from '../../src/core/save.js';

const row = (k) => ({ crimes: [k ? 6 : 0, 6], backpacks: [k ? 4 : 1, 4], photos: [k ? 2 : 0, 2], tags: [k ? 3 : 0, 3], pigeons: [k ? 2 : 0, 2], base: [k ? 1 : 0, 1], research: [k ? 1 : 0, 1] });
const medals = (m, n = 12) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, medal: m }));
const tracker = (full, gold) => ({ rows: [row(full), row(full)], challenges: medals(gold ? 3 : full ? 1 : 0), races: medals(full ? 2 : 0, 4), bugle: [{ done: full }, { done: full }], requests: [full ? 12 : 3, 12] });

describe('reward pages', () => {
  it('completion adds up every tracker line; 100% needs all of it, gold needs every challenge at gold', () => {
    const none = completionOf(tracker(false, false));
    expect(none.percent).toBeLessThan(20);
    expect(none.allGold).toBe(false);
    const full = completionOf(tracker(true, false));
    expect(full.percent).toBe(100);
    expect(full.done).toBe(full.total);
    expect(full.allGold).toBe(false);
    expect(completionOf(tracker(true, true)).allGold).toBe(true);
    // Eleven golds and a silver is not all gold.
    const t = tracker(true, true); t.challenges[4].medal = 2;
    expect(completionOf(t).allGold).toBe(false);
    expect(completionOf({}).percent).toBe(0);
  });
  it('the watch names each page once, after it is marked seen', () => {
    const save = newSave(1);
    let tr = tracker(true, true);
    const w = createRewardWatch({ save, tracker: () => tr });
    expect(w.tick(0.5)).toBe('hundred');
    expect(w.tick(0.5)).toBe(null); // not yet two seconds on
    w.seen('hundred');
    expect(w.tick(2)).toBe('gold');
    w.seen('gold');
    expect(w.tick(2)).toBe(null);
    expect(save.story.choices).toEqual({ reward100: true, rewardGold: true });
    tr = tracker(false, false);
    expect(createRewardWatch({ save: newSave(2), tracker: () => tr }).tick(3)).toBe(null);
  });
  it('the pages stand at real sites, with a hero or a caption on every panel', () => {
    for (const [k, p] of Object.entries(REWARD_PAGES)) {
      expect(p.pages.length, k).toBeGreaterThan(0);
      for (const pg of p.pages) for (const pn of pg.panels) {
        expect(SITE_DEFS[pn.shot.at], `${k} ${pn.shot.at}`).toBeTruthy();
        expect(!!pn.caption || !!pn.balloons?.length, k).toBe(true);
      }
    }
  });
});
