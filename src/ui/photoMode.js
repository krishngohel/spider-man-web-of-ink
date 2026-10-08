import { BUGLE_HEADLINES, BUGLE_SUBHEADS, COMIC_CAPTIONS, PHOTO_UI } from './photoCopy.js';
import { EMOTES } from '../hero/emotes.js';

// Photo mode (after Insomniac's): the world holds still, the HUD goes, and a camera orbits the
// hero. A side card picks the filter, the frame (none, a comic panel, the Daily Bugle's front page),
// a pose, the hour and the field of view; Space takes the shot, framed, ready to save.
//   Mouse: drag to orbit, wheel to zoom. Keys: WASD orbit and zoom, R/F up and down, Q/E field of
//   view, 1 to 4 filters, Space shot, H hides the card, Esc leaves. A pad: sticks orbit and zoom.
const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'on') for (const [ev, f] of Object.entries(v)) n.addEventListener(ev, f); else n.setAttribute(k, v); }
  for (const c of [].concat(kids)) n.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
};
const FILTERS = [['none', 'Ink'], ['noir', 'Noir'], ['pop', 'Pop'], ['sepia', 'Sepia']];
const FRAMES = [['none', 'None'], ['comic', 'Comic panel'], ['bugle', 'Daily Bugle']];
const POSES = [{ id: 'none', label: 'Natural' }, ...EMOTES.filter((e) => !e.loop || /Dance|Breakdance|Robot|Freeze/.test(e.clip))];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function createPhotoMode(root, { capture, setFilter, getHour, setHour, playPose, onExit, onShot }) {
  const cam = { yaw: 0, pitch: 0.15, dist: 4.5, up: 0, fov: 50 };
  let open = false, filter = 0, frame = 0, pose = 0, hidden = false, drag = null;
  const keys = new Set();
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const val = (t) => el('span', { class: 'pm-val' }, t);
  const fVal = val(''), frVal = val(''), poVal = val(''), hrVal = val(''), fovVal = val('');
  const row = (label, v, prev, next) => el('div', { class: 'pm-row' }, [el('b', {}, label), el('button', { class: 'pm-arrow', on: { click: prev } }, '<'), v, el('button', { class: 'pm-arrow', on: { click: next } }, '>')]);
  const thumb = el('img', { class: 'pm-thumb hidden', alt: '' });
  const save = el('a', { class: 'pm-save hidden', download: 'web-of-ink.png' }, 'SAVE IMAGE');
  const card = el('div', { class: 'pm-card' }, [
    el('h2', {}, PHOTO_UI.title),
    el('p', { class: 'pm-hint' }, PHOTO_UI.hint),
    row('Filter', fVal, () => step('filter', -1), () => step('filter', 1)),
    row('Frame', frVal, () => step('frame', -1), () => step('frame', 1)),
    row('Pose', poVal, () => step('pose', -1), () => step('pose', 1)),
    row('Hour', hrVal, () => step('hour', -1), () => step('hour', 1)),
    row('Lens', fovVal, () => step('fov', -1), () => step('fov', 1)),
    el('div', { class: 'pm-buttons' }, [el('button', { class: 'mbtn pm-shot', on: { click: () => shot() } }, 'TAKE SHOT'), el('button', { class: 'mbtn', on: { click: () => leave() } }, 'BACK')]),
    thumb, save,
  ]);
  const wrap = el('div', { class: 'pm hidden' }, [card]);
  root.append(wrap);

  function render() {
    fVal.textContent = FILTERS[filter][1]; frVal.textContent = FRAMES[frame][1];
    poVal.textContent = POSES[pose].label; hrVal.textContent = `${Math.floor(getHour()).toString().padStart(2, '0')}:00`;
    fovVal.textContent = `${Math.round(cam.fov)} deg`;
    card.classList.toggle('hidden', hidden);
  }
  function step(what, d) {
    if (what === 'filter') { filter = (filter + d + FILTERS.length) % FILTERS.length; setFilter(FILTERS[filter][0]); }
    if (what === 'frame') frame = (frame + d + FRAMES.length) % FRAMES.length;
    if (what === 'pose') { pose = (pose + d + POSES.length) % POSES.length; playPose(POSES[pose].id === 'none' ? null : POSES[pose]); }
    if (what === 'hour') setHour((Math.floor(getHour()) + d + 24) % 24);
    if (what === 'fov') cam.fov = Math.max(20, Math.min(90, cam.fov + d * 5));
    render();
  }

  // The shot, framed on a 2D canvas.
  function compose(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const f = FRAMES[frame][0], W = img.width, H = img.height;
        const cv = document.createElement('canvas');
        const g = cv.getContext('2d');
        const head = 'Bangers, Impact, sans-serif';
        if (f === 'bugle') {
          cv.width = Math.round(H * 0.95); cv.height = Math.round(H * 1.25);
          const cw = cv.width, ch = cv.height, m = cw * 0.05;
          g.fillStyle = '#f2ecdc'; g.fillRect(0, 0, cw, ch);
          g.fillStyle = '#12101c'; g.textAlign = 'center';
          g.font = `${Math.round(cw * 0.11)}px ${head}`; g.fillText('THE DAILY BUGLE', cw / 2, m + cw * 0.1);
          g.fillRect(m, m + cw * 0.125, cw - 2 * m, 4);
          g.font = `${Math.round(cw * 0.022)}px Georgia, serif`; g.fillText('NEW YORK\'S FINEST NEWSPAPER  *  ONE DOLLAR  *  LATE CITY EDITION', cw / 2, m + cw * 0.155);
          g.fillRect(m, m + cw * 0.165, cw - 2 * m, 2);
          const hl = pick(BUGLE_HEADLINES);
          let size = Math.round(cw * 0.085);
          g.font = `${size}px ${head}`;
          while (g.measureText(hl).width > cw - 2 * m && size > 20) { size -= 2; g.font = `${size}px ${head}`; }
          g.fillText(hl, cw / 2, m + cw * 0.27);
          g.font = `italic ${Math.round(cw * 0.026)}px Georgia, serif`; g.fillText(pick(BUGLE_SUBHEADS), cw / 2, m + cw * 0.31);
          // The photo, cropped to the column, with a caption rule under it.
          const py = m + cw * 0.34, pw = cw - 2 * m, ph = pw * 0.62;
          const sAsp = W / H, dAsp = pw / ph;
          const sw = sAsp > dAsp ? H * dAsp : W, sh = sAsp > dAsp ? H : W / dAsp;
          g.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh, m, py, pw, ph);
          g.lineWidth = 3; g.strokeRect(m, py, pw, ph);
          g.font = `${Math.round(cw * 0.02)}px Georgia, serif`; g.textAlign = 'left';
          g.fillText('Photo: Peter Parker, Daily Bugle', m, py + ph + cw * 0.03);
          // Columns of copy below (grey lines read as print).
          g.fillStyle = 'rgba(18,16,28,0.55)';
          const top = py + ph + cw * 0.055, colW = (pw - m) / 3;
          for (let c = 0; c < 3; c++) for (let y = top; y < ch - m; y += cw * 0.018) g.fillRect(m + c * (colW + m / 2), y, colW * (0.75 + 0.25 * Math.random()), cw * 0.007);
        } else {
          cv.width = W; cv.height = H;
          g.drawImage(img, 0, 0);
          if (f === 'comic') {
            const b = Math.round(H * 0.035);
            g.strokeStyle = '#12101c'; g.lineWidth = b; g.strokeRect(b / 2, b / 2, W - b, H - b);
            g.fillStyle = '#f2ecdc'; g.lineWidth = b * 0.18;
            g.strokeStyle = '#f2ecdc'; g.strokeRect(b * 1.1, b * 1.1, W - b * 2.2, H - b * 2.2);
            const cap = pick(COMIC_CAPTIONS);
            g.font = `${Math.round(H * 0.045)}px ${head}`;
            const tw = g.measureText(cap).width, bx = b * 1.6, by = b * 1.6;
            g.fillStyle = '#f7e36a'; g.fillRect(bx, by, tw + H * 0.05, H * 0.075);
            g.strokeStyle = '#12101c'; g.lineWidth = 4; g.strokeRect(bx, by, tw + H * 0.05, H * 0.075);
            g.fillStyle = '#12101c'; g.textBaseline = 'middle'; g.fillText(cap, bx + H * 0.025, by + H * 0.0385);
          }
        }
        resolve(cv.toDataURL('image/png'));
      };
      img.src = src;
    });
  }
  async function shot() {
    card.classList.add('hidden');
    await new Promise((r) => requestAnimationFrame(() => r()));
    const url = await compose(capture());
    thumb.src = url; thumb.classList.remove('hidden');
    save.href = url; save.classList.remove('hidden');
    card.classList.toggle('hidden', hidden);
    onShot?.();
  }
  function leave() { if (open) { open = false; wrap.classList.add('hidden'); setFilter('restore'); playPose(null); onExit?.(); } }
  addEventListener('keydown', (e) => {
    if (!open) return;
    keys.add(e.code);
    if (e.code === 'Escape' || e.code === 'KeyO') { leave(); e.preventDefault(); }
    else if (e.code === 'Space' || e.code === 'Enter') { shot(); e.preventDefault(); }
    else if (e.code === 'KeyH') { hidden = !hidden; render(); }
    else if (/Digit[1-4]/.test(e.code)) { filter = Number(e.code.slice(5)) - 1; setFilter(FILTERS[filter][0]); render(); }
  });
  addEventListener('pointerdown', (e) => { if (open && e.target.tagName === 'CANVAS') drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointermove', (e) => {
    if (!open || !drag) return;
    cam.yaw -= (e.clientX - drag.x) * 0.006; cam.pitch = Math.max(-0.6, Math.min(1.2, cam.pitch + (e.clientY - drag.y) * 0.004));
    drag = { x: e.clientX, y: e.clientY };
  });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('wheel', (e) => { if (open) cam.dist = Math.max(1.4, Math.min(16, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });

  return {
    get open() { return open; },
    get cam() { return cam; },
    show(startYaw) {
      open = true; hidden = false; cam.yaw = startYaw + Math.PI; cam.pitch = 0.15; cam.dist = 4.5; cam.up = 0; cam.fov = 50;
      thumb.classList.add('hidden'); save.classList.add('hidden');
      wrap.classList.remove('hidden'); render();
    },
    hide: leave,
    // Keys held and a pad's left stick move the camera.
    update(dt, input) {
      const k = (c) => keys.has(c);
      cam.yaw += ((k('KeyA') ? 1 : 0) - (k('KeyD') ? 1 : 0)) * dt * 1.4;
      cam.dist = Math.max(1.4, Math.min(16, cam.dist * (1 + ((k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0)) * dt * 1.2)));
      cam.up = Math.max(-1.5, Math.min(4, cam.up + ((k('KeyR') ? 1 : 0) - (k('KeyF') ? 1 : 0)) * dt * 1.5));
      if (k('KeyQ') || k('KeyE')) { cam.fov = Math.max(20, Math.min(90, cam.fov + (k('KeyE') ? 1 : -1) * dt * 25)); render(); }
      if (input?.device === 'pad') {
        cam.yaw -= (input.move?.x ?? 0) * dt * 2;
        cam.dist = Math.max(1.4, Math.min(16, cam.dist * (1 - (input.move?.y ?? 0) * dt)));
      }
    },
  };
}
