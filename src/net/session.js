import * as THREE from 'three';
import { createNetClient } from './client.js';
import { MSG, encodePlayer, decodePlayer, encodeWorld, decodeWorld, FLAG } from './protocol.js';
import { createBuffer } from './interp.js';
import { ROSTER, characterById } from '../roster/characters.js';
import { el } from '../ui/dom.js';

// A multiplayer session (spec 14): the socket, the other players drawn from their own state (owner
// authority), and the shared world run by the host (host authority): enemies, crimes and modes.
// Hits on NPCs are reported to the host, which applies them; hits on players are applied by the
// victim. Friends only, so beyond sanity checks there is no anti-cheat.

const PLAYER_HZ = 15, WORLD_HZ = 10, SNAPSHOT_EVERY = 5;
const NAME_COLORS = ['#f7e36a', '#6ad0f7', '#f78a6a', '#9ae06a', '#d08af7'];

export function createSession(game) {
  const { scene, assets, hero, combat, hud, uiRoot, buildCharacter, createPoser, createWebLine } = game;
  const players = new Map();     // id -> remote player
  const now = () => performance.now() / 1000;
  let sendT = 0, worldT = 0, snapT = 0, seq = 0, wseq = 0, active = false, status = '', lastHurtBy = 0;
  const tagBox = el('div', { class: 'nametags' });
  uiRoot.append(tagBox);
  const listeners = { message: [], players: [], status: [] };
  const on = (k, f) => listeners[k].push(f);
  const emitL = (k, ...a) => { for (const f of listeners[k]) f(...a); };
  const v3 = new THREE.Vector3();

  const net = createNetClient({
    welcome(m) {
      active = true; status = 'connected';
      syncPlayers(m.players);
      // Joining a running world: the host's last snapshot shows what is going on.
      if (m.snapshot && !isHost()) game.onSnapshot?.(m.snapshot);
      emitL('status', 'welcome', m);
    },
    players(list) { syncPlayers(list); },
    host(id, snapshot) {
      emitL('status', 'host', { id });
      if (id === net.me.id) {
        // This machine runs the world now: real enemies from the last snapshot, in place of the
        // puppets that were following the old host.
        combat.enemies.clearPuppets();
        if (snapshot) game.onBecomeHost?.(snapshot);
        hud.caption('YOU ARE THE HOST NOW', 2.5);
      }
    },
    frame(id, buf, off) {
      const type = new Uint8Array(buf, off, 1)[0];
      if (type === MSG.PLAYER) {
        const p = players.get(id);
        if (p) { const s = decodePlayer(buf, off); p.buf.push(now(), s); p.lastSeen = now(); }
      } else if (type === MSG.WORLD && !isHost()) {
        combat.enemies.puppetSync(decodeWorld(buf, off).enemies);
      }
    },
    message(id, data) {
      if (data?.k === 'hit' && isHost()) {
        // A remote player's hit on an enemy: checked for range, then applied here.
        const e = combat.enemies.list.find((q) => q.id === data.id);
        const p = players.get(id);
        if (e && p) {
          const s = p.buf.items[p.buf.items.length - 1]?.s;
          if (!s || Math.hypot(s.p.x - e.body.p.x, s.p.z - e.body.p.z) < (data.kind === 'web' || data.ranged ? 45 : 8)) combat.enemies.hit(e, { ...data.hit, from: s ? s.p : null });
        }
        return;
      }
      if (data?.k === 'hurt') { lastHurtBy = data.by ?? id; combat.heroCombat.takeHit({ dmg: data.dmg, dir: data.dir ?? { x: 0, z: 1 }, from: null }); return; }
      emitL('message', id, data);
    },
    error(code, msg) { status = msg; emitL('status', 'error', { code, msg }); },
    closed(why) { active = false; status = why; clearPlayers(); combat.enemies.clearPuppets(); emitL('status', 'closed', { why }); },
    reconnecting() { status = 'reconnecting'; emitL('status', 'reconnecting'); },
  });
  const isHost = () => net.isHost;

  function syncPlayers(list) {
    const ids = new Set();
    list.forEach((pl, i) => {
      if (pl.id === net.me.id) return;
      ids.add(pl.id);
      let p = players.get(pl.id);
      if (!p) {
        p = { id: pl.id, name: pl.name, char: pl.char, buf: createBuffer(), lastSeen: now(), color: NAME_COLORS[(pl.id - 1) % NAME_COLORS.length] };
        p.tag = el('div', { class: 'nametag' }, pl.name);
        p.tag.style.color = p.color;
        tagBox.append(p.tag);
        p.line = createWebLine(scene);
        p.puppet = makePuppet();
        players.set(pl.id, p);
        build(p, pl.char);
      }
      p.name = pl.name; p.tag.textContent = pl.name; p.away = pl.away;
      if (pl.char !== p.char) build(p, pl.char);
      void i;
    });
    for (const [id, p] of players) if (!ids.has(id)) removePlayer(p);
    emitL('players', [...players.values()]);
  }
  function build(p, charId) {
    if (p.model) scene.remove(p.model.root);
    p.char = charId;
    p.model = buildCharacter(assets, characterById(charId));
    scene.add(p.model.root);
    p.poser = createPoser(p.model);
  }
  function removePlayer(p) {
    if (p.model) scene.remove(p.model.root);
    p.tag.remove();
    p.line.update(v3, { active: false }, { active: false }, null, 0.06);
    players.delete(p.id);
  }
  function clearPlayers() { for (const p of [...players.values()]) removePlayer(p); }

  // The poser drives any model from a hero-shaped object; a remote player's is filled from the
  // network each frame.
  function makePuppet() {
    const pivots = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
    const rope = { active: false, pivots: [], pivot: null };
    const swing = {
      active: false, P: pivots[1], R: pivots[0], L: 0, rope: { pivots: [] },
      angle(p, v) { const P = this.P, sh = Math.hypot(v.x, v.z) || 1; const fwd = ((p.x - P.x) * v.x + (p.z - P.z) * v.z) / sh; return Math.atan2(fwd, P.y - p.y) * 57.2958; },
    };
    return { body: { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } }, state: 'air', facing: { x: 0, z: 1 }, swing, rope, wall: { nx: 0, nz: 1 }, wallMomentum: false, diving: false, hangInverted: false, speed: 0, _pivots: pivots };
  }
  function fillPuppet(pp, s) {
    pp.body.p.x = s.p.x; pp.body.p.y = s.p.y; pp.body.p.z = s.p.z;
    pp.body.v.x = s.v.x; pp.body.v.y = s.v.y; pp.body.v.z = s.v.z;
    pp.speed = Math.hypot(s.v.x, s.v.y, s.v.z);
    pp.state = s.state;
    pp.facing.x = Math.sin(s.facing); pp.facing.z = Math.cos(s.facing);
    pp.wall.nx = -pp.facing.x; pp.wall.nz = -pp.facing.z;
    pp.diving = !!(s.flags & FLAG.DIVING);
    pp.hangInverted = !!(s.flags & FLAG.INVERTED);
    const roped = !!(s.flags & FLAG.ROPE);
    const [R, P] = pp._pivots;
    Object.assign(R, s.anchor); Object.assign(P, s.pivot);
    const onSwing = roped && (s.state === 'swing' || s.state === 'hang');
    pp.swing.active = onSwing;
    pp.swing.rope.pivots = onSwing ? ((s.flags & FLAG.WRAPPED) ? [R, P] : [R]) : [];
    pp.swing.P = (s.flags & FLAG.WRAPPED) ? P : R;
    pp.rope.active = roped && s.state === 'zip';
    pp.rope.pivots = pp.rope.active ? [R] : [];
    pp.rope.pivot = pp.rope.active ? R : null;
  }

  // My own state, 15 times a second.
  function myFrame() {
    const b = hero.body, sw = hero.swing, r = hero.rope;
    const roped = sw.active || r.active;
    const pivots = sw.active ? sw.rope.pivots : r.pivots;
    const anchor = pivots[0] ?? null, last = pivots[pivots.length - 1] ?? anchor;
    let flags = 0;
    if (roped) flags |= FLAG.ROPE;
    if (pivots.length > 1) flags |= FLAG.WRAPPED;
    if (hero.diving) flags |= FLAG.DIVING;
    if (hero.hangInverted) flags |= FLAG.INVERTED;
    return encodePlayer({
      seq: seq++, char: Math.max(0, ROSTER.findIndex((c) => c.id === game.characterId())), state: hero.state, flags, trick: 255,
      hp: (combat.heroCombat.c.hp / combat.heroCombat.c.maxHp) * 255,
      p: b.p, v: b.v, facing: Math.atan2(hero.facing.x, hero.facing.z),
      anchor: anchor ? { x: anchor.x, y: anchor.y, z: anchor.z } : null, pivot: last ? { x: last.x, y: last.y, z: last.z } : null,
    });
  }

  // Everyone the enemies can go for: me, and (on the host) the other players.
  function targets() {
    const out = [{ id: net.me.id, body: hero.body, invuln: () => combat.heroCombat.c.iframes > 0, hit: (h) => combat.heroCombat.takeHit(h) }];
    if (!active || !isHost()) return out;
    for (const p of players.values()) {
      if (p.away) continue;
      out.push({ id: p.id, body: p.puppet.body, invuln: () => false, hit: (h) => { net.to(p.id, { k: 'hurt', dmg: h.dmg, dir: h.dir }); return true; } });
    }
    return out;
  }

  function update(dt) {
    if (!active) return;
    const t = now();
    sendT += dt; worldT += dt; snapT += dt;
    if (sendT >= 1 / PLAYER_HZ) { sendT = 0; net.sendFrame(myFrame()); }
    if (isHost()) {
      if (worldT >= 1 / WORLD_HZ) {
        worldT = 0;
        // Only enemies within 300 m of some player go out.
        const near = combat.enemies.list.filter((e) => e.alive && !e.isPlayer && !e.puppet && [hero.body.p, ...[...players.values()].map((p) => p.puppet.body.p)].some((q) => Math.hypot(q.x - e.body.p.x, q.z - e.body.p.z) < 300));
        net.sendFrame(encodeWorld(wseq++, near.map((e) => ({ id: e.id, arch: e.arch, faction: e.faction, look: e.look ?? 0, state: e.state, p: e.body.p, facing: e.facing, hp: e.hp, maxHp: e.maxHp, web: e.web }))));
      }
      if (snapT >= SNAPSHOT_EVERY) { snapT = 0; net.snapshot(game.makeSnapshot?.() ?? null); }
    }
    // Other players: drawn 100 ms behind, animated by the same poser as the hero.
    for (const p of players.values()) {
      const s = p.buf.sample(t);
      if (!s || p.away) { p.model.root.visible = false; p.tag.style.display = 'none'; continue; }
      p.model.root.visible = true;
      fillPuppet(p.puppet, s);
      p.poser.update(p.puppet, dt, [], s.p);
      p.model.updateGear?.(dt, p.puppet);
      p.poser.lineWorld(v3);
      p.line.update(v3, p.puppet.swing, p.puppet.rope, null, 0.06);
      // Name tag over the head.
      const c = game.camera;
      v3.set(s.p.x, s.p.y + 1.3, s.p.z).project(c);
      if (v3.z < 1) { p.tag.style.display = ''; p.tag.style.left = `${(v3.x * 0.5 + 0.5) * innerWidth}px`; p.tag.style.top = `${(-v3.y * 0.5 + 0.5) * innerHeight}px`; } else p.tag.style.display = 'none';
      p.hp = s.hp / 255;
    }
  }

  // My hit on an enemy that the host owns: tell the host (it applies it), and show it here.
  combat.enemies.onPuppetHit = (e, h) => {
    // Another player (friendly fire): they take it on their own machine. An enemy: the host does.
    if (e.isPlayer) { net.to(e.netPlayer, { k: 'hurt', dmg: (h.dmg ?? 10) * 0.5, dir: h.dir, by: net.me.id }); return; }
    net.to(net.me.host, { k: 'hit', id: e.netId, hit: { dmg: h.dmg, dir: h.dir, push: h.push, lift: h.lift, kind: h.kind }, kind: h.kind });
  };

  return {
    net, players, on,
    get active() { return active; },
    get isHost() { return isHost(); },
    get status() { return status; },
    get me() { return net.me; },
    get lastHurtBy() { return lastHurtBy; },
    targets, update,
    create(o) { net.create(o); status = 'connecting'; },
    join(o) { net.join(o); status = 'connecting'; },
    leave() { net.leave(); active = false; clearPlayers(); combat.enemies.clearPuppets(); },
    end() { net.end(); },
    all(data) { net.all(data); },
    to(id, data) { net.to(id, data); },
    setChar(id) { net.meta({ char: id }); },
  };
}
