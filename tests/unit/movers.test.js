import { describe, it, expect } from 'vitest';
import { createHero, emptyIntent } from '../../src/hero/controller.js';
import { createWorld } from '../../src/physics/world.js';
import { SOURCES } from '../../src/physics/ledger.js';
import { MOVERS } from '../../src/movers/movers.js';
import { tune, DEFAULTS } from '../../src/physics/constants.js';

const dt = 1 / 240;
function world() {
  const w = createWorld();
  w.addBox({ min: [20, 0, -50], max: [40, 60, 50] });  // a tower to climb, east
  w.addBox({ min: [-200, 0, -40], max: [-150, 20, 40] });
  w.build();
  return w;
}
function hero(w, mover, at = [0, 0.9, 0], state = 'ground') {
  const h = createHero(w);
  h.mover = mover;
  for (const [k, v] of Object.entries(mover.tune ?? {})) tune[k] = v;
  h.place(at[0], at[1], at[2], 0, 0, 0, state);
  return h;
}
function run(h, i, secs, each) {
  for (let n = 0; n < Math.round(secs / dt); n++) {
    h.step(i, dt);
    i.swingPressed = i.jumpPressed = i.zipPressed = i.hangPressed = false;
    if (each) each(n);
  }
}
const reset = () => Object.assign(tune, DEFAULTS);
const ledgerOk = (h, v0) => {
  const s = { x: v0.x, y: v0.y, z: v0.z };
  for (const k of SOURCES) { s.x += h.body.log[k].x; s.y += h.body.log[k].y; s.z += h.body.log[k].z; }
  return Math.abs(s.x - h.body.v.x) < 1e-6 && Math.abs(s.y - h.body.v.y) < 1e-6 && Math.abs(s.z - h.body.v.z) < 1e-6;
};

describe('movers', () => {
  it('flyer: thrust and climb keep him up; letting go he glides down and lands', () => {
    reset();
    const w = world(), h = hero(w, MOVERS.flyer(), [0, 30, 0], 'air');
    const i = emptyIntent(); i.moveZ = 1; i.jump = true; i.camFwd = { x: 0, y: 0, z: 1 };
    run(h, i, 2);
    expect(h.body.p.y).toBeGreaterThan(30);
    i.moveZ = 0; i.jump = false;
    run(h, i, 12);
    expect(h.state).toBe('ground');
    expect(ledgerOk(h, { x: 0, y: 0, z: 0 })).toBe(true);
  });
  it('glider: hover holds height while the fuel lasts, then it runs out', () => {
    reset();
    const w = world(), m = MOVERS.glider(), h = hero(w, m, [-100, 40, 0], 'air');
    const i = emptyIntent(); i.jump = true; i.camFwd = { x: 0, y: 0, z: 1 };
    run(h, i, 3);
    expect(h.body.p.y).toBeGreaterThan(38);
    run(h, i, 8);
    expect(m.fuel).toBe(0);
  });
  it('hover boots rise slowly and run dry', () => {
    reset();
    const w = world(), m = MOVERS.hover(), h = hero(w, m, [-100, 10, 0], 'air');
    const i = emptyIntent(); i.jump = true;
    run(h, i, 2);
    expect(h.body.p.y).toBeGreaterThan(10);
    expect(h.body.v.y).toBeLessThan(6);
    run(h, i, 6);
    expect(m.fuel).toBe(0);
  });
  it('climber grabs a wall by running into it and pounces off along the look', () => {
    reset();
    const w = world(), h = hero(w, MOVERS.climber(), [17, 0.9, 0]);
    const i = emptyIntent(); i.moveX = 1;
    run(h, i, 1);
    expect(h.state).toBe('wall');
    i.camFwd = { x: -0.7, y: 0.7, z: 0 }; i.jumpPressed = true;
    run(h, i, dt);
    expect(h.state).toBe('air');
    expect(h.body.v.x).toBeLessThan(-5);
    expect(h.body.v.y).toBeGreaterThan(5);
  });
  it('heavy: the charge is much faster than his run, and he never sticks to a wall', () => {
    reset();
    const w = world(), m = MOVERS.heavy(), h = hero(w, m, [-100, 0.9, 0]);
    const i = emptyIntent(); i.moveZ = 1;
    run(h, i, 1.5);
    const walk = Math.hypot(h.body.v.x, h.body.v.z);
    i.swing = true;
    run(h, i, 1.5);
    expect(Math.hypot(h.body.v.x, h.body.v.z)).toBeGreaterThan(walk * 1.8);
    const h2 = hero(w, MOVERS.heavy(), [17, 0.9, 0]);
    const j = emptyIntent(); j.moveX = 1; j.swing = true;
    run(h2, j, 1, () => expect(h2.state).not.toBe('wall'));
  });
  it('cable rider: pulls to metal in the look direction, nothing else', () => {
    reset();
    const metal = [{ x: 0, y: 6, z: 40 }];
    const w = world(), h = hero(w, MOVERS.cableRider({ metal }), [0, 0.9, 0]);
    const i = emptyIntent(); i.camFwd = { x: 0, y: 0.12, z: 0.99 }; i.swingPressed = true;
    run(h, i, dt);
    expect(h.state).toBe('zip');
    run(h, i, 1.5);
    expect(h.body.p.z).toBeGreaterThan(25);
    const h2 = hero(w, MOVERS.cableRider({ metal }), [0, 0.9, 0]);
    const j = emptyIntent(); j.camFwd = { x: 1, y: 0, z: 0 }; j.swingPressed = true;
    run(h2, j, dt);
    expect(h2.state).toBe('ground');
  });
  it('recoil: a blast at the ground throws Shocker up, a blast ahead throws him back', () => {
    reset();
    const w = world(), h = hero(w, MOVERS.recoilJumper(), [-100, 0.9, 0]);
    const i = emptyIntent(); i.camFwd = { x: 0, y: -1, z: 0 }; i.swingPressed = true;
    run(h, i, dt);
    expect(h.state).toBe('air');
    expect(h.body.v.y).toBeGreaterThan(8);
    const h2 = hero(w, MOVERS.recoilJumper(), [-100, 20, 0], 'air');
    const j = emptyIntent(); j.camFwd = { x: 0, y: 0, z: 1 }; j.swingPressed = true;
    run(h2, j, dt);
    expect(h2.body.v.z).toBeLessThan(-8);
  });
  it('sand surfer: a sand pillar launches high from the ground, never from the air', () => {
    reset();
    const w = world(), h = hero(w, MOVERS.sandSurfer(), [-100, 0.9, 0]);
    const i = emptyIntent(); i.camFwd = { x: 0, y: 0, z: 1 }; i.swingPressed = true;
    let top = 0;
    run(h, i, 2, () => { top = Math.max(top, h.body.p.y); });
    expect(top).toBeGreaterThan(8);
    const h2 = hero(w, MOVERS.sandSurfer(), [-100, 20, 0], 'air');
    const j = emptyIntent(); j.swingPressed = true;
    run(h2, j, dt);
    expect(h2.body.v.y).toBeLessThan(1);
  });
  it('grappler: one line, then a cooldown', () => {
    reset();
    const w = world(), m = MOVERS.grappler({ cooldown: 2 }), h = hero(w, m, [0, 0.9, 0]);
    const i = emptyIntent(); i.camPos = { x: 0, y: 2, z: 0 }; i.camFwd = { x: 0.95, y: 0.3, z: 0 }; i.swingPressed = true;
    run(h, i, dt);
    expect(h.state).toBe('zip');
    expect(m.cd).toBeGreaterThan(1.9);
  });
});
