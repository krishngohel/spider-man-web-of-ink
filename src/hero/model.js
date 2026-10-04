import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toonGradient, addHullOutline } from '../render/toon.js';
import { PALETTE } from '../render/palette.js';
import { COMIC_SHADE, SHADOW_ALPHA, addShadeUniforms } from '../render/comicShade.js';

// The hero: Quaternius's CC0 superhero body (T-pose, facing +z, 1.81 m) wearing a classic suit
// painted by a shader from each fragment's bind-pose position: red head, chest, shoulders,
// forearms, gloves and boots; blue sides, under-arms and legs; black web lines over the red; the
// chest spider; big white eye lenses with black rims. No texture, so suits are cheap to swap.

export async function loadHeroAssets(base = './assets/', onProgress = () => {}) {
  const loader = new GLTFLoader();
  const names = ['hero_m.glb', 'anims1.glb', 'anims2.glb', 'hero_f.glb', 'hair_long.glb'];
  let done = 0;
  const [hero, a1, a2, heroF, hair] = await Promise.all(names.map((n) => loader.loadAsync(base + n).then((g) => { onProgress(++done / names.length); return g; })));
  const clips = new Map();
  for (const clip of [...a1.animations, ...a2.animations]) clips.set(clip.name, sanitizeClip(clip));
  return { body: hero.scene, bodyF: heroF.scene, hair: hair.scene, clips };
}

// The combat clips (kicks, flips, evades, reactions; scripts/retarget-mocap.mjs) load after the
// game is up, so the first load stays fast; until then moves fall back to the Quaternius clips.
export async function loadCombatClips(assets, base = './assets/') {
  const g = await new GLTFLoader().loadAsync(base + 'anims_combat.glb');
  for (const clip of g.animations) assets.clips.set(clip.name, sanitizeClip(clip));
  assets.combatReady = true;
  return true;
}

export const hasClip = (assets, name) => assets.clips.has(name);

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
    has(name) { return clips.has(name); },
    duration(name) { return clips.get(name)?.duration ?? 1; },
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
    uStyle: { value: suit.style ?? 0 },
    uSuitPat: { value: suit.pattern ?? 0 },
    uBodyScale: { value: new THREE.Vector3(1, 1, 1) },
  };
  mat.userData.suit = uniforms;
  mat.onBeforeCompile = (shader) => {
    addShadeUniforms(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind, vBindN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position * uBodyScale; vBindN = normal;')
      .replace('#include <common>', '#include <common>\nuniform vec3 uBodyScale;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uRed, uBlue, uBlack, uLens;
uniform float uStyle;   // 0 classic, 1 symbiote, 2 iron, 3 noir, 4 2099, 5 stealth glow, 6 negative
uniform float uSuitPat; // style 0 layouts: 0 Amazing 2 (classic), 1 Amazing 2012, 2 hoodie, 3 homemade, 4 wrestler, 5 punk stripes
float gGlow = 0.0;      // glowing lines (stealth suits), painted after lighting
${COMIC_SHADE}
varying vec3 vBind, vBindN;
const float TAU = 6.2831853;
float gLens = 0.0;
// A line at every whole number of f, about px pixels wide, antialiased.
float line1(float f, float w, float px) {
  float d = abs(f - floor(f + 0.5));
  return 1.0 - smoothstep(w * px * 0.5, w * (px * 0.5 + 1.0), d);
}
float lineAA(float f, float px) {
  float w = fwidth(f);
  // Lines packed closer than a few pixels apart (the hero small on screen) thin out the way an
  // artist simplifies a distant figure: every other line, then every fourth, never a black fill and
  // never a blank suit.
  float spacing = 1.0 / max(w, 1e-4);
  float l1 = line1(f, w, px) * smoothstep(6.0, 10.0, spacing);
  float l2 = line1(f * 0.5, w * 0.5, px) * smoothstep(3.0, 5.0, spacing);
  float l4 = line1(f * 0.25, w * 0.25, px) * smoothstep(1.5, 2.5, spacing);
  return max(l1, max(l2, l4));
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
// The Amazing-film spider: a small body and long, thin, angular legs, the front pair reaching up
// to the collarbones and the back pair down to the lower ribs.
float spiderLong(vec2 q, float s) {
  q /= s;
  float d = length(q - vec2(0.0, 0.044)) - 0.013;
  d = min(d, (length((q - vec2(0.0, 0.014)) / vec2(0.021, 0.027)) - 1.0) * 0.021);
  d = min(d, (length((q - vec2(0.0, -0.036)) / vec2(0.017, 0.044)) - 1.0) * 0.017);
  vec2 a = vec2(abs(q.x), q.y);
  d = min(d, sdSeg(a, vec2(0.008, 0.032), vec2(0.044, 0.076)) - 0.006);
  d = min(d, sdSeg(a, vec2(0.044, 0.076), vec2(0.072, 0.156)) - 0.0042);
  d = min(d, sdSeg(a, vec2(0.01, 0.02), vec2(0.066, 0.048)) - 0.006);
  d = min(d, sdSeg(a, vec2(0.066, 0.048), vec2(0.114, 0.1)) - 0.0042);
  d = min(d, sdSeg(a, vec2(0.01, 0.004), vec2(0.066, -0.01)) - 0.006);
  d = min(d, sdSeg(a, vec2(0.066, -0.01), vec2(0.11, -0.066)) - 0.0042);
  d = min(d, sdSeg(a, vec2(0.008, -0.01), vec2(0.042, -0.064)) - 0.006);
  d = min(d, sdSeg(a, vec2(0.042, -0.064), vec2(0.06, -0.162)) - 0.0042);
  return d * s;
}
// Distance to the nearest edge of a hexagon grid (cells one unit across): 0 on an edge.
float hexEdge(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec2 a = mod(p, s) - s * 0.5, b = mod(p - s * 0.5, s) - s * 0.5;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(g);
  return 0.5 - max(dot(q, s * 0.5), q.x);
}
// The raised honeycomb the Amazing suits are printed with: dark cell walls, about a centimetre
// across, mapped onto the body from three sides. Fades out before it would shimmer.
float honeycomb(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= w.x + w.y + w.z;
  vec3 c = p / 0.011;
  float e = 0.0;
  if (w.x > 0.01) { float h = hexEdge(c.zy); e += w.x * (1.0 - smoothstep(0.0, fwidth(h) * 1.5 + 0.04, h)); }
  if (w.y > 0.01) { float h = hexEdge(c.xz); e += w.y * (1.0 - smoothstep(0.0, fwidth(h) * 1.5 + 0.04, h)); }
  if (w.z > 0.01) { float h = hexEdge(c.xy); e += w.z * (1.0 - smoothstep(0.0, fwidth(h) * 1.5 + 0.04, h)); }
  float cellPx = 1.0 / max(length(fwidth(c)), 1e-4);
  return e * smoothstep(5.0, 12.0, cellPx);
}
float gLensHex = 0.0;
vec3 paintSuit(vec3 p) {
  float ax = abs(p.x);
  bool red; float lines = 0.0;
  vec2 f = vec2(0.0); // the two web-line families (whole numbers fall on a line)
  bool amazing = uStyle < 0.5;
  if (p.y > 1.53) {
    // Mask: web lines radiate from between the eyes over the whole head, crossed by rings.
    red = true;
    vec3 c = vec3(0.0, 1.69, 0.0);
    vec3 dir = normalize(p - c);
    float phi = (atan(dir.y, dir.x) / TAU + 0.5) * 16.0;
    float th = acos(clamp(dir.z, -1.0, 1.0)) / 0.26;
    f = vec2(phi, th);
  } else if (ax < 0.24 && p.y > 0.93) {
    // Torso: a red bib from the shoulders, narrowing to the waist; blue sides from the armpits.
    float bib = mix(0.07, 0.165, smoothstep(1.0, 1.42, p.y));
    red = ax < bib || p.y > 1.44 || p.y < 0.985;
    vec2 c = p.xy - vec2(0.0, 1.34);
    f = vec2((atan(c.y, c.x) / TAU + 0.5) * 18.0, length(c) / 0.06);
  } else if (ax >= 0.24) {
    // Arms: red over the top and outside, blue underneath the upper arm, red forearms and gloves.
    red = ax > 0.45 || p.y > 1.448;
    float phi = (atan(p.z + 0.065, p.y - 1.455) / TAU + 0.5) * 8.0;
    f = vec2(ax / 0.065, phi);
  } else {
    // Legs blue; red boots to mid-calf, the top edge dipping to a point at the front.
    float a = atan(p.z + 0.04, p.x - sign(p.x) * 0.114);
    // The Amazing boots come up to just under the knee.
    float bootTop = amazing ? 0.5 - 0.07 * smoothstep(0.6, 1.0, sin(a)) : 0.43 - 0.06 * smoothstep(0.6, 1.0, sin(a));
    red = p.y < bootTop;
    if (amazing && uSuitPat < 1.5) {
      // A red stripe down the outside of each leg into the boot, and the belt's two curved points
      // over the front of the hips: the shapes that read as the Amazing suit from across a street.
      float ox = (p.x - sign(p.x) * 0.114) * sign(p.x), oz = p.z + 0.02;
      float side = atan(oz, ox);
      if (abs(side) < mix(0.26, 0.36, smoothstep(0.9, 0.5, p.y))) red = true;
      float hip = abs(ax - 0.125);
      if (p.z > -0.01 && hip < 0.065 && p.y > 0.93 - 0.085 * (1.0 - hip / 0.065) * (1.0 - hip / 0.065)) red = true;
    }
    f = vec2(p.y / 0.065, (a / TAU + 0.5) * 8.0);
  }
  // Amazing webbing is thicker and raised: a black cord with a thin light ridge either side.
  float lw = amazing ? 2.1 : 1.4;
  lines = max(lineAA(f.x, lw), lineAA(f.y, lw));
  float ridge = amazing ? max(lineAA(f.x, lw + 2.4), lineAA(f.y, lw + 2.4)) - lines : 0.0;
  vec3 col = red ? uRed : uBlue;
  if (uStyle < 0.5) {
    // Each suit of the family has its own layout over the same body (not just new colours).
    bool webbed = red, mask = p.y > 1.53;
    vec3 lineCol = uBlack;
    if (uSuitPat > 0.5 && uSuitPat < 1.5) lineCol = vec3(0.62, 0.65, 0.72);          // 2012: raised silver webbing
    else if (uSuitPat > 1.5 && uSuitPat < 2.5) {                                        // hoodie over the suit
      if (!mask && p.y > 0.9 && ax < 0.47) { col = uBlue; webbed = false; }
      else if (!mask) { col = uRed; webbed = true; }
    } else if (uSuitPat > 2.5 && uSuitPat < 3.5) {                                      // homemade: plain cloth, a webbed mask
      webbed = mask;
    } else if (uSuitPat > 3.5 && uSuitPat < 4.5) {                                      // wrestler: dark body, red mask, gloves, boots
      if (!mask && ax < 0.45 && p.y > 0.45) col = uBlue;
      else col = uRed;
      webbed = mask;
    } else if (uSuitPat > 4.5) {                                                        // punk: torn stripes
      if (!mask) col = fract((p.y + p.x * 0.35) / 0.09) < 0.5 ? uRed : uBlue;
      webbed = mask;
    }
    // The printed honeycomb under everything (the film suits), the cells a touch lighter than their walls.
    if (uSuitPat < 1.5) { float hc = honeycomb(p, normalize(vBindN)); col *= 1.06 - 0.2 * hc; }
    if (webbed) { col = mix(col, col * 1.3 + 0.06, ridge * 0.55); col = mix(col, lineCol, lines); }
  }
  else if (uStyle < 1.5) col = uRed;                                                    // symbiote: one colour
  else if (uStyle < 2.5) { col = mix(col, col * 0.55, lines * 0.7); }                    // iron: panel seams
  else if (uStyle < 3.5) { col = mix(col, uBlack, lines * 0.55); }                       // noir: soft lines
  else if (uStyle < 4.5) {                                                                // 2099: blue, red bands
    col = uBlue;
    if (red && (ax > 0.45 || p.y < 0.45)) col = uRed;
    if (ax < 0.24 && p.y > 0.93 && ax > 0.15) col = uRed;
  }
  else if (uStyle < 5.5) { col = uRed; gGlow = lines; }                                 // stealth: glowing lines
  else if (uStyle < 6.5) { col = mix(col, uBlue, lines * (red ? 1.0 : 0.0)); }           // negative
  else {
    // Venom: black, a white spider, and a grin full of teeth under the eyes.
    col = uRed;
    if (p.y > 1.585 && p.y < 1.66 && p.z > 0.06 && ax < 0.075) {
      float mouth = 1.0 - smoothstep(0.0, 0.004, abs(p.y - 1.62 - 0.25 * ax * ax / 0.075) - 0.028);
      float teeth = step(0.5, fract(p.x * 70.0)) * step(abs(p.y - 1.62 - 0.25 * ax * ax / 0.075), 0.024);
      col = mix(col, vec3(0.55, 0.06, 0.1), mouth);
      col = mix(col, vec3(0.96), teeth * mouth);
    }
  }
  // Chest spider (black, front) and back spider (red with a black outline, bigger).
  if (p.y > 1.04 && p.y < 1.56 && ax < (amazing ? 0.24 : 0.16)) {
    if (p.z > 0.04) {
      float big = (uStyle > 0.5 && uStyle < 1.5) || uStyle > 6.5 ? 1.9 : uStyle > 3.5 && uStyle < 4.5 ? 1.6 : 1.25;
      float d = amazing ? spiderLong(vec2(p.x, p.y - 1.315), 1.3) : spider(vec2(p.x, p.y - 1.33), big);
      vec3 ec = uStyle > 3.5 && uStyle < 4.5 ? uRed : uStyle > 5.5 && uStyle < 6.5 ? uBlue : uStyle < 0.5 && uSuitPat > 1.5 && uSuitPat < 2.5 ? uRed : uBlack;
      col = mix(col, ec, 1.0 - smoothstep(0.0, fwidth(d) * 1.5, d));
      if (uStyle > 4.5 && uStyle < 5.5) gGlow = max(gGlow, 1.0 - smoothstep(0.0, fwidth(d) * 1.5, d));
    } else if (p.z < -0.04) {
      float big = (uStyle > 0.5 && uStyle < 1.5) || uStyle > 6.5 ? 2.2 : 1.7;
      float d = amazing ? spiderLong(vec2(p.x, p.y - 1.29), 1.2) : spider(vec2(p.x, p.y - 1.3), big);
      float fw = fwidth(d) * 1.5;
      if ((uStyle > 0.5 && uStyle < 1.5) || uStyle > 6.5) col = mix(col, uBlack, 1.0 - smoothstep(0.0, fw, d));
      else {
        col = mix(col, uRed, 1.0 - smoothstep(0.0, fw, d));
        float ow = amazing ? 0.0045 : 0.0035;
        col = mix(col, uStyle > 5.5 && uStyle < 6.5 ? uBlue : uBlack, 1.0 - smoothstep(ow, ow + fw, abs(d)));
      }
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
    vec2 q = vec2(abs(yaw) * 0.097 - 0.058, pitch * 0.124 - 0.028);
    float a = 0.42;
    q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q; // into the tilted lens frame (outer end up)
    vec2 lq = q;
    // Teardrop: full and round at the outer end, narrowing toward the nose.
    vec2 r = vec2(0.054, 0.037);
    float k = clamp(-q.x / r.x, 0.0, 1.0);
    q.y /= 1.0 - 0.4 * k * k;
    // Flatter along the top, the outer corner squared off a little: the film lens, not a comic oval.
    q.y *= q.y > 0.0 ? 1.0 + 0.25 * smoothstep(-0.01, 0.04, q.x) : 1.0;
    float e = length(q / r);
    float aa = min(fwidth(e) * 1.5, 0.06); // capped: the eyelid folds smoothed onto the mask are slivers with huge derivatives
    col = mix(col, uBlack, 1.0 - smoothstep(1.24, 1.24 + aa, e));
    gLens = max(gLens, 1.0 - smoothstep(1.0, 1.0 + aa, e));
    float h = hexEdge(lq / 0.0045);
    gLensHex = (1.0 - smoothstep(0.0, fwidth(h) * 1.5 + 0.05, h)) * smoothstep(4.0, 10.0, 1.0 / max(fwidth(lq.x / 0.0045), 1e-4));
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
  #if NUM_DIR_LIGHTS > 0
  rim *= smoothstep(0.0, 0.3, dot(normal, directionalLights[0].direction));
  #endif
  c += vec3(1.0, 0.95, 0.85) * rim * 0.34;
  #if NUM_DIR_LIGHTS > 0
  if (uStyle < 0.5 && uSuitPat < 1.5) {
    // The film suits' sheen: a small crisp highlight, not a wet patch.
    vec3 hv = normalize(directionalLights[0].direction + normalize(vViewPosition));
    c += vec3(1.0, 0.96, 0.92) * smoothstep(0.975, 0.99, dot(normal, hv)) * 0.12;
  }
  #endif
  outgoingLight = c;
}
#include <opaque_fragment>`)
      // The lenses after lighting: bright white with a faint cool shade, never grey.
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
${SHADOW_ALPHA}
	gl_FragColor.rgb = mix(gl_FragColor.rgb, uBlack * 1.3, gGlow * step(4.5, uStyle) * step(uStyle, 5.5));
	gl_FragColor.rgb = mix(gl_FragColor.rgb, uLens * (0.92 + 0.08 * clamp(vBind.y * 6.0 - 9.9, 0.0, 1.0)) * (1.0 - 0.09 * gLensHex), gLens);
	if (gLens > 0.5) gl_FragColor.a = 0.0;`);
  };
  mat.customProgramCacheKey = () => 'suit-v10';
  return mat;
}

export function setSuit(hero, suit) {
  const u = hero.suitMat.userData.suit;
  u.uRed.value.set(suit.red); u.uBlue.value.set(suit.blue); u.uBlack.value.set(suit.black); u.uLens.value.set(suit.lens);
  u.uStyle.value = suit.style ?? 0;
  u.uSuitPat.value = suit.pattern ?? 0;
}

export const COM_HEIGHT = 0.9; // the physics body's position is this far above the feet

// The mask: blend the head's face sculpt (nose, brows, lips) onto a smooth ellipsoid, so the head
// reads as a mask pulled over a skull, not a face. Positions and normals are bind-space, before
// skinning, so the head still turns and nods with its bones.
export const MASK = { cx: 0, cy: 1.69, cz: 0.0, rx: 0.091, ry: 0.124, rz: 0.104, from: 1.525, to: 1.585 };
export const MASK_F = { cx: 0, cy: 1.645, cz: 0.0, rx: 0.085, ry: 0.118, rz: 0.098, from: 1.485, to: 1.545 };
// The female body's bind positions mapped onto the male body the paint was drawn on.
export const BODY_SCALE_F = [1 / 0.94, 1.69 / 1.645, 1];
export function smoothHead(geometry, m = MASK) {
  const g = geometry.clone();
  const pos = g.attributes.position, nrm = g.attributes.normal;
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

export function buildHeroModel(assets, suit = SUIT_CLASSIC, { female = false, scale = null } = {}) {
  const root = new THREE.Group();
  root.name = 'hero';
  // root (at the centre of mass) -> orient (whole-body rotation about the centre of mass) -> model
  const orient = new THREE.Group();
  root.add(orient);
  const model = SkeletonUtils.clone(female ? assets.bodyF : assets.body);
  model.position.y = -COM_HEIGHT;
  if (scale) model.scale.set(scale[0], scale[1], scale[2]);
  orient.add(model);
  const suitMat = suitMaterial(suit);
  if (female) suitMat.userData.suit.uBodyScale.value.set(...BODY_SCALE_F);
  const hulls = [];
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    // The eye and brow meshes stay: smoothed onto the mask and painted by the suit shader, they fill
    // the body's eye holes as white lens.
    o.material = suitMat;
    o.geometry = smoothHead(o.geometry, female ? MASK_F : MASK);
    o.castShadow = true;
    o.frustumCulled = false;
    if (o.name !== 'Eyes' && o.name !== 'Eyebrows') hulls.push(o);
  });
  // The drawn outline (spec G6), added after the traversal so the hulls are not visited.
  const hullMeshes = hulls.map((o) => addHullOutline(o));
  const bone = (n) => model.getObjectByName(n);
  return {
    root, orient, model, suitMat, hulls: hullMeshes,
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
