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

const DETERMINISTIC_INIT = () => {
  localStorage.clear();
  localStorage.setItem('neurodeck_onboarding_done', '1');
  localStorage.setItem('neurodeck_starter_done', '1');
  localStorage.setItem('neurodeck_perf_mode', 'eco');
};

test('deck card screenshot matches baseline', async ({ page }) => {
  // Полная карточка в колоде: статистика/мастерство/прогресс/кнопки.
  // Ловит класс «контент наезжает на кнопки» (регрессия 10->13px, раунд 2 QA).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(DETERMINISTIC_INIT);
  await page.clock.setFixedTime(new Date('2026-09-15T10:00:00Z'));
  await page.goto('/');
  await page.waitForTimeout(3000);
  await page.waitForSelector('.app-wrap', { timeout: 5000 });
  await page.evaluate(() => {
    FORGED.length = 0;
    FORGED.push({ id: 501, name: 'Тест-карточка', rank: 'C', stat: 'str', mastery: 2, masteryThreshold: 7, meta: '⚔ 15 мин · утро', streak: 3, totalCompletions: 12, daysActive: 5, firstCompletedAt: Date.now(), lastCompletedAt: Date.now() - 86400000 });
    renderCards();
  });
  const card = page.locator('.card').first();
  await expect(card).toBeVisible();
  await expect(card).toHaveScreenshot('deck-card.png', {
    maxDiffPixels: 300,
    threshold: 0.2,
  });
});

test('hero treasury screenshot matches baseline', async ({ page }) => {
  // Блок казны на вкладке Героя: ловит легаси-тексты и вёрстку (раунд 2 QA: «Доход тракта»).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(DETERMINISTIC_INIT);
  await page.clock.setFixedTime(new Date('2026-09-15T10:00:00Z'));
  await page.goto('/');
  await page.waitForTimeout(3000);
  await page.waitForSelector('.app-wrap', { timeout: 5000 });
  await page.evaluate(() => { document.querySelector('.bnav-btn[data-view="hero"]').click(); });
  const block = page.locator('.hero-hp-block');
  await expect(block).toBeVisible();
  await expect(block).toHaveScreenshot('hero-treasury.png', {
    maxDiffPixels: 300,
    threshold: 0.2,
  });
});

test('strongholds top screenshot matches baseline', async ({ page }) => {
  // Шапка карты: доход/содержание, kingdom path (переполнение!), сезон-чип, квест-доска.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(DETERMINISTIC_INIT);
  await page.clock.setFixedTime(new Date('2026-09-15T10:00:00Z'));
  await page.goto('/');
  await page.waitForTimeout(3000);
  await page.waitForSelector('.app-wrap', { timeout: 5000 });
  await page.evaluate(() => { document.querySelector('.bnav-btn[data-view="strongholds"]').click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const grid = document.querySelector('#strongholdsRoot .sh-grid');
    if (grid) grid.style.display = 'none'; // QA-чит: скрываем список 20 твердынь, снимаем только шапку карты
  });
  const root = page.locator('#strongholdsRoot');
  await expect(root).toBeVisible();
  await expect(root).toHaveScreenshot('strongholds-top.png', {
    maxDiffPixels: 500,
    threshold: 0.2,
  });
});
