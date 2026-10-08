// Retargets motion-capture clips onto the game's 65-bone Quaternius skeleton and packs them into
// one GLB (ported from Gotham). Sources: Meshy auto-rig clips (24 bones, --map meshy, the five
// kicks) and Mixamo clips on Y Bot (--map mixamo; FBX converted by scripts/fbx2glb.mjs). Both are
// T-poses like ours, so rotations transfer as world-space deltas from the bind pose.
//
//   node scripts/retarget-mocap.mjs [--map meshy|mixamo] [--append] [--fps 30] [--keep-travel]
//        [--out file.glb] [--data file.js|none]
//        Name=C:/path/clip.glb[:limb][@contact][!noaim][~mirror][%loop][%air] ...
// %loop (idles, swings, dances, story acting): kept whole, not eased into the idle, not aimed, and
// the hips keep their own sway (only the drift from first to last frame is removed, so it loops).
// %air (falls, swings, hangs): the pose is not dropped onto the ground by its lowest toe, and the
// hips' own rise and fall goes (the hero's physics owns the height).
// :hand (or :hand_l / :hand_r) makes the contact the hand's farthest reach (punches).
// :limb names the striking limb (default: whichever foot goes highest); its highest frame is the
// contact frame, unless @seconds (source clip time) sets it. !noaim keeps the clip's own heading
// (evades, reactions) instead of turning it so the strike lands straight ahead. ~mirror also
// writes Name_M, the same move with left and right swapped. --append keeps the clips already in
// the output file and in src/combat/clipData.js. Horizontal hips travel is not baked into the clip: it
// is written per frame to src/config/mocapData.js as root motion, which combat applies to
// the hero's position, so planted feet do not slide and a stepping kick really steps. The
// clip is turned so that the limb, root motion included, lands straight ahead at contact.
//
// Both rigs skin the same mesh in the same bind pose, so rotations transfer as world-space
// deltas: delta = Qsrc(t) * inv(Qsrc(bind)); Qtgt(t) = delta * Qtgt(bind), then back to target
// local space through the target hierarchy. Unmapped target bones (root, fingers, toe leaves)
// keep the game's Idle_Loop pose. Hips translation drives pelvis position relative to the
// idle pelvis (vertical kept; net horizontal travel removed unless --keep-travel). Output is
// resampled to --fps, trimmed to the motion, and eased into and out of Idle_Loop's first frame.
// Prints each clip's duration and an estimated contact frame (kicking foot's farthest reach).
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo-relative defaults, whatever the working directory.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inRepo = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const args = process.argv.slice(2);
const opt = { out: 'public/assets/anims_combat.glb', fps: 30, keepTravel: false, target: 'public/assets/hero_m.glb', idle: 'public/assets/anims1.glb', map: 'meshy', append: false };
const jobs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--fps') opt.fps = Number(args[++i]);
  else if (a === '--keep-travel') opt.keepTravel = true;
  else if (a === '--target') opt.target = args[++i];
  else if (a === '--map') opt.map = args[++i];
  else if (a === '--append') opt.append = true;
  else if (a === '--data') opt.data = args[++i];
  else if (a.includes('=')) {
    const [name, spec0] = a.split('=');
    let spec = spec0;
    const flags = new Set();
    for (let f; (f = spec.match(/%(loop|air)$/)); ) { flags.add(f[1]); spec = spec.slice(0, f.index); }
    const loop = flags.has('loop'), air = flags.has('air');
    const mirror = spec.endsWith('~mirror'); if (mirror) spec = spec.slice(0, -7);
    const noaim = spec.endsWith('!noaim'); if (noaim) spec = spec.slice(0, -6);
    const m = spec.match(/^(.*?)(?::(\w+))?(?:@([\d.]+))?$/);
    jobs.push({ name, file: m[1], limb: m[2] ?? 'auto', contactAt: m[3] ? Number(m[3]) : null, noaim: noaim || loop, mirror: false, loop, air });
    if (mirror) jobs.push({ name: name + '_M', file: m[1], limb: m[2] ? swapLR(m[2]) : 'auto', contactAt: m[3] ? Number(m[3]) : null, noaim: noaim || loop, mirror: true, loop, air });
  }
}
if (!jobs.length) { console.error('no clips given (Name=file.glb)'); process.exit(1); }
opt.out = inRepo(opt.out); opt.target = inRepo(opt.target); opt.idle = inRepo(opt.idle);

function swapLR(n) { return n.replace(/_l$/, '_R_').replace(/_r$/, '_l').replace(/_R_$/, '_r'); }

// Source bone -> target bone. Meshy names its spine chain from the top down: Spine02 sits on
// the hips and Spine carries the shoulders. Mixamo's runs bottom up (Spine on the hips).
const MESHY = {
  Hips: 'pelvis', Spine02: 'spine_01', Spine01: 'spine_02', Spine: 'spine_03', neck: 'neck_01', Head: 'Head',
  LeftShoulder: 'clavicle_l', LeftArm: 'upperarm_l', LeftForeArm: 'lowerarm_l', LeftHand: 'hand_l',
  RightShoulder: 'clavicle_r', RightArm: 'upperarm_r', RightForeArm: 'lowerarm_r', RightHand: 'hand_r',
  LeftUpLeg: 'thigh_l', LeftLeg: 'calf_l', LeftFoot: 'foot_l', LeftToeBase: 'ball_l',
  RightUpLeg: 'thigh_r', RightLeg: 'calf_r', RightFoot: 'foot_r', RightToeBase: 'ball_r',
};
const MIXAMO = {
  Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03', Neck: 'neck_01', Head: 'Head',
  LeftShoulder: 'clavicle_l', LeftArm: 'upperarm_l', LeftForeArm: 'lowerarm_l', LeftHand: 'hand_l',
  RightShoulder: 'clavicle_r', RightArm: 'upperarm_r', RightForeArm: 'lowerarm_r', RightHand: 'hand_r',
  LeftUpLeg: 'thigh_l', LeftLeg: 'calf_l', LeftFoot: 'foot_l', LeftToeBase: 'ball_l',
  RightUpLeg: 'thigh_r', RightLeg: 'calf_r', RightFoot: 'foot_r', RightToeBase: 'ball_r',
};
// Mixamo's fingers too (pointing, clapping, fists): HandIndex1..3 -> index_01..03_l and so on.
for (const [side, s] of [['Left', 'l'], ['Right', 'r']]) {
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (let k = 1; k <= 3; k++) MIXAMO[`${side}Hand${f}${k}`] = `${f.toLowerCase()}_0${k}_${s}`;
}
const MAP = opt.map === 'mixamo' ? MIXAMO : MESHY;
// Mixamo bones arrive as "mixamorig:Hips", or "mixamorigHips" once three has sanitized the name.
const norm = (n) => n.replace(/^mixamorig\d*:?/, '');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const V = (a) => new THREE.Vector3(...a), Q = (a) => new THREE.Quaternion(...a);
// Rotation of a possibly scaled matrix (the Meshy armature carries a 0.01 unit scale).
const rotationOf = (m) => { const q = new THREE.Quaternion(); m.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };

// ---- rig description from a glTF document: joints, parents, rest TRS, bind world matrices ----
function describeRig(doc) {
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices();
  const info = new Map();
  const byNode = new Map();
  joints.forEach((node, i) => {
    const m = new THREE.Matrix4().fromArray(ibm.getElement(i, [])).invert();
    const bindPos = new THREE.Vector3(), bindRot = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(bindPos, bindRot, s);
    const j = { name: norm(node.getName()), node, parent: null, children: [], t: V(node.getTranslation()), r: Q(node.getRotation()), s: V(node.getScale()), bindRot, bindPos };
    info.set(j.name, j);
    byNode.set(node, j);
  });
  for (const j of info.values()) {
    const p = j.node.getParentNode();
    j.parent = p && byNode.has(p) ? byNode.get(p) : null;
    if (j.parent) j.parent.children.push(j);
    // Transform of the joint's non-joint ancestors (armature scale, etc.).
    j.above = new THREE.Matrix4();
    let a = j.parent ? null : p;
    while (a) { j.above.premultiply(new THREE.Matrix4().compose(V(a.getTranslation()), Q(a.getRotation()), V(a.getScale()))); a = a.getParentNode(); }
  }
  const order = [];
  const visit = (j) => { order.push(j); for (const c of j.children) visit(c); };
  for (const j of info.values()) if (!j.parent) visit(j);
  return { info, order, roots: order.filter((j) => !j.parent) };
}

// ---- animation sampling ----
function channelsOf(anim) {
  const chans = new Map();
  for (const ch of anim.listChannels()) {
    const node = norm(ch.getTargetNode().getName()), path = ch.getTargetPath();
    const s = ch.getSampler();
    const times = Array.from(s.getInput().getArray()), values = Array.from(s.getOutput().getArray());
    chans.set(`${node}.${path}`, { times, values, size: s.getOutput().getElementSize(), interp: s.getInterpolation() });
  }
  return chans;
}
function sample(ch, t, out) {
  const { times, values, size, interp } = ch;
  let i = 0;
  while (i < times.length - 1 && times[i + 1] <= t) i++;
  const j = Math.min(i + 1, times.length - 1);
  const k = interp === 'STEP' || j === i ? 0 : THREE.MathUtils.clamp((t - times[i]) / (times[j] - times[i]), 0, 1);
  if (size === 4) {
    const a = new THREE.Quaternion().fromArray(values, i * 4), b = new THREE.Quaternion().fromArray(values, j * 4);
    return out.copy(a).slerp(b, k);
  }
  const a = new THREE.Vector3().fromArray(values, i * 3), b = new THREE.Vector3().fromArray(values, j * 3);
  return out.copy(a).lerp(b, k);
}

// World rotation of every source joint at time t (rotations only; uniform armature scale
// does not change them).
function sourceWorldRotations(rig, chans, t) {
  const world = new Map();
  const q = new THREE.Quaternion();
  for (const j of rig.order) {
    const rot = chans.get(`${j.name}.rotation`);
    const local = rot ? sample(rot, t, q).clone() : j.r.clone();
    const parent = j.parent ? world.get(j.parent.name) : rotationOf(j.above);
    world.set(j.name, parent.clone().multiply(local));
  }
  return world;
}
function sourceHipsPosition(rig, chans, t, mirror = false) {
  const hips = rig.info.get('Hips');
  const tr = chans.get('Hips.translation');
  const local = tr ? sample(tr, t, new THREE.Vector3()) : hips.t.clone();
  const w = local.applyMatrix4(hips.above).multiplyScalar(rig.hipScale ?? 1);
  if (mirror) w.x = -w.x;
  return w;
}

// ---- target ----
const targetDoc = await io.read(opt.target);
const target = describeRig(targetDoc);
const idleDoc = await io.read(opt.idle);
const idleAnim = idleDoc.getRoot().listAnimations().find((a) => a.getName() === 'Idle_Loop');
const idleChans = channelsOf(idleAnim);
const idleRot = new Map(), idlePos = new Map();
for (const j of target.order) {
  const r = idleChans.get(`${j.name}.rotation`);
  idleRot.set(j.name, r ? new THREE.Quaternion().fromArray(r.values, 0) : j.r.clone());
  const p = idleChans.get(`${j.name}.translation`);
  idlePos.set(j.name, p ? new THREE.Vector3().fromArray(p.values, 0) : j.t.clone());
}
const pelvis = target.info.get('pelvis');
const rootRot = target.roots[0].bindRot.clone();
const idlePelvisWorld = idlePos.get('pelvis').clone().applyQuaternion(rootRot);
const bindRotOf = (name) => target.info.get(name).bindRot;

// Mixamo-style pose -> target local rotations for one frame. `yaw` turns the whole pose
// about the vertical axis (used to aim the kick straight ahead).
// A left-right mirror of a world rotation (x stays, the turn about y and z flips).
const mirrorQ = (q) => new THREE.Quaternion(q.x, -q.y, -q.z, q.w);
function retargetFrame(srcRig, chans, t, yaw = 0, mirror = false) {
  const srcWorld = sourceWorldRotations(srcRig, chans, t);
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const world = new Map();
  const locals = new Map();
  const srcOf = new Map(Object.entries(MAP).map(([s, tg]) => [tg, s]));
  for (const j of target.order) {
    const parentWorld = j.parent ? world.get(j.parent.name) : new THREE.Quaternion();
    const src = srcOf.get(mirror ? swapLR(j.name) : j.name);
    let local, w;
    if (src && srcRig.info.has(src)) {
      const sj = srcRig.info.get(src);
      let delta = srcWorld.get(src).clone().multiply(sj.bindRot.clone().invert());
      if (mirror) delta = mirrorQ(delta);
      w = yawQ.clone().multiply(delta).multiply(bindRotOf(j.name));
      local = parentWorld.clone().invert().multiply(w);
    } else {
      local = idleRot.get(j.name).clone();
      w = parentWorld.clone().multiply(local);
    }
    world.set(j.name, w);
    locals.set(j.name, local.normalize());
  }
  return { locals, world };
}

// Positions of target joints for a frame (for contact and planting diagnostics).
function targetPositions(locals, pelvisLocalPos) {
  const pos = new Map(), worldQ = new Map();
  for (const j of target.order) {
    const local = locals.get(j.name);
    if (!j.parent) { pos.set(j.name, j.t.clone()); worldQ.set(j.name, local.clone()); continue; }
    const pq = worldQ.get(j.parent.name), pp = pos.get(j.parent.name);
    const tr = j.name === 'pelvis' ? pelvisLocalPos : j.t;
    pos.set(j.name, tr.clone().applyQuaternion(pq).add(pp));
    worldQ.set(j.name, pq.clone().multiply(local));
  }
  return pos;
}

const ease = (k) => k * k * (3 - 2 * k);
const idleLocalPelvis = idlePelvisWorld.clone().applyQuaternion(rootRot.clone().invert());
const idleLowestToe = (() => { const p = targetPositions(idleRot, idleLocalPelvis); return Math.min(p.get('ball_l').y, p.get('ball_r').y); })();

async function retargetClip({ name, file, limb, contactAt, noaim, mirror, loop, air }) {
  const doc = await io.read(file);
  const rig = describeRig(doc);
  // FBX exports carry an empty 'Take 001' beside the real one; take the longest.
  const animDur = (a) => Math.max(0, ...a.listChannels().map((c) => { const t = c.getSampler().getInput().getArray(); return t[t.length - 1]; }));
  const anim = doc.getRoot().listAnimations().reduce((b, a) => (animDur(a) > animDur(b) ? a : b));
  // Hips travel in our metres: Mixamo FBX arrives in centimetres on a taller body.
  const hipsRest = rig.info.get('Hips');
  rig.hipScale = idlePelvisWorld.length() / hipsRest.t.clone().applyMatrix4(hipsRest.above).length();
  const chans = channelsOf(anim);
  let dur = 0;
  for (const c of chans.values()) dur = Math.max(dur, c.times[c.times.length - 1]);
  const dt = 1 / opt.fps;
  const n = Math.floor(dur / dt) + 1;
  // Pass A: full-rate frames, unyawed, to find the move and the kick direction.
  const raw = [];
  for (let i = 0; i < n; i++) raw.push({ t: i * dt, locals: retargetFrame(rig, chans, i * dt, 0, mirror).locals, hips: sourceHipsPosition(rig, chans, i * dt, mirror) });
  const energy = raw.map((f, i) => {
    if (i === 0) return 0;
    let e = 0;
    for (const j of target.order) e += Math.abs(f.locals.get(j.name).angleTo(raw[i - 1].locals.get(j.name)));
    return e + f.hips.distanceTo(raw[i - 1].hips) * 10;
  });
  const peak = Math.max(...energy);
  const active = energy.map((e) => e > peak * 0.4);
  let first = active.indexOf(true), last = active.lastIndexOf(true);
  if (first < 0 || loop) { first = 0; last = n - 1; }
  const start = loop ? 0 : Math.max(0, first - Math.round(0.1 * opt.fps));
  const end = loop ? n - 1 : Math.min(n - 1, last + Math.round(0.15 * opt.fps));
  const idx = [];
  for (let i = start; i <= end; i++) idx.push(i);
  const h0 = raw[start].hips.clone();
  // Hips offset from the first kept frame, turned into the aimed frame once `yawQ` exists.
  // Horizontal travel (x and z) becomes root motion; only the vertical motion stays in the clip.
  let yawQ = new THREE.Quaternion();
  const hipsDelta = (hips) => hips.clone().sub(h0).applyQuaternion(yawQ);
  // A loop keeps its hips sway; only the net drift from its first to its last frame goes.
  const drift = raw[end].hips.clone().sub(h0);
  const pelvisLocalAt = (hips, dy = 0, withTravel = opt.keepTravel, k = 0) => {
    const d = hipsDelta(hips);
    if (loop) { const f = idx.length > 1 ? k / (idx.length - 1) : 0; d.x -= drift.x * f; d.z -= drift.z * f; }
    else if (!withTravel) { d.x = 0; d.z = 0; }
    // In the air the physics owns the height (a rope swing's arc, a fall): the pose stays centred.
    if (air) d.y = 0;
    d.y += dy;
    return idlePelvisWorld.clone().add(d).applyQuaternion(rootRot.clone().invert());
  };
  // Contact: the striking limb's highest frame (kicks and knees peak at full extension).
  // With no limb given, the foot that goes highest is the kicking one.
  // Punches (:hand) land at the hand's farthest reach from the hips (a lunging punch included).
  const byReach = limb.startsWith('hand') || limb === 'Head';
  const candidates = limb === 'auto' ? ['ball_l', 'ball_r'] : limb === 'hand' ? ['hand_l', 'hand_r'] : [limb];
  let contactIdx = 0, best = -Infinity;
  const travelled = (i) => { const p = targetPositions(raw[i].locals, pelvisLocalAt(raw[i].hips, 0, !loop)); return p; };
  idx.forEach((i, k) => {
    const p = travelled(i), pel = p.get('pelvis');
    for (const c of candidates) {
      const v = byReach ? Math.hypot(p.get(c).x - pel.x, p.get(c).z - pel.z) : p.get(c).y;
      if (v > best) { best = v; contactIdx = k; limb = c; }
    }
  });
  if (contactAt !== null) contactIdx = Math.max(0, Math.min(idx.length - 1, Math.round(contactAt * opt.fps) - start));
  // Aim: where the limb is at contact relative to where the root started, travel included.
  const pc = travelled(idx[contactIdx]);
  const p0 = travelled(idx[0]);
  const aim = pc.get(limb).clone().sub(p0.get('pelvis'));
  const reach = Math.hypot(aim.x, aim.z);
  const yaw = noaim ? 0 : -Math.atan2(aim.x, aim.z);
  // Pass B: yawed so the kick lands straight ahead, then aligned so the lowest planted toe
  // sits where the idle's does (joint pivots differ between the two rigs).
  yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const lead = Math.round(0.08 * opt.fps), tail = Math.round(0.15 * opt.fps);
  const kept = idx.map((i) => ({ locals: retargetFrame(rig, chans, i * dt, yaw, mirror).locals, hips: raw[i].hips }));
  let lowest = Infinity;
  kept.forEach((f, k) => {
    if (k < lead || k > kept.length - 1 - tail) return;
    const p = targetPositions(f.locals, pelvisLocalAt(f.hips));
    lowest = Math.min(lowest, p.get('ball_l').y, p.get('ball_r').y);
  });
  const dy = air ? 0 : idleLowestToe - lowest;
  const times = [], rot = new Map(target.order.map((j) => [j.name, []])), pelvisPos = [], posFrames = [], root = [];
  kept.forEach((f, k) => {
    times.push(k * dt);
    const hd = hipsDelta(f.hips);
    // Both horizontal components go to the game as root motion (none with --keep-travel or %loop).
    root.push(opt.keepTravel || loop ? [0, 0] : [hd.x, hd.z]);
    const w = loop ? 1 : k < lead ? ease(k / lead) : k > kept.length - 1 - tail ? ease((kept.length - 1 - k) / tail) : 1;
    const pLocal = idleLocalPelvis.clone().lerp(pelvisLocalAt(f.hips, dy, opt.keepTravel, k), w);
    pelvisPos.push(pLocal);
    const locals = new Map();
    for (const j of target.order) {
      const q = w >= 1 ? f.locals.get(j.name).clone() : idleRot.get(j.name).clone().slerp(f.locals.get(j.name), w);
      // Keep neighbouring keys on the same hemisphere so slerp never takes the long way.
      const prev = rot.get(j.name)[k - 1];
      if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      rot.get(j.name).push(q);
      locals.set(j.name, q);
    }
    posFrames.push(targetPositions(locals, pLocal));
  });
  const contact = times[contactIdx];
  // Root motion relative to the clip start; combat moves the hero by this while it plays.
  const root0 = root[0];
  const rootFlat = [];
  for (const [x, z] of root) rootFlat.push(+(x - root0[0]).toFixed(3), +(z - root0[1]).toFixed(3));
  const rootAt = (k) => [rootFlat[k * 2], rootFlat[k * 2 + 1]];
  const limbAt = posFrames[contactIdx].get(limb);
  const lowestToe = posFrames.map((p) => Math.min(p.get('ball_l').y, p.get('ball_r').y));
  console.log(`${name}: source ${dur.toFixed(2)} s, kept ${times[times.length - 1].toFixed(2)} s (frames ${start}-${end} of ${n}), contact ${contact.toFixed(2)} s (${limb} at y ${limbAt.y.toFixed(2)}, ${reach.toFixed(2)} m out), root motion (${rootAt(root.length - 1).map((v) => v.toFixed(2)).join(', ')}) m ((${rootAt(contactIdx).map((v) => v.toFixed(2)).join(', ')}) by contact, limb ${limbAt.z.toFixed(2)} ahead of the root), yaw ${THREE.MathUtils.radToDeg(yaw).toFixed(0)} deg, toe lift ${dy.toFixed(3)} m`);
  if (process.env.DEBUG_T) {
    console.log(`  energy: ${energy.map((e) => e.toFixed(2)).join(' ')}`);
    console.log(`  lowest toe y: ${lowestToe.map((v) => v.toFixed(2)).join(' ')}`);
    console.log(`  ball_l xz: ${posFrames.map((p) => `${p.get('ball_l').x.toFixed(2)},${p.get('ball_l').z.toFixed(2)}`).join(' ')}`);
    console.log(`  ball_r xz: ${posFrames.map((p) => `${p.get('ball_r').x.toFixed(2)},${p.get('ball_r').z.toFixed(2)}`).join(' ')}`);
  }
  const reachOut = { x: +limbAt.x.toFixed(3), y: +limbAt.y.toFixed(3), z: +limbAt.z.toFixed(3) };
  return { name, times, rot, pelvisPos, duration: +times[times.length - 1].toFixed(4), contact: +contact.toFixed(4), limb, reach: reachOut, root: loop ? [] : rootFlat, fps: opt.fps };
}

// ---- output document: the target joint hierarchy (no mesh) plus one animation per clip ----
const out = new Document();
const buffer = out.createBuffer();
const scene = out.createScene('Scene');
const nodes = new Map();
for (const j of target.order) {
  const node = out.createNode(j.name).setTranslation(j.t.toArray()).setRotation(j.r.toArray()).setScale(j.s.toArray());
  nodes.set(j.name, node);
  if (j.parent) nodes.get(j.parent.name).addChild(node);
}
const armature = out.createNode('Armature');
for (const r of target.roots) armature.addChild(nodes.get(r.name));
scene.addChild(armature);

const results = [];
for (const job of jobs) results.push(await retargetClip(job));
// --append: carry over the clips already in the output that this run does not replace.
let keptData = {};
if (opt.append) {
  const { existsSync } = await import('node:fs');
  const { pathToFileURL } = await import('node:url');
  if (existsSync(opt.out)) {
    const old = await io.read(opt.out);
    for (const a of old.getRoot().listAnimations()) {
      if (results.some((r) => r.name === a.getName())) continue;
      const anim = out.createAnimation(a.getName());
      for (const ch of a.listChannels()) {
        const sm = ch.getSampler(), node = nodes.get(ch.getTargetNode().getName());
        if (!node) continue;
        const inp = out.createAccessor().setType('SCALAR').setArray(sm.getInput().getArray().slice()).setBuffer(buffer);
        const outp = out.createAccessor().setType(sm.getOutput().getType()).setArray(sm.getOutput().getArray().slice()).setNormalized(sm.getOutput().getNormalized()).setBuffer(buffer);
        const s2 = out.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation(sm.getInterpolation());
        anim.addSampler(s2).addChannel(out.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(s2));
      }
    }
    const prev = opt.data === 'none' ? { CLIP_DATA: {} } : await import(pathToFileURL(inRepo(opt.data ?? 'src/combat/clipData.js')).href + '?t=' + Date.now());
    keptData = Object.fromEntries(Object.entries(prev.CLIP_DATA).filter(([k]) => !results.some((r) => r.name === k)));
  }
}
for (const clip of results) {
  const anim = out.createAnimation(clip.name);
  const input = out.createAccessor().setType('SCALAR').setArray(new Float32Array(clip.times)).setBuffer(buffer);
  // Rotations as normalized shorts (core glTF allows it for rotation outputs; half the bytes), and
  // a bone that never moves (root, finger tips) as one key.
  const input1 = out.createAccessor().setType('SCALAR').setArray(new Float32Array([0])).setBuffer(buffer);
  for (const j of target.order) {
    let qs = clip.rot.get(j.name);
    const still = qs.every((q) => Math.abs(q.dot(qs[0])) > 0.999999);
    if (still) qs = [qs[0]];
    const arr = new Int16Array(qs.length * 4);
    qs.forEach((q, i) => arr.set([q.x, q.y, q.z, q.w].map((v) => Math.round(THREE.MathUtils.clamp(v, -1, 1) * 32767)), i * 4));
    const output = out.createAccessor().setType('VEC4').setArray(arr).setNormalized(true).setBuffer(buffer);
    const sampler = out.createAnimationSampler().setInput(still ? input1 : input).setOutput(output).setInterpolation('LINEAR');
    const channel = out.createAnimationChannel().setTargetNode(nodes.get(j.name)).setTargetPath('rotation').setSampler(sampler);
    anim.addSampler(sampler).addChannel(channel);
  }
  const parr = new Float32Array(clip.pelvisPos.length * 3);
  clip.pelvisPos.forEach((p, i) => parr.set([p.x, p.y, p.z], i * 3));
  const poutput = out.createAccessor().setType('VEC3').setArray(parr).setBuffer(buffer);
  const psampler = out.createAnimationSampler().setInput(input).setOutput(poutput).setInterpolation('LINEAR');
  anim.addSampler(psampler).addChannel(out.createAnimationChannel().setTargetNode(nodes.get('pelvis')).setTargetPath('translation').setSampler(psampler));
}
await io.write(opt.out, out);
// Generated per-clip data for the game: duration, contact frame, striking limb and root motion.
if (opt.data === 'none') { console.log(`wrote ${opt.out}: ${results.length} clips`); process.exit(0); }
const dataPath = inRepo(opt.data ?? 'src/combat/clipData.js');
const data = { ...keptData, ...Object.fromEntries(results.map((r) => [r.name, { duration: r.duration, contact: r.contact, limb: r.limb, reach: r.reach, fps: r.fps, root: r.root }])) };
const { writeFileSync } = await import('node:fs');
const header = '// Generated by scripts/retarget-mocap.mjs (combat clips); do not edit by hand.\n'
  + '// Per clip: baked duration and contact frame (clip seconds), the striking limb and where it is\n'
  + '// at contact relative to the root (x left, y up, z forward, metres, root motion excluded), and\n'
  + '// root motion per frame at `fps` as [x, z] pairs (metres from the clip start) that combat\n'
  + '// applies to the hero while the clip plays.\n';
writeFileSync(dataPath, header + 'export const CLIP_DATA = ' + JSON.stringify(data, null, 1).replace(/\n\s*(-?\d)/g, ' $1').replace(/\n\s*\]/g, ' ]') + ';\n');
console.log(`wrote ${dataPath}`);
console.log(`wrote ${opt.out}: ${results.map((r) => `${r.name} ${r.duration.toFixed(2)}s contact ${r.contact.toFixed(2)}s`).join('; ')}`);
