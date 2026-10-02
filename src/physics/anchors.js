import { tune } from './constants.js';

// Where a web would stick. No sky hooks: the web is shot along a fan of real directions and sticks
// to whatever building it hits first. The fan centres on where the player wants to go (stick or
// camera, leaning on the current velocity) and scores each hit. The assist setting only changes how
// wide and dense the fan is and how much the player's aim matters; it never moves the hero.

const DEG = Math.PI / 180;
export const FANS = {
  off: { el: [38, 50, 62, 72], az: 5, spread: 22, aim: 1.6 },
  normal: { el: [30, 40, 50, 60, 70, 78], az: 7, spread: 48, aim: 1.2 },
  high: { el: [26, 34, 42, 50, 58, 66, 74, 80], az: 11, spread: 75, aim: 0.9 },
};
const SHOULDER = 0.6;
const MIN_RISE = 5;

// Where a swing from this anchor would take the hero over the next `T` seconds, with the same
// physics as the real thing (gravity, drag, the SHAKE line) at a coarser step. Returns when it
// would first hit something (Infinity if clear), and where it ends up.
const PREDICT_T = 1.1, PREDICT_DT = 1 / 60;
export function predictSwing(world, p0, v0, a, g, k) {
  let px = p0.x, py = p0.y, pz = p0.z, vx = v0.x, vy = v0.y, vz = v0.z;
  let L = Math.hypot(px - a.x, py - a.y, pz - a.z);
  const dt = PREDICT_DT;
  for (let t = dt; t <= PREDICT_T + 1e-9; t += dt) {
    vy -= g * dt;
    const s = Math.hypot(vx, vy, vz), f = Math.min(1, k * s * dt);
    vx -= vx * f; vy -= vy * f; vz -= vz * f;
    const rx = px - a.x, ry = py - a.y, rz = pz - a.z;
    const d = Math.hypot(rx, ry, rz) || 1;
    const qx = rx + vx * dt, qy = ry + vy * dt, qz = rz + vz * dt;
    const q2 = qx * qx + qy * qy + qz * qz;
    if (q2 <= L * L) L = Math.max(Math.sqrt(q2), L - tune.slackTakeUp * dt);
    else {
      const nx = rx / d, ny = ry / d, nz = rz / d;
      const qn = qx * nx + qy * ny + qz * nz;
      const disc = qn * qn - q2 + L * L;
      const m = (disc < 0 ? -qn : -qn + Math.sqrt(disc)) / dt;
      vx += m * nx; vy += m * ny; vz += m * nz;
    }
    px += vx * dt; py += vy * dt; pz += vz * dt;
    if (py < 1.3 || world.pointInside(px, py, pz, -0.45)) return { hit: t, x: px, y: py, z: pz, vx, vy, vz };
  }
  return { hit: Infinity, x: px, y: py, z: pz, vx, vy, vz };
}

// hero: { p, v }. opts: { dirX, dirZ } the wanted heading (unit, horizontal); assist; g gravity.
export function findAnchor(world, hero, { dirX = 0, dirZ = 1, assist = 'normal', g = 19.62 } = {}) {
  const fan = FANS[assist] ?? FANS.normal;
  const p = hero.p, v = hero.v;
  const ox = p.x, oy = p.y + SHOULDER, oz = p.z;
  const sh = Math.hypot(v.x, v.z);
  const speed = Math.hypot(v.x, v.y, v.z);
  let px = dirX, pz = dirZ;
  if (sh > 4) {
    // Lean the fan toward the way we're already going, less so the more the player steers.
    const k = 0.5 / fan.aim;
    px += (v.x / sh) * k; pz += (v.z / sh) * k;
  }
  const pl = Math.hypot(px, pz) || 1;
  px /= pl; pz /= pl;
  const vhx = sh > 1 ? v.x / sh : px, vhz = sh > 1 ? v.z / sh : pz;
  const ideal = Math.max(30, Math.min(60, 30 + 0.5 * speed));
  const floor = world.groundHeight(p.x, p.y - 0.9, p.z);

  const cands = [];
  for (const elDeg of fan.el) {
    const el = elDeg * DEG, ce = Math.cos(el), se = Math.sin(el);
    for (let i = 0; i < fan.az; i++) {
      const a = fan.az === 1 ? 0 : (-fan.spread + (2 * fan.spread * i) / (fan.az - 1)) * DEG;
      const ca = Math.cos(a), sa = Math.sin(a);
      const hx = px * ca - pz * sa, hz = px * sa + pz * ca;
      const dx = hx * ce, dy = se, dz = hz * ce;
      const hit = world.raycast(ox, oy, oz, dx, dy, dz, tune.webMax, { ground: false });
      if (!hit || !hit.box) continue;
      const dist = hit.t;
      if (dist < tune.webMin || hit.y - p.y < MIN_RISE) continue;
      const rx = hit.x - p.x, rz = hit.z - p.z;
      const rl = Math.hypot(rx, rz) || 1;
      const dirScore = (rx * px + rz * pz) / rl;
      const velScore = (rx * vhx + rz * vhz) / rl;
      const distScore = 1 - Math.abs(dist - ideal) / 30;
      const clearance = hit.y - dist - (floor + 2);
      const clearScore = clearance >= 0 ? 0.3 : clearance * 0.15;
      const score = fan.aim * dirScore + 0.8 * distScore + clearScore + 0.4 * velScore;
      cands.push({ x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz, box: hit.box, dist, score });
    }
  }
  if (!cands.length) return null;
  // Fly the best few for a second with the real swing physics: an anchor whose arc slams into a
  // wall or the street (a facade anchor swings you into its own facade, like a tetherball round
  // its pole) loses to one whose arc stays clear and carries you the way you want to go.
  cands.sort((a, b) => b.score - a.score);
  const k = g / (tune.terminal * tune.terminal);
  const scale = Math.max(10, speed) * PREDICT_T;
  let best = null;
  for (const c of cands.slice(0, PREDICTED)) {
    const r = predictSwing(world, p, v, c, g, k);
    const survive = Math.min(r.hit, PREDICT_T) / PREDICT_T;
    const progress = ((r.x - p.x) * px + (r.z - p.z) * pz) / scale;
    // Where the swing leaves you heading, and how much speed it keeps.
    const eh = Math.hypot(r.vx, r.vz) || 1;
    const heading = (r.vx * px + r.vz * pz) / eh;
    const keep = Math.min(1.5, Math.hypot(r.vx, r.vy, r.vz) / Math.max(10, speed));
    c.predict = r;
    c.score += 2.2 * survive + 0.8 * progress + 1.4 * heading + 0.5 * keep;
    if (!best || c.score > best.score) best = c;
  }
  return best;
}
const PREDICTED = 10;

// Zip target: the first building surface along the camera ray (within zipRange of the hero), or
// failing that the best anchor within 15 degrees of it.
export function findZipPoint(world, hero, cam) {
  const hit = world.raycast(cam.x, cam.y, cam.z, cam.fx, cam.fy, cam.fz, tune.zipRange + 15, { ground: false });
  if (hit && hit.box) {
    const d = Math.hypot(hit.x - hero.p.x, hit.y - hero.p.y, hit.z - hero.p.z);
    if (d <= tune.zipRange && d > 2) return hit;
  }
  return null;
}
