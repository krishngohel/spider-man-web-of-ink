import * as THREE from 'three';
import { PALETTE } from '../render/palette.js';
import { toonGradient } from '../render/toon.js';
import { GRID } from './testCity.js';

// Draws the blockout city. Buildings are merged into one mesh per 240 m chunk (so frustum culling
// still drops what's behind the camera) with one shared toon material; facade windows, storefronts
// and roofs come from a world-space shader, not geometry. Trees and water towers are instanced
// rounded shapes (their collision stays boxes). The ground is one plane whose shader paints roads,
// lane marks, crosswalks, sidewalks, the park and the water around the island.

const CHUNK = 240;
const STYLE_COLORS = {
  0: PALETTE.brick, 1: PALETTE.sandstone, 2: PALETTE.glass, 3: PALETTE.concrete,
  7: PALETTE.limestone, 8: PALETTE.deco, 10: PALETTE.crane,
};

const shared = { night: { value: 0 } };

export function setNight(v) { shared.night.value = v; }

function buildingMaterial() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = shared.night;
    shader.uniforms.uWinDark = { value: new THREE.Color(PALETTE.windowDark) };
    shader.uniforms.uWinLit = { value: new THREE.Color(PALETTE.windowLit) };
    shader.uniforms.uRoof = { value: new THREE.Color(PALETTE.roof) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aStyle;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nflat varying vec2 vStyle;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvWNrm = normal;\nvStyle = aStyle;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight;
uniform vec3 uWinDark, uWinLit, uRoof;
varying vec3 vWPos;
varying vec3 vWNrm;
// Flat: a per-building value must not be interpolated (tiny interpolation error, amplified by the
// window hash, showed up as streaks across the glass).
flat varying vec2 vStyle;
float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
vec3 facade(vec3 base, float style, float seed) {
  bool xFace = abs(vWNrm.x) > 0.5;
  float u = xFace ? vWPos.z : vWPos.x;
  float v = vWPos.y;
  vec2 cell = vec2(3.0, 3.4); vec2 m = vec2(0.24, 0.3);
  if (style < 0.5) { cell = vec2(3.0, 3.4); m = vec2(0.26, 0.3); }
  else if (style < 1.5) { cell = vec2(3.4, 3.8); m = vec2(0.3, 0.2); }
  else if (style < 2.5) { cell = vec2(2.2, 3.6); m = vec2(0.05, 0.07); }
  else if (style < 3.5) { cell = vec2(6.0, 3.6); m = vec2(0.02, 0.34); }
  else if (style < 7.5) { cell = vec2(1.8, 4.2); m = vec2(0.28, 0.1); }
  else return base;
  vec2 g = vec2(u, v) / cell;
  vec2 f = fract(g), id = floor(g);
  float win = step(m.x, f.x) * step(f.x, 1.0 - m.x) * step(m.y, f.y) * step(f.y, 1.0 - m.y);
  // Ground floor: shopfronts, big dark glass.
  if (v < 4.2) { win = step(0.08, fract(u / 7.0)) * step(fract(u / 7.0), 0.92) * step(0.6, v) * step(v, 3.6); }
  // Far away the grid is finer than a pixel and shimmers: blend toward its average coverage.
  vec2 fw = fwidth(g);
  win = mix(win, (1.0 - 2.0 * m.x) * (1.0 - 2.0 * m.y) * 0.8, smoothstep(0.22, 0.55, max(fw.x, fw.y)));
  float r = h21(id + seed * 13.1 + (xFace ? 7.0 : 0.0));
  vec3 glass = mix(uWinDark, uWinDark * 1.9 + vec3(0.06, 0.1, 0.16), step(0.72, r) * (1.0 - uNight));
  vec3 lit = uWinLit * (0.75 + 0.25 * r);
  vec3 w = mix(glass, lit, step(1.0 - uNight * 0.55, r) * uNight);
  // A cornice band at the top floor of masonry styles.
  return mix(base, w, win);
}
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float style = floor(vStyle.x + 0.5), seed = floor(vStyle.y * 997.0 + 0.5) / 997.0;
  vec3 base = diffuseColor.rgb;
  if (vWNrm.y > 0.5 && style < 8.5) base = uRoof * (0.85 + 0.3 * fract(seed * 7.3));
  else if (abs(vWNrm.y) < 0.5) base = facade(base, style, seed);
  diffuseColor.rgb = base;
}`);
  };
  mat.customProgramCacheKey = () => 'city-building-v1';
  return mat;
}

function pushBox(b, seed, arr) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  const col = new THREE.Color(STYLE_COLORS[b.style] ?? PALETTE.concrete);
  // A little per-building variation, kept inside the style's family.
  const j = 0.88 + 0.24 * ((seed * 0.618) % 1);
  col.multiplyScalar(j);
  const faces = [
    // normal, four corners (counter-clockwise seen from outside)
    [[1, 0, 0], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    [[-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[0, 0, -1], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    [[0, 1, 0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
  ];
  if (y0 > 0.5) faces.push([[0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
  for (const [n, a, bb, c, d] of faces) {
    for (const v of [a, bb, c, a, c, d]) {
      arr.pos.push(v[0], v[1], v[2]);
      arr.nrm.push(n[0], n[1], n[2]);
      arr.col.push(col.r, col.g, col.b);
      arr.sty.push(b.style, seed);
    }
  }
}

export function buildCityMeshes(city, scene, quality) {
  const group = new THREE.Group();
  group.name = 'city';
  const mat = buildingMaterial();
  const chunks = new Map();
  const trees = [], towers = [];
  city.boxes.forEach((b, i) => {
    if (b.kind === 'tree') { trees.push(b); return; }
    if (b.style === 9) { towers.push(b); return; }
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const k = `${Math.floor(cx / CHUNK)},${Math.floor(cz / CHUNK)}`;
    if (!chunks.has(k)) chunks.set(k, { pos: [], nrm: [], col: [], sty: [] });
    pushBox(b, (i * 0.137) % 1 + 0.01, chunks.get(k));
  });
  for (const arr of chunks.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(arr.nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr.col, 3));
    geo.setAttribute('aStyle', new THREE.Float32BufferAttribute(arr.sty, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = quality.shadows;
    mesh.receiveShadow = quality.shadows;
    group.add(mesh);
  }

  // Trees: a trunk cylinder and a round crown per collision pair (trunk box, crown box).
  const trunks = trees.filter((b) => b.style === 11), crowns = trees.filter((b) => b.style === 12);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  if (trunks.length) {
    const tg = new THREE.CylinderGeometry(0.35, 0.5, 1, 7);
    tg.translate(0, 0.5, 0);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshToonMaterial({ color: PALETTE.trunk, gradientMap: toonGradient() }), trunks.length);
    trunks.forEach((b, i) => {
      p.set((b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2);
      s.set(1, b.max[1] - b.min[1], 1);
      tm.setMatrixAt(i, m4.compose(p, q, s));
    });
    tm.castShadow = quality.shadows;
    group.add(tm);
    const cg = new THREE.IcosahedronGeometry(1, 1);
    const cm = new THREE.InstancedMesh(cg, new THREE.MeshToonMaterial({ color: PALETTE.leaves, gradientMap: toonGradient() }), crowns.length);
    crowns.forEach((b, i) => {
      p.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2 + 0.6, (b.min[2] + b.max[2]) / 2);
      const r = (b.max[0] - b.min[0]) * 0.62;
      s.set(r, r * 0.92, r);
      cm.setMatrixAt(i, m4.compose(p, q, s));
    });
    cm.castShadow = quality.shadows;
    group.add(cm);
  }

  // Water towers: a wooden tank with a conical cap on four legs, one instanced mesh.
  if (towers.length) {
    const parts = [];
    const tank = new THREE.CylinderGeometry(2.1, 2.1, 3.6, 12); tank.translate(0, 4.2, 0); parts.push(tank);
    const cap = new THREE.ConeGeometry(2.4, 1.6, 12); cap.translate(0, 6.8, 0); parts.push(cap);
    for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const leg = new THREE.BoxGeometry(0.3, 2.4, 0.3); leg.translate(lx, 1.2, lz); parts.push(leg);
    }
    const geo = mergeGeometries(parts);
    const tm = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ color: PALETTE.waterTower, gradientMap: toonGradient() }), towers.length);
    towers.forEach((b, i) => {
      p.set((b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2);
      s.set(1, 1, 1);
      tm.setMatrixAt(i, m4.compose(p, q, s));
    });
    tm.castShadow = quality.shadows;
    group.add(tm);
  }

  group.add(buildGround(city));
  scene.add(group);
  return group;
}

function mergeGeometries(list) {
  const pos = [], nrm = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...ng.attributes.position.array);
    nrm.push(...ng.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}

function buildGround(city) {
  const size = 3000;
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() });
  const c = (h) => new THREE.Color(h);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uAsphalt: { value: c(PALETTE.asphalt) }, uSidewalk: { value: c(PALETTE.sidewalk) },
      uLane: { value: c(PALETTE.laneMark) }, uCross: { value: c(PALETTE.crosswalk) },
      uGrass: { value: c(PALETTE.grass) }, uGrassDark: { value: c(PALETTE.grassDark) },
      uPath: { value: c(PALETTE.path) }, uWater: { value: c(PALETTE.water) }, uPier: { value: c(PALETTE.pier) },
      uGrid: { value: new THREE.Vector4(GRID.minX, GRID.minZ, GRID.avenueEvery, GRID.streetEvery) },
      uBounds: { value: new THREE.Vector4(GRID.minX, GRID.minZ, GRID.maxX, GRID.maxZ) },
      uWaterZ: { value: city.waterZ },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uAsphalt, uSidewalk, uLane, uCross, uGrass, uGrassDark, uPath, uWater, uPier;
uniform vec4 uGrid, uBounds;
uniform float uWaterZ;
varying vec3 vWPos;
float band(float x, float a, float b) { return step(a, x) * step(x, b); }
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 w = vWPos.xz;
  vec3 col;
  bool outside = w.x < uBounds.x - 30.0 || w.x > uBounds.z + 30.0 || w.y < uBounds.y - 30.0 || w.y > uBounds.w + 30.0;
  bool harborWater = w.y > uWaterZ + 6.0 && w.x > -240.0;
  bool park = w.x > 240.0 && w.y < 120.0 && w.x < uBounds.z + 30.0 && w.y > uBounds.y - 30.0;
  if (outside || harborWater) {
    float ripple = sin(w.x * 0.35 + w.y * 0.12) * sin(w.y * 0.31 - w.x * 0.07);
    col = uWater * (0.92 + 0.08 * step(0.6, ripple));
  } else if (park) {
    float paths = max(band(abs(sin(w.x * 0.021 + sin(w.y * 0.013) * 1.4)), 0.0, 0.035), band(abs(sin(w.y * 0.017 + cos(w.x * 0.011))), 0.0, 0.03));
    col = mix(mix(uGrass, uGrassDark, step(0.55, fract(sin(dot(floor(w / 9.0), vec2(12.9, 78.2))) * 43758.5))), uPath, paths);
  } else {
    float ax = mod(w.x - uGrid.x, uGrid.z);
    float sz = mod(w.y - uGrid.y, uGrid.w);
    bool avenue = ax < 15.0 || ax > uGrid.z - 15.0;
    bool street = sz < 9.0 || sz > uGrid.w - 9.0;
    bool walkA = (ax >= 15.0 && ax < 18.0) || (ax > uGrid.z - 18.0 && ax <= uGrid.z - 15.0);
    bool walkS = (sz >= 9.0 && sz < 12.0) || (sz > uGrid.w - 12.0 && sz <= uGrid.w - 9.0);
    if (avenue || street) {
      col = uAsphalt;
      float da = min(ax, uGrid.z - ax), ds = min(sz, uGrid.w - sz);
      // Centre lines: double yellow down the avenues, dashed white along the streets.
      if (avenue && !street && abs(da) < 0.5 && abs(da) > 0.15) col = uLane;
      if (street && !avenue && ds < 0.18 && fract(w.x / 6.0) < 0.5) col = uLane;
      // Crosswalk stripes where a street meets an avenue.
      if (avenue && street) {
        if (ds > 6.0 && ds < 9.0 && fract(w.x / 1.4) < 0.5) col = uCross;
        if (da > 12.0 && da < 15.0 && fract(w.y / 1.4) < 0.5) col = uCross;
      }
      if (w.y > uWaterZ - 2.0 && w.y < uWaterZ + 6.0 && w.x > -240.0) col = uPier;
    } else if (walkA || walkS) {
      col = uSidewalk * (0.94 + 0.06 * step(0.5, fract(w.x / 2.0 + floor(w.y / 2.0) * 0.5)));
    } else {
      col = uSidewalk * 0.9;
    }
  }
  diffuseColor.rgb = col;
}`);
  };
  mat.customProgramCacheKey = () => 'city-ground-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}
