import { el } from './dom.js';
import { MEDALS } from '../content/catalog.js';

// The progress tracker (spec 11): every district's completion, then the Taskmaster medals, the
// races, and the Bugle's photo assignments. Opened from the pause menu.

const frac = ([a, b]) => (b ? `${a} / ${b}` : '-');
const pct = (rows) => {
  let have = 0, all = 0;
  for (const r of rows) for (const k of ['crimes', 'backpacks', 'photos', 'tags', 'pigeons', 'base', 'research']) { have += r[k][0]; all += r[k][1]; }
  return all ? Math.round((have / all) * 100) : 0;
};

export function createTracker(root, { data, onBack }) {
  const panel = el('div', { class: 'menu hidden tracker' });
  root.append(panel);
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !panel.classList.contains('hidden')) { e.preventDefault(); e.stopPropagation(); panel.classList.add('hidden'); onBack(); } }, true);
  function show() {
    const t = data();
    const head = el('tr', {}, ['District', 'Crimes', 'Hideout', 'Backpacks', 'Photos', 'Tags', 'Pigeons', 'Research'].map((h) => el('th', {}, h)));
    const rows = t.rows.map((r) => el('tr', {}, [el('td', {}, r.name), ...['crimes', 'base', 'backpacks', 'photos', 'tags', 'pigeons', 'research'].map((k) => el('td', { class: r[k][0] >= r[k][1] && r[k][1] ? 'full' : '' }, frac(r[k])))]));
    const medal = (m) => el('span', { class: `medal m${m.medal}` }, m.medal ? MEDALS[m.medal] : 'not run');
    panel.replaceChildren(el('div', { class: 'card' }, [
      el('h2', {}, `CITY PROGRESS ${pct(t.rows)}%`),
      el('div', { class: 'tscroll' }, [
        el('table', { class: 'ttable' }, [head, ...rows]),
        el('h3', {}, 'Taskmaster challenges'),
        el('div', { class: 'tgrid' }, t.challenges.map((c) => el('div', { class: 'titem' }, [el('b', {}, c.name), medal(c)]))),
        el('h3', {}, 'Swing races'),
        el('div', { class: 'tgrid' }, t.races.map((c) => el('div', { class: 'titem' }, [el('b', {}, c.name), medal(c)]))),
        ...(t.requests ? [el('h3', {}, 'Neighborhood requests'), el('div', { class: 'tgrid' }, [el('div', { class: 'titem' }, [el('b', {}, 'People helped'), el('span', { class: t.requests[0] >= t.requests[1] ? 'medal m3' : 'medal m0' }, `${t.requests[0]} / ${t.requests[1]}`)])])] : []),
        el('h3', {}, 'Daily Bugle assignments'),
        el('div', { class: 'tgrid' }, t.bugle.map((a) => el('div', { class: 'titem' }, [el('b', {}, a.title), el('span', { class: a.done ? 'medal m3' : 'medal m0' }, a.done ? 'printed' : 'open')]))),
      ]),
      el('div', { class: 'buttons' }, [el('button', { class: 'mbtn', onclick: () => { panel.classList.add('hidden'); onBack(); } }, 'BACK')]),
    ]));
    panel.classList.remove('hidden');
  }
  return { show, hide: () => panel.classList.add('hidden'), get open() { return !panel.classList.contains('hidden'); } };
}
