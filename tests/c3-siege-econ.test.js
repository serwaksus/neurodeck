'use strict';
// Кампания 3.0 — экономика осады и защита городов (план, стр. 61/167): осада режет доход и прирост города;
// освобождённый город 7 дней держит −30% обороны; у города собственный гарнизон, герой в городе складывается с ним.
// Замечание по существующему: s.gar[FAC_TOWN_GAR=100] — это гарнизон города, захваченного ФРАКЦИЕЙ (именно его выбивает
// освобождающий герой); собственного гарнизона городов игрока в модели не было — добавлен towns[t].gar (ленивое поле).
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/campaign3/c3-data.js');
const M = require('../js/campaign3/c3-model.js');
const SG = require('../js/state-guards.js');

const fresh = () => M.newState('2026-10-05');
const BODY = 0, MIND = 1, SPIRIT = 2, TIES = 3;
const own = (s, ids, ch) => { ids.forEach((i) => { s.own = s.own.slice(0, i) + (ch || '1') + s.own.slice(i + 1); }); };
const shadowsOf = (s, f, v) => { s.fac[f].sh = [v, v, v, v, v, v, v]; };

// ---------- 1. осада снижает доход золота ----------

test('осада: доход города ×SIEGE_TOLL, включая золото зала Связей; снятая осада возвращает доход', () => {
    const s = fresh(); s.sg[BODY] = 1;
    let g = s.res.g;
    M.dayEnd(s, '2026-10-06', {});
    assert.equal(s.res.g, g + D.C.GOLD_TOWN_DAY * 3 + D.C.GOLD_TOWN_DAY * D.C.SIEGE_TOLL, '3 города целиком + осаждённый наполовину');
    s.towns[TIES].hall = 2; s.sg[TIES] = 1; g = s.res.g; // зал Связей осаждённого города тоже платит сбор
    M.dayEnd(s, '2026-10-07', {});
    assert.equal(s.res.g, g + D.C.GOLD_TOWN_DAY * 2 + (D.C.GOLD_TOWN_DAY + 2 * D.C.HALL_GOLD) * D.C.SIEGE_TOLL + D.C.GOLD_TOWN_DAY * D.C.SIEGE_TOLL);
    s.sg[BODY] = 0; s.sg[TIES] = 0; g = s.res.g; // осада отбита/снята — доход вернулся
    M.dayEnd(s, '2026-10-08', {});
    assert.equal(s.res.g, g + D.C.GOLD_TOWN_DAY * 4 + 2 * D.C.HALL_GOLD);
});

test('осада: событие хода фракции называет размер сбора', () => {
    const s = fresh(); shadowsOf(s, 0, 3);
    own(s, [1, 2, 3, 4, 5, 6], M.facCode(0)); s.heroes[BODY].node = 6; s.gar[1] = 40;
    const ev = M.weekEnd(s).events;
    assert.equal(ev[0].kind, 'siege');
    assert.ok(ev[0].text.includes('доход и прирост −50%'), ev[0].text);
});

// ---------- 2. осада снижает прирост армии ----------

test('осада: недельный прирост pools города ×SIEGE_TOLL; неосаждённые города растут как раньше', () => {
    const s = fresh(); s.towns.forEach((t) => { t.pool = { t1: 0, t3: 0, t5: 0 }; });
    s.apWeek = [7, 7, 7, 7]; s.towns[BODY].dw.t3 = 1; s.sg[BODY] = 1;
    M.weekEnd(s);
    assert.equal(s.towns[BODY].pool.t1, Math.floor(D.C.POOL_GROW.t1 * D.C.SIEGE_TOLL), 'осаждённый город растёт вдвое медленнее');
    assert.equal(s.towns[BODY].pool.t3, Math.floor(D.C.POOL_GROW.t3 * D.C.SIEGE_TOLL));
    assert.equal(s.towns[MIND].pool.t1, D.C.POOL_GROW.t1, 'сосед растёт в полную силу');
});

// ---------- 3. отдельный гарнизон города ----------

test('гарнизон: стены + собственный гарнизон + армии героев в городе складываются; без героя город не беззащитен', () => {
    const s = fresh(); // герой Тела стоит в своём городе (стартовая позиция)
    const hero0 = Math.round(8 * D.UNITS.t1.power); // 8 ополченцев × 2
    assert.equal(M.nodeDefense(s, D.TOWNS[BODY]), D.C.TOWN_DEF + D.C.TOWN_GAR + hero0, 'стены + гарнизон + армия героя');
    s.heroes[BODY].node = 6; // герой ушёл — гарнизон остаётся, а не «уводится» героем
    assert.equal(M.nodeDefense(s, D.TOWNS[BODY]), D.C.TOWN_DEF + D.C.TOWN_GAR);
    s.heroes[BODY].army = { t1: 100, t3: 5, t5: 0 }; s.heroes[BODY].node = D.TOWNS[BODY];
    assert.equal(M.nodeDefense(s, D.TOWNS[BODY]), D.C.TOWN_DEF + D.C.TOWN_GAR + (100 * 2 + 5 * 16), 'усиленный герой добавляет свою силу, гарнизон не заменяется');
    s.heroes[MIND].node = D.TOWNS[BODY]; // второй герой в городе тоже встаёт на защиту
    assert.equal(M.nodeDefense(s, D.TOWNS[BODY]), D.C.TOWN_DEF + D.C.TOWN_GAR + (100 * 2 + 5 * 16) + Math.round(8 * D.UNITS.t1.power));
});

test('гарнизон: герой в защите не получает наступательный зал Кузни (уровень — учитывается)', () => {
    const s = fresh(); s.res = { g: 0, st: 100, kn: 100, wl: 100, in: 100 };
    const d0 = M.nodeDefense(s, D.TOWNS[BODY]);
    for (let i = 0; i < 3; i++) M.buyHall(s, BODY);
    assert.equal(M.nodeDefense(s, D.TOWNS[BODY]), d0, 'Кузня бьёт, а не обороняется');
    s.heroes[BODY].lvl = 3; s.heroes[BODY].xp = 0;
    assert.ok(M.nodeDefense(s, D.TOWNS[BODY]) > d0, 'уровень героя усиливает защиту');
});

test('гарнизон: старый сейв без towns[t].gar получает константу (TOWN_DEF + TOWN_GAR = прежние 80 без героя)', () => {
    const s = fresh(); delete s.towns[BODY].gar; s.heroes[BODY].node = 6;
    assert.equal(M.townGar(s, BODY), D.C.TOWN_GAR);
    assert.equal(M.nodeDefense(s, D.TOWNS[BODY]), 80);
});

// ---------- 4. «освобождение»: −30% обороны первые 7 дней ----------

function liberationState() { // город Тела пал после двух недель осады и только что освобождён героем
    const s = fresh(); shadowsOf(s, 0, 3);
    own(s, [1, 2, 3, 4, 5, 6], M.facCode(0)); s.heroes[BODY].node = 6; s.gar[1] = 40;
    M.weekEnd(s); M.weekEnd(s);
    assert.equal(s.own.charAt(0), M.facCode(0), 'город у фракции');
    s.heroes[BODY].node = 1; s.ap[BODY] = 5; s.heroes[BODY].army = { t1: 400, t3: 0, t5: 0 };
    const r = M.engage(s, BODY, 0);
    assert.equal(r.win, true);
    assert.equal(s.sg[BODY], 0, 'осада снята');
    return s;
}

test('освобождение: первые 7 дней оборона города −30%, затем восстанавливается; день освобождения в s.lib', () => {
    const s = liberationState();
    assert.equal(s.lib[BODY], '2026-10-05');
    assert.equal(M.freedLeft(s, BODY), D.C.FREE_DAYS);
    const strong = D.C.TOWN_DEF + D.C.TOWN_GAR + s.heroes[BODY].army.t1 * D.UNITS.t1.power; // потери штурма уже вычтены
    assert.equal(M.nodeDefense(s, D.TOWNS[BODY]), Math.round(strong * D.C.FREE_DEF), '−30% от полной обороны с героем');
    assert.ok(s.log[s.log.length - 1].t.includes('оборона −30%'), 'лог объясняет ослабление');
    for (let i = 0; i < 6; i++) M.dayEnd(s, '2026-10-' + String(6 + i).padStart(2, '0'), {});
    assert.equal(M.freedLeft(s, BODY), 1);
    assert.equal(M.nodeDefense(s, D.TOWNS[BODY]), Math.round(strong * D.C.FREE_DEF), '7-й день ещё ослаблен');
    M.dayEnd(s, '2026-10-12', {});
    assert.equal(s.lib[BODY], 0, 'поле истекло в dayEnd');
    assert.equal(M.freedLeft(s, BODY), 0);
    assert.equal(M.nodeDefense(s, D.TOWNS[BODY]), strong, 'оборона восстановлена');
    assert.equal(M.freedLeft(liberationState(), MIND), 0, 'другие города не задеты');
});

test('освобождение: повторное падение-освождение и старый lib не в будущем ломают штраф', () => {
    const s = liberationState();
    s.lib[BODY] = '2026-09-01'; // давнее «освобождение» из старого сейва — штраф истёк
    assert.equal(M.freedLeft(s, BODY), 0);
    M.dayEnd(s, '2026-10-06', {});
    assert.equal(s.lib[BODY], 0, 'dayEnd вычищает истёкшее');
});

// ---------- 5. санитизация новых полей ----------

test('sanitizeC3: lib — даты или 0, зажимается и лениво; gar городов зажимается; вместе — байт-стабильный раундтрип', () => {
    const s = fresh();
    assert.equal('lib' in SG.sanitizeC3(s), false, 'без lib ключа нет');
    s.lib = ['2026-10-05', 'мусор', 0, -1]; s.towns[BODY].gar = 1e9;
    const o = SG.sanitizeC3(s);
    assert.deepEqual(o.lib, ['2026-10-05', 0, 0, 0]);
    assert.equal(o.towns[BODY].gar, 100000);
    assert.equal(o.towns[MIND].gar, D.C.TOWN_GAR, 'обычный гарнизон проходит как есть');
    assert.equal(JSON.stringify(SG.sanitizeC3(JSON.parse(JSON.stringify(o)))), JSON.stringify(o), 'раундтрип стабилен');
    const old = fresh(); old.towns.forEach((t) => { delete t.gar; }); // сейв до гарнизонов
    assert.equal(JSON.stringify(SG.sanitizeC3(JSON.parse(JSON.stringify(old)))), JSON.stringify(old), 'старый сейв не обрастает полями');
});
