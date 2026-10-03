'use strict';
// Кампания 3.0, аудит 2026-10-03 — ИИ фракций (js/campaign3/c3-model.js, factionTurn): приоритеты хода по плану §3
// (1 ответить на угрозу → 2 атаковать слабейший соседний узел игрока при сила/оборона > 1.2 → 3 занять нейтральный →
// 4 укрепиться) и особенности фракций: Лень — шахты Стали, Рассеянность — самая запущенная сфера + туман,
// Уныние — Монастырь. Отчуждения в плане нет — без особенности. Сид = день + фракция (детерминизм C7).
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/campaign3/c3-data.js');
const M = require('../js/campaign3/c3-model.js');

const fresh = () => M.newState('2026-10-05');
const own = (s, ids, ch) => { ids.forEach((i) => { s.own = s.own.slice(0, i) + (ch || '1') + s.own.slice(i + 1); }); };
const shadowsOf = (s, f, v) => { s.fac[f].sh = (Array.isArray(v) ? v : [v, v, v, v, v, v, v]); };
const SLOTH = 0, DISTRACT = 1, GLOOM = 2, ESTRANGE = 3;

test('приоритет 1: игрок взял узел фракции на этой неделе — контратака возвращает его (строка в журнале)', () => {
    const s = fresh();
    own(s, [5], M.facCode(SLOTH)); s.gar[5] = D.C.FAC_NODE_GAR; shadowsOf(s, SLOTH, 1); // сила 92 против 40
    s.heroes[0].node = 3; s.ap[0] = 6; s.heroes[0].army = { t1: 400, t3: 0, t5: 0 };
    assert.equal(M.engage(s, 0, 5).win, true);
    assert.deepEqual(s.fac[SLOTH].lost, [5], 'взятый узел запомнен для контратаки');
    M.travel(s, 0, 3); // герой ушёл с отбитого узла
    const ev = M.weekEnd(s).events;
    assert.equal(ev.length, 1); assert.equal(ev[0].kind, 'take'); assert.equal(ev[0].node, 5);
    assert.equal(s.own.charAt(5), M.facCode(SLOTH)); assert.equal(s.gar[5], D.C.FAC_NODE_GAR);
    assert.ok(/возвращает «Топь»/.test(ev[0].text), 'действие объясняется строкой: ' + ev[0].text);
    assert.ok(s.log.some((l) => /возвращает «Топь»/.test(l.t)), 'строка попала в журнал');
    assert.deepEqual(s.fac[SLOTH].lost, [], 'список потерь чистится в конце недели');
});

test('герой, стоящий на отбитом узле, защищает его от контратаки — фракция усиливает оплот', () => {
    const s = fresh();
    own(s, [5], M.facCode(SLOTH)); s.gar[5] = D.C.FAC_NODE_GAR; shadowsOf(s, SLOTH, 1);
    s.heroes[0].node = 3; s.ap[0] = 6; s.heroes[0].army = { t1: 400, t3: 0, t5: 0 };
    M.engage(s, 0, 5); // герой взял узел и остался на нём
    const ev = M.weekEnd(s).events;
    assert.equal(s.own.charAt(5), '1', 'узел под героем не отбит');
    assert.ok(ev.every((e) => e.node !== 5 || e.kind !== 'take'));
    assert.equal(ev[0].kind, 'fortify'); assert.equal(ev[0].node, D.FACTIONS[SLOTH].bastion);
    assert.equal(s.gar[D.FACTIONS[SLOTH].bastion], D.NODES[7].gar + D.C.FAC_FORT_GROW);
});

test('приоритет 4: герой рядом с владениями и целей нет — усиливается ближайший к угрозе узел, а не оплот', () => {
    const s = fresh();
    own(s, [5], M.facCode(SLOTH)); s.gar[5] = D.C.FAC_NODE_GAR; shadowsOf(s, SLOTH, 2);
    own(s, [3, 6]); s.heroes[0].node = 3; s.heroes[1].node = 6; // герои заперли Лень: атаковать и занимать нечего
    const ev = M.weekEnd(s).events;
    assert.equal(ev.length, 1); assert.equal(ev[0].kind, 'fortify'); assert.equal(ev[0].node, 5, 'усилен ближайший к угрозе узел');
    assert.equal(s.gar[5], D.C.FAC_NODE_GAR + D.C.FAC_FORT_GROW);
    assert.ok(/отвечает на угрозу/.test(ev[0].text));
});

test('приоритет 2: атака слабейшего соседнего узла игрока (узел 40 — раньше города 80); натиск ≤ 1.2 отбит и тратит ход', () => {
    const s = fresh();
    own(s, [25], M.facCode(ESTRANGE)); s.gar[25] = D.C.FAC_NODE_GAR; shadowsOf(s, ESTRANGE, 2); // сила 113
    own(s, [26, 27]); s.heroes[3].node = 9; // герой Связей увёл угрозу от своих владений
    const ev = M.weekEnd(s).events;
    assert.equal(ev[0].kind, 'take'); assert.ok([26, 27].includes(ev[0].node), 'слабейшие — по 40, город 80 не выбран');
    assert.equal(s.own.charAt(24), '1', 'город не атакован: он не слабейший');
    // слабый натиск (сила 52) об узлы игрока с залом Духа (оборона 100) отбивается — нейтральный сосед не занимается
    const w = fresh();
    own(w, [25], M.facCode(ESTRANGE)); w.gar[25] = D.C.FAC_NODE_GAR; shadowsOf(w, ESTRANGE, [1, 0, 0, 0, 0, 0, 0]);
    own(w, [26, 27]); w.heroes[3].node = 9; w.towns[2].hall = 3;
    const ev2 = M.weekEnd(w).events;
    assert.equal(ev2.length, 1); assert.equal(ev2[0].kind, 'repelled');
    assert.equal(w.own.charAt(26), '1'); assert.equal(w.own.charAt(29), '0', 'нейтральный лагерь не занят — ход потрачен на натиск');
});

test('приоритет 3: без соседних узлов игрока фракция занимает слабейший нейтральный', () => {
    const s = fresh();
    own(s, [5], M.facCode(ESTRANGE)); s.gar[5] = D.C.FAC_NODE_GAR; shadowsOf(s, ESTRANGE, 2);
    const ev = M.weekEnd(s).events;
    assert.equal(ev[0].kind, 'take'); assert.equal(ev[0].node, 3, 'дорога (0) слабее тайника (25) и оплота Лени');
    assert.equal(s.own.charAt(3), M.facCode(ESTRANGE)); assert.equal(s.gar[3], D.C.FAC_NODE_GAR);
    assert.equal(s.own.charAt(6), '0');
});

test('приоритет 4: нечего атаковать и занимать — рост гарнизона оплота; усиление узла ограничено потолком', () => {
    const s = fresh();
    own(s, [5], M.facCode(SLOTH)); shadowsOf(s, SLOTH, 1);
    own(s, [3, 6]); s.heroes[0].node = 3; s.heroes[1].node = 6; // герои заперли Лень со всех сторон
    s.gar[5] = 2 * D.C.FAC_NODE_GAR; // ближайший к угрозе узел уже укреплён до потолка
    const ev = M.weekEnd(s).events;
    assert.equal(ev.length, 1); assert.equal(ev[0].kind, 'fortify'); assert.equal(ev[0].node, D.FACTIONS[SLOTH].bastion);
    assert.equal(s.gar[D.FACTIONS[SLOTH].bastion], D.NODES[7].gar + D.C.FAC_FORT_GROW, 'оплот растёт');
    assert.equal(s.gar[5], 2 * D.C.FAC_NODE_GAR, 'потолок усиления узла — двойной гарнизон');
});

test('особенность Лени: среди нейтралов первым делом берёт шахту Стали, а не слабейшего соседа', () => {
    const s = fresh();
    own(s, [0, 1], M.facCode(SLOTH)); shadowsOf(s, SLOTH, 1); // соседи — шахта Стали (15) и обелиск (0)
    s.heroes[0].node = 9; // герой ушёл из захваченного города — угрозы нет
    const ev = M.weekEnd(s).events;
    assert.equal(ev[0].kind, 'take'); assert.equal(ev[0].node, 2, 'слабейший — обелиск, но Лень тянется к стали');
    assert.equal(s.own.charAt(2), M.facCode(SLOTH)); assert.equal(s.own.charAt(3), '0');
});

test('особенность Лени: шахту Стали, взятую игроком, возвращает в приоритете среди равных', () => {
    const s = fresh();
    own(s, [1], M.facCode(SLOTH)); shadowsOf(s, SLOTH, 2);
    own(s, [2, 3]); s.heroes[0].node = 9; // город 0 и узлы 2/3 — игрока; шахта и обелиск равны (по 40)
    const ev = M.weekEnd(s).events;
    assert.equal(ev[0].node, 2, 'при равной обороне выбрана шахта Стали');
    assert.equal(s.own.charAt(2), M.facCode(SLOTH)); assert.equal(s.own.charAt(0), '1');
});

test('особенность Уныния: среди узлов игрока первым осаждает Монастырь, а не слабейших соседей', () => {
    const s = fresh();
    own(s, [17], M.facCode(GLOOM)); s.gar[17] = D.C.FAC_NODE_GAR; shadowsOf(s, GLOOM, 2); // сила 113 против 80
    own(s, [18, 19]); s.heroes[2].node = 25; // герой Духа ушёл из Монастыря
    const ev = M.weekEnd(s).events;
    assert.equal(ev[0].kind, 'siege'); assert.equal(ev[0].node, 16, 'Монастырь (80) выбран раньше узлов по 40');
    assert.equal(s.sg[2], 1); assert.equal(s.own.charAt(16), '1');
});

test('особенность Рассеянности: бьёт по узлу самой запущенной сферы (меньше всех дел за неделю)', () => {
    const s = fresh();
    own(s, [12], M.facCode(DISTRACT)); s.gar[12] = D.C.FAC_NODE_GAR; shadowsOf(s, DISTRACT, 2);
    own(s, [4, 11]); s.apWeek = [0, 9, 9, 9]; // неделя без дел Тела — удар по региону Тела
    const ev = M.weekEnd(s).events;
    assert.equal(ev[0].kind, 'take'); assert.equal(ev[0].node, 4, 'застава Тела вместо равной ей дороги Разума (узел 11)');
    assert.equal(s.own.charAt(11), '1');
    assert.deepEqual(s.apWeek, [0, 0, 0, 0], 'дела недели обнулены ходом');
});

test('детерминизм: сид = день + фракция — равные кандидаты развязываются одинаково (C7)', () => {
    const mk = () => { const s = fresh(); own(s, [5], M.facCode(SLOTH)); own(s, [3, 6]); shadowsOf(s, SLOTH, 2); return s; };
    const a = mk(), b = mk();
    const ea = M.weekEnd(a).events, eb = M.weekEnd(b).events;
    assert.ok([3, 6].includes(ea[0].node), 'равные узлы игрока (по 40) — цель одна из них');
    assert.equal(ea[0].node, eb[0].node);
    assert.equal(M.stateHash(a), M.stateHash(b));
    const c = mk(); c.day = '2026-10-12'; // другой день — другой сид (выбор может измениться, но он воспроизводим)
    M.weekEnd(c);
    assert.equal(M.stateHash(c), M.stateHash((() => { const d = mk(); d.day = '2026-10-12'; M.weekEnd(d); return d; })()));
});

test('состояние: lost переживает санитизацию (контратака не теряется при синхронизации)', () => {
    const SG = require('../js/state-guards.js');
    const s = fresh();
    s.fac[ESTRANGE].lost = [25, 26, 25, 99, -1];
    const o = SG.sanitizeC3(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(o.fac[ESTRANGE].lost, [25, 26, 32, 0], 'дубли убраны; вне диапазона — клампится, как весь санитайзер');
    const clean = SG.sanitizeC3(JSON.parse(JSON.stringify(fresh())));
    assert.deepEqual(clean.fac[0].lost, [], 'байт-стабильный раундтрип пустого списка');
});
