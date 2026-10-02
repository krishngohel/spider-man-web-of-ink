import { SELF, env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { PROTOCOL_VERSION, CODE_ALPHABET, makeCode } from '../src/shared.js';

let ipN = 0;
// Opens a socket to the world; each test uses its own IP so the join rate limit stays out of the way.
async function connect(ip = `10.0.0.${++ipN}`) {
  const res = await SELF.fetch('http://relay/world', { headers: { Upgrade: 'websocket', 'CF-Connecting-IP': ip } });
  const ws = res.webSocket;
  ws.binaryType = 'arraybuffer';
  ws.accept();
  const inbox = [], waiters = [];
  ws.addEventListener('message', (e) => {
    const m = typeof e.data === 'string' ? JSON.parse(e.data) : new Uint8Array(e.data);
    const w = waiters.findIndex((x) => x.test(m));
    if (w >= 0) { waiters[w].res(m); waiters.splice(w, 1); } else inbox.push(m);
  });
  const next = (test = () => true, ms = 2000) => {
    const i = inbox.findIndex(test);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((res, rej) => { waiters.push({ test, res }); setTimeout(() => rej(new Error('timeout')), ms); });
  };
  return { ws, inbox, next, send: (o) => ws.send(typeof o === 'string' || o instanceof Uint8Array ? o : JSON.stringify(o)) };
}
const T = (t) => (m) => m && m.t === t;
async function create(name = 'Host', token = 'h') { const c = await connect(); c.send({ t: 'create', v: PROTOCOL_VERSION, name, token }); const w = await c.next(T('welcome')); return { c, w }; }
async function join(code, name, token) { const c = await connect(); c.send({ t: 'join', v: PROTOCOL_VERSION, code, name, token }); const m = await c.next((x) => x.t === 'welcome' || x.t === 'error'); return { c, m }; }
const stub = () => env.WORLD.get(env.WORLD.idFromName('world'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('the relay', () => {
  // Each test starts with no world (the one-world rule would otherwise carry one over).
  beforeEach(async () => {
    await runInDurableObject(stub(), async (w, state) => {
      for (const ws of state.getWebSockets()) { ws.serializeAttachment({ id: null }); try { ws.close(1000, 'reset'); } catch { /* gone */ } }
      w.world = null; w.snapshot = null; w.joins.clear();
      await state.storage.deleteAll();
    });
  });
  it('join codes use only letters and digits that cannot be mistaken', () => {
    for (const ch of '0O1IL5S2Z8B') expect(CODE_ALPHABET.includes(ch)).toBe(false);
    for (let i = 0; i < 200; i++) { const c = makeCode(); expect(c).toMatch(/^[A-Z0-9]{6}$/); for (const ch of c) expect(CODE_ALPHABET.includes(ch)).toBe(true); }
  });
  it('one world at a time: a second create is refused', async () => {
    const { w } = await create();
    expect(w.code).toHaveLength(6);
    const c2 = await connect();
    c2.send({ t: 'create', v: PROTOCOL_VERSION, name: 'B', token: 'b' });
    const e = await c2.next(T('error'));
    expect(e.code).toBe('running');
    expect(e.msg).toBe('A world is already running. Join it with its code.');
  });
  it('five players at most: the sixth is told the world is full', async () => {
    const { w } = await create();
    for (let i = 2; i <= 5; i++) { const { m } = await join(w.code, `P${i}`, `t${i}`); expect(m.t).toBe('welcome'); expect(m.id).toBe(i); }
    const { m } = await join(w.code, 'P6', 't6');
    expect(m.t).toBe('error');
    expect(m.msg).toBe('World full.');
  });
  it('a wrong code and a different game version are refused', async () => {
    await create();
    const { m } = await join('AAAAAA', 'X', 'x');
    expect(m.code).toBe('code');
    const c = await connect();
    c.send({ t: 'join', v: PROTOCOL_VERSION + 1, code: 'AAAAAA', name: 'Y', token: 'y' });
    expect((await c.next(T('error'))).code).toBe('version');
  });
  it('state frames are relayed to everyone else with the sender id in front', async () => {
    const { c: host, w } = await create();
    const { c: p2 } = await join(w.code, 'P2', 't2');
    p2.send(new Uint8Array([7, 8, 9]));
    const got = await host.next((m) => m instanceof Uint8Array);
    expect([...got]).toEqual([2, 7, 8, 9]);
  });
  it('when the host drops, the longest-connected player takes over with the last snapshot', async () => {
    const { c: host, w } = await create();
    const { c: p2 } = await join(w.code, 'P2', 't2');
    const { c: p3 } = await join(w.code, 'P3', 't3');
    host.send({ t: 'snapshot', data: { hello: 1 } });
    await sleep(50);
    host.ws.close(1000);
    const h2 = await p2.next(T('host'));
    expect(h2.id).toBe(2);
    expect(h2.snapshot).toEqual({ hello: 1 });
    expect((await p3.next(T('host'))).id).toBe(2);
  });
  it('a player who drops can rejoin within the window and keeps the slot', async () => {
    const { w } = await create();
    const { c: p2, m } = await join(w.code, 'P2', 'tok2');
    expect(m.id).toBe(2);
    p2.ws.close(1000);
    await sleep(50);
    const again = await join(w.code, 'P2', 'tok2');
    expect(again.m.id).toBe(2);
  });
  it('an empty world ends after its timeout', async () => {
    const { c: host } = await create();
    host.ws.close(1000);
    await sleep(600);
    await runDurableObjectAlarm(stub());
    const s = await (await SELF.fetch('http://relay/status')).json();
    expect(s.running).toBe(false);
  });
  it('oversized messages and floods are dropped', async () => {
    const { c: host, w } = await create();
    const { c: p2 } = await join(w.code, 'P2', 't2');
    p2.send(new Uint8Array(5000));
    for (let i = 0; i < 100; i++) p2.send(new Uint8Array([i]));
    await sleep(300);
    const frames = host.inbox.filter((m) => m instanceof Uint8Array);
    expect(frames.every((f) => f.length < 100)).toBe(true);
    expect(frames.length).toBeLessThanOrEqual(60);
  });
  it('join attempts are rate limited per address', async () => {
    let refused = null;
    for (let i = 0; i < 12; i++) {
      const c = await connect('10.9.9.9');
      c.send({ t: 'join', v: PROTOCOL_VERSION, code: 'AAAAAA', name: 'R', token: `r${i}` });
      const m = await c.next(T('error'));
      if (m.code === 'rate') { refused = i; break; }
    }
    expect(refused).toBe(10);
  });
});
