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
    expect(m.story.step).toBe('prologue.swing');
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
});
