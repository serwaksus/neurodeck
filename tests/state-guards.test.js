// ============================================================
// tests/state-guards.test.js — sanitize functions coverage
// ============================================================
// 14 tests for the existing sanitizeCard/Inventory/Counter/Rank.
// + N new tests covering sanitizeHero/Goals/XpHistory/BossKills
// (the v46 patch — closes audit critical #1).
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SG = require('../js/state-guards.js');
const guards = SG; // алиас легаси-блока тестов

// ----------------------------------------------------------------
// Existing 14 tests (kept identical to before v46)
// ----------------------------------------------------------------

test('sanitizeRank: valid ranks pass', function () {
  assert.equal(SG.sanitizeRank('C'), 'C');
  assert.equal(SG.sanitizeRank('SSS'), 'SSS');
  assert.equal(SG.sanitizeRank('AA'), 'AA');
});

test('sanitizeRank: invalid → C', function () {
  assert.equal(SG.sanitizeRank('INVALID'), 'C');
  assert.equal(SG.sanitizeRank(null), 'C');
  assert.equal(SG.sanitizeRank(undefined), 'C');
  assert.equal(SG.sanitizeRank('SSS-shenanigan'), 'C');
  assert.equal(SG.sanitizeRank(''), 'C');
});

test('sanitizeCard: drops unknown fields, applies defaults', function () {
  var out = SG.sanitizeCard({ name: 'Тест', rank: 'SSS', badProto: { evil: true } }, 1);
  assert.equal(out.name, 'Тест');
  assert.equal(out.rank, 'SSS');
  assert.equal(out.badProto, undefined, 'unknown fields are dropped');
  assert.equal(typeof out.id, 'number');
});

test('sanitizeCard: rank normalisation', function () {
  var out = SG.sanitizeCard({ rank: 'INVALID' }, 1);
  assert.equal(out.rank, 'C');
});

test('sanitizeCard: stat whitelist', function () {
  var out1 = SG.sanitizeCard({ stat: 'ZZZ' }, 1);
  assert.equal(out1.stat, 'str');
  var out2 = SG.sanitizeCard({ stat: 'int' }, 1);
  assert.equal(out2.stat, 'int');
});

test('sanitizeCard: numbers clamped', function () {
  var out = SG.sanitizeCard({
    masteryThreshold: 99999,   // outside 2..50
    streak: -5,                // below 0
    totalCompletions: 1e9,     // very high
  }, 1);
  assert.equal(out.masteryThreshold, 50, 'clamped to max');
  assert.equal(out.streak, 0, 'clamped to min');
  assert.equal(out.totalCompletions, 1000000, 'clamped to 1M max');
});

test('sanitizeCard: null/undefined input → safe defaults', function () {
  var out = SG.sanitizeCard(null, 1);
  assert.equal(out.rank, 'C');
  assert.equal(out.stat, 'str');
  assert.equal(out.id, 1);
});

test('sanitizeInventory: empty defaults', function () {
  var out = SG.sanitizeInventory(null, {}, 30);
  assert.deepEqual(out.backpack, []);
  assert.equal(out.maxSlots, 30);
  assert.equal(out.equipped.head, null);
});

test('sanitizeInventory: caps maxSlots 1..60', function () {
  var high = SG.sanitizeInventory(null, {}, 9999);
  assert.equal(high.maxSlots, 60);
  var low = SG.sanitizeInventory(null, {}, 0);
  assert.equal(low.maxSlots, 1);
});

test('sanitizeInventory: input.not_object → empty defaults', function () {
  var out = SG.sanitizeInventory('not an object', {}, 30);
  assert.deepEqual(out.backpack, []);
});

test('sanitizeInventory: backward-compat for missing catalog', function () {
  var out = SG.sanitizeInventory({ backpack: ['string'] }, undefined, 30);
  assert.deepEqual(out.backpack, []);
});

test('sanitizeCounter: clamps to range', function () {
  assert.equal(SG.sanitizeCounter(50, 1), 50);
  assert.equal(SG.sanitizeCounter(2e9, 1), 1000000000);
  assert.equal(SG.sanitizeCounter(0, 5), 5);
  assert.equal(SG.sanitizeCounter('not a number', 1), 1);
});

test('sanitizeCounter: minimum respected', function () {
  // minimum 100 enforced
  assert.equal(SG.sanitizeCounter(50, 100), 100);
  assert.equal(SG.sanitizeCounter(150, 100), 150);
});

test('exported arrays are correct', function () {
  assert.deepEqual(SG.RANK_PROGRESSION, ['C','CC','CCC','B','BB','BBB','A','AA','AAA','S','SS','SSS']);
  assert.deepEqual(SG.EQUIP_SLOTS, ['head','amulet','chest','cape','weapon','shield','ring1','ring2','boots']);
});

// ----------------------------------------------------------------
// NEW sanitizeHero tests (v46 — audit fix)
// ----------------------------------------------------------------

test('sanitizeHero: full happy path', function () {
  var out = SG.sanitizeHero({
    name: 'Странник', title: 'Тот кто встал', level: 5, xp: 100, xpToNext: 200,
    totalXp: 1000, hp: 80, maxHp: 80, isHollow: false,
    consecutivePerfectDays: 1, dailyCompletions: 2, dailySkips: 1,
    actionPoints: 5, lastSessionAt: 1700000000000,
    dailyUniqueStats: { str: 1 }, cardHistory: { c1: { count: 1 } }
  });
  assert.equal(out.name, 'Странник');
  assert.equal(out.level, 5);
  assert.deepEqual(out.dailyUniqueStats, { str: 1 });
});

test('sanitizeHero: CRITICAL #1 — unknown fields dropped, no Object.assign leak', function () {
  var out = SG.sanitizeHero({
    name: 'X', level: 1,
    evilFlag: '<script>alert(1)</script>',
    internalVersion: 999,
    fakeLargeNumber: 1e18,
    customStat: { wisdom: 200 }
  });
  assert.equal(out.evilFlag, undefined, 'must NOT leak');
  assert.equal(out.internalVersion, undefined, 'must NOT leak');
  assert.equal(out.customStat, undefined, 'must NOT leak');
  // only whitelisted keys present
  var allowed = ['name','title','level','xp','xpToNext','totalXp','hp','maxHp',
                'isHollow','consecutivePerfectDays','dailyCompletions','dailySkips',
                'actionPoints','lastSessionAt','dailyUniqueStats','cardHistory',
                'lastWeeklyReport','shards','flasks',
                'estus','estusUsedToday','lastEstusReset'];
  Object.keys(out).forEach(function(k) {
    assert.ok(allowed.indexOf(k) !== -1, 'unexpected key leaked: ' + k);
  });
});

test('sanitizeHero: numeric clamps applied', function () {
  var out = SG.sanitizeHero({
    level: 9999, xp: -50, hp: 1e9, maxHp: -10,
    consecutivePerfectDays: 1e6
  });
  assert.equal(out.level, 99, 'level clamped to 99');
  assert.equal(out.xp, 0, 'xp clamped to 0');
  assert.equal(out.hp, 1e6, 'hp clamped to 1e6 max');
  assert.equal(out.maxHp, 1, 'maxHp >= 1');
  assert.equal(out.consecutivePerfectDays, 1000);
});

test('sanitizeHero: null/undefined input → safe defaults', function () {
  var out = SG.sanitizeHero(null);
  assert.equal(out.level, 1);
  assert.equal(out.xp, 0);
  assert.equal(out.maxHp, 80, 'default maxHp = 80');
  assert.equal(out.shards, 0, 'default shards = 0');
  assert.equal(out.flasks, 0, 'default flasks = 0');
  assert.equal(typeof out.lastSessionAt, 'number');
});

test('sanitizeHero: passes through raw string (escaping is render-layer responsibility)', function () {
  // safeString preserves the raw string UI-side; HTML escaping happens
  // at render via esc()/textContent. Document this contract so a future
  // change doesn't assume sanitize strips HTML — that would mask XSS
  // regressions in render layer.
  var out = SG.sanitizeHero({ name: '<script>x</script>' });
  assert.equal(typeof out.name, 'string');
  // *contains* the script tag — defense is at render time, see app.js esc()
  assert.ok(out.name.indexOf('<script>') !== -1, 'sanitize keeps string; defense is render-time esc()');
  assert.ok(out.name.length <= 40, 'clamped to maxLen 40');
});

// ----------------------------------------------------------------
// NEW sanitizeGoals tests
// ----------------------------------------------------------------

test('sanitizeGoals: not-array → empty', function () {
  assert.deepEqual(SG.sanitizeGoals(null), []);
  assert.deepEqual(SG.sanitizeGoals('string'), []);
  assert.deepEqual(SG.sanitizeGoals(undefined), []);
});

test('sanitizeGoals: invalid type → short fallback', function () {
  var out = SG.sanitizeGoals([{ name: 'X', type: 'EVIL_TYPE', deadline: '2026-12-31' }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'short');
  assert.equal(out[0].name, 'X');
});

test('sanitizeGoals: invalid deadline → tomorrow fallback', function () {
  var out = SG.sanitizeGoals([{ deadline: 'not a date' }]);
  assert.equal(typeof out[0].deadline, 'string');
  assert.ok(Date.parse(out[0].deadline) > Date.now());
});

test('sanitizeGoals: missing steps → auto-generates', function () {
  var out = SG.sanitizeGoals([{ name: 'X', deadline: '2026-12-31' }]);
  assert.equal(out[0].steps.length, 1);
  assert.equal(out[0].steps[0].text, 'Шаг 1');
});

test('sanitizeGoals: steps is array of {text, done}', function () {
  var out = SG.sanitizeGoals([{ name: 'X', deadline: '2026-12-31',
    steps: [{ text: 'Купить', done: true }, { evil: 1 }, 'string'] }]);
  // First step kept, non-object cleaned, string also cleaned
  assert.equal(out[0].steps.length, 3);
  assert.equal(out[0].steps[0].text, 'Купить');
  assert.equal(out[0].steps[0].done, true);
  assert.equal(out[0].steps[1].text, 'Шаг 2', 'non-object becomes default');
  assert.equal(out[0].steps[2].text, 'Шаг 3', 'string becomes default');
});

test('sanitizeGoals: hard cap 200 entries', function () {
  var goals = [];
  for (var i = 0; i < 300; i++) goals.push({ name: 'g' + i, deadline: '2026-12-31' });
  var out = SG.sanitizeGoals(goals);
  assert.equal(out.length, 200, 'hard cap at 200');
});

test('sanitizeGoals: stat whitelist', function () {
  var out = SG.sanitizeGoals([{ stat: 'evil_stat', name: 'X', deadline: '2026-12-31' }]);
  assert.equal(out[0].stat, 'str');
});

// ----------------------------------------------------------------
// NEW sanitizeXpHistory tests
// ----------------------------------------------------------------

test('sanitizeXpHistory: not-array → empty', function () {
  assert.deepEqual(SG.sanitizeXpHistory(null), []);
});

test('sanitizeXpHistory: drops malformed entries', function () {
  var out = SG.sanitizeXpHistory([
    { date: '2026-06-24', xp: 100 },     // OK
    { date: '2026-06-25', xp: -100 },    // xp clamped to 0
    { xp: 100 },                         // no date → drop
    'string',                            // wrong type → drop
    null,
    { date: '2026-06-26', xp: 99999999999 }, // xp clamped
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].xp, 100);
  assert.equal(out[1].xp, 0);
  assert.equal(out[2].xp, 100000000, 'clamped to 1e8 max');
});

test('sanitizeXpHistory: hard cap 366 (1 year)', function () {
  var entries = [];
  for (var i = 0; i < 500; i++) entries.push({ date: '2026-01-01', xp: 1 });
  var out = SG.sanitizeXpHistory(entries);
  assert.equal(out.length, 366);
});

// ----------------------------------------------------------------
// NEW sanitizeBossKills tests
// ----------------------------------------------------------------

test('sanitizeBossKills: defaults when null/non-object', function () {
  assert.deepEqual(SG.sanitizeBossKills(null), { snake: 0, social: 0, chimera: 0 });
  assert.deepEqual(SG.sanitizeBossKills(undefined), { snake: 0, social: 0, chimera: 0 });
});

test('sanitizeBossKills: clamps negatives and overflows', function () {
  var out = SG.sanitizeBossKills({ snake: -10, social: 1e10, chimera: 5 });
  assert.equal(out.snake, 0);
  assert.equal(out.social, 1000000, 'clamped to 1M');
  assert.equal(out.chimera, 5);
});

test('sanitizeBossKills: drops unknown boss names', function () {
  var out = SG.sanitizeBossKills({ snake: 5, evil: 999, dragon: 999 });
  // output must be exactly 3 known keys
  var keys = Object.keys(out).sort();
  assert.deepEqual(keys, ['chimera','snake','social']);
});

test('sanitizeGoal round-trips a valid goal', () => {
  const goal = guards.sanitizeGoal({
    id: 7, type: 'medium', name: 'Выучить главу', desc: 'Прочитать и законспектировать',
    deadline: 1756000000000, totalSteps: 3, currentStep: 2,
    steps: [{ text: 'Прочитать', done: true }, { text: 'Конспект', done: true }, { text: 'Повторить', done: false }],
    stat: 'int', xp: 80, dmg: 12, statBonus: 2,
    completed: false, failed: false, createdAt: 1755000000000, lastStepAt: 1755000100000
  }, 1);

  assert.equal(goal.id, 7);
  assert.equal(goal.type, 'medium');
  assert.equal(goal.name, 'Выучить главу');
  assert.equal(goal.desc, 'Прочитать и законспектировать');
  assert.equal(goal.deadline, 1756000000000);
  assert.equal(goal.totalSteps, 3);
  assert.equal(goal.currentStep, 2);
  assert.equal(goal.steps.length, 3);
  assert.deepEqual(goal.steps[0], { text: 'Прочитать', done: true });
  assert.equal(goal.stat, 'int');
  assert.equal(goal.xp, 80);
  assert.equal(goal.dmg, 12);
  assert.equal(goal.completed, false);
  assert.equal(goal.failed, false);

  // JSON round-trip stability (persisted shape survives reload)
  const again = guards.sanitizeGoal(JSON.parse(JSON.stringify(goal)), 1);
  assert.deepEqual(again, goal);
});

test('sanitizeGoal rejects junk input with safe defaults', () => {
  const empty = guards.sanitizeGoal(null, 5);
  assert.equal(empty.id, 5);
  assert.equal(empty.type, 'short');
  assert.equal(empty.name, 'Безымянная цель');
  assert.equal(empty.desc, '');
  assert.equal(empty.deadline, null);
  assert.equal(empty.totalSteps, 3);
  assert.equal(empty.steps.length, 3);
  assert.equal(empty.completed, false);
  assert.equal(empty.failed, false);

  const junk = guards.sanitizeGoal({
    id: -3, type: 'impossible', stat: 'luck', xp: -50, dmg: 9999,
    currentStep: 99, steps: 'nope', deadline: 'garbage', completed: 'yes'
  }, 1);
  assert.equal(junk.id, 1);
  assert.equal(junk.type, 'short');
  assert.equal(junk.stat, 'str');
  assert.equal(junk.xp, 0);
  assert.equal(junk.dmg, 100);
  assert.equal(junk.currentStep, 3);
  assert.equal(junk.steps.length, 3);
  assert.equal(junk.deadline, null);
  assert.equal(junk.completed, false);
});

test('sanitizeCard round-trips lastFailDay day-key', () => {
  const card = guards.sanitizeCard({ id: 1, lastFailDay: '2026-08-25' }, 1);
  assert.equal(card.lastFailDay, '2026-08-25');
  assert.equal(guards.sanitizeCard({ id: 1, lastFailDay: 'tomorrow' }, 1).lastFailDay, null);
  assert.equal(guards.sanitizeCard({}, 1).lastFailDay, null);
});

test('sanitizeCard rejects inherited stat names like toString', () => {
  const card = guards.sanitizeCard({ id: 1, stat: 'toString' }, 1);
  assert.equal(card.stat, 'str');
});

test('sanitizeGoal rejects inherited goal types like constructor', () => {
  const goal = guards.sanitizeGoal({ id: 1, type: 'constructor' }, 1);
  assert.equal(goal.type, 'short');
});

test('sanitizeGoal truncates oversized strings and arrays', () => {
  const goal = guards.sanitizeGoal({
    id: 1,
    name: 'И'.repeat(500),
    desc: 'Д'.repeat(2000),
    totalSteps: 99,
    steps: Array.from({ length: 99 }, (_, i) => ({ text: 'Ш'.repeat(1000), done: i % 2 === 0 })),
    xp: 999999999,
    dmg: -10
  }, 1);

  assert.equal(goal.name.length, 120);
  assert.equal(goal.desc.length, 500);
  assert.equal(goal.totalSteps, 50);
  assert.equal(goal.steps.length, 50);
  assert.ok(goal.steps.every(s => s.text.length <= 300));
  assert.equal(goal.xp, 100000);
  assert.equal(goal.dmg, 0);
});
