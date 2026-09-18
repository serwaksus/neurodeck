// ============================================================
// tests/storage-v8.test.js — «Твердыни v2»: слой данных (этап 3a)
// ============================================================
// Миграция v7→v8 (фикстура реального v7-сейва), санитайзеры
// strongholds/army/siege, формулы штурма/осады/коррапшна,
// каталоги app.js против пинов BALANCE (круг 3).
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SG = require('../js/state-guards.js');
const M = require('../js/stronghold-model.js');

// Каталоги — единый источник js/stronghold-data.js (app и sim читают тот же файл)
const DATA = require('../js/stronghold-data.js');
assert.equal(DATA.STRONGHOLDS.length, 20, 'каталог твердынь должен загрузиться из stronghold-data.js');

globalThis.StrongholdData = DATA;
globalThis.STATE_GUARDS = SG;
globalThis.window = globalThis;
const S = require('../js/storage.js');
const IV = S.__storageInternals;

// ----------------------------------------------------------------
// Каталоги против пинов BALANCE/SPEC
// ----------------------------------------------------------------

test('каталог: 20 твердынь, gar+def=total, монотонность, слоты', () => {
    const sh = DATA.STRONGHOLDS;
    assert.equal(sh.length, 20);
    assert.equal(new Set(sh.map(s => s.id)).size, 20, 'id уникальны');
    sh.forEach(s => assert.equal(s.gar + s.def, s.total, s.id + ': gar+def=total'));
    for (let i = 1; i < 20; i++) assert.ok(sh[i - 1].total < sh[i].total, 'строгая монотонность Итого');
    sh.forEach((s, i) => {
        const want = i < 5 ? 6 : i < 15 ? 7 : 8;
        assert.equal(s.slots, want, s.id + ': слоты 6/7/8');
    });
});

test('каталог: налоги — пин BALANCE круг 3 (247 + 85 + 8020 = 8352)', () => {
    const tax = DATA.STRONGHOLDS.map(s => s.tax);
    const sum = a => a.reduce((x, y) => x + y, 0);
    assert.equal(sum(tax.slice(0, 11)), 247, '#1–11 v1-паритет');
    assert.equal(tax[11], 85, '#12 = 85 (BALANCE-пин; ячейка «90» в таблице SPEC §1 устарела)');
    assert.deepEqual(tax.slice(12), [440, 560, 700, 860, 1040, 1240, 1460, 1720], '#13–20 = ×4.0');
    assert.equal(sum(tax), 8352, 'Σ полного захвата');
});

test('каталог: 7 тиров — пин найма/силы/прироста (SPEC §3, BALANCE R1)', () => {
    const want = {
        t1: { cost: 1, power: 2, growth: 14 }, t2: { cost: 5, power: 6, growth: 12 },
        t3: { cost: 15, power: 16, growth: 10 }, t4: { cost: 50, power: 45, growth: 8 },
        t5: { cost: 160, power: 140, growth: 6 }, t6: { cost: 800, power: 450, growth: 6 },
        t7: { cost: 1800, power: 1400, growth: 4 }
    };
    for (const t of Object.keys(want)) {
        assert.equal(DATA.UNIT_TIERS[t].cost, want[t].cost, t + ' cost');
        assert.equal(DATA.UNIT_TIERS[t].power, want[t].power, t + ' power');
        assert.equal(DATA.UNIT_TIERS[t].growth, want[t].growth, t + ' growth');
    }
});

test('каталог: 20 построек, стоимости круга 2 (−40%), категории 7/5/4/4', () => {
    const b = DATA.BUILDINGS;
    assert.equal(Object.keys(b).length, 20);
    const costs = id => b[id].cost;
    assert.deepEqual(['zh1', 'zh2', 'zh3', 'zh4', 'zh5', 'zh6', 'zh7'].map(costs), [60, 150, 360, 900, 2100, 4800, 10800]);
    assert.deepEqual(['ec1', 'ec2', 'ec3', 'ec4', 'ec5'].map(costs), [120, 180, 360, 1500, 4200]);
    assert.deepEqual(['df1', 'df2', 'df3', 'df4'].map(costs), [180, 480, 1200, 3300]);
    assert.deepEqual(['sp1', 'sp2', 'sp3', 'sp4'].map(costs), [300, 2100, 3300, 6600]);
    const byCat = c => Object.values(b).filter(x => x.cat === c).length;
    assert.deepEqual([byCat('house'), byCat('econ'), byCat('defense'), byCat('special')], [7, 5, 4, 4]);
});

// ----------------------------------------------------------------
// Миграция v7 → v8 (фикстура реального вида v7-сейва)
// ----------------------------------------------------------------

function v7Fixture(regions) {
    return {
        v: 7, savedAt: 1726000000000,
        hero: { name: 'Странник', level: 12, gold: 4321, xp: 100, xpToNext: 200, totalXp: 3000,
            lastSessionAt: 1726000000000, dailyUniqueStats: {}, cardHistory: {} },
        stats: {},
        forged: [{ id: 1, name: 'Зарядка', meta: '⚔ 15 мин · день', rank: 'B', streak: 4, stat: 'str',
            progress: 10, mastery: 2, masteryThreshold: 7 }],
        goals: [], inventory: { backpack: [], equipped: {} },
        escapeProgress: 42, lastDayReset: '2026-09-12', forgedIdCounter: 2, uidCounter: 10, goalIdCounter: 1,
        xpHistory: [], bloodOath: null, lastWeekReset: '2026-09-07',
        tasks: [{ id: 1, name: 'Тест-задача', tier: 'normal', deadline: null, status: 'active',
            createdAt: 1, doneAt: null, ghostSince: null }],
        taskIdCounter: 2, tractState: { regions: regions, building: null }
    };
}

test('миграция v7→v8: regions=5 → 5 captured, золото/карточки/задачи целы', () => {
    const d = v7Fixture(5);
    IV.migrateSyncData(d);
    assert.equal(d.v, 10);
    assert.equal(d.strongholds.length, 20);
    d.strongholds.forEach((s, i) => {
        assert.equal(s.id, DATA.STRONGHOLDS[i].id, 'порядок/ID соответствуют каталогу');
        assert.equal(s.captured, i < 5, 'idx ' + i + ': captured = первые N');
        assert.deepEqual(s.garrison, []);
        assert.deepEqual(s.buildings, {});
        assert.deepEqual(s.corruption, { stage: 'ok', debtDays: 0 });
    });
    assert.deepEqual(d.army, { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 0 });
    assert.deepEqual(d.siege, { week: 1, lastResult: null });
    assert.equal(d.hero.gold, 4321, 'золото цело (ADR §10)');
    assert.equal(d.forged.length, 1, 'карточки целы');
    assert.equal(d.tasks.length, 1);
    assert.equal(d.tasks[0].name, 'Тест-задача');
    assert.equal(d.tractState.regions, 5, 'tractState не удаляем (легаси-снос — отдельный этап)');
});

test('миграция v7→v8: guard\'ы — regions 0 / отсутствие tractState / 99 → clamp 10', () => {
    const d0 = v7Fixture(0);
    IV.migrateSyncData(d0);
    assert.ok(d0.strongholds.every(s => s.captured === false));
    const dNone = v7Fixture(5);
    delete dNone.tractState;
    IV.migrateSyncData(dNone);
    assert.ok(dNone.strongholds.every(s => s.captured === false), 'нет tractState → все false');
    const d99 = v7Fixture(99);
    IV.migrateSyncData(d99);
    assert.equal(d99.strongholds.filter(s => s.captured).length, 10, 'clamp в 0..10');
    const dNeg = v7Fixture(-3);
    IV.migrateSyncData(dNeg);
    assert.equal(dNeg.strongholds.filter(s => s.captured).length, 0);
});

test('миграция v7→v8: повторный вызов не меняет уже смигрированные поля', () => {
    const d = v7Fixture(5);
    IV.migrateSyncData(d);
    const snap = JSON.stringify(d.strongholds);
    IV.migrateSyncData(d);
    assert.equal(JSON.stringify(d.strongholds), snap, 'повторная миграция запрещена (SPEC §9.8)');
    assert.equal(d.siege.week, 1);
});

// ----------------------------------------------------------------
// Санитайзеры
// ----------------------------------------------------------------

test('sanitizeStrongholds: null/мусор → 20 безопасных записей', () => {
    for (const junk of [null, undefined, 'str', 42, { id: 'sh01' }]) {
        const out = SG.sanitizeStrongholds(junk, DATA);
        assert.equal(out.length, 20);
        assert.ok(out.every(s => s.captured === false && s.garrison.length === 0));
    }
});

test('sanitizeStrongholds: whitelist id, captured bool, мусорные элементы игнорируются', () => {
    const out = SG.sanitizeStrongholds([
        { id: 'sh01', captured: true },
        { id: 'sh02', captured: 'yes' },
        { id: 'sh99', captured: true },
        'string', 42, null,
        { captured: true }
    ], DATA);
    assert.equal(out.length, 20, 'фиктивные/чужие id не создают записей');
    assert.equal(out[0].captured, true);
    assert.equal(out[1].captured === true, false, 'captured: строго boolean true');
    assert.equal(out.filter(s => s.captured).length, 1);
});

test('sanitizeStrongholds: гарнизон — только t1..t7, clamp 0..1e6, дедуп по тиру', () => {
    const out = SG.sanitizeStrongholds([{ id: 'sh01', garrison: [
        { tier: 't1', count: 5 },
        { tier: 't1', count: 2.9 },
        { tier: 't8', count: 100 },
        { tier: 'toString', count: 100 },
        { tier: 't2', count: -7 },
        { tier: 't3', count: 5e6 },
        { tier: 't3' },
        'junk', null
    ] }], DATA);
    assert.deepEqual(out[0].garrison, [
        { tier: 't1', count: 8 },
        { tier: 't2', count: 0 },
        { tier: 't3', count: 1000000 }
    ]);
});

test('sanitizeStrongholds: постройки — только из каталога, стадия whitelist, debtDays 0..365', () => {
    const out = SG.sanitizeStrongholds([{ id: 'sh01', buildings: {
        zh1: { built: true, corruptionStage: 'worn', debtDays: 40 },
        evil: { built: true, corruptionStage: 'ok', debtDays: 1 },
        zh2: { built: 'yes', corruptionStage: 'EXPLOIT', debtDays: 1e9 },
        zh3: 'junk', toString: { built: true }
    } }], DATA);
    assert.deepEqual(Object.keys(out[0].buildings).sort(), ['zh1', 'zh2'], 'чужие id и наследники Object отброшены');
    assert.deepEqual(out[0].buildings.zh1, { built: true, builtAt: null, corruptionStage: 'worn', debtDays: 40 });
    assert.deepEqual(out[0].buildings.zh2, { built: false, corruptionStage: 'ok', debtDays: 0 });
});

test('sanitizeStrongholds: corruption whitelist + debtDays clamp; round-trip стабилен', () => {
    const once = SG.sanitizeStrongholds([{ id: 'sh05', corruption: { stage: 'RUIN', debtDays: 1e9 } },
        { id: 'sh06', corruption: { stage: 'ok', debtDays: -5 } }], DATA);
    assert.deepEqual(once[4].corruption, { stage: 'ok', debtDays: 365 });
    assert.deepEqual(once[5].corruption, { stage: 'ok', debtDays: 0 });
    const twice = SG.sanitizeStrongholds(once, DATA);
    assert.deepEqual(twice, once, 'sanitize(sanitize(x)) === sanitize(x)');
});

test('sanitizeArmy: дефолты, clamp 0..1e6, неделя 0..520, мусор отброшен', () => {
    assert.deepEqual(SG.sanitizeArmy(null), { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 0 });
    const out = SG.sanitizeArmy({ units: { t1: -5, t2: 2e6, t3: 3.7, t8: 99, evil: 1 }, week: 9999, junk: {} });
    assert.deepEqual(out.units, { t1: 0, t2: 1000000, t3: 4, t4: 0, t5: 0, t6: 0, t7: 0 });
    assert.equal(out.week, 520);
    assert.equal(out.junk, undefined);
    assert.equal(SG.sanitizeArmy({ units: 'junk' }).units.t1, 0);
    assert.equal(SG.sanitizeArmy({ week: -1 }).week, 0);
});

test('sanitizeSiege: week 1..520, lastResult — только плоские примитивы', () => {
    assert.deepEqual(SG.sanitizeSiege(null), { week: 1, lastResult: null, assaultDay: null, wkSkips: 0, wkTaskFails: 0, retriedThisWeek: false });
    assert.equal(SG.sanitizeSiege({ week: 0 }).week, 1, 'минимум 1');
    assert.equal(SG.sanitizeSiege({ week: 1e9 }).week, 520);
    const kept = SG.sanitizeSiege({ lastResult: { week: 3, lost: 2, held: 1, evil: { nested: true } } });
    assert.deepEqual(kept.lastResult, { week: 3, lost: 2, held: 1 }, 'вложенные объекты вычищены');
    for (const junk of ['str', 42, ['arr'], { fn: function() {} }, { deep: {} }]) {
        assert.equal(SG.sanitizeSiege({ lastResult: junk }).lastResult, null, JSON.stringify(junk));
    }
});

// ----------------------------------------------------------------
// Формулы (SPEC §4/§5/§6 — BALANCE-пин круг 3)
// ----------------------------------------------------------------

test('armyPower: Σ count×сила, обе формы входа, отрицательные игнорируются', () => {
    assert.equal(M.armyPower({ t1: 10 }), 20);
    assert.equal(M.armyPower({ t1: 10, t3: 5 }), 100);
    assert.equal(M.armyPower({ units: { t2: 3, t7: 1 } }), 1418);
    assert.equal(M.armyPower([{ tier: 't4', count: 2 }]), 90);
    assert.equal(M.armyPower({ t1: -5, t2: 1 }), 6);
    assert.equal(M.armyPower({}), 0);
});

test('defensePower: SPEC §4 — тренировочные нейтралы sh01 (gar 3, def 2, total 5)', () => {
    assert.equal(M.defensePower(DATA.STRONGHOLDS[0], [{ tier: 't1', count: 10 }], 25, 0), 35);
    assert.equal(M.defensePower(DATA.STRONGHOLDS[0], { t1: 10 }, undefined, 0), 25);
    assert.equal(M.defensePower(DATA.STRONGHOLDS[0], [], 0, 60), 65, '+ оборонные постройки');
    assert.equal(M.defensePower({ gar: 10, def: 5 }, [], 0, 0), 15, 'fallback gar+def');
    assert.equal(M.defensePower(null, [], 0, 0), 0);
    assert.equal(M.defensePower(DATA.STRONGHOLDS[0], 'junk', 'junk', 'junk'), 5, 'мусор → безопасные 0');
});

test('assaultOutcome: победа/attrition по SPEC §4 (пример 22 против 15 ≈ 20.4%)', () => {
    const o = M.assaultOutcome(22, 15);
    assert.equal(o.win, true);
    assert.ok(Math.abs(o.attritionPct - 0.204545) < 0.000001);
    assert.equal(M.assaultOutcome(1000, 15).attritionPct, 0.08, 'пол attrition 0.08');
    assert.equal(M.assaultOutcome(1e9, 15).attritionPct, 0.08);
    assert.equal(M.assaultOutcome(15.000001, 15).win, true, 'ratio > 1 строго');
    assert.equal(M.assaultOutcome(15, 15).win, false, 'ratio = 1 — не победа');
});

test('assaultOutcome: модификаторы agi (−50% кап) и Кузни Знамён (×0.8)', () => {
    const base = M.assaultOutcome(22, 15).attritionPct;
    assert.ok(Math.abs(M.assaultOutcome(22, 15, { agi: 50 }).attritionPct - base * 0.5) < 1e-12);
    assert.equal(M.assaultOutcome(22, 15, { agi: 100 }).attritionPct, base * 0.5, 'agi > 50 не усиливает');
    assert.equal(M.assaultOutcome(22, 15, { agi: 5 }).attritionPct, base * 0.95);
    assert.ok(Math.abs(M.assaultOutcome(22, 15, { banner: true }).attritionPct - base * 0.8) < 1e-12);
});

test('assaultOutcome: отступление 10–30% (rand), границы; def 0 → победа', () => {
    const loss = M.assaultOutcome(10, 15, { rand: () => 0 });
    assert.equal(loss.win, false);
    assert.equal(loss.attritionPct, 0.10);
    assert.equal(M.assaultOutcome(10, 15, { rand: () => 1 }).attritionPct, 0.30);
    const real = M.assaultOutcome(10, 15);
    assert.equal(real.win, false);
    assert.ok(real.attritionPct >= 0.10 && real.attritionPct <= 0.30, 'ADR §1: 10–30%');
    const open = M.assaultOutcome(10, 0);
    assert.equal(open.win, true);
    assert.equal(open.attritionPct, 0.08);
});

test('siegePower: пины SPEC §5 [C: 76/115/167/267/777], W_eff-кап по прогрессу (ADR П1-12)', () => {
    assert.equal(M.siegePower(110, 1, 1, 0), 76);
    assert.equal(M.siegePower(110, 10, 2, 0), 115, 'W_eff = min(10; max(4; 3)) = 4');
    assert.equal(M.siegePower(110, 10, 20, 0), 267, 'W_eff = 10');
    assert.equal(M.siegePower(110, 1, 1, 10), 167, 'wrath 10');
    assert.equal(M.siegePower(110, 12, 20, 10), 777);
    assert.equal(M.siegePower(110, 15, 20, 0), M.siegePower(110, 12, 20, 0), 'календарный кап W=12');
    assert.equal(M.siegePower(110, 0, 20, 0), 66, 'W=0 → 1.15^0');
    assert.equal(M.siegePower(110, 30, 1, 99), M.siegePower(110, 4, 1, 10), 'W_eff-пол 4 и wrath-кап 10');
    for (let w = 0; w < 12; w++) {
        assert.ok(M.siegePower(110, w, 20, 0) < M.siegePower(110, w + 1, 20, 0), 'рост по неделям W=' + w);
    }
});

test('corruptionTick: upkeep первым, оплата → gold-upkeep, вход не мутируется', () => {
    const b = { zh1: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    const c = M.corruptionTick(b, 100, 0);
    assert.deepEqual(c, { gold: 97, upkeep: 3, paid: true, buildings: { zh1: { built: true, builtAt: null, corruptionStage: 'ok', debtDays: 0 } } });
    assert.deepEqual(b, { zh1: { built: true, corruptionStage: 'ok', debtDays: 0 } }, 'вход чистый');
});

test('corruptionTick: grace (wil 0 → 2) не ест 1-й и 2-й день, деградация Целое→Обветшало→Руина', () => {
    let st = { zh1: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    st = M.corruptionTick(st, 0, 0).buildings;
    assert.deepEqual(st.zh1, { built: true, builtAt: null, corruptionStage: 'ok', debtDays: 1 }, 'день 1 — grace');
    st = M.corruptionTick(st, 0, 0).buildings;
    assert.equal(st.zh1.corruptionStage, 'ok', 'день 2 — ещё grace');
    st = M.corruptionTick(st, 0, 0).buildings;
    assert.equal(st.zh1.corruptionStage, 'worn', 'день 3 — Обветшало');
    st = M.corruptionTick(st, 0, 0).buildings;
    assert.equal(st.zh1.corruptionStage, 'worn', 'день 4 — step 2');
    st = M.corruptionTick(st, 0, 0).buildings;
    assert.equal(st.zh1.corruptionStage, 'ruin', 'день 5 — Руина');
});

test('corruptionTick: grace растёт от wil (2+floor(wil/20)), кап 7', () => {
    let st = { zh1: { built: true, corruptionStage: 'ok', debtDays: 4 } };
    st = M.corruptionTick(st, 0, 60).buildings;
    assert.equal(st.zh1.corruptionStage, 'ok', 'grace 5: debt 5 ≤ 5 → ещё Целое');
    st.zh1.debtDays = 5;
    st = M.corruptionTick(st, 0, 60).buildings;
    assert.equal(st.zh1.corruptionStage, 'worn', 'debt 6: 5 < 6 ≤ grace+step 7 → Обветшало');
    st.zh1.debtDays = 7;
    st = M.corruptionTick(st, 0, 60).buildings;
    assert.equal(st.zh1.corruptionStage, 'ruin', 'debt 8 > 7 → Руина');
    let cap = { zh1: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    for (let i = 0; i < 10; i++) cap = M.corruptionTick(cap, 0, 100).buildings;
    assert.equal(cap.zh1.corruptionStage, 'ruin', 'wil 100 → grace 7, руина на debt 10');
});

test('corruptionTick: step 4 при Соборе Порядка (П3)', () => {
    let st = { zh1: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    st = M.corruptionTick(st, 0, 0, { step: 4 }).buildings;
    st = M.corruptionTick(st, 0, 0, { step: 4 }).buildings;
    assert.equal(st.zh1.corruptionStage, 'ok', 'grace 2');
    st.zh1.debtDays = 5;
    st = M.corruptionTick(st, 0, 0, { step: 4 }).buildings;
    assert.equal(st.zh1.corruptionStage, 'worn', 'debt 6: grace 2 < 6 ≤ 6');
    st.zh1.debtDays = 6;
    st = M.corruptionTick(st, 0, 0, { step: 4 }).buildings;
    assert.equal(st.zh1.corruptionStage, 'ruin', 'debt 7 > 6');
});

test('corruptionTick: восстановление 1 ступень/день, debtDays → 0; руина не ест', () => {
    let st = {
        zh1: { built: true, corruptionStage: 'ruin', debtDays: 9 },
        zh2: { built: true, corruptionStage: 'worn', debtDays: 3 }
    };
    let c = M.corruptionTick(st, 1000, 0);
    assert.equal(c.upkeep, 8, 'руина не ест: upkeep только с zh2 (обветшалой)');
    st = c.buildings;
    assert.equal(st.zh1.corruptionStage, 'worn', 'Руина → Обветшало');
    assert.equal(st.zh2.corruptionStage, 'ok', 'Обветшало → Целое');
    assert.equal(st.zh1.debtDays, 0);
    st = M.corruptionTick(st, 1000, 0).buildings;
    assert.equal(st.zh1.corruptionStage, 'ok', 'Обветшало → Целое');
    let ruinOnly = M.corruptionTick({ zh7: { built: true, corruptionStage: 'ruin', debtDays: 9 } }, 0, 0);
    assert.equal(ruinOnly.upkeep, 0, 'одна руина содержание не ест');
});

test('corruptionTick: иммунитет нового — не деградирует и не копит долг, оплата сбрасывает', () => {
    let st = { zh1: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    st = M.corruptionTick(st, 0, 0, { immune: { zh1: true } }).buildings;
    st = M.corruptionTick(st, 0, 0, { immune: { zh1: true } }).buildings;
    st = M.corruptionTick(st, 0, 0, { immune: { zh1: true } }).buildings;
    st = M.corruptionTick(st, 0, 0, { immune: { zh1: true } }).buildings;
    assert.equal(st.zh1.corruptionStage, 'ok', 'иммунная не деградирует при debt 4 > grace');
    st = M.corruptionTick(st, 100, 0).buildings;
    assert.equal(st.zh1.debtDays, 0, 'оплата сбрасывает debt и иммунной');
});

test('corruptionTick: built:false и чужие id игнорируются, дефицит обнуляет золото', () => {
    const c = M.corruptionTick({ zh1: { built: false, corruptionStage: 'ok', debtDays: 0 }, junk: 'x' }, 2, 0);
    assert.equal(c.upkeep, 0);
    assert.equal(c.gold, 2, 'не built — не платит, золото не тронуто');
    const deficit = M.corruptionTick({ zh1: { built: true, corruptionStage: 'ok', debtDays: 0 } }, 1, 0);
    assert.equal(deficit.paid, false);
    assert.equal(deficit.gold, 0, 'казна в 0 при дефиците (SPEC §6)');
});
