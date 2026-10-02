import { createRng } from '../core/rng.js';

// The Plan 1 blockout city: about 1 x 0.8 km of avenues, streets, towers, low rises, a park and a
// harbor edge. Plain data (boxes), so the physics and the tests use it without Three.js.
//
// Each district rolls its buildings from its own seeded generator, so adding or changing one
// district never re-rolls the others (Gotham lesson: one shared rng re-rolled the whole city).

export const GRID = {
  minX: -480, maxX: 480, minZ: -420, maxZ: 420,
  avenueEvery: 120, avenueWidth: 30,
  streetEvery: 60, streetWidth: 18,
  sidewalk: 3,
};

export const DISTRICTS = [
  { id: 'midtown', name: 'Midtown', minX: -240, maxX: 240, minZ: -420, maxZ: 120, seed: 101, height: [55, 175], lots: [1, 3], setback: 0.7, roofProps: 0.35 },
  { id: 'lowrise', name: "Hell's Kitchen", minX: -480, maxX: -240, minZ: -420, maxZ: 420, seed: 202, height: [9, 24], lots: [2, 4], setback: 0, roofProps: 0.5 },
  { id: 'park', name: 'Central Park', minX: 240, maxX: 480, minZ: -420, maxZ: 120, seed: 303 },
  { id: 'harbor', name: 'Harbor', minX: -240, maxX: 480, minZ: 120, maxZ: 420, seed: 404, height: [10, 20], lots: [1, 2], setback: 0, roofProps: 0.15 },
];

export const LANDMARK = { id: 'tower', x: 0, z: -150, height: 262 };

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.minX && x < d.maxX && z >= d.minZ && z < d.maxZ) return d;
  return null;
}

// Blocks: the land between avenues (every 120 m in x) and streets (every 60 m in z).
export function blocks() {
  const out = [];
  const g = GRID;
  for (let ax = g.minX; ax < g.maxX; ax += g.avenueEvery) {
    for (let sz = g.minZ; sz < g.maxZ; sz += g.streetEvery) {
      const minX = ax + g.avenueWidth / 2, maxX = ax + g.avenueEvery - g.avenueWidth / 2;
      const minZ = sz + g.streetWidth / 2, maxZ = sz + g.streetEvery - g.streetWidth / 2;
      out.push({ minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 });
    }
  }
  return out;
}

const HARBOR_WATER_Z = 340;

export function buildTestCity() {
  const boxes = [];
  const add = (min, max, kind, district, style = 0) => boxes.push({ min, max, kind, district, style });
  const allBlocks = blocks();
  const landmarkBlock = allBlocks.reduce((best, b) => (Math.hypot(b.cx - LANDMARK.x, b.cz - LANDMARK.z) < Math.hypot(best.cx - LANDMARK.x, best.cz - LANDMARK.z) ? b : best));

  for (const d of DISTRICTS) {
    const rng = createRng(d.seed);
    d.clutterRng = createRng(d.seed * 7919 + 13);
    const mine = allBlocks.filter((b) => districtAt(b.cx, b.cz) === d);
    if (d.id === 'park') { buildPark(d, mine, rng, add); continue; }
    for (const b of mine) {
      if (b === landmarkBlock) { buildLandmark(b, add); continue; }
      if (d.id === 'harbor' && b.minZ > HARBOR_WATER_Z) continue; // the water's edge
      if (d.id === 'harbor' && rng.chance(0.25)) { buildCrane(b, rng, add, d.id); continue; }
      buildBlock(b, d, rng, add);
    }
  }

  const city = {
    boxes,
    districts: DISTRICTS,
    landmark: LANDMARK,
    waterZ: HARBOR_WATER_Z,
    bounds: { minX: GRID.minX, maxX: GRID.maxX, minZ: GRID.minZ, maxZ: GRID.maxZ },
  };
  city.spawn = pickSpawn(city);
  return city;
}

function buildBlock(b, d, rng, add) {
  const s = GRID.sidewalk;
  const x0 = b.minX + s, x1 = b.maxX - s, z0 = b.minZ + s, z1 = b.maxZ - s;
  const n = rng.int(d.lots[0], d.lots[1]);
  // Split along x into n lots with small gaps (alleys).
  const gap = n > 1 ? 4 : 0;
  const w = (x1 - x0 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const lx0 = x0 + i * (w + gap), lx1 = lx0 + w;
    const h = Math.round(rng.range(d.height[0], d.height[1]));
    const style = rng.int(0, 3);
    if (d.setback && h > 90 && rng.chance(d.setback)) {
      // Setbacks: a wide base and a narrower shaft, the classic New York tower.
      const base = Math.round(h * rng.range(0.3, 0.45));
      add([lx0, 0, z0], [lx1, base, z1], 'building', d.id, style);
      const ix = (lx1 - lx0) * rng.range(0.12, 0.2), iz = (z1 - z0) * rng.range(0.12, 0.2);
      add([lx0 + ix, base, z0 + iz], [lx1 - ix, h, z1 - iz], 'building', d.id, style);
      roofProp(lx0 + ix, lx1 - ix, z0 + iz, z1 - iz, h, d, rng, add);
    } else {
      add([lx0, 0, z0], [lx1, h, z1], 'building', d.id, style);
      roofProp(lx0, lx1, z0, z1, h, d, rng, add);
    }
  }
}

// Rooftop clutter: a stair bulkhead, air-conditioning units, a vent stack, sometimes an antenna.
// Drawn from the district's clutter generator (not the building one), so adding clutter never moves
// a building.
function roofClutter(x0, x1, z0, z1, h, d, add) {
  const rng = d.clutterRng;
  if (x1 - x0 < 8 || z1 - z0 < 8) return;
  const pick = (a, b) => rng.range(a, b);
  // Stair bulkhead near a corner.
  if (rng.chance(0.75)) {
    const cx = rng.chance(0.5) ? x0 + 2.8 : x1 - 2.8, cz = rng.chance(0.5) ? z0 + 2.8 : z1 - 2.8;
    add([cx - 1.6, h, cz - 1.6], [cx + 1.6, h + 2.6, cz + 1.6], 'prop', d.id, 15);
  }
  // Air-conditioning units in a row.
  const n = rng.int(1, 3);
  const ax = pick(x0 + 3, x1 - 5), az = pick(z0 + 3, z1 - 3);
  for (let i = 0; i < n; i++) add([ax + i * 2.2, h, az - 0.7], [ax + i * 2.2 + 1.6, h + 1.3, az + 0.7], 'prop', d.id, 14);
  // A vent stack.
  if (rng.chance(0.6)) { const vx = pick(x0 + 2, x1 - 2), vz = pick(z0 + 2, z1 - 2); add([vx - 0.35, h, vz - 0.35], [vx + 0.35, h + 1.8, vz + 0.35], 'prop', d.id, 14); }
  // A thin antenna on the taller ones.
  if (h > 80 && rng.chance(0.45)) { const tx = pick(x0 + 3, x1 - 3), tz = pick(z0 + 3, z1 - 3); add([tx - 0.12, h, tz - 0.12], [tx + 0.12, h + rng.range(8, 16), tz + 0.12], 'prop', d.id, 16); }
}

function roofProp(x0, x1, z0, z1, h, d, rng, add) {
  roofClutter(x0, x1, z0, z1, h, d, add);
  if (!rng.chance(d.roofProps) || x1 - x0 < 10 || z1 - z0 < 10) return;
  // A water tower: a tank on a short stand (one box keeps the collision simple).
  const cx = rng.range(x0 + 4, x1 - 4), cz = rng.range(z0 + 4, z1 - 4);
  add([cx - 2.2, h, cz - 2.2], [cx + 2.2, h + 7, cz + 2.2], 'prop', d.id, 9);
}

function buildLandmark(b, add) {
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const hw = (b.maxX - b.minX) / 2 - 4, hd = (b.maxZ - b.minZ) / 2 - 4;
  add([cx - hw, 0, cz - hd], [cx + hw, 70, cz + hd], 'building', 'midtown', 7);
  add([cx - hw * 0.6, 70, cz - hd * 0.75], [cx + hw * 0.6, 180, cz + hd * 0.75], 'building', 'midtown', 7);
  add([cx - hw * 0.35, 180, cz - hd * 0.45], [cx + hw * 0.35, 240, cz + hd * 0.45], 'building', 'midtown', 7);
  add([cx - 2, 240, cz - 2], [cx + 2, LANDMARK.height, cz + 2], 'building', 'midtown', 8);
}

function buildCrane(b, rng, add, district) {
  const cx = rng.range(b.minX + 10, b.maxX - 10), cz = rng.range(b.minZ + 8, b.maxZ - 8);
  const h = Math.round(rng.range(40, 60));
  add([cx - 2, 0, cz - 2], [cx + 2, h, cz + 2], 'building', district, 10);
  // The jib: a long arm out over the street.
  const len = rng.range(25, 40);
  add([cx - 3, h, cz - 1.5], [cx + len, h + 3, cz + 1.5], 'building', district, 10);
}

function buildPark(d, mine, rng, add) {
  // One big park across these blocks (no streets inside), trees only. The middle is an open
  // lawn with no anchors at all: there you run, zip or glide.
  const lawn = { minX: 300, maxX: 420, minZ: -260, maxZ: -60 };
  for (let x = d.minX + 12; x < d.maxX - 8; x += 22) {
    for (let z = d.minZ + 12; z < d.maxZ - 8; z += 22) {
      const tx = x + rng.range(-6, 6), tz = z + rng.range(-6, 6);
      const keep = rng.chance(0.55);
      if (!keep) continue;
      if (tx > lawn.minX && tx < lawn.maxX && tz > lawn.minZ && tz < lawn.maxZ) continue;
      const trunk = rng.range(6, 10), crown = rng.range(4, 6);
      add([tx - 0.5, 0, tz - 0.5], [tx + 0.5, trunk, tz + 0.5], 'tree', d.id, 11);
      add([tx - crown / 2, trunk, tz - crown / 2], [tx + crown / 2, trunk + crown * 0.8, tz + crown / 2], 'tree', d.id, 12);
    }
  }
  void mine;
}

// A roof in Midtown, about 70 to 110 m up, near the middle of the avenue grid.
function pickSpawn(city) {
  let best = null, bestD = Infinity;
  for (const b of city.boxes) {
    if (b.kind !== 'building' || b.district !== 'midtown') continue;
    const h = b.max[1];
    if (h < 70 || h > 110 || b.min[1] > 0) continue;
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const d = Math.hypot(cx - 60, cz + 40);
    if (d < bestD) { bestD = d; best = b; }
  }
  const cx = (best.min[0] + best.max[0]) / 2, cz = (best.min[2] + best.max[2]) / 2;
  return { x: cx, y: best.max[1] + 0.9 + 0.01, z: cz, yaw: 0 };
}
