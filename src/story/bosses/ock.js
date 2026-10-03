import { applyDv, placeBody } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';

// Doctor Octopus (spec 10, Act 4), three phases up Oscorp Tower.
// 1. The street: tentacle slams (they bury in the asphalt for a moment: an opening), a wide
//    tentacle sweep, a grab that reels you in and throws you, and anything loose thrown at you.
// 2. The climb: he walks up the tower face on his arms and drops debris on you as you follow.
// 3. The platform near the top, in the storm: the same arms, now planting on the crown; a yank
//    while he is planted tears an arm free and he lurches (an opening). Then finish it.

const L = (who, text) => ({ who, text });

export function createOck(ctx) {
  const { site, hero, props, fx, say, word, shake, city } = ctx;
  const boxes = city.landmarkBoxes.oscorp ?? [];
  const ring = boxes.find((b) => b.max[1] === 256) ?? null;
  const crown = boxes.find((b) => b.max[1] === 300) ?? null;
  const shaft = boxes.reduce((a, b) => (b.max[1] - b.min[1] > a.max[1] - a.min[1] ? b : a), boxes[0]);
  // The south strip of the platform, between the crown and the edge.
  const top = ring && crown ? { minX: ring.min[0] + 1, maxX: ring.max[0] - 1, minZ: crown.max[2] + 0.6, maxZ: ring.max[2] - 0.6, y: 256 } : null;
  const street = { minX: site.x - 40, maxX: site.x + 40, minZ: site.z - 10, maxZ: site.z + 14, y: 0 };
  const a = createBossActor(ctx, { char: 'ock', hp: 640, armor: 0.7, poise: 999, mass: 140, radius: 0.6, at: { x: site.x + 6, y: 0.9, z: site.z + 3 }, arena: street, facing: Math.PI });
  let phase = 1, done = false, think = 1.4, grab = null, climbT = 0, dropT = 2, planted = 0, time = 0, haul = null;
  const lines = {
    p2: [L('ock', 'Enough of this street brawling. Come up, Peter. I have something to show you.'), L('peter', 'He knows my name. Great. Great!')],
    p3: [L('ock', 'Up here we are not so different. Two minds, and the city at our feet.'), L('peter', 'One of us has six arms too many.')],
  };
  a.floor = () => (phase === 1 ? 0.62 : phase === 2 ? 0.62 : 0);

  a.onYank = () => {
    if (phase !== 3 || planted <= 0) return false;
    planted = 0;
    word('TORN FREE!', a.body.p, 'big');
    const t = a.toHero();
    applyDv(a.body, 'rope', t.ux * 5, 1, t.uz * 5);
    a.stun(3.2);
    shake(0.5);
    return true;
  };

  function slam() {
    const p = a.body.p, t = a.toHero();
    const at = { x: p.x + Math.sin(a.facing) * 3, y: p.y - 0.9, z: p.z + Math.cos(a.facing) * 3 };
    fx.shock(at, 5); shake(0.6);
    word('KA-CHUNK!', at, 'hit');
    if (Math.hypot(hero.body.p.x - at.x, hero.body.p.z - at.z) < 4 && Math.abs(t.dy) < 2.5) { applyDv(hero.body, 'surface', t.ux * 8, 6, t.uz * 8); a.hurtHero(14, { x: t.ux, z: t.uz }, true); }
    // The arms are buried for a moment.
    if (phase === 1) setTimeout(() => { if (!done && a.e.state === 'recover') a.stun(1.8); }, 50);
  }
  function startGrab() { grab = { t: 0 }; word('GOT YOU!', a.body.p, 'small'); }
  function throwThing() {
    let prop = props.nearest(a.body.p.x, a.body.p.z);
    if (!prop || Math.hypot(prop.p.x - a.body.p.x, prop.p.z - a.body.p.z) > 12) prop = props.add({ x: a.body.p.x + 2, y: a.body.p.y - 0.9, z: a.body.p.z, kind: 'debris' });
    props.lift(prop, a);
    a.windup({ t: 0.7, ranged: true, reach: 40, recover: 0.5, pose: 'uppercut', onStrike: () => { const h = hero.body.p, v = hero.body.v; props.throwAt(prop, { x: h.x + v.x * 0.3, y: h.y, z: h.z + v.z * 0.3 }, 0.7); } });
  }

  function climbStep(dt) {
    // Up the south face of the shaft on his arms (his own force), to the platform.
    const want = top ? { x: (top.minX + top.maxX) / 2 + 6, y: top.y + 0.9, z: (top.minZ + top.maxZ) / 2 } : { x: site.x, y: 200, z: site.z };
    // Up the face, out past the platform's overhang near the top, then in over the edge.
    const p = a.body.p, faceZ = ring ? ring.max[2] + 1.6 : shaft ? shaft.max[2] + 0.7 : p.z;
    a.flying = true; a.arena = null; a.poseState = 'wall';
    const tx = p.y < want.y - 2 ? want.x : want.x, ty = want.y, tz = p.y < want.y - 2 ? faceZ : want.z;
    applyDv(a.body, 'assist', ((tx - p.x) * 1.5 - a.body.v.x) * Math.min(1, dt * 3), (Math.min(9, (ty - p.y) * 1.2) - a.body.v.y) * Math.min(1, dt * 3), ((tz - p.z) * 1.5 - a.body.v.z) * Math.min(1, dt * 3));
    a.face(Math.PI, dt, 4);
    // Debris on the way up.
    dropT -= dt;
    const h = hero.body.p;
    if (dropT <= 0 && h.y > 10 && h.y < p.y - 6) {
      dropT = 4.2;
      const d = props.add({ x: h.x + (Math.random() - 0.5) * 3, y: p.y, z: h.z + (Math.random() - 0.5) * 3, kind: 'debris' });
      d.p.y = p.y; d.state = 'flying'; d.owner = 'boss'; d.v.x = 0; d.v.y = -2; d.v.z = 0; d.age = 0.1;
      word('LOOK OUT!', d.p, 'small');
    }
    // Close below the platform (under its overhang), he reaches down and hauls you up himself.
    if (top && !haul && Math.abs(p.y - want.y) < 2 && h.y > top.y - 16 && h.y < top.y - 2 && Math.hypot(h.x - p.x, h.z - p.z) < 30) {
      haul = { t: 0 };
      say([L('ock', 'Allow me.')]);
    }
    haulStep(dt);
    // He waits on the platform; the fight goes on when you get there.
    if (Math.abs(p.y - want.y) < 1.5) { a.flying = false; a.arena = top; a.poseState = 'ground'; }
    if (top && h.y > top.y - 3 && Math.hypot(h.x - p.x, h.z - p.z) < 40) { phase = 3; a.flying = false; a.arena = top; a.poseState = 'ground'; say(lines.p3); think = 1.5; }
  }
  function haulStep(dt) {
    const p = a.body.p, h = hero.body.p;
    if (haul) {
      haul.t += dt;
      // Out past the ledge first (you are under its overhang), then up and in over it.
      const out = h.y < top.y + 0.5;
      const tx = out ? h.x : p.x, ty = top.y + (out ? 4 : 2), tz = out ? (ring ? ring.max[2] + 2.5 : h.z + 3) : (top.minZ + top.maxZ) / 2;
      const dx = tx - h.x, dy = ty - h.y, dz = tz - h.z, d = Math.hypot(dx, dy, dz) || 1;
      fx.tether({ x: p.x, y: p.y + 0.8, z: p.z }, { x: h.x, y: h.y + 0.5, z: h.z });
      const v = hero.body.v;
      // Pulled off the wall (or out of a swing) by the arm.
      if (hero.state === 'wall' || hero.state === 'swing' || hero.state === 'hang') { if (hero.swing.active) hero.swing.release(); hero.state = 'air'; }
      applyDv(hero.body, 'rope', ((dx / d) * 18 - v.x) * Math.min(1, dt * 6), ((dy / d) * 18 + 3 - v.y) * Math.min(1, dt * 6), ((dz / d) * 18 - v.z) * Math.min(1, dt * 6));
      if (d < 2.5 || haul.t > 2.5) { haul = null; fx.tether(null); }
    }
  }

  function update(dt) {
    time += dt;
    if (done) { a.step(dt); return; }
    const e = a.e, t = a.toHero(), f = a.hpFrac();
    if (phase === 3 && f <= 0 && e.state !== 'out') { a.defeat(); done = true; word('DOWN, DOCTOR!', a.body.p, 'big'); shake(1); a.step(dt); return; }
    if (phase === 1 && f <= 0.62 && !a.attacking() && !grab) { phase = 2; props.drop(a); say(lines.p2); climbT = 0; }
    if (phase === 2) { climbT += dt; climbStep(dt); a.step(dt); return; }
    if (planted > 0) planted -= dt;
    // Knocked off the platform: he will not let you go that easily (the arm catches you).
    if (phase === 3 && top && !haul && hero.body.p.y < top.y - 6 && hero.body.p.y > top.y - 80) { haul = { t: 0 }; say([L('ock', 'Not yet, Peter. We are not finished.')]); }
    if (haul) { haulStep(dt); a.step(dt); return; }
    if (grab) {
      // A tentacle round you: reeled in, then flung.
      grab.t += dt;
      const h = hero.body.p, p = a.body.p, d = Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z) || 1;
      fx.tether({ x: p.x, y: p.y + 0.8, z: p.z }, { x: h.x, y: h.y + 0.5, z: h.z });
      if (ctx.heroInvuln() && grab.t < 0.3) { grab = null; fx.tether(null); a.state('recover'); a.step(dt); return; }
      applyDv(hero.body, 'rope', ((p.x - h.x) / d) * 30 * dt, 1.5 * dt, ((p.z - h.z) / d) * 30 * dt);
      if (grab.t > 0.7) {
        grab = null; fx.tether(null);
        applyDv(hero.body, 'rope', -t.ux * 14, 7, -t.uz * 14);
        a.hurtHero(13, { x: -t.ux, z: -t.uz }, true);
        word('WHAM!', hero.body.p, 'hit');
        a.state('recover');
      }
      a.step(dt);
      return;
    }
    if (a.stunned() || a.attacking()) { a.step(dt); return; }
    a.faceHero(dt, 5);
    a.move(t.ux * (t.d > 4 ? 4 : 0), t.uz * (t.d > 4 ? 4 : 0), dt);
    think -= dt;
    if (think <= 0) {
      think = (phase === 3 ? 1.0 : 1.3) + Math.random() * 0.7;
      // On the platform he plants an arm on the crown now and then (braced: shoves off blows).
      if (phase === 3 && planted <= 0 && Math.random() < 0.35) { planted = 4; word('BRACED', a.body.p, 'small'); }
      if (t.d > 9 && Math.random() < 0.5) throwThing();
      else if (t.d < 10 && Math.random() < 0.3) a.windup({ t: 0.6, ranged: true, reach: 10, recover: 0.05, pose: 'none', onStrike: startGrab });
      else if (Math.random() < 0.5) a.windup({ t: 0.8, unblockable: true, ranged: true, reach: 7, recover: 0.9, pose: 'slamStart', onStrike: slam, warn: { r: 4, ahead: 3 } });
      else a.windup({ t: 0.6, reach: 5, arc: 2.6, dmg: 11, push: 12, pose: 'uppercut', recover: 0.7 });
    }
    a.step(dt);
  }
  const baseHit = a.hit;
  a.hit = (args) => {
    if (phase === 2) return { dealt: 0, blocked: true };
    if (planted > 0 && !a.stunned()) { word('BRACED!', a.body.p, 'small'); return { dealt: a.damage((args.dmg ?? 10) * 0.1), blocked: false }; }
    return baseHit(args);
  };

  return {
    actor: a,
    get done() { return done; },
    get phase() { return phase; },
    get state() { return { phase, hp: a.hpFrac(), planted: planted > 0, grabbing: !!grab, haul: !!haul, state: a.e.state, top: top ? { y: top.y, x: (top.minX + top.maxX) / 2, z: (top.minZ + top.maxZ) / 2 } : null, ock: { ...a.body.p } }; },
    get objective() { return phase === 2 ? 'Follow Doctor Octopus up Oscorp Tower.' : null; },
    get waypoint() { return phase === 2 && top ? { x: (top.minX + top.maxX) / 2, z: (top.minZ + top.maxZ) / 2 } : null; },
    update,
    setPhase(n) {
      if (n >= 2 && phase < 2) { phase = 2; a.e.hp = a.e.maxHp * 0.62; }
      if (n >= 3 && top) { phase = 3; placeBody(a.body, (top.minX + top.maxX) / 2 + 6, top.y + 0.9, (top.minZ + top.maxZ) / 2); a.flying = false; a.arena = top; }
    },
    dispose() { a.dispose(); props.clear(); fx.tether(null); },
  };
}
