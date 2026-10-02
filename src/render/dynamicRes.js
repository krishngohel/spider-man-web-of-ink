// Dynamic resolution: a safety net that trades a little sharpness for a steady frame rate when
// the machine is busy (a game or a video in the background, a weak GPU, battery saver).
//
// It works in steps of 5% of the internal render scale, never below `min`, and is deliberately
// slow and one-sided so it never visibly pumps:
// - down: when more than 10% of the frames in a one-second window miss the display's refresh
//   (a frame took over 1.5 refresh periods), one step, or two when a third of them miss;
// - up: one step after three seconds without misses. A climb that brings misses back within two
//   seconds is undone and doubles the wait before the next try (up to a minute), so under a
//   steady load it settles instead of pumping.
// Missed frames are the only signal. GPU timer queries looked tempting for measuring headroom, but
// with vsync on the GPU clocks down when it has slack, so its measured time stays near the budget
// whatever the load.
// After any change it waits a second before judging again, so the resize itself is not counted.
//
// The refresh rate is measured from the first frames' spacing and snapped to a common rate, and
// measured again if frames later arrive clearly faster than that.
const RATES = [30, 50, 60, 72, 75, 90, 100, 120, 144, 165, 170, 180, 200, 240, 280, 360];

export function snapRefresh(hz) {
  let best = RATES[0];
  for (const r of RATES) if (Math.abs(r - hz) < Math.abs(best - hz)) best = r;
  return best;
}

// The Render scale setting and dynamic resolution's own scale both shrink the same pixel ratio,
// so they multiply together. Each has its own floor (Render scale stops at 0.5, dynamic
// resolution's `min` defaults to 0.6), but the *product* can still fall well under either one on
// a weak GPU (0.5 * 0.6 = 0.3): floor the combined scale instead of trusting the factors alone.
export function sanitizeResScale(renderScale, dynResScale, floor = 0.5) {
  return Math.max(floor, renderScale * dynResScale);
}

// missLimit: the share of a second's frames allowed to miss the refresh before a step down. At
// 60 Hz a 10% allowance tolerated about 54 fps of visible judder forever; a few percent aims at a
// steady refresh while still ignoring the odd hitch. start: the scale to begin at (a high-DPI
// screen starts a little low and climbs while there is headroom, instead of stuttering first).
export function createDynamicRes({ min = 0.6, max = 1, step = 0.05, missLimit = 0.1, start = max, onChange = () => {} } = {}) {
  let enabled = true;
  let scale = Math.min(max, Math.max(min, start));
  let period = 1000 / 60;
  let refreshKnown = false;
  const early = [];
  let winT = 0, frames = 0, misses = 0, fast = 0;
  let settle = 1000;         // ms to ignore after a change (and at startup)
  let quiet = 0;             // ms of on-time frames since the last change
  let upWait = 3000;         // quiet needed before a step up; doubles after each failed climb
  let sinceUp = 99;          // windows judged since the last step up

  function set(next) {
    next = Math.min(max, Math.max(min, Math.round(next / step) * step));
    if (Math.abs(next - scale) < 1e-6) return;
    scale = next;
    settle = 1000;
    onChange(scale);
  }

  function judge() {
    const missRatio = frames ? misses / frames : 0;
    sinceUp += 1;
    if (missRatio > missLimit) {
      quiet = 0;
      if (sinceUp <= 2) {
        // The last step up went one step too far: back to the last good scale, and wait twice
        // as long before trying again (misses caused by something we do not measure, like
        // another program, would otherwise make it climb and drop every few seconds).
        upWait = Math.min(60000, upWait * 2);
        set(scale - step);
      } else set(scale - (missRatio > 0.33 ? 2 : 1) * step);
      return;
    }
    if (scale >= max) return;
    quiet += 1000;
    if (quiet >= upWait) { quiet = 0; sinceUp = 0; set(scale + step); }
  }

  return {
    get scale() { return enabled ? scale : max; },
    get refreshHz() { return Math.round(1000 / period); },
    get enabled() { return enabled; },
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      settle = 1000;
      onChange(on ? scale : max);
    },
    // The browser itself is holding the page to `hz` (Low Power Mode, Energy Saver): judge
    // frames against that, and go back to full sharpness, since a lower resolution can't beat a
    // cap and would only blur the picture.
    capTo(hz) {
      period = 1000 / hz;
      refreshKnown = true;
      quiet = 0;
      set(max);
    },
    // dt: ms since the last frame.
    update(dt) {
      if (!(dt > 0) || dt > 250) return; // tab switches, breakpoints, loading stalls
      if (!refreshKnown) {
        early.push(dt);
        if (early.length >= 90) {
          const s = [...early].sort((a, b) => a - b);
          period = 1000 / snapRefresh(1000 / s[s.length >> 1]);
          refreshKnown = true;
        }
        return;
      }
      if (!enabled) return;
      if (settle > 0) { settle -= dt; return; }
      frames += 1;
      if (dt > period * 1.5) misses += 1;
      if (dt < period * 0.85) fast += 1;
      winT += dt;
      if (winT >= 1000) {
        // Mostly faster than the assumed refresh: the startup frames were slow, measure again.
        if (fast > frames / 2) { refreshKnown = false; early.length = 0; }
        else judge();
        winT = 0; frames = 0; misses = 0; fast = 0;
      }
    },
  };
}
