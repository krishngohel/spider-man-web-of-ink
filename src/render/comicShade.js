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
export const SHADE_UNIFORMS = { uLightLevel: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } };
export const addShadeUniforms = (shader) => Object.assign(shader.uniforms, SHADE_UNIFORMS);

export const COMIC_SHADE = /* glsl */ `
uniform float uLightLevel;
uniform vec3 uTint;
float gShadow = 0.0;
vec3 comicShade(vec3 alb, vec3 lit, vec3 shadowTone, vec3 midTone, vec3 lightTone) {
  const vec3 W = vec3(0.299, 0.587, 0.114);
  float ratio = dot(lit, W) / max(dot(alb, W), 1e-3) / max(uLightLevel, 0.05);
  float t1 = smoothstep(0.5, 0.56, ratio), t2 = smoothstep(0.86, 0.92, ratio);
  gShadow = 1.0 - t1;
  vec3 shade = mix(shadowTone, midTone, t1);
  return alb * mix(shade, lightTone, t2) * uTint;
}
vec3 comicShade(vec3 alb, vec3 lit) {
  return comicShade(alb, lit, vec3(0.56, 0.5, 0.68), vec3(0.86, 0.86, 0.9), vec3(1.07, 1.03, 0.96));
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
      .replace('#include <opaque_fragment>', 'outgoingLight = comicShade(diffuseColor.rgb, outgoingLight);' + String.fromCharCode(10) + '#include <opaque_fragment>')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>${SHADOW_ALPHA}`);
  };
  const key = 'comic-toon-v2' + (hooks ? `-${hooks.key ?? (hooks.vertexBegin ?? '').length + (hooks.fragmentColor ?? '').length}` : '');
  mat.customProgramCacheKey = () => key;
  return mat;
}
