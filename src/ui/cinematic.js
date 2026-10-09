import * as THREE from 'three';
import { el } from './dom.js';
import { sampleSequence, totalDuration } from './cinematicShots.js';

// The in-engine cinematic camera (spec P5): shots over the live city (src/ui/cinematicShots.js),
// cinema bars with the HUD faded behind them (hud.letterboxHold), a subtitle per shot, and a
// smooth ease back to whatever camera the game set this frame when the shots end. Esc, Space, a
// click or a pad's B skip straight to that hand-back. The director (src/story/director.js) plays
// these for act openers, boss reveals and the finale, with play blocked meanwhile, so the hero
// never moves while the camera is away.

const RETURN_DUR = 0.7; // seconds: the ease back to the game camera once the shots (or a skip) end
// Further than this from the game camera, the hand-back is a cut: a straight ease that far would
// fly through the buildings in between.
const CUT_DIST = 30;

export function createCinematic({ camera, hud, root }) {
  const sub = el('div', { class: 'cinesub' });
  root.append(sub);

  // Reused every frame: no per-frame allocation.
  const pos = { x: 0, y: 0, z: 0 };
  const look = new THREE.Vector3();
  const fromPos = new THREE.Vector3(), fromQuat = new THREE.Quaternion();
  const snapPos = new THREE.Vector3(), snapQuat = new THREE.Quaternion();

  let shots = [], total = 0, t = 0, phase = 'idle'; // idle | shots | returning
  let onDone = null, returnT = 0, shownSub = -1, fromFov = 50, padB = false;

  function showSub(index) {
    if (shownSub === index) return;
    shownSub = index;
    const text = shots[index]?.sub ?? '';
    sub.textContent = text;
    sub.classList.toggle('show', !!text);
  }
  function finish() {
    phase = 'idle';
    sub.classList.remove('show');
    hud.letterboxHold(false);
    const cb = onDone;
    onDone = null;
    cb?.();
  }
  function beginReturn() {
    phase = 'returning';
    returnT = 0;
    fromPos.copy(camera.position);
    fromQuat.copy(camera.quaternion);
    fromFov = camera.fov;
    sub.classList.remove('show');
  }
  function skip() {
    if (phase === 'shots') beginReturn();
    else if (phase === 'returning') { returnT = RETURN_DUR; }
  }

  // Capture phase, like the comic's own skip keys: the key reaches nothing else.
  const onKey = (e) => {
    if (phase === 'idle' || e.repeat) return;
    if (e.code === 'Escape' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); skip(); }
  };
  window.addEventListener('keydown', onKey, true);
  const onClick = (e) => { if (phase === 'idle') return; e.stopPropagation(); if (e.button === 0) skip(); };
  window.addEventListener('mousedown', onClick, true);

  return {
    get active() { return phase !== 'idle'; },
    get phase() { return phase; },
    get t() { return t; },
    get shot() { return phase === 'shots' ? sampleSequence(shots, t, {}, total).index : -1; },
    get shots() { return shots; }, // test hook: the last sequence played (with each shot's lift)
    // play(shots, { onDone }): the camera plays the shots, then eases back and calls onDone.
    // Returns false (and plays nothing) if one is already running or there are no shots.
    play(inShots, { onDone: cb = null } = {}) {
      if (phase !== 'idle' || !inShots?.length) return false;
      shots = inShots;
      total = totalDuration(shots);
      t = 0;
      shownSub = -1;
      phase = 'shots';
      onDone = cb;
      hud.letterboxHold(true);
      const pads = navigator.getGamepads?.() ?? [];
      padB = !![...pads].find((p) => p && p.connected)?.buttons[1]?.pressed;
      return true;
    },
    skip,
    // Drops a running cinematic at once, without its callback (the story stopped or jumped).
    cancel() {
      if (phase === 'idle') return;
      onDone = null;
      finish();
    },
    // Once per frame, after the game has set its own camera: this overrides it.
    update(dt) {
      if (phase === 'idle') return;
      // A pad's B skips, as it skips a comic.
      const pads = navigator.getGamepads?.();
      let b = false;
      if (pads) for (let i = 0; i < pads.length; i++) if (pads[i]?.connected) { b = !!pads[i].buttons[1]?.pressed; break; }
      if (b && !padB) skip();
      padB = b;
      if (phase === 'shots') {
        t += dt;
        const s = sampleSequence(shots, t, pos, total);
        showSub(s.index);
        camera.position.set(s.x, s.y, s.z);
        look.set(s.lx, s.ly, s.lz);
        camera.lookAt(look);
        if (Math.abs(camera.fov - s.fov) > 0.05) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
        if (s.done) beginReturn();
      } else if (phase === 'returning') {
        // The game set its own answer on the camera this frame: that is the target, read before
        // it is overwritten, so the hand-back stays smooth even while that camera is settling.
        snapPos.copy(camera.position);
        snapQuat.copy(camera.quaternion);
        const toFov = camera.fov;
        if (returnT === 0 && fromPos.distanceTo(snapPos) > CUT_DIST) { finish(); return; }
        returnT += dt;
        const k = Math.min(1, returnT / RETURN_DUR);
        const e = k * k * (3 - 2 * k);
        camera.position.lerpVectors(fromPos, snapPos, e);
        camera.quaternion.copy(fromQuat).slerp(snapQuat, e);
        const f = fromFov + (toFov - fromFov) * e;
        if (Math.abs(camera.fov - f) > 0.05) { camera.fov = f; camera.updateProjectionMatrix(); }
        if (k >= 1) finish();
      }
    },
    dispose() { window.removeEventListener('keydown', onKey, true); window.removeEventListener('mousedown', onClick, true); sub.remove(); },
  };
}
