'use strict';
// Кампания 3.0, Ф1 — юнит-тесты чистой модели среза (js/campaign3/*). Дизайн: docs/plan/CAMPAIGN-3.0.md.
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/campaign3/c3-data.js');
const M = require('../js/campaign3/c3-model.js');
const SD = require('../js/stronghold-data.js');

const fresh = () => M.newState('2026-10-05');
const clone = (s) => JSON.parse(JSON.stringify(s));
const body = (rank) => ({ kind: 'habit', sphere: 'body', rank: rank || 'C' });

test('данные: единицы среза совпадают по силе с UNIT_TIERS, граф связный и симметричный', () => {
    D.UNIT_KEYS.forEach((k) => assert.equal(D.UNITS[k].power, SD.UNIT_TIERS[k].power, 'сила ' + k));
    D.NODES.forEach((n, i) => { assert.equal(n.id, i); assert.ok(M.shortestPath(0, i), 'узел ' + i + ' достижим'); });
    assert.equal(D.NODES[D.TOWN].type, 'town');
    assert.equal(D.NODES[D.LAIR].type, 'lair');
    assert.equal(D.NODES[5].cost, 2, 'болото стоит 2 ОД');
});

test('ОД: бонус ранга C/B 0, A/S 1, SS/SSS 2; задача 2', () => {
    ['C', 'CC', 'CCC', 'B', 'BB', 'BBB'].forEach((r) => assert.equal(M.rankBonus(r), 0, r));
    ['A', 'AA', 'AAA', 'S'].forEach((r) => assert.equal(M.rankBonus(r), 1, r));
    ['SS', 'SSS'].forEach((r) => assert.equal(M.rankBonus(r), 2, r));
    assert.equal(M.deedAp(body('SSS')), 3);
    assert.equal(M.deedAp({ kind: 'task' }), 2);
});

test('applyDeed: сфера не-Тело ОД не даёт; Тело даёт ОД и сталь', () => {
    const s = fresh();
    const none = M.applyDeed(s, { kind: 'habit', sphere: 'mind', rank: 'SSS' });
    assert.deepEqual([none.gained, none.reason, s.ap], [0, 'sphere', 0]);
    const r = M.applyDeed(s, body('A'));
    assert.equal(r.gained, 2); assert.equal(s.ap, 2); assert.equal(s.res.s, 1);
});

test('applyDeed: кап 6 ОД в сутки и 5 задач в сутки', () => {
    const s = fresh();
    for (let i = 0; i < 10; i++) M.applyDeed(s, body('SSS'));
    assert.equal(s.apDay, D.C.AP_CAP_DAY); assert.equal(s.ap, 6);
    const t = fresh();
    for (let i = 0; i < 9; i++) M.applyDeed(t, { kind: 'task' });
    assert.equal(t.tasksToday, D.C.TASK_CAP_DAY, 'задач учтено не больше капа');
    assert.equal(t.apDay, 6, 'и всё равно не больше капа ОД');
});

test('«Возвращение»: после ≥3 пустых дней первое дело ×2, второе — обычное', () => {
    const s = fresh();
    for (let i = 0; i < 3; i++) M.dayEnd(s, '2026-10-0' + (6 + i), {});
    assert.equal(s.idle, 3);
    assert.equal(M.applyDeed(s, body('C')).gained, 2);
    assert.equal(M.applyDeed(s, body('C')).gained, 1);
    M.dayEnd(s, '2026-10-09', {});
    assert.equal(s.idle, 0, 'день с делами обнуляет простой');
});

test('C4: ОД растут ТОЛЬКО от дел — ни день, ни неделя, ни ход, ни найм, ни бой их не прибавляют', () => {
    const s = fresh();
    s.ap = 0;
    const snap = () => s.ap;
    for (let i = 0; i < 30; i++) {
        M.dayEnd(s, '2026-11-' + String(i + 1).padStart(2, '0'), { silent: 2 });
        if (i % 7 === 6) M.weekEnd(s);
        M.travel(s, 8); M.hire(s, 't1', 1); M.buyForge(s);
        for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) M.engage(s, id);
        assert.equal(snap(), 0, 'ОД не появились сами (день ' + i + ')');
    }
    assert.equal(s.hero.node, D.TOWN, 'без ОД герой стоит в Кузне');
});

test('перенос: после dayEnd остаётся не больше AP_CARRY', () => {
    const s = fresh(); s.ap = 5;
    M.dayEnd(s, '2026-10-06', {});
    assert.equal(s.ap, D.C.AP_CARRY);
});

test('маршрут: болото дороже, путь до логова идёт через Заставу и Форт; стоп перед враждебным узлом', () => {
    const s = fresh();
    const r = M.route(s, 8);
    assert.deepEqual(r.steps, [1, 3]); assert.equal(r.battleNode, 4); assert.equal(r.total, 6);
    const sw = M.shortestPath(3, 6);
    assert.deepEqual(sw.path, [4, 6], 'через Заставу дешевле, чем через болото (2+1)');
    s.ap = 5;
    const t = M.travel(s, 8);
    assert.deepEqual(t.moved, [1, 3]); assert.equal(t.stopped, 'hostile'); assert.equal(s.hero.node, 3); assert.equal(s.ap, 3);
});

test('travel: без ОД герой не идёт дальше', () => {
    const s = fresh(); s.ap = 1;
    const t = M.travel(s, 3);
    assert.deepEqual(t.moved, [1]); assert.equal(t.stopped, 'ap'); assert.equal(s.hero.node, 1);
});

test('бой: детерминирован по (день, номер боя); победа забирает узел и добычу, поражение — потери и узел остаётся', () => {
    const mk = () => { const s = fresh(); s.hero.node = 3; s.ap = 5; s.hero.army = { t1: 8, t3: 4 }; return s; };
    const a = mk(), b = mk();
    const ra = M.engage(a, 4), rb = M.engage(b, 4);
    assert.deepEqual(ra, rb); assert.equal(M.stateHash(a), M.stateHash(b));
    assert.equal(ra.win, true); // 8×2 + 4×16 = 80 против 30
    assert.equal(a.own.charAt(4), '1'); assert.equal(a.hero.node, 4); assert.equal(a.res.g, D.C.START_GOLD + 20);
    assert.ok(a.hero.army.t1 < 8, 'победа не бесплатна');
    const weak = mk(); weak.hero.army = { t1: 8, t3: 0 };
    const rl = M.engage(weak, 4);
    assert.equal(rl.win, false);
    assert.equal(weak.own.charAt(4), '0'); assert.equal(weak.hero.node, 3);
    assert.ok(weak.hero.army.t1 >= 1, 'стопа не исчезает целиком');
});

test('бой: нельзя бить далёкий или мирный узел, нельзя без ОД', () => {
    const s = fresh(); s.ap = 3;
    assert.equal(M.engage(s, 4).reason, 'far');
    s.hero.node = 3;
    assert.equal(M.engage(s, 1).reason, 'peace');
    s.ap = 0;
    assert.equal(M.engage(s, 4).reason, 'ap');
});

test('логово: победа завершает срез; оборона растёт с тенями до потолка', () => {
    const s = fresh();
    assert.equal(M.nodeDefense(s, 8), 300);
    s.fac.sh = [10, 10, 10, 10, 10, 10, 10];
    assert.equal(M.shadowMult(s), D.C.SHADOW_CAP);
    assert.equal(M.nodeDefense(s, 8), 750);
    const w = fresh(); w.hero.node = 7; w.ap = 5; w.hero.army = { t1: 400, t3: 0 };
    const r = M.engage(w, 8);
    assert.equal(r.win, true); assert.equal(w.done, true); assert.equal(w.own.charAt(8), '1');
});

test('тени: окно 7 дней — старые срывы выветриваются; честный пропуск весит вдвое меньше молчаливого', () => {
    const s = fresh();
    M.dayEnd(s, '2026-10-06', { silent: 2, honest: 2, overdue: 1 });
    assert.equal(M.shadowSum(s), 2 + 1 + 1);
    for (let i = 0; i < 7; i++) M.dayEnd(s, '2026-10-' + (7 + i), {});
    assert.equal(M.shadowSum(s), 0, 'через 7 дней без срывов окно чисто');
});

test('найм: только в городе, в пределах пула и золота', () => {
    const s = fresh(); s.res.g = 100;
    assert.equal(M.hire(s, 't1', 5).ok, true);
    assert.equal(s.hero.army.t1, D.C.START_ARMY.t1 + 5); assert.equal(s.res.g, 90); assert.equal(s.town.pool.t1, D.C.START_POOL.t1 - 5);
    assert.equal(M.hire(s, 't1', 99).reason, 'pool');
    assert.equal(M.hire(s, 't3', 1).reason, 'pool', 'пул Лучников пуст в начале');
    s.town.pool.t3 = 3; s.res.g = 10;
    assert.equal(M.hire(s, 't3', 1).reason, 'gold');
    s.hero.node = 1;
    assert.equal(M.hire(s, 't1', 1).reason, 'away');
});

test('закалка: стоимость растёт, потолок 3 уровня, даёт атаку и оборону узлов', () => {
    const s = fresh(); s.res.s = 100;
    const p0 = M.armyPower(s), d0 = M.nodeDefense(s, 0);
    assert.equal(M.forgeCost(s), 5);
    assert.equal(M.buyForge(s).ok, true); assert.equal(M.forgeCost(s), 10);
    M.buyForge(s); M.buyForge(s);
    assert.equal(M.buyForge(s).reason, 'max');
    assert.ok(M.armyPower(s) > p0); assert.equal(M.nodeDefense(s, 0), d0 + 3 * D.C.FORGE_DEF);
});

test('неделя: прирост существ пропорционален делам недели (без дел — только нижний порог)', () => {
    const idle = fresh(); idle.town.pool = { t1: 0, t3: 0 };
    M.weekEnd(idle);
    const busy = fresh(); busy.town.pool = { t1: 0, t3: 0 }; busy.apWeek = 100;
    M.weekEnd(busy);
    assert.equal(busy.town.pool.t1, D.C.POOL_GROW.t1);
    assert.equal(idle.town.pool.t1, Math.floor(D.C.POOL_GROW.t1 * D.C.GROW_FLOOR));
    assert.equal(busy.apWeek, 0);
    const cap = fresh(); cap.apWeek = 100; for (let i = 0; i < 20; i++) { cap.apWeek = 100; M.weekEnd(cap); }
    assert.equal(cap.town.pool.t1, D.C.POOL_CAP.t1);
});

test('набег Лени: без теней не ходит; с тенями отбирает ближайший к логову занятый узел, город — никогда', () => {
    const calm = fresh(); calm.own = '1010101' + '02'; // заняты 2, 4, 6 (индексы 0..8)
    assert.equal(M.weekEnd(calm).raid, null);
    const s = fresh();
    s.own = '101010102'.slice(0, 9); // 0,2,4,6 игрока; 8 — Лень
    s.own = '1010101' + '02';
    s.fac.sh = [3, 3, 3, 3, 3, 3, 3];
    const w = M.weekEnd(s);
    assert.ok(w.raid, 'набег состоялся');
    assert.equal(w.raid.node, 6, 'ближайший к логову — Форт');
    assert.equal(w.raid.win, true);
    assert.equal(s.own.charAt(6), '0'); assert.equal(s.own.charAt(0), '1', 'город цел');
    const guarded = fresh(); guarded.own = '1010101' + '02'; guarded.fac.sh = [3, 3, 3, 3, 3, 3, 3]; guarded.town.forge = 3; guarded.hero.node = 6;
    const g = M.weekEnd(guarded);
    assert.equal(g.raid.node, 4, 'узел, где стоит герой, не трогают');
});

test('набег отбивается закалкой при умеренных тенях', () => {
    const s = fresh(); s.own = '1010101' + '02'; s.town.forge = 3; s.fac.sh = [1, 1, 0, 1, 0, 0, 0]; // 3 тени
    const w = M.weekEnd(s);
    assert.equal(w.raid.win, false);
    assert.equal(s.own.charAt(6), '1');
});

test('состояние: JSON-раундтрип и хеш стабильны; размер ≤ 2 КБ после месяца игры', () => {
    const s = fresh();
    for (let i = 0; i < 30; i++) { M.applyDeed(s, body('B')); M.dayEnd(s, '2026-11-' + String(i + 1).padStart(2, '0'), { silent: 1 }); if (i % 7 === 6) M.weekEnd(s); }
    const j = JSON.stringify(s);
    assert.equal(M.stateHash(JSON.parse(j)), M.stateHash(s));
    assert.ok(j.length <= 2048, 'размер ' + j.length);
    assert.deepEqual(clone(s), s);
});

test('лог ограничен LOG_MAX и укорачивает длинные строки', () => {
    const s = fresh();
    for (let i = 0; i < 20; i++) M.pushLog(s, 'x'.repeat(200));
    assert.equal(s.log.length, D.C.LOG_MAX);
    assert.ok(s.log.every((e) => e.t.length <= 90));
});
