import { createRng } from '../core/rng.js';
import { LAND } from './city.js';

// Street furniture as plain data: lamp posts along the sidewalks, traffic lights at the corners,
// parked cars (yellow cabs among them) at the kerbs, street trees and hydrants. Its own generator,
// so it never re-rolls the buildings. Cars are solid (you can land on one); the rest is visual.
// Placement follows the city's grid and land map: city streets get the full set, Queens gets
// trees and the odd parked car, parks and water get nothing.

export const CAR_COLORS = [0xf2c230, 0xf2c230, 0xd8392b, 0x2a5fb0, 0xeeeeea, 0x2b2b33, 0x3f8f5a, 0xf2c230];

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
  return { lamps, lights, cars, trees, hydrants };
}

// Collision boxes for the cars (body and cabin as one box).
export function carBoxes(props) {
  return props.cars.map((c) => {
    const along = Math.abs(Math.cos(c.yaw)) > 0.5; // yaw 0 / pi: car runs along z
    const hx = along ? 0.95 : 2.2, hz = along ? 2.2 : 0.95;
    return { min: [c.x - hx, 0, c.z - hz], max: [c.x + hx, 1.5, c.z + hz], kind: 'car', district: 'street', style: 20 };
  });
}
