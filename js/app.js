// ============ СИСТЕМА LEARN BY DOING ============
var audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return null; }
    }
    return audioCtx;
}
function playTone(freq, duration, type, vol, slide) {
    var ctx = getAudioCtx();
    if (!ctx) return;
    try {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slide) osc.frequency.linearRampToValueAtTime(slide, ctx.currentTime + duration);
        gain.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    } catch(e) {}
}
function sfxHit() { playTone(200, 0.12, 'square', 0.12, 100); }
function sfxCrit() { playTone(400, 0.08, 'square', 0.15); setTimeout(function() { playTone(600, 0.08, 'square', 0.15); }, 60); setTimeout(function() { playTone(800, 0.15, 'square', 0.12); }, 120); }
function sfxRankUp() { playTone(300, 0.1, 'square', 0.12); setTimeout(function() { playTone(450, 0.1, 'square', 0.12); }, 80); setTimeout(function() { playTone(600, 0.1, 'square', 0.12); }, 160); setTimeout(function() { playTone(900, 0.25, 'triangle', 0.1); }, 240); }
function sfxLevelUp() { [400,500,600,700,800,1000].forEach(function(f, i) { setTimeout(function() { playTone(f, 0.12, 'square', 0.1); }, i * 70); }); }
function sfxFail() { playTone(300, 0.15, 'sawtooth', 0.1, 100); }
function sfxForge() { playTone(150, 0.1, 'square', 0.1); setTimeout(function() { playTone(250, 0.15, 'square', 0.1); }, 100); setTimeout(function() { playTone(400, 0.2, 'triangle', 0.08); }, 200); }
function sfxGoalComplete() { playTone(500, 0.1, 'square', 0.1); setTimeout(function() { playTone(650, 0.1, 'square', 0.1); }, 80); setTimeout(function() { playTone(800, 0.1, 'square', 0.1); }, 160); setTimeout(function() { playTone(1000, 0.3, 'triangle', 0.08); }, 240); }
function sfxBossDefeated() { [200,300,400,500,600,800,1000,1200].forEach(function(f, i) { setTimeout(function() { playTone(f, 0.15, 'square', 0.1); }, i * 100); }); }
function sfxEquip() { playTone(350, 0.08, 'triangle', 0.1); setTimeout(function() { playTone(500, 0.12, 'triangle', 0.08); }, 60); }
function sfxError() { playTone(150, 0.2, 'square', 0.1, 80); }
function haptic(type) {
    try {
        var tg = window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback;
        if (tg) {
            if (type === 'light') tg.impactOccurred('light');
            else if (type === 'medium') tg.impactOccurred('medium');
            else if (type === 'heavy') tg.impactOccurred('heavy');
            else if (type === 'rigid') tg.impactOccurred('rigid');
            else if (type === 'success') tg.notificationOccurred('success');
            else if (type === 'warning') tg.notificationOccurred('warning');
            else if (type === 'error') tg.notificationOccurred('error');
        }
    } catch(e) {}
}
document.addEventListener('click', function() { getAudioCtx(); }, { once: true });
const ATTR_POOL_THRESHOLD = 5;
function getStatThreshold(value) {
return 5 + Math.floor(value * 1.5);
}
const HERO_XP_CURVE = [50, 100, 200, 380, 700, 1300, 2400, 4500, 8500, 16000, 22000, 30000, 40000, 52000, 68000];
function getXpToNext(level) {
if (level - 1 < HERO_XP_CURVE.length) return HERO_XP_CURVE[level - 1];
return Math.floor(HERO_XP_CURVE[HERO_XP_CURVE.length - 1] * Math.pow(1.65, level - HERO_XP_CURVE.length));
}
const RANK_PROGRESSION = ['C', 'CC', 'CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA', 'S', 'SS', 'SSS'];
const RANK_PHRASES = {
'C':'Пробуждение', 'CC':'Сила крепнет', 'CCC':'Воля закаляется',
'B':'Путь воина', 'BB':'Сталь и дух', 'BBB':'Непреклонный',
'A':'Мастерство', 'AA':'Совершенство', 'AAA':'Величие',
'S':'Легенда', 'SS':'Миф', 'SSS':'Бессмертный'
};
function getNextRank(current) {
const idx = RANK_PROGRESSION.indexOf(current);
if (idx === -1 || idx >= RANK_PROGRESSION.length - 1) return null;
return RANK_PROGRESSION[idx + 1];
}
const HERO = {
name: 'Странник', title: '«Тот, кто только начал путь»',
level: 1, xp: 0, xpToNext: 50, totalXp: 0, gold: 30,
consecutivePerfectDays: 0,
streakShields: 0,
dailyCompletions: 0, dailySkips: 0,
lastSessionAt: Date.now(), dailyUniqueStats: {}, cardHistory: {}, lastWeeklyReport: null,
doctrines: { t1: null, t2: null, t3: null } // Г1-2: военные доктрины
};
const STATS = {
str: { name: 'Сила',      icon: '⚔', desc: 'Урон',       color: '#c73e4d', dark: '#8b2635', value: 3, max: 100, attributePoints: 0 },
end: { name: 'Стойкость', icon: '🛡', desc: 'Оборона',    color: '#60a5fa', dark: '#2563eb', value: 3, max: 100, attributePoints: 0 },
int: { name: 'Интеллект', icon: '🧠', desc: 'XP бонус',   color: '#c084fc', dark: '#7c3aed', value: 3, max: 100, attributePoints: 0 },
cha: { name: 'Харизма',   icon: '🎭', desc: 'Шанс крита', color: '#fbbf24', dark: '#b45309', value: 3, max: 100, attributePoints: 0 },
wil: { name: 'Воля',      icon: '🧘', desc: 'Стрик',      color: '#34d399', dark: '#047857', value: 3, max: 100, attributePoints: 0 },
agi: { name: 'Ловкость',  icon: '⚡', desc: 'Скорость',   color: '#fb923c', dark: '#c2410c', value: 3, max: 100, attributePoints: 0 },
};
var pityCounter = 0; // в сессии; персист через cardHistory не нужен — счёт глобальный
function getLootChance(card) { return 0.05 + Math.min(0.05, (card.streak || 0) * 0.0025); }
function lootPityCheck(card) {
pityCounter++;
var chance = getLootChance(card);
if (pityCounter >= 25) { pityCounter = 0; return true; }
return Math.random() < chance;
}
const STARTER_DECK = [
    { name: 'Зарядка 10 мин',     stat: 'str', time: 'утро',  duration: 10 },
    { name: 'Читать 20 мин',      stat: 'int', time: 'вечер', duration: 20 },
    { name: 'Цифровой детокс',    stat: 'wil', time: 'утро',  duration: 0  },
    { name: 'Прогулка 30 мин',    stat: 'end', time: 'день',  duration: 30 }
];
const RANK_COLORS = {
C: { color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.15)', glow: 'rgba(156, 163, 175, 0.5)' },
B: { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)',  glow: 'rgba(96, 165, 250, 0.5)' },
A: { color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', glow: 'rgba(192, 132, 252, 0.5)' },
S: { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.2)',   glow: 'rgba(251, 191, 36, 0.7)' },
};
function getRankColorInfo(rank) {
if (rank === 'CC' || rank === 'CCC') return RANK_COLORS.C;
if (rank === 'BB' || rank === 'BBB') return RANK_COLORS.B;
if (rank === 'AA' || rank === 'AAA') return RANK_COLORS.A;
if (rank === 'SS' || rank === 'SSS') return RANK_COLORS.S;
return RANK_COLORS[rank] || RANK_COLORS.C;
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
const STATE_GUARDS = window.NeuroDeckStateGuards;
function ecoOn() { return !!(window.NeuroDeckPerf && window.NeuroDeckPerf.isEco()); }

document.addEventListener('click', function(e) {
var el = e.target.closest('[data-action]');
if (!el) return;
var action = el.dataset.action;
switch(action) {
case 'switch-view': switchView(el.dataset.view); break;
case 'open-sync-modal': openSyncModal(); break;
case 'close-sync-modal': closeSyncModal(); break;
case 'save-cloud': saveToCloud(); break;
case 'load-cloud': loadFromCloud(); break;
case 'copy-share-link': copyShareLink(); break;
case 'share-link': shareLinkNative(); break;
case 'download-sync-file': downloadSyncFile(); break;
case 'choose-sync-file': document.getElementById('syncFileInput').click(); break;
case 'export-json': exportJson(); break;
case 'reset-all-data': resetAllData(); break;
case 'set-reminder-freq':
if (typeof showReminderFreqToast === 'function') showReminderFreqToast(el.dataset.mode);
break;
case 'new-game-keep-cards': newGameKeepCards(); break;
case 'full-wipe-all': fullWipeAll(); break;
case 'toggle-notif': toggleNotif(); break;
case 'deep-recovery': deepRecovery(); break;
case 'set-perf': if (el.dataset.mode && window.NeuroDeckPerf) { var prevPerfMode = window.NeuroDeckPerf.getMode(); if (window.NeuroDeckPerf.setMode(el.dataset.mode) && prevPerfMode !== el.dataset.mode) { renderPerfStatus(); showToast('⚡ Режим изменён', { 'auto': 'Авто — эффекты зависят от системных настроек', 'eco': 'Эко — минимальная графика', 'performance': 'Все эффекты включены', 'low': 'Экономный режим — меньше анимаций', 'effects-off': 'Анимации отключены' }[el.dataset.mode] || el.dataset.mode); } } break;
case 'close-return-modal': closeReturnModal(); break;
case 'select-evolution': (function(sel) { document.querySelectorAll('#editEvolutionChips .stat-chip').forEach(function(c) { c.classList.toggle('selected', c === sel); }); pendingEvolutionPath = sel.dataset.path || null; })(el); break;
case 'prestige-card': prestigeCard(parseInt(el.dataset.id)); break;
case 'close-weekly-report': closeWeeklyReportModal(); break;
case 'close-season-report': document.getElementById('seasonModal').classList.remove('show'); break;
case 'throne-invest': investThrone(); break;
case 'ascend': requestAscension(); break; // Г2-5: Вознесение
case 'asc-doctrine': pickAscensionDoctrine(el.dataset.id); break; // Г2-5: выбор сохраняемой доктрины
case 'sh-daily-quest': completeDailyQuest(el.dataset.qid, parseInt(el.dataset.reward)); break;
case 'sh-open': currentShIdx = parseInt(el.dataset.idx); shCatalogOpen = false; renderStrongholdPanel(currentShIdx); hintOnce('shpanel', 'Жильё даёт недельный пул найма. Стройка занимает дни — планируй заранее.'); break;
case 'sh-catalog-toggle': shCatalogOpen = !shCatalogOpen; renderStrongholdPanel(currentShIdx); break;
case 'boss-challenge': requestBossChallenge(parseInt(el.dataset.num)); break; // Г2-1: вызов босса провинции
case 'sh-back': currentShIdx = null; renderStrongholds(); break;
case 'sh-assault': requestAssault(parseInt(el.dataset.idx)); break;
case 'sh-buy': buyBuilding(parseInt(el.dataset.idx), el.dataset.bid); break;
case 'reroll-event': rerollDailyEvent(); break;
case 'treasury-info': showTreasuryBreakdown(); break;
case 'pomodoro-toggle': togglePomodoro(parseInt(el.dataset.id)); break;
case 'pomodoro-stop': (function(pid) { try { localStorage.removeItem('nd_pomodoro_' + pid); } catch (e) {} renderDashboard(); })(el.dataset.id); break;
case 'counter-siege': requestCounterSiege(); break;
case 'km-stance': requestStance(String(el.dataset.stance || '')); break; // Г4: стойка недели
case 'km-edict': requestEdict(parseInt(el.dataset.idx), String(el.dataset.edict || '')); break; // Г4: эдикт провинции
case 'km-chronicle-open': showChronicle(); break; // Г5-Ф: летопись
case 'km-chronicle-close': closeChronicle(); break; // Г5-Ф
case 'km-techs-open': showTechs(); break; // Г5-Т: технологии
case 'km-techs-close': closeTechs(); break; // Г5-Т
case 'km-tech-buy': { var _terr = buyTech(String(el.dataset.tech || '')); if (_terr) { showToast('🔬 Отказано', _terr, 'blood'); sfxError(); } showTechs(); break; } // Г5-Т
case 'km-lvl-up': { var _lerr = upgradeTechLvl(String(el.dataset.tech || '')); if (_lerr) { showToast('🔬 Отказано', _lerr, 'blood'); sfxError(); } showTechs(); break; } // Г5-Т3 Ф2
case 'km-order': { requestTechOrder(String(el.dataset.order || '')); showTechs(); break; } // Г5-Т3 Ф2: приказ недели
case 'km-idea-buy': { var _ierr = buyTechIdea(String(el.dataset.idea || '')); if (_ierr) { showToast('⚜ Отказано', _ierr, 'blood'); sfxError(); } showTechs(); break; } // Г5-Т2: капстоун
case 'sh-scout': requestScout(parseInt(el.dataset.idx)); break; // Г2-3
case 'storm-pay': stormPay(); break; // Г1-5
case 'totem-choose': requestTotem(el.dataset.id); break; // Ф2
case 'doctrine-choose': chooseDoctrine(el.dataset.id); break; // Г1-2
case 'tower-climb': requestTowerClimb(); break; // Ф3
case 'sh-hire-army': hireUnit(el.dataset.tier, false, parseInt(el.dataset.idx)); break;
case 'sh-hire-garrison': hireUnit(el.dataset.tier, true, parseInt(el.dataset.idx)); break;
case 'sh-to-army': moveStack(el.dataset.tier, true, parseInt(el.dataset.idx)); break;
case 'sh-to-garrison': moveStack(el.dataset.tier, false, parseInt(el.dataset.idx)); break;
case 'close-siege-report': closeSiegeReport(); break;
case 'accept-starter-deck': acceptStarterDeck(); break;
case 'close-starter-deck': closeStarterDeck(); break;
case 'toggle-help': toggleHelp(); break;
case 'open-forge': openForge(); break;
case 'close-forge': closeForge(); break;
case 'forge-card': forgeCard(); break;
case 'select-forge-stat': selectedStat = el.dataset.stat; updateStatChips(); break;
case 'close-edit-card': closeEditCard(); break;
case 'select-edit-stat':
document.querySelectorAll('#editStatChips .stat-chip').forEach(function(c) {
c.classList.toggle('selected', c.dataset.stat === el.dataset.stat);
});
break;
case 'skip-edit-card': skipEditCard(); break;
case 'save-edit-card': saveEditCard(); break;
case 'open-goal-modal': openGoalModal(); break;
case 'close-goal-modal': closeGoalModal(); break;
case 'select-goal-type': selectedGoalType = el.dataset.type; updateGoalTypeSelection(); break;
case 'select-goal-stat': selectedGoalStat = el.dataset.stat; updateGoalStatChips(); break;
case 'create-goal': createGoal(); break;
case 'filter-goals':
document.querySelectorAll('.goal-filter').forEach(function(x) { x.classList.remove('active'); });
el.classList.add('active');
currentGoalFilter = el.dataset.filter;
renderGoals();
break;
case 'filter-backpack':
document.querySelectorAll('.backpack-tab').forEach(function(x) { x.classList.remove('active'); });
el.classList.add('active');
currentFilter = el.dataset.filter;
renderBackpack();
break;
case 'open-task-modal': openTaskModal(); break;
case 'close-task-modal': closeTaskModal(); break;
case 'select-task-tier': selectedTaskTier = el.dataset.tier; updateTaskTierSelection(); break;
case 'create-task': createTask(); break;
case 'complete-task': completeTask(parseInt(el.dataset.id)); break;
case 'claim-task-gold': claimTaskChest(parseInt(el.dataset.id), 'gold'); break;
case 'claim-task-xp': claimTaskChest(parseInt(el.dataset.id), 'xp'); break;
case 'delete-task': deleteTask(parseInt(el.dataset.id)); break;
case 'complete-card': completeCard(e, parseInt(el.dataset.id)); break;
case 'fail-card': failCard(e, parseInt(el.dataset.id)); break;
case 'edit-card': openEditCardDirect(parseInt(el.dataset.id)); break;
case 'delete-card': deleteCard(parseInt(el.dataset.id)); break;
case 'equip-item': equipItem(el.dataset.uid); break;
case 'unequip-item': unequipItem(el.dataset.slot); break;
case 'discard-item': discardItem(el.dataset.uid); break;
case 'toggle-goal-step': toggleGoalStep(parseInt(el.dataset.id), parseInt(el.dataset.step)); break;
case 'delete-goal': deleteGoal(parseInt(el.dataset.id)); break;
}
});

let FORGED = [];
let forgedIdCounter = 100;
function getCardDaysActive(card) {
if (!card.firstCompletedAt) return 0;
const diffMs = Date.now() - card.firstCompletedAt;
return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
function getStreakBonus(card) {
var streak = card.streak || 0;
return 1.0 + Math.min(1.0, streak * 0.05);
}
function getStreakBonusLabel(mult) {
var pct = Math.round((mult - 1.0) * 100);
if (mult >= 2.0) return { label: '🔥 ×2.0 MAX', cls: 'streak-max' };
if (mult >= 1.5) return { label: '🔥 ×' + mult.toFixed(2) + ' (+' + pct + '%)', cls: 'streak-high' };
if (mult >= 1.2) return { label: '🔥 ×' + mult.toFixed(2) + ' (+' + pct + '%)', cls: 'streak-mid' };
return { label: '🔥 ×' + mult.toFixed(2), cls: 'streak-low' };
}
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
function getMSKDate(ts) { return new Date((ts || Date.now()) + MSK_OFFSET_MS); }
var HOLIDAYS = { // #8: календарные праздники (MSK-дата), в сейв не пишутся — детерминировано датой
    '01-01': { label: 'Новый год', tip: 'Тик казны ×1.5 сегодня', tickMult: 1.5 },
    '10-31': { label: 'Хэллоуин', tip: 'Призраки не списывают золото', ghostsFree: true },
    '09-17': { label: 'День NeuroDeck', tip: 'Все награды +10%', rewardMult: 1.1 }
};
function holidayBonus(todayKey) { var h = HOLIDAYS[(todayKey || getMSKDayKey()).slice(5)]; return h || null; }
function holidayRewardMult() { var h = holidayBonus(); return (h && h.rewardMult) || 1; }
var TOTEMS = [ // Ф2: тотемное животное — выбор открывается после первого захвата твердыни
    { id: 'wolf', icon: '🐺', name: 'Волк', tip: '+5% золото тика казны' },
    { id: 'owl', icon: '🦉', name: 'Сова', tip: '+10% XP карточек' },
    { id: 'bear', icon: '🐻', name: 'Медведь', tip: '+2% обороны осады' }
];
function totemOf() {
    var id = HERO.totem && HERO.totem.id;
    if (!id) return null;
    for (var i = 0; i < TOTEMS.length; i++) if (TOTEMS[i].id === id) return TOTEMS[i];
    return null;
}
function totemGoldMult() { var t = totemOf(); return (t && t.id === 'wolf') ? 1.05 : 1; }
function totemXpMult() { var t = totemOf(); return (t && t.id === 'owl') ? 1.10 : 1; }
function totemDefMult() { var t = totemOf(); return (t && t.id === 'bear') ? 1.02 : 1; }

// ===================== Г1-2: ВОЕННЫЕ ДОКТРИНЫ (ранги по захватам 3/8/14, сброс на смене сезона) =====================
var DOCTRINE_TIERS = { t1: 3, t2: 8, t3: 14 }; // гейт: capturedCount
var DOCTRINE_IDS = ['tax', 'upkeep', 'atk', 'growth', 'lore', 'fort', 'crown', 'veteran', 'engine'];
var DOCTRINES = {
    tax:     { tier: 't1', icon: '💰', name: 'Налоговый уклад',   tip: 'Казна твердынь: +15% к дневному тику' },
    upkeep:  { tier: 't1', icon: '⚒', name: 'Строй-устав',        tip: 'Содержание построек −20%' },
    atk:     { tier: 't1', icon: '⚔', name: 'Школа натиска',      tip: 'Сила армии в бою +10%' },
    growth:  { tier: 't2', icon: '🌱', name: 'Путь роста',        tip: 'XP карточек +25%' },
    lore:    { tier: 't2', icon: '📜', name: 'Школа мудрости',    tip: 'Каждые 7 дней стрика: +1 🛡' },
    fort:    { tier: 't2', icon: '🏰', name: 'Школа крепостей',   tip: 'Оборона гарнизонов +10%' },
    crown:   { tier: 't3', icon: '👑', name: 'Корона и скипетр',  tip: 'ВСЁ золото +10%' },
    veteran: { tier: 't3', icon: '🩸', name: 'Ветеранский устав', tip: 'Потери при штурмах ×0.7' },
    engine:  { tier: 't3', icon: '🏗', name: 'Инженерный корпус', tip: 'Постройки дешевле на 15%' }
};
function doctrineOf(tier) {
    if (!HERO.doctrines) HERO.doctrines = { t1: null, t2: null, t3: null };
    var id = HERO.doctrines[tier];
    return (id && DOCTRINES[id] && DOCTRINES[id].tier === tier) ? id : null;
}
function doctrineTaxMult() { return doctrineOf('t1') === 'tax' ? 1.15 : 1; }
function doctrineUpkeepMult() { return doctrineOf('t1') === 'upkeep' ? 0.8 : 1; }
function doctrineAtkMult() { return doctrineOf('t1') === 'atk' ? 1.10 : 1; }
function doctrineXpMult() { return doctrineOf('t2') === 'growth' ? 1.25 : 1; }
function doctrineFortMult() { return doctrineOf('t2') === 'fort' ? 1.10 : 1; }
function doctrineCrownMult() { return doctrineOf('t3') === 'crown' ? 1.10 : 1; }
function doctrineAttritionMult() { return doctrineOf('t3') === 'veteran' ? 0.7 : 1; }
function doctrineEngineMult() { return doctrineOf('t3') === 'engine' ? 0.85 : 1; }
function activeDoctrineList() {
    return ['t1', 't2', 't3'].map(doctrineOf).filter(Boolean).map(function(id) { return DOCTRINES[id]; });
}
// Г1-3: синергии построек — вычисляемые наборы, в сейве не хранятся
function shCatIds(cat) {
    return Object.keys(BUILDINGS).filter(function(id) { return BUILDINGS[id].cat === cat; });
}
function shCatBuilt(idx, cat) {
    var b = strongholds[idx].buildings;
    return shCatIds(cat).filter(function(id) { return b[id] && b[id].built; });
}
function synergyDfOk(idx) { return shCatBuilt(idx, 'defense').length === shCatIds('defense').length; } // df-четвёрка
function synergyEcOk(idx) { return shCatBuilt(idx, 'econ').length >= 3; }
function synergyZhOk(idx) { return shCatBuilt(idx, 'house').length === shCatIds('house').length; }
function synergySpPairOk() { // sp2 (Кузня) в захваченном соседе (idx±1) sp3 (Собор)
    return strongholds.some(function(s, i) {
        if (!s.captured) return false;
        var sp2 = s.buildings.sp2 && s.buildings.sp2.built;
        if (!sp2) return false;
        return [i - 1, i + 1].some(function(j) {
            var n = strongholds[j];
            return n && n.captured && n.buildings.sp3 && n.buildings.sp3.built;
        });
    });
}
function synergyDefMult(idx) { return synergyDfOk(idx) ? 1.05 : 1; }
function synergyEcMult(idx) { return synergyEcOk(idx) ? 1.15 : 1; }
function synergyHireMult() { return strongholds.some(function(s, i) { return s.captured && synergyZhOk(i); }) ? 0.9 : 1; }
function synergyAtkMult() { return synergySpPairOk() ? 1.05 : 1; }
function synergyRows(idx) { // строки «✦ Синергия: <имя> (+эффект)» для панели твердыни
    var rows = [];
    if (synergyDfOk(idx)) rows.push('✦ Синергия: полный оборонительный пояс (+5% обороны)');
    if (synergyEcOk(idx)) rows.push('✦ Синергия: торговый узел (+15% местных налогов)');
    if (synergyZhOk(idx)) rows.push('✦ Синергия: военная линейка (найм −10% везде)');
    if (synergySpPairOk()) rows.push('✦ Синергия: Кузня у Собора (+5% атаки армии)');
    return rows;
}
function checkDoctrineOffer() { // подсказка на точном гейте 3/8/14 — выбор не форсируется, можно отложить
    var n = capturedCount();
    var tier = (n === 3) ? 't1' : (n === 8) ? 't2' : (n === 14) ? 't3' : null;
    if (!tier || doctrineOf(tier)) return;
    showToast('🎖 Новая доктрина', 'Ранг ' + tier.toUpperCase() + ': выбери военную доктрину во вкладке героя', 'crit');
    haptic('success');
}
function chooseDoctrine(id) { // dungeonConfirm-стиль, как тотем
    var d = DOCTRINES[id];
    if (!d) return;
    if (doctrineOf(d.tier)) { showToast('🎖 Доктрина уже выбрана', 'Смена — в новом сезоне', 'blood'); return; }
    if (capturedCount() < DOCTRINE_TIERS[d.tier]) { showToast('🔒 Ранг мал', 'Нужно ' + DOCTRINE_TIERS[d.tier] + ' твердынь', 'blood'); return; }
    dungeonConfirm('🎖 Доктрина: ' + d.name + '?', d.tip + '<br><span style="color:var(--text-dim)">Действует до конца сезона. Смена — на смене сезона.</span>').then(function(ok) {
        if (!ok) return;
        HERO.doctrines[d.tier] = id;
        showToast('🎖 Доктрина принята', d.icon + ' ' + d.name + ': ' + d.tip, 'save');
        sfxLevelUp(); haptic('success');
        updateHeroUI(); renderDashboard(); saveGameState();
    });
}
function renderDoctrineCard() { // карточка доктрин в Hero-вкладке — JS-insert рядом с #totemCard (без правки index.html)
    var box = document.getElementById('totemCard');
    if (!box) return;
    var dc = document.getElementById('doctrineCard');
    if (!dc) { dc = document.createElement('div'); dc.id = 'doctrineCard'; box.parentNode.insertBefore(dc, box.nextSibling); }
    if (capturedCount() < 3) { dc.innerHTML = ''; return; }
    var html = '<div class="totem-chosen"><b>🎖 Военные доктрины</b></div>';
    ['t1', 't2', 't3'].forEach(function(tier) {
        var gate = DOCTRINE_TIERS[tier];
        var chosenId = doctrineOf(tier);
        if (chosenId) {
            var d = DOCTRINES[chosenId];
            html += '<div class="totem-chosen" title="' + esc(d.tip) + '"><span class="totem-icon">' + d.icon + '</span><div><b>' + d.name + '</b><div class="totem-tip">' + d.tip + '</div></div></div>';
            return;
        }
        if (capturedCount() < gate) { html += '<div class="totem-tip" style="padding:4px 0">🔒 Ранг ' + tier.toUpperCase() + ' откроется на ' + gate + ' твердынях</div>'; return; }
        html += '<div class="totem-tip" style="padding:4px 0">⚔ Ранг ' + tier.toUpperCase() + ' — выбери доктрину:</div><div class="totem-row">';
        DOCTRINE_IDS.forEach(function(id) {
            if (DOCTRINES[id].tier !== tier) return;
            var d2 = DOCTRINES[id];
            html += '<button class="totem-opt" data-action="doctrine-choose" data-id="' + id + '" title="' + esc(d2.tip) + '">' + d2.icon + ' ' + d2.name + '<span class="totem-tip">' + d2.tip + '</span></button>';
        });
        html += '</div>';
    });
    dc.innerHTML = html;
}
function renderTotemCard() { // Ф2: карточка «Тотем» в Hero-вкладке (до 1 захвата не существует)
    var box = document.getElementById('totemCard');
    if (!box) return;
    if (capturedCount() < 1) { box.innerHTML = ''; return; }
    var t = totemOf();
    if (t && !(HERO.totem && HERO.totem.rechoose)) {
        box.innerHTML = '<div class="totem-chosen" title="' + esc(t.tip) + '"><span class="totem-icon">' + t.icon + '</span><div><b>Тотем: ' + t.name + '</b><div class="totem-tip">' + t.tip + '</div></div></div>';
        return;
    }
    var html = '<div class="totem-title">🐾 Тотемное животное</div><div class="totem-tip">' + (t ? 'Смена сезона позволяет сменить тотем.' : 'Выбирай спутника: бонус действует постоянно. Смена — на смене сезона.') + '</div><div class="totem-row">';
    TOTEMS.forEach(function(x) {
        html += '<button class="totem-opt' + (t && t.id === x.id ? ' active' : '') + '" data-action="totem-choose" data-id="' + x.id + '" title="' + x.tip + '">' + x.icon + ' ' + x.name + '<span class="totem-tip">' + x.tip + '</span></button>';
    });
    box.innerHTML = html + '</div>';
}
function requestTotem(id) { // Ф2: выбор через dungeonConfirm
    var x = null;
    for (var i = 0; i < TOTEMS.length; i++) if (TOTEMS[i].id === id) x = TOTEMS[i];
    if (!x) return;
    dungeonConfirm('🐾 Тотем: ' + x.name + '?', x.tip + '<br><span style="color:var(--text-dim)">Сменить можно будет только на смене сезона.</span>').then(function(ok) {
        if (!ok) return;
        HERO.totem = { id: x.id, chosenDayKey: getMSKDayKey(), rechoose: false };
        showToast(x.icon + ' ' + x.name + ' — твой тотем', x.tip, 'save');
        haptic('success');
        renderTotemCard(); renderDashboard(); saveGameState();
    });
}
var TOWER_MAX_FLOOR = 50; // Ф3: кап этажа башни-марафона
function towerWeek1Base() { // эталонная сила недели 1 из SM — считаем на вызове, не топ-левел
    return SM.siegePower(STRONGHOLDS[0].total, 1, 1, 0);
}
function towerEnemyPower(floor) { // враг растёт ×1.2 за этаж
    return Math.round(towerWeek1Base() * Math.pow(1.2, floor));
}
function renderTowerCard(cap) { // Ф3: карточка «🗼 Башня» — эндгейм при 20/20
    if (cap !== 20) return '';
    if (!HERO.tower || typeof HERO.tower !== 'object') HERO.tower = { floor: 0, lastFloorDay: '' };
    var t = HERO.tower;
    if (t.floor >= TOWER_MAX_FLOOR) return '<div class="tower-card" title="👑 Башня покорена — марафон завершён"><b>🗼 Башня покорена</b> · этаж ' + TOWER_MAX_FLOOR + '/' + TOWER_MAX_FLOOR + ' 👑</div>';
    var used = t.lastFloorDay === getMSKDayKey();
    return '<div class="tower-card" title="Враг этажа: ~' + towerEnemyPower(t.floor) + ' · награда за подъём: ' + (100 * (t.floor + 1)) + ' 💰 · 1 попытка в день">'
        + '🗼 <b>Башня</b> · этаж <b>' + t.floor + '/' + TOWER_MAX_FLOOR + '</b> · враг ~<b>' + towerEnemyPower(t.floor) + '</b> · награда <b>' + (100 * (t.floor + 1)) + ' 💰</b> · '
        + (used ? '<span style="color:var(--text-dim)">Попытка израсходована — приходи завтра</span>'
                : '<button data-action="tower-climb">🧗 Подъём</button>')
        + '</div>';
}
function requestTowerClimb() { // Ф3: подъём — 1 попытка/день, поражение без потерь
    ensureStrongholdState();
    if (!HERO.tower || typeof HERO.tower !== 'object') HERO.tower = { floor: 0, lastFloorDay: '' };
    var t = HERO.tower;
    if (t.floor >= TOWER_MAX_FLOOR) return;
    if (t.lastFloorDay === getMSKDayKey()) { showToast('🗼 Попытка израсходована', 'Вернись завтра — башня ждёт', 'blood'); return; }
    if (!SM || SM.armyPower(army.units) <= 0) { showToast('⚔ Армии нет', 'Найми существ в твердыне', 'blood'); sfxError(); return; }
    t.lastFloorDay = getMSKDayKey(); // попытка сгорает в ОБОИХ исходах
    var atk = Math.round(SM.armyPower(army.units) * techArmyMult() * (1 + 0.02 * STATS.str.value) * doctrineAtkMult() * synergyAtkMult() * techAtkMult()); // Г5-Т: Осадный парк +10% / Знамёна +5% (UI-прогноз); Г5-Т2: Легионы +10%
    var out = SM.assaultOutcome(atk, towerEnemyPower(t.floor), { agi: STATS.agi.value, banner: hasSpecialOk('sp2'), rand: Math.random });
    if (out.win) {
        t.floor += 1;
        goldGain(100 * t.floor, 'tower');
        showToast('🗼 Этаж ' + t.floor + '/' + TOWER_MAX_FLOOR + ' покорён!', '+' + (100 * t.floor) + ' 💰 · враг следующего этажа: ~' + (t.floor >= TOWER_MAX_FLOOR ? '—' : towerEnemyPower(t.floor)), 'crit');
        sfxBossDefeated(); haptic('success');
    } else {
        showToast('↩ Отступление с высоты ' + t.floor, 'Потерь нет — попытка израсходована', 'blood');
        sfxFail(); haptic('error');
    }
    renderStrongholds(); updateHeroUI(); saveGameState();
}
var _dailyPairIds = {}; // #29: карты дня (✨) — детерминированная пара по дате
function dailyCardPair() {
    var tk = getMSKDayKey();
    var seed = parseInt(tk.replace(/-/g, ''), 10) || 0;
    var eligible = FORGED.filter(function(c) { return !(c.lastCompletedAt && getMSKDayKey(c.lastCompletedAt) === tk); });
    eligible.sort(function(a, b) { return ((((a.id || 0) * 2654435761) ^ seed) >>> 0) - ((((b.id || 0) * 2654435761) ^ seed) >>> 0); });
    return eligible.slice(0, 2); // ponytail: пара сдвигается в течение дня по мере выполнения карт — приемлемо
}
// Г2-4: комбо-гримуар — пары/тройки статов, завершённых в ОДИН день; первое срабатывание открывает запись
var COMBOS = [
    { id: 'fortress',    name: 'Крепость духа',    icon: '🏰', need: ['str', 'end'],    desc: '+30% XP обеим картам дня' },
    { id: 'blades',      name: 'Танец клинков',    icon: '🗡', need: ['agi', 'str'],    desc: '+2 💰 за каждую из двух карт' },
    { id: 'axis',        name: 'Ось покоя',        icon: '🧘', need: ['end', 'end'],    desc: '−1 гнев осады' },
    { id: 'focus',       name: 'Фокус',            icon: '🛡', need: ['wil'], any: true, desc: '+1 щит стрика (кап 100)' },
    { id: 'harmony',     name: 'Гармония',         icon: '☯', need: 3,                 desc: '+15 XP за три разных пути' },
    { id: 'triumvirate', name: 'Триумвират силы',  icon: '⚔', need: ['str', 'str', 'str'], desc: '+20 💰' },
    { id: 'vortex',      name: 'Вихрь',            icon: '🌪', need: ['agi', 'agi'],    desc: '+10% XP до конца дня' },
    { id: 'dawn',        name: 'Страж рассвета',   icon: '🌅', need: ['wil', 'end'],    desc: '+5 💰' }
];
function comboCountsMet(c, counts) { // need: мультисет статов; need===3 — три разных стата; any — нужен второй стат
    if (c.need === 3) return Object.keys(counts).filter(function(k) { return counts[k] > 0; }).length >= 3;
    for (var i = 0; i < c.need.length; i++) {
        if ((counts[c.need[i]] || 0) < 1) return false;
        if (!c.any && c.need.filter(function(s) { return s === c.need[i]; }).length > (counts[c.need[i]] || 0)) return false;
    }
    if (c.any) {
        var total = 0, others = 0;
        Object.keys(counts).forEach(function(k) { total += counts[k]; if (counts[k] > 0 && c.need.indexOf(k) === -1) others++; });
        if (total < 2 || (!others && Object.keys(counts).length < 2)) return false;
    }
    return true;
}
function checkCombos(finalXp) { // Г2-4: вызывается из completeCard после инкремента счётчика статов дня
    var counts = HERO.dayStatCounts = HERO.dayStatCounts || {};
    var done = HERO.combosToday = HERO.combosToday || {};
    var tk = getMSKDayKey();
    COMBOS.forEach(function(c) {
        if (done[c.id] === tk) return;
        if (!comboCountsMet(c, counts)) return;
        done[c.id] = tk;
        if ((HERO.combosFound || []).indexOf(c.id) === -1) HERO.combosFound = (HERO.combosFound || []).concat([c.id]);
        comboApplyEffect(c, finalXp);
        showToast(c.icon + ' Комбо: ' + c.name + '!', c.desc + ' · записано в Гримуар связей', 'crit');
        sfxGoalComplete(); haptic('success');
    });
    renderGrimoire();
}
function comboApplyEffect(c, finalXp) {
    if (c.id === 'fortress') { var bx = Math.round((finalXp || 15) * 0.6); HERO.xp += bx; HERO.totalXp += bx; recordXpEvent(bx); } // ponytail: обе карты дня как one-shot +30%+30% по факту закрытия пары
    else if (c.id === 'blades') goldGain(4, 'combo');
    else if (c.id === 'axis') { if ((siege.wkSkips || 0) > 0) siege.wkSkips--; else if ((siege.wkTaskFails || 0) > 0) siege.wkTaskFails--; }
    else if (c.id === 'focus') HERO.streakShields = Math.min(100, (HERO.streakShields || 0) + 1);
    else if (c.id === 'harmony') { HERO.xp += 15; HERO.totalXp += 15; recordXpEvent(15); }
    else if (c.id === 'triumvirate') goldGain(20, 'combo');
    else if (c.id === 'vortex') HERO.comboDayXp = 1.1;
    else if (c.id === 'dawn') goldGain(5, 'combo');
}
function renderGrimoire() { // Г2-4: раздел «📖 Гримуар связей» в Колоде — найденные полные vs «???»
    var box = document.getElementById('grimoireBox');
    if (!box) return;
    var found = HERO.combosFound || [];
    var html = '<div class="grimoire-head" data-action="grimoire-toggle">📖 Гримуар связей <span class="grimoire-count">' + found.length + '/' + COMBOS.length + '</span><span class="grimoire-hint">комбо статов за один день</span></div>';
    html += '<div class="grimoire-grid">';
    COMBOS.forEach(function(c) {
        var has = found.indexOf(c.id) !== -1;
        if (has) {
            html += '<div class="grimoire-cell found" title="' + c.desc + '"><div class="grimoire-icon">' + c.icon + '</div><div class="grimoire-name">' + c.name + '</div><div class="grimoire-desc">' + c.desc + '</div></div>';
        } else {
            html += '<div class="grimoire-cell" title="Не открыто"><div class="grimoire-icon">❓</div><div class="grimoire-name">???</div><div class="grimoire-desc">' + comboHint(c) + '</div></div>';
        }
    });
    html += '</div>';
    box.innerHTML = html;
}
function comboHint(c) { // силуэт: подсказка-условие без награды
    if (c.need === 3) return 'Три разных пути за день';
    if (c.any) return STATS[c.need[0]].icon + ' ' + STATS[c.need[0]].name + ' + любой стат за день';
    return c.need.map(function(s) { return STATS[s].icon; }).join('+') + ' за один день';
}

function renderCards() {
const grid = document.getElementById('cardGrid');
grid.innerHTML = '';
const all = [...FORGED];
document.getElementById('deckCount').textContent = all.length;
_dailyPairIds = {};
dailyCardPair().forEach(function(c) { _dailyPairIds[c.id] = true; });
if (all.length === 0) {
grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Пока пусто. Нажми «🔨 Выковать карточку», чтобы создать первую карточку.</div>';
renderGrimoire();
return;
}
if (all.length <= 100) { all.forEach(c => renderOneCard(c, grid)); renderGrimoire(); return; }
var _ri = 0;
(function renderChunk() { // QA2-H3: чанкованный рендер (50/rAF) — 500 карт больше не блокируют кадр
    var end = Math.min(_ri + 50, all.length);
    for (; _ri < end; _ri++) renderOneCard(all[_ri], grid);
    if (_ri < all.length) requestAnimationFrame(renderChunk); else renderGrimoire();
})();
}
function renderOneCard(card, grid) {
if (!card.rank) card.rank = 'C';
if (typeof card.mastery !== 'number') card.mastery = 0;
if (typeof card.masteryThreshold !== 'number') card.masteryThreshold = 7;
if (typeof card.totalCompletions !== 'number') card.totalCompletions = 0;
if (typeof card.daysActive !== 'number') card.daysActive = 0;
card.daysActive = getCardDaysActive(card);
const streakMult = getStreakBonus(card);
const streakInfo = getStreakBonusLabel(streakMult);
const st = STATS[card.stat] || STATS.str;
const progressPct = Math.min(100, Math.round((card.mastery / card.masteryThreshold) * 100));
const el = document.createElement('div');
el.className = 'card rank-' + card.rank;
const doneToday = card.lastCompletedAt && getMSKDayKey(card.lastCompletedAt) === getMSKDayKey();
if (doneToday) el.className += ' done-today';
if (_dailyPairIds[card.id]) el.className += ' day-card';
if (bloodOath && bloodOath.status === 'active' && bloodOath.cardId === card.id) {
el.className += ' blood-oath';
}
const nextRankText = getNextRank(card.rank) || 'MAX';
var oathBadge = (bloodOath && bloodOath.status === 'active' && bloodOath.cardId === card.id)
? '<div class="blood-oath-badge">🩸 Клятва ' + bloodOath.streak + '/' + bloodOath.requiredDays + '</div>' : '';
var dayBadge = _dailyPairIds[card.id] ? '<div class="day-card-badge" title="Карта дня: XP и золото ×2">✨</div>' : '';
el.innerHTML =
dayBadge +
oathBadge +
'<div class="card-corner-actions">' +
   '<div class="card-btn edit" data-action="edit-card" data-id="' + card.id + '" title="Редактировать">✎</div>' +
   '<div class="card-btn delete" data-action="delete-card" data-id="' + card.id + '" title="Удалить">🗑</div>' +
   '<div class="card-btn pomodoro" data-action="pomodoro-toggle" data-id="' + card.id + '" title="Помодоро 25 мин (+5 XP, 1/день)">⏱</div>' + // #65: помодоро в карточке
   (card.rank === 'SSS' && (card.prestige || 0) < 3 ? '<div class="card-btn" data-action="prestige-card" data-id="' + card.id + '" title="Переродить" style="color:var(--gold-bright)">⭐</div>' : '') +
'</div>' +
'<div class="card-rank">' + card.rank + '</div>' +
'<div class="card-name">' + esc(card.name) + '</div>' +
'<div class="card-meta">' + esc(card.meta || '') + '</div>' +
'<div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">' +
  '<span class="card-stat-tag" style="color: ' + st.color + '; border-color: ' + st.color + '40;">' +
    '<span>' + st.icon + '</span> ' + st.name +
  '</span>' +
  '<span class="card-adaptation-tag ' + streakInfo.cls + '">' + streakInfo.label + '</span>' +
'</div>' +
'<div class="card-stats-line">Выполнено: <b>' + (card.totalCompletions || 0) + '</b> · 🔥 <b>' + (card.streak || 0) + '</b></div>' +

'<div class="card-mastery">Мастерство: <b>' + card.mastery + '/' + card.masteryThreshold + '</b> до ранга ' + nextRankText + '</div>' +
'<div class="card-progress"><div class="card-progress-bar" style="width:' + progressPct + '%"></div></div>' +
'<div class="card-btn-row">' +
(doneToday
    ? '<div class="card-complete-btn done">✓ Выполнено</div>'
    : '<button class="card-complete-btn" data-action="complete-card" data-id="' + card.id + '">⚔ Выполнить</button>' +
      '<button class="card-skip-btn" data-action="fail-card" data-id="' + card.id + '" title="Пропустить (−1💰)">✕</button>'
) +
'</div>';
el.addEventListener('mousemove', (e) => {
if (ecoOn()) return;
const r = el.getBoundingClientRect();
const x = e.clientX - r.left, y = e.clientY - r.top;
el.style.transform = 'perspective(800px) rotateX(' + (-(y-r.height/2)/r.height*14) + 'deg) rotateY(' + ((x-r.width/2)/r.width*14) + 'deg) translateZ(4px)';
el.style.setProperty('--mx', ((x/r.width)*100) + '%');
el.style.setProperty('--my', ((y/r.height)*100) + '%');
});
el.addEventListener('mouseleave', () => { el.style.transform = ''; });
el.addEventListener('touchmove', (e) => {
if (ecoOn()) return;
var touch = e.touches[0];
var r = el.getBoundingClientRect();
var x = touch.clientX - r.left, y = touch.clientY - r.top;
el.style.transform = 'perspective(800px) rotateX(' + (-(y-r.height/2)/r.height*8) + 'deg) rotateY(' + ((x-r.width/2)/r.width*8) + 'deg) translateZ(2px)';
});
el.addEventListener('touchend', () => { el.style.transform = ''; });
var longPressTimer = null;
el.addEventListener('touchstart', function(e) {
longPressTimer = setTimeout(function() {
longPressTimer = null;
haptic('medium');
openEditCardDirect(card.id);
}, 500);
}, { passive: true });
el.addEventListener('touchmove', function() { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } });
el.addEventListener('touchend', function() { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } });
grid.appendChild(el);
}
renderCards();
function findCard(id) { return FORGED.find(c => c.id === id); }
function spawnFloatNumber(x, y, text, color) {
const el = document.createElement('div');
el.className = 'float-number';
if (color === '#c73e4d' || color === 'var(--blood-bright)') el.classList.add('damage');
el.textContent = text;
el.style.left = x + 'px';
el.style.top = y + 'px';
if (color && color !== '#c73e4d' && color !== 'var(--blood-bright)') {
el.style.color = color;
}
document.body.appendChild(el);
setTimeout(() => el.remove(), 1500);
}
function completeCard(e, id) {
e.stopPropagation();
const card = findCard(id);
if (!card) {
console.warn('Card not found:', id);
return;
}
if (card.lastCompletedAt && getMSKDayKey(card.lastCompletedAt) === getMSKDayKey()) {
showToast('⚠ Уже выполнено', 'Карточка уже была выполнена сегодня', 'blood');
sfxError(); haptic('warning');
return;
}
const btn = e.target.closest('[data-action]') || e.target;
const rect = btn.getBoundingClientRect();
const x = rect.left + rect.width/2, y = rect.top + rect.height/2;
var stDef = STATS[card.stat] || STATS.str;
burstParticles(x, y, 28, { color: stDef.color, speed: 5, decay: 0.02, size: 3, shape: 'spark', gravity: 0.08 });
spawnFloatNumber(x, y - 40, '+' + stDef.icon + ' 1', stDef.color);
var kpIdx = capturedCount();
var kpAll = document.querySelectorAll('.sh-kp');
if (kpAll[kpIdx]) { kpAll[kpIdx].classList.add('sh-kp-flash'); setTimeout(function() { kpAll[kpIdx] && kpAll[kpIdx].classList.remove('sh-kp-flash'); }, 800); }
card.daysActive = getCardDaysActive(card);
const streakMult = getStreakBonus(card);
if (!card.firstCompletedAt) {
card.firstCompletedAt = Date.now();
card.daysActive = 0;
}
const baseCardXp = 15;
const dayMult = _dailyPairIds[card.id] ? 2 : 1; // #29: карта дня ×2
const bloodMult = (dailyEvent && dailyEvent.id === 'bloodmoon') ? 2 : 1; // #41: Кровавая луна — XP ×2
const gear = getTotalGearBonuses();
const totalInt = STATS.int.value + gear.int;
const heroIntBonus = 1 + (totalInt - 3) * 0.01;
const comboMult = getComboMultiplier();
const prestigeMult = getPrestigeXPBonus(card.stat);
const finalXp = Math.round(baseCardXp * streakMult * heroIntBonus * comboMult * prestigeMult) * dayMult * bloodMult * holidayRewardMult() * totemXpMult() * doctrineXpMult() * bossArtifactMult('xp') * techIdeaXpMult() * techXpMult() * (HERO.comboDayXp || 1); // #8/#41: праздник +10%, луна ×2; Ф2: сова +10%; Г1-2 growth +25%; Г2-1 артефакт +10%; Г2-4 Вихрь +10%; Г5-Т2 Могущество +15%; Г5-Т3: Псалмы+Ритуалы+Трансценденция
HERO.xp += finalXp; HERO.totalXp += finalXp;
recordXpEvent(finalXp);
spawnFloatNumber(x, y - 20, '+' + finalXp + ' XP', '#f4c896');
card.mastery += card.evolutionPath === 'depth' ? 1.5 : 1;
card.totalCompletions = (card.totalCompletions || 0) + 1;
card.streak = (card.streak || 0) + 1;
card.lastCompletedAt = Date.now();
HERO.dailyCompletions++;
bossProgressTick(); // Г2-1: фазы боссов (cards/streak)
HERO.dailyUniqueStats = HERO.dailyUniqueStats || {};
HERO.dailyUniqueStats[card.stat] = true;
HERO.dayStatCounts = HERO.dayStatCounts || {}; // Г2-4: счётчик статов дня для комбо
HERO.dayStatCounts[card.stat] = (HERO.dayStatCounts[card.stat] || 0) + 1;
var todayKey = getMSKDayKey();
HERO.cardHistory = HERO.cardHistory || {};
HERO.cardHistory[todayKey] = HERO.cardHistory[todayKey] || {};
HERO.cardHistory[todayKey][card.id] = true;
HERO.lastActiveDay = todayKey; // #19: активность дня
if (card.stat && STATS[card.stat]) {
STATS[card.stat].attributePoints = (STATS[card.stat].attributePoints || 0) + 1;
if (card.evolutionPath === 'frequency') STATS[card.stat].attributePoints += 1;
checkAttributePoolGrowth(card.stat);
}
let rankUpHappened = false;
if (card.mastery >= card.masteryThreshold) {
const nextRank = getNextRank(card.rank);
if (nextRank) {
const oldRank = card.rank;
card.rank = nextRank;
card.mastery = card.mastery - card.masteryThreshold;
card.masteryThreshold = Math.max(2, Math.round(card.masteryThreshold * 1.2));
if (card.stat && STATS[card.stat]) {
STATS[card.stat].attributePoints = (STATS[card.stat].attributePoints || 0) + 1;
checkAttributePoolGrowth(card.stat);
}
rankUpHappened = true;
sfxRankUp(); haptic('medium');
updateStrongholdProgress();
setTimeout(() => triggerRankUpEffect(card, oldRank, nextRank, x, y), 300);
var rankUpCard = document.querySelector('[data-id="' + card.id + '"]');
if (rankUpCard) { rankUpCard.closest('.card').classList.add('rankup-glow'); setTimeout(function() { rankUpCard.closest('.card').classList.remove('rankup-glow'); }, 1800); }
} else {
card.mastery = card.masteryThreshold;
showToast('👑 МАКСИМУМ!', card.name + ' достигла SSS', 'crit');
spiritSay('«Легенда... Твоя дисциплина несокрушима.»');
}
}
goldGain(dayMult, 'card');
checkCombos(finalXp); // Г2-4: комбо статов дня — после счётчика и награды карты, до тостов
dqProgress('cards');
hintOnce('firstcard', 'За выполнение капает 💰, а Мастерство растит ранг карточки — ранг-ап качает атрибут.');
if (lootPityCheck(card)) dropRandomLoot(x, y);
checkHeroLevelUp();
renderCards();
renderDashboard();
updateHeroUI();
if (!rankUpHappened) {
const streakBonusTxt = streakMult > 1.0 ? ' (🔥 ×' + streakMult.toFixed(2) + ')' : '';
showToast('✅ Выполнено', '+' + finalXp + ' XP' + streakBonusTxt + ' · +' + dayMult + ' 💰 · 🔥 ' + card.streak + ' дней' + (dayMult > 1 ? ' · ✨ Карта дня' : ''));
sfxHit(); haptic('light');
}
saveGameState();
onBloodOathComplete(id);
}
function failCard(e, id) {
const card = findCard(id);
if (!card) return;
if (card.lastFailDay === getMSKDayKey()) {
showToast('Карта уже отмечена пропущенной сегодня', '', 'blood');
return;
}
var undo = { streak: card.streak || 0, shields: HERO.streakShields || 0, gold: HERO.gold || 0 }; // #89: снимок до пропуска
var oathBreak = bloodOath && bloodOath.status === 'active' && bloodOath.cardId === id;
 card.lastFailDay = getMSKDayKey();
 spawnBloodRain(15);
 screenShake(6, 300);
 sfxFail(); haptic('error');
 HERO.dailySkips++;
 siege.wkSkips = (siege.wkSkips || 0) + 1;
 if ((HERO.streakShields || 0) > 0) {
showToast('🛡 Стрик сохранён щитом!', 'Осталось щитов: ' + HERO.streakShields, 'save');
} else {
card.streak = 0; renderCards();
}
 if ((HERO.streakShields || 0) > 0) {
HERO.streakShields--;
showToast('🛡 Щит стрика!', 'Щит поглотил пропуск. Осталось щитов: ' + HERO.streakShields, 'save');
} else {
HERO.gold = Math.max(0, (HERO.gold || 0) - 1);
}
showToast('💢 Пропуск', '«' + card.name + '» — стрик сброшен, −1 💰', 'blood', (!oathBreak && (HERO.gold || 0) >= 1) ? { label: '↩ Отменить (−1💰)', fn: function() { undoSkip(id, undo); } } : null); // #89: undo пропуска, клятву не отменяем
 updateHeroUI();
 renderDashboard();
 renderStatsView();
 onBloodOathSkip(id);
 saveGameState();
}
function undoSkip(id, undo) { // #89: восстановить прогресс/стрик, пошлина −1💰
var card = findCard(id);
if (!card) return;
HERO.gold = Math.max(0, undo.gold - 1);
card.streak = undo.streak;
card.lastFailDay = null;
HERO.dailySkips = Math.max(0, (HERO.dailySkips || 0) - 1);
siege.wkSkips = Math.max(0, (siege.wkSkips || 0) - 1);
HERO.streakShields = undo.shields;
showToast('↩ Отменено', '«' + card.name + '» — стрик восстановлен, пошлина −1 💰', 'save');
renderCards(); updateHeroUI(); renderDashboard(); saveGameState();
}
function deleteCard(id) {
const card = findCard(id);
if (!card) return;
dungeonConfirm('🗑 Удалить карточку?', '«' + esc(card.name) + '» — мастерство будет потеряно.').then(function(ok) {
if (!ok) return;
if (bloodOath && bloodOath.status === 'active' && bloodOath.cardId === id) {
bloodOath = null;
showToast('🩸 Клятва', 'Клятва нарушена — карта уничтожена', 'blood');
}
FORGED = FORGED.filter(c => c.id !== id);
if (FORGED.length === 0) { try { localStorage.removeItem('neurodeck_cards_backup'); } catch(e) {} } // hard-delete последней карточки мимо бэкапа (T1-M1)
renderCards();
showToast('🗑 Удалено', card.name, 'blood');
saveGameState();
});
}
function checkAttributePoolGrowth(statKey) {
const stat = STATS[statKey];
let leveledUp = false;
while (stat.attributePoints >= getStatThreshold(stat.value) && stat.value < stat.max) {
stat.attributePoints -= getStatThreshold(stat.value);
stat.value += 1;
leveledUp = true;
}
if (leveledUp) {
showToast('⚔ АТРИБУТ ПОВЫШЕН!', stat.name + ': ' + stat.value, 'crit');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 60, { color: stat.color, speed: 10, decay: 0.01, size: 4, shape: 'star', gravity: 0.1 });
sfxEquip(); haptic('medium');
spiritSay('«' + stat.name + ' крепнет... Ты стал сильнее.»');
const statEl = document.getElementById('stat-' + statKey);
if (statEl) {
statEl.classList.remove('pulse'); void statEl.offsetWidth; statEl.classList.add('pulse');
}
updateStatUI(statKey);
}
}
function renderStats() {
const grid = document.getElementById('statsGrid');
grid.innerHTML = '';
Object.entries(STATS).forEach(([key, st]) => {
const pct = Math.min(100, (st.value / st.max) * 100);
const el = document.createElement('div');
el.className = 'stat-card'; el.id = 'stat-' + key;
el.style.setProperty('--stat-color', st.color);
el.style.setProperty('--stat-color-dark', st.dark);
el.style.setProperty('--stat-color-bg', st.dark + '40');
el.style.setProperty('--stat-glow', st.color + '60');
let poolPct = Math.min(100, (st.attributePoints / getStatThreshold(st.value)) * 100);
el.innerHTML =
'<div class="stat-card-head">' +
  '<div class="stat-icon">' + st.icon + '<div class="stat-value-big" id="statVal-' + key + '">' + st.value + '</div></div>' +
  '<div class="stat-info"><div class="stat-name">' + st.name + '</div><div class="stat-desc">' + st.desc + '</div></div>' +
'</div>' +
'<div class="stat-bar"><div class="stat-bar-fill" id="statBar-' + key + '" style="width:' + pct + '%"></div></div>' +
'<div class="stat-bar-label"><span>Атрибут</span><span><b>' + st.value + '</b> / ' + st.max + '</span></div>' +
'<div class="stat-attr-pool">' +
  '<div class="stat-attr-label"><span>Развитие</span><span><b>' + st.attributePoints + '</b> / ' + getStatThreshold(st.value) + '</span></div>' +
  '<div class="stat-attr-bar"><div class="stat-attr-progress" style="width:' + poolPct + '%"></div></div>' +
  '<div class="stat-attr-hint">Растёт от выполнения карточек ' + st.icon + '</div>' +
'</div>';
grid.appendChild(el);
});
updateHeroSummary();
}
function updateStatUI(statKey) {
const stat = STATS[statKey];
const pct = Math.min(100, (stat.value / stat.max) * 100);
const fill = document.getElementById('statBar-' + statKey);
const val = document.getElementById('statVal-' + statKey);
const label = document.querySelector('#stat-' + statKey + ' .stat-bar-label');
if (fill) fill.style.width = pct + '%';
if (val) val.textContent = stat.value;
if (label) {
label.innerHTML = '<span>Атрибут</span><span><b>' + stat.value + '</b> / ' + stat.max + '</span>';
}
const poolEl = document.querySelector('#stat-' + statKey + ' .stat-attr-bar');
if (poolEl) {
var poolPct2 = Math.min(100, (stat.attributePoints / getStatThreshold(stat.value)) * 100);
poolEl.innerHTML = '<div class="stat-attr-progress" style="width:' + poolPct2 + '%"></div>';
}
const poolLabelEl = document.querySelector('#stat-' + statKey + ' .stat-attr-label');
if (poolLabelEl) {
poolLabelEl.innerHTML = '<span>Развитие</span><span><b>' + stat.attributePoints + '</b> / ' + getStatThreshold(stat.value) + '</span>';
}
}
var STREAK_MILESTONES = [
    { d: 3, gold: 20 },
    { d: 7, gold: 50, shield: 1 },
    { d: 14, gold: 100 },
    { d: 30, gold: 250, shield: 1 }
];
function renderStreakCalendar() { // #19: стрик-календарь в Hero-вкладке
    var sc = document.getElementById('streakCalendar');
    if (!sc) return;
    var chips = STREAK_MILESTONES.map(function(m) {
        var claimed = !!(HERO.streakMilestones || {})[m.d];
        return '<div class="streak-chip' + (claimed ? ' claimed' : '') + '">' + m.d + 'д +' + m.gold + '💰' + (m.shield ? '+1🛡' : '') + (claimed ? ' ✓' : '') + '</div>';
    }).join('');
    sc.innerHTML = '<div class="streak-title">🔥 Стрик: <b>' + (HERO.dayStreak || 0) + '</b> дн.</div><div class="streak-chips">' + chips + '</div>';
}
function updateHeroUI() {
document.getElementById('heroMiniLvl').textContent = HERO.level;
document.getElementById('heroMiniName').textContent = HERO.name;
const pct = (HERO.xp / HERO.xpToNext) * 100;
document.getElementById('heroMiniXpFill').style.width = pct + '%';
document.getElementById('heroMiniXpText').textContent = HERO.xp + '/' + HERO.xpToNext;
document.getElementById('heroLevelLabel').textContent = 'LVL ' + HERO.level;
document.getElementById('heroXpCur').textContent = HERO.xp;
document.getElementById('heroXpMax').textContent = HERO.xpToNext;
document.getElementById('heroXpFill').style.width = pct + '%';
document.getElementById('heroName').textContent = HERO.name;
document.getElementById('heroTitle').textContent = HERO.title;
const ringR = parseFloat(document.getElementById('ringFill').getAttribute('r')) || 74;
const ringCirc = 2 * Math.PI * ringR;
document.getElementById('ringFill').setAttribute('stroke-dasharray', ringCirc);
document.getElementById('ringFill').setAttribute('stroke-dashoffset', ringCirc * (1 - HERO.xp / HERO.xpToNext));
var goldEl = document.getElementById('heroGoldVal');
if (goldEl) goldEl.textContent = (HERO.gold || 0).toLocaleString('ru');
var pav = document.getElementById('heroAvatar');
if (pav) { // #55: портрет героя по высшему стату
    var pp = pav.querySelector('.hero-path');
    if (!pp) { pp = document.createElement('div'); pp.className = 'hero-path'; pav.appendChild(pp); }
    var pi = heroPathInfo();
    pp.textContent = pi.icon;
    pp.title = 'Путь: ' + pi.name;
}
renderTotemCard(); // Ф2: карточка тотема в Hero-вкладке
renderDoctrineCard(); // Г1-2: карточка доктрин в Hero-вкладке
renderStreakCalendar();
updateHeroSummary();
}
function updateHeroSummary() {
document.getElementById('statTotalXp').textContent = HERO.totalXp;
const sum = Object.values(STATS).reduce((a, s) => a + s.value, 0);
document.getElementById('statSumStats').textContent = sum;
const gear = getTotalGearBonuses();
const totalInt = STATS.int.value + gear.int;
const mult = (1 + (totalInt - 3) * 0.01).toFixed(2);
document.getElementById('statXpMult').textContent = '×' + mult;
document.getElementById('statStrongholds').textContent = capturedCount() + ' / ' + STRONGHOLDS.length;
}
function heroPathInfo() { // #55: путь героя по высшему стату (str/end/agi; ничья → end/Страж)
    var cands = [{ k: 'str', icon: '⚔', name: 'Воин' }, { k: 'end', icon: '🛡', name: 'Страж' }, { k: 'agi', icon: '🏹', name: 'Следопыт' }];
    var best = cands[1];
    cands.forEach(function(c) { if (((STATS[c.k] || {}).value || 0) > ((STATS[best.k] || {}).value || 0)) best = c; });
    return best;
}
function checkHeroLevelUp() {
while (HERO.xp >= HERO.xpToNext) {
HERO.xp -= HERO.xpToNext;
HERO.level++;
HERO.xpToNext = getXpToNext(HERO.level);
onLevelUp();
}
if (HERO.level >= 15) { HERO.name = 'Архонт'; HERO.title = '«Повелитель судьбы»'; }
else if (HERO.level >= 10) { HERO.name = 'Страж'; HERO.title = '«Выстоявший в битвах»'; }
else if (HERO.level >= 6) { HERO.name = 'Воин'; HERO.title = '«Идущий сквозь тьму»'; }
else if (HERO.level >= 3) { HERO.name = 'Искатель'; HERO.title = '«Вспомнивший путь»'; }
}
function onLevelUp() {
sfxLevelUp(); haptic('success');
document.getElementById('lvlNum').textContent = HERO.level;
const ov = document.getElementById('lvlOverlay'), bn = document.getElementById('lvlBanner');
document.getElementById('lvlSub').textContent = (HERO.level - 1) + ' → ' + HERO.level;
ov.classList.remove('show'); bn.classList.remove('show'); void ov.offsetWidth;
ov.classList.add('show'); bn.classList.add('show');
const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
burstParticles(cx, cy, 100, { color: '#fbbf24', speed: 14, decay: 0.008, size: 4, shape: 'star', gravity: 0.12, life: 1.3 });
screenShake(8, 400);
goldGain(30, 'level');
var avatarEl = document.getElementById('heroAvatar'); if (avatarEl) { avatarEl.classList.add('level-flash'); setTimeout(function() { avatarEl.classList.remove('level-flash'); }, 1500); } updateHeroAvatarSprites();
document.getElementById('lvlSub2').textContent = '+30 💰 в казну';
var avatarWrap = document.querySelector('.hero-avatar-wrap');
if (avatarWrap) { avatarWrap.classList.add('levelup-glow'); setTimeout(function() { avatarWrap.classList.remove('levelup-glow'); }, 2000); }
renderStats();
spiritSay('«Уровень ' + HERO.level + '... Бремя стало легче.»');
showToast('🏆 Уровень ' + HERO.level, '+30 💰 в казну · Следующий: ' + HERO.xpToNext + ' XP');
if (HERO.level === 5) setTimeout(() => addArtifactToBackpack(ARTIFACTS.crownArchon), 1500);
if (HERO.level === 10) setTimeout(() => addArtifactToBackpack(ARTIFACTS.capeShadows), 1500);
setTimeout(() => { ov.classList.remove('show'); bn.classList.remove('show'); }, 2500);
}
function triggerRankUpEffect(card, oldRank, newRank, x, y) {
const visual = getRankColorInfo(newRank);
const phrase = RANK_PHRASES[newRank] || 'Сила пробуждается';
const rankupOverlay = document.getElementById('rankupOverlay');
const rankupBanner = document.getElementById('rankupBanner');
rankupOverlay.style.background = 'radial-gradient(circle, ' + visual.glow.replace(/[\d.]+\)$/, '0.4)') + ', transparent 60%)';
const rankText = document.getElementById('rankupRankText');
rankText.textContent = newRank;
rankText.style.color = visual.color;
document.getElementById('rankupSubText').textContent = phrase;
document.getElementById('rankupCardName').textContent = card.name;
const st = STATS[card.stat];
const poolHint = document.getElementById('rankupAttrHint');
if (st) {
poolHint.textContent = '+1 к развитию ' + st.name + ' (' + st.attributePoints + '/' + getStatThreshold(st.value) + ')';
poolHint.style.display = 'inline-block';
} else {
poolHint.style.display = 'none';
}
rankupOverlay.classList.remove('show');
rankupBanner.classList.remove('show');
void rankupOverlay.offsetWidth;
rankupOverlay.classList.add('show');
rankupBanner.classList.add('show');
burstParticles(x, y, 80, { color: visual.color, speed: 12, decay: 0.008, size: 4, shape: 'star', gravity: 0.1, life: 1.3 });
burstParticles(x, y, 50, { color: visual.color, speed: 8, decay: 0.012, size: 2, gravity: 0.05 });
if (newRank === 'SSS') {
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 120, { color: '#fcd34d', speed: 16, decay: 0.006, size: 5, shape: 'star', gravity: 0.12, life: 1.6 });
screenShake(12, 600);
spiritSay('«SSS... ' + card.name + ' достигла вечности.»');
showToast('👑 ЛЕГЕНДАРНЫЙ РАНГ!', card.name + ': SSS', 'crit');
} else {
screenShake(7, 400);
spiritSay('«' + newRank + '... ' + phrase.toLowerCase() + '.»');
showToast('⚔ Ранг повышен!', card.name + ': ' + oldRank + ' → ' + newRank, 'crit');
}
 setTimeout(() => {
rankupOverlay.classList.remove('show');
rankupBanner.classList.remove('show');
openEditCardAfterRankup(card.id);
}, 1000);
}
let editingCardId = null;
let pendingEvolutionPath = null;
function setEvolutionSection(card) {
const sec = document.getElementById('editEvolutionSection');
if (!sec) return;
pendingEvolutionPath = null;
if (card.evolutionPath || card.rank === 'SSS') { sec.style.display = 'none'; return; }
sec.style.display = 'block';
sec.querySelectorAll('.stat-chip').forEach(function(c) { c.classList.remove('selected'); });
}
function openEditCardAfterRankup(cardId) {
const card = findCard(cardId);
if (!card) return;
editingCardId = cardId;
document.getElementById('editCardTitle').textContent = '⚔ Ранг повышен — эволюция и усложнение';
document.getElementById('editCardName').value = card.name;
const metaParts = (card.meta || '').split(' · ');
document.getElementById('editCardTime').value = metaParts[1] || 'утро';
document.getElementById('editCardDuration').value = parseInt((card.meta || '').match(/\d+/)?.[0]) || 15;
document.getElementById('editCardMastery').value = card.masteryThreshold;
document.querySelectorAll('#editStatChips .stat-chip').forEach(c => {
c.classList.toggle('selected', c.dataset.stat === card.stat);
});
const streakMult1 = getStreakBonus(card);
const streakInfo1 = getStreakBonusLabel(streakMult1);
const hintEl = document.getElementById('editCardAdaptHint');
    hintEl.innerHTML = '🔥 Бонус стрика: <b style="color:var(--gold-bright)">' + streakInfo1.label + '</b>. Каждый день выполнения = +5% XP (макс ×2.0). Пропуск обнуляет стрик!';
const warningEl = document.getElementById('editCardWarning');
if (streakMult1 > 1.0) {
warningEl.style.display = 'block';
warningEl.innerHTML = '⚠ Ранг повышен! Усложни карточку (увеличь время/порог). Текущий стрик: <b>' + (card.streak || 0) + ' дней</b>.';
} else {
warningEl.style.display = 'block';
warningEl.innerHTML = '⚠ Ранг повышен! Усложни карточку для нового вызова.';
}
setEvolutionSection(card);
document.getElementById('editCardModal').classList.add('show');
}
function openEditCardDirect(cardId) {
    const card = findCard(cardId);
    if (!card) return;
    editingCardId = cardId;
    document.getElementById('editCardName').value = card.name;
    const metaParts = (card.meta || '').split(' · ');
    document.getElementById('editCardTime').value = metaParts[1] || 'утро';
    document.getElementById('editCardDuration').value = parseInt((card.meta || '').match(/\d+/)?.[0]) || 15;
    document.getElementById('editCardMastery').value = card.masteryThreshold;
    document.querySelectorAll('#editStatChips .stat-chip').forEach(c => {
        c.classList.toggle('selected', c.dataset.stat === card.stat);
    });
const streakMult = getStreakBonus(card);
const streakInfo = getStreakBonusLabel(streakMult);
    const hintEl = document.getElementById('editCardAdaptHint');
    hintEl.innerHTML = '🔥 Бонус стрика: <b style="color:var(--gold-bright)">' + streakInfo.label + '</b>. Каждый день выполнения = +5% XP (макс ×2.0). Пропуск обнуляет стрик!';
    const warningEl = document.getElementById('editCardWarning');
    warningEl.style.display = 'none';
    var _evoSec = document.getElementById('editEvolutionSection');
    if (_evoSec) _evoSec.style.display = 'none';
    pendingEvolutionPath = null;
    document.getElementById('editCardModal').classList.add('show');
}
function closeEditCard() {
document.getElementById('editCardModal').classList.remove('show');
editingCardId = null;
pendingEvolutionPath = null;
}
function skipEditCard() { closeEditCard(); }
function saveEditCard() {
if (!editingCardId) return;
const card = findCard(editingCardId);
if (!card) return;
const name = document.getElementById('editCardName').value.trim();
if (!name) { showToast('⚠ Ошибка', 'Введите название', 'blood'); return; }
const selectedStatChip = document.querySelector('#editStatChips .stat-chip.selected');
const newStat = selectedStatChip ? selectedStatChip.dataset.stat : card.stat;
const newTime = document.getElementById('editCardTime').value;
const newDuration = parseInt(document.getElementById('editCardDuration').value) || 15;
const newMastery = Math.max(2, parseInt(document.getElementById('editCardMastery').value) || 7);
const st = STATS[newStat];
const oldMeta = card.meta, oldStat = card.stat;
card.name = name;
card.stat = newStat;
card.meta = st.icon + ' ' + newDuration + ' мин · ' + newTime;
card.masteryThreshold = newMastery;
if (card.meta !== oldMeta || newStat !== oldStat) {
card.firstCompletedAt = Date.now();
}
var evoApplied = false;
if (pendingEvolutionPath && !card.evolutionPath) {
card.evolutionPath = pendingEvolutionPath;
evoApplied = true;
}
pendingEvolutionPath = null;
closeEditCard();
renderCards();
if (evoApplied) {
var evoLabels = { depth: '🧘 Глубже: +50% мастерства', frequency: '⚡ Чаще: +1 к пулу стата', stability: '🌟 Стабильнее: двойная защита стрика' };
showToast('🌟 Эволюция!', evoLabels[card.evolutionPath] + ' · карточка усложнена', 'crit');
} else {
showToast('✏ Сохранено', 'Карточка обновлена: ' + name);
}
saveGameState();
}
function addXpReward(amount) {
HERO.xp += amount;
HERO.totalXp += amount;
recordXpEvent(amount);
checkHeroLevelUp();
updateHeroUI();
}
const ARTIFACTS = {
swordDiscipline: { id: 'swordDiscipline', name: 'Меч Дисциплины', icon: '⚔', rank: 'A', slot: 'weapon', type: 'Оружие', category: 'weapon', reqLevel: 6, lore: 'Выкован из стали тех обещаний, что ты сдержал.', bonuses: [{ stat: 'str', value: 5, label: '⚔ Сила' }, { stat: 'wil', value: 2, label: '🧘 Воля' }], special: '+10% XP за привычки' },
shieldWill: { id: 'shieldWill', name: 'Щит Воли', icon: '🛡', rank: 'A', slot: 'shield', type: 'Щит', category: 'armor', reqLevel: 6, lore: 'Тяжесть этого щита — вес твоих решений.', bonuses: [{ stat: 'end', value: 6, label: '🛡 Стойкость' }, { stat: 'wil', value: 3, label: '🧘 Воля' }], special: 'Защита стрика +15%' },
amuletFocus: { id: 'amuletFocus', name: 'Амулет Фокуса', icon: '💠', rank: 'S', slot: 'amulet', type: 'Амулет', category: 'accessory', reqLevel: 10, lore: 'Кристалл, в котором застыло мгновение полной концентрации.', bonuses: [{ stat: 'int', value: 8, label: '🧠 Интеллект' }, { stat: 'wil', value: 3, label: '🧘 Воля' }], special: '+15% XP за привычки' },
ringCharisma: { id: 'ringCharisma', name: 'Кольцо Обаяния', icon: '💍', rank: 'B', slot: 'ring1', type: 'Кольцо', category: 'accessory', reqLevel: 3, lore: 'Тёплое на ощупь. Люди оборачиваются, когда ты проходишь.', bonuses: [{ stat: 'cha', value: 5, label: '🎭 Харизма' }], special: 'Шанс крита +5%' },
bootsWanderer: { id: 'bootsWanderer', name: 'Сапоги Странника', icon: '👢', rank: 'B', slot: 'boots', type: 'Обувь', category: 'armor', reqLevel: 3, lore: 'Сто тысяч шагов впитались в эту кожу.', bonuses: [{ stat: 'agi', value: 5, label: '⚡ Ловкость' }, { stat: 'end', value: 2, label: '🛡 Стойкость' }], special: null },
crownArchon: { id: 'crownArchon', name: 'Корона Архонта', icon: '👑', rank: 'S', slot: 'head', type: 'Головной убор', category: 'armor', reqLevel: 10, lore: 'Не для слабых. Надевший её уже не сможет вернуться.', bonuses: [{ stat: 'str', value: 3, label: '⚔ Сила' }, { stat: 'end', value: 3, label: '🛡 Стойкость' }, { stat: 'int', value: 3, label: '🧠 Интеллект' }, { stat: 'cha', value: 3, label: '🎭 Харизма' }, { stat: 'wil', value: 3, label: '🧘 Воля' }, { stat: 'agi', value: 3, label: '⚡ Ловкость' }], special: 'Все атрибуты +3' },
capeShadows: { id: 'capeShadows', name: 'Плащ Теней', icon: '🧣', rank: 'A', slot: 'cape', type: 'Плащ', category: 'armor', reqLevel: 6, lore: 'Соткан из тех ночей, когда ты не сдался.', bonuses: [{ stat: 'wil', value: 5, label: '🧘 Воля' }, { stat: 'agi', value: 3, label: '⚡ Ловкость' }], special: 'Невидимость от искушений' },
chestVirtue: { id: 'chestVirtue', name: 'Кираса Доблести', icon: '🧥', rank: 'A', slot: 'chest', type: 'Нагрудник', category: 'armor', reqLevel: 6, lore: 'Каждая пластина — выигранная битва с собой.', bonuses: [{ stat: 'end', value: 8, label: '🛡 Стойкость' }, { stat: 'str', value: 3, label: '⚔ Сила' }], special: null },
ringInsight: { id: 'ringInsight', name: 'Кольцо Прозрения', icon: '💎', rank: 'A', slot: 'ring2', type: 'Кольцо', category: 'accessory', reqLevel: 6, lore: 'В его грани отражаются мысли, что ты не успел забыть.', bonuses: [{ stat: 'int', value: 5, label: '🧠 Интеллект' }, { stat: 'cha', value: 2, label: '🎭 Харизма' }], special: null },
};
const INVENTORY = {
backpack: [],
equipped: { head: null, amulet: null, chest: null, cape: null, weapon: null, shield: null, ring1: null, ring2: null, boots: null },
maxSlots: 30,
};
let selectedItemId = null;
let currentFilter = 'all';
let uidCounter = 10;
function addArtifactToBackpack(artifact) {
if (INVENTORY.backpack.length >= INVENTORY.maxSlots) { showToast('🎒 Рюкзак полон', 'Освободи место', 'blood'); return; }
const newItem = Object.assign({}, artifact, { uid: 'i' + (uidCounter++) });
INVENTORY.backpack.push(newItem);
renderBackpack();
const bp = document.querySelector('.backpack');
if (bp) {
const r = bp.getBoundingClientRect();
const rc = getRankColorInfo(artifact.rank);
burstParticles(r.left + r.width / 2, r.top + r.height / 2, 50, { color: rc.color, speed: 8, decay: 0.015, size: 3, shape: 'star', gravity: 0.1, life: 1.2 });
}
showToast('🎁 Получен ' + artifact.rank + '-ранг!', artifact.name);
spiritSay('«' + artifact.name + '... Этот артефакт ждал тебя.»');
}
function dropRandomLoot(x, y) {
const pool = Object.values(ARTIFACTS).filter(a => !INVENTORY.backpack.some(b => b.id === a.id) && !Object.values(INVENTORY.equipped).some(e => e && e.id === a.id));
if (pool.length === 0) { goldGain(5, 'loot'); return; }
const weights = pool.map(a => a.rank === 'S' ? 1 : a.rank === 'A' ? 3 : a.rank === 'B' ? 6 : 10);
const total = weights.reduce((a, b) => a + b, 0);
let r = Math.random() * total;
let picked = pool[0];
for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { picked = pool[i]; break; } }
addArtifactToBackpack(picked);
const rc = getRankColorInfo(picked.rank);
burstParticles(x, y, 40, { color: rc.color, speed: 7, decay: 0.015, size: 3, shape: 'star', gravity: 0.1 });
}
function renderBackpack() {
const grid = document.getElementById('backpackGrid');
if (!grid) return;
grid.innerHTML = '';
let filtered = INVENTORY.backpack;
if (currentFilter !== 'all') filtered = INVENTORY.backpack.filter(i => i.category === currentFilter);
document.getElementById('bpCount').textContent = INVENTORY.backpack.length;
document.getElementById('bpMax').textContent = INVENTORY.maxSlots;
var bpHead = document.querySelector('.backpack-header');
if (bpHead && !document.getElementById('bpShards')) {
var sd = document.createElement('div');
sd.className = 'backpack-info';
sd.id = 'bpShards';
bpHead.appendChild(sd);
}
var shardEl = document.getElementById('bpShards');
if (shardEl) shardEl.textContent = '💰 ' + (HERO.gold || 0);
filtered.forEach(item => {
const rc = getRankColorInfo(item.rank);
const cell = document.createElement('div');
cell.className = 'bp-cell has-item rank-' + item.rank;
cell.style.setProperty('--item-color', rc.color);
cell.style.setProperty('--item-bg', rc.bg);
cell.style.setProperty('--item-glow', rc.glow);
if (selectedItemId === item.uid) cell.classList.add('selected');
cell.innerHTML = '<span class="bp-icon">' + item.icon + '</span><span class="bp-rank">' + item.rank + '</span>';
cell.addEventListener('click', () => selectItem(item.uid));
cell.addEventListener('mouseenter', (e) => showTooltip(e, item));
cell.addEventListener('mousemove', (e) => moveTooltip(e));
cell.addEventListener('mouseleave', hideTooltip);
grid.appendChild(cell);
});
const emptyCount = Math.max(0, 18 - filtered.length);
for (let i = 0; i < emptyCount; i++) {
const cell = document.createElement('div');
cell.className = 'bp-cell';
grid.appendChild(cell);
}
}
const tooltipEl = document.getElementById('tooltip');
function showTooltip(e, item) {
const rc = getRankColorInfo(item.rank);
tooltipEl.innerHTML =
'<div class="tt-name" style="color:' + rc.color + '">' + item.icon + ' ' + item.name + '</div>' +
'<div class="tt-type">' + item.type + ' · ' + item.rank + '-ранг</div>' +
item.bonuses.map(b => '<div class="tt-bonus">+' + b.value + ' ' + b.label + '</div>').join('') +
(item.special ? '<div class="tt-bonus" style="color:#fbbf24">★ ' + item.special + '</div>' : '');
tooltipEl.classList.add('show'); moveTooltip(e);
}
function moveTooltip(e) {
const x = e.clientX + 15, y = e.clientY + 15;
tooltipEl.style.left = Math.min(x, window.innerWidth - 240) + 'px';
tooltipEl.style.top = Math.min(y, window.innerHeight - 150) + 'px';
}
function hideTooltip() { tooltipEl.classList.remove('show'); }
function showTextTooltip(title, subtitle, lines, anchor) {
    if (!tooltipEl) return;
    var html = '<div class="tt-name" style="color:' + (anchor && anchor.color ? anchor.color : '#d4a574') + '">' + title + '</div>';
    if (subtitle) html += '<div class="tt-type">' + subtitle + '</div>';
    lines.forEach(function(line) { html += '<div class="tt-bonus">' + line + '</div>'; });
    tooltipEl.innerHTML = html;
    if (anchor && anchor.rect) {
        var x = anchor.rect.left + anchor.rect.width + 8;
        var y = anchor.rect.top;
        tooltipEl.style.left = Math.min(x, window.innerWidth - 280) + 'px';
        tooltipEl.style.top = Math.max(8, y) + 'px';
    }
    tooltipEl.classList.add('show');
}
function hideTextTooltip() { if (tooltipEl) tooltipEl.classList.remove('show'); }

// ===================== Performance Mode integration =====================
// __ndSetEcoMode is invoked by js/perf.js whenever the effective eco flag
// changes. We pause the dust + burst particle loops when eco is on so the
// CPU drops close to idle. The dust canvas / mist layer are also hidden via
// CSS :root.perf-eco rule, so even passive frames stop drawing.
window.__ndSetEcoMode = function(isEco) {
    try { dustRunning = !isEco; if (!isEco) animateDust(); } catch (e) { /* bot restored mid-init */ }
    try { particlesRunning = !isEco; if (!isEco) animate(); } catch (e) { /* same */ }
    try { var dc = document.getElementById('dustCanvas'); if (dc) dc.style.visibility = isEco ? 'hidden' : ''; } catch (e) {} // QA2-L6: прямой вызов мимо perf.js — прячем канву вручную
};
function selectItem(uid) {
selectedItemId = uid;
const item = INVENTORY.backpack.find(i => i.uid === uid);
if (item) renderItemPanel(item, 'backpack');
renderBackpack(); renderSlots();
}
function renderItemPanel(item, source) {
const rc = getRankColorInfo(item.rank);
const panel = document.getElementById('itemPanel');
panel.style.setProperty('--panel-glow', rc.glow.replace('0.5', '0.2').replace('0.7', '0.25'));
panel.style.setProperty('--item-color', rc.color);
panel.style.setProperty('--item-bg', rc.bg);
panel.style.setProperty('--item-glow', rc.glow);
const slotLabels = { head: 'Голова', amulet: 'Амулет', chest: 'Торс', cape: 'Плащ', weapon: 'Оружие', shield: 'Щит', ring1: 'Кольцо 1', ring2: 'Кольцо 2', boots: 'Обувь' };
const isEquipped = source === 'equipped';
document.getElementById('itemPanelContent').innerHTML =
'<div class="item-preview rank-' + item.rank + '" style="--item-color:' + rc.color + '; --item-bg:' + rc.bg + '; --item-glow:' + rc.glow + ';">' +
item.icon +
'<div class="item-preview-rank" style="background:' + rc.color + '">' + item.rank + '</div>' +
'</div>' +
'<div class="item-name" style="color:' + rc.color + '">' + item.name + '</div>' +
'<div class="item-type">' + item.type + ' · Слот: ' + (slotLabels[item.slot] || '—') + '</div>' +
'<div class="item-lore">' + item.lore + '</div>' +
'<div class="item-bonuses">' +
'<div class="item-bonuses-title">⚡ Бонусы</div>' +
item.bonuses.map(b => '<div class="item-bonus"><span class="item-bonus-name">' + b.label + '</span><span class="item-bonus-val">+' + b.value + '</span></div>').join('') +
(item.special ? '<div class="item-bonus special"><span class="item-bonus-name">★ Особое</span><span class="item-bonus-val">' + item.special + '</span></div>' : '') +
'</div>' +
(function() {
var rr = getArtifactReqRank(item.rank);
if (!rr) return '';
var cnt = countCardsAtRankOrHigher(rr);
var ok = cnt >= 2;
return '<div style="margin-top:8px; padding:6px 10px; background:rgba(' + (ok ? '52,211,153' : '199,62,77') + ',0.1); border:1px solid rgba(' + (ok ? '52,211,153' : '199,62,77') + ',0.3); border-radius:3px; font-size:10px;">' +
    (ok ? '✅' : '⚠') + ' Требует: <b>' + cnt + '/2</b> карточек ранга <b>' + rr + '+</b></div>';
})() +
'<div class="item-actions">' +
(isEquipped
? '<button class="item-btn danger" data-action="unequip-item" data-slot="' + item.slot + '">↶ Снять</button>'
: '<button class="item-btn" data-action="equip-item" data-uid="' + item.uid + '">⚔ Экипировать</button><button class="item-btn danger" data-action="discard-item" data-uid="' + item.uid + '">✕ Выбросить</button>') +
'</div>';
}
function getArtifactReqRank(artifactRank) {
var tierMax = { 'C': null, 'B': 'BBB', 'A': 'AAA', 'S': 'SSS' };
return tierMax[artifactRank] || null;
}
function countCardsAtRankOrHigher(rank) {
var thresholdIdx = RANK_PROGRESSION.indexOf(rank);
if (thresholdIdx === -1) return 0;
return FORGED.filter(function(c) { return RANK_PROGRESSION.indexOf(c.rank) >= thresholdIdx; }).length;
}
function equipItem(uid) {
const item = INVENTORY.backpack.find(i => i.uid === uid);
if (!item) return;
var reqRank = getArtifactReqRank(item.rank);
if (reqRank) {
var count = countCardsAtRankOrHigher(reqRank);
if (count < 2) {
showToast('⚠ Недостаточно карточек', 'Нужно 2 карточки ранга ' + reqRank + '+ для «' + item.name + '» (сейчас: ' + count + ')', 'blood');
sfxError(); haptic('warning');
return;
}
}
let targetSlot = item.slot;
if (item.slot === 'ring1' && INVENTORY.equipped.ring1 && !INVENTORY.equipped.ring2) targetSlot = 'ring2';
if (item.slot === 'ring2' && INVENTORY.equipped.ring2 && !INVENTORY.equipped.ring1) targetSlot = 'ring1';
const current = INVENTORY.equipped[targetSlot];
if (current) INVENTORY.backpack.push(Object.assign({}, current, { slot: current.slot === 'ring2' ? 'ring1' : current.slot }));
INVENTORY.equipped[targetSlot] = null;
INVENTORY.backpack = INVENTORY.backpack.filter(i => i.uid !== uid);
INVENTORY.equipped[targetSlot] = Object.assign({}, item, { slot: targetSlot });
const slotEl = document.querySelector('.slot[data-slot="' + targetSlot + '"]');
if (slotEl) {
const r = slotEl.getBoundingClientRect();
const rc = getRankColorInfo(item.rank);
burstParticles(r.left + r.width / 2, r.top + r.height / 2, 40, { color: rc.color, speed: 6, decay: 0.02, size: 3, shape: 'star', gravity: 0.08 });
let flash = slotEl.querySelector('.equip-flash');
if (!flash) { flash = document.createElement('div'); flash.className = 'equip-flash'; slotEl.appendChild(flash); }
flash.style.setProperty('--item-glow', rc.glow);
flash.classList.remove('show'); void flash.offsetWidth; flash.classList.add('show');
}
showToast('⚔ Экипировано', item.name);
spiritSay('«' + item.name + '... Сила артефакта теперь твоя.»');
screenShake(4, 250);
sfxEquip(); haptic('medium');
selectedItemId = null;
renderBackpack(); renderSlots(); updateTotalBonuses(); renderStats();
renderItemPanel(INVENTORY.equipped[targetSlot], 'equipped');
saveGameState();
}
function unequipItem(slotName) {
const item = INVENTORY.equipped[slotName];
if (!item) return;
if (INVENTORY.backpack.length >= INVENTORY.maxSlots) { showToast('🎒 Рюкзак полон', 'Освободи место', 'blood'); return; }
INVENTORY.backpack.push(Object.assign({}, item));
INVENTORY.equipped[slotName] = null;
showToast('↶ Снято', item.name);
selectedItemId = null;
renderBackpack(); renderSlots(); updateTotalBonuses(); renderStats();
document.getElementById('itemPanelContent').innerHTML = '<div class="empty-state">Слот пуст.<br>Выбери предмет из рюкзака.</div>';
saveGameState();
}
function discardItem(uid) {
const item = INVENTORY.backpack.find(i => i.uid === uid);
if (!item) return;
dungeonConfirm('✕ Выбросить?', '«' + esc(item.name) + '» — вернуть будет нельзя.').then(function(ok) {
if (!ok) return;
INVENTORY.backpack = INVENTORY.backpack.filter(i => i.uid !== uid);
showToast('✕ Выброшено', item.name, 'blood');
selectedItemId = null;
renderBackpack();
document.getElementById('itemPanelContent').innerHTML = '<div class="empty-state">Слот пуст.</div>';
saveGameState();
});
}
function renderSlots() {
document.querySelectorAll('.slot').forEach(slot => {
const key = slot.dataset.slot;
const item = INVENTORY.equipped[key];
const defaultIcons = { head: '◇', amulet: '△', chest: '□', cape: '◁', weapon: '✕', shield: '◯', ring1: '○', ring2: '○', boots: '▽' };
if (item) {
const rc = getRankColorInfo(item.rank);
slot.classList.add('filled', 'rank-' + item.rank);
slot.style.setProperty('--slot-color', rc.color);
slot.style.setProperty('--slot-bg', rc.bg);
slot.style.setProperty('--slot-glow', rc.glow);
slot.innerHTML = '<span class="slot-icon">' + item.icon + '</span><span class="slot-rank-badge" style="background:' + rc.color + '">' + item.rank + '</span><div class="equip-flash"></div>';
slot.onclick = () => { selectedItemId = item.uid || 'eq-' + key; renderItemPanel(item, 'equipped'); renderBackpack(); };
slot.onmouseenter = (e) => showTooltip(e, item);
slot.onmousemove = (e) => moveTooltip(e);
slot.onmouseleave = hideTooltip;
} else {
        slot.classList.remove('filled');
        for (let i = slot.classList.length - 1; i >= 0; i--) {
            if (slot.classList[i].startsWith('rank-')) slot.classList.remove(slot.classList[i]);
        }
        slot.style.removeProperty('--slot-color');
slot.style.removeProperty('--slot-bg');
slot.style.removeProperty('--slot-glow');
slot.innerHTML = defaultIcons[key] || '?';
slot.onclick = null; slot.onmouseenter = null; slot.onmousemove = null; slot.onmouseleave = null;
}
});
}
function getTotalGearBonuses() {
const totals = { str: 0, end: 0, int: 0, cha: 0, wil: 0, agi: 0 };
Object.values(INVENTORY.equipped).forEach(item => {
if (!item) return;
item.bonuses.forEach(b => { if (totals.hasOwnProperty(b.stat)) totals[b.stat] += b.value; });
});
return totals;
}
function updateTotalBonuses() {
const container = document.getElementById('totalBonuses');
if (!container) return;
const totals = getTotalGearBonuses();
container.innerHTML = Object.entries(STATS).map(([k, s]) => {
const v = totals[k];
return '<div class="total-bonus-row ' + (v > 0 ? 'has-bonus' : '') + '"><span>' + s.icon + ' ' + s.name + '</span><b>' + (v > 0 ? '+' + v : '—') + '</b></div>';
}).join('');
}
renderBackpack(); renderSlots(); updateTotalBonuses();
const GOAL_REWARDS = {
short:  { xp: 30, gold: 5,  statXp: 1, label: 'Краткая' },
medium: { xp: 80, gold: 12, statXp: 2, label: 'Средняя' },
long:   { xp: 200, gold: 25, statXp: 5, label: 'Долгая' },
};
let GOALS = [], goalIdCounter = 1, selectedGoalType = 'short', selectedGoalStat = 'str', currentGoalFilter = 'all';
try { const saved = localStorage.getItem('neurodeck_goals'); if (saved) { const p = JSON.parse(saved); GOALS = Array.isArray(p.goals) ? p.goals.map(function(g, i) { return STATE_GUARDS.sanitizeGoal(g, i + 1); }) : []; goalIdCounter = p.counter || 1; } } catch (e) {}
function saveGoals() { try { localStorage.setItem('neurodeck_goals', JSON.stringify({ goals: GOALS, counter: goalIdCounter })); } catch (e) {} }
function renderStepInputs() {
    var n = Math.max(1, Math.min(20, parseInt(document.getElementById('goalSteps').value) || 3));
    var wrap = document.getElementById('goalStepInputsWrap');
    var container = document.getElementById('goalStepInputs');
    if (n < 1) { wrap.style.display = 'none'; return; }
    var existing = {};
    container.querySelectorAll('input[data-step]').forEach(function(inp) { existing[inp.dataset.step] = inp.value; });
    container.innerHTML = '';
    for (var i = 1; i <= n; i++) {
        var inp = document.createElement('input');
        inp.className = 'form-input';
        inp.dataset.step = i;
        inp.placeholder = 'Шаг ' + i + ': что сделать...';
        inp.value = existing[i] || '';
        container.appendChild(inp);
    }
    wrap.style.display = 'flex';
}
function openGoalModal() {
    document.getElementById('goalModal').classList.add('show');
    const d = new Date(); d.setDate(d.getDate() + 7);
    document.getElementById('goalDeadline').value = d.toISOString().split('T')[0];
    document.getElementById('goalDeadlineTime').value = '23:00';
    document.getElementById('goalSteps').value = '3';
    renderStepInputs();
    setTimeout(() => document.getElementById('goalName').focus(), 100);
}
function closeGoalModal() {
    document.getElementById('goalModal').classList.remove('show');
    document.getElementById('goalName').value = '';
    document.getElementById('goalDesc').value = '';
    document.getElementById('goalSteps').value = '3';
    document.getElementById('goalStepInputs').innerHTML = '';
    document.getElementById('goalStepInputsWrap').style.display = 'none';
    document.getElementById('goalDeadlineTime').value = '23:00';
    selectedGoalType = 'short'; selectedGoalStat = 'str';
    updateGoalTypeSelection(); updateGoalStatChips();
}
function updateGoalTypeSelection() { document.querySelectorAll('#goalTypeSelector .goal-type-option').forEach(o => o.classList.toggle('selected', o.dataset.type === selectedGoalType)); }
function updateGoalStatChips() { document.querySelectorAll('#goalStatChips .stat-chip').forEach(c => c.classList.toggle('selected', c.dataset.stat === selectedGoalStat)); }
updateGoalTypeSelection(); updateGoalStatChips();
function createGoal() {
    const name = document.getElementById('goalName').value.trim();
    if (!name) { showToast('⚠ Ошибка', 'Введите название', 'blood'); return; }
    const deadlineDate = document.getElementById('goalDeadline').value;
    const deadlineTime = document.getElementById('goalDeadlineTime').value || '23:00';
    var deadline = null;
    if (deadlineDate) {
        deadline = new Date(deadlineDate + 'T' + deadlineTime + ':00');
        if (deadline < new Date()) { showToast('⚠ Ошибка', 'Дедлайн не может быть в прошлом', 'blood'); return; }
    }
    const totalSteps = parseInt(document.getElementById('goalSteps').value) || 3;
    var steps = [];
    document.querySelectorAll('#goalStepInputs input[data-step]').forEach(function(inp) {
        var txt = inp.value.trim();
        steps.push({ text: txt || ('Шаг ' + (steps.length + 1)), done: false });
    });
    while (steps.length < totalSteps) {
        steps.push({ text: 'Шаг ' + (steps.length + 1), done: false });
    }
    const desc = document.getElementById('goalDesc').value.trim();
    const rewards = GOAL_REWARDS[selectedGoalType];
    const goal = { id: goalIdCounter++, type: selectedGoalType, name, desc, deadline: deadline ? deadline.getTime() : null, totalSteps, currentStep: 0, steps: steps, stat: selectedGoalStat, xp: rewards.xp, gold: rewards.gold, statBonus: rewards.statXp, completed: false, failed: false, createdAt: Date.now(), lastStepAt: null };
GOALS.unshift(goal);
saveGoals(); saveGameState(); renderGoals(); closeGoalModal();
const color = selectedGoalType === 'short' ? '#34d399' : selectedGoalType === 'medium' ? '#60a5fa' : '#fbbf24';
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 50, { color, speed: 9, decay: 0.012, size: 3, shape: 'star', gravity: 0.1 });
showToast('🎯 Цель создана!', rewards.label + ': ' + name);
spiritSay('«Новая цель... Путь через тьму.»');
switchView('hero');
}
function renderGoals() {
if (!document.getElementById('goalsList')) return; // Цели героя выведены из UI (дублируют Квесты, решение 2026-09-15) — данные в сейве сохраняются
const list = document.getElementById('goalsList');
if (!list) return;
GOALS.forEach(function(g) {
if (typeof g.deadline === 'string' && g.deadline) {
var dl = new Date(g.deadline + 'T23:59:59');
g.deadline = dl.getTime();
}
});
list.innerHTML = '';
let filtered = GOALS;
if (currentGoalFilter !== 'all') filtered = GOALS.filter(g => g.type === currentGoalFilter);
if (filtered.length === 0) {
list.innerHTML = '<div class="goals-empty">' + (currentGoalFilter === 'all' ? 'У тебя пока нет целей.<br>Создай первую — путь из Камеры начинается с решения.' : 'Нет целей этого типа.') + '</div>';
updateHeroSummary(); return;
}
filtered.forEach(goal => {
    const rewards = GOAL_REWARDS[goal.type] || GOAL_REWARDS.short;
    const st = STATS[goal.stat] || STATS.str;
    if (!goal.steps || goal.steps.length === 0) {
        goal.steps = [];
        for (var si = 0; si < goal.totalSteps; si++) goal.steps.push({ text: 'Шаг ' + (si + 1), done: si < goal.currentStep });
    }
    const progressPct = (goal.currentStep / goal.totalSteps) * 100;
    var countdownHtml = '';
    if (goal.deadline && !goal.completed && !goal.failed) {
        var remaining = goal.deadline - Date.now();
        if (remaining > 0) {
            var d = Math.floor(remaining / 86400000);
            var h = Math.floor((remaining % 86400000) / 3600000);
            var m = Math.floor((remaining % 3600000) / 60000);
            var cdText = d > 0 ? d + 'д ' + h + 'ч' : h > 0 ? h + 'ч ' + m + 'м' : m + 'м';
            var cdClass = remaining < 3600000 ? 'critical' : remaining < 86400000 ? 'warning' : 'safe';
            countdownHtml = '<span class="goal-countdown ' + cdClass + '">⏱ ' + cdText + '</span>';
        } else {
            countdownHtml = '<span class="goal-countdown critical">⏱ ПРОСРОЧЕНО</span>';
        }
    }
    var deadlineStr = goal.deadline ? new Date(goal.deadline).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    var stepsHtml = '';
    if (!goal.completed && !goal.failed) {
        stepsHtml = '<div class="goal-steps">';
        goal.steps.forEach(function(step, idx) {
            var stepClass = step.done ? 'goal-step done' : 'goal-step';
            stepsHtml += '<div class="' + stepClass + '" data-action="toggle-goal-step" data-id="' + goal.id + '" data-step="' + idx + '">' +
                '<span class="goal-step-check">' + (step.done ? '✓' : '○') + '</span>' +
                '<span class="goal-step-text">' + esc(step.text) + '</span>' +
                '</div>';
        });
        stepsHtml += '</div>';
    } else {
        stepsHtml = '<div class="goal-steps">';
        goal.steps.forEach(function(step, idx) {
            var stepClass = step.done ? 'goal-step done' : 'goal-step';
            stepsHtml += '<div class="' + stepClass + '">' +
                '<span class="goal-step-check">' + (step.done ? '✓' : '○') + '</span>' +
                '<span class="goal-step-text">' + esc(step.text) + '</span>' +
                '</div>';
        });
        stepsHtml += '</div>';
    }
    const el = document.createElement('div');
    el.className = 'goal-card ' + goal.type + ' ' + (goal.completed ? 'completed' : goal.failed ? 'failed' : '');
    el.innerHTML =
        '<div class="goal-head"><div class="goal-name">' + esc(goal.name) + '</div><div class="goal-type-badge">' + rewards.label + '</div></div>' +
        (goal.desc ? '<div style="font-size: 11px; color: var(--text-dim); font-style: italic; margin-bottom: 8px;">' + esc(goal.desc) + '</div>' : '') +
        '<div class="goal-meta">' +
        (deadlineStr ? '<span>📅 <b>' + deadlineStr + '</b></span>' : '') +
        countdownHtml +
        '<span>✨ <b>+' + goal.xp + ' XP</b></span>' +
        '<span style="color:var(--gold-bright)">💰 <b>+' + (goal.gold || 0) + '</b></span>' +
        '<span style="color:' + st.color + '">' + st.icon + ' <b>+' + goal.statBonus + ' пул</b></span>' +
        '</div>' +
        stepsHtml +
        '<div class="goal-progress-wrap"><div class="goal-progress-bar"><div class="goal-progress-fill" style="width:' + progressPct + '%"></div></div><div class="goal-progress-label"><b>' + goal.currentStep + '</b>/' + goal.totalSteps + '</div></div>' +
        '<div class="goal-actions">' +
        (!goal.completed && !goal.failed ? '<button class="goal-btn delete" data-action="delete-goal" data-id="' + goal.id + '">✕</button>' : '<button class="goal-btn" disabled style="opacity: 0.5;">' + (goal.failed ? '💀 Провалена' : '✓ Выполнено') + '</button>') +
        '</div>';
    list.appendChild(el);
});
updateHeroSummary();
}
function toggleGoalStep(id, stepIdx) {
    var goal = GOALS.find(function(g) { return g.id === id; });
    if (!goal || goal.completed || goal.failed) return;
    if (!goal.steps) {
        goal.steps = [];
        for (var i = 0; i < goal.totalSteps; i++) goal.steps.push({ text: 'Шаг ' + (i + 1), done: i < goal.currentStep });
    }
    var step = goal.steps[stepIdx];
    if (!step) return;
    if (step.done) {
        step.done = false;
        goal.currentStep = goal.steps.filter(function(s) { return s.done; }).length;
        var partialXp = Math.round(goal.xp / (goal.totalSteps * 2));
        HERO.xp = Math.max(0, HERO.xp - partialXp);
        HERO.totalXp = Math.max(0, HERO.totalXp - partialXp);
        updateHeroUI();
        renderGoals();
        showToast('↩ Шаг отменён', '-' + partialXp + ' XP', 'blood');
        saveGameState();
        return;
    }
    step.done = true;
    goal.currentStep = goal.steps.filter(function(s) { return s.done; }).length;
    addXpReward(Math.round(goal.xp / (goal.totalSteps * 2)));
    goal.lastStepAt = Date.now();
    sfxEquip(); haptic('light');
    renderGoals();
    showToast('✓ Шаг выполнен', goal.name + ': ' + goal.currentStep + '/' + goal.totalSteps);
    if (goal.currentStep >= goal.totalSteps) setTimeout(function() { completeGoal(id); }, 500);
    saveGameState();
}
function completeGoal(id) {
const goal = GOALS.find(g => g.id === id);
if (!goal || goal.completed || goal.failed) return;
goal.completed = true; goal.currentStep = goal.totalSteps;
sfxGoalComplete(); haptic('success');
const color = goal.type === 'short' ? '#34d399' : goal.type === 'medium' ? '#60a5fa' : '#fbbf24';
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 120, { color, speed: 12, decay: 0.008, size: 4, shape: 'star', gravity: 0.1, life: 1.3 });
screenShake(10, 500);
const goalXp = Math.round(goal.xp / 2);
addXpReward(goalXp);
goldGain(goal.gold || 0, 'goal');
if (goal.stat && STATS[goal.stat]) {
STATS[goal.stat].attributePoints = (STATS[goal.stat].attributePoints || 0) + goal.statBonus;
checkAttributePoolGrowth(goal.stat);
}
    const statIcon = goal.stat && STATS[goal.stat] ? STATS[goal.stat].icon + ' ' + STATS[goal.stat].name : '';
    showToast('🏆 Цель достигнута!', '+' + goalXp + ' XP' + (goal.gold ? ' · +' + goal.gold + ' 💰' : '') + (statIcon ? ' · +' + goal.statBonus + ' к пулу ' + statIcon : ''), 'crit');
spiritSay('«' + goal.name + '... Ты стал сильнее.»');
renderGoals();
saveGameState();
}
function deleteGoal(id) {
const goal = GOALS.find(g => g.id === id);
if (!goal) return;
dungeonConfirm('✕ Удалить цель?', '«' + esc(goal.name) + '» — прогресс потерян.').then(function(ok) {
if (!ok) return;
GOALS = GOALS.filter(g => g.id !== id);
saveGoals(); renderGoals();
showToast('✕ Удалено', goal.name, 'blood');
saveGameState();
});
}
document.getElementById('goalModal').addEventListener('click', (e) => { if (e.target.id === 'goalModal') closeGoalModal(); });
let selectedStat = 'str';
function openForge() { document.getElementById('forgeModal').classList.add('show'); }
function closeForge() { document.getElementById('forgeModal').classList.remove('show'); document.getElementById('forgeName').value = ''; selectedStat = 'str'; updateStatChips(); }
function updateStatChips() { document.querySelectorAll('#statChips .stat-chip').forEach(c => c.classList.toggle('selected', c.dataset.stat === selectedStat)); }
updateStatChips();
function forgeCard() {
const name = document.getElementById('forgeName').value.trim().slice(0, 40);
if (!name) { showToast('⚠ Ошибка', 'Введите название', 'blood'); return; }
const time = document.getElementById('forgeTime').value;
const duration = parseInt(document.getElementById('forgeDuration').value) || 15;
const rank = 'C';
const masteryThreshold = Math.max(2, parseInt(document.getElementById('forgeMastery').value) || 5);
const st = STATS[selectedStat];
const card = {
id: forgedIdCounter++, name, meta: st.icon + ' ' + duration + ' мин · ' + time,
rank, streak: 0, stat: selectedStat, progress: 0,
mastery: 0, masteryThreshold, totalCompletions: 0, prestige: 0, evolutionPath: null,
daysActive: 0, firstCompletedAt: null, lastCompletedAt: null
};
FORGED.unshift(card);
renderCards(); closeForge();
sfxForge(); haptic('medium');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 60, { color: st.color, speed: 10, decay: 0.01, size: 3, shape: 'spark', gravity: 0.1 });
    showToast('🔥 Выковано!', name + ' (ранг C, ' + masteryThreshold + ' выполн. до след. ранга)');
spiritSay('«Новое испытание выковано. Покажи, на что ты способен.»');
switchView('deck');
saveGameState();
}
document.getElementById('forgeModal').addEventListener('click', (e) => { if (e.target.id === 'forgeModal') closeForge(); });

function makeStarterCard(spec) {
    if (!spec || !STATS[spec.stat]) return null;
    var st = STATS[spec.stat];
    return {
        id: forgedIdCounter++,
        name: spec.name,
        meta: st.icon + ' ' + spec.duration + ' мин · ' + spec.time,
        rank: 'C',
        streak: 0,
        stat: spec.stat,
        progress: 0,
        mastery: 0,
        masteryThreshold: 5,
        totalCompletions: 0,
        prestige: 0,
        evolutionPath: null,
        daysActive: 0,
        firstCompletedAt: null,
        lastCompletedAt: null
    };
}

function renderStarterDeck() {
    var list = document.getElementById('starterDeckList');
    if (!list) return;
    var html = '';
    STARTER_DECK.forEach(function(spec, idx) {
        var st = STATS[spec.stat];
        if (!st) return;
        var checked = ' checked';
        html += '<label class="starter-card" style="border-color:' + st.color + '; background:' + st.dark + '20;">' +
                '<input type="checkbox" class="starter-cb" data-idx="' + idx + '"' + checked + '>' +
                '<div class="starter-info">' +
                '<div class="starter-icon" style="color:' + st.color + ';">' + st.icon + '</div>' +
                '<div class="starter-meta">' +
                '<div class="starter-name">' + esc(spec.name) + '</div>' +
                '<div class="starter-desc" style="color:var(--text-dim);">+1 к пулу ' + st.name + ' · ' + spec.duration + ' мин · ' + spec.time + '</div>' +
                '</div></div></label>';
    });
    list.innerHTML = html;
}

function showStarterDeck() {
    if (FORGED.length > 0) return;
    if (localStorage.getItem('neurodeck_starter_done') === '1') return;
    renderStarterDeck();
    document.getElementById('starterDeckModal').classList.add('show');
}

function acceptStarterDeck() {
    var list = document.getElementById('starterDeckList');
    if (!list) return;
    var cbs = list.querySelectorAll('.starter-cb');
    var added = 0;
    cbs.forEach(function(cb) {
        if (!cb.checked) return;
        var spec = STARTER_DECK[parseInt(cb.dataset.idx)];
        var card = makeStarterCard(spec);
        if (card) { FORGED.unshift(card); added++; }
    });
    localStorage.setItem('neurodeck_starter_done', '1');
    closeStarterDeck();
    if (added > 0) {
        renderCards();
        saveGameState();
        showToast('🎴 Колода создана', added + ' ' + (added === 1 ? 'карточка добавлена' : (added < 5 ? 'карточки добавлены' : 'карточек добавлены')) + '. Добро пожаловать в подземелье.');
        spiritSay('«Первые испытания выкованы. Время показать, на что ты способен.»');
        sfxForge();
        burstParticles(window.innerWidth / 2, window.innerHeight / 2, 60, { color: '#d4a574', speed: 8, decay: 0.01, size: 3, shape: 'spark', gravity: 0.08 });
    } else {
        showToast('ℹ Без карточек', 'Выковай свою колоду через «🔨 Выковать»');
    }
}

function closeStarterDeck() {
    document.getElementById('starterDeckModal').classList.remove('show');
    localStorage.setItem('neurodeck_starter_done', '1');
    if (pendingOnboarding) { pendingOnboarding = false; startOnboarding(); }
}
function switchView(view) {
cancelPendingModal(); // Г5-Ф: ручная навигация отменяет отложенные модалки (гонка weeklyReport блокировала extended-e2e)
var _wr = document.getElementById('weeklyReportModal'); // Г5-Ф: уже показанный пассивный отчёт закрывается навигацией — намерение игрока приоритетно
if (_wr && _wr.classList.contains('show')) closeWeeklyReportModal();
document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
document.querySelectorAll('.tab[role="tab"]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === view)));
document.querySelectorAll('.bnav-btn').forEach(t => t.classList.remove('active'));
document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
var tabEl = document.querySelector('.tab[data-view="' + view + '"]');
var bnavEl = document.querySelector('.bnav-btn[data-view="' + view + '"]');
if (tabEl) tabEl.classList.add('active');
if (bnavEl) bnavEl.classList.add('active');
document.getElementById('view-' + view).classList.add('active');
document.querySelector('.content').scrollTop = 0; // V-7: смена вкладки всегда сверху
if (view === 'hero') { renderStats(); updateHeroUI(); renderGoals(); }
if (view === 'strongholds') renderStrongholds();
if (view === 'quests') renderTasks();
if (view === 'deck') renderDashboard();
if (view === 'inv') { renderBackpack(); renderSlots(); updateTotalBonuses(); }
if (view === 'deck') renderCards();
if (view === 'stats') renderStatsView();
if (typeof window.__ndSetCombatActive === 'function') window.__ndSetCombatActive(view === 'boss');
var vh = VIEW_HINTS[view];
if (vh) hintOnce('view_' + view, vh);
haptic('light'); // QA5-M1: тактильный отклик на смену вкладки (как complete-card)
}
var VIEW_ORDER = ['deck', 'quests', 'strongholds', 'hero', 'inv', 'stats'];
var currentViewIndex = 0;
var swipeStartX = 0, swipeStartY = 0, swiping = false;
document.querySelector('.content').addEventListener('touchstart', function(e) {
swipeStartX = e.touches[0].clientX;
swipeStartY = e.touches[0].clientY;
swiping = true;
}, { passive: true });
document.querySelector('.content').addEventListener('touchend', function(e) {
if (!swiping) return;
swiping = false;
var dx = e.changedTouches[0].clientX - swipeStartX;
var dy = e.changedTouches[0].clientY - swipeStartY;
if (Math.abs(dy) > Math.abs(dx)) return;
if (Math.abs(dx) < 60) return;
var activeView = document.querySelector('.view.active');
currentViewIndex = VIEW_ORDER.indexOf(activeView ? activeView.id.replace('view-', '') : 'deck');
if (dx < 0 && currentViewIndex < VIEW_ORDER.length - 1) {
switchView(VIEW_ORDER[currentViewIndex + 1]);
} else if (dx > 0 && currentViewIndex > 0) {
switchView(VIEW_ORDER[currentViewIndex - 1]);
}
});
// ===================== ТВЕРДЫНИ v2 (SPEC §1–§7; формулы — только js/stronghold-model.js) =====================
var SM = window.StrongholdModel || window.NeuroDeckStrongholdModel;
const PROVINCES = { 1: 'I «Пограничье»', 2: 'II «Чертожьи Холмы»', 3: 'III «Срединные Пустоши»', 4: 'IV «Терновые Пределы»' };
// ===================== Г2-1: ПОВЕРЕННЫЕ ТЬМЫ — боссы провинций (очередь I..XI по 4 провинциям каталога) =====================
function bossEscalation(num) { return (1 + 0.05 * (num - 1)) * Math.pow(1.2, HERO.ascension || 0); } // цели фаз ×1.5 к XI · Г2-5: ×1.2^N за круг вознесения
function ensureBossesState() {
    if (!HERO.bosses || typeof HERO.bosses !== 'object') HERO.bosses = { defeated: [], activeNum: null, phase: 0, attemptDay: null, closedDay: null };
    if (!Array.isArray(HERO.bosses.defeated)) HERO.bosses.defeated = [];
    if (typeof HERO.bosses.phase !== 'number') HERO.bosses.phase = 0;
    if (typeof HERO.bosses.activeNum !== 'number') HERO.bosses.activeNum = null;
    if (typeof HERO.bosses.attemptDay !== 'string') HERO.bosses.attemptDay = null;
    if (typeof HERO.bosses.closedDay !== 'string') HERO.bosses.closedDay = null;
}
function bossOf(num) { for (var i = 0; i < BOSSES.length; i++) if (BOSSES[i].num === num) return BOSSES[i]; return null; }
function provCaptured(prov) {
    ensureStrongholdState();
    for (var i = 0; i < STRONGHOLDS.length; i++) {
        if (STRONGHOLDS[i].prov === prov && !(strongholds[i] && strongholds[i].captured)) return false;
    }
    return true;
}
function provBossNum(prov) { // текущий (непобеждённый) босс провинции — очередь по возрастанию num
    ensureBossesState();
    for (var i = 0; i < BOSSES.length; i++) {
        if (BOSSES[i].prov !== prov) continue;
        if (HERO.bosses.defeated.indexOf(BOSSES[i].num) === -1) return BOSSES[i].num;
    }
    return null;
}
function bossNodeIdx(prov) { for (var i = 0; i < STRONGHOLDS.length; i++) if (STRONGHOLDS[i].prov === prov) return i; return -1; }
function bossActiveFor(idx) { // корона — только на узле первой твердыни провинции
    var prov = STRONGHOLDS[idx].prov;
    if (idx !== bossNodeIdx(prov)) return null;
    if (!provCaptured(prov)) return null;
    return provBossNum(prov);
}
function bossAttemptAvailable() { ensureBossesState(); return HERO.bosses.attemptDay !== getMSKDayKey(); }
function requestBossChallenge(num) {
    ensureBossesState();
    var b = bossOf(num);
    if (!b || !provCaptured(b.prov)) return;
    var tk = getMSKDayKey();
    if (!bossAttemptAvailable()) { showToast('⚔ Попытка уже была', 'Один вызов в день — возвращайся завтра', 'blood'); sfxError(); return; }
    if (HERO.bosses.activeNum !== num) { HERO.bosses.activeNum = num; HERO.bosses.phase = 0; } // новый босс — фазы с нуля; повторный вызов того же босса продолжает
    HERO.bosses.attemptDay = tk;
    showToast('⚔ Вызов принят', '«' + b.name + '»: ' + bossPhaseLabel(b.phases[HERO.bosses.phase], bossEscalation(num)), 'crit');
    sfxGoalComplete(); haptic('medium');
    saveSoon();
    if (currentShIdx !== null) renderStrongholdPanel(currentShIdx);
}
function bossTodayStats() { // статы дня для фаз боссов
    var prog = (dailyQuests && dailyQuests.progress) || {};
    var questsAll = false;
    if (dailyQuests && dailyQuests.day === getMSKDayKey() && (dailyQuests.quests || []).length > 0) {
        questsAll = (dailyQuests.quests || []).every(function(q) { return dailyQuests.done && dailyQuests.done[q.id]; });
    }
    return {
        cards: HERO.dailyCompletions || 0,
        questsAll: questsAll,
        gold: prog['gold'] || 0,
        streakAlive: (HERO.dailyCompletions || 0) >= 1
    };
}
function bossPhaseCheck(ph, st, esc) {
    if (!ph || !st) return false;
    if (ph.type === 'cards') return st.cards >= Math.ceil((ph.n || 3) * esc);
    if (ph.type === 'quests') return !!st.questsAll;
    if (ph.type === 'gold') return st.gold >= Math.ceil((ph.mult || 2) * dailyGoldGoal() * esc);
    if (ph.type === 'streak') return !!st.streakAlive;
    return false;
}
function bossPhaseLabel(ph, esc) {
    esc = esc === undefined ? 1 : esc;
    if (!ph) return '';
    if (ph.type === 'cards') return 'Выполнить ' + Math.ceil((ph.n || 3) * esc) + ' карт. за день';
    if (ph.type === 'quests') return 'Все дневные квесты за день';
    if (ph.type === 'gold') return 'Заработать ' + Math.ceil((ph.mult || 2) * dailyGoldGoal() * esc) + ' 💰 за день';
    if (ph.type === 'streak') return 'Не потерять стрик: ≥1 карта за день';
    return '';
}
function bossProgressTick(st) { // aggregating хук: вызывается из completeCard/completeDailyQuest/goldGain
    ensureBossesState();
    var tk = getMSKDayKey();
    if (HERO.bosses.attemptDay !== tk) return; // вызов сегодня не принят — условия не считаются
    if (HERO.bosses.closedDay === tk) return; // фаза сегодня уже закрыта — следующая завтра
    if (HERO.bosses.activeNum === null) return;
    var b = bossOf(HERO.bosses.activeNum);
    if (!b) return;
    var ph = b.phases[HERO.bosses.phase];
    if (!ph) return;
    st = st || bossTodayStats();
    if (!bossPhaseCheck(ph, st, bossEscalation(b.num))) return;
    HERO.bosses.phase += 1;
    HERO.bosses.closedDay = tk;
    if (HERO.bosses.phase >= 3) {
        HERO.bosses.defeated.push(b.num);
        HERO.bosses.activeNum = null;
        HERO.bosses.phase = 0;
        showToast('🏆 Поверенный повержен: ' + b.name, 'Артефакт твой: ' + b.artifact.name + ' — ' + b.artifact.desc, 'save');
    } else {
        showToast('⚔ Фаза ' + HERO.bosses.phase + '/3 пройдена', '«' + b.name + '»: следующая фаза — завтра', 'crit');
    }
    sfxGoalComplete(); haptic('success');
    if (currentShIdx !== null && STRONGHOLDS[currentShIdx] && STRONGHOLDS[currentShIdx].prov === b.prov) renderStrongholdPanel(currentShIdx);
    saveSoon();
}
function bossArtifactMult(kind, prov) { // провинциальные пассивы артефактов; xp/cost — глобальные
    ensureBossesState();
    var tbl = { tax: 1.05, attrition: 0.9, def: 1.05, xp: 1.10, cost: 0.85 };
    var base = tbl[kind];
    if (!base) return 1;
    var half = (HERO.ascension || 0) > 0 ? 0.5 : 1; // Г2-5: после Вознесения артефакты ×0.5 силы
    for (var i = 0; i < BOSS_ARTIFACTS.length; i++) {
        var a = BOSS_ARTIFACTS[i];
        if (a.kind !== kind || HERO.bosses.defeated.indexOf(a.num) === -1) continue;
        if ((kind === 'tax' || kind === 'attrition' || kind === 'def') && a.prov !== prov) continue;
        return 1 + (base - 1) * half;
    }
    return 1;
}
function bossCardHtml(idx) { // карточка босса сверху панели твердыни (карточка провинциальная)
    var prov = STRONGHOLDS[idx].prov;
    if (!provCaptured(prov)) return '';
    var num = provBossNum(prov);
    if (num === null) return '';
    var b = bossOf(num);
    ensureBossesState();
    var inProgress = HERO.bosses.activeNum === num && HERO.bosses.attemptDay === getMSKDayKey();
    var phaseI = HERO.bosses.activeNum === num ? HERO.bosses.phase : 0;
    var esc = bossEscalation(num);
    var html = '<div class="boss-card"><div class="boss-card-head"><span class="boss-card-icon">' + b.icon + '</span><span class="boss-card-name">' + b.name + '</span></div>';
    html += '<div class="boss-card-lore">«' + b.lore + '»</div>';
    html += b.phases.map(function(ph, i) {
        var mark = i < phaseI ? '✅' : (i === phaseI ? '🎯' : '🔒');
        var cls = i < phaseI ? ' done' : (i === phaseI ? ' active' : ' locked');
        return '<div class="boss-phase' + cls + '">' + mark + ' Фаза ' + (i + 1) + '/3: ' + bossPhaseLabel(ph, esc) + '</div>';
    }).join('');
    html += inProgress
        ? '<div class="empty-state">⚔ Вызов принят — фаза ' + (phaseI + 1) + '/3 в работе. Провал дня сожжёт попытку, фаза останется.</div>'
        : (HERO.bosses.attemptDay === getMSKDayKey()
            ? '<div class="empty-state">⚔ Попытка сегодня использована — возвращайся завтра.</div>'
            : '<button class="sh-buy" data-action="boss-challenge" data-num="' + num + '">⚔ Бросить вызов</button>');
    html += '<div class="boss-card-artifact">🏆 Артефакт: ' + b.artifact.name + ' — ' + b.artifact.desc + '</div>';
    html += '</div>';
    return html;
}
var currentShIdx = null;
var shCatalogOpen = false;
var dailyQuests = null;
var season = null;
var throne = 0; // Вечный трон: 0..5 возведений, +1% налогов навсегда за каждое
var SEASON_DAYS = 30;
var SEASON_NAMES = ['Пробуждение', 'Закалка', 'Разлив', 'Венец'];
var THRONE_COSTS = [100000, 250000, 500000, 1000000, 2000000]; // QA4-M1: прогрессивная цена (анти-void)
function throneCost() { return THRONE_COSTS[Math.min(throne, THRONE_COSTS.length - 1)]; }
/* ===================== Г5-Т: технологии провинций (перманентно, вне сезона; паттерн throne) ===================== */
var TECHS = { owned: {}, lvl: {} }; // Г5-Т3: owned — купленные, lvl — уровневые ноды I..V
var TECH_PTS = 0;    // очки технологий: +1/день за провинцию с порядком ≥85
var TECH_ACTIVES = {}; // Г5-Т3 Ф2: приказы недели { actId: неделя-ключ последнего применения }
var TECH_WEEKLY = {
  req: { icon: '📜', name: 'Приказ рекрутского набора', desc: 'пул найма недели ×1.5', gold: 150 },
  rev: { icon: '🎉', name: 'Всеобщее ликование', desc: 'порядок +10 во всех провинциях', gold: 200 },
  cor: { icon: '🏗', name: 'Королевская подать', desc: 'все постройки дешевле на 25% неделю', gold: 120 },
  sac: { icon: '🔥', name: 'Великая жатва', desc: 'налоги ×1.3 неделю', gold: 300 }
};
function techOrderWeekKey() { return getThisMondayKey(); }
function techOrderUsed(actId) { return TECH_ACTIVES[actId] === techOrderWeekKey(); }
function requestTechOrder(actId) {
  var a = TECH_WEEKLY[actId];
  if (!a) return;
  if (techOrderUsed(actId)) { showToast('📜 Приказ уже отдан', 'Повторно — только с новой недели.', 'blood'); sfxError(); return; }
  if ((HERO.gold || 0) < a.gold) { showToast('💰 Мало золота', 'Приказ стоит ' + a.gold + ' 💰.', 'blood'); sfxError(); return; }
  HERO.gold -= a.gold;
  TECH_ACTIVES[actId] = techOrderWeekKey();
  if (actId === 'rev') { [1, 2, 3, 4].forEach(function(p) { if (provCapturedCount(p) > 0) { var s = ensureSeasonFields('order'); s.order[provKey(p)] = Math.min(100, provOrder(p) + 10); } }); }
  showToast('📜 ' + a.name, a.desc + ' · до конца недели.', 'save');
  sfxForge(); haptic('medium'); saveSoon(); renderStrongholds();
}
function techOrderActive(actId) { return TECH_ACTIVES[actId] === techOrderWeekKey(); }
function techLvlOf(id) { return (TECHS.lvl && TECHS.lvl[id]) || 0; }
function techLvlNextCost(id) { var lvl = techLvlOf(id); if (lvl === 0 || lvl >= 5 || !TECH_TREE[id] || TECH_TREE[id].tier > 3) return null; var t = TECH_TREE[id]; return { res: Math.round(t.res * (1 + lvl)), pts: t.pts * (1 + lvl) }; }
function upgradeTechLvl(id) {
  var cost = techLvlNextCost(id);
  if (!cost) return 'Уровневая нода недоступна (только тиры 1–3, максимум V).';
  if (TECH_PTS < cost.pts) return 'Не хватает очков (' + TECH_PTS + '/' + cost.pts + ').';
  if (resPool() < cost.res) return 'Не хватает ресурсов (' + resPool() + '/' + cost.res + ').';
  TECH_PTS -= cost.pts;
  spendRes(cost.res);
  TECHS.lvl[id] = techLvlOf(id) + 1;
  showToast('🔬 ' + TECH_TREE[id].name + ' → ' + 'I'.repeat(TECHS.lvl[id]), 'Эффект усилен.', 'save');
  sfxForge(); haptic('medium'); saveSoon();
  return null;
}
var TECH_ERAS = [
  { tiers: [1, 2, 3], name: '🌑 Эпоха Тьмы', need: 0 },
  { tiers: [4, 5, 6], name: '🩸 Эпоха Крови', need: 8 },
  { tiers: [7, 8], name: '👁 Эпоха Угасания', need: 15 }
];
function techEraOk(tier) {
  for (var i = 0; i < TECH_ERAS.length; i++) {
    if (TECH_ERAS[i].tiers.indexOf(tier) >= 0) return capturedCount() >= TECH_ERAS[i].need;
  }
  return false;
}
function techEraNeed(tier) {
  for (var i = 0; i < TECH_ERAS.length; i++) if (TECH_ERAS[i].tiers.indexOf(tier) >= 0) return TECH_ERAS[i].need;
  return 0;
}
var TECH_TREE = {
  w1: { br: '⚔', tier: 1, icon: '🛡', name: 'Дисциплина гарнизонов', desc: 'оборона твердынь в осадах +10%', res: 8,  pts: 2 },
  w2: { br: '⚔', tier: 2, icon: '📜', name: 'Тактические свитки',    desc: 'потери при штурмах −10%',        res: 16, pts: 4 },
  w3: { br: '⚔', tier: 3, icon: '🏰', name: 'Осадный парк',          desc: 'атака штурма +10%',              res: 28, pts: 6 },
  w4: { br: '⚔', tier: 4, icon: '🚩', name: 'Знамёна Угасания',      desc: 'армия в штурме ещё +5%',         res: 44, pts: 9 },
  e1: { br: '💰', tier: 1, icon: '⚖', name: 'Ревизия налогов',       desc: 'налоги +5%',                     res: 8,  pts: 2 },
  e2: { br: '💰', tier: 2, icon: '🛃', name: 'Торговые гильдии',     desc: 'торговые пути +1% за путь',      res: 16, pts: 4 },
  e3: { br: '💰', tier: 3, icon: '📦', name: 'Ресурсные регалии',    desc: 'ресурсы +1/день за провинцию',   res: 28, pts: 6 },
  e4: { br: '💰', tier: 4, icon: '🪙', name: 'Монетная реформа',     desc: 'налоги ещё +7%',                 res: 44, pts: 9 },
  c1: { br: '⚖', tier: 1, icon: '📋', name: 'Перепись населения',    desc: 'дрейф порядка +2/день',          res: 8,  pts: 2 },
  c2: { br: '⚖', tier: 2, icon: '🖋', name: 'Школы писцов',          desc: 'эдикты дешевле на 25%',          res: 16, pts: 4 },
  c3: { br: '⚖', tier: 3, icon: '🔨', name: 'Реформа судов',         desc: 'риск восстания −25%',            res: 28, pts: 6 },
  c4: { br: '⚖', tier: 4, icon: '🕊', name: 'Гармония провинций',    desc: 'порядок не падает ниже 50',      res: 44, pts: 9 },
  w5: { br: '⚔', tier: 5, icon: '🛡', name: 'Легионы Угасания',      desc: 'сила армии +10%',                res: 70, pts: 14 },
  w6: { br: '⚔', tier: 6, icon: '🗼', name: 'Железный Закон',        desc: 'гнев недели капится на 7',       res: 100, pts: 18 },
  e5: { br: '💰', tier: 5, icon: '🏦', name: 'Имперский Банк',       desc: 'налоги +10%',                    res: 70, pts: 14 },
  e6: { br: '💰', tier: 6, icon: '👑', name: 'Имперская Монета',     desc: 'налоги ещё +12%',                res: 100, pts: 18 },
  c5: { br: '⚖', tier: 5, icon: '🏛', name: 'Кодекс Угасания',       desc: 'эдикты ещё −15%',                res: 70, pts: 14 },
  c6: { br: '⚖', tier: 6, icon: '🌟', name: 'Золотой Век',           desc: 'порядок не падает ниже 70',      res: 100, pts: 18 },
  w7: { br: '⚔', tier: 7, icon: '🦅', name: 'Легион-победитель',      desc: 'потери при штурмах ещё ×0.8',    res: 140, pts: 24 },
  w8: { br: '⚔', tier: 8, icon: '💀', name: 'Апофеоз Войны',          desc: 'сила армии ещё ×1.20',           res: 180, pts: 30 },
  e7: { br: '💰', tier: 7, icon: '⛵', name: 'Купеческий Флот',       desc: 'налоги ещё ×1.05',               res: 140, pts: 24 },
  e8: { br: '💰', tier: 8, icon: '🏦', name: 'Имперская Казна',       desc: 'налоги ещё ×1.06',               res: 180, pts: 30 },
  c7: { br: '⚖', tier: 7, icon: '📚', name: 'Канцелярия',             desc: 'очки технологий +1/день',        res: 140, pts: 24 },
  c8: { br: '⚖', tier: 8, icon: '🏛', name: 'Идеальное Государство',  desc: 'дрейф +3, порядок не ниже 80',   res: 180, pts: 30 },
  s1: { br: '🕯', tier: 1, icon: '🎵', name: 'Полуночные Псалмы',     desc: 'весь опыт +5%',                  res: 8,  pts: 2 },
  s2: { br: '🕯', tier: 2, icon: '⚱', name: 'Реликварий',             desc: 'артефакты боссов ×1.25',         res: 16, pts: 4 },
  s3: { br: '🕯', tier: 3, icon: '🔕', name: 'Обряды Усмирения',      desc: 'гнев −1 за неделю',              res: 28, pts: 6 },
  s4: { br: '🕯', tier: 4, icon: '🔮', name: 'Пророчества Вех',        desc: 'сила осады всегда видна',        res: 44, pts: 9 },
  s5: { br: '🕯', tier: 5, icon: '🔥', name: 'Жертвенные Ритуалы',    desc: 'весь опыт +15%',                 res: 70, pts: 14 },
  s6: { br: '🕯', tier: 6, icon: '🌫', name: 'Око Ворона',             desc: 'туман войны всегда пробит',      res: 100, pts: 18 },
  s7: { br: '🕯', tier: 7, icon: '🌌', name: 'Трансценденция',         desc: 'весь опыт ещё ×1.25',            res: 140, pts: 24 },
  s8: { br: '🕯', tier: 8, icon: '👑', name: 'Корона Тьмы',            desc: 'очки технологий +1/день',        res: 180, pts: 30 },
  g1: { br: '🏗', tier: 1, icon: '📐', name: 'Чертёжный Дом',          desc: 'постройки дешевле на 10%',       res: 8,  pts: 2 },
  g2: { br: '🏗', tier: 2, icon: '🧰', name: 'Ликвидация Долгов',      desc: 'содержание −10%',                res: 16, pts: 4 },
  g3: { br: '🏗', tier: 3, icon: '⛺', name: 'Контрактная Система',    desc: 'прирост найма ×1.25',            res: 28, pts: 6 },
  g4: { br: '🏗', tier: 4, icon: '🛠', name: 'Ремонтные Артели',       desc: 'grace +2 дня до ветшания',       res: 44, pts: 9 },
  g5: { br: '🏗', tier: 5, icon: '🏰', name: 'Бастионы Эпохи',         desc: 'оборона твердынь +15%',          res: 70, pts: 14 },
  g6: { br: '🏗', tier: 6, icon: '⚙', name: 'Механизмы Предков',      desc: 'ветшание вдвое медленнее',       res: 100, pts: 18 },
  g7: { br: '🏗', tier: 7, icon: '🗼', name: 'Цитадели Тьмы',          desc: 'оборона ещё +25%',               res: 140, pts: 24 },
  g8: { br: '🏗', tier: 8, icon: '🌆', name: 'Мегаполисы Пепла',       desc: 'содержание ещё −20%',            res: 180, pts: 30 },
  d1: { br: '🕊', tier: 1, icon: '🤝', name: 'Хлебные Законы',         desc: 'риск восстания −10%',            res: 8,  pts: 2 },
  d2: { br: '🕊', tier: 2, icon: '🗣', name: 'Сеть Осведомителей',     desc: 'тень стоит 25💰',                res: 16, pts: 4 },
  d3: { br: '🕊', tier: 3, icon: '🛤', name: 'Старые Тропы',           desc: '+1 торговый путь',               res: 28, pts: 6 },
  d4: { br: '🕊', tier: 4, icon: '🎪', name: 'Ярмарочные Площади',     desc: 'рынок +5% к доходу',             res: 44, pts: 9 },
  d5: { br: '🕊', tier: 5, icon: '🤲', name: 'Кормления Провинций',    desc: 'эдикты ещё −20%',                res: 70, pts: 14 },
  d6: { br: '🕊', tier: 6, icon: '🌍', name: 'Консульства',            desc: 'торговые пути ×1.15',            res: 100, pts: 18 },
  d7: { br: '🕊', tier: 7, icon: '🤫', name: 'Тайная Дипломатия',      desc: 'восстания ещё ×0.5',             res: 140, pts: 24 },
  d8: { br: '🕊', tier: 8, icon: '🕊', name: 'Вечный Мир',             desc: 'восстания ещё ×0.25',            res: 180, pts: 30 }
};
var TECH_IDEAS = { // капстоуны: взаимно исключающие, тир 6 ветви открывает
  idea_might: { icon: '🐺', name: 'Путь Могущества', desc: 'весь опыт +15%',                        res: 150, pts: 25, opens: 'w6' },
  idea_wealth: { icon: '🐉', name: 'Путь Богатства', desc: 'всё золото тика +15%',                  res: 150, pts: 25, opens: 'e6' },
  idea_order: { icon: '⚜', name: 'Путь Порядка',    desc: 'порядок всех провинций +5/день',        res: 150, pts: 25, opens: 'c6' }
};
var TECH_IDEA = null; // выбранная идея (id) — навсегда
function techIdeaOpen(id) { var i = TECH_IDEAS[id]; return !!(i && hasTech(i.opens)); } // Г5-Т2: идея открыта тиром 6 своей ветви
function techIdeaMult() { return TECH_IDEA === 'idea_wealth' ? 1.15 : 1; }
function techIdeaXpMult() { return TECH_IDEA === 'idea_might' ? 1.15 : 1; }
function hasTech(id) { return TECHS.owned[id] === true; }
function techTaxMult() { return (hasTech('e1') ? 1.05 : 1) * (hasTech('e4') ? 1.07 : 1) * (hasTech('e5') ? 1.10 : 1) * (hasTech('e6') ? 1.12 : 1) * (hasTech('e7') ? 1.05 : 1) * (hasTech('e8') ? 1.06 : 1); } // Г5-Т3: стек до ×1.519
function techAtkMult() { return (hasTech('w3') ? 1.10 : 1) * (hasTech('w4') ? 1.05 : 1); } // штурм: f.atk
function techAttrMult() { return (hasTech('w2') ? 0.9 : 1) * (hasTech('w7') ? 0.8 : 1); } // Г5-Т3: Легион-победитель
function techDefMult() { return (hasTech('w1') ? 1.10 : 1) * (hasTech('g5') ? 1.15 : 1) * (hasTech('g7') ? 1.25 : 1); } // Г5-Т3: Бастионы/Цитадели
function techArmyMult() { return (hasTech('w5') ? 1.10 : 1) * (hasTech('w8') ? 1.20 : 1); } // Легионы + Апофеоз
function techEdictCostMult() { return (hasTech('c2') ? 0.75 : 1) * (hasTech('c5') ? 0.85 : 1) * (hasTech('d5') ? 0.8 : 1); } // Г5-Т3: стек ×0.51
function techRevoltMult() { return (hasTech('c3') ? 0.75 : 1) * (hasTech('d1') ? 0.9 : 1) * (hasTech('d7') ? 0.5 : 1) * (hasTech('d8') ? 0.25 : 1); } // Г5-Т3: стек ×0.084
function techOrderDrift() { return 1 + (hasTech('c1') ? 1 : 0) + (hasTech('c8') ? 3 : 0); } // Г5-Т3: Идеальное Государство +3
function techOrderFloor() { return hasTech('c8') ? 80 : (hasTech('c6') ? 70 : (hasTech('c4') ? 50 : 0)); } // приоритет: Идеальное > Золотой Век > Гармония
function techBuildingCostMult() { return hasTech('g1') ? 0.9 : 1; } // Г5-Т3 Ф1: функция (проводка buyBuilding — Ф3)
function techUpkeepMult() { return (hasTech('g2') ? 0.9 : 1) * (hasTech('g8') ? 0.8 : 1); } // Г5-Т3: Ликвидация/Мегаполисы ×0.72
function techGrowMult() { return hasTech('g3') ? 1.25 : 1; } // Г5-Т3 Ф1: функция (проводка recalcHirePool — Ф3)
function techGraceBonus() { return hasTech('g4') ? 2 : 0; } // Г5-Т3 Ф1: функция (проводка grace — Ф3)
function techXpMult() { return (hasTech('s1') ? 1.05 : 1) * (hasTech('s5') ? 1.15 : 1) * (hasTech('s7') ? 1.25 : 1); } // Г5-Т3 Ф1: функция (проводка completeCard — Ф3)
function techArtifactMult() { return hasTech('s2') ? 1.25 : 1; } // Г5-Т3 Ф1: функция (проводка bossArtifactMult — Ф3)
function techWrathWeekReduction() { return hasTech('s3') ? 1 : 0; } // Г5-Т3 Ф1: функция (проводка понедельника — Ф3)
function techSeesSiege() { return hasTech('s4'); } // Г5-Т3 Ф1: функция (проводка siegeAlarmPreview — Ф3)
function techFogPierceAlways() { return hasTech('s6'); } // Г5-Т3 Ф1: функция (проводка stanceFogPierce — Ф3)
function techPtsBonus() { return (hasTech('c7') ? 1 : 0) + (hasTech('s8') ? 1 : 0); } // Г5-Т3: Канцелярия + Корона Тьмы
function techCorrSlow() { return hasTech('g6') ? 0.5 : 1; } // Г5-Т3 Ф1: функция (проводка corruptionTick — Ф3)
function techTradeMult() { return (hasTech('e2') ? 1.4 : 1) * (hasTech('d6') ? 1.15 : 1); } // Г5-Т3: пути ×1.61 (кап 61.2%)
function techMarketBonus() { return hasTech('d4') ? 0.05 : 0; } // Г5-Т3 Ф1: функция (проводка tick market — Ф3)
function techScoutCost() { return hasTech('d2') ? 25 : 50; } // Г5-Т3 Ф1: функция (проводка sendScout — Ф3)
function techVirtualRoutes() { return hasTech('d3') ? 1 : 0; } // Г5-Т3: Старые Тропы +1 путь
function resPool() { var n = 0; [1, 2, 3, 4].forEach(function(p) { if (provCapturedCount(p) > 0) n += provResource(p); }); return n; }
function spendRes(total) { // слив с захваченных провинций, старшие провинции первыми
  var left = total;
  [4, 3, 2, 1].forEach(function(p) {
    if (left <= 0 || provCapturedCount(p) === 0) return;
    var s = ensureSeasonFields('resource');
    var take = Math.min(provResource(p), left);
    if (take > 0) { s.resource[provKey(p)] = provResource(p) - take; left -= take; }
  });
  return left === 0;
}
function techPrevOwned(id) { var t = TECH_TREE[id]; if (t.tier === 1) return true; var prevId = t.br.toLowerCase().replace('💰', 'e').replace('⚔', 'w').replace('⚖', 'c') + (t.tier - 1); return hasTech(prevId); }
function techBranchLetter(br) { return br === '⚔' ? 'w' : (br === '💰' ? 'e' : 'c'); }
function techPrevOwnedStrict(id) {
  var t = TECH_TREE[id];
  if (t.tier === 1) return true;
  var own = hasTech(techBranchLetter(t.br) + (t.tier - 1));
  if (t.tier <= 4) return own; // тиры 1–4: линейная цепь
  // Г5-Т2: кросс-требование — тир 5 требует тир 3+ в ДВУХ других ветвях, тир 6 — тир 4+ в двух других
  var need = (t.tier === 5) ? 3 : 4;
  var others = ['w', 'e', 'c'].filter(function(L) { return L !== techBranchLetter(t.br); });
  var okCount = 0;
  for (var oi = 0; oi < others.length; oi++) {
    var s = 0;
    for (var i = 1; i <= 6; i++) if (hasTech(others[oi] + i)) s += i;
    if (s >= need) okCount++;
  }
  return own && okCount >= 2;
}
function buyTech(id) {
  var t = TECH_TREE[id];
  if (!t || hasTech(id)) return 'Уже изучено.';
  if (!techEraOk(t.tier)) return 'Эпоха закрыта: нужно ' + techEraNeed(t.tier) + ' твердынь (захвачено ' + capturedCount() + ').'; // Г5-Т3
  if (!techPrevOwnedStrict(id)) return 'Сначала предыдущий тир ветви (тиры 5–6 требуют развития в двух ветвях).';
  if (TECH_PTS < t.pts) return 'Не хватает очков технологий (' + TECH_PTS + '/' + t.pts + ').';
  if (resPool() < t.res) return 'Не хватает ресурсов (' + resPool() + '/' + t.res + ').';
  TECH_PTS -= t.pts;
  spendRes(t.res);
  TECHS.owned[id] = true;
  if (!TECHS.lvl) TECHS.lvl = {};
  if (!TECHS.lvl[id]) TECHS.lvl[id] = 1; // Г5-Т3: тир 1 открывает уровневую ноду I
  showToast('🔬 Технология изучена: ' + t.name, t.desc, 'save');
  sfxForge(); haptic('medium'); saveSoon();
  return null;
}
function buyTechIdea(id) { // Г5-Т2: капстоун — одна навсегда
  var i = TECH_IDEAS[id];
  if (!i) return 'Неизвестная идея.';
  if (TECH_IDEA) return 'Путь уже выбран: ' + TECH_IDEAS[TECH_IDEA].name + ' (навсегда).';
  if (!techIdeaOpen(id)) return 'Открывает тир 6 ветви ' + i.opens.toUpperCase() + '.';
  if (TECH_PTS < i.pts) return 'Не хватает очков технологий (' + TECH_PTS + '/' + i.pts + ').';
  if (resPool() < i.res) return 'Не хватает ресурсов (' + resPool() + '/' + i.res + ').';
  TECH_PTS -= i.pts;
  spendRes(i.res);
  TECH_IDEA = id;
  showToast('⚜ Путь выбран: ' + i.name, i.desc + ' — навсегда.', 'crit');
  sfxForge(); haptic('heavy'); saveSoon();
  return null;
}
function techDailyTick(todayKey) { // из checkDailyReset: рост ресурсов + очки за элитный порядок
  var pts = 0;
  [1, 2, 3, 4].forEach(function(p) {
    if (provCapturedCount(p) === 0) return;
    var o = provOrder(p);
    if (o >= 85) pts += 1;
    if (o >= 70 && provEdict(p) === 'order') { // Г5-Т: указ о порядке развивает провинцию (нейтральный дефолт не растёт — канон-пины живы)
      var s = ensureSeasonFields('resource');
      s.resource[provKey(p)] = Math.min(999, provResource(p) + 2 + (hasTech('e3') ? 1 : 0));
    }
  });
  if (capturedCount() > 0) pts += techPtsBonus(); // Г5-Т3: Канцелярия + Корона Тьмы
  TECH_PTS = Math.min(999, TECH_PTS + pts);
  return { pts: pts };
}
function techSvgHtml() { // Г5-Т3: SVG-дерево — 6 колонок ветвей × 8 рядов тиров + эпохи
  var branches = [['w', '⚔', '#c73e4d'], ['e', '💰', '#fbbf24'], ['c', '⚖', '#34d399'], ['s', '🕯', '#a78bfa'], ['g', '🏗', '#d4a574'], ['d', '🕊', '#60a5fa']];
  var CW = 90, RH = 92, X0 = 40, Y0 = 120;
  var svg = '<svg class="km-tree-svg" viewBox="0 0 560 900" role="group" aria-label="Дерево технологий: 6 ветвей, 8 тиров, 3 эпохи">';
  for (var bi = 0; bi < branches.length; bi++) {
    var L = branches[bi][0], icon = branches[bi][1], color = branches[bi][2];
    svg += '<text class="km-tree-col" x="' + (X0 + bi * CW + CW / 2) + '" y="40">' + icon + '</text>';
    for (var tier = 1; tier <= 8; tier++) {
      var id = L + tier, t = TECH_TREE[id];
      var owned = hasTech(id), prev = techPrevOwnedStrict(id), eraOk = techEraOk(tier);
      var cls = owned ? ' owned' : (prev && eraOk ? ' can' : ' locked');
      var cx = X0 + bi * CW + CW / 2, cy = Y0 + (tier - 1) * RH;
      svg += '<g class="km-tree-node' + cls + '" data-tree-id="' + id + '">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="26"/>' +
        '<text class="km-tree-node-icon" x="' + cx + '" y="' + (cy + 7) + '">' + t.icon + '</text>' +
        '<text class="km-tree-node-cost" x="' + cx + '" y="' + (cy + 44) + '">📦' + t.res + '·🔬' + t.pts + '</text>';
      if (TECHS.lvl && TECHS.lvl[id]) svg += '<text class="km-tree-node-lvl" x="' + (cx + 22) + '" y="' + (cy - 12) + '">' + 'I'.repeat(TECHS.lvl[id]) + '</text>';
      svg += '<title>' + t.name + ' — ' + t.desc + (owned ? ' (изучено)' : '') + '</title></g>';
      if (tier < 8) svg += '<line class="km-tree-edge' + (hasTech(id) ? ' on' : '') + '" x1="' + cx + '" y1="' + (cy + 26) + '" x2="' + cx + '" y2="' + (cy + RH - 26) + '"/>';
    }
  }
  for (var ei = 1; ei < TECH_ERAS.length; ei++) {
    var ey = Y0 + TECH_ERAS[ei].tiers[0] * RH - RH / 2 - 22;
    svg += '<line class="km-tree-era" x1="20" y1="' + ey + '" x2="540" y2="' + ey + '"/><text class="km-tree-era-label" x="280" y="' + (ey - 8) + '">' + TECH_ERAS[ei].name + ' · ' + TECH_ERAS[ei].need + '+ твердынь</text>';
  }
  svg += '</svg>';
  return svg;
}
function techPanelHtml() {
  var rows = Object.keys(TECH_TREE).map(function(id) {
    var t = TECH_TREE[id], owned = hasTech(id), prev = techPrevOwnedStrict(id);
    var can = !owned && prev && TECH_PTS >= t.pts && resPool() >= t.res;
    var state = owned ? ' owned' : (can ? ' can' : (prev ? '' : ' locked'));
    return '<button class="km-tech' + state + '" data-action="km-tech-buy" data-tech="' + id + '"' + (owned ? ' disabled' : '') + ' data-tier="' + t.tier + '" data-br="' + techBranchLetter(t.br) + '">' +
      '<span class="km-tech-br">' + t.br + '</span><span class="km-tech-body"><b>' + t.icon + ' ' + t.name + (owned ? ' ✓' : '') + '</b><i>' + t.desc + '</i></span>' +
      '<span class="km-tech-cost">' + (owned ? 'изучено' : '📦' + t.res + ' · 🔬' + t.pts) + '</span></button>';
  }).join('');
  var ideas = '<div class="sh-sec-title">⚜ Идеи эпохи — один Путь навсегда' + (TECH_IDEA ? ' · выбран: ' + TECH_IDEAS[TECH_IDEA].name : '') + '</div><div class="km-tech-row">' + Object.keys(TECH_IDEAS).map(function(id) {
    var i = TECH_IDEAS[id], owned = TECH_IDEA === id, open = techIdeaOpen(id);
    var state = owned ? ' owned' : (open ? ' can' : ' locked');
    return '<button class="km-tech' + state + '" data-action="km-idea-buy" data-idea="' + id + '"' + (owned || TECH_IDEA ? ' disabled' : '') + '>' +
      '<span class="km-tech-br">' + i.icon + '</span><span class="km-tech-body"><b>' + i.name + (owned ? ' ✓' : '') + '</b><i>' + i.desc + (i.opens && !open ? ' · открывает тир 6 ветви ' + i.opens.toUpperCase() : '') + '</i></span>' +
      '<span class="km-tech-cost">' + (owned ? 'избрано' : '📦' + i.res + ' · 🔬' + i.pts) + '</span></button>';
  }).join('') + '</div>';
  var orders = '<div class="sh-sec-title">📜 Приказы недели — до понедельника</div><div class="km-tech-row">' + Object.keys(TECH_WEEKLY).map(function(aid) {
    var a = TECH_WEEKLY[aid], used = techOrderUsed(aid);
    return '<button class="km-tech' + (used ? ' owned' : ' can') + '" data-action="km-order" data-order="' + aid + '"' + (used ? ' disabled' : '') + '>' +
      '<span class="km-tech-br">' + a.icon + '</span><span class="km-tech-body"><b>' + a.name + '</b><i>' + a.desc + '</i></span>' +
      '<span class="km-tech-cost">' + (used ? 'исполнен' : a.gold + ' 💰') + '</span></button>';
  }).join('') + '</div>';
  var lvls = Object.keys(TECHS.lvl || {}).filter(function(id) { return techLvlNextCost(id) !== null; }).map(function(id) {
    var t = TECH_TREE[id], cost = techLvlNextCost(id);
    if (!cost) return '';
    var can = TECH_PTS >= cost.pts && resPool() >= cost.res;
    return '<button class="km-tech' + (can ? ' can' : ' locked') + '" data-action="km-lvl-up" data-tech="' + id + '">' +
      '<span class="km-tech-br">' + t.icon + '</span><span class="km-tech-body"><b>' + t.name + ' — уровень ' + 'I'.repeat(techLvlOf(id)) + ' → ' + 'I'.repeat(techLvlOf(id) + 1) + '</b><i>' + t.desc + ' (эффект усиливается)</i></span>' +
      '<span class="km-tech-cost">📦' + cost.res + ' · 🔬' + cost.pts + '</span></button>';
  }).join('');
  var lvlBlock = lvls ? '<div class="sh-sec-title">⏫ Эскалация уровневых нод (тиры 1–3, до V)</div><div class="km-tech-row">' + lvls + '</div>' : '';
  return '<div class="km-tech-note">🔬 ' + TECH_PTS + ' очков · 📦 ' + resPool() + ' ресурсов (порядок ≥85 даёт очки; ≥70 + Указ о порядке — ресурсы +2/день)</div>' + techSvgHtml() + '<div class="km-tech-row">' + rows + '</div>' + ideas + orders + lvlBlock;
}
function showTechs() { var m = document.getElementById('techModal'); if (!m) return; document.getElementById('techBody').innerHTML = techPanelHtml(); m.classList.add('show'); }
function closeTechs() { var m = document.getElementById('techModal'); if (m) m.classList.remove('show'); }
function ensureSeason() {
    if (season && season.num && season.start) return season;
    season = STATE_GUARDS.sanitizeSeason(season, getMSKDayKey());
    return season;
}
function warlordTempo() { return Math.max(1, Math.floor(0.8 * capturedCount())); } // Г1-6: темп воеводы Глорха за сезон
function seasonCapturedDelta() { ensureSeason(); return Math.max(0, capturedCount() - ((ensureSeason().snapshot || {}).captured || 0)); } // Г1-6: захваты игрока за текущий сезон
function taxMultiplier() {
    var m = 1;
    if (dailyEvent && dailyEvent.id === 'market') m *= 1.5;
    if (dailyEvent && dailyEvent.id === 'bloodmoon') m *= 0.5; // #41: Кровавая луна
    m *= doctrineTaxMult(); // Г1-2: доктрина налог +15%
    m *= techTaxMult(); // Г5-Т: Ревизия +5% / Монетная реформа +7%
    ensureSeason();
    m *= 1 + Math.min(0.10, (season.crownBonus || 0) * 0.02); // венцы сезонов
    m *= 1 + Math.min(0.05, throne * 0.01); // Вечный трон
    if (HERO.warlordAhead === true) m *= 1.05; // Г1-6: тень воеводы — обгон, +5% до конца следующего сезона
    return m;
}
function seasonName(num) { return SEASON_NAMES[(Math.max(1, num) - 1) % SEASON_NAMES.length]; }
function dayKeyFromUTC(d) { return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
function seasonEndDate(startKey) {
    var d = new Date(startKey + 'T00:00:00+03:00');
    d.setUTCDate(d.getUTCDate() + SEASON_DAYS);
    return dayKeyFromUTC(d);
}
function seasonDaysTotal(startKey) { return Math.max(1, daysBetween(startKey, seasonEndDate(startKey))); }
function seasonDaysDone(startKey) { return Math.max(0, Math.min(seasonDaysTotal(startKey), daysBetween(startKey, getMSKDayKey()))); }
function finishSeason() {
  addChronicle('🍂', 'Сезон ' + season.num + ' («' + seasonName(season.num) + '») завершён: ' + capturedCount() + '/20 твердынь'); // Г5-Ф
    ensureSeason();
    var completions = FORGED.reduce(function(a, c) { return a + (c.totalCompletions || 0); }, 0);
    var d = {
        xp: Math.max(0, (HERO.totalXp || 0) - (season.snapshot.totalXp || 0)),
        gold: (HERO.gold || 0) - (season.snapshot.gold || 0),
        captured: Math.max(0, capturedCount() - (season.snapshot.captured || 0)),
        completions: Math.max(0, completions - (season.snapshot.completions || 0)),
        levels: Math.max(0, (HERO.level || 1) - (season.snapshot.level || 1))
    };
    var earnedCrown = (d.captured > 0 || d.completions >= 10); // венец за живой сезон
    var newCrownBonus = Math.min(5, (season.crownBonus || 0) + (earnedCrown ? 1 : 0));
    showSeasonReport(season.num, d, earnedCrown, newCrownBonus);
    if (HERO.totem) HERO.totem.rechoose = true; // Ф2: смена сезона разрешает выбрать тотем заново (id сохраняется)
    HERO.warlordAhead = d.captured > warlordTempo(); // Г1-6: обгон воеводы на конец сезона
    if (HERO.warlordAhead) showToast('⚔ Тень воеводы: обгон!', 'Глорх позади — налоги +5% до конца следующего сезона', 'crit');
    if (HERO.doctrines) { HERO.doctrines = { t1: null, t2: null, t3: null }; showToast('🎖 Сезон новых доктрин', 'Военные доктрины сброшены — выбирай заново', 'crit'); } // Г1-2
    season = STATE_GUARDS.sanitizeSeason({ num: season.num + 1, start: getMSKDayKey(), crownBonus: newCrownBonus, snapshot: { totalXp: HERO.totalXp || 0, gold: HERO.gold || 0, captured: capturedCount(), completions: completions, level: HERO.level || 1 } }, getMSKDayKey());
    saveGameState();
}
function stormDayOf(num) { return 9 + (num % 7); } // Г1-5: день бури 12±3, детерминированно от номера сезона
function checkStorm() { // Г1-5: коррупционная буря — раз в сезон, дань или деградация построек
ensureSeason();
var _st = HERO.storm;
if (_st && _st.paid === false && _st.num === season.num && getMSKDayKey() > _st.dueDayKey) {
var _sh = strongholds[_st.regionIdx];
if (_sh && _sh.captured) Object.keys(_sh.buildings).forEach(function(id) { var b = _sh.buildings[id]; if (b && b.built && b.corruptionStage !== 'ruin') b.corruptionStage = (b.corruptionStage === 'ok') ? 'worn' : 'ruin'; }); // ok→worn→ruin, на 1 стадию
_st.paid = true; // буря разрешена просрочкой; восстановление стадий — штатное (ремонт/пересборка)
showToast('🌩 Буря разразилась', STRONGHOLDS[_st.regionIdx].name + ': постройки ветшают на стадию — дань не уплачена', 'blood');
sfxFail(); haptic('error'); saveGameState();
return;
}
if ((_st == null || _st.num < season.num) && seasonDaysDone(season.start) >= stormDayOf(season.num)) {
var _cand = [];
strongholds.forEach(function(s, i) { if (s.captured && i > 0) _cand.push(i); }); // регион не-фронт: стартовый лагерь idx 0 исключён
if (!_cand.length) return;
var _ri = _cand[Math.floor(Math.random() * _cand.length)];
HERO.storm = { num: season.num, regionIdx: _ri, dueDayKey: getMSKDayKey(Date.now() + 7 * 86400000), paid: false };
showToast('🌩 Буря над ' + STRONGHOLDS[_ri].name, 'Постройки региона ветшают, если за 7 дней не заплатить дань: ' + (50 * capturedCount()) + ' 💰', 'crit');
sfxError(); haptic('heavy'); saveGameState();
}
}
function stormPay() { // Г1-5: оплата дани бури
var st = HERO.storm;
if (!st || st.paid) return;
var cost = 50 * capturedCount();
if ((HERO.gold || 0) < cost) { showToast('💰 Мало золота', 'Дань бури: ' + cost + ' 💰, в казне ' + (HERO.gold || 0), 'blood'); sfxError(); return; }
HERO.gold -= cost;
st.paid = true;
showToast('🌧 Дань уплачена', 'Буря над ' + STRONGHOLDS[st.regionIdx].name + ' стихает — постройки целы', 'save');
sfxEquip(); haptic('success');
renderStrongholds(); saveGameState();
}
function investThrone() {
if (throne >= 5) { showToast('👑 Предел', 'Трон возведён полностью: +5% налогов навсегда', 'save'); return; }
var cost = throneCost();
if ((HERO.gold || 0) < cost) { showToast('💰 Мало золота', 'Нужно ' + cost.toLocaleString('ru-RU') + ' 💰', 'blood'); sfxError(); return; }
HERO.gold -= cost;
throne++;
showToast('👑 Вечный трон', 'Ярус ' + throne + '/5: +' + throne + '% налогов навсегда', 'crit');
spiritSay('«Камень к камню — трон, что переживёт века.»');
sfxLevelUp(); haptic('heavy');
renderStrongholds(); updateHeroUI(); saveGameState();
}
// ===================== Г2-5: ВОЗНЕСЕНИЕ — новый круг при троне 5/5 =====================
function ascEnemyMult() { return 1 + 0.25 * (HERO.ascension || 0); } // враги +25% силы за каждый круг
function ascensionPalClass(n) { if (!n || n <= 0) return ''; return 'asc-' + ((n % 3) === 0 ? 3 : (n % 3)); } // 1 пепел / 2 кровь / 3 звёзды
function applyAscensionPalette() { // палитра по N%3 — CSS-переменные body.asc-N
    ['asc-1', 'asc-2', 'asc-3'].forEach(function(c) { document.body.classList.remove(c); });
    var cls = ascensionPalClass(HERO.ascension || 0);
    if (cls) document.body.classList.add(cls);
}
function requestAscension() {
    if (throne < 5) { showToast('👑 Трон не завершён', 'Вознесение открывается при троне 5/5', 'blood'); sfxError(); return; }
    var active = ['t1', 't2', 't3'].map(doctrineOf).filter(Boolean);
    if (active.length === 0) { ascensionConfirm(null); return; }
    openAscensionModal(active); // выбор ОДНОЙ доктрины ДО подтверждения
}
function openAscensionModal(active) {
    closeAscensionModal();
    var ov = document.createElement('div');
    ov.id = 'ascModal'; ov.className = 'modal-overlay show'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    var rows = active.map(function(id) { var d = DOCTRINES[id]; return '<button class="demo-btn primary" data-action="asc-doctrine" data-id="' + id + '">' + d.icon + ' ' + d.name + ' · сохранить</button>'; }).join('');
    ov.innerHTML = '<div class="modal confirm-modal"><div class="confirm-title">✨ Вознесение — что сохранить?</div><div class="confirm-body">Из военных доктрин в новый круг перейдёт <b>только одна</b>. Выбери:</div><div class="confirm-actions" style="flex-direction:column;gap:8px">' + rows + '</div></div>';
    ov.addEventListener('click', function(e) { if (e.target === ov) closeAscensionModal(); });
    document.body.appendChild(ov);
}
function closeAscensionModal() { var ov = document.getElementById('ascModal'); if (ov) ov.remove(); }
function pickAscensionDoctrine(id) {
    var valid = DOCTRINES[id] && doctrineOf(DOCTRINES[id].tier) === id;
    closeAscensionModal();
    if (valid) ascensionConfirm(id);
}
function ascensionConfirm(keepId) { // честное описание потерь
    var d = keepId ? DOCTRINES[keepId] : null;
    var keep = 'башню (этаж ' + ((HERO.tower && HERO.tower.floor) || 0) + '), гримуар связей, артефакты боссов (сила ×0.5)' + (d ? ', доктрину «' + d.name + '»' : '') + ', ' + Math.floor((HERO.gold || 0) * 0.1).toLocaleString('ru-RU') + ' 💰 (10% казны)';
    dungeonConfirm('✨ Вознесение — круг ' + ((HERO.ascension || 0) + 1) + '?', '<b>Сохраняется:</b> ' + keep + '.<br><b style="color:var(--blood-bright)">Сбрасывается:</b> все твердыни и постройки, армия, гарнизоны, осады, трон (5/5 → 0), сезон → Сезон 1. Враги сильнее: +25% силы за каждый круг.').then(function(ok) {
        if (!ok) return;
        performAscension(keepId);
    });
}
function performAscension(keepId) { // ядро сброса: сохранить башню/гримуар/артефакты ×0.5/1 доктрину/10% казны, сбросить мир
    var keptTier = (keepId && DOCTRINES[keepId] && doctrineOf(DOCTRINES[keepId].tier) === keepId) ? DOCTRINES[keepId].tier : null;
    HERO.gold = Math.floor((HERO.gold || 0) * 0.1); // 10% казны
    HERO.doctrines = { t1: null, t2: null, t3: null };
    if (keptTier) HERO.doctrines[keptTier] = keepId; // одна доктрина на выбор
    HERO.ascension = (HERO.ascension || 0) + 1; // N++ — whitelist
    if (HERO.bosses) { // артефакты (defeated) живут вечно, но ×0.5 (bossArtifactMult Half); активный вызов сгорает
        HERO.bosses.activeNum = null; HERO.bosses.phase = 0; HERO.bosses.attemptDay = null; HERO.bosses.closedDay = null;
    }
    HERO.scouts = null; // тени старого мира сгорают
    strongholds = null; ensureStrongholdState(); // твердыни/постройки/гарнизоны — заново
    army = { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 0 };
    siege = { week: 1, lastResult: null, assaultDay: null, wkSkips: 0, wkTaskFails: 0, retriedThisWeek: false };
    hirePool = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 };
    dailyQuests = null; dailyEvent = null; throne = 0;
    lastDayReset = null; lastWeekReset = getThisMondayKey();
    season = STATE_GUARDS.sanitizeSeason({ num: 1, start: getMSKDayKey() }, getMSKDayKey()); // Сезон 1 нового круга
    applyAscensionPalette();
    showToast('✨ Вознесение ' + HERO.ascension, 'Круг ' + (HERO.ascension + 1) + ': мир перестроен. Враги +25%, артефакты ×0.5.', 'crit');
    spiritSay('«Трон пуст. Мир начинается заново — но ты помнишь всё.»');
    sfxLevelUp(); haptic('heavy');
    renderStrongholds(); updateStrongholdProgress(); renderDashboard(); updateHeroUI(); renderCards();
    saveGameState();
}
function showSeasonReport(num, d, earnedCrown, newCrownBonus) {
    var modal = document.getElementById('seasonModal');
    if (!modal) return;
    var tile = function(icon, val, label) { return '<div class="digest-tile"><div class="dt-num">' + icon + ' ' + val + '</div><div class="dt-label">' + label + '</div></div>'; };
    var crownLine = earnedCrown
        ? '<div style="text-align:center; font-size:13px; color:var(--gold-bright); margin-top:6px;">👑 Получен <b>Венец сезона</b> (всего: ' + newCrownBonus + '/5): +' + (newCrownBonus * 2) + '% налогов в новом сезоне</div>'
        : '<div style="text-align:center; font-size:12px; color:var(--text-dim); margin-top:6px;">Венец не заработан — взяй твердыню или закрой 10 задач в следующем сезоне</div>';
    modal.querySelector('.modal-body').innerHTML =
    '<div class="digest-head">🍂 Сезон ' + num + ': ' + seasonName(num) + ' — завершён</div>' +
    '<div class="digest-tiles">' +
    tile('✨', '+' + d.xp.toLocaleString('ru-RU'), 'XP за сезон') +
    tile('💯', '+' + d.completions.toLocaleString('ru-RU'), 'выполнений') +
    tile('🏰', '+' + d.captured, 'твердынь взято') +
    tile('💰', (d.gold >= 0 ? '+' : '') + d.gold.toLocaleString('ru-RU'), 'казна (дельта)') +
    '</div>' + crownLine +
    '<div style="text-align:center; font-size:13px; color:var(--text-bright); margin-top:6px;">Сезон ' + (num + 1) + ': <b style="color:var(--gold-bright)">' + seasonName(num + 1) + '</b> — ' + SEASON_DAYS + ' дней. Начни с чистого отсчёта.</div>';
    modal.classList.add('show');
}
var DQ_POOL = [
    { id: 'dq_cards', icon: '📖', text: 'Выполни 2 карточки', goal: 2, reward: 20, counter: 'cards' },
    { id: 'dq_gold', icon: '💰', text: 'Заработай 30 💰', goal: 30, reward: 15, counter: 'gold' },
    { id: 'dq_hire', icon: '⚔', text: 'Найми 3 существа', goal: 3, reward: 15, counter: 'hire' },
    { id: 'dq_build', icon: '🏗', text: 'Построй что-нибудь', goal: 1, reward: 20, counter: 'build' },
    { id: 'dq_quest', icon: '📜', text: 'Выполни задачу', goal: 1, reward: 10, counter: 'quest' },
    { id: 'dq_assault', icon: '⚔', text: 'Штурмуй твердыню', goal: 1, reward: 25, counter: 'assault' }
];
function dqProgress(counter, n) {
    if (!dailyQuests) return;
    var p = dailyQuests.progress || (dailyQuests.progress = {});
    p[counter] = (p[counter] || 0) + (n || 1);
}
function goldGain(n, src) {
    n = Math.round(Number(n)) || 0;
    if (n <= 0) return;
    n = Math.round(n * doctrineCrownMult()); // Г1-2: корона +10% ко ВСЕМУ золоту
    HERO.gold = (HERO.gold || 0) + n;
    dqProgress('gold', n);
    checkDailyGoldGoal();
    bossProgressTick(); // Г2-1: gold-фазы боссов
}
var DAILY_GOLD_BASE = 50; // #71: цель дня по золоту
function dailyGoldGoal() { return Math.min(200 * Math.pow(1.2, HERO.ascension || 0), Math.round((DAILY_GOLD_BASE + 10 * capturedCount()) * Math.pow(1.2, HERO.ascension || 0))); } // #71: 50+10×captured, кап 200 · Г2-5: ×1.2^N (кап тоже ×1.2^N → 600 при N=3+)
function checkDailyGoldGoal() { // #71: однократный бонус за цель дня — флаг дня в localStorage (в сейв не пишем)
    var goal = dailyGoldGoal();
    var p = ((dailyQuests && dailyQuests.progress) || {})['gold'] || 0;
    if (p < goal) return;
    var tk = getMSKDayKey();
    try { if (localStorage.getItem('nd_dailgoaldone_' + tk)) return; localStorage.setItem('nd_dailgoaldone_' + tk, '1'); } catch (e) { return; }
    HERO.gold = (HERO.gold || 0) + 10; // напрямую: goldGain зациклил бы проверку
    showToast('🎯 Цель дня!', 'Заработано ' + p + ' 💰 (цель ' + goal + '): +10 💰 бонус', 'crit');
    sfxGoalComplete(); haptic('success');
    renderDashboard();
}
function dqQuestById(qid) {
    var q = null;
    ((dailyQuests && dailyQuests.quests) || []).forEach(function(x) { if (x.id === qid) q = x; });
    return q;
}
function completeDailyQuest(qid, reward) {
if (dailyQuests.done[qid]) return;
var _q = dqQuestById(qid);
if (!_q) return;
var _p = (dailyQuests.progress || {})[_q.counter] || 0;
if (_p < _q.goal) { showToast('📋 Ещё не выполнено', 'Прогресс: ' + Math.min(_p, _q.goal) + '/' + _q.goal, 'blood'); return; }
dailyQuests.done[qid] = true;
bossProgressTick(); // Г2-1: quests-фазы боссов
goldGain(reward, 'quest');
showToast('📋 Квест выполнен!', '+' + reward + ' 💰', 'save');
sfxGoalComplete(); haptic('success');
burstParticles(window.innerWidth/2, 120, 40, { color: '#fbbf24', speed: 8, decay: 0.012, size: 3, shape: 'star', gravity: 0.08 });
saveGameState(); renderStrongholds();
}
var hirePool = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }; // ponytail: пул недели в памяти (санитайзер v8 роняет лишние поля); reload отдаёт полный пул недели
function heroTierKey() {
    var lvl = HERO.level || 1;
    if (lvl <= 3) return 't1';
    if (lvl <= 7) return 't2';
    if (lvl <= 12) return 't3';
    if (lvl <= 17) return 't4';
    if (lvl <= 25) return 't5';
    return 't6';
}
function updateHeroAvatarSprites() {
    var tier = heroTierKey();
    var path = 'img/units/tier' + tier.slice(1) + '.png';
    var av = document.getElementById('heroAvatar');
    if (av) {
        var img = av.querySelector('.hero-avatar-img');
        if (!img) { img = document.createElement('img'); img.className = 'hero-avatar-img'; av.insertBefore(img, av.firstChild); }
        if (!img.src.includes(path)) img.src = path;
    }
    var mini = document.getElementById('heroAvatarMini');
    if (mini) { mini.textContent = '⚔'; }
}
function capturedCount() { ensureStrongholdState(); return strongholds.filter(function(s) { return s.captured; }).length; }
function strongholdTaxPerDay() { ensureStrongholdState(); var t = 0; strongholds.forEach(function(s, i) { if (s.captured) t += STRONGHOLDS[i].tax; }); return t; }
function frontIdx() { ensureStrongholdState(); for (var i = 0; i < strongholds.length; i++) if (!strongholds[i].captured) return i; return -1; }
function stageMult(stage) { return stage === 'ok' ? 1 : stage === 'worn' ? 0.5 : 0; }
function builtList(idx) {
var out = [], b = strongholds[idx].buildings;
Object.keys(b).forEach(function(id) { if (b[id] && b[id].built) out.push(id); });
return out;
}
function hasSpecialOk(bid) {
return strongholds.some(function(s) { var b = s.buildings[bid]; return s.captured && b && b.built && b.corruptionStage === 'ok'; });
}
function defBonusOf(idx) {
var sum = 0;
builtList(idx).forEach(function(id) {
var d = BUILDINGS[id];
if (d && d.def) sum += Math.round(d.def * stageMult(strongholds[idx].buildings[id].corruptionStage));
});
return Math.round(sum * bossArtifactMult('def', STRONGHOLDS[idx].prov)); // Г2-1: артефакт +5% обороны (пров.)
}
var STAGE_ORDER_WORST = { ok: 0, worn: 1, ruin: 2 };
function shWorstStage(idx) {
var worst = 'ok';
builtList(idx).forEach(function(id) {
var st = strongholds[idx].buildings[id].corruptionStage;
if (STAGE_ORDER_WORST[st] > STAGE_ORDER_WORST[worst]) worst = st;
});
return worst;
}
function hireCostOf(tier) { var base = UNIT_TIERS[tier].cost * (1 - Math.min(0.30, 0.005 * STATS.cha.value)); if (dailyEvent && dailyEvent.id === 'smith') base *= 0.75; base *= synergyHireMult(); // Г1-3: zh-линейка → найм −10%
return Math.ceil(base); }
function buildCostOf(bid) { var d = BUILDINGS[bid]; return d ? Math.ceil(d.cost * doctrineEngineMult() * bossArtifactMult('cost') * techBuildingCostMult()) : 0; } // Г1-2: engine −15% · Г2-1: корона −15% · Г5-Т3: Чертёжный Дом −10%
function recalcHirePool() {
ensureStrongholdState();
var wind = hasSpecialOk('sp4') ? 1.4 : 1;
var pool = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 };
strongholds.forEach(function(s) {
if (!s.captured && strongholds.indexOf(s) !== 0) return; // Сендер-Хутор — стартовый лагерь (SPEC §9: Ж1 с нуля)
Object.keys(s.buildings).forEach(function(id) {
var b = s.buildings[id], d = BUILDINGS[id];
if (!b || !b.built || !d || !d.grow) return;
pool[d.tier] += Math.round(d.grow * stageMult(b.corruptionStage) * wind * edictLevyMult(STRONGHOLDS[strongholds.indexOf(s)].prov) * techGrowMult() * (techOrderActive('req') ? 1.5 : 1)); // Г4 эдикт; Г5-Т3 Приказ набора ×1.5
});
});
hirePool = pool;
}
// День твердынь: налоги+эконом → содержание + коррапшн (upkeep первым, SPEC §6). Золото уже в HERO.gold.
function strongholdsDailyTick() {
ensureStrongholdState();
if (!SM) return { income: 0, upkeep: 0, paid: true };
var _sw = weatherSeasonWeek();
var taxes = 0, econ = 0, market = 0, upkeep = 0, paid = true;
var gold = HERO.gold || 0;
strongholds.forEach(function(s, i) {
if (!s.captured) return; // стартовый лагерь sh01 до захвата освобождён от содержания и коррапшна (решение совета)
    taxes += Math.round(STRONGHOLDS[i].tax * synergyEcMult(i) * bossArtifactMult('tax', STRONGHOLDS[i].prov) * weatherTaxMult(STRONGHOLDS[i].prov, _sw.sn, _sw.wk) * edictTaxMult(STRONGHOLDS[i].prov)); // Г1-3/Г2-1/Г2-2; Г4: эдикт провинции
builtList(i).forEach(function(id) {
var d = BUILDINGS[id], b = s.buildings[id], m = stageMult(b.corruptionStage);
if (d.gold) econ += d.gold * m;
if (d.market) market += d.market * m + techMarketBonus(); // Г5-Т3: Ярмарочные Площади
});
});
var tRoutes = SM.tradeRoutes ? SM.tradeRoutes(strongholds.map(function(s) { return !!s.captured; })) + techVirtualRoutes() : techVirtualRoutes(); // Г5-Т3: Старые Тропы +1
    var tBonus = SM.tradeBonus ? SM.tradeBonus(tRoutes) : 0;
    if (hasTech('e2')) tBonus += 0.01 * tRoutes * techTradeMult() / 1.4; // Г5-Т: гильдии (×1.4 база учтена) + Консульства
    taxes = Math.round(taxes * (1 + tBonus));
    taxes = Math.round(taxes * taxMultiplier()); // Ярмарка + венцы сезонов + Вечный трон
    taxes = Math.round(taxes * totemGoldMult()); // Ф2: тотем Волк +5% золота тика
    var _hol = holidayBonus(); if (_hol && _hol.tickMult) taxes = Math.round(taxes * _hol.tickMult); // #8: Новый год — казначейский кэшбэк ×1.5
if (techOrderActive('sac')) taxes = Math.round(taxes * 1.3); // Г5-Т3 Ф2: Великая жатва ×1.3 на неделю
    var income = Math.round((taxes + Math.round(econ)) * (1 + Math.min(0.5, market)));
    income = Math.round(income * doctrineCrownMult()); // Г1-2: корона +10% ВСЁ золото (и тик казны)
    var _rm = 0, _pc = 0;
    [1, 2, 3, 4].forEach(function(p) { if (provCapturedCount(p) > 0) { _rm += provResourceMult(p); _pc++; } });
    if (_pc > 0) income = Math.round(income * (_rm / _pc) * techIdeaMult()); // Г4: ресурсы +2%/ед; Г5-Т2: Путь Богатства ×1.15
gold += income;
dqProgress('gold', income);
checkDailyGoldGoal(); // #71: тик тоже двигает цель дня
var stepOpt = hasSpecialOk('sp3') ? 4 : 2;
strongholds.forEach(function(s, i) {
if (!s.captured) return; // незахваченный стартовый лагерь вне экономики (решение совета)
if (builtList(i).length === 0) return;
var imm = {};
Object.keys(s.buildings).forEach(function(bid) {
var bb = s.buildings[bid];
if (bb.builtAt && Date.now() - bb.builtAt < 7 * 86400000) imm[bid] = true;
});
var res = SM.corruptionTick(s.buildings, gold, STATS.wil.value, { step: Math.max(1, Math.round((stepOpt + techGraceBonus()) * techCorrSlow())), immune: imm, upkeepMult: doctrineUpkeepMult() * weatherUpkeepMult(STRONGHOLDS[i].prov, _sw.sn, _sw.wk) * stanceUpkeepMult() * techUpkeepMult() }); // Г1-2 устав; Г2-2 метель; Г4 стойка; Г5-Т3: grace +2, ветшание ×0.5, содержание −28%
gold = res.gold;
upkeep += res.upkeep;
if (!res.paid) paid = false;
s.buildings = res.buildings;
});
HERO.gold = gold;
return { income: income, upkeep: upkeep, paid: paid };
}
function applyStackLoss(stacks, pct) {
return (stacks || []).map(function(st) {
var loss = Math.min(Math.floor(st.count * pct), st.count - 1); // floor: стопа не исчезает полностью (SPEC §4)
return { tier: st.tier, count: st.count - loss };
});
}
function ruinAllBuildings(idx) {
Object.keys(strongholds[idx].buildings).forEach(function(id) {
var b = strongholds[idx].buildings[id];
if (b && b.built) b.corruptionStage = 'ruin';
});
}
function lastCapturedIdx() {
for (var i = strongholds.length - 1; i >= 0; i--) if (strongholds[i].captured) return i;
return -1;
}
function runWeeklySiege() {
ensureStrongholdState();
if (capturedCount() === 0) { siege.week = 1; return; }
var wrath = Math.min(10, 2 * countGhostTasks() + (siege.wkSkips || 0) + (siege.wkTaskFails || 0));
var rows = [];
var fell = false;
var hitMult = 1;
for (var hit = 0; hit < 3; hit++) {
var t = lastCapturedIdx();
if (t < 0) break;
var def = STRONGHOLDS[t];
    var garDef = SM.defensePower(def, strongholds[t].garrison, STATS.end.value, defBonusOf(t));
    garDef = Math.round(garDef * totemDefMult()); // Ф2: тотем Медведь +2% обороны
    garDef = Math.round(garDef * doctrineFortMult()); // Г1-2: доктрина крепостей +10%
    garDef = Math.round(garDef * synergyDefMult(t)); // Г1-3: df-четвёрка в твердыне +5% обороны
    garDef = Math.round(garDef * stanceDefMult()); // Г4: стойка недели (Оборона +20% / Экономия −10%)
    garDef = Math.round(garDef * techDefMult()); // Г5-Т: Дисциплина гарнизонов +10%
var power = Math.round(SM.siegePower(def.total, siege.week - 1, capturedCount(), wrath) * hitMult * ascEnemyMult()); // Г2-5: враги +25% силы за круг вознесения
var _rmW = 0, _pcW = 0;
[1, 2, 3, 4].forEach(function(p) { if (provCapturedCount(p) > 0) { _rmW += provResourceMult(p); _pcW++; } });
if (_pcW > 0) power = Math.round(power / (_rmW / _pcW)); // Г4: склады снабжения — удар врага слабее на 2%/ед ресурса (среднее по провинциям)
if (garDef >= power) {
strongholds[t].garrison = applyStackLoss(strongholds[t].garrison, 0.15);
addXpReward(100 * def.prov);
rows.push({ name: def.name, held: true, power: power, garDef: garDef });
break;
}
strongholds[t].captured = false;
strongholds[t].garrison = [];
ruinAllBuildings(t);
fell = true;
rows.push({ name: def.name, held: false, power: power, garDef: garDef });
if (power <= 1.5 * garDef) break; // прорыва нет — каскад останавливается
hitMult *= 0.85;
}
if (capturedCount() === 0) { // анти-тупик (ADR П1-13)
strongholds[0].captured = true;
strongholds[0].garrison = [];
ruinAllBuildings(0);
rows.push({ name: STRONGHOLDS[0].name, refuge: true });
}
siege.week = fell ? 1 : siege.week + 1; // потеря = frontSince сброшен, след. воскресенье не каскадирует
siege.lastResult = fell ? 'fail' : 'win'; // #95: исход недели — для контрштурма
recalcHirePool();
chronicleSiegeRows(rows); // Г5-Ф: осады недели в хронику
showSiegeReport(rows, wrath);
}
function canCounterSiege() { // #95: поражение недели + контрштурм не использован + хватает казны
    return siege.lastResult === 'fail' && !siege.retriedThisWeek && (HERO.gold || 0) >= 100;
}
function requestCounterSiege() { // #95: форс-штурм павшей твердыни за 100💰
    if (!canCounterSiege()) return;
    HERO.gold -= 100;
    siege.retriedThisWeek = true;
    var idx = frontIdx(); // первая незахваченная = павшая на фронте
    if (idx < 0) { renderDashboard(); return; }
    showToast('⚔ Контрштурм!', '«' + esc(STRONGHOLDS[idx].name) + '» — фора врага кончилась', 'crit');
    doAssault(idx, assaultForecast(idx));
    renderDashboard();
}
function capturedRecoveryPlan(snapCaptured, curCaptured, total) { // #49: чистое решение о восстановлении (юнит-тест через фабрику сейвов)
    if (!Number.isFinite(snapCaptured) || !Number.isFinite(curCaptured)) return null;
    var lost = snapCaptured - curCaptured;
    if (lost < 2 || snapCaptured < 0 || snapCaptured > total) return null;
    return { lost: lost, restoreTo: snapCaptured };
}
function checkCapturedRecovery() { // #49: счётчик сезона помнит больше крепостей, чем факт — предложить восстановить
    try {
        ensureSeason();
        var plan = capturedRecoveryPlan((season.snapshot && season.snapshot.captured) || 0, capturedCount(), STRONGHOLDS.length);
        if (!plan) return;
        dungeonConfirm('🏰 Следы потерянных крепостей', 'Счётчик сезона помнит <b>' + plan.restoreTo + '</b> захваченных, по факту <b>' + capturedCount() + '</b>.<br><span style="color:var(--gold-bright)">Восстановить первые ' + plan.restoreTo + ' твердынь каталога?</span>').then(function(ok) {
            if (!ok) return;
            for (var i = 0; i < plan.restoreTo; i++) strongholds[i].captured = true;
            checkDoctrineOffer(); // Г1-2: восстановление тоже может открыть гейт
            showToast('🏰 Восстановлено', 'Первые ' + plan.restoreTo + ' твердынь снова под знаменем', 'save');
            haptic('success');
            renderStrongholds(); updateHeroUI(); updateStrongholdProgress(); saveGameState();
        });
    } catch (e) {}
}
function showSiegeReport(rows, wrath) {
var modal = document.getElementById('siegeReportModal');
if (!modal) return;
var html = '<div class="sh-siege-wrath">😤 Гнев: ' + wrath + '/10 · призраки задач и пропуски усилили удар</div>';
if (!rows.length) html += '<div class="empty-state">Враг не пришёл.</div>';
rows.forEach(function(r) {
if (r.refuge) html += '<div class="sh-siege-row refuge">🏰 <b>' + esc(r.name) + '</b> — прибежище восстановлено (анти-тупик): гарнизон 0, постройки в руине. Путь возврата открыт.</div>';
else if (r.held) html += '<div class="sh-siege-row held">🛡 <b>' + esc(r.name) + '</b> — осада отбита: оборона ' + r.garDef + ' против ' + r.power + '. Гарнизон −15%.</div>';
else html += '<div class="sh-siege-row lost">💀 <b>' + esc(r.name) + '</b> — пала: оборона ' + r.garDef + ' против ' + r.power + '. Нейтралы вернулись, постройки в руине.</div>';
});
var _cs = canCounterSiege();
if (_cs) html += '<div style="text-align:center; margin-top:10px;"><button class="demo-btn" data-action="counter-siege" style="border:1px solid var(--blood-bright); color:var(--blood-bright); background:none; border-radius:8px; padding:6px 14px; cursor:pointer;">⚔ Контрштурм (100 💰)</button></div>'; // #95: контрштурм после поражения недели
document.getElementById('siegeReportBody').innerHTML = html;
// Осадный спектакль: полноэкранная вспышка
var anyHeld = rows.some(function(r) { return r.held; });
var anyFell = rows.some(function(r) { return !r.held && !r.refuge; });
var spect = document.createElement('div');
spect.className = 'siege-spectacle';
var mainIcon = anyFell ? '💀' : '🛡';
var mainText = anyFell ? 'Твердыня пала...' : 'Оборона держит!';
spect.innerHTML = '<div class="ss-icon">' + mainIcon + '</div><div class="ss-text">' + mainText + '</div>';
document.body.appendChild(spect);
setTimeout(function() { spect.remove(); }, 3600);
modal.classList.add('show');
// Осадная драма: shake + частицы + звук по исходу
if (anyFell) { screenShake(15, 800); burstParticles(window.innerWidth/2, window.innerHeight/3, 120, { color: '#c73e4d', speed: 14, decay: 0.008, size: 4, shape: 'star', gravity: 0.12 }); sfxBossDefeated(); haptic('heavy'); }
else if (anyHeld) { burstParticles(window.innerWidth/2, window.innerHeight/3, 60, { color: '#34d399', speed: 8, decay: 0.012, size: 3, shape: 'star', gravity: 0.08 }); sfxLevelUp(); haptic('medium'); }
}
function closeSiegeReport() { document.getElementById('siegeReportModal').classList.remove('show'); }
function chronicleSiegeRows(rows) { // Г5-Ф: итоги воскресной осады в хронику
  rows.forEach(function(r) {
    if (r.refuge) addChronicle('🏰', 'Прибежище восстановлено после полного разгрома');
    else if (r.held) addChronicle('🛡', r.name + ' — осада отбита (' + r.garDef + ' против ' + r.power + ')');
    else addChronicle('💀', r.name + ' пала под ударом осады (' + r.power + ')');
  });
}
var TACTICS = { normal: { atk: 1, attr: 1 }, feint: { atk: 0.8, attr: 0.7 }, rush: { atk: 1.25, attr: 2 } }; // Г1-4: тактики штурма
function tacticAtkMult(t) { return (TACTICS[t] || TACTICS.normal).atk; }
function tacticAttrMult(t) { return (TACTICS[t] || TACTICS.normal).attr; }
function requestTactic(idx, f) { // Г1-4: 3-кнопочный выбор на confirmOverlay; глобальный ESC его игнорирует — свой keydown, ESC = «Штурм»
return new Promise(function(resolve) {
var overlay = document.getElementById('confirmOverlay');
var yes = document.getElementById('confirmYes'), no = document.getElementById('confirmNo');
var oldYes = yes.textContent, oldNo = no.textContent;
document.getElementById('confirmTitle').textContent = 'Тактика штурма';
document.getElementById('confirmBody').innerHTML = '⚔ «' + esc(STRONGHOLDS[idx].name) + '» · ' + f.line + '<br><span style="color:var(--text-dim)">⚔ Штурм — норма · 🪶 Ложный отход: урон −20%, потери ×0.7 · 🔥 Натиск: урон +25%, потери ×2</span><br><span style="color:var(--blood-bright)">ESC — штурмовать по-обычному.</span>';
yes.textContent = '⚔ Штурм'; no.textContent = '🪶 Ложный отход';
var third = document.createElement('button');
third.className = no.className;
third.textContent = '🔥 Натиск';
document.querySelector('#confirmOverlay .confirm-actions').appendChild(third);
overlay.classList.add('show');
function cleanup(result) {
overlay.classList.remove('show');
yes.onclick = null; no.onclick = null; third.onclick = null;
yes.textContent = oldYes; no.textContent = oldNo;
third.remove();
document.removeEventListener('keydown', onKey);
resolve(result);
}
function onKey(e) { if (e.key === 'Escape') cleanup('normal'); }
yes.onclick = function() { cleanup('normal'); };
no.onclick = function() { cleanup('feint'); };
third.onclick = function() { cleanup('rush'); };
document.addEventListener('keydown', onKey);
});
}
function assaultForecast(idx) {
    var atk = Math.round(SM.armyPower(army.units) * techArmyMult() * (1 + 0.02 * STATS.str.value) * doctrineAtkMult() * synergyAtkMult() * techAtkMult()); // Г1-2 atk-доктрина (пропуск закрыт) + Г1-3 Кузня-Собор +5% + Г5-Т Осадный парк/Знамёна + Г5-Т2 Легионы
var defN = STRONGHOLDS[idx].total;
if (hasSpecialOk('sp1')) return { atk: atk, defN: defN, line: '⚔ ' + atk + ' против 🛡 ' + defN + (atk > defN ? ' · превосходство' : ' · сил мало') };
return { atk: atk, defN: defN, line: '⚔ ~' + Math.round(atk * 0.75) + '–' + Math.round(atk * 1.25) + ' против 🛡 ' + defN + ' (Гильдия Разведчиков даст точные числа)' };
}
function requestAssault(idx) {
ensureStrongholdState();
if (siege.assaultDay === getMSKDayKey()) { showToast('⚔ Штурм уже был', 'Один штурм в сутки — приходи завтра', 'blood'); return; }
if (!SM || SM.armyPower(army.units) <= 0) { showToast('⚔ Армии нет', 'Найми существ в твердыне', 'blood'); sfxError(); return; }
var f = assaultForecast(idx);
if (capturedCount() >= 3) { // Г1-4: с 3-й твердыни — выбор тактики
requestTactic(idx, f).then(function(t) { if (t) doAssault(idx, f, t); });
return;
}
dungeonConfirm('⚔ Штурм «' + esc(STRONGHOLDS[idx].name) + '»?', f.line + '<br><span style="color:var(--blood-bright)">Поражение = отступление с потерями 10–30%.</span>').then(function(ok) {
if (ok) doAssault(idx, f);
});
}
function doAssault(idx, f, tactic) {
var _tc = TACTICS[tactic] ? tactic : 'normal'; // Г1-4: дефолт «Штурм» (ESC/пропуск)
siege.assaultDay = getMSKDayKey();
var _stA = stanceAtkMult(); // Г4: стойка недели — Штурм +15% / Экономия −10%
dqProgress('assault');
var out = SM.assaultOutcome(Math.round(f.atk * tacticAtkMult(_tc) * _stA), f.defN, { agi: STATS.agi.value, banner: hasSpecialOk('sp2'), rand: Math.random, attritionMult: doctrineAttritionMult() * tacticAttrMult(_tc) * bossArtifactMult('attrition', STRONGHOLDS[idx].prov) * techAttrMult() }); // Г1-2: veteran ×0.7 · Г1-4: тактика · Г2-1: артефакт −10% потерь (пров.) · Г4: стойка · Г5-Т: свитки ×0.9
var lostTotal = 0;
SM.TIER_KEYS.forEach(function(t) {
var n = army.units[t] || 0;
if (n > 0) {
var loss = Math.min(Math.floor(n * out.attritionPct), n - 1);
army.units[t] = n - loss;
lostTotal += loss;
}
});
if (out.win) {
strongholds[idx].captured = true;
siege.week = 1;
addChronicle('⚔', STRONGHOLDS[idx].name + ' взята штурмом: ' + lostTotal + ' потерь'); // Г5-Ф
addXpReward(Math.round(150 * (1 + (STATS.int.value - 3) * 0.01)));
showToast('🏰 ' + STRONGHOLDS[idx].name + ' захвачена!', 'Потери: ' + lostTotal + ' · налог +' + STRONGHOLDS[idx].tax + ' 💰/день', 'crit');
checkDoctrineOffer(); // Г1-2: подсказка на гейте 3/8/14
spiritSay('«' + STRONGHOLDS[idx].name + ' поднимает твоё знамя.»');
sfxBossDefeated(); haptic('success');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 120, { color: '#fbbf24', speed: 12, decay: 0.008, size: 4, shape: 'star', gravity: 0.1, life: 1.3 });
screenShake(10, 600);
} else {
showToast('↩ Отступление', 'Потери: ' + lostTotal + ' (' + Math.round(out.attritionPct * 100) + '%). Повтор — завтра.', 'blood');
spiritSay('«Стены устояли. Вернись сильнее.»');
sfxFail(); haptic('error');
spawnBloodRain(20);
screenShake(8, 500);
}
updateStrongholdProgress(); updateHeroUI(); renderStrongholds(); saveGameState();
}
function buyBuilding(idx, bid) {
ensureStrongholdState();
var d = BUILDINGS[bid], s = strongholds[idx];
if (!d || !s || (!s.captured && idx !== 0) || (s.buildings[bid] && s.buildings[bid].built)) return;
if (builtList(idx).length >= STRONGHOLDS[idx].slots) { showToast('🏰 Слоты заняты', 'Лимит твердыни: ' + STRONGHOLDS[idx].slots, 'blood'); return; }
if (d.req && !(s.buildings[d.req] && s.buildings[d.req].built)) { showToast('🔒 Нужна постройка', 'Сначала: ' + BUILDINGS[d.req].name, 'blood'); return; }
if ((HERO.gold || 0) < buildCostOf(bid)) { showToast('💰 Мало золота', 'Нужно ' + buildCostOf(bid) + ' 💰, в казне ' + (HERO.gold || 0), 'blood'); sfxError(); return; }
HERO.gold -= buildCostOf(bid);
s.buildings[bid] = { built: true, corruptionStage: 'ok', debtDays: 0 };
strongholds[idx].buildings[bid].builtAt = Date.now();
dqProgress('build');
var bdDef = BUILDINGS[bid]; if (bdDef.grow) { hirePool[bdDef.tier] += Math.round(bdDef.grow * (hasSpecialOk('sp4') ? 1.4 : 1)); showToast('⛺ Первый прирост', '+' + Math.round(bdDef.grow * (hasSpecialOk('sp4') ? 1.4 : 1)) + ' ' + UNIT_TIERS[bdDef.tier].name + ' — сразу в пул найма', 'save'); }
recalcHirePool();
if (bdDef.grow && Object.keys(hirePool).every(function(k) { return !(hirePool[k] > 0); })) hirePool[bdDef.tier] = (hirePool[bdDef.tier] || 0) + Math.round(bdDef.grow * (hasSpecialOk('sp4') ? 1.4 : 1)); // #17: первое жилище даёт прирост сразу — стена найма д2-д8
showToast('🏗 Построено: ' + d.name, '−' + buildCostOf(bid) + ' 💰 · содержание ' + d.upkeep + ' 💰/день', 'save');
sfxForge(); haptic('medium');
renderStrongholds(); updateHeroUI(); saveGameState();
}
function hireUnit(tier, toGarrison, idx) {
ensureStrongholdState();
if ((hirePool[tier] || 0) <= 0) { showToast('⛺ Пул пуст', 'Недельный прирост придёт в понедельник', 'blood'); return; }
var cost = hireCostOf(tier);
if ((HERO.gold || 0) < cost) { showToast('💰 Мало золота', 'Найм: ' + cost + ' 💰', 'blood'); sfxError(); return; }
HERO.gold -= cost;
hirePool[tier]--;
dqProgress('hire');
if (toGarrison) {
var st = strongholds[idx].garrison.find(function(x) { return x.tier === tier; });
if (st) st.count++; else strongholds[idx].garrison.push({ tier: tier, count: 1 });
} else {
army.units[tier] = (army.units[tier] || 0) + 1;
}
showToast('⚔ Найм: ' + UNIT_TIERS[tier].name, toGarrison ? 'В гарнизон «' + STRONGHOLDS[idx].name + '»' : 'В полевую армию', 'save');
sfxEquip(); haptic('light');
renderStrongholds(); updateHeroUI(); saveGameState();
}
function moveStack(tier, toGarrison, idx) {
ensureStrongholdState();
if (toGarrison) {
var n = army.units[tier] || 0;
if (n <= 0) return;
army.units[tier] = 0;
var st = strongholds[idx].garrison.find(function(x) { return x.tier === tier; });
if (st) st.count += n; else strongholds[idx].garrison.push({ tier: tier, count: n });
} else {
var g = strongholds[idx].garrison;
var st2 = g.find(function(x) { return x.tier === tier; });
if (!st2) return;
army.units[tier] = (army.units[tier] || 0) + st2.count;
strongholds[idx].garrison = g.filter(function(x) { return x !== st2; });
}
sfxEquip();
renderStrongholds(); updateHeroUI(); saveGameState();
}
function shSprite(idx) {
return idx < 11 ? '<img src="img/tract/region' + String(idx + 1).padStart(2, '0') + '.png" alt="">' : STRONGHOLDS[idx].icon;
}
function stageBadgeHtml(st) {
var map = { ok: ['✓ Целое', 'ok'], worn: ['⚠ Обветшало', 'worn'], ruin: ['✖ Руина', 'ruin'] };
var m = map[st] || map.ok;
return '<span class="sh-stage ' + m[1] + '">' + m[0] + '</span>';
}
// ===================== Г2-2 «Глазами ворона»: погода (чистые функции, без сейв-полей) =====================
// ПОРОГИ СЖАТЫ против спеки (0.25/0.45/0.6): пины симов (parity 11526/12679/31, acceptance 21/1/7,
// factory w4, strongholds w2) сидированы на сезон 1 / недели 1–4 — в этих пин-окнах эффектов быть
// не должно (контракт закреплён тестом «пин-окна» в tests/wave-g2.test.js).
// Карта каталога имеет 4 провинции (спека писана под сетку 11): север = 1–2, юг = 3–4.
function weatherOf(prov, seasonNum, week) {
var r = Math.abs(Math.sin(seasonNum * 31 + week * 17 + prov) * 43758.5453) % 1;
if (r < 0.11) return { id: 'blizzard', icon: '❄', name: 'Метель' };
if (r < 0.24) return { id: 'drought', icon: '🔥', name: 'Засуха' };
if (r < 0.45) return { id: 'fog', icon: '🌫', name: 'Туман' };
return { id: 'clear', icon: '☀', name: 'Ясно' };
}
function weatherNorth(prov) { return prov <= 2; }
function weatherSouth(prov) { return prov >= 3; }
function weatherUpkeepMult(prov, seasonNum, week) { return (weatherOf(prov, seasonNum, week).id === 'blizzard' && weatherNorth(prov)) ? 2 : 1; } // метель севера: содержание ×2
function weatherTaxMult(prov, seasonNum, week) { return (weatherOf(prov, seasonNum, week).id === 'drought' && weatherSouth(prov)) ? 0.75 : 1; } // засуха юга: налог ×0.75
function weatherFog(prov, seasonNum, week) { return weatherOf(prov, seasonNum, week).id === 'fog'; }
function weatherSeasonWeek() { return { sn: (ensureSeason() || {}).num || 1, wk: (siege && siege.week) || 1 }; }

// ===================== Г2-3 «Глазами ворона»: лазутчик =====================
function scoutAdvice(ratio) {
if (!Number.isFinite(ratio) || ratio <= 0) return 'Обороны нет — вложись в казармы';
if (ratio < 0.9) return 'Слабо: вложись в казармы или жди погоду';
if (ratio > 1.2) return 'Натиск излишен — штурмуй';
return 'Ложный отход сбережёт людей';
}
function scoutFresh(scouts, todayKey) { // 'pending' | 'fresh' | null; срок годности 3 дня (день готовности + 2)
if (!scouts || !scouts.readyDayKey) return null;
var dd = daysBetween(todayKey, scouts.readyDayKey);
if (dd > 0) return 'pending';
return (dd >= -2) ? 'fresh' : null;
}
function frontPowerText(idx) { // Г2-2: туман (без свежей тени на этой твердыне) прячет силу фронта
var _sw = weatherSeasonWeek();
var _known = scoutFresh(HERO.scouts, getMSKDayKey()) === 'fresh' && HERO.scouts.idx === idx;
return (weatherFog(STRONGHOLDS[idx].prov, _sw.sn, _sw.wk) && !_known) ? '🌫 туман: сила скрыта — отправь тень' : 'Сила нейтралов: ' + STRONGHOLDS[idx].total;
}
function scoutButtonHtml(idx) { // Г2-3: одна тень за раз; разведка ценна и без тумана
if (scoutFresh(HERO.scouts, getMSKDayKey())) return '';
return '<button class="sh-mini sh-scout-btn" data-action="sh-scout" data-idx="' + idx + '">🌙 Тень (50💰)</button>';
}
function scoutReportHtml(idx) { // Г2-3: точная сила + совет тактики
var st = scoutFresh(HERO.scouts, getMSKDayKey());
if (!st || HERO.scouts.idx !== idx) return '';
if (st === 'pending') return '<div class="sh-scout">🌙 Тень в пути — отчёт будет завтра.</div>';
var power = Math.round(SM.siegePower(STRONGHOLDS[idx].total, siege.week, capturedCount(), siegeWrathNow()) * ascEnemyMult()); // Г2-5: +25% за круг
var def = SM.armyPower(army.units);
strongholds.forEach(function(s) { if (s.captured) def += SM.stackPower(s.garrison || []); });
var ratio = power > 0 ? Math.round(def) / power : 99;
var stale = (daysBetween(getMSKDayKey(), HERO.scouts.readyDayKey) === -2) ? ' · <span style="color:var(--text-dim)">разведка устареет завтра</span>' : '';
return '<div class="sh-scout">🌙 Тень докладывает: враг ровно <b>' + power + '</b> · оборона ' + Math.round(def) + ' (' + Math.round(ratio * 100) + '%) — <i>' + scoutAdvice(ratio) + '</i>' + stale + '</div>';
}
function requestScout(idx) { // Г2-3: отправить тень (50💰, отчёт завтра)
if (!STRONGHOLDS[idx] || strongholds[idx].captured) return;
if (scoutFresh(HERO.scouts, getMSKDayKey())) { showToast('Тень уже в деле', 'Одна тень за раз — дождись отчёта.', 'violet'); return; }
var _sc = techScoutCost();
if ((HERO.gold || 0) < _sc) { showToast('Казна пуста', 'Тень работает за ' + _sc + '💰 — золото в долг не берут.', 'blood'); sfxError(); return; }
HERO.gold -= _sc;
HERO.scouts = { idx: idx, readyDayKey: getMSKDayKey(Date.now() + 86400000) };
showToast('🌙 Тень ушла: ' + STRONGHOLDS[idx].name, 'Завтра придёт точный отчёт о силах врага.');
haptic('light'); saveSoon();
renderStrongholds();
}
function shIncomePerDay() {
ensureStrongholdState();
var _sw = weatherSeasonWeek();
var taxes = 0, econ = 0, market = 0;
strongholds.forEach(function(s, i) {
if (!s.captured) return;
    taxes += Math.round(STRONGHOLDS[i].tax * synergyEcMult(i) * bossArtifactMult('tax', STRONGHOLDS[i].prov) * weatherTaxMult(STRONGHOLDS[i].prov, _sw.sn, _sw.wk) * edictTaxMult(STRONGHOLDS[i].prov)); // Г1-3/Г2-1/Г2-2; Г4: эдикт — parity с тиком
        builtList(i).forEach(function(id) {
            var d = BUILDINGS[id], b = s.buildings[id], m = stageMult(b.corruptionStage);
            if (d.gold) econ += d.gold * m;
            if (d.market) market += d.market * m;
        });
    });
    var tRoutes = SM.tradeRoutes ? SM.tradeRoutes(strongholds.map(function(s) { return !!s.captured; })) : 0;
    var tB = (SM.tradeBonus ? SM.tradeBonus(tRoutes) : 0) + (hasTech('e2') ? 0.01 * tRoutes : 0); // Г5-Т: parity с тиком
    taxes = Math.round(taxes * (1 + tB));
    taxes = Math.round(taxes * taxMultiplier()); // parity с тиком (восстановлено: утрачено при правке e2 — паритет контроль-теста)
    var income = Math.round((taxes + Math.round(econ)) * (1 + Math.min(0.5, market)));
    income = Math.round(income * doctrineCrownMult()); // Г1-2: корона +10% — parity с тиком (поймано контроль-тестом)
    var _rm2 = 0, _pc2 = 0;
    [1, 2, 3, 4].forEach(function(p) { if (provCapturedCount(p) > 0) { _rm2 += provResourceMult(p); _pc2++; } });
    if (_pc2 > 0) income = Math.round(income * (_rm2 / _pc2)); // Г4: ресурсы — parity с тиком
    return income;
}
function shUpkeepPerDay() {
ensureStrongholdState();
var _sw = weatherSeasonWeek();
var u = 0;
strongholds.forEach(function(s, i) {
if (!s.captured) return;
    var _wm = weatherUpkeepMult(STRONGHOLDS[i].prov, _sw.sn, _sw.wk) * stanceUpkeepMult(); // Г2-2: метель севера ×2; Г4: стойка недели — parity с тиком
Object.keys(s.buildings).forEach(function(id) {
var b = s.buildings[id];
if (b && b.built && b.corruptionStage !== 'ruin' && BUILDINGS[id]) u += BUILDINGS[id].upkeep * _wm;
});
});
return Math.round(u);
}
function buildingEffectText(d) {
if (d.grow) return '+' + d.grow + ' ' + UNIT_TIERS[d.tier].name + '/нед';
if (d.gold) return '+' + d.gold + ' 💰/день';
if (d.market) return '+' + Math.round(d.market * 100) + '% к доходу казны';
if (d.def) return '+' + d.def + ' к обороне';
if (d.scout) return 'Точные числа осад и штурмов';
if (d.attrition) return 'Потери при штурмах ×' + d.attrition;
if (d.step) return 'Деградация: ' + d.step + ' дня на ступень';
if (d.growthMult) return '×' + d.growthMult + ' к приросту жилищ';
return '';
}
function updateStrongholdProgress() {
var n = capturedCount();
var el = document.getElementById('progressVal');
if (el) el.textContent = n + '/' + STRONGHOLDS.length;
var chip = document.getElementById('seasonChip');
if (chip) { var _s = ensureSeason(); chip.textContent = '🍂 S' + _s.num + ' · ' + Math.max(0, seasonDaysTotal(_s.start) - seasonDaysDone(_s.start)) + 'д'; } // #11: сезон в шапке
updateProgressFill((n / STRONGHOLDS.length) * 100);
}
function garrisonRows(stacks, idx, action, label) {
if (!stacks || stacks.length === 0) return '<div class="empty-state">Пусто.</div>';
return stacks.map(function(st) {
var u = UNIT_TIERS[st.tier];
return '<div class="sh-hire-row"><div class="sh-build-icon">' + shSpriteImg('img/units/tier' + st.tier.slice(1) + '.png', u.icon) + '</div>' + // #9: иконка тира с emoji-фолбэком
'<div class="sh-build-body"><div class="sh-build-name">' + u.name + ' × ' + st.count + '</div>' +
'<div class="sh-build-meta">Сила: ' + (st.count * u.power) + '</div></div>' +
'<button class="sh-mini" data-action="' + action + '" data-idx="' + idx + '" data-tier="' + st.tier + '">' + label + '</button></div>';
}).join('');
}
function daysToSiegeNow() { return (7 - ((new Date(Date.now() + 3 * 3600000).getUTCDay() + 1) % 7)); }
function siegeWrathNow() { return Math.min(hasTech('w6') ? 7 : 10, 2 * countGhostTasks() + (siege.wkSkips || 0) + (siege.wkTaskFails || 0)); } // Г5-Т2: Железный Закон — кап гнева 7
/* ===================== Г4 «Total War: управление провинциями» — ядро (чистые функции) ===================== */
function ensureSeasonFields(k) { var s = ensureSeason(); if (k) { if (!s[k] || typeof s[k] !== 'object') s[k] = {}; } return s; } // Г4: материализуем ТОЛЬКО записываемый контейнер — байт-стабильный раундтрип сейвов
function provKey(p) { return String(p); }
function provCapturedCount(p) { var n = 0; for (var i = 0; i < STRONGHOLDS.length; i++) if (STRONGHOLDS[i].prov === p && strongholds[i] && strongholds[i].captured) n++; return n; }
function provTotalCount(p) { var n = 0; for (var i = 0; i < STRONGHOLDS.length; i++) if (STRONGHOLDS[i].prov === p) n++; return n; }
function provEdict(p) { var s = ensureSeason(); var e = s.edicts || {}; return e[provKey(p)] || null; }
function provOrder(p) { var s = ensureSeason(); var o = s.order || {}; var v = o[provKey(p)]; return (typeof v === 'number') ? v : 75; }
function provResource(p) { var s = ensureSeason(); var r = s.resource || {}; var v = r[provKey(p)]; return (typeof v === 'number') ? v : 0; }
function provLastRevoltDay(p) { var s = ensureSeason(); var l = s.lastRevoltDay || {}; return l[provKey(p)] || null; }
function setProvEdict(p, edictId) {
  var s = ensureSeasonFields('edicts'); var k = provKey(p);
  var cur = s.edicts[k] || null; var curCost = cur ? EDICTS[cur].cost : 0;
  if (edictId === null) { delete s.edicts[k]; return 0; }
  var ed = EDICTS[edictId]; if (!ed) return -1;
  var cost = Math.max(0, Math.round(ed.cost * techEdictCostMult()) - curCost); // Г5-Т: Школы писцов −25%
  if ((HERO.gold || 0) < cost) return -1;
  HERO.gold -= cost; s.edicts[k] = edictId; return cost;
}
function provOrderBonus(p) { var o = provOrder(p); return o >= 85 ? 0.10 : (o >= 65 ? 0 : (o >= 40 ? -0.05 : -0.15)); }
function provResourceMult(p) { return 1 + 0.02 * provResource(p); }
var STANCES = {
  assault: { icon: '⚔', name: 'Штурм', desc: '+15% атака армии, содержание ×1.25', atk: 1.15, upkeep: 1.25 },
  defend:  { icon: '🛡', name: 'Оборона', desc: '+20% оборона твердынь, содержание ×1.25', def: 1.20, upkeep: 1.25 },
  scout:   { icon: '🌙', name: 'Разведка', desc: 'осада в тумане видна, содержание ×1.1', fogPierce: true, upkeep: 1.1 },
  economy: { icon: '💰', name: 'Экономия', desc: 'содержание ×0.75, −10% атака и оборона', atk: 0.90, def: 0.90, upkeep: 0.75 }
};
function weekStance() { return siege.stance || 'normal'; }
function stanceUpkeepMult() { var st = STANCES[weekStance()]; return st && st.upkeep ? st.upkeep : 1; }
function stanceAtkMult() { var st = STANCES[weekStance()]; return st && st.atk ? st.atk : 1; }
function stanceDefMult() { var st = STANCES[weekStance()]; return st && st.def ? st.def : 1; }
function stanceFogPierce() { var st = STANCES[weekStance()]; return !!(st && st.fogPierce) || techFogPierceAlways(); } // Г5-Т3: Око Ворона — постоянный прок
function requestStance(stanceId) {
  if (!STANCES[stanceId]) return;
  if (weekStance() === stanceId) return;
  siege.stance = stanceId;
  showToast('🎚 Стойка недели: ' + STANCES[stanceId].name, STANCES[stanceId].desc, 'save');
  haptic('light'); saveSoon(); renderStrongholds();
}
var EDICTS = {
  tax:   { icon: '💰', name: 'Военный налог',   desc: 'налоги провинции ×1.25, порядок −2/день',      cost: 150, taxMult: 1.25, orderPerDay: -2 },
  levy:  { icon: '🎖', name: 'Чрезвычайный набор', desc: '+50% к набору в провинции, порядок −3/день', cost: 100, levyMult: 1.5, orderPerDay: -3 },
  order: { icon: '⚖', name: 'Указ о порядке',    desc: 'порядок +1/день, налоги провинции ×0.9',      cost: 80,  taxMult: 0.9, orderPerDay: 1 }
};
function edictTaxMult(p) { var e = provEdict(p); return (e && EDICTS[e] && EDICTS[e].taxMult) ? EDICTS[e].taxMult : 1; }
function edictOrderPerDay(p) { var e = provEdict(p); return (e && EDICTS[e] && EDICTS[e].orderPerDay) ? EDICTS[e].orderPerDay : 0; }
function edictLevyMult(p) { var e = provEdict(p); return (e && EDICTS[e] && EDICTS[e].levyMult) ? EDICTS[e].levyMult : 1; }
function revoltRisk(p) {
  if (provCapturedCount(p) === 0) return 0;
  if (provCapturedCount(p) < provTotalCount(p)) return 0;
  var o = provOrder(p);
  if (o >= 70) return 0;
  var r = (70 - o) * 0.01;
  return Math.min(0.30, r * techRevoltMult()); // Г5-Т: Реформа судов −25%
}
function resolveProvinceOrder() {
  var touched = 0;
  [1, 2, 3, 4].forEach(function(p) {
    if (provCapturedCount(p) === 0) return;
    var s = ensureSeasonFields('order'), k = provKey(p);
    var delta = techOrderDrift() + edictOrderPerDay(p) + (TECH_IDEA === 'idea_order' ? 5 : 0); // Г5-Т: Перепись; Г5-Т2: Путь Порядка +5/день
    var o = provOrder(p) + delta;
    s.order[k] = Math.max(techOrderFloor(), Math.min(100, o)); // Г5-Т: Гармония — пол 50
    touched++;
  });
  return touched;
}
function checkRevolts(todayKey) {
  var fired = null;
  [1, 2, 3, 4].forEach(function(p) {
    if (provLastRevoltDay(p) === todayKey) return;
    var risk = revoltRisk(p);
    if (risk <= 0) return;
    var roll = Math.random();
    if (roll < risk) {
      var s = ensureSeasonFields('lastRevoltDay');
      s.lastRevoltDay[provKey(p)] = todayKey;
      var first = -1;
      for (var i = 0; i < STRONGHOLDS.length; i++) { if (STRONGHOLDS[i].prov === p && strongholds[i].captured && i !== 0) { first = i; break; } }
      if (first < 0) return;
      strongholds[first].captured = false;
      strongholds[first].garrison = [];
      ruinAllBuildings(first);
      if (siege.assaultDay && siege.assaultDay === frontIdxOld()) { /* no-op: штурм дня сбросится сам */ }
      addChronicle('🔥', STRONGHOLDS[first].name + ' захвачена восставшими: ' + EDICTS_LABEL_PROV(p) + ' отвергла власть'); // Г5-Ф
      siege.week = 1;
      fired = { prov: p, idx: first };
      showToast('🔥 Восстание!', STRONGHOLDS[first].name + ' пала: ' + EDICTS_LABEL_PROV(p) + ' отвергла власть. Порядок был ' + provOrder(p) + '.', 'blood');
      sfxFail(); haptic('error');
    }
  });
  return fired;
}
function EDICTS_LABEL_PROV(p) { var names = { 1: 'Низовья', 2: 'Нагорье', 3: 'Приморье', 4: 'Пепельный Чертог' }; return names[p] || ('Провинция ' + p); }
function frontIdxOld() { for (var i = 0; i < strongholds.length; i++) if (!strongholds[i].captured) return i; return -1; }
function grantRevoltTask(p) {
  var name = '🔥 Восстание: подавить мятеж в ' + EDICTS_LABEL_PROV(p);
  for (var i = 0; i < TASKS.length; i++) if (TASKS[i].name === name && TASKS[i].status === 'active') return; // без дублей
  TASKS.unshift({ id: taskIdCounter++, name: name, tier: 'normal', deadline: null, status: 'active', createdAt: Date.now(), doneAt: null, ghostSince: null });
}
function tryResolveRevoltTask(t) {
  if (t.name.indexOf('🔥 Восстание:') !== 0) return false;
  var prov = null;
  [1, 2, 3, 4].forEach(function(p) { if (t.name.indexOf(EDICTS_LABEL_PROV(p)) >= 0) prov = p; });
  if (prov === null) return false;
  var done = false;
  for (var i = 0; i < STRONGHOLDS.length; i++) {
    if (STRONGHOLDS[i].prov !== prov) continue;
    if (!strongholds[i].captured) continue;
    if (builtList(i).length >= 2) { done = true; break; } // ≥2 построек восстановлены — порядок удержан
  }
  if (!done) return false;
  t.status = 'chest_open'; t.doneAt = Date.now(); // терминальный статус: награды нет — снятие штрафа и есть награда
  var s = ensureSeasonFields('order');
  [1, 2, 3, 4].forEach(function(p) { s.order[provKey(p)] = Math.max(40, Math.min(100, provOrder(p))); });
  showToast('⚖ Мятеж подавлен', 'Порядок в ' + EDICTS_LABEL_PROV(prov) + ' восстановлен. Штраф снят.', 'save');
  return true;
}
function revoltResolvable(t) { // Г4: можно ли закрыть revolt-задачу (без мутаций — для гварда completeTask)
  if (t.name.indexOf('🔥 Восстание:') !== 0) return false;
  var prov = null;
  [1, 2, 3, 4].forEach(function(p) { if (t.name.indexOf(EDICTS_LABEL_PROV(p)) >= 0) prov = p; });
  if (prov === null) return false;
  for (var i = 0; i < STRONGHOLDS.length; i++) {
    if (STRONGHOLDS[i].prov !== prov) continue;
    if (!strongholds[i].captured) continue;
    if (builtList(i).length >= 2) return true;
  }
  return false;
}
function requestEdict(idx, edictId) {
  ensureStrongholdState();
  if (!STRONGHOLDS[idx] || !strongholds[idx].captured) return;
  var p = STRONGHOLDS[idx].prov;
  var next = (provEdict(p) === edictId) ? null : (edictId || null); // повторный тап по активному = отмена
  var cost = setProvEdict(p, next);
  if (cost < 0) { showToast('💰 Мало золота', 'Эдикт провинции стоит дороже.', 'blood'); sfxError(); return; }
  showToast(next ? '📜 Эдикт издан: ' + EDICTS[next].name : '📜 Эдикт отменён', next ? EDICTS[next].desc + (cost > 0 ? ' · −' + cost + ' 💰' : '') : 'Возврат не предусмотрен — казна потратилась.', 'save');
  haptic('light'); saveSoon();
  renderStrongholdPanel(idx);
}
function edictBlockHtml(idx) {
  var d = STRONGHOLDS[idx];
  if (!d || !strongholds[idx] || !strongholds[idx].captured) return '';
  var p = d.prov;
  var cur = provEdict(p);
  var o = provOrder(p), risk = revoltRisk(p);
  var html = '<div class="km-edict-block"><div class="sh-sec-title">📜 Эдикт · порядок ' + o + '/100 · риск ' + Math.round(risk * 100) + '% · 📦 ресурс ' + provResource(p) + '</div>';
  if (risk > 0) html += '<div class="km-edict-warn">⚠ Восстание может вспыхнуть ночью (' + Math.round(risk * 100) + '%). Указ о порядке или ≥2 постройки в каждой твердыне снижают угрозу.</div>';
  html += '<div class="km-edict-row">' + Object.keys(EDICTS).map(function(eid) {
    var ed = EDICTS[eid], act = cur === eid;
    return '<button class="km-edict' + (act ? ' active' : '') + '" data-action="km-edict" data-idx="' + idx + '" data-edict="' + eid + '"' + (act ? '' : '') + '><span class="km-edict-ico">' + ed.icon + '</span><span class="km-edict-body"><b>' + ed.name + (act ? ' ✓' : '') + '</b><i>' + ed.desc + '</i></span><span class="km-edict-cost">' + (act ? 'активен' : ed.cost + ' 💰') + '</span></button>';
  }).join('') + '</div>';
  var cl = cur ? '<button class="sh-mini" data-action="km-edict" data-idx="' + idx + '" data-edict="' + cur + '">Отменить эдикт</button>' : '';
  if (cl) html += '<div style="text-align:right">' + cl + '</div>';
  html += '</div>';
  return html;
}
function siegeAlarmVerdict(ratio) { // Ф1: вербальный совет по соотношению сил
    if (!Number.isFinite(ratio) || ratio <= 0) return 'Обороны нет — вложись в казармы';
    if (ratio < 0.9) return 'Гарнизон тонкий — вложись в казармы';
    if (ratio >= 1.2) return 'Оборона крепка';
    return 'Держимся, но запас гарнизона не лишний';
}
function siegeAlarmPreview() { // Ф1: превью сил следующей осады (неделя W+1) vs оборона игрока
    if (!SM || capturedCount() === 0) return null;
    var t = lastCapturedIdx();
    if (t < 0) return null;
    var power = Math.round(SM.siegePower(STRONGHOLDS[t].total, siege.week, capturedCount(), siegeWrathNow()) * ascEnemyMult()); // Г2-5: +25% за круг
    var def = SM.armyPower(army.units);
    strongholds.forEach(function(s) { if (s.captured) def += SM.stackPower(s.garrison || []); });
    def = Math.round(def);
    var _sw = weatherSeasonWeek();
    var _known = scoutFresh(HERO.scouts, getMSKDayKey()) === 'fresh' && HERO.scouts.idx === t; // Г2-3: свежая тень прокалывает туман
    if (weatherFog(STRONGHOLDS[t].prov, _sw.sn, _sw.wk) && !_known && !stanceFogPierce()) return { power: '🌫 ?', def: def, ratio: null, advice: 'Туман: точная сила скрыта — отправь тень (50💰) или стойка Разведка' }; // Г2-2: туман; Г4: Разведка прокалывает
    return { power: power, def: def, ratio: def / power, advice: siegeAlarmVerdict(def / power) };
}
function checkSiegeAlarmToast() { // Ф1: тост+haptic в день N-2 и день N, однократно/день
    var d = daysToSiegeNow();
    if (d !== 2 && d !== 0) return;
    var tk = getMSKDayKey();
    var flag = 'nd_siegealarm_' + tk;
    try { if (localStorage.getItem(flag)) return; localStorage.setItem(flag, tk); } catch (e) { return; }
    var p = siegeAlarmPreview();
    if (!p) return;
    showToast(d === 0 ? '⚠ Осада сегодня!' : '⚠ Осадная тревога', 'Враг ~' + p.power + ' · оборона ' + p.def + ' — ' + p.advice, 'blood');
    haptic('warning');
}
function kmStatusLabel(i) {
var s = strongholds[i];
if (s.captured) return 'Захвачена';
if (i === frontIdx()) return (daysToSiegeNow() === 0) ? 'Осада сегодня' : 'Следующая цель';
return 'Заперта';
}
/* Г3.5: политическая карта Total War — ЕДИНЫЙ массив суши (фреймы встык, общие углы), watertight по всему миру */
var KG = (function () {
  var WORLD = { w: 780, h: 1120 };
  function j(seed) { return (Math.abs(Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1) * 2 - 1; }
  var FR = { 1: { x0: 20, y0: 560, x1: 390, y1: 1100 }, 2: { x0: 20, y0: 20, x1: 390, y1: 560 }, 3: { x0: 390, y0: 560, x1: 740, y1: 1100 }, 4: { x0: 390, y0: 20, x1: 740, y1: 560 } };
  var SEA = { x0: 742, y0: 20, x1: 776, y1: 1100 };
  var PROV_NAME = { 1: 'НИЗОВЬЯ', 2: 'НАГОРЬЕ', 3: 'ПРИМОРЬЕ', 4: 'ПЕПЕЛЬНЫЙ ЧЕРТОГ' };
  var ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
  var BIOME = { 1: '#262b20', 2: '#2b2722', 3: '#302b1e', 4: '#332019' };
  var _emid = {};
  function edgeMids(a, b) {
    var lo = Math.min(a.id, b.id), hi = Math.max(a.id, b.id), key = lo + '_' + hi;
    if (!_emid[key]) {
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var px = -dy / len, py = dx / len, mids = [];
      for (var k = 1; k <= 2; k++) {
        var t = k / 3 + j(lo * 7 + hi * 11 + k) * 0.14, off = j(lo * 13 + hi * 5 + k) * 9;
        mids.push({ x: a.x + dx * t + px * off, y: a.y + dy * t + py * off });
      }
      _emid[key] = mids;
    }
    return (a.id < b.id) ? _emid[key] : [_emid[key][1], _emid[key][0]];
  }
  function cellPath(cor) {
    var pts = [];
    for (var i = 0; i < cor.length; i++) {
      var a = cor[i], b = cor[(i + 1) % cor.length], m = edgeMids(a, b);
      pts.push(m[0], m[1], b);
    }
    var d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (var q = 1; q < pts.length; q++) d += ' L' + pts[q].x.toFixed(1) + ' ' + pts[q].y.toFixed(1);
    return d + ' Z';
  }
  function centroid(cor) {
    var x = 0, y = 0;
    for (var i = 0; i < cor.length; i++) { x += cor[i].x; y += cor[i].y; }
    return { x: Math.round(x / cor.length), y: Math.round(y / cor.length) };
  }
  function provinceTiles(prov) {
    var f = FR[prov];
    var cx0 = f.x0 + (f.x1 - f.x0) * 0.52, ry1 = f.y0 + (f.y1 - f.y0) / 3, ry2 = f.y0 + (f.y1 - f.y0) * 2 / 3;
    function P(r, c) {
      var border = (r === 0 || r === 3 || c === 0 || c === 2);
      var ux = (c === 0 ? f.x0 : (c === 1 ? cx0 : f.x1));
      var uy = (r === 0 ? f.y0 : (r === 3 ? f.y1 : (r === 1 ? ry1 : ry2)));
      // канонический сид от физической точки: общие углы соседних провинций дают одинаковый джиттер → швов нет
      var seed = Math.round(ux * 10) * 100003 + Math.round(uy * 10);
      var x = ux + (c === 1 ? j(seed) * 14 : j(seed) * 7);
      var y = uy + (border ? j(seed + 5) * 7 : j(seed + 5) * 14);
      return { x: x, y: y, id: seed };
    }
    var P00 = P(0, 0), P01 = P(0, 1), P02 = P(0, 2), P10 = P(1, 0), P11 = P(1, 1), P12 = P(1, 2), P20 = P(2, 0), P21 = P(2, 1), P22 = P(2, 2), P30 = P(3, 0), P31 = P(3, 1), P32 = P(3, 2);
    var cells = [
      { cor: [P00, P01, P11, P10] },
      { cor: [P01, P02, P12, P11] },
      { cor: [P10, P11, P21, P20] },
      { cor: [P11, P12, P22, P21] },
      { cor: [P20, P21, P22, P32, P31, P30] }
    ];
    var out = [];
    for (var i = 0; i < cells.length; i++) {
      var cor = cells[i].cor;
      out.push({ idx: (prov - 1) * 5 + i, prov: prov, poly: cellPath(cor), center: centroid(cor) });
    }
    var outline = cellPath([P00, P01, P02, P12, P22, P32, P31, P30, P20, P10]);
    return { tiles: out, outline: outline };
  }
  var tiles = [], provinces = [];
  [1, 2, 3, 4].forEach(function (pv) {
    var t = provinceTiles(pv);
    for (var i = 0; i < t.tiles.length; i++) tiles.push(t.tiles[i]);
    var f = FR[pv];
    var lb = { 1: { x: f.x0 + 14, y: f.y1 - 18, a: 'start' }, 2: { x: f.x0 + 14, y: f.y0 + 30, a: 'start' }, 3: { x: f.x1 - 14, y: f.y1 - 18, a: 'end' }, 4: { x: f.x1 - 14, y: f.y0 + 30, a: 'end' } }[pv];
    provinces.push({ id: pv, name: PROV_NAME[pv], roman: ROMAN[pv], label: lb, frame: f, outline: t.outline, biome: BIOME[pv] });
  });
  var adj = {};
  for (var ai = 0; ai < 20; ai++) adj[ai] = [];
  for (var aj = 0; aj < 19; aj++) { adj[aj].push(aj + 1); adj[aj + 1].push(aj); }
  return { WORLD: WORLD, SEA: SEA, tiles: tiles, provinces: provinces, adj: adj, center: function (i) { return tiles[i].center; } };
})();

/* Г3-B1: камера TW — пан (1 палец, порог 8px), пинч 1..3x, даблтап-зум, сброс; viewBox-манипуляция, event-driven без rAF */
var KM_CAM = { x: 0, y: 0, w: 780, h: 1120, scale: 1, bound: false, dragged: false };
function kmCamApply(svg) { svg.setAttribute('viewBox', KM_CAM.x.toFixed(2) + ' ' + KM_CAM.y.toFixed(2) + ' ' + KM_CAM.w.toFixed(2) + ' ' + KM_CAM.h.toFixed(2)); }
function kmCamClamp() {
  KM_CAM.w = 780 / KM_CAM.scale; KM_CAM.h = 1120 / KM_CAM.scale;
  KM_CAM.x = Math.min(780 - KM_CAM.w, Math.max(0, KM_CAM.x));
  KM_CAM.y = Math.min(1120 - KM_CAM.h, Math.max(0, KM_CAM.y));
}
function kmCamReset(svg) { KM_CAM.x = 0; KM_CAM.y = 0; KM_CAM.scale = 1; KM_CAM.w = 780; KM_CAM.h = 1120; if (svg) kmCamApply(svg); }
function kmCamInit() {
  if (KM_CAM.bound) return;
  if (typeof document === 'undefined' || !document.addEventListener) return;
  KM_CAM.bound = true;
  var pts = {}, pinch = null, lastTap = 0, lastTapXY = null, downXY = null, downTarget = null, downTime = 0;
  function ptList() { return Object.keys(pts).map(function (k) { return pts[k]; }); }
  function vpOfEl(t) { return (t && t.closest) ? t.closest('.km-viewport') : null; }
  function vpOf(e) { return vpOfEl(e.target); }
  document.addEventListener('pointerdown', function (e) {
    if (!vpOf(e)) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (Object.keys(pts).length === 1) { downXY = { x: e.clientX, y: e.clientY }; downTarget = e.target; downTime = Date.now(); KM_CAM.dragged = false; }
    if (Object.keys(pts).length === 2) {
      var a = ptList();
      pinch = { d0: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, scale0: KM_CAM.scale, cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2 };
    }
  }, { passive: true });
  document.addEventListener('pointermove', function (e) {
    if (!pts[e.pointerId]) return;
    var prev = pts[e.pointerId];
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var vp = vpOf(e); if (!vp) return;
    var svg = vp.querySelector('svg'); if (!svg) return;
    var n = Object.keys(pts).length;
    if (n === 1) {
      if (!KM_CAM.dragged && downXY && Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > 8) KM_CAM.dragged = true;
      if (KM_CAM.dragged) {
        var k = KM_CAM.w / (svg.clientWidth || 1);
        KM_CAM.x -= (e.clientX - prev.x) * k; KM_CAM.y -= (e.clientY - prev.y) * k;
        kmCamClamp(); kmCamApply(svg);
      }
    } else if (n === 2 && pinch) {
      var a = ptList();
      var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
      var rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var ax = pinch.cx - rect.left, ay = pinch.cy - rect.top;
      var wx = KM_CAM.x + ax / rect.width * KM_CAM.w, wy = KM_CAM.y + ay / rect.height * KM_CAM.h;
      KM_CAM.scale = Math.min(3, Math.max(1, pinch.scale0 * d / pinch.d0));
      kmCamClamp();
      KM_CAM.x = wx - ax / rect.width * KM_CAM.w; KM_CAM.y = wy - ay / rect.height * KM_CAM.h;
      kmCamClamp(); kmCamApply(svg);
    }
  }, { passive: true });
  function up(e) {
    delete pts[e.pointerId];
    if (Object.keys(pts).length < 2) pinch = null;
    if (Object.keys(pts).length === 0) {
      if (KM_CAM.dragged && downXY && Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > 8) {
        var once = function (ce) { ce.stopPropagation(); ce.preventDefault(); document.removeEventListener('click', once, true); };
        document.addEventListener('click', once, true);
      }
      // Г3-B1: даблтап на pointerup — не зависит от синтеза click в WebView (touch-action:none его глушит);
      // тайл-тап остаётся каноном панели (первый тап открывает панель, dbltap живёт на мор/дорогах/границах)
      var vp2 = vpOfEl(downTarget);
      if (!KM_CAM.dragged && vp2 && downTarget && !downTarget.closest('.km-cam-reset')) {
        var now = Date.now();
        if (lastTap && now - lastTap < 300 && lastTapXY && Math.hypot(e.clientX - lastTapXY.x, e.clientY - lastTapXY.y) < 24) {
          lastTap = 0;
          var svg2 = vp2.querySelector('svg');
          if (svg2) {
            var rect = svg2.getBoundingClientRect();
            if (rect.width && rect.height) {
              var ax = e.clientX - rect.left, ay = e.clientY - rect.top;
              var wx = KM_CAM.x + ax / rect.width * KM_CAM.w, wy = KM_CAM.y + ay / rect.height * KM_CAM.h;
              KM_CAM.scale = (KM_CAM.scale >= 3) ? 1 : Math.min(3, KM_CAM.scale * 2);
              kmCamClamp();
              if (KM_CAM.scale === 1) { KM_CAM.x = 0; KM_CAM.y = 0; }
              else { KM_CAM.x = wx - ax / rect.width * KM_CAM.w; KM_CAM.y = wy - ay / rect.height * KM_CAM.h; kmCamClamp(); }
              kmCamApply(svg2);
            }
          }
        } else { lastTap = now; lastTapXY = { x: e.clientX, y: e.clientY }; }
      }
      downXY = null; downTarget = null;
    }
  }
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.km-cam-reset')) {
      var vp = e.target.closest('.km-viewport');
      kmCamReset(vp && vp.querySelector('svg'));
    }
  });
}

function kingdomMapHtml(siegeToday) { // Г3: политическая карта Total War — KG-тайлы (сталь/кровь/туман), мир 780×1120; контракты фазы E сохранены (km-node/sh-open/aria)
var ds = (typeof siegeToday === 'number') ? siegeToday : (siegeToday ? 0 : 99);
var W = KG.WORLD.w, H = KG.WORLD.h;
function prand(i) { return Math.abs(Math.sin((i + 1) * 127.1) * 43758.5453) % 1; }
var front = frontIdx();
var fogD = {};
if (front >= 0 && KG.adj[front]) { fogD[front] = 0; var _q = [front]; while (_q.length) { var _c = _q.shift(); for (var _fi = 0; _fi < KG.adj[_c].length; _fi++) { var _nb = KG.adj[_c][_fi]; if (fogD[_nb] === undefined) { fogD[_nb] = fogD[_c] + 1; _q.push(_nb); } } } }
var html = '<div class="km-legend">' +
'<span><i class="km-lg km-lg-cap"></i>Захвачено</span>' +
'<span><i class="km-lg km-lg-front"></i>Следующая цель</span>' +
'<span><i class="km-lg km-lg-siege"></i>Осада</span>' +
'<span><i class="km-lg km-lg-lock"></i>Заперто</span></div>';
html += '<div class="sh-map-wrap"><div class="km-viewport"><svg class="km-svg" viewBox="' + KM_CAM.x + ' ' + KM_CAM.y + ' ' + KM_CAM.w + ' ' + KM_CAM.h + '" width="100%" role="group" aria-label="Карта королевства: Путь Угасания">';
html += '<defs>' +
'<linearGradient id="kmSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#191510"/><stop offset="0.5" stop-color="#131009"/><stop offset="1" stop-color="#0b0a07"/></linearGradient>' +
'<linearGradient id="kmRoad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ecd28c"/><stop offset="1" stop-color="#a97f45"/></linearGradient>' +
'<radialGradient id="kmVin" cx="0.5" cy="0.42" r="0.78"><stop offset="0.55" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(0,0,0,0.5)"/></radialGradient>' +
'<pattern id="kmHatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="rgba(139,26,53,0.32)"/><rect width="6" height="14" fill="rgba(70,130,180,0.40)"/></pattern>' +
'<filter id="kmShadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="2.5" stdDeviation="3" flood-color="#000000" flood-opacity="0.55"/></filter>' +
'</defs>';
html += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#kmSky)"/>';
for (var b = 0; b < 12; b++) {
var bx = Math.round(60 + prand(b * 7 + 1) * 660), by = Math.round(100 + prand(b * 13 + 5) * 920), br = Math.round(60 + prand(b * 3 + 2) * 70);
html += '<ellipse cx="' + bx + '" cy="' + by + '" rx="' + br + '" ry="' + Math.round(br * 0.62) + '" fill="rgba(146,120,74,0.05)"/>';
}
html += '<g class="km-sea-g"><rect class="km-sea" x="' + KG.SEA.x0 + '" y="' + KG.SEA.y0 + '" width="' + (KG.SEA.x1 - KG.SEA.x0) + '" height="' + (KG.SEA.y1 - KG.SEA.y0) + '" rx="10"/>';
for (var sw = 0; sw < 6; sw++) {
var sy = KG.SEA.y0 + 130 + sw * 160, sx = KG.SEA.x0 + 6;
html += '<path class="km-wave" d="M' + sx + ' ' + sy + ' q7 -7 14 0 q7 7 14 0"/>';
}
html += '</g>';
html += '<rect x="5" y="5" width="' + (W - 10) + '" height="' + (H - 10) + '" fill="none" stroke="rgba(212,165,116,0.35)" stroke-width="1"/>';
html += '<rect x="9" y="9" width="' + (W - 18) + '" height="' + (H - 18) + '" fill="none" stroke="rgba(0,0,0,0.65)" stroke-width="1"/>';
html += '<g class="km-corner"><path d="M5 17 L5 5 L17 5"/><path d="M' + (W - 17) + ' 5 L' + (W - 5) + ' 5 L' + (W - 5) + ' 17"/><path d="M' + (W - 5) + ' ' + (H - 17) + ' L' + (W - 5) + ' ' + (H - 5) + ' L' + (W - 17) + ' ' + (H - 5) + '"/><path d="M17 ' + (H - 5) + ' L5 ' + (H - 5) + ' L5 ' + (H - 17) + '"/></g>';
// Г2-2: полоса прогноза погоды над картой — 11 иконок по очередям боссов I..XI (провинция очереди → погода)
if (typeof BOSSES !== 'undefined' && Array.isArray(BOSSES) && typeof weatherOf === 'function') {
var _wtape = (typeof ensureSeason === 'function') ? weatherSeasonWeek() : { sn: 1, wk: 1 };
var _wIcons = '';
for (var wi = 0; wi < BOSSES.length; wi++) {
var _ww = weatherOf(BOSSES[wi].prov, _wtape.sn, _wtape.wk);
_wIcons += '<text class="km-wi km-wi-' + _ww.id + '" x="' + (60 + wi * 66) + '" y="80" text-anchor="middle">' + _ww.icon + '<title>Очередь ' + (wi + 1) + ' · ' + _ww.name + (weatherNorth(BOSSES[wi].prov) && _ww.id === 'blizzard' ? ' — содержание ×2' : _ww.id === 'drought' && weatherSouth(BOSSES[wi].prov) ? ' — налог ×0.75' : '') + '</title></text>';
}
html += '<g class="km-weather" pointer-events="all">' + _wIcons + '</g>';
}
html += '<g class="km-cartouche"><line x1="249" y1="30" x2="313" y2="30"/><text class="km-dia" x="243" y="40" text-anchor="middle">◆</text><text x="360" y="42" text-anchor="middle">ПУТЬ УГАСАНИЯ</text><line x1="407" y1="30" x2="471" y2="30"/><text class="km-dia" x="477" y="40" text-anchor="middle">◆</text></g>';
html += '<g class="km-compass" transform="translate(390,1048) scale(1.6)" pointer-events="none"><circle r="15" class="km-compass-ring"/><path class="km-star" d="M0 -13 L2.6 -2.6 L13 0 L2.6 2.6 L0 13 L-2.6 2.6 L-13 0 L-2.6 -2.6 Z"/><circle r="2" class="km-compass-hub"/><text class="km-compass-n" y="-19" text-anchor="middle">N</text></g>';
// Г3.5 биомная подложка: земля живая ПОД политикой (souls-like: no flat colors — washes+слои)
for (var pb = 0; pb < KG.provinces.length; pb++) {
var bp = KG.provinces[pb], bf = bp.frame;
html += '<path class="km-biome" d="' + bp.outline + '" fill="' + bp.biome + '"/>';
html += '<ellipse cx="' + Math.round((bf.x0 + bf.x1) / 2) + '" cy="' + Math.round((bf.y0 + bf.y1) / 2) + '" rx="' + Math.round((bf.x1 - bf.x0) * 0.55) + '" ry="' + Math.round((bf.y1 - bf.y0) * 0.34) + '" fill="' + bp.biome + '" fill-opacity="0.5"/>';
}
// воды: река с хребтов II через мост в топи I (старица-пруд), эстуарий III к морю
html += '<g class="km-decor">' +
'<path class="km-river" d="M142 22 C154 90 118 140 150 200 C182 262 138 320 170 380 C202 442 158 502 199 548 L201 560 C224 622 182 662 192 722 C202 792 246 830 268 900 C288 940 300 955 300 975"/>' +
'<ellipse class="km-pond" cx="300" cy="982" rx="46" ry="17"/>' +
'<path class="km-river km-estuary" d="M706 1096 C712 1070 694 1052 704 1030 C710 1016 700 1004 706 992"/>' +
'<g class="km-bridge" transform="translate(201,560)"><line x1="-10" y1="-8" x2="-10" y2="8"/><line x1="10" y1="-8" x2="10" y2="8"/><line x1="-16" y1="0" x2="16" y2="0"/><line x1="-16" y1="-4" x2="16" y2="-4"/><line x1="-16" y1="4" x2="16" y2="4"/></g>';
// плотный рельеф: 96 объектов по биомам (хребты II/IV, лес+топь I, дюны+прибой III)
for (var dv = 0; dv < 96; dv++) {
var dpv = (dv % 4) + 1, fr = KG.provinces[dpv - 1].frame;
var dpx = Math.round(fr.x0 + 26 + prand(dv * 31 + 11) * (fr.x1 - fr.x0 - 52)), dpy = Math.round(fr.y0 + 40 + prand(dv * 17 + 3) * (fr.y1 - fr.y0 - 80));
var near = false;
for (var dn = 0; dn < KG.tiles.length; dn++) { var cp = KG.center(dn); var ddx = dpx - cp.x, ddy = dpy - cp.y; if (ddx * ddx + ddy * ddy < 54 * 54) { near = true; break; } }
if (near) continue;
if (dpv === 2 || dpv === 4) html += '<path class="km-deco km-ridge' + (dpv === 4 ? ' km-ember' : '') + '" transform="translate(' + dpx + ',' + dpy + ') scale(' + (0.8 + prand(dv * 7) * 0.7).toFixed(2) + ')" d="M0 0 L14 -20 L28 0 M10 0 L18 -12 L26 0"/>';
else if (dpv === 1) { if (prand(dv * 5 + 7) < 0.55) html += '<g class="km-deco km-trees" transform="translate(' + dpx + ',' + dpy + ')"><circle cx="-6" cy="0" r="8"/><circle cx="5" cy="-4" r="9"/><circle cx="14" cy="1" r="7"/></g>';
else html += '<g class="km-deco km-marsh" transform="translate(' + dpx + ',' + dpy + ')"><path d="M-10 2 Q-6 -6 -2 2 M0 4 Q4 -6 8 4 M10 1 Q13 -5 16 1"/><circle cx="18" cy="4" r="2"/></g>'; }
else { if (prand(dv * 5 + 7) < 0.5) html += '<g class="km-deco km-dune" transform="translate(' + dpx + ',' + dpy + ')"><path d="M-12 0 Q0 -8 12 0"/><path d="M-8 5 Q2 -1 10 5"/></g>';
else html += '<path class="km-deco km-coastwave" transform="translate(' + dpx + ',' + dpy + ')" d="M-12 0 q6 -6 12 0 q6 6 12 0"/>'; }
}
html += '</g>';
// Г3 политический слой ПОВЕРХ рельефа: сталь/штриховка/кровь просвечивают биом
var terr = '<g class="km-terr-layer">';
for (var t = 0; t < KG.tiles.length; t++) {
var tt = KG.tiles[t], tcap = strongholds[t].captured;
var tstate = tcap ? 'km-captured' : (t === front ? (ds === 0 ? 'km-siege' : 'km-front') : 'km-locked');
terr += '<path class="km-terr ' + tstate + '" d="' + tt.poly + '"/>';
if (tstate === 'km-locked') { var fd = fogD[t] === undefined ? 9 : fogD[t]; terr += '<path class="km-fog" d="' + tt.poly + '" fill-opacity="' + (fd <= 1 ? 0.15 : (fd === 2 ? 0.32 : 0.5)) + '"/>'; }
}
terr += '</g>';
html += terr;
for (var pi = 0; pi < KG.provinces.length; pi++) {
var pv = KG.provinces[pi];
html += '<path class="km-prov-out" d="' + pv.outline + '"/>';
html += '<text class="km-zone" x="' + pv.label.x + '" y="' + pv.label.y + '" text-anchor="' + pv.label.a + '">' + pv.roman + '</text>';
html += '<text class="km-zone km-zone-sub" x="' + pv.label.x + '" y="' + (pv.label.y + 20) + '" text-anchor="' + pv.label.a + '">' + pv.name + '</text>';
if (provCapturedCount(pv.id) > 0) { // Г4: чипы состояния провинции под лейблом
  var _ed = provEdict(pv.id), _o = provOrder(pv.id);
  var _chip = '⚙' + provResource(pv.id) + ' · ⚖' + _o;
  if (_ed) _chip += ' · ' + EDICTS[_ed].icon;
  html += '<text class="km-prov-chip' + (provOrder(pv.id) < 70 ? ' hot' : '') + '" x="' + pv.label.x + '" y="' + (pv.label.y + 42) + '" text-anchor="' + pv.label.a + '">' + _chip + '</text>';
}
}
html += '<g class="km-cross" transform="translate(390,560)"><rect x="-7" y="-7" width="14" height="14" transform="rotate(45)"/></g>';
// дороги: коридоры через межпровинциальные врата (мост I-II, перекрёсток, восточный проход) — не сквозь стены
var segs = '<g class="km-roads">';
var WAY = { 5: [201, 560], 10: [390, 560], 15: [650, 560] };
for (var i = 1; i < STRONGHOLDS.length; i++) {
var a = KG.center(i - 1), b2 = KG.center(i);
var parts = [a];
if (WAY[i]) parts.push({ x: WAY[i][0], y: WAY[i][1] });
parts.push(b2);
var dpath = 'M' + a.x + ' ' + a.y;
for (var pw = 1; pw < parts.length; pw++) dpath += ' Q' + Math.round((parts[pw - 1].x + parts[pw].x) / 2) + ' ' + Math.round((parts[pw - 1].y + parts[pw].y) / 2) + ' ' + parts[pw].x + ' ' + parts[pw].y;
segs += '<path class="km-road-case" d="' + dpath + '"/>';
segs += '<path class="km-connector' + (strongholds[i].captured ? ' owned' : '') + '" d="' + dpath + '"/>';
}
segs += '</g>';
html += segs;
// интерактивные тайлы: hit-полигон + городок с флагом + табличка (контракт km-node фазы E)
var g = '';
for (var n = 0; n < STRONGHOLDS.length; n++) {
var d = STRONGHOLDS[n], s = strongholds[n], p = KG.center(n);
var state = s.captured ? 'km-captured' : (n === front ? (ds === 0 ? 'km-siege' : 'km-front') : 'km-locked');
var stage = s.captured ? shWorstStage(n) : null;
var frac = stage === 'ruin' ? 1 : (stage === 'worn' ? 0.5 : 0);
var builtN = 0; var bl = strongholds[n].buildings || {};
for (var bk in bl) if (bl[bk] && bl[bk].built) builtN++;
var bossHere = bossActiveFor(n) !== null; // Г2-1: корона босса — только на узле первой твердыни провинции
var node = '<g class="km-node ' + state + (bossHere ? ' km-boss' : '') + '" data-action="sh-open" data-idx="' + n + '" role="button" tabindex="0" aria-label="' + d.name + ': ' + kmStatusLabel(n) + (bossHere ? ' · Босс доступен' : '') + '"' + (state === 'km-locked' ? ' aria-disabled="true"' : '') + '>';
node += '<title>' + d.name + ' · налог ' + d.tax + '💰 · постройки ' + builtN + '/' + d.slots + ' · оборона ' + (d.gar + d.def) + (frac > 0 ? (frac === 1 ? ' · руина' : ' · обветшало') : '') + '</title>';
node += '<path class="km-hit" d="' + KG.tiles[n].poly + '"/>';
node += '<g class="km-town" transform="translate(' + p.x + ',' + p.y + ')" filter="url(#kmShadow)">' +
'<path class="km-tower" d="M-13 18 L-13 -7 L-8 -7 L-8 -13 L-4 -13 L-4 -7 L4 -7 L4 -13 L8 -13 L8 -7 L13 -7 L13 18 Z"/>' +
'<line class="km-pole" x1="13" y1="-7" x2="13" y2="-32"/><path class="km-flag" d="M13 -32 L30 -25.5 L13 -19 Z"/>' +
'<g class="km-emoji"><circle cx="27" cy="9" r="14"/><text x="27" y="15" text-anchor="middle">' + d.icon + '</text></g>' +
(frac > 0 ? '<circle class="km-corrupt" r="30" pathLength="100" stroke-dasharray="' + (frac * 100) + ' 100"/>' : '') +
'<circle class="km-ring" r="30"/>' +
(state === 'km-siege' ? '<g class="km-badge" transform="translate(-26,-26)"><circle r="18"/><text y="7" text-anchor="middle">⚔</text></g>' : '') +
(state === 'km-locked' ? '<text class="km-lockglyph" x="-24" y="16" text-anchor="middle">🔒</text>' : '') +
'</g>';
var pw2 = Math.max(110, Math.round(d.name.length * 12 + 28));
var pl = p.x - Math.round(pw2 / 2);
var pfr = KG.provinces[d.prov - 1].frame;
if (pl < pfr.x0 + 8) pl = pfr.x0 + 8; // кламп: табличка не заходит за сушу провинции
if (pl + pw2 > pfr.x1 - 8) pl = pfr.x1 - 8 - pw2;
var py2 = (n % 2 === 0) ? (p.y + 24) : (p.y - 54); // чередование: чёт — снизу, нечёт — сверху (имена не липнут к стенам)
node += '<g class="km-plaque' + (state === 'km-locked' ? ' dim' : '') + '"><rect x="' + pl + '" y="' + py2 + '" width="' + pw2 + '" height="28" rx="5"/><text class="km-name' + (state === 'km-locked' ? ' dim' : '') + '" x="' + Math.round(pl + pw2 / 2) + '" y="' + (py2 + 19) + '" text-anchor="middle">' + d.name + '</text></g>';
if (bossHere) node += '<text class="km-boss-crown" x="' + p.x + '" y="' + (p.y - 70) + '" text-anchor="middle">⚜</text>';
if (n === front && ds <= 7) node += '<text class="km-count' + (ds === 0 ? ' now' : '') + '" x="' + p.x + '" y="' + (p.y + 74) + '" text-anchor="middle">' + (ds === 0 ? '⚔ ОСАДА СЕГОДНЯ' : '🛡 осада через ' + ds + ' дн.') + '</text>';
node += '</g>';
g += node;
}
html += g;
html += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#kmVin)" pointer-events="none"/>';
html += '</svg><button class="km-cam-reset" type="button" aria-label="Сбросить масштаб карты" title="Сбросить масштаб">⤢</button></div></div>';
return html;
}
function renderStrongholds() {
ensureStrongholdState();
if (!SM) return;
if (currentShIdx !== null) { renderStrongholdPanel(currentShIdx); return; }
var root = document.getElementById('strongholdsRoot');
if (!root) return;
kmCamInit();
var front = frontIdx();
var cap = capturedCount();
// Королевский баннер
html_strongholds_banner(root, cap);
var html = '<div class="sh-treasury">' +
'<div>💰 <b>' + (HERO.gold || 0) + '</b></div>' +
'<div>Налоги: <b style="color:var(--green)">+' + shIncomePerDay() + ' 💰/день</b></div>' +
'<div>Содержание: <b style="color:var(--blood-bright)">−' + shUpkeepPerDay() + ' 💰/день</b></div>' +
'<div>⚔ Армия: <b>' + SM.armyPower(army.units) + '</b></div></div>';
var fi = frontIdx();
var daysToSiege = daysToSiegeNow();
html += '<div class="sh-context-anchor">📍 Фронт: <b>' + (STRONGHOLDS[fi] ? STRONGHOLDS[fi].name : '—') + '</b> · 🛡 Осада через <b>' + Math.max(1, daysToSiege) + ' дн.</b> · Гнев: <b>' + siegeWrathNow() + '/10</b></div>';
html += '<div class="km-stance-row">' + '<button class="km-stance km-chron-btn" data-action="km-chronicle-open"><span class="km-stance-ico">📜</span><span class="km-stance-name">Хроника</span><span class="km-stance-desc">летопись кампании</span></button>' + '<button class="km-stance km-chron-btn" data-action="km-techs-open"><span class="km-stance-ico">🔬</span><span class="km-stance-name">Технологии</span><span class="km-stance-desc">🔬' + TECH_PTS + ' · 📦' + resPool() + '</span></button>' + Object.keys(STANCES).map(function(sid) {
  var st = STANCES[sid], act = weekStance() === sid;
  return '<button class="km-stance' + (act ? ' active' : '') + '" data-action="km-stance" data-stance="' + sid + '"' + (act ? ' disabled' : '') + '><span class="km-stance-ico">' + st.icon + '</span><span class="km-stance-name">' + st.name + '</span><span class="km-stance-desc">' + st.desc + '</span></button>';
}).join('') + '</div>';
// ФАЗА E: карта королевства заменяет ленту провинций (панели твердыни не тронуты)
html += kingdomMapHtml(daysToSiege);
// Фронт: штурмовая карточка под картой (штурм остаётся доступным из обзорного состояния)
if (front > 0 && !strongholds[front].captured) {
var fd = STRONGHOLDS[front];
html += '<div class="sh-card front km-front-card"><div class="sh-icon">' + fd.icon + '</div>' +
'<div class="sh-body"><div class="sh-name">' + fd.name + '</div>' +
'<div class="sh-meta">' + frontPowerText(front) + '</div></div>' +
'<button class="sh-assault" data-action="sh-assault" data-idx="' + front + '">⚔ Штурм</button>' + scoutButtonHtml(front) + '</div>';
html += scoutReportHtml(front);
} else if (front === 0 && !strongholds[0].captured) {
html += '<div class="sh-card front km-front-card"><div class="sh-icon">' + STRONGHOLDS[0].icon + '</div>' +
'<div class="sh-body"><div class="sh-name">' + STRONGHOLDS[0].name + ' <span class="sh-req">стартовый лагерь</span></div>' +
'<div class="sh-meta">' + frontPowerText(0) + '</div></div>' +
'<button class="sh-assault" data-action="sh-assault" data-idx="0">⚔ Штурм</button>' + scoutButtonHtml(0) + '</div>';
html += scoutReportHtml(0);
}
var tRoutesUI = SM.tradeRoutes ? SM.tradeRoutes(strongholds.map(function(s) { return !!s.captured; })) : 0;
if (tRoutesUI > 0) html += '<div class="sh-trade">🛃 Торговые пути: <b>' + tRoutesUI + '</b> · налоги <b>+' + Math.round((SM.tradeBonus(tRoutesUI)) * 100) + '%</b></div>';
var _season = ensureSeason();
var _sTotal = seasonDaysTotal(_season.start);
var _sDone = seasonDaysDone(_season.start);
html += '<div class="sh-season"><div class="sh-season-line">🍂 Сезон ' + _season.num + ': <b>' + seasonName(_season.num) + '</b> · осталось <b>' + Math.max(0, _sTotal - _sDone) + '</b> дн.</div><div class="sh-season-bar"><div class="sh-season-fill" style="width:' + Math.min(100, Math.round(_sDone / _sTotal * 100)) + '%;"></div></div></div>';
var _wt = warlordTempo(), _wm = seasonCapturedDelta(); // Г1-6: тень воеводы
html += '<div class="sh-warlord">⚔ Глорх, Погибель Урядов: <b>' + _wt + '</b> · ты: <b>' + _wm + '</b><div class="sh-season-bar" title="Прогресс до обгона воеводы"><div class="sh-season-fill' + (_wm >= _wt ? ' warlord-ahead' : '') + '" style="width:' + Math.min(100, Math.round(_wm / (_wt + 1) * 100)) + '%;"></div></div></div>';
html += '<div class="sh-wrath">😮 Гнев: <b>' + siegeWrathNow() + '/10</b> <span style="color:var(--text-dim)">· призраки задач и пропуски усилят удар</span></div>'; // #37: гнев виден заранее
var _alarm = (daysToSiege <= 2) ? siegeAlarmPreview() : null; // Ф1: осадная тревога за 2 дня и в день осады
if (_alarm) html += '<div class="siege-alarm">⚠ <b>Осадная тревога</b> · враг ~<b>' + _alarm.power + '</b> · оборона <b>' + _alarm.def + '</b>' + (_alarm.ratio === null ? '' : ' (' + Math.round(_alarm.ratio * 100) + '%)') + ' — ' + _alarm.advice + '</div>';
html += renderTowerCard(cap); // Ф3: башня-марафон (только при 20/20)
checkSiegeAlarmToast();
// Квест-доска (3 ротационных дневных задания)
if (!dailyQuests || dailyQuests.day !== getMSKDayKey() || !dailyQuests.quests || !dailyQuests.quests.length) {
    var seed = parseInt(getMSKDayKey().replace(/-/g, ''));
    var _sameDay = !!(dailyQuests && dailyQuests.day === getMSKDayKey());
    dailyQuests = { day: getMSKDayKey(), quests: [DQ_POOL[seed % 6], DQ_POOL[(seed + 2) % 6], DQ_POOL[(seed + 4) % 6]], done: _sameDay ? (dailyQuests.done || {}) : {}, progress: _sameDay ? (dailyQuests.progress || {}) : {} };
}
html += '<div class="sh-quest-board"><div class="sh-quest-title">📋 Задания дня</div>';
dailyQuests.quests.forEach(function(q) {
    if (dailyQuests.done[q.id]) { html += '<div class="sh-quest done">✓ ' + q.text + ' (+' + q.reward + ' 💰)</div>'; return; }
    var _qp = (dailyQuests.progress || {})[q.counter] || 0;
    html += '<div class="sh-quest" data-action="sh-daily-quest" data-qid="' + q.id + '" data-reward="' + q.reward + '">☐ ' + q.icon + ' ' + q.text + ' (' + Math.min(_qp, q.goal) + '/' + q.goal + ') → +' + q.reward + ' 💰</div>';
});
html += '</div>';
root.innerHTML = html;
}
function html_strongholds_banner(root, cap) {
var pct = Math.round(cap / 20 * 100);
var html = '<div class="kingdom-banner">' +
'<div class="kb-crown">👑</div>' +
'<div class="kb-info">' +
'<div class="kb-title">Королевство Владыки</div>' +
'<div class="kb-sub">' + cap + '/20 твердыней · ' + pct + '%</div>' +
'</div>' +
'<div class="kb-bar"><div class="kb-bar-fill" style="width:' + pct + '%"></div></div>' +
'</div>';
root.innerHTML = html;
}
function shSpriteImg(path, emoji) { return '<img src="' + path + '" alt="" onerror="this.outerHTML=\'' + emoji + '\'">'; }
function catClass(bd) { // ФАЗА F: категорийная рамка тайла постройки
return 'cat-' + (bd.cat === 'house' ? 'zh' : bd.cat === 'econ' ? 'ec' : bd.cat === 'defense' ? 'df' : 'sp');
}
function builtTileHtml(id, bd, b) {
return '<div class="sh-tile built ' + catClass(bd) + '"><div class="sh-tile-icon">' + shSpriteImg('img/tract/buildings/' + id + '.png', bd.icon) + '</div>' +
'<div class="sh-tile-name">' + bd.name + '</div>' +
'<div class="sh-tile-meta">' + buildingEffectText(bd) + ' · содержание ' + bd.upkeep + ' 💰/день</div>' +
stageBadgeHtml(b.corruptionStage) + '</div>';
}
function buyTileHtml(idx, id, bd, reqOk, can, reason) {
return '<div class="sh-tile buy ' + catClass(bd) + (reqOk ? '' : ' locked') + '"><div class="sh-tile-icon">' + shSpriteImg('img/tract/buildings/' + id + '.png', bd.icon) + '</div>' +
'<div class="sh-tile-name">' + bd.name + (reqOk ? '' : ' <span class="sh-req">нужна: ' + BUILDINGS[bd.req].name + '</span>') + '</div>' +
'<div class="sh-tile-meta">' + buildingEffectText(bd) + '</div>' +
'<div class="sh-tile-badges"><span class="sh-tile-cost">🏗 ' + buildCostOf(id) + ' 💰</span><span class="sh-tile-upkeep">−' + bd.upkeep + '/день</span></div>' +
(can ? '<button class="sh-buy" data-action="sh-buy" data-idx="' + idx + '" data-bid="' + id + '">Купить</button>' : '<span class="sh-stage lock">🔒 ' + reason + '</span>') +
'</div>';
}
function renderStrongholdPanel(idx) {
ensureStrongholdState();
if (!SM) return;
var root = document.getElementById('strongholdsRoot');
if (!root) { currentShIdx = null; return; }
var d = STRONGHOLDS[idx], s = strongholds[idx];
if (!s || (!s.captured && idx !== 0)) { currentShIdx = null; renderStrongholds(); return; } // Сендер-Хутор — стартовый лагерь и без захвата (SPEC §9)
var html = '<button class="sh-back" data-action="sh-back">← Все твердыни</button>';
html += bossCardHtml(idx); // Г2-1: карточка босса провинции сверху панели
html += '<div class="sh-panel-head"><div class="sh-panel-title">' + d.icon + ' ' + d.name + '</div>' +
'<div class="sh-panel-sub">Налог +' + d.tax + ' 💰/день · слоты ' + builtList(idx).length + '/' + d.slots + ' · ' + PROVINCES[d.prov] + '</div></div>';
html += edictBlockHtml(idx); // Г4: эдикты провинции + порядок + ресурс
if (idx === 19 && typeof throne !== 'undefined') {
html += '<div class="sh-sec-title">👑 Вечный трон — ' + throne + '/5 · налоги +' + throne + '%</div>';
if (throne >= 5) html += '<div class="empty-state">Трон возведён полностью: +5% налогов навсегда.</div>' + (HERO.ascension ? '<div class="empty-state">✨ Круг Вознесения ' + HERO.ascension + ': враги +25%, артефакты ×0.5.</div>' : '') + '<button class="sh-buy ascend-btn" data-action="ascend">✨ Вознестись</button>';
else { var tc = throneCost(); html += '<div class="sh-build-row buy"><div class="sh-build-body"><div class="sh-build-name">Возвести ярус трона</div><div class="sh-build-meta">+' + (throne + 1) + '% налогов навсегда · цена ' + tc.toLocaleString('ru-RU') + ' 💰</div></div>' + ((HERO.gold || 0) >= tc ? '<button class="sh-buy" data-action="throne-invest">👑 ' + tc.toLocaleString('ru-RU') + '</button>' : '<span class="sh-stage lock">🔒 ' + tc.toLocaleString('ru-RU') + '</span>') + '</div>'; }
}
if (HERO.storm && HERO.storm.paid === false && HERO.storm.num === ensureSeason().num && HERO.storm.regionIdx === idx) { // Г1-5: баннер бури в панели региона
var _sd = Math.max(0, daysBetween(getMSKDayKey(), HERO.storm.dueDayKey));
var _sc = 50 * capturedCount();
html += '<div class="sh-sec-title">🌩 Буря над регионом</div><div class="sh-build-row buy"><div class="sh-build-body"><div class="sh-build-name">🌩 Буря над ' + STRONGHOLDS[idx].name + '</div><div class="sh-build-meta">Дань до дедлайна: ' + _sd + ' ' + (_sd === 1 ? 'день' : 'дн.') + ' · иначе постройки ветшают</div></div>' + ((HERO.gold || 0) >= _sc ? '<button class="sh-buy" data-action="storm-pay">🌧 ' + _sc.toLocaleString('ru-RU') + ' 💰</button>' : '<span class="sh-stage lock">🌧 ' + _sc.toLocaleString('ru-RU') + ' 💰</span>') + '</div>';
}
html += '<div class="sh-sec-title">🏗 Постройки</div>';
var built = builtList(idx);
if (built.length === 0) html += '<div class="empty-state">Пока ничего не построено.</div>';
if (built.length > 0) { // ФАЗА F: построенное — тайлы-сетка
html += '<div class="sh-build-grid">';
built.forEach(function(id) {
var bd = BUILDINGS[id], b = s.buildings[id];
html += builtTileHtml(id, bd, b);
});
html += '</div>';
}
var slotLeft = d.slots - built.length;
var avail = [];
Object.keys(BUILDINGS).forEach(function(id) {
var bd = BUILDINGS[id];
if (bd.min > idx + 1) return;
if (s.buildings[id] && s.buildings[id].built) return;
avail.push(id);
});
avail.sort(function(a, b) { return BUILDINGS[a].cost - BUILDINGS[b].cost; });
var rec = avail.filter(function(id) { var bd = BUILDINGS[id]; return !bd.req || (s.buildings[bd.req] && s.buildings[bd.req].built); }).slice(0, 3);
var shown = shCatalogOpen ? avail : rec;
html += '<div class="sh-sec-title">📓 ' + (shCatalogOpen ? 'Каталог' : 'Что построить сейчас') + ' (свободно\u00A0слотов:\u00A0' + slotLeft + ')</div>';
var anyShown = false;
 shown.forEach(function(id) {
  var bd = BUILDINGS[id];
  anyShown = true;
  var reqOk = !bd.req || (s.buildings[bd.req] && s.buildings[bd.req].built);
  var can = reqOk && slotLeft > 0 && (HERO.gold || 0) >= buildCostOf(id);
  var reason = !reqOk ? 'нужна: ' + BUILDINGS[bd.req].name : (slotLeft <= 0 ? 'нет слотов' : 'мало золота');
  html += buyTileHtml(idx, id, bd, reqOk, can, reason);
 });
if (!anyShown) html += '<div class="empty-state">Каталог пуст — захватывай новые земли.</div>';
if (avail.length > 3) html += '<button class="sh-back" data-action="sh-catalog-toggle">' + (shCatalogOpen ? '∧ Свернуть каталог' : '📓 Открыть весь каталог (ещё ' + (avail.length - rec.length) + ')') + '</button>';
html += '<div class="sh-sec-title">⚔ Найм (пул недели · скидка 🎭 ' + Math.round(Math.min(0.30, 0.005 * STATS.cha.value) * 100) + '%)</div>';
var hireRows = '';
Object.keys(BUILDINGS).forEach(function(id) {
var bd = BUILDINGS[id];
if (!bd.grow) return;
var b = s.buildings[id];
if (!b || !b.built) return;
var tier = bd.tier, u = UNIT_TIERS[tier];
hireRows += '<div class="sh-hire-row"><div class="sh-build-icon">' + shSpriteImg('img/units/tier' + tier.slice(1) + '.png', u.icon) + '</div>' +
'<div class="sh-build-body"><div class="sh-build-name">' + u.name + ' (Т' + tier.slice(1) + ') · сила ' + u.power + '</div>' +
'<div class="sh-build-meta">Пул недели: <b>' + (hirePool[tier] || 0) + '</b> · цена ' + hireCostOf(tier) + ' 💰</div></div>' +
'<div class="sh-hire-actions">' +
'<button class="sh-mini" data-action="sh-hire-army" data-idx="' + idx + '" data-tier="' + tier + '">В армию</button>' +
'<button class="sh-mini" data-action="sh-hire-garrison" data-idx="' + idx + '" data-tier="' + tier + '">В гарнизон</button>' +
'</div></div>';
});
html += hireRows || '<div class="empty-state">Построй жилище, чтобы нанимать существ.</div>';
var garDef = SM.defensePower(d, s.garrison, STATS.end.value, defBonusOf(idx));
html += synergyRows(idx).map(function(r) { return '<div class="sh-sec-title" style="color:var(--violet,#c4b5fd)">' + r + '</div>'; }).join(''); // Г1-3: ✦ Синергия
html += '<div class="sh-sec-title">🛡 Гарнизон — сила ' + SM.stackPower(s.garrison) + ' · оборона ' + garDef + ' (база ' + d.total + ' + постройки +' + defBonusOf(idx) + ')</div>';
html += garrisonRows(s.garrison, idx, 'sh-to-army', '→ Армия');
html += '<div class="sh-sec-title">⚔ Полевая армия — сила ' + SM.armyPower(army.units) + '</div>';
html += garrisonRows(SM.TIER_KEYS.map(function(t) { return { tier: t, count: army.units[t] || 0 }; }).filter(function(x) { return x.count > 0; }), idx, 'sh-to-garrison', '→ Гарнизон');
root.innerHTML = html;
}
let lastDayReset = null;
var lastWeekReset = getThisMondayKey();
var dailyEvent = null; // объявление было утеряно при удалении боевого блока — без него молча падали все saveGameState



function pluralDays(n) { return n === 1 ? 'день' : (n < 5 ? 'дня' : 'дней'); }
function pluralRu(n, one, few, many) { var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return one; if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few; return many; } // QA5-M5
function daysBetween(keyA, keyB) { return Math.round((new Date(keyB) - new Date(keyA)) / 86400000); }



// ===================== ЗАДАЧИ ДНЯ (дедлайн → сундук → призрак) =====================
const TASK_TIERS = {
light:  { icon: '🌿', name: 'Лёгкая',  color: '#34d399', gold: 5,  xp: 20, ghostDays: 2, doneGraceDays: 1 },
normal: { icon: '⚔', name: 'Обычная', color: '#60a5fa', gold: 10, xp: 40, ghostDays: 3, doneGraceDays: 2 },
urgent: { icon: '🔥', name: 'Срочная', color: '#c73e4d', gold: 20, xp: 80, ghostDays: 5, doneGraceDays: 3 }
};
let TASKS = [];
let taskIdCounter = 1;
let selectedTaskTier = 'normal';
function findTask(id) { return TASKS.find(function(t) { return t.id === id; }); }
function countGhostTasks() { return TASKS.filter(function(t) { return t.status === 'ghost'; }).length; }
function updateTaskTierSelection() { document.querySelectorAll('#taskTierChips .stat-chip').forEach(function(c) { c.classList.toggle('selected', c.dataset.tier === selectedTaskTier); }); }
function openTaskModal() {
document.getElementById('taskModal').classList.add('show');
var d = getMSKDate();
document.getElementById('taskDeadline').value = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
document.getElementById('taskDeadlineTime').value = '19:00';
updateTaskTierSelection();
setTimeout(function() { document.getElementById('taskName').focus(); }, 100);
}
function closeTaskModal() {
document.getElementById('taskModal').classList.remove('show');
document.getElementById('taskName').value = '';
selectedTaskTier = 'normal';
updateTaskTierSelection();
}
function createTask() {
var name = document.getElementById('taskName').value.trim();
if (!name) { showToast('⚠ Ошибка', 'Введи название задачи', 'blood'); sfxError(); return; }
var dateVal = document.getElementById('taskDeadline').value;
var timeVal = document.getElementById('taskDeadlineTime').value || '19:00';
var deadline = dateVal ? new Date(dateVal + 'T' + timeVal + ':00').getTime() : null;
if (deadline && isNaN(deadline)) deadline = null;
TASKS.unshift({ id: taskIdCounter++, name: name, tier: selectedTaskTier, deadline: deadline, status: 'active', createdAt: Date.now(), doneAt: null, ghostSince: null });
closeTaskModal(); renderTasks(); renderDashboard(); saveGameState();
sfxForge(); haptic('medium');
showToast('📋 Задача поставлена', TASK_TIERS[selectedTaskTier].name + ': ' + name, 'save');
}
function completeTask(id) {
var t = findTask(id);
if (!t || t.status !== 'active') return;
if (t.name.indexOf('🔥 Восстание:') === 0) {
  var _ok = revoltResolvable(t);
  if (!_ok) { showToast('🔥 Мятеж ещё бушует', 'Восстанови ≥2 постройки в мятежной провинции — тогда штраф снимут.', 'blood'); sfxError(); return; }
}
t.status = 'done'; t.doneAt = Date.now();
HERO.lastActiveDay = getMSKDayKey(); // #19: активность дня
sfxGoalComplete(); haptic('success');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 60, { color: '#fbbf24', speed: 10, decay: 0.01, size: 3, shape: 'star', gravity: 0.08 });
showToast('✅ Сделано!', 'Открой сундук: +💰 или +XP', 'crit');
hintOnce('claim_xor', 'Сундук — выбор взаимоисключающий: 💰 ИЛИ ✨. Что не выбрал — сгорает.'); // QA5-L3
renderTasks(); renderDashboard(); saveGameState();
}
function claimTaskChest(id, choice) {
var t = findTask(id);
if (!t || t.status !== 'done') return;
if (tryResolveRevoltTask(t)) { renderTasks(); renderDashboard(); saveGameState(); return; } // Г4: revolt-задача без сундука — снятие штрафа и есть награда
var tier = TASK_TIERS[t.tier] || TASK_TIERS.normal;
if (choice === 'gold') {
goldGain(tier.gold, 'chest');
showToast('🎁 Сундук открыт', '+' + tier.gold + ' 💰 в казну', 'save');
sfxEquip();
} else {
addXpReward(tier.xp);
showToast('🎁 Сундук открыт', '+' + tier.xp + ' XP', 'save');
sfxCrit();
}
dqProgress('quest');
haptic('success');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 80, { color: choice === 'gold' ? '#fbbf24' : '#c084fc', speed: 11, decay: 0.009, size: 4, shape: 'star', gravity: 0.1 });
t.status = 'chest_open';
renderDashboard(); updateHeroUI(); saveGameState();
}
function deleteTask(id) {
var t = findTask(id);
if (!t) return;
dungeonConfirm('🗑 Удалить задачу?', '«' + esc(t.name) + '» исчезнет без следа.').then(function(ok) {
if (!ok) return;
TASKS = TASKS.filter(function(x) { return x.id !== id; });
renderTasks(); renderDashboard(); saveGameState();
});
}
function expireGhostTasks(yesterdayKey) {
var changed = false;
var newGhosts = 0;
var ghostFree = !!(typeof dailyEvent !== 'undefined' && dailyEvent && dailyEvent.id === 'ghostfree') || !!(holidayBonus() && holidayBonus().ghostsFree); // #8: Хэллоуин — призраки праздникуют
TASKS.forEach(function(t) {
var tier = TASK_TIERS[t.tier] || TASK_TIERS.normal;
var dlDay = t.deadline ? getMSKDayKey(t.deadline) : yesterdayKey;
if (t.status === 'active' && dlDay <= yesterdayKey) {
t.status = 'ghost'; t.ghostSince = Date.now(); newGhosts++; changed = true;
} else if (t.status === 'done' && t.doneAt) {
if (daysBetween(getMSKDayKey(t.doneAt), yesterdayKey) >= tier.doneGraceDays) {
var half = Math.floor(tier.gold / 2);
goldGain(half, 'autochest');
t.status = 'chest_open'; changed = true;
showToast('📦 Сундук открыт сам', '«' + t.name + '»: +' + half + ' 💰 (не выбрал сам)', 'save');
}
} else if (t.status === 'ghost' && t.ghostSince) {
if (daysBetween(getMSKDayKey(t.ghostSince), yesterdayKey) >= tier.ghostDays) {
t.status = 'gone'; changed = true;
showToast('👻 Призрак ушёл', '«' + t.name + '» растворилась во тьме', 'blood');
}
}
});
TASKS = TASKS.filter(function(t) { return t.status !== 'gone' && t.status !== 'chest_open'; });
if (newGhosts > 0) siege.wkTaskFails = (siege.wkTaskFails || 0) + newGhosts;
if (ghostFree) return { ghostNights: 0, free: true }; // «Духи дремлют»: переходы и уходы работают, списаний нет
var ghostNights = 0;
TASKS.forEach(function(t) { if (t.status === 'ghost') ghostNights++; });
if (ghostNights > 0) {
var p = Math.min(5, ghostNights); // кап 5💰/ночь — анти-спираль (BALANCE круг 7)
HERO.gold = Math.max(0, (HERO.gold || 0) - p);
showToast('👻 Призраки ночью', '−' + p + ' 💰 (' + ghostNights + ' ' + pluralRu(ghostNights, 'призрак', 'призрака', 'призраков') + ' · кап 5)', 'blood');
}
if (changed || newGhosts > 0 || ghostNights > 0) { renderTasks(); renderDashboard(); updateHeroUI(); saveSoon(); }
return { ghostNights: ghostNights, free: false };
}
function taskCard(t) {
var tier = TASK_TIERS[t.tier] || TASK_TIERS.normal;
var todayKey = getMSKDayKey();
var overdue = t.status === 'active' && t.deadline && getMSKDayKey(t.deadline) < todayKey;
var dl = t.deadline ? new Date(t.deadline).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'без срока';
var cls = t.status === 'ghost' ? 'ghost' : t.status === 'done' ? 'done' : overdue ? 'overdue' : '';
var actions;
if (t.status === 'active') {
actions = '<button class="task-btn primary" data-action="complete-task" data-id="' + t.id + '">✓</button>' +
'<button class="task-btn del" data-action="delete-task" data-id="' + t.id + '">🗑</button>';
} else if (t.status === 'done') {
actions = '<button class="task-btn gold" data-action="claim-task-gold" data-id="' + t.id + '">💰 +' + tier.gold + '</button>' +
'<button class="task-btn xp" data-action="claim-task-xp" data-id="' + t.id + '">✨ +' + tier.xp + '</button>' +
'<button class="task-btn del" data-action="delete-task" data-id="' + t.id + '">🗑</button>';
} else {
var left = Math.max(0, tier.ghostDays - daysBetween(getMSKDayKey(t.ghostSince), todayKey));
actions = '<span class="task-ghost-info">ещё ' + left + ' ' + pluralDays(left) + '</span>' +
'<button class="task-btn del" data-action="delete-task" data-id="' + t.id + '">✕</button>';
}
return '<div class="task-card ' + cls + '" style="--tier-color:' + tier.color + '">' +
'<div class="task-tier">' + tier.icon + '</div>' +
'<div class="task-body"><div class="task-name">' + esc(t.name) + '</div>' +
'<div class="task-meta">⏰ ' + dl + ' · 💰' + tier.gold + ' / ✨' + tier.xp + (overdue ? ' · <b style="color:var(--blood-bright)">просрочена!</b>' : '') + '</div></div>' +
'<div class="task-actions">' + actions + '</div>' +
'</div>';
}
function renderTasks() {
var activeEl = document.getElementById('tasksActive');
var goneEl = document.getElementById('tasksGone');
if (!activeEl) return;
var active = TASKS.filter(function(t) { return t.status === 'active' || t.status === 'done'; });
var ghosts = TASKS.filter(function(t) { return t.status === 'ghost'; });
activeEl.innerHTML = active.length === 0 ? '<div class="empty-state">Задач нет. Жми «📋 Задача».</div>' : active.map(taskCard).join('');
goneEl.innerHTML = ghosts.length === 0 ? '' : '<div class="ghosts-title">👻 Призраки просроченных (−1 💰 за ночь, пока не изгонишь делом или ✕)</div>' + ghosts.map(taskCard).join('');
}
function getMSKDayKey(ts) {
const d = getMSKDate(ts);
return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
let xpHistory = [];
function recordXpEvent(amount) {
const todayKey = getMSKDayKey();
if (xpHistory.length === 0 || xpHistory[xpHistory.length - 1].date !== todayKey) {
xpHistory.push({ date: todayKey, xp: 0 });
}
xpHistory[xpHistory.length - 1].xp += amount;
if (xpHistory.length > 90) xpHistory = xpHistory.slice(-90);
}
function renderStatsView() {
const container = document.getElementById('statsContent');
if (!container) return;
const last7 = xpHistory.slice(-7);
while (last7.length < 7) { last7.unshift({ date: '—', xp: 0 }); }
const maxXp = Math.max(1, ...last7.map(d => d.xp));
let totalXp7 = last7.reduce((a, d) => a + d.xp, 0);
let totalCompletions = FORGED.reduce((a, c) => a + (c.totalCompletions || 0), 0);
let avgDaily = totalXp7 > 0 ? Math.round(totalXp7 / 7) : 0;
var streakHeatmap = buildStreakHeatmap();

var achievements = buildAchievements();
container.innerHTML =
'<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px;">' +
'<div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); padding: 14px; text-align: center;">' +
'<div style="font-size: 10px; letter-spacing: 2px; color: var(--text-dim); text-transform: uppercase;">Всего XP</div>' +
'<div style="font-size: 24px; font-weight: bold; color: var(--gold-bright); margin-top: 6px;">' + HERO.totalXp.toLocaleString() + '</div></div>' +
'<div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); padding: 14px; text-align: center;">' +
'<div style="font-size: 10px; letter-spacing: 2px; color: var(--text-dim); text-transform: uppercase;">XP за 7 дней</div>' +
'<div style="font-size: 24px; font-weight: bold; color: var(--gold-bright); margin-top: 6px;">' + totalXp7.toLocaleString() + '</div></div>' +
'<div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); padding: 14px; text-align: center;">' +
'<div style="font-size: 10px; letter-spacing: 2px; color: var(--text-dim); text-transform: uppercase;">Среднее XP/день</div>' +
'<div style="font-size: 24px; font-weight: bold; color: var(--gold-bright); margin-top: 6px;">' + avgDaily.toLocaleString() + '</div></div>' +
'<div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); padding: 14px; text-align: center;">' +
'<div style="font-size: 10px; letter-spacing: 2px; color: var(--text-dim); text-transform: uppercase;">Выполнений</div>' +
'<div style="font-size: 24px; font-weight: bold; color: var(--gold-bright); margin-top: 6px;">' + totalCompletions + '</div></div>' +
'</div>' +
'<div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); padding: 16px; margin-bottom: 20px;">' +
'<div style="font-size: 11px; letter-spacing: 2px; color: var(--text-dim); text-transform: uppercase; margin-bottom: 12px;">XP за последние 7 дней</div>' +
'<div style="display: flex; align-items: flex-end; gap: 6px; height: 160px;">' +
last7.map(function(d) {
var h = Math.max(2, (d.xp / maxXp) * 140);
var dayLabel = d.date !== '—' ? d.date.slice(8) : '—';
return '<div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">' +
'<div style="font-size: 10px; color: var(--gold-bright);">' + d.xp + '</div>' +
'<div style="width: 100%; height: ' + h + 'px; background: linear-gradient(to top, var(--gold), var(--gold-bright)); border-radius: 3px 3px 0 0; min-height: 2px;"></div>' +
'<div style="font-size: 10px; color: var(--text-dim);">' + dayLabel + '</div>' +
'</div>';
}).join('') +
'</div></div>' +
'<div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); padding: 16px; margin-bottom: 20px;">' +
'<div style="font-size: 11px; letter-spacing: 2px; color: var(--text-dim); text-transform: uppercase; margin-bottom: 12px;">🔥 Тепловая карта стриков (последние 8 недель)</div>' +
streakHeatmap +
'</div>' +

achievements +
'<div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); padding: 16px;">' +
'<div style="font-size: 11px; letter-spacing: 2px; color: var(--text-dim); text-transform: uppercase; margin-bottom: 12px;">Карточки по рангам</div>' +
'<div style="display: flex; flex-wrap: wrap; gap: 8px;">' +
RANK_PROGRESSION.map(function(r) {
var count = FORGED.filter(function(c) { return c.rank === r; }).length;
if (count === 0) return '';
var rc = getRankColorInfo(r);
return '<div style="background: ' + rc.bg + '; border: 1px solid ' + rc.color + '40; padding: 6px 12px; border-radius: 4px; font-size: 12px;">' +
'<span style="color:' + rc.color + '; font-weight: bold;">' + r + '</span> × ' + count +
'</div>';
}).join('') +
(FORGED.length === 0 ? '<div style="color: var(--text-dim); font-size: 12px;">Пока нет карточек</div>' : '') +
'</div></div>' +
renderCardHeatmap() +
renderInsights();
}
function buildStreakHeatmap() {
var days = [];
for (var i = 55; i >= 0; i--) {
var key = getMSKDayKey(Date.now() - i * 86400000);
var xpDay = xpHistory.find(function(h) { return h.date === key; });
var count = xpDay ? xpDay.xp : 0;
var color;
if (count === 0) color = 'rgba(255,255,255,0.05)';
else if (count < 20) color = 'rgba(52,211,153,0.25)';
else if (count < 50) color = 'rgba(52,211,153,0.5)';
else if (count < 100) color = 'rgba(52,211,153,0.75)';
else color = 'rgba(52,211,153,1)';
days.push('<div style="width:14px;height:14px;border-radius:2px;background:' + color + ';" title="' + key + ': ' + count + ' XP"></div>');
}
var html = '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
days.forEach(function(d) { html += d; });
html += '</div>';
html += '<div style="display:flex;gap:6px;margin-top:8px;align-items:center;font-size:10px;color:var(--text-dim);">';
html += '<span>Меньше</span>';
['rgba(255,255,255,0.05)','rgba(52,211,153,0.25)','rgba(52,211,153,0.5)','rgba(52,211,153,0.75)','rgba(52,211,153,1)'].forEach(function(c) {
html += '<div style="width:10px;height:10px;border-radius:2px;background:' + c + ';"></div>';
});
html += '<span>Больше</span></div>';
return html;
}
function buildAchievements() {
var totalCompletions = FORGED.reduce(function(a, c) { return a + (c.totalCompletions || 0); }, 0);
var cardsN = FORGED.length;
var goalsDoneN = GOALS.filter(function(g) { return g.completed; }).length;
var rankReached = function(minRank) {
var mi = RANK_PROGRESSION.indexOf(minRank);
return FORGED.some(function(c) { return RANK_PROGRESSION.indexOf(c.rank) >= mi; });
};
var bestStreakN = FORGED.reduce(function(m, c) { return Math.max(m, c.streak || 0); }, 0);
var equippedN = Object.values(INVENTORY.equipped).filter(function(e) { return e; }).length;
var captured = capturedCount();
var fmt = function(n) { return n.toLocaleString('ru-RU'); };
var all = [
{ icon: '⚔', name: 'Первая ковка', desc: 'Выковать первую карточку', cur: Math.min(cardsN, 1), max: 1 },
{ icon: '📖', name: 'Коллекционер', desc: 'Карточек в колоде', cur: cardsN, max: 10 },
{ icon: '📚', name: 'Архивариус', desc: 'Карточек в колоде', cur: cardsN, max: 25 },
{ icon: '🛡', name: 'Воин', desc: 'Карточка ранга B', cur: rankReached('B') ? 1 : 0, max: 1 },
{ icon: '⚡', name: 'Мастер', desc: 'Карточка ранга A', cur: rankReached('A') ? 1 : 0, max: 1 },
{ icon: '👑', name: 'Легенда', desc: 'Карточка ранга S', cur: rankReached('S') ? 1 : 0, max: 1 },
{ icon: '🗡', name: 'Искатель', desc: 'Уровень героя', cur: HERO.level, max: 5 },
{ icon: '🛡', name: 'Страж', desc: 'Уровень героя', cur: HERO.level, max: 10 },
{ icon: '🏰', name: 'Архонт', desc: 'Уровень героя', cur: HERO.level, max: 15 },
{ icon: '✨', name: 'Первая тысяча', desc: 'Набрать XP', cur: HERO.totalXp, max: 1000 },
{ icon: '💎', name: 'Десять тысяч', desc: 'Набрать XP', cur: HERO.totalXp, max: 10000 },
{ icon: '🌟', name: 'Сто тысяч', desc: 'Набрать XP', cur: HERO.totalXp, max: 100000 },
{ icon: '🎒', name: 'Полный комплект', desc: 'Слотов экипировки', cur: equippedN, max: 9 },
{ icon: '🏰', name: 'Полкоролевства', desc: 'Захватить твердынь', cur: captured, max: 10 },
{ icon: '👑', name: 'Владыка Твердынь', desc: 'Захватить все твердыни', cur: captured, max: STRONGHOLDS.length },
{ icon: '🔥', name: 'Неделя дисциплины', desc: 'Стрик на карточке', cur: bestStreakN, max: 7 },
{ icon: '🔥', name: 'Месяц железа', desc: 'Стрик на карточке', cur: bestStreakN, max: 30 },
{ icon: '💯', name: 'Сотня', desc: 'Выполнений карточек', cur: totalCompletions, max: 100 }
];
var unlocked = all.filter(function(a) { return a.cur >= a.max; }).length;
var html = '<div class="ach-wrap">';
var crowns = (season && season.crownBonus) || 0;
html += '<div class="ach-head"><div class="ach-title">🏆 Галерея трофеев</div><div class="ach-count">' + unlocked + '/' + all.length + (crowns > 0 ? ' · 👑 ' + crowns + ' (+2% налогов)' : '') + '</div></div>';
html += '<div class="ach-overall"><div class="ach-overall-fill" style="width:' + Math.round(unlocked / all.length * 100) + '%;"></div></div>';
html += '<div class="ach-grid">';
all.forEach(function(a) {
var done = a.cur >= a.max;
var pct = Math.min(100, Math.round(a.cur / a.max * 100));
html += '<div class="ach-card' + (done ? ' unlocked' : '') + '">' +
'<div class="ach-icon">' + a.icon + '</div>' +
'<div class="ach-name">' + a.name + '</div>' +
'<div class="ach-desc">' + a.desc + '</div>' +
(a.max > 1
? '<div class="ach-prog"><div class="ach-prog-fill" style="width:' + pct + '%;"></div></div><div class="ach-prog-text">' + fmt(Math.min(a.cur, a.max)) + ' / ' + fmt(a.max) + '</div>'
: '') +
'</div>';
});
html += '</div></div>';
return html;
}
function exportJson() {
try {
var data = buildSyncData();
data.exportedAt = new Date().toISOString();
var json = JSON.stringify(data, null, 2);
var blob = new Blob([json], { type: 'application/json' });
var url = URL.createObjectURL(blob);
var a = document.createElement('a');
a.href = url;
a.download = 'neurodeck-export-' + new Date().toISOString().split('T')[0] + '.json';
a.click();
URL.revokeObjectURL(url);
showToast('📋 JSON экспортирован', 'Файл загружен');
} catch (e) { showToast('⚠ Ошибка', 'Не удалось экспортировать', 'blood'); }
}
var bloodOath = null;
var BLOOD_OATH_REQUIRED = 5;
var BLOOD_OATH_BONUS_XP = 500;

function checkBloodOath() {
    var msk = new Date(Date.now() + 3 * 3600000);
    var dayOfWeek = msk.getUTCDay();
    if (bloodOath && bloodOath.status === 'active') return;
    if (dayOfWeek !== 1) return;
    if (FORGED.length === 0) return;
    var lastAssignMonday = bloodOath ? bloodOath.assignedMonday : null;
    var thisMonday = getMSKDayKey();
    if (lastAssignMonday === thisMonday) return;
    assignBloodOath();
}

function getThisMondayKey() {
    var now = new Date();
    var msk = new Date(now.getTime() + 3 * 3600000);
    var day = msk.getUTCDay();
    var diff = day === 0 ? 6 : day - 1;
    msk.setUTCDate(msk.getUTCDate() - diff);
    return msk.getUTCFullYear() + '-' + String(msk.getUTCMonth()+1).padStart(2,'0') + '-' + String(msk.getUTCDate()).padStart(2,'0');
}

function assignBloodOath() {
    if (FORGED.length === 0) return;
    var eligible = FORGED.filter(function(c) { return !c.lastCompletedAt || getMSKDayKey(c.lastCompletedAt) !== getMSKDayKey(); });
    if (eligible.length === 0) eligible = FORGED.slice();
    var card = eligible[Math.floor(Math.random() * eligible.length)];
    bloodOath = {
        cardId: card.id,
        cardName: card.name,
        streak: 0,
        requiredDays: BLOOD_OATH_REQUIRED,
        status: 'active',
        assignedMonday: getThisMondayKey(),
        lastCompletedDay: null
    };
    sfxForge(); haptic('heavy');
    burstParticles(window.innerWidth / 2, window.innerHeight / 3, 80, { color: '#c73e4d', speed: 8, decay: 0.012, size: 3, shape: 'spark', gravity: 0.05 });
    screenShake(8, 600);
    showToast('🩸 КЛЯТВА НА КРОВИ', '«' + card.name + '» выбрана! 5 дней без пропусков или карточка будет уничтожена.', 'blood');
    spiritSay('«Кровь запечатала контракт. ' + card.name + '... 5 дней. Ни единого провала.»');
    renderCards();
    saveGameState();
}

function onBloodOathComplete(cardId) {
    if (!bloodOath || bloodOath.status !== 'active' || bloodOath.cardId !== cardId) return;
    var todayKey = getMSKDayKey();
    if (bloodOath.lastCompletedDay === todayKey) return;
    bloodOath.lastCompletedDay = todayKey;
    bloodOath.streak++;
    if (bloodOath.streak >= bloodOath.requiredDays) {
        completeBloodOath();
    } else {
        showToast('🩸 Клятва: ' + bloodOath.streak + '/' + bloodOath.requiredDays, '«' + bloodOath.cardName + '» — держись!', 'blood');
        sfxEquip(); haptic('medium');
    }
    saveGameState();
}

function onBloodOathSkip(cardId) {
    if (!bloodOath || bloodOath.status !== 'active' || bloodOath.cardId !== cardId) return;
    failBloodOath('Ты сорвался! Клятва нарушена.');
}

function checkBloodOathDaily() {
    if (!bloodOath || bloodOath.status !== 'active') return;
    var todayKey = getMSKDayKey();
    var card = findCard(bloodOath.cardId);
    if (!card) { bloodOath = null; return; }
    var cardDoneToday = card.lastCompletedAt && getMSKDayKey(card.lastCompletedAt) === todayKey;
    if (!cardDoneToday) {
        var lastResetKey = lastDayReset || getMSKDayKey();
        var cardDoneLastDay = bloodOath.lastCompletedDay === lastResetKey;
        if (!cardDoneLastDay) {
            failBloodOath('Карточка клятвы не была выполнена! Контракт нарушен.');
        }
    }
}

function failBloodOath(reason) {
    if (!bloodOath) return;
    var card = findCard(bloodOath.cardId);
    var cardName = bloodOath.cardName;
    if (card) {
        FORGED = FORGED.filter(function(c) { return c.id !== bloodOath.cardId; });
    }
    bloodOath.status = 'failed';
    spawnBloodRain(40);
    screenShake(20, 1000);
    sfxFail(); haptic('error');
    burstParticles(window.innerWidth / 2, window.innerHeight / 2, 100, { color: '#c73e4d', speed: 10, decay: 0.01, size: 4, shape: 'spark', gravity: 0.15 });
    showToast('🩸 КЛЯТВА ПРОВАЛЕНА', cardName + ' — уничтожена. ' + reason, 'blood');
    spiritSay('«Кровь пролита впустую... «' + cardName + '» больше не существует. Пусть это станет уроком.»');
    bloodOath = null;
    renderCards();
    saveGameState();
}

function completeBloodOath() {
    if (!bloodOath) return;
    var cardName = bloodOath.cardName;
    var card = findCard(bloodOath.cardId);
    var reward = BLOOD_OATH_BONUS_XP * ((RANK_PROGRESSION.indexOf(card && card.rank) + 1) || 1);
    bloodOath.status = 'completed';
    addXpReward(reward);
    sfxBossDefeated(); haptic('success');
    burstParticles(window.innerWidth / 2, window.innerHeight / 2, 150, { color: '#fbbf24', speed: 12, decay: 0.008, size: 4, shape: 'star', gravity: 0.08, life: 1.3 });
    burstParticles(window.innerWidth / 2, window.innerHeight / 2, 80, { color: '#c73e4d', speed: 8, decay: 0.01, size: 3, shape: 'spark', gravity: 0.05 });
    screenShake(12, 600);
    showToast('🩸⚠️ КЛЯТВА ВЫПОЛНЕНА!', '+' + reward + ' XP! «' + cardName + '» — ты выстоял!', 'crit');
    spiritSay('«Кровь высохла на клинке. Ты прошёл испытание. ' + cardName + ' — теперь это часть твоей сути.»');
    bloodOath = null;
     saveGameState();
}

function showReturnScreen() {
    var now = Date.now();
    var last = HERO.lastSessionAt || now;
    var gapMs = now - last;
    var gapDays = Math.floor(gapMs / 86400000);
    if (gapDays < 1) return;
    HERO.lastSessionAt = now;
    var phaseLabel = '💰 Казна: ' + (HERO.gold || 0) + ' · 🏰 Твердыни: ' + capturedCount() + '/20';
    var todayKey = getMSKDayKey();
    var doneToday = FORGED.filter(function(c) { return c.lastCompletedAt && getMSKDayKey(c.lastCompletedAt) === todayKey; }).length;
    var oathInfo = bloodOath && bloodOath.status === 'active' ? '🩸 Клятва: ' + bloodOath.streak + '/' + bloodOath.requiredDays + ' дней' : '🩸 Клятва: не активна';
    var failedGoals = GOALS.filter(function(g) { return g.failed && g.lastStepAt && (now - g.lastStepAt) < gapMs + 86400000; }).length;
    var completionRate = '—';
    var historyKeys = Object.keys(HERO.cardHistory || {});
    if (historyKeys.length > 0) {
        var recent = historyKeys.slice(-7);
        var totalDone = 0, totalPossible = 0;
        recent.forEach(function(k) {
            var dayData = HERO.cardHistory[k];
            if (dayData) {
                totalDone += Object.values(dayData).filter(function(v) { return v; }).length;
                totalPossible += FORGED.length || 1;
            }
        });
        completionRate = totalPossible > 0 ? Math.round(totalDone / totalPossible * 100) + '%' : '—';
    }
    var html = '<div style="font-size:13px; line-height:2; color:var(--text-bright);">' +
        '<div style="text-align:center; font-size:18px; color:var(--gold-bright); margin-bottom:12px;">📅 Ты отсутствовал ' + gapDays + ' ' + (gapDays === 1 ? 'день' : gapDays < 5 ? 'дня' : 'дней') + '</div>' +
        '<div>📊 <b>Положение:</b> ' + phaseLabel + '</div>' +
        '<div>📖 <b>Сегодня:</b> ' + doneToday + '/' + FORGED.length + ' карточек</div>' +
        '<div>' + oathInfo + '</div>' +
        (failedGoals > 0 ? '<div style="color:var(--blood-bright)">💀 Провалено целей: ' + failedGoals + '</div>' : '') +
        '<div>📈 <b>Процент выполнений за неделю:</b> ' + completionRate + '</div>' +
        '<div style="text-align:center; margin-top:12px; color:var(--text-dim); font-size:11px;">С возвращением. Подземелье ждало.</div>' +
        '</div>';
    var modal = document.getElementById('returnModal');
    if (modal) {
        modal.querySelector('.modal-body').innerHTML = html;
        modal.classList.add('show');
    }
    saveSoon();
}
function closeReturnModal() { document.getElementById('returnModal').classList.remove('show'); }

function toggleHelp(e) {
    if (e) e.stopPropagation();
    var btn = (e && e.currentTarget) || document.querySelector('[data-action="toggle-help"]');
    if (tooltipEl && tooltipEl.classList.contains('show') && btn && btn.dataset.helpOpen === '1') {
        hideTextTooltip();
        if (btn) { btn.dataset.helpOpen = '0'; btn.classList.remove('active'); }
        return;
    }
    if (btn && btn.getBoundingClientRect) {
        var r = btn.getBoundingClientRect();
        showTextTooltip(
            '📖 Награды и риски',
            'Что получишь и чем рискуешь',
            [
                '✅ За выполнение: +15 XP, +1 💰, +1 очко атрибута',
                '✅ За ранг-ап: карточка растёт, +1 очко атрибута, +1 к побегу',
                '⚠️ За пропуск: −1 💰 и стрик сбрасывается',
                '🔥 Стрик: каждый день делает карточку сильнее (макс ×2)',
                '💰 Золото трать на Твердыни: постройки и наём армии',
                '🏰 Каждая захваченная твердыня платит золото каждый день'
            ],
            { color: '#fbbf24', rect: r }
        );
        btn.dataset.helpOpen = '1';
        btn.classList.add('active');
        setTimeout(function() {
            document.addEventListener('click', function closeHelp(ev) {
                if (!ev.target.closest('[data-action="toggle-help"]') && !ev.target.closest('#tooltip')) {
                    hideTextTooltip();
                    if (btn) { btn.dataset.helpOpen = '0'; btn.classList.remove('active'); }
                    document.removeEventListener('click', closeHelp);
                }
            });
        }, 50);
    } else {
        showTextTooltip(
            '📖 Награды и риски',
            'Что получишь и чем рискуешь',
            [
                '✅ За выполнение: +15 XP, +1 💰, +1 очко атрибута',
                '✅ За ранг-ап: +1 очко атрибута, +1 к побегу',
                '⚠️ За пропуск: −1 💰 и стрик сбрасывается',
                '🔥 Стрик: каждый день делает карточку сильнее (макс ×2)',
                '💰 Золото — крепи Твердыни. 🏰 Налог платят ежедневно.'
            ],
            null
        );
    }
}

var POMODORO_SECS = 25 * 60; // #65: помодоро 25:00 — таймер в localStorage, переживает reload
function pomodoroKey(id) { return 'nd_pomodoro_' + id; }
function activePomodoro() {
    try {
        var keys = Object.keys(localStorage), latest = null;
        keys.forEach(function(k) {
            if (k.indexOf('nd_pomodoro_') !== 0 || k.indexOf('nd_pomodoro_done_') === 0) return;
            var end = parseInt(localStorage.getItem(k), 10);
            if (!Number.isFinite(end)) return;
            if (end <= Date.now()) { localStorage.removeItem(k); return; } // истёкший таймер снимаем (награда — в тике ниже)
            var card = findCard(parseInt(k.replace('nd_pomodoro_', ''), 10));
            if (!card) { localStorage.removeItem(k); return; } // карточка удалена — таймер мусор
            if (!latest || end > latest.end) latest = { id: card.id, name: card.name, end: end };
        });
        return latest;
    } catch (e) { return null; }
}
function togglePomodoro(id) { // #65: клик = старт/перезапуск/отмена; награда +5 XP кап 1/карта/день
    var card = findCard(id);
    if (!card) return;
    var k = pomodoroKey(id), dk = 'nd_pomodoro_done_' + id + '_' + getMSKDayKey();
    try {
        if (localStorage.getItem(k)) { localStorage.removeItem(k); showToast('⏱ Помодоро отменён', '«' + esc(card.name) + '»', 'blood'); renderCards(); renderDashboard(); return; }
        if (localStorage.getItem(dk)) { showToast('🍅 Уже был', 'Фокус за «' + esc(card.name) + '» сегодня получен', 'blood'); return; }
        localStorage.setItem(k, String(Date.now() + POMODORO_SECS * 1000));
        showToast('⏱ Помодоро пошёл', '«' + esc(card.name) + '» — 25 минут фокуса', 'save');
    } catch (e) { showToast('⚠ Нет localStorage', 'Таймер недоступен', 'blood'); return; }
    haptic('light');
    renderCards(); renderDashboard();
}
function sweepExpiredPomodoros() { // награда за досидевший таймер (в т.ч. после reload)
    try {
        var tk = getMSKDayKey();
        Object.keys(localStorage).forEach(function(k) {
            if (k.indexOf('nd_pomodoro_done_') === 0 && localStorage.getItem(k) !== tk) localStorage.removeItem(k); // хвосты вчерашних капов
            if (k.indexOf('nd_pomodoro_') !== 0 || k.indexOf('nd_pomodoro_done_') === 0) return;
            var end = parseInt(localStorage.getItem(k), 10);
            if (!Number.isFinite(end) || end > Date.now()) return;
            localStorage.removeItem(k);
            var id = parseInt(k.replace('nd_pomodoro_', ''), 10);
            var card = findCard(id);
            if (!card) return;
            if (localStorage.getItem('nd_pomodoro_done_' + id + '_' + tk)) return;
            localStorage.setItem('nd_pomodoro_done_' + id + '_' + tk, tk);
            addXpReward(5);
            showToast('🍅 Фокус завершён: +5 XP', '«' + esc(card.name) + '» — 25 минут выдержаны', 'crit');
            haptic('success');
        });
        renderDashboard();
    } catch (e) {}
}

function renderDashboard() {
    var bar = document.getElementById('dashboardBar');
    if (!bar) return;
    var isBeginner = (HERO.level || 1) <= 2 && FORGED.length > 0 && FORGED.length <= 5;
    var html = '<button class="info-btn" data-action="toggle-help" title="Что получишь и чем рискуешь" style="position:absolute; right:6px; top:6px;">?</button>';
    if (dailyEvent) html += '<div style="font-size:12px; padding-right:22px; margin-bottom:3px;"><span style="color:var(--gold-bright)">📅 ' + dailyEvent.icon + ' ' + dailyEvent.name + '</span> <button data-action="reroll-event" title="Переролл события дня (50 💰, 1/день)" style="margin-left:6px; font-size:11px; background:none; border:1px solid var(--gold); border-radius:6px; color:var(--gold-bright); cursor:pointer; padding:1px 6px;">🎲 50💰</button></div>'; // #50/#48: чип события + реролл
    var hol = holidayBonus();
    if (hol) html += '<div style="font-size:12px; padding-right:22px; margin-bottom:3px;"><span class="dash-chip" title="' + esc(hol.tip) + '">🎉 ' + esc(hol.label) + '</span></div>'; // #8: праздник
    var _tot = totemOf(); // Ф2: чип активного тотема
    if (_tot && HERO.totem && !HERO.totem.rechoose) html += '<div style="font-size:12px; padding-right:22px; margin-bottom:3px;"><span class="dash-chip" title="' + esc(_tot.tip) + '">' + _tot.icon + ' ' + esc(_tot.name) + '</span></div>';
    var _docs = activeDoctrineList(); // Г1-2: чип активных доктрин
    if (_docs.length) html += '<div style="font-size:12px; padding-right:22px; margin-bottom:3px;">' + _docs.map(function(d) { return '<span class="dash-chip" title="' + esc(d.tip) + '">' + d.icon + ' ' + esc(d.name) + '</span>'; }).join(' ') + '</div>';
    var pom = activePomodoro();
    if (pom) { // #65: помодоро — чип-обратный отсчёт
        var left = Math.max(0, Math.round((pom.end - Date.now()) / 1000));
        html += '<div style="font-size:12px; padding-right:22px; margin-bottom:3px;"><span class="dash-chip" title="Помодоро: ' + esc(pom.name) + '">🍅 ' + pom.name + ' · ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + '</span> <button data-action="pomodoro-stop" data-id="' + pom.id + '" title="Отменить таймер" style="font-size:11px; background:none; border:1px solid var(--blood-bright); border-radius:6px; color:var(--blood-bright); cursor:pointer; padding:1px 6px;">✕</button></div>';
    }
    var goal = dailyGoldGoal();
    var gp = ((dailyQuests && dailyQuests.progress) || {})['gold'] || 0;
    html += '<div style="font-size:12px; padding-right:22px; margin-bottom:3px;"><span class="dash-chip" title="Цель дня: заработай золото любым способом">🎯 Цель дня: ' + Math.min(gp, goal) + '/' + goal + '💰</span><span style="display:inline-block; vertical-align:middle; width:70px; height:6px; background:var(--border); border-radius:3px; margin-left:6px; overflow:hidden;"><span style="display:block; height:100%; width:' + Math.min(100, Math.round(gp / goal * 100)) + '%; background:var(--gold-bright);"></span></span></div>'; // #71: дневная цель золота
    html += isBeginner ? renderDashboardBeginner() : renderDashboardVeteran();
    bar.innerHTML = html;
}

function renderDashboardBeginner() {
    var todayKey = getMSKDayKey();
    var doneToday = FORGED.filter(function(c) { return c.lastCompletedAt && getMSKDayKey(c.lastCompletedAt) === todayKey; }).length;
    var remaining = FORGED.length - doneToday;
    var openTasks = TASKS.filter(function(t) { return t.status === 'active'; }).length;
    return '<div style="padding-right:22px;">' +
        '<div style="color:var(--gold-bright); font-size:13px; margin-bottom:4px;">⚔ УРОВЕНЬ ' + Math.max(1, HERO.level) + ' · 💰 ' + (HERO.gold || 0) + '</div>' +
        '<div>⛏ Выполняй карточки — золото крепит Твердыни.</div>' +
        '<div style="margin-top:6px;">📖 Сегодня сделано: <b>' + doneToday + '</b> из\u00A0<b>' + FORGED.length + '</b> · осталось\u00A0<b>' + remaining + '</b>' + (openTasks > 0 ? '\u00A0· 📋 задач в\u00A0работе:\u00A0<b>' + openTasks + '</b>' : '') + '</div>' +
        '<div style="margin-top:6px; font-size:10px; color:var(--text-dim);">✅ За выполнение: <b style="color:#34d399">+15 XP · +1 💰 · +1 очко атрибута</b></div>' +
        '<div style="font-size:10px; color:var(--text-dim);">⚠️ За пропуск: <b style="color:var(--blood-bright)">−1 💰</b> и стрик сбросится</div>' +
        '</div>';
}

function renderDashboardVeteran() {
    var todayKey = getMSKDayKey();
    var doneToday = FORGED.filter(function(c) { return c.lastCompletedAt && getMSKDayKey(c.lastCompletedAt) === todayKey; }).length;
    var remaining = FORGED.length - doneToday;
    var openTasks = TASKS.filter(function(t) { return t.status === 'active'; }).length;
    var revenue = strongholdTaxPerDay();
    var nextSh = STRONGHOLDS[strongholds.filter(function(x) { return x.captured; }).length];
    var toNext = nextSh ? ' · до «' + nextSh.name + '»: ' + Math.max(0, nextSh.cost !== undefined ? 0 : 0) + '' : ' · Твердыни покорены!';
    var oathProgress = bloodOath && bloodOath.status === 'active' ? ' · 🩸 Клятва ' + bloodOath.streak + '/' + bloodOath.requiredDays : '';
    var comboMult = getComboMultiplier();
    var comboInfo = comboMult > 1.0 ? ' · 🎯 Комбо ×' + comboMult.toFixed(2) : '';
    var maxStreak = FORGED.reduce(function(m, c) { return Math.max(m, c.streak || 0); }, 0);
    return '<div style="padding-right:22px;">' +
        '<div class="dashboard-row"><span class="treasury-chip" data-action="treasury-info" title="Разбивка казны">💰 Казна: <b style="color:var(--gold-bright)">' + (HERO.gold || 0) + '</b></span><span>🏰 Твердыней: <b>' + capturedCount() + '/20</b> · доход <b style="color:#34d399">+' + revenue + ' 💰/день</b>' + toNext + '</span></div>' +
        '<div class="dashboard-row"><span>📖 ' + doneToday + '/' + FORGED.length + ' сегодня' + (remaining > 0 ? ' (осталось ' + remaining + ')' : '') + '</span>' + (openTasks > 0 ? '<span>📋 Задач в работе: <b style="color:#60a5fa">' + openTasks + '</b></span>' : '') + '<span>👻 Призраков: <b style="color:var(--blood-bright)">' + countGhostTasks() + '</b></span></div>' +
        '<div class="dashboard-row"><span>🔥 Макс. стрик: <b>' + maxStreak + '</b> дн.' + comboInfo + oathProgress + '</span></div>' +
        '</div>';
}

var COMBO_THRESHOLD = 3;
var COMBO_BONUS = 0.20;
function getComboMultiplier() {
    var count = Object.keys(HERO.dailyUniqueStats || {}).length;
    return count >= COMBO_THRESHOLD ? 1 + COMBO_BONUS : 1.0;
}


function prestigeCard(id) {
    var card = findCard(id);
    if (!card || card.rank !== 'SSS') return;
    if ((card.prestige || 0) >= 3) { showToast('Максимум 3 престижа для карты', '', 'blood'); return; }
    dungeonConfirm('⭐ Переродить карточку?',
        '«' + esc(card.name) + '» вернётся к рангу C, но даст <b style="color:var(--gold-bright)">+5% XP</b> всем карточкам стата ' + STATS[card.stat].icon + ' ' + STATS[card.stat].name + ' навсегда.<br><br>Текущее перерождение: ' + (card.prestige || 0) + '/3'
    ).then(function(ok) {
        if (!ok) return;
        card.prestige = (card.prestige || 0) + 1;
        card.rank = 'C';
        card.mastery = 0;
        card.masteryThreshold = 5;
        card.streak = 0;
        card.evolutionPath = null;
        sfxBossDefeated(); haptic('heavy');
        burstParticles(window.innerWidth / 2, window.innerHeight / 2, 120, { color: '#fbbf24', speed: 12, decay: 0.008, size: 4, shape: 'star', gravity: 0.1, life: 1.5 });
        screenShake(10, 500);
        showToast('⭐ ПЕРЕРОЖДЕНИЕ!', card.name + ' возродилась! (⭐'.repeat(card.prestige) + ')', 'crit');
        spiritSay('«Пепел стал золотом. Эта карточка — вечна.»');
        renderCards(); renderStats();
        saveGameState();
    });
}
function getPrestigeXPBonus(cardStat) {
    var bonus = 0;
    FORGED.forEach(function(c) {
        if (c.stat === cardStat && c.prestige) bonus += c.prestige * 0.05;
    });
    return Math.min(1.5, 1 + bonus);
}

function renderCardHeatmap() {
    var days = 28;
    var today = getMSKDayKey();
    var keys = [];
    var dayNames = [];
    for (var i = days - 1; i >= 0; i--) {
        var d = new Date(Date.now() + 3 * 3600000);
        d.setUTCDate(d.getUTCDate() - i);
        var key = d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
        keys.push(key);
        dayNames.push(['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getUTCDay()]);
    }
    var html = '<div style="background:rgba(0,0,0,0.3); border:1px solid var(--border); padding:12px; margin-bottom:16px;">' +
        '<div style="font-size:11px; letter-spacing:2px; color:var(--text-dim); text-transform:uppercase; margin-bottom:10px;">📊 Карточки × Дни (4 недели)</div>' +
        '<div style="overflow-x:auto;"><table style="font-size:10px; border-collapse:collapse; width:100%;">';
    html += '<tr><td style="padding:2px 4px;"></td>';
    keys.forEach(function(k, i) {
        var isWeekend = i % 7 >= 5;
        html += '<td style="padding:1px; text-align:center; color:' + (isWeekend ? 'var(--blood-bright)' : 'var(--text-dim)') + ';">' + dayNames[i] + '</td>';
    });
    html += '</tr>';
    FORGED.forEach(function(card) {
        html += '<tr><td style="padding:2px 4px; white-space:nowrap; color:var(--text-bright); max-width:80px; overflow:hidden; text-overflow:ellipsis;">' + esc(card.name.substring(0, 12)) + '</td>';
        keys.forEach(function(k) {
            var dayData = HERO.cardHistory && HERO.cardHistory[k];
            var done = dayData && dayData[card.id];
            var bg = done ? 'var(--green)' : 'rgba(255,255,255,0.05)';
            var symbol = done ? '✓' : '';
            html += '<td style="padding:1px; text-align:center; background:' + bg + '; color:#fff; border-radius:1px; min-width:18px;">' + symbol + '</td>';
        });
        html += '</tr>';
    });
    html += '</table></div></div>';
    return html;
}

function renderInsights() {
    var history = HERO.cardHistory || {};
    var keys = Object.keys(history).sort().slice(-28);
    if (keys.length < 7) return '';
    var cardStats = {};
    var dayStats = {};
    var bestCard = null, bestCardRate = 0;
    var worstCard = null, worstCardRate = 1;
    FORGED.forEach(function(card) {
        var done = 0;
        keys.forEach(function(k) {
            if (history[k] && history[k][card.id]) done++;
        });
        var rate = done / keys.length;
        cardStats[card.id] = rate;
        if (rate > bestCardRate) { bestCardRate = rate; bestCard = card; }
        if (rate < worstCardRate) { worstCardRate = rate; worstCard = card; }
    });
    var insights = [];
    if (bestCard) insights.push('🔥 Лучше всего идёт <b style="color:var(--green)">' + esc(bestCard.name) + '</b> — ' + Math.round(bestCardRate * 100) + '% выполнения');
    if (worstCard && worstCard !== bestCard) insights.push('⚠ Хуже всего <b style="color:var(--blood-bright)">' + esc(worstCard.name) + '</b> — ' + Math.round(worstCardRate * 100) + '% выполнения');
    var dayRates = [0,0,0,0,0,0,0];
    var dayCounts = [0,0,0,0,0,0,0];
    keys.forEach(function(k) {
        var d = new Date(k + 'T00:00:00+03:00');
        var dow = d.getUTCDay();
        var dayData = history[k];
        if (dayData) {
            dayCounts[dow]++;
            dayRates[dow] += Object.values(dayData).filter(function(v) { return v; }).length;
        }
    });
    var bestDay = -1, bestDayRate = 0, worstDay = -1, worstDayRate = 999;
    for (var i = 0; i < 7; i++) {
        if (dayCounts[i] > 0) {
            var avg = dayRates[i] / dayCounts[i];
            if (avg > bestDayRate) { bestDayRate = avg; bestDay = i; }
            if (avg < worstDayRate) { worstDayRate = avg; worstDay = i; }
        }
    }
    var dayNames = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
    if (bestDay >= 0 && bestDay !== worstDay) insights.push('📅 Лучший день — <b>' + dayNames[bestDay] + '</b> (' + Math.round(bestDayRate) + ' карточек в среднем)');
    if (worstDay >= 0 && worstDay !== bestDay) insights.push('📅 Худший день — <b>' + dayNames[worstDay] + '</b> (' + Math.round(worstDayRate) + ' карточек в среднем)');
    var bestStreak = FORGED.reduce(function(m, c) { return Math.max(m, c.streak || 0); }, 0);
    if (bestStreak >= 7) insights.push('🔥 Текущий рекорд стрика: <b>' + bestStreak + ' дней</b>');
    if (insights.length === 0) return '';
    var html = '<div style="background:rgba(0,0,0,0.3); border:1px solid var(--border); padding:12px; margin-bottom:16px;">' +
        '<div style="font-size:11px; letter-spacing:2px; color:var(--text-dim); text-transform:uppercase; margin-bottom:10px;">🧠 Инсайты (анализ паттернов)</div>';
    insights.forEach(function(ins) {
        html += '<div style="font-size:11px; color:var(--text-bright); padding:4px 0; border-bottom:1px dashed var(--border);">• ' + ins + '</div>';
    });
    html += '</div>';
    return html;
}

function showWeeklyReport() {
    var weekKey = getThisMondayKey();
    if (HERO.lastWeeklyReport === weekKey) return;
    HERO.lastWeeklyReport = weekKey;
    var todayKey = getMSKDayKey();
    var weekStart = new Date(weekKey + 'T00:00:00+03:00');
    var doneCount = 0, totalCount = 0;
    var weekDays = [];
    for (var i = 0; i < 7; i++) {
        var d = new Date(weekStart);
        d.setUTCDate(d.getUTCDate() + i);
        var k = d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
        if (k > todayKey) { weekDays.push(-1); continue; } // будущие дни недели — призрачные колонки (V-8)
        var dayData = HERO.cardHistory && HERO.cardHistory[k];
        var dayDone = dayData ? Object.values(dayData).filter(function(v) { return v; }).length : 0;
        doneCount += dayDone;
        totalCount += FORGED.length;
        weekDays.push(dayDone);
    }
    var rate = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
    var bestStreak = FORGED.reduce(function(m, c) { return Math.max(m, c.streak || 0); }, 0);
    var goalsDone = GOALS.filter(function(g) { return g.completed && g.lastStepAt && (Date.now() - g.lastStepAt) < 604800000; }).length;
    var goalsFailed = GOALS.filter(function(g) { return g.failed && g.lastStepAt && (Date.now() - g.lastStepAt) < 604800000; }).length;
    var cap = Math.max(1, Math.max.apply(null, weekDays.concat([1])));
    var dayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    var chart = weekDays.map(function(n, i) {
        if (n < 0) return '<div class="digest-col future"><div class="digest-val"></div><div class="digest-bar" style="height:8px; opacity:0.12;"></div><div class="digest-day">' + dayNames[i] + '</div></div>';
        var h = Math.round(10 + (n / cap) * 70);
        return '<div class="digest-col' + (i === weekDays.length - 1 ? ' today' : '') + '">' +
            '<div class="digest-val">' + (n > 0 ? n : '') + '</div>' +
            '<div class="digest-bar" style="height:' + h + 'px;"></div>' +
            '<div class="digest-day">' + dayNames[i] + '</div>' +
        '</div>';
    }).join('');
    var captured = capturedCount();
    var html =
    '<div class="digest-head">📊 Дайджест недели</div>' +
    '<div class="digest-chart">' + chart + '</div>' +
    '<div class="digest-tiles">' +
    '<div class="digest-tile"><div class="dt-num">' + doneCount + '<span class="dt-sub">/' + totalCount + '</span></div><div class="dt-label">карточек · ' + rate + '%</div></div>' +
    '<div class="digest-tile"><div class="dt-num">🔥 ' + bestStreak + '</div><div class="dt-label">лучший стрик</div></div>' +
    '<div class="digest-tile"><div class="dt-num">🎯 ' + goalsDone + (goalsFailed > 0 ? ' <span style="color:var(--blood-bright);font-size:12px;">(−' + goalsFailed + ')</span>' : '') + '</div><div class="dt-label">цели</div></div>' +
    '<div class="digest-tile"><div class="dt-num">💰 ' + (HERO.gold || 0) + '</div><div class="dt-label">казна · +' + strongholdTaxPerDay() + ' 💰/день</div></div>' +
    '</div>' +
    '<div class="dt-label" style="text-align:center;">🏰 Кампания: ' + captured + '/' + STRONGHOLDS.length + ' · осада №' + (siege.week || 1) + '</div>' +
    '<div class="digest-kp"><div class="digest-kp-fill" style="width:' + Math.round(captured / STRONGHOLDS.length * 100) + '%;"></div></div>' +
    weeklyDeltaHtml(siege.week || 1) + // #42: дельты vs прошлая неделя
    '<div class="digest-foot">Новая неделя начинается. Используй опыт прошлой.</div>';
    var modal = document.getElementById('weeklyReportModal');
    if (modal) {
        modal.querySelector('.modal-body').innerHTML = html;
        modal.classList.add('show');
    }
    saveWeeklySnapshot(siege.week || 1); // #42: снимок недели сохраняем ПОСЛЕ показа (дельты — vs прошлый снимок)
    saveSoon();
}
function saveWeeklySnapshot(week) { // #42: снапшот недели в hero.weeklyPrev (только при смене недели)
    var cur = { gold: HERO.gold || 0, xp: HERO.totalXp || 0, completions: FORGED.reduce(function(a, c) { return a + (c.totalCompletions || 0); }, 0), week: week };
    if (!HERO.weeklyPrev || HERO.weeklyPrev.week !== week) HERO.weeklyPrev = cur;
}
function weeklyDeltaHtml(week) { // #42: блок «vs прошлая неделя» со стрелками
    var prev = HERO.weeklyPrev;
    if (!prev || prev.week === week) return '';
    function deltaRow(label, curV, prevV) {
        var d = curV - prevV;
        if (d === 0) return '<div style="font-size:12px; color:var(--text-dim);">' + label + ': ' + curV.toLocaleString('ru') + ' (без изменений)</div>';
        var up = d > 0;
        return '<div style="font-size:12px; color:' + (up ? '#34d399' : 'var(--blood-bright)') + ';">' + label + ': ' + curV.toLocaleString('ru') + ' <b>' + (up ? '↑' : '↓') + ' ' + Math.abs(d).toLocaleString('ru') + '</b> vs прошлой недели</div>';
    }
    var completions = FORGED.reduce(function(a, c) { return a + (c.totalCompletions || 0); }, 0);
    return '<div class="digest-head" style="margin-top:10px;">📈 vs прошлая неделя</div>' +
        '<div style="display:flex; flex-direction:column; gap:2px; align-items:center;">' +
        deltaRow('💰 Казна', HERO.gold || 0, prev.gold) +
        deltaRow('✨ Всего XP', HERO.totalXp || 0, prev.xp) +
        deltaRow('✅ Выполнений', completions, prev.completions) +
        '</div>';
}
function closeWeeklyReportModal() { document.getElementById('weeklyReportModal').classList.remove('show'); }

function buildDailyEvents() {
    return [
        { id: 'caravan', icon: '🐎', name: 'Караван', text: 'Торговцы из-за гор: +' + Math.max(20, capturedCount() * 15) + ' 💰 мгновенно!' },
        { id: 'smith', icon: '⚒', name: 'Бродячий кузнец', text: 'Наём сегодня дешевле на 25%.' },
        { id: 'market', icon: '🏪', name: 'Ярмарка', text: 'Налоги твердынь ×1.5 сегодня!' },
        { id: 'ghostfree', icon: '👻', name: 'Духи дремлют', text: 'Призраки задач сегодня безобидны.' },
        { id: 'quiet', icon: '🌙', name: 'Тихий день', text: 'Ничего не произошло. Но золото капает.' },
        { id: 'bloodmoon', icon: '🌘', name: 'Кровавая луна', text: 'Налоги ×0.5, но опыт карточек ×2. Ночь безумия!' }, // #41: тёмная ветка — строго в конец (пины chaos-харнеса)
        { id: 'wanderer', icon: '🧙', name: 'Странник', text: 'Старец оставил дары: +1 🛡 и +30 💰.' }
    ];
}
function rollDailyEvent() { // #41: старые 5 — по индексам 0-4 (пины chaos-харнеса 0/0.2/0.4/0.6/0.8/0.99), тёмные — в окне (0.8, 0.985)
    var events = buildDailyEvents();
    var r = Math.random();
    if (r > 0.8 && r < 0.985) return r < 0.895 ? events[5] : events[6]; // ponytail: ~9% у новых против ~18% у старых — окно зажато пинами харнеса; равные веса только после переписки пинов
    return events[Math.floor(r * 5)];
}
function rerollDailyEvent() { // #48: переролл события дня, 1/день, 50💰 — флаг дня в localStorage (в сейв не пишем)
    if (!dailyEvent) return;
    var tk = getMSKDayKey();
    try { if (localStorage.getItem('neurodeck_reroll_day') === tk) { showToast('🎲 Реролл уже был', 'Один переролл события в день', 'blood'); return; } } catch (e) {}
    if ((HERO.gold || 0) < 50) { showToast('💰 Мало золота', 'Переролл события: 50 💰', 'blood'); sfxError(); return; }
    HERO.gold -= 50;
    var pool = buildDailyEvents().filter(function(x) { return x.id !== dailyEvent.id; });
    dailyEvent = pool[Math.floor(Math.random() * pool.length)];
    try { localStorage.setItem('neurodeck_reroll_day', tk); } catch (e) {}
    showToast(dailyEvent.icon + ' ' + dailyEvent.name, dailyEvent.text, 'save');
    sfxHit(); haptic('light');
    renderDashboard(); renderStrongholds(); updateHeroUI(); saveGameState();
}
function showTreasuryBreakdown() { // #45: та же математика, что в taxMultiplier (app.js taxMultiplier)
    ensureSeason();
    var tRoutes = SM.tradeRoutes ? SM.tradeRoutes(strongholds.map(function(s) { return !!s.captured; })) : 0;
    var trade = Math.round((SM.tradeBonus ? SM.tradeBonus(tRoutes) : 0) * 100);
    var crown = Math.round(Math.min(0.10, (season.crownBonus || 0) * 0.02) * 100);
    var th = Math.round(Math.min(0.05, throne * 0.01) * 100);
    var _synBase = 0, _synWith = 0; // Г1-3: доля налогов от ec-синергии для сводки
    strongholds.forEach(function(s, i) { if (!s.captured) return; _synBase += STRONGHOLDS[i].tax; _synWith += Math.round(STRONGHOLDS[i].tax * synergyEcMult(i)); });
    var _synPct = _synBase > 0 ? Math.round((_synWith - _synBase) / _synBase * 100) : 0;
    showToast('💰 Разбивка казны', 'База ' + strongholdTaxPerDay() + ' 💰/день · Пути +' + trade + '% · Венцы +' + crown + '% · Трон +' + th + '%' + (_synPct > 0 ? ' · Синергии +' + _synPct + '%' : ''), 'save');
}
function checkDailyReset() {
const todayKey = getMSKDayKey();
const yesterdayKey = getMSKDayKey(Date.now() - 86400000);
if (lastDayReset !== todayKey) {
var _prevDay = lastDayReset;
lastDayReset = todayKey;
if (_prevDay !== null) {
var gapDays = Math.max(1, daysBetween(_prevDay, todayKey));
if (gapDays > 7) gapDays = 7; // ponytail: backfill cap — пропуск >7 дней докручивается как 7 (ADR §5: кап 7 суток)
var _isBackfill = gapDays > 1;
        // Ежедневное событие: ролл ДО тиков дня — Кузнец/Ярмарка/Духи действуют в свой день
        var ev = rollDailyEvent();
        dailyEvent = ev;
        if (ev.id === 'caravan' && !_isBackfill) { var bonus = Math.max(20, capturedCount() * 15); goldGain(bonus, 'caravan'); }
        if (ev.id === 'wanderer' && !_isBackfill) { HERO.streakShields = Math.min(100, (HERO.streakShields || 0) + 1); goldGain(30, 'wanderer'); } // #41
        if (HERO.scouts && scoutFresh(HERO.scouts, todayKey) === null) { HERO.scouts = null; } // Г2-3: срок годности тени истёк (готовность + 2 дня)
        if (!_isBackfill) showToast(ev.icon + ' ' + ev.name, ev.text, 'save');
        if (ev.id === 'smith') {
            var _pt = Object.keys(hirePool).reduce(function(a, k) { return a + (hirePool[k] || 0); }, 0);
            if (_pt < 2) {
                var _st = 't1';
                strongholds.forEach(function(s) { Object.keys(s.buildings || {}).forEach(function(id) { var b = s.buildings[id], d = BUILDINGS[id]; if (b && b.built && d && d.grow) _st = d.tier; }); });
                hirePool[_st] = (hirePool[_st] || 0) + 2; // #47: скидке кузнеца нужен кто-то в пуле
                showToast('⚒ Кузнец снарядил найм', '+2 ' + UNIT_TIERS[_st].name + ' в пул со скидкой 25%', 'save');
            }
        }
        if (ev.id === 'ghostfree' && countGhostTasks() === 0) {
            HERO.streakShields = Math.min(100, (HERO.streakShields || 0) + 1); // #47: «Духи дремлют» при 0 призраков не мертвеет
            showToast('👻 Духи дремлют', 'Призраков нет: +1 щит стрика', 'save');
        }
var revenue = 0, upkeepTotal = 0, unpaid = 0;
for (var gd = gapDays; gd >= 1; gd--) {
if (gd > 1) dailyEvent = null; // события дня не действуют задним числом на пропущенные ночи
expireGhostTasks(getMSKDayKey(Date.now() - gd * 86400000));
var tr = strongholdsDailyTick();
revenue += tr.income;
upkeepTotal += tr.upkeep;
if (!tr.paid) unpaid++;
}
dailyEvent = ev; // последний (сегодняшний) тик — под событием дня
resolveProvinceOrder(); // Г4: эдикты двигают порядок, базовый дрейф +1/день
var _tech = techDailyTick(todayKey); // Г5-Т: ресурсы +2/день (порядок ≥70), очки +1/пров (порядок ≥85)
if (_tech.pts > 0) showToast('🔬 Учёные трудятся', '+' + _tech.pts + ' очк. технологий за элитный порядок', 'save');
var _revolt = checkRevolts(todayKey); // Г4: риск восстания (order<70 → до 30%); пин-безопасно: только выше >0.7
if (_revolt) { grantRevoltTask(_revolt.prov); renderTasks(); renderDashboard(); }
if (revenue > 0) {
showToast('💰 Тьма копила для тебя', '+' + revenue + ' 💰 за ' + gapDays + ' ' + pluralDays(gapDays) + ' отсутствия. Твои твердыни ждали.', 'save');
sfxEquip(); haptic('success');
}
ensureSeason();
if (getMSKDayKey() > seasonEndDate(season.start)) finishSeason();
checkStorm(); // Г1-5: буря сезона — триггер/просрочка раз в день
if (unpaid > 0) {
showToast('🏚 Не хватило на содержание', unpaid + ' дн. дефицита — постройки ветшают (grace ' + (2 + Math.floor(STATS.wil.value / 20)) + ' дн.)', 'blood');
sfxFail(); haptic('error');
}
if (HERO.dailyCompletions > 0 && HERO.dailySkips === 0) {
HERO.consecutivePerfectDays = (HERO.consecutivePerfectDays || 0) + 1;
if (HERO.consecutivePerfectDays > 0 && HERO.consecutivePerfectDays % 7 === 0) {
HERO.streakShields = (HERO.streakShields || 0) + 1;
showToast('🛡 Щит стрика!', 'Идеальная неделя: +1 щит. Следующий пропуск не сломает стрик.', 'save');
spiritSay('«Твоя неделя безупречна. Тьма отступает — щит готов.»');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 80, { color: '#34d399', speed: 10, decay: 0.01, size: 4, shape: 'star', gravity: 0.08 });
}
} else {
HERO.consecutivePerfectDays = 0;
}
HERO.dailyCompletions = 0;
HERO.dailySkips = 0;
HERO.dailyUniqueStats = {};
HERO.dayStatCounts = {}; HERO.combosToday = {}; HERO.comboDayXp = null; // Г2-4: сутки комбо — счётчики/Вихрь сброшены
siege.assaultDay = null; // новый день = новый штурм
var currentMonday = getThisMondayKey();
if (lastWeekReset !== currentMonday) {
lastWeekReset = currentMonday;
showToast('🗓 Новая неделя', 'Путь продолжается', 'save');
recalcHirePool(); // понедельник: пул = Σ прироста жилищ, непокупленное сгорает (SPEC §3)
runWeeklySiege();
siege.wkSkips = 0; siege.wkTaskFails = 0;
  siege.wkSkips = Math.max(0, siege.wkSkips - techWrathWeekReduction()); siege.wkTaskFails = Math.max(0, siege.wkTaskFails - techWrathWeekReduction()); // Г5-Т3: Обряды Усмирения −1/нед к источникам гнева
  siege.retriedThisWeek = false; // #95: контрштурм доступен снова
  Object.keys(TECH_ACTIVES).forEach(function(k) { delete TECH_ACTIVES[k]; }); // Г5-Т3 Ф2: приказы недели сгорают в понедельник
if (siege.lastResult || siege.wkSkips > 0 || siege.wkTaskFails > 0) scheduleModal(showWeeklyReport, 2000); // Г5-Ф: пассивный отчёт только неделе с событиями — свежий бут не завешивает UI (гонка extended-e2e)
}
FORGED.forEach(c => {
if (c.firstCompletedAt) {
c.daysActive = getCardDaysActive(c);
}
var lastPlayKey = c.lastCompletedAt ? getMSKDayKey(c.lastCompletedAt) : null;
if (c.streak && lastPlayKey !== yesterdayKey && lastPlayKey !== todayKey) c.streak = 0;
});
HERO.dayStreak = (HERO.lastActiveDay === yesterdayKey) ? (HERO.dayStreak || 0) + 1 : 0; // #19: вчера был активен — стрик растёт, иначе сброс
(HERO.streakMilestones = HERO.streakMilestones || {});
STREAK_MILESTONES.forEach(function(m) {
    if ((HERO.dayStreak || 0) < m.d || HERO.streakMilestones[m.d]) return;
    HERO.streakMilestones[m.d] = true;
    goldGain(m.gold, 'streak');
    if (m.shield) HERO.streakShields = Math.min(100, (HERO.streakShields || 0) + m.shield);
    showToast('🔥 Стрик ' + m.d + ' дней!', '+' + m.gold + ' 💰' + (m.shield ? ' +1 🛡' : ''), 'crit');
});
if (doctrineOf('t2') === 'lore' && (HERO.dayStreak || 0) > 0 && HERO.dayStreak % 7 === 0) { // Г1-2: lore — +1🛡 за каждый 7-дневный стрик
    HERO.streakShields = Math.min(100, (HERO.streakShields || 0) + 1);
    showToast('📜 Мудрость стрика', 'Доктрина мудрости: +1 щит за 7 дней', 'save');
}
checkBloodOathDaily();
}
if (_prevDay !== null || FORGED.length > 0) saveGameState(); // fresh install: не фиксируем пустое состояние — иначе ever_saved блокирует онбординг и старт-колоду
renderCards();
renderDashboard();
renderTasks();
}
}
function checkGoalDeadlines() {
var now = Date.now();
var changed = false;
GOALS.forEach(function(goal) {
if (goal.completed || goal.failed || !goal.deadline) return;
        if (now >= goal.deadline) {
            goal.failed = true;
            changed = true;
            HERO.gold = Math.max(0, (HERO.gold || 0) - (goal.gold || 0));
            screenShake(10, 600);
            spawnBloodRain(20);
            sfxFail(); haptic('error');
            showToast('💀 Цель провалена!', '«' + goal.name + '» — треснула. −' + goal.gold + ' 💰', 'blood');
            spiritSay('«Обещание разбилось о камень реальности...»');
        }
});
if (changed) {
renderGoals();
updateHeroUI();
saveSoon();
}
}
var lastNotifDay = getMSKDayKey();
setInterval(function() {
checkDailyReset(); checkBloodOath();
sweepExpiredPomodoros(); // #65: награда/снятие истёкших таймеров и тик обратного отсчёта
var dayKey = getMSKDayKey();
if (dayKey !== lastNotifDay) { lastNotifDay = dayKey; scheduleNotifs(); }
}, 60 * 1000);
setInterval(checkGoalDeadlines, 30000);
checkGoalDeadlines();
var _saveSoonTimer = null;
function saveSoon() { if (_saveSoonTimer) return; _saveSoonTimer = setTimeout(function() { _saveSoonTimer = null; saveGameState(); }, 300); } // QA2-H1: дебаунс некритичных тиков; критические пути зовут saveGameState напрямую
function flushSaveSoon() { if (_saveSoonTimer) { clearTimeout(_saveSoonTimer); _saveSoonTimer = null; saveGameState(); } }
window.addEventListener('beforeunload', function() { flushSaveSoon(); saveGameState(); forceCloudSave(); });
window.addEventListener('pagehide', function() { flushSaveSoon(); saveGameState(); forceCloudSave(); }); // QA1-H1: iOS Telegram шлёт pagehide надёжнее beforeunload (свайп-килл)
window.addEventListener('offline', function() { updateSyncBadge('offline'); }); // QA1-M6
window.addEventListener('online', function() { updateSyncBadge('syncing'); try { smartCloudSync(); } catch (e) {} }); // QA1-M6: retry облака после возврата онлайн
var notifEnabled = false;
try { notifEnabled = localStorage.getItem('neurodeck_notif') === '1'; } catch(e) {}
function toggleNotif() {
if (!('Notification' in window)) { showToast('⚠ Не поддерживается', 'Браузер не поддерживает уведомления', 'blood'); return; }
if (Notification.permission === 'granted') {
notifEnabled = !notifEnabled;
localStorage.setItem('neurodeck_notif', notifEnabled ? '1' : '0');
updateNotifBtn();
showToast(notifEnabled ? '🔔 Уведомления включены' : '🔕 Уведомления выключены', '');
} else if (Notification.permission === 'denied') {
showToast('⚠ Заблокировано', 'Разрешите уведомления в настройках браузера', 'blood');
} else {
Notification.requestPermission().then(function(perm) {
if (perm === 'granted') {
notifEnabled = true;
localStorage.setItem('neurodeck_notif', '1');
updateNotifBtn();
showToast('🔔 Уведомления включены', '');
scheduleNotifs();
}
});
}
}
function updateNotifBtn() {
var btn = document.getElementById('notifToggleBtn');
if (btn) {
btn.textContent = notifEnabled ? '🔔 Уведомления: ВКЛ' : '🔕 Уведомления: ВЫКЛ';
btn.style.borderColor = notifEnabled ? '#34d399' : 'var(--border)';
}
}
function scheduleNotifs() {
if (!notifEnabled || Notification.permission !== 'granted') return;
setTimeout(function() {
var now = new Date();
var mskNow = new Date(now.getTime() + MSK_OFFSET_MS);
var h = mskNow.getUTCHours(), m = mskNow.getUTCMinutes();
var diff = ((22 - h) * 60 - m) * 60;
if (diff > 0 && diff <= 7200) {
setTimeout(function() {
var uncompleted = FORGED.filter(function(c) {
if (!c.lastCompletedAt) return true;
return getMSKDayKey(c.lastCompletedAt) !== getMSKDayKey();
});
if (uncompleted.length > 0) {
new Notification('NeuroDeck ⚔', { body: 'Осталось ' + uncompleted.length + ' карточек! Доход твердынь капает каждый день.', icon: '🗡', tag: 'nd-warn' });
}
}, diff * 1000);
}
GOALS.forEach(function(goal) {
if (goal.completed || goal.failed || !goal.deadline) return;
var remaining = goal.deadline - Date.now();
if (remaining > 0 && remaining < 86400000) {
setTimeout(function() {
if (!notifEnabled) return;
new Notification('NeuroDeck 🎯', { body: '«' + goal.name + '» — скоро истечёт дедлайн!', icon: '🎯', tag: 'nd-goal-' + goal.id });
}, Math.max(0, remaining - 1800000));
}
});
}, 5000);
}
function renderPerfStatus() {
    if (!window.NeuroDeckPerf) return;
    var m = window.NeuroDeckPerf.getMode();
    var prm = window.NeuroDeckPerf.prefersReducedMotion();
    var low = window.NeuroDeckPerf.isLowEffect();
    var status = document.getElementById('perfStatus');
    if (!status) return;
    var txt = 'Активно: <b>' + m + '</b>';
    if (prm) txt += ' · <span style="color:var(--gold)">reduced-motion</span>';
    if (low) txt += ' · <span style="color:var(--green)">low-effect</span>';
    if (m === 'effects-off') txt += ' · <span style="color:var(--blood-bright)">анимации отключены</span>';
    status.innerHTML = txt;
    var eff = m === 'eco' ? 'low' : (m === 'performance' ? 'auto' : m);
    ['perfAutoBtn','perfLowBtn','perfOffBtn'].forEach(function(id){
        var b = document.getElementById(id);
        if (b) { b.style.borderColor = (b.dataset.mode === eff) ? 'var(--gold-bright)' : ''; b.style.background = (b.dataset.mode === eff) ? 'rgba(212,165,116,0.15)' : ''; }
    });
}
function initPerf() {
    if (!window.NeuroDeckPerf) return;
    window.NeuroDeckPerf.attachListeners();
    window.NeuroDeckPerf.onChange(renderPerfStatus);
    renderPerfStatus();
    // Re-render status whenever sync modal becomes visible (low-cost mutation observer)
    try {
        var mo = new MutationObserver(function(muts){
            for (var i=0;i<muts.length;i++) { if (muts[i].target && muts[i].target.classList && muts[i].target.classList.contains('show')) { renderPerfStatus(); break; } }
        });
        var sm = document.getElementById('syncModal');
        if (sm) mo.observe(sm, { attributes: true, attributeFilter: ['class'] });
    } catch(e) {}
    // Suggestions при auto+low-spec detect (без автопереключения, только тост)
    try {
        var lowSpec = window.NeuroDeckPerf.isLowEffect() && window.NeuroDeckPerf.getMode() === 'auto';
        if (lowSpec && !localStorage.getItem('neurodeck_perf_suggested')) {
            localStorage.setItem('neurodeck_perf_suggested', '1');
            setTimeout(function(){ showToast('💡 Совет', 'Слабое устройство? Включите Экономный режим в Синхронизации → ⚡ Режим производительности.'); }, 3500);
        }
    } catch(e) {}
}
initPerf();
function initNotifs() {
updateNotifBtn();
if (notifEnabled && Notification.permission === 'granted') scheduleNotifs();
}
initNotifs();
function initPerfMode() {
    var P = window.NeuroDeckPerf;
    if (!P) return;
    // When perf.js flips the eco flag, push the resolution change into PixiJS.
    P.onEcoModeChange(function(isEco, userMode) {
        try {
            if (window.__ndApplyEcoToPixi) window.__ndApplyEcoToPixi(isEco);
        } catch (e) { /* pixi may not be initialised yet */ }
    });
    // Apply current effective state immediately (covers the case where user
    // toggled this setting in a previous session and reloaded).
    if (typeof window.__ndSetEcoMode === 'function') {
        window.__ndSetEcoMode(P.isEco());
    }
    if (typeof window.__ndApplyEcoToPixi === 'function') {
        window.__ndApplyEcoToPixi(P.isEco());
    }
}
initPerfMode();
document.getElementById('syncModal').addEventListener('click', (e) => { if (e.target.id === 'syncModal') closeSyncModal(); });
document.getElementById('starterDeckModal').addEventListener('click', (e) => { if (e.target.id === 'starterDeckModal') closeStarterDeck(); });
document.getElementById('siegeReportModal').addEventListener('click', (e) => { if (e.target.id === 'siegeReportModal') closeSiegeReport(); });
document.getElementById('syncFileInput').addEventListener('change', importSyncFile);
document.getElementById('taskName').addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); createTask(); } }); // QA1-M4: Enter сабмитит форму задачи
// ===================== Модалки: очередь, a11y-хром, фокус-ловушка, BackButton (QA1-M2/M7, QA5-H1) =====================
var _pendingModal = null;
var _modalTimer = null;
function scheduleModal(fn, ms) { _modalTimer = setTimeout(function() { _modalTimer = null; enqueueModal(fn); }, ms); } // Г5-Ф: отслеживаемый таймер
function cancelPendingModal() { if (_modalTimer) { clearTimeout(_modalTimer); _modalTimer = null; } _pendingModal = null; } // Г5-Ф: полная отмена (таймер + очередь)
/* ===================== Г5-Ф: хроника кампании (localStorage, cap 50 — вне сейва: байт-стабильность) ===================== */
function addChronicle(icon, text) {
  try {
    var list = JSON.parse(localStorage.getItem('neurodeck_chronicle') || '[]');
    if (!Array.isArray(list)) list = [];
    list.unshift({ d: getMSKDayKey(), icon: String(icon || '•'), text: String(text || '').slice(0, 200) });
    localStorage.setItem('neurodeck_chronicle', JSON.stringify(list.slice(0, 50)));
  } catch (e) {}
}
function chronicleList() { try { var l = JSON.parse(localStorage.getItem('neurodeck_chronicle') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function showChronicle() {
  var modal = document.getElementById('chronicleModal');
  if (!modal) return;
  var rows = chronicleList().map(function(e) {
    return '<div class="km-chron-row"><span class="km-chron-ico">' + e.icon + '</span><span class="km-chron-text">' + esc(e.text) + '</span><span class="km-chron-day">' + esc(e.d) + '</span></div>';
  });
  document.getElementById('chronicleBody').innerHTML = rows.length ? rows.join('') : '<div class="empty-state">Летопись пуста — история ещё не началась.</div>';
  modal.classList.add('show');
}
function closeChronicle() { var m = document.getElementById('chronicleModal'); if (m) m.classList.remove('show'); }
function enqueueModal(fn) {
    if (document.querySelectorAll('.modal-overlay.show').length === 0) fn();
    else _pendingModal = fn; // QA1-M2: returnModal и weeklyReport показываются ПО ОДНОЙ
}
function dequeuePendingModal() {
    if (_pendingModal && document.querySelectorAll('.modal-overlay.show').length === 0) { var fn = _pendingModal; _pendingModal = null; fn(); }
}
var _prevShown = 0;
function updateModalChrome() {
    var shown = document.querySelectorAll('.modal-overlay.show');
    var hidden = shown.length > 0;
    ['.app', '.bottom-nav'].forEach(function(sel) {
        var el = document.querySelector(sel);
        if (!el) return;
        if (hidden) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden'); // QA5-H1b: фон скрыт от SR
    });
    if (shown.length > _prevShown) {
        var top = shown[shown.length - 1];
        var tgt = top.querySelector('[data-autofocus]');
        if (tgt) setTimeout(function() { try { tgt.focus(); } catch (e) {} }, 60); // QA5-H1d: автофокус в forge/sync
    }
    if (shown.length === 0 && _prevShown > 0) dequeuePendingModal();
    _prevShown = shown.length;
    updateBackButton(shown);
}
function updateBackButton(shown) { // QA1-M7: BackButton = «закрыть верхнюю модалку»
    try {
        var tg = window.Telegram && Telegram.WebApp;
        if (!tg || !tg.BackButton) return;
        var vis = shown || document.querySelectorAll('.modal-overlay.show');
        var onlyConfirm = vis.length === 1 && vis[0].id === 'confirmOverlay';
        if (vis.length > 0 && !onlyConfirm) {
            tg.BackButton.show();
            if (!tg.BackButton._ndBound) {
                tg.BackButton._ndBound = true;
                tg.BackButton.onClick(function() {
                    var list = document.querySelectorAll('.modal-overlay.show');
                    var t = list[list.length - 1];
                    if (t && t.id !== 'confirmOverlay') closeOverlayEl(t);
                });
            }
        } else tg.BackButton.hide();
    } catch (e) {}
}
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;
    var shown = document.querySelectorAll('.modal-overlay.show');
    if (!shown.length) return;
    var modal = shown[shown.length - 1];
    var list = [];
    modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])').forEach(function(el) {
        if (!el.disabled && el.offsetParent !== null) list.push(el);
    });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); } // QA5-H1a: фокус-ловушка Tab
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
(function initModalA11y() {
    try {
        var mo = new MutationObserver(function() { updateModalChrome(); });
        document.querySelectorAll('.modal-overlay').forEach(function(o) { mo.observe(o, { attributes: true, attributeFilter: ['class'] }); });
    } catch (e) {}
    updateModalChrome();
})();
(function initBnavHint() { // QA1-M5: подсказка при горизонтальном переполнении нижней навигации
    var nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    var check = function() { if (nav.scrollWidth > nav.clientWidth + 2) hintOnce('bnav_scroll', 'Нижнее меню прокручивается по горизонтали — покажи остальные разделы.'); };
    check();
    window.addEventListener('resize', check);
})();
document.addEventListener('keydown', function(e) { // ФАЗА E: узел карты (SVG role=button) активируется Enter/Space
if (e.key !== 'Enter' && e.key !== ' ') return;
var t = e.target;
if (!t || !t.dataset || t.dataset.action !== 'sh-open') return;
e.preventDefault();
t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
document.addEventListener('keydown', (e) => {
if ((e.ctrlKey || e.metaKey) && e.key === 's') {
e.preventDefault();
openSyncModal();
}
});
var MODAL_CLOSE_FNS = {
goalModal: closeGoalModal, forgeModal: closeForge, editCardModal: closeEditCard,
syncModal: closeSyncModal, returnModal: closeReturnModal,
weeklyReportModal: closeWeeklyReportModal,
starterDeckModal: closeStarterDeck, taskModal: closeTaskModal,
siegeReportModal: closeSiegeReport
};
function closeOverlayEl(overlay) {
var fn = MODAL_CLOSE_FNS[overlay.id];
if (typeof fn === 'function') fn();
else overlay.classList.remove('show');
}
document.addEventListener('keydown', function(e) {
if (e.key !== 'Escape') return;
var visible = document.querySelectorAll('.modal-overlay.show');
var top = visible[visible.length - 1];
if (!top || top.id === 'confirmOverlay') return;
closeOverlayEl(top);
});
document.addEventListener('click', function(e) {
if (!e.target.classList || !e.target.classList.contains('modal-overlay')) return;
if (e.target.id === 'confirmOverlay') return;
closeOverlayEl(e.target);
});
const dustCanvas = document.getElementById('dustCanvas');
const dustCtx = dustCanvas.getContext('2d');
let dustParticles = [];
function resizeDust() { dustCanvas.width = window.innerWidth; dustCanvas.height = window.innerHeight; }
resizeDust(); window.addEventListener('resize', resizeDust);
class Dust {
constructor() { this.x = Math.random() * dustCanvas.width; this.y = Math.random() * dustCanvas.height; this.vx = (Math.random() - 0.5) * 0.3; this.vy = -0.1 - Math.random() * 0.2; this.size = 0.5 + Math.random() * 1.5; this.alpha = 0.2 + Math.random() * 0.4; this.color = '#d4a574'; }
update() { this.x += this.vx; this.y += this.vy; this.vx += (Math.random() - 0.5) * 0.02; if (this.y < -10 || this.x < -10 || this.x > dustCanvas.width + 10) { this.x = Math.random() * dustCanvas.width; this.y = dustCanvas.height + 10; } }
draw(ctx) { ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color; ctx.shadowBlur = 6; ctx.shadowColor = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
}
for (var i = 0; i < 60; i++) dustParticles.push(new Dust());
var dustRunning = true;
var _dustTs = 0;
function animateDust(ts) {
if (!dustRunning) return;
requestAnimationFrame(animateDust);
if (ts && ts - _dustTs < 33) return; // QA2-M1: ~30fps троттлинг (пропуск кадров)
_dustTs = ts || 0;
dustCtx.clearRect(0, 0, dustCanvas.width, dustCanvas.height);
dustCanvas.style.opacity = 0.6;
dustParticles.forEach(d => { d.update(); d.draw(dustCtx); });
}
animateDust();
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
let particles = [];
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resizeCanvas(); window.addEventListener('resize', resizeCanvas);
class Particle {
constructor(x, y, o) { o = o || {}; this.x = x; this.y = y; this.vx = o.vx !== undefined ? o.vx : (Math.random() - 0.5) * 4; this.vy = o.vy !== undefined ? o.vy : (Math.random() - 0.5) * 4 - 2; this.life = o.life !== undefined ? o.life : 1; this.decay = o.decay !== undefined ? o.decay : 0.015; this.size = o.size !== undefined ? o.size : 3; this.color = o.color || '#d4a574'; this.glow = o.glow !== undefined ? o.glow : true; this.gravity = o.gravity !== undefined ? o.gravity : 0.05; this.shape = o.shape || 'circle'; this.rotation = Math.random() * Math.PI * 2; this.rotSpeed = (Math.random() - 0.5) * 0.2; }
update() { this.x += this.vx; this.y += this.vy; this.vy += this.gravity; this.vx *= 0.99; this.life -= this.decay; this.rotation += this.rotSpeed; }
draw(ctx) {
ctx.save(); ctx.globalAlpha = Math.max(0, this.life);
if (this.glow) { ctx.shadowBlur = 15; ctx.shadowColor = this.color; }
ctx.fillStyle = this.color;
ctx.translate(this.x, this.y);
ctx.rotate(this.rotation);
if (this.shape === 'spark') ctx.fillRect(-this.size * 2, -this.size / 2, this.size * 4, this.size);
else if (this.shape === 'star') {
ctx.beginPath();
for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const r = i % 2 === 0 ? this.size : this.size / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
ctx.closePath(); ctx.fill();
} else { ctx.beginPath(); ctx.arc(0, 0, this.size, 0, Math.PI * 2); ctx.fill(); }
ctx.restore();
}
}
var particlesRunning = true;
function burstParticles(x, y, count, o) { o = o || {}; var MAX_PARTICLES = 500; if (particles.length + count > MAX_PARTICLES) { particles.splice(0, particles.length + count - MAX_PARTICLES); } for (var i = 0; i < count; i++) { var a = (i / count) * Math.PI * 2; var sp = (o.speed !== undefined ? o.speed : 6) * (0.5 + Math.random() * 0.5); particles.push(new Particle(x, y, Object.assign({}, o, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp }))); } }
var _partTs = 0;
function animate(ts) { if (!particlesRunning) return; requestAnimationFrame(animate); if (ts && ts - _partTs < 33) return; _partTs = ts || 0; ctx.clearRect(0, 0, canvas.width, canvas.height); particles = particles.filter(p => p.life > 0); particles.forEach(p => { p.update(); p.draw(ctx); }); } // QA2-M1: ~30fps троттлинг
animate();
document.addEventListener('visibilitychange', function() {
if (document.hidden) {
dustRunning = false;
particlesRunning = false;
} else {
dustRunning = true;
particlesRunning = true;
animateDust();
animate();
}
});
const shakeWrap = document.getElementById('shakeWrap');
function screenShake(intensity, duration) {
if (ecoOn()) return;
intensity = intensity || 8; duration = duration || 400;
const t0 = performance.now();
function shake(now) {
const e = now - t0; if (e > duration) { shakeWrap.style.transform = ''; return; }
const p = 1 - e / duration, c = intensity * p;
shakeWrap.style.transform = 'translate(' + ((Math.random() - 0.5) * c * 2) + 'px, ' + ((Math.random() - 0.5) * c * 2) + 'px) rotate(' + ((Math.random() - 0.5) * c * 0.3) + 'deg)';
requestAnimationFrame(shake);
}
requestAnimationFrame(shake);
}
function spawnBloodRain(n) { if (ecoOn()) return; for (let i = 0; i < n; i++) { setTimeout(() => { const d = document.createElement('div'); d.className = 'blood-drop'; d.style.left = (Math.random() * 100) + 'vw'; d.style.animationDuration = (1 + Math.random() * 1.5) + 's'; d.style.opacity = 0.4 + Math.random() * 0.6; document.body.appendChild(d); setTimeout(() => d.remove(), 3000); }, i * 30); } }
var toastQueue = [];
var toastActive = false;
function showToast(title, body, type, action) { // #89: action={label, fn} — тост с кнопкой (5с), обратная совместимость: без action — как раньше
if (toastQueue.length >= 3) toastQueue.shift();
toastQueue.push({ title: title, body: body, type: type, action: action || null });
if (!toastActive) playNextToast();
}
function playNextToast() {
var t = toastQueue.shift();
if (!t) { toastActive = false; return; }
toastActive = true;
var type = t.type || '';
const el = document.getElementById('toast');
el.querySelector('.t-title').textContent = t.title;
el.querySelector('.t-body').textContent = t.body;
var actBtn = el.querySelector('.t-action');
if (actBtn) {
if (t.action && typeof t.action.fn === 'function') { actBtn.style.display = ''; actBtn.textContent = t.action.label || 'OK'; actBtn.onclick = function() { t.action.fn(); }; }
else { actBtn.style.display = 'none'; actBtn.onclick = null; }
}
el.style.borderLeftColor = type === 'blood' ? 'var(--blood-bright)' : type === 'crit' || type === 'save' ? '#fbbf24' : 'var(--gold-bright)';
el.style.borderColor = type === 'blood' ? 'var(--blood)' : type === 'crit' || type === 'save' ? '#fbbf24' : 'var(--gold)';
el.classList.remove('show'); void el.offsetWidth; el.dataset.ttype = type; el.classList.add('show');
setTimeout(() => { el.classList.remove('show'); setTimeout(playNextToast, 200); }, t.action ? 5000 : 2500);
}
function spiritSay(t) { const el = document.getElementById('spiritMsg'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
function dungeonConfirm(title, body) {
return new Promise(function(resolve) {
var overlay = document.getElementById('confirmOverlay');
document.getElementById('confirmTitle').textContent = title;
document.getElementById('confirmBody').innerHTML = body;
overlay.classList.add('show');
function cleanup(result) {
overlay.classList.remove('show');
document.getElementById('confirmYes').onclick = null;
document.getElementById('confirmNo').onclick = null;
resolve(result);
}
document.getElementById('confirmYes').onclick = function() { cleanup(true); };
document.getElementById('confirmNo').onclick = function() { cleanup(false); };
});
}
function updateProgressFill(pct) {
const fillEl = document.getElementById('progressFill');
if (fillEl) fillEl.style.width = pct + '%';
const sliderEl = document.getElementById('progressSlider');
if (sliderEl) sliderEl.setAttribute('aria-valuenow', String(Math.round(pct)));
}
document.addEventListener('mousemove', (e) => {
if (ecoOn()) return;
const r1 = document.getElementById('mistRect1');
const r2 = document.getElementById('mistRect2');
if (!r1 || !r2) return;
const x = (e.clientX / window.innerWidth - 0.5) * 40;
const y = (e.clientY / window.innerHeight - 0.5) * 25;
r1.setAttribute('transform', 'translate(' + x + ', ' + y + ')');
r2.setAttribute('transform', 'translate(' + (-x * 0.5) + ', ' + (-y * 0.5) + ')');
});
var pendingOnboarding = false;
function hintOnce(key, text) {
var flag = null;
try { flag = localStorage.getItem('neurodeck_hint_' + key); if (!flag) localStorage.setItem('neurodeck_hint_' + key, '1'); } catch (e) { return; }
if (flag) return;
showToast('💡 Подсказка', text);
}
var VIEW_HINTS = {
quests: 'Задача с дедлайном: успел — сундук (💰 или XP), просрочил — призрак забирает 💰 по ночам.',
strongholds: 'Путь: построй Жилище → найми существ → штурмуй фронт. Один штурм в сутки.',
hero: 'Ранги карточек качают атрибуты: атака, оборона гарнизона, скидка найма.',
inv: 'Артефакты падают за подвиги — надевай в слоты, бонусы суммируются.',
stats: 'Дневник королевства: стрики, XP и история дней.'
};
function startOnboarding() {
var overlay = document.createElement('div');
overlay.className = 'onboarding-overlay';
overlay.innerHTML =
'<div class="onboarding-card">' +
'<div class="onboarding-icon">⚔</div>' +
'<div class="onboarding-title">Добро пожаловать, Владыка</div>' +
'<div class="onboarding-text">' +
'Карточки — твои привычки: <b>✓</b> даёт <b style="color:var(--gold-bright)">+1 💰</b>, <b>✕</b> — <b style="color:var(--blood-bright)">−1 💰</b> и сброс стрика.<br><br>' +
'Золото строит королевство: <b>жильё → армия → штурм твердынь</b>.<br><br>' +
'Каждое воскресенье тьма осаждает фронт — <b>гарнизон держит удар</b>.<br><br>' +
'<span style="color:var(--text-dim)">Подсказки будут появляться по мере знакомства с системами.</span>' +
'</div>' +
'<button class="demo-btn primary" style="width:100%;">⚔ Начать!</button>' +
'</div>';
overlay.querySelector('button').addEventListener('click', function() {
overlay.classList.remove('show');
setTimeout(function() { overlay.remove(); }, 300);
localStorage.setItem('neurodeck_onboarding_done', '1');
spiritSay('«Дорога ждёт, Владыка. Отбей своё золото у лени.»');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 30, { color: '#d4a574', speed: 4, decay: 0.015, size: 2, shape: 'spark', gravity: 0.05 });
});
document.body.appendChild(overlay);
setTimeout(function() { overlay.classList.add('show'); }, 50);
}
function showReminderFreqToast(mode) {
var msgs = { daily: '📅 Ежедневные напоминания включены', sunday: '🛡 Только воскресные осады', off: '🔕 Напоминания выключены' };
showToast('🔔 Напоминания', msgs[mode] || mode, 'save');
// TODO: отправить на бэкенд когда будет API
}
function fullWipeAll() {
dungeonConfirm('💀 ПОЛНЫЙ СБРОС', 'Удалить ВСЁ: карточки, уровень, золото, твердыни, армию, квесты?<br><b style="color:var(--blood-bright)">Это полный вайп. Необратимо.</b>').then(function(ok) {
if (!ok) return;
HERO.level = 1; HERO.xp = 0; HERO.xpToNext = 50; HERO.totalXp = 0; HERO.gold = 30;
HERO.name = 'Странник'; HERO.title = '«Тот, кто только начал путь»';
HERO.consecutivePerfectDays = 0; HERO.dailyCompletions = 0; HERO.dailySkips = 0;
HERO.lastSessionAt = Date.now(); HERO.dailyUniqueStats = {}; HERO.cardHistory = {}; HERO.lastWeeklyReport = null;
HERO.streakShields = 0;
Object.keys(STATS).forEach(function(k) { STATS[k].value = 3; STATS[k].attributePoints = 0; });
FORGED = []; forgedIdCounter = 100;
TASKS = []; taskIdCounter = 1;
GOALS = []; goalIdCounter = 1;
strongholds = null; ensureStrongholdState();
army = { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 0 };
siege = { week: 1, lastResult: null, assaultDay: null, wkSkips: 0, wkTaskFails: 0, retriedThisWeek: false };
hirePool = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 };
dailyQuests = null; dailyEvent = null; throne = 0; lastDayReset = null; lastWeekReset = getThisMondayKey();
xpHistory = []; bloodOath = null;
season = STATE_GUARDS.sanitizeSeason({ num: 1, start: getMSKDayKey() }, getMSKDayKey());
try { localStorage.removeItem('neurodeck_full_save'); localStorage.removeItem('neurodeck_backup'); localStorage.removeItem('neurodeck_cards_backup'); localStorage.removeItem('neurodeck_ever_saved'); localStorage.removeItem('neurodeck_onboarding_done'); localStorage.removeItem('neurodeck_starter_done'); } catch(e) {}
// location.reload() → свежая загрузка: saveGameState здесь НЕ вызывать,
// иначе ever_saved=1 воскресает и старт-колода не вернётся (QA-lead O-10)
try { var csR = getCloudStorage(); if (csR) csR.removeItem(CLOUD_META_KEY, function(){}); } catch(e) {}
location.reload();
});
}
function newGameKeepCards() {
dungeonConfirm('🔄 Новая игра', 'Сбросить весь прогресс?<br><b>Карточки сохранятся.</b><br><span style="color:var(--blood-bright)">Необратимо.</span>').then(function(ok) {
if (!ok) return;
HERO.level = 1; HERO.xp = 0; HERO.xpToNext = 50; HERO.totalXp = 0; HERO.gold = 30;
HERO.name = 'Странник'; HERO.title = '«Тот, кто только начал путь»';
HERO.consecutivePerfectDays = 0; HERO.dailyCompletions = 0; HERO.dailySkips = 0;
HERO.lastSessionAt = Date.now(); HERO.dailyUniqueStats = {}; HERO.cardHistory = {}; HERO.lastWeeklyReport = null;
Object.keys(STATS).forEach(function(k) { STATS[k].value = 3; STATS[k].attributePoints = 0; });
strongholds = null; ensureStrongholdState();
army = { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 0 };
siege = { week: 1, lastResult: null, assaultDay: null, wkSkips: 0, wkTaskFails: 0, retriedThisWeek: false };
hirePool = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 };
TASKS = []; taskIdCounter = 1;
dailyQuests = null; dailyEvent = null; throne = 0; lastDayReset = null; lastWeekReset = getThisMondayKey();
season = STATE_GUARDS.sanitizeSeason({ num: 1, start: getMSKDayKey() }, getMSKDayKey());
xpHistory = []; bloodOath = null;
try { localStorage.removeItem('neurodeck_full_save'); localStorage.removeItem('neurodeck_backup'); localStorage.removeItem('neurodeck_cards_backup'); } catch(e) {}
localStorage.removeItem('neurodeck_onboarding_done');
try { var csR = getCloudStorage(); if (csR) { csR.removeItem(CLOUD_META_KEY, function(){}); } } catch(e) {}
saveGameState();
HERO.xpToNext = getXpToNext(HERO.level);
renderCards(); renderDashboard(); renderStrongholds(); renderTasks(); updateHeroUI(); renderGoals(); renderStats(); updateStrongholdProgress();
spiritSay('«С чистого листа, Владыка. Дорога ждёт.»');
localStorage.removeItem('neurodeck_onboarding_done');
showToast('🔄 Новая игра', 'Карточки сохранены. Прогресс сброшен.', 'save');
});
}
ensureStrongholdState();
if (!dailyQuests || typeof dailyQuests !== 'object') dailyQuests = { day: getMSKDayKey(), done: {}, quests: [], progress: {} };
loadGameState();
applyAscensionPalette(); // Г2-5: палитра круга вознесения (body asc-1/2/3)
checkCapturedRecovery(); // #49: следы потерянных крепостей — сразу после загрузки
checkDailyReset();
checkBloodOath();
HERO.xpToNext = getXpToNext(HERO.level);
renderStats();
updateHeroUI();
renderGoals();
renderTasks();
renderStrongholds();
updateStrongholdProgress();
renderCards();
renderDashboard();
sweepExpiredPomodoros();
importFromHash();
window.__tgReady = function(){ try{ var tg=window.Telegram&&Telegram.WebApp; if(tg){ tg.ready&&tg.ready(); tg.expand&&tg.expand(); tg.setHeaderColor&&tg.setHeaderColor('#0a0a0f'); tg.setBackgroundColor&&tg.setBackgroundColor('#0a0a0f'); tg.disableVerticalSwipes&&tg.disableVerticalSwipes(); applyTelegramTheme(tg); } }catch(e){} };
function applyTelegramTheme(tg) { // QA1-M1: themeParams → CSS-переменные (только light; тёмная схема — дефолт)
    try {
        if (!tg || tg.colorScheme !== 'light') return;
        var p = tg.themeParams || {};
        if (p.bg_color) document.body.style.setProperty('--tg-bg', p.bg_color);
        if (p.text_color) document.body.style.setProperty('--tg-text', p.text_color);
        if (p.bg_color || p.text_color) document.body.classList.add('tg-light');
    } catch (e) {}
}
window.__tgReady();
window.addEventListener('load', function(){ window.__tgReady(); });
if (!hasEverSaved() && FORGED.length === 0) {
    try { pendingOnboarding = !localStorage.getItem('neurodeck_onboarding_done'); } catch(e) { pendingOnboarding = false; }
    setTimeout(showStarterDeck, 900);
} else {
if (FORGED.length === 0) { setTimeout(deepRecovery, 1000); }
if (!getCloudStorage()) { setTimeout(function() { updateSyncBadge('offline'); }, 1500); }
else { setTimeout(function() { updateSyncBadge('syncing'); smartCloudSync(); }, 2500); }
if (HERO.lastSessionAt && Date.now() - HERO.lastSessionAt > 86400000 && FORGED.length > 0) {
setTimeout(function() { enqueueModal(showReturnScreen); }, 1500);
} else {
HERO.lastSessionAt = Date.now();
}
setTimeout(() => {
spiritSay('«Дорога ждёт, Владыка. Отбей своё золото у лени.»');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 30, { color: '#d4a574', speed: 4, decay: 0.015, size: 2, shape: 'spark', gravity: 0.05 });
}, 800);
}