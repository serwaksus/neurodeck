// Кампания 3.0, Ф1 — данные вертикального среза: 9 узлов, герой Тело, город-Кузня, шахта, фракция Лень.
// Чистые данные без DOM; UMD как js/stronghold-model.js. Дизайн: docs/plan/CAMPAIGN-3.0.md.
(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.NeuroDeckC3Data = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    // Узлы неориентированного графа. cost — очки движения за ВХОД в узел; gar — оборона нейтралов/логова;
    // x,y — позиция на карте в % (только для UI). owner в стартовом состоянии: город — игрок, логово — Лень.
    var NODES = [
        { id: 0, type: 'town',  name: 'Кузня',            cost: 1, gar: 0,   x: 12, y: 86 },
        { id: 1, type: 'path',  name: 'Тропа',            cost: 1, gar: 0,   x: 30, y: 72 },
        { id: 2, type: 'mine',  name: 'Сталелитейная шахта', cost: 1, gar: 12,  x: 10, y: 54 },
        { id: 3, type: 'path',  name: 'Перекрёсток',      cost: 1, gar: 0,   x: 50, y: 62 },
        { id: 4, type: 'camp',  name: 'Застава',          cost: 1, gar: 30,  x: 70, y: 76 },
        { id: 5, type: 'swamp', name: 'Болото',           cost: 2, gar: 0,   x: 44, y: 38 },
        { id: 6, type: 'camp',  name: 'Форт',             cost: 1, gar: 80,  x: 72, y: 50 },
        { id: 7, type: 'path',  name: 'Предгорье',        cost: 1, gar: 0,   x: 76, y: 28 },
        { id: 8, type: 'lair',  name: 'Логово Лени',      cost: 1, gar: 300, x: 88, y: 8 }
    ];
    var EDGES = [[0, 1], [1, 2], [1, 3], [3, 4], [3, 5], [4, 6], [5, 6], [6, 7], [7, 8]];
    var TOWN = 0, LAIR = 8;
    // награда за первое взятие узла: золото 3.0 (свой кошелёк, не HERO.gold)
    var NODE_LOOT = { 2: { g: 0 }, 4: { g: 20 }, 6: { g: 40 }, 8: { g: 100 } };

    // Единицы среза; цифры совпадают с UNIT_TIERS (js/stronghold-data.js) по силе, цена в золоте 3.0 вдвое выше (проверяет тест).
    var UNITS = {
        t1: { icon: '🗡', name: 'Ополченец',   power: 2,  cost: 2 },
        t3: { icon: '🏹', name: 'Тень-Лучник', power: 16, cost: 30 }
    };
    var UNIT_KEYS = ['t1', 't3'];

    var C = {
        AP_CAP_DAY: 6,        // очков движения в сутки
        AP_CARRY: 1,          // переносится на следующий день
        TASK_CAP_DAY: 5,      // задач в сутки, дающих ОД
        COMEBACK_IDLE: 3,     // дней без дел, после которых первый день с делами даёт ×2 ОД
        GOLD_DAY: 20,         // доход Кузни
        STEEL_MINE_DAY: 1,    // доход шахты
        SHADOW_K: 0.15,       // рост силы Лени за «тень» недели (окно 7 дней)
        SHADOW_CAP: 2.5,      // потолок множителя
        RAID_K: 0.15,         // доля силы логова в недельном набеге на удалённый узел
        RAID_RATIO: 1.2,      // набег удаётся при S/оборона > 1.2
        RAID_MIN_SHADOW: 3,   // меньше — Лень не ходит
        NODE_DEF: 40,         // оборона занятого игроком узла
        FORGE_DEF: 20,        // +к обороне занятых узлов за уровень закалки
        FORGE_ATK: 0.1,       // +к атаке армии за уровень закалки
        FORGE_MAX: 3,
        FORGE_COST: 5,        // сталь за уровень: FORGE_COST × (уровень+1)
        LVL_ATK: 0.02,        // +к атаке за уровень героя
        XP_PER_LVL: 8,        // порог уровня: XP_PER_LVL × уровень
        POOL_GROW: { t1: 14, t3: 6 },   // недельный прирост при полной дисциплине
        POOL_CAP: { t1: 42, t3: 18 },
        GROW_FLOOR: 0.25,     // прирост = GROW × (GROW_FLOOR + (1−GROW_FLOOR) × min(1, ОД недели / GROW_AP_FULL)): армия растёт от дел
        GROW_AP_FULL: 28,
        START_ARMY: { t1: 8, t3: 0 },
        START_POOL: { t1: 10, t3: 0 },
        START_GOLD: 20,
        LOG_MAX: 5
    };

    var SPHERE_OF_STAT = { str: 'body', end: 'body', agi: 'body', int: 'mind', wil: 'spirit', cha: 'ties' };

    return { NODES: NODES, EDGES: EDGES, TOWN: TOWN, LAIR: LAIR, NODE_LOOT: NODE_LOOT, UNITS: UNITS, UNIT_KEYS: UNIT_KEYS, C: C, SPHERE_OF_STAT: SPHERE_OF_STAT };
});
