const { test, expect } = require('@playwright/test');

// P1: расширенные браузерные гейты кампании (Campaign 2.0 C2/C4/C5/C6) — реальные
// потоки UI на настоящем app.js: развилки фронтира, reward-choice боссов, ротация
// эндгейм-модификаторов, осадный склад и превью подхода недели.
// Все сиды — v13-сейвы с lastDayReset=сегодня (дневной/недельный тики не срабатывают,
// состояние детерминировано). Каталог и модель подключаются в Node для расчёта
// эталонов (тот же код, что в браузере — window.StrongholdData/StrongholdModel).

globalThis.StrongholdData = require('../../js/stronghold-data.js');
const SM = require('../../js/stronghold-model.js');

// ---- зеркала MSK-дат app.js (getMSKDayKey / getThisMondayKey) ----
const DAY = (offset = 0) => new Date(Date.now() + 3 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const MONDAY = (() => {
  const d = new Date(Date.now() + 3 * 3600000);
  const diff = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
})();

// ---- подбор детерминированной пары недель для C6-гейта ----
// w1: нейтральный модификатор (incomeMult=1), w2: с множителем налогов ≠1;
// обе недели без засухи на юге (пров. 3/4) — погода не искажает сравнение доходов.
function weatherId(prov, s, w) {
  const r = Math.abs(Math.sin(s * 31 + w * 17 + prov) * 43758.5453) % 1;
  if (r < 0.11) return 'blizzard';
  if (r < 0.24) return 'drought';
  if (r < 0.45) return 'fog';
  return 'clear';
}
function pickC6Weeks() {
  let best = null;
  for (let s = 1; s <= 60; s++) {
    const neutral = [], active = [];
    for (let w = 1; w <= 60; w++) {
      if (weatherId(3, s, w) === 'drought' || weatherId(4, s, w) === 'drought') continue;
      const k = SM.weeklyIncomeMult(s, w, true);
      if (k === 1) neutral.push(w);
      else active.push({ w, k, m: SM.weeklyModifierOf(s, w) });
    }
    if (!neutral.length || !active.length) continue;
    active.sort((a, b) => Math.abs(b.k - 1) - Math.abs(a.k - 1));
    if (!best || Math.abs(active[0].k - 1) > Math.abs(best.k - 1)) {
      best = { s, w1: neutral[0], w2: active[0].w, k: active[0].k, m2: active[0].m };
    }
  }
  if (!best || !best.m2) throw new Error('campaign-flows: не найдена пара недель для C6-гейта');
  return best;
}
const C6 = pickC6Weeks();

// ---- сид v13 ----
function shState(captured, buildingsByIdx) {
  return Array.from({ length: 20 }, (_, i) => ({
    id: 'sh' + String(i + 1).padStart(2, '0'),
    captured: i < captured,
    garrison: [],
    buildings: (buildingsByIdx && buildingsByIdx[i]) || {},
    corruption: { stage: 'ok', debtDays: 0 },
  }));
}
function makeSave(opts = {}) {
  const o = Object.assign({
    captured: 0, gold: 5000, seasonNum: 1, siegeWeek: 1, crownBonus: 0,
    bosses: null, siege: null, buildingsByIdx: null,
  }, opts);
  return {
    v: 13, gen: 1, savedAt: Date.now(), t: Date.now(),
    hero: {
      name: 'Гейт-воин', level: 5, xp: 10, xpToNext: 200, totalXp: 500, gold: o.gold,
      lastSessionAt: Date.now(), consecutivePerfectDays: 0, dailyCompletions: 0, dailySkips: 0,
      bosses: Object.assign(
        { defeated: [], activeNum: null, phase: 0, attemptDay: null, closedDay: null, closedCount: 0, introSeen: [], rewardChoice: {}, pendingReward: null },
        o.bosses || {}
      ),
    },
    stats: {},
    forged: [{
      id: 1, name: 'Карта-гейт', rank: 'C', stat: 'str', streak: 0, mastery: 0, masteryThreshold: 5,
      totalCompletions: 1, progress: 0, prestige: 0, evolutionPath: null, daysActive: 1, meta: '',
      firstCompletedAt: 1750000000000, lastCompletedAt: null, lastFailDay: null,
    }],
    goals: [], tasks: [], taskIdCounter: 1, forgedIdCounter: 2, uidCounter: 1, goalIdCounter: 1,
    xpHistory: [], bloodOath: null, hirePool: null,
    lastDayReset: DAY(0), lastWeekReset: MONDAY,
    strongholds: shState(o.captured, o.buildingsByIdx),
    army: { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 100 }, week: 3 }, // 140к силы — штурм гарантированно выигрывается
    siege: Object.assign(
      { week: o.siegeWeek, lastResult: null, assaultDay: DAY(-1), wkSkips: 0, wkTaskFails: 0, retriedThisWeek: false, rams: 0, ladders: 0 },
      o.siege || {}
    ),
    season: {
      num: o.seasonNum, start: DAY(0), crownBonus: o.crownBonus,
      snapshot: { totalXp: 500, gold: o.gold, captured: o.captured, completions: 1, level: 5 },
    },
    throne: 0,
  };
}

// Сид едет через sessionStorage с самоочисткой в init-скрипте: переживёт reload,
// не даст beforeunload перезатереть собой localStorage и не мешает последующим
// «чистым» reload-ам (проверки персистентности состояния приложением).
async function bootWithSave(page, save) {
  await page.route('**/telegram-web-app.js', route => route.abort());
  await page.addInitScript(() => {
    const j = sessionStorage.getItem('__nd_e2e_save');
    if (j) {
      sessionStorage.removeItem('__nd_e2e_save');
      localStorage.setItem('neurodeck_full_save', j);
      localStorage.setItem('neurodeck_onboarding_done', '1');
    }
  });
  await page.goto('/e2e-prologue'); // 404 на том же origin: приложение не грузится
  await loadSave(page, save);
}
// подмена сейва в уже открытой странице (подход недели не персистится — нужен свежий бут)
async function loadSave(page, save) {
  await page.evaluate((s) => sessionStorage.setItem('__nd_e2e_save', JSON.stringify(s)), save);
  await page.goto('/');
  await openStrongholds(page);
}
async function openStrongholds(page) {
  await page.waitForSelector('.bnav-btn[data-view="strongholds"]', { state: 'visible' });
  await page.click('.bnav-btn[data-view="strongholds"]');
  await page.waitForSelector('#view-strongholds.active');
}

// ===================== C2: развилки фронтира =====================
test('C2: развилка фронта — модалка выбора цели: открыть/отменить/подтвердить', async ({ page }) => {
  await bootWithSave(page, makeSave({ captured: 7 })); // sh01–sh07 → фронтир sh08+sh09

  // обе фронтирные карточки с подписями веток
  await expect(page.locator('.km-front-card', { hasText: 'Дозорный Замок' })).toContainText('военный путь');
  await expect(page.locator('.km-front-card', { hasText: 'Башня Тягости' })).toContainText('безопасный путь');

  // открыть модалку выбора цели
  await page.click('.sh-assault[data-idx="7"]');
  await expect(page.locator('#confirmOverlay')).toHaveClass(/show/);
  await expect(page.locator('#confirmTitle')).toHaveText('Цель штурма');
  await expect(page.locator('.confirm-target')).toHaveCount(2);
  await expect(page.locator('.confirm-target[data-target-idx="7"]')).toContainText('Дозорный Замок');
  await expect(page.locator('.confirm-target[data-target-idx="8"]')).toContainText('Башня Тягости');

  // отмена: оверлей закрылся, день штурма не потрачен (модалка открывается снова)
  await page.click('#confirmNo');
  await expect(page.locator('#confirmOverlay')).not.toHaveClass(/show/);
  await page.click('.sh-assault[data-idx="7"]');
  await expect(page.locator('#confirmOverlay')).toHaveClass(/show/);

  // подтвердить цель «Башня Тягости» → тактика (7 захвачено ≥ 3) → Штурм → захват
  await page.click('.confirm-target[data-target-idx="8"]');
  await expect(page.locator('#confirmTitle')).toHaveText('Тактика штурма');
  await page.click('#confirmYes');
  await expect(page.locator('.km-front-card', { hasText: 'Башня Тягости' })).toHaveCount(0);
  // фронт ушёл дальше по safe-ветке: sh10 стал фронтирным рядом с недобитым sh08
  await expect(page.locator('.km-front-card', { hasText: 'Врата Свободы' })).toHaveCount(1);
});

// ===================== C5: reward-choice босса =====================
test('C5: reward-choice — венец disabled при капе 5/5, артефакт выбирается и не возвращается', async ({ page }) => {
  await bootWithSave(page, makeSave({
    captured: 5, crownBonus: 5, // пров. 1 собрана, босс I доступен, венцы полны
    bosses: { pendingReward: 1 },
    buildingsByIdx: { 0: { zh1: { built: true, builtAt: 1750000000000, corruptionStage: 'ruin', debtDays: 0 } } },
  }));

  await expect(page.locator('#bossRewardModal')).toHaveClass(/show/);
  // венец при капе — disabled с причиной (locked-опция не несёт data-reward — ищем по тексту)
  const crown = page.locator('.boss-reward-opt', { hasText: 'Венец сезона' });
  await expect(crown).toBeDisabled();
  await expect(crown).toContainText('5/5');
  await expect(crown).toContainText('Достигнут кап 5/5 венцев');
  // руина доступна (одна руина в сидe), артефакт доступен
  await expect(page.locator('.boss-reward-opt[data-reward="ruin"]')).toBeEnabled();
  await expect(page.locator('.boss-reward-opt[data-reward="artifact"]')).toContainText('Пастуший Посох');

  // выбор артефакта закрывает модалку
  await page.click('.boss-reward-opt[data-reward="artifact"]');
  await expect(page.locator('#bossRewardModal')).not.toHaveClass(/show/);
  await expect(page.locator('#toast .t-title')).toContainText('Артефакт твой');

  // выбор потреблён: после reload модалка не возвращается
  await page.waitForTimeout(1000); // saveSoon debounce 300мс
  await page.reload();
  await openStrongholds(page);
  await expect(page.locator('#bossRewardModal')).not.toHaveClass(/show/);
});

test('C5: незакрытый выбор награды (pending) возвращается после reload', async ({ page }) => {
  await bootWithSave(page, makeSave({ captured: 5, bosses: { pendingReward: 1 } }));
  await expect(page.locator('#bossRewardModal')).toHaveClass(/show/);

  // закрыть без выбора — pending сохраняется
  await page.click('#bossRewardModal .modal-close');
  await expect(page.locator('#bossRewardModal')).not.toHaveClass(/show/);
  await page.waitForTimeout(1000); // модалка открывается вне save-потока, но выбор ниже пишет сейв

  // reload → вкладка Твердыни снова предлагает выбор
  await page.reload();
  await openStrongholds(page);
  await expect(page.locator('#bossRewardModal')).toHaveClass(/show/);

  // выбор венца (кап не достигнут) потребляет pending
  await page.click('.boss-reward-opt[data-reward="crown"]');
  await expect(page.locator('#bossRewardModal')).not.toHaveClass(/show/);
  await expect(page.locator('#toast .t-title')).toContainText('Венец сезона');
  await page.waitForTimeout(1000);
  await page.reload();
  await openStrongholds(page);
  await expect(page.locator('#bossRewardModal')).not.toHaveClass(/show/);
});

// ===================== C6: модификатор недели (эндгейм) =====================
test('C6: weekly modifier — 19/20 скрыт, 20/20 виден и масштабирует налоги', async ({ page }) => {
  // 19/20: строки модификатора нет
  await bootWithSave(page, makeSave({ captured: 19, seasonNum: C6.s, siegeWeek: C6.w2 }));
  await expect(page.locator('#view-strongholds')).not.toContainText('эндгейм-модификатор недели');

  // 20/20 на нейтральной неделе w1 — базовый доход N1
  await loadSave(page, makeSave({ captured: 20, seasonNum: C6.s, siegeWeek: C6.w1 }));
  await expect(page.locator('#view-strongholds')).toContainText('эндгейм-модификатор недели');
  const income1 = await page.locator('.sh-treasury').innerText();
  const n1 = parseInt((income1.match(/Налоги:\s*\+(\d+)/) || [0, 0])[1], 10);
  expect(n1).toBeGreaterThan(1000);

  // та же карта на неделе w2 — модификатор виден по имени и меняет доход ×k
  await loadSave(page, makeSave({ captured: 20, seasonNum: C6.s, siegeWeek: C6.w2 }));
  await expect(page.locator('#view-strongholds')).toContainText(C6.m2.name);
  const income2 = await page.locator('.sh-treasury').innerText();
  const n2 = parseInt((income2.match(/Налоги:\s*\+(\d+)/) || [0, 0])[1], 10);
  // единственная разница сидов — siege.week: отличие дохода обязан давать модификатор ×k
  expect(Math.abs(n2 - n1 * C6.k)).toBeLessThanOrEqual(1);
});

// ===================== C4: осадный склад =====================
test('C4: покупка тарана/лестниц за 25💰 и списание склада после штурма', async ({ page }) => {
  await bootWithSave(page, makeSave({ captured: 1, gold: 500 }));
  const store = page.locator('.sh-trade', { hasText: 'Осадный склад' });

  await expect(store).toContainText('таран ×0');
  await expect(store).toContainText('лестницы ×0');
  await expect(page.locator('#heroGoldVal')).toHaveText('500');

  await page.click('[data-action="sh-siege-store"][data-store="ram"]');
  await expect(page.locator('#heroGoldVal')).toHaveText('475');
  await expect(store).toContainText('таран ×1');
  await page.click('[data-action="sh-siege-store"][data-store="ladder"]');
  await expect(page.locator('#heroGoldVal')).toHaveText('450');
  await expect(store).toContainText('лестницы ×1');

  // превью штурма честно предупреждает о расходе склада
  await page.click('.sh-assault[data-idx="1"]');
  await expect(page.locator('#confirmOverlay')).toHaveClass(/show/);
  await expect(page.locator('#confirmTitle')).toHaveText('⚔ Штурм «Лаголь Земли»?');
  await expect(page.locator('#confirmBody')).toContainText('склад будет потрачен');
  await page.click('#confirmYes');

  // склад списан после штурма, фронт ушёл на sh03
  await expect(store).toContainText('таран ×0');
  await expect(store).toContainText('лестницы ×0');
  await expect(page.locator('.km-front-card', { hasText: 'Лесопилка' })).toHaveCount(1);
});

// ===================== C4: подход недели — превью =====================
test('C4: подход недели — «Осада» +1 гнев, «Хитрость» меняет превью гарнизона (пров. 3)', async ({ page }) => {
  // до подхода (дефолт «Штурм»): превью sh11 показывает каталогный гарнизон 1100
  await bootWithSave(page, makeSave({ captured: 10 })); // sh01–sh10 → фронт sh11 (пров. 3, total 1100)
  await expect(page.locator('.sh-context-anchor')).toContainText('Гнев: 0/10');
  await expect(page.locator('.km-stance[data-approach="assault"]')).toHaveClass(/active/);
  await page.click('.sh-assault[data-idx="10"]');
  await expect(page.locator('#confirmTitle')).toHaveText('Тактика штурма');
  await expect(page.locator('#confirmBody')).toContainText('против 🛡 1100');

  // после подхода: свежий бут (подход — runtime-выбор), фронт тот же sh11
  await loadSave(page, makeSave({ captured: 10 }));
  // «Осада»: гнев +1, кнопка активна
  await page.click('.km-stance[data-approach="siege"]');
  await expect(page.locator('.sh-context-anchor')).toContainText('Гнев: 1/10');
  await expect(page.locator('.km-stance[data-approach="siege"]')).toHaveClass(/active/);
  // «Хитрость»: гарнизон врага пров. 3 −10% → превью 1100 → 990
  await page.click('.km-stance[data-approach="trick"]');
  await expect(page.locator('.km-stance[data-approach="trick"]')).toHaveClass(/active/);
  await page.click('.sh-assault[data-idx="10"]');
  await expect(page.locator('#confirmBody')).toContainText('против 🛡 990');
  await expect(page.locator('#confirmBody')).not.toContainText('против 🛡 1100');
});
