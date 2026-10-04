import * as THREE from 'three';

// The city's car: a sedan drawn as a side profile (hood, windscreen, roof, rear window, trunk and
// wheel arches) extruded across its width with rounded edges, a glass cabin under a body-coloured
// roof, bumpers, lights and wheels with hubcaps. Shared by the parked cars and the traffic.
// Returns [geometry, colour] parts; 0xffffff parts take the instance colour (the paint).
// Same footprint as the old box car: 1.8 m wide, 4.4 m long, wheels at z = +-1.35.

const PAINT = 0xffffff, GLASS = 0x2f4e6e, TRIM = 0x2a2c32, TYRE = 0x1d1d22, HUB = 0xb8bcc4;

// A profile in (z along the car, y up) extruded across x, centred on x = 0.
function extrudeProfile(pts, width, bevel) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 4 });
  // Shape x is the car's length: turn it onto world z and centre the width on x = 0.
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

export function carParts() {
  const parts = [];
  // The body: profile with both arches cut in by walking under them.
  const outline = [];
  const arch = (cz) => {
    for (let i = 0; i <= 5; i++) {
      const a = 0.12 + (Math.PI - 0.24) * (i / 5); // front of the arch to the back, over the top
      outline.push([cz + Math.cos(a) * 0.47, 0.37 + Math.sin(a) * 0.47]);
    }
  };
  outline.push([-2.12, 0.42], [-2.08, 0.9], [-1.7, 0.98], [-1.0, 1.0]);  // tail and trunk
  outline.push([0.9, 0.98], [1.9, 0.86], [2.13, 0.64], [2.1, 0.34]);     // hood and nose
  outline.push([1.82, 0.3]);
  arch(1.35);
  outline.push([-0.88, 0.3]);
  arch(-1.35);
  outline.push([-1.82, 0.3]);
  parts.push([extrudeProfile(outline, 1.8, 0.08), PAINT]);
  // The cabin in glass, and the roof and pillars over it in paint.
  parts.push([extrudeProfile([[-1.05, 0.96], [0.98, 0.96], [0.36, 1.44], [-0.62, 1.44]], 1.56, 0.05), GLASS]);
  parts.push([extrudeProfile([[-0.66, 1.42], [0.4, 1.42], [0.37, 1.5], [-0.62, 1.5]], 1.6, 0.04), PAINT]);
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // Bumpers, grille and lights.
  parts.push([box(1.84, 0.16, 0.16, 0, 0.42, 2.14), TRIM]);
  parts.push([box(1.84, 0.16, 0.16, 0, 0.44, -2.14), TRIM]);
  parts.push([box(0.8, 0.16, 0.05, 0, 0.66, 2.14), TRIM]);
  for (const x of [-0.62, 0.62]) {
    parts.push([box(0.36, 0.14, 0.05, x, 0.7, 2.13), 0xfff3c4]);
    parts.push([box(0.34, 0.14, 0.05, x, 0.76, -2.12), 0xd8392b]);
  }
  // Wheels: a tyre and a hubcap a hair outside it.
  for (const [x, z] of [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.35], [0.82, -1.35]]) {
    parts.push([new THREE.CylinderGeometry(0.36, 0.36, 0.26, 9, 1, true).rotateZ(Math.PI / 2).translate(x, 0.37, z), TYRE]);
    // The wheel's outer face (dark) with the hubcap on it; the inner side faces the car and is never seen.
    parts.push([new THREE.CircleGeometry(0.36, 9).rotateY(Math.sign(x) * Math.PI / 2).translate(x + Math.sign(x) * 0.13, 0.37, z), TYRE]);
    parts.push([new THREE.CircleGeometry(0.21, 7).rotateY(Math.sign(x) * Math.PI / 2).translate(x + Math.sign(x) * 0.14, 0.37, z), HUB]);
  }
  return parts;
}
