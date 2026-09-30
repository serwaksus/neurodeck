'use strict';
// P6: объяснимость экономики — брейкдауны. (1) Покупка здания: контрфакт «до → после»
// через существующие превью казны (shIncomePerDay/shUpkeepPerDay) — формулы не дублируются,
// состояние восстанавливается в finally; окупаемость = ceil(цена / (Δдоход − Δсодержание)).
// (2) Штурм: соотношение, worst-case потери по attrition-формуле модели (поражение — верхний
// край rand()=1), эффекты подхода недели и осадного склада. Харнессы — extract-паттерн wave3
// (функции поодиночке, same-layer зависимости закрываются стабами).

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
// buildingBreakdown: контрфакт через превью казны + восстановление состояния
// ----------------------------------------------------------------

test('P6 buildingBreakdown: Δдоход/Δсодержание из двух прогонов превью, окупаемость ceil(цена/нетто)', () => {
    const strongholds = [{ captured: true, buildings: {} }];
    const b = buildIn({
        decls: [extractFn('buildingBreakdown')],
        stubs: {
            strongholds,
            STRONGHOLDS: [{ prov: 1, slots: 6 }],
            BUILDINGS: { ec2: { id: 'ec2', cost: 180, upkeep: 15, gold: 20 } },
            // превью казны «видит» подставленную постройку — как настоящий расчёт
            shIncomePerDay: () => strongholds[0].buildings.ec2 ? 23 : 1,
            shUpkeepPerDay: () => strongholds[0].buildings.ec2 ? 15 : 0,
            buildCostOf: () => 180,
            ensureStrongholdState: () => {}
        },
        body: 'buildingBreakdown(0, "ec2")'
    });
    assert.equal(b.cost, 180);
    assert.equal(b.incomeBefore, 1, 'до: превью без постройки');
    assert.equal(b.incomeAfter, 23, 'после: превью с постройкой');
    assert.equal(b.dIncome, 22);
    assert.equal(b.dUpkeep, 15);
    assert.equal(b.net, 7, 'нетто = Δдоход − Δсодержание');
    assert.equal(b.payback, Math.ceil(180 / 7), 'окупаемость 26 дн');
    assert.equal(strongholds[0].buildings.ec2, undefined, 'временная постройка удалена (restore)');
});

test('P6 buildingBreakdown: существующая (не построенная) запись восстанавливается байт-в-байт', () => {
    const prevEntry = { built: false, corruptionStage: 'ok', debtDays: 4 };
    const strongholds = [{ captured: true, buildings: { ec2: prevEntry } }];
    const b = buildIn({
        decls: [extractFn('buildingBreakdown')],
        stubs: {
            strongholds,
            STRONGHOLDS: [{ prov: 1, slots: 6 }],
            BUILDINGS: { ec2: { id: 'ec2', cost: 180, upkeep: 15 } },
            shIncomePerDay: () => strongholds[0].buildings.ec2.built ? 23 : 1,
            shUpkeepPerDay: () => 0,
            buildCostOf: () => 180,
            ensureStrongholdState: () => {}
        },
        body: 'buildingBreakdown(0, "ec2")'
    });
    assert.equal(b.payback, Math.ceil(180 / 22));
    assert.equal(strongholds[0].buildings.ec2, prevEntry, 'та же ссылка — не затёрта');
    assert.equal(strongholds[0].buildings.ec2.built, false);
    assert.equal(strongholds[0].buildings.ec2.debtDays, 4);
});

test('P6 buildingBreakdown: нетто ≤ 0 → payback null; мусорный bid → null', () => {
    // жильё: доход не меняется, содержание растёт → нетто < 0, окупаемости нет
    const strongholds = [{ captured: true, buildings: {} }];
    const b = buildIn({
        decls: [extractFn('buildingBreakdown')],
        stubs: {
            strongholds,
            STRONGHOLDS: [{ prov: 1, slots: 6 }],
            BUILDINGS: { zh1: { id: 'zh1', cost: 60, upkeep: 3 } },
            shIncomePerDay: () => 1,
            shUpkeepPerDay: () => strongholds[0].buildings.zh1 ? 3 : 0,
            buildCostOf: () => 60,
            ensureStrongholdState: () => {}
        },
        body: 'buildingBreakdown(0, "zh1")'
    });
    assert.equal(b.dIncome, 0);
    assert.equal(b.net, -3);
    assert.equal(b.payback, null, 'отрицательное нетто — окупаемости нет');
    const nil = buildIn({
        decls: [extractFn('buildingBreakdown')],
        stubs: {
            strongholds: [{ captured: true, buildings: {} }],
            STRONGHOLDS: [{ prov: 1, slots: 6 }],
            BUILDINGS: {},
            shIncomePerDay: () => 1,
            shUpkeepPerDay: () => 0,
            buildCostOf: () => 0,
            ensureStrongholdState: () => {}
        },
        body: 'buildingBreakdown(0, "nope")'
    });
    assert.equal(nil, null, 'неизвестный bid — без брейкдауна');
});

// ----------------------------------------------------------------
// buildingBreakdownHtml: текст тайла покупки
// ----------------------------------------------------------------

test('P6 buildingBreakdownHtml: «до → после», цена в окупаемости, «золотом не окупается»', () => {
    const html = (b) => buildIn({
        decls: [extractFn('buildingBreakdownHtml')],
        stubs: { buildingBreakdown: () => b },
        body: 'buildingBreakdownHtml(0, "x")'
    });
    const ec = html({ cost: 180, incomeBefore: 1, incomeAfter: 23, upkeepBefore: 0, upkeepAfter: 15, dIncome: 22, dUpkeep: 15, net: 7, payback: 26 });
    assert.ok(ec.includes('sh-tile-break'), 'класс строки брейкдауна');
    assert.ok(ec.includes('доход 1→23/д'), 'доход до → после');
    assert.ok(ec.includes('содержание 0→15/д'), 'upkeep-дельта');
    assert.ok(ec.includes('180💰 окуп. ≈26 дн'), 'цена + окупаемость');
    const zh = html({ cost: 60, incomeBefore: 1, incomeAfter: 1, upkeepBefore: 0, upkeepAfter: 3, dIncome: 0, dUpkeep: 3, net: -3, payback: null });
    assert.ok(zh.includes('60💰 золотом не окупается'), 'жильё/оборона честно про нетто');
    assert.ok(!zh.includes('доход'), 'без Δдоход нет пустой строки дохода');
    const flat = html({ cost: 0, incomeBefore: 0, incomeAfter: 0, upkeepBefore: 0, upkeepAfter: 0, dIncome: 0, dUpkeep: 0, net: 0, payback: null });
    assert.equal(flat, '', 'нулевые дельты — строка не рисуется');
    assert.equal(html(null), '', 'нет брейкдауна — пусто');
});

// ----------------------------------------------------------------
// assaultBreakdownHtml: ratio, worst-case по attrition-формуле, подход/склад
// ----------------------------------------------------------------

test('P6 assaultBreakdownHtml: победа — соотношение + детерминированные потери формулой модели', () => {
    const html = buildIn({
        decls: [extractFn('assaultBreakdownHtml')],
        stubs: {
            SM: SM,
            STATS: { agi: { value: 0 } },
            siege: { rams: 0, ladders: 0 },
            army: { units: { t7: 100 } },
            hasSpecialOk: (bid) => bid === 'sp1', // sp1 жив (точные числа), sp2 нет (без ×0.8)
            weekApproach: () => 'assault'
        },
        body: 'assaultBreakdownHtml(1, { atk: 150000, defN: 100 })'
    });
    assert.ok(html.includes('assault-breakdown'), 'класс блока');
    assert.ok(html.includes('Соотношение: 150000'), 'точное соотношение при sp1: 150000/100 → 150000%');
    assert.ok(html.includes('Победа вероятна: потери ≈8%'), 'ratio 1500 → clamp 0.08');
    assert.ok(html.includes('−8 из 100 юнитов'), 'потери в юнитах по floor-семантике doAssault');
    assert.ok(!html.includes('Таран') && !html.includes('Лестницы') && !html.includes('Подход'), 'без склада/подхода — без их строк');
});

test('P6 assaultBreakdownHtml: поражение — worst-case 30% верхним краем формулы, таран ×0.9', () => {
    const html = buildIn({
        decls: [extractFn('assaultBreakdownHtml')],
        stubs: {
            SM: SM,
            STATS: { agi: { value: 0 } },
            siege: { rams: 1, ladders: 2 },
            army: { units: { t7: 100 } },
            hasSpecialOk: () => false,
            weekApproach: () => 'siege'
        },
        body: 'assaultBreakdownHtml(1, { atk: 50, defN: 100 })'
    });
    assert.ok(html.includes('Соотношение скрыто'), 'без sp1 точное число не палится');
    assert.ok(html.includes('потери 10–30%'), 'честный диапазон неудачи');
    assert.ok(html.includes('worst-case −27 из 100 юнитов (27%)'), 'rand()=1 → 30%, таран ×0.9 → 27%');
    assert.ok(html.includes('Подход «Осада»'), 'строка подхода недели');
    assert.ok(html.includes('Таран со склада'), 'эффект тарана');
    assert.ok(html.includes('Лестницы со склада'), 'эффект лестниц');
});

test('P6 assaultBreakdownHtml: worst-case переиспользует attrition-формулу модели (пин семантики)', () => {
    // поражение без расходников: верхний край = 30% ровно (формула 10 + rand×20 при rand=1)
    assert.equal(SM.assaultOutcome(50, 100, { rand: () => 1 }).attritionPct, 0.30);
    // победа: worst-case = самой формуле победы (клэмп 0.08..0.30 / ratio)
    assert.equal(SM.assaultOutcome(200, 100, { agi: 0 }).attritionPct, 0.15);
});

// ----------------------------------------------------------------
// Встройка: тайл покупки + оба подтверждения штурма (пины wave-g1 не тронуты)
// ----------------------------------------------------------------

test('P6 встройка: buyTileHtml несёт брейкдаун; requestAssault/requestTactic рендерят блок', () => {
    const buy = extractFn('buyTileHtml');
    assert.ok(buy.includes('buildingBreakdownHtml(idx, id)'), 'тайл покупки вызывает брейкдаун');
    const ra = extractFn('requestAssault');
    assert.ok(ra.includes('assaultBreakdownHtml(idx, f)'), 'подтверждение до 3 захватов — с брейкдауном');
    assert.ok(ra.includes('requestTactic(idx, f)'), 'пин wave-g1: тактическая модалка');
    assert.ok(ra.includes('doAssault(idx, f, t)'), 'пин wave-g1: тактика пробрасывается');
    assert.ok(ra.includes('capturedCount() >= 3'), 'пин wave-g1: гейт 3 захватов');
    const rt = extractFn('requestTactic');
    assert.ok(rt.includes('assaultBreakdownHtml(idx, f)'), 'тактическая модалка — с брейкдауном');
});

test('P6 CSS: .sh-tile-break/.assault-breakdown + eco/reduced-motion гейты', () => {
    for (const sel of ['.sh-tile-break', '.assault-breakdown']) assert.ok(css.includes(sel), 'css ' + sel);
    assert.ok(css.includes(':root.perf-eco .sh-tile-break'), 'eco-гейт брейкдаунов');
    assert.ok(/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,400}\.assault-breakdown/.test(css), 'reduced-motion гейт брейкдаунов');
});
