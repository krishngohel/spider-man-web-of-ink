// Every combat number (spec 2026-10-02, sections 1.1 to 1.8). Tags: PUB published by Insomniac,
// COMM guides and community, REF another game's published number, EST our estimate. Tune here only.
export const TUNE = {
  // Enemy rules
  tokenRepick: 0.25, tokenFar: 6, tokenCloser: 2,          // PUB rule (job stealing), EST numbers
  rangedSlots: { friendly: 1, amazing: 2, spectacular: 2, ultimate: 3 },     // fix spec B6 (amazing was 1)
  // Melee slots (fix spec B6, toward Arkham: two fists at once on Amazing, the second windup at
  // least meleeGap after the first so one dodge can clear both) and the poise rule (B5).
  meleeSlots: { friendly: 1, amazing: 2, spectacular: 2, ultimate: 3 }, meleeGap: 0.35,
  poiseHits: 3, poiseWindow: 1.5, poiseTime: 1.0, circleDist: 3,
  cooldown: [0.15, 0.5],                                    // after a swing (fix spec B6, was 0.4 to 1.0)
  offscreenDelay: 0.6,                                      // PUB rule, EST value
  dodgeHold: 0.5,                                           // PUB rule (idle timer), fix spec B6 (was 1.0)
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
  webShots: 3, webCap: 6, webRefill: 1.5, throwSpeed: 16, throwLift: 5, throwReach: 6, rocketBack: 34,
  // Hitstop in seconds (REF Capcom 67 to 167 ms, Smash hitlag), on the attacker and victim only
  // Fix spec C9 (EST, was light 0.05 / ender 0.08 / cap 0.15): long enough to feel the contact.
  stop: { light: 0.07, round: 0.08, ender: 0.12, launcher: 0.1, counter: 0.12, finisher: 0.16 }, stopCap: 0.18,
  shake: 0.07, shakeHero: 0.6,
  // Camera
  // Combo moves (EST): the counter window after a dodge, the pause between string hits that means a
  // sweep, how long after a web hit a press means a web pull, the web blast's combo cost and reach.
  webHold: 6,                                               // seconds a ground cocoon holds mid-fight (pass P2.1)
  counterWindow: 0.45, pauseFrom: 0.3, pauseTo: 0.9, pullWindow: 1.5, blastCombo: 10, blastRadius: 7,
  camKick: 0.06, fovPunch: -1.5,                            // the field of view punches in (fix spec C9)
};
