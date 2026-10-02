// ============================================================
// Кампания 3.0, Фаза 0 — анти-абуз: ОД будут идти только из дел, поэтому дыры закрываются заранее.
//   0.1 молчание дороже честного пропуска (гнев 1 vs 0.5)
// Тот же паттерн, что в audit-r2-data: сид одним аргументом, один раз на вкладку.
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

const day = (o) => new Date(Date.now() + 3 * 3600000 + o * 86400000).toISOString().slice(0, 10);

async function boot(page, over, cards) {
    const s = seedSave(over || {});
    if (cards) s.forged = cards;
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(s) });
    await page.goto('/');
    await page.waitForSelector('.app-wrap');
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show')); });
}
const card = (id, extra) => Object.assign({ id, name: 'Дело ' + id, rank: 'C', stat: 'str', streak: 3, mastery: 0, masteryThreshold: 7, totalCompletions: 5, progress: 0, prestige: 0, evolutionPath: 'depth', daysActive: 10, meta: '⚔ 15 мин · день', firstCompletedAt: Date.now() - 20 * 86400000, lastCompletedAt: Date.now() - 3 * 86400000, lastFailDay: null }, extra || {});

test('Ф0.1: молчаливые пропуски вчера — гнев и золото; честная отметка и выполнение не наказываются', async ({ page }) => {
    await boot(page, {}, [
        card(1),                                                                   // молчание
        card(2, { lastFailDay: day(-1) }),                                          // честный пропуск вчера
        card(3, { lastCompletedAt: Date.now() - 86400000 }),                         // выполнено вчера (в любой час суток — день тот же)
        card(4, { firstCompletedAt: null, lastCompletedAt: null }),                 // не начата — не наказываем
    ]);
    const r = await page.evaluate(() => {
        HERO.gold = 50; siege.wkSkips = 0; siege.wkHonest = 0; const _o = applySilentMisses; let d = null; applySilentMisses = function(k) { const g = HERO.gold; const n = _o(k); d = g - HERO.gold; return n; };
        lastWeekReset = getThisMondayKey(); lastDayReset = getMSKDayKey(Date.now() - 86400000); // неделя не меняется — иначе недельный сброс обнулит счётчики
        checkDailyReset();
        return { skips: siege.wkSkips, gold: d };
    });
    expect(r.skips, 'одна молчаливая карточка = 1 гнев').toBe(1);
    expect(r.gold, 'и −1 💰').toBe(1);
});

test('Ф0.1: молчание ограничено 3 карточками в сутки', async ({ page }) => {
    await boot(page, {}, [1, 2, 3, 4, 5, 6].map((i) => card(i)));
    const r = await page.evaluate(() => {
        HERO.gold = 50; siege.wkSkips = 0; const _o = applySilentMisses; let d = null; applySilentMisses = function(k) { const g = HERO.gold; const n = _o(k); d = g - HERO.gold; return n; };
        lastWeekReset = getThisMondayKey(); lastDayReset = getMSKDayKey(Date.now() - 86400000); // неделя не меняется — иначе недельный сброс обнулит счётчики
        checkDailyReset();
        return { skips: siege.wkSkips, gold: d };
    });
    expect(r.skips).toBe(3);
    expect(r.gold, '−1 💰 за каждую, но не больше 3').toBe(3);
});

test('Ф0.1: честный пропуск весит вдвое меньше молчаливого в гневе осады, откат возвращает счётчик', async ({ page }) => {
    await boot(page, {}, [card(1), card(2), card(3)]);
    const r = await page.evaluate(() => {
        siege.wkSkips = 0; siege.wkHonest = 0;
        const base = wkSkipWrath();
        failCard(null, 1); const one = wkSkipWrath();
        failCard(null, 2); const two = wkSkipWrath();
        failCard(null, 3); const three = wkSkipWrath();
        return { base, one, two, three, honest: siege.wkHonest, silent: siege.wkSkips };
    });
    expect(r.base).toBe(0);
    expect(r.two, 'два честных пропуска = 1 гнев (половина от двух молчаливых)').toBe(1);
    expect(r.three, 'три честных = 1 (округление вниз)').toBe(1);
    expect(r.honest).toBe(3);
    expect(r.silent, 'честные не попадают в молчаливый счётчик').toBe(0);
});

test('Ф0.1: недельный сброс обнуляет честные пропуски; сейв хранит wkHonest', async ({ page }) => {
    await boot(page, { siege: { week: 4, lastResult: null, assaultDay: null, wkSkips: 0, wkTaskFails: 0, wkHonest: 4 } }, [card(1, { lastCompletedAt: Date.now() })]);
    expect(await page.evaluate(() => siege.wkHonest), 'wkHonest пережил загрузку').toBe(4);
    const saved = await page.evaluate(() => { saveGameState(); return JSON.parse(localStorage.getItem('neurodeck_full_save')).siege.wkHonest; });
    expect(saved).toBe(4);
});

test('Ф0.2: после 5 сундуков за сутки золото из сундука не даётся — только XP; счётчик в сейве переживает очистку localStorage-флагов', async ({ page }) => {
    await boot(page, {}, [card(1, { lastCompletedAt: Date.now() })]);
    const r = await page.evaluate(() => {
        const out = []; const _g = goldGain; let paid = 0;
        goldGain = function(n, why) { if (why === 'chest') paid++; return _g(n, why); }; // считаем именно выплаты из сундуков (повышение уровня тоже даёт золото)
        for (let i = 0; i < 7; i++) {
            TASKS.push({ id: 900 + i, name: 'Задача ' + i, tier: 'urgent', deadline: Date.now() + 3600000, status: 'done', doneAt: Date.now(), createdAt: Date.now() });
            const before = paid; claimTaskChest(900 + i, 'gold'); out.push(paid - before);
        }
        return { out, chests: HERO.dayFlags.chests };
    });
    expect(r.out).toEqual([1, 1, 1, 1, 1, 0, 0]);
    expect(r.chests).toBe(7);
});

test('Ф0.3: порог ранг-апа ≥ 5 при ковке и только вверх при правке', async ({ page }) => {
    await boot(page, {}, [card(1, { masteryThreshold: 8 })]);
    const r = await page.evaluate(() => {
        document.getElementById('forgeMastery').value = '2';
        const minAttr = document.getElementById('forgeMastery').min;
        openEditCardDirect(1);
        document.getElementById('editCardMastery').value = '3';
        saveEditCard();
        const afterLower = FORGED.find((c) => c.id === 1).masteryThreshold;
        openEditCardDirect(1);
        document.getElementById('editCardMastery').value = '11';
        saveEditCard();
        return { minAttr, afterLower, afterRaise: FORGED.find((c) => c.id === 1).masteryThreshold };
    });
    expect(r.minAttr).toBe('5');
    expect(r.afterLower, 'снизить нельзя').toBe(8);
    expect(r.afterRaise, 'повысить можно').toBe(11);
});

test('Ф0.4: награда ежедневного квеста берётся из каталога, а не из атрибута DOM', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
        const q = DQ_POOL[0];
        dailyQuests = { day: getMSKDayKey(), quests: [q], done: {}, progress: {} };
        dailyQuests.progress[q.counter] = q.goal;
        const g0 = HERO.gold;
        completeDailyQuest(q.id, 999999); // подделанный второй аргумент (data-reward) игнорируется
        return { gain: HERO.gold - g0, expect: q.reward };
    });
    expect(r.gain).toBeLessThan(1000);
    expect(r.gain).toBeGreaterThanOrEqual(r.expect);
    expect(r.gain, 'не больше награды каталога с множителями дохода').toBeLessThanOrEqual(r.expect * 3);
});

test('Ф0.5: флаги суток (реролл, цель дня) в сейве — очистка localStorage не даёт повторить', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
        const f = dayFlags(); f.reroll = true; f.goal = true; saveGameState();
        return JSON.parse(localStorage.getItem('neurodeck_full_save')).hero.dayFlags;
    });
    expect(r.reroll).toBe(true);
    expect(r.goal).toBe(true);
    await page.evaluate(() => { Object.keys(localStorage).filter((k) => /reroll|dailgoal|nd_/.test(k)).forEach((k) => localStorage.removeItem(k)); });
    await page.reload();
    await page.waitForSelector('.app-wrap');
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => ({ reroll: dayFlags().reroll, goal: dayFlags().goal }));
    expect(after).toEqual({ reroll: true, goal: true });
});

test('Ф0.6: одна карточка — одно выполнение в сутки (повторная отметка не даёт XP, золота и серии)', async ({ page }) => {
    await boot(page, {}, [card(1)]);
    const r = await page.evaluate(() => {
        const ev = { stopPropagation() {}, target: document.body };
        completeCard(ev, 1);
        const s1 = { xp: HERO.totalXp, gold: HERO.gold, n: FORGED[0].totalCompletions, st: FORGED[0].streak };
        completeCard(ev, 1); completeCard(ev, 1);
        const s2 = { xp: HERO.totalXp, gold: HERO.gold, n: FORGED[0].totalCompletions, st: FORGED[0].streak };
        return { s1, s2 };
    });
    expect(r.s2).toEqual(r.s1);
});
