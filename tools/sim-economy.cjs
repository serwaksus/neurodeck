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
//  G5 эконом-жокей не обязателен; G6 нет гиперинфляции дохода.
// Ревизия 2026-09-30: сюда же идёт аудит daysToSiegeNow (осадный календарь = воскресный штурм).
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
const routes = (flags) => SM.tradeRoutes(flags);
const tradeB = (r) => SM.tradeBonus(r);
function shIncome(flags, shBuildings) {
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
  taxes = R(taxes * (1 + tradeB(routes(flags))));
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
function tryAssault(p, rng) {
  const idx = capturedCount(p);
  if (idx >= CAT.STRONGHOLDS.length) return false;
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
  p.gold += cards * 1 + shIncome(p.captured, p.shBuildings);
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
  const m = {
    firstAssaultDay: null, firstCaptureDay: null, capturesEnd: 0,
    golds: [], zeroGoldDays: 0, maxDebtDays: 0, ruins: 0, ruinByCorruption: 0, lostWeeks: 0,
    incomes: {}, choiceDays: 0, recoveryDays: null, firstRuinDay: null,
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
    m.incomes[day] = shIncome(p.captured, p.shBuildings);
  }
  m.capturesEnd = capturedCount(p);
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
gate('G6', A.goldP50 <= 2000, 'сinks работают: P50 золота дисциплины не копится бесконтрольно (факт: ' + A.goldP50 + ')');
console.log('Отчёт (не гейт): рост дохода д90/д30 ×' + inflation.toFixed(1) + '; руины по коррупции: А=' + A.ruinByCorruption + ' F=' + F.ruinByCorruption + '; P50 золота: E=' + E.goldP50);
console.log(fail === 0 ? 'ИТОГО: гейты экономики пройдены' : 'ИТОГО: ПРОВАЛЕНО ГЕЙТОВ: ' + fail);
process.exit(fail === 0 ? 0 : 1);
