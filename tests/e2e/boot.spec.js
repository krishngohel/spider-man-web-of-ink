import { test, expect } from '@playwright/test';

const ready = () => window.__game?.state?.ready && window.__game.frame > 10;

test('a boot that fails for a reason other than WebGL 2 says so, names the file, and offers a reload', async ({ page }) => {
  page.on('console', () => {}); // the failure is logged on purpose
  await page.route('**/assets/hero_m.glb', (r) => r.abort());
  await page.goto('/');
  await expect(page.locator('#loading.failed')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#loading .msg.fail')).toContainText('Something went wrong loading the game');
  await expect(page.locator('#loading .why')).toContainText('hero_m.glb');
  await expect(page.locator('#loading .msg.err')).toBeHidden();
  await page.unroute('**/assets/hero_m.glb');
  await page.locator('#loading .reload').click();
  await page.waitForFunction(ready, null, { timeout: 90000 });
});

test('a lost WebGL context shows the reload card, and a click reloads into the game', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.evaluate(() => document.getElementById('game').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await expect(page.locator('.gl-lost')).toBeVisible();
  await expect(page.locator('.gl-lost')).toContainText('The graphics reset. Click to reload.');
  await page.locator('.gl-lost').click();
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await expect(page.locator('.gl-lost')).toHaveCount(0);
});

test('the packed mocap sets load after boot, with no errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /clips/.test(m.text())) errors.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.clips?.().combat && window.__game.clips().social, null, { timeout: 90000 });
  expect((await page.evaluate(() => window.__game.clips())).count).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test('a combat set that never arrives leaves the game on the Quaternius clips, still playable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/assets/anims_combat.glb', (r) => r.abort());
  await page.goto('/?at=swing');
  await page.waitForFunction(() => window.__game?.clips?.().social, null, { timeout: 90000 });
  expect((await page.evaluate(() => window.__game.clips())).combat).toBe(false);
  expect(await page.evaluate(() => window.__game.mode)).toBe('play');
  expect(errors).toEqual([]);
});

test('the page has a drawn favicon and a description', async ({ page }) => {
  await page.goto('/');
  expect(await page.locator('link[rel="icon"]').getAttribute('href')).toMatch(/^data:image\/svg\+xml/);
  expect(await page.locator('meta[name="description"]').getAttribute('content')).toContain('fan game');
});
