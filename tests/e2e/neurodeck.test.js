const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('**/telegram-web-app.js', route => route.abort());
});

test('page loads without JS errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('/');
  await page.waitForTimeout(2500);
  await expect(page.locator('.app-wrap')).toBeVisible();
  const real = errors.filter(e =>
    !e.includes('favicon') && !e.includes('Telegram') &&
    !e.includes('ERR_FAILED') && !e.includes('ERR_BLOCKED')
  );
  expect(real).toEqual([]);
});

test('canvas elements exist', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#particles')).toBeVisible();
  await expect(page.locator('#dustCanvas')).toBeVisible();
});

test('starter deck modal can be closed', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const closeBtn = page.locator('#starterDeckModal .modal-close');
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('#starterDeckModal')).not.toBeVisible();
  }
});

test('tab navigation switches views', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('neurodeck_onboarding_done', '1'));
  await page.goto('/');
  await page.waitForTimeout(2000);
  // close modal if present
  const closeBtn = page.locator('#starterDeckModal .modal-close');
  if (await closeBtn.isVisible()) await closeBtn.click();
  await page.waitForTimeout(500);
  for (const v of ['deck', 'tract', 'hero', 'inv', 'strongholds', 'stats']) {
    await page.locator(`.bnav-btn[data-view="${v}"]`).click({ force: true });
    await page.waitForTimeout(300);
    await expect(page.locator(`#view-${v}`)).toBeVisible();
  }
});

test('hero view shows character stats', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('neurodeck_onboarding_done', '1'));
  await page.goto('/');
  await page.waitForTimeout(2000);
  const closeBtn = page.locator('#starterDeckModal .modal-close');
  if (await closeBtn.isVisible()) await closeBtn.click();
  await page.waitForTimeout(500);
  await page.locator('.bnav-btn[data-view="hero"]').click({ force: true });
  await page.waitForTimeout(500);
  await expect(page.locator('#heroName')).toHaveText('Странник');
  await expect(page.locator('#heroLevelLabel')).toContainText('LVL');
  await expect(page.locator('#heroXpCur')).toBeVisible();
  await expect(page.locator('#statsGrid')).toBeVisible();
});
