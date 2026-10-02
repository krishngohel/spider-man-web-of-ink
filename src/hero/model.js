import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toonGradient } from '../render/toon.js';
import { PALETTE } from '../render/palette.js';

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
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uRed, uBlue, uBlack, uLens;
varying vec3 vBind;
const float TAU = 6.2831853;
float lineAA(float f) {
  float d = min(f, 1.0 - f);
  float w = fwidth(f) * 1.1 + 0.002;
  return 1.0 - smoothstep(0.0, w, d);
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float spider(vec2 q) {
  float d = length((q - vec2(0.0, -0.012)) / vec2(0.016, 0.027)) - 1.0;
  d = min(d * 0.016, length(q - vec2(0.0, 0.026)) - 0.012);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y0 = 0.018 - fi * 0.012;
    vec2 knee = vec2(0.05, 0.035 - fi * 0.028);
    vec2 foot = vec2(0.075, 0.075 - fi * 0.06);
    vec2 a = vec2(abs(q.x), q.y);
    d = min(d, sdSeg(a, vec2(0.0, y0), knee) - 0.0032);
    d = min(d, sdSeg(a, knee, foot) - 0.0026);
  }
  return d;
}
vec3 paintSuit(vec3 p) {
  float ax = abs(p.x);
  bool red; float lines = 0.0;
  if (p.y > 1.5) {
    red = true;
    vec3 dir = normalize(p - vec3(0.0, 1.665, 0.0));
    float phi = atan(dir.y, dir.x) / TAU + 0.5;
    float th = acos(clamp(dir.z, -1.0, 1.0));
    lines = max(lineAA(fract(phi * 16.0)), lineAA(fract(th / 0.3)));
  } else if (ax < 0.22 && p.y > 0.93) {
    red = ax < 0.11 + 0.06 * smoothstep(1.22, 1.44, p.y) || p.y > 1.43 || p.y < 0.99;
    vec2 c = p.xy - vec2(0.0, 1.30);
    lines = max(lineAA(fract((atan(c.y, c.x) / TAU + 0.5) * 16.0)), lineAA(fract(length(c) / 0.055)));
  } else if (ax >= 0.22) {
    red = ax > 0.47 || p.y > 1.455;
    float phi = atan(p.z + 0.065, p.y - 1.455) / TAU + 0.5;
    lines = max(lineAA(fract(ax / 0.06)), lineAA(fract(phi * 8.0)));
  } else {
    red = p.y < 0.36;
    float phi = atan(p.z + 0.04, p.x - sign(p.x) * 0.114) / TAU + 0.5;
    lines = max(lineAA(fract(p.y / 0.06)), lineAA(fract(phi * 8.0)));
  }
  vec3 col = red ? uRed : uBlue;
  if (red) col = mix(col, uBlack, lines * 0.9);
  // Chest spider, front only.
  if (p.z > 0.05 && p.y > 1.2 && p.y < 1.52 && ax < 0.12) {
    float d = spider(vec2(p.x, p.y - 1.36));
    col = mix(col, uBlack, 1.0 - smoothstep(0.0, fwidth(d) * 1.2 + 0.0005, d));
  }
  // Eye lenses: a white teardrop each side, thick black rim.
  if (p.y > 1.62 && p.z > 0.035) {
    for (int s = 0; s < 2; s++) {
      float sx = s == 0 ? -1.0 : 1.0;
      vec2 q = vec2(p.x - sx * 0.037, p.y - 1.693);
      float a = sx * 0.5;
      q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
      float e = length(q / vec2(0.031, 0.0185));
      float aa = fwidth(e) * 1.2;
      col = mix(col, uBlack, 1.0 - smoothstep(1.32, 1.32 + aa, e));
      col = mix(col, uLens, 1.0 - smoothstep(1.0, 1.0 + aa, e));
    }
  }
  return col;
}
`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb = paintSuit(vBind);');
  };
  mat.customProgramCacheKey = () => 'suit-v1';
  return mat;
}

export function setSuit(hero, suit) {
  const u = hero.suitMat.userData.suit;
  u.uRed.value.set(suit.red); u.uBlue.value.set(suit.blue); u.uBlack.value.set(suit.black); u.uLens.value.set(suit.lens);
}

export const COM_HEIGHT = 0.9; // the physics body's position is this far above the feet

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
    if (o.name.startsWith('Face')) { o.visible = false; return; }
    o.material = suitMat;
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
