'use strict';
// Кампания 3.0 — «объявленный отдых» (решение владельца: отдых 1–2 дня в неделю объявляется заранее; в итогах дня теней нет).
// Правила: только будущий день ≤ 7 вперёд, ≤ 2 на календарную неделю (пн–вс) по неделе дня-цели, отмена — пока день будущий.
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/campaign3/c3-data.js');
const M = require('../js/campaign3/c3-model.js');
const SG = require('../js/state-guards.js');

// 2026-10-05 — понедельник; неделя А: 05–11, неделя Б: 12–18
const fresh = () => M.newState('2026-10-05');
const deed = (sphere, rank) => ({ kind: 'habit', sphere: sphere, rank: rank || 'C' });

test('отдых: причины отказа — past (сегодня и вчера), far (8+ дней), dup, arg', () => {
    const s = fresh(); // день 2026-10-05 (пн)
    assert.equal(M.declareRest(s, '2026-10-05').reason, 'past');   // сам текущий день
    assert.equal(M.declareRest(s, '2026-10-04').reason, 'past');   // прошедший
    assert.equal(M.declareRest(s, '2026-10-13').reason, 'far');    // 8 дней вперёд
    assert.equal(M.declareRest(s, 'завтра').reason, 'arg');
    assert.equal(M.declareRest(s, '').reason, 'arg');
    assert.equal(M.declareRest(s, '2026-10-06').ok, true);         // завтра — можно
    assert.equal(M.declareRest(s, '2026-10-06').reason, 'dup');    // повторно тот же день
    assert.equal(M.declareRest(s, '2026-10-12').ok, true, 'ровно 7 дней вперёд — ещё можно');
});

test('отдых: лимит 2 на календарную неделю по неделе ДНЯ-ЦЕЛИ, граница пн/вс', () => {
    const s = fresh();
    assert.equal(M.restLeft(s, '2026-10-10'), D.C.REST_PER_WEEK);
    assert.equal(M.declareRest(s, '2026-10-10').ok, true);  // суббота недели А
    assert.equal(M.declareRest(s, '2026-10-11').ok, true);  // воскресенье недели А → 2/2
    assert.equal(M.restLeft(s, '2026-10-09'), 0, 'пятница той же недели — лимит исчерпан');
    assert.equal(M.declareRest(s, '2026-10-09').reason, 'cap');
    assert.equal(M.declareRest(s, '2026-10-12').ok, true, 'понедельник следующей недели — новая неделя');
    // неделя цели считается по дню-цели, а не по текущему дню: вс и пн рядом, но недели разные
    const t = M.newState('2026-10-10'); // суббота
    assert.equal(M.declareRest(t, '2026-10-11').ok, true);
    assert.equal(M.declareRest(t, '2026-10-12').ok, true, 'вс + пн — разные календарные недели');
    assert.equal(M.declareRest(t, '2026-10-13').ok, true, 'второй день недели Б — ещё можно');
    assert.equal(M.declareRest(t, '2026-10-14').reason, 'cap', 'третий день недели Б — лимит');
});

test('отдых: 7 дней вперёд от субботы — граница', () => {
    const t = M.newState('2026-10-10'); // суббота
    assert.equal(M.declareRest(t, '2026-10-17').ok, true, 'ровно 7 дней вперёд можно');
    assert.equal(M.declareRest(t, '2026-10-18').reason, 'far');
});

test('отдых: отмена освобождает слот недели; прошедший день отменить нельзя', () => {
    const s = fresh();
    M.declareRest(s, '2026-10-10'); M.declareRest(s, '2026-10-11');
    assert.equal(M.declareRest(s, '2026-10-07').reason, 'cap');
    assert.equal(M.cancelRest(s, '2026-10-11').ok, true);
    assert.equal(M.declareRest(s, '2026-10-07').ok, true, 'слот недели освободился');
    assert.equal(M.cancelRest(s, '2026-10-07').ok, true);
    assert.equal(M.cancelRest(s, '2026-10-07').reason, 'none', 'дважды не отменить');
    // день прошёл: dayEnd вычищает его из rest — отменять нечего
    for (let i = 0; i < 7; i++) M.dayEnd(s, '2026-10-' + String(6 + i), {});
    assert.equal(M.cancelRest(s, '2026-10-07').reason, 'none');
});

test('dayEnd: в объявленный отдых тени 0 (silent/honest/overdue), в обычный день — как раньше; лазарет не тронут', () => {
    const s = fresh();
    M.declareRest(s, '2026-10-06'); // завтра — отдых
    const input = { silent: [1, 2, 0, 0], honest: [0, 1, 0, 0], overdue: [3, 0, 0, 0] };
    const d1 = M.dayEnd(s, '2026-10-06', input); // закрываем обычный понедельник
    assert.deepEqual(d1.shadows, [4, 2.5, 0, 0], '1 + 0.5·1 и 2 + 0.5·1');
    const d2 = M.dayEnd(s, '2026-10-07', input); // закрываем вторник — объявленный отдых
    assert.deepEqual(d2.shadows, [0, 0, 0, 0], 'молчание, честный пропуск и просрочка — всё по нулям');
    assert.deepEqual(s.fac[0].sh.slice(-2), [4, 0]);
    assert.equal(M.isRestDay(s, '2026-10-06'), false, 'прошедший отдых вычищен');
    // лазарет работает как раньше: на отдых-дне не тратится вдвойне, на обычном — те же нули
    const lz = fresh();
    M.lazaretStart(lz);
    assert.deepEqual(M.dayEnd(lz, '2026-10-06', { silent: [3, 3, 3, 3] }).shadows, [0, 0, 0, 0]);
    assert.equal(lz.lz.left, D.C.LAZARET_DAYS - 1);
});

test('отдых-день: дела по-прежнему дают ОД и ресурсы (инвариант C4 не тронут)', () => {
    const s = fresh();
    M.declareRest(s, '2026-10-06');
    M.dayEnd(s, '2026-10-06', {});
    assert.equal(M.applyDeed(s, deed('body')).gained, 1, 'дело в отдых-день даёт ОД');
    assert.equal(s.ap[0], 1); assert.equal(s.res.st, 1);
});

test('rest: размер ≤ REST_MAX, прошедшие чистятся, старые сейвы без поля работают', () => {
    const s = fresh();
    assert.equal(s.rest, undefined, 'новое состояние без rest — поле появляется лениво');
    assert.equal(M.isRestDay(s, '2026-10-06'), false);
    assert.equal(M.restLeft(s, '2026-10-06'), D.C.REST_PER_WEEK, 'старый сейв: лимит полный');
    // мусорное переполнение (импорт): после объявления остаются последние REST_MAX ключей
    const g = fresh();
    const past = [];
    for (let i = 0; i < 14; i++) past.push('2026-09-' + String(17 + i).padStart(2, '0')); // 17..30 — 14 прошедших дней
    g.rest = past;
    assert.equal(M.declareRest(g, '2026-10-06').ok, true);
    assert.equal(g.rest.length, D.C.REST_MAX);
    assert.equal(g.rest[0], '2026-09-18', 'самый старый ключ выпал');
    // чистка прошедших дней при закрытии суток: день живёт в rest, пока не закрылся сам
    const c = fresh(); c.rest = ['2026-10-01', '2026-10-06'];
    M.dayEnd(c, '2026-10-06', {});
    assert.deepEqual(c.rest, ['2026-10-06'], 'день до rest-дня закрылся — древний ключ ушёл');
    M.dayEnd(c, '2026-10-07', {});
    assert.deepEqual(c.rest, [], 'сам отдых-день закрылся — ключ ушёл');
});

test('sanitizeC3: rest — только строки-ключи дней, без дубликатов, ≤ 14; без поля на входе — без поля на выходе', () => {
    const s = fresh();
    const out0 = SG.sanitizeC3(JSON.parse(JSON.stringify(s)));
    assert.equal(out0.rest, undefined, 'байт-стабильный раундтрип сейва без rest');
    M.declareRest(s, '2026-10-06'); M.declareRest(s, '2026-10-10');
    const out1 = SG.sanitizeC3(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(out1.rest, ['2026-10-06', '2026-10-10'], 'валидный rest проходит как есть');
    const bad = fresh();
    bad.rest = [42, '2026-10-06', '2026-10-06', 'мусор', '2026-10-7', '2026-10-07'];
    assert.deepEqual(SG.sanitizeC3(bad).rest, ['2026-10-06', '2026-10-07'], 'дубли и не-дни выкинуты');
    const many = fresh();
    many.rest = Array.from({ length: 20 }, (_, i) => '2026-1' + (i % 2 ? '1' : '0') + '-' + String(i + 1).padStart(2, '0'));
    assert.equal(SG.sanitizeC3(many).rest.length, 14, 'потолок 14 записи');
    assert.equal(SG.sanitizeC3((() => { const x = fresh(); x.rest = 'мусор'; return x; })()).rest.length, 0);
});

test('weekKey: понедельник недели дня (границы пн/вс)', () => {
    assert.equal(M.weekKey('2026-10-05'), '2026-10-05'); // сам понедельник
    assert.equal(M.weekKey('2026-10-11'), '2026-10-05'); // воскресенье той же недели
    assert.equal(M.weekKey('2026-10-12'), '2026-10-12'); // следующий понедельник
});
