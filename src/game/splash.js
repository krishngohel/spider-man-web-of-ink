// Where a hero who falls in the water comes back. Two memories: the last place he stood on
// something (a roof, the street, a wall), and the last point he passed over dry land in any state.
// A long swing never stands still, so the standing spot can be a kilometre behind (a chase over the
// reservoir sent him back across the city); when it is far from the dry point he drops over that
// instead, straight down onto whatever is below. A standing spot newer than the dry point (a
// bridge deck stands over the water) always wins: that is where he really was.
const NEAR = 60;

export function createSplashMemory(spawn, isWater) {
  const stood = { x: spawn.x, y: spawn.y, z: spawn.z, t: 0, at: 0 };
  const dry = { x: spawn.x, y: spawn.y, z: spawn.z, t: 0, at: 0 };
  let clock = 0;
  return {
    record(p, state, speed, dt, wall = null) {
      clock += dt;
      if ((state === 'ground' || state === 'wall') && speed < 12) {
        stood.t += dt;
        if (stood.t > 0.4) {
          stood.x = p.x; stood.y = p.y + (state === 'wall' ? 0 : 0.01); stood.z = p.z; stood.t = 0; stood.at = clock;
          if (state === 'wall' && wall) { stood.x += wall.nx * 0.4; stood.z += wall.nz * 0.4; }
        }
      }
      dry.t += dt;
      if (dry.t > 0.25 && !isWater(p.x, p.z)) { dry.x = p.x; dry.y = p.y; dry.z = p.z; dry.t = 0; dry.at = clock; }
    },
    respawn() {
      if (stood.at >= dry.at || Math.hypot(stood.x - dry.x, stood.z - dry.z) < NEAR) return { x: stood.x, y: stood.y, z: stood.z, state: 'ground' };
      return { x: dry.x, y: Math.max(dry.y, 2), z: dry.z, state: 'air' };
    },
  };
}
