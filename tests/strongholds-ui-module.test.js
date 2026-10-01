'use strict';
// P20 «State Store 2.0, шаг 3»: рендеры Твердынь вынесены из app.js в js/ui/strongholds.js,
// доменные подписки (nd:store:stronghold / nd:store:economy / nd:store:siege) — через NDDBus.
// Здесь пинятся: (1) состав модуля и отсутствие дублей в app.js; (2) порядок загрузки
// (после event-bus, до app.js) и место в прекэше SW; (3) поведение подписок на РЕАЛЬНОЙ шине —
// рефреш только активной вкладки «Твердыни», исключения рендера не роняют подписчика.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const ui = read('js/ui/strongholds.js');
const app = read('js/app.js');
const html = read('index.html');
const sw = read('sw.js');

function extractUiBlock(anchor) {
    const start = ui.indexOf(anchor);
    assert.ok(start > -1, 'anchor not found in ui module: ' + anchor);
    let depth = 0, end = -1;
    for (let i = ui.indexOf('{', start); i < ui.length; i++) {
        if (ui[i] === '{') depth++;
        else if (ui[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > -1, 'unbalanced braces after: ' + anchor);
    return ui.slice(start, end + 1);
}
const extractUiFn = (name) => extractUiBlock('function ' + name + '(');

// ----------------------------------------------------------------
// 1) Состав модуля: рендеры Твердынь живут здесь и только здесь
// ----------------------------------------------------------------
test('P20 модуль: 8 функций рендера объявлены в js/ui/strongholds.js и убраны из app.js', () => {
    ['renderStrongholds', 'renderStrongholdPanel', 'html_strongholds_banner', 'shSpriteImg',
     'catClass', 'builtTileHtml', 'buyTileHtml', 'stageBadgeHtml'
    ].forEach((fn) => {
        const re = new RegExp('function\\s+' + fn + '\\s*\\(');
        assert.ok(re.test(ui), fn + ' объявлена в ui-модуле');
        assert.equal(re.test(app), false, fn + ' больше НЕ объявлена в app.js (перенос P20)');
    });
    // app.js по-прежнему зовёт рендеры как глобальные функции модуля (грузится раньше)
    assert.ok(app.includes('renderStrongholds();'), 'вызовы рендера в app.js сохранены');
});

// ----------------------------------------------------------------
// 2) Подключение: после event-bus (нужен NDDBus на момент загрузки), до app.js
// ----------------------------------------------------------------
test('P20 подключение: index.html грузит ui-модуль между event-bus и app.js; SW прекэшит его', () => {
    const busPos = html.indexOf('js/event-bus.js?v=');
    const uiPos = html.indexOf('js/ui/strongholds.js?v=');
    const appPos = html.indexOf('js/app.js?v=');
    assert.ok(busPos > -1 && uiPos > busPos, 'ui-модуль грузится после event-bus');
    assert.ok(appPos > uiPos, 'ui-модуль грузится до app.js (глобальные функции готовы к вызову)');
    assert.ok(/'js\/ui\/strongholds\.js\?v=\d+',/.test(sw), 'js/ui/strongholds.js в прекэше SW');
    assert.ok(/const VERSION = 'nd-shell-v\d+';/.test(sw), 'VERSION SW на месте');
});

// ----------------------------------------------------------------
// 3) Доменные подписки: РЕАЛЬНАЯ шина (js/event-bus.js) + извлечённые функции модуля
// ----------------------------------------------------------------
function mkUiSandbox(docActive) {
    delete require.cache[require.resolve('../js/event-bus.js')];
    require('../js/event-bus.js'); // регистрирует globalThis.NDDBus
    const bus = globalThis.NDDBus;
    assert.ok(bus && typeof bus.on === 'function' && typeof bus.emit === 'function', 'шина загружена');
    let renders = 0;
    const fakeDoc = {
        getElementById: (id) => (id === 'view-strongholds')
            ? { classList: { contains: (c) => docActive && c === 'active' } }
            : null
    };
    const events = ['nd:store:stronghold', 'nd:store:economy', 'nd:store:siege']; // те же, что в исходнике (пин ниже)
    const decls = [extractUiFn('ndShUiActive'), extractUiFn('ndShUiRerender'), extractUiFn('ndShUiBind')].join('\n');
    const api = new Function('document', 'renderStrongholds', 'ND_SH_UI_EVENTS', 'NDDBus',
        decls + '\nreturn { bind: ndShUiBind, rerender: ndShUiRerender, active: ndShUiActive };')(
        fakeDoc, () => { renders++; }, events, bus);
    return { bus: bus, api: api, renders: () => renders };
}

test('P20 исходник: подписка на все три доменных события стора, без шины — тихий ноль', () => {
    ['nd:store:stronghold', 'nd:store:economy', 'nd:store:siege'].forEach((evt) =>
        assert.ok(ui.includes("'" + evt + "'"), 'событие в списке ND_SH_UI_EVENTS: ' + evt));
    const noBus = new Function('document', 'renderStrongholds', 'ND_SH_UI_EVENTS', 'NDDBus',
        [extractUiFn('ndShUiActive'), extractUiFn('ndShUiRerender'), extractUiFn('ndShUiBind')].join('\n')
        + '\nreturn ndShUiBind;')(null, () => {}, ['nd:store:stronghold'], null);
    assert.equal(noBus(null), 0, 'шины нет — без исключений, 0 подписок');
    assert.equal(noBus({ on: 'не функция' }), 0, 'мусорная шина — 0');
});

test('P20 подписки: событие стора перерисовывает ТОЛЬКО активную вкладку «Твердыни»', () => {
    const h = mkUiSandbox(true);
    assert.equal(h.api.bind(h.bus), 3, 'подписались на все три домена');
    h.bus.emit('nd:store:stronghold', { type: 'sh/capture', changed: [2] });
    h.bus.emit('nd:store:economy', { type: 'eco/army-add' });
    h.bus.emit('nd:store:siege', { type: 'siege/week-advance', fell: false });
    assert.equal(h.renders(), 3, 'каждое событие → один рефреш');
    assert.equal(h.bus.listenerCount('nd:store:stronghold'), 1, 'без дублей подписок');

    const off = mkUiSandbox(false); // вкладка не активна
    off.api.bind(off.bus);
    off.bus.emit('nd:store:stronghold', {});
    off.bus.emit('nd:store:siege', {});
    assert.equal(off.renders(), 0, 'скрытая вкладка не перерисовывается');
});

test('P20 подписки: упавший рендер не роняет подписчика (try/catch), флаг возврата честный', () => {
    delete require.cache[require.resolve('../js/event-bus.js')];
    require('../js/event-bus.js'); // IIFE без экспорта — шину берём с globalThis
    const bus = globalThis.NDDBus;
    let boom = false;
    const decls = [extractUiFn('ndShUiActive'), extractUiFn('ndShUiRerender'), extractUiFn('ndShUiBind')].join('\n');
    const api = new Function('document', 'renderStrongholds', 'ND_SH_UI_EVENTS', 'NDDBus',
        decls + '\nreturn { bind: ndShUiBind, rerender: ndShUiRerender };')(
        { getElementById: () => ({ classList: { contains: () => true } }) },
        () => { if (boom) throw new Error('render fail'); },
        ['nd:store:stronghold'], bus);
    assert.equal(api.bind(bus), 1);
    assert.equal(api.rerender(), true, 'здоровый рендер — true');
    boom = true;
    assert.equal(api.rerender(), false, 'рендер упал — false, исключение проглочено');
    bus.emit('nd:store:stronghold', {}); // подписчик жив: emit не бросает
    assert.ok(true);
});
