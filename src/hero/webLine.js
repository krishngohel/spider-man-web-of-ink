import * as THREE from 'three';
import { PALETTE } from '../render/palette.js';

// The web strand: thin cylinders from the web hand through every wrap pivot to the anchor, plus
// the strand in flight while a shot travels. On the main layer, so the ink pass outlines it.

const MAX = 7;
const Y = new THREE.Vector3(0, 1, 0);
const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();

export function createWebLine(scene) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: PALETTE.web });
  const segs = [];
  for (let i = 0; i < MAX; i++) {
    const s = new THREE.Mesh(geo, mat);
    s.visible = false;
    s.frustumCulled = false;
    scene.add(s);
    segs.push(s);
  }
  let used = 0;
  function seg(p, q, width) {
    if (used >= MAX) return;
    const s = segs[used++];
    d.subVectors(q, p);
    const len = d.length();
    if (len < 1e-3) { s.visible = false; return; }
    s.visible = true;
    s.position.copy(p).addScaledVector(d, 0.5);
    s.quaternion.setFromUnitVectors(Y, d.divideScalar(len));
    s.scale.set(width, len, width);
  }
  return {
    // hand: world position of the web hand. swing: the swing line (strand to where it sticks).
    // rope: the zip line, pivots anchor first. pending: a shot in flight { anchor, t } with t
    // counting down from `travel`.
    update(hand, swing, rope, pending, travel) {
      used = 0;
      const line = swing.active ? swing.rope : rope.active ? rope : null;
      if (line && line.pivots.length) {
        // The hand hangs from the last pivot; walk back through any wraps to the anchor.
        a.copy(hand);
        for (let i = line.pivots.length - 1; i >= 0; i--) {
          const p = line.pivots[i];
          b.set(p.x, p.y, p.z);
          seg(a, b, 0.028);
          a.copy(b);
        }
      } else if (pending) {
        const k = 1 - Math.max(0, pending.t) / (pending.travel ?? travel);
        b.set(pending.anchor.x, pending.anchor.y, pending.anchor.z);
        a.copy(hand);
        seg(a, b.sub(a).multiplyScalar(k).add(a), 0.024);
      }
      for (let i = used; i < MAX; i++) segs[i].visible = false;
    },
  };
}
