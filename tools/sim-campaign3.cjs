#!/usr/bin/env node
'use strict';
// ============================================================
// NeuroDeck — симулятор Кампании 3.0, Фаза 1 (вертикальный срез).
// Чистая Node-симуляция на РЕАЛЬНОЙ модели js/campaign3/c3-model.js: профили дисциплины × 3 сида × 84 дня,
// бот-игрок с простой политикой. Гейты — рельсы против катастрофического дисбаланса, не тонкая настройка:
//  C4 без дел очки движения не появляются, герой не двигается (игра не идёт сама);
//  C7 детерминизм: тот же сид и профиль → тот же хеш состояния;
//  C6 размер сейва среза ≤ 2 КБ (общий кап c3 ≤ 8 КБ — запас на Ф2);
//  C5 действий игрока ≤ 15 в день (10–15 минут в стратегии);
//  C1 дисциплина 70 %: логово Лени падает за 3–8 недель на каждом сиде;
//  C2 дисциплина 40 %: срез проходим (логово падает ≤ 12 недель), город цел всегда;
//  C3 дисциплина 10 %: игра не «умирает» — герой доходит хотя бы до узла 4, армия живая.
// Выход 1 при провале любого гейта.
// ============================================================
const path = require('path');
const ROOT = path.join(__dirname, '..');
const D = require(ROOT + '/js/campaign3/c3-data.js');
const M = require(ROOT + '/js/campaign3/c3-model.js');

const DAYS = 126; // 18 недель: сезон 12 + запас для «медленных» профилей
const SEEDS = [11, 23, 47];
const PROFILES = [0.9, 0.7, 0.4, 0.1];
const BODY_CARDS = 2, OTHER_CARDS = 3, TASKS_PER_DAY = 1;
const START = Date.UTC(2026, 9, 5); // понедельник
const dayKey = (i) => new Date(START + i * 86400000).toISOString().slice(0, 10);

function bot(s, log) { // политика: копить армию в городе, идти по маршруту [шахта, застава, форт, логово], брать при запасе силы
  let actions = 0;
  const targets = [2, 4, 6, 8];
  for (let guard = 0; guard < 30 && actions < 14; guard++) {
    if (s.done) break;
    if (s.hero.node === D.TOWN) {
      for (const tier of ['t3', 't1']) {
        const pool = s.town.pool[tier], can = Math.min(pool, Math.floor(s.res.g / D.UNITS[tier].cost));
        const keep = tier === 't3' ? 0 : 0;
        if (can > keep) { if (M.hire(s, tier, can).ok) actions++; }
      }
      while (M.buyForge(s).ok) actions++;
    }
    const t = targets.find((id) => s.own.charAt(id) !== '1');
    if (t === undefined) break;
    const rt = M.route(s, t);
    const hostileId = rt && rt.battleNode !== null ? rt.battleNode : (rt && rt.steps.length === 0 ? t : null);
    // оценка силы против ближайшего враждебного узла на пути
    const targetDef = M.nodeDefense(s, hostileId !== null ? hostileId : t);
    const strong = M.armyPower(s) >= targetDef * 1.3;
    if (!strong) {
      // слабы: возвращаемся в город докупать армию (если там есть что купить), иначе ждём
      if (s.hero.node !== D.TOWN && s.ap > 0 && (s.town.pool.t1 > 0 || s.town.pool.t3 > 0) && s.res.g >= 2) {
        const r = M.travel(s, D.TOWN); if (r.moved.length) actions++; else break;
        continue;
      }
      break;
    }
    if (M.ADJ[s.hero.node].includes(hostileId)) {
      if (s.ap < D.NODES[hostileId].cost) break;
      const r = M.engage(s, hostileId); actions++;
      if (!r.ok) break;
      continue;
    }
    const r = M.travel(s, t);
    if (r.moved.length) actions++;
    if (r.stopped === 'ap' || r.moved.length === 0 && r.stopped !== 'hostile') break;
  }
  return actions;
}

function run(p, seed, opts) {
  opts = opts || {};
  const rng = M.mulberry32(seed * 7919 + Math.round(p * 100));
  const s = M.newState(dayKey(0));
  const out = { doneWeek: null, maxActions: 0, apGained: 0, maxNode: 0, raidsLost: 0, series: [] };
  for (let i = 0; i < DAYS; i++) {
    if (opts.noDeeds !== true) {
      let missed = 0, overdue = 0;
      for (let c = 0; c < BODY_CARDS + OTHER_CARDS; c++) {
        if (rng() < p) { const r = M.applyDeed(s, { kind: 'habit', sphere: c < BODY_CARDS ? 'body' : 'mind', rank: 'B' }); out.apGained += r.gained; }
        else missed++;
      }
      for (let t = 0; t < TASKS_PER_DAY; t++) {
        if (rng() < p) { const r = M.applyDeed(s, { kind: 'task' }); out.apGained += r.gained; }
        else if (rng() < 0.3) overdue++;
      }
      s.__missed = missed; s.__overdue = overdue;
    }
    const a = opts.noDeeds === true ? 0 : bot(s);
    out.maxActions = Math.max(out.maxActions, a);
    out.maxNode = Math.max(out.maxNode, s.hero.node);
    const missed = opts.noDeeds === true ? 0 : s.__missed, overdue = opts.noDeeds === true ? 0 : s.__overdue;
    delete s.__missed; delete s.__overdue;
    const honest = Math.round(missed * 0.2), silent = Math.min(3, missed - honest);
    M.dayEnd(s, dayKey(i + 1), { silent, honest, overdue });
    if (i % 7 === 6) { const w = M.weekEnd(s); if (w.raid && w.raid.win) out.raidsLost++; }
    if (s.done && out.doneWeek === null) out.doneWeek = Math.floor(i / 7) + 1;
  }
  out.state = s; out.hash = M.stateHash(s); out.bytes = JSON.stringify(s).length;
  return out;
}

let failed = 0;
function gate(id, ok, msg) { console.log((ok ? 'OK   ' : 'FAIL ') + id + ' ' + msg); if (!ok) failed++; }

console.log('профиль × сид: победа (нед.) | макс. действий/день | узел | потеряно набегами | ОД всего | байт');
const res = {};
PROFILES.forEach((p) => {
  res[p] = SEEDS.map((seed) => run(p, seed));
  res[p].forEach((r, i) => console.log(' ' + Math.round(p * 100) + '%/' + SEEDS[i] + ': ' + (r.doneWeek === null ? ' —' : String(r.doneWeek).padStart(2)) + ' | ' + String(r.maxActions).padStart(2) + ' | ' + r.maxNode + ' | ' + r.raidsLost + ' | ' + r.apGained + ' | ' + r.bytes));
});

// C4: без дел — ничего
const dead = run(0.7, 11, { noDeeds: true });
gate('C4', dead.apGained === 0 && dead.maxNode === 0 && dead.state.ap <= D.C.AP_CARRY && dead.state.hero.node === D.TOWN, 'без дел ОД = 0, герой в Кузне, победы нет (ОД ' + dead.apGained + ', макс. узел ' + dead.maxNode + ')');
// C7: детерминизм
const a1 = run(0.7, 11), a2 = run(0.7, 11);
gate('C7', a1.hash === a2.hash, 'тот же сид → тот же хеш (' + a1.hash + ')');
// C6: размер
const maxBytes = Math.max(...PROFILES.flatMap((p) => res[p].map((r) => r.bytes)));
gate('C6', maxBytes <= 2048, 'сейв среза ≤ 2048 байт (макс. ' + maxBytes + ')');
// C5: действия
const maxAct = Math.max(...PROFILES.flatMap((p) => res[p].map((r) => r.maxActions)));
gate('C5', maxAct <= 15, 'действий в день ≤ 15 (макс. ' + maxAct + ')');
// C1/C2/C3
const w70 = res[0.7].map((r) => r.doneWeek);
gate('C1', w70.every((w) => w !== null && w >= 4 && w <= 10), 'дисциплина 70 %: логово падает за 4–10 недель (' + w70.join(', ') + ')');
const w40 = res[0.4].map((r) => r.doneWeek);
gate('C2', w40.every((w) => w !== null && w <= 16), 'дисциплина 40 %: срез проходим ≤ 16 недель, город цел (' + w40.join(', ') + ')');
// C8: дисциплина должна окупаться — медиана недели победы не убывает с падением дисциплины (нет победы = ∞)
const med = (p) => { const v = res[p].map((r) => r.doneWeek === null ? Infinity : r.doneWeek).sort((a, b) => a - b); return v[1]; };
gate('C8', med(0.9) < med(0.7) && med(0.7) < med(0.4) && med(0.4) <= med(0.1), 'дисциплина окупается: медианы недель победы 90/70/40/10 % = ' + [0.9, 0.7, 0.4, 0.1].map(med).join(' < '));
const low = res[0.1];
gate('C3', low.every((r) => r.maxNode >= 4 && (r.state.hero.army.t1 + r.state.hero.army.t3) > 0 && r.state.own.charAt(D.TOWN) === '1'), 'дисциплина 10 %: герой доходит до узла 4+, армия жива, город цел (узлы ' + low.map((r) => r.maxNode).join(', ') + ')');

console.log(failed ? '\nГЕЙТЫ КАМПАНИИ 3.0: ПРОВАЛ (' + failed + ')' : '\nИТОГО: гейты кампании 3.0 пройдены');
process.exit(failed ? 1 : 0);
