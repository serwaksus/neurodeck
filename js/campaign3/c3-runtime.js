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
            takeStash: function() { var r = w.__ndC3Raw; w.__ndC3Raw = undefined; return r; },
            legacySource: function() { // что осталось от твердынь 2.0 — для «Наследия» (читается один раз при создании карты)
                try {
                    var cap = 0; (typeof strongholds !== 'undefined' && strongholds ? strongholds : []).forEach(function(x) { if (x && x.captured) cap++; });
                    return { stats: typeof STATS !== 'undefined' ? STATS : {}, captured: cap, units: (typeof army !== 'undefined' && army && army.units) ? army.units : {},
                        bosses: (typeof HERO !== 'undefined' && HERO.bosses && HERO.bosses.defeated) ? HERO.bosses.defeated.length : 0,
                        seasonNum: (typeof season !== 'undefined' && season) ? season.num : 1, throne: typeof throne !== 'undefined' ? throne : 0, ascension: (typeof HERO !== 'undefined' && HERO.ascension) || 0 };
                } catch (e) { return {}; }
            },
            sphereRanks: function(sphere) { // ранги лучших карточек сферы (до 3, от сильной) — сила тактик перед боем
                var D2 = w.NeuroDeckC3Data, out = [];
                try { (typeof FORGED !== 'undefined' ? FORGED : []).forEach(function(c) { if (c && D2.SPHERE_OF_STAT[c.stat] === sphere && D2.RANKS.indexOf(c.rank) >= 0) out.push(c.rank); }); } catch (e) {}
                return out.sort(function(a, b) { return D2.RANKS.indexOf(b) - D2.RANKS.indexOf(a); }).slice(0, 3);
            },
            cardsBySphere: function() { // начатые карточки по сферам [Тело, Разум, Дух, Связи]
                var out = [0, 0, 0, 0], idx = { body: 0, mind: 1, spirit: 2, ties: 3 };
                try { (typeof FORGED !== 'undefined' ? FORGED : []).forEach(function(c) { var sp = c && c.firstCompletedAt ? w.NeuroDeckC3Data.SPHERE_OF_STAT[c.stat] : null; if (sp) out[idx[sp]]++; }); } catch (e) {}
                return out;
            },
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
            if (!state) {
                var lg = (typeof env.legacySource === 'function') ? M.legacyFromV14(env.legacySource()) : null;
                if (lg && !(lg.g || lg.a || lg.hall.some(Boolean) || lg.sk.some(Boolean) || lg.l.some(function(v) { return v > 1; }))) lg = null; // нечего переносить
                state = M.newState(env.dayKey(), lg);
            }
            return state;
        }
        function addPend(target, by) {
            if (Array.isArray(by)) { for (var i = 0; i < 4; i++) target[i] += Math.max(0, Math.floor(by[i]) || 0); }
            else target[1] += Math.max(0, Math.floor(by) || 0); // число без сферы — Разум
        }
        var api = {
            enabled: enabled,
            getState: function() { return state; },
            ensure: ensure,
            serialize: function() { return state || undefined; }, // нет состояния → ключа в сейве нет (флаг никогда не включали)
            load: function(raw) { var s = env.sanitize(raw); if (s) state = s; return !!s; },
            reset: function() { state = null; },
            // ленивая загрузка: модули подгружены после старта игры — подхватить отложенный сейв (storage.js кладёт его в window.__ndC3Raw) и закрыть сутки
            boot: function() {
                if (!state && env.takeStash) { var raw = env.takeStash(); if (raw) api.load(raw); }
                if (enabled() && state) api.dayEnd(env.dayKey());
                env.render();
            },

            // ----- хуки из app.js (все под enabled()) -----
            onDeed: function(deed) { // deed: {kind:'habit', stat, rank} | {kind:'task', sphere?}
                if (!ensure()) return null;
                var sphere = deed.kind === 'habit' ? (D.SPHERE_OF_STAT[deed.stat] || null) : (D.SPHERES.indexOf(deed.sphere) >= 0 ? deed.sphere : 'mind');
                var r = M.applyDeed(state, { kind: deed.kind, sphere: sphere, rank: deed.rank });
                if (r.comeback) env.toast('🗺 Возвращение', 'Первое дело после перерыва даёт ×2 очков движения');
                env.render();
                return r;
            },
            // срывы суток копятся по сферам (массив [Тело, Разум, Дух, Связи] или сфера/стат + число)
            onHonestSkip: function(stat) { if (!ensure()) return; var i = D.SPHERES.indexOf(D.SPHERE_OF_STAT[stat]); if (i >= 0) state.pend.h[i]++; },
            onSilentMisses: function(by) { if (ensure()) addPend(state.pend.s, by); },
            onTaskOverdue: function(by) { if (ensure()) addPend(state.pend.o, by); },

            // Закрывает сутки (и пропущенные дни без открытия приложения) до todayKey. Вызывается из checkDailyReset.
            dayEnd: function(todayKey) {
                if (!ensure()) return { days: 0 };
                var gap = daysBetween(state.day, todayKey), closed = 0;
                if (gap <= 0) return { days: 0 };
                if (gap > MAX_CATCHUP_DAYS) state.day = dayDiffAdd(todayKey, -MAX_CATCHUP_DAYS);
                var weekly = null, events = [];
                while (state.day < todayKey) {
                    var next = dayDiffAdd(state.day, 1), input;
                    if (closed === 0) input = { silent: state.pend.s, honest: state.pend.h, overdue: state.pend.o };
                    else input = { silent: env.cardsBySphere().map(function(n) { return Math.min(3, n); }), honest: [0, 0, 0, 0], overdue: [0, 0, 0, 0] }; // день без открытия приложения — молчание
                    state.pend = { s: [0, 0, 0, 0], h: [0, 0, 0, 0], o: [0, 0, 0, 0] };
                    M.dayEnd(state, next, input);
                    if (isMonday(next)) { weekly = M.weekEnd(state); events = events.concat(weekly.events); }
                    closed++;
                }
                // большой ход фракций: тост на самое важное (падение города, затем занятие узла), остальное — в журнале панели
                var pick = events.filter(function(e) { return e.kind === 'fall'; })[0] || events.filter(function(e) { return e.kind === 'siege'; })[0] || events.filter(function(e) { return e.kind === 'take'; })[0] || events.filter(function(e) { return e.kind === 'retreat'; })[0];
                if (pick) env.toast(pick.kind === 'fall' ? '🏚 Город пал' : (pick.kind === 'retreat' ? '🛡 Пороки отступают' : '🌑 Ход фракций'), pick.text, pick.kind === 'retreat' ? 'save' : 'blood');
                env.render();
                return { days: closed, weekly: weekly, events: events };
            },

            // ----- действия игрока (UI) -----
            act: {
                travel: function(h, node) { if (!ensure()) return null; var r = M.travel(state, h, node); env.save(); env.render(); return r; },
                offer: function(h) { if (!ensure()) return []; return M.offerTactics(state, h, env.sphereRanks(D.SPHERES[h])); },
                engage: function(h, node, tactic) {
                    if (!ensure()) return null;
                    var r = M.engage(state, h, node, tactic); env.save(); env.render();
                    if (r.ok) env.toast(r.win ? '⚔ Победа' : '💢 Штурм отбит', state.log.length ? state.log[state.log.length - 1].t : '', r.win ? 'save' : 'blood');
                    return r;
                },
                hire: function(h, tier, n) { if (!ensure()) return null; var r = M.hire(state, h, tier, n); env.save(); env.render(); return r; },
                hall: function(h) { if (!ensure()) return null; var r = M.buyHall(state, h); env.save(); env.render(); return r; },
                dwelling: function(h, tier) { if (!ensure()) return null; var r = M.buildDwelling(state, h, tier); env.save(); env.render(); return r; },
                lazaret: function(on) { if (!ensure()) return null; var r = on ? M.lazaretStart(state) : M.lazaretEnd(state); env.save(); env.render(); return r; },
                truce: function(f, on) { if (!ensure()) return null; var r = on ? M.declareTruce(state, f) : M.revokeTruce(state, f); env.save(); env.render(); return r; },
                obelisk: function(h, claim) {
                    if (!ensure()) return null;
                    var r = claim ? M.obeliskClaim(state, h) : M.obeliskActivate(state, h);
                    env.save(); env.render();
                    if (r.ok && claim) env.toast('🗿 Обелиск отвечает', state.log.length ? state.log[state.log.length - 1].t : '');
                    return r;
                },
                newMap: function() {
                    if (!ensure() || !M.seasonOver(state)) return null;
                    state = M.newMap(state); env.save(); env.render();
                    env.toast('🗺 Карта ' + state.mp, state.cyc > 0 ? 'Пороки сильнее на ' + Math.round(D.C.CYC_K * 100 * state.cyc) + '%: перенесено наследие прошлой карты' : 'Новый сезон: перенесено наследие прошлой карты');
                    return { ok: true };
                },
                gather: function(from, to) { if (!ensure()) return null; var r = M.transferAll(state, from, to); env.save(); env.render(); return r; }
            }
        };
        return api;
    }

    return { create: create, browserEnv: browserEnv, FLAG_KEY: FLAG_KEY };
});
