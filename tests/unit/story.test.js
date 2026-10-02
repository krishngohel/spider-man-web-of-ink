import { describe, it, expect } from 'vitest';
import { STEPS, ACTS, SPEAKERS } from '../../src/story/steps.js';
import { createStoryRunner, currentIndex } from '../../src/story/runner.js';
import { resolveSite, SITE_DEFS } from '../../src/story/sites.js';
import { BOSSES } from '../../src/story/bosses/index.js';
import { buildCity, LAND } from '../../src/world/city.js';
import { newSave, migrate } from '../../src/core/save.js';
import { ROSTER } from '../../src/roster/characters.js';
import { PORTRAITS } from '../../src/ui/portraits.js';

const TYPES = ['start', 'reach', 'radio', 'broadcast', 'panels', 'title', 'fight', 'defend', 'boss', 'chase'];
const DASHES = [String.fromCharCode(8211), String.fromCharCode(8212)];
function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}

describe('story steps', () => {
  it('ids are unique and start with their act', () => {
    const ids = STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of STEPS) {
      expect(ACTS.some((a) => a.id === s.act), s.id).toBe(true);
      expect(s.id.startsWith(s.act + '.'), s.id).toBe(true);
    }
  });
  it('every step has a known type and what that type needs', () => {
    for (const s of STEPS) {
      expect(TYPES, s.id).toContain(s.type);
      if (['start', 'reach', 'fight', 'defend', 'boss', 'chase'].includes(s.type)) expect(SITE_DEFS[s.site], s.id).toBeTruthy();
      if (s.char) expect(ROSTER.some((c) => c.id === s.char), s.id).toBe(true);
      if (['radio', 'broadcast'].includes(s.type)) expect(s.lines.length, s.id).toBeGreaterThan(0);
      if (s.type === 'panels') expect(s.pages.length, s.id).toBeGreaterThan(0);
      if (s.type === 'fight' || s.type === 'defend') expect(s.waves.length, s.id).toBeGreaterThan(0);
      if (s.type === 'boss' || s.type === 'chase') expect(BOSSES[s.boss], s.id).toBeTruthy();
    }
  });
  it('every speaker is known, in lines and in balloons', () => {
    const whos = [];
    for (const s of STEPS) {
      for (const l of s.lines ?? []) whos.push(l.who);
      for (const pg of s.pages ?? []) for (const p of pg.panels) for (const b of p.balloons ?? []) whos.push(b.who);
    }
    for (const w of whos) expect(SPEAKERS[w], w).toBeTruthy();
    // And every speaker on the radio has a drawn portrait (not the fallback officer).
    for (const w of new Set(whos)) expect(PORTRAITS, w).toContain(w);
  });
  it('no em or en dashes in any story copy', () => {
    const all = strings(STEPS).concat(strings(ACTS), strings(SPEAKERS));
    expect(all.filter((s) => DASHES.some((d) => s.includes(d)))).toEqual([]);
  });
  it('every site resolves to land inside the city', () => {
    const city = buildCity();
    for (const name of Object.keys(SITE_DEFS)) {
      const s = resolveSite(city, name);
      expect(s, name).toBeTruthy();
      // On land, or up on something over the water (the bridge deck).
      if (s.y < 5) expect(city.landAt(s.x, s.z), name).not.toBe(LAND.water);
    }
    // Roof sites sit on their roofs.
    const roof = resolveSite(city, 'fiskRoof');
    expect(roof.y).toBeGreaterThan(150);
    expect(roof.arena.maxX - roof.arena.minX).toBeGreaterThan(20);
  });
});

describe('story runner', () => {
  it('walks the steps in order and ignores events for other steps', () => {
    const save = newSave(1);
    const r = createStoryRunner(STEPS, save.story);
    expect(r.step.id).toBe(STEPS[0].id);
    expect(r.complete(STEPS[2].id)).toBe(false);
    expect(r.complete(STEPS[0].id)).toBe(true);
    expect(r.step.id).toBe(STEPS[1].id);
    expect(save.story.step).toBe(STEPS[1].id);
    expect(save.story.done).toEqual([STEPS[0].id]);
  });
  it('a fresh save starts at the first step', () => {
    expect(currentIndex(STEPS, newSave(1).story)).toBe(0);
  });
  it('a saved step id that no longer exists falls back to the start of its act', () => {
    const story = { step: 'act1.someOldMission', done: [], choices: {} };
    expect(STEPS[currentIndex(STEPS, story)].id).toBe(STEPS.find((s) => s.act === 'act1').id);
    expect(currentIndex(STEPS, { step: 'nonsense', done: [], choices: {} })).toBe(0);
  });
  it('old saves that pointed at the swing with nothing done see the opening comic', () => {
    expect(migrate({ story: { step: 'prologue.swing', done: [] } }).story.step).toBe('prologue.open');
    expect(migrate({ story: { step: 'prologue.swing', done: ['prologue.open'] } }).story.step).toBe('prologue.swing');
  });
  it('a removed step after progress continues after the last step done', () => {
    const k = STEPS.findIndex((s) => s.id === 'act1.bank');
    const story = { step: 'act1.removed', done: STEPS.slice(0, k + 1).map((s) => s.id), choices: {} };
    expect(currentIndex(STEPS, story)).toBe(k + 1);
  });
  it('jump marks everything before as done; the end of the story is finished', () => {
    const save = newSave(1);
    const r = createStoryRunner(STEPS, save.story);
    r.jump('act1.rhino');
    expect(r.step.id).toBe('act1.rhino');
    expect(save.story.done).toContain('prologue.kingpin');
    r.jump(STEPS[STEPS.length - 1].id);
    r.complete(STEPS[STEPS.length - 1].id);
    expect(r.finished).toBe(true);
    // Reloaded from the save, still finished (and a step added later would come next).
    const again = createStoryRunner(STEPS, migrate(JSON.parse(JSON.stringify(save))).story);
    expect(again.finished).toBe(true);
  });
});
