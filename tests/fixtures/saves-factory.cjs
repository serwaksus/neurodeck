'use strict';
// Минимальная копия фабрики сейвов из аудита QA-3
// (board2/factory/saves.cjs — временная, живёт в /tmp; эта копия переживает очистку /tmp).
// Только validSave v6..v10: достаточно для регресс-тестов миграции (QA3-H1).

const path = require('path');
const SH = require(path.join(__dirname, '..', '..', 'js', 'stronghold-data.js'));
const STRONGHOLDS = SH.STRONGHOLDS;
const UNIT_TIERS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];

function makeCard(i) {
    return {
        id: 100 + i, name: 'Карточка ' + i, meta: '⚔ 15 мин · день', rank: 'C',
        streak: 3, stat: 'str', progress: 0, mastery: 0, masteryThreshold: 7,
        totalCompletions: 5, prestige: 0, evolutionPath: 'depth', daysActive: 10,
        firstCompletedAt: 1750000000000, lastCompletedAt: 1758000000000, lastFailDay: null
    };
}
function makeGoal(i) {
    return {
        id: 10 + i, type: 'short', name: 'Цель ' + i, desc: 'Описание цели', deadline: 1767225600000,
        totalSteps: 3, currentStep: 1, steps: [{ text: 'Шаг 1', done: true }],
        stat: 'wil', xp: 30, dmg: 5, statBonus: 1, completed: false, failed: false,
        createdAt: 1750000000000, lastStepAt: 1758000000000
    };
}
function makeTask(i) {
    return { id: i, name: 'Задача ' + i, tier: 'normal', deadline: 1759000000000, status: 'active', createdAt: 1750000000000, doneAt: null, ghostSince: null };
}
function defaultStats() {
    const mk = (name, icon, desc, color, dark) => ({ name, icon, desc, color, dark, value: 3, max: 100, attributePoints: 0 });
    return {
        str: mk('Сила', '⚔', 'Урон', '#c73e4d', '#8b2635'),
        end: mk('Стойкость', '🛡', 'Оборона', '#60a5fa', '#2563eb'),
        int: mk('Интеллект', '🧠', 'XP бонус', '#c084fc', '#7c3aed'),
        cha: mk('Харизма', '🎭', 'Шанс крита', '#fbbf24', '#b45309'),
        wil: mk('Воля', '🧘', 'Стрик', '#34d399', '#047857'),
        agi: mk('Ловкость', '⚡', 'Скорость', '#fb923c', '#c2410c')
    };
}
function heroV6() {
    return {
        name: 'Странник', title: '«Тот, кто только начал путь»',
        level: 3, xp: 40, xpToNext: 200, totalXp: 340,
        shards: 12, flasks: 2, hp: 80, maxHp: 100, isHollow: false, actionPoints: 3,
        estus: 3, estusUsedToday: 0, lastEstusReset: 1750000000000,
        consecutivePerfectDays: 2, dailyCompletions: 4, dailySkips: 1,
        lastSessionAt: 1758000000000, dailyUniqueStats: { str: 3 },
        cardHistory: { '2026-09-01': { done: 3, skip: 1 } },
        lastWeeklyReport: null
    };
}
function heroV10() {
    const h = heroV6();
    delete h.shards; delete h.flasks; delete h.hp; delete h.maxHp; delete h.isHollow;
    delete h.actionPoints; delete h.estus; delete h.estusUsedToday; delete h.lastEstusReset;
    h.gold = 1250;
    return h;
}
function strongholdsFor(capturedN) {
    return STRONGHOLDS.map((def, i) => ({
        id: def.id,
        captured: i < capturedN,
        garrison: i < capturedN ? [{ tier: 't2', count: 10 + i }, { tier: 't3', count: 4 + i }] : [],
        buildings: i < capturedN ? { zh1: { built: true, builtAt: 1750000000000, corruptionStage: 'ok', debtDays: 0 } } : {},
        corruption: { stage: 'ok', debtDays: 0 }
    }));
}
function common() {
    return {
        hero: null,
        stats: defaultStats(),
        forged: [makeCard(0), makeCard(1), makeCard(2)],
        goals: [makeGoal(0), makeGoal(1)],
        inventory: { backpack: [], equipped: { head: null, amulet: null, chest: null, cape: null, weapon: null, shield: null, ring1: null, ring2: null, boots: null }, maxSlots: 30 },
        lastDayReset: '2026-09-16', lastWeekReset: '2026-09-14',
        forgedIdCounter: 200, uidCounter: 20, goalIdCounter: 20, taskIdCounter: 10,
        xpHistory: [], bloodOath: null, tasks: [makeTask(1), makeTask(2)],
        hirePool: (() => { const p = {}; UNIT_TIERS.forEach(t => p[t] = 2); return p; })(),
        dailyQuests: { day: '2026-09-16', done: {}, quests: [], progress: {} },
        dailyEvent: null, gen: 42, savedAt: 1758100000000
    };
}
// validSave({version:6..10}) — сейв «как он выглядел бы, будучи записанным на той версии»
function validSave(opts) {
    const o = opts || {};
    const version = o.version === undefined ? 10 : o.version;
    if (!(Number.isInteger(version) && version >= 6 && version <= 10)) throw new Error('validSave: version 6..10, got ' + version);
    const data = Object.assign({ v: version }, common());
    data.hero = version <= 6 ? heroV6() : heroV10();
    if (version === 6) {
        data.bossHp = 500; data.bossStage = 2; data.bossDefeated = false; data.bossRunLocked = false;
        data.bossKills = { snake: 3, social: 1, chimera: 0 }; data.bossRagePoints = 7;
        data.tractState = { regions: 4, building: 'zh1' };
    }
    if (version === 7) data.tractState = { regions: 4, building: 'zh1' };
    if (version >= 8) {
        data.strongholds = strongholdsFor(6);
        const units = {}; UNIT_TIERS.forEach(t => units[t] = 5);
        data.army = { units, week: 3 };
        data.siege = { week: 4, lastResult: { outcome: 'win', dmg: 120 }, assaultDay: '2026-09-10', wkSkips: 1, wkTaskFails: 0 };
    }
    if (version >= 9) data.season = { num: 1, start: '2026-09-01', snapshot: { totalXp: 340, gold: 1250, captured: 6, completions: 12, level: 3 } };
    if (version >= 10) { data.throne = 2; data.season.crownBonus = 1; }
    return data;
}

module.exports = { validSave, SCHEMA_VERSION: 10 };
