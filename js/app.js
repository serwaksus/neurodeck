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
case 'export-metrics': exportMetrics(); break; // A2
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
case 'return-go-deck': closeReturnModal(); switchView('deck'); showToast('⚔ Одна карточка', 'Выполни первую попавшуюся — остальное догонит', 'save'); break; // G1: comeback-план
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
    var tArt = function(id) { return (typeof artIconHtml === 'function' && TOTEM_ART[id]) ? artIconHtml(TOTEM_ART[id]) : null; }; // гард для extractFn-тестов
    if (!box) return;
    if (capturedCount() < 1) { box.innerHTML = ''; return; }
    var t = totemOf();
    if (t && !(HERO.totem && HERO.totem.rechoose)) {
        box.innerHTML = '<div class="totem-chosen" title="' + esc(t.tip) + '"><span class="totem-icon">' + (tArt(t.id) || t.icon) + '</span><div><b>Тотем: ' + t.name + '</b><div class="totem-tip">' + t.tip + '</div></div></div>';
        return;
    }
    var html = '<div class="totem-title">🐾 Тотемное животное</div><div class="totem-tip">' + (t ? 'Смена сезона позволяет сменить тотем.' : 'Выбирай спутника: бонус действует постоянно. Смена — на смене сезона.') + '</div><div class="totem-row">';
    TOTEMS.forEach(function(x) {
        html += '<button class="totem-opt' + (t && t.id === x.id ? ' active' : '') + '" data-action="totem-choose" data-id="' + x.id + '" title="' + x.tip + '">' + (tArt(x.id) || x.icon) + ' ' + x.name + '<span class="totem-tip">' + x.tip + '</span></button>';
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
var _orn = '<svg class="card-orn" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
'<path d="M2 20 L2 6 Q2 2 6 2 L20 2" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
'<path d="M80 2 L94 2 Q98 2 98 6 L98 20" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
'<path d="M98 80 L98 94 Q98 98 94 98 L80 98" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
'<path d="M20 98 L6 98 Q2 98 2 94 L2 80" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
'</svg>';
el.innerHTML =
_orn +
dayBadge +
oathBadge +
'<div class="card-corner-actions">' +
   '<div class="card-btn edit" data-action="edit-card" data-id="' + card.id + '" title="Редактировать"><svg class="icn" aria-hidden="true"><use href="#i-edit"/></svg></div>' +
   '<div class="card-btn delete" data-action="delete-card" data-id="' + card.id + '" title="Удалить"><svg class="icn" aria-hidden="true"><use href="#i-trash"/></svg></div>' +
   '<div class="card-btn pomodoro" data-action="pomodoro-toggle" data-id="' + card.id + '" title="Помодоро 25 мин (+5 XP, 1/день)"><svg class="icn" aria-hidden="true"><use href="#i-timer"/></svg></div>' + // #65: помодоро в карточке; DS2.0: SVG-иконки
   (card.rank === 'SSS' && (card.prestige || 0) < 3 ? '<div class="card-btn" data-action="prestige-card" data-id="' + card.id + '" title="Переродить" style="color:var(--gold-bright)"><svg class="icn" aria-hidden="true"><use href="#i-star"/></svg></div>' : '') +
'</div>' +
'<div class="card-rank">' + card.rank + '</div>' +
'<div class="card-name">' + esc(card.name) + '</div>' +
'<div class="card-meta">' + esc(card.meta || '') + '</div>' +
'<div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">' +
  '<span class="card-stat-tag" style="color: ' + st.color + '; border-color: ' + st.color + '40;">' +
    (artIconHtml(STAT_ART[card.stat]) || '<span>' + st.icon + '</span>') + ' ' + st.name +
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
function cardXpLedger(card, dayMult, bloodMult, streakMult, heroIntBonus, comboMult, prestigeMult) { // B: состав и порядок множителей XP заморожен — tests/mult-ledger.test.js
    return [
        { id: 'streak', m: streakMult, round: false },
        { id: 'heroInt', m: heroIntBonus, round: false },
        { id: 'combo', m: comboMult, round: false },
        { id: 'prestige', m: prestigeMult, round: true },
        { id: 'dayPair', m: dayMult, round: false }, // #29: карта дня ×2
        { id: 'bloodmoon', m: bloodMult, round: false }, // #41
        { id: 'holiday', m: holidayRewardMult(), round: false }, // #8
        { id: 'totem', m: totemXpMult(), round: false }, // Ф2: сова
        { id: 'doctrine', m: doctrineXpMult(), round: false }, // Г1-2: growth
        { id: 'bossArtifact', m: bossArtifactMult('xp'), round: false }, // Г2-1
        { id: 'techIdea', m: techIdeaXpMult(), round: false }, // Г5-Т2
        { id: 'tech', m: techXpMult(), round: false }, // Г5-Т3
        { id: 'comboDay', m: HERO.comboDayXp || 1, round: false } // Г2-4
    ];
}
function applyXpLedger(base, ledger) {
    var xp = base;
    for (var i = 0; i < ledger.length; i++) { xp *= ledger[i].m; if (ledger[i].round) xp = Math.round(xp); }
    return xp;
}
var ND_METRICS_KEY = 'neurodeck_metrics';
var _ndMetricsCache = null;
var _ndMetricsFlushTimer = null;
function ndMetricsLoad() { // волна 3: кэш в памяти — серия тапов = одна запись localStorage
    if (_ndMetricsCache) return _ndMetricsCache;
    try { _ndMetricsCache = JSON.parse(localStorage.getItem(ND_METRICS_KEY) || 'null'); } catch (e) { _ndMetricsCache = null; }
    if (!_ndMetricsCache || _ndMetricsCache.v !== 1 || typeof _ndMetricsCache.days !== 'object' || _ndMetricsCache.days === null || Array.isArray(_ndMetricsCache.days)) _ndMetricsCache = { v: 1, days: {} };
    return _ndMetricsCache;
}
function ndMetricsFlush() {
    _ndMetricsFlushTimer = null;
    try { if (_ndMetricsCache) localStorage.setItem(ND_METRICS_KEY, JSON.stringify(_ndMetricsCache)); } catch (e) {}
}
function metricCard(finalXp) { // A2: карточки/день, локальная метрика (кольцо 60 дней), экспорт — syncModal
    try {
        var m = ndMetricsLoad();
        var tk = getMSKDayKey();
        var d = m.days[tk] || { cards: 0, xp: 0 };
        d.cards++; d.xp += finalXp;
        m.days[tk] = d;
        var ks = Object.keys(m.days);
        if (ks.length > 60) { ks.sort(); ks.slice(0, ks.length - 60).forEach(function(k) { delete m.days[k]; }); } // ponytail: кольцо 60 дней
        if (!_ndMetricsFlushTimer) _ndMetricsFlushTimer = setTimeout(ndMetricsFlush, 2000);
    } catch (e) {}
}
function exportMetrics() {
    if (_ndMetricsFlushTimer) { clearTimeout(_ndMetricsFlushTimer); ndMetricsFlush(); } // экспорт свежих данных
    var raw = '{}';
    try { raw = localStorage.getItem(ND_METRICS_KEY) || '{}'; } catch (e) {}
    var blob = new Blob([raw], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'neurodeck-metrics-' + getMSKDayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
}
window.addEventListener('pagehide', function() { if (_ndMetricsFlushTimer) { clearTimeout(_ndMetricsFlushTimer); ndMetricsFlush(); } }); // свайп-килл не теряет хвост метрики
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
const finalXp = applyXpLedger(baseCardXp, cardXpLedger(card, dayMult, bloodMult, streakMult, heroIntBonus, comboMult, prestigeMult)); // B-ledger: состав см. cardXpLedger — та же математика, порядок и округление после prestige сохранены
HERO.xp += finalXp; HERO.totalXp += finalXp;
recordXpEvent(finalXp);
metricCard(finalXp); // A2: локальная метрика карточек/день
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
  '<div class="stat-icon">' + artIconHtml(STAT_ART[key]) + '<div class="stat-value-big" id="statVal-' + key + '">' + st.value + '</div></div>' +
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
function animateNumber(el, to, dur) { // DS2.0: плавный счётчик (eco → мгновенно)
    try {
        var from = parseInt(String(el.textContent).replace(/[^\d-]/g, ''), 10) || 0;
        if (typeof ecoOn === 'function' && ecoOn() || from === to) { el.textContent = (to || 0).toLocaleString('ru'); return; }
        var t0 = performance.now();
        (function step(t) {
            var k = Math.min(1, (t - t0) / (dur || 500));
            el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))).toLocaleString('ru');
            if (k < 1) requestAnimationFrame(step);
        })(t0);
    } catch (e) { el.textContent = String(to); }
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
var _gchip = document.getElementById('goldChipVal');
if (_gchip) {
    var _prevGold = parseInt(String(_gchip.textContent).replace(/[^\d-]/g, ''), 10) || 0;
    animateNumber(_gchip, HERO.gold || 0, 500);
    var _gchipBox = document.getElementById('goldChip');
    if (_gchipBox && (HERO.gold || 0) > _prevGold) { // DS2.0: вспышка при приходе золота
        _gchipBox.classList.remove('gain'); void _gchipBox.offsetWidth; _gchipBox.classList.add('gain');
    }
}
var pav = document.getElementById('heroAvatar');
if (pav) { // #55: портрет героя по высшему стату
    updateHeroAvatarSprites(); // DS2.0: чемпион при каждом обновлении (идемпотентно)
    var pp = pav.querySelector('.hero-path');
    if (!pp) { pp = document.createElement('div'); pp.className = 'hero-path'; pav.appendChild(pp); }
    var pi = heroPathInfo();
    var _picn = { '⚔': '#i-str', '🛡': '#i-end', '🏹': '#i-agi' }[pi.icon] || '#i-star';
    pp.innerHTML = '<svg class="icn" aria-hidden="true"><use href="' + _picn + '"/></svg><span>' + esc(pi.name) + '</span>';
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
const name = validDisplayText(document.getElementById('editCardName').value, 40);
if (!name) { showToast('⚠ Ошибка', 'Название: добавь буквы или цифры (не только эмодзи)', 'blood'); return; }
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
const ICON_PATHS = {"owl":"M70.574 17.27l-4.87 18.044c24.228 6.543 46.02 15.573 65.478 26.704-21.276 15.76-35.307 42.705-35.307 73.314 0 13.593 2.77 26.463 7.707 37.955-21.82 20.365-35.004 49.398-35.004 87.504 0 70.68 42.857 131.724 104.85 161.005l-30.71 70.36h20.376l27.594-63.216c3.01 1.077 6.05 2.09 9.13 3.02 3.56 2.76 7.186 5.25 10.868 7.487l-13.03 52.71h19.28l10.945-44.32c6.856 2.546 13.842 4.224 20.9 5.007v39.312h18.69V452.8c7.872-.906 15.65-2.936 23.255-6.056l11.212 45.412h19.25l-13.44-54.418c3.4-2.222 6.75-4.66 10.036-7.343 3.22-1.07 6.398-2.226 9.537-3.456l28.46 65.216h20.376l-31.8-72.863c59.226-30.165 99.74-89.782 99.74-158.502 0-37.114-12.51-65.62-33.32-85.897 5.383-11.896 8.435-25.327 8.435-39.56 0-30.5-13.928-57.36-35.073-73.144 19.638-11.334 41.452-20.41 65.396-26.876l-4.87-18.043c-26.26 7.092-50.213 17.245-71.75 30-34.084-18.84-77.19-28.164-120.214-28.114-40.908.048-81.73 8.575-114.655 25.448-20.227-11.394-42.7-20.644-67.47-27.333zM252.707 38.67c36.446-.044 72.955 6.705 102.084 20.348-45.112 31.892-77.918 76.2-97.15 127.79C238.314 134.672 205 88.95 157.073 56.388c27.807-11.744 61.69-17.68 95.635-17.722zm-83.605 68.373c19.4 0 35.33 15.923 35.33 35.32 0 19.4-15.93 35.324-35.33 35.324S133.77 161.76 133.77 142.36c0-19.398 15.932-35.32 35.332-35.32zm179.44 0c19.4 0 35.33 15.923 35.33 35.32 0 19.4-15.93 35.324-35.33 35.324-19.402 0-35.333-15.923-35.333-35.323 0-19.398 15.93-35.32 35.33-35.32zm-110.378 80.69c4.052 10.347 7.523 21 10.424 31.913l9.03 33.964 9.03-33.964c2.895-10.888 6.368-21.472 10.405-31.72 14.39 21.47 37.346 35.386 63.236 35.386 14.44 0 27.964-4.346 39.608-11.896-4.003 70.85-18.94 124.726-39.34 161.416-23.964 43.104-54.35 62.274-83.537 61.836-29.184-.438-59.806-20.672-83.803-64.074-20.432-36.954-35.36-90.513-39.354-160.03C145.8 218.65 159.81 223.31 174.8 223.31c25.967 0 48.984-14 63.364-35.58zm-125.266 2.147c.433.61.864 1.22 1.31 1.816 2.165 81.335 18.39 144.056 42.653 187.942 3.655 6.61 7.513 12.784 11.538 18.55-48.72-28.262-81.132-79.294-81.132-137.394 0-32.026 9.226-54.484 25.632-70.913zm288.282 1.428c15.53 16.296 24.226 38.38 24.226 69.486 0 56.37-30.516 106.083-76.828 134.804 2.87-4.334 5.65-8.887 8.315-13.682 24.163-43.46 40.328-106.15 42.628-188.473.56-.707 1.122-1.41 1.66-2.135zm-237.496 59.052c-3.753 6.263-6.096 14.53-6.096 23.24 0 20.065 12.095 35.915 26.82 35.915 12.53 0 23.354-11.585 26.21-27.465-4.692 4.098-10.472 6.34-16.456 6.34-15.98 0-29.423-16.616-30.478-38.03zm185.912 2.477c-1.056 21.413-14.496 38.03-30.477 38.03-5.985 0-11.763-2.242-16.458-6.34 2.858 15.88 13.68 27.466 26.21 27.466 14.726 0 26.21-15.85 26.21-35.916 0-8.71-1.732-16.977-5.484-23.24h-.002zm-68.73 28.97c-3.51 13.094-14.307 23.18-24.53 23.18-9.984 0-20.61-10.057-23.943-22.507-.813 3.397-1.752 7.03-1.752 10.796 0 19.225 11.59 34.41 25.698 34.41s25.697-15.185 25.697-34.41c0-3.986-.26-7.9-1.168-11.47h-.002zm35.04 66.706c-3.435 16.552-14.208 29.013-27.45 29.013-8.24 0-15.752-4.6-21.024-12.146.738 18.326 12.065 33.062 25.697 33.062 14.107 0 25.696-15.862 25.696-35.086 0-5.407-1.303-10.277-2.92-14.844zm-115.636 1.347c-1.294 4.168-1.752 8.69-1.752 13.497 0 19.224 11.59 35.085 25.697 35.085 13.633 0 24.375-14.737 25.113-33.063-5.272 7.545-12.784 12.146-21.025 12.146-12.916 0-24.314-11.735-28.032-27.666z","bear-face":"M64.264 44.704c-88.765 25.213-39.73 158.676-2.108 161.887-8.506 42.218-13.32 84.645-12.642 127.824.355 22.67 51.374 58.424 105.35 86.035C186.48 466.787 238.98 466.876 256 467.296c17.02-.42 69.52-.51 101.137-46.846 53.975-27.61 104.994-63.364 105.35-86.035.677-43.179-4.137-85.606-12.643-127.824 37.623-3.211 86.657-136.674-2.108-161.887-28.433 1.462-55.606 16.152-82.172 37.223C317.64 62.233 293.164 61.296 256 61.296c-37.163 0-61.639.937-109.564 20.63-26.566-21.07-53.739-35.76-82.172-37.222zm4.927 49.928c6.057-.096 17.237 5.625 26.809 14.664 3.362 3.175-22.916 51.05-26.818 50.158-4.59-1.05-14.985-48.285-3.725-63.318.745-.994 2.039-1.477 3.734-1.504zm373.618 0c1.695.027 2.99.51 3.734 1.504 11.26 15.033.865 62.268-3.725 63.318-3.902.893-30.18-46.983-26.818-50.158 9.572-9.04 20.752-14.76 26.809-14.664zm-260.85 82.088c17.457-.304 30.686 24.445 42.041 44.576-53.57 15.878-82.575-17.11-57.752-37.777 5.603-4.665 10.823-6.714 15.711-6.8zm148.082 0c4.888.085 10.108 2.134 15.711 6.799 24.823 20.667-4.181 53.655-57.752 37.777 11.355-20.13 24.584-44.88 42.041-44.576zM256 251.548c17.32.223 36.826 9.567 30.197 36.517-1.444 5.872-12.516 8.617-21.197 9.7v8.972c99.884 41.126 79.565 138.559-9 138.559s-108.884-97.433-9-138.559v-8.972c-8.68-1.083-19.753-3.828-21.197-9.7-6.629-26.95 12.877-36.294 30.197-36.517z","bordered-shield":"M50.807 26.285c-1.105 42.86 2.978 85.91 11.98 128.55l50.606-11.388c-2.658-19.543-4.11-39.265-3.6-59.002l.236-9.103h49.402V26.285H50.807zm306.607 0v49.057h45.904l.23 9.107c.498 19.563-.492 39.338-3.058 59l50.086 11.34c9.048-42.643 13.05-85.63 11.96-128.505H357.415zm-131.65 1.354v45.786h65.056V27.64h-65.056zM178.12 43.335V94.03H128.48c.084 18.322 1.696 36.784 4.56 55.216l1.34 8.633-50.216 11.298c3.15 13.61 6.88 27.174 11.172 40.677l41.1-6.197 50.804 107.07-31.744 28.473c7.095 11.418 14.626 22.74 22.615 33.952l42.496-31.466 5.634 6.912c9.656 11.84 19.914 23.57 30.766 34.93 10.873-11.26 21.116-22.59 30.664-34.335l5.625-6.922 41.82 30.886c8.05-11.315 15.64-22.748 22.788-34.277l-31.383-28.15 50.803-107.072 40.627 6.127c4.308-13.503 8.054-27.07 11.22-40.68l-49.636-11.24 1.347-8.627c2.855-18.264 4.06-36.774 4.023-55.207h-46.183V43.337h-29.22v48.78h-102.43v-48.78h-28.958zm-13.915 79.252h185.41l.22 9.12c1.746 73.04-27.91 137.976-86.116 199.905l-6.798 7.23-6.81-7.216c-58.558-62.066-87.895-126.956-86.128-199.92l.22-9.12zm18.48 18.69c.818 61.19 25.098 115.615 74.213 170.062 48.85-54.348 73.37-108.852 74.23-170.063H182.685zm-57.18 82.93l-54.216 8.173 52.335 110.306 40.752-36.553-38.873-81.926zm262.76 0l-38.874 81.925 40.753 36.553L442.48 232.38l-54.216-8.173zM217.52 367.227l-42.704 31.62c23.914 32.71 51.31 64.504 82.15 95.236 30.733-30.743 57.7-62.44 81.548-95.19l-42.15-31.128c-10.264 12.222-20.992 24.175-32.792 35.978l-6.597 6.598-6.608-6.586c-11.93-11.89-22.64-24.246-32.846-36.53z","power-ring":"M102.6 34.33c-7.03 7-19.03 19.24-32.07 34.6 25.53 3.3 56.47 11.09 84.97 19.76 18.8 5.72 36.4 11.81 50.2 17.41 7 2.8 13 5.5 17.9 7.9 4.9 2.5 8.4 4.4 11.6 7.6l-12.6 12.8c-.1-.1-3-2.2-7.2-4.3-4.1-2.1-9.8-4.6-16.4-7.3-13.2-5.3-30.4-11.3-48.7-16.9-32.4-9.84-68.89-18.34-93.24-20.24-9.14 12.07-17.4 24.64-22.72 35.84 63.22 13.9 134.16 40.1 173.46 79.3l3.4 3.4-1 4.8s-3 15.4-3 33.8 3.8 38.8 13.5 48.5c9.7 9.8 30.2 13.6 48.6 13.6 18.4 0 33.8-3 33.8-3l4.8-1 3.4 3.4c39.2 39.3 65.4 110.1 79.3 173.4 11.2-5.3 23.7-13.6 35.8-22.7-1.9-24.4-10.3-60.8-20.2-93.1-5.6-18.4-11.6-35.6-16.9-48.8-2.7-6.6-5.2-12.3-7.3-16.4-2.1-4.2-4.2-7.1-4.3-7.2l12.8-12.6c3.2 3.2 5.1 6.7 7.6 11.6 2.4 4.9 5.1 10.9 7.9 17.9 5.6 13.8 11.7 31.4 17.4 50.2 8.6 28.4 16.4 59.4 19.7 85 15.4-13.1 27.6-25.1 34.6-32.1-12.7-64.7-26.1-151.4-62.6-212.2l-1.8-3 .7-3.4s3-15.4 3.1-33.8c0-8.3-.8-17-2.5-25 1.6 11-.2 23.4-4.4 36-7.6 22.8-23.4 47.5-45.6 69.8-22.3 22.2-47 38-69.8 45.6-22.8 7.6-45.2 7.3-59.4-6.9-14.1-14.1-14.5-36.6-6.8-59.3 7.5-22.8 23.3-47.5 45.6-69.8 22.3-22.3 46.9-38.1 69.8-45.6 12.3-4.19 24.6-5.97 35.4-4.51C371.6 95.74 363.1 95 355 95c-18.4 0-33.8 3.06-33.8 3.06l-3.5.68-2.9-1.79c-60.9-36.55-147.5-49.9-212.2-62.62zM371.9 115c-6.4-.1-13.9 1.2-22.3 4-14.2 4.7-30.3 13.7-46 26.3 5.1-3.1 10.2-5.7 15.2-7.8 7.9-3.2 15.4-5.1 22.5-5.2 7.2 0 14.5 2 19.7 7.3 1.7 1.7 3 3.5 4.1 5.5-9-3.9-19.5-1.8-26.4 5.1-9.4 9.4-9.4 24.6 0 34 5.3 5.2 12.6 7.7 20 6.8-6.8 13-17 26.6-29.9 39.4-15.9 16-33 27.8-48.6 34.3-7 2.9-13.7 4.7-20.2 5 7.6 1.5 17.4.6 29.1-3.3 19.4-6.4 42.2-20.7 62.7-41.3 20.6-20.6 34.9-43.3 41.3-62.7 6.4-19.3 4.8-33.7-2.5-40.9-4.1-4.1-10.5-6.4-18.7-6.5zM30.64 135.9c-.48 5.1.53 12.6 4.04 22.1 5.19 14.2 15.06 32.1 28.35 51.7C89.6 249 129.7 295.6 173.1 338.9c43.3 43.4 89.9 83.5 129.2 110.1 19.6 13.3 37.5 23.1 51.7 28.3 9.5 3.5 17 4.5 22.1 4-5.1-23.3-12.1-47.8-20.7-71.2-49.3-29.2-92.9-61.9-131.9-99.1-4.7-2.5-9.2-5.6-13.1-9.5a50.9 50.9 0 0 1-9.5-13.2c-37.2-38.9-69.8-82.5-99-131.7-23.36-8.7-47.92-15.7-71.26-20.7zM130 168c19.1 30.3 39.7 58.2 62 84-.2-4-.3-8-.3-11.8 0-15.7 1.7-26.8 2.6-32.2-16.1-15-38.7-28.5-64.3-40zm174 149.7c-5.4.9-16.5 2.6-32.2 2.6-3.8 0-7.8-.1-11.9-.4 25.9 22.4 53.8 43 84.1 62.1-11.5-25.5-25-48.2-40-64.3z","brain":"M241.063 54.406c-2.31.008-4.61.032-6.907.094-1.805.05-3.61.106-5.406.188-8.814 1.567-12.884 5.426-15.094 9.843-2.435 4.87-2.34 11.423.375 17.25 2.717 5.83 7.7 10.596 14.657 12.376 6.958 1.78 16.536.86 29.125-7.187l10.063 15.75c-15.818 10.11-31.124 12.777-43.813 9.53-12.688-3.247-22.103-12.123-26.968-22.563-4.584-9.836-5.426-21.376-1.03-31.624-42.917 6.94-81.777 23.398-111.626 46.562-9.81 10.688-10.77 23.11-6.47 31.594 4.83 9.526 16.21 16.48 38.97 9.28l5.656 17.813c-28.58 9.04-52.137-.588-61.28-18.625-2.23-4.397-3.592-9.156-4.127-14.063-4.814 5.712-9.16 11.658-13 17.844l.126.06c-8.614 19.616-8.81 33.203-5.376 42.032 3.436 8.83 10.635 14.44 21.72 17.532 22.168 6.18 58.065-1.277 83.343-20.156 10.82-8.08 21.077-27.677 21.97-42.875.445-7.6-1.165-13.604-4.345-17.438-3.18-3.834-8.272-6.703-18.813-6.594l-.187-18.686c14.487-.15 26.25 4.754 33.375 13.344 7.124 8.59 9.26 19.652 8.625 30.468-1.27 21.633-12.595 44.172-29.438 56.75-29.876 22.314-69.336 31.606-99.53 23.188-13.988-3.9-26.37-12.386-32.75-25.53-9.546 45.446 4.323 87.66 30.718 116.874 3.45 3.82 7.122 7.43 10.97 10.78-2.754-7.887-4.016-16.1-3.72-24.093.53-14.325 6.082-28.346 17.22-38.03 9.134-7.946 21.752-12.53 36.843-12.5 1.006 0 2.034.018 3.062.06 2.35.1 4.763.304 7.22.626l-2.44 18.532c-15.588-2.048-25.705 1.522-32.436 7.375-6.73 5.854-10.443 14.614-10.813 24.625-.74 20.024 12.07 43.406 39.69 50.188l-.032.188c27.192 5.19 57.536.372 88-18.22.018-.012.043-.017.062-.03 6.34-4.45 9.755-8.808 11.438-12.563 1.985-4.432 1.943-8.292.53-12.438-2.824-8.29-12.94-16.812-22.218-19.187-15.002-3.84-24.532 1.436-29 7.72-4.468 6.28-4.74 12.45 2.156 17.81l-11.47 14.75c-14.187-11.033-15.092-30.487-5.905-43.405 6.892-9.688 18.985-16.326 33.564-16.75.607-.018 1.228-.036 1.844-.03 4.306.03 8.79.622 13.437 1.81 15.505 3.97 29.84 15.277 35.28 31.25 1.416 4.155 2.09 8.69 1.876 13.314 16.71-8.538 34.332-16.12 52.282-21.814 30.156-13.78 43.23-37.938 42.72-58.28-.515-20.493-13.187-37.74-42.376-40.626l1.844-18.594c36.666 3.626 58.462 29.848 59.188 58.75.422 16.84-5.754 34.363-18.188 49.28 16.072-1.8 32.044-1.495 47.53 1.627-3.152-6.472-4.68-13.478-4.467-20.438.677-22.036 19.42-42.593 48.875-42.906 1.963-.022 3.974.053 6.03.218l-1.5 18.625c-24.927-1.998-34.3 11.086-34.718 24.656-.412 13.42 8.545 28.442 34.22 30.436 28.3.25 48.588-15.098 58.53-37.906 13.31-30.536 6.997-76.317-34.844-118.188-.792-.793-1.578-1.593-2.375-2.375-.444 3.792-1.424 7.443-2.842 10.844-7.25 17.39-24.233 29.128-41.875 32.407-24.335 4.522-44.29-5.347-53.5-20.406-9.21-15.057-6.792-36.35 9.78-47.56l10.47 15.5c-8.913 6.028-9.28 14.19-4.313 22.31 4.967 8.122 16.17 15.156 34.156 11.814 11.306-2.102 23.896-11.33 28.03-21.25 2.07-4.96 2.47-9.862.408-15.47-1.675-4.555-5.187-9.764-11.72-15.25l-.187-.155c-27.316-20.587-56.338-35.393-85.75-45.157.018.032.045.06.063.093 6.684 12.22 7.18 26.082 3.063 38.344-8.233 24.525-34.07 43.848-66.032 42.78-6.948-.23-13.56 3.12-19.186 9.657-5.627 6.537-9.735 16.113-10.688 26.313-1.905 20.4 6.923 42.886 41.344 54L277 258.28c-41.083-13.264-56.83-45.546-54.22-73.5 1.307-13.975 6.706-26.962 15.157-36.78 8.452-9.818 20.475-16.603 33.97-16.156 24.04.802 42.323-14.084 47.687-30.063 2.682-7.988 2.335-15.937-1.75-23.405-3.968-7.252-11.83-14.423-25.906-19.656-17.114-2.967-34.16-4.367-50.875-4.314zM342.28 306.344c-41.915 3.41-87.366 23.4-125.28 46.562-55.98 34.198-114.89 26.733-156.688-4.28 16.444 58.844 74.712 70.788 135.5 55.905 6.083-2.285 12.06-6.538 17.157-12.03 7.057-7.607 12.17-17.47 13.78-25.625l18.344 3.625c-2.445 12.383-9.078 24.666-18.406 34.72-8.95 9.645-20.61 17.35-34.094 19.374-6.766 15.07-12.334 29.68-14.594 39.906-3.55 16.06 14.206 22.225 22.156 6.03 19.022-38.743 45.87-73.23 79.406-102.967 26.064-17.153 48.406-38.303 62.72-61.22z","crossed-swords":"M19.75 14.438c59.538 112.29 142.51 202.35 232.28 292.718l3.626 3.75.063-.062c21.827 21.93 44.04 43.923 66.405 66.25-18.856 14.813-38.974 28.2-59.938 40.312l28.532 28.53 68.717-68.717c42.337 27.636 76.286 63.646 104.094 105.81l28.064-28.06c-42.47-27.493-79.74-60.206-106.03-103.876l68.936-68.938-28.53-28.53c-11.115 21.853-24.413 42.015-39.47 60.593-43.852-43.8-86.462-85.842-130.125-125.47-.224-.203-.432-.422-.656-.625C183.624 122.75 108.515 63.91 19.75 14.437zm471.875 0c-83.038 46.28-154.122 100.78-221.97 161.156l22.814 21.562 56.81-56.812 13.22 13.187-56.438 56.44 24.594 23.186c61.802-66.92 117.6-136.92 160.97-218.72zm-329.53 125.906l200.56 200.53c-4.36 4.443-8.84 8.793-13.405 13.032L148.875 153.53l13.22-13.186zm-76.69 113.28l-28.5 28.532 68.907 68.906c-26.29 43.673-63.53 76.414-106 103.907l28.063 28.06c27.807-42.164 61.758-78.174 104.094-105.81l68.718 68.717 28.53-28.53c-20.962-12.113-41.08-25.5-59.937-40.313 17.865-17.83 35.61-35.433 53.157-52.97l-24.843-25.655-55.47 55.467c-4.565-4.238-9.014-8.62-13.374-13.062l55.844-55.844-24.53-25.374c-18.28 17.856-36.602 36.06-55.158 54.594-15.068-18.587-28.38-38.758-39.5-60.625z","drama-masks":"M418.813 30.625c-21.178 26.27-49.712 50.982-84.125 70.844-36.778 21.225-75.064 33.62-110.313 38.06 2.048 6.063 4.316 12.15 6.813 18.25 16.01.277 29.366-.434 36.406-1.5l9.47-1.53 8.436-1.28.22 10.186c-.17 6.172-.535 12.41-1.095 18.72l56.625 8.843c.86-.095 1.713-.15 2.563-.157 11.188-.114 21.44 7.29 24.468 18.593.657 2.448.922 4.903.845 7.313 5.972-2.075 11.753-4.305 17.28-6.72l9.595-4.188 2.313 10.22c3.483 15.308 6.028 31.385 7.375 48.062C438.29 247.836 468.438 225.71 493 197.5c-3.22-36.73-16.154-78.04-39.125-117.813-.735-1.272-1.47-2.526-2.22-3.78l-27.56 71.374c5.154.762 10.123 3.158 14.092 7.126 9.81 9.807 9.813 25.69 0 35.5-9.812 9.81-25.722 9.807-35.53 0-8.86-8.858-9.69-22.68-2.532-32.5l38.938-100.844c-6.45-9.18-13.215-17.83-20.25-25.937zM51.842 118.72c-8.46 17.373-15.76 36.198-21.187 56.436-14.108 52.617-13.96 103.682-2.812 143.438 13.3-2.605 26.442-3.96 39.312-4.03 1.855-.012 3.688.02 5.53.06 20.857.48 40.98 4.332 59.97 11.5-1.08-11.156-1.656-22.574-1.656-34.218 0-27.8 3.135-54.377 9-78.937l2.47-10.407 9.655 4.562c29.467 13.98 66.194 23.424 106.28 25.22 5.136-20.05 8.19-39.78 9.408-58.75-35.198 4.83-75.387 2.766-116.407-8.22-38.363-10.272-72.314-26.78-99.562-46.656zm230.594 82.218c-1.535 10.452-3.615 21.03-6.218 31.687 15.873-.193 31.286-1.594 46-3.97-1.056-1.84-1.895-3.822-2.47-5.968-1.455-5.432-1-10.925.938-15.78l-38.25-5.97zM105 201.375l4.156 18.22-21.594 4.905c8.75 5.174 13.353 15.703 10.594 26-3.32 12.394-16.045 19.758-28.437 16.438-12.394-3.32-19.76-16.075-16.44-28.47.676-2.517 1.756-4.82 3.126-6.874l-21.062 4.78-4.125-18.218 73.78-16.78zm388.594 22.813c-25.53 25.46-55.306 45.445-86.906 60.5.05 2.397.093 4.8.093 7.218 0 9.188-.354 18.232-1.03 27.125 16.635 1.33 32.045-1.7 45.344-9.374 25.925-14.962 40.608-45.694 42.5-85.47zm-338.844 3c-4.03 19.993-6.33 41.31-6.406 63.593l.125-.342c30.568 10.174 62.622 17.572 95.25 21.375l7.5.875.718 7.5 5.687 60.125-18.625 1.75-2.53-26.75c-4.547 1.875-9.726 2.34-14.845.968-12.393-3.32-19.76-16.042-16.438-28.436.285-1.06.647-2.08 1.063-3.063-19.535-3.727-38.736-8.592-57.406-14.53 2.69 49.62 16.154 94.04 36.094 126.656 22.366 36.588 52.13 57.78 83.968 57.78 31.838.003 61.602-21.19 83.97-57.78 19.536-31.96 32.846-75.244 35.905-123.656-15.773 4.657-31.894 8.552-48.25 11.656 1.914 4.57 2.415 9.78 1.033 14.938-3.322 12.394-16.045 19.758-28.438 16.437-.732-.195-1.43-.427-2.125-.686l-2.5 26.47-18.594-1.752 5.688-60.125.72-7.5 7.498-.875c29.245-3.407 57.995-9.717 85.657-18.312v-1.594c0-21.573-2.27-42.23-6.064-61.75C351.132 242.653 313.092 250 272.312 250c-43.59 0-83.986-8.658-117.562-22.813zm-87.5 105.968c-10.87.102-21.995 1.22-33.375 3.313 12.695 31.62 33.117 53.07 59 60 16.9 4.523 34.896 2.536 52.813-5.25-4.382-13.89-7.874-28.606-10.344-43.97-21.115-9.623-43.934-14.32-68.094-14.094zm137.5 80.22h130.813c-40.082 44.594-92.623 42.844-130.813 0z","emerald-necklace":"M95.92 25.17c-14.73-.32-29.25 5.4-39.24 19.19-19.29 26.68-23.67 60.44-18.07 95.14 5.61 34.7 21.08 70.6 42.55 103.4C118.2 299.5 172.9 347.4 229 359.6v-18.7c-47.8-12.5-98.6-55.7-132.78-107.8-20.32-31.1-34.76-65-39.84-96.5-5.08-31.4-.93-59.81 14.88-81.68 5.96-8.22 12.01-11.48 19.93-11.88 2.65-.13 5.5 0 8.62.48 12.49 1.7 28.49 8.83 45.69 18.02 31.7 16.92 66.8 40.96 101.5 44.66V87.91c-27.2-4.13-61.1-25.2-93-42.25-17.7-9.49-34.9-17.7-51.8-19.99-2.1-.28-4.17-.45-6.28-.5zm320.08 0c-2.1 0-4.2.21-6.3.5-16.8 2.29-34 10.5-51.7 19.99-31.9 17.05-65.8 38.12-93 42.25v18.19c34.7-3.7 69.8-27.65 101.5-44.57 17.2-9.19 33.2-16.32 45.7-18.02 12.5-1.7 20.6.44 28.5 11.41 15.8 21.87 20 50.28 14.9 81.68-5.1 31.5-19.5 65.4-39.8 96.5-34.2 52.1-85 95.3-132.8 107.8v18.7c56.1-12.2 110.8-60.1 147.8-116.7 21.5-32.8 37-68.7 42.6-103.4 5.6-34.7 1.2-68.46-18.1-95.13-10-13.8-24.5-19.51-39.3-19.2zM247 344.2V376.6h18V344.2c-3 .2-6 .4-9 .4s-6-.2-9-.4zm-12.3 50.4l-10.5 7 31.8 21.2 31.8-21.2-10.5-7zM217 418.4v30.4l22.8-15.2zm78 0l-22.8 15.2 22.8 15.2zm-39 26l-31.8 21.2 31.8 21.2 31.8-21.2z","boots":"M334.5 85.22c-31.403.523-69.44 13.372-100.563 42.81l17.594 215.407-6.468 77.657h58.125l15.282-37.72 21.124 37.72h151.53c7.896-58.587-44.23-130.167-74.53-130.375l-16.53 1.124c-36.103 7.265-49.647 27.03-66.314 49.78l-4.28 5.845-6.72-2.69-13.03-5.25-14.283 36.595-17.406-6.78 14.376-36.783-11.906-4.78-8.563-3.438 3.313-8.594c7.98-20.727 20.735-40.35 38.906-54.156 14.907-11.326 33.593-18.483 55.156-18.688 1.438-.013 2.88.014 4.344.063 1.917.063 3.856.167 5.813.343l2.5-18.157c-26.083-16.097-67.526-14.873-103.72-.72l-6.78-17.405c20.11-7.864 41.785-12.5 62.655-12.56 17.98-.054 35.357 3.307 50.563 10.874l5.593-40.656c-31.286-27.418-77.42-24.612-119.374-.594l-9.28-16.22c23.566-13.49 49.485-21.265 74.312-21.31 20.46-.04 40.183 5.176 57.28 16.78l2.188-15.844c.354-1.526.61-3.013.78-4.47.002-.02 0-.04.002-.06.357-10.548-4.066-18.356-12.938-25-9.483-7.103-24.383-11.937-42.03-12.657-2.207-.09-4.44-.132-6.72-.094zm-194.406 77.31c-.838.01-1.678.03-2.5.064-13.162.537-24.16 4.175-30.938 9.25-6.776 5.075-9.702 10.64-8.937 18.844l-.595.062c.132 1.234.324 2.514.625 3.813l2.313 16.718c10.807-7.494 23.1-11.163 35.53-11.093 17.786.102 35.61 7.284 51.782 19.25l-11.094 15c-13.73-10.16-28.064-15.49-40.81-15.562-11.988-.068-22.776 4.042-32.407 14.344l4.406 31.843c8.974-4.182 18.787-6.078 28.843-6.063 14.792.022 30.092 4.157 44 11.188l-8.438 16.687c-21.797-11.02-45.487-12.505-61.688-2l2.032 14.72c.837-.03 1.677-.058 2.5-.064 14.633-.1 27.16 4.06 37.343 11.25 14.48 10.227 24.226 25.514 32.625 41.595l4.28 8.25-8.218 4.344-8.47 4.467L186 394.875l-16.438 8.875-13.812-25.594-9.156 4.844-6.344 3.344-4.875-5.25c-16.32-17.62-29.136-32.608-60.406-35.188l-9-.75c-32.087 15.312-47.556 38.284-42.44 76.25h190.44l-5.095-59.687-.03-.064 13.593-162.625c-24.97-26.094-56.98-36.796-82.344-36.5zm229.344 99.032c-17.593.075-31.926 5.756-43.97 14.907-12.36 9.39-22.03 22.778-29 37.592l26.657 10.72c14.056-18.898 30.816-38.795 61.813-48.344l-8.032-14.47c-1.3-.105-2.638-.295-3.906-.343-1.202-.045-2.39-.067-3.563-.063zM116.594 318c-4.288-.028-9.038.543-14.28 1.625l-9 10.656c23.388 6.11 38.254 19.727 50.75 32.94l10.655-5.626 8.843-4.688c-6.628-11.382-13.846-20.917-22.282-26.875-6.494-4.586-13.685-7.535-22.874-7.967-.593-.028-1.2-.06-1.812-.063z","broadsword":"M491.844 22.533l-83.42 14.865L196.572 249.25c3.262 4.815 5.37 10.72 5.37 16.932 0 5.863-1.71 11.35-4.643 15.996-5.065-1.606-10.448-2.477-16.027-2.477-15.724 0-29.904 6.89-39.69 17.796l-9.112-9.113 17.237-17.237c-4.515-5.772-8.907-11.645-13.19-17.6l-19.443 19.44-13.215-13.215 21.828-21.827c-4.403-6.59-8.67-13.278-12.792-20.068l-40.802 40.803 58.314 58.314c-1.613 5.075-2.49 10.47-2.49 16.063 0 7.666 1.65 14.96 4.592 21.564l-72.14 72.14-14.56-14.56L21.013 437l14.558 14.56-8.607 8.608 27.246 27.246 8.606-8.61 14.56 14.56 24.798-24.8-14.557-14.556 72.158-72.16c6.586 2.922 13.858 4.562 21.498 4.562 5.593 0 10.988-.877 16.063-2.49l58.363 58.363L296.5 401.48c-6.797-4.127-13.486-8.395-20.068-12.793l-21.83 21.83L241.39 397.3l19.442-19.44c-5.962-4.29-11.835-8.683-17.603-13.194l-17.238 17.238-9.16-9.16c10.905-9.785 17.795-23.965 17.795-39.69 0-5.346-.806-10.51-2.285-15.39 4.703-3.04 10.288-4.817 16.265-4.816 6.21 0 11.776 1.77 16.52 4.955L476.98 105.95l14.864-83.417zm-66.227 53.012l13.215 13.215-191.684 191.68-13.214-13.213L425.617 75.545zM181.273 298.39c19.257 0 34.665 15.41 34.665 34.665 0 19.256-15.408 34.666-34.665 34.666-19.256 0-34.666-15.41-34.666-34.665s15.41-34.666 34.666-34.666z","visored-helm":"M258.094 18.5c-74.34 0-138.073 62.498-156.188 148.438 52.758-7.697 102.23-22.044 153.938-45.094l4.125-1.813 3.967 2.064c49.424 25.667 97.648 41.026 150.657 46.406-17.66-86.744-81.71-150-156.5-150zm1.28 122.156c-57.41 25.148-112.883 39.993-172.53 47 6.724 32.847 6.91 65.935-.5 98.938 89.29 41.602 231.648 43.154 340.594-.125-10.762-32.516-11.727-65.66-1.188-98.408-59.03-4.235-112.628-20.06-166.375-47.406zm-13.5 33.125h18.72v127.75h-18.72V173.78zm-58.78 11.19h18.687v101.655h-18.686V184.97zm115.72 0h18.686v101.655h-18.688V184.97zm-171.72 14.905h18.687v79.28h-18.686v-79.28zm227.72 0h18.686v79.28h-18.688v-79.28zm38.748 116.75c-14.302 4.282-28.96 7.873-43.78 10.844l-19.22 64.06c26.114-17.337 48.002-43.31 63-74.905zm-277.53 2.875c13.95 28.257 33.448 51.85 56.562 68.53l-17.688-58.905c-13.397-2.61-26.387-5.826-38.875-9.625zm213.156 11.656c-51.63 8.175-104.745 8.588-153.72 1.438l20.845 69.5c18 8.52 37.49 13.187 57.78 13.187 18.588 0 36.507-3.92 53.22-11.124l21.875-73zm-195.5 47.156c-19.436 21.562-36.416 44.367-48.594 72.157 70.233-8.736 133.743 14.684 168.03 50.75 39.684-35.607 103.71-55.685 170.876-44.25-15.08-29.372-33.32-51.982-53.938-74-31.187 31.75-71.53 51-115.968 51-46.568 0-88.65-21.142-120.406-55.658z","crown":"M408.256 119.46l-37.7 52.165 19.57 44.426 34.8-37.214-16.67-59.375zm86.074 12.513L384.44 249.498 334.01 135.02l-75.162 132.947-86.948-131.78-33.334 114.122L17.922 132.83l39.3 127.6c1.945-.348 3.94-.54 5.98-.54 18.812 0 34.26 15.452 34.26 34.262 0 13.823-8.346 25.822-20.235 31.22l5.337 17.33c12.425 25.466 71.863 45.152 176.582 47.206 110.805 2.174 178.12-17.54 189.854-47.207h-.002l4.357-20.26c-16.836-2.114-30.02-16.612-30.02-33.986 0-18.81 15.45-34.262 34.263-34.262 3.513 0 6.91.54 10.11 1.54l26.622-123.762zm-391.77 2.04l1.22 56.337 25.56 24.89 9.592-32.842-36.37-48.386zm150.585 2.91l-24.483 51.36 28.955 43.885 24.922-44.08-29.395-51.166zm204.453 135.962c-8.712 0-15.575 6.862-15.575 15.572 0 8.71 6.863 15.574 15.575 15.574s15.572-6.863 15.572-15.573-6.86-15.572-15.572-15.572zM63.2 278.58c-8.71 0-15.573 6.864-15.573 15.574s6.862 15.573 15.574 15.573c8.713 0 15.573-6.862 15.573-15.573 0-8.71-6.86-15.574-15.572-15.574zm130.33 17.842c18.812 0 34.26 15.45 34.26 34.262 0 18.81-15.448 34.26-34.26 34.26-18.813 0-34.262-15.45-34.262-34.26s15.45-34.262 34.26-34.262zm131.234 0c18.812 0 34.26 15.45 34.26 34.262 0 18.81-15.448 34.26-34.26 34.26-18.813 0-34.262-15.45-34.262-34.26s15.45-34.262 34.262-34.262zm-131.235 18.69c-8.713 0-15.573 6.86-15.573 15.572 0 8.71 6.86 15.574 15.572 15.574 8.71 0 15.572-6.864 15.572-15.574s-6.86-15.573-15.573-15.573zm131.234 0c-8.712 0-15.573 6.86-15.573 15.572 0 8.71 6.862 15.574 15.574 15.574s15.574-6.864 15.574-15.574-6.862-15.573-15.574-15.573z","feather":"M470.7 20L368.2 49.81l41.5-28.09c-26.2 5.92-59.3 17.5-100.9 36.19l-67.9 70.79L265 79.25c-23.3 12.96-48 29.95-71.8 49.85l-15.8 64.3-3.4-47.6c-23.5 21.6-45.6 45.6-63.9 70.9-19.23 26.5-34.26 54.5-41.79 82.4l-28.12-18.8c2.52 23.7 10.31 44.3 23.09 63.2l-33.62-10.3c7.64 23.5 20.13 38.7 41.25 51-11.83 33.3-17.38 68.1-23.34 102.8l18.4 3.1C87.31 277.4 237.9 141.8 374 81.72l6.9 17.38c-121.7 54.5-216.3 146.5-265.8 279.1 18.1.1 35.8-2.1 52.2-6.3l4.9-60.9 13.1 55.5c10.9-4 20.9-8.8 29.8-14.4l-20.7-43.5 32.8 34.8c8-6.4 14.6-13.6 19.6-21.5 30.4-47.5 62.2-94.7 124.8-134.2l-45.7-16.2 70.1 2.1c11.4-5.8 23.4-12.9 32.5-19.6l-49.7-4 74.7-17.6c5.8-5.8 11.2-11.9 16.1-18 17.3-21.94 29-44.78 26.2-65.55-1.3-10.39-7.5-20.16-17.6-25.63-2.5-1.3-5.2-2.45-7.5-3.22z","cape":"M257.1 18.46c-17 19.58-32.7 35.31-55.1 42.98 41.5 68.46 139.9 119.76 241.2 62.36 18-14.1 26.7-31.45 34.9-47.34-98.9-5.45-164.8-19.81-221-58zM225 111.1c-18.9 38.3-41 72.2-65.1 100.2-40.8 47.5-87.03 78.7-132.67 85.3 6.47 19.8 10.43 59.2 25.84 72.6 45.63 18.5 132.83-9.1 164.63-38.7 16.1-16.4 24-36.6 34.2-60.9-2 35.2-13.3 56.6-27.7 72.4-18.5 18.2-36.6 30.8-59 37.8 11.9 22.3 16.8 49.7 27.7 67.8 4.4 6.7 8 9.5 14.6 9.4 42-10.9 74.4-45.9 110.9-60.5 55.3-29.3 65.3-74 67-85.5-1.1 28.7-12.7 67.5-31.7 83.6 33.8 12.4 47.5 67.3 52.3 90.2 15.2-14 33.2-35.4 48.1-60.1C473 393.5 487 357.2 487 324.2c-.3-38.8-17-76.4-26.5-118.2-5-21.7-7.7-44.7-4.6-69.3-131.7 55.7-190.9 9.4-230.9-25.6z","lotus":"M254.963 40.213c-37.634 31.356-62.038 67.976-77.916 109.394 8.544 12.5 16.607 25.44 24.228 38.594 15.642-5.553 32.468-8.587 49.995-8.587 17.886 0 35.046 3.156 50.96 8.93 9.07-14.52 18.652-28.856 28.89-42.66-15.736-38.504-39.406-74.025-76.157-105.67zM434.593 72.5c-46.74 28.5-83.334 74.49-114.616 123.826 21.934 11.372 40.696 28.023 54.636 48.244 23.212-22.514 48.206-44.643 75.58-66.82-.882-31.955-5.798-67.033-15.6-105.25zm-353.03 1.094c-9.435 37.96-14.433 72.695-15.74 104.27 23.62 20.078 45.453 40.406 65.78 61.603 13.77-18.29 31.614-33.345 52.194-43.774-28.336-48.245-62.472-92.77-102.234-122.1zm-54.59 96.7C9.708 278.34 31.295 358.165 72.27 411.517c22.427 29.2 50.77 50.62 82.128 64.363-20.892-35.934-25.973-76.777-16.613-116.112 4.668-19.617 12.848-38.864 24.274-57.09-38.14-48.11-82.083-90.01-135.087-132.383zm462.588.464c-59.87 45.918-108.408 90.682-151.36 138.615 9.625 17.744 16.24 36.16 19.722 54.732 7.08 37.78 1.012 76.134-18.31 109.926 32.2-14.254 62.005-35.988 86.51-65.214 44.98-53.64 72.394-132.675 63.44-238.058zM251.27 198.3c-44.09 0-83.025 21.667-106.764 54.954 9.898 10.856 19.428 21.973 28.64 33.42 18.55-24.415 43.224-46.48 73.372-64.422l5.072-3.02 4.906 3.286c30.383 20.345 54.374 44.323 71.65 70.185 10.638-11.774 21.61-23.376 33.012-34.85-23.354-35.875-63.803-59.552-109.888-59.552zm-.268 43.182c-51.58 32.272-84.19 77.032-95.035 122.612-10.94 45.97-.302 92.658 35.986 130.607h108.904c34.806-36.38 47.222-81.652 38.696-127.15-8.466-45.177-37.988-90.634-88.55-126.068z","chest-armor":"M156.7 25.83L89 39.38c-.1 58.57-1.74 119.32-43.49 167.22C104.4 246.5 189 260.7 247 248.8v-99L108.3 88.22l7.4-16.44L256 134.2l140.3-62.42 7.4 16.44L265 149.8v99c58 11.9 142.6-2.3 201.5-42.2-41.8-47.9-43.4-108.65-43.5-167.22l-67.7-13.55c-12.9 13.88-20.6 28.15-32.9 40.53C308.9 79.78 289.5 89 256 89c-33.5 0-52.9-9.22-66.4-22.64-12.3-12.38-20-26.65-32.9-40.53zM53.88 232.9C75.96 281 96.07 336.6 102.7 392.8l65 22.8c4.2-52.7 28.2-104 63.7-146.1-55.1 6.3-122.7-5.8-177.52-36.6zm404.22 0c-54.8 30.8-122.4 42.9-177.5 36.6 35.5 42.1 59.5 93.4 63.7 146.1l65.2-22.9c6.6-56.8 26.6-111.8 48.6-159.8zM256 269c-40.5 43.1-67.7 97.9-70.7 152.7l61.7 21.6V336h18v107.3l61.7-21.6c-3.1-54.8-30.2-109.6-70.7-152.7zm151.7 143.4L297 451.1v18.8l110.2-44.1c.1-4.5.3-8.9.5-13.4zm-303.3.1c.3 4.5.4 8.9.5 13.4l110.1 44v-18.7l-110.6-38.7zM279 457.4l-23 8.1-23-8v19.6l23 9.2 23-9.2v-19.7z","diamond-ring":"M191.02 25.346l-22.9 34.35h30.714l22.9-34.35H191.02zm52.347 0l-22.898 34.35h71.06l-22.897-34.35h-25.266zm46.9 0l22.9 34.35h30.714l-22.9-34.35h-30.714zm-117.234 52.35l50.115 50.115-25.058-50.115h-25.057zm45.182 0L256 153.265l37.785-75.57h-75.57zm95.695 0l-25.058 50.115 50.115-50.115H313.91zm-134.435 31.898C109.163 139.5 59.693 209.29 59.693 290.348c0 108.185 88.122 196.306 196.307 196.306 108.185 0 196.307-88.12 196.307-196.306 0-81.057-49.47-150.848-119.782-180.754l-30.517 30.517c64.397 19.592 111.037 79.292 111.037 150.238 0 86.966-70.08 157.045-157.045 157.045-86.966 0-157.045-70.08-157.045-157.045 0-70.946 46.64-130.646 111.037-150.237l-30.517-30.516z","wolf-head":"M179.3 38.94C154.7 77.7 142.7 139.7 168.4 185.9l-16.3 9.2c-6.7-11.9-11.2-24.4-13.9-37.2-34.5-6.3-69.42-7.5-104.98-2.1 34.07 10.1 52.77 23.7 76.68 46.7-26.82 9.7-60.25 30.2-92.93 70.2 35.47-8.8 64.83-11.5 89.43-6.3-36.94 22.5-64.06 56.1-88.34 114.1 35.9-17.2 64.89-18.8 102.94-18.8-23.07 32.7-35.27 77.2-36.31 112.8 24.51-26 57.61-60.2 87.21-79 3 29.9 15 58.3 35.9 85.3-.2-43.9 10.3-88.3 31.6-133.4-18.8 9-32.4 18.1-49.9 29.3 6.2-27.9 12.4-55.8 18.7-83.7-23.3 2.4-39 10-60.5 18.5 16.3-33.1 32.7-66.1 49.1-99.2l16.8 8.3-28.4 57.4c18.4-4.4 28.7-4.1 45.7-1.3-4.5 20.4-9 40.7-13.6 61 65.3-36.2 148.3-45.9 226.7-50 7.6-12.9 13.8-24.2 18.8-34.8l-6.3-24.4-24.4 30.8-7.8-27.5-22.5 29.2-7.5-26.1-23.9 31.5-7.7-28.2-23.8 31.4 1.2-41.1 22.6-42.7 7.6 28.3 23.9-31.5 7.6 28.2 23.5-30 6.5 26.9 24.5-30.8 7.8 27.5 24.6-32c2.3-10.8 4.6-22.4 7.4-35.7-55.5-3.7-106.3 4.8-154 9.8-38-20.8-80.8-26.8-121.9-18.5-13.6-29.69-27.2-59.38-40.9-89.06zM325.5 158.3c-4.5 14.2-13 18.3-24.7 20.6-16.1-4.4-28.3-15.5-34.4-30.2 20.4-3.8 42.4 3.4 59.1 9.6z"};
const STAT_ART = { str: 'crossed-swords', end: 'bordered-shield', int: 'brain', cha: 'drama-masks', wil: 'lotus', agi: 'feather' };
const TOTEM_ART = { wolf: 'wolf-head', owl: 'owl', bear: 'bear-face' };
const ART_ICON = { // DS2.0 x game-icons (CC BY 3.0): настоящие иконки реликвий вместо эмодзи
swordDiscipline: 'broadsword', shieldWill: 'bordered-shield', amuletFocus: 'emerald-necklace',
ringCharisma: 'power-ring', ringInsight: 'diamond-ring', bootsWanderer: 'boots',
crownArchon: 'crown', capeShadows: 'cape', chestVirtue: 'chest-armor'
};
const SLOT_ART = { head: 'visored-helm', amulet: 'emerald-necklace', chest: 'chest-armor', cape: 'cape', weapon: 'broadsword', shield: 'bordered-shield', ring1: 'power-ring', ring2: 'diamond-ring', boots: 'boots' };
function artIconHtml(name, cls) { // инлайн-SVG силуэт: перекрашивается через currentColor
    var d = ICON_PATHS[name];
    if (!d) return '';
    return '<svg class="nd-art ' + (cls || '') + '" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="' + d + '"/></svg>';
}
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
cell.innerHTML = (artIconHtml(ART_ICON[item.id], 'bp-icon') || '<span class="bp-icon">' + item.icon + '</span>') + '<span class="bp-rank">' + item.rank + '</span>';
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
(artIconHtml(ART_ICON[item.id]) || item.icon) +
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
slot.innerHTML = (artIconHtml(ART_ICON[item.id], 'slot-icon') || '<span class="slot-icon">' + item.icon + '</span>') + '<span class="slot-rank-badge" style="background:' + rc.color + '">' + item.rank + '</span><div class="equip-flash"></div>';
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
slot.innerHTML = artIconHtml(SLOT_ART[key], 'slot-icon empty-art') || (defaultIcons[key] || '?');
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
    const name = validDisplayText(document.getElementById('goalName').value, 60);
    if (!name) { showToast('⚠ Ошибка', 'Название цели: добавь буквы или цифры', 'blood'); return; }
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
if (typeof addChronicle === 'function') addChronicle('📜', 'Обет сдержан: «' + goal.name + '»'); // G2: обеты сезона
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
var _ndTextRe = null;
try { _ndTextRe = new RegExp('[\\p{L}\\p{N}]', 'u'); } catch(e) { _ndTextRe = /[0-9A-Za-zА-Яа-яЁё]/; }
function validDisplayText(raw, maxLen) { // P3c: пустота и «только эмодзи» — не название
    var name = String(raw == null ? '' : raw).trim().slice(0, maxLen || 40);
    if (!name) return null;
    return _ndTextRe.test(name) ? name : null;
}
function forgeCard() {
const name = validDisplayText(document.getElementById('forgeName').value, 40);
if (!name) { showToast('⚠ Ошибка', 'Название: добавь буквы или цифры (не только эмодзи)', 'blood'); return; }
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
// DS2.0: направление перехода — захватить ДО снятия .active
var _dsFrom = -1;
try { var _dsPrev = document.querySelector('.view.active'); if (_dsPrev) _dsFrom = VIEW_ORDER.indexOf(_dsPrev.id.replace('view-', '')); } catch (e) {}
document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
var tabEl = document.querySelector('.tab[data-view="' + view + '"]');
var bnavEl = document.querySelector('.bnav-btn[data-view="' + view + '"]');
if (tabEl) tabEl.classList.add('active');
if (bnavEl) bnavEl.classList.add('active');
var _dsTarget = document.getElementById('view-' + view);
_dsTarget.classList.add('active');
try {
    var _dsTo = VIEW_ORDER.indexOf(view);
    if (_dsFrom > -1 && _dsTo !== _dsFrom) {
        _dsTarget.classList.remove('slide-next', 'slide-prev');
        void _dsTarget.offsetWidth;
        _dsTarget.classList.add(_dsTo > _dsFrom ? 'slide-next' : 'slide-prev');
    }
} catch (e) {}
document.querySelector('.content').scrollTop = 0; // V-7: смена вкладки всегда сверху
if (view === 'hero') { renderStats(); updateHeroUI(); renderGoals(); }
if (view === 'strongholds') renderStrongholds();
if (view === 'quests') renderTasks();
if (view === 'deck') renderDashboard();
if (view === 'inv') { renderBackpack(); renderSlots(); updateTotalBonuses(); }
if (view === 'deck') renderCards();
if (view === 'stats') renderStatsView();
if (typeof window.__ndSetCombatActive === 'function') window.__ndSetCombatActive(view === 'boss');
if (typeof updateBackButton === 'function') updateBackButton(); // волна 2: вне «Колоды» BackButton ведёт домой
if (typeof updateMainButton === 'function') updateMainButton(); // волна 2: CTA штурма только во вкладке Твердынь
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
    if (typeof HERO.bosses.closedCount !== 'number') HERO.bosses.closedCount = 0; // G2
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
    if (HERO.bosses.closedDay === tk && (HERO.bosses.closedCount || 0) >= 2) return; // G2: 2 фазы/день (пин изменён кругом 11)
    if (HERO.bosses.closedDay !== tk) HERO.bosses.closedCount = 0;
    if (HERO.bosses.activeNum === null) return;
    var b = bossOf(HERO.bosses.activeNum);
    if (!b) return;
    var ph = b.phases[HERO.bosses.phase];
    if (!ph) return;
    st = st || bossTodayStats();
    if (!bossPhaseCheck(ph, st, bossEscalation(b.num))) return;
    HERO.bosses.phase += 1;
    HERO.bosses.closedCount = (HERO.bosses.closedDay === tk ? (HERO.bosses.closedCount || 0) : 0) + 1;
    HERO.bosses.closedDay = tk;
    if (HERO.bosses.phase >= 3) {
        HERO.bosses.defeated.push(b.num);
        HERO.bosses.activeNum = null;
        HERO.bosses.phase = 0;
        showToast('🏆 Поверенный повержен: ' + b.name, 'Артефакт твой: ' + b.artifact.name + ' — ' + b.artifact.desc, 'save');
        if (typeof addChronicle === 'function') addChronicle('🏆', 'Поверенный ' + b.name + ' повержен — артефакт «' + b.artifact.name + '»'); // G1: хроника живёт
    } else {
        var _moreToday = HERO.bosses.closedCount < 2;
        showToast('⚔ Фаза ' + HERO.bosses.phase + '/3 пройдена', '«' + b.name + '»: ' + (_moreToday ? 'можно пройти ещё одну фазу сегодня' : 'следующая фаза — завтра'), 'crit');
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
function seasonTrials() { // G2 (круг 11): испытания сезона — прогресс выводится из снапшота, без новых полей схемы
    var sn = (typeof ensureSeason === 'function') ? (ensureSeason() || { num: 1, snapshot: {} }) : { num: 1, snapshot: {} };
    var num = sn.num || 1;
    var snap = sn.snapshot || {};
    var comps = FORGED.reduce(function(a, c) { return a + (c.totalCompletions || 0); }, 0);
    var defs = [
        { id: 'expansion', icon: '🏰', name: 'Экспансия', goal: 2 + Math.min(4, num - 1), cur: Math.max(0, capturedCount() - (snap.captured || 0)), unit: 'твердынь' },
        { id: 'discipline', icon: '📖', name: 'Дисциплина', goal: Math.min(60, 30 + 10 * (num - 1)), cur: Math.max(0, comps - (snap.completions || 0)), unit: 'выполнений' },
        { id: 'path', icon: '🧠', name: 'Путь силы', goal: 400 * num, cur: Math.max(0, (HERO.totalXp || 0) - (snap.totalXp || 0)), unit: 'XP' }
    ];
    defs.forEach(function(t) { t.done = t.cur >= t.goal; t.pct = Math.min(100, Math.round(t.cur / t.goal * 100)); });
    return defs;
}
function seasonTrialsDone() { return seasonTrials().filter(function(t) { return t.done; }).length; }
function seasonTrialsHtml() { // G2: панель испытаний во вкладке Твердынь
    var trials = seasonTrials();
    var doneN = trials.filter(function(t) { return t.done; }).length;
    var html = '<div class="trials-panel"><div class="trials-head">🎖 Испытания сезона <span class="trials-count">' + doneN + '/3 · награда за все: +1 👑 венец</span></div>';
    trials.forEach(function(t) {
        html += '<div class="trial-row' + (t.done ? ' done' : '') + '"><span class="trial-icon">' + t.icon + '</span>' +
        '<span class="trial-name">' + t.name + '</span>' +
        '<span class="trial-bar"><span class="trial-fill" style="width:' + t.pct + '%"></span></span>' +
        '<span class="trial-num">' + Math.min(t.cur, t.goal) + '/' + t.goal + '</span></div>';
    });
    html += '</div>';
    return html;
}
function finishSeason() {
  addChronicle('🍂', 'Сезон ' + season.num + ' («' + seasonName(season.num) + '») завершён: ' + capturedCount() + '/20 твердынь'); // Г5-Ф
  if ((season.crownBonus || 0) > 0) addChronicle('👑', 'Венец сезона: +' + (season.crownBonus * 2) + '% к налогам навсегда'); // G1: хроника живёт
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
    var _trialsAll = seasonTrialsDone() === 3; // G2 (круг 11): все испытания сезона — ещё +1 венец (не моделируется симом; ограничение: общий кап +10% такс-множителя сохраняется)
    var newCrownBonus = Math.min(5, (season.crownBonus || 0) + (earnedCrown ? 1 : 0) + (_trialsAll ? 1 : 0));
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
if (typeof addChronicle === 'function') addChronicle('🌩', 'Буря сезона обрушилась на ' + STRONGHOLDS[_st.regionIdx].name + ' — дань не уплачена'); // G1: хроника живёт
sfxFail(); haptic('error'); saveGameState();
return;
}
if ((_st == null || _st.num < season.num) && seasonDaysDone(season.start) >= stormDayOf(season.num)) {
var _cand = [];
strongholds.forEach(function(s, i) { if (s.captured && i > 0) _cand.push(i); }); // регион не-фронт: стартовый лагерь idx 0 исключён
if (!_cand.length) return;
var _ri = _cand[Math.floor(Math.random() * _cand.length)];
HERO.storm = { num: season.num, regionIdx: _ri, dueDayKey: getMSKDayKey(Date.now() + 7 * 86400000), paid: false };
if (typeof addChronicle === 'function') addChronicle('🌩', 'Буря сезона идёт на ' + STRONGHOLDS[_ri].name + ' — дань ' + (50 * capturedCount()) + '💰 до ' + HERO.storm.dueDayKey); // G1: хроника живёт
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
function championSvg(tier) { // DS2.0 (волна V2): слоёный SVG-чемпион вместо пиксельного спрайта
    var aura = { t1: '#9ca3af', t2: '#60a5fa', t3: '#c084fc', t4: '#fbbf24', t5: '#f4c896', t6: '#ff6b6b' }[tier] || '#9ca3af';
    var uid = 'chg' + tier;
    return '<svg class="champion" viewBox="0 0 120 120" aria-hidden="true">' +
        '<defs><radialGradient id="' + uid + '" cx="50%" cy="42%" r="62%">' +
        '<stop offset="0%" stop-color="' + aura + '" stop-opacity="0.42"/>' +
        '<stop offset="62%" stop-color="' + aura + '" stop-opacity="0.10"/>' +
        '<stop offset="100%" stop-color="' + aura + '" stop-opacity="0"/></radialGradient></defs>' +
        '<circle cx="60" cy="52" r="52" fill="url(#' + uid + ')"/>' +
        '<g class="champion-breathe">' +
        '<path d="M34 100 C32 74 40 58 60 52 C80 58 88 74 86 100 Z" fill="#2b2138" stroke="' + aura + '" stroke-opacity="0.9" stroke-width="2"/>' + // плащ
        '<path d="M46 60 L42 100 L54 100 L57 66 Z" fill="#3a2f4a"/>' + // складка плаща
        '<path d="M48 54 L44 78 L52 74 L50 56 Z M72 54 L76 78 L68 74 L70 56 Z" fill="#251d33" stroke="' + aura + '" stroke-opacity="0.5" stroke-width="1.2"/>' + // наплечники
        '<rect x="52" y="42" width="16" height="30" rx="6" fill="#382c4a" stroke="' + aura + '" stroke-opacity="0.7" stroke-width="1.6"/>' + // торс
        '<path d="M50 40 Q50 26 60 26 Q70 26 70 40 L70 46 L50 46 Z" fill="#443655" stroke="' + aura + '" stroke-width="2"/>' + // шлем
        '<path d="M60 30 L60 45" stroke="#0a0a0f" stroke-width="3"/>' + // визор T
        '<path d="M60 26 L60 18" stroke="' + aura + '" stroke-width="2.4" stroke-linecap="round"/>' + // плюмаж-штырь
        '<circle cx="60" cy="17" r="2.6" fill="' + aura + '"/>' +
        '</g></svg>';
}
function updateHeroAvatarSprites() {
    var tier = heroTierKey();
    var av = document.getElementById('heroAvatar');
    if (av) {
        var old = av.querySelector('.hero-avatar-img');
        if (old) old.remove(); // DS2.0: пиксельный спрайт больше не лицом игры (в найме остаётся)
        var svg = av.querySelector('.champion');
        if (!svg) {
            av.insertAdjacentHTML('afterbegin', championSvg(tier));
        } else if (!svg.innerHTML.includes('url(#chg' + tier + ')')) {
            svg.outerHTML = championSvg(tier);
        }
    }
    var mini = document.getElementById('heroAvatarMini');
    if (mini && !mini.querySelector('.icn')) { mini.innerHTML = '<svg class="icn" aria-hidden="true" style="width:18px;height:18px"><use href="#i-hero"/></svg>'; }
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
function hireCostOf(tier) { var base = UNIT_TIERS[tier].cost * (1 - Math.min(0.30, 0.005 * STATS.cha.value)); base *= synergyHireMult(); // Г1-3: zh-линейка → найм −10%
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
var mainText = anyFell ? 'Твердыня пала...' : 'Оборона держит!';
spect.innerHTML = siegeSceneSvg(anyFell) + '<div class="ss-text">' + mainText + '</div>';
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
if (typeof updateMainButton === 'function') updateMainButton(); // штурм использован — CTA прячется до завтра
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
function weatherEffectText(prov, w) { // G1: человеческий эффект погоды провинции
    if (w.id === 'blizzard' && weatherNorth(prov)) return 'содержание ×2';
    if (w.id === 'drought' && weatherSouth(prov)) return 'налог ×0.75';
    if (w.id === 'fog') return 'сила фронта скрыта';
    return null;
}
function weatherForecastChips() { // G1: чипы погоды только там, где эффект реален
    var sw = weatherSeasonWeek();
    var out = '';
    var provNames = { 1: 'Пограничье', 2: 'Чертожьи Холмы', 3: 'Срединные Пустоши', 4: 'Терновые Пределы' };
    for (var p = 1; p <= 4; p++) {
        var w = weatherOf(p, sw.sn, sw.wk);
        var eff = weatherEffectText(p, w);
        if (!eff) continue;
        var front = (frontIdx() >= 0 && STRONGHOLDS[frontIdx()].prov === p);
        out += '<span class="dash-chip weather-chip weather-' + w.id + '" title="Погода недели: ' + provNames[p] + '">' + w.icon + ' ' + provNames[p] + ': ' + w.name + ' — ' + eff + (front ? ' · фронт' : '') + '</span> ';
    }
    return out.trim();
}
function weatherMorningBrief() { // G1: утренний дайджест — один тост на день, только непустой
    try {
        var todayKey = getMSKDayKey();
        var KEY = 'nd_weatherbrief_';
        if (localStorage.getItem(KEY + todayKey)) return;
        localStorage.setItem(KEY + todayKey, '1');
        var sw = weatherSeasonWeek();
        var lines = [];
        var provNames = { 1: 'Пограничье', 2: 'Чертожьи Холмы', 3: 'Срединные Пустоши', 4: 'Терновые Пределы' };
        for (var p = 1; p <= 4; p++) {
            var w = weatherOf(p, sw.sn, sw.wk);
            var eff = weatherEffectText(p, w);
            if (eff) lines.push(provNames[p] + ': ' + w.name + ' (' + eff + ')');
        }
        if (lines.length) showToast('🌫 Погода недели', lines.join(' · '));
    } catch (e) {}
}

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
var _pill = document.getElementById('siegePill'); // DS2.0: осадная тревога в хедере
if (_pill) {
    var _dts = (typeof daysToSiegeNow === 'function' && n > 0) ? daysToSiegeNow() : null;
    if (_dts !== null && _dts <= 2) {
        _pill.style.display = '';
        var _pillText = document.getElementById('siegePillText');
        if (_pillText) _pillText.textContent = _dts <= 0 ? '⚔ Осада сегодня' : '🛡 Осада через ' + _dts + ' дн';
    } else _pill.style.display = 'none';
}
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
// Дни до осады: штурм = воскресная ночь (разрешение в понедельничном ресете lastWeekReset).
// Ревизия 30.09 (economy-sim аудит): раньше суббота давала 7, а ветка d===0 («Осада сегодня»)
// была недостижима — тост срабатывал только по четвергам. Теперь: Вс→0, Пн→6 … Пт→2, Сб→1.
function daysToSiegeNow(ts) { var dow = new Date((ts || Date.now()) + 3 * 3600000).getUTCDay(); return dow === 0 ? 0 : 7 - dow; }
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
'<radialGradient id="kmMist" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="rgba(210,220,235,0.15)"/><stop offset="1" stop-color="rgba(210,220,235,0)"/></radialGradient>' +
'<radialGradient id="kmCloud" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="rgba(235,240,250,0.085)"/><stop offset="1" stop-color="rgba(235,240,250,0)"/></radialGradient>' +
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
_wIcons += '<g class="km-wi km-wi-' + _ww.id + '"><use href="#i-w-' + (_ww.id === 'blizzard' ? 'blizzard' : _ww.id === 'drought' ? 'drought' : _ww.id === 'fog' ? 'fog' : 'clear') + '" x="' + (60 + wi * 66 - 11) + '" y="69" width="22" height="22"/><title>Очередь ' + (wi + 1) + ' · ' + _ww.name + (weatherNorth(BOSSES[wi].prov) && _ww.id === 'blizzard' ? ' — содержание ×2' : _ww.id === 'drought' && weatherSouth(BOSSES[wi].prov) ? ' — налог ×0.75' : '') + '</title></g>';
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
// DS2.0×G1: погода на карте — провинция показывает своё небо (снег метели, дымка тумана, жар засухи)
if (typeof weatherOf === 'function' && typeof weatherSeasonWeek === 'function') {
var _swm = weatherSeasonWeek();
var _wx = '';
for (var wp2 = 1; wp2 <= 4; wp2++) {
var _ww2 = weatherOf(wp2, _swm.sn, _swm.wk);
var _wfr = KG.provinces[wp2 - 1].frame, _wout = KG.provinces[wp2 - 1].outline;
if (_ww2.id === 'blizzard' && weatherNorth(wp2)) {
_wx += '<path class="km-wx-tint" d="' + _wout + '" fill="rgba(150,190,255,0.055)"/>';
_wx += '<g class="km-snow">';
for (var sn2 = 0; sn2 < 22; sn2++) {
var sx2 = Math.round(_wfr.x0 + 14 + prand(wp2 * 41 + sn2) * (_wfr.x1 - _wfr.x0 - 28));
var sy2 = Math.round(_wfr.y0 + 20 + prand(wp2 * 57 + sn2 * 3) * (_wfr.y1 - _wfr.y0 - 60));
_wx += '<circle cx="' + sx2 + '" cy="' + sy2 + '" r="' + (1.4 + prand(sn2 * 13 + wp2) * 1.4).toFixed(1) + '" style="animation-delay:' + (prand(sn2 * 7 + wp2 * 3) * 4).toFixed(2) + 's"/>';
}
_wx += '</g>';
} else if (_ww2.id === 'drought' && weatherSouth(wp2)) {
_wx += '<path class="km-wx-tint" d="' + _wout + '" fill="rgba(255,140,60,0.05)"/>';
} else if (_ww2.id === 'fog') {
_wx += '<g class="km-mist">';
for (var fm = 0; fm < 3; fm++) {
var mx2 = Math.round(_wfr.x0 + 60 + prand(wp2 * 23 + fm * 11) * (_wfr.x1 - _wfr.x0 - 120));
var my2 = Math.round(_wfr.y0 + 60 + prand(wp2 * 31 + fm * 7) * (_wfr.y1 - _wfr.y0 - 140));
_wx += '<ellipse cx="' + mx2 + '" cy="' + my2 + '" rx="70" ry="20" fill="url(#kmMist)" style="animation-delay:' + (fm * 2.4).toFixed(1) + 's"/>';
}
_wx += '</g>';
}
}
if (_wx) html += '<g class="km-wx-layer" pointer-events="none">' + _wx + '</g>';
}
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
'<g class="km-emoji"><circle cx="27" cy="9" r="14"/><use href="#i-strongholds" x="19" y="1" width="16" height="16"/></g>' +
(frac > 0 ? '<circle class="km-corrupt" r="30" pathLength="100" stroke-dasharray="' + (frac * 100) + ' 100"/>' : '') +
'<circle class="km-ring" r="30"/>' +
(state === 'km-siege' ? '<g class="km-badge" transform="translate(-26,-26)"><circle r="18"/><text y="7" text-anchor="middle">⚔</text></g>' : '') +
(state === 'km-locked' ? '<use class="km-lockglyph" href="#i-lock" x="-36" y="4" width="16" height="16"/>' : '') +
(state === 'km-captured' ? '<circle class="km-fire" cx="-6" cy="6" r="1.6"/><circle class="km-fire km-f2" cx="6" cy="8" r="1.2"/>' : '') +
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
html += '<g class="km-clouds" pointer-events="none">' +
'<ellipse class="km-cloud" cx="180" cy="240" rx="90" ry="26" fill="url(#kmCloud)"/>' +
'<ellipse class="km-cloud km-c2" cx="520" cy="620" rx="110" ry="30" fill="url(#kmCloud)"/>' +
'<ellipse class="km-cloud km-c3" cx="330" cy="930" rx="80" ry="22" fill="url(#kmCloud)"/>' +
'</g>';
var _seaMidX = Math.round((KG.SEA.x0 + KG.SEA.x1) / 2);
html += '<g class="km-ship" transform="translate(' + _seaMidX + ',' + (KG.SEA.y0 + 90) + ')" pointer-events="none">' +
'<g class="km-ship-bob">' +
'<path class="km-ship-wake" d="M-20 10 q10 5 20 0 q10 -5 20 0" fill="none"/>' +
'<path class="km-ship-hull" d="M-16 8 Q0 16 16 8 L11 0 L-11 0 Z"/>' +
'<line class="km-ship-mast" x1="0" y1="0" x2="0" y2="-22"/>' +
'<path class="km-ship-sail" d="M0 -21 L13 -4 L0 -4 Z"/>' +
'<path class="km-ship-sail km-s2" d="M-2 -19 L-11 -5 L-2 -5 Z"/>' +
'</g></g>';
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
html += seasonTrialsHtml(); // G2: испытания сезона
if (_alarm) {
    var _agenda = []; // G2: повестка осадной недели — конкретные шаги
    if (_alarm.ratio !== null && _alarm.ratio < 1) _agenda.push('найм/постройки обороны до штурма');
    if ((siegeWrathNow() || 0) >= 4) _agenda.push('закрыть призраки и задачи — гнев ' + siegeWrathNow() + '/10');
    var _stW = weatherSeasonWeek();
    var _frontProv = STRONGHOLDS[frontIdx()].prov;
    if (weatherOf(_frontProv, _stW.sn, _stW.wk).id === 'blizzard' && weatherNorth(_frontProv)) _agenda.push('метель: содержание ×2 — не нанимай лишнего');
    html += '<div class="siege-alarm">⚠ <b>Осадная тревога</b> · враг ~<b>' + _alarm.power + '</b> · оборона <b>' + _alarm.def + '</b>' + (_alarm.ratio === null ? '' : ' (' + Math.round(_alarm.ratio * 100) + '%)') + ' — ' + _alarm.advice + (_agenda.length ? '<br><span style="color:var(--text-dim)">Повестка: ' + _agenda.join(' · ') + '</span>' : '') + '</div>';
}
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
function shSpriteImg(path, emoji) { return '<img src="' + path + '" alt="" loading="lazy" decoding="async" onerror="this.outerHTML=\'' + emoji + '\'">'; } // волна 3: спрайты вне критического пути
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
var name = validDisplayText(document.getElementById('taskName').value, 120);
if (!name) { showToast('⚠ Ошибка', 'Название задачи: добавь буквы или цифры', 'blood'); sfxError(); return; }
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
var ghostFree = !!(holidayBonus() && holidayBonus().ghostsFree); // #8: Хэллоуин — призраки праздникуют (C3: событие ghostfree удалено)
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
function siegeSceneSvg(anyFell) { // DS2.0 (волна V2): SVG-сцена осады вместо эмодзи
    var sky1 = anyFell ? '#2a0a10' : '#1a1408', sky2 = anyFell ? '#0d0508' : '#0a0a0f';
    var glow = anyFell ? '#c73e4d' : '#d4a574';
    return '<svg class="ss-scene" viewBox="0 0 340 190" aria-hidden="true">' +
    '<defs><linearGradient id="ssSky" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' + sky1 + '"/><stop offset="1" stop-color="' + sky2 + '"/></linearGradient>' +
    '<radialGradient id="ssGlow" cx="50%" cy="86%" r="70%">' +
    '<stop offset="0%" stop-color="' + glow + '" stop-opacity="0.5"/><stop offset="100%" stop-color="' + glow + '" stop-opacity="0"/></radialGradient></defs>' +
    '<rect width="340" height="190" fill="url(#ssSky)"/>' +
    '<ellipse cx="170" cy="170" rx="200" ry="80" fill="url(#ssGlow)"/>' +
    '<g fill="#0c0a12">' +
    '<path d="M20 190 L20 120 L35 120 L35 96 L48 110 L48 96 L61 110 L61 96 L74 120 L84 120 L84 190 Z"/>' + // левая башня+стена
    '<path d="M150 190 L150 84 L170 62 L190 84 L190 190 Z"/>' + // цитадель
    '<path d="M256 190 L256 120 L266 120 L266 96 L279 82 L292 96 L292 120 L302 120 L302 190 L266 190 Z"/>' + // правая башня
    '</g>' +
    '<g fill="#171320" stroke="' + glow + '" stroke-opacity="0.35">' +
    '<rect x="40" y="130" width="34" height="26" rx="2"/><rect x="150" y="100" width="40" height="30" rx="2"/><rect x="266" y="130" height="26" width="26" rx="2"/>' +
    '</g>' +
    '<g fill="' + (anyFell ? '#c73e4d' : '#f4c896') + '">' +
    '<path class="ss-flame" d="M52 156 q4 -12 8 0 q3 8 -4 10 q-7 -2 -4 -10z"/>' +
    '<path class="ss-flame f2" d="M165 130 q4 -13 8 0 q3 9 -4 11 q-7 -2 -4 -11z"/>' +
    '<path class="ss-flame f3" d="M275 156 q4 -12 8 0 q3 8 -4 10 q-7 -2 -4 -10z"/>' +
    '</g>' +
    (anyFell
        ? '<path d="M150 62 L170 84 L190 62" fill="none" stroke="#c73e4d" stroke-width="3" stroke-linecap="round"/>' // сломанный шпиль
        : '<path d="M170 62 L170 40" stroke="' + glow + '" stroke-width="3" stroke-linecap="round"/><path d="M170 40 L196 47 L170 54 Z" fill="' + glow + '"/>') + // флаг цел / шпиль сломан
    '</svg>';
}
function taskCard(t) {
var tier = TASK_TIERS[t.tier] || TASK_TIERS.normal;
var todayKey = getMSKDayKey();
var overdue = t.status === 'active' && t.deadline && getMSKDayKey(t.deadline) < todayKey;
var dl = t.deadline ? new Date(t.deadline).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'без срока';
var cls = t.status === 'ghost' ? 'ghost' : t.status === 'done' ? 'done' : overdue ? 'overdue' : '';
var actions;
if (t.status === 'active') {
actions = '<button class="task-btn primary" data-action="complete-task" data-id="' + t.id + '" title="Выполнено">✓</button>' +
'<button class="task-btn del" data-action="delete-task" data-id="' + t.id + '" title="Удалить"><svg class="icn" aria-hidden="true"><use href="#i-trash"/></svg></button>';
} else if (t.status === 'done') {
actions = '<button class="task-btn gold" data-action="claim-task-gold" data-id="' + t.id + '">💰 +' + tier.gold + '</button>' +
'<button class="task-btn xp" data-action="claim-task-xp" data-id="' + t.id + '">✨ +' + tier.xp + '</button>' +
'<button class="task-btn del" data-action="delete-task" data-id="' + t.id + '" title="Удалить"><svg class="icn" aria-hidden="true"><use href="#i-trash"/></svg></button>';
} else {
var left = Math.max(0, tier.ghostDays - daysBetween(getMSKDayKey(t.ghostSince), todayKey));
actions = '<span class="task-ghost-info">ещё ' + left + ' ' + pluralDays(left) + '</span>' +
'<button class="task-btn del" data-action="delete-task" data-id="' + t.id + '">✕</button>';
}
var _soon = t.status === 'active' && t.deadline && !overdue && (t.deadline - Date.now()) < 6 * 3600000;
return '<div class="task-card ' + cls + '" style="--tier-color:' + tier.color + '">' +
'<div class="task-tier">' + tier.icon + '</div>' +
'<div class="task-body"><div class="task-name">' + esc(t.name) + '</div>' +
'<div class="task-meta"><svg class="icn" aria-hidden="true"><use href="#i-timer"/></svg> ' + dl + ' · 💰' + tier.gold + ' / ✨' + tier.xp + (overdue ? ' · <b style="color:var(--blood-bright)">просрочена!</b>' : (_soon ? ' · <span class="task-deadline-soon">срок скоро</span>' : '')) + '</div></div>' +
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
goneEl.innerHTML = ghosts.length === 0 ? '' : '<div class="ghosts-title"><svg class="icn" aria-hidden="true"><use href="#i-ghost"/></svg> Призраки просроченных (−1 💰 за ночь, пока не изгонишь делом или ✕)</div>' + ghosts.map(taskCard).join('');
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
'<div class="st-kpi-grid">' +
'<div class="st-kpi"><div class="st-kpi-label">Всего XP</div><div class="st-kpi-val">' + HERO.totalXp.toLocaleString() + '</div></div>' +
'<div class="st-kpi"><div class="st-kpi-label">XP за 7 дней</div><div class="st-kpi-val">' + totalXp7.toLocaleString() + '</div></div>' +
'<div class="st-kpi"><div class="st-kpi-label">Среднее XP/день</div><div class="st-kpi-val">' + avgDaily.toLocaleString() + '</div></div>' +
'<div class="st-kpi"><div class="st-kpi-label">Выполнений</div><div class="st-kpi-val">' + totalCompletions + '</div></div>' +
'</div>' +
'<div class="st-panel">' +
'<div class="st-panel-title">XP за последние 7 дней</div>' +
stAreaChart(last7, maxXp) +
'</div>' +
'<div class="st-panel">' +
'<div class="st-panel-title">Тепловая карта стриков (последние 8 недель)</div>' +
streakHeatmap +
'</div>' +

achievements +
'<div class="st-panel">' +
'<div class="st-panel-title">Карточки по рангам</div>' +
'<div style="display: flex; flex-wrap: wrap; gap: 8px;">' +
RANK_PROGRESSION.map(function(r) {
var count = FORGED.filter(function(c) { return c.rank === r; }).length;
if (count === 0) return '';
var rc = getRankColorInfo(r);
return '<div class="st-rank-chip" style="--rc-bg:' + rc.bg + '; --rc-border:' + rc.color + '40; --rc-color:' + rc.color + '"><b>' + r + '</b> × ' + count + '</div>';
}).join('') +
(FORGED.length === 0 ? '<div style="color: var(--text-dim); font-size: 12px;">Пока нет карточек</div>' : '') +
'</div></div>' +
renderCardHeatmap() +
renderInsights();
}
function stAreaChart(days, maxXp) { // DS2.0 (волна V2): SVG-столбчатый график XP с сеткой и рамкой
    var W = 340, H = 170, padB = 22, padT = 18, n = days.length;
    var innerH = H - padB - padT;
    var bw = W / n;
    var grid = '';
    for (var gi = 1; gi <= 3; gi++) {
        var gy = padT + innerH - (innerH * gi / 3);
        grid += '<line class="st-gridline" x1="0" y1="' + gy + '" x2="' + W + '" y2="' + gy + '"/>';
    }
    var bars = days.map(function(d, i) {
        var h = Math.max(2, (d.xp / maxXp) * innerH);
        var x = i * bw + bw * 0.18, w = bw * 0.64, y = padT + innerH - h;
        var dayLabel = d.date !== '—' ? d.date.slice(8) : '—';
        return '<rect class="st-bar" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3"><title>' + (d.date !== '—' ? d.date : '') + ': ' + d.xp + ' XP</title></rect>' +
        (d.xp > 0 ? '<text class="st-bar-val" x="' + (i * bw + bw / 2) + '" y="' + (y - 4) + '" text-anchor="middle">' + d.xp + '</text>' : '') +
        '<text class="st-bar-label" x="' + (i * bw + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + dayLabel + '</text>';
    }).join('');
    return '<svg class="st-chart" viewBox="0 0 ' + W + ' ' + H + '" style="display:block;width:100%;height:auto" role="img" aria-label="XP за 7 дней">' +
    '<defs><linearGradient id="stBarGrad" x1="0" y1="1" x2="0" y2="0">' +
    '<stop offset="0" stop-color="#8a6d1f"/><stop offset="1" stop-color="#f4c896"/></linearGradient></defs>' +
    grid + bars + '</svg>';
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
'<div class="ach-icon"><svg class="icn" aria-hidden="true"><use href="#i-medal"/></svg></div>' +
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
        '<div style="text-align:center; margin-top:14px;"><button class="demo-btn primary" data-action="return-go-deck" style="width:100%;">⚔ План на 5 минут: одна карточка</button></div>' +
        '<div style="text-align:center; margin-top:6px; font-size:10px; color:var(--text-dim);">Потом: задачи → налоги Твердынь. Фронт ждёт.</div>' +
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
    var _wf = weatherForecastChips(); // G1: погода как решение — эффект виден ДО решения
    if (_wf) html += '<div style="font-size:12px; padding-right:22px; margin-bottom:3px;">' + _wf + '</div>';
    var pom = activePomodoro();
    if (pom) { // #65: помодоро — чип-обратный отсчёт
        var left = Math.max(0, Math.round((pom.end - Date.now()) / 1000));
        html += '<div style="font-size:12px; padding-right:22px; margin-bottom:3px;"><span class="dash-chip" title="Помодоро: ' + esc(pom.name) + '">🍅 ' + pom.name + ' · ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + '</span> <button data-action="pomodoro-stop" data-id="' + pom.id + '" title="Отменить таймер" style="font-size:11px; background:none; border:1px solid var(--blood-bright); border-radius:6px; color:var(--blood-bright); cursor:pointer; padding:1px 6px;">✕</button></div>';
    }
    var goal = dailyGoldGoal();
    var gp = ((dailyQuests && dailyQuests.progress) || {})['gold'] || 0;
    html += '<div style="font-size:12px; padding-right:22px; margin-bottom:3px;"><span class="dash-chip" title="Цель дня: заработай золото любым способом">🎯 Цель дня: ' + Math.min(gp, goal) + '/' + goal + '💰</span><span style="display:inline-block; vertical-align:middle; width:70px; height:6px; background:var(--border); border-radius:3px; margin-left:6px; overflow:hidden;"><span style="display:block; height:100%; width:' + Math.min(100, Math.round(gp / goal * 100)) + '%; background:var(--gold-bright);"></span></span></div>'; // #71: дневная цель золота
    html += renderTodayPriority(); // Today Loop 2.0: одно главное действие дня — до инфо-блоков
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
    var toNext = nextSh ? ' · до «' + esc(nextSh.name) + '»: сила ' + nextSh.total : ' · Твердыни покорены!';
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

// ===== Today Loop 2.0 (фаза 1 AAA-плана): приоритет дня =====
// Игрок за 3–5 секунд видит: что сделать сейчас, что за это будет, что в королевстве.
// Выбор детерминированный и чистый (без DOM) — тесты: tests/today-panel.test.js.
// Порядок приоритета: (1) карточка с горящим стриком — сначала больший стрик,
// (2) ближе всех к ранг-апу, (3) первая невыполненная в колоде.
function pickTodayCard(cards, todayKey, mskKey) {
    var list = (Array.isArray(cards) ? cards : []).filter(function(c) { return c && c.id; });
    if (!list.length) return null;
    var key = mskKey || function(ts) { return new Date(ts + 3 * 3600000).toISOString().slice(0, 10); };
    var done = list.filter(function(c) { return c.lastCompletedAt && key(c.lastCompletedAt) === todayKey; });
    if (done.length >= list.length) return { card: null, doneToday: done.length, total: list.length };
    var pending = list.filter(function(c) { return !(c.lastCompletedAt && key(c.lastCompletedAt) === todayKey); });
    var best = pending.slice().sort(function(a, b) {
        var ra = (a.streak || 0) > 0 ? 1 : 0, rb = (b.streak || 0) > 0 ? 1 : 0;
        if (ra !== rb) return rb - ra; // со стриком — вперёд (стрик под угрозой)
        if ((b.streak || 0) !== (a.streak || 0)) return (b.streak || 0) - (a.streak || 0); // больший стрик ценнее
        var la = Math.max(0, (a.masteryThreshold || 0) - (a.mastery || 0));
        var lb = Math.max(0, (b.masteryThreshold || 0) - (b.mastery || 0));
        return la - lb; // ближе к ранг-апу
    })[0];
    return { card: best, doneToday: done.length, total: list.length };
}
// Строка королевства: осадный календарь + предупреждение о долге содержания (коррупция).
function todayKingdomLine(shList, daysToSiege) {
    var worn = 0, debt = 0;
    (Array.isArray(shList) ? shList : []).forEach(function(s) {
        if (s && s.corruption) {
            if (s.corruption.stage === 'worn' || s.corruption.stage === 'ruin') worn++;
            debt = Math.max(debt, Math.round(Number(s.corruption.debtDays) || 0));
        }
    });
    if (debt > 0) {
        return ' · <span style="color:var(--blood-bright)">⚠ Долг содержания: ' + debt + ' дн.' + (worn > 0 ? ' — ветшает построек: ' + worn : '') + '</span>';
    }
    var d = (typeof daysToSiege === 'number') ? daysToSiege : -1;
    if (d === 0) return ' · 🏰 Осада — сегодня ночью';
    if (d === 1) return ' · 🏰 Осада — завтра';
    if (d > 1) return ' · 🏰 До осады: ' + d + ' дн.';
    return '';
}
function renderTodayPriority() {
    try {
        var pick = pickTodayCard(FORGED, getMSKDayKey());
        var html = '<div style="padding:8px 10px; margin:2px 0 10px; border:1px solid var(--gold); border-radius:6px; background:rgba(212,175,55,0.06);">';
        if (!FORGED.length) {
            return html + '<div style="font-size:12px;">🗡 Колода пуста — выкуй первую карточку кнопкой ниже.</div></div>';
        }
        if (!pick || !pick.card) {
            return html + '<div style="font-size:13px; color:var(--gold-bright);">✅ День закрыт: все ' + FORGED.length + ' карточек выполнены!</div>' +
                '<div style="font-size:11px; color:var(--text-dim); margin-top:3px;">Загляни в Твердыни — там ждут налоги и осады.</div></div>';
        }
        var c = pick.card;
        var st = STATS[c.stat] || STATS.str;
        var masteryLeft = Math.max(0, (c.masteryThreshold || 0) - (c.mastery || 0));
        var reward = masteryLeft <= 1 ? '⚡ следующее выполнение — ранг-ап!' : '📖 до ранг-апа: ' + masteryLeft;
        var atRisk = (c.streak || 0) > 0;
        html += '<div style="font-size:10px; letter-spacing:1.5px; color:var(--text-dim); margin-bottom:4px;">ПРИОРИТЕТ ДНЯ</div>';
        html += '<div style="display:flex; align-items:center; gap:10px; justify-content:space-between; flex-wrap:wrap;">';
        html += '<div style="font-size:13px; min-width:0;"><b style="color:var(--gold-bright)">' + esc(c.name) + '</b> <span style="color:var(--text-dim); font-size:11px;">' + (st.icon || '') + ' ' + esc(st.name || '') + ' · ' + (c.rank || 'C') + '</span>' +
            (atRisk ? ' <span title="Стрик сгорит при пропуске" style="color:#f59e0b; font-size:11px;">🔥 ' + c.streak + ' дн. — под угрозой</span>' : '') + '</div>';
        html += '<button class="card-complete-btn" data-action="complete-card" data-id="' + c.id + '">⚔ Выполнить</button>';
        html += '</div>';
        html += '<div style="font-size:10px; color:var(--text-dim); margin-top:4px;">📖 ' + pick.doneToday + '/' + pick.total + ' сегодня · ' + reward + todayKingdomLine(strongholds, (typeof daysToSiegeNow === 'function') ? daysToSiegeNow() : -1) + '</div>';
        html += '</div>';
        return html;
    } catch (e) { return ''; } // панель не должна ронять дашборд
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
    var _challenge = '';
    if (bestCard && !activePomodoro()) _challenge = '<button class="demo-btn" data-action="pomodoro-toggle" data-id="' + bestCard.id + '" style="width:100%; margin-top:10px;">🍅 Вызов: 25 минут на «' + esc(bestCard.name) + '» (+5 XP)</button>'; // G1: инсайт → действие
    var html = '<div style="background:rgba(0,0,0,0.3); border:1px solid var(--border); padding:12px; margin-bottom:16px;">' +
        '<div style="font-size:11px; letter-spacing:2px; color:var(--text-dim); text-transform:uppercase; margin-bottom:10px;">🧠 Инсайты (анализ паттернов)</div>';
    insights.forEach(function(ins) {
        html += '<div style="font-size:11px; color:var(--text-bright); padding:4px 0; border-bottom:1px dashed var(--border);">• ' + ins + '</div>';
    });
    html += '</div>' + _challenge; // G1: инсайт → действие
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

function buildDailyEvents() { // C3: smith/ghostfree удалены (квази-мёртвые: no-op 99%/85%, qa-chaos/qa-economy) — пул: 3 базовых + 2 тёмных
    return [
        { id: 'caravan', icon: '🐎', name: 'Караван', text: 'Торговцы из-за гор: +' + Math.max(20, capturedCount() * 15) + ' 💰 мгновенно!' },
        { id: 'market', icon: '🏪', name: 'Ярмарка', text: 'Налоги твердынь ×1.5 сегодня!' },
        { id: 'quiet', icon: '🌙', name: 'Тихий день', text: 'Ничего не произошло. Но золото капает.' },
        { id: 'bloodmoon', icon: '🌘', name: 'Кровавая луна', text: 'Налоги ×0.5, но опыт карточек ×2. Ночь безумия!' }, // #41: тёмная ветка — строго в конец (пины chaos-харнеса)
        { id: 'wanderer', icon: '🧙', name: 'Странник', text: 'Старец оставил дары: +1 🛡 и +30 💰.' }
    ];
}
function rollDailyEvent() { // #41: базовые 3 — по индексам 0-2 (пины chaos-харнеса 0/0.4/0.8/0.99), тёмные — в окне (0.8, 0.985)
    var events = buildDailyEvents();
    var r = Math.random();
    if (r > 0.8 && r < 0.985) return r < 0.895 ? events[3] : events[4]; // ponytail: ~9% у тёмных против ~27% у базовых — окно зажато пинами харнеса; равные веса только после переписки пинов
    return events[Math.floor(r * 3)];
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
    var _swx = weatherSeasonWeek(), _wEffs = [];
    for (var _wp = 1; _wp <= 4; _wp++) {
        var _ww2 = weatherOf(_wp, _swx.sn, _swx.wk);
        if (_ww2.id === 'drought' && weatherSouth(_wp)) _wEffs.push('засуха п' + _wp + ' −25% налога');
        if (_ww2.id === 'blizzard' && weatherNorth(_wp)) _wEffs.push('метель п' + _wp + ' ×2 содержание');
    }
    showToast('💰 Разбивка казны', 'База ' + strongholdTaxPerDay() + ' 💰/день · Пути +' + trade + '% · Венцы +' + crown + '% · Трон +' + th + '%' + (_synPct > 0 ? ' · Синергии +' + _synPct + '%' : '') + (_wEffs.length ? ' · 🌫 ' + _wEffs.join(', ') : ''), 'save');
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
        // Ежедневное событие: ролл ДО тиков дня — Ярмарка действует в свой день
        var ev = rollDailyEvent();
        dailyEvent = ev;
        if (ev.id === 'caravan' && !_isBackfill) { var bonus = Math.max(20, capturedCount() * 15); goldGain(bonus, 'caravan'); }
        if (ev.id === 'wanderer' && !_isBackfill) { HERO.streakShields = Math.min(100, (HERO.streakShields || 0) + 1); goldGain(30, 'wanderer'); } // #41
        if (HERO.scouts && scoutFresh(HERO.scouts, todayKey) === null) { HERO.scouts = null; } // Г2-3: срок годности тени истёк (готовность + 2 дня)
        if (!_isBackfill) showToast(ev.icon + ' ' + ev.name, ev.text, 'save');
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
    // Живое переключение эко-режима: пыль/частицы перещёлкиваются без перезагрузки.
    P.onEcoModeChange(function(isEco) {
        window.__ndSetEcoMode(isEco);
    });
    // Текущее состояние применяется сразу (настройка из прошлой сессии).
    if (typeof window.__ndSetEcoMode === 'function') {
        window.__ndSetEcoMode(P.isEco());
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
    if (document.querySelectorAll('.modal-overlay.show').length === 0) { haptic('light'); fn(); } // волна 2: тактильный отклик на открытие модалки
    else _pendingModal = fn; // QA1-M2: returnModal и weeklyReport показываются ПО ОДНОЙ
}
function dequeuePendingModal() {
    if (_pendingModal && document.querySelectorAll('.modal-overlay.show').length === 0) { var fn = _pendingModal; _pendingModal = null; haptic('light'); fn(); }
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
    updateMainButton(); // модалки открываются/закрываются — CTA штурма прячется/возвращается
}
function activeViewName() {
    var el = document.querySelector('.view.active');
    return el ? el.id.replace('view-', '') : 'deck';
}
function updateBackButton(shown) { // QA1-M7 + волна 2: модалка → закрыть верхнюю; иначе вкладка → «домой»; иначе скрыть
    try {
        var tg = window.Telegram && window.Telegram.WebApp;
        if (!tg || !tg.BackButton) return;
        var vis = shown || document.querySelectorAll('.modal-overlay.show');
        var onlyConfirm = vis.length === 1 && vis[0].id === 'confirmOverlay';
        var needBack = vis.length > 0 ? !onlyConfirm : (activeViewName() !== 'deck');
        if (needBack) {
            tg.BackButton.show();
            if (!tg.BackButton._ndBound) {
                tg.BackButton._ndBound = true;
                tg.BackButton.onClick(function() {
                    var list = document.querySelectorAll('.modal-overlay.show');
                    if (list.length > 0) {
                        var t = list[list.length - 1];
                        if (t && t.id !== 'confirmOverlay') closeOverlayEl(t); // конфирм закрывается только своими кнопками
                        return;
                    }
                    // Android «назад» из вкладки больше не убивает приложение — ведём на «Колоду»
                    if (activeViewName() !== 'deck' && typeof switchView === 'function') switchView('deck');
                });
            }
        } else tg.BackButton.hide();
    } catch (e) {}
}
function updateMainButton() { // волна 2: нативная CTA «⚔ Штурмовать» (главное боевое действие всегда под пальцем)
    try {
        var tg = window.Telegram && window.Telegram.WebApp;
        if (!tg || !tg.MainButton || !tg.MainButton.setText) return;
        if (document.querySelectorAll('.modal-overlay.show').length > 0) { tg.MainButton.hide(); return; } // не спорит с модалками/конфирмом тактики
        var ok = activeViewName() === 'strongholds' && typeof requestAssault === 'function' && typeof capturedCount === 'function' &&
                 typeof getMSKDayKey === 'function' && typeof SM !== 'undefined' && SM &&
                 siege && siege.assaultDay !== getMSKDayKey() && SM.armyPower(army.units) > 0 && capturedCount() < 20;
        if (ok) {
            if (tg.MainButton._ndAssaultBound !== true) {
                tg.MainButton._ndAssaultBound = true;
                tg.MainButton.onClick(function() {
                    var front = (typeof capturedCount === 'function') ? capturedCount() : 0;
                    if (typeof requestAssault === 'function') requestAssault(Math.min(front, 19));
                });
            }
            tg.MainButton.setText('⚔ Штурмовать твердыню');
            if (tg.MainButton.setParams) tg.MainButton.setParams({ color: '#c73e4d', text_color: '#ffffff' });
            tg.MainButton.show();
        } else tg.MainButton.hide();
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
var ND_BOT_USERNAME = 'NeuroDeckBot'; // бот-компаньон (bot/polling.js): /start <режим> применяет настройку
function openBotSettings(mode) { // волна 2: честная связка app↔бот вместо заглушки с TODO
    var url = 'https://t.me/' + ND_BOT_USERNAME + '?start=' + mode;
    try {
        var tg = window.Telegram && window.Telegram.WebApp;
        if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
        else window.open(url, '_blank');
    } catch (e) { window.open(url, '_blank'); }
    var msgs = {
        daily: 'Откроется бот — нажми «Старт», и напоминание придёт каждый день в 21:30 МСК',
        sunday: 'Откроется бот — нажми «Старт», и будешь получать только воскресные осады',
        off: 'Откроется бот — нажми «Старт», и напоминания выключатся'
    };
    showToast('🔔 Напоминания', msgs[mode] || 'Настройка применяется в боте — подтверди «Старт»');
}
function showReminderFreqToast(mode) { openBotSettings(mode); } // легаси-алиас кнопок синхры
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
try { if (navigator.webdriver) document.documentElement.classList.add('nd-webdriver'); } catch (e) {} // DS2.0: входные анимации ломают тапы харнессов — в авто-браузерах выключаем
ensureStrongholdState();
if (!dailyQuests || typeof dailyQuests !== 'object') dailyQuests = { day: getMSKDayKey(), done: {}, quests: [], progress: {} };
loadGameState();
applyAscensionPalette(); // Г2-5: палитра круга вознесения (body asc-1/2/3)
checkCapturedRecovery(); // #49: следы потерянных крепостей — сразу после загрузки
checkDailyReset();
checkBloodOath();
weatherMorningBrief(); // G1: погода недели — до решений дня
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
(function initStartParam() { // deep link: t.me/<bot>/<app>?startapp=strongholds → сразу нужная вкладка
    try {
        var tg = window.Telegram && window.Telegram.WebApp;
        var sp = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
        if (!sp) return;
        var map = { strongholds: 'strongholds', siege: 'strongholds', deck: 'deck', quests: 'quests', hero: 'hero', inv: 'inv', inventory: 'inv', stats: 'stats' };
        var view = map[String(sp).trim().toLowerCase()];
        if (view && typeof switchView === 'function') setTimeout(function() { switchView(view); }, 300);
    } catch (e) {}
})();
window.__tgReady = function(){ try{ var tg=window.Telegram&&window.Telegram.WebApp; if(tg){ tg.ready&&tg.ready(); tg.expand&&tg.expand(); tg.setHeaderColor&&tg.setHeaderColor('#0a0a0f'); tg.setBackgroundColor&&tg.setBackgroundColor('#0a0a0f'); tg.disableVerticalSwipes&&tg.disableVerticalSwipes(); applyTelegramTheme(tg); } }catch(e){} };
// Форс-дарк (аудит 2026-09-28): прежняя light-ветка (body.tg-light) покрывала 7 селекторов
// и выглядела сломанной — тёмные карточки на светлом фоне + рассинхрон шапки. Держим
// фирменную тьму в любой теме клиента; шапка/фон TG всегда #0a0a0f (см. __tgReady выше).
function applyTelegramTheme(tg) { try { document.body.classList.remove('tg-light'); } catch (e) {} }
window.__tgReady();

// Фаза 2 (шаг state-store №1): UI реагирует на событие состояния, а не вызывается из storage.
// Полный состав рендеров — 1:1 с прежним прямым блоком applySyncData (никто не потерян).
if (typeof NDDBus !== 'undefined' && NDDBus && typeof NDDBus.on === 'function') {
    NDDBus.on('nd:state-applied', function () {
        renderCards(); renderStats(); updateHeroUI(); renderGoals();
        renderBackpack(); renderSlots(); updateTotalBonuses();
        renderStrongholds(); updateStrongholdProgress();
        renderTasks(); renderDashboard();
    });
}
window.addEventListener('load', function(){ window.__tgReady(); });
if (FORGED.length === 0) {
    // Пустая колода — новый игрок ИЛИ очищенное хранилище (ITP-чистка iOS после
    // 7 дней, новое устройство). tryCloudRecovery из loadGameState уже проверяет
    // облако; старт-колоду придерживаем до его ответа: восстановление важнее онбординга.
    try { pendingOnboarding = !localStorage.getItem('neurodeck_onboarding_done'); } catch(e) { pendingOnboarding = false; }
    if (!getCloudStorage()) { setTimeout(function() { updateSyncBadge('offline'); }, 1500); }
    setTimeout(function holdStarterDeck(attempt) {
        attempt = attempt || 0;
        if (window.__ndCloudCheckPending && attempt < 14) { setTimeout(function() { holdStarterDeck(attempt + 1); }, 250); return; } // ждём облако ≤3.5 c
        if (FORGED.length > 0) return; // восстановились из облака — старт-колода не нужна
        showStarterDeck();
    }, 900);
} else {
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