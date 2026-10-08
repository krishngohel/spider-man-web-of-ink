import * as THREE from 'three';
import { AUX_DECL, AUX_WRITE_NONE } from './gbuffer.js';
import { LAYER_FX } from './layers.js';

// Halos: every small light in the city at night (street lamps, traffic signals, rooftop beacons,
// car head and tail lights) as one draw of camera-facing comic glows: a paper-white core, two hard
// bands of the light's colour and a four-point glint, additive, in the colour pass only. Sizes are
// in metres, so a lamp's halo shrinks with distance like the lamp does.
//   kind 0: always on at night; 1, 2, 3: a signal's red, amber and green (lit by the traffic cycle);
//   4: a blinking beacon.
export const HALO = { STEADY: 0, RED: 1, AMBER: 2, GREEN: 3, BLINK: 4 };

export function createHalos(max = 8000) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), info = new Float32Array(max * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 3)); // size (m), kind, phase
  geo.setDrawRange(0, 0);
  const uniforms = { uNight: { value: 0 }, uTime: { value: 0 }, uCycle: { value: 0 }, uViewH: { value: 720 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
attribute vec3 aCol; attribute vec3 aInfo;
uniform float uNight, uTime, uCycle, uViewH;
varying vec3 vCol; varying float vOn;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float kind = aInfo.y;
  // The traffic cycle (cityLife.js): avenues green 0 to 11 s of every 24, amber to 12, red after.
  float on = 1.0;
  if (kind > 0.5 && kind < 3.5) {
    float g = uCycle < 11.0 ? 3.0 : uCycle < 12.0 ? 2.0 : 1.0;
    on = abs(kind - g) < 0.5 ? 1.0 : 0.0;
  } else if (kind > 3.5) on = step(0.55, sin(uTime * 2.6 + aInfo.z * 6.2831)) ;
  float dist = -mv.z;
  vOn = on * uNight * (1.0 - smoothstep(500.0, 900.0, dist));
  vCol = aCol;
  gl_Position = projectionMatrix * mv;
  // Metres to pixels, never under 2 px (far lamps stay pin-points) nor huge right at the lens.
  gl_PointSize = vOn > 0.0 ? clamp(aInfo.x * projectionMatrix[1][1] * uViewH * 0.5 / max(dist, 0.1), 2.0, 180.0) : 0.0;
}`,
    fragmentShader: /* glsl */ `${AUX_DECL}
varying vec3 vCol; varying float vOn;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  if (r > 1.0 || vOn <= 0.0) discard;
  float core = step(r, 0.16);
  float band = 0.34 * step(r, 0.38) + 0.11 * step(r, 0.8);
  float glint = (step(abs(q.x), 0.035) + step(abs(q.y), 0.035)) * (1.0 - r) * 0.7;
  vec3 c = mix(vCol * (band + glint), vec3(1.0, 0.98, 0.92), core);
  gl_FragColor = vec4(c * vOn, 1.0);
  ${AUX_WRITE_NONE}
}`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  points.layers.set(LAYER_FX);
  const vp = new THREE.Vector4();
  points.onBeforeRender = (renderer) => { renderer.getCurrentViewport(vp); uniforms.uViewH.value = vp.w || 720; };

  let n = 0, dynFrom = 0;
  const put = (i, x, y, z, c, size, kind, phase) => {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    info[i * 3] = size; info[i * 3 + 1] = kind; info[i * 3 + 2] = phase;
  };
  return {
    points,
    uniforms,
    // A fixed light (lamps, signals, beacons); add them all before any dynamic ones.
    add(x, y, z, c, size, kind = HALO.STEADY, phase = 0) {
      if (n >= max) return;
      put(n++, x, y, z, c, size, kind, phase);
      dynFrom = n;
      geo.setDrawRange(0, n);
      for (const a of [geo.attributes.position, geo.attributes.aCol, geo.attributes.aInfo]) { a.clearUpdateRanges(); a.needsUpdate = true; }
    },
    // Moving lights (car lamps): rewritten every frame after the fixed ones.
    beginDynamic() { n = dynFrom; },
    addDynamic(x, y, z, c, size) { if (n < max) put(n++, x, y, z, c, size, HALO.STEADY, 0); },
    endDynamic() {
      geo.setDrawRange(0, n);
      // Upload only the moving part.
      for (const a of [geo.attributes.position, geo.attributes.aCol, geo.attributes.aInfo]) {
        a.clearUpdateRanges(); a.addUpdateRange(dynFrom * 3, Math.max(1, n - dynFrom) * 3); a.needsUpdate = true;
      }
    },
    update(time, cycle, night) { uniforms.uTime.value = time; uniforms.uCycle.value = cycle % 24; uniforms.uNight.value = night; },
  };
}
