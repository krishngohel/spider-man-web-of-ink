import { EMOTE_PAGES } from '../hero/emotes.js';

// The emote wheel: the same comic dial as the gadget wheel, outside the fight HUD (emotes are for
// free roam). Mouse or stick picks a slice; jump flips the page; letting go of the key plays it.
const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const c of [].concat(kids)) n.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
};

export function createEmoteWheel(root, { has = () => true } = {}) {
  const title = el('div', { class: 'emote-title' }, EMOTE_PAGES[0].title);
  const hint = el('div', { class: 'emote-page' }, '');
  const wheel = el('div', { class: 'cb-wheel emote-wheel hidden' }, [title, hint]);
  const N = EMOTE_PAGES[0].emotes.length;
  const slots = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const label = el('b', {}, '');
    const s = el('div', { class: 'cb-slot' }, [label]);
    s.style.left = `${50 + Math.cos(a) * 38}%`; s.style.top = `${50 + Math.sin(a) * 38}%`;
    wheel.append(s);
    return { el: s, label, a, m: null };
  });
  root.append(wheel);
  let open = false, pick = null, page = 0;
  const vec = { x: 0, y: 0 };
  function fill() {
    const p = EMOTE_PAGES[page];
    title.textContent = p.title;
    hint.textContent = `${page + 1} / ${EMOTE_PAGES.length}  JUMP FOR MORE`;
    slots.forEach((s, i) => { s.m = p.emotes[i] ?? null; s.label.textContent = s.m?.label ?? ''; s.el.classList.toggle('off', !s.m || !has(s.m.clip)); });
  }
  return {
    get open() { return open; },
    show() { open = true; pick = null; vec.x = vec.y = 0; fill(); wheel.classList.remove('hidden'); },
    flip() { page = (page + 1) % EMOTE_PAGES.length; pick = null; fill(); },
    steer(look, move) {
      vec.x += look.dx * 0.02 + move.x * 0.2; vec.y += look.dy * 0.02 - move.y * 0.2;
      const l = Math.hypot(vec.x, vec.y);
      if (l > 1) { vec.x /= l; vec.y /= l; }
      if (l > 0.35) {
        const a = Math.atan2(vec.y, vec.x);
        let best = null, bd = 9;
        for (const s of slots) { let d = Math.abs(a - s.a); d = Math.min(d, Math.PI * 2 - d); if (d < bd) { bd = d; best = s; } }
        pick = best.m && has(best.m.clip) ? best.m.id : null;
      }
      for (const s of slots) s.el.classList.toggle('on', !!s.m && s.m.id === pick);
    },
    close() { open = false; wheel.classList.add('hidden'); return pick; },
  };
}
