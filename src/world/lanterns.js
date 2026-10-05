import * as THREE from 'three';
import { AUX_DECL, AUX_WRITE_FLAT } from '../render/gbuffer.js';
import { blocks, GRID } from './city.js';
import { createRng } from '../core/rng.js';

// Chinatown's lantern strings: lines of red paper lanterns strung across the cross streets from
// facade to facade, sagging between them, glowing at night. Looks only (nothing to web or stand
// on), two draw calls: the strings and the lanterns.
const SAG = 1.3, PER = 7;

export function buildLanterns(city, scene) {
  const D = city.districts?.find((d) => d.id === 'chinatown');
  const group = new THREE.Group();
  group.name = 'lanterns';
  group.userData.setNight = () => {};
  if (!D) return group;
  const rng = createRng(8088);
  const strings = [];
  const s = GRID.sidewalk;
  for (const b of blocks()) {
    if (b.cx < D.minX || b.cx > D.maxX || b.cz < D.minZ || b.cz > D.maxZ) continue;
    // Across the street on this block's near (minZ) side: this block's facade to the next one's.
    const z1 = b.minZ + s, z0 = b.minZ - GRID.streetWidth - s;
    for (let x = b.minX + 8; x < b.maxX - 6; x += rng.range(13, 18)) strings.push({ x: x + rng.range(-1.5, 1.5), z0, z1, y: rng.range(7, 9) });
  }
  if (!strings.length) return group;

  // The strings: a sagging polyline each (a parabola between the two facades).
  const SEG = 10, pts = [];
  const at = (st, t) => [st.x, st.y - SAG * 4 * t * (1 - t), st.z0 + (st.z1 - st.z0) * t];
  for (const st of strings) for (let i = 0; i < SEG; i++) pts.push(...at(st, i / SEG), ...at(st, (i + 1) / SEG));
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x1a1418 }));
  lines.frustumCulled = false;

  // The lanterns: a squashed ball with gold caps, hanging just under the string.
  const ball = new THREE.SphereGeometry(0.46, 10, 7);
  ball.scale(1, 0.82, 1);
  const col = new Float32Array(ball.attributes.position.count * 3);
  for (let i = 0; i < ball.attributes.position.count; i++) {
    const y = ball.attributes.position.getY(i);
    const cap = Math.abs(y) > 0.33 ? 1 : 0, rib = Math.abs(Math.sin(Math.atan2(ball.attributes.position.getZ(i), ball.attributes.position.getX(i)) * 4)) < 0.18 ? 1 : 0;
    const c = cap ? [0.95, 0.72, 0.2] : rib ? [0.55, 0.06, 0.08] : [0.86, 0.12, 0.12];
    col.set(c, i * 3);
  }
  ball.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  ball.translate(0, -0.55, 0);
  const glow = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uGlow: glow },
    vertexShader: `attribute vec3 aCol; varying vec3 vC; varying float vY;
void main() { vC = aCol; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `${AUX_DECL}
uniform float uGlow; varying vec3 vC; varying float vY;
void main() {
  // Day: flat paper colour, a darker lower half. Night: lit from inside, brightest in the middle.
  vec3 day = vC * (vY < -0.6 ? 0.78 : 1.0);
  vec3 lit = mix(vC, vec3(1.0, 0.45, 0.25), 0.35) * (1.25 + 0.35 * (1.0 - abs(vY + 0.55) / 0.38));
  gl_FragColor = vec4(mix(day, lit, uGlow), 1.0);
  ${AUX_WRITE_FLAT}
}`,
  });
  const n = strings.length * PER;
  const lanterns = new THREE.InstancedMesh(ball, mat, n);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (const st of strings) {
    for (let i = 0; i < PER; i++) {
      const p = at(st, (i + 1) / (PER + 1));
      m4.makeTranslation(p[0], p[1], p[2]);
      lanterns.setMatrixAt(k++, m4);
    }
  }
  lanterns.computeBoundingSphere();
  group.add(lines, lanterns);
  group.userData.setNight = (v) => { glow.value = v; };
  scene.add(group);
  return group;
}
