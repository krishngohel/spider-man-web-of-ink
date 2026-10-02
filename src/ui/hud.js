import { el } from './dom.js';
import { COPY } from './copy.js';
import { bindingLabel } from '../core/bindings.js';

const TIPS_KEY = 'web-of-ink-tips-v1';

// The in-play overlay: reticle, where the next web would stick, speed, frame rate, first-play tips
// (each leaves when you do what it asks: Gotham lesson, cards that linger get in the way), speed
// lines, the controls card and the one-time Low Power Mode note.
export function createHud(root, getSettings) {
  const reticle = el('div', { class: 'reticle' });
  const dot = el('div', { class: 'anchor-dot none' });
  const noAnchor = el('div', { class: 'noanchor' }, COPY.noAnchor);
  const speedNum = el('b', {}, '0');
  const speedo = el('div', { class: 'speedo' }, [speedNum, el('span', {}, 'KM/H')]);
  const fps = el('div', { class: 'fps' });
  const stateLabel = el('div', { class: 'statelabel' });
  const tip = el('div', { class: 'tip hidden' });
  const lockHint = el('div', { class: 'lockhint hidden' }, COPY.clickToPlay);
  const lines = el('canvas', { class: 'speedlines' });
  const toastText = el('span');
  const toast = el('div', { class: 'toast hidden' }, [toastText, el('button', { class: 'chip', onclick: () => toast.classList.add('hidden') }, COPY.ok)]);
  const help = el('div', { class: 'help hidden' });
  const hud = el('div', { class: 'hud hidden' }, [lines, reticle, dot, noAnchor, speedo, fps, stateLabel, tip, lockHint, help]);
  root.append(hud, toast);
  const lctx = lines.getContext('2d');

  let tipIndex = 0;
  try { tipIndex = Math.min(COPY.tips.length, parseInt(localStorage.getItem(TIPS_KEY) ?? '0', 10) || 0); } catch { tipIndex = 0; }
  let noAnchorT = 0;
  let lineSeed = 0;

  const keys = () => {
    const b = getSettings().bindings;
    return {
      swing: bindingLabel(b, 'swing'), jump: bindingLabel(b, 'jump'), zip: bindingLabel(b, 'zip'),
      dive: bindingLabel(b, 'dive'), help: bindingLabel(b, 'help'), pause: bindingLabel(b, 'pause'),
      move: ['forward', 'left', 'back', 'right'].map((a) => bindingLabel(b, a)).join(' '),
    };
  };
  const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const fill = (s, k) => s.replace(/\{(\w+)\}/g, (_, n) => esc(k[n] ?? n));

  function showTip() {
    if (tipIndex >= COPY.tips.length) { tip.classList.add('hidden'); return; }
    tip.innerHTML = fill(COPY.tips[tipIndex].text, keys());
    tip.classList.remove('hidden');
  }

  function renderHelp() {
    const k = keys();
    help.replaceChildren(el('h3', {}, COPY.help.title), ...COPY.help.rows.map(([key, what]) => el('div', { class: 'k' }, [el('b', {}, fill(key, k)), el('span', {}, fill(what, k))])));
  }

  function drawLines(speed, w, h) {
    const s = getSettings();
    const amt = s.speedLines ? Math.min(1, Math.max(0, (speed - 32) / 40)) : 0;
    if (lines.width !== Math.round(w / 2) || lines.height !== Math.round(h / 2)) { lines.width = Math.round(w / 2); lines.height = Math.round(h / 2); }
    lctx.clearRect(0, 0, lines.width, lines.height);
    if (amt <= 0) return;
    const cw = lines.width, ch = lines.height, cx = cw / 2, cy = ch / 2;
    lineSeed = (lineSeed + 1) % 997;
    lctx.strokeStyle = `rgba(255,255,255,${0.55 * amt})`;
    const n = Math.round(18 + 30 * amt);
    for (let i = 0; i < n; i++) {
      const r = Math.sin((i + 1) * 12.9898 + lineSeed * 0.37) * 43758.5453;
      const a = (r - Math.floor(r)) * Math.PI * 2;
      const r2 = Math.sin((i + 3) * 78.233 + lineSeed) * 12543.13;
      const len = 0.18 + 0.2 * (r2 - Math.floor(r2));
      const R = Math.hypot(cx, cy);
      const x0 = cx + Math.cos(a) * R, y0 = cy + Math.sin(a) * R;
      const x1 = cx + Math.cos(a) * R * (1 - len), y1 = cy + Math.sin(a) * R * (1 - len);
      lctx.lineWidth = 1 + 2 * amt;
      lctx.beginPath(); lctx.moveTo(x0, y0); lctx.lineTo(x1, y1); lctx.stroke();
    }
  }

  return {
    show(on) { hud.classList.toggle('hidden', !on); if (on) showTip(); },
    setLockHint(on) { lockHint.classList.toggle('hidden', !on); },
    toggleHelp() { renderHelp(); help.classList.toggle('hidden'); },
    get helpOpen() { return !help.classList.contains('hidden'); },
    lowPower() { toastText.textContent = COPY.lowPower; toast.classList.remove('hidden'); },
    // Gameplay events from the hero (and 'reel' from the game).
    onEvent(e) {
      if (e.type === 'noAnchor') noAnchorT = 0.8;
      const t = COPY.tips[tipIndex];
      if (t && e.type === t.done) {
        tipIndex++;
        try { localStorage.setItem(TIPS_KEY, String(tipIndex)); } catch { /* storage blocked */ }
        tip.classList.add('hidden');
        setTimeout(showTip, 900);
      }
    },
    resetTips() { tipIndex = 0; try { localStorage.removeItem(TIPS_KEY); } catch { /* storage blocked */ } showTip(); },
    update(dt, { fps: f, speed, anchor, state, dev, w, h }) {
      const s = getSettings();
      fps.classList.toggle('hidden', !s.showFps);
      if (s.showFps) fps.textContent = `${Math.round(f)} FPS`;
      speedNum.textContent = String(Math.round(speed * 3.6));
      stateLabel.textContent = dev ? state : '';
      noAnchorT -= dt;
      noAnchor.classList.toggle('show', noAnchorT > 0);
      if (anchor && anchor.visible) {
        dot.classList.remove('none');
        dot.classList.toggle('zip', !!anchor.zip);
        dot.style.left = `${anchor.x}px`; dot.style.top = `${anchor.y}px`;
      } else dot.classList.add('none');
      drawLines(speed, w, h);
    },
  };
}
