import { G, tune } from '../physics/constants.js';
import { createBody, applyDv, placeBody } from '../physics/ledger.js';
import { applyGravity, applyDrag, applyGlide, dragK } from '../physics/aero.js';
import { createRope } from '../physics/rope.js';
import { createSwing, releaseBoost, swingJump, airControl } from '../physics/swing.js';
import { findAimPoint, findZipPoint } from '../physics/anchors.js';

// The hero's movement, free of Three.js. One call to step() is one fixed physics step. States:
//   ground  running, parkour (swing held), jumping, point launch after a zip
//   air     falling, with air control; a swing press shoots a web where the crosshair points
//           (a miss is a miss), a new jump press opens web wings
//   swing   a real pendulum about the aimed point (physics/swing.js): hold to hang on, let go to
//           fly (perfect release on the rise), jump for a swing-jump
//   zip     winching to a point on the real rope; arrival perches on a roof or sticks to a wall
//   wall    on a facade: momentum from a swing carries into a wall run; crawl, run up (hold
//           swing), jump off, vault over the top
//   glide   web wings
// Every velocity change goes through the ledger (gravity, drag, lift, rope, surface, assist).

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
const WALL_ACCEL = 30;
const RUN_UP_ACCEL = 60;
const ADHESION = 0.5;
// Landing this close to a roof edge opens a point launch (m).
const EDGE_LAUNCH = 1.8;
// A ledge within this far above the body centre (m) is grabbed and mantled, not stuck to.
const MANTLE_UP = 2.4, MANTLE_DOWN = 0.4;
// Swinging round a building corner: an extra push along the way, at most this (m/s), at most this
// often (s).
const CORNER_BOOST = 4, CORNER_GAP = 0.6;

export function emptyIntent() {
  return {
    moveX: 0, moveZ: 0,
    camFwd: { x: 0, y: 0, z: 1 }, camPos: { x: 0, y: 0, z: 0 },
    swing: false, swingPressed: false, swingReleased: false,
    jump: false, jumpPressed: false, jumpReleased: false,
    zipPressed: false, dive: false,
    hangPressed: false, climb: 0,
  };
}

export function createHero(world, { gravity = 'comic', assist = 'normal' } = {}) {
  const body = createBody({ mass: tune.mass });
  const rope = createRope();
  const swing = createSwing();
  const touch = { ground: false, wall: false, ceiling: false, nx: 0, nz: 0, box: null, groundBox: null, impact: 0 };
  const c = {};

  const hero = {
    body, rope, swing, touch,
    state: 'air',
    gravity, assist,
    time: 0,
    airTime: 0,
    ungrounded: 0,
    wallLost: 0,
    wall: { nx: 0, nz: 0, box: null },
    facing: { x: 0, z: 1 },
    pendingWeb: null,
    shootNow: false,
    lastJumpPress: -10,
    zip: null,
    zipTime: 0,
    launchUntil: -1,
    diving: false,
    landing: null,
    contactAge: 0,
    wallMomentum: false,
    hangInverted: false,
    hangStill: 0,
    lastCorner: -10,
    mantleUntil: -1,
    mantleIn: { x: 0, z: 0, s: 0 },
    // Tests turn this on: a surface push with nothing to push against throws.
    strict: false,
    events: [],

    place(x, y, z, vx = 0, vy = 0, vz = 0, state = 'air') {
      placeBody(body, x, y, z, vx, vy, vz);
      rope.release();
      swing.release();
      this.wallMomentum = false; this.hangInverted = false; this.hangStill = 0;
      this.pendingWeb = null; this.zip = null;
      this.state = state;
      this.airTime = 0; this.ungrounded = 0; this.wallLost = 0;
      this.launchUntil = -1; this.lastJumpPress = -10; this.shootNow = false; this.mantleUntil = -1;
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
        case 'hang': hangStep(intent, dt); break;
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

  function airForces(intent, dt, control = 1) {
    applyGravity(body, g(), dt);
    hero.diving = intent.dive && hero.state === 'air';
    applyDrag(body, dragK(g(), hero.diving ? tune.diveTerminal : tune.terminal), dt);
    const m = Math.hypot(intent.moveX, intent.moveZ);
    if (m > 0.05) airControl(body, intent.moveX, intent.moveZ, m * control, dt);
  }

  function wantedHeading(intent) {
    const m = Math.hypot(intent.moveX, intent.moveZ);
    if (m > 0.2) return { x: intent.moveX / m, z: intent.moveZ / m };
    const f = intent.camFwd, fl = Math.hypot(f.x, f.z);
    if (fl > 1e-3) return { x: f.x / fl, z: f.z / fl };
    return { x: hero.facing.x, z: hero.facing.z };
  }

  // Fires a web where the crosshair points. Returns false on a miss.
  // quiet: a miss says nothing (on the ground the same button is a parkour run).
  function shootWeb(intent, hang = false, quiet = false) {
    const cam = { x: intent.camPos.x, y: intent.camPos.y, z: intent.camPos.z, fx: intent.camFwd.x, fy: intent.camFwd.y, fz: intent.camFwd.z };
    const hit = findAimPoint(world, body, cam);
    if (!hit) { if (!quiet) emit('miss'); return false; }
    const t = tune.webTravel + hit.dist / tune.webSpeed;
    hero.pendingWeb = { anchor: hit, t, travel: t, hang };
    emit('thwip', { x: hit.x, y: hit.y, z: hit.z });
    return true;
  }

  function land() {
    const hard = touch.impact > tune.hardLanding;
    if (rope.active) { rope.release(); emit('release'); }
    if (swing.active) { swing.release(); emit('release'); }
    hero.wallMomentum = false;
    hero.pendingWeb = null; hero.zip = null;
    hero.state = 'ground';
    hero.ungrounded = 0;
    // On a roof, near its edge: a jump in the next moment is a point launch off the ledge.
    const gb = touch.groundBox, p = body.p;
    if (gb && gb.maxY > 2) {
      const edge = Math.min(p.x - gb.minX, gb.maxX - p.x, p.z - gb.minZ, gb.maxZ - p.z);
      if (edge < EDGE_LAUNCH) hero.launchUntil = hero.time + tune.launchWindow;
    }
    emit('land', { hard, impact: touch.impact });
  }

  // Up against a wall whose roof edge is within reach: hands on the edge, up and over, keeping most
  // of the speed along the wall. Returns true when it mantled.
  function tryMantle() {
    // Already going over: the hands slide up the face, nothing to stick to, and keep pulling in
    // toward the roof (the face stops the body until it clears the edge).
    if (hero.time < hero.mantleUntil) {
      const m = hero.mantleIn, v = body.v;
      const cur = v.x * m.x + v.z * m.z;
      if (cur < m.s) push((m.s - cur) * m.x, 0, (m.s - cur) * m.z, 'mantle: hands pull over', true);
      return true;
    }
    const box = touch.box;
    if (!box || box.maxY < 2) return false;
    const p = body.p, v = body.v;
    const up = box.maxY - p.y;
    if (up > MANTLE_UP || up < -MANTLE_DOWN || v.y < -14) return false;
    const h = Math.hypot(touch.nx, touch.nz);
    if (h < 0.5) return false;
    const nx = touch.nx / h, nz = touch.nz / h;
    if (rope.active) rope.release();
    if (swing.active) swing.release();
    hero.pendingWeb = null; hero.zip = null; hero.wallMomentum = false;
    const vn = v.x * nx + v.z * nz;
    const tx = (v.x - vn * nx) * 0.7, tz = (v.z - vn * nz) * 0.7;
    const vy = Math.sqrt(2 * g() * Math.max(0.4, up + 0.8));
    const inward = Math.max(4, Math.min(9, Math.abs(vn) * 0.6));
    push(tx - nx * inward - v.x, vy - v.y, tz - nz * inward - v.z, 'mantle over the edge', true);
    hero.state = 'air'; hero.airTime = 0.2;
    hero.launchUntil = hero.time + tune.launchWindow + 0.5;
    hero.mantleUntil = hero.time + 0.45;
    hero.mantleIn.x = -nx; hero.mantleIn.z = -nz; hero.mantleIn.s = inward;
    emit('mantle');
    return true;
  }

  function enterWall(n) {
    const h = Math.hypot(n.nx, n.nz);
    if (h < 0.5) return false; // not a wall (a ceiling or a floor): stay as we are
    if (rope.active) { rope.release(); emit('release'); }
    if (swing.active) { swing.release(); emit('release'); }
    hero.wallMomentum = false;
    hero.pendingWeb = null; hero.zip = null;
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
    if ((intent.swingPressed && shootWeb(intent, false, true)) || (intent.hangPressed && shootWeb(intent, true))) {
      // From the ground: jump and let the web catch.
      push(0, tune.jumpSpeed - Math.max(0, v.y), 0, 'jump');
      hero.state = 'air'; hero.airTime = 0;
      move(dt);
      return;
    }
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
    airForces(intent, dt);
    if (intent.zipPressed && tryZip(intent)) { move(dt); return; }
    // A fresh press re-aims, even with a web still in flight; a held button never refires.
    if (intent.swingPressed) { hero.pendingWeb = null; shootWeb(intent); }
    else if (intent.hangPressed) { hero.pendingWeb = null; shootWeb(intent, true); }
    else if (hero.shootNow && !hero.pendingWeb) shootWeb(intent);
    hero.shootNow = false;
    if (hero.pendingWeb) {
      hero.pendingWeb.t -= dt;
      // A swing web needs the button held; a hang web does not.
      if (!intent.swing && !hero.pendingWeb.hang) hero.pendingWeb = null;
      else if (hero.pendingWeb.t <= 0) {
        const a = hero.pendingWeb.anchor, hang = hero.pendingWeb.hang;
        swing.attach(a, body);
        hero.pendingWeb = null;
        hero.state = hang ? 'hang' : 'swing';
        if (hang) startHang();
        emit('attach', { x: a.x, y: a.y, z: a.z, nx: a.nx, ny: a.ny, nz: a.nz });
        const before = hero.speed;
        move(dt);
        swingContacts(before);
        return;
      }
    }
    if (intent.jumpPressed && hero.airTime > 0.1 && !hero.pendingWeb) {
      hero.state = 'glide';
      emit('wings');
    }
    const before = hero.speed;
    move(dt);
    if (touch.ground && body.v.y <= 0.01) land();
    else if (touch.wall && !tryMantle()) wallWithMomentum(before);
  }

  // Swing ----------------------------------------------------------------------------------
  function swingStep(intent, dt) {
    hero.airTime += dt;
    airForces(intent, dt, 0.5);
    const p = body.p, v = body.v;
    swing.preStep(body, dt, world.groundHeight(p.x, p.y - 0.9, p.z));
    const before = hero.speed;
    move(dt);
    const wraps = swing.rope.pivots.length;
    swing.postStep(body, world);
    // The line caught a building corner: whip round it, a push along the way.
    if (swing.rope.pivots.length > wraps && !swing.rope.pivot.roof && hero.time - hero.lastCorner > CORNER_GAP) {
      const sh = Math.hypot(v.x, v.z);
      if (sh > 8) {
        const boost = Math.min(CORNER_BOOST, Math.max(0, tune.cruiseSpeed + 6 - sh));
        if (boost > 0) applyDv(body, 'assist', (v.x / sh) * boost, 0, (v.z / sh) * boost);
        hero.lastCorner = hero.time;
        emit('corner', { boost });
      }
    }
    if (swingContacts(before)) return;
    if (intent.hangPressed) { hero.state = 'hang'; startHang(); return; }
    if (intent.jumpPressed) {
      // Swing-jump: off the line with a push forward and up.
      swing.release();
      swingJump(body);
      toAir();
      emit('swingJump');
      return;
    }
    if (!intent.swing) {
      // Let go: a boost on the rise, a bigger one inside the sweet window.
      const ang = swing.angle(p, v);
      const perfect = ang >= tune.perfectMin && ang <= tune.perfectMax && v.y > 0;
      swing.release();
      if (ang > 0 && v.y > 0) releaseBoost(body, perfect);
      toAir();
      emit(perfect ? 'perfect' : 'release');
      return;
    }
    // A new press while swinging re-aims: let go of this web and fire the next.
    if (intent.swingPressed) { swing.release(); toAir(); hero.shootNow = true; }
  }

  // Hang -------------------------------------------------------------------------------------
  // Hanging on the line, no button held. Climb up and slide down it, rappel with dive, sway with
  // the stick, jump off, or let go with the hang key. A body hanging still settles under the
  // anchor and, after a moment, flips upside down. Climbing to the top of a line that comes over a
  // roof edge (or is stuck just under one) pulls the hero up onto the roof.
  function startHang() {
    hero.hangStill = 0; hero.hangInverted = false;
    emit('hang');
  }

  function hangStep(intent, dt) {
    hero.airTime += dt;
    applyGravity(body, g(), dt);
    applyDrag(body, dragK(g(), tune.terminal), dt);
    const v = body.v, p = body.p;
    const rope = swing.rope;
    const P = rope.pivot;
    const rx = p.x - P.x, ry = p.y - P.y, rz = p.z - P.z, d = Math.hypot(rx, ry, rz) || 1;
    const ux = rx / d, uy = ry / d, uz = rz / d;
    const vr = v.x * ux + v.y * uy + v.z * uz;
    // Settle: the sway (motion across the line) dies away, the body held still on it.
    const k = Math.min(1, tune.hangDamp * dt);
    applyDv(body, 'assist', -(v.x - vr * ux) * k, -(v.y - vr * uy) * k, -(v.z - vr * uz) * k);
    // Sway from the stick.
    const m = Math.hypot(intent.moveX, intent.moveZ);
    if (m > 0.05) applyDv(body, 'assist', (intent.moveX / Math.max(1, m)) * tune.hangSway * dt, 0, (intent.moveZ / Math.max(1, m)) * tune.hangSway * dt);
    // Along the line.
    const climb = intent.climb ?? 0;
    const rate = intent.dive ? tune.rappelSpeed : climb > 0.2 ? -tune.hangClimb * climb : climb < -0.2 ? tune.hangSlide * -climb : 0;
    const floor = world.groundHeight(p.x, p.y - 0.9, p.z);
    const maxL = Math.min(tune.webMax, P.y - floor - 0.9);
    if (rate > 0) {
      // Paying out: the line follows the body down at up to the slide speed, and the hands let it
      // run (a quick push down the line toward that speed).
      if (vr < rate) { const a = Math.min(rate - vr, 80 * dt); applyDv(body, 'assist', ux * a, uy * a, uz * a); }
      rope.length = Math.min(maxL, d + rate * dt);
    } else rope.length = Math.min(maxL, Math.max(tune.hangTop, rope.length + rate * dt));
    // Upside down when still; upright to move along the line.
    if (Math.abs(rate) > 0 || m > 0.05) { hero.hangStill = 0; hero.hangInverted = false; }
    else if (hero.speed < 3) { hero.hangStill += dt; if (hero.hangStill > tune.hangInvertAfter) hero.hangInverted = true; }

    rope.preStep(body, dt);
    move(dt);
    rope.postStep(body, world);

    if (touch.ground && v.y <= 0.5) { land(); return; }
    // Slid to the bottom of the line: drop off it onto the street.
    if (rate > 0 && rope.length >= maxL - 0.02) { swing.release(); toAir(); emit('release'); return; }
    // Climbed to the top: over a roof edge, pull up onto the roof.
    if (climb > 0.2 && rope.length <= tune.hangTop + 0.05 && pullUp()) return;
    if (intent.jumpPressed) {
      swing.release();
      const d = wantedHeading(intent);
      applyDv(body, 'assist', d.x * 5, 11 - Math.min(0, v.y), d.z * 5);
      toAir();
      emit('swingJump');
      return;
    }
    if (intent.hangPressed) { swing.release(); toAir(); emit('release'); return; }
    if (intent.swingPressed) { swing.release(); toAir(); hero.shootNow = true; }
  }

  // At the top of the line: up and over the roof edge it comes over (or is stuck just under).
  // Returns true when it vaulted.
  function pullUp() {
    const rope = swing.rope, w = rope.pivot, a = rope.pivots[0];
    let ix, iz, top;
    if (rope.pivots.length > 1 && w.roof) {
      ix = a.x - w.x; iz = a.z - w.z; top = w.y;
    } else if (rope.pivots.length === 1 && a.box && Math.abs(a.ny) < 0.5 && a.box.maxY - a.y < 1.6) {
      ix = -a.nx; iz = -a.nz; top = a.box.maxY;
    } else return false;
    const il = Math.hypot(ix, iz) || 1;
    const v = body.v, p = body.p;
    // Enough to rise a body height over the edge.
    const rise = Math.max(0.5, top + 1.3 - p.y);
    const vy = Math.sqrt(2 * g() * rise);
    swing.release();
    push((ix / il) * 3.5 - v.x, vy - v.y, (iz / il) * 3.5 - v.z, 'pull up over the edge', true);
    hero.state = 'air'; hero.airTime = 0.2;
    hero.launchUntil = hero.time + tune.launchWindow + 0.4;
    emit('vault');
    return true;
  }

  function toAir() {
    hero.state = 'air';
    hero.airTime = 0;
  }

  // A swing ends against the ground or a wall. Returns true when the state changed.
  function swingContacts(before) {
    if (touch.ground && body.v.y <= 0.5) { land(); return true; }
    if (touch.wall) { if (!tryMantle()) wallWithMomentum(before); return true; }
    return false;
  }

  // Into a wall at speed: a wall run that keeps most of the speed, bent upward (Insomniac feel).
  // Slow contacts just stick, as before.
  function wallWithMomentum(before) {
    if (!enterWall(touch)) return;
    const v = body.v;
    const keep = before * tune.wallRunKeep;
    if (keep < tune.wallCrawlSpeed + 2) return;
    // Direction along the wall: what the collision left, tipped upward.
    const tl = Math.hypot(v.x, v.z);
    const dx = v.x, dz = v.z, dy = Math.max(v.y, 0) + tl * 0.6 + 2;
    const l = Math.hypot(dx, dy, dz) || 1;
    applyDv(body, 'assist', (dx / l) * keep - v.x, (dy / l) * keep - v.y, (dz / l) * keep - v.z);
    hero.wallMomentum = true;
    emit('wallRun');
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
    if (hero.zipTime > ZIP_TIMEOUT) { hero.zip = null; rope.release(); toAir(); emit('release'); }
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
      hero.state = 'air'; hero.airTime = 0.1; hero.wallMomentum = false;
      move(dt);
      return;
    }
    if (intent.zipPressed && tryZip(intent)) { move(dt); return; }
    if (intent.swingPressed && shootWeb(intent)) {
      // Fire from the wall: kick off it and let the web catch.
      push(nx * 3, 2 - Math.min(0, v.y), nz * 3, 'kick off for a web');
      hero.state = 'air'; hero.airTime = 0.1; hero.wallMomentum = false;
      move(dt);
      return;
    }

    const vn = v.x * nx + v.z * nz;
    if (hero.wallMomentum) {
      // Carried in from a swing: run along and up the wall on that speed. Horizontal speed fades
      // slowly, half of gravity is taken by the legs, holding swing keeps at least the run-up pace.
      const thx0 = v.x - vn * nx, thz0 = v.z - vn * nz;
      const th = Math.hypot(thx0, thz0);
      const k = th > 1e-6 ? Math.max(0, th - tune.wallRunFriction * dt) / th : 0;
      let dy = g() * 0.5 * dt;
      if (runningUp(intent) && v.y + dy < tune.wallRunSpeed) dy = Math.min(tune.wallRunSpeed - v.y, RUN_UP_ACCEL * dt);
      push(thx0 * (k - 1) + (-ADHESION - vn) * nx, dy, thz0 * (k - 1) + (-ADHESION - vn) * nz, 'wall run');
      if (Math.hypot(th * k, v.y) < tune.wallCrawlSpeed + 1) hero.wallMomentum = false;
      afterWallMove(intent, dt);
      return;
    }
    // Desired velocity on the wall, reached with limited accelerations (all surface pushes).
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
    afterWallMove(intent, dt);
  }

  // Moves along the wall and handles losing it (vault over the top, or let go) and the ground.
  function afterWallMove(intent, dt) {
    const v = body.v;
    const nx = hero.wall.nx, nz = hero.wall.nz;
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
        hero.state = 'air'; hero.airTime = 0.2; hero.wallMomentum = false;
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
    else if (touch.wall && !tryMantle()) enterWall(touch);
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
