import { el } from './dom.js';
import { COPY } from './copy.js';
import { ACTIONS, DEFAULT_BINDINGS, keyLabel, rebind } from '../core/bindings.js';

// Title screen, pause menu, settings and controls (with rebinding). Mouse, keyboard and gamepad
// (D-pad or left stick to move, A to choose, B to go back, left/right to change a value).

export function createMenus(root, { getSettings, setSettings, input, onPlay, onResume, onRestart, onQuit, onProgress = () => {}, onRoster = () => {}, onMultiplayer = () => {}, onStory = () => {}, onTracker = () => {}, onGauntlet = () => {}, onNights = () => {}, postGame = () => false }) {
  const C = COPY.settings;
  // Title ---------------------------------------------------------------------------------------
  const title = el('div', { class: 'title hidden' }, el('div', { class: 'card' }, [
    el('h1', { class: 'logo' }, [el('span', { class: 'a' }, COPY.title.a), el('span', { class: 'b' }, COPY.title.b)]),
    el('p', { class: 'sub' }, COPY.subtitle),
    el('div', { class: 'buttons' }, [
      el('button', { class: 'mbtn primary', onclick: () => { hideAll(); onStory(); } }, COPY.buttons.story),
      el('button', { class: 'mbtn', onclick: () => onPlay() }, COPY.buttons.play),
      el('button', { class: 'mbtn', onclick: () => { hideAll(); onMultiplayer(); } }, COPY.buttons.multiplayer),
      el('button', { class: 'mbtn', onclick: () => openSettings('title') }, COPY.buttons.settings),
      el('button', { class: 'mbtn', onclick: () => openControls('title') }, COPY.buttons.controls),
    ]),
    el('p', { class: 'disclaimer' }, COPY.disclaimer),
  ]));

  // Pause ---------------------------------------------------------------------------------------
  const pause = el('div', { class: 'menu hidden' }, el('div', { class: 'card' }, [
    el('h2', {}, COPY.pause),
    el('div', { class: 'buttons' }, [
      el('button', { class: 'mbtn primary', onclick: () => onResume() }, COPY.buttons.resume),
      el('button', { class: 'mbtn', onclick: () => { hideAll(); onProgress(); } }, COPY.buttons.progress),
      el('button', { class: 'mbtn', onclick: () => { hideAll(); onTracker(); } }, COPY.buttons.tracker),
      el('button', { class: 'mbtn postgame', onclick: () => { hideAll(); onGauntlet(); } }, COPY.buttons.gauntlet),
      el('button', { class: 'mbtn postgame', onclick: () => { hideAll(); onNights(); } }, COPY.buttons.nights),
      el('button', { class: 'mbtn', onclick: () => { hideAll(); onRoster(); } }, COPY.buttons.roster),
      el('button', { class: 'mbtn', onclick: () => openSettings('pause') }, COPY.buttons.settings),
      el('button', { class: 'mbtn', onclick: () => openControls('pause') }, COPY.buttons.controls),
      el('button', { class: 'mbtn', onclick: () => onRestart() }, COPY.buttons.restart),
      el('button', { class: 'mbtn', onclick: () => onQuit() }, COPY.buttons.quit),
    ]),
  ]));

  const settingsPanel = el('div', { class: 'panel hidden' });
  const controlsPanel = el('div', { class: 'panel hidden' });
  root.append(title, pause, settingsPanel, controlsPanel);
  let returnTo = null;

  const update = (patch) => setSettings({ ...getSettings(), ...patch });

  function choice(label, note, values, key, labels) {
    const s = getSettings();
    const btn = el('button', { class: 'chip', 'data-cycle': '1' }, labels[String(s[key])]);
    const cycle = (dir = 1) => {
      const cur = values.indexOf(getSettings()[key]);
      const next = values[(cur + dir + values.length) % values.length];
      update({ [key]: next });
      btn.textContent = labels[String(next)];
    };
    btn.addEventListener('click', () => cycle(1));
    btn.cycle = cycle;
    return el('div', { class: 'row' }, [el('span', {}, [label, note ? el('span', { class: 'note' }, note) : null]), btn]);
  }
  function slider(label, min, max, step, get, set) {
    const r = el('input', { type: 'range', min, max, step, value: get() });
    r.addEventListener('input', () => set(parseFloat(r.value)));
    return el('div', { class: 'row' }, [el('span', {}, label), r]);
  }
  function toggle(label, key, note) {
    const c = el('input', { type: 'checkbox' });
    c.checked = !!getSettings()[key];
    c.addEventListener('change', () => update({ [key]: c.checked }));
    return el('div', { class: 'row' }, [el('span', {}, [label, note ? el('span', { class: 'note' }, note) : null]), c]);
  }

  function openSettings(from) {
    returnTo = from;
    hideAll();
    settingsPanel.replaceChildren(el('div', { class: 'card' }, [
      el('h2', {}, C.title),
      el('h3', {}, C.sections.move),
      choice(C.gravity[0], C.gravity[1], ['comic', 'real'], 'gravity', C.gravityValues),
      choice(C.swingAssist[0], C.swingAssist[1], ['off', 'normal', 'high'], 'swingAssist', C.swingAssistValues),
      choice(C.toggle[0], C.toggle[1], [false, true], 'swingToggle', C.toggleValues),
      choice(C.difficulty[0], C.difficulty[1], ['friendly', 'amazing', 'spectacular'], 'difficulty', C.difficultyValues),
      toggle(C.crimes[0], 'crimes', C.crimes[1]),
      el('h3', {}, C.sections.camera),
      slider(C.sensitivity[0], 0.2, 3, 0.05, () => getSettings().sensitivity, (v) => update({ sensitivity: v })),
      toggle(C.invertY[0], 'invertY'),
      toggle(C.invertX[0], 'invertX'),
      el('h3', {}, 'Accessibility'),
      choice(C.textSize[0], C.textSize[1], ['normal', 'large', 'huge'], 'textSize', C.textSizeValues),
      toggle(C.colorblind[0], 'colorblind', C.colorblind[1]),
      toggle(C.slowMo[0], 'slowMo', C.slowMo[1]),
      toggle(C.finisherSlowmo[0], 'finisherSlowmo', C.finisherSlowmo[1]),
      slider(C.fov[0], 50, 80, 1, () => getSettings().fov, (v) => update({ fov: v })),
      toggle(C.speedLines[0], 'speedLines'),
      toggle(C.soundWords[0], 'soundWords', C.soundWords[1]),
      el('h3', {}, C.sections.video),
      choice(C.quality[0], null, ['high', 'medium', 'low'], 'quality', C.qualityValues),
      slider(C.renderScale[0], 0.5, 1, 0.05, () => getSettings().renderScale, (v) => update({ renderScale: v })),
      toggle(C.dynamicRes[0], 'dynamicRes', C.dynamicRes[1]),
      toggle(C.showFps[0], 'showFps'),
      choice(C.timeOfDay[0], C.timeOfDay[1], ['cycle', 'day', 'golden', 'night'], 'timeOfDay', C.timeValues),
      choice(C.weather[0], null, ['cycle', 'clear', 'overcast', 'rain'], 'weather', C.weatherValues),
      el('h3', {}, C.sections.audio),
      slider(C.master[0], 0, 1, 0.05, () => getSettings().volume.master, (v) => update({ volume: { ...getSettings().volume, master: v } })),
      slider(C.sfx[0], 0, 1, 0.05, () => getSettings().volume.sfx, (v) => update({ volume: { ...getSettings().volume, sfx: v } })),
      el('div', { class: 'foot' }, [el('button', { class: 'mbtn', onclick: back }, COPY.buttons.back)]),
    ]));
    settingsPanel.classList.remove('hidden');
    focusFirst(settingsPanel);
  }

  function openControls(from) {
    returnTo = from;
    hideAll();
    const rows = ACTIONS.map(({ id, label }) => {
      const btn = el('button', { class: 'chip' }, keyLabel(getSettings().bindings[id]?.[0]));
      btn.addEventListener('click', () => {
        btn.classList.add('wait');
        btn.textContent = COPY.controls.pressKey;
        input.captureNext((code) => {
          btn.classList.remove('wait');
          if (code) update({ bindings: rebind(getSettings().bindings, id, code) });
          openControls(returnTo);
        });
      });
      return el('div', { class: 'row' }, [el('span', {}, label), btn]);
    });
    controlsPanel.replaceChildren(el('div', { class: 'card' }, [
      el('h2', {}, COPY.controls.title),
      el('h3', {}, COPY.controls.keyboard),
      ...rows,
      el('h3', {}, COPY.controls.gamepad),
      el('table', { class: 'pad-table' }, COPY.controls.padRows.map(([k, v]) => el('tr', {}, [el('td', {}, v), el('td', {}, k)]))),
      el('div', { class: 'foot' }, [
        el('button', { class: 'mbtn', onclick: () => { update({ bindings: DEFAULT_BINDINGS }); openControls(returnTo); } }, COPY.buttons.reset),
        el('button', { class: 'mbtn', onclick: back }, COPY.buttons.back),
      ]),
    ]));
    controlsPanel.classList.remove('hidden');
    focusFirst(controlsPanel);
  }

  function back() {
    input.cancelCapture();
    settingsPanel.classList.add('hidden');
    controlsPanel.classList.add('hidden');
    if (returnTo === 'title') showTitle(); else showPause();
  }

  function hideAll() { for (const n of [title, pause, settingsPanel, controlsPanel]) n.classList.add('hidden'); }
  function focusFirst(node) { requestAnimationFrame(() => node.querySelector('button, input')?.focus({ preventScroll: true })); }
  function showTitle() { hideAll(); title.classList.remove('hidden'); focusFirst(title); }
  function showPause() { hideAll(); for (const b of pause.querySelectorAll('.postgame')) b.style.display = postGame() ? '' : 'none'; pause.classList.remove('hidden'); focusFirst(pause); }
  const visible = () => [title, pause, settingsPanel, controlsPanel].find((n) => !n.classList.contains('hidden')) ?? null;

  // Gamepad navigation, polled by the game loop while a menu is open.
  const prev = new Map();
  function padNav() {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p && p.connected);
    if (!pad) return;
    const edge = (i, axis = null) => {
      let down = !!pad.buttons[i]?.pressed;
      if (axis) down = down || axis();
      const was = prev.get(i) ?? false;
      prev.set(i, down);
      return down && !was;
    };
    const ay = pad.axes[1] ?? 0, ax = pad.axes[0] ?? 0;
    const node = visible();
    if (!node) return;
    const items = [...node.querySelectorAll('button, input')];
    const at = items.indexOf(document.activeElement);
    if (edge(12, () => ay < -0.6)) items[Math.max(0, at - 1)]?.focus();
    if (edge(13, () => ay > 0.6)) items[Math.min(items.length - 1, at + 1)]?.focus();
    const a = document.activeElement;
    const left = edge(14, () => ax < -0.6), right = edge(15, () => ax > 0.6);
    if ((left || right) && a) {
      if (a.cycle) a.cycle(right ? 1 : -1);
      else if (a.type === 'range') { const st = parseFloat(a.step) || 0.1; a.value = String(parseFloat(a.value) + (right ? st : -st)); a.dispatchEvent(new Event('input')); }
      else if (a.type === 'checkbox') { a.checked = !a.checked; a.dispatchEvent(new Event('change')); }
    }
    if (edge(0)) a?.click();
    if (edge(1)) { if (node === settingsPanel || node === controlsPanel) back(); else if (node === pause) onResume(); }
  }

  return {
    showTitle, showPause, hideAll, padNav,
    get open() { return !!visible(); },
    get pauseOpen() { return !pause.classList.contains('hidden'); },
  };
}
