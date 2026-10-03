// Кампания 3.0, Ф6 — чистая модель: 4 героя-сферы и 4 ИИ-фракции пороков на карте из 33 узлов (без DOM, Date.now и Math.random).
// Время и случайность приходят снаружи: dayKey и сидированный mulberry32 — модель детерминирована (гейт C7).
// ИНВАРИАНТ C4: очки движения (state.ap[]) растут ТОЛЬКО в applyDeed. Любая другая функция ap лишь тратит или обнуляет.
(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./c3-data.js'), require('../stronghold-model.js'));
    else root.NeuroDeckC3Model = factory(root.NeuroDeckC3Data, root.NeuroDeckStrongholdModel);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(D, SM) {
    'use strict';

    var C = D.C, NODES = D.NODES, LAIR = D.LAIR, N = NODES.length, SPHERES = D.SPHERES, FAC = D.FACTIONS, LAIR_CH = '6';
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
    // Владельцы узлов (символы строки own): '0' нейтрал, '1' игрок, '2'..'5' фракция по индексу (код = 2 + f), '6' цитадель
    function facCode(f) { return String(2 + f); }
    function facOf(ch) { var n = ch.charCodeAt(0) - 50; return (n >= 0 && n <= 3) ? n : -1; }
    // Наследие 2.0 → стартовые бонусы c3. src: {stats:{str:{value}…}, captured, units:{t1..t7}, bosses, seasonNum, throne, ascension}; всё необязательно
    function num(v) { v = Number(v); return isFinite(v) && v > 0 ? v : 0; }
    function legacyFromV14(src) {
        var L = D.LEGACY; src = src || {};
        var stats = src.stats || {}, units = src.units || {};
        var gold = Math.min(L.GOLD_MAX, L.GOLD_SEASON * Math.max(0, Math.floor(num(src.seasonNum)) - 1) + L.GOLD_THRONE * Math.floor(num(src.throne)) + L.GOLD_ASC * Math.floor(num(src.ascension)));
        var halls = Math.min(L.HALL_MAX, Math.floor(num(src.captured) / L.CAPTURED_PER_HALL)), hall = [0, 1, 2, 3].map(function(i) { return i < halls ? 1 : 0; });
        var skills = Math.min(4, Math.ceil(Math.floor(num(src.bosses)) / L.BOSSES_PER_SKILL)), sk = [0, 1, 2, 3].map(function(i) { return i < skills ? 1 : 0; });
        var power = 0; Object.keys(D.LEGACY_POWER).forEach(function(k) { power += Math.floor(num(units[k])) * D.LEGACY_POWER[k]; });
        var army = Math.floor(Math.min(L.ARMY_POWER_MAX, Math.floor(power * L.ARMY_SHARE)) / 2 / 4); // t1 каждому герою
        var groups = [['str', 'end', 'agi'], ['int'], ['wil'], ['cha']];
        var lvl = groups.map(function(g) {
            var sum = 0; g.forEach(function(k) { sum += num(stats[k] && stats[k].value); });
            var v = sum / g.length;
            return Math.min(L.LVL_MAX, 1 + Math.floor(Math.max(0, v - L.STAT_BASE) / L.STAT_PER_LVL));
        });
        return { g: gold, hall: hall, sk: sk, a: army, l: lvl };
    }
    function newState(dayKey, legacy) {
        var own = '', gar = [];
        NODES.forEach(function(n) {
            var ch = '0';
            if (n.type === 'town') ch = '1'; else if (n.id === LAIR) ch = LAIR_CH;
            else if (n.type === 'bastion') ch = facCode(SPHERES.indexOf(n.sphere));
            own += ch; gar.push(n.gar);
        });
        var s = {
            v: 6, day: String(dayKey), wk: 0, idle: 0, bc: 0, stk: zeros(4), dc: zeros(4), ob: zeros(4), obb: zeros(4), cyc: 0, mp: 1, tasksToday: 0, deedsToday: 0,
            ap: zeros(4), apDay: zeros(4), apWeek: zeros(4),
            pend: { s: zeros(4), h: zeros(4), o: zeros(4) }, // срывы закрываемых суток ПО СФЕРАМ из хуков Ф0 — ждут dayEnd
            res: { g: C.START_GOLD, st: 0, kn: 0, wl: 0, in: 0 },
            heroes: SPHERES.map(function(sp, i) { return { node: D.TOWNS[i], lvl: 1, xp: 0, sk: 0, army: { t1: C.START_ARMY.t1, t3: C.START_ARMY.t3, t5: C.START_ARMY.t5 } }; }),
            own: own, seen: '0'.repeat(N), gar: gar,
            towns: SPHERES.map(function() { return { pool: { t1: C.START_POOL.t1, t3: C.START_POOL.t3, t5: C.START_POOL.t5 }, dw: { t3: 0, t5: 0 }, hall: 0 }; }),
            fac: FAC.map(function() { return { sh: zeros(7), dead: 0, truce: 0 }; }),
            sg: zeros(4), lz: { on: 0, left: C.LAZARET_DAYS },
            log: [], done: false
        };
        if (legacy && typeof legacy === 'object') { // Ф5: наследие 2.0 — один раз при создании карты, хранится для экрана «Наследие»
            s.lg = { g: legacy.g | 0, hall: legacy.hall.slice(0, 4), sk: legacy.sk.slice(0, 4), a: legacy.a | 0, l: legacy.l.slice(0, 4) };
            s.res.g += s.lg.g;
            s.heroes.forEach(function(h, i) { h.lvl = s.lg.l[i]; h.sk = s.lg.sk[i]; h.army.t1 += s.lg.a; s.towns[i].hall = s.lg.hall[i]; });
        }
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

    // ---------- города, залы и силы ----------
    function townOwned(s, t) { return s.own.charAt(D.TOWNS[t]) === '1'; }
    function townsOwned(s) { var n = 0; for (var t = 0; t < 4; t++) if (townOwned(s, t)) n++; return n; }
    function hall(s, sphere) { var t = SPHERES.indexOf(sphere); return townOwned(s, t) ? s.towns[t].hall : 0; } // потерянный город не даёт эффекта зала
    function facSum(s, f) { var t = 0; s.fac[f].sh.forEach(function(v) { t += v; }); return t; }
    function shadowSum(s) { var t = 0; for (var f = 0; f < 4; f++) t += facSum(s, f); return t; }
    function shadowK(s) { return C.SHADOW_K * (1 - C.HALL_SHADOW * hall(s, 'spirit')); }
    function facMult(s, f) { return Math.min(C.SHADOW_CAP, 1 + shadowK(s) * facSum(s, f)); }
    function lairMult(s) { return Math.min(C.SHADOW_CAP, 1 + shadowK(s) * shadowSum(s) / C.LAIR_DIV); }
    function shadowMult(s) { return lairMult(s); } // совместимость: множитель цитадели
    function playerShare(s) { var n = 0; for (var i = 0; i < N; i++) if (s.own.charAt(i) === '1') n++; return n / N; }
    function rubber(s) { return playerShare(s) < C.RUBBER_SHARE ? C.RUBBER_MULT : 1; }
    function cycMult(s) { return 1 + C.CYC_K * (s.cyc || 0); } // сложность следующих карт
    function streakWeak(s, f) { return s.stk[f] >= C.WEAKEN_STREAK ? 1 - C.WEAKEN_STREAK_PCT : 1; } // серия дел сферы ≥7 дней держит натиск фракции ниже, обрыв — возвращает силу
    function facPower(s, f, truceBroken) { return Math.round(C.FAC_BASE * facMult(s, f) * streakWeak(s, f) * rubber(s) * cycMult(s) * (truceBroken ? C.TRUCE_BREAK_MULT : 1)); }
    function armyPower(s, h) {
        var hero = s.heroes[h], p = 0;
        D.UNIT_KEYS.forEach(function(k) { p += (hero.army[k] || 0) * D.UNITS[k].power; });
        return Math.round(p * (1 + C.HALL_ATK * hall(s, 'body')) * (1 + C.LVL_ATK * (hero.lvl - 1)));
    }
    function nodeDefense(s, id) {
        var o = s.own.charAt(id);
        if (o === '1') return (NODES[id].type === 'town' ? C.TOWN_DEF : C.NODE_DEF) + C.HALL_DEF * hall(s, 'spirit');
        if (id === LAIR) return Math.round(s.gar[id] * lairMult(s) * cycMult(s));
        var f = facOf(o);
        if (f >= 0 && id === FAC[f].bastion) return Math.round(s.gar[id] * facMult(s, f) * cycMult(s));
        return s.gar[id];
    }
    function isHostile(s, id) {
        var o = s.own.charAt(id);
        return o !== '1' && (s.gar[id] > 0 || o !== '0');
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
        s.ap[h] += amount; s.apDay[h] += amount; s.apWeek[h] += amount; s.deedsToday++; s.dc[h]++;
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
    // ---------- тактики ----------
    function tacticPower(rank) { var i = D.RANKS.indexOf(String(rank)); if (i < 0) i = 0; return C.TACTIC_MIN + (C.TACTIC_MAX - C.TACTIC_MIN) * i / (D.RANKS.length - 1); }
    function skillBonus(s, h, kind) { var k = D.SKILL[SPHERES[h]].kind; return (k && k === kind) ? Math.round(C.SKILL_STEP * s.heroes[h].sk * 1000) / 1000 : 0; }
    // 3 карты на выбор: вид — детерминированно по (день, номер боя, герой), сила — от рангов лучших карточек СФЕРЫ героя (ranks — до 3 строк, от лучшей)
    function offerTactics(s, h, ranks) {
        ranks = Array.isArray(ranks) ? ranks.slice(0, 3) : [];
        var rnd = mulberry32(hashStr(s.day + '|' + s.bc + '|' + h)), first = Math.floor(rnd() * 3), out = [];
        for (var i = 0; i < 3; i++) {
            var kind = D.TACTIC_KEYS[(first + i) % 3];
            var base = ranks[i] !== undefined ? tacticPower(ranks[i]) : C.TACTIC_MIN;
            out.push({ kind: kind, p: Math.round((base + skillBonus(s, h, kind)) * 1000) / 1000, rank: ranks[i] !== undefined ? String(ranks[i]) : null });
        }
        return out;
    }
    function cleanTactic(t) { // клиентская тактика не доверяется: вид из каталога, сила в пределах
        if (!t || D.TACTICS[t.kind] === undefined) return null;
        var p = Number(t.p); if (!isFinite(p) || p <= 0) return null;
        return { kind: t.kind, p: Math.min(C.TACTIC_MAX + C.SKILL_STEP * C.SKILL_MAX, p) };
    }
    function battleParams(s, h, id, tactic) {
        var t = cleanTactic(tactic), atk = armyPower(s, h), def = nodeDefense(s, id), attrMult = 1;
        if (t) {
            if (t.kind === 'rush') atk = Math.round(atk * (1 + t.p));
            else if (t.kind === 'cunning') def = Math.round(def * (1 - t.p));
            else if (t.kind === 'formation') attrMult = Math.max(0.1, 1 - 1.5 * t.p);
        }
        return { atk: atk, def: def, attrMult: attrMult, tactic: t };
    }
    function forecast(s, h, id, tactic) {
        var adjacent = ADJ[s.heroes[h].node].indexOf(id) >= 0, b = battleParams(s, h, id, tactic);
        var out = SM.assaultOutcome(b.atk, b.def, { rand: function() { return 0.5; }, attritionMult: b.attrMult }); // прогноз: средний исход
        return { adjacent: adjacent, hostile: isHostile(s, id), atk: b.atk, def: b.def, ratio: out.ratio, win: out.win, attritionPct: out.attritionPct, ap: NODES[id].cost };
    }
    function applyLoss(army, pct) {
        D.UNIT_KEYS.forEach(function(k) {
            var n = army[k] || 0;
            army[k] = n - Math.min(Math.ceil(n * pct), Math.max(0, n - 1)); // малые стопы тоже платят за бой; стопа не исчезает целиком
        });
    }
    function defeatFaction(s, f) { // оплот взят: фракция разбита до конца карты, её узлы становятся нейтральными
        s.fac[f].dead = 1; s.fac[f].truce = 0;
        var code = facCode(f);
        for (var i = 0; i < N; i++) if (s.own.charAt(i) === code) { s.own = strSet(s.own, i, '0'); s.gar[i] = 0; }
    }
    // Победа (решение владельца «пали все логова»): 4 оплота фракций + Цитадель; одна Цитадель карту не завершает
    function lairsLeft(s) {
        var n = s.own.charAt(LAIR) !== '1' ? 1 : 0;
        for (var f = 0; f < 4; f++) if (s.own.charAt(FAC[f].bastion) !== '1') n++;
        return n;
    }
    function allLairsFallen(s) { return lairsLeft(s) === 0; }
    // Ранг-ап карточки сферы (§3 «как ослабить»): −WEAKEN_GAR_PCT гарнизона оплота её фракции; оплот пал — бьём по Цитадели; не ниже WEAKEN_GAR_FLOOR от исходного
    function weakenLairOnRankUp(s, sphere) {
        var f = SPHERES.indexOf(sphere);
        if (f < 0) return { ok: false, reason: 'sphere' };
        var id = (!s.fac[f].dead && s.own.charAt(FAC[f].bastion) === facCode(f)) ? FAC[f].bastion : (s.own.charAt(LAIR) !== '1' ? LAIR : -1);
        if (id < 0) return { ok: false, reason: 'fallen' };
        var was = s.gar[id], floor = Math.round(NODES[id].gar * C.WEAKEN_GAR_FLOOR), now = Math.max(floor, Math.round(was * (1 - C.WEAKEN_GAR_PCT)));
        if (now >= was) return { ok: false, reason: 'floor', node: id };
        s.gar[id] = now;
        pushLog(s, 'Ранг карточки «' + D.SPHERE_NAME[SPHERES[f]] + '» растёт: гарнизон «' + NODES[id].name + '» −' + (was - now) + ' (осталось ' + now + ')');
        return { ok: true, node: id, was: was, now: now };
    }
    function engage(s, h, id, tactic) { // бой героя h с соседним враждебным узлом (tactic — по желанию); {ok, win?, reason?}
        if (s.done) return { ok: false, reason: 'done' };
        var hero = s.heroes[h];
        if (ADJ[hero.node].indexOf(id) < 0) return { ok: false, reason: 'far' };
        if (!isHostile(s, id)) return { ok: false, reason: 'peace' };
        var cost = NODES[id].cost;
        if (s.ap[h] < cost) return { ok: false, reason: 'ap' };
        s.ap[h] -= cost;
        var b = battleParams(s, h, id, tactic);
        var out = SM.assaultOutcome(b.atk, b.def, { rand: mulberry32(hashStr(s.day + '|' + s.bc)), attritionMult: b.attrMult });
        s.bc++;
        applyLoss(hero.army, out.attritionPct);
        var n = NODES[id];
        if (out.win) {
            var prevOwner = s.own.charAt(id), pf = facOf(prevOwner);
            s.own = strSet(s.own, id, '1'); s.gar[id] = 0; hero.node = id;
            var loot = D.LOOT[n.type] || {}, gold = Math.round((loot.g || 0) * (D.SKILL[SPHERES[h]].kind === null ? 1 + C.DIPLO_LOOT * hero.sk : 1));
            s.res.g += gold;
            if (n.type === 'cache' && s.stk[h] >= C.SHRINE_STREAK && hero.sk < C.SKILL_MAX) { // святилище: серия дел сферы героя → навык
                hero.sk++; pushLog(s, D.HERO_NAME[SPHERES[h]] + ' постиг «' + D.SKILL[SPHERES[h]].name + '» ' + hero.sk + '/' + C.SKILL_MAX);
            }
            if (loot.r && n.sphere) s.res[D.RES_KEY[n.sphere]] += loot.r;
            addXp(s, h, 3);
            if (n.type === 'town') s.sg[SPHERES.indexOf(n.sphere)] = 0;
            if (id === LAIR) {
                if (allLairsFallen(s)) { s.done = true; pushLog(s, 'Победа! «' + n.name + '» пала — все логова взяты, карта пройдена'); }
                else pushLog(s, '«' + n.name + '» пала; осталось логов: ' + lairsLeft(s) + '. Победа — когда падут все пять');
            }
            else if (pf >= 0 && id === FAC[pf].bastion) {
                defeatFaction(s, pf);
                pushLog(s, D.HERO_NAME[SPHERES[h]] + ' разбил «' + FAC[pf].name + '»: оплот взят' + (gold ? ' (+' + gold + ' 💰)' : '') + ' · осталось логов: ' + lairsLeft(s));
                if (allLairsFallen(s)) { s.done = true; pushLog(s, 'Победа! Оплот «' + FAC[pf].name + '» — последнее логово, карта пройдена'); }
            }
            else pushLog(s, D.HERO_NAME[SPHERES[h]] + (n.type === 'town' ? ' освободил город: ' : ' взял: ') + n.name + (gold ? ' (+' + gold + ' 💰)' : ''));
            markSeen(s);
        } else {
            pushLog(s, D.HERO_NAME[SPHERES[h]] + ': штурм «' + n.name + '» отбит (потери ' + Math.round(out.attritionPct * 100) + '%)');
        }
        return { ok: true, win: out.win, ratio: out.ratio, attritionPct: out.attritionPct, tactic: b.tactic };
    }

    // ---------- города: найм, жилища, залы, передача армий ----------
    function townAt(s, h) { // индекс города (= сферы), в котором стоит герой h, иначе -1
        var t = D.TOWNS.indexOf(s.heroes[h].node);
        return (t >= 0 && townOwned(s, t)) ? t : -1; // в захваченном фракцией городе ни нанять, ни построить
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
    // input: {silent, honest, overdue} — массивы по 4 сферам (или числа — тогда всё идёт Разуму): срывы закрываемых суток из хуков Ф0
    function perSphere(v) { if (Array.isArray(v)) return [0, 1, 2, 3].map(function(i) { return Math.max(0, Number(v[i]) || 0); }); var o = zeros(4); o[1] = Math.max(0, Number(v) || 0); return o; }
    function dayEnd(s, nextDay, input) {
        input = input || {};
        var sl = perSphere(input.silent), hn = perSphere(input.honest), ov = perSphere(input.overdue), shadows = zeros(4);
        var rest = isRestDay(s, s.day); // закрываем объявленный отдых: теней нет (молчание, честный пропуск и просрочка)
        for (var f = 0; f < 4; f++) {
            shadows[f] = (s.lz.on || rest) ? 0 : sl[f] + 0.5 * hn[f] + ov[f]; // лазарет и отдых: срывы не копятся
            s.fac[f].sh.push(shadows[f]); while (s.fac[f].sh.length > 7) s.fac[f].sh.shift();
        }
        if (s.lz.on) { s.lz.left = Math.max(0, s.lz.left - 1); if (s.lz.left === 0) s.lz.on = 0; }
        if (s.deedsToday === 0) s.idle++; else s.idle = 0;
        for (var i = 0; i < 4; i++) s.ap[i] = Math.min(C.AP_CARRY, s.ap[i]); // сгорает; перенос ≤ AP_CARRY на героя (ОД не прибавляются)
        s.res.g += C.GOLD_TOWN_DAY * townsOwned(s) + C.HALL_GOLD * hall(s, 'ties');
        for (var m = 0; m < 4; m++) if (s.own.charAt(D.MINES[m]) === '1') s.res[D.RES_KEY[SPHERES[m]]] += C.MINE_DAY;
        for (var q = 0; q < 4; q++) s.stk[q] = s.apDay[q] > 0 ? Math.min(99, s.stk[q] + 1) : 0; // дней подряд с делами сферы (святилища)
        for (var w = 0; w < 4; w++) if (s.stk[w] === C.WEAKEN_STREAK && !s.fac[w].dead) pushLog(s, 'Серия ' + C.WEAKEN_STREAK + ' дней дел «' + D.SPHERE_NAME[SPHERES[w]] + '»: «' + FAC[w].name + '» ослаблена на ' + Math.round(C.WEAKEN_STREAK_PCT * 100) + '%'); // ровно 7 — событие пересечения; повторится только после обрыва и новой серии
        s.apDay = zeros(4); s.tasksToday = 0; s.deedsToday = 0; s.dc = zeros(4);
        for (var o = 0; o < 4; o++) if (s.ob[o] === 1) { s.ob[o] = 0; s.obb[o] = 0; } // непринятый за сутки челлендж обелиска сгорает; взятая награда (2) остаётся
        s.day = String(nextDay);
        if (restArr(s).some(function(k) { return k < nextDay; })) s.rest = restArr(s).filter(function(k) { return k >= nextDay; }); // прошедшие дни вычищаются
        return { shadows: shadows };
    }

    // ---------- обелиски: реальные челленджи ----------
    function obeliskAt(s, h) { var id = s.heroes[h].node; return NODES[id].type === 'obelisk' ? SPHERES.indexOf(NODES[id].sphere) : -1; } // индекс обелиска (= сфера региона) под героем, иначе -1
    function obeliskLeft(s, k) { return Math.max(0, D.OBELISK.NEED - (s.dc[k] - s.obb[k])); }
    function obeliskActivate(s, h) {
        var k = obeliskAt(s, h);
        if (k < 0) return { ok: false, reason: 'away' };
        if (s.ob[k] === 2) return { ok: false, reason: 'claimed' };
        if (s.ob[k] === 1) return { ok: false, reason: 'active' };
        s.ob[k] = 1; s.obb[k] = s.dc[k];
        pushLog(s, 'Обелиск «' + D.SPHERE_NAME[SPHERES[k]] + '»: сделай ' + D.OBELISK.NEED + ' дела сферы сегодня');
        return { ok: true };
    }
    function revealAround(s, id, radius) { // открывает узлы в радиусе по рёбрам
        var seen = s.seen, frontier = [id], dist = {}; dist[id] = 0;
        while (frontier.length) {
            var u = frontier.shift();
            if (seen.charAt(u) !== '1') seen = strSet(seen, u, '1');
            if (dist[u] >= radius) continue;
            ADJ[u].forEach(function(v) { if (dist[v] === undefined) { dist[v] = dist[u] + 1; frontier.push(v); } });
        }
        s.seen = seen;
    }
    function obeliskClaim(s, h) {
        var k = obeliskAt(s, h);
        if (k < 0) return { ok: false, reason: 'away' };
        if (s.ob[k] !== 1) return { ok: false, reason: s.ob[k] === 2 ? 'claimed' : 'idle' };
        if (obeliskLeft(s, k) > 0) return { ok: false, reason: 'left', left: obeliskLeft(s, k) };
        s.ob[k] = 2; s.res[D.RES_KEY[SPHERES[k]]] += D.OBELISK.RES; addXp(s, h, D.OBELISK.XP);
        revealAround(s, s.heroes[h].node, D.OBELISK.REVEAL);
        pushLog(s, 'Обелиск «' + D.SPHERE_NAME[SPHERES[k]] + '» отвечает: +' + D.OBELISK.RES + ' ' + D.RES_ICON[D.RES_KEY[SPHERES[k]]] + ', карта открыта');
        return { ok: true };
    }

    // ---------- новая карта-сезон ----------
    // Перенос с завершённой карты в формате «наследия» (казна, залы, навыки, армия, уровни); победа повышает сложность следующей карты
    function carryLegacy(s) {
        var power = 0; s.heroes.forEach(function(hh, i) { power += armyPower(s, i); });
        return {
            g: Math.min(C.CARRY_GOLD_MAX, Math.floor(s.res.g * C.CARRY_GOLD_SHARE)),
            hall: s.towns.map(function(t) { return t.hall >= 2 ? 1 : 0; }),
            sk: s.heroes.map(function(hh) { return hh.sk >= 1 ? 1 : 0; }),
            a: Math.floor(Math.min(D.LEGACY.ARMY_POWER_MAX, Math.floor(power * D.LEGACY.ARMY_SHARE)) / 2 / 4),
            l: s.heroes.map(function(hh) { return Math.min(D.LEGACY.LVL_MAX, hh.lvl); })
        };
    }
    function newMap(s) {
        var n = newState(s.day, carryLegacy(s));
        n.cyc = s.done ? (s.cyc || 0) + 1 : (s.cyc || 0); n.mp = (s.mp || 1) + 1;
        pushLog(n, 'Карта ' + n.mp + (n.cyc > s.cyc ? ': пороки сильнее на ' + Math.round(C.CYC_K * 100 * n.cyc) + '%' : ': новый сезон'));
        return n;
    }
    function seasonOver(s) { return s.done || s.wk >= C.SEASON_WEEKS; }

    // ---------- лазарет и перемирие ----------
    function lazaretStart(s) {
        if (s.lz.on) return { ok: false, reason: 'on' };
        if (s.lz.left <= 0) return { ok: false, reason: 'none' };
        s.lz.on = 1; pushLog(s, 'Лазарет: тени не копятся, фракции затаились (' + s.lz.left + ' дн.)');
        return { ok: true };
    }
    function lazaretEnd(s) { if (!s.lz.on) return { ok: false, reason: 'off' }; s.lz.on = 0; return { ok: true }; }
    // Перемирие на неделю — обет «ни одного срыва в сфере фракции»: соблюдён — фракция пропускает ход и отступает, нарушен — бьёт на 50% сильнее
    function declareTruce(s, f) {
        if (!(f >= 0 && f < 4)) return { ok: false, reason: 'arg' };
        if (s.fac[f].dead) return { ok: false, reason: 'dead' };
        if (s.lz.on) return { ok: false, reason: 'lazaret' };
        for (var i = 0; i < 4; i++) if (s.fac[i].truce) return { ok: false, reason: i === f ? 'already' : 'one' };
        s.fac[f].truce = 1; pushLog(s, 'Обет перемирия с «' + FAC[f].name + '»: неделя без срывов в сфере «' + D.SPHERE_NAME[FAC[f].sphere] + '»');
        return { ok: true };
    }
    function revokeTruce(s, f) { if (!s.fac[f].truce) return { ok: false, reason: 'none' }; s.fac[f].truce = 0; return { ok: true }; }

    // ---------- объявленный отдых (решение владельца: отдых 1–2 дня в неделю объявляется ЗАРАНЕЕ) ----------
    var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
    function msOfDay(day) { return Date.parse(day + 'T00:00:00Z'); }
    function dayAdd(day, n) { return new Date(msOfDay(day) + n * 86400000).toISOString().slice(0, 10); }
    function dayDiff(a, b) { return Math.round((msOfDay(b) - msOfDay(a)) / 86400000); }
    function weekKey(day) { return dayAdd(day, -((new Date(msOfDay(day)).getUTCDay() + 6) % 7)); } // понедельник недели дня
    function restArr(s) { return Array.isArray(s.rest) ? s.rest : []; } // поле необязательное: старые сейвы без него — пустой список
    function isRestDay(s, dayKey) { return restArr(s).indexOf(String(dayKey)) >= 0; }
    function restInWeek(s, dayKey) { var wk = weekKey(String(dayKey)); return restArr(s).filter(function(k) { return weekKey(k) === wk; }).length; }
    function restLeft(s, dayKey) { return Math.max(0, C.REST_PER_WEEK - restInWeek(s, dayKey)); }
    function declareRest(s, dayKey) {
        var day = String(dayKey || '');
        if (!DAY_RE.test(day) || !DAY_RE.test(s.day)) return { ok: false, reason: 'arg' };
        var diff = dayDiff(s.day, day);
        if (diff <= 0) return { ok: false, reason: 'past' };
        if (diff > C.REST_AHEAD) return { ok: false, reason: 'far' };
        if (isRestDay(s, day)) return { ok: false, reason: 'dup' };
        if (restLeft(s, day) <= 0) return { ok: false, reason: 'cap' };
        if (!Array.isArray(s.rest)) s.rest = [];
        s.rest.push(day); s.rest.sort();
        while (s.rest.length > C.REST_MAX) s.rest.shift(); // при мусорном переполнении выпадают старые (уже прошедшие) дни
        pushLog(s, '🌙 Отдых ' + day + ' объявлен: день пройдёт без теней');
        return { ok: true };
    }
    function cancelRest(s, dayKey) { // отмена — только пока день ещё будущий
        var day = String(dayKey || ''), i = restArr(s).indexOf(day);
        if (i < 0) return { ok: false, reason: 'none' };
        if (dayDiff(s.day, day) <= 0) return { ok: false, reason: 'past' };
        s.rest.splice(i, 1);
        pushLog(s, '🌙 Отдых ' + day + ' отменён');
        return { ok: true };
    }

    // ---------- ход фракций (большой ход недели) ----------
    function factionNodes(s, f) { var out = [], code = facCode(f); for (var i = 0; i < N; i++) if (s.own.charAt(i) === code) out.push(i); return out; }
    function fogAround(s, id, keep) { // «Рассеянность» наводит туман вокруг взятого узла (кроме видимого героями/своими)
        var seen = s.seen;
        [id].concat(ADJ[id]).forEach(function(i) { if (!keep(i) && seen.charAt(i) === '1') seen = strSet(seen, i, '0'); });
        s.seen = seen;
    }
    function playerSees(s, i) {
        if (s.own.charAt(i) === '1') return true;
        for (var h = 0; h < 4; h++) if (s.heroes[h].node === i || ADJ[s.heroes[h].node].indexOf(i) >= 0) return true;
        return false;
    }
    function factionTurn(s, f, ev) {
        var F = FAC[f], fs = s.fac[f], sum = facSum(s, f), truce = fs.truce === 1, kept = truce && sum === 0;
        fs.truce = 0;
        if (kept) { retreat(s, f, ev, 'Перемирие соблюдено: «' + F.name + '» отступает'); return; }
        if (sum < C.FAC_MIN_SHADOW) { if (sum === 0) retreat(s, f, ev, '«' + F.name + '» теряет силу и отступает'); return; }
        var power = facPower(s, f, truce); // truce здесь = обет нарушен
        var owned = factionNodes(s, f), code = facCode(f), best = null, bestKey = Infinity, occ = {};
        s.heroes.forEach(function(h) { occ[h.node] = true; });
        var seenC = {};
        owned.forEach(function(o) {
            ADJ[o].forEach(function(c) {
                if (seenC[c] || s.own.charAt(c) === code || c === LAIR || occ[c]) return;
                seenC[c] = true;
                var oc = s.own.charAt(c);
                if (oc !== '0' && oc !== '1') return; // чужие фракции и цитадель не трогаем
                var cat = oc === '1' ? (NODES[c].type === 'town' ? 0 : 1) : 2; // города — главная цель, затем узлы игрока, затем нейтрал
                var key = cat * 100 + (NODES[c].sphere === F.sphere ? 0 : 50) + (oc === '1' ? nodeDefense(s, c) / 1000 : s.gar[c] / 1000) + c / 100000;
                if (key < bestKey) { bestKey = key; best = c; }
            });
        });
        if (best === null) return;
        var def = nodeDefense(s, best), n = NODES[best], isTown = n.type === 'town', t = isTown ? SPHERES.indexOf(n.sphere) : -1;
        if (def > 0 && power / def <= C.FAC_RATIO) { if (isTown) s.sg[t] = 0; ev.push({ f: f, kind: 'repelled', node: best, text: 'Натиск «' + F.name + '» на «' + n.name + '» отбит (' + power + ' vs ' + def + ')' }); return; }
        if (isTown) {
            s.sg[t]++;
            if (s.sg[t] >= C.SIEGE_WEEKS && townsOwned(s) > 1) {
                s.sg[t] = 0; s.own = strSet(s.own, best, code); s.gar[best] = C.FAC_TOWN_GAR;
                ev.push({ f: f, kind: 'fall', node: best, text: '«' + F.name + '» взяла город «' + n.name + '»! Освободи его' });
            } else ev.push({ f: f, kind: 'siege', node: best, text: 'Осада «' + n.name + '»: «' + F.name + '» (' + s.sg[t] + '/' + C.SIEGE_WEEKS + ')' + (townsOwned(s) <= 1 ? ' — последний город не падёт' : '') });
            return;
        }
        s.own = strSet(s.own, best, code); s.gar[best] = C.FAC_NODE_GAR;
        if (F.id === 'distract') fogAround(s, best, function(i) { return playerSees(s, i); });
        ev.push({ f: f, kind: 'take', node: best, text: '«' + F.name + '» заняла «' + n.name + '»' });
    }
    function retreat(s, f, ev, text) { // самый далёкий от оплота узел фракции (кроме оплота) становится нейтральным
        var b = FAC[f].bastion, far = -1, best = -1, owned = factionNodes(s, f);
        owned.forEach(function(i) { if (i === b) return; var sp = shortestPath(b, i); if (sp && sp.cost > best) { best = sp.cost; far = i; } });
        if (far < 0) return;
        s.own = strSet(s.own, far, '0'); s.gar[far] = 0;
        ev.push({ f: f, kind: 'retreat', node: far, text: text + ' («' + NODES[far].name + '» свободна)' });
    }
    function weekEnd(s) {
        var ev = [];
        s.wk++;
        var grow = 1 + C.HALL_GROW * hall(s, 'mind');
        for (var t = 0; t < 4; t++) {
            if (!townOwned(s, t)) continue; // город в руках фракции не растит армию
            var fgr = C.GROW_FLOOR + (1 - C.GROW_FLOOR) * Math.min(1, s.apWeek[t] / C.GROW_AP_FULL); // прирост города — от дел его сферы
            D.UNIT_KEYS.forEach(function(k) {
                if (k !== 't1' && !s.towns[t].dw[k]) return;
                s.towns[t].pool[k] = Math.min(C.POOL_CAP[k], s.towns[t].pool[k] + Math.floor(C.POOL_GROW[k] * fgr * grow));
            });
        }
        s.apWeek = zeros(4);
        if (s.wk % C.SEASON_WEEKS === 0) { s.lz.left = C.LAZARET_DAYS; } // новый сезон — новый запас лазарета
        if (s.done) return { events: ev };
        if (!s.lz.on) {
            for (var f = 0; f < 4; f++) if (!s.fac[f].dead) factionTurn(s, f, ev);
        } else for (var f2 = 0; f2 < 4; f2++) s.fac[f2].truce = 0;
        for (var tt = 0; tt < 4; tt++) { // осада снимается, если рядом с городом нет узлов фракции
            if (!ADJ[D.TOWNS[tt]].some(function(a) { return facOf(s.own.charAt(a)) >= 0; })) s.sg[tt] = 0;
        }
        ev.forEach(function(e) { pushLog(s, e.text); });
        return { events: ev };
    }

    return {
        mulberry32: mulberry32, hashStr: hashStr, stateHash: stateHash,
        newState: newState, legacyFromV14: legacyFromV14, carryLegacy: carryLegacy, newMap: newMap, seasonOver: seasonOver, lairsLeft: lairsLeft, allLairsFallen: allLairsFallen, cycMult: cycMult,
        obeliskAt: obeliskAt, obeliskLeft: obeliskLeft, obeliskActivate: obeliskActivate, obeliskClaim: obeliskClaim, pushLog: pushLog, markSeen: markSeen,
        hall: hall, townOwned: townOwned, townsOwned: townsOwned, facSum: facSum, facMult: facMult, lairMult: lairMult, facPower: facPower, playerShare: playerShare, facOf: facOf, facCode: facCode, streakWeak: streakWeak, weakenLairOnRankUp: weakenLairOnRankUp,
        shadowSum: shadowSum, shadowMult: shadowMult, armyPower: armyPower, nodeDefense: nodeDefense, isHostile: isHostile, nodeSphere: nodeSphere,
        rankBonus: rankBonus, deedAp: deedAp, applyDeed: applyDeed,
        shortestPath: shortestPath, route: route, travel: travel,
        tacticPower: tacticPower, skillBonus: skillBonus, offerTactics: offerTactics, forecast: forecast, engage: engage,
        townAt: townAt, hire: hire, hireGold: hireGold, resNeed: resNeed, dwellingCost: dwellingCost, buildDwelling: buildDwelling, hallCost: hallCost, buyHall: buyHall,
        transfer: transfer, transferAll: transferAll,
        dayEnd: dayEnd, weekEnd: weekEnd, lazaretStart: lazaretStart, lazaretEnd: lazaretEnd, declareTruce: declareTruce, revokeTruce: revokeTruce,
        declareRest: declareRest, cancelRest: cancelRest, isRestDay: isRestDay, restLeft: restLeft, weekKey: weekKey,
        ADJ: ADJ
    };
});
