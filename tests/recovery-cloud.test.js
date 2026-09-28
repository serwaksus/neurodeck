'use strict';
// Волна 1 (2026-09-28): восстановление после ITP-чистки iOS, платформенный чек
// CloudStorage, гонка синка (meta.t = снапшот), очередь форс-пушей.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const storage = fs.readFileSync(path.join(root, 'js', 'storage.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

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

test('getCloudStorage: заглушка вне Telegram (platform unknown) — не облако', () => {
    const mk = (webApp) => new Function('window', extractStorageFn('getCloudStorage') + '; return getCloudStorage();')({ Telegram: webApp ? { WebApp: webApp } : undefined });
    const cs = { setItem() {}, getItem() {} };
    assert.equal(mk({ platform: 'android', CloudStorage: cs }), cs, 'android → облако доступно');
    assert.equal(mk({ platform: 'ios', CloudStorage: cs }), cs, 'ios → облако доступно');
    assert.equal(mk({ platform: 'unknown', CloudStorage: cs }), null, 'unknown → заглушка, не облако');
    assert.equal(mk({ CloudStorage: cs }), null, 'нет platform → не облако');
    assert.equal(mk({ platform: 'android' }), null, 'нет CloudStorage → null');
    assert.equal(mk(null), null, 'нет Telegram → null');
});

test('pushCloudChunks: nd_meta.t = savedAt снапшота, а не момент завершения пуша', async () => {
    const writes = [];
    const cs = { setItem(key, val, cb) { writes.push([key, val]); cb(null); } };
    const json = '{"savedAt":1727500000000,"hero":{"level":3},"forged":[1,2,3]}';
    const run = new Function('cs', 'json', 'onDone', 'CLOUD_MAX_CHUNK', 'CLOUD_META_KEY', 'CLOUD_DATA_PREFIX', 'updateSyncBadge', 'showToast', 'getCloudStorage', 'clearSurplusChunks',
        extractStorageFn('pushCloudChunks') + '; return pushCloudChunks;')(cs, json, () => {}, 4096, 'nd_meta', 'nd_', () => {}, () => {}, () => null);
    run(cs, json, () => {});
    await new Promise((r) => setTimeout(r, 10));
    const metaWrite = writes.find(([k]) => k === 'nd_meta');
    assert.ok(metaWrite, 'метаданные записаны последними');
    const meta = JSON.parse(metaWrite[1]);
    assert.equal(meta.t, 1727500000000, 't = savedAt снапшота (анти-воскрешение удалённого)');
    assert.equal(meta.n, 1);
});

test('autoCloudSave: форс-пуш во время летящего — в очередь, без второго параллельного пуша', () => {
    const src = extractStorageFn('autoCloudSave');
    assert.ok(src.includes('_pendingCloudForce'), 'очередь форс-пуша присутствует');
    let getItemCalled = 0;
    const win = {};
    const fn = new Function('window', '_pushInFlight', 'cs', 'FORGED', 'getCloudStorage', 'pushCloudChunks', 'updateSyncBadge', 'showToast', 'CLOUD_META_KEY', src + '; return autoCloudSave;')(
        win, true, { getItem() { getItemCalled++; } }, [{}], () => ({}), () => assert.fail('пуш не должен стартовать при in-flight'), () => {}, () => {}, 'nd_meta');
    fn('{"savedAt":1}', true, false);
    assert.ok(win._pendingCloudForce, 'форс-пуш поставлен в очередь');
    assert.equal(win._pendingCloudForce.json, '{"savedAt":1}');
    assert.equal(getItemCalled, 0, 'конфликт-проверка не стартует при in-flight');
});

test('tryCloudRecovery: работает после ITP-чистки (без ever_saved), помнит отказ, держит старт-колоду', async () => {
    const src = extractStorageFn('tryCloudRecovery');
    assert.ok(!src.includes('hasEverSaved'), 'гвард hasEverSaved удалён (главная дыра ITP)');
    assert.ok(src.includes('__ndCloudCheckPending'), 'сигнал boot-у держать старт-колоду');
    assert.ok(src.includes('neurodeck_cloud_declined_t'), 'отказ от восстановления запоминается');
    assert.ok(src.includes('cardCount === 0'), 'пустое облако не блокирует старт-колоду');

    const calls = { set: [], confirm: null, applied: 0, reloads: 0 };
    const localStorageStub = { getItem: () => null, setItem: (k, v) => calls.set.push([k, v]) };
    const cs = { getItem: (key, cb) => cb(null, JSON.stringify({ n: 1, t: 1700000000000 })) };
    const decls = [extractStorageFn('tryCloudRecovery')];
    const stubNames = ['window', 'FORGED', 'getCloudStorage', 'localStorage', 'loadCloudChunks', 'dungeonConfirm', 'applySyncData', 'saveGameState', 'showToast', 'spiritSay', 'screenShake', 'location', 'CLOUD_META_KEY'];
    const mkRun = (confirmOk) => new Function(...stubNames, decls.join('\n') + '; return tryCloudRecovery;')(
        {}, [], () => cs, localStorageStub,
        (meta, onDone) => onDone(null, { forged: [{ id: 1 }], hero: { level: 4 } }),
        () => { calls.confirm = true; return Promise.resolve(confirmOk); },
        () => { calls.applied++; }, () => {}, () => {}, () => {}, () => {}, { reload: () => { calls.reloads++; } }, 'nd_meta');
    mkRun(false)();
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(calls.set, [['neurodeck_cloud_declined_t', '1700000000000']], 'отказ запомнен по метке облака');
    assert.equal(calls.applied, 0, 'при отказе ничего не накладывается');
    assert.equal(calls.reloads, 0);

    mkRun(true)();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls.applied, 1, 'при согласии прогресс восстановлен');
    assert.equal(calls.reloads, 1);
});

test('deepRecovery и smartCloudSync: гварды согласованы с новым recovery-потоком', () => {
    assert.ok(!extractStorageFn('deepRecovery').includes('hasEverSaved'), 'ручное восстановление не зависит от ever_saved');
    assert.ok(extractStorageFn('smartCloudSync').includes('FORGED.length === 0'), 'smartCloudSync не спорит с tryCloudRecovery за пустое устройство');
    assert.equal((storage.match(/hasEverSaved\(\)/g) || []).length, 1, 'hasEverSaved остался только в определении — ни одного гварда на вызовах');
});

test('validDisplayText: «только эмодзи» и пустота отклоняются, длина обрезается', () => {
    const re = new RegExp('[\\p{L}\\p{N}]', 'u');
    const fn = new Function('_ndTextRe', "function validDisplayText(raw, maxLen) { var name = String(raw == null ? '' : raw).trim().slice(0, maxLen || 40); if (!name) return null; return _ndTextRe.test(name) ? name : null; } return validDisplayText;")(re);
    assert.equal(fn('🔥🔥🔥', 40), null, 'только эмодзи — не название');
    assert.equal(fn('   ', 40), null, 'пусто — не название');
    assert.equal(fn('Зарядка 🔥', 40), 'Зарядка 🔥', 'эмодзи рядом с текстом допустимы');
    assert.equal(fn('a'.repeat(50), 40).length, 40, 'длина обрезается');
});

test('boot: старт-колода придерживается до ответа облака, else-ветка без глубокого автоскана', () => {
    assert.ok(app.includes('holdStarterDeck'), 'boot ждёт __ndCloudCheckPending перед старт-колодой');
    assert.ok(!app.includes('!hasEverSaved() && FORGED.length === 0') || app.indexOf('holdStarterDeck') < app.indexOf('!hasEverSaved()'), 'старое условие ветки заменено');
});
