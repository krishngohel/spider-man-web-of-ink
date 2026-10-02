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
};

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
      if (rig.sinceLook > CAM.followDelay && hs > 10 && flying) {
        const want = Math.atan2(v.x, v.z);
        const k = 1 - Math.exp(-dt * CAM.followRate * Math.min(1, hs / 30));
        rig.yaw = wrapAngle(rig.yaw + wrapAngle(want - rig.yaw) * k);
        const wantPitch = 0.12 + Math.max(-0.25, Math.min(0.35, -v.y / 80));
        rig.pitch += (wantPitch - rig.pitch) * k * 0.6;
      }

      const c = speedCurves(speed, settings.fov ?? CAM.baseFov);
      const kd = 1 - Math.exp(-dt * 3);
      rig.dist += (c.dist - rig.dist) * kd;
      rig.fov += (c.fov - rig.fov) * kd;

      // Focus: the hero, followed tightly (a small lag reads as weight without losing the hero).
      const p = hero.body.p;
      const kf = 1 - Math.exp(-dt * 18);
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

  function place(world) {
    const f = rig.focus, d = rig.fwd;
    let dist = rig.dist;
    // Back along -fwd from the focus; stop short of anything in between.
    if (world) {
      const hit = world.raycast(f.x, f.y, f.z, -d.x, -d.y, -d.z, dist + CAM.wallClear, { ground: true });
      if (hit) dist = Math.max(0.4, hit.t - CAM.wallClear);
    }
    rig.pos.x = f.x - d.x * dist;
    rig.pos.y = f.y - d.y * dist;
    rig.pos.z = f.z - d.z * dist;
    if (world) {
      const under = world.groundHeight(rig.pos.x, rig.pos.y, rig.pos.z);
      rig.pos.y = Math.max(rig.pos.y, under + CAM.groundClear);
    }
  }

  return rig;
}
