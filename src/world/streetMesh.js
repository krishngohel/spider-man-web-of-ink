import * as THREE from 'three';
import { AUX_DECL, AUX_WRITE_FLAT, AUX_WRITE_NONE } from '../render/gbuffer.js';
import { comicToon } from '../render/comicShade.js';
import { PALETTE } from '../render/palette.js';
import { carParts } from './carShape.js';

// Draws the street furniture as a handful of instanced meshes (one draw call each): lamp posts,
// traffic lights, parked cars with per-car colours, street trees, hydrants. Stylised and chunky so
// they read as comic props under the ink pass.

function merge(parts) {
  const pos = [], nrm = [], col = [];
  for (const [geo, color] of parts) {
    // Smooth normals on the indexed shape first, so round things stay round under the ink pass.
    if (geo.index) geo.computeVertexNormals();
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!geo.index) g.computeVertexNormals();
    const c = new THREE.Color(color);
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
const box = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const cyl = (r1, r2, h, x = 0, y = 0, z = 0, seg = 8) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg); g.translate(x, y, z); return g; };

function lampGeometry() {
  const pole = 0x2e3a35;
  const arm = box(0.12, 0.12, 1.6, 0, 6.2, 0.75);
  return merge([
    [cyl(0.12, 0.16, 6.3, 0, 3.15, 0), pole],
    [cyl(0.22, 0.22, 0.4, 0, 0.2, 0), pole],
    [arm, pole],
    [box(0.5, 0.18, 0.8, 0, 6.08, 1.5), pole],
    [box(0.36, 0.06, 0.6, 0, 5.97, 1.5), 0xfff3c4],
  ]);
}
function trafficGeometry() {
  const pole = 0x3a3d40, housing = 0x2a2c2e;
  return merge([
    [cyl(0.11, 0.14, 5.0, 0, 2.5, 0), pole],
    [box(0.12, 0.12, 4.0, 0, 4.9, -2.0), pole],
    [box(0.45, 1.25, 0.4, 0, 4.25, -3.4), housing],
    [box(0.28, 0.28, 0.06, 0, 4.67, -3.62), 0xd8392b],
    [box(0.28, 0.28, 0.06, 0, 4.27, -3.62), 0xf2c230],
    [box(0.28, 0.28, 0.06, 0, 3.87, -3.62), 0x3fbf6a],
  ]);
}
function carGeometry() {
  // Body colour comes from the instance colour; glass, wheels and lights are baked dark/light.
  return merge(carParts());
}
// The same car from far off: two boxes and four wheels (about 120 triangles, no shadow).
function farCarGeometry() {
  return merge([
    [box(1.8, 0.7, 4.3, 0, 0.72, 0), 0xffffff],
    [box(1.5, 0.5, 2.1, 0, 1.3, -0.2), 0x2f4e6e],
    ...[[-0.86, 1.35], [0.86, 1.35], [-0.86, -1.35], [0.86, -1.35]].map(([x, z]) => [cyl(0.36, 0.36, 0.24, x, 0.37, z, 6).rotateZ(Math.PI / 2), 0x1d1d22]),
  ]);
}
function treeGeometry() {
  const crown = new THREE.SphereGeometry(1.9, 14, 10);
  crown.scale(1, 1.15, 1); crown.translate(0, 5.6, 0);
  const crown2 = new THREE.SphereGeometry(1.3, 12, 8);
  crown2.translate(0.9, 4.9, 0.4);
  return merge([
    [cyl(0.16, 0.24, 4.6, 0, 2.3, 0), PALETTE.trunk],
    [box(1.4, 0.08, 1.4, 0, 0.04, 0), 0x6b5a48],
    [crown, PALETTE.leaves],
    [crown2, PALETTE.grassDark],
  ]);
}
function hydrantGeometry() {
  return merge([
    [cyl(0.2, 0.22, 0.7, 0, 0.35, 0), 0xd8392b],
    [cyl(0.24, 0.2, 0.14, 0, 0.75, 0), 0xd8392b],
    [cyl(0.06, 0.06, 0.6, 0, 0.5, 0, 6).rotateZ(Math.PI / 2), 0xd8392b],
  ]);
}

export function buildStreetMeshes(props, scene, quality) {
  const group = new THREE.Group();
  group.name = 'street';
  const mat = comicToon({ vertexColors: true });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const add = (geo, list, place, colorOf, shadows = false) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      place(it);
      mesh.setMatrixAt(i, m4.compose(p, q, s));
      if (colorOf) mesh.setColorAt(i, new THREE.Color(colorOf(it)));
    });
    // Only cars and trees cast shadows: thin poles cost a lot in the shadow pass for little.
    mesh.castShadow = quality.shadows && shadows;
    mesh.receiveShadow = quality.shadows;
    group.add(mesh);
  };
  add(lampGeometry(), props.lamps, (l) => { p.set(l.x, 0, l.z); q.setFromAxisAngle(up, l.facing > 0 ? Math.PI / 2 : -Math.PI / 2); s.set(1, 1, 1); });
  add(trafficGeometry(), props.lights, (l) => { p.set(l.x, 0, l.z); q.setFromAxisAngle(up, Math.PI / 2); s.set(1, 1, 1); });
  // Parked cars in two levels of detail: full sedans with shadows near the camera, plain boxes past
  // CAR_NEAR (a city of sedans with shadows cost over 2 ms of GPU), re-sorted a few times a second.
  if (props.cars.length) {
    const N = props.cars.length, CAR_NEAR = 90;
    const nearCars = new THREE.InstancedMesh(carGeometry(), mat, N), farCars = new THREE.InstancedMesh(farCarGeometry(), mat, N);
    nearCars.castShadow = quality.shadows; farCars.castShadow = false;
    nearCars.receiveShadow = farCars.receiveShadow = quality.shadows;
    nearCars.frustumCulled = farCars.frustumCulled = false;
    // Each set is packed at the front of its mesh and drawn with count = its size (a zero-scaled
    // instance still runs every vertex, shadow pass included, so hiding by scale saved nothing).
    const cols = props.cars.map((c) => new THREE.Color(c.color));
    let lodT = 0;
    group.userData.updateCars = (cam, dt) => {
      lodT -= dt;
      if (lodT > 0) return;
      lodT = 0.4;
      let nn = 0, nf = 0;
      props.cars.forEach((c, i) => {
        p.set(c.x, 0, c.z); q.setFromAxisAngle(up, c.yaw); s.set(1, 1, 1); m4.compose(p, q, s);
        if (Math.hypot(c.x - cam.x, c.z - cam.z) < CAR_NEAR) { nearCars.setMatrixAt(nn, m4); nearCars.setColorAt(nn, cols[i]); nn++; }
        else { farCars.setMatrixAt(nf, m4); farCars.setColorAt(nf, cols[i]); nf++; }
      });
      nearCars.count = nn; farCars.count = nf;
      nearCars.instanceMatrix.needsUpdate = true; farCars.instanceMatrix.needsUpdate = true;
      if (nearCars.instanceColor) nearCars.instanceColor.needsUpdate = true;
      if (farCars.instanceColor) farCars.instanceColor.needsUpdate = true;
    };
    group.userData.updateCars({ x: 1e9, z: 1e9 }, 1);
    group.add(nearCars, farCars);
  }
  add(treeGeometry(), props.trees, (t) => { p.set(t.x, 0, t.z); q.setFromAxisAngle(up, t.x * 0.37); s.setScalar(t.s); }, null, true);
  add(hydrantGeometry(), props.hydrants, (h) => { p.set(h.x, 0, h.z); q.identity(); s.set(1, 1, 1); });
  // Night: bulbs light up and throw a comic cone of light (additive, no real light: cheap).
  const glow = { value: 0 };
  if (props.lamps.length) {
    const cone = new THREE.ConeGeometry(2.6, 5.9, 12, 1, true);
    cone.translate(0, 5.95 / 2, 0);
    cone.translate(0, 0, 1.5);
    const coneMat = new THREE.ShaderMaterial({
      uniforms: { uGlow: glow, uCol: { value: new THREE.Color(0xffd98a) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying float vH; void main() { vH = position.y / 5.95; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `${AUX_DECL}
uniform float uGlow; uniform vec3 uCol; varying float vH; void main() { gl_FragColor = vec4(uCol * uGlow * 0.22 * (1.0 - vH * 0.85), 1.0); ${AUX_WRITE_NONE} }`,
    });
    const cones = new THREE.InstancedMesh(cone, coneMat, props.lamps.length);
    const bulbMat = new THREE.ShaderMaterial({
      uniforms: { uGlow: glow },
      vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `${AUX_DECL}
uniform float uGlow; void main() { gl_FragColor = vec4(mix(vec3(0.95, 0.92, 0.8), vec3(1.0, 0.9, 0.55) * 1.6, uGlow), 1.0); ${AUX_WRITE_FLAT} }`,
    });
    const bulbGeo = new THREE.BoxGeometry(0.36, 0.08, 0.6); bulbGeo.translate(0, 5.94, 1.5);
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, props.lamps.length);
    props.lamps.forEach((l, i) => {
      p.set(l.x, 0, l.z); q.setFromAxisAngle(up, l.facing > 0 ? Math.PI / 2 : -Math.PI / 2); s.set(1, 1, 1);
      m4.compose(p, q, s); cones.setMatrixAt(i, m4); bulbs.setMatrixAt(i, m4);
    });
    cones.visible = false;
    cones.renderOrder = 4;
    group.add(cones, bulbs);
    group.userData.setNight = (n) => { glow.value = n; cones.visible = n > 0.05; };
  }
  scene.add(group);
  return group;
}
