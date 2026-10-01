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
  for (const v of ['deck', 'hero', 'inv', 'strongholds', 'stats']) {
    await page.locator(`.bnav-btn[data-view="${v}"]`).click();
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
  await page.locator('.bnav-btn[data-view="hero"]').click();
  await page.waitForTimeout(500);
  await expect(page.locator('#heroName')).toHaveText('Странник');
  await expect(page.locator('#heroLevelLabel')).toContainText('LVL');
  await expect(page.locator('#heroXpCur')).toBeVisible();
  await expect(page.locator('#statsGrid')).toBeVisible();
});

// P21: аудио-микшер — секция настроек, персистентность в localStorage, правило 20 (без автозапуска)
test('audio mixer: settings section, localStorage persistence, no autoplay before interaction', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('neurodeck_onboarding_done', '1'));
  await page.goto('/');
  await page.waitForTimeout(2000);

  // правило 20: до первого взаимодействия (любого клика, включая закрытие стартовой модалки) микшер не разблокирован
  const locked = await page.evaluate(() => typeof NDAudio !== 'undefined' && !NDAudio.unlocked());
  expect(locked).toBe(true);
  const musicMutedByDefault = await page.evaluate(() => NDAudio.get('music').muted === true);
  expect(musicMutedByDefault).toBe(true);

  const closeBtn = page.locator('#starterDeckModal .modal-close');
  if (await closeBtn.isVisible()) await closeBtn.click();

  await page.locator('[data-action="open-sync-modal"]').click();
  await expect(page.locator('#audioSection')).toBeVisible();
  await expect(page.locator('#audioSection .audio-row')).toHaveCount(5);
  await expect(page.locator('#audio-mute-music')).toHaveAttribute('aria-pressed', 'true');

  // мьют категории пишется в localStorage (не в сейв)
  await page.locator('#audio-mute-ui').click();
  await expect(page.locator('#audio-mute-ui')).toHaveAttribute('aria-pressed', 'true');
  const lsAfterMute = await page.evaluate(() => JSON.parse(localStorage.getItem('neurodeck_audio')));
  expect(lsAfterMute.ui.muted).toBe(true);

  // слайдер громкости пишет vol в localStorage
  await page.locator('#audio-vol-siege').fill('80');
  const lsAfterVol = await page.evaluate(() => JSON.parse(localStorage.getItem('neurodeck_audio')));
  expect(lsAfterVol.siege.vol).toBe(0.8);
  await expect(page.locator('#audio-pct-siege')).toHaveText('80%');

  // reload: мьют/громкость пережили перезагрузку (localStorage, не сейв)
  await page.reload();
  await page.waitForTimeout(2000);
  const closeBtn2 = page.locator('#starterDeckModal .modal-close');
  if (await closeBtn2.isVisible()) await closeBtn2.click();
  await page.locator('[data-action="open-sync-modal"]').click();
  await expect(page.locator('#audio-mute-ui')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#audio-vol-siege')).toHaveValue('80');

  // первое взаимодействие (клики выше) разблокировало микшер — правило 20 соблюдено
  const unlocked = await page.evaluate(() => NDAudio.unlocked() === true);
  expect(unlocked).toBe(true);

  // сброс возвращает дефолты правила 20 (музыка выключена)
  await page.locator('[data-action="audio-reset"]').click();
  const lsAfterReset = await page.evaluate(() => JSON.parse(localStorage.getItem('neurodeck_audio')));
  expect(lsAfterReset.ui.muted).toBe(false);
  expect(lsAfterReset.music.muted).toBe(true);
});
