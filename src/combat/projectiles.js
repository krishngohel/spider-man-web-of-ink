import * as THREE from 'three';
import { comicToon } from '../render/comicShade.js';
import { PALETTE } from '../render/palette.js';

// Projectiles: enemy bullets and rockets (visible, so a dodge can beat them) and the hero's web
// shots. Simple straight flight with a sphere test against the hero, the enemies and the city.

const SPEED = { bullet: 70, rocket: 28, web: 75, mine: 0 };

export function createProjectiles(scene, world) {
  const list = [];
  const geo = {
    bullet: new THREE.CapsuleGeometry(0.05, 0.5, 2, 6).rotateX(Math.PI / 2),
    rocket: new THREE.CapsuleGeometry(0.12, 0.6, 3, 8).rotateX(Math.PI / 2),
    web: new THREE.IcosahedronGeometry(0.22, 1),
  };
  const mat = {
    bullet: new THREE.MeshBasicMaterial({ color: 0xffe08a }),
    rocket: comicToon({ color: 0x5a6a4a }),
    web: comicToon({ color: PALETTE.web }),
  };
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.6 });
  // The gunner's aim: a thin red laser from the gun to the target while winding up.
  const lasers = new Map();
  const laserMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.75 });
  const laserGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4).translate(0, 0.5, 0).rotateX(Math.PI / 2);

  function fire(kind, from, to, { dmg = 6, owner = 'enemy', target = null, aoe = 0, gadget = null, shooter = null } = {}) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, d = Math.hypot(dx, dy, dz) || 1;
    const s = SPEED[kind];
    const mesh = new THREE.Mesh(geo[kind], mat[kind]);
    mesh.position.set(from.x, from.y, from.z);
    mesh.lookAt(to.x, to.y, to.z);
    scene.add(mesh);
    let trail = null;
    if (kind === 'rocket') { trail = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), trailMat); scene.add(trail); }
    const p = { kind, x: from.x, y: from.y, z: from.z, vx: (dx / d) * s, vy: (dy / d) * s, vz: (dz / d) * s, dmg, owner, target, aoe, gadget, shooter, life: 3, mesh, trail };
    if (gadget === 'webBomb') { p.vy += 4; p.grav = 12; }
    list.push(p);
    return p;
  }

  function kill(p) { scene.remove(p.mesh); if (p.trail) scene.remove(p.trail); list.splice(list.indexOf(p), 1); }

  // hits: { hero(p) -> bool (true if the hero was hit), enemy(e, p), explode(x, y, z, p), enemies }
  function step(dt, hits) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.grav) p.vy -= p.grav * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      const seg = Math.hypot(nx - p.x, ny - p.y, nz - p.z) || 1;
      // The city stops everything.
      const wall = world.raycast(p.x, p.y, p.z, (nx - p.x) / seg, (ny - p.y) / seg, (nz - p.z) / seg, seg, { ground: true });
      let done = false;
      if (p.owner === 'enemy') {
        if (hits.hero(p, nx, ny, nz)) done = true;
      } else {
        // A web shot that meets a rocket in flight catches it and slings it back at whoever fired it.
        if (p.kind === 'web' && !p.gadget) {
          for (const r of list) {
            if (r.kind !== 'rocket' || r.owner !== 'enemy') continue;
            if (Math.hypot(r.x - nx, r.y - ny, r.z - nz) > 1.4) continue;
            const s = r.shooter?.body?.p;
            const tx = s ? s.x - r.x : -r.vx, ty = s ? s.y + 0.4 - r.y : -r.vy, tz = s ? s.z - r.z : -r.vz;
            const l = Math.hypot(tx, ty, tz) || 1;
            r.owner = 'hero'; r.aoe = 3.5; r.dmg = Math.max(r.dmg, 20); r.life = 3;
            r.vx = (tx / l) * (hits.rocketBack ?? 34); r.vy = (ty / l) * (hits.rocketBack ?? 34); r.vz = (tz / l) * (hits.rocketBack ?? 34);
            r.mesh.lookAt(r.x + r.vx, r.y + r.vy, r.z + r.vz);
            hits.rocketReturned?.(r);
            done = true;
            break;
          }
        }
        if (!done) for (const e of hits.enemies) {
          if (!hits.canHit(e)) continue;
          const b = e.body.p;
          // Closest approach of this step's segment to the enemy's middle.
          const t = Math.max(0, Math.min(1, ((b.x - p.x) * (nx - p.x) + (b.y + 0.3 - p.y) * (ny - p.y) + (b.z - p.z) * (nz - p.z)) / (seg * seg)));
          const cx = p.x + (nx - p.x) * t, cy = p.y + (ny - p.y) * t, cz = p.z + (nz - p.z) * t;
          if (Math.hypot(cx - b.x, cy - (b.y + 0.3), cz - b.z) < 0.75) { hits.enemy(e, p); done = true; break; }
        }
      }
      if (!done && wall) {
        if (p.kind === 'rocket' || p.aoe > 0) hits.explode(wall.x, wall.y, wall.z, p);
        else if (p.kind === 'web') hits.webWall?.(wall, p);
        done = true;
      }
      if (done || p.life <= 0) { if (p.kind === 'rocket' && !wall && p.life > 0) hits.explode(nx, ny, nz, p); kill(p); continue; }
      p.x = nx; p.y = ny; p.z = nz;
      p.mesh.position.set(nx, ny, nz);
      if (p.kind === 'web') p.mesh.rotation.x += dt * 12;
      if (p.trail) { p.trail.position.set(nx - p.vx * 0.03, ny - p.vy * 0.03, nz - p.vz * 0.03); p.trail.scale.setScalar(0.8 + Math.random() * 0.5); }
    }
  }

  return {
    list,
    fire,
    step,
    clear() { while (list.length) kill(list[0]); for (const l of lasers.values()) scene.remove(l); lasers.clear(); },
    // Show or move the aim laser for an enemy (id) from a point to a point; null hides it.
    laser(id, from, to) {
      let l = lasers.get(id);
      if (!from) { if (l) { scene.remove(l); lasers.delete(id); } return; }
      if (!l) { l = new THREE.Mesh(laserGeo, laserMat); scene.add(l); lasers.set(id, l); }
      const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      l.position.set(from.x, from.y, from.z);
      l.lookAt(to.x, to.y, to.z);
      l.scale.set(1, 1, d);
    },
  };
}
