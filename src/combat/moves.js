import { TUNE } from './tuning.js';
import { CLIP_DATA } from './clipData.js';

// The hero's moves (spec 1.4 to 1.6): what each one is, which clip plays it, and which one an
// attack press means right now. clips lists the preferred clips in order (Mixamo, then Gotham's
// mocap kicks); alt is the Quaternius clip used until the combat clips have loaded.
//   time: how long the move holds the hero (s); impact: when it lands (s, game time);
//   push and lift: what it does to the enemy (m/s); stop: the hitstop kind (TUNE.stop).

const L = TUNE.lightTime, I = TUNE.lightImpact;
export const MOVES = {
  jab: { clips: ['Punch_Jab'], alt: 'Punch_Jab', time: L, impact: I, push: 2.5, lift: 0, dmg: 1, stop: 'light' },
  cross: { clips: ['Punch_Cross'], alt: 'Punch_Cross', time: L, impact: I, push: 3, lift: 0, dmg: 1, stop: 'light' },
  round: { clips: ['Martelo_2', 'Kick_Round'], alt: 'Melee_Hook', time: L, impact: I + 0.02, push: 3.5, lift: 0, dmg: 1.15, stop: 'light', kick: true },
  ender: { clips: ['Armada', 'Kick_Spin'], alt: 'Melee_Hook', time: TUNE.enderTime, impact: 0.2, push: TUNE.enderPush * 2.4, lift: 2, dmg: 1.6, stop: 'ender', kick: true, knock: true },
  launcher: { clips: ['Flip_Kick', 'Kick_Front'], alt: 'Melee_Hook', time: 0.42, impact: 0.14, push: 0.5, lift: 11, dmg: 0.8, stop: 'launcher', kick: true },
  air1: { clips: ['Kick_Front'], alt: 'Punch_Jab', time: TUNE.airHitTime, impact: 0.1, push: 1.2, lift: 0, dmg: 1, stop: 'light', air: true, kick: true },
  air2: { clips: ['Knee_Strike'], alt: 'Punch_Cross', time: TUNE.airHitTime, impact: 0.1, push: 1.2, lift: 0, dmg: 1, stop: 'light', air: true, kick: true },
  air3: { clips: ['Scissor_Kick', 'Kick_Round'], alt: 'Melee_Hook', time: TUNE.airHitTime, impact: 0.11, push: 1.4, lift: 0, dmg: 1.1, stop: 'light', air: true, kick: true },
  spike: { clips: ['Hurricane_Kick', 'Kick_Flying'], alt: 'Melee_Hook', time: 0.4, impact: 0.15, push: 3, lift: -16, dmg: 1.6, stop: 'ender', air: true, kick: true, knock: true },
  strike: { clips: ['Flying_Kick', 'Kick_Flying'], alt: 'Melee_Hook', time: 0.9, impact: 0.85, push: 8, lift: 3, dmg: 1.6, stop: 'ender', kick: true, travel: true },
  throw: { clips: ['Shoulder_Throw', 'Pull_Rope'], alt: 'Melee_Hook', time: 0.5, impact: 0.25, push: 14, lift: 4, dmg: 1.2, stop: 'ender', knock: true },
};
const STRING = ['jab', 'cross', 'round', 'ender'];
const AIR = ['air1', 'air2', 'air3', 'spike'];

// Which move an attack press means (spec 1.4): by distance first, then height, then context.
//   d: horizontal distance to the target; dy: target height above the hero; step / airStep: how far
//   along the ground and air strings; holdT: how long attack has been held.
export function chooseMove({ d, dy = 0, step = 0, airStep = 0, grounded = true, webbed = false, holdT = 0 }) {
  if (d > TUNE.strikeBand) return null;
  if (webbed && d <= TUNE.lungeBand) return { key: 'throw', lunge: d > TUNE.closeBand };
  if (d > TUNE.lungeBand) return { key: 'strike', lunge: false };
  if (!grounded || dy > TUNE.airBand) return { key: AIR[airStep % AIR.length], lunge: d > TUNE.closeBand };
  if (holdT >= TUNE.launchHold) return { key: 'launcher', lunge: d > TUNE.closeBand };
  return { key: STRING[step % STRING.length], lunge: d > TUNE.closeBand };
}

// The first preferred clip that has loaded, else the fallback.
export function clipFor(move, have) {
  for (const c of move.clips) if (have.has(c)) return c;
  return move.alt;
}

// Where each mocap clip's useful part starts (clip seconds): the long studio wind-ups are skipped
// so the contact frame comes quickly (from Gotham's freeflow tuning).
export const CLIP_START = { Kick_Front: 0.25, Kick_Round: 0.5, Kick_Spin: 0.1, Kick_Flying: 0.05, Knee_Strike: 0.25 };

// A clip's start, contact and end in clip seconds. Clips without mocap data (the Quaternius
// punches) land a little before their middle.
export function clipTiming(clip, duration) {
  const d = CLIP_DATA[clip];
  if (d) return { start: CLIP_START[clip] ?? 0, contact: d.contact, end: d.duration };
  return { start: 0, contact: duration * 0.42, end: duration };
}

// The clip time to show t seconds into a move (spec 2.4, speed curves): the wind-up accelerates
// into the contact frame exactly at the move's impact, the recovery eases out over the rest.
// A travelling move (web strike) holds its reach until it arrives (arrivedAt), then recovers.
export function clipTimeAt(tm, M, t, arrivedAt = null) {
  if (M.travel) {
    if (arrivedAt === null) return tm.start + (tm.contact - tm.start) * 0.85 * Math.min(1, t / 0.25);
    const u = Math.min(1, (t - arrivedAt) / 0.3);
    return tm.contact + (tm.end - tm.contact) * (1 - (1 - u) * (1 - u));
  }
  if (t <= M.impact) return tm.start + (tm.contact - tm.start) * Math.pow(Math.max(0, t) / M.impact, 1.5);
  const u = Math.min(1, (t - M.impact) / Math.max(1e-3, M.time - M.impact));
  return tm.contact + (tm.end - tm.contact) * (1 - (1 - u) * (1 - u));
}

// A move can be followed from 55% of the way through (spec 1.4).
export const canChain = (move, t) => t >= move.time * TUNE.chainFrom;

// Presses are kept for 0.15 s, so a slightly early press still counts (REF Smash buffer).
export function createBuffer() {
  const at = new Map();
  return {
    press(kind, now) { at.set(kind, now); },
    take(kind, now) {
      const t = at.get(kind);
      if (t === undefined) return false;
      at.delete(kind);
      return now - t <= TUNE.buffer;
    },
    peek(kind, now) { const t = at.get(kind); return t !== undefined && now - t <= TUNE.buffer; },
    clear() { at.clear(); },
  };
}
