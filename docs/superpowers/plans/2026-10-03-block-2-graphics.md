# Block 2: graphics G0 to G5, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The city reads as a printed comic: lines from one geometry pass with object edges, patterns
fixed to surfaces (no swimming), hatching only in core shadow, dots in the light falloff, per-area
coloured shadows, fog that fades the ink, a golden-hour first look, and Safari-safe shaders.

**Architecture:** One global patch of three's shader chunks gives every built-in material a second
output (view normal, object id, flags) and two varyings (world position, object id). The colour target
becomes a 2-attachment render target; the normal pass is deleted. The ink composite reads depth plus
the aux target. Surface patterns move into the shared comic shading code (world space, with a
power-of-two level-of-detail crossfade); the composite keeps only sky dots. Fog moves into the
composite, after the ink.

**Tech Stack:** Three.js r186 (WebGL2, GLSL3 via three's prefix), vitest, playwright pilots.

Spec: docs/superpowers/specs/2026-10-02-overhaul-research-spec.md section 3 (G0 to G5).

## Global Constraints
- GPU p95 at most 6.9 ms on the frozen build; load at most 2.1 s; no new console errors.
- Every program that draws into the colour target writes the aux output (transparent ones write zero).
- No em or en dashes in copy. Commits solely by Krishn Gohel, no trailers. Muted test browsers.
- Merge to main only after the full gate.

## File map
| File | Change |
|---|---|
| src/render/gbuffer.js (new) | installs the chunk patch (aux output, world position and id varyings), AUX snippets for custom shaders, octahedral encode |
| src/render/glslHash.js (new) | sine-free hash for every shader |
| src/render/renderer.js | provoking-vertex convention, Mac pixel-ratio cap |
| src/render/inkPipeline.js | 2-attachment target, no normal pass, composite rewrite (near-side ink, id edges, distance weight, fog after ink, 12 fps wobble, sky dots only), repeat-draw debug |
| src/render/comicShade.js | world-anchored pattern (hatch in core shadow, dots in falloff), shadow colour volume, value floor |
| src/render/shadowVolume.js (new) | builds the per-district shadow colour volume (pure, tested) |
| src/world/cityMesh.js | building and ground use the pattern and the volume; building id from its seed |
| src/world/sky.js, rain.js, cityLife.js, streetMesh.js | write the aux output |
| src/hero/model.js, src/combat/enemyModel.js | rim light on the lit side only |
| src/game/game.js | fog state handed to the ink pass (scene fog removed), golden-hour start |

### Task 1: G0 Safari and Mac safety
- [ ] renderer.js: after creating the renderer, `ext = gl.getExtension('WEBGL_provoking_vertex'); ext?.provokingVertexWEBGL(ext.FIRST_VERTEX_CONVENTION_WEBGL)`; export `pixelRatioCap(quality, ua, dpr)` returning min(dpr, cap, 1.25 on a Mac); test it.
- [ ] glslHash.js: `HASH = 'float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }'`; replace the sine hashes in cityMesh (h21, ground) and the ink pass.
- [ ] Ink debug `repeat` (draw the composite k times) for timing on Safari by slope; scripts/perf-repeat.mjs reports frame time for k = 1, 2, 4 in WebKit.

### Task 2: G1 one-pass G-buffer
- [ ] gbuffer.js `installGbufferChunks()` (called once before any material compiles):
  - `ShaderChunk.common` += declarations guarded by `#ifdef gl_FragColor` (fragment only): `layout(location = 1) out highp vec4 gAux; float gAuxId = -1.0; float gAuxFlags = 0.0;` plus `varying vec3 vAuxWPos; varying float vAuxId;` (both stages) and `auxOct(vec3)`.
  - `ShaderChunk.project_vertex` += world position (instance matrix when instanced) and id hashed from the model (and instance) translation.
  - `ShaderChunk.normal_fragment_begin` += `#define AUX_NORMAL`.
  - `ShaderChunk.colorspace_fragment` += the write: opaque: `vec4(auxOct(normal) or 0.5, id, flags)`; skinned materials flag 1 (characters); non-opaque: `vec4(0)`.
- [ ] inkPipeline: `new WebGLRenderTarget(w, h, { count: 2, type })`, `textures[1]` UnsignedByte + Nearest; delete normalRT, normalMat, normalPassSort, quality.normalScale use.
- [ ] Custom shaders (sky, rain, birds, cones, bulbs) write `gAux` (snippets from gbuffer.js).
- [ ] Debug view `?aux=1` shows the aux target; check by screenshot that every surface has sane normals and ids.

### Task 3: G2 composite rewrite
- [ ] Edges: 3x3 inverse-depth Laplacian, inked only on the near side (`-lap`), plus a near-side ring for weight; normal crease from the aux cross (5 taps); id edge where the id differs from a neighbour at similar depth; line weight scale `mix(1.7, 0.85, smoothstep(6, 60, dc))`; wobble re-rolled 12 times a second.
- [ ] Characters (flag 1) keep their outline from depth (hulls come in block 4).

### Task 4: G3 fog after the ink
- [ ] game.js keeps a `fogState` (THREE.Fog, not on the scene) driven by time of day; ink gets `uFogColor, uFogNear, uFogFar, uSkyHorizon, uSkyMid, uSkyTop, uCamPos, uInvViewProj`.
- [ ] Composite: world direction and height per pixel from depth; `fog = distanceFog * heightFalloff`, colour from the sky gradient at that direction blended with the haze; applied after ink and patterns so lines fade too; sky pixels untouched.

### Task 5: G4 the pattern rule
- [ ] comicShade.js: `comicShade` also sets `gMid` (the falloff band); new `comicPattern(c, wpos, wnrm, alb)`: hatching (two directions when deepest) only where `gShadow > 0.6`, dots only in the falloff band, both in world units on the plane of the surface, scale snapped to powers of two of metres per pixel and crossfaded, faded out past 150 m; sets `gAuxFlags = 0.5` (patterned).
- [ ] Building, ground and comicToon call it; characters (skinned) never.
- [ ] Composite: no screen-space shadow dots, hatching or mid dots any more; sky dots stay.

### Task 6: G5 shading v3 and the first look
- [ ] shadowVolume.js `buildShadowVolume(districts, bounds)` returns a 16 x 8 x 16 RGBA8 array: violet base, hue by district mood (teal harbour, magenta Neon Square, warm Hell's Kitchen, cool financial, green park), cooler and lighter with height; test sizes and that every texel keeps a value floor.
- [ ] comicShade samples it (`uShadowVol`, `uShadowBox`) for the shadow tone; `c = max(c, alb * 0.35 * uTint)`.
- [ ] Rim light times `smoothstep(0.0, 0.3, NdotL)` on the hero and enemies.
- [ ] Free roam starts at golden hour (17.4) and cycles as before.

### Task 7: gate
- [ ] Unit; server; e2e; swing; combat; roster; content; postgame; mp (relay started for it, then stopped); story-walk (images reviewed); playthrough; boss-check; fps frozen; load-time; webkit; env-shots before and after for the owner; code review; merge.
