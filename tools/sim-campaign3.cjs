#!/usr/bin/env node
'use strict';
// ============================================================
// NeuroDeck — симулятор Кампании 3.0, Фаза 2 (4 героя-сферы, 33 узла, 5 ресурсов).
// Чистая Node-симуляция на РЕАЛЬНОЙ модели js/campaign3/c3-model.js: профили дисциплины × 3 сида × 26 недель,
// бот-игрок с простой политикой (зачистка своего региона → сбор армий → штурм логова).
// Гейты — рельсы против катастрофического дисбаланса, не тонкая настройка:
//  C4 без дел очки движения не появляются, герои стоят в городах;
//  C7 детерминизм: тот же сид и профиль → тот же хеш состояния;
//  C6 размер сейва ≤ 4 КБ (общий кап c3 ≤ 8 КБ);
//  C5 действий игрока ≤ 20 в день (10–15 минут в стратегии);
//  C9 сфера не качается чужими делами: без дел Духа герой Духа не выходит из города и армия мира слабее;
//  C1 дисциплина 70 %: логово Лени падает за 8–18 недель на каждом сиде;
//  C2 дисциплина 40 %: карта проходима ≤ 26 недель, города целы;
//  C8 дисциплина окупается (медианы недель победы монотонны);
//  C3 дисциплина 10 %: игра не «умирает» — города целы, армии живы, герои выходят за границу города.
// Выход 1 при провале любого гейта.
// ============================================================
const path = require('path');
const ROOT = path.join(__dirname, '..');
const D = require(ROOT + '/js/campaign3/c3-data.js');
const M = require(ROOT + '/js/campaign3/c3-model.js');

const DAYS = 182;
const SEEDS = [11, 23, 47];
const PROFILES = [0.9, 0.7, 0.4, 0.1];
const CARDS = { body: 2, mind: 1, spirit: 1, ties: 1 }; // привычек в день по сферам
const TASKS_PER_DAY = 1;
const START = Date.UTC(2026, 9, 5); // понедельник
const dayKey = (i) => new Date(START + i * 86400000).toISOString().slice(0, 10);
const SPH = D.SPHERES;

// ---------- бот ----------
function econ(s, h, count) {
  let a = 0;
  if (M.townAt(s, h) < 0) return 0;
  const t = M.townAt(s, h);
  while (M.buyHall(s, h).ok) a++;
  for (const tier of ['t3', 't5']) if (M.buildDwelling(s, h, tier).ok) a++;
  for (const tier of ['t5', 't3', 't1']) {
    const pool = s.towns[t].pool[tier];
    for (let n = pool; n >= 1; n = Math.floor(n / 2)) { if (M.hire(s, h, tier, n).ok) { a++; break; } }
  }
  return a;
}
function goTo(s, h, target) {
  let a = 0;
  for (let g = 0; g < 12; g++) {
    if (s.heroes[h].node === target) break;
    const r = M.route(s, h, target);
    if (!r) break;
    if (r.battleNode === null) { const t = M.travel(s, h, target); if (t.moved.length) a++; break; }
    if (r.steps.length) { const t = M.travel(s, h, target); if (t.moved.length) a++; }
    const f = M.forecast(s, h, r.battleNode);
    if (!f.adjacent || f.ratio < 1.3 || s.ap[h] < f.ap) break;
    const e = M.engage(s, h, r.battleNode); a++;
    if (!e.ok || !e.win) break;
  }
  return a;
}
function regionTargets(h) { const k = h * 8; return [k + 2, k + 4, k + 6, k + 7]; }
function bot(s) {
  let actions = 0;
  for (let h = 0; h < 4; h++) actions += econ(s, h);
  const forts = [7, 15, 23, 31];
  const regionDone = forts.every((f, h) => s.own.charAt(f) === '1');
  const sumPower = [0, 1, 2, 3].reduce((x, h) => x + M.armyPower(s, h), 0);
  const lairDef = M.nodeDefense(s, D.LAIR);
  const rally = regionDone && sumPower >= lairDef * 1.35;
  if (!rally) {
    for (let h = 0; h < 4; h++) {
      if (s.done) break;
      const t = regionTargets(h).find((id) => s.own.charAt(id) !== '1');
      if (t === undefined) { if (M.townAt(s, h) < 0 && s.ap[h] > 0) actions += goTo(s, h, D.TOWNS[h]); continue; } // регион зачищен — домой нанимать
      const rt = M.route(s, h, t);
      const hostile = rt && rt.battleNode !== null ? rt.battleNode : (rt && rt.steps.length === 0 ? t : null);
      const def = M.nodeDefense(s, hostile !== null ? hostile : t);
      if (M.armyPower(s, h) >= def * 1.3) actions += goTo(s, h, t);
      else if (M.townAt(s, h) < 0 && s.ap[h] > 0) actions += goTo(s, h, D.TOWNS[h]); // слабы — домой докупать армию
    }
  } else {
    const rallyNode = 7;
    for (let h = 1; h < 4; h++) { actions += goTo(s, h, rallyNode); if (s.heroes[h].node === rallyNode) { M.transferAll(s, h, 0); actions++; } }
    actions += goTo(s, 0, rallyNode);
    if (s.heroes[0].node === rallyNode) {
      for (let h = 1; h < 4; h++) if (s.heroes[h].node === rallyNode) { M.transferAll(s, h, 0); }
      const f = M.forecast(s, 0, D.LAIR);
      if (f.adjacent && f.ratio >= 1.15 && s.ap[0] >= f.ap) { M.engage(s, 0, D.LAIR); actions++; }
    }
  }
  return actions;
}

function run(p, seed, opts) {
  opts = opts || {};
  const rng = M.mulberry32(seed * 7919 + Math.round(p * 100));
  const s = M.newState(dayKey(0));
  const out = { doneWeek: null, maxActions: 0, apGained: [0, 0, 0, 0], maxFar: [0, 0, 0, 0], raidsLost: 0 };
  for (let i = 0; i < DAYS; i++) {
    let missed = 0, overdue = 0;
    if (opts.noDeeds !== true) {
      SPH.forEach((sp, k) => {
        if (opts.skipSphere === sp) { missed += CARDS[sp]; return; }
        for (let c = 0; c < CARDS[sp]; c++) {
          if (rng() < p) { const r = M.applyDeed(s, { kind: 'habit', sphere: sp, rank: 'B' }); out.apGained[k] += r.gained; }
          else missed++;
        }
      });
      for (let t = 0; t < TASKS_PER_DAY; t++) {
        const sp = SPH[Math.floor(rng() * 4)];
        if (rng() < p && opts.skipSphere !== sp) { const r = M.applyDeed(s, { kind: 'task', sphere: sp }); out.apGained[SPH.indexOf(sp)] += r.gained; }
        else if (rng() < 0.3) overdue++;
      }
    }
    const a = opts.noDeeds === true ? 0 : bot(s);
    out.maxActions = Math.max(out.maxActions, a);
    for (let h = 0; h < 4; h++) { const far = M.shortestPath(D.TOWNS[h], s.heroes[h].node); out.maxFar[h] = Math.max(out.maxFar[h], far ? far.cost : 0); }
    const honest = Math.round(missed * 0.2), silent = Math.min(3, missed - honest);
    M.dayEnd(s, dayKey(i + 1), { silent, honest, overdue });
    if (i % 7 === 6) { const w = M.weekEnd(s); if (w.raid && w.raid.win) out.raidsLost++; }
    if (s.done && out.doneWeek === null) out.doneWeek = Math.floor(i / 7) + 1;
  }
  out.state = s; out.hash = M.stateHash(s); out.bytes = JSON.stringify(s).length;
  out.armyPower = [0, 1, 2, 3].reduce((x, h) => x + M.armyPower(s, h), 0);
  return out;
}

let failed = 0;
function gate(id, ok, msg) { console.log((ok ? 'OK   ' : 'FAIL ') + id + ' ' + msg); if (!ok) failed++; }

console.log('профиль/сид: победа (нед.) | макс. действий/день | дальность героев от домов | потеряно набегами | ОД по сферам | байт | сила армий');
const res = {};
PROFILES.forEach((p) => {
  res[p] = SEEDS.map((seed) => run(p, seed));
  res[p].forEach((r, i) => console.log(' ' + Math.round(p * 100) + '%/' + SEEDS[i] + ': ' + (r.doneWeek === null ? ' —' : String(r.doneWeek).padStart(2)) + ' | ' + String(r.maxActions).padStart(2) + ' | ' + r.maxFar.join('/') + ' | ' + r.raidsLost + ' | ' + r.apGained.join('/') + ' | ' + r.bytes + ' | ' + r.armyPower));
});

// C4: без дел — ничего
const dead = run(0.7, 11, { noDeeds: true });
gate('C4', dead.apGained.every((v) => v === 0) && dead.maxFar.every((v) => v === 0) && !dead.state.done && dead.state.heroes.every((h, i) => h.node === D.TOWNS[i]), 'без дел ОД = 0, герои в городах, победы нет');
// C7: детерминизм
const a1 = run(0.7, 11), a2 = run(0.7, 11);
gate('C7', a1.hash === a2.hash, 'тот же сид → тот же хеш (' + a1.hash + ')');
// C6: размер
const maxBytes = Math.max(...PROFILES.flatMap((p) => res[p].map((r) => r.bytes)));
gate('C6', maxBytes <= 4096, 'сейв ≤ 4096 байт (макс. ' + maxBytes + ')');
// C5: действия
const maxAct = Math.max(...PROFILES.flatMap((p) => res[p].map((r) => r.maxActions)));
gate('C5', maxAct <= 20, 'действий в день ≤ 20 (макс. ' + maxAct + ')');
// C9: сфера не качается чужими делами
const noSpirit = run(0.7, 11, { skipSphere: 'spirit' });
console.log(' без дел Духа (70 %): победа на неделе ' + (noSpirit.doneWeek === null ? '—' : noSpirit.doneWeek) + ', сила армий ' + noSpirit.armyPower + ' (с Духом ' + a1.armyPower + ')');
gate('C9', noSpirit.apGained[2] === 0 && noSpirit.maxFar[2] === 0 && noSpirit.state.heroes[2].node === D.TOWNS[2] && noSpirit.apGained[0] > 0, 'без дел Духа герой Духа стоит в городе, остальные играют (ОД ' + noSpirit.apGained.join('/') + ')');
// C1/C2/C3/C8
const wk = (p) => res[p].map((r) => r.doneWeek);
gate('C1', wk(0.7).every((w) => w !== null && w >= 8 && w <= 18), 'дисциплина 70 %: логово падает за 8–18 недель (' + wk(0.7).join(', ') + ')');
gate('C2', wk(0.4).every((w) => w !== null && w <= 26), 'дисциплина 40 %: карта проходима ≤ 26 недель (' + wk(0.4).join(', ') + ')');
const med = (p) => { const v = res[p].map((r) => r.doneWeek === null ? Infinity : r.doneWeek).sort((a, b) => a - b); return v[1]; };
gate('C8', med(0.9) < med(0.7) && med(0.7) < med(0.4) && med(0.4) <= med(0.1), 'дисциплина окупается: медианы недель победы 90/70/40/10 % = ' + [0.9, 0.7, 0.4, 0.1].map(med).join(' < '));
const low = res[0.1];
gate('C3', low.every((r) => r.maxFar.some((v) => v >= 2) && r.armyPower > 0 && D.TOWNS.every((t) => r.state.own.charAt(t) === '1')), 'дисциплина 10 %: города целы, армии живы, герои выходят за город (дальность ' + low.map((r) => Math.max(...r.maxFar)).join(', ') + ')');

console.log(failed ? '\nГЕЙТЫ КАМПАНИИ 3.0: ПРОВАЛ (' + failed + ')' : '\nИТОГО: гейты кампании 3.0 пройдены');
process.exit(failed ? 1 : 0);
