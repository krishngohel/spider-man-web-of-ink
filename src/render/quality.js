const PRESETS = {
  high: { name: 'high', pixelRatioCap: 2, shadows: true, shadowMapSize: 2048, viewDistance: 1800,
    comic: { wobble: 1, hatch: 1, midDots: 1, skyDots: 1, colorEdges: 1, misreg: 1, palette: 0, paper: 1 } },
  medium: { name: 'medium', pixelRatioCap: 1.5, shadows: true, shadowMapSize: 1024, viewDistance: 1400,
    comic: { wobble: 1, hatch: 1, midDots: 1, skyDots: 1, colorEdges: 0.6, misreg: 0.6, palette: 0, paper: 1 } },
  low: { name: 'low', pixelRatioCap: 1, shadows: false, shadowMapSize: 0, viewDistance: 1000,
    comic: { wobble: 0, hatch: 0, midDots: 0, skyDots: 0, colorEdges: 0, misreg: 0, palette: 0, paper: 0 } },
};

export const QUALITY_NAMES = Object.keys(PRESETS);

export function getQuality(name) {
  return PRESETS[name] ?? PRESETS.high;
}
