import * as THREE from 'three';
import { el } from '../ui/dom.js';

// Versus modes (spec 14.2), run by the host from everyone's reported positions and broadcast to
// all: Race, Tag, Brawl, King of the Rooftop, Hide and Seek. Every client draws the objective
// (checkpoint rings, the rooftop zone, who is it), a timer and the scores, and a scoreboard at the
// end of the round.

export const MODES = {
  race: { name: 'RACE', secs: 300, desc: 'Checkpoint course across the city. First through the last ring wins.' },
  tag: { name: 'TAG', secs: 180, desc: 'Whoever is it tags someone by touch. Least time as it wins.' },
  brawl: { name: 'BRAWL', secs: 180, desc: 'Everyone against everyone. Most knockouts wins.' },
  king: { name: 'KING OF THE ROOFTOP', secs: 240, desc: 'Stand on the marked roof to score. It moves every minute.' },
  hide: { name: 'HIDE AND SEEK', secs: 240, desc: 'The seeker hunts the hiders by touch. Spider-sense pings show them for a moment.' },
};

// A race course: checkpoints hopping between tall roofs and avenue crossings from a start point.
export function makeCourse(city, from, n = 8, rand = Math.random) {
  const out = [];
  let x = from.x, z = from.z, heading = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    heading += (rand() - 0.5) * 1.2;
    x = Math.max(-1350, Math.min(1350, x + Math.sin(heading) * 170));
    z = Math.max(-900, Math.min(900, z + Math.cos(heading) * 170));
    const y = 30 + rand() * 40;
    out.push({ x, y, z });
  }
  return out;
}

export function createModes({ session, scene, hud, uiRoot, city, getHero, getCamera, applyRule }) {
  let state = null;       // the mode's shared state (host owns it, everyone draws it)
  const panel = el('div', { class: 'mode-panel hidden' });
  const board = el('div', { class: 'panel scoreboard hidden' });
  uiRoot.append(panel, board);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf7e36a });
  const rings = [];
  const zone = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xf7e36a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  zone.visible = false;
  scene.add(zone);
  let broadcastT = 0, pingT = 0;
  const pos = (id) => (id === session.me.id ? getHero().body.p : session.players.get(id)?.puppet.body.p);
  const ids = () => [session.me.id, ...[...session.players.values()].filter((p) => !p.away).map((p) => p.id)];
  const nameOf = (id) => (id === session.me.id ? 'You' : session.players.get(id)?.name ?? `Player ${id}`);

  function start(kind, opts = {}) {
    if (!session.isHost) return;
    const everyone = ids();
    const hp = getHero().body.p;
    state = { kind, t: -5, secs: MODES[kind].secs, scores: Object.fromEntries(everyone.map((i) => [i, 0])), opts, done: false };
    if (kind === 'race') { state.course = makeCourse(city, hp); state.progress = Object.fromEntries(everyone.map((i) => [i, 0])); state.fairCap = !!opts.fairCap; }
    if (kind === 'tag' || kind === 'hide') state.it = everyone[Math.floor(Math.random() * everyone.length)];
    if (kind === 'hide') state.found = {};
    if (kind === 'king') moveZone(hp);
    state.immune = 0;
    broadcast();
  }
  function moveZone(near) {
    const roofs = city.boxes.filter((b) => b.kind === 'building' && !b.landmark && b.max[1] > 20 && b.max[1] < 90 && Math.hypot((b.min[0] + b.max[0]) / 2 - near.x, (b.min[2] + b.max[2]) / 2 - near.z) < 300);
    const r = roofs[Math.floor(Math.random() * roofs.length)] ?? city.boxes.find((b) => b.kind === 'building');
    state.zone = { minX: r.min[0], maxX: r.max[0], minZ: r.min[2], maxZ: r.max[2], y: r.max[1] };
    state.zoneT = 60;
  }
  function broadcast() { session.all({ k: 'mode', state }); }

  // Host rules, every frame.
  function hostStep(dt) {
    if (!state || state.done) return;
    state.t += dt;
    if (state.t < 0) return;
    const everyone = ids();
    state.immune = Math.max(0, state.immune - dt);
    switch (state.kind) {
      case 'race':
        for (const id of everyone) {
          const p = pos(id), k = state.progress[id] ?? 0, c = state.course[k];
          if (p && c && Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) < 12) { state.progress[id] = k + 1; state.scores[id] = k + 1; if (k + 1 >= state.course.length) finish(id); }
        }
        break;
      case 'tag': {
        state.scores[state.it] = (state.scores[state.it] ?? 0) + dt;
        const ip = pos(state.it);
        if (ip && state.immune <= 0) for (const id of everyone) {
          if (id === state.it) continue;
          const p = pos(id);
          if (p && Math.hypot(p.x - ip.x, p.y - ip.y, p.z - ip.z) < 2.2) { session.all({ k: 'tagged', by: state.it, who: id }); state.it = id; state.immune = 2; break; }
        }
        break;
      }
      case 'king':
        state.zoneT -= dt;
        if (state.zoneT <= 0) moveZone(getHero().body.p);
        for (const id of everyone) {
          const p = pos(id), zz = state.zone;
          if (p && p.x > zz.minX && p.x < zz.maxX && p.z > zz.minZ && p.z < zz.maxZ && Math.abs(p.y - 0.9 - zz.y) < 1.5) state.scores[id] = (state.scores[id] ?? 0) + dt;
        }
        break;
      case 'hide': {
        if (state.t < 30) break; // the hiders' head start
        const sp = pos(state.it);
        for (const id of everyone) {
          if (id === state.it || state.found[id]) continue;
          const p = pos(id);
          if (sp && p && Math.hypot(p.x - sp.x, p.y - sp.y, p.z - sp.z) < 2.5) { state.found[id] = true; state.scores[state.it] = (state.scores[state.it] ?? 0) + 1; session.all({ k: 'found', who: id }); }
        }
        for (const id of everyone) if (id !== state.it && !state.found[id]) state.scores[id] = (state.scores[id] ?? 0) + dt;
        if (everyone.every((id) => id === state.it || state.found[id])) finish(state.it);
        break;
      }
      default: break;
    }
    if (state.t >= state.secs && !state.done) finish(null);
    broadcastT += dt;
    if (broadcastT > 0.5) { broadcastT = 0; broadcast(); }
  }
  function finish(winner) {
    state.done = true;
    if (winner === null) {
      // Tag: least time as it wins; everything else: the highest score.
      const entries = Object.entries(state.scores);
      entries.sort((a, b) => (state.kind === 'tag' ? a[1] - b[1] : b[1] - a[1]));
      winner = Number(entries[0]?.[0] ?? session.me.id);
    }
    state.winner = winner;
    broadcast();
  }

  // Everyone: draw the mode, apply its local rules (the race's fair speed cap, friendly fire).
  function update(dt) {
    if (session.isHost) hostStep(dt);
    if (!state) { panel.classList.add('hidden'); zone.visible = false; for (const r of rings) r.visible = false; applyRule?.({}); return; }
    panel.classList.remove('hidden');
    const m = MODES[state.kind];
    const left = Math.max(0, Math.ceil(state.secs - state.t));
    const me = session.me.id;
    let line;
    if (state.t < 0) line = `STARTING IN ${Math.ceil(-state.t)}`;
    else if (state.kind === 'race') line = `CHECKPOINT ${Math.min(state.course.length, (state.progress?.[me] ?? 0) + 1)} OF ${state.course.length}`;
    else if (state.kind === 'tag') line = state.it === me ? 'YOU ARE IT! TAG SOMEONE' : `${nameOf(state.it).toUpperCase()} IS IT`;
    else if (state.kind === 'brawl') line = `KNOCKOUTS: ${Math.round(state.scores[me] ?? 0)}`;
    else if (state.kind === 'king') line = 'STAND ON THE YELLOW ROOF';
    else line = state.it === me ? (state.t < 30 ? 'COUNT TO THIRTY...' : 'FIND THEM (V: SPIDER-SENSE PING)') : (state.found?.[me] ? 'FOUND!' : 'HIDE!');
    panel.replaceChildren(el('b', {}, m.name), el('span', {}, line), el('em', {}, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`));
    // Race rings.
    if (state.kind === 'race') {
      while (rings.length < state.course.length) { const r = new THREE.Mesh(new THREE.TorusGeometry(10, 0.5, 8, 32), ringMat); scene.add(r); rings.push(r); }
      const k = state.progress?.[me] ?? 0;
      state.course.forEach((c, i) => { const r = rings[i]; r.visible = i >= k && i < k + 2; r.position.set(c.x, c.y, c.z); r.lookAt(getCamera().position); r.scale.setScalar(i === k ? 1 : 0.7); });
    } else for (const r of rings) r.visible = false;
    // The rooftop zone.
    if (state.kind === 'king' && state.zone) {
      const zz = state.zone;
      zone.visible = true;
      zone.position.set((zz.minX + zz.maxX) / 2, zz.y + 15, (zz.minZ + zz.maxZ) / 2);
      zone.scale.set((zz.maxX - zz.minX) / 2, 30, (zz.maxZ - zz.minZ) / 2);
    } else zone.visible = false;
    pingT = Math.max(0, pingT - dt);
    // Local rules for this mode.
    applyRule?.({ fairCap: state.kind === 'race' && state.fairCap && state.t >= 0, friendlyFire: state.kind === 'brawl' && state.t >= 0, frozen: (state.kind === 'race' && state.t < 0) || (state.kind === 'hide' && state.it === me && state.t < 30) });
    if (state.done && board.classList.contains('hidden')) showBoard();
  }

  function showBoard() {
    const rows = Object.entries(state.scores).sort((a, b) => (state.kind === 'tag' ? a[1] - b[1] : b[1] - a[1]));
    board.replaceChildren(el('div', { class: 'card' }, [
      el('h2', {}, `${MODES[state.kind].name}: ${nameOf(state.winner).toUpperCase()} WINS!`),
      ...rows.map(([id, sc]) => el('div', { class: 'row' }, [el('span', {}, nameOf(Number(id))), el('b', {}, state.kind === 'tag' || state.kind === 'king' || state.kind === 'hide' ? `${Math.round(sc)} s` : String(Math.round(sc)))])),
      el('div', { class: 'foot' }, [el('button', { class: 'mbtn', onclick: () => { board.classList.add('hidden'); state = null; if (session.isHost) session.all({ k: 'mode', state: null }); } }, 'OK')]),
    ]));
    board.classList.remove('hidden');
  }

  return {
    start, update,
    get state() { return state; },
    message(id, data) {
      if (data.k === 'mode') { if (!session.isHost) state = data.state; if (!data.state) board.classList.add('hidden'); }
      if (data.k === 'tagged') hud.caption(data.who === session.me.id ? 'TAGGED! YOU ARE IT' : `${nameOf(data.who).toUpperCase()} IS IT`, 1.6);
      if (data.k === 'found') hud.caption(data.who === session.me.id ? 'FOUND YOU!' : `${nameOf(data.who).toUpperCase()} FOUND`, 1.6);
      if (data.k === 'ko' && session.isHost && state?.kind === 'brawl' && data.by) state.scores[data.by] = (state.scores[data.by] ?? 0) + 1;
    },
    // The seeker's spider-sense ping: every hider shows for two seconds.
    ping() { if (!state || state.kind !== 'hide' || state.it !== session.me.id || pingT > 0) return false; pingT = 20; session.all({ k: 'reveal' }); return true; },
    stop() { state = null; if (session.isHost) session.all({ k: 'mode', state: null }); },
    adopt(s) { state = s ?? null; },
  };
}
