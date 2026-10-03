# Block 4: characters, city detail, skyline and effects, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Characters read against the city with a bold drawn outline; facades carry the comic
detail of a New York street (fire escapes, inset windows, window variety, lit clusters at night);
the far city layers into the fog; speed and hits get comic effects.

**Architecture:** Characters get an inverted hull (smoothed normals, width in pixels shrinking with
distance) built by toon.js; the ink pass stops drawing creases on characters (flag 1) since the hull
draws their silhouette. Facade detail is more shader code in cityMesh.js (no new draws). The skyline
is three rings of flat silhouette cards on LAYER_FX drawn with the sky. Effects extend the ink
composite (speed misregistration) and the existing fx pool (dot bursts).

Spec: docs/superpowers/specs/2026-10-02-overhaul-research-spec.md G6 to G9. City setbacks, roof
props and masonry cornices already exist (city.js, cityMesh.js pushBox); this block does not change
collision.

## Global Constraints
- GPU p95 at most 6.9 ms on the frozen build; load must not grow past 2.4 s.
- No em or en dashes in copy. Commits solely by Krishn Gohel, no trailers. Muted test browsers.
- Every gate plus fight, boss and swing films reviewed by eye.

### Task 1: G6 character outlines
- [ ] toon.js `bakeSmoothNormals(geometry)` (positions welded at 1e-4, averaged normals into a
  `smoothNormal` attribute); `addHullOutline(mesh, { px })` rewritten: back faces pushed out along the
  skinned smooth normal by a width in pixels (3 px close, 1.2 px at 40 m), no shadow, LAYER_FX.
- [ ] Heroes (all suits and roster bodies) and bosses get hulls; street enemies do not (cost).
- [ ] Composite: no crease or id lines where either pixel is a character (aux flag 1).
- [ ] Unit test for bakeSmoothNormals (a split-vertex cube gets one normal per corner).

### Task 2: G7 facade detail
- [ ] Inset windows: the top 18% and left 10% of each pane in shadow.
- [ ] Window types: brick and sandstone buildings pick one of three pane layouts by seed (single,
  split vertical, four-pane).
- [ ] Fire escapes on brick and brownstone (styles 0, 17, 23) wider than 12 m: a painted zig-zag of
  stairs and landings every floor over two bays, inked, near only.
- [ ] Night: lit windows come in clusters (whole floors of a bay group) rather than a random scatter.

### Task 3: G8 layered skyline
- [ ] Three rings (radius 2300, 2700, 3200 m) of 48 flat silhouette cards each, heights from a
  seeded skyline profile, colours stepping from the fog toward the horizon sky, drawn on LAYER_FX
  after the sky dome and before the city, no depth write; follows the camera horizontally.

### Task 4: G9 effects
- [ ] Speed misregistration: the composite's colour offset grows with hero speed (from 30 to 60 m/s)
  and is off with the no-flash and low quality settings.
- [ ] Dot bursts: a ring of comic dots expanding from a heavy hit (pooled sprites).
- [ ] Speed lines already exist (hud canvas); they also show on finishers.

### Task 5: gate
- [ ] Unit, server, e2e, swing, combat, roster, content, postgame, mp, story-walk, playthrough,
  boss-check, fps frozen, load, webkit, films; code review; merge.
