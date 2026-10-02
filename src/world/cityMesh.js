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
  7: PALETTE.limestone, 8: PALETTE.deco, 10: PALETTE.crane, 13: PALETTE.limestone,
  14: PALETTE.metal, 15: PALETTE.bulkhead, 16: PALETTE.metal,
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
    shader.uniforms.uInk = { value: new THREE.Color(PALETTE.ink) };
    shader.uniforms.uStone = { value: new THREE.Color(PALETTE.limestone) };
    shader.uniforms.uAwning = { value: new THREE.Color(PALETTE.awning) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aStyle;\nattribute vec4 aBox;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nflat varying vec2 vStyle;\nflat varying vec4 vBox;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvWNrm = normal;\nvStyle = aStyle;\nvBox = aBox;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight;
uniform vec3 uWinDark, uWinLit, uRoof, uInk, uStone, uAwning;
varying vec3 vWPos;
varying vec3 vWNrm;
// Flat: per-building values must not be interpolated (tiny interpolation error, amplified by the
// window hash, showed up as streaks across the glass).
flat varying vec2 vStyle;
flat varying vec4 vBox;     // face u range (u0, u1) and the building's y range (y0, y1)
float gInk = 0.0;           // ink drawn over the lit colour
float gGlass = 0.0;         // a glass reflection streak, drawn over the lit colour
float gEmit = 0.0;          // a lit window at night, unaffected by light
float gNear = 1.0;          // fine detail fades with distance (1 near, 0 far)
float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
// Ink on the boundary of the box [lo, hi] (world units), px pixels wide, antialiased.
float frame(vec2 p, vec2 lo, vec2 hi, float pw, float px) {
  vec2 c = (lo + hi) * 0.5, h = (hi - lo) * 0.5;
  vec2 q = abs(p - c) - h;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return 1.0 - smoothstep(pw * px * 0.5, pw * (px * 0.5 + 1.0), abs(d));
}
float hline(float y, float at, float pw, float px) {
  return 1.0 - smoothstep(pw * px * 0.5, pw * (px * 0.5 + 1.0), abs(y - at));
}
float inside(vec2 p, vec2 lo, vec2 hi) { return step(lo.x, p.x) * step(p.x, hi.x) * step(lo.y, p.y) * step(p.y, hi.y); }

vec3 glassColor(vec2 id, float seed, float u, float v) {
  float r = h21(id + seed * 13.1);
  vec3 g = mix(uWinDark, uWinDark * 1.6 + vec3(0.05, 0.09, 0.14), step(0.7, r));
  // Night: some windows light up.
  gEmit = max(gEmit, step(1.0 - uNight * 0.55, r) * uNight);
  return mix(g, uWinLit * (0.75 + 0.25 * r), gEmit);
}

vec3 facade(vec3 base, float style, float seed) {
  bool xFace = abs(vWNrm.x) > 0.5;
  float u = xFace ? vWPos.z : vWPos.x;
  float v = vWPos.y;
  float u0 = vBox.x, u1 = vBox.y, y0 = vBox.z, y1 = vBox.w;
  float pw = max(length(fwidth(vec2(u, v))), 1e-4);  // metres per pixel here
  gNear = 1.0 - smoothstep(0.035, 0.14, pw);
  float lineK = gNear;
  vec3 col = base;
  bool streetLevel = y0 < 0.5;
  float du = min(u - u0, u1 - u);
  float top = y1 - v;
  vec2 p = vec2(u, v);

  // Building edges: a strong ink line down each corner and along the roof line.
  gInk = max(gInk, hline(du, 0.0, pw, 2.2));
  // Props, cranes and cornice slabs: flat colour, inked edges, nothing else.
  if (style > 8.5) {
    gInk = max(gInk, hline(top, 0.0, pw, 1.8));
    if (style > 13.5 && style < 14.5) col = mix(base, base * 0.75, step(0.5, fract(v / 0.25)) * gNear * 0.5); // AC grille
    return col;
  }

  // Glass curtain wall.
  if (style > 1.5 && style < 2.5) {
    vec2 cell = vec2(1.6, 3.6);
    vec2 g = (p - vec2(u0, y0)) / cell;
    vec2 f = fract(g), id = floor(g);
    col = glassColor(id, seed, u, v);
    // Mullions and floor slabs.
    float mull = max(1.0 - smoothstep(0.0, fwidth(g.x) * 1.5, min(f.x, 1.0 - f.x)), 1.0 - smoothstep(0.0, fwidth(g.y) * 2.5, min(f.y, 1.0 - f.y)));
    col = mix(col, uInk * 1.6 + base * 0.2, mull * 0.8 * lineK);
    // Big diagonal reflection bands across the whole wall (the comic "shine").
    float band = fract((u * 0.8 + v * 0.55) / 22.0 + seed * 3.7);
    gGlass = max(gGlass, (step(band, 0.1) + 0.55 * step(0.16, band) * step(band, 0.2)) * 0.55);
    gInk = max(gInk, hline(top, 0.0, pw, 2.0));
    return col;
  }

  // Masonry: cornice band at the top.
  if (top < 1.8) {
    col = mix(base, uStone, 0.65);
    gInk = max(gInk, hline(top, 1.8, pw, 1.6) * lineK);
    gInk = max(gInk, hline(top, 0.0, pw, 2.0));
    // Dentils under the cornice.
    if (top > 1.15 && top < 1.5) { float dn = fract(u / 0.55); col = mix(col, col * 0.62, step(0.5, dn) * lineK); }
    gInk = max(gInk, hline(top, 1.15, pw, 1.0) * lineK);
    return col;
  }
  // Street level: shopfronts with awnings.
  if (streetLevel && v - y0 < 4.6) {
    float sv = v - y0;
    float bay = 6.0;
    float fx = fract((u - u0) / bay);
    vec2 lo = vec2(0.08, 0.5), hi = vec2(0.92, 3.3);
    vec2 q = vec2(fx, sv / 1.0);
    if (fx > lo.x && fx < hi.x && sv > lo.y && sv < hi.y) {
      col = glassColor(vec2(floor((u - u0) / bay), 99.0), seed, u, v);
      gGlass = max(gGlass, step(fract((u * 0.8 + sv) / 3.0), 0.12) * 0.5);
    }
    // Awning stripe over each shop.
    if (sv > 3.4 && sv < 4.2) col = mix(uAwning, uStone, step(0.5, fract(u / 0.8)) * 0.25);
    gInk = max(gInk, hline(sv, 4.2, pw, 1.8) * lineK);
    gInk = max(gInk, hline(sv, 3.4, pw, 1.4) * lineK);
    gInk = max(gInk, frame(vec2(fx * bay, sv), lo * vec2(bay, 1.0), hi * vec2(bay, 1.0), pw, 1.4) * lineK);
    return col;
  }
  // Corner pilasters.
  float pil = 1.1;
  if (du < pil) {
    col = base * 0.9;
    gInk = max(gInk, hline(du, pil, pw, 1.2) * lineK);
    return col;
  }

  // Windows in bays and floors.
  float floorH = style < 0.5 ? 3.3 : style < 1.5 ? 3.8 : style < 3.5 ? 3.6 : 4.2;
  float bayW = style < 0.5 ? 2.8 : style < 1.5 ? 3.2 : style < 3.5 ? 6.0 : 1.8;
  float vStart = streetLevel ? y0 + 4.6 : y0;
  vec2 cellP = vec2(u - u0 - pil, v - vStart);
  vec2 g = cellP / vec2(bayW, floorH);
  vec2 f = fract(g), id = floor(g);
  vec2 wlo, whi;
  if (style > 2.5 && style < 3.5) { wlo = vec2(0.02, 0.32); whi = vec2(0.98, 0.78); }      // ribbon windows
  else if (style > 6.5) { wlo = vec2(0.3, 0.1); whi = vec2(0.7, 0.86); }                  // deco: narrow, tall
  else if (style > 0.5) { wlo = vec2(0.24, 0.2); whi = vec2(0.76, 0.84); }                // sandstone: tall
  else { wlo = vec2(0.22, 0.26); whi = vec2(0.78, 0.8); }                                 // brick
  vec2 fp = f * vec2(bayW, floorH);
  vec2 lo = wlo * vec2(bayW, floorH), hi = whi * vec2(bayW, floorH);
  float inWin = inside(fp, lo, hi);
  if (inWin > 0.5) {
    col = glassColor(id, seed, u, v);
    // A diagonal highlight in the top corner of each pane.
    float s = (fp.x - lo.x) + (hi.y - fp.y);
    gGlass = max(gGlass, step(0.25, s) * step(s, 0.55) * 0.45 * lineK);
  } else {
    // Deco piers: vertical ribs between the window columns.
    if (style > 6.5) col = mix(base, base * 1.12, step(0.86, f.x) + step(f.x, 0.14));
    // Brick coursing, up close only.
    if (style < 0.5) col = mix(col, col * 0.82, (1.0 - smoothstep(0.0, fwidth(v / 0.3) * 1.2, min(fract(v / 0.3), 1.0 - fract(v / 0.3)))) * gNear * 0.6);
    // Sill under each window.
    if (fp.y < lo.y && fp.y > lo.y - 0.22 && fp.x > lo.x - 0.1 && fp.x < hi.x + 0.1) col = mix(col, uStone, 0.75);
  }
  gInk = max(gInk, frame(fp, lo, hi, pw, 1.3) * lineK);
  // A floor ledge line every floor for masonry.
  if (style < 1.5) gInk = max(gInk, hline(fp.y, 0.0, pw, 1.0) * lineK * 0.7);
  // Far away, the window grid is finer than a pixel: blend it to its average.
  vec2 fw = fwidth(g);
  float far = smoothstep(0.22, 0.55, max(fw.x, fw.y));
  float cover = (whi.x - wlo.x) * (whi.y - wlo.y);
  col = mix(col, mix(base, uWinDark * 1.3, cover * 0.85), far);
  return col;
}

`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float style = floor(vStyle.x + 0.5), seed = floor(vStyle.y * 997.0 + 0.5) / 997.0;
  vec3 base = diffuseColor.rgb;
  if (vWNrm.y > 0.5 && style < 8.5) {
    // Roof: tar paper with a few seams, the parapet edge inked.
    base = uRoof * (0.85 + 0.3 * fract(seed * 7.3));
    float pw = max(length(fwidth(vWPos.xz)), 1e-4);
    vec2 r = vWPos.xz;
    float seam = 1.0 - smoothstep(0.0, fwidth(r.x / 4.0) * 1.2, min(fract(r.x / 4.0), 1.0 - fract(r.x / 4.0)));
    base = mix(base, base * 0.8, seam * 0.5);
    float edge = min(min(vWPos.x - vBox.x, vBox.y - vWPos.x), min(vWPos.z - vBox.z, vBox.w - vWPos.z));
    gInk = max(gInk, 1.0 - smoothstep(pw * 1.1, pw * 2.2, edge));
  } else if (abs(vWNrm.y) < 0.5) base = facade(base, style, seed);
  diffuseColor.rgb = base;
}`)
      .replace('#include <opaque_fragment>', `{
  // Comic shading: three flat tones from the lighting, with cool hue-shifted shadows and a warm
  // sunlit tone, cross-hatching in shadow up close, then ink and glass shine on top.
  float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
  float alb = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 1e-3);
  float ratio = lum / alb;
  float t1 = smoothstep(0.5, 0.56, ratio), t2 = smoothstep(0.86, 0.92, ratio);
  vec3 shade = mix(vec3(0.42, 0.47, 0.72), vec3(0.78, 0.8, 0.9), t1);
  shade = mix(shade, vec3(1.06, 1.02, 0.94), t2);
  vec3 c = diffuseColor.rgb * shade;
  if (ratio < 0.56 && gNear > 0.0) {
    float hp = (vWPos.x + vWPos.z + vWPos.y * 0.7) / 0.5;
    float hatch = 1.0 - smoothstep(0.0, fwidth(hp) * 1.4, min(fract(hp), 1.0 - fract(hp)));
    c = mix(c, uInk, hatch * 0.3 * gNear);
  }
  c = mix(c, vec3(0.86, 0.93, 1.0), gGlass * (0.4 + 0.6 * t2));
  c = mix(c, uWinLit, gEmit);
  c = mix(c, uInk, clamp(gInk, 0.0, 1.0));
  outgoingLight = c;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'city-building-v2';
  return mat;
}

function pushQuadBox(arr, b, style, seed, col, yBase, yTop, withBottom) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  const faces = [
    // normal, four corners (counter-clockwise seen from outside), face u range
    [[1, 0, 0], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], z0, z1],
    [[-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], z0, z1],
    [[0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], x0, x1],
    [[0, 0, -1], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], x0, x1],
    [[0, 1, 0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 0],
  ];
  if (withBottom) faces.push([[0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], x0, x1]);
  for (const [n, a, bb, c, d, u0, u1] of faces) {
    // Roofs carry their x/z extents (for the inked parapet edge); walls their u range and the
    // building's full height (for the cornice and the street level).
    const box = n[1] > 0.5 ? [x0, x1, z0, z1] : [u0, u1, yBase, yTop];
    for (const v of [a, bb, c, a, c, d]) {
      arr.pos.push(v[0], v[1], v[2]);
      arr.nrm.push(n[0], n[1], n[2]);
      arr.col.push(col.r, col.g, col.b);
      arr.sty.push(style, seed);
      arr.box.push(box[0], box[1], box[2], box[3]);
    }
  }
}

const MASONRY = new Set([0, 1, 3, 7]);
function pushBox(b, seed, arr) {
  const col = new THREE.Color(STYLE_COLORS[b.style] ?? PALETTE.concrete);
  // A little per-building variation, kept inside the style's family.
  const j = 0.88 + 0.24 * ((seed * 0.618) % 1);
  col.multiplyScalar(j);
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  pushQuadBox(arr, b, b.style, seed, col, y0, y1, y0 > 0.5);
  // Masonry gets a real cornice: a slab that juts out under the roof line (visual only; the
  // collision box stays flush).
  if (MASONRY.has(b.style) && y1 - y0 > 12 && b.kind === 'building') {
    const out = 0.45;
    const stone = new THREE.Color(PALETTE.limestone).multiplyScalar(0.95 * j);
    pushQuadBox(arr, { min: [x0 - out, y1 - 0.9, z0 - out], max: [x1 + out, y1 - 0.1, z1 + out] }, 13, seed, stone, y1 - 0.9, y1 - 0.1, true);
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
    if (!chunks.has(k)) chunks.set(k, { pos: [], nrm: [], col: [], sty: [], box: [] });
    pushBox(b, (i * 0.137) % 1 + 0.01, chunks.get(k));
  });
  for (const arr of chunks.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(arr.nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr.col, 3));
    geo.setAttribute('aStyle', new THREE.Float32BufferAttribute(arr.sty, 2));
    geo.setAttribute('aBox', new THREE.Float32BufferAttribute(arr.box, 4));
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
      uInkG: { value: c(PALETTE.ink) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uAsphalt, uSidewalk, uLane, uCross, uGrass, uGrassDark, uPath, uWater, uPier, uInkG;
float gInkG = 0.0;
float inkAt(float d, float pw, float px) { return 1.0 - smoothstep(pw * px * 0.5, pw * (px * 0.5 + 1.0), abs(d)); }
uniform vec4 uGrid, uBounds;
uniform float uWaterZ;
varying vec3 vWPos;
float band(float x, float a, float b) { return step(a, x) * step(x, b); }
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 w = vWPos.xz;
  vec3 col;
  float pw = max(length(fwidth(w)), 1e-4);
  float near = 1.0 - smoothstep(0.04, 0.2, pw);
  bool outside = w.x < uBounds.x - 30.0 || w.x > uBounds.z + 30.0 || w.y < uBounds.y - 30.0 || w.y > uBounds.w + 30.0;
  bool harborWater = w.y > uWaterZ + 6.0 && w.x > -240.0;
  bool park = w.x > 240.0 && w.y < 120.0 && w.x < uBounds.z + 30.0 && w.y > uBounds.y - 30.0;
  if (outside || harborWater) {
    // Comic water: flat blue with rows of little inked wave strokes.
    col = uWater;
    vec2 q = vec2(w.x / 7.0 + floor(w.y / 4.0) * 0.5, w.y / 4.0);
    vec2 f = fract(q);
    float wave = abs(f.y - 0.5 - 0.12 * sin(f.x * 6.2831)) * 4.0;
    float stroke = (1.0 - smoothstep(0.08, 0.2, wave)) * step(0.25, f.x) * step(f.x, 0.75);
    col = mix(col, col * 1.35 + vec3(0.05, 0.08, 0.1), stroke * (0.5 + 0.5 * near));
  } else if (park) {
    float paths = max(band(abs(sin(w.x * 0.021 + sin(w.y * 0.013) * 1.4)), 0.0, 0.035), band(abs(sin(w.y * 0.017 + cos(w.x * 0.011))), 0.0, 0.03));
    col = mix(mix(uGrass, uGrassDark, step(0.55, fract(sin(dot(floor(w / 9.0), vec2(12.9, 78.2))) * 43758.5))), uPath, paths);
    // Grass strokes up close.
    float gs = fract((w.x * 0.9 + w.y * 0.4) / 0.9);
    col = mix(col, col * 0.8, step(0.85, gs) * step(0.5, fract(w.y / 1.3 + w.x * 0.05)) * near * 0.7);
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
      // Worn asphalt: darker patches and tyre tracks.
      float wear = fract(sin(dot(floor(w / 5.0), vec2(12.9, 78.2))) * 43758.5);
      col *= 0.94 + 0.08 * step(0.7, wear);
      // Manholes down the avenues.
      if (avenue && !street) {
        vec2 mh = vec2(da - 7.0, mod(w.y, 37.0) - 18.5);
        float r = length(mh);
        col = mix(col, col * 0.7, 1.0 - smoothstep(0.55, 0.6, r));
        gInkG = max(gInkG, inkAt(r - 0.6, pw, 1.2) * near);
      }
      // The curb: an ink line where the road meets the sidewalk.
      if (avenue) gInkG = max(gInkG, inkAt(da - 15.0, pw, 1.6));
      if (street) gInkG = max(gInkG, inkAt(ds - 9.0, pw, 1.6));
    } else if (walkA || walkS) {
      col = uSidewalk;
      // Paving slabs with inked joints, and the curb line.
      vec2 sl = w / 1.6;
      float joint = max(inkAt(fract(sl.x + 0.5) - 0.5, pw / 1.6, 1.0), inkAt(fract(sl.y + 0.5) - 0.5, pw / 1.6, 1.0));
      gInkG = max(gInkG, joint * 0.35 * near);
      float da2 = min(ax, uGrid.z - ax), ds2 = min(sz, uGrid.w - sz);
      if (walkA) gInkG = max(gInkG, inkAt(da2 - 15.0, pw, 1.6));
      if (walkS) gInkG = max(gInkG, inkAt(ds2 - 9.0, pw, 1.6));
    } else {
      col = uSidewalk * 0.9;
    }
  }
  diffuseColor.rgb = col;
}`)
      .replace('#include <opaque_fragment>', `{
  // Comic shading (shared look with the buildings): three flat tones with cool shadows.
  float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
  float alb = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 1e-3);
  float ratio = lum / alb;
  float t1 = smoothstep(0.5, 0.56, ratio), t2 = smoothstep(0.86, 0.92, ratio);
  vec3 shade = mix(vec3(0.42, 0.47, 0.72), vec3(0.78, 0.8, 0.9), t1);
  shade = mix(shade, vec3(1.06, 1.02, 0.94), t2);
  outgoingLight = mix(diffuseColor.rgb * shade, uInkG, gInkG);
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'city-ground-v2';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}
