'use strict';
// Общий сид-хелпер e2e (QA-6 п.56/59, владелец — Fix-A по решению оркестратора).
// Детерминированный сейв v10 «как после синхронизации»: 1 карточка, пустые задачи,
// 20 твердынь (0 захватов), армия/осада/сезон/трон в дефолте.
// Использование: const seedSave = require('./seed.cjs'); JSON.stringify(seedSave({ throne: 5 }))

const DAY = (offset = 0) => {
  const d = new Date(Date.now() + 3 * 3600000 + offset * 86400000); // МСК
  return d.toISOString().slice(0, 10);
};

module.exports = function seedSave(over = {}) {
  const s = {
    v: 10, gen: 1, savedAt: Date.now(),
    hero: { name: 'Странник', level: 3, xp: 40, xpToNext: 200, totalXp: 340, gold: 5000,
      lastSessionAt: Date.now(), lastWeeklyReport: DAY(-1), dailyUniqueStats: {}, cardHistory: {} },
    stats: { str: { name: 'Сила', value: 3, max: 100, attributePoints: 0 } },
    forged: [{ id: 101, name: 'Карточка', rank: 'C', stat: 'str', streak: 3, mastery: 0,
      masteryThreshold: 7, totalCompletions: 5, progress: 0, prestige: 0, evolutionPath: 'depth',
      daysActive: 10, meta: '⚔ 15 мин · день', firstCompletedAt: 1750000000000,
      lastCompletedAt: 1758000000000, lastFailDay: null }],
    goals: [], tasks: [],
    inventory: { backpack: [], equipped: { head: null, amulet: null, chest: null, cape: null,
      weapon: null, shield: null, ring1: null, ring2: null, boots: null }, maxSlots: 30 },
    lastDayReset: DAY(), lastWeekReset: DAY(-3),
    forgedIdCounter: 200, uidCounter: 20, goalIdCounter: 20, taskIdCounter: 10,
    xpHistory: [], bloodOath: null, hirePool: null,
    dailyQuests: { day: DAY(), done: {}, quests: [], progress: {} },
    strongholds: Array.from({ length: 20 }, (_, i) => ({
      id: 'sh' + String(i + 1).padStart(2, '0'), captured: false, garrison: [], buildings: {},
      corruption: { stage: 'ok', debtDays: 0 } })),
    army: { units: { t1: 5, t2: 5, t3: 5, t4: 5, t5: 5, t6: 5, t7: 5 }, week: 3 },
    siege: { week: 4, lastResult: { outcome: 'win', dmg: 120 }, assaultDay: DAY(-7), wkSkips: 0, wkTaskFails: 0 },
    season: { num: 1, start: DAY(-16), crownBonus: 1,
      snapshot: { totalXp: 340, gold: 5000, captured: 0, completions: 5, level: 3 } },
    throne: 0,
  };
  return Object.assign(s, over);
};
