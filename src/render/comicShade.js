import * as THREE from 'three';
import { toonGradient } from './toon.js';

// The one comic shading rule every lit material shares (buildings, ground, props, the suit):
// three flat tones read off the lighting, shadows a darker, slightly violet shade of the same hue
// (a colourist's shadow, not a blue wash). It also records how deep in shadow the pixel is in
// gShadow, which the material writes to the colour buffer's alpha (SHADOW_ALPHA) so the ink pass
// can lay Ben-Day dots and hatching inside the real shadow shapes. Alpha below 0.5 stays reserved
// for "no ink here" (the suit's lenses).

// The light of the hour, shared by every material: how bright the world is (so a dark night still
// reads in three tones instead of falling wholly into shadow) and the colour of the light (warm at
// golden hour, blue at night). Set once a frame by the game; each material adds these uniforms.
// uPattern: 1 prints hatching and dots on surfaces, 0 turns them off (the low quality preset).
// uShadowVol / uShadowBox: the city's shadow colour volume (render/shadowVolume.js); until the
// city is built it is one texel of the base violet.
const baseVol = new THREE.Data3DTexture(new Uint8Array([143, 128, 173, 255]), 1, 1, 1);
baseVol.needsUpdate = true;
export const SHADE_UNIFORMS = {
  uLightLevel: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) }, uPattern: { value: 1 },
  uShadowVol: { value: baseVol }, uShadowBox: { value: new THREE.Vector4(-1000, -1000, 2000, 2000) }, uShadowTop: { value: 260 },
};
export function setShadowVolume(vol) {
  const tex = new THREE.Data3DTexture(vol.data, 16, 8, 16);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  SHADE_UNIFORMS.uShadowVol.value = tex;
  SHADE_UNIFORMS.uShadowBox.value.set(vol.box[0], vol.box[1], vol.box[2], vol.box[3]);
  SHADE_UNIFORMS.uShadowTop.value = vol.top;
}
export const addShadeUniforms = (shader) => Object.assign(shader.uniforms, SHADE_UNIFORMS);

export const COMIC_SHADE = /* glsl */ `
uniform float uLightLevel, uPattern, uShadowTop;
uniform vec3 uTint;
uniform highp sampler3D uShadowVol;
uniform vec4 uShadowBox;
float gShadow = 0.0;   // 1 in core shadow
float gMid = 0.0;      // 1 in the band where the light falls off (between shadow and full light)
float gDeep = 0.0;     // 1 in the darkest shadow (facing away and in cast shadow)
vec3 comicShade(vec3 alb, vec3 lit, vec3 shadowTone, vec3 midTone, vec3 lightTone) {
  const vec3 W = vec3(0.299, 0.587, 0.114);
  float ratio = dot(lit, W) / max(dot(alb, W), 1e-3) / max(uLightLevel, 0.05);
  float t1 = smoothstep(0.5, 0.56, ratio), t2 = smoothstep(0.86, 0.92, ratio);
  gShadow = 1.0 - t1;
  gMid = smoothstep(0.56, 0.62, ratio) * (1.0 - smoothstep(0.68, 0.78, ratio));
  gDeep = 1.0 - smoothstep(0.26, 0.34, ratio);
  vec3 shade = mix(shadowTone, midTone, t1);
  return alb * mix(shade, lightTone, t2) * uTint;
}

// The print pattern (spec G4), drawn on the surface itself in world units, so it never swims as
// the camera moves: diagonal hatching only in core shadow (crossed in the deepest), Ben-Day dots
// only where the light falls off, nothing in full light. The scale snaps to powers of two of the
// metres a pixel covers and crossfades between the two nearest, so a cell stays about 7 pixels
// at any distance (a TAM pyramid done procedurally); it fades out far away. Characters (skinned)
// keep clean flat tones. Marks the pixel as patterned for the ink pass.
float comicLines(float f, float w) {
  float aa = fwidth(f) * 0.9;
  return 1.0 - smoothstep(w - aa, w + aa, abs(fract(f) - 0.5));
}
float comicDots(vec2 cell, float r) {
  vec2 c = mat2(0.7071, -0.7071, 0.7071, 0.7071) * cell;
  float d = length(fract(c) - 0.5);
  float aa = fwidth(d) * 0.9 + 1e-4;
  return 1.0 - smoothstep(r - aa, r + aa, d);
}
vec3 comicPattern(vec3 c) {
#ifdef USE_SKINNING
  return c;
#else
  gAuxFlags = 0.5;
  if (gShadow < 0.02 && gMid < 0.02) return c;
  vec3 wp = vAuxWPos;
  vec3 n = abs(normalize(cross(dFdx(wp), dFdy(wp))));
  vec2 uv = n.x > n.y && n.x > n.z ? wp.zy : n.y > n.z ? wp.xz : wp.xy;
  float pw = max(length(fwidth(uv)), 1e-4);
  float lv = log2(pw * 7.0), l0 = floor(lv), k = lv - l0;
  float s0 = exp2(l0), s1 = s0 * 2.0;
  float fade = (1.0 - smoothstep(0.16, 0.4, pw)) * uPattern;
  if (fade <= 0.0) return c;
  const vec3 INK = vec3(0.006, 0.005, 0.012);
  if (gShadow > 0.02) {
    // Hatching is spaced wider than the dots (about 11 px), so a big shadow reads as a tone with
    // texture rather than a wall of lines.
    float hl = log2(pw * 11.0), h0 = floor(hl), hk = hl - h0;
    float hs0 = exp2(h0), hs1 = hs0 * 2.0;
    float h = mix(comicLines((uv.x + uv.y) / hs0, 0.12), comicLines((uv.x + uv.y) / hs1, 0.12), hk);
    float h2 = mix(comicLines((uv.x - uv.y) / hs0, 0.1), comicLines((uv.x - uv.y) / hs1, 0.1), hk);
    float hatch = max(h, h2 * gDeep) * smoothstep(0.55, 0.85, gShadow) * fade;
    c = mix(c, mix(c * 0.5, INK, 0.35), hatch * 0.5);
  }
  if (gMid > 0.02) {
    float r = 0.26 * sqrt(gMid);
    float dots = mix(comicDots(uv / s0, r), comicDots(uv / s1, r), k) * fade;
    c = mix(c, c * 0.74, dots * 0.75);
  }
  return c;
#endif
}
// The city's own shadow colour where this pixel stands (spec G5), with a value floor: a shadow is a
// darker, coloured shade of the surface, never black.
vec3 comicShade(vec3 alb, vec3 lit) {
  vec3 q = vec3((vAuxWPos.x - uShadowBox.x) / uShadowBox.z, clamp(vAuxWPos.y / uShadowTop, 0.0, 1.0), (vAuxWPos.z - uShadowBox.y) / uShadowBox.w);
  vec3 tone = texture(uShadowVol, q).rgb;
  vec3 c = comicShade(alb, lit, tone, vec3(0.86, 0.86, 0.9), vec3(1.07, 1.03, 0.96));
  return max(c, alb * 0.35 * uTint);
}
`;

// Goes after everything else in the fragment shader (fog and tone mapping leave alpha alone).
export const SHADOW_ALPHA = /* glsl */ `
	gl_FragColor.a = 1.0 - 0.45 * gShadow;`;

// A plain toon material (props, trees, water towers, crowds) shaded by the same comic rule.
// hooks (optional): vertexHead / vertexBegin (vertex animation after begin_vertex),
// fragmentHead / fragmentColor (colour changes after color_fragment), key (program cache).
export function comicToon(params, hooks = null) {
  const mat = new THREE.MeshToonMaterial({ ...params, gradientMap: toonGradient() });
  mat.onBeforeCompile = (shader) => {
    addShadeUniforms(shader);
    if (hooks?.vertexHead) shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
${hooks.vertexHead}`);
    if (hooks?.vertexBegin) shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
${hooks.vertexBegin}`);
    if (hooks?.fragmentHead) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
${hooks.fragmentHead}`);
    if (hooks?.fragmentColor) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
${hooks.fragmentColor}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${COMIC_SHADE}`)
      .replace('#include <opaque_fragment>', 'outgoingLight = comicPattern(comicShade(diffuseColor.rgb, outgoingLight));' + String.fromCharCode(10) + '#include <opaque_fragment>')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>${SHADOW_ALPHA}`);
  };
  const key = 'comic-toon-v4' + (hooks ? `-${hooks.key ?? (hooks.vertexBegin ?? '').length + (hooks.fragmentColor ?? '').length}` : '');
  mat.customProgramCacheKey = () => key;
  return mat;
}
