import { describe, it, expect } from 'vitest';
import { REQUESTS } from '../../src/content/requestData.js';
import { placeRequests } from '../../src/content/requests.js';
import { CROWD } from '../../src/story/cast.js';
import { CLIPS } from '../../scripts/mixamo-clips.mjs';
import { buildCity, LAND } from '../../src/world/city.js';
import { buildStreetProps } from '../../src/world/streetProps.js';
import { FACTIONS } from '../../src/combat/enemyModel.js';

const DASHES = [String.fromCharCode(8211), String.fromCharCode(8212)];
const ARCH = ['brawler', 'brute', 'gunner', 'shield', 'whip', 'jetpack', 'rocket'];
const ITEMS = ['cat', 'kite', 'drone', 'bag', 'hat', 'box', 'guitar', 'balloon'];

describe('neighborhood requests', () => {
  it('are well formed: ids, givers, clips, tasks, lines', () => {
    const ids = REQUESTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const clips = { ...CLIPS.combat, ...CLIPS.social };
    for (const r of REQUESTS) {
      expect(CROWD[r.giver], r.id).toBeTruthy();
      expect(clips[r.clip], `${r.id} ${r.clip}`).toBeTruthy();
      expect(r.ask.length, r.id).toBeGreaterThan(1);
      expect(r.thanks.length, r.id).toBeGreaterThan(0);
      for (const l of [...r.ask, ...r.thanks]) {
        expect(['giver', 'peter'], r.id).toContain(l.who);
        expect(DASHES.some((d) => l.text.includes(d)), l.text).toBe(false);
      }
      if (r.task.kind === 'gang') {
        expect(FACTIONS[r.task.faction], r.id).toBeTruthy();
        for (const a of r.task.mix) expect(ARCH, r.id).toContain(a);
      } else {
        expect(r.task.kind).toBe('fetch');
        expect(ITEMS, r.id).toContain(r.task.item);
      }
    }
  });
  it('every giver stands on a city sidewalk and every fetch has a roof', () => {
    const city = buildCity();
    const spots = placeRequests(city, buildStreetProps(city).lamps);
    for (const s of spots) {
      expect(city.landAt(s.giver.x, s.giver.z), s.r.id).toBe(LAND.city);
      const inside = city.boxes.some((b) => b.kind === 'building' && s.giver.x > b.min[0] && s.giver.x < b.max[0] && s.giver.z > b.min[2] && s.giver.z < b.max[2]);
      expect(inside, `${s.r.id} inside a building`).toBe(false);
      if (s.r.task.kind === 'fetch') expect(s.roof, s.r.id).toBeTruthy();
    }
  });
});
