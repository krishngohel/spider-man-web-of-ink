import { test, expect } from '@playwright/test';

const ready = () => window.__game?.state?.ready && window.__game.frame > 10;

function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('title screen renders with the disclaimer and no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await expect(page.locator('.title .logo')).toBeVisible();
  await expect(page.locator('.title .disclaimer')).toContainText('Unofficial fan game');
  expect(errors).toEqual([]);
});

test('free swing enters play, and a held swing attaches a web', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.locator('.title .mbtn.primary').click();
  await page.waitForFunction(() => window.__game.mode === 'play');
  await expect(page.locator('.hud')).toBeVisible();
  await page.evaluate(() => window.__game.teleport(0, 50, -330, 0, 0, 22, 'air', 0));
  await page.keyboard.down('Shift');
  await page.waitForFunction(() => window.__game.hero().rope.active, null, { timeout: 3000 });
  await page.keyboard.up('Shift');
  expect(errors).toEqual([]);
});

test('settings persist across a reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.locator('.title .mbtn', { hasText: 'SETTINGS' }).click();
  const gravity = page.locator('.panel .row', { hasText: 'Gravity' }).locator('.chip');
  await expect(gravity).toHaveText('Comic (2g)');
  await gravity.click();
  await expect(gravity).toHaveText('Real (1g)');
  await page.reload();
  await page.waitForFunction(ready, null, { timeout: 90000 });
  expect(await page.evaluate(() => window.__game.settings.gravity)).toBe('real');
  await page.evaluate(() => window.__game.setSetting('gravity', 'comic'));
});

test('rebinding a key from the controls screen', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.locator('.title .mbtn', { hasText: 'CONTROLS' }).click();
  const zip = page.locator('.panel .row', { hasText: 'Web zip' }).locator('.chip');
  await zip.click();
  await page.keyboard.press('KeyF');
  await expect(page.locator('.panel .row', { hasText: 'Web zip' }).locator('.chip')).toHaveText('F');
  await page.locator('.panel .mbtn', { hasText: 'RESET TO DEFAULTS' }).click();
  await expect(page.locator('.panel .row', { hasText: 'Web zip' }).locator('.chip')).toHaveText('Q');
});

test('pause menu opens from play and resumes', async ({ page }) => {
  await page.goto('/?at=swing');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => window.__game.mode === 'paused');
  await expect(page.locator('.menu .card h2')).toHaveText('PAUSED');
  await page.locator('.menu .mbtn.primary').click();
  await page.waitForFunction(() => window.__game.mode === 'play');
});
