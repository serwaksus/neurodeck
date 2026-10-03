'use strict';
// Кампания 3.0 — кнопка «Закончить ход» (план §1 «Игровой цикл»): игрок явно завершает действия на сегодня.
// Сутки НЕ закрываются досрочно — их по-прежнему закрывает dayEnd на смене дня; eot — ленивое поле-ключ дня,
// сбрасывается в dayEnd; санитизация пропускает только ключ текущего дня.
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/campaign3/c3-data.js');
const M = require('../js/campaign3/c3-model.js');
const SG = require('../js/state-guards.js');

// 2026-10-05 — понедельник
const fresh = () => M.newState('2026-10-05');
const deed = (sphere, rank) => ({ kind: 'habit', sphere: sphere, rank: rank || 'C' });

test('endTurn: ставит eot = текущий день, сутки не закрывает, ОД не трогает (C4 цел)', () => {
    const s = fresh();
    M.applyDeed(s, deed('body'));
    const r = M.endTurn(s);
    assert.equal(r.ok, true);
    assert.equal(s.eot, '2026-10-05');
    assert.equal(M.turnEnded(s), true);
    assert.equal(s.day, '2026-10-05', 'сутки не закрыты досрочно');
    assert.equal(s.ap[0], 1, 'ОД не сгорели и не обнулились');
    assert.equal(r.apLeft, 1);
    assert.equal(r.deeds, 1);
    // после «конца хода» день ещё жив: дела продолжают давать ОД (досрочно мы ничего не замораживаем)
    M.applyDeed(s, deed('body'));
    assert.equal(s.ap[0], 2);
});

test('endTurn: сводка — ОД всех героев, захваты сегодня по журналу, прогноз теней из уже известных срывов', () => {
    const s = fresh();
    M.applyDeed(s, deed('body', 'A')); // 2 ОД
    M.applyDeed(s, deed('mind'));      // 1 ОД
    s.pend = { s: [1, 0, 0, 0], h: [0, 1, 0, 0], o: [0, 0, 2, 0] }; // молчание Тела, честный пропуск Разума, просрочка Духа
    const r = M.endTurn(s);
    assert.equal(r.apLeft, 3);
    assert.equal(r.deeds, 2);
    assert.equal(r.shadows, 3.5, '1 + 0.5·1 + 2 — как посчитает dayEnd');
    assert.equal(r.taken, 0);
    M.pushLog(s, 'Воитель взял: Застава (+25 💰)'); // журнал пишет с ключом текущего дня
    assert.equal(M.endTurn(s).taken, 1, 'повторный вызов идемпотентен и видит захват');
});

test('endTurn: в объявленный отдых и лазарет прогноз теней 0 (зеркалит dayEnd)', () => {
    const a = fresh();
    M.declareRest(a, '2026-10-06');      // завтра — отдых
    M.dayEnd(a, '2026-10-06', {});       // закрыли понедельник, сегодня — отдых-день
    a.pend = { s: [2, 0, 0, 0], h: [0, 0, 0, 0], o: [0, 0, 0, 0] };
    assert.equal(M.endTurn(a).shadows, 0, 'отдых-день: срывы теней не дадут');
    const b = fresh();
    M.lazaretStart(b);
    b.pend = { s: [2, 0, 0, 0], h: [0, 0, 0, 0], o: [0, 0, 0, 0] };
    assert.equal(M.endTurn(b).shadows, 0, 'лазарет: срывы теней не дадут');
});

test('endTurn: на пройденной карте отказ', () => {
    const s = fresh();
    s.done = true;
    assert.deepEqual(M.endTurn(s), { ok: false, reason: 'done' });
    assert.equal(s.eot, undefined, 'флаг не ставится');
});

test('dayEnd сбрасывает eot; до смены суток turnEnded держится', () => {
    const s = fresh();
    M.applyDeed(s, deed('body')); // 1 ОД — проверит перенос
    M.endTurn(s);
    assert.equal(M.turnEnded(s), true);
    M.dayEnd(s, '2026-10-06', {});
    assert.equal('eot' in s, false, 'поле удалено, а не протухло');
    assert.equal(M.turnEnded(s), false);
    assert.equal(s.ap[0], 1, 'перенос 1 ОД работает как раньше');
    // старый сейв без поля: turnEnded ложен, dayEnd с delete по отсутствующему ключу — не ошибка
    const old = fresh();
    assert.equal(M.turnEnded(old), false);
    M.dayEnd(old, '2026-10-06', {});
    assert.equal('eot' in old, false);
});

test('sanitizeC3: eot — только ключ текущего дня; мусор и чужой день выбрасываются, старые сейвы не меняются', () => {
    const s = fresh();
    assert.equal(SG.sanitizeC3(JSON.parse(JSON.stringify(s))).eot, undefined, 'байт-стабильный раундтрип сейва без eot');
    M.endTurn(s);
    const out1 = SG.sanitizeC3(JSON.parse(JSON.stringify(s)));
    assert.equal(out1.eot, '2026-10-05', 'валидный eot проходит');
    assert.equal(M.turnEnded(out1), true, 'после санитизации флаг читается');
    assert.equal(SG.sanitizeC3((() => { const x = fresh(); x.eot = 'мусор'; return x; })()).eot, undefined);
    assert.equal(SG.sanitizeC3((() => { const x = fresh(); x.eot = 42; return x; })()).eot, undefined);
    assert.equal(SG.sanitizeC3((() => { const x = fresh(); x.eot = '2026-10-04'; return x; })()).eot, undefined, 'прошлый/чужой день — не ход этого дня');
});
