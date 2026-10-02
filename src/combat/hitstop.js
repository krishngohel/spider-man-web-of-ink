import { TUNE } from './tuning.js';

// Hitstop (spec 1.8): only the two bodies in the exchange freeze, the attacker and the victim, for
// a few frames sized by the blow; the world keeps moving. The victim shakes while frozen, the
// attacker less, and the shake is a drawing offset only (collision never moves).

export const stopFor = (kind) => Math.min(TUNE.stopCap, TUNE.stop[kind] ?? TUNE.stop.light);

// A fast wobble that dies out with the stop: t is the time left, s the whole stop.
export function shake(t, s, amp = TUNE.shake) {
  if (t <= 0 || s <= 0) return { x: 0, z: 0 };
  const k = Math.sin(t * 190) * amp * Math.min(1, t / s);
  return { x: k, z: -k * 0.6 };
}
