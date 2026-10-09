// A one-link benchmark for the player's own machine (?bench=1): free swing, Spider-Man on the
// spawn roof's west edge looking out over the city at golden hour, then a few seconds of frames in
// each of several setups, taking one piece of the frame away at a time (the per-frame shadow redraw,
// the hull outlines, the comic shading, the ink composite, resolution, the crowd, the traffic),
// and a table to screenshot. Frame time against script time tells a GPU-bound machine (frames much
// longer than the script) from a CPU-bound one; draws and triangles are summed over every pass of a
// frame. The rows are also on window.__bench. Nothing here loads unless the URL asks for it.

const SETTLE = 1500, MEASURE = 4000;
export const BENCH_ROWS = ['As shipped', 'Shadows cached', 'No hull outlines', 'Comic shading off', 'No ink composite', 'Resolution 1x', 'Resolution 0.7x', 'No crowd', 'No traffic', '1x, cached, no crowd or traffic'];

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * 0.95)] ?? 0; };

export function gpuName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '').replace(/^ANGLE \((.*)\)$/, '$1');
  } catch { return ''; }
}

// The table as text (exported for the unit test).
export function formatBench(rows, { browser = '?', gpu = '?', screen = '?', quality = '?' } = {}) {
  const pad = (s, n) => String(s).padEnd(n);
  return [
    'WEB OF INK BENCHMARK  (screenshot this and send it)',
    `${browser}  GPU: ${gpu || '?'}`,
    `${screen}, quality ${quality}`,
    '',
    `${pad('setup', 33)}${pad('fps', 6)}${pad('frame ms', 10)}${pad('p95 ms', 9)}${pad('script ms', 11)}${pad('draws', 7)}${pad('tris k', 8)}pixels`,
    ...rows.map((r) => `${pad(r.name, 33)}${pad(r.fps, 6)}${pad(r.frame.toFixed(1), 10)}${pad(r.p95.toFixed(1), 9)}${pad(r.js.toFixed(1), 11)}${pad(r.calls, 7)}${pad(Math.round(r.tris / 1000), 8)}${r.px}`),
    '',
    'Click anywhere to close.',
  ].join('\n');
}

// hooks (from game.js): renderer, ink, scene, dynRes, crowd, state (state.stepMs is the frame's
// script time), getQuality(), setPixelRatio(pr or null for the game's own), basePixelRatio(),
// place() (stands the hero on the roof, camera behind), isClear() (in play, no comic or cinematic).
export function runPerfBench(h) {
  const { renderer, ink, scene, dynRes, crowd, state } = h;
  const panel = document.createElement('div');
  panel.className = 'perf-bench';
  panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:300;background:#f5ecd4;color:#12101c;border:3px solid #12101c;box-shadow:4px 4px 0 #12101c;padding:16px 20px;font:14px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre;max-width:94vw;max-height:90vh;overflow:auto';
  panel.textContent = 'Benchmark: getting ready...';
  document.body.appendChild(panel);

  const quality = h.getQuality();
  const comicOn = { ...quality.comic };
  const comicOff = Object.fromEntries(Object.keys(quality.comic).map((k) => [k, 0]));
  const named = (names) => { const out = []; scene.traverse((o) => { if (names.includes(o.name)) out.push(o); }); return out; };
  const hulls = () => { const out = []; scene.traverse((o) => { if (o.isMesh && o.visible && o.material?.userData?.hull) out.push(o); }); return out; };
  let hidden = [];
  const hide = (list) => { for (const o of list) if (o.visible) { o.visible = false; hidden.push(o); } };
  const reset = () => {
    ink.debug.cachedShadows = false; ink.debug.skipComposite = false;
    ink.setComic(comicOn);
    for (const o of hidden) o.visible = true;
    hidden = [];
    crowd.setHidden(false);
    h.setPixelRatio(null);
  };
  const base = h.basePixelRatio();
  const apply = {
    'As shipped': () => {},
    'Shadows cached': () => { ink.debug.cachedShadows = true; },
    'No hull outlines': () => {}, // hulls are found after the settle (crowd figures come and go)
    'Comic shading off': () => { ink.setComic(comicOff); },
    'No ink composite': () => { ink.debug.skipComposite = true; },
    'Resolution 1x': () => { h.setPixelRatio(1); },
    'Resolution 0.7x': () => { h.setPixelRatio(base * 0.7); },
    'No crowd': () => { crowd.setHidden(true); hide(named(['pedestrians'])); },
    'No traffic': () => { hide(named(['traffic', 'parkedCars'])); },
    '1x, cached, no crowd or traffic': () => { h.setPixelRatio(1); ink.debug.cachedShadows = true; crowd.setHidden(true); hide(named(['pedestrians', 'traffic', 'parkedCars'])); },
  };

  // Draw calls and triangles summed over every pass of a frame (shadow, colour, composite).
  let calls = 0, tris = 0;
  const orig = renderer.render.bind(renderer);
  renderer.render = (s, c) => { orig(s, c); calls += renderer.info.render.calls; tris += renderer.info.render.triangles; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (ms) => new Promise((resolve) => {
    const ft = [], js = [], dc = [], tr = [];
    let last = performance.now();
    const end = last + ms;
    const tick = (now) => {
      ft.push(now - last); js.push(state.stepMs ?? 0); dc.push(calls); tr.push(tris);
      calls = 0; tris = 0; last = now;
      if (now < end) requestAnimationFrame(tick); else resolve({ ft, js, dc, tr });
    };
    calls = 0; tris = 0;
    requestAnimationFrame(tick);
  });

  async function run() {
    for (let i = 0; i < 300 && !state.ready; i++) await wait(100);
    for (let i = 0, clear = 0; i < 200 && clear < 5; i++) { clear = h.isClear() ? clear + 1 : 0; await wait(150); }
    const wasDyn = dynRes.enabled;
    dynRes.setEnabled(false);
    const rows = [];
    for (const name of BENCH_ROWS) {
      reset();
      apply[name]();
      h.place();
      panel.textContent = `Benchmark running (${rows.length + 1} of ${BENCH_ROWS.length}): ${name}\nKeep this tab in front and don't touch anything.`;
      await wait(SETTLE);
      if (name === 'No hull outlines') hide(hulls());
      const r = await frames(MEASURE);
      const fm = med(r.ft);
      rows.push({ name, fps: Math.round(1000 / Math.max(fm, 0.1)), frame: fm, p95: p95(r.ft), js: med(r.js), calls: med(r.dc), tris: med(r.tr), px: `${renderer.domElement.width}x${renderer.domElement.height}` });
    }
    reset();
    renderer.render = orig;
    dynRes.setEnabled(wasDyn);
    h.setPixelRatio(null);

    const text = formatBench(rows, {
      browser: navigator.userAgent.match(/(Edg\/[\d.]+|Firefox\/[\d.]+|Version\/[\d.]+ Safari|Chrome\/[\d.]+)/)?.[0] ?? 'browser?',
      gpu: gpuName(renderer.getContext()),
      screen: `screen ${innerWidth}x${innerHeight} at ${window.devicePixelRatio || 1}x, refresh about ${dynRes.refreshHz} Hz`,
      quality: quality.name,
    });
    panel.textContent = text;
    console.log(text);
    window.__bench = rows;
    panel.addEventListener('click', () => panel.remove());
  }
  run().catch((err) => {
    reset();
    renderer.render = orig;
    panel.textContent = 'Benchmark failed: ' + err.message;
    window.__bench = { error: err.message };
    console.error(err);
  });
}
