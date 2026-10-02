// Every physical constant in the game. `tune` is the live copy the dev panel edits; the physics
// reads from `tune`, so a slider takes effect on the next step. Units: metres, seconds, kg, N.

export const G = { comic: 19.62, real: 9.81 };
export const STEP = 1 / 240;
// 12 steps cover a 20 fps frame; slower frames slow the game a little instead of spiraling.
export const MAX_SUBSTEPS = 12;

export const DEFAULTS = {
  // Hero body. Position is the centre of mass, 0.9 m above the feet.
  mass: 80,
  radius: 0.4,
  height: 1.8,
  // Free-fall terminal speeds, normal pose and dive tuck. Drag is set from these, so they hold
  // under both gravity settings.
  terminal: 60,
  diveTerminal: 85,
  maxSpeed: 110,
  // Web line.
  webMin: 6,
  webMax: 70,
  webTravel: 0.06,
  ropeGive: 0.03,
  // How fast a slack line is hauled in (no load on it, so this is just how fast the arm pulls).
  slackTakeUp: 50,
  winchSpeed: 10,
  winchTension: 12000,
  flickSpeed: 26,
  flickTension: 30000,
  flickTime: 0.12,
  flickWindow: 0.25,
  zipSpeed: 34,
  zipTension: 30000,
  zipRange: 60,
  // Swinging (Insomniac-style, spec 4.3 and 4.4). Line length grows with speed. Tuned with
  // scripts/swing-tune.mjs toward ~140 km/h cruising with real rise and fall (2026-10-01).
  swingLenBase: 24,
  swingLenPerSpeed: 0.63,
  swingLenMin: 16,
  swingLenMax: 45,
  swingStartAngle: 67,     // degrees behind the pivot at the start of a swing
  altTarget: 42,           // working height over the ground that chained swings settle around
  altGain: 0.15,            // start angle change (degrees) per metre above or below it
  swingReach: 45,          // how far a building can be from the ideal pivot
  swingTurn: 2.2,          // rad/s the swing plane turns toward the wanted heading
  swingSideDamp: 7.2,        // 1/s, sideways velocity relative to the heading dies this fast
  swingTerminal: 116,       // lighter drag on a swing than in a plain fall
  cruiseSpeed: 40,         // the pump pushes toward this through the bottom of each arc
  pumpAccel: 28.5,
  pumpCone: 60,            // degrees either side of the bottom where the pump works
  groundClear: 2.2,        // the bottom of an arc stays this far over the ground
  releaseAngle: 25,        // auto release when holding: this far past the bottom, rising
  releaseBoost: 7,
  perfectMin: 25, perfectMax: 62,
  perfectBoost: 7,
  swingJumpFwd: 7,
  swingJumpUp: 9,
  chainDelay: 0.21,        // shortest flight between chained swings
  chainApexVy: 3.1,          // fire the next web once rising slower than this
  airTurn: 1.7,            // rad/s the velocity turns toward the wanted heading in the air
  airAccel: 7,             // m/s^2 toward the wanted heading when slow in the air
  wallRunKeep: 0.85,       // share of speed kept turning a swing into a wall run
  wallRunFriction: 4,
  // Aerodynamics. Body lift is the skydiver's "tracking": a lean turns the velocity without
  // changing its size. Glide is the web-wing polar.
  bodyLift: 0.0045,
  bodyLiftMax: 10,
  glideCl: 0.049,
  glideRatio: 3.5,
  glideStall: 9,
  // Ground and walls (all of these are pushes against a real surface).
  runSpeed: 9,
  parkourSpeed: 14,
  groundAccel: 40,
  rollDecel: 15,
  jumpSpeed: 9.5,
  wallFriction: 12,
  wallRunSpeed: 9,
  wallCrawlSpeed: 3,
  wallJumpOut: 8,
  wallJumpUp: 6,
  launchSpeed: 16,
  launchWindow: 0.4,
  hardLanding: 18,
};

export const tune = { ...DEFAULTS };

export function resetTune() { Object.assign(tune, DEFAULTS); }
