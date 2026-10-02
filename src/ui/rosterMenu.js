import { el } from './dom.js';
import { COPY } from './copy.js';
import { ROSTER } from '../roster/characters.js';

// Character select: heroes and villains, each with how they move and fight.
export function createRosterMenu(root, { isOpen, current, onPick, onBack }) {
  const panel = el('div', { class: 'panel roster hidden' });
  root.append(panel);
  function render() {
    const open = isOpen();
    const card = (c) => el('button', { class: `pm-suit rs-card${current() === c.id ? ' on' : ''}${open ? '' : ' off'}`, onclick: () => { if (open) onPick(c.id); } }, [
      el('b', {}, c.name), el('span', {}, c.desc), el('em', {}, current() === c.id ? COPY.roster.playing : COPY.roster.play),
    ]);
    panel.replaceChildren(el('div', { class: 'card wide' }, [
      el('h2', {}, COPY.roster.title),
      open ? null : el('p', {}, COPY.roster.locked),
      el('h3', {}, COPY.roster.heroes),
      el('div', { class: 'pm-grid rs-grid' }, ROSTER.filter((c) => c.kind === 'hero').map(card)),
      el('h3', {}, COPY.roster.villains),
      el('div', { class: 'pm-grid rs-grid' }, ROSTER.filter((c) => c.kind === 'villain').map(card)),
      el('div', { class: 'foot' }, [el('button', { class: 'mbtn', onclick: () => { api.hide(); onBack(); } }, COPY.buttons.back)]),
    ].filter(Boolean)));
  }
  const api = {
    show() { render(); panel.classList.remove('hidden'); },
    hide() { panel.classList.add('hidden'); },
  };
  return api;
}
