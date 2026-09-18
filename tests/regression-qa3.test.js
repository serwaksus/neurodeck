// ============================================================
// РЕГРЕССИИ QA-3 (Round 2, фиксы кампании 2):
//   QA3-H1: migrateSyncData — битый/отсутствующий v не реплеит MIGRATIONS вниз
//           (старый код трактовал «no v» как v4 → MIGRATIONS[8] пересобирал
//            strongholds с нуля, теряя захваты/гарнизоны вплоть до 20/20;
//            MIGRATIONS[9] сносил season.crownBonus).
//   QA3-M1: sanitizeHero — streakShields в whitelist (переживает sync/сейв).
//   QA3-M2: applySyncData — lastDayReset/lastWeekReset валидируются
//           /^\d{4}-\d{2}-\d{2}$/, мусор → null (сброс цикла).
// Харнес как в regression-T1H5-proto.test.js (глобальные app-переменные + require).
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const F = require('./fixtures/saves-factory.cjs');

globalThis.StrongholdData = require('../js/stronghold-data.js');
globalThis.STATE_GUARDS = require('../js/state-guards.js');
globalThis.window = globalThis;
globalThis.HERO = { name: 'Странник', level: 3, xp: 40, xpToNext: 200, totalXp: 340, gold: 100 };
globalThis.STATS = { str: { name: 'Сила', value: 3, max: 100, attributePoints: 0 } };
globalThis.FORGED = [];
globalThis.GOALS = [];
globalThis.TASKS = [];
globalThis.ARTIFACTS = []; // sanitizeInventory ждёт каталог артефактов (в браузере — app.js)
globalThis.INVENTORY = { backpack: [], equipped: { head: null, amulet: null, chest: null, cape: null, weapon: null, shield: null, ring1: null, ring2: null, boots: null }, maxSlots: 30 };
globalThis.lastDayReset = null;
globalThis.lastWeekReset = null;
const S = require('../js/storage.js');
const IV = S.__storageInternals;

// ---------- QA3-H1: v-битые сейвы не мигрируют вниз ----------
test('QA3-H1: v10-сейв без поля v — strongholds/season/throne не пересобираются', () => {
    const d = F.validSave({ version: 10 });
    d.season.crownBonus = 4; d.throne = 5;
    delete d.v; // битый сейв: поле версии потеряно
    IV.migrateSyncData(d);
    assert.equal(d.v, 10, 'v выставлен в текущую схему');
    assert.equal(d.strongholds.length, 20, '20 твердынь на месте');
    const captured = d.strongholds.filter(s => s.captured);
    assert.equal(captured.length, 6, 'захваты не потеряны (6/6, старый код давал 0/20)');
    assert.ok(captured[0].garrison.length > 0, 'гарнизон сохранён');
    assert.equal(d.season.crownBonus, 4, 'crownBonus не снесён MIGRATIONS[9]');
    assert.equal(d.throne, 5, 'трон на месте');
});

test('QA3-H1: v-строка / v:0 / v:NaN — без реплея (army не пересоздаётся миграцией)', () => {
    for (const badV of ['10', 0, null, NaN]) {
        const d = F.validSave({ version: 10 });
        d.v = badV;
        IV.migrateSyncData(d);
        assert.equal(d.v, 10, 'v нормализован: ' + String(badV));
        assert.equal(d.army.week, 3, 'army неделим миграцией (v=' + JSON.stringify(badV) + ')');
        assert.equal(d.season.num, 1, 'season на месте');
    }
});

test('QA3-H1: легаси v6 по-прежнему мигрирует ВВЕРХ (фикс не сломал апгрейд)', () => {
    const d = F.validSave({ version: 6 });
    IV.migrateSyncData(d);
    assert.equal(d.v, 10);
    assert.ok(Array.isArray(d.strongholds) && d.strongholds.length === 20, 'MIGRATIONS[8]: strongholds построены');
    assert.equal(d.strongholds.filter(s => s.captured).length, 4, 'tractState.regions=4 → 4 захвата');
    assert.ok(!('shards' in d.hero), 'MIGRATIONS[7]: легаси-поля героя удалены');
    assert.ok(!('bossHp' in d), 'MIGRATIONS[7]: boss-поля удалены');
    assert.ok(Array.isArray(d.tasks) && d.tasks.length === 2, 'MIGRATIONS[7]: tasks массив');
    assert.equal(d.season.num, 1, 'MIGRATIONS[9]: сезон создан');
    assert.equal(d.throne, 0, 'MIGRATIONS[10]: трон инициализирован');
});

// ---------- QA3-M1: streakShields в whitelist sanitizeHero ----------
test('QA3-M1: sanitizeHero переносит и клампит streakShields', () => {
    assert.equal(STATE_GUARDS.sanitizeHero({ streakShields: 7 }).streakShields, 7);
    assert.equal(STATE_GUARDS.sanitizeHero({ streakShields: 500 }).streakShields, 100);
    assert.equal(STATE_GUARDS.sanitizeHero({ streakShields: -5 }).streakShields, 0);
    assert.equal(STATE_GUARDS.sanitizeHero({ streakShields: 'x' }).streakShields, 0);
    assert.equal(STATE_GUARDS.sanitizeHero({}).streakShields, 0);
});

test('QA3-M1: streakShields переживает applySyncData (попадает в HERO)', () => {
    const d = F.validSave({ version: 10 });
    d.hero.streakShields = 3;
    delete d.strongholds; // компактный вход: фокус на hero-ветке
    IV.applySyncData(d, true);
    assert.equal(globalThis.HERO.streakShields, 3, 'щит стрика дошёл до HERO через whitelist');
});

// ---------- QA3-M2: reset-даты валидируются regex ----------
test('QA3-M2: битые lastDayReset/lastWeekReset → null; валидные применяются', () => {
    globalThis.lastDayReset = null; // харнес-стейт: валидные даты из прошлого теста
    globalThis.lastWeekReset = null;
    const bad = F.validSave({ version: 10 });
    delete bad.strongholds;
    bad.lastDayReset = 'garbage';
    bad.lastWeekReset = '2026-9-14'; // непаддированный месяц — не дата по контракту
    IV.applySyncData(bad, true);
    assert.equal(globalThis.lastDayReset, null, 'мусор → сброс (старый код сохранял «garbage»)');
    assert.equal(globalThis.lastWeekReset, null, 'непаддированная дата → сброс');
    const good = F.validSave({ version: 10 });
    delete good.strongholds;
    good.lastDayReset = '2026-09-17';
    good.lastWeekReset = '2026-09-14';
    IV.applySyncData(good, true);
    assert.equal(globalThis.lastDayReset, '2026-09-17');
    assert.equal(globalThis.lastWeekReset, '2026-09-14');
});
