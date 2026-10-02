// Remote players and enemies are drawn 100 ms in the past, between the two states that bracket
// that moment; when packets run late, they are carried on by their velocity for up to 250 ms and
// then held (spec 14.4). Plain math, tested without a network.

export const DELAY = 0.1, EXTRAPOLATE = 0.25;

export function createBuffer(max = 30) {
  const items = []; // { t, s } in arrival order
  return {
    items,
    push(t, s) {
      // Out-of-order packets (seq older than the newest) are dropped.
      const last = items[items.length - 1];
      if (last && seqOlder(s.seq, last.s.seq)) return false;
      items.push({ t, s });
      if (items.length > max) items.shift();
      return true;
    },
    // The state to draw at time `now` (seconds, same clock as push).
    sample(now, out = {}) {
      if (!items.length) return null;
      const rt = now - DELAY;
      let i = items.length - 1;
      while (i > 0 && items[i - 1].t > rt) i--;
      const b = items[i], a = items[i - 1];
      if (a && a.t <= rt && b.t >= rt) {
        const k = (rt - a.t) / Math.max(1e-6, b.t - a.t);
        return lerpState(a.s, b.s, k, out);
      }
      // Past the newest packet: extrapolate by velocity, at most EXTRAPOLATE seconds.
      const newest = items[items.length - 1];
      const dt = Math.min(EXTRAPOLATE, Math.max(0, rt - newest.t));
      out.p = { x: newest.s.p.x + newest.s.v.x * dt, y: newest.s.p.y + newest.s.v.y * dt, z: newest.s.p.z + newest.s.v.z * dt };
      copyRest(newest.s, out);
      out.extrapolated = dt > 0;
      return out;
    },
  };
}

// u16 sequence numbers wrap: "older" means behind by less than half the range.
export function seqOlder(a, b) { const d = (b - a) & 0xffff; return d !== 0 && d < 0x8000; }

function copyRest(s, out) {
  for (const k of Object.keys(s)) if (k !== 'p') out[k] = s[k];
  return out;
}

export function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function lerpState(a, b, k, out) {
  copyRest(k < 0.5 ? a : b, out);
  out.p = { x: a.p.x + (b.p.x - a.p.x) * k, y: a.p.y + (b.p.y - a.p.y) * k, z: a.p.z + (b.p.z - a.p.z) * k };
  out.v = { x: a.v.x + (b.v.x - a.v.x) * k, y: a.v.y + (b.v.y - a.v.y) * k, z: a.v.z + (b.v.z - a.v.z) * k };
  if (a.facing !== undefined) out.facing = lerpAngle(a.facing, b.facing, k);
  out.extrapolated = false;
  return out;
}
