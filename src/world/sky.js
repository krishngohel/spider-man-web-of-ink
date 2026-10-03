import * as THREE from 'three';
import { AUX_DECL, AUX_WRITE_FLAT } from '../render/gbuffer.js';
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
    uNight: { value: 0 },
    uMoon: { value: 0 },
    uCover: { value: 0 },
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
      uniform float uTime, uNight, uMoon, uCover;
      varying vec3 vDir;
      ${AUX_DECL}
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
        // Stars at night: a sprinkle of crosses and dots, fading at the horizon.
        if (uNight > 0.01 && y > 0.05) {
          vec2 sp = vec2(atan(d.z, d.x) * 60.0, asin(y) * 60.0);
          vec2 cell = floor(sp), f = fract(sp) - 0.5;
          float r = h(cell);
          float star = step(0.93, r) * (1.0 - smoothstep(0.04, 0.09 + 0.05 * step(0.985, r), length(f)));
          c = mix(c, vec3(1.0, 0.97, 0.88), star * uNight * smoothstep(0.05, 0.3, y) * (1.0 - uCover));
        }
        // Sun (rays, inked disc) by day; a pale moon with an inked rim by night.
        float s = dot(d, uSunDir);
        float ang = atan(d.z - uSunDir.z, d.x - uSunDir.x);
        float rays = step(0.5, fract(ang * 3.0)) * smoothstep(0.955, 0.988, s) * (1.0 - smoothstep(0.988, 0.993, s)) * (1.0 - uMoon) * (1.0 - uCover);
        c = mix(c, mix(c, uSun, 0.45), rays);
        float disc = smoothstep(0.9968, 0.9974, s) * (1.0 - uCover * 0.85);
        vec3 discCol = mix(uSun, vec3(0.93, 0.94, 0.98), uMoon);
        // The moon's seas: a few soft grey patches.
        if (uMoon > 0.5) discCol = mix(discCol, discCol * 0.78, step(0.62, h(floor((d.xz - uSunDir.xz) * 900.0))) * 0.6);
        c = mix(c, discCol, disc);
        float rim = smoothstep(0.996, 0.9965, s) * (1.0 - disc) * (1.0 - uCover * 0.85);
        c = mix(c, uInk, rim * 0.9);
        // Clouds: flat cartoon shapes on a plane above the city, shaded underneath, inked edges.
        if (y > 0.015) {
          vec2 uv = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
          float f = fbm(uv * 0.55);
          float th = 0.58 - 0.08 * smoothstep(0.05, 0.5, y) - 0.22 * uCover;
          // Crisp, pixel-width ink: the edge is measured in screen pixels, not in noise units.
          float fw = max(fwidth(f), 1e-4);
          float cloud = smoothstep(th - fw, th + fw, f);
          float bf = fbm(uv * 0.55 + vec2(0.0, 0.18));
          float belly = 1.0 - smoothstep(th + 0.05 - fw, th + 0.05 + fw, bf);
          vec3 cc = mix(uCloud, uCloudShade, belly);
          // Night clouds: dark blue-grey with a moonlit edge; overcast clouds: heavy and grey.
          cc = mix(cc, cc * vec3(0.32, 0.36, 0.5), uNight);
          cc = mix(cc, cc * vec3(0.72, 0.74, 0.8), uCover);
          float edge = 1.0 - smoothstep(fw * 1.0, fw * 2.4, abs(f - th));
          float fade = smoothstep(0.015, 0.09, y);
          c = mix(c, cc, cloud * fade);
          c = mix(c, uInk, edge * fade * 0.85);
        }
        gl_FragColor = vec4(c, 1.0);
        ${AUX_WRITE_FLAT}
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

// The layered skyline (spec G8): three rings of flat building silhouettes past the city, in
// colours stepping from the haze toward the horizon sky, so the far distance reads as layers of
// printed city instead of an empty band. Drawn with the sky (no depth, so the real city always
// draws over them and the ink pass treats them as sky), following the camera across the ground.
export function createSkyline(scene, skyUniforms, fogColor) {
  const group = new THREE.Group();
  const rings = [[1500, 150, 0.15], [1650, 210, 0.45], [1800, 280, 0.75]];
  rings.forEach(([r, h, k], i) => {
    const geo = new THREE.CylinderGeometry(r, r, h, 160, 1, true);
    geo.translate(0, h / 2, 0);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: false, fog: false,
      uniforms: { uFog: { value: fogColor }, uHorizon: skyUniforms.uHorizon, uMid: skyUniforms.uMid, uK: { value: k }, uSeed: { value: i * 17.3 }, uH: { value: h } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFog, uHorizon, uMid;
        uniform float uK, uSeed, uH;
        varying vec2 vUv;
        ${AUX_DECL}
        float hsh(float x) { return fract(sin(x * 12.9898 + uSeed) * 43758.5453); }
        void main() {
          // Blocky towers: a height per column, now and then a tall one with a spire.
          float cols = 260.0, c = floor(vUv.x * cols), f = fract(vUv.x * cols);
          float t = hsh(c);
          float hgt = 0.18 + 0.55 * t * t + step(0.93, hsh(c + 0.5)) * 0.3;
          hgt += step(0.97, hsh(c + 0.25)) * step(abs(f - 0.5), 0.06) * 0.25;
          float y = vUv.y;
          if (y > hgt) discard;
          vec3 col = mix(uFog, mix(uHorizon, uMid, 0.3), uK) * (0.82 + 0.1 * uK);
          // An inked roofline, a couple of pixels thick.
          float fw = fwidth(y);
          col = mix(col, col * 0.55, 1.0 - smoothstep(fw * 1.5, fw * 3.0, hgt - y));
          gl_FragColor = vec4(col, 1.0);
          ${AUX_WRITE_FLAT}
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -9;
    m.frustumCulled = false;
    m.layers.set(LAYER_FX);
    group.add(m);
  });
  scene.add(group);
  return { group, follow(camera) { group.position.set(camera.position.x, 0, camera.position.z); } };
}
