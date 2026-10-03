import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { LAYER_FX } from './layers.js';

let gradient = null;

// Three hard bands: shadow, mid, lit.
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([112, 112, 112, 255, 182, 182, 182, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toonMaterial({
  color = 0xffffff, map = null, normalMap = null, normalScale = 1, vertexColors = false,
  emissive = 0x000000, emissiveMap = null, emissiveIntensity = 1, side = THREE.FrontSide,
  palette = null, stripes = null,
} = {}) {
  const mat = new THREE.MeshToonMaterial({
    color, map, normalMap, vertexColors, emissive, emissiveMap, emissiveIntensity, side,
    gradientMap: toonGradient(),
  });
  if (normalMap) mat.normalScale.set(normalScale, normalScale);
  if (palette) posterize(mat, palette, stripes);
  return mat;
}

// Snap interpolated vertex colors to the nearest palette entry so region edges are crisp,
// and optionally stripe one region using the bind-pose height.
function posterize(mat, palette, stripes) {
  const pal = [...new Set(palette)].map((h) => new THREE.Color(h));
  const stripeIdx = stripes ? pal.findIndex((c) => c.equals(new THREE.Color(stripes.color))) : -1;
  const period = (stripes?.period ?? 1).toFixed(4);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPal = { value: pal };
    shader.uniforms.uStripeAlt = { value: new THREE.Color(stripes?.alt ?? 0) };
    shader.vertexShader = 'varying float vBindY;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBindY = position.y;');
    shader.fragmentShader = `#define PAL_N ${pal.length}\n#define STRIPE_IDX ${stripeIdx}\n`
      + 'uniform vec3 uPal[PAL_N];\nuniform vec3 uStripeAlt;\nvarying float vBindY;\n'
      + shader.fragmentShader.replace('#include <color_fragment>', `
	vec3 best = uPal[0];
	float bestD = 1e9;
	int bestI = 0;
	for (int i = 0; i < PAL_N; i++) {
		vec3 d = vColor.rgb - uPal[i];
		float dd = dot(d, d);
		if (dd < bestD) { bestD = dd; best = uPal[i]; bestI = i; }
	}
	if (bestI == STRIPE_IDX && fract(vBindY / ${period}) > 0.5) best = uStripeAlt;
	diffuseColor.rgb *= best;`);
  };
  mat.customProgramCacheKey = () => `pal-${pal.length}-${stripeIdx}-${period}`;
}

// Inverted-hull ink line (LAYER_FX). Not used yet; when block 4 adds it to heroes it should mark
// its aux texel as a character, or the ink pass reads its flat normal as a crease.
export function addHullOutline(mesh, width = 0.011, color = PALETTE.ink) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.userData.outline = { value: width };
  const skinned = mesh.isSkinnedMesh;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = mat.userData.outline;
    shader.vertexShader = 'uniform float uOutline;\n' + (skinned
      ? shader.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n\ttransformed += normalize(objectNormal) * uOutline;')
      : shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normalize(normal) * uOutline;'));
  };
  mat.customProgramCacheKey = () => (skinned ? 'hull-skinned' : 'hull-static');
  const hull = skinned ? new THREE.SkinnedMesh(mesh.geometry, mat) : new THREE.Mesh(mesh.geometry, mat);
  if (skinned) hull.bind(mesh.skeleton, mesh.bindMatrix);
  hull.layers.set(LAYER_FX);
  hull.frustumCulled = false;
  hull.castShadow = false;
  mesh.add(hull);
  return hull;
}
