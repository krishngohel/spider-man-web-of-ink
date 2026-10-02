import { describe, it, expect } from 'vitest';
import { createRope } from '../../src/physics/rope.js';
import { createBody } from '../../src/physics/ledger.js';
import { applyGravity } from '../../src/physics/aero.js';
import { createWorld } from '../../src/physics/world.js';
import { G, tune } from '../../src/physics/constants.js';
import { createRng } from '../../src/core/rng.js';

const dt = 1 / 240;

function step(body, rope, g, world = null) {
  if (g) applyGravity(body, g, dt);
  rope.preStep(body, dt);
  body.p.x += body.v.x * dt; body.p.y += body.v.y * dt; body.p.z += body.v.z * dt;
  rope.postStep(body, world);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('rope swing', () => {
  for (const [name, g] of Object.entries(G)) {
    it(`conserves energy within 1% over 20 s with drag off (${name})`, () => {
      const body = createBody({ x: 30, y: 100, z: 0 });
      const rope = createRope();
      rope.attach({ x: 0, y: 100, z: 0 }, body);
      const energy = () => 0.5 * (body.v.x ** 2 + body.v.y ** 2 + body.v.z ** 2) + g * body.p.y;
      const e0 = energy();
      const scale = g * 30; // the swing's full energy range
      let worst = 0;
      for (let i = 0; i < 240 * 20; i++) { step(body, rope, g); worst = Math.max(worst, Math.abs(energy() - e0)); }
      expect(worst / scale).toBeLessThan(0.01);
    });
  }

  it('reeling in conserves angular momentum about the pivot (within 2%)', () => {
    const body = createBody({ x: 0, y: 70, z: 0 });
    body.v.x = 15;
    const rope = createRope();
    const c = { x: 0, y: 100, z: 0 };
    rope.attach(c, body);
    const L = () => {
      const rx = body.p.x - c.x, ry = body.p.y - c.y, rz = body.p.z - c.z;
      return Math.hypot(ry * body.v.z - rz * body.v.y, rz * body.v.x - rx * body.v.z, rx * body.v.y - ry * body.v.x);
    };
    const l0 = L();
    rope.setReel(10, 1e9);
    while (rope.length > 15) step(body, rope, 0);
    expect(Math.abs(L() - l0) / l0).toBeLessThan(0.02);
    // Tangential speed grew by roughly the length ratio (30 / 15).
    const vt = l0 / dist(body.p, c);
    expect(vt).toBeGreaterThan(28);
  });

  it('never stretches more than 3% past its length', () => {
    const rng = createRng(3);
    for (let n = 0; n < 200; n++) {
      const body = createBody({ x: rng.range(-40, 40), y: rng.range(20, 90), z: rng.range(-40, 40) });
      body.v.x = rng.range(-60, 60); body.v.y = rng.range(-60, 60); body.v.z = rng.range(-60, 60);
      const rope = createRope();
      const c = { x: 0, y: 100, z: 0 };
      rope.attach(c, body);
      let worst = 0;
      for (let i = 0; i < 480; i++) { step(body, rope, G.comic); worst = Math.max(worst, dist(body.p, c) / rope.length); }
      expect(worst).toBeLessThan(1 + tune.ropeGive + 1e-6);
    }
  });

  it('a slack line applies nothing', () => {
    const body = createBody({ x: 5, y: 95, z: 0 });
    const rope = createRope();
    rope.attach({ x: 0, y: 100, z: 0 }, body);
    rope.length = 30;
    body.v.x = -3;
    rope.preStep(body, dt);
    expect(body.log.rope).toEqual({ x: 0, y: 0, z: 0 });
    expect(rope.tension).toBe(0);
  });

  it('hauls in slack without pulling', () => {
    const body = createBody({ x: 0, y: 70, z: -20 });
    body.v.z = 15; // moving toward the anchor's side: the line goes slack
    const rope = createRope();
    rope.attach({ x: 0, y: 100, z: 20 }, body);
    const l0 = rope.length;
    for (let i = 0; i < 24; i++) rope.preStep(body, dt);
    expect(rope.length).toBeLessThan(l0);
    expect(rope.length).toBeGreaterThanOrEqual(l0 - tune.slackTakeUp * 0.1 - 1e-9);
    expect(body.log.rope).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('the winch stalls above its tension limit but the line still holds', () => {
    // Fast swing through the bottom: centripetal tension alone is m v^2 / L = 80 * 3600 / 20.
    const body = createBody({ x: 0, y: 80, z: 0 });
    body.v.x = 60;
    const rope = createRope();
    rope.attach({ x: 0, y: 100, z: 0 }, body);
    rope.setReel(tune.winchSpeed, tune.winchTension);
    step(body, rope, G.comic);
    step(body, rope, G.comic);
    expect(rope.stalled).toBe(true);
    expect(rope.length).toBeCloseTo(20, 2);
    // Slow: the winch reels.
    const slow = createBody({ x: 0, y: 80, z: 0 });
    slow.v.x = 5;
    const r2 = createRope();
    r2.attach({ x: 0, y: 100, z: 0 }, slow);
    r2.setReel(tune.winchSpeed, tune.winchTension);
    let peak = 0;
    for (let i = 0; i < 60; i++) { step(slow, r2, G.comic); peak = Math.max(peak, r2.tension); expect(r2.stalled).toBe(false); }
    expect(r2.length).toBeLessThan(18);
    // The pull never exceeds the winch's rating: the reel ramps up instead of snapping.
    expect(peak).toBeLessThanOrEqual(tune.winchTension + 1);
  });

  it('only acts through the rope source', () => {
    const body = createBody({ x: 25, y: 90, z: 3 });
    body.v.z = 20;
    const rope = createRope();
    rope.attach({ x: 0, y: 100, z: 0 }, body);
    for (let i = 0; i < 240; i++) rope.preStep(body, dt);
    for (const s of ['gravity', 'drag', 'lift', 'surface']) expect(body.log[s]).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('rope wrap', () => {
  it('bends around a pillar it swings past and unbends on the way back', () => {
    const world = createWorld();
    world.addBox({ min: [4, 0, 4], max: [6, 100, 6] });
    world.build();
    const body = createBody({ x: 0, y: 50, z: 20 });
    body.v.x = 12;
    const rope = createRope();
    rope.attach({ x: 0, y: 50, z: 0 }, body);
    let wrapped = false;
    for (let i = 0; i < 240 * 2; i++) {
      step(body, rope, 0, world);
      if (rope.pivots.length > 1) wrapped = true;
    }
    expect(wrapped).toBe(true);
    expect(rope.pivots.length).toBe(2);
    expect(rope.totalLength).toBeCloseTo(20, 0);
    expect(rope.length).toBeLessThan(20);
    // Swing back the other way.
    body.v.x = -body.v.x; body.v.y = -body.v.y; body.v.z = -body.v.z;
    for (let i = 0; i < 240 * 3; i++) step(body, rope, 0, world);
    expect(rope.pivots.length).toBe(1);
    expect(rope.length).toBeCloseTo(20, 0);
  });

  it('wraps around a corner of the building it is anchored to', () => {
    const world = createWorld();
    world.addBox({ min: [0, 0, 0], max: [20, 60, 20] });
    world.build();
    // Anchor high on the west face (normal -x); swing south around the box's south-west corner.
    const body = createBody({ x: -15, y: 40, z: 10 });
    const rope = createRope();
    rope.attach({ x: 0, y: 50, z: 10, nx: -1, ny: 0, nz: 0 }, body);
    body.v.z = -14; body.v.x = 4;
    let wrapped = false;
    for (let i = 0; i < 240 * 3; i++) { step(body, rope, 0, world); if (rope.pivots.length > 1) wrapped = true; }
    expect(wrapped).toBe(true);
    expect(world.pointInside(body.p.x, body.p.y, body.p.z, 0.01)).toBe(false);
  });

  it('wraps over the roof edge of its own building', () => {
    const world = createWorld();
    world.addBox({ min: [0, 0, 0], max: [20, 30, 20] });
    world.build();
    // Anchor on the roof, hero hanging below the west edge.
    const body = createBody({ x: -3, y: 22, z: 10 });
    const rope = createRope();
    rope.attach({ x: 6, y: 30, z: 10, nx: 0, ny: 1, nz: 0 }, body);
    step(body, rope, G.comic, world);
    expect(rope.pivots.length).toBe(2);
    expect(rope.pivot.roof).toBe(true);
    expect(rope.pivot.y).toBeCloseTo(30.05, 3);
  });

  it('a straight line clear of buildings never wraps', () => {
    const world = createWorld();
    world.addBox({ min: [40, 0, 40], max: [60, 100, 60] });
    world.build();
    const body = createBody({ x: 30, y: 100, z: 0 });
    const rope = createRope();
    rope.attach({ x: 0, y: 100, z: 0 }, body);
    for (let i = 0; i < 240 * 5; i++) step(body, rope, G.comic, world);
    expect(rope.pivots.length).toBe(1);
  });
});

describe('moving anchors', () => {
  it('shares the pull by mass', () => {
    const run = (anchorMass) => {
      const hero = createBody({ mass: 80, x: 0, y: 1, z: 0 });
      const other = createBody({ mass: anchorMass, x: 20, y: 1, z: 0 });
      const rope = createRope();
      rope.attach({ x: 20, y: 1, z: 0, body: other }, hero);
      rope.setReel(20, 1e9);
      for (let i = 0; i < 120; i++) {
        rope.preStep(hero, dt);
        hero.p.x += hero.v.x * dt; other.p.x += other.v.x * dt;
        rope.postStep(hero, null);
      }
      return { hero: hero.p.x, other: 20 - other.p.x };
    };
    const light = run(20);  // a goon: flies to you
    const heavy = run(900); // a rhino: you fly to him
    expect(light.other).toBeGreaterThan(light.hero * 3);
    expect(heavy.hero).toBeGreaterThan(heavy.other * 8);
  });
});
