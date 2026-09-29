'use strict';
// Фаза 0 «Trust»: envelope v2 облачного сохранения.
// Контракт: чанки nd_<i> пишутся первыми, nd_meta — ПОСЛЕДНИМ как commit-pointer
// {n, t, c, id, sz}. Отпечаток c (2×FNV-1a → 64-bit hex) отсекает смешанное
// поколение чанков (обрыв пуша поверх старых данных) и повреждение.
// Легаси-meta без c читается как раньше — старые пользователи не теряют доступ.
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

function mkPushRun(cs, json, onDone) {
    const run = new Function('cs', 'json', 'onDone', 'CLOUD_MAX_CHUNK', 'CLOUD_META_KEY', 'CLOUD_DATA_PREFIX',
        'updateSyncBadge', 'showToast', 'getCloudStorage', 'clearSurplusChunks', 'ndClosingGuard', 'ndSnapshotChecksum',
        extractStorageFn('pushCloudChunks') + '; return pushCloudChunks;')(
        cs, json, onDone, 4096, 'nd_meta', 'nd_', () => {}, () => {}, () => null, () => {}, () => {}, mkChecksum());
    return run;
}

function mkLoadRun(cs) {
    return new Function('meta', 'onDone', 'timeoutMs', 'getCloudStorage', 'CLOUD_DATA_PREFIX', 'ndSnapshotChecksum',
        extractStorageFn('loadCloudChunks') + '; return loadCloudChunks;')(
        undefined, undefined, undefined, () => cs, 'nd_', mkChecksum());
}

test('pushCloudChunks: nd_meta — commit-pointer c отпечатком, id поколения и размером, записан последним', async () => {
    const writes = [];
    const cs = { setItem(key, val, cb) { writes.push([key, val]); cb(null); } };
    const json = '{"savedAt":1727500000000,"hero":{"level":3},"forged":[1,2,3]}';
    const run = mkPushRun(cs, json, () => {});
    run(cs, json, () => {});
    await sleep(10);
    const metaIdx = writes.findIndex(([k]) => k === 'nd_meta');
    assert.ok(metaIdx > -1, 'метаданные записаны');
    assert.equal(metaIdx, writes.length - 1, 'meta — строго последняя запись (commit-pointer)');
    assert.deepEqual(writes.slice(0, metaIdx).map(([k]) => k), ['nd_0'], 'чанки — до meta');
    const meta = JSON.parse(writes[metaIdx][1]);
    assert.equal(meta.t, 1727500000000, 't = savedAt снапшота (анти-воскрешение, легаси-контракт)');
    assert.equal(meta.n, 1, 'n = число чанков (легаси-контракт)');
    assert.equal(meta.sz, json.length, 'sz = размер снапшота');
    assert.ok(typeof meta.id === 'string' && meta.id.length >= 5, 'id поколения сохранён');
    assert.match(meta.c, /^[0-9a-f]{16}$/, 'отпечаток — 64-bit hex');
});

test('pushCloudChunks → loadCloudChunks: roundtrip и отсечение подменённого чанка', async () => {
    const store = {};
    const cs = {
        setItem(k, v, cb) { store[k] = String(v); cb(null); },
        getItem(k, cb) { cb(null, (k in store) ? store[k] : null); },
    };
    const json = JSON.stringify({ savedAt: 1727500000000, pad: 'x'.repeat(5000), forged: [1, 2, 3] });
    mkPushRun(cs, json, () => {})(cs, json, () => {});
    await sleep(10);
    const meta = JSON.parse(store.nd_meta);
    assert.equal(meta.n, 2, 'json > 4096 → 2 чанка');

    await new Promise((resolve) => mkLoadRun(cs)(meta, (err, data) => {
        assert.equal(err, null, 'валидный envelope читается без ошибки');
        assert.deepEqual(data, JSON.parse(json), 'данные совпадают байт-в-байт после склейки');
        resolve();
    }, 5000));

    store.nd_0 = store.nd_0.slice(0, 100) + (store.nd_0[100] === 'a' ? 'b' : 'a') + store.nd_0.slice(101); // подмена одного символа
    await new Promise((resolve) => mkLoadRun(cs)(meta, (err, data) => {
        assert.ok(err, 'повреждённый чанк отсечён');
        assert.match(String(err && err.message), /контрольная сумма/, 'ошибка — именно про отпечаток');
        assert.equal(data, null);
        resolve();
    }, 5000));
});

test('loadCloudChunks: легаси-meta без c читается как раньше (обратная совместимость)', async () => {
    const store = { nd_0: '{"a":1,"forged":[1,2,3]}' };
    const cs = { getItem: (k, cb) => cb(null, (k in store) ? store[k] : null) };
    const legacyMeta = { n: 1, t: 1700000000000 }; // старый формат до фазы 0
    await new Promise((resolve) => mkLoadRun(cs)(legacyMeta, (err, data) => {
        assert.equal(err, null, 'легаси читается без ошибки');
        assert.equal(data.a, 1);
        resolve();
    }, 5000));
});

test('loadCloudChunks: отсутствующий чанк → ошибка (commit-pointer указывает на неполные данные)', async () => {
    const store = { nd_0: '{"a":1}' }; // nd_1 отсутствует
    const cs = { getItem: (k, cb) => cb(null, (k in store) ? store[k] : null) };
    await new Promise((resolve) => mkLoadRun(cs)({ n: 2, t: 1, c: mkChecksum()('{"a":1}') }, (err) => {
        assert.ok(err, 'чанк отсутствует → ошибка');
        assert.match(String(err && err.message), /отсутствует/);
        resolve();
    }, 5000));
});

test('pushCloudChunks: ошибка записи чанка → meta НЕ перезаписывается (старое поколение живо)', async () => {
    const writes = [];
    const cs = {
        setItem(key, val, cb) {
            writes.push([key, val]);
            if (key === 'nd_0') { cb(new Error('cloud down')); return; }
            cb(null);
        },
    };
    const json = '{"savedAt":1,"pad":"' + 'y'.repeat(9000) + '"}';
    let done = false;
    mkPushRun(cs, json, () => {})(cs, json, () => { done = true; }); // onDone передаётся в месте вызова: параметр затеняет замыкание харнесса
    await sleep(10);
    assert.ok(done, 'onDone вызван (не зависли)');
    assert.equal(writes.filter(([k]) => k === 'nd_meta').length, 0, 'commit-pointer не сдвинут при ошибке чанка');
});

test('ndSnapshotChecksum: детерминирован и чувствителен к одному символу', () => {
    const f = mkChecksum();
    assert.equal(f('abc'), f('abc'), 'детерминирован');
    assert.notEqual(f('abc'), f('abd'), 'чувствителен к замене символа');
    assert.notEqual(f('abc'), f('abcd'), 'чувствителен к длине');
    assert.match(f('приватность ✓ 123'), /^[0-9a-f]{16}$/, 'UTF-16 строка → 16 hex');
});
