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

test('app.js: модификаторы дохода/содержания — по одному месту (единая формула), осада — 2; parity тик/превью по построению', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    assert.equal((app.match(/SM\.provinceIncomeMult\(/g) || []).length, 1, 'доход: единая формула shIncomePerDay (тик её вызывает)');
    assert.equal((app.match(/SM\.provinceUpkeepMult\(/g) || []).length, 1, 'содержание: единые опты corruptionTickOpts');
    assert.equal((app.match(/SM\.provinceSiegeMult\(/g) || []).length, 2, 'P5 осада врага: runWeeklySiege + siegeAlarmPreview');
    assert.ok(/SM\.provinceIncomeMult \? SM\.provinceIncomeMult\(/.test(app), 'typeof-гвард вызова дохода');
    assert.ok(/SM\.provinceUpkeepMult \? SM\.provinceUpkeepMult\(/.test(app), 'typeof-гвард вызова содержания');
    assert.ok(/SM\.provinceSiegeMult \? SM\.provinceSiegeMult\(/.test(app), 'P5 typeof-гвард вызова осады');
});

// P5: поведенческое равенство превью и тика — воскресный удар врага умножается правилом провинции
// фронта в ОБОИХ местах одинаково. Экстрактор function-by-name из app.js (паттерн wave3,
// brace counting); топ-левел app.js не исполняется, same-layer зависимости закрыты стабами.
test('P5: provinceSiegeMult — превью осадной тревоги и тик runWeeklySiege дают одну силу удара', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
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
    function buildIn({ decls = [], stubs = {}, body }) {
        const src = decls.join('\n') + '\nreturn (' + body + ');';
        const keys = Object.keys(stubs);
        return new Function(...keys, src)(...keys.map((k) => stubs[k]));
    }
    // Синтетика: пров 7 вне каталога, SM.provinceSiegeMult(7)=1.25 — множитель виден только если
    // проводка реально читает его; siegePower зависит от week → ловит расхождение аргументов.
    const mkSM = (withProv) => ({
        siegePower: (total, week, cap, wrath) => Math.round(total * (1 + week) * (1 + 0.12 * wrath)),
        defensePower: () => 100000, // оборона держит — первый удар, без каскада
        armyPower: (u) => u.t1 * 2,
        stackPower: (g) => (g && g.length) ? 10 : 0,
        provinceSiegeMult: withProv ? ((prov) => prov === 7 ? 1.25 : 1) : undefined
    });
    // Тик: siege.week=4 → siegePower(…,3,…); превью: siege.week=3 → siegePower(…,3,…) — те же аргументы.
    const runTick = (sm) => {
        const out = {};
        buildIn({
            decls: [extractFn('runWeeklySiege')],
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
                showSiegeReport: (rows, wrath) => { out.rows = rows; out.wrath = wrath; },
                siege: { week: 4, wkSkips: 0, wkTaskFails: 0 },
                SM: sm
            },
            body: 'runWeeklySiege()'
        });
        return out;
    };
    const runPreview = (sm) => buildIn({
        decls: [extractFn('siegeAlarmPreview')],
        stubs: {
            SM: sm, army: { units: { t1: 5 } },
            strongholds: [{ captured: true, garrison: [{ tier: 't1', count: 1 }] }],
            STRONGHOLDS: [{ total: 200, prov: 7 }],
            siege: { week: 3, wkSkips: 0, wkTaskFails: 0 },
            capturedCount: () => 1, lastCapturedIdx: () => 0, countGhostTasks: () => 0,
            siegeWrathNow: () => 0, ascEnemyMult: () => 1, weeklyModsNow: () => ({ income: 1, upkeep: 1, siege: 1 }),
            weatherSeasonWeek: () => ({ sn: 1, wk: 1 }), HERO: { scouts: null },
            scoutFresh: () => null, getMSKDayKey: () => '2026-01-01',
            weatherFog: () => false, stanceFogPierce: () => false, siegeAlarmVerdict: () => 'ок'
        },
        body: 'siegeAlarmPreview()'
    });
    // База: siegePower(200, 3, 1, 0) = 800; с правилом провинции ×1.25 → 1000 в ОБОИХ местах.
    const tick = runTick(mkSM(true)), prev = runPreview(mkSM(true));
    assert.equal(tick.rows[0].held, true, 'оборона держит — строка первого удара без каскада');
    assert.equal(tick.rows[0].power, 1000, 'тик: round(800 × 1.25) — правило провинции применено');
    assert.equal(prev.power, 1000, 'превью: round(800 × 1.25) — тот же множитель');
    assert.equal(prev.power, tick.rows[0].power, 'равенство превью/тик: сила врага совпадает');
    // Гвард: SM без provinceSiegeMult (старая модель) — нейтрально ×1, равенство сохраняется.
    const tickOld = runTick(mkSM(false)), prevOld = runPreview(mkSM(false));
    assert.equal(tickOld.rows[0].power, 800, 'тик без provinceSiegeMult не падает');
    assert.equal(prevOld.power, 800, 'превью без provinceSiegeMult не падает');
    assert.equal(prevOld.power, tickOld.rows[0].power, 'равенство сохраняется и на нейтральном SM');
});
