// Data integrity across modules: every step id the code names exists, scenes splice where they
// say, sites resolve, content tables only name real districts, archetypes and steps.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { STEPS } from '../../src/story/steps.js';
import { PETER_SCENES, REMAP } from '../../src/story/acts/peter.js';
import { FINALE } from '../../src/story/acts/finale.js';
import { SITE_DEFS } from '../../src/story/sites.js';
import { buildCity } from '../../src/world/city.js';
import { buildCatalog, medalFor, BUGLE, BACKPACKS } from '../../src/content/catalog.js';
import { NOTES } from '../../src/content/notes.js';
import { CRIMES, DISTRICT_CRIMES } from '../../src/content/world.js';
import { ARCHETYPES } from '../../src/combat/enemies.js';

const ids = new Set(STEPS.map((s) => s.id));
const city = buildCity();
const districts = new Set(city.districts.map((d) => d.id));
const cat = buildCatalog(city);

function jsFiles(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) jsFiles(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('story links', () => {
  it('every step id named anywhere in the source is a real step (unlocks, gates, scene splices)', () => {
    const missing = [];
    for (const f of jsFiles('src')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/['"`]((?:prologue|act[1-4])\.[A-Za-z0-9_]+)['"`]/g)) if (!ids.has(m[1])) missing.push(`${m[1]} (${f})`);
    }
    expect(missing).toEqual([]);
  });
  it('every Peter scene and the finale splice in right after the step they name, whole and in order', () => {
    for (const sc of [...PETER_SCENES, FINALE]) {
      const i = STEPS.findIndex((s) => s.id === sc.after);
      expect(i, sc.after).toBeGreaterThanOrEqual(0);
      // A later scene may splice after the same step, so this scene's steps follow it as a block
      // somewhere after the anchor.
      const first = STEPS.findIndex((s) => s.id === sc.steps[0].id);
      expect(first, sc.steps[0].id).toBeGreaterThan(i);
      sc.steps.forEach((st, k) => expect(STEPS[first + k]?.id, `${sc.after} +${k}`).toBe(st.id));
    }
  });
  it('the scene moves point at real sites, and no moved scene is left at its old spot', () => {
    for (const [from, r] of Object.entries(REMAP)) {
      expect(SITE_DEFS[r.site], `${from} -> ${r.site}`).toBeTruthy();
      expect(r.sz).toBeGreaterThan(0);
    }
    const sceneIds = new Set([...PETER_SCENES, FINALE].flatMap((sc) => sc.steps.map((s) => s.id)));
    for (const s of STEPS.filter((q) => sceneIds.has(q.id))) {
      expect(REMAP[s.site], `${s.id} still at ${s.site}`).toBeFalsy();
      for (const pg of s.pages ?? []) for (const pn of pg.panels) expect(REMAP[pn.shot.at], `${s.id} panel at ${pn.shot.at}`).toBeFalsy();
    }
  });
  it('every comic panel is shot at a known site', () => {
    for (const s of STEPS) for (const pg of s.pages ?? []) for (const pn of pg.panels) expect(SITE_DEFS[pn.shot.at], `${s.id} ${pn.shot.at}`).toBeTruthy();
  });
});

describe('content data', () => {
  it('crime tables name real districts, real crimes, real archetypes and real story gates', () => {
    for (const [d, kinds] of Object.entries(DISTRICT_CRIMES)) {
      expect(districts.has(d), d).toBe(true);
      expect(kinds.length, d).toBeGreaterThan(0);
      for (const k of kinds) expect(CRIMES[k], `${d} ${k}`).toBeTruthy();
      // Every district has a crime open from the start (none gated behind the story only).
      expect(kinds.some((k) => !CRIMES[k].after), d).toBe(true);
    }
    for (const d of districts) expect(DISTRICT_CRIMES[d], `crimes for ${d}`).toBeTruthy();
    for (const [k, c] of Object.entries(CRIMES)) {
      expect(c.mix || c.objective, k).toBeTruthy();
      for (const a of c.mix ?? []) expect(ARCHETYPES[a], `${k} ${a}`).toBeTruthy();
      if (c.after) expect(ids.has(c.after), `${k} after ${c.after}`).toBe(true);
    }
    // Every crime kind turns up somewhere.
    expect(Object.keys(CRIMES).filter((k) => !Object.values(DISTRICT_CRIMES).flat().includes(k))).toEqual([]);
  });
  it('everything placed sits in a real district, and ids are unique across every kind', () => {
    const all = [...cat.backpacks, ...cat.photos, ...cat.tags, ...cat.pigeons, ...cat.hideouts, ...cat.research, ...cat.challenges, ...cat.races];
    for (const q of all) expect(districts.has(q.district), `${q.id} in ${q.district}`).toBe(true);
    const seen = all.map((q) => q.id);
    expect(new Set(seen).size).toBe(seen.length);
    for (const q of all) expect(Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z), q.id).toBe(true);
  });
  it('Taskmaster fights only call real archetypes, and every course ring is in the sky over the map', () => {
    for (const c of cat.challenges) for (const w of c.waves ?? []) for (const a of w) expect(ARCHETYPES[a], `${c.id} ${a}`).toBeTruthy();
    for (const c of [...cat.challenges, ...cat.races]) {
      for (const r of c.rings ?? []) {
        expect(r.y, c.id).toBeGreaterThan(15);
        expect(Math.abs(r.z), c.id).toBeLessThanOrEqual(940);
      }
    }
  });
  it('one memory per backpack, and no two the same', () => {
    expect(NOTES).toHaveLength(BACKPACKS);
    expect(new Set(NOTES).size).toBe(NOTES.length);
  });
  it('Bugle assignments have sane hours and unique ids', () => {
    expect(new Set(BUGLE.map((b) => b.id)).size).toBe(BUGLE.length);
    for (const b of BUGLE) if (b.hours) { expect(b.hours[0]).toBeGreaterThanOrEqual(0); expect(b.hours[1]).toBeLessThanOrEqual(24); expect(b.hours[0]).toBeLessThan(b.hours[1]); }
  });
  it('medals land on their boundaries: a time equal to a target earns it', () => {
    const c = { medals: [999, 60, 45, 30], ultimate: 25 };
    expect(medalFor(25, c)).toBe(4);
    expect(medalFor(25.01, c)).toBe(3);
    expect(medalFor(30, c)).toBe(3);
    expect(medalFor(45, c)).toBe(2);
    expect(medalFor(45.5, c)).toBe(1);
    expect(medalFor(500, c)).toBe(1); // finishing at all is bronze
  });
});
