const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');

// P13: ендгейм-модификатор недели в браузере — соответствие UI тику. Три гейта:
// 1) 19/20 — строка скрыта и модификатор НЕ применяется: weeklyModsNow() нейтрален
//    (гейт 20/20 в модели), казна на «Жадности» байт-в-байт равна нейтральной неделе;
// 2) 20/20 — строка видна, налоги/содержание масштабируются ×k ровно как в каталоге;
// 3) 20/20 — цифры казны в DOM = дневной тик (strongholdsDailyTick на живой странице),
//    превью осады в панели подготовки = формула воскресного удара с модификатором недели.
// Сиды — v13-сейвы с lastDayReset=сегодня (тики не срабатывают на буте, состояние
// детерминировано; паттерн campaign-flows). zh1 («Ополченческий Двор», содержание 3)
// построен в каждой твердыне — содержание наблюдаемо и зависит от модификатора.

globalThis.StrongholdData = require('../../js/stronghold-data.js');
const SM = require('../../js/stronghold-model.js');
const DATA = require('../../js/stronghold-data.js');

// ---- зеркала MSK-дат app.js (getMSKDayKey / getThisMondayKey) ----
const DAY = (offset = 0) => new Date(Date.now() + 3 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const MONDAY = (() => {
  const d = new Date(Date.now() + 3 * 3600000);
  const diff = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
})();

// ---- зеркало weatherOf (app.js): гварды выбора недель ----
// Экономику двигают только засуха юга (налог ×0.75, пров. 3/4) и метель севера
// (содержание ×2, пров. 1/2); туман важен лишь для видимости сил в превью осады.
function weatherId(prov, s, w) {
  const r = Math.abs(Math.sin(s * 31 + w * 17 + prov) * 43758.5453) % 1;
  if (r < 0.11) return 'blizzard';
  if (r < 0.24) return 'drought';
  if (r < 0.45) return 'fog';
  return 'clear';
}
function econClean(s, w) {
  return weatherId(3, s, w) !== 'drought' && weatherId(4, s, w) !== 'drought' &&
    weatherId(1, s, w) !== 'blizzard' && weatherId(2, s, w) !== 'blizzard';
}

// ---- подбор детерминированной тройки недель одного сезона ----
// wN: нейтральная экономика (incomeMult=1 && upkeepMult=1 — в каталоге это «Туман»),
// wA: активная (оба множителя ≠1 — «Жадность»/«Воздержание»), wS: осадная (siegeMult≠1,
// без погодного тумана на пров. 4 — там сидит sh20, цель превью при 20/20; туман прячет
// силу за «🌫 ?»). Эконом-пара обязана быть погодно-чистой, иначе разница недель — погода.
function pickP13Weeks() {
  for (let s = 1; s <= 80; s++) {
    const neutral = [], active = [], siege = [];
    for (let w = 1; w <= 40; w++) {
      const m = SM.weeklyModifierOf(s, w);
      if (!m) continue;
      if (econClean(s, w)) {
        if (m.mods.incomeMult === 1 && m.mods.upkeepMult === 1) neutral.push(w);
        if (m.mods.incomeMult !== 1 && m.mods.upkeepMult !== 1) active.push(w);
      }
      if (m.mods.siegeMult !== 1 && weatherId(DATA.STRONGHOLDS[19].prov, s, w) !== 'fog') siege.push(w);
    }
    if (neutral.length && active.length && siege.length) {
      return { s, wN: neutral[0], wA: active[0], wS: siege[0],
        mN: SM.weeklyModifierOf(s, neutral[0]), mA: SM.weeklyModifierOf(s, active[0]), mS: SM.weeklyModifierOf(s, siege[0]) };
    }
  }
  throw new Error('weekly-modifier: не найдена тройка недель для P13-гейта');
}
const P13 = pickP13Weeks();
// сезон 1: wN=5 «Туман», wA=1 «Жадность» (×1.3/×1.3), wS=2 «Гроза» (осады ×1.25) — пин ротации в weekly-mods.test

// ---- сид v13 (паттерн campaign-flows) + zh1 в каждой твердыне ----
function shState(captured, buildingsByIdx) {
  return Array.from({ length: 20 }, (_, i) => ({
    id: 'sh' + String(i + 1).padStart(2, '0'),
    captured: i < captured,
    garrison: [],
    buildings: (buildingsByIdx && buildingsByIdx[i]) || {},
    corruption: { stage: 'ok', debtDays: 0 },
  }));
}
const ZH1 = { built: true, builtAt: 1750000000000, corruptionStage: 'ok', debtDays: 0 }; // «Ополченческий Двор»: содержание 3/д
const ZH1_EVERYWHERE = Array.from({ length: 20 }, () => ({ zh1: Object.assign({}, ZH1) }));
function makeSave(opts = {}) {
  const o = Object.assign({
    captured: 20, gold: 5000, seasonNum: P13.s, siegeWeek: P13.wA, crownBonus: 0,
    bosses: null, siege: null,
  }, opts);
  return {
    v: 13, gen: 1, savedAt: Date.now(), t: Date.now(),
    hero: {
      name: 'Гейт-эндгейм', level: 5, xp: 10, xpToNext: 200, totalXp: 500, gold: o.gold,
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
    strongholds: shState(o.captured, ZH1_EVERYWHERE),
    army: { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 100 }, week: 3 },
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

// Сид едет через sessionStorage с самоочисткой в init-скрипте (паттерн campaign-flows):
// переживёт reload, не даст beforeunload перезатереть собой localStorage; GEN_KEY —
// LWW-консистентность сейва.
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
  await loadSave(page, save);
}
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

// казна панели Твердынь: Налоги +N / Содержание −M (минус U+2212, как в рендере)
async function readTreasury(page) {
  const txt = await page.locator('.sh-treasury').innerText();
  const taxes = parseInt((txt.match(/Налоги:\s*\+(\d+)/) || [0, 0])[1], 10);
  const upkeep = parseInt((txt.match(/Содержание:\s*\u2212(\d+)/) || [0, 0])[1], 10);
  return { taxes, upkeep };
}
async function readModsNow(page) {
  return page.evaluate(() => (typeof weeklyModsNow === 'function') ? weeklyModsNow() : null);
}

// ===================== 19/20: скрыт и не применяется =====================
test('P13: 19/20 — строки нет, множители нейтральны, казна равна нейтральной неделе', async ({ page }) => {
  assert.notEqual(P13.mA.mods.incomeMult, 1, 'пикер дал активную по доходу неделю');
  assert.notEqual(P13.mA.mods.upkeepMult, 1, 'пикер дал активную по содержанию неделю');

  // «Жадность» при 19/20: гейт эндгейма закрыт — множители обязаны быть нейтральными
  await bootWithSave(page, makeSave({ captured: 19, siegeWeek: P13.wA }));
  await expect(page.locator('#view-strongholds')).not.toContainText('эндгейм-модификатор недели');
  const mods19 = await readModsNow(page);
  assert.deepEqual(mods19, { income: 1, upkeep: 1, siege: 1 }, 'weeklyModsNow нейтрален вне 20/20 даже на активной неделе');

  // та же карта на нейтральной неделе — единственная разница сидов это siege.week
  const active19 = await readTreasury(page);
  await loadSave(page, makeSave({ captured: 19, siegeWeek: P13.wN }));
  await expect(page.locator('#view-strongholds')).not.toContainText('эндгейм-модификатор недели');
  const neutral19 = await readTreasury(page);
  assert.strictEqual(active19.taxes, neutral19.taxes, 'налоги 19/20 не зависят от модификатора (не применяется)');
  assert.strictEqual(active19.upkeep, neutral19.upkeep, 'содержание 19/20 не зависит от модификатора (не применяется)');
  assert.ok(neutral19.upkeep > 0, 'zh1 в каждой твердыне — содержание наблюдаемо');
});

// ===================== 20/20: виден и масштабирует казну =====================
test('P13: 20/20 — строка видна по имени, налоги/содержание ×k каталога', async ({ page }) => {
  // нейтральная экономика-неделя: строка всё равно есть (эндгейм), но казна базовая
  await bootWithSave(page, makeSave({ captured: 20, siegeWeek: P13.wN }));
  await expect(page.locator('#view-strongholds')).toContainText(P13.mN.name);
  await expect(page.locator('#view-strongholds')).toContainText('эндгейм-модификатор недели');
  assert.deepEqual(await readModsNow(page), {
    income: SM.weeklyIncomeMult(P13.s, P13.wN, true),
    upkeep: SM.weeklyUpkeepMult(P13.s, P13.wN, true),
    siege: SM.weeklySiegeMult(P13.s, P13.wN, true),
  }, 'при 20/20 множители = каталогу модели');
  const neutral = await readTreasury(page);

  // активная неделя: строка по имени модификатора, казна масштабируется ровно ×k
  await loadSave(page, makeSave({ captured: 20, siegeWeek: P13.wA }));
  await expect(page.locator('#view-strongholds')).toContainText(P13.mA.name);
  assert.deepEqual(await readModsNow(page), {
    income: P13.mA.mods.incomeMult,
    upkeep: P13.mA.mods.upkeepMult,
    siege: P13.mA.mods.siegeMult,
  });
  const active = await readTreasury(page);
  assert.ok(active.taxes > 1000, 'эндгейм-казна наблюдаема: ' + active.taxes);
  // округление tax-цепочки до множителя — допуск 1 (паттерн P1/C6)
  assert.ok(Math.abs(active.taxes - neutral.taxes * P13.mA.mods.incomeMult) <= 1,
    'налоги ×' + P13.mA.mods.incomeMult + ': ' + neutral.taxes + ' → ' + active.taxes);
  // содержание округляется по-твердыньно (как в тике): допуск — не больше 0.5 на каждую из 20 твердынь
  assert.ok(Math.abs(active.upkeep - neutral.upkeep * P13.mA.mods.upkeepMult) <= 20 * 0.5,
    'содержание ×' + P13.mA.mods.upkeepMult + ': ' + neutral.upkeep + ' → ' + active.upkeep);
});

// ===================== 20/20: DOM-казна = дневной тик =====================
test('P13: 20/20 — налоги/содержание в DOM совпадают с strongholdsDailyTick на живой странице', async ({ page }) => {
  await bootWithSave(page, makeSave({ captured: 20, siegeWeek: P13.wA })); // «Жадность»: множители активны
  const dom = await readTreasury(page);

  // реальный дневной тик приложения (мутирует только runtime, сейв не пишет)
  const tick = await page.evaluate(() => (typeof strongholdsDailyTick === 'function') ? strongholdsDailyTick() : null);
  assert.ok(tick && typeof tick.income === 'number' && typeof tick.upkeep === 'number', 'тик вернул казну');
  assert.strictEqual(tick.paid, true, 'казна покрывает содержание — тик без долгов, стационарный');

  // аудит 2.2: превью «Налоги» и тик читают ОДНУ формулу (shIncomePerDay) — равенство байт-в-байт круглый год,
  // в т.ч. в «Новый год» (тик ×1.5): раньше в этот день тик расходился с превью и тест допускал масштаб
  assert.strictEqual(tick.income, dom.taxes, 'налоги тика = налогам в DOM');

  // содержание: и тик, и превью округляют по-твердыньно (corruptionTick) — равенство без допуска
  assert.strictEqual(tick.upkeep, dom.upkeep,
    'содержание тика (' + tick.upkeep + ') = содержанию в DOM (' + dom.upkeep + ')');
});

// ===================== 20/20: превью осады = формула тика с модификатором =====================
test('P13: 20/20 — превью «Осада недели» несёт силу врага ×siegeMult (parity с runWeeklySiege)', async ({ page }) => {
  await bootWithSave(page, makeSave({ captured: 20, siegeWeek: P13.wS }));
  await expect(page.locator('#view-strongholds')).toContainText(P13.mS.name); // строка недели осадного модификатора
  assert.notEqual(P13.mS.mods.siegeMult, 1, 'пикер дал осадно-активную неделю');

  // сила врага из DOM-панели подготовки
  const prep = await page.locator('.siege-prep').innerText();
  const domPower = parseInt((prep.match(/враг ~(\d+)/) || [0, 0])[1], 10);
  assert.ok(domPower > 0, 'превью показывает численную силу (туман не прячет): ' + prep.match(/Осада недели[^\n]*/)[0]);

  // DOM = функции превью на живой странице
  const pv = await page.evaluate(() => (typeof siegeAlarmPreview === 'function') ? siegeAlarmPreview() : null);
  assert.ok(pv, 'siegeAlarmPreview жив');
  assert.strictEqual(pv.power, domPower, 'сила в DOM = siegeAlarmPreview().power');

  // превью = формула воскресного удара с модификатором недели (гнев 0 и вознесение 0 — из сида;
  // prov SiegeMult Пепла = 1): та же siegePower×weekly×province цепочка, что в runWeeklySiege
  const sh20 = DATA.STRONGHOLDS[19]; // 20/20 → цель последней захваченной
  const withWeekly = Math.round(SM.siegePower(sh20.total, P13.wS, 20, 0) * SM.weeklySiegeMult(P13.s, P13.wS, true) * SM.provinceSiegeMult(sh20.prov));
  const withoutWeekly = Math.round(SM.siegePower(sh20.total, P13.wS, 20, 0) * SM.provinceSiegeMult(sh20.prov));
  assert.strictEqual(domPower, withWeekly, 'DOM = формула тика ×' + P13.mS.mods.siegeMult);
  assert.notStrictEqual(domPower, withoutWeekly, 'без модификатора недели сила была бы другой — он реально применён');
});
