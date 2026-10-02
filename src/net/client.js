import { PROTOCOL_VERSION, normalizeCode } from './protocol.js';

// The socket to the relay. Create or join the one world, then: binary frames for state (the relay
// adds the sender's id), JSON for everything else. A drop reconnects with the same token for up to
// 60 s, so the player keeps their slot (spec 14.3).

export const RELAY_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RELAY_URL) || 'ws://localhost:8790';

function token() {
  try {
    let t = sessionStorage.getItem('web-of-ink-net-token');
    if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('web-of-ink-net-token', t); }
    return t;
  } catch { return Math.random().toString(36).slice(2); }
}

export function createNetClient(handlers = {}) {
  const h = { welcome() {}, players() {}, host() {}, frame() {}, message() {}, error() {}, closed() {}, reconnecting() {}, ...handlers };
  let ws = null, url = RELAY_URL, hello = null, joined = false, ended = false, retryUntil = 0, retryT = null;
  const me = { id: 0, host: 0, code: '', token: token() };

  function open(msg) {
    hello = msg;
    ws = new WebSocket(url.replace(/\/$/, '') + '/world');
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify(hello));
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') { const b = e.data; const id = new Uint8Array(b, 0, 1)[0]; h.frame(id, b, 1); return; }
      const m = JSON.parse(e.data);
      switch (m.t) {
        case 'welcome':
          me.id = m.id; me.host = m.host; me.code = m.code; joined = true; retryUntil = 0;
          // Any later reconnect is a join with this code and token.
          hello = { t: 'join', v: PROTOCOL_VERSION, code: m.code, name: hello.name, char: hello.char, token: me.token };
          h.welcome(m);
          break;
        case 'players': me.host = m.host; h.players(m.players, m.host); break;
        case 'host': me.host = m.id; h.host(m.id, m.snapshot); break;
        case 'from': h.message(m.id, m.data); break;
        case 'ended': ended = true; h.closed('ended'); break;
        case 'error': h.error(m.code, m.msg); ended = true; break;
        default: break;
      }
    };
    ws.onclose = () => {
      if (ended || !joined) { if (!ended) h.closed('lost'); return; }
      // Dropped: try to get the slot back for a minute.
      if (!retryUntil) retryUntil = Date.now() + 60000;
      if (Date.now() > retryUntil) { h.closed('lost'); return; }
      h.reconnecting();
      clearTimeout(retryT);
      retryT = setTimeout(() => open(hello), 1500);
    };
  }

  return {
    me,
    get connected() { return !!ws && ws.readyState === 1 && joined; },
    get isHost() { return me.id && me.id === me.host; },
    create({ name, char, relay }) { if (relay) url = relay; ended = false; joined = false; open({ t: 'create', v: PROTOCOL_VERSION, name, char, token: me.token }); },
    join({ code, name, char, relay }) { if (relay) url = relay; ended = false; joined = false; open({ t: 'join', v: PROTOCOL_VERSION, code: normalizeCode(code), name, char, token: me.token }); },
    sendFrame(buf) { if (ws && ws.readyState === 1) ws.send(buf); },
    all(data) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'all', data })); },
    to(id, data) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'to', id, data })); },
    snapshot(data) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'snapshot', data })); },
    meta(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'meta', ...m })); },
    end() { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'end' })); },
    leave() { ended = true; clearTimeout(retryT); try { ws?.close(1000, 'leave'); } catch { /* closed */ } },
    // Test hook: drop the socket as if the network went (the client should reconnect).
    drop() { try { ws?.close(4999, 'drop'); } catch { /* closed */ } },
  };
}
