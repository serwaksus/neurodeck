/* NeuroDeck telemetry (фаза 0 «Trust», 2026-09-29):
   — локальный diagnostic ring buffer: последние события + счётчики;
   — типизированные коды ошибок вместо безмолвных catch {};
   — ПРИВАТНОСТЬ: ничего не отправляется по сети. Журнал живёт в памяти и
     localStorage (neurodeck_diag_log / neurodeck_diag_counters), читается
     через NDTelemetry.dump() в консоли и выезжает вместе с бэкапом только
     по явному действию игрока. Ключи с префиксом neurodeck_ стираются
     resetAllData() автоматически.
   Схема событий и кодов ошибок: docs/operations/TELEMETRY.md. */
(function () {
    'use strict';
    var MAX_EVENTS = 200;       // ёмкость кольца: ~25 КБ JSON в localStorage
    var DEDUPE_MS = 2000;       // повтор того же имени < 2 c — только в счётчик, не в кольцо
    var LS_LOG_KEY = 'neurodeck_diag_log';
    var LS_COUNTER_KEY = 'neurodeck_diag_counters';

    var hasLS = false;
    try { hasLS = typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { hasLS = false; }
    var hasWindow = typeof window !== 'undefined' && !!window;

    var events = [];
    var counters = {};
    var lastByName = {}; // name → ts последнего попадания в кольцо (для дедупа)
    var dirty = false;
    var flushTimer = null;

    function lsGet(key) {
        if (!hasLS) return null;
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function lsSet(key, val) {
        if (!hasLS) return;
        try { localStorage.setItem(key, val); } catch (e) {} // квота — журнал не должен ронять игру
    }

    function load() {
        try {
            var rawLog = lsGet(LS_LOG_KEY);
            if (rawLog) {
                var arr = JSON.parse(rawLog);
                if (Array.isArray(arr)) events = arr.filter(function (e) { return e && typeof e === 'object'; }).slice(-MAX_EVENTS);
            }
        } catch (e) { events = []; } // битый журнал — не блокируем старт
        try {
            var rawCnt = lsGet(LS_COUNTER_KEY);
            if (rawCnt) {
                var cnt = JSON.parse(rawCnt);
                if (cnt && typeof cnt === 'object') counters = cnt;
            }
        } catch (e) { counters = {}; }
    }

    // В событие попадают только плоские примитивы: защита от мусора и циклических ссылок.
    function sanitizeData(data) {
        if (data === undefined || data === null) return undefined;
        if (typeof data !== 'object') {
            return (typeof data === 'string') ? data.slice(0, 200) : data;
        }
        var out = {};
        var keys = Object.keys(data).slice(0, 8);
        for (var i = 0; i < keys.length; i++) {
            var v = data[keys[i]];
            if (v === undefined) continue; // undefined не создаёт поле в событии
            if (v === null || typeof v === 'number' || typeof v === 'boolean') out[keys[i]] = v;
            else if (typeof v === 'string') out[keys[i]] = v.slice(0, 200);
            else {
                try { out[keys[i]] = JSON.stringify(v).slice(0, 60); }
                catch (e2) { out[keys[i]] = String(v).slice(0, 60); }
            }
        }
        return out;
    }

    function bumpCounter(name) {
        counters[name] = (counters[name] || 0) + 1;
    }

    function record(name, data, isError) {
        var now = Date.now();
        bumpCounter(name);
        var isRepeat = lastByName[name] !== undefined && (now - lastByName[name]) < DEDUPE_MS && !isError;
        if (!isRepeat) {
            events.push({ t: now, n: name, d: sanitizeData(data) });
            if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
            lastByName[name] = now;
        }
        if (isError) { flush(); return; } // ошибка → пишем немедленно, чтобы пережила крах вкладки
        if (!dirty) {
            dirty = true;
            flushTimer = setTimeout(function () { flush(); }, 3000);
        }
    }

    function flush() {
        if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
        dirty = false;
        lsSet(LS_LOG_KEY, JSON.stringify(events));
        lsSet(LS_COUNTER_KEY, JSON.stringify(counters));
    }

    // ---------- публичный API ----------
    var api = {
        event: function (name, data) {
            try { if (typeof name === 'string' && name) record(name, data, false); } catch (e) {}
        },
        error: function (code, message, detail) {
            try {
                if (typeof code !== 'string' || !code) return;
                var data = { code: code, message: String(message || '').slice(0, 200) };
                if (detail && typeof detail === 'object') {
                    var dkeys = Object.keys(detail).slice(0, 6);
                    for (var i = 0; i < dkeys.length; i++) data[dkeys[i]] = detail[dkeys[i]]; // плоско: detail.src, detail.line читаются напрямую
                } else if (detail !== undefined && detail !== null) {
                    data.detail = detail;
                }
                record('error', data, true);
            } catch (e) {}
        },
        counters: function () { return Object.assign({}, counters); },
        ring: function () { return events.slice(); },
        dump: function () {
            var nav = (typeof navigator !== 'undefined' && navigator) ? navigator.userAgent : '';
            return { ts: Date.now(), ua: nav, href: hasWindow && window.location ? window.location.href : '', counters: this.counters(), events: this.ring() };
        },
        clear: function () {
            events = []; counters = {}; lastByName = {};
            lsSet(LS_LOG_KEY, JSON.stringify(events));
            lsSet(LS_COUNTER_KEY, JSON.stringify(counters));
        },
        flush: flush
    };

    // ---------- самодиагностика среды ----------
    function captureRuntimeErrors() {
        if (!hasWindow) return;
        window.addEventListener('error', function (e) {
            api.error('RUNTIME_ERROR', (e && e.message) || 'unknown', {
                src: (e && e.filename ? String(e.filename).split('/').pop() : ''),
                line: (e && e.lineno) || 0
            });
        });
        window.addEventListener('unhandledrejection', function (e) {
            var r = e && e.reason;
            api.error('UNHANDLED_REJECTION', (r && (r.message || String(r))) || 'unknown', {});
        });
        // гарантированный сброс журнала при уходе со страницы (Telegram закрывает WebView резко)
        window.addEventListener('pagehide', function () { try { flush(); } catch (e) {} });
        try {
            if (typeof document !== 'undefined' && document.addEventListener) {
                document.addEventListener('visibilitychange', function () {
                    if (document.visibilityState === 'hidden') { try { flush(); } catch (e) {} }
                });
            }
        } catch (e) {}
    }

    // ---------- запуск ----------
    load();
    try { captureRuntimeErrors(); } catch (e) {} // экзотический WebView не должен ронять сам журнал
    api.event('diag_boot', { events_restored: events.length });
    if (hasWindow) {
        if (typeof document !== 'undefined' && document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', function () { api.event('dom_ready'); });
        } else {
            api.event('dom_ready');
        }
    }

    if (hasWindow) window.NDTelemetry = api;
    if (typeof globalThis !== 'undefined') globalThis.NDTelemetry = api;
})();
