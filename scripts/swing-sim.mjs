// Deterministic swing simulation in Node over the real test city: the same hero controller and
// anchor search the game runs, driven by a human-like bot. No browser, no latency, so the numbers
// are reproducible and tuning changes can be compared exactly.
//   node scripts/swing-sim.mjs [trials] [seconds] [gravity]
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

// One run: start mid-air on an avenue heading +z (or -x on a street) and swing for `seconds`.
export const MIDTOWN = { minX: -235, maxX: 235, minZ: -415, maxZ: 115 };

export function runBot(world, { x, y, z, heading, speed = 22, seconds = 20, gravity = 'comic', pump = true, bounds = MIDTOWN }) {
  const hero = createHero(world, { gravity });
  const hx = Math.sin(heading), hz = Math.cos(heading);
  hero.place(x, y, z, hx * speed, 0, hz * speed, 'air');
  const it = emptyIntent();
  it.camFwd = { x: hx, y: -0.15, z: hz };
  const steps = Math.round(seconds / STEP);
  let holding = false, sawDown = false, heldFor = 0, sinceRelease = 1, grounded = 0, walls = 0, webs = 0;
  let minY = Infinity, maxSpeed = 0, lastState = '';
  const centre = { x, z }; // the line we want to follow
  let t = 0;
  for (let i = 0; i < steps; i++) {
    const b = hero.body, v = b.v;
    // The course is Midtown (towers to swing from): leaving it ends the run.
    if (bounds && (b.p.x < bounds.minX || b.p.x > bounds.maxX || b.p.z < bounds.minZ || b.p.z > bounds.maxZ)) break;
    t += STEP;
    // Stay on the start line: input forward plus a correction back toward the line.
    const off = (b.p.x - centre.x) * hz - (b.p.z - centre.z) * hx; // signed offset to the left (+)
    const latV = v.x * hz - v.z * hx;
    const steer = Math.max(-1, Math.min(1, -off * 0.06 - latV * 0.05));
    // move = forward + steer * left
    it.moveX = hx + steer * hz; it.moveZ = hz - steer * hx;
    const ml = Math.hypot(it.moveX, it.moveZ); it.moveX /= ml; it.moveZ /= ml;
    it.camPos = { x: b.p.x - hx * 5, y: b.p.y + 1.5, z: b.p.z - hz * 5 };
    const prev = { swing: it.swing, jump: it.jump };
    if (hero.state === 'wall') {
      if (lastState !== 'wall') walls++;
      it.swing = false; it.jump = !prev.jump; // tap jump to kick off
    } else if (hero.state === 'ground') {
      grounded++;
      it.swing = false; it.jump = !prev.jump;
    } else {
      if (!holding && sinceRelease > 0.2 && (v.y < -1 || b.p.y < 25)) { holding = true; sawDown = false; heldFor = 0; webs++; }
      if (holding) {
        heldFor += STEP;
        if (hero.rope.active && v.y < -1) sawDown = true;
        const outward = Math.sign(off) * latV;
        if (hero.rope.active && ((sawDown && v.y > 2) || (Math.abs(off) > 7 && outward > 4) || heldFor > 2.6)) { holding = false; sinceRelease = 0; }
      } else sinceRelease += STEP;
      it.swing = holding;
      it.jump = pump && holding && hero.state === 'swing' && Math.abs(v.y) < 9;
    }
    it.swingPressed = it.swing && !prev.swing; it.swingReleased = !it.swing && prev.swing;
    it.jumpPressed = it.jump && !prev.jump; it.jumpReleased = !it.jump && prev.jump;
    lastState = hero.state;
    hero.step(it, STEP);
    hero.events.length = 0;
    minY = Math.min(minY, hero.body.p.y);
    maxSpeed = Math.max(maxSpeed, hero.speed);
  }
  const b = hero.body;
  const dist = (b.p.x - x) * hx + (b.p.z - z) * hz;
  return { dist, avg: dist / Math.max(1, t), time: t, maxSpeed, minY, groundSteps: grounded, walls: walls * (16 / Math.max(1, t)), webs };
}

// The standard battery: avenues heading north through Midtown, streets heading east, mixed starts.
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

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('swing-sim.mjs')) {
  const trials = +(process.argv[2] ?? 12), seconds = +(process.argv[3] ?? 16), gravity = process.argv[4] ?? 'comic', seed = +(process.argv[5] ?? 5);
  const { world } = makeWorld();
  const t0 = Date.now();
  const rs = battery(world, { trials, seconds, gravity, seed });
  for (const r of rs) console.log(`${r.heading ? 'street' : 'avenue'} x${r.x.toFixed(0)} z${r.z.toFixed(0)}: ${r.dist.toFixed(0)} m, avg ${(r.avg * 3.6).toFixed(0)} km/h, top ${(r.maxSpeed * 3.6).toFixed(0)}, low ${r.minY.toFixed(1)} m, ground ${(r.groundSteps * STEP).toFixed(1)} s, walls ${r.walls}, webs ${r.webs}`);
  const clean = rs.filter((r) => r.groundSteps === 0).length;
  const avg = rs.reduce((s, r) => s + r.avg, 0) / rs.length;
  const walls = rs.reduce((s, r) => s + r.walls, 0) / rs.length;
  console.log(`SUMMARY clean ${clean}/${rs.length}, avg ${(avg * 3.6).toFixed(0)} km/h, walls/run ${walls.toFixed(1)}  (${Date.now() - t0} ms)`);
}
