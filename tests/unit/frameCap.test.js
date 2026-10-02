// tests/unit/frameCap.test.js
import { describe, it, expect } from 'vitest';
import { createFrameCapDetector } from '../../src/render/frameCap.js';

// Feeds `secs` seconds of frames: each frame `interval` ms apart (with a little jitter) and
// `script` ms of the game's own work.
function feed(d, { secs, interval, script, jitter = 0.4 }) {
  let seen = false;
  for (let t = 0; t < secs * 1000; t += interval) {
    const j = (Math.sin(t) * jitter);
    if (d.frame(interval + j, script)) seen = true;
  }
  return seen;
}

describe('createFrameCapDetector', () => {
  it('spots a browser holding the game at 30 fps while the game itself has plenty of headroom', () => {
    const d = createFrameCapDetector();
    expect(feed(d, { secs: 10, interval: 33.3, script: 6 })).toBe(true);
    expect(d.capped).toBe(true);
  });
  it('fires only once', () => {
    const d = createFrameCapDetector();
    feed(d, { secs: 10, interval: 33.3, script: 6 });
    expect(feed(d, { secs: 10, interval: 33.3, script: 6 })).toBe(false);
  });
  it('stays quiet at a normal 60 fps', () => {
    const d = createFrameCapDetector();
    expect(feed(d, { secs: 20, interval: 16.7, script: 6 })).toBe(false);
  });
  it('stays quiet when the game really is slow (its own work fills the frame)', () => {
    const d = createFrameCapDetector();
    expect(feed(d, { secs: 20, interval: 33.3, script: 28 })).toBe(false);
  });
  it('stays quiet when the frame rate wanders around 30 (a struggling GPU, not a cap)', () => {
    const d = createFrameCapDetector();
    expect(feed(d, { secs: 20, interval: 33.3, script: 6, jitter: 9 })).toBe(false);
  });
  it('needs a sustained stretch, not a moment', () => {
    const d = createFrameCapDetector();
    expect(feed(d, { secs: 2, interval: 33.3, script: 6 })).toBe(false);
  });
});
