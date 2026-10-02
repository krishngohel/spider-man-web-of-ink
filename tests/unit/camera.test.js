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
});
