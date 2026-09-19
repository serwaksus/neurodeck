'use strict';
// Волна 2: юнит-тесты фич #41 (кровавая луна/странник), #8 (праздники), #55 (путь героя),
// #42 (дельты недели), #65 (помодоро-контракты), #49 (recovery твердынь), #71 (цель дня), #95 (контрштурм).
// Паттерн: экстрактор function-by-name из исходника app.js (brace counting, как integration.test.js)
// + new Function со стабами. Топ-левел app.js не исполняется.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const F = require('./fixtures/saves-factory.cjs');

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

// Собирает изолированный скоуп: вырезанные объявления + стабы, возвращает результат body.
function buildIn({ decls = [], stubs = {}, body }) {
    const src = decls.join('\n') + '\nreturn (' + body + ');';
    const keys = Object.keys(stubs);
    return new Function(...keys, src)(...keys.map((k) => stubs[k]));
}

// ----------------------------------------------------------------
// #41: buildDailyEvents — 7 событий, тёмная ветка строго в конец
// ----------------------------------------------------------------
test('wave2 #41: buildDailyEvents — 7 событий, порядок id стабильный', () => {
    const build = buildIn({
        decls: [extractFn('buildDailyEvents')],
        stubs: { capturedCount: () => 0 },
        body: 'buildDailyEvents'
    });
    const ev = build();
    assert.equal(ev.length, 7);
    assert.deepEqual(ev.map((e) => e.id),
        ['caravan', 'smith', 'market', 'ghostfree', 'quiet', 'bloodmoon', 'wanderer']);
});

test('wave2 #41: rollDailyEvent — детерминированные пины Math.random (старые 0-4, окно тёмных, restore)', () => {
    const roll = buildIn({
        decls: [extractFn('buildDailyEvents'), extractFn('rollDailyEvent')],
        stubs: { capturedCount: () => 0 },
        body: 'rollDailyEvent'
    });
    const orig = Math.random;
    try {
        const pin = (r) => { Math.random = () => r; };
        pin(0.0);  assert.equal(roll().id, 'caravan');
        pin(0.5);  assert.equal(roll().id, 'market');   // floor(0.5*5)=2 — старое окно по индексу
        pin(0.8);  assert.equal(roll().id, 'quiet');    // граница: r≤0.8 → floor(4.0)=4 (пин chaos 0.8→quiet жив)
        pin(0.85); assert.equal(roll().id, 'bloodmoon');
        pin(0.9);  assert.equal(roll().id, 'wanderer');
        pin(0.99); assert.equal(roll().id, 'quiet');    // пин chaos-харнеса 0.99→Тихий день сохранён
    } finally {
        Math.random = orig;
    }
    assert.equal(Math.random, orig, 'Math.random восстановлен');
});

// ----------------------------------------------------------------
// #8: holidayBonus — календарные праздники, ключ аргументом (без getMSKDayKey)
// ----------------------------------------------------------------
test('wave2 #8: holidayBonus — 01-01 tickMult 1.5 / 10-31 ghostsFree / 09-17 rewardMult 1.1 / прочее null', () => {
    const { holidayBonus, HOLIDAYS } = buildIn({
        decls: [extractBlock('var HOLIDAYS = {'), extractFn('holidayBonus')],
        body: '{ holidayBonus: holidayBonus, HOLIDAYS: HOLIDAYS }'
    });
    assert.equal(HOLIDAYS && Object.keys(HOLIDAYS).length, 3, 'в календаре 3 даты');
    assert.equal(holidayBonus('2027-01-01').tickMult, 1.5);
    assert.equal(holidayBonus('2026-10-31').ghostsFree, true);
    assert.equal(holidayBonus('2026-09-17').rewardMult, 1.1);
    assert.equal(holidayBonus('2026-09-18'), null);
});

// ----------------------------------------------------------------
// #71: dailyGoldGoal — 50 база + 10×captured, кап 200
// ----------------------------------------------------------------
test('wave2 #71: dailyGoldGoal — captured 0→50 / 10→150 / 20→200 (кап)', () => {
    const goal = (captured) => buildIn({
        decls: [extractFn('dailyGoldGoal')],
        stubs: { DAILY_GOLD_BASE: 50, capturedCount: () => captured, HERO: { ascension: 0 } },
        body: 'dailyGoldGoal()'
    });
    assert.equal(goal(0), 50);
    assert.equal(goal(10), 150);
    assert.equal(goal(20), 200, 'кап 200');
});

// ----------------------------------------------------------------
// #55: heroPathInfo — высший стат, ничья → end/Страж
// ----------------------------------------------------------------
test('wave2 #55: heroPathInfo — str→Воин, ничья str/end→Страж, agi→Следопыт', () => {
    const info = (vals) => buildIn({
        decls: [extractFn('heroPathInfo')],
        stubs: { STATS: { str: { value: vals[0] }, end: { value: vals[1] }, agi: { value: vals[2] } } },
        body: 'heroPathInfo()'
    });
    assert.equal(info([9, 3, 2]).name, 'Воин');
    assert.equal(info([5, 5, 1]).name, 'Страж', 'ничья → end');
    assert.equal(info([2, 3, 8]).name, 'Следопыт');
});

// ----------------------------------------------------------------
// #49: capturedRecoveryPlan — через фабрику сейвов (endgame → порча → recovery)
// ----------------------------------------------------------------
test('wave2 #49: capturedRecoveryPlan — validSave v10: факт=снапшоту→null, порча на 2→восстановить, на 1→null', () => {
    const plan = buildIn({ decls: [extractFn('capturedRecoveryPlan')], body: 'capturedRecoveryPlan' });
    const save = F.validSave({ version: 10 });
    const snap = save.season.snapshot.captured; // 6 по фабрике
    const total = save.strongholds.length;
    assert.equal(snap, 6, 'фабрика: снапшот сезона captured=6');
    assert.equal(plan(snap, 6, total), null, 'факт совпадает — recovery не нужен');
    assert.deepEqual(plan(snap, 4, total), { lost: 2, restoreTo: 6 }, 'потеряно ≥2 — восстановить до снапшота');
    assert.equal(plan(snap, 5, total), null, 'потеряна 1 — не сработать');
});

// ----------------------------------------------------------------
// #42: weeklyDeltaHtml — дельты vs прошлая неделя
// ----------------------------------------------------------------
test('wave2 #42: weeklyDeltaHtml — другая неделя содержит ↑, та же неделя — пусто', () => {
    const HERO = { gold: 300, totalXp: 1000, weeklyPrev: { gold: 100, xp: 800, completions: 3, week: 4 } };
    const FORGED = [{ totalCompletions: 5 }];
    const html = buildIn({
        decls: [extractFn('weeklyDeltaHtml')],
        stubs: { HERO, FORGED },
        body: 'weeklyDeltaHtml(5)'
    });
    assert.ok(html.includes('↑'), 'рост казны → стрелка вверх');
    assert.ok(html.includes('vs прошлая неделя'));
    assert.equal(buildIn({ decls: [extractFn('weeklyDeltaHtml')], stubs: { HERO, FORGED }, body: 'weeklyDeltaHtml(4)' }), '',
        'та же неделя — блока нет');
});

// ----------------------------------------------------------------
// #95: canCounterSiege — fail + не использован + казна ≥100
// ----------------------------------------------------------------
test('wave2 #95: canCounterSiege — fail+100→true; retried→false; win→false; gold 99→false', () => {
    const can = (siege, gold) => buildIn({
        decls: [extractFn('canCounterSiege')],
        stubs: { siege, HERO: { gold } },
        body: 'canCounterSiege()'
    });
    assert.equal(can({ lastResult: 'fail', retriedThisWeek: false }, 100), true);
    assert.equal(can({ lastResult: 'fail', retriedThisWeek: true }, 100), false, 'уже использован');
    assert.equal(can({ lastResult: 'win', retriedThisWeek: false }, 100), false, 'поражения нет');
    assert.equal(can({ lastResult: 'fail', retriedThisWeek: false }, 99), false, 'мало золота');
});

// ----------------------------------------------------------------
// Source-контракты: интеграция фич в живые функции app.js
// ----------------------------------------------------------------
test('wave2 контракты: кровь в налогах/XP, праздник в XP, Хэллоуин в призраках, помодоро-ключи, reset контрштурма', () => {
    assert.ok(app.includes("bloodmoon') m *= 0.5"), 'taxMultiplier: кровавая луна ×0.5');
    assert.ok(extractFn('completeCard').includes('bloodMult * holidayRewardMult'),
        'completeCard: XP умножается на bloodMult и holidayRewardMult');
    assert.ok(extractFn('expireGhostTasks').includes('ghostFree') &&
        extractFn('expireGhostTasks').includes('holidayBonus'),
        'expireGhostTasks: ghostfree + Хэллоуин');
    assert.ok(app.includes('nd_pomodoro_'), 'помодоро: ключи localStorage');
    assert.ok(app.includes('siege.retriedThisWeek = false'), 'новая неделя сбрасывает контрштурм');
    assert.ok(app.includes('nd_dailgoaldone_'), 'дневная цель: однократный бонус за день');
});
