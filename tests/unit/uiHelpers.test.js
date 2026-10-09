import { describe, it, expect } from 'vitest';
import { placeWord, wordHalf, wordBox, centreBox } from '../../src/ui/wordPlace.js';
import { createNoticeQueue } from '../../src/ui/noticeQueue.js';
import { nextFocus } from '../../src/ui/nav.js';
import { impactFlash } from '../../src/game/impact.js';

const view = { w: 1280, h: 720 };
const hits = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

describe('sound word placement', () => {
  it('a word clear of everything stays where it was asked for', () => {
    expect(placeWord(300, 400, 120, 40, 0, view, [])).toEqual({ x: 300, y: 400 });
  });
  it('a word that would cover a HUD box moves just off it, on screen', () => {
    const objective = { left: 900, right: 1258, top: 22, bottom: 110 };
    const p = placeWord(1000, 60, 140, 44, 6, view, [objective]);
    expect(p.crowded).toBeUndefined();
    const b = wordBox(p.x, p.y, 140, 44, 6);
    expect(hits(b, objective)).toBe(false);
    expect(b.left).toBeGreaterThanOrEqual(0); expect(b.right).toBeLessThanOrEqual(view.w);
    expect(b.top).toBeGreaterThanOrEqual(0); expect(b.bottom).toBeLessThanOrEqual(view.h);
  });
  it('words asked for at the same spot never stack', () => {
    const placed = [];
    for (let i = 0; i < 6; i++) {
      const p = placeWord(400, 300, 130, 42, 0, view, placed);
      expect(p.crowded).toBeUndefined();
      const b = wordBox(p.x, p.y, 130, 42, 0);
      for (const o of placed) expect(hits(b, o)).toBe(false);
      placed.push(b);
    }
  });
  it('keeps the word on screen near the edges', () => {
    const p = placeWord(5, 710, 200, 60, 8, view, []);
    const { hw, hh } = wordHalf(200, 60, 8);
    expect(p.x - hw).toBeGreaterThan(0);
    expect(p.y + hh).toBeLessThan(view.h);
  });
  it('a full screen is flagged crowded', () => {
    expect(placeWord(640, 360, 100, 40, 0, view, [{ left: 0, right: 1280, top: 0, bottom: 720 }]).crowded).toBe(true);
  });
  it('the middle box sits on the screen centre', () => {
    const c = centreBox(view);
    expect((c.left + c.right) / 2).toBe(640);
    expect((c.top + c.bottom) / 2).toBe(360);
  });
});

describe('notice queue', () => {
  function make() {
    const log = [];
    const q = createNoticeQueue({ render: (t) => log.push(['show', t]), hide: () => log.push(['hide']), gap: 0.5 });
    return { q, log };
  }
  it('waits for play, shows for its time, then goes', () => {
    const { q, log } = make();
    q.push('slow', 2);
    q.tick(0.1, false);
    expect(log).toEqual([]);
    q.tick(0.1, true);
    expect(q.showing).toBe('slow');
    q.tick(1, true); q.tick(1.1, true);
    expect(q.showing).toBe(null);
    expect(log).toEqual([['show', 'slow'], ['hide']]);
  });
  it('steps aside when play stops and comes back with the time it had left', () => {
    const { q } = make();
    q.push('slow', 2);
    q.tick(0.1, true); q.tick(1, true);
    q.tick(5, false);
    expect(q.showing).toBe(null);
    q.tick(0.01, true);
    expect(q.showing).toBe('slow');
    q.tick(1, true);
    expect(q.showing).toBe(null);
  });
  it('one at a time, duplicates dropped, a gap between', () => {
    const { q } = make();
    q.push('a', 1); q.push('a', 1); q.push('b', 1);
    expect(q.waiting).toBe(2);
    q.tick(0.1, true); q.tick(1, true);
    expect(q.showing).toBe(null);
    q.tick(0.3, true);
    expect(q.showing).toBe(null);
    q.tick(0.3, true); q.tick(0.01, true);
    expect(q.showing).toBe('b');
  });
});

describe('menu focus by position', () => {
  const r = (left, top, w = 100, h = 40) => ({ left, top, right: left + w, bottom: top + h });
  it('a list goes up and down, and nowhere sideways', () => {
    const list = [r(0, 0, 300), r(0, 50, 300), r(0, 100, 300)];
    expect(nextFocus(list, 0, 'down')).toBe(1);
    expect(nextFocus(list, 2, 'up')).toBe(1);
    expect(nextFocus(list, 2, 'down')).toBe(-1);
    expect(nextFocus(list, 1, 'left')).toBe(-1);
  });
  it('a grid keeps to its column going down and its row going right', () => {
    const grid = [r(0, 0), r(120, 0), r(240, 0), r(0, 60), r(120, 60), r(240, 60)];
    expect(nextFocus(grid, 1, 'down')).toBe(4);
    expect(nextFocus(grid, 4, 'right')).toBe(5);
    expect(nextFocus(grid, 3, 'up')).toBe(0);
    expect(nextFocus(grid, 5, 'left')).toBe(4);
  });
  it('a full-width button above a pair goes to the left one, even on a tilted card', () => {
    const list = [r(0, 0, 400), r(0, 52, 195), r(205, 48, 195), r(2, 104, 195), r(207, 100, 195)];
    expect(nextFocus(list, 0, 'down')).toBe(1);
    expect(nextFocus(list, 1, 'down')).toBe(3);
    expect(nextFocus(list, 1, 'right')).toBe(2);
    expect(nextFocus(list, 2, 'down')).toBe(4);
  });
  it('nothing focused yet starts at the first', () => {
    expect(nextFocus([r(0, 0), r(0, 60)], -1, 'down')).toBe(0);
  });
});

describe('impact frames setting', () => {
  it('off flashes nothing, soft is shorter and dimmer than full, never the hard panel', () => {
    for (const k of ['hit', 'finisher']) {
      expect(impactFlash('off', k)).toBe(null);
      const full = impactFlash('full', k), soft = impactFlash('soft', k);
      expect(soft.ms).toBeLessThan(full.ms);
      expect(soft.strength).toBeLessThan(full.strength);
      expect(soft.soft).toBe(true);
    }
    expect(impactFlash('full', 'finisher').soft).toBe(false);
  });
});
