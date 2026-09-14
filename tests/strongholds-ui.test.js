// ============================================================
// tests/strongholds-ui.test.js — «Твердыни v2» этап 3b: UI, тики, снос легаси
// ============================================================
// 1) Интеграция тиков: checkDailyReset вызывает strongholdsDailyTick (коррапшн)
//    и runWeeklySiege (воскресная осада) — source-level по образцу integration.test.js.
// 2) Живой прогон модели: стадии коррапшна (обнулить золото → тик → worn),
//    восстановление, анти-тупик D3, штурм через SM.assaultOutcome.
// 3) Снос легаси: Карты (ROOMS/escapeProgress/ESCAPE_MAX) удалены, фронт-прогресс = захваченные.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const app = read('js/app.js');
const html = read('index.html');
const css = read('css/style.css');

function extractFn(src, name) {
    const start = src.indexOf('function ' + name);
    assert.ok(start > -1, name + ' не найдена');
    let depth = 0, end = -1, i = src.indexOf('{', start);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return src.slice(start, end + 1);
}

// ----------------------------------------------------------------
// Интеграция тиков (checkDailyReset → strongholdsDailyTick → corruptionTick; воскресенье → runWeeklySiege)
// ----------------------------------------------------------------

test('checkDailyReset вызывает дневной тик твердынь (содержание+коррапшн) и воскресную осаду', () => {
    const tick = extractFn(app, 'checkDailyReset');
    assert.ok(tick.includes('strongholdsDailyTick()'), 'дневной тик должен вызываться из checkDailyReset');
    assert.ok(tick.includes('runWeeklySiege()'), 'воскресная осада должна вызываться на переходе недели');
    assert.ok(tick.includes('recalcHirePool()'), 'понедельник: пул найма пересчитывается (SPEC §3)');
});

test('strongholdsDailyTick использует corruptionTick из stronghold-model (не дублирует формулу)', () => {
    const t = extractFn(app, 'strongholdsDailyTick');
    assert.ok(t.includes('SM.corruptionTick('), 'стадии деградации — только через модель');
    assert.ok(!/grace\s*=|debtDays\s*\+=/.test(t), 'формулы коррапшна не дублируются в app.js');
});

test('runWeeklySiege использует siegePower/defensePower модели и анти-тупик D3', () => {
    const s = extractFn(app, 'runWeeklySiege');
    assert.ok(s.includes('SM.siegePower('), 'siegePower — из модели');
    assert.ok(s.includes('SM.defensePower('), 'garDef — из модели');
    assert.ok(/capturedCount\(\)\s*===\s*0/.test(s) && s.includes('strongholds[0].captured = true'),
        'анти-тупик ADR П1-13: потеря всех → фронт №1');
    assert.ok(s.includes('wrath'), 'гнев (SPEC §5) учитывается');
});

test('штурм идёт через SM.assaultOutcome, подтверждается dungeonConfirm, лимит 1/сутки', () => {
    const req = extractFn(app, 'requestAssault');
    const doA = extractFn(app, 'doAssault');
    assert.ok(req.includes('dungeonConfirm'), 'штурм требует подтверждения с прогнозом сил');
    assert.ok(req.includes('siege.assaultDay'), 'лимит 1 штурм в сутки (SPEC §4)');
    assert.ok(doA.includes('SM.assaultOutcome('), 'расчёт боя — только через модель');
});

// ----------------------------------------------------------------
// Живой прогон модели: коррапшн-стадии (сценарий e2e «обнулить золото → тик → worn»)
// ----------------------------------------------------------------

const DATA = require('../js/stronghold-data.js');
globalThis.StrongholdData = DATA;
const SM = require('../js/stronghold-model.js');

test('коррапшн: обнулили золото → тик → стадия worn (grace wil=3 → 2 дня, step 2)', () => {
    const buildings = { zh1: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    // три ночи без золота: debt 1..3; worn при debt > grace(2) и ≤ grace+step(4)
    let b = buildings, stage = 'ok', debt = 0;
    for (let i = 0; i < 3; i++) {
        const r = SM.corruptionTick(b, 0, 3);
        b = r.buildings; stage = b.zh1.corruptionStage; debt = b.zh1.debtDays;
        assert.equal(r.paid, false, 'ночь ' + (i + 1) + ': оплата невозможна');
    }
    assert.equal(stage, 'worn', 'после 3 ночей долга (debt 3 > grace 2) — Обветшало');
    assert.equal(debt, 3);
});

test('коррапшн: оплата поднимает ступень (worn → ok), руина не ест', () => {
    let r = SM.corruptionTick({ zh1: { built: true, corruptionStage: 'worn', debtDays: 3 } }, 100, 3);
    assert.equal(r.buildings.zh1.corruptionStage, 'ok', 'оплаченный день лечит на 1 ступень');
    assert.equal(r.gold, 100 - DATA.BUILDINGS.zh1.upkeep, 'содержание списано');
    // руина: upkeep 0, золотые эффекты 0
    r = SM.corruptionTick({ zh1: { built: true, corruptionStage: 'ruin', debtDays: 9 } }, 5, 3);
    assert.equal(r.upkeep, 0, 'руина не ест');
    assert.equal(r.gold, 5);
});

// ----------------------------------------------------------------
// Снос легаси: Карты удалены, фронт-прогресс = захваченные твердыни (ADR §9)
// ----------------------------------------------------------------

test('легаси-Карта снесена: ROOMS/ESCAPE_MAX/renderMap/updateEscapeDisplay отсутствуют', () => {
    ['const ROOMS', 'ROOM_THEMES', 'ESCAPE_MAX', 'ROOMS_STEP', 'let escapeProgress',
     'function renderMap', 'function updateEscapeDisplay', 'function updateAtmosphereByEscape',
     'function openRoomDetail', 'function updatePlayerMarker']
        .forEach(tok => assert.equal(app.includes(tok), false, 'легаси-токен остался: ' + tok));
});

test('вкладка Карты заменена на Твердыни (nav, bottom-nav, view, диспетчер)', () => {
    assert.equal(/data-view="map"/.test(html), false, 'nav не должен ссылаться на view-map');
    assert.ok(html.includes('data-view="strongholds"'), 'вкладка Твердыни в nav/bottom-nav');
    assert.ok(html.includes('id="view-strongholds"'), 'view-strongholds в index.html');
    assert.ok(html.includes('id="strongholdsRoot"'), 'контейнер рендера твердынь');
    assert.ok(html.includes('id="siegeReportModal"'), 'модалка итогов осады');
    assert.ok(html.includes('data-action="close-siege-report"'), 'закрытие отчёта осады в статике');
    assert.ok(app.includes("case 'sh-assault'") && app.includes("case 'sh-open'") && app.includes("case 'sh-buy'"),
        'диспетчер действий твердынь');
    assert.ok(app.includes("if (view === 'strongholds') renderStrongholds();"), 'switchView рендерит твердыни');
});

test('hero: statRankups/statEscape заменены на «Твердынь N/20»', () => {
    assert.equal(html.includes('statRankups'), false);
    assert.equal(html.includes('statEscape'), false);
    assert.ok(html.includes('id="statStrongholds"'));
    assert.ok(app.includes("document.getElementById('statStrongholds').textContent = capturedCount() + ' / ' + STRONGHOLDS.length"));
});

test('header: «Побег» → «Твердыни», счётчик 0/20, кэш v54 единообразно', () => {
    assert.ok(html.includes('<span>Твердыни</span>'), 'заголовок progress-control');
    assert.ok(/id="progressVal">0\/20/.test(html), 'счётчик 0/20');
    const vs = [...html.matchAll(/v=(\d{2,})/g)].map(m => m[1]);
    assert.deepEqual([...new Set(vs)], ['54'], 'все ?v= = 52');
    assert.ok(html.includes('js/stronghold-model.js?v=54'), 'модель подключена до app.js');
    const modelPos = html.indexOf('stronghold-model.js');
    const appPos = html.indexOf('js/app.js?v=');
    assert.ok(modelPos > -1 && modelPos < appPos, 'stronghold-model.js загружается раньше app.js');
});

test('css: сетка провинций, панель, коррапшн-стадии ok/worn/ruin; стили Карты снесены', () => {
    assert.equal(/\.map-room|room-detail|player-marker/.test(css), false, 'легаси-стили Карты остались');
    for (const cls of ['.sh-grid', '.sh-prov', '.sh-card', '.sh-assault', '.sh-stage.ok', '.sh-stage.worn', '.sh-stage.ruin']) {
        assert.ok(css.includes(cls), 'нет стиля ' + cls);
    }
});

test('штурм из e2e-сценария: 14×Т1 (power 28) берёт твердыню №1 (defN 15)', () => {
    const out = SM.assaultOutcome(SM.armyPower({ t1: 14 }), DATA.STRONGHOLDS[0].total, { rand: () => 0 });
    assert.equal(out.win, true, '28 > 15 → победа');
    assert.ok(out.attritionPct > 0.08 && out.attritionPct < 0.3, 'attrition в клампах');
});
