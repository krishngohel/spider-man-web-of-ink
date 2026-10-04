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

// Smoothed normals for the outline (spec G6): vertices that share a position (split for hard
// edges and UV seams) share one averaged normal, so the pushed-out hull never cracks at a seam.
// Stored as a `smoothNormal` attribute; done once per geometry.
export function bakeSmoothNormals(geo) {
  if (geo.attributes.smoothNormal) return geo;
  const p = geo.attributes.position, n = geo.attributes.normal;
  const key = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  const acc = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = key(i), a = acc.get(k) ?? [0, 0, 0];
    a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
    acc.set(k, a);
  }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  geo.setAttribute('smoothNormal', new THREE.BufferAttribute(out, 3));
  return geo;
}

// The screen size every hull is measured in, in CSS pixels (set by the ink pass on resize), so
// a 3 px line is 3 px on a Retina screen too.
export const HULL_UNIFORMS = { uHullRes: { value: new THREE.Vector2(1920, 1080) } };

// Inverted-hull ink outline (spec G6, as Hi-Fi Rush draws its characters): the back faces pushed
// out along the skinned smooth normal by a width in screen pixels, about 2.2 px close and 0.9 px at
// 40 m, so a far figure keeps a thin clean line instead of a black blob. LAYER_FX (colour pass).
// Skinned, so its aux texel is flagged as a character and the ink pass draws no creases there.
export function addHullOutline(mesh, { px = 2.2, far = 0.9, color = PALETTE.ink } = {}) {
  bakeSmoothNormals(mesh.geometry);
  // The body it outlines tells the ink pass it is outlined (no creases drawn on it).
  for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    if (!m.defines?.AUX_HULLED) { m.defines = { ...(m.defines ?? {}), AUX_HULLED: '' }; m.needsUpdate = true; }
  }
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.defines = { AUX_HULLED: '' };
  const skinned = mesh.isSkinnedMesh;
  mat.userData.hull = { uHullPx: { value: px }, uHullFar: { value: far } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, HULL_UNIFORMS, mat.userData.hull);
    shader.vertexShader = 'uniform vec2 uHullRes;\nuniform float uHullPx, uHullFar;\nattribute vec3 smoothNormal;\nvarying float vHullFacing;\n' + shader.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = smoothNormal;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
      .replace('#include <project_vertex>', `#include <project_vertex>
  {
    if (-mvPosition.z < 0.4) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // camera inside: drop it
    vec3 hn = normalize(normalMatrix * objectNormal);
    vHullFacing = dot(hn, normalize(-mvPosition.xyz));
    vec2 dir = (projectionMatrix * vec4(hn, 0.0)).xy;
    float dl = length(dir);
    if (dl > 1e-5) {
      float w = mix(uHullPx, uHullFar, smoothstep(4.0, 40.0, -mvPosition.z));
      gl_Position.xy += dir / dl * w * 2.0 / uHullRes * gl_Position.w;
    }
  }`);
    // The outline is the shell's back faces just past the silhouette, which face across the view.
    // Back faces turned right away from the camera are the far side of the shell seen through a
    // hole in the mesh; ones whose normal faces the camera are folds flipped inside out (the eyelids
    // and lips smoothed onto the mask). Neither is an outline.
    shader.fragmentShader = 'varying float vHullFacing;\n' + shader.fragmentShader.replace('void main() {', 'void main() {\n  if (vHullFacing < -0.4 || vHullFacing > 0.3) discard;');
    if (!skinned) shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 objectNormal = smoothNormal;');
  };
  mat.customProgramCacheKey = () => (skinned ? 'hull-px2-skinned' : 'hull-px2-static');
  const hull = skinned ? new THREE.SkinnedMesh(mesh.geometry, mat) : new THREE.Mesh(mesh.geometry, mat);
  if (skinned) hull.bind(mesh.skeleton, mesh.bindMatrix);
  hull.layers.set(LAYER_FX);
  hull.frustumCulled = false;
  hull.castShadow = false;
  hull.renderOrder = 1;
  mesh.add(hull);
  return hull;
}
