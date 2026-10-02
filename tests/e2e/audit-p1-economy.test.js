const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');

// Аудит 2026-10-02, 2.1 + 2.2 в браузере: строки «Налоги»/«Содержание» панели Твердынь, превью-функции и реальный ночной тик
// говорят одно и то же, а штрафы содержания >1 (метель севера ×2, стойки «Штурм/Оборона» ×1.25, «Разведка» ×1.1) реально списываются.
//  1) содержание: DOM == shUpkeepPerDay() == strongholdsDailyTick().upkeep == независимый оракул теста (каталог × множители, округление
//     по-твердынно) и золото в казне изменилось ровно на «доход − содержание»; сценарии: ясно/метель × стойки (в т.ч. скидка «Экономия»);
//  2) доход: DOM == shIncomePerDay() == тик при включённых тотеме, Пути Богатства, «Великой жатве», доктрине-короне и технологиях,
//     а каждый из них по отдельности понижает строку «Налоги», если его выключить (до аудита превью их не знало).
// Сид — v13-сейв (паттерн weekly-modifier): lastDayReset = сегодня, автотик на буте не срабатывает, состояние детерминировано.

globalThis.StrongholdData = require('../../js/stronghold-data.js');
const SM = require('../../js/stronghold-model.js');
const DATA = require('../../js/stronghold-data.js');

const DAY = (offset = 0) => new Date(Date.now() + 3 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const MONDAY = (() => {
  const d = new Date(Date.now() + 3 * 3600000);
  const diff = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
})();

const CAPTURED = 14; // гейт доктрин t1/t2/t3 = 3/8/14 захватов; ниже эндгейма (модификатор недели молчит)
const B = (over) => Object.assign({ built: true, builtAt: 1750000000000, corruptionStage: 'ok', debtDays: 0 }, over);
// 3+8+10+15+35 = 71 монета содержания на твердыню; ec1 — рынок, ec2/ec3 — «эконом»-доход
const SET = () => ({ zh1: B(), zh2: B(), ec1: B(), ec2: B(), ec3: B() });
const BASE_UPKEEP = 71;

function shState(captured) {
  return Array.from({ length: 20 }, (_, i) => ({
    id: 'sh' + String(i + 1).padStart(2, '0'),
    captured: i < captured,
    garrison: [],
    buildings: i < captured ? SET() : {},
    corruption: { stage: 'ok', debtDays: 0 },
  }));
}
function makeSave({ loaded = false } = {}) {
  const save = {
    v: 13, gen: 1, savedAt: Date.now(), t: Date.now(),
    hero: {
      name: 'Экономист', level: 5, xp: 10, xpToNext: 200, totalXp: 500, gold: 50000,
      lastSessionAt: Date.now(), consecutivePerfectDays: 0, dailyCompletions: 0, dailySkips: 0,
      bosses: { defeated: [], activeNum: null, phase: 0, attemptDay: null, closedDay: null, closedCount: 0, introSeen: [], rewardChoice: {}, pendingReward: null },
    },
    stats: {},
    forged: [{
      id: 1, name: 'Карта-экономика', rank: 'C', stat: 'str', streak: 0, mastery: 0, masteryThreshold: 5,
      totalCompletions: 1, progress: 0, prestige: 0, evolutionPath: null, daysActive: 1, meta: '',
      firstCompletedAt: 1750000000000, lastCompletedAt: null, lastFailDay: null,
    }],
    goals: [], tasks: [], taskIdCounter: 1, forgedIdCounter: 2, uidCounter: 1, goalIdCounter: 1,
    xpHistory: [], bloodOath: null, hirePool: null,
    lastDayReset: DAY(0), lastWeekReset: MONDAY,
    strongholds: shState(CAPTURED),
    army: { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 50 }, week: 3 },
    siege: { week: 1, lastResult: null, assaultDay: DAY(-1), wkSkips: 0, wkTaskFails: 0, retriedThisWeek: false, rams: 0, ladders: 0 },
    season: { num: 1, start: DAY(0), crownBonus: 0, snapshot: { totalXp: 500, gold: 50000, captured: CAPTURED, completions: 1, level: 5 } },
    throne: 0,
  };
  if (loaded) {
    save.hero.totem = { id: 'wolf', chosenDayKey: DAY(0), rechoose: false };
    save.hero.doctrines = { t1: 'tax', t2: null, t3: 'crown' };
    save.TECHS = { owned: { e1: true, e2: true, e4: true, d3: true, d4: true }, lvl: {} };
    save.TECH_PTS = 0;
    save.TECH_IDEA = 'idea_wealth';
    save.TECH_ACTIVES = { sac: MONDAY };
  }
  return save;
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
// казна панели Твердынь: Налоги +N / Содержание −M (минус U+2212, как в рендере)
async function readTreasury(page) {
  const txt = await page.locator('.sh-treasury').innerText();
  return {
    taxes: parseInt((txt.match(/Налоги:\s*\+(\d+)/) || [0, 0])[1], 10),
    upkeep: parseInt((txt.match(/Содержание:\s*−(\d+)/) || [0, 0])[1], 10),
  };
}

const STANCE_MULT = { none: 1, assault: 1.25, defend: 1.25, scout: 1.1, economy: 0.75 };

// ===================== 2.1: содержание >1 реально списывается =====================
test('аудит 2.1: метель севера ×2 и стойки (Штурм/Оборона ×1.25, Разведка ×1.1, Экономия ×0.75) — «Содержание» в DOM = превью = тик = золото в казне', async ({ page }) => {
  await bootWithSave(page, makeSave({ loaded: false }));
  const weeks = await page.evaluate(() => {
    const sn = weatherSeasonWeek().sn; let clear = null, bliz = null;
    for (let w = 1; w <= 80 && !(clear && bliz); w++) {
      const ids = [1, 2, 3, 4].map((p) => weatherOf(p, sn, w).id);
      if (!bliz && ids[0] === 'blizzard') bliz = w;                         // метель в пров. 1 (север)
      if (!clear && ids.every((id) => id !== 'blizzard')) clear = w;         // нигде нет метели
    }
    return { sn, clear, bliz };
  });
  assert.ok(weeks.clear && weeks.bliz, 'в сезоне 1 найдены ясная неделя и неделя с метелью на севере: ' + JSON.stringify(weeks));

  const scenarios = [
    ['ясно, без стойки', weeks.clear, 'none'], ['ясно, «Штурм» ×1.25', weeks.clear, 'assault'], ['ясно, «Оборона» ×1.25', weeks.clear, 'defend'],
    ['ясно, «Разведка» ×1.1', weeks.clear, 'scout'], ['ясно, «Экономия» ×0.75', weeks.clear, 'economy'],
    ['метель севера, без стойки', weeks.bliz, 'none'], ['метель севера + «Штурм»', weeks.bliz, 'assault'],
  ];
  const got = {};
  for (const [name, week, stance] of scenarios) {
    const pre = await page.evaluate(({ week, stance }) => {
      siege.week = week;
      if (stance === 'none') delete siege.stance; else siege.stance = stance;
      renderStrongholds();
      const sn = weatherSeasonWeek().sn;
      return { preview: shUpkeepPerDay(), blizzardByProv: [1, 2, 3, 4].map((p) => weatherOf(p, sn, week).id === 'blizzard'), goldBefore: HERO.gold };
    }, { week, stance });
    const dom = await readTreasury(page);
    // оракул: каталог × множители теста, округление по-твердынно (как corruptionTick), провинциальное правило — модель
    let want = 0;
    for (let i = 0; i < CAPTURED; i++) {
      const prov = DATA.STRONGHOLDS[i].prov;
      const weather = (prov <= 2 && pre.blizzardByProv[prov - 1]) ? 2 : 1;
      want += Math.round(BASE_UPKEEP * (weather * STANCE_MULT[stance]) * SM.provinceUpkeepMult(prov));
    }
    assert.equal(dom.upkeep, want, name + ': «Содержание» в DOM');
    assert.equal(pre.preview, want, name + ': shUpkeepPerDay()');
    const tick = await page.evaluate(() => { const t = strongholdsDailyTick(); return { income: t.income, upkeep: t.upkeep, paid: t.paid, goldAfter: HERO.gold }; });
    assert.equal(tick.upkeep, want, name + ': ночной тик списал столько же');
    assert.equal(tick.paid, true, name + ': казны хватает — день без долга');
    assert.equal(tick.goldAfter - pre.goldBefore, tick.income - tick.upkeep, name + ': золото изменилось ровно на доход − содержание');
    got[name] = want;
  }
  // штрафы действительно штрафуют, скидка — скидывает
  const clear = got['ясно, без стойки'];
  assert.ok(got['ясно, «Штурм» ×1.25'] > clear && got['ясно, «Оборона» ×1.25'] > clear, 'Штурм/Оборона дороже нормы');
  assert.ok(got['ясно, «Разведка» ×1.1'] > clear && got['ясно, «Разведка» ×1.1'] < got['ясно, «Штурм» ×1.25'], 'Разведка ×1.1 — между нормой и ×1.25');
  assert.ok(got['ясно, «Экономия» ×0.75'] < clear, 'Экономия дешевле нормы');
  assert.ok(got['метель севера, без стойки'] > clear * 1.2, 'метель севера заметно поднимает содержание: ' + clear + ' → ' + got['метель севера, без стойки']);
  assert.ok(got['метель севера + «Штурм»'] > got['метель севера, без стойки'], 'метель × стойка перемножаются');
});

// ===================== 2.2: единая формула дохода =====================
test('аудит 2.2: «Налоги» в DOM = shIncomePerDay() = дневной тик при тотеме, Пути Богатства, «Великой жатве», короне, технологиях; каждый фактор виден в превью', async ({ page }) => {
  await bootWithSave(page, makeSave({ loaded: true }));
  // сид действительно включил все факторы (иначе тест проверял бы нейтральную экономику)
  const flags = await page.evaluate(() => ({
    totem: totemGoldMult(), idea: techIdeaMult(), sac: techOrderActive('sac'), crown: doctrineCrownMult(),
    tax: ['e1', 'e2', 'e4', 'd3', 'd4'].every((id) => hasTech(id)),
  }));
  assert.deepEqual(flags, { totem: 1.05, idea: 1.15, sac: true, crown: 1.1, tax: true }, 'тотем Волк, Путь Богатства, жатва, корона, технологии — включены');

  const r = await page.evaluate(() => {
    const out = { full: shIncomePerDay() };
    const keep = { totem: HERO.totem, idea: TECH_IDEA, act: TECH_ACTIVES, owned: TECHS.owned, t3: HERO.doctrines.t3 };
    HERO.totem = null; out.noTotem = shIncomePerDay(); HERO.totem = keep.totem;
    TECH_IDEA = null; out.noIdea = shIncomePerDay(); TECH_IDEA = keep.idea;
    TECH_ACTIVES = {}; out.noSac = shIncomePerDay(); TECH_ACTIVES = keep.act;
    HERO.doctrines.t3 = null; out.noCrown = shIncomePerDay(); HERO.doctrines.t3 = keep.t3;
    TECHS.owned = {}; out.noTech = shIncomePerDay(); TECHS.owned = keep.owned;
    out.restored = shIncomePerDay();
    renderStrongholds();
    return out;
  });
  assert.equal(r.restored, r.full, 'после возврата факторов превью то же самое');
  for (const k of ['noTotem', 'noIdea', 'noSac', 'noCrown', 'noTech']) {
    assert.ok(r[k] < r.full, k + ': фактор виден в «Налогах» (до аудита превью не знало тотема, жатвы, Пути Богатства и торговых технологий): ' + r[k] + ' < ' + r.full);
  }

  const dom = await readTreasury(page);
  assert.equal(dom.taxes, r.full, '«Налоги» в DOM = shIncomePerDay()');
  const tick = await page.evaluate(() => { const g0 = HERO.gold, t = strongholdsDailyTick(); return { income: t.income, upkeep: t.upkeep, g0, g1: HERO.gold }; });
  assert.equal(tick.income, dom.taxes, 'реальный ночной тик зачислил ровно показанные «Налоги»');
  assert.equal(tick.g1 - tick.g0, tick.income - tick.upkeep, 'золото: +доход −содержание');
  // и строка «Налоги» = то, что реально легло в казну: следующее превью до следующего тика не «обещает» больше
  await expect(page.locator('.sh-treasury')).toContainText('Налоги');
});
