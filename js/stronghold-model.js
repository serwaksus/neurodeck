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

    function armyPower(units) {
        return stackPower(units && typeof units === 'object' && units.units ? units.units : units);
    }

    // garDef (SPEC §5): Итого_обороны + Σ оборонных построек + round(гарнизонPower × (1 + 0.02 × end))
    function defensePower(stronghold, garrison, end, defenseBonus) {
        if (!stronghold || typeof stronghold !== 'object') return 0;
        var base = Number(stronghold.total);
        if (!isFinite(base)) base = (Number(stronghold.gar) || 0) + (Number(stronghold.def) || 0);
        var e = Number(end); if (!isFinite(e) || e < 0) e = 0;
        var bonus = Number(defenseBonus); if (!isFinite(bonus) || bonus < 0) bonus = 0;
        return Math.round(base) + Math.round(bonus) + Math.round(stackPower(garrison) * (1 + 0.02 * e));
    }

    // SPEC §4: победа при ratio > 1; attrition = clamp(0.30/ratio; 0.08; 0.30) × (1 − min(0.50; 0.01×agi)) × (П2 ? 0.8 : 1);
    // поражение: потери 10 + rand(0..20)%
    function assaultOutcome(armyPowerVal, defensePowerVal, opts) {
        opts = opts || {};
        var atk = Number(armyPowerVal); if (!isFinite(atk) || atk < 0) atk = 0;
        var def = Number(defensePowerVal); if (!isFinite(def) || def < 0) def = 0;
        var ratio = def > 0 ? atk / def : Infinity;
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

    // SPEC §6: upkeep первым (руина не ест); оплата → +1 ступень всем, debtDays = 0;
    // дефицит → gold 0, debtDays+1; grace = min(7; 2+floor(wil/20)); step = 2 (П3 → 4); иммунные (opts.immune) не деградируют.
    // Чистая функция: возвращает новое состояние { gold, upkeep, paid, buildings }, вход не мутирует.
    function corruptionTick(buildings, goldAvailable, wil, opts) {
        opts = opts || {};
        var cat = catalog();
        var defs = (cat && cat.BUILDINGS && typeof cat.BUILDINGS === 'object') ? cat.BUILDINGS : null;
        if (!defs) throw new Error('StrongholdModel: BUILDINGS недоступен (window.StrongholdData не задан?)');
        var grace = Math.min(7, 2 + Math.floor((Number(wil) || 0) / 20));
        var step = Number(opts.step) === 4 ? 4 : 2;
        var src = (buildings && typeof buildings === 'object' && !Array.isArray(buildings)) ? buildings : {};
        var gold = Number(goldAvailable); if (!isFinite(gold) || gold < 0) gold = 0;
        var immune = (opts.immune && typeof opts.immune === 'object') ? opts.immune : null;
        var upkeep = 0;
        Object.keys(src).forEach(function(id) {
            var b = src[id];
            if (!b || typeof b !== 'object' || b.built !== true) return;
            if (b.corruptionStage === 'ruin') return;
            var d = defs[id];
            if (d && typeof d.upkeep === 'number' && isFinite(d.upkeep)) upkeep += d.upkeep;
        });
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

    return {
        armyPower: armyPower,
        defensePower: defensePower,
        assaultOutcome: assaultOutcome,
        siegePower: siegePower,
        corruptionTick: corruptionTick,
        stackPower: stackPower,
        tierPower: tierPower,
        TIER_KEYS: TIER_KEYS
    };
});
