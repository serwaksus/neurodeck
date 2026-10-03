const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');

// P12: полный поток босса в браузере на реальном app.js — без прямого посева
// итогового состояния. День 1: панель босса (модалка провинции) + одноразовый
// интро-лор + вызов + фазовые переходы cards→streak с соблюдением G2 (2 фазы/день).
// День 2 (сев продолжения арки, попытка снова доступна): gold-фаза закрывается
// честным доходом (сундуки срочных задач), босс повержен → reward-choice модалка;
// закрытие без выбора → reload → pending предлагается снова → выбор потребляет.
// Сиды детерминированы: lastDayReset=сегодня (дневной/недельный тики и события
// дня не срабатывают), дедлайны задач в будущем, капитуляции не зависят от даты.

// ---- зеркало getMSKDayKey/getThisMondayKey из app.js (см. campaign-flows) ----
const DAY = (offset = 0) => new Date(Date.now() + 3 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const MONDAY = (() => {
  const d = new Date(Date.now() + 3 * 3600000);
  const diff = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
})();

function shState(captured) {
  return Array.from({ length: 20 }, (_, i) => ({
    id: 'sh' + String(i + 1).padStart(2, '0'),
    captured: i < captured,
    garrison: [],
    buildings: {},
    corruption: { stage: 'ok', debtDays: 0 },
  }));
}
function makeSave(opts = {}) {
  const o = Object.assign({ captured: 5, bosses: null, tasks: null }, opts);
  // 3 карты с разными статами: фаза «cards n=3» закрывается кликами по колоде
  const cards = ['str', 'agi', 'int'].map((stat, i) => ({
    id: i + 1, name: 'Карта босса ' + (i + 1), rank: 'C', stat, streak: 0, mastery: 0, masteryThreshold: 5,
    totalCompletions: 0, progress: 0, prestige: 0, evolutionPath: null, daysActive: 1, meta: '',
    firstCompletedAt: 1750000000000, lastCompletedAt: null, lastFailDay: null,
  }));
  // 10 срочных задач: клейм золота сундука по +20💰 = ровно 200💰 дня для gold-фазы
  const tasks = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1, name: 'Гейт-долг ' + (i + 1), tier: 'urgent', deadline: Date.now() + 86400000,
    status: 'active', createdAt: Date.now(), doneAt: null, ghostSince: null,
  }));
  return {
    v: 13, gen: 1, savedAt: Date.now(), t: Date.now(),
    hero: {
      name: 'Босс-гейт', level: 5, xp: 10, xpToNext: 200, totalXp: 500, gold: 500,
      lastSessionAt: Date.now(), consecutivePerfectDays: 0, dailyCompletions: 0, dailySkips: 0,
      bosses: Object.assign(
        { defeated: [], activeNum: null, phase: 0, attemptDay: null, closedDay: null, closedCount: 0, introSeen: [], rewardChoice: {}, pendingReward: null },
        o.bosses || {}
      ),
    },
    stats: {}, forged: cards,
    goals: [], tasks: o.tasks || tasks, taskIdCounter: 11, forgedIdCounter: 4, uidCounter: 1, goalIdCounter: 1,
    xpHistory: [], bloodOath: null, hirePool: null,
    lastDayReset: DAY(0), lastWeekReset: MONDAY,
    strongholds: shState(o.captured),
    army: { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 100 }, week: 3 },
    siege: { week: 1, lastResult: null, assaultDay: DAY(-1), wkSkips: 0, wkTaskFails: 0, retriedThisWeek: false, rams: 0, ladders: 0 },
    season: { num: 1, start: DAY(0), crownBonus: 0, snapshot: { totalXp: 500, gold: 500, captured: o.captured, completions: 0, level: 5 } },
    throne: 0,
  };
}

// Сид едет через sessionStorage с самоочисткой в init-скрипте (паттерн campaign-flows):
// переживёт reload, не даст beforeunload перезатереть собой localStorage.
async function bootWithSave(page, save) {
  await page.route('**/telegram-web-app.js', route => route.abort());
  await page.addInitScript(() => {
    const j = sessionStorage.getItem('__nd_e2e_save');
    if (j) {
      sessionStorage.removeItem('__nd_e2e_save');
      localStorage.setItem('neurodeck_full_save', j);
      try { localStorage.setItem('neurodeck_gen', String(JSON.parse(j).gen || 1)); } catch (e) {}
      localStorage.setItem('neurodeck_onboarding_done', '1');
    }
  });
  await page.goto('/e2e-prologue'); // 404 на том же origin: приложение не грузится
  await page.evaluate((s) => sessionStorage.setItem('__nd_e2e_save', JSON.stringify(s)), save);
  await page.goto('/');
  await openStrongholds(page);
}
async function openStrongholds(page) {
  await page.waitForSelector('.bnav-btn[data-view="strongholds"]', { state: 'visible' });
  await page.click('.bnav-btn[data-view="strongholds"]');
  await page.waitForSelector('#view-strongholds.active');
}
async function openBossPanel(page) { // панель первой твердыни провинции I — узел босса
  await page.click('.km-node.km-captured[data-action="sh-open"][data-idx="0"]');
  await page.waitForSelector('.boss-card');
}

// Спай тостов: интро-лор и фазовые переходы — фактические вызовы showToast,
// без гонки с длительностью тоста в DOM. Ставится после загрузки страницы.
async function spyToasts(page) {
  await page.evaluate(() => {
    window.__ndToasts = [];
    const orig = window.showToast;
    window.showToast = function (title, body, kind, action) {
      try { window.__ndToasts.push(String(title)); } catch (e) {}
      return orig.call(this, title, body, kind, action);
    };
  });
}
async function toastCount(page, re) {
  return page.evaluate((src) => (window.__ndToasts || []).filter((t) => new RegExp(src).test(t)).length, re.source);
}

// ===================== День 1: лор один раз + фазовые переходы =====================
test('P12: интро-лор ровно один раз; вызов босса и фазы cards→streak (G2: 2 фазы/день)', async ({ page }) => {
  await bootWithSave(page, makeSave()); // пров. 1 собрана → босс I «Гнилоух» на sh01
  await spyToasts(page);

  // открыть панель босса: карточка с лором, 3 фазы, кнопка вызова
  await openBossPanel(page);
  const card = page.locator('.boss-card');
  await expect(card).toContainText('Гнилоух, Пастух Чумных Стад');
  await expect(card).toContainText('Стада мора текут сквозь границы');
  await expect(card.locator('.boss-phase')).toHaveCount(3);
  await expect(card.locator('.boss-phase.active')).toContainText('Фаза 1/3: Выполнить 3 карт. за день');
  await expect(page.locator('.sh-buy[data-action="boss-challenge"][data-num="1"]')).toBeVisible();

  // интро-лор показан при первом открытии — ровно один раз
  await expect.poll(() => toastCount(page, /^⚔ Гнилоух, Пастух Чумных Стад$/)).toBe(1);

  // повторное открытие панели — лор не повторяется (introSeen)
  await page.click('[data-action="sh-back"]');
  await openBossPanel(page);
  await page.waitForTimeout(300);
  assert.equal(await toastCount(page, /^⚔ Гнилоух, Пастух Чумных Стад$/), 1, 'интро-лор показывается только один раз');

  // вызов принят: попытка дня сгорает, фаза 1/3 в работе
  await page.click('.sh-buy[data-action="boss-challenge"][data-num="1"]');
  await expect(card).toContainText('Вызов принят — фаза 1/3 в работе');
  await expect(page.locator('.sh-buy[data-action="boss-challenge"]')).toHaveCount(0);

  // 3 карты в колоде: 3-я закрывает фазу cards, её же gold-тик — фазу streak.
  // Селектор скоуплен в #cardGrid: «Приоритет дня» на дашборде дублирует кнопку
  // выбранной карты (та же completeCard — лишний клик сдвоил бы выполнение).
  await page.click('.bnav-btn[data-view="deck"]');
  const done = page.locator('#cardGrid button.card-complete-btn[data-action="complete-card"]');
  await expect(done).toHaveCount(3);
  for (let i = 0; i < 3; i++) await done.first().click();
  await expect.poll(() => toastCount(page, /^⚔ Фаза 1\/3 пройдена$/)).toBe(1);
  await expect.poll(() => toastCount(page, /^⚔ Фаза 2\/3 пройдена$/)).toBe(1);

  // G2-контракт: за день закрыто ровно 2 фазы, третья (gold) ждёт завтра
  const bs = await page.evaluate(() => ({ phase: HERO.bosses.phase, closedCount: HERO.bosses.closedCount, attempt: HERO.bosses.attemptDay }));
  assert.equal(bs.phase, 2);
  assert.equal(bs.closedCount, 2);
  assert.equal(bs.attempt, DAY(0), 'попытка босса потрачена сегодня');

  // панель отражает прогресс: ✅✅🎯 и подпись gold-фазы (2×100💰, эскалация ×1).
  // Панель уже открыта: тик 3-й карты перерисовал её сам (currentShIdx=0, пров. I) —
  // повторный клик по узлу не нужен (узел скрыт за панелью), достаточно вернуться во вкладку.
  await openStrongholds(page);
  await expect(card).toBeVisible();
  await expect(card.locator('.boss-phase.done')).toHaveCount(2);
  await expect(card.locator('.boss-phase.active')).toContainText('Фаза 3/3: Заработать 200 💰 за день');
  await expect(card).toContainText('Вызов принят — фаза 3/3 в работе');
});

// ============== День 2: gold-фаза → повержен → reward-choice → pending после reload ==============
test('P12: gold-фаза честным доходом → босс повержен; reward-choice и pending после reload', async ({ page }) => {
  await bootWithSave(page, makeSave({
    bosses: { activeNum: 1, phase: 2, attemptDay: DAY(-1), closedDay: DAY(-1), closedCount: 2, introSeen: [1] },
  }));
  await spyToasts(page);

  // арка продолжается со 2/3; лор уже видели — тоста нет (introSeen из сейва)
  await openBossPanel(page);
  const card = page.locator('.boss-card');
  await expect(card.locator('.boss-phase.done')).toHaveCount(2);
  await expect(card.locator('.boss-phase.active')).toContainText('Фаза 3/3: Заработать 200 💰 за день');
  await page.waitForTimeout(300);
  assert.equal(await toastCount(page, /^⚔ Гнилоух/), 0, 'интро-лор не повторяется на второй день');

  // попытка снова доступна (attemptDay вчера) — фазы продолжаются, а не с нуля
  await page.click('.sh-buy[data-action="boss-challenge"][data-num="1"]');
  await expect(card).toContainText('Вызов принят — фаза 3/3 в работе');

  // gold-фаза: цель 200💰 за день. Ф0.2 кампании 3.0: сундуков с золотом — не больше 5 в сутки (5×20 = 100💰),
  // остальное — честный доход твердынь (goldGain 'tax'), как у живого игрока.
  // claimTaskChest не перерисовывает список задач (только дашборд) — после клейма
  // DOM протухает, поэтому между клеймами перезаходим во вкладку (renderTasks).
  await page.click('.bnav-btn[data-view="quests"]');
  for (let i = 0; i < 5; i++) await page.locator('.task-btn.primary[data-action="complete-task"]').first().click();
  for (let i = 0; i < 5; i++) {
    await page.locator('.task-btn.gold[data-action="claim-task-gold"]').first().click();
    if (i < 4) { await page.click('.bnav-btn[data-view="deck"]'); await page.click('.bnav-btn[data-view="quests"]'); }
  }
  await page.evaluate(() => goldGain(100, 'tax'));

  // доход 200💰 дня закрывает фазу 3/3 → босс повержен → модалка reward-choice
  const modal = page.locator('#bossRewardModal');
  await expect(modal).toHaveClass(/show/);
  await expect(modal).toContainText('Гнилоух, Пастух Чумных Стад повержен — выбери награду');
  await expect(modal.locator('.boss-reward-opt[data-reward="artifact"]')).toBeEnabled();
  await expect(modal.locator('.boss-reward-opt[data-reward="artifact"]')).toContainText('Пастуший Посох');
  await expect(modal.locator('.boss-reward-opt[data-reward="crown"]')).toBeEnabled();
  await expect(modal.locator('.boss-reward-opt[data-reward="crown"]')).toContainText('Венец сезона (0/5)');
  // руин нет — опция locked без data-reward и с причиной
  const ruin = modal.locator('.boss-reward-opt.locked');
  await expect(ruin).toBeDisabled();
  await expect(ruin).toContainText('Руин нет — постройки целы');
  assert.equal(await page.evaluate(() => HERO.bosses.defeated.indexOf(1) !== -1), true, 'босс в списке поверженных');

  // закрыть без выбора — награда остаётся незакрытым выбором (pending)
  await page.click('#bossRewardModal .modal-close');
  await expect(modal).not.toHaveClass(/show/);
  assert.equal(await page.evaluate(() => HERO.bosses.pendingReward), 1);

  // reload → вход в Твердыни снова предлагает выбор
  await page.waitForTimeout(1000); // saveSoon debounce
  await page.reload();
  await openStrongholds(page);
  await expect(modal).toHaveClass(/show/);

  // выбор венца потребляет pending и применяет награду
  await page.click('.boss-reward-opt[data-reward="crown"]');
  await expect(modal).not.toHaveClass(/show/);
  await expect(page.locator('#toast .t-title')).toContainText('👑 Венец сезона');
  assert.equal(await page.evaluate(() => HERO.bosses.pendingReward), null);
  assert.equal(await page.evaluate(() => season.crownBonus), 1);

  // выбор один и навсегда: reload больше не предлагает
  await page.waitForTimeout(1000);
  await page.reload();
  await openStrongholds(page);
  await expect(modal).not.toHaveClass(/show/);
});
