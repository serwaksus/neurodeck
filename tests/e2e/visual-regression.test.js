const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('**/telegram-web-app.js', route => route.abort());
});

test('page screenshot matches baseline', async ({ page }) => {
  // Deterministic rendering: eco mode pauses dust/particle loops and kills
  // CSS animations/transitions/backdrop-filters via :root.perf-eco;
  // reducedMotion covers perf.js auto-mode behavior as belt-and-suspenders.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('neurodeck_perf_mode', 'eco');
  });
  await page.goto('/');
  await page.waitForTimeout(3000);
  await page.waitForSelector('.app-wrap', { timeout: 5000 });
  await expect(page).toHaveScreenshot('page-load.png', {
    maxDiffPixels: 500,
    threshold: 0.2,
  });
});

test('starter deck modal screenshot matches baseline', async ({ page }) => {
  // Fresh-install state: wipe storage before any app script runs.
  // NOTE: the app re-saves during boot (saveGameState sets neurodeck_ever_saved
  // before the starter-deck branch in app.js), so the modal is not auto-shown
  // even on a wiped context. Force the exact preconditions showStarterDeck()
  // checks (FORGED empty, starter_done unset) and invoke it directly — the
  // modal then renders through the real renderStarterDeck() path.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('neurodeck_perf_mode', 'eco');
  });
  await page.goto('/');
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    localStorage.removeItem('neurodeck_starter_done');
    FORGED.length = 0;
    showStarterDeck();
  });
  const modal = page.locator('#starterDeckModal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveScreenshot('starter-deck-modal.png', {
    maxDiffPixels: 500,
    threshold: 0.2,
  });
});
