// ============================================================
// Ф0.5 (аудит 2026-10-03): кап помодоро «1 награда/карта/день» живёт в сейве
// (HERO.pomodoro), а не в localStorage — чистка дневных флагов и перезагрузка
// не сбрасывают его. Тот же паттерн, что в campaign3-phase0.test.js.
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
    localStorage.setItem('neurodeck_full_save', arg.save);
    localStorage.setItem('neurodeck_gen', '1');
}
test.beforeEach(async ({ page }) => { await page.route('**/telegram-web-app.js', (r) => r.abort()); });

async function boot(page, cards) {
    const s = seedSave({});
    if (cards) s.forged = cards;
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(s) });
    await page.goto('/');
    await page.waitForSelector('.app-wrap');
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show')); });
}
const card = (id, extra) => Object.assign({ id, name: 'Дело ' + id, rank: 'C', stat: 'str', streak: 3, mastery: 0, masteryThreshold: 7, totalCompletions: 5, progress: 0, prestige: 0, evolutionPath: 'depth', daysActive: 10, meta: '⚔ 15 мин · день', firstCompletedAt: Date.now() - 20 * 86400000, lastCompletedAt: Date.now() - 3 * 86400000, lastFailDay: null }, extra || {});

test('Ф0.5: кап помодоро в сейве — награда не выдаётся повторно после чистки localStorage-флагов и перезагрузки', async ({ page }) => {
    await boot(page, [card(1)]);
    const r = await page.evaluate(() => {
        togglePomodoro(1); // старт 25-минутного таймера
        pomodoroState().active[1] = Date.now() - 1; // «досидел» — срок вышел, пока приложение было закрыто
        const xp = HERO.totalXp;
        sweepExpiredPomodoros();
        return {
            gained: HERO.totalXp - xp,
            active: Object.keys(pomodoroState().active).length,
            done: Object.keys(pomodoroState().done).length,
            lsFlags: Object.keys(localStorage).filter((k) => k.indexOf('nd_pomodoro') === 0),
        };
    });
    expect(r.gained, 'досидевший таймер дал +5 XP ровно один раз').toBe(5);
    expect(r.active).toBe(0);
    expect(r.done).toBe(1);
    expect(r.lsFlags, 'флаги больше не живут в localStorage').toEqual([]);
    const saved = await page.evaluate(() => { saveGameState(); return JSON.parse(localStorage.getItem('neurodeck_full_save')).hero.pomodoro; });
    expect(Object.keys(saved.done).length).toBe(1);

    // «фарм»: сносим все дневные localStorage-флаги (как в старой дыре) и перезагружаемся
    await page.evaluate(() => { Object.keys(localStorage).filter((k) => /^nd_/.test(k)).forEach((k) => localStorage.removeItem(k)); });
    await page.reload();
    await page.waitForSelector('.app-wrap');
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => {
        const xp = HERO.totalXp;
        togglePomodoro(1); // повторный фокус в тот же день
        return { done: Object.keys(pomodoroState().done).length, active: Object.keys(pomodoroState().active).length, gained: HERO.totalXp - xp };
    });
    expect(after.done, 'кап дня пережил перезагрузку').toBe(1);
    expect(after.active, '«Уже был» — второй таймер не стартует').toBe(0);
    expect(after.gained, 'награда не фармят повторной установкой таймера').toBe(0);
});

test('Ф0.5: одноразовая миграция — nd_pomodoro_* из localStorage переезжают в сейв и ключи удаляются', async ({ page }) => {
    await boot(page, [card(1)]);
    // воспроизводим «старую версию»: живой таймер + вчерашний хвост капа в localStorage
    await page.evaluate(() => {
        localStorage.setItem('nd_pomodoro_1', String(Date.now() + 600000));
        localStorage.setItem('nd_pomodoro_done_1_2000-01-01', '2000-01-01');
    });
    await page.reload();
    await page.waitForSelector('.app-wrap');
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({
        lsKeys: Object.keys(localStorage).filter((k) => k.indexOf('nd_pomodoro') === 0),
        active: Object.keys(pomodoroState().active).length,
        done: Object.keys(pomodoroState().done).length,
        saved: Object.keys((JSON.parse(localStorage.getItem('neurodeck_full_save')).hero.pomodoro || {}).active || {}).length,
    }));
    expect(r.lsKeys, 'старые ключи удалены после переноса').toEqual([]);
    expect(r.active, 'живой таймер переехал').toBe(1);
    expect(r.done, 'вчерашний хвост не переносился').toBe(0);
    expect(r.saved, 'таймер попал в сейв').toBe(1);
});
