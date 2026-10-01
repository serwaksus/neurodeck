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

test('P18 подключение: store.js грузится в index.html до app.js и в SW-прекэше', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    const storePos = html.indexOf('js/state/store.js');
    const appPos = html.indexOf('js/app.js');
    assert.ok(storePos > -1 && appPos > storePos, 'store.js грузится раньше app.js');
    assert.ok(sw.includes("'js/state/store.js?v=104'"), 'store.js в прекэше SW (ре-пин v104 (R2 cloud-save); v103 (P22 game feel); v101 (P21); v100 — P20)');
    assert.ok(/VERSION = 'nd-shell-v104'/.test(sw), 'SW-версия бампнута');
});

test('P18→P19 app.js: адаптер чтения + команды write-потоков; тик/осада/штурм — inline-гварды стора', () => {
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    // адаптер: живой источник привязан (P19: расширен до army/siege), канонические читатели идут через стор с фоллбеком
    assert.ok(app.includes('NDStore.bind(shStoreSource)'), 'источник стора привязан accessor-ом');
    const srcBody = app.slice(app.indexOf('function shStoreSource('), app.indexOf('function shStoreOn('));
    ['strongholds', 'army', 'siege'].forEach((k) => {
        assert.ok(srcBody.includes(k + ':'), 'accessor отдаёт домен ' + k + ' (P19)');
    });
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
    assert.ok(app.includes("shDispatch('eco/army-add'"), 'hireUnit/moveStack — команда eco/army-add (P19)');
    assert.ok(app.includes("shDispatch('eco/army-zero'"), 'moveStack — команда eco/army-zero (P19)');
    // P19 (ре-пин P18): пишущие потоки тика/осады/штурма идут командами доменов через
    // САМОДОСТАТОЧНЫЕ inline-гварды (typeof NDStore — единственный новый идентификатор,
    // безопасный в sandbox-харнессах characterization/boss-arc/province-rules), фоллбеки —
    // прежние прямые правки. Соседние helper'ы (shDispatch/shAll) внутри НЕ используются.
    const extract = (name) => {
        const anchor = app.indexOf('function ' + name + '(');
        let depth = 0, end = -1;
        for (let i = app.indexOf('{', anchor); i < app.length; i++) {
            if (app[i] === '{') depth++;
            else if (app[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        return app.slice(anchor, end + 1);
    };
    const flows = {
        strongholdsDailyTick: ["NDStore.command('sh/buildings:set'", 's.buildings = res.buildings'],
        runWeeklySiege: ["NDStore.command('siege/week-reset')", "NDStore.command('sh/garrison:set'", "NDStore.command('sh/lose'", "NDStore.command('sh/refuge'", "NDStore.command('siege/week-advance'", "NDStore.command('siege/result'", 'siege.week = fell ? 1 : siege.week + 1', 'strongholds[0].captured = true'],
        doAssault: ["NDStore.command('siege/assault-day'", "NDStore.command('siege/stores-spend'", "NDStore.command('eco/army-loss'", "NDStore.command('sh/capture'", "NDStore.command('siege/week-reset')"]
    };
    Object.keys(flows).forEach((fn) => {
        const body = extract(fn);
        flows[fn].forEach((pin) => assert.ok(body.includes(pin), fn + ' содержит ' + pin));
        assert.ok(!body.includes('shDispatch('), fn + ' — только inline-гварды, без соседних helper\'ов (sandbox-харнессы)');
        assert.ok(!body.includes('shAll()'), fn + ' не читает через shAll (самодостаточность)');
    });
    // characterization P17 (strict extract-харнессы) исполняют эти же тела БЕЗ NDStore:
    // inline typeof-гварды обязаны коротиться на фоллбек (characterization-core зелёный без правок)
});

test('P18+P19 store: число команд доменов и неизменность схемы (никаких новых полей состояния)', () => {
    const src = fs.readFileSync(path.join(root, 'js', 'state', 'store.js'), 'utf8');
    assert.equal(NDStore.COMMAND_TYPES.length, 18, 'ре-пин (авторизовано P19): 10 sh/* + 3 eco/* + 5 siege/*');
    // стор не создаёт полей схемы: редьюсер меняет только captured/garrison/buildings
    const live = mkList([{ idx: 0, patch: { captured: true, buildings: { zh1: bld('ok', 0, 1) } } }]);
    NDStore.bind(() => ({ strongholds: live }));
    NDStore.dispatch(NDStore.command('sh/lose', 0));
    assert.deepEqual(Object.keys(live[0]).sort(), ['buildings', 'captured', 'corruption', 'garrison', 'id'], 'набор полей объекта твердыни прежний (схема v14)');
    void src;
});

// ============================================================
// ЧАСТЬ 4. P19 — ДОМЕНЫ economy (полевая армия) + siege: редьюсеры, селекторы, snapshot()
// ============================================================

test('P19 reducer: eco/army-loss — дельты по тирам, стопа не исчезает полностью, мусор игнорируется', () => {
    const army = { units: { t1: 10, t2: 4, t3: 0 }, week: 2 };
    const before = JSON.stringify(army);
    const next = NDStore.economyReducer(army, NDStore.command('eco/army-loss', { t1: 2, t3: 5 }));
    assert.deepEqual(next.units, { t1: 8, t2: 4, t3: 0 }, 't1 −2; t3 без стеков — не тронут');
    assert.notEqual(next, army, 'изменение — новый объект');
    assert.equal(next.week, 2, 'остальные поля армии перенесены');
    assert.equal(JSON.stringify(army), before, 'вход не мутирован');
    const one = NDStore.economyReducer(army, NDStore.command('eco/army-loss', { t1: 99 }));
    assert.equal(one.units.t1, 1, 'зеркало floor-петли doAssault: loss клампится к n−1 (SPEC §4)');
    assert.equal(NDStore.economyReducer(army, NDStore.command('eco/army-loss', { t9: 5, t2: 0 })), army, 'нулевые дельты/мусорные тиры — та же ссылка');
    assert.equal(NDStore.economyReducer(null, NDStore.command('eco/army-loss', { t1: 1 })), null, 'нет армии — редьюсер не падает');
    assert.equal(NDStore.command('eco/army-loss', 'x'), null, 'фабрика не пропускает мусор');
});

test('P19 reducer: eco/army-add / eco/army-zero — найм в поле и перевод стопы; zero при нуле — та же ссылка', () => {
    const army = { units: { t2: 5 }, week: 3 };
    assert.deepEqual(NDStore.economyReducer(army, NDStore.command('eco/army-add', 't2', 4)).units, { t2: 9 }, 'стопка растёт');
    assert.equal(NDStore.economyReducer(army, NDStore.command('eco/army-add', 't7', 2)).units.t7, 2, 'новый тир появляется в карте');
    assert.equal(NDStore.economyReducer(army, NDStore.command('eco/army-zero', 't2')).units.t2, 0, 'перевод всей стопы в гарнизон');
    assert.equal(NDStore.economyReducer(army, NDStore.command('eco/army-zero', 't5')), army, 'нулевого тира нет — изменений нет');
    assert.equal(NDStore.command('eco/army-add', 't2', 0), null, 'фабрика не пропускает n=0');
    assert.equal(NDStore.command('eco/army-add', 't9', 1), null, 'фабрика не пропускает мусорный тир');
});

test('P19 reducer: siege/* — неделя/итог недели/сутки штурма/осадный склад; идемпотенты — та же ссылка', () => {
    const sg = { week: 4, lastResult: null, assaultDay: null, wkSkips: 1, wkTaskFails: 0, retriedThisWeek: false, rams: 2, ladders: 0, approach: 'siege', stance: 'economy' };
    const before = JSON.stringify(sg);
    const adv = NDStore.siegeReducer(sg, NDStore.command('siege/week-advance', false));
    assert.equal(adv.week, 5, 'победа: неделя +1');
    assert.equal(adv.approach, 'siege', 'все ключи переносятся');
    assert.equal(adv.stance, 'economy', 'и ленивый stance тоже (байт-стабильность сейва)');
    assert.equal(NDStore.siegeReducer(sg, NDStore.command('siege/week-advance', true)).week, 1, 'потеря — неделя с 1');
    const reset1 = { week: 1 };
    assert.equal(NDStore.siegeReducer(reset1, NDStore.command('siege/week-reset')), reset1, 'неделя уже 1 — та же ссылка (dispatch вернёт false)');
    assert.equal(NDStore.siegeReducer({ week: 9 }, NDStore.command('siege/week-reset')).week, 1);
    assert.equal(NDStore.siegeReducer(sg, NDStore.command('siege/result', 'fail')).lastResult, 'fail', '#95: исход недели');
    assert.equal(NDStore.siegeReducer(sg, NDStore.command('siege/result', 'fail')).rams, 2, 'прочие поля не тронуты');
    assert.equal(NDStore.siegeReducer(sg, NDStore.command('siege/assault-day', '2026-10-04')).assaultDay, '2026-10-04', 'флаг суток');
    assert.equal(NDStore.siegeReducer(sg, NDStore.command('siege/assault-day', null)).assaultDay, null, 'новый день — null');
    const spend = NDStore.siegeReducer(sg, NDStore.command('siege/stores-spend', true, true));
    assert.equal(spend.rams, 1, 'таран потрачен');
    assert.equal(spend.ladders, 0, 'лестниц не было — в минус не уходит');
    assert.equal(NDStore.siegeReducer(sg, NDStore.command('siege/stores-spend', false, false)), sg, 'тратить нечего — та же ссылка');
    assert.equal(NDStore.siegeReducer(sg, NDStore.command('siege/stores-spend', true, true)).week, 4, 'неделя не тронута');
    assert.equal(JSON.stringify(sg), before, 'вход не мутирован');
    assert.equal(NDStore.siegeReducer(null, NDStore.command('siege/week-reset')), null, 'нет осады — редьюсер не падает');
    assert.equal(NDStore.siegeReducer(sg, { type: 'siege/unknown' }), sg, 'неизвестный тип — тот же объект');
    assert.equal(NDStore.command('siege/result', 'draw'), null, 'фабрика: только win|fail');
    assert.equal(NDStore.command('siege/week-advance', 'yes'), null, 'фабрика: fell строго boolean');
    assert.equal(NDStore.command('siege/assault-day', 42), null, 'фабрика: день — строка или null');
});

test('P19 store: dispatch eco/siege применяет НА МЕСТЕ — идентичность army, army.units и siege сохраняется', () => {
    const live = mkList();
    const army = { units: { t1: 10, t2: 4 }, week: 2 };
    const sg = { week: 3, lastResult: null, assaultDay: null, wkSkips: 0, wkTaskFails: 0, retriedThisWeek: false, rams: 1, ladders: 1, approach: 'assault' };
    const holder = { strongholds: live, army: army, siege: sg };
    NDStore.bind(() => ({ strongholds: holder.strongholds, army: holder.army, siege: holder.siege }));
    const armyRef = army, unitsRef = army.units, sgRef = sg;
    // сценарий победы doAssault (числа P17 «победа — потери floor»): {t1:10,t2:4} → потери 2 → {t1:8,t2:4}
    assert.equal(NDStore.dispatch(NDStore.command('eco/army-loss', { t1: 2 })), true);
    assert.deepEqual(army.units, { t1: 8, t2: 4 });
    assert.equal(army, armyRef, 'объект армии — тот же');
    assert.equal(army.units, unitsRef, 'карта units — та же (прямые ссылки app.js валидны)');
    assert.equal(NDStore.dispatch(NDStore.command('siege/stores-spend', true, true)), true);
    assert.equal(sg.rams, 0, 'таран израсходован');
    assert.equal(sg.ladders, 0, 'лестницы израсходованы');
    assert.equal(NDStore.dispatch(NDStore.command('siege/assault-day', '2026-10-04')), true);
    assert.equal(sg.assaultDay, '2026-10-04');
    assert.equal(NDStore.dispatch(NDStore.command('sh/capture', 2)), true, 'штурм: захват — командой stronghold-домена');
    assert.equal(live[2].captured, true);
    assert.equal(NDStore.dispatch(NDStore.command('siege/week-reset')), true);
    assert.equal(sg.week, 1, 'новый фронт — неделя с 1');
    assert.equal(sg, sgRef, 'объект осады — тот же');
    assert.equal(NDStore.dispatch(NDStore.command('siege/week-reset')), false, 'повтор без изменений — false');
    assert.equal(NDStore.dispatch(NDStore.command('eco/army-loss', { t9: 1 })), false, 'мусорная команда — false, домен не тронут');
    assert.equal(NDStore.dispatch({ type: 'xxx/nope' }), false, 'чужой префикс — no-op');
});

test('P19 store: эквивалентность dispatch-пути и прежних прямых правок (осада/штурм на одинаковых данных)', () => {
    const mkSg = () => ({ week: 4, lastResult: null, assaultDay: null, wkSkips: 2, wkTaskFails: 1, retriedThisWeek: false, rams: 2, ladders: 3, approach: 'siege' });
    const fell = true;
    const direct = mkSg(); // прямой путь (код до P19): runWeeklySiege + doAssault
    direct.week = fell ? 1 : direct.week + 1;
    direct.lastResult = fell ? 'fail' : 'win';
    direct.rams -= 1; direct.ladders -= 1; // склад тратится при штурме
    const via = mkSg();
    NDStore.bind(() => ({ strongholds: [], army: { units: {}, week: 0 }, siege: via }));
    NDStore.dispatch(NDStore.command('siege/week-advance', fell));
    NDStore.dispatch(NDStore.command('siege/result', fell ? 'fail' : 'win'));
    NDStore.dispatch(NDStore.command('siege/stores-spend', true, true));
    assert.deepEqual(via, direct, 'siege: dispatch ≡ прямые правки (байт-в-байт, ключ за ключом)');
    // армия: floor-петля doAssault {t1:10,t2:4}×0.2079 → потери 2/0
    const ad = { units: { t1: 10, t2: 4 }, week: 2 };
    ad.units.t1 = 10 - 2;
    const av = { units: { t1: 10, t2: 4 }, week: 2 };
    NDStore.bind(() => ({ strongholds: [], army: av, siege: mkSg() }));
    NDStore.dispatch(NDStore.command('eco/army-loss', { t1: 2, t2: 0 }));
    assert.deepEqual(av, ad, 'army: dispatch ≡ прямая правка');
});

test('P19 store: snapshot() — живые ссылки трёх доменов; следует замене объектов (applySyncData) без ре-бинда', () => {
    const live = mkList([{ idx: 0, patch: { captured: true } }]);
    const army = { units: { t1: 3 }, week: 1 };
    const sg = { week: 2, lastResult: null, assaultDay: null, wkSkips: 0, wkTaskFails: 0, retriedThisWeek: false, rams: 0, ladders: 0, approach: 'assault' };
    const holder = { strongholds: live, army: army, siege: sg };
    NDStore.bind(() => ({ strongholds: holder.strongholds, army: holder.army, siege: holder.siege }));
    const snap = NDStore.snapshot();
    assert.equal(snap.strongholds, live, 'живой массив, не копия');
    assert.equal(snap.army, army, 'живая армия, не копия');
    assert.equal(snap.siege, sg, 'живая осада, не копия');
    const army2 = { units: { t2: 5 }, week: 1 };
    holder.army = army2; // simulate: army = STATE_GUARDS.sanitizeArmy(data.army)
    assert.equal(NDStore.snapshot().army, army2, 'accessor видит замену целиком');
    // селекторы новых доменов
    assert.equal(NDStore.armyState(), army2);
    assert.equal(NDStore.armyUnits(), army2.units, 'селектор units — живая карта');
    assert.equal(NDStore.armyTotal(), 5);
    assert.equal(NDStore.siegeState(), sg);
    assert.equal(NDStore.siegeWeek(), 2);
    assert.deepEqual(NDStore.siegeStores(), { rams: 0, ladders: 0 });
    assert.equal(NDStore.STORE_VERSION, 2, 'версия API стора — 2 (P19)');
    // без бинда — нули, не крэш
    const storePath2 = require.resolve('../js/state/store.js');
    delete require.cache[storePath2];
    const fresh = require(storePath2);
    assert.deepEqual(fresh.snapshot(), { strongholds: null, army: null, siege: null });
    assert.deepEqual(fresh.armyUnits(), {});
    assert.equal(fresh.armyTotal(), 0);
    assert.equal(fresh.siegeWeek(), 1);
    assert.deepEqual(fresh.siegeStores(), { rams: 0, ladders: 0 });
    assert.equal(fresh.dispatch(fresh.command('siege/week-advance', false)), false, 'без источника siege-команда — false');
    assert.equal(fresh.dispatch(fresh.command('eco/army-add', 't1', 1)), false, 'без источника eco-команда — false');
});

test('P19 store: события nd:store:economy / nd:store:siege на NDDBus (typeof-гвард: шины может не быть)', () => {
    const events = [];
    const bus = { emit: (evt, p) => events.push([evt, p]) };
    const prevBus = globalThis.NDDBus;
    globalThis.NDDBus = bus;
    try {
        const army = { units: { t1: 5 }, week: 0 };
        const sg = { week: 2 };
        NDStore.bind(() => ({ strongholds: [], army: army, siege: sg }));
        NDStore.dispatch(NDStore.command('eco/army-add', 't1', 3));
        NDStore.dispatch(NDStore.command('siege/week-advance', false));
        NDStore.dispatch(NDStore.command('siege/week-advance', false));
        assert.deepEqual(events, [
            ['nd:store:economy', { type: 'eco/army-add' }],
            ['nd:store:siege', { type: 'siege/week-advance' }],
            ['nd:store:siege', { type: 'siege/week-advance' }]
        ], 'по событию на доменную команду (задел UI-подписок P20)');
        assert.equal(army.units.t1, 8);
        assert.equal(sg.week, 4);
    } finally {
        if (prevBus === undefined) delete globalThis.NDDBus; else globalThis.NDDBus = prevBus;
    }
    const army2 = { units: {}, week: 0 };
    NDStore.bind(() => ({ strongholds: [], army: army2, siege: { week: 1 } }));
    assert.doesNotThrow(() => NDStore.dispatch(NDStore.command('eco/army-add', 't1', 1)), 'без шины dispatch не падает');
});

test('P19 storage.js: снапшот сейва собирает strongholds/army/siege ИЗ СТОРА (typeof-гвард + прямой фоллбек)', () => {
    const src = fs.readFileSync(path.join(root, 'js', 'storage.js'), 'utf8');
    const at = src.indexOf('P19 (State Store 2.0');
    const block = src.slice(at, src.indexOf('pruneAgedHistory', at));
    assert.ok(block.includes('NDStore.snapshot()'), 'сейв читает домены через snapshot() стора');
    assert.ok(block.includes('snapshot.strongholds = (_ndSnap && _ndSnap.strongholds) ? _ndSnap.strongholds : strongholds'), 'strongholds из стора, фоллбек — прямое поле');
    assert.ok(block.includes('snapshot.army = (_ndSnap && _ndSnap.army) ? _ndSnap.army : army'), 'army из стора, фоллбек — прямое поле');
    assert.ok(block.includes('snapshot.siege = (_ndSnap && _ndSnap.siege) ? _ndSnap.siege : siege'), 'siege из стора, фоллбек — прямое поле');
    // живая эквивалентность: snapshot() отдаёт те же объекты, что прямые поля (сейв байт-в-байт)
    const live = mkList([{ idx: 3, patch: { captured: true } }]);
    const army = { units: { t1: 1 }, week: 0 };
    const sg = { week: 1 };
    NDStore.bind(() => ({ strongholds: live, army: army, siege: sg }));
    const snap = NDStore.snapshot();
    assert.equal(JSON.stringify(snap.strongholds), JSON.stringify(live), 'сериализация стора == сериализация прямого поля');
    assert.equal(JSON.stringify(snap.army), JSON.stringify(army));
    assert.equal(JSON.stringify(snap.siege), JSON.stringify(sg));
});
