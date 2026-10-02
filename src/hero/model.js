import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toonGradient } from '../render/toon.js';
import { PALETTE } from '../render/palette.js';
import { COMIC_SHADE, SHADOW_ALPHA, addShadeUniforms } from '../render/comicShade.js';

// The hero: Quaternius's CC0 superhero body (T-pose, facing +z, 1.81 m) wearing a classic suit
// painted by a shader from each fragment's bind-pose position: red head, chest, shoulders,
// forearms, gloves and boots; blue sides, under-arms and legs; black web lines over the red; the
// chest spider; big white eye lenses with black rims. No texture, so suits are cheap to swap.

export async function loadHeroAssets(base = './assets/', onProgress = () => {}) {
  const loader = new GLTFLoader();
  const names = ['hero_m.glb', 'anims1.glb', 'anims2.glb'];
  let done = 0;
  const [hero, a1, a2] = await Promise.all(names.map((n) => loader.loadAsync(base + n).then((g) => { onProgress(++done / names.length); return g; })));
  const clips = new Map();
  for (const clip of [...a1.animations, ...a2.animations]) clips.set(clip.name, sanitizeClip(clip));
  return { body: hero.scene, clips };
}

// The shared skeleton has matching bone lengths, but only rotations and the pelvis translation are
// safe to apply across bodies. Scale tracks are identity noise.
export function sanitizeClip(clip) {
  const tracks = clip.tracks.filter((t) => {
    const dot = t.name.lastIndexOf('.');
    const node = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (prop === 'scale') return false;
    if (prop === 'position') return node === 'pelvis';
    return true;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export function createAnimator(root, clips) {
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map();
  let current = null;
  const action = (name) => {
    if (!actions.has(name)) {
      const clip = clips.get(name);
      if (!clip) throw new Error(`Missing animation clip ${name}`);
      actions.set(name, mixer.clipAction(clip));
    }
    return actions.get(name);
  };
  return {
    mixer,
    play(name, { fade = 0.15, once = false, timeScale = 1 } = {}) {
      const next = action(name);
      if (next === current && !once) { next.timeScale = timeScale; return next; }
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.timeScale = timeScale;
      next.enabled = true;
      next.setEffectiveWeight(1);
      if (current && current !== next) next.crossFadeFrom(current, fade, false);
      next.play();
      current = next;
      return next;
    },
    prime(names) { for (const n of names) action(n); },
    get currentName() { return current?.getClip().name ?? null; },
    update(dt) { mixer.update(dt); },
  };
}

export const SUIT_CLASSIC = {
  id: 'classic', name: 'Classic',
  red: PALETTE.suitRed, blue: PALETTE.suitBlue, black: PALETTE.suitBlack, lens: PALETTE.lens,
};

function suitMaterial(suit) {
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() });
  const uniforms = {
    uRed: { value: new THREE.Color(suit.red) },
    uBlue: { value: new THREE.Color(suit.blue) },
    uBlack: { value: new THREE.Color(suit.black) },
    uLens: { value: new THREE.Color(suit.lens) },
  };
  mat.userData.suit = uniforms;
  mat.onBeforeCompile = (shader) => {
    addShadeUniforms(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uRed, uBlue, uBlack, uLens;
${COMIC_SHADE}
varying vec3 vBind;
const float TAU = 6.2831853;
float gLens = 0.0;
// A line at every whole number of f, about px pixels wide, antialiased.
float lineAA(float f, float px) {
  float d = abs(f - floor(f + 0.5));
  float w = fwidth(f);
  // Lines packed closer than a few pixels apart (the hero small on screen) fade out, the way an
  // artist drops the web pattern on a distant figure instead of filling it in black.
  float spacing = 1.0 / max(w, 1e-4);
  return (1.0 - smoothstep(w * px * 0.5, w * (px * 0.5 + 1.0), d)) * smoothstep(3.0, 9.0, spacing);
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
// The spider emblem, as a distance (negative inside). s scales it.
float spider(vec2 q, float s) {
  q /= s;
  float d = length((q - vec2(0.0, -0.016)) / vec2(0.017, 0.03)) - 1.0;
  d = min(d * 0.017, length(q - vec2(0.0, 0.026)) - 0.012);
  vec2 a = vec2(abs(q.x), q.y);
  // Four legs a side: the front pair reach up, the back pair down, each bent at a knee.
  d = min(d, sdSeg(a, vec2(0.006, 0.024), vec2(0.05, 0.062)) - 0.0034);
  d = min(d, sdSeg(a, vec2(0.05, 0.062), vec2(0.064, 0.112)) - 0.0028);
  d = min(d, sdSeg(a, vec2(0.008, 0.012), vec2(0.06, 0.03)) - 0.0034);
  d = min(d, sdSeg(a, vec2(0.06, 0.03), vec2(0.088, 0.058)) - 0.0028);
  d = min(d, sdSeg(a, vec2(0.008, -0.004), vec2(0.06, -0.022)) - 0.0034);
  d = min(d, sdSeg(a, vec2(0.06, -0.022), vec2(0.088, -0.062)) - 0.0028);
  d = min(d, sdSeg(a, vec2(0.006, -0.018), vec2(0.048, -0.06)) - 0.0034);
  d = min(d, sdSeg(a, vec2(0.048, -0.06), vec2(0.058, -0.11)) - 0.0028);
  return d * s;
}
vec3 paintSuit(vec3 p) {
  float ax = abs(p.x);
  bool red; float lines = 0.0;
  if (p.y > 1.53) {
    // Mask: web lines radiate from between the eyes over the whole head, crossed by rings.
    red = true;
    vec3 c = vec3(0.0, 1.69, 0.0);
    vec3 dir = normalize(p - c);
    float phi = (atan(dir.y, dir.x) / TAU + 0.5) * 16.0;
    float th = acos(clamp(dir.z, -1.0, 1.0)) / 0.26;
    lines = max(lineAA(phi, 1.4), lineAA(th, 1.4));
  } else if (ax < 0.24 && p.y > 0.93) {
    // Torso: a red bib from the shoulders, narrowing to the waist; blue sides from the armpits.
    float bib = mix(0.07, 0.165, smoothstep(1.0, 1.42, p.y));
    red = ax < bib || p.y > 1.44 || p.y < 0.985;
    vec2 c = p.xy - vec2(0.0, 1.34);
    lines = max(lineAA((atan(c.y, c.x) / TAU + 0.5) * 18.0, 1.4), lineAA(length(c) / 0.06, 1.4));
  } else if (ax >= 0.24) {
    // Arms: red over the top and outside, blue underneath the upper arm, red forearms and gloves.
    red = ax > 0.45 || p.y > 1.448;
    float phi = (atan(p.z + 0.065, p.y - 1.455) / TAU + 0.5) * 8.0;
    lines = max(lineAA(ax / 0.065, 1.4), lineAA(phi, 1.4));
  } else {
    // Legs blue; red boots to mid-calf, the top edge dipping to a point at the front.
    float a = atan(p.z + 0.04, p.x - sign(p.x) * 0.114);
    float bootTop = 0.43 - 0.06 * smoothstep(0.6, 1.0, sin(a));
    red = p.y < bootTop;
    lines = max(lineAA(p.y / 0.065, 1.4), lineAA((a / TAU + 0.5) * 8.0, 1.4));
  }
  vec3 col = red ? uRed : uBlue;
  if (red) col = mix(col, uBlack, lines);
  // Chest spider (black, front) and back spider (red with a black outline, bigger).
  if (p.y > 1.12 && p.y < 1.56 && ax < 0.16) {
    if (p.z > 0.04) {
      float d = spider(vec2(p.x, p.y - 1.33), 1.25);
      col = mix(col, uBlack, 1.0 - smoothstep(0.0, fwidth(d) * 1.5, d));
    } else if (p.z < -0.04) {
      float d = spider(vec2(p.x, p.y - 1.3), 1.7);
      float fw = fwidth(d) * 1.5;
      col = mix(col, uRed, 1.0 - smoothstep(0.0, fw, d));
      col = mix(col, uBlack, 1.0 - smoothstep(0.0035, 0.0035 + fw, abs(d)));
    }
  }
  // Eye lenses: two big teardrops, pointed toward the nose, swept up and out, in thick black
  // frames. Drawn in surface metres around the mask (from yaw and pitch), not projected flat onto the front, so
  // they keep their shape as they wrap around the head. The lens itself is painted after lighting
  // (gLens) so it stays bright white in shade.
  if (p.y > 1.6 && p.z > 0.0) {
    vec3 d = (p - vec3(0.0, 1.69, 0.0)) / vec3(0.091, 0.124, 0.104);
    float yaw = atan(d.x, d.z), pitch = asin(clamp(d.y / max(length(d), 1e-4), -1.0, 1.0));
    // Local frame in metres along the mask: u runs outward from the nose, v up.
    vec2 q = vec2(abs(yaw) * 0.097 - 0.047, pitch * 0.124 - 0.031);
    float a = 0.5;
    q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q; // into the tilted lens frame (outer end up)
    // Teardrop: full and round at the outer end, narrowing to a point by the nose.
    float k = clamp(-q.x / 0.039, 0.0, 1.0);
    q.y /= 1.0 - 0.72 * k * k;
    float e = length(q / vec2(0.039, 0.025));
    float aa = fwidth(e) * 1.5;
    col = mix(col, uBlack, 1.0 - smoothstep(1.3, 1.3 + aa, e));
    gLens = max(gLens, 1.0 - smoothstep(1.0, 1.0 + aa, e));
  }
  return col;
}
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
	diffuseColor.rgb = paintSuit(vBind);`)
      // Comic shading for the hero: three flat tones (shadows lifted and cooled so the suit never
      // goes muddy), plus a rim light so the silhouette pops off the city behind.
      .replace('#include <opaque_fragment>', `{
  // The hero's shadow is lighter than the city's, so the suit never sinks into the background.
  vec3 c = comicShade(diffuseColor.rgb, outgoingLight, vec3(0.74, 0.64, 0.8), vec3(0.92, 0.9, 0.95), vec3(1.08, 1.03, 0.97));
  gShadow *= 0.55; // light dots on the suit's shadow side, never a dark hatch
  float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
  c += vec3(1.0, 0.95, 0.85) * rim * 0.28;
  outgoingLight = c;
}
#include <opaque_fragment>`)
      // The lenses after lighting: bright white with a faint cool shade, never grey.
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
${SHADOW_ALPHA}
	gl_FragColor.rgb = mix(gl_FragColor.rgb, uLens * (0.92 + 0.08 * clamp(vBind.y * 6.0 - 9.9, 0.0, 1.0)), gLens);
	if (gLens > 0.5) gl_FragColor.a = 0.0;`);
  };
  mat.customProgramCacheKey = () => 'suit-v5';
  return mat;
}

export function setSuit(hero, suit) {
  const u = hero.suitMat.userData.suit;
  u.uRed.value.set(suit.red); u.uBlue.value.set(suit.blue); u.uBlack.value.set(suit.black); u.uLens.value.set(suit.lens);
}

export const COM_HEIGHT = 0.9; // the physics body's position is this far above the feet

// The mask: blend the head's face sculpt (nose, brows, lips) onto a smooth ellipsoid, so the head
// reads as a mask pulled over a skull, not a face. Positions and normals are bind-space, before
// skinning, so the head still turns and nods with its bones.
const MASK = { cx: 0, cy: 1.69, cz: 0.0, rx: 0.091, ry: 0.124, rz: 0.104, from: 1.555, to: 1.6 };
export function smoothHead(geometry) {
  const g = geometry.clone();
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const m = MASK;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < m.from || Math.abs(x) > 0.16) continue;
    const t = Math.min(1, (y - m.from) / (m.to - m.from));
    const w = t * t * (3 - 2 * t);
    const ex = (x - m.cx) / m.rx, ey = (y - m.cy) / m.ry, ez = (z - m.cz) / m.rz;
    const l = Math.hypot(ex, ey, ez) || 1;
    const px = m.cx + (ex / l) * m.rx, py = m.cy + (ey / l) * m.ry, pz = m.cz + (ez / l) * m.rz;
    pos.setXYZ(i, x + (px - x) * w, y + (py - y) * w, z + (pz - z) * w);
    // Ellipsoid normal: gradient of (x/rx)^2 + (y/ry)^2 + (z/rz)^2.
    let gx = (px - m.cx) / (m.rx * m.rx), gy = (py - m.cy) / (m.ry * m.ry), gz = (pz - m.cz) / (m.rz * m.rz);
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    const nx = nrm.getX(i) + (gx - nrm.getX(i)) * w, ny = nrm.getY(i) + (gy - nrm.getY(i)) * w, nz = nrm.getZ(i) + (gz - nrm.getZ(i)) * w;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(i, nx / nl, ny / nl, nz / nl);
  }
  pos.needsUpdate = true; nrm.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

export function buildHeroModel(assets, suit = SUIT_CLASSIC) {
  const root = new THREE.Group();
  root.name = 'hero';
  // root (at the centre of mass) -> orient (whole-body rotation about the centre of mass) -> model
  const orient = new THREE.Group();
  root.add(orient);
  const model = SkeletonUtils.clone(assets.body);
  model.position.y = -COM_HEIGHT;
  orient.add(model);
  const suitMat = suitMaterial(suit);
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    // The eye and brow meshes stay: smoothed onto the mask and painted by the suit shader, they fill
    // the body's eye holes as white lens.
    o.material = suitMat;
    o.geometry = smoothHead(o.geometry);
    o.castShadow = true;
    o.frustumCulled = false;
  });
  const bone = (n) => model.getObjectByName(n);
  return {
    root, orient, model, suitMat,
    animator: createAnimator(model, assets.clips),
    bones: {
      upperarmR: bone('upperarm_r'), lowerarmR: bone('lowerarm_r'), handR: bone('hand_r'),
      upperarmL: bone('upperarm_l'), lowerarmL: bone('lowerarm_l'), handL: bone('hand_l'),
      thighL: bone('thigh_l'), calfL: bone('calf_l'), footL: bone('foot_l'),
      thighR: bone('thigh_r'), calfR: bone('calf_r'), footR: bone('foot_r'),
      spine: bone('spine_03'), head: bone('Head'), pelvis: bone('pelvis'),
    },
  };
}
