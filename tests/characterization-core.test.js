'use strict';
// P17 — CHARACTERIZATION-ТЕСТЫ ЯДРА (stronghold / economy / siege чистые потоки).
// Назначение: страховочная сеть рефакторинга P18–P20 «State Store 2.0» (reducer'ы поверх
// существующих данных, storage-адаптер, вынос UI-модуля). Все числа ниже — ЗОЛОТЫЕ ПИНЫ
// текущего поведения продукта на РЕАЛЬНОМ каталоге (stronghold-data.js) и РЕАЛЬНОЙ модели
// (stronghold-model.js): те же значения обязан давать любой рефакторинг «поведение неизменно».
// Правило сьюта: пины меняются только осознанным ре-пином с комментарием в коммите;
// «подгонять» тест под новое поведение кода нельзя — сначала осознание, потом ре-пин.
// Extract-харнессы — паттерн wave3: функции поодиночке из исходника app.js (brace counting),
// топ-левел app.js не исполняется; same-layer зависимости закрыты НЕЙТРАЛЬНЫМИ стабами
// (множители ×1), кросс-слойная математика идёт через настоящий SM.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
globalThis.StrongholdData = require('../js/stronghold-data.js');
const DATA = globalThis.StrongholdData;
const SM = require('../js/stronghold-model.js');

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
// var-присваивание объектного литерала (TACTICS) — тем же brace counting + ';'
function extractVar(name) {
    const anchor = 'var ' + name + ' = ';
    const start = app.indexOf(anchor);
    assert.ok(start > -1, 'var anchor not found: ' + name);
    let depth = 0, end = -1;
    for (let i = app.indexOf('{', start); i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > -1, 'unbalanced braces in var ' + name);
    return app.slice(start, end + 1) + ';';
}
function buildIn({ decls = [], stubs = {}, body }) {
    const src = decls.join('\n') + '\nreturn (' + body + ');';
    const keys = Object.keys(stubs);
    return new Function(...keys, src)(...keys.map((k) => stubs[k]));
}

// Состояние твердынь поверх реального каталога: {idx: {captured, garrison, buildings}}
function mkStrongholds(overrides) {
    return DATA.STRONGHOLDS.map(function(def, i) {
        return Object.assign({ captured: false, garrison: [], buildings: {} }, overrides && overrides[i]);
    });
}
function bld(stage, debt, builtAt) {
    return { built: true, corruptionStage: stage || 'ok', debtDays: debt || 0, builtAt: builtAt === undefined ? null : builtAt };
}
// Нейтральные same-layer множители (×1) — вся реальная математика в SM и каталоге
function neutralMults() {
    return {
        weatherSeasonWeek: () => ({ sn: 1, wk: 1 }),
        synergyEcMult: () => 1, bossArtifactMult: () => 1, weatherTaxMult: () => 1, edictTaxMult: () => 1,
        weatherUpkeepMult: () => 1, stanceUpkeepMult: () => 1, doctrineUpkeepMult: () => 1,
        doctrineCrownMult: () => 1, doctrineAtkMult: () => 1, doctrineAttritionMult: () => 1,
        doctrineFortMult: () => 1, synergyAtkMult: () => 1, synergyDefMult: () => 1,
        stanceAtkMult: () => 1, stanceDefMult: () => 1,
        techAtkMult: () => 1, techDefMult: () => 1, techArmyMult: () => 1, techUpkeepMult: () => 1, techAttrMult: () => 1,
        techMarketBonus: () => 0, techVirtualRoutes: () => 0, techIdeaMult: () => 1,
        hasTech: () => false, taxMultiplier: () => 1, totemGoldMult: () => 1, totemDefMult: () => 1,
        holidayBonus: () => null, techOrderActive: () => false,
        provCapturedCount: () => 0, provResourceMult: () => 0,
        hasSpecialOk: () => false, techGraceBonus: () => 0, techCorrSlow: () => 1,
        weeklyModsNow: () => ({ income: 1, upkeep: 1, siege: 1 }),
        ensureStrongholdState: () => {}, dqProgress: () => {}, checkDailyGoldGoal: () => {},
        defBonusOf: () => 0, ascEnemyMult: () => 1
    };
}

// ================================================================
// ЧАСТЬ 1. МОДЕЛЬ — золотые таблицы реального каталога (без извлечения)
// ================================================================

test('P17 модель: силы тиров каталога, stackPower/armyPower/defensePower — золотые значения', () => {
    // SPEC §3: 2/6/16/45/140/450/1400
    ['t1', 't2', 't3', 't4', 't5', 't6', 't7'].forEach((t, i) =>
        assert.equal(SM.tierPower(t), [2, 6, 16, 45, 140, 450, 1400][i], 'power ' + t));
    assert.equal(SM.stackPower([{ tier: 't3', count: 3 }, { tier: 't5', count: 2 }]), 3 * 16 + 2 * 140, 'массив стеков: 48+280');
    assert.equal(SM.stackPower({ t2: 5 }), 30, 'map-форма');
    assert.equal(SM.stackPower([{ tier: 't1', count: 2.7 }]), 6, 'дробный count округляется до 3');
    assert.equal(SM.stackPower([{ tier: 't1', count: 0 }, { tier: 't1', count: -5 }]), 0, 'нулевые/отрицательные игнорируются');
    // Г1-1: ≥3 разных тиров → ×1.08
    assert.equal(SM.armyPower({ t1: 10, t2: 5, t3: 2 }), 89, '20+30+32=82 → round(82×1.08)=89');
    assert.equal(SM.armyPower({ t1: 10, t2: 5 }), 50, '2 тира — без бонуса');
    assert.equal(SM.armyPower(null), 0, 'мусорный вход — 0');
    // SPEC §5 + Г1-1 mono: гарнизон одного тира ×1.15 (только оборона)
    assert.equal(SM.defensePower({ total: 40 }, [{ tier: 't2', count: 10 }], 3, 0), 113,
        '40 + round(round(60×1.15)×1.06) = 40 + round(69×1.06) = 113');
    assert.equal(SM.defensePower({ total: 40 }, [{ tier: 't1', count: 2 }, { tier: 't2', count: 1 }], 3, 0), 51,
        'смешанный гарнизон: 40 + round(10×1.06) = 51');
    assert.equal(SM.defensePower({ gar: 18, def: 10 }, [], 0, 0), 28, 'фоллбэк total = gar+def');
    assert.equal(SM.defensePower(null, [], 3, 0), 0, 'нет твердыни — 0');
});

test('P17 модель: siegePower — золотая таблица SPEC §5 (капы недели/гнева, мусорные входы)', () => {
    assert.equal(SM.siegePower(200, 0, 0, 0), 120, 'round(200×0.6)');
    assert.equal(SM.siegePower(200, 5, 1, 0), 210, 'кап W_eff = max(4; floor(1×1.5)) = 4 → 120×1.15^4');
    assert.equal(SM.siegePower(200, 5, 4, 0), 241, '4 захвата → кап 6, W_eff=5: 120×1.15^5');
    assert.equal(SM.siegePower(200, 99, 20, 0), 642, 'кап недели 12: 120×1.15^12 (захваты не снимают кап 12)');
    assert.equal(SM.siegePower(100, 0, 0, 5), 96, 'гнев ×(1+0.12×5)');
    assert.equal(SM.siegePower(100, 0, 0, 99), 132, 'кап гнева 10 → ×2.2');
    assert.equal(SM.siegePower(100, -5, 0, -3), 60, 'отрицательные → нейтрально');
    assert.equal(SM.siegePower('x', 'y', 'z', 'w'), 0, 'мусор → 0');
});

test('P17 модель: assaultOutcome — победа/поражение, attrition-модификаторы, клампы', () => {
    assert.deepEqual(SM.assaultOutcome(120, 100, { agi: 3 }), { win: true, ratio: 1.2, attritionPct: 0.2425 },
        'ratio>1 победа; 0.30/1.2=0.25 ×(1−0.03)=0.2425');
    assert.equal(SM.assaultOutcome(120, 100, { agi: 3, ladder: true }).ratio, 1.26, 'лестницы: ratio ×1.05');
    assert.equal(SM.assaultOutcome(120, 100, { agi: 3, banner: true }).attritionPct, 0.194, 'знамя ×0.8');
    assert.equal(SM.assaultOutcome(120, 100, { agi: 3, ram: true }).attritionPct, 0.21825, 'таран ×0.9');
    const l0 = SM.assaultOutcome(50, 100, { rand: () => 0 });
    assert.deepEqual({ win: l0.win, ratio: l0.ratio, attritionPct: l0.attritionPct }, { win: false, ratio: 0.5, attritionPct: 0.1 },
        'поражение: потери 10+rand(0..20)% — нижний край');
    assert.equal(SM.assaultOutcome(50, 100, { rand: () => 1 }).attritionPct, 0.3, 'верхний край 30%');
    assert.ok(Math.abs(SM.assaultOutcome(50, 100, { rand: () => 0.5, ram: true }).attritionPct - 0.18) < 1e-12, 'таран работает и в поражении');
    assert.ok(Math.abs(SM.assaultOutcome(120, 100, { agi: 3, attritionMult: 0.7 }).attritionPct - 0.16975) < 1e-12, 'доктрина veteran ×0.7');
    assert.equal(SM.assaultOutcome(120, 100, { agi: 3, attritionMult: 20 }).attritionPct, 3, 'кламп верх 3');
    assert.equal(SM.assaultOutcome(120, 100, { agi: 3, attritionMult: 0.001 }).attritionPct, 0.01, 'кламп низ 0.01');
    const d0 = SM.assaultOutcome(120, 0, {});
    assert.ok(d0.win && d0.ratio === Infinity && d0.attritionPct === 0.08, 'обороны нет → ratio Infinity, потери минимум 8%');
});

test('P17 модель: торговые пути — индексные vs графовые (расхождение на развилке каталога), фронтир', () => {
    assert.equal(SM.tradeRoutes([true, true, true, false]), 2, 'пары соседних захваченных');
    assert.equal(SM.tradeRoutes([true, false, true]), 0, 'разрыв — не маршрут');
    assert.equal(SM.tradeBonus(0), 0);
    assert.equal(SM.tradeBonus(2), 0.04, '+2%/путь');
    assert.equal(SM.tradeBonus(19), 0.38, 'кап +38%');
    assert.equal(SM.tradeBonus(30), 0.38, 'выше капа — те же 38%');
    assert.equal(SM.tradeBonus(-3), 0, 'отрицательные → 0');
    // Реальный каталог (21 ребро, диагонали развилок sh07→sh09 и sh17→sh19):
    const lin7 = Array.from({ length: 20 }, (_, i) => i < 7);
    assert.equal(SM.tradeRoutesGraph(lin7), 6, 'линейный префикс 0..6: 6 маршрутов');
    assert.equal(SM.tradeRoutes(lin7), 6, 'индексная семантика на линейном префиксе совпадает 1:1');
    const branch = Array.from({ length: 20 }, (_, i) => i <= 7 || i === 9);
    assert.equal(SM.tradeRoutesGraph(branch), 8, 'граф: 7 линейных + ребро sh08→sh10 (sh07→sh09 не захвачена)');
    assert.equal(SM.tradeRoutes(branch), 7, 'РАСХОЖДЕНИЕ: индексная семантика не видит диагональ — текущее поведение');
    assert.deepEqual(SM.frontierTargets(Array.from({ length: 20 }, () => false)), [0], 'стартовый лагерь доступен всегда');
    assert.deepEqual(SM.frontierTargets(Array.from({ length: 20 }, (_, i) => i < 1)), [1]);
    assert.deepEqual(SM.frontierTargets(Array.from({ length: 20 }, (_, i) => i < 7)), [7, 8],
        'развилка у sh07: фронтир = sh08 и sh09, минимальный индекс = линейный дефолт');
    assert.deepEqual(SM.frontierTargets(Array.from({ length: 20 }, () => true)), [], 'всё захвачено — фронтир пуст');
});

test('P17 модель: weekly-модификаторы — детерминизм (сезон 1, неделя 1) = «Жадность», гейт эндгейма 20/20', () => {
    assert.equal(SM.weeklyModifierOf(1, 1).id, 'greed', 'sin-хеш (1,1) → «Неделя жадности» (порядок каталога — контракт)');
    assert.equal(SM.weeklyIncomeMult(1, 1, true), 1.3, 'эндгейм: налоги ×1.3');
    assert.equal(SM.weeklyUpkeepMult(1, 1, true), 1.3, 'эндгейм: содержание ×1.3');
    assert.equal(SM.weeklySiegeMult(1, 1, true), 1.0, 'осады ×1.0');
    assert.equal(SM.weeklyIncomeMult(1, 1, false), 1, 'вне эндгейма ротация нейтральна (гейт на вызывающем)');
});

// ================================================================
// ЧАСТЬ 2. ЭКОНОМИКА — strongholdsDailyTick (extract, реальный SM + каталог)
// ================================================================

function economyDecls() {
    return [extractFn('builtList'), extractFn('stageMult'), extractFn('corruptionStepNow'),
        extractFn('corruptionTickOpts'), extractFn('strongholdsDailyTick')];
}
function economyStubs(extra) {
    return Object.assign(neutralMults(), {
        SM: SM, STRONGHOLDS: DATA.STRONGHOLDS, BUILDINGS: DATA.BUILDINGS,
        HERO: { gold: 0 }, STATS: { wil: { value: 20 } }, strongholds: []
    }, extra);
}

test('P17 экономика: strongholdsDailyTick — оплаченный день (налоги+эконом+рынок; Хутора −10% в тике)', () => {
    const strongholds = mkStrongholds({
        0: { captured: true, buildings: { zh1: bld(), ec2: bld(), ec1: bld() } }
    });
    const dq = [];
    const stubs = economyStubs({ strongholds, HERO: { gold: 100 }, dqProgress: (k, n) => dq.push([k, n]) });
    const ret = buildIn({ decls: economyDecls(), stubs, body: 'strongholdsDailyTick()' });
    // налог 1 (sh01) + эконом 20 (ec2) → round(21×1.10 рынок) = 23; содержание round(28×0.9) = 25
    assert.deepEqual(ret, { income: 23, upkeep: 25, paid: true, ruined: [] });
    assert.equal(stubs.HERO.gold, 100 + 23 - 25, 'казна: +23 дохода, −25 содержания (уплачено полностью)');
    assert.equal(strongholds[0].buildings.zh1.corruptionStage, 'ok', 'оплаченный день: стадии целые');
    assert.equal(strongholds[0].buildings.ec2.debtDays, 0, 'долга нет');
    assert.deepEqual(dq, [['gold', 23]], 'тик кормит дневной квест золота полной суммой дохода');
});

test('P17 экономика: strongholdsDailyTick — дефицит: gold=0, долг+1, руина на grace+step+1, иммунитет builtAt', () => {
    const strongholds = mkStrongholds({
        0: { captured: true, buildings: {
            df4: bld('ok', 5), zh2: bld('ok', 5), ec3: bld('ok', 5, Date.now())
        } }
    });
    const stubs = economyStubs({ strongholds, HERO: { gold: 0 } });
    const ret = buildIn({ decls: economyDecls(), stubs, body: 'strongholdsDailyTick()' });
    // wil 20 → grace 3, step 2: долг 6 > 5 → руина; доход = налог 1 + эконом ec3 150 = 151 < содержания 165
    assert.equal(ret.income, 151, 'доход = налог 1 + эконом рудника 150 (рынка нет)');
    assert.equal(ret.upkeep, 165, 'содержание round((140+8+35)×0.9)=165');
    assert.equal(ret.paid, false, 'дефицит');
    assert.deepEqual(ret.ruined, [
        { sh: 'Сендер-Хутор', name: 'Великая Цитадель', debt: 6 },
        { sh: 'Сендер-Хутор', name: 'Казармы', debt: 6 }
    ], 'причина руины собрана с именами и долгом (для тоста P7)');
    assert.equal(strongholds[0].buildings.df4.corruptionStage, 'ruin', 'долг 6 > grace 3 + step 2 → руина');
    assert.equal(strongholds[0].buildings.zh2.corruptionStage, 'ruin');
    assert.equal(strongholds[0].buildings.ec3.corruptionStage, 'ok', 'постройка младше 7 дней не деградирует');
    assert.equal(strongholds[0].buildings.ec3.debtDays, 5, 'и долг ей не растёт');
    assert.equal(stubs.HERO.gold, 0, 'дефицит обнуляет казну (доход 151 сгорает в содержании)');
});

test('P17 экономика: strongholdsDailyTick — незахваченный стартовый лагерь вне экономики', () => {
    const strongholds = mkStrongholds({}); // 0 захвачено
    const stubs = economyStubs({ strongholds, HERO: { gold: 42 } });
    const ret = buildIn({ decls: economyDecls(), stubs, body: 'strongholdsDailyTick()' });
    assert.deepEqual(ret, { income: 0, upkeep: 0, paid: true, ruined: [] }, 'нет налогов, нет содержания (решение совета)');
    assert.equal(stubs.HERO.gold, 42, 'казна не тронута');
});

test('P17 экономика: strongholdsDailyTick — Пепел ×1.1 налог/содержание; рынок суммируется по королевству с капом 50%', () => {
    // (1) Одиночная твердыня Пепла: ш16 Заревый Форпост (налог 860) с рынком ec1
    const ash = mkStrongholds({ 15: { captured: true, buildings: { ec1: bld() } } });
    const ashStubs = economyStubs({ strongholds: ash, HERO: { gold: 0 } });
    const ashRet = buildIn({ decls: economyDecls(), stubs: ashStubs, body: 'strongholdsDailyTick()' });
    // налог round(860×1.1)=946; рынок 0.10 → round(946×1.10)=1041; содержание round(10×1.1)=11
    assert.deepEqual([ashRet.income, ashRet.upkeep, ashRet.paid], [1041, 11, true], 'Пепел: и налог, и содержание ×1.1');
    assert.equal(ashStubs.HERO.gold, 1030, 'казна после тика');
    // (2) Кап рынка: 6 захваченных твердынь с рынком = 0.6 → min(0.5; …) = 0.5;
    // налоги 1+2+4+7+11+16 = 41, маршрутов 5 (+10%) → round(41×1.1)=45 → round(45×1.5)=68;
    // содержание: 5 × Хутора round(10×0.9)=9 + Крепости round(10×1)=10 → 55
    const six = mkStrongholds();
    for (let i = 0; i < 6; i++) six[i] = { captured: true, garrison: [], buildings: { ec1: bld() } };
    const sixStubs = economyStubs({ strongholds: six, HERO: { gold: 0 } });
    const sixRet = buildIn({ decls: economyDecls(), stubs: sixStubs, body: 'strongholdsDailyTick()' });
    assert.deepEqual([sixRet.income, sixRet.upkeep], [68, 55], 'кап рынка 50% + торговые маршруты + смешанные провинции');
    assert.equal(sixRet.paid, true);
    assert.equal(sixStubs.HERO.gold, 68 - 55, 'казна после тика');
});

test('P17 экономика: превью казны == тик (нейтральные множители); асимметрии округления и тотема — как есть', () => {
    const decls = economyDecls().concat([extractFn('shIncomePerDay'), extractFn('shUpkeepPerDay')]);
    // (1) Паритет: shIncomePerDay/shUpkeepPerDay на том же состоянии = income/upkeep тика
    const one = mkStrongholds({ 0: { captured: true, buildings: { zh1: bld(), ec2: bld(), ec1: bld() } } });
    const t1 = buildIn({
        decls,
        stubs: economyStubs({ strongholds: one, HERO: { gold: 1000 } }),
        body: '(function(){ var pv = [shIncomePerDay(), shUpkeepPerDay()]; var r = strongholdsDailyTick(); return [pv, [r.income, r.upkeep], [shIncomePerDay(), shUpkeepPerDay()]]; })()'
    });
    assert.deepEqual(t1[0], [23, 25], 'превью ДО тика = будущие income/upkeep');
    assert.deepEqual(t1[1], [23, 25], 'сам тик даёт те же числа');
    assert.deepEqual(t1[2], [23, 25], 'и превью ПОСЛЕ тика не дрейфует (оплаченные стадии целые)');
    // (2) РАСХОЖДЕНИЕ округления (текущее поведение): тик округляет содержание ПО-ТВЕРДЫННО,
    // превью — один раз по сумме: два zh1 в Хуторах → тик 3+3=6, превью round(5.4)=5.
    const two = mkStrongholds({
        0: { captured: true, buildings: { zh1: bld() } },
        1: { captured: true, buildings: { zh1: bld() } }
    });
    const t2 = buildIn({
        decls,
        stubs: economyStubs({ strongholds: two, HERO: { gold: 1000 } }),
        body: '(function(){ var pv = shUpkeepPerDay(); var r = strongholdsDailyTick(); return [r.upkeep, r.income, pv]; })()'
    });
    assert.deepEqual(t2, [6, 3, 5], 'тик 6 ≠ превью 5 (по-тверд. vs суммарное округление); доход 1+2 без маршрутов');
    // (3) РАСХОЖДЕНИЕ тотема (текущее поведение): тик множит НАЛОГИ на totemGoldMult (до рынка),
    // превью — не знает тотем вовсе. На малом налоге ш01 округление съедает эффект — берём ш16 (Пепел).
    const wolf = mkStrongholds({ 15: { captured: true, buildings: { zh1: bld() } } });
    const t3 = buildIn({
        decls,
        stubs: economyStubs({ strongholds: wolf, HERO: { gold: 1000 }, totemGoldMult: () => 1.05 }),
        body: '(function(){ var pv = shIncomePerDay(); var r = strongholdsDailyTick(); return [pv, r.income]; })()'
    });
    assert.deepEqual(t3, [946, 993], 'Волк ×1.05: тик round(946×1.05)=993, превью 946 — превью не знает тотем/праздники/жатву');
});

// ================================================================
// ЧАСТЬ 3. ОСАДА — runWeeklySiege (extract, реальный SM + каталог)
// ================================================================

function siegeDecls() {
    return [extractFn('lastCapturedIdx'), extractFn('applyStackLoss'), extractFn('ruinAllBuildings'), extractFn('runWeeklySiege')];
}
function runSiege(stubExtra) {
    const rec = { reports: [], chron: [], xp: [] };
    const stubs = Object.assign(neutralMults(), {
        SM: SM, STRONGHOLDS: DATA.STRONGHOLDS,
        STATS: { end: { value: 3 } },
        siege: { week: 2, wkSkips: 0, wkTaskFails: 0 },
        strongholds: mkStrongholds({}),
        // capturedCount — ЖИВОЙ счётчик по состоянию: каскад осады пересчитывает его после падения
        capturedCount: () => stubs.strongholds.filter(function(s) { return s.captured; }).length,
        countGhostTasks: () => 0, approachWrathDeltaNow: () => 0, approachEnemyMultNow: () => 1,
        recalcHirePool: () => {},
        chronicleSiegeRows: (rows) => rec.chron.push(rows),
        showSiegeReport: (rows, wrath) => rec.reports.push({ rows: rows, wrath: wrath }),
        addXpReward: (n) => rec.xp.push(n)
    }, stubExtra);
    buildIn({ decls: siegeDecls(), stubs, body: 'runWeeklySiege()' });
    return { rec: rec, stubs: stubs };
}

test('P17 осада: оборона держит — сила врага 28 vs оборона 113, гарнизон −15%, XP, week+1, win', () => {
    const { rec, stubs } = runSiege({
        strongholds: mkStrongholds({
            0: { captured: true }, 1: { captured: true },
            2: { captured: true, garrison: [{ tier: 't2', count: 10 }] }
        }),
        siege: { week: 2, wkSkips: 0, wkTaskFails: 0 }
    });
    // siegePower(40, 1, 3, 0) = round(40×0.6×1.15) = 28; defensePower = 40 + round(round(60×1.15)×1.06) = 113
    assert.equal(rec.reports.length, 1);
    assert.deepEqual(rec.reports[0].rows, [{ name: 'Лесопилка', held: true, power: 28, garDef: 113 }]);
    assert.equal(rec.reports[0].wrath, 0, 'без пропусков/призраков гнев 0');
    assert.deepEqual(stubs.strongholds[2].garrison, [{ tier: 't2', count: 9 }], 'отбитая осада: −15% гарнизона (floor)');
    assert.deepEqual(rec.xp, [100], 'награда XP = 100 × провинция (1)');
    assert.equal(stubs.siege.week, 3, 'неделя +1');
    assert.equal(stubs.siege.lastResult, 'win');
    assert.equal(rec.chron.length, 1, 'итоги недели в хронике');
});

test('P17 осада: формула гнева — min(10; 2×ghosts + wkSkips + wkTaskFails + approach)', () => {
    const mkState = () => mkStrongholds({
        0: { captured: true }, 1: { captured: true }, 2: { captured: true, garrison: [{ tier: 't2', count: 10 }] }
    });
    const a = runSiege({
        strongholds: mkState(),
        siege: { week: 2, wkSkips: 3, wkTaskFails: 2 },
        countGhostTasks: () => 1, approachWrathDeltaNow: () => 1
    });
    assert.equal(a.rec.reports[0].wrath, 8, '2×1 + 3 + 2 + 1 = 8');
    assert.equal(a.rec.reports[0].rows[0].power, 54, 'round(27.6 × (1+0.12×8)) = 54 — гнев усиливает удар');
    const b = runSiege({
        strongholds: mkState(),
        siege: { week: 2, wkSkips: 0, wkTaskFails: 0 },
        countGhostTasks: () => 30
    });
    assert.equal(b.rec.reports[0].wrath, 10, 'кап гнева 10');
});

test('P17 осада: падение и каскад ×0.85 — capturedCount пересчитывается, прорыв останавливается', () => {
    const { rec, stubs } = runSiege({
        strongholds: mkStrongholds({
            0: { captured: true }, 1: { captured: true }, 2: { captured: true }, 3: { captured: true }, 4: { captured: true }
        }),
        siege: { week: 5, wkSkips: 4, wkTaskFails: 0 }
    });
    // wrath 4: удар 1 = siegePower(110, 4, 5, 4) = 171 > 110 → Житницы пала; 171 > 1.5×110 → каскад;
    // удар 2 (hitMult 0.85, захвачено уже 4): round(siegePower(65,4,4,4)×0.85) = round(101×0.85) = 86 > 65
    assert.deepEqual(rec.reports[0].rows, [
        { name: 'Житницы', held: false, power: 171, garDef: 110 },
        { name: 'Медные Копи', held: false, power: 86, garDef: 65 }
    ]);
    assert.equal(stubs.strongholds[4].captured, false, 'Житницы потеряна');
    assert.equal(stubs.strongholds[3].captured, false, 'каскад дошёл до Медных Копей');
    assert.equal(stubs.strongholds[2].captured, true, 'дальше фронта Лесопилки каскад не пошёл (86 ≤ 1.5×65)');
    assert.equal(stubs.siege.week, 1, 'потеря сбрасывает счётчик недель фронта');
    assert.equal(stubs.siege.lastResult, 'fail');
});

test('P17 осада: анти-тупик — полный разгром возвращает прибежище sh01 в руине', () => {
    const { rec, stubs } = runSiege({
        strongholds: mkStrongholds({
            0: { captured: true, garrison: [], buildings: { zh1: bld() } }
        }),
        siege: { week: 1, wkSkips: 10, wkTaskFails: 0 }
    });
    // wrath 10: round(5×0.6×2.2) = 7 > 5 → единственная твердыня пала → прибежище
    assert.deepEqual(rec.reports[0].rows, [
        { name: 'Сендер-Хутор', held: false, power: 7, garDef: 5 },
        { name: 'Сендер-Хутор', refuge: true }
    ]);
    assert.equal(stubs.strongholds[0].captured, true, 'стартовый лагерь восстановлен');
    assert.deepEqual(stubs.strongholds[0].garrison, [], 'без гарнизона');
    assert.equal(stubs.strongholds[0].buildings.zh1.corruptionStage, 'ruin', 'постройки в руине — путь возврата открыт');
    assert.equal(stubs.siege.lastResult, 'fail');
});

test('P17 осада: 0 захваченных — week=1 и тишина (без отчёта и хроники)', () => {
    const { rec, stubs } = runSiege({
        strongholds: mkStrongholds({}),
        siege: { week: 9, wkSkips: 2, wkTaskFails: 1 }
    });
    assert.equal(rec.reports.length, 0, 'отчёта нет');
    assert.equal(rec.chron.length, 0, 'хроники нет');
    assert.equal(stubs.siege.week, 1, 'счётчик недель сброшен в 1');
});

test('P17 осада: applyStackLoss — floor-потери, стопа не исчезает полностью (SPEC §4)', () => {
    const f = buildIn({ decls: [extractFn('applyStackLoss')], stubs: {}, body: 'applyStackLoss' });
    assert.deepEqual(f([{ tier: 't1', count: 10 }], 0.15), [{ tier: 't1', count: 9 }], 'floor(10×0.15)=1');
    assert.deepEqual(f([{ tier: 't1', count: 1 }], 0.9), [{ tier: 't1', count: 1 }], 'единица неистребима');
    assert.deepEqual(f([{ tier: 't1', count: 2 }], 0.9), [{ tier: 't1', count: 1 }], 'min(floor(1.8), 2−1)');
    assert.deepEqual(f(null, 0.5), [], 'нет стеков — нет потерь');
});

// ================================================================
// ЧАСТЬ 4. ШТУРМ — requestAssault (гейты) + doAssault (исходы) + assaultForecast
// ================================================================

test('P17 штурм: requestAssault — гейты суток/армии, фронтир-редирект, тактика с 3-й твердыни', async () => {
    const mk = (over) => {
        const rec = { toasts: [], errors: 0, confirms: [], tactics: [], assaults: [], chooser: 0 };
        const stubs = Object.assign({
            ensureStrongholdState: () => {},
            siege: { assaultDay: '', rams: 0, ladders: 0 },
            getMSKDayKey: () => '2026-10-01',
            showToast: (t, b, ty) => rec.toasts.push({ t: t, ty: ty }),
            sfxError: () => rec.errors++,
            SM: SM, army: { units: { t1: 5 } },
            assaultTargetChoices: () => [2],
            assaultForecast: (i) => ({ atk: 50, defN: 40, line: 'L' + i, lossLine: 'P' + i }),
            assaultRiskInfo: () => '',
            assaultBreakdownHtml: () => '',
            capturedCount: () => 1,
            requestTactic: (i, f) => { rec.tactics.push([i, f]); return Promise.resolve('rush'); },
            dungeonConfirm: (title, body) => { rec.confirms.push({ title: title, body: body }); return Promise.resolve(true); },
            doAssault: (i, f, t) => rec.assaults.push([i, f, t]),
            chooseAssaultTarget: () => { rec.chooser++; return Promise.resolve(2); },
            esc: (s) => s,
            STRONGHOLDS: DATA.STRONGHOLDS
        }, over);
        return { rec: rec, stubs: stubs };
    };
    const flush = () => new Promise((r) => setImmediate(r));
    // гейт «один штурм в сутки»
    let h = mk({ siege: { assaultDay: '2026-10-01', rams: 0, ladders: 0 } });
    buildIn({ decls: [extractFn('requestAssault')], stubs: h.stubs, body: 'requestAssault(2)' });
    assert.equal(h.rec.toasts[0].t, '⚔ Штурм уже был');
    assert.equal(h.rec.assaults.length + h.rec.confirms.length, 0, 'дальше гейта поток не идёт');
    // гейт «армии нет» (реальный SM.armyPower = 0)
    h = mk({ army: { units: {} } });
    buildIn({ decls: [extractFn('requestAssault')], stubs: h.stubs, body: 'requestAssault(2)' });
    assert.equal(h.rec.toasts[0].t, '⚔ Армии нет');
    assert.equal(h.rec.errors, 1, 'sfxError');
    // фронтир-редирект: просили не-фронтир 9 → подтверждение для фронтира 2; одиночная цель = линейный поток
    h = mk({});
    buildIn({ decls: [extractFn('requestAssault')], stubs: h.stubs, body: 'requestAssault(9)' });
    await flush();
    assert.equal(h.rec.confirms.length, 1, 'подтверждение показано');
    assert.ok(h.rec.confirms[0].title.indexOf('Лесопилка') > -1, 'цель перенаправлена на фронтир (индекс 2)');
    assert.ok(h.rec.confirms[0].body.indexOf('L2') > -1 && h.rec.confirms[0].body.indexOf('P2') > -1, 'прогноз цели в теле подтверждения');
    assert.equal(h.rec.chooser, 0, 'одна цель — выбор цели не вызывается (линейный дефолт, правило 13)');
    assert.equal(h.rec.assaults.length, 1, 'после «да» — штурм');
    assert.equal(h.rec.assaults[0][0], 2, 'штурмуется фронтир 2');
    assert.deepEqual(h.rec.assaults[0][1], { atk: 50, defN: 40, line: 'L2', lossLine: 'P2' }, 'с прогнозом цели');
    assert.equal(h.rec.assaults[0][2], undefined, 'без тактики (до 3-й твердыни)');
    // гейт тактик: с 3 захваченных — requestTactic вместо confirmOverlay
    h = mk({ capturedCount: () => 3 });
    buildIn({ decls: [extractFn('requestAssault')], stubs: h.stubs, body: 'requestAssault(2)' });
    await flush();
    assert.equal(h.rec.tactics.length, 1, 'выбор тактики получил цель и прогноз');
    assert.equal(h.rec.tactics[0][0], 2);
    assert.deepEqual(h.rec.tactics[0][1], { atk: 50, defN: 40, line: 'L2', lossLine: 'P2' });
    assert.equal(h.rec.confirms.length, 0, 'confirmOverlay при выборе тактики не используется');
    assert.deepEqual(h.rec.assaults, [[2, { atk: 50, defN: 40, line: 'L2', lossLine: 'P2' }, 'rush']], 'doAssault получил выбранную тактику');
});

function assaultDecls() {
    // var TACTICS извлекается из исходника: объявление в теле функции перекрывает нейтральный стаб-параметр,
    // так что тактики в тесте — НАСТОЯЩАЯ таблица продукта (её золотой пин ниже)
    return [extractVar('TACTICS'), extractFn('tacticAtkMult'), extractFn('tacticAttrMult'), extractFn('doAssault')];
}
function assaultHarness(strongholds, over) {
    const rec = { toasts: [], chron: [], xp: [], saves: 0, haptics: [], dq: [] };
    const stubs = {
        TACTICS: null,
        siege: { assaultDay: '', rams: 0, ladders: 0, week: 4 },
        getMSKDayKey: () => '2026-10-01',
        updateMainButton: () => {},
        stanceAtkMult: () => 1,
        dqProgress: (k) => rec.dq.push(k),
        SM: SM, STATS: { agi: { value: 3 }, int: { value: 3 } },
        army: { units: { t1: 10, t2: 4 } },
        hasSpecialOk: () => false,
        doctrineAttritionMult: () => 1, bossArtifactMult: () => 1, techAttrMult: () => 1,
        STRONGHOLDS: DATA.STRONGHOLDS,
        strongholds: strongholds,
        addChronicle: (ico, text) => rec.chron.push([ico, text]),
        addXpReward: (n) => rec.xp.push(n),
        showToast: (t, b, ty) => rec.toasts.push({ t: t, b: b, ty: ty }),
        checkDoctrineOffer: () => {}, spiritSay: () => {},
        sfxBossDefeated: () => {}, sfxFail: () => {}, haptic: (k) => rec.haptics.push(k),
        burstParticles: () => {}, screenShake: () => {}, spawnBloodRain: () => {},
        window: { innerWidth: 100, innerHeight: 100 },
        updateStrongholdProgress: () => {}, updateHeroUI: () => {}, renderStrongholds: () => {},
        saveGameState: () => rec.saves++
    };
    return { rec: rec, stubs: Object.assign(stubs, over) };
}
function runAssault(strongholds, f, tactic, over) {
    const h = assaultHarness(strongholds, over);
    buildIn({
        decls: assaultDecls(),
        stubs: h.stubs,
        body: 'doAssault(2, ' + JSON.stringify(f) + ', ' + JSON.stringify(tactic) + ')'
    });
    return h;
}

test('P17 штурм: doAssault победа — потери floor, таран/лестницы расходуются, week=1, хроника/тост/XP', () => {
    const strongholds = mkStrongholds({}); // цель sh03 (индекс 2) не захвачена
    const h = runAssault(strongholds, { atk: 120, defN: 100 }, 'normal', {
        siege: { assaultDay: '', rams: 1, ladders: 1, week: 4 }
    });
    const s = h.stubs;
    // ratio = 1.2 ×1.05 (лестница) = 1.26 → победа; attrition = 0.3/1.26 ×0.97 ×0.9(таран) = 0.2079
    // t1 10: floor(10×0.2079)=2 → 8; t2 4: floor(0.83)=0 → 4
    assert.equal(strongholds[2].captured, true, 'твердыня взята');
    assert.deepEqual(s.army.units, { t1: 8, t2: 4 }, 'потери 2 ополченца, копейщики целы (floor)');
    assert.equal(s.siege.rams, 0, 'таран израсходован');
    assert.equal(s.siege.ladders, 0, 'лестницы израсходованы');
    assert.equal(s.siege.assaultDay, '2026-10-01', 'флаг суток сгорел');
    assert.equal(s.siege.week, 1, 'новый фронт — неделя с 1');
    assert.deepEqual(h.rec.xp, [150], 'XP = round(150×(1+(int−3)×0.01)) = 150');
    assert.equal(h.rec.chron[0][1], 'Лесопилка взята штурмом: 2 потерь', 'хроника с числом потерь');
    assert.equal(h.rec.toasts[0].t, '🏰 Лесопилка захвачена!');
    assert.equal(h.rec.toasts[0].b, 'Потери: 2 · налог +4 💰/день', 'тост называет налог каталога');
    assert.equal(h.rec.toasts[0].ty, 'crit');
    assert.ok(h.rec.dq.indexOf('assault') > -1, 'штурм кормит дневной квест');
    assert.equal(h.rec.saves, 1, 'итог сохранён');
});

test('P17 штурм: таблица TACTICS реальна; doAssault поражение — без захвата, потери 10–30%, повтор завтра', () => {
    // таблица тактик — золотой пин (Г1-4), читается из исходника как есть
    const t = buildIn({ decls: [extractVar('TACTICS')], stubs: {}, body: 'TACTICS' });
    assert.deepEqual(t, {
        normal: { atk: 1, attr: 1 }, feint: { atk: 0.8, attr: 0.7 }, rush: { atk: 1.25, attr: 2 }
    });
    const strongholds = mkStrongholds({});
    const h = runAssault(strongholds, { atk: 50, defN: 100 }, 'normal', { army: { units: { t1: 10 } } });
    const s = h.stubs;
    assert.equal(strongholds[2].captured, false, 'штурм отбит');
    assert.equal(s.siege.week, 4, 'неделя фронта не сброшена');
    assert.equal(s.siege.assaultDay, '2026-10-01', 'флаг суток сгорел и в поражении');
    assert.ok(s.army.units.t1 >= 7 && s.army.units.t1 <= 9, 'потери 10–30%: осталось 7–9 из 10 (rand = поведение продукта)');
    assert.equal(h.rec.toasts[0].t, '↩ Отступление');
    assert.equal(h.rec.toasts[0].ty, 'blood');
    assert.ok(h.rec.toasts[0].b.indexOf('Повтор — завтра') > -1);
    assert.equal(strongholds[2].garrison.length, 0, 'гарнизон врага не тронут');
});

test('P17 штурм: doAssault «Натиск» — атака ×1.25, потери ×2 (tacticAttrMult), победа дороже', () => {
    const strongholds = mkStrongholds({});
    const h = runAssault(strongholds, { atk: 120, defN: 100 }, 'rush', {});
    const s = h.stubs;
    // atk = round(120×1.25) = 150 → ratio 1.5; attrition = 0.3/1.5 ×0.97 ×2 = 0.388
    // t1 10: floor(3.88)=3 → 7; t2 4: floor(1.552)=1 → 3; итого 4
    assert.equal(strongholds[2].captured, true, 'усиленная атака берёт стену');
    assert.deepEqual(s.army.units, { t1: 7, t2: 3 });
    assert.ok(h.rec.toasts[0].b.indexOf('Потери: 4') > -1, 'Натиск: победа, но потери ×2');
});

test('P17 штурм: assaultForecast — atk/defN на реальном каталоге, диапазон без Гильдии, точные числа со sp1', () => {
    const mk = (sp1, stores) => buildIn({
        decls: [extractFn('assaultForecast')],
        stubs: {
            SM: SM, army: { units: { t1: 10, t2: 5, t3: 2 } },
            techArmyMult: () => 1, STATS: { str: { value: 3 }, agi: { value: 3 } },
            doctrineAtkMult: () => 1, synergyAtkMult: () => 1, techAtkMult: () => 1,
            STRONGHOLDS: DATA.STRONGHOLDS, approachGarrisonMultNow: () => 1,
            siege: Object.assign({ rams: 0, ladders: 0 }, stores),
            hasSpecialOk: (bid) => sp1 && bid === 'sp1'
        },
        body: 'assaultForecast(2)'
    });
    // atk = round(89 × 1.06) = 94 (Г1-1 диверсификация ×1.08 внутри armyPower); defN = 40 (sh03)
    const blind = mk(false, {});
    assert.equal(blind.atk, 94);
    assert.equal(blind.defN, 40);
    assert.equal(blind.line, '⚔ ~71–118 против 🛡 40 (Гильдия Разведчиков даст точные числа)',
        'без sp1 — диапазон round(94×0.75)–round(94×1.25)');
    assert.equal(blind.lossLine, '📉 Потери при победе ≈12% · при неудаче 10–30%',
        'прогноз потерь: 0.3/2.35×0.97 → 12%');
    const scout = mk(true, {});
    assert.equal(scout.line, '⚔ 94 против 🛡 40 · превосходство', 'sp1: точные числа + вердикт');
    const stocked = mk(false, { rams: 2, ladders: 3 });
    assert.ok(stocked.lossLine.indexOf('🧰 склад будет потрачен') > -1, 'осадный склад отмечен в прогнозе');
});
