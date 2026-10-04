// The multiplayer wire format (spec 14.4). Binary frames for the fast state (each player's own body
// at 15 Hz, the host's world snapshot at 10 Hz); JSON control messages for everything else. The
// relay puts the sender's id in front of every binary frame it forwards. Versioned: the relay
// refuses a client on a different PROTOCOL_VERSION.

export const PROTOCOL_VERSION = 1;
export const MSG = { PLAYER: 1, WORLD: 2 };
export const STATES = ['ground', 'air', 'swing', 'zip', 'wall', 'glide', 'hang'];
export const ARCHES = ['brawler', 'brute', 'shield', 'gunner', 'rocket', 'sniper', 'jetpack', 'whip'];
export const FACTION_IDS = ['street', 'kingpin', 'maggia', 'sable', 'oscorp', 'sinister', 'kraven', 'symbiote'];
export const ENEMY_STATES = ['idle', 'engage', 'windup', 'strike', 'recover', 'stagger', 'air', 'down', 'getup', 'out', 'webbed', 'pinned'];
export const FLAG = { ROPE: 1, DIVING: 2, INVERTED: 4, WEB_RIGHT: 8, ATTACKING: 16, WRAPPED: 32, HURT: 64 };

const q16 = (v, scale) => Math.max(-32768, Math.min(32767, Math.round(v * scale)));

// A player's own body: 52 bytes.
//   u8 type, u16 seq, u8 char, u8 state, u8 flags, u8 trick, u8 hp,
//   f32 x3 position, i16 x3 velocity (cm/s), i16 facing (rad x 10000),
//   f32 x3 rope anchor, f32 x3 last rope pivot (the same as the anchor unless wrapped round a corner)
// (the rope length is the distance from the body to the last pivot, so it is not sent)
export const PLAYER_BYTES = 52;
export function encodePlayer(s, out = new ArrayBuffer(PLAYER_BYTES)) {
  const d = new DataView(out);
  d.setUint8(0, MSG.PLAYER);
  d.setUint16(1, s.seq & 0xffff, true);
  d.setUint8(3, s.char & 255);
  d.setUint8(4, Math.max(0, STATES.indexOf(s.state)));
  d.setUint8(5, s.flags & 255);
  d.setUint8(6, s.trick ?? 255);
  d.setUint8(7, Math.max(0, Math.min(255, Math.round(s.hp ?? 255))));
  d.setFloat32(8, s.p.x, true); d.setFloat32(12, s.p.y, true); d.setFloat32(16, s.p.z, true);
  d.setInt16(20, q16(s.v.x, 100), true); d.setInt16(22, q16(s.v.y, 100), true); d.setInt16(24, q16(s.v.z, 100), true);
  d.setInt16(26, q16(s.facing, 10000), true);
  const a = s.anchor ?? { x: 0, y: 0, z: 0 }, pv = s.pivot ?? a;
  d.setFloat32(28, a.x, true); d.setFloat32(32, a.y, true); d.setFloat32(36, a.z, true);
  d.setFloat32(40, pv.x, true); d.setFloat32(44, pv.y, true); d.setFloat32(48, pv.z, true);
  return out;
}
export function decodePlayer(buf, offset = 0) {
  const d = new DataView(buf, offset);
  return {
    seq: d.getUint16(1, true), char: d.getUint8(3), state: STATES[d.getUint8(4)] ?? 'air', flags: d.getUint8(5),
    trick: d.getUint8(6), hp: d.getUint8(7),
    p: { x: d.getFloat32(8, true), y: d.getFloat32(12, true), z: d.getFloat32(16, true) },
    v: { x: d.getInt16(20, true) / 100, y: d.getInt16(22, true) / 100, z: d.getInt16(24, true) / 100 },
    facing: d.getInt16(26, true) / 10000,
    anchor: { x: d.getFloat32(28, true), y: d.getFloat32(32, true), z: d.getFloat32(36, true) },
    pivot: { x: d.getFloat32(40, true), y: d.getFloat32(44, true), z: d.getFloat32(48, true) },
  };
}

// The host's world: up to 24 enemies near some player, 22 bytes each.
//   u8 type, u16 seq, u8 count, then per enemy:
//   u16 id, u8 arch, u8 faction, u8 look, u8 state, f32 x3 position, i16 facing, u8 hp (0..255 of max), u8 web
export const ENEMY_BYTES = 22;
export function encodeWorld(seq, enemies) {
  const n = Math.min(24, enemies.length);
  const buf = new ArrayBuffer(4 + n * ENEMY_BYTES);
  const d = new DataView(buf);
  d.setUint8(0, MSG.WORLD); d.setUint16(1, seq & 0xffff, true); d.setUint8(3, n);
  for (let i = 0; i < n; i++) {
    const e = enemies[i], o = 4 + i * ENEMY_BYTES;
    d.setUint16(o, e.id & 0xffff, true);
    d.setUint8(o + 2, Math.max(0, ARCHES.indexOf(e.arch)));
    d.setUint8(o + 3, Math.max(0, FACTION_IDS.indexOf(e.faction)));
    d.setUint8(o + 4, (e.look ?? 0) & 255);
    d.setUint8(o + 5, Math.max(0, ENEMY_STATES.indexOf(e.state)));
    d.setFloat32(o + 6, e.p.x, true); d.setFloat32(o + 10, e.p.y, true); d.setFloat32(o + 14, e.p.z, true);
    d.setInt16(o + 18, q16(((e.facing % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI, 10000), true);
    d.setUint8(o + 20, e.hp > 0 ? Math.max(1, Math.min(255, Math.round((e.hp / e.maxHp) * 255))) : 0); // a sliver of health still reads as alive
    d.setUint8(o + 21, Math.max(0, Math.min(255, Math.round((e.web ?? 0) * 255))));
  }
  return buf;
}
export function decodeWorld(buf, offset = 0) {
  const d = new DataView(buf, offset);
  const n = d.getUint8(3), out = [];
  for (let i = 0; i < n; i++) {
    const o = 4 + i * ENEMY_BYTES;
    out.push({
      id: d.getUint16(o, true), arch: ARCHES[d.getUint8(o + 2)], faction: FACTION_IDS[d.getUint8(o + 3)], look: d.getUint8(o + 4),
      state: ENEMY_STATES[d.getUint8(o + 5)],
      p: { x: d.getFloat32(o + 6, true), y: d.getFloat32(o + 10, true), z: d.getFloat32(o + 14, true) },
      facing: d.getInt16(o + 18, true) / 10000, hp: d.getUint8(o + 20) / 255, web: d.getUint8(o + 21) / 255,
    });
  }
  return { seq: d.getUint16(1, true), enemies: out };
}

// Join codes as typed: upper case, spaces and dashes dropped.
export function normalizeCode(s) {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
