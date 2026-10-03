(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else { root.NeuroDeckStateGuards = factory(); root.STATE_GUARDS = root.NeuroDeckStateGuards; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    var RANK_PROGRESSION = ['C', 'CC', 'CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA', 'S', 'SS', 'SSS'];
    var VALID_STATS = Object.assign(Object.create(null), { str: true, end: true, int: true, cha: true, wil: true, agi: true });
    var GOAL_TYPES = Object.assign(Object.create(null), { short: true, medium: true, long: true });
    var DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/; // ключ МСК-дня; всё, что идёт в innerHTML, обязано пройти через него
    var EQUIP_SLOTS = ['head', 'amulet', 'chest', 'cape', 'weapon', 'shield', 'ring1', 'ring2', 'boots'];
    var EQUIP_SLOT_SET = EQUIP_SLOTS.reduce(function(acc, slot) { acc[slot] = true; return acc; }, Object.create(null));

    function clampNumber(value, min, max, fallback) {
        var n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    function safeString(value, fallback, maxLen) {
        if (typeof value !== 'string') return fallback;
        var trimmed = value.trim();
        if (!trimmed) return fallback;
        return trimmed.slice(0, maxLen);
    }

    function sanitizeRank(rank) {
        return RANK_PROGRESSION.indexOf(rank) === -1 ? 'C' : rank;
    }

    function sanitizeCard(card, fallbackId) {
        card = card && typeof card === 'object' ? card : {};
        var masteryThreshold = Math.round(clampNumber(card.masteryThreshold, 2, 50, 7));
        var rawId = Number(card.id);
        var id = Number.isFinite(rawId) && rawId >= 1 ? Math.round(Math.min(1000000000, rawId)) : (fallbackId || 1);
        return {
            id: id,
            name: safeString(card.name, 'Безымянная карточка', 80),
            meta: safeString(card.meta, '⚔ 15 мин · день', 120),
            rank: sanitizeRank(card.rank),
            streak: Math.round(clampNumber(card.streak, 0, 10000, 0)),
            stat: VALID_STATS[card.stat] ? card.stat : 'str',
            progress: Math.round(clampNumber(card.progress, 0, 100, 0)),
            mastery: clampNumber(card.mastery, 0, masteryThreshold, 0),
            masteryThreshold: masteryThreshold,
            totalCompletions: Math.round(clampNumber(card.totalCompletions, 0, 1000000, 0)),
            prestige: Math.round(clampNumber(card.prestige, 0, 3, 0)),
            evolutionPath: ['depth', 'frequency', 'stability'].indexOf(card.evolutionPath) === -1 ? null : card.evolutionPath,
            daysActive: Math.round(clampNumber(card.daysActive, 0, 36500, 0)),
            firstCompletedAt: Number.isFinite(Number(card.firstCompletedAt)) ? Number(card.firstCompletedAt) : null,
            lastCompletedAt: Number.isFinite(Number(card.lastCompletedAt)) ? Number(card.lastCompletedAt) : null,
            lastFailDay: typeof card.lastFailDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(card.lastFailDay) ? card.lastFailDay : null
        };
    }

    function createEmptyEquipped() {
        return EQUIP_SLOTS.reduce(function(acc, slot) { acc[slot] = null; return acc; }, {});
    }

    function sanitizeArtifactItem(item, catalog, forcedSlot, fallbackUid) {
        if (!item || typeof item !== 'object' || !catalog || typeof item.id !== 'string' || !Object.prototype.hasOwnProperty.call(catalog, item.id) || !catalog[item.id]) return null;
        var canonical = catalog[item.id];
        var targetSlot = forcedSlot || item.slot || canonical.slot;
        if (!EQUIP_SLOT_SET[targetSlot]) return null;
        var uid = safeString(item.uid, fallbackUid || ('i' + Date.now()), 40);
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(uid)) uid = fallbackUid || ('i' + Date.now()); // uid попадает в data-атрибуты/innerHTML
        return Object.assign({}, canonical, { uid: uid, slot: targetSlot });
    }

    function sanitizeInventory(input, catalog, maxSlots) {
        var clean = { backpack: [], equipped: createEmptyEquipped(), maxSlots: Math.max(1, (Number.isFinite(Number(maxSlots)) ? Math.min(60, Math.max(0, Number(maxSlots))) : 30)) };
        var usedIds = Object.create(null);
        var usedUids = Object.create(null);
        input = input && typeof input === 'object' ? input : {};

        EQUIP_SLOTS.forEach(function(slot, idx) {
            var item = input.equipped && input.equipped[slot];
            var cleanItem = sanitizeArtifactItem(item, catalog, slot, 'eq' + idx);
            if (!cleanItem || usedIds[cleanItem.id] || usedUids[cleanItem.uid]) return;
            clean.equipped[slot] = cleanItem;
            usedIds[cleanItem.id] = true;
            usedUids[cleanItem.uid] = true;
        });

        if (Array.isArray(input.backpack)) {
            input.backpack.forEach(function(item, idx) {
                if (clean.backpack.length >= clean.maxSlots) return;
                var cleanItem = sanitizeArtifactItem(item, catalog, null, 'bp' + idx);
                if (!cleanItem || usedIds[cleanItem.id] || usedUids[cleanItem.uid]) return;
                clean.backpack.push(cleanItem);
                usedIds[cleanItem.id] = true;
                usedUids[cleanItem.uid] = true;
            });
        }

        return clean;
    }

    function sanitizeCounter(value, minimum) {
        return Math.round(clampNumber(value, minimum || 1, 1000000000, minimum || 1));
    }

    // Closes CRITICAL #1: hero was previously polluted via raw Object.assign
    // without whitelist. Replaces bad fields with safe defaults.
    function sanitizeHero(input) {
        var hero = input && typeof input === 'object' ? input : {};
        return {
            name: safeString(hero.name, 'Странник', 40),
            title: safeString(hero.title, '', 80),
            level: Math.round(clampNumber(hero.level, 1, 99, 1)),
            xp: clampNumber(hero.xp, 0, 1e10, 0),
            xpToNext: Math.round(clampNumber(hero.xpToNext, 1, 1e6, 50)),
            totalXp: clampNumber(hero.totalXp, 0, 1e10, 0),
            gold: Math.round(clampNumber(hero.gold, 0, 1e9, 30)),
            consecutivePerfectDays: Math.round(clampNumber(hero.consecutivePerfectDays, 0, 1000, 0)),
            streakShields: Math.round(clampNumber(hero.streakShields, 0, 100, 0)), // QA3-M1: whitelist вместо Object.assign-потери
            dayStreak: Math.round(clampNumber(hero.dayStreak, 0, 100000, 0)), // #19: дневной стрик активности
            streakMilestones: (hero.streakMilestones && typeof hero.streakMilestones === 'object') ? hero.streakMilestones : {},
            lastActiveDay: safeString(hero.lastActiveDay, '', 10),
            dailyCompletions: Math.round(clampNumber(hero.dailyCompletions, 0, 1000, 0)),
            dailySkips: Math.round(clampNumber(hero.dailySkips, 0, 1000, 0)),
            lastSessionAt: Number.isFinite(Number(hero.lastSessionAt)) ? Number(hero.lastSessionAt) : Date.now(),
            dailyUniqueStats: (hero.dailyUniqueStats && typeof hero.dailyUniqueStats === 'object') ? hero.dailyUniqueStats : {},
            cardHistory: (hero.cardHistory && typeof hero.cardHistory === 'object') ? hero.cardHistory : {},
            lastWeeklyReport: hero.lastWeeklyReport || null,
            weeklyPrev: sanitizeWeeklyPrev(hero.weeklyPrev), // #42: снапшот прошлой недели для дельт
            storm: sanitizeStorm(hero.storm), // Г1-5: коррупционная буря сезона
            warlordAhead: hero.warlordAhead === true, // Г1-6: обгон воеводы
            doctrines: (function(d) { // Г1-2: whitelist 9 id доктрин по тирам, иначе null
                if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
                function pick(v, ids) { return (ids.indexOf(v) !== -1) ? v : null; }
                return {
                    t1: pick(d.t1, ['tax', 'upkeep', 'atk']),
                    t2: pick(d.t2, ['growth', 'lore', 'fort']),
                    t3: pick(d.t3, ['crown', 'veteran', 'engine'])
                };
            })(hero.doctrines),
            totem: (hero.totem && typeof hero.totem === 'object' && !Array.isArray(hero.totem)) ? { // волна 3 Ф2: тотемное животное
                id: (['wolf', 'owl', 'bear'].indexOf(hero.totem.id) !== -1 ? hero.totem.id : null),
                chosenDayKey: safeString(hero.totem.chosenDayKey, '', 10),
                rechoose: hero.totem.rechoose === true
            } : null,
            tower: (hero.tower && typeof hero.tower === 'object' && !Array.isArray(hero.tower)) ? { // волна 3 Ф3: башня-марафон
                floor: Math.round(clampNumber(hero.tower.floor, 0, 50, 0)),
                lastFloorDay: safeString(hero.tower.lastFloorDay, '', 10)
            } : null,
            bosses: (function(bs) { // Г2-1: Поверенные Тьмы — whitelist-стиль doctrines/totem/tower; C5: босс-арки
                function bossNum(v) { return (Number.isInteger(v) && v >= 1 && v <= 11) ? v : null; }
                if (!bs || typeof bs !== 'object' || Array.isArray(bs)) bs = {};
                var seen = (Array.isArray(bs.introSeen) ? bs.introSeen : []).map(bossNum)
                    .filter(function(n) { return n !== null; })
                    .filter(function(n, i, a) { return a.indexOf(n) === i; }); // C5: лор-вступления
                var rc = {};
                if (bs.rewardChoice && typeof bs.rewardChoice === 'object' && !Array.isArray(bs.rewardChoice)) {
                    Object.keys(bs.rewardChoice).slice(0, 11).forEach(function(k) {
                        if (/^\d+$/.test(k) && bossNum(parseInt(k, 10)) !== null && ['artifact', 'crown', 'ruin'].indexOf(bs.rewardChoice[k]) !== -1) rc[k] = bs.rewardChoice[k];
                    });
                } // C5: num → 'artifact'|'crown'|'ruin'
                return {
                    defeated: (Array.isArray(bs.defeated) ? bs.defeated : []).map(bossNum).filter(function(n, i, a) { return n !== null && a.indexOf(n) === i; }),
                    activeNum: bossNum(bs.activeNum),
                    phase: Math.round(clampNumber(bs.phase, 0, 2, 0)),
                    attemptDay: safeString(bs.attemptDay, '', 10) || null,
                    closedDay: safeString(bs.closedDay, '', 10) || null,
                    closedCount: Math.round(clampNumber(bs.closedCount, 0, 2, 0)), // G2 (круг 11): фаз за сегодня, 2/день
                    introSeen: seen,
                    rewardChoice: rc,
                    pendingReward: bossNum(bs.pendingReward) // C5: босс ждёт выбора награды
                };
            })(hero.bosses),
            scouts: (function(sc) { // Г2-3: лазутчик — {idx 0..19, readyDayKey} иначе null
                if (!sc || typeof sc !== 'object' || Array.isArray(sc)) return null;
                var idx = Math.round(clampNumber(sc.idx, 0, 19, -1));
                var day = safeString(sc.readyDayKey, '', 10);
                return (idx >= 0 && day) ? { idx: idx, readyDayKey: day } : null;
            })(hero.scouts),
            ascension: Math.max(0, Math.round(clampNumber(hero.ascension, 0, 999, 0))), // Г2-5: круг Вознесения (0..999)
            combosFound: (Array.isArray(hero.combosFound) ? hero.combosFound : []).filter(function(id) { // Г2-4: гримуар связей
                return (typeof id === 'string' && ['fortress', 'blades', 'axis', 'focus', 'harmony', 'triumvirate', 'vortex', 'dawn'].indexOf(id) !== -1);
            }).filter(function(id, i, a) { return a.indexOf(id) === i; }),
            dayStatCounts: (function(c) { // Г2-4: счётчик статов дня
                var out = {};
                if (c && typeof c === 'object' && !Array.isArray(c)) {
                    Object.keys(c).forEach(function(k) { var v = Math.round(clampNumber(c[k], 0, 1000, 0)); if (v > 0) out[k] = v; });
                }
                return out;
            })(hero.dayStatCounts),
            combosToday: (function(t) { // Г2-4: сработавшие сегодня комбо (id → dayKey), ключи — только известные id
                var ids = ['fortress', 'blades', 'axis', 'focus', 'harmony', 'triumvirate', 'vortex', 'dawn'];
                var out = {};
                if (t && typeof t === 'object' && !Array.isArray(t)) {
                    Object.keys(t).forEach(function(k) { if (ids.indexOf(k) !== -1) out[k] = safeString(t[k], '', 10); });
                }
                return out;
            })(hero.combosToday),
            comboDayXp: (hero.comboDayXp === 1.1) ? 1.1 : null, // Г2-4: Вихрь — единственное допустимое значение
            dayFlags: (function(f) { // Ф0.5: флаги суток {day, chests, reroll, goal} — иначе null (создаётся лениво)
                if (!f || typeof f !== 'object' || Array.isArray(f) || !/^\d{4}-\d{2}-\d{2}$/.test(String(f.day))) return null;
                return { day: f.day, chests: Math.round(clampNumber(f.chests, 0, 1000, 0)), reroll: f.reroll === true, goal: f.goal === true };
            })(hero.dayFlags),
            pomodoro: (function(p) { // Ф0.5 (аудит 2026-10-03): помодоро в сейве {active: {id: конец-мс}, done: {"id_день": "день"}} — иначе null; капы чужих дней не храним
                if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
                var active = {}, a = (p.active && typeof p.active === 'object' && !Array.isArray(p.active)) ? p.active : {};
                Object.keys(a).slice(0, 20).forEach(function(id) { // живых таймеров ≤ числа карточек — 20 с запасом
                    if (!/^\d{1,9}$/.test(id)) return;
                    var end = Number(a[id]);
                    if (!Number.isFinite(end) || end <= 0 || end >= 8.64e15) return; // битая дата — мусор; истёкший валиден, награду выдаст sweep
                    active[id] = Math.round(end);
                });
                var today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); // МСК-день, как getMSKDayKey в app.js
                var done = {}, dn = (p.done && typeof p.done === 'object' && !Array.isArray(p.done)) ? p.done : {};
                Object.keys(dn).slice(0, 100).forEach(function(k) {
                    var m = /^(\d{1,9})_(\d{4}-\d{2}-\d{2})$/.exec(k);
                    if (!m || dn[k] !== m[2] || m[2] !== today) return; // ключ согласован со значением и это сегодня; вчерашние хвосты капов не нужны
                    done[k] = m[2];
                });
                return (Object.keys(active).length || Object.keys(done).length) ? { active: active, done: done } : null;
            })(hero.pomodoro)
        };
    }

    function sanitizeStorm(input) { // Г1-5: {num, regionIdx 0-19, dueDayKey, paid} иначе null
        if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
        return {
            num: Math.round(clampNumber(input.num, 0, 1e6, 0)),
            regionIdx: Math.round(clampNumber(input.regionIdx, 0, 19, 0)),
            dueDayKey: safeString(input.dueDayKey, '', 10),
            paid: input.paid === true
        };
    }

    function sanitizeWeeklyPrev(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
        return {
            gold: Math.round(clampNumber(input.gold, 0, 1e9, 0)),
            xp: Math.round(clampNumber(input.xp, 0, 1e10, 0)),
            completions: Math.round(clampNumber(input.completions, 0, 1e6, 0)),
            week: Math.round(clampNumber(input.week, 1, 520, 1))
        };
    }

    function sanitizeGoalStep(step, idx) {
        if (!step || typeof step !== 'object') return { text: 'Шаг ' + (idx + 1), done: false };
        return {
            text: safeString(step.text, 'Шаг ' + (idx + 1), 200),
            done: typeof step.done === 'boolean' ? step.done : false
        };
    }
    function sanitizeGoals(input) {
        if (!Array.isArray(input)) return [];
        var out = [];
        var seen = {};
        input.forEach(function(g, i) {
            if (!g || typeof g !== 'object') return;
            if (out.length >= 200) return;  // hard cap
            // detect type, fallback to 'short'
            var type = GOAL_TYPES[g.type] ? g.type : 'short';
            var id = Number(g.id);
            id = Number.isFinite(id) && id >= 1 ? id : (i + 1);
            if (seen[id]) id = 'g' + Date.now() + '_' + i;
            seen[id] = true;
            // deadline must be parseable to ms, never NaN
            var dl = Date.parse(g.deadline);
            if (!Number.isFinite(dl)) dl = Date.now() + 86400000;
            // steps validation
            var steps = Array.isArray(g.steps) ? g.steps : [];
            steps = steps.map(sanitizeGoalStep);
            if (steps.length === 0) steps = [{ text: 'Шаг 1', done: false }];
            out.push({
                id: id,
                type: type,
                name: safeString(g.name, 'Безымянная цель', 100),
                description: safeString(g.description, '', 400),
                deadline: new Date(dl).toISOString(),
                steps: steps,
                stat: VALID_STATS[g.stat] ? g.stat : 'str',
                failed: typeof g.failed === 'boolean' ? g.failed : false,
                completedAt: g.completedAt || null
            });
        });
        return out;
    }

    function sanitizeXpHistory(input) {
        if (!Array.isArray(input)) return [];
        var out = [];
        for (var i = 0; i < input.length && out.length < 366; i++) {  // 1 year cap
            var e = input[i];
            if (!e || typeof e !== 'object') continue;
            var xp = Math.round(clampNumber(e.xp, 0, 1e8, 0));
            var day = (typeof e.date === 'string' && DAY_KEY_RE.test(e.date)) ? e.date : null; // только ГГГГ-ММ-ДД: дата рисуется в графике через innerHTML
            if (day === null) continue;
            out.push({ date: day, xp: xp });
        }
        return out;
    }

    function sanitizeBossKills(input) {
        input = input && typeof input === 'object' ? input : {};
        return {
            snake:    Math.round(clampNumber(input.snake, 0, 1e6, 0)),
            social:   Math.round(clampNumber(input.social, 0, 1e6, 0)),
            chimera:  Math.round(clampNumber(input.chimera, 0, 1e6, 0))
        };
    }
    function sanitizeGoal(goal, fallbackId) {
        goal = goal && typeof goal === 'object' ? goal : {};
        var totalSteps = Math.round(clampNumber(goal.totalSteps, 1, 50, 3));
        var rawDeadline = Number(goal.deadline);
        var steps = [];
        if (Array.isArray(goal.steps)) {
            goal.steps.slice(0, totalSteps).forEach(function(s) {
                s = s && typeof s === 'object' ? s : {};
                var txt = safeString(s.text, '', 300);
                steps.push({ text: txt || ('Шаг ' + (steps.length + 1)), done: s.done === true });
            });
        }
        while (steps.length < totalSteps) {
            steps.push({ text: 'Шаг ' + (steps.length + 1), done: false });
        }
        var rawId = Number(goal.id);
        return {
            id: Number.isFinite(rawId) && rawId >= 1 ? Math.round(Math.min(1000000000, rawId)) : (fallbackId || 1),
            type: GOAL_TYPES[goal.type] ? goal.type : 'short',
            name: safeString(goal.name, 'Безымянная цель', 120),
            desc: safeString(goal.desc, '', 500),
            deadline: Number.isFinite(rawDeadline) && rawDeadline > 0 ? Math.round(rawDeadline) : null,
            totalSteps: totalSteps,
            currentStep: Math.round(clampNumber(goal.currentStep, 0, totalSteps, 0)),
            steps: steps,
            stat: VALID_STATS[goal.stat] ? goal.stat : 'str',
            xp: Math.round(clampNumber(goal.xp, 0, 100000, 30)),
            dmg: Math.round(clampNumber(goal.dmg, 0, 100, 5)),
            statBonus: Math.round(clampNumber(goal.statBonus, 0, 1000, 1)),
            completed: goal.completed === true,
            failed: goal.failed === true,
            createdAt: Number.isFinite(Number(goal.createdAt)) ? Number(goal.createdAt) : Date.now(),
            lastStepAt: Number.isFinite(Number(goal.lastStepAt)) ? Number(goal.lastStepAt) : null
        };
    }

    function sanitizeStrongholds(input, catalog) {
        var STAGES = { ok: true, worn: true, ruin: true };
        var TIER_RE = /^t[1-7]$/;
        function sanitizeGarrisonStacks(arr) {
            var out = [];
            if (!Array.isArray(arr)) return out;
            arr.forEach(function(u) {
                if (!u || typeof u !== 'object' || typeof u.tier !== 'string' || !TIER_RE.test(u.tier)) return;
                var count = Math.round(clampNumber(u.count, 0, 1e6, 0));
                for (var i = 0; i < out.length; i++) {
                    if (out[i].tier === u.tier) { out[i].count = Math.min(1e6, out[i].count + count); return; }
                }
                if (out.length < 7) out.push({ tier: u.tier, count: count });
            });
            return out;
        }
        function sanitizeBuildingMap(map) {
            var defs = (catalog && catalog.BUILDINGS && typeof catalog.BUILDINGS === 'object') ? catalog.BUILDINGS : {};
            var src = (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
            var out = {};
            Object.keys(src).forEach(function(id) {
                if (!Object.prototype.hasOwnProperty.call(defs, id)) return;
                var b = src[id];
                if (!b || typeof b !== 'object') return;
                if (b.built !== true) { out[id] = { built: false, corruptionStage: 'ok', debtDays: 0 }; return; }
                out[id] = {
                    built: true,
                    builtAt: (typeof b.builtAt === 'number' && b.builtAt > 0) ? b.builtAt : null,
                    corruptionStage: STAGES[b.corruptionStage] ? b.corruptionStage : 'ok',
                    debtDays: Math.round(clampNumber(b.debtDays, 0, 365, 0))
                };
            });
            return out;
        }
        var defs = (catalog && Array.isArray(catalog.STRONGHOLDS)) ? catalog.STRONGHOLDS : [];
        var byId = Object.create(null);
        (Array.isArray(input) ? input : []).forEach(function(s) {
            if (s && typeof s === 'object' && typeof s.id === 'string') byId[s.id] = s;
        });
        var catIds = Object.create(null);
        defs.forEach(function(d) { if (d && typeof d.id === 'string') catIds[d.id] = true; });
        return defs.map(function(def, di) {
            if (!def || typeof def.id !== 'string') return null;
            var s = Object.prototype.hasOwnProperty.call(byId, def.id) ? byId[def.id] : null;
            if (!s && Array.isArray(input)) {
                var legacy = input[di]; // fallback: легаси-id sh5..sh20 мимо каталога — только если номер совпадает с позицией (чужой/мусор id не матчится)
                var lm = legacy && typeof legacy === 'object' && typeof legacy.id === 'string' ? /^sh(\d{1,2})$/.exec(legacy.id) : null;
                if (lm && Number(lm[1]) === di + 1) s = legacy;
            }
            if (!s) s = {};
            var corr = (s.corruption && typeof s.corruption === 'object') ? s.corruption : {};
            return {
                id: def.id,
                captured: s.captured === true,
                garrison: sanitizeGarrisonStacks(s.garrison),
                buildings: sanitizeBuildingMap(s.buildings),
                corruption: {
                    stage: STAGES[corr.stage] ? corr.stage : 'ok',
                    debtDays: Math.round(clampNumber(corr.debtDays, 0, 365, 0))
                }
            };
        }).filter(Boolean);
    }

    function sanitizeArmy(input) {
        var TIER_KEYS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
        var src = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
        var unitsSrc = (src.units && typeof src.units === 'object' && !Array.isArray(src.units)) ? src.units : {};
        var units = {};
        TIER_KEYS.forEach(function(t) {
            units[t] = Math.round(clampNumber(unitsSrc[t], 0, 1e6, 0));
        });
        return { units: units, week: Math.round(clampNumber(src.week, 0, 520, 0)) };
    }

    function sanitizeHirePool(input) {
        var src = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
        var out = {};
        for (var i = 1; i <= 7; i++) {
            var k = 't' + i;
            out[k] = Math.round(clampNumber(src[k], 0, 1e6, 0));
        }
        return out;
    }
    function sanitizeSiege(input) {
        var src = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
        var last = src.lastResult;
        if (!last || typeof last !== 'object' || Array.isArray(last)) {
            last = null;
        } else {
            var clean = {};
            Object.keys(last).slice(0, 16).forEach(function(k) {
                var v = last[k];
                if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') clean[k] = v;
            });
            last = Object.keys(clean).length > 0 ? clean : null;
        }
        var assaultDay = (typeof src.assaultDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.assaultDay)) ? src.assaultDay : null;
        var wkSkips = Math.round(clampNumber(src.wkSkips, 0, 1000, 0));
        var wkTaskFails = Math.round(clampNumber(src.wkTaskFails, 0, 1000, 0));
        var wkHonest = Math.round(clampNumber(src.wkHonest, 0, 1000, 0)); // Ф0.1: честные пропуски недели (весят вдвое меньше молчаливых)
        var rams = Math.round(clampNumber(src.rams, 0, 999, 0)); // C4: осадные ресурсы (схема v12) — счётчики, всегда в выходе
        var ladders = Math.round(clampNumber(src.ladders, 0, 999, 0));
        var stance = ['assault', 'defend', 'scout', 'economy'].indexOf(src.stance) >= 0 ? src.stance : null; // Г4: стойка недели
        var approach = ['assault', 'siege', 'trick'].indexOf(src.approach) >= 0 ? src.approach : 'assault'; // P11: подход недели персистентный (схема v14), дефолт — норма «Штурм»
        var out = { week: Math.round(clampNumber(src.week, 1, 520, 1)), lastResult: last, assaultDay: assaultDay, wkSkips: wkSkips, wkTaskFails: wkTaskFails, retriedThisWeek: src.retriedThisWeek === true, rams: rams, ladders: ladders, approach: approach };
        if (src.wkHonest !== undefined) out.wkHonest = wkHonest; // лениво — байт-стабильный раундтрип старых сейвов
        if (src.stance !== undefined) out.stance = stance; // Г4: лениво — байт-стабильный раундтрип сейвов без стойки
        return out;
    }

    // Кампания 3.0, Ф6: состояние c3 (33 узла, 4 героя-сферы, 4 фракции, навыки, наследие, обелиски, номер карты). Невосстановимое (v1–v5 прежних фаз беты) → null: рантайм начнёт карту заново.
    function sanitizeC3(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
        var N = 33, DATE = /^\d{4}-\d{2}-\d{2}$/;
        if (input.v !== 6 || typeof input.own !== 'string' || input.own.length !== N || !/^[0-6]+$/.test(input.own) || typeof input.day !== 'string' || !DATE.test(input.day)) return null;
        function int(v, lo, hi, d) { return Math.round(clampNumber(v, lo, hi, d)); }
        function arr(a, len, lo, hi, d) { var out = []; for (var i = 0; i < len; i++) out.push(int(Array.isArray(a) ? a[i] : d, lo, hi, d)); return out; }
        var src = input, res = (src.res && typeof src.res === 'object') ? src.res : {}, pend = (src.pend && typeof src.pend === 'object') ? src.pend : {};
        var i;
        var lz = (src.lz && typeof src.lz === 'object') ? src.lz : {};
        var heroes = [], towns = [];
        for (i = 0; i < 4; i++) {
            var h = (Array.isArray(src.heroes) && src.heroes[i] && typeof src.heroes[i] === 'object') ? src.heroes[i] : {};
            var army = (h.army && typeof h.army === 'object') ? h.army : {};
            heroes.push({ node: int(h.node, 0, N - 1, 8 * i), lvl: int(h.lvl, 1, 99, 1), xp: int(h.xp, 0, 100000, 0), sk: int(h.sk, 0, 3, 0),
                army: { t1: int(army.t1, 0, 1e6, 0), t3: int(army.t3, 0, 1e6, 0), t5: int(army.t5, 0, 1e6, 0) } });
            var t = (Array.isArray(src.towns) && src.towns[i] && typeof src.towns[i] === 'object') ? src.towns[i] : {};
            var pool = (t.pool && typeof t.pool === 'object') ? t.pool : {}, dw = (t.dw && typeof t.dw === 'object') ? t.dw : {};
            towns.push({ pool: { t1: int(pool.t1, 0, 1000, 0), t3: int(pool.t3, 0, 1000, 0), t5: int(pool.t5, 0, 1000, 0) },
                dw: { t3: dw.t3 ? 1 : 0, t5: (dw.t3 && dw.t5) ? 1 : 0 }, hall: int(t.hall, 0, 3, 0) });
        }
        var facs = [];
        for (i = 0; i < 4; i++) {
            var fz = (Array.isArray(src.fac) && src.fac[i] && typeof src.fac[i] === 'object') ? src.fac[i] : {}, sh = [];
            for (var d = 0; d < 7; d++) sh.push(clampNumber(Array.isArray(fz.sh) ? fz.sh[d] : 0, 0, 100, 0));
            facs.push({ sh: sh, dead: fz.dead ? 1 : 0, truce: (fz.truce && !fz.dead) ? 1 : 0 });
        }
        var truces = 0; facs.forEach(function(f) { if (f.truce) { truces++; if (truces > 1) f.truce = 0; } }); // не больше одного обета
        var log = (Array.isArray(src.log) ? src.log : []).slice(-6).filter(function(e) { return e && typeof e === 'object'; }).map(function(e) {
            return { d: DATE.test(String(e.d)) ? e.d : src.day, t: safeString(e.t, '', 90) };
        });
        var own = src.own; // города (индексы 0, 8, 16, 24) всегда игрока
        [0, 8, 16, 24].forEach(function(c) { own = own.slice(0, c) + '1' + own.slice(c + 1); });
        var out = {
            v: 6, day: src.day, wk: int(src.wk, 0, 520, 0), idle: int(src.idle, 0, 100000, 0), bc: int(src.bc, 0, 10000000, 0), stk: arr(src.stk, 4, 0, 99, 0), dc: arr(src.dc, 4, 0, 99, 0), ob: arr(src.ob, 4, 0, 2, 0), obb: arr(src.obb, 4, 0, 99, 0), cyc: int(src.cyc, 0, 99, 0), mp: int(src.mp, 1, 999, 1),
            tasksToday: int(src.tasksToday, 0, 5, 0), deedsToday: int(src.deedsToday, 0, 1000, 0),
            ap: arr(src.ap, 4, 0, 20, 0), apDay: arr(src.apDay, 4, 0, 6, 0), apWeek: arr(src.apWeek, 4, 0, 1000, 0),
            pend: { s: arr(pend.s, 4, 0, 1000, 0), h: arr(pend.h, 4, 0, 1000, 0), o: arr(pend.o, 4, 0, 1000, 0) },
            res: { g: int(res.g, 0, 1e9, 0), st: int(res.st, 0, 1e6, 0), kn: int(res.kn, 0, 1e6, 0), wl: int(res.wl, 0, 1e6, 0), in: int(res['in'], 0, 1e6, 0) },
            heroes: heroes, own: own, seen: (typeof src.seen === 'string' && src.seen.length === N && /^[01]+$/.test(src.seen)) ? src.seen : '0'.repeat(N),
            gar: arr(src.gar, N, 0, 100000, 0), towns: towns, fac: facs, sg: arr(src.sg, 4, 0, 10, 0), lz: { on: lz.on ? 1 : 0, left: int(lz.left, 0, 30, 7) }, log: log, done: src.done === true
        };
        if (src.lg && typeof src.lg === 'object') out.lg = { g: int(src.lg.g, 0, 2000, 0), hall: arr(src.lg.hall, 4, 0, 1, 0), sk: arr(src.lg.sk, 4, 0, 1, 0), a: int(src.lg.a, 0, 1000, 0), l: arr(src.lg.l, 4, 1, 4, 1) }; // наследие 2.0 — для экрана «Наследие»
        if (src.rest !== undefined) { // Кампания 3.0: объявленный отдых — ключи дней (YYYY-MM-DD), уникальные и ≤ 14; ленивое поле — байт-стабильный раундтрип старых сейвов
            var seenRest = {}, rest = [];
            (Array.isArray(src.rest) ? src.rest : []).forEach(function(k) { if (typeof k === 'string' && DATE.test(k) && !seenRest[k]) { seenRest[k] = 1; rest.push(k); } });
            rest.sort();
            out.rest = rest.slice(-14); // при переполнении остаются самые поздние (будущие)
        }
        return out;
    }

    function sanitizeSeason(input, todayKey) {
        var src = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
        var num = Math.round(clampNumber(src.num, 1, 999, 1));
        var start = (typeof src.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.start)) ? src.start : (todayKey || '2000-01-01');
        var snap = (src.snapshot && typeof src.snapshot === 'object' && !Array.isArray(src.snapshot)) ? src.snapshot : {};
        var crownBonus = Math.max(0, Math.min(5, Math.round(Number(src.crownBonus) || 0)));
        var snapshot = {
            totalXp: Math.round(clampNumber(snap.totalXp, 0, 1e12, 0)),
            gold: Math.round(clampNumber(snap.gold, 0, 1e12, 0)),
            captured: Math.round(clampNumber(snap.captured, 0, 20, 0)),
            completions: Math.round(clampNumber(snap.completions, 0, 1e9, 0)),
            level: Math.round(clampNumber(snap.level, 1, 1000, 1))
        };
        var EDICTS = ['tax', 'levy', 'order'];
        function provObj(srcObj, valFn) { // Г4: ключи '1'..'4', ≤4 записей
            var out = {};
            var s = (srcObj && typeof srcObj === 'object' && !Array.isArray(srcObj)) ? srcObj : {};
            Object.keys(s).slice(0, 4).forEach(function(k) {
                if (['1', '2', '3', '4'].indexOf(k) >= 0) {
                    var v = valFn(s[k]);
                    if (v !== null && v !== undefined) out[k] = v;
                }
            });
            return out;
        }
        var edicts = provObj(src.edicts, function(v) { return EDICTS.indexOf(v) >= 0 ? v : null; });
        var order = provObj(src.order, function(v) { return Math.round(clampNumber(v, 0, 100, 75)); });
        var lastRevoltDay = provObj(src.lastRevoltDay, function(v) { return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null; });
        var resource = provObj(src.resource, function(v) { return Math.round(clampNumber(v, 0, 999, 0)); });
        var out = { num: num, start: start, crownBonus: crownBonus, snapshot: snapshot };
        if (src.edicts !== undefined) out.edicts = edicts; // Г4: ленивые поля — только если были во входе (байт-стабильный раундтрип старых сейвов)
        if (src.order !== undefined) out.order = order;
        if (src.lastRevoltDay !== undefined) out.lastRevoltDay = lastRevoltDay;
        if (src.resource !== undefined) out.resource = resource;
        return out;
    }

    // Аудит 2026-10-02 (P0): дневные задания из импорта/облака — по каталогу, не как есть (icon/text рисуются через innerHTML)
    function sanitizeDailyQuests(input, pool) {
        var src = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
        var day = (typeof src.day === 'string' && DAY_KEY_RE.test(src.day)) ? src.day : null;
        var byId = Object.create(null);
        (Array.isArray(pool) ? pool : []).forEach(function(q) { if (q && typeof q.id === 'string') byId[q.id] = q; });
        var quests = [];
        var seen = Object.create(null);
        (Array.isArray(src.quests) ? src.quests : []).forEach(function(q) {
            var id = q && typeof q === 'object' ? q.id : null;
            if (typeof id !== 'string' || !byId[id] || seen[id] || quests.length >= 6) return;
            seen[id] = true;
            quests.push(byId[id]);
        });
        var done = {};
        if (src.done && typeof src.done === 'object' && !Array.isArray(src.done)) {
            Object.keys(byId).forEach(function(id) { if (src.done[id] === true) done[id] = true; });
        }
        var progress = {};
        if (src.progress && typeof src.progress === 'object' && !Array.isArray(src.progress)) {
            ['cards', 'gold', 'hire', 'build', 'quest', 'assault'].forEach(function(k) {
                var n = Number(src.progress[k]);
                if (Number.isFinite(n) && n > 0) progress[k] = Math.min(1e9, Math.round(n));
            });
        }
        return { day: day, quests: quests, done: done, progress: progress };
    }

    // Аудит 2026-10-02 (P0): клятва на крови из импорта/облака — только известные поля и типы
    function sanitizeBloodOath(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
        if (['active', 'completed', 'failed'].indexOf(input.status) < 0) return null;
        var cardId = Number(input.cardId);
        if (!Number.isFinite(cardId) || cardId < 1) return null;
        var requiredDays = Math.round(clampNumber(input.requiredDays, 1, 30, 5));
        return {
            cardId: Math.round(cardId),
            cardName: safeString(input.cardName, '', 80),
            streak: Math.round(clampNumber(input.streak, 0, requiredDays, 0)),
            requiredDays: requiredDays,
            status: input.status,
            assignedMonday: (typeof input.assignedMonday === 'string' && DAY_KEY_RE.test(input.assignedMonday)) ? input.assignedMonday : null,
            lastCompletedDay: (typeof input.lastCompletedDay === 'string' && DAY_KEY_RE.test(input.lastCompletedDay)) ? input.lastCompletedDay : null
        };
    }

    return {
        RANK_PROGRESSION: RANK_PROGRESSION,
        EQUIP_SLOTS: EQUIP_SLOTS,
        sanitizeRank: sanitizeRank,
        sanitizeCard: sanitizeCard,
        sanitizeInventory: sanitizeInventory,
        sanitizeCounter: sanitizeCounter,
        sanitizeHero: sanitizeHero,
        sanitizeGoals: sanitizeGoals,
        sanitizeXpHistory: sanitizeXpHistory,
        sanitizeBossKills: sanitizeBossKills,
        sanitizeGoal: sanitizeGoal,
        sanitizeStrongholds: sanitizeStrongholds,
        sanitizeArmy: sanitizeArmy,
        sanitizeSiege: sanitizeSiege,
        sanitizeHirePool: sanitizeHirePool,
        sanitizeSeason: sanitizeSeason,
        sanitizeC3: sanitizeC3, // Кампания 3.0, Ф6
        sanitizeDailyQuests: sanitizeDailyQuests,
        sanitizeBloodOath: sanitizeBloodOath,
        sanitizeStorm: sanitizeStorm // Г1-5
    };
});
