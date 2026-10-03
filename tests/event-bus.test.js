'use strict';
// Фаза 2 (шаг state-store №1): событийная шина NDDBus.
// Контракты: on/emit/off, падение подписчика не роняет эмиттера и соседей,
// payload по умолчанию — объект, лимит подписчиков с варном, storage.js не зовёт UI напрямую.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'event-bus.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'js', 'storage.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

function makeBus() {
    const warns = [];
    const fakeConsole = { warn: (m) => warns.push(m) };
    const fn = new Function('console', src + '; return (typeof window !== "undefined") ? window.NDDBus : globalThis.NDDBus;')(fakeConsole);
    return { bus: fn, warns };
}

test('event-bus: on → emit → подписчик получает payload; без подписчиков emit тих', () => {
    const { bus } = makeBus();
    let got = null;
    bus.on('nd:state-applied', (p) => { got = p; });
    bus.emit('nd:state-applied', { gen: 7 });
    assert.deepEqual(got, { gen: 7 });
    assert.doesNotThrow(() => bus.emit('nd:unknown-event', { x: 1 }));
});

test('event-bus: без payload подписчик получает объект (не undefined)', () => {
    const { bus } = makeBus();
    let got = 'unset';
    bus.on('e', (p) => { got = p; });
    bus.emit('e');
    assert.deepEqual(got, {});
});

test('event-bus: off() отписывает; падение подписчика изолировано от соседей', () => {
    const { bus } = makeBus();
    let calls = 0;
    const off = bus.on('evt', () => { calls++; });
    bus.on('evt', () => { throw new Error('boom'); }); // упавший — не роняет второй
    bus.on('evt', () => { calls++; });
    bus.emit('evt');
    assert.equal(calls, 2, 'оба живых подписчика вызваны');
    off();
    bus.emit('evt');
    assert.equal(calls, 3, 'после off первый больше не зовётся, третий сработал снова (2+1)');
});

test('event-bus: лимит подписчиков — варн в консоль, но подписка работает', () => {
    const { bus, warns } = makeBus();
    for (let i = 0; i < 24; i++) bus.on('hot', () => {});
    assert.equal(warns.length, 0, 'до лимита тихо');
    bus.on('hot', () => {});
    assert.equal(warns.length, 1, '25-й подписчик даёт варн об утечке');
    assert.equal(bus.listenerCount('hot'), 25);
});

test('storage.js: applySyncData и multi-tab-синк больше не зовут UI напрямую (шаг state-store)', () => {
    assert.ok(!/\brenderCards\(\)/.test(storage), 'storage.js свободен от прямых render-вызовов');
    assert.ok(storage.includes("emit('nd:state-applied'"), 'storage эмитит nd:state-applied');
    assert.ok(app.includes("NDDBus.on('nd:state-applied'"), 'app.js подписан на nd:state-applied');
    // состав рендеров подписки 1:1 с прежним прямым блоком
    const sub = app.slice(app.indexOf("NDDBus.on('nd:state-applied'"));
    ['renderCards()', 'renderStats()', 'updateHeroUI()', 'renderGoals()', 'renderBackpack()', 'renderSlots()', 'updateTotalBonuses()', 'renderStrongholds()', 'updateStrongholdProgress()', 'renderTasks()', 'renderDashboard()'].forEach((fn) => {
        assert.ok(sub.includes(fn), 'подписка рендерит: ' + fn);
    });
});

test('event-bus подключён в index.html до storage.js и в SW-прекэш', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    const busPos = html.indexOf('js/event-bus.js');
    const storagePos = html.indexOf('js/storage.js');
    assert.ok(busPos > -1 && storagePos > busPos, 'event-bus грузится раньше storage');
    assert.ok(sw.includes("'js/event-bus.js?v=158'"), 'event-bus в прекэше SW'); // ре-пин при бампе кэш-версии (v102, P22 game feel; v101 — P21 аудио-микшер)
});
