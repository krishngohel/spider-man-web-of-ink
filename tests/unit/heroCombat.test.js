import { describe, it, expect } from 'vitest';
import { createHeroCombat } from '../../src/combat/heroCombat.js';
import { ARCHETYPES, isActive } from '../../src/combat/enemies.js';
import { createBody } from '../../src/physics/ledger.js';
import { stopFor, shake } from '../../src/combat/hitstop.js';
import { TUNE } from '../../src/combat/tuning.js';

const DT = 1 / 120;

function setup({ z = 1.2 } = {}) {
  const hero = { body: createBody({ x: 0, y: 0.9, z: 0 }), state: 'ground', facing: { x: 0, z: 1 }, swing: { active: false, release() {} }, airTime: 0 };
  const e = { id: 1, alive: true, alerted: true, state: 'engage', arch: 'brawler', A: ARCHETYPES.brawler, body: createBody({ x: 0, y: 0.9, z }), t: 0, strikeAt: 0, hp: 50, maxHp: 50 };
  const hits = [];
  let held = 0;
  const enemies = {
    list: [e],
    get engaged() { return this.list.filter(isActive); },
    get active() { return this.list.filter(isActive); },
    hit(t, args) { hits.push(args); return { dealt: args.dmg, blocked: false }; },
    freeze() {}, hang() {},
    stun(t) { t.state = 'stunned'; },
    interrupt(t) { t.state = 'stagger'; },
    tokens: { holdAll(s) { held = s; } },
    takedownTarget: () => null,
  };
  const hc = createHeroCombat({ hero, enemies, projectiles: { fire() {} } });
  const intent = (o = {}) => ({ camFwd: { x: 0, y: 0, z: 1 }, moveX: 0, moveZ: 0, attackPressed: false, attack: false, divePressed: false, webPressed: false, yankPressed: false, finisher: false, ...o });
  // One frame: real-time effects first (the hero's hitstop runs out), then the combat step.
  const frame = (o) => { hc.timeScale(DT); hc.preStep(intent(o), DT, { groundBelow: 0 }); };
  return { hero, e, hits, hc, frame, held: () => held };
}

describe('hitstop', () => {
  it('sizes the freeze by the blow and caps it at 150 ms', () => {
    expect(stopFor('light')).toBe(0.05);
    expect(stopFor('finisher')).toBe(0.14);
    expect(stopFor('unknown')).toBe(0.05);
    for (const k of Object.keys(TUNE.stop)) expect(stopFor(k)).toBeLessThanOrEqual(0.15);
  });
  it('shakes and settles', () => {
    expect(shake(0, 0.1).x).toBe(0);
    expect(Math.abs(shake(0.05, 0.1).x)).toBeLessThanOrEqual(TUNE.shake);
  });
});

describe('the hero move player', () => {
  it('a jab lands exactly once, at its impact', () => {
    const s = setup();
    s.frame({ attackPressed: true });
    expect(s.hc.c.move.key).toBe('jab');
    let t = DT;
    while (t < TUNE.lightImpact - DT) { s.frame(); t += DT; }
    expect(s.hits.length).toBe(0);
    for (let i = 0; i < 30; i++) s.frame();
    expect(s.hits.length).toBe(1);
  });
  it('a press at 30% waits in the buffer and chains at 55%', () => {
    const s = setup();
    s.frame({ attackPressed: true });
    const M = TUNE.lightTime;
    while (s.hc.c.move.t < M * 0.3) s.frame();
    s.frame({ attackPressed: true });
    expect(s.hc.c.move.key).toBe('jab');
    let guard = 0;
    while (s.hc.c.move.key === 'jab' && guard++ < 200) s.frame();
    expect(s.hc.c.move.key).toBe('cross');
  });
  it('a dodge cancels a move and holds every enemy for a second', () => {
    const s = setup();
    s.frame({ attackPressed: true });
    s.frame({ divePressed: true });
    expect(s.hc.c.state).toBe('dodge');
    expect(s.hc.c.move).toBe(null);
    expect(s.held()).toBe(TUNE.dodgeHold);
    expect(s.hero.state).toBe('air');
  });
  it('a dodge in the red window is perfect: the attacker is webbed in the face', () => {
    const s = setup();
    Object.assign(s.e, { state: 'windup', strikeAt: 0.6, t: 0.6 - 0.1 });
    s.frame({ divePressed: true });
    expect(s.e.state).toBe('stunned');
    expect(s.hc.c.slowKind).toBe('perfect');
    expect(s.hc.timeScale(0.01)).toBeCloseTo(TUNE.perfectScale, 5);
  });
  it('a dodge before the red window is a plain dodge', () => {
    const s = setup();
    Object.assign(s.e, { state: 'windup', strikeAt: 0.6, t: 0.2 });
    s.frame({ divePressed: true });
    expect(s.e.state).toBe('windup');
    expect(s.hc.c.state).toBe('dodge');
  });
  it('the next attack ends the perfect dodge slow motion early', () => {
    const s = setup();
    Object.assign(s.e, { state: 'windup', strikeAt: 0.6, t: 0.5 });
    s.frame({ divePressed: true });
    s.frame({ attackPressed: true });
    expect(s.hc.c.slowT).toBeLessThanOrEqual(TUNE.perfectRamp);
  });
  it('holding attack next to a thug launches him', () => {
    const s = setup();
    s.frame({ attackPressed: true, attack: true });
    let guard = 0;
    while (s.hc.c.move?.key !== 'launcher' && guard++ < 200) s.frame({ attack: true });
    expect(s.hc.c.move.key).toBe('launcher');
  });
  it('a far target is a web strike', () => {
    const s = setup({ z: 9 });
    s.frame({ attackPressed: true });
    expect(s.hc.c.move.key).toBe('strike');
  });
});

describe('dodging a telegraphed blow', () => {
  it('covers the hero until that blow has landed', () => {
    const s = setup();
    Object.assign(s.e, { state: 'windup', strikeAt: 0.6, t: 0.6 - 0.35 });
    s.frame({ divePressed: true });
    expect(s.hc.c.iframes).toBeGreaterThan(0.35);
    expect(s.hc.c.iframes).toBeLessThanOrEqual(0.5);
  });
});

describe('review fixes', () => {
  it('a dive press mid-swing stays a dive, never a dodge', () => {
    const s = setup();
    s.hero.state = 'swing';
    s.frame({ divePressed: true });
    expect(s.hc.c.state).not.toBe('dodge');
  });
  it('mashing the string past four stops beating enemies to the punch', () => {
    const s = setup();
    let cancelled = 0;
    for (let i = 0; i < 8; i++) {
      Object.assign(s.e, { state: 'windup', strikeAt: 0.6, t: 0.2 });
      s.hc.c.state = 'free'; s.hc.c.move = null;
      s.frame({ attackPressed: true });
      if (s.e.state === 'stagger') cancelled++;
    }
    expect(cancelled).toBe(4);
  });
});

describe('dodging on a roof', () => {
  it('turns away from a drop instead of flipping off the edge', () => {
    const hero = { body: createBody({ x: 0, y: 20.9, z: 0 }), state: 'ground', facing: { x: 0, z: 1 }, swing: { active: false, release() {} }, airTime: 0 };
    const e = { id: 1, alive: true, alerted: true, state: 'engage', arch: 'brawler', A: ARCHETYPES.brawler, body: createBody({ x: 0, y: 20.9, z: 1.5 }), t: 0, strikeAt: 0, hp: 50, maxHp: 50 };
    const enemies = { list: [e], get engaged() { return this.list; }, get active() { return this.list; }, hit: () => ({ dealt: 1 }), freeze() {}, hang() {}, stun() {}, interrupt() {}, tokens: { holdAll() {} }, takedownTarget: () => null };
    const hc = createHeroCombat({ hero, enemies, projectiles: { fire() {} } });
    // The roof ends at x = 1: everything past it is the street, 20 m down.
    const groundAt = (x) => (x > 1 ? 0 : 20);
    // Stick pushes toward the edge (+x).
    hc.preStep({ camFwd: { x: 0, y: 0, z: 1 }, moveX: 1, moveZ: 0, divePressed: true }, 1 / 120, { groundBelow: 20, groundAt });
    expect(hc.c.state).toBe('dodge');
    expect(hero.body.v.x).toBeLessThan(0);
  });
});

describe('webs as crowd control', () => {
  it('six cartridges, one per shot, refilling one every 1.5 s', () => {
    const s = setup();
    for (let i = 0; i < 6; i++) s.frame({ webPressed: true });
    expect(s.hc.c.webAmmo).toBe(0);
    s.frame({ webPressed: true });
    expect(s.hc.c.webAmmo).toBe(0);
    for (let i = 0; i < Math.ceil(TUNE.webRefill / DT) + 2; i++) s.frame();
    expect(s.hc.c.webAmmo).toBe(1);
  });
  it('the yank throws a webbed enemy close by', () => {
    const s = setup({ z: 2 });
    s.e.state = 'webbed';
    s.frame({ yankPressed: true, moveX: 1, moveZ: 0 });
    expect(s.e.body.v.x).toBeGreaterThan(10);
    expect(s.e.thrownT).toBeGreaterThan(0);
  });
});

describe('finisher', () => {
  it('a one-second move the hero cannot be hit in, and a dodge cannot cancel', () => {
    const s = setup();
    s.hc.c.focus = 1;
    s.frame({ finisher: true });
    s.frame({ finisher: false });
    expect(s.hc.c.move?.key).toBe('finisher');
    expect(s.hc.c.iframes).toBeGreaterThan(0.9);
    s.frame({ divePressed: true });
    expect(s.hc.c.move?.key).toBe('finisher');
  });
});

describe('finisher review fixes', () => {
  it('a finisher that misses gives its focus back, and nothing chains out of it', () => {
    const s = setup();
    s.hc.c.focus = 1;
    s.frame({ finisher: true });
    s.frame({ finisher: false });
    s.e.body.p.z = 12; // he is gone by the blow
    for (let i = 0; i < 140; i++) s.frame({ attackPressed: i === 80 });
    expect(s.hc.c.focus).toBeCloseTo(1, 5);
    expect(s.hc.c.move === null || s.hc.c.move.key === 'finisher').toBe(true);
  });
});
