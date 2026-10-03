'use strict';
// ============================================================
// tests/c3-legacy.test.js — Кампания 3.0: наследие твердынь 2.0 на РЕАЛЬНЫХ сейвах v14
// (план §6 «Наследие» + Verification «фикстуры v14»; аудит 2026-10-03: наследие было
// покрыто только синтетическими объектами). Фикстуры — существующий сидер e2e
// (tests/e2e/seed.cjs) и фабрика QA-3 (tests/fixtures/saves-factory.cjs, v6..v10),
// доведённые до v14 НАСТОЯЩЕЙ миграцией (migrateSyncData) и настоящими санитайзерами
// конвейера storage (sanitizeStrongholds/sanitizeArmy — те же вызовы, что applySyncData).
// Контракт: legacyFromV14 + newState с наследием — лимиты (золото ≤ 2000, залы за каждые
// 5 твердынь ≤ 3, навыки за 3 боссов ≤ 4, 10 % армии ≤ 600 силы) и устойчивость к
// неполным/пустым/повреждённым сейвам. Поля «доктрина-наследие» в плане нет — не тестируется.
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');

const seedSave = require('./e2e/seed.cjs');              // реальный сид e2e (v10)
const factory = require('./fixtures/saves-factory.cjs'); // реальная фабрика QA-3 (v6..v10)
const SG = require('../js/state-guards.js');
const DATA = require('../js/stronghold-data.js');
globalThis.StrongholdData = DATA;
globalThis.STATE_GUARDS = SG;
globalThis.window = globalThis;
const S = require('../js/storage.js');
const IV = S.__storageInternals;
const D = require('../js/campaign3/c3-data.js');
const M = require('../js/campaign3/c3-model.js');
const RT = require('../js/campaign3/c3-runtime.js');

const L = D.LEGACY; // { GOLD_MAX: 2000, CAPTURED_PER_HALL: 5, HALL_MAX: 3, BOSSES_PER_SKILL: 3, ARMY_POWER_MAX: 600, LVL_MAX: 4, ... }
assert.equal(IV.SCHEMA_VERSION, 14, 'схема продукта — v14');

// Фикстура → настоящий v14: реальная миграция storage + те же санитайзеры, что applySyncData (js/storage.js)
function toV14(save) {
    const v14 = IV.migrateSyncData(JSON.parse(JSON.stringify(save)));
    assert.equal(v14.v, 14, 'миграция доводит сейв до схемы продукта');
    if (Array.isArray(v14.strongholds)) v14.strongholds = SG.sanitizeStrongholds(v14.strongholds, DATA);
    if (v14.army && typeof v14.army === 'object') v14.army = SG.sanitizeArmy(v14.army);
    return v14;
}

// Зеркало browserEnv.legacySource (js/campaign3/c3-runtime.js): поля, которые рантайм читает
// из живых глобалов после применения сейва v14 (STATS/strongholds/army/HERO.bosses/season/throne)
function legacySourceOf(save) {
    try {
        let cap = 0; (save.strongholds || []).forEach((x) => { if (x && x.captured) cap++; });
        return {
            stats: save.stats || {},
            captured: cap,
            units: (save.army && save.army.units) || {},
            bosses: (save.hero && save.hero.bosses && save.hero.bosses.defeated) ? save.hero.bosses.defeated.length : 0,
            seasonNum: (save.season && save.season.num) ? save.season.num : 1,
            throne: save.throne || 0,
            ascension: (save.hero && save.hero.ascension) || 0
        };
    } catch (e) { return {}; }
}
function withinLimits(lg, label) { // инварианты плана §6 на любом входе
    assert.ok(Number.isFinite(lg.g) && lg.g >= 0 && lg.g <= L.GOLD_MAX, label + ': золото ≤ ' + L.GOLD_MAX);
    assert.ok(lg.hall.reduce((a, b) => a + b, 0) <= L.HALL_MAX, label + ': залов ≤ ' + L.HALL_MAX);
    assert.ok(lg.sk.reduce((a, b) => a + b, 0) <= 4, label + ': навыков ≤ 4');
    assert.ok(Number.isFinite(lg.a) && lg.a >= 0 && lg.a <= L.ARMY_POWER_MAX / 8, label + ': ополченцев ≤ 10 % армии (600/8)');
    lg.l.forEach((v, i) => assert.ok(Number.isFinite(v) && v >= 1 && v <= L.LVL_MAX, label + ': уровень героя ' + i + ' в 1..' + L.LVL_MAX));
}

// ============================================================
// 1. Фикстуры реальны: сид e2e и фабрика QA миграцией доходят до v14
// ============================================================
test('фикстуры: сид e2e и фабрика QA-3 v6..v10 — настоящая миграция до v14 без потерь твердынь/армии', () => {
    const seed = toV14(seedSave());
    assert.equal(seed.strongholds.length, 20);
    assert.equal(seed.army.units.t1, 5, 'сид e2e: армия по умолчанию 5×7 тиров пережила миграцию');
    for (let v = 6; v <= 10; v++) {
        const d = toV14(factory.validSave({ version: v }));
        assert.equal(d.v, 14, 'v' + v + ' → v14');
        if (v >= 8) {
            assert.equal(d.strongholds.length, 20);
            assert.equal(d.strongholds.filter((x) => x.captured).length, 6, 'v' + v + ': захваты пережили миграцию');
            assert.equal(d.army.units.t7, 5);
        }
        withinLimits(M.legacyFromV14(legacySourceOf(d)), 'v' + v);
    }
});

// ============================================================
// 2. Сценарий c3 из e2e (сид с обнулённой армией): наследие пустое — рантайм его не пишет
// ============================================================
test('сид e2e без армии (сценарии c3): наследие пустое, ensure() его отбрасывает — ключа lg в состоянии нет', () => {
    const src = legacySourceOf(toV14(seedSave({ army: { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 3 } })));
    const lg = M.legacyFromV14(src);
    assert.equal(lg.g, 0);
    assert.deepEqual(lg.hall, [0, 0, 0, 0]);
    assert.deepEqual(lg.sk, [0, 0, 0, 0]);
    assert.equal(lg.a, 0);
    const nd = RT.create({ // как в браузере: legacySource читает живые глобалы, ensure() решает «нести/не нести»
        getFlag: () => true, dayKey: () => '2026-10-05', legacySource: () => src,
        cardsBySphere: () => [0, 0, 0, 0], save() {}, render() {}, toast() {}
    });
    nd.onDeed({ kind: 'habit', stat: 'str', rank: 'C' }); // первое дело создаёт состояние
    assert.equal(nd.getState().lg, undefined, 'пустое наследие не пишется (Ф5)');
});

// ============================================================
// 3. Наследие среднего игрока (фабрика QA: 6 захватов, трон 2) — точные значения
// ============================================================
test('v14 средней прокачки: казна 600 (300×трон), 1 зал за 5+ захватов, 75 ополченцев (кап 10 % армии)', () => {
    const src = legacySourceOf(toV14(factory.validSave({ version: 10 })));
    assert.equal(src.captured, 6);
    assert.equal(src.throne, 2);
    const lg = M.legacyFromV14(src);
    assert.equal(lg.g, 600, 'min(2000, 100×(1−1) + 300×2 + 300×0)');
    assert.deepEqual(lg.hall, [1, 0, 0, 0], 'floor(6/5) = 1 зал, порядок Тело→Разум→Дух');
    assert.deepEqual(lg.sk, [0, 0, 0, 0], 'боссов нет — навыков нет');
    assert.equal(lg.a, 75, 'армия 5×7 тиров = 10295 силы → 10 % → кап 600 → 600/8');
    assert.deepEqual(lg.l, [1, 1, 1, 1], 'статы по 3 (база) → уровни 1');
    withinLimits(lg, 'средний');
});

test('newState с наследием среднего игрока: бонусы применяются один раз и в границах', () => {
    const lg = M.legacyFromV14(legacySourceOf(toV14(factory.validSave({ version: 10 }))));
    const s = M.newState('2026-10-05', lg);
    assert.equal(s.res.g, D.C.START_GOLD + 600, 'казна = старт + наследие');
    assert.equal(s.towns[0].hall, 1);
    assert.equal(s.towns.filter((t) => t.hall === 0).length, 3, 'зал только у Кузни (Тело)');
    assert.equal(s.heroes[0].army.t1, D.C.START_ARMY.t1 + 75, 'ополченцы каждому герою');
    assert.ok(s.heroes.every((h) => h.lvl === 1 && h.sk === 0));
    assert.deepEqual(s.lg, { g: 600, hall: [1, 0, 0, 0], sk: [0, 0, 0, 0], a: 75, l: [1, 1, 1, 1] }, 'lg-снапшот для экрана «Наследие»');
});

// ============================================================
// 4. Максимальный реальный сейв: все лимиты — по_CAPам, не больше
// ============================================================
test('максимальный v14 (20 захватов, трон 10, сезон 12, вознесение 3, 15 боссов): всё по потолкам', () => {
    const d = toV14(factory.validSave({ version: 10 }));
    d.strongholds.forEach((sh) => { sh.captured = true; });            // реальная концовка карты 2.0
    d.throne = 10; d.season.num = 12;
    d.hero.ascension = 3;                                                // форма HERO.ascension (bossEscalation, js/app.js:2131)
    d.hero.bosses = { defeated: Array.from({ length: 15 }, (_, i) => i + 1), activeNum: null, phase: 0, attemptDay: null, closedDay: null };
    d.army.units = { t1: 500, t2: 500, t3: 500, t4: 500, t5: 500, t6: 500, t7: 500 };
    Object.keys(d.stats).forEach((k) => { d.stats[k].value = 40; });
    const lg = M.legacyFromV14(legacySourceOf(d));
    assert.equal(lg.g, 2000, 'казна упирается в GOLD_MAX, а не в 100×11+300×10+300×3 = 5000');
    assert.deepEqual(lg.hall, [1, 1, 1, 0], 'floor(20/5) = 4 → HALL_MAX 3');
    assert.deepEqual(lg.sk, [1, 1, 1, 1], 'ceil(15/3) = 5 → потолок 4');
    assert.equal(lg.a, 75, 'армия 1.03 млн силы → 10 % → кап 600');
    assert.deepEqual(lg.l, [4, 4, 4, 4], 'статы 40 → уровень 5 → LVL_MAX 4');
    withinLimits(lg, 'максимальный');
    const s = M.newState('2026-10-05', lg);
    assert.equal(s.res.g, D.C.START_GOLD + 2000);
    assert.equal(s.heroes[0].lvl, 4);
    assert.equal(s.heroes[3].sk, 1, 'навык от боссов — каждому герою до 4');
});

// ============================================================
// 5. Устойчивость: пустые, неполные, повреждённые сейвы
// ============================================================
test('пустой и мусорный источник: canonical-форма, нули, без исключений', () => {
    assert.deepEqual(M.legacyFromV14(null), { g: 0, hall: [0, 0, 0, 0], sk: [0, 0, 0, 0], a: 0, l: [1, 1, 1, 1] });
    assert.deepEqual(M.legacyFromV14({}), M.legacyFromV14(null));
    const lg = M.legacyFromV14({
        stats: { str: { value: 'много' }, int: { value: -5 }, wil: { value: 1e9 }, cha: null },
        captured: -7, units: { t1: 'x', t2: 1e12, t9: 999 }, bosses: 'много',
        seasonNum: 'завтра', throne: Infinity, ascension: -3
    });
    withinLimits(lg, 'мусор');
    assert.equal(lg.g, 0, 'отрицательные/NaN-поля не дают золота');
});

test('неполный v14 (нет армии/сезона/героя/статов) и повреждённый (strongholds:null, army:строка): без исключений', () => {
    const d = toV14(factory.validSave({ version: 10 }));
    delete d.army; delete d.season; delete d.hero; delete d.stats; delete d.throne;
    withinLimits(M.legacyFromV14(legacySourceOf(d)), 'неполный');
    const raw = seedSave();
    raw.strongholds = null; raw.army = 'повреждено'; raw.hero = null; raw.season = 7;
    withinLimits(M.legacyFromV14(legacySourceOf(raw)), 'повреждённый'); // legacySourceOf зеркалит typeof-гварды рантайма
    assert.deepEqual(M.newState('2026-10-05', M.legacyFromV14(legacySourceOf(raw))).lg,
        { g: 0, hall: [0, 0, 0, 0], sk: [0, 0, 0, 0], a: 0, l: [1, 1, 1, 1] },
        'newState пишет canonical-нулевое lg; пустоту отбрасывает ensure() рантайма');
});

test('newState доверяет только canonical-наследию legacyFromV14 — на живом конвейере другой формы нет', () => {
    // контракт: legacyFromV14 ВСЕГДА возвращает полную форму — newState кладёт её в lg как есть
    const forms = [null, {}, legacySourceOf(toV14(seedSave())), legacySourceOf(toV14(factory.validSave({ version: 6 })))];
    forms.forEach((src) => {
        const s = M.newState('2026-10-05', M.legacyFromV14(src));
        withinLimits(s.lg, 'lg-снапшот');
    });
    assert.equal(M.newState('2026-10-05').lg, undefined, 'без наследия ключа lg нет');
});
