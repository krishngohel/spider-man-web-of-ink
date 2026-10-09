// Fits any downloaded suit model (rigged or not, any pose, any scale) onto the hero's skeleton and
// writes it as its own small GLB (public/assets/suits/<id>.glb) that the game binds to the hero's
// bones by name when the suit is worn (spec 2026-10-08 Part S).
//
//  1. Flatten: every mesh to world space (skinned ones through their own bind pose), the suit's
//     config applied (rotation, parts dropped), scaled to the hero's height, feet on y = 0.
//  2. Joints: where the source has a Mixamo rig its joints are used; everywhere else the hero's arm
//     and leg chains are swung and stretched onto the shape (hand and foot extremes).
//  3. Skin by transfer: the hero body deformed into that pose and those proportions; each suit vertex
//     takes the weights of the nearest body points. Far from the body (coats, hoods) the weights are
//     smoothed over the suit's own surface so cloth does not tear between the legs.
//  4. The bind skeleton is the hero skeleton placed on the suit's joints, so at run time the hero's
//     bones pull the suit onto the hero's proportions and play every clip and procedural pose.
//
//   node scripts/fit-any-suit.mjs <id|all> [--stage=norm]   (config: scripts/fit-suits.json; credits: scripts/suit-credits.json)
// --stage=norm writes only the flattened, normalised static mesh to assets-src/suits/norm/<id>.glb.
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import sharp from 'sharp';
import fs from 'node:fs';

const args = process.argv.slice(2);
const stage = (args.find((a) => a.startsWith('--stage=')) ?? '').slice(8) || 'fit';
const which = args.find((a) => !a.startsWith('--')) ?? 'all';
const CFG = JSON.parse(fs.readFileSync('scripts/fit-suits.json', 'utf8'));
const SRC_DIR = 'assets-src/suits/sketchfab/';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

// Attribute values as floats (normalized byte and short weights and UVs read as 0..1).
function floats(acc) {
  if (!acc) return null;
  const a = acc.getArray();
  if (!acc.getNormalized() || a instanceof Float32Array) return a;
  const max = a instanceof Uint8Array ? 255 : a instanceof Uint16Array ? 65535 : a instanceof Int8Array ? 127 : 32767;
  return Float32Array.from(a, (v) => Math.max(v / max, -1));
}

// The hero ---------------------------------------------------------------------------------------
const heroDoc = await io.read('public/assets/hero_m.glb');
const HR = heroDoc.getRoot();
const hSkin = HR.listSkins()[0];
const hJoints = hSkin.listJoints();
const hName = hJoints.map((j) => j.getName());
const hIdx = new Map(hName.map((n, i) => [n, i]));
const hWorld = hJoints.map((j) => new THREE.Matrix4().fromArray(j.getWorldMatrix()));
const hPos = hWorld.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
const hParent = hJoints.map((j) => hJoints.findIndex((p) => p.listChildren().includes(j)));
const hChildren = hJoints.map((_, i) => hParent.map((p, k) => (p === i ? k : -1)).filter((k) => k >= 0));
const hIbm = (() => { const a = hSkin.getInverseBindMatrices().getArray(); return hJoints.map((_, i) => new THREE.Matrix4().fromArray(a, i * 16)); })();
// The body mesh (not eyes, brows or the film suit), in hero world space, with its weights.
const bodyNode = HR.listNodes().find((n) => n.getMesh()?.getName() === 'Sphere.005_Retopology.004');
const body = (() => {
  const p = bodyNode.getMesh().listPrimitives()[0];
  return { P: p.getAttribute('POSITION').getArray(), J: p.getAttribute('JOINTS_0').getArray(), W: floats(p.getAttribute('WEIGHTS_0')) };
})();
// Three.js skins with the mesh node's own transform too (bindMatrix = the node's world matrix).
const bodyBind = new THREE.Matrix4().fromArray(bodyNode.getWorldMatrix());
const bodyWorld = skinPositions(body.P, body.J, body.W, hWorld.map((m, i) => m.clone().multiply(hIbm[i]).multiply(bodyBind)));
const HERO_TOP = maxY(bodyWorld);
// Nodes above the root joint, outermost first.
const heroAncestors = (() => {
  const list = [];
  let n = hJoints[hParent.indexOf(-1)];
  for (;;) { const p = HR.listNodes().find((q) => q.listChildren().includes(n)); if (!p) break; list.unshift(p); n = p; }
  return list;
})();
const descendants = (i) => [i, ...hChildren[i].flatMap(descendants)];

function skinPositions(P, J, W, mats) {
  const out = new Float32Array(P.length), v = new THREE.Vector3(), acc = new THREE.Vector3();
  for (let i = 0; i < P.length / 3; i++) {
    acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) { const w = W[i * 4 + k]; if (w > 0) acc.addScaledVector(v.fromArray(P, i * 3).applyMatrix4(mats[J[i * 4 + k]]), w); }
    acc.toArray(out, i * 3);
  }
  return out;
}
// Normals through the same skinning (directions: rotation and scale only, renormalised).
function skinNormals(Nn, J, W, mats) {
  const out = new Float32Array(Nn.length), v = new THREE.Vector3(), acc = new THREE.Vector3(), n3 = new THREE.Matrix3();
  const nm = mats.map((m) => new THREE.Matrix3().getNormalMatrix(m));
  for (let i = 0; i < Nn.length / 3; i++) {
    acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) { const w = W[i * 4 + k]; if (w > 0) acc.addScaledVector(v.fromArray(Nn, i * 3).applyMatrix3(nm[J[i * 4 + k]]), w); }
    acc.normalize().toArray(out, i * 3);
  }
  void n3;
  return out;
}
function maxY(P) { let m = -Infinity; for (let i = 1; i < P.length; i += 3) m = Math.max(m, P[i]); return m; }

// 1. Flatten ------------------------------------------------------------------------------------
const MIXAMO = (() => {
  const fixed = { Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03', Neck: 'neck_01', Head: 'Head' };
  return (raw) => {
    const n = raw.replace(/^mixamorig\d*:/, '').replace(/_\d+$/, '');
    if (fixed[n]) return fixed[n];
    let m = n.match(/^(Left|Right)(Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|ToeBase)$/);
    const sd = (s) => (s === 'Left' ? 'l' : 'r');
    if (m) return { Shoulder: 'clavicle', Arm: 'upperarm', ForeArm: 'lowerarm', Hand: 'hand', UpLeg: 'thigh', Leg: 'calf', Foot: 'foot', ToeBase: 'ball' }[m[2]] + '_' + sd(m[1]);
    m = n.match(/^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)([1-3])$/);
    if (m) return `${m[2].toLowerCase()}_0${m[3]}_${sd(m[1])}`;
    return null;
  };
})();

async function flatten(id, cfg) {
  const doc = await io.read(SRC_DIR + cfg.src);
  const R = doc.getRoot();
  await doc.transform(weld());
  const drop = cfg.drop ? new RegExp(cfg.drop, 'i') : null;
  const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(cfg.rot ?? [0, 0, 0]).map(THREE.MathUtils.degToRad), 'XYZ'));
  const parts = [];
  const rigJoints = new Map(); // hero joint name -> world position (source space, rotated)
  for (const node of R.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const skin = node.getSkin();
    let mats = null, single = null;
    if (skin && cfg.skin !== false) {
      const sj = skin.listJoints(), ibm = skin.getInverseBindMatrices()?.getArray();
      const nb = new THREE.Matrix4().fromArray(node.getWorldMatrix());
      mats = sj.map((j, i) => new THREE.Matrix4().fromArray(j.getWorldMatrix()).multiply(ibm ? new THREE.Matrix4().fromArray(ibm, i * 16) : new THREE.Matrix4()).multiply(nb));
      for (const j of sj) { const hn = MIXAMO(j.getName()); if (hn && hIdx.has(hn) && !rigJoints.has(hn)) rigJoints.set(hn, new THREE.Vector3().fromArray(j.getWorldTranslation()).applyMatrix4(rot)); }
    } else single = cfg.nodeMatrix === false && node.getSkin() ? new THREE.Matrix4() : new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const label = `${node.getName()} ${mesh.getName()} ${mat?.getName() ?? ''}`;
      if (drop && drop.test(label)) { console.log('  drop', label); continue; }
      if (prim.getMode() !== 4) continue;
      const P = floats(prim.getAttribute('POSITION'));
      const J = prim.getAttribute('JOINTS_0')?.getArray(), W = floats(prim.getAttribute('WEIGHTS_0'));
      const world = mats && J ? skinPositions(P, J, W, mats) : (() => { const o = new Float32Array(P.length), v = new THREE.Vector3(); for (let i = 0; i < P.length / 3; i++) v.fromArray(P, i * 3).applyMatrix4(single ?? new THREE.Matrix4()).toArray(o, i * 3); return o; })();
      const v = new THREE.Vector3();
      for (let i = 0; i < world.length / 3; i++) v.fromArray(world, i * 3).applyMatrix4(rot).toArray(world, i * 3);
      const N0 = floats(prim.getAttribute('NORMAL'));
      let NW = null;
      if (N0) {
        NW = mats && J ? skinNormals(N0, J, W, mats) : (() => { const o = new Float32Array(N0.length), nm = new THREE.Matrix3().getNormalMatrix(single ?? new THREE.Matrix4()); for (let i = 0; i < N0.length / 3; i++) v.fromArray(N0, i * 3).applyMatrix3(nm).normalize().toArray(o, i * 3); return o; })();
        for (let i = 0; i < NW.length / 3; i++) v.fromArray(NW, i * 3).transformDirection(rot).toArray(NW, i * 3);
      }
      const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: world.length / 3 }, (_, i) => i);
      parts.push({ label, P: world, N: NW, UV: floats(prim.getAttribute('TEXCOORD_0')), idx: Uint32Array.from(idx), mat });
    }
  }
  // Normalise: the hero's height (cfg.height scales it for hats and spikes), feet on 0, centred.
  const box = new THREE.Box3();
  for (const p of parts) for (let i = 0; i < p.P.length; i += 3) box.expandByPoint(new THREE.Vector3(p.P[i], p.P[i + 1], p.P[i + 2]));
  const s = (HERO_TOP * (cfg.height ?? 1)) / (box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const N = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-cx, -box.min.y, -cz));
  const v = new THREE.Vector3();
  for (const p of parts) for (let i = 0; i < p.P.length / 3; i++) v.fromArray(p.P, i * 3).applyMatrix4(N).toArray(p.P, i * 3);
  for (const [k, q] of rigJoints) rigJoints.set(k, q.applyMatrix4(N));
  // A baked ground shadow inside the mesh: flat triangles at floor level go.
  if (cfg.dropFloor) for (const p of parts) {
    const keep = [];
    // dropFloor: { y, x }: triangles wholly below y that are flat at the floor or reach beyond x
    // to the side (a shadow sheet reaching out past the feet).
    const { y: fy, x: fx } = cfg.dropFloor;
    for (let t = 0; t < p.idx.length; t += 3) {
      const ys = [0, 1, 2].map((k) => p.P[p.idx[t + k] * 3 + 1]), xs = [0, 1, 2].map((k) => Math.abs(p.P[p.idx[t + k] * 3]));
      const low = Math.max(...ys) < fy, flatFloor = Math.max(...ys) < 0.012, wide = Math.max(...xs) > fx;
      if (!(flatFloor || (low && wide))) keep.push(p.idx[t], p.idx[t + 1], p.idx[t + 2]);
    }
    if (keep.length < p.idx.length) console.log(`  floor: dropped ${(p.idx.length - keep.length) / 3} tris`);
    p.idx = Uint32Array.from(keep);
  }
  const merged = reduceParts(mergeByMaterial(parts), cfg.tris ?? 26000, cfg.simplifyError ?? 0.02);
  parts.length = 0; parts.push(...merged);
  console.log(`  ${id}: ${parts.length} parts, ${Math.round(parts.reduce((t, p) => t + p.idx.length / 3, 0))} tris, scale ${s.toFixed(4)}, rig joints ${rigJoints.size}`);
  return { doc, parts, rigJoints };
}

// Parts that share a material become one mesh (exports split big meshes at 65k vertices).
function mergeByMaterial(parts) {
  const by = new Map();
  for (const p of parts) { const k = p.mat ?? p.label; (by.get(k) ?? by.set(k, []).get(k)).push(p); }
  return [...by.values()].map((list) => {
    if (list.length === 1) return list[0];
    const nV = list.reduce((t, p) => t + p.P.length / 3, 0), nI = list.reduce((t, p) => t + p.idx.length, 0);
    const P = new Float32Array(nV * 3), N = list.every((p) => p.N) ? new Float32Array(nV * 3) : null, UV = list.every((p) => p.UV) ? new Float32Array(nV * 2) : null, idx = new Uint32Array(nI);
    let v = 0, i = 0;
    for (const p of list) {
      P.set(p.P, v * 3); if (N) N.set(p.N, v * 3); if (UV) UV.set(p.UV, v * 2);
      for (let k = 0; k < p.idx.length; k++) idx[i + k] = p.idx[k] + v;
      v += p.P.length / 3; i += p.idx.length;
    }
    return { label: list[0].label, P, N, UV, idx, mat: list[0].mat };
  });
}
const triArea = (P, idx) => {
  let a = 0; const u = new THREE.Vector3(), w = new THREE.Vector3(), o = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) { o.fromArray(P, idx[t] * 3); u.fromArray(P, idx[t + 1] * 3).sub(o); w.fromArray(P, idx[t + 2] * 3).sub(o); a += u.cross(w).length() / 2; }
  return a;
};
// The triangle budget split by surface area (tiny eyes with 100k vertices get a few hundred), each
// part simplified to its share and its unused vertices dropped.
function reduceParts(parts, budget, maxError = 0.02) {
  const areas = parts.map((p) => triArea(p.P, p.idx));
  const total = areas.reduce((t, a) => t + a, 0) || 1;
  return parts.map((p, k) => {
    p.areaShare = areas[k] / total;
    const have = p.idx.length / 3, want = Math.max(60, Math.round(budget * p.areaShare));
    if (have <= want * 1.1) return p;
    let [ni] = MeshoptSimplifier.simplify(p.idx, p.P, 3, want * 3, maxError, []);
    // Dense scanned meshes stall above the target: the sloppy simplifier ignores topology.
    if (ni.length / 3 > want * 1.5) [ni] = MeshoptSimplifier.simplifySloppy(p.idx, p.P, 3, null, want * 3, maxError);
    const remap = new Int32Array(p.P.length / 3).fill(-1);
    let n = 0;
    for (const i of ni) if (remap[i] < 0) remap[i] = n++;
    const P = new Float32Array(n * 3), N = p.N ? new Float32Array(n * 3) : null, UV = p.UV ? new Float32Array(n * 2) : null;
    for (let i = 0; i < remap.length; i++) {
      const r = remap[i]; if (r < 0) continue;
      P.set(p.P.subarray(i * 3, i * 3 + 3), r * 3);
      if (N) N.set(p.N.subarray(i * 3, i * 3 + 3), r * 3);
      if (UV) UV.set(p.UV.subarray(i * 2, i * 2 + 2), r * 2);
    }
    return { ...p, P, N, UV, idx: Uint32Array.from(ni, (i) => remap[i]) };
  });
}

// 2. Joints -------------------------------------------------------------------------------------
// Positions for every hero joint on the suit, and the rotation that takes each hero bone there.
function placeJoints(parts, rigJoints) {
  const pos = hPos.map((p) => p.clone());
  const rotQ = hPos.map(() => new THREE.Quaternion());
  const all = [];
  for (const p of parts) for (let i = 0; i < p.P.length; i += 3) all.push(p.P[i], p.P[i + 1], p.P[i + 2]);
  const V = Float32Array.from(all);
  const farthest = (P, from, sideX, minY, maxYv) => {
    let best = null, bd = -1;
    for (let i = 0; i < P.length; i += 3) {
      if (Math.sign(P[i]) !== sideX || P[i + 1] < minY || P[i + 1] > maxYv) continue;
      // The hand: the most sideways point (in a T- or A-pose nothing reaches further out).
      const d = P[i] * sideX;
      if (d > bd) { bd = d; best = new THREE.Vector3(P[i], P[i + 1], P[i + 2]); }
    }
    return best;
  };
  const soleCentre = (P, sideX) => {
    const c = new THREE.Vector3(); let n = 0;
    for (let i = 0; i < P.length; i += 3) if (Math.sign(P[i]) === sideX && P[i + 1] < 0.05 * HERO_TOP) { c.x += P[i]; c.y += P[i + 1]; c.z += P[i + 2]; n++; }
    return n ? c.divideScalar(n) : null;
  };
  // Swing and stretch a chain (root joint and everything under it) about the root joint.
  const swing = (root, heroTip, suitTip) => {
    const o = pos[root];
    const dh = heroTip.clone().sub(o), ds = suitTip.clone().sub(o);
    const q = new THREE.Quaternion().setFromUnitVectors(dh.clone().normalize(), ds.clone().normalize());
    const k = ds.length() / dh.length();
    for (const j of descendants(root)) {
      if (j !== root) pos[j] = pos[j].clone().sub(o).applyQuaternion(q).multiplyScalar(k).add(o);
      rotQ[j] = q.clone();
    }
  };
  for (const [sx, s] of [[1, 'l'], [-1, 'r']]) {
    const sh = hIdx.get('upperarm_' + s);
    const heroTip = farthest(bodyWorld, hPos[sh], sx, 0.4 * HERO_TOP, HERO_TOP);
    const suitTip = farthest(V, hPos[sh], sx, 0.4 * HERO_TOP, HERO_TOP);
    if (heroTip && suitTip) swing(sh, heroTip, suitTip);
    const th = hIdx.get('thigh_' + s);
    const hs = soleCentre(bodyWorld, sx), ss = soleCentre(V, sx);
    if (hs && ss) swing(th, hs, ss);
  }
  // A Mixamo rig on the source pins the joints it names (more exact than the shape).
  if (rigJoints.size > 8) {
    for (const [n, q] of rigJoints) pos[hIdx.get(n)] = q.clone();
    // Rotations: each mapped bone aimed from its hero direction to its suit direction.
    for (let j = 0; j < hJoints.length; j++) {
      const c = hChildren[j].find((k) => rigJoints.has(hName[k]));
      if (rigJoints.has(hName[j]) && c !== undefined) {
        const dh = hPos[c].clone().sub(hPos[j]).normalize(), ds = pos[c].clone().sub(pos[j]).normalize();
        rotQ[j] = new THREE.Quaternion().setFromUnitVectors(dh, ds);
      } else if (hParent[j] >= 0 && !rigJoints.has(hName[j])) {
        // Unmapped (finger ends, toes): ride the parent rigidly.
        const p = hParent[j];
        rotQ[j] = rotQ[p].clone();
        pos[j] = hPos[j].clone().sub(hPos[p]).applyQuaternion(rotQ[p]).add(pos[p]);
      }
    }
  }
  // Bind matrices: the hero joint frame, rotated by its swing, at the suit's joint position.
  return hJoints.map((_, j) => {
    const r = new THREE.Matrix4().extractRotation(hWorld[j]);
    return new THREE.Matrix4().makeTranslation(pos[j].x, pos[j].y, pos[j].z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotQ[j])).multiply(r);
  });
}

// Limb groups: a suit vertex only takes weights from body points on its own limb (an A-pose hand
// hangs beside the thigh; without this it would pick up leg weights and stretch from wrist to hip).
const GROUP = hName.map((n) => (/_l$/.test(n) && /clavicle|arm|hand|index|middle|ring|pinky|thumb/.test(n) ? 1 : /_r$/.test(n) && /clavicle|arm|hand|index|middle|ring|pinky|thumb/.test(n) ? 2 : /_l$/.test(n) && /thigh|calf|foot|ball/.test(n) ? 3 : /_r$/.test(n) && /thigh|calf|foot|ball/.test(n) ? 4 : 0));
// The group of the bone segment (joint to child, in the suit's bind pose) nearest a point.
function segmentGroup(bind) {
  const segs = [];
  const P = bind.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
  for (let j = 0; j < hJoints.length; j++) for (const c of hChildren[j]) if (GROUP[c] === GROUP[j] || GROUP[j] === 0) segs.push([P[j], P[c], GROUP[c]]);
  const ab = new THREE.Vector3(), ap = new THREE.Vector3(), q = new THREE.Vector3();
  return (x, y, z) => {
    let best = 0, bd = Infinity;
    for (const [a, b, g] of segs) {
      ab.subVectors(b, a); ap.set(x - a.x, y - a.y, z - a.z);
      const t = Math.max(0, Math.min(1, ap.dot(ab) / (ab.lengthSq() || 1)));
      q.copy(a).addScaledVector(ab, t);
      const d = Math.hypot(x - q.x, y - q.y, z - q.z);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  };
}
const bodyGroup = (() => {
  const g = new Uint8Array(body.P.length / 3);
  for (let i = 0; i < g.length; i++) { let bw = -1, bj = 0; for (let k = 0; k < 4; k++) if (body.W[i * 4 + k] > bw) { bw = body.W[i * 4 + k]; bj = body.J[i * 4 + k]; } g[i] = GROUP[bj]; }
  return g;
})();

// 3. Skin by transfer ---------------------------------------------------------------------------
function transferWeights(parts, bind, loose = 1) {
  // The hero body in the suit's pose: bind * heroIbm.
  const B = skinPositions(body.P, body.J, body.W, bind.map((m, i) => m.clone().multiply(hIbm[i]).multiply(bodyBind)));
  // A uniform grid over the deformed body for nearest-point lookups.
  const cell = 0.06, grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < B.length / 3; i++) { const k = key(B[i * 3], B[i * 3 + 1], B[i * 3 + 2]); (grid.get(k) ?? grid.set(k, []).get(k)).push(i); }
  const groupAt = segmentGroup(bind);
  const nearest = (x, y, z, kN) => {
    const g = groupAt(x, y, z);
    for (let r = 1; r < 12; r++) {
      const found = [];
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
        const l = grid.get(`${cx + a},${cy + b},${cz + c}`); if (!l) continue;
        for (const i of l) if (bodyGroup[i] === g || r > 6) found.push([Math.hypot(B[i * 3] - x, B[i * 3 + 1] - y, B[i * 3 + 2] - z), i]);
      }
      if (found.length >= kN) return found.sort((p, q) => p[0] - q[0]).slice(0, kN);
    }
    return [];
  };
  for (const p of parts) {
    const n = p.P.length / 3;
    const wmaps = new Array(n), dist = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const near = nearest(p.P[i * 3], p.P[i * 3 + 1], p.P[i * 3 + 2], 6);
      dist[i] = near[0]?.[0] ?? 1;
      const m = new Map();
      for (const [d, bi] of near) {
        const f = 1 / ((d + 0.004) ** 2);
        for (let k = 0; k < 4; k++) { const w = body.W[bi * 4 + k]; if (w > 0) m.set(body.J[bi * 4 + k], (m.get(body.J[bi * 4 + k]) ?? 0) + w * f); }
      }
      wmaps[i] = m;
    }
    // Smooth over the suit's surface, harder the further a vertex sits off the body.
    const nb = Array.from({ length: n }, () => new Set());
    for (let t = 0; t < p.idx.length; t += 3) { const [a, b, c] = [p.idx[t], p.idx[t + 1], p.idx[t + 2]]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
    const norm = (m) => { let s = 0; for (const v of m.values()) s += v; const o = new Map(); for (const [k, v] of m) o.set(k, v / (s || 1)); return o; };
    let cur = wmaps.map(norm);
    for (let it = 0; it < 12; it++) {
      cur = cur.map((m, i) => {
        const a = Math.min(0.85, Math.max(0, (dist[i] - 0.03) * 12 * loose));
        if (a <= 0 || nb[i].size === 0) return m;
        const avg = new Map();
        for (const j of nb[i]) for (const [k, v] of cur[j]) avg.set(k, (avg.get(k) ?? 0) + v / nb[i].size);
        const o = new Map();
        for (const [k, v] of m) o.set(k, v * (1 - a));
        for (const [k, v] of avg) o.set(k, (o.get(k) ?? 0) + v * a);
        return o;
      });
    }
    p.JN = new Uint16Array(n * 4); p.WN = new Float32Array(n * 4);
    cur.forEach((m, i) => {
      const top = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const s = top.reduce((t, e) => t + e[1], 0) || 1;
      top.forEach(([j, w], k) => { p.JN[i * 4 + k] = j; p.WN[i * 4 + k] = w / s; });
      if (!top.length) { p.JN[i * 4] = hIdx.get('pelvis'); p.WN[i * 4] = 1; }
    });
  }
}

// 4. Write --------------------------------------------------------------------------------------
function texOf(mat, slot) {
  if (!mat) return null;
  if (slot === 'base') {
    const sg = mat.getExtension('KHR_materials_pbrSpecularGlossiness');
    return mat.getBaseColorTexture() ?? sg?.getDiffuseTexture?.() ?? null;
  }
  return mat.getEmissiveTexture();
}
async function writeSuit(id, parts, bind, normOnly) {
  const out = new Document();
  const buf = out.createBuffer();
  const scene = out.createScene('suit');
  let skin = null, jointNodes = null;
  if (!normOnly) {
    // The hero's joint tree (same names and rest transforms), and a skin with the suit's binds.
    jointNodes = hJoints.map((j) => out.createNode(j.getName()).setTranslation(j.getTranslation()).setRotation(j.getRotation()).setScale(j.getScale()));
    // The armature nodes above the hero's root joint (an axis turn), so joint world matrices match.
    let top = scene;
    for (const a of heroAncestors) { const n = out.createNode(a.getName()).setTranslation(a.getTranslation()).setRotation(a.getRotation()).setScale(a.getScale()); top.addChild(n); top = n; }
    hJoints.forEach((_, i) => { if (hParent[i] >= 0) jointNodes[hParent[i]].addChild(jointNodes[i]); else top.addChild(jointNodes[i]); });
    const ibm = new Float32Array(hJoints.length * 16);
    bind.forEach((m, i) => m.clone().invert().toArray(ibm, i * 16));
    skin = out.createSkin('SuitSkin').setInverseBindMatrices(out.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf));
    for (const n of jointNodes) skin.addJoint(n);
  }
  const mesh = out.createMesh('SuitModel');
  const texCache = new Map();
  const cfg = CFG[id];
  async function tex(t, share = 1) {
    if (!t) return null;
    // Small parts (buttons, goggles) do not need a big texture: the size follows the surface share.
    const want = share > 0.15 ? 1024 : share > 0.04 ? 512 : 256;
    const size = Math.min(cfg.tex ?? 1024, t.getSize()?.[0] ?? 1024, want);
    const ck = `${size}`;
    if (texCache.has(t) && texCache.get(t).size >= size) return texCache.get(t).tex;
    const img = await sharp(Buffer.from(t.getImage())).resize(size, size, { fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
    const nt = out.createTexture(`t${texCache.size}`).setImage(new Uint8Array(img)).setMimeType('image/jpeg');
    texCache.set(t, { tex: nt, size });
    void ck;
    return nt;
  }
  for (const p of parts) {
    const n = p.P.length / 3;
    const prim = out.createPrimitive().setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(p.P).setBuffer(buf));
    if (p.N) prim.setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(p.N).setBuffer(buf));
    if (p.UV) prim.setAttribute('TEXCOORD_0', out.createAccessor().setType('VEC2').setArray(new Float32Array(p.UV)).setBuffer(buf));
    if (!normOnly) {
      prim.setAttribute('JOINTS_0', out.createAccessor().setType('VEC4').setArray(p.JN).setBuffer(buf));
      prim.setAttribute('WEIGHTS_0', out.createAccessor().setType('VEC4').setArray(p.WN).setBuffer(buf));
    }
    prim.setIndices(out.createAccessor().setType('SCALAR').setArray(n > 65535 ? p.idx : Uint16Array.from(p.idx)).setBuffer(buf));
    const m = out.createMaterial(p.mat?.getName() ?? 'suit').setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(!!p.mat?.getDoubleSided());
    const sg = p.mat?.getExtension('KHR_materials_pbrSpecularGlossiness');
    m.setBaseColorFactor(p.mat ? (sg?.getDiffuseFactor?.() ?? p.mat.getBaseColorFactor()) : [1, 1, 1, 1]);
    const bt = await tex(texOf(p.mat, 'base'), p.areaShare ?? 1);
    if (bt) m.setBaseColorTexture(bt);
    const et = await tex(texOf(p.mat, 'emissive'), p.areaShare ?? 1);
    if (et) { m.setEmissiveTexture(et); m.setEmissiveFactor(p.mat.getEmissiveFactor()); } else if (p.mat) m.setEmissiveFactor(p.mat.getEmissiveFactor());
    prim.setMaterial(m);
    mesh.addPrimitive(prim);
  }
  const node = out.createNode('SuitModel').setMesh(mesh);
  if (skin) node.setSkin(skin);
  scene.addChild(node);
  const dir = normOnly ? 'assets-src/suits/norm/' : 'public/assets/suits/';
  fs.mkdirSync(dir, { recursive: true });
  await io.write(`${dir}${id}.glb`, out);
  console.log(`  wrote ${dir}${id}.glb ${(fs.statSync(`${dir}${id}.glb`).size / 1024).toFixed(0)} KB`);
}

for (const id of which === 'all' ? Object.keys(CFG) : which.split(',')) {
  const cfg = CFG[id];
  if (!cfg) { console.log('no config for', id); continue; }
  console.log(id);
  const { parts, rigJoints } = await flatten(id, cfg);
  if (stage === 'norm') { await writeSuit(id, parts, null, true); continue; }
  const bind = placeJoints(parts, cfg.useRig === false ? new Map() : rigJoints);
  transferWeights(parts, bind, cfg.loose ?? 1);
  await writeSuit(id, parts, bind, false);
}
