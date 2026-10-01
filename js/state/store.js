/* NeuroDeck State Store 2.0 — шаг 2 (P19): домены economy (полевая армия) и siege.
   Назначение: команды + ЧИСТЫЕ редьюсеры ПОВЕРХ существующих данных — стор не владеет
   состоянием, а работает по живым ссылкам (storage.js: ensureStrongholdState / applySyncData).
   Схема сейва v14 не меняется, новых полей нет. Редьюсеры возвращают НОВЫЙ объект только
   при реальном изменении; стор применяет результат НА МЕСТЕ (поля живого объекта
   перезаписываются, идентичность объектов сохраняется — и массива-элементов strongholds,
   и карты army.units) — поэтому все прямые ссылки app.js остаются валидными и поведение
   неизменно (characterization P17). Домен economy покрывает полевую армию { units, week }:
   казна HERO.gold вне снапшота-трио strongholds/army/siege, постройки живут в домене
   strongholds (sh/buildings:set, P18). Домен siege — жизненный цикл воскресной осады и
   штурма; UI-сеттеры стойки/подхода/пропусков остаются прямыми (хвост P20).
   snapshot() — живые ссылки трёх полей схемы v14 для storage-адаптера сейва.
   События 'nd:store:economy' / 'nd:store:siege' (NDDBus) — задел под UI-подписки шага 3 (P20).
   ES5, ноль зависимостей; typeof-гварды на NDDBus (extract-харнессы тянут модуль поодиночке). */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else { root.NDStore = factory(); root.NeuroDeckStateStore = root.NDStore; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STORE_VERSION = 2; // версия API стора (не путать со схемой сейва): P19 — домены eco/siege + snapshot()
    var MAX_STACKS = 7;    // тиров всего 7 (t1..t7) — как sanitizeGarrisonStacks в state-guards
    var MAX_COUNT = 1e6;

    function extend(target) { // Object.assign-заменa для ES5-чистоты модуля
        for (var i = 1; i < arguments.length; i++) {
            var src = arguments[i];
            if (!src || typeof src !== 'object') continue;
            for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
        }
        return target;
    }
    function isIdx(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && Math.floor(v) === v; }
    function isTier(t) { return typeof t === 'string' && /^t[1-7]$/.test(t); }
    function isBid(b) { return typeof b === 'string' && b.length > 0 && b.length <= 8; }

    // Гварды значений команд: фабрика мусор не пропускает — команда либо валидна, либо null
    // (null ⇒ dispatch молча вернёт false ⇒ вызывающий в app.js делает прежнюю прямую правку).
    function mk(type, fields, check) {
        return function () {
            var args = arguments, cmd = { type: type }, i;
            for (i = 0; i < fields.length; i++) cmd[fields[i]] = args[i];
            return check(cmd) ? cmd : null;
        };
    }
    var COMMANDS = {
        'sh/capture': mk('sh/capture', ['idx'], function (c) { return isIdx(c.idx); }),
        'sh/lose': mk('sh/lose', ['idx'], function (c) { return isIdx(c.idx); }), // осада взяла твердыню: captured=false, гарнизон [], постройки → ruin
        'sh/refuge': mk('sh/refuge', ['idx'], function (c) { return isIdx(c.idx); }), // анти-тупик: прибежище (captured=true, гарнизон [], постройки → ruin)
        'sh/restore-prefix': mk('sh/restore-prefix', ['to'], function (c) { return isIdx(c.to) && c.to > 0; }), // #49: первые N твердынь каталога снова захвачены
        'sh/garrison:set': mk('sh/garrison:set', ['idx', 'garrison'], function (c) { return isIdx(c.idx) && Array.isArray(c.garrison); }),
        'sh/garrison:add': mk('sh/garrison:add', ['idx', 'tier', 'n'], function (c) { return isIdx(c.idx) && isTier(c.tier) && c.n > 0 && isFinite(c.n); }),
        'sh/garrison:take-stack': mk('sh/garrison:take-stack', ['idx', 'tier'], function (c) { return isIdx(c.idx) && isTier(c.tier); }),
        'sh/build': mk('sh/build', ['idx', 'bid', 'at'], function (c) { return isIdx(c.idx) && isBid(c.bid); }), // buyBuilding: {built, ok, 0, builtAt}
        'sh/rebuild': mk('sh/rebuild', ['idx', 'bid', 'at'], function (c) { return isIdx(c.idx) && isBid(c.bid); }), // P7: восстановление worn/ruin — форма той же постройки
        'sh/buildings:set': mk('sh/buildings:set', ['idx', 'buildings'], function (c) { return isIdx(c.idx) && c.buildings && typeof c.buildings === 'object' && !Array.isArray(c.buildings); }),
        // ---- P19: домен economy — полевая армия { units, week } (казна/постройки — в своих доменах) ----
        'eco/army-loss': mk('eco/army-loss', ['losses'], function (c) { return c.losses && typeof c.losses === 'object' && !Array.isArray(c.losses); }), // аттриция штурма: дельты потерь по тирам (floor считает вызывающий — doAssault)
        'eco/army-add': mk('eco/army-add', ['tier', 'n'], function (c) { return isTier(c.tier) && c.n > 0 && isFinite(c.n); }), // найм в поле / возврат стопы из гарнизона (hireUnit/moveStack)
        'eco/army-zero': mk('eco/army-zero', ['tier'], function (c) { return isTier(c.tier); }), // перевод всей стопы тира в гарнизон (moveStack)
        // ---- P19: домен siege — жизненный цикл осады/штурма (UI-сеттеры стойки/подхода — прямые, хвост P20) ----
        'siege/week-reset': mk('siege/week-reset', [], function () { return true; }), // новый фронт: неделя с 1 (взятие твердыни / пустой фронт)
        'siege/week-advance': mk('siege/week-advance', ['fell'], function (c) { return c.fell === true || c.fell === false; }), // итог недели: fell → 1, иначе +1 (runWeeklySiege)
        'siege/result': mk('siege/result', ['result'], function (c) { return c.result === 'win' || c.result === 'fail'; }), // #95: исход недели для контрштурма
        'siege/assault-day': mk('siege/assault-day', ['day'], function (c) { return c.day === null || (typeof c.day === 'string' && c.day.length > 0 && c.day.length <= 10); }), // лимит «1 штурм в сутки» (ключ дня МСК; null — новый день)
        'siege/stores-spend': mk('siege/stores-spend', ['rams', 'ladders'], function (c) { return (c.rams === true || c.rams === false) && (c.ladders === true || c.ladders === false); }) // осадный склад тратится при штурме (таран/лестницы)
    };

    // Лёгкий санитайзер гарнизона — зеркало sanitizeGarrisonStacks (state-guards.js): мусорный
    // ввод не должен попасть в домен, но дублировать весь state-guards стор не обязан.
    function sanitizeGarrison(arr) {
        var out = [];
        (Array.isArray(arr) ? arr : []).forEach(function (u) {
            if (!u || typeof u !== 'object' || !isTier(u.tier)) return;
            var count = Math.round(Math.min(MAX_COUNT, Math.max(0, Number(u.count) || 0)));
            for (var i = 0; i < out.length; i++) {
                if (out[i].tier === u.tier) { out[i].count = Math.min(MAX_COUNT, out[i].count + count); return; }
            }
            if (out.length < MAX_STACKS) out.push({ tier: u.tier, count: count });
        });
        return out;
    }
    // Зеркало ruinAllBuildings (app.js): в руину деградируют только ПОСТРОЕНные здания
    function ruinBuildings(map) {
        var out = extend({}, map);
        Object.keys(out).forEach(function (id) {
            var b = out[id];
            if (b && typeof b === 'object' && b.built === true) out[id] = extend({}, b, { corruptionStage: 'ruin' });
        });
        return out;
    }
    function builtEntry(at) { // форма новой постройки — паттерн buyBuilding/rebuildBuilding (app.js)
        return { built: true, corruptionStage: 'ok', debtDays: 0, builtAt: (typeof at === 'number' && at > 0) ? at : null };
    }

    // ЧИСТЫЙ редьюсер домена: (список твердынь, команда) → новый список; без изменений — тот же
    // ссылочный список. Мутирует только свои свежие копии, вход не трогает.
    function withItem(list, idx, patch) {
        if (!isIdx(idx) || idx >= list.length) return list;
        var next = list.slice();
        next[idx] = extend({}, list[idx], patch);
        return next;
    }
    function strongholdReducer(list, cmd) {
        if (!Array.isArray(list) || !cmd || typeof cmd.type !== 'string') return list;
        var i, cur, g2, found;
        switch (cmd.type) {
            case 'sh/capture':
                return withItem(list, cmd.idx, { captured: true });
            case 'sh/lose':
                if (!isIdx(cmd.idx) || cmd.idx >= list.length) return list;
                return withItem(list, cmd.idx, { captured: false, garrison: [], buildings: ruinBuildings(list[cmd.idx].buildings || {}) });
            case 'sh/refuge':
                if (!isIdx(cmd.idx) || cmd.idx >= list.length) return list;
                return withItem(list, cmd.idx, { captured: true, garrison: [], buildings: ruinBuildings(list[cmd.idx].buildings || {}) });
            case 'sh/restore-prefix':
                var to = (isIdx(cmd.to)) ? Math.min(cmd.to, list.length) : 0;
                if (to <= 0) return list;
                var out = list.slice(), any = false;
                for (i = 0; i < to; i++) {
                    if (out[i] && out[i].captured !== true) { out[i] = extend({}, out[i], { captured: true }); any = true; }
                }
                return any ? out : list;
            case 'sh/garrison:set':
                if (!isIdx(cmd.idx) || cmd.idx >= list.length) return list;
                return withItem(list, cmd.idx, { garrison: sanitizeGarrison(cmd.garrison) });
            case 'sh/garrison:add':
                if (!isIdx(cmd.idx) || cmd.idx >= list.length || !isTier(cmd.tier) || !(cmd.n > 0) || !isFinite(cmd.n)) return list;
                cur = (list[cmd.idx] && Array.isArray(list[cmd.idx].garrison)) ? list[cmd.idx].garrison : [];
                g2 = cur.slice();
                found = -1;
                for (i = 0; i < g2.length; i++) if (g2[i] && g2[i].tier === cmd.tier) { found = i; break; }
                var n = Math.floor(cmd.n);
                if (found >= 0) g2[found] = { tier: cmd.tier, count: Math.min(MAX_COUNT, (g2[found].count || 0) + n) };
                else if (g2.length < MAX_STACKS) g2.push({ tier: cmd.tier, count: Math.min(MAX_COUNT, n) });
                else return list; // все 7 тиров уже в гарнизоне — нового тира быть не может
                return withItem(list, cmd.idx, { garrison: g2 });
            case 'sh/garrison:take-stack':
                if (!isIdx(cmd.idx) || cmd.idx >= list.length || !isTier(cmd.tier)) return list;
                cur = (list[cmd.idx] && Array.isArray(list[cmd.idx].garrison)) ? list[cmd.idx].garrison : [];
                found = false;
                for (i = 0; i < cur.length; i++) if (cur[i] && cur[i].tier === cmd.tier) { found = true; break; }
                if (!found) return list;
                return withItem(list, cmd.idx, { garrison: cur.filter(function (st) { return !st || st.tier !== cmd.tier; }) });
            case 'sh/build':
            case 'sh/rebuild':
                if (!isIdx(cmd.idx) || cmd.idx >= list.length || !isBid(cmd.bid)) return list;
                var b0 = extend({}, (list[cmd.idx] && list[cmd.idx].buildings) || {});
                b0[cmd.bid] = builtEntry(cmd.at);
                return withItem(list, cmd.idx, { buildings: b0 });
            case 'sh/buildings:set':
                if (!isIdx(cmd.idx) || cmd.idx >= list.length) return list;
                return withItem(list, cmd.idx, { buildings: extend({}, cmd.buildings) });
            default:
                return list; // неизвестная команда — домен не тронут
        }
    }

    // ---- P19: ЧИСТЫЙ редьюсер economy-домена — полевая армия (состояние, команда) → новое
    // состояние; без изменений — та же ссылка. Мутирует только свои свежие копии, вход не трогает.
    function economyReducer(state, cmd) {
        if (!state || typeof state !== 'object' || Array.isArray(state) || !cmd || typeof cmd.type !== 'string') return state;
        var units, cur;
        switch (cmd.type) {
            case 'eco/army-loss': // применяет дельты потерь; стопа не исчезает полностью (SPEC §4, зеркало floor-петли doAssault)
                units = extend({}, state.units || {});
                var lostAny = false;
                Object.keys(cmd.losses).forEach(function (t) {
                    if (!isTier(t)) return;
                    var loss = Math.round(Number(cmd.losses[t]) || 0);
                    cur = Number(units[t]) || 0;
                    if (loss > 0 && cur > 0) { units[t] = cur - Math.min(loss, cur - 1); lostAny = true; }
                });
                return lostAny ? extend({}, state, { units: units }) : state;
            case 'eco/army-add':
                units = extend({}, state.units || {});
                units[cmd.tier] = (Number(units[cmd.tier]) || 0) + Math.floor(cmd.n);
                return extend({}, state, { units: units });
            case 'eco/army-zero': // уже ноль — изменений нет (dispatch вернёт false, вызывающий делает прямую запись)
                if (!(Number((state.units || {})[cmd.tier]) > 0)) return state;
                units = extend({}, state.units || {});
                units[cmd.tier] = 0;
                return extend({}, state, { units: units });
            default:
                return state;
        }
    }

    // ---- P19: ЧИСТЫЙ редьюсер siege-домена — форма sanitizeSiege (state-guards.js), ключ за ключом.
    function siegeWeekOf(state) {
        return (typeof state.week === 'number' && isFinite(state.week) && state.week > 0) ? state.week : 1;
    }
    function siegeReducer(state, cmd) {
        if (!state || typeof state !== 'object' || Array.isArray(state) || !cmd || typeof cmd.type !== 'string') return state;
        switch (cmd.type) {
            case 'siege/week-reset': // идемпотентно: неделя уже 1 — та же ссылка
                return siegeWeekOf(state) === 1 ? state : extend({}, state, { week: 1 });
            case 'siege/week-advance': // потеря = счётчик фронта сброшен, победа +1 (runWeeklySiege)
                return extend({}, state, { week: cmd.fell ? 1 : siegeWeekOf(state) + 1 });
            case 'siege/result':
                return state.lastResult === cmd.result ? state : extend({}, state, { lastResult: cmd.result });
            case 'siege/assault-day':
                return state.assaultDay === cmd.day ? state : extend({}, state, { assaultDay: cmd.day });
            case 'siege/stores-spend': { // зеркалит doAssault: флаг ставит вызывающий, счётчик ниже нуля не уходит
                var rams = Math.max(0, Math.round(Number(state.rams) || 0));
                var ladders = Math.max(0, Math.round(Number(state.ladders) || 0));
                var spendR = cmd.rams && rams > 0, spendL = cmd.ladders && ladders > 0;
                if (!spendR && !spendL) return state;
                var patch = {};
                if (spendR) patch.rams = rams - 1;
                if (spendL) patch.ladders = ladders - 1;
                return extend({}, state, patch);
            }
            default:
                return state;
        }
    }

    // ---- Стор: живой источник (accessor), диспетчер, применяющий результат НА МЕСТЕ, селекторы ----
    var _source = null; // function () { return { strongholds: <живой массив>, army: <живой объект>, siege: <живой объект> } }

    function liveSource() {
        try {
            return (typeof _source === 'function') ? _source() : null;
        } catch (e) { return null; }
    }
    function liveList() {
        var src = liveSource();
        return (src && Array.isArray(src.strongholds)) ? src.strongholds : null;
    }
    function liveField(key) { // объектный домен (army/siege): accessor видит замену целиком без ре-бинда
        var src = liveSource();
        return (src && src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) ? src[key] : null;
    }
    function emitBus(evt, payload) { // задел под UI-подписки P20; шина может отсутствовать
        try {
            var bus = (typeof root !== 'undefined' && root.NDDBus) ? root.NDDBus
                : ((typeof globalThis !== 'undefined' && globalThis.NDDBus) ? globalThis.NDDBus : null);
            if (bus && typeof bus.emit === 'function') bus.emit(evt, payload);
        } catch (e) {}
    }
    function applyItem(live, next) { // на месте: идентичность объекта-твердыни сохраняется
        Object.keys(next).forEach(function (k) { live[k] = next[k]; });
    }
    function applyObj(live, next) { // на месте: идентичность объекта домена (siege) сохраняется
        Object.keys(next).forEach(function (k) { live[k] = next[k]; });
    }
    function applyArmy(live, next) { // на месте — и объект, и карта units (прямые ссылки army.units валидны)
        if (next.units && typeof next.units === 'object' && !Array.isArray(next.units)) {
            var lu = (live.units && typeof live.units === 'object' && !Array.isArray(live.units)) ? live.units : (live.units = {});
            Object.keys(lu).forEach(function (t) { if (!Object.prototype.hasOwnProperty.call(next.units, t)) delete lu[t]; });
            Object.keys(next.units).forEach(function (t) { lu[t] = next.units[t]; });
        }
        Object.keys(next).forEach(function (k) { if (k !== 'units') live[k] = next[k]; });
    }
    function dispatchSh(cmd) { // домен strongholds: применение НА МЕСТЕ по элементам массива
        var arr = liveList();
        if (!arr) return false;
        var next = strongholdReducer(arr, cmd);
        if (next === arr) return false; // команда ничего не изменила (мусор/вне диапазона)
        var changed = [];
        for (var i = 0; i < arr.length; i++) {
            if (next[i] !== arr[i]) { applyItem(arr[i], next[i]); changed.push(i); }
        }
        if (changed.length === 0) return false;
        emitBus('nd:store:stronghold', { type: cmd.type, changed: changed });
        return true;
    }
    function dispatchObj(field, evt, reducer, applier, cmd) { // объектные домены P19 (eco→army, siege)
        var live = liveField(field);
        if (!live) return false;
        var next = reducer(live, cmd);
        if (next === live) return false; // команда ничего не изменила
        applier(live, next);
        emitBus(evt, { type: cmd.type });
        return true;
    }
    function dispatch(cmd) { // маршрутизация по префиксу типа: sh/* → strongholds, eco/* → army, siege/* → siege
        if (!cmd || typeof cmd.type !== 'string') return false;
        var kind = cmd.type.split('/')[0];
        if (kind === 'siege') return dispatchObj('siege', 'nd:store:siege', siegeReducer, applyObj, cmd);
        if (kind === 'eco') return dispatchObj('army', 'nd:store:economy', economyReducer, applyArmy, cmd);
        return dispatchSh(cmd); // чужой префикс останется no-op: strongholdReducer вернёт тот же список
    }
    function command(name, a, b, c) { // безопасная фабрика по имени: неизвестное имя → null
        var f = COMMANDS[name];
        return (typeof f === 'function') ? f(a, b, c) : null;
    }

    return {
        STORE_VERSION: STORE_VERSION,
        COMMAND_TYPES: Object.keys(COMMANDS),
        command: command,
        strongholdReducer: strongholdReducer, // чистая — юнит-тесты
        economyReducer: economyReducer, // P19: чистая — юнит-тесты
        siegeReducer: siegeReducer, // P19: чистая — юнит-тесты
        bind: function (getSource) { if (typeof getSource === 'function') { _source = getSource; return true; } return false; },
        ready: function () { return liveList() !== null; },
        dispatch: dispatch,
        // селекторы чтения (живые данные; НЕ копии — адаптер app.js возвращает те же объекты)
        shList: function () { var arr = liveList(); return arr || []; },
        sh: function (idx) { var arr = liveList(); return (arr && isIdx(idx) && idx < arr.length) ? arr[idx] : null; },
        shCaptured: function (idx) { var s = this.sh(idx); return !!(s && s.captured === true); },
        capturedCount: function () { return this.shList().filter(function (s) { return s && s.captured === true; }).length; },
        frontIdx: function () { // линейный фронт (дефолт кампании, правило 13)
            var arr = this.shList();
            for (var i = 0; i < arr.length; i++) if (!arr[i] || arr[i].captured !== true) return i;
            return -1;
        },
        // ---- P19: селекторы economy-домена (полевая армия) ----
        armyState: function () { return liveField('army'); },
        armyUnits: function () { var a = this.armyState(); return (a && a.units && typeof a.units === 'object' && !Array.isArray(a.units)) ? a.units : {}; },
        armyTotal: function () { var u = this.armyUnits(), sum = 0; Object.keys(u).forEach(function (t) { if (isTier(t)) sum += (Number(u[t]) || 0); }); return sum; },
        // ---- P19: селекторы siege-домена ----
        siegeState: function () { return liveField('siege'); },
        siegeWeek: function () { var s = this.siegeState(); return (s && typeof s.week === 'number' && isFinite(s.week) && s.week > 0) ? s.week : 1; },
        siegeStores: function () { var s = this.siegeState(); return { rams: (s && Math.round(Number(s.rams)) > 0) ? Math.round(Number(s.rams)) : 0, ladders: (s && Math.round(Number(s.ladders)) > 0) ? Math.round(Number(s.ladders)) : 0 }; },
        // ---- P19: снапшот полей схемы v14 для storage-адаптера (живые ссылки, не копии) ----
        snapshot: function () {
            var src = liveSource();
            return {
                strongholds: (src && Array.isArray(src.strongholds)) ? src.strongholds : null,
                army: (src && src.army && typeof src.army === 'object' && !Array.isArray(src.army)) ? src.army : null,
                siege: (src && src.siege && typeof src.siege === 'object' && !Array.isArray(src.siege)) ? src.siege : null
            };
        }
    };
});
