import { describe, it, expect } from 'vitest';
import { createHero, emptyIntent } from '../../src/hero/controller.js';
import { createWorld } from '../../src/physics/world.js';
import { SOURCES } from '../../src/physics/ledger.js';
import { createRng } from '../../src/core/rng.js';
import { tune } from '../../src/physics/constants.js';

const dt = 1 / 240;

function city() {
  // An avenue along +z with towers either side, and one low building to stand on.
  const w = createWorld();
  for (let z = -200; z < 600; z += 60) {
    w.addBox({ min: [15, 0, z], max: [45, 120, z + 50] });
    w.addBox({ min: [-45, 0, z], max: [-15, 100, z + 50] });
  }
  w.addBox({ min: [-200, 0, -40], max: [-150, 20, 40] });
  w.build();
  return w;
}

function run(hero, intent, seconds, each) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    hero.step(intent, dt);
    intent.swingPressed = false; intent.swingReleased = false; intent.jumpPressed = false; intent.jumpReleased = false; intent.zipPressed = false;
    if (each) each(i);
  }
}

const hspeed = (h) => Math.hypot(h.body.v.x, h.body.v.z);

describe('hero on the ground', () => {
  it('standing still stays still', () => {
    const w = city();
    const h = createHero(w);
    h.place(-175, 20.9, 0, 0, 0, 0, 'ground');
    run(h, emptyIntent(), 2);
    expect(h.state).toBe('ground');
    expect(h.speed).toBeLessThan(0.01);
    expect(h.body.p.y).toBeCloseTo(20.9, 3);
  });
  it('runs at 9 m/s and parkour-runs at 14', () => {
    const w = city();
    const h = createHero(w);
    h.place(0, 0.9, 0, 0, 0, 0, 'ground');
    const i = emptyIntent(); i.moveZ = 1;
    run(h, i, 1.5);
    expect(hspeed(h)).toBeCloseTo(9, 1);
    i.swing = true;
    run(h, i, 1);
    expect(hspeed(h)).toBeCloseTo(14, 1);
  });
  it('a jump leaves the ground and comes back', () => {
    const w = city();
    const h = createHero(w);
    h.place(0, 0.9, 0, 0, 0, 0, 'ground');
    const i = emptyIntent(); i.jumpPressed = true;
    let peak = 0;
    run(h, i, 2, () => { peak = Math.max(peak, h.body.p.y); });
    expect(peak).toBeGreaterThan(2.5);
    expect(h.state).toBe('ground');
  });
});

describe('swinging', () => {
  it('a swing carries forward after the release', () => {
    const w = city();
    const h = createHero(w);
    h.place(0, 40, 0, 0, 0, 20);
    const i = emptyIntent(); i.swing = true; i.swingPressed = true;
    let attached = false;
    run(h, i, 1.2, () => { if (h.state === 'swing') attached = true; });
    expect(attached).toBe(true);
    i.swing = false; i.swingReleased = true;
    run(h, i, 0.05);
    expect(h.state).toBe('air');
    expect(h.body.v.z).toBeGreaterThan(15);
  });
  // Mechanical energy per kg: what the winch and the flick add (they may turn it into height
  // rather than speed, so speed alone is the wrong measure).
  const energy = (h) => 0.5 * h.speed ** 2 + 19.62 * h.body.p.y;

  it('reeling in near the bottom of the arc pumps energy into the swing', () => {
    const after = (reel) => {
      const w = city();
      const h = createHero(w);
      h.place(0, 40, 0, 0, 0, 20);
      const i = emptyIntent(); i.swing = true; i.swingPressed = true;
      run(h, i, 1.6, () => { i.jump = reel && h.state === 'swing' && Math.abs(h.body.v.y) < 6; });
      return energy(h);
    };
    expect(after(true)).toBeGreaterThan(after(false) + 20);
  });
  it('no air jumps: a jump press in mid-air adds no speed', () => {
    const w = city();
    const h = createHero(w);
    h.place(0, 60, 0, 0, -5, 10);
    const i = emptyIntent();
    run(h, i, 0.3);
    const before = h.speed;
    i.jumpPressed = true; i.jump = true;
    run(h, i, 1 / 240);
    expect(h.speed).toBeLessThanOrEqual(before + 19.62 * dt + 1e-9);
    expect(h.state).toBe('glide');
  });
  it('the release flick adds speed along the line', () => {
    const go = (flick) => {
      const w = city();
      const h = createHero(w);
      h.place(0, 40, 0, 0, 0, 20);
      const i = emptyIntent(); i.swing = true; i.swingPressed = true;
      run(h, i, 0.9);
      if (flick) { i.jumpPressed = true; run(h, i, dt); }
      i.swing = false; i.swingReleased = true;
      run(h, i, 0.3);
      return energy(h);
    };
    expect(go(true)).toBeGreaterThan(go(false) + 20);
  });
});

describe('walls', () => {
  it('sticks to a wall, removing the speed into it', () => {
    const w = city();
    const h = createHero(w);
    h.place(5, 30, 25, 20, 0, 5);
    const i = emptyIntent();
    run(h, i, 1);
    expect(h.state).toBe('wall');
    expect(Math.abs(h.body.v.x)).toBeLessThan(1);
  });
  it('wall run climbs', () => {
    const w = city();
    const h = createHero(w);
    h.place(12, 30, 25, 20, 0, 0);
    const i = emptyIntent();
    run(h, i, 0.5);
    expect(h.state).toBe('wall');
    const y0 = h.body.p.y;
    i.swing = true;
    run(h, i, 1.5);
    expect(h.body.p.y).toBeGreaterThan(y0 + 8);
  });
  it('wall running over the roof edge vaults onto the roof', () => {
    const w = city();
    const h = createHero(w);
    h.place(-150 + 0.45, 12, 0, -4, 0, 0, 'air');
    const i = emptyIntent();
    run(h, i, 0.3);
    expect(h.state).toBe('wall');
    i.swing = true;
    let landed = false;
    run(h, i, 3, () => { if (h.state === 'ground' && h.body.p.y > 20) landed = true; });
    expect(landed).toBe(true);
  });
});

describe('zip and launch', () => {
  it('zips to a point on a facade and sticks there', () => {
    const w = city();
    const h = createHero(w);
    h.place(0, 0.9, 25, 0, 0, 0, 'ground');
    const i = emptyIntent();
    i.camPos = { x: 0, y: 3, z: 20 };
    const d = Math.hypot(15, 20);
    i.camFwd = { x: 15 / d, y: 20 / d * 0.5, z: 0 };
    const l = Math.hypot(i.camFwd.x, i.camFwd.y);
    i.camFwd.x /= l; i.camFwd.y /= l;
    i.zipPressed = true;
    run(h, i, 2.5);
    expect(h.state).toBe('wall');
    expect(h.body.p.x).toBeGreaterThan(13);
  });
  it('a point launch off a perch adds speed', () => {
    const w = city();
    const h = createHero(w);
    h.place(-175, 20.9, 0, 0, 0, 0, 'ground');
    h.launchUntil = h.time + 1;
    const i = emptyIntent(); i.camFwd = { x: 1, y: 0, z: 0 }; i.jumpPressed = true;
    run(h, i, dt);
    expect(h.speed).toBeGreaterThan(tune.launchSpeed * 0.95);
  });
});

describe('zip edge cases', () => {
  it('a zip to a roof from below its edge climbs over onto the roof', () => {
    const w = city();
    const h = createHero(w);
    h.strict = true;
    // Low building: x -200..-150, roof at 20. Stand in the street west of it, aim at the roof.
    h.place(-210, 0.9, 0, 0, 0, 0, 'ground');
    const i = emptyIntent();
    i.camPos = { x: -214, y: 6, z: 0 };
    const tx = -195, ty = 20, tz = 0;
    const d = Math.hypot(tx - i.camPos.x, ty - i.camPos.y, tz - i.camPos.z);
    i.camFwd = { x: (tx - i.camPos.x) / d, y: (ty - i.camPos.y) / d, z: 0 };
    i.zipPressed = true;
    let onRoof = false;
    run(h, i, 3, () => { if (h.state === 'ground' && h.body.p.y > 20) onRoof = true; });
    expect(onRoof).toBe(true);
  });
  it('a zip at the underside of an overhang is refused', () => {
    const w = createWorld();
    w.addBox({ min: [-10, 20, -10], max: [10, 24, 10] });
    w.build();
    const h = createHero(w);
    h.place(0, 0.9, 0, 0, 0, 0, 'ground');
    const i = emptyIntent();
    i.camPos = { x: 0, y: 2, z: 0 }; i.camFwd = { x: 0, y: 1, z: 0 };
    i.zipPressed = true;
    run(h, i, 0.5);
    expect(h.state).toBe('ground');
    expect(Number.isFinite(h.facing.x) && Math.hypot(h.facing.x, h.facing.z) > 0.5).toBe(true);
  });
});

describe('determinism', () => {
  it('the same inputs give bit-identical state', () => {
    const go = () => {
      const w = city();
      const h = createHero(w);
      h.place(0, 50, -100, 0, 0, 20);
      const rng = createRng(3);
      const i = emptyIntent();
      for (let n = 0; n < 2400; n++) {
        if (n % 40 === 0) {
          const was = i.swing; i.swing = rng.chance(0.7); i.swingPressed = i.swing && !was; i.swingReleased = !i.swing && was;
          i.jump = rng.chance(0.3); i.jumpPressed = i.jump; i.moveX = rng.range(-1, 1); i.moveZ = rng.range(0, 1);
        }
        h.step(i, dt);
        i.swingPressed = false; i.swingReleased = false; i.jumpPressed = false;
      }
      return [h.body.p.x, h.body.p.y, h.body.p.z, h.body.v.x, h.body.v.y, h.body.v.z, h.state];
    };
    expect(go()).toEqual(go());
  });
});

describe('physics rule', () => {
  it('only the five physical sources ever change velocity, and they add up', () => {
    const w = city();
    const rng = createRng(77);
    for (let trial = 0; trial < 6; trial++) {
      const h = createHero(w);
      h.strict = true; // a surface push with nothing to push on throws
      h.place(rng.range(-10, 10), rng.range(5, 80), rng.range(0, 300), rng.range(-10, 10), rng.range(-5, 5), rng.range(0, 30));
      const v0 = { ...h.body.v };
      const i = emptyIntent();
      for (let n = 0; n < 2000; n++) {
        if (n % 30 === 0) {
          i.moveX = rng.range(-1, 1); i.moveZ = rng.range(-1, 1);
          const was = i.swing; i.swing = rng.chance(0.6); i.swingPressed = i.swing && !was; i.swingReleased = !i.swing && was;
          const wj = i.jump; i.jump = rng.chance(0.3); i.jumpPressed = i.jump && !wj; i.jumpReleased = !i.jump && wj;
          i.zipPressed = rng.chance(0.05); i.dive = rng.chance(0.2);
          const yaw = rng.range(0, Math.PI * 2);
          i.camFwd = { x: Math.sin(yaw) * 0.9, y: 0.3, z: Math.cos(yaw) * 0.9 };
          i.camPos = { x: h.body.p.x - i.camFwd.x * 5, y: h.body.p.y + 1, z: h.body.p.z - i.camFwd.z * 5 };
        }
        h.step(i, dt);
        i.swingPressed = false; i.swingReleased = false; i.jumpPressed = false; i.jumpReleased = false; i.zipPressed = false;
        expect(Number.isFinite(h.body.p.x + h.body.p.y + h.body.p.z)).toBe(true);
        expect(w.pointInside(h.body.p.x, h.body.p.y, h.body.p.z, 0.05)).toBe(false);
      }
      const sum = { x: v0.x, y: v0.y, z: v0.z };
      for (const s of SOURCES) { sum.x += h.body.log[s].x; sum.y += h.body.log[s].y; sum.z += h.body.log[s].z; }
      expect(sum.x).toBeCloseTo(h.body.v.x, 6);
      expect(sum.y).toBeCloseTo(h.body.v.y, 6);
      expect(sum.z).toBeCloseTo(h.body.v.z, 6);
    }
  });
});
