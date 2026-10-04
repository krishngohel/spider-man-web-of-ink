import { applyDv } from './ledger.js';
import { tune } from './constants.js';
import { createRope } from './rope.js';

// The swing (spec 4.3 and 4.4, Amazing Spider-Man style): the web sticks exactly where the player
// aimed, and the hero swings on a real rope (rope.js: SHAKE line, wrapping round corners) about
// that point, so the arc goes where the web pulls. On top of the physics, two light assists keep
// it playable: a gentle pump through the bottom of each arc toward the cruise speed, and the line
// shortening (at a limited rate) so the bottom of an arc clears the street. Gravity and drag are
// applied by the caller.

const DEG = Math.PI / 180;
const SHORTEN_RATE = 14;   // m/s the line can shorten to clear the ground
const MAX_PULL = 260;      // m/s^2, about 13 g: no single step can fling the hero

export function createSwing() {
  const rope = createRope();
  const s = {
    rope,
    t: 0,
    get active() { return rope.active; },
    // Where the hero hangs from (the last wrap pivot) and where the web is stuck (the anchor).
    get P() { return rope.pivot; },
    get R() { return rope.pivots[0]; },
    get L() { return rope.length; },
    get tension() { return rope.tension; },

    attach(hit, body) {
      rope.attach(hit, body, 2);
      this.t = 0;
    },
    release() { rope.release(); },

    // Degrees past the bottom of the arc along the direction of travel: negative on the way down,
    // positive on the way up.
    angle(p, v) {
      const P = rope.pivot;
      if (!P) return 0;
      const sh = Math.hypot(v.x, v.z) || 1;
      const fwd = ((p.x - P.x) * v.x + (p.z - P.z) * v.z) / sh;
      return Math.atan2(fwd, P.y - p.y) / DEG;
    },

    // One step before the position update.
    preStep(body, dt, floor) {
      this.t += dt;
      const P = rope.pivot, p = body.p, v = body.v;
      // Clear the street: shorten the line, never faster than SHORTEN_RATE.
      const want = P.y - floor - tune.groundClear;
      if (want < rope.length) rope.length = Math.max(rope.minLength, want, rope.length - SHORTEN_RATE * dt);
      // Pump through the bottom toward cruise speed.
      const rx = p.x - P.x, ry = p.y - P.y, rz = p.z - P.z;
      const d = Math.hypot(rx, ry, rz) || 1;
      const sp = Math.hypot(v.x, v.y, v.z);
      if (ry < 0 && -ry / d > Math.cos(tune.pumpCone * DEG) && sp > 0.5 && sp < tune.cruiseSpeed) {
        const a = tune.pumpAccel * (1 - sp / tune.cruiseSpeed) * dt;
        applyDv(body, 'assist', (v.x / sp) * a, (v.y / sp) * a, (v.z / sp) * a);
      }
      const v0x = v.x, v0y = v.y, v0z = v.z;
      rope.preStep(body, dt);
      // Cap the line's pull this step (a sudden shorten must not fling the hero).
      const dvx = v.x - v0x, dvy = v.y - v0y, dvz = v.z - v0z;
      const dv = Math.hypot(dvx, dvy, dvz), cap = MAX_PULL * dt;
      if (dv > cap) {
        const k = cap / dv - 1;
        applyDv(body, 'rope', dvx * k, dvy * k, dvz * k);
      }
    },
    postStep(body, world) { rope.postStep(body, world); },
  };
  return s;
}

// Release boost along the horizontal velocity (and a little up). `perfect` is a release on the
// rise just past the bottom of the arc.
export function releaseBoost(body, perfect) {
  const v = body.v;
  const sh = Math.hypot(v.x, v.z) || 1;
  const b = perfect ? Math.max(tune.perfectBoost, sh * tune.perfectMul) : tune.releaseBoost;
  applyDv(body, 'assist', (v.x / sh) * b, perfect ? tune.perfectUp : b * 0.2, (v.z / sh) * b);
}

// Swing-jump: a push forward along the travel direction and up.
export function swingJump(body) {
  const v = body.v;
  const sh = Math.hypot(v.x, v.z) || 1;
  applyDv(body, 'assist', (v.x / sh) * tune.swingJumpFwd, Math.max(0, tune.swingJumpUp - Math.max(0, v.y) * 0.5), (v.z / sh) * tune.swingJumpFwd);
}

// Air control: the horizontal velocity turns toward (dx, dz) without changing its size, and a
// slow hero is nudged that way.
export function airControl(body, dx, dz, amount, dt) {
  const dl = Math.hypot(dx, dz);
  if (dl < 1e-4 || amount <= 0) return;
  dx /= dl; dz /= dl;
  const v = body.v;
  const sh = Math.hypot(v.x, v.z);
  if (sh > 1) {
    const cur = Math.atan2(v.x, v.z), want = Math.atan2(dx, dz);
    let d = want - cur;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const max = tune.airTurn * Math.min(1, amount) * dt;
    const turn = Math.max(-max, Math.min(max, d));
    const c = Math.cos(turn), sn = Math.sin(turn);
    const nx = v.x * c + v.z * sn, nz = -v.x * sn + v.z * c;
    applyDv(body, 'assist', nx - v.x, 0, nz - v.z);
  }
  if (sh < 8) {
    const a = tune.airAccel * Math.min(1, amount) * dt;
    applyDv(body, 'assist', dx * a, 0, dz * a);
  }
}
