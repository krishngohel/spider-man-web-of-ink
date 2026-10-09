import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { loadRetry, loadCombatClips } from '../../src/hero/model.js';

const clipNamed = (name) => new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack('spine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);
// A loader that fails the first `fails[file]` calls for a file, then serves its clips.
function fakeLoader(fails = {}, clips = {}) {
  const calls = {};
  return {
    calls,
    loadAsync(url) {
      const f = url.split('/').pop();
      calls[f] = (calls[f] ?? 0) + 1;
      if (calls[f] <= (fails[f] ?? 0)) return Promise.reject(new Error(`404 ${f}`));
      return Promise.resolve({ animations: (clips[f] ?? []).map(clipNamed) });
    },
  };
}

describe('asset loading', () => {
  it('asks for a failed file once more before giving up', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const once = fakeLoader({ 'hero_m.glb': 1 });
    await expect(loadRetry(once, './assets/hero_m.glb')).resolves.toBeTruthy();
    expect(once.calls['hero_m.glb']).toBe(2);
    const never = fakeLoader({ 'hero_m.glb': 9 });
    await expect(loadRetry(never, './assets/hero_m.glb')).rejects.toThrow(/hero_m\.glb/);
    expect(never.calls['hero_m.glb']).toBe(2);
    vi.restoreAllMocks();
  });

  it('a combat set that never arrives falls back: the social set still loads, combatReady stays false', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const assets = { clips: new Map([['Punch_Jab', clipNamed('Punch_Jab')]]) };
    const loader = fakeLoader({ 'anims_combat.glb': 9 }, { 'anims_social.glb': ['Emote_Wave'] });
    await expect(loadCombatClips(assets, './assets/', loader)).resolves.toBe(false);
    expect(assets.combatReady).toBeFalsy();
    expect(assets.socialReady).toBe(true);
    expect(assets.clips.has('Punch_Jab')).toBe(true); // the Quaternius clip is still there
    expect(assets.clips.has('Emote_Wave')).toBe(true);
    vi.restoreAllMocks();
  });

  it('both sets load: the mocap clips join the Quaternius ones', async () => {
    const assets = { clips: new Map() };
    const loader = fakeLoader({}, { 'anims_combat.glb': ['Kick_Front'], 'anims_social.glb': ['Emote_Wave'] });
    await expect(loadCombatClips(assets, './assets/', loader)).resolves.toBe(true);
    expect(assets.combatReady).toBe(true);
    expect([...assets.clips.keys()].sort()).toEqual(['Emote_Wave', 'Kick_Front']);
  });
});
