// The pose library. A pose is a flat vector so poses can be blended and sprung number by number.
// Model space: +x is the character's LEFT, +y up, +z forward. Hand targets are offsets from the
// shoulder joint in the chest frame (arm length about 0.49 m); foot targets are offsets from the hip
// joint in the pelvis frame (leg length about 0.88 m). Poles point where the elbow / knee should
// bend toward. Angles in radians.

export const LAYOUT = {
  spine: 0,      // pitch (crunch forward +), roll (lean left +), yaw (twist left +)
  head: 3,       // pitch (down +), yaw (left +)
  handL: 5,      // x, y, z, poleX, poleY, poleZ
  handR: 11,
  footL: 17,     // x, y, z, kneePoleX, kneePoleY, kneePoleZ
  footR: 23,
  fingersL: 29,  // index, middle, ring, pinky, thumb curl (0 straight, 1 full curl)
  fingersR: 34,
  wrist: 39,     // L, R (bend back +)
  toe: 41,       // L, R (point +)
  drop: 43,      // lowers the whole body (m): crouches and landings
  SIZE: 44,
};

export const GRIPS = {
  open: [0.08, 0.08, 0.1, 0.12, 0.05],
  relaxed: [0.35, 0.42, 0.5, 0.55, 0.25],
  fist: [1, 1, 1, 1, 0.9],
  thwip: [0, 1, 1, 0, 0.7],     // middle and ring folded onto the palm, index and pinky out
  grab: [0.62, 0.66, 0.7, 0.72, 0.6],
};

// Builds a pose vector from named parts. Anything left out takes the neutral value.
export function pose({
  spine = [0, 0, 0], head = [0, 0],
  hl = [0.03, -0.47, 0.06], el = [0.3, 0, -1],
  hr = [-0.03, -0.47, 0.06], er = [-0.3, 0, -1],
  fl = [0.02, -0.86, 0.04], kl = [0.1, 0, 1],
  fr = [-0.02, -0.86, 0.04], kr = [-0.1, 0, 1],
  gl = 'relaxed', gr = 'relaxed',
  wrist = [0, 0], toe = [0.15, 0.15], drop = 0,
} = {}) {
  const p = new Float32Array(LAYOUT.SIZE);
  p.set(spine, 0); p.set(head, 3);
  p.set(hl, 5); p.set(el, 8); p.set(hr, 11); p.set(er, 14);
  p.set(fl, 17); p.set(kl, 20); p.set(fr, 23); p.set(kr, 26);
  p.set(typeof gl === 'string' ? GRIPS[gl] : gl, 29);
  p.set(typeof gr === 'string' ? GRIPS[gr] : gr, 34);
  p.set(wrist, 39); p.set(toe, 41); p[43] = drop;
  return p;
}

// Left-right mirror (swap the sides, flip x, flip roll and yaw).
export function mirror(p, out = new Float32Array(LAYOUT.SIZE)) {
  out[0] = p[0]; out[1] = -p[1]; out[2] = -p[2];
  out[3] = p[3]; out[4] = -p[4];
  const swap = (a, b) => { for (let i = 0; i < 6; i++) { out[a + i] = p[b + i] * (i % 3 === 0 ? -1 : 1); out[b + i] = p[a + i] * (i % 3 === 0 ? -1 : 1); } };
  swap(5, 11); swap(17, 23);
  for (let i = 0; i < 5; i++) { out[29 + i] = p[34 + i]; out[34 + i] = p[29 + i]; }
  out[39] = p[40]; out[40] = p[39]; out[41] = p[42]; out[42] = p[41]; out[43] = p[43];
  return out;
}

export function lerpPose(a, b, t, out = new Float32Array(LAYOUT.SIZE)) {
  for (let i = 0; i < LAYOUT.SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

// Swing poses are authored for the RIGHT hand on the web; mirror() gives the left-hand set.
export const POSES = {
  // Standing tall in the air, arms loose.
  // Freefall between webs: back a little arched, arms out and bent, one knee up, never stiff.
  air: pose({
    spine: [-0.12, 0.06, 0.1], head: [-0.25, 0],
    hl: [0.38, 0.06, 0.06], el: [0.4, -1, -0.4], gl: 'open',
    hr: [-0.36, -0.08, 0.14], er: [-0.4, -1, -0.2], gr: 'relaxed',
    fl: [0.1, -0.56, 0.26], kl: [0.1, 0.1, 1], fr: [-0.06, -0.8, -0.14], kr: [0, 0, 1], toe: [0.6, 0.9],
  }),
  // Web just fired: right arm straight up toward the anchor (pinned by IK), left arm swept back,
  // legs together and trailing.
  reach: pose({
    spine: [-0.12, -0.08, 0.1], head: [-0.25, 0],
    hl: [0.18, -0.3, -0.32], el: [1, 0, 0], gl: 'open',
    hr: [0, 0.48, 0.05], gr: 'grab',
    fl: [0.05, -0.84, -0.18], kl: [0, 0, 1], fr: [-0.02, -0.82, -0.24], kr: [0, 0, 1], toe: [0.9, 0.9],
  }),
  // Dropping into the arc: legs swing forward a little, knees soften, free arm out for balance.
  drop: pose({
    spine: [0.05, -0.05, 0.05], head: [-0.1, 0],
    hl: [0.38, -0.2, 0.1], el: [0.5, 0, -1], gl: 'open',
    hr: [0, 0.48, 0.05], gr: 'grab',
    fl: [0.08, -0.72, 0.18], kl: [0, 0, 1], fr: [-0.06, -0.76, 0.1], kr: [0, 0, 1], toe: [0.7, 0.7],
  }),
  // Bottom of the arc: knees pulled up to the chest, body crunched, free arm in.
  bottom: pose({
    spine: [0.38, 0, 0], head: [0.1, 0],
    hl: [0.16, -0.18, 0.34], el: [1, -0.3, -0.2], gl: 'fist',
    hr: [0, 0.48, 0.05], gr: 'grab',
    fl: [0.12, -0.32, 0.42], kl: [0.1, 0.2, 1], fr: [-0.1, -0.36, 0.38], kr: [-0.1, 0.2, 1], toe: [0.8, 0.8],
  }),
  // Rising out of the arc: legs kick forward and up, body leans back, free arm swings forward.
  rise: pose({
    spine: [-0.25, 0.05, -0.1], head: [-0.3, 0],
    hl: [0.2, 0.05, 0.4], el: [1, 0, 0], gl: 'open',
    hr: [0, 0.48, 0.05], gr: 'grab',
    fl: [0.1, -0.55, 0.62], kl: [0, 0.5, 1], fr: [-0.06, -0.66, 0.52], kr: [0, 0.5, 1], toe: [0.9, 0.9],
  }),
  // Swing variants (alternate between swings).
  // B: one knee up, the other leg kicked back (a runner's split through the bottom).
  bottomSplit: pose({
    spine: [0.3, 0.05, 0.1], head: [0.05, 0],
    hl: [0.3, -0.12, 0.25], el: [1, -0.4, -0.2], gl: 'open',
    hr: [0, 0.48, 0.05], gr: 'grab',
    fl: [0.12, -0.38, 0.4], kl: [0.1, 0.2, 1], fr: [-0.08, -0.7, -0.38], kr: [0, -0.4, 1], toe: [0.8, 1.0],
  }),
  // B: scissor kick on the rise, legs split front and back, free arm thrown back.
  riseScissor: pose({
    spine: [-0.2, -0.05, -0.15], head: [-0.35, 0],
    hl: [0.3, -0.05, -0.32], el: [1, 0, 0], gl: 'open',
    hr: [0, 0.48, 0.05], gr: 'grab',
    fl: [0.1, -0.5, 0.66], kl: [0, 0.5, 1], fr: [-0.08, -0.72, -0.34], kr: [0, -0.3, 1], toe: [1, 1],
  }),
  // C: both legs swung wide to one side, body twisted.
  bottomWide: pose({
    spine: [0.32, 0.18, -0.2], head: [0.05, 0.2],
    hl: [0.42, -0.2, 0.05], el: [0.6, 0, -1], gl: 'open',
    hr: [0, 0.48, 0.05], gr: 'grab',
    fl: [0.3, -0.5, 0.3], kl: [0.4, 0.3, 1], fr: [0.12, -0.56, 0.28], kr: [0.4, 0.3, 1], toe: [0.8, 0.8],
  }),
  // Soaring between webs: arms swept back and a little out, legs long and together, back arched:
  // a body flying head first (the body is leaned along the flight path by the poser).
  soar: pose({
    spine: [-0.25, 0, 0], head: [-0.6, 0],
    hl: [0.28, -0.36, -0.22], el: [0.6, 0, -1], gl: 'open',
    hr: [-0.28, -0.36, -0.22], er: [-0.6, 0, -1], gr: 'open',
    fl: [0.06, -0.85, -0.12], kl: [0, 0, 1], fr: [-0.03, -0.8, -0.2], kr: [0, 0, 1], toe: [1.1, 1.1],
  }),
  // Getting ready to fire again: soaring with the web arm cocked forward.
  ready: pose({
    spine: [-0.1, -0.08, 0.1], head: [-0.45, 0],
    hl: [0.3, -0.3, -0.2], el: [0.6, 0, -1], gl: 'open',
    hr: [-0.12, 0.05, 0.42], er: [-1, -0.3, 0], gr: 'thwip', wrist: [0, 0.5],
    fl: [0.08, -0.8, -0.1], kl: [0, 0, 1], fr: [-0.04, -0.72, 0.06], kr: [0, 0, 1], toe: [1, 1],
  }),
  // Perched on a ledge after a zip, or crouched on a rooftop: deep squat, knees wide, one hand down.
  perch: pose({
    spine: [0.75, 0, 0.05], head: [-0.75, 0], drop: 0.55,
    hl: [0.18, -0.4, 0.3], el: [1, 0, 0], gl: 'open',
    hr: [-0.12, -0.45, 0.32], er: [-1, 0, 0], gr: 'open',
    fl: [0.24, -0.4, 0.2], kl: [0.6, 0.3, 1], fr: [-0.24, -0.4, 0.16], kr: [-0.6, 0.3, 1], toe: [-0.3, -0.3],
  }),
  // Tucked for a flip: knees to chest, hands on the shins.
  tuck: pose({
    spine: [0.6, 0, 0], head: [0.35, 0],
    hl: [0.12, -0.32, 0.36], el: [1, 0, 0], gl: 'fist',
    hr: [-0.12, -0.32, 0.36], er: [-1, 0, 0], gr: 'fist',
    fl: [0.1, -0.26, 0.4], kl: [0, 0.3, 1], fr: [-0.1, -0.26, 0.4], kr: [0, 0.3, 1], toe: [0.9, 0.9],
  }),
  // Skydiver spread: arms and legs wide, back arched.
  spread: pose({
    spine: [-0.3, 0, 0], head: [-0.35, 0],
    hl: [0.44, 0.12, -0.12], el: [0, 0, -1], gl: 'open',
    hr: [-0.44, 0.12, -0.12], er: [0, 0, -1], gr: 'open',
    fl: [0.28, -0.76, -0.24], kl: [0.3, 0, 1], fr: [-0.28, -0.76, -0.24], kr: [-0.3, 0, 1], toe: [1, 1],
  }),
  // Streamlined dive: arms swept back along the body, legs straight and together.
  dive: pose({
    spine: [-0.1, 0, 0], head: [-0.5, 0],
    hl: [0.16, -0.42, -0.18], el: [1, 0, 0], gl: 'open',
    hr: [-0.16, -0.42, -0.18], er: [-1, 0, 0], gr: 'open',
    fl: [0.02, -0.87, -0.06], kl: [0, 0, 1], fr: [-0.02, -0.87, -0.06], kr: [0, 0, 1], toe: [1.2, 1.2],
  }),
  // Web wings: arms straight out, legs a little apart.
  wings: pose({
    spine: [-0.2, 0, 0], head: [-0.4, 0],
    hl: [0.48, 0.04, -0.06], el: [0, 0, -1], gl: 'open',
    hr: [-0.48, 0.04, -0.06], er: [0, 0, -1], gr: 'open',
    fl: [0.18, -0.84, -0.12], kl: [0, 0, 1], fr: [-0.18, -0.84, -0.12], kr: [0, 0, 1], toe: [1, 1],
  }),
  // Firing a web with the right hand: arm out straight at the target (pinned by IK), wrist bent
  // back, the thwip sign; the other arm braced across.
  thwip: pose({
    spine: [0, -0.1, 0.15], head: [-0.2, 0],
    hl: [-0.05, -0.2, 0.3], el: [1, 0, -0.2], gl: 'fist',
    hr: [0, 0.3, 0.38], gr: 'thwip', wrist: [0, 0.9],
    fl: [0.06, -0.78, 0.1], kl: [0, 0, 1], fr: [-0.04, -0.82, -0.1], kr: [0, 0, 1], toe: [0.6, 0.6],
  }),
  // Zip: both arms pulling up the line, knees tucked.
  zip: pose({
    spine: [0.15, 0, 0], head: [-0.4, 0],
    hl: [0.03, 0.45, 0.12], gl: 'grab', hr: [-0.03, 0.45, 0.12], gr: 'grab',
    fl: [0.1, -0.5, 0.25], kl: [0, 0.2, 1], fr: [-0.1, -0.56, 0.18], kr: [0, 0.2, 1], toe: [0.8, 0.8],
  }),
  // Hanging on the line: right hand high on it (pinned by IK), left hand gripping just below, body
  // long, legs together and a little crossed.
  hang: pose({
    spine: [0.04, 0, 0.05], head: [-0.12, 0.1],
    hl: [0.02, 0.4, 0.12], el: [1, 0, 0.2], gl: 'grab',
    hr: [-0.03, 0.47, 0.04], er: [-1, 0, 0.2], gr: 'grab', wrist: [0.2, 0.2],
    fl: [0.03, -0.85, 0.06], kl: [0, 0, 1], fr: [-0.09, -0.8, 0.14], kr: [0, 0, 1], toe: [0.55, 0.45],
  }),
  // Upside down on the line (the classic): the web runs from the feet, one leg straight up the
  // line, the other hooked round it, arms hanging loose past the head.
  hangInv: pose({
    spine: [-0.08, 0, 0], head: [0.15, 0],
    hl: [0.16, 0.36, 0.14], el: [1, 0, 0.3], gl: 'relaxed',
    hr: [-0.1, 0.4, 0.2], er: [-1, 0, 0.3], gr: 'relaxed',
    fl: [0.0, -0.87, 0.02], kl: [0, 0, 1], fr: [0.06, -0.52, -0.3], kr: [-0.4, 0, -1], toe: [0.9, 0.7],
  }),
  // Mantle: both hands planted on the roof edge in front, pushing down, knees tucked up through.
  mantle: pose({
    spine: [0.5, 0, 0], head: [-0.45, 0],
    hl: [0.14, -0.3, 0.32], el: [0.6, 0, -1], gl: 'open', wrist: [0.9, 0.9],
    hr: [-0.14, -0.3, 0.32], er: [-0.6, 0, -1], gr: 'open',
    fl: [0.12, -0.42, 0.38], kl: [0.1, 0.3, 1], fr: [-0.12, -0.5, 0.3], kr: [-0.1, 0.3, 1], toe: [0.5, 0.5],
  }),
  // Superhero landing: crouched low, right knee down, right fist on the ground, left arm out.
  land: pose({
    spine: [0.95, 0, -0.2], head: [-0.85, 0], drop: 0.6,
    hl: [0.44, 0.0, -0.18], el: [0, 0, -1], gl: 'open',
    hr: [-0.06, -0.45, 0.25], er: [-1, 0, 0], gr: 'fist',
    fl: [0.12, -0.42, 0.4], kl: [0.25, 0.3, 1], fr: [-0.12, -0.38, -0.52], kr: [0, -1, 0.3], toe: [-0.2, 1.0],
  }),
};

// Pose name -> the mirrored (left-hand) version, built once.
export const MIRRORED = Object.fromEntries(Object.entries(POSES).map(([k, v]) => [k, mirror(v)]));
