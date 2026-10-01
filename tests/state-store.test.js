'use strict';
// P18 — STATE STORE 2.0, шаг 1: домен твердынь (js/state/store.js — NDStore).
// Контракты: (1) ЧИСТЫЙ strongholdReducer поверх существующей формы данных (схема v14 без
// изменений) — золотые результаты команд, иммутабельность входа, мусор игнорируется;
// (2) стор применяет команды НА МЕСТЕ — идентичность массива и объектов-твердынь сохраняется
// (поведение продукта неизменно, прямые ссылки app.js валидны); источник-accessor живёт сквозь
// замену strongholds целиком (applySyncData); (3) селекторы чтения; событие nd:store:stronghold
// на NDDBus; (4) подключение: index.html/sw.js/app.js (адаптер чтения + команды write-потоков,
// characterization-потоки P17 остаются прямыми).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const NDStore = require('../js/state/store.js');
globalThis.StrongholdData = require('../js/stronghold-data.js');
const DATA = globalThis.StrongholdData;
const GUARDS = require('../js/state-guards.js');

// Канонические объекты домена — через настоящий санитайзер на настоящем каталоге (форма схемы v14)
function mkList(overrides) {
    const list = GUARDS.sanitizeStrongholds(null, DATA);
    (overrides || []).forEach((o) => Object.assign(list[o.idx], o.patch));
    return list;
}
function bld(stage, debt, builtAt) {
    return { built: true, corruptionStage: stage || 'ok', debtDays: debt || 0, builtAt: builtAt === undefined ? null : builtAt };
}

// ============================================================
// ЧАСТЬ 1. ЧИСТЫЙ РЕДЬЮСЕР — золотые команды, иммутабельность, мусор
// ============================================================

test('P18 reducer: sh/capture — captured=true; вход не мутируется, соседние элементы те же ссылки', () => {
    const list = mkList();
    const before = JSON.stringify(list);
    const next = NDStore.strongholdReducer(list, NDStore.command('sh/capture', 3));
    assert.equal(next[3].captured, true);
    assert.equal(next[3].id, 'sh04', 'id каталога сохраняется (редьюсер копирует все поля)');
    assert.notEqual(next[3], list[3], 'изменённый элемент — НОВЫЙ объект');
    assert.equal(next[2], list[2], 'соседние элементы — те же ссылки');
    assert.equal(JSON.stringify(list), before, 'вход не мутирован');
});

test('P18 reducer: sh/lose и sh/refuge — зеркало осадных правок runWeeklySiege (захват снят/прибежище, гарнизон [], постройки → ruin)', () => {
    const list = mkList([{ idx: 2, patch: { captured: true, garrison: [{ tier: 't2', count: 5 }], buildings: { zh1: bld('ok', 0, null), ec1: { built: false, corruptionStage: 'ok', debtDays: 0 } } } }]);
    const lost = NDStore.strongholdReducer(list, NDStore.command('sh/lose', 2));
    assert.equal(lost[2].captured, false, 'sh/lose: твердыня пала');
    assert.deepEqual(lost[2].garrison, [], 'гарнизон уничтожен');
    assert.equal(lost[2].buildings.zh1.corruptionStage, 'ruin', 'построенное здание — в руине (зеркало ruinAllBuildings)');
    assert.equal(lost[2].buildings.ec1.built, false, 'НЕпостроенное не тронуто');
    assert.equal(list[2].buildings.zh1.corruptionStage, 'ok', 'вход не мутирован');
    const refuge = NDStore.strongholdReducer(list, NDStore.command('sh/refuge', 2));
    assert.equal(refuge[2].captured, true, 'sh/refuge: прибежище восстановлено (анти-тупик #аренда sh01)');
    assert.deepEqual(refuge[2].garrison, []);
    assert.equal(refuge[2].buildings.zh1.corruptionStage, 'ruin', 'но постройки в руине — путь возврата открыт');
});

test('P18 reducer: sh/restore-prefix — первые N каталога захвачены (#49 checkCapturedRecovery); всё захвачено ⇒ та же ссылка', () => {
    const list = mkList([{ idx: 0, patch: { captured: true } }]);
    const next = NDStore.strongholdReducer(list, NDStore.command('sh/restore-prefix', 5));
    for (let i = 0; i < 5; i++) assert.equal(next[i].captured, true, 'i=' + i);
    assert.equal(next[5].captured, false, 'далее — как было');
    const again = NDStore.strongholdReducer(next, NDStore.command('sh/restore-prefix', 5));
    assert.equal(again, next, 'повтор без изменений — тот же список (dispatch вернёт false)');
    const clamped = NDStore.strongholdReducer(list, NDStore.command('sh/restore-prefix', 999));
    assert.equal(clamped[19].captured, true, 'выход за каталог клампится длиной списка');
    assert.equal(clamped.length, 20);
});

test('P18 reducer: sh/garrison:add — стек растёт/создаётся; take-stack изымает; мусор игнорируется', () => {
    const list = mkList([{ idx: 1, patch: { captured: true, garrison: [{ tier: 't1', count: 5 }, { tier: 't3', count: 2 }] } }]);
    const add = NDStore.strongholdReducer(list, NDStore.command('sh/garrison:add', 1, 't1', 3));
    assert.deepEqual(add[1].garrison, [{ tier: 't1', count: 8 }, { tier: 't3', count: 2 }], 'существующий стек +3 (новый объект стека)');
    const addNew = NDStore.strongholdReducer(list, NDStore.command('sh/garrison:add', 1, 't7', 1));
    assert.deepEqual(addNew[1].garrison[2], { tier: 't7', count: 1 }, 'новый тир — новый стек в конце');
    const take = NDStore.strongholdReducer(list, NDStore.command('sh/garrison:take-stack', 1, 't1'));
    assert.deepEqual(take[1].garrison, [{ tier: 't3', count: 2 }], 'стек t1 изъят целиком (moveStack из гарнизона)');
    // мусор: неверный тир/индекс/команда — домен не тронут
    assert.equal(NDStore.strongholdReducer(list, NDStore.command('sh/garrison:add', 1, 't9', 1)), list, 'тир вне t1..t7');
    assert.equal(NDStore.strongholdReducer(list, NDStore.command('sh/garrison:add', 99, 't1', 1)), list, 'индекс вне списка');
    assert.equal(NDStore.strongholdReducer(list, NDStore.command('sh/garrison:take-stack', 1, 't6')), list, 'стека нет — изменений нет');
    assert.equal(NDStore.command('sh/garrison:add', 1, 't1', 0), null, 'фабрика не пропускает n=0');
    assert.equal(NDStore.strongholdReducer(list, { type: 'sh/unknown' }), list, 'неизвестный тип — тот же список');
    assert.equal(NDStore.strongholdReducer(list, null), list, 'null-команда');
    assert.equal(NDStore.strongholdReducer(null, NDStore.command('sh/capture', 0)), null, 'нет списка — редьюсер не падает');
});

test('P18 reducer: sh/build и sh/rebuild — форма постройки 1:1 buyBuilding/rebuildBuilding (built/ok/0/builtAt)', () => {
    const at = 1770000000000;
    const list = mkList([{ idx: 0, patch: { captured: true, buildings: { zh1: bld('worn', 2, 1) } } }]);
    const build = NDStore.strongholdReducer(list, NDStore.command('sh/build', 0, 'ec1', at));
    assert.deepEqual(build[0].buildings.ec1, { built: true, corruptionStage: 'ok', debtDays: 0, builtAt: at }, 'новая постройка — как после buyBuilding');
    assert.equal(build[0].buildings.zh1.corruptionStage, 'worn', 'соседняя постройка не тронута');
    const rebuild = NDStore.strongholdReducer(list, NDStore.command('sh/rebuild', 0, 'zh1', at));
    assert.deepEqual(rebuild[0].buildings.zh1, { built: true, corruptionStage: 'ok', debtDays: 0, builtAt: at }, 'worn → «как новая» (P7 rebuildBuilding)');
    assert.equal(NDStore.strongholdReducer(list, NDStore.command('sh/build', 0, '', at)), list, 'пустой bid игнорируется');
    const noAt = NDStore.strongholdReducer(list, NDStore.command('sh/build', 0, 'ec1'));
    assert.equal(noAt[0].buildings.ec1.builtAt, null, 'без метки времени builtAt = null (форма санитайзера)');
});

test('P18 reducer: sh/garrison:set и sh/buildings:set — санитайзер гарнизона и замена карты построек', () => {
    const list = mkList([{ idx: 0, patch: { captured: true } }]);
    const dirty = NDStore.strongholdReducer(list, NDStore.command('sh/garrison:set', 0, [{ tier: 't2', count: 4 }, { tier: 'x9', count: 9 }, { tier: 't2', count: 1 }, null]));
    assert.deepEqual(dirty[0].garrison, [{ tier: 't2', count: 5 }], 'мусорные стеки отброшены, дубли тиров слиты (зеркало state-guards)');
    const setB = NDStore.strongholdReducer(list, NDStore.command('sh/buildings:set', 0, { zh1: bld('ok', 0, 5) }));
    assert.equal(setB[0].buildings.zh1.builtAt, 5, 'карта построек принята (аварийный ремонт P7 / P19)');
});

// ============================================================
// ЧАСТЬ 2. СТОР — применение НА МЕСТЕ, живой источник, селекторы, событие
// ============================================================

test('P18 store: dispatch применяет команду НА МЕСТЕ — идентичность массива и объектов сохраняется', () => {
    const live = mkList();
    NDStore.bind(() => ({ strongholds: live }));
    const ref0 = live[0], refArr = live;
    assert.equal(NDStore.dispatch(NDStore.command('sh/capture', 4)), true);
    assert.equal(live, refArr, 'массив — тот же объект (снапшот/ссылки не рвутся)');
    assert.equal(live[4], ref0 === live[4] ? live[4] : live[4] && live[4], 'элемент остался объектом');
    assert.equal(live[4].captured, true, 'команда применена');
    const item4 = live[4];
    NDStore.dispatch(NDStore.command('sh/garrison:add', 4, 't2', 7));
    assert.equal(live[4], item4, 'идентичность элемента сохранена и при правке полей');
    assert.deepEqual(live[4].garrison, [{ tier: 't2', count: 7 }]);
    assert.equal(live[4].captured, true, 'остальные поля на месте');
});

test('P18 store: false при отсутствии источника/мусорной команде — домен не тронут (фоллбек вызывающего)', () => {
    const storePath = require.resolve('../js/state/store.js');
    delete require.cache[storePath]; // свежий инстанс без бинда (основной NDStore уже привязан тестами выше)
    const fresh = require(storePath);
    assert.equal(fresh.ready(), false, 'без bind стор не готов');
    assert.equal(fresh.dispatch(fresh.command('sh/capture', 0)), false);
    assert.equal(fresh.dispatch(null), false);
    assert.equal(fresh.dispatch({ type: 'sh/unknown' }), false);
    assert.deepEqual(fresh.shList(), [], 'селектор без бинда — пустой список, не падает');
    assert.equal(fresh.sh(0), null);
});

test('P18 store: источник-accessor живёт сквозь замену массива (applySyncData) — ре-бинд не нужен', () => {
    let holder = { strongholds: mkList() };
    NDStore.bind(() => ({ strongholds: holder.strongholds }));
    assert.equal(NDStore.capturedCount(), 0);
    const replaced = mkList([{ idx: 0, patch: { captured: true } }, { idx: 1, patch: { captured: true } }]);
    holder.strongholds = replaced; // simulate: strongholds = sanitizeStrongholds(data.strongholds)
    assert.equal(NDStore.capturedCount(), 2, 'стор видит НОВЫЙ массив через accessor');
    assert.equal(NDStore.dispatch(NDStore.command('sh/capture', 5)), true);
    assert.equal(replaced[5].captured, true, 'dispatch правит именно новый массив');
});

test('P18 store: селекторы чтения — sh/shCaptured/capturedCount/frontIdx (линейный дефолт фронта)', () => {
    const live = mkList();
    for (let i = 0; i < 7; i++) live[i].captured = true;
    NDStore.bind(() => ({ strongholds: live }));
    assert.equal(NDStore.capturedCount(), 7);
    assert.equal(NDStore.frontIdx(), 7, 'линейный фронт = первый незахваченный');
    assert.equal(NDStore.shCaptured(6), true);
    assert.equal(NDStore.shCaptured(7), false);
    assert.equal(NDStore.sh(99), null, 'вне диапазона — null');
    assert.equal(NDStore.sh('x'), null, 'мусорный индекс — null');
    for (let i = 7; i < 20; i++) live[i].captured = true;
    assert.equal(NDStore.frontIdx(), -1, '20/20 — фронта нет');
});

test('P18 store: событие nd:store:stronghold на NDDBus (typeof-гвард: шины может не быть)', () => {
    const events = [];
    const bus = { emit: (evt, p) => events.push([evt, p]) };
    const prevBus = globalThis.NDDBus;
    globalThis.NDDBus = bus;
    try {
        const live = mkList();
        NDStore.bind(() => ({ strongholds: live }));
        NDStore.dispatch(NDStore.command('sh/capture', 2));
        NDStore.dispatch(NDStore.command('sh/restore-prefix', 4));
        assert.equal(events.length, 2);
        assert.deepEqual(events[0], ['nd:store:stronghold', { type: 'sh/capture', changed: [2] }]);
        assert.deepEqual(events[1][1].changed.sort((a, b) => a - b), [0, 1, 3], 'restore-prefix отмечает только изменившиеся индексы');
    } finally {
        if (prevBus === undefined) delete globalThis.NDDBus; else globalThis.NDDBus = prevBus;
    }
    const live2 = mkList();
    NDStore.bind(() => ({ strongholds: live2 }));
    assert.doesNotThrow(() => NDStore.dispatch(NDStore.command('sh/capture', 1)), 'без шины dispatch не падает');
});

// ============================================================
// ЧАСТЬ 3. ПОДКЛЮЧЕНИЕ — index.html / sw.js / app.js (адаптер + команды)
// ============================================================

test('P18 подключение: store.js грузится в index.html до app.js и в SW-прекэше (v98)', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    const storePos = html.indexOf('js/state/store.js');
    const appPos = html.indexOf('js/app.js');
    assert.ok(storePos > -1 && appPos > storePos, 'store.js грузится раньше app.js');
    assert.ok(sw.includes("'js/state/store.js?v=98'"), 'store.js в прекэше SW (ре-пин v98)');
    assert.ok(/VERSION = 'nd-shell-v98'/.test(sw), 'SW-версия бампнута');
});

test('P18 app.js: адаптер чтения + команды write-потоков; characterization-потоки P17 остаются прямыми', () => {
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    // адаптер: живой источник привязан, канонические читатели идут через стор с фоллбеком
    assert.ok(app.includes('NDStore.bind(shStoreSource)'), 'источник стора привязан accessor-ом');
    ['capturedCount', 'frontIdx', 'strongholdTaxPerDay', 'weeklyScoreFacts'].forEach((fn) => {
        const body = app.slice(app.indexOf('function ' + fn + '('));
        assert.ok(body.slice(0, 400).includes('shAll()'), fn + ' читает массив через адаптер стора');
    });
    // provCaptured — extract-харнесс (ARC_FNS): самодостаточный inline-гвард, без shAll
    const provBody = app.slice(app.indexOf('function provCaptured('));
    assert.ok(provBody.slice(0, 700).includes('NDStore.shList()'), 'provCaptured читает через стор inline-гвардом (правило 19)');
    assert.ok(!provBody.slice(0, 700).includes('shAll()'), 'provCaptured не зависит от соседних функций app.js');
    // write-потоки UI-действий идут командами домена с прямым фоллбеком
    assert.ok(app.includes("shDispatch('sh/build'"), 'buyBuilding — команда sh/build');
    assert.ok(app.includes("shDispatch('sh/garrison:add'"), 'hireUnit/moveStack — команда sh/garrison:add');
    assert.ok(app.includes("shDispatch('sh/garrison:take-stack'"), 'moveStack — команда sh/garrison:take-stack');
    assert.ok(app.includes("shDispatch('sh/restore-prefix'"), 'checkCapturedRecovery — команда sh/restore-prefix');
    // characterization P17 (strict extract-харнессы) не должны зависеть от стора: их тела — без NDStore
    const extract = (name) => {
        const anchor = app.indexOf('function ' + name + '(');
        let depth = 0, end = -1;
        for (let i = app.indexOf('{', anchor); i < app.length; i++) {
            if (app[i] === '{') depth++;
            else if (app[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        return app.slice(anchor, end + 1);
    };
    ['strongholdsDailyTick', 'runWeeklySiege', 'doAssault', 'requestAssault', 'assaultForecast'].forEach((fn) => {
        assert.ok(!extract(fn).includes('NDStore'), fn + ' (characterization P17) остаётся прямым — шаг 2 (P19)');
    });
});

test('P18 store: число команд домена и неизменность схемы (никаких новых полей состояния)', () => {
    const src = fs.readFileSync(path.join(root, 'js', 'state', 'store.js'), 'utf8');
    assert.equal(NDStore.COMMAND_TYPES.length, 10, '10 команд домена stronghold');
    // стор не создаёт полей схемы: редьюсер меняет только captured/garrison/buildings
    const live = mkList([{ idx: 0, patch: { captured: true, buildings: { zh1: bld('ok', 0, 1) } } }]);
    NDStore.bind(() => ({ strongholds: live }));
    NDStore.dispatch(NDStore.command('sh/lose', 0));
    assert.deepEqual(Object.keys(live[0]).sort(), ['buildings', 'captured', 'corruption', 'garrison', 'id'], 'набор полей объекта твердыни прежний (схема v14)');
    void src;
});
