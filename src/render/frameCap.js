// Spots the browser itself holding the game at 30 fps: Safari does this whenever macOS is in Low
// Power Mode (which many Macs switch on automatically on battery), and Chrome's Energy Saver does
// the same. A cap looks different from a slow machine: the frames arrive at a steady 33 ms while
// the game's own work per frame is a fraction of that. A web page can't lift the cap, so the
// game's answer is to tell the player once how to (game.js shows the tip).

const WINDOW_MS = 6000;  // judged over this much play
const CAP_MIN = 31.5, CAP_MAX = 35.5; // a frame interval this close to 33.3 ms is the 30 fps cap
const STEADY = 0.85;     // share of the window's frames that must sit at the cap
const HEADROOM = 0.6;    // the game's own work must stay under this share of the frame

export function createFrameCapDetector() {
  let t = 0, n = 0, atCap = 0, work = 0, fired = false, capped = false;
  return {
    get capped() { return capped; },
    // Feed one frame: its interval and the game's own script time (both ms). Returns true once,
    // the first time a sustained cap is seen.
    frame(interval, scriptMs) {
      if (fired || !(interval > 0) || interval > 250) return false; // tab switches, stalls
      t += interval; n += 1; work += scriptMs;
      if (interval >= CAP_MIN && interval <= CAP_MAX) atCap += 1;
      if (t < WINDOW_MS) return false;
      const steady = atCap / n >= STEADY, light = work / n < interval * HEADROOM;
      t = 0; n = 0; atCap = 0; work = 0;
      if (steady && light) { capped = true; fired = true; return true; }
      return false;
    },
  };
}
