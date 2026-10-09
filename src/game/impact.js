// Impact frames, pure logic (the game owns what the numbers drive). Two tiers, after Gotham's
// impactTimeline: tier 1 is the short ink flash on a heavy hit; tier 2 is a comic-panel freeze on
// the blows that matter (a finisher, a knockout, a perfect dodge's counter, the first hit into a
// boss's opening): a hard black and white beat, then the world held still inside an inked panel
// with a big sound word, then a short release. Runs on a real-time clock in milliseconds, so slow
// motion and hit-stop never stretch it. The Impact frames setting: Full both tiers; Soft a dimmer
// tier 1 and a shorter tier 2 freeze with no panel; Off nothing at all.

// The tier 1 flash for a blow (kept for the HUD and the tests): strength, soft look, length.
export function impactFlash(setting, kind) {
  if (setting === 'off') return null;
  const soft = setting === 'soft';
  if (kind === 'finisher') return soft ? { strength: 0.55, soft: true, ms: 120 } : { strength: 1, soft: false, ms: 220 };
  return soft ? { strength: 0.5, soft: true, ms: 35 } : { strength: 1, soft: true, ms: 50 };
}

export const IMPACT = {
  // Tier 1: one beat (Full 50 ms, Soft 35 ms and dimmer).
  flash: 50, softFlash: 35, softLevel: 0.5,
  // Tier 2, Full: a hard beat, the frozen panel, the release. Soft: a pale beat, a shorter freeze.
  beat: 45, freeze: 320, release: 120, freezeLook: 0.62,
  softBeat: 35, softFreeze: 150, softRelease: 80, softFreezeLook: 0.35,
  // At most one tier 1 flash per gap1 and one tier 2 freeze per gap2 (a sweep that knocks out three
  // at once freezes once).
  gap1: 120, gap2: 1500,
};

// Which tier a blow earns. hit: { type: 'heroHit' | 'finisher' | 'counter', heavy, stop, ko,
// counter, boss, bossStun, target }. `judge` remembers boss openings already marked (the first hit
// into each opening gets the panel, not every hit of the flurry that follows).
export function createImpactJudge() {
  const opened = new WeakSet();
  return {
    tier(hit) {
      if (!hit) return 0;
      if (hit.type === 'finisher') return 2;
      if (hit.type !== 'heroHit') return 0;
      if (hit.ko || hit.counter) return 2;
      const t = hit.target;
      if (hit.boss && t) {
        if (!hit.bossStun) opened.delete(t);
        else if (!opened.has(t)) { opened.add(t); return 2; }
      }
      return hit.heavy && (hit.stop ?? 0) >= 0.08 ? 1 : 0;
    },
  };
}

export function createImpactTimeline(P = IMPACT) {
  let tier = 0, start = 0, mode = 'full';
  let last1 = -Infinity, last2 = -Infinity;
  const soft = () => mode === 'soft';
  const len = () => {
    if (tier === 1) return soft() ? P.softFlash : P.flash;
    return soft() ? P.softBeat + P.softFreeze + P.softRelease : P.beat + P.freeze + P.release;
  };
  return {
    get active() { return tier > 0; },
    get tier() { return tier; },
    // A blow of tier `want` at time `now` (ms) with the setting `m`. Returns the tier started, or 0.
    // A tier 2 inside the rate limit plays as a tier 1; nothing interrupts a bigger one.
    trigger(want, now, m = 'full') {
      if (m === 'off' || !(want >= 1)) return 0;
      const t = want >= 2 && now - last2 >= P.gap2 ? 2 : 1;
      if (tier && now - start < len()) {
        if (tier >= t) return 0;
      } else if (t === 1 && now - last1 < P.gap1) return 0;
      mode = m; tier = t; start = now; last1 = now;
      if (t === 2) last2 = now;
      return t;
    },
    // What the frame shows at `now`: impact (shader strength 0..1), soft (the pale look, never the
    // black and white one), freeze (the world holds still), panel (0 none, 1 up, 2 leaving).
    sample(now, out = {}) {
      out.impact = 0; out.soft = true; out.freeze = false; out.panel = 0; out.panelT = 0; out.tier = tier;
      if (!tier) return out;
      const e = now - start;
      if (e < 0) return out;
      if (tier === 1) {
        if (e >= len()) { tier = 0; out.tier = 0; return out; }
        out.impact = soft() ? P.softLevel : 1;
        return out;
      }
      const s = soft();
      const beat = s ? P.softBeat : P.beat, freeze = s ? P.softFreeze : P.freeze, release = s ? P.softRelease : P.release;
      const look = s ? P.softFreezeLook : P.freezeLook;
      out.soft = s;
      if (e < beat) { out.impact = s ? P.softLevel : 1; out.freeze = true; return out; }
      const f = e - beat;
      if (f < freeze) {
        out.impact = look; out.freeze = true;
        if (!s) { out.panel = 1; out.panelT = f / freeze; }
        return out;
      }
      const r = f - freeze;
      if (r < release) {
        out.impact = look * (1 - r / release);
        if (!s) { out.panel = 2; out.panelT = r / release; }
        return out;
      }
      tier = 0; out.tier = 0;
      return out;
    },
    cancel() { tier = 0; },
    // Test hook: forget the rate limits as well.
    reset() { tier = 0; last1 = -Infinity; last2 = -Infinity; },
  };
}

// The critical action-camera shot: on a finisher or a knockout, at most once every `gap` ms, never
// with camera shake off or the system's reduced motion asked for.
export const ACTION_GAP = 4000;
export function createActionGate(gap = ACTION_GAP) {
  let last = -Infinity;
  return {
    // May a shot start now? (Asking does not use the slot; mark() does, once a shot really runs.)
    want(now, { cameraShake = true, reducedMotion = false } = {}) {
      return !!cameraShake && !reducedMotion && now - last >= gap;
    },
    mark(now) { last = now; },
    reset() { last = -Infinity; },
  };
}

// Panel sound words: a different one each time (never the same twice running).
export const PANEL_WORDS = ['KRAKOW!', 'THWAKK!', 'BLAMM!', 'KA-POW!', 'WHUD!', 'SKRAKK!'];
export function panelWord(n) { return PANEL_WORDS[((n % PANEL_WORDS.length) + PANEL_WORDS.length) % PANEL_WORDS.length]; }
