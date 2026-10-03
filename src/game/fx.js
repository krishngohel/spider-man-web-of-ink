import * as THREE from 'three';
import { PALETTE } from '../render/palette.js';

// World effects: web splats where a web sticks (a little spider-web rosette on the surface, fading
// once the hero lets go), and landing shock rings. Pooled: nothing is allocated per event.

function webTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.translate(s / 2, s / 2);
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  // Spokes.
  g.lineWidth = 4;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 58, Math.sin(a) * 58); g.stroke();
  }
  // Sagging rings between the spokes.
  g.lineWidth = 3;
  for (const r of [16, 30, 44]) {
    g.beginPath();
    for (let i = 0; i <= 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2, a2 = ((i + 0.5) / 9) * Math.PI * 2 + 0.2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.quadraticCurveTo(Math.cos(a2 - Math.PI / 9) * r * 0.82, Math.sin(a2 - Math.PI / 9) * r * 0.82, x, y);
    }
    g.stroke();
  }
  // A blob in the middle.
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFx(scene) {
  const tex = webTexture();
  const splatGeo = new THREE.PlaneGeometry(1, 1);
  const splats = [];
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, color: PALETTE.web });
    const m = new THREE.Mesh(splatGeo, mat);
    m.visible = false;
    m.renderOrder = 2;
    scene.add(m);
    splats.push({ mesh: m, life: 0, held: false, grow: 0 });
  }
  let next = 0;
  const ringGeo = new THREE.RingGeometry(0.8, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: PALETTE.paper, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(ringGeo, mat);
    m.visible = false;
    scene.add(m);
    rings.push({ mesh: m, t: 1 });
  }
  let ringNext = 0;
  // Area-attack warnings: an inked red ring that fills in until the blow lands.
  const warnGeo = new THREE.RingGeometry(0.9, 1, 48);
  warnGeo.rotateX(-Math.PI / 2);
  const fillGeo = new THREE.CircleGeometry(1, 48);
  fillGeo.rotateX(-Math.PI / 2);
  const warns = [];
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ color: 0xe8322a, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xe8322a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    ring.visible = fill.visible = false;
    ring.renderOrder = fill.renderOrder = 3;
    scene.add(ring, fill);
    warns.push({ ring, fill, t: 0, all: 1, on: false });
  }
  let warnNext = 0;
  // Comic dot bursts on a heavy hit (spec G9): a ring of fat dots flying out and shrinking.
  const BURST_N = 12;
  const bursts = [];
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#12101c'; g.lineWidth = 3; g.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_N * 3), 3));
    const mat = new THREE.PointsMaterial({ map: dotTex, color: 0xffe14d, size: 0.5, transparent: true, depthWrite: false, alphaTest: 0.3 });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false; pts.frustumCulled = false; pts.renderOrder = 4;
    scene.add(pts);
    bursts.push({ pts, t: 1, x: 0, y: 0, z: 0 });
  }
  let burstNext = 0;
  const n = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1);

  return {
    // A web stuck at (x, y, z) on a surface with outward normal (nx, ny, nz).
    splat(x, y, z2, nx = 0, ny = 0, nz = 1) {
      const s = splats[next];
      next = (next + 1) % splats.length;
      n.set(nx, ny, nz);
      if (n.lengthSq() < 0.5) n.set(0, 0, 1);
      s.mesh.position.set(x + nx * 0.03, y + ny * 0.03, z2 + nz * 0.03);
      s.mesh.quaternion.setFromUnitVectors(z, n.normalize());
      s.mesh.rotateZ(Math.random() * Math.PI * 2);
      s.mesh.visible = true;
      s.life = 1; s.held = true; s.grow = 0;
      for (const o of splats) if (o !== s) o.held = false;
    },
    // The hero let go of the current web: its splat starts fading.
    letGo() { for (const s of splats) s.held = false; },
    ring(x, y, z2, strength = 1) {
      const r = rings[ringNext];
      ringNext = (ringNext + 1) % rings.length;
      r.mesh.position.set(x, y + 0.05, z2);
      r.t = 0; r.strength = strength;
      r.mesh.visible = true;
    },
    burst(x, y, z2) {
      const b = bursts[burstNext];
      burstNext = (burstNext + 1) % bursts.length;
      b.x = x; b.y = y; b.z = z2; b.t = 0; b.pts.visible = true;
    },
    warn(x, y, z2, r, t) {
      const w = warns[warnNext];
      warnNext = (warnNext + 1) % warns.length;
      w.ring.position.set(x, y + 0.06, z2); w.fill.position.set(x, y + 0.05, z2);
      w.ring.scale.set(r, 1, r);
      w.r = r; w.t = 0; w.all = Math.max(0.2, t); w.on = true;
      w.ring.visible = w.fill.visible = true;
    },
    update(dt) {
      for (const b of bursts) {
        if (!b.pts.visible) continue;
        b.t += dt / 0.32;
        const k = 1 - (1 - Math.min(1, b.t)) ** 2, r = 0.4 + 1.6 * k;
        const pos = b.pts.geometry.attributes.position;
        for (let i = 0; i < BURST_N; i++) {
          const a = (i / BURST_N) * Math.PI * 2;
          pos.setXYZ(i, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r * 0.8, b.z + Math.sin(a * 2.0) * 0.2);
        }
        pos.needsUpdate = true;
        b.pts.material.size = 0.55 * (1 - Math.min(1, b.t)) + 0.05;
        if (b.t >= 1) b.pts.visible = false;
      }
      for (const w of warns) {
        if (!w.on) continue;
        w.t += dt;
        const k = Math.min(1, w.t / w.all);
        w.fill.scale.set(w.r * k, 1, w.r * k);
        w.ring.material.opacity = 0.6 + 0.4 * Math.sin(w.t * 20);
        if (w.t > w.all + 0.15) { w.on = false; w.ring.visible = w.fill.visible = false; }
      }
      for (const s of splats) {
        if (!s.mesh.visible) continue;
        s.grow = Math.min(1, s.grow + dt * 9);
        const size = 1.6 * (0.4 + 0.6 * s.grow);
        s.mesh.scale.set(size, size, 1);
        if (!s.held) s.life -= dt / 3;
        s.mesh.material.opacity = Math.max(0, Math.min(1, s.life * 1.5)) * 0.9;
        if (s.life <= 0) s.mesh.visible = false;
      }
      for (const r of rings) {
        if (!r.mesh.visible) continue;
        r.t += dt / 0.45;
        const k = 1 - (1 - Math.min(1, r.t)) ** 3;
        const sc = 0.5 + 3.5 * k * r.strength;
        r.mesh.scale.set(sc, 1, sc);
        r.mesh.material.opacity = (1 - Math.min(1, r.t)) * 0.8;
        if (r.t >= 1) r.mesh.visible = false;
      }
    },
  };
}
