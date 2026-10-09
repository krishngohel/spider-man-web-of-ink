import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { plantWeight, footOffset, pelvisDrop, createFootPlant, PLANT } from '../../src/hero/footPlant.js';

describe('foot planting rules', () => {
  it('plants standing and walking slowly, fades out by a jog, never off the ground or when busy', () => {
    expect(plantWeight({ state: 'ground', speed: 0 })).toBe(1);
    expect(plantWeight({ state: 'ground', speed: PLANT.walkFull })).toBe(1);
    const mid = plantWeight({ state: 'ground', speed: (PLANT.walkFull + PLANT.walkOff) / 2 });
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
    expect(plantWeight({ state: 'ground', speed: PLANT.walkOff })).toBe(0);
    for (const state of ['swing', 'air', 'wall', 'zip', 'glide', 'hang']) expect(plantWeight({ state, speed: 0 })).toBe(0);
    expect(plantWeight({ state: 'ground', speed: 0, busy: true })).toBe(0);
  });
  it('a foot takes the higher of its heel and ball; a drop or a riser is not ground', () => {
    expect(footOffset(10, 10, 10)).toBe(0);
    expect(footOffset(10, 10.3, 10)).toBeCloseTo(0.3);
    expect(footOffset(10, 9.8, 9.7)).toBeCloseTo(-0.2);
    expect(footOffset(10, 0, 0)).toBe(0); // over the street from a roof: hangs level
    expect(footOffset(10, 11.2, 10)).toBe(0); // a riser, not a step
    expect(footOffset(10, -Infinity, -Infinity)).toBe(0);
  });
  it('the pelvis lowers to the lower foot and never rises', () => {
    expect(pelvisDrop(0, 0)).toBeCloseTo(0);
    expect(pelvisDrop(-0.3, 0.1)).toBeCloseTo(-0.3);
    expect(pelvisDrop(0.2, 0.1)).toBe(0);
  });
});

// A stick figure: model -> pelvis -> thigh (hip 0.1 m to the side, 0.9 m up) -> calf (0.45 m down,
// knee a touch forward) -> foot (0.4 m down) -> ball (0.12 m forward). Feet on y = 0 at rest.
function figure() {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const pelvis = new THREE.Bone(); pelvis.position.set(0, 0.95, 0); model.add(pelvis);
  for (const [s, x] of [['l', 0.1], ['r', -0.1]]) {
    const thigh = new THREE.Bone(); thigh.name = `thigh_${s}`; thigh.position.set(x, -0.05, 0); pelvis.add(thigh);
    const calf = new THREE.Bone(); calf.name = `calf_${s}`; calf.position.set(0, -0.45, 0.03); thigh.add(calf);
    const foot = new THREE.Bone(); foot.name = `foot_${s}`; foot.position.set(0, -0.4, -0.03); calf.add(foot);
    const ball = new THREE.Bone(); ball.name = `ball_${s}`; ball.position.set(0, -0.05, 0.12); foot.add(ball);
  }
  root.updateMatrixWorld(true);
  return { root, model, bone: (n) => model.getObjectByName(n) };
}
const wy = (o) => o.getWorldPosition(new THREE.Vector3()).y;

describe('foot planting on a skeleton', () => {
  it('flat ground: nothing moves', () => {
    const f = figure();
    const before = ['foot_l', 'foot_r', 'calf_l'].map((n) => f.bone(n).getWorldPosition(new THREE.Vector3()));
    const plant = createFootPlant(f.model, () => 0);
    for (let i = 0; i < 30; i++) { plant.update(1 / 60, 0, 1, { x: 0, z: 1 }); f.root.updateMatrixWorld(true); }
    ['foot_l', 'foot_r', 'calf_l'].forEach((n, i) => expect(f.bone(n).getWorldPosition(new THREE.Vector3()).distanceTo(before[i])).toBeLessThan(1e-6));
    expect(f.model.position.y).toBe(0);
  });
  it('across a step: the pelvis lowers to the lower foot, the upper knee bends to keep its foot on the step', () => {
    // Body on a 0.3 m step that ends at x = 0: the left foot (x = +0.1) is out over the street.
    const f = figure();
    f.model.position.y = 0.3; f.root.updateMatrixWorld(true);
    const footR0 = wy(f.bone('foot_r'));
    const plant = createFootPlant(f.model, (x) => (x < 0 ? 0.3 : 0));
    for (let i = 0; i < 60; i++) { plant.update(1 / 60, 0.3, 1, { x: 0, z: 1 }); f.root.updateMatrixWorld(true); }
    expect(plant.drop).toBeCloseTo(-0.3, 2);
    expect(wy(f.bone('foot_l'))).toBeCloseTo(footR0 - 0.3, 2); // down on the street
    expect(wy(f.bone('foot_r'))).toBeCloseTo(footR0, 2); // still on the step
    // The right knee bent, forward (+z).
    expect(f.bone('calf_r').getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(0.05);
  });
  it('lets go at once when cut (a jump), and fades with speed', () => {
    const f = figure();
    f.model.position.y = 0.3;
    const plant = createFootPlant(f.model, (x) => (x < 0 ? 0.3 : 0));
    for (let i = 0; i < 60; i++) plant.update(1 / 60, 0.3, 1, { x: 0, z: 1 });
    expect(plant.weight).toBeGreaterThan(0.99);
    plant.update(1 / 60, 0.3, 0, { x: 0, z: 1 }, true);
    expect(plant.weight).toBe(0);
    expect(f.model.position.y).toBeCloseTo(0.3);
  });
});
