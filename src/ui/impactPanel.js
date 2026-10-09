// The tier 2 impact panel (after Gotham's impactPanel): the frozen frame inside a tilted ink border
// on a paper gutter, a halftone burst behind the hit and a big sound word in a top corner clear of
// the HUD. Built once; show() places it per trigger, set() runs every frame and only
// touches the DOM when the state changes (0 hidden, 1 up, 2 leaving). Under the HUD, so the HUD and
// the sound words draw on top of it.
export function createImpactPanel(root, rng = Math.random) {
  const el = document.createElement('div');
  el.className = 'impact-panel';
  el.innerHTML = '<div class="ip-burst"></div><div class="ip-frame"></div><div class="ip-word"></div>';
  root.insertBefore(el, root.firstChild);
  const word = el.lastChild;
  let state = 0;
  return {
    get state() { return state; },
    get el() { return el; },
    // (x, y): the hit in CSS pixels. The word takes the top corner on the other side of the hit.
    show(x, y, text, view = { w: innerWidth, h: innerHeight }) {
      el.style.setProperty('--ix', `${Math.round(x)}px`);
      el.style.setProperty('--iy', `${Math.round(y)}px`);
      const tilt = (1.5 + rng() * 2) * (rng() < 0.5 ? -1 : 1);
      el.style.setProperty('--tilt', `${tilt.toFixed(2)}deg`);
      el.style.setProperty('--wtilt', `${(-tilt * 2.5 - 4).toFixed(1)}deg`);
      word.textContent = text;
      // Top right, clear of the captions (top left) and the health bars (bottom left); a hit up in
      // that corner puts it top middle instead.
      const right = !(x > view.w * 0.6 && y < view.h * 0.4);
      word.style.right = right ? '9vmin' : 'auto';
      word.style.left = right ? 'auto' : '34vmin';
      word.style.top = '10vmin';
    },
    // The word's box at full size (it pops up from 60%), for sound words to keep off.
    wordRect() {
      const r = word.getBoundingClientRect(), k = state === 1 ? 1 : 1 / 0.6, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      const hw = (r.width * k) / 2 + 8, hh = (r.height * k) / 2 + 8;
      return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh, width: 2 * hw, height: 2 * hh };
    },
    set(next) {
      if (next === state) return;
      state = next;
      el.className = next === 1 ? 'impact-panel on' : next === 2 ? 'impact-panel on out' : 'impact-panel';
    },
  };
}
