'use strict';
// Кампания 3.0, Ф1 — санитайзер состояния среза (js/state-guards.js: sanitizeC3) и клей-рантайм (js/campaign3/c3-runtime.js).
const test = require('node:test');
const assert = require('node:assert');
const SG = require('../js/state-guards.js');
const D = require('../js/campaign3/c3-data.js');
const M = require('../js/campaign3/c3-model.js');
const R = require('../js/campaign3/c3-runtime.js');

const fresh = () => M.newState('2026-10-05');

test('sanitizeC3: мусор и чужие типы → null', () => {
    [null, undefined, 0, 'x', [], {}, { v: 2, own: '000', day: '2026-10-05' }, { v: 2, own: '1'.repeat(33), day: 'вчера' }, { v: 2, own: '1'.repeat(34), day: '2026-10-05' }, { v: 1, own: '100000002', day: '2026-10-05' }]
        .forEach((v) => assert.equal(SG.sanitizeC3(v), null, JSON.stringify(v)));
});

test('sanitizeC3: валидное состояние проходит раундтрип без изменений (байт-стабильно)', () => {
    const s = fresh();
    for (let i = 0; i < 5; i++) { D.SPHERES.forEach((sp) => M.applyDeed(s, { kind: 'habit', sphere: sp, rank: 'A' })); M.dayEnd(s, '2026-10-' + String(6 + i).padStart(2, '0'), { silent: 1, honest: 1 }); }
    s.towns[1].dw.t3 = 1; s.towns[1].hall = 2;
    const out = SG.sanitizeC3(JSON.parse(JSON.stringify(s)));
    assert.equal(JSON.stringify(out), JSON.stringify(s));
});

test('sanitizeC3: числа зажимаются, лишние поля и длинные строки режутся, города всегда игрока, t5 без t3 невозможно', () => {
    const s = fresh();
    s.res.g = -50; s.res.st = 1e12; s.heroes[0].node = 99; s.heroes[1].lvl = 500; s.ap = [999, -1, 'x']; s.towns[0].hall = 9; s.towns[1].dw = { t3: 0, t5: 1 };
    s.gar = [1e9, -1]; s.own = '2' + s.own.slice(1);
    s.evil = 'x'; s.heroes[0].army.t9 = 5; s.log = Array.from({ length: 30 }, () => ({ d: 'bad', t: 'я'.repeat(500) }));
    s.fac.sh = [500, -3, 'a'];
    const o = SG.sanitizeC3(s);
    assert.equal(o.res.g, 0); assert.equal(o.res.st, 1e6); assert.equal(o.heroes[0].node, 32); assert.equal(o.heroes[1].lvl, 99);
    assert.deepEqual(o.ap, [20, 0, 0, 0]); assert.equal(o.towns[0].hall, 3); assert.equal(o.towns[1].dw.t5, 0);
    assert.equal(o.gar.length, 33); assert.equal(o.gar[0], 100000); assert.equal(o.gar[1], 0);
    [0, 8, 16, 24].forEach((c) => assert.equal(o.own.charAt(c), '1'));
    assert.equal(o.evil, undefined); assert.equal(o.heroes[0].army.t9, undefined);
    assert.equal(o.log.length, 6); assert.ok(o.log.every((l) => l.t.length <= 90 && /^\d{4}-\d{2}-\d{2}$/.test(l.d)));
    assert.equal(o.fac.sh.length, 7); assert.ok(o.fac.sh.every((v) => v >= 0 && v <= 100));
    assert.equal(o.heroes.length, 4); assert.equal(o.towns.length, 4);
});

// ---------- рантайм ----------
function env(over) {
    const calls = { save: 0, render: 0, toasts: [] };
    const e = Object.assign({
        getFlag: () => true, dayKey: () => '2026-10-05', cardsStarted: () => 4,
        sanitize: (raw) => SG.sanitizeC3(raw), save: () => { calls.save++; }, render: () => { calls.render++; }, toast: (t, b) => calls.toasts.push(t),
    }, over || {});
    return { e, calls };
}

test('рантайм: флаг выключен — всё no-op, состояние не создаётся и в сейв не идёт', () => {
    const { e } = env({ getFlag: () => false });
    const c3 = R.create(e);
    assert.equal(c3.enabled(), false);
    assert.equal(c3.onDeed({ kind: 'habit', stat: 'str', rank: 'C' }), null);
    c3.onHonestSkip(); c3.onSilentMisses(2); c3.onTaskOverdue(1);
    assert.deepEqual(c3.dayEnd('2026-10-09'), { days: 0 });
    assert.equal(c3.serialize(), undefined);
    assert.equal(c3.getState(), null);
});

test('рантайм: дело сферы идёт её герою (Ловкость→Тело, Интеллект→Разум, Воля→Дух, Харизма→Связи); задача — по сфере или Разуму', () => {
    const { e } = env(); const c3 = R.create(e);
    assert.equal(c3.onDeed({ kind: 'habit', stat: 'agi', rank: 'C' }).hero, 0);
    assert.equal(c3.onDeed({ kind: 'habit', stat: 'int', rank: 'C' }).hero, 1);
    assert.equal(c3.onDeed({ kind: 'habit', stat: 'wil', rank: 'C' }).hero, 2);
    assert.equal(c3.onDeed({ kind: 'habit', stat: 'cha', rank: 'C' }).hero, 3);
    assert.equal(c3.onDeed({ kind: 'task' }).hero, 1, 'задача без сферы — Разум');
    assert.equal(c3.onDeed({ kind: 'task', sphere: 'ties' }).hero, 3);
    assert.equal(c3.onDeed({ kind: 'task', sphere: 'мусор' }).hero, 1);
    assert.deepEqual(c3.getState().ap, [1, 5, 1, 3]);
});

test('рантайм: срывы дня копятся в pend и превращаются в тени при закрытии суток, pend обнуляется', () => {
    const { e } = env(); const c3 = R.create(e);
    c3.ensure();
    c3.onSilentMisses(2); c3.onHonestSkip(); c3.onHonestSkip(); c3.onTaskOverdue(1);
    const r = c3.dayEnd('2026-10-06');
    assert.equal(r.days, 1);
    assert.equal(M.shadowSum(c3.getState()), 2 + 1 + 1);
    assert.deepEqual(c3.getState().pend, { s: 0, h: 0, o: 0 });
    assert.equal(c3.getState().day, '2026-10-06');
});

test('рантайм: пропущенные дни без открытия приложения — молчание (до 3 теней в сутки), в понедельник идёт недельный ход', () => {
    const { e } = env({ cardsStarted: () => 5 }); const c3 = R.create(e);
    c3.ensure(); // 2026-10-05 — понедельник
    const r = c3.dayEnd('2026-10-12'); // 7 суток; понедельник 12-го закрывает неделю
    assert.equal(r.days, 7);
    assert.equal(c3.getState().wk, 1);
    assert.ok(M.shadowSum(c3.getState()) > 0 && M.shadowSum(c3.getState()) <= 6 * 3, 'тени за 6 пустых суток ограничены капом');
    assert.equal(c3.getState().ap.every((v) => v <= 1), true, 'ОД за простой не появляются');
});

test('рантайм: огромный простой ограничен 28 сутками догонки', () => {
    const { e } = env(); const c3 = R.create(e);
    c3.ensure();
    const r = c3.dayEnd('2027-10-05');
    assert.equal(r.days, 28);
    assert.equal(c3.getState().day, '2027-10-05');
});

test('рантайм: load принимает валидный c3 и отвергает мусор, serialize отдаёт состояние', () => {
    const { e } = env(); const c3 = R.create(e);
    const s = fresh(); s.res.g = 77;
    assert.equal(c3.load(s), true);
    assert.equal(c3.serialize().res.g, 77);
    assert.equal(c3.load({ nope: 1 }), false);
    assert.equal(c3.load({ v: 1, own: '100000002', day: '2026-10-05' }), false, 'старый срез Ф1 отвергается');
    assert.equal(c3.serialize().res.g, 77, 'мусор не затирает прежнее состояние');
});

test('рантайм: действия UI сохраняют и перерисовывают; бой тостит исход', () => {
    const { e, calls } = env(); const c3 = R.create(e);
    c3.ensure();
    const st = c3.getState(); st.ap[0] = 5; st.heroes[0].node = 3; st.heroes[0].army = { t1: 40, t3: 8, t5: 0 };
    const r = c3.act.engage(0, 4);
    assert.equal(r.ok && r.win, true);
    assert.ok(calls.save >= 1 && calls.render >= 1 && calls.toasts.includes('⚔ Победа'));
});
