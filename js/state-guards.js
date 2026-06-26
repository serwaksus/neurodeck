(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.NeuroDeckStateGuards = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    var RANK_PROGRESSION = ['C', 'CC', 'CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA', 'S', 'SS', 'SSS'];
    var VALID_STATS = { str: true, end: true, int: true, cha: true, wil: true, agi: true };
    var EQUIP_SLOTS = ['head', 'amulet', 'chest', 'cape', 'weapon', 'shield', 'ring1', 'ring2', 'boots'];
    var EQUIP_SLOT_SET = EQUIP_SLOTS.reduce(function(acc, slot) { acc[slot] = true; return acc; }, {});

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
            lastCompletedAt: Number.isFinite(Number(card.lastCompletedAt)) ? Number(card.lastCompletedAt) : null
        };
    }

    function createEmptyEquipped() {
        return EQUIP_SLOTS.reduce(function(acc, slot) { acc[slot] = null; return acc; }, {});
    }

    function sanitizeArtifactItem(item, catalog, forcedSlot, fallbackUid) {
        if (!item || typeof item !== 'object' || !catalog || !catalog[item.id]) return null;
        var canonical = catalog[item.id];
        var targetSlot = forcedSlot || item.slot || canonical.slot;
        if (!EQUIP_SLOT_SET[targetSlot]) return null;
        var uid = safeString(item.uid, fallbackUid || ('i' + Date.now()), 40);
        return Object.assign({}, canonical, { uid: uid, slot: targetSlot });
    }

    function sanitizeInventory(input, catalog, maxSlots) {
        var clean = { backpack: [], equipped: createEmptyEquipped(), maxSlots: Math.max(1, (Number.isFinite(Number(maxSlots)) ? Math.min(60, Math.max(0, Number(maxSlots))) : 30)) };
        var usedIds = {};
        var usedUids = {};
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
            hp: Math.round(clampNumber(hero.hp, 0, 1e6, 80)),
            maxHp: Math.round(clampNumber(hero.maxHp, 1, 1e6, 80)),
            isHollow: typeof hero.isHollow === 'boolean' ? hero.isHollow : false,
            consecutivePerfectDays: Math.round(clampNumber(hero.consecutivePerfectDays, 0, 1000, 0)),
            dailyCompletions: Math.round(clampNumber(hero.dailyCompletions, 0, 1000, 0)),
            dailySkips: Math.round(clampNumber(hero.dailySkips, 0, 1000, 0)),
            actionPoints: Math.round(clampNumber(hero.actionPoints, 0, 1e6, 0)),
            lastSessionAt: Number.isFinite(Number(hero.lastSessionAt)) ? Number(hero.lastSessionAt) : Date.now(),
            dailyUniqueStats: (hero.dailyUniqueStats && typeof hero.dailyUniqueStats === 'object') ? hero.dailyUniqueStats : {},
            cardHistory: (hero.cardHistory && typeof hero.cardHistory === 'object') ? hero.cardHistory : {},
            lastWeeklyReport: hero.lastWeeklyReport || null,
            estus: Math.round(clampNumber(hero.estus, 0, 5, 3)),
            estusUsedToday: typeof hero.estusUsedToday === 'boolean' ? hero.estusUsedToday : false,
            lastEstusReset: (typeof hero.lastEstusReset === 'string' && hero.lastEstusReset) ? hero.lastEstusReset : null
        };
    }

    var GOAL_TYPES = { short: true, medium: true, long: true };
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
            var day = typeof e.date === 'string' || typeof e.date === 'number' ? String(e.date).slice(0, 32) : null;
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
        sanitizeBossKills: sanitizeBossKills
    };
});
