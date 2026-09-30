'use strict';
// Today Loop 2.0 (фаза 1 AAA-плана): приоритет дня на дашборде.
// Контракты: детерминированный выбор карточки (стрик под угрозой → ближе к ранг-апу → первая),
// день закрыт когда всё выполнено, кнопка переиспользует data-action="complete-card",
// королевская строка: долг содержания важнее осадного календаря.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

function extractBlock(src, anchor) {
    const start = src.indexOf(anchor);
    assert.ok(start > -1, 'anchor not found: ' + anchor);
    let depth = 0, end = -1;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > -1, 'unbalanced braces after: ' + anchor);
    return src.slice(start, end + 1);
}
const extractFn = (name) => extractBlock(app, 'function ' + name + '(');
const mkPicker = () => new Function(extractFn('pickTodayCard') + '; return pickTodayCard;')();
// dayKey-стаб: lastCompletedAt=1 → выполнено сегодня; 2 → вчера
const TODAY = '1';
const keyStub = (ts) => String(ts);

test('pickTodayCard: стрик под угрозой важнее близости к ранг-апу', () => {
    const pick = mkPicker()([
        { id: 1, name: 'Близко к рангу', streak: 0, mastery: 4, masteryThreshold: 5, lastCompletedAt: 2 },
        { id: 2, name: 'Стрик 5', streak: 5, mastery: 0, masteryThreshold: 9, lastCompletedAt: 2 },
    ], TODAY, keyStub);
    assert.equal(pick.card.id, 2, 'горящий стрик — приоритет');
    assert.equal(pick.doneToday, 0);
    assert.equal(pick.total, 2);
});

test('pickTodayCard: без стриков — ближайшая к ранг-апу', () => {
    const pick = mkPicker()([
        { id: 1, name: 'Далеко', streak: 0, mastery: 0, masteryThreshold: 9, lastCompletedAt: 2 },
        { id: 2, name: 'Почти', streak: 0, mastery: 4, masteryThreshold: 5, lastCompletedAt: 2 },
    ], TODAY, keyStub);
    assert.equal(pick.card.id, 2);
});

test('pickTodayCard: больший стрик среди горящих, выполненные сегодня исключены', () => {
    const pick = mkPicker()([
        { id: 1, name: 'Стрик 2', streak: 2, mastery: 4, masteryThreshold: 5, lastCompletedAt: 2 },
        { id: 2, name: 'Стрик 9', streak: 9, mastery: 0, masteryThreshold: 5, lastCompletedAt: 2 },
        { id: 3, name: 'Уже сегодня', streak: 7, mastery: 0, masteryThreshold: 5, lastCompletedAt: 1 },
    ], TODAY, keyStub);
    assert.equal(pick.card.id, 2, 'выполненная сегодня (стрик 7) не выбирается');
});

test('pickTodayCard: все выполнены → card:null; пустая колода → null', () => {
    const allDone = mkPicker()([{ id: 1, streak: 3, mastery: 0, masteryThreshold: 5, lastCompletedAt: 1 }], TODAY, keyStub);
    assert.equal(allDone.card, null);
    assert.equal(allDone.doneToday, 1);
    assert.equal(mkPicker()([], TODAY, keyStub), null);
    assert.equal(mkPicker()(null, TODAY, keyStub), null);
});

test('todayKingdomLine: долг содержания важнее осадного календаря', () => {
    const fn = new Function(extractFn('todayKingdomLine') + '; return todayKingdomLine;')();
    const sh = [{ corruption: { stage: 'worn', debtDays: 3 } }, { corruption: { stage: 'ok', debtDays: 0 } }];
    const line = fn(sh, 2);
    assert.match(line, /Долг содержания: 3/);
    assert.match(line, /ветшает построек: 1/);
    assert.ok(!line.includes('Осада'), 'при долге осадный календарь не показывается');
    assert.equal(fn([{ corruption: { stage: 'ok', debtDays: 0 } }], 0).includes('Осадный итог'), true);
    assert.equal(fn([], 1).includes('завтра ночью'), true);
    assert.equal(fn([], 5).includes('До осады: 5'), true);
    assert.equal(fn([], -1), '');
});

test('renderTodayPriority: кнопка переиспользует complete-card, контекст королевства присутствует', () => {
    const harness = new Function('FORGED', 'getMSKDayKey', 'STATS', 'esc', 'strongholds',
        [extractFn('pickTodayCard'), extractFn('todayKingdomLine'), extractFn('daysToSiegeMonday'), extractFn('renderTodayPriority')].join('\n') +
        '; return renderTodayPriority;')(
        [{ id: 7, name: 'Зарядка', rank: 'C', streak: 3, mastery: 2, masteryThreshold: 5, stat: 'str', lastCompletedAt: 2 }],
        () => '1',
        { str: { icon: '⚔', name: 'Сила' } },
        (s) => String(s),
        [{ corruption: { stage: 'ok', debtDays: 0 } }]
    );
    const html = harness();
    assert.ok(html.includes('ПРИОРИТЕТ ДНЯ'), 'заголовок панели');
    assert.ok(html.includes('data-action="complete-card"'), 'переиспользование существующего экшена');
    assert.ok(html.includes('data-id="7"'), 'id выбранной карточки');
    assert.ok(html.includes('Зарядка'), 'имя карточки');
    assert.ok(html.includes('🔥 3 дн.'), 'стрик под угрозой подсвечен');
    assert.ok(html.includes('ранг-ап') || html.includes('ранг-апа'), 'награда-next видна');
    assert.ok(html.includes('До осады'), 'осадный календарь от daysToSiegeMonday');
});

test('renderTodayPriority: пустая колода и закрытый день — без кнопки действия', () => {
    // getMSKDayKey-стаб должен совпадать с дефолтной конверсией pickTodayCard (ts → MSK-дата):
    // renderTodayPriority зовёт pickTodayCard без третьего параметра, как в проде
    const realKey = (ts) => new Date((ts || Date.now()) + 3 * 3600000).toISOString().slice(0, 10);
    const mk = (forged) => new Function('FORGED', 'getMSKDayKey', 'STATS', 'esc', 'strongholds',
        [extractFn('pickTodayCard'), extractFn('todayKingdomLine'), extractFn('daysToSiegeMonday'), extractFn('renderTodayPriority')].join('\n') +
        '; return renderTodayPriority;')(forged, realKey, {}, (s) => String(s), []);
    assert.ok(mk([])().includes('Колода пуста'));
    const closed = mk([{ id: 1, streak: 1, mastery: 0, masteryThreshold: 5, stat: 'str', lastCompletedAt: Date.now() }])(); // сегодня по реальному MSK-ключу
    assert.ok(closed.includes('День закрыт'), 'все выполнено — поздравление');
    assert.ok(!closed.includes('data-action="complete-card"'), 'выполнять нечего — кнопки нет');
});

test('daysToSiegeMonday: осадный тик — ближайший понедельник МСК', () => {
    const fn = new Function(extractFn('daysToSiegeMonday') + '; return daysToSiegeMonday;')();
    const day = (utcMs) => fn(utcMs - 3 * 3600000); // UTC-момент полудня MSK-дня → fn ждёт ts (уже +3ч внутри)
    // 2026-09-28 — понедельник, 2026-09-27 — воскресенье, 2026-10-03 — суббота
    assert.equal(fn(Date.UTC(2026, 8, 28, 12) - 3 * 3600000), 0, 'понедельник → итог сегодня утром');
    assert.equal(fn(Date.UTC(2026, 8, 27, 12) - 3 * 3600000), 1, 'воскресенье → осада завтра ночью');
    assert.equal(fn(Date.UTC(2026, 9, 3, 12) - 3 * 3600000), 2, 'суббота → 2 дня');
    assert.equal(fn(Date.UTC(2026, 8, 29, 12) - 3 * 3600000), 6, 'вторник → 6 дней');
});

test('renderDashboard интегрирует панель до beginner/veteran-ветвления (контракт ux-first-day не тронут)', () => {
    const m = app.match(/function renderDashboard\([\s\S]*?\n\}/);
    assert.ok(m, 'renderDashboard на месте');
    assert.ok(m[0].includes('isBeginner'), 'ветвление isBeginner сохранено');
    assert.ok(m[0].includes('renderDashboardBeginner()') && m[0].includes('renderDashboardVeteran()'), 'оба вызова на месте');
    assert.ok(m[0].indexOf('renderTodayPriority()') < m[0].indexOf('renderDashboardBeginner()'), 'приоритет дня — до инфо-блоков');
});
