// ============================================================
// Кампания 3.0, Ф2 — e2e за флагом nd_c3: 4 героя-сферы, карта из 33 узлов, города.
//   флаг выкл → 2.0 как была (панели нет, ключа c3 в сейве нет, выбор сферы задачи скрыт);
//   флаг вкл → дело сферы двигает героя СВОЕЙ сферы, шаг по карте тратит ОД, бой, найм, залы, сбор армий, перезагрузка.
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
const DEFAULT_CARDS = () => [card(1, 'str', 'A'), card(2, 'int', 'C'), card(3, 'wil', 'C'), card(4, 'cha', 'SSS'), card(5, 'end', 'C')];

async function boot(page, flag, cards) {
    const s = seedSave({});
    s.forged = cards || DEFAULT_CARDS();
    await page.addInitScript(SEED_IN_PAGE, { flag, save: JSON.stringify(s) });
    await page.goto('/');
    await page.waitForSelector('.app-wrap');
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show')); });
}
const complete = (page, id) => page.evaluate((i) => completeCard({ stopPropagation() {}, target: document.body }, i), id);
const openStrongholds = async (page) => { await page.click('.bnav-btn[data-view="strongholds"]'); await page.waitForTimeout(300); };
const c3 = (page) => page.evaluate(() => JSON.parse(JSON.stringify(NDC3.getState())));
const patch = (page, fn) => page.evaluate((src) => { const f = new Function('s', src); f(NDC3.getState()); renderCampaign3(); }, fn);

test('флаг выключен: панели нет, состояние не создаётся, ключа c3 нет, выбор сферы задачи скрыт, отметка дела ничего не меняет', async ({ page }) => {
    await boot(page, false);
    await openStrongholds(page);
    await expect(page.locator('#c3Root')).toBeHidden();
    await complete(page, 1);
    expect(await page.evaluate(() => NDC3.getState())).toBeNull();
    const saved = await page.evaluate(() => { saveGameState(); return JSON.parse(localStorage.getItem('neurodeck_full_save')); });
    expect('c3' in saved).toBe(false);
    await page.evaluate(() => openTaskModal());
    await expect(page.locator('#taskSphereRow')).toBeHidden();
});

test('флаг включён: панель с 4 вкладками героев; каждое дело двигает героя СВОЕЙ сферы и копит ресурс своей сферы', async ({ page }) => {
    await boot(page, true);
    await openStrongholds(page);
    await expect(page.locator('#c3Root .c3')).toBeVisible();
    await expect(page.locator('.c3-tab')).toHaveCount(4);
    await complete(page, 1); // Сила, ранг A → Тело +2
    await complete(page, 2); // Интеллект → Разум +1
    await complete(page, 3); // Воля → Дух +1
    await complete(page, 4); // Харизма, SSS → Связи +3
    const s = await c3(page);
    expect(s.ap).toEqual([2, 1, 1, 3]);
    expect([s.res.st, s.res.kn, s.res.wl, s.res.in]).toEqual([1, 1, 1, 1]);
    await expect(page.locator('.c3-tab').nth(3).locator('.c3-tabap')).toHaveText('3 ОД');
});

test('повторная отметка той же карточки не даёт ОД (связка с Ф0.6)', async ({ page }) => {
    await boot(page, true);
    await complete(page, 1); await complete(page, 1); await complete(page, 1);
    expect((await c3(page)).ap).toEqual([2, 0, 0, 0]);
});

test('задача: при включённом флаге в форме есть выбор сферы; выполненная задача даёт 2 ОД герою выбранной сферы', async ({ page }) => {
    await boot(page, true);
    await page.evaluate(() => openTaskModal());
    await expect(page.locator('#taskSphereRow')).toBeVisible();
    await page.fill('#taskName', 'Позвонить маме');
    await page.click('#taskSphereChips [data-sphere="ties"]');
    await page.evaluate(() => createTask());
    const id = await page.evaluate(() => TASKS[0].id);
    expect(await page.evaluate(() => TASKS[0].sphere)).toBe('ties');
    await page.evaluate((i) => completeTask(i), id);
    expect((await c3(page)).ap).toEqual([0, 0, 0, 2]);
    // сфера задачи переживает сохранение
    const saved = await page.evaluate(() => { saveGameState(); return JSON.parse(localStorage.getItem('neurodeck_full_save')).tasks[0].sphere; });
    expect(saved).toBe('ties');
});

test('карта: тап по узлу и «Идти» двигает выбранного героя и тратит ЕГО ОД; Заставу можно штурмовать, победа забирает узел', async ({ page }) => {
    await boot(page, true, [card(1, 'str', 'SSS'), card(5, 'end', 'SSS'), card(2, 'int', 'SSS')]);
    await openStrongholds(page);
    await complete(page, 1); await complete(page, 5); await complete(page, 2); // Тело 3+3=6, Разум 3
    expect((await c3(page)).ap).toEqual([6, 3, 0, 0]);
    await expect(page.locator('[data-c3="select"][data-n="3"]')).toHaveClass(/is-fog/);
    await page.click('[data-c3="select"][data-n="1"]'); await page.click('[data-c3="go"]');
    await page.click('[data-c3="select"][data-n="3"]'); await page.click('[data-c3="go"]');
    let s = await c3(page);
    expect(s.heroes[0].node).toBe(3); expect(s.ap).toEqual([4, 3, 0, 0]); expect(s.heroes[1].node).toBe(8);
    await patch(page, 's.heroes[0].army = { t1: 60, t3: 6, t5: 0 };');
    await page.click('[data-c3="select"][data-n="4"]');
    await expect(page.locator('#c3Root .c3-detail')).toContainText('Оборона');
    await page.click('[data-c3="atk"]');
    await expect(page.locator('#confirmOverlay')).toHaveClass(/show/);
    await page.click('#confirmYes');
    await page.waitForTimeout(400);
    s = await c3(page);
    expect(s.own.charAt(4)).toBe('1'); expect(s.heroes[0].node).toBe(4); expect(s.ap[0]).toBe(3); expect(s.ap[1]).toBe(3);
    expect(s.log[s.log.length - 1].t).toContain('Воитель взял');
});

test('вкладка героя переключает управление: Разум идёт на СВОИХ ОД, Тело не тратится', async ({ page }) => {
    await boot(page, true, [card(2, 'int', 'SSS')]);
    await openStrongholds(page);
    await complete(page, 2);
    await page.click('.c3-tab:nth-child(2)'); // Разум
    await page.click('[data-c3="select"][data-n="9"]'); await page.click('[data-c3="go"]');
    const s = await c3(page);
    expect(s.heroes[1].node).toBe(9); expect(s.ap[1]).toBe(2); expect(s.heroes[0].node).toBe(0);
});

test('отказ в подтверждении штурма ничего не меняет', async ({ page }) => {
    await boot(page, true, [card(1, 'str', 'SSS'), card(5, 'end', 'SSS')]);
    await openStrongholds(page);
    await complete(page, 1); await complete(page, 5);
    await patch(page, 's.heroes[0].node = 3; s.heroes[0].army = { t1: 60, t3: 6, t5: 0 };');
    await page.click('[data-c3="select"][data-n="4"]');
    await page.click('[data-c3="atk"]');
    await page.click('#confirmNo');
    const s = await c3(page);
    expect(s.own.charAt(4)).toBe('0'); expect(s.ap[0]).toBe(6);
});

test('город: найм, жилище и зал за ресурсы сферы; вдали от города найм недоступен', async ({ page }) => {
    await boot(page, true);
    await openStrongholds(page);
    await patch(page, 's.res = { g: 500, st: 40, kn: 40, wl: 40, in: 40 };');
    await page.click('[data-c3="select"][data-n="0"]');
    const before = await c3(page);
    await page.click('[data-c3="hire"][data-t="t1"]');
    let s = await c3(page);
    expect(s.heroes[0].army.t1).toBeGreaterThan(before.heroes[0].army.t1); expect(s.res.g).toBeLessThan(before.res.g);
    await page.click('[data-c3="dw"][data-t="t3"]');
    s = await c3(page); expect(s.towns[0].dw.t3).toBe(1);
    await patch(page, 's.towns[0].pool.t3 = 2;');
    await page.click('[data-c3="hire"][data-t="t3"]');
    expect((await c3(page)).heroes[0].army.t3).toBe(1);
    await page.click('[data-c3="hall"]');
    s = await c3(page); expect(s.towns[0].hall).toBe(1);
    await patch(page, 's.heroes[0].node = 1;');
    await page.click('[data-c3="select"][data-n="0"]');
    await expect(page.locator('[data-c3="hire"]')).toHaveCount(0);
});

test('сбор армий: герои на одном узле передают войска, герой-получатель сильнее', async ({ page }) => {
    await boot(page, true);
    await openStrongholds(page);
    await patch(page, 's.heroes[1].node = 0; s.heroes[1].army = { t1: 20, t3: 0, t5: 0 };');
    await page.click('[data-c3="select"][data-n="0"]');
    await expect(page.locator('[data-c3="gather"]')).toHaveCount(1);
    await page.click('[data-c3="gather"]');
    const s = await c3(page);
    expect(s.heroes[0].army.t1).toBe(28); expect(s.heroes[1].army.t1).toBe(0);
});

test('состояние переживает перезагрузку; сейв c3 ≤ 4 КБ', async ({ page }) => {
    await boot(page, true);
    await complete(page, 1); await complete(page, 4);
    await page.waitForTimeout(1200);
    await page.evaluate(() => saveGameState());
    const size = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('neurodeck_full_save')).c3).length);
    expect(size).toBeLessThanOrEqual(4096);
    await page.reload();
    await page.waitForSelector('.app-wrap');
    await page.waitForTimeout(1200);
    expect((await c3(page)).ap).toEqual([2, 0, 0, 3]);
});

test('сутки закрываются: тени от молчания, доход 4 городов, перенос ≤ 1 ОД на героя', async ({ page }) => {
    await boot(page, true, [card(1, 'str', 'C'), card(2, 'int', 'C')]); // оба дела вчера не отмечены
    await page.evaluate(() => {
        NDC3.ensure();
        const s = NDC3.getState();
        s.day = getMSKDayKey(Date.now() - 86400000); s.ap = [5, 4, 3, 2];
        lastWeekReset = getThisMondayKey();
        lastDayReset = getMSKDayKey(Date.now() - 86400000);
        checkDailyReset();
    });
    const s = await c3(page);
    expect(s.day).toBe(await page.evaluate(() => getMSKDayKey()));
    expect(s.fac.sh[s.fac.sh.length - 1]).toBe(2);
    expect(s.ap).toEqual([1, 1, 1, 1]);
    expect(s.res.g).toBeGreaterThanOrEqual(40 + 40);
});
