import { createRng } from '../core/rng.js';

// The full city (spec section 5): a fictional comic Manhattan about 3 x 2 km in nine districts,
// a Queens island across a suspension bridge, and hand-placed landmarks. Plain data (boxes plus a
// land map), so physics, tests and the renderer share it without Three.js.
//
// Each district rolls from its own seeded generators (one for buildings, one for clutter), so a
// change in one district never re-rolls another (Gotham lesson). The test city (testCity.js)
// stays as it was for the physics tests and the swing bots.

export const GRID = {
  minX: -1560, maxX: 1560, minZ: -1020, maxZ: 1020,
  avenueEvery: 120, avenueWidth: 30,
  streetEvery: 60, streetWidth: 18,
  sidewalk: 3,
};

// The island. Outside it (and outside Queens) is water.
export const ISLAND = { minX: -1500, maxX: 1500, minZ: -1000, maxZ: 1000, corner: 90 };
export const QUEENS = { minX: 1770, maxX: 2370, minZ: 420, maxZ: 980, corner: 60 };

// Land map: one cell per LAND_CELL metres over the whole playable area.
export const LAND_CELL = 10;
export const LAND_BOUNDS = { minX: -1800, maxX: 2600, minZ: -1300, maxZ: 1300 };
export const LAND = { water: 0, city: 1, park: 2, plaza: 3, pier: 4, yard: 5, suburb: 6 };

// Building styles (the facade shader reads these): 0 brick, 1 sandstone, 2 glass, 3 concrete,
// 7 limestone, 8 deco, 17 brownstone, 18 sign, 19 warehouse, 21 house, 22 classical, 23 industrial,
// 24 dark glass, 25 painted steel, 26 container, 27 subway kiosk. Props: 9 water tower, 10 crane,
// 11 trunk, 12 crown, 13 cornice, 14 vent and AC, 15 bulkhead, 16 antenna, 20 parked car.
const ROWS = { N: [-1000, -450], M: [-450, 330], S: [330, 1000] };
const COLS = { W: [-1500, -480], C: [-480, 480], E: [480, 1500] };
const area = (c, r) => ({ minX: COLS[c][0], maxX: COLS[c][1], minZ: ROWS[r][0], maxZ: ROWS[r][1] });

export const DISTRICTS = [
  { id: 'midtown', name: 'Midtown', ...area('C', 'M'), seed: 101, height: [55, 175], lots: [1, 3], setback: 0.7, roofProps: 0.35, styles: [0, 1, 2, 3, 7, 8] },
  { id: 'hells', name: "Hell's Kitchen", ...area('W', 'M'), seed: 202, height: [9, 32], lots: [2, 4], setback: 0, roofProps: 0.5, styles: [0, 0, 3, 17, 0] },
  { id: 'park', name: 'Central Park', ...area('C', 'N'), seed: 303 },
  { id: 'harbor', name: 'Harbor', ...area('E', 'S'), seed: 404, height: [10, 24], lots: [1, 2], setback: 0, roofProps: 0.2, styles: [19, 19, 0, 23] },
  { id: 'neon', name: 'Neon Square', ...area('E', 'M'), seed: 505, height: [40, 130], lots: [1, 3], setback: 0.4, roofProps: 0.2, styles: [2, 3, 8, 7] },
  { id: 'financial', name: 'Financial District', ...area('C', 'S'), seed: 606, height: [70, 220], lots: [1, 2], setback: 0.8, roofProps: 0.25, styles: [7, 8, 2, 1, 24] },
  { id: 'harlem', name: 'Harlem', ...area('W', 'N'), seed: 707, height: [10, 26], lots: [3, 5], setback: 0, roofProps: 0.55, styles: [17, 17, 0, 1] },
  { id: 'chinatown', name: 'Chinatown', ...area('W', 'S'), seed: 808, height: [8, 24], lots: [3, 6], setback: 0, roofProps: 0.4, styles: [0, 17, 3, 0] },
  { id: 'upper', name: 'Upper East Side', ...area('E', 'N'), seed: 909, height: [25, 95], lots: [1, 3], setback: 0.4, roofProps: 0.4, styles: [1, 7, 0, 3] },
  { id: 'queens', name: 'Queens', minX: QUEENS.minX, maxX: QUEENS.maxX, minZ: QUEENS.minZ, maxZ: QUEENS.maxZ, seed: 1010, height: [6, 9], styles: [21] },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.minX && x < d.maxX && z >= d.minZ && z < d.maxZ) return d;
  return null;
}

// Rounded-rectangle test (the shorelines).
function inRound(r, x, z, margin = 0) {
  const minX = r.minX + margin, maxX = r.maxX - margin, minZ = r.minZ + margin, maxZ = r.maxZ - margin;
  if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
  const c = r.corner;
  const cx = Math.max(minX + c, Math.min(maxX - c, x)), cz = Math.max(minZ + c, Math.min(maxZ - c, z));
  return Math.hypot(x - cx, z - cz) <= c;
}
export const onIsland = (x, z, margin = 0) => inRound(ISLAND, x, z, margin);
export const onQueens = (x, z, margin = 0) => inRound(QUEENS, x, z, margin);

// Park features (land map and generator agree on these).
export const RESERVOIR = { cx: 120, cz: -760, rx: 170, rz: 95 };
export const ZOO = { minX: -420, maxX: -230, minZ: -580, maxZ: -470 };
export const NEON_PLAZA = { minX: 690, maxX: 750, minZ: -330, maxZ: 150 };
// The West Side rail yard in Hell's Kitchen (Rhino's last stand): two blocks and the street
// between them, gravel and track, freight cars and container stacks.
export const RAILYARD = { minX: -1425, maxX: -1335, minZ: -51, maxZ: 51 };
const inYard = (x, z) => x > RAILYARD.minX && x < RAILYARD.maxX && z > RAILYARD.minZ && z < RAILYARD.maxZ;
const inReservoir = (x, z) => ((x - RESERVOIR.cx) / RESERVOIR.rx) ** 2 + ((z - RESERVOIR.cz) / RESERVOIR.rz) ** 2 < 1;

// Blocks: the land between avenues and streets (the island grid, or Queens' with its x range).
export function blocks(minX = GRID.minX, maxX = GRID.maxX) {
  const out = [];
  const g = GRID;
  for (let ax = minX; ax < maxX; ax += g.avenueEvery) {
    for (let sz = g.minZ; sz < g.maxZ; sz += g.streetEvery) {
      const minX = ax + g.avenueWidth / 2, maxX = ax + g.avenueEvery - g.avenueWidth / 2;
      const minZ = sz + g.streetWidth / 2, maxZ = sz + g.streetEvery - g.streetWidth / 2;
      out.push({ minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 });
    }
  }
  return out;
}
const blockInside = (b, test, m) => test(b.minX, b.minZ, m) && test(b.maxX, b.minZ, m) && test(b.minX, b.maxZ, m) && test(b.maxX, b.maxZ, m);

// Landmarks: placed by hand on the block nearest each spot.
export const LANDMARKS = [
  { id: 'vanguard', name: 'Vanguard Tower', x: 0, z: -150 },
  { id: 'oscorp', name: 'Oscorp Tower', x: 360, z: 210 },
  { id: 'bugle', name: 'Daily Bugle', x: -300, z: 150 },
  { id: 'fisk', name: 'Fisk Tower', x: -620, z: -90 },
  { id: 'museum', name: 'City Museum', x: 840, z: -700 },
  { id: 'university', name: 'Empire University', x: 1200, z: -820 },
  { id: 'exchange', name: 'Stock Exchange', x: 0, z: 640 },
  { id: 'power', name: 'Harbor Power Station', x: 1140, z: 820 },
  { id: 'church', name: 'St. Bernard Bell Tower', x: -1020, z: -700 },
  { id: 'mayHouse', name: "May's House", x: 2060, z: 700 },
  { id: 'bridge', name: 'Queensway Bridge', x: 1635, z: 700 },
  { id: 'zoo', name: 'Park Zoo', x: (ZOO.minX + ZOO.maxX) / 2, z: (ZOO.minZ + ZOO.maxZ) / 2 },
  { id: 'reservoir', name: 'Reservoir', x: RESERVOIR.cx, z: RESERVOIR.cz },
  { id: 'railyard', name: 'West Side Rail Yard', x: (RAILYARD.minX + RAILYARD.maxX) / 2, z: 0 },
];
export const landmark = (id) => LANDMARKS.find((l) => l.id === id);

export function buildCity() {
  const boxes = [];
  const add = (min, max, kind, district, style = 0, extra = null) => {
    const b = { min, max, kind, district, style };
    if (extra) Object.assign(b, extra);
    boxes.push(b);
    return b;
  };
  const all = blocks();
  const used = new Set();
  const nearestBlock = (x, z) => all.reduce((best, b) => (Math.hypot(b.cx - x, b.cz - z) < Math.hypot(best.cx - x, best.cz - z) ? b : best));

  // Landmarks first: they claim their blocks.
  const landmarkBoxes = {};
  for (const l of LANDMARKS) {
    if (['bridge', 'zoo', 'reservoir', 'mayHouse', 'railyard'].includes(l.id)) continue;
    const b = nearestBlock(l.x, l.z);
    used.add(b);
    l.block = b;
    landmarkBoxes[l.id] = buildLandmark(l, b, add);
  }

  for (const b of all) if (inYard(b.cx, b.cz)) used.add(b);
  buildRailYard(add);

  for (const d of DISTRICTS) {
    const rng = createRng(d.seed);
    d.clutterRng = createRng(d.seed * 7919 + 13);
    if (d.id === 'park') { buildPark(d, rng, add); continue; }
    if (d.id === 'queens') { buildQueens(d, rng, add); continue; }
    const mine = all.filter((b) => !used.has(b) && b.cx >= d.minX && b.cx < d.maxX && b.cz >= d.minZ && b.cz < d.maxZ && blockInside(b, onIsland, 6));
    for (const b of mine) {
      if (d.id === 'harbor') {
        const r = rng.next();
        if (r < 0.2) { buildCrane(b, rng, add, d.id); continue; }
        if (r < 0.45) { buildContainers(b, rng, add, d.id); continue; }
      }
      if (d.id === 'neon' && b.minX < NEON_PLAZA.maxX + 20 && b.maxX > NEON_PLAZA.minX - 20 && b.minZ < NEON_PLAZA.maxZ && b.maxZ > NEON_PLAZA.minZ) {
        // Facing the plaza: towers wrapped in giant signs.
        buildBlock(b, d, rng, add);
        addSigns(b, d, rng, add);
        continue;
      }
      buildBlock(b, d, rng, add);
      if (d.id === 'neon' && rng.chance(0.5)) addSigns(b, d, rng, add);
      if (d.id === 'neon') addBlades(b, d, add);
    }
  }

  buildBridge(add);
  const stations = buildStations(all, used, add);

  const city = {
    kind: 'full',
    boxes,
    grid: GRID,
    districts: DISTRICTS,
    landmarks: LANDMARKS,
    landmarkBoxes,
    stations,
    bounds: { minX: ISLAND.minX, maxX: QUEENS.maxX, minZ: ISLAND.minZ, maxZ: ISLAND.maxZ },
    land: buildLandMap(),
  };
  city.landAt = (x, z) => landAt(city.land, x, z);
  city.isWater = (x, z) => city.landAt(x, z) === LAND.water;
  city.spawn = pickSpawn(city);
  return city;
}

// Picks a style from the district's list.
const pickStyle = (d, rng) => d.styles[rng.int(0, d.styles.length - 1)];

function buildBlock(b, d, rng, add) {
  const s = GRID.sidewalk;
  const x0 = b.minX + s, x1 = b.maxX - s, z0 = b.minZ + s, z1 = b.maxZ - s;
  const n = rng.int(d.lots[0], d.lots[1]);
  const gap = n > 1 ? (d.id === 'harlem' || d.id === 'chinatown' ? 0.6 : 4) : 0;
  const w = (x1 - x0 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const lx0 = x0 + i * (w + gap), lx1 = lx0 + w;
    let h = Math.round(rng.range(d.height[0], d.height[1]));
    // A few landmark-scale towers in the tall districts, so the skyline has peaks.
    if ((d.id === 'midtown' || d.id === 'financial') && rng.chance(0.06)) h = Math.round(h * 1.35);
    const style = pickStyle(d, rng);
    if (d.setback && h > 90 && rng.chance(d.setback)) {
      // Setbacks: a wide base and a narrower shaft, the classic New York tower.
      const base = Math.round(h * rng.range(0.3, 0.45));
      add([lx0, 0, z0], [lx1, base, z1], 'building', d.id, style);
      const ix = (lx1 - lx0) * rng.range(0.12, 0.2), iz = (z1 - z0) * rng.range(0.12, 0.2);
      add([lx0 + ix, base, z0 + iz], [lx1 - ix, h, z1 - iz], 'building', d.id, style);
      roofProp(lx0 + ix, lx1 - ix, z0 + iz, z1 - iz, h, d, rng, add);
      crown(lx0 + ix, lx1 - ix, z0 + iz, z1 - iz, h, style, d, add);
    } else {
      add([lx0, 0, z0], [lx1, h, z1], 'building', d.id, style);
      roofProp(lx0, lx1, z0, z1, h, d, rng, add);
      crown(lx0, lx1, z0, z1, h, style, d, add);
    }
  }
}

// The crown of a tall tower (over 110 m, so the free-roam spawn roof never gets one), so the
// skyline has silhouettes, not prisms: deco towers step back in tiers to a needle, stone ones in
// two tiers, glass and office towers get a penthouse and a mast. Its own generator per tower, so
// nothing else in the city moves.
function crown(x0, x1, z0, z1, h, style, d, add) {
  if (h <= 110 || x1 - x0 < 14 || z1 - z0 < 14) return;
  const rng = createRng(((Math.round(x0) * 92821) ^ (Math.round(z0) * 68917) ^ h) >>> 0);
  if (!rng.chance(0.75)) return;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, dd = z1 - z0;
  const tier = (k, y, th, st = style) => { add([cx - (w * k) / 2, y, cz - (dd * k) / 2], [cx + (w * k) / 2, y + th, cz + (dd * k) / 2], 'building', d.id, st); return y + th; };
  const needle = (y, len) => add([cx - 0.3, y, cz - 0.3], [cx + 0.3, y + len, cz + 0.3], 'prop', d.id, 16);
  if (style === 7 || style === 8) {
    let y = tier(0.7, h, rng.range(7, 10));
    y = tier(0.48, y, rng.range(6, 8));
    y = tier(0.3, y, rng.range(5, 7));
    needle(y, rng.range(12, 26));
  } else if (style === 0 || style === 1) {
    let y = tier(0.62, h, rng.range(6, 9));
    y = tier(0.36, y, rng.range(5, 7));
    if (rng.chance(0.5)) needle(y, rng.range(6, 10));
  } else {
    const y = tier(0.45, h, rng.range(4, 6), 13);
    if (rng.chance(0.6)) needle(y, rng.range(14, 30));
  }
}

// Rooftop clutter from the district's clutter generator, so clutter never moves a building.
function roofClutter(x0, x1, z0, z1, h, d, add) {
  const rng = d.clutterRng;
  if (x1 - x0 < 8 || z1 - z0 < 8) return;
  const pick = (a, b) => rng.range(a, b);
  if (rng.chance(0.75)) {
    const cx = rng.chance(0.5) ? x0 + 2.8 : x1 - 2.8, cz = rng.chance(0.5) ? z0 + 2.8 : z1 - 2.8;
    add([cx - 1.6, h, cz - 1.6], [cx + 1.6, h + 2.6, cz + 1.6], 'prop', d.id, 15);
  }
  const n = rng.int(1, 3);
  const ax = pick(x0 + 3, x1 - 5), az = pick(z0 + 3, z1 - 3);
  for (let i = 0; i < n; i++) add([ax + i * 2.2, h, az - 0.7], [ax + i * 2.2 + 1.6, h + 1.3, az + 0.7], 'prop', d.id, 14);
  if (rng.chance(0.6)) { const vx = pick(x0 + 2, x1 - 2), vz = pick(z0 + 2, z1 - 2); add([vx - 0.35, h, vz - 0.35], [vx + 0.35, h + 1.8, vz + 0.35], 'prop', d.id, 14); }
  if (h > 80 && rng.chance(0.45)) { const tx = pick(x0 + 3, x1 - 3), tz = pick(z0 + 3, z1 - 3); add([tx - 0.12, h, tz - 0.12], [tx + 0.12, h + rng.range(8, 16), tz + 0.12], 'prop', d.id, 16); }
}

function roofProp(x0, x1, z0, z1, h, d, rng, add) {
  roofClutter(x0, x1, z0, z1, h, d, add);
  if (!rng.chance(d.roofProps) || x1 - x0 < 10 || z1 - z0 < 10) return;
  const cx = rng.range(x0 + 4, x1 - 4), cz = rng.range(z0 + 4, z1 - 4);
  add([cx - 2.2, h, cz - 2.2], [cx + 2.2, h + 7, cz + 2.2], 'prop', d.id, 9);
}

// Giant signs on the faces of a Neon Square block: thin panels stood off the facade.
function addSigns(b, d, rng, add) {
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const w = rng.range(10, 22), hgt = rng.range(8, 18), y = rng.range(10, 34);
    const face = rng.int(0, 3);
    const s = GRID.sidewalk;
    if (face < 2) {
      const x = face === 0 ? b.minX + s - 0.6 : b.maxX - s + 0.1;
      const z = rng.range(b.minZ + s + w / 2, Math.max(b.minZ + s + w / 2 + 0.1, b.maxZ - s - w / 2));
      add([x, y, z - w / 2], [x + 0.5, y + hgt, z + w / 2], 'sign', d.id, 18, { face: face === 0 ? -1 : 1, axis: 'x' });
    } else {
      const z = face === 2 ? b.minZ + s - 0.6 : b.maxZ - s + 0.1;
      const x = rng.range(b.minX + s + w / 2, Math.max(b.minX + s + w / 2 + 0.1, b.maxX - s - w / 2));
      add([x - w / 2, y, z], [x + w / 2, y + hgt, z + 0.5], 'sign', d.id, 18, { face: face === 2 ? -1 : 1, axis: 'z' });
    }
  }
}

// Neon Square's blade signs: tall, narrow signs sticking out over the sidewalk at street level, lit
// at night (the flat billboards alone did not read as a neon district from the street). Their own
// RNG per block, so the rest of the district is unchanged.
function addBlades(b, d, add) {
  const rng = createRng(((Math.round(b.minX) * 73856093) ^ (Math.round(b.minZ) * 19349663)) >>> 0);
  const n = rng.int(2, 4), s = GRID.sidewalk, out = 2, th = 0.35;
  for (let i = 0; i < n; i++) {
    const y = rng.range(5, 9), hgt = rng.range(7, 13), face = rng.int(0, 3);
    if (face < 2) {
      const x = face === 0 ? b.minX + s : b.maxX - s;
      const z = rng.range(b.minZ + s + 2, Math.max(b.minZ + s + 2.1, b.maxZ - s - 2));
      const x0 = face === 0 ? x - out : x, x1 = face === 0 ? x : x + out;
      add([x0, y, z - th / 2], [x1, y + hgt, z + th / 2], 'sign', d.id, 18, { face: face === 0 ? -1 : 1, axis: 'x' });
    } else {
      const z = face === 2 ? b.minZ + s : b.maxZ - s;
      const x = rng.range(b.minX + s + 2, Math.max(b.minX + s + 2.1, b.maxX - s - 2));
      const z0 = face === 2 ? z - out : z, z1 = face === 2 ? z : z + out;
      add([x - th / 2, y, z0], [x + th / 2, y + hgt, z1], 'sign', d.id, 18, { face: face === 2 ? -1 : 1, axis: 'z' });
    }
  }
}

function buildCrane(b, rng, add, district) {
  const cx = rng.range(b.minX + 10, b.maxX - 10), cz = rng.range(b.minZ + 8, b.maxZ - 8);
  const h = Math.round(rng.range(40, 62));
  add([cx - 2, 0, cz - 2], [cx + 2, h, cz + 2], 'building', district, 10);
  const len = rng.range(25, 40);
  add([cx - 3, h, cz - 1.5], [cx + len, h + 3, cz + 1.5], 'building', district, 10);
}

// The rail yard: rows of freight cars along the tracks (hard cover a charging Rhino bounces off),
// container stacks on the edges and two light towers. Its own RNG, so it never shifts the district.
function buildRailYard(add) {
  const rng = createRng(4242);
  const Y = RAILYARD;
  for (let i = 0; i < 6; i++) {
    const x = Y.minX + 12 + i * 13.5;
    for (let z = Y.minZ + 4; z < Y.maxZ - 18; z += rng.range(19, 26)) {
      if (!rng.chance(0.62)) continue;
      add([x - 1.6, 0, z], [x + 1.6, 4.2, z + 15], 'building', 'hells', i % 2 ? 26 : 25);
    }
  }
  for (const z of [Y.minZ + 1, Y.maxZ - 3.5]) {
    for (let x = Y.minX + 2; x < Y.maxX - 13; x += 14) if (rng.chance(0.7)) add([x, 0, z], [x + 12.2, 2.6 * rng.int(1, 3), z + 2.5], 'building', 'hells', 26);
  }
  for (const [x, z] of [[Y.minX + 4, 0], [Y.maxX - 4, 0]]) add([x - 0.5, 0, z - 0.5], [x + 0.5, 24, z + 0.5], 'building', 'hells', 16);
}

// A container yard: stacks of shipping containers (good low anchors and cover).
function buildContainers(b, rng, add, district) {
  const s = GRID.sidewalk + 2;
  for (let z = b.minZ + s; z + 2.6 < b.maxZ - s; z += 3.4) {
    for (let x = b.minX + s; x + 12.2 < b.maxX - s; x += 13.5) {
      if (!rng.chance(0.75)) continue;
      const stack = rng.int(1, 4);
      add([x, 0, z], [x + 12.2, 2.6 * stack, z + 2.5], 'building', district, 26);
    }
  }
}

function buildPark(d, rng, add) {
  // Trees across the park, keeping the great lawn open, the reservoir dry of trunks and the zoo
  // clear. The lawn is the place with no anchors at all: run, zip or glide.
  const lawn = { minX: -300, maxX: -40, minZ: -900, maxZ: -650 };
  for (let x = d.minX + 12; x < d.maxX - 8; x += 17) {
    for (let z = d.minZ + 12; z < d.maxZ - 8; z += 17) {
      const tx = x + rng.range(-6, 6), tz = z + rng.range(-6, 6);
      if (!rng.chance(0.72)) continue;
      if (tx > lawn.minX && tx < lawn.maxX && tz > lawn.minZ && tz < lawn.maxZ) continue;
      if (((tx - RESERVOIR.cx) / (RESERVOIR.rx + 12)) ** 2 + ((tz - RESERVOIR.cz) / (RESERVOIR.rz + 12)) ** 2 < 1) continue;
      if (tx > ZOO.minX - 6 && tx < ZOO.maxX + 6 && tz > ZOO.minZ - 6 && tz < ZOO.maxZ + 6) continue;
      const trunk = rng.range(6, 10), crown = rng.range(4, 6.5);
      add([tx - 0.5, 0, tz - 0.5], [tx + 0.5, trunk, tz + 0.5], 'tree', d.id, 11);
      add([tx - crown / 2, trunk, tz - crown / 2], [tx + crown / 2, trunk + crown * 0.8, tz + crown / 2], 'tree', d.id, 12);
    }
  }
  // The zoo: low enclosures and a gate house.
  for (let i = 0; i < 5; i++) {
    const x = ZOO.minX + 12 + i * 36, z = ZOO.minZ + 14;
    add([x, 0, z], [x + 24, 5, z + 18], 'building', 'park', 1);
  }
  add([ZOO.minX + 70, 0, ZOO.maxZ - 26], [ZOO.minX + 110, 9, ZOO.maxZ - 6], 'building', 'park', 22);
}

// Queens: a grid of small houses with lawns, trees along the streets, few anchors above two
// storeys (swinging here is hard on purpose).
function buildQueens(d, rng, add) {
  const g = GRID;
  {
    for (const b of blocks(1680, QUEENS.maxX)) {
      if (!blockInside(b, onQueens, 8)) continue;
      for (let x = b.minX + 6; x + 12 < b.maxX - 4; x += 16) {
        for (const side of [0, 1]) {
          if (!rng.chance(0.85)) continue;
          const z = side ? b.maxZ - 14 : b.minZ + 4;
          const h = rng.range(d.height[0], d.height[1]);
          add([x, 0, z], [x + 11, h, z + 10], 'building', 'queens', 21);
          // A pitched roof read as a narrow ridge box on top.
          add([x + 1, h, z + 3.5], [x + 10, h + 2.2, z + 6.5], 'prop', 'queens', 21);
        }
        if (rng.chance(0.5)) {
          const tx = x + 14, tz = (b.minZ + b.maxZ) / 2 + rng.range(-4, 4);
          add([tx - 0.4, 0, tz - 0.4], [tx + 0.4, 6, tz + 0.4], 'tree', 'queens', 11);
          add([tx - 2.4, 6, tz - 2.4], [tx + 2.4, 9.8, tz + 2.4], 'tree', 'queens', 12);
        }
      }
    }
  }
}

// Each landmark is a small set of boxes with a recognisable silhouette.
function buildLandmark(l, b, add) {
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const hw = (b.maxX - b.minX) / 2 - 4, hd = (b.maxZ - b.minZ) / 2 - 4;
  const d = districtAt(cx, cz)?.id ?? 'midtown';
  const out = [];
  const A = (min, max, style, kind = 'building') => { const bx = add(min, max, kind, d, style, { landmark: l.id }); out.push(bx); return bx; };
  switch (l.id) {
    case 'vanguard':
      A([cx - hw, 0, cz - hd], [cx + hw, 70, cz + hd], 7);
      A([cx - hw * 0.6, 70, cz - hd * 0.75], [cx + hw * 0.6, 180, cz + hd * 0.75], 7);
      A([cx - hw * 0.35, 180, cz - hd * 0.45], [cx + hw * 0.35, 240, cz + hd * 0.45], 7);
      A([cx - 2, 240, cz - 2], [cx + 2, 262, cz + 2], 8);
      break;
    case 'oscorp':
      // Tall glass shaft with a stepped crown and a platform near the top (the finale).
      A([cx - hw, 0, cz - hd], [cx + hw, 40, cz + hd], 24);
      A([cx - hw * 0.7, 40, cz - hd * 0.7], [cx + hw * 0.7, 250, cz + hd * 0.7], 24);
      A([cx - hw * 0.85, 250, cz - hd * 0.85], [cx + hw * 0.85, 256, cz + hd * 0.85], 25);
      A([cx - hw * 0.45, 256, cz - hd * 0.45], [cx + hw * 0.45, 300, cz + hd * 0.45], 24);
      A([cx - 1.5, 300, cz - 1.5], [cx + 1.5, 326, cz + 1.5], 16, 'prop');
      break;
    case 'bugle':
      A([cx - hw, 0, cz - hd], [cx + hw, 120, cz + hd], 8);
      A([cx - hw * 0.8, 120, cz - 1], [cx + hw * 0.8, 134, cz + 1], 18, 'sign');
      break;
    case 'fisk':
      A([cx - hw, 0, cz - hd], [cx + hw, 30, cz + hd], 24);
      A([cx - hw * 0.75, 30, cz - hd * 0.75], [cx + hw * 0.75, 190, cz + hd * 0.75], 24);
      A([cx - hw * 0.5, 190, cz - hd * 0.5], [cx + hw * 0.5, 205, cz + hd * 0.5], 25);
      break;
    case 'museum':
      A([cx - hw, 0, cz - hd], [cx + hw, 22, cz + hd], 22);
      A([cx - hw * 0.3, 22, cz - hd * 0.5], [cx + hw * 0.3, 34, cz + hd * 0.5], 22);
      break;
    case 'university':
      // A quad: four low halls round a lawn, and the lab (where the symbiote sample is kept).
      A([cx - hw, 0, cz - hd], [cx - hw + 14, 18, cz + hd], 0);
      A([cx + hw - 14, 0, cz - hd], [cx + hw, 18, cz + hd], 0);
      A([cx - hw + 14, 0, cz - hd], [cx + hw - 14, 24, cz - hd + 10], 22);
      A([cx - 8, 0, cz + hd - 12], [cx + 8, 40, cz + hd], 3);
      break;
    case 'exchange':
      A([cx - hw, 0, cz - hd], [cx + hw, 30, cz + hd], 22);
      break;
    case 'power':
      A([cx - hw, 0, cz - hd], [cx + hw, 28, cz + hd], 23);
      for (let i = 0; i < 4; i++) A([cx - hw + 10 + i * ((hw * 2 - 20) / 3) - 3, 28, cz - 3], [cx - hw + 10 + i * ((hw * 2 - 20) / 3) + 3, 75, cz + 3], 23);
      break;
    case 'church':
      A([cx - hw * 0.6, 0, cz - hd], [cx + hw * 0.6, 22, cz + hd], 7);
      A([cx - 6, 0, cz - hd], [cx + 6, 62, cz - hd + 12], 7);
      A([cx - 1, 62, cz - hd + 5], [cx + 1, 72, cz - hd + 7], 16, 'prop');
      break;
    default: break;
  }
  return out;
}

// The Queensway suspension bridge from the Harbor to Queens: a deck you can run along, two towers,
// cables drawn by the renderer from the tower tops (visual only).
export const BRIDGE = { x0: 1480, x1: 1790, z: 700, deckY: 26, width: 22, towers: [1560, 1710], towerH: 110 };
function buildBridge(add) {
  const B = BRIDGE;
  add([B.x0, B.deckY - 2.5, B.z - B.width / 2], [B.x1, B.deckY, B.z + B.width / 2], 'building', 'harbor', 25, { landmark: 'bridge' });
  for (const tx of B.towers) {
    for (const s of [-1, 1]) add([tx - 3, 0, B.z + s * (B.width / 2 + 1) - 2.5], [tx + 3, B.towerH, B.z + s * (B.width / 2 + 1) + 2.5], 'building', 'harbor', 25, { landmark: 'bridge' });
    add([tx - 2.5, B.towerH - 8, B.z - B.width / 2 - 3], [tx + 2.5, B.towerH - 3, B.z + B.width / 2 + 3], 'building', 'harbor', 25, { landmark: 'bridge' });
  }
  // Approach ramps up from both shores, as low steps (a body can run up them).
  for (let i = 0; i < 6; i++) {
    const h = (B.deckY - 2.5) * ((i + 1) / 7);
    add([B.x0 - 120 + i * 20, 0, B.z - B.width / 2], [B.x0 - 100 + i * 20, h, B.z + B.width / 2], 'building', 'harbor', 25, { landmark: 'bridge' });
    add([B.x1 + 100 - i * 20, 0, B.z - B.width / 2], [B.x1 + 120 - i * 20, h, B.z + B.width / 2], 'building', 'queens', 25, { landmark: 'bridge' });
  }
}

// One subway station per district (fast travel, unlocked by visiting): a kiosk on a sidewalk
// corner near the district's middle.
function buildStations(all, used, add) {
  const out = [];
  const queensBlocks = blocks(1680, QUEENS.maxX);
  for (const d of DISTRICTS) {
    const mx = (d.minX + d.maxX) / 2, mz = (d.minZ + d.maxZ) / 2;
    let best = null, bd = Infinity;
    for (const b of d.id === 'queens' ? queensBlocks : all) {
      if (used.has(b)) continue;
      const test = d.id === 'queens' ? onQueens : onIsland;
      if (!blockInside(b, test, 6) || b.cx < d.minX || b.cx >= d.maxX || b.cz < d.minZ || b.cz >= d.maxZ) continue;
      const dd = Math.hypot(b.cx - mx, b.cz - mz);
      if (dd < bd) { bd = dd; best = b; }
    }
    if (!best) continue;
    // The kiosk stands on the sidewalk at the block's south-west corner, out of the building lots.
    const x = best.minX + 1.4, z = best.minZ + 1.4;
    add([x - 1.2, 0, z - 1.2], [x + 1.2, 3, z + 1.2], 'prop', d.id, 27);
    out.push({ id: `station-${d.id}`, district: d.id, name: `${d.name} Station`, x, z: z - 3 });
  }
  return out;
}

function buildLandMap() {
  const B = LAND_BOUNDS, c = LAND_CELL;
  const w = Math.ceil((B.maxX - B.minX) / c), h = Math.ceil((B.maxZ - B.minZ) / c);
  const data = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = B.minX + (i + 0.5) * c, z = B.minZ + (j + 0.5) * c;
      let t = LAND.water;
      if (onIsland(x, z)) {
        t = LAND.city;
        const d = districtAt(x, z);
        if (d?.id === 'park') t = inReservoir(x, z) ? LAND.water : (x > ZOO.minX && x < ZOO.maxX && z > ZOO.minZ && z < ZOO.maxZ ? LAND.plaza : LAND.park);
        if (x > NEON_PLAZA.minX && x < NEON_PLAZA.maxX && z > NEON_PLAZA.minZ && z < NEON_PLAZA.maxZ) t = LAND.plaza;
        if (d?.id === 'harbor' && !onIsland(x, z, 30)) t = LAND.pier;
        if (inYard(x, z)) t = LAND.yard;
      } else if (onQueens(x, z)) t = LAND.suburb;
      else if (z > ISLAND.maxZ - 10 && z < ISLAND.maxZ + 110 && x > 600 && x < 1400 && ((x - 600) % 110) < 22) t = LAND.pier; // piers into the river
      data[j * w + i] = t;
    }
  }
  return { cell: c, minX: B.minX, minZ: B.minZ, w, h, data };
}

export function landAt(land, x, z) {
  const i = Math.floor((x - land.minX) / land.cell), j = Math.floor((z - land.minZ) / land.cell);
  if (i < 0 || j < 0 || i >= land.w || j >= land.h) return LAND.water;
  return land.data[j * land.w + i];
}

// A roof in Midtown, about 70 to 110 m up, near the middle of the avenue grid (as in Plan 1).
function pickSpawn(city) {
  let best = null, bestD = Infinity;
  for (const b of city.boxes) {
    if (b.kind !== 'building' || b.district !== 'midtown' || b.landmark) continue;
    const h = b.max[1];
    if (h < 70 || h > 110 || b.min[1] > 0) continue;
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const d = Math.hypot(cx - 60, cz + 40);
    if (d < bestD) { bestD = d; best = b; }
  }
  const cx = (best.min[0] + best.max[0]) / 2, cz = (best.min[2] + best.max[2]) / 2;
  return { x: cx, y: best.max[1] + 0.9 + 0.01, z: cz, yaw: 0 };
}
