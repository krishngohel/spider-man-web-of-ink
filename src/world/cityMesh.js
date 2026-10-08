import * as THREE from 'three';
import { signAtlas } from './signAtlas.js';
import { PALETTE } from '../render/palette.js';
import { toonGradient } from '../render/toon.js';
import { ISLAND, QUEENS, RESERVOIR, BRIDGE } from './city.js';
import { COMIC_SHADE, SHADOW_ALPHA, comicToon, addShadeUniforms } from '../render/comicShade.js';
import { HASH } from '../render/glslHash.js';

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
  17: PALETTE.brownstone, 18: PALETTE.ink, 19: PALETTE.warehouse, 21: PALETTE.house, 22: PALETTE.classical,
  23: PALETTE.industrial, 24: PALETTE.darkGlass, 25: PALETTE.steel, 26: PALETTE.container, 27: PALETTE.kiosk,
};

const shared = { night: { value: 0 }, wet: { value: 0 } };

export function setNight(v) { shared.night.value = v; }
// How wet the streets are (rain): darker asphalt and puddles.
export function setWet(v) { shared.wet.value = v; }

function buildingMaterial() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  mat.onBeforeCompile = (shader) => {
    addShadeUniforms(shader);
    shader.uniforms.uNight = shared.night;
    shader.uniforms.uWinDark = { value: new THREE.Color(PALETTE.windowDark) };
    shader.uniforms.uWinLit = { value: new THREE.Color(PALETTE.windowLit) };
    shader.uniforms.uRoof = { value: new THREE.Color(PALETTE.roof) };
    shader.uniforms.uInk = { value: new THREE.Color(PALETTE.ink) };
    shader.uniforms.uStone = { value: new THREE.Color(PALETTE.limestone) };
    shader.uniforms.uAwning = { value: new THREE.Color(PALETTE.awning) };
    shader.uniforms.uWords = { value: signAtlas() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aStyle;\nattribute vec4 aBox;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nflat varying vec2 vStyle;\nflat varying vec4 vBox;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvWNrm = normal;\nvStyle = aStyle;\nvBox = aBox;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight;
uniform vec3 uWinDark, uWinLit, uRoof, uInk, uStone, uAwning;
uniform sampler2D uWords; // signAtlas.js: shop boards, billboards, neon blades
${COMIC_SHADE}
varying vec3 vWPos;
varying vec3 vWNrm;
// Flat: per-building values must not be interpolated (tiny interpolation error, amplified by the
// window hash, showed up as streaks across the glass).
flat varying vec2 vStyle;
flat varying vec4 vBox;     // face u range (u0, u1) and the building's y range (y0, y1)
float gInk = 0.0;           // ink drawn over the lit colour
float gGlass = 0.0;         // a glass reflection streak, drawn over the lit colour
float gEmit = 0.0;          // a lit window at night, unaffected by light
vec3 gEmitCol = vec3(-1.0); // what lights up (a sign glows its own colour), else the window light
vec2 gPane = vec2(0.5);     // where in its pane this pixel is (0..1), for what is inside a lit room
float gNear = 1.0;          // fine detail fades with distance (1 near, 0 far)
${HASH}
float h21(vec2 p) { return hash12(p); }
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

// A lit room's light: mostly warm lamps in a few tints, some cool office light, now and then a
// television's blue (linear colour, like the uniforms).
vec3 roomLight(float t) {
  return t < 0.5 ? vec3(1.0, 0.58, 0.16) : t < 0.76 ? vec3(1.0, 0.74, 0.34) : t < 0.93 ? vec3(0.62, 0.8, 1.0) : vec3(0.22, 0.42, 1.0);
}
vec3 glassColor(vec2 id, float seed, float u, float v) {
  float r = h21(id + seed * 13.1);
  vec3 g = mix(uWinDark, uWinDark * 1.6 + vec3(0.05, 0.09, 0.14), step(0.7, r));
  // Night: lights come on in clusters (three bays of one floor: an office, a flat), a few windows
  // in a lit cluster still dark. Each building has its own hour: some towers mostly asleep.
  float rc = h21(floor(id / vec2(3.0, 1.0)) + seed * 7.3);
  float occ = 0.2 + 0.32 * fract(seed * 9.17);
  float lit = step(1.0 - occ, rc) * step(0.18, r) * step(0.01, uNight);
  if (lit < 0.5) return g;
  gEmit = max(gEmit, lit * uNight);
  // Inside the room (near only): the lamp's hotspot in two flat bands, then blinds, curtains or
  // someone at the window on some.
  vec3 lc = roomLight(h21(id * 1.7 + seed * 3.1));
  vec2 q = gPane;
  float k = gNear;
  vec2 hp = vec2(0.2 + 0.6 * fract(r * 7.13), 0.32);
  lc *= mix(1.0, 1.0 - 0.16 * step(0.45, length((q - hp) * vec2(1.0, 1.5))), k);
  float kind = fract(r * 31.7);
  if (kind < 0.24) {
    float down = 0.3 + 0.5 * fract(r * 13.3);
    lc *= 1.0 - k * step(1.0 - down, q.y) * (0.22 + 0.2 * step(0.5, fract(q.y * 9.0)));
  } else if (kind < 0.44) {
    float side = 0.16 + 0.12 * (1.0 - q.y);
    lc = mix(lc, lc * vec3(0.55, 0.32, 0.3), k * step(0.5 - side, abs(q.x - 0.5)));
  } else if (kind < 0.52) {
    vec2 c = vec2(0.35 + 0.3 * fract(r * 5.7), 0.5);
    float head = step(length((q - c) * vec2(1.0, 1.6)), 0.13);
    float body = step(abs(q.x - c.x), 0.22) * step(q.y, c.y - 0.12) * step(length(vec2(max(abs(q.x - c.x) - 0.1, 0.0), max(q.y - (c.y - 0.2), 0.0)) * vec2(1.0, 1.6)), 0.14);
    lc = mix(lc, vec3(0.08, 0.06, 0.1), k * max(head, body));
  }
  gEmitCol = lc;
  return mix(g, lc, uNight);
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
  // Giant signs (Neon Square, the Bugle): billboards with real words, neon blades spelling down.
  if (style > 17.5 && style < 18.5) {
    float h = fract(seed * 13.7);
    vec2 sp = vec2((u - u0) / max(u1 - u0, 0.1), (v - y0) / max(y1 - y0, 0.1));
    // Read left to right from in front, whichever way the face points.
    if ((xFace && vWNrm.x > 0.0) || (!xFace && vWNrm.z < 0.0)) sp.x = 1.0 - sp.x;
    vec2 st = vec2(sp.x, 1.0 - sp.y);
    float asp = (u1 - u0) / max(y1 - y0, 0.1);
    if (asp < 0.6) {
      float i = floor(h * 8.0);
      col = texture2D(uWords, vec2(1536.0 + mod(i, 4.0) * 128.0 + 4.0 + st.x * 120.0, 1024.0 + floor(i / 4.0) * 512.0 + 4.0 + st.y * 504.0) / 2048.0).rgb;
    } else {
      float i = y0 > 110.0 ? 11.0 : floor(h * 11.0);
      col = texture2D(uWords, vec2(mod(i, 3.0) * 512.0 + 2.0 + st.x * 508.0, 1024.0 + floor(i / 3.0) * 256.0 + 2.0 + st.y * 252.0) / 2048.0).rgb;
    }
    // A neon flicker now and then on some signs.
    gEmit = max(gEmit, 0.25 + 0.75 * uNight);
    gEmitCol = min(col * (1.0 + 0.25 * uNight), vec3(1.0)); // neon keeps its colour at night
    gInk = max(gInk, hline(top, 0.0, pw, 1.8));
    return col;
  }
  // Shipping containers: a colour per box, corrugated.
  if (style > 25.5 && style < 26.5) {
    float h = fract(seed * 7.9);
    col = h < 0.25 ? vec3(0.75, 0.25, 0.18) : h < 0.5 ? vec3(0.2, 0.42, 0.7) : h < 0.75 ? vec3(0.28, 0.55, 0.32) : vec3(0.85, 0.55, 0.18);
    col = mix(col, col * 0.78, step(0.5, fract(u / 0.6)) * gNear * 0.7);
    gInk = max(gInk, hline(top, 0.0, pw, 1.6));
    gInk = max(gInk, hline(mod(v, 2.6), 0.0, pw, 1.2));
    return col;
  }
  // Props, cranes, bridge steel, kiosks and cornice slabs: flat colour, inked edges, nothing else.
  if ((style > 8.5 && style < 16.5) || style > 19.5 && style < 20.5 || style > 24.5) {
    gInk = max(gInk, hline(top, 0.0, pw, 1.8));
    if (style > 13.5 && style < 14.5) col = mix(base, base * 0.75, step(0.5, fract(v / 0.25)) * gNear * 0.5); // AC grille
    if (style > 24.5 && style < 25.5) col = mix(base, base * 0.82, step(0.5, fract(v / 1.2)) * gNear * 0.5); // bridge plates
    if (style > 26.5) { col = mix(base, vec3(0.95, 0.9, 0.7), step(2.3, v - y0) * 0.8); } // kiosk: lit sign band on top
    return col;
  }
  // Queens houses: pastel siding, a colour per house.
  if (style > 20.5 && style < 21.5) {
    float h = fract(seed * 5.3);
    base = h < 0.25 ? vec3(0.86, 0.8, 0.62) : h < 0.5 ? vec3(0.7, 0.8, 0.86) : h < 0.75 ? vec3(0.88, 0.72, 0.66) : vec3(0.78, 0.86, 0.7);
    col = mix(base, base * 0.9, step(0.5, fract(v / 0.3)) * gNear * 0.5);
  }
  // Warehouses: vertical corrugation.
  if (style > 18.5 && style < 19.5) col = mix(base, base * 0.82, step(0.5, fract(u / 0.7)) * gNear * 0.6);
  // Classical fronts: fluted columns.
  if (style > 21.5 && style < 22.5) col = mix(base, base * 0.86, step(0.7, fract(u / 1.1)) * gNear * 0.7);

  // Glass curtain wall (24: the dark glass of Oscorp and Fisk).
  if ((style > 1.5 && style < 2.5) || (style > 23.5 && style < 24.5)) {
    vec2 cell = vec2(1.6, 3.6);
    vec2 g = (p - vec2(u0, y0)) / cell;
    vec2 f = fract(g), id = floor(g);
    // Comic glass: one flat blue per tower, catching the sky toward the top; panes only differ
    // at night, when some light up.
    float hgt = clamp((v - y0) / max(y1 - y0, 1.0), 0.0, 1.0);
    vec3 tint = uWinDark * (1.25 + 0.35 * fract(seed * 5.3)) + vec3(0.04, 0.07, 0.12);
    if (style > 23.5) tint = base * 1.1;
    col = mix(tint, tint * 1.45 + vec3(0.06, 0.08, 0.1), smoothstep(0.35, 1.0, hgt));
    float r = h21(id + seed * 13.1);
    float rc = h21(floor(id / vec2(4.0, 1.0)) + seed * 5.9);
    float litG = step(1.0 - (0.18 + 0.3 * fract(seed * 7.7)), rc) * step(0.2, r);
    gEmit = max(gEmit, litG * uNight);
    if (litG > 0.5) gEmitCol = roomLight(h21(id * 1.3 + seed)) * (0.8 + 0.2 * r);
    col = mix(col, uWinLit * (0.75 + 0.25 * r), gEmit);
    // Mullions and floor slabs.
    float mull = max(1.0 - smoothstep(0.0, fwidth(g.x) * 1.5, min(f.x, 1.0 - f.x)), 1.0 - smoothstep(0.0, fwidth(g.y) * 2.5, min(f.y, 1.0 - f.y)));
    col = mix(col, col * 0.55, mull * 0.7 * lineK);
    // Big diagonal reflection bands across the whole wall (the comic "shine"): one wide, one thin.
    float band = fract((u * 0.8 + v * 0.55) / 26.0 + seed * 3.7);
    gGlass = max(gGlass, (step(band, 0.09) + step(0.13, band) * step(band, 0.15)) * 0.8);
    gInk = max(gInk, hline(top, 0.0, pw, 2.0));
    return col;
  }

  // Masonry under its cornice slab (pushBox): the slab's flat ink shadow on the wall below it.
  bool slab = (style < 1.5 || (style > 2.5 && style < 3.5) || (style > 6.5 && style < 7.5) || (style > 16.5 && style < 17.5) || (style > 21.5 && style < 23.5)) && y1 - y0 > 12.0;
  if (slab && top > 0.9 && top < 1.25) return mix(base, uStone, 0.65) * 0.28;
  // A belt course a third of the way up tall masonry: a stone band with its own shadow line.
  float belt = y0 + 0.36 * (y1 - y0);
  if (slab && y1 - y0 > 24.0 && abs(v - belt) < 0.45) {
    col = mix(base, uStone, 0.7) * (v < belt - 0.25 ? 0.4 : 1.0);
    gInk = max(gInk, max(hline(v, belt + 0.45, pw, 1.4), hline(v, belt - 0.45, pw, 1.4)) * lineK);
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
      gPane = vec2((fx - lo.x) / (hi.x - lo.x), (sv - lo.y) / (hi.y - lo.y));
      col = glassColor(vec2(floor((u - u0) / bay), 99.0), seed, u, v);
      float shopId = floor((u - u0) / bay);
      if (h21(vec2(shopId, seed * 3.3)) > 0.22) {
        vec3 sc = mix(vec3(1.0, 0.7, 0.32), vec3(0.8, 0.9, 1.0), step(0.75, h21(vec2(seed, shopId))));
        // Shelves and goods: two inked shelf lines and a row of coloured blocks on each.
        float shelf = max(hline(sv, 1.25, max(length(fwidth(vec2(u, v))), 1e-4), 1.6), hline(sv, 2.15, max(length(fwidth(vec2(u, v))), 1e-4), 1.6));
        float goodsRow = step(0.0, sv - 1.25) * step(sv - 1.25, 0.32) + step(0.0, sv - 2.15) * step(sv - 2.15, 0.32);
        vec3 goods = roomLight(h21(vec2(floor(u * 2.3), shopId))) * vec3(0.9, 0.5, 0.45);
        sc = mix(sc, goods, goodsRow * gNear * step(0.35, fract(u * 2.3)));
        sc = mix(sc, vec3(0.2, 0.14, 0.12), shelf * gNear);
        gEmit = max(gEmit, uNight);
        gEmitCol = sc;
        col = mix(col, sc, uNight);
      }
      gGlass = max(gGlass, step(fract((u * 0.8 + sv) / 3.0), 0.12) * 0.5);
    }
    // Awning stripe over each shop, a colour per shop (the city green, red, navy, mustard, maroon,
    // teal), striped with cream on some.
    float shopN = floor((u - u0) / bay);
    float board = h21(vec2(shopN * 1.37, seed * 9.1));
    if (board < 0.55 && sv > 3.4 && sv < 4.55 && fx > 0.04 && fx < 0.96) {
      vec2 sb = vec2((fx - 0.04) / 0.92, (sv - 3.4) / 1.15);
      if ((xFace && vWNrm.x > 0.0) || (!xFace && vWNrm.z < 0.0)) sb.x = 1.0 - sb.x;
      float ti = floor(h21(vec2(shopN, seed * 3.7)) * 64.0);
      col = texture2D(uWords, vec2(mod(ti, 4.0) * 512.0 + 2.0 + sb.x * 508.0, floor(ti / 4.0) * 64.0 + 2.0 + (1.0 - sb.y) * 60.0) / 2048.0).rgb;
      // Lit from the shop below at night.
      gEmit = max(gEmit, 0.55 * uNight);
      gEmitCol = col * 1.1;
      gInk = max(gInk, hline(sv, 4.55, pw, 1.6) * lineK);
      return col;
    }
    if (sv > 3.4 && sv < 4.2) {
      float ah = fract(sin(floor((u - u0) / bay) * 12.9898 + seed * 78.233) * 43758.5453);
      vec3 aw = ah < 0.3 ? uAwning : ah < 0.45 ? vec3(0.72, 0.16, 0.14) : ah < 0.6 ? vec3(0.16, 0.24, 0.48) : ah < 0.72 ? vec3(0.86, 0.64, 0.18) : ah < 0.86 ? vec3(0.45, 0.12, 0.16) : vec3(0.12, 0.5, 0.52);
      float stripes = step(0.5, fract(ah * 7.0)) * step(0.5, fract(u / 0.8));
      col = mix(aw, uStone, max(step(0.5, fract(u / 0.8)) * 0.25, stripes * 0.85));
    }
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
  float floorH = style < 0.5 ? 3.3 : style < 1.5 ? 3.8 : style < 3.5 ? 3.6 : style < 8.5 ? 4.2 : style < 17.5 ? 3.6 : style < 19.5 ? 5.0 : style < 21.5 ? 3.0 : style < 22.5 ? 6.0 : 6.0;
  float bayW = style < 0.5 ? 2.8 : style < 1.5 ? 3.2 : style < 3.5 ? 6.0 : style < 8.5 ? 1.8 : style < 17.5 ? 2.6 : style < 19.5 ? 4.0 : style < 21.5 ? 3.0 : style < 22.5 ? 4.4 : 5.0;
  float vStart = streetLevel ? y0 + 4.6 : y0;
  vec2 cellP = vec2(u - u0 - pil, v - vStart);
  vec2 g = cellP / vec2(bayW, floorH);
  vec2 f = fract(g), id = floor(g);
  vec2 wlo, whi;
  if (style > 2.5 && style < 3.5) { wlo = vec2(0.02, 0.32); whi = vec2(0.98, 0.78); }      // ribbon windows
  else if (style > 22.5) { wlo = vec2(0.14, 0.3); whi = vec2(0.86, 0.86); }               // industrial: big
  else if (style > 21.5) { wlo = vec2(0.36, 0.16); whi = vec2(0.64, 0.84); }              // classical: tall, narrow
  else if (style > 20.5) { wlo = vec2(0.3, 0.34); whi = vec2(0.7, 0.76); }                // house
  else if (style > 18.5) { wlo = vec2(0.16, 0.66); whi = vec2(0.84, 0.86); }              // warehouse: a high band
  else if (style > 16.5) { wlo = vec2(0.28, 0.2); whi = vec2(0.72, 0.84); }               // brownstone
  else if (style > 6.5) { wlo = vec2(0.3, 0.1); whi = vec2(0.7, 0.86); }                  // deco: narrow, tall
  else if (style > 0.5) { wlo = vec2(0.24, 0.2); whi = vec2(0.76, 0.84); }                // sandstone: tall
  else { wlo = vec2(0.22, 0.26); whi = vec2(0.78, 0.8); }                                 // brick
  vec2 fp = f * vec2(bayW, floorH);
  vec2 lo = wlo * vec2(bayW, floorH), hi = whi * vec2(bayW, floorH);
  float inWin = inside(fp, lo, hi);
  // Fire escapes (brick, brownstone, industrial walls wider than 12 m): a painted iron stack over
  // two bays, a landing and railing on every floor and a stair running between them, near only.
  bool escapeStyle = style < 0.5 || (style > 16.5 && style < 17.5) || style > 22.5;
  float nBays = floor((u1 - u0 - 2.0 * pil) / bayW);
  float bx0 = floor(fract(seed * 5.1) * max(1.0, nBays - 2.0));
  float ex = (u - u0 - pil) / bayW - bx0;
  // A big shape: it fades further out than the fine detail (about 70 m, not 25 m).
  float escK = 1.0 - smoothstep(0.08, 0.35, pw);
  float escFill = 0.0;
  const vec3 IRON = vec3(0.1, 0.09, 0.11);
  if (escapeStyle && nBays >= 3.0 && u1 - u0 > 12.0 && escK > 0.05 && ex > 0.0 && ex < 2.0 && id.y >= 0.0) {
    float fy = fp.y;
    float landing = 1.0 - step(0.38, fy);
    float rail = max(hline(fy, 1.1, pw, 1.8), hline(fy, 0.75, pw, 1.0) * 0.7);
    float bars = (1.0 - smoothstep(pw * 0.6, pw * 1.6, abs(fract(ex * 5.0) - 0.5) * bayW / 5.0)) * step(fy, 1.1) * step(0.38, fy);
    float dir = mod(id.y, 2.0) < 0.5 ? 1.0 : -1.0;
    float sx = dir > 0.0 ? ex / 2.0 : 1.0 - ex / 2.0;
    // The stair: a band between two inked stringers, climbing to the next landing.
    float sd = fy - sx * floorH;
    float stair = max(hline(sd, 0.0, pw, 2.2), hline(sd, 0.45, pw, 1.4)) * step(0.38, fy);
    escFill = max(landing * 0.92, step(0.0, sd) * step(sd, 0.45) * step(0.38, fy) * 0.85) * escK;
    gInk = max(gInk, max(max(rail, bars), stair) * escK);
    gInk = max(gInk, hline(fy, 0.38, pw, 1.6) * escK);
  }
  // A building in three parts (masonry): the top two floors get arched windows under a stone
  // ring; the floors below get a stone lintel with a keystone and an ink shadow under each sill.
  bool masonryW = style < 1.5 || (style > 16.5 && style < 17.5) || (style > 21.5 && style < 22.5);
  float nFloors = floor((y1 - vStart) / floorH);
  bool crown = masonryW && nFloors >= 5.0 && id.y >= nFloors - 2.0 && lineK > 0.02;
  float archRing = 0.0;
  if (crown) {
    float hw = (hi.x - lo.x) * 0.5;
    vec2 cc = vec2((lo.x + hi.x) * 0.5, hi.y - hw);
    float dA = length(fp - cc);
    if (fp.y > cc.y && dA > hw) {
      inWin = 0.0;
      // The voussoirs: a stone ring round the arch, inked on both edges.
      if (dA < hw + 0.2 && fp.y < hi.y + 0.2) archRing = 1.0;
      gInk = max(gInk, max(hline(dA, hw, pw, 1.3), hline(dA, hw + 0.2, pw, 1.0) * archRing) * lineK);
    }
  }
  if (inWin > 0.5) {
    gPane = (fp - lo) / max(hi - lo, vec2(1e-3));
    col = glassColor(id, seed, u, v);
    // A diagonal highlight in the top corner of each pane.
    float s = (fp.x - lo.x) + (hi.y - fp.y);
    gGlass = max(gGlass, step(0.25, s) * step(s, 0.55) * 0.45 * lineK);
    // The pane sits in a reveal: its top and left edges in shadow (spec G7).
    float reveal = max(step(hi.y - 0.18 * (hi.y - lo.y), fp.y), step(fp.x, lo.x + 0.1 * (hi.x - lo.x)));
    col = mix(col, col * 0.55, reveal * (1.0 - gEmit) * lineK * 0.85);
    // Window types for brick and sandstone, by building: single, split, or four panes.
    if (style < 1.5) {
      float wt = floor(fract(seed * 3.7) * 3.0);
      if (wt > 0.5) gInk = max(gInk, hline(fp.x, (lo.x + hi.x) * 0.5, pw, 1.0) * lineK);
      if (wt > 1.5) gInk = max(gInk, hline(fp.y, (lo.y + hi.y) * 0.5, pw, 1.0) * lineK);
    }
  } else {
    // Deco piers: vertical ribs between the window columns.
    if (style > 6.5) col = mix(base, base * 1.12, step(0.86, f.x) + step(f.x, 0.14));
    // Brick coursing, up close only (brick, brownstone, industrial).
    if (style < 0.5 || (style > 16.5 && style < 17.5) || style > 22.5) col = mix(col, col * 0.82, (1.0 - smoothstep(0.0, fwidth(v / 0.3) * 1.2, min(fract(v / 0.3), 1.0 - fract(v / 0.3)))) * gNear * 0.6);
    // Sill under each window, with its cast shadow on the wall just below.
    if (fp.y < lo.y && fp.y > lo.y - 0.22 && fp.x > lo.x - 0.1 && fp.x < hi.x + 0.1) col = mix(col, uStone, 0.75);
    if (masonryW && fp.y < lo.y - 0.22 && fp.y > lo.y - 0.36 && fp.x > lo.x - 0.06 && fp.x < hi.x + 0.06) col *= 0.55;
    // Stone lintel over the window with a keystone (below the arched crown floors).
    if (masonryW && !crown && fp.y > hi.y && fp.y < hi.y + 0.24 && fp.x > lo.x - 0.12 && fp.x < hi.x + 0.12) {
      float key = step(abs(fp.x - (lo.x + hi.x) * 0.5), 0.13);
      col = mix(col, uStone * (key > 0.5 ? 0.9 : 1.0), 0.8);
      gInk = max(gInk, max(hline(fp.y, hi.y + 0.24, pw, 1.0), key * max(hline(fp.x, (lo.x + hi.x) * 0.5 - 0.13, pw, 1.0), hline(fp.x, (lo.x + hi.x) * 0.5 + 0.13, pw, 1.0))) * lineK);
    }
    if (archRing > 0.5) col = mix(col, uStone, 0.8);
  }
  // The fire escape hangs in front of windows and wall alike.
  col = mix(col, IRON * 1.2, escFill);
  gInk = max(gInk, frame(fp, lo, hi, pw, 1.3) * lineK * (1.0 - escFill));
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
  gAuxId = seed; // each building its own id, for the ink pass's object edges
  vec3 base = diffuseColor.rgb;
  bool propStyle = (style > 8.5 && style < 16.5) || style > 17.5 && style < 18.5 || style > 19.5 && style < 20.5 || style > 24.5;
  if (vWNrm.y > 0.5 && !propStyle) {
    // Roof: tar paper with a few seams, the parapet edge inked.
    base = uRoof * (0.85 + 0.3 * fract(seed * 7.3));
    float pw = max(length(fwidth(vWPos.xz)), 1e-4);
    vec2 r = vWPos.xz;
    float seam = 1.0 - smoothstep(0.0, fwidth(r.x / 4.0) * 1.2, min(fract(r.x / 4.0), 1.0 - fract(r.x / 4.0)));
    base = mix(base, base * 0.8, seam * 0.5);
    float edge = min(min(vWPos.x - vBox.x, vBox.y - vWPos.x), min(vWPos.z - vBox.z, vBox.w - vWPos.z));
    gInk = max(gInk, 1.0 - smoothstep(pw * 1.1, pw * 2.2, edge));
  } else if (vWNrm.y > 0.5 && style > 13.5 && style < 14.5 && vBox.y - vBox.x > 1.0) {
    // An AC unit's top: a round fan grille with an inked rim and a cross of blades.
    float pw = max(length(fwidth(vWPos.xz)), 1e-4);
    vec2 c = vec2((vBox.x + vBox.y) * 0.5, (vBox.z + vBox.w) * 0.5);
    float rad = 0.42 * min(vBox.y - vBox.x, vBox.w - vBox.z);
    vec2 q = vWPos.xz - c;
    float d = length(q);
    if (d < rad) {
      base = base * 0.45;
      float blade = step(abs(q.x), 0.05) + step(abs(q.y), 0.05);
      base = mix(base, base * 2.0, min(blade, 1.0));
    }
    gInk = max(gInk, 1.0 - smoothstep(pw * 0.6, pw * 1.8, abs(d - rad)));
  } else if (abs(vWNrm.y) < 0.5) {
    base = facade(base, style, seed);
    // A rooftop stair hut: a door on its street-facing side with a lamp over it, lit at night.
    if (style > 14.5 && style < 15.5 && vWNrm.z > 0.5) {
      float du2 = vWPos.x - (vBox.x + vBox.y) * 0.5, dv = vWPos.y - vBox.z;
      float pw = max(length(fwidth(vWPos.xy)), 1e-4);
      if (abs(du2) < 0.5 && dv < 2.0) { base = vec3(0.32, 0.22, 0.16); gInk = max(gInk, 1.0 - smoothstep(pw, pw * 2.2, min(0.5 - abs(du2), 2.0 - dv))); }
      if (abs(du2) < 0.14 && dv > 2.15 && dv < 2.35) { base = vec3(1.0, 0.85, 0.5); gEmit = max(gEmit, uNight); gEmitCol = vec3(1.0, 0.8, 0.45); }
    }
  }
  diffuseColor.rgb = base;
}`)
      .replace('#include <opaque_fragment>', `{
  // Comic shading: three flat tones from the lighting, with cool hue-shifted shadows and a warm
  // sunlit tone, cross-hatching in shadow up close, then ink and glass shine on top.
  vec3 c = comicPattern(comicShade(diffuseColor.rgb, outgoingLight));
  c = mix(c, vec3(0.9, 0.95, 1.0), gGlass * (1.0 - 0.55 * gShadow));
  c = mix(c, gEmitCol.r < 0.0 ? uWinLit : gEmitCol, gEmit);
  c = mix(c, uInk, clamp(gInk, 0.0, 1.0));
  outgoingLight = c;
}
#include <opaque_fragment>`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>${SHADOW_ALPHA}`);
  };
  mat.customProgramCacheKey = () => 'city-building-v16';
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

const MASONRY = new Set([0, 1, 3, 7, 17, 22, 23]);
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
  // A parapet round every flat roof (not the glass towers): a low lip that gives each roof a
  // silhouette against the sky. Visual only and kept low (the hero perches on the collision roof
  // at the edge, so a tall wall would swallow his feet).
  if (b.kind === 'building' && !GLASS.has(b.style) && y1 - y0 > 8 && x1 - x0 > 6 && z1 - z0 > 6) {
    const H = 0.55, T = 0.32;
    const lip = col.clone().multiplyScalar(0.82);
    for (const [a0, a1, c0, c1] of [[x0, x1, z0, z0 + T], [x0, x1, z1 - T, z1], [x0, x0 + T, z0 + T, z1 - T], [x1 - T, x1, z0 + T, z1 - T]]) {
      pushQuadBox(arr, { min: [a0, y1, c0], max: [a1, y1 + H, c1] }, 13, seed, lip, y1, y1 + H, false);
    }
  }
}
const GLASS = new Set([2, 24, 9, 13, 14, 15, 16, 18]);

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
    const tm = new THREE.InstancedMesh(tg, comicToon({ color: PALETTE.trunk }), trunks.length);
    trunks.forEach((b, i) => {
      p.set((b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2);
      s.set(1, b.max[1] - b.min[1], 1);
      tm.setMatrixAt(i, m4.compose(p, q, s));
    });
    tm.castShadow = quality.shadows;
    group.add(tm);
    const cg = new THREE.SphereGeometry(1, 14, 10);
    const cm = new THREE.InstancedMesh(cg, comicToon({ color: PALETTE.leaves }), crowns.length);
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
    const tm = new THREE.InstancedMesh(geo, comicToon({ color: PALETTE.waterTower }), towers.length);
    towers.forEach((b, i) => {
      p.set((b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2);
      s.set(1, 1, 1);
      tm.setMatrixAt(i, m4.compose(p, q, s));
    });
    tm.castShadow = quality.shadows;
    group.add(tm);
  }

  if (city.kind === 'full') group.add(buildBridgeCables(quality));
  group.add(buildGround(city));
  scene.add(group);
  return group;
}

// The bridge's main cables (a sag between the towers, straight down to the anchorages) and the
// vertical suspenders. Visual only: the collision is the deck and the towers.
function buildBridgeCables(quality) {
  const B = BRIDGE, parts = [];
  const top = B.towerH - 5, [t0, t1] = B.towers;
  for (const s of [-1, 1]) {
    const z = B.z + s * (B.width / 2 + 1);
    const pts = [];
    pts.push(new THREE.Vector3(B.x0 - 30, B.deckY, z));
    pts.push(new THREE.Vector3(t0, top, z));
    for (let i = 1; i < 12; i++) {
      const x = t0 + (t1 - t0) * (i / 12);
      const k = (x - t0) / (t1 - t0);
      pts.push(new THREE.Vector3(x, top - 4 * (top - B.deckY - 6) * k * (1 - k), z));
    }
    pts.push(new THREE.Vector3(t1, top, z));
    pts.push(new THREE.Vector3(B.x1 + 30, B.deckY, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
    parts.push(new THREE.TubeGeometry(curve, 80, 0.45, 6, false));
    for (let x = t0 + 8; x < t1 - 4; x += 8) {
      const k = (x - t0) / (t1 - t0);
      const y = top - 4 * (top - B.deckY - 6) * k * (1 - k);
      const g = new THREE.CylinderGeometry(0.12, 0.12, y - B.deckY, 4);
      g.translate(x, (y + B.deckY) / 2, z);
      parts.push(g);
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), comicToon({ color: PALETTE.steel }));
  mesh.castShadow = quality.shadows;
  return mesh;
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
  const size = 9000;
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(400, 0, 0);
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() });
  const c = (h) => new THREE.Color(h);
  const L = city.land;
  const landTex = new THREE.DataTexture(L.data, L.w, L.h, THREE.RedFormat, THREE.UnsignedByteType);
  landTex.minFilter = THREE.NearestFilter; landTex.magFilter = THREE.NearestFilter;
  landTex.needsUpdate = true;
  const g = city.grid;
  mat.onBeforeCompile = (shader) => {
    addShadeUniforms(shader);
    Object.assign(shader.uniforms, {
      uAsphalt: { value: c(PALETTE.asphalt) }, uSidewalk: { value: c(PALETTE.sidewalk) },
      uLane: { value: c(PALETTE.laneMark) }, uCross: { value: c(PALETTE.crosswalk) },
      uGrass: { value: c(PALETTE.grass) }, uGrassDark: { value: c(PALETTE.grassDark) },
      uPath: { value: c(PALETTE.path) }, uWater: { value: c(PALETTE.water) }, uPier: { value: c(PALETTE.pier) },
      uPlaza: { value: c(PALETTE.plaza) },
      uGrid: { value: new THREE.Vector4(g.minX, g.minZ, g.avenueEvery, g.streetEvery) },
      uIsland: { value: new THREE.Vector4(ISLAND.minX, ISLAND.minZ, ISLAND.maxX, ISLAND.maxZ) },
      uQueens: { value: new THREE.Vector4(QUEENS.minX, QUEENS.minZ, QUEENS.maxX, QUEENS.maxZ) },
      uCorners: { value: new THREE.Vector2(ISLAND.corner, QUEENS.corner) },
      uRes: { value: new THREE.Vector4(RESERVOIR.cx, RESERVOIR.cz, RESERVOIR.rx, RESERVOIR.rz) },
      uLand: { value: landTex },
      uLandBox: { value: new THREE.Vector4(L.minX, L.minZ, L.w * L.cell, L.h * L.cell) },
      uInkG: { value: c(PALETTE.ink) },
      uNightG: shared.night,
      uWetG: shared.wet,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uAsphalt, uSidewalk, uLane, uCross, uGrass, uGrassDark, uPath, uWater, uPier, uPlaza, uInkG;
uniform vec4 uGrid, uIsland, uQueens, uRes, uLandBox;
uniform vec2 uCorners;
uniform float uNightG, uWetG;
uniform sampler2D uLand;
float gInkG = 0.0;
float gPoolG = 0.0;   // a street lamp's pool of light on the ground (lit at night, after shading)
${HASH}
float inkAt(float d, float pw, float px) { return 1.0 - smoothstep(pw * px * 0.5, pw * (px * 0.5 + 1.0), abs(d)); }
varying vec3 vWPos;
float band(float x, float a, float b) { return step(a, x) * step(x, b); }
// Signed distance to a rounded rectangle (negative inside).
float sdRound(vec2 p, vec4 r, float c) {
  vec2 ctr = (r.xy + r.zw) * 0.5, h = (r.zw - r.xy) * 0.5 - c;
  vec2 q = abs(p - ctr) - h;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - c;
}
${COMIC_SHADE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 w = vWPos.xz;
  vec3 col;
  float pw = max(length(fwidth(w)), 1e-4);
  float near = 1.0 - smoothstep(0.04, 0.2, pw);
  float sdI = sdRound(w, uIsland, uCorners.x), sdQ = sdRound(w, uQueens, uCorners.y);
  float coast = min(sdI, sdQ);
  vec2 luv = (w - uLandBox.xy) / uLandBox.zw;
  float t = (luv.x < 0.0 || luv.y < 0.0 || luv.x > 1.0 || luv.y > 1.0) ? 0.0 : floor(texture2D(uLand, luv).r * 255.0 + 0.5);
  float res = length((w - uRes.xy) / uRes.zw);
  bool water = (coast > 0.0 && t < 3.5) || (coast > 0.0 && t > 4.5) || (res < 1.0 && sdI < 0.0);
  bool pier = t > 3.5 && t < 4.5;
  if (water && !pier) {
    // Comic water: flat blue with rows of little inked wave strokes, a pale band along the shore.
    col = uWater;
    vec2 q = vec2(w.x / 7.0 + floor(w.y / 4.0) * 0.5, w.y / 4.0);
    vec2 f = fract(q);
    float wave = abs(f.y - 0.5 - 0.12 * sin(f.x * 6.2831)) * 4.0;
    float stroke = (1.0 - smoothstep(0.08, 0.2, wave)) * step(0.25, f.x) * step(f.x, 0.75);
    col = mix(col, col * 1.35 + vec3(0.05, 0.08, 0.1), stroke * (0.5 + 0.5 * near));
    float shoreD = res < 1.0 ? (1.0 - res) * uRes.w : coast;
    col = mix(col, col * 1.25 + vec3(0.08), (1.0 - smoothstep(0.0, 6.0, shoreD)) * 0.6);
  } else if (pier) {
    // Wooden piers: planks across, inked joints.
    col = uPier * (0.92 + 0.12 * step(0.5, hash12(vec2(floor(w.y / 0.9), 7.0))));
    gInkG = max(gInkG, inkAt(fract(w.y / 0.9 + 0.5) - 0.5, pw / 0.9, 1.0) * 0.5 * near);
  } else if (coast > -4.0 && coast <= 0.0) {
    // The seawall: a stone edge with a strong ink line where it meets the water.
    col = uSidewalk * 0.85;
    gInkG = max(gInkG, inkAt(coast, pw, 2.2));
  } else if (t > 1.5 && t < 2.5) {
    float paths = max(band(abs(sin(w.x * 0.021 + sin(w.y * 0.013) * 1.4)), 0.0, 0.035), band(abs(sin(w.y * 0.017 + cos(w.x * 0.011))), 0.0, 0.03));
    // Two greens in soft drifts (a hard 9 m checker read as pixels from the air).
    float drift = smoothstep(0.35, 0.65, sin(w.x * 0.013 + sin(w.y * 0.009) * 2.0) * 0.5 + 0.5);
    col = mix(mix(uGrass, uGrassDark, drift * 0.7), uPath, paths);
    float gs = fract((w.x * 0.9 + w.y * 0.4) / 0.9);
    col = mix(col, col * 0.8, step(0.85, gs) * step(0.5, fract(w.y / 1.3 + w.x * 0.05)) * near * 0.7);
    if (res < 1.08) { col = uSidewalk; gInkG = max(gInkG, inkAt((res - 1.0) * uRes.w, pw, 1.8)); }
  } else if (t > 2.5 && t < 3.5) {
    // Plazas: big warm paving slabs.
    col = uPlaza;
    vec2 sl = w / 3.0;
    float joint = max(inkAt(fract(sl.x + 0.5) - 0.5, pw / 3.0, 1.0), inkAt(fract(sl.y + 0.5) - 0.5, pw / 3.0, 1.0));
    col = mix(col, col * 0.9, step(0.5, hash12(floor(sl))) * 0.6);
    gInkG = max(gInkG, joint * 0.4 * near);
  } else if (t > 4.5 && t < 5.5) {
    // The rail yard: gravel, timber ties and two steel rails per track, tracks along z.
    float gr = hash12(floor(w * 1.7));
    col = mix(uSidewalk * 0.72, uAsphalt * 1.1, 0.4 + 0.3 * gr);
    float tx = mod(w.x + 1425.0 - 12.0 + 6.75, 13.5) - 6.75;
    if (abs(tx) < 1.4) {
      col = mix(col, uPier * 0.8, step(0.55, fract(w.y / 0.75)));
      float rail = min(abs(abs(tx) - 0.72), 1.0);
      col = mix(col, vec3(0.55, 0.56, 0.6), 1.0 - smoothstep(0.06, 0.1, rail));
      gInkG = max(gInkG, inkAt(rail - 0.09, pw, 1.0) * near);
    }
  } else {
    float ax = mod(w.x - uGrid.x, uGrid.z);
    float sz = mod(w.y - uGrid.y, uGrid.w);
    bool avenue = ax < 15.0 || ax > uGrid.z - 15.0;
    bool street = sz < 9.0 || sz > uGrid.w - 9.0;
    bool walkA = (ax >= 15.0 && ax < 18.0) || (ax > uGrid.z - 18.0 && ax <= uGrid.z - 15.0);
    bool walkS = (sz >= 9.0 && sz < 12.0) || (sz > uGrid.w - 12.0 && sz <= uGrid.w - 9.0);
    bool suburb = t > 5.5 && t < 6.5;
    if (avenue || street) {
      col = uAsphalt;
      float da = min(ax, uGrid.z - ax), ds = min(sz, uGrid.w - sz);
      if (avenue && !street && abs(da) < 0.5 && abs(da) > 0.15) col = uLane;
      if (street && !avenue && ds < 0.18 && fract(w.x / 6.0) < 0.5) col = uLane;
      if (avenue && street) {
        if (ds > 6.0 && ds < 9.0 && fract(w.x / 1.4) < 0.5) col = uCross;
        if (da > 12.0 && da < 15.0 && fract(w.y / 1.4) < 0.5) col = uCross;
      }
      float wear = hash12(floor(w / 5.0));
      col *= 0.94 + 0.08 * step(0.7, wear);
      // Rain: the road darkens and puddles stand in some 6 m cells: dark water with a cool sheen
      // and a couple of hard paper-white slivers of reflected sky.
      if (uWetG > 0.01) {
        col *= 1.0 - 0.2 * uWetG;
        vec2 pc = floor(w / 6.0);
        float ph = hash12(pc + 17.0);
        if (ph < 0.38) {
          vec2 c0 = (pc + 0.5 + (vec2(hash12(pc + 3.1), hash12(pc + 9.7)) - 0.5) * 0.9) * 6.0;
          vec2 d0 = (w - c0) / vec2(1.3 + 1.2 * ph * 2.6, 0.9 + 0.8 * hash12(pc + 5.0));
          float pr = length(d0) + 0.12 * sin(atan(d0.y, d0.x) * 3.0 + ph * 40.0);
          float inP = (1.0 - step(1.0, pr)) * uWetG;
          float sliver = step(0.86, fract(dot(w, vec2(0.35, 1.0)) * 0.9)) * step(pr, 0.75) * near;
          col = mix(col, mix(col * 0.5 + vec3(0.03, 0.045, 0.07), vec3(0.85, 0.88, 0.95), sliver * 0.8), inP);
          gInkG = max(gInkG, inkAt(pr - 1.0, pw, 1.0) * inP * near * 0.6);
        }
      }
      if (avenue && !street) {
        vec2 mh = vec2(da - 7.0, mod(w.y, 37.0) - 18.5);
        float r = length(mh);
        col = mix(col, col * 0.7, 1.0 - smoothstep(0.55, 0.6, r));
        gInkG = max(gInkG, inkAt(r - 0.6, pw, 1.2) * near);
      }
      if (avenue) gInkG = max(gInkG, inkAt(da - 15.0, pw, 1.6));
      if (street) gInkG = max(gInkG, inkAt(ds - 9.0, pw, 1.6));
    } else if (suburb) {
      // Queens: lawns, a strip of sidewalk along the road.
      col = (walkA || walkS) ? uSidewalk : mix(uGrass, uGrassDark, step(0.6, hash12(floor(w / 7.0))));
    } else if (walkA || walkS) {
      col = uSidewalk;
      vec2 sl = w / 1.6;
      float joint = max(inkAt(fract(sl.x + 0.5) - 0.5, pw / 1.6, 1.0), inkAt(fract(sl.y + 0.5) - 0.5, pw / 1.6, 1.0));
      gInkG = max(gInkG, joint * 0.35 * near);
      float da2 = min(ax, uGrid.z - ax), ds2 = min(sz, uGrid.w - sz);
      if (walkA) gInkG = max(gInkG, inkAt(da2 - 15.0, pw, 1.6));
      if (walkS) gInkG = max(gInkG, inkAt(ds2 - 9.0, pw, 1.6));
    } else {
      col = uSidewalk * 0.9;
    }
    // Pools of lamplight (night): the lamps stand on a fixed grid (streetProps.js: 0.9 m in from the
    // avenue kerb every 28 m, none near a cross street) with the head 1.5 m out over the road, so
    // the nearest one is found by arithmetic. A hard-edged ellipse with a ring of Ben-Day dots at
    // its rim: the comic version of a soft pool.
    if (!suburb && uNightG > 0.01) {
      float lx = ax < uGrid.z * 0.5 ? ax - 14.4 : ax - (uGrid.z - 14.4);
      float lz = mod(w.y - uGrid.y - 14.0, 28.0) - 14.0;
      float lampSz = mod(w.y - lz - uGrid.y, uGrid.w);
      if (lampSz >= 13.0 && lampSz <= uGrid.w - 13.0) {
        float r = length(vec2(lx / 4.6, lz / 5.6));
        vec2 dc = fract(w * 2.2) - 0.5;
        float dots = step(length(dc), 0.34 * (1.0 - smoothstep(0.78, 1.0, r)));
        gPoolG = r < 0.78 ? 1.0 - 0.25 * smoothstep(0.3, 0.78, r) : r < 1.0 ? dots * 0.55 : 0.0;
      }
    }
  }
  diffuseColor.rgb = col;
}`)
      .replace('#include <opaque_fragment>', `{
  // Comic shading, shared with the buildings.
  outgoingLight = mix(comicPattern(comicShade(diffuseColor.rgb, outgoingLight)), uInkG, gInkG);
  // The pool: the ground's own colour lit warm, strong enough to read on dark asphalt.
  outgoingLight = mix(outgoingLight, max(diffuseColor.rgb * vec3(1.6, 1.15, 0.62), vec3(0.3, 0.19, 0.08)), gPoolG * uNightG * 0.85);
}
#include <opaque_fragment>`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>${SHADOW_ALPHA}`);
  };
  mat.customProgramCacheKey = () => 'city-ground-v9';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}
