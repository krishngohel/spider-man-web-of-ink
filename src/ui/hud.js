import { el } from './dom.js';
import { COPY } from './copy.js';
import { bindingLabel } from '../core/bindings.js';
import { placeWord, wordBox, centreBox, actionFocusBox, moveOffFocus } from './wordPlace.js';
import { createNoticeQueue } from './noticeQueue.js';

const TIPS_KEY = 'web-of-ink-tips-v4'; // v4: tips rewritten for swing assist and zip points
const WORD_LIFE = 750; // ms, the wordpop animation in style.css

// The HUD boxes a sound word keeps off (whichever are showing).
const AVOID = ['.objective:not(.hidden)', '.bossbar:not(.hidden)', '.dlg-panel.show', '.waypoint:not(.hidden)', '.cb-panel', '.cb-combo:not(.hidden)',
  '.cb-gadget', '.caption.show', '.alertbox.show', '.stimer:not(.hidden)', '.stip', '.tip:not(.hidden):not(.quiet)', '.notice.show', '.xpbox:not(.hidden)', '.speedo:not(.hidden)', '.lockhint:not(.hidden)', '.cb-prompts', '.help:not(.hidden)'];

// The in-play overlay: reticle, where the next web would stick, speed, frame rate, first-play tips
// (each leaves when you do what it asks: Gotham lesson, cards that linger get in the way), speed
// lines, the controls card and short timed notices (the Low Power Mode note).
export function createHud(root, getSettings) {
  const reticle = el('div', { class: 'reticle' });
  const dot = el('div', { class: 'anchor-dot none' });
  const noAnchor = el('div', { class: 'noanchor' }, COPY.noAnchor);
  const speedNum = el('b', {}, '0');
  const speedo = el('div', { class: 'speedo' }, [speedNum, el('span', {}, 'KM/H')]);
  const fps = el('div', { class: 'fps' });
  let gpuName = ''; // the GPU the browser draws with, beside the frame rate
  const stateLabel = el('div', { class: 'statelabel' });
  const tip = el('div', { class: 'tip hidden' });
  const lockHint = el('div', { class: 'lockhint hidden' }, COPY.clickToPlay);
  const lines = el('canvas', { class: 'speedlines' });
  // A notice card under the boss bar: timed, nothing to click, only in play.
  const notice = el('div', { class: 'notice' });
  const notices = createNoticeQueue({
    render(text) {
      notice.textContent = text;
      // Below the boss bar and the challenge timer when they are up.
      let top = 16;
      for (const q of ['.bossbar:not(.hidden)', '.stimer:not(.hidden)']) { const r = document.querySelector(q)?.getBoundingClientRect(); if (r && r.height) top = Math.max(top, r.bottom + 12); }
      notice.style.top = `${top}px`;
      notice.classList.add('show');
    },
    hide() { notice.classList.remove('show'); },
  });
  const help = el('div', { class: 'help hidden' });
  const words = el('div', { class: 'words' });
  const fader = el('div', { class: 'fader' });
  // Cinema bars for a boss's entrance (spec 1.10).
  const letter = el('div', { class: 'letterbox' }, [el('i'), el('i')]);
  let letterT = null;
  const caption = el('div', { class: 'caption hidden' });
  // Alerts (crimes) slide in at the right, apart from the caption box.
  const alertBox = el('div', { class: 'alertbox' });
  let alertT = 0;
  // Captions queue (one at a time, never overwriting each other), duplicates dropped.
  const captionQ = [];
  let captionText = '';
  const wpMark = el('div', { class: 'waypoint hidden' }, [el('i'), el('span')]);
  const xpBox = el('div', { class: 'xpbox hidden' }, [el('b'), el('span', { class: 'xpbar' }, [el('i')])]);
  let xpT = 0;
  let captionT = 0;
  const hud = el('div', { class: 'hud hidden' }, [lines, words, reticle, dot, noAnchor, speedo, fps, stateLabel, tip, lockHint, help]);
  // Ten words can be up at once (a busy fight); each remembers its box while it shows.
  const wordPool = Array.from({ length: 10 }, () => { const w = el('div', { class: 'word' }); words.append(w); return { el: w, until: 0, box: null }; });
  const wordSize = new Map();
  let wordNext = 0;
  root.append(hud, notice, fader, letter);
  hud.append(caption, wpMark, xpBox, alertBox);
  const lctx = lines.getContext('2d');

  let tipIndex = 0;
  try { tipIndex = Math.min(COPY.tips.length, parseInt(localStorage.getItem(TIPS_KEY) ?? '0', 10) || 0); } catch { tipIndex = 0; }
  let noAnchorT = 0;
  let lineSeed = 0;
  // A critical's action shot: ink speed lines rushing in on the blow (screen point, start, length
  // in ms), and the middle of the screen kept clear of words until focusUntil.
  const burst = { x: 0, y: 0, t0: -1e9, ms: 1000 };
  let focusUntil = -1e9;
  let keepOff = null; // another box words keep off until focusUntil (the impact panel's word)

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

  let tipT = 0;
  function showTip() {
    tipT = 0;
    if (tipIndex >= COPY.tips.length) { tip.classList.add('hidden'); return; }
    tip.innerHTML = fill(COPY.tips[tipIndex].text, keys());
    tip.classList.remove('hidden');
  }

  function renderHelp() {
    const k = keys();
    help.replaceChildren(el('h3', {}, COPY.help.title), ...COPY.help.rows.map(([key, what]) => el('div', { class: 'k' }, [el('b', {}, fill(key, k)), el('span', {}, fill(what, k))])));
  }

  // The action shot's speed lines: dark ink wedges from the screen edges toward the blow, leaving
  // a clear ring round it, thinning out over the burst.
  function drawBurst(now) {
    const k = (now - burst.t0) / burst.ms;
    if (k < 0 || k >= 1) return;
    const cw = lines.width, ch = lines.height, cx = burst.x / 2, cy = burst.y / 2;
    const R = Math.hypot(Math.max(cx, cw - cx), Math.max(cy, ch - cy));
    const fade = k < 0.08 ? k / 0.08 : k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
    lctx.fillStyle = `rgba(18,16,28,${0.75 * fade})`;
    const seed = Math.floor(burst.t0) % 997;
    const n = 54;
    for (let i = 0; i < n; i++) {
      const r = Math.sin((i + 1) * 12.9898 + seed * 0.37) * 43758.5453, r2 = Math.sin((i + 5) * 78.233 + seed) * 12543.13;
      const a = ((i + (r - Math.floor(r)) * 0.6) / n) * Math.PI * 2;
      const inner = R * (0.2 + 0.18 * (r2 - Math.floor(r2)) + 0.12 * k);
      const half = (0.006 + 0.012 * (r - Math.floor(r))) * Math.PI;
      lctx.beginPath();
      lctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      lctx.lineTo(cx + Math.cos(a - half) * R * 1.05, cy + Math.sin(a - half) * R * 1.05);
      lctx.lineTo(cx + Math.cos(a + half) * R * 1.05, cy + Math.sin(a + half) * R * 1.05);
      lctx.closePath(); lctx.fill();
    }
  }
  function drawLines(speed, w, h) {
    const s = getSettings();
    const amt = s.speedLines ? Math.min(1, Math.max(0, (speed - 32) / 40)) : 0;
    if (lines.width !== Math.round(w / 2) || lines.height !== Math.round(h / 2)) { lines.width = Math.round(w / 2); lines.height = Math.round(h / 2); }
    lctx.clearRect(0, 0, lines.width, lines.height);
    if (s.speedLines) drawBurst(performance.now());
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
    setGpu(name) { gpuName = name; },
    show(on) { hud.classList.toggle('hidden', !on); if (on) showTip(); },
    // A full-screen fade to black (a fall into the river, a subway ride).
    fade(on) { fader.classList.toggle('on', on); },
    // Cinema bars; the HUD fades out while they are up and back in after.
    letterbox(secs) {
      letter.classList.add('on');
      document.body.classList.add('cine'); document.body.classList.remove('cine-out');
      clearTimeout(letterT);
      letterT = setTimeout(() => {
        letter.classList.remove('on');
        document.body.classList.remove('cine'); document.body.classList.add('cine-out');
        letterT = setTimeout(() => document.body.classList.remove('cine-out'), 400);
      }, secs * 1000);
    },
    // The bars held up for as long as a cinematic runs (src/ui/cinematic.js), then down.
    letterboxHold(on) {
      clearTimeout(letterT); letterT = null;
      if (on) { letter.classList.add('on'); document.body.classList.add('cine'); document.body.classList.remove('cine-out'); return; }
      if (!letter.classList.contains('on')) return;
      letter.classList.remove('on');
      document.body.classList.remove('cine'); document.body.classList.add('cine-out');
      letterT = setTimeout(() => document.body.classList.remove('cine-out'), 400);
    },
    get letterboxed() { return letter.classList.contains('on'); },
    // A comic caption box at the top left (a district name as you enter it).
    caption(text, secs = 2.6) {
      if (captionT > 0) {
        if (text === captionText || captionQ.some((q) => q.text === text)) return;
        captionQ.push({ text, secs });
        if (captionQ.length > 3) captionQ.shift();
        captionT = Math.min(captionT, 1.2); // the one showing makes way sooner
        return;
      }
      captionText = text;
      caption.textContent = text; caption.classList.remove('hidden'); void caption.offsetWidth; caption.classList.add('show'); captionT = secs;
    },
    // An alert at the right edge (a crime nearby), with its own slot.
    alert(text, secs = 4) {
      alertBox.textContent = text;
      // Under the objective card, whatever its height.
      const ob = document.querySelector('.objective:not(.hidden)')?.getBoundingClientRect();
      alertBox.style.top = `${Math.max(120, ob && ob.height ? ob.bottom + 14 : 0)}px`;
      alertBox.classList.remove('show'); void alertBox.offsetWidth; alertBox.classList.add('show');
      alertT = secs;
    },
    setLockHint(on) { lockHint.classList.toggle('hidden', !on); },
    // The first-play tip steps aside while story tips or dialogue are up (never more than one
    // voice telling the player what to do).
    setTipQuiet(on) { tip.classList.toggle('quiet', on); },
    toggleHelp() { renderHelp(); help.classList.toggle('hidden'); },
    get helpOpen() { return !help.classList.contains('hidden'); },
    // A short notice for a few seconds (waits for play, never needs a click).
    notice(text, secs = 9) { notices.push(text, secs); },
    lowPower() { notices.push(COPY.lowPower, 10); },
    get noticeShowing() { return notices.showing; },
    // Gameplay events from the hero (and 'reel' from the game).
    onEvent(e) {
      if (e.type === 'noAnchor' || e.type === 'miss') noAnchorT = 0.6;
      const t = COPY.tips[tipIndex];
      if (t && e.type === t.done && getSettings().tips) {
        tipIndex++;
        try { localStorage.setItem(TIPS_KEY, String(tipIndex)); } catch { /* storage blocked */ }
        tip.classList.add('hidden');
        setTimeout(showTip, 900);
      }
    },
    // A comic sound word at screen point (x, y) in CSS pixels. Never over the middle of the screen
    // (a word that would land there slides out to the side: Gotham lesson, words over the action),
    // never over a HUD box (objective, boss bar, radio, waypoint, combat panel, captions), and off
    // the other words still showing (ui/wordPlace.js).
    word(text, x, y, kind = 'small') {
      if (!getSettings().soundWords) return;
      const now = performance.now();
      // The oldest slot, or a free one.
      let w = wordPool.find((q) => q.until <= now);
      if (!w) { w = wordPool[wordNext]; wordNext = (wordNext + 1) % wordPool.length; }
      w.until = 0;
      const view = { w: innerWidth, h: innerHeight };
      // Just after a critical the middle is the blow itself (the action shot frames it there).
      const mid = now < focusUntil ? actionFocusBox(view) : centreBox(view);
      if (x > mid.left && x < mid.right && y > mid.top && y < mid.bottom) x = view.w / 2 + (x >= view.w / 2 ? 1 : -1) * (mid.right - view.w / 2) * 1.15;
      const tilt = Math.random() * 16 - 8;
      w.el.textContent = text;
      w.el.className = `word ${kind}`;
      // Measured once per word and size (one layout), then from the cache.
      const key = `${kind}:${text}`;
      let size = wordSize.get(key);
      if (!size) { size = { w: w.el.offsetWidth, h: w.el.offsetHeight }; if (size.w) wordSize.set(key, size); }
      const ui = [];
      for (const q of AVOID) for (const n of document.querySelectorAll(q)) { const r = n.getBoundingClientRect(); if (r.width && r.height) ui.push(r); }
      if (keepOff && now < focusUntil) ui.push(keepOff);
      const live = wordPool.filter((q) => q !== w && q.until > now && q.box).map((q) => q.box);
      let p = placeWord(x, y, size.w, size.h, tilt, view, [...ui, mid, ...live]);
      // Crowded: overlapping another word beats covering the HUD or the middle.
      if (p.crowded) p = placeWord(x, y, size.w, size.h, tilt, view, [...ui, mid]);
      if (p.crowded) p = placeWord(x, y, size.w, size.h, tilt, view, ui);
      w.box = wordBox(p.x, p.y, size.w, size.h, tilt);
      w.at = { x: p.x, y: p.y, w: size.w, h: size.h, rot: tilt };
      w.until = now + WORD_LIFE;
      w.el.style.left = `${p.x}px`; w.el.style.top = `${p.y}px`;
      w.el.style.setProperty('--tilt', `${tilt.toFixed(1)}deg`);
      void w.el.offsetWidth; // restart the animation
      w.el.classList.add('show');
    },
    // A critical: the action shot frames the blow at screen point (x, y). Speed lines rush in on
    // it, and for `ms` the middle of the screen stays clear of words (any word already there steps
    // aside).
    critical(x, y, ms = 1300, lines = true, avoid = null) {
      const now = performance.now();
      focusUntil = now + ms;
      if (avoid) keepOff = avoid;
      if (lines) { burst.x = x; burst.y = y; burst.t0 = now; }
      const view = { w: innerWidth, h: innerHeight };
      const live = wordPool.filter((q) => q.until > now && q.at);
      const ui = keepOff ? [keepOff] : [];
      for (const q of AVOID) for (const n of document.querySelectorAll(q)) { const r = n.getBoundingClientRect(); if (r.width && r.height) ui.push(r); }
      for (const m of moveOffFocus(live.map((q) => ({ ...q.at, q })), actionFocusBox(view), view, ui)) {
        const q = m.word.q;
        q.at.x = m.x; q.at.y = m.y;
        q.box = wordBox(m.x, m.y, q.at.w, q.at.h, q.at.rot);
        q.el.style.left = `${m.x}px`; q.el.style.top = `${m.y}px`;
      }
    },
    get focusUntil() { return focusUntil; },
    // Test hook: the boxes of the words showing now.
    liveWords() { const now = performance.now(); return wordPool.filter((q) => q.until > now && q.box).map((q) => ({ text: q.el.textContent, ...q.box })); },
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
    update(dt, { fps: f, speed, anchor, state, dev, w, h, play = true }) {
      const s = getSettings();
      notices.tick(dt, play);
      // Tutorial tips off: the first-play tip and the story's tips stay hidden.
      document.body.classList.toggle('no-tips', !s.tips);
      fps.classList.toggle('hidden', !s.showFps);
      if (s.showFps) fps.textContent = `${Math.round(f)} FPS${gpuName ? `  ${gpuName}` : ''}`;
      speedNum.textContent = String(Math.round(speed * 3.6));
      speedo.classList.toggle('hidden', !s.showSpeed);
      // The crosshair only in the air (the swing finds its own anchor; on the ground it is noise).
      reticle.classList.toggle('hidden', state === 'ground' || state === 'hang');
      // A first-play tip moves on by itself after a while: never a card parked on screen.
      if (s.tips && !tip.classList.contains('hidden') && !tip.classList.contains('quiet')) {
        tipT += dt;
        if (tipT > 14) { tipT = 0; tipIndex++; try { localStorage.setItem(TIPS_KEY, String(tipIndex)); } catch { /* storage blocked */ } tip.classList.add('hidden'); setTimeout(showTip, 20000); }
      }
      stateLabel.textContent = dev ? state : '';
      noAnchorT -= dt;
      if (captionT > 0) {
        captionT -= dt;
        if (captionT <= 0) {
          caption.classList.remove('show'); captionText = '';
          const next = captionQ.shift();
          if (next) setTimeout(() => this.caption(next.text, captionQ.length ? Math.min(next.secs, 2.2) : next.secs), 260);
        }
      }
      if (alertT > 0) { alertT -= dt; if (alertT <= 0) alertBox.classList.remove('show'); }
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
