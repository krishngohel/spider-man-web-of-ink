import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { LAYER_FX } from './layers.js';
import { installGbufferChunks } from './gbuffer.js';
import { SHADE_UNIFORMS } from './comicShade.js';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tAux;    // view normal (octahedral), object id, flags: see render/gbuffer.js
uniform vec2 uTexel;
uniform float uNear, uFar, uTime, uFlash, uHalftone, uHalftoneAmount;
uniform float uWobble, uHatch, uMidDots, uSkyDots, uColorEdges, uMisreg, uPaletteAmt, uImpact, uImpactSoft, uPaperTex, uFilter;
uniform vec2 uImpactCenter;
uniform vec3 uPalette[6];
uniform vec3 uInk, uPaper, uAccent;
uniform float uDebugAux;
// Fog (spec G3): applied after the ink, coloured by the sky toward each pixel.
uniform vec3 uFogColor, uSkyHorizon, uSkyMid, uSkyTop, uCamPos;
uniform float uFogNear, uFogFar;
uniform mat4 uInvProj, uCamMatrix;
varying vec2 vUv;

float viewDepth(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
vec3 octDec(vec2 e) {
  e = e * 2.0 - 1.0;
  vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
  float t = max(-n.z, 0.0);
  n.x += n.x >= 0.0 ? -t : t;
  n.y += n.y >= 0.0 ? -t : t;
  return normalize(n);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Mirrors snapColor() in src/render/comicPalette.js.
vec3 snapPalette(vec3 c, float amount) {
  float L = luma(c);
  if (amount <= 0.0 || L < 0.02) return c;
  vec3 cn = c / max(L, 1e-3);
  vec3 best = cn; float bd = 1e9;
  for (int i = 0; i < 6; i++) {
    vec3 pn = uPalette[i] / max(luma(uPalette[i]), 1e-3);
    vec3 d = cn - pn;
    float dd = dot(d, d);
    if (dd < bd) { bd = dd; best = pn; }
  }
  // Saturated accents (signs, the suit) keep their own colour.
  float sat = (max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))) / max(max(c.r, max(c.g, c.b)), 1e-3);
  float k = amount * clamp((L - 0.02) / 0.06, 0.0, 1.0) * (1.0 - smoothstep(0.45, 0.7, sat));
  return mix(c, best * L, k);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  // Boiling line: sample positions drift a little and re-roll 12 times a second (on twos).
  vec2 uvE = vUv;
  if (uWobble > 0.0) {
    vec2 bp = frag / 90.0 + floor(uTime * 12.0) * 17.13;
    uvE += (vec2(vnoise(bp), vnoise(bp + 31.7)) - 0.5) * uTexel * 2.2 * uWobble;
  }

  // Depth edges from the Laplacian of inverse depth: 1/z is linear across any plane in screen
  // space, so flat floors seen at grazing angles produce no false lines. Only the near side of an
  // edge is inked (its neighbours are further away), so lines sit on the object, not in a halo
  // round it. Line weight tapers with distance: about 2.5 px close, 1 px far.
  float dc = viewDepth(uvE);
  float ic = 1.0 / dc;
  vec2 texel = uTexel * mix(1.7, 0.85, smoothstep(6.0, 60.0, dc));
  float lap = 0.0;
  for (int i = -1; i <= 1; i++)
    for (int j = -1; j <= 1; j++) lap += 1.0 / viewDepth(uvE + vec2(float(i), float(j)) * texel);
  lap -= 9.0 * ic;
  float depthEdge = smoothstep(0.12, 0.3, -lap / ic);
  // Brush weight: near silhouettes also test a ring twice as wide, so outlines swell.
  if (dc < 35.0) {
    vec2 t2 = texel * 2.0;
    float m = max(max(ic - 1.0 / viewDepth(uvE + vec2(t2.x, 0.0)), ic - 1.0 / viewDepth(uvE - vec2(t2.x, 0.0))),
                  max(ic - 1.0 / viewDepth(uvE + vec2(0.0, t2.y)), ic - 1.0 / viewDepth(uvE - vec2(0.0, t2.y))));
    depthEdge = max(depthEdge, smoothstep(0.25, 0.5, m / ic) * (1.0 - smoothstep(20.0, 35.0, dc)));
  }
  // Creases (a thinner pen line) and object edges (where two things touch at the same depth: a car
  // on the road, a box on a roof) from the aux target, on a cross of four neighbours.
  vec4 a0 = texture2D(tAux, uvE);
  vec3 n0 = octDec(a0.xy);
  float crease = 0.0, idEdge = 0.0;
  vec2 offs[4];
  offs[0] = vec2(texel.x, 0.0); offs[1] = vec2(-texel.x, 0.0); offs[2] = vec2(0.0, texel.y); offs[3] = vec2(0.0, -texel.y);
  for (int k = 0; k < 4; k++) {
    vec4 an = texture2D(tAux, uvE + offs[k]);
    crease = max(crease, 1.0 - dot(n0, octDec(an.xy)));
    float dn = viewDepth(uvE + offs[k]);
    bool behind = dn > dc * 1.002 || (abs(dn - dc) <= dc * 0.002 && an.b < a0.b);
    if (abs(an.b - a0.b) > 0.004 && behind && an.a < 0.9 && a0.a < 0.9) idEdge = 1.0;
  }
  float normalEdge = smoothstep(0.25, 0.5, crease) * 0.8;
  idEdge *= 0.85 * (1.0 - smoothstep(40.0, 90.0, dc));
  float edge = max(max(depthEdge, normalEdge), idEdge) * (1.0 - smoothstep(150.0, 400.0, dc));

  // Colour, with a hair of print misregistration.
  vec4 raw0 = texture2D(tColor, vUv);
  vec3 col = raw0.rgb;
  // How deep in shadow the material says this pixel is (its alpha; see render/comicShade.js).
  float shadowK = raw0.a >= 0.5 ? clamp((1.0 - raw0.a) / 0.45, 0.0, 1.0) : 0.0;
  if (uMisreg > 0.0) {
    vec2 o = uTexel * 1.1 * uMisreg;
    col.r = mix(col.r, texture2D(tColor, vUv + vec2(o.x, o.y * 0.5)).r, 0.6);
    col.b = mix(col.b, texture2D(tColor, vUv - vec2(o.x, o.y * 0.5)).b, 0.6);
  }
  // Ink where flat colours meet (window frames, signs, road paint), close to the camera.
  if (uColorEdges > 0.0 && dc < 90.0) {
    float lx = luma(texture2D(tColor, vUv + vec2(uTexel.x, 0.0)).rgb) - luma(texture2D(tColor, vUv - vec2(uTexel.x, 0.0)).rgb);
    float ly = luma(texture2D(tColor, vUv + vec2(0.0, uTexel.y)).rgb) - luma(texture2D(tColor, vUv - vec2(0.0, uTexel.y)).rgb);
    float ce = smoothstep(0.16, 0.32, abs(lx) + abs(ly)) * (1.0 - smoothstep(30.0, 90.0, dc)) * 0.6 * uColorEdges;
    edge = max(edge, ce);
  }
  col = snapPalette(col, uPaletteAmt);
  float L = pow(max(luma(col), 0.0), 1.0 / 2.2);

  vec2 cell = mat2(0.7071, -0.7071, 0.7071, 0.7071) * frag / uHalftone;
  // The sky dome writes no depth, so its pixels keep the cleared far value.
  bool sky = texture2D(tDepth, vUv).x >= 0.99999;
  // Shadow hatching and dots are printed by the surfaces themselves, in world space (see
  // render/comicShade.js comicPattern), so they stay put as the camera moves. Only the sky is
  // dotted here.
  // Sky: big dots grading toward the horizon.
  if (sky && uSkyDots > 0.0) {
    float rs = 0.3 * clamp(1.2 - vUv.y * 1.4, 0.0, 1.0) * uSkyDots;
    float sm = 1.0 - smoothstep(rs - 0.06, rs + 0.06, length(fract(cell / 2.6) - 0.5));
    col = mix(col, col * 0.72, sm * step(0.001, rs));
  }

  col = mix(col, uInk, edge);
  if (uFlash > 0.0) col = mix(col, (L > 0.08 && edge < 0.5) ? uPaper : uInk, uFlash);

  // Fog over everything drawn so far, lines and patterns included: linear in distance like the old
  // scene fog, a little thinner up high, in the colour of the sky behind (so the far city melts
  // into the horizon band instead of a flat haze).
  if (!sky && uFogFar > uFogNear) {
    vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, texture2D(tDepth, vUv).x * 2.0 - 1.0, 1.0);
    vec3 wp = (uCamMatrix * vec4(vp.xyz / vp.w, 1.0)).xyz;
    vec3 ray = wp - uCamPos;
    float dist = length(ray);
    vec3 dir = ray / max(dist, 1e-3);
    float fog = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    fog *= mix(0.7, 1.0, exp(-max(wp.y, 0.0) / 160.0));
    // Past the fog's far distance everything is fog (tall towers too), so the far clip never shows.
    fog = max(fog, smoothstep(uFogFar * 0.95, uFogFar * 1.1, dist));
    vec3 skyCol = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.16, dir.y));
    skyCol = mix(skyCol, uSkyTop, smoothstep(0.22, 0.6, dir.y));
    col = mix(col, mix(uFogColor, skyCol, 0.55), fog);
  }

  // Impact frame: black and white ink with radial speed lines out from the hit. Soft mode keeps
  // the lines over a pale paper vignette and never inverts (no flashing).
  if (uImpact > 0.0) {
    vec2 d = (vUv - uImpactCenter) * vec2(uTexel.y / uTexel.x, 1.0);
    float ang = atan(d.y, d.x);
    float rays = step(0.8, fract(ang * 9.549 + hash(vec2(floor(ang * 30.0), 1.0)) * 0.5)) * smoothstep(0.1, 0.45, length(d));
    if (uImpactSoft > 0.5) {
      vec3 pale = mix(col, uPaper, smoothstep(0.35, 0.95, length(d)) * 0.55);
      col = mix(col, mix(pale, uInk, rays * 0.6), uImpact);
    } else {
      vec3 bw = mix(uInk, uPaper, step(0.22, L));
      bw = mix(bw, uInk, edge);
      col = mix(col, mix(bw, uInk, rays * 0.9), uImpact);
    }
  }

  // Photo-mode filters (0 = the normal ink look). Uniform-driven, so no new shader program.
  if (uFilter > 0.5) {
    float Lf = pow(max(luma(col), 0.0), 1.0 / 2.2);
    if (uFilter < 1.5) {
      // Noir: black, white and one accent colour (spider red).
      float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
      float red = smoothstep(0.35, 0.6, (mx - mn) / max(mx, 1e-3)) * step(max(col.g, col.b), col.r * 0.7);
      vec3 bw = mix(uInk, uPaper, smoothstep(0.18, 0.42, Lf));
      col = mix(mix(bw, uAccent * (0.35 + 0.9 * Lf), red), uInk, edge);
    } else if (uFilter < 2.5) {
      // Pop: loud colour and big dots.
      vec3 gl = vec3(luma(col));
      col = clamp(gl + (col - gl) * 1.9, 0.0, 1.0) * 1.12;
      vec2 pc = mat2(0.7071, -0.7071, 0.7071, 0.7071) * frag / (uHalftone * 2.2);
      float pr = 0.34 * smoothstep(0.15, 0.7, Lf);
      float pd = 1.0 - smoothstep(pr - 0.05, pr + 0.05, length(fract(pc) - 0.5));
      col = mix(col, col * 0.45, pd * 0.8);
    } else {
      // Sepia.
      vec3 s = vec3(dot(col, vec3(0.393, 0.769, 0.189)), dot(col, vec3(0.349, 0.686, 0.168)), dot(col, vec3(0.272, 0.534, 0.131)));
      col = mix(col, s, 0.92);
    }
  }

  // Paper: fibres, a slow grain, and warm paper white in the highlights.
  if (uPaperTex > 0.0) {
    float fib = vnoise(frag * vec2(0.9, 0.12)) * 0.5 + vnoise(frag * 0.35) * 0.5;
    col *= 0.965 + 0.05 * fib;
    col = mix(col, uPaper, smoothstep(0.8, 1.0, L) * 0.35);
  }
  col *= 0.96 + 0.04 * hash(floor(frag / 2.0) + floor(uTime * 6.0));
  vec2 v = vUv - 0.5;
  col *= 1.0 - 0.36 * dot(v, v);
  // Pixels a material marked with alpha < 0.5 (Spider-Man's lenses) skip the ink: clean colour, only
  // the paper vignette.
  vec4 raw = texture2D(tColor, vUv);
  if (raw.a < 0.5) col = raw.rgb * (1.0 - 0.36 * dot(v, v));
  gl_FragColor = vec4(col, 1.0);
  if (uDebugAux > 0.5) gl_FragColor = vec4(texture2D(tAux, vUv).rgb, 1.0);
  #include <colorspace_fragment>
}
`;


export function createInkPipeline(renderer, quality, { gpuTime = false } = {}) {
  // Half-float targets need EXT_color_buffer_float; fall back to 8-bit where it's missing.
  const floatOK = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const type = floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType;
  // One pass, two attachments: colour (with the shadow amount in alpha) and the aux texel.
  installGbufferChunks();
  const colorRT = new THREE.WebGLRenderTarget(1, 1, { type, count: 2 });
  colorRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
  const auxTex = colorRT.textures[1];
  auxTex.type = THREE.UnsignedByteType;
  auxTex.minFilter = auxTex.magFilter = THREE.NearestFilter;
  auxTex.generateMipmaps = false;

  const uniforms = {
    tColor: { value: colorRT.texture },
    tDepth: { value: colorRT.depthTexture },
    tAux: { value: auxTex },
    uTexel: { value: new THREE.Vector2() },
    uNear: { value: 0.1 },
    uFar: { value: 1000 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uHalftone: { value: 5 },
    uHalftoneAmount: { value: 1 },
    uInk: { value: new THREE.Color(PALETTE.ink) },
    uPaper: { value: new THREE.Color(PALETTE.paper) },
    uAccent: { value: new THREE.Color(PALETTE.suitRed) },
    uFilter: { value: 0 },
    uWobble: { value: 0 }, uHatch: { value: 0 }, uMidDots: { value: 0 }, uSkyDots: { value: 0 },
    uColorEdges: { value: 0 }, uMisreg: { value: 0 }, uPaletteAmt: { value: 0 }, uPaperTex: { value: 0 },
    uDebugAux: { value: 0 },
    uFogColor: { value: new THREE.Color(PALETTE.haze) }, uFogNear: { value: 320 }, uFogFar: { value: 1800 },
    uSkyHorizon: { value: new THREE.Color(PALETTE.skyHorizon) }, uSkyMid: { value: new THREE.Color(PALETTE.skyMid) }, uSkyTop: { value: new THREE.Color(PALETTE.skyTop) },
    uCamPos: { value: new THREE.Vector3() }, uInvProj: { value: new THREE.Matrix4() }, uCamMatrix: { value: new THREE.Matrix4() },
    uImpact: { value: 0 }, uImpactSoft: { value: 0 }, uImpactCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uPalette: { value: Array.from({ length: 6 }, () => new THREE.Color(0.5, 0.5, 0.5)) },
  };
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false }),
  );
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function setSize(width, height) {
    const pr = renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(width * pr));
    const h = Math.max(1, Math.floor(height * pr));
    colorRT.setSize(w, h);
    uniforms.uTexel.value.set(1 / w, 1 / h).multiplyScalar(Math.max(1.35, pr * 1.05)); // ink line weight
    uniforms.uHalftone.value = 7 * pr;
  }

  // GPU time of each frame's passes (EXT_disjoint_timer_query_webgl2, where the browser has it),
  // read a frame or two late without stalling. Diagnostic only: dynamic resolution scales off
  // missed-frame counts, not this (see render/dynamicRes.js); perf-ablate.mjs and dynres-check.mjs
  // read ink.gpuMs directly. The query itself has a small but real per-frame cost, so it is only
  // created when the URL has ?gputime=1.
  const gl = renderer.getContext();
  const timer = gpuTime ? (gl.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null) : null;
  const pending = [];
  let gpuMs = null;
  function pollTimer() {
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = pending.shift();
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(q);
    }
  }

  function setComic(c) {
    SHADE_UNIFORMS.uInkPattern.value = c.hatch;
    uniforms.uWobble.value = c.wobble; uniforms.uHatch.value = c.hatch; uniforms.uMidDots.value = c.midDots;
    uniforms.uSkyDots.value = c.skyDots; uniforms.uColorEdges.value = c.colorEdges; uniforms.uMisreg.value = c.misreg;
    uniforms.uPaletteAmt.value = c.palette; uniforms.uPaperTex.value = c.paper;
  }
  function setPalette(a) { for (let i = 0; i < 6; i++) uniforms.uPalette.value[i].setRGB(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]); }
  // Driven every frame by the impact timeline (game.js). Uniform writes only: no new program.
  function setImpact(strength, soft, cx, cy) {
    uniforms.uImpact.value = strength;
    uniforms.uImpactSoft.value = soft ? 1 : 0;
    if (cx !== undefined) uniforms.uImpactCenter.value.set(cx, cy);
  }
  const FILTER_INDEX = { ink: 0, noir: 1, pop: 2, sepia: 3 };
  function setFilter(name) { uniforms.uFilter.value = FILTER_INDEX[name] ?? 0; }

  // Benchmark switches: cachedShadows skips the shadow map update; repeat draws the composite k
  // times (Safari has no reliable GPU timer: time it by the slope of frame time against k,
  // scripts/perf-repeat.mjs). Never set in normal play.
  const debug = { cachedShadows: false, repeat: 1 };

  // The fog's colour and range (a THREE.Fog the game drives) and the sky's colours, shared by
  // reference so they follow the time of day.
  let fogRef = null;
  function setFog(fog, skyUniforms) {
    fogRef = fog;
    uniforms.uFogColor.value = fog.color;
    uniforms.uSkyHorizon.value = skyUniforms.uHorizon.value;
    uniforms.uSkyMid.value = skyUniforms.uMid.value;
    uniforms.uSkyTop.value = skyUniforms.uTop.value;
  }

  function render(scene, camera, time) {
    if (fogRef) { uniforms.uFogNear.value = fogRef.near; uniforms.uFogFar.value = fogRef.far; }
    uniforms.uNear.value = camera.near;
    uniforms.uFar.value = camera.far;
    uniforms.uTime.value = time;

    let query = null;
    if (timer && pending.length < 4) { query = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, query); }

    camera.layers.set(0);
    camera.layers.enable(LAYER_FX);
    if (!debug.cachedShadows) renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(colorRT);
    renderer.render(scene, camera);

    camera.updateMatrixWorld();
    uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    uniforms.uCamMatrix.value.copy(camera.matrixWorld);
    uniforms.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    renderer.setRenderTarget(null);
    for (let k = 0; k < debug.repeat; k++) renderer.render(quadScene, quadCam);

    camera.layers.set(0);
    camera.layers.enable(LAYER_FX);
    if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push(query); }
    if (timer) pollTimer();
  }

  // Parallel shader compile for everything in `scene`. Scene materials only ever draw into the
  // colour target, whose linear colour space is part of each program's key: compiling against
  // the canvas (sRGB) would build programs that are never used and leave the real ones to compile
  // synchronously on first draw.
  async function compileAsync(scene, camera) {
    renderer.setRenderTarget(colorRT);
    try { await renderer.compileAsync(scene, camera); } finally { renderer.setRenderTarget(null); }
  }

  // Boot warm-up: compile everything in parallel, then draw it all once, shadows included, into the
  // two-attachment target (frustum culling off). ANGLE builds each program's two-output,
  // shadow-receiving variant on its first such draw, synchronously (about 0.7 s for the city on
  // this laptop); doing it here, while the hero assets are still downloading, hides most of it.
  async function warm(scene, camera) {
    await compileAsync(scene, camera);
    const culled = [];
    scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    try {
      camera.layers.set(0);
      camera.layers.enable(LAYER_FX);
      renderer.shadowMap.needsUpdate = true;
      renderer.setRenderTarget(colorRT);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCam);
    } finally {
      for (const o of culled) o.frustumCulled = true;
    }
  }

  return { uniforms, setSize, render, setFog, warm, setComic, setPalette, setImpact, setFilter, compileAsync, debug, get gpuMs() { return gpuMs; } };
}
