import * as THREE from 'three';
import { solveTwoBone } from './limbIK.js';
import { COM_HEIGHT } from './model.js';

// Drives the hero model from the physics state: which clip plays, how the whole body is oriented
// (upright on the ground, along the web on a swing, flat against a wall, spread out in a glide),
// and the arm IK that keeps the web hand on the strand. Visual only: it never touches physics.

const CLIPS = ['Idle_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Loop', 'Jump_Land', 'Roll', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'A_TPose', 'NinjaJump_Idle_Loop'];
export const WALL_OFFSET = COM_HEIGHT - 0.4; // lifts the crawl pose off the wall to the capsule's face

const UP = new THREE.Vector3(0, 1, 0);
const u = new THREE.Vector3(), f = new THREE.Vector3(), r = new THREE.Vector3();
const m = new THREE.Matrix4(), qTarget = new THREE.Quaternion();
const target = new THREE.Vector3(), pole = new THREE.Vector3(), tmp = new THREE.Vector3();
const offTarget = new THREE.Vector3();

// Basis with the model's +y along `up` and +z along `fwd` (made perpendicular to up).
function basis(up, fwd, out) {
  u.copy(up).normalize();
  f.copy(fwd).addScaledVector(u, -fwd.dot(u));
  if (f.lengthSq() < 1e-6) f.set(0, 0, 1).addScaledVector(u, -u.z);
  f.normalize();
  r.crossVectors(u, f);
  m.makeBasis(r, u, f);
  return out.setFromRotationMatrix(m);
}

export function createPoser(heroModel) {
  const { root, orient, animator, bones } = heroModel;
  animator.prime(CLIPS);
  animator.play('Idle_Loop', { fade: 0 });
  let once = null, onceT = 0;
  let webHand = 'r';
  let wasRope = false;
  let ikW = 0;
  const vel = new THREE.Vector3();

  function play(name, opts) { if (!once) animator.play(name, opts); }

  return {
    get webHand() { return webHand; },
    handWorld(out) { return (webHand === 'r' ? bones.handR : bones.handL).getWorldPosition(out); },

    update(hero, dt, events) {
      const b = hero.body;
      root.position.set(b.p.x, b.p.y, b.p.z);
      vel.set(b.v.x, b.v.y, b.v.z);
      const speed = vel.length();
      const hs = Math.hypot(b.v.x, b.v.z);
      const st = hero.state;
      const roped = hero.rope.active && (st === 'swing' || st === 'zip');
      if (roped && !wasRope) webHand = webHand === 'r' ? 'l' : 'r';
      wasRope = roped;

      for (const e of events) {
        if (e.type === 'land') {
          if (e.hard && hs > 8) { once = 'Roll'; onceT = 0.55; animator.play('Roll', { once: true, fade: 0.05, timeScale: 1.3 }); }
          else if (e.impact > 6) { once = 'Jump_Land'; onceT = 0.3; animator.play('Jump_Land', { once: true, fade: 0.05, timeScale: 1.4 }); }
        }
      }
      if (once) { onceT -= dt; if (onceT <= 0 || st !== 'ground') once = null; }

      offTarget.set(0, 0, 0);
      switch (st) {
        case 'ground': {
          tmp.set(hero.facing.x, 0, hero.facing.z);
          basis(UP, tmp, qTarget);
          if (hs < 0.4) play('Idle_Loop');
          else if (hs < 10.5) play('Jog_Fwd_Loop', { timeScale: Math.max(0.6, hs / 6.5) });
          else play('Sprint_Loop', { timeScale: Math.max(0.8, hs / 11) });
          break;
        }
        case 'swing':
        case 'zip': {
          const p = hero.rope.pivot;
          if (p) {
            tmp.set(p.x - b.p.x, p.y - b.p.y, p.z - b.p.z);
            // Lean along the line, but not all the way: the body trails a little behind it.
            u.copy(tmp).normalize().lerp(UP, 0.25);
            basis(u, speed > 1 ? vel : tmp.set(hero.facing.x, 0, hero.facing.z), qTarget);
          }
          play(st === 'zip' ? 'NinjaJump_Idle_Loop' : 'Jump_Loop', { fade: 0.12 });
          break;
        }
        case 'wall': {
          // The crouch pose, rotated so its floor is the wall: model up = wall normal, facing up
          // the wall (or along it when crawling sideways).
          const nx = hero.wall.nx, nz = hero.wall.nz;
          tmp.set(nx, 0, nz);
          const side = b.v.x * -nz + b.v.z * nx;
          if (Math.abs(b.v.y) < 0.8 && Math.abs(side) > 0.8) f.set(-nz * Math.sign(side), 0, nx * Math.sign(side));
          else f.set(0, b.v.y < -0.8 ? -1 : 1, 0);
          basis(tmp, f.clone(), qTarget);
          offTarget.set(nx * WALL_OFFSET, 0, nz * WALL_OFFSET);
          const moving = Math.hypot(b.v.x, b.v.y, b.v.z) > 0.6;
          if (b.v.y > 4) play('Sprint_Loop', { timeScale: 1.1 });
          else play(moving ? 'Crouch_Fwd_Loop' : 'Crouch_Idle_Loop');
          break;
        }
        case 'glide': {
          // Flat, belly down, head along the flight path, arms out.
          tmp.set(0, -1, 0);
          basis(speed > 1 ? vel : UP, tmp, qTarget);
          play('A_TPose', { fade: 0.2 });
          break;
        }
        default: {
          // Falling: upright with a lean into the motion; a dive goes head first.
          if (hero.diving && speed > 8) {
            tmp.set(hero.facing.x, 0, hero.facing.z);
            basis(vel, tmp.negate().lerp(new THREE.Vector3(0, -1, 0), 0.2), qTarget);
          } else {
            u.set(b.v.x * 0.012, 1, b.v.z * 0.012);
            tmp.set(hero.facing.x, 0, hero.facing.z);
            basis(u, tmp, qTarget);
          }
          play('Jump_Loop', { fade: 0.15 });
        }
      }
      const k = 1 - Math.exp(-dt * (st === 'swing' ? 10 : 14));
      orient.quaternion.slerp(qTarget, k);
      orient.position.lerp(offTarget, 1 - Math.exp(-dt * 12));
      animator.update(dt);

      // Web arm: reach along the line toward the pivot.
      const wantIK = roped ? 1 : 0;
      ikW += (wantIK - ikW) * Math.min(1, dt * 14);
      if (ikW > 0.01 && hero.rope.pivot) {
        root.updateMatrixWorld(true);
        const p = hero.rope.pivot;
        target.set(p.x, p.y, p.z);
        const up = webHand === 'r' ? bones.upperarmR : bones.upperarmL;
        const lo = webHand === 'r' ? bones.lowerarmR : bones.lowerarmL;
        const hand = webHand === 'r' ? bones.handR : bones.handL;
        pole.set(-hero.facing.x, -0.5, -hero.facing.z);
        solveTwoBone(up, lo, hand, target, pole, ikW);
        if (st === 'zip') {
          const up2 = webHand === 'r' ? bones.upperarmL : bones.upperarmR;
          const lo2 = webHand === 'r' ? bones.lowerarmL : bones.lowerarmR;
          const hand2 = webHand === 'r' ? bones.handL : bones.handR;
          solveTwoBone(up2, lo2, hand2, target, pole, ikW);
        }
      }
    },
  };
}
