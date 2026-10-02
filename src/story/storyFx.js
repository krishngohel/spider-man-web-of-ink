import * as THREE from 'three';
import { comicToon } from '../render/comicShade.js';
import { LAYER_FX } from '../render/layers.js';

// Story effects: the web tether for yanks on a boss, Shocker's vibro blast, the Kingpin's
// helicopter with its rope ladder, and the mission marker (an inked beacon).

export function createStoryFx(scene) {
  const fxs = [];

  // A web line between two moving points (hand to boss) while a tug lasts.
  const tetherGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const tether = new THREE.Line(tetherGeo, new THREE.LineBasicMaterial({ color: 0xf2f2f4 }));
  tether.visible = false;
  tether.frustumCulled = false;
  scene.add(tether);

  // Vibro blast: rings racing along a line, growing and fading.
  const ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 28);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf2d060, transparent: true, opacity: 0.85, depthWrite: false });
  function blast(from, dir, len = 30) {
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(ringGeo, ringMat.clone());
      m.layers.set(LAYER_FX);
      m.position.set(from.x, from.y, from.z);
      m.lookAt(from.x + dir.x, from.y + dir.y, from.z + dir.z);
      scene.add(m);
      fxs.push({ m, t: -i * 0.05, life: 0.5, from: { ...from }, dir: { ...dir }, len, kind: 'blast' });
    }
  }
  // A ground shock ring (quakes, landings, stomps).
  function shock(p, r = 6) {
    const m = new THREE.Mesh(ringGeo, ringMat.clone());
    m.layers.set(LAYER_FX);
    m.rotation.x = Math.PI / 2;
    m.position.set(p.x, p.y + 0.15, p.z);
    scene.add(m);
    fxs.push({ m, t: 0, life: 0.45, r, kind: 'shock' });
  }

  function update(dt) {
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i];
      f.t += dt;
      const k = Math.max(0, f.t / f.life);
      if (f.kind === 'blast') {
        f.m.visible = f.t >= 0;
        f.m.position.set(f.from.x + f.dir.x * f.len * k, f.from.y + f.dir.y * f.len * k, f.from.z + f.dir.z * f.len * k);
        f.m.scale.setScalar(0.4 + k * 2.6);
      } else f.m.scale.setScalar(0.5 + k * f.r);
      f.m.material.opacity = 0.85 * (1 - k);
      if (f.t > f.life) { scene.remove(f.m); f.m.material.dispose(); fxs.splice(i, 1); }
    }
  }

  return {
    blast, shock, update,
    tether(a, b) {
      if (!a) { tether.visible = false; return; }
      tether.visible = true;
      tetherGeo.attributes.position.setXYZ(0, a.x, a.y, a.z);
      tetherGeo.attributes.position.setXYZ(1, b.x, b.y, b.z);
      tetherGeo.attributes.position.needsUpdate = true;
    },
    clear() { for (const f of fxs) { scene.remove(f.m); f.m.material.dispose(); } fxs.length = 0; tether.visible = false; },
  };
}

// The Kingpin's helicopter: hull, tail, two rotors and a rope ladder hanging from the door.
export function buildHelicopter(scene) {
  const g = new THREE.Group();
  const dark = comicToon({ color: 0x1c1d22 }), trim = comicToon({ color: 0x6a2a6a }), glass = comicToon({ color: 0x8ab0c8 });
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 3.4, 6, 12), dark);
  hull.rotation.z = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  nose.rotation.z = -Math.PI / 2; nose.position.x = 2.4; nose.position.y = 0.2;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.5, 0.5), dark); tail.position.set(-4.6, 0.5, 0);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.15), trim); fin.position.set(-7.1, 1.1, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 3.05), trim); stripe.position.y = -0.4;
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.4), dark); rotor.position.y = 1.85;
  const rotor2 = rotor.clone(); rotor2.rotation.y = Math.PI / 2;
  const hub = new THREE.Group(); hub.add(rotor, rotor2);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.25), dark); tailRotor.position.set(-7.2, 1.1, 0.25);
  const skid = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 0.12), dark);
  const s1 = skid.clone(); s1.position.set(0, -1.75, 1.1); const s2 = skid.clone(); s2.position.set(0, -1.75, -1.1);
  g.add(hull, nose, tail, fin, stripe, hub, tailRotor, s1, s2);
  // The ladder: two ropes and rungs, hanging 14 m.
  const ladder = new THREE.Group();
  const ropeMat = comicToon({ color: 0xc8b890 });
  for (const z of [-0.3, 0.3]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 14, 4), ropeMat); r.position.set(0, -7, z); ladder.add(r); }
  for (let y = 0.6; y < 14; y += 0.45) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.62), ropeMat); r.position.set(0, -y, 0); ladder.add(r); }
  ladder.position.set(0.4, -1.6, 1.4);
  g.add(ladder);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return {
    group: g, ladder, length: 14,
    update(dt, t) { hub.rotation.y += dt * 28; tailRotor.rotation.z += dt * 40; ladder.rotation.x = Math.sin(t * 1.3) * 0.05; },
    dispose() { scene.remove(g); g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); },
  };
}

// The mission marker: a tall inked beacon and a ring on the ground, pulsing.
export function buildMarker(scene) {
  const g = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xf7e36a, transparent: true, opacity: 0.35, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 120, 16, 1, true), beamMat);
  beam.position.y = 60;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.25, 6, 32), new THREE.MeshBasicMaterial({ color: 0xf7e36a }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
  g.add(beam, ring);
  g.visible = false;
  scene.add(g);
  let t = 0;
  return {
    group: g,
    show(p) { g.visible = !!p; if (p) g.position.set(p.x, p.y - 0.9, p.z); },
    update(dt) { t += dt; ring.scale.setScalar(1 + Math.sin(t * 3) * 0.08); beamMat.opacity = 0.28 + Math.sin(t * 2) * 0.07; },
  };
}
