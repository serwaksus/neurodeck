// ============================================================
// Кампания 3.0 — «объявленный отдых» (решение владельца: отдых 1–2 дня в неделю объявляется заранее).
//   кнопка на панели объявляет отдых на завтра; закрытие отдыха-дня с молчанием не даёт теней;
//   отмена возвращает день; прошедший отдых вычищается из состояния.
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
    s.forged = [card(1, 'str')]; // Сила → Тело → фракция 0
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(s) });
    await page.goto('/');
    await page.waitForSelector('.app-wrap');
    await page.waitForFunction(() => window.renderCampaign3 && window.NDC3, null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show')); });
}
const openStrongholds = async (page) => { await page.click('.bnav-btn[data-view="strongholds"]'); await page.waitForTimeout(300); };

test('отдых: объявить на завтра через кнопку, закрыть сутки — молчание отдых-дня не даёт теней', async ({ page }) => {
    await boot(page);
    await openStrongholds(page);
    await expect(page.locator('#c3Root .c3')).toBeVisible();
    await expect(page.locator('[data-c3="rest-on"]')).toBeVisible();
    await expect(page.locator('.c3-lz').filter({ hasText: 'объявлено: 0 из 2' })).toBeVisible();
    await page.click('[data-c3="rest-on"]');
    const tm = await page.evaluate(() => getMSKDayKey(Date.now() + 86400000));
    let r = await page.evaluate(() => NDC3.getState().rest || []);
    expect(r).toEqual([tm]);
    await expect(page.locator('[data-c3="rest-off"]')).toBeVisible();
    await expect(page.locator('.c3-lz').filter({ hasText: 'объявлено: 1 из 2' })).toBeVisible();
    // закрыли сегодня (обычный день): молчание Тела → тень; закрыли завтра (отдых): то же молчание → 0
    await page.evaluate(() => {
        NDC3.onSilentMisses([1, 0, 0, 0]);
        NDC3.dayEnd(getMSKDayKey(Date.now() + 86400000));
        NDC3.onSilentMisses([1, 0, 0, 0]);
        NDC3.dayEnd(getMSKDayKey(Date.now() + 2 * 86400000));
    });
    const out = await page.evaluate((tm) => { const s = JSON.parse(JSON.stringify(NDC3.getState())); return { sh: s.fac[0].sh, rest: s.rest }; }, tm);
    expect(out.sh[out.sh.length - 2], 'обычный день: молчание дало тень').toBeGreaterThan(0);
    expect(out.sh[out.sh.length - 1], 'отдых-день: теней нет').toBe(0);
    expect(out.rest, 'прошедший отдых вычищен').toEqual([]);
});

test('отдых: отмена возвращает день, слот недели освобождается', async ({ page }) => {
    await boot(page);
    await openStrongholds(page);
    await page.click('[data-c3="rest-on"]');
    await expect(page.locator('[data-c3="rest-off"]')).toBeVisible();
    await page.click('[data-c3="rest-off"]');
    expect(await page.evaluate(() => (NDC3.getState().rest || []).length)).toBe(0);
    await expect(page.locator('[data-c3="rest-on"]')).toBeVisible();
    await expect(page.locator('.c3-lz').filter({ hasText: 'объявлено: 0 из 2' })).toBeVisible();
    await page.click('[data-c3="rest-on"]'); // слот свободен — объявление снова доступно
    expect(await page.evaluate(() => (NDC3.getState().rest || []).length)).toBe(1);
});
