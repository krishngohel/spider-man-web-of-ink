import * as THREE from 'three';
import { applyDv, createBody, placeBody } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';
import { BRIDGE } from '../../world/city.js';
import { CAST } from '../cast.js';
import { makePuppet, setPuppet } from '../puppet.js';

// The Green Goblin (spec 10, Act 4 finale).
// Chase: across every district on his glider (thrust, lift, drag), throwing pumpkin bombs back at
// you; he keeps a rubber band on you. Four hits and he turns for the bridge.
// The bridge: he circles the deck between the towers, throwing pumpkin bombs and razor bats, and
// rams. Yank him off the glider during a ram: he falls to the deck, open, until the glider comes
// back for him. Phase 2 (50%): faster, volleys.
// Then he drops MJ off the side (see createCatchMJ).

const L = (who, text) => ({ who, text });
const ROUTE = [[360, 70, 180], [0, 80, -150], [-300, 60, 150], [-620, 70, -90], [-300, 70, -500], [120, 75, -700], [720, 60, -90], [1140, 50, 600], [1500, 45, 700]];

export function createGoblin(ctx) {
  const { site, step, hero, fx, say, word, shake, combat } = ctx;
  const chase = step.type === 'chase';
  const deck = { minX: BRIDGE.towers[0] + 5, maxX: BRIDGE.towers[1] - 5, minZ: BRIDGE.z - BRIDGE.width / 2, maxZ: BRIDGE.z + BRIDGE.width / 2, y: BRIDGE.deckY };
  const start = chase ? { x: ROUTE[0][0], y: ROUTE[0][1], z: ROUTE[0][2] } : { x: (deck.minX + deck.maxX) / 2, y: deck.y + 10, z: BRIDGE.z };
  const a = createBossActor(ctx, { char: 'goblin', hp: 560, armor: 0.5, poise: 999, mass: 90, at: start, arena: chase ? null : deck });
  a.flying = true; a.poseState = 'glide';
  let done = false, failed = false, hits = 0, hitCd = 0, wp = 1, farT = 0, bombT = 2.5, time = 0;
  let phase = 1, mode = chase ? 'chase' : 'circle', modeT = 0, ang = 0, ram = null, falls = 0, pickupT = 0;

  function fly(vx, vy, vz, dt, acc = 30) {
    const v = a.body.v, dx = vx - v.x, dy = vy - v.y, dz = vz - v.z, l = Math.hypot(dx, dy, dz), lim = acc * dt, k = l > lim ? lim / l : 1;
    applyDv(a.body, 'lift', dx * k, dy * k, dz * k);
    if (Math.hypot(v.x, v.z) > 1) a.face(Math.atan2(v.x, v.z), dt, 5);
  }
  function pumpkin() {
    const p = a.body.p, h = hero.body.p, v = hero.body.v;
    combat.projectiles.fire('rocket', { x: p.x, y: p.y, z: p.z }, { x: h.x + v.x * 0.6, y: h.y, z: h.z + v.z * 0.6 }, { dmg: 13 });
    word('HA HA HA!', p, 'small');
  }
  function bats() {
    const p = a.body.p, h = hero.body.p;
    for (let i = -1; i <= 1; i++) combat.projectiles.fire('bullet', { x: p.x, y: p.y + 0.4, z: p.z }, { x: h.x + i * 1.4, y: h.y + 0.3, z: h.z + i * 0.9 }, { dmg: 6 });
  }
  function countHit(w) {
    if (hitCd > 0 || done) return;
    hitCd = 1.6; hits++;
    word(hits >= 4 ? 'TO THE BRIDGE!' : w, a.body.p, 'big');
    applyDv(a.body, 'lift', 0, -3, 0);
    if (hits >= 4) { done = true; say([L('goblin', 'The bridge, Spider-Man! Come and see what I brought you!')]); }
  }

  if (chase) {
    a.onWeb = () => countHit('GOT HIM!');
    a.onHit = () => { countHit('WHAM!'); return { dealt: 0, blocked: false }; };
    a.onYank = () => { countHit('GOTCHA!'); return true; };
  } else {
    a.onYank = () => {
      if (mode !== 'ram') return false;
      const h = hero.body.p, p = a.body.p;
      fx.tether({ x: h.x, y: h.y + 0.5, z: h.z }, { x: p.x, y: p.y, z: p.z });
      setTimeout(() => fx.tether(null), 250);
      a.flying = false; mode = 'falling'; ram = null;
      applyDv(a.body, 'rope', (h.x - p.x) * 0.6 - a.body.v.x, -4 - a.body.v.y, (h.z - p.z) * 0.6 - a.body.v.z);
      word('OFF THE GLIDER!', p, 'big'); shake(0.4);
      return true;
    };
    a.floor = () => Math.max(0, (phase === 1 ? 0.5 : 0) , 0.8 - falls * 0.27) ;
  }
  const baseHit = a.hit;
  a.hit = (args) => (!chase && (mode === 'circle' || mode === 'climb') ? { dealt: 0, blocked: true } : baseHit(args));

  function updateChase(dt) {
    hitCd -= dt;
    const w = ROUTE[wp], p = a.body.p, h = hero.body.p;
    const dx = w[0] - p.x, dy = w[1] - p.y, dz = w[2] - p.z, d = Math.hypot(dx, dy, dz);
    if (d < 18) { wp = (wp + 1) % ROUTE.length; if (wp === 0) wp = 1; }
    const dh = Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z);
    const speed = dh > 100 ? 12 : dh < 30 ? 24 : 19;
    fly((dx / d) * speed, (dy / d) * speed, (dz / d) * speed, dt);
    bombT -= dt;
    if (bombT <= 0 && dh < 60) { bombT = 2.8; pumpkin(); }
    farT = dh > 220 ? farT + dt : 0;
    if (farT > 9) { failed = true; say([L('peter', 'Lost him. He went back toward Oscorp, I can pick him up there.')]); }
  }

  function updateFight(dt) {
    time += dt; modeT += dt; pickupT -= dt;
    const p = a.body.p, h = hero.body.p, t = a.toHero(), f = a.hpFrac();
    if (phase === 1 && f <= 0.5) { phase = 2; say([L('goblin', 'Oh, you are fun. Let us see you catch this!')]); }
    if (f <= 0 && a.e.state !== 'out') { a.defeat(); done = true; a.flying = false; word('GOBLIN DOWN!', p, 'big'); a.step(dt); return; }
    const cx = (deck.minX + deck.maxX) / 2, top = deck.y + 9;
    switch (mode) {
      case 'circle': {
        a.e.state = a.attacking() ? a.e.state : 'away';
        ang += dt * (phase === 2 ? 0.55 : 0.4);
        const wx = cx + Math.cos(ang) * 40, wz = BRIDGE.z + Math.sin(ang) * 14;
        fly((wx - p.x) * 1.4, (top - p.y) * 1.4, (wz - p.z) * 1.4, dt);
        bombT -= dt;
        if (bombT <= 0 && !a.attacking()) { bombT = phase === 2 ? 1.8 : 2.6; a.windup({ t: 0.6, ranged: true, reach: 50, recover: 0.2, pose: 'punch', track: false, onStrike: Math.random() < 0.6 ? pumpkin : bats }); }
        if (modeT > (phase === 2 ? 5 : 7) && !a.attacking()) { mode = 'ramWind'; modeT = 0; a.windup({ t: 1, ranged: true, unblockable: true, reach: 50, recover: 0.05, pose: 'none', onStrike: () => {} }); }
        break;
      }
      case 'ramWind':
        fly(0, 0, 0, dt, 30);
        a.faceHero(dt, 6);
        if (modeT > 1) { mode = 'ram'; modeT = 0; const d = Math.hypot(t.dx, h.y - p.y, t.dz) || 1; ram = { x: t.dx / d, y: (h.y - p.y) / d, z: t.dz / d, hit: false }; a.state('engage'); }
        break;
      case 'ram':
        fly(ram.x * 30, ram.y * 30, ram.z * 30, dt, 70);
        if (!ram.hit && Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z) < 2) { ram.hit = true; a.hurtHero(15, { x: ram.x, z: ram.z }, true); word('WHOOSH!', p, 'hit'); }
        if (p.y < deck.y + 2 || modeT > 2) { mode = 'climb'; modeT = 0; }
        break;
      case 'falling':
        a.poseState = 'air';
        if (a.grounded) { mode = 'down'; modeT = 0; falls++; a.stun(phase === 2 ? 3.4 : 4); fx.shock({ x: p.x, y: p.y - 0.9, z: p.z }, 4); shake(0.5); }
        break;
      case 'down':
        a.poseState = 'ground';
        if (!a.stunned() && modeT > 3.4) { mode = 'climb'; modeT = 0; a.flying = true; a.poseState = 'glide'; say([L('goblin', falls > 1 ? 'Stop DOING that!' : 'Cheap trick!')]); }
        break;
      case 'climb':
        a.e.state = 'away';
        fly((cx - p.x) * 0.5, 10, (BRIDGE.z - p.z) * 0.5, dt);
        if (p.y > top - 1 || modeT > 2.5) { mode = 'circle'; modeT = 0; }
        break;
      default: break;
    }
    a.step(dt);
  }

  return {
    actor: a,
    get done() { return done; },
    get failed() { return failed; },
    get phase() { return chase ? 0 : phase; },
    get state() { return { chase, mode, hits, phase, falls, hp: a.hpFrac(), state: a.e.state }; },
    update(dt) { if (chase) { if (!done && !failed) updateChase(dt); a.step(dt); } else updateFight(dt); },
    setPhase(n) { if (n >= 2 && phase < 2) { phase = 2; a.e.hp = a.e.maxHp * 0.5; } },
    dispose() { a.dispose(); fx.tether(null); },
  };
}

// MJ falls off the side of the bridge (the Goblin's last trick). Web her before she reaches the
// water: a web shot that reaches her (or getting to her) catches her on a line, and the line's
// tension stops the fall (a real rope pull, not a freeze). Miss and the scene starts over.
export function createCatchMJ(ctx) {
  const { hero, scene, fx, word, say, combat } = ctx;
  const model = ctx.buildCharacter(ctx.assets, CAST.mj);
  scene.add(model.root);
  const poser = ctx.createPoser(model), puppet = makePuppet();
  const body = createBody({ mass: 60 });
  const x0 = BRIDGE.towers[1] - 10, z0 = BRIDGE.z + BRIDGE.width / 2 + 18;
  placeBody(body, x0, BRIDGE.deckY + 55, z0);
  let t = 0, caught = null, done = false, failed = false, savedT = 0;
  // She is a web target like an enemy (so the web shot finds her), never hurt.
  const e = {
    id: 700001, faction: 'none', arch: 'brawler', A: { reach: 0, ranged: false }, body, hp: 1, maxHp: 1, state: 'engage', t: 0, alive: true, alerted: true, web: 0, facing: 0, onGround: false, strikeAt: 9, look: 0,
    model: { root: model.root, hurt: { value: 0 }, animator: { play() {}, update() {} }, mat: { dispose() {} } },
    boss: { hit: (args) => { if (args.kind === 'web' && !caught) catchHer(); return { dealt: 0, blocked: true }; }, yank: () => { if (!caught) catchHer(); return true; } },
  };
  combat.enemies.list.push(e);
  say([L('goblin', 'Choose, Spider-Man! Me, or her!'), L('peter', 'MJ!')]);
  function catchHer() {
    caught = { len: Math.max(4, Math.hypot(hero.body.p.x - body.p.x, hero.body.p.y - body.p.y, hero.body.p.z - body.p.z)) };
    word('GOT YOU!', body.p, 'big');
  }
  const actor = { name: 'MJ', hpFrac: () => (caught ? 1 : Math.max(0, (body.p.y - 2) / (BRIDGE.deckY + 53))), e };
  return {
    actor,
    get done() { return done; },
    get failed() { return failed; },
    get phase() { return 1; },
    get state() { return { mj: { ...body.p }, v: { ...body.v }, caught: !!caught }; },
    update(dt) {
      t += dt;
      const p = body.p, v = body.v, h = hero.body.p;
      if (t > 1.2) {
        if (caught) {
          // The web line: a rope from the hero's hand; tension when stretched past its length, plus
          // damping as the line takes her weight.
          const dx = p.x - h.x, dy = p.y - (h.y + 0.5), dz = p.z - h.z, d = Math.hypot(dx, dy, dz) || 1;
          applyDv(body, 'gravity', 0, -22 * dt, 0);
          if (d > caught.len) { const vr = (v.x * dx + v.y * dy + v.z * dz) / d; if (vr > 0) applyDv(body, 'rope', (-dx / d) * vr * 1.05, (-dy / d) * vr * 1.05, (-dz / d) * vr * 1.05); caught.len = Math.max(3, caught.len - dt * 6); }
          applyDv(body, 'drag', -v.x * Math.min(1, dt * 1.5), -v.y * Math.min(1, dt * 1.5), -v.z * Math.min(1, dt * 1.5));
          fx.tether({ x: h.x, y: h.y + 0.5, z: h.z }, { x: p.x, y: p.y + 0.5, z: p.z });
          if (Math.hypot(v.x, v.y, v.z) < 1.5) { savedT += dt; if (savedT > 1 && !done) { done = true; word('SAVED!', p, 'big'); fx.tether(null); } }
        } else applyDv(body, 'gravity', 0, -22 * dt, 0);
        p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
        if (!caught && Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z) < 2.5) catchHer();
        if (p.y < 1.5 && !caught && !failed) { failed = true; word('NO!', p, 'big'); }
      }
      setPuppet(puppet, p, v, 0, caught ? 'hang' : 'air');
      poser.update(puppet, dt, [], p);
    },
    setPhase() {},
    dispose() { scene.remove(model.root); const i = combat.enemies.list.indexOf(e); if (i >= 0) combat.enemies.list.splice(i, 1); fx.tether(null); },
  };
}
