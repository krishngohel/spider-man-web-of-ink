import { applyDv } from './ledger.js';
import { rayBox } from './world.js';
import { tune } from './constants.js';

// A web line: an inextensible rope from the hero to a pivot. It can only pull (toward the
// pivot), never push. A winch reels it in, limited by tension. The line wraps around building
// edges it swings past and unwraps on the way back. Anchors can be moving bodies; then the pull
// is shared by mass.
//
// Each physics step: forces first, then rope.preStep (velocity), then the position update, then
// rope.postStep (position projection, wrapping).

const MAX_PIVOTS = 5;

export function createRope() {
  const rope = {
    active: false,
    pivots: [],          // pivots[0] is the anchor; the hero hangs from the last one
    anchorBody: null,    // a moving anchor (body with p, v, mass)
    anchorOffset: { x: 0, y: 0, z: 0 },
    length: 0,           // free length from the last pivot to the hero
    tension: 0,          // newtons, last step
    reelRate: 0,
    reelLimit: 0,
    stalled: false,
    minLength: 1,

    attach(anchor, body) {
      this.active = true;
      this.anchorBody = anchor.body ?? null;
      if (this.anchorBody) {
        this.anchorOffset.x = anchor.x - this.anchorBody.p.x;
        this.anchorOffset.y = anchor.y - this.anchorBody.p.y;
        this.anchorOffset.z = anchor.z - this.anchorBody.p.z;
      }
      this.pivots = [{ x: anchor.x, y: anchor.y, z: anchor.z, ax: 0, ay: 0, az: 0, seg: 0 }];
      this.length = Math.hypot(body.p.x - anchor.x, body.p.y - anchor.y, body.p.z - anchor.z);
      this.tension = 0; this.reelRate = 0; this.stalled = false;
    },
    release() {
      this.active = false;
      this.pivots = [];
      this.anchorBody = null;
      this.tension = 0; this.reelRate = 0;
    },
    setReel(rate, limit) { this.reelRate = Math.max(0, rate); this.reelLimit = limit; },
    get pivot() { return this.pivots[this.pivots.length - 1]; },
    get totalLength() { let s = this.length; for (const p of this.pivots) s += p.seg; return s; },

    preStep(body, dt) {
      if (!this.active) return;
      this.tension = 0; this.stalled = false;
      if (this.anchorBody && this.pivots.length === 1) {
        const a = this.anchorBody.p, q = this.pivots[0];
        q.x = a.x + this.anchorOffset.x; q.y = a.y + this.anchorOffset.y; q.z = a.z + this.anchorOffset.z;
      }
      const c = this.pivot, p = body.p, v = body.v;
      const rx = p.x - c.x, ry = p.y - c.y, rz = p.z - c.z;
      const d = Math.hypot(rx, ry, rz);
      if (d < 1e-6) return;
      const nx = rx / d, ny = ry / d, nz = rz / d;
      const reeling = this.reelRate > 0;
      const newLen = reeling ? Math.max(this.minLength, this.length - this.reelRate * dt) : this.length;
      const moving = this.anchorBody && this.pivots.length === 1 ? this.anchorBody : null;
      if (moving) { this.movingStep(body, moving, nx, ny, nz, d, newLen, dt); return; }

      // SHAKE: where the body would be after this step, and the pull along the line (at the old
      // position) that puts it back on the line's length. Pairs with the symplectic Euler step,
      // so a long swing neither gains nor bleeds energy.
      const qx = rx + v.x * dt, qy = ry + v.y * dt, qz = rz + v.z * dt;
      const q2 = qx * qx + qy * qy + qz * qz;
      if (q2 <= newLen * newLen) {
        // Slack: the line applies nothing. The hero hauls the slack in (no load, so no force to
        // speak of), so a web shot at something ahead goes taut in a moment instead of hanging
        // loose while he falls.
        this.length = Math.max(Math.sqrt(q2), newLen - tune.slackTakeUp * dt, this.minLength);
        return;
      }
      let s = pull(qx, qy, qz, q2, nx, ny, nz, newLen) / dt;
      if (reeling && (-s * body.mass) / dt > this.reelLimit) {
        // The winch pulls with at most reelLimit. If holding the line already takes more than
        // that, it stalls and the brake holds; otherwise it pulls at its limit and the line ends
        // up as long as the body actually is.
        const hold = q2 <= this.length * this.length ? 0 : pull(qx, qy, qz, q2, nx, ny, nz, this.length) / dt;
        const cap = -(this.reelLimit * dt) / body.mass;
        if (hold <= cap) { s = hold; this.stalled = true; } else s = cap;
        const ex = qx + s * dt * nx, ey = qy + s * dt * ny, ez = qz + s * dt * nz;
        this.length = Math.min(this.length, Math.max(newLen, Math.hypot(ex, ey, ez)));
      } else this.length = newLen;
      this.tension = (-s * body.mass) / dt;
      if (s < 0) applyDv(body, 'rope', s * nx, s * ny, s * nz);
    },

    // A moving anchor (an enemy, a glider, a car): velocity-level, the change shared by mass.
    movingStep(body, moving, nx, ny, nz, d, newLen, dt) {
      const v = body.v, va = moving.v;
      const vr = (v.x - va.x) * nx + (v.y - va.y) * ny + (v.z - va.z) * nz;
      const M = moving.mass, mEff = (body.mass * M) / (body.mass + M);
      const allowed = (newLen - d) / dt;
      if (vr <= allowed) { this.length = newLen; return; }
      let dRel = allowed - vr;
      if (this.reelRate > 0 && (-dRel * mEff) / dt > this.reelLimit) {
        this.stalled = true;
        dRel = Math.min(0, (this.length - d) / dt - vr);
      } else this.length = newLen;
      this.tension = (-dRel * mEff) / dt;
      const hero = dRel * (M / (body.mass + M));
      const other = -dRel * (body.mass / (body.mass + M));
      applyDv(body, 'rope', hero * nx, hero * ny, hero * nz);
      applyDv(moving, 'rope', other * nx, other * ny, other * nz);
    },

    postStep(body, world) {
      if (!this.active) return;
      const p = body.p;
      // Hard clamp past the line's give.
      {
        const c = this.pivot;
        const rx = p.x - c.x, ry = p.y - c.y, rz = p.z - c.z;
        const d = Math.hypot(rx, ry, rz), maxD = this.length * (1 + tune.ropeGive);
        if (d > maxD && d > 1e-6) { const k = maxD / d; p.x = c.x + rx * k; p.y = c.y + ry * k; p.z = c.z + rz * k; }
      }
      if (!world || this.anchorBody) return;
      // Unwrap: the bend at the last pivot has straightened past flat.
      while (this.pivots.length > 1) {
        const w = this.pivots[this.pivots.length - 1], c = this.pivots[this.pivots.length - 2];
        const ax = w.x - c.x, ay = w.y - c.y, az = w.z - c.z;
        const bx = p.x - w.x, by = p.y - w.y, bz = p.z - w.z;
        const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
        if (cx * w.ax + cy * w.ay + cz * w.az >= 0) break;
        this.pivots.pop();
        this.length += w.seg;
      }
      if (this.pivots.length >= MAX_PIVOTS) return;
      const c = this.pivot;
      const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1) return;
      const ux = dx / d, uy = dy / d, uz = dz / d;
      const hit = world.raycast(c.x + ux * 0.2, c.y + uy * 0.2, c.z + uz * 0.2, ux, uy, uz, d - 0.9, { ground: false, kinds: ['building'] });
      if (!hit) return;
      const w = wrapPoint(hit.box, c, ux, uy, uz);
      if (!w) return;
      const seg = Math.hypot(w.x - c.x, w.y - c.y, w.z - c.z);
      if (seg < 0.5 || seg >= this.length - 1) return;
      const ax = w.x - c.x, ay = w.y - c.y, az = w.z - c.z;
      const bx = p.x - w.x, by = p.y - w.y, bz = p.z - w.z;
      let cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      const cl = Math.hypot(cx, cy, cz);
      if (cl < 1e-6) return;
      cx /= cl; cy /= cl; cz /= cl;
      this.length -= seg;
      this.pivots.push({ x: w.x, y: w.y, z: w.z, ax: cx, ay: cy, az: cz, seg });
    },
  };
  return rope;
}

// Distance to move along -n (as a negative number) so that q + t n has length L. Falls back to
// removing all of q's outward part when no such t exists.
function pull(qx, qy, qz, q2, nx, ny, nz, L) {
  const qn = qx * nx + qy * ny + qz * nz;
  const disc = qn * qn - q2 + L * L;
  return disc < 0 ? -qn : -qn + Math.sqrt(disc);
}

// Where a line from c along u bends around box b: a vertical edge when it cuts a corner, the
// roof edge when it passes over the top. Pushed 5 cm clear of the box.
export function wrapPoint(b, c, ux, uy, uz) {
  const r = rayBox(b, c.x, c.y, c.z, ux, uy, uz);
  if (!r) return null;
  const E = 0.05;
  const enter = { x: c.x + ux * r.tEnter, y: c.y + uy * r.tEnter, z: c.z + uz * r.tEnter };
  const exit = { x: c.x + ux * r.tExit, y: c.y + uy * r.tExit, z: c.z + uz * r.tExit };
  if (r.inAxis === 1 || r.outAxis === 1) {
    // Over the roof: bend at the roof edge on the side face the line uses.
    const side = r.inAxis === 1 ? { pt: exit, axis: r.outAxis, sign: r.outSign } : { pt: enter, axis: r.inAxis, sign: r.inSign };
    if (side.axis === 1) return null;
    return {
      x: side.pt.x + (side.axis === 0 ? side.sign * E : 0),
      y: b.maxY + E,
      z: side.pt.z + (side.axis === 2 ? side.sign * E : 0),
    };
  }
  if (r.inAxis === r.outAxis) return null; // straight through two opposite walls: no single edge
  // Corner: the x face and the z face the line crosses meet at a vertical edge.
  const xAxisFace = r.inAxis === 0 ? { sign: r.inSign } : { sign: r.outSign };
  const zAxisFace = r.inAxis === 2 ? { sign: r.inSign } : { sign: r.outSign };
  const x = xAxisFace.sign > 0 ? b.maxX + E : b.minX - E;
  const z = zAxisFace.sign > 0 ? b.maxZ + E : b.minZ - E;
  const y = Math.max(b.minY + E, Math.min(b.maxY - E, (enter.y + exit.y) / 2));
  return { x, y, z };
}
