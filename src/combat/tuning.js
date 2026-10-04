// Every combat number (spec 2026-10-02, sections 1.1 to 1.8). Tags: PUB published by Insomniac,
// COMM guides and community, REF another game's published number, EST our estimate. Tune here only.
export const TUNE = {
  // Enemy rules
  tokenRepick: 0.25, tokenFar: 6, tokenCloser: 2,          // PUB rule (job stealing), EST numbers
  rangedSlots: { friendly: 1, amazing: 1, spectacular: 2, ultimate: 3 },
  offscreenDelay: 0.6,                                      // PUB rule, EST value
  dodgeHold: 1.0,                                           // PUB rule (idle timer), EST value
  sameMoveLimit: 3,                                         // PUB (beat to the punch)
  airSafe: 1.5,                                             // PUB/COMM
  // Telegraphs (EST)
  windupLight: 0.6, windupHeavy: 0.9, redWindow: 0.12, sniperLaser: 1.5, rifleEvery: [3.0, 4.0],
  // Dodge (EST; cancel rule PUB)
  dodgeTime: 0.45, dodgeIframes: 0.25, dodgeDist: 3.5,
  perfectStun: 1.5, perfectScale: 0.3, perfectSlow: 0.9, perfectRamp: 0.15,
  // Ground string (EST; buffer REF Smash 167 ms)
  lightTime: 0.33, lightImpact: 0.11, enderTime: 0.5, enderPush: 4,
  chainFrom: 0.55, buffer: 0.3,                             // fix spec A2 (was 0.15; Arkham queues generously)
  closeBand: 1.5, lungeBand: 4, strikeBand: 18, airBand: 1.5, wallBand: 2,
  contactGap: 1.0, warpClamp: 4, faceBy: 0.3,
  comboReset: 3.5,                                          // PUB-adjacent rule, EST time
  // Launcher and air (EST)
  launchHold: 0.3, launchHeight: 3.5, followWindow: 0.25,
  airHitTime: 0.27, airKeep: 0.6, slamSplash: 3,
  // Web strike (EST)
  strikeSpeed: 30, strikeStop: 1.2, rebound: 2.5,
  // Webs as crowd control (spec 1.6): shots to cocoon a thug (COMM), cartridge capacity and refill
  // (EST), the throw of a webbed enemy, and a webbed rocket sent back.
  webShots: 6, webCap: 6, webRefill: 1.5, throwSpeed: 16, throwLift: 5, throwReach: 6, rocketBack: 34,
  // Hitstop in seconds (REF Capcom 67 to 167 ms, Smash hitlag), on the attacker and victim only
  stop: { light: 0.05, ender: 0.08, launcher: 0.08, counter: 0.1, finisher: 0.14 }, stopCap: 0.15,
  shake: 0.04, shakeHero: 0.4,
  // Camera
  camKick: 0.06, fovPunch: 2,
};
