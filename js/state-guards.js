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
        var clean = { backpack: [], equipped: createEmptyEquipped(), maxSlots: Math.max(1, Math.min(60, maxSlots || 30)) };
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

    return {
        RANK_PROGRESSION: RANK_PROGRESSION,
        EQUIP_SLOTS: EQUIP_SLOTS,
        sanitizeRank: sanitizeRank,
        sanitizeCard: sanitizeCard,
        sanitizeInventory: sanitizeInventory,
        sanitizeCounter: sanitizeCounter
    };
});
