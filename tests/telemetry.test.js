'use strict';
// Фаза 0 «Trust»: локальный diagnostic ring buffer (js/telemetry.js).
// Контракты: кольцо ≤200 с дедупом повторов, error() пишется немедленно,
// восстановление журнала после перезапуска, битый журнал не роняет старт,
// RUNTIME_ERROR ловится через window error-listener.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'telemetry.js'), 'utf8');

function makeHarness(opts) {
    opts = opts || {};
    const store = opts.store || {};
    const ls = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
    };
    const listeners = {};
    const win = {
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
        location: { href: 'https://t.me/neurodeck_bot/app' },
    };
    const doc = {
        readyState: opts.readyState || 'loading',
        addEventListener: (t, f) => { (listeners['doc:' + t] = listeners['doc:' + t] || []).push(f); },
    };
    const nav = { userAgent: 'TestAgent/1.0' };
    const makeFn = new Function('window', 'localStorage', 'navigator', 'document', src + '; return window.NDTelemetry;');
    const tel = makeFn(win, ls, nav, doc);
    return { tel, store, listeners };
}

test('telemetry: event() попадает в кольцо и счётчик, flush() пишет в localStorage', () => {
    const h = makeHarness();
    h.tel.event('save_ok', { gen: 3 });
    const ev = h.tel.ring().find((e) => e.n === 'save_ok');
    assert.ok(ev, 'событие в кольце');
    assert.equal(ev.d.gen, 3);
    assert.equal(h.tel.counters().save_ok, 1);
    h.tel.flush();
    assert.equal(JSON.parse(h.store['neurodeck_diag_log']).filter((e) => e.n === 'save_ok').length, 1, 'журнал в localStorage');
    assert.equal(JSON.parse(h.store['neurodeck_diag_counters']).save_ok, 1, 'счётчики в localStorage');
});

test('telemetry: повтор того же имени < 2 c — в счётчик, без дубля в кольце', () => {
    const h = makeHarness();
    h.tel.event('cloud_push_ok', { n: 1 });
    h.tel.event('cloud_push_ok', { n: 2 });
    assert.equal(h.tel.counters().cloud_push_ok, 2, 'счётчик растёт');
    assert.equal(h.tel.ring().filter((e) => e.n === 'cloud_push_ok').length, 1, 'кольцо без дублей');
});

test('telemetry: error() пишется немедленно, без ожидания flush-таймера', () => {
    const h = makeHarness();
    h.tel.error('STORAGE_WRITE_FAILED', 'QuotaExceededError', { gen: 5 });
    assert.ok(h.store['neurodeck_diag_log'], 'журнал уже в localStorage');
    const errEv = JSON.parse(h.store['neurodeck_diag_log']).find((e) => e.n === 'error');
    assert.equal(errEv.d.code, 'STORAGE_WRITE_FAILED');
    assert.equal(errEv.d.message, 'QuotaExceededError');
    assert.equal(errEv.d.gen, 5, 'detail-поля сливаются плоско');
});

test('telemetry: кольцо ограничено 200 событиями, старые вытесняются', () => {
    const h = makeHarness();
    for (let i = 0; i < 250; i++) h.tel.event('evt_' + i);
    assert.equal(h.tel.ring().length, 200);
    assert.equal(h.tel.ring()[0].n, 'evt_50', '250 − 200 = 50 старых вытеснено');
});

test('telemetry: журнал и счётчики восстанавливаются после перезапуска (новая вкладка/сессия)', () => {
    const h1 = makeHarness();
    h1.tel.error('CLOUD_PUSH_FAILED', 'net down', {});
    const h2 = makeHarness({ store: h1.store });
    assert.equal(h2.tel.counters().error, 1, 'счётчик восстановлен');
    assert.ok(h2.tel.ring().some((e) => e.n === 'error'), 'событие восстановлено');
    const boot = h2.tel.ring().filter((e) => e.n === 'diag_boot').pop(); // новый boot, а не восстановленный из h1
    assert.ok(boot.d.events_restored >= 1, 'diag_boot показывает объём восстановления');
});

test('telemetry: битый журнал в localStorage не роняет старт', () => {
    const h = makeHarness({ store: { neurodeck_diag_log: '{broken json', neurodeck_diag_counters: 'garbage' } });
    assert.ok(Array.isArray(h.tel.ring()), 'кольцо живо');
    h.tel.event('save_ok');
    assert.equal(h.tel.counters().save_ok, 1, 'счётчик стартует с нуля');
});

test('telemetry: DOMContentLoaded регистрируется при loading и даёт dom_ready', () => {
    const h = makeHarness();
    assert.ok(h.listeners['DOMContentLoaded'] && h.listeners['DOMContentLoaded'].length === 1, 'слушатель зарегистрирован');
    assert.ok(!h.tel.ring().some((e) => e.n === 'dom_ready'), 'до готовности DOM события нет');
    h.listeners['DOMContentLoaded'][0]();
    assert.ok(h.tel.ring().some((e) => e.n === 'dom_ready'), 'после готовности событие есть');
});

test('telemetry: готовый документ (interactive) → dom_ready сразу', () => {
    const h = makeHarness({ readyState: 'interactive' });
    assert.ok(h.tel.ring().some((e) => e.n === 'dom_ready'));
});

test('telemetry: RUNTIME_ERROR ловится через window error-listener', () => {
    const h = makeHarness();
    const handler = h.listeners['error'][0];
    handler({ message: 'boom', filename: 'https://host/js/app.js', lineno: 42 });
    const errEv = h.tel.ring().filter((e) => e.n === 'error').pop();
    assert.equal(errEv.d.code, 'RUNTIME_ERROR');
    assert.equal(errEv.d.src, 'app.js', 'имя файла без пути');
    assert.equal(errEv.d.line, 42);
});

test('telemetry: данные событий санитизируются (строки обрезаются, объекты уплощаются)', () => {
    const h = makeHarness();
    h.tel.event('x', { s: 'z'.repeat(500), n: 7, deep: { a: 1 }, u: undefined });
    const ev = h.tel.ring().find((e) => e.n === 'x');
    assert.equal(ev.d.s.length, 200, 'строка обрезана');
    assert.equal(ev.d.n, 7);
    assert.equal(typeof ev.d.deep, 'string', 'объект приведён к строке');
    assert.equal('u' in ev.d, false, 'undefined отброшен');
});
