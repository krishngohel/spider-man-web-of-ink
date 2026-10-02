import { applyDv } from './ledger.js';
import { tune } from './constants.js';

// The swing (spec 4.3 and 4.4): an Insomniac-style arc. The pivot sits ahead of and above the
// hero on his heading; the strand is drawn to a real building (`R`) near it. The motion is a
// pendulum about the pivot held in the vertical plane of the heading: sideways drift is damped,
// steering turns the plane (and the pivot with it), and a pump through the bottom of each arc
// pushes toward the cruise speed. Gravity and drag are applied by the caller; this module adds
// the line's pull ('rope') and the game-feel forces ('assist').

const DEG = Math.PI / 180;
const SHORTEN_RATE = 14;   // m/s the line can shorten to clear high ground
const MAX_PULL = 260;      // m/s^2, about 13 g: far above any normal swing's pull

export function createSwing() {
  const s = {
    active: false,
    P: { x: 0, y: 0, z: 0 },   // pivot
    R: { x: 0, y: 0, z: 0 },   // where the strand visibly sticks
    L: 0,                      // line length
    hx: 0, hz: 1,              // heading (unit, horizontal)
    t: 0,                      // seconds on this swing
    tension: 0,

    attach(a, hx, hz) {
      this.active = true;
      this.P.x = a.P.x; this.P.y = a.P.y; this.P.z = a.P.z;
      this.R.x = a.R.x; this.R.y = a.R.y; this.R.z = a.R.z;
      this.L = a.L;
      const l = Math.hypot(hx, hz) || 1;
      this.hx = hx / l; this.hz = hz / l;
      this.t = 0; this.tension = 0;
    },
    release() { this.active = false; this.tension = 0; },

    // Angle past the bottom of the arc, in degrees: negative behind the pivot, positive ahead.
    angle(p) {
      const fwd = (p.x - this.P.x) * this.hx + (p.z - this.P.z) * this.hz;
      return Math.atan2(fwd, this.P.y - p.y) / DEG;
    },

    // Turns the swing plane toward (dx, dz) by up to swingTurn * amount * dt, carrying the
    // velocity and the pivot round with it.
    steer(body, dx, dz, amount, dt) {
      const dl = Math.hypot(dx, dz);
      if (dl < 1e-4 || amount <= 0) return;
      const cur = Math.atan2(this.hx, this.hz), want = Math.atan2(dx / dl, dz / dl);
      let d = want - cur;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const max = tune.swingTurn * Math.min(1, amount) * dt;
      const turn = Math.max(-max, Math.min(max, d));
      if (Math.abs(turn) < 1e-7) return;
      const c = Math.cos(turn), sn = Math.sin(turn);
      // Rotation about +y by `turn`, with heading angle measured as atan2(x, z).
      const rot = (x, z) => [x * c + z * sn, -x * sn + z * c];
      [this.hx, this.hz] = rot(this.hx, this.hz);
      const p = body.p;
      const [px, pz] = rot(this.P.x - p.x, this.P.z - p.z);
      this.P.x = p.x + px; this.P.z = p.z + pz;
      const [vx, vz] = rot(body.v.x, body.v.z);
      applyDv(body, 'assist', vx - body.v.x, 0, vz - body.v.z);
    },

    // One step of everything but gravity and drag. Call before the position update.
    step(body, dt, floor) {
      this.t += dt;
      const p = body.p, v = body.v;
      // Hold the plane: sideways velocity (relative to the heading) dies away.
      const sx = -this.hz, sz = this.hx;
      const vs = v.x * sx + v.z * sz;
      const k = 1 - Math.exp(-tune.swingSideDamp * dt);
      applyDv(body, 'assist', -vs * k * sx, 0, -vs * k * sz);
      // Keep the bottom of the arc off the ground: the line shortens over high ground, but at a
      // limited rate (swinging over a roof once cut it 10 m in one step and the pull flung the hero
      // at 100 m/s).
      const want = this.P.y - floor - tune.groundClear;
      if (want < this.L) this.L = Math.max(4, want, this.L - SHORTEN_RATE * dt);
      // Pump through the bottom toward cruise speed.
      const rx = p.x - this.P.x, ry = p.y - this.P.y, rz = p.z - this.P.z;
      const d = Math.hypot(rx, ry, rz) || 1;
      const sp = Math.hypot(v.x, v.y, v.z);
      if (ry < 0 && -ry / d > Math.cos(tune.pumpCone * DEG) && sp > 0.5 && sp < tune.cruiseSpeed) {
        const a = tune.pumpAccel * (1 - sp / tune.cruiseSpeed) * dt;
        applyDv(body, 'assist', (v.x / sp) * a, (v.y / sp) * a, (v.z / sp) * a);
      }
      // The line (SHAKE, as in rope.js): taut, it pulls the next position back onto length L.
      const qx = rx + v.x * dt, qy = ry + v.y * dt, qz = rz + v.z * dt;
      const q2 = qx * qx + qy * qy + qz * qz;
      this.tension = 0;
      if (q2 <= this.L * this.L) {
        // Slack: haul it in.
        this.L = Math.max(Math.sqrt(q2), this.L - tune.slackTakeUp * dt, 4);
        return;
      }
      const nx = rx / d, ny = ry / d, nz = rz / d;
      const qn = qx * nx + qy * ny + qz * nz;
      const disc = qn * qn - q2 + this.L * this.L;
      // The pull is capped at a believable acceleration, so no single step can fling the hero.
      const m = Math.max(-MAX_PULL * dt, (disc < 0 ? -qn : -qn + Math.sqrt(disc)) / dt);
      if (m < 0) {
        applyDv(body, 'rope', m * nx, m * ny, m * nz);
        this.tension = (-m * body.mass) / dt;
      }
    },
  };
  return s;
}

// Release boost along the current velocity (and a little up). `perfect` is a hand release inside
// the sweet window.
export function releaseBoost(body, perfect) {
  const v = body.v;
  const sh = Math.hypot(v.x, v.z) || 1;
  const b = perfect ? tune.perfectBoost : tune.releaseBoost;
  // Mostly forward: a boost along a rising velocity would ratchet the hero ever higher.
  applyDv(body, 'assist', (v.x / sh) * b, b * 0.2, (v.z / sh) * b);
}

// Swing-jump: a big push forward along the heading and up.
export function swingJump(body, hx, hz) {
  applyDv(body, 'assist', hx * tune.swingJumpFwd, Math.max(0, tune.swingJumpUp - Math.max(0, body.v.y) * 0.5), hz * tune.swingJumpFwd);
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
