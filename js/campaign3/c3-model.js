// Кампания 3.0, Ф2 — чистая модель: 4 героя-сферы на карте из 33 узлов (без DOM, Date.now и Math.random).
// Время и случайность приходят снаружи: dayKey и сидированный mulberry32 — модель детерминирована (гейт C7).
// ИНВАРИАНТ C4: очки движения (state.ap[]) растут ТОЛЬКО в applyDeed. Любая другая функция ap лишь тратит или обнуляет.
(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./c3-data.js'), require('../stronghold-model.js'));
    else root.NeuroDeckC3Model = factory(root.NeuroDeckC3Data, root.NeuroDeckStrongholdModel);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(D, SM) {
    'use strict';

    var C = D.C, NODES = D.NODES, LAIR = D.LAIR, N = NODES.length, SPHERES = D.SPHERES;
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
    function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
    function newState(dayKey) {
        var own = '', gar = [];
        NODES.forEach(function(n) { own += (n.type === 'town') ? '1' : (n.id === LAIR ? '2' : '0'); gar.push(n.gar); });
        var s = {
            v: 2, day: String(dayKey), wk: 0, idle: 0, bc: 0, tasksToday: 0, deedsToday: 0,
            ap: zeros(4), apDay: zeros(4), apWeek: zeros(4),
            pend: { s: 0, h: 0, o: 0 }, // срывы закрываемых суток из хуков Ф0 (молчаливые/честные/просроченные) — ждут dayEnd
            res: { g: C.START_GOLD, st: 0, kn: 0, wl: 0, in: 0 },
            heroes: SPHERES.map(function(sp, i) { return { node: D.TOWNS[i], lvl: 1, xp: 0, army: { t1: C.START_ARMY.t1, t3: C.START_ARMY.t3, t5: C.START_ARMY.t5 } }; }),
            own: own, seen: '0'.repeat(N), gar: gar,
            towns: SPHERES.map(function() { return { pool: { t1: C.START_POOL.t1, t3: C.START_POOL.t3, t5: C.START_POOL.t5 }, dw: { t3: 0, t5: 0 }, hall: 0 }; }),
            fac: { sh: zeros(7) },
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
        s.heroes.forEach(function(h) { seeAround(h.node); });
        for (var i = 0; i < N; i++) if (s.own.charAt(i) === '1') seeAround(i);
        s.seen = seen;
    }

    // ---------- залы городов и силы ----------
    function hall(s, sphere) { return s.towns[SPHERES.indexOf(sphere)].hall; }
    function shadowSum(s) { var t = 0; s.fac.sh.forEach(function(v) { t += v; }); return t; }
    function shadowMult(s) { return Math.min(C.SHADOW_CAP, 1 + C.SHADOW_K * (1 - C.HALL_SHADOW * hall(s, 'spirit')) * shadowSum(s)); }
    function armyPower(s, h) {
        var hero = s.heroes[h], p = 0;
        D.UNIT_KEYS.forEach(function(k) { p += (hero.army[k] || 0) * D.UNITS[k].power; });
        return Math.round(p * (1 + C.HALL_ATK * hall(s, 'body')) * (1 + C.LVL_ATK * (hero.lvl - 1)));
    }
    function nodeDefense(s, id) {
        var o = s.own.charAt(id);
        if (o === '1') return C.NODE_DEF + C.HALL_DEF * hall(s, 'spirit');
        if (id === LAIR) return Math.round(s.gar[id] * shadowMult(s));
        return s.gar[id];
    }
    function isHostile(s, id) {
        var o = s.own.charAt(id);
        return o !== '1' && (s.gar[id] > 0 || o === '2');
    }
    function nodeSphere(id) { return NODES[id].sphere; }

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
    // deed: {kind:'habit'|'task', sphere:'body'|'mind'|'spirit'|'ties', rank}; задача без валидной сферы идёт в «Разум»
    function applyDeed(s, deed) {
        if (!deed || (deed.kind !== 'habit' && deed.kind !== 'task')) return { gained: 0, reason: 'kind' };
        var sphere = deed.sphere;
        if (SPHERES.indexOf(sphere) < 0) { if (deed.kind === 'task') sphere = 'mind'; else return { gained: 0, reason: 'sphere' }; }
        var h = SPHERES.indexOf(sphere);
        if (deed.kind === 'task') {
            if (s.tasksToday >= C.TASK_CAP_DAY) return { gained: 0, reason: 'cap' };
            s.tasksToday++;
        }
        var amount = deedAp(deed);
        var comeback = s.idle >= C.COMEBACK_IDLE && s.deedsToday === 0;
        if (comeback) amount *= 2;
        amount = Math.min(amount, C.AP_CAP_DAY - s.apDay[h]);
        if (amount <= 0) return { gained: 0, reason: 'cap', hero: h };
        s.ap[h] += amount; s.apDay[h] += amount; s.apWeek[h] += amount; s.deedsToday++;
        s.res[D.RES_KEY[sphere]] += 1;
        addXp(s, h, amount);
        return { gained: amount, hero: h, sphere: sphere, comeback: comeback };
    }
    function addXp(s, h, n) {
        var hero = s.heroes[h];
        hero.xp += n;
        while (hero.xp >= C.XP_PER_LVL * hero.lvl) { hero.xp -= C.XP_PER_LVL * hero.lvl; hero.lvl++; }
    }

    // ---------- карта и движение ----------
    var HOSTILE_DETOUR = 30; // обход врага выгоднее боя: вражеский узел «стоит» как 30 лишних ОД (если он не цель)
    function shortestPath(from, to, s) { // Дейкстра по стоимости входа; детерминированный тай-брейк по id; со state — обходит врагов
        var dist = NODES.map(function() { return Infinity; }), prev = NODES.map(function() { return -1; }), done = {};
        dist[from] = 0;
        for (;;) {
            var u = -1, best = Infinity;
            for (var i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
            if (u < 0 || u === to) break;
            done[u] = true;
            ADJ[u].forEach(function(v) {
                var nd = dist[u] + NODES[v].cost + ((s && v !== to && isHostile(s, v)) ? HOSTILE_DETOUR : 0);
                if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
            });
        }
        if (dist[to] === Infinity) return null;
        var path = [], cur = to, real = 0;
        while (cur !== from) { path.unshift(cur); real += NODES[cur].cost; cur = prev[cur]; }
        return { path: path, cost: real };
    }
    function route(s, h, to) { // шаги героя h до первого враждебного узла (бой — отдельное решение игрока)
        var sp = shortestPath(s.heroes[h].node, to, s);
        if (!sp) return null;
        var steps = [], cost = 0, battleNode = null;
        for (var i = 0; i < sp.path.length; i++) {
            var id = sp.path[i];
            if (isHostile(s, id)) { battleNode = id; break; }
            steps.push(id); cost += NODES[id].cost;
        }
        return { steps: steps, cost: cost, battleNode: battleNode, total: sp.cost };
    }
    function travel(s, h, to) { // идёт, пока хватает ОД героя и путь свободен
        var r = route(s, h, to);
        if (!r) return { moved: [], stopped: 'noroute', battleNode: null };
        var moved = [], hero = s.heroes[h];
        for (var i = 0; i < r.steps.length; i++) {
            var id = r.steps[i], c = NODES[id].cost;
            if (s.ap[h] < c) { markSeen(s); return { moved: moved, stopped: 'ap', battleNode: null }; }
            s.ap[h] -= c; hero.node = id; moved.push(id);
        }
        markSeen(s);
        return { moved: moved, stopped: r.battleNode !== null ? 'hostile' : 'arrived', battleNode: r.battleNode };
    }

    // ---------- бой ----------
    function forecast(s, h, id) {
        var adjacent = ADJ[s.heroes[h].node].indexOf(id) >= 0;
        var atk = armyPower(s, h), def = nodeDefense(s, id);
        var out = SM.assaultOutcome(atk, def, { rand: function() { return 0.5; } }); // прогноз: средний исход
        return { adjacent: adjacent, hostile: isHostile(s, id), atk: atk, def: def, ratio: out.ratio, win: out.win, attritionPct: out.attritionPct, ap: NODES[id].cost };
    }
    function applyLoss(army, pct) {
        D.UNIT_KEYS.forEach(function(k) {
            var n = army[k] || 0;
            army[k] = n - Math.min(Math.ceil(n * pct), Math.max(0, n - 1)); // малые стопы тоже платят за бой; стопа не исчезает целиком
        });
    }
    function engage(s, h, id) { // бой героя h с соседним враждебным узлом; {ok, win?, reason?}
        if (s.done) return { ok: false, reason: 'done' };
        var hero = s.heroes[h];
        if (ADJ[hero.node].indexOf(id) < 0) return { ok: false, reason: 'far' };
        if (!isHostile(s, id)) return { ok: false, reason: 'peace' };
        var cost = NODES[id].cost;
        if (s.ap[h] < cost) return { ok: false, reason: 'ap' };
        s.ap[h] -= cost;
        var atk = armyPower(s, h), def = nodeDefense(s, id);
        var out = SM.assaultOutcome(atk, def, { rand: mulberry32(hashStr(s.day + '|' + s.bc)) });
        s.bc++;
        applyLoss(hero.army, out.attritionPct);
        var n = NODES[id];
        if (out.win) {
            s.own = strSet(s.own, id, '1'); s.gar[id] = 0; hero.node = id;
            var loot = D.LOOT[n.type] || {};
            s.res.g += loot.g || 0;
            if (loot.r && n.sphere) s.res[D.RES_KEY[n.sphere]] += loot.r;
            addXp(s, h, 3);
            if (id === LAIR) { s.done = true; pushLog(s, 'Победа! «' + n.name + '» пало — карта пройдена'); }
            else pushLog(s, D.HERO_NAME[SPHERES[h]] + ' взял: ' + n.name + (loot.g ? ' (+' + loot.g + ' 💰)' : ''));
            markSeen(s);
        } else {
            pushLog(s, D.HERO_NAME[SPHERES[h]] + ': штурм «' + n.name + '» отбит (потери ' + Math.round(out.attritionPct * 100) + '%)');
        }
        return { ok: true, win: out.win, ratio: out.ratio, attritionPct: out.attritionPct };
    }

    // ---------- города: найм, жилища, залы, передача армий ----------
    function townAt(s, h) { // индекс города (= сферы), в котором стоит герой h, иначе -1
        var node = s.heroes[h].node;
        return D.TOWNS.indexOf(node);
    }
    function resNeed(unit, n, townIdx) { // ресурсы за n существ: собственный ресурс города и соседний по кольцу
        var own = D.RES_KEY[SPHERES[townIdx]], nb = D.RES_KEY[SPHERES[(townIdx + 1) % 4]], out = {};
        out[own] = n * unit.own;
        if (unit.nb) out[nb] = (out[nb] || 0) + n * unit.nb;
        return out;
    }
    function canPay(s, gold, need) {
        if (s.res.g < gold) return 'gold';
        for (var k in need) if (need[k] > 0 && s.res[k] < need[k]) return k;
        return null;
    }
    function pay(s, gold, need) { s.res.g -= gold; for (var k in need) s.res[k] -= need[k]; }
    function hireDiscount(s) { return 1 - C.HALL_DISC * hall(s, 'ties'); }
    function hireGold(s, tier, n) { return Math.ceil(n * D.UNITS[tier].cost * hireDiscount(s)); }
    function hire(s, h, tier, n) {
        n = Math.floor(Number(n));
        var u = D.UNITS[tier];
        if (!u || !(n >= 1)) return { ok: false, reason: 'arg' };
        var t = townAt(s, h);
        if (t < 0) return { ok: false, reason: 'away' };
        var town = s.towns[t];
        if (tier !== 't1' && !town.dw[tier]) return { ok: false, reason: 'nodwelling' };
        if (n > town.pool[tier]) return { ok: false, reason: 'pool' };
        var gold = hireGold(s, tier, n), need = resNeed(u, n, t), lack = canPay(s, gold, need);
        if (lack) return { ok: false, reason: lack === 'gold' ? 'gold' : 'res', res: lack };
        pay(s, gold, need);
        town.pool[tier] -= n; s.heroes[h].army[tier] = (s.heroes[h].army[tier] || 0) + n;
        return { ok: true, cost: gold };
    }
    function dwellingCost(s, t, tier) {
        var d = D.DWELLING[tier], own = D.RES_KEY[SPHERES[t]], nb = D.RES_KEY[SPHERES[(t + 1) % 4]], need = {};
        need[own] = d.own; if (d.nb) need[nb] = (need[nb] || 0) + d.nb;
        return { g: d.g, need: need };
    }
    function buildDwelling(s, h, tier) { // жилище в городе, где стоит герой
        var t = townAt(s, h);
        if (t < 0) return { ok: false, reason: 'away' };
        if (!D.DWELLING[tier]) return { ok: false, reason: 'arg' };
        var town = s.towns[t];
        if (town.dw[tier]) return { ok: false, reason: 'built' };
        if (tier === 't5' && !town.dw.t3) return { ok: false, reason: 'prereq' };
        var c = dwellingCost(s, t, tier), lack = canPay(s, c.g, c.need);
        if (lack) return { ok: false, reason: lack === 'gold' ? 'gold' : 'res', res: lack };
        pay(s, c.g, c.need); town.dw[tier] = 1;
        return { ok: true };
    }
    function hallCost(s, t) { return C.HALL_COST * (s.towns[t].hall + 1); }
    function buyHall(s, h) { // зал сферы города, где стоит герой; цена — ресурс этой сферы
        var t = townAt(s, h);
        if (t < 0) return { ok: false, reason: 'away' };
        var town = s.towns[t];
        if (town.hall >= C.HALL_MAX) return { ok: false, reason: 'max' };
        var key = D.RES_KEY[SPHERES[t]], c = hallCost(s, t);
        if (s.res[key] < c) return { ok: false, reason: 'res', res: key };
        s.res[key] -= c; town.hall++;
        return { ok: true, cost: c };
    }
    function transfer(s, from, to, tier, n) { // герои на одном узле передают войска (сбор армии перед штурмом)
        n = Math.floor(Number(n));
        if (from === to || !(n >= 1) || !D.UNITS[tier]) return { ok: false, reason: 'arg' };
        if (s.heroes[from].node !== s.heroes[to].node) return { ok: false, reason: 'apart' };
        var have = s.heroes[from].army[tier] || 0;
        if (n > have) return { ok: false, reason: 'army' };
        s.heroes[from].army[tier] = have - n; s.heroes[to].army[tier] = (s.heroes[to].army[tier] || 0) + n;
        return { ok: true };
    }
    function transferAll(s, from, to) {
        if (from === to || s.heroes[from].node !== s.heroes[to].node) return { ok: false, reason: 'apart' };
        D.UNIT_KEYS.forEach(function(k) { var n = s.heroes[from].army[k] || 0; if (n > 0) { s.heroes[from].army[k] = 0; s.heroes[to].army[k] = (s.heroes[to].army[k] || 0) + n; } });
        return { ok: true };
    }

    // ---------- конец дня и недели ----------
    // input: {silent, honest, overdue} — счётчики срывов закрываемых суток (из хуков Ф0)
    function dayEnd(s, nextDay, input) {
        input = input || {};
        var shadows = Math.max(0, Number(input.silent) || 0) + 0.5 * Math.max(0, Number(input.honest) || 0) + Math.max(0, Number(input.overdue) || 0);
        s.fac.sh.push(shadows); while (s.fac.sh.length > 7) s.fac.sh.shift();
        if (s.deedsToday === 0) s.idle++; else s.idle = 0;
        for (var i = 0; i < 4; i++) s.ap[i] = Math.min(C.AP_CARRY, s.ap[i]); // сгорает; перенос ≤ AP_CARRY на героя (ОД не прибавляются)
        s.res.g += C.GOLD_TOWN_DAY * 4 + C.HALL_GOLD * hall(s, 'ties');
        for (var m = 0; m < 4; m++) if (s.own.charAt(D.MINES[m]) === '1') s.res[D.RES_KEY[SPHERES[m]]] += C.MINE_DAY;
        s.apDay = zeros(4); s.tasksToday = 0; s.deedsToday = 0;
        s.day = String(nextDay);
        return { shadows: shadows };
    }
    function weekEnd(s) {
        s.wk++;
        var grow = 1 + C.HALL_GROW * hall(s, 'mind');
        for (var t = 0; t < 4; t++) {
            var f = C.GROW_FLOOR + (1 - C.GROW_FLOOR) * Math.min(1, s.apWeek[t] / C.GROW_AP_FULL); // прирост города — от дел его сферы
            D.UNIT_KEYS.forEach(function(k) {
                if (k !== 't1' && !s.towns[t].dw[k]) return;
                s.towns[t].pool[k] = Math.min(C.POOL_CAP[k], s.towns[t].pool[k] + Math.floor(C.POOL_GROW[k] * f * grow));
            });
        }
        s.apWeek = zeros(4);
        if (s.done) return { raid: null };
        var sum = shadowSum(s);
        if (sum < C.RAID_MIN_SHADOW) return { raid: null };
        // цель — ближайший к логову занятый узел (не город, без стоящего героя)
        var target = -1, best = Infinity, occupied = {};
        s.heroes.forEach(function(hh) { occupied[hh.node] = true; });
        for (var i = 0; i < N; i++) {
            if (NODES[i].type === 'town' || i === LAIR || s.own.charAt(i) !== '1' || occupied[i]) continue;
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
        hall: hall, shadowSum: shadowSum, shadowMult: shadowMult, armyPower: armyPower, nodeDefense: nodeDefense, isHostile: isHostile, nodeSphere: nodeSphere,
        rankBonus: rankBonus, deedAp: deedAp, applyDeed: applyDeed,
        shortestPath: shortestPath, route: route, travel: travel,
        forecast: forecast, engage: engage,
        townAt: townAt, hire: hire, hireGold: hireGold, resNeed: resNeed, dwellingCost: dwellingCost, buildDwelling: buildDwelling, hallCost: hallCost, buyHall: buyHall,
        transfer: transfer, transferAll: transferAll,
        dayEnd: dayEnd, weekEnd: weekEnd,
        ADJ: ADJ
    };
});
