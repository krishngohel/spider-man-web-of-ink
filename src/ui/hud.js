import { el } from './dom.js';
import { COPY } from './copy.js';
import { bindingLabel } from '../core/bindings.js';

const TIPS_KEY = 'web-of-ink-tips-v3'; // v3: tips rewritten for aimed webs

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
  const words = el('div', { class: 'words' });
  const fader = el('div', { class: 'fader' });
  // Cinema bars for a boss's entrance (spec 1.10).
  const letter = el('div', { class: 'letterbox' }, [el('i'), el('i')]);
  let letterT = null;
  const caption = el('div', { class: 'caption hidden' });
  const wpMark = el('div', { class: 'waypoint hidden' }, [el('i'), el('span')]);
  const xpBox = el('div', { class: 'xpbox hidden' }, [el('b'), el('span', { class: 'xpbar' }, [el('i')])]);
  let xpT = 0;
  let captionT = 0;
  const hud = el('div', { class: 'hud hidden' }, [lines, words, reticle, dot, noAnchor, speedo, fps, stateLabel, tip, lockHint, help]);
  const wordPool = Array.from({ length: 6 }, () => { const w = el('div', { class: 'word' }); words.append(w); return { el: w, t: 0 }; });
  let wordNext = 0;
  root.append(hud, toast, fader, letter);
  hud.append(caption, wpMark, xpBox);
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
      hang: bindingLabel(b, 'hang'), trick: bindingLabel(b, 'trick'), map: bindingLabel(b, 'map'),
      suitPower: bindingLabel(b, 'suitPower'), attack: bindingLabel(b, 'attack'), web: bindingLabel(b, 'web'), finisher: bindingLabel(b, 'finisher'),
      gadget: bindingLabel(b, 'gadget'), gadgetWheel: bindingLabel(b, 'gadgetWheel'), forward: bindingLabel(b, 'forward'), back: bindingLabel(b, 'back'),
      scan: bindingLabel(b, 'scan'), photo: bindingLabel(b, 'photo'),
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
    // A full-screen fade to black (a fall into the river, a subway ride).
    fade(on) { fader.classList.toggle('on', on); },
    letterbox(secs) { letter.classList.add('on'); clearTimeout(letterT); letterT = setTimeout(() => letter.classList.remove('on'), secs * 1000); },
    // A comic caption box at the top left (a district name as you enter it).
    caption(text, secs = 2.6) { caption.textContent = text; caption.classList.remove('hidden'); void caption.offsetWidth; caption.classList.add('show'); captionT = secs; },
    setLockHint(on) { lockHint.classList.toggle('hidden', !on); },
    // The first-play tip steps aside while story tips or dialogue are up (never more than one
    // voice telling the player what to do).
    setTipQuiet(on) { tip.classList.toggle('quiet', on); },
    toggleHelp() { renderHelp(); help.classList.toggle('hidden'); },
    get helpOpen() { return !help.classList.contains('hidden'); },
    lowPower() { toastText.textContent = COPY.lowPower; toast.classList.remove('hidden'); },
    // Gameplay events from the hero (and 'reel' from the game).
    onEvent(e) {
      if (e.type === 'noAnchor' || e.type === 'miss') noAnchorT = 0.6;
      const t = COPY.tips[tipIndex];
      if (t && e.type === t.done) {
        tipIndex++;
        try { localStorage.setItem(TIPS_KEY, String(tipIndex)); } catch { /* storage blocked */ }
        tip.classList.add('hidden');
        setTimeout(showTip, 900);
      }
    },
    // A comic sound word at screen point (x, y) in CSS pixels. Never over the middle of the screen:
    // a word that would land there slides out to the side (Gotham lesson: words over the action).
    word(text, x, y, kind = 'small') {
      if (!getSettings().soundWords) return;
      const w = wordPool[wordNext];
      wordNext = (wordNext + 1) % wordPool.length;
      const cx = innerWidth / 2, cy = innerHeight / 2;
      const dx = x - cx, dy = y - cy;
      const rx = innerWidth * 0.16, ry = innerHeight * 0.16;
      if (Math.abs(dx) < rx && Math.abs(dy) < ry) x = cx + (dx >= 0 ? 1 : -1) * rx * 1.15;
      x = Math.max(80, Math.min(innerWidth - 80, x));
      y = Math.max(60, Math.min(innerHeight - 80, y));
      w.el.textContent = text;
      w.el.className = `word ${kind}`;
      w.el.style.left = `${x}px`; w.el.style.top = `${y}px`;
      w.el.style.setProperty('--tilt', `${(Math.random() * 16 - 8).toFixed(1)}deg`);
      void w.el.offsetWidth; // restart the animation
      w.el.classList.add('show');
    },
    // The waypoint marker: on the point when it is on screen, pinned to the edge when it is not.
    waypoint(on, x = 0, y = 0, metres = 0, behind = false) {
      wpMark.classList.toggle('hidden', !on);
      if (!on) return;
      const m = 40;
      let sx = x, sy = y;
      if (behind) { sx = innerWidth - x; sy = innerHeight - m; }
      sx = Math.max(m, Math.min(innerWidth - m, sx)); sy = Math.max(m, Math.min(innerHeight - m, sy));
      wpMark.style.left = `${sx}px`; wpMark.style.top = `${sy}px`;
      wpMark.lastChild.textContent = `${Math.round(metres)} M`;
    },
    // XP gained: a small "+150 XP" with the level bar, for a few seconds.
    xp(amount, lv) {
      xpBox.firstChild.textContent = `+${amount} XP`;
      xpBox.lastChild.firstChild.style.width = `${lv.need ? (lv.into / lv.need) * 100 : 100}%`;
      xpBox.classList.remove('hidden'); xpT = 2.4;
    },
    resetTips() { tipIndex = 0; try { localStorage.removeItem(TIPS_KEY); } catch { /* storage blocked */ } showTip(); },
    update(dt, { fps: f, speed, anchor, state, dev, w, h }) {
      const s = getSettings();
      fps.classList.toggle('hidden', !s.showFps);
      if (s.showFps) fps.textContent = `${Math.round(f)} FPS`;
      speedNum.textContent = String(Math.round(speed * 3.6));
      stateLabel.textContent = dev ? state : '';
      noAnchorT -= dt;
      if (captionT > 0) { captionT -= dt; if (captionT <= 0) caption.classList.remove('show'); }
      if (xpT > 0) { xpT -= dt; if (xpT <= 0) xpBox.classList.add('hidden'); }
      noAnchor.classList.toggle('show', noAnchorT > 0);
      reticle.classList.toggle('valid', !!(anchor && anchor.valid));
      reticle.classList.toggle('invalid', !!anchor && !anchor.valid);
      if (anchor && anchor.visible) {
        dot.classList.remove('none');
        dot.classList.toggle('zip', !!anchor.zip);
        dot.style.left = `${anchor.x}px`; dot.style.top = `${anchor.y}px`;
      } else dot.classList.add('none');
      drawLines(speed, w, h);
    },
  };
}
