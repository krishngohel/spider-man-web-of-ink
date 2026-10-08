import * as THREE from 'three';
import { AUX_DECL, AUX_WRITE_NONE } from '../render/gbuffer.js';
import { LAYER_FX } from '../render/layers.js';

// Reflections of the street lamps and neon on a wet road (ported from Gotham): each light gets a
// streak on the ground stretching toward the camera, broken into horizontal slivers like an inked
// puddle. One instanced draw for the whole city; strength follows the rain (and a little at night).
const vertexShader = /* glsl */ `
attribute vec3 aBase;
attribute vec3 aColor;
attribute vec4 aShape; // width, max length, strength, light height
uniform float uWet;
varying vec2 vUv;
varying vec3 vColor;
varying float vFade;
varying float vLen;
void main() {
  vec2 toCam = cameraPosition.xz - aBase.xz;
  float dist = max(length(toCam), 0.01);
  vec2 dir = toCam / dist;
  vec2 side = vec2(-dir.y, dir.x);
  float camH = max(cameraPosition.y - aBase.y, 0.3);
  // Where the mirror image of the light lands, and a streak that grows as the view grazes.
  float center = dist * aShape.w / (aShape.w + camH);
  float len = clamp(center * 1.3, 1.2, aShape.y);
  float along = center + (position.y - 0.5) * len;
  vec2 p = aBase.xz + dir * along + side * position.x * aShape.x * (0.6 + 0.4 * position.y);
  vec4 mv = viewMatrix * vec4(p.x, aBase.y + 0.04, p.y, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vFade = uWet * aShape.z * (1.0 - smoothstep(90.0, 170.0, d)) * smoothstep(0.5, 2.5, dist);
  vUv = position.xy;
  vColor = aColor;
  vLen = len;
}`;
const fragmentShader = /* glsl */ `${AUX_DECL}
varying vec2 vUv;
varying vec3 vColor;
varying float vFade;
varying float vLen;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float y = vUv.y * vLen * 2.6;
  float band = floor(y);
  float h1 = hash(band * 3.1 + 0.7), h2 = hash(band * 7.7 + 1.3);
  float gap = step(0.1 + 0.4 * h1 * h1, fract(y));
  float halfW = mix(0.15, 1.0, h2 * h2) * (1.0 - 0.5 * vUv.y);
  float x = abs(vUv.x + (h1 - 0.5) * 0.5);
  float across = 1.0 - step(halfW, x);
  float ends = smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  float a = across * ends * gap * vFade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * a, 1.0);
  ${AUX_WRITE_NONE}
}`;

export function createWetStreaks(sources) {
  const base = new THREE.PlaneGeometry(2, 1, 1, 4).translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  const n = sources.length;
  const aBase = new Float32Array(n * 3), aColor = new Float32Array(n * 3), aShape = new Float32Array(n * 4);
  sources.forEach((s, i) => {
    aBase.set([s.x, s.y ?? 0, s.z], i * 3);
    aColor.set(s.color, i * 3);
    aShape.set([s.w ?? 0.8, s.len ?? 8, s.k ?? 0.5, s.h ?? 6], i * 4);
  });
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(aBase, 3));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
  geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(aShape, 4));
  geo.instanceCount = n;
  const wet = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uWet: wet }, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_FX);
  mesh.renderOrder = 3;
  mesh.userData.setWet = (v) => { wet.value = v; mesh.visible = v > 0.01; };
  return mesh;
}
