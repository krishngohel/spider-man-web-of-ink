import { orbitShots, clearShots } from '../ui/cinematicShots.js';
import { BRIDGE, NEON_PLAZA } from '../world/city.js';

// The story's cinematics (spec P5): camera paths over the live city, built against the city as it
// stands at run time (landmark blocks and roof heights, the hero and the boss where they are), so
// a shot frames what it means to and a re-rolled district never puts a tower through the lens.
// Each entry here is a builder: (ctx) => shots, where ctx is
//   { lm(id), site(name), hero: {x,y,z}, boss: {x,y,z,yaw} | null, sub, boxes }
// and the shots are src/ui/cinematicShots.js shots. A step names one with `cine: '<id>'` (played
// as the step begins, before its card, pages or stroll) and a boss step with `reveal: '<line>'`
// (the 'reveal' builder, around the boss, before the fight). src/story/director.js plays them.

const P = (x, y, z) => ({ x, y, z });
const shot = (from, to, look, dur, fov, sub = null, lookTo = null) => ({ from, to, look, ...(lookTo ? { lookTo } : {}), dur, fov, ...(sub ? { sub } : {}) });

export const CINEMATICS = {
  // Dawn over Manhattan, a dolly at Fisk Tower, then down to the hero on his roof.
  prologue: ({ lm, hero }) => {
    const fisk = lm('fisk'), van = lm('vanguard');
    return [
      shot(P(320, 300, 330), P(240, 285, 250), P(van.x - 60, 90, van.z + 90), 4.5, 50, 'Manhattan, a minute before sunrise.', P(fisk.x + 400, 100, fisk.z)),
      // From over Hell's Kitchen (low roofs), the tower stands against the Midtown skyline.
      shot(P(fisk.x - 320, 130, fisk.z + 230), P(fisk.x - 150, 118, fisk.z + 110), P(fisk.x, fisk.top - 40, fisk.z), 4.5, 46, 'Fisk Tower. The biggest office in the city, and the dirtiest.', P(fisk.x, fisk.top - 10, fisk.z)),
      { ...shot(P(hero.x - 28, hero.y + 16, hero.z + 24), P(hero.x - 6.5, hero.y + 3, hero.z + 5.5), P(hero.x, hero.y + 1, hero.z), 4, 44, 'And one guy who has been up all night, waiting for it to open.'), margin: 1.2 },
    ];
  },
  // Act 1: the Financial District canyon down to the Exchange, the bank's street, up the Bugle.
  act1: ({ lm }) => {
    const ex = lm('exchange'), bugle = lm('bugle');
    const front = { x: (ex.minX + ex.maxX) / 2, z: ex.maxZ + 6 };
    // The street corner southwest of the Bugle: a crane up its face, three quarters on.
    const corner = { x: bugle.minX - 15, z: bugle.maxZ + 14 };
    return [
      shot(P(front.x + 60, 46, front.z + 280), P(front.x + 60, 40, front.z + 90), P(front.x, 14, front.z), 4.5, 52, 'The Financial District. Old money, thick vault doors.', P(front.x, 8, front.z)),
      shot(P(front.x + 190, 12, front.z + 3), P(front.x + 40, 9, front.z + 3), P(front.x, 10, front.z - 4), 4, 42, 'Exchange Street. Quiet, for about another minute.', P(front.x, 6, front.z - 4)),
      shot(P(corner.x, 12, corner.z), P(corner.x, bugle.top + 25, corner.z), P(bugle.x, 40, bugle.z), 4.5, 50, 'The Daily Bugle. Where the city reads about itself at breakfast.', P(bugle.x, bugle.top, bugle.z)),
    ];
  },
  // Act 2: over the water to the power station, along the bridge, down Neon Square.
  act2: ({ lm }) => {
    const pw = lm('power');
    const px = NEON_PLAZA, pcx = (px.minX + px.maxX) / 2;
    return [
      shot(P(pw.x + 240, 95, pw.z + 320), P(pw.x + 120, 70, pw.z + 190), P(pw.x, 35, pw.z), 4.5, 48, 'The Harbor Power Station. Every light in the city runs through it.'),
      shot(P(BRIDGE.x0 - 10, 50, BRIDGE.z + 45), P(BRIDGE.towers[1] - 50, 52, BRIDGE.z + 45), P(BRIDGE.towers[0] + 40, 32, BRIDGE.z), 4, 50, 'Queensway Bridge. The only way off the island that stays dry.', P(BRIDGE.towers[1] + 10, 40, BRIDGE.z)),
      shot(P(pcx, 40, px.maxZ - 10), P(pcx, 24, px.maxZ - 230), P(pcx, 18, px.maxZ - 270), 4.5, 56, 'Neon Square. The signs are brighter than the stars.', P(pcx, 12, px.minZ + 30)),
    ];
  },
  // Act 3: low over the park at dusk, round the bell tower, down to the shipyard.
  act3: ({ lm, site }) => {
    const lawn = site('parkLawn'), church = lm('church'), yard = site('shipyard');
    return [
      shot(P(lawn.x - 120, 30, lawn.z + 170), P(lawn.x - 30, 20, lawn.z + 40), P(lawn.x, 4, lawn.z), 4.5, 52, 'Central Park. Four hundred acres of places to hide.', P(lawn.x + 200, 2, lawn.z - 70)),
      ...orbitShots(P(church.x, 34, church.z), 62, 22, 4.5, 1, { startAngle: Math.PI * 0.85, sweep: -0.9, fov: 44, sub: 'St. Bernard. The bell has not rung in forty years.' }),
      shot(P(yard.x + 160, 70, yard.z + 220), P(yard.x + 50, 48, yard.z + 90), P(yard.x, 8, yard.z), 4.5, 48, 'The shipyard. Cranes, containers and no questions.'),
    ];
  },
  // Act 4: rain over Midtown, the bridge from the water, up Oscorp Tower.
  act4: ({ lm }) => {
    const van = lm('vanguard'), osc = lm('oscorp');
    // The street corner southwest of Oscorp: a crane up the tower's edge to its top floor.
    const corner = { x: osc.minX - 15, z: osc.maxZ + 12 };
    return [
      shot(P(van.x + 310, 300, van.z + 300), P(van.x + 180, 290, van.z + 210), P(van.x, 150, van.z), 4.5, 50, 'Two in the morning. The whole city is holding its breath.', P(van.x, 200, van.z)),
      shot(P(BRIDGE.towers[0] + 30, 12, BRIDGE.z + 55), P(BRIDGE.towers[1] - 20, 14, BRIDGE.z + 52), P(BRIDGE.towers[0] + 75, 70, BRIDGE.z), 4, 48, 'Six of them. One of him. Those are the numbers.', P(BRIDGE.towers[1], 100, BRIDGE.z)),
      shot(P(corner.x, 14, corner.z), P(corner.x, osc.top + 12, corner.z), P(osc.x, 60, osc.z), 4.5, 50, 'Oscorp Tower. The lights on the top floor never go out.', P(osc.x, osc.top - 4, osc.z)),
    ];
  },
  // A boss reveal: a low push in from the front, then a quarter turn round him.
  reveal: ({ boss, hero, sub }) => {
    if (!boss) return null;
    // From the way he faces, or from a little to one side when the hero stands on that line
    // (the hero is in frame then, between the lens and him).
    const toHero = Math.atan2(hero.x - boss.x, hero.z - boss.z), near = Math.hypot(hero.x - boss.x, hero.z - boss.z) < 16;
    const off = (a) => Math.abs(Math.atan2(Math.sin(a - toHero), Math.cos(a - toHero)));
    const yaw = !near ? boss.yaw : [boss.yaw, boss.yaw + 0.7, boss.yaw - 0.7].reduce((best, a) => (off(a) > off(best) ? a : best));
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    const eye = P(boss.x, boss.y + 0.5, boss.z);
    return [
      shot(P(boss.x + dx * 10, boss.y + 0.2, boss.z + dz * 10), P(boss.x + dx * 5.5, boss.y + 0.7, boss.z + dz * 5.5), eye, 2.8, 38, sub),
      ...orbitShots(P(boss.x, boss.y + 0.4, boss.z), 5.5, 1.5, 3, 1, { startAngle: yaw + 0.4, sweep: -0.95, fov: 44 }),
    ];
  },
  // The block party: one slow crane over the yard, the lights and everyone, before Peter walks in.
  // The yard is the street outside the shelter and the avenue crossing it: the crane stays in
  // that crossing, rising from the far kerb toward the lights.
  party: ({ site }) => {
    const s = site('shelter');
    return [shot(P(s.x - 30, 2.2, s.z - 14), P(s.x - 12, 9, s.z - 8), P(s.x - 2, 1.4, s.z + 1), 6, 46, 'No sirens tonight. A grill, some lights, and the whole block.', P(s.x + 6, 1.6, s.z + 1))];
  },
  // The roof at dusk: up and away from the party, turning toward the Midtown skyline.
  dusk: ({ site, lm }) => {
    const s = site('shelter'), van = lm('vanguard');
    const mid = P(s.x - 28, 44, s.z + 26);
    return [
      shot(P(s.x - 22, 9, s.z - 12), mid, P(s.x, 1.5, s.z), 5, 48, 'Dusk over Harlem.', P(s.x + 30, 6, s.z - 60)),
      shot(mid, P(s.x + 60, 130, s.z + 150), P(s.x + 30, 6, s.z - 60), 5.5, 50, 'The city can wait until morning.', P(van.x, van.top - 40, van.z)),
    ];
  },
};

// How far a camera keeps from the city's boxes: shots near the ground (a reveal, the party) sit
// close to real things on purpose, the sweeping ones get room.
const MARGIN = { reveal: 0.8, party: 1.5, dusk: 2 };

export function buildCinematic(id, ctx) {
  const build = CINEMATICS[id];
  if (!build) return null;
  const shots = build(ctx);
  if (!shots) return null;
  return clearShots(shots, ctx.boxes ?? [], MARGIN[id] ?? 5);
}
