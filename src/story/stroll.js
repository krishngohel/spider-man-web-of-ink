import * as THREE from 'three';
import { comicToon } from '../render/comicShade.js';
import { characterById } from '../roster/characters.js';
import { CAST } from './cast.js';

// A stroll (Peter out of the suit): the hero walks, never swings or jumps (people are watching),
// among people the scene places at its site, each acting out a mocap clip (sitting and laughing on
// a bench, typing at a desk, pacing on the phone). Some have something to say: walk up, press the
// talk key (E / pad Y) and they turn to Peter for the lines. The step is done once everyone it
// needs has been talked to (or the hero reaches `reach`, when given).
//   npcs: [{ who, p: [dx, dy, dz], yaw (deg), clip, prop?, talk?: lines, need?, talkClip? }]
// prop: 'bench' | 'chair' | 'desk' | 'table' | 'stool' set under or before them. who: a cast id, a
// roster id, or a crowd id (cast.js CROWD) for students, volunteers, passers-by.
const UP = new THREE.Vector3(0, 1, 0);
const TALK_R = 2.6, WALK_MAX = 3.6;
const SEATED = /^Sit_|^Gaming$|^Writing$/;

const propMats = { wood: comicToon({ color: 0x8a5a3a }), iron: comicToon({ color: 0x2c2c32 }), top: comicToon({ color: 0xd9cfb8 }), cloth: comicToon({ color: 0x7a2a2a }) };
export function propMesh(kind) {
  const g = new THREE.Group();
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); };
  if (kind === 'bench') {
    box(2.0, 0.08, 0.5, 0, 0.45, 0, propMats.wood); box(2.0, 0.42, 0.06, 0, 0.72, -0.24, propMats.wood);
    for (const x of [-0.85, 0.85]) box(0.08, 0.45, 0.45, x, 0.22, 0, propMats.iron);
  } else if (kind === 'chair' || kind === 'stool') {
    box(0.48, 0.06, 0.48, 0, 0.46, 0, propMats.wood);
    if (kind === 'chair') box(0.48, 0.5, 0.05, 0, 0.74, -0.22, propMats.wood);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(0.05, 0.46, 0.05, x, 0.23, z, propMats.iron);
  } else if (kind === 'desk' || kind === 'table') {
    const w = kind === 'desk' ? 1.4 : 0.9;
    box(w, 0.05, 0.75, 0, 0.75, 0, kind === 'desk' ? propMats.top : propMats.cloth);
    for (const [x, z] of [[-w / 2 + 0.06, -0.3], [w / 2 - 0.06, -0.3], [-w / 2 + 0.06, 0.3], [w / 2 - 0.06, 0.3]]) box(0.05, 0.75, 0.05, x, 0.37, z, propMats.iron);
  }
  return g;
}

export function createStroll(g, { scene, hero, ui, say, site, step, crowd }) {
  const people = [], props = [];
  const base = { x: site.x, y: site.y - 0.9, z: site.z };
  for (const n of step.npcs ?? []) {
    const def = CAST[n.who] ?? crowd?.[n.who] ?? characterById(n.who);
    const m = g.buildCharacter(g.assets, def);
    const yaw = ((n.yaw ?? 0) * Math.PI) / 180;
    const p = { x: base.x + n.p[0], y: base.y + (n.p[1] ?? 0), z: base.z + n.p[2] };
    m.root.position.set(p.x, p.y + 0.9, p.z);
    m.orient.quaternion.setFromAxisAngle(UP, yaw);
    m.animator.play(n.clip && m.animator.has(n.clip) ? n.clip : 'Idle_Loop', { fade: 0 });
    // Clips start at a random point, so a crowd of the same loop never moves in step.
    m.animator.update(Math.random() * 3);
    scene.add(m.root);
    if (n.prop) {
      const pm = propMesh(n.prop);
      // A seat sits under them; a desk or table stands in front.
      const front = n.prop === 'desk' || n.prop === 'table' ? 0.55 : -0.05;
      pm.position.set(p.x + Math.sin(yaw) * front, p.y, p.z + Math.cos(yaw) * front);
      pm.rotation.y = yaw;
      scene.add(pm); props.push(pm);
    }
    people.push({ n, m, p, yaw, face: yaw, talked: !n.talk, seated: SEATED.test(n.clip ?? '') || !!n.prop && n.prop !== 'desk' && n.prop !== 'table' });
  }
  let talking = null, near = null, doneFlag = false;

  function nearest() {
    let best = null, bd = TALK_R;
    for (const q of people) {
      if (!q.n.talk || q.talked) continue;
      const d = Math.hypot(hero.body.p.x - q.p.x, hero.body.p.z - q.p.z);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  function talkTo(q) {
    talking = q;
    q.talked = true;
    // They look up from what they were doing; a standing one talks with their hands.
    if (!q.seated && q.n.talkClip !== null) q.m.animator.play(q.n.talkClip ?? 'Talking', { fade: 0.4 });
    g.heroEmote?.({ clip: 'Talking', loop: true });
    const ep = talking;
    say(q.n.talk).then(() => {
      if (talking !== ep) return;
      talking = null;
      g.heroEmote?.(null);
      if (!q.seated) q.m.animator.play(q.n.after ?? q.n.clip ?? 'Idle_Loop', { fade: 0.5 });
      check();
    });
  }
  function check() {
    const need = people.filter((q) => q.n.talk && (q.n.need ?? true));
    const reached = step.reach && Math.hypot(hero.body.p.x - (base.x + step.reach[0]), hero.body.p.z - (base.z + step.reach[2])) < (step.reachR ?? 3);
    if ((need.length && need.every((q) => q.talked)) || (!need.length && reached)) doneFlag = true;
  }

  return {
    get done() { return doneFlag && !talking; },
    // Where the objective marker goes: the next person to talk to.
    get target() { const q = people.find((x) => x.n.talk && !x.talked && (x.n.need ?? true)); return q ? { x: q.p.x, y: q.p.y + 2.4, z: q.p.z } : step.reach ? { x: base.x + step.reach[0], y: base.y + 1, z: base.z + step.reach[2] } : null; },
    get prompt() { return near && !talking ? near : null; },
    // Before the hero steps: no webs, swings, jumps or punches in public; E talks.
    preStep(intent) {
      if (intent.hangPressed && near && !talking) talkTo(near);
      intent.swing = false; intent.swingPressed = false; intent.zipPressed = false; intent.hangPressed = false; intent.yankPressed = false;
      intent.jump = false; intent.jumpPressed = false; intent.trickPressed = false; intent.attackPressed = false; intent.attack = false;
      intent.webPressed = false; intent.web = false; intent.gadgetPressed = false; intent.divePressed = false; intent.dive = false; intent.finisher = false;
      if (talking) { intent.moveX = 0; intent.moveZ = 0; }
    },
    update(dt) {
      // A walk, not a superhero sprint.
      const v = hero.body.v, hs = Math.hypot(v.x, v.z);
      if (hs > WALK_MAX && hero.state === 'ground') { v.x *= WALK_MAX / hs; v.z *= WALK_MAX / hs; }
      near = nearest();
      for (const q of people) {
        // Whoever Peter talks to turns to him (seated people only turn their heads a little).
        const want = talking === q && !q.seated ? Math.atan2(hero.body.p.x - q.p.x, hero.body.p.z - q.p.z) : q.yaw;
        let d = want - q.face; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        q.face += d * Math.min(1, dt * 5);
        q.m.orient.quaternion.setFromAxisAngle(UP, q.face);
        q.m.animator.update(dt);
        q.m.updateGear?.(dt, null);
      }
      if (talking) {
        // Peter faces whoever he is talking to.
        const q = talking, dx = q.p.x - hero.body.p.x, dz = q.p.z - hero.body.p.z, l = Math.hypot(dx, dz) || 1;
        hero.facing.x += (dx / l - hero.facing.x) * Math.min(1, dt * 6); hero.facing.z += (dz / l - hero.facing.z) * Math.min(1, dt * 6);
        const fl = Math.hypot(hero.facing.x, hero.facing.z) || 1; hero.facing.x /= fl; hero.facing.z /= fl;
      }
      if (!doneFlag) check();
    },
    dispose() {
      for (const q of people) scene.remove(q.m.root);
      for (const pm of props) scene.remove(pm);
      people.length = 0; props.length = 0;
      g.heroEmote?.(null);
    },
  };
}
