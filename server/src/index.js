import { DurableObject } from 'cloudflare:workers';

// Web of Ink multiplayer relay (spec 14.3): one Worker and one Durable Object called World. Every
// request goes to the single World instance (idFromName("world")), which makes "one world at a
// time" a hard guarantee. The World is a relay, not a game simulation: it hands out the join code,
// player ids and the host role, forwards messages between players, and keeps nothing once the
// world ends.

import { PROTOCOL_VERSION, MAX_PLAYERS, MAX_MESSAGE, MAX_RATE, JOIN_LIMIT, makeCode } from './shared.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const stub = env.WORLD.get(env.WORLD.idFromName('world'));
    if (url.pathname === '/world') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426, headers: cors });
      return stub.fetch(request);
    }
    if (url.pathname === '/status') return stub.fetch(request);
    return new Response('Web of Ink relay', { headers: cors });
  },
};

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.rejoinMs = Number(env.REJOIN_MS ?? 60000);
    this.emptyMs = Number(env.EMPTY_MS ?? 120000);
    this.joins = new Map();   // ip -> join attempt times (last minute)
    this.rates = new Map();   // ws -> { t, n }
    this.snapshot = null;     // the host's last full world snapshot (for migration)
    ctx.blockConcurrencyWhile(async () => { this.world = (await ctx.storage.get('world')) ?? null; });
  }

  async save() { if (this.world) await this.ctx.storage.put('world', this.world); else await this.ctx.storage.delete('world'); }

  // Sockets that are open, by player id.
  sockets() {
    const out = new Map();
    for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a?.id) out.set(a.id, ws); }
    return out;
  }
  active() { return Object.values(this.world?.players ?? {}).filter((p) => !p.away); }
  roster() { return Object.values(this.world.players).map((p) => ({ id: p.id, name: p.name, char: p.char, away: !!p.away })); }
  send(ws, msg) { try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { /* gone */ } }
  broadcast(msg, except = null) { const s = JSON.stringify(msg); for (const [id, ws] of this.sockets()) if (id !== except) this.send(ws, s); }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/status') {
      await this.expire();
      return Response.json({ running: !!this.world, players: this.active().length, version: PROTOCOL_VERSION }, { headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
    const now = Date.now();
    const times = (this.joins.get(ip) ?? []).filter((t) => now - t < 60000);
    times.push(now);
    this.joins.set(ip, times);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null, ip, limited: times.length > JOIN_LIMIT });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const size = typeof message === 'string' ? message.length : message.byteLength;
    if (size > MAX_MESSAGE) return; // too big: dropped
    // Per-player rate: more than MAX_RATE a second are dropped.
    const now = Date.now();
    const r = this.rates.get(ws) ?? { t: now, n: 0 };
    if (now - r.t >= 1000) { r.t = now; r.n = 0; }
    r.n++;
    this.rates.set(ws, r);
    if (r.n > MAX_RATE) return;
    const att = ws.deserializeAttachment() ?? {};
    if (typeof message !== 'string') {
      // A state frame: forward to everyone else with the sender's id in front.
      if (!att.id || !this.world) return;
      const src = new Uint8Array(message);
      const out = new Uint8Array(src.length + 1);
      out[0] = att.id; out.set(src, 1);
      for (const [id, other] of this.sockets()) if (id !== att.id) { try { other.send(out.buffer); } catch { /* gone */ } }
      return;
    }
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    if (!att.id) return this.handshake(ws, att, msg);
    await this.control(ws, att, msg);
  }

  async handshake(ws, att, msg) {
    if (att.limited) { this.send(ws, { t: 'error', code: 'rate', msg: 'Too many join attempts. Wait a minute and try again.' }); ws.close(4008, 'rate'); return; }
    if (msg.v !== PROTOCOL_VERSION) { this.send(ws, { t: 'error', code: 'version', msg: 'This game is a different version from the world. Refresh the page.' }); ws.close(4009, 'version'); return; }
    await this.expire();
    const name = String(msg.name ?? 'Player').slice(0, 16).replace(/[^\w .'-]/g, '') || 'Player';
    const char = String(msg.char ?? 'peter').slice(0, 16);
    const token = String(msg.token ?? '').slice(0, 64);
    if (msg.t === 'create') {
      if (this.world && this.active().length + Object.values(this.world.players).filter((p) => p.away).length > 0) {
        this.send(ws, { t: 'error', code: 'running', msg: 'A world is already running. Join it with its code.' });
        ws.close(4001, 'running');
        return;
      }
      this.world = { code: makeCode(), created: Date.now(), hostId: 1, nextId: 2, players: {} };
      this.world.players[1] = { id: 1, name, char, token, joinedAt: Date.now(), away: null };
      ws.serializeAttachment({ id: 1, ip: att.ip });
      await this.save();
      this.send(ws, { t: 'welcome', id: 1, host: 1, code: this.world.code, players: this.roster() });
      return;
    }
    if (msg.t === 'join') {
      if (!this.world) { this.send(ws, { t: 'error', code: 'none', msg: 'No world is running. Create one.' }); ws.close(4004, 'none'); return; }
      if (String(msg.code ?? '').toUpperCase() !== this.world.code) { this.send(ws, { t: 'error', code: 'code', msg: 'That code does not match the running world.' }); ws.close(4003, 'code'); return; }
      // A player who dropped in the last minute gets the same slot back.
      let p = token ? Object.values(this.world.players).find((q) => q.token === token) : null;
      if (p) { p.away = null; p.name = name; p.char = char; }
      else {
        if (Object.keys(this.world.players).length >= MAX_PLAYERS) { this.send(ws, { t: 'error', code: 'full', msg: 'World full.' }); ws.close(4005, 'full'); return; }
        p = { id: this.world.nextId++, name, char, token, joinedAt: Date.now(), away: null };
        this.world.players[p.id] = p;
      }
      // An old socket for the same player (a reconnect race) is closed.
      const old = this.sockets().get(p.id);
      if (old && old !== ws) { old.serializeAttachment({ id: null }); try { old.close(4010, 'replaced'); } catch { /* gone */ } }
      ws.serializeAttachment({ id: p.id, ip: att.ip });
      await this.save();
      this.send(ws, { t: 'welcome', id: p.id, host: this.world.hostId, code: this.world.code, players: this.roster(), snapshot: this.snapshot });
      this.broadcast({ t: 'players', players: this.roster(), host: this.world.hostId }, p.id);
      await this.schedule();
    }
  }

  async control(ws, att, msg) {
    const w = this.world;
    if (!w) return;
    switch (msg.t) {
      case 'meta': {
        const p = w.players[att.id];
        if (!p) return;
        if (msg.name) p.name = String(msg.name).slice(0, 16);
        if (msg.char) p.char = String(msg.char).slice(0, 16);
        await this.save();
        this.broadcast({ t: 'players', players: this.roster(), host: w.hostId });
        break;
      }
      case 'snapshot':
        if (att.id === w.hostId) this.snapshot = msg.data ?? null;
        break;
      case 'to': {
        const target = this.sockets().get(Number(msg.id));
        if (target) this.send(target, { t: 'from', id: att.id, data: msg.data });
        break;
      }
      case 'all':
        this.broadcast({ t: 'from', id: att.id, data: msg.data }, att.id);
        break;
      case 'end':
        if (att.id !== w.hostId) return;
        this.broadcast({ t: 'ended' });
        for (const s of this.ctx.getWebSockets()) { s.serializeAttachment({ id: null }); try { s.close(4000, 'ended'); } catch { /* gone */ } }
        this.world = null; this.snapshot = null;
        await this.save();
        break;
      default: break;
    }
  }

  async webSocketClose(ws) { await this.left(ws); }
  async webSocketError(ws) { await this.left(ws); }

  async left(ws) {
    this.rates.delete(ws);
    const att = ws.deserializeAttachment();
    if (!att?.id || !this.world) return;
    const p = this.world.players[att.id];
    if (!p) return;
    p.away = Date.now();
    if (!this.active().length) this.world.emptySince = Date.now();
    if (this.world.hostId === att.id) this.migrate();
    await this.save();
    this.broadcast({ t: 'players', players: this.roster(), host: this.world.hostId });
    await this.schedule();
  }

  // The host left: the player connected longest takes over, with the last full snapshot.
  migrate() {
    const next = this.active().sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (!next) return;
    this.world.hostId = next.id;
    this.broadcast({ t: 'host', id: next.id, snapshot: this.snapshot });
  }

  // Drops players away longer than the rejoin window; ends a world empty too long.
  async expire() {
    if (!this.world) return;
    const now = Date.now();
    let changed = false;
    for (const p of Object.values(this.world.players)) if (p.away && now - p.away > this.rejoinMs) { delete this.world.players[p.id]; changed = true; }
    if (!this.active().length) {
      const lastAway = Math.max(0, ...Object.values(this.world.players).map((p) => p.away ?? 0), this.world.emptySince ?? 0);
      if (!this.world.emptySince) { this.world.emptySince = now; changed = true; }
      if (now - this.world.emptySince >= this.emptyMs) { this.world = null; this.snapshot = null; await this.save(); return; }
      void lastAway;
    } else if (this.world.emptySince) { delete this.world.emptySince; changed = true; }
    if (changed) await this.save();
  }

  async schedule() {
    if (!this.world) return;
    const now = Date.now();
    let next = Infinity;
    for (const p of Object.values(this.world.players)) if (p.away) next = Math.min(next, p.away + this.rejoinMs + 50);
    if (!this.active().length) next = Math.min(next, (this.world.emptySince ?? now) + this.emptyMs + 50);
    if (next < Infinity) await this.ctx.storage.setAlarm(next);
  }

  async alarm() {
    await this.expire();
    if (this.world) { this.broadcast({ t: 'players', players: this.roster(), host: this.world.hostId }); await this.schedule(); }
  }
}
