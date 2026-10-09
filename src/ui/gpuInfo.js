// Which GPU the browser draws with (for the FPS counter), and a one-time hint on the title screen
// when that looks like integrated graphics: laptops often hand the browser the weak GPU.
const HINT_KEY = 'web-of-ink-gpu-hint-v1';

// The raw WEBGL_debug_renderer_info string, e.g. "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU
// (0x000028A0) Direct3D11 vs_5_0 ps_5_0, D3D11)".
export function gpuRenderer(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { return 'unknown'; }
}

// The readable part: "NVIDIA GeForce RTX 4060 Laptop GPU".
export function gpuShortName(raw) {
  const angle = /^ANGLE \(([^,]+),\s*(.+?)(?:\s*\(0x[0-9a-f]+\))?(?:\s+Direct3D.*|\s+OpenGL.*|\s+Vulkan.*|,.*)?\)$/i.exec(raw);
  const name = angle ? angle[2] : raw;
  return name.replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function looksIntegrated(raw) {
  if (/Arc\(TM\) A\d|Arc A\d/i.test(raw)) return false; // Intel Arc cards are discrete
  return /Intel|AMD Radeon\(TM\) Graphics|Radeon\(TM\) Graphics|Radeon Graphics|Microsoft Basic Render|SwiftShader|llvmpipe/i.test(raw);
}

export function detectPlatform(nav = (typeof navigator !== 'undefined' ? navigator : null)) {
  const ua = `${nav?.userAgent ?? ''} ${nav?.platform ?? ''}`;
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return 'mac';
  if (/Win/i.test(ua)) return 'windows';
  return 'other';
}

export function gpuHintText(raw, platform) {
  const advice = platform === 'windows'
    ? 'open Windows Settings, System, Display, Graphics, pick your browser, set it to High performance and restart the browser.'
    : platform === 'mac'
      ? 'plug in and turn off Low Power Mode, since a Mac on battery holds the graphics back.'
      : "look in your browser's settings for a high performance graphics option.";
  return `Your browser is drawing with ${gpuShortName(raw)}, which looks like built-in graphics. For smooth swinging, ${advice}`;
}

// Shows the hint once; Got it keeps it away for good (per browser). The caller removes it when play
// starts, so it never sits over the game.
export function maybeShowGpuHint(root, raw, storage, platform = detectPlatform()) {
  if (!looksIntegrated(raw)) return null;
  try { if (storage?.getItem(HINT_KEY)) return null; } catch { /* storage blocked: show it */ }
  const box = document.createElement('div');
  box.className = 'gpu-hint';
  const text = document.createElement('p');
  text.textContent = gpuHintText(raw, platform);
  const ok = document.createElement('button');
  ok.className = 'mbtn';
  ok.textContent = 'Got it';
  ok.addEventListener('click', () => {
    box.remove();
    try { storage?.setItem(HINT_KEY, '1'); } catch { /* private window */ }
  });
  box.append(text, ok);
  root.appendChild(box);
  return box;
}
