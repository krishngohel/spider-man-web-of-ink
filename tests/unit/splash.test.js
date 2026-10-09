import { describe, it, expect } from 'vitest';
import { createSplashMemory } from '../../src/game/splash.js';

// Water is everything with z < 0; land is z >= 0.
const isWater = (x, z) => z < 0;
const step = (m, p, state, speed, secs) => { for (let t = 0; t < secs; t += 0.1) m.record(p, state, speed, 0.1); };

describe('splash memory', () => {
  it('brings the hero back to where he last stood when that is close by', () => {
    const m = createSplashMemory({ x: 0, y: 0, z: 50 }, isWater);
    step(m, { x: 0, y: 0.5, z: 20 }, 'ground', 0, 1);
    step(m, { x: 0, y: 30, z: 5 }, 'swing', 30, 0.5);
    const r = m.respawn();
    expect(r.state).toBe('ground');
    expect(r.z).toBeCloseTo(20);
  });

  it('after a long swing with no stops, drops him over the last dry land, not back where he stood a minute ago', () => {
    const m = createSplashMemory({ x: 0, y: 0, z: 900 }, isWater);
    step(m, { x: 0, y: 0.5, z: 900 }, 'ground', 0, 1);
    for (let z = 890; z >= 2; z -= 2) m.record({ x: 0, y: 40, z }, 'swing', 30, 0.1);
    m.record({ x: 0, y: 20, z: -3 }, 'air', 30, 0.1);
    const r = m.respawn();
    expect(r.state).toBe('air');
    expect(isWater(r.x, r.z)).toBe(false);
    expect(Math.abs(r.z)).toBeLessThan(10);
  });

  it('never keeps a spot over the water', () => {
    const m = createSplashMemory({ x: 0, y: 0, z: 10 }, isWater);
    step(m, { x: 0, y: 40, z: -50 }, 'swing', 30, 5);
    const r = m.respawn();
    expect(isWater(r.x, r.z)).toBe(false);
  });
});
