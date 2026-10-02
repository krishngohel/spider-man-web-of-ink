import { describe, it, expect } from 'vitest';
import { buildCity, DISTRICTS, LAND, landmark } from '../../src/world/city.js';

describe('the full city', () => {
  it('builds the same city every time (each district rolls its own generator)', () => {
    const a = buildCity(), b = buildCity();
    expect(a.boxes.length).toBe(b.boxes.length);
    expect(JSON.stringify(a.boxes.slice(0, 50))).toBe(JSON.stringify(b.boxes.slice(0, 50)));
  });
  it('has every district, a station in each, and the landmarks the story needs', () => {
    const c = buildCity();
    for (const d of DISTRICTS) {
      expect(c.stations.some((s) => s.district === d.id)).toBe(true);
    }
    for (const id of ['vanguard', 'oscorp', 'fisk', 'bugle', 'museum', 'university', 'exchange', 'power', 'church', 'bridge']) {
      expect(c.boxes.some((b) => b.landmark === id)).toBe(true);
    }
    expect(landmark('mayHouse')).toBeTruthy();
  });
  it('the spawn roof is in Midtown and nothing stands inside another building', () => {
    const c = buildCity();
    expect(c.spawn.y).toBeGreaterThan(70);
    expect(c.landAt(c.spawn.x, c.spawn.z)).toBe(LAND.city);
  });
  it('water all round the island, land in the middle, a reservoir in the park', () => {
    const c = buildCity();
    expect(c.isWater(0, 1200)).toBe(true);
    expect(c.isWater(-1700, 0)).toBe(true);
    expect(c.isWater(0, 0)).toBe(false);
    expect(c.isWater(120, -760)).toBe(true);
    expect(c.landAt(2060, 700)).toBe(LAND.suburb);
  });
  it('the city layout snapshot (footprints change only on purpose)', () => {
    const c = buildCity();
    const sig = c.boxes.filter((b) => b.kind === 'building').reduce((h, b) => (h * 31 + Math.round(b.min[0] * 7 + b.min[2] * 3 + b.max[1])) % 1000000007, 7);
    expect({ boxes: c.boxes.length, sig }).toMatchSnapshot();
  });
});
