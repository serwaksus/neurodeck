'use strict';
// R2 (очередь 4): envelope v3 облачного сохранения — поколенческие chunk-ключи.
// Контракт: чанки нового поколения пишутся под СВОИМИ ключами nd_<gen>_<i> и не
// касаются ключей закоммиченного поколения (изоляция поколений; легаси-контракт
// nd_0 больше не заставляет писать поверх живых чанков). nd_meta — СТРОГО
// последняя запись (commit-pointer) {v:3, g, n, t, c, id, sz, prev?}. Отпечаток
// c (2×FNV-1a → 64-bit hex) отсекает повреждение; prev даёт читателю rollback
// на предыдущее поколение (глубина 1). Легаси-meta без g читает плоские nd_<i>
// как раньше (envelope ≤ v2) — старые облака не теряют доступ.
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

// Ядро писателя (writeCloudGeneration + помощники) в изоляции; ND_CLOUD_FAULTS —
// точка инжекта сбоев (per chunk / meta / concurrent writer; в проде всегда null).
function mkCore(opts) {
    opts = opts || {};
    return new Function('CLOUD_MAX_CHUNK', 'CLOUD_META_KEY', 'CLOUD_DATA_PREFIX', 'ND_CLOUD_FAULTS', 'ndSnapshotChecksum', 'ndTel', 'ndTelErr', 'lastCommittedCloud',
        CORE_FNS.map(extractStorageFn).join('\n') + '; return writeCloudGeneration;')(
        4096, 'nd_meta', 'nd_', opts.faults || null, mkChecksum(), opts.ndTel || function () {}, opts.ndTelErr || function () {}, {});
}

// Читатель (loadCloudChunks) в изоляции
function mkReader(cs, tel) {
    const genKey = new Function('CLOUD_DATA_PREFIX', extractStorageFn('cloudGenKey') + '; return cloudGenKey;')('nd_');
    return new Function('getCloudStorage', 'CLOUD_DATA_PREFIX', 'cloudGenKey', 'ndSnapshotChecksum', 'ndTel', 'ndTelErr', 'lastCommittedCloud',
        extractStorageFn('loadCloudChunks') + '; return loadCloudChunks;')(
        () => cs, 'nd_', genKey, mkChecksum(), tel || function () {}, function () {}, {});
}

// CloudStorage-стаб с журналом операций (колбэки синхронные, как контракт TG)
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

test('writeCloudGeneration: чанки под nd_<gen>_<i>, плоские nd_<i> не пишутся, nd_meta — строго последняя с v3-полями', async () => {
    const cs = mkCloud();
    const json = '{"savedAt":1727500000000,"hero":{"level":3},"forged":[1,2,3]}';
    let res = null;
    mkCore()(cs, json, (err, info) => { res = { err, info }; });
    await sleep(10);
    assert.equal(res.err, null, 'без ошибки');
    const writes = cs.log.filter(([op]) => op === 'setItem').map(([, k]) => k);
    const metaIdx = writes.indexOf('nd_meta');
    assert.ok(metaIdx > -1, 'метаданные записаны');
    assert.equal(metaIdx, writes.length - 1, 'meta — строго последняя запись (commit-pointer)');
    writes.slice(0, metaIdx).forEach((k) => assert.match(k, /^nd_[0-9a-z]+_0$/, 'поколенческий ключ чанка: ' + k));
    assert.ok(!writes.some((k) => /^nd_\d+$/.test(k)), 'плоские легаси-ключи nd_<i> НЕ пишутся (изоляция поколений)');
    const meta = JSON.parse(cs.store.nd_meta);
    assert.equal(meta.v, 3, 'версия envelope');
    assert.equal(meta.t, 1727500000000, 't = savedAt снапшота (анти-воскрешение, легаси-контракт)');
    assert.equal(meta.n, 1, 'n = число чанков (легаси-контракт)');
    assert.equal(meta.sz, json.length, 'sz = размер снапшота');
    assert.equal(meta.g, meta.id, 'g = id = поколение');
    assert.ok(typeof meta.g === 'string' && meta.g.length >= 5, 'id поколения сохранён');
    assert.equal(meta.g, res.info.gen, 'info.gen = закоммиченное поколение');
    assert.match(meta.c, /^[0-9a-f]{16}$/, 'отпечаток — 64-bit hex');
    assert.equal(meta.prev, undefined, 'пустое облако → prev нет');
});

test('writeCloudGeneration → loadCloudChunks: roundtrip и отсечение подменённого чанка', async () => {
    const cs = mkCloud();
    const json = JSON.stringify({ savedAt: 1727500000000, pad: 'x'.repeat(5000), forged: [1, 2, 3] });
    mkCore()(cs, json, () => {});
    await sleep(10);
    const meta = JSON.parse(cs.store.nd_meta);
    assert.equal(meta.n, 2, 'json > 4096 → 2 чанка');

    await new Promise((resolve) => mkReader(cs)(meta, (err, data) => {
        assert.equal(err, null, 'валидный envelope читается без ошибки');
        assert.deepEqual(data, JSON.parse(json), 'данные совпадают байт-в-байт после склейки');
        resolve();
    }, 5000));

    const k0 = 'nd_' + meta.g + '_0';
    cs.store[k0] = cs.store[k0].slice(0, 100) + (cs.store[k0][100] === 'a' ? 'b' : 'a') + cs.store[k0].slice(101); // подмена одного символа
    await new Promise((resolve) => mkReader(cs)(meta, (err, data) => {
        assert.ok(err, 'повреждённый чанк отсечён');
        assert.match(String(err && err.message), /контрольная сумма/, 'ошибка — именно про отпечаток');
        assert.equal(data, null);
        resolve();
    }, 5000));
});

test('loadCloudChunks: легаси-meta без g читает плоские nd_<i> как раньше (обратная совместимость)', async () => {
    const store = { nd_0: '{"a":1,"forged":[1,2,3]}', nd_1: '{"b":2}' };
    const cs = { getItem: (k, cb) => cb(null, (k in store) ? store[k] : null) };
    const legacyMeta = { n: 1, t: 1700000000000 }; // старый формат до фазы 0 (без c, без g)
    await new Promise((resolve) => mkReader(cs)(legacyMeta, (err, data) => {
        assert.equal(err, null, 'легаси читается без ошибки');
        assert.equal(data.a, 1);
        resolve();
    }, 5000));
    const legacyV2 = { n: 1, t: 1700000000000, c: mkChecksum()('{"a":1,"forged":[1,2,3]}'), id: 'v2save' }; // envelope v2 (c есть, g нет)
    await new Promise((resolve) => mkReader(cs)(legacyV2, (err, data) => {
        assert.equal(err, null, 'v2-легаси (плоские чанки + отпечаток) читается');
        assert.equal(data.a, 1);
        resolve();
    }, 5000));
});

test('loadCloudChunks: отсутствующий чанк → ошибка (commit-pointer указывает на неполные данные)', async () => {
    const store = { nd_0: '{"a":1}' }; // nd_1 отсутствует
    const cs = { getItem: (k, cb) => cb(null, (k in store) ? store[k] : null) };
    await new Promise((resolve) => mkReader(cs)({ n: 2, t: 1, c: mkChecksum()('{"a":1}') }, (err) => {
        assert.ok(err, 'чанк отсутствует → ошибка');
        assert.match(String(err && err.message), /отсутствует/);
        resolve();
    }, 5000));
});

test('сбой записи чанка (инжект): meta не сдвинута, закоммиченное поколение физически нетронуто и читается', async () => {
    const cs = mkCloud();
    mkCore()(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'A', forged: [1] }), () => {});
    await sleep(10);
    const metaA = cs.store.nd_meta;
    const keysA = Object.keys(cs.store).filter((k) => k !== 'nd_meta').sort();
    assert.ok(keysA.length > 0, 'поколение A закоммичено');

    let errB = null;
    mkCore({ faults: { chunk: 1 } })(cs, JSON.stringify({ savedAt: 1727500600000, tag: 'B', pad: 'y'.repeat(9000) }), (err) => { errB = err; });
    await sleep(10);
    assert.ok(errB, 'пуш B упал');
    assert.match(String(errB && errB.message), /чанка 1/, 'ошибка — инжект на чанке 1');
    assert.equal(cs.store.nd_meta, metaA, 'commit-pointer не сдвинут при ошибке чанка');
    assert.deepEqual(Object.keys(cs.store).filter((k) => k !== 'nd_meta').sort(), keysA, 'чанки поколения A нетронуты (изоляция поколений)');
    assert.equal(cs.log.filter(([op, k]) => op === 'setItem' && k === 'nd_meta').length, 1, 'meta писалась только пушем A');

    await new Promise((resolve) => mkReader(cs)(JSON.parse(metaA), (err, data) => {
        assert.equal(err, null, 'поколение A читается после упавшего пуша B');
        assert.equal(data.tag, 'A');
        resolve();
    }, 5000));
});

test('сбой записи meta (инжект): свои чанки вычищены, meta не сдвинута — облако остаётся на прошлом поколении', async () => {
    const cs = mkCloud();
    mkCore()(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'A', forged: [1] }), () => {});
    await sleep(10);
    const metaA = cs.store.nd_meta;

    let errB = null;
    let infoB = null;
    mkCore({ faults: { meta: true } })(cs, JSON.stringify({ savedAt: 1727500600000, tag: 'B', forged: [2] }), (err, info) => { errB = err; infoB = info; });
    await sleep(10);
    assert.ok(errB, 'пуш упал на meta');
    assert.match(String(errB && errB.message), /meta/, 'ошибка — инжект meta');
    assert.equal(infoB, null);
    assert.equal(cs.store.nd_meta, metaA, 'commit-pointer не сдвинут');
    const genKeys = Object.keys(cs.store).filter((k) => /^nd_[0-9a-z]+_\d+$/.test(k));
    const metaAObj = JSON.parse(metaA);
    assert.ok(genKeys.every((k) => k.indexOf(metaAObj.g + '_') !== -1), 'чанки незакоммиченного поколения B вычищены');
});

test('writer conflict (CAS): чужое более свежее поколение не затирается, свои чанки вычищены', async () => {
    const cs = mkCloud();
    const conflicts = [];
    mkCore()(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'A', forged: [1] }), () => {});
    await sleep(10);
    const metaA = cs.store.nd_meta;

    // пока мы писали чанки, другой писатель закоммитил поколение на 10 минут свежее
    let errB = null;
    mkCore({ faults: { concurrent: { v: 3, g: 'gz', n: 1, t: 1727500000000 + 600000, c: 'deadbeefdeadbeef', id: 'gz', sz: 10 } }, ndTel: (n) => { if (n === 'cloud_push_conflict') conflicts.push(n); } })(
        cs, JSON.stringify({ savedAt: 1727500000000, tag: 'B', forged: [2] }), (err) => { errB = err; });
    await sleep(10);
    assert.ok(errB && errB.conflict === true, 'конфликт прокинут флагом conflict');
    assert.equal(conflicts.length, 1, 'телеметрия cloud_push_conflict');
    assert.equal(cs.store.nd_meta, metaA, 'чужое закоммиченное поколение не затёрто');
    const metaAObj = JSON.parse(metaA);
    assert.ok(Object.keys(cs.store).every((k) => k === 'nd_meta' || k.indexOf(metaAObj.g + '_') !== -1), 'незакоммиченные чанки B вычищены');
});

test('writer conflict: чужое более старое поколение → коммитим, prev указывает на него (цепочка цела)', async () => {
    const cs = mkCloud();
    mkCore()(cs, JSON.stringify({ savedAt: 1727500000000, tag: 'A', forged: [1] }), () => {});
    await sleep(10);
    // конкурент коммитил, но его снапшот старше нашего (t < savedAt − 10 c) — мы новее, коммитим поверх
    let errB = null; let infoB = null;
    mkCore({ faults: { concurrent: { n: 1, t: 1727500000000 - 600000, id: 'writer-x' } } })(
        cs, JSON.stringify({ savedAt: 1727500600000, tag: 'B', forged: [2] }), (err, info) => { errB = err; infoB = info; });
    await sleep(10);
    assert.equal(errB, null, 'мы свежее — коммитим');
    const meta = JSON.parse(cs.store.nd_meta);
    assert.equal(meta.g, infoB.gen, 'текущее поколение — наше');
    assert.ok(meta.prev, 'prev сохранён');
    assert.equal(meta.prev.id, 'writer-x', 'prev указывает на реально superseded поколение (CAS-цепочка)');
});

test('ndSnapshotChecksum: детерминирован и чувствителен к одному символу', () => {
    const f = mkChecksum();
    assert.equal(f('abc'), f('abc'), 'детерминирован');
    assert.notEqual(f('abc'), f('abd'), 'чувствителен к замене символа');
    assert.notEqual(f('abc'), f('abcd'), 'чувствителен к длине');
    assert.match(f('приватность ✓ 123'), /^[0-9a-f]{16}$/, 'UTF-16 строка → 16 hex');
});

test('прод-код не пишет плоские облачные чанки и держит fault-хуки выключенными', () => {
    assert.ok(/var ND_CLOUD_FAULTS = null;/.test(storage), 'fault-инжект по умолчанию выключен');
    assert.equal((storage.match(/ND_CLOUD_FAULTS\s*=/g) || []).length, 1, 'единственное присваивание — объявление (прод не выставляет ND_CLOUD_FAULTS)');
    assert.ok(!/setItem\(\s*CLOUD_DATA_PREFIX/.test(storage), 'записи только поколенческими ключами nd_<gen>_<i>, плоская легаси-плоскость не пишется');
    assert.ok(extractStorageFn('saveToCloud').includes('writeCloudGeneration'), 'ручное сохранение идёт той же атомарной поколенческой цепочкой');
    assert.ok(extractStorageFn('pushCloudChunks').includes('writeCloudGeneration'), 'автопуш делегирует ядру');
});

test('pushCloudChunks (обёртка): конфликт прокидывается, badge offline, onDone зовётся', async () => {
    const core = (cs, json, cb) => cb(Object.assign(new Error('x'), { conflict: true }));
    const badges = [];
    const toasts = [];
    const run = new Function('writeCloudGeneration', 'updateSyncBadge', 'showToast', 'ndClosingGuard', 'ndTel',
        extractStorageFn('pushCloudChunks') + '; return pushCloudChunks;')(core, (s) => badges.push(s), (t) => toasts.push(String(t)), function () {}, function () {});
    let done = false;
    run({ getItem() {}, setItem() {} }, '{"savedAt":1}', () => { done = true; });
    await sleep(10);
    assert.ok(done, 'onDone вызван (не зависли)');
    assert.ok(badges.includes('offline'), 'бейдж offline при конфликте');
    assert.ok(toasts.some((t) => /занято/.test(t)), 'тост про занятое облако');
});
