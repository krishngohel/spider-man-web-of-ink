import * as THREE from 'three';
import { el } from '../ui/dom.js';
import { COPY } from '../ui/copy.js';

// Playing together (spec 14.2, social): pings at the crosshair (G), a quick-chat wheel of eight
// lines (hold T, then 1 to 8 or click), text chat (Enter), and a short chat log.

export function createSocial({ session, scene, uiRoot, getAim, getCamera }) {
  const log = el('div', { class: 'chatlog' });
  const input = el('input', { type: 'text', class: 'chatinput hidden', maxlength: '120', placeholder: COPY.mp.chatPh });
  const quick = el('div', { class: 'quickchat hidden' }, COPY.mp.quick.map((line, i) => el('button', { class: 'chip', onclick: () => say(line) }, `${i + 1}. ${line}`)));
  const pingBox = el('div', { class: 'pings' });
  uiRoot.append(log, input, quick, pingBox);
  const pings = [];
  const pingMat = new THREE.MeshBasicMaterial({ color: 0xf7e36a, transparent: true, opacity: 0.7, depthWrite: false });
  const lines = [];
  const v = new THREE.Vector3();

  function line(name, text, color = '#fff') {
    const row = el('div', { class: 'chatline' }, [el('b', {}, `${name}: `), el('span', {}, text)]);
    row.firstChild.style.color = color;
    log.append(row);
    lines.push({ row, t: 9 });
    while (lines.length > 6) lines.shift().row.remove();
  }
  function say(text) {
    text = String(text).trim().slice(0, 120);
    if (!text) return;
    session.all({ k: 'chat', text });
    line(COPY.mp.you, text, '#f7e36a');
    quick.classList.add('hidden');
  }
  function addPing(p, who, color) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 10), pingMat);
    mesh.rotation.x = Math.PI;
    mesh.position.set(p.x, p.y + 2, p.z);
    scene.add(mesh);
    const tag = el('div', { class: 'pingtag' }, who);
    tag.style.color = color;
    pingBox.append(tag);
    pings.push({ mesh, tag, p: { ...p }, t: 8 });
  }

  const api = {
    get typing() { return !input.classList.contains('hidden'); },
    openChat() { input.classList.remove('hidden'); input.value = ''; input.focus(); if (document.pointerLockElement) document.exitPointerLock(); },
    toggleQuick(on) { quick.classList.toggle('hidden', !on); },
    quickPick(n) { if (!quick.classList.contains('hidden') && COPY.mp.quick[n]) say(COPY.mp.quick[n]); },
    ping() {
      const hit = getAim();
      if (!hit) return;
      session.all({ k: 'ping', p: { x: hit.x, y: hit.y, z: hit.z } });
      addPing(hit, COPY.mp.you, '#f7e36a');
    },
    message(id, data) {
      const p = session.players.get(id);
      const name = p?.name ?? `Player ${id}`, color = p?.color ?? '#fff';
      if (data.k === 'chat') line(name, String(data.text).slice(0, 120), color);
      if (data.k === 'ping' && data.p) addPing(data.p, name, color);
    },
    update(dt) {
      for (const l of lines) { l.t -= dt; l.row.style.opacity = String(Math.max(0, Math.min(1, l.t / 2))); }
      const cam = getCamera();
      for (let i = pings.length - 1; i >= 0; i--) {
        const pg = pings[i];
        pg.t -= dt;
        pg.mesh.position.y = pg.p.y + 2 + Math.sin(pg.t * 4) * 0.3;
        v.set(pg.p.x, pg.p.y + 3.6, pg.p.z).project(cam);
        if (v.z < 1) { pg.tag.style.display = ''; pg.tag.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; pg.tag.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`; } else pg.tag.style.display = 'none';
        if (pg.t <= 0) { scene.remove(pg.mesh); pg.tag.remove(); pings.splice(i, 1); }
      }
    },
  };
  // While the quick-chat wheel is up, 1 to 8 pick a line.
  window.addEventListener('keydown', (e) => {
    if (quick.classList.contains('hidden')) return;
    const n = /^Digit([1-8])$/.exec(e.code);
    if (n) { api.quickPick(Number(n[1]) - 1); e.preventDefault(); }
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { say(input.value); input.classList.add('hidden'); input.blur(); }
    if (e.key === 'Escape') { input.classList.add('hidden'); input.blur(); }
  });
  return api;
}
