import { applyDv } from './ledger.js';

// Static collision: axis-aligned boxes (buildings, tree trunks and crowns, props) in a 2D spatial
// hash over x/z, plus the ground plane y = 0. Detail geometry is visual only.

const CELL = 20;
const OFF = 4096;
const key = (ix, iz) => (ix + OFF) * 8192 + (iz + OFF);

// Slab test, without allocating: fills `out` (a module scratch unless one is passed) with the
// entry/exit distances and the entry/exit face axes (0 x, 1 y, 2 z) and signs. Returns null when
// the ray's line misses the box.
const SCRATCH = { tEnter: 0, tExit: 0, inAxis: -1, inSign: 0, outAxis: -1, outSign: 0 };
export function rayBox(b, ox, oy, oz, dx, dy, dz, out = SCRATCH) {
  let tmin = -Infinity, tmax = Infinity, ain = -1, sin = 0, aout = -1, sout = 0;
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? ox : a === 1 ? oy : oz;
    const d = a === 0 ? dx : a === 1 ? dy : dz;
    const mn = a === 0 ? b.minX : a === 1 ? b.minY : b.minZ;
    const mx = a === 0 ? b.maxX : a === 1 ? b.maxY : b.maxZ;
    if (Math.abs(d) < 1e-12) {
      if (o < mn || o > mx) return null;
      continue;
    }
    let t1 = (mn - o) / d, t2 = (mx - o) / d, s1 = -1, s2 = 1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s1 = 1; s2 = -1; }
    if (t1 > tmin) { tmin = t1; ain = a; sin = s1; }
    if (t2 < tmax) { tmax = t2; aout = a; sout = s2; }
    if (tmin > tmax) return null;
  }
  out.tEnter = tmin; out.tExit = tmax; out.inAxis = ain; out.inSign = sin; out.outAxis = aout; out.outSign = sout;
  return out;
}

export function createWorld() {
  const boxes = [];
  const cells = new Map();
  let stamp = 0;

  function addBox({ min, max, kind = 'building', data = null }) {
    const b = {
      id: boxes.length, kind, data,
      minX: Math.min(min[0], max[0]), minY: Math.min(min[1], max[1]), minZ: Math.min(min[2], max[2]),
      maxX: Math.max(min[0], max[0]), maxY: Math.max(min[1], max[1]), maxZ: Math.max(min[2], max[2]),
      mark: 0,
    };
    boxes.push(b);
    return b;
  }

  function build() {
    cells.clear();
    for (const b of boxes) {
      const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
      const z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const k = key(ix, iz);
        let list = cells.get(k);
        if (!list) cells.set(k, (list = []));
        list.push(b);
      }
    }
  }

  // Calls fn(box) once for each box whose cell range meets the x/z rectangle.
  function query(minX, minZ, maxX, maxZ, fn) {
    stamp++;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const list = cells.get(key(ix, iz));
      if (!list) continue;
      for (const b of list) {
        if (b.mark === stamp) continue;
        b.mark = stamp;
        fn(b);
      }
    }
  }

  // First hit along a unit direction within maxDist. Walks the hash cells the ray crosses (2D
  // DDA) and stops once a hit is nearer than the next cell boundary. `skip` ignores one box.
  function raycast(ox, oy, oz, dx, dy, dz, maxDist, { ground = true, skip = null, kinds = null } = {}) {
    let best = null;
    let bestT = maxDist;
    if (ground && dy < -1e-9 && oy > 0) {
      const t = -oy / dy;
      if (t <= bestT) { bestT = t; best = { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, box: null }; }
    }
    stamp++;
    let ix = Math.floor(ox / CELL), iz = Math.floor(oz / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-12 ? CELL / Math.abs(dx) : Infinity;
    const tdz = Math.abs(dz) > 1e-12 ? CELL / Math.abs(dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-12 ? ((dx > 0 ? (ix + 1) * CELL - ox : ox - ix * CELL) / Math.abs(dx)) : Infinity;
    let tmz = Math.abs(dz) > 1e-12 ? ((dz > 0 ? (iz + 1) * CELL - oz : oz - iz * CELL) / Math.abs(dz)) : Infinity;
    for (let guard = 0; guard < 4096; guard++) {
      const list = cells.get(key(ix, iz));
      if (list) {
        for (const b of list) {
          if (b.mark === stamp || b === skip) continue;
          b.mark = stamp;
          if (kinds && !kinds.includes(b.kind)) continue;
          const r = rayBox(b, ox, oy, oz, dx, dy, dz);
          if (!r || r.tExit < 0) continue;
          const t = r.tEnter >= 0 ? r.tEnter : 0;
          if (r.tEnter < 0) continue; // starting inside a box: not a hit (callers start outside)
          if (t < bestT) {
            bestT = t;
            const ax = r.inAxis, sg = r.inSign;
            best = { t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t, nx: ax === 0 ? sg : 0, ny: ax === 1 ? sg : 0, nz: ax === 2 ? sg : 0, box: b };
          }
        }
      }
      const tNext = Math.min(tmx, tmz);
      if (bestT <= tNext || tNext > maxDist) break;
      if (tmx < tmz) { tmx += tdx; ix += stepX; } else { tmz += tdz; iz += stepZ; }
    }
    return best;
  }

  // True when the straight segment between two points is clear of boxes (and ground).
  function lineOfSight(ax, ay, az, bx, by, bz, skip = null) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return true;
    return !raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 1e-3, { skip });
  }

  // Pushes a vertical capsule (three spheres at -halfSeg, 0, +halfSeg around the body position)
  // out of every box and the ground, removing the velocity that points into each surface. The
  // removal is a 'surface' push. Fills `out` with what was touched.
  function resolveCapsule(body, radius, halfSeg, out) {
    out.ground = false; out.wall = false; out.ceiling = false;
    out.nx = 0; out.nz = 0; out.box = null; out.groundBox = null; out.impact = 0;
    const p = body.p;
    for (let pass = 0; pass < 2; pass++) {
      for (let s = -1; s <= 1; s++) {
        const cy = p.y + s * halfSeg;
        stamp++;
        const x0 = Math.floor((p.x - radius) / CELL), x1 = Math.floor((p.x + radius) / CELL);
        const z0 = Math.floor((p.z - radius) / CELL), z1 = Math.floor((p.z + radius) / CELL);
        for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
          const list = cells.get(key(ix, iz));
          if (!list) continue;
          for (let n = 0; n < list.length; n++) {
            const b = list[n];
            if (b.mark === stamp) continue;
            b.mark = stamp;
            sphereBox(body, p, cy, radius, b, out);
          }
        }
      }
      const feet = p.y - halfSeg - radius;
      if (feet < 0) {
        p.y -= feet;
        contact(body, 0, 1, 0, null, out);
      }
    }
    return out;
  }

  // Pushes the sphere at (p.x, cy, p.z) out of box b, if it overlaps.
  function sphereBox(body, p, cy, radius, b, out) {
    if (cy + radius <= b.minY || cy - radius >= b.maxY) return;
    const qx = Math.max(b.minX, Math.min(p.x, b.maxX));
    const qy = Math.max(b.minY, Math.min(cy, b.maxY));
    const qz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    const dx = p.x - qx, dy = cy - qy, dz = p.z - qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    let nx, ny, nz, pen;
    if (d2 > 1e-12) {
      if (d2 >= radius * radius) return;
      const d = Math.sqrt(d2);
      nx = dx / d; ny = dy / d; nz = dz / d; pen = radius - d;
    } else {
      // Centre inside the box: leave by the nearest face.
      const f0 = p.x - b.minX, f1 = b.maxX - p.x, f2 = cy - b.minY, f3 = b.maxY - cy, f4 = p.z - b.minZ, f5 = b.maxZ - p.z;
      let m = 0, best = f0;
      if (f1 < best) { best = f1; m = 1; }
      if (f2 < best) { best = f2; m = 2; }
      if (f3 < best) { best = f3; m = 3; }
      if (f4 < best) { best = f4; m = 4; }
      if (f5 < best) { best = f5; m = 5; }
      nx = m === 0 ? -1 : m === 1 ? 1 : 0;
      ny = m === 2 ? -1 : m === 3 ? 1 : 0;
      nz = m === 4 ? -1 : m === 5 ? 1 : 0;
      pen = best + radius;
    }
    p.x += nx * pen; p.y += ny * pen; p.z += nz * pen;
    contact(body, nx, ny, nz, b, out);
  }

  function contact(body, nx, ny, nz, box, out) {
    const v = body.v;
    const vn = v.x * nx + v.y * ny + v.z * nz;
    if (vn < 0) {
      out.impact = Math.max(out.impact, -vn);
      applyDv(body, 'surface', -vn * nx, -vn * ny, -vn * nz);
    }
    if (ny >= 0.5) { out.ground = true; out.groundBox = box; }
    else if (ny <= -0.5) out.ceiling = true;
    else {
      const h = Math.hypot(nx, nz) || 1;
      out.wall = true; out.nx = nx / h; out.nz = nz / h; out.box = box;
    }
  }

  // Height of the highest surface under (x, z) at or below y (roof or ground).
  function groundHeight(x, y, z) {
    let h = 0;
    query(x, z, x, z, (b) => {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.maxY <= y + 1e-6 && b.maxY > h) h = b.maxY;
    });
    return h;
  }

  function pointInside(x, y, z, margin = 0) {
    let inside = false;
    const r = Math.max(0, -margin);
    query(x - r, z - r, x + r, z + r, (b) => {
      if (x > b.minX + margin && x < b.maxX - margin && y > b.minY + margin && y < b.maxY - margin && z > b.minZ + margin && z < b.maxZ - margin) inside = true;
    });
    return inside;
  }

  return { boxes, addBox, build, query, raycast, lineOfSight, resolveCapsule, groundHeight, pointInside };
}
