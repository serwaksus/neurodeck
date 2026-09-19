// NeuroDeck Wave Г1 — Monte-Carlo доминантность доктрин (27 билдов 3^3 × 500 прогонов).
// Минимальный движок на реальных экспортах stronghold-model.js (armyPower/defensePower/assaultOutcome/
// siegePower/tradeRoutes/tradeBonus) + каталоге stronghold-data.js.
// Метрика: медиана недель до 20/20; допуск спреда <10% лучший/худший билд; превышен → ЭСКАЛАЦИЯ без правок.
// ponytail: один штурм+одна осадная проверка в неделю, гarrison 40% армии на последней захваченной,
// df-бонус ~min(captured,6)×15 (порт df-построек), wrath=2 (пассивный бот). Потолок: абсолютные недели
// сдвинуты vs живой игры, доминантность билдов сохранена. Апгрейд — порт полного игрового цикла.
'use strict';
const CAT = require('../js/stronghold-data.js');
globalThis.StrongholdData = CAT; // stronghold-model в Node читает globalThis (window.StrongholdData недоступен)
const SM = require('../js/stronghold-model.js');
const SH = CAT.STRONGHOLDS, TIERS = SM.TIER_KEYS;
const COST = {}, PWR = {};
TIERS.forEach((t) => { COST[t] = CAT.UNIT_TIERS[t].cost; PWR[t] = CAT.UNIT_TIERS[t].power; });

const N_RUNS = 500, CAP_WEEKS = 80, N_SH = SH.length, END = 3, CHA = 3;
const DOCS = {
  t1: ['tax', 'upkeep', 'atk'],
  t2: ['growth', 'lore', 'fort'],
  t3: ['crown', 'veteran', 'engine']
};
// t2-доктрина growth/lore — вне контура захвата (XP/щиты не двигают недели) → no-op, документировано в отчёте.

function stacksOf(units) { return TIERS.map((t) => ({ tier: t, count: units[t] || 0 })).filter((s) => s.count > 0); }
function takeShare(units, share) { // забрать share юнитов каждого тира в гарнизон (мелкие сначала)
  const g = {};
  TIERS.forEach((t) => {
    const n = units[t] || 0;
    const take = Math.floor(n * share);
    if (take > 0) { g[t] = take; units[t] = n - take; }
  });
  return g;
}
function mergeBack(units, g, lossPct) {
  TIERS.forEach((t) => {
    const n = g[t] || 0;
    if (!n) return;
    const lost = lossPct > 0 ? Math.min(Math.floor(n * lossPct), n - 1) : 0;
    units[t] = (units[t] || 0) + (n - lost);
  });
}

function simulate(d, rnd) {
  let captured = 1, gold = 300, siegeWeek = 1;
  const units = { t1: 8 };
  const garr = []; // garr[i] — гарнизон твердыни i
  for (let week = 1; week <= CAP_WEEKS; week++) {
    // --- доход 7 дней
    const routes = SM.tradeRoutes(Array.from({ length: N_SH }, (_, i) => i < captured));
    let taxes = 0;
    for (let i = 0; i < captured; i++) taxes += SH[i].tax;
    taxes = Math.round(taxes * (1 + SM.tradeBonus(routes)));
    if (d.t1 === 'tax') taxes = Math.round(taxes * 1.15);
    if (d.t3 === 'crown') taxes = Math.round(taxes * 1.10);
    let upkeep = captured > 1 ? Math.round(taxes * 7 * 0.25) : 0; // ~портфель содержания: 25% дохода
    if (d.t1 === 'upkeep') upkeep = Math.round(upkeep * 0.8);
    gold += taxes * 7 - upkeep;
    if (gold < 0) gold = 0;
    // --- найм: бюджет 70% казны, равные доли на 7 тиров (микс тиров → ×1.08 armyPower — real SM)
    const budget = gold * 0.7;
    const chaDisc = 1 - Math.min(0.30, 0.005 * CHA);
    TIERS.forEach((t) => {
      const cost = Math.ceil(COST[t] * chaDisc);
      const k = Math.min(Math.floor(budget / TIERS.length / cost), Math.floor(gold / cost));
      if (k > 0) { units[t] = (units[t] || 0) + k; gold -= k * cost; }
    });
    // --- штурм фронта (армия = юниты вне гарнизонов)
    if (captured < N_SH) {
      let atk = SM.armyPower(units);
      atk = Math.round(atk * (1 + 0.02 * CHA));
      if (d.t1 === 'atk') atk = Math.round(atk * 1.10);
      const out = SM.assaultOutcome(atk, SH[captured].total, { agi: CHA, banner: false, rand: rnd, attritionMult: d.t3 === 'veteran' ? 0.7 : 1 });
      TIERS.forEach((t) => { const n = units[t] || 0; if (n > 0) units[t] = n - Math.min(Math.floor(n * out.attritionPct), n - 1); });
      if (out.win) {
        captured++;
        garr[captured - 1] = takeShare(units, 0.4); // 40% армии остаётся гарнизоном
        siegeWeek = 1;
        gold += 150;
      } else { siegeWeek++; continue; }
    }
    if (captured >= N_SH) return week;
    // --- недельная осада последней захваченной (1 шаг каскада)
    const t = captured - 1;
    const dfBonus = Math.min(captured, 6) * 15;
    const garDef = Math.round(SM.defensePower(SH[t], garr[t] || [], END, dfBonus) * (d.t2 === 'fort' ? 1.10 : 1));
    const power = SM.siegePower(SH[t].total, siegeWeek - 1, captured, 2);
    if (garDef < power) { mergeBack(units, garr[t] || {}, 0.15); garr[t] = null; captured--; siegeWeek = 1; }
    else siegeWeek++;
  }
  return CAP_WEEKS;
}

const builds = [];
for (const a of DOCS.t1) for (const b of DOCS.t2) for (const c of DOCS.t3) builds.push({ t1: a, t2: b, t3: c });

let seed = 20260919;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const medians = builds.map(function (d) {
  const weeks = [];
  for (let r = 0; r < N_RUNS; r++) weeks.push(simulate(d, rnd));
  weeks.sort((x, y) => x - y);
  return { d: d.t1 + '/' + d.t2 + '/' + d.t3, med: weeks[N_RUNS >> 1] };
});
const meds = medians.map((m) => m.med);
const best = Math.min.apply(null, meds), worst = Math.max.apply(null, meds);
const spread = (worst - best) / best;

console.log('=== MC WAVE Г1: ' + builds.length + ' билдов × ' + N_RUNS + ' прогонов ===');
medians.forEach((m) => console.log('  ' + m.d.padEnd(22) + ' медиана ' + m.med + ' нед'));
console.log('Лучший ' + best + ' нед · Худший ' + worst + ' нед · Спред ' + (spread * 100).toFixed(1) + '% (допуск <10%)');
console.log(spread < 0.10 ? 'MC PASS: доминантности нет' : 'MC FAIL: доминантность — ЭСКАЛАЦИЯ (без правок чисел)');
