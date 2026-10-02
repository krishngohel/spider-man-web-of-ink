import { createRng } from '../core/rng.js';
import { LAND } from '../world/city.js';

// The open world's content (spec 11), placed from the built city and keyed by stable ids (saves
// keep the ids collected or done, never positions). Pure: unit tested for counts, spread, and that
// the tokens it pays out add up to progression's CONTENT_TOKENS.

export const BACKPACKS = 55, PHOTOS = 30, TAGS = 12, PIGEONS = 20;
export const CRIME_QUOTA = 6;           // crime tokens per district (the first six crimes stopped there)
export const BASE_TOKENS = 5;           // per hideout
export const MEDAL_TOKENS = [0, 2, 4, 6, 8]; // none, bronze, silver, gold, ultimate (best medal, paid up to)
export const RESEARCH_TOKENS = 8;
export const MEDALS = ['none', 'bronze', 'silver', 'gold', 'ultimate'];

// Districts that count for completion (all ten, Central Park included).
const top = (b) => b.max[1];
const centre = (b) => ({ x: (b.min[0] + b.max[0]) / 2, z: (b.min[2] + b.max[2]) / 2 });

function spread(rng, items, n, key) {
  // Pick n items spread over the groups (round robin over shuffled groups).
  const groups = new Map();
  for (const it of items) { const k = key(it); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  for (const g of groups.values()) g.sort(() => rng.next() - 0.5);
  const keys = [...groups.keys()].sort();
  const out = [];
  for (let i = 0; out.length < n && i < 10000; i++) {
    const g = groups.get(keys[i % keys.length]);
    if (g.length) out.push(g.pop());
  }
  return out;
}

export function buildCatalog(city) {
  const rng = createRng(1111);
  const buildings = city.boxes.filter((b) => b.kind === 'building' && !b.landmark && top(b) > 8 && top(b) < 140 && (b.max[0] - b.min[0]) > 6 && city.landAt(...Object.values(centre(b))) !== LAND.water);
  // Backpacks: on roofs, about five or six a district.
  const backpacks = spread(rng, buildings, BACKPACKS, (b) => b.district).map((b, i) => ({ id: `bp${String(i + 1).padStart(2, '0')}`, kind: 'backpack', ...centre(b), y: top(b) + 0.4, district: b.district }));
  // Landmark photos: every landmark, then viewpoints (tall roofs) to make thirty.
  const named = city.landmarks.map((l) => ({ id: `ph-${l.id}`, kind: 'photo', name: l.name, x: l.x, y: 30, z: l.z, district: city.districts.find((d) => l.x >= d.minX && l.x < d.maxX && l.z >= d.minZ && l.z < d.maxZ)?.id ?? 'harbor' }));
  const tall = buildings.filter((b) => top(b) > 60);
  const views = spread(rng, tall, PHOTOS - named.length, (b) => b.district).map((b, i) => ({ id: `ph-view${i + 1}`, kind: 'photo', name: 'Skyline view', ...centre(b), y: top(b), district: b.district }));
  const photos = [...named, ...views].slice(0, PHOTOS);
  // Black Cat tags: painted on walls a few metres up (a face of a building).
  const tags = spread(rng, buildings.filter((b) => top(b) > 14), TAGS, (b) => b.district).map((b, i) => {
    const c = centre(b);
    return { id: `tag${i + 1}`, kind: 'tag', x: c.x, y: Math.min(top(b) - 2, 6 + rng.range(0, 8)), z: b.max[2] + 0.05, nz: 1, district: b.district };
  });
  // Lost pigeons: on roof edges.
  const pigeons = spread(rng, buildings, PIGEONS, (b) => b.district).map((b, i) => ({ id: `pg${i + 1}`, kind: 'pigeon', x: b.min[0] + 1.2, y: top(b) + 0.3, z: (b.min[2] + b.max[2]) / 2, district: b.district }));
  // Hideouts: one per district except the park, in the street in front of a block near the middle.
  const hideouts = city.districts.filter((d) => d.id !== 'park').map((d) => {
    const mx = (d.minX + d.maxX) / 2, mz = (d.minZ + d.maxZ) / 2;
    const b = buildings.filter((q) => q.district === d.id).reduce((a, q) => (!a || Math.hypot(centre(q).x - mx, centre(q).z - mz) < Math.hypot(centre(a).x - mx, centre(a).z - mz) ? q : a), null);
    const c = b ? centre(b) : { x: mx, z: mz };
    return { id: `base-${d.id}`, kind: 'base', district: d.id, name: `${d.name} hideout`, x: c.x, y: 0.9, z: b ? b.max[2] + 6 : mz };
  });
  // Research stations: Oscorp kiosks on roofs, eight tasks.
  const RESEARCH_KINDS = ['pipes', 'circuit', 'drones', 'pigeons', 'pipes', 'circuit', 'drones', 'cable'];
  const research = spread(rng, buildings.filter((b) => top(b) > 20 && top(b) < 90), 8, (b) => b.district).map((b, i) => ({ id: `rs${i + 1}`, kind: 'research', task: RESEARCH_KINDS[i], ...centre(b), y: top(b) + 0.9, district: b.district }));
  return { backpacks, photos, tags, pigeons, hideouts, research, challenges: buildChallenges(city, rng), races: buildRaces(city, rng) };
}

// A course of rings through the city: a start and checkpoints at a height, following avenues and
// streets (open sky), n rings long.
function course(city, rng, x0, z0, n, y0, y1) {
  const g = city.grid;
  const pts = [];
  let x = Math.round((x0 - g.minX) / g.avenueEvery) * g.avenueEvery + g.minX, z = Math.round((z0 - g.minZ) / g.streetEvery) * g.streetEvery + g.minZ;
  let dir = rng.int(0, 3);
  for (let guard = 0; pts.length < n && guard < 400; guard++) {
    if (rng.chance(0.3)) dir = (dir + (rng.chance(0.5) ? 1 : 3)) % 4;
    const step = dir % 2 === 0 ? g.avenueEvery : g.streetEvery * 2;
    const nx = x + (dir === 1 ? step : dir === 3 ? -step : 0), nz = z + (dir === 0 ? step : dir === 2 ? -step : 0);
    if (city.landAt(nx, nz) === LAND.water || Math.abs(nz) > 940) { dir = (dir + 1 + rng.int(0, 2)) % 4; continue; }
    x = nx; z = nz;
    pts.push({ x, y: y0 + rng.range(0, y1 - y0), z });
  }
  return pts;
}

// Taskmaster's twelve challenges (spec 11): medal targets in seconds (lower is better).
function buildChallenges(city, rng) {
  const d = (id) => city.districts.find((q) => q.id === id);
  // The street crossing nearest the middle of the district (always open ground).
  const gr = city.grid;
  const mid = (id) => ({ x: Math.round(((d(id).minX + d(id).maxX) / 2 - gr.minX) / gr.avenueEvery) * gr.avenueEvery + gr.minX, z: Math.round(((d(id).minZ + d(id).maxZ) / 2 - gr.minZ) / gr.streetEvery) * gr.streetEvery + gr.minZ });
  const specs = [
    ['combat', 'midtown'], ['combat', 'hells'], ['combat', 'harbor'],
    ['stealth', 'chinatown'], ['stealth', 'harlem'],
    ['drone', 'neon'], ['drone', 'upper'],
    ['bombs', 'financial'], ['bombs', 'queens'],
    ['swing', 'midtown'], ['swing', 'financial'], ['swing', 'upper'],
  ];
  return specs.map(([type, dist], i) => {
    const m = mid(dist);
    const c = { id: `tm${i + 1}`, kind: 'challenge', type, district: dist, name: `Taskmaster: ${type === 'combat' ? 'Brawl' : type === 'stealth' ? 'Shadow' : type === 'drone' ? 'Drone Chase' : type === 'bombs' ? 'Bomb Rush' : 'Swing Run'}`, x: m.x, y: 0.9, z: m.z };
    if (type === 'combat') Object.assign(c, { waves: [['brawler', 'brawler', 'shield', 'gunner'], ['brute', 'brawler', 'whip', 'gunner']], medals: [999, 70, 50, 38] });
    if (type === 'stealth') Object.assign(c, { guards: 5, medals: [999, 120, 80, 55] });
    if (type === 'drone' || type === 'swing' || type === 'bombs') {
      const rings = course(city, rng, m.x, m.z, type === 'bombs' ? 6 : 10, type === 'bombs' ? 30 : 25, type === 'bombs' ? 60 : 55);
      const len = rings.reduce((t, p, k) => t + (k ? Math.hypot(p.x - rings[k - 1].x, p.z - rings[k - 1].z) : 0), 0);
      // Targets from the course length at a skilled pace (about 32 m/s for gold).
      const gold = Math.round(len / 32 + (type === 'bombs' ? rings.length * 2 : 0));
      Object.assign(c, { rings, bombs: type === 'bombs', medals: [999, Math.round(gold * 1.6), Math.round(gold * 1.25), gold], ultimate: Math.round(gold * 0.85) });
    }
    if (c.ultimate === undefined) c.ultimate = Math.round(c.medals[3] * 0.8);
    return c;
  });
}

// Twelve swing races: checkpoint courses through each part of town (medals for XP and pride).
function buildRaces(city, rng) {
  const ids = ['midtown', 'hells', 'harbor', 'neon', 'financial', 'harlem', 'chinatown', 'upper', 'midtown', 'financial', 'neon', 'upper'];
  return ids.map((dist, i) => {
    const d = city.districts.find((q) => q.id === dist);
    const rings = course(city, rng, (d.minX + d.maxX) / 2, (d.minZ + d.maxZ) / 2, 12, 22, 60);
    const len = rings.reduce((t, p, k) => t + (k ? Math.hypot(p.x - rings[k - 1].x, p.z - rings[k - 1].z) : 0), 0);
    const gold = Math.round(len / 33);
    return { id: `race${i + 1}`, kind: 'race', district: dist, name: `${d.name} Run ${i < 8 ? 1 : 2}`, x: rings[0].x, y: 0.9, z: rings[0].z, rings, medals: [999, Math.round(gold * 1.6), Math.round(gold * 1.25), gold], ultimate: Math.round(gold * 0.85) };
  });
}

// Daily Bugle photo assignments: a subject, and sometimes a time of day.
export const BUGLE = [
  { id: 'bg1', title: 'Fisk Tower at dawn', target: 'ph-fisk', hours: [5, 8] },
  { id: 'bg2', title: 'The Exchange at noon', target: 'ph-exchange', hours: [11, 14] },
  { id: 'bg3', title: 'Oscorp after dark', target: 'ph-oscorp', hours: [20, 24] },
  { id: 'bg4', title: 'The bell tower in the rain', target: 'ph-church', weather: 'rain' },
  { id: 'bg5', title: 'Vanguard Tower at sunset', target: 'ph-vanguard', hours: [17, 19.5] },
  { id: 'bg6', title: 'The Queensway Bridge', target: 'ph-bridge' },
  { id: 'bg7', title: 'The Daily Bugle itself (vanity, yes)', target: 'ph-bugle' },
  { id: 'bg8', title: 'The museum', target: 'ph-museum' },
  { id: 'bg9', title: 'Empire University', target: 'ph-university' },
  { id: 'bg10', title: 'The power station, lit up at night', target: 'ph-power', hours: [19, 24] },
];

// Every token the content can pay, by type (100% completion).
export function contentTokens(catalog, districtIds) {
  return {
    crime: districtIds.length * CRIME_QUOTA,
    base: catalog.hideouts.length * BASE_TOKENS,
    challenge: catalog.challenges.length * MEDAL_TOKENS[4],
    research: catalog.research.length * RESEARCH_TOKENS,
    landmark: catalog.photos.length,
    backpack: catalog.backpacks.length,
  };
}

// Medal for a time (seconds) against targets [_, bronze, silver, gold] and an ultimate time.
export function medalFor(t, c) {
  if (t <= c.ultimate) return 4;
  if (t <= c.medals[3]) return 3;
  if (t <= c.medals[2]) return 2;
  return 1;
}
