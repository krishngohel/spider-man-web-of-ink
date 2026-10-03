// Synthesized sound: the THWIP of a web shot, wind that rises with speed, a snap when the line goes
// taut, landings, zips and launches. No audio files. The context starts on the first user gesture
// (browsers require it); every call before that is a no-op.

export function createSfx(getVolume) {
  let ctx = null, out = null, noise = null;
  let wind = null, windGain = null, windFilter = null;
  let windLevel = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    out = ctx.createGain();
    out.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    wind = ctx.createBufferSource();
    wind.buffer = noise; wind.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 300;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(out);
    wind.start();
    applyVolume();
    return true;
  }

  function applyVolume() {
    if (!out) return;
    const v = getVolume();
    out.gain.value = v.master * v.sfx;
  }

  function burst({ freq, freq2 = freq, q = 2, dur = 0.12, gain = 0.4, type = 'bandpass', attack = 0.004 }) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  function tone({ freq, freq2 = freq, dur = 0.15, gain = 0.3, type = 'sine' }) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  return {
    unlock: ensure,
    applyVolume,
    event(e) {
      if (!ctx) return;
      switch (e.type) {
        case 'thwip':
          burst({ freq: 4200, freq2: 1500, q: 1.6, dur: 0.11, gain: 0.35 });
          tone({ freq: 2100, freq2: 700, dur: 0.07, gain: 0.08, type: 'triangle' });
          break;
        case 'attach': burst({ freq: 900, freq2: 300, q: 4, dur: 0.09, gain: 0.25 }); break;
        case 'swingJump': burst({ freq: 1500, freq2: 4000, q: 1.2, dur: 0.16, gain: 0.32 }); break;
        case 'perfect':
          burst({ freq: 900, freq2: 3200, q: 1.0, dur: 0.18, gain: 0.3 });
          tone({ freq: 660, freq2: 990, dur: 0.12, gain: 0.08, type: 'triangle' });
          break;
        case 'wallRun': burst({ freq: 600, freq2: 1400, q: 0.9, dur: 0.2, gain: 0.22 }); break;
        case 'zip':
          burst({ freq: 3800, freq2: 1400, q: 1.6, dur: 0.1, gain: 0.3 });
          burst({ freq: 600, freq2: 2600, q: 0.9, dur: 0.35, gain: 0.25 });
          break;
        case 'launch': case 'vault': case 'wallJump': burst({ freq: 500, freq2: 1800, q: 0.8, dur: 0.3, gain: 0.3 }); break;
        case 'land': {
          const k = Math.min(1, (e.impact ?? 5) / 30);
          tone({ freq: 150, freq2: 45, dur: 0.18 + k * 0.2, gain: 0.15 + k * 0.45 });
          burst({ freq: 400, freq2: 120, q: 0.7, dur: 0.12 + k * 0.1, gain: 0.1 + k * 0.3, type: 'lowpass' });
          break;
        }
        case 'corner': burst({ freq: 900, freq2: 2600, q: 1.1, dur: 0.22, gain: 0.26 }); break;
        case 'mantle': burst({ freq: 420, freq2: 1100, q: 1.2, dur: 0.14, gain: 0.22 }); break;
        case 'hang': burst({ freq: 300, freq2: 520, q: 3, dur: 0.12, gain: 0.16 }); break;
        case 'wallStick': burst({ freq: 700, freq2: 250, q: 1.5, dur: 0.08, gain: 0.18 }); break;
        case 'perch': tone({ freq: 160, freq2: 70, dur: 0.12, gain: 0.25 }); break;
        case 'punch':
          burst({ freq: e.heavy ? 280 : 420, freq2: 120, q: 0.9, dur: e.heavy ? 0.16 : 0.09, gain: e.heavy ? 0.55 : 0.4, type: 'lowpass' });
          tone({ freq: e.heavy ? 110 : 160, freq2: 60, dur: 0.1, gain: e.heavy ? 0.4 : 0.22 });
          break;
        case 'whiff': burst({ freq: 1800, freq2: 700, q: 0.8, dur: 0.12, gain: 0.12 }); break;
        case 'hurt':
          tone({ freq: 200, freq2: 80, dur: 0.2, gain: 0.35 });
          burst({ freq: 600, freq2: 200, q: 0.8, dur: 0.15, gain: 0.3, type: 'lowpass' });
          break;
        case 'sense':
          tone({ freq: 1320, freq2: 1760, dur: 0.12, gain: 0.07, type: 'triangle' });
          tone({ freq: 1980, freq2: 1500, dur: 0.14, gain: 0.05, type: 'sine' });
          break;
        case 'webEmpty': tone({ freq: 900, freq2: 700, dur: 0.04, gain: 0.08, type: 'square' }); break;
        case 'webThrow': burst({ freq: 400, freq2: 1800, q: 0.9, dur: 0.25, gain: 0.35 }); break;
        case 'senseRed':
          // The perfect-dodge window: a sharp double tick; heavies get a low sting under it.
          tone({ freq: 2640, freq2: 2400, dur: 0.05, gain: 0.08, type: 'square' });
          if (e.heavy) tone({ freq: 180, freq2: 120, dur: 0.16, gain: 0.18, type: 'sawtooth' });
          break;
        case 'shot': burst({ freq: 2400, freq2: 300, q: 0.7, dur: 0.07, gain: 0.3 }); tone({ freq: 220, freq2: 80, dur: 0.06, gain: 0.18, type: 'square' }); break;
        case 'dodge': burst({ freq: 800, freq2: 2600, q: 0.8, dur: 0.18, gain: 0.22 }); break;
        case 'uppercut': burst({ freq: 300, freq2: 1600, q: 0.9, dur: 0.22, gain: 0.35 }); break;
        case 'gadget': burst({ freq: 3000, freq2: 900, q: 1.4, dur: 0.12, gain: 0.3 }); tone({ freq: 880, freq2: 440, dur: 0.08, gain: 0.08, type: 'triangle' }); break;
        case 'radio': burst({ freq: 2400, freq2: 1200, q: 3, dur: 0.12, gain: 0.08 }); break;
        case 'crackle': burst({ freq: 3000, freq2: 1500, q: 2, dur: 0.35, gain: 0.1 }); burst({ freq: 900, freq2: 2600, q: 4, dur: 0.15, gain: 0.06 }); break;
        case 'page': burst({ freq: 1200, freq2: 3400, q: 0.6, dur: 0.18, gain: 0.08 }); break;
        case 'stamp': tone({ freq: 140, freq2: 60, dur: 0.25, gain: 0.3 }); burst({ freq: 400, freq2: 200, q: 1, dur: 0.2, gain: 0.25 }); break;
        case 'enemyOut': tone({ freq: 330, freq2: 165, dur: 0.18, gain: 0.08, type: 'triangle' }); break;
        case 'noAnchor': tone({ freq: 240, freq2: 200, dur: 0.06, gain: 0.05, type: 'square' }); break;
        default: break;
      }
    },
    // Called every frame with the hero's speed (m/s).
    setSpeed(speed, dt) {
      if (!ctx) return;
      const want = Math.min(1, (speed / 55) ** 2);
      windLevel += (want - windLevel) * Math.min(1, dt * 4);
      windGain.gain.value = windLevel * 0.55;
      windFilter.frequency.value = 250 + windLevel * 2200;
    },
    get running() { return !!ctx && ctx.state === 'running'; },
  };
}
