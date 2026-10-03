import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildHeroModel, createAnimator, smoothHead, COM_HEIGHT, MASK, MASK_F, BODY_SCALE_F } from '../hero/model.js';
import { outfitMaterial } from '../combat/enemyModel.js';
import { comicToon } from '../render/comicShade.js';
import { addHullOutline } from '../render/toon.js';
import { suitById } from '../progress/progression.js';

// Builds any roster character as a model the poser can drive (root, orient, model, animator), with
// its gear: wings, tails, tentacles, capes, a glider, a fishbowl. Animated gear moves in update().

const mats = {};
const M = (key, color) => (mats[key] ??= comicToon({ color }));

export function buildCharacter(assets, def) {
  const female = def.body === 'f';
  let built;
  if (def.suit || def.suitId) {
    const suit = def.suit ? { id: def.id, ...def.suit } : suitById(def.suitId);
    built = buildHeroModel(assets, suit, { female, scale: def.scale ?? null });
  } else built = buildOutfitModel(assets, def, female);
  built.gear = [];
  for (const g of def.gear ?? []) {
    const part = GEAR[g]?.(built, assets, def);
    if (part) built.gear.push(part);
  }
  built.updateGear = (dt, hero) => { for (const g of built.gear) g.update?.(dt, hero, built); };
  built.def = def;
  return built;
}

// A villain or Black Cat: the body wearing an outfit (the enemy outfit shader), on the same
// root -> orient -> model chain as the hero so the poser can drive it.
function buildOutfitModel(assets, def, female) {
  const root = new THREE.Group();
  const orient = new THREE.Group();
  root.add(orient);
  const model = SkeletonUtils.clone(female ? assets.bodyF : assets.body);
  model.position.y = -COM_HEIGHT;
  if (def.scale) model.scale.set(def.scale[0], def.scale[1], def.scale[2]);
  orient.add(model);
  const mat = outfitMaterial(def.outfit);
  if (female) mat.userData.outfit.uBodyScale.value.set(...BODY_SCALE_F);
  const masked = (def.outfit.skin ?? 0) < -0.5 || [2, 3, 6].includes(def.outfit.head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1612 });
  const hulls = [];
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const isFace = o.name === 'Eyes' || o.name === 'Eyebrows';
    o.material = isFace && !masked ? eyeMat : mat;
    if (masked) o.geometry = smoothHead(o.geometry, female ? MASK_F : MASK);
    o.castShadow = true;
    o.frustumCulled = false;
    if (!isFace) hulls.push(o);
  });
  const hullMeshes = hulls.map((o) => addHullOutline(o)); // the drawn outline (spec G6)
  const bone = (n) => model.getObjectByName(n);
  return {
    root, orient, model, suitMat: null, outfitMat: mat, hulls: hullMeshes,
    animator: createAnimator(model, assets.clips),
    bones: { handR: bone('hand_r'), handL: bone('hand_l'), head: bone('Head') },
  };
}

// Gear -------------------------------------------------------------------------------------------
function chain(n, r0, r1, len, mat) {
  // A chain of segments (tails, tentacles), each a child of the last so a sway propagates.
  const root = new THREE.Group();
  let parent = root;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const r = r0 + (r1 - r0) * (i / (n - 1));
    const seg = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
    mesh.scale.set(1, 1, len / (2 * r));
    mesh.position.z = len / 2;
    seg.add(mesh);
    if (i) seg.position.z = len;
    parent.add(seg);
    segs.push(seg);
    parent = seg;
  }
  return { root, segs, tip: parent };
}

// Puts a gear object on a bone at a position and rotation given in the body's model space (bind
// pose, feet at 0, +y up, +z forward, +x the character's left). The bones have their own rotated
// axes, so offsets written in bone space land in odd places; this converts once at build time.
const _mi = new THREE.Matrix4(), _bm = new THREE.Matrix4(), _d = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function attach(b, boneName, obj, pos, rot = [0, 0, 0]) {
  const bn = b.model.getObjectByName(boneName);
  b.model.updateMatrixWorld(true);
  _mi.copy(b.model.matrixWorld).invert();
  _bm.multiplyMatrices(_mi, bn.matrixWorld);
  _d.compose(_v.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s);
  _d.premultiply(_bm.invert());
  _d.decompose(obj.position, obj.quaternion, obj.scale);
  bn.add(obj);
  return obj;
}
const headY = (def) => (def.body === 'f' ? 1.645 : 1.69);

const GEAR = {
  hood(b, assets, def) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), M('hood', 0xf4f4f6));
    h.scale.set(1.05, 1.0, 1.1);
    const holder = new THREE.Group(); holder.add(h);
    attach(b, 'Head', holder, [0, headY(def) + 0.01, -0.025], [-0.45, 0, 0]);
  },
  goggles(b, assets, def) {
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 12), M('goggle', 0x2a2a2e));
      attach(b, 'Head', l, [sx * 0.045, headY(def) + 0.03, 0.095], [Math.PI / 2, 0, 0]);
    }
  },
  cape2099(b) {
    const geo = new THREE.PlaneGeometry(0.62, 0.95, 1, 4); geo.translate(0, -0.47, 0);
    const holder = new THREE.Group(), c = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: 0xc8202a, side: THREE.DoubleSide }));
    holder.add(c); attach(b, 'spine_03', holder, [0, 1.47, -0.15]);
    return { update(dt, hero) { const v = Math.hypot(hero.body.v.x, hero.body.v.z); c.rotation.x = -Math.min(1.3, 0.12 + v * 0.03); } };
  },
  // Long hair in the def's colour (story cast: MJ, Captain Watanabe).
  hairLong(b, assets, def) {
    const h = assets.hair.clone(true);
    const col = def.hairColor ?? 0x2a1a10;
    h.traverse((o) => { if (o.isMesh) { o.material = M('hair' + col, col); o.castShadow = true; } });
    const holder = new THREE.Group(); holder.add(h);
    attach(b, 'Head', holder, [0, 0, 0]);
  },
  moustache(b, assets, def) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.016, 0.02), M('stache', def.hairColor ?? 0x2a2a2e));
    attach(b, 'Head', m, [0, headY(def) - 0.075, 0.105]);
  },
  hairWhite(b, assets) {
    const h = assets.hair.clone(true);
    h.traverse((o) => { if (o.isMesh) { o.material = M('hairW', 0xf4f4f6); o.castShadow = true; } });
    const holder = new THREE.Group(); holder.add(h);
    attach(b, 'Head', holder, [0, 0, 0]);
  },
  fur(b, assets, def) {
    const wx = def.body === 'f' ? 0.56 : 0.62;
    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.028, 6, 12), M('fur', 0xf4f4f6));
      attach(b, sx > 0 ? 'lowerarm_l' : 'lowerarm_r', f, [sx * wx, 1.42, 0], [0, Math.PI / 2, 0]);
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.04, 6, 14), M('fur', 0xf4f4f6));
    attach(b, 'neck_01', collar, [0, def.body === 'f' ? 1.47 : 1.52, 0], [Math.PI / 2, 0, 0]);
  },
  tendrils(b) {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const c = chain(5, 0.03, 0.012, 0.1, M('venom', 0x0e0d16));
      attach(b, 'spine_03', c.root, [(i - 1.5) * 0.08, 1.4, -0.12], [-2.6, (i - 1.5) * 0.4, 0]);
      parts.push(c);
    }
    let t = Math.random() * 6;
    return { update(dt) { t += dt; parts.forEach((c, i) => c.segs.forEach((sg, k) => { sg.rotation.x = Math.sin(t * 2 + i + k) * 0.25; sg.rotation.y = Math.cos(t * 1.6 + i * 2 + k) * 0.25; })); } };
  },
  wings(b) {
    const wings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Group(), holder = new THREE.Group();
      const spar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), M('spar', 0x5a5a62)); spar.position.x = sx * 0.75; w.add(spar);
      for (let k = 0; k < 6; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.62 - k * 0.04), M('feather', 0x4a7a3a)); f.position.set(sx * (0.25 + k * 0.24), -0.01, -0.28); w.add(f); }
      holder.add(w);
      attach(b, 'spine_03', holder, [sx * 0.12, 1.42, -0.16]);
      wings.push({ w, sx });
    }
    let t = 0;
    return { update(dt, hero) { t += dt; const air = hero.state !== 'ground'; const flap = air ? Math.sin(t * (hero.speed > 12 ? 3 : 7)) * 0.35 : 0; for (const { w, sx } of wings) { w.rotation.z = sx * (air ? 0.1 + flap : -1.1); w.rotation.y = sx * (air ? 0 : 0.7); } } };
  },
  collar(b) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 6, 14), M('collar', 0xd8c890)); attach(b, 'neck_01', c, [0, 1.52, 0], [Math.PI / 2, 0, 0]); },
  glider(b) {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 1.3), M('glider', 0x4a5a3a)); g.add(deck);
    for (const sx of [-1, 1]) { const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.4), M('glider', 0x4a5a3a)); wing.position.set(sx * 0.55, 0, -0.1); wing.rotation.z = sx * -0.2; g.add(wing); }
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 8), M('jet', 0x2a2a2a)); jet.rotation.x = Math.PI / 2; jet.position.set(0, -0.05, -0.7); g.add(jet);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 8), new THREE.MeshBasicMaterial({ color: 0xffb030 })); flame.rotation.x = -Math.PI / 2; flame.position.set(0, -0.05, -0.95); g.add(flame);
    g.position.y = -0.92;
    b.orient.add(g);
    return { update(dt, hero) { const air = hero.state !== 'ground'; flame.visible = air; flame.scale.setScalar(0.8 + Math.random() * 0.5); g.position.y = air ? -0.95 : -0.92; } };
  },
  goblinEars(b, assets, def) {
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 6), M('gob', 0x4a8a3a)); attach(b, 'Head', e, [sx * 0.1, headY(def) + 0.06, 0], [0, 0, sx * -1.0]); }
  },
  tentacles(b) {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const c = chain(9, 0.06, 0.035, 0.2, M('ock', 0x8a929c));
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 6), M('ockClaw', 0x5a6068)); claw.rotation.x = Math.PI / 2; claw.position.z = 0.22; c.tip.add(claw);
      const sx = i < 2 ? -1 : 1, low = i % 2 === 0;
      // Low pair: back, out and down to the ground like legs; high pair: back, out and up.
      attach(b, 'spine_02', c.root, [sx * 0.08, low ? 1.05 : 1.25, -0.13], low ? [0.75, sx * 2.55, 0] : [-0.45, sx * 2.3, 0]);
      parts.push({ c, sx, low });
    }
    let t = 0;
    return { update(dt, hero) {
      t += dt;
      const walk = Math.hypot(hero.body.v.x, hero.body.v.z);
      for (const { c, sx, low } of parts) c.segs.forEach((g, k) => { g.rotation.x = (low ? 0.07 : -0.06) + Math.sin(t * (1.5 + walk * 0.2) + sx * 1.7 + k * 0.5) * 0.12; g.rotation.y = sx * 0.04 + Math.cos(t * 1.2 + sx + k * 0.4) * 0.08; });
    } };
  },
  starMask(b, assets, def) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 4), M('star', 0xf2e040));
      attach(b, 'Head', r, [Math.cos(a) * 0.15, headY(def) + 0.02 + Math.sin(a) * 0.17, 0.06], [0, 0, a - Math.PI / 2]);
    }
  },
  krackle(b) {
    const dots = [];
    for (const [n, sx] of [['hand_l', 1], ['hand_r', -1]]) {
      const holder = new THREE.Group();
      attach(b, n, holder, [sx * 0.8, 1.43, 0]);
      for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xf2e040 : 0x14141a })); holder.add(d); dots.push(d); }
    }
    let t = 0;
    return { update(dt) { t += dt; dots.forEach((d, i) => { const a = t * 6 + i * 1.3; d.position.set(Math.cos(a) * 0.12, Math.sin(a * 1.3) * 0.12, Math.sin(a) * 0.12); }); } };
  },
  horn(b, assets, def) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 8), M('horn', 0xe8e0d0)); attach(b, 'Head', h, [0, headY(def) - 0.01, 0.15], [1.15, 0, 0]); },
  tail(b) {
    const c = chain(8, 0.12, 0.03, 0.18, M('lizard', 0x4a8a3a));
    attach(b, 'pelvis', c.root, [0, 0.92, -0.12], [2.6, 0, 0]);
    let t = 0;
    return { update(dt, hero) { t += dt; const sp = Math.hypot(hero.body.v.x, hero.body.v.z); c.segs.forEach((sg, k) => { sg.rotation.y = Math.sin(t * (2 + sp * 0.3) + k * 0.6) * 0.18; sg.rotation.x = -0.05; }); } };
  },
  snout(b, assets, def) { const sn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), M('lizard', 0x4a8a3a)); attach(b, 'Head', sn, [0, headY(def) - 0.02, 0.13], [Math.PI / 2, 0, 0]); },
  stingerTail(b) {
    const c = chain(10, 0.07, 0.045, 0.2, M('scorp', 0x3a7a3a));
    const sting = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), M('sting', 0x9ab040)); sting.rotation.x = Math.PI / 2; sting.position.z = 0.24; c.tip.add(sting);
    attach(b, 'pelvis', c.root, [0, 0.95, -0.14], [Math.PI - 0.25, 0, 0]);
    let t = 0;
    return { update(dt) { t += dt; c.segs.forEach((sg, k) => { sg.rotation.x = -0.27 + Math.sin(t * 1.4 + k * 0.4) * 0.05; }); } };
  },
  gauntlets(b) {
    for (const [n, sx] of [['lowerarm_l', 1], ['lowerarm_r', -1]]) { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.26, 8), M('gaunt', 0x6a5030)); attach(b, n, g, [sx * 0.55, 1.43, 0], [0, 0, Math.PI / 2]); }
  },
  fishbowl(b, assets, def) {
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), new THREE.MeshBasicMaterial({ color: 0xcfe8f4, transparent: true, opacity: 0.35, depthWrite: false }));
    bowl.renderOrder = 6;
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: 0xa0d0a0, transparent: true, opacity: 0.6 }));
    attach(b, 'Head', bowl, [0, headY(def) + 0.01, 0]);
    attach(b, 'Head', smoke, [0, headY(def) + 0.01, 0]);
    let t = 0;
    return { update(dt) { t += dt; smoke.scale.setScalar(0.85 + Math.sin(t * 2) * 0.08); smoke.rotation.y += dt; } };
  },
  cape(b) {
    const geo = new THREE.PlaneGeometry(0.75, 1.2, 1, 6); geo.translate(0, -0.6, 0);
    const holder = new THREE.Group(), c = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: 0x6a3a8a, side: THREE.DoubleSide }));
    holder.add(c); attach(b, 'spine_03', holder, [0, 1.47, -0.16]);
    let t = 0;
    return { update(dt, hero) { t += dt; const v = Math.hypot(hero.body.v.x, hero.body.v.z); c.rotation.x = -Math.min(1.1, 0.12 + v * 0.05) + Math.sin(t * 3) * 0.04; } };
  },
  mane(b) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.08, 6, 14), M('mane', 0xc89040)); attach(b, 'neck_01', m, [0, 1.5, 0], [Math.PI / 2, 0, 0]); },
  cane(b) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), M('cane', 0x2a2a2a));
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M('caneTop', 0xe8e0e8)); top.position.y = 0.5; c.add(top);
    // Along the arm in the T-pose, so it hangs straight down when the arm does.
    attach(b, 'hand_r', c, [-1.2, 1.43, 0.06], [0, 0, Math.PI / 2]);
  },
};
