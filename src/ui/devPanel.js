import { el } from './dom.js';
import { tune, DEFAULTS, resetTune } from '../physics/constants.js';

// Live physics tuning for playtests (?dev=1, or the backquote key). Every slider writes straight
// into `tune`, which the physics reads each step. "Copy" puts the changed values on the clipboard
// so a good feel can be written back into constants.js.
const SKIP = new Set(['mass', 'radius', 'height']);

export function createDevPanel(root) {
  const panel = el('div', { class: 'dev hidden' });
  root.append(panel);
  function build() {
    const rows = Object.keys(DEFAULTS).filter((k) => !SKIP.has(k)).map((k) => {
      const d = DEFAULTS[k];
      const out = el('span', {}, fmt(tune[k]));
      const r = el('input', { type: 'range', min: d * 0.2, max: d * 3, step: d / 100, value: tune[k] });
      r.addEventListener('input', () => { tune[k] = parseFloat(r.value); out.textContent = fmt(tune[k]); });
      return el('div', { class: 'r' }, [el('label', {}, k), r, out]);
    });
    panel.replaceChildren(...rows, el('div', { class: 'btns' }, [
      el('button', { class: 'chip', onclick: () => { resetTune(); build(); } }, 'Reset'),
      el('button', { class: 'chip', onclick: copy }, 'Copy changed'),
    ]));
  }
  const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4));
  function copy() {
    const changed = Object.fromEntries(Object.keys(DEFAULTS).filter((k) => tune[k] !== DEFAULTS[k]).map((k) => [k, tune[k]]));
    navigator.clipboard?.writeText(JSON.stringify(changed, null, 2)).catch(() => {});
  }
  build();
  return {
    toggle() { panel.classList.toggle('hidden'); },
    show() { panel.classList.remove('hidden'); },
    get open() { return !panel.classList.contains('hidden'); },
  };
}
