// Кампания 3.0, Ф1 — чистая модель вертикального среза (без DOM, без Date.now, без Math.random).
// Время и случайность приходят снаружи: dayKey и сидированный mulberry32 — модель детерминирована (гейт C7).
// ИНВАРИАНТ C4: очки движения (state.ap) растут ТОЛЬКО в applyDeed. Любая другая функция ap лишь тратит или обнуляет.
(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./c3-data.js'), require('../stronghold-model.js'));
    else root.NeuroDeckC3Model = factory(root.NeuroDeckC3Data, root.NeuroDeckStrongholdModel);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(D, SM) {
    'use strict';

    var C = D.C, NODES = D.NODES, TOWN = D.TOWN, LAIR = D.LAIR;
    var ADJ = NODES.map(function() { return []; });
    D.EDGES.forEach(function(e) { ADJ[e[0]].push(e[1]); ADJ[e[1]].push(e[0]); });
    ADJ.forEach(function(a) { a.sort(function(x, y) { return x - y; }); });

    // ---------- детерминизм ----------
    function mulberry32(seed) {
        var a = seed >>> 0;
        return function() {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function hashStr(s) { // FNV-1a 32
        var h = 0x811c9dc5;
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return h >>> 0;
    }
    function stateHash(state) { return hashStr(JSON.stringify(state)).toString(16); }

    // ---------- состояние ----------
    function strSet(str, i, ch) { return str.slice(0, i) + ch + str.slice(i + 1); }
    function newState(dayKey) {
        var own = '', gar = [];
        NODES.forEach(function(n) { own += n.id === TOWN ? '1' : (n.id === LAIR ? '2' : '0'); gar.push(n.gar); });
        var s = {
            v: 1, day: String(dayKey), wk: 0,
            ap: 0, apDay: 0, apWeek: 0, tasksToday: 0, deedsToday: 0, idle: 0, bc: 0,
            pend: { s: 0, h: 0, o: 0 }, // срывы закрываемых суток из хуков Ф0 (молчаливые/честные/просроченные) — ждут dayEnd
            res: { g: C.START_GOLD, s: 0 },
            hero: { node: TOWN, lvl: 1, xp: 0, army: { t1: C.START_ARMY.t1, t3: C.START_ARMY.t3 } },
            own: own, seen: '0'.repeat(NODES.length), gar: gar,
            town: { pool: { t1: C.START_POOL.t1, t3: C.START_POOL.t3 }, forge: 0 },
            fac: { sh: [0, 0, 0, 0, 0, 0, 0] },
            log: [], done: false
        };
        markSeen(s);
        return s;
    }
    function pushLog(s, text) {
        s.log.push({ d: s.day, t: String(text).slice(0, 90) });
        while (s.log.length > C.LOG_MAX) s.log.shift();
    }
    function markSeen(s) {
        var seen = s.seen;
        function see(i) { if (seen.charAt(i) !== '1') seen = strSet(seen, i, '1'); }
        function seeAround(i) { see(i); ADJ[i].forEach(see); }
        seeAround(s.hero.node);
        for (var i = 0; i < NODES.length; i++) if (s.own.charAt(i) === '1') seeAround(i);
        s.seen = seen;
    }

    // ---------- силы ----------
    function shadowSum(s) { var t = 0; s.fac.sh.forEach(function(v) { t += v; }); return t; }
    function shadowMult(s) { return Math.min(C.SHADOW_CAP, 1 + C.SHADOW_K * shadowSum(s)); }
    function armyPower(s) {
        var p = 0;
        D.UNIT_KEYS.forEach(function(k) { p += (s.hero.army[k] || 0) * D.UNITS[k].power; });
        return Math.round(p * (1 + C.FORGE_ATK * s.town.forge) * (1 + C.LVL_ATK * (s.hero.lvl - 1)));
    }
    function nodeDefense(s, id) {
        var o = s.own.charAt(id);
        if (o === '1') return C.NODE_DEF + C.FORGE_DEF * s.town.forge;
        if (id === LAIR) return Math.round(s.gar[id] * shadowMult(s));
        return s.gar[id];
    }
    function isHostile(s, id) {
        var o = s.own.charAt(id);
        return o !== '1' && (s.gar[id] > 0 || o === '2');
    }

    // ---------- дела → очки движения (единственный источник ОД) ----------
    function rankBonus(rank) {
        var r = String(rank || '');
        if (r === 'SS' || r === 'SSS') return 2;
        if (r.charAt(0) === 'A' || r === 'S') return 1;
        return 0;
    }
    function deedAp(deed) {
        if (deed.kind === 'task') return 2;
        return 1 + rankBonus(deed.rank);
    }
    // deed: {kind:'habit'|'task', sphere, rank}; возвращает {gained, reason?}
    function applyDeed(s, deed) {
        if (!deed || (deed.kind !== 'habit' && deed.kind !== 'task')) return { gained: 0, reason: 'kind' };
        if (deed.kind === 'habit' && deed.sphere !== 'body') return { gained: 0, reason: 'sphere' }; // Ф1: только Тело
        if (deed.kind === 'task') {
            if (s.tasksToday >= C.TASK_CAP_DAY) return { gained: 0, reason: 'cap' };
            s.tasksToday++;
        }
        var amount = deedAp(deed);
        var comeback = s.idle >= C.COMEBACK_IDLE && s.deedsToday === 0;
        if (comeback) amount *= 2;
        amount = Math.min(amount, C.AP_CAP_DAY - s.apDay);
        if (amount <= 0) return { gained: 0, reason: 'cap' };
        s.ap += amount; s.apDay += amount; s.apWeek += amount; s.deedsToday++;
        if (deed.kind === 'habit') s.res.s += 1;
        addXp(s, amount);
        return { gained: amount, comeback: comeback };
    }
    function addXp(s, n) {
        s.hero.xp += n;
        while (s.hero.xp >= C.XP_PER_LVL * s.hero.lvl) { s.hero.xp -= C.XP_PER_LVL * s.hero.lvl; s.hero.lvl++; }
    }

    // ---------- карта и движение ----------
    function shortestPath(from, to) { // Дейкстра по стоимости входа; детерминированный тай-брейк по id
        var dist = NODES.map(function() { return Infinity; }), prev = NODES.map(function() { return -1; }), done = {};
        dist[from] = 0;
        for (;;) {
            var u = -1, best = Infinity;
            for (var i = 0; i < NODES.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
            if (u < 0 || u === to) break;
            done[u] = true;
            ADJ[u].forEach(function(v) {
                var nd = dist[u] + NODES[v].cost;
                if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
            });
        }
        if (dist[to] === Infinity) return null;
        var path = [], cur = to;
        while (cur !== from) { path.unshift(cur); cur = prev[cur]; }
        return { path: path, cost: dist[to] };
    }
    // Что будет, если идти к узлу: шаги до первого враждебного узла (бой — отдельное решение игрока)
    function route(s, to) {
        var sp = shortestPath(s.hero.node, to);
        if (!sp) return null;
        var steps = [], cost = 0, battleNode = null;
        for (var i = 0; i < sp.path.length; i++) {
            var id = sp.path[i];
            if (isHostile(s, id)) { battleNode = id; break; }
            steps.push(id); cost += NODES[id].cost;
        }
        return { steps: steps, cost: cost, battleNode: battleNode, total: sp.cost };
    }
    function travel(s, to) { // идёт, пока хватает ОД и путь свободен; возвращает {moved, stopped, battleNode}
        var r = route(s, to);
        if (!r) return { moved: [], stopped: 'noroute', battleNode: null };
        var moved = [];
        for (var i = 0; i < r.steps.length; i++) {
            var id = r.steps[i], c = NODES[id].cost;
            if (s.ap < c) { markSeen(s); return { moved: moved, stopped: 'ap', battleNode: null }; }
            s.ap -= c; s.hero.node = id; moved.push(id);
        }
        markSeen(s);
        return { moved: moved, stopped: r.battleNode !== null ? 'hostile' : 'arrived', battleNode: r.battleNode };
    }

    // ---------- бой ----------
    function forecast(s, id) {
        var adjacent = ADJ[s.hero.node].indexOf(id) >= 0;
        var atk = armyPower(s), def = nodeDefense(s, id);
        var out = SM.assaultOutcome(atk, def, { rand: function() { return 0.5; } }); // прогноз: средний исход
        return { adjacent: adjacent, hostile: isHostile(s, id), atk: atk, def: def, ratio: out.ratio, win: out.win, attritionPct: out.attritionPct, ap: NODES[id].cost };
    }
    function applyLoss(army, pct) {
        D.UNIT_KEYS.forEach(function(k) {
            var n = army[k] || 0;
            army[k] = n - Math.min(Math.ceil(n * pct), Math.max(0, n - 1)); // малые стопы тоже платят за бой; стопа не исчезает целиком
        });
    }
    function engage(s, id) { // бой с соседним враждебным узлом; {ok, win?, reason?}
        if (s.done) return { ok: false, reason: 'done' };
        if (ADJ[s.hero.node].indexOf(id) < 0) return { ok: false, reason: 'far' };
        if (!isHostile(s, id)) return { ok: false, reason: 'peace' };
        var cost = NODES[id].cost;
        if (s.ap < cost) return { ok: false, reason: 'ap' };
        s.ap -= cost;
        var atk = armyPower(s), def = nodeDefense(s, id);
        var out = SM.assaultOutcome(atk, def, { rand: mulberry32(hashStr(s.day + '|' + s.bc)) });
        s.bc++;
        applyLoss(s.hero.army, out.attritionPct);
        var name = NODES[id].name;
        if (out.win) {
            s.own = strSet(s.own, id, '1'); s.gar[id] = 0; s.hero.node = id;
            var loot = D.NODE_LOOT[id] || { g: 0 };
            s.res.g += loot.g || 0;
            addXp(s, 3);
            if (id === LAIR) { s.done = true; pushLog(s, 'Победа! «' + name + '» пало — срез пройден'); }
            else pushLog(s, 'Взято: ' + name + (loot.g ? ' (+' + loot.g + ' 💰)' : ''));
            markSeen(s);
        } else {
            pushLog(s, 'Отбит штурм: ' + name + ' (потери ' + Math.round(out.attritionPct * 100) + '%)');
        }
        return { ok: true, win: out.win, ratio: out.ratio, attritionPct: out.attritionPct };
    }

    // ---------- экономика города ----------
    function hire(s, tier, n) {
        n = Math.floor(Number(n));
        if (!D.UNITS[tier] || !(n >= 1)) return { ok: false, reason: 'arg' };
        if (s.hero.node !== TOWN) return { ok: false, reason: 'away' };
        if (n > s.town.pool[tier]) return { ok: false, reason: 'pool' };
        var cost = n * D.UNITS[tier].cost;
        if (s.res.g < cost) return { ok: false, reason: 'gold' };
        s.res.g -= cost; s.town.pool[tier] -= n; s.hero.army[tier] = (s.hero.army[tier] || 0) + n;
        return { ok: true, cost: cost };
    }
    function forgeCost(s) { return C.FORGE_COST * (s.town.forge + 1); }
    function buyForge(s) {
        if (s.town.forge >= C.FORGE_MAX) return { ok: false, reason: 'max' };
        var c = forgeCost(s);
        if (s.res.s < c) return { ok: false, reason: 'steel' };
        s.res.s -= c; s.town.forge++;
        return { ok: true, cost: c };
    }

    // ---------- конец дня и недели ----------
    // input: {silent, honest, overdue} — счётчики срывов закрываемых суток (из хуков Ф0)
    function dayEnd(s, nextDay, input) {
        input = input || {};
        var shadows = Math.max(0, Number(input.silent) || 0) + 0.5 * Math.max(0, Number(input.honest) || 0) + Math.max(0, Number(input.overdue) || 0);
        s.fac.sh.push(shadows); while (s.fac.sh.length > 7) s.fac.sh.shift();
        if (s.deedsToday === 0) s.idle++; else s.idle = 0;
        s.ap = Math.min(C.AP_CARRY, s.ap); // сгорает; перенос ≤ AP_CARRY (ОД не прибавляются)
        s.res.g += C.GOLD_DAY;
        if (s.own.charAt(2) === '1') s.res.s += C.STEEL_MINE_DAY;
        s.apDay = 0; s.tasksToday = 0; s.deedsToday = 0;
        s.day = String(nextDay);
        return { shadows: shadows };
    }
    function weekEnd(s) {
        s.wk++;
        // прирост существ зависит от дел недели: без дел армия почти не растёт (иначе кампания шла бы сама)
        var f = C.GROW_FLOOR + (1 - C.GROW_FLOOR) * Math.min(1, s.apWeek / C.GROW_AP_FULL);
        D.UNIT_KEYS.forEach(function(k) { s.town.pool[k] = Math.min(C.POOL_CAP[k], s.town.pool[k] + Math.floor(C.POOL_GROW[k] * f)); });
        s.apWeek = 0;
        if (s.done) return { raid: null };
        var sum = shadowSum(s);
        if (sum < C.RAID_MIN_SHADOW) return { raid: null };
        // цель — ближайший к логову занятый узел (не город, не тот, где стоит герой)
        var target = -1, best = Infinity;
        for (var i = 0; i < NODES.length; i++) {
            if (i === TOWN || i === LAIR || s.own.charAt(i) !== '1' || s.hero.node === i) continue;
            var sp = shortestPath(LAIR, i);
            if (sp && sp.cost < best) { best = sp.cost; target = i; }
        }
        if (target < 0) return { raid: null };
        var power = Math.round(s.gar[LAIR] * shadowMult(s) * C.RAID_K), def = nodeDefense(s, target);
        if (power / def > C.RAID_RATIO) {
            s.own = strSet(s.own, target, '0'); s.gar[target] = C.NODE_DEF;
            pushLog(s, 'Лень отбила «' + NODES[target].name + '» (' + power + ' vs ' + def + ')');
            return { raid: { node: target, win: true, power: power, def: def } };
        }
        pushLog(s, 'Набег Лени отбит у «' + NODES[target].name + '» (' + power + ' vs ' + def + ')');
        return { raid: { node: target, win: false, power: power, def: def } };
    }

    return {
        mulberry32: mulberry32, hashStr: hashStr, stateHash: stateHash,
        newState: newState, pushLog: pushLog, markSeen: markSeen,
        shadowSum: shadowSum, shadowMult: shadowMult, armyPower: armyPower, nodeDefense: nodeDefense, isHostile: isHostile,
        rankBonus: rankBonus, deedAp: deedAp, applyDeed: applyDeed,
        shortestPath: shortestPath, route: route, travel: travel,
        forecast: forecast, engage: engage,
        hire: hire, forgeCost: forgeCost, buyForge: buyForge,
        dayEnd: dayEnd, weekEnd: weekEnd,
        ADJ: ADJ
    };
});
