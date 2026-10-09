import { el } from './dom.js';
import { COPY } from './copy.js';
import { ACTIONS, DEFAULT_BINDINGS, keyLabel, rebind } from '../core/bindings.js';

// Title screen (Continue, story slots, free swing, multiplayer, settings, controls, what's new,
// credits), pause menu, settings in tabs, and controls (with rebinding). Mouse, keyboard and
// gamepad all work on every page through the shared navigation (ui/nav.js): D-pad or left stick to
// move, A to choose, B or Esc to go back, left and right to change a value, LB and RB for tabs.

const SETTINGS_TABS = ['game', 'controls', 'camera', 'graphics', 'audio', 'access'];
const pct = (v) => `${Math.round(v * 100)}%`;

export function createMenus(root, {
  getSettings, setSettings, input, nav = null, onPlay, onResume, onRestart, onQuit,
  onProgress = () => {}, onRoster = () => {}, onMultiplayer = () => {}, onStory = () => {}, onTracker = () => {}, onPhoto = () => {},
  onGauntlet = () => {}, onNights = () => {}, postGame = () => false,
  getContinue = () => null, onContinue = () => {}, onResetTips = () => {},
  inChallenge = () => false, onRetryChallenge = () => {}, onQuitChallenge = () => {},
}) {
  const C = COPY.settings;
  const B = COPY.buttons;
  // Title ---------------------------------------------------------------------------------------
  const titleButtons = el('div', { class: 'buttons' });
  const title = el('div', { class: 'title hidden' }, el('div', { class: 'card' }, [
    el('h1', { class: 'logo' }, [el('span', { class: 'a' }, COPY.title.a), el('span', { class: 'b' }, COPY.title.b)]),
    el('p', { class: 'sub' }, COPY.subtitle),
    titleButtons,
    el('p', { class: 'disclaimer' }, COPY.disclaimer),
  ]));
  function renderTitle() {
    // Continue: straight into the last slot played, with where it stands.
    const cont = getContinue();
    titleButtons.replaceChildren(
      cont ? el('button', { class: 'mbtn primary cont', onclick: () => { hideAll(); onContinue(cont.slot); } }, [B.continue, el('span', { class: 'msub' }, COPY.continueSub(cont.slot, cont.where, cont.percent))]) : null,
      el('button', { class: `mbtn${cont ? '' : ' primary'}`, onclick: () => { hideAll(); onStory(); } }, COPY.buttons.story),
      el('button', { class: 'mbtn', onclick: () => onPlay() }, COPY.buttons.play),
      el('button', { class: 'mbtn', onclick: () => { hideAll(); onMultiplayer(); } }, COPY.buttons.multiplayer),
      el('div', { class: 'pair' }, [
        el('button', { class: 'mbtn', onclick: () => openSettings('title') }, COPY.buttons.settings),
        el('button', { class: 'mbtn', onclick: () => openControls('title') }, COPY.buttons.controls),
      ]),
      el('div', { class: 'pair' }, [
        el('button', { class: 'mbtn', onclick: () => openWhatsNew() }, B.whatsNew),
        el('button', { class: 'mbtn', onclick: () => openCredits() }, B.credits),
      ]),
    );
  }

  // Pause ---------------------------------------------------------------------------------------
  const pause = el('div', { class: 'menu hidden' }, el('div', { class: 'card' }, [
    el('h2', {}, COPY.pause),
    el('div', { class: 'buttons' }, [
      // A click on Resume is a real user gesture: the game takes the mouse back on it.
      el('button', { class: 'mbtn primary', onclick: (e) => onResume({ lock: e.detail > 0 }) }, COPY.buttons.resume), // a key or pad press (detail 0) never takes the mouse
      el('button', { class: 'mbtn challenge', onclick: () => onRetryChallenge() }, B.retryChallenge),
      el('button', { class: 'mbtn challenge', onclick: () => onQuitChallenge() }, B.quitChallenge),
      el('button', { class: 'mbtn', onclick: () => { hideAll(); onProgress(); } }, COPY.buttons.progress),
      el('button', { class: 'mbtn', onclick: () => { hideAll(); onTracker(); } }, COPY.buttons.tracker),
      el('button', { class: 'mbtn', onclick: () => { hideAll(); onPhoto(); } }, COPY.buttons.photo),
      el('button', { class: 'mbtn postgame', onclick: () => { hideAll(); onGauntlet(); } }, COPY.buttons.gauntlet),
      el('button', { class: 'mbtn postgame', onclick: () => { hideAll(); onNights(); } }, COPY.buttons.nights),
      el('button', { class: 'mbtn', onclick: () => { hideAll(); onRoster(); } }, COPY.buttons.roster),
      el('button', { class: 'mbtn', onclick: () => openSettings('pause') }, COPY.buttons.settings),
      el('button', { class: 'mbtn', onclick: () => openControls('pause') }, COPY.buttons.controls),
      el('button', { class: 'mbtn', onclick: (e) => onRestart({ lock: e.detail > 0 }) }, COPY.buttons.restart),
      el('button', { class: 'mbtn', onclick: () => onQuit() }, COPY.buttons.quit),
    ]),
  ]));

  const settingsPanel = el('div', { class: 'panel settings hidden' });
  const controlsPanel = el('div', { class: 'panel hidden' });
  const whatsNewPanel = el('div', { class: 'panel whatsnew hidden' });
  const creditsPanel = el('div', { class: 'panel credits-page hidden' });
  const PAGES = [title, pause, settingsPanel, controlsPanel, whatsNewPanel, creditsPanel];
  root.append(...PAGES);
  let returnTo = null, settingsTab = 'game', controlsViaSettings = false;

  const update = (patch) => setSettings({ ...getSettings(), ...patch });
  const backBtn = (fn) => el('button', { class: 'mbtn', 'data-back': true, onclick: fn }, COPY.buttons.back);
  const label = (text, note) => el('span', {}, [text, note ? el('span', { class: 'note' }, note) : null]);

  function choice(lbl, note, values, key, labels) {
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
    return el('div', { class: 'row' }, [label(lbl, note), btn]);
  }
  // A slider with its value read out beside it.
  function slider(lbl, min, max, step, get, set, fmt = (v) => String(v)) {
    const r = el('input', { type: 'range', min, max, step, value: get(), 'aria-label': lbl });
    const out = el('output', {}, fmt(get()));
    r.addEventListener('input', () => { const v = parseFloat(r.value); out.textContent = fmt(v); set(v); });
    return el('div', { class: 'row' }, [el('span', {}, lbl), el('div', { class: 'slide' }, [r, out])]);
  }
  function toggle(lbl, key, note) {
    const c = el('input', { type: 'checkbox', 'aria-label': lbl });
    c.checked = !!getSettings()[key];
    c.addEventListener('change', () => update({ [key]: c.checked }));
    return el('div', { class: 'row' }, [label(lbl, note), c]);
  }
  function action(lbl, note, text, fn) {
    const b = el('button', { class: 'chip', onclick: () => fn(b) }, text);
    return el('div', { class: 'row' }, [label(lbl, note), b]);
  }

  function settingsRows(tab) {
    const s = getSettings;
    const vol = (k) => (v) => update({ volume: { ...s().volume, [k]: v } });
    switch (tab) {
      case 'game': return [
        choice(C.difficulty[0], C.difficulty[1], ['friendly', 'amazing', 'spectacular'], 'difficulty', C.difficultyValues),
        choice(C.gravity[0], C.gravity[1], ['comic', 'real'], 'gravity', C.gravityValues),
        toggle(C.crimes[0], 'crimes', C.crimes[1]),
        choice(C.timeOfDay[0], C.timeOfDay[1], ['cycle', 'day', 'golden', 'night'], 'timeOfDay', C.timeValues),
        choice(C.weather[0], null, ['cycle', 'clear', 'overcast', 'rain'], 'weather', C.weatherValues),
        toggle(C.tips[0], 'tips', C.tips[1]),
        action(C.resetTips[0], C.resetTips[1], C.resetTipsButton, (b) => { onResetTips(); b.textContent = C.resetTipsDone; }),
      ];
      case 'controls': return [
        choice(C.toggle[0], C.toggle[1], [false, true], 'swingToggle', C.toggleValues),
        choice(C.swingAssist[0], C.swingAssist[1], ['off', 'normal', 'high'], 'swingAssist', C.swingAssistValues),
        action(C.keyBindings[0], C.keyBindings[1], C.keyBindingsButton, () => openControls(returnTo, true)),
      ];
      case 'camera': return [
        slider(C.sensitivity[0], 0.2, 3, 0.05, () => s().sensitivity, (v) => update({ sensitivity: v }), (v) => `${v.toFixed(2)}x`),
        toggle(C.invertY[0], 'invertY'),
        toggle(C.invertX[0], 'invertX'),
        slider(C.fov[0], 50, 80, 1, () => s().fov, (v) => update({ fov: v }), (v) => `${Math.round(v)}°`),
        toggle(C.cameraShake[0], 'cameraShake', C.cameraShake[1]),
        toggle(C.speedLines[0], 'speedLines'),
      ];
      case 'graphics': return [
        choice(C.quality[0], null, ['high', 'medium', 'low'], 'quality', C.qualityValues),
        slider(C.renderScale[0], 0.5, 1, 0.05, () => s().renderScale, (v) => update({ renderScale: v }), pct),
        toggle(C.dynamicRes[0], 'dynamicRes', C.dynamicRes[1]),
        toggle(C.showFps[0], 'showFps'),
        toggle(C.showSpeed[0], 'showSpeed'),
      ];
      case 'audio': return [
        slider(C.master[0], 0, 1, 0.05, () => s().volume.master, vol('master'), pct),
        slider(C.music[0], 0, 1, 0.05, () => s().volume.music, vol('music'), pct),
        slider(C.sfx[0], 0, 1, 0.05, () => s().volume.sfx, vol('sfx'), pct),
      ];
      default: return [
        choice(C.textSize[0], C.textSize[1], ['normal', 'large', 'huge'], 'textSize', C.textSizeValues),
        toggle(C.colorblind[0], 'colorblind', C.colorblind[1]),
        choice(C.impactFrames[0], C.impactFrames[1], ['full', 'soft', 'off'], 'impactFrames', C.impactValues),
        toggle(C.slowMo[0], 'slowMo', C.slowMo[1]),
        toggle(C.finisherSlowmo[0], 'finisherSlowmo', C.finisherSlowmo[1]),
        toggle(C.soundWords[0], 'soundWords', C.soundWords[1]),
      ];
    }
  }

  function openSettings(from, tab = settingsTab) {
    returnTo = from;
    settingsTab = tab;
    hideAll();
    const tabs = el('div', { class: 'pm-tabs set-tabs' }, SETTINGS_TABS.map((t) =>
      el('button', { class: `chip${t === tab ? ' on' : ''}`, 'data-tab': t, onclick: () => openSettings(from, t) }, C.tabs[t])));
    settingsPanel.replaceChildren(el('div', { class: 'card' }, [
      el('h2', {}, C.title),
      tabs,
      el('div', { class: 'set-body' }, settingsRows(tab)),
      el('div', { class: 'foot' }, [backBtn(back)]),
    ]));
    settingsPanel.classList.remove('hidden');
  }

  function openControls(from, viaSettings = false) {
    returnTo = from;
    controlsViaSettings = viaSettings;
    hideAll();
    const rows = ACTIONS.map(({ id, label: lbl }) => {
      const btn = el('button', { class: 'chip' }, keyLabel(getSettings().bindings[id]?.[0]));
      btn.addEventListener('click', () => {
        btn.classList.add('wait');
        btn.textContent = COPY.controls.pressKey;
        input.captureNext((code) => {
          btn.classList.remove('wait');
          if (code) update({ bindings: rebind(getSettings().bindings, id, code) });
          openControls(returnTo, controlsViaSettings);
        });
      });
      return el('div', { class: 'row' }, [el('span', {}, lbl), btn]);
    });
    controlsPanel.replaceChildren(el('div', { class: 'card' }, [
      el('h2', {}, COPY.controls.title),
      el('h3', {}, COPY.controls.keyboard),
      ...rows,
      el('h3', {}, COPY.controls.gamepad),
      el('table', { class: 'pad-table' }, COPY.controls.padRows.map(([k, v]) => el('tr', {}, [el('td', {}, v), el('td', {}, k)]))),
      el('div', { class: 'foot' }, [
        el('button', { class: 'mbtn', onclick: () => { update({ bindings: DEFAULT_BINDINGS }); openControls(returnTo, controlsViaSettings); } }, COPY.buttons.reset),
        backBtn(back),
      ]),
    ]));
    controlsPanel.classList.remove('hidden');
  }

  function openWhatsNew() {
    hideAll();
    const W = COPY.whatsNew;
    whatsNewPanel.replaceChildren(el('div', { class: 'card' }, [
      el('h2', {}, W.title),
      el('p', { class: 'wn-lead' }, W.lead),
      el('ul', { class: 'wn-list' }, W.items.map((t) => el('li', {}, t))),
      el('div', { class: 'foot' }, [backBtn(showTitle)]),
    ]));
    whatsNewPanel.classList.remove('hidden');
  }

  // Credits from the title: the same list the end credits roll (models, music, thanks), whatever
  // it holds, as a page to scroll.
  function openCredits() {
    hideAll();
    creditsPanel.replaceChildren(el('div', { class: 'card' }, [
      el('h2', {}, B.credits),
      el('div', { class: 'cr-list', tabindex: '0', 'data-scroll': true }, COPY.story.credits.map((l) => el(l.h ? 'h3' : 'p', {}, l.text))),
      el('div', { class: 'foot' }, [backBtn(showTitle)]),
    ]));
    creditsPanel.classList.remove('hidden');
  }

  function back() {
    input.cancelCapture();
    // The keys page opened from Settings goes back to Settings; otherwise to the title or pause.
    const fromKeys = !controlsPanel.classList.contains('hidden') && controlsViaSettings;
    controlsViaSettings = false;
    settingsPanel.classList.add('hidden');
    controlsPanel.classList.add('hidden');
    if (fromKeys) { openSettings(returnTo, 'controls'); return; }
    if (returnTo === 'title') showTitle(); else showPause();
  }

  function hideAll() { for (const n of PAGES) n.classList.add('hidden'); }
  function focusFirst(node) { requestAnimationFrame(() => node.querySelector('button, input')?.focus({ preventScroll: true })); }
  function showTitle() { hideAll(); renderTitle(); title.classList.remove('hidden'); focusFirst(title); }
  function showPause() {
    hideAll();
    for (const b of pause.querySelectorAll('.postgame')) b.style.display = postGame() ? '' : 'none';
    // Retry and Quit while a race or challenge runs.
    const ch = inChallenge();
    const [retry, quit] = pause.querySelectorAll('.challenge');
    for (const b of [retry, quit]) b.style.display = ch ? '' : 'none';
    if (ch) { retry.textContent = ch.kind === 'race' ? B.retryRace : B.retryChallenge; quit.textContent = ch.kind === 'race' ? B.quitRace : B.quitChallenge; }
    pause.classList.remove('hidden');
    focusFirst(pause);
  }
  const visible = () => PAGES.find((n) => !n.classList.contains('hidden')) ?? null;

  if (nav) {
    nav.register(title, null);
    nav.register(pause, () => onResume({ lock: false }));
    nav.register(settingsPanel, back);
    nav.register(controlsPanel, back);
    nav.register(whatsNewPanel, showTitle);
    nav.register(creditsPanel, showTitle);
  }

  return {
    showTitle, showPause, hideAll,
    titleNode: title, // the title page (the GPU hint lives in it, so a pad can reach its button)
    get open() { return !!visible(); },
    get pauseOpen() { return !pause.classList.contains('hidden'); },
  };
}
