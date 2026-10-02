const { test, expect } = require('@playwright/test');
const SD = require('../../js/stronghold-data.js');

// Аудит 2026-10-02, 2.4 «мёртвые эффекты технологий» в браузере:
//  s2 «Реликварий» — артефакты боссов ×1.25 (цена построек с артефактом «−15%» становится «−18.75%»);
//  s3 «Обряды Усмирения» — гнев −1 (в самой осаде, а не в счётчиках, обнулённых строкой выше);
//  w6 «Железный Закон» — кап гнева 7: экран «Гнев: N/7» и отчёт осады показывают то, чем бьёт осада;
//  s4 «Пророчества Вех» — туман войны не прячет силу осады в тревоге.
// Сид — v13-сейв (паттерн weekly-modifier): lastDayReset = сегодня, автотик на буте не срабатывает.

const DAY = (offset = 0) => new Date(Date.now() + 3 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const MONDAY = (() => {
  const d = new Date(Date.now() + 3 * 3600000);
  const diff = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
})();

const CAPTURED = 14;
function shState(captured) {
  return Array.from({ length: 20 }, (_, i) => ({
    id: 'sh' + String(i + 1).padStart(2, '0'),
    captured: i < captured,
    garrison: [],
    buildings: {},
    corruption: { stage: 'ok', debtDays: 0 },
  }));
}
const ownedMap = (ids) => { const o = {}; ids.forEach((id) => { o[id] = true; }); return o; };
const COST_ART = SD.BOSS_ARTIFACTS.find((a) => a.kind === 'cost');

function makeSave({ owned = [], wkSkips = 0, costArtifact = false } = {}) {
  return {
    v: 13, gen: 1, savedAt: Date.now(), t: Date.now(),
    hero: {
      name: 'Жрец', level: 5, xp: 10, xpToNext: 200, totalXp: 500, gold: 5000,
      lastSessionAt: Date.now(), consecutivePerfectDays: 0, dailyCompletions: 0, dailySkips: 0,
      bosses: {
        defeated: costArtifact ? [COST_ART.num] : [], activeNum: null, phase: 0, attemptDay: null, closedDay: null, closedCount: 0,
        introSeen: [], rewardChoice: costArtifact ? { [COST_ART.num]: 'artifact' } : {}, pendingReward: null,
      },
    },
    stats: {},
    forged: [{
      id: 1, name: 'Карта-жрец', rank: 'C', stat: 'str', streak: 0, mastery: 0, masteryThreshold: 5,
      totalCompletions: 1, progress: 0, prestige: 0, evolutionPath: null, daysActive: 1, meta: '',
      firstCompletedAt: 1750000000000, lastCompletedAt: null, lastFailDay: null,
    }],
    goals: [], tasks: [], taskIdCounter: 1, forgedIdCounter: 2, uidCounter: 1, goalIdCounter: 1,
    xpHistory: [], bloodOath: null, hirePool: null,
    lastDayReset: DAY(0), lastWeekReset: MONDAY,
    strongholds: shState(CAPTURED),
    army: { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 50 }, week: 3 },
    siege: { week: 1, lastResult: null, assaultDay: DAY(-1), wkSkips, wkTaskFails: 0, retriedThisWeek: false, rams: 0, ladders: 0 },
    season: { num: 1, start: DAY(0), crownBonus: 0, snapshot: { totalXp: 500, gold: 5000, captured: CAPTURED, completions: 1, level: 5 }, resource: { 1: 99 } },
    throne: 0,
    TECHS: { owned: ownedMap(owned), lvl: {} },
    TECH_PTS: 0,
  };
}

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
  await page.waitForSelector('.bnav-btn[data-view="strongholds"]', { state: 'visible' });
  await page.click('.bnav-btn[data-view="strongholds"]');
  await page.waitForSelector('#view-strongholds.active');
}

// ===================== s2: Реликварий усиливает артефакт =====================
test('аудит 2.4: Реликварий (s2) усиливает артефакт боссов ×1.25 — цена построек падает не на 15%, а на 18.75%', async ({ page }) => {
  await bootWithSave(page, makeSave({ costArtifact: true }));
  const r = await page.evaluate(() => {
    const bid = Object.keys(BUILDINGS)[0];
    const read = () => ({ mult: bossArtifactMult('cost'), cost: buildCostOf(bid), eng: doctrineEngineMult(), tb: techBuildingCostMult() });
    const off = read();
    TECHS.owned.s2 = true;
    const on = read();
    delete TECHS.owned.s2;
    return { base: BUILDINGS[bid].cost, off, on };
  });
  expect(r.off.mult, 'предусловие: артефакт «−15% цена построек» действует (сохранён в сейве)').toBeCloseTo(0.85, 9);
  expect(r.on.mult, 's2: сила артефакта ×1.25 → −18.75%').toBeCloseTo(0.8125, 9);
  expect(r.on.cost, 'цена с s2 ниже').toBeLessThan(r.off.cost);
  expect(r.on.cost, 'цена = ceil(база × доктрина × артефакт × техи)').toBe(Math.ceil(r.base * r.on.eng * r.on.mult * r.on.tb));
});

// ===================== w6 + s3: единый расчёт гнева =====================
test('аудит 2.4: Железный Закон (w6) — экран «Гнев: 7/7» и отчёт осады показывают одно число (раньше осада била гневом 10)', async ({ page }) => {
  await bootWithSave(page, makeSave({ owned: ['w6'], wkSkips: 12 }));
  await expect(page.locator('.sh-wrath'), 'экран: гнев 7 из 7').toContainText('Гнев: 7/7');
  await page.evaluate(() => runWeeklySiege());
  await expect(page.locator('#siegeReportBody .sh-siege-wrath'), 'отчёт осады: то же 7/7').toContainText('Гнев: 7/7');
});

test('аудит 2.4: Обряды Усмирения (s3) вычитают 1 гнев — и на экране, и в самой осаде', async ({ page }) => {
  await bootWithSave(page, makeSave({ owned: ['w6', 's3'], wkSkips: 12 }));
  await expect(page.locator('.sh-wrath'), 'экран: кап 7 − 1 = 6').toContainText('Гнев: 6/7');
  await page.evaluate(() => runWeeklySiege());
  await expect(page.locator('#siegeReportBody .sh-siege-wrath'), 'отчёт осады: 6/7').toContainText('Гнев: 6/7');
});

test('аудит 2.4: без технологий гнев по-прежнему «N/10», кап 10 — осада и экран совпадают', async ({ page }) => {
  await bootWithSave(page, makeSave({ wkSkips: 12 }));
  await expect(page.locator('.sh-wrath')).toContainText('Гнев: 10/10');
  await page.evaluate(() => runWeeklySiege());
  await expect(page.locator('#siegeReportBody .sh-siege-wrath')).toContainText('Гнев: 10/10');
});

// ===================== s4: Пророчества Вех =====================
test('аудит 2.4: Пророчества Вех (s4) — туман войны не прячет силу осады в тревоге', async ({ page }) => {
  await bootWithSave(page, makeSave({}));
  const r = await page.evaluate(() => {
    const realFog = window.weatherFog;
    window.weatherFog = () => true; // детерминированный туман над фронтом
    try {
      const hidden = siegeAlarmPreview();
      TECHS.owned.s4 = true;
      const seen = siegeAlarmPreview();
      delete TECHS.owned.s4;
      return { hidden, seen };
    } finally { window.weatherFog = realFog; }
  });
  expect(r.hidden.power, 'без s4 туман скрывает силу').toBe('🌫 ?');
  expect(typeof r.seen.power, 's4: сила осады видна числом').toBe('number');
  expect(r.seen.power).toBeGreaterThan(0);
  expect(Number.isFinite(r.seen.ratio), 's4: ratio обороны к силе посчитан').toBe(true);
});
