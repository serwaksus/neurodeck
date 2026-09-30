const { test, expect } = require('@playwright/test');

// Регрессия на P0 (аудит 30.09): шина была экспортирована как NDBus, а storage/app
// использовали NDDBus — applySyncData не обновлял UI в браузере (typeof-гварды молча глотали).
// Тест доказывает РЕАЛЬНЫЙ поток: сейв в localStorage → boot → DOM отражает данные сейва.
// Если шина снова разъедется по имени, boot-подписка не сработает и карточка не появится.
test.beforeEach(async ({ page }) => {
  await page.route('**/telegram-web-app.js', route => route.abort());
});

test('imported save drives UI through event bus (NDBus/NDDBus naming regression)', async ({ page }) => {
  const save = {
    v: 13,
    hero: { name: 'Аудитор', level: 9, xp: 10, xpToNext: 100, totalXp: 900, gold: 777, consecutivePerfectDays: 0, dailyCompletions: 0, dailySkips: 0 },
    stats: {},
    forged: [{
      id: 1, name: 'Регрессия-шины', rank: 'A', stat: 'str', streak: 4, mastery: 2, masteryThreshold: 7,
      totalCompletions: 12, progress: 0, prestige: 0, evolutionPath: 'depth', daysActive: 30,
      meta: '⚔ 15 мин', firstCompletedAt: 1750000000000, lastCompletedAt: 1758000000000, lastFailDay: null
    }],
    goals: [], tasks: [], taskIdCounter: 1, forgedIdCounter: 2, uidCounter: 1, goalIdCounter: 1,
    xpHistory: [], bloodOath: null, hirePool: null,
    lastDayReset: '2026-09-29', lastWeekReset: '2026-09-28',
    savedAt: Date.now(), t: Date.now(), gen: 1
  };
  await page.addInitScript((s) => {
    localStorage.setItem('neurodeck_full_save', JSON.stringify(s));
    localStorage.setItem('neurodeck_onboarding_done', '1');
  }, save);

  await page.goto('/');
  await page.waitForTimeout(2500);

  // шина должна существовать под контрактным именем
  const busOk = await page.evaluate(() => typeof window.NDDBus === 'object' && typeof window.NDDBus.emit === 'function');
  expect(busOk).toBe(true);

  // UI обязан показать карточку из сейва: boot → applySyncData → emit → подписка → renderCards
  await expect(page.locator('.card-name', { hasText: 'Регрессия-шины' })).toBeVisible({ timeout: 10000 });
  // и уровень героя из сейва (реальный id из index.html)
  await expect(page.locator('#heroLevelLabel')).toContainText('9', { timeout: 5000 });
});

test('runtime re-emit after tab-sync style apply updates cards (bus still wired post-boot)', async ({ page }) => {
  const save = {
    v: 13,
    hero: { name: 'Аудитор2', level: 3, xp: 10, xpToNext: 100, totalXp: 300, gold: 50, consecutivePerfectDays: 0, dailyCompletions: 0, dailySkips: 0 },
    stats: {},
    forged: [{ id: 1, name: 'Карта-один', rank: 'C', stat: 'str', streak: 0, mastery: 0, masteryThreshold: 5, totalCompletions: 1, progress: 0, prestige: 0, evolutionPath: null, daysActive: 1, meta: '', firstCompletedAt: 1750000000000, lastCompletedAt: null, lastFailDay: null }],
    goals: [], tasks: [], taskIdCounter: 1, forgedIdCounter: 2, uidCounter: 1, goalIdCounter: 1,
    xpHistory: [], bloodOath: null, hirePool: null, lastDayReset: null, lastWeekReset: null,
    savedAt: Date.now(), t: Date.now(), gen: 1
  };
  await page.addInitScript((s) => {
    localStorage.setItem('neurodeck_full_save', JSON.stringify(s));
    localStorage.setItem('neurodeck_onboarding_done', '1');
  }, save);
  await page.goto('/');
  await page.waitForTimeout(2500);
  await expect(page.locator('.card-name', { hasText: 'Карта-один' })).toBeVisible({ timeout: 10000 });

  // имитируем multi-tab: чужой сейв в localStorage + storage-событие → applySyncData(data, true) → emit
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('neurodeck_full_save'));
    data.forged = [{ ...data.forged[0], id: 1, name: 'Карта-два' }];
    data.gen = 2;
    localStorage.setItem('neurodeck_full_save', JSON.stringify(data));
    window.dispatchEvent(new StorageEvent('storage', { key: 'neurodeck_full_save', newValue: data }));
  });
  await expect(page.locator('.card-name', { hasText: 'Карта-два' })).toBeVisible({ timeout: 10000 });
});
