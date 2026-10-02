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
    [null, undefined, 0, 'x', [], {}, { v: 5, own: '000', day: '2026-10-05' }, { v: 5, own: '1'.repeat(33), day: 'вчера' }, { v: 5, own: '1'.repeat(34), day: '2026-10-05' }, { v: 5, own: '7'.repeat(33), day: '2026-10-05' }, { v: 4, own: '1'.repeat(33), day: '2026-10-05' }, { v: 3, own: '1'.repeat(33), day: '2026-10-05' }, { v: 2, own: '1'.repeat(33), day: '2026-10-05' }, { v: 1, own: '100000002', day: '2026-10-05' }]
        .forEach((v) => assert.equal(SG.sanitizeC3(v), null, JSON.stringify(v)));
});

test('sanitizeC3: валидное состояние проходит раундтрип без изменений (байт-стабильно)', () => {
    const s = fresh();
    for (let i = 0; i < 5; i++) { D.SPHERES.forEach((sp) => M.applyDeed(s, { kind: 'habit', sphere: sp, rank: 'A' })); M.dayEnd(s, '2026-10-' + String(6 + i).padStart(2, '0'), { silent: 1, honest: 1 }); }
    s.heroes[0].sk = 2; s.stk = [3, 0, 1, 0]; s.towns[1].dw.t3 = 1; s.towns[1].hall = 2; s.fac[2].truce = 1; s.fac[0].dead = 1; s.sg[1] = 1; s.lz.on = 1; s.lz.left = 3;
    const out = SG.sanitizeC3(JSON.parse(JSON.stringify(s)));
    assert.equal(JSON.stringify(out), JSON.stringify(s));
});

test('sanitizeC3: числа зажимаются, лишние поля и длинные строки режутся, города всегда игрока, t5 без t3 невозможно', () => {
    const s = fresh();
    s.res.g = -50; s.res.st = 1e12; s.heroes[0].node = 99; s.heroes[1].lvl = 500; s.ap = [999, -1, 'x']; s.towns[0].hall = 9; s.towns[1].dw = { t3: 0, t5: 1 };
    s.gar = [1e9, -1]; s.own = '2' + s.own.slice(1);
    s.heroes[2].sk = 9; s.stk = [500, -1, 'x']; s.evil = 'x'; s.heroes[0].army.t9 = 5; s.log = Array.from({ length: 30 }, () => ({ d: 'bad', t: 'я'.repeat(500) }));
    s.fac = [{ sh: [500, -3, 'a'], dead: 'yes', truce: 1 }, { truce: 1, sh: [1] }, 'мусор']; s.sg = [99, -1]; s.lz = { on: 5, left: 999 };
    s.pend = { s: [5, -2, 'x'], h: 9, o: [1, 2, 3, 4, 5, 6] };
    const o = SG.sanitizeC3(s);
    assert.equal(o.res.g, 0); assert.equal(o.res.st, 1e6); assert.equal(o.heroes[0].node, 32); assert.equal(o.heroes[1].lvl, 99);
    assert.deepEqual(o.ap, [20, 0, 0, 0]); assert.equal(o.towns[0].hall, 3); assert.equal(o.towns[1].dw.t5, 0);
    assert.equal(o.gar.length, 33); assert.equal(o.gar[0], 100000); assert.equal(o.gar[1], 0);
    [0, 8, 16, 24].forEach((c) => assert.equal(o.own.charAt(c), '1'));
    assert.equal(o.evil, undefined); assert.equal(o.heroes[0].army.t9, undefined);
    assert.equal(o.log.length, 6); assert.ok(o.log.every((l) => l.t.length <= 90 && /^\d{4}-\d{2}-\d{2}$/.test(l.d)));
    assert.equal(o.fac.length, 4); o.fac.forEach((f) => { assert.equal(f.sh.length, 7); assert.ok(f.sh.every((v) => v >= 0 && v <= 100)); });
    assert.equal(o.fac[0].dead, 1); assert.equal(o.fac[0].truce, 0, 'у мёртвой фракции перемирия нет'); assert.equal(o.fac.filter((f) => f.truce).length, 1, 'не больше одного обета');
    assert.deepEqual(o.sg, [10, 0, 0, 0]); assert.deepEqual(o.lz, { on: 1, left: 30 });
    assert.deepEqual(o.pend.s, [5, 0, 0, 0]); assert.deepEqual(o.pend.h, [0, 0, 0, 0]); assert.deepEqual(o.pend.o, [1, 2, 3, 4]);
    assert.equal(o.heroes[2].sk, 3); assert.deepEqual(o.stk, [99, 0, 0, 0]);
    assert.equal(o.heroes.length, 4); assert.equal(o.towns.length, 4);
});

// ---------- рантайм ----------
function env(over) {
    const calls = { save: 0, render: 0, toasts: [] };
    const e = Object.assign({
        getFlag: () => true, dayKey: () => '2026-10-05', cardsBySphere: () => [2, 1, 1, 1], sphereRanks: (sp) => (sp === 'body' ? ['SSS', 'B'] : []),
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

test('рантайм: срывы дня копятся в pend ПО СФЕРАМ и превращаются в тени своих фракций при закрытии суток, pend обнуляется', () => {
    const { e } = env(); const c3 = R.create(e);
    c3.ensure();
    c3.onSilentMisses([2, 0, 1, 0]); c3.onHonestSkip('wil'); c3.onHonestSkip('wil'); c3.onHonestSkip('str'); c3.onTaskOverdue([0, 1, 0, 0]); c3.onSilentMisses(2);
    const r = c3.dayEnd('2026-10-06');
    assert.equal(r.days, 1);
    const last = c3.getState().fac.map((f) => f.sh[f.sh.length - 1]);
    assert.deepEqual(last, [2 + 0.5, 1 + 2 + 0, 1 + 1, 0], 'Тело 2 молч.+0.5; Разум 1 просрочка + 2 «без сферы»; Дух 1 молч. + 2×0.5; Связи 0');
    assert.deepEqual(c3.getState().pend, { s: [0, 0, 0, 0], h: [0, 0, 0, 0], o: [0, 0, 0, 0] });
    assert.equal(c3.getState().day, '2026-10-06');
});

test('рантайм: пропущенные дни без открытия приложения — молчание по сферам (до 3 в сутки на сферу), в понедельник идёт ход фракций', () => {
    const { e } = env({ cardsBySphere: () => [5, 0, 1, 0] }); const c3 = R.create(e);
    c3.ensure(); // 2026-10-05 — понедельник
    const r = c3.dayEnd('2026-10-12'); // 7 суток; понедельник 12-го закрывает неделю
    assert.equal(r.days, 7);
    assert.equal(c3.getState().wk, 1);
    const st = c3.getState();
    assert.ok(M.facSum(st, 0) > 0 && M.facSum(st, 0) <= 6 * 3, 'тени Лени за 6 пустых суток ограничены капом');
    assert.equal(M.facSum(st, 1), 0, 'в сфере без карточек срывать нечего');
    assert.ok(M.facSum(st, 2) > 0 && M.facSum(st, 2) <= 6);
    assert.equal(st.ap.every((v) => v <= 1), true, 'ОД за простой не появляются');
    assert.ok(Array.isArray(r.events));
});

test('рантайм: огромный простой ограничен 28 сутками догонки', () => {
    const { e } = env(); const c3 = R.create(e);
    c3.ensure();
    const r = c3.dayEnd('2027-10-05');
    assert.equal(r.days, 28);
    assert.equal(c3.getState().day, '2027-10-05');
});

test('рантайм: лазарет и перемирие — действия UI сохраняют и перерисовывают', () => {
    const { e, calls } = env(); const c3 = R.create(e);
    c3.ensure();
    assert.equal(c3.act.truce(1, true).ok, true); assert.equal(c3.getState().fac[1].truce, 1);
    assert.equal(c3.act.truce(1, false).ok, true); assert.equal(c3.getState().fac[1].truce, 0);
    assert.equal(c3.act.lazaret(true).ok, true); assert.equal(c3.getState().lz.on, 1);
    assert.equal(c3.act.truce(2, true).reason, 'lazaret');
    assert.equal(c3.act.lazaret(false).ok, true);
    assert.ok(calls.save >= 4 && calls.render >= 4);
});

test('рантайм: сводка недели — тост на самое важное событие хода фракций (падение города важнее занятия узла)', () => {
    const { e, calls } = env(); const c3 = R.create(e);
    const st = c3.ensure();
    st.fac[0].sh = [3, 3, 3, 3, 3, 3, 3];
    c3.dayEnd('2026-10-12');
    assert.ok(calls.toasts.some((t) => /Ход фракций|Город пал|Пороки отступают/.test(t)), 'тост о ходе фракции: ' + calls.toasts.join('|'));
    assert.ok(c3.getState().log.length >= 1);
});

test('рантайм: load принимает валидный c3 и отвергает мусор, serialize отдаёт состояние', () => {
    const { e } = env(); const c3 = R.create(e);
    const s = fresh(); s.res.g = 77;
    assert.equal(c3.load(s), true);
    assert.equal(c3.serialize().res.g, 77);
    assert.equal(c3.load({ nope: 1 }), false);
    assert.equal(c3.load({ v: 1, own: '100000002', day: '2026-10-05' }), false, 'старый срез Ф1 отвергается');
    assert.equal(c3.load(Object.assign(fresh(), { v: 4 })), false, 'состояние Ф4 отвергается');
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

test('рантайм: тактики предлагаются по рангам карточек сферы героя; бой с тактикой применяет её', () => {
    const { e } = env(); const c3 = R.create(e);
    const st = c3.ensure();
    const o = c3.act.offer(0);
    assert.equal(o.length, 3); assert.equal(o[0].rank, 'SSS'); assert.equal(o[0].p, 0.25); assert.equal(o[1].rank, 'B'); assert.equal(o[2].rank, null);
    assert.equal(c3.act.offer(1)[0].rank, null, 'у Разума нет карточек — базовая сила');
    st.ap[0] = 5; st.heroes[0].node = 3; st.heroes[0].army = { t1: 18, t3: 0, t5: 0 };
    const rush = { kind: 'rush', p: 0.25 };
    const r = c3.act.engage(0, 4, rush);
    assert.equal(r.win, true); assert.equal(r.tactic.kind, 'rush');
});

test('наследие: sanitizeC3 сохраняет и зажимает lg; без lg ключа нет', () => {
    const s = fresh(); assert.equal('lg' in SG.sanitizeC3(s), false);
    s.lg = { g: 99999, hall: [1, 5, 0, 1], sk: [1, 0, 0, 0], a: 5000, l: [9, 0, 2, 4], evil: 1 };
    const o = SG.sanitizeC3(s);
    assert.deepEqual(o.lg, { g: 2000, hall: [1, 1, 0, 1], sk: [1, 0, 0, 0], a: 1000, l: [4, 1, 2, 4] });
    const lg = M.legacyFromV14({ captured: 12, seasonNum: 3, throne: 1, bosses: 4, units: { t1: 100, t4: 10 }, stats: { str: { value: 20 }, end: { value: 20 }, agi: { value: 20 }, int: { value: 3 } } });
    const st = M.newState('2026-10-05', lg); assert.deepEqual(SG.sanitizeC3(JSON.parse(JSON.stringify(st))), st, 'раундтрип с наследием байт-стабилен');
});

test('рантайм: наследие применяется один раз при создании карты и только если есть что переносить', () => {
    const src = { captured: 10, seasonNum: 2, throne: 0, bosses: 0, units: { t1: 50 }, stats: { str: { value: 11 }, end: { value: 11 }, agi: { value: 11 } } };
    const { e } = env({ legacySource: () => src }); const c3 = R.create(e);
    const st = c3.ensure();
    assert.ok(st.lg); assert.equal(st.lg.hall[0], 1); assert.equal(st.lg.hall[2], 0); assert.equal(st.res.g, D.C.START_GOLD + 100);
    assert.equal(st.heroes[0].lvl, 2); assert.equal(st.heroes[1].lvl, 1);
    const empty = R.create(env({ legacySource: () => ({}) }).e); assert.equal('lg' in empty.ensure(), false, 'пустое наследие не пишется');
    const none = R.create(env().e); assert.equal('lg' in none.ensure(), false, 'без источника наследия — чистая карта');
});

test('рантайм: boot подхватывает отложенный сейв и закрывает сутки; без флага — ничего', () => {
    const base = fresh(); base.day = '2026-10-03'; base.res.g = 77;
    let stash = JSON.parse(JSON.stringify(base)); const { e, calls } = env({ takeStash: () => { const r = stash; stash = undefined; return r; } });
    const c3 = R.create(e);
    c3.boot();
    assert.equal(c3.getState().res.g >= 77, true); assert.equal(c3.getState().day, '2026-10-05', 'сутки догнаны');
    assert.ok(calls.render >= 1);
    c3.boot(); // повтор безопасен
    const off = R.create(env({ getFlag: () => false, takeStash: () => JSON.parse(JSON.stringify(base)) }).e); off.boot(); assert.equal(off.getState().day, '2026-10-03', 'без флага сутки не закрываются');
});
