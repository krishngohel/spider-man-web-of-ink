import { describe, it, expect } from 'vitest';
import { createImpactTimeline, createImpactJudge, createActionGate, IMPACT, ACTION_GAP, panelWord, PANEL_WORDS } from '../../src/game/impact.js';
import { actionFocusBox, moveOffFocus, wordBox } from '../../src/ui/wordPlace.js';
import { createCameraRig, CAM } from '../../src/camera/cameraRig.js';
import { createWorld } from '../../src/physics/world.js';
import { createBody } from '../../src/physics/ledger.js';

// Samples a timeline every 5 ms from `from` for `ms`, returning the frames.
const run = (tl, from, ms) => { const out = []; for (let t = from; t <= from + ms; t += 5) out.push({ t: t - from, ...tl.sample(t, {}) }); return out; };

describe('impact frame tiers', () => {
  it('tier 1 is a short flash with no freeze and no panel', () => {
    const tl = createImpactTimeline();
    expect(tl.trigger(1, 1000, 'full')).toBe(1);
    const f = run(tl, 1000, 200);
    expect(f.some((q) => q.freeze || q.panel)).toBe(false);
    const lit = f.filter((q) => q.impact > 0);
    expect(lit.length * 5).toBeLessThanOrEqual(IMPACT.flash + 5);
    expect(lit[0].impact).toBe(1);
  });
  it('tier 2 (Full) beats, then freezes inside the panel for 0.25 to 0.4 s of real time, then releases', () => {
    const tl = createImpactTimeline();
    expect(tl.trigger(2, 0, 'full')).toBe(2);
    const f = run(tl, 0, 800);
    expect(f[0].impact).toBe(1);
    expect(f[0].soft).toBe(false); // the hard black and white beat
    const frozen = f.filter((q) => q.freeze).length * 5;
    expect(frozen).toBeGreaterThanOrEqual(250);
    expect(frozen).toBeLessThanOrEqual(400);
    expect(f.some((q) => q.panel === 1)).toBe(true);
    expect(f.some((q) => q.panel === 2 && !q.freeze)).toBe(true);
    expect(f[f.length - 1]).toMatchObject({ impact: 0, panel: 0, freeze: false });
    expect(tl.active).toBe(false);
  });
  it('Soft: tier 1 dimmer, tier 2 a shorter freeze and never the panel or the hard look', () => {
    const a = createImpactTimeline(), b = createImpactTimeline();
    a.trigger(1, 0, 'soft'); b.trigger(1, 0, 'full');
    const sa = run(a, 0, 100), sb = run(b, 0, 100);
    expect(Math.max(...sa.map((q) => q.impact))).toBeLessThan(Math.max(...sb.map((q) => q.impact)));
    expect(sa.filter((q) => q.impact > 0).length).toBeLessThan(sb.filter((q) => q.impact > 0).length);
    const s2 = createImpactTimeline(), f2 = createImpactTimeline();
    s2.trigger(2, 0, 'soft'); f2.trigger(2, 0, 'full');
    const fs = run(s2, 0, 800), ff = run(f2, 0, 800);
    expect(fs.some((q) => q.panel)).toBe(false);
    expect(fs.every((q) => q.soft)).toBe(true);
    const freezeS = fs.filter((q) => q.freeze).length, freezeF = ff.filter((q) => q.freeze).length;
    expect(freezeS).toBeGreaterThan(0);
    expect(freezeS).toBeLessThan(freezeF);
  });
  it('Off: nothing', () => {
    const tl = createImpactTimeline();
    expect(tl.trigger(1, 0, 'off')).toBe(0);
    expect(tl.trigger(2, 10, 'off')).toBe(0);
    expect(run(tl, 0, 600).every((q) => !q.impact && !q.freeze && !q.panel)).toBe(true);
  });
  it('one freeze per 1.5 s: a second tier 2 soon after plays as a flash; a flash never cuts a freeze short', () => {
    const tl = createImpactTimeline();
    tl.trigger(2, 0, 'full');
    expect(tl.trigger(1, 100, 'full')).toBe(0);
    expect(tl.trigger(2, 150, 'full')).toBe(0);
    run(tl, 0, 1000);
    expect(tl.trigger(2, 1000, 'full')).toBe(1);
    run(tl, 1000, 200);
    expect(tl.trigger(2, 1600, 'full')).toBe(2);
  });
  it('a tier 2 upgrades a running flash', () => {
    const tl = createImpactTimeline();
    tl.trigger(1, 0, 'full');
    expect(tl.trigger(2, 10, 'full')).toBe(2);
  });
});

describe('which blows earn which tier', () => {
  const judge = () => createImpactJudge();
  it('finishers, knockouts and perfect dodge counters get the panel; heavy hits the flash; light hits nothing', () => {
    const j = judge();
    expect(j.tier({ type: 'finisher' })).toBe(2);
    expect(j.tier({ type: 'heroHit', ko: true })).toBe(2);
    expect(j.tier({ type: 'heroHit', counter: true, heavy: false })).toBe(2);
    expect(j.tier({ type: 'heroHit', heavy: true, stop: 0.12 })).toBe(1);
    expect(j.tier({ type: 'heroHit', heavy: true, stop: 0.07 })).toBe(0);
    expect(j.tier({ type: 'heroHit', heavy: false, stop: 0.12 })).toBe(0);
    expect(j.tier({ type: 'word' })).toBe(0);
  });
  it('a boss: the first hit into each opening gets the panel, the rest of the flurry does not', () => {
    const j = judge(), boss = {};
    const hit = (stun) => j.tier({ type: 'heroHit', boss: true, bossStun: stun, target: boss, heavy: false, stop: 0.07 });
    expect(hit(false)).toBe(0);
    expect(hit(true)).toBe(2);
    expect(hit(true)).toBe(0);
    expect(hit(false)).toBe(0);
    expect(hit(true)).toBe(2); // the next opening
  });
  it('panel words vary', () => {
    expect(panelWord(0)).not.toBe(panelWord(1));
    expect(PANEL_WORDS.every((w) => !w.includes('—'))).toBe(true);
  });
});

describe('action shot gate', () => {
  it('at most one every 4 s, none with camera shake off or reduced motion', () => {
    const g = createActionGate();
    expect(g.want(0, { cameraShake: false })).toBe(false);
    expect(g.want(0, { cameraShake: true, reducedMotion: true })).toBe(false);
    expect(g.want(0, { cameraShake: true })).toBe(true);
    g.mark(0);
    expect(g.want(ACTION_GAP - 1, { cameraShake: true })).toBe(false);
    expect(g.want(ACTION_GAP, { cameraShake: true })).toBe(true);
  });
});

describe('words after a critical', () => {
  const view = { w: 1280, h: 720 };
  it('a word over the middle moves off it, a word clear of it stays', () => {
    const focus = actionFocusBox(view);
    const words = [{ x: 640, y: 360, w: 200, h: 60, rot: 0 }, { x: 150, y: 600, w: 120, h: 40, rot: 0 }];
    const moves = moveOffFocus(words, focus, view, []);
    expect(moves).toHaveLength(1);
    const b = wordBox(moves[0].x, moves[0].y, 200, 60, 0);
    expect(b.right <= focus.left || b.left >= focus.right || b.bottom <= focus.top || b.top >= focus.bottom).toBe(true);
  });
});

describe('the action camera', () => {
  const hero = (x, y, z) => ({ body: createBody({ x, y, z }), state: 'ground' });
  const still = { dx: 0, dy: 0 };
  const settle = (rig, h, w, n = 30) => { for (let i = 0; i < n; i++) rig.update(1 / 60, still, h, w); };
  it('swings in beside the blow, looks at it, then hands back to the follow camera', () => {
    const w = createWorld(); w.build();
    const rig = createCameraRig(), h = hero(0, 0.9, 0);
    settle(rig, h, w);
    expect(rig.actionShot({ x: 0, y: 0.9, z: 1.4 }, h.body.p, w)).toBe(true);
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      rig.update(1 / 60, still, h, w);
      peak = Math.max(peak, rig.view.k);
      if (rig.view.k > 0.99) {
        const v = rig.view, f = rig.act.f;
        const tx = f.x - v.pos.x, ty = f.y - v.pos.y, tz = f.z - v.pos.z, l = Math.hypot(tx, ty, tz);
        expect((tx * v.fwd.x + ty * v.fwd.y + tz * v.fwd.z) / l).toBeGreaterThan(0.99);
        expect(v.pos.y).toBeGreaterThanOrEqual(CAM.actFloor - 1e-6);
      }
    }
    expect(peak).toBeGreaterThan(0.99);
    expect(rig.view.k).toBe(0);
    expect(rig.view.pos).toEqual(rig.pos);
  });
  it('the controls never see it: yaw and fwd stay the follow camera\'s', () => {
    const w = createWorld(); w.build();
    const a = createCameraRig(), b = createCameraRig(), h = hero(0, 0.9, 0);
    settle(a, h, w); settle(b, h, w);
    a.actionShot({ x: 0, y: 0.9, z: 1.4 }, h.body.p, w);
    for (let i = 0; i < 20; i++) { a.update(1 / 60, still, h, w); b.update(1 / 60, still, h, w); }
    expect(a.view.k).toBeGreaterThan(0.5);
    expect(a.yaw).toBeCloseTo(b.yaw, 9);
    expect(a.fwd).toEqual(b.fwd);
  });
  it('stays above a roof under it and out of a wall beside the fight', () => {
    const w = createWorld();
    w.addBox({ min: [-30, 0, -30], max: [30, 40, 30] }); // a roof at 40 m
    w.addBox({ min: [1.2, 40, -10], max: [6, 50, 10] }); // a wall 1.2 m to the left of the fight
    w.build();
    const rig = createCameraRig(), h = hero(0, 40.9, 0);
    settle(rig, h, w);
    const ok = rig.actionShot({ x: 0, y: 40.9, z: 1.4 }, h.body.p, w);
    expect(ok).toBe(true);
    for (let i = 0; i < 60; i++) {
      rig.update(1 / 60, still, h, w);
      const p = rig.view.pos;
      expect(p.y).toBeGreaterThanOrEqual(40 + CAM.actFloor - 1e-6);
      expect(w.pointInside(p.x, p.y, p.z)).toBe(false);
      expect(p.x).toBeLessThan(1.2);
    }
  });
  it('no room on either side: no shot', () => {
    const w = createWorld();
    w.addBox({ min: [0.8, 0, -10], max: [6, 20, 10] });
    w.addBox({ min: [-6, 0, -10], max: [-0.8, 20, 10] });
    w.addBox({ min: [-6, 0, -6], max: [6, 20, -1.2] });
    w.build();
    const rig = createCameraRig(), h = hero(0, 0.9, 0);
    settle(rig, h, w);
    expect(rig.actionShot({ x: 0, y: 0.9, z: 1.4 }, h.body.p, w)).toBe(false);
  });
});
