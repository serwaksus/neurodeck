// ============================================================
// РЕГРЕССИЯ T1-H5: prototype pollution через merge stats
// Аудит (кампания 1): applySyncData итерировал Object.keys(data.stats)
// с проверкой `if (!STATS[k]) return` — own-ключ __proto__ из JSON
// проходил (значение наследуется → truthy) → Object.assign писал в
// Object.prototype. Фикс (storage.js:811):
//   if (!Object.prototype.hasOwnProperty.call(STATS, k)) return;
//
// ЧЕРНОВИК QA-6 (п.56): положить в tests/ — требует только node --test.
// ДО фикса тест падает на assert 1: ({}).value становится 999.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');

// --- харнес как в storage-v8.test.js (порядок важен) ---
globalThis.StrongholdData = require('../js/stronghold-data.js');
globalThis.STATE_GUARDS = require('../js/state-guards.js');
globalThis.window = globalThis;
// app-глобалы, которые applySyncData мутирует (в браузере это top-level var из app.js)
globalThis.HERO = { name: 'Странник', level: 3, xp: 40, xpToNext: 200, totalXp: 340, gold: 100 };
globalThis.STATS = { str: { name: 'Сила', value: 3, max: 100, attributePoints: 0 } };
globalThis.FORGED = [];
globalThis.GOALS = [];
globalThis.TASKS = [];
globalThis.INVENTORY = { backpack: [], equipped: { head: null, amulet: null, chest: null, cape: null, weapon: null, shield: null, ring1: null, ring2: null, boots: null }, maxSlots: 30 };
const S = require('../js/storage.js');
const IV = S.__storageInternals;

test('T1-H5: own-ключ __proto__ в data.stats не загрязняет Object.prototype', () => {
    // JSON.parse создаёт СОБСТВЕННОЕ свойство __proto__ (DefineOwnProperty),
    // это точный вектор из аудита: importFromHash / файл / облако.
    const payload = JSON.parse('{' +
        '"v":10,' +
        '"stats":{"__proto__":{"value":999,"max":100,"evil":"pwn"},"str":{"value":50,"max":120}},' +
        '"hero":{"gold":100},' +
        '"forged":[],"goals":[]' +
    '}');
    assert.ok(Object.keys(payload.stats).includes('__proto__'), 'вектор: __proto__ должен быть own-ключом');

    IV.applySyncData(payload, true);

    // 1) ядро регрессии: Object.prototype чист
    assert.equal(({}).value, undefined, 'Object.prototype.value не должен появиться');
    assert.equal(({}).evil, undefined, 'Object.prototype.evil не должен появиться');
    assert.equal(Object.keys(Object.prototype).length, 0,
        'Object.prototype должен остаться пустым, got: ' + JSON.stringify(Object.keys(Object.prototype)));
    // 2) легитимные ключи по-прежнему применяются (фикс не сломал sync)
    // applySyncData пишет в глобальный STATS, читаем через интрernals-санитарку:
    assert.equal(globalThis.STATS.str.value, 50, 'легитимный ключ str применён в STATS');
    // 3) санитайз-клампы действуют (applySyncData мутирует глобальный STATS, не вход)
    assert.ok(globalThis.STATS.str.max <= 100, 'max клампится санитайзером, got: ' + globalThis.STATS.str.max);
});
