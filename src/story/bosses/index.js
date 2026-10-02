import { createKingpin } from './kingpin.js';
import { createShocker } from './shocker.js';
import { createVulture } from './vulture.js';
import { createRhino } from './rhino.js';
import { createElectro } from './electro.js';
import { createScorpion } from './scorpion.js';
import { createMysterio } from './mysterio.js';
import { createLizard } from './lizard.js';
import { createKraven } from './kraven.js';
import { createSandman } from './sandman.js';
import { createVenom } from './venom.js';
import { createOck } from './ock.js';
import { createGoblin, createCatchMJ } from './goblin.js';
import { createDuo } from './duo.js';

// Every boss module, by the id story steps use. A module: create(ctx) -> { actor, done, failed?,
// phase, state, update(dt), setPhase(n), dispose(), objective?, waypoint? }.
export const BOSSES = {
  kingpin: createKingpin,
  shocker: createShocker,
  vulture: createVulture,
  rhino: createRhino,
  electro: createElectro,
  scorpion: createScorpion,
  mysterio: createMysterio,
  lizard: createLizard,
  kraven: createKraven,
  sandman: createSandman,
  venom: createVenom,
  ock: createOck,
  goblin: createGoblin,
  catchMJ: createCatchMJ,
  duo: (ctx) => createDuo(ctx, BOSSES),
};
