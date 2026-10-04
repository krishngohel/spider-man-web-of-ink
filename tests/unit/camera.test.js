import { describe, it, expect } from 'vitest';
import { createCameraRig, speedCurves, CAM } from '../../src/camera/cameraRig.js';
import { createWorld } from '../../src/physics/world.js';
import { createBody } from '../../src/physics/ledger.js';

const heroAt = (x, y, z, vx = 0, vy = 0, vz = 0, state = 'air') => {
  const body = createBody({ x, y, z });
  body.v.x = vx; body.v.y = vy; body.v.z = vz;
  return { body, state };
};
const still = { dx: 0, dy: 0 };

describe('camera curves', () => {
  it('opens distance and field of view with speed', () => {
    const slow = speedCurves(0), fast = speedCurves(60), faster = speedCurves(90);
    expect(slow.dist).toBeCloseTo(CAM.baseDist);
    expect(slow.fov).toBeCloseTo(60);
    expect(fast.dist).toBeCloseTo(CAM.baseDist + CAM.speedDist);
    expect(fast.fov).toBeCloseTo(82);
    expect(faster.fov).toBeCloseTo(82);
  });
});

describe('camera rig', () => {
  it('stops short of a wall between it and the hero', () => {
    const w = createWorld();
    w.addBox({ min: [-10, 0, -6], max: [10, 50, -3] });
    w.build();
    const rig = createCameraRig();
    rig.yaw = 0; rig.pitch = 0;
    const hero = heroAt(0, 10, 0, 0, 0, 0, 'ground');
    for (let i = 0; i < 60; i++) rig.update(1 / 60, still, hero, w);
    expect(rig.pos.z).toBeGreaterThan(-3);
  });
  it('never goes under the ground or a roof under it', () => {
    const w = createWorld();
    w.addBox({ min: [-20, 0, -20], max: [20, 30, 20] });
    w.build();
    const rig = createCameraRig();
    rig.pitch = -1.2; // looking up from below: the camera wants to drop under the hero
    const hero = heroAt(0, 30.9, 0, 0, 0, 0, 'ground');
    for (let i = 0; i < 60; i++) rig.update(1 / 60, still, hero, w);
    expect(rig.pos.y).toBeGreaterThanOrEqual(30 + CAM.groundClear - 1e-6);
  });
  it('swings behind the direction of travel only after the player stops steering', () => {
    const rig = createCameraRig();
    rig.yaw = Math.PI / 2; // looking along +x
    const hero = heroAt(0, 50, 0, 0, 0, 30); // moving along +z
    rig.update(0.1, { dx: 5, dy: 0 }, hero, null);
    const steered = rig.yaw;
    rig.update(0.5, still, hero, null);
    expect(Math.abs(rig.yaw - steered)).toBeLessThan(0.01);
    for (let i = 0; i < 300; i++) rig.update(1 / 60, still, hero, null);
    expect(Math.abs(rig.yaw)).toBeLessThan(0.15);
  });
  it('does not auto-follow while standing on the ground', () => {
    const rig = createCameraRig();
    rig.yaw = 1;
    const hero = heroAt(0, 0.9, 0, 0, 0, 9, 'ground');
    for (let i = 0; i < 300; i++) rig.update(1 / 60, still, hero, null);
    expect(rig.yaw).toBeCloseTo(1, 5);
  });
  it('on a wall it tips the view up the wall and leaves the yaw to the player', () => {
    const w = createWorld();
    w.addBox({ min: [10, 0, -20], max: [30, 80, 20] });
    w.build();
    const rig = createCameraRig();
    rig.yaw = 1.2; rig.pitch = 0.3;
    const hero = heroAt(9.6, 20, 0, 0, 0, 0, 'wall');
    hero.wall = { nx: -1, nz: 0 };
    for (let i = 0; i < 120; i++) rig.update(1 / 60, still, hero, w);
    expect(rig.pitch).toBeLessThan(-0.1);     // looking a little up the wall
    expect(rig.yaw).toBeCloseTo(1.2, 5);      // wall jumps leave along the player's aim
    expect(rig.pos.x).toBeLessThan(9.6);      // never inside the wall
  });
  it('switches to the left shoulder when a wall blocks the right', () => {
    const w = createWorld();
    // Facing +z, the right side is -x: a wall just there.
    w.addBox({ min: [-6, 0, -30], max: [-0.6, 80, 30] });
    w.build();
    const rig = createCameraRig();
    rig.yaw = 0; rig.pitch = 0.1;
    const hero = heroAt(0, 10, 0, 0, 0, 0, 'ground');
    for (let i = 0; i < 60; i++) rig.update(1 / 60, still, hero, w);
    expect(rig.side).toBeLessThan(0);
  });
});

import { fightFraming } from '../../src/camera/cameraRig.js';
import { lookCurve } from '../../src/core/input.js';
describe('combat framing and the look stick', () => {
  it('pulls back with the spread of the fight, between 5.2 and 8 m', () => {
    expect(fightFraming(null)).toBe(null);
    expect(fightFraming({ pts: [{ x: 0, z: 2 }], spread: 2 }).dist).toBeCloseTo(5.9);
    expect(fightFraming({ pts: [{ x: 0, z: 2 }], spread: 30 }).dist).toBe(8);
  });
  it('the stick is gentle near the centre and full at the edge', () => {
    expect(lookCurve(1)).toBeCloseTo(1);
    expect(lookCurve(-1)).toBeCloseTo(-1);
    expect(lookCurve(0.2)).toBeLessThan(0.1);
  });
});

describe('traversal camera (overhaul C2 to C6)', () => {
  const open = () => { const w = createWorld(); w.addBox({ min: [-500, -1, -500], max: [500, 0, 500] }); w.build(); return w; };
  it('in the air it never looks up past -0.6 rad and never sinks a metre under the hero', () => {
    const rig = createCameraRig();
    rig.pitch = -1.2;
    const hero = heroAt(0, 40, 0, 0, 0, 20, 'swing');
    for (let i = 0; i < 120; i++) rig.update(1 / 60, still, hero, open());
    expect(rig.pitch).toBeGreaterThan(-0.62);
    expect(rig.pos.y).toBeGreaterThan(40 + CAM.focusHeight - CAM.flyFloor - 0.01);
  });
  it('a hair of mouse jitter does not count as steering', () => {
    const rig = createCameraRig();
    const hero = heroAt(0, 40, 0, 0, 0, 20, 'air');
    rig.sinceLook = 5;
    rig.update(1 / 60, { dx: 0.2, dy: 0.1 }, hero, open());
    expect(rig.sinceLook).toBeGreaterThan(5);
    rig.update(1 / 60, { dx: 6, dy: 0 }, hero, open());
    expect(rig.sinceLook).toBe(0);
  });
  it('the field of view only opens from 15 m/s', () => {
    expect(speedCurves(14).fov).toBeCloseTo(60);
    expect(speedCurves(35).fov).toBeGreaterThan(65);
  });
  it('a web attach kicks the camera in, eased in (no one-frame jump), and the kick fades', () => {
    const rig = createCameraRig();
    rig.onAttach();
    expect(rig.kickWant).toBeCloseTo(CAM.attachKick);
    const hero = heroAt(0, 40, 0, 0, 0, 20, 'swing');
    rig.update(1 / 60, still, hero, open());
    expect(rig.kick).toBeGreaterThan(0);
    expect(rig.kick).toBeLessThan(CAM.attachKick * 0.4);
    let peak = 0;
    for (let i = 0; i < 90; i++) { rig.update(1 / 60, still, hero, open()); peak = Math.max(peak, rig.kick); }
    expect(peak).toBeGreaterThan(CAM.attachKick * 0.4);
    expect(rig.kick).toBeLessThan(0.01);
  });
  it('the shoulder offset follows the state', () => {
    expect(CAM.shoulderBy.swing).toBeLessThan(CAM.shoulderBy.ground);
  });
});

describe('turning toward a new objective (spec F3)', () => {
  it('eases the yaw toward the heading, and gives way the moment the player steers', () => {
    const w = createWorld(); w.addBox({ min: [-500, -1, -500], max: [500, 0, 500] }); w.build();
    const rig = createCameraRig();
    rig.yaw = 0;
    const hero = heroAt(0, 0.9, 0, 0, 0, 0, 'ground');
    rig.faceYaw(1.0);
    for (let i = 0; i < 40; i++) rig.update(1 / 60, still, hero, w);
    expect(rig.yaw).toBeGreaterThan(0.8);
    rig.faceYaw(-1.0);
    rig.update(1 / 60, { dx: 30, dy: 0 }, hero, w);
    expect(rig.turnTo).toBe(null);
  });
});
