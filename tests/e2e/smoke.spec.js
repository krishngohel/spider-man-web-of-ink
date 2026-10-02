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

test('free swing enters play, and an aimed, held swing attaches a web', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.locator('.title .mbtn', { hasText: 'FREE SWING' }).click();
  await page.waitForFunction(() => window.__game.mode === 'play');
  await expect(page.locator('.hud')).toBeVisible();
  await page.evaluate(() => {
    window.__game.teleport(0, 50, -330, 0, 0, 22, 'air', 0);
    const t = window.__game.suggest(0, 1);
    window.__game.aimAt(t.x, t.y, t.z);
  });
  await page.keyboard.down('Shift');
  await page.waitForFunction(() => window.__game.hero().rope.active, null, { timeout: 3000 });
  await page.keyboard.up('Shift');
  expect(errors).toEqual([]);
});

test('a release and a fresh press inside one frame still fires the next web', async ({ page }) => {
  await page.goto('/?at=swing');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.evaluate(() => {
    window.__game.teleport(0, 50, -330, 0, 0, 22, 'air', 0);
    const t = window.__game.suggest(0, 1);
    window.__game.aimAt(t.x, t.y, t.z);
  });
  await page.keyboard.down('Shift');
  await page.waitForFunction(() => window.__game.hero().swing.active, null, { timeout: 3000 });
  // Let go and press again before the next frame runs: a fast re-tap must not be lost.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', key: 'Shift' }));
    window.__game.teleport(0, 45, -400, 0, 0, 18, 'air', 0);
    const t = window.__game.suggest(0, 1);
    window.__game.aimAt(t.x, t.y, t.z);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift' }));
  });
  await page.waitForFunction(() => window.__game.hero().swing.active, null, { timeout: 2000 });
  await page.keyboard.up('Shift');
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

test('story: a new game in slot 1 opens the first comic page, Esc reads on, play follows', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => { for (let i = 1; i <= 3; i++) localStorage.removeItem(`web-of-ink-save-${i}`); });
  await page.reload();
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.locator('.title .mbtn', { hasText: 'STORY' }).click();
  await page.locator('.slot').first().locator('.mbtn', { hasText: 'NEW GAME' }).click();
  await page.waitForFunction(() => window.__game.mode === 'comic', null, { timeout: 15000 });
  await expect(page.locator('.comic .cpanel img').first()).toBeVisible();
  await expect(page.locator('.comic .ccaption').first()).toContainText('New York');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.mode === 'play' && window.__game.story().step === 'prologue.swing', null, { timeout: 10000 });
  await expect(page.locator('.objective')).toContainText('Fisk Tower');
  // Saved by step id in slot 1.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('web-of-ink-save-1')).story);
  expect(saved.step).toBe('prologue.swing');
  expect(saved.done).toContain('prologue.open');
  expect(errors).toEqual([]);
});
