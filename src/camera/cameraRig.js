// Third-person follow camera, as plain math so it can be tested. Yaw and pitch come from the
// mouse or right stick; when the player stops steering the camera for a moment at speed, it eases
// around behind the direction of travel. Distance and field of view open up with speed. The
// camera never sits inside a building (a ray from the hero stops it short) and never dips under
// the ground beneath it (Gotham fix: the action camera once went into the floor).

export const CAM = {
  baseDist: 4.6, speedDist: 3.2,
  baseFov: 60, speedFov: 22,
  fullSpeed: 60,
  followDelay: 0.5, followRate: 2.6,
  focusHeight: 0.55,
  minPitch: -1.25, maxPitch: 1.35,
  wallClear: 0.3, groundClear: 0.6,
  look: 0.0024,
  shoulder: 0.85, shoulderUp: 0.25,
  minDist: 1.8,
  // Combat framing (spec C7): pulled back with the spread of the fight, a little down and wider,
  // framing pulled toward the nearest three, auto-turning to an off-screen threat after 1 s hands-off.
  fightDist: 5.2, fightSpread: 0.35, fightMax: 8, fightPitch: 0.38, fightFov: 4, fightPull: 0.25,
  fightTurnAfter: 1.0, fightTurnRate: 1.6, fightTurnMin: 0.75, lookDeadPx: 1.5,
  // Traversal (overhaul C2 to C6): in the air the camera may look up only so far (-0.6 rad) and never
  // sinks more than 1 m under the hero, so a swing never ends low and staring into a wall; the
  // shoulder offset follows the state; FOV opens between 15 and 55 m/s; a web attach kicks the
  // camera in a little and levels it unless the player is steering.
  flyPitchMin: -0.6, flyFloor: 1.0, lookNoise: 30, // lookNoise: px per second
  shoulderBy: { ground: 0.6, air: 0.3, swing: 0.15, hang: 0.2, zip: 0.2, wall: 0.1, glide: 0.3 },
  fovFrom: 15, fovTo: 55, attachKick: 0.35, attachLevel: 0.12, whisker: 0.25,
  // The critical action shot (Gotham's actionShot): low and to the side of the blow, pushing in and
  // orbiting a little, tilted like a panel. Never under the floor (actClear above it when set up,
  // actFloor during it), never through a wall (the whisker rays from the blow stop it short).
  actDur: 0.9, actDist: 3.3, actPush: 0.6, actOrbit: 0.35, actLift: -0.35, actBack: 1.0,
  actRoll: 0.14, actFov: 10, actClear: 1.0, actFloor: 0.6, actRoom: 1.5,
};

// Where the combat camera wants to sit given the fight (pure, tested).
export function fightFraming(fight) {
  if (!fight || !fight.pts.length) return null;
  return { dist: Math.min(CAM.fightMax, Math.max(CAM.fightDist, CAM.fightDist + CAM.fightSpread * fight.spread)) };
}

const RAY = { ground: true };
const smooth = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

export function speedCurves(speed, fovSetting = 60) {
  const k = smooth(speed / CAM.fullSpeed);
  const kf = smooth((speed - CAM.fovFrom) / (CAM.fovTo - CAM.fovFrom));
  return { dist: CAM.baseDist + CAM.speedDist * k, fov: fovSetting + CAM.speedFov * kf };
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createCameraRig() {
  const rig = {
    yaw: 0, pitch: 0.18,   // yaw 0 looks along +z; positive pitch looks down
    dist: CAM.baseDist, fov: CAM.baseFov,
    sinceLook: 10,
    sinceAim: 10,      // since the player last really moved the camera (jitter under 1.5 px ignored)
    fightK: 0,         // 0 roaming, 1 framing a fight
    kick: 0,           // metres the camera is pulled in by a web attach (decays)
    level: 0,          // seconds left of easing back toward level after an attach
    state: 'ground',
    push: 0, pushT: 0, pushAll: 1,
    turnTo: null,
    // Ease the yaw toward a heading (a new objective) unless the player is steering.
    faceYaw(yaw) { rig.turnTo = { yaw, t: 1.2 }; },
    // A finisher or a takedown: push in by up to a third for `t` seconds, easing in and out.
    cinematic(t) { rig.pushT = t; rig.pushAll = t; },
    // A web just attached: a small dolly kick, and level out unless the player is steering.
    onAttach() { rig.kickWant = CAM.attachKick; rig.fovPop = Math.max(rig.fovPop, 4); if (rig.sinceLook > 0.3) rig.level = 0.4; },
    // A burst of speed (a perfect release, a zip boost): the field of view pops open and settles.
    pop(deg) { rig.fovPop = Math.max(rig.fovPop, deg); },
    fovPop: 0,
    focus: { x: 0, y: 0, z: 0 },
    focusV: { x: 0, y: 0, z: 0 },
    // What the camera shows: the follow camera (k 0), or blended toward the action shot (k up to 1).
    // Only the drawn view: the yaw and fwd the controls read are left alone.
    view: { k: 0, pos: { x: 0, y: 0, z: -5 }, fwd: { x: 0, y: 0, z: 1 }, roll: 0, fov: 0 },
    act: null,
    // A critical blow at `at` from `from` (the hero): frame it from the side for CAM.actDur s.
    // Returns false (no shot) when neither side has room for the camera.
    actionShot(at, from, world) {
      const dx = at.x - from.x, dz = at.z - from.z, l = Math.hypot(dx, dz) || 1;
      const ux = dx / l, uz = dz / l, px = -uz, pz = ux;
      // The point it looks at: the blow, a third of the way back toward the hero, at chest height.
      const f = { x: at.x + (from.x - at.x) * 0.35, y: Math.max(at.y, from.y) - 0.15, z: at.z + (from.z - at.z) * 0.35 };
      const top = Math.max(at.y, from.y) + 1.5;
      if (world) f.y = Math.max(f.y, world.groundHeight(f.x, top, f.z) + 0.6);
      // The side of the line the camera is already on first.
      const first = (rig.pos.x - f.x) * px + (rig.pos.z - f.z) * pz >= 0 ? 1 : -1;
      for (const side of [first, -first]) {
        const a0 = Math.atan2(px * side * CAM.actDist - ux * CAM.actBack, pz * side * CAM.actDist - uz * CAM.actBack);
        const room = shotRoom(world, f, a0, CAM.actDist + CAM.actBack * 0.3, CAM.actLift);
        if (room < CAM.actRoom) continue;
        rig.act = { t: 0, f, a0, side, room };
        return true;
      }
      return false;
    },
    kickWant: 0,
    pos: { x: 0, y: 0, z: -5 },
    fwd: { x: 0, y: 0, z: 1 },
    shake: 0,
    side: 0.85,
    sideV: 0,
    lift: 0,
    closeness: 5,
    followK: 18,
    colDist: 99,       // how far back the camera may sit before it hits something (eases back out)
    lastDt: 1 / 60,
    vel: { x: 0, y: 0, z: 0 },

    // look: { dx, dy } in mouse pixels. world: needs raycast and groundHeight.
    update(dt, look, hero, world, settings = {}) {
      const sens = settings.sensitivity ?? 1;
      const inv = settings.invertY ? -1 : 1;
      // A hair of mouse jitter is not steering (it used to reset the auto-follow every frame).
      const moved = (Math.abs(look.dx) + Math.abs(look.dy)) / Math.max(dt, 1e-3) > CAM.lookNoise;
      rig.yaw = wrapAngle(rig.yaw - look.dx * CAM.look * sens * (settings.invertX ? -1 : 1));
      rig.pitch = Math.min(CAM.maxPitch, Math.max(CAM.minPitch, rig.pitch + look.dy * CAM.look * sens * inv));
      rig.sinceLook = moved ? 0 : rig.sinceLook + dt;
      rig.sinceAim = Math.abs(look.dx) + Math.abs(look.dy) > CAM.lookDeadPx ? 0 : rig.sinceAim + dt;
      const fight = hero.fight ?? null;
      const framing = fightFraming(fight);
      rig.fightK += ((framing ? 1 : 0) - rig.fightK) * (1 - Math.exp(-dt * 2.5));

      const v = hero.body.v;
      const speed = Math.hypot(v.x, v.y, v.z);
      const hs = Math.hypot(v.x, v.z);
      const flying = hero.state !== 'ground' && hero.state !== 'wall';
      rig.state = hero.state;
      if (flying && rig.sinceLook > 0.3 && rig.pitch < CAM.flyPitchMin) rig.pitch += (CAM.flyPitchMin - rig.pitch) * Math.min(1, dt * 8);
      if (rig.level > 0) {
        rig.level -= dt;
        if (!moved) rig.pitch += (CAM.attachLevel - rig.pitch) * Math.min(1, dt * 4);
      }
      rig.kickWant = Math.max(0, rig.kickWant - dt * CAM.attachKick / 0.4);
      rig.kick += (rig.kickWant - rig.kick) * (1 - Math.exp(-dt * 18)); // eased in and out, never a one-frame jump
      if (rig.turnTo) {
        rig.turnTo.t -= dt;
        if (moved || rig.turnTo.t <= 0) rig.turnTo = null;
        else rig.yaw = wrapAngle(rig.yaw + wrapAngle(rig.turnTo.yaw - rig.yaw) * Math.min(1, dt * 4));
      }
      if (rig.pushT > 0) { rig.pushT -= dt; const u = 1 - Math.max(0, rig.pushT) / rig.pushAll; rig.push = Math.sin(Math.PI * u); } else rig.push = 0;
      if (hero.state === 'wall' && hero.wall && rig.sinceLook > 0.3) {
        // On a wall: look slightly up it. The yaw stays the player's (wall jumps leave along the
        // camera's sideways aim).
        const k = 1 - Math.exp(-dt * 3);
        rig.pitch += (-0.15 - rig.pitch) * k;
      } else if (rig.sinceLook > CAM.followDelay && hs > 10 && flying) {
        const want = Math.atan2(v.x, v.z);
        const k = 1 - Math.exp(-dt * CAM.followRate * Math.min(1, hs / 30));
        rig.yaw = wrapAngle(rig.yaw + wrapAngle(want - rig.yaw) * k);
        const wantPitch = 0.12 + Math.max(-0.25, Math.min(0.35, -v.y / 80));
        rig.pitch += (wantPitch - rig.pitch) * k * 0.6;
      }

      if (framing && fight.handsOff && rig.sinceAim > CAM.fightTurnAfter && hero.state === 'ground') {
        // Hands off the camera and the stick mid-fight: ease down over the fight and turn toward a
        // threat that is out of view (past 43 degrees to one side). Never while the player steers:
        // movement is camera-relative, so a turning camera bends their heading and their target.
        const k = 1 - Math.exp(-dt * CAM.fightTurnRate);
        rig.pitch += (CAM.fightPitch - rig.pitch) * k * rig.fightK * 0.25;
        if (fight.threat) {
          const want = Math.atan2(fight.threat.x - hero.body.p.x, fight.threat.z - hero.body.p.z);
          const off = wrapAngle(want - rig.yaw);
          if (Math.abs(off) > CAM.fightTurnMin) rig.yaw = wrapAngle(rig.yaw + off * k * rig.fightK);
        }
      }

      const c = speedCurves(speed, settings.fov ?? CAM.baseFov);
      if (rig.fightK > 0.001) {
        const fd = framing ? framing.dist : rig.fightDist ?? CAM.fightDist;
        if (framing) rig.fightDist = framing.dist;
        c.dist += (fd - c.dist) * rig.fightK;
        c.fov += CAM.fightFov * rig.fightK;
      }
      // Looking steeply up to aim a web: pull in, so the hero stays big at the bottom of the frame.
      c.dist *= 1 - 0.4 * smooth((-rig.pitch - 0.35) / 0.7);
      c.dist *= 1 - 0.33 * rig.push;
      c.fov -= 5 * rig.push;
      // Each web attach and burst widens the view for a moment (decays over about 0.4 s).
      rig.fovPop = Math.max(0, rig.fovPop - dt * 10); // shown on top of the smoothed FOV (game.js)
      rig.lastDt = dt;
      rig.vel.x = v.x; rig.vel.y = v.y; rig.vel.z = v.z;
      const kd = 1 - Math.exp(-dt * 3);
      rig.dist += (c.dist - rig.dist) * kd;
      rig.fov += (c.fov - rig.fov) * kd;

      // Focus: the hero, followed tightly (a small lag reads as weight without losing the hero).
      const p = hero.body.p;
      // A swing trails a little more (weight), a fall or run follows tightly. The rate itself
      // eases between the two: switching it at once (letting go of a web) changes how far the
      // camera trails in a single frame, a visible lurch at speed.
      rig.followK += ((hero.state === 'swing' ? 11 : 18) - rig.followK) * (1 - Math.exp(-dt * 2.5));
      // In a fight the framing leans a quarter of the way toward the nearest enemies.
      let fx = p.x, fz = p.z;
      if (fight && fight.pts.length) {
        let mx = 0, mz = 0;
        for (const q of fight.pts) { mx += q.x; mz += q.z; }
        mx /= fight.pts.length; mz /= fight.pts.length;
        rig.fightMid = { x: mx - p.x, z: mz - p.z };
      }
      if (rig.fightMid && rig.fightK > 0.001) { fx += rig.fightMid.x * CAM.fightPull * rig.fightK; fz += rig.fightMid.z * CAM.fightPull * rig.fightK; }
      // The focus rides a critically damped spring (second order) with about the old lag: its
      // acceleration stays continuous when the hero stops dead on a wall or lands, where a first
      // order follow turned every velocity step into a one-frame camera jolt.
      {
        const w0 = rig.followK * 2, n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
        const ty = p.y + CAM.focusHeight, F = rig.focus, V = rig.focusV;
        for (let s = 0; s < n; s++) {
          V.x += (w0 * w0 * (fx - F.x) - 2 * w0 * V.x) * h; F.x += V.x * h;
          V.y += (w0 * w0 * (ty - F.y) - 2 * w0 * V.y) * h; F.y += V.y * h;
          V.z += (w0 * w0 * (fz - F.z) - 2 * w0 * V.z) * h; F.z += V.z * h;
        }
      }
      // A teleport (respawn, test hook) snaps instead of sweeping across the city.
      if (Math.hypot(p.x - rig.focus.x, p.y - rig.focus.y, p.z - rig.focus.z) > 30) {
        rig.focus.x = p.x; rig.focus.y = p.y + CAM.focusHeight; rig.focus.z = p.z;
        rig.focusV.x = hero.body.v.x; rig.focusV.y = hero.body.v.y; rig.focusV.z = hero.body.v.z;
      }

      const cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch);
      rig.fwd.x = Math.sin(rig.yaw) * cp; rig.fwd.y = -sp; rig.fwd.z = Math.cos(rig.yaw) * cp;
      place(world);
      actionStep(dt, world, p);
      return rig;
    },
  };

  // How far the camera can go from the blow `f` along the heading `a` (radians, atan2(x, z)) and
  // `lift` before a wall: three rays, a whisker to either side.
  function shotRoom(world, f, a, dist, lift) {
    if (!world) return dist;
    let dx = Math.sin(a) * dist, dy = lift, dz = Math.cos(a) * dist;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const sx = -dz, sz = dx;
    let room = l;
    for (const s of [0, 1, -1]) {
      const hit = world.raycast(f.x + sx * CAM.whisker * s, f.y, f.z + sz * CAM.whisker * s, dx, dy, dz, l + CAM.wallClear, RAY);
      if (hit) room = Math.min(room, Math.max(0, hit.t - CAM.wallClear));
    }
    return room;
  }
  const smoothK = (x) => x * x * (3 - 2 * x);
  function actionStep(dt, world, p) {
    const V = rig.view, a = rig.act;
    V.pos.x = rig.pos.x; V.pos.y = rig.pos.y; V.pos.z = rig.pos.z;
    V.fwd.x = rig.fwd.x; V.fwd.y = rig.fwd.y; V.fwd.z = rig.fwd.z;
    V.k = 0; V.roll = 0; V.fov = 0;
    if (!a) return;
    a.t += dt;
    const k = a.t / CAM.actDur;
    // Done, or the hero carried far off (a teleport, a launch): back to the follow camera.
    if (k >= 1 || Math.hypot(p.x - a.f.x, p.z - a.f.z) > 12) { rig.act = null; return; }
    // Snap in fast, hold, ease out.
    const w = k < 0.12 ? k / 0.12 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    const e = smoothK(Math.max(0, Math.min(1, w)));
    // Push in and orbit a little round the blow.
    const ang = a.a0 + a.side * CAM.actOrbit * k;
    const want = CAM.actDist - CAM.actPush * k;
    const room = shotRoom(world, a.f, ang, want, CAM.actLift + 0.3 * k);
    const lift = CAM.actLift + 0.3 * k, L = Math.hypot(want, lift);
    const d = Math.max(0.6, Math.min(L, room));
    const sx = a.f.x + (Math.sin(ang) * want / L) * d, sz = a.f.z + (Math.cos(ang) * want / L) * d;
    let sy = a.f.y + (lift / L) * d;
    if (world) sy = Math.max(sy, world.groundHeight(sx, a.f.y + 1.5, sz) + CAM.actFloor);
    // Blend from the follow camera; the straight line between two clear spots is checked too.
    let bx = rig.pos.x + (sx - rig.pos.x) * e, by = rig.pos.y + (sy - rig.pos.y) * e, bz = rig.pos.z + (sz - rig.pos.z) * e;
    if (world && e > 0.01) {
      const ox = bx - a.f.x, oy = by - a.f.y, oz = bz - a.f.z, ol = Math.hypot(ox, oy, oz) || 1;
      const hit = world.raycast(a.f.x, a.f.y, a.f.z, ox / ol, oy / ol, oz / ol, ol + CAM.wallClear, RAY);
      if (hit && hit.t - CAM.wallClear < ol) {
        const t = Math.max(0.4, hit.t - CAM.wallClear);
        bx = a.f.x + (ox / ol) * t; by = a.f.y + (oy / ol) * t; bz = a.f.z + (oz / ol) * t;
      }
      by = Math.max(by, world.groundHeight(bx, Math.max(by, a.f.y) + 1.5, bz) + CAM.actFloor);
    }
    V.pos.x = bx; V.pos.y = by; V.pos.z = bz;
    // Look: from the follow camera's direction toward the blow.
    let lx = a.f.x - bx, ly = a.f.y - by, lz = a.f.z - bz;
    const ll = Math.hypot(lx, ly, lz) || 1; lx /= ll; ly /= ll; lz /= ll;
    let fx = rig.fwd.x + (lx - rig.fwd.x) * e, fy = rig.fwd.y + (ly - rig.fwd.y) * e, fz = rig.fwd.z + (lz - rig.fwd.z) * e;
    const fl = Math.hypot(fx, fy, fz) || 1;
    V.fwd.x = fx / fl; V.fwd.y = fy / fl; V.fwd.z = fz / fl;
    V.k = e; V.roll = a.side * CAM.actRoll * e; V.fov = -CAM.actFov * e;
  }

  // Over the right shoulder: the crosshair (screen centre) looks past the hero, never through him.
  const sh = { x: 0, y: 0, z: 0 };
  function place(world) {
    const f = rig.focus, d = rig.fwd;
    // Right of the view direction (y up, right-handed): f x up.
    const hl = Math.hypot(d.x, d.z) || 1;
    const rx = -d.z / hl, rz = d.x / hl;
    // Shoulder: by state, on the right unless a wall is in the way there and the left has more room.
    const base = (CAM.shoulderBy[rig.state] ?? CAM.shoulder) * (1 - 0.6 * rig.fightK);
    let want = base;
    if (world && base > 0.05) {
      const right = world.raycast(f.x, f.y, f.z, rx, 0, rz, base + CAM.wallClear, RAY);
      const rightRoom = right ? right.t - CAM.wallClear : base;
      if (rightRoom < base * 0.6) {
        const left = world.raycast(f.x, f.y, f.z, -rx, 0, -rz, base + CAM.wallClear, RAY);
        const leftRoom = left ? left.t - CAM.wallClear : base;
        want = leftRoom > rightRoom ? -Math.max(0, leftRoom) : Math.max(0, rightRoom);
      }
    }
    // Between shoulders on a critically damped spring: the swap starts and ends gently (an eased
    // step still starts at full speed, a sideways jolt in one frame).
    {
      const w0 = 7, h = Math.min(rig.lastDt, 1 / 30);
      rig.sideV += (w0 * w0 * (want - rig.side) - 2 * w0 * rig.sideV) * h;
      rig.side += rig.sideV * h;
    }
    sh.x = f.x + rx * rig.side; sh.y = f.y + CAM.shoulderUp; sh.z = f.z + rz * rig.side;
    let dist = Math.max(CAM.minDist * 0.6, rig.dist - rig.kick);
    // Back along -fwd from the shoulder point; stop short of anything in between (and of anything a
    // whisker 0.25 m to either side would clip). In at once (never through a wall), back out gently.
    // A ray 0.3 s ahead along the hero's path eases the camera in before a corner comes between
    // them (slowly: it used to slam the camera in).
    let room = 99, ahead = 99;
    if (world) {
      for (const s of [0, 1, -1]) {
        const ox = rx * CAM.whisker * s, oz = rz * CAM.whisker * s;
        const hit = world.raycast(sh.x + ox, sh.y, sh.z + oz, -d.x, -d.y, -d.z, dist + CAM.wallClear, RAY);
        if (hit) room = Math.min(room, Math.max(0.4, hit.t - CAM.wallClear));
      }
      const ax = sh.x + rig.vel.x * 0.3, ay = sh.y + rig.vel.y * 0.3, az = sh.z + rig.vel.z * 0.3;
      const hitA = world.raycast(ax, ay, az, -d.x, -d.y, -d.z, dist + CAM.wallClear, RAY);
      if (hitA) ahead = Math.max(0.4, hitA.t - CAM.wallClear);
    }
    const wantD = Math.min(room, dist + 1);
    const rate = wantD < rig.colDist ? 9 : 4;
    rig.colDist += (wantD - rig.colDist) * (1 - Math.exp(-rig.lastDt * rate));
    if (ahead < rig.colDist) rig.colDist += (ahead - rig.colDist) * (1 - Math.exp(-rig.lastDt * 3));
    dist = Math.min(dist, rig.colDist, room);
    // Cramped (a wall right behind): rise over the hero rather than crowd into him.
    let lift = 0;
    if (dist < CAM.minDist && world) {
      const up = world.raycast(sh.x, sh.y, sh.z, 0, 1, 0, 2.2, RAY);
      lift = Math.min(up ? Math.max(0, up.t - CAM.wallClear) : 2, (CAM.minDist - dist) * 1.4);
    }
    // The lift eases in and out (it only keeps the view clear; nothing clips without it).
    rig.lift += (lift - rig.lift) * (1 - Math.exp(-rig.lastDt * 6));
    if (world && rig.lift > lift) {
      const up = world.raycast(sh.x, sh.y, sh.z, 0, 1, 0, rig.lift + CAM.wallClear, RAY);
      if (up) rig.lift = Math.min(rig.lift, Math.max(0, up.t - CAM.wallClear));
    }
    rig.pos.x = sh.x - d.x * dist;
    rig.pos.y = sh.y - d.y * dist + rig.lift;
    rig.pos.z = sh.z - d.z * dist;
    rig.closeness = Math.hypot(rig.pos.x - f.x, rig.pos.y - f.y, rig.pos.z - f.z);
    // In the air, never far under the hero (looking up from below at a wall is what made swings
    // feel cramped).
    if (rig.state !== 'ground' && rig.state !== 'wall' && rig.pos.y < f.y - CAM.flyFloor) {
      let lift = f.y - CAM.flyFloor - rig.pos.y;
      if (world) { const up = world.raycast(rig.pos.x, rig.pos.y, rig.pos.z, 0, 1, 0, lift + CAM.wallClear, RAY); if (up) lift = Math.max(0, up.t - CAM.wallClear); }
      rig.pos.y += lift;
    }
    if (world) {
      const under = world.groundHeight(rig.pos.x, rig.pos.y, rig.pos.z);
      rig.pos.y = Math.max(rig.pos.y, under + CAM.groundClear);
    }
  }

  return rig;
}
