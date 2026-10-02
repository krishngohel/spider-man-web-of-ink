import { applyGravity, applyDrag, dragK, applyGlide } from '../physics/aero.js';
import { applyDv } from '../physics/ledger.js';
import { tune } from '../physics/constants.js';

// Traversal archetypes (spec section 13). Every character obeys the physics rule: each has its own
// real source of force, and none of them jump in mid-air or teleport. The swingers use the hero
// controller as it is (no mover); every other archetype is a mover that either takes a step over
// or edits the intent before the swinger's states run (blocking webs a character does not have).
//
// A mover: { id, step(hero, intent, dt, api) -> true when it handled the whole step,
//            after?(hero, intent, dt, api), tune?: { param: value } (overrides on the hero's
//            parameters while this character is played), fuel?: 0..1 for the HUD }.

const noWebs = (intent) => { intent.swingPressed = false; intent.hangPressed = false; intent.zipPressed = false; intent.swing = intent.swing && false; };

// Grappler: parkour and one grapple line (Black Cat's line, Kraven's spear rope), on a cooldown.
export function grappler({ cooldown = 1.2, wall = true } = {}) {
  const m = { id: 'grappler', cd: 0, tune: { jumpSpeed: 11 } };
  m.step = (hero, intent, dt, api) => {
    m.cd = Math.max(0, m.cd - dt);
    const grapple = intent.swingPressed || intent.zipPressed;
    intent.swingPressed = false; intent.hangPressed = false; intent.zipPressed = false;
    if (grapple && m.cd <= 0 && hero.state !== 'zip') {
      if (api.tryZip(intent)) { m.cd = cooldown; api.move(dt); return true; }
    }
    if (!wall && hero.state === 'wall') { api.toAir(); }
    return false;
  };
  return m;
}

// Flyer: a wing harness. Thrust along the look direction, lift from the wings (the glide polar),
// a strong climb thrust, and real drag. Lands like anyone else.
export function flyer({ thrust = 16, climb = 24, maxSpeed = 40 } = {}) {
  const m = { id: 'flyer' };
  m.step = (hero, intent, dt, api) => {
    noWebs(intent);
    if (hero.state === 'ground' || hero.state === 'wall') return false;
    hero.state = 'air';
    hero.airTime += dt;
    const b = hero.body, v = b.v, f = intent.camFwd;
    applyGravity(b, api.g(), dt);
    applyDrag(b, dragK(api.g(), maxSpeed), dt);
    // Wings: the glide polar turns speed into lift.
    const fwd = intent.moveX * (v.x / (Math.hypot(v.x, v.z) || 1)) + intent.moveZ * (v.z / (Math.hypot(v.x, v.z) || 1));
    applyGlide(b, -fwd * 0.5, intent.moveX * -(v.z / (Math.hypot(v.x, v.z) || 1)) + intent.moveZ * (v.x / (Math.hypot(v.x, v.z) || 1)), dt);
    // Harness thrust: along the look direction when pushing forward, up when holding jump.
    const push = Math.min(1, Math.hypot(intent.moveX, intent.moveZ));
    if (push > 0.1) applyDv(b, 'assist', f.x * thrust * push * dt, f.y * thrust * push * dt, f.z * thrust * push * dt);
    if (intent.jump) applyDv(b, 'assist', 0, climb * dt, 0);
    if (intent.dive) applyDv(b, 'assist', 0, -climb * 0.6 * dt, 0);
    api.move(dt);
    if (api.touch.ground && v.y <= 0.5) api.land();
    else if (api.touch.wall) { applyDv(b, 'surface', -v.x * 0.6, 0, -v.z * 0.6); }
    return true;
  };
  return m;
}

// Glider: Goblin's jet glider. Jet thrust along the look direction, hover jets that hold the
// glider up while the fuel lasts, and a top speed set by real drag.
export function glider({ thrust = 22, maxSpeed = 48 } = {}) {
  const m = { id: 'glider', fuel: 1 };
  m.step = (hero, intent, dt, api) => {
    noWebs(intent);
    if (hero.state === 'ground') { m.fuel = Math.min(1, m.fuel + dt * 0.4); return false; }
    if (hero.state === 'wall') { api.toAir(); }
    hero.state = 'air';
    hero.airTime += dt;
    const b = hero.body, v = b.v, f = intent.camFwd;
    applyGravity(b, api.g(), dt);
    applyDrag(b, dragK(api.g(), maxSpeed), dt);
    const push = Math.min(1, Math.hypot(intent.moveX, intent.moveZ));
    if (push > 0.1) applyDv(b, 'assist', f.x * thrust * push * dt, f.y * thrust * push * dt, f.z * thrust * push * dt);
    // Hover: thrust that cancels gravity (and a little more) while fuel lasts.
    if (intent.jump && m.fuel > 0) { applyDv(b, 'assist', 0, api.g() * 1.15 * dt, 0); m.fuel = Math.max(0, m.fuel - dt * 0.12); }
    else if (!intent.jump) m.fuel = Math.min(1, m.fuel + dt * 0.06);
    // Steady the glider: sideways slip is damped by the fins (drag across the board).
    const sh = Math.hypot(v.x, v.z);
    if (sh > 1) { const sx = -f.z, sz = f.x, side = v.x * sx + v.z * sz; applyDv(b, 'drag', -sx * side * Math.min(1, dt * 2), 0, -sz * side * Math.min(1, dt * 2)); }
    api.move(dt);
    if (api.touch.ground && v.y <= 0.5) api.land();
    else if (api.touch.wall) applyDv(b, 'surface', -v.x * 0.6, 0, -v.z * 0.6);
    return true;
  };
  return m;
}

// Hover: Mysterio's boots. Thrust a little over gravity while the fuel lasts, gentle air steering.
export function hover({ fuelSecs = 6, accel = 8 } = {}) {
  const m = { id: 'hover', fuel: 1 };
  m.step = (hero, intent, dt, api) => {
    noWebs(intent);
    if (hero.state === 'ground') { m.fuel = Math.min(1, m.fuel + dt * 0.35); return false; }
    if (hero.state !== 'air' && hero.state !== 'glide') return false;
    hero.state = 'air';
    hero.airTime += dt;
    const b = hero.body, v = b.v;
    applyGravity(b, api.g(), dt);
    applyDrag(b, dragK(api.g(), tune.terminal), dt);
    if (intent.jump && m.fuel > 0) { applyDv(b, 'assist', 0, api.g() * 1.12 * dt, 0); m.fuel = Math.max(0, m.fuel - dt / fuelSecs); }
    const mm = Math.hypot(intent.moveX, intent.moveZ);
    if (mm > 0.1 && intent.jump && m.fuel > 0) applyDv(b, 'assist', (intent.moveX / mm) * accel * dt, 0, (intent.moveZ / mm) * accel * dt);
    // Hover boots damp the sway.
    if (intent.jump) applyDv(b, 'assist', -v.x * Math.min(1, dt * 0.6), 0, -v.z * Math.min(1, dt * 0.6));
    api.move(dt);
    if (api.touch.ground && v.y <= 0.5) api.land();
    else if (api.touch.wall) api.enterWall(api.touch);
    return true;
  };
  return m;
}

// Climber: Lizard and Scorpion. Any wall is grabbed, climbed and pounced off; no webs.
export function climber({ pounce = 15, grapple = null } = {}) {
  const m = { id: 'climber', cd: 0, tune: { wallRunSpeed: 8 } };
  m.step = (hero, intent, dt, api) => {
    m.cd = Math.max(0, m.cd - dt);
    const wantGrapple = grapple && (intent.swingPressed || intent.zipPressed);
    intent.swingPressed = false; intent.hangPressed = false; intent.zipPressed = false;
    if (wantGrapple && m.cd <= 0 && hero.state !== 'zip' && api.tryZip(intent)) { m.cd = grapple; api.move(dt); return true; }
    // On a wall the claws hold on: climbing is the swing button's job for the swinger, here it is
    // just moving.
    if (hero.state === 'wall') intent.swing = Math.hypot(intent.moveX, intent.moveZ) > 0.2 || intent.swing;
    // Pounce: off a wall along the look direction, legs pushing on the wall.
    if (hero.state === 'wall' && intent.jumpPressed) {
      const f = intent.camFwd, v = hero.body.v;
      api.push(f.x * pounce - v.x, Math.max(4, f.y * pounce + 4) - v.y, f.z * pounce - v.z, 'pounce');
      hero.state = 'air'; hero.airTime = 0.1;
      api.emit('pounce');
      api.move(dt);
      return true;
    }
    return false;
  };
  m.after = (hero, intent, dt, api) => {
    // Running into a wall on the ground or touching one in the air: grab it.
    if ((hero.state === 'ground' || hero.state === 'air') && api.touch.wall && Math.hypot(intent.moveX, intent.moveZ) > 0.3) api.enterWall(api.touch);
  };
  return m;
}

// Ground heavy: Rhino and Kingpin. Huge mass and momentum; a charge on the swing button; can't
// climb, can't web; a low jump.
export function heavy({ charge = 19, run = 8 } = {}) {
  const m = { id: 'heavy', charging: false, tune: { runSpeed: run, parkourSpeed: charge, jumpSpeed: 6.5, groundAccel: 22 } };
  m.step = (hero, intent, dt, api) => {
    m.charging = hero.state === 'ground' && intent.swing && Math.hypot(intent.moveX, intent.moveZ) > 0.3;
    intent.swingPressed = false; intent.hangPressed = false; intent.zipPressed = false;
    if (hero.state === 'wall') { api.toAir(); }
    return false;
  };
  m.after = (hero, intent, dt, api) => {
    if (m.charging && api.touch.wall) { api.emit('crash'); const v = hero.body.v; api.push(-v.x * 0.9, 0, -v.z * 0.9, 'crash'); }
    if (hero.state === 'wall') api.toAir();
  };
  return m;
}

// Cable rider: Electro. A magnetic pull to metal (lamp posts, cars, antennas, the bridge) and a
// magnetic shove away from metal near him. No webs.
export function cableRider({ metal = [], range = 70 } = {}) {
  const m = { id: 'cableRider', cd: 0, metal };
  m.step = (hero, intent, dt, api) => {
    m.cd = Math.max(0, m.cd - dt);
    const pull = intent.swingPressed || intent.zipPressed;
    intent.swingPressed = false; intent.hangPressed = false; intent.zipPressed = false;
    const p = hero.body.p, f = intent.camFwd;
    if (pull && m.cd <= 0 && hero.state !== 'zip') {
      // The metal nearest the look direction, in range.
      let best = null, bs = -Infinity;
      for (const q of m.metal) {
        const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, d = Math.hypot(dx, dy, dz);
        if (d > range || d < 4) continue;
        const along = (dx * f.x + dy * f.y + dz * f.z) / d;
        if (along < 0.9) continue;
        const sc = along * 2 - d / range;
        if (sc > bs) { bs = sc; best = q; }
      }
      if (best) {
        // From the ground, a hop first (legs), so the pull lifts him instead of dragging him.
        if (hero.state === 'ground') api.push(0, 6, 0, 'hop into the pull');
        api.rope.attach({ x: best.x, y: best.y, z: best.z, nx: 0, ny: 1, nz: 0 }, hero.body, 0.6);
        hero.state = 'zip'; hero.zipTime = 0; hero.zip = { top: true, box: null };
        m.cd = 0.4;
        api.emit('zip'); api.emit('arc', { x: best.x, y: best.y, z: best.z });
        api.move(dt);
        return true;
      }
    }
    // Magnetic shove off nearby metal (in the air): a push straight away from it.
    if (intent.jumpPressed && hero.state === 'air') {
      let near = null, nd = 7;
      for (const q of m.metal) { const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); if (d < nd) { nd = d; near = q; } }
      if (near) {
        const dx = p.x - near.x, dy = p.y - near.y, dz = p.z - near.z, d = Math.hypot(dx, dy, dz) || 1;
        applyDv(hero.body, 'assist', (dx / d) * 13, (dy / d) * 13 + 4, (dz / d) * 13);
        api.emit('shove');
        intent.jumpPressed = false;
      }
    }
    return false;
  };
  return m;
}

// Recoil jumper: Shocker. Each vibro blast pushes him the opposite way (Newton's third law), so a
// blast at the ground throws him up and a blast behind him throws him forward. No webs.
export function recoilJumper({ kick = 11, cooldown = 0.32 } = {}) {
  const m = { id: 'recoil', cd: 0 };
  m.step = (hero, intent, dt, api) => {
    m.cd = Math.max(0, m.cd - dt);
    const blast = intent.swingPressed;
    intent.swingPressed = false; intent.hangPressed = false; intent.zipPressed = false;
    if (blast && m.cd <= 0) {
      const f = intent.camFwd, v = hero.body.v;
      applyDv(hero.body, 'assist', -f.x * kick, -f.y * kick + (hero.state === 'ground' ? 2 : 0), -f.z * kick);
      if (hero.state === 'ground' && -f.y * kick > 2) { hero.state = 'air'; hero.airTime = 0.1; }
      m.cd = cooldown;
      api.emit('vibro', { x: f.x, y: f.y, z: f.z });
      void v;
    }
    return false;
  };
  return m;
}

// Sand surfer: Sandman. Surfs the ground fast on a wave of sand, and launches on a sand pillar (a
// push off the ground). No webs, no wall running.
export function sandSurfer({ pillar = 19 } = {}) {
  const m = { id: 'sand', tune: { runSpeed: 14, parkourSpeed: 21, groundAccel: 26 } };
  m.step = (hero, intent, dt, api) => {
    const launch = intent.swingPressed && hero.state === 'ground';
    intent.swingPressed = false; intent.hangPressed = false; intent.zipPressed = false;
    if (launch) {
      const v = hero.body.v, f = intent.camFwd, fl = Math.hypot(f.x, f.z) || 1;
      api.push((f.x / fl) * 5 - v.x * 0.3, pillar - Math.max(0, v.y), (f.z / fl) * 5 - v.z * 0.3, 'sand pillar');
      hero.state = 'air'; hero.airTime = 0;
      api.emit('pillar');
      api.move(dt);
      return true;
    }
    if (hero.state === 'wall') api.toAir();
    return false;
  };
  return m;
}

// Tentacle walker: Doctor Octopus. Four arms plant on any surface: he climbs like a climber and
// pulls himself along with a tentacle grapple on a short cooldown; a tall, strong stride.
export function tentacleWalker() {
  const m = climber({ pounce: 17, grapple: 0.5 });
  m.id = 'tentacles';
  m.tune = { runSpeed: 10, parkourSpeed: 14, jumpSpeed: 12, wallRunSpeed: 9 };
  return m;
}

export const MOVERS = { grappler, flyer, glider, hover, climber, heavy, cableRider, recoilJumper, sandSurfer, tentacleWalker };
