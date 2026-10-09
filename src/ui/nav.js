// One way around every menu page (title, pause, settings, controls, slots, skills and suits,
// characters, city progress, multiplayer): a gamepad's D-pad or left stick moves between buttons by
// where they sit on screen, A presses, B (or Start) goes back, left and right change a value, LB and
// RB switch tabs; Esc goes back on the keyboard. Each page registers its node and its Back. Menu
// sounds (a tick on hover or move, select, back) come from here too.

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// The index of the box to move to from rects[from] in direction dir ('up', 'down', 'left',
// 'right'), or -1 if nothing lies that way. Boxes are DOMRect-like. Pure, unit tested.
export function nextFocus(rects, from, dir) {
  const cur = rects[from];
  if (!cur) return rects.length ? 0 : -1;
  const [dx, dy] = DIRS[dir];
  const cx = (cur.left + cur.right) / 2, cy = (cur.top + cur.bottom) / 2;
  let best = -1, bs = Infinity;
  rects.forEach((r, i) => {
    if (i === from || !r) return;
    // How far past the current box's edge it lies (it must lie past it, by a hair at least).
    const along = dx ? (dx > 0 ? r.left - cur.right : cur.left - r.right) : (dy > 0 ? r.top - cur.bottom : cur.top - r.bottom);
    const rcx = (r.left + r.right) / 2, rcy = (r.top + r.bottom) / 2;
    const centre = dx ? (rcx - cx) * dx : (rcy - cy) * dy;
    if (centre <= 1) return;
    // Off to the side: how far its span misses the current one's (0 if they overlap).
    const side = dx ? Math.max(0, r.top - cur.bottom, cur.top - r.bottom) : Math.max(0, r.left - cur.right, cur.left - r.right);
    // How far off the line it sits: by centres, or by the near edges (a full-width button above
    // a pair goes to the left one of the pair).
    const off = dx ? Math.min(Math.abs(rcy - cy), Math.abs(r.top - cur.top)) : Math.min(Math.abs(rcx - cx), Math.abs(r.left - cur.left));
    // Distances in 10 px steps, so a card tilted a degree or two still reads as rows and columns.
    const score = Math.round(Math.max(0, along) / 10) * 10 + side * 4 + off * 0.25;
    if (score < bs) { bs = score; best = i; }
  });
  return best;
}

// [data-scroll] boxes (the credits, the city progress table) take focus too: up and down scroll them.
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [data-scroll]';
const shown = (n) => n.isConnected && !n.classList.contains('hidden') && n.getClientRects().length > 0;

export function createNav({ sound = () => {}, unlock = () => {}, capturing = () => false } = {}) {
  const pages = [];
  let last = null, lastHover = null;
  const prev = new Map();
  const hold = { dir: null, t: 0 };

  function focusables(node) { return [...node.querySelectorAll(FOCUSABLE)].filter((n) => n.getClientRects().length > 0 && !n.closest('.hidden')); }
  function focus(n) {
    if (!n) return;
    n.focus({ preventScroll: true, focusVisible: true });
    n.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  function active() {
    let best = null;
    for (const p of pages) if (shown(p.node) && (!best || p.openedAt >= best.openedAt)) best = p;
    return best;
  }

  function register(node, back = null) {
    const p = { node, back, openedAt: performance.now() };
    pages.push(p);
    const wasHidden = () => node.classList.contains('hidden');
    let hidden = wasHidden();
    // When a page opens: the time (an Esc that opened it must not also close it) and first focus.
    new MutationObserver(() => {
      const now = wasHidden();
      if (hidden && !now) {
        p.openedAt = performance.now();
        requestAnimationFrame(() => { if (shown(node) && !node.contains(document.activeElement)) focus(focusables(node)[0]); });
      }
      hidden = now;
    }).observe(node, { attributes: true, attributeFilter: ['class'] });
    node.addEventListener('mouseover', (e) => {
      const t = e.target.closest?.(FOCUSABLE);
      if (t && t !== lastHover && node.contains(t)) { lastHover = t; sound('uiMove'); }
      if (!t) lastHover = null;
    });
    node.addEventListener('click', (e) => {
      const b = e.target.closest?.('button');
      if (!b || !node.contains(b)) return;
      unlock();
      sound(b.hasAttribute('data-back') ? 'uiBack' : 'uiSelect');
    }, true);
    node.addEventListener('change', (e) => { if (e.target.matches?.('input[type=checkbox], input[type=range]')) sound('uiMove'); });
    return p;
  }

  function goBack(p) {
    if (!p?.back) return false;
    sound('uiBack');
    p.back();
    return true;
  }

  // Esc on the keyboard: Back on whatever page is up. Captured first so the game never also reads
  // it (an Esc that resumed play must not pause it again).
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || capturing()) return;
    const p = active();
    if (!p?.back) return;
    e.preventDefault(); e.stopPropagation();
    if (performance.now() - p.openedAt < 300) return;
    unlock();
    goBack(p);
  }, true);

  function move(p, dir) {
    const f = document.activeElement;
    if (f?.hasAttribute?.('data-scroll') && p.node.contains(f)) {
      const was = f.scrollTop;
      f.scrollTop += dir === 'down' ? 90 : -90;
      if (f.scrollTop !== was) return;
    }
    const items = focusables(p.node);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    let i = nextFocus(items.map((n) => n.getBoundingClientRect()), at, dir);
    if (i < 0 && (dir === 'up' || dir === 'down')) i = dir === 'down' ? 0 : items.length - 1;
    if (i < 0 || i === at) return;
    focus(items[i]);
    sound('uiMove');
  }
  // Left and right on a value changes it; on anything else they move.
  function side(p, right) {
    const a = document.activeElement;
    if (a && p.node.contains(a)) {
      if (a.cycle) { a.cycle(right ? 1 : -1); sound('uiMove'); return; }
      if (a.type === 'range') {
        const st = parseFloat(a.step) || 0.1, v = Math.min(parseFloat(a.max), Math.max(parseFloat(a.min), parseFloat(a.value) + (right ? st : -st)));
        a.value = String(Math.round(v / st) * st); a.dispatchEvent(new Event('input', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      if (a.type === 'checkbox') { a.checked = !a.checked; a.dispatchEvent(new Event('change', { bubbles: true })); return; }
    }
    move(p, right ? 'right' : 'left');
  }
  function tab(p, dir) {
    const tabs = [...p.node.querySelectorAll('[data-tab]')];
    if (tabs.length < 2) return;
    const at = Math.max(0, tabs.findIndex((t) => t.classList.contains('on')));
    tabs[(at + dir + tabs.length) % tabs.length].click();
    requestAnimationFrame(() => focus(p.node.querySelector('[data-tab].on') ?? focusables(p.node)[0]));
  }
  function press(p) {
    const items = focusables(p.node);
    const a = document.activeElement;
    if (!a || !p.node.contains(a)) { focus(items[0]); return; }
    if (a.type === 'checkbox') { a.checked = !a.checked; a.dispatchEvent(new Event('change', { bubbles: true })); return; }
    const idx = items.indexOf(a);
    a.click();
    // A page that drew itself again on the press keeps the focus where it was.
    if (shown(p.node) && !p.node.contains(document.activeElement)) {
      const now = focusables(p.node);
      focus(now[Math.min(Math.max(0, idx), now.length - 1)]);
    }
  }

  // Polled by the game loop while a menu may be up.
  function update(dt = 1 / 60) {
    const p = active();
    const pad = [...(navigator.getGamepads?.() ?? [])].find((q) => q && q.connected);
    if (!p || !pad) { last = p; prev.clear(); hold.dir = null; return; }
    const btn = (i) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    const down = {
      up: btn(12) || ay < -0.6, down: btn(13) || ay > 0.6, left: btn(14) || ax < -0.6, right: btn(15) || ax > 0.6,
      a: btn(0), b: btn(1), start: btn(9), lb: btn(4), rb: btn(5),
    };
    // A page that just opened ignores whatever was already held (the press that opened it).
    if (p !== last) { last = p; for (const k in down) prev.set(k, down[k]); hold.dir = null; return; }
    const edge = (k) => { const was = prev.get(k) ?? false; prev.set(k, down[k]); return down[k] && !was; };
    // Directions repeat while held (after a beat), so a long list can be run down.
    const dir = ['up', 'down', 'left', 'right'].find((k) => down[k]) ?? null;
    let fire = null;
    for (const k of ['up', 'down', 'left', 'right']) if (edge(k)) fire = k;
    if (dir && dir === hold.dir) { hold.t -= dt; if (hold.t <= 0) { hold.t = 0.11; fire = dir; } } else { hold.dir = dir; hold.t = 0.4; }
    const a = edge('a'), b = edge('b'), st = edge('start'), lb = edge('lb'), rb = edge('rb');
    // Focus rings show while the pad drives (a mouse move hides them again).
    if (fire || a || b || st || lb || rb) document.body.classList.add('pad-nav');
    if (fire === 'up' || fire === 'down') move(p, fire);
    else if (fire) side(p, fire === 'right');
    if (lb) tab(p, -1);
    if (rb) tab(p, 1);
    if (a) press(p);
    if (b || st) goBack(p);
  }

  addEventListener('mousemove', () => document.body.classList.remove('pad-nav'), { passive: true });

  return {
    register, update, focusables,
    back: () => goBack(active()),
    get open() { return !!active(); },
    get active() { return active()?.node ?? null; },
  };
}
