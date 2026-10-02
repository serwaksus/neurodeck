// ============================================================
// Кампания 3.0, Ф1 — e2e вертикального среза за флагом nd_c3:
//   флаг выкл → 2.0 как была (панели нет, ключа c3 в сейве нет);
//   флаг вкл → дело Тела даёт ОД, шаг по карте тратит ОД, бой с Заставой, состояние переживает перезагрузку.
// ============================================================
const { test, expect } = require('@playwright/test');
const seedSave = require('./seed.cjs');

test.use({ serviceWorkers: 'block' });

function SEED_IN_PAGE(arg) {
    if (sessionStorage.getItem('__ndSeeded')) return;
    sessionStorage.setItem('__ndSeeded', '1');
    localStorage.clear();
    localStorage.setItem('neurodeck_perf_mode', 'eco');
    localStorage.setItem('neurodeck_onboarding_done', '1');
    localStorage.setItem('neurodeck_starter_done', '1');
    if (arg.flag) localStorage.setItem('nd_c3', '1');
    localStorage.setItem('neurodeck_full_save', arg.save);
    localStorage.setItem('neurodeck_gen', '1');
}
test.beforeEach(async ({ page }) => { await page.route('**/telegram-web-app.js', (r) => r.abort()); });

const card = (id, stat, rank) => ({ id, name: 'Дело ' + id, rank: rank || 'C', stat, streak: 3, mastery: 0, masteryThreshold: 7, totalCompletions: 5, progress: 0, prestige: 0, evolutionPath: 'depth', daysActive: 10, meta: '⚔ 15 мин · день', firstCompletedAt: Date.now() - 20 * 86400000, lastCompletedAt: Date.now() - 3 * 86400000, lastFailDay: null });

async function boot(page, flag, cards) {
    const s = seedSave({});
    s.forged = cards || [card(1, 'str', 'A'), card(2, 'end', 'C'), card(3, 'int', 'SSS')];
    await page.addInitScript(SEED_IN_PAGE, { flag, save: JSON.stringify(s) });
    await page.goto('/');
    await page.waitForSelector('.app-wrap');
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show')); });
}
const complete = (page, id) => page.evaluate((i) => completeCard({ stopPropagation() {}, target: document.body }, i), id);
const openStrongholds = async (page) => { await page.click('.bnav-btn[data-view="strongholds"]'); await page.waitForTimeout(300); };
const c3 = (page) => page.evaluate(() => JSON.parse(JSON.stringify(NDC3.getState())));

test('флаг выключен: панели нет, состояние не создаётся, ключа c3 в сейве нет, отметка дела ничего не меняет', async ({ page }) => {
    await boot(page, false);
    await openStrongholds(page);
    await expect(page.locator('#c3Root')).toBeHidden();
    await complete(page, 1);
    expect(await page.evaluate(() => NDC3.getState())).toBeNull();
    const saved = await page.evaluate(() => { saveGameState(); return JSON.parse(localStorage.getItem('neurodeck_full_save')); });
    expect('c3' in saved).toBe(false);
});

test('флаг включён: панель видна; дело Тела (ранг A) даёт 2 ОД, дело Разума — 0; задача — 2 ОД', async ({ page }) => {
    await boot(page, true);
    await openStrongholds(page);
    await expect(page.locator('#c3Root .c3')).toBeVisible();
    await complete(page, 3); // Интеллект
    expect((await c3(page)).ap).toBe(0);
    await complete(page, 1); // Сила, ранг A → 1 + 1
    expect((await c3(page)).ap).toBe(2);
    await page.evaluate(() => { TASKS.push({ id: 700, name: 'Отчёт', tier: 'urgent', deadline: Date.now() + 3600000, status: 'active', createdAt: Date.now() }); completeTask(700); });
    expect((await c3(page)).ap).toBe(4);
    await expect(page.locator('#c3Root .c3-chip').first()).toContainText('4');
});

test('повторная отметка той же карточки не даёт ОД (связка с Ф0.6)', async ({ page }) => {
    await boot(page, true);
    await complete(page, 1); await complete(page, 1); await complete(page, 1);
    expect((await c3(page)).ap).toBe(2);
});

test('карта: тап по узлу и «Идти» двигает героя и тратит ОД; Заставу можно штурмовать, победа забирает узел', async ({ page }) => {
    await boot(page, true, [card(1, 'str', 'SSS'), card(2, 'end', 'SSS')]);
    await openStrongholds(page);
    await complete(page, 1); await complete(page, 2); // 3 + 3 = 6 ОД (кап суток)
    expect((await c3(page)).ap).toBe(6);
    await expect(page.locator('[data-c3="select"][data-n="3"]')).toHaveClass(/is-fog/); // туман: радиус 1 от героя и владений
    await page.click('[data-c3="select"][data-n="1"]');
    await page.click('[data-c3="go"]');
    await page.click('[data-c3="select"][data-n="3"]'); // Перекрёсток открылся
    await page.click('[data-c3="go"]');
    let s = await c3(page);
    expect(s.hero.node).toBe(3); expect(s.ap).toBe(4);
    // армия для теста боя — через состояние (набор армии тестируется в юнит-тестах)
    await page.evaluate(() => { NDC3.getState().hero.army = { t1: 20, t3: 4 }; renderCampaign3(); });
    await page.click('[data-c3="select"][data-n="4"]');
    await expect(page.locator('#c3Root .c3-detail')).toContainText('Оборона');
    await page.click('[data-c3="atk"]');
    await expect(page.locator('#confirmOverlay')).toHaveClass(/show/);
    await page.click('#confirmYes');
    await page.waitForTimeout(400);
    s = await c3(page);
    expect(s.own.charAt(4)).toBe('1'); expect(s.hero.node).toBe(4); expect(s.ap).toBe(3);
    expect(s.log[s.log.length - 1].t).toContain('Взято');
});

test('отказ в подтверждении штурма ничего не меняет', async ({ page }) => {
    await boot(page, true, [card(1, 'str', 'SSS'), card(2, 'end', 'SSS')]);
    await openStrongholds(page);
    await complete(page, 1); await complete(page, 2);
    await page.evaluate(() => { const s = NDC3.getState(); s.hero.node = 3; s.hero.army = { t1: 20, t3: 4 }; renderCampaign3(); });
    await page.click('[data-c3="select"][data-n="4"]');
    await page.click('[data-c3="atk"]');
    await page.click('#confirmNo');
    const s = await c3(page);
    expect(s.own.charAt(4)).toBe('0'); expect(s.ap).toBe(6);
});

test('найм и закалка в Кузне; вдали от города найм недоступен', async ({ page }) => {
    await boot(page, true);
    await openStrongholds(page);
    await page.click('[data-c3="select"][data-n="0"]');
    const before = await c3(page);
    await page.click('[data-c3="hire"][data-t="t1"]');
    const after = await c3(page);
    expect(after.hero.army.t1).toBeGreaterThan(before.hero.army.t1);
    expect(after.res.g).toBeLessThan(before.res.g);
    await page.evaluate(() => { const s = NDC3.getState(); s.hero.node = 1; renderCampaign3(); });
    await page.click('[data-c3="select"][data-n="0"]');
    await expect(page.locator('[data-c3="hire"]')).toHaveCount(0);
});

test('состояние переживает перезагрузку; сейв c3 ≤ 2 КБ; ключ появляется только после включения флага', async ({ page }) => {
    await boot(page, true);
    await complete(page, 1);
    await page.waitForTimeout(1200); // debounce сохранения
    await page.evaluate(() => saveGameState());
    const size = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('neurodeck_full_save')).c3).length);
    expect(size).toBeLessThanOrEqual(2048);
    await page.reload();
    await page.waitForSelector('.app-wrap');
    await page.waitForTimeout(1200);
    const s = await c3(page);
    expect(s.ap).toBe(2); expect(s.apDay).toBe(2);
});

test('сутки закрываются: тени от молчания и просрочки, доход города, перенос ≤ 1 ОД', async ({ page }) => {
    await boot(page, true, [card(1, 'str', 'C'), card(2, 'end', 'C')]); // оба дела вчера не отмечены
    await page.evaluate(() => {
        NDC3.ensure();
        const s = NDC3.getState();
        s.day = getMSKDayKey(Date.now() - 86400000); s.ap = 5;
        lastWeekReset = getThisMondayKey();
        lastDayReset = getMSKDayKey(Date.now() - 86400000);
        checkDailyReset();
    });
    const s = await c3(page);
    expect(s.day).toBe(await page.evaluate(() => getMSKDayKey()));
    expect(s.fac.sh[s.fac.sh.length - 1]).toBe(2); // 2 молчаливых пропуска (Ф0.1) → 2 тени
    expect(s.ap).toBe(1);
    expect(s.res.g).toBeGreaterThanOrEqual(20 + 20);
});
