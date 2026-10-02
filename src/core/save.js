// Save slots (spec section 15): three slots plus the multiplayer profile, which never touches
// them. Everything is keyed by stable ids (story step ids, station ids, collectible ids), never by
// position in a list, so content can be added without breaking old saves (Gotham lesson). Every
// load goes through migrate(), which fills anything missing with defaults.

export const SAVE_VERSION = 1;
export const SLOTS = 3;
const KEY = (slot) => `web-of-ink-save-${slot}`;
const LAST = 'web-of-ink-last-slot';

export const TOKEN_TYPES = ['crime', 'base', 'challenge', 'research', 'landmark', 'backpack'];

export function newSave(slot = 1) {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    slot,
    createdAt: now,
    updatedAt: now,
    playTime: 0,
    story: { step: 'prologue.open', done: [], choices: {} },
    world: { stations: [], districts: [], hour: 11, weather: 'clear', position: null },
    collect: { backpacks: [], photos: [], tags: [], pigeons: [] },
    activities: { crimes: 0, crimeKinds: {}, crimeByDistrict: {}, bases: [], challenges: {}, races: {}, research: [], bugle: [] },
    progress: {
      xp: 0, level: 1, skillPoints: 0, skills: [],
      tokens: Object.fromEntries(TOKEN_TYPES.map((t) => [t, 0])),
      suits: ['classic'], suit: 'classic', mods: [], power: null,
      gadgets: { webShooter: 1 },
    },
    postGame: { ngPlus: 0, gauntlet: {}, crimeNightsBest: 0 },
  };
}

const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const num = (v, d, min = -Infinity, max = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Any old or damaged save comes out complete and valid.
export function migrate(raw, slot = 1) {
  const d = newSave(slot);
  const r = obj(raw);
  const story = obj(r.story), world = obj(r.world), collect = obj(r.collect), act = obj(r.activities), prog = obj(r.progress), post = obj(r.postGame);
  const tokens = obj(prog.tokens);
  const pos = obj(world.position);
  return {
    version: SAVE_VERSION,
    slot,
    createdAt: num(r.createdAt, d.createdAt),
    updatedAt: num(r.updatedAt, d.updatedAt),
    playTime: num(r.playTime, 0, 0),
    // Saves from before the opening comic pointed at the swing with nothing done.
    story: { step: typeof story.step === 'string' && !(story.step === 'prologue.swing' && !arr(story.done).length) ? story.step : d.story.step, done: arr(story.done), choices: obj(story.choices) },
    world: {
      stations: arr(world.stations), districts: arr(world.districts),
      hour: num(world.hour, d.world.hour, 0, 24), weather: typeof world.weather === 'string' ? world.weather : 'clear',
      position: Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z) ? { x: pos.x, y: pos.y, z: pos.z } : null,
    },
    collect: { backpacks: arr(collect.backpacks), photos: arr(collect.photos), tags: arr(collect.tags), pigeons: arr(collect.pigeons) },
    activities: {
      crimes: num(act.crimes, 0, 0), crimeKinds: obj(act.crimeKinds), crimeByDistrict: Object.fromEntries(Object.entries(obj(act.crimeByDistrict)).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => [k, Math.max(0, Math.floor(v))])), bases: arr(act.bases), challenges: obj(act.challenges),
      races: obj(act.races), research: arr(act.research), bugle: arr(act.bugle),
    },
    progress: {
      xp: num(prog.xp, 0, 0), level: num(prog.level, 1, 1, 50), skillPoints: num(prog.skillPoints, 0, 0), skills: arr(prog.skills),
      tokens: Object.fromEntries(TOKEN_TYPES.map((t) => [t, num(tokens[t], 0, 0)])),
      suits: arr(prog.suits).length ? arr(prog.suits) : ['classic'], suit: typeof prog.suit === 'string' ? prog.suit : 'classic',
      mods: arr(prog.mods), power: typeof prog.power === 'string' ? prog.power : null,
      gadgets: { webShooter: 1, ...Object.fromEntries(Object.entries(obj(prog.gadgets)).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => [k, Math.min(3, Math.max(0, v))])) },
    },
    postGame: { ngPlus: num(post.ngPlus, 0, 0), gauntlet: obj(post.gauntlet), crimeNightsBest: num(post.crimeNightsBest, 0, 0) },
  };
}

export function loadSlot(storage, slot) {
  try {
    const raw = storage.getItem(KEY(slot));
    if (!raw) return null;
    return migrate(JSON.parse(raw), slot);
  } catch { return null; }
}

export function writeSlot(storage, save) {
  save.updatedAt = Date.now();
  try {
    storage.setItem(KEY(save.slot), JSON.stringify(save));
    storage.setItem(LAST, String(save.slot));
    return true;
  } catch { return false; }
}

export function deleteSlot(storage, slot) { try { storage.removeItem(KEY(slot)); } catch { /* storage blocked */ } }

// Summaries for the title screen's slot list.
export function listSlots(storage) {
  const out = [];
  for (let s = 1; s <= SLOTS; s++) out.push({ slot: s, save: loadSlot(storage, s) });
  return out;
}

export function lastSlot(storage) {
  try { const n = parseInt(storage.getItem(LAST) ?? '', 10); return n >= 1 && n <= SLOTS ? n : null; } catch { return null; }
}
