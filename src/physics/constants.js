// Every physical constant in the game. `tune` is the live copy the dev panel edits; the physics
// reads from `tune`, so a slider takes effect on the next step. Units: metres, seconds, kg, N.

export const G = { comic: 19.62, real: 9.81 };
export const STEP = 1 / 240;
export const MAX_SUBSTEPS = 8;

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
