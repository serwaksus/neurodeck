'use strict';
// P10: консолидированная панель подготовки осады — разведка-статус, подход недели (+отмена до тика),
// осадный склад, превью до/после (фронтальный штурм + недельная оборона) и «рискованно»-подтверждение
// при ratio<1.2. НОВЫХ полей состояния нет: подход — runtime-вар, склад/тень — существующие поля схемы.
// Харнессы — extract-паттерн wave3/P6 (функции поодиночке, same-layer зависимости закрываются стабами).

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
// assaultRiskInfo: порог ratio < 1.2 (лестницы ×1.05 учтены — то же соотношение, что в превью)
// ----------------------------------------------------------------

function riskWith(atk, defN, siegeCounts) {
    return buildIn({
        decls: [extractFn('assaultRiskInfo')],
        stubs: {
            SM,
            STATS: { agi: { value: 3 } },
            siege: Object.assign({ rams: 0, ladders: 0 }, siegeCounts),
            hasSpecialOk: () => false,
        },
        body: 'assaultRiskInfo({ atk: ' + atk + ', defN: ' + defN + ' })',
    });
}

test('P10 risk: ratio ≥ 1.2 — рискованной пометки нет (граница 1.2 включительно)', () => {
    assert.equal(riskWith(200, 100), '', 'ratio 2.0 — норма');
    assert.equal(riskWith(120, 100), '', 'ratio ровно 1.2 — ещё не риск');
});

test('P10 risk: ratio < 1.2 — «РИСКОВАННО» с честным числом и порогом', () => {
    const r = riskWith(100, 100);
    assert.ok(r.includes('assault-risk'), 'класс блока');
    assert.ok(r.includes('РИСКОВАННО'), 'маркер риска');
    assert.ok(r.includes('100% &lt; 120%'), 'соотношение и порог');
    assert.ok(r.includes('потери 10–30%'), 'честный диапазон неудачи');
    assert.ok(riskWith(50, 100).includes('50% &lt; 120%'), 'проигрышный ratio тоже помечен');
});

test('P10 risk: лестницы (+5% к ratio) могут снять пометку — порог по тому же соотношению, что в превью', () => {
    // 115/100 = 1.15 → риск; с лестницами 1.15×1.05 = 1.2075 ≥ 1.2 — риск снят
    assert.ok(riskWith(115, 100).includes('РИСКОВАННО'), 'без лестниц — риск');
    assert.equal(riskWith(115, 100, { ladders: 1 }), '', 'с лестницами — норма');
});

test('P10 risk: мусорный прогноз — пустая строка, не падение', () => {
    assert.equal(riskWith(NaN, 100), '', 'atk NaN');
    assert.equal(riskWith(100, 0), '', 'обороны нет — штурм без риска');
    assert.equal(buildIn({ decls: [extractFn('assaultRiskInfo')], stubs: { SM, STATS: { agi: { value: 3 } }, siege: { rams: 0, ladders: 0 }, hasSpecialOk: () => false }, body: 'assaultRiskInfo(null)' }), '', 'f null');
});

// ----------------------------------------------------------------
// requestApproachCancel: отмена подготовки до тика (runtime-вар, сейва нет)
// ----------------------------------------------------------------

test('P10 отмена: подход ≠ «Штурм» — сброс к норме, тост и ререндер', () => {
    const calls = { toast: 0, render: 0, haptic: 0 };
    const out = buildIn({
        decls: ['var siegeApproach = \'siege\';', extractFn('requestApproachCancel')],
        stubs: {
            weekApproach: () => 'siege',
            showToast: () => calls.toast++,
            haptic: () => calls.haptic++,
            renderStrongholds: () => calls.render++,
        },
        body: '(function(){ requestApproachCancel(); return siegeApproach; })',
    });
    assert.equal(out(), 'assault', 'подход сброшен в «Штурм»');
    assert.equal(calls.toast, 1, 'тост об отмене');
    assert.equal(calls.render, 1, 'панель перерендерена');
    assert.equal(calls.haptic, 1, 'haptic');
});

test('P10 отмена: уже «Штурм» — no-op без тоста и ререндера', () => {
    const calls = { toast: 0, render: 0 };
    const out = buildIn({
        decls: ['var siegeApproach = \'assault\';', extractFn('requestApproachCancel')],
        stubs: {
            weekApproach: () => 'assault',
            showToast: () => calls.toast++,
            haptic: () => {},
            renderStrongholds: () => calls.render++,
        },
        body: '(function(){ requestApproachCancel(); return siegeApproach; })',
    });
    assert.equal(out(), 'assault');
    assert.equal(calls.toast, 0, 'нечего отменять — молча');
    assert.equal(calls.render, 0);
});

test('P10 отмена: уже «Штурм» — no-op без тоста и ререндера', () => {
    const calls = { toast: 0, render: 0 };
    const out = buildIn({
        decls: ['var siegeApproach = \'assault\';', extractFn('requestApproachCancel')],
        stubs: {
            weekApproach: () => 'assault',
            showToast: () => calls.toast++,
            haptic: () => {},
            renderStrongholds: () => calls.render++,
        },
        body: '(function(){ requestApproachCancel(); return siegeApproach; })',
    });
    assert.equal(out(), 'assault');
    assert.equal(calls.toast, 0, 'нечего отменять — молча');
    assert.equal(calls.render, 0);
});

// ----------------------------------------------------------------
// siegePrepScoutHtml: статус разведки (существующая механика тени Г2-3)
// ----------------------------------------------------------------

function scoutWith({ state, targets, today = '2026-10-01' }) {
    return buildIn({
        decls: [extractFn('siegePrepScoutHtml')],
        stubs: {
            HERO: { scouts: state },
            getMSKDayKey: () => today,
            scoutFresh: (sc, t) => (sc && sc.st) || null,
            daysBetween: (a, b) => (state && state.delta !== undefined ? state.delta : -1),
            STRONGHOLDS: [{ name: 'Фронт' }, { name: 'Тыл' }],
            strongholds: [{ captured: false }, { captured: true }],
            frontIdx: () => 0,
            assaultTargetChoices: () => targets,
            scoutReportHtml: (i) => '<div class="sh-scout">REPORT-' + i + '</div>',
            esc: (s) => s,
        },
        body: 'siegePrepScoutHtml()',
    });
}

test('P10 разведка: тень в пути — статус без отчёта', () => {
    const html = scoutWith({ state: { st: 'pending', idx: 0 }, targets: [0] });
    assert.ok(html.includes('тень в пути'), 'статус «в пути»');
    assert.ok(!html.includes('REPORT-'), 'чисел ещё нет');
});

test('P10 разведка: свежий отчёт по фронту — «на фронте» + полный отчёт тени', () => {
    const html = scoutWith({ state: { st: 'fresh', idx: 0, delta: -1 }, targets: [0] });
    assert.ok(html.includes('свежий отчёт по «Фронт»'), 'имя цели');
    assert.ok(html.includes('на фронте'), 'цель на фронте');
    assert.ok(html.includes('REPORT-0'), 'детальный отчёт консолидирован в панель');
});

test('P10 разведка: цель позади фронта и захваченная — честные статусы', () => {
    assert.ok(scoutWith({ state: { st: 'fresh', idx: 1, delta: -1 }, targets: [0] }).includes('цель уже захвачена'), 'захвачена раньше фронта');
    const behind = buildIn({
        decls: [extractFn('siegePrepScoutHtml')],
        stubs: {
            HERO: { scouts: { st: 'fresh', idx: 1 } },
            getMSKDayKey: () => '2026-10-01',
            scoutFresh: (sc) => sc.st,
            daysBetween: () => -1,
            STRONGHOLDS: [{ name: 'Фронт' }, { name: 'Тыл' }],
            strongholds: [{ captured: false }, { captured: false }],
            frontIdx: () => 0,
            assaultTargetChoices: () => [0],
            scoutReportHtml: () => '<div class="sh-scout">REPORT</div>',
            esc: (s) => s,
        },
        body: 'siegePrepScoutHtml()',
    });
    assert.ok(behind.includes('цель позади фронта'), 'не захвачена, но не фронтир');
});

test('P10 разведка: устаревание и «разведки нет»', () => {
    assert.ok(scoutWith({ state: { st: 'fresh', idx: 0, delta: -2 }, targets: [0] }).includes('устареет завтра'), 'последний день годности');
    assert.ok(scoutWith({ state: null, targets: [0] }).includes('Разведки нет'), 'тени не было');
    assert.ok(scoutWith({ state: null, targets: [0] }).includes('тень на фронте даст точные силы'), 'подсказка про тень');
});

// ----------------------------------------------------------------
// siegePrepPreviewHtml: превью до/после — штурм фронта + недельная оборона
// ----------------------------------------------------------------

function previewWith({ targets = [5], forecast, def, dts = 3, risk = '' }) {
    return buildIn({
        decls: [extractFn('siegePrepPreviewHtml')],
        stubs: {
            SM,
            assaultTargetChoices: () => targets,
            frontIdx: () => (targets.length ? targets[0] : -1),
            STRONGHOLDS: { 5: { name: 'Цель' } },
            assaultForecast: () => forecast,
            daysToSiegeNow: () => dts,
            siegeAlarmPreview: () => def,
            assaultRiskInfo: () => risk,
            assaultBreakdownHtml: () => '<div class="assault-breakdown">BD</div>',
            esc: (s) => s,
        },
        body: 'siegePrepPreviewHtml()',
    });
}

test('P10 превью: штурм фронта — заголовок «до/после» с прогнозом + брейкдаун; оборона недели с числами', () => {
    const html = previewWith({ forecast: { line: '⚔ 120 против 🛡 100' }, def: { power: 90, def: 80, ratio: 0.89, advice: 'Держимся, но запас гарнизона не лишний' } });
    assert.ok(html.includes('Штурм фронта «Цель» — до/после'), 'заголовок штурма');
    assert.ok(html.includes('⚔ 120 против 🛡 100'), 'строка прогноза (существующий assaultForecast)');
    assert.ok(html.includes('>BD<'), 'брейкдаун P6 переиспользован');
    assert.ok(html.includes('Осада недели (через 3 дн.): враг ~90 · оборона 80 (89%) — Держимся'), 'оборона недели (существующий siegeAlarmPreview)');
});

test('P10 превью: воскресенье — «сегодня ночью»; туман — без процента; риск — в строке штурма', () => {
    assert.ok(previewWith({ forecast: { line: 'L' }, def: { power: 1, def: 1, ratio: null, advice: 'Туман' }, dts: 0 }).includes('Осада недели сегодня ночью'), 'день осады');
    assert.ok(previewWith({ forecast: { line: 'L' }, def: { power: 1, def: 1, ratio: null, advice: 'Туман' }, dts: 0 }).includes('оборона 1 — Туман'), 'ratio null — тире вместо %');
    assert.ok(previewWith({ forecast: { line: 'L' }, def: null, risk: '<div class="assault-risk">RISK</div>' }).includes('RISK'), 'рискованная пометка дублируется в панель');
});

test('P10 превью: нечего показывать — пусто (без захвата и без прогноза)', () => {
    assert.equal(previewWith({ forecast: null, def: null }), '');
});

// ----------------------------------------------------------------
// siegePrepBlockHtml: консолидация — секции панели и кнопка отмены
// ----------------------------------------------------------------

function blockWith({ cur = 'assault', rams = 0, ladders = 0 }) {
    return buildIn({
        decls: [extractFn('siegePrepBlockHtml')],
        stubs: {
            SM,
            weekApproach: () => cur,
            siege: { rams, ladders },
            siegePrepScoutHtml: () => '<div class="sh-scout">SCOUT</div>',
            siegePrepPreviewHtml: () => '<div class="assault-breakdown">PREVIEW</div>',
        },
        body: 'siegePrepBlockHtml()',
    });
}

test('P10 панель: дефолт «Штурм» — разведка+подход+склад+превью, БЕЗ кнопки отмены', () => {
    const html = blockWith({ rams: 2, ladders: 1 });
    assert.ok(html.includes('siege-prep'), 'контейнер панели');
    assert.ok(html.includes('🧭 Подготовка осады'), 'заголовок панели');
    assert.ok(html.includes('SCOUT') && html.includes('PREVIEW'), 'секции разведки и превью');
    assert.ok(html.includes('таран ×2') && html.includes('лестницы ×1'), 'склад с числами');
    assert.ok(/aria-pressed="true"/.test(html) && /aria-pressed="false"/.test(html), 'aria-pressed у активного и неактивных подходов');
    assert.ok(!html.includes('km-approach-cancel'), 'нечего отменять — кнопки нет');
});

test('P10 панель: подход ≠ «Штурм» — кнопка отмены подготовки до тика', () => {
    const html = blockWith({ cur: 'siege' });
    assert.ok(html.includes('data-action="km-approach-cancel"'), 'действие отмены');
    assert.ok(html.includes('↩'), 'иконка');
    assert.ok(html.includes('aria-label="Отменить подготовку'), 'a11y-подпись');
    assert.ok(html.includes('title="Отмена подготовки до тика'), 'тултип с последствиями');
});

// ----------------------------------------------------------------
// Встройка: подтверждение штурма + dispatcher + renderStrongholds (пины wave-g1 не тронуты)
// ----------------------------------------------------------------

test('P10 встройка: requestAssault — «рискованно»-заголовок при риске, пины wave-g1 живы', () => {
    const ra = extractFn('requestAssault');
    assert.ok(ra.includes('⚠ Рискованный штурм «'), 'P10: рискованный заголовок подтверждения');
    assert.ok(ra.includes('assaultRiskInfo(f)'), 'P10: риск-пометка в теле подтверждения');
    assert.ok(ra.includes('capturedCount() >= 3'), 'пин wave-g1: гейт тактики');
    assert.ok(ra.includes('requestTactic(idx, f)'), 'пин wave-g1: тактическая модалка');
    assert.ok(ra.includes('doAssault(idx, f, t)'), 'пин wave-g1: тактика пробрасывается');
    assert.ok(ra.includes('dungeonConfirm'), 'пин wave-g1: обычный confirm до 3 захватов');
    const rt = extractFn('requestTactic');
    assert.ok(rt.includes('assaultRiskInfo(f)'), 'P10: рискованная пометка и в тактической модалке');
});

test('P10 встройка: единый клик подтверждения — doAssault без промежуточных модалок (правило 13)', () => {
    // рискованное подтверждение = тот же dungeonConfirm с ⚠-заголовком: линейные плейтесты
    // кликают #confirmYes один раз — поток не удлиняется
    const ra = extractFn('requestAssault');
    const m = ra.match(/dungeonConfirm\(([^)]*)/);
    assert.ok(m, 'вызов dungeonConfirm найден');
    assert.ok(m[1].includes('_risk'), 'заголовок выбирается по риску — без второй модалки');
});

test('P10 встройка: dispatcher + renderStrongholds — отмена из панели, отчёт тени консолидирован', () => {
    assert.ok(app.includes("case 'km-approach-cancel': requestApproachCancel();"), 'dispatcher: действие отмены');
    const rs = extractFn('renderStrongholds');
    assert.ok(!rs.includes('scoutReportHtml(front)'), 'P10: отдельный отчёт под картой убран');
    assert.ok(rs.includes('siegePrepBlockHtml()'), 'панель подготовки на месте');
    const sp = extractFn('siegePrepBlockHtml');
    assert.ok(sp.includes('siegePrepScoutHtml()') && sp.includes('siegePrepPreviewHtml()'), 'панель собирает разведку и превью');
});

test('P10 CSS: панель/отмена/риск + eco и reduced-motion гейты', () => {
    for (const sel of ['.siege-prep', '.sh-prep-cancel', '.assault-risk']) assert.ok(css.includes(sel), 'css ' + sel);
    assert.ok(css.includes(':root.perf-eco .siege-prep') && css.includes(':root.perf-eco .assault-risk'), 'eco-гейт новых блоков');
    assert.ok(/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,500}\.siege-prep/.test(css), 'reduced-motion гейт новых блоков');
});
