// The colour constants for the city, the suit and the comic print. A bright Silver Age day palette:
// primary colours, warm paper, and a single ink black.
export const PALETTE = {
  ink: 0x12101c,
  paper: 0xf5ecd4,
  suitRed: 0xd3232e,
  suitBlue: 0x1f4fb6,
  suitBlack: 0x0e0d16,
  lens: 0xf4f6fb,
  web: 0xf2f2f4,
  // Sky and air.
  skyTop: 0x3f8fe0,
  skyMid: 0x8cc4f2,
  skyHorizon: 0xf3dfb4,
  haze: 0xbcd6ea,
  sun: 0xfff1d6,
  // City.
  brick: 0xb4543c,
  sandstone: 0xd8bf8e,
  glass: 0x5f93c8,
  concrete: 0xa4a6a8,
  deco: 0x8a96a8,
  limestone: 0xe2d8c2,
  roof: 0x4d5562,
  waterTower: 0x8a5a3a,
  crane: 0xe8b52a,
  windowDark: 0x35557d,
  windowLit: 0xffd27a,
  awning: 0x2f8a5e,
  asphalt: 0x3b3f49,
  sidewalk: 0xb3ada0,
  laneMark: 0xf3e6b8,
  crosswalk: 0xe9e4d6,
  grass: 0x6aa84a,
  grassDark: 0x4f8a3a,
  path: 0xd9c9a2,
  trunk: 0x6b4a32,
  leaves: 0x3f8a3c,
  water: 0x2f74b8,
  pier: 0x8b6b4e,
};

export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
