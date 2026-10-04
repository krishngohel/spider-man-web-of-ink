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
  webMax: 75,
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
  // Swinging (Amazing Spider-Man style, spec 4.3 and 4.4): aimed webs on the real rope, plus
  // light assists. All of these are live sliders in the dev panel.
  cruiseSpeed: 30,         // the pump pushes toward this through the bottom of each arc
  pumpAccel: 9,
  pumpCone: 40,            // degrees either side of the bottom where the pump works
  groundClear: 2.2,        // the line shortens so the bottom of an arc stays this far over the ground
  releaseBoost: 1.5,       // letting go on the rise
  // The release window (PlayStation pass P1.3): late in the arc, as the legs swing up. Inside it
  // the flight carries a fifth more speed (at least perfectBoost) and lifts perfectUp.
  perfectMin: 30, perfectMax: 58,
  perfectBoost: 5, perfectMul: 0.2, perfectUp: 5,
  diveCarry: 4,            // a dive just before a swing carries this much more speed into it (m/s)
  zipBoostSpeed: 22, zipBoostUp: 6, zipBoosts: 2, // Q with nothing to zip to: a dash, twice per airtime
  swingJumpFwd: 6,
  swingJumpUp: 8,
  webSpeed: 600,           // m/s the web flies (on top of webTravel)
  airTurn: 1.1,            // rad/s the velocity turns toward the stick in the air
  airAccel: 6,             // m/s^2 toward the stick when slow in the air
  wallRunKeep: 0.85,       // share of speed kept turning a swing into a wall run
  wallRunFriction: 4,
  // Hanging on a web (the hang key): climb and slide along the line, sway, flip upside down.
  hangClimb: 5,            // m/s up the line
  hangSlide: 7,            // m/s down the line
  rappelSpeed: 18,         // m/s down the line holding dive
  hangSway: 6,             // m/s^2 sideways from the stick
  hangDamp: 1.4,           // 1/s: about critical damping for a 20 to 35 m line
  hangTop: 1.4,            // m: the shortest the line climbs to
  hangInvertAfter: 1,      // s of hanging nearly still (under 3 m/s) before flipping upside down
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
  jumpHold: 0.32,          // s: holding jump this long after take-off carries the hero higher
  jumpHoldLift: 0.8,       // share of gravity held off while it does
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
