const test = require('node:test');
const assert = require('node:assert');
// Campaign 2.0 C3: правила провинций — каталог PROVINCES, чистые модификаторы stronghold-model
// (provinceIncomeMult/provinceUpkeepMult/provinceSiegeMult) и проводка provinceUpkeepMult в corruptionTick.
const SM = require('../js/stronghold-model.js');
const DATA = require('../js/stronghold-data.js');
globalThis.StrongholdData = DATA; // catalog() модели
const PROV = DATA.PROVINCES;

test('каталог PROVINCES: 4 записи, у каждой rule.text и mods {incomeMult, upkeepMult, siegeMult} в (0; 3]', () => {
    assert.ok(PROV && typeof PROV === 'object', 'PROVINCES экспортируется каталогом');
    [1, 2, 3, 4].forEach((p) => {
        const rec = PROV[p];
        assert.ok(rec && typeof rec === 'object', 'запись провинции ' + p);
        ['name', 'palette', 'threat', 'arc'].forEach((k) => assert.equal(typeof rec[k], 'string', p + '.' + k));
        assert.equal(typeof rec.rule.text, 'string', p + '.rule.text — строка для UI-панели');
        ['incomeMult', 'upkeepMult', 'siegeMult'].forEach((k) => {
            const v = rec.rule.mods[k];
            assert.ok(typeof v === 'number' && isFinite(v) && v > 0 && v <= 3, p + '.mods.' + k + ' = ' + v);
        });
    });
});

test('инвариант неактивных правил: active=false ⇒ mods нейтральны (объявленное ≠ применяемое)', () => {
    [1, 2, 3, 4].forEach((p) => {
        if (PROV[p].rule.active === false) {
            assert.deepEqual(PROV[p].rule.mods, { incomeMult: 1.0, upkeepMult: 1.0, siegeMult: 1.0 },
                'пров. ' + p + ': неактивное правило не должно менять экономику');
        }
    });
});

test('правила §2 CAMPAIGN-2.0: Хутора upkeep ×0.9; Пепел income ×1.1 и upkeep ×1.1; Крепости/Гниль нейтральны', () => {
    assert.equal(PROV[1].rule.mods.upkeepMult, 0.9);
    assert.equal(PROV[1].rule.mods.incomeMult, 1.0);
    assert.deepEqual(PROV[4].rule.mods, { incomeMult: 1.1, upkeepMult: 1.1, siegeMult: 1.0 });
    [2, 3].forEach((p) => assert.deepEqual(PROV[p].rule.mods, { incomeMult: 1.0, upkeepMult: 1.0, siegeMult: 1.0 }));
});

test('provinceIncomeMult: каталог (Пепел 1.1, остальные 1.0); провинция строкой; неизвестная — нейтрально', () => {
    assert.equal(SM.provinceIncomeMult(1), 1.0);
    assert.equal(SM.provinceIncomeMult(2), 1.0);
    assert.equal(SM.provinceIncomeMult(3), 1.0);
    assert.equal(SM.provinceIncomeMult(4), 1.1);
    assert.equal(SM.provinceIncomeMult('4'), 1.1, 'числовая строка провинции допустима');
    [0, 5, -1, 'x', undefined, null, NaN].forEach((p) => assert.equal(SM.provinceIncomeMult(p), 1, 'пров ' + p + ' → 1'));
});

test('provinceUpkeepMult: каталог (Хутора 0.9, Пепел 1.1); неизвестная провинция — нейтрально', () => {
    assert.equal(SM.provinceUpkeepMult(1), 0.9);
    assert.equal(SM.provinceUpkeepMult(2), 1.0);
    assert.equal(SM.provinceUpkeepMult(3), 1.0);
    assert.equal(SM.provinceUpkeepMult(4), 1.1);
    [0, 5, 'x', undefined, null].forEach((p) => assert.equal(SM.provinceUpkeepMult(p), 1, 'пров ' + p + ' → 1'));
});

test('provinceSiegeMult: в каталоге нейтрален у всех 4, но читает каталог (синтетический siegeMult 1.25 виден)', () => {
    [1, 2, 3, 4].forEach((p) => assert.equal(SM.provinceSiegeMult(p), 1.0, 'пров ' + p));
    const saved = globalThis.StrongholdData;
    try {
        globalThis.StrongholdData = { PROVINCES: { 2: { rule: { text: 'тест', mods: { incomeMult: 1, upkeepMult: 1, siegeMult: 1.25 } } } } };
        assert.equal(SM.provinceSiegeMult(2), 1.25, 'модификатор берётся из каталога, не заглушка');
        assert.equal(SM.provinceIncomeMult(2), 1, 'чужой ключ не задет');
    } finally {
        globalThis.StrongholdData = saved;
    }
});

test('robustness: каталог без PROVINCES / кривые значения mods → 1 (экономика не ломается)', () => {
    const saved = globalThis.StrongholdData;
    try {
        globalThis.StrongholdData = undefined;
        [1, 2, 3, 4].forEach((p) => {
            assert.equal(SM.provinceIncomeMult(p), 1);
            assert.equal(SM.provinceUpkeepMult(p), 1);
            assert.equal(SM.provinceSiegeMult(p), 1);
        });
        globalThis.StrongholdData = { PROVINCES: { 1: { rule: { text: 'кривой', mods: {
            incomeMult: NaN, upkeepMult: 0, siegeMult: 5 } } } } };
        assert.equal(SM.provinceIncomeMult(1), 1, 'NaN → 1');
        assert.equal(SM.provinceUpkeepMult(1), 1, '0 → 1');
        assert.equal(SM.provinceSiegeMult(1), 1, '5 (> капа 3) → 1');
        globalThis.StrongholdData = { PROVINCES: { 1: {} } };
        assert.equal(SM.provinceIncomeMult(1), 1, 'запись без rule → 1');
    } finally {
        globalThis.StrongholdData = saved;
    }
});

test('corruptionTick: opts.provinceUpkeepMult применяется к содержанию (может быть >1), без опции — совместимость', () => {
    const b = { zh1: { built: true, corruptionStage: 'ok', debtDays: 0 }, zh2: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    const base = DATA.BUILDINGS.zh1.upkeep + DATA.BUILDINGS.zh2.upkeep; // 3 + 8 = 11
    assert.equal(SM.corruptionTick(b, 0, 3, {}).upkeep, base, 'без опции — прежняя семантика (доктринальный кламп ≤1 не задет)');
    assert.equal(SM.corruptionTick(b, 0, 3, { provinceUpkeepMult: 0.9 }).upkeep, Math.round(base * 0.9), 'Хутора −10%');
    assert.equal(SM.corruptionTick(b, 0, 3, { provinceUpkeepMult: 1.1 }).upkeep, Math.round(base * 1.1), 'Пепел +10% — выше доктринального клампа');
    assert.equal(SM.corruptionTick(b, 0, 3, { provinceUpkeepMult: SM.provinceUpkeepMult(1) }).upkeep,
        Math.round(base * SM.provinceUpkeepMult(1)), 'модельные функции совместимы с тиком (единый источник модов)');
    [0, -1, NaN, 99].forEach((v) => assert.equal(SM.corruptionTick(b, 0, 3, { provinceUpkeepMult: v }).upkeep, base, 'кривая ' + v + ' игнорируется'));
});

test('corruptionTick: provinceUpkeepMult перемножается с доктриной upkeepMult одним округлением', () => {
    const b = { zh1: { built: true, corruptionStage: 'ok', debtDays: 0 }, zh2: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    const base = DATA.BUILDINGS.zh1.upkeep + DATA.BUILDINGS.zh2.upkeep;
    const r = SM.corruptionTick(b, 0, 3, { upkeepMult: 0.8, provinceUpkeepMult: 0.9 });
    assert.equal(r.upkeep, Math.round(base * 0.8 * 0.9), ' round(11×0.8×0.9) — одно округление, как в превью app.js');
    const paid = SM.corruptionTick(b, 1000, 3, { provinceUpkeepMult: 1.1 });
    assert.equal(paid.gold, 1000 - Math.round(base * 1.1), 'списание золота = итоговому содержанию');
});

test('app.js: модификаторы применены ровно в 2 местах каждый (тик + превью) — parity тик/превью не расходится', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    assert.equal((app.match(/SM\.provinceIncomeMult\(/g) || []).length, 2, 'доход: strongholdsDailyTick + shIncomePerDay');
    assert.equal((app.match(/SM\.provinceUpkeepMult\(/g) || []).length, 2, 'содержание: strongholdsDailyTick + shUpkeepPerDay');
    assert.ok(/SM\.provinceIncomeMult \? SM\.provinceIncomeMult\(/.test(app), 'typeof-гвард вызова дохода');
    assert.ok(/SM\.provinceUpkeepMult \? SM\.provinceUpkeepMult\(/.test(app), 'typeof-гвард вызова содержания');
});
