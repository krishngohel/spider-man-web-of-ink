import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toonGradient } from '../render/toon.js';
import { COMIC_SHADE, SHADOW_ALPHA, addShadeUniforms } from '../render/comicShade.js';
import { comicToon } from '../render/comicShade.js';
import { smoothHead, createAnimator, COM_HEIGHT } from '../hero/model.js';

// Enemy bodies: the hero's CC0 body wearing a faction outfit painted by a shader from the bind
// pose (no textures), plus a weapon or gear prop on a bone. One material per faction and look, so
// a crowd of thugs costs a handful of programs.

// Outfits: jacket, trousers, shoes, skin, head (hair, cap, mask or helmet) and an accent colour.
// head: 0 hair, 1 beanie, 2 balaclava, 3 helmet with visor, 4 fedora band, 5 bald.
export const FACTIONS = {
  street: { name: 'Street gang', looks: [
    { jacket: 0x7a2f8a, pants: 0x2b3b5a, shoes: 0xeeeeee, skin: 0.35, head: 1, hat: 0x2a2a2a, accent: 0xf2c230 },
    { jacket: 0xd8392b, pants: 0x2b2b33, shoes: 0x2b2b33, skin: 0.7, head: 0, hat: 0x1a1210, accent: 0xffffff },
    { jacket: 0x3f8f5a, pants: 0x4a4a52, shoes: 0xd8392b, skin: 0.15, head: 2, hat: 0x1a1a1a, accent: 0xf2c230 },
  ] },
  kingpin: { name: 'Fisk muscle', looks: [
    { jacket: 0x25272f, pants: 0x25272f, shoes: 0x111111, skin: 0.3, head: 5, hat: 0x111111, accent: 0xf4f4f4, shades: 1 },
    { jacket: 0x33363f, pants: 0x25272f, shoes: 0x111111, skin: 0.65, head: 0, hat: 0x1a1210, accent: 0xf4f4f4, shades: 1 },
  ] },
  maggia: { name: 'Maggia', looks: [
    { jacket: 0x5a4636, pants: 0x3a2e26, shoes: 0x1a1210, skin: 0.25, head: 4, hat: 0x2a2018, accent: 0xc8a050 },
    { jacket: 0x4a4a52, pants: 0x2e2e34, shoes: 0x1a1210, skin: 0.4, head: 4, hat: 0x1a1a1e, accent: 0xb03030 },
  ] },
  lizard: { name: 'Lizard-men', looks: [
    { jacket: 0x4a8a3a, pants: 0x3a6a2a, shoes: 0x3a6a2a, skin: -3, head: 6, hat: 0x4a8a3a, accent: 0x9ab040, pattern: 3 },
    { jacket: 0x5a9a4a, pants: 0x3a6a2a, shoes: 0x2a4a1a, skin: -3, head: 6, hat: 0x5a9a4a, accent: 0xb0c050, pattern: 3 },
  ] },
  sable: { name: 'Silver Sable private army', looks: [
    { jacket: 0x9aa0a6, pants: 0x4a5058, shoes: 0x22252a, skin: 0.3, head: 3, hat: 0x6a7078, accent: 0xdfe6ee },
    { jacket: 0x6d7a5a, pants: 0x4a5040, shoes: 0x22252a, skin: 0.5, head: 3, hat: 0x5a6448, accent: 0xdfe6ee },
  ] },
  oscorp: { name: 'Oscorp security', looks: [
    { jacket: 0xe6e9ee, pants: 0x3a4a5e, shoes: 0x22252a, skin: 0.3, head: 3, hat: 0xd6dbe2, accent: 0x3fb4e8 },
  ] },
  sinister: { name: 'Sinister crew', looks: [
    { jacket: 0x4a2a6a, pants: 0x1e3a2a, shoes: 0x111111, skin: 0.4, head: 2, hat: 0x2a1a3a, accent: 0x5ad06a },
    { jacket: 0x2a5a3a, pants: 0x2a1a3a, shoes: 0x111111, skin: 0.2, head: 1, hat: 0x5a2a7a, accent: 0xb06ad0 },
  ] },
  kraven: { name: "Kraven's hunters", looks: [
    { jacket: 0xc89a4a, pants: 0x6a5a3a, shoes: 0x3a2a1a, skin: 0.55, head: 0, hat: 0x2a1a10, accent: 0x1a1210, spots: 1 },
  ] },
  symbiote: { name: 'Symbiote spawn', looks: [
    { jacket: 0x0e0d16, pants: 0x0e0d16, shoes: 0x0e0d16, skin: -1, head: 6, hat: 0x0e0d16, accent: 0xf4f6fb },
  ] },
};

const OUTFIT_FRAG = /* glsl */ `
uniform vec3 uJacket, uPants, uShoes, uHat, uAccent;
uniform float uSkin, uHead, uShades, uSpots, uPattern;
varying vec3 vBind;
// Skin: a tone from 0 (pale) to 1 (dark); below -1.5 the character is covered (gloves and a mask
// in the hat colour, or a lizard's hide).
vec3 skinCol() { return uSkin < -1.5 ? uHat : mix(vec3(0.95, 0.76, 0.6), vec3(0.36, 0.22, 0.14), clamp(uSkin, 0.0, 1.0)); }
vec3 paintOutfit(vec3 p) {
  float ax = abs(p.x);
  vec3 col;
  if (uSkin < -0.5 && uSkin > -1.5) {
    // Symbiote spawn: black, with white veins and big white eyes.
    col = uJacket;
    float v = abs(sin(p.y * 22.0 + sin(p.x * 30.0) * 2.0 + sin(p.z * 24.0)));
    col = mix(col, uAccent * 0.6, (1.0 - smoothstep(0.02, 0.06, v)) * 0.6);
    if (p.y > 1.62 && p.z > 0.04 && abs(ax - 0.045) < 0.035 && abs(p.y - 1.7 - (ax - 0.045) * 0.8) < 0.022) col = uAccent;
    return col;
  }
  if (p.y > 1.53) {
    col = skinCol();
    // Head gear.
    float top = smoothstep(1.7, 1.72, p.y);
    if (uHead < 0.5) col = mix(col, uHat, step(1.735, p.y + max(0.0, -p.z) * 0.6));                     // hair
    else if (uHead < 1.5) col = mix(col, uHat, step(1.7, p.y));                                            // beanie
    else if (uHead < 2.5) { col = uHat; if (p.z > 0.05 && p.y > 1.665 && p.y < 1.715) col = skinCol(); }  // balaclava
    else if (uHead < 3.5) { col = uHat; if (p.z > 0.07 && p.y > 1.64 && p.y < 1.72) col = vec3(0.08, 0.1, 0.14); } // helmet, visor
    else if (uHead < 4.5) { col = mix(col, uHat, step(1.74, p.y)); col = mix(col, uAccent, step(1.735, p.y) * step(p.y, 1.755)); } // hat band
    // Sunglasses on Fisk's men (the sculpted face keeps its own eyes and brows).
    if (uShades > 0.5 && p.z > 0.05 && p.y > 1.668 && p.y < 1.708 && ax < 0.066) col = vec3(0.06);
  } else if (ax < 0.24 && p.y > 0.93) {
    col = uJacket;
    // Open collar or tie in the accent colour down the middle front.
    if (p.z > 0.05 && ax < 0.03 + (p.y - 1.1) * 0.12 && p.y > 1.1) col = uAccent;
    if (p.y < 0.99) col = vec3(0.12);                                                       // belt
  } else if (ax >= 0.24) {
    col = ax > 0.66 ? skinCol() : uJacket;                                                  // hands
  } else {
    col = p.y < 0.1 ? uShoes : uPants;
  }
  // Villain patterns: 1 quilted diamonds, 2 lightning, 3 scales, 4 armour plates, 5 stripes.
  if (uPattern > 0.5 && p.y < 1.53) {
    if (uPattern < 1.5) { vec2 q = vec2(p.x * 9.0 + p.y * 9.0, p.y * 9.0 - p.x * 9.0); vec2 f = abs(fract(q) - 0.5); col = mix(col, col * 0.62, step(0.43, max(f.x, f.y))); }
    else if (uPattern < 2.5) { float z = abs(fract(p.y * 3.0 + abs(p.x) * 2.0) - 0.5) - abs(fract(p.x * 4.0) - 0.5) * 0.4; col = mix(col, uAccent, step(abs(z), 0.06)); }
    else if (uPattern < 3.5) { vec2 q = vec2(p.x * 22.0 + floor(p.y * 22.0) * 0.5, p.y * 22.0); vec2 f = fract(q) - 0.5; col = mix(col, col * 0.7, step(0.36, length(f))); }
    else if (uPattern < 4.5) { col = mix(col, col * 0.7, step(0.92, fract(p.y * 4.0)) + step(0.94, fract(abs(p.x) * 6.0))); }
    else { if (ax < 0.24 && p.y > 0.93) col = mix(col, uAccent, step(0.5, fract(p.y * 8.0))); }
  }
  if (uSpots > 0.5 && p.y > 0.93 && p.y < 1.53) {
    vec2 sp = vec2(p.x * 26.0 + p.z * 13.0, p.y * 26.0);
    vec2 f = fract(sp) - 0.5;
    col = mix(col, uAccent, (1.0 - smoothstep(0.18, 0.24, length(f))) * step(0.4, fract(sin(dot(floor(sp), vec2(12.9, 7.1))) * 43758.5)));
  }
  return col;
}
`;

export function outfitMaterial(look) {
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() });
  const U = {
    uJacket: { value: new THREE.Color(look.jacket) }, uPants: { value: new THREE.Color(look.pants) },
    uShoes: { value: new THREE.Color(look.shoes) }, uHat: { value: new THREE.Color(look.hat) },
    uAccent: { value: new THREE.Color(look.accent) }, uSkin: { value: look.skin }, uHead: { value: look.head ?? 0 },
    uShades: { value: look.shades ?? 0 }, uSpots: { value: look.spots ?? 0 },
    uPattern: { value: look.pattern ?? 0 }, uBodyScale: { value: new THREE.Vector3(1, 1, 1) },
  };
  mat.userData.outfit = U;
  mat.onBeforeCompile = (shader) => {
    addShadeUniforms(shader);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position * uBodyScale;')
      .replace('#include <common>', '#include <common>\nuniform vec3 uBodyScale;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${OUTFIT_FRAG}\n${COMIC_SHADE}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb = paintOutfit(vBind);')
      .replace('#include <opaque_fragment>', `{
  vec3 c = comicShade(diffuseColor.rgb, outgoingLight);
  float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
  outgoingLight = c + vec3(1.0, 0.9, 0.8) * rim * 0.12 + uHurt * vec3(0.9, 0.2, 0.15);
}
#include <opaque_fragment>`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>${SHADOW_ALPHA}`);
    shader.fragmentShader = 'uniform float uHurt;\n' + shader.fragmentShader;
    shader.uniforms.uHurt = mat.userData.hurt;
  };
  mat.userData.hurt = { value: 0 };
  mat.customProgramCacheKey = () => 'outfit-v2';
  return mat;
}

// Gear on a bone: guns, shields, bats, launchers, jetpacks.
function gear(kind) {
  const g = new THREE.Group();
  const dark = comicToon({ color: 0x2a2c30 }), metal = comicToon({ color: 0x8a929c }), wood = comicToon({ color: 0x8a5a3a }), red = comicToon({ color: 0xc03028 });
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  switch (kind) {
    case 'pistol': box(0.04, 0.12, 0.2, 0, -0.06, 0.08, dark); box(0.035, 0.08, 0.04, 0, -0.12, 0.0, dark); break;
    case 'rifle': box(0.05, 0.1, 0.75, 0, -0.06, 0.25, dark); box(0.04, 0.12, 0.05, 0, -0.14, 0.06, dark); break;
    case 'bat': { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.8, 8), wood); b.rotation.x = Math.PI / 2; b.position.set(0, -0.03, 0.4); g.add(b); break; }
    case 'shield': box(0.5, 0.75, 0.05, 0, 0, 0.12, metal); box(0.36, 0.08, 0.06, 0, 0.18, 0.13, red); break;
    case 'launcher': { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 10), comicToon({ color: 0x4a5a3a })); t.rotation.x = Math.PI / 2; t.position.set(0, 0.0, 0.2); g.add(t); break; }
    case 'jetpack': box(0.32, 0.42, 0.18, 0, 0, 0, metal); box(0.08, 0.2, 0.08, -0.1, -0.28, 0, dark); box(0.08, 0.2, 0.08, 0.1, -0.28, 0, dark); break;
    case 'whip': { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 1.4, 5), comicToon({ color: 0x3a2a1a })); w.position.set(0, -0.7, 0.1); g.add(w); break; }
    default: break;
  }
  return g;
}

export const ARCH_GEAR = { brawler: 'bat', brute: null, shield: 'shield', gunner: 'pistol', rocket: 'launcher', sniper: 'rifle', jetpack: 'jetpack', whip: 'whip' };

// Builds one enemy body. Returns the Three group (root at the centre of mass), the animator and
// the hurt flash uniform.
// Each enemy has its own material (its own hurt flash) but they all share one shader program, and
// the smoothed head geometry is shared too.
const geoCache = new Map();
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1612 });
export function buildEnemyModel(assets, faction, lookIndex, arch) {
  const f = FACTIONS[faction] ?? FACTIONS.street;
  const look = f.looks[lookIndex % f.looks.length];
  const mat = outfitMaterial(look);
  const root = new THREE.Group();
  const model = SkeletonUtils.clone(assets.body);
  model.position.y = -COM_HEIGHT;
  if (arch === 'brute') model.scale.setScalar(1.28);
  root.add(model);
  // Enemies keep the body's own sculpted face (a nose, brows and a jaw read as a person; the
  // smooth mask head is Spider-Man's). The eye meshes get a dark ink material; masked factions
  // (helmets, balaclavas, symbiotes) smooth the head instead so the gear reads clean.
  const masked = look.head === 2 || look.head === 3 || look.head === 6;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const isEyes = o.name === 'Eyes' || o.name === 'Eyebrows' || /^Face/.test(o.geometry?.name ?? '');
    if (isEyes && !masked) o.material = eyeMat;
    else o.material = mat;
    if (masked) {
      if (!geoCache.has(o.geometry)) geoCache.set(o.geometry, smoothHead(o.geometry));
      o.geometry = geoCache.get(o.geometry);
    }
    o.castShadow = true;
    o.frustumCulled = false;
  });
  const g = ARCH_GEAR[arch];
  if (g) {
    const prop = gear(g);
    const bone = model.getObjectByName(g === 'jetpack' ? 'spine_03' : g === 'shield' ? 'hand_l' : 'hand_r');
    if (g === 'jetpack') prop.position.set(0, 0.05, -0.2);
    bone.add(prop);
  }
  const animator = createAnimator(model, assets.clips);
  return { root, model, animator, hurt: mat.userData.hurt, mat };
}
