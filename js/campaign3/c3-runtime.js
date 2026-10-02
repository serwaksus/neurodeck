// Кампания 3.0, Ф1 — клей между чистой моделью и игрой: флаг, состояние, хуки дел/срывов/смены суток, действия UI.
// Фабрика create(env) — чтобы тестировать в Node без браузера; в браузере создаётся глобал NDC3.
// При выключенном флаге всё — no-op, состояние не создаётся и в сейв не попадает.
(function(root, factory) {
    var D = (typeof module === 'object' && module.exports) ? require('./c3-data.js') : root.NeuroDeckC3Data;
    var M = (typeof module === 'object' && module.exports) ? require('./c3-model.js') : root.NeuroDeckC3Model;
    var api = factory(D, M);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else if (root && D && M) root.NDC3 = api.create(api.browserEnv(root));
})(typeof globalThis !== 'undefined' ? globalThis : this, function(D, M) {
    'use strict';

    var FLAG_KEY = 'nd_c3';
    var MAX_CATCHUP_DAYS = 28;

    function browserEnv(w) {
        return {
            getFlag: function() {
                try {
                    var m = /[?&]c3=([01])\b/.exec(w.location.search || '');
                    if (m) { if (m[1] === '1') w.localStorage.setItem(FLAG_KEY, '1'); else w.localStorage.removeItem(FLAG_KEY); }
                    return w.localStorage.getItem(FLAG_KEY) === '1';
                } catch (e) { return false; }
            },
            dayKey: function() { return w.getMSKDayKey(); },
            cardsStarted: function() { try { return (w.FORGED || []).filter(function(c) { return c && c.firstCompletedAt; }).length; } catch (e) { return 0; } },
            sanitize: function(raw) { return w.STATE_GUARDS ? w.STATE_GUARDS.sanitizeC3(raw) : null; },
            save: function() { if (typeof w.saveGameState === 'function') w.saveGameState(); },
            render: function() { if (typeof w.renderCampaign3 === 'function') w.renderCampaign3(); },
            toast: function(t, b, k) { if (typeof w.showToast === 'function') w.showToast(t, b, k || 'save'); }
        };
    }

    function dayDiffAdd(day, n) { var d = new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000); return d.toISOString().slice(0, 10); }
    function isMonday(day) { return new Date(Date.parse(day + 'T00:00:00Z')).getUTCDay() === 1; }
    function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

    function create(env) {
        var flag = null, state = null;
        function enabled() { if (flag === null) flag = !!env.getFlag(); return flag; }
        function ensure() {
            if (!enabled()) return null;
            if (!state) state = M.newState(env.dayKey());
            return state;
        }
        var api = {
            enabled: enabled,
            getState: function() { return state; },
            ensure: ensure,
            serialize: function() { return state || undefined; }, // нет состояния → ключа в сейве нет (флаг никогда не включали)
            load: function(raw) { var s = env.sanitize(raw); if (s) state = s; return !!s; },
            reset: function() { state = null; },

            // ----- хуки из app.js (все под enabled()) -----
            onDeed: function(deed) { // deed: {kind:'habit'|'task', stat?, rank?}
                if (!ensure()) return null;
                var d = { kind: deed.kind, sphere: deed.kind === 'habit' ? (D.SPHERE_OF_STAT[deed.stat] || null) : 'body', rank: deed.rank };
                var r = M.applyDeed(state, d);
                if (r.comeback) env.toast('🗺 Возвращение', 'Первое дело после перерыва даёт ×2 очков движения');
                env.render();
                return r;
            },
            onHonestSkip: function() { if (ensure()) state.pend.h++; },
            onSilentMisses: function(n) { if (ensure()) state.pend.s += Math.max(0, Math.floor(n) || 0); },
            onTaskOverdue: function(n) { if (ensure()) state.pend.o += Math.max(0, Math.floor(n) || 0); },

            // Закрывает сутки (и пропущенные дни без открытия приложения) до todayKey. Вызывается из checkDailyReset.
            dayEnd: function(todayKey) {
                if (!ensure()) return { days: 0 };
                var gap = daysBetween(state.day, todayKey), closed = 0;
                if (gap <= 0) return { days: 0 };
                if (gap > MAX_CATCHUP_DAYS) state.day = dayDiffAdd(todayKey, -MAX_CATCHUP_DAYS);
                var weekly = null;
                while (state.day < todayKey) {
                    var next = dayDiffAdd(state.day, 1), input;
                    if (closed === 0) input = { silent: state.pend.s, honest: state.pend.h, overdue: state.pend.o };
                    else input = { silent: Math.min(3, env.cardsStarted()), honest: 0, overdue: 0 }; // день без открытия приложения — молчание
                    state.pend = { s: 0, h: 0, o: 0 };
                    M.dayEnd(state, next, input);
                    if (isMonday(next)) weekly = M.weekEnd(state);
                    closed++;
                }
                if (weekly && weekly.raid) env.toast(weekly.raid.win ? '🦥 Лень отбила узел' : '🛡 Набег Лени отбит', weekly.raid.win ? 'Верни его — тени растут от пропусков' : 'Закалка и дисциплина держат границу', weekly.raid.win ? 'blood' : 'save');
                env.render();
                return { days: closed, weekly: weekly };
            },

            // ----- действия игрока (UI) -----
            act: {
                travel: function(node) { if (!ensure()) return null; var r = M.travel(state, node); env.save(); env.render(); return r; },
                engage: function(node) {
                    if (!ensure()) return null;
                    var r = M.engage(state, node); env.save(); env.render();
                    if (r.ok) env.toast(r.win ? '⚔ Победа' : '💢 Штурм отбит', state.log.length ? state.log[state.log.length - 1].t : '', r.win ? 'save' : 'blood');
                    return r;
                },
                hire: function(tier, n) { if (!ensure()) return null; var r = M.hire(state, tier, n); env.save(); env.render(); return r; },
                forge: function() { if (!ensure()) return null; var r = M.buyForge(state); env.save(); env.render(); return r; }
            }
        };
        return api;
    }

    return { create: create, browserEnv: browserEnv, FLAG_KEY: FLAG_KEY };
});
