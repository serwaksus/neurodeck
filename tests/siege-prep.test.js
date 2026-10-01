const test = require('node:test');
const assert = require('node:assert/strict');
// Campaign 2.0 C4: подготовка осады — подходы недели (Штурм/Осада/Хитрость), осадные ресурсы
// (таран −10% attrition, лестницы +5% к ratio), миграция v11→v12 (siege.rams/ladders).
// Дефолт без опций/выбора = прежняя формула SPEC байт-в-байт — на этом держатся плейтесты
// strongholds 5.x–6.x, acceptance и parity-пины (правило 13 очереди D–H).
const SM = require('../js/stronghold-model.js');
const SG = require('../js/state-guards.js');
const DATA = require('../js/stronghold-data.js');
globalThis.StrongholdData = DATA; // catalog() модели
globalThis.STATE_GUARDS = SG;
globalThis.window = globalThis;
const S = require('../js/storage.js');
const IV = S.__storageInternals;

// ----------------------------------------------------------------
// Подход недели — чистые модификаторы (CAMPAIGN-2.0.md §3)
// ----------------------------------------------------------------

test('C4 подходы: каталог трёх id, мета неизвестного → «Штурм»', () => {
    assert.deepEqual(Object.keys(SM.SIEGE_APPROACHES).sort(), ['assault', 'siege', 'trick']);
    assert.equal(SM.approachMeta('nonsense').name, SM.approachMeta('assault').name, 'неизвестный id = норма');
    assert.equal(SM.approachMeta(undefined).name, SM.approachMeta('assault').name);
});

test('C4 «Осада»: сила врага ×0.8, гнев +1; «Штурм»/«Хитрость»/мусор — норма', () => {
    assert.equal(SM.approachEnemyMult('siege'), 0.8);
    assert.equal(SM.approachWrathDelta('siege'), 1);
    for (const id of ['assault', 'trick', 'bogus', null, undefined]) {
        assert.equal(SM.approachEnemyMult(id), 1, String(id) + ': enemyMult 1');
        assert.equal(SM.approachWrathDelta(id), 0, String(id) + ': wrath 0');
    }
});

test('C4 «Хитрость»: гарнизон врага ×0.9 ТОЛЬКО в провинции 3', () => {
    assert.equal(SM.approachGarrisonMult('trick', 3), 0.9);
    assert.equal(SM.approachGarrisonMult('trick', '3'), 0.9, 'провинция как строка тоже матчится');
    for (const prov of [1, 2, 4]) assert.equal(SM.approachGarrisonMult('trick', prov), 1, 'пров. ' + prov + ' без бонуса');
    for (const id of ['assault', 'siege', 'bogus']) assert.equal(SM.approachGarrisonMult(id, 3), 1, String(id) + ' не влияет на гарнизон');
});

// ----------------------------------------------------------------
// Осадные ресурсы в assaultOutcome (opt-in)
// ----------------------------------------------------------------

test('C4 дефолт: без ram/ladder формула SPEC не меняется (пин)', () => {
    assert.equal(SM.assaultOutcome(400, 100, { agi: 0 }).attritionPct, 0.08, 'ratio 4 → clamp 0.08');
    assert.equal(SM.assaultOutcome(200, 100, { agi: 0 }).attritionPct, 0.15, 'ratio 2 → 0.30/2');
    assert.equal(SM.assaultOutcome(50, 100, { rand: () => 0 }).attritionPct, 0.10, 'поражение: 10% при rand 0');
    assert.equal(SM.assaultOutcome(50, 100, { rand: () => 0.999 }).attritionPct > 0.29, true, 'поражение: до 30%');
});

test('C4 лестницы: +5% к ratio — паритет (atk=def) становится победой, attrition по формуле', () => {
    const base = SM.assaultOutcome(100, 100, { agi: 0 });
    assert.equal(base.win, false, 'без лестниц ratio 1.0 — не победа');
    const lad = SM.assaultOutcome(100, 100, { agi: 0, ladder: true });
    assert.equal(lad.win, true, 'ratio 1.05 > 1');
    assert.ok(Math.abs(lad.ratio - 1.05) < 1e-9, 'ratio ровно ×1.05');
    assert.ok(Math.abs(lad.attritionPct - Math.min(0.30, 0.30 / 1.05)) < 1e-9, 'attrition = clamp(0.30/1.05)');
});

test('C4 таран: attrition ×0.9 в обеих ветвях', () => {
    const winBase = SM.assaultOutcome(200, 100, { agi: 0 });
    const winRam = SM.assaultOutcome(200, 100, { agi: 0, ram: true });
    assert.ok(Math.abs(winRam.attritionPct - winBase.attritionPct * 0.9) < 1e-9, 'победа: −10%');
    const loseBase = SM.assaultOutcome(50, 100, { rand: () => 0.5 });
    const loseRam = SM.assaultOutcome(50, 100, { rand: () => 0.5, ram: true });
    assert.ok(Math.abs(loseRam.attritionPct - loseBase.attritionPct * 0.9) < 1e-9, 'поражение: −10%');
    assert.equal(SM.assaultOutcome(200, 100, { ram: 'yes' }).attritionPct, winBase.attritionPct, 'не-булеан = опции нет');
});

test('C4 таран+лестницы вместе: множители независимы (лестница → ratio, таран → attrition)', () => {
    const both = SM.assaultOutcome(100, 100, { agi: 0, ram: true, ladder: true });
    const ladOnly = SM.assaultOutcome(100, 100, { agi: 0, ladder: true });
    assert.ok(Math.abs(both.attritionPct - ladOnly.attritionPct * 0.9) < 1e-9);
});

// ----------------------------------------------------------------
// Схема v12: sanitizeSiege + миграция siege.rams/ladders
// ----------------------------------------------------------------

test('C4 sanitizeSiege: rams/ladders — счётчики 0..999, дефолт 0', () => {
    assert.equal(SG.sanitizeSiege(null).rams, 0);
    assert.equal(SG.sanitizeSiege({}).ladders, 0);
    assert.deepEqual(SG.sanitizeSiege({ rams: 3, ladders: 5 }), Object.assign(SG.sanitizeSiege({}), { rams: 3, ladders: 5 }));
    assert.equal(SG.sanitizeSiege({ rams: 1e9, ladders: -2 }).rams, 999, 'верхний клэмп');
    assert.equal(SG.sanitizeSiege({ rams: 1e9, ladders: -2 }).ladders, 0, 'нижний клэмп');
    assert.equal(SG.sanitizeSiege({ rams: '4', ladders: 2.7 }).rams, 4, 'строка/дробь → число');
    assert.equal(SG.sanitizeSiege({ rams: '4', ladders: 2.7 }).ladders, 3);
});

test('C4 миграция v11→v12: счётчики появляются с дефолтом 0, v = 14 (C5+P11 поверх)', () => {
    const d = { v: 11, hero: {}, forged: [], siege: { week: 3, lastResult: 'fail', wkSkips: 1 } };
    IV.migrateSyncData(d);
    assert.equal(d.v, 14);
    assert.equal(d.siege.week, 3, 'поле недели не тронуто');
    assert.equal(d.siege.rams, 0);
    assert.equal(d.siege.ladders, 0);
    assert.equal(d.siege.lastResult, 'fail');
    assert.equal(d.siege.approach, 'assault', 'P11: v14 добавляет подход с дефолтом-нормой');
});

test('C4 миграция v12: существующие счётчики сохраняются, мусор клэмпится', () => {
    const d = { v: 11, siege: { week: 2, rams: 4, ladders: 2 } };
    IV.migrateSyncData(d);
    assert.equal(d.siege.rams, 4);
    assert.equal(d.siege.ladders, 2);
    const junk = { v: 11, siege: { week: 2, rams: -5, ladders: 'мусор' } };
    IV.migrateSyncData(junk);
    assert.equal(junk.siege.rams, 0);
    assert.equal(junk.siege.ladders, 0);
    const noSiege = { v: 11 };
    IV.migrateSyncData(noSiege);
    assert.equal(noSiege.siege.rams, 0, 'без siege-объекта — создаётся с дефолтами');
});

test('C4 миграция v12: idempotent — повторный прогон не меняет счётчики', () => {
    const d = { v: 11, siege: { week: 5, rams: 7, ladders: 1 } };
    IV.migrateSyncData(d);
    const snap = JSON.stringify(d.siege);
    IV.migrateSyncData(d);
    assert.equal(JSON.stringify(d.siege), snap);
});

test('C4→C5 цепочка v7: полный путь миграций доводит осадный склад до текущей схемы', () => {
    const d = {
        v: 7, hero: { name: 'Мигрант', level: 5, gold: 100 }, stats: {}, forged: [], goals: [],
        inventory: { backpack: [], equipped: {} }, tasks: [], tractState: { regions: 2, building: null }
    };
    IV.migrateSyncData(d);
    assert.equal(d.v, 14);
    assert.equal(d.siege.rams, 0);
    assert.equal(d.siege.ladders, 0);
    assert.equal(d.siege.week, 1);
    assert.equal(d.siege.approach, 'assault', 'P11: подход в конце цепочки — норма');
});

// ----------------------------------------------------------------
// P11: персистентный подход недели (siege.approach, схема v14)
// ----------------------------------------------------------------

test('P11 персистентность: выбор игрока переживает sanitize (roundtrip сейва)', () => {
    for (const choice of ['siege', 'trick']) {
        const saved = SG.sanitizeSiege({ week: 4, rams: 1, approach: choice });
        const reloaded = SG.sanitizeSiege(saved); // reload = applySyncData → sanitizeSiege
        assert.equal(reloaded.approach, choice, 'подход «' + choice + '» дожил до новой сессии');
    }
    assert.equal(SG.sanitizeSiege(SG.sanitizeSiege({ approach: 'siege' })).approach, 'siege', 'sanitize∘sanitize стабилен');
});

test('P11 персистентность: v13-сейв с уже выбранным «Осадой» (поле приехало из будущего) не теряет выбор', () => {
    const d = { v: 13, siege: { week: 2, approach: 'siege', rams: 3 } };
    IV.migrateSyncData(d);
    assert.equal(d.siege.approach, 'siege', 'валидное значение миграция не перетирает');
    assert.equal(SG.sanitizeSiege(d.siege).approach, 'siege', 'и sanitize вслед за миграцией тоже');
});

// ----------------------------------------------------------------
// Каталог провинций: «Хитрость» бьёт только по целям пров. 3 (интеграционная проверка данных)
// ----------------------------------------------------------------

test('C4 данные: в провинции 3 есть штурмуемые цели — «Хитрость» не пустышка', () => {
    const prov3 = DATA.STRONGHOLDS.filter((s) => s.prov === 3);
    assert.ok(prov3.length >= 3, 'в каталоге есть твердыни Гнили');
    prov3.forEach((s) => assert.ok(s.total > 0));
});
