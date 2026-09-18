// ============================================================
// ВИЗУАЛЬНОЕ РАСШИРЕНИЕ QA-6 (п.59): 6 вкладок × 2 вьюпорта + 8 модалок.
// Существующие 5 снапшотов (visual-regression.test.js) не трогаем — зона Fix-B.
// Детерминизм: eco + reducedMotion + fixed clock (как в черновике QA-6);
// сид — общий хелпер tests/e2e/seed.cjs, в страницу — через arg-сериализацию
// (замыкания addInitScript не сериализуются — грабли верификации QA-6).
// Снапшоты генерировать: npx playwright test tests/e2e/visual-regression-extended.test.js --update-snapshots
// ============================================================

const { test, expect } = require('@playwright/test');
const seedSave = require('./seed.cjs');

// Сид-функция для addInitScript: всё, что нужно — внутри (arg-сериализация)
function SEED_IN_PAGE(seedJson) {
  localStorage.clear();
  localStorage.setItem('neurodeck_onboarding_done', '1');
  localStorage.setItem('neurodeck_starter_done', '1');
  localStorage.setItem('neurodeck_perf_mode', 'eco');
  localStorage.setItem('neurodeck_full_save', seedJson);
  localStorage.setItem('neurodeck_gen', String(JSON.parse(seedJson).gen || 1));
}

test.beforeEach(async ({ page }) => {
  await page.route('**/telegram-web-app.js', route => route.abort());
});

const VIEWS = ['deck', 'hero', 'inv', 'quests', 'stats', 'strongholds'];
const VIEWPORTS = [
  ['mobile', { width: 390, height: 844 }],
  ['tablet', { width: 768, height: 1024 }],
];

for (const [vpName, viewport] of VIEWPORTS) {
  test.describe(`tabs × ${vpName}`, () => {
    test.use({ viewport });
    for (const view of VIEWS) {
      test(`tab ${view} @ ${vpName} matches baseline`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.addInitScript(SEED_IN_PAGE, JSON.stringify(seedSave()));
        await page.clock.setFixedTime(new Date('2026-09-15T10:00:00Z'));
        await page.goto('/');
        await page.waitForTimeout(3000);
        await page.waitForSelector('.app-wrap', { timeout: 5000 });
        await page.locator(`.bnav-btn[data-view="${view}"]`).click();
        await page.waitForTimeout(400);
        await expect(page.locator(`#view-${view}`)).toBeVisible();
        await expect(page.locator(`#view-${view}`)).toHaveScreenshot(`tab-${view}-${vpName}.png`, {
          maxDiffPixels: 500, threshold: 0.2,
        });
      });
    }
  });
}

// --- 8 ключевых модалок (mobile): каждая открывается реальным опенером в странице.
// Твик сида: showReturnScreen ранний-return при gap<1 день (app.js:2499), а сид
// ставит lastSessionAt=now — для return-модалки сеем отсутствие 3 дня назад.
const MODALS = [
  ['starterDeck', () => { localStorage.removeItem('neurodeck_starter_done'); FORGED.length = 0; showStarterDeck(); }, null],
  ['editCard', () => openEditCardDirect(101), null],
  ['sync', () => openSyncModal(), null],
  ['goal', () => openGoalModal(), null],
  ['task', () => openTaskModal(), null],
  ['siegeReport', () => showSiegeReport([['Понедельник', 'Победа', '120 урона'], ['Понедельник', 'Поражение', '30 урона']], 3), null],
  ['weekly', () => showWeeklyReport(), null],
  ['return', () => showReturnScreen(), (seed) => { seed.hero.lastSessionAt = Date.parse('2026-09-10T10:00:00Z'); }],
];

test.describe('modals @ mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const [name, opener, seedTweak] of MODALS) {
    test(`modal ${name} matches baseline`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const seed = seedSave();
      if (seedTweak) seedTweak(seed);
      await page.addInitScript(SEED_IN_PAGE, JSON.stringify(seed));
      await page.clock.setFixedTime(new Date('2026-09-15T10:00:00Z'));
      await page.goto('/');
      await page.waitForTimeout(3000);
      await page.waitForSelector('.app-wrap', { timeout: 5000 });
      await page.evaluate(opener);
      const modal = page.locator('.modal-overlay.show').first();
      await expect(modal).toBeVisible();
      await expect(modal).toHaveScreenshot(`modal-${name}.png`, { maxDiffPixels: 500, threshold: 0.2 });
    });
  }
});
