// A hero-shaped object the poser can drive (the same shape multiplayer uses for remote players):
// bosses, cast members in panels and cinematic actors fill it each frame from their own state.
export function makePuppet() {
  const pivots = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
  const swing = {
    active: false, P: pivots[1], R: pivots[0], L: 0, rope: { pivots: [] },
    angle(p, v) { const P = this.P, sh = Math.hypot(v.x, v.z) || 1; const fwd = ((p.x - P.x) * v.x + (p.z - P.z) * v.z) / sh; return Math.atan2(fwd, P.y - p.y) * 57.2958; },
  };
  return {
    body: { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } }, state: 'ground', facing: { x: 0, z: 1 },
    swing, rope: { active: false, pivots: [], pivot: null }, wall: { nx: 0, nz: 1 }, wallMomentum: false,
    diving: false, hangInverted: false, speed: 0, _pivots: pivots,
  };
}

// Sets a puppet's place, velocity, facing (radians, 0 = +z) and state.
export function setPuppet(pp, p, v, yaw, state = 'ground') {
  pp.body.p.x = p.x; pp.body.p.y = p.y; pp.body.p.z = p.z;
  pp.body.v.x = v.x; pp.body.v.y = v.y; pp.body.v.z = v.z;
  pp.speed = Math.hypot(v.x, v.y, v.z);
  pp.state = state;
  pp.facing.x = Math.sin(yaw); pp.facing.z = Math.cos(yaw);
  pp.wall.nx = -pp.facing.x; pp.wall.nz = -pp.facing.z;
}
