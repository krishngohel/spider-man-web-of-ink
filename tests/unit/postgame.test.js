import { describe, it, expect } from 'vitest';
import { GAUNTLET, gauntletMedal, GAUNTLET_MEDALS, newGamePlus } from '../../src/story/gauntlet.js';
import { BOSSES } from '../../src/story/bosses/index.js';
import { SITE_DEFS } from '../../src/story/sites.js';
import { newSave } from '../../src/core/save.js';

describe('post-game', () => {
  it('the Gauntlet has all thirteen bosses, each with a module and an arena', () => {
    expect(GAUNTLET).toHaveLength(13);
    expect(new Set(GAUNTLET.map((g) => g.boss)).size).toBe(13);
    for (const g of GAUNTLET) { expect(BOSSES[g.boss], g.id).toBeTruthy(); expect(SITE_DEFS[g.site], g.id).toBeTruthy(); }
  });
  it('Gauntlet medals by total time', () => {
    expect(gauntletMedal(GAUNTLET_MEDALS.ultimate)).toBe(4);
    expect(gauntletMedal(GAUNTLET_MEDALS.gold)).toBe(3);
    expect(gauntletMedal(GAUNTLET_MEDALS.silver)).toBe(2);
    expect(gauntletMedal(99999)).toBe(1);
  });
  it('New Game+ keeps progress and collections, restarts the story, counts the cycle', () => {
    const old = newSave(2);
    old.progress.level = 30; old.progress.skills = ['a', 'b']; old.progress.suits.push('blackSuit');
    old.collect.backpacks = ['bp01']; old.story.done = ['prologue.open', 'act4.epilogue']; old.story.step = 'act4.credits';
    const s = newGamePlus(old, 2, newSave(2));
    expect(s.progress.level).toBe(30);
    expect(s.progress.suits).toContain('blackSuit');
    expect(s.collect.backpacks).toEqual(['bp01']);
    expect(s.story.done).toEqual([]);
    expect(s.story.step).toBe('prologue.open');
    expect(s.story.choices.completedOnce).toBe(true);
    expect(s.postGame.ngPlus).toBe(1);
    // The old save is untouched.
    old.progress.skills.push('c');
    expect(s.progress.skills).toEqual(['a', 'b']);
  });
});
