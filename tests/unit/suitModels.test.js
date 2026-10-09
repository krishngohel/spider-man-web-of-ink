import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SUITS } from '../../src/progress/progression.js';
import { ROSTER } from '../../src/roster/characters.js';
import { COPY } from '../../src/ui/copy.js';

// The JSON chunk of a GLB (no need for a loader to read names).
function glbJson(path) {
  const b = fs.readFileSync(path);
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}
const jointNames = (path) => { const j = glbJson(path); return j.skins[0].joints.map((i) => j.nodes[i].name); };
const hero = new Set(jointNames('public/assets/hero_m.glb'));
const files = [...new Set([
  ...SUITS.map((s) => s.model),
  ...ROSTER.map((c) => c.suit?.model),
].filter((m) => m && m !== 'tasm'))];

describe('fitted suit models', () => {
  it('there is one for most suits', () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
  });
  for (const id of files) {
    it(`${id}: the file exists, binds to hero joints only and stays small`, () => {
      const path = `public/assets/suits/${id}.glb`;
      expect(fs.existsSync(path)).toBe(true);
      const names = jointNames(path);
      expect(names.length).toBeGreaterThan(20);
      for (const n of names) expect(hero.has(n)).toBe(true);
      expect(fs.statSync(path).size).toBeLessThan(2.2 * 1024 * 1024);
      const j = glbJson(path);
      for (const m of j.meshes) for (const p of m.primitives) {
        expect(p.attributes.NORMAL).toBeDefined();
        expect(p.attributes.JOINTS_0).toBeDefined();
      }
    });
  }
  it('every fitted model is credited', () => {
    const credits = JSON.parse(fs.readFileSync('scripts/suit-credits.json', 'utf8'));
    const text = COPY.story.credits.map((c) => c.text).join('\n');
    for (const id of files) {
      expect(credits[id], id).toBeDefined();
      expect(text).toContain(`sketchfab.com/${credits[id].user}`);
    }
  });
});
