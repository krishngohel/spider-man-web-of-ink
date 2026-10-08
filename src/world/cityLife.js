import * as THREE from 'three';
import { AUX_DECL, AUX_WRITE_FLAT } from '../render/gbuffer.js';
import { createRng } from '../core/rng.js';
import { LAND } from './city.js';
import { comicToon } from '../render/comicShade.js';
import { CAR_COLORS } from './streetProps.js';
import { carParts } from './carShape.js';

// City life (spec section 5): pedestrians on the sidewalks, traffic on the avenues and streets,
// pigeons on the roofs and helicopters overhead. All of it lives in a bubble around the player
// and is recycled when it falls behind, so the cost stays flat however big the city is. Visual
// only: none of it is in the physics world (parked cars are, from streetProps).

const PED_N = 420, CAR_N = 140, BIRD_N = 90, RADIUS = 260, PED_R = 170;

// A chunky comic pedestrian from primitives, with a 'part' attribute the vertex shader animates
// (0 torso, 1 head, 2 left leg, 3 right leg, 4 left arm, 5 right arm).
function pedGeometry() {
  const parts = [];
  const add = (g, part, col) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    const n = ng.attributes.position.count;
    ng.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
    const c = new THREE.Color(col);
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
    ng.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    parts.push(ng);
  };
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  add(box(0.46, 0.62, 0.26, 0, 1.22, 0), 0, 0xffffff);           // shirt (tinted per person)
  add(new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.7, 0), 1, 0xd9a77e); // head (skin)
  add(box(0.18, 0.86, 0.2, -0.12, 0.45, 0), 2, 0x2b2f3a);         // legs (dark trousers)
  add(box(0.18, 0.86, 0.2, 0.12, 0.45, 0), 3, 0x2b2f3a);
  add(box(0.12, 0.6, 0.14, -0.3, 1.22, 0), 4, 0xffffff);           // arms (sleeves)
  add(box(0.12, 0.6, 0.14, 0.3, 1.22, 0), 5, 0xffffff);
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'part']) {
    const size = parts[0].attributes[k].itemSize;
    const arr = new Float32Array(parts.reduce((s, p) => s + p.attributes[k].array.length, 0));
    let o = 0;
    for (const p of parts) { arr.set(p.attributes[k].array, o); o += p.attributes[k].array.length; }
    out.setAttribute(k, new THREE.Float32BufferAttribute(arr, size));
  }
  return out;
}

// Walk cycle in the vertex shader: legs and arms swing about the hip and shoulder from a per-person
// phase; the skin tone is a per-person mix.
const PED_VERTEX = /* glsl */ `
attribute float part;
attribute vec2 aWalk;   // phase, swing amount (0 standing, 1 walking, 2 running)
attribute float aSkin;
varying float vSkin;
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
`;
const PED_BEGIN = /* glsl */ `
vSkin = part > 0.5 && part < 1.5 ? aSkin : -1.0;
float sw = sin(aWalk.x) * 0.55 * min(aWalk.y, 1.6);
if (part > 1.5 && part < 3.5) {
  float a = part < 2.5 ? sw : -sw;
  transformed = rotX(a) * (transformed - vec3(0.0, 0.88, 0.0)) + vec3(0.0, 0.88, 0.0);
} else if (part > 3.5) {
  float a = (part < 4.5 ? -sw : sw) * 0.8;
  transformed = rotX(a) * (transformed - vec3(0.0, 1.5, 0.0)) + vec3(0.0, 1.5, 0.0);
}
transformed.y += abs(cos(aWalk.x)) * 0.04 * min(aWalk.y, 1.0);
`;

export function createCityLife(scene, city, quality) {
  const rng = createRng(4242);
  const g = city.grid;
  const isCity = (x, z) => city.landAt(x, z) === LAND.city;
  const group = new THREE.Group();
  group.name = 'cityLife';
  scene.add(group);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  // Pedestrians ---------------------------------------------------------------------------------
  const pedMat = comicToon({ vertexColors: true }, {
    vertexHead: PED_VERTEX, vertexBegin: PED_BEGIN,
    fragmentHead: 'varying float vSkin;',
    fragmentColor: 'if (vSkin >= 0.0) diffuseColor.rgb = mix(vec3(0.95, 0.76, 0.6), vec3(0.36, 0.22, 0.14), vSkin);',
  });
  const pedGeo = pedGeometry();
  const walk = new THREE.InstancedBufferAttribute(new Float32Array(PED_N * 2), 2);
  const skin = new THREE.InstancedBufferAttribute(new Float32Array(PED_N), 1);
  pedGeo.setAttribute('aWalk', walk);
  pedGeo.setAttribute('aSkin', skin);
  const peds = new THREE.InstancedMesh(pedGeo, pedMat, PED_N);
  peds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  peds.frustumCulled = false;
  peds.castShadow = false;
  group.add(peds);
  const SHIRTS = [0xd8392b, 0x2a5fb0, 0xf2c230, 0x3f8f5a, 0xeeeeea, 0x7a4a9a, 0xe07a2a, 0x2b2b33, 0x5aa0c8];
  const ped = Array.from({ length: PED_N }, () => ({ x: 0, z: 0, dx: 0, dz: 1, speed: 1.3, phase: 0, flee: 0, alive: false }));
  ped.forEach((o, i) => { peds.setColorAt(i, new THREE.Color(SHIRTS[i % SHIRTS.length])); skin.array[i] = rng.next(); });
  peds.instanceColor.needsUpdate = true;
  skin.needsUpdate = true;

  function placePed(o, cx, cz, anywhere) {
    for (let tries = 0; tries < 12; tries++) {
      const alongAvenue = rng.chance(0.5);
      const side = rng.chance(0.5) ? 1 : -1;
      const r = anywhere ? rng.range(10, PED_R) : rng.range(PED_R * 0.7, PED_R);
      const a = rng.range(0, Math.PI * 2);
      let x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (alongAvenue) {
        const ax = Math.round((x - g.minX) / g.avenueEvery) * g.avenueEvery + g.minX;
        x = ax + side * (g.avenueWidth / 2 + 1.5 + rng.range(-0.6, 0.6));
        o.dx = 0; o.dz = rng.chance(0.5) ? 1 : -1;
      } else {
        const sz = Math.round((z - g.minZ) / g.streetEvery) * g.streetEvery + g.minZ;
        z = sz + side * (g.streetWidth / 2 + 1.5 + rng.range(-0.6, 0.6));
        o.dx = rng.chance(0.5) ? 1 : -1; o.dz = 0;
      }
      if (!isCity(x, z)) continue;
      o.x = x; o.z = z; o.speed = rng.range(1.1, 1.7); o.phase = rng.range(0, 6.28); o.flee = 0; o.alive = true;
      return;
    }
    o.alive = false;
  }

  // Traffic ---------------------------------------------------------------------------------------
  const carGeo = carGeometry();
  const carMat = comicToon({ vertexColors: true });
  const cars = new THREE.InstancedMesh(carGeo, carMat, CAR_N);
  cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cars.frustumCulled = false;
  cars.castShadow = quality.shadows;
  group.add(cars);
  const car = Array.from({ length: CAR_N }, (_, i) => ({ axis: 0, lane: 0, pos: 0, dir: 1, speed: 0, max: 12, alive: false, police: i % 17 === 0 }));
  car.forEach((c, i) => cars.setColorAt(i, new THREE.Color(c.police ? 0x22252e : CAR_COLORS[i % CAR_COLORS.length])));
  cars.instanceColor.needsUpdate = true;
  // Lanes: along an avenue (axis 0, moving in z) or a street (axis 1, moving in x). Right-hand
  // traffic: the lane offset sets the direction.
  const AV_LANES = [[-9, -1], [-4.5, -1], [4.5, 1], [9, 1]], ST_LANES = [[-3, -1], [3, 1]];
  function placeCar(c, cx, cz, anywhere) {
    for (let tries = 0; tries < 12; tries++) {
      c.axis = rng.chance(0.62) ? 0 : 1;
      const r = anywhere ? rng.range(20, RADIUS) : rng.range(RADIUS * 0.75, RADIUS);
      const a = rng.range(0, Math.PI * 2);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      let lx, lz;
      if (c.axis === 0) {
        const ln = AV_LANES[rng.int(0, 3)];
        lx = Math.round((x - g.minX) / g.avenueEvery) * g.avenueEvery + g.minX + ln[0]; lz = z;
        c.lane = lx; c.dir = ln[1]; c.pos = lz;
      } else {
        const ln = ST_LANES[rng.int(0, 1)];
        lz = Math.round((z - g.minZ) / g.streetEvery) * g.streetEvery + g.minZ + ln[0]; lx = x;
        c.lane = lz; c.dir = ln[1]; c.pos = lx;
      }
      if (!isCity(lx, lz)) continue;
      c.max = rng.range(10, 15) * (c.police ? 1.25 : 1);
      c.speed = c.max * 0.6;
      c.alive = true;
      return;
    }
    c.alive = false;
  }

  // Pigeons ---------------------------------------------------------------------------------------
  const birdGeo = new THREE.BufferGeometry();
  // A body and two wings (a wing vertex carries side = +-1 for the flap).
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.18, -0.06, 0, -0.14, 0.06, 0, -0.14,
    0, 0, 0.06, -0.28, 0, -0.04, 0, 0, -0.08,
    0, 0, 0.06, 0, 0, -0.08, 0.28, 0, -0.04,
  ], 3));
  birdGeo.setAttribute('side', new THREE.Float32BufferAttribute([0, 0, 0, 0, -1, 0, 0, 0, 1], 1));
  const flap = new THREE.InstancedBufferAttribute(new Float32Array(BIRD_N), 1);
  birdGeo.setAttribute('aFlap', flap);
  birdGeo.computeVertexNormals();
  const birdMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: `attribute float side; attribute float aFlap; void main() { vec3 p = position; p.y += abs(side) * sin(aFlap) * 0.2; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0); }`,
    fragmentShader: `${AUX_DECL}
void main() { gl_FragColor = vec4(0.32, 0.33, 0.4, 1.0); ${AUX_WRITE_FLAT} }`,
  });
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, BIRD_N);
  birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  birds.frustumCulled = false;
  group.add(birds);
  const roofs = city.boxes.filter((b) => b.kind === 'building' && !b.landmark && b.max[1] > 12 && b.max[1] < 140 && (b.max[0] - b.min[0]) > 10);
  const flocks = Array.from({ length: BIRD_N / 10 }, () => ({ x: 0, y: 0, z: 0, up: false, t: 0, alive: false }));
  const bird = Array.from({ length: BIRD_N }, () => ({ ox: 0, oz: 0, vx: 0, vy: 0, vz: 0, x: 0, y: 0, z: 0 }));
  function placeFlock(f, cx, cz) {
    for (let tries = 0; tries < 20; tries++) {
      const b = roofs[rng.int(0, roofs.length - 1)];
      const bx = (b.min[0] + b.max[0]) / 2, bz = (b.min[2] + b.max[2]) / 2;
      if (Math.hypot(bx - cx, bz - cz) > RADIUS || Math.hypot(bx - cx, bz - cz) < 60) continue;
      f.x = bx; f.z = bz; f.y = b.max[1]; f.up = false; f.t = 0; f.alive = true;
      return;
    }
    f.alive = false;
  }

  // Helicopters -----------------------------------------------------------------------------------
  const heliParts = [];
  const hb = new THREE.SphereGeometry(1.6, 10, 8); hb.scale(1, 0.85, 1.6); heliParts.push(hb);
  const tail = new THREE.BoxGeometry(0.4, 0.4, 5); tail.translate(0, 0.3, -4.6); heliParts.push(tail);
  const skid = new THREE.BoxGeometry(0.15, 0.15, 3.2); skid.translate(-0.9, -1.5, 0); heliParts.push(skid);
  const skid2 = skid.clone(); skid2.translate(1.8, 0, 0); heliParts.push(skid2);
  const heliMesh = (color) => {
    const merged = mergeSimple(heliParts);
    const m = new THREE.Mesh(merged, comicToon({ color }));
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.35), comicToon({ color: 0x222222 }));
    rotor.position.y = 1.55;
    m.add(rotor);
    m.userData.rotor = rotor;
    return m;
  };
  const helis = [
    { mesh: heliMesh(0x2a5fb0), cx: 0, cz: -200, r: 260, y: 170, w: 0.07, a: 0 },
    { mesh: heliMesh(0xf2f2f2), cx: 600, cz: 300, r: 340, y: 210, w: -0.05, a: 2 },
  ];
  for (const h of helis) group.add(h.mesh);

  // Update ----------------------------------------------------------------------------------------
  let lightT = 0;
  const avenueGreen = () => (lightT % 24) < 11; // avenues and streets take turns
  const streetGreen = () => (lightT % 24) >= 12 && (lightT % 24) < 23;
  return {
    group,
    // Seconds into the traffic cycle (halos light the matching signal lamp).
    get lightT() { return lightT; },
    // Every moving car: fn(x, z, dirX, dirZ).
    eachCar(fn) {
      for (let i = 0; i < CAR_N; i++) {
        const c = car[i];
        if (!c.alive) continue;
        const x = c.axis === 0 ? c.lane : c.pos, z = c.axis === 0 ? c.pos : c.lane;
        fn(x, z, c.axis === 0 ? 0 : c.dir, c.axis === 0 ? c.dir : 0);
      }
    },
    // hero: position and velocity, landed: a hard landing this frame (people scatter).
    update(dt, heroP, scare = null) {
      lightT += dt;
      const cx = heroP.x, cz = heroP.z;
      // People.
      for (let i = 0; i < PED_N; i++) {
        const o = ped[i];
        if (!o.alive || Math.hypot(o.x - cx, o.z - cz) > PED_R + 20) placePed(o, cx, cz, !o.alive && o.phase === 0);
        if (scare) {
          const d = Math.hypot(o.x - scare.x, o.z - scare.z);
          if (d < scare.r) { o.flee = 2.5; const k = 1 / Math.max(0.5, d); o.dx = (o.x - scare.x) * k; o.dz = (o.z - scare.z) * k; }
        }
        const sp = o.flee > 0 ? 4.2 : o.speed;
        if (o.flee > 0) { o.flee -= dt; if (o.flee <= 0) { if (Math.abs(o.dx) > Math.abs(o.dz)) { o.dx = Math.sign(o.dx); o.dz = 0; } else { o.dz = Math.sign(o.dz); o.dx = 0; } } }
        const nx = o.x + o.dx * sp * dt, nz = o.z + o.dz * sp * dt;
        if (isCity(nx, nz)) { o.x = nx; o.z = nz; } else { o.dx = -o.dx; o.dz = -o.dz; }
        o.phase += dt * sp * 4.2;
        walk.array[i * 2] = o.phase; walk.array[i * 2 + 1] = o.alive ? sp / 1.3 : 0;
        p.set(o.x, o.alive ? 0 : -50, o.z);
        q.setFromAxisAngle(up, Math.atan2(o.dx, o.dz));
        peds.setMatrixAt(i, m4.compose(p, q, s));
      }
      walk.needsUpdate = true;
      peds.instanceMatrix.needsUpdate = true;
      // Cars: follow the car ahead in the lane, stop at red lights.
      for (let i = 0; i < CAR_N; i++) {
        const c = car[i];
        const x = c.axis === 0 ? c.lane : c.pos, z = c.axis === 0 ? c.pos : c.lane;
        if (!c.alive || Math.hypot(x - cx, z - cz) > RADIUS + 30) { placeCar(c, cx, cz, !c.alive && c.speed === 0); continue; }
        let want = c.max;
        // The car ahead in this lane.
        for (let j = 0; j < CAR_N; j++) {
          if (j === i) continue;
          const o = car[j];
          if (!o.alive || o.axis !== c.axis || o.lane !== c.lane) continue;
          const gap = (o.pos - c.pos) * c.dir;
          if (gap > 0 && gap < 14) want = Math.min(want, Math.max(0, (gap - 7) * 1.2));
        }
        // The next stop line: avenues stop for the streets and the other way round.
        const every = c.axis === 0 ? g.streetEvery : g.avenueEvery, origin = c.axis === 0 ? g.minZ : g.minX;
        const cross = c.axis === 0 ? g.streetWidth / 2 + 2 : g.avenueWidth / 2 + 2;
        const k = (c.pos - origin) / every;
        const nextIx = c.dir > 0 ? Math.ceil(k) : Math.floor(k);
        const stopAt = origin + nextIx * every - c.dir * cross;
        const toStop = (stopAt - c.pos) * c.dir;
        const green = c.axis === 0 ? avenueGreen() : streetGreen();
        if (!green && toStop > 0 && toStop < 22 && !c.police) want = Math.min(want, Math.max(0, (toStop - 1) * 0.9));
        c.speed += Math.max(-9 * dt, Math.min(3.5 * dt, want - c.speed));
        c.pos += c.dir * c.speed * dt;
        const nx2 = c.axis === 0 ? c.lane : c.pos, nz2 = c.axis === 0 ? c.pos : c.lane;
        if (!isCity(nx2, nz2)) { c.alive = false; continue; }
        p.set(nx2, 0, nz2);
        q.setFromAxisAngle(up, c.axis === 0 ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2));
        cars.setMatrixAt(i, m4.compose(p, q, s));
      }
      for (let i = 0; i < CAR_N; i++) if (!car[i].alive) { p.set(0, -60, 0); cars.setMatrixAt(i, m4.compose(p, q, s)); }
      cars.instanceMatrix.needsUpdate = true;
      // Pigeons: sit and peck until the hero comes near, then burst up and away.
      for (let f = 0; f < flocks.length; f++) {
        const fl = flocks[f];
        if (!fl.alive || Math.hypot(fl.x - cx, fl.z - cz) > RADIUS + 40 || (fl.up && fl.t > 6)) {
          placeFlock(fl, cx, cz);
          for (let k = 0; k < 10; k++) { const bd = bird[f * 10 + k]; bd.ox = rng.range(-5, 5); bd.oz = rng.range(-5, 5); bd.x = fl.x + bd.ox; bd.y = fl.y + 0.12; bd.z = fl.z + bd.oz; bd.vx = bd.vy = bd.vz = 0; }
        }
        if (!fl.up && Math.hypot(fl.x - cx, fl.z - cz) < 14 && Math.abs(fl.y - heroP.y) < 10) {
          fl.up = true; fl.t = 0;
          for (let k = 0; k < 10; k++) { const bd = bird[f * 10 + k]; const a = rng.range(0, 6.28); bd.vx = Math.cos(a) * rng.range(4, 8); bd.vz = Math.sin(a) * rng.range(4, 8); bd.vy = rng.range(4, 7); }
        }
        if (fl.up) fl.t += dt;
        for (let k = 0; k < 10; k++) {
          const i = f * 10 + k, bd = bird[i];
          if (fl.up) { bd.x += bd.vx * dt; bd.y += bd.vy * dt; bd.z += bd.vz * dt; bd.vy = Math.max(1.5, bd.vy - 2 * dt); flap.array[i] += dt * 28; }
          else flap.array[i] = Math.sin(lightT * 3 + i) > 0.97 ? 1.2 : 0;
          p.set(bd.x, fl.alive ? bd.y : -60, bd.z);
          q.setFromAxisAngle(up, fl.up ? Math.atan2(bd.vx, bd.vz) : i);
          birds.setMatrixAt(i, m4.compose(p, q, s));
        }
      }
      flap.needsUpdate = true;
      birds.instanceMatrix.needsUpdate = true;
      // Helicopters: slow circles over the city, nose into the turn.
      for (const h of helis) {
        h.a += h.w * dt;
        h.mesh.position.set(h.cx + Math.cos(h.a) * h.r, h.y + Math.sin(h.a * 3) * 6, h.cz + Math.sin(h.a) * h.r);
        h.mesh.rotation.set(0, -h.a + (h.w > 0 ? 0 : Math.PI), h.w > 0 ? -0.12 : 0.12);
        h.mesh.userData.rotor.rotation.y += dt * 30;
      }
    },
  };
}

function mergeSimple(list) {
  const pos = [], nrm = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    pos.push(...ng.attributes.position.array);
    nrm.push(...ng.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}

// The same car as the parked ones (body tinted per instance, the shape from carShape.js).
function carGeometry() {
  const parts = [];
  const add = (g, col) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    const c = new THREE.Color(col), n = ng.attributes.position.count, cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
    ng.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    parts.push(ng);
  };
  for (const [g, col] of carParts()) add(g, col);
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) {
    const arr = new Float32Array(parts.reduce((s, p) => s + p.attributes[k].array.length, 0));
    let o = 0;
    for (const p of parts) { arr.set(p.attributes[k].array, o); o += p.attributes[k].array.length; }
    out.setAttribute(k, new THREE.Float32BufferAttribute(arr, 3));
  }
  return out;
}
