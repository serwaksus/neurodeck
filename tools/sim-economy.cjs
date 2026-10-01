#!/usr/bin/env node
'use strict';
// ============================================================
// NeuroDeck — Economy Simulation (фаза 1 AAA-плана: «Economy & Progression Rebalance»)
// Чисто Node-симуляция на РЕАЛЬНЫХ функциях stronghold-model.js (assaultOutcome,
// siegePower, defensePower, armyPower, corruptionTick, tradeRoutes/Bonus) и
// stronghold-data.js (стоимости, налоги, upkeep, grow). Браузер не нужен.
//
// Сценарии × 3 сида × 90 дней; артефакт — таблица метрик + гейты (exit 1 при провале).
// Гейты — РЕЛЬСЫ против катастрофического дисбаланса, не тонкая настройка:
//  G1 дисциплина доходит до осады быстро и без банкротств;
//  G2 казуал без стратегии всё равно прогрессирует и не руинится рано;
//  G3 двухнедельный отпуск разрушаем, но восстановим (comeback существует);
//  G4 армия-без-экономики жизнеспособна (нет единственного доминирующего билда);
//  G5 эконом-жокей не обязателен; G6 нет гиперинфляции дохода;
//  G7 ветвление кампании (Campaign 2.0 C1): обход одной ветки развилки жизнеспособен,
//     графовые маршруты (tradeRoutesGraph по next-рёбрам) платят за пропущенные твердыни.
// Ревизия 2026-09-30: сюда же идёт аудит daysToSiegeNow (осадный календарь = воскресный штурм).
// P8 (2026-10-01): горизонты и эндгейм — отдельный блок ПОСЛЕ G1–G7 (их вывод не меняется):
//  G8 марафон 180 дней жив (захватывает/не банкротится/не рушится коррупцией);
//  G9 престиж-цикл: Вознесение достижимо за 365 дней, после сброса мир восстановим;
//  G10 эндгейм-ротация C6-lite живая (≥3 модификаторов за год, вне 20/20 не применяется,
//     худшие недели не рушат дисциплину);
//  G11 рост сейва: оценка снапшота@365 ≤ 160 чанков (CAMPAIGN-2.0.md §риски: раннее
//     предупреждение до жёсткого лимита облака 200 × CLOUD_MAX_CHUNK).
// ============================================================
const path = require('path');
const ROOT = path.join(__dirname, '..');
globalThis.StrongholdData = require(ROOT + '/js/stronghold-data.js');
const CAT = globalThis.StrongholdData;
const SM = require(ROOT + '/js/stronghold-model.js');

const DAYS = 90;
const TIER_KEYS = SM.TIER_KEYS;

// ---------- детерминированный RNG (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- игровые формулы (эталон из qa-economy-parity.cjs) ----------
const R = (x) => Math.round(x);
// Campaign 2.0 C1: сценарий с useGraphRoutes считает маршруты по графу next-рёбер (tradeRoutesGraph),
// остальные — по индексной смежности (tradeRoutes: parity с qa-economy-parity).
const routes = (flags, sc) => (sc && sc.useGraphRoutes && typeof SM.tradeRoutesGraph === 'function')
  ? SM.tradeRoutesGraph(flags) : SM.tradeRoutes(flags);
const tradeB = (r) => SM.tradeBonus(r);
function shIncome(flags, shBuildings, sc) {
  let taxes = 0, econ = 0, market = 0;
  flags.forEach((cap, i) => {
    if (!cap) return;
    taxes += CAT.STRONGHOLDS[i].tax;
    const bs = shBuildings[i] || {};
    Object.keys(bs).forEach((id) => {
      const d = CAT.BUILDINGS[id];
      if (!d || !bs[id].built) return;
      const m = bs[id].corruptionStage === 'worn' ? 0.5 : bs[id].corruptionStage === 'ruin' ? 0 : 1;
      if (d.gold) econ += d.gold * m;
      if (d.market) market += d.market * m;
    });
  });
  taxes = R(taxes * (1 + tradeB(routes(flags, sc))));
  return R((taxes + R(econ)) * (1 + Math.min(0.5, market)));
}
const hireCost = (tier, cha) => Math.ceil(CAT.UNIT_TIERS[tier].cost * (1 - Math.min(0.30, 0.005 * cha)));
const weeklyPool = (shBuildings) => {
  let pool = 0;
  shBuildings.forEach((bs) => Object.keys(bs || {}).forEach((id) => {
    const d = CAT.BUILDINGS[id];
    if (bs[id] && bs[id].built && d && d.cat === 'house' && d.grow) pool += d.grow;
  }));
  return pool;
};

// ---------- состояние игрока ----------
function freshPlayer() {
  return {
    gold: 30,
    captured: CAT.STRONGHOLDS.map(() => false),
    shBuildings: CAT.STRONGHOLDS.map(() => ({})), // shBuildings[i][id] = {built, corruptionStage, debtDays}
    units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 },
    pool: 0,
    siegeWeek: 1,
    wr: 0,
    stats: null, // заполняет сценарий
  };
}
const capturedCount = (p) => p.captured.filter(Boolean).length;
const frontIdx = (p) => { for (let i = CAT.STRONGHOLDS.length - 1; i >= 0; i--) if (p.captured[i]) return i; return -1; };
const stackPower = (units) => SM.stackPower(units);
const armyP = (p) => SM.armyPower(p.units);
const defBonusOf = (p, i) => {
  let b = 0;
  Object.keys(p.shBuildings[i] || {}).forEach((id) => {
    const d = CAT.BUILDINGS[id];
    if (d && d.def && p.shBuildings[i][id].built) {
      const m = p.shBuildings[i][id].corruptionStage === 'worn' ? 0.5 : p.shBuildings[i][id].corruptionStage === 'ruin' ? 0 : 1;
      b += d.def * m;
    }
  });
  return Math.round(b);
};

// ---------- действия ----------
function canBuild(p, i, id) {
  const d = CAT.BUILDINGS[id];
  if (!d || !p.captured[i]) return false;
  if (p.shBuildings[i][id] && p.shBuildings[i][id].built) return false;
  if (Object.keys(p.shBuildings[i]).filter((k) => p.shBuildings[i][k].built).length >= CAT.STRONGHOLDS[i].slots) return false;
  if (d.req && !(p.shBuildings[i][d.req] && p.shBuildings[i][d.req].built)) return false;
  if (capturedCount(p) < d.min) return false;
  return p.gold >= d.cost;
}
function build(p, i, id) {
  const d = CAT.BUILDINGS[id];
  p.gold -= d.cost;
  p.shBuildings[i][id] = { built: true, corruptionStage: 'ok', debtDays: 0 };
}
function hire(p, tier, n) {
  // в игре найм тира требует построенный дом этого тира (Ж1→Т1 … Ж7→Т7) в любой захваченной твердыне
  const houseOk = p.shBuildings.some((bs) => Object.keys(bs || {}).some((id) => {
    const d = CAT.BUILDINGS[id];
    return bs[id] && bs[id].built && d && d.cat === 'house' && d.tier === tier;
  }));
  if (!houseOk) return 0;
  const c = hireCost(tier, p.stats.cha);
  const afford = Math.min(n, Math.floor(p.gold / c), p.pool);
  if (afford <= 0) return 0;
  p.gold -= afford * c;
  p.units[tier] = (p.units[tier] || 0) + afford;
  p.pool -= afford;
  return afford;
}
// Campaign 2.0 C1: цель штурма — первая незахваченная твердыня вне обходимых веток (p.skip).
// Для линейных сценариев (skip нет, дырок нет) эквивалентно прежнему capturedCount(p).
function nextTarget(p) {
  for (let i = 0; i < CAT.STRONGHOLDS.length; i++) {
    if (!p.captured[i] && !(p.skip && p.skip[i])) return i;
  }
  return -1;
}
function tryAssault(p, rng) {
  const idx = nextTarget(p);
  if (idx < 0) return false;
  const sh = CAT.STRONGHOLDS[idx];
  const out = SM.assaultOutcome(armyP(p), sh.total, { rand: rng });
  if (!out.win) { // поражение: 10–20% потерь, фронт не растёт
    applyAttrition(p, out.attritionPct);
    return false;
  }
  applyAttrition(p, out.attritionPct);
  p.captured[idx] = true;
  p.shBuildings[idx] = {};
  return true;
}
function applyAttrition(p, pct) {
  TIER_KEYS.forEach((t) => {
    const n = Math.floor((p.units[t] || 0) * (1 - pct));
    p.units[t] = n;
  });
}

// ---------- суточный/недельный тик ----------
function dayTick(p, rng, sc, day, m) {
  // доход: карточки (1💰 за выполнение по attendance сценария) + налоги/экономика
  const cards = sc.cardsToday(day, rng);
  p.gold += cards * 1 + shIncome(p.captured, p.shBuildings, sc);
  // содержание: суммарный upkeep, оплата общим золотом (тик догоняет пропущенные дни)
  let totalUpkeep = 0;
  const perShUpkeep = p.captured.map((cap, i) => {
    if (!cap) return 0;
    let u = 0;
    Object.keys(p.shBuildings[i]).forEach((id) => {
      const d = CAT.BUILDINGS[id];
      const b = p.shBuildings[i][id];
      if (b.built && b.corruptionStage !== 'ruin' && d && isFinite(d.upkeep)) u += d.upkeep;
    });
    totalUpkeep += u;
    return u;
  });
  const paid = p.gold >= totalUpkeep;
  p.captured.forEach((cap, i) => {
    if (!cap) return;
    Object.keys(p.shBuildings[i]).forEach((id) => {
      const b = p.shBuildings[i][id];
      if (b.built && b.corruptionStage !== 'ruin') {
        const res = SM.corruptionTick({ [id]: b }, paid ? perShUpkeep[i] : 0, p.stats.wil, {});
        if (res.buildings[id].corruptionStage === 'ruin' && p.shBuildings[i][id].corruptionStage !== 'ruin') { m.ruins++; m.ruinByCorruption++; }
        p.shBuildings[i][id] = res.buildings[id];
      }
    });
  });
  if (paid) p.gold -= totalUpkeep;
  else p.gold = 0;
  return { cards, paid };
}

function weekTick(p, rng, m) {
  const f = frontIdx(p);
  if (f < 0) { p.siegeWeek = 1; return { fell: false }; }
  const power = SM.siegePower(CAT.STRONGHOLDS[f].total, p.siegeWeek, capturedCount(p), p.wr);
  const def = SM.defensePower(CAT.STRONGHOLDS[f], p.garrison, 0, defBonusOf(p, f));
  let fell = def < power;
  if (fell) {
    p.captured[f] = false;
    TIER_KEYS.forEach((t) => { p.units[t] = (p.units[t] || 0) - (p.garrisonMap[t] || 0); if (p.units[t] < 0) p.units[t] = 0; });
    Object.keys(p.shBuildings[f]).forEach((id) => {
      if (p.shBuildings[f][id].built && p.shBuildings[f][id].corruptionStage !== 'ruin') m.ruins++; // руины от потери осады — легитимный исход
      p.shBuildings[f][id].corruptionStage = 'ruin';
    });
    p.siegeWeek = 1;
  } else {    p.siegeWeek = Math.min(12, p.siegeWeek + 1);
  }
  p.pool = weeklyPool(p.shBuildings); // понедельничный пул найма
  return { fell, power, def };
}

// ---------- каркас сценария ----------
function runScenario(sc, seed) {
  const rng = mulberry32(seed);
  const p = freshPlayer();
  p.stats = { wil: sc.wil, cha: sc.cha };
  if (Array.isArray(sc.skipIds)) p.skip = CAT.STRONGHOLDS.map((s) => sc.skipIds.indexOf(s.id) >= 0); // Campaign 2.0 C1: обходимые ветки
  const m = {
    firstAssaultDay: null, firstCaptureDay: null, capturesEnd: 0,
    golds: [], zeroGoldDays: 0, maxDebtDays: 0, ruins: 0, ruinByCorruption: 0, lostWeeks: 0,
    incomes: {}, choiceDays: 0, recoveryDays: null, firstRuinDay: null,
    routesIndexEnd: null, routesGraphEnd: null,
  };
  // старт: Ж1 на Сендер-Хуторе как в онбординге (3.2 плейтеста: захват → Ж1 за 60)
  p.captured[0] = true; p.gold = Math.max(p.gold, 60); build(p, 0, 'zh1');
  p.pool = weeklyPool(p.shBuildings); // понедельничный пул найма доступен сразу (4.1 плейтеста)
  for (let day = 1; day <= DAYS; day++) {
    const before = capturedCount(p);
    // выбор гарнизона фронта (доля армии по сценарию)
    p.garrisonMap = {};
    TIER_KEYS.forEach((t) => { p.garrisonMap[t] = Math.floor((p.units[t] || 0) * sc.garrisonShare); });
    p.garrison = TIER_KEYS.map((t) => ({ tier: t, count: p.garrisonMap[t] })).filter((s) => s.count > 0);
    const idle = sc.idle(day, rng);
    if (!idle) {
      const actions = sc.plan(p, rng); // [{type:'build',i,id}|{type:'hire',tier,n}|{type:'assault'}]
      let assaults = 0;
      actions.forEach((a) => {
        if (a.type === 'build' && canBuild(p, a.i, a.id)) build(p, a.i, a.id);
        else if (a.type === 'hire') hire(p, a.tier, a.n);
        else if (a.type === 'assault' && assaults === 0) { assaults++; if (m.firstAssaultDay === null) m.firstAssaultDay = day; tryAssault(p, rng); }
      });
      if (actions.length >= 2 && !idle) m.choiceDays++;
    }
    const t = dayTick(p, rng, sc, day, m);
    if (p.gold <= 0) m.zeroGoldDays++;
    m.golds.push(p.gold);
    p.captured.forEach((cap, i) => Object.keys(p.shBuildings[i]).forEach((id) => {
      const b = p.shBuildings[i][id];
      if (b.built) {
        m.maxDebtDays = Math.max(m.maxDebtDays, b.debtDays || 0);
        if (b.corruptionStage === 'ruin') { m.ruins++; if (m.firstRuinDay === null) m.firstRuinDay = day; }
      }
    }));
    if (day % 7 === 0) { const w = weekTick(p, rng, m); if (w.fell) m.lostWeeks++; }
    if (m.firstCaptureDay === null && capturedCount(p) > before) m.firstCaptureDay = day;
    m.incomes[day] = shIncome(p.captured, p.shBuildings, sc);
  }
  m.capturesEnd = capturedCount(p);
  m.routesIndexEnd = SM.tradeRoutes(p.captured);
  m.routesGraphEnd = (typeof SM.tradeRoutesGraph === 'function') ? SM.tradeRoutesGraph(p.captured) : m.routesIndexEnd;
  m.golds.sort((a, b) => a - b);
  m.goldP50 = m.golds[Math.floor(m.golds.length / 2)];
  return m;
}

// ---------- стратегии ----------
const STRATEGIES = [
  {
    name: 'Дисциплина', wil: 40, cha: 0, garrisonShare: 0.4,
    cardsToday: () => 5, idle: () => false,
    plan(p) {
      const acts = [];
      const idx = capturedCount(p);
      // 1) эконом-здания (рок продаёт доход), 2) дома под пул, 3) найм микса, 4) штурм при запасе
      for (const i of p.captured.map((c, j) => j).filter((j) => p.captured[j])) {
        for (const id of ['ec1', 'ec2', 'ec3', 'zh1', 'zh2', 'df1', 'ec4', 'zh3', 'df2', 'ec5', 'zh4', 'df3', 'df4', 'zh5', 'zh6', 'zh7']) {
          if (canBuild(p, i, id)) { acts.push({ type: 'build', i, id }); break; }
        }
        if (acts.length) break;
      }
      const mix = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
      for (const t of mix) if (p.pool > 0) acts.push({ type: 'hire', tier: t, n: p.pool });
      const ratio = armyP(p) / (CAT.STRONGHOLDS[Math.min(idx, 19)].total || 1);
      if (idx < 20 && ratio >= 1.2) acts.push({ type: 'assault' });
      return acts;
    },
  },
  {
    // Campaign 2.0 C1: дисциплина на ветвящейся карте — военные ветки развилок (sh08/sh18) обходим,
    // маршруты считаем по графу next-рёбер: диагонали развилок (sh07→sh09, sh17→sh19) платят за обход.
    name: 'Ветвление', wil: 40, cha: 0, garrisonShare: 0.4, useGraphRoutes: true, skipIds: ['sh08', 'sh18'],
    cardsToday: () => 5, idle: () => false,
    plan(p) {
      const acts = [];
      const idx = nextTarget(p);
      for (const i of p.captured.map((c, j) => j).filter((j) => p.captured[j])) {
        for (const id of ['ec1', 'ec2', 'ec3', 'zh1', 'zh2', 'df1', 'ec4', 'zh3', 'df2', 'ec5', 'zh4', 'df3', 'df4', 'zh5', 'zh6', 'zh7']) {
          if (canBuild(p, i, id)) { acts.push({ type: 'build', i, id }); break; }
        }
        if (acts.length) break;
      }
      const mix = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
      for (const t of mix) if (p.pool > 0) acts.push({ type: 'hire', tier: t, n: p.pool });
      const target = idx >= 0 ? CAT.STRONGHOLDS[idx] : null;
      const ratio = target ? armyP(p) / (target.total || 1) : Infinity;
      if (target && ratio >= 1.2) acts.push({ type: 'assault' });
      return acts;
    },
  },
  {
    name: 'Оптимизатор-эконом', wil: 60, cha: 20, garrisonShare: 0.5,
    cardsToday: () => 5, idle: () => false,
    plan(p) {
      const acts = [];
      const idx = capturedCount(p);
      for (const i of p.captured.map((c, j) => j).filter((j) => p.captured[j])) {
        for (const id of ['ec1', 'ec2', 'ec3', 'ec4', 'ec5', 'zh1', 'zh2', 'zh3']) {
          if (canBuild(p, i, id) && p.gold >= 2 * CAT.BUILDINGS[id].cost) { acts.push({ type: 'build', i, id }); break; }
        }
        if (acts.length) break;
      }
      if (p.pool > 0) acts.push({ type: 'hire', tier: 't2', n: p.pool });
      if (p.pool > 0) acts.push({ type: 'hire', tier: 't1', n: p.pool });
      const ratio = armyP(p) / (CAT.STRONGHOLDS[Math.min(idx, 19)].total || 1);
      if (idx < 20 && ratio >= 1.35) acts.push({ type: 'assault' });
      return acts;
    },
  },
  {
    name: 'Казуал', wil: 30, cha: 0, garrisonShare: 0.4,
    cardsToday: (day, rng) => (rng() < 2 / 7 ? 0 : 5), // ~2 дня пропуска в неделю
    idle(day, rng) { return this.cardsToday(day, rng) === 0; },
    plan(p, rng) {
      const acts = [];
      const idx = capturedCount(p);
      const i = Math.floor(rng() * Math.max(1, capturedCount(p)));
      const ids = Object.keys(CAT.BUILDINGS).filter((id) => canBuild(p, i, id));
      if (ids.length) { ids.sort((a, b) => CAT.BUILDINGS[a].cost - CAT.BUILDINGS[b].cost); if (rng() < 0.6) acts.push({ type: 'build', i, id: ids[0] }); }
      if (p.pool > 0 && rng() < 0.7) acts.push({ type: 'hire', tier: 't1', n: p.pool });
      const ratio = armyP(p) / (CAT.STRONGHOLDS[Math.min(idx, 19)].total || 1);
      if (idx < 20 && ratio >= 1.15 && rng() < 0.6) acts.push({ type: 'assault' });
      return acts;
    },
  },
  {
    name: 'Отпуск', wil: 40, cha: 0, garrisonShare: 0.4, capturesAtReturn: -1,
    cardsToday: (day) => (day >= 30 && day <= 43 ? 0 : 5),
    idle(day) { return day >= 30 && day <= 43; },
    plan(p) {
      const acts = [];
      const idx = capturedCount(p);
      for (const i of p.captured.map((c, j) => j).filter((j) => p.captured[j])) {
        for (const id of ['zh2', 'ec2', 'df1', 'ec3']) if (canBuild(p, i, id)) { acts.push({ type: 'build', i, id }); break; }
        if (acts.length) break;
      }
      if (p.pool > 0) acts.push({ type: 'hire', tier: 't1', n: p.pool }); // Т1 всегда доступен от Ж1 — иначе дедлок на min:2 у zh2
      if (p.pool > 0) acts.push({ type: 'hire', tier: 't2', n: p.pool });
      const ratio = armyP(p) / (CAT.STRONGHOLDS[Math.min(idx, 19)].total || 1);
      if (idx < 20 && ratio >= 1.25) acts.push({ type: 'assault' });
      return acts;
    },
  },
  {
    name: 'Голо-армия', wil: 40, cha: 0, garrisonShare: 0.3,
    cardsToday: () => 5, idle: () => false,
    plan(p) {
      const acts = [];
      const idx = capturedCount(p);
      // дома только ради тиров найма (эконом-здания игнорирует)
      for (const i of p.captured.map((c, j) => j).filter((j) => p.captured[j])) {
        for (const id of ['zh1', 'zh2', 'zh3', 'zh4']) if (canBuild(p, i, id)) { acts.push({ type: 'build', i, id }); break; }
        if (acts.length) break;
      }
      if (p.pool > 0) { acts.push({ type: 'hire', tier: 't1', n: p.pool }); acts.push({ type: 'hire', tier: 't2', n: p.pool }); acts.push({ type: 'hire', tier: 't3', n: p.pool }); }
      const ratio = armyP(p) / (CAT.STRONGHOLDS[Math.min(idx, 19)].total || 1);
      if (idx < 20 && ratio >= 1.05) acts.push({ type: 'assault' });
      return acts;
    },
  },
  {
    name: 'Голо-экономия', wil: 40, cha: 0, garrisonShare: 0.5,
    cardsToday: () => 5, idle: () => false,
    plan(p) {
      const acts = [];
      for (const i of p.captured.map((c, j) => j).filter((j) => p.captured[j])) {
        for (const id of ['ec1', 'ec2', 'ec3', 'ec4', 'ec5', 'zh1']) if (canBuild(p, i, id)) { acts.push({ type: 'build', i, id }); break; }
        if (acts.length) break;
      }
      if (p.pool > 0 && p.gold > 1500) acts.push({ type: 'hire', tier: 't2', n: p.pool });
      const idx = capturedCount(p);
      const ratio = armyP(p) / (CAT.STRONGHOLDS[Math.min(idx, 19)].total || 1);
      if (idx < 20 && ratio >= 1.5) acts.push({ type: 'assault' });
      return acts;
    },
  },
];

// ---------- прогон ----------
const SEEDS = [11, 22, 33];
function agg(name) {
  const sc = STRATEGIES.find((s) => s.name === name);
  const runs = SEEDS.map((s) => runScenario(sc, s));
  const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
  const sum = (k) => runs.reduce((a, r) => a + r[k], 0) / runs.length;
  return { sc, runs, med, sum };
}
const results = {};
console.log('===== ЭКОНОМИЧЕСКАЯ СИМУЛЯЦИЯ (реальные stronghold-model функции, ' + DAYS + ' дней, сиды ' + SEEDS.join('/') + ') =====');
console.log('Сценарий            | захват@90 | штурм-день | нулей💰 | P50💰 | макс.долг | руин-соб | потерян.нед | выбор-дни');
STRATEGIES.forEach((s) => {
  const a = agg(s.name);
  results[s.name] = a;
  const r = a.runs[1]; // медианный сид
  const fa = r.firstAssaultDay === null ? '—' : r.firstAssaultDay;
  console.log(
    s.name.padEnd(19) + ' | ' + String(r.capturesEnd).padStart(9) +
    ' | ' + String(fa).padStart(10) +
    ' | ' + String(r.zeroGoldDays).padStart(7) +
    ' | ' + String(r.goldP50).padStart(5) +
    ' | ' + String(r.maxDebtDays).padStart(9) +
    ' | ' + String(r.ruins).padStart(4) +
    ' | ' + String(r.lostWeeks).padStart(11) +
    ' | ' + String(Math.round(100 * r.choiceDays / DAYS)).padStart(8) + '%'
  );
});
// инфляция: доход дисциплины день90 / день30
const a = results['Дисциплина'].runs[1];
const inflation = (a.incomes[90] || 1) / Math.max(1, a.incomes[30] || 1);
console.log('Инфляция дохода (дисциплина, д90/д30): ×' + inflation.toFixed(1));

// ---------- гейты ----------
let fail = 0;
function gate(id, cond, msg) {
  console.log((cond ? 'OK   ' : 'FAIL ') + id + '. ' + msg);
  if (!cond) fail++;
}
const A = results['Дисциплина'].runs[1];
const B = results['Ветвление'].runs[1];
const C = results['Казуал'].runs[1];
const D = results['Отпуск'].runs[1];
const E = results['Голо-армия'].runs[1];
const F = results['Голо-экономия'].runs[1];
gate('G1', A.firstAssaultDay !== null && A.firstAssaultDay <= 14, 'дисциплина: первая осада ≤ 14 дней (факт: ' + A.firstAssaultDay + ')');
gate('G1', A.capturesEnd >= 10, 'дисциплина: ≥ 10 твердынь за 90 дней (факт: ' + A.capturesEnd + ')');
gate('G1', A.zeroGoldDays <= 20, 'дисциплина: нулевых дней ≤ 20 (факт: ' + A.zeroGoldDays + ')');
gate('G1', A.ruinByCorruption === 0, 'дисциплина: коррупционных руин нет (осадные — легитимны; факт: ' + A.ruinByCorruption + ')');
gate('G2', C.capturesEnd >= 4, 'казуал: ≥ 4 твердынь без стратегии (факт: ' + C.capturesEnd + ')');
gate('G2', C.firstRuinDay === null || C.firstRuinDay >= 25, 'казуал: ранняя руина невозможна (факт: ' + C.firstRuinDay + ')');
gate('G3', D.ruins <= 8, 'отпуск 14 дн: разрушений ≤ 8 (факт: ' + D.ruins + ')');
gate('G3', D.capturesEnd > C.capturesEnd - 3, 'отпуск: comeback не отбрасывает глубже казуала (факт: ' + D.capturesEnd + ' vs ' + C.capturesEnd + ')');
gate('G4', E.capturesEnd >= 6, 'армия-фокус жизнеспособна: ≥ 6 твердынь (факт: ' + E.capturesEnd + ')');
gate('G5', A.capturesEnd - E.capturesEnd <= 12, 'эконом-жокей не обязателен: разрыв ≤ 12 (факт: ' + (A.capturesEnd - E.capturesEnd) + ')');
gate('G6', A.goldP50 <= 2000, 'sinks работают: P50 золота дисциплины не копится бесконтрольно (факт: ' + A.goldP50 + ')');
gate('G7', B.firstAssaultDay !== null && B.firstAssaultDay <= 14, 'ветвление: первая осада ≤ 14 дней (факт: ' + B.firstAssaultDay + ')');
gate('G7', B.capturesEnd >= 9, 'ветвление: ≥ 9 твердынь из 18 доступных (обход ш08/ш18; факт: ' + B.capturesEnd + ')');
gate('G7', B.zeroGoldDays <= 20, 'ветвление: нулевых дней ≤ 20 (факт: ' + B.zeroGoldDays + ')');
gate('G7', B.ruinByCorruption === 0, 'ветвление: коррупционных руин нет (факт: ' + B.ruinByCorruption + ')');
gate('G7', B.routesGraphEnd > B.routesIndexEnd, 'ветвление: обход ш08 — граф-маршруты больше индексных, диагональ ш07→ш09 платит за обход (факт: ' + B.routesGraphEnd + ' vs ' + B.routesIndexEnd + ')');
gate('G7', SM.tradeBonus(B.routesGraphEnd) <= 0.38, 'ветвление: кап бонуса путей +38% соблюдается (факт: ' + SM.tradeBonus(B.routesGraphEnd) + ')');
console.log('Отчёт (не гейт): рост дохода д90/д30 ×' + inflation.toFixed(1) + '; руины по коррупции: А=' + A.ruinByCorruption + ' F=' + F.ruinByCorruption + '; P50 золота: E=' + E.goldP50 + '; маршруты ветвления: граф ' + B.routesGraphEnd + ' / индекс ' + B.routesIndexEnd);

// ============================================================
// P8: ГОРИЗОНТЫ 180/365 — престиж-цикл, эндгейм-ротация, рост сейва
// К паритет-формуле 90-дневного эталона добавлены СТРУКТУРНЫЕ механики длинных циклов —
// все реальными функциями модели/каталога: правила провинций C3 (province*Mult), венцы
// сезонов + Вечный трон (ветки taxMultiplier из app.js), эндгейм-модификаторы C6-lite
// (weekly*Mult при 20/20), Вознесение Г2-5 (performAscension: 10% казны, мир сброшен,
// враги +25%/круг — множит удар воскресной осады, как runWeeklySiege; оборона целей
// штурма не масштабируется — как assaultForecast). Сезоны по 30 дней (SEASON_DAYS),
// венец — за ≥1 захват за сезон (showSeasonReport), трон — THRONE_COSTS (QA4-M1).
// ============================================================
const H_SEASON_DAYS = 30;
const H_THRONE_COSTS = [100000, 250000, 500000, 1000000, 2000000];
const H_SAVE_CHUNK = 4096;      // storage.js CLOUD_MAX_CHUNK
const H_SAVE_CHUNK_RAIL = 160;  // CAMPAIGN-2.0.md §риски: sz-надзор до жёсткого лимита 200

const endgameOf = (p) => capturedCount(p) >= CAT.STRONGHOLDS.length; // app.js weeklyEndgame (20/20)
const ascEnemyMultOf = (p) => 1 + 0.25 * (p.ascension || 0);         // app.js ascEnemyMult (Г2-5)
function crownThroneTaxMult(p) { // app.js taxMultiplier: венцы (кап +10%) × Вечный трон (кап +5%)
  return (1 + Math.min(0.10, p.crowns * 0.02)) * (1 + Math.min(0.05, p.throne * 0.01));
}
function shIncomeLong(p) {
  let taxes = 0, econ = 0, market = 0;
  p.captured.forEach((cap, i) => {
    if (!cap) return;
    const provMult = (typeof SM.provinceIncomeMult === 'function') ? SM.provinceIncomeMult(CAT.STRONGHOLDS[i].prov) : 1;
    taxes += Math.round(CAT.STRONGHOLDS[i].tax * provMult);
    const bs = p.shBuildings[i] || {};
    Object.keys(bs).forEach((id) => {
      const d = CAT.BUILDINGS[id];
      if (!d || !bs[id].built) return;
      const mult = bs[id].corruptionStage === 'worn' ? 0.5 : bs[id].corruptionStage === 'ruin' ? 0 : 1;
      if (d.gold) econ += d.gold * mult;
      if (d.market) market += d.market * mult;
    });
  });
  const rt = (typeof SM.tradeRoutesGraph === 'function') ? SM.tradeRoutesGraph(p.captured) : SM.tradeRoutes(p.captured);
  taxes = R(taxes * (1 + tradeB(rt))); // граф-маршруты — как в панели/превью (Campaign 2.0 C1)
  taxes = R(taxes * crownThroneTaxMult(p));
  taxes = R(taxes * ((typeof SM.weeklyIncomeMult === 'function') ? SM.weeklyIncomeMult(p.seasonNum, p.siegeWeek, endgameOf(p)) : 1));
  return R((taxes + R(econ)) * (1 + Math.min(0.5, market)));
}
function dayTickLong(p, rng, sc, day, m) {
  const cards = sc.cardsToday(day, rng);
  if (cards > 0) m.activeDays++;
  p.gold += cards * 1 + shIncomeLong(p);
  let gold = p.gold; // последовательная оплата твердынь общим золотом — как strongholdsDailyTick
  p.captured.forEach((cap, i) => {
    if (!cap) return;
    const provMult = (typeof SM.provinceUpkeepMult === 'function') ? SM.provinceUpkeepMult(CAT.STRONGHOLDS[i].prov) : 1;
    const wkMult = (typeof SM.weeklyUpkeepMult === 'function') ? SM.weeklyUpkeepMult(p.seasonNum, p.siegeWeek, endgameOf(p)) : 1;
    const res = SM.corruptionTick(p.shBuildings[i], gold, p.stats.wil, { provinceUpkeepMult: provMult * wkMult });
    Object.keys(res.buildings).forEach((id) => {
      const was = p.shBuildings[i][id];
      if (res.buildings[id].corruptionStage === 'ruin' && was && was.built && was.corruptionStage !== 'ruin') m.ruinByCorruption++;
    });
    p.shBuildings[i] = res.buildings;
    gold = res.gold;
  });
  p.gold = gold;
  if (endgameOf(p)) { // ротация видна только в эндгейме; считаем каждую (season, week) пару один раз
    m.endgameDays++;
    const key = p.seasonNum + ':' + p.siegeWeek;
    if (!m.modSeen[key]) {
      m.modSeen[key] = true;
      const wm = (typeof SM.weeklyModifierOf === 'function') ? SM.weeklyModifierOf(p.seasonNum, p.siegeWeek) : null;
      if (wm && wm.id) m.modWeeks[wm.id] = (m.modWeeks[wm.id] || 0) + 1;
    }
  }
  return { cards };
}
function weekTickLong(p, rng, m) {
  const f = frontIdx(p);
  if (f < 0) { p.siegeWeek = 1; return { fell: false }; }
  const prov = CAT.STRONGHOLDS[f].prov;
  let power = SM.siegePower(CAT.STRONGHOLDS[f].total, p.siegeWeek, capturedCount(p), p.wr);
  power = Math.round(power * ascEnemyMultOf(p) // Г2-5: враги +25%/круг
    * ((typeof SM.weeklySiegeMult === 'function') ? SM.weeklySiegeMult(p.seasonNum, p.siegeWeek, endgameOf(p)) : 1) // C6-lite
    * ((typeof SM.provinceSiegeMult === 'function') ? SM.provinceSiegeMult(prov) : 1)); // P5/C3 — parity с runWeeklySiege
  const def = SM.defensePower(CAT.STRONGHOLDS[f], p.garrison, 0, defBonusOf(p, f));
  let fell = def < power;
  if (fell) {
    p.captured[f] = false;
    TIER_KEYS.forEach((t) => { p.units[t] = Math.max(0, (p.units[t] || 0) - (p.garrisonMap[t] || 0)); });
    Object.keys(p.shBuildings[f]).forEach((id) => { p.shBuildings[f][id].corruptionStage = 'ruin'; });
    p.siegeWeek = 1;
  } else {    p.siegeWeek = Math.min(12, p.siegeWeek + 1);
  }
  p.pool = weeklyPool(p.shBuildings); // понедельничный пул найма
  return { fell, power, def };
}
function resetWorld(p) { // performAscension: 10% казны, круг++, мир/трон/сезон сброшены
  p.gold = Math.floor(p.gold * 0.10);
  p.ascension = (p.ascension || 0) + 1;
  p.captured = CAT.STRONGHOLDS.map(() => false);
  p.shBuildings = CAT.STRONGHOLDS.map(() => ({}));
  p.units = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 };
  p.garrisonMap = {}; p.garrison = [];
  p.pool = 0; p.siegeWeek = 1; p.throne = 0; p.crowns = 0;
  p.seasonNum = 1; p.seasonDay = 0; p.capturesAtSeasonStart = 1;
  // онбординг нового круга — тот же старт, что у прогона (sh01+Ж1); в игре бустрап через
  // «стройку в незахваченном ш01» (buyBuilding: idx===0) — исход идентичен
  p.captured[0] = true; p.gold = Math.max(p.gold, 60); build(p, 0, 'zh1');
  p.pool = weeklyPool(p.shBuildings);
}

// Стратегия «Марафонец»: дисциплина 90-дневного эталона + длинные циклы. Специализация
// твердынь (слоты 6–8 не вмещают каталог целиком): «столицы» пров. 4 (8 слотов) растят
// жилую цепь до Ж7 (пул старших тиров), остальные — экономика (ЭК1–ЭК5 + Ж2 + частокол).
// Найм старших тиров вперёд (пул недели — главный ограничитель темпа); в эндгейме казна
// банкится под следующий ярус трона. Вознесение — сразу при троне 5/5 и 20/20.
const MARATHON = {
  name: 'Марафонец', wil: 40, cha: 0, garrisonShare: 0.4,
  cardsToday: () => 5, idle: () => false,
  plan(p) {
    const acts = [];
    const endg = capturedCount(p) >= CAT.STRONGHOLDS.length;
    if (p.throne < 5 && p.gold >= H_THRONE_COSTS[p.throne]) acts.push({ type: 'throne' }); // investThrone
    if (p.throne >= 5 && endg) acts.push({ type: 'ascend' }); // кнопка «Вознестись» (трон 5/5)
    let built = false;
    for (const i of p.captured.map((c, j) => j).filter((j) => p.captured[j])) {
      const order = CAT.STRONGHOLDS[i].slots >= 8
        ? ['zh1', 'zh2', 'zh3', 'zh4', 'zh5', 'zh6', 'zh7', 'ec5']
        : ['ec1', 'ec2', 'ec3', 'zh2', 'ec4', 'ec5', 'df1', 'zh1'];
      for (const id of order) {
        if (canBuild(p, i, id)) { acts.push({ type: 'build', i, id }); built = true; break; }
      }
      if (built) break;
    }
    const banking = endg && p.throne < 5;
    const reserve = banking ? H_THRONE_COSTS[p.throne] : 0;
    for (const t of ['t7', 't6', 't5', 't4', 't3', 't2', 't1']) {
      if (p.pool <= 0) break;
      const c = hireCost(t, p.stats.cha);
      const budget = banking ? Math.max(0, p.gold - reserve) : p.gold;
      const n = Math.min(p.pool, Math.floor(budget / c));
      if (n > 0) acts.push({ type: 'hire', tier: t, n });
    }
    const idx = nextTarget(p);
    const target = idx >= 0 ? CAT.STRONGHOLDS[idx] : null;
    const ratio = target ? armyP(p) / (target.total || 1) : Infinity;
    if (target && ratio >= 1.4) acts.push({ type: 'assault' }); // attrition ≤ ~21% — берегём старшие тиры
    return acts;
  },
};

function runHorizon(sc, seed, days) {
  const rng = mulberry32(seed);
  const p = freshPlayer();
  p.stats = { wil: sc.wil, cha: sc.cha };
  p.ascension = 0; p.throne = 0; p.crowns = 0; p.seasonNum = 1; p.seasonDay = 0; p.capturesAtSeasonStart = 1;
  const m = {
    golds: [], zeroGoldDays: 0, ruins: 0, ruinByCorruption: 0, lostWeeks: 0, maxDebtDays: 0,
    ascensions: 0, ascensionDays: [], endgameDays: 0, endgameWeeks: 0, modSeen: {}, modWeeks: {},
    activeDays: 0, capturesAt: {}, firstRuinDay: null, firstAssaultDay: null, goldP50: 0, capturesEnd: 0,
  };
  p.captured[0] = true; p.gold = Math.max(p.gold, 60); build(p, 0, 'zh1');
  p.pool = weeklyPool(p.shBuildings);
  for (let day = 1; day <= days; day++) {
    p.seasonDay++;
    if (p.seasonDay > H_SEASON_DAYS) { // checkSeasonRollover: венец за ≥1 захват за сезон (showSeasonReport)
      p.seasonNum++; p.seasonDay = 1;
      if (capturedCount(p) > p.capturesAtSeasonStart) p.crowns = Math.min(5, p.crowns + 1);
      p.capturesAtSeasonStart = capturedCount(p);
    }
    p.garrisonMap = {};
    TIER_KEYS.forEach((t) => { p.garrisonMap[t] = Math.floor((p.units[t] || 0) * sc.garrisonShare); });
    p.garrison = TIER_KEYS.map((t) => ({ tier: t, count: p.garrisonMap[t] })).filter((s) => s.count > 0);
    const actions = sc.plan(p, rng);
    actions.forEach((a) => {
      if (a.type === 'throne') { p.gold -= H_THRONE_COSTS[p.throne]; p.throne++; }
      else if (a.type === 'ascend') { resetWorld(p); m.ascensions++; m.ascensionDays.push(day); }
      else if (a.type === 'build' && canBuild(p, a.i, a.id)) build(p, a.i, a.id);
      else if (a.type === 'hire') hire(p, a.tier, a.n);
      else if (a.type === 'assault') { if (m.firstAssaultDay === null) m.firstAssaultDay = day; tryAssault(p, rng); }
    });
    dayTickLong(p, rng, sc, day, m);
    if (p.gold <= 0) m.zeroGoldDays++;
    m.golds.push(p.gold);
    p.captured.forEach((cap, i) => Object.keys(p.shBuildings[i]).forEach((id) => {
      const b = p.shBuildings[i][id];
      if (b.built) {
        m.maxDebtDays = Math.max(m.maxDebtDays, b.debtDays || 0);
        if (b.corruptionStage === 'ruin') { m.ruins++; if (m.firstRuinDay === null) m.firstRuinDay = day; }
      }
    }));
    if (day % 7 === 0) {
      if (endgameOf(p)) m.endgameWeeks++;
      const w = weekTickLong(p, rng, m);
      if (w.fell) m.lostWeeks++;
    }
    m.capturesAt[day] = capturedCount(p);
  }
  m.capturesEnd = capturedCount(p);
  m.golds.sort((a, b) => a - b);
  m.goldP50 = m.golds[Math.floor(m.golds.length / 2)];
  return { p, m };
}

// Оценка роста сейва: снапшот формы storage.js saveGameState (v13) из РЕАЛЬНОГО состояния
// прогона + моделируемая колода. Допущения (консервативно-тяжёлый игрок): 3 стартовые
// карточки + 1 за каждый активный день ковки; истории обрезаны как в живом сейве
// (cardHistory/dailyUniqueStats — 120 дней, pruneAgedHistory; xpHistory — 90 записей);
// твердыни/армия/сезон/трон — фактические поля прогона (+builtAt у построек, как в UI).
function estimateSaveJson(p, days, activeDays) {
  const dayKey = (d) => '2026-' + String(Math.floor((d - 1) / 30) % 12 + 1).padStart(2, '0') + '-' + String((d - 1) % 30 + 1).padStart(2, '0');
  const cardCount = 3 + activeDays;
  const forged = [];
  for (let c = 1; c <= cardCount; c++) forged.push({
    id: c, name: 'Привычка ' + c, meta: '⚔ 15 мин · день',
    rank: 'A', streak: 30, stat: 'str', progress: 55, mastery: 3, masteryThreshold: 7,
    totalCompletions: 120, prestige: 1, evolutionPath: 'depth', daysActive: 90,
    firstCompletedAt: 1790000000000, lastCompletedAt: 1790000000000, lastFailDay: null,
  });
  const cardHistory = {}, dailyUniqueStats = {};
  for (let d = Math.max(1, days - 119); d <= days; d++) {
    const h = {};
    for (let c = 0; c < 6; c++) h[String(((d * 7 + c * 13) % cardCount) + 1)] = true;
    cardHistory[dayKey(d)] = h;
    dailyUniqueStats[dayKey(d)] = { str: true, wil: true, spi: true };
  }
  const xpHistory = [];
  for (let i = 89; i >= 0; i--) xpHistory.push({ date: dayKey(days - i), xp: 800 }); // кап 90 (app.js)
  const hero = {
    name: 'Игрок', title: 'Вознесённый', level: 40, xp: 1200, xpToNext: 2000, totalXp: 180000,
    gold: p.gold, consecutivePerfectDays: 12, dailyCompletions: 5, dailySkips: 1,
    lastSessionAt: 1790000000000, dailyUniqueStats: dailyUniqueStats, cardHistory: cardHistory,
    lastWeeklyReport: { num: 12, xp: 4200, gold: 9000, captured: 2, completions: 140, levels: 2 },
    ascension: p.ascension || 0,
    bosses: { defeated: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], activeNum: null, phase: 0, attemptDay: null, closedDay: null, introSeen: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], rewardChoice: { 1: 'artifact', 2: 'crown', 3: 'ruin' }, pendingReward: null },
    doctrines: { t1: 'veteran', t2: null, t3: null },
    tower: { floor: 24 },
  };
  const stats = {};
  ['str', 'agi', 'int', 'wil', 'cha', 'spi', 'end'].forEach((k) => { stats[k] = { name: k, icon: '⚔', value: 40, attributePoints: 12 }; });
  const goals = [], tasks = [];
  for (let g = 1; g <= 6; g++) goals.push({ id: g, name: 'Цель сезона ' + g, desc: 'Описание цели привычки', icon: '🎯', progress: 45, done: false, createdAt: 1790000000000 });
  for (let t = 1; t <= 8; t++) tasks.push({ id: t, text: 'Задача дня ' + t, done: false, date: dayKey(days) });
  const backpack = [];
  for (let b = 1; b <= 12; b++) backpack.push({ id: 'art' + b, uid: 'i' + (b + 400), slot: 'relic', name: 'Артефакт ' + b, desc: 'Описание артефакта', icon: '🔮', rarity: 'epic' });
  const strongholdsState = CAT.STRONGHOLDS.map((s, i) => {
    const b = {};
    Object.keys(p.shBuildings[i]).forEach((id) => { b[id] = Object.assign({ builtAt: 1790000000000 }, p.shBuildings[i][id]); });
    return { id: s.id, captured: !!p.captured[i], garrison: [], buildings: b };
  });
  const snapshot = {
    v: 14, gen: days * 4 + 17, hero: hero, stats: stats, forged: forged, goals: goals,
    inventory: { backpack: backpack, equipped: { relic: backpack[0], weapon: backpack[1] }, maxSlots: 30 },
    lastDayReset: dayKey(days), forgedIdCounter: cardCount + 1, uidCounter: 250, goalIdCounter: 7,
    xpHistory: xpHistory, bloodOath: null, lastWeekReset: dayKey(days - 2),
    tasks: tasks, taskIdCounter: 9, hirePool: p.pool, savedAt: 1790000000000,
    strongholds: strongholdsState,
    army: { units: p.units, week: 3 },
    siege: { week: p.siegeWeek, lastResult: null, assaultDay: null, wkSkips: 0, wkTaskFails: 0, retriedThisWeek: false, rams: 0, ladders: 0, approach: 'assault' },
    dailyQuests: null, dailyEvent: null,
    season: { num: p.seasonNum, start: dayKey(days - 10), crownBonus: p.crowns, snapshot: { totalXp: 120000, gold: p.gold, captured: capturedCount(p), completions: 900, level: 30 } },
    throne: p.throne, TECHS: {}, TECH_PTS: 40, TECH_IDEA: null, TECH_ACTIVES: {},
  };
  const len = (x) => JSON.stringify(x).length;
  const histInHero = len(hero.cardHistory) + len(hero.dailyUniqueStats);
  const parts = {
    cards: len(forged), histories: histInHero + len(xpHistory), strongholds: len(strongholdsState),
    hero: len(hero) - histInHero, // без историй (они — отдельная строка отчёта)
  };
  const whole = len(snapshot);
  parts.rest = whole - parts.cards - parts.histories - parts.strongholds - parts.hero;
  const avgCard = parts.cards / cardCount;
  return {
    whole: whole, chunks: Math.ceil(whole / H_SAVE_CHUNK), cards: cardCount, parts: parts,
    cardsToRail: Math.max(0, Math.floor((H_SAVE_CHUNK_RAIL * H_SAVE_CHUNK - (whole - parts.cards)) / avgCard)),
  };
}

// ---------- прогон горизонтов ----------
console.log('');
console.log('===== ГОРИЗОНТЫ P8 (Марафонец: 180/365 дней, престиж-цикл, эндгейм-ротация, рост сейва) =====');
const med = (arr) => arr.slice().sort((a, b) => a - b)[1];
const H180 = SEEDS.map((s) => runHorizon(MARATHON, s, 180));
const H365 = SEEDS.map((s) => runHorizon(MARATHON, s, 365));
[[180, H180], [365, H365]].forEach(([d, H]) => {
  const r = H[1]; // медианный сид
  console.log(
    'Марафонец ' + String(d).padStart(3) + ' дн | захват@' + d + ': ' + H.map((x) => x.m.capturesEnd).join('/') +
    ' (мед ' + med(H.map((x) => x.m.capturesEnd)) + ')' +
    ' | вознесений: ' + H.map((x) => x.m.ascensions).join('/') +
    ' | P50💰: ' + H.map((x) => x.m.goldP50).join('/') +
    ' | нулей💰: ' + H.map((x) => x.m.zeroGoldDays).join('/') +
    ' | потер.нед: ' + H.map((x) => x.m.lostWeeks).join('/')
  );
  console.log('  сид-медиана: трон ' + r.p.throne + '/5 · венцы ' + r.p.crowns + ' · руин ' + r.m.ruins +
    ' (по коррупции ' + r.m.ruinByCorruption + ', макс.долг ' + r.m.maxDebtDays + ' дн)' +
    ' · эндгейм ' + r.m.endgameDays + ' дн / ' + r.m.endgameWeeks + ' вс' +
    ' · модификаторов недели: ' + Object.keys(r.m.modWeeks).join(',') +
    (r.m.ascensionDays.length ? ' · вознесения в дни ' + r.m.ascensionDays.join(', ') : ''));
});
const sv180 = estimateSaveJson(H180[1].p, 180, H180[1].m.activeDays);
const sv365 = estimateSaveJson(H365[1].p, 365, H365[1].m.activeDays);
[[180, sv180], [365, sv365]].forEach(([d, sv]) => {
  console.log('Сейв-оценка@' + d + ': ' + sv.whole.toLocaleString('ru-RU') + ' симв = ' + sv.chunks + ' чанков (порог ' + H_SAVE_CHUNK_RAIL +
    ') · карточек ' + sv.cards + ' (' + Math.round(sv.parts.cards / 1024) + ' КБ)' +
    ' · истории ' + Math.round(sv.parts.histories / 1024) + ' КБ · твердыни ' + Math.round(sv.parts.strongholds / 1024) +
    ' КБ · герой ' + Math.round(sv.parts.hero / 1024) + ' КБ · прочее ' + Math.round(sv.parts.rest / 1024) + ' КБ' +
    ' · запас до рельсы: ' + sv.cardsToRail + ' карточек');
});

// ---------- гейты горизонтов ----------
const M180 = H180[1].m, M365 = H365[1].m;
gate('G8', med(H180.map((x) => x.m.capturesEnd)) >= 15, 'марафон 180д: ≥ 15 твердынь (факт: ' + med(H180.map((x) => x.m.capturesEnd)) + ')');
gate('G8', med(H180.map((x) => x.m.zeroGoldDays)) <= 40, 'марафон 180д: нулевых дней ≤ 40 (факт: ' + med(H180.map((x) => x.m.zeroGoldDays)) + ')');
gate('G8', M180.ruinByCorruption === 0, 'марафон 180д: коррупционных руин нет (факт: ' + M180.ruinByCorruption + ')');
gate('G9', M365.ascensions >= 1, 'престиж-цикл: ≥ 1 вознесения за 365д (факт: ' + M365.ascensions + ')');
gate('G9', M365.capturesEnd >= 5, 'после сброса мир восстановим: ≥ 5 твердынь к д365 (факт: ' + M365.capturesEnd + ')');
gate('G9', med(H365.map((x) => x.m.zeroGoldDays)) <= 80, 'година: нулевых дней ≤ 80 (факт: ' + med(H365.map((x) => x.m.zeroGoldDays)) + ')');
gate('G10', Object.keys(M365.modWeeks).length >= 3, 'эндгейм-ротация живая: ≥ 3 модификаторов недели за год (факт: ' + Object.keys(M365.modWeeks).join(',') + ')');
gate('G10', M365.ruinByCorruption === 0, 'худшие недели модификаторов не рушат дисциплину (факт коррупционных руин: ' + M365.ruinByCorruption + ')');
gate('G10', SM.weeklyIncomeMult(4, 6, false) === 1 && SM.weeklyUpkeepMult(4, 6, false) === 1 && SM.weeklySiegeMult(4, 6, false) === 1, 'вне эндгейма ротация не применяется (гейт 20/20 — как weeklyModsNow в app.js)');
gate('G11', sv365.chunks <= H_SAVE_CHUNK_RAIL, 'сейв@365: ' + sv365.chunks + ' чанков ≤ ' + H_SAVE_CHUNK_RAIL + ' (жёсткий лимит облака 200; CAMPAIGN-2.0.md §риски)');

console.log(fail === 0 ? 'ИТОГО: гейты экономики пройдены' : 'ИТОГО: ПРОВАЛЕНО ГЕЙТОВ: ' + fail);
process.exit(fail === 0 ? 0 : 1);
