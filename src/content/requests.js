import * as THREE from 'three';
import { comicToon } from '../render/comicShade.js';
import { CROWD } from '../story/cast.js';
import { REQUESTS } from './requestData.js';

// Neighborhood requests (after Insomniac's side quests): New Yorkers around the city flag
// Spider-Man down. Walk up and talk (E), do the task (beat the crew that wronged them, or fetch
// what ended up on a roof), come back for the thanks. Placed from the city (stable for a save),
// saved by id, one at a time, never during a story mission.
const TALK_R = 2.6, SHOW_R = 160;

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

// Where a request happens: its giver on a sidewalk of the district (by a lamp), the crew's corner
// down the block, and the roof (one of the low buildings nearby) for a fetch.
export function placeRequests(city, lamps, list = REQUESTS) {
  return list.map((r) => {
    const d = city.districts.find((q) => q.id === r.district);
    const inD = lamps.filter((l) => d && l.x >= d.minX + 40 && l.x < d.maxX - 40 && l.z >= d.minZ + 40 && l.z < d.maxZ - 40);
    const pool = inD.length ? inD : lamps;
    const l = pool[Math.floor(hash(r.id) * pool.length)];
    const giver = { x: l.x - l.facing * 1.4, z: l.z + 3 };
    const yaw = l.facing > 0 ? Math.PI / 2 : -Math.PI / 2; // facing the road
    const corner = { x: l.x + l.facing * 8, z: l.z + (hash(r.id + 'c') < 0.5 ? -48 : 48) };
    let roof = null;
    if (r.task.kind === 'fetch') {
      const near = city.boxes.filter((b) => b.kind === 'building' && !b.landmark && b.max[1] > 10 && b.max[1] < 70 && b.max[0] - b.min[0] > 9 && b.max[2] - b.min[2] > 9)
        .map((b) => ({ b, dd: Math.hypot((b.min[0] + b.max[0]) / 2 - giver.x, (b.min[2] + b.max[2]) / 2 - giver.z) }))
        .filter((q) => q.dd > 25 && q.dd < 160).sort((a, b) => a.dd - b.dd).slice(0, 6);
      const pick = near[Math.floor(hash(r.id + 'r') * near.length)]?.b;
      if (pick) roof = { x: (pick.min[0] + pick.max[0]) / 2 + 1.5, y: pick.max[1] + 0.35, z: (pick.min[2] + pick.max[2]) / 2 - 1 };
    }
    return { r, giver, yaw, corner, roof };
  });
}

// The things that end up on roofs, drawn from a few primitives.
const M = { fur: comicToon({ color: 0xd88a3a }), red: comicToon({ color: 0xd8392b }), blue: comicToon({ color: 0x2a5fb0 }), dark: comicToon({ color: 0x2a2a30 }), cream: comicToon({ color: 0xf2ead8 }), yellow: comicToon({ color: 0xf2c230 }), wood: comicToon({ color: 0x8a5a3a }) };
function itemMesh(kind) {
  const g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0, s = [1, 1, 1]) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(...s); o.castShadow = true; g.add(o); return o; };
  if (kind === 'cat') {
    add(new THREE.SphereGeometry(0.22, 10, 8), M.fur, 0, 0.2, 0, [1, 0.85, 1.5]);
    add(new THREE.SphereGeometry(0.14, 10, 8), M.fur, 0, 0.36, 0.28);
    for (const x of [-0.07, 0.07]) add(new THREE.ConeGeometry(0.05, 0.1, 4), M.fur, x, 0.48, 0.28);
    add(new THREE.CylinderGeometry(0.03, 0.02, 0.4, 5), M.fur, 0, 0.32, -0.36, [1, 1, 1]).rotation.x = 0.9;
  } else if (kind === 'kite') {
    add(new THREE.OctahedronGeometry(0.5, 0), M.red, 0, 0.6, 0, [1, 1.4, 0.06]);
  } else if (kind === 'drone') {
    add(new THREE.BoxGeometry(0.36, 0.1, 0.36), M.dark, 0, 0.12, 0);
    for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) add(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 10), M.cream, x, 0.18, z);
  } else if (kind === 'hat') {
    add(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 14), M.dark, 0, 0.02, 0);
    add(new THREE.CylinderGeometry(0.18, 0.2, 0.22, 14), M.dark, 0, 0.14, 0);
  } else if (kind === 'box') {
    add(new THREE.BoxGeometry(0.22, 0.16, 0.22), M.red, 0, 0.08, 0);
  } else if (kind === 'guitar') {
    add(new THREE.BoxGeometry(0.42, 0.14, 1.1), M.dark, 0, 0.07, 0);
  } else if (kind === 'balloon') {
    add(new THREE.SphereGeometry(0.32, 12, 10), M.red, 0, 1.1, 0, [1, 1.2, 1]);
    add(new THREE.CylinderGeometry(0.005, 0.005, 0.9, 3), M.dark, 0, 0.45, 0);
  } else {
    add(new THREE.BoxGeometry(0.5, 0.6, 0.3), M.blue, 0, 0.3, 0);
  }
  return g;
}

// The "!" bubble over a giver: a flat comic burst that always faces the camera.
function bubbleMesh() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = '#f7e36a'; x.strokeStyle = '#12101c'; x.lineWidth = 8;
  x.beginPath(); x.arc(64, 58, 44, 0, Math.PI * 2); x.moveTo(52, 98); x.lineTo(64, 124); x.lineTo(78, 98); x.fill(); x.stroke();
  x.fillStyle = '#12101c'; x.font = 'bold 72px Bangers, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 64, 62);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.renderOrder = 7;
  return m;
}

export function createRequests(g) {
  const { scene, city, hero, combat, save, assets, buildCharacter, ui } = g;
  const spots = placeRequests(city, g.lamps);
  const done = () => (save.activities.requests ??= []);
  let giver = null;      // { s, m } the NPC drawn now
  let active = null;     // { s, phase: 'task' | 'return', list?, item? }
  let talking = false, near = false;
  const bubble = typeof document !== 'undefined' ? bubbleMesh() : null;
  if (bubble) { bubble.visible = false; scene.add(bubble); }

  const nameLine = (s) => (l) => (l.who === 'giver' ? { who: s.r.giver, name: s.r.name, text: l.text } : l);
  function showGiver(s) {
    if (giver?.s === s) return;
    hideGiver();
    const def = { ...CROWD[s.r.giver], id: `rq-${s.r.id}`, name: s.r.name };
    const m = buildCharacter(assets, def);
    m.root.position.set(s.giver.x, 0.9, s.giver.z);
    m.orient.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
    m.animator.play(m.animator.has(s.r.clip) ? s.r.clip : 'Idle_Loop', { fade: 0 });
    scene.add(m.root);
    giver = { s, m, face: s.yaw };
  }
  function hideGiver() {
    if (!giver) return;
    scene.remove(giver.m.root);
    giver.m.root.traverse((o) => { if (o.isMesh) { for (const mt of [].concat(o.material)) mt?.dispose?.(); } });
    giver = null;
  }
  function startTask(s) {
    const t = s.r.task;
    active = { s, phase: 'task' };
    if (t.kind === 'gang') {
      const d = city.districts.find((q) => q.id === s.r.district);
      active.list = combat.spawnGang(s.corner.x, s.corner.z, d?.id ?? 'midtown', { faction: t.faction, mix: t.mix, alert: false, kind: 'story' }).list;
      g.waypoint({ x: s.corner.x, z: s.corner.z });
    } else {
      const at = s.roof ?? { x: s.giver.x + 30, y: 0.4, z: s.giver.z };
      active.item = itemMesh(t.item);
      active.item.position.set(at.x, at.y, at.z);
      scene.add(active.item);
      active.at = at;
      g.waypoint({ x: at.x, z: at.z });
    }
    g.alert?.(t.text, 7);
  }
  function toReturn() {
    active.phase = 'return';
    if (active.item) { scene.remove(active.item); active.item = null; }
    g.waypoint({ x: active.s.giver.x, z: active.s.giver.z });
    g.alert?.(`Head back to ${active.s.r.name}.`, 6);
  }
  function finish() {
    const s = active.s;
    done().push(s.r.id);
    active = null;
    g.waypoint(null);
    g.reward('request', { at: { x: s.giver.x, y: 1, z: s.giver.z } });
    g.stamp?.('REQUEST DONE!');
    g.persist();
  }

  return {
    get busy() { return !!active; },
    get prompt() { return near && giver && !talking ? { p: { x: giver.s.giver.x, y: 0.9, z: giver.s.giver.z }, name: giver.s.r.name } : null; },
    // Before the hero steps: E talks to the giver in reach.
    preStep(intent) {
      if (!near || talking || !intent.hangPressed || !giver) return;
      intent.hangPressed = intent.yankPressed = false;
      const s = giver.s;
      talking = true;
      hero.body.v.x = hero.body.v.z = 0;
      const after = !active ? () => startTask(s) : active.phase === 'return' && active.s === s ? finish : null;
      const lines = (!active ? s.r.ask : s.r.thanks).map(nameLine(s));
      giver.m.animator.play(giver.m.animator.has('Talking') ? 'Talking' : 'Idle_Loop', { fade: 0.3 });
      ui.say(lines).then(() => {
        talking = false;
        if (giver?.s === s) giver.m.animator.play(giver.m.animator.has(after === finish ? 'Happy_Idle' : s.r.clip) ? (after === finish ? 'Happy_Idle' : s.r.clip) : 'Idle_Loop', { fade: 0.4 });
        after?.();
      });
    },
    update(dt, { active: on }) {
      const hp = hero.body.p;
      if (!on) { near = false; if (bubble) bubble.visible = false; if (!active) hideGiver(); return; }
      // The giver drawn: the active one, else the nearest open request in range.
      let want = active?.s ?? null;
      if (!want) {
        let bd = SHOW_R;
        for (const s of spots) {
          if (done().includes(s.r.id)) continue;
          const dd = Math.hypot(hp.x - s.giver.x, hp.z - s.giver.z);
          if (dd < bd) { bd = dd; want = s; }
        }
      }
      if (want) showGiver(want); else hideGiver();
      if (giver) {
        const s = giver.s, dd = Math.hypot(hp.x - s.giver.x, hp.z - s.giver.z);
        near = dd < TALK_R && hero.state === 'ground' && Math.abs(hp.y - 0.9) < 2.5 && combat.enemies.engaged.length === 0 && (!active || active.phase === 'return');
        // They turn to Spider-Man when he comes close.
        const wantYaw = dd < 6 ? Math.atan2(hp.x - s.giver.x, hp.z - s.giver.z) : s.yaw;
        let dy = wantYaw - giver.face; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        giver.face += dy * Math.min(1, dt * 4);
        giver.m.orient.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), giver.face);
        giver.m.animator.update(dt);
        if (bubble) {
          const show = (!active || active.phase === 'return') && !talking;
          bubble.visible = show;
          bubble.position.set(s.giver.x, 2.45 + Math.sin(performance.now() / 300) * 0.06, s.giver.z);
          bubble.quaternion.copy(g.camera.quaternion);
        }
      }
      if (active?.phase === 'task') {
        if (active.list && active.list.every((e) => !e.alive || ['out', 'webbed', 'pinned'].includes(e.state))) { g.caption?.('CREW BUSTED!'); toReturn(); }
        if (active.item) {
          active.item.rotation.y += dt * 1.2;
          if (Math.hypot(hp.x - active.at.x, hp.y - active.at.y - 0.6, hp.z - active.at.z) < 2.4) {
            const s = active.s;
            ui.say([{ who: 'peter', text: s.r.task.found ?? 'Got it.' }]);
            toReturn();
          }
        }
      }
    },
    mapIcons() { return spots.filter((s) => !done().includes(s.r.id)).map((s) => ({ x: s.giver.x, z: s.giver.z, kind: 'request' })); },
    // The tracker: requests done of all.
    count() { return [done().length, spots.length]; },
    // A story mission or quit: the running request lets go (the crew leaves, the item goes home).
    stop() {
      if (active?.list) for (const e of active.list) combat.enemies.remove(e);
      if (active?.item) scene.remove(active.item);
      if (active) g.waypoint(null);
      active = null; talking = false; hideGiver();
      if (bubble) bubble.visible = false;
    },
    state() { return { active: active ? { id: active.s.r.id, phase: active.phase } : null, near, giver: giver?.s.r.id ?? null, done: [...done()] }; },
    spots,
  };
}
