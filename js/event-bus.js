/* NeuroDeck event bus (фаза 2 AAA-плана, шаг state-store №1).
   Назначение: развязать слои — storage больше не зовёт UI напрямую,
   UI подписывается на события состояния. Команды/события домена (COMPLETE_CARD,
   STRONGHOLD_CAPTURED…) пойдут через этот же канал по мере декомпозиции app.js.
   Схема именования: 'nd:<domain>:<event>', payload — плоский объект.
   ES5, без зависимостей; listeners не роняют эмиттера. */
(function () {
    'use strict';
    var MAX_LISTENERS_PER_EVENT = 24; // утечка подписок должна быть видна, а не молча копиться
    var listeners = {};
    var bus = {
        on: function (evt, fn) {
            if (typeof evt !== 'string' || !evt || typeof fn !== 'function') return function () {};
            var arr = listeners[evt] = listeners[evt] || [];
            if (arr.length >= MAX_LISTENERS_PER_EVENT) {
                try { console.warn('[NDDBus] слишком много подписчиков на ' + evt + ' (>=' + MAX_LISTENERS_PER_EVENT + ') — вероятна утечка'); } catch (e) {}
            }
            arr.push(fn);
            return function off() { // отписка: возврат функцией, как в современных шинах
                var i = arr.indexOf(fn);
                if (i >= 0) arr.splice(i, 1);
            };
        },
        emit: function (evt, payload) {
            var arr = listeners[evt];
            if (!arr || !arr.length) return;
            arr.slice().forEach(function (fn) {
                try { fn(payload || {}); } catch (e) {
                    try { console.warn('[NDDBus] подписчик ' + evt + ' упал:', e && e.message); } catch (e2) {}
                }
            });
        },
        listenerCount: function (evt) { return (listeners[evt] || []).length; },
        _events: function () { return Object.keys(listeners); } // диагностика/тесты
    };
    if (typeof window !== 'undefined') window.NDDBus = bus;
    if (typeof globalThis !== 'undefined') globalThis.NDDBus = bus;
})();
