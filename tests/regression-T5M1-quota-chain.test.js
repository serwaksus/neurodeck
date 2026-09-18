// ============================================================
// РЕГРЕССИЯ T5-M1: quota на full_save не должна обрывать цепочку бэкапов
// Аудит (кампания 1): localStorage.setItem('neurodeck_full_save') стоял
// ПЕРВЫМ в saveGameState → QuotaExceededError прыгал в catch и
// пропускал neurodeck_backup, cards_backup, GEN_KEY, saveToIDB,
// saveGoals, autoCloudSave. Фикс (storage.js:214-222): backup →
// cards_backup → gen → IDB → goals → cloud → full_save ПОСЛЕДНИМ.
//
// ЧЕРНОВИК QA-6 (п.56): положить в tests/ — node --test, без браузера.
// storage.js исполняется в vm-песочнице ровно как в браузере (глобальные
// function-декларации → доступны по имени), стабы подменяют localStorage /
// IndexedDB / Telegram.CloudStorage. ДО фикса падает на assert 1 и 3.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('T5-M1: quota на full_save — backup/IDB/cloud записаны, тост показан', async () => {
    // --- стабы ---
    // Квота: бросает ТОЛЬКО на full_save (сценарий переполнения из аудита)
    const QUOTA_KEY = 'neurodeck_full_save';
    const ls = {};
    class QuotaErr extends Error { constructor() { super('QuotaExceededError'); this.name = 'QuotaExceededError'; } }
    const localStorage = {
        getItem: (k) => (k in ls ? ls[k] : null),
        setItem: (k, v) => { if (k === QUOTA_KEY) throw new QuotaErr(); ls[k] = String(v); },
        removeItem: (k) => { delete ls[k]; },
        key: (i) => Object.keys(ls)[i] || null,
        get length() { return Object.keys(ls).length; },
    };
    // Fake indexedDB: saveToIDB оставляет window._lastIDBSaveAt
    const idb = {};
    const fakeDB = {
        createObjectStore: () => ({}),
        transaction: () => ({ objectStore: () => ({ put: (rec) => { idb[rec.id] = rec; } }) }),
    };
    const indexedDB = {
        open: () => {
            const req = {};
            setTimeout(() => {
                req.result = fakeDB;
                if (req.onupgradeneeded) req.onupgradeneeded({ target: req });
                if (req.onsuccess) req.onsuccess({ target: req });
            }, 0);
            return req;
        },
    };
    // CloudStorage-стаб с логом (async-контракты как в Telegram: callback в хвосте)
    const cs = { store: {}, log: [] };
    const Telegram = { WebApp: { platform: 'desktop', CloudStorage: {
        getItem: (k, cb) => { cs.log.push(['getItem', k]); cb(null, cs.store[k] || null); },
        setItem: (k, v, cb) => { cs.log.push(['setItem', k]); cs.store[k] = String(v); cb(null); },
        removeItem: (k, cb) => { cs.log.push(['removeItem', k]); delete cs.store[k]; cb(null); },
    } } };
    const toasts = [];

    // --- песочница: состояние приложения как top-level var в браузере ---
    const sandbox = {
        localStorage, indexedDB, Telegram,
        document: { getElementById: () => null }, // updateSyncBadge: бейджа нет → ранний return
        StrongholdData: require('../js/stronghold-data.js'),
        STATE_GUARDS: require('../js/state-guards.js'),
        showToast: (t, d, kind) => toasts.push({ t, kind: kind || '' }),
        saveGoals: function () { try { localStorage.setItem('neurodeck_goals', JSON.stringify({ goals: GOALS, counter: goalIdCounter })); } catch (e) {} }, // mimic app.js:1052
        HERO: { name: 'Странник', level: 3, xp: 40, xpToNext: 200, totalXp: 340, gold: 1250 },
        STATS: { str: { name: 'Сила', value: 3, max: 100, attributePoints: 0 } },
        FORGED: [{ id: 101, name: 'Карточка', rank: 'C', stat: 'str', streak: 3, mastery: 0, masteryThreshold: 7, totalCompletions: 5, progress: 0, prestige: 0, evolutionPath: 'depth', daysActive: 10, meta: '⚔ 15 мин', firstCompletedAt: 1750000000000, lastCompletedAt: 1758000000000, lastFailDay: null }],
        GOALS: [], TASKS: [],
        INVENTORY: { backpack: [], equipped: { head: null, amulet: null, chest: null, cape: null, weapon: null, shield: null, ring1: null, ring2: null, boots: null }, maxSlots: 30 },
        lastDayReset: '2026-09-17', lastWeekReset: '2026-09-14',
        forgedIdCounter: 200, uidCounter: 20, goalIdCounter: 20, taskIdCounter: 10,
        xpHistory: [], bloodOath: null, hirePool: null,
        dailyQuests: { day: '2026-09-17', done: {}, quests: [], progress: {} },
        console, Date, JSON, Math, Number, Object, Array, String, parseInt, setTimeout, clearTimeout,
        window: { _lastCloudSave: Date.now() - 60000, Telegram },  // getCloudStorage читает window.Telegram! // разморозить throttle autoCloudSave (30с)
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
    vm.runInContext(src, sandbox, { filename: 'storage.js' });
    await new Promise((r) => setTimeout(r, 20)); // fake indexedDB открывает соединение в macrotask

    // --- акт: сохранение при переполненном localStorage ---
    vm.runInContext('saveGameState()', sandbox);
    await new Promise((r) => setTimeout(r, 30));

    // 1) цепочка бэкапов выжила: backup + cards_backup + gen записаны
    assert.ok(ls['neurodeck_backup'], 'neurodeck_backup записан (до фикса — отсутствовал)');
    assert.ok(ls['neurodeck_cards_backup'], 'neurodeck_cards_backup записан');
    assert.ok(/^[1-9]/.test(ls['neurodeck_gen'] || ''), 'neurodeck_gen записан и > 0');
    // 2) IDB получил снапшот
    assert.ok(sandbox.window._lastIDBSaveAt > 0, 'saveToIDB выполнился (window._lastIDBSaveAt)');
    assert.ok(idb.latest && idb.latest.data, 'снапшот лежит в IndexedDB');
    // 3) облако получило данные: чанк + метаданные
    const setKeys = cs.log.filter((x) => x[0] === 'setItem').map((x) => x[1]);
    assert.ok(setKeys.includes('nd_0'), 'облако: nd_0 записан, got: ' + setKeys.join(','));
    assert.ok(setKeys.includes('nd_meta'), 'облако: nd_meta записан');
    // 4) ошибка квоты НЕ проглочена молча — юзер предупреждён
    assert.ok(toasts.some((t) => t.kind === 'blood'), 'тост «Хранилище переполнено» показан');
    // 5) санитарка сценария: full_save действительно бросил (квота)
    assert.equal(ls[QUOTA_KEY], undefined, 'full_save не записан (квота) — это и есть сценарий');
});
