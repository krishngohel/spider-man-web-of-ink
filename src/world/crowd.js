import * as THREE from 'three';
import { CROWD } from '../story/cast.js';

// The crowd up close: the instanced pedestrians far off are simple figures; the nearest dozen are
// swapped for real characters (the story's everyday New Yorkers in shuffled colours) acting out
// mocap: walking, running scared when Spider-Man crashes down, and now and then stopping to wave,
// cheer, point or take a photo of him when he stands near. One who stops can be fist-bumped.
const UP = new THREE.Vector3(0, 1, 0);
const NEAR = 36, FAR = 44, SWAP_EVERY = 0.25;
const SHIRTS = [0xd8392b, 0x2a5fb0, 0xf2c230, 0x3f8f5a, 0xeeeeea, 0x7a4a9a, 0xe07a2a, 0x2b2b33, 0x5aa0c8, 0xc85a8a];
const REACT = [
  { clip: 'Emote_Wave', t: 2.6 }, { clip: 'Emote_Cheer', t: 3 }, { clip: 'Texting', t: 4.5 }, { clip: 'Pointing', t: 2.4 },
  { clip: 'Emote_Clap', t: 3 }, { clip: 'Emote_Excited', t: 3 }, { clip: 'Phone', t: 4 },
];

export function createCrowd({ scene, assets, buildCharacter, life, count = 12 }) {
  const defs = Object.values(CROWD);
  const pool = [];
  for (let i = 0; i < count; i++) {
    const d = defs[i % defs.length];
    const def = { ...d, id: `crowd${i}`, outfit: { ...d.outfit, jacket: SHIRTS[(i * 7) % SHIRTS.length], pants: [0x2a2a3a, 0x3a3a40, 0x1f2c4a, 0x5a4a3a][i % 4] } };
    const m = buildCharacter(assets, def);
    m.root.visible = false;
    scene.add(m.root);
    pool.push({ m, ped: null, last: { x: 0, z: 0 }, clip: '', react: null, face: 0 });
  }
  let swapT = 0, bump = null;
  const peds = life.peds;
  const ready = (m) => m.animator.has('Walking');

  function release(c) {
    if (c.ped) { c.ped.skinned = false; c.ped.pause = 0; }
    c.ped = null; c.react = null; c.m.root.visible = false;
  }
  function play(c, clip, opts = {}) {
    if (c.clip === clip && !opts.once) return;
    c.clip = clip;
    c.m.animator.play(c.m.animator.has(clip) ? clip : 'Idle_Loop', { fade: 0.3, ...opts });
  }

  return {
    // The one within reach that can be fist-bumped right now, if any.
    get bumpable() { return bump; },
    update(dt, cam, hero, { spidey = true } = {}) {
      if (!pool.length || !ready(pool[0].m)) return;
      swapT -= dt;
      if (swapT <= 0) {
        swapT = SWAP_EVERY;
        // Let go of the ones that wandered off (or were moved far away by the city).
        for (const c of pool) if (c.ped && (!c.ped.alive || Math.hypot(c.ped.x - cam.x, c.ped.z - cam.z) > FAR)) release(c);
        // Fill the free figures with the nearest walkers not yet taken.
        const free = pool.filter((c) => !c.ped);
        if (free.length) {
          const cand = [];
          for (const o of peds) {
            if (!o.alive || o.skinned) continue;
            const d = Math.hypot(o.x - cam.x, o.z - cam.z);
            if (d < NEAR) cand.push([d, o]);
          }
          cand.sort((a, b) => a[0] - b[0]);
          for (let k = 0; k < free.length && k < cand.length; k++) {
            const c = free[k], o = cand[k][1];
            c.ped = o; o.skinned = true; c.last.x = o.x; c.last.z = o.z; c.clip = ''; c.react = null;
            c.face = Math.atan2(o.dx, o.dz);
            c.m.root.visible = true;
            c.m.animator.update(Math.random() * 2);
          }
        }
      }
      const hp = hero.body.p, hs = Math.hypot(hero.body.v.x, hero.body.v.z);
      const heroStill = spidey && hero.state === 'ground' && hs < 1.5;
      bump = null;
      for (const c of pool) {
        const o = c.ped;
        if (!o) continue;
        // Moved by the city (re-placed elsewhere): let go.
        if (Math.hypot(o.x - c.last.x, o.z - c.last.z) > 4) { release(c); continue; }
        c.last.x = o.x; c.last.z = o.z;
        const dh = Math.hypot(hp.x - o.x, hp.z - o.z);
        // Spider-Man standing near: some stop and react (once each time he comes by).
        if (!c.react && heroStill && dh < 7 && Math.abs(hp.y - 0.9) < 2 && o.flee <= 0 && Math.random() < dt * 0.6) {
          const r = REACT[Math.floor(Math.random() * REACT.length)];
          c.react = { clip: r.clip, t: r.t };
          o.pause = r.t;
        }
        if (c.react) {
          c.react.t -= dt;
          if (c.react.t <= 0 || o.flee > 0) { c.react = null; o.pause = 0; if (dh < 12) c.reacted = true; }
        }
        let want;
        if (c.react) {
          want = Math.atan2(hp.x - o.x, hp.z - o.z);
          play(c, c.react.clip);
          if (dh < 2.4 && heroStill && c.react.clip !== 'Handshake') bump = c;
        } else if (o.flee > 0) { want = Math.atan2(o.dx, o.dz); play(c, 'Running'); }
        else if (o.speed > 0.1 && o.pause <= 0) {
          want = Math.atan2(o.dx, o.dz);
          // The walk cycle keeps pace with how fast this one walks (same clip: only its speed changes).
          c.m.animator.play('Walking', { fade: 0.3, timeScale: o.speed / 1.35 }); c.clip = 'Walking';
        } else { want = c.face; play(c, 'Idle_Loop'); }
        let d = want - c.face; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        c.face += d * Math.min(1, dt * 6);
        c.m.root.position.set(o.x, 0.9, o.z);
        c.m.orient.quaternion.setFromAxisAngle(UP, c.face);
        c.m.animator.update(dt);
      }
    },
    // A fist bump with the one in reach: both play it; returns them (for the hero's side).
    fistBump() {
      const c = bump;
      if (!c) return null;
      c.react = { clip: 'Handshake', t: 2.2 };
      if (c.ped) c.ped.pause = 2.2;
      play(c, 'Handshake', { once: true });
      bump = null;
      return { x: c.m.root.position.x, z: c.m.root.position.z };
    },
    clear() { for (const c of pool) release(c); },
  };
}
