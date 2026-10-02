// Stealth (spec 8.2): enemies on patrol who have not seen you yet. Each one has a vision cone and
// ears; seeing you fills a suspicion meter (faster up close and on the ground, slowly when you are
// perched high or hanging above), and a full meter is an alarm: the whole group comes for you and
// calls in more. Takedowns on someone who has not seen you are silent: from behind on the ground,
// dropping from a perch above, or hauling them up from a web hang. Anyone who sees a takedown
// grows suspicious.
//
// Pure functions over plain objects (unit tested); enemies.js calls stealthStep for every enemy
// with e.stealth set and e.alerted false.

export const STEALTH = {
  range: 24,          // metres they can see on open ground
  fov: 1.15,          // half angle of the cone (radians, about 66 degrees)
  close: 3.2,         // always noticed this close, whatever the angle
  hear: 7,            // a hard landing or a fight this close is heard
  rise: 1.1,          // suspicion per second at point blank (falls off with distance)
  fall: 0.3,          // per second while nothing is seen
  perchY: 5,          // this far above them counts as perched (seen at half range, slower)
  walk: 1.7,          // patrol speed
  pause: 2.2,         // seconds at each patrol point
  backReach: 2.4,     // a ground takedown reaches this far, from behind
  perchReach: 9,      // a perch takedown: within this many metres across, from above
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Can this enemy see the hero right now? (Distance, cone, height, line of sight.)
export function sees(e, heroP, losFn) {
  const p = e.body.p;
  const dx = heroP.x - p.x, dz = heroP.z - p.z, dy = heroP.y - p.y, d = Math.hypot(dx, dz);
  const above = dy > STEALTH.perchY;
  const range = above ? STEALTH.range * 0.5 : STEALTH.range;
  if (d > range) return false;
  if (d > STEALTH.close) {
    const ang = Math.abs(wrap(Math.atan2(dx, dz) - e.facing));
    if (ang > STEALTH.fov) return false;
    // Looking up is not something patrols do much: steep angles are outside the cone.
    if (dy > 0 && Math.atan2(dy, d) > 0.75) return false;
  }
  return losFn ? losFn(p, heroP) : true;
}

// How fast the meter fills while seen: up close and level is quick, far or above is slow.
export function riseRate(e, heroP, heroState) {
  const p = e.body.p;
  const d = Math.hypot(heroP.x - p.x, heroP.z - p.z);
  let k = STEALTH.rise * Math.max(0.2, 1 - d / STEALTH.range);
  if (heroP.y - p.y > STEALTH.perchY) k *= 0.45;
  if (heroState === 'hang' || heroState === 'wall') k *= 0.6;
  if (heroState === 'swing' || heroState === 'zip') k *= 1.5; // movement catches the eye
  return k;
}

// One step of a patrolling enemy's senses. Returns 'alarm' when the meter fills.
export function perceive(e, hero, dt, losFn, noise = null) {
  e.suspicion ??= 0;
  const hp = hero.body.p;
  if (sees(e, hp, losFn)) {
    e.suspicion = Math.min(1, e.suspicion + riseRate(e, hp, hero.state) * dt);
    e.lastSeen = { x: hp.x, y: hp.y, z: hp.z };
  } else e.suspicion = Math.max(0, e.suspicion - STEALTH.fall * dt);
  if (noise && Math.hypot(noise.x - e.body.p.x, noise.z - e.body.p.z) < STEALTH.hear) {
    e.suspicion = Math.min(1, e.suspicion + 0.5);
    e.lastSeen = { ...noise };
  }
  return e.suspicion >= 1 ? 'alarm' : null;
}

// Which silent takedown this enemy is open to, if any: 'ground' (close, behind, level),
// 'perch' (the hero is above and near, the enemy has not looked up) or 'hang' (the hero hangs on a
// web right above). Null when none.
export function takedownKind(e, hero) {
  if (!e.stealth || e.alerted || !e.alive || e.state === 'out' || e.state === 'webbed') return null;
  const p = e.body.p, hp = hero.body.p;
  const dx = hp.x - p.x, dz = hp.z - p.z, dy = hp.y - p.y, d = Math.hypot(dx, dz);
  if (hero.state === 'hang' && dy > 1.5 && dy < 9 && d < 2.6) return 'hang';
  if ((hero.state === 'wall' || hero.state === 'ground' || hero.state === 'hang' || hero.state === 'air') && dy > 2.5 && dy < 18 && d < STEALTH.perchReach) return 'perch';
  if (hero.state === 'ground' && Math.abs(dy) < 1.2 && d < STEALTH.backReach) {
    const behind = Math.abs(wrap(Math.atan2(dx, dz) - e.facing)) > 1.6;
    if (behind || e.suspicion < 0.3) return 'ground';
  }
  return null;
}

// Patrol movement: walk the route, pause at each point, turn toward a suspicious spot.
export function patrolWant(e, dt) {
  const p = e.body.p;
  if (e.suspicion > 0.35 && e.lastSeen) {
    // Something there: stop and look.
    return { vx: 0, vz: 0, face: Math.atan2(e.lastSeen.x - p.x, e.lastSeen.z - p.z), anim: 'Idle_Loop' };
  }
  const route = e.patrol;
  if (!route?.length) return { vx: 0, vz: 0, face: null, anim: 'Idle_Loop' };
  e.pi ??= 0; e.pauseT ??= 0;
  const w = route[e.pi % route.length];
  const dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz);
  if (d < 0.8) {
    e.pauseT += dt;
    if (e.pauseT > STEALTH.pause) { e.pauseT = 0; e.pi = (e.pi + 1) % route.length; }
    return { vx: 0, vz: 0, face: w.look ?? null, anim: 'Idle_Loop' };
  }
  return { vx: (dx / d) * STEALTH.walk, vz: (dz / d) * STEALTH.walk, face: Math.atan2(dx, dz), anim: 'Walk_Loop' };
}

// A loop around a point (a simple default route for a guard).
export function loopRoute(x, z, r, n = 4, phase = 0) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = phase + (i / n) * Math.PI * 2; out.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r }); }
  return out;
}
