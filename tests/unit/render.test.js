import { describe, it, expect } from 'vitest';
import { pixelRatioCap } from '../../src/render/renderer.js';

const high = { pixelRatioCap: 2 };
describe('pixel ratio', () => {
  it('caps a Mac at 1.25x and leaves a PC at its quality cap', () => {
    expect(pixelRatioCap(high, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari', 2)).toBe(1.25);
    expect(pixelRatioCap(high, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 2)).toBe(2);
    expect(pixelRatioCap(high, 'Mozilla/5.0 (Windows NT 10.0)', 1)).toBe(1);
    expect(pixelRatioCap({ pixelRatioCap: 1 }, 'Macintosh', 2)).toBe(1);
  });
});

import { buildShadowVolume, VOL, SHADOW_FLOOR } from '../../src/render/shadowVolume.js';
describe('shadow colour volume', () => {
  const districts = [
    { id: 'harbor', minX: 0, maxX: 1000, minZ: 0, maxZ: 1000 },
    { id: 'neon', minX: -1000, maxX: 0, minZ: 0, maxZ: 1000 },
  ];
  const v = buildShadowVolume(districts);
  it('has one RGBA texel per cell and covers the districts with padding', () => {
    expect(v.data.length).toBe(VOL.nx * VOL.ny * VOL.nz * 4);
    expect(v.box[0]).toBeLessThan(-1000);
    expect(v.box[0] + v.box[2]).toBeGreaterThan(1000);
  });
  it('never goes below the value floor', () => {
    for (let i = 0; i < v.data.length; i += 4) for (let c = 0; c < 3; c++) expect(v.data[i + c] / 255).toBeGreaterThanOrEqual(SHADOW_FLOOR - 1 / 255);
  });
  it('harbour shadows lean teal, Neon Square shadows lean magenta', () => {
    const at = (fx, fz) => { const ix = Math.floor(fx * VOL.nx), iz = Math.floor(fz * VOL.nz), o = ((0 * VOL.nz + iz) * VOL.nx + ix) * 4; return [v.data[o], v.data[o + 1], v.data[o + 2]]; };
    const harbor = at(0.78, 0.6), neon = at(0.22, 0.6);
    expect(harbor[1]).toBeGreaterThan(harbor[0]);
    expect(neon[0]).toBeGreaterThan(neon[1]);
  });
});
