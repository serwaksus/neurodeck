const test = require('node:test');
const assert = require('node:assert');
// Campaign 2.0 C2: обход развилок фронтира — контракт SM.frontierTargets (граф next[] из C1).
// Дефолт-цель (минимальный индекс фронтира) обязана совпадать с прежним линейным порядком —
// на этом держатся плейтесты strongholds 5.x–6.x и acceptance (правило 13 очереди D–H).
const SM = require('../js/stronghold-model.js');
const DATA = require('../js/stronghold-data.js');
globalThis.StrongholdData = DATA; // catalog() модели
const SH = DATA.STRONGHOLDS;
const flagsOf = (ids) => SH.map((s) => ids.includes(s.id));
const firstUncaptured = (flags) => flags.findIndex((f) => !f);
const T = (flags) => SM.frontierTargets(flags);

test('старт: ничего не захвачено — фронтир = [0] (стартовый лагерь без предков)', () => {
    assert.deepEqual(T(Array(20).fill(false)), [0]);
    assert.deepEqual(T([]), []);
});

test('линейные стыки: 0..k захвачены — фронтир из одного узла k+1 (пров. 1/3 и входы пров. 2/4)', () => {
    [1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15].forEach((n) => {
        const flags = Array.from({ length: 20 }, (_, i) => i < n);
        assert.deepEqual(T(flags), [n], n + ' захвачено');
    });
});

test('развилка пров. 2: после sh07 фронтир = [sh08(war), sh09(safe)] — обе ветки открыты', () => {
    const flags = flagsOf(['sh01', 'sh02', 'sh03', 'sh04', 'sh05', 'sh06', 'sh07']);
    const t = T(flags);
    assert.deepEqual(t.map((i) => SH[i].id), ['sh08', 'sh09']);
    assert.equal(SH[t[0]].branch, 'war');
    assert.equal(SH[t[1]].branch, 'safe');
});

test('взял военную ветку (sh08): фронтир = [sh09, sh10] — обходная ветка и сходка открыты', () => {
    const flags = flagsOf(['sh01', 'sh02', 'sh03', 'sh04', 'sh05', 'sh06', 'sh07', 'sh08']);
    assert.deepEqual(T(flags).map((i) => SH[i].id), ['sh09', 'sh10']);
});

test('обошёл военную ветку (sh08 не захвачена, дальше пройдено): sh08 остаётся целью — тупика нет', () => {
    const flags = flagsOf(['sh01', 'sh02', 'sh03', 'sh04', 'sh05', 'sh06', 'sh07', 'sh09', 'sh10', 'sh11']);
    // фронтир = обойдённая sh08 (предок sh07 захвачен) + следующая линейная sh12 (предок sh11 захвачен)
    assert.deepEqual(T(flags).map((i) => SH[i].id), ['sh08', 'sh12']);
});

test('развилка пров. 4: после sh17 фронтир = [sh18(war), sh19(safe)]; обход sh18 не запирает', () => {
    const fork = flagsOf(['sh01', 'sh02', 'sh03', 'sh04', 'sh05', 'sh06', 'sh07', 'sh08', 'sh09', 'sh10',
        'sh11', 'sh12', 'sh13', 'sh14', 'sh15', 'sh16', 'sh17']);
    assert.deepEqual(T(fork).map((i) => SH[i].id), ['sh18', 'sh19']);
    const skipWar = flagsOf(['sh01', 'sh02', 'sh03', 'sh04', 'sh05', 'sh06', 'sh07', 'sh08', 'sh09', 'sh10',
        'sh11', 'sh12', 'sh13', 'sh14', 'sh15', 'sh16', 'sh17', 'sh19', 'sh20']);
    assert.deepEqual(T(skipWar).map((i) => SH[i].id), ['sh18']);
});

test('полный захват: фронтир пуст; флаги-«дырки» после каскада осад дают первую дырку', () => {
    assert.deepEqual(T(Array(20).fill(true)), []);
    // sh03/sh04/sh05 пали (сценарий acceptance 1.14), sh01+sh02 целы
    const fallen = flagsOf(['sh01', 'sh02']);
    assert.deepEqual(T(fallen), [2]);
});

test('ДЕФОЛТ = ЛИНЕЙНЫЙ: минимальный индекс фронтира равен первой незахваченной (инвариант на биттернах)', () => {
    const patterns = [];
    for (let mask = 0; mask < 2048; mask++) { // все подмножества первых 11 узлов + хвост захвачен
        patterns.push(Array.from({ length: 20 }, (_, i) => (i < 11 ? !!(mask & (1 << i)) : true)));
    }
    patterns.push(Array(20).fill(false), Array(20).fill(true));
    patterns.forEach((flags) => {
        const lin = firstUncaptured(flags);
        const t = T(flags);
        if (lin === -1) assert.equal(t.length, 0);
        else {
            assert.ok(t.length >= 1, 'фронтир не пуст: ' + flags.join(''));
            assert.equal(t[0], lin, 'дефолт-цель = первая незахваченная (фактически ' + t[0] + ' vs ' + lin + ')');
        }
    });
});

test('фоллбэк: каталог без next → линейная семантика; без каталога — тоже', () => {
    const saved = globalThis.StrongholdData;
    try {
        globalThis.StrongholdData = { STRONGHOLDS: SH.map((s) => ({ id: s.id })), BUILDINGS: DATA.BUILDINGS, UNIT_TIERS: DATA.UNIT_TIERS };
        [Array(20).fill(false), Array.from({ length: 20 }, (_, i) => i < 7)].forEach((flags) => {
            assert.deepEqual(T(flags), [firstUncaptured(flags)]);
        });
        globalThis.StrongholdData = undefined;
        assert.deepEqual(T([true, true, false, true]), [2]);
        assert.deepEqual(T(null), []);
    } finally {
        globalThis.StrongholdData = saved;
    }
});

test('анти-тупик: разрывный каталог (нет рёбер в узел 6) — линейный фоллбэк вместо пустого фронтира', () => {
    const saved = globalThis.StrongholdData;
    try {
        const torn = SH.map((s) => ({ id: s.id, next: s.id === 'sh05' ? [] : (s.next || []) }));
        globalThis.StrongholdData = { STRONGHOLDS: torn, BUILDINGS: DATA.BUILDINGS, UNIT_TIERS: DATA.UNIT_TIERS };
        assert.deepEqual(T(flagsOf(['sh01', 'sh02', 'sh03', 'sh04', 'sh05'])), [5]);
    } finally {
        globalThis.StrongholdData = saved;
    }
});

test('robustness: не-массив флагов → пусто; короткий массив обрезается, а не валит функцию', () => {
    assert.deepEqual(T(null), []);
    assert.deepEqual(T('abc'), []);
    assert.deepEqual(T([false, false]), [0]); // ничего не захвачено → только стартовый узел
});
