import { describe, it, expect } from 'vitest';
import { newSave, migrate, loadSlot, writeSlot, listSlots, lastSlot, TOKEN_TYPES } from '../../src/core/save.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('saves', () => {
  it('a new save round-trips through storage unchanged', () => {
    const st = memoryStorage();
    const s = newSave(2);
    s.world.stations.push('station-midtown');
    s.progress.tokens.crime = 4;
    writeSlot(st, s);
    const back = loadSlot(st, 2);
    expect(back.world.stations).toEqual(['station-midtown']);
    expect(back.progress.tokens.crime).toBe(4);
    expect(lastSlot(st)).toBe(2);
  });
  it('migrate fills anything missing and drops junk', () => {
    const m = migrate({ story: { step: 42, done: ['a', 5, null] }, progress: { level: 99, tokens: { crime: 'x', base: 3 }, gadgets: { webBomb: 7 } } });
    expect(m.story.step).toBe('prologue.open');
    expect(m.story.done).toEqual(['a']);
    expect(m.progress.level).toBe(50);
    expect(m.progress.tokens.crime).toBe(0);
    expect(m.progress.tokens.base).toBe(3);
    expect(m.progress.gadgets.webBomb).toBe(3);
    expect(m.progress.gadgets.webShooter).toBe(1);
    for (const t of TOKEN_TYPES) expect(typeof m.progress.tokens[t]).toBe('number');
  });
  it('a corrupt slot loads as empty, never throws', () => {
    const st = memoryStorage();
    st.setItem('web-of-ink-save-1', '{not json');
    expect(loadSlot(st, 1)).toBe(null);
    expect(listSlots(st).length).toBe(3);
  });
  it('anything that is not a save object migrates to a fresh, complete save for that slot', () => {
    const fresh = (s) => { const n = newSave(s); delete n.createdAt; delete n.updatedAt; return n; };
    for (const raw of [null, undefined, 7, 'save', [], [1, 2], true]) {
      const m = migrate(raw, 2);
      delete m.createdAt; delete m.updatedAt;
      expect(m, String(raw)).toEqual(fresh(2));
    }
  });
  it('migrate is idempotent and survives a JSON round trip', () => {
    const messy = { playTime: -5, story: { step: 'act2.electro', done: ['prologue.open', 3], choices: { a: 1 } }, world: { hour: 30, position: { x: 1, y: 2, z: 3 } }, progress: { level: 0, suits: [], suit: 4, gadgets: { webShooter: 2, mine: -1, bad: 'x', huge: 9 } } };
    const once = migrate(messy, 3);
    expect(migrate(once, 3)).toEqual(once);
    expect(migrate(JSON.parse(JSON.stringify(once)), 3)).toEqual(once);
    expect(once.playTime).toBe(0);
    expect(once.world.hour).toBe(24);
    expect(once.progress.level).toBe(1);
    expect(once.progress.suits).toEqual(['classic']);
    expect(once.progress.suit).toBe('classic');
    expect(once.progress.gadgets).toEqual({ webShooter: 2, mine: 0, huge: 3 });
  });
  it('a half-written position is dropped (no spawning at NaN), a whole one is kept', () => {
    expect(migrate({ world: { position: { x: 1, y: NaN, z: 3 } } }).world.position).toBe(null);
    expect(migrate({ world: { position: { x: 1, z: 3 } } }).world.position).toBe(null);
    expect(migrate({ world: { position: 'roof' } }).world.position).toBe(null);
    expect(migrate({ world: { position: { x: 1, y: 2, z: 3, extra: 9 } } }).world.position).toEqual({ x: 1, y: 2, z: 3 });
  });
  it('the opening-comic fix only applies to a swing step with nothing done', () => {
    expect(migrate({ story: { step: 'prologue.swing', done: [] } }).story.step).toBe('prologue.open');
    expect(migrate({ story: { step: 'prologue.swing', done: ['prologue.open'] } }).story.step).toBe('prologue.swing');
    expect(migrate({ story: { step: 'act3.blackSuit', done: [] } }).story.step).toBe('act3.blackSuit');
  });
  it('a slot loads as the slot it was asked for, and a full or blocked storage never throws', () => {
    const st = memoryStorage();
    st.setItem('web-of-ink-save-2', JSON.stringify({ ...newSave(1), playTime: 40 }));
    const s = loadSlot(st, 2);
    expect(s.slot).toBe(2);
    expect(s.playTime).toBe(40);
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    expect(writeSlot(full, newSave(1))).toBe(false);
    const blocked = { getItem: () => { throw new Error('SecurityError'); } };
    expect(loadSlot(blocked, 1)).toBe(null);
    expect(lastSlot(blocked)).toBe(null);
    st.setItem('web-of-ink-last-slot', '7');
    expect(lastSlot(st)).toBe(null);
  });
  it('keeps the crime count per district (the token quota) through a load', () => {
    const m = migrate({ activities: { crimeByDistrict: { midtown: 4, harbor: 'x', neon: 2.7 } } });
    expect(m.activities.crimeByDistrict).toEqual({ midtown: 4, neon: 2 });
  });
});
