import * as THREE from 'three';
import { LAYER_FX } from '../render/layers.js';

// Rain: inked streaks in a box that travels with the camera, falling and slanting with the wind.
// One draw call; the fall is done in the vertex shader from a start height and the time.
export function createRain(scene, count = 2600) {
  const R = 46, H = 40;
  const pos = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() * 2 - 1) * R, z = (Math.random() * 2 - 1) * R, y = Math.random() * H;
    pos.set([x, y, z, x, y, z], i * 6); // both ends start together; aEnd lifts the top one
  }
  const end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) { end[i * 2] = 0; end[i * 2 + 1] = 1; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const uniforms = { uTime: { value: 0 }, uAmount: { value: 0 }, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0xdfe8f4) } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aEnd;
      uniform float uTime, uAmount;
      uniform vec3 uCam;
      varying float vA;
      void main() {
        vec3 p = position;
        // Fall at 22 m/s, wrapping in the box; the streak is 1.1 m long, slanted by the wind.
        float y = mod(p.y - uTime * 22.0, ${H.toFixed(1)});
        vec3 w = vec3(p.x + uTime * 3.0, y, p.z);
        w.x = mod(w.x - uCam.x + ${R.toFixed(1)}, ${(2 * R).toFixed(1)}) - ${R.toFixed(1)} + uCam.x;
        w.z = mod(w.z - uCam.z + ${R.toFixed(1)}, ${(2 * R).toFixed(1)}) - ${R.toFixed(1)} + uCam.z;
        w.y += uCam.y - ${(H / 2).toFixed(1)};
        w += aEnd * vec3(0.14, 1.1, 0.0);
        vA = uAmount * step(fract(p.x * 13.1 + p.z * 7.7), uAmount);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uColor, 0.55 * vA); }`,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.layers.set(LAYER_FX);
  lines.renderOrder = 5;
  lines.visible = false;
  scene.add(lines);
  return {
    setAmount(a) { uniforms.uAmount.value = a; lines.visible = a > 0.01; },
    update(camera, time) { uniforms.uCam.value.copy(camera.position); uniforms.uTime.value = time; },
  };
}
