import { describe, it, expect } from 'vitest';
import { buildTestCity, blocks, GRID, DISTRICTS } from '../../src/world/testCity.js';
import { createWorld } from '../../src/physics/world.js';

function checksum(boxes) {
  let h = 0;
  for (const b of boxes) for (const v of [...b.min, ...b.max]) h = (h * 31 + Math.round(v * 100)) % 1000000007;
  return h;
}

describe('test city', () => {
  it('is deterministic', () => {
    const a = buildTestCity(), b = buildTestCity();
    expect(checksum(a.boxes)).toBe(checksum(b.boxes));
  });

  it('layout snapshot (update deliberately when the city changes)', () => {
    const c = buildTestCity();
    expect({ count: c.boxes.length, sum: checksum(c.boxes) }).toMatchSnapshot();
  });

  it('districts roll independently: changing one seed leaves the others alone', () => {
    const a = buildTestCity();
    const park = DISTRICTS.find((d) => d.id === 'park');
    const old = park.seed;
    park.seed = 999;
    const b = buildTestCity();
    park.seed = old;
    const mid = (c) => checksum(c.boxes.filter((x) => x.district === 'midtown'));
    expect(mid(b)).toBe(mid(a));
    const parkSum = (c) => checksum(c.boxes.filter((x) => x.district === 'park'));
    expect(parkSum(b)).not.toBe(parkSum(a));
  });

  it('keeps every avenue and street clear', () => {
    const c = buildTestCity();
    const inAvenue = (x) => {
      const r = ((x - GRID.minX) % GRID.avenueEvery + GRID.avenueEvery) % GRID.avenueEvery;
      return r < GRID.avenueWidth / 2 - 0.01 || r > GRID.avenueEvery - GRID.avenueWidth / 2 + 0.01;
    };
    for (const b of c.boxes) {
      if (b.district === 'park') continue;
      if (b.min[1] > 0) continue; // jibs and upper floors hang over nothing on the ground
      for (const x of [b.min[0] + 0.01, b.max[0] - 0.01]) expect(inAvenue(x)).toBe(false);
    }
  });

  it('spawns on a roof, clear of geometry', () => {
    const c = buildTestCity();
    const w = createWorld();
    for (const b of c.boxes) w.addBox(b);
    w.build();
    expect(c.spawn.y).toBeGreaterThan(70);
    expect(w.groundHeight(c.spawn.x, c.spawn.y, c.spawn.z)).toBeCloseTo(c.spawn.y - 0.91, 3);
    expect(w.pointInside(c.spawn.x, c.spawn.y, c.spawn.z)).toBe(false);
  });

  it('has blocks covering the grid', () => {
    expect(blocks().length).toBe(8 * 14);
  });
});
