// The physics rule, enforced: a body's velocity only ever changes through applyDv, and only for
// one of these physical reasons. Anything else throws. Each body keeps a running sum per source,
// so a test can check that the sources add up to the whole change in velocity.
export const SOURCES = ['gravity', 'drag', 'lift', 'rope', 'surface'];
const ALLOWED = new Set(SOURCES);

export function createBody({ mass = 80, x = 0, y = 0, z = 0 } = {}) {
  return {
    mass,
    p: { x, y, z },
    v: { x: 0, y: 0, z: 0 },
    log: Object.fromEntries(SOURCES.map((s) => [s, { x: 0, y: 0, z: 0 }])),
  };
}

export function applyDv(body, source, x, y, z) {
  if (!ALLOWED.has(source)) throw new Error(`velocity change from a non-physical source: ${source}`);
  if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) throw new Error(`non-finite dv from ${source}`);
  body.v.x += x; body.v.y += y; body.v.z += z;
  const l = body.log[source];
  l.x += x; l.y += y; l.z += z;
}

export function clearLog(body) {
  for (const s of SOURCES) { const l = body.log[s]; l.x = 0; l.y = 0; l.z = 0; }
}

// Places a body (tests, spawning, respawn). Velocity set this way is a teleport, not physics, and
// clears the log so the ledger starts from the new state.
export function placeBody(body, x, y, z, vx = 0, vy = 0, vz = 0) {
  body.p.x = x; body.p.y = y; body.p.z = z;
  body.v.x = vx; body.v.y = vy; body.v.z = vz;
  clearLog(body);
}
