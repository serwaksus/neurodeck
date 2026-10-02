// Кампания 3.0, Ф2 — данные карты: 4 региона-сферы × 8 узлов + Логово Лени в центре, 4 героя, 5 ресурсов, 4 города.
// Чистые данные без DOM; UMD как js/stronghold-model.js. Дизайн: docs/plan/CAMPAIGN-3.0.md.
(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.NeuroDeckC3Data = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    // Сферы жизни = герои. Порядок фиксирован: он же индекс героя, региона и города.
    var SPHERES = ['body', 'mind', 'spirit', 'ties'];
    var SPHERE_NAME = { body: 'Тело', mind: 'Разум', spirit: 'Дух', ties: 'Связи' };
    var HERO_NAME = { body: 'Воитель', mind: 'Мудрец', spirit: 'Подвижник', ties: 'Посол' };
    // ресурс сферы (ключ в state.res); золото — общий ресурс res.g
    var RES_KEY = { body: 'st', mind: 'kn', spirit: 'wl', ties: 'in' };
    var RES_NAME = { st: 'Сталь', kn: 'Знания', wl: 'Воля', in: 'Влияние' };
    var RES_ICON = { st: '⚒', kn: '📘', wl: '🕯', in: '🤝' };
    var SPHERE_OF_STAT = { str: 'body', end: 'body', agi: 'body', int: 'mind', wil: 'spirit', cha: 'ties' };
    // здание-«зал» города сферы: Кузня / Академия / Монастырь / Ярмарка (до 3 уровней, цена в ресурсе сферы)
    var HALL = {
        body:   { name: 'Кузня',    desc: '+10% атаки всех армий за уровень' },
        mind:   { name: 'Академия', desc: '+10% прироста существ во всех городах за уровень' },
        spirit: { name: 'Монастырь', desc: '+20 обороны занятых узлов и −10% к росту теней за уровень' },
        ties:   { name: 'Ярмарка',  desc: '+5 золота в день и −10% цены найма за уровень' }
    };

    // ---------- карта ----------
    // Шаблон региона (Юго-запад = Тело): 8 локальных узлов; остальные регионы — зеркала. Узел = {t:type, x, y, c:вход, g:оборона}.
    //   0 город — 1 тропа — 2 шахта сферы; 1 — 3 перекрёсток — 4 застава (граница) ; 3 — 5 дорога — 6 тайник (граница), 5 — 7 форт у центра
    var TEMPLATE = [
        { t: 'town',   x: 8,  y: 92, c: 1, g: 0 },
        { t: 'path',   x: 22, y: 86, c: 1, g: 0 },
        { t: 'mine',   x: 8,  y: 72, c: 1, g: 15 },
        { t: 'path',   x: 30, y: 74, c: 1, g: 0 },
        { t: 'camp',   x: 22, y: 58, c: 1, g: 40 },
        { t: 'swamp',  x: 42, y: 78, c: 2, g: 0 },
        { t: 'cache',  x: 46, y: 92, c: 1, g: 25 },
        { t: 'fort',   x: 40, y: 62, c: 1, g: 120 }
    ];
    var LOCAL_EDGES = [[0, 1], [1, 2], [1, 3], [3, 4], [3, 5], [5, 6], [5, 7]];
    var NAMES = {
        town:  { body: 'Кузня', mind: 'Академия', spirit: 'Монастырь', ties: 'Ярмарка' },
        mine:  { body: 'Сталелитейная шахта', mind: 'Библиотека-копи', spirit: 'Родник воли', ties: 'Торговая жила' },
        path: 'Дорога', camp: 'Застава', swamp: 'Топь', cache: 'Тайник', fort: 'Форт'
    };
    function mirror(k, p) { // k: 0 Тело(ЮЗ), 1 Разум(СЗ), 2 Дух(СВ), 3 Связи(ЮВ)
        return k === 0 ? { x: p.x, y: p.y } : k === 1 ? { x: p.x, y: 100 - p.y } : k === 2 ? { x: 100 - p.x, y: 100 - p.y } : { x: 100 - p.x, y: p.y };
    }
    var NODES = [], EDGES = [];
    SPHERES.forEach(function(sp, k) {
        TEMPLATE.forEach(function(n, j) {
            var pos = mirror(k, n);
            var nm = (n.t === 'town' || n.t === 'mine') ? NAMES[n.t][sp] : NAMES[n.t] || n.t;
            NODES.push({ id: k * 8 + j, type: n.t, sphere: sp, name: nm, cost: n.c, gar: n.g, x: pos.x, y: pos.y });
        });
        LOCAL_EDGES.forEach(function(e) { EDGES.push([k * 8 + e[0], k * 8 + e[1]]); });
    });
    var LAIR = NODES.length; // 32
    NODES.push({ id: LAIR, type: 'lair', sphere: null, name: 'Логово Лени', cost: 1, gar: 1400, x: 50, y: 50 });
    // граничные дороги по кольцу Тело–Разум–Дух–Связи и подступы к логову
    EDGES.push([4, 12], [14, 22], [20, 28], [30, 6]);
    [7, 15, 23, 31].forEach(function(f) { EDGES.push([f, LAIR]); });
    var TOWNS = [0, 8, 16, 24]; // индекс = сфера
    var MINES = [2, 10, 18, 26];

    // награда за первое взятие узла: золото 3.0 (свой кошелёк, не HERO.gold) и ресурс сферы региона
    var LOOT = { camp: { g: 25 }, fort: { g: 60 }, cache: { g: 50, r: 4 }, lair: { g: 200 }, mine: {} };

    // Единицы; сила совпадает с UNIT_TIERS (js/stronghold-data.js) — проверяет тест; цена в золоте 3.0 вдвое выше.
    // res — ресурсы за штуку: own — сферы города, nb — соседней сферы по кольцу (Тело→Разум→Дух→Связи→Тело).
    var UNITS = {
        t1: { icon: '🗡', name: 'Ополченец',   power: 2,   cost: 2,   own: 0, nb: 0 },
        t3: { icon: '🏹', name: 'Тень-Лучник', power: 16,  cost: 30,  own: 2, nb: 0 },
        t5: { icon: '🐎', name: 'Всадник Пепла', power: 140, cost: 320, own: 6, nb: 3 }
    };
    var UNIT_KEYS = ['t1', 't3', 't5'];
    // жилища t3/t5 строятся в городе: золото + ресурсы (own — сферы города, nb — соседней)
    var DWELLING = { t3: { g: 60, own: 5, nb: 0 }, t5: { g: 200, own: 10, nb: 5 } };

    var C = {
        AP_CAP_DAY: 6,        // очков движения в сутки на героя
        AP_CARRY: 1,          // переносится на следующий день (на героя)
        TASK_CAP_DAY: 5,      // задач в сутки, дающих ОД (всего)
        COMEBACK_IDLE: 3,     // дней без дел, после которых первое дело дня даёт ×2 ОД
        GOLD_TOWN_DAY: 10,    // доход одного города
        MINE_DAY: 1,          // ресурса сферы в день с шахты
        SHADOW_K: 0.15,       // рост силы Лени за «тень» недели (окно 7 дней)
        SHADOW_CAP: 2.5,      // потолок множителя
        RAID_K: 0.03,         // доля силы логова в недельном набеге на удалённый узел
        RAID_RATIO: 1.2,
        RAID_MIN_SHADOW: 3,
        NODE_DEF: 40,         // оборона занятого игроком узла
        HALL_MAX: 3,
        HALL_COST: 5,         // ресурса сферы за уровень зала: HALL_COST × (уровень+1)
        HALL_ATK: 0.1, HALL_GROW: 0.1, HALL_DEF: 20, HALL_SHADOW: 0.1, HALL_GOLD: 5, HALL_DISC: 0.1,
        LVL_ATK: 0.02,        // +к атаке героя за уровень
        XP_PER_LVL: 8,
        POOL_GROW: { t1: 14, t3: 6, t5: 2 },   // недельный прирост при полной дисциплине сферы
        POOL_CAP: { t1: 42, t3: 18, t5: 6 },
        GROW_FLOOR: 0.25,     // прирост = GROW × (GROW_FLOOR + (1−GROW_FLOOR) × min(1, ОД сферы за неделю / GROW_AP_FULL))
        GROW_AP_FULL: 7,
        START_ARMY: { t1: 8, t3: 0, t5: 0 },
        START_POOL: { t1: 10, t3: 0, t5: 0 },
        START_GOLD: 40,
        LOG_MAX: 6
    };

    return { SPHERES: SPHERES, SPHERE_NAME: SPHERE_NAME, HERO_NAME: HERO_NAME, RES_KEY: RES_KEY, RES_NAME: RES_NAME, RES_ICON: RES_ICON,
        SPHERE_OF_STAT: SPHERE_OF_STAT, HALL: HALL, NODES: NODES, EDGES: EDGES, LAIR: LAIR, TOWNS: TOWNS, MINES: MINES, LOOT: LOOT,
        UNITS: UNITS, UNIT_KEYS: UNIT_KEYS, DWELLING: DWELLING, C: C };
});
