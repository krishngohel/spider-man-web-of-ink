// Where a comic sound word goes (ported from Gotham's placeWord): the whole word stays on screen,
// off the HUD boxes (objective card, boss bar, radio, waypoint, combat panel, captions) and off the
// other words still showing. Pure, so it is unit tested without a DOM.

// The pop animation peaks at 1.15 (style.css wordpop).
const POP = 1.15;

// Half the on-screen width and height of a word at its biggest (tilted, popped).
export function wordHalf(w, h, rotDeg = 0) {
  const r = (Math.abs(rotDeg) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return { hw: (POP * (w * c + h * s)) / 2, hh: (POP * (w * s + h * c)) / 2 };
}

// The word's box once its centre sits at (x, y).
export function wordBox(x, y, w, h, rotDeg = 0) {
  const { hw, hh } = wordHalf(w, h, rotDeg);
  return { left: x - hw, right: x + hw, top: y - hh, bottom: y + hh, width: 2 * hw, height: 2 * hh };
}

// The centre for a w x h word asked for at (x, y) on a view { w, h }. If it would cover a box in
// `avoid` (DOMRect-like), it takes the nearest spot just above, below, left or right of one of
// those boxes that stays on screen and covers none of them. Nowhere free: where it was, flagged
// `crowded` so the caller can try again with fewer boxes.
export function placeWord(x, y, w, h, rotDeg, view, avoid = [], m = 16) {
  const { hw, hh } = wordHalf(w, h, rotDeg);
  const x0 = hw + m, x1 = view.w - hw - m, y0 = hh + m, y1 = view.h - hh - m;
  const fit = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const px = fit(x, x0, x1), py = fit(y, y0, y1);
  const boxes = avoid.filter((b) => b && b.right - b.left > 0 && b.bottom - b.top > 0);
  const covers = (cx, cy) => boxes.some((b) => cx + hw > b.left && cx - hw < b.right && cy + hh > b.top && cy - hh < b.bottom);
  if (!covers(px, py)) return { x: px, y: py };
  let best = null, bd = Infinity;
  const tryAt = (cx, cy) => {
    if (cx < x0 - 1e-9 || cx > x1 + 1e-9 || cy < y0 - 1e-9 || cy > y1 + 1e-9 || covers(cx, cy)) return;
    const d = Math.hypot(cx - px, cy - py);
    if (d < bd) { bd = d; best = { x: cx, y: cy }; }
  };
  const gap = 6;
  for (const b of boxes) {
    tryAt(px, b.top - hh - gap);
    tryAt(px, b.bottom + hh + gap);
    tryAt(b.left - hw - gap, py);
    tryAt(b.right + hw + gap, py);
    // Corners too: a word beside a box in a corner of the screen often only fits diagonally.
    tryAt(b.left - hw - gap, b.top - hh - gap);
    tryAt(b.right + hw + gap, b.top - hh - gap);
    tryAt(b.left - hw - gap, b.bottom + hh + gap);
    tryAt(b.right + hw + gap, b.bottom + hh + gap);
  }
  return best ?? { x: px, y: py, crowded: true };
}

// The middle of the screen, where the action is: words slide out of it to the side first.
export function centreBox(view, k = 0.16) {
  const rx = view.w * k, ry = view.h * k, cx = view.w / 2, cy = view.h / 2;
  return { left: cx - rx, right: cx + rx, top: cy - ry, bottom: cy + ry };
}

// While a critical's action shot (and its impact panel) frames the blow, the middle third of the
// screen and most of its height is the blow itself (Gotham's actionFocusBox): words keep off it.
export function actionFocusBox(view) {
  return { left: view.w * 0.33, right: view.w * 0.67, top: view.h * 0.2, bottom: view.h * 0.82 };
}

// Words ({ x, y, w, h, rot }) that cover `focus` get a new spot beside it, on screen and off `ui` and
// the other words. Returns the moves ({ word, x, y }); words already clear of it are not listed.
export function moveOffFocus(words, focus, view, ui = []) {
  const moves = [];
  for (const word of words) {
    const b = wordBox(word.x, word.y, word.w, word.h, word.rot);
    if (!(b.right > focus.left && b.left < focus.right && b.bottom > focus.top && b.top < focus.bottom)) continue;
    const others = words.filter((o) => o !== word).map((o) => wordBox(o.x, o.y, o.w, o.h, o.rot));
    let p = placeWord(word.x, word.y, word.w, word.h, word.rot, view, [...ui, focus, ...others]);
    if (p.crowded) p = placeWord(word.x, word.y, word.w, word.h, word.rot, view, [...ui, focus]);
    moves.push({ word, x: p.x, y: p.y });
  }
  return moves;
}
