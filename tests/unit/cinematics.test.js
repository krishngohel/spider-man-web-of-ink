import { describe, it, expect } from 'vitest';
import { CINEMATICS, buildCinematic } from '../../src/story/cinematics.js';
import { checkShots } from '../../src/ui/cinematicShots.js';
import { STEPS } from '../../src/story/steps.js';
import { resolveSite } from '../../src/story/sites.js';
import { buildCity } from '../../src/world/city.js';

const city = buildCity();
const ctx = {
  boxes: city.boxes,
  lm(id) {
    const l = city.landmarks.find((q) => q.id === id), b = l.block;
    const boxes = (city.landmarkBoxes[id] ?? []).filter((q) => q.kind === 'building');
    return { x: b.cx, z: b.cz, minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, top: Math.max(...boxes.map((q) => q.max[1])) };
  },
  site: (n) => resolveSite(city, n),
  hero: { x: city.spawn.x, y: city.spawn.y, z: city.spawn.z },
  boss: { x: 10, y: 0.9, z: 20, yaw: Math.PI },
  sub: 'A line.',
};
const DASHES = [String.fromCharCode(8211), String.fromCharCode(8212)];

describe('story cinematics', () => {
  it('every cinematic builds against the real city, within the house rules, and clear of its boxes', () => {
    for (const id of Object.keys(CINEMATICS)) {
      const shots = buildCinematic(id, ctx);
      expect(shots, id).toBeTruthy();
      expect(checkShots(shots), id).toEqual([]);
      // A shot that had to rise by more than a tall building was aimed through the city.
      for (const s of shots) expect(s.lifted, `${id} lifted ${s.lifted}`).toBeLessThan(60);
      for (const s of shots) if (s.sub) expect(DASHES.some((d) => s.sub.includes(d)), s.sub).toBe(false);
    }
  });
  it('a reveal needs a boss; an unknown id is nothing', () => {
    expect(buildCinematic('reveal', { ...ctx, boss: null })).toBe(null);
    expect(buildCinematic('nothing', ctx)).toBe(null);
    const r = buildCinematic('reveal', ctx);
    expect(r[0].sub).toBe('A line.');
    // The first shot starts in front of the boss (the way he faces) and looks at him.
    expect(r[0].from.z).toBeLessThan(ctx.boss.z);
    expect(r[0].look.x).toBeCloseTo(ctx.boss.x);
  });
  it('every step that names a cinematic names a real one, and the openers and finale are placed', () => {
    for (const s of STEPS) {
      if (s.cine) expect(CINEMATICS[s.cine], s.id).toBeTruthy();
      if (s.reveal) { expect(s.type, s.id).toBe('boss'); expect(typeof s.reveal, s.id).toBe('string'); }
    }
    const by = (id) => STEPS.find((s) => s.id === id);
    expect(by('prologue.open').cine).toBe('prologue');
    for (const a of ['act1', 'act2', 'act3', 'act4']) expect(by(`${a}.title`).cine, a).toBe(a);
    expect(by('act4.partyWalk').cine).toBe('party');
    expect(by('act4.credits').cine).toBe('dusk');
    expect(STEPS.filter((s) => s.reveal).length).toBeGreaterThanOrEqual(3);
  });
});
