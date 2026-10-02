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

// hero: { p, v }. opts: { dirX, dirZ } the wanted heading (unit, horizontal); assist.
export function findAnchor(world, hero, { dirX = 0, dirZ = 1, assist = 'normal' } = {}) {
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
  const ideal = Math.max(20, Math.min(45, 20 + 0.4 * speed));
  const floor = world.groundHeight(p.x, p.y - 0.9, p.z);

  let best = null;
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
      if (!best || score > best.score) {
        best = { x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz, box: hit.box, dist, score };
      }
    }
  }
  return best;
}

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
