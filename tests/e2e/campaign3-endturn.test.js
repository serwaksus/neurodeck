// ============================================================
// Кампания 3.0 — кнопка «Закончить ход» (план §1 «Игровой цикл»).
//   Клик завершает действия на сегодня: сводка-тост «ОД осталось N (сгорят на смене суток)»,
//   кнопка до смены суток показывает «Ход завершён ✓»; сутки НЕ закрываются досрочно —
//   день и ОД не меняются, флаг eot сбрасывается dayEnd на смене дня.
// ============================================================
const { test, expect } = require('@playwright/test');
const seedSave = require('./seed.cjs');

test.use({ serviceWorkers: 'block' });

function SEED_IN_PAGE(arg) {
    if (sessionStorage.getItem('__ndSeeded')) return; // перезагрузка внутри теста сохраняет то, что игра записала сама
    sessionStorage.setItem('__ndSeeded', '1');
    localStorage.clear();
    localStorage.setItem('neurodeck_perf_mode', 'eco');
    localStorage.setItem('neurodeck_onboarding_done', '1');
    localStorage.setItem('neurodeck_starter_done', '1');
    localStorage.setItem('nd_c3', '1');
    localStorage.setItem('neurodeck_full_save', arg.save);
    localStorage.setItem('neurodeck_gen', '1');
}
test.beforeEach(async ({ page }) => { await page.route('**/telegram-web-app.js', (r) => r.abort()); });

const card = (id, stat) => ({ id, name: 'Дело ' + id, rank: 'C', stat, streak: 3, mastery: 0, masteryThreshold: 7, totalCompletions: 5, progress: 0, prestige: 0, evolutionPath: 'depth', daysActive: 10, meta: '⚔ 15 мин · день', firstCompletedAt: Date.now() - 20 * 86400000, lastCompletedAt: Date.now() - 3 * 86400000, lastFailDay: null });

async function boot(page) {
    const s = seedSave({ army: { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 3 } });
    s.forged = [card(1, 'str')]; // Сила → Тело
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(s) });
    await page.goto('/');
    await page.waitForSelector('.app-wrap');
    await page.waitForFunction(() => window.renderCampaign3 && window.NDC3, null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show')); });
}
const openStrongholds = async (page) => { await page.click('.bnav-btn[data-view="strongholds"]'); await page.waitForTimeout(300); };

test('Закончить ход: сводка и «Ход завершён ✓», сутки не закрываются досрочно', async ({ page }) => {
    test.setTimeout(60000); // бут с сидом + смена суток; на загруженной машине 30 с мало
    await boot(page);
    await openStrongholds(page);
    await expect(page.locator('#c3Root .c3')).toBeVisible();
    await expect(page.locator('[data-c3="eot"]')).toBeVisible();
    const before = await page.evaluate(() => { const s = JSON.parse(JSON.stringify(NDC3.getState())); return { day: s.day, ap: s.ap, deeds: s.deedsToday }; });
    await page.click('[data-c3="eot"]');
    await expect(page.locator('[data-c3="eot"]')).toBeDisabled();
    await expect(page.locator('[data-c3="eot"]')).toHaveText('Ход завершён ✓');
    const after = await page.evaluate(() => { const s = JSON.parse(JSON.stringify(NDC3.getState())); return { day: s.day, eot: s.eot, ap: s.ap }; });
    expect(after.day).toBe(before.day, 'день тот же — досрочного закрытия нет');
    expect(after.eot).toBe(before.day, 'флаг eot = ключ дня');
    expect(after.ap).toEqual(before.ap, 'ОД не сгорели: сутки живы');
    // смена суток сбрасывает флаг — кнопка снова активна
    await page.evaluate(() => NDC3.dayEnd(getMSKDayKey(Date.now() + 86400000)));
    const out = await page.evaluate(() => { const s = JSON.parse(JSON.stringify(NDC3.getState())); return { day: s.day, eot: s.eot }; });
    expect(out.day).not.toBe(before.day);
    expect(out.eot).toBeUndefined();
    await expect(page.locator('[data-c3="eot"]')).toBeEnabled();
    await expect(page.locator('[data-c3="eot"]')).toHaveText('⏭ Закончить ход');
});

test('Закончить ход: после клика день ещё жив — дело даёт ОД, сейв проходит санитизацию с eot', async ({ page }) => {
    test.setTimeout(60000); // бут с сидом; на загруженной машине 30 с мало
    await boot(page);
    await openStrongholds(page);
    await page.click('[data-c3="eot"]');
    // день не закрыт: рантайм-хук дела по-прежнему работает (C4 не тронут)
    const r = await page.evaluate(() => NDC3.onDeed({ kind: 'habit', stat: 'str', rank: 'C' }));
    expect(r.gained).toBeGreaterThan(0);
    await expect(page.locator('[data-c3="eot"]')).toBeDisabled();
    // serialize → sanitize: eot переживает сейв-раундтрип, пока день не сменился
    const round = await page.evaluate(() => STATE_GUARDS.sanitizeC3(JSON.parse(JSON.stringify(NDC3.getState()))));
    expect(round.eot).toBe(round.day);
});
