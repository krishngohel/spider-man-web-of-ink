import { applyDv } from './ledger.js';
import { tune } from './constants.js';

// Quadratic drag coefficient (per metre) for a given terminal speed: at terminal, k v^2 = g.
export const dragK = (g, terminal) => g / (terminal * terminal);

export function applyGravity(body, g, dt) {
  applyDv(body, 'gravity', 0, -g * dt, 0);
}

export function applyDrag(body, k, dt) {
  const v = body.v;
  const s = Math.hypot(v.x, v.y, v.z);
  if (s < 1e-6) return;
  // Never reverses the velocity, even with a huge k.
  const f = Math.min(1, k * s * dt);
  applyDv(body, 'drag', -v.x * f, -v.y * f, -v.z * f);
}

// Rescales (nx, ny, nz) to length s and applies the difference as lift: lift turns a velocity
// and does no work.
function turnTo(body, nx, ny, nz, s) {
  const v = body.v;
  const k = s / Math.hypot(nx, ny, nz);
  applyDv(body, 'lift', nx * k - v.x, ny * k - v.y, nz * k - v.z);
}

// Skydiver-style tracking: leans the velocity toward a horizontal direction without changing
// its size. Strength grows with speed squared (a body is a poor wing at walking pace).
export function applyBodyLift(body, dirX, dirZ, amount, dt) {
  const v = body.v;
  const s = Math.hypot(v.x, v.y, v.z);
  if (s < 1 || amount <= 0) return;
  const ux = v.x / s, uy = v.y / s, uz = v.z / s;
  const d = dirX * ux + dirZ * uz;
  let px = dirX - d * ux, py = -d * uy, pz = dirZ - d * uz;
  const pl = Math.hypot(px, py, pz);
  if (pl < 1e-4) return;
  px /= pl; py /= pl; pz /= pl;
  const a = Math.min(tune.bodyLiftMax, tune.bodyLift * s * s) * Math.min(1, amount);
  turnTo(body, v.x + px * a * dt, v.y + py * a * dt, v.z + pz * a * dt, s);
}

// Web wings. pitch -1 (nose down) to +1 (pull up), bank -1 (left) to +1 (right). Lift acts
// perpendicular to the velocity and does no work; drag follows the polar. Below the stall speed
// the lift fades out.
export function applyGlide(body, pitch, bank, dt) {
  const v = body.v;
  const s = Math.hypot(v.x, v.y, v.z);
  if (s < 0.5) return;
  const ux = v.x / s, uy = v.y / s, uz = v.z / s;
  // "Up" perpendicular to the flight path, then banked about the path.
  let ax = -uy * ux, ay = 1 - uy * uy, az = -uy * uz;
  const al = Math.hypot(ax, ay, az);
  if (al < 1e-4) { ax = 0; ay = 0; az = 1; } else { ax /= al; ay /= al; az /= al; }
  // side = path x up, the glider's right.
  const sx = uy * az - uz * ay, sy = uz * ax - ux * az, sz = ux * ay - uy * ax;
  const b = Math.max(-1, Math.min(1, bank)) * 0.7;
  const cb = Math.cos(b), sb = Math.sin(b);
  const lx = ax * cb + sx * sb, ly = ay * cb + sy * sb, lz = az * cb + sz * sb;
  const p = Math.max(-1, Math.min(1, pitch));
  const cl = tune.glideCl * (1 + 0.6 * p);
  const cd = (tune.glideCl / tune.glideRatio) * (1 + 0.8 * p * p);
  const stall = tune.glideStall;
  const t = Math.min(1, Math.max(0, (s - stall * 0.6) / (stall * 0.4)));
  const aL = cl * s * s * t * t * (3 - 2 * t);
  turnTo(body, v.x + lx * aL * dt, v.y + ly * aL * dt, v.z + lz * aL * dt, s);
  const f = Math.min(1, cd * s * dt);
  applyDv(body, 'drag', -body.v.x * f, -body.v.y * f, -body.v.z * f);
}
