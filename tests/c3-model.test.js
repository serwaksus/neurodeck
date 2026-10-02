'use strict';
// Кампания 3.0, Ф2 — юнит-тесты чистой модели (js/campaign3/*): 4 героя-сферы, карта из 33 узлов. Дизайн: docs/plan/CAMPAIGN-3.0.md.
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/campaign3/c3-data.js');
const M = require('../js/campaign3/c3-model.js');
const SD = require('../js/stronghold-data.js');

const fresh = () => M.newState('2026-10-05');
const clone = (s) => JSON.parse(JSON.stringify(s));
const deed = (sphere, rank) => ({ kind: 'habit', sphere: sphere, rank: rank || 'C' });
const BODY = 0, MIND = 1, SPIRIT = 2, TIES = 3;

test('данные: единицы совпадают по силе с UNIT_TIERS; 33 узла, граф связный и симметричный; города и шахты по сферам', () => {
    D.UNIT_KEYS.forEach((k) => assert.equal(D.UNITS[k].power, SD.UNIT_TIERS[k].power, 'сила ' + k));
    assert.equal(D.NODES.length, 33);
    D.NODES.forEach((n, i) => { assert.equal(n.id, i); assert.ok(M.shortestPath(0, i), 'узел ' + i + ' достижим'); });
    D.SPHERES.forEach((sp, k) => {
        assert.equal(D.NODES[D.TOWNS[k]].type, 'town'); assert.equal(D.NODES[D.TOWNS[k]].sphere, sp);
        assert.equal(D.NODES[D.MINES[k]].type, 'mine'); assert.equal(D.NODES[D.MINES[k]].sphere, sp);
    });
    assert.equal(D.NODES[D.LAIR].type, 'lair');
    D.EDGES.forEach((e) => { assert.ok(M.ADJ[e[0]].includes(e[1]) && M.ADJ[e[1]].includes(e[0])); });
    D.NODES.forEach((n) => { assert.ok(n.x >= 0 && n.x <= 100 && n.y >= 0 && n.y <= 100, 'координаты ' + n.id); });
    assert.equal(Object.keys(D.RES_KEY).length, 4);
    assert.equal(new Set(D.SPHERES.map((sp) => D.RES_KEY[sp])).size, 4, 'у каждой сферы свой ресурс');
});

test('ОД: бонус ранга C/B 0, A/S 1, SS/SSS 2; задача 2', () => {
    ['C', 'CC', 'CCC', 'B', 'BB', 'BBB'].forEach((r) => assert.equal(M.rankBonus(r), 0, r));
    ['A', 'AA', 'AAA', 'S'].forEach((r) => assert.equal(M.rankBonus(r), 1, r));
    ['SS', 'SSS'].forEach((r) => assert.equal(M.rankBonus(r), 2, r));
    assert.equal(M.deedAp(deed('body', 'SSS')), 3);
    assert.equal(M.deedAp({ kind: 'task' }), 2);
});

test('C9: дело сферы S даёт ОД и ресурс ТОЛЬКО герою и ресурсу сферы S', () => {
    D.SPHERES.forEach((sp, k) => {
        const s = fresh();
        const r = M.applyDeed(s, deed(sp, 'A'));
        assert.equal(r.gained, 2); assert.equal(r.hero, k);
        s.ap.forEach((v, i) => assert.equal(v, i === k ? 2 : 0, 'ОД героя ' + i));
        D.SPHERES.forEach((o) => assert.equal(s.res[D.RES_KEY[o]], o === sp ? 1 : 0, 'ресурс ' + o));
    });
});

test('applyDeed: неизвестная сфера у привычки — ноль; у задачи — по умолчанию Разум; задача по сфере', () => {
    const s = fresh();
    assert.deepEqual([M.applyDeed(s, deed('x')).gained, M.applyDeed(s, deed('x')).reason], [0, 'sphere']);
    assert.equal(M.applyDeed(s, { kind: 'task' }).hero, MIND);
    assert.equal(M.applyDeed(s, { kind: 'task', sphere: 'ties' }).hero, TIES);
    assert.equal(M.applyDeed(s, { kind: 'bogus', sphere: 'body' }).reason, 'kind');
});

test('applyDeed: кап 6 ОД в сутки на героя (другие герои не затронуты) и 5 задач в сутки всего', () => {
    const s = fresh();
    for (let i = 0; i < 10; i++) M.applyDeed(s, deed('body', 'SSS'));
    assert.equal(s.apDay[BODY], D.C.AP_CAP_DAY); assert.equal(s.ap[BODY], 6);
    assert.equal(M.applyDeed(s, deed('mind', 'C')).gained, 1, 'Разум не упёрся в кап Тела');
    const t = fresh();
    for (let i = 0; i < 9; i++) M.applyDeed(t, { kind: 'task', sphere: D.SPHERES[i % 4] });
    assert.equal(t.tasksToday, D.C.TASK_CAP_DAY, 'задач учтено не больше капа');
});

test('«Возвращение»: после ≥3 пустых дней первое дело ×2, второе — обычное', () => {
    const s = fresh();
    for (let i = 0; i < 3; i++) M.dayEnd(s, '2026-10-0' + (6 + i), {});
    assert.equal(s.idle, 3);
    assert.equal(M.applyDeed(s, deed('body')).gained, 2);
    assert.equal(M.applyDeed(s, deed('mind')).gained, 1);
    M.dayEnd(s, '2026-10-09', {});
    assert.equal(s.idle, 0);
});

test('C4: ОД растут ТОЛЬКО от дел — день, неделя, ход, найм, залы, бой их не прибавляют; без ОД герои стоят в городах', () => {
    const s = fresh();
    s.res = { g: 5000, st: 500, kn: 500, wl: 500, in: 500 };
    for (let i = 0; i < 30; i++) {
        M.dayEnd(s, '2026-11-' + String(i + 1).padStart(2, '0'), { silent: 2 });
        if (i % 7 === 6) M.weekEnd(s);
        for (let h = 0; h < 4; h++) {
            M.travel(s, h, D.LAIR); M.hire(s, h, 't1', 1); M.buyHall(s, h); M.buildDwelling(s, h, 't3');
            for (let id = 0; id < D.NODES.length; id++) M.engage(s, h, id);
        }
        assert.deepEqual(s.ap, [0, 0, 0, 0], 'ОД не появились сами (день ' + i + ')');
    }
    s.heroes.forEach((h, i) => assert.equal(h.node, D.TOWNS[i]));
});

test('перенос: после dayEnd у каждого героя остаётся не больше AP_CARRY', () => {
    const s = fresh(); s.ap = [5, 3, 0, 9];
    M.dayEnd(s, '2026-10-06', {});
    assert.deepEqual(s.ap, [1, 1, 0, 1]);
});

test('маршрут: болото дороже; путь обходит вражеские узлы, пока есть свободный; стоп перед врагом', () => {
    const s = fresh();
    const r = M.route(s, BODY, 7);
    assert.deepEqual(r.steps, [1, 3, 5]); assert.equal(r.battleNode, 7); assert.equal(r.cost, 4, '1+1+2: топь стоит 2');
    // от форта Разума (15) к форту Тела (7) прямой путь через логово — враг; маршрут идёт в обход, а не в бой с логовом
    const s2 = fresh(); s2.heroes[MIND].node = 15;
    [15, 12, 4, 3, 5].forEach((i) => { s2.own = s2.own.slice(0, i) + '1' + s2.own.slice(i + 1); }); // свободный обход по границе Тело–Разум
    const r2 = M.route(s2, MIND, 7);
    assert.notEqual(r2.battleNode, D.LAIR, 'логово не на пути, если есть обход');
    assert.equal(M.shortestPath(15, 7, s2).path.includes(D.LAIR), false);
    assert.equal(M.shortestPath(15, 7).path.includes(D.LAIR), true, 'без учёта врагов кратчайший путь идёт через логово');
});

test('travel: ходит, пока хватает ОД; без ОД стоит; останавливается перед враждебным узлом', () => {
    const s = fresh(); s.ap[BODY] = 1;
    const t = M.travel(s, BODY, 3);
    assert.deepEqual(t.moved, [1]); assert.equal(t.stopped, 'ap'); assert.equal(s.heroes[BODY].node, 1);
    const w = fresh(); w.ap[BODY] = 6;
    const h = M.travel(w, BODY, 7);
    assert.equal(h.stopped, 'hostile'); assert.equal(h.battleNode, 7); assert.equal(w.heroes[BODY].node, 5); assert.equal(w.ap[BODY], 2);
    assert.equal(w.ap[MIND], 0, 'чужие ОД не тронуты');
});

test('бой: детерминирован по (день, номер боя); победа забирает узел, золото и ресурс сферы региона; поражение — потери', () => {
    const mk = () => { const s = fresh(); s.heroes[BODY].node = 5; s.ap[BODY] = 5; s.heroes[BODY].army = { t1: 40, t3: 8, t5: 0 }; return s; };
    const a = mk(), b = mk();
    const ra = M.engage(a, BODY, 6), rb = M.engage(b, BODY, 6); // тайник Тела (25)
    assert.deepEqual(ra, rb); assert.equal(M.stateHash(a), M.stateHash(b));
    assert.equal(ra.win, true);
    assert.equal(a.own.charAt(6), '1'); assert.equal(a.heroes[BODY].node, 6);
    assert.equal(a.res.g, D.C.START_GOLD + 50); assert.equal(a.res.st, 4, 'сталь за тайник Тела');
    assert.ok(a.heroes[BODY].army.t1 < 40, 'победа не бесплатна');
    const weak = mk(); weak.heroes[BODY].army = { t1: 8, t3: 0, t5: 0 }; weak.heroes[BODY].node = 3; weak.ap[BODY] = 5;
    const rl = M.engage(weak, BODY, 4); // застава 40 против 16
    assert.equal(rl.win, false);
    assert.equal(weak.own.charAt(4), '0'); assert.equal(weak.heroes[BODY].node, 3);
    assert.ok(weak.heroes[BODY].army.t1 >= 1, 'стопа не исчезает целиком');
});

test('бой: нельзя бить далёкий или мирный узел, нельзя без ОД; ОД тратятся у ходящего героя', () => {
    const s = fresh(); s.ap[BODY] = 3;
    assert.equal(M.engage(s, BODY, 4).reason, 'far');
    s.heroes[BODY].node = 3;
    assert.equal(M.engage(s, BODY, 1).reason, 'peace');
    s.ap[BODY] = 0;
    assert.equal(M.engage(s, BODY, 4).reason, 'ap');
    s.ap[BODY] = 3; s.heroes[BODY].army = { t1: 100, t3: 0, t5: 0 };
    M.engage(s, BODY, 4);
    assert.equal(s.ap[BODY], 2); assert.equal(s.ap[MIND], 0);
});

test('логово: победа завершает карту; оборона растёт с тенями до потолка; Монастырь смягчает рост', () => {
    const s = fresh();
    assert.equal(M.nodeDefense(s, D.LAIR), 1400);
    s.fac.sh = [10, 10, 10, 10, 10, 10, 10];
    assert.equal(M.shadowMult(s), D.C.SHADOW_CAP);
    assert.equal(M.nodeDefense(s, D.LAIR), 3500);
    const w = fresh(); w.fac.sh = [2, 2, 2, 2, 2, 2, 2];
    const m0 = M.shadowMult(w); w.towns[SPIRIT].hall = 3;
    assert.ok(M.shadowMult(w) < m0, 'зал Духа снижает множитель');
    const win = fresh(); win.heroes[BODY].node = 7; win.ap[BODY] = 5; win.heroes[BODY].army = { t1: 2000, t3: 0, t5: 0 };
    const r = M.engage(win, BODY, D.LAIR);
    assert.equal(r.win, true); assert.equal(win.done, true); assert.equal(win.own.charAt(D.LAIR), '1');
});

test('тени: окно 7 дней; честный пропуск весит вдвое меньше молчаливого', () => {
    const s = fresh();
    M.dayEnd(s, '2026-10-06', { silent: 2, honest: 2, overdue: 1 });
    assert.equal(M.shadowSum(s), 4);
    for (let i = 0; i < 7; i++) M.dayEnd(s, '2026-10-' + (7 + i), {});
    assert.equal(M.shadowSum(s), 0);
});

test('экономика суток: золото от 4 городов, ресурс сферы от занятой шахты; зал Связей добавляет золото', () => {
    const s = fresh(); s.own = s.own.slice(0, 2) + '1' + s.own.slice(3); // шахта Тела занята
    const g0 = s.res.g;
    M.dayEnd(s, '2026-10-06', {});
    assert.equal(s.res.g, g0 + D.C.GOLD_TOWN_DAY * 4); assert.equal(s.res.st, 1); assert.equal(s.res.kn, 0);
    s.towns[TIES].hall = 2; const g1 = s.res.g;
    M.dayEnd(s, '2026-10-07', {});
    assert.equal(s.res.g, g1 + D.C.GOLD_TOWN_DAY * 4 + 2 * D.C.HALL_GOLD);
});

test('найм: только в городе; t3/t5 требуют жилище; ресурсы сферы города и соседней по кольцу; пул и золото', () => {
    const s = fresh(); s.res = { g: 1000, st: 50, kn: 50, wl: 50, in: 50 };
    assert.equal(M.hire(s, BODY, 't1', 5).ok, true);
    assert.equal(s.heroes[BODY].army.t1, D.C.START_ARMY.t1 + 5); assert.equal(s.res.g, 990);
    assert.equal(M.hire(s, BODY, 't1', 99).reason, 'pool');
    assert.equal(M.hire(s, BODY, 't3', 1).reason, 'nodwelling');
    assert.equal(M.buildDwelling(s, BODY, 't3').ok, true);
    assert.equal(M.buildDwelling(s, BODY, 't3').reason, 'built');
    assert.equal(M.buildDwelling(s, BODY, 't5').ok, true);
    s.towns[BODY].pool.t3 = 3; s.towns[BODY].pool.t5 = 2;
    const st0 = s.res.st, kn0 = s.res.kn;
    assert.equal(M.hire(s, BODY, 't3', 2).ok, true); assert.equal(s.res.st, st0 - 2 * D.UNITS.t3.own);
    assert.equal(M.hire(s, BODY, 't5', 1).ok, true);
    assert.equal(s.res.kn, kn0 - D.UNITS.t5.nb, 'элита Тела требует Знания соседней сферы (Разум)');
    s.heroes[BODY].node = 1;
    assert.equal(M.hire(s, BODY, 't1', 1).reason, 'away');
    const poor = fresh(); poor.towns[BODY].dw.t3 = 1; poor.towns[BODY].pool.t3 = 1; poor.res.g = 1000;
    assert.deepEqual([M.hire(poor, BODY, 't3', 1).ok, M.hire(poor, BODY, 't3', 1).reason], [false, 'res']);
    const broke = fresh(); broke.res.g = 0;
    assert.equal(M.hire(broke, BODY, 't1', 1).reason, 'gold');
});

test('жилище t5 требует t3; герой любой сферы может купить в чужом городе, цена — ресурсы города', () => {
    const s = fresh(); s.res = { g: 1000, st: 50, kn: 50, wl: 50, in: 50 };
    assert.equal(M.buildDwelling(s, BODY, 't5').reason, 'prereq');
    s.heroes[BODY].node = D.TOWNS[MIND];
    assert.equal(M.townAt(s, BODY), MIND);
    const kn0 = s.res.kn;
    assert.equal(M.buildDwelling(s, BODY, 't3').ok, true);
    assert.equal(s.towns[MIND].dw.t3, 1); assert.equal(s.res.kn, kn0 - D.DWELLING.t3.own, 'платит ресурсом сферы ГОРОДА (Знания)');
});

test('залы: цена растёт, потолок 3 уровня, эффекты (атака, оборона узлов, прирост, найм дешевле)', () => {
    const s = fresh(); s.res = { g: 0, st: 100, kn: 100, wl: 100, in: 100 };
    const p0 = M.armyPower(s, BODY), d0 = M.nodeDefense(s, 0), hg0 = M.hireGold(s, 't1', 10);
    assert.equal(M.hallCost(s, BODY), 5);
    assert.equal(M.buyHall(s, BODY).ok, true); assert.equal(M.hallCost(s, BODY), 10);
    M.buyHall(s, BODY); M.buyHall(s, BODY);
    assert.equal(M.buyHall(s, BODY).reason, 'max');
    assert.ok(M.armyPower(s, BODY) > p0);
    s.heroes[SPIRIT].node = D.TOWNS[SPIRIT]; M.buyHall(s, SPIRIT);
    assert.equal(M.nodeDefense(s, 0), d0 + D.C.HALL_DEF);
    s.heroes[TIES].node = D.TOWNS[TIES]; M.buyHall(s, TIES);
    assert.ok(M.hireGold(s, 't1', 10) < hg0);
    const bad = fresh(); bad.heroes[BODY].node = 1;
    assert.equal(M.buyHall(bad, BODY).reason, 'away');
    const poor = fresh();
    assert.equal(M.buyHall(poor, BODY).reason, 'res');
});

test('передача армий: только на одном узле; всё или часть', () => {
    const s = fresh();
    assert.equal(M.transfer(s, BODY, MIND, 't1', 1).reason, 'apart');
    s.heroes[MIND].node = s.heroes[BODY].node;
    assert.equal(M.transfer(s, BODY, MIND, 't1', 3).ok, true);
    assert.deepEqual([s.heroes[BODY].army.t1, s.heroes[MIND].army.t1], [5, 11]);
    assert.equal(M.transfer(s, BODY, MIND, 't1', 99).reason, 'army');
    assert.equal(M.transferAll(s, BODY, MIND).ok, true);
    assert.equal(s.heroes[BODY].army.t1, 0); assert.equal(s.heroes[MIND].army.t1, 16);
    assert.equal(M.transfer(s, BODY, BODY, 't1', 1).reason, 'arg');
});

test('неделя: прирост города зависит от дел ЕГО сферы; жилища открывают t3/t5; потолки; Академия ускоряет', () => {
    const s = fresh(); s.towns.forEach((t) => { t.pool = { t1: 0, t3: 0, t5: 0 }; });
    s.apWeek = [100, 0, 0, 0]; s.towns[BODY].dw.t3 = 1;
    M.weekEnd(s);
    assert.equal(s.towns[BODY].pool.t1, D.C.POOL_GROW.t1);
    assert.equal(s.towns[BODY].pool.t3, D.C.POOL_GROW.t3);
    assert.equal(s.towns[BODY].pool.t5, 0, 'нет жилища — нет прироста');
    assert.equal(s.towns[MIND].pool.t1, Math.floor(D.C.POOL_GROW.t1 * D.C.GROW_FLOOR), 'без дел Разума его город почти не растёт');
    assert.deepEqual(s.apWeek, [0, 0, 0, 0]);
    const ac = fresh(); ac.towns.forEach((t) => { t.pool = { t1: 0, t3: 0, t5: 0 }; }); ac.apWeek = [100, 100, 100, 100]; ac.towns[MIND].hall = 3;
    M.weekEnd(ac);
    assert.ok(ac.towns[BODY].pool.t1 > D.C.POOL_GROW.t1, 'зал Разума повышает прирост');
    const cap = fresh(); for (let i = 0; i < 30; i++) { cap.apWeek = [100, 100, 100, 100]; M.weekEnd(cap); }
    assert.equal(cap.towns[BODY].pool.t1, D.C.POOL_CAP.t1);
});

test('набег Лени: без теней не ходит; с тенями отбирает ближайший к логову занятый узел, но не город и не узел с героем', () => {
    const own = (s, ids) => { ids.forEach((i) => { s.own = s.own.slice(0, i) + '1' + s.own.slice(i + 1); }); };
    const calm = fresh(); own(calm, [7, 6]);
    assert.equal(M.weekEnd(calm).raid, null);
    const s = fresh(); own(s, [7, 6, 2]); s.fac.sh = [3, 3, 3, 3, 3, 3, 3];
    const w = M.weekEnd(s);
    assert.ok(w.raid); assert.equal(w.raid.node, 7, 'форт ближе всех к логову'); assert.equal(w.raid.win, true);
    assert.equal(s.own.charAt(7), '0'); D.TOWNS.forEach((t) => assert.equal(s.own.charAt(t), '1', 'город цел'));
    const g = fresh(); own(g, [7, 6]); g.fac.sh = [3, 3, 3, 3, 3, 3, 3]; g.heroes[BODY].node = 7;
    assert.equal(M.weekEnd(g).raid.node, 6, 'узел, где стоит герой, не трогают');
});

test('набег отбивается залом Духа при умеренных тенях', () => {
    const s = fresh(); s.own = s.own.slice(0, 7) + '1' + s.own.slice(8); s.towns[SPIRIT].hall = 3; s.fac.sh = [1, 1, 0, 1, 0, 0, 0];
    const w = M.weekEnd(s);
    assert.equal(w.raid.win, false); assert.equal(s.own.charAt(7), '1');
});

test('состояние: JSON-раундтрип и хеш стабильны; размер ≤ 4 КБ после месяца игры', () => {
    const s = fresh();
    for (let i = 0; i < 30; i++) { D.SPHERES.forEach((sp) => M.applyDeed(s, deed(sp, 'B'))); M.dayEnd(s, '2026-11-' + String(i + 1).padStart(2, '0'), { silent: 1 }); if (i % 7 === 6) M.weekEnd(s); }
    const j = JSON.stringify(s);
    assert.equal(M.stateHash(JSON.parse(j)), M.stateHash(s));
    assert.ok(j.length <= 4096, 'размер ' + j.length);
    assert.deepEqual(clone(s), s);
});

test('лог ограничен LOG_MAX и укорачивает длинные строки', () => {
    const s = fresh();
    for (let i = 0; i < 20; i++) M.pushLog(s, 'x'.repeat(200));
    assert.equal(s.log.length, D.C.LOG_MAX);
    assert.ok(s.log.every((e) => e.t.length <= 90));
});

test('туман: видны клетки вокруг героев и своих городов; взятие узла открывает соседей', () => {
    const s = fresh();
    D.TOWNS.forEach((t) => assert.equal(s.seen.charAt(t), '1'));
    assert.equal(s.seen.charAt(D.LAIR), '0', 'логово скрыто');
    s.heroes[BODY].node = 7; M.markSeen(s);
    assert.equal(s.seen.charAt(D.LAIR), '1');
});
