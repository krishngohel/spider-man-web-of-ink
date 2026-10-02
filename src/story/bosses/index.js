import { createKingpin } from './kingpin.js';
import { createShocker } from './shocker.js';
import { createVulture } from './vulture.js';
import { createRhino } from './rhino.js';

// Every boss module, by the id story steps use. A module: create(ctx) -> { actor, done, failed?,
// phase, state, update(dt), setPhase(n), dispose(), objective?, waypoint? }.
export const BOSSES = {
  kingpin: createKingpin,
  shocker: createShocker,
  vulture: createVulture,
  rhino: createRhino,
};
