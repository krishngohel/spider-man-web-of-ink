import * as THREE from 'three';
import { PALETTE } from '../render/palette.js';
import { LAYER_FX } from '../render/layers.js';

// The comic sky, on the colour pass only (it writes no depth, so the ink shader treats it as sky
// and dots it): a three-band gradient, flat cartoon clouds with a shaded belly and an inked outline
// drifting slowly, and an inked sun with alternating rays. Follows the camera.
export function createSky(scene, radius = 1900) {
  const uniforms = {
    uTop: { value: new THREE.Color(PALETTE.skyTop) },
    uMid: { value: new THREE.Color(PALETTE.skyMid) },
    uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() },
    uSun: { value: new THREE.Color(PALETTE.sun) },
    uInk: { value: new THREE.Color(PALETTE.ink) },
    uCloud: { value: new THREE.Color(0xffffff) },
    uCloudShade: { value: new THREE.Color(0xc9d6ea) },
    uTime: { value: 0 },
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
      uniform vec3 uTop, uMid, uHorizon, uSun, uSunDir, uInk, uCloud, uCloudShade;
      uniform float uTime;
      varying vec3 vDir;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        // Three flat-ish bands with soft joins: horizon glow, mid blue, deep top.
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.16, y));
        c = mix(c, uTop, smoothstep(0.22, 0.6, y));
        // Sun: an inked disc with comic rays around it.
        float s = dot(d, uSunDir);
        float ang = atan(d.z - uSunDir.z, d.x - uSunDir.x);
        float rays = step(0.5, fract(ang * 3.0)) * smoothstep(0.955, 0.988, s) * (1.0 - smoothstep(0.988, 0.993, s));
        c = mix(c, mix(c, uSun, 0.45), rays);
        float disc = smoothstep(0.9968, 0.9974, s);
        c = mix(c, uSun, disc);
        float rim = smoothstep(0.996, 0.9965, s) * (1.0 - disc);
        c = mix(c, uInk, rim * 0.9);
        // Clouds: flat cartoon shapes on a plane above the city, shaded underneath, inked edges.
        if (y > 0.015) {
          vec2 uv = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
          float f = fbm(uv * 0.55);
          float th = 0.58 - 0.08 * smoothstep(0.05, 0.5, y);
          // Crisp, pixel-width ink: the edge is measured in screen pixels, not in noise units.
          float fw = max(fwidth(f), 1e-4);
          float cloud = smoothstep(th - fw, th + fw, f);
          float bf = fbm(uv * 0.55 + vec2(0.0, 0.18));
          float belly = 1.0 - smoothstep(th + 0.05 - fw, th + 0.05 + fw, bf);
          vec3 cc = mix(uCloud, uCloudShade, belly);
          float edge = 1.0 - smoothstep(fw * 1.0, fw * 2.4, abs(f - th));
          float fade = smoothstep(0.015, 0.09, y);
          c = mix(c, cc, cloud * fade);
          c = mix(c, uInk, edge * fade * 0.85);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  scene.add(mesh);
  return {
    mesh, uniforms,
    follow(camera, time = 0) { mesh.position.copy(camera.position); uniforms.uTime.value = time; },
  };
}
