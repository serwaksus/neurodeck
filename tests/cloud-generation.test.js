'use strict';
// R2 (очередь 4): поколенческая атомарность облачного сохранения — глубокие контракты:
// rollback-цепочка читателя (глубина 1), retention ровно двух поколений, переход
// с легаси-плоскости nd_0.. (первый v3-коммит держит её как rollback-копию),
// конфликт писателей с реальным interleaving (чужой коммит в полёте наших чанков),
// вайп облака в resetAllData. Базовые fault-инжекты (чанк/meta/concurrent writer)
// и форма envelope v3 — в tests/cloud-envelope.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const storage = fs.readFileSync(path.join(root, 'js', 'storage.js'), 'utf8');

function extractBlock(src, anchor) {
    const start = src.indexOf(anchor);
    assert.ok(start > -1, 'anchor not found: ' + anchor);
    let depth = 0, end = -1;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > -1, 'unbalanced braces after: ' + anchor);
    return src.slice(start, end + 1);
}
const extractStorageFn = (name) => extractBlock(storage, 'function ' + name + '(');
const mkChecksum = () => new Function(extractBlock(storage, 'function ndSnapshotChecksum(') + '; return ndSnapshotChecksum;')();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CORE_FNS = ['cloudGenKey', 'ndCloudFault', 'metaToPrevDesc', 'deleteGenerationChunks', 'writeCloudGeneration'];

function mkCore(opts) {
    opts = opts || {};
    return new Function('CLOUD_MAX_CHUNK', 'CLOUD_META_KEY', 'CLOUD_DATA_PREFIX', 'ND_CLOUD_FAULTS', 'ndSnapshotChecksum', 'ndTel', 'ndTelErr', 'lastCommittedCloud',
        CORE_FNS.map(extractStorageFn).join('\n') + '; return writeCloudGeneration;')(
        4096, 'nd_meta', 'nd_', opts.faults || null, mkChecksum(), opts.ndTel || function () {}, opts.ndTelErr || function () {}, {});
}

function mkReader(cs, tel) {
    const genKey = new Function('CLOUD_DATA_PREFIX', extractStorageFn('cloudGenKey') + '; return cloudGenKey;')('nd_');
    return new Function('getCloudStorage', 'CLOUD_DATA_PREFIX', 'cloudGenKey', 'ndSnapshotChecksum', 'ndTel', 'ndTelErr', 'lastCommittedCloud',
        extractStorageFn('loadCloudChunks') + '; return loadCloudChunks;')(
        () => cs, 'nd_', genKey, mkChecksum(), tel || function () {}, function () {}, {});
}

function mkCloud() {
    const store = {};
    const log = [];
    return {
        store, log,
        getItem: (k, cb) => { log.push(['getItem', k]); cb(null, (k in store) ? store[k] : null); },
        setItem: (k, v, cb) => { log.push(['setItem', k]); store[k] = String(v); cb(null); },
        removeItem: (k, cb) => { log.push(['removeItem', k]); delete store[k]; cb(null); },
    };
}

test('rollback: закоммиченное поколение повреждено → читатель получает prev (cloud_rollback_used)', async () => {
    const cs = mkCloud();
    const tel = [];
    const core = mkCore({ ndTel: (n) => tel.push(n) });
    core(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'A' }), () => {});
    await sleep(10);
    core(cs, JSON.stringify({ savedAt: 1727500600000, tag: 'B' }), () => {});
    await sleep(10);
    const meta = JSON.parse(cs.store.nd_meta);
    assert.ok(meta.prev && meta.prev.g, 'prev — поколенческий дескриптор');

    const k0 = 'nd_' + meta.g + '_0';
    cs.store[k0] = cs.store[k0].slice(0, 20) + 'X'; // повреждение текущего поколения
    await new Promise((resolve) => mkReader(cs, (n) => tel.push(n))(meta, (err, data) => {
        assert.equal(err, null, 'rollback спас данные вместо ошибки');
        assert.equal(data.tag, 'A', 'отдано предыдущее поколение');
        assert.ok(tel.includes('cloud_rollback_used'), 'телеметрия cloud_rollback_used');
        resolve();
    }, 5000));
});

test('rollback исчерпан: оба поколения повреждены → ошибка наружу (работают recovery-потоки)', async () => {
    const cs = mkCloud();
    const core = mkCore();
    core(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'A' }), () => {});
    await sleep(10);
    core(cs, JSON.stringify({ savedAt: 1727500600000, tag: 'B' }), () => {});
    await sleep(10);
    const meta = JSON.parse(cs.store.nd_meta);
    cs.store['nd_' + meta.g + '_0'] = 'XXX';
    cs.store['nd_' + meta.prev.g + '_0'] = 'YYY';
    await new Promise((resolve) => mkReader(cs)(meta, (err, data) => {
        assert.ok(err, 'глубина rollback = 1: дальше — ошибка');
        assert.match(String(err && err.message), /контрольная сумма|отсутствует/);
        assert.equal(data, null);
        resolve();
    }, 5000));
});

test('retention: живы ровно два последних поколения, чанки старшего вычищены', async () => {
    const cs = mkCloud();
    const core = mkCore();
    const gens = [];
    core(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'A' }), (e, i) => gens.push(i.gen));
    await sleep(10);
    core(cs, JSON.stringify({ savedAt: 1727500600000, tag: 'B' }), (e, i) => gens.push(i.gen));
    await sleep(10);
    core(cs, JSON.stringify({ savedAt: 1727501200000, tag: 'C' }), (e, i) => gens.push(i.gen));
    await sleep(10);
    const meta = JSON.parse(cs.store.nd_meta);
    assert.equal(meta.g, gens[2], 'текущее — C');
    assert.equal(meta.prev.g, gens[1], 'prev — B');
    const alive = {};
    Object.keys(cs.store).forEach((k) => { if (/^nd_[0-9a-z]+_\d+$/.test(k)) alive[k.slice(3, k.lastIndexOf('_'))] = true; });
    assert.deepEqual(Object.keys(alive).sort(), [gens[1], gens[2]].sort(), 'живы только B и C; A вычищен');
    // prev-поколение B остаётся читаемым (rollback-копия реальна, а не только в meta)
    const k0 = 'nd_' + meta.g + '_0';
    cs.store[k0] = cs.store[k0].slice(0, 15) + 'Z';
    await new Promise((resolve) => mkReader(cs)(meta, (err, data) => {
        assert.equal(err, null);
        assert.equal(data.tag, 'B', 'после трёх пушей prev всё ещё читается');
        resolve();
    }, 5000));
});

test('первый v3-коммит поверх легаси-плоскости: nd_0..n-1 остаются как rollback-копия, surplus вычищен', async () => {
    const cs = mkCloud();
    const legacyJson = JSON.stringify({ savedAt: 1727400000000, tag: 'legacy', pad: 'l'.repeat(5000) }); // 2 чанка
    cs.store.nd_0 = legacyJson.slice(0, 4096);
    cs.store.nd_1 = legacyJson.slice(4096);
    cs.store.nd_9 = 'junk-surplus';
    cs.store.nd_meta = JSON.stringify({ n: 2, t: 1727400000000, c: mkChecksum()(legacyJson), id: 'v2save', sz: legacyJson.length });

    let info = null;
    mkCore()(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'NEW' }), (err, i) => { info = i || err; });
    await sleep(10);
    assert.ok(info && info.gen, 'коммит поверх легаси успешен: ' + JSON.stringify(info));
    assert.ok(cs.store.nd_0 && cs.store.nd_1, 'легаси-чанки живы как rollback-копия');
    assert.equal(cs.store.nd_9, undefined, 'легаси surplus вычищен');
    const meta = JSON.parse(cs.store.nd_meta);
    assert.equal(meta.prev.n, 2, 'prev описывает легаси-поколение');
    assert.equal(meta.prev.g, undefined, 'prev без g = плоские ключи nd_<i>');
    assert.ok(!/^nd_\d+$/.test('nd_' + meta.g), 'свои ключи не коллидируют с плоской плоскостью');

    // rollback на легаси: портим чанк нового поколения → читаются плоские nd_0+nd_1
    cs.store['nd_' + meta.g + '_0'] = 'XXX';
    await new Promise((resolve) => mkReader(cs)(meta, (err, data) => {
        assert.equal(err, null, 'откат на легаси-плоскость сработал');
        assert.equal(data.tag, 'legacy', 'легаси-данные целы и прочитаны');
        resolve();
    }, 5000));
});

test('интеграция конфликта: чужой коммит В ПОЛЁТЕ наших чанков → более свежее поколение не затёрто', async () => {
    const base = mkCloud();
    mkCore()(base, JSON.stringify({ savedAt: 1727400000000, tag: 'A' }), () => {});
    await sleep(10);
    // пишем B; в момент записи первого чанка «другое устройство» коммитит C (t на 10 минут свежее нашего savedAt)
    const cs = {
        store: base.store,
        getItem: base.getItem,
        removeItem: base.removeItem,
        setItem: (k, v, cb) => {
            base.setItem(k, v, () => {
                if (/^nd_[0-9a-z]+_0$/.test(k) && base.store.nd_meta.indexOf('"g":"gc"') === -1) {
                    base.store['nd_gc_0'] = '{"savedAt":1727500600000,"tag":"C"}';
                    base.store.nd_meta = JSON.stringify({ v: 3, g: 'gc', n: 1, t: 1727505900000, c: '0123456789abcdef', id: 'gc', sz: 30 });
                }
                cb(null);
            });
        },
    };
    let errB = null;
    mkCore()(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'B' }), (err) => { errB = err; });
    await sleep(10);
    assert.ok(errB && errB.conflict === true, 'устаревший пуш не коммитится (конфликт)');
    assert.equal(JSON.parse(base.store.nd_meta).g, 'gc', 'конкурент остался текущим поколением');
    assert.equal(base.store['nd_gB_0'], undefined, 'наши осиротевшие чанки вычищены');
});

test('onDone зовётся ровно один раз на всех путях (успех / ошибка чанка / конфликт)', async () => {
    const counts = { ok: 0, chunk: 0, conflict: 0 };
    const cs = mkCloud();
    mkCore()(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'A' }), () => counts.ok++);
    await sleep(10);
    mkCore({ faults: { chunk: 0 } })(cs, JSON.stringify({ savedAt: 1727500600000, tag: 'B' }), () => counts.chunk++);
    await sleep(10);
    mkCore({ faults: { concurrent: { v: 3, g: 'gz', n: 1, t: 1727501200000, c: 'x', id: 'gz', sz: 1 } } })(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'C' }), () => counts.conflict++);
    await sleep(10);
    // после конфликта/ошибки повторный валидный пуш всё ещё работает (облако не заблокировано)
    let repaired = null;
    mkCore()(cs, JSON.stringify({ savedAt: 1727501800000, tag: 'D' }), (err, i) => { repaired = { err, i }; });
    await sleep(10);
    assert.deepEqual(counts, { ok: 1, chunk: 1, conflict: 1 }, 'ровно по одному завершению на путь');
    assert.ok(repaired && repaired.i && repaired.i.gen, 'после сбоев следующий коммит успешен');
    assert.equal(JSON.parse(cs.store.nd_meta).g, repaired.i.gen, 'commit-pointer на свежем поколении');
});

test('resetAllData: облако вайпается — commit-pointer первым, чанки cur- и prev-поколений', async () => {
    const cs = mkCloud();
    const core = mkCore();
    core(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'A' }), () => {});
    await sleep(10);
    core(cs, JSON.stringify({ savedAt: 1727500600000, tag: 'B' }), () => {});
    await sleep(10);
    const meta = JSON.parse(cs.store.nd_meta);
    // читатель (как и прод) держит дескрипторы последнего поколения для вайпа
    assert.ok(extractStorageFn('loadCloudChunks').includes('lastCommittedCloud = { cur:'), 'читатель обновляет дескрипторы для вайпа');
    const descriptor = { cur: { g: meta.g, n: meta.n }, prev: meta.prev || null };

    const ls = { neurodeck_full_save: '{}', neurodeck_ever_saved: '1', outside_key: 'keep' };
    const localStorageStub = {
        get length() { return Object.keys(ls).length; },
        key: (i) => Object.keys(ls)[i] || null,
        getItem: (k) => (k in ls ? ls[k] : null),
        setItem: (k, v) => { ls[k] = String(v); },
        removeItem: (k) => { delete ls[k]; },
    };
    let reloads = 0;
    const delGen = new Function('CLOUD_DATA_PREFIX', 'cloudGenKey', extractStorageFn('deleteGenerationChunks') + '; return deleteGenerationChunks;')('nd_', (g, i) => 'nd_' + g + '_' + i);
    const reset = new Function('dungeonConfirm', 'localStorage', 'getCloudStorage', 'CLOUD_META_KEY', 'lastCommittedCloud', 'deleteGenerationChunks', 'idb', 'location',
        extractStorageFn('resetAllData') + '; return resetAllData;')(
        () => Promise.resolve(true), localStorageStub, () => cs, 'nd_meta', descriptor, delGen, null, { reload: () => { reloads++; } });
    await reset();
    await sleep(10);
    const removed = cs.log.filter(([op]) => op === 'removeItem').map(([, k]) => k);
    assert.equal(removed[0], 'nd_meta', 'commit-pointer удаляется первым (облако сразу «пустое»)');
    assert.ok(removed.indexOf('nd_' + meta.g + '_0') > -1, 'чанки cur-поколения удалены');
    assert.ok(removed.indexOf('nd_' + meta.prev.g + '_0') > -1, 'чанки prev-поколения удалены');
    assert.ok(cs.store.nd_meta === undefined && Object.keys(cs.store).every((k) => !/^nd_[0-9a-z]+_\d+$/.test(k)), 'облако пусто');
    assert.ok(!('neurodeck_full_save' in ls) && !('neurodeck_ever_saved' in ls), 'локальные neurodeck_-ключи стёрты');
    assert.equal(ls.outside_key, 'keep', 'чужие ключи не тронуты');
    assert.equal(reloads, 1, 'перезагрузка после вайпа');
});
