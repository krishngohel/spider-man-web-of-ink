import { tune } from './constants.js';

// Where a web would stick. No sky hooks: the web is shot along a fan of real directions and sticks
// to whatever building it hits first. The fan centres on where the player wants to go (stick or
// camera, leaning on the current velocity) and scores each hit. The assist setting only changes how
// wide and dense the fan is and how much the player's aim matters; it never moves the hero.

const DEG = Math.PI / 180;
export const FANS = {
  off: { el: [38, 50, 62, 72], az: 5, spread: 22, aim: 1.6 },
  // Shallow rays too (12 to 24 degrees): over low-rise blocks a 30 degree ray clears the roofs.
  normal: { el: [12, 18, 24, 30, 40, 50, 60, 70, 78], az: 7, spread: 48, aim: 1.2 },
  high: { el: [12, 18, 26, 34, 42, 50, 58, 66, 74, 80], az: 11, spread: 75, aim: 0.9 },
};
const SHOULDER = 0.6;
const FAN_RAY = { ground: false };
const MIN_RISE = 3; // low-rise blocks: an anchor 3 m up still makes a swing (with the line shortened over the street)

// Where a swing from this anchor would take the hero over the next `T` seconds, with the same
// physics as the real thing (gravity, drag, the SHAKE line) at a coarser step. Returns when it
// would first hit something (Infinity if clear), and where it ends up.
// Scoring weights (tuned with scripts/swing-tune.mjs against the swing-sim battery).
export const SCORE = {
  velLean: 0.46, idealBase: 35.1, idealPerSpeed: 0.2, idealMax: 49.8,
  dist: 1.6, clear: 0.59, vel: 1.15,
  survive: 3.49, progress: 0, heading: 2.06, keep: 0,
  predicted: 10, horizon: 1.8,
  // Webs take turns either side of the street (left hand, right hand), as in Insomniac's games.
  alternate: 0.3,
};
const PREDICT_DT = 1 / 45;
export function predictSwing(world, p0, v0, a, g, k) {
  let px = p0.x, py = p0.y, pz = p0.z, vx = v0.x, vy = v0.y, vz = v0.z;
  let L = Math.hypot(px - a.x, py - a.y, pz - a.z);
  const dt = PREDICT_DT;
  for (let t = dt; t <= SCORE.horizon + 1e-9; t += dt) {
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
// prevSide: which side of the heading the last web went (+1 / -1, 0 none): the other side scores higher.
export function findAnchor(world, hero, { dirX = 0, dirZ = 1, assist = 'normal', g = 19.62, prevSide = 0 } = {}) {
  const fan = FANS[assist] ?? FANS.normal;
  const p = hero.p, v = hero.v;
  const ox = p.x, oy = p.y + SHOULDER, oz = p.z;
  const sh = Math.hypot(v.x, v.z);
  const speed = Math.hypot(v.x, v.y, v.z);
  let px = dirX, pz = dirZ;
  if (sh > 4) {
    // Lean the fan toward the way we're already going, less so the more the player steers.
    const k = SCORE.velLean / fan.aim;
    px += (v.x / sh) * k; pz += (v.z / sh) * k;
  }
  const pl = Math.hypot(px, pz) || 1;
  px /= pl; pz /= pl;
  const vhx = sh > 1 ? v.x / sh : px, vhz = sh > 1 ? v.z / sh : pz;
  const ideal = Math.max(SCORE.idealBase, Math.min(SCORE.idealMax, SCORE.idealBase + SCORE.idealPerSpeed * speed));
  const floor = world.groundHeight(p.x, p.y - 0.9, p.z);

  const cands = [];
  for (const elDeg of fan.el) {
    const el = elDeg * DEG, ce = Math.cos(el), se = Math.sin(el);
    for (let i = 0; i < fan.az; i++) {
      const a = fan.az === 1 ? 0 : (-fan.spread + (2 * fan.spread * i) / (fan.az - 1)) * DEG;
      const ca = Math.cos(a), sa = Math.sin(a);
      const hx = px * ca - pz * sa, hz = px * sa + pz * ca;
      const dx = hx * ce, dy = se, dz = hz * ce;
      const hit = world.raycast(ox, oy, oz, dx, dy, dz, tune.webMax, FAN_RAY);
      if (!hit || !hit.box) continue;
      const dist = hit.t;
      if (dist < tune.webMin || hit.y - p.y < MIN_RISE) continue;
      const rx = hit.x - p.x, rz = hit.z - p.z;
      const rl = Math.hypot(rx, rz) || 1;
      const dirScore = (rx * px + rz * pz) / rl;
      const velScore = (rx * vhx + rz * vhz) / rl;
      const distScore = 1 - Math.abs(dist - ideal) / 30;
      const clearance = hit.y - dist - (floor + 2);
      const clearScore = clearance >= 0 ? SCORE.clear : clearance * 0.15;
      const side = Math.sign(px * rz - pz * rx);
      const score = fan.aim * dirScore + SCORE.dist * distScore + clearScore + SCORE.vel * velScore + (prevSide && side === -prevSide ? SCORE.alternate : 0);
      cands.push({ x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz, box: hit.box, dist, score, side });
    }
  }
  if (!cands.length) return null;
  // Fly the best few for a second with the real swing physics: an anchor whose arc slams into a
  // wall or the street (a facade anchor swings you into its own facade, like a tetherball round
  // its pole) loses to one whose arc stays clear and carries you the way you want to go.
  cands.sort((a, b) => b.score - a.score);
  const k = g / (tune.terminal * tune.terminal);
  const T = SCORE.horizon;
  const scale = Math.max(10, speed) * T;
  let best = null;
  for (const c of cands.slice(0, SCORE.predicted)) {
    const r = predictSwing(world, p, v, c, g, k);
    const survive = Math.min(r.hit, T) / T;
    const progress = ((r.x - p.x) * px + (r.z - p.z) * pz) / scale;
    // Where the swing leaves you heading, and how much speed it keeps.
    const eh = Math.hypot(r.vx, r.vz) || 1;
    const heading = (r.vx * px + r.vz * pz) / eh;
    const keep = Math.min(1.5, Math.hypot(r.vx, r.vy, r.vz) / Math.max(10, speed));
    c.predict = r;
    c.score += SCORE.survive * survive + SCORE.progress * progress + SCORE.heading * heading + SCORE.keep * keep;
    if (!best || c.score > best.score) best = c;
  }
  return best;
}

// Zip target: the first building surface along the camera ray, within zipRange of the hero. If
// that misses (or lands on an underside, which you can't perch on yet), the rays of a 15 degree
// cone around it are tried and the one nearest the centre wins.
const ZIP_RAY = { ground: false };
function zipHit(world, hero, cam, fx, fy, fz) {
  const hit = world.raycast(cam.x, cam.y, cam.z, fx, fy, fz, tune.zipRange + 15, ZIP_RAY);
  if (!hit || !hit.box || hit.ny < -0.5) return null;
  const d = Math.hypot(hit.x - hero.p.x, hit.y - hero.p.y, hit.z - hero.p.z);
  return d <= tune.zipRange && d > 2 ? hit : null;
}
export function findZipPoint(world, hero, cam) {
  const direct = zipHit(world, hero, cam, cam.fx, cam.fy, cam.fz);
  if (direct) return direct;
  // An orthonormal frame around the aim.
  const f = [cam.fx, cam.fy, cam.fz];
  const up = Math.abs(f[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  let rx = up[1] * f[2] - up[2] * f[1], ry = up[2] * f[0] - up[0] * f[2], rz = up[0] * f[1] - up[1] * f[0];
  const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
  const ux = f[1] * rz - f[2] * ry, uy = f[2] * rx - f[0] * rz, uz = f[0] * ry - f[1] * rx;
  for (const deg of [7.5, 15]) {
    const t = Math.tan(deg * DEG);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      let dx = f[0] + (rx * Math.cos(a) + ux * Math.sin(a)) * t;
      let dy = f[1] + (ry * Math.cos(a) + uy * Math.sin(a)) * t;
      let dz = f[2] + (rz * Math.cos(a) + uz * Math.sin(a)) * t;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const hit = zipHit(world, hero, cam, dx, dy, dz);
      if (hit) return hit;
    }
  }
  return null;
}

// Aimed web (spec 4.3): the web goes exactly where the crosshair points. The camera ray must hit a
// building, tree or prop (not the street) within web range of the hero, in front of him. When the
// crosshair is on nothing, it looks a little wider (a ring at 1.2 then 5 degrees), then upward (up
// to 22 degrees above the crosshair, the lowest hit first), so a level aim still catches the
// building ahead and above without craning the camera up (overhaul C1). The HUD preview uses this
// same search, so it always shows where the web will really go.
const AIM_RAY = { ground: false };
const AIM_RINGS = [1.2, 5];
const AIM_UP = [5, 10, 15, 22];
function aimHit(world, hero, cam, fx, fy, fz) {
  const toHero = Math.hypot(cam.x - hero.p.x, cam.y - hero.p.y, cam.z - hero.p.z);
  const hit = world.raycast(cam.x, cam.y, cam.z, fx, fy, fz, tune.webMax + toHero + 2, AIM_RAY);
  if (!hit || !hit.box) return null;
  // Never something between the camera and the hero.
  if ((hit.x - hero.p.x) * fx + (hit.y - hero.p.y) * fy + (hit.z - hero.p.z) * fz < 0) return null;
  const d = Math.hypot(hit.x - hero.p.x, hit.y - (hero.p.y + 0.6), hit.z - hero.p.z);
  if (d > tune.webMax || d < 3) return null;
  hit.dist = d;
  return hit;
}
// wide: false keeps the old tight 1.2 degree forgiveness only (the hang web, whose key is also the
// yank: a missed yank must not haul the hero onto a roof).
export function findAimPoint(world, hero, cam, { wide = true } = {}) {
  const direct = aimHit(world, hero, cam, cam.fx, cam.fy, cam.fz);
  if (direct) return direct;
  const f = [cam.fx, cam.fy, cam.fz];
  const up = Math.abs(f[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  let rx = up[1] * f[2] - up[2] * f[1], ry = up[2] * f[0] - up[0] * f[2], rz = up[0] * f[1] - up[1] * f[0];
  const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
  const ux = f[1] * rz - f[2] * ry, uy = f[2] * rx - f[0] * rz, uz = f[0] * ry - f[1] * rx;
  const along = (dx, dy, dz) => { const l = Math.hypot(dx, dy, dz); return aimHit(world, hero, cam, dx / l, dy / l, dz / l); };
  for (const deg of wide ? AIM_RINGS : [AIM_RINGS[0]]) {
    const t = Math.tan(deg * DEG);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const hit = along(f[0] + (rx * Math.cos(a) + ux * Math.sin(a)) * t, f[1] + (ry * Math.cos(a) + uy * Math.sin(a)) * t, f[2] + (rz * Math.cos(a) + uz * Math.sin(a)) * t);
      if (hit) return hit;
    }
  }
  if (!wide) return null;
  // Upward, along the camera's own up (ux, uy, uz points up the screen).
  const upSign = uy >= 0 ? 1 : -1;
  for (const deg of AIM_UP) {
    const t = Math.tan(deg * DEG) * upSign;
    const hit = along(f[0] + ux * t, f[1] + uy * t, f[2] + uz * t);
    if (hit) return hit;
  }
  return null;
}
