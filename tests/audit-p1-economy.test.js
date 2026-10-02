'use strict';
// Аудит 2026-10-02, пункты 2.1 и 2.2 (экономика твердынь).
//   2.1 SM.dailyUpkeep клампил множитель содержания в (0;1]: «метель севера ×2» и стойки «Штурм/Оборона ×1.25», «Разведка ×1.1»
//       молча превращались в ×1 — UI обещал штраф, золото не списывалось (скидки доктрины/технологий работали, штрафы — нет).
//   2.2 ночной тик и превью казны считали доход двумя копиями формулы: в превью («Налоги», брейкдаун покупки, прогноз «до руины»)
//       не хватало тотема, праздника «Новый год», «Великой жатвы», Пути Богатства, techMarketBonus/VirtualRoutes/TradeMult.
//       Теперь тик читает shIncomePerDay(), содержание — тот же SM.dailyUpkeep с теми же corruptionTickOpts(i), по-твердынно.
// Харнесс — паттерн characterization-core: функции поодиночке из app.js, реальный SM и каталог, same-layer множители — стабами.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const modelSrc = fs.readFileSync(path.join(root, 'js', 'stronghold-model.js'), 'utf8');
globalThis.StrongholdData = require('../js/stronghold-data.js');
const DATA = globalThis.StrongholdData;
const SM = require('../js/stronghold-model.js');

function extractBlock(source, anchor) {
    const start = source.indexOf(anchor);
    assert.ok(start > -1, 'anchor not found: ' + anchor);
    let depth = 0, end = -1;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > -1, 'unbalanced braces after: ' + anchor);
    return source.slice(start, end + 1);
}
const extractFn = (name) => extractBlock(app, 'function ' + name + '(');
function buildIn({ decls = [], stubs = {}, body }) {
    const src = decls.join('\n') + '\nreturn (' + body + ');';
    const keys = Object.keys(stubs);
    return new Function(...keys, src)(...keys.map((k) => stubs[k]));
}

const bld = (stage) => ({ built: true, corruptionStage: stage || 'ok', debtDays: 0, builtAt: null });
// Набор построек: 3+8+10+15+35 = 71 монета содержания; рынок и два «эконом»-здания дают доход
const setOf = () => ({ zh1: bld(), zh2: bld(), ec1: bld(), ec2: bld(), ec3: bld() });
const BASE = 71;
// 4 захваченные твердыни — по одной в каждой провинции (sh01 — пров. 1, sh06 — 2, sh11 — 3, sh16 — 4); рынки ec1 суммарно 0.4 < капа 50%,
// поэтому techMarketBonus заметен в доходе
const CAPTURED = [0, 5, 10, 15];
function mkStrongholds(idxs) {
    return DATA.STRONGHOLDS.map((def, i) => ({ captured: idxs.indexOf(i) >= 0, garrison: [], buildings: idxs.indexOf(i) >= 0 ? setOf() : {} }));
}

// ================================================================
// 2.1 SM.dailyUpkeep: множитель >1 больше не клампится
// ================================================================

test('2.1 SM.dailyUpkeep: множители >1 (метель ×2, стойки ×1.25/×1.1) увеличивают содержание, скидки по-прежнему уменьшают', () => {
    assert.equal(SM.dailyUpkeep(setOf()), BASE, 'без множителей — сумма каталога');
    assert.equal(SM.dailyUpkeep(setOf(), { upkeepMult: 2 }), 142, 'метель севера ×2');
    assert.equal(SM.dailyUpkeep(setOf(), { upkeepMult: 1.25 }), 89, 'стойка Штурм/Оборона ×1.25: round(88.75)');
    assert.equal(SM.dailyUpkeep(setOf(), { upkeepMult: 1.1 }), 78, 'стойка Разведка ×1.1');
    assert.equal(SM.dailyUpkeep(setOf(), { upkeepMult: 2.5 }), 178, 'метель × стойка: 2 × 1.25');
    assert.equal(SM.dailyUpkeep(setOf(), { upkeepMult: 0.72 }), 51, 'технологии g2+g8 ×0.72 (скидка)');
    assert.equal(SM.dailyUpkeep(setOf(), { upkeepMult: 0.8 }), 57, 'доктрина «Строй-устав» −20%');
    for (const m of [0.5, 0.9, 1, 1.05, 1.25, 1.5625, 2, 3, 4]) {
        assert.equal(SM.dailyUpkeep(setOf(), { upkeepMult: m }), Math.round(BASE * m), '×' + m);
    }
});

test('2.1 SM.dailyUpkeep: мусорный/выходящий за (0;4] множитель — нейтральный ×1; правило провинции (0;3] без изменений', () => {
    for (const bad of [0, -1, -0.5, 4.01, 100, NaN, Infinity, -Infinity, 'x', null, undefined, {}, []]) {
        assert.equal(SM.dailyUpkeep(setOf(), { upkeepMult: bad }), BASE, 'upkeepMult=' + String(bad));
    }
    assert.equal(SM.dailyUpkeep(setOf(), { provinceUpkeepMult: 1.1 }), 78, 'Пепел +10%');
    assert.equal(SM.dailyUpkeep(setOf(), { provinceUpkeepMult: 0.9 }), 64, 'Хутора −10%');
    assert.equal(SM.dailyUpkeep(setOf(), { provinceUpkeepMult: 3.01 }), BASE, 'правило провинции за кап (0;3] — нейтрально');
    assert.equal(SM.dailyUpkeep(setOf(), { upkeepMult: 2, provinceUpkeepMult: 1.1 }), 156, 'множители перемножаются: 71×2×1.1');
    const ruined = setOf(); ruined.ec3 = bld('ruin');
    assert.equal(SM.dailyUpkeep(ruined, { upkeepMult: 2 }), 72, 'руина не ест, множитель ×2 к остатку (36×2)');
});

test('2.1 SM.corruptionTick списывает ровно SM.dailyUpkeep (множители >1 не теряются между превью и тиком)', () => {
    for (const opts of [{ upkeepMult: 2 }, { upkeepMult: 1.25 }, { upkeepMult: 0.72 }, { upkeepMult: 2.5, provinceUpkeepMult: 1.1 }]) {
        const res = SM.corruptionTick(setOf(), 100000, 20, Object.assign({ step: 2 }, opts));
        assert.equal(res.upkeep, SM.dailyUpkeep(setOf(), opts), JSON.stringify(opts));
        assert.equal(res.paid, true);
        assert.equal(res.gold, 100000 - res.upkeep, 'золото уменьшилось на полное содержание');
    }
});

// ================================================================
// Харнесс тика/превью (реальные функции app.js, реальный SM и каталог)
// ================================================================

function economyDecls() {
    return ['builtList', 'stageMult', 'corruptionStepNow', 'corruptionTickOpts', 'shIncomePerDay', 'shUpkeepPerDay', 'strongholdsDailyTick'].map(extractFn);
}
function neutralMults() {
    return {
        weatherSeasonWeek: () => ({ sn: 1, wk: 1 }),
        synergyEcMult: () => 1, bossArtifactMult: () => 1, weatherTaxMult: () => 1, edictTaxMult: () => 1,
        weatherUpkeepMult: () => 1, stanceUpkeepMult: () => 1, doctrineUpkeepMult: () => 1, doctrineCrownMult: () => 1,
        techUpkeepMult: () => 1, techMarketBonus: () => 0, techVirtualRoutes: () => 0, techIdeaMult: () => 1, techTradeMult: () => 1,
        hasTech: () => false, taxMultiplier: () => 1, totemGoldMult: () => 1, holidayBonus: () => null, techOrderActive: () => false,
        provCapturedCount: () => 0, provResourceMult: () => 0, hasSpecialOk: () => false, techGraceBonus: () => 0, techCorrSlow: () => 1,
        weeklyModsNow: () => ({ income: 1, upkeep: 1, siege: 1 }),
        ensureStrongholdState: () => {}, dqProgress: () => {}, checkDailyGoldGoal: () => {}
    };
}
// превью СЧИТАЕТСЯ ДО тика на том же состоянии (тик мутирует золото и стадии построек)
function previewAndTick(overrides) {
    const strongholds = mkStrongholds(CAPTURED);
    const stubs = Object.assign(neutralMults(), {
        SM: SM, STRONGHOLDS: DATA.STRONGHOLDS, BUILDINGS: DATA.BUILDINGS,
        HERO: { gold: 1000000 }, STATS: { wil: { value: 20 } }, strongholds: strongholds
    }, overrides);
    return buildIn({
        decls: economyDecls(), stubs,
        body: '(function() { var income = shIncomePerDay(), upkeep = shUpkeepPerDay(), goldBefore = HERO.gold; var t = strongholdsDailyTick(); return { income: income, upkeep: upkeep, tick: t, goldBefore: goldBefore, goldAfter: HERO.gold }; })()'
    });
}
// независимый оракул содержания: арифметика теста (71 × множитель × правило провинции, округление по-твердынно) —
// НЕ через SM.dailyUpkeep, иначе тест повторял бы клампу модели; правило провинции (Хутора/Пепел) — каталог модели
function oracleUpkeep(multByProv, extraProv) {
    let u = 0;
    CAPTURED.forEach((i) => {
        const prov = DATA.STRONGHOLDS[i].prov;
        u += Math.round(BASE * multByProv(prov) * (SM.provinceUpkeepMult(prov) * (extraProv || 1)));
    });
    return u;
}

test('2.1 тик и превью: стойка ×1.25 — по-твердынное округление, «Содержание» в превью == списанию тика', () => {
    const r = previewAndTick({ stanceUpkeepMult: () => 1.25 });
    // по-твердынно: round(71×1.25×правило провинции) на каждую из четырёх, а не один округлённый итог
    const want = oracleUpkeep(() => 1.25);
    assert.equal(r.tick.upkeep, want, 'тик списал содержание ×1.25 (до аудита — ×1)');
    assert.equal(r.upkeep, r.tick.upkeep, 'превью == тик');
    assert.ok(r.upkeep > oracleUpkeep(() => 1), 'штраф стойки реально больше базы');
    assert.equal(r.goldAfter, r.goldBefore + r.tick.income - r.tick.upkeep, 'золото в казне изменилось ровно на доход − содержание');
});

test('2.1 тик и превью: метель севера ×2 (только пров. 1–2), стойка и скидки доктрины/технологий перемножаются', () => {
    const north = (prov) => (prov <= 2 ? 2 : 1);
    const r = previewAndTick({
        weatherUpkeepMult: (prov) => north(prov), stanceUpkeepMult: () => 1.25,
        doctrineUpkeepMult: () => 0.8, techUpkeepMult: () => 0.9
    });
    const want = oracleUpkeep((prov) => 0.8 * north(prov) * 1.25 * 0.9); // порядок множителей как в corruptionTickOpts
    assert.equal(r.tick.upkeep, want, 'тик: метель × стойка × доктрина × технологии × правило провинции');
    assert.equal(r.upkeep, want, 'превью: то же число');
    assert.ok(r.upkeep > oracleUpkeep(() => 0.8 * 0.9), 'штрафы (метель, стойка) перевешивают скидки доктрины и технологий');
});

test('2.1 тик и превью: модификатор недели (эндгейм) умножает содержание по-твердынно как и правило провинции', () => {
    const r = previewAndTick({ weeklyModsNow: () => ({ income: 1, upkeep: 1.3, siege: 1 }) });
    const want = oracleUpkeep(() => 1, 1.3);
    assert.equal(r.tick.upkeep, want);
    assert.equal(r.upkeep, want);
});

// ================================================================
// 2.2 Единая формула дохода: тик == превью, и каждый множитель реально в строке «Налоги»
// ================================================================

const LOADED = {
    weatherSeasonWeek: () => ({ sn: 3, wk: 7 }),
    synergyEcMult: () => 1.08, bossArtifactMult: () => 1.05, weatherTaxMult: (prov) => (prov >= 3 ? 0.75 : 1), edictTaxMult: () => 1.2,
    taxMultiplier: () => 1.1, weeklyModsNow: () => ({ income: 1.3, upkeep: 1, siege: 1 }),
    totemGoldMult: () => 1.05, holidayBonus: () => ({ tickMult: 1.5 }), techOrderActive: (id) => id === 'sac',
    doctrineCrownMult: () => 1.1, techMarketBonus: () => 0.02, techVirtualRoutes: () => 1,
    hasTech: (id) => id === 'e2', techTradeMult: () => 1.4, techIdeaMult: () => 1.15,
    provCapturedCount: () => 3, provResourceMult: () => 1.04
};

test('2.2 доход: превью «Налоги» == дневной тик при всех множителях сразу (тотем, праздник, жатва, корона, идея, торговля, ресурсы)', () => {
    const r = previewAndTick(LOADED);
    assert.equal(r.tick.income, r.income, 'превью == тик, байт-в-байт');
    assert.equal(r.goldAfter, r.goldBefore + r.tick.income - r.tick.upkeep, 'доход реально зачислен');
    const neutral = previewAndTick({});
    assert.ok(r.income > neutral.income * 1.5, 'множители реально применены: ' + neutral.income + ' → ' + r.income);
});

test('2.2 доход: каждый из множителей, которых раньше не было в превью, меняет строку «Налоги» и совпадает с тиком', () => {
    const neutral = previewAndTick({});
    assert.ok(neutral.income > 0, 'база: налоги и «эконом»-постройки дают доход');
    const singles = {
        'тотем Волк +5%': { totemGoldMult: () => 1.05 },
        'праздник «Новый год» ×1.5': { holidayBonus: () => ({ tickMult: 1.5 }) },
        '«Великая жатва» ×1.3': { techOrderActive: (id) => id === 'sac' },
        'Путь Богатства ×1.15 (ресурсы провинций)': { techIdeaMult: () => 1.15, provCapturedCount: () => 1, provResourceMult: () => 1 },
        'techMarketBonus (Ярмарочные Площади)': { techMarketBonus: () => 0.05 },
        'techVirtualRoutes (Старые Тропы)': { techVirtualRoutes: () => 2 },
        'гильдии e2 + консульства (techTradeMult)': { hasTech: (id) => id === 'e2', techVirtualRoutes: () => 3, techTradeMult: () => 1.4 },
        'корона и скипетр +10%': { doctrineCrownMult: () => 1.1 },
        'модификатор недели ×1.3': { weeklyModsNow: () => ({ income: 1.3, upkeep: 1, siege: 1 }) },
        'эдикт провинции ×1.2': { edictTaxMult: () => 1.2 },
        'венцы/ярмарка ×1.1': { taxMultiplier: () => 1.1 }
    };
    for (const name of Object.keys(singles)) {
        const r = previewAndTick(singles[name]);
        assert.equal(r.income, r.tick.income, name + ': превью == тик');
        assert.notEqual(r.income, neutral.income, name + ': множитель виден в «Налогах» (до аудита превью его игнорировало)');
    }
});

test('2.2 доход: брейкдаун покупки (P6) и прогноз «до руины» (P7) читают те же shIncomePerDay/shUpkeepPerDay', () => {
    const forecast = extractFn('corruptionForecastDays');
    assert.ok(forecast.includes('shIncomePerDay()') && forecast.includes('shUpkeepPerDay()'), 'прогноз руины — на единых формулах');
    const buy = app.slice(app.indexOf('var incomeBefore = shIncomePerDay(), upkeepBefore = shUpkeepPerDay()'), app.indexOf('incomeAfter = shIncomePerDay(); upkeepAfter = shUpkeepPerDay();') + 80);
    assert.ok(buy.includes('incomeBefore') && buy.includes('upkeepAfter'), 'превью покупки — до/после теми же функциями');
});

test('2.2 структура: тик не держит копию формулы дохода, содержание считается через corruptionTickOpts и SM.dailyUpkeep', () => {
    const tick = extractFn('strongholdsDailyTick');
    assert.ok(tick.includes('shIncomePerDay()'), 'тик берёт доход из единой функции');
    for (const dup of ['synergyEcMult', 'weatherTaxMult', 'edictTaxMult', 'totemGoldMult', 'doctrineCrownMult', 'taxMultiplier', 'techIdeaMult', 'techOrderActive']) {
        assert.ok(!tick.includes(dup), 'в тике нет второй копии формулы дохода (' + dup + ')');
    }
    const upk = extractFn('shUpkeepPerDay');
    assert.ok(upk.includes('corruptionTickOpts(') && upk.includes('SM.dailyUpkeep'), 'превью содержания — теми же опциями, что и тик');
    const model = extractBlock(modelSrc, 'function dailyUpkeep(');
    assert.ok(!/upkMult\s*>\s*1\b/.test(model), 'клампа «≤1» в модели больше нет');
    assert.ok(/upkMult\s*>\s*4/.test(model), 'остался санити-кап (0;4]');
});
