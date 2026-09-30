const test = require('node:test');
const assert = require('node:assert');
// Campaign 2.0 C1: ветвящаяся карта — контракт каталога (branch/next) и tradeRoutesGraph.
const SM = require('../js/stronghold-model.js');
const DATA = require('../js/stronghold-data.js');
globalThis.StrongholdData = DATA; // catalog() модели
const SH = DATA.STRONGHOLDS;
const idxOf = (id) => SH.findIndex((s) => s.id === id);
const edgesFromCatalog = () => {
    const e = [];
    SH.forEach((s) => (s.next || []).forEach((to) => e.push([idxOf(s.id), idxOf(to)])));
    return e;
};
const flagsOf = (ids) => SH.map((s) => ids.includes(s.id));

test('каталог: у всех 20 твердынь branch из {safe,war,trade} и next-массив существующих id', () => {
    assert.equal(SH.length, 20);
    const seen = new Set();
    SH.forEach((s) => {
        assert.ok(!seen.has(s.id), 'id уникальны: ' + s.id);
        seen.add(s.id);
        assert.ok(['safe', 'war', 'trade'].includes(s.branch), s.id + '.branch = ' + s.branch);
        assert.ok(Array.isArray(s.next), s.id + '.next — массив');
        s.next.forEach((to) => assert.ok(seen.has(to) || SH.some((x) => x.id === to), s.id + '.next → неизвестный id ' + to));
    });
});

test('граф ацикличен: next ссылается только вперёд по каталогу (обратные рёбра/циклы запрещены)', () => {
    SH.forEach((s) => {
        const from = idxOf(s.id);
        s.next.forEach((to) => {
            const t = idxOf(to);
            assert.ok(t > from, 'ребро ' + s.id + '→' + to + ' идёт назад (индексы ' + from + '→' + t + ')');
        });
    });
});

test('next ссылается только на соседей: цель в пределах i+1..i+2', () => {
    SH.forEach((s) => {
        const from = idxOf(s.id);
        s.next.forEach((to) => {
            const delta = idxOf(to) - from;
            assert.ok(delta >= 1 && delta <= 2, s.id + '→' + to + ': скачок ' + delta + ' (допустимо 1–2)');
        });
    });
});

test('связность: из sh01 по next-рёбрам достижимы все 20 твердынь', () => {
    const reach = new Set(['sh01']);
    let grew = true;
    while (grew) {
        grew = false;
        SH.forEach((s) => {
            if (!reach.has(s.id)) return;
            s.next.forEach((to) => { if (!reach.has(to)) { reach.add(to); grew = true; } });
        });
    }
    assert.equal(reach.size, 20, 'недостижимы: ' + SH.filter((s) => !reach.has(s.id)).map((s) => s.id).join(','));
});

test('развилки только в пров. 2 и 4: next.length=2 ровно у sh07/sh17; пров. 1 и 3 линейны', () => {
    const forked = SH.filter((s) => s.next.length >= 2).map((s) => s.id);
    assert.deepEqual(forked.sort(), ['sh07', 'sh17']);
    [1, 3].forEach((p) => SH.filter((s) => s.prov === p).forEach((s) => assert.equal(s.next.length, 1, s.id + ' (пров. ' + p + ') должен быть линейным')));
});

test('ветки сходятся: у развилки оба пути ведут в один выход провинции; переходы провинций связаны', () => {
    // sh07 → {sh08, sh09}, обе ветки → sh10; sh17 → {sh18, sh19}, обе → sh20
    assert.deepEqual(SH[idxOf('sh07')].next.sort(), ['sh08', 'sh09']);
    assert.deepEqual(SH[idxOf('sh08')].next, ['sh10']);
    assert.deepEqual(SH[idxOf('sh09')].next, ['sh10']);
    assert.deepEqual(SH[idxOf('sh17')].next.sort(), ['sh18', 'sh19']);
    assert.deepEqual(SH[idxOf('sh18')].next, ['sh20']);
    assert.deepEqual(SH[idxOf('sh19')].next, ['sh20']);
    // выходы провинций ведут в первую твердыню следующей; sh20 — тупик кампании
    assert.deepEqual(SH[idxOf('sh05')].next, ['sh06']);
    assert.deepEqual(SH[idxOf('sh10')].next, ['sh11']);
    assert.deepEqual(SH[idxOf('sh15')].next, ['sh16']);
    assert.deepEqual(SH[idxOf('sh20')].next, []);
});

test('торговый характер развилок: узлы trade есть только в пров. 2 и 4', () => {
    SH.filter((s) => s.branch === 'trade').forEach((s) => assert.ok(s.prov === 2 || s.prov === 4, s.id + ' (пров. ' + s.prov + ')'));
});

test('tradeRoutesGraph 1:1 с tradeRoutes на линейном графе (совместимость)', () => {
    const linearEdges = [];
    for (let i = 0; i + 1 < SH.length; i++) linearEdges.push([i, i + 1]);
    const patterns = [
        [], [true], Array(20).fill(false), Array(20).fill(true),
        Array.from({ length: 20 }, (_, i) => i < 5),
        [true, true, false, true],
        [true, true, true, false, true, true],
        Array.from({ length: 20 }, (_, i) => i % 2 === 0),
        Array.from({ length: 20 }, (_, i) => i < 6 || i === 8),
    ];
    patterns.forEach((flags) => assert.equal(SM.tradeRoutesGraph(flags, linearEdges), SM.tradeRoutes(flags),
        'flags ' + JSON.stringify(flags) + ': граф ≠ индексный подсчёт'));
});

test('tradeRoutesGraph: явные рёбра парами id и map-форматом эквивалентны', () => {
    const flags = flagsOf(['sh01', 'sh02', 'sh03']);
    const asPairs = [['sh01', 'sh02'], ['sh02', 'sh03'], ['sh03', 'sh04']];
    const asMap = { sh01: ['sh02'], sh02: ['sh03'], sh03: ['sh04'] };
    assert.equal(SM.tradeRoutesGraph(flags, asPairs), 2);
    assert.equal(SM.tradeRoutesGraph(flags, asMap), 2);
});

test('tradeRoutesGraph по каталогу: полный захват = 21 маршруту (19 линейных + 2 диагонали развилок), кап +38%', () => {
    const full = Array(20).fill(true);
    assert.equal(SM.tradeRoutesGraph(full), edgesFromCatalog().length, 'число маршрутов = числу рёбер');
    assert.equal(edgesFromCatalog().length, 21);
    assert.equal(SM.tradeRoutes(full), 19, 'индексный фоллбэк не изменился (parity)');
    assert.equal(SM.tradeBonus(SM.tradeRoutesGraph(full)), 0.38, 'кап бонуса работает при 21 маршруте');
});

test('обход ветки: захват мимо sh08 даёт графу 8 маршрутов против 7 индексных (диагональ sh07→sh09)', () => {
    const flags = flagsOf(['sh01', 'sh02', 'sh03', 'sh04', 'sh05', 'sh06', 'sh07', 'sh09', 'sh10']);
    assert.equal(SM.tradeRoutes(flags), 7, 'индексный: пары соседей');
    assert.equal(SM.tradeRoutesGraph(flags), 8, 'граф: +ребро sh07→sh09');
});

test('захват одной ветки развилки: ш07+ш09 без ш08 — доход с графом не хуже индексного', () => {
    const flags = flagsOf(['sh01', 'sh02', 'sh03', 'sh04', 'sh05', 'sh06', 'sh07', 'sh09', 'sh10', 'sh11']);
    const gi = SM.tradeRoutesGraph(flags), ix = SM.tradeRoutes(flags);
    assert.ok(gi >= ix, 'граф ' + gi + ' < индексного ' + ix);
    assert.ok(SM.tradeBonus(gi) >= SM.tradeBonus(ix));
});

test('фоллбэк: каталог без next у всех узлов → индексная смежность (та же семантика, что tradeRoutes)', () => {
    const saved = globalThis.StrongholdData;
    try {
        globalThis.StrongholdData = { STRONGHOLDS: SH.map((s) => ({ id: s.id })), BUILDINGS: DATA.BUILDINGS, UNIT_TIERS: DATA.UNIT_TIERS };
        [Array(20).fill(true), Array.from({ length: 20 }, (_, i) => i < 7)].forEach((flags) => {
            assert.equal(SM.tradeRoutesGraph(flags), SM.tradeRoutes(flags), 'линейный дефолт должен совпадать 1:1');
        });
        // каталог вовсе недоступен и рёбра не заданы — тоже индексный фоллбэк
        globalThis.StrongholdData = undefined;
        assert.equal(SM.tradeRoutesGraph([true, true, false, true]), 1);
    } finally {
        globalThis.StrongholdData = saved;
    }
});

test('robustness: неизвестные id в edges игнорируются; кривой ввод даёт 0', () => {
    assert.equal(SM.tradeRoutesGraph([true, true], [['sh01', 'sh02'], ['sh01', 'shXX'], ['nope', 'sh02']]), 1);
    assert.equal(SM.tradeRoutesGraph([true, true], []), 0);
    assert.equal(SM.tradeRoutesGraph(null, [['sh01', 'sh02']]), 0);
    assert.equal(SM.tradeRoutesGraph([true, true], null), 1); // null edges → каталог → sh01→sh02 захвачены
});
