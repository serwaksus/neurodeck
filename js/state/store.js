/* NeuroDeck State Store 2.0 — шаг 1 (P18): домен твердынь.
   Назначение: команды + ЧИСТЫЙ strongholdReducer ПОВЕРХ существующих данных — стор не владеет
   состоянием, а работает по живым ссылкам массива strongholds (storage.js: ensureStrongholdState /
   applySyncData). Схема сейва v14 не меняется, новых полей нет. Редьюсер возвращает НОВЫЙ массив
   с новыми объектами только для изменённых твердынь; стор применяет результат НА МЕСТЕ
   (поля живого объекта перезаписываются, идентичность объектов-элементов и массива сохраняется) —
   поэтому все прямые ссылки app.js остаются валидными и поведение неизменно (characterization P17).
   Источник привязывается accessor-функцией: applySyncData заменяет strongholds целиком, и стор
   обязан видеть актуальный массив без ре-бинда. Событие 'nd:store:stronghold' (NDDBus) — задел
   под UI-подписки шага 3 (P20). Шаг 2 (P19): economy/siege reducers + storage-адаптер.
   ES5, ноль зависимостей; typeof-гварды на NDDBus (extract-харнессы тянут модуль поодиночке). */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else { root.NDStore = factory(); root.NeuroDeckStateStore = root.NDStore; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STORE_VERSION = 1; // версия API стора (не путать со схемой сейва)
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
        'sh/buildings:set': mk('sh/buildings:set', ['idx', 'buildings'], function (c) { return isIdx(c.idx) && c.buildings && typeof c.buildings === 'object' && !Array.isArray(c.buildings); })
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

    // ---- Стор: живой источник (accessor), диспетчер, применяющий результат НА МЕСТЕ, селекторы ----
    var _source = null; // function () { return { strongholds: <живой массив> } }

    function liveList() {
        try {
            var src = (typeof _source === 'function') ? _source() : null;
            return (src && Array.isArray(src.strongholds)) ? src.strongholds : null;
        } catch (e) { return null; }
    }
    function emitChanged(cmd, changed) { // задел под UI-подписки P20; шина может отсутствовать
        try {
            var bus = (typeof root !== 'undefined' && root.NDDBus) ? root.NDDBus
                : ((typeof globalThis !== 'undefined' && globalThis.NDDBus) ? globalThis.NDDBus : null);
            if (bus && typeof bus.emit === 'function') bus.emit('nd:store:stronghold', { type: cmd.type, changed: changed });
        } catch (e) {}
    }
    function applyItem(live, next) { // на месте: идентичность объекта-твердыни сохраняется
        Object.keys(next).forEach(function (k) { live[k] = next[k]; });
    }
    function dispatch(cmd) {
        var arr = liveList();
        if (!arr || !cmd || typeof cmd.type !== 'string') return false;
        var next = strongholdReducer(arr, cmd);
        if (next === arr) return false; // команда ничего не изменила (мусор/вне диапазона)
        var changed = [];
        for (var i = 0; i < arr.length; i++) {
            if (next[i] !== arr[i]) { applyItem(arr[i], next[i]); changed.push(i); }
        }
        if (changed.length === 0) return false;
        emitChanged(cmd, changed);
        return true;
    }
    function command(name, a, b, c) { // безопасная фабрика по имени: неизвестное имя → null
        var f = COMMANDS[name];
        return (typeof f === 'function') ? f(a, b, c) : null;
    }

    return {
        STORE_VERSION: STORE_VERSION,
        COMMAND_TYPES: Object.keys(COMMANDS),
        command: command,
        strongholdReducer: strongholdReducer, // чистая — юнит-тесты/P19
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
        }
    };
});
