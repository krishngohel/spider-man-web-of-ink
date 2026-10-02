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
};

const RAY = { ground: true };
const smooth = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

export function speedCurves(speed, fovSetting = 60) {
  const k = smooth(speed / CAM.fullSpeed);
  return { dist: CAM.baseDist + CAM.speedDist * k, fov: fovSetting + CAM.speedFov * k };
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
    focus: { x: 0, y: 0, z: 0 },
    pos: { x: 0, y: 0, z: -5 },
    fwd: { x: 0, y: 0, z: 1 },
    shake: 0,
    side: 0.85,
    closeness: 5,

    // look: { dx, dy } in mouse pixels. world: needs raycast and groundHeight.
    update(dt, look, hero, world, settings = {}) {
      const sens = settings.sensitivity ?? 1;
      const inv = settings.invertY ? -1 : 1;
      const moved = Math.abs(look.dx) + Math.abs(look.dy) > 0.01;
      rig.yaw = wrapAngle(rig.yaw - look.dx * CAM.look * sens);
      rig.pitch = Math.min(CAM.maxPitch, Math.max(CAM.minPitch, rig.pitch + look.dy * CAM.look * sens * inv));
      rig.sinceLook = moved ? 0 : rig.sinceLook + dt;

      const v = hero.body.v;
      const speed = Math.hypot(v.x, v.y, v.z);
      const hs = Math.hypot(v.x, v.z);
      const flying = hero.state !== 'ground' && hero.state !== 'wall';
      if (hero.state === 'wall' && hero.wall && rig.sinceLook > 0.3) {
        // On a wall: swing round to face the wall from the open side, looking slightly up it.
        const want = Math.atan2(-hero.wall.nx, -hero.wall.nz);
        const k = 1 - Math.exp(-dt * 3);
        rig.yaw = wrapAngle(rig.yaw + wrapAngle(want - rig.yaw) * k);
        rig.pitch += (-0.15 - rig.pitch) * k;
      } else if (rig.sinceLook > CAM.followDelay && hs > 10 && flying) {
        const want = Math.atan2(v.x, v.z);
        const k = 1 - Math.exp(-dt * CAM.followRate * Math.min(1, hs / 30));
        rig.yaw = wrapAngle(rig.yaw + wrapAngle(want - rig.yaw) * k);
        const wantPitch = 0.12 + Math.max(-0.25, Math.min(0.35, -v.y / 80));
        rig.pitch += (wantPitch - rig.pitch) * k * 0.6;
      }

      const c = speedCurves(speed, settings.fov ?? CAM.baseFov);
      // Looking steeply up to aim a web: pull in, so the hero stays big at the bottom of the frame.
      c.dist *= 1 - 0.4 * smooth((-rig.pitch - 0.35) / 0.7);
      const kd = 1 - Math.exp(-dt * 3);
      rig.dist += (c.dist - rig.dist) * kd;
      rig.fov += (c.fov - rig.fov) * kd;

      // Focus: the hero, followed tightly (a small lag reads as weight without losing the hero).
      const p = hero.body.p;
      // A swing trails a little more (weight), a fall or run follows tightly.
      const kf = 1 - Math.exp(-dt * (hero.state === 'swing' ? 11 : 18));
      rig.focus.x += (p.x - rig.focus.x) * kf;
      rig.focus.y += (p.y + CAM.focusHeight - rig.focus.y) * kf;
      rig.focus.z += (p.z - rig.focus.z) * kf;
      // A teleport (respawn, test hook) snaps instead of sweeping across the city.
      if (Math.hypot(p.x - rig.focus.x, p.y - rig.focus.y, p.z - rig.focus.z) > 30) {
        rig.focus.x = p.x; rig.focus.y = p.y + CAM.focusHeight; rig.focus.z = p.z;
      }

      const cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch);
      rig.fwd.x = Math.sin(rig.yaw) * cp; rig.fwd.y = -sp; rig.fwd.z = Math.cos(rig.yaw) * cp;
      place(world);
      return rig;
    },
  };

  // Over the right shoulder: the crosshair (screen centre) looks past the hero, never through him.
  const sh = { x: 0, y: 0, z: 0 };
  function place(world) {
    const f = rig.focus, d = rig.fwd;
    // Right of the view direction (y up, right-handed): f x up.
    const hl = Math.hypot(d.x, d.z) || 1;
    const rx = -d.z / hl, rz = d.x / hl;
    // Shoulder: the right one unless a wall is in the way there and the left has more room.
    let want = CAM.shoulder;
    if (world) {
      const right = world.raycast(f.x, f.y, f.z, rx, 0, rz, CAM.shoulder + CAM.wallClear, RAY);
      const rightRoom = right ? right.t - CAM.wallClear : CAM.shoulder;
      if (rightRoom < CAM.shoulder * 0.6) {
        const left = world.raycast(f.x, f.y, f.z, -rx, 0, -rz, CAM.shoulder + CAM.wallClear, RAY);
        const leftRoom = left ? left.t - CAM.wallClear : CAM.shoulder;
        want = leftRoom > rightRoom ? -Math.max(0, leftRoom) : Math.max(0, rightRoom);
      }
    }
    // Ease between shoulders instead of popping.
    rig.side += (want - rig.side) * 0.18;
    sh.x = f.x + rx * rig.side; sh.y = f.y + CAM.shoulderUp; sh.z = f.z + rz * rig.side;
    let dist = rig.dist;
    // Back along -fwd from the shoulder point; stop short of anything in between.
    if (world) {
      const hit = world.raycast(sh.x, sh.y, sh.z, -d.x, -d.y, -d.z, dist + CAM.wallClear, RAY);
      if (hit) dist = Math.max(0.4, hit.t - CAM.wallClear);
    }
    // Cramped (a wall right behind): rise over the hero rather than crowd into him.
    let lift = 0;
    if (dist < CAM.minDist && world) {
      const up = world.raycast(sh.x, sh.y, sh.z, 0, 1, 0, 2.2, RAY);
      lift = Math.min(up ? Math.max(0, up.t - CAM.wallClear) : 2, (CAM.minDist - dist) * 1.4);
    }
    rig.pos.x = sh.x - d.x * dist;
    rig.pos.y = sh.y - d.y * dist + lift;
    rig.pos.z = sh.z - d.z * dist;
    rig.closeness = Math.hypot(rig.pos.x - f.x, rig.pos.y - f.y, rig.pos.z - f.z);
    if (world) {
      const under = world.groundHeight(rig.pos.x, rig.pos.y, rig.pos.z);
      rig.pos.y = Math.max(rig.pos.y, under + CAM.groundClear);
    }
  }

  return rig;
}
