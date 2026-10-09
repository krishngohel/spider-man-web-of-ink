import { test, expect } from '@playwright/test';

const ready = () => window.__game?.state?.ready && window.__game.frame > 10;
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

test('a street crime starts in free roam: the gang is there, and taking them all out stops it and counts it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?at=swing');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.evaluate(() => window.__game.setSetting('crimes', true));
  const kind = await page.evaluate(() => window.__game.forceCrime('mugging'));
  expect(kind).toBe('mugging');
  const st = await page.evaluate(() => window.__game.content().crime);
  expect(st.foes).toBeGreaterThan(0);
  await page.evaluate(([x, z]) => window.__game.teleport(x, 0.9, z + 1, 0, 0, 0, 'ground'), [st.x, st.z]);
  await page.waitForFunction(() => window.__game.combatState().enemies.some((e) => !['out', 'webbed', 'pinned'].includes(e.state)), null, { timeout: 5000 });
  // Every thug out of the fight (as webbing them would): the crime is stopped and counted.
  const before = await page.evaluate(() => window.__game.save().activities.crimes);
  await page.evaluate(() => { for (const e of window.__game.combat().enemies.list) { e.hp = 0; e.state = 'out'; } });
  await page.waitForFunction(() => window.__game.content().crime === null, null, { timeout: 15000 });
  expect(await page.evaluate(() => window.__game.save().activities.crimes)).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('stepping into a Taskmaster start marker begins the challenge: a countdown, then the fight', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?at=swing');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  // Activities run only with street crime on (the setting) and no encounter going.
  await page.evaluate(() => window.__game.setSetting('crimes', true));
  // Hideouts sit near the same district middles and would start first: count them cleared.
  await page.evaluate(() => { const g = window.__game; g.save().activities.bases.push(...g.catalog().hideouts.map((h) => h.id)); });
  const c = await page.evaluate(() => window.__game.catalog().challenges.find((q) => q.type === 'combat'));
  await page.evaluate(([x, z]) => window.__game.teleport(x, 0.9, z, 0, 0, 0, 'ground'), [c.x, c.z]);
  await page.waitForFunction((id) => window.__game.content().run?.id === id, c.id, { timeout: 5000 });
  expect((await page.evaluate(() => window.__game.content().run)).count).toBeGreaterThan(0);
  await page.waitForFunction(() => window.__game.content().run?.count <= 0, null, { timeout: 8000 });
  const foes = await page.evaluate(() => window.__game.combatState().enemies.filter((e) => !['out', 'webbed', 'pinned'].includes(e.state)).length);
  expect(foes).toBe(c.waves[0].length);
  expect(errors).toEqual([]);
});
