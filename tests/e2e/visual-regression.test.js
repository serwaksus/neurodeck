const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('**/telegram-web-app.js', route => route.abort());
});

test('page screenshot matches baseline', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(3000);
  await page.waitForSelector('.app-wrap', { timeout: 5000 });
  await expect(page).toHaveScreenshot('page-load.png', {
    maxDiffPixels: 500,
    threshold: 0.2,
  });
});

test('starter deck modal screenshot matches baseline', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(3000);
  const modal = page.locator('#starterDeckModal');
  if (await modal.isVisible()) {
    await expect(modal).toHaveScreenshot('starter-deck-modal.png', {
      maxDiffPixels: 500,
      threshold: 0.2,
    });
  }
});
