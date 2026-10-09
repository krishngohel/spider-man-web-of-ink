import { el } from './dom.js';
import { COPY } from './copy.js';
import { SKILLS, TREES, SUITS, MODS, MAX_MODS, POWERS, GADGET_COST, canLearn, learn, affordable, pay, levelFor } from '../progress/progression.js';
import { GADGETS } from '../combat/gadgets.js';
import { TOKEN_TYPES } from '../core/save.js';
import { hex } from '../render/palette.js';

// Skills, suits, gadgets, mods and powers: one panel with tabs, opened from the pause menu.

const TOKEN_NAMES = { crime: 'Crime', base: 'Base', challenge: 'Challenge', research: 'Research', landmark: 'Landmark', backpack: 'Backpack' };
const costText = (cost) => Object.entries(cost).map(([k, v]) => `${v} ${TOKEN_NAMES[k]}`).join(', ') || COPY.progress.free;

export function createProgressMenu(root, { save, onChange, onBack }) {
  const panel = el('div', { class: 'panel progress hidden' });
  root.append(panel);
  let tab = 'skills';

  function owned(id) { return save.progress.suits.includes(id); }

  function render() {
    const p = save.progress, lv = levelFor(p.xp);
    const tabs = el('div', { class: 'pm-tabs' }, ['skills', 'suits', 'gadgets', 'mods', 'powers'].map((t) =>
      el('button', { class: `chip${t === tab ? ' on' : ''}`, 'data-tab': t, onclick: () => { tab = t; render(); } }, COPY.progress.tabs[t])));
    const head = el('div', { class: 'pm-head' }, [
      el('b', {}, `${COPY.progress.level} ${p.level}`),
      el('span', { class: 'pm-xp' }, [el('i', { style: `width:${lv.need ? (lv.into / lv.need) * 100 : 100}%` })]),
      el('span', {}, `${p.skillPoints} ${COPY.progress.points}`),
      el('span', { class: 'pm-tokens' }, TOKEN_TYPES.map((t) => `${TOKEN_NAMES[t]} ${p.tokens[t]}`).join('  ')),
    ]);
    let body;
    if (tab === 'skills') {
      body = el('div', { class: 'pm-trees' }, TREES.map((tree) => el('div', { class: 'pm-tree' }, [
        el('h3', {}, COPY.progress.trees[tree]),
        ...SKILLS.filter((s) => s.tree === tree).map((s) => {
          const have = p.skills.includes(s.id), can = canLearn(save, s.id);
          return el('button', { class: `pm-skill${have ? ' have' : can ? ' can' : ''}`, onclick: () => { if (learn(save, s.id)) { onChange(); render(); } } }, [
            el('b', {}, s.name), el('span', {}, s.desc), el('em', {}, have ? COPY.progress.learned : `${COPY.progress.level} ${s.level}`),
          ]);
        }),
      ])));
    } else if (tab === 'suits') {
      body = el('div', { class: 'pm-grid' }, SUITS.map((s) => {
        const have = owned(s.id), on = p.suit === s.id;
        const storyOk = !s.story || save.story.done.includes(s.story) || !!save.story.choices?.completedOnce;
        const can = !have && storyOk && p.level >= s.level && affordable(save, s.cost);
        const sw = el('div', { class: 'pm-swatch' }, [el('i', { style: `background:${hex(s.red)}` }), el('i', { style: `background:${hex(s.blue)}` }), el('i', { style: `background:${hex(s.black)}` })]);
        // Card art (scripts/suit-thumbs.mjs); the colour swatch stays if the picture cannot load.
        const art = el('img', { class: 'pm-art', src: `./assets/suits/thumbs/${s.id}.webp`, alt: '', loading: 'lazy', draggable: 'false', onerror: (e) => { e.target.remove(); sw.classList.add('only'); } });
        sw.classList.add('under');
        return el('button', { class: `pm-suit${on ? ' on' : have ? ' have' : can ? ' can' : ''}`, onclick: () => {
          if (have) { p.suit = s.id; onChange(); render(); return; }
          if (can && pay(save, s.cost)) { p.suits.push(s.id); p.suit = s.id; onChange(); render(); }
        } }, [art, sw, el('b', {}, s.name), el('em', {}, on ? COPY.progress.wearing : have ? COPY.progress.wear : !storyOk ? COPY.progress.story : `${COPY.progress.level} ${s.level}: ${costText(s.cost)}`)]);
      }));
    } else if (tab === 'gadgets') {
      body = el('div', { class: 'pm-list' }, GADGETS.map((g) => {
        const lvG = p.gadgets[g.id] ?? (g.id === 'webBomb' ? 1 : 0);
        const next = lvG + 1, cost = next === 1 ? { research: 1 } : GADGET_COST[next];
        const can = next <= 3 && affordable(save, cost);
        return el('div', { class: 'pm-row' }, [
          el('div', {}, [el('b', {}, g.name), el('span', {}, g.desc)]),
          el('em', {}, lvG ? `${COPY.progress.level} ${lvG}` : COPY.progress.locked),
          next <= 3 ? el('button', { class: `chip${can ? '' : ' off'}`, onclick: () => { if (can && pay(save, cost)) { p.gadgets[g.id] = next; onChange(); render(); } } }, `${next === 1 ? COPY.progress.build : COPY.progress.upgrade}: ${costText(cost)}`) : el('em', {}, COPY.progress.max),
        ]);
      }));
    } else if (tab === 'mods') {
      body = el('div', { class: 'pm-list' }, [el('p', {}, COPY.progress.modsNote), ...MODS.map((m) => {
        const have = p.mods.includes(m.id);
        const can = !have && p.mods.length < MAX_MODS && affordable(save, m.cost);
        return el('div', { class: 'pm-row' }, [
          el('div', {}, [el('b', {}, m.name), el('span', {}, m.desc)]),
          el('button', { class: `chip${have ? ' on' : can ? '' : ' off'}`, onclick: () => {
            if (have) { p.mods = p.mods.filter((x) => x !== m.id); onChange(); render(); return; }
            if (can && pay(save, m.cost)) { p.mods.push(m.id); onChange(); render(); }
          } }, have ? COPY.progress.remove : costText(m.cost)),
        ]);
      })]);
    } else {
      const unlocked = new Set(SUITS.filter((s) => owned(s.id) && s.power).map((s) => s.power));
      body = el('div', { class: 'pm-list' }, POWERS.map((pw) => el('div', { class: 'pm-row' }, [
        el('div', {}, [el('b', {}, pw.name), el('span', {}, pw.desc)]),
        unlocked.has(pw.id)
          ? el('button', { class: `chip${p.power === pw.id ? ' on' : ''}`, onclick: () => { p.power = pw.id; onChange(); render(); } }, p.power === pw.id ? COPY.progress.equipped : COPY.progress.equip)
          : el('em', {}, COPY.progress.powerLocked),
      ])));
    }
    panel.replaceChildren(el('div', { class: 'card wide' }, [
      el('h2', {}, COPY.progress.title), head, tabs, body,
      el('div', { class: 'foot' }, [el('button', { class: 'mbtn', 'data-back': true, onclick: () => { api.hide(); onBack(); } }, COPY.buttons.back)]),
    ]));
  }

  const api = {
    show(t = tab) { tab = t; render(); panel.classList.remove('hidden'); },
    hide() { panel.classList.add('hidden'); },
    back() { api.hide(); onBack(); },
    node: panel,
    get open() { return !panel.classList.contains('hidden'); },
  };
  return api;
}
