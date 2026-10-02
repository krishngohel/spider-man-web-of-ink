import { el } from './dom.js';
import { COPY } from './copy.js';
import { ROSTER } from '../roster/characters.js';
import { MODES } from '../net/modes.js';
import { RELAY_URL } from '../net/client.js';

// Multiplayer screens: the lobby (name, character, create or join a world by code) and the world
// menu (the code to share, who is here, the host's modes and End World, Leave).

const PROFILE = 'web-of-ink-mp-profile';
function loadProfile() { try { return JSON.parse(localStorage.getItem(PROFILE) ?? '{}'); } catch { return {}; } }
function saveProfile(p) { try { localStorage.setItem(PROFILE, JSON.stringify(p)); } catch { /* storage blocked */ } }

export function createLobby(root, { session, onEnter, onBack, startMode }) {
  const C = COPY.mp;
  const panel = el('div', { class: 'panel lobby hidden' });
  const world = el('div', { class: 'panel worldmenu hidden' });
  root.append(panel, world);
  const prof = { name: '', char: 'peter', relay: RELAY_URL, ...loadProfile() };
  let msg = '';

  function render() {
    const name = el('input', { type: 'text', value: prof.name, maxlength: '16', placeholder: C.namePh });
    const code = el('input', { type: 'text', maxlength: '7', placeholder: C.codePh, class: 'code' });
    const relay = el('input', { type: 'text', value: prof.relay });
    const keep = () => { prof.name = name.value.trim() || 'Player'; prof.relay = relay.value.trim() || RELAY_URL; saveProfile(prof); };
    panel.replaceChildren(el('div', { class: 'card wide' }, [
      el('h2', {}, C.title),
      el('p', {}, C.blurb),
      el('div', { class: 'row' }, [el('span', {}, C.name), name]),
      el('h3', {}, C.pick),
      el('div', { class: 'pm-grid rs-grid' }, ROSTER.map((c) => el('button', { class: `pm-suit${prof.char === c.id ? ' on' : ''}`, onclick: () => { prof.char = c.id; keep(); render(); } }, [el('b', {}, c.name)]))),
      el('div', { class: 'mp-actions' }, [
        el('button', { class: 'mbtn primary', onclick: () => { keep(); msg = C.connecting; session.create({ name: prof.name, char: prof.char, relay: prof.relay }); render(); } }, C.create),
        el('span', {}, C.or),
        code,
        el('button', { class: 'mbtn', onclick: () => { keep(); msg = C.connecting; session.join({ code: code.value, name: prof.name, char: prof.char, relay: prof.relay }); render(); } }, C.join),
      ]),
      el('p', { class: 'mp-msg' }, msg),
      el('details', {}, [el('summary', {}, C.advanced), el('div', { class: 'row' }, [el('span', {}, C.relay), relay])]),
      el('div', { class: 'foot' }, [el('button', { class: 'mbtn', onclick: () => { api.hide(); onBack(); } }, COPY.buttons.back)]),
    ]));
  }

  function renderWorld() {
    const host = session.isHost;
    const list = [{ id: session.me.id, name: `${prof.name} (${C.you})` }, ...[...session.players.values()].map((p) => ({ id: p.id, name: p.name + (p.away ? ` (${C.away})` : '') }))];
    world.replaceChildren(el('div', { class: 'card wide' }, [
      el('h2', {}, C.worldTitle),
      el('div', { class: 'mp-code' }, [el('span', {}, C.code), el('b', {}, session.me.code)]),
      el('p', {}, C.share),
      el('h3', {}, `${C.players} (${list.length}/5)`),
      ...list.map((p) => el('div', { class: 'row' }, [el('span', {}, p.name), el('em', {}, p.id === session.me.host ? C.hostTag : '')])),
      host ? el('h3', {}, C.modes) : el('p', {}, C.hostRuns),
      host ? el('div', { class: 'pm-list' }, Object.entries(MODES).map(([k, m]) => el('div', { class: 'pm-row' }, [el('div', {}, [el('b', {}, m.name), el('span', {}, m.desc)]), el('button', { class: 'chip', onclick: () => { startMode(k, {}); api.hideWorld(); onEnter(); } }, C.start)]))) : null,
      host ? el('button', { class: 'chip', onclick: () => { startMode('race', { fairCap: true }); api.hideWorld(); onEnter(); } }, C.fairRace) : null,
      el('div', { class: 'foot' }, [
        host ? el('button', { class: 'mbtn', onclick: () => { session.end(); api.hideWorld(); onBack(); } }, C.end) : null,
        el('button', { class: 'mbtn', onclick: () => { session.leave(); api.hideWorld(); onBack(); } }, C.leave),
        el('button', { class: 'mbtn primary', onclick: () => { api.hideWorld(); onEnter(); } }, COPY.buttons.resume),
      ].filter(Boolean)),
    ].filter(Boolean)));
  }

  session.on('status', (kind, m) => {
    if (kind === 'welcome') { msg = ''; api.hide(); onEnter(); }
    else if (kind === 'error') { msg = m.msg; if (!panel.classList.contains('hidden')) render(); }
    else if (kind === 'closed' && m.why === 'ended') { msg = C.ended; }
  });

  const api = {
    show() { msg = ''; render(); panel.classList.remove('hidden'); },
    hide() { panel.classList.add('hidden'); },
    showWorld() { renderWorld(); world.classList.remove('hidden'); },
    hideWorld() { world.classList.add('hidden'); },
    get profile() { return prof; },
  };
  return api;
}
