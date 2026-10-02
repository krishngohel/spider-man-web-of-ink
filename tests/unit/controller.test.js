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
    intent.swingPressed = false; intent.swingReleased = false; intent.jumpPressed = false; intent.jumpReleased = false; intent.zipPressed = false; intent.hangPressed = false; intent.trickPressed = false;
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
  // Mechanical energy per kg (a swing-jump may turn speed into height).
  const energy = (h) => 0.5 * h.speed ** 2 + 19.62 * h.body.p.y;

  // Points the crosshair from the hero's shoulder straight at a world point.
  const aim = (i, h, x, y, z) => {
    const cx = h.body.p.x, cy = h.body.p.y + 0.6, cz = h.body.p.z;
    const dx = x - cx, dy = y - cy, dz = z - cz, l = Math.hypot(dx, dy, dz);
    i.camPos = { x: cx, y: cy, z: cz };
    i.camFwd = { x: dx / l, y: dy / l, z: dz / l };
  };

  it('the web sticks exactly where it was aimed and the hero swings on it', () => {
    const w = city();
    const h = createHero(w);
    h.place(0, 40, 0, 0, 0, 20);
    const i = emptyIntent();
    aim(i, h, 15, 62, 30); // the east towers' west face
    i.swing = true; i.swingPressed = true;
    run(h, i, 0.3);
    expect(h.state).toBe('swing');
    expect(h.swing.R.x).toBeCloseTo(14.95, 1);
    expect(h.swing.R.y).toBeCloseTo(62, 0);
    expect(h.swing.R.z).toBeCloseTo(30, 0);
  });
  it('a miss is a miss: aiming at open sky fires nothing', () => {
    const w = city();
    const h = createHero(w);
    h.place(0, 40, 0, 0, 0, 20);
    const i = emptyIntent();
    i.camPos = { x: 0, y: 41, z: -5 }; i.camFwd = { x: 0, y: 0.3, z: 0.954 };
    i.swing = true; i.swingPressed = true;
    let missed = false;
    run(h, i, 0.4, () => { if (h.events.some((e) => e.type === 'miss')) missed = true; });
    expect(h.state).toBe('air');
    expect(h.pendingWeb).toBe(null);
  });
  it('a swing carries forward after the release', () => {
    const w = city();
    const h = createHero(w);
    h.place(0, 40, 0, 0, 0, 20);
    const i = emptyIntent();
    aim(i, h, 15, 62, 30);
    i.swing = true; i.swingPressed = true;
    let attached = false;
    run(h, i, 1.2, () => { if (h.state === 'swing') attached = true; });
    expect(attached).toBe(true);
    i.swing = false; i.swingReleased = true;
    run(h, i, 0.05);
    expect(h.state).toBe('air');
    expect(h.body.v.z).toBeGreaterThan(10);
  });
  it('a new press while swinging lets go and fires at the new aim', () => {
    const w = city();
    const h = createHero(w);
    h.place(0, 40, 0, 0, 0, 20);
    const i = emptyIntent();
    aim(i, h, 15, 62, 30);
    i.swing = true; i.swingPressed = true;
    run(h, i, 0.5);
    aim(i, h, -15, 60, 50);
    i.swingPressed = true;
    run(h, i, 0.3);
    expect(h.state).toBe('swing');
    expect(h.swing.R.x).toBeLessThan(-14);
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
  it('a swing-jump adds speed and lift', () => {
    const go = (jump) => {
      const w = city();
      const h = createHero(w);
      h.place(0, 40, 0, 0, 0, 20);
      const i = emptyIntent();
      aim(i, h, 15, 62, 30);
      i.swing = true; i.swingPressed = true;
      run(h, i, 0.9);
      if (jump) { i.jumpPressed = true; run(h, i, dt); }
      i.swing = false; i.swingReleased = true;
      run(h, i, 0.3);
      return energy(h);
    };
    expect(go(true)).toBeGreaterThan(go(false) + 20);
  });
});

describe('walls', () => {
  it('a slow hit sticks to the wall, removing the speed into it', () => {
    const w = city();
    const h = createHero(w);
    h.place(12, 30, 25, 5, 0, 1);
    run(h, emptyIntent(), 0.6);
    expect(h.state).toBe('wall');
    expect(Math.abs(h.body.v.x)).toBeLessThan(1);
  });
  it('a fast hit becomes a wall run that keeps most of the speed', () => {
    const w = city();
    const h = createHero(w);
    h.place(12, 30, 25, 20, 0, 6);
    const before = Math.hypot(20, 6);
    let ran = null;
    run(h, emptyIntent(), 0.6, () => { if (!ran && h.state === 'wall') ran = { speed: h.speed, vx: h.body.v.x, vy: h.body.v.y }; });
    expect(ran).not.toBe(null);
    expect(ran.speed).toBeGreaterThan(before * 0.6);
    expect(Math.abs(ran.vx)).toBeLessThan(1);
    expect(ran.vy).toBeGreaterThan(2);
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
          i.hangPressed = rng.chance(0.1); i.climb = rng.range(-1, 1);
          const yaw = rng.range(0, Math.PI * 2);
          i.camFwd = { x: Math.sin(yaw) * 0.9, y: 0.3, z: Math.cos(yaw) * 0.9 };
          i.camPos = { x: h.body.p.x - i.camFwd.x * 5, y: h.body.p.y + 1, z: h.body.p.z - i.camFwd.z * 5 };
        }
        h.step(i, dt);
        i.swingPressed = false; i.swingReleased = false; i.jumpPressed = false; i.jumpReleased = false; i.zipPressed = false; i.hangPressed = false;
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

describe('hanging on a web', () => {
  const aim = (i, h, x, y, z) => {
    const cx = h.body.p.x, cy = h.body.p.y + 0.6, cz = h.body.p.z;
    const dx = x - cx, dy = y - cy, dz = z - cz, l = Math.hypot(dx, dy, dz);
    i.camPos = { x: cx, y: cy, z: cz };
    i.camFwd = { x: dx / l, y: dy / l, z: dz / l };
  };
  // Swinging on the east towers, then the hang key grabs the line.
  function hanging() {
    const w = city();
    const h = createHero(w);
    h.strict = true;
    h.place(0, 40, 0, 0, 0, 20);
    const i = emptyIntent();
    aim(i, h, 15, 62, 30);
    i.swing = true; i.swingPressed = true;
    run(h, i, 0.3);
    expect(h.state).toBe('swing');
    i.hangPressed = true; i.swing = false;
    run(h, i, dt);
    return { w, h, i };
  }

  it('grabbing the line mid-swing hangs from it, no button held, and settles under the anchor', () => {
    const { h, i } = hanging();
    expect(h.state).toBe('hang');
    run(h, i, 8);
    expect(h.state).toBe('hang');
    expect(h.speed).toBeLessThan(0.6);
    const P = h.swing.P;
    expect(Math.hypot(h.body.p.x - P.x, h.body.p.z - P.z)).toBeLessThan(1.2);
  });
  it('climbing shortens the line, sliding lengthens it, C rappels fast', () => {
    const { h, i } = hanging();
    run(h, i, 3);
    let L0 = h.swing.L;
    i.climb = 1; run(h, i, 1);
    expect(L0 - h.swing.L).toBeCloseTo(tune.hangClimb, 0);
    L0 = h.swing.L;
    i.climb = -1; run(h, i, 1);
    // From climbing to sliding takes a beat to reverse.
    expect(h.swing.L - L0).toBeGreaterThan(tune.hangSlide * 0.85);
    expect(h.swing.L - L0).toBeLessThan(tune.hangSlide + 0.1);
    L0 = h.swing.L;
    i.climb = 0; i.dive = true; run(h, i, 0.5);
    expect(h.swing.L - L0).toBeGreaterThan(tune.hangSlide * 0.5 + 2);
  });
  it('sliding all the way down puts the hero on the street, never through it', () => {
    const { h, i } = hanging();
    i.climb = -1; i.dive = true;
    run(h, i, 8, () => expect(h.body.p.y).toBeGreaterThan(0.85));
    expect(h.state).toBe('ground');
    expect(h.body.p.y).toBeCloseTo(0.9, 1);
  });
  it('jumping off the line launches up and away', () => {
    const { h, i } = hanging();
    run(h, i, 2);
    i.jumpPressed = true;
    run(h, i, dt);
    expect(h.state).toBe('air');
    expect(h.swing.active).toBe(false);
    expect(h.body.v.y).toBeGreaterThan(8);
  });
  it('the hang key again lets go', () => {
    const { h, i } = hanging();
    run(h, i, 1);
    i.hangPressed = true;
    run(h, i, dt);
    expect(h.state).toBe('air');
    expect(h.swing.active).toBe(false);
  });
  it('the hang key in the air fires a web that hangs straight away', () => {
    const w = city();
    const h = createHero(w);
    h.place(0, 40, 0, 0, 0, 5);
    const i = emptyIntent();
    aim(i, h, 15, 62, 10);
    i.hangPressed = true;
    run(h, i, 0.3);
    expect(h.state).toBe('hang');
    expect(h.swing.R.y).toBeCloseTo(62, 0);
  });
  it('a hang web on a miss does nothing', () => {
    const w = city();
    const h = createHero(w);
    h.place(0, 40, 0, 0, 0, 5);
    const i = emptyIntent();
    i.camPos = { x: 0, y: 41, z: -5 }; i.camFwd = { x: 0, y: 0.3, z: 0.954 };
    i.hangPressed = true;
    run(h, i, 0.3);
    expect(h.state).toBe('air');
  });
  it('climbing to the top of a web stuck under a roof edge pulls the hero up onto the roof', () => {
    const w = city();
    const h = createHero(w);
    h.strict = true;
    h.place(-140, 8, 0, 0, 0, 0);
    const i = emptyIntent();
    aim(i, h, -150, 19.3, 0); // the low building's east face, just under its 20 m roof
    i.hangPressed = true;
    run(h, i, 0.1);
    expect(h.state).toBe('hang');
    i.climb = 1;
    let vaulted = false;
    run(h, i, 6, () => { if (h.events.some((e) => e.type === 'vault')) vaulted = true; });
    expect(vaulted).toBe(true);
    expect(h.state).toBe('ground');
    expect(h.body.p.y).toBeCloseTo(20.9, 1);
    expect(h.body.p.x).toBeLessThan(-150.2);
  });
  it('hangs upside down after holding still a moment, and turns upright to climb', () => {
    const { h, i } = hanging();
    run(h, i, 8);
    expect(h.hangInverted).toBe(true);
    i.climb = 1; run(h, i, 0.1);
    expect(h.hangInverted).toBe(false);
  });
});

describe('ledges, corners and launches', () => {
  it('coming up just short of a roof grabs the edge and mantles over', () => {
    const w = city();
    const h = createHero(w);
    h.strict = true;
    h.place(-146, 19.2, 0, -8, 1, 0); // the low building: east face x = -150, roof 20 m
    const i = emptyIntent(); i.moveX = -1;
    let mantled = false;
    run(h, i, 2, () => { if (h.events.some((e) => e.type === 'mantle')) mantled = true; });
    expect(mantled).toBe(true);
    expect(h.state).toBe('ground');
    expect(h.body.p.y).toBeCloseTo(20.9, 1);
    expect(h.body.p.x).toBeLessThan(-150.3);
  });
  it('hitting a wall far below the roof still sticks to the wall', () => {
    const w = city();
    const h = createHero(w);
    h.place(-146, 10, 0, -8, 1, 0);
    const i = emptyIntent();
    run(h, i, 0.6);
    expect(h.state).toBe('wall');
    expect(h.events.some((e) => e.type === 'mantle')).toBe(false);
  });
  it('a swing into a roof edge mantles onto the roof instead of slapping the wall', () => {
    const w = city();
    const h = createHero(w);
    h.strict = true;
    h.place(-145, 19.4, 0, -14, 1, 0);
    const i = emptyIntent();
    let mantled = false;
    run(h, i, 1.5, () => { if (h.events.some((e) => e.type === 'mantle')) mantled = true; });
    expect(mantled).toBe(true);
    expect(h.body.p.y).toBeGreaterThan(20.5);
  });
  it('swinging round a building corner whips the hero round it with a boost', () => {
    // Flying east along a street; the web on the south face near the south-east corner. The line
    // wraps the corner and the hero comes round it, heading north up the avenue.
    const w = createWorld();
    w.addBox({ min: [10, 0, 30], max: [40, 100, 80] });
    w.build();
    const h = createHero(w);
    h.place(22, 50, 18, 26, 0, 0);
    const i = emptyIntent();
    const cx = 22, cy = 50.6, cz = 18, tx = 37, ty = 68, tz = 30;
    const l = Math.hypot(tx - cx, ty - cy, tz - cz);
    i.camPos = { x: cx, y: cy, z: cz }; i.camFwd = { x: (tx - cx) / l, y: (ty - cy) / l, z: (tz - cz) / l };
    i.swing = true; i.swingPressed = true;
    let corner = null;
    run(h, i, 2, () => { const e = h.events.find((x) => x.type === 'corner'); if (e && !corner) corner = e; });
    expect(corner).not.toBe(null);
    expect(corner.boost).toBeGreaterThan(0);
    expect(h.body.v.z).toBeGreaterThan(10); // round the corner, heading north
  });
  it('landing near a roof edge opens a point launch for a moment', () => {
    const w = city();
    const h = createHero(w);
    h.place(-151.2, 22, 0, 0, -6, 0);
    const i = emptyIntent(); i.camFwd = { x: 1, y: 0, z: 0 };
    run(h, i, 0.4);
    expect(h.state).toBe('ground');
    i.jumpPressed = true;
    run(h, i, dt);
    expect(h.events.some((e) => e.type === 'launch')).toBe(true);
    expect(Math.hypot(h.body.v.x, h.body.v.z)).toBeGreaterThan(12);
  });
  it('landing in the middle of a roof is a plain landing (a jump is a jump)', () => {
    const w = city();
    const h = createHero(w);
    h.place(-175, 22, 0, 0, -6, 0);
    const i = emptyIntent(); i.camFwd = { x: 1, y: 0, z: 0 };
    run(h, i, 0.4);
    i.jumpPressed = true;
    run(h, i, dt);
    expect(h.events.some((e) => e.type === 'launch')).toBe(false);
  });
  it('wall to wall: a wall jump across an alley sticks to the far wall and can jump again', () => {
    const w = createWorld();
    w.addBox({ min: [-20, 0, -30], max: [-4, 60, 30] });
    w.addBox({ min: [4, 0, -30], max: [20, 60, 30] });
    w.build();
    const h = createHero(w);
    h.strict = true;
    h.place(-3.6, 20, 0, 0, 0, 0, 'wall');
    h.wall.nx = 1; h.wall.nz = 0;
    const i = emptyIntent(); i.camFwd = { x: 1, y: 0.2, z: 0 };
    i.jumpPressed = true;
    let stuck = false;
    run(h, i, 1.2, () => { if (h.state === 'wall' && h.body.p.x > 0) stuck = true; });
    expect(stuck).toBe(true);
    const y1 = h.body.p.y;
    i.camFwd = { x: -1, y: 0.2, z: 0 }; i.jumpPressed = true;
    let back = false;
    run(h, i, 1.2, () => { if (h.state === 'wall' && h.body.p.x < 0) back = true; });
    expect(back).toBe(true);
    expect(h.body.p.y).toBeGreaterThan(y1 - 6);
  });
});

describe('feedback', () => {
  it('a swing press on the ground with nothing in range is a parkour run, not a MISSED', () => {
    const w = createWorld();
    w.addBox({ min: [-500, -1, -500], max: [500, 0, 500], kind: 'ground' });
    w.build();
    const h = createHero(w);
    h.place(0, 0.9, 0, 0, 0, 0, 'ground');
    const i = emptyIntent(); i.moveZ = 1; i.swing = true; i.swingPressed = true;
    i.camPos = { x: 0, y: 2, z: -4 }; i.camFwd = { x: 0, y: 0.1, z: 0.995 };
    run(h, i, 0.5);
    expect(h.events.some((e) => e.type === 'miss')).toBe(false);
    expect(h.state).toBe('ground');
  });
});

describe('jump height and tricks', () => {
  function peak(hold) {
    const w = createWorld();
    w.addBox({ min: [-500, -1, -500], max: [500, 0, 500], kind: 'ground' });
    w.build();
    const h = createHero(w);
    h.strict = true;
    h.place(0, 0.9, 0, 0, 0, 0, 'ground');
    const i = emptyIntent(); i.jumpPressed = true; i.jump = true;
    let top = 0, n = 0;
    run(h, i, 2, () => { n++; if (n === Math.round(hold / dt)) i.jump = false; top = Math.max(top, h.body.p.y); });
    return top - 0.9;
  }
  it('a tap jumps the same instant; holding jump goes much higher', () => {
    const tap = peak(dt), held = peak(1);
    expect(tap).toBeGreaterThan(1.8);
    expect(held / tap).toBeGreaterThan(1.6);
    expect(held / tap).toBeLessThan(2.6);
  });
  it('the trick key flips in the air, not on the ground', () => {
    const w = createWorld();
    w.addBox({ min: [-500, -1, -500], max: [500, 0, 500], kind: 'ground' });
    w.build();
    const h = createHero(w);
    h.place(0, 0.9, 0, 0, 0, 0, 'ground');
    const i = emptyIntent(); i.trickPressed = true;
    run(h, i, dt);
    expect(h.events.some((e) => e.type === 'trick')).toBe(false);
    h.place(0, 40, 0, 0, 0, 20);
    i.trickPressed = true;
    run(h, i, dt);
    expect(h.events.some((e) => e.type === 'trick')).toBe(true);
  });
});

describe('forgiving inputs (spec C8)', () => {
  it('a jump pressed just before landing fires on landing instead of opening the wings', () => {
    const w = city();
    const h = createHero(w);
    h.place(-175, 21.15, 0, 0, -3, 0, 'air');
    h.airTime = 0.5;
    const it = emptyIntent();
    it.jumpPressed = true;
    run(h, it, 1 / 120);
    expect(h.state).not.toBe('glide');
    let jumped = false;
    run(h, emptyIntent(), 0.3, () => { if (h.body.v.y > 3) jumped = true; });
    expect(jumped).toBe(true);
  });
  it('a jump high in the air still opens the web wings', () => {
    const w = city();
    const h = createHero(w);
    h.place(-175, 40, 0, 0, -3, 0, 'air');
    h.airTime = 0.5;
    const it = emptyIntent();
    it.jumpPressed = true; it.jump = true;
    run(h, it, 1 / 120);
    expect(h.state).toBe('glide');
  });
});
