// The impact frame for a blow, from the Impact frames setting. Full: the ink flash as designed
// (a short pale one on heavy hits, the hard black and white panel on finishers). Soft: shorter and
// dimmer, never the hard panel. Off: none. Returns null for no flash.
export function impactFlash(setting, kind) {
  if (setting === 'off') return null;
  const soft = setting === 'soft';
  if (kind === 'finisher') return soft ? { strength: 0.55, soft: true, ms: 120 } : { strength: 1, soft: false, ms: 220 };
  return soft ? { strength: 0.5, soft: true, ms: 35 } : { strength: 1, soft: true, ms: 50 };
}
