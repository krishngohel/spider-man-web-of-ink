// Fits a downloaded, Mixamo-rigged suit model onto the hero's skeleton and adds it to hero_m.glb as
// a second skinned mesh ("SuitModel"), so every clip and procedural pose the hero already has drives
// it. The suit's skeleton is bent into the hero's T-pose with each joint moved onto the hero's joint
// (so the mesh takes the hero's proportions), the mesh is skinned in that pose, and its own weights
// are mapped bone by bone onto the hero's joints. Base colour textures are shrunk to game size.
//   node scripts/fit-suit.mjs <suit.glb> [hero_m.glb in] [out.glb] [texSize]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import sharp from 'sharp';

const [suitPath, heroIn = 'public/assets/hero_m.glb', out = 'public/assets/hero_m.glb', texSize = '1024'] = process.argv.slice(2);
if (!suitPath) { console.log('usage: node scripts/fit-suit.mjs <suit.glb> [hero in] [out] [texSize]'); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const hero = await io.read(heroIn);
const suit = await io.read(suitPath);
const H = hero.getRoot(), S = suit.getRoot();
const hSkin = H.listSkins()[0], sSkin = S.listSkins()[0];
const hJoints = hSkin.listJoints(), sJoints = sSkin.listJoints();

// Mixamo joint names onto the hero's (Quaternius / UE mannequin names).
const clean = (n) => n.replace('mixamorig:', '').replace(/_\d+$/, '').replace(/_0+$/, '');
const side = (s) => (s === 'Left' ? 'l' : 'r');
function mapName(n) {
  const fixed = { Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03', Neck: 'neck_01', Head: 'Head', HeadTop_End: 'Head' };
  if (fixed[n]) return fixed[n];
  let m = n.match(/^(Left|Right)(Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|ToeBase|Toe_End)$/);
  if (m) return { Shoulder: 'clavicle', Arm: 'upperarm', ForeArm: 'lowerarm', Hand: 'hand', UpLeg: 'thigh', Leg: 'calf', Foot: 'foot', ToeBase: 'ball', Toe_End: 'ball_leaf' }[m[2]] + '_' + side(m[1]);
  m = n.match(/^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)([1-4])$/);
  if (m) return `${m[2].toLowerCase()}_0${m[3]}${m[3] === '4' ? '_leaf' : ''}_${side(m[1])}`;
  return null;
}
const hIndex = new Map(hJoints.map((j, i) => [j.getName(), i]));
const mat4 = (a) => new THREE.Matrix4().fromArray(a);
const wpos = (node) => new THREE.Vector3().fromArray(node.getWorldTranslation());

// Suit joint -> hero joint (unmapped ones take their nearest mapped ancestor).
const parentOf = new Map();
for (const j of sJoints) for (const c of j.listChildren()) parentOf.set(c, j);
const sMap = sJoints.map((j) => {
  let n = j;
  while (n) { const name = mapName(clean(n.getName())); if (name && hIndex.has(name)) return name; n = parentOf.get(n); }
  return 'pelvis';
});

// Global fit: scale by foot-to-head height, move the hips onto the pelvis.
const sNode = (name) => sJoints[sMap.findIndex((m, i) => m === name && mapName(clean(sJoints[i].getName())) === name)];
const hNode = (name) => hJoints[hIndex.get(name)];
const sHead = wpos(sNode('Head')), sFoot = wpos(sNode('foot_l')), sHip = wpos(sNode('pelvis'));
const hHead = wpos(hNode('Head')), hFoot = wpos(hNode('foot_l')), hHip = wpos(hNode('pelvis'));
const scale = (hHead.y - hFoot.y) / (sHead.y - sFoot.y);
const G = new THREE.Matrix4().makeTranslation(hHip.x, hHip.y, hHip.z).multiply(new THREE.Matrix4().makeScale(scale, scale, scale)).multiply(new THREE.Matrix4().makeTranslation(-sHip.x, -sHip.y, -sHip.z));
console.log('scale', scale.toFixed(4));

// Rest world matrices of the suit joints after the global fit, and their posed versions: each
// mapped joint rotated so its bone points like the hero's and moved onto the hero's joint.
const restW = new Map(), newW = new Map();
for (const j of sJoints) restW.set(j, G.clone().multiply(mat4(j.getWorldMatrix())));
const primaryChild = (j) => j.listChildren().find((c) => sJoints.includes(c));
function solve(j, parentNew) {
  const rw = restW.get(j);
  const p0 = new THREE.Vector3().setFromMatrixPosition(rw);
  const name = mapName(clean(j.getName()));
  let nw;
  if (name && hIndex.has(name) && name !== 'Head' || (name === 'Head' && clean(j.getName()) === 'Head')) {
    const target = wpos(hNode(name));
    // Bone direction: to the first child that maps to a different hero joint.
    let q = new THREE.Quaternion();
    const c = primaryChild(j), cName = c && mapName(clean(c.getName()));
    if (c && cName && hIndex.has(cName) && cName !== name) {
      const ds = new THREE.Vector3().setFromMatrixPosition(restW.get(c)).sub(p0).normalize();
      const dh = wpos(hNode(cName)).sub(target).normalize();
      q = new THREE.Quaternion().setFromUnitVectors(ds, dh);
    } else if (parentNew) {
      // A leaf (head, hand ends): keep the parent's rotation change.
      q = parentNew.q.clone();
    }
    nw = new THREE.Matrix4().makeTranslation(target.x, target.y, target.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
      .multiply(new THREE.Matrix4().makeTranslation(-p0.x, -p0.y, -p0.z))
      .multiply(rw);
    newW.set(j, { m: nw, q });
  } else {
    // Unmapped (end joints): ride the parent rigidly.
    const pr = parentNew ? parentNew.m.clone().multiply(restW.get(parentOf.get(j)).clone().invert()) : new THREE.Matrix4();
    nw = pr.multiply(rw);
    newW.set(j, { m: nw, q: parentNew?.q.clone() ?? new THREE.Quaternion() });
  }
  for (const c of j.listChildren()) if (sJoints.includes(c)) solve(c, newW.get(j));
}
for (const j of sJoints) if (!sJoints.includes(parentOf.get(j))) solve(j, null);

// Skinning matrices: posed world * inverse bind (the inverse bind maps mesh space to joint space).
const ibm = sSkin.getInverseBindMatrices().getArray();
const skinM = sJoints.map((j, i) => newW.get(j).m.clone().multiply(new THREE.Matrix4().fromArray(ibm, i * 16)));
// The rest skinning (to read the mesh in world space for the fit): G * world * inverse bind.

const buffer = H.listBuffers()[0];
const hParent = H.listNodes().find((n) => n.getMesh()?.getName() === 'Sphere.005_Retopology.004');
const parentNode = H.listNodes().find((n) => n.listChildren().includes(hParent)) ?? H.listScenes()[0];

// Textures: base colour only, shrunk (the comic shader has no use for normal maps).
const texCache = new Map();
async function baseTex(t, size) {
  if (!t) return null;
  if (texCache.has(t)) return texCache.get(t);
  const img = await sharp(Buffer.from(t.getImage())).resize(size, size, { fit: 'fill' }).jpeg({ quality: 86 }).toBuffer();
  const nt = hero.createTexture(`suit_${texCache.size}`).setImage(new Uint8Array(img)).setMimeType('image/jpeg');
  texCache.set(t, nt);
  console.log('texture', t.getSize()?.join('x'), '->', size, (img.length / 1024).toFixed(0), 'KB');
  return nt;
}

const mesh = hero.createMesh('SuitModel');
const v = new THREE.Vector3(), n = new THREE.Vector3(), tmp = new THREE.Vector3(), M = new THREE.Matrix4();
let bbMin = new THREE.Vector3(Infinity, Infinity, Infinity), bbMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
for (const sm of S.listMeshes()) for (const sp of sm.listPrimitives()) {
  const P = sp.getAttribute('POSITION').getArray(), N = sp.getAttribute('NORMAL')?.getArray(), UV = sp.getAttribute('TEXCOORD_0')?.getArray();
  const J = sp.getAttribute('JOINTS_0').getArray(), W = sp.getAttribute('WEIGHTS_0').getArray();
  const count = P.length / 3;
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    v.set(0, 0, 0); n.set(0, 0, 0);
    const acc = new Map();
    for (let k = 0; k < 4; k++) {
      const w = W[i * 4 + k];
      if (w <= 0) continue;
      const ji = J[i * 4 + k];
      tmp.fromArray(P, i * 3).applyMatrix4(skinM[ji]); v.addScaledVector(tmp, w);
      if (N) { M.copy(skinM[ji]); tmp.fromArray(N, i * 3).transformDirection(M); n.addScaledVector(tmp, w); }
      const hj = hIndex.get(sMap[ji]);
      acc.set(hj, (acc.get(hj) ?? 0) + w);
    }
    v.toArray(pos, i * 3); n.normalize().toArray(nrm, i * 3);
    bbMin.min(v); bbMax.max(v);
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    top.forEach(([hj, w], k) => { joints[i * 4 + k] = hj; weights[i * 4 + k] = w / sum; });
  }
  const prim = hero.createPrimitive()
    .setAttribute('POSITION', hero.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
    .setAttribute('NORMAL', hero.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buffer))
    .setAttribute('JOINTS_0', hero.createAccessor().setType('VEC4').setArray(joints).setBuffer(buffer))
    .setAttribute('WEIGHTS_0', hero.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer));
  if (UV) prim.setAttribute('TEXCOORD_0', hero.createAccessor().setType('VEC2').setArray(new Float32Array(UV)).setBuffer(buffer));
  const idx = sp.getIndices()?.getArray();
  if (idx) prim.setIndices(hero.createAccessor().setType('SCALAR').setArray(count > 65535 ? new Uint32Array(idx) : new Uint16Array(idx)).setBuffer(buffer));
  const sMat = sp.getMaterial();
  const big = sMat?.getBaseColorTexture()?.getSize()?.[0] >= 1024;
  const tex = await baseTex(sMat?.getBaseColorTexture(), big ? Number(texSize) : Number(texSize) / 4);
  const mat = hero.createMaterial(`Suit_${sMat?.getName() ?? 'm'}`).setMetallicFactor(0).setRoughnessFactor(1);
  if (tex) mat.setBaseColorTexture(tex);
  prim.setMaterial(mat);
  mesh.addPrimitive(prim);
}
console.log('fitted bounds', bbMin.toArray().map((x) => x.toFixed(2)).join(','), '->', bbMax.toArray().map((x) => x.toFixed(2)).join(','));
const node = hero.createNode('SuitModel').setMesh(mesh).setSkin(hSkin);
parentNode.addChild(node);
await io.write(out, hero);
console.log('wrote', out);
