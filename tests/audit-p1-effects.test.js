'use strict';
// Аудит 2026-10-02, 2.4 «мёртвые эффекты технологий» (ветвь 🕯 и Железный Закон):
//   s2 «Реликварий» (артефакты боссов ×1.25) — techArtifactMult() нигде не вызывалась;
//   s3 «Обряды Усмирения» (гнев −1) — вычиталось из счётчиков, обнулённых строкой выше (всегда 0);
//   s4 «Пророчества Вех» (сила осады всегда видна) — techSeesSiege() нигде не вызывалась: туман скрывал силу;
//   w6 «Железный Закон» (кап гнева 7) — экран и превью капили на 7, а сама осада (runWeeklySiege) — на 10:
//   игрок видел одно, а бил по нему другой гнев.
// Харнесс: экстрактор function-by-name из app.js (brace counting) + new Function со стабами (паттерн wave3).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SD = require('../js/stronghold-data.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js', 'ui', 'strongholds.js'), 'utf8');

function extractBlock(anchor) {
  const start = app.indexOf(anchor);
  assert.ok(start > -1, 'anchor not found: ' + anchor);
  let depth = 0, end = -1;
  for (let i = app.indexOf('{', start); i < app.length; i++) {
    if (app[i] === '{') depth++;
    else if (app[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > -1, 'unbalanced braces after: ' + anchor);
  return app.slice(start, end + 1);
}
const extractFn = (name) => extractBlock('function ' + name + '(');
const hasFn = (name) => app.indexOf('function ' + name + '(') > -1;
function buildIn({ decls = [], stubs = {}, body }) {
  const src = decls.join('\n') + '\nreturn (' + body + ');';
  const keys = Object.keys(stubs);
  return new Function(...keys, src)(...keys.map((k) => stubs[k]));
}
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ===================== s2: Реликварий усиливает пассив артефакта =====================
const BASE = { tax: 1.05, attrition: 0.9, def: 1.05, xp: 1.10, cost: 0.85 };
function artifactMult(kind, { s2 = false, ascension = 0, owned = true } = {}) {
  const a = SD.BOSS_ARTIFACTS.find((x) => x.kind === kind);
  const HERO = { ascension, bosses: { defeated: owned ? [a.num] : [], pendingReward: null, rewardChoice: owned ? { [a.num]: 'artifact' } : {} } };
  return buildIn({
    decls: [extractFn('techArtifactMult'), extractFn('bossArtifactMult')],
    stubs: { hasTech: (id) => s2 && id === 's2', HERO, BOSS_ARTIFACTS: SD.BOSS_ARTIFACTS, ensureBossesState: () => {} },
    body: 'bossArtifactMult(' + JSON.stringify(kind) + ', ' + a.prov + ')'
  });
}

test('2.4 s2: Реликварий усиливает пассив каждого вида артефактов боссов ×1.25 (tax/attrition/def/xp/cost)', () => {
  for (const kind of Object.keys(BASE)) {
    assert.ok(near(artifactMult(kind), BASE[kind]), kind + ': без s2 — табличная сила');
    const want = 1 + (BASE[kind] - 1) * 1.25;
    assert.ok(near(artifactMult(kind, { s2: true }), want), kind + ': с s2 — сила ×1.25 (' + want + '), получено ' + artifactMult(kind, { s2: true }));
  }
});

test('2.4 s2: Вознесение (артефакты ×0.5) и Реликварий перемножаются; без самого артефакта усиливать нечего', () => {
  assert.ok(near(artifactMult('tax', { s2: true, ascension: 1 }), 1 + 0.05 * 0.5 * 1.25), 'после Вознесения с s2: 1 + 0.05 × 0.5 × 1.25');
  assert.ok(near(artifactMult('tax', { ascension: 1 }), 1.025), 'после Вознесения без s2 — как раньше');
  assert.equal(artifactMult('tax', { s2: true, owned: false }), 1, 'артефакт не получен — Реликварий ничего не даёт');
});

// ===================== s3 + w6: единый расчёт гнева =====================
function wrath({ raw = 0, techs = [] } = {}) {
  const decls = [extractFn('techWrathWeekReduction')];
  if (hasFn('siegeWrathCap')) decls.push(extractFn('siegeWrathCap'));
  decls.push(extractFn('siegeWrathNow'));
  return buildIn({
    decls,
    stubs: { hasTech: (id) => techs.indexOf(id) > -1, countGhostTasks: () => 0, siege: { wkSkips: raw, wkTaskFails: 0 }, approachWrathDeltaNow: () => 0 },
    body: 'siegeWrathNow()'
  });
}

test('2.4 s3: Обряды Усмирения вычитают 1 гнев (не ниже 0), в том числе из потолка', () => {
  assert.equal(wrath({ raw: 3 }), 3, 'без s3 — как раньше');
  assert.equal(wrath({ raw: 3, techs: ['s3'] }), 2, 'гнев 3 → 2');
  assert.equal(wrath({ raw: 0, techs: ['s3'] }), 0, 'ниже нуля не уходит');
  assert.equal(wrath({ raw: 30 }), 10, 'кап 10');
  assert.equal(wrath({ raw: 30, techs: ['s3'] }), 9, 'кап 10 − 1 = 9');
});

test('2.4 w6 + s3: Железный Закон капит гнев на 7, Обряды Усмирения вычитают после капа', () => {
  assert.equal(wrath({ raw: 30, techs: ['w6'] }), 7);
  assert.equal(wrath({ raw: 3, techs: ['w6'] }), 3, 'ниже капа w6 не мешает');
  assert.equal(wrath({ raw: 30, techs: ['w6', 's3'] }), 6, 'кап 7 − 1');
  assert.equal(wrath({ raw: 1, techs: ['w6', 's3'] }), 0);
});

test('2.4: siegeWrathCap — единое число для экранов («Гнев: N/кап»): 10 без w6, 7 с w6', () => {
  assert.ok(hasFn('siegeWrathCap'), 'функция капа существует');
  const cap = (techs) => buildIn({ decls: [extractFn('siegeWrathCap')], stubs: { hasTech: (id) => techs.indexOf(id) > -1 }, body: 'siegeWrathCap()' });
  assert.equal(cap([]), 10);
  assert.equal(cap(['w6']), 7);
  assert.ok(ui.indexOf("siegeWrathNow() + '/10") === -1, 'экраны Твердынь не зашивают «/10»');
  assert.ok(app.indexOf("wrath + '/10") === -1, 'отчёт осады не зашивает «/10»');
});

// ===================== runWeeklySiege берёт тот же гнев, что экран и превью =====================
function runSiegeWrath({ raw, techs }) {
  const seen = { wrath: [], reportWrath: null };
  const decls = [extractFn('runWeeklySiege'), extractFn('techWrathWeekReduction')];
  if (hasFn('siegeWrathCap')) decls.push(extractFn('siegeWrathCap'));
  decls.push(extractFn('siegeWrathNow'));
  buildIn({
    decls,
    stubs: {
      ensureStrongholdState: () => {}, capturedCount: () => 1, countGhostTasks: () => 0,
      approachWrathDeltaNow: () => 0, lastCapturedIdx: () => 0,
      STRONGHOLDS: [{ total: 200, prov: 7, name: 'Синт' }],
      strongholds: [{ captured: true, garrison: [{ tier: 't1', count: 2 }] }],
      STATS: { end: { value: 3 } }, defBonusOf: () => 0,
      totemDefMult: () => 1, doctrineFortMult: () => 1, synergyDefMult: () => 1, stanceDefMult: () => 1, techDefMult: () => 1,
      ascEnemyMult: () => 1, approachEnemyMultNow: () => 1, weeklyModsNow: () => ({ income: 1, upkeep: 1, siege: 1 }),
      provCapturedCount: () => 0, provResourceMult: () => 0,
      applyStackLoss: (g) => g, addXpReward: () => {}, ruinAllBuildings: () => {},
      recalcHirePool: () => {}, chronicleSiegeRows: () => {},
      showSiegeReport: (rows, w) => { seen.reportWrath = w; },
      hasTech: (id) => techs.indexOf(id) > -1,
      siege: { week: 4, wkSkips: raw, wkTaskFails: 0 },
      SM: { siegePower: (total, week, cap, w) => { seen.wrath.push(w); return 1; }, defensePower: () => 100000, armyPower: () => 0, stackPower: () => 0 }
    },
    body: 'runWeeklySiege()'
  });
  return seen;
}

test('2.4 w6: осада бьёт тем же гневом, что показывают экран и превью (кап 7, а не 10)', () => {
  const noTech = runSiegeWrath({ raw: 30, techs: [] });
  assert.equal(noTech.wrath[0], 10, 'без технологий кап 10');
  assert.equal(noTech.reportWrath, 10);
  const w6 = runSiegeWrath({ raw: 30, techs: ['w6'] });
  assert.equal(w6.wrath[0], 7, 'w6: сила удара считается с гневом 7');
  assert.equal(w6.reportWrath, 7, 'w6: в отчёте тоже 7');
  const both = runSiegeWrath({ raw: 30, techs: ['w6', 's3'] });
  assert.equal(both.wrath[0], 6, 'w6 + s3: 7 − 1');
  assert.equal(both.reportWrath, 6);
  const s3 = runSiegeWrath({ raw: 4, techs: ['s3'] });
  assert.equal(s3.wrath[0], 3, 's3: гнев 4 → 3 в самой осаде');
});

test('2.4 s3: понедельник больше не вычитает Обряды из только что обнулённых счётчиков (мёртвая строка удалена)', () => {
  assert.equal(app.indexOf('siege.wkSkips - techWrathWeekReduction()'), -1);
  assert.equal(app.indexOf('siege.wkTaskFails - techWrathWeekReduction()'), -1);
  assert.ok(extractFn('siegeWrathNow').indexOf('techWrathWeekReduction()') > -1, 'вычитание живёт в siegeWrathNow');
});

// ===================== s4: туман не скрывает силу осады =====================
function preview({ techs = [], fog = true }) {
  return buildIn({
    decls: [extractFn('techSeesSiege'), extractFn('siegeAlarmPreview')],
    stubs: {
      hasTech: (id) => techs.indexOf(id) > -1,
      SM: { siegePower: (total, week) => Math.round(total * (1 + week)), armyPower: (u) => u.t1 * 2, stackPower: () => 10 },
      army: { units: { t1: 5 } },
      strongholds: [{ captured: true, garrison: [{ tier: 't1', count: 1 }] }],
      STRONGHOLDS: [{ total: 200, prov: 7 }],
      siege: { week: 3, wkSkips: 0, wkTaskFails: 0 },
      capturedCount: () => 1, lastCapturedIdx: () => 0, siegeWrathNow: () => 0, ascEnemyMult: () => 1,
      weeklyModsNow: () => ({ income: 1, upkeep: 1, siege: 1 }),
      weatherSeasonWeek: () => ({ sn: 1, wk: 1 }), HERO: { scouts: null },
      scoutFresh: () => null, getMSKDayKey: () => '2026-01-01',
      weatherFog: () => fog, stanceFogPierce: () => false, siegeAlarmVerdict: () => 'ок'
    },
    body: 'siegeAlarmPreview()'
  });
}

test('2.4 s4: Пророчества Вех — в тумане сила осады видна; без s4 по-прежнему «🌫 ?»', () => {
  const hidden = preview({ fog: true });
  assert.equal(hidden.power, '🌫 ?', 'без s4 туман скрывает силу');
  assert.equal(hidden.ratio, null);
  const seen = preview({ fog: true, techs: ['s4'] });
  assert.equal(seen.power, 800, 's4: сила осады видна сквозь туман (200 × (1 + 3))');
  assert.ok(Number.isFinite(seen.ratio), 's4: ratio посчитан');
  assert.equal(preview({ fog: false }).power, 800, 'без тумана — как раньше');
});
