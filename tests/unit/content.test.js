import { describe, it, expect } from 'vitest';
import { buildCity, LAND } from '../../src/world/city.js';
import { buildCatalog, contentTokens, medalFor, BACKPACKS, PHOTOS, TAGS, PIGEONS, BUGLE } from '../../src/content/catalog.js';
import { CONTENT_TOKENS } from '../../src/progress/progression.js';

const city = buildCity();
const cat = buildCatalog(city);

describe('open-world content', () => {
  it('has the spec counts', () => {
    expect(cat.backpacks).toHaveLength(BACKPACKS);
    expect(cat.photos).toHaveLength(PHOTOS);
    expect(cat.tags).toHaveLength(TAGS);
    expect(cat.pigeons).toHaveLength(PIGEONS);
    expect(cat.hideouts).toHaveLength(9);
    expect(cat.research).toHaveLength(8);
    expect(cat.challenges).toHaveLength(12);
    expect(cat.races).toHaveLength(12);
    expect(BUGLE).toHaveLength(10);
  });
  it('ids are unique and stable (the same city places the same things)', () => {
    const all = [...cat.backpacks, ...cat.photos, ...cat.tags, ...cat.pigeons, ...cat.hideouts, ...cat.research, ...cat.challenges, ...cat.races];
    expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
    const again = buildCatalog(buildCity());
    expect(again.backpacks.map((b) => [b.id, Math.round(b.x), Math.round(b.z)])).toEqual(cat.backpacks.map((b) => [b.id, Math.round(b.x), Math.round(b.z)]));
  });
  it('backpacks are spread over the districts and none sits in the water', () => {
    const per = {};
    for (const b of cat.backpacks) { per[b.district] = (per[b.district] ?? 0) + 1; expect(city.landAt(b.x, b.z)).not.toBe(LAND.water); }
    expect(Object.keys(per).length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...Object.values(per))).toBeLessThanOrEqual(9);
  });
  it('every Bugle assignment points at a photo spot', () => {
    for (const a of BUGLE) expect(cat.photos.some((p) => p.id === a.target), a.id).toBe(true);
  });
  it('courses have rings and sane medal times (ultimate < gold < silver < bronze)', () => {
    for (const c of [...cat.races, ...cat.challenges.filter((q) => q.rings)]) {
      expect(c.rings.length).toBeGreaterThan(4);
      expect(c.ultimate).toBeLessThan(c.medals[3]);
      expect(c.medals[3]).toBeLessThan(c.medals[2]);
      expect(c.medals[2]).toBeLessThan(c.medals[1]);
    }
    const c = cat.races[0];
    expect(medalFor(c.ultimate, c)).toBe(4);
    expect(medalFor(c.medals[3], c)).toBe(3);
    expect(medalFor(c.medals[1] + 50, c)).toBe(1);
  });
  it('every race and challenge has its own start, at least 15 m from any other, on open land', () => {
    const starts = [...cat.races, ...cat.challenges];
    for (let i = 0; i < starts.length; i++) {
      const a = starts[i];
      expect(city.landAt(a.x, a.z)).not.toBe(LAND.water);
      for (let j = i + 1; j < starts.length; j++) {
        const b = starts[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} and ${b.id}`).toBeGreaterThanOrEqual(15);
      }
    }
    // A race still starts on its first ring.
    for (const r of cat.races) expect([r.x, r.z]).toEqual([r.rings[0].x, r.rings[0].z]);
    // The fix moved only starts: the rest of the catalog sits where it did.
    expect(cat.challenges.filter((c) => ['tm1', 'tm7', 'tm8'].includes(c.id)).map((c) => [c.x, c.z])).toEqual([[0, -60], [960, -720], [0, 660]]);
  });
  it('pays out exactly the tokens progression is balanced against', () => {
    expect(contentTokens(cat, city.districts.map((d) => d.id))).toEqual(CONTENT_TOKENS);
  });
});
