import { describe, it, expect } from 'vitest';
import { encodePlayer, decodePlayer, encodeWorld, decodeWorld, PLAYER_BYTES, normalizeCode, FLAG } from '../../src/net/protocol.js';
import { createBuffer, seqOlder, DELAY, EXTRAPOLATE } from '../../src/net/interp.js';

describe('protocol', () => {
  it('a player state round-trips within the quantization bounds', () => {
    const s = { seq: 65534, char: 7, state: 'swing', flags: FLAG.ROPE | FLAG.WEB_RIGHT, trick: 3, hp: 180, p: { x: 1234.567, y: 88.25, z: -999.5 }, v: { x: 31.237, y: -12.004, z: 0.019 }, facing: -2.6543, anchor: { x: 1, y: 100, z: -3 }, pivot: { x: 5, y: 60, z: 2 } };
    const buf = encodePlayer(s);
    expect(buf.byteLength).toBe(PLAYER_BYTES);
    const d = decodePlayer(buf);
    expect(d.seq).toBe(65534); expect(d.char).toBe(7); expect(d.state).toBe('swing'); expect(d.flags).toBe(s.flags); expect(d.hp).toBe(180);
    for (const k of ['x', 'y', 'z']) {
      expect(Math.abs(d.p[k] - s.p[k])).toBeLessThan(0.001);
      expect(Math.abs(d.v[k] - s.v[k])).toBeLessThanOrEqual(0.005);
      expect(Math.abs(d.anchor[k] - s.anchor[k])).toBeLessThan(0.001);
    }
    expect(Math.abs(d.facing - s.facing)).toBeLessThan(0.0001);
  });
  it('a player frame is small enough for 15 Hz from five players', () => {
    expect(PLAYER_BYTES).toBeLessThanOrEqual(56);
  });
  it('the world snapshot round-trips enemies, capped at 24', () => {
    const enemies = Array.from({ length: 30 }, (_, i) => ({ id: 1000 + i, arch: i % 2 ? 'gunner' : 'brute', faction: 'maggia', look: i % 3, state: 'windup', p: { x: i, y: 0.9, z: -i }, facing: 4.0, hp: 30, maxHp: 60, web: 0.5 }));
    const w = decodeWorld(encodeWorld(9, enemies));
    expect(w.seq).toBe(9);
    expect(w.enemies.length).toBe(24);
    const e = w.enemies[1];
    expect(e.id).toBe(1001); expect(e.arch).toBe('gunner'); expect(e.faction).toBe('maggia'); expect(e.state).toBe('windup');
    expect(e.hp).toBeCloseTo(0.5, 1); expect(e.web).toBeCloseTo(0.5, 1);
    expect(Math.abs(e.facing - (4.0 - Math.PI * 2))).toBeLessThan(0.001);
  });
  it('codes typed with spaces or lower case still match', () => {
    expect(normalizeCode(' k7wq-2m ')).toBe('K7WQ2M');
  });
});

describe('interpolation', () => {
  const S = (seq, x, vx = 0) => ({ seq, p: { x, y: 0, z: 0 }, v: { x: vx, y: 0, z: 0 }, facing: 0 });
  it('draws a remote player 100 ms in the past, between the packets that bracket it', () => {
    const b = createBuffer();
    b.push(0.0, S(1, 0)); b.push(0.1, S(2, 10)); b.push(0.2, S(3, 20));
    expect(b.sample(0.15 + DELAY).p.x).toBeCloseTo(15, 5);
  });
  it('carries on by velocity when packets are late, but only for 250 ms', () => {
    const b = createBuffer();
    b.push(0.0, S(1, 0, 10)); b.push(0.1, S(2, 1, 10));
    expect(b.sample(0.1 + DELAY + 0.1).p.x).toBeCloseTo(2, 5);
    expect(b.sample(0.1 + DELAY + 2).p.x).toBeCloseTo(1 + 10 * EXTRAPOLATE, 5);
    expect(b.sample(0.1 + DELAY + 2).extrapolated).toBe(true);
  });
  it('drops packets that arrive out of order, across the sequence wrap', () => {
    const b = createBuffer();
    b.push(0, S(65534, 0)); b.push(0.05, S(65535, 1)); b.push(0.1, S(0, 2));
    expect(b.push(0.12, S(65535, 9))).toBe(false);
    expect(seqOlder(65535, 1)).toBe(true);
    expect(seqOlder(1, 65535)).toBe(false);
  });
  it('turns the short way round when blending facing', () => {
    const b = createBuffer();
    b.push(0, { ...S(1, 0), facing: 3.0 }); b.push(0.1, { ...S(2, 0), facing: -3.0 });
    const f = b.sample(0.05 + DELAY).facing;
    expect(Math.abs(Math.abs(f) - Math.PI)).toBeLessThan(0.2);
  });
});
