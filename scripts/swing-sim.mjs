// Deterministic swing simulation in Node over the real test city: the same hero controller and
// anchor search the game runs, driven by a bot that plays like a person holding swing (the
// game chains the arcs), holding forward, and nudging away from walls. No browser, no latency, so
// the numbers are reproducible and tuning changes can be compared exactly.
//   node scripts/swing-sim.mjs [trials] [seconds] [gravity] [seed]
import { buildTestCity } from '../src/world/testCity.js';
import { createWorld } from '../src/physics/world.js';
import { createHero, emptyIntent } from '../src/hero/controller.js';
import { STEP } from '../src/physics/constants.js';
import { createRng } from '../src/core/rng.js';

export function makeWorld() {
  const city = buildTestCity();
  const world = createWorld();
  for (const b of city.boxes) world.addBox(b);
  world.build();
  return { city, world };
}

export const MIDTOWN = { minX: -235, maxX: 235, minZ: -415, maxZ: 115 };

// One run: start mid-air heading along `heading` (0 = +z) and swing for `seconds` (or until the
// hero leaves the course).
export function runBot(world, { x, y, z, heading, speed = 18, seconds = 20, gravity = 'comic', bounds = MIDTOWN }) {
  const hero = createHero(world, { gravity });
  const hx = Math.sin(heading), hz = Math.cos(heading);
  hero.place(x, y, z, hx * speed, 0, hz * speed, 'air');
  const it = emptyIntent();
  it.camFwd = { x: hx, y: -0.15, z: hz };
  let t = 0, grounded = 0, walls = 0, swings = 0, minY = Infinity, maxSpeed = 0, lastState = '';
  let sum = 0, sum2 = 0, n = 0, altSum = 0, arcLo = Infinity, arcHi = -Infinity;
  const arcs = [];
  const centre = { x, z };
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    const b = hero.body, v = b.v;
    if (bounds && (b.p.x < bounds.minX || b.p.x > bounds.maxX || b.p.z < bounds.minZ || b.p.z > bounds.maxZ)) break;
    t += STEP;
    // Hold forward, leaning back toward the start line when drifting off it.
    const off = (b.p.x - centre.x) * hz - (b.p.z - centre.z) * hx;
    const latV = v.x * hz - v.z * hx;
    const steer = Math.max(-0.8, Math.min(0.8, -off * 0.05 - latV * 0.04));
    it.moveX = hx + steer * hz; it.moveZ = hz - steer * hx;
    const ml = Math.hypot(it.moveX, it.moveZ); it.moveX /= ml; it.moveZ /= ml;
    it.camPos = { x: b.p.x - hx * 5, y: b.p.y + 1.5, z: b.p.z - hz * 5 };
    const prevJump = it.jump, prevSwing = it.swing;
    if (hero.state === 'wall') {
      if (lastState !== 'wall') walls++;
      it.swing = true; it.jump = !prevJump; // kick off the wall and keep swinging
    } else if (hero.state === 'ground') {
      grounded++;
      it.swing = true; it.jump = !prevJump;
    } else { it.swing = true; it.jump = false; }
    it.swingPressed = it.swing && !prevSwing; it.swingReleased = !it.swing && prevSwing;
    it.jumpPressed = it.jump && !prevJump; it.jumpReleased = !it.jump && prevJump;
    if (hero.state === 'swing' && lastState !== 'swing') {
      swings++;
      if (t > 2 && arcHi > arcLo) arcs.push(arcHi - arcLo);
      arcLo = Infinity; arcHi = -Infinity;
    }
    lastState = hero.state;
    hero.step(it, STEP);
    hero.events.length = 0;
    const sp = hero.speed;
    minY = Math.min(minY, hero.body.p.y);
    maxSpeed = Math.max(maxSpeed, sp);
    if (t > 2) {
      sum += sp; sum2 += sp * sp; n++;
      const py = hero.body.p.y;
      altSum += py - world.groundHeight(hero.body.p.x, py - 0.9, hero.body.p.z);
      arcLo = Math.min(arcLo, py); arcHi = Math.max(arcHi, py);
    }
  }
  const b = hero.body;
  const dist = (b.p.x - x) * hx + (b.p.z - z) * hz;
  const mean = n ? sum / n : 0;
  const sd = n ? Math.sqrt(Math.max(0, sum2 / n - mean * mean)) : 0;
  const per16 = 16 / Math.max(1, t);
  const arc = arcs.length ? arcs.reduce((a, c) => a + c, 0) / arcs.length : 0;
  return { dist, avg: dist / Math.max(1, t), time: t, mean, sd, maxSpeed, minY, groundSteps: grounded, walls: walls * per16, swings: swings * per16, alt: n ? altSum / n : 0, arc };
}

// The standard battery: avenues heading north through Midtown, streets heading east.
export function battery(world, { trials = 12, seconds = 16, gravity = 'comic', seed = 5 } = {}) {
  const rng = createRng(seed);
  const out = [];
  for (let i = 0; i < trials; i++) {
    const avenue = i % 2 === 0;
    const run = avenue
      ? { x: [-120, 0, 120][i % 3], y: rng.range(30, 60), z: rng.range(-400, -340), heading: 0 }
      : { x: rng.range(-230, -200), y: rng.range(30, 60), z: [-300, -180, -60][i % 3], heading: Math.PI / 2 };
    out.push({ ...run, ...runBot(world, { ...run, seconds, gravity }) });
  }
  return out;
}

export function summary(rs) {
  return {
    clean: rs.filter((r) => r.groundSteps === 0).length,
    runs: rs.length,
    avgKmh: (rs.reduce((s, r) => s + r.avg, 0) / rs.length) * 3.6,
    cv: rs.reduce((s, r) => s + (r.mean ? r.sd / r.mean : 1), 0) / rs.length,
    walls: rs.reduce((s, r) => s + r.walls, 0) / rs.length,
    swings: rs.reduce((s, r) => s + r.swings, 0) / rs.length,
    minY: Math.min(...rs.map((r) => r.minY)),
    alt: rs.reduce((s, r) => s + r.alt, 0) / rs.length,
    meanKmh: (rs.reduce((s, r) => s + r.mean, 0) / rs.length) * 3.6,
    topKmh: Math.max(...rs.map((r) => r.maxSpeed)) * 3.6,
    arc: rs.reduce((s, r) => s + r.arc, 0) / rs.length,
  };
}

if (process.argv[1]?.endsWith('swing-sim.mjs')) {
  const trials = +(process.argv[2] ?? 12), seconds = +(process.argv[3] ?? 16), gravity = process.argv[4] ?? 'comic', seed = +(process.argv[5] ?? 5);
  const { world } = makeWorld();
  const t0 = Date.now();
  const rs = battery(world, { trials, seconds, gravity, seed });
  for (const r of rs) console.log(`${r.heading ? 'street' : 'avenue'} x${r.x.toFixed(0)} z${r.z.toFixed(0)}: ${r.dist.toFixed(0)} m in ${r.time.toFixed(1)} s, avg ${(r.avg * 3.6).toFixed(0)} km/h, speed ${(r.mean * 3.6).toFixed(0)} +/- ${(r.sd * 3.6).toFixed(0)}, low ${r.minY.toFixed(1)} m, ground ${(r.groundSteps * STEP).toFixed(2)} s, walls ${r.walls.toFixed(1)}, swings ${r.swings.toFixed(1)}`);
  const s = summary(rs);
  console.log(`SUMMARY clean ${s.clean}/${s.runs}, avg ${s.avgKmh.toFixed(0)} km/h, speed cv ${s.cv.toFixed(2)}, walls/16s ${s.walls.toFixed(1)}, swings/16s ${s.swings.toFixed(1)}, alt ${s.alt.toFixed(0)} m, arc ${s.arc.toFixed(1)} m, lowest ${s.minY.toFixed(1)} m  (${Date.now() - t0} ms)`);
}
