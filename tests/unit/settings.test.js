import { describe, it, expect } from 'vitest';
import { sanitizeSettings, loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/core/settings.js';
import { rebind, DEFAULT_BINDINGS, keyLabel } from '../../src/core/bindings.js';
import { padActions } from '../../src/core/input.js';

describe('settings', () => {
  it('fills defaults and rejects bad values', () => {
    const s = sanitizeSettings({ gravity: 'moon', sensitivity: 99, swingAssist: 'high', volume: { master: -2 }, fov: 'wide' });
    expect(s.gravity).toBe('comic');
    expect(s.sensitivity).toBe(3);
    expect(s.swingAssist).toBe('high');
    expect(s.volume.master).toBe(0);
    expect(s.fov).toBe(60);
  });
  it('round-trips through storage and survives garbage', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    saveSettings(storage, { ...DEFAULT_SETTINGS, gravity: 'real' });
    expect(loadSettings(storage).gravity).toBe('real');
    store.set([...store.keys()][0], '{not json');
    expect(loadSettings(storage).gravity).toBe('comic');
  });
  it('a code bound to two actions goes to its default owner', () => {
    const s = sanitizeSettings({ bindings: { ...DEFAULT_BINDINGS, dive: ['Space'] } });
    expect(s.bindings.jump).toContain('Space');
    expect(s.bindings.dive).toEqual(['KeyC']);
  });
});

describe('bindings', () => {
  it('rebinding to a used key swaps the old key onto the other action', () => {
    const b = rebind(DEFAULT_BINDINGS, 'zip', 'KeyC');
    expect(b.zip[0]).toBe('KeyC');
    expect(b.dive).toContain('KeyQ');
  });
  it('labels keys for people', () => {
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('Mouse2')).toBe('Right mouse');
  });
});

describe('gamepad', () => {
  const pad = (down) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })) });
  it('RT swings, LT + RT zips', () => {
    expect([...padActions(pad([7]))]).toEqual(['swing']);
    expect([...padActions(pad([6, 7]))]).toEqual(['zip']);
    expect([...padActions(pad([0, 1]))]).toEqual(['jump', 'dive']);
  });
});
