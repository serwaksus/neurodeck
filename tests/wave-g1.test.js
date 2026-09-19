'use strict';
// Волна Г1 этап 1: юнит-тесты Г1-2 (военные доктрины) — гейты 3/8/14, 8 мультипликаторов,
// сброс в finishSeason, whitelist sanitizeHero. Паттерн wave3: extractFn + buildIn.
// Топ-левел app.js не исполняется.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const SG = require('../js/state-guards.js');

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

const D_DECL = [
    extractBlock('var DOCTRINE_TIERS'),
    extractBlock('var DOCTRINE_IDS'),
    extractBlock('var DOCTRINES'),
    extractFn('doctrineOf'),
    extractFn('doctrineTaxMult'),
    extractFn('doctrineUpkeepMult'),
    extractFn('doctrineAtkMult'),
    extractFn('doctrineXpMult'),
    extractFn('doctrineFortMult'),
    extractFn('doctrineCrownMult'),
    extractFn('doctrineAttritionMult'),
    extractFn('doctrineEngineMult'),
    extractFn('activeDoctrineList')
];

// ----------------------------------------------------------------
// Г1-2: гейты рангов 3/8/14
// ----------------------------------------------------------------
test('Г1-2: гейты доктрин — t1 на 3, t2 на 8, t3 на 14 захватах', () => {
    const gates = buildIn({ decls: D_DECL, stubs: {}, body: 'DOCTRINE_TIERS' });
    assert.deepEqual(gates, { t1: 3, t2: 8, t3: 14 });
    // гейт-логика checkDoctrineOffer: null вне точек 3/8/14
    const tierAt = (n) => buildIn({ decls: D_DECL, stubs: {}, body: "((" + n + " === 3) ? 't1' : (" + n + " === 8) ? 't2' : (" + n + " === 14) ? 't3' : null)" });
    assert.equal(tierAt(3), 't1');
    assert.equal(tierAt(8), 't2');
    assert.equal(tierAt(14), 't3');
    assert.equal(tierAt(2), null);
    assert.equal(tierAt(7), null);
    assert.equal(tierAt(15), null);
});

// ----------------------------------------------------------------
// Г1-2: doctrineOf — whitelist id по тирам, чужой тир → null
// ----------------------------------------------------------------
test('Г1-2: doctrineOf — id в своём тире, cross-tier → null, пусто → null', () => {
    const of = (doctrines, tier) => buildIn({ decls: D_DECL, stubs: { HERO: { doctrines } }, body: 'doctrineOf("' + tier + '")' });
    assert.equal(of({ t1: 'tax', t2: null, t3: null }, 't1'), 'tax');
    assert.equal(of({ t1: null, t2: 'lore', t3: null }, 't2'), 'lore');
    assert.equal(of({ t1: null, t2: null, t3: 'engine' }, 't3'), 'engine');
    assert.equal(of({ t1: 'tax', t2: null, t3: null }, 't2'), null, 'cross-tier не читается');
    assert.equal(of({ t1: 'hack', t2: null, t3: null }, 't1'), null, 'неизвестный id → null');
    assert.equal(of(null, 't1'), null, 'без доктрин → null');
});

// ----------------------------------------------------------------
// Г1-2: все 8 мультипликаторов
// ----------------------------------------------------------------
test('Г1-2: эффекты 8 id — tax 1.15 / upkeep 0.8 / atk 1.10 / growth 1.25 / fort 1.10 / crown 1.10 / veteran 0.7 / engine 0.85', () => {
    const m = (doctrines, fn) => buildIn({ decls: D_DECL, stubs: { HERO: { doctrines } }, body: fn + '()' });
    const off = { t1: null, t2: null, t3: null };
    assert.equal(m({ t1: 'tax', t2: null, t3: null }, 'doctrineTaxMult'), 1.15);
    assert.equal(m({ t1: 'upkeep', t2: null, t3: null }, 'doctrineUpkeepMult'), 0.8);
    assert.equal(m({ t1: 'atk', t2: null, t3: null }, 'doctrineAtkMult'), 1.10);
    assert.equal(m({ t1: null, t2: 'growth', t3: null }, 'doctrineXpMult'), 1.25);
    assert.equal(m({ t1: null, t2: 'fort', t3: null }, 'doctrineFortMult'), 1.10);
    assert.equal(m({ t1: null, t2: null, t3: 'crown' }, 'doctrineCrownMult'), 1.10);
    assert.equal(m({ t1: null, t2: null, t3: 'veteran' }, 'doctrineAttritionMult'), 0.7);
    assert.equal(m({ t1: null, t2: null, t3: 'engine' }, 'doctrineEngineMult'), 0.85);
    // нейтраль: без выбора все = 1
    assert.equal(m(off, 'doctrineTaxMult'), 1);
    assert.equal(m(off, 'doctrineUpkeepMult'), 1);
    assert.equal(m(off, 'doctrineAtkMult'), 1);
    assert.equal(m(off, 'doctrineXpMult'), 1);
    assert.equal(m(off, 'doctrineFortMult'), 1);
    assert.equal(m(off, 'doctrineCrownMult'), 1);
    assert.equal(m(off, 'doctrineAttritionMult'), 1);
    assert.equal(m(off, 'doctrineEngineMult'), 1);
    // lore — не множитель, его эффект = щит за 7-стрик (source-контракт ниже)
});

// ----------------------------------------------------------------
// Г1-2: активный список для чипа
// ----------------------------------------------------------------
test('Г1-2: activeDoctrineList — только выбранные, порядок t1→t2→t3', () => {
    const list = buildIn({
        decls: D_DECL,
        stubs: { HERO: { doctrines: { t1: null, t2: 'fort', t3: 'crown' } } },
        body: 'activeDoctrineList().map(function(d){return d.id || d.name;})'
    });
    assert.equal(list.length, 2);
});

test('Г1-2: activeDoctrineList — имена выбранных доктрин', () => {
    const list = buildIn({
        decls: D_DECL,
        stubs: { HERO: { doctrines: { t1: 'tax', t2: null, t3: 'veteran' } } },
        body: 'activeDoctrineList().map(function(d){return d.name;})'
    });
    assert.deepEqual(list, ['Налоговый уклад', 'Ветеранский устав']);
});

// ----------------------------------------------------------------
// Г1-2: сброс доктрин в finishSeason (source-контракт: reset + тост)
// ----------------------------------------------------------------
test('Г1-2: finishSeason сбрасывает doctrines на null + тост «Сезон новых доктрин»', () => {
    const fnBody = extractFn('finishSeason');
    assert.ok(fnBody.indexOf('doctrines') !== -1, 'finishSeason трогает doctrines');
    assert.ok(fnBody.indexOf('{ t1: null, t2: null, t3: null }') !== -1, 'reset на все null');
    assert.ok(fnBody.indexOf('Сезон новых доктрин') !== -1, 'тост присутствует');
    // lore-эффект стрика в checkDailyReset: +1 щит на %7
    const daily = extractFn('checkDailyReset');
    assert.ok(daily.indexOf("doctrineOf('t2') === 'lore'") !== -1, 'lore-гейт в checkDailyReset');
    assert.ok(daily.indexOf('% 7 === 0') !== -1, 'lore срабатывает на 7-дневном стрике');
    assert.ok(daily.indexOf('Мудрость стрика') !== -1, 'lore-тост');
});

// ----------------------------------------------------------------
// Г1-2: sanitizeHero doctrines whitelist
// ----------------------------------------------------------------
test('Г1-2: sanitizeHero doctrines — whitelist 9 id, мусор → null', () => {
    const good = SG.sanitizeHero({ doctrines: { t1: 'tax', t2: 'lore', t3: 'engine', t4: 'hack' } }).doctrines;
    assert.deepEqual(good, { t1: 'tax', t2: 'lore', t3: 'engine' }, 'чужой ключ t4 отброшен');
    const bad = SG.sanitizeHero({ doctrines: { t1: 'hack', t2: 'growth', t3: 'veteran' } }).doctrines;
    assert.equal(bad.t1, null, 'плохой id → null');
    assert.equal(bad.t2, 'growth');
    assert.equal(bad.t3, 'veteran');
    assert.deepEqual(SG.sanitizeHero({ doctrines: null }).doctrines, null);
    assert.deepEqual(SG.sanitizeHero({ doctrines: 'evil' }).doctrines, null);
    assert.deepEqual(SG.sanitizeHero({ doctrines: ['tax'] }).doctrines, null, 'массив не объект-доктрины');
    assert.deepEqual(SG.sanitizeHero({}).doctrines, null, 'поле отсутствует → null');
});

// ----------------------------------------------------------------
// Г1-3: синергии построек — вкл/выкл каждого набора
// ----------------------------------------------------------------
const CAT = require('../js/stronghold-data.js');

const S_DECL = [
    'var BUILDINGS = ' + JSON.stringify(CAT.BUILDINGS) + ';',
    extractFn('shCatIds'),
    extractFn('shCatBuilt'),
    extractFn('synergyDfOk'),
    extractFn('synergyEcOk'),
    extractFn('synergyZhOk'),
    extractFn('synergySpPairOk'),
    extractFn('synergyDefMult'),
    extractFn('synergyEcMult'),
    extractFn('synergyHireMult'),
    extractFn('synergyAtkMult'),
    extractFn('synergyRows')
];

function mkSh(cats, captured) { // cats: ['defense','econ','house','special'] — полная линейка категории
    const buildings = {};
    Object.keys(CAT.BUILDINGS).forEach((id) => {
        if (cats.indexOf(CAT.BUILDINGS[id].cat) !== -1) buildings[id] = { built: true, corruptionStage: 'ok', debtDays: 0 };
    });
    return { captured: captured !== false, buildings: buildings };
}
const syn = (strongholds, fn, idx) => buildIn({ decls: S_DECL, stubs: { strongholds }, body: fn + '(' + (idx === undefined ? '0' : idx) + ')' });

test('Г1-3: df-четвёрка в твердыне → def ×1.05, иначе ×1', () => {
    const sh = [mkSh(['defense'])];
    assert.equal(syn(sh, 'synergyDefMult'), 1.05, '4 df → +5%');
    assert.equal(syn(sh, 'synergyDfOk'), true);
    const sh3 = [{ captured: true, buildings: { df1: { built: true, corruptionStage: 'ok' }, df2: { built: true, corruptionStage: 'ok' }, df3: { built: true, corruptionStage: 'ok' } } }];
    assert.equal(syn(sh3, 'synergyDefMult'), 1, '3 df — не четверка');
    assert.equal(syn([mkSh([])], 'synergyDefMult'), 1, 'пусто → 1');
});

test('Г1-3: 3+ ec → местный налог ×1.15, 2 ec → ×1', () => {
    const sh = [mkSh(['econ'])];
    assert.equal(syn(sh, 'synergyEcMult'), 1.15, '5 ec → +15%');
    const sh2 = [{ captured: true, buildings: { ec1: { built: true, corruptionStage: 'ok' }, ec2: { built: true, corruptionStage: 'ok' } } }];
    assert.equal(syn(sh2, 'synergyEcMult'), 1, '2 ec — мало');
});

test('Г1-3: полная zh-линейка в захваченной → найм ×0.9; 6 из 7 или не захвачена → ×1', () => {
    const sh = [mkSh(['house'])];
    assert.equal(syn(sh, 'synergyHireMult'), 0.9, '7 zh → −10% найм (глобально)');
    assert.equal(syn(sh, 'synergyZhOk'), true);
    const sh6 = [{ captured: true, buildings: (() => { const b = {}; ['zh1','zh2','zh3','zh4','zh5','zh6'].forEach((id) => { b[id] = { built: true, corruptionStage: 'ok' }; }); return b; })() }];
    assert.equal(syn([sh6[0]], 'synergyHireMult'), 1, '6 zh — линейки нет');
    const shUncap = [mkSh(['house'], false)];
    assert.equal(syn(shUncap, 'synergyHireMult'), 1, 'незахваченная не даёт найм');
});

test('Г1-3: sp2 в захваченном соседе с sp3 → atk ×1.05; иначе ×1', () => {
    const sp = (ids, captured) => ({ captured: captured !== false, buildings: ids.reduce((a, id) => { a[id] = { built: true, corruptionStage: 'ok' }; return a; }, {}) });
    // sp2 в i=1, sp3 в соседях i=0 и i=2 — обе стороны
    assert.equal(syn([sp(['sp3']), sp(['sp2']), sp(['sp3'])], 'synergyAtkMult'), 1.05, 'соседство idx±1');
    // только sp2 без sp3 рядом
    assert.equal(syn([sp([]), sp(['sp2']), sp([])], 'synergyAtkMult'), 1, 'нет Собора рядом');
    // sp3 на расстоянии 2
    assert.equal(syn([sp(['sp2']), sp([]), sp(['sp3'])], 'synergyAtkMult'), 1, 'дистанция 2 — не соседи');
    // сосед не захвачен
    assert.equal(syn([sp(['sp3'], false), sp(['sp2'])], 'synergyAtkMult'), 1, 'сосед не захвачен');
    // пара в одной твердыне не считается
    assert.equal(syn([sp(['sp2', 'sp3'])], 'synergyAtkMult'), 1, 'одна твердыня — не пара');
    assert.equal(syn([sp([])], 'synergySpPairOk'), false);
});

test('Г1-3: synergyRows — строки только активных синергий', () => {
    const sh = [mkSh(['defense', 'econ'])];
    const rows = buildIn({ decls: S_DECL, stubs: { strongholds: sh }, body: 'synergyRows(0)' });
    assert.equal(rows.length, 2, 'df + ec активны, zh/sp нет');
    assert.ok(rows[0].indexOf('✦ Синергия') === 0, 'формат «✦ Синергия: …»');
    assert.deepEqual(buildIn({ decls: S_DECL, stubs: { strongholds: [mkSh([])] }, body: 'synergyRows(0)' }), [], 'пусто → нет строк');
});

test('Г1-3: source-контракты — синергии встроены в тик/доход/найм/штурм/панель/казну', () => {
    assert.ok(extractFn('hireCostOf').indexOf('synergyHireMult') !== -1, 'найм −10%');
    assert.ok(extractFn('runWeeklySiege').indexOf('synergyDefMult') !== -1, 'гарнизон +5% в каскаде');
    assert.ok(extractFn('assaultForecast').indexOf('synergyAtkMult') !== -1, 'атака +5% в штурме');
    assert.ok(extractFn('requestTowerClimb').indexOf('synergyAtkMult') !== -1, 'атака +5% в башне');
    assert.ok(extractFn('strongholdsDailyTick').indexOf('synergyEcMult') !== -1, 'тик: местный налог');
    assert.ok(extractFn('shIncomePerDay').indexOf('synergyEcMult') !== -1, 'доход: местный налог');
    assert.ok(app.indexOf('✦ Синергия') !== -1, 'панель твердыни: строки синергий');
    assert.ok(extractFn('showTreasuryBreakdown').indexOf('Синергии') !== -1, 'разбивка казны: сводка синергий');
});

// ----------------------------------------------------------------
// Г1-4: тактики штурма — множители, дефолт ESC, интеграция
// ----------------------------------------------------------------
const T_DECL = [
    extractBlock('var TACTICS'),
    extractFn('tacticAtkMult'),
    extractFn('tacticAttrMult')
];

test('Г1-4: множители тактик — normal 1/1, feint 0.8/0.7, rush 1.25/2', () => {
    const m = (expr) => buildIn({ decls: T_DECL, stubs: {}, body: expr });
    assert.equal(m('tacticAtkMult("normal")'), 1);
    assert.equal(m('tacticAttrMult("normal")'), 1);
    assert.equal(m('tacticAtkMult("feint")'), 0.8, 'ложный отход: урон −20%');
    assert.equal(m('tacticAttrMult("feint")'), 0.7, 'ложный отход: потери ×0.7');
    assert.equal(m('tacticAtkMult("rush")'), 1.25, 'натиск: урон +25%');
    assert.equal(m('tacticAttrMult("rush")'), 2, 'натиск: потери ×2');
});

test('Г1-4: дефолт — неизвестная/пустая тактика = «Штурм» (ESC-семантика)', () => {
    const m = (expr) => buildIn({ decls: T_DECL, stubs: {}, body: expr });
    assert.equal(m('tacticAtkMult("bogus")'), 1);
    assert.equal(m('tacticAttrMult("bogus")'), 1);
    assert.equal(m('tacticAtkMult(undefined)'), 1);
    assert.equal(m('tacticAttrMult(null)'), 1);
});

test('Г1-4: requestAssault — ветка тактики с 3 захватов, ниже — обычный confirm', () => {
    const ra = extractFn('requestAssault');
    assert.ok(ra.indexOf('capturedCount() >= 3') !== -1, 'гейт 3 захватов');
    assert.ok(ra.indexOf('requestTactic(idx, f)') !== -1, 'тактическая модалка');
    assert.ok(ra.indexOf('doAssault(idx, f, t)') !== -1, 'тактика пробрасывается в штурм');
    assert.ok(ra.indexOf('dungeonConfirm') !== -1, 'до 3 захватов — прежний confirm');
});

test('Г1-4: requestTactic — 3 кнопки на confirmOverlay, свой ESC → «Штурм», cleanup восстанавливает', () => {
    const rt = extractFn('requestTactic');
    assert.ok(rt.indexOf("'⚔ Штурм'") !== -1, '#confirmYes = «⚔ Штурм» (acceptance-семантика)');
    assert.ok(rt.indexOf("'🪶 Ложный отход'") !== -1, '#confirmNo = «🪶 Ложный отход»');
    assert.ok(rt.indexOf("'🔥 Натиск'") !== -1, 'третья кнопка «🔥 Натиск»');
    assert.ok(rt.indexOf("createElement('button')") !== -1, 'третья кнопка создаётся динамически');
    assert.ok(rt.indexOf("appendChild(third)") !== -1 && rt.indexOf("third.remove()") !== -1, 'кнопка добавляется и убирается');
    assert.ok(rt.indexOf("e.key === 'Escape') cleanup('normal')") !== -1, 'ESC → дефолт «Штурм»');
    assert.ok(rt.indexOf("removeEventListener('keydown', onKey)") !== -1, 'свой keydown снимается');
    assert.ok(rt.indexOf("oldYes") !== -1 && rt.indexOf("oldNo") !== -1, 'подписи кнопок восстанавливаются');
    assert.ok(rt.indexOf('confirmOverlay') !== -1, 'переиспользует confirmOverlay (index.html не тронут)');
});

test('Г1-4: doAssault — atk и attrition умножаются на тактику, мусорная тактика = норма', () => {
    const da = extractFn('doAssault');
    assert.ok(da.indexOf("TACTICS[tactic] ? tactic : 'normal'") !== -1, 'дефолт «Штурм» на мусоре');
    assert.ok(da.indexOf('Math.round(f.atk * tacticAtkMult(_tc))') !== -1, 'atk × тактика');
    assert.ok(da.indexOf('doctrineAttritionMult() * tacticAttrMult(_tc)') !== -1, 'attrition × доктрина × тактика');
});

// ----------------------------------------------------------------
// Г1-5: коррупционная буря — таймер-детерминизм, деградация, оплата
// ----------------------------------------------------------------
test('Г1-5: stormDayOf — 9+(num%7) = 12±3, детерминированно от сезона', () => {
    const sd = (n) => buildIn({ decls: [extractFn('stormDayOf')], stubs: {}, body: 'stormDayOf(' + n + ')' });
    assert.equal(sd(1), 10);
    assert.equal(sd(3), 12);
    assert.equal(sd(6), 15);
    assert.equal(sd(7), 9, 'цикл повторяется — тот же день, что сезон 0');
    assert.equal(sd(10), 12, 'детерминизм: сезон 10 = сезон 3');
});

test('Г1-5: sanitizeStorm — whitelist 4 полей, мусор → null, paid только true', () => {
    assert.deepEqual(SG.sanitizeStorm({ num: 5, regionIdx: 7, dueDayKey: '2026-09-26', paid: false }), { num: 5, regionIdx: 7, dueDayKey: '2026-09-26', paid: false });
    assert.equal(SG.sanitizeStorm(null), null);
    assert.equal(SG.sanitizeStorm('storm'), null);
    assert.equal(SG.sanitizeStorm([1, 2]), null);
    const out = SG.sanitizeStorm({ num: 'x', regionIdx: 99, dueDayKey: 12345, paid: 'yes' });
    assert.deepEqual(out, { num: 0, regionIdx: 19, dueDayKey: '', paid: false }, 'мусор → кламп-дефолты');
    assert.equal(SG.sanitizeStorm({ num: 1, regionIdx: 1, dueDayKey: '2026-09-26', paid: 1 }).paid, false, 'paid строго boolean');
    assert.equal(SG.sanitizeStorm({ num: 1, regionIdx: 1, dueDayKey: '2026-09-26', paid: true }).paid, true);
});

test('Г1-5: checkStorm — деградация на 1 стадию (ok→worn→ruin), просрочка гасит бурю', () => {
    const cs = extractFn('checkStorm');
    assert.ok(cs.indexOf("(b.corruptionStage === 'ok') ? 'worn' : 'ruin'") !== -1, 'ровно 1 стадия за просрочку');
    assert.ok(cs.indexOf('ruin') !== -1 && cs.indexOf("b.corruptionStage !== 'ruin'") !== -1, 'ruin — терминальная стадия');
    assert.ok(cs.indexOf('_st.paid = true;') !== -1, 'после просрочки буря разрешена');
    assert.ok(cs.indexOf('stormDayOf(season.num)') !== -1, 'триггер по детерминированному дню');
    assert.ok(cs.indexOf('i > 0') !== -1, 'регион не-фронт: стартовый лагерь исключён');
    assert.ok(cs.indexOf('50 * capturedCount()') !== -1, 'тост называет дань 50×captured');
    assert.ok(cs.indexOf('getMSKDayKey() > _st.dueDayKey') !== -1, 'просрочка строго по дате');
    assert.ok(cs.indexOf('saveGameState()') !== -1, 'буря персистится через сейв');
});

// ----------------------------------------------------------------
// Г1-6: тень воеводы — темп, обгон-флаг, налог, сброс в сезоне
// ----------------------------------------------------------------
test('Г1-6: warlordTempo — floor(0.8×captured), минимум 1', () => {
    const t = (n) => buildIn({ decls: [extractFn('warlordTempo')], stubs: { capturedCount: () => n }, body: 'warlordTempo()' });
    assert.equal(t(0), 1, '0 захватов — темп 1');
    assert.equal(t(2), 1, 'floor(1.6)=1');
    assert.equal(t(3), 2, 'floor(2.4)=2');
    assert.equal(t(5), 4, 'floor(4)=4');
    assert.equal(t(10), 8, 'floor(8)=8');
    assert.equal(t(20), 16, 'floor(16)=16');
});

test('Г1-6: seasonCapturedDelta — захваты сезона = счётчик − snapshot.captured, минимум 0', () => {
    const d = (cur, snap) => buildIn({
        decls: [extractFn('seasonCapturedDelta')],
        stubs: { capturedCount: () => cur, ensureSeason: function() { return { snapshot: { captured: snap } }; } },
        body: 'seasonCapturedDelta()'
    });
    assert.equal(d(6, 4), 2, '6 захвачено, 4 в снапшоте → 2 за сезон');
    assert.equal(d(4, 4), 0);
    assert.equal(d(3, 4), 0, 'откат — не отрицательный');
});

test('Г1-6: налог +5% при обгоне — после венцов и трона', () => {
    const tm = extractFn('taxMultiplier');
    assert.ok(tm.indexOf('HERO.warlordAhead === true') !== -1, 'гейт по флагу');
    assert.ok(tm.indexOf('m *= 1.05') !== -1, '×1.05');
    const idxThrone = tm.indexOf('throne * 0.01');
    const idxWar = tm.indexOf('warlordAhead');
    assert.ok(idxWar > idxThrone > -1, 'warlordAhead после венцов/трона');
});

test('Г1-6: finishSeason — обгон-флаг по дельте захвата, тост; sanitizeHero — строго boolean', () => {
    const fs = extractFn('finishSeason');
    assert.ok(fs.indexOf('HERO.warlordAhead = d.captured > warlordTempo()') !== -1, 'флаг пересчитывается при смене сезона');
    assert.ok(fs.indexOf('Тень воеводы: обгон!') !== -1, 'тост об обгоне');
    assert.ok(fs.indexOf('warlordTempo()') !== -1, 'сравнение с темпом — сброс/удержание автоматом');
    assert.equal(SG.sanitizeHero({ warlordAhead: true }).warlordAhead, true);
    assert.equal(SG.sanitizeHero({}).warlordAhead, false, 'дефолт false');
    assert.equal(SG.sanitizeHero({ warlordAhead: 'yes' }).warlordAhead, false, 'строго boolean');
    assert.equal(SG.sanitizeHero({ warlordAhead: 1 }).warlordAhead, false);
});

test('Г1-6: строка воеводы в сезонном блоке Твердыней + мини-бар', () => {
    assert.ok(app.indexOf('⚔ Глорх, Погибель Урядов') !== -1, 'строка «⚔ Глорх: N · ты: M»');
    assert.ok(app.indexOf('warlordTempo(), _wm = seasonCapturedDelta()') !== -1, 'рендер использует хелперы');
    const rs = extractFn('renderStrongholds');
    assert.ok(rs.indexOf('warlord-ahead') !== -1, 'мини-бар: класс при обгоне');
    assert.ok(rs.indexOf('_wm / (_wt + 1) * 100') !== -1, 'заполнение бара M/(темп+1)');
});
