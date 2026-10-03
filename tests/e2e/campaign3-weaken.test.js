// ============================================================
// Кампания 3.0 — «как ослабить фракции» (план §3): ранг-ап карточки из completeCard
//   бьёт по гарнизону логова фракции её сферы (хук NDC3.onCardRankUp, без буфера —
//   действие пользователя) и пишет строку в журнал панели.
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

// path depth даёт +1.5 мастерства: mastery 6 из 7 — одного выполнения хватает до ранг-апа; Сила → Тело → фракция 0 (оплот 7)
const card = (id, stat) => ({ id, name: 'Дело ' + id, rank: 'C', stat, streak: 3, mastery: 6, masteryThreshold: 7, totalCompletions: 5, progress: 0, prestige: 0, evolutionPath: 'depth', daysActive: 10, meta: '⚔ 15 мин · день', firstCompletedAt: Date.now() - 20 * 86400000, lastCompletedAt: Date.now() - 3 * 86400000, lastFailDay: null });

async function boot(page) {
    const s = seedSave({ army: { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 3 } });
    s.forged = [card(1, 'str')];
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(s) });
    await page.goto('/');
    await page.waitForSelector('.app-wrap');
    await page.waitForFunction(() => window.renderCampaign3 && window.NDC3, null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show')); });
}
const complete = (page, id) => page.evaluate((i) => completeCard({ stopPropagation() {}, target: document.body }, i), id);

test('ранг-ап карточки Тела: гарнизон оплота Лени −5% и строка в журнале; без ранг-апа гарнизон цел', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => NDC3.getState().gar[7])).toBe(120);
    // выполнение вдалеке от порога мастерства — ранга нет, логово цело
    await page.evaluate(() => { FORGED[0].mastery = 0; });
    await complete(page, 1);
    expect(await page.evaluate(() => NDC3.getState().gar[7])).toBe(120);
    // вторая карточка той же сферы на грани порога: выполнение = ранг-ап C→CC
    await page.evaluate(() => { FORGED.push({ ...FORGED[0], id: 2, name: 'Дело 2', mastery: 6, lastCompletedAt: Date.now() - 3 * 86400000 }); });
    await complete(page, 2);
    const after = await page.evaluate(() => { const s = NDC3.getState(); return { gar: s.gar[7], log: s.log.map((l) => l.t), rank: FORGED.find((c) => c.id === 2).rank }; });
    expect(after.rank).toBe('CC');
    expect(after.gar).toBe(114);
    expect(after.log.some((t) => t.indexOf('Оплот Лени') >= 0)).toBe(true);
});
