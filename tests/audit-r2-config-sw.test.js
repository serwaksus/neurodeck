// Аудит 2026-10-02 R2: M6 (remote-config в проде не находил fetch), M8 (навигация SW без таймаута), L12.
// SW исполняется в vm с фейковыми self/caches/fetch — поведение, а не grep по исходнику.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// ---------- M6 ----------
test('M6: loadWeeklyConfig без opts.fetch берёт globalThis.fetch (раньше root.fetch → всегда no-fetch)', async () => {
    const SD = require('../js/stronghold-data.js');
    globalThis.StrongholdData = SD;
    const RC = require('../js/remote-config.js');
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'weekly-modifiers.v1.json'), 'utf8'));
    const saved = globalThis.fetch;
    let asked = null;
    globalThis.fetch = (url) => { asked = url; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(cfg)) }); };
    try {
        const r = await RC.loadWeeklyConfig({ now: Date.parse('2026-10-02T12:00:00Z') });
        assert.equal(r.applied, true, JSON.stringify(r));
        assert.equal(asked, 'config/weekly-modifiers.v1.json');
        assert.ok(Array.isArray(SD.WEEKLY_MODS_REMOTE) && SD.WEEKLY_MODS_REMOTE.length === cfg.modifiers.length);
    } finally { globalThis.fetch = saved; RC.resetWeeklyModifiers(); delete globalThis.StrongholdData; }
});

test('M6: «висящий» fetch не держит лоадер вечно — timeout → fallback', async () => {
    globalThis.StrongholdData = require('../js/stronghold-data.js');
    const RC = require('../js/remote-config.js');
    const r = await RC.loadWeeklyConfig({ fetch: () => new Promise(() => {}), timeout: 30 });
    assert.equal(r.applied, false);
    assert.equal(r.reason, 'network');
    assert.match(r.detail, /timeout/);
    delete globalThis.StrongholdData;
});

// ---------- SW в песочнице ----------
function loadSw({ fetchImpl, cacheEntries = {} }) {
    const listeners = {};
    const store = new Map(Object.entries(cacheEntries));
    const cache = {
        put: async (k, v) => { store.set(typeof k === 'string' ? k : k.url, v); },
        add: async () => {}, match: async (k) => store.get(typeof k === 'string' ? k : k.url),
    };
    const ctx = {
        self: { addEventListener: (t, fn) => { listeners[t] = fn; }, location: { origin: 'https://x.test' }, skipWaiting() {}, clients: { claim() {} } },
        location: { origin: 'https://x.test' },
        caches: { open: async () => cache, match: async (k) => store.get(typeof k === 'string' ? k : k.url), keys: async () => [], delete: async () => true },
        fetch: fetchImpl,
        Request: class { constructor(u) { this.url = u; } },
        Response: class { constructor(b) { this.body = b; this.ok = true; } clone() { return this; } static error() { const r = new this('error'); r.ok = false; r.isError = true; return r; } },
        URL, Promise, console,
        setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 15)), // 4 c таймаута → 15 мс
        clearTimeout,
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), ctx);
    return { listeners, store };
}
const fetchEvent = (req) => { let p; return { request: req, respondWith: (x) => { p = x; }, get promise() { return p; } }; };
const nav = (url) => ({ method: 'GET', mode: 'navigate', url });
const asset = (url) => ({ method: 'GET', mode: 'no-cors', url });

test('M8: навигация при «висящей» сети отвечает из кэша по таймауту', async () => {
    const sw = loadSw({ fetchImpl: () => new Promise(() => {}), cacheEntries: { 'index.html': { body: 'CACHED', ok: true } } });
    const ev = fetchEvent(nav('https://x.test/'));
    sw.listeners.fetch(ev);
    const res = await ev.promise;
    assert.equal(res.body, 'CACHED');
});

test('M8: быстрая сеть побеждает кэш и обновляет его', async () => {
    const sw = loadSw({ fetchImpl: async () => ({ body: 'FRESH', ok: true, clone() { return this; } }), cacheEntries: { 'index.html': { body: 'CACHED', ok: true } } });
    const ev = fetchEvent(nav('https://x.test/'));
    sw.listeners.fetch(ev);
    assert.equal((await ev.promise).body, 'FRESH');
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(sw.store.get('index.html').body, 'FRESH');
});

test('M8: сети нет — кэш; кэша тоже нет и сеть висит — ждём сеть, а не белый экран по таймауту', async () => {
    let release;
    const hanging = new Promise((r) => { release = r; });
    const sw = loadSw({ fetchImpl: () => hanging.then(() => ({ body: 'LATE', ok: true, clone() { return this; } })) });
    const ev = fetchEvent(nav('https://x.test/'));
    sw.listeners.fetch(ev);
    setTimeout(release, 60);
    assert.equal((await ev.promise).body, 'LATE');
});

test('M6: config/*.json — сеть первая (cache-first закрепил бы первую версию навсегда), офлайн — кэш', async () => {
    let online = true;
    const sw = loadSw({ fetchImpl: async () => { if (!online) throw new Error('offline'); return { body: online === true ? 'NEW' : '', ok: true, clone() { return this; } }; }, cacheEntries: { 'https://x.test/config/weekly-modifiers.v1.json': { body: 'OLD', ok: true } } });
    let ev = fetchEvent(asset('https://x.test/config/weekly-modifiers.v1.json'));
    sw.listeners.fetch(ev);
    assert.equal((await ev.promise).body, 'NEW', 'при сети — свежий');
    online = false;
    ev = fetchEvent(asset('https://x.test/config/weekly-modifiers.v1.json'));
    sw.listeners.fetch(ev);
    assert.equal((await ev.promise).body, 'NEW', 'офлайн — последний закэшированный');
});

test('L12: упавший ресурс не подменяется index.html', async () => {
    const sw = loadSw({ fetchImpl: async () => { throw new Error('offline'); }, cacheEntries: { './': { body: '<html>', ok: true } } });
    const ev = fetchEvent(asset('https://x.test/css/style.css?v=1'));
    sw.listeners.fetch(ev);
    const res = await ev.promise;
    assert.equal(res.isError, true);
});
