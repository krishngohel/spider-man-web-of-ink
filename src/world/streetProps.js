import { createRng } from '../core/rng.js';
import { LAND } from './city.js';

// Street furniture as plain data: lamp posts along the sidewalks, traffic lights at the corners,
// parked cars (yellow cabs among them) at the kerbs, street trees and hydrants. Its own generator,
// so it never re-rolls the buildings. Cars are solid (you can land on one); the rest is visual.
// Placement follows the city's grid and land map: city streets get the full set, Queens gets
// trees and the odd parked car, parks and water get nothing.

export const CAR_COLORS = [0xf2c230, 0xf2c230, 0xd8392b, 0x2a5fb0, 0xeeeeea, 0x2b2b33, 0x3f8f5a, 0xf2c230];

// Sidewalk clutter (looks only, nothing to collide with): newspaper boxes in little rows, trash
// cans and piles of bags, mailboxes, benches and the odd phone booth, along the lamp line between
// the lamps, trees and hydrants. Its own generator, so the furniture above never re-rolls.
const NEWS = [0x2a5fb0, 0xd8392b, 0xf2c230, 0x3f8f5a, 0xeeeeea, 0x7a3a8a];
function buildClutter(lamps, seed) {
  const rng = createRng(seed);
  const out = { news: [], cans: [], bags: [], mail: [], benches: [], booths: [] };
  for (const l of lamps) {
    // Two free spots per lamp gap: 3.5 m and 15 m past the lamp (trees stand near 9, hydrants at -6).
    for (const dz of [3.5, 15]) {
      const r = rng.next();
      const x = l.x - l.facing * 0.2, z = l.z + dz + rng.range(-0.8, 0.8);
      // facing points from the sidewalk toward the road: things face the road.
      const yaw = l.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (r < 0.2) {
        const n = rng.int(2, 4);
        for (let i = 0; i < n; i++) out.news.push({ x, z: z + i * 0.62, yaw, color: NEWS[rng.int(0, NEWS.length - 1)] });
      } else if (r < 0.42) {
        out.cans.push({ x, z, yaw });
        if (rng.chance(0.55)) out.bags.push({ x: x + l.facing * -0.1, z: z + 0.8, yaw: rng.range(0, 6.28), s: rng.range(0.8, 1.2) });
      } else if (r < 0.5) out.mail.push({ x, z, yaw });
      else if (r < 0.64) out.benches.push({ x: x - l.facing * 0.3, z, yaw });
      else if (r < 0.67) out.booths.push({ x: x - l.facing * 0.2, z, yaw });
      else if (r < 0.75) out.bags.push({ x, z, yaw: rng.range(0, 6.28), s: rng.range(0.9, 1.3) });
    }
  }
  return out;
}

export function buildStreetProps(city, seed = 9001) {
  const rng = createRng(seed);
  const lamps = [], lights = [], cars = [], trees = [], hydrants = [];
  const g = city.grid;
  const land = (x, z) => (city.landAt ? city.landAt(x, z) : LAND.city);
  const isCity = (x, z) => land(x, z) === LAND.city;
  const isSuburb = (x, z) => land(x, z) === LAND.suburb;
  const maxX = city.kind === 'full' ? 2400 : g.maxX;
  for (let ax = g.minX; ax <= maxX; ax += g.avenueEvery) {
    for (const side of [-1, 1]) {
      const kerbX = ax + side * (g.avenueWidth / 2);
      const walkX = ax + side * (g.avenueWidth / 2 + 0.9);
      for (let z = g.minZ + 14; z < g.maxZ - 10; z += 28) {
        const sz = ((z - g.minZ) % g.streetEvery + g.streetEvery) % g.streetEvery;
        if (sz < 13 || sz > g.streetEvery - 13) continue;
        if (isCity(walkX, z) && isCity(walkX + side * 8, z)) {
          lamps.push({ x: walkX, z, facing: -side });
          if (rng.chance(0.45)) trees.push({ x: walkX, z: z + 9 + rng.range(-2, 2), s: rng.range(0.85, 1.2) });
          if (rng.chance(0.18)) hydrants.push({ x: walkX, z: z - 6 });
        } else if (isSuburb(walkX, z) && rng.chance(0.7)) {
          trees.push({ x: walkX, z: z + rng.range(-4, 4), s: rng.range(0.9, 1.3) });
        }
      }
      for (let z = g.minZ + 16; z < g.maxZ - 12; z += 6.5) {
        const sz = ((z - g.minZ) % g.streetEvery + g.streetEvery) % g.streetEvery;
        if (sz < 15 || sz > g.streetEvery - 15) continue;
        const ok = isCity(kerbX, z) ? rng.chance(0.42) : isSuburb(kerbX, z) ? rng.chance(0.15) : false;
        if (!ok) continue;
        cars.push({ x: kerbX - side * 1.3, z, yaw: side > 0 ? 0 : Math.PI, color: CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)] });
      }
    }
  }
  // A traffic light on one corner of every city intersection.
  for (let ax = g.minX; ax <= maxX; ax += g.avenueEvery) {
    for (let sz = g.minZ; sz <= g.maxZ; sz += g.streetEvery) {
      const x = ax + g.avenueWidth / 2 + 0.8, z = sz + g.streetWidth / 2 + 0.8;
      if (isCity(x, z) && isCity(x + 6, z + 6)) lights.push({ x, z });
    }
  }
  return { lamps, lights, cars, trees, hydrants, clutter: buildClutter(lamps, seed + 77) };
}

// Collision boxes for the cars (body and cabin as one box).
export function carBoxes(props) {
  return props.cars.map((c) => {
    const along = Math.abs(Math.cos(c.yaw)) > 0.5; // yaw 0 / pi: car runs along z
    const hx = along ? 0.95 : 2.2, hz = along ? 2.2 : 0.95;
    return { min: [c.x - hx, 0, c.z - hz], max: [c.x + hx, 1.5, c.z + hz], kind: 'car', district: 'street', style: 20 };
  });
}
