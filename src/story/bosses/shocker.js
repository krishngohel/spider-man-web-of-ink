import { applyDv } from '../../physics/ledger.js';
import { createBossActor } from '../bossActor.js';

// Shocker outside the Exchange Street bank (spec 10, Act 1). His vibro blasts are real impulses:
// a cone of force that shoves the hero, and a building between him and you takes it instead.
// Phase 1: blasts from range and a ground quake up close; after three blasts the gauntlets vent
// (a stun window). Phase 2 (60%): a blast brings debris down into the street; web yank a crate
// into him. Phase 3 (30%): triple blasts, a faster vent cycle. Any time: a perfect dodge through a
// blast makes the gauntlets backfire (an opening that needs no crate).

const L = (who, text) => ({ who, text });

export function createShocker(ctx) {
  const { site, hero, props, fx, say, word, shake, world } = ctx;
  const a = createBossActor(ctx, { char: 'shocker', hp: 440, armor: 0.6, poise: 999, mass: 90, at: { x: site.x + 4, y: 0.9, z: site.z + 5 }, facing: Math.PI });
  let phase = 1, think = 1.4, blasts = 0, done = false, burst = 0;
  const lines = {
    p2: [L('shocker', 'Hold still! This thing has two settings: loud and louder.')],
    p3: [L('shocker', 'Okay, okay, LOUDEST.'), L('peter', 'Pretty sure the warranty does not cover that.')],
  };

  // A cone of force from his gauntlets, aimed when the windup ends.
  function vibro(dmg = 11, shove = 15) {
    const p = a.body.p, h = hero.body.p;
    const dx = h.x - p.x, dy = h.y - p.y, dz = h.z - p.z, d = Math.hypot(dx, dy, dz) || 1;
    const dir = { x: Math.sin(a.facing), y: Math.max(-0.4, Math.min(0.4, dy / d)), z: Math.cos(a.facing) };
    const from = { x: p.x + dir.x * 0.8, y: p.y + 0.6, z: p.z + dir.z * 0.8 };
    fx.blast(from, dir, Math.min(36, d + 4));
    shake(0.25);
    ctx.sfx?.({ type: 'land', hard: true, impact: 18 });
    blasts++;
    // In the cone (about 16 degrees off his aim), in range, and nothing solid in between.
    const along = (dx * dir.x + dz * dir.z) / Math.hypot(dx, dz);
    if (d > 36 || along < 0.96) return;
    const block = world.raycast(from.x, from.y, from.z, dx / d, dy / d, dz / d, d - 1, { ground: false });
    if (block) { word('BWOOM!', { x: block.x, y: block.y, z: block.z }, 'hit'); return; }
    if (ctx.heroInvuln()) return; // dodged through it
    const k = shove * (1 - d / 50);
    applyDv(hero.body, 'surface', dir.x * k, 3, dir.z * k);
    a.hurtHero(dmg, { x: dir.x, z: dir.z }, false);
  }
  function quake() {
    const p = a.body.p, t = a.toHero();
    fx.shock({ x: p.x, y: p.y - 0.9, z: p.z }, 7);
    shake(0.6);
    if (t.d < 6.5 && Math.abs(t.dy) < 2) {
      applyDv(hero.body, 'surface', t.ux * 9, 6, t.uz * 9);
      a.hurtHero(12, { x: t.ux, z: t.uz }, true);
    }
  }
  function debris() {
    // The blast hits the bank facade: crates and stone come down in the street.
    for (let i = 0; i < 4; i++) props.add({ x: site.x - 14 + i * 9 + Math.random() * 3, y: 0, z: site.z - 2 + Math.random() * 7, kind: i % 2 ? 'debris' : 'crate' });
    word('KRAKOOM!', { x: site.x, y: 8, z: site.z - 6 }, 'big');
  }
  const vent = (t) => { a.stun(t); word('VENTING!', a.body.p, 'big'); blasts = 0; };

  a.floor = () => (phase === 1 ? 0.6 : phase === 2 ? 0.3 : 0);
  a.onYank = () => false; // a web strike: he is light enough to kick
  let backfireCd = 0, blasting = false; // blasting: the windup in progress is a vibro blast

  function update(dt) {
    if (done) return;
    backfireCd -= dt;
    const e = a.e, t = a.toHero(), f = a.hpFrac();
    if (phase === 1 && f <= 0.6 && !a.attacking()) { phase = 2; say(lines.p2); debris(); }
    if (phase === 2 && f <= 0.3 && !a.attacking()) { phase = 3; say(lines.p3); debris(); }
    if (f <= 0 && e.state !== 'out') { a.defeat(); done = true; word('SHUT DOWN!', a.body.p, 'big'); }
    if (e.state === 'out' || a.stunned() || a.attacking()) { a.step(dt); return; }
    // Keep 9 to 18 m away, strafing; up close, quake.
    a.faceHero(dt, 7);
    const want = t.d < 9 ? -1 : t.d > 18 ? 1 : 0;
    const sx = -t.uz, sz = t.ux;
    a.move((t.ux * want + sx * 0.5) * 4.5, (t.uz * want + sz * 0.5) * 4.5, dt);
    think -= dt;
    if (think <= 0) {
      const ventAfter = phase === 3 ? 6 : 3;
      if (blasts >= ventAfter) { vent(phase === 3 ? 2.6 : 3.2); think = 1; a.step(dt); return; }
      if (t.d < 5) { think = 1.4; blasting = false; a.windup({ t: 0.8, ranged: true, unblockable: true, reach: 7, recover: 0.8, pose: 'slamStart', onStrike: quake }); }
      else if (phase === 3 && burst === 0) { burst = 2; think = 0.5; blasting = true; a.windup({ t: 0.55, ranged: true, reach: 36, recover: 0.15, pose: 'punch', onStrike: () => vibro(9, 12) }); }
      else if (burst > 0) { burst--; think = burst ? 0.45 : 1.6; blasting = true; a.windup({ t: 0.42, ranged: true, reach: 36, recover: 0.15, pose: 'punch', onStrike: () => vibro(9, 12) }); }
      else { think = 1.5 + Math.random() * 0.8; blasting = true; a.windup({ t: 0.7, ranged: true, reach: 36, recover: 0.5, pose: 'punch', onStrike: () => vibro() }); }
    }
    a.step(dt);
  }

  return {
    actor: a,
    get done() { return done; },
    get phase() { return phase; },
    get state() { return { phase, hp: a.hpFrac(), blasts, state: a.e.state }; },
    update,
    onEvent(ev) {
      if (done || ev.type !== 'dodge' || !ev.perfect || backfireCd > 0 || a.e.state !== 'windup' || !blasting || (ev.e && ev.e !== a.e)) return;
      backfireCd = 6;
      vent(2.6);
      word('BACKFIRE!', a.body.p, 'big');
    },
    setPhase(n) {
      if (n >= 2 && phase < 2) { phase = 2; a.e.hp = a.e.maxHp * 0.6; debris(); }
      if (n >= 3 && phase < 3) { phase = 3; a.e.hp = a.e.maxHp * 0.3; debris(); }
    },
    dispose() { a.dispose(); props.clear(); },
  };
}
