import { G, tune } from '../physics/constants.js';
import { createBody, applyDv, placeBody } from '../physics/ledger.js';
import { applyGravity, applyDrag, applyBodyLift, applyGlide, dragK } from '../physics/aero.js';
import { createRope } from '../physics/rope.js';
import { findAnchor, findZipPoint } from '../physics/anchors.js';

// The hero's movement, free of Three.js. One call to step() is one fixed physics step. States:
//   ground  running, parkour (swing held), jumping, point launch after a zip
//   air     falling; body-lift steering; swing shoots a web, a new jump press opens web wings
//   swing   hanging on a web: reel (hold jump), release flick (tap jump near the release)
//   zip     winching to a point; arrival perches on a roof or sticks to a wall
//   wall    stuck to a facade: crawl, wall run (hold swing), jump off, vault over the top
//   glide   web wings
// Every velocity change goes through the ledger (gravity, drag, lift, rope, surface).

export const HALF_SEG = 0.5;
const SUBMOVE = 0.3;
// Coyote time: a jump is still allowed for 60 ms after the feet leave an edge. The one accepted
// bend of the push rule (the foot was on the edge a step or two ago); push() allows it.
const COYOTE = 0.06;
const WALL_LOST = 0.05;
// Hands can grab an edge this far away (a vault over a roof edge pushes off that edge).
const REACH = 1.6;
// A surface push needs a contact this recent (one or two physics steps of slack, plus coyote time).
const CONTACT_FRESH = 0.07;
const ZIP_TIMEOUT = 3;
const WEB_RETRY = 0.12;
const AUTO_SHOOT_AIR = 0.12;
const WALL_ACCEL = 30;
const RUN_UP_ACCEL = 60;
const ADHESION = 0.5;

export function emptyIntent() {
  return {
    moveX: 0, moveZ: 0,
    camFwd: { x: 0, y: 0, z: 1 }, camPos: { x: 0, y: 0, z: 0 },
    swing: false, swingPressed: false, swingReleased: false,
    jump: false, jumpPressed: false, jumpReleased: false,
    zipPressed: false, dive: false,
  };
}

export function createHero(world, { gravity = 'comic', assist = 'normal' } = {}) {
  const body = createBody({ mass: tune.mass });
  const rope = createRope();
  const touch = { ground: false, wall: false, ceiling: false, nx: 0, nz: 0, box: null, groundBox: null, impact: 0 };
  const c = {};

  const hero = {
    body, rope, touch,
    state: 'air',
    gravity, assist,
    time: 0,
    airTime: 0,
    ungrounded: 0,
    wallLost: 0,
    wall: { nx: 0, nz: 0, box: null },
    facing: { x: 0, z: 1 },
    pendingWeb: null,
    webRetry: 0,
    shootNow: false,
    lastJumpPress: -10,
    flick: 0,
    zip: null,
    zipTime: 0,
    launchUntil: -1,
    diving: false,
    landing: null,
    contactAge: 0,
    lastNoAnchor: -10,
    // Tests turn this on: a surface push with nothing to push against throws.
    strict: false,
    events: [],

    place(x, y, z, vx = 0, vy = 0, vz = 0, state = 'air') {
      placeBody(body, x, y, z, vx, vy, vz);
      rope.release();
      this.pendingWeb = null; this.zip = null; this.flick = 0;
      this.state = state;
      this.airTime = 0; this.ungrounded = 0; this.wallLost = 0;
      this.launchUntil = -1; this.webRetry = 0; this.lastJumpPress = -10; this.shootNow = false;
      this.contactAge = state === 'ground' || state === 'wall' ? 0 : 1;
    },

    step(intent, dt) {
      this.time += dt;
      if (intent.jumpPressed) this.lastJumpPress = this.time;
      this.diving = false;
      switch (this.state) {
        case 'ground': groundStep(intent, dt); break;
        case 'air': airStep(intent, dt); break;
        case 'swing': swingStep(intent, dt); break;
        case 'zip': zipStep(intent, dt); break;
        case 'wall': wallStep(intent, dt); break;
        case 'glide': glideStep(intent, dt); break;
      }
      capSpeed();
      updateFacing(intent);
    },

    get speed() { return Math.hypot(body.v.x, body.v.y, body.v.z); },
  };

  const g = () => G[hero.gravity] ?? G.comic;
  const emit = (type, data = {}) => hero.events.push({ type, ...data });

  function move(dt) {
    touch.ground = false; touch.wall = false; touch.ceiling = false; touch.impact = 0; touch.box = null; touch.groundBox = null;
    const v = body.v;
    const dist = Math.hypot(v.x, v.y, v.z) * dt;
    const parts = Math.max(1, Math.ceil(dist / SUBMOVE));
    for (let k = 0; k < parts; k++) {
      body.p.x += (v.x * dt) / parts; body.p.y += (v.y * dt) / parts; body.p.z += (v.z * dt) / parts;
      world.resolveCapsule(body, tune.radius, HALF_SEG, c);
      if (c.ground) { touch.ground = true; touch.groundBox = c.groundBox; }
      if (c.wall) { touch.wall = true; touch.nx = c.nx; touch.nz = c.nz; touch.box = c.box; }
      if (c.ceiling) touch.ceiling = true;
      touch.impact = Math.max(touch.impact, c.impact);
    }
    hero.contactAge = touch.ground || touch.wall ? 0 : hero.contactAge + dt;
  }

  // Every push the hero makes goes through here: legs, hands and adhesion need something to push
  // on. `reach` is true when an edge within arm's reach is the thing being pushed on.
  function push(dx, dy, dz, why, reach = false) {
    if (hero.strict && !reach && hero.contactAge > CONTACT_FRESH) throw new Error(`surface push with nothing to push on: ${why}`);
    applyDv(body, 'surface', dx, dy, dz);
  }

  function moveOnRope(dt) {
    rope.preStep(body, dt);
    move(dt);
    rope.postStep(body, world);
    // The line's clamp can pull the body into a surface: settle it and keep what it touched.
    world.resolveCapsule(body, tune.radius, HALF_SEG, c);
    if (c.ground) { touch.ground = true; touch.groundBox = c.groundBox; hero.contactAge = 0; }
    if (c.wall) { touch.wall = true; touch.nx = c.nx; touch.nz = c.nz; touch.box = c.box; hero.contactAge = 0; }
  }

  function airForces(intent, dt, liftScale = 1) {
    applyGravity(body, g(), dt);
    hero.diving = intent.dive && hero.state === 'air';
    applyDrag(body, dragK(g(), hero.diving ? tune.diveTerminal : tune.terminal), dt);
    const m = Math.hypot(intent.moveX, intent.moveZ);
    if (m > 0.05) applyBodyLift(body, intent.moveX / m, intent.moveZ / m, m * liftScale, dt);
  }

  function wantedHeading(intent) {
    const m = Math.hypot(intent.moveX, intent.moveZ);
    if (m > 0.2) return { x: intent.moveX / m, z: intent.moveZ / m };
    const f = intent.camFwd, fl = Math.hypot(f.x, f.z);
    if (fl > 1e-3) return { x: f.x / fl, z: f.z / fl };
    return { x: hero.facing.x, z: hero.facing.z };
  }

  function shootWeb(intent) {
    const h = wantedHeading(intent);
    const a = findAnchor(world, body, { dirX: h.x, dirZ: h.z, assist: hero.assist, g: g() });
    if (!a) {
      hero.webRetry = WEB_RETRY;
      // Holding swing with nothing to web retries every 0.12 s; tell the player twice a second.
      if (hero.time - hero.lastNoAnchor > 0.6) { hero.lastNoAnchor = hero.time; emit('noAnchor'); }
      return false;
    }
    hero.pendingWeb = { anchor: a, t: tune.webTravel };
    emit('thwip', { x: a.x, y: a.y, z: a.z });
    return true;
  }

  function land() {
    const hard = touch.impact > tune.hardLanding;
    if (rope.active) { rope.release(); emit('release'); }
    hero.pendingWeb = null; hero.zip = null; hero.flick = 0;
    hero.state = 'ground';
    hero.ungrounded = 0;
    emit('land', { hard, impact: touch.impact });
  }

  function enterWall(n) {
    const h = Math.hypot(n.nx, n.nz);
    if (h < 0.5) return false; // not a wall (a ceiling or a floor): stay as we are
    if (rope.active) { rope.release(); emit('release'); }
    hero.pendingWeb = null; hero.zip = null; hero.flick = 0;
    hero.state = 'wall';
    hero.wall.nx = n.nx / h; hero.wall.nz = n.nz / h; hero.wall.box = n.box;
    hero.wallLost = 0;
    emit('wallStick');
    return true;
  }

  function tryZip(intent) {
    const cam = { x: intent.camPos.x, y: intent.camPos.y, z: intent.camPos.z, fx: intent.camFwd.x, fy: intent.camFwd.y, fz: intent.camFwd.z };
    const hit = findZipPoint(world, body, cam);
    if (!hit) { emit('noAnchor'); return false; }
    // The winch reels right up to the surface: the zip ends when the hero touches it.
    rope.attach(hit, body, 0.3);
    hero.zip = { top: hit.ny > 0.5, box: hit.box };
    hero.zipTime = 0;
    hero.pendingWeb = null;
    hero.state = 'zip';
    emit('zip', { x: hit.x, y: hit.y, z: hit.z });
    return true;
  }

  // Point launch: right after a zip lands, the legs push off the perch along the camera, tilted
  // up 25 degrees.
  function pointLaunch(intent) {
    const f = intent.camFwd, fl = Math.hypot(f.x, f.z) || 1;
    const cs = Math.cos(25 * Math.PI / 180), sn = Math.sin(25 * Math.PI / 180);
    const s = tune.launchSpeed;
    push((f.x / fl) * cs * s, sn * s - Math.min(0, body.v.y), (f.z / fl) * cs * s, 'point launch');
    hero.launchUntil = -1;
    emit('launch');
  }

  // Ground ---------------------------------------------------------------------------------
  function groundStep(intent, dt) {
    applyGravity(body, g(), dt);
    const v = body.v;
    const m = Math.min(1, Math.hypot(intent.moveX, intent.moveZ));
    const target = (intent.swing ? tune.parkourSpeed : tune.runSpeed) * m;
    const tx = m > 0.01 ? (intent.moveX / Math.hypot(intent.moveX, intent.moveZ)) * target : 0;
    const tz = m > 0.01 ? (intent.moveZ / Math.hypot(intent.moveX, intent.moveZ)) * target : 0;
    const sh = Math.hypot(v.x, v.z);
    // Faster than running (a landing at speed): roll it off gently instead of stopping dead.
    const accel = sh > target + 0.5 ? tune.rollDecel : tune.groundAccel;
    let dx = tx - v.x, dz = tz - v.z;
    const dl = Math.hypot(dx, dz), lim = accel * dt;
    if (dl > lim) { dx *= lim / dl; dz *= lim / dl; }
    push(dx, 0, dz, 'run');

    if (intent.jumpPressed) {
      if (hero.time <= hero.launchUntil) pointLaunch(intent);
      else {
        push(0, tune.jumpSpeed - Math.max(0, v.y), 0, 'jump');
        emit('jump');
      }
      hero.state = 'air';
      hero.airTime = 0;
      move(dt);
      return;
    }
    if (intent.zipPressed && tryZip(intent)) { move(dt); return; }
    move(dt);
    if (touch.wall && intent.swing && m > 0.3) {
      // Parkour into a wall: run up it.
      const into = intent.moveX * -touch.nx + intent.moveZ * -touch.nz;
      if (into > 0.3) { enterWall(touch); return; }
    }
    if (!touch.ground) {
      hero.ungrounded += dt;
      if (hero.ungrounded > COYOTE) { hero.state = 'air'; hero.airTime = 0; }
    } else hero.ungrounded = 0;
  }

  // Air ------------------------------------------------------------------------------------
  function airStep(intent, dt) {
    hero.airTime += dt;
    hero.webRetry -= dt;
    airForces(intent, dt);
    if (intent.zipPressed && tryZip(intent)) { move(dt); return; }
    const wantShot = intent.swingPressed || hero.shootNow || (intent.swing && hero.airTime > AUTO_SHOOT_AIR && body.v.y < 2);
    if (wantShot && !hero.pendingWeb && hero.webRetry <= 0) shootWeb(intent);
    hero.shootNow = false;
    if (hero.pendingWeb) {
      hero.pendingWeb.t -= dt;
      if (!intent.swing) hero.pendingWeb = null;
      else if (hero.pendingWeb.t <= 0) {
        rope.attach(hero.pendingWeb.anchor, body);
        hero.pendingWeb = null;
        hero.state = 'swing';
        hero.flick = 0;
        emit('attach');
        moveOnRope(dt);
        afterRopeContacts();
        return;
      }
    }
    if (intent.jumpPressed && hero.airTime > 0.1 && !hero.pendingWeb) {
      hero.state = 'glide';
      emit('wings');
    }
    move(dt);
    if (touch.ground && body.v.y <= 0.01) land();
    else if (touch.wall) enterWall(touch);
  }

  // Swing ----------------------------------------------------------------------------------
  function swingStep(intent, dt) {
    hero.airTime += dt;
    airForces(intent, dt, 0.6);
    if (hero.flick > 0) {
      rope.setReel(tune.flickSpeed, tune.flickTension);
      hero.flick -= dt;
      if (hero.flick <= 0) { releaseRope(); move(dt); airContacts(); return; }
    } else {
      rope.setReel(intent.jump ? tune.winchSpeed : 0, tune.winchTension);
      if (!intent.swing) {
        if (hero.time - hero.lastJumpPress <= tune.flickWindow) {
          hero.flick = tune.flickTime;
          emit('flick');
        } else { releaseRope(); move(dt); airContacts(); return; }
      }
    }
    moveOnRope(dt);
    afterRopeContacts();
  }

  function releaseRope() {
    rope.release();
    hero.flick = 0;
    hero.state = 'air';
    hero.airTime = 0.2;
    emit('release');
  }

  function afterRopeContacts() {
    if (touch.ground && body.v.y <= 0.5) land();
    else if (touch.wall) {
      // Swung into a facade: let go and stick to it, like landing a hand on a wall.
      enterWall(touch);
    }
  }

  function airContacts() {
    if (touch.ground && body.v.y <= 0.01) land();
    else if (touch.wall) enterWall(touch);
  }

  // Zip ------------------------------------------------------------------------------------
  // The winch reels the hero in until he touches the surface; collision ends the zip.
  function zipStep(intent, dt) {
    hero.zipTime += dt;
    applyGravity(body, g(), dt);
    applyDrag(body, dragK(g(), tune.terminal), dt);
    rope.setReel(tune.zipSpeed, tune.zipTension);
    moveOnRope(dt);
    const p = body.p, v = body.v;
    const w = rope.pivot;
    if (rope.pivots.length > 1 && w.roof && Math.hypot(p.x - w.x, p.y - w.y, p.z - w.z) <= REACH) {
      // Reeled up to the roof edge the line bends over: hands on the edge, climb over toward the
      // anchor.
      const a = rope.pivots[0];
      const ix = a.x - w.x, iz = a.z - w.z, il = Math.hypot(ix, iz) || 1;
      rope.release();
      push((ix / il) * 3 - v.x, 6.5 - v.y, (iz / il) * 3 - v.z, 'zip vault', true);
      hero.state = 'air'; hero.airTime = 0.2;
      hero.zip = null;
      hero.launchUntil = hero.time + tune.launchWindow + 0.4;
      emit('vault');
      return;
    }
    if (touch.ground) {
      // Perch: hands and feet grab the roof and take the momentum.
      push(-v.x, 0, -v.z, 'perch');
      emit('perch');
      land();
      hero.launchUntil = hero.time + tune.launchWindow;
      return;
    }
    if (touch.wall && enterWall(touch)) { hero.launchUntil = hero.time + tune.launchWindow; return; }
    if (hero.zipTime > ZIP_TIMEOUT) { hero.zip = null; releaseRope(); }
  }

  // Wall -----------------------------------------------------------------------------------
  function wallStep(intent, dt) {
    applyGravity(body, g(), dt);
    const v = body.v;
    const nx = hero.wall.nx, nz = hero.wall.nz;
    if (intent.jumpPressed) {
      if (hero.time <= hero.launchUntil) pointLaunch(intent);
      else {
        // Push off: out from the wall and up, plus a little along the camera's sideways aim.
        const f = intent.camFwd;
        const side = f.x * -nz + f.z * nx;
        const out = tune.wallJumpOut;
        push(nx * out - nz * side * 4, tune.wallJumpUp - Math.min(0, v.y), nz * out + nx * side * 4, 'wall jump');
        emit('wallJump');
      }
      hero.state = 'air'; hero.airTime = 0.1;
      move(dt);
      return;
    }
    if (intent.zipPressed && tryZip(intent)) { move(dt); return; }

    // Desired velocity on the wall, reached with limited accelerations (all surface pushes).
    const vn = v.x * nx + v.z * nz;
    const thx = v.x - vn * nx, thz = v.z - vn * nz; // along the wall, horizontal
    const mx = intent.moveX, mz = intent.moveZ;
    const into = -(mx * nx + mz * nz);
    const lx = mx + into * nx, lz = mz + into * nz; // lateral input along the wall
    let wantHx, wantHz, wantY, accH, accY;
    const lat = Math.hypot(lx, lz);
    if (lat > 0.05) { wantHx = lx * tune.wallCrawlSpeed; wantHz = lz * tune.wallCrawlSpeed; accH = WALL_ACCEL; }
    else { wantHx = 0; wantHz = 0; accH = tune.wallFriction; }
    if (runningUp(intent)) { wantY = tune.wallRunSpeed; accY = RUN_UP_ACCEL; }
    else if (Math.abs(into) > 0.05) { wantY = into * tune.wallCrawlSpeed; accY = WALL_ACCEL; }
    else { wantY = 0; accY = tune.wallFriction + g(); }
    let dhx = wantHx - thx, dhz = wantHz - thz;
    const dhl = Math.hypot(dhx, dhz), lh = accH * dt;
    if (dhl > lh) { dhx *= lh / dhl; dhz *= lh / dhl; }
    let dy = wantY - v.y;
    const ly = accY * dt;
    if (Math.abs(dy) > ly) dy = Math.sign(dy) * ly;
    // Adhesion: keep a slight press into the wall so the contact holds.
    const dn = -ADHESION - vn;
    push(dhx + dn * nx, dy, dhz + dn * nz, 'wall');
    move(dt);
    if (touch.wall) {
      hero.wallLost = 0;
      hero.wall.nx = touch.nx; hero.wall.nz = touch.nz; hero.wall.box = touch.box;
    } else {
      hero.wallLost += dt;
      if (hero.wallLost > WALL_LOST) {
        const box = hero.wall.box;
        const p = body.p;
        if (v.y > 1 && box && p.y + 1.5 >= box.maxY && p.y - 0.9 <= box.maxY + 0.5) {
          // Ran up past the roof edge with the hands still on it: vault onto the roof.
          push(-nx * 4, 5, -nz * 4, 'wall vault', true);
          emit('vault');
        }
        hero.state = 'air'; hero.airTime = 0.2;
        return;
      }
    }
    if (touch.ground && v.y <= 0.01 && !runningUp(intent)) land();
  }

  function runningUp(intent) { return intent.swing; }

  // Glide ----------------------------------------------------------------------------------
  function glideStep(intent, dt) {
    hero.airTime += dt;
    applyGravity(body, g(), dt);
    const v = body.v;
    const sh = Math.hypot(v.x, v.z) || 1;
    const hx = v.x / sh, hz = v.z / sh;
    const fwd = intent.moveX * hx + intent.moveZ * hz;
    const right = intent.moveX * -hz + intent.moveZ * hx;
    applyGlide(body, -fwd * 0.8, right, dt);
    if (!intent.jump) { hero.state = 'air'; emit('wingsOff'); }
    else if (intent.swingPressed) { hero.state = 'air'; hero.shootNow = true; }
    else if (intent.zipPressed && tryZip(intent)) { move(dt); return; }
    move(dt);
    if (touch.ground && v.y <= 0.01) land();
    else if (touch.wall) enterWall(touch);
  }

  function capSpeed() {
    const v = body.v;
    const s = Math.hypot(v.x, v.y, v.z);
    if (s > tune.maxSpeed) {
      const k = tune.maxSpeed / s - 1;
      applyDv(body, 'drag', v.x * k, v.y * k, v.z * k);
    }
  }

  function updateFacing(intent) {
    if (hero.state === 'wall') { hero.facing.x = -hero.wall.nx; hero.facing.z = -hero.wall.nz; return; }
    const v = body.v, sh = Math.hypot(v.x, v.z);
    if (sh > 0.6) { hero.facing.x = v.x / sh; hero.facing.z = v.z / sh; return; }
    const m = Math.hypot(intent.moveX, intent.moveZ);
    if (m > 0.2) { hero.facing.x = intent.moveX / m; hero.facing.z = intent.moveZ / m; }
  }

  return hero;
}
