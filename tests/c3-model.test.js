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

test('цитадель: победа завершает карту; оборона растёт с тенями ВСЕХ фракций до потолка; Монастырь смягчает рост', () => {
    const s = fresh();
    assert.equal(M.nodeDefense(s, D.LAIR), 1400);
    s.fac.forEach((f) => { f.sh = [10, 10, 10, 10, 10, 10, 10]; });
    assert.equal(M.lairMult(s), D.C.SHADOW_CAP);
    assert.equal(M.nodeDefense(s, D.LAIR), 3500);
    const w = fresh(); w.fac.forEach((f) => { f.sh = [1, 1, 1, 1, 1, 1, 1]; });
    const m0 = M.lairMult(w); w.towns[SPIRIT].hall = 3;
    assert.ok(M.lairMult(w) < m0, 'зал Духа снижает множитель');
    const win = fresh(); win.heroes[BODY].node = 7; win.ap[BODY] = 5; win.heroes[BODY].army = { t1: 2000, t3: 0, t5: 0 };
    win.own = win.own.slice(0, 7) + '1' + win.own.slice(8);
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

// ---------- Ф3: фракции пороков ----------
const own = (s, ids, ch) => { ids.forEach((i) => { s.own = s.own.slice(0, i) + (ch || '1') + s.own.slice(i + 1); }); };
const shadowsOf = (s, f, v) => { s.fac[f].sh = [v, v, v, v, v, v, v]; };
const FAC_SLOTH = 0, FAC_DISTRACT = 1, FAC_GLOOM = 2, FAC_ESTRANGE = 3;

test('данные: по фракции на сферу; оплот — форт региона у центра; в начале фракции владеют только оплотами', () => {
    assert.equal(D.FACTIONS.length, 4);
    D.FACTIONS.forEach((f, i) => { assert.equal(f.sphere, D.SPHERES[i]); assert.equal(D.NODES[f.bastion].type, 'bastion'); assert.ok(M.ADJ[f.bastion].includes(D.LAIR)); });
    const s = fresh();
    D.FACTIONS.forEach((f, i) => { assert.equal(s.own.charAt(f.bastion), M.facCode(i)); assert.equal(M.facOf(s.own.charAt(f.bastion)), i); });
    assert.equal(M.facOf('0'), -1); assert.equal(M.facOf('1'), -1); assert.equal(M.facOf('6'), -1);
});

test('тени по сферам: срыв сферы S питает ТОЛЬКО фракцию сферы S; лазарет обнуляет тени', () => {
    const s = fresh();
    M.dayEnd(s, '2026-10-06', { silent: [2, 0, 1, 0], honest: [0, 0, 2, 0], overdue: [0, 1, 0, 0] });
    assert.deepEqual(s.fac.map((f) => f.sh[f.sh.length - 1]), [2, 1, 2, 0]);
    assert.equal(M.shadowSum(s), 5);
    const lz = fresh(); assert.equal(M.lazaretStart(lz).ok, true);
    M.dayEnd(lz, '2026-10-06', { silent: [3, 3, 3, 3] });
    assert.equal(M.shadowSum(lz), 0, 'в лазарете срывы не копятся'); assert.equal(lz.lz.left, D.C.LAZARET_DAYS - 1);
});

test('фракция без теней не ходит и отступает; с тенями занимает соседний узел; оплот защищён силой фракции', () => {
    const calm = fresh();
    assert.deepEqual(M.weekEnd(calm).events, []);
    const s = fresh(); shadowsOf(s, FAC_SLOTH, 1);
    const ev = M.weekEnd(s).events;
    assert.equal(ev.length, 1); assert.equal(ev[0].kind, 'take'); assert.equal(s.own.charAt(5), M.facCode(FAC_SLOTH), 'Лень идёт по топи от своего оплота');
    assert.equal(s.gar[5], D.C.FAC_NODE_GAR);
    // другие фракции без теней стоят
    assert.equal(s.own.charAt(13), '0'); assert.equal(s.own.charAt(21), '0');
    // тени кончились — отступает
    s.fac[FAC_SLOTH].sh = [0, 0, 0, 0, 0, 0, 0];
    const back = M.weekEnd(s).events;
    assert.equal(back[0].kind, 'retreat'); assert.equal(s.own.charAt(5), '0');
    s.fac[FAC_SLOTH].sh[0] = 3; assert.ok(M.facMult(s, FAC_SLOTH) > 1);
    assert.equal(M.nodeDefense(s, 7), Math.round(120 * M.facMult(s, FAC_SLOTH)));
});

test('приоритеты фракции: город игрока → узел игрока (в её регионе раньше) → нейтрал', () => {
    const s = fresh(); shadowsOf(s, FAC_SLOTH, 2); own(s, [5], M.facCode(FAC_SLOTH)); // Лень стоит на топи
    own(s, [3, 6]); s.gar[3] = 0; // узлы игрока 3 (соседний с топью) и 6 (тайник, сосед топи)
    const ev = M.weekEnd(s).events;
    assert.equal(ev[0].kind, 'take');
    assert.ok([3, 6].includes(ev[0].node), 'берёт узел игрока, а не нейтральный оплот/цитадель');
    assert.equal(s.own.charAt(ev[0].node), M.facCode(FAC_SLOTH));
});

test('натиск отбивается обороной (зал Духа) и узел с героем не трогают', () => {
    const s = fresh(); own(s, [5], M.facCode(FAC_SLOTH)); own(s, [3]); shadowsOf(s, FAC_SLOTH, 0.5); // 3.5 тени: сила ≈ 91
    s.towns[SPIRIT].hall = 3;
    const w = M.weekEnd(s).events;
    assert.equal(w[0].kind, 'repelled'); assert.equal(s.own.charAt(3), '1');
    const g = fresh(); own(g, [5], M.facCode(FAC_SLOTH)); own(g, [3]); shadowsOf(g, FAC_SLOTH, 1); g.heroes[BODY].node = 3;
    const e2 = M.weekEnd(g).events;
    assert.notEqual(e2[0].node, 3, 'герой защищает свой узел');
});

test('город: осада два недельных хода, затем падение; последний город не падает; освобождение возвращает его', () => {
    const s = fresh(); shadowsOf(s, FAC_SLOTH, 3);
    own(s, [1], M.facCode(FAC_SLOTH)); own(s, [2, 3, 4, 5, 6], M.facCode(FAC_SLOTH)); // Лень стоит у города Тела (узлы вокруг заняты)
    s.heroes[BODY].node = 6; // герой ушёл из города (стоящий в городе герой не даёт его осадить)
    s.gar[1] = 40;
    const e1 = M.weekEnd(s).events;
    assert.equal(e1[0].kind, 'siege'); assert.equal(s.sg[BODY], 1); assert.equal(s.own.charAt(0), '1');
    const e2 = M.weekEnd(s).events;
    assert.equal(e2[0].kind, 'fall'); assert.equal(s.own.charAt(0), M.facCode(FAC_SLOTH)); assert.equal(s.gar[0], D.C.FAC_TOWN_GAR);
    assert.equal(M.townsOwned(s), 3);
    // потерянный город: нет найма, нет эффекта зала, нет дохода
    s.towns[BODY].hall = 3; assert.equal(M.hall(s, 'body'), 0);
    s.heroes[BODY].node = 0; s.res.g = 100; assert.equal(M.hire(s, BODY, 't1', 1).reason, 'away');
    const g0 = s.res.g; M.dayEnd(s, '2026-10-12', {}); assert.equal(s.res.g, g0 + D.C.GOLD_TOWN_DAY * 3);
    // освобождение
    s.heroes[BODY].node = 1; s.ap[BODY] = 5; s.heroes[BODY].army = { t1: 400, t3: 0, t5: 0 };
    const lib = M.engage(s, BODY, 0);
    assert.equal(lib.win, true); assert.equal(s.own.charAt(0), '1'); assert.equal(M.townsOwned(s), 4);
    assert.ok(s.log[s.log.length - 1].t.includes('освободил город'));
});

test('последний город не падает даже при осаде любой силы', () => {
    const s = fresh(); shadowsOf(s, FAC_SLOTH, 50); own(s, [8, 16, 24], '0'); // остался один город (Тело)
    own(s, [1, 2, 3, 4, 5, 6], M.facCode(FAC_SLOTH)); s.gar[1] = 40;
    for (let i = 0; i < 5; i++) M.weekEnd(s);
    assert.equal(s.own.charAt(0), '1'); assert.equal(M.townsOwned(s), 1);
});

test('резиновая лента: у игрока < 30% карты — сила фракций ×0.75', () => {
    const s = fresh(); shadowsOf(s, FAC_SLOTH, 1);
    assert.equal(M.playerShare(s) < D.C.RUBBER_SHARE, true, 'в начале у игрока 4 города из 33');
    const weak = M.facPower(s, FAC_SLOTH);
    own(s, [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13]); // >30%
    assert.ok(M.playerShare(s) >= D.C.RUBBER_SHARE);
    assert.ok(M.facPower(s, FAC_SLOTH) > weak);
    assert.equal(M.facPower(s, FAC_SLOTH), Math.round(D.C.FAC_BASE * M.facMult(s, FAC_SLOTH)));
});

test('Рассеянность наводит туман вокруг взятого узла', () => {
    const s = fresh(); shadowsOf(s, FAC_DISTRACT, 1); own(s, [13], M.facCode(FAC_DISTRACT));
    s.seen = '1'.repeat(33);
    M.weekEnd(s);
    assert.ok(s.seen.includes('0'), 'часть карты скрылась из виду');
    assert.equal(s.seen.charAt(0), '1', 'город игрока остаётся видимым');
});

test('оплот взят — фракция разбита: её узлы нейтральны, она больше не ходит', () => {
    const s = fresh(); own(s, [5, 3], M.facCode(FAC_SLOTH));
    s.heroes[BODY].node = 5; s.ap[BODY] = 6; s.heroes[BODY].army = { t1: 400, t3: 0, t5: 0 };
    const r = M.engage(s, BODY, 7);
    assert.equal(r.win, true); assert.equal(s.fac[FAC_SLOTH].dead, 1);
    assert.equal(s.own.charAt(7), '1'); assert.equal(s.own.charAt(3), '0', 'узлы фракции стали нейтральными');
    shadowsOf(s, FAC_SLOTH, 5);
    assert.deepEqual(M.weekEnd(s).events, [], 'мёртвая фракция не ходит');
    assert.equal(M.declareTruce(s, FAC_SLOTH).reason, 'dead');
});

test('перемирие: соблюдён обет — фракция пропускает ход и отступает; нарушен — бьёт на 50% сильнее', () => {
    const kept = fresh(); own(kept, [5], M.facCode(FAC_SLOTH));
    assert.equal(M.declareTruce(kept, FAC_SLOTH).ok, true);
    assert.equal(M.declareTruce(kept, FAC_SLOTH).reason, 'already'); assert.equal(M.declareTruce(kept, FAC_GLOOM).reason, 'one');
    const ev = M.weekEnd(kept).events;
    assert.equal(ev[0].kind, 'retreat'); assert.equal(kept.own.charAt(5), '0'); assert.equal(kept.fac[FAC_SLOTH].truce, 0, 'обет снят в конце недели');
    const broken = fresh(); own(broken, [5], M.facCode(FAC_SLOTH)); shadowsOf(broken, FAC_SLOTH, 0.5);
    M.declareTruce(broken, FAC_SLOTH);
    assert.ok(M.facPower(broken, FAC_SLOTH, true) >= M.facPower(broken, FAC_SLOTH, false) * (D.C.TRUCE_BREAK_MULT - 0.02));
    assert.equal(M.weekEnd(broken).events[0].kind, 'take', 'при нарушенном обете фракция ходит');
    assert.equal(M.revokeTruce(kept, FAC_SLOTH).reason, 'none');
});

test('лазарет: запас 7 дней за сезон; в лазарете фракции не ходят и перемирие недоступно; новый сезон возвращает запас', () => {
    const s = fresh(); shadowsOf(s, FAC_SLOTH, 3);
    assert.equal(M.lazaretStart(s).ok, true); assert.equal(M.lazaretStart(s).reason, 'on');
    assert.equal(M.declareTruce(s, FAC_GLOOM).reason, 'lazaret');
    assert.deepEqual(M.weekEnd(s).events, []);
    for (let i = 0; i < 7; i++) M.dayEnd(s, '2026-10-' + (6 + i), {});
    assert.equal(s.lz.on, 0); assert.equal(s.lz.left, 0);
    assert.equal(M.lazaretStart(s).reason, 'none');
    for (let w = 0; w < D.C.SEASON_WEEKS; w++) M.weekEnd(s);
    assert.equal(s.lz.left, D.C.LAZARET_DAYS, 'новый сезон — новый запас');
    const e = fresh(); M.lazaretStart(e); assert.equal(M.lazaretEnd(e).ok, true); assert.equal(M.lazaretEnd(e).reason, 'off');
});

test('C4 с фракциями: ни ход фракций, ни осада, ни лазарет не прибавляют ОД', () => {
    const s = fresh();
    for (let i = 0; i < 40; i++) {
        D.FACTIONS.forEach((f, k) => { s.fac[k].sh = [3, 3, 3, 3, 3, 3, 3]; });
        M.dayEnd(s, '2026-12-' + String(i % 28 + 1).padStart(2, '0'), { silent: [1, 1, 1, 1] });
        if (i % 7 === 6) M.weekEnd(s);
        assert.deepEqual(s.ap, [0, 0, 0, 0]);
    }
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

// ---------- Ф4: тактики, навыки, святилища ----------
test('тактики: сила от ранга карточки C 5% … SSS 25%, монотонна; предложение — 3 разных вида, детерминировано', () => {
    assert.equal(M.tacticPower('C'), D.C.TACTIC_MIN); assert.equal(M.tacticPower('SSS'), D.C.TACTIC_MAX);
    let prev = 0; D.RANKS.forEach((r) => { const p = M.tacticPower(r); assert.ok(p > prev || r === 'C'); prev = p; });
    const s = fresh();
    const a = M.offerTactics(s, BODY, ['SSS', 'A', 'C']), b = M.offerTactics(s, BODY, ['SSS', 'A', 'C']);
    assert.deepEqual(a, b);
    assert.equal(new Set(a.map((t) => t.kind)).size, 3);
    assert.deepEqual(a.map((t) => t.rank), ['SSS', 'A', 'C']);
    assert.equal(a[0].p, 0.25);
    const few = M.offerTactics(s, BODY, ['B']);
    assert.equal(few.length, 3); assert.equal(few[1].rank, null); assert.equal(few[1].p, D.C.TACTIC_MIN, 'без карточки — базовая сила');
    assert.notDeepEqual(M.offerTactics(Object.assign(fresh(), { bc: 7 }), BODY, ['B', 'B', 'B']).map((t) => t.kind), M.offerTactics(fresh(), BODY, ['B', 'B', 'B']).map((t) => t.kind), 'после боя набор перетасован');
});

test('тактика меняет исход: Натиск поднимает атаку, Хитрость снижает оборону, Строй режет потери', () => {
    const mk = () => { const s = fresh(); s.heroes[BODY].node = 3; s.ap[BODY] = 5; s.heroes[BODY].army = { t1: 18, t3: 0, t5: 0 }; return s; }; // 36 против 40 (застава 4)
    assert.equal(M.forecast(mk(), BODY, 4).win, false);
    assert.equal(M.forecast(mk(), BODY, 4, { kind: 'rush', p: 0.25 }).win, true);
    assert.equal(M.forecast(mk(), BODY, 4, { kind: 'cunning', p: 0.25 }).win, true);
    const strong = () => { const s = mk(); s.heroes[BODY].army = { t1: 60, t3: 0, t5: 0 }; return s; };
    const plain = M.forecast(strong(), BODY, 4).attritionPct, form = M.forecast(strong(), BODY, 4, { kind: 'formation', p: 0.2 }).attritionPct;
    assert.ok(form < plain, 'Строй снижает потери');
    const r = M.engage(mk(), BODY, 4, { kind: 'rush', p: 0.25 });
    assert.equal(r.win, true); assert.equal(r.tactic.kind, 'rush');
});

test('тактика не доверяется клиенту: неизвестный вид и нулевая сила игнорируются, сила режется потолком', () => {
    const s = fresh(); s.heroes[BODY].node = 3; s.ap[BODY] = 5;
    const base = M.forecast(s, BODY, 4);
    assert.equal(M.forecast(s, BODY, 4, { kind: 'hack', p: 5 }).atk, base.atk);
    assert.equal(M.forecast(s, BODY, 4, { kind: 'rush', p: 0 }).atk, base.atk);
    assert.equal(M.forecast(s, BODY, 4, { kind: 'rush', p: -1 }).atk, base.atk);
    const huge = M.forecast(s, BODY, 4, { kind: 'rush', p: 99 }).atk;
    assert.ok(huge <= Math.round(base.atk * (1 + D.C.TACTIC_MAX + D.C.SKILL_STEP * D.C.SKILL_MAX)) + 1, 'сила ограничена');
});

test('серия дел сферы: растёт за дни с ОД сферы, обнуляется пропуском', () => {
    const s = fresh();
    for (let i = 0; i < 3; i++) { M.applyDeed(s, deed('body')); M.applyDeed(s, deed('mind')); M.dayEnd(s, '2026-10-0' + (6 + i), {}); }
    assert.deepEqual(s.stk, [3, 3, 0, 0]);
    M.applyDeed(s, deed('body')); M.dayEnd(s, '2026-10-09', {});
    assert.deepEqual(s.stk, [4, 0, 0, 0], 'Разум пропустил день — серия обнулена');
});

test('святилище: при серии ≥ 3 дней взятие даёт навык героя (до 3 ур.), без серии — только добыча', () => {
    const mk = (stk) => { const s = fresh(); s.stk[BODY] = stk; s.heroes[BODY].node = 5; s.ap[BODY] = 5; s.heroes[BODY].army = { t1: 400, t3: 0, t5: 0 }; return s; };
    const no = mk(2); M.engage(no, BODY, 6); assert.equal(no.heroes[BODY].sk, 0); assert.equal(no.res.st, 4);
    const yes = mk(3); M.engage(yes, BODY, 6); assert.equal(yes.heroes[BODY].sk, 1);
    assert.ok(yes.log.some((l) => l.t.includes('постиг «Мастер натиска» 1/3')));
    const cap = mk(9); cap.heroes[BODY].sk = 3; M.engage(cap, BODY, 6); assert.equal(cap.heroes[BODY].sk, 3, 'потолок 3');
});

test('навык: +5% к тактике своего вида за уровень; Дипломатия — +25% золота добычи за уровень', () => {
    const s = fresh(); s.heroes[BODY].sk = 2; s.heroes[MIND].sk = 3;
    assert.equal(M.skillBonus(s, BODY, 'rush'), 0.1); assert.equal(M.skillBonus(s, BODY, 'cunning'), 0);
    assert.equal(M.skillBonus(s, MIND, 'cunning'), 0.15); assert.equal(M.skillBonus(s, SPIRIT, 'formation'), 0);
    const o = M.offerTactics(s, BODY, ['C', 'C', 'C']).find((t) => t.kind === 'rush');
    assert.equal(o.p, 0.15, 'база 5% + 10% навыка');
    const mkTies = (sk) => { const t = fresh(); t.heroes[TIES].sk = sk; t.heroes[TIES].node = 29; t.ap[TIES] = 5; t.heroes[TIES].army = { t1: 400, t3: 0, t5: 0 }; return t; };
    const base = mkTies(0); M.engage(base, TIES, 30); const rich = mkTies(2); M.engage(rich, TIES, 30);
    assert.ok(rich.res.g > base.res.g, 'Дипломатия увеличивает добычу');
});

test('C11: выбор тактики решает 15–30% пограничных боёв (оборона ±20% от силы армии, карточки ранга B)', () => {
    let flips = 0, total = 0;
    for (let i = 0; i <= 80; i++) {
        const ratio = 0.8 + 0.4 * i / 80, s = fresh();
        s.heroes[BODY].node = 3; s.heroes[BODY].army = { t1: 1000, t3: 0, t5: 0 }; s.gar[4] = Math.round(2000 / ratio);
        const none = M.forecast(s, BODY, 4).win;
        const best = M.offerTactics(s, BODY, ['B', 'B', 'B']).some((t) => M.forecast(s, BODY, 4, t).win);
        total++; if (best && !none) flips++;
    }
    const share = flips / total;
    assert.ok(share >= 0.15 && share <= 0.30, 'доля боёв, где тактика приносит победу: ' + share.toFixed(2));
});
