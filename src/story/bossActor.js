import { createBody, placeBody, applyDv } from '../physics/ledger.js';
import { applyGravity } from '../physics/aero.js';
import { G } from '../physics/constants.js';
import { ARCHETYPES } from '../combat/enemies.js';
import { characterById } from '../roster/characters.js';
import { makePuppet, setPuppet } from './puppet.js';

// The body every boss shares: the roster model (the same one the player can pick) driven by the
// poser, a body on the collision world, and an entry in the enemy list so every hero move works on
// it (lunges, webs, yanks, finishers, gadgets). The enemy AI skips it (e.boss); hits come here and
// on to the boss module. Attacks are telegraphed through the same windup event the spider-sense
// reads, and land at a fixed moment, so a dodge beats them and a late dodge is a perfect one.

let nextBossId = 500000;

export function createBossActor(ctx, opts) {
  const { scene, world, assets, combat, hero, buildCharacter, createPoser, getSettings } = ctx;
  const def = characterById(opts.char);
  const model = buildCharacter(assets, def);
  scene.add(model.root);
  const poser = createPoser(model);
  const puppet = makePuppet();
  const body = createBody({ mass: opts.mass ?? def.mass ?? 90 });
  const p0 = opts.at;
  placeBody(body, p0.x, p0.y ?? 0.9, p0.z, 0, 0, 0);
  const radius = opts.radius ?? 0.45;
  const C = {};
  const poseEvents = [];
  const hurt = model.outfitMat?.userData?.hurt ?? { value: 0 };

  const a = {
    def, model, body, poser, puppet,
    name: opts.name ?? def.name.toUpperCase(),
    facing: opts.facing ?? 0,
    flying: false,
    grounded: true,
    hitWall: null,      // the wall normal hit this step, while moving fast (Rhino's charges)
    arena: opts.arena ?? null,
    armor: opts.armor ?? 0,  // 0 takes full damage, 1 takes none
    poise: opts.poise ?? 60, poiseMax: opts.poise ?? 60,
    onHit: null,        // (args) => { dealt } overrides the default damage rule
    onYank: null,       // (near) => true when the module handled a web yank on the boss
    onWeb: null,        // a web shot landed
    noRope: false,      // the hero's yank cannot move him (Rhino)
    poseState: 'ground',
    dmgScale: 1,
  };
  const A = { ...ARCHETYPES.brute, ...(opts.A ?? {}), hp: opts.hp };
  const e = {
    id: nextBossId++, boss: a, faction: 'boss', arch: opts.arch ?? 'brute', A, level: 1, body,
    hp: opts.hp, maxHp: opts.hp, state: 'engage', t: 0, alive: true, alerted: true, cooldown: 0, web: 0,
    facing: a.facing, onGround: true, strikeAt: 0, hitThisAttack: false, lastHitT: 9, shieldBroken: true,
    disarmed: false, outT: 0, pin: null, look: 0,
    model: { root: model.root, hurt, animator: { play() {}, update() {} }, mat: { dispose() {} } },
  };
  a.e = e;
  combat.enemies.list.push(e);
  let attack = null, guardHits = 0;
  a.counter = () => a.windup({ t: 0.45, reach: 3.4, arc: 2.6, dmg: 9, push: 13, pose: 'uppercut', unblockable: true, recover: 0.5 });

  const diffDmg = () => ({ friendly: 0.55, amazing: 1, spectacular: 1.35, ultimate: 1.7 }[getSettings().difficulty] ?? 1);

  a.toHero = () => {
    const h = hero.body.p, p = body.p;
    const dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz) || 1;
    return { dx, dz, d, ux: dx / d, uz: dz / d, dy: h.y - p.y };
  };
  a.face = (yaw, dt, rate = 8) => {
    let df = yaw - a.facing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    a.facing += df * Math.min(1, dt * rate);
  };
  a.faceHero = (dt, rate = 8) => { const t = a.toHero(); a.face(Math.atan2(t.ux, t.uz), dt, rate); };
  // Feet on the ground: friction toward a wanted velocity.
  let wantSpeed = 0, stuckT = 0;
  a.move = (vx, vz, dt, accel = 30) => {
    wantSpeed = Math.hypot(vx, vz);
    if (!a.grounded && !a.flying) return;
    const v = body.v, ax = vx - v.x, az = vz - v.z, l = Math.hypot(ax, az), lim = accel * dt, k = l > lim ? lim / l : 1;
    applyDv(body, 'surface', ax * k, 0, az * k);
  };
  let punchN = 0;
  a.pose = (type, extra = {}) => poseEvents.push({ type, n: punchN++, ...extra });
  a.state = (s) => { e.state = s; e.t = 0; };
  // A telegraphed attack: wind up for t seconds (spider-sense fires now), then strike.
  // reach / arc (radians either side of facing) decide a melee hit; onStrike replaces that.
  a.windup = ({ t = 0.6, reach = 2.6, arc = 1.2, dmg = 12, unblockable = false, ranged = false, recover = 0.7, pose = 'punch', push = 6, onStrike = null, track = true, warn = null }) => {
    attack = { t, reach, arc, dmg, unblockable, ranged, recover, pose, push, onStrike, track, struck: false };
    e.strikeAt = t;
    e.A = { ...A, reach, ranged, unblockable };
    a.state('windup');
    combat.emit({ type: 'enemyWindup', e, at: t, ranged, unblockable });
    // The anticipation pose (spec 1.10): every boss attack winds up visibly; an area attack (a slam,
    // a quake, a sweep) also marks its reach on the ground until it lands.
    a.pose('windup', { kind: pose, t });
    // warn: { r, ahead } where the blow really lands (ahead metres in front of him).
    if (warn || pose === 'slamStart' || (arc >= 2.5 && reach <= 12)) {
      const r = warn?.r ?? reach, ah = warn?.ahead ?? 0;
      combat.emit({ type: 'groundWarn', at: { x: body.p.x + Math.sin(a.facing) * ah, y: body.p.y - 0.9, z: body.p.z + Math.cos(a.facing) * ah }, r, t });
    }
  };
  a.attacking = () => e.state === 'windup' || e.state === 'strike' || e.state === 'recover';
  a.meleeHit = (reach, arc, dmg, push = 6, unblockable = false) => {
    const t = a.toHero();
    const ang = Math.atan2(t.ux, t.uz) - a.facing;
    const da = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
    if (t.d < reach && da < arc && Math.abs(t.dy) < 2.6) {
      return combat.heroHit({ dmg: dmg * diffDmg() * a.dmgScale, dir: { x: t.ux * push / 6, z: t.uz * push / 6 }, from: e, unblockable });
    }
    combat.emit({ type: 'enemyMiss', e });
    return false;
  };
  a.hurtHero = (dmg, dir, unblockable = true) => combat.heroHit({ dmg: dmg * diffDmg() * a.dmgScale, dir, from: e, unblockable });
  a.stun = (t = 2.4) => { if (e.state === 'out') return; attack = null; a.state('stun'); e.stunFor = t; a.poise = a.poiseMax; a.pose('heroHurt'); a.pose('dazed', { t }); };
  a.stunned = () => e.state === 'stun';
  a.setAway = (away) => { if (away) a.state('away'); else if (e.state === 'away') a.state('engage'); };
  a.hpFrac = () => Math.max(0, e.hp / e.maxHp);
  // floor(): the health fraction this phase cannot go below (each mechanic must be played).
  a.floor = () => 0;
  a.damage = (dmg) => {
    const fl = a.floor() * e.maxHp;
    e.hp = e.hp > fl ? Math.max(fl, e.hp - dmg) : e.hp;
    e.lastHitT = 0;
    hurt.value = 1;
    return dmg;
  };

  // A hit from the hero (enemies.hit routes boss entries here).
  a.hit = (args) => {
    if (!e.alive || e.state === 'out' || e.state === 'away') return { dealt: 0, blocked: false };
    if (args.kind === 'web') { a.onWeb?.(args); return { dealt: 0, blocked: false }; }
    if (a.onHit) return a.onHit(args);
    let dmg = Math.min(args.dmg ?? 10, 60); // finishers and one-shots are capped on bosses
    if (args.dmg >= 999) dmg = e.maxHp * 0.08;
    // A boss guards: full damage only in an opening (stunned), some while he recovers from a
    // swing, little otherwise. Openings come from the fight's mechanics, never from mashing.
    const stunned = e.state === 'stun';
    dmg *= stunned ? 1 : e.state === 'recover' ? 0.7 : 1 - a.armor;
    if (!stunned) {
      // Three quick blows on a guarded boss: he shoves you off (a fast, telegraphed counter).
      guardHits = e.lastHitT < 1.3 ? guardHits + 1 : 1;
      if (guardHits >= 3 && !a.attacking() && a.counter) { guardHits = 0; a.counter(); }
      else if (!a.attacking()) a.pose('heroHurt');
    }
    const dir = args.dir ?? { x: 0, z: 0 };
    const k = Math.min(1, 160 / body.mass);
    applyDv(body, 'surface', dir.x * (args.push ?? 3) * k * 0.4, 0, dir.z * (args.push ?? 3) * k * 0.4);
    return { dealt: a.damage(dmg), blocked: false };
  };
  a.defeat = () => { attack = null; a.state('out'); e.alive = true; a.pose('defeat'); };
  a.yank = (near) => (a.onYank ? a.onYank(near) : false);

  function attackStep(dt) {
    // A recovery (or strike) a module set by hand, with no attack behind it, still ends.
    if (!attack) { if ((e.state === 'recover' || e.state === 'strike') && e.t > 0.8) a.state('engage'); return; }
    if (e.state === 'windup') {
      if (attack.track) a.faceHero(dt, 5);
      if (e.t >= attack.t) {
        attack.struck = true;
        a.state('strike');
        a.pose(attack.pose);
        if (attack.onStrike) attack.onStrike(); else a.meleeHit(attack.reach, attack.arc, attack.dmg, attack.push, attack.unblockable);
      }
    } else if (e.state === 'strike' && e.t > 0.15) a.state('recover');
    else if (e.state === 'recover' && e.t > attack.recover) { attack = null; a.state('engage'); }
  }

  // After the module has steered: forces, collision, timers, the pose.
  a.step = (dt, g = G[getSettings().gravity] ?? G.comic) => {
    e.t += dt;
    e.lastHitT += dt;
    hurt.value = Math.max(0, hurt.value - dt * 5);
    // An opening shows: a pulsing glow while he is stunned (spec 1.10).
    if (e.state === 'stun') hurt.value = Math.max(hurt.value, 0.28 + 0.18 * Math.sin(e.t * 11));
    if (e.state === 'stun') { e.stunFor -= dt; if (e.stunFor <= 0) a.state('engage'); }
    attackStep(dt);
    if (!a.flying) applyGravity(body, g, dt);
    const p = body.p, v = body.v;
    const fast = Math.hypot(v.x, v.z);
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    world.resolveCapsule(body, radius, opts.half ?? 0.5, C);
    a.hitWall = C.wall && fast > 8 ? { nx: C.nx, nz: C.nz, speed: fast } : null;
    a.grounded = !!C.ground || p.y <= 0.91;
    // Walking into something low (a parked car, a bench): after a moment he hops it (his legs).
    if (a.grounded && !a.flying && wantSpeed > 2 && Math.hypot(v.x, v.z) < 0.6 && e.state === 'engage') stuckT += dt; else stuckT = 0;
    if (stuckT > 1.2) { stuckT = 0; applyDv(body, 'surface', Math.sin(a.facing) * 4 + (Math.random() - 0.5) * 4, 8, Math.cos(a.facing) * 4 + (Math.random() - 0.5) * 4); }
    wantSpeed = 0;
    if (p.y < 0.9) { p.y = 0.9; if (v.y < 0) applyDv(body, 'surface', 0, -v.y, 0); a.grounded = true; }
    if (a.grounded && !a.flying && ['stun', 'out', 'windup', 'strike', 'recover'].includes(e.state)) {
      const k = Math.min(1, 8 * dt); applyDv(body, 'surface', -v.x * k, 0, -v.z * k);
    }
    // Arena: a roof boss stays on the roof.
    const ar = a.arena;
    if (ar && !a.flying) {
      const m = radius + 0.4;
      // Like a wall: the position is held and the velocity into it removed (a surface push).
      if (p.x < ar.minX + m) { p.x = ar.minX + m; if (v.x < 0) applyDv(body, 'surface', -v.x, 0, 0); }
      if (p.x > ar.maxX - m) { p.x = ar.maxX - m; if (v.x > 0) applyDv(body, 'surface', -v.x, 0, 0); }
      if (p.z < ar.minZ + m) { p.z = ar.minZ + m; if (v.z < 0) applyDv(body, 'surface', 0, 0, -v.z); }
      if (p.z > ar.maxZ - m) { p.z = ar.maxZ - m; if (v.z > 0) applyDv(body, 'surface', 0, 0, -v.z); }
    }
    // Keep off the hero (a soft push), unless flying past.
    const t = a.toHero();
    const keep = radius + 0.45;
    if (t.d < keep && Math.abs(t.dy) < 1.8 && e.state !== 'out') { p.x -= t.ux * (keep - t.d); p.z -= t.uz * (keep - t.d); }
    e.facing = a.facing;
    e.onGround = a.grounded;
    // 'perch': crouched on a branch or a ledge (the poser's ground idle, held in the air).
    const st = a.poseState === 'perch' ? 'ground' : a.flying ? (a.poseState === 'ground' ? 'glide' : a.poseState) : a.grounded ? 'ground' : 'air';
    setPuppet(puppet, p, v, a.facing, e.state === 'out' && a.grounded ? 'ground' : st);
    poser.update(puppet, dt, poseEvents, p);
    model.updateGear?.(dt, puppet);
    poseEvents.length = 0;
  };

  a.dispose = () => {
    scene.remove(model.root);
    model.outfitMat?.dispose?.(); // per model; geometry and gear materials are shared
    const i = combat.enemies.list.indexOf(e);
    if (i >= 0) combat.enemies.list.splice(i, 1);
    e.alive = false;
  };
  return a;
}
