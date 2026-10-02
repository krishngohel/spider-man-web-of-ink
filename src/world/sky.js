import * as THREE from 'three';
import { PALETTE } from '../render/palette.js';
import { LAYER_FX } from '../render/layers.js';

// A gradient sky dome on the colour pass only (it writes no depth, so the ink shader treats it as
// sky and dots it). Follows the camera.
export function createSky(scene, radius = 1900) {
  const uniforms = {
    uTop: { value: new THREE.Color(PALETTE.skyTop) },
    uMid: { value: new THREE.Color(PALETTE.skyMid) },
    uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() },
    uSun: { value: new THREE.Color(PALETTE.sun) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uSun, uSunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = mix(uHorizon, uMid, smoothstep(-0.02, 0.18, h));
        c = mix(c, uTop, smoothstep(0.18, 0.75, h));
        float s = max(dot(normalize(vDir), uSunDir), 0.0);
        c = mix(c, uSun, smoothstep(0.9965, 0.998, s));
        c += uSun * pow(s, 24.0) * 0.18;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  scene.add(mesh);
  return {
    mesh, uniforms,
    follow(camera) { mesh.position.copy(camera.position); },
  };
}
