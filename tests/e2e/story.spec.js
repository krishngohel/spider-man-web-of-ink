import { test, expect } from '@playwright/test';

const ready = () => window.__game?.state?.ready && window.__game.frame > 10;
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

test('?at=act1.shocker opens the Shocker fight: the boss is up and the fight is on', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?at=act1.shocker');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.story().phase === 'fight', null, { timeout: 15000 });
  const st = await page.evaluate(() => window.__game.story());
  expect(st.step).toBe('act1.shocker');
  expect(st.type).toBe('boss');
  expect(st.boss).not.toBe(null);
  const boss = await page.evaluate(() => window.__game.combatState().enemies.find((e) => e.boss));
  expect(boss).toBeTruthy();
  expect(boss.hp).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.mode)).toBe('play');
  expect(errors).toEqual([]);
});

test('a stealth step starts with its guards unaware, and no alarm', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?at=act3.hunters');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  // Some steps open on comic pages or a radio call first: read on until the guards are out.
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(() => window.__game.story());
    if (s.phase === 'sneak') break;
    if (s.step !== 'act3.hunters') throw new Error(`left the step: ${s.step}`);
    await page.waitForTimeout(250);
  }
  const st = await page.evaluate(() => window.__game.story());
  expect(st.type).toBe('stealth');
  expect(st.phase).toBe('sneak');
  expect(st.guards.length).toBeGreaterThan(2);
  expect(st.alarm).toBe(false);
  expect(st.guards.every((gd) => !gd.alerted)).toBe(true);
  expect(errors).toEqual([]);
});

test('a story slot saves, and after a reload Continue resumes the same step at the saved spot', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => { for (let i = 1; i <= 3; i++) localStorage.removeItem(`web-of-ink-save-${i}`); });
  await page.reload();
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.locator('.title .mbtn', { hasText: 'STORY' }).click();
  await page.locator('.slot').nth(1).locator('.mbtn', { hasText: 'NEW GAME' }).click();
  await page.waitForFunction(() => window.__game.mode === 'comic', null, { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.mode === 'play' && window.__game.story().step === 'prologue.swing', null, { timeout: 10000 });
  // Stand somewhere new on the ground and wait for the autosave (every 20 s of play).
  const spot = await page.evaluate(() => { const s = window.__game.spawn; return { x: s.x + 6, y: s.y, z: s.z + 4 }; });
  await page.evaluate(([x, y, z]) => window.__game.teleport(x, y, z, 0, 0, 0, 'ground'), [spot.x, spot.y, spot.z]);
  await page.waitForFunction(([x, z]) => {
    const p = JSON.parse(localStorage.getItem('web-of-ink-save-2') ?? '{}').world?.position;
    return p && Math.hypot(p.x - x, p.z - z) < 1;
  }, [spot.x, spot.z], { timeout: 30000, polling: 500 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('web-of-ink-save-2')));
  expect(saved.story.step).toBe('prologue.swing');
  expect(saved.story.done).toContain('prologue.open');

  await page.reload();
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.locator('.title .mbtn', { hasText: 'STORY' }).click();
  await page.locator('.slot').nth(1).locator('.mbtn.primary').click();
  await page.waitForFunction(() => window.__game.mode === 'play' && window.__game.story().step === 'prologue.swing', null, { timeout: 15000 });
  const p = await page.evaluate(() => window.__game.hero().p);
  expect(Math.hypot(p.x - saved.world.position.x, p.z - saved.world.position.z)).toBeLessThan(1.5);
  expect(await page.evaluate(() => window.__game.save().slot)).toBe(2);
  expect(errors).toEqual([]);
});
