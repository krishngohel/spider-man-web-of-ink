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
