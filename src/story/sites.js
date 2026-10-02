import { RAILYARD, BRIDGE, NEON_PLAZA, ZOO } from '../world/city.js';

// Named story spots, resolved against the built city: a landmark's roof (the top of its highest
// building box, with that roof's extent as the arena), the street in front of a landmark (the
// south side), a district's subway station, an area, or the spawn roof.
export const SITE_DEFS = {
  peterRoof: { spawn: true, edge: 'west' },
  fiskBase: { lm: 'fisk', at: 'front' },
  fiskRoof: { lm: 'fisk', at: 'roof' },
  bugleRoof: { lm: 'bugle', at: 'roof', dz: 11 },
  bugleFront: { lm: 'bugle', at: 'front' },
  exchangeFront: { lm: 'exchange', at: 'front' },
  oscorpFront: { lm: 'oscorp', at: 'front' },
  shelter: { station: 'harlem', dx: 10 },
  hellsStreet: { station: 'hells', dx: 14 },
  railyard: { area: RAILYARD },
  powerGate: { lm: 'power', at: 'front' },
  powerRoof: { lm: 'power', at: 'roof', pick: 'largest' },
  bridgeHarbor: { point: [BRIDGE.x0 + 14, BRIDGE.deckY + 0.9, BRIDGE.z] },
  bridgeDeck: { point: [(BRIDGE.towers[0] + BRIDGE.towers[1]) / 2, BRIDGE.deckY + 0.9, BRIDGE.z], arena: { minX: BRIDGE.towers[0] + 5, maxX: BRIDGE.towers[1] - 5, minZ: BRIDGE.z - BRIDGE.width / 2, maxZ: BRIDGE.z + BRIDGE.width / 2, y: BRIDGE.deckY } },
  neonPlaza: { point: [(NEON_PLAZA.minX + NEON_PLAZA.maxX) / 2, 0.9, -90], arena: { minX: NEON_PLAZA.minX, maxX: NEON_PLAZA.maxX, minZ: -150, maxZ: -30, y: 0 } },
  parkLawn: { point: [-80, 0.9, -690] },
  harborWarehouse: { point: [840, 0.9, 840] },
  shipyard: { point: [960, 0.9, 900] },
  uniFront: { lm: 'university', at: 'front' },
  churchStreet: { lm: 'church', at: 'front' },
  churchRoof: { lm: 'church', at: 'roof', pick: 'largest' },
  bellTop: { lm: 'church', at: 'roof', dz: 3.5 },
  zooPlaza: { point: [(ZOO.minX + ZOO.maxX) / 2, 0.9, (ZOO.minZ + ZOO.maxZ) / 2], arena: { minX: ZOO.minX, maxX: ZOO.maxX, minZ: ZOO.minZ, maxZ: ZOO.maxZ, y: 0 } },
};

export function resolveSite(city, name) {
  const d = SITE_DEFS[name];
  if (!d) return null;
  if (d.spawn) {
    // The spawn roof's west edge (looking toward Fisk Tower), or the spawn itself.
    const s = city.spawn;
    const b = city.boxes.find((q) => s.x >= q.min[0] && s.x <= q.max[0] && s.z >= q.min[2] && s.z <= q.max[2] && Math.abs(q.max[1] - (s.y - 0.9)) < 1.5);
    if (b && d.edge === 'west') return { name, x: b.min[0] + 1.1, y: b.max[1] + 0.9, z: s.z, ground: false, arena: { minX: b.min[0], maxX: b.max[0], minZ: b.min[2], maxZ: b.max[2], y: b.max[1] } };
    return { name, x: s.x, y: s.y, z: s.z, ground: false };
  }
  if (d.point) return { name, x: d.point[0], y: d.point[1], z: d.point[2], ground: d.point[1] < 2, arena: d.arena ?? null };
  if (d.area) {
    const a = d.area;
    return { name, x: (a.minX + a.maxX) / 2, y: 0.9, z: (a.minZ + a.maxZ) / 2, ground: true, arena: { minX: a.minX, maxX: a.maxX, minZ: a.minZ, maxZ: a.maxZ, y: 0 } };
  }
  if (d.station) {
    const st = city.stations.find((s) => s.district === d.station);
    return { name, x: st.x + (d.dx ?? 0), y: 0.9, z: st.z + (d.dz ?? 0), ground: true };
  }
  const l = city.landmarks.find((q) => q.id === d.lm);
  const b = l.block;
  if (d.at === 'roof') {
    const boxes = (city.landmarkBoxes[d.lm] ?? []).filter((q) => q.kind === 'building');
    // The highest roof, or the biggest one (a power station's roof, not a chimney top).
    const area = (q) => (q.max[0] - q.min[0]) * (q.max[2] - q.min[2]);
    const top = d.pick === 'largest' ? boxes.reduce((a, q) => (area(q) > area(a) ? q : a)) : boxes.reduce((a, q) => (q.max[1] > a.max[1] ? q : a));
    const x = (top.min[0] + top.max[0]) / 2, z = (top.min[2] + top.max[2]) / 2;
    return { name, x: x + (d.dx ?? 0), y: top.max[1] + 0.9, z: z + (d.dz ?? 0), ground: false, arena: { minX: top.min[0], maxX: top.max[0], minZ: top.min[2], maxZ: top.max[2], y: top.max[1] } };
  }
  // In front: the street on the block's south side, just off the curb.
  return { name, x: (b.minX + b.maxX) / 2, y: 0.9, z: b.maxZ + 6, ground: true, arena: { minX: b.minX - 10, maxX: b.maxX + 10, minZ: b.maxZ, maxZ: b.maxZ + 18, y: 0 } };
}
