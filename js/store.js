var ND = window.ND || {};

ND.Store = {
    hero: {
        name: 'Странник', title: '«Тот, кто только начал путь»',
        level: 1, xp: 0, xpToNext: 100, totalXp: 0,
        hp: 100, maxHp: 100, isHollow: false,
        consecutivePerfectDays: 0, estus: 3,
        lastEstusReset: new Date().getMonth(),
        estusUsedToday: false, dailyCompletions: 0, dailySkips: 0
    },
    stats: {
        str: { name: 'Сила', icon: '⚔', desc: 'Урон', color: '#c73e4d', dark: '#8b2635', value: 3, max: 100, attributePoints: 0 },
        end: { name: 'Стойкость', icon: '🛡', desc: 'HP', color: '#60a5fa', dark: '#2563eb', value: 3, max: 100, attributePoints: 0 },
        int: { name: 'Интеллект', icon: '🧠', desc: 'XP бонус', color: '#c084fc', dark: '#7c3aed', value: 3, max: 100, attributePoints: 0 },
        cha: { name: 'Харизма', icon: '🎭', desc: 'Шанс крита', color: '#fbbf24', dark: '#b45309', value: 3, max: 100, attributePoints: 0 },
        wil: { name: 'Воля', icon: '🧘', desc: 'Стрик', color: '#34d399', dark: '#047857', value: 3, max: 100, attributePoints: 0 },
        agi: { name: 'Ловкость', icon: '⚡', desc: 'Скорость', color: '#fb923c', dark: '#c2410c', value: 3, max: 100, attributePoints: 0 }
    },
    forged: [],
    forgedIdCounter: 100,
    goals: [],
    goalIdCounter: 1,
    inventory: {
        backpack: [],
        equipped: { head: null, amulet: null, chest: null, cape: null, weapon: null, shield: null, ring1: null, ring2: null, boots: null },
        maxSlots: 30
    },
    uidCounter: 10,
    boss: { hp: 100, stage: 0, defeated: false, chimeraShield: 5 },
    escape: { progress: 0, lastDayReset: null, lastPunishDate: null },
    ui: {
        selectedItemId: null,
        currentFilter: 'all',
        editingCardId: null,
        selectedStat: 'str',
        selectedGoalType: 'short',
        selectedGoalStat: 'str',
        currentGoalFilter: 'all',
        currentView: 'deck'
    },
    history: []
};

ND.getStore = function() { return ND.Store; };

ND.calcMaxHp = function() {
    var s = ND.Store;
    return 100 + Math.max(0, (s.hero.level - 1) * 5) + s.stats.end.value;
};

ND.findCard = function(id) { return ND.Store.forged.find(function(c) { return c.id === id; }); };

ND.getCardDaysActive = function(card) {
    if (!card.firstCompletedAt) return 0;
    return Math.floor((Date.now() - card.firstCompletedAt) / (1000 * 60 * 60 * 24));
};

ND.getAdaptationMultiplier = function(card) {
    var days = card.daysActive || 0;
    if (days < 7) return 1.0;
    if (days < 15) return 0.5;
    return 0.1;
};

ND.getAdaptationLabel = function(mult) {
    if (mult >= 1.0) return { label: '100%', cls: 'adapt-100' };
    if (mult >= 0.5) return { label: '50%', cls: 'adapt-50' };
    return { label: '10%', cls: 'adapt-10' };
};

ND.getTotalGearBonuses = function() {
    var totals = { str: 0, end: 0, int: 0, cha: 0, wil: 0, agi: 0 };
    var eq = ND.Store.inventory.equipped;
    Object.keys(eq).forEach(function(k) {
        var item = eq[k];
        if (!item) return;
        item.bonuses.forEach(function(b) { if (totals.hasOwnProperty(b.stat)) totals[b.stat] += b.value; });
    });
    return totals;
};

ND.getMSKDate = function(ts) { return new Date((ts || Date.now()) + ND.CONST.MSK_OFFSET_MS); };

ND.getMSKDayKey = function(ts) {
    var d = ND.getMSKDate(ts);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
};

window.ND = ND;
