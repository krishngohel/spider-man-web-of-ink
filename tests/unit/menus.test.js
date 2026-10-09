import { describe, it, expect } from 'vitest';
import { slotSummary, storyPercent } from '../../src/ui/slots.js';
import { newSave } from '../../src/core/save.js';
import { STEPS } from '../../src/story/steps.js';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../../src/core/settings.js';
import { COPY } from '../../src/ui/copy.js';

describe('title continue and slots', () => {
  it('a new save is in the prologue at 0%', () => {
    const s = slotSummary(newSave(2));
    expect(s.percent).toBe(0);
    expect(s.where).toMatch(/\w/);
  });
  it('percent follows the story steps done', () => {
    const sv = newSave(1);
    sv.story.done = STEPS.slice(0, Math.floor(STEPS.length / 2)).map((q) => q.id);
    sv.story.step = STEPS[Math.floor(STEPS.length / 2)].id;
    expect(storyPercent(sv)).toBeGreaterThanOrEqual(49);
    expect(storyPercent(sv)).toBeLessThanOrEqual(51);
  });
  it('a finished story reads 100%', () => {
    const sv = newSave(1);
    sv.story.done = STEPS.map((q) => q.id);
    sv.story.step = 'done';
    expect(storyPercent(sv)).toBe(100);
  });
  it('continue line reads slot, place and percent', () => {
    expect(COPY.continueSub(2, 'Act 1: Power Lines', 40)).toBe('Slot 2, Act 1: Power Lines, 40%');
  });
});

describe('settings: tutorial tips', () => {
  it('on by default, kept when off, junk falls back', () => {
    expect(DEFAULT_SETTINGS.tips).toBe(true);
    expect(sanitizeSettings({ tips: false }).tips).toBe(false);
    expect(sanitizeSettings({ tips: 'no' }).tips).toBe(true);
  });
  it("what's new has plain short lines", () => {
    expect(COPY.whatsNew.items.length).toBeGreaterThan(4);
    for (const t of COPY.whatsNew.items) expect(t.length).toBeLessThan(170);
  });
});
