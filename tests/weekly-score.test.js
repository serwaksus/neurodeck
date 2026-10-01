const test = require('node:test');
const assert = require('node:assert/strict');
// P14: детерминированный счёт недели (CAMPAIGN-2.0.md §5 — «эффективность, не голый спидран»).
// Чистая функция SM.weeklyScore(facts): захваты / потери гарнизона / нулевые дни / восстановление
// после риска. Факты собирает app.js weeklyScoreFacts из существующих полей (без новой схемы),
// показ — только при 20/20 в панели сезона (weeklyScoreLineHtml за строкой модификатора C6-lite).
const fs = require('node:fs');
const path = require('node:path');
const SM = require('../js/stronghold-model.js');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const model = fs.readFileSync(path.join(__dirname, '..', 'js', 'stronghold-model.js'), 'utf8');

test('P14 формула-пины: компоненты и итог считаются детерминированно из четырёх фактов', () => {
    const r = SM.weeklyScore({ captures: 3, lossesPct: 0.25, zeroDays: 1, recoveries: 1 });
    assert.deepEqual(r.parts, { captures: 60, garrison: 75, discipline: 88, recovery: 25 }, '⚔ 20×3 · 🛡 100×0.75 · 📖 100−12 · ♻ 25');
    assert.equal(r.score, 50 + 60 + 75 + 88 + 25, 'база 50 + компоненты');
    assert.equal(r.grade, 'A', '298 — это A, до S (300) не хватает');
    const clean = SM.weeklyScore({ captures: 0, lossesPct: 0, zeroDays: 0, recoveries: 0 });
    assert.deepEqual(clean.parts, { captures: 0, garrison: 100, discipline: 100, recovery: 0 }, 'чистая стабильная неделя без событий');
    assert.equal(clean.score, 250, '50 + 0 + 100 + 100 + 0');
    assert.equal(clean.grade, 'A', 'образцовое удержание — A');
});

test('P14 границы: минимум 54 (полный провал), максимум 400 (S), грейды S/A/B/C/D достижимы', () => {
    const worst = SM.weeklyScore({ captures: 0, lossesPct: 1, zeroDays: 99, recoveries: 0 });
    assert.equal(worst.score, 54, '50 + 0 + 0 + 4 (дисциплина не уходит ниже 100−12×8)');
    assert.equal(worst.grade, 'D');
    const best = SM.weeklyScore({ captures: 5, lossesPct: 0, zeroDays: 0, recoveries: 2 });
    assert.equal(best.score, 400, '50 + 100 + 100 + 100 + 50');
    assert.equal(best.max, 400, 'максимум объявлен в ответе');
    assert.equal(best.grade, 'S');
    // границы грейдов включительно
    assert.equal(SM.weeklyScore({ captures: 5, lossesPct: 0, zeroDays: 2, recoveries: 1 }).grade, 'S', '300 ровно');
    assert.equal(SM.weeklyScore({ captures: 0, lossesPct: 0, zeroDays: 0, recoveries: 1 }).grade, 'A', '275');
    assert.equal(SM.weeklyScore({ captures: 0, lossesPct: 0.3, zeroDays: 0, recoveries: 0 }).grade, 'B', '180 ровно');
    assert.equal(SM.weeklyScore({ captures: 0, lossesPct: 0.9, zeroDays: 0, recoveries: 0 }).grade, 'C', '160');
    assert.equal(SM.weeklyScore({ captures: 0, lossesPct: 1, zeroDays: 3, recoveries: 0 }).grade, 'D', '114: потери + бардак');
});

test('P14 капы и клампы входов: captures≤5, zeroDays≤8, recoveries≤2, lossesPct∈[0;1]', () => {
    assert.equal(SM.weeklyScore({ captures: 50 }).parts.captures, 100, 'захваты выше 5 не добавляют');
    assert.equal(SM.weeklyScore({ zeroDays: 30 }).parts.discipline, 4, '8+ пропусков = минимум 4');
    assert.equal(SM.weeklyScore({ recoveries: 9 }).parts.recovery, 50, 'восстановления выше 2 не добавляют');
    [ -0.5, 2, Infinity ].forEach((lp) => assert.equal(SM.weeklyScore({ lossesPct: lp }).parts.garrison,
        lp === 2 ? 0 : 100, 'lossesPct=' + lp + ': конечное вне [0;1] клампится, не-число → нет потерь'));
});

test('P14 robustness: мусорные входы не бросают и читаются как нули; факты не мутируются', () => {
    const junk = SM.weeklyScore({ captures: NaN, lossesPct: 'x', zeroDays: undefined, recoveries: null });
    assert.deepEqual(junk.parts, { captures: 0, garrison: 100, discipline: 100, recovery: 0 }, 'NaN/строки/null → 0');
    [undefined, null, 0, 'nope'].forEach((v) => assert.equal(typeof SM.weeklyScore(v).score, 'number', 'факты ' + String(v)));
    const facts = Object.freeze({ captures: 2, lossesPct: 0.1, zeroDays: 0, recoveries: 1 });
    const a = SM.weeklyScore(facts), b = SM.weeklyScore(facts);
    assert.deepEqual(a, b, 'одинаковые факты → одинаковый результат (детерминизм)');
    assert.deepEqual(facts, { captures: 2, lossesPct: 0.1, zeroDays: 0, recoveries: 1 }, 'вход не мутирован');
});

test('P14 форма ответа: {score, grade, parts{4}, max}, score всегда в 50..400', () => {
    for (let c = 0; c <= 7; c++) for (let lp = 0; lp <= 1.01; lp += 0.25) for (let zd = 0; zd <= 10; zd += 2) for (let rc = 0; rc <= 3; rc++) {
        const r = SM.weeklyScore({ captures: c, lossesPct: lp, zeroDays: zd, recoveries: rc });
        assert.ok(r.score >= 50 && r.score <= 400 && Number.isInteger(r.score), 'score целое в [50;400]: ' + r.score);
        assert.ok('SABC D'.includes(r.grade), 'грейд из алфавита: ' + r.grade);
        assert.deepEqual(Object.keys(r.parts).sort(), ['captures', 'discipline', 'garrison', 'recovery']);
    }
});

test('P14 app.js: факт-коллектор из существующих полей + строка при 20/20 в панели сезона за модификатором', () => {
    const factsSrc = app.match(/function weeklyScoreFacts\(\)[\s\S]*?\n}/)[0];
    ['seasonCapturedDelta()', 'siege.wkSkips', 'siege.retriedThisWeek', 'siege.lastResult', 'SM.stackPower'].forEach((s) =>
        assert.ok(factsSrc.includes(s), 'факт-коллектор читает ' + s + ' (существующее состояние)'));
    assert.ok(!/saveGameState|SCHEMA|\.v\s*=|MIGRATIONS/.test(factsSrc), 'коллектор только читает — без записи состояния/схемы');
    assert.ok(app.includes('if (!weeklyEndgame() || !SM || typeof SM.weeklyScore !== \'function\') return \'\';'), 'typeof-гвард SM.weeklyScore (extract-харнессы)');
    assert.ok(app.includes('html += weeklyModifierLineHtml();'), 'строка модификатора на месте (соседство)');
    assert.ok(app.indexOf('html += weeklyModifierLineHtml();') < app.indexOf('html += weeklyScoreLineHtml();'), 'счёт — после модификатора, в блоке панели сезона');
    const rs = app.match(/function renderStrongholds\(\)[\s\S]*?\nfunction /)[0];
    assert.ok(rs.includes('weeklyScoreLineHtml();'), 'renderStrongholds зовёт строку счёта');
});

test('P14 модель: экспорт и чистота формулы (никаких Date/random/каталога в weeklyScore)', () => {
    assert.equal(typeof SM.weeklyScore, 'function', 'экспорт weeklyScore');
    assert.ok(model.includes('weeklyScore: weeklyScore,'), 'в return-карте модели');
    const src = model.match(/function weeklyScore\(facts\)[\s\S]*?\n    \}/)[0];
    [/Date/, /random/, /catalog\(\)/, /localStorage/].forEach((re) => assert.ok(!re.test(src), 'формула не трогает ' + re));
});
