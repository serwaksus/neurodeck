(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else { root.NeuroDeckStrongholdModel = factory(); root.StrongholdModel = root.NeuroDeckStrongholdModel; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    var TIER_KEYS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
    var STAGE_ORDER = ['ruin', 'worn', 'ok'];
    var STAGE_SET = { ok: true, worn: true, ruin: true };

    function catalog() {
        return (typeof globalThis !== 'undefined' && globalThis.StrongholdData) || null;
    }

    function tierPower(tier) {
        var cat = catalog();
        var u = (cat && cat.UNIT_TIERS) ? cat.UNIT_TIERS[tier] : null;
        if (!u || typeof u.power !== 'number' || !isFinite(u.power)) {
            throw new Error('StrongholdModel: UNIT_TIERS[' + tier + '] недоступен (window.StrongholdData не задан?)');
        }
        return u.power;
    }

    // stacks: [{tier,count}] или map {t1:n}; силы тиров — SPEC §3 (2/6/16/45/140/450/1400)
    function stackPower(stacks) {
        var p = 0;
        if (Array.isArray(stacks)) {
            stacks.forEach(function(s) {
                if (!s || typeof s !== 'object') return;
                var n = Number(s.count);
                if (isFinite(n) && n > 0) p += Math.round(n) * tierPower(s.tier);
            });
        } else if (stacks && typeof stacks === 'object') {
            TIER_KEYS.forEach(function(t) {
                var n = Number(stacks[t]);
                if (isFinite(n) && n > 0) p += Math.round(n) * tierPower(t);
            });
        }
        return p;
    }

    // Г1-1: число разных тиров с count>0 (смешанный состав)
    function distinctTierCount(stacks) {
        var n = 0;
        if (Array.isArray(stacks)) {
            stacks.forEach(function(s) {
                if (!s || typeof s !== 'object') return;
                if (Number(s.count) > 0) n++;
            });
        } else if (stacks && typeof stacks === 'object') {
            TIER_KEYS.forEach(function(t) {
                if (Number(stacks[t]) > 0) n++;
            });
        }
        return n;
    }

    // Г1-1: состав армии — ≥3 разных тиров с count>0 → ×1.08 (диверсификация)
    function armyPower(units) {
        var src = units && typeof units === 'object' && units.units ? units.units : units;
        var p = stackPower(src);
        if (distinctTierCount(src) >= 3) p = Math.round(p * 1.08);
        return p;
    }

    // garDef (SPEC §5): Итого_обороны + Σ оборонных построек + round(гарнизонPower × (1 + 0.02 × end));
    // Г1-1: mono-гарнизон (ровно 1 тир с count>0) → гарнизонная часть ×1.15 (только ОБОРОНА, атака не трогается)
    function defensePower(stronghold, garrison, end, defenseBonus) {
        if (!stronghold || typeof stronghold !== 'object') return 0;
        var base = Number(stronghold.total);
        if (!isFinite(base)) base = (Number(stronghold.gar) || 0) + (Number(stronghold.def) || 0);
        var e = Number(end); if (!isFinite(e) || e < 0) e = 0;
        var bonus = Number(defenseBonus); if (!isFinite(bonus) || bonus < 0) bonus = 0;
        var gp = stackPower(garrison);
        if (distinctTierCount(garrison) === 1) gp = Math.round(gp * 1.15);
        return Math.round(base) + Math.round(bonus) + Math.round(gp * (1 + 0.02 * e));
    }

    // SPEC §4: победа при ratio > 1; attrition = clamp(0.30/ratio; 0.08; 0.30) × (1 − min(0.50; 0.01×agi)) × (П2 ? 0.8 : 1);
    // поражение: потери 10 + rand(0..20)%
    // C4: осадные ресурсы (opt-in, без опций — формула SPEC байт-в-байт): opts.ladder — лестницы,
    // +5% к ratio (влияет и на победу, и на attrition); opts.ram — таран, attrition ×0.9 в обеих ветвях.
    function assaultOutcome(armyPowerVal, defensePowerVal, opts) {
        opts = opts || {};
        var atk = Number(armyPowerVal); if (!isFinite(atk) || atk < 0) atk = 0;
        var def = Number(defensePowerVal); if (!isFinite(def) || def < 0) def = 0;
        var ratio = def > 0 ? atk / def : Infinity;
        if (opts.ladder === true && isFinite(ratio)) ratio = ratio * 1.05; // C4: лестницы +5% к соотношению
        var win = ratio > 1;
        var attritionPct;
        if (win) {
            attritionPct = Math.max(0.08, Math.min(0.30, 0.30 / ratio));
            var agi = Number(opts.agi); if (!isFinite(agi) || agi < 0) agi = 0;
            attritionPct *= 1 - Math.min(0.50, 0.01 * agi);
            if (opts.banner === true) attritionPct *= 0.8;
        } else {
            var rand = typeof opts.rand === 'function' ? opts.rand : Math.random;
            attritionPct = (10 + rand() * 20) / 100;
        }
        if (opts.ram === true) attritionPct *= 0.9; // C4: таран — осадный расходник, −10% потерь
        var am = Number(opts.attritionMult); // Г1-2: veteran attrition ×0.7 (обе ветви)
        if (isFinite(am) && am > 0 && am !== 1) attritionPct = Math.max(0.01, Math.min(3, attritionPct * am));
        return { win: win, ratio: ratio, attritionPct: attritionPct };
    }

    // SPEC §5: siegePower = round(front × 0.6 × 1.15^W_eff × (1 + 0.12×wrath));
    // кап W = 12; W_eff = min(W; max(4; floor(captured×1.5))) (ADR П1-12); кап wrath = 10
    function siegePower(frontDefense, week, captured, wrath) {
        var base = Number(frontDefense); if (!isFinite(base) || base < 0) base = 0;
        var w = Math.floor(Number(week)); if (!isFinite(w) || w < 0) w = 0;
        w = Math.min(w, 12);
        var cap = Math.max(4, Math.floor((Number(captured) || 0) * 1.5));
        var wEff = Math.min(w, cap);
        var wr = Number(wrath); if (!isFinite(wr) || wr < 0) wr = 0;
        wr = Math.min(wr, 10);
        return Math.round(base * 0.6 * Math.pow(1.15, wEff) * (1 + 0.12 * wr));
    }

    // SPEC §6: дневное содержание набора построек — построенные не-руина постройки (руина «не ест»),
    // сумма upkeep каталога × доктрина (0<m≤1) × правило провинции ((0;3]). Вынесено из corruptionTick
    // без изменения математики: P7 (аварийный ремонт/прогноз) считают цену ТОЙ ЖЕ формулой SPEC §6.
    function dailyUpkeep(buildings, opts) {
        opts = opts || {};
        var cat = catalog();
        var defs = (cat && cat.BUILDINGS && typeof cat.BUILDINGS === 'object') ? cat.BUILDINGS : null;
        if (!defs) throw new Error('StrongholdModel: BUILDINGS недоступен (window.StrongholdData не заден?)');
        var src = (buildings && typeof buildings === 'object' && !Array.isArray(buildings)) ? buildings : {};
        var upkeep = 0;
        Object.keys(src).forEach(function(id) {
            var b = src[id];
            if (!b || typeof b !== 'object' || b.built !== true) return;
            if (b.corruptionStage === 'ruin') return;
            var d = defs[id];
            if (d && typeof d.upkeep === 'number' && isFinite(d.upkeep)) upkeep += d.upkeep;
        });
        var upkMult = Number(opts.upkeepMult); // Г1-2: доктрина upkeep −20% (только вниз, 0<m≤1)
        if (!isFinite(upkMult) || upkMult <= 0 || upkMult > 1) upkMult = 1;
        var provMult = Number(opts.provinceUpkeepMult); // C3: правило провинции (Хутора −10% / Пепел +10%) — в отличие от доктрины может быть >1
        if (!isFinite(provMult) || provMult <= 0 || provMult > 3) provMult = 1;
        return Math.round(upkeep * upkMult * provMult);
    }

    // SPEC §6: upkeep первым (руина не ест); оплата → +1 ступень всем, debtDays = 0;
    // дефицит → gold 0, debtDays+1; grace = min(7; 2+floor(wil/20)); step = 2 (П3 → 4); иммунные (opts.immune) не деградируют.
    // Чистая функция: возвращает новое состояние { gold, upkeep, paid, buildings }, вход не мутирует.
    function corruptionTick(buildings, goldAvailable, wil, opts) {
        opts = opts || {};
        var grace = Math.min(7, 2 + Math.floor((Number(wil) || 0) / 20));
        var step = Number(opts.step) === 4 ? 4 : 2;
        var gold = Number(goldAvailable); if (!isFinite(gold) || gold < 0) gold = 0;
        var immune = (opts.immune && typeof opts.immune === 'object') ? opts.immune : null;
        var src = (buildings && typeof buildings === 'object' && !Array.isArray(buildings)) ? buildings : {};
        var upkeep = dailyUpkeep(buildings, opts);
        var paid = gold >= upkeep;
        var out = {};
        Object.keys(src).forEach(function(id) {
            var b = src[id];
            if (!b || typeof b !== 'object' || b.built !== true) {
                out[id] = { built: false, corruptionStage: 'ok', debtDays: 0 };
                return;
            }
            var stage = STAGE_SET[b.corruptionStage] ? b.corruptionStage : 'ok';
            var debt = Math.round(Number(b.debtDays));
            if (!isFinite(debt) || debt < 0) debt = 0;
            if (debt > 365) debt = 365;
            if (paid) {
                debt = 0;
                if (stage !== 'ok') stage = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];
            } else if (!(immune && immune[id] === true)) {
                debt = Math.min(365, debt + 1);
                if (debt > grace + step) stage = 'ruin';
                else if (debt > grace) stage = 'worn';
            }
            out[id] = { built: true, corruptionStage: stage, debtDays: debt , builtAt: b.builtAt || null };
        });
        return { gold: paid ? gold - upkeep : 0, upkeep: upkeep, paid: paid, buildings: out };
    }

    // P7 «Коррупция по-человечески»: прогноз до руины. Чистая симуляция дневного цикла SPEC §6
    // в порядке тика (доход зачисляется, потом содержание): оплаченный день обнуляет долг и лечит,
    // день дефицита — gold 0 и долг +1; постройка рушится, когда долг превышает grace + step.
    // Возвращает номер дня руины худшей постройки (1 = ближайший ночной тик) или null —
    // руина не грозит (содержание 0 / баланс покрывает / горизонт > 365 дней, как кап debtDays).
    function daysToRuin(gold, incomePerDay, upkeepPerDay, worstDebt, grace, step) {
        var g = Number(gold); if (!isFinite(g) || g < 0) g = 0;
        var inc = Number(incomePerDay); if (!isFinite(inc) || inc < 0) inc = 0;
        var up = Number(upkeepPerDay); if (!isFinite(up) || up < 0) up = 0;
        if (up <= 0) return null; // содержания нет — деградации не будет (в т.ч. «руина не ест»)
        var debt = Math.round(Number(worstDebt)); if (!isFinite(debt) || debt < 0) debt = 0;
        var gr = Math.round(Number(grace)); if (!isFinite(gr) || gr < 0) gr = 2;
        var st = Math.round(Number(step)); if (!isFinite(st) || st < 1) st = 2;
        for (var day = 1; day <= 365; day++) {
            g += inc;
            if (g >= up) { g -= up; debt = 0; }
            else { g = 0; debt += 1; }
            if (debt > gr + st) return day;
        }
        return null;
    }

    // P7: аварийный ремонт — цена = 2 × дневное содержание (те же множители, что платит тик;
    // минимум 1 — бригада не работает бесплатно, иначе «тотальная руина» чинилась бы в клик).
    function emergencyMaintenanceCost(buildings, opts) {
        return Math.max(1, dailyUpkeep(buildings, opts) * 2);
    }

    // P7: эффект аварийного ремонта = paid-ветка corruptionTick на один день (без списания золота —
    // платит вызывающий): каждая построенная постройка +1 ступень (ruin→worn→ok), debtDays = 0.
    // Чистая: возвращает новый объект buildings, вход не мутирует.
    function applyEmergencyMaintenance(buildings) {
        var src = (buildings && typeof buildings === 'object' && !Array.isArray(buildings)) ? buildings : {};
        var out = {};
        Object.keys(src).forEach(function(id) {
            var b = src[id];
            if (!b || typeof b !== 'object' || b.built !== true) {
                out[id] = { built: false, corruptionStage: 'ok', debtDays: 0 };
                return;
            }
            var stage = STAGE_SET[b.corruptionStage] ? b.corruptionStage : 'ok';
            if (stage !== 'ok') stage = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];
            out[id] = { built: true, corruptionStage: stage, debtDays: 0, builtAt: b.builtAt || null };
        });
        return out;
    }

    // P7: восстановление worn/ruin вручную — скидка 25% от цены постройки (ceil, как buildCostOf).
    function rebuildCost(baseCost) {
        var c = Number(baseCost);
        if (!isFinite(c) || c <= 0) return 0;
        return Math.ceil(c * 0.75);
    }

    // B4: торговые пути — пары соседних захваченных твердынь; бонус налогам +2%/путь, кап +38%.
    function tradeRoutes(capturedFlags) {
        var arr = Array.isArray(capturedFlags) ? capturedFlags : [];
        var n = 0;
        for (var i = 1; i < arr.length; i++) if (arr[i] && arr[i - 1]) n++;
        return n;
    }
    function tradeBonus(routes) {
        var r = Math.max(0, Math.round(Number(routes) || 0));
        return Math.min(0.38, r * 0.02);
    }

    // Campaign 2.0 C1: торговые пути по ГРАФУ кампании — маршрут = ребро, оба конца которого захвачены.
    // edges (опционально): массив пар [from, to] (числа = индексы каталога, строки = id) ИЛИ map {id: [id, ...]}.
    // Без edges рёбра берутся из STRONGHOLDS[].next; если next не задан ни у одного узла —
    // фоллбэк на индексную смежность (= tradeRoutes: линейный дефолт, результат 1:1).
    // Рёбра с неизвестными id/индексами вне каталога игнорируются (robustness).
    function tradeRoutesGraph(capturedFlags, edges) {
        var arr = Array.isArray(capturedFlags) ? capturedFlags : [];
        var cat = catalog();
        var list = (cat && Array.isArray(cat.STRONGHOLDS)) ? cat.STRONGHOLDS : [];
        var idxById = {};
        for (var ci = 0; ci < list.length; ci++) {
            if (list[ci] && typeof list[ci].id === 'string') idxById[list[ci].id] = ci;
        }
        function res(x) {
            if (typeof x === 'number' && isFinite(x)) return Math.floor(x);
            if (typeof x === 'string' && Object.prototype.hasOwnProperty.call(idxById, x)) return idxById[x];
            return -1;
        }
        var pairs = [];
        if (Array.isArray(edges)) {
            edges.forEach(function(e) {
                if (Array.isArray(e) && e.length >= 2) {
                    var a = res(e[0]), b = res(e[1]);
                    if (a >= 0 && b >= 0) pairs.push([a, b]);
                }
            });
        } else if (edges && typeof edges === 'object') {
            Object.keys(edges).forEach(function(from) {
                if (!Array.isArray(edges[from])) return;
                edges[from].forEach(function(to) {
                    var a = res(from), b = res(to);
                    if (a >= 0 && b >= 0) pairs.push([a, b]);
                });
            });
        } else if (list.length) {
            var hasAny = false;
            list.forEach(function(s) { if (s && Array.isArray(s.next) && s.next.length) hasAny = true; });
            if (!hasAny) return tradeRoutes(arr); // линейный дефолт — совместимость со старым каталогом
            list.forEach(function(s) {
                if (!s || !Array.isArray(s.next)) return;
                s.next.forEach(function(to) {
                    var a = res(s.id), b = res(to);
                    if (a >= 0 && b >= 0) pairs.push([a, b]);
                });
            });
        } else {
            return tradeRoutes(arr); // каталога нет — старая семантика
        }
        var n = 0;
        pairs.forEach(function(p) { if (arr[p[0]] && arr[p[1]]) n++; });
        return n;
    }

    // Campaign 2.0 C2: фронтир по ГРАФУ next[] — незахваченные узлы, в которые ведёт ребро из захваченного
    // узла; стартовый узел 0 (единственный без предков) доступен всегда, пока не захвачен. Минимальный
    // индекс фронтира = первая незахваченная твердыня, поэтому дефолт-обход (без выбора игрока)
    // совпадает с прежним линейным порядком 1:1. Фоллбэки: нет каталога / нет ни одного next /
    // пустой фронтир при незахваченных узлах (разрывный каталог) — линейная семантика, игрок не заперт.
    function frontierTargets(capturedFlags) {
        var arr = Array.isArray(capturedFlags) ? capturedFlags : [];
        function linear() {
            for (var i = 0; i < arr.length; i++) if (!arr[i]) return [i];
            return [];
        }
        var cat = catalog();
        var list = (cat && Array.isArray(cat.STRONGHOLDS)) ? cat.STRONGHOLDS : [];
        if (!list.length) return linear();
        var idxById = {}, hasAny = false;
        for (var ci = 0; ci < list.length; ci++) {
            if (list[ci] && typeof list[ci].id === 'string') idxById[list[ci].id] = ci;
            if (list[ci] && Array.isArray(list[ci].next) && list[ci].next.length) hasAny = true;
        }
        if (!hasAny) return linear();
        var targets = [];
        for (var i = 0; i < list.length && i < arr.length; i++) {
            if (arr[i]) continue;
            if (i === 0) { targets.push(0); continue; } // стартовый лагерь — без входящих рёбер
            var reach = false;
            for (var j = 0; j < list.length && !reach; j++) {
                if (j === i || !arr[j] || !list[j] || !Array.isArray(list[j].next)) continue;
                for (var k = 0; k < list[j].next.length; k++) if (idxById[list[j].next[k]] === i) { reach = true; break; }
            }
            if (reach) targets.push(i);
        }
        return targets.length ? targets : linear();
    }

    // Campaign 2.0 C3: правила провинций (CAMPAIGN-2.0.md §2) — чистые модификаторы из каталога PROVINCES.
    // Возвращают множитель налогов/содержания/осады для провинции; нет каталога, нет провинции или
    // кривое значение → 1 (нейтрально, экономика не ломается). Диапазон (0; 3] — защита от опечаток в данных.
    function provinceMods(prov) {
        var cat = catalog();
        var p = (cat && cat.PROVINCES && typeof cat.PROVINCES === 'object') ? cat.PROVINCES[Number(prov)] : null;
        return (p && p.rule && typeof p.rule === 'object' && p.rule.mods && typeof p.rule.mods === 'object') ? p.rule.mods : null;
    }
    function provinceMult(prov, key) {
        var mods = provinceMods(prov);
        var v = mods ? Number(mods[key]) : NaN;
        return (isFinite(v) && v > 0 && v <= 3) ? v : 1;
    }
    function provinceIncomeMult(prov) { return provinceMult(prov, 'incomeMult'); }
    function provinceUpkeepMult(prov) { return provinceMult(prov, 'upkeepMult'); }
    function provinceSiegeMult(prov) { return provinceMult(prov, 'siegeMult'); }

    // Campaign 2.0 C4: подготовка осады — подход недели (CAMPAIGN-2.0.md §3). Чистые модификаторы;
    // сам выбор живёт только в сессии (app.js) и в сейв НЕ пишется — новая неделя всегда
    // начинается со «Штурма». assault — норма; siege («Осада») — сила врага на неделе ×0.8,
    // но гнев +1; trick («Хитрость») — гарнизон врага ×0.9, только в провинции 3 (Гниль).
    // Неизвестный id → нормы «Штурма» (экономика не ломается опечаткой).
    var SIEGE_APPROACHES = {
        assault: { icon: '⚔', name: 'Штурм', desc: 'без модификаторов — как раньше' },
        siege:   { icon: '🏰', name: 'Осада', desc: 'сила врага на неделе −20%, гнев +1', enemyMult: 0.8, wrathDelta: 1 },
        trick:   { icon: '🎭', name: 'Хитрость', desc: 'Гниль (пров. 3): гарнизон врага −10%' }
    };
    function approachMeta(id) { return SIEGE_APPROACHES[id] || SIEGE_APPROACHES.assault; }
    function approachEnemyMult(id) {
        var m = Number(approachMeta(id).enemyMult);
        return (isFinite(m) && m > 0 && m <= 1) ? m : 1;
    }
    function approachWrathDelta(id) {
        var w = Number(approachMeta(id).wrathDelta);
        return (isFinite(w) && w > 0) ? Math.round(w) : 0;
    }
    function approachGarrisonMult(id, prov) {
        return (id === 'trick' && Number(prov) === 3) ? 0.9 : 1;
    }

    // Campaign 2.0 C6-lite: эндгейм-ротация модификаторов недели (CAMPAIGN-2.0.md §5) — применяется
    // ТОЛЬКО при 20/20 захватах (флаг endgame передаёт вызывающий), выбор детерминирован парой
    // (seasonNum, week) — тот же sin-хеш, что у погоды (app.js weatherOf), с иными константами,
    // чтобы ротации не коррелировали. Каталог WEEKLY_MODS (stronghold-data.js); нет каталога → null
    // и нейтральные 1 — экономика не ломается. Диапазон (0; 3] — как у провинций.
    function weeklyModifierOf(seasonNum, week) {
        var cat = catalog();
        var list = (cat && Array.isArray(cat.WEEKLY_MODS)) ? cat.WEEKLY_MODS : [];
        if (!list.length) return null;
        var s = Math.floor(Number(seasonNum)); if (!isFinite(s) || s < 0) s = 0;
        var w = Math.floor(Number(week)); if (!isFinite(w) || w < 0) w = 0;
        var h = Math.abs(Math.sin(s * 101 + w * 37) * 43758.5453) % 1;
        return list[Math.floor(h * list.length) % list.length] || null;
    }
    function weeklyMult(seasonNum, week, key, endgame) {
        if (endgame !== true) return 1; // вне эндгейма ротация не действует (гейт 20/20 — на вызывающем)
        var m = weeklyModifierOf(seasonNum, week);
        var v = (m && m.mods && typeof m.mods === 'object') ? Number(m.mods[key]) : NaN;
        return (isFinite(v) && v > 0 && v <= 3) ? v : 1;
    }
    function weeklyIncomeMult(seasonNum, week, endgame) { return weeklyMult(seasonNum, week, 'incomeMult', endgame); }
    function weeklyUpkeepMult(seasonNum, week, endgame) { return weeklyMult(seasonNum, week, 'upkeepMult', endgame); }
    function weeklySiegeMult(seasonNum, week, endgame) { return weeklyMult(seasonNum, week, 'siegeMult', endgame); }

    return {
        armyPower: armyPower,
        defensePower: defensePower,
        assaultOutcome: assaultOutcome,
        siegePower: siegePower,
        corruptionTick: corruptionTick,
        dailyUpkeep: dailyUpkeep,
        daysToRuin: daysToRuin,
        emergencyMaintenanceCost: emergencyMaintenanceCost,
        applyEmergencyMaintenance: applyEmergencyMaintenance,
        rebuildCost: rebuildCost,
        stackPower: stackPower,
        tierPower: tierPower,
        tradeRoutes: tradeRoutes,
        tradeRoutesGraph: tradeRoutesGraph,
        frontierTargets: frontierTargets,
        tradeBonus: tradeBonus,
        provinceIncomeMult: provinceIncomeMult,
        provinceUpkeepMult: provinceUpkeepMult,
        provinceSiegeMult: provinceSiegeMult,
        SIEGE_APPROACHES: SIEGE_APPROACHES,
        approachMeta: approachMeta,
        approachEnemyMult: approachEnemyMult,
        approachWrathDelta: approachWrathDelta,
        approachGarrisonMult: approachGarrisonMult,
        weeklyModifierOf: weeklyModifierOf,
        weeklyIncomeMult: weeklyIncomeMult,
        weeklyUpkeepMult: weeklyUpkeepMult,
        weeklySiegeMult: weeklySiegeMult,
        TIER_KEYS: TIER_KEYS
    };
});
