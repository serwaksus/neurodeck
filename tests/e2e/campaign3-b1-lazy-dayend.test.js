// ============================================================
// Кампания 3.0 — аудит 2026-10-03: B1 (молчание/просрочка за вчера теряются, пока модули c3 грузятся лениво) и B2 (undoSkip).
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

test('B1: перезагрузка в новый день — вчерашнее молчание даёт тень фракции даже при ленивой загрузке модулей', async ({ page }) => {
    await boot(page);
    // «Вчера»: игра и кампания остановились на вчерашних сутках, карточка вчера не выполнена (молчание)
    await page.evaluate(() => {
        const y = getMSKDayKey(Date.now() - 86400000);
        lastWeekReset = getThisMondayKey(); lastDayReset = y;
        NDC3.ensure().day = y;
        saveGameState();
    });
    await page.reload();
    await page.waitForSelector('.app-wrap');
    await page.waitForFunction(() => window.NDC3 && NDC3.getState(), null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const s = JSON.parse(JSON.stringify(NDC3.getState())); return { sh: s.fac[0].sh, wkSkips: siege.wkSkips, early: window.__ndC3Early || null }; });
    expect(r.wkSkips, '2.0 учла вчерашний пропуск').toBeGreaterThanOrEqual(1);
    expect(r.sh[r.sh.length - 1], 'и кампания дала тень Телу за вчера').toBeGreaterThan(0);
    expect(r.early, 'буфер отдан рантайму').toBeNull();
});

test('B2: отмена честного пропуска откатывает и тень фракции (pend.h)', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
        const before = { gold: HERO.gold, streak: findCard(1).streak, shields: HERO.streakShields };
        failCard(null, 1);
        const afterFail = NDC3.getState().pend.h[0];
        undoSkip(1, before);
        return { afterFail, afterUndo: NDC3.getState().pend.h[0] };
    });
    expect(r.afterFail).toBe(1);
    expect(r.afterUndo).toBe(0);
});
