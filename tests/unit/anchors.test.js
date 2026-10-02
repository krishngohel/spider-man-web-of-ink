import { describe, it, expect } from 'vitest';
import { findAnchor } from '../../src/physics/anchors.js';
import { createWorld } from '../../src/physics/world.js';
import { createBody } from '../../src/physics/ledger.js';
import { createRng } from '../../src/core/rng.js';

function avenue() {
  // Two rows of towers either side of a 30 m avenue running along +z.
  const w = createWorld();
  for (let z = -200; z < 400; z += 60) {
    w.addBox({ min: [15, 0, z], max: [45, 120, z + 50] });
    w.addBox({ min: [-45, 0, z], max: [-15, 100, z + 50] });
  }
  w.build();
  return w;
}

describe('findAnchor', () => {
  it('finds a forward anchor on a facade along an avenue', () => {
    const w = avenue();
    const hero = createBody({ x: 0, y: 30, z: 0 });
    hero.v.z = 25;
    const a = findAnchor(w, hero, { dirX: 0, dirZ: 1 });
    expect(a).not.toBe(null);
    expect(a.z).toBeGreaterThan(hero.p.z);
    expect(a.y).toBeGreaterThan(hero.p.y + 5);
    expect(Math.abs(a.x)).toBeGreaterThanOrEqual(15 - 1e-6);
  });

  it('picks an anchor whose predicted swing stays clear for the next second', () => {
    const w = avenue();
    const hero = createBody({ x: 0, y: 40, z: 0 });
    hero.v.z = 22;
    const a = findAnchor(w, hero, { dirX: 0, dirZ: 1 });
    expect(a.predict.hit).toBe(Infinity);
    expect(a.predict.vz).toBeGreaterThan(10); // still heading down the avenue
  });

  it('finds nothing over open ground', () => {
    const w = createWorld();
    w.build();
    const hero = createBody({ x: 0, y: 20, z: 0 });
    expect(findAnchor(w, hero, {})).toBe(null);
  });

  it('never returns a point inside a box, and always in line of sight', () => {
    const w = avenue();
    const rng = createRng(9);
    for (let i = 0; i < 300; i++) {
      const hero = createBody({ x: rng.range(-12, 12), y: rng.range(2, 90), z: rng.range(-150, 300) });
      hero.v.x = rng.range(-10, 10); hero.v.z = rng.range(-30, 30);
      const th = rng.range(0, Math.PI * 2);
      const a = findAnchor(w, hero, { dirX: Math.cos(th), dirZ: Math.sin(th) });
      if (!a) continue;
      expect(w.pointInside(a.x, a.y, a.z, 0.01)).toBe(false);
      const dx = a.x - hero.p.x, dy = a.y - (hero.p.y + 0.6), dz = a.z - hero.p.z;
      const d = Math.hypot(dx, dy, dz);
      expect(w.lineOfSight(hero.p.x, hero.p.y + 0.6, hero.p.z, a.x - (dx / d) * 0.05, a.y - (dy / d) * 0.05, a.z - (dz / d) * 0.05)).toBe(true);
    }
  });

  it('high assist finds an anchor at least as often as off', () => {
    const w = avenue();
    const rng = createRng(11);
    let off = 0, high = 0;
    for (let i = 0; i < 200; i++) {
      const hero = createBody({ x: rng.range(-12, 12), y: rng.range(5, 80), z: rng.range(-150, 300) });
      const th = rng.range(0, Math.PI * 2);
      const o = { dirX: Math.cos(th), dirZ: Math.sin(th) };
      if (findAnchor(w, hero, { ...o, assist: 'off' })) off++;
      if (findAnchor(w, hero, { ...o, assist: 'high' })) high++;
    }
    expect(high).toBeGreaterThanOrEqual(off);
  });

  it('steers: aiming right picks an anchor on the right side', () => {
    const w = avenue();
    const hero = createBody({ x: 0, y: 30, z: 0 });
    hero.v.z = 20;
    // Facing +z, +x is to the left (y up, right-handed), -x to the right.
    const right = findAnchor(w, hero, { dirX: -1, dirZ: 0 });
    const left = findAnchor(w, hero, { dirX: 1, dirZ: 0 });
    expect(right.x).toBeLessThan(0);
    expect(left.x).toBeGreaterThan(0);
  });
});
