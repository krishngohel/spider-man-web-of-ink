import { el } from './dom.js';
import { COPY } from './copy.js';
import { portraitSvg } from './portraits.js';
import { bindingLabel } from '../core/bindings.js';
import { SPEAKERS } from '../story/steps.js';

// The story's screens: comic pages (panels drawn in engine, captions, balloons, sound words), the
// radio panel (dialogue while you play; Jameson's broadcasts get the Bugle skin and a crackle), the
// objective card, the boss bar, act cards, the mission-complete stamp and tutorial tips.

const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function createStoryUi(root, { getSettings, onSound = () => {} }) {
  // Comic ----------------------------------------------------------------------------------------
  const page = el('div', { class: 'cpage' });
  const comic = el('div', { class: 'comic hidden' }, [page, el('div', { class: 'chelp' }, COPY.story.comicHelp)]);
  let pages = [], pi = 0, ki = 0, panelEls = [], resolver = null, shownAt = 0;
  function renderPage() {
    const pg = pages[pi];
    page.className = `cpage layout-${pg.layout ?? (pg.panels.length === 2 ? 'duo' : 'trio')}`;
    page.replaceChildren();
    panelEls = pg.panels.map((p, i) => {
      const box = el('div', { class: `cpanel ${p.span ?? ''}` });
      box.style.setProperty('--tilt', `${((i * 37) % 5) - 2}deg`);
      if (p.img) box.append(el('img', { src: p.img, alt: '' }));
      if (p.caption) box.append(el('div', { class: `ccaption ${p.captionPos ?? 'top'}` }, p.caption));
      for (const b of p.balloons ?? []) {
        const n = el('div', { class: `cballoon ${b.radio ? 'radio' : ''} ${b.who === 'jameson' ? 'shout' : ''}` }, [el('b', {}, SPEAKERS[b.who] ?? b.who), el('span', {}, b.text)]);
        n.style.left = `${b.x}%`; n.style.top = `${b.y}%`;
        box.append(n);
      }
      if (p.sfx) box.append(el('div', { class: 'csfx' }, p.sfx));
      page.append(box);
      return box;
    });
    ki = 0;
    reveal();
  }
  function reveal() { panelEls[ki]?.classList.add('in'); onSound('page'); }
  function advance() {
    if (!resolver || performance.now() - shownAt < 250) return;
    if (ki < panelEls.length - 1) { ki++; reveal(); return; }
    if (pi < pages.length - 1) { pi++; renderPage(); return; }
    finishComic();
  }
  function finishComic() {
    comic.classList.add('hidden');
    const r = resolver; resolver = null;
    r?.();
  }
  comic.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.button === 0) advance(); });
  window.addEventListener('keydown', (e) => {
    if (!resolver) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finishComic(); return; }
    if (['Space', 'Enter', 'KeyE', 'NumpadEnter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); advance(); }
  }, true);

  // Radio ----------------------------------------------------------------------------------------
  const portrait = el('div', { class: 'dlg-portrait' });
  const nameEl = el('div', { class: 'dlg-name' });
  const textEl = el('div', { class: 'dlg-text' });
  const radio = el('div', { class: 'dlg-panel' }, [portrait, el('div', { class: 'dlg-body' }, [nameEl, textEl])]);
  let queue = [], line = null, lineT = 0, shown = 0, radioDone = null, broadcast = false;
  function nextLine() {
    line = queue.shift() ?? null;
    lineT = 0; shown = 0;
    if (!line) { radio.classList.remove('show'); const r = radioDone; radioDone = null; r?.(); return; }
    radio.classList.add('show');
    radio.classList.toggle('bugle', broadcast);
    portrait.innerHTML = portraitSvg(line.who, broadcast);
    nameEl.textContent = broadcast ? `${SPEAKERS[line.who]} ${COPY.story.onAir}` : SPEAKERS[line.who] ?? line.who;
    textEl.textContent = '';
    onSound(broadcast ? 'crackle' : 'radio');
  }
  radio.addEventListener('mousedown', (e) => { e.stopPropagation(); if (!line) return; if (shown < line.text.length) shown = line.text.length; else nextLine(); });

  // Objective, boss bar, cards, stamp, tips ---------------------------------------------------------
  const objective = el('div', { class: 'objective hidden' }, [el('div', { class: 'olabel' }, COPY.story.objective), el('div', { class: 'otext' })]);
  const bossName = el('div', { class: 'bname' });
  const bossFill = el('div', { class: 'bfill' });
  const bossBar = el('div', { class: 'bossbar hidden' }, [bossName, el('div', { class: 'btrack' }, bossFill)]);
  const card = el('div', { class: 'actcard hidden' });
  const stamp = el('div', { class: 'stamp hidden' });
  const tips = el('div', { class: 'storytips' });
  root.append(comic, radio, objective, bossBar, card, stamp, tips);
  let cardT = 0, stampT = 0, cardDone = null;

  const keys = () => {
    const b = getSettings().bindings;
    const out = {};
    for (const a of ['swing', 'jump', 'zip', 'dive', 'attack', 'web', 'hang', 'finisher', 'map', 'gadget']) out[a] = bindingLabel(b, a);
    return out;
  };
  const fill = (s) => { const k = keys(); return esc(s).replace(/\{(\w+)\}/g, (_, n) => `<kbd>${esc(k[n] ?? n)}</kbd>`); };

  return {
    get comicOpen() { return !!resolver; },
    get talking() { return !!line; },
    // Comic pages: panels already carry their img (drawn by the director). Resolves when read.
    comic(list) {
      pages = list; pi = 0; shownAt = performance.now();
      comic.classList.remove('hidden');
      renderPage();
      return new Promise((r) => { resolver = r; });
    },
    advanceComic: advance,
    skipComic: finishComic,
    // Lines in the radio panel; resolves when the last one is done.
    say(lines, { bugle = false } = {}) {
      if (line || queue.length) { queue.push(...lines); return new Promise((r) => { const prev = radioDone; radioDone = () => { prev?.(); r(); }; }); }
      broadcast = bugle;
      queue = [...lines];
      const p = new Promise((r) => { radioDone = r; });
      nextLine();
      return p;
    },
    skipRadio() { queue = []; nextLine(); },
    objective(text) {
      objective.classList.toggle('hidden', !text);
      if (text) objective.lastChild.textContent = text;
    },
    boss(info) {
      bossBar.classList.toggle('hidden', !info);
      if (!info) return;
      bossName.textContent = info.name;
      bossFill.style.width = `${Math.round(Math.max(0, info.hp) * 100)}%`;
    },
    // Act cards and the free-roam card. Resolves when it has been shown.
    card(kind, act) {
      const c = COPY.story.cards[kind];
      card.replaceChildren(el('div', { class: 'aname' }, kind === 'free' ? c.top : act.name), el('div', { class: 'atitle' }, kind === 'free' ? c.title : kind === 'actEnd' ? `${act.title}: ${c.end}` : act.title), el('div', { class: 'asub' }, c.sub));
      card.classList.remove('hidden'); void card.offsetWidth; card.classList.add('show');
      cardT = kind === 'free' ? 3.6 : 3.2;
      return new Promise((r) => { cardDone = r; });
    },
    stamp(text) { stamp.textContent = text; stamp.classList.remove('hidden'); void stamp.offsetWidth; stamp.classList.add('show'); stampT = 2.2; },
    tips(ids) {
      tips.replaceChildren(...ids.filter((id) => COPY.story.tips[id]).map((id) => el('div', { class: 'stip', html: fill(COPY.story.tips[id]) })));
      tips.dataset.t = '9';
    },
    update(dt) {
      if (line) {
        lineT += dt;
        shown = Math.min(line.text.length, shown + dt * 55);
        textEl.textContent = line.text.slice(0, Math.floor(shown));
        if (lineT > 1.2 + line.text.length * 0.05) nextLine();
      }
      if (cardT > 0) { cardT -= dt; if (cardT <= 0) { card.classList.remove('show'); card.classList.add('hidden'); const r = cardDone; cardDone = null; r?.(); } }
      if (stampT > 0) { stampT -= dt; if (stampT <= 0) { stamp.classList.remove('show'); stamp.classList.add('hidden'); } }
      const t = parseFloat(tips.dataset.t ?? '0');
      if (t > 0) { tips.dataset.t = String(t - dt); tips.style.opacity = String(Math.min(1, (t - dt) / 1.2)); if (t - dt <= 0) tips.replaceChildren(); }
    },
    clear() {
      queue = []; line = null; radio.classList.remove('show'); radioDone = null;
      objective.classList.add('hidden'); bossBar.classList.add('hidden'); tips.replaceChildren();
      // Dropped, not resolved: whatever waited on them belongs to a story that has stopped.
      if (resolver) { comic.classList.add('hidden'); resolver = null; }
      if (cardDone) { card.classList.remove('show'); card.classList.add('hidden'); cardDone = null; cardT = 0; }
      stamp.classList.add('hidden'); stampT = 0;
    },
  };
}
