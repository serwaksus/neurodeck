'use strict';
// P7 «Коррупция по-человечески». (1) Модель: daysToRuin — симуляция дневного цикла SPEC §6
// (доход → содержание; оплаченный день лечит и обнуляет долг, дефицит растит долг, руина при
// долге > grace+step — ровно как в corruptionTick); dailyUpkeep — байт-паритет с corruptionTick;
// аварийный ремонт (цена max(1, 2×содержание), эффект = paid-ветка тика); rebuildCost −25%.
// (2) Проводка app.js: прогноз в панели, причина руины в тосте, экшены/кнопки. Харнессы —
// extract-паттерн wave3 (функции поодиночке, same-layer зависимости закрываются стабами).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
globalThis.StrongholdData = require('../js/stronghold-data.js');
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

function buildIn({ decls = [], stubs = {}, body }) {
    const src = decls.join('\n') + '\nreturn (' + body + ');';
    const keys = Object.keys(stubs);
    return new Function(...keys, src)(...keys.map((k) => stubs[k]));
}

// ----------------------------------------------------------------
// daysToRuin: прогноз «до руины N дн.» — семантика тика, без дублирования формулы стадий
// ----------------------------------------------------------------

test('P7 daysToRuin: руина при долге > grace+step; казна и доход задерживают дефицит', () => {
    assert.equal(SM.daysToRuin(0, 0, 10, 0, 2, 2), 5, 'долг с нуля: руина на 5-й день (лимит 4)');
    assert.equal(SM.daysToRuin(0, 0, 10, 3, 2, 2), 2, 'уже 3 дня долга — осталось 2');
    assert.equal(SM.daysToRuin(25, 0, 10, 0, 2, 2), 7, 'казна платит 3 дня (25/10), потом 4 дня долга');
    assert.equal(SM.daysToRuin(0, 5, 10, 3, 3, 2), 3, 'доход замедляет, но не спасает: долг > 5 на 3-й день');
    assert.equal(SM.daysToRuin(100, 10, 10, 0, 2, 2), null, 'баланс покрывает содержание — руина не грозит');
    assert.equal(SM.daysToRuin(1000, 10, 11, 0, 2, 2), null, 'медленный дефицит за горизонтом 365 дней — null');
    assert.equal(SM.daysToRuin(50, 0, 0, 5, 2, 2), null, 'содержание 0 — деградации нет');
    assert.equal(SM.daysToRuin('x', 'y', 'z', 1.7, -3, -3), null, 'мусорные входы не ломают (up NaN→0 → null)');
});

test('P7 daysToRuin: сверка с реальным corruptionTick — ночь за ночью до руины', () => {
    // одна постройка ec1 (содержание 10): каждую ночь казна пуста → дефицит; считаем ночи до руины
    const wil = 20; // grace = min(7, 2+floor(20/20)) = 3
    let buildings = { ec1: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    const up = SM.dailyUpkeep(buildings, {});
    let nights = 0, stage = 'ok';
    while (nights < 30 && stage !== 'ruin') {
        buildings = SM.corruptionTick(buildings, 0, wil, {}).buildings;
        nights++;
        stage = buildings.ec1.corruptionStage;
    }
    assert.equal(stage, 'ruin', 'ручная симуляция дошла до руины');
    assert.equal(nights, SM.daysToRuin(0, 0, up, 0, 3, 2), 'прогноз = числу ночей реального тика');
});

// ----------------------------------------------------------------
// dailyUpkeep / emergencyMaintenanceCost / applyEmergencyMaintenance / rebuildCost
// ----------------------------------------------------------------

test('P7 dailyUpkeep: байт-паритет с corruptionTick по всем множителям (руина не ест)', () => {
    const sets = [
        { zh1: { built: true, corruptionStage: 'ok', debtDays: 0 } },
        { zh1: { built: true, corruptionStage: 'worn', debtDays: 3 }, ec1: { built: true, corruptionStage: 'ruin', debtDays: 9 }, df1: { built: true, corruptionStage: 'ok', debtDays: 0 } },
        { ec2: { built: false, corruptionStage: 'ok', debtDays: 0 }, unknown: { built: true, corruptionStage: 'ok', debtDays: 0 } }
    ];
    const optSets = [{}, { upkeepMult: 0.8 }, { provinceUpkeepMult: 1.1 }, { upkeepMult: 0.72, provinceUpkeepMult: 0.9 }, { provinceUpkeepMult: 2 }];
    for (const b of sets) for (const o of optSets) {
        assert.equal(SM.dailyUpkeep(b, o), SM.corruptionTick(b, 1e6, 20, o).upkeep,
            'та же сумма, что платит тик: ' + JSON.stringify(o));
    }
});

test('P7 emergencyMaintenanceCost: ровно 2× дневного содержания, минимум 1💰', () => {
    const b = { zh1: { built: true, corruptionStage: 'worn', debtDays: 3 }, df1: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    assert.equal(SM.emergencyMaintenanceCost(b, {}), SM.dailyUpkeep(b, {}) * 2, '2× содержания');
    assert.equal(SM.emergencyMaintenanceCost({ ec1: { built: true, corruptionStage: 'ruin', debtDays: 9 } }, {}), 1,
        'тотальная руина: содержание 0, но бригада не бесплатно (анти-спам в клик)');
});

test('P7 applyEmergencyMaintenance: paid-ветка тика — +1 ступень всем, долг 0, вход не мутирует', () => {
    const src = {
        zh1: { built: true, corruptionStage: 'worn', debtDays: 3, builtAt: 123 },
        ec1: { built: true, corruptionStage: 'ruin', debtDays: 9 },
        df1: { built: true, corruptionStage: 'ok', debtDays: 0 },
        ec2: { built: false, corruptionStage: 'ok', debtDays: 0 }
    };
    const out = SM.applyEmergencyMaintenance(src);
    assert.equal(out.zh1.corruptionStage, 'ok', 'worn → ok');
    assert.equal(out.ec1.corruptionStage, 'worn', 'ruin → worn (одна ступень, не мгновенное «целое»)');
    assert.equal(out.df1.corruptionStage, 'ok', 'целое остаётся целым');
    assert.equal(out.zh1.debtDays, 0, 'долг обнулён');
    assert.equal(out.zh1.builtAt, 123, 'builtAt сохранён');
    assert.equal(out.ec2.built, false, 'непостроенное не «чинится»');
    assert.equal(src.zh1.corruptionStage, 'worn', 'вход не мутирован');
    assert.equal(src.ec1.debtDays, 9, 'вход не мутирован (долг)');
    // паритет с реальной paid-веткой corruptionTick (лечение на ступень, долг 0)
    const paidTick = SM.corruptionTick(src, 1e6, 20, {}).buildings;
    assert.equal(JSON.stringify(paidTick.zh1), JSON.stringify(out.zh1), 'worn: идентично paid-ветке');
    assert.equal(JSON.stringify(paidTick.ec1), JSON.stringify(out.ec1), 'ruin: идентично paid-ветке');
});

test('P7 rebuildCost: −25% от цены постройки, ceil; мусорная цена → 0', () => {
    assert.equal(SM.rebuildCost(100), 75);
    assert.equal(SM.rebuildCost(101), 76, 'ceil(75.75) = 76');
    assert.equal(SM.rebuildCost(0), 0);
    assert.equal(SM.rebuildCost(-5), 0);
    assert.equal(SM.rebuildCost(NaN), 0);
});

// ----------------------------------------------------------------
// Проводка app.js: прогноз в панели, причина руины в тосте, единые opts тика
// ----------------------------------------------------------------

test('P7 проводка: strongholdsDailyTick собирает причину руины и верёт опты из corruptionTickOpts', () => {
    const t = extractFn('strongholdsDailyTick');
    assert.ok(t.includes('SM.corruptionTick('), 'стадии — только через модель (пин strongholds-ui)');
    assert.ok(!/grace\s*=|debtDays\s*\+=/.test(t), 'формулы коррапшна не дублируются в app.js (пин strongholds-ui)');
    assert.ok(t.includes('corruptionTickOpts(i)'), 'опты тика — из единого хелпера (не копия формулы)');
    assert.ok(t.includes('ruined.push'), 'тик собирает новые руины (имя/твердыня/долг)');
    assert.ok(t.includes('ruined: ruined'), 'ruined возвращается вызывающему для тоста');
});

test('P7 проводка: checkDailyReset показывает тост-причину разрушения', () => {
    const d = extractFn('checkDailyReset');
    assert.ok(d.includes('ruinedNow'), 'руины дня накоплены (включая бэкфилл-ночи)');
    assert.ok(d.includes('Казна не платила содержание'), 'причина названа человеческим языком');
    assert.ok(d.includes('обратились в руину'), 'заголовок тоста о руине');
});

test('P7 проводка: прогноз в обзоре Твердынь + единый step/множители + экшены', () => {
    assert.ok(extractFn('renderStrongholds').includes('corruptionForecastLineHtml()'), 'строка прогноза в обзоре');
    const opts = extractFn('corruptionTickOpts');
    assert.ok(opts.includes('corruptionStepNow()'), 'step — из corruptionStepNow (единый с тиком)');
    assert.ok(opts.includes('weeklyModsNow().upkeep') && opts.includes('SM.provinceUpkeepMult'), 'множители тика не продублированы');
    assert.ok(app.includes("case 'sh-rebuild':"), 'диспетчер: sh-rebuild');
    assert.ok(app.includes("case 'sh-emergency-maint':"), 'диспетчер: sh-emergency-maint');
    assert.ok(extractFn('renderStrongholdPanel').includes('emergencyMaintNeeded(idx)'), 'блок аварийного ремонта в панели твердыни');
});

// ----------------------------------------------------------------
// corruptionForecastDays / corruptionForecastLineHtml (extract-харнессы)
// ----------------------------------------------------------------

test('P7 corruptionForecastDays: худший долг по королевству (руина/непостроенные/незахваченные не считаются)', () => {
    const strongholds = [
        { captured: true, buildings: {
            zh1: { built: true, corruptionStage: 'worn', debtDays: 3 },
            ec1: { built: true, corruptionStage: 'ruin', debtDays: 9 },
            ec2: { built: false, corruptionStage: 'ok', debtDays: 0 }
        } },
        { captured: false, buildings: { df1: { built: true, corruptionStage: 'ok', debtDays: 5 } } }
    ];
    const n = buildIn({
        decls: [extractFn('corruptionForecastDays')],
        stubs: {
            SM, strongholds, HERO: { gold: 0 }, STATS: { wil: { value: 20 } },
            shIncomePerDay: () => 5, shUpkeepPerDay: () => 10,
            corruptionStepNow: () => 2, ensureStrongholdState: () => {}
        },
        body: 'corruptionForecastDays()'
    });
    assert.equal(n, SM.daysToRuin(0, 5, 10, 3, 3, 2), 'долг 3 (max по живым), grace 3, step 2');
    const none = buildIn({
        decls: [extractFn('corruptionForecastDays')],
        stubs: {
            SM, strongholds: [{ captured: false, buildings: {} }], HERO: { gold: 0 },
            STATS: { wil: { value: 20 } }, shIncomePerDay: () => 5, shUpkeepPerDay: () => 10,
            corruptionStepNow: () => 2, ensureStrongholdState: () => {}
        },
        body: 'corruptionForecastDays()'
    });
    assert.equal(none, null, 'нечему рушиться — прогноза нет');
    const guarded = buildIn({
        decls: [extractFn('corruptionForecastDays')],
        stubs: {
            SM: {}, strongholds, HERO: { gold: 0 }, STATS: { wil: { value: 20 } },
            shIncomePerDay: () => 5, shUpkeepPerDay: () => 10,
            corruptionStepNow: () => 2, ensureStrongholdState: () => {}
        },
        body: 'corruptionForecastDays()'
    });
    assert.equal(guarded, null, 'старая модель без daysToRuin — тихий null (typeof-гвард)');
});

test('P7 corruptionForecastLineHtml: строка только при угрозе', () => {
    const mk = (v) => buildIn({
        decls: [extractFn('corruptionForecastLineHtml')],
        stubs: { corruptionForecastDays: () => v },
        body: 'corruptionForecastLineHtml()'
    });
    const line = mk(4);
    assert.ok(line.includes('sh-ruin-forecast') && line.includes('До руины: <b>4 дн.</b>'), 'число дней в строке');
    assert.equal(mk(null), '', 'нет угрозы — нет строки (базлайны обзора не дрейфуют)');
});

// ----------------------------------------------------------------
// requestEmergencyMaintenance / rebuildBuilding (extract-харнессы с UI-стабами)
// ----------------------------------------------------------------

function uiStubs(extra) {
    const rec = { toasts: [], saves: 0, chron: [], rerenders: 0 };
    const stubs = Object.assign({
        showToast: (t, x, k) => rec.toasts.push({ t, x, k }),
        sfxError: () => {}, sfxForge: () => {}, haptic: () => {},
        recalcHirePool: () => {},
        addChronicle: (i, s) => rec.chron.push(s),
        renderStrongholdPanel: () => rec.rerenders++,
        renderStrongholds: () => rec.rerenders++,
        updateHeroUI: () => {},
        saveGameState: () => rec.saves++,
        currentShIdx: 0,
        ensureStrongholdState: () => {}
    }, extra);
    return { rec, stubs };
}

test('P7 requestEmergencyMaintenance: платит 2× содержания, лечит на ступень, долг 0, сейв', () => {
    const buildings = {
        zh1: { built: true, corruptionStage: 'ruin', debtDays: 9 },
        df1: { built: true, corruptionStage: 'worn', debtDays: 4 }
    };
    const strongholds = [{ captured: true, buildings: buildings }];
    const want = SM.emergencyMaintenanceCost(buildings, {});
    const { rec, stubs } = uiStubs({
        SM, strongholds, HERO: { gold: want + 7 }, STRONGHOLDS: [{ name: 'Твердыня 1' }],
        corruptionTickOpts: () => ({}), emergencyMaintNeeded: () => true
    });
    buildIn({ decls: [extractFn('requestEmergencyMaintenance')], stubs, body: 'requestEmergencyMaintenance(0)' });
    assert.equal(stubs.HERO.gold, 7, 'списано ровно 2× содержания');
    assert.equal(strongholds[0].buildings.zh1.corruptionStage, 'worn', 'ruin → worn (+1 ступень)');
    assert.equal(strongholds[0].buildings.df1.corruptionStage, 'ok', 'worn → ok');
    assert.equal(strongholds[0].buildings.zh1.debtDays, 0, 'долг обнулён');
    assert.equal(rec.saves, 1, 'состояние сохранено');
    assert.ok(rec.toasts[0].t.includes('Аварийный ремонт'), 'тост об оплате');
});

test('P7 requestEmergencyMaintenance: мало золота/чинить нечего — казна и постройки не тронуты', () => {
    const buildings = { df1: { built: true, corruptionStage: 'worn', debtDays: 4 } };
    const want = SM.emergencyMaintenanceCost(buildings, {});
    const poor = uiStubs({
        SM, strongholds: [{ captured: true, buildings }], HERO: { gold: want - 1 },
        STRONGHOLDS: [{ name: 'Т' }], corruptionTickOpts: () => ({}), emergencyMaintNeeded: () => true
    });
    buildIn({ decls: [extractFn('requestEmergencyMaintenance')], stubs: poor.stubs, body: 'requestEmergencyMaintenance(0)' });
    assert.equal(poor.stubs.HERO.gold, want - 1, 'золото не списано');
    assert.equal(buildings.df1.corruptionStage, 'worn', 'постройка не лечена бесплатно');
    assert.equal(poor.rec.toasts[0].k, 'blood', 'отказ — blood-тост');
    assert.equal(poor.rec.saves, 0);
    const intact = { df1: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    const idle = uiStubs({
        SM, strongholds: [{ captured: true, buildings: intact }], HERO: { gold: 50 },
        STRONGHOLDS: [{ name: 'Т' }], corruptionTickOpts: () => ({}), emergencyMaintNeeded: () => false
    });
    buildIn({ decls: [extractFn('requestEmergencyMaintenance')], stubs: idle.stubs, body: 'requestEmergencyMaintenance(0)' });
    assert.ok(idle.rec.toasts[0].t.includes('Чинить нечего'), 'пустой ремонт — мягкий отказ');
    assert.equal(idle.stubs.HERO.gold, 50);
});

test('P7 rebuildBuilding: скидка 25% от цены постройки, «как новая» (builtAt иммунитет), сейв', () => {
    const buildings = { ec1: { built: true, corruptionStage: 'worn', debtDays: 4, builtAt: null } };
    const strongholds = [{ captured: true, buildings }];
    const { rec, stubs } = uiStubs({
        SM, strongholds, HERO: { gold: 100 },
        BUILDINGS: { ec1: { name: 'Рынок', upkeep: 10 } }, STRONGHOLDS: [{ name: 'Твердыня 1' }],
        buildCostOf: () => 100
    });
    buildIn({ decls: [extractFn('rebuildBuilding')], stubs, body: 'rebuildBuilding(0, "ec1")' });
    assert.equal(stubs.HERO.gold, 25, 'списано 75 (100 − 25%)');
    assert.equal(buildings.ec1.corruptionStage, 'ok', 'снова целая');
    assert.equal(buildings.ec1.debtDays, 0, 'долг сброшен');
    assert.ok(typeof buildings.ec1.builtAt === 'number' && buildings.ec1.builtAt > 0, 'builtAs новая: 7 дней иммунитета');
    assert.equal(rec.saves, 1);
    // целое не перестраивают + мало золота
    const intact = { df1: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    const s2 = uiStubs({
        SM, strongholds: [{ captured: true, buildings: intact }], HERO: { gold: 100 },
        BUILDINGS: { df1: { name: 'Стена', upkeep: 5 } }, STRONGHOLDS: [{ name: 'Т' }], buildCostOf: () => 100
    });
    buildIn({ decls: [extractFn('rebuildBuilding')], stubs: s2.stubs, body: 'rebuildBuilding(0, "df1")' });
    assert.ok(s2.rec.toasts[0].t.includes('Целое не перестраивают'), 'мягкий отказ для целого');
    assert.equal(s2.stubs.HERO.gold, 100);
    const poor = { ec1: { built: true, corruptionStage: 'ruin', debtDays: 9 } };
    const s3 = uiStubs({
        SM, strongholds: [{ captured: true, buildings: poor }], HERO: { gold: 74 },
        BUILDINGS: { ec1: { name: 'Рынок', upkeep: 10 } }, STRONGHOLDS: [{ name: 'Т' }], buildCostOf: () => 100
    });
    buildIn({ decls: [extractFn('rebuildBuilding')], stubs: s3.stubs, body: 'rebuildBuilding(0, "ec1")' });
    assert.equal(s3.rec.toasts[0].k, 'blood', 'мало золота — blood');
    assert.equal(poor.ec1.corruptionStage, 'ruin', 'руина не тронута');
});

test('P7 builtTileHtml: кнопка восстановления только у worn/ruin и только с ценой', () => {
    const mk = (stage, rb) => buildIn({
        decls: [extractFn('builtTileHtml')],
        stubs: {
            shSpriteImg: () => '<i>', buildingEffectText: () => 'эффект',
            stageBadgeHtml: (s) => '<i class="sh-stage">' + s + '</i>', catClass: () => 'cat-ec'
        },
        body: 'builtTileHtml("ec1", { name: "Рынок", icon: "🏪", upkeep: 10, cat: "econ" }, { corruptionStage: ' + JSON.stringify(stage) + ' }, ' + JSON.stringify(rb) + ')'
    });
    const worn = mk('worn', { idx: 2, cost: 75 });
    assert.ok(worn.includes('data-action="sh-rebuild" data-idx="2" data-bid="ec1"'), 'экшен+адрес постройки');
    assert.ok(worn.includes('🔨 Восстановить 75 💰 (−25%)'), 'цена со скидкой в кнопке');
    assert.equal(mk('ok', { idx: 2, cost: 75 }).includes('sh-rebuild'), false, 'целое — без кнопки');
    assert.equal(mk('ruin', null).includes('sh-rebuild'), false, 'старый вызов без цены (rb undefined) — без кнопки, harness wave3 совместим');
});

test('P7 CSS: .sh-ruin-forecast/.sh-emergency/.sh-rebuild (статичные — без motion-гейтов)', () => {
    for (const sel of ['.sh-ruin-forecast', '.sh-emergency', '.sh-rebuild']) assert.ok(css.includes(sel), 'css ' + sel);
});
