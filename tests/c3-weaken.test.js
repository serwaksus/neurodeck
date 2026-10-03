'use strict';
// Кампания 3.0 — «как ослабить фракции» (план §3): серия дел ≥7 дней по сфере → −10% натиска связанной фракции;
// ранг-ап карточки → −гарнизон логова её фракции (оплота; если пал — Цитадели), не ниже 50% исходного;
// неделя без теней → фракция теряет крайний узел (поведение Ф3, здесь зафиксировано тестом).
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/campaign3/c3-data.js');
const M = require('../js/campaign3/c3-model.js');

// 2026-10-05 — понедельник; day(0) — старт, dayEnd(day(i+1)) закрывает i-й день
const day = (i) => new Date(Date.UTC(2026, 9, 5 + i)).toISOString().slice(0, 10);
const fresh = () => M.newState(day(0));
const deed = (sphere) => ({ kind: 'habit', sphere: sphere, rank: 'C' });
const serieLines = (s) => s.log.filter((l) => l.t.indexOf('Серия ' + D.C.WEAKEN_STREAK + ' ') === 0);

test('стрик ≥7 дней по сфере: натиск связанной фракции −10%, держится до обрыва серии', () => {
    const s = fresh();
    s.stk[2] = 6;
    assert.equal(M.streakWeak(s, 2), 1, 'шестидневная серия ещё не ослабляет');
    const full = M.facPower(s, 2);
    s.stk[2] = 7;
    assert.equal(M.streakWeak(s, 2), 1 - D.C.WEAKEN_STREAK_PCT);
    const weak = M.facPower(s, 2);
    assert.ok(Math.abs(weak - full * (1 - D.C.WEAKEN_STREAK_PCT)) <= 1, weak + ' ≈ −10% от ' + full);
    s.stk[2] = 30;
    assert.equal(M.facPower(s, 2), weak, 'серия продолжается — скидка держится');
    s.stk[2] = 0;
    assert.equal(M.facPower(s, 2), full, 'обрыв серии возвращает силу');
    s.stk[0] = 99; // чужая серия не помогает
    assert.equal(M.facPower(s, 2), full);
});

test('dayEnd: строка лога один раз на пересечении 7, повторно — только после обрыва и новой серии', () => {
    const s = fresh();
    for (let i = 0; i < 7; i++) { M.applyDeed(s, deed('mind')); M.dayEnd(s, day(i + 1), {}); }
    assert.equal(s.stk[1], D.C.WEAKEN_STREAK);
    assert.equal(serieLines(s).length, 1, 'переход 6→7 пишет строку');
    M.applyDeed(s, deed('mind')); M.dayEnd(s, day(8), {});
    assert.equal(s.stk[1], D.C.WEAKEN_STREAK + 1);
    assert.equal(serieLines(s).length, 0 + 1, 'внутри серии повторов нет');
    M.dayEnd(s, day(9), {}); // день без дел — серия оборвалась
    assert.equal(s.stk[1], 0);
    for (let i = 0; i < 7; i++) { M.applyDeed(s, deed('mind')); M.dayEnd(s, day(10 + i), {}); }
    assert.equal(serieLines(s).length, 2, 'новая серия до 7 — строка снова');
    // мёртвая фракция не спамит журналом
    const d = fresh();
    d.fac[3].dead = 1;
    for (let i = 0; i < 7; i++) { M.applyDeed(d, deed('ties')); M.dayEnd(d, day(i + 1), {}); }
    assert.equal(d.stk[3], D.C.WEAKEN_STREAK);
    assert.equal(serieLines(d).length, 0);
});

test('ранг-ап карточки: −5% гарнизона оплота фракции сферы, не ниже 50% исходного', () => {
    const s = fresh();
    assert.equal(s.gar[7], 120, 'оплот Лени (Тело)');
    const r = M.weakenLairOnRankUp(s, 'body');
    assert.equal(r.ok, true); assert.equal(r.node, 7);
    assert.equal(s.gar[7], 114, 'round(120 × 0.95)');
    assert.equal(M.nodeDefense(s, 7), 114, 'оборона оплота упала вместе с гарнизоном');
    assert.ok(s.log[s.log.length - 1].t.indexOf('Оплот Лени') >= 0, 'строка лога о ударе по логову');
    for (let i = 0; i < 30; i++) M.weakenLairOnRankUp(s, 'body');
    assert.equal(s.gar[7], Math.round(120 * D.C.WEAKEN_GAR_FLOOR), 'пол 60 достигнут и не пробивается');
    assert.equal(M.weakenLairOnRankUp(s, 'body').reason, 'floor');
    assert.equal(M.weakenLairOnRankUp(s, 'мусор').reason, 'sphere');
});

test('ранг-ап при павшем оплоте бьёт по Цитадели; все логова палы — ослаблять некого', () => {
    const s = fresh();
    s.fac[0].dead = 1; // как defeatFaction: оплот Лени взят игроком
    s.own = s.own.slice(0, 7) + '0' + s.own.slice(8);
    s.gar[7] = 0;
    const r = M.weakenLairOnRankUp(s, 'body');
    assert.equal(r.ok, true); assert.equal(r.node, D.LAIR);
    assert.equal(s.gar[D.LAIR], 1330, 'round(1400 × 0.95)');
    s.own = s.own.slice(0, D.LAIR) + '1' + s.own.slice(D.LAIR + 1); // цитадель взята
    assert.equal(M.weakenLairOnRankUp(s, 'body').reason, 'fallen');
    assert.equal(s.log.length, 1, 'отказ лог не пишет');
});

test('неделя без теней: фракция теряет крайний (самый дальний от оплота) узел', () => {
    const s = fresh();
    s.own = s.own.slice(0, 5) + '2' + s.own.slice(6); // Лень заняла топь 5 рядом с оплотом 7
    s.gar[5] = D.C.FAC_NODE_GAR;
    for (let i = 0; i < 7; i++) M.dayEnd(s, day(i + 1), {}); // неделя без единой тени
    const w = M.weekEnd(s);
    assert.ok(w.events.some((e) => e.f === 0 && e.kind === 'retreat' && e.node === 5), 'событие потери узла');
    assert.equal(s.own.charAt(5), '0');
    assert.equal(s.gar[5], 0);
    assert.equal(s.own.charAt(7), '2', 'сам оплот отступлением не теряется');
});
