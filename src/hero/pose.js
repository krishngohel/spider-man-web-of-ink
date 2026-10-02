import * as THREE from 'three';
import { COM_HEIGHT } from './model.js';
import { createBodyRig } from './bodyRig.js';
import { POSES, MIRRORED, LAYOUT, lerpPose } from './poses.js';

// Drives the hero model from the physics state. Two layers:
//  - On the ground and on walls, Quaternius clips (idle, jog, sprint, crawl) play on the mixer.
//  - In the air, a procedural body (bodyRig + poses.js) takes over: the swing is a blend of reach,
//    drop, bottom tuck and rising kick keyed to how far through the arc the hero is, with the web
//    hand pinned to the strand; releases throw flips and spins; firing a web snaps the arm out in
//    the thwip sign; falls spread, dive or streamline; hard landings crouch into a superhero
//    landing. Every pose number is sprung, so limbs follow through instead of snapping.
// The whole body is oriented by `orient` (along the web on a swing, upright in a fall, flat in a
// glide, head-first in a dive) with the trick rotations on top. Visual only: never touches physics.

const CLIPS = ['Idle_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Loop', 'Jump_Land', 'Roll', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop'];
export const WALL_OFFSET = COM_HEIGHT - 0.4; // lifts the crawl pose off the wall to the capsule's face

const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const u = new THREE.Vector3(), f = new THREE.Vector3(), r = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const m = new THREE.Matrix4(), qBase = new THREE.Quaternion(), qTrick = new THREE.Quaternion(), qTarget = new THREE.Quaternion();
const vel = new THREE.Vector3(), shoulder = new THREE.Vector3(), handTarget = new THREE.Vector3(), offTarget = new THREE.Vector3();

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

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Spring stiffness per pose group (1/s): legs lag behind the arms, which gives follow-through.
const STIFF = new Float32Array(LAYOUT.SIZE);
STIFF.fill(16);
for (let i = 0; i < 5; i++) STIFF[i] = 15;           // spine, head
for (let i = 5; i < 17; i++) STIFF[i] = 20;          // arms
for (let i = 17; i < 29; i++) STIFF[i] = 16;         // legs (a swing phase lasts about 0.3 s)
for (let i = 29; i < 39; i++) STIFF[i] = 26;         // fingers
STIFF[43] = 18;                                      // drop

const TRICKS = {
  frontflip: { axis: [1, 0, 0], turns: 1, dur: 0.7, tuck: 1 },
  backflip: { axis: [1, 0, 0], turns: -1, dur: 0.8, tuck: 1 },
  sideflip: { axis: [0, 0, 1], turns: 1, dur: 0.7, tuck: 0.6 },
  spin: { axis: [0, 1, 0], turns: 1, dur: 0.65, tuck: 0.3 },
  doubleflip: { axis: [1, 0, 0], turns: 2, dur: 1.0, tuck: 1 },
};

export function createPoser(heroModel) {
  const { root, orient, animator, model } = heroModel;
  animator.prime(CLIPS);
  animator.play('Idle_Loop', { fade: 0 });
  const rig = createBodyRig(model);
  const target = new Float32Array(LAYOUT.SIZE);
  const cur = new Float32Array(LAYOUT.SIZE);
  const curV = new Float32Array(LAYOUT.SIZE);
  const blendA = new Float32Array(LAYOUT.SIZE), blendB = new Float32Array(LAYOUT.SIZE);
  cur.set(POSES.air);
  let procW = 0;            // 0 = clips, 1 = procedural
  let webSide = 'r';
  let wasRope = false;
  let once = null, onceT = 0;
  let landT = 0;            // superhero landing hold
  let shot = null;          // { t, x, y, z } while a web shot animates
  let trick = null;         // { def, name, t }
  let lastTrick = '';
  let trickN = 0;
  let variant = 0;          // which swing pose set this swing uses (A, B, C)
  let lastHeading = 0, bank = 0, flutter = 0, perchT = 0, idleT = 0;
  let swings = 0;
  let inverted = false;
  let mantleT = 0;
  let lastAng = null;       // the swing angle last frame (for the pose lead)          // hands-on-the-edge pose while going over a ledge     // hanging upside down: the web runs from the feet
  const webWorld = new THREE.Vector3();
  const webHand = { side: 'r', world: webWorld };

  function sideOf(hero, x, z) {
    // Right of the facing (y up, right-handed): (-fz, fx).
    const fx = hero.facing.x, fz = hero.facing.z;
    return (x - hero.body.p.x) * -fz + (z - hero.body.p.z) * fx > 0 ? 'r' : 'l';
  }
  function startTrick(kind, hero) {
    const v = hero.body.v, sp = Math.hypot(v.x, v.y, v.z);
    if (sp < 14 && kind !== 'swingJump' && kind !== 'trick') { trick = null; return; }
    let name;
    if (kind === 'trick') name = ['frontflip', 'backflip', 'sideflip', 'spin', 'doubleflip'][trickN++ % 5];
    else if (kind === 'swingJump') name = v.y > 4 ? 'backflip' : 'frontflip';
    else if (kind === 'perfect') name = sp > 30 ? 'doubleflip' : 'frontflip';
    else {
      // Vary it, never the same one twice running, sometimes nothing.
      const pool = ['frontflip', 'spin', 'sideflip', 'none', 'frontflip', 'spin'];
      name = pool[(trickN++ * 7 + Math.floor(sp)) % pool.length];
      if (name === lastTrick) name = 'none';
    }
    lastTrick = name;
    trick = name === 'none' ? null : { def: TRICKS[name], name, t: 0 };
  }

  const choose = (name) => (webSide === 'r' ? POSES : MIRRORED)[name];
  const shoulderOf = () => model.getObjectByName(webSide === 'r' ? 'upperarm_r' : 'upperarm_l').getWorldPosition(shoulder);

  return {
    rig,
    get webHand() { return webSide; },
    get trick() { return trick ? trick.name : null; },
    handWorld(out) { return model.getObjectByName(webSide === 'r' ? 'hand_r' : 'hand_l').getWorldPosition(out); },
    // Where the web leaves the body: the web hand, or the feet when hanging upside down.
    lineWorld(out) {
      if (!inverted) return this.handWorld(out);
      model.getObjectByName('foot_l').getWorldPosition(out);
      return out.add(model.getObjectByName('foot_r').getWorldPosition(shoulder)).multiplyScalar(0.5);
    },

    // at: where to draw the body (the game passes a position interpolated between physics steps).
    update(hero, dt, events, at = hero.body.p) {
      const b = hero.body;
      root.position.set(at.x, at.y, at.z);
      vel.set(b.v.x, b.v.y, b.v.z);
      const speed = vel.length();
      const hs = Math.hypot(b.v.x, b.v.z);
      const st = hero.state;
      const swinging = st === 'swing' && hero.swing.active;
      const zipping = st === 'zip' && hero.rope.active;
      const hanging = st === 'hang' && hero.swing.active;
      inverted = hanging && hero.hangInverted;
      const grip = swinging ? hero.swing.R : zipping ? hero.rope.pivots[0] : null;
      if ((swinging || zipping) && !wasRope && grip) {
        webSide = sideOf(hero, grip.x, grip.z);
        // A new swing: pick its pose set (never the same twice running).
        variant = (variant + 1 + (swings++ % 2)) % 3;
      }
      wasRope = swinging || zipping;
      if (!swinging) lastAng = null;

      for (const e of events) {
        if (e.type === 'thwip') { webSide = sideOf(hero, e.x, e.z); shot = { t: 0, x: e.x, y: e.y, z: e.z }; trick = null; }
        else if (e.type === 'release' || e.type === 'perfect' || e.type === 'swingJump' || e.type === 'trick') startTrick(e.type, hero);
        else if (e.type === 'launch') { trick = { def: TRICKS.frontflip, name: 'frontflip', t: 0 }; perchT = 0; }
        else if (e.type === 'vault') { trick = { def: TRICKS.sideflip, name: 'sideflip', t: 0 }; }
        else if (e.type === 'perch') perchT = 0.9;
        else if (e.type === 'mantle') { mantleT = 0.42; trick = null; }
        else if (e.type === 'land') {
          trick = null;
          if (e.hard && hs < 10) landT = 0.6;
          else if (e.hard) { once = 'Roll'; onceT = 0.55; animator.play('Roll', { once: true, fade: 0.05, timeScale: 1.3 }); }
          else if (e.impact > 6) { once = 'Jump_Land'; onceT = 0.3; animator.play('Jump_Land', { once: true, fade: 0.05, timeScale: 1.4 }); }
        }
      }
      if (once) { onceT -= dt; if (onceT <= 0 || st !== 'ground') once = null; }
      const play = (name, opts) => { if (!once) animator.play(name, opts); };
      if (shot) { shot.t += dt; if (shot.t > 0.22 || swinging) shot = null; }
      if (trick) { trick.t += dt; if (trick.t >= trick.def.dur || st !== 'air') trick = null; }
      if (landT > 0) { landT -= dt; if (st !== 'ground' || hs > 3) landT = 0; }
      if (perchT > 0) { perchT -= dt; if (st !== 'ground' || hs > 2) perchT = 0; }
      if (mantleT > 0) { mantleT -= dt; if (st !== 'air') mantleT = 0; }
      // Standing still on a rooftop for a while: drop into a perch crouch, Spider-Man style.
      idleT = st === 'ground' && hs < 0.3 && hero.body.p.y > 6 ? idleT + dt : 0;

      // Orientation and target pose for this state -------------------------------------------
      let wantProc = 1;
      let pin = null;
      offTarget.set(0, 0, 0);
      tmp.set(hero.facing.x, 0, hero.facing.z);
      if (st === 'ground') {
        basis(UP, tmp, qBase);
        if (landT > 0) {
          target.set(POSES.land);
          // Plant the fist: the right hand pinned to the ground just ahead of the body.
          handTarget.set(0, 0, 0.45).applyQuaternion(orient.quaternion).add(root.position);
          handTarget.y = root.position.y - 0.9 + 0.1;
          webWorld.copy(handTarget); webHand.side = 'r'; pin = webHand;
        } else if (perchT > 0 || idleT > 2.5) {
          target.set(POSES.perch);
        } else {
          wantProc = 0;
          if (hs < 0.4) play('Idle_Loop');
          else if (hs < 10.5) play('Jog_Fwd_Loop', { timeScale: Math.max(0.6, hs / 6.5) });
          else play('Sprint_Loop', { timeScale: Math.max(0.8, hs / 11) });
        }
      } else if (st === 'wall') {
        wantProc = 0;
        const nx = hero.wall.nx, nz = hero.wall.nz;
        tmp.set(nx, 0, nz);
        const side = b.v.x * -nz + b.v.z * nx;
        if (Math.abs(b.v.y) < 0.8 && Math.abs(side) > 0.8) tmp2.set(-nz * Math.sign(side), 0, nx * Math.sign(side));
        else tmp2.set(0, b.v.y < -0.8 ? -1 : 1, 0);
        basis(tmp, tmp2, qBase);
        offTarget.set(nx * WALL_OFFSET, 0, nz * WALL_OFFSET);
        if (b.v.y > 4 || hero.wallMomentum) play('Sprint_Loop', { timeScale: 1.1 });
        else play(Math.hypot(b.v.x, b.v.y, b.v.z) > 0.6 ? 'Crouch_Fwd_Loop' : 'Crouch_Idle_Loop');
      } else if (hanging) {
        // Along the line. Upright: head toward the pivot, hands on the line. Upside down: feet
        // toward it, the web running from them.
        const P = hero.swing.P;
        tmp2.set(P.x - b.p.x, P.y - b.p.y, P.z - b.p.z).normalize();
        if (inverted) tmp2.negate();
        basis(tmp2, tmp, qBase);
        if (inverted) target.set(POSES.hangInv);
        else {
          target.set(choose('hang'));
          shoulderOf();
          handTarget.set(P.x, P.y, P.z).sub(shoulder).normalize().multiplyScalar(0.47).add(shoulder);
          webWorld.copy(handTarget);
          webHand.side = webSide;
          pin = webHand;
        }
        // A slow breathing sway so a still hang never freezes.
        flutter += dt;
        const s = Math.sin(flutter * 1.7);
        target[LAYOUT.footR + 2] += s * 0.04; target[LAYOUT.footL + 2] -= s * 0.03;
        target[LAYOUT.spine + 2] += s * 0.04;
      } else if (swinging || zipping) {
        // Up along the line toward the pivot, facing the way we're travelling.
        const P = swinging ? hero.swing.P : hero.rope.pivot;
        tmp2.set(P.x - b.p.x, P.y - b.p.y, P.z - b.p.z).normalize();
        basis(tmp2, speed > 1 ? vel : tmp, qBase);
        if (zipping) target.set(POSES.zip);
        else {
          // Keyed to the swing's phase: reach -> drop -> bottom -> rise.
          // Keyed a beat ahead of the arc (anticipation): the legs are already coming through
          // as the body reaches the bottom, not catching up after it.
          const ang0 = hero.swing.angle(b.p, b.v);
          const rate = dt > 0 && lastAng !== null ? Math.max(-400, Math.min(400, (ang0 - lastAng) / dt)) : 0;
          lastAng = ang0;
          const ang = ang0 + rate * 0.12;
          const bottom = variant === 1 ? 'bottomSplit' : variant === 2 ? 'bottomWide' : 'bottom';
          const rise = variant === 1 ? 'riseScissor' : 'rise';
          lerpPose(choose('reach'), choose('drop'), smoothstep(-75, -40, ang), blendA);
          lerpPose(blendA, choose(bottom), smoothstep(-40, -10, ang), blendB);
          lerpPose(blendB, choose(rise), smoothstep(-10, 20, ang), target);
          // Pin the web hand on the strand, arm's length toward where it sticks.
          shoulderOf();
          handTarget.set(grip.x, grip.y, grip.z).sub(shoulder).normalize().multiplyScalar(0.6).add(shoulder);
          webWorld.copy(handTarget);
          webHand.side = webSide;
          pin = webHand;
        }
      } else if (st === 'glide') {
        tmp2.set(0, -1, 0);
        basis(speed > 1 ? vel : UP, tmp2, qBase);
        target.set(POSES.wings);
      } else {
        // Air. A dive goes head first; otherwise upright with a lean into the motion.
        if (mantleT > 0) {
          // Going over a ledge: upright, facing in, hands on the edge.
          basis(UP, tmp, qBase);
          target.set(POSES.mantle);
        } else if (hero.diving && speed > 8) {
          tmp2.copy(tmp).negate().lerp(DOWN, 0.2);
          basis(vel, tmp2, qBase);
          target.set(POSES.dive);
        } else {
          // Lean into the flight: fast and level, the body lies along the path, head first, like
          // a diver; slow, it stays upright.
          const lean = smoothstep(12, 32, speed) * smoothstep(-0.9, -0.2, vel.y / Math.max(1, speed)) * 0.85;
          // Dropping steeply: tip forward over the drop, belly toward the ground, like a skydiver.
          const fallTilt = smoothstep(-4, -20, b.v.y) * (1 - lean);
          u.set(0, 1, 0).lerp(tmp2.copy(vel).normalize(), lean);
          u.lerp(tmp2.copy(tmp), fallTilt * 0.7).normalize();
          basis(u, lean + fallTilt > 0.3 ? DOWN : tmp, qBase);
          // Pose: rising slow and loose; soaring when fast; spread when dropping.
          lerpPose(POSES.air, POSES.soar, smoothstep(0.1, 0.5, lean), blendA);
          lerpPose(blendA, POSES.spread, smoothstep(-3, -14, b.v.y) * (1 - lean), target);
          // Falling toward the next web: the web arm comes forward, ready.
          if (b.v.y < -2 && !trick) { lerpPose(target, choose('ready'), smoothstep(-2, -10, b.v.y) * 0.6, blendB); target.set(blendB); }
          if (trick) {
            const s = Math.sin(Math.PI * Math.min(1, trick.t / trick.def.dur));
            lerpPose(target, POSES.tuck, s * trick.def.tuck, blendA);
            target.set(blendA);
          }
          if (shot) {
            // Firing: snap the arm out at the target with the thwip sign.
            target.set(choose('thwip'));
            shoulderOf();
            handTarget.set(shot.x, shot.y, shot.z).sub(shoulder).normalize().multiplyScalar(0.62).add(shoulder);
            webWorld.copy(handTarget);
            webHand.side = webSide;
            pin = webHand;
          }
        }
      }

      // On clips the procedural target rests at a neutral air pose with no crouch, so the body drop
      // springs back to zero (a landing's crouch once stayed sunk under the idle clip).
      if (!wantProc) target.set(POSES.air);

      // Bank into turns: roll about the body's forward axis with the heading's turn rate.
      const heading = Math.atan2(b.v.x, b.v.z);
      let turn = heading - lastHeading;
      while (turn > Math.PI) turn -= 2 * Math.PI;
      while (turn < -Math.PI) turn += 2 * Math.PI;
      lastHeading = heading;
      const rate = hs > 4 && dt > 0 ? turn / dt : 0;
      bank += (Math.max(-0.7, Math.min(0.7, -rate * 0.45)) - bank) * Math.min(1, dt * 5);
      // Never-still legs in the air: a slow flutter so no pose ever freezes.
      if (st === 'air' || st === 'swing' || st === 'glide') {
        flutter += dt;
        const fz = Math.sin(flutter * 6.3) * 0.045, fy = Math.sin(flutter * 4.1) * 0.03;
        target[LAYOUT.footL + 2] += fz; target[LAYOUT.footR + 2] -= fz;
        target[LAYOUT.footL + 1] += fy; target[LAYOUT.footR + 1] -= fy;
      }

      // Trick rotation on top of the base orientation, about a body axis.
      qTarget.copy(qBase);
      if (st !== 'ground' && st !== 'wall' && Math.abs(bank) > 1e-3) { tmp2.set(0, 0, 1); qTrick.setFromAxisAngle(tmp2, bank); qTarget.multiply(qTrick); }
      if (trick) {
        const d = trick.def, x = Math.min(1, trick.t / d.dur);
        const e = x * x * (3 - 2 * x);
        tmp2.set(d.axis[0], d.axis[1], d.axis[2]);
        qTrick.setFromAxisAngle(tmp2, e * d.turns * Math.PI * 2);
        qTarget.multiply(qTrick);
        orient.quaternion.slerp(qTarget, 1 - Math.exp(-dt * 40));
      } else {
        orient.quaternion.slerp(qTarget, 1 - Math.exp(-dt * (swinging ? 9 : 12)));
      }

      // Spring every pose number toward the target (critically damped).
      const h = Math.min(dt, 1 / 30);
      for (let i = 0; i < LAYOUT.SIZE; i++) {
        const w = STIFF[i];
        const a = w * w * (target[i] - cur[i]) - 2 * w * curV[i];
        curV[i] += a * h;
        cur[i] += curV[i] * h;
      }
      offTarget.y -= cur[LAYOUT.drop];
      orient.position.lerp(offTarget, 1 - Math.exp(-dt * 14));

      procW += ((wantProc ? 1 : 0) - procW) * Math.min(1, dt * 10);
      animator.update(dt);
      if (procW > 0.01) {
        root.updateMatrixWorld(true);
        rig.snapshot();
        rig.apply(cur, pin);
        rig.blendWithSnapshot(procW);
      }
    },
  };
}
