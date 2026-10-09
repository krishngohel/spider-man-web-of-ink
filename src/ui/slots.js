import { el } from './dom.js';
import { COPY } from './copy.js';
import { listSlots } from '../core/save.js';
import { STEPS, actById } from '../story/steps.js';

// The story's three save slots (spec 15): where each one is (act and chapter), time played, and
// Continue or New Game. Starting over in a used slot asks first.

const C = COPY.story.slots;
const hm = (s) => { const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

// Where a save is in the story (act and title), how much of the story is done, and time played:
// for the slot list and the title screen's Continue.
export function where(save) {
  const step = STEPS.find((s) => s.id === save.story.step) ?? null;
  if (!step) return save.story.done.length ? COPY.story.cards.actEnd.sub : actById('prologue').title;
  const act = actById(step.act);
  return `${act.name}: ${act.title}`;
}
export function storyPercent(save) {
  const ids = new Set(STEPS.map((s) => s.id));
  const done = new Set(save.story.done.filter((id) => ids.has(id)));
  if (!STEPS.some((s) => s.id === save.story.step) && done.size) return 100;
  return Math.min(100, Math.round((done.size / STEPS.length) * 100));
}
export function slotSummary(save) {
  return { where: where(save), percent: storyPercent(save), played: hm(save.playTime) };
}

export function createSlots(root, { onPick, onBack }) {
  const panel = el('div', { class: 'menu hidden' });
  root.append(panel);
  let armed = null;

  function render() {
    const rows = listSlots(window.localStorage).map(({ slot, save }) => {
      const info = save ? [el('b', {}, `${C.slot} ${slot}`), el('em', {}, `${where(save)}, ${storyPercent(save)}%, ${hm(save.playTime)} ${C.played}`)] : [el('b', {}, `${C.slot} ${slot}`), el('em', {}, C.empty)];
      const acts = el('div', { class: 'acts' }, [
        save ? el('button', { class: 'mbtn primary', onclick: () => onPick(slot, false) }, C.continue) : null,
        save && (save.story.done.includes('act4.epilogue') || save.story.choices?.completedOnce) ? el('button', { class: 'mbtn', onclick: () => onPick(slot, 'ngplus') }, C.ngPlus) : null,
        el('button', { class: 'mbtn', onclick: () => {
          if (save && armed !== slot) { armed = slot; render(); return; }
          armed = null; onPick(slot, true);
        } }, save && armed === slot ? C.confirm.split('?')[0] + '?' : C.newGame),
      ]);
      return el('div', { class: 'slot' }, [...info, acts]);
    });
    panel.replaceChildren(el('div', { class: 'card' }, [
      el('h2', {}, C.title),
      el('div', { class: 'slots' }, rows),
      armed ? el('p', {}, C.confirm) : null,
      el('div', { class: 'buttons' }, [el('button', { class: 'mbtn', 'data-back': true, onclick: () => { hide(); onBack(); } }, COPY.buttons.back)]),
    ]));
  }
  function hide() { panel.classList.add('hidden'); armed = null; }
  return {
    show() { armed = null; render(); panel.classList.remove('hidden'); },
    hide,
    back() { hide(); onBack(); },
    node: panel,
    get open() { return !panel.classList.contains('hidden'); },
  };
}
