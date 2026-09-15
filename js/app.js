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
lastSessionAt: Date.now(), dailyUniqueStats: {}, cardHistory: {}, lastWeeklyReport: null
};
const STATS = {
str: { name: 'Сила',      icon: '⚔', desc: 'Урон',       color: '#c73e4d', dark: '#8b2635', value: 3, max: 100, attributePoints: 0 },
end: { name: 'Стойкость', icon: '🛡', desc: 'HP',         color: '#60a5fa', dark: '#2563eb', value: 3, max: 100, attributePoints: 0 },
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
case 'close-evolution-modal': closeEvolutionModal(); break;
case 'apply-evolution-depth': applyEvolution('depth'); break;
case 'apply-evolution-frequency': applyEvolution('frequency'); break;
case 'apply-evolution-stability': applyEvolution('stability'); break;
case 'evolution-skip': closeEvolutionModal(); var ecid = parseInt(document.getElementById('evolutionModal').dataset.cardId); if (ecid) openEditCardAfterRankup(ecid); break;
case 'prestige-card': prestigeCard(parseInt(el.dataset.id)); break;
case 'close-weekly-report': closeWeeklyReportModal(); break;
case 'sh-daily-quest': completeDailyQuest(el.dataset.qid, parseInt(el.dataset.reward)); break;
case 'sh-open': currentShIdx = parseInt(el.dataset.idx); renderStrongholdPanel(currentShIdx); break;
case 'sh-back': currentShIdx = null; renderStrongholds(); break;
case 'sh-assault': requestAssault(parseInt(el.dataset.idx)); break;
case 'sh-buy': buyBuilding(parseInt(el.dataset.idx), el.dataset.bid); break;
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
function renderCards() {
const grid = document.getElementById('cardGrid');
grid.innerHTML = '';
const all = [...FORGED];
document.getElementById('deckCount').textContent = all.length;
if (all.length === 0) {
grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Пока пусто. Нажми «🔨 Выковать карточку», чтобы создать первую карточку.</div>';
return;
}
all.forEach(c => renderOneCard(c, grid));
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
if (bloodOath && bloodOath.status === 'active' && bloodOath.cardId === card.id) {
el.className += ' blood-oath';
}
const nextRankText = getNextRank(card.rank) || 'MAX';
var oathBadge = (bloodOath && bloodOath.status === 'active' && bloodOath.cardId === card.id)
? '<div class="blood-oath-badge">🩸 Клятва ' + bloodOath.streak + '/' + bloodOath.requiredDays + '</div>' : '';
el.innerHTML =
oathBadge +
'<div class="card-corner-actions">' +
   '<div class="card-btn edit" data-action="edit-card" data-id="' + card.id + '" title="Редактировать">✎</div>' +
   '<div class="card-btn delete" data-action="delete-card" data-id="' + card.id + '" title="Удалить">🗑</div>' +
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
'</div>' +
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
const gear = getTotalGearBonuses();
const totalInt = STATS.int.value + gear.int;
const heroIntBonus = 1 + (totalInt - 3) * 0.01;
const comboMult = getComboMultiplier();
const prestigeMult = getPrestigeXPBonus(card.stat);
const finalXp = Math.round(baseCardXp * streakMult * heroIntBonus * comboMult * prestigeMult);
HERO.xp += finalXp; HERO.totalXp += finalXp;
recordXpEvent(finalXp);
spawnFloatNumber(x, y - 20, '+' + finalXp + ' XP', '#f4c896');
card.mastery += card.evolutionPath === 'depth' ? 1.5 : 1;
card.totalCompletions = (card.totalCompletions || 0) + 1;
card.streak = (card.streak || 0) + 1;
card.lastCompletedAt = Date.now();
HERO.dailyCompletions++;
HERO.dailyUniqueStats = HERO.dailyUniqueStats || {};
HERO.dailyUniqueStats[card.stat] = true;
var todayKey = getMSKDayKey();
HERO.cardHistory = HERO.cardHistory || {};
HERO.cardHistory[todayKey] = HERO.cardHistory[todayKey] || {};
HERO.cardHistory[todayKey][card.id] = true;
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
HERO.gold = (HERO.gold || 0) + 1;
if (lootPityCheck(card)) dropRandomLoot(x, y);
checkHeroLevelUp();
renderCards();
renderDashboard();
updateHeroUI();
if (!rankUpHappened) {
const streakBonusTxt = streakMult > 1.0 ? ' (🔥 ×' + streakMult.toFixed(2) + ')' : '';
showToast('✅ Выполнено', '+' + finalXp + ' XP' + streakBonusTxt + ' · +1 💰 · 🔥 ' + card.streak + ' дней');
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
 showToast('💢 Пропуск', '«' + card.name + '» — стрик сброшен, −1 💰', 'blood');
 updateHeroUI();
 renderDashboard();
 renderStatsView();
 onBloodOathSkip(id);
 saveGameState();
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
updateHeroSummary();
}
function updateHeroSummary() {
document.getElementById('statTotalXp').textContent = HERO.totalXp;
const sum = Object.values(STATS).reduce((a, s) => a + s.value, 0);
document.getElementById('statSumStats').textContent = sum;
document.getElementById('statGoalsActive').textContent = GOALS.filter(g => !g.completed).length;
document.getElementById('statGoalsDone').textContent = GOALS.filter(g => g.completed).length;
const gear = getTotalGearBonuses();
const totalInt = STATS.int.value + gear.int;
const mult = (1 + (totalInt - 3) * 0.01).toFixed(2);
document.getElementById('statXpMult').textContent = '×' + mult;
document.getElementById('statStrongholds').textContent = capturedCount() + ' / ' + STRONGHOLDS.length;
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
HERO.gold = (HERO.gold || 0) + 30;
var avatarEl = document.getElementById('heroAvatar'); if (avatarEl) { avatarEl.classList.add('level-flash'); setTimeout(function() { avatarEl.classList.remove('level-flash'); }, 1500); } updateHeroAvatarSprites();
document.getElementById('lvlSub2').textContent = '+30 💰 в казну';
var avatarWrap = document.querySelector('.hero-avatar-wrap');
if (avatarWrap) { avatarWrap.classList.add('levelup-glow'); setTimeout(function() { avatarWrap.classList.remove('levelup-glow'); }, 2000); }
renderStats();
spiritSay('«Уровень ' + HERO.level + '... Бремя стало легче.»');
showToast('🏆 Уровень ' + HERO.level, '+6 к максимальному HP и лечение · Следующий: ' + HERO.xpToNext + ' XP');
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
if (!card.evolutionPath) { showEvolutionChoices(card); }
else { openEditCardAfterRankup(card.id); }
}, 2200);
}
let editingCardId = null;
function openEditCardAfterRankup(cardId) {
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
    document.getElementById('editCardModal').classList.add('show');
}
function closeEditCard() {
document.getElementById('editCardModal').classList.remove('show');
editingCardId = null;
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
closeEditCard();
renderCards();
showToast('✏ Сохранено', 'Карточка обновлена: ' + name);
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
if (pool.length === 0) { HERO.gold = (HERO.gold || 0) + 5; return; }
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
try { const saved = localStorage.getItem('neurodeck_goals'); if (saved) { const p = JSON.parse(saved); GOALS = p.goals || []; goalIdCounter = p.counter || 1; } } catch (e) {}
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
if (goal.stat && STATS[goal.stat]) {
STATS[goal.stat].attributePoints = (STATS[goal.stat].attributePoints || 0) + goal.statBonus;
checkAttributePoolGrowth(goal.stat);
}
    const statIcon = goal.stat && STATS[goal.stat] ? STATS[goal.stat].icon + ' ' + STATS[goal.stat].name : '';
    showToast('🏆 Цель достигнута!', '+' + goalXp + ' XP' + (statIcon ? ' · +' + goal.statBonus + ' к пулу ' + statIcon : ''), 'crit');
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
const name = document.getElementById('forgeName').value.trim();
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
document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
document.querySelectorAll('.tab[role="tab"]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === view)));
document.querySelectorAll('.bnav-btn').forEach(t => t.classList.remove('active'));
document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
var tabEl = document.querySelector('.tab[data-view="' + view + '"]');
var bnavEl = document.querySelector('.bnav-btn[data-view="' + view + '"]');
if (tabEl) tabEl.classList.add('active');
if (bnavEl) bnavEl.classList.add('active');
document.getElementById('view-' + view).classList.add('active');
if (view === 'hero') { renderStats(); updateHeroUI(); renderGoals(); }
if (view === 'strongholds') renderStrongholds();
if (view === 'quests') renderTasks();
if (view === 'deck') renderDashboard();
if (view === 'inv') { renderBackpack(); renderSlots(); updateTotalBonuses(); }
if (view === 'deck') renderCards();
if (view === 'stats') renderStatsView();
if (typeof window.__ndSetCombatActive === 'function') window.__ndSetCombatActive(view === 'boss');
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
var currentShIdx = null;
var dailyQuests = null;
function completeDailyQuest(qid, reward) {
if (dailyQuests.done[qid]) return;
dailyQuests.done[qid] = true;
HERO.gold = (HERO.gold || 0) + reward;
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
    var path = 'img/units/' + tier + '.png';
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
return sum;
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
function hireCostOf(tier) { return Math.ceil(UNIT_TIERS[tier].cost * (1 - Math.min(0.30, 0.005 * STATS.cha.value))); }
function recalcHirePool() {
ensureStrongholdState();
var wind = hasSpecialOk('sp4') ? 1.4 : 1;
var pool = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 };
strongholds.forEach(function(s) {
if (!s.captured && strongholds.indexOf(s) !== 0) return; // Сендер-Хутор — стартовый лагерь (SPEC §9: Ж1 с нуля)
Object.keys(s.buildings).forEach(function(id) {
var b = s.buildings[id], d = BUILDINGS[id];
if (!b || !b.built || !d || !d.grow) return;
pool[d.tier] += Math.round(d.grow * stageMult(b.corruptionStage) * wind);
});
});
hirePool = pool;
}
// День твердынь: налоги+эконом → содержание + коррапшн (upkeep первым, SPEC §6). Золото уже в HERO.gold.
function strongholdsDailyTick() {
ensureStrongholdState();
if (!SM) return { income: 0, upkeep: 0, paid: true };
var taxes = 0, econ = 0, market = 0, upkeep = 0, paid = true;
var gold = HERO.gold || 0;
strongholds.forEach(function(s, i) {
if (!s.captured) return;
taxes += STRONGHOLDS[i].tax;
builtList(i).forEach(function(id) {
var d = BUILDINGS[id], b = s.buildings[id], m = stageMult(b.corruptionStage);
if (d.gold) econ += d.gold * m;
if (d.market) market += d.market * m;
});
});
gold += taxes + Math.round(econ);
var income = Math.round((taxes + Math.round(econ)) * (1 + Math.min(0.5, market)));
var stepOpt = hasSpecialOk('sp3') ? 4 : 2;
strongholds.forEach(function(s, i) {
if (!s.captured && i !== 0) return;
if (builtList(i).length === 0) return;
var imm = {};
Object.keys(s.buildings).forEach(function(bid) {
var bb = s.buildings[bid];
if (bb.builtAt && Date.now() - bb.builtAt < 7 * 86400000) imm[bid] = true;
});
var res = SM.corruptionTick(s.buildings, gold, STATS.wil.value, { step: stepOpt, immune: imm });
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
var power = Math.round(SM.siegePower(def.total, siege.week - 1, capturedCount(), wrath) * hitMult);
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
recalcHirePool();
showSiegeReport(rows, wrath);
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
document.getElementById('siegeReportBody').innerHTML = html;
// Осадный спектакль: полноэкранная вспышка
var spect = document.createElement('div');
spect.className = 'siege-spectacle';
var mainIcon = anyFell ? '💀' : '🛡';
var mainText = anyFell ? 'Твердыня пала...' : 'Оборона держит!';
spect.innerHTML = '<div class="ss-icon">' + mainIcon + '</div><div class="ss-text">' + mainText + '</div>';
document.body.appendChild(spect);
setTimeout(function() { spect.remove(); }, 3600);
modal.classList.add('show');
// Осадная драма: shake + частицы + звук по исходу
var anyHeld = rows.some(function(r) { return r.held; });
var anyFell = rows.some(function(r) { return !r.held && !r.refuge; });
if (anyFell) { screenShake(15, 800); burstParticles(window.innerWidth/2, window.innerHeight/3, 120, { color: '#c73e4d', speed: 14, decay: 0.008, size: 4, shape: 'star', gravity: 0.12 }); sfxBossDefeated(); haptic('heavy'); }
else if (anyHeld) { burstParticles(window.innerWidth/2, window.innerHeight/3, 60, { color: '#34d399', speed: 8, decay: 0.012, size: 3, shape: 'star', gravity: 0.08 }); sfxLevelUp(); haptic('medium'); }
}
function closeSiegeReport() { document.getElementById('siegeReportModal').classList.remove('show'); }
function assaultForecast(idx) {
var atk = Math.round(SM.armyPower(army.units) * (1 + 0.02 * STATS.str.value));
var defN = STRONGHOLDS[idx].total;
if (hasSpecialOk('sp1')) return { atk: atk, defN: defN, line: '⚔ ' + atk + ' против 🛡 ' + defN + (atk > defN ? ' · превосходство' : ' · сил мало') };
return { atk: atk, defN: defN, line: '⚔ ~' + Math.round(atk * 0.75) + '–' + Math.round(atk * 1.25) + ' против 🛡 ' + defN + ' (Гильдия Разведчиков даст точные числа)' };
}
function requestAssault(idx) {
ensureStrongholdState();
if (siege.assaultDay === getMSKDayKey()) { showToast('⚔ Штурм уже был', 'Один штурм в сутки — приходи завтра', 'blood'); return; }
if (!SM || SM.armyPower(army.units) <= 0) { showToast('⚔ Армии нет', 'Найми существ в твердыне', 'blood'); sfxError(); return; }
var f = assaultForecast(idx);
dungeonConfirm('⚔ Штурм «' + esc(STRONGHOLDS[idx].name) + '»?', f.line + '<br><span style="color:var(--blood-bright)">Поражение = отступление с потерями 10–30%.</span>').then(function(ok) {
if (ok) doAssault(idx, f);
});
}
function doAssault(idx, f) {
siege.assaultDay = getMSKDayKey();
var out = SM.assaultOutcome(f.atk, f.defN, { agi: STATS.agi.value, banner: hasSpecialOk('sp2'), rand: Math.random });
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
addXpReward(Math.round(150 * (1 + (STATS.int.value - 3) * 0.01)));
showToast('🏰 ' + STRONGHOLDS[idx].name + ' захвачена!', 'Потери: ' + lostTotal + ' · налог +' + STRONGHOLDS[idx].tax + ' 💰/день', 'crit');
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
if ((HERO.gold || 0) < d.cost) { showToast('💰 Мало золота', 'Нужно ' + d.cost + ' 💰, в казне ' + (HERO.gold || 0), 'blood'); sfxError(); return; }
HERO.gold -= d.cost;
s.buildings[bid] = { built: true, corruptionStage: 'ok', debtDays: 0 };
strongholds[idx].buildings[bid].builtAt = Date.now();
var bdDef = BUILDINGS[bid]; if (bdDef.grow) { hirePool[bdDef.tier] += Math.round(bdDef.grow * (hasSpecialOk('sp4') ? 1.4 : 1)); showToast('⛺ Первый прирост', '+' + Math.round(bdDef.grow * (hasSpecialOk('sp4') ? 1.4 : 1)) + ' ' + UNIT_TIERS[bdDef.tier].name + ' — сразу в пул найма', 'save'); }
recalcHirePool();
showToast('🏗 Построено: ' + d.name, '−' + d.cost + ' 💰 · содержание ' + d.upkeep + ' 💰/день', 'save');
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
function shIncomePerDay() {
ensureStrongholdState();
var taxes = 0, econ = 0, market = 0;
strongholds.forEach(function(s, i) {
if (!s.captured) return;
taxes += STRONGHOLDS[i].tax;
builtList(i).forEach(function(id) {
var d = BUILDINGS[id], b = s.buildings[id], m = stageMult(b.corruptionStage);
if (d.gold) econ += d.gold * m;
if (d.market) market += d.market * m;
});
});
return Math.round((taxes + Math.round(econ)) * (1 + Math.min(0.5, market)));
}
function shUpkeepPerDay() {
ensureStrongholdState();
var u = 0;
strongholds.forEach(function(s) {
if (!s.captured) return;
Object.keys(s.buildings).forEach(function(id) {
var b = s.buildings[id];
if (b && b.built && b.corruptionStage !== 'ruin' && BUILDINGS[id]) u += BUILDINGS[id].upkeep;
});
});
return u;
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
updateProgressFill((n / STRONGHOLDS.length) * 100);
}
function garrisonRows(stacks, idx, action, label) {
if (!stacks || stacks.length === 0) return '<div class="empty-state">Пусто.</div>';
return stacks.map(function(st) {
var u = UNIT_TIERS[st.tier];
return '<div class="sh-hire-row"><div class="sh-build-icon">' + u.icon + '</div>' +
'<div class="sh-build-body"><div class="sh-build-name">' + u.name + ' × ' + st.count + '</div>' +
'<div class="sh-build-meta">Сила: ' + (st.count * u.power) + '</div></div>' +
'<button class="sh-mini" data-action="' + action + '" data-idx="' + idx + '" data-tier="' + st.tier + '">' + label + '</button></div>';
}).join('');
}
function renderStrongholds() {
ensureStrongholdState();
if (!SM) return;
if (currentShIdx !== null) { renderStrongholdPanel(currentShIdx); return; }
var root = document.getElementById('strongholdsRoot');
if (!root) return;
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
var daysToSiege = (7 - ((new Date(Date.now() + 3 * 3600000).getUTCDay() + 1) % 7));
html += '<div class="sh-context-anchor">📍 Фронт: <b>' + STRONGHOLDS[fi] ? STRONGHOLDS[fi].name : '—' + '</b> · 🛡 Осада через <b>' + Math.max(1, daysToSiege) + ' дн.</b> · Гнев: <b>' + Math.min(10, 2 * countGhostTasks() + (siege.wkSkips || 0) + (siege.wkTaskFails || 0)) + '/10</b></div>';
// Kingdom path: визуальная полоса прогресса
html += '<div class="sh-kingdom-path">';
for (var pi = 0; pi < 20; pi++) {
    var pd = strongholds[pi];
    var cls = pd.captured ? 'sh-kp owned' : (pi === frontIdx() ? 'sh-kp front' : 'sh-kp locked');
    html += '<div class="' + cls + '" title="' + STRONGHOLDS[pi].name + '"></div>';
    if (pi < 19) html += '<div class="sh-kp-link"></div>';
}
html += '</div>';
// Квест-доска (3 ротационных дневных задания)
if (!dailyQuests || dailyQuests.day !== getMSKDayKey()) {
    var _qpool = [
        { id: 'dq_cards', icon: '📖', text: 'Выполни 2 карточки', reward: 20 },
        { id: 'dq_gold', icon: '💰', text: 'Заработай 30 💰', reward: 15 },
        { id: 'dq_hire', icon: '⚔', text: 'Найми 3 существа', reward: 15 },
        { id: 'dq_build', icon: '🏗', text: 'Построй что-нибудь', reward: 20 },
        { id: 'dq_quest', icon: '📜', text: 'Выполни квест', reward: 10 },
        { id: 'dq_assault', icon: '⚔', text: 'Штурмуй твердыню', reward: 25 }
    ];
    var seed = parseInt(getMSKDayKey().replace(/-/g, ''));
    dailyQuests = { day: getMSKDayKey(), quests: [_qpool[seed % 6], _qpool[(seed + 2) % 6], _qpool[(seed + 4) % 6]], done: {} };
}
html += '<div class="sh-quest-board"><div class="sh-quest-title">📋 Задания дня</div>';
dailyQuests.quests.forEach(function(q) {
    if (dailyQuests.done[q.id]) { html += '<div class="sh-quest done">✓ ' + q.text + ' (+' + q.reward + ' 💰)</div>'; return; }
    html += '<div class="sh-quest" data-action="sh-daily-quest" data-qid="' + q.id + '" data-reward="' + q.reward + '">☐ ' + q.icon + ' ' + q.text + ' → +' + q.reward + ' 💰</div>';
});
html += '</div>';
html += '<div class="sh-grid">';
for (var p = 1; p <= 4; p++) {
html += '<div class="sh-prov"><div class="sh-prov-title">' + PROVINCES[p] + '</div>';
STRONGHOLDS.forEach(function(d, i) {
if (d.prov !== p) return;
var s = strongholds[i];
if (s.captured) {
html += '<div class="sh-card owned" data-action="sh-open" data-idx="' + i + '">' +
'<div class="sh-icon">' + shSprite(i) + '</div>' +
'<div class="sh-body"><div class="sh-name">' + d.icon + ' ' + d.name + '</div>' +
'<div class="sh-meta">+' + d.tax + ' 💰/день · слоты ' + builtList(i).length + '/' + d.slots + '</div>' +
stageBadgeHtml(shWorstStage(i)) + '</div></div>';
} else if (i === front) {
html += '<div class="sh-card front"' + (i === 0 ? ' data-action="sh-open" data-idx="' + i + '"' : '') + '>' +
'<div class="sh-icon">' + d.icon + '</div>' +
'<div class="sh-body"><div class="sh-name">' + d.name + (i === 0 ? ' <span class="sh-req">стартовый лагерь</span>' : '') + '</div>' +
'<div class="sh-meta">Сила нейтралов: ' + d.total + '</div></div>' +
'<button class="sh-assault" data-action="sh-assault" data-idx="' + i + '">⚔ Штурм</button></div>';
} else {
html += '<div class="sh-card locked"><div class="sh-icon">🔒</div>' +
'<div class="sh-body"><div class="sh-name">' + d.name + '</div>' +
'<div class="sh-meta">Захвати предыдущую</div></div></div>';
}
});
html += '</div>';
}
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
function renderStrongholdPanel(idx) {
ensureStrongholdState();
if (!SM) return;
var root = document.getElementById('strongholdsRoot');
if (!root) { currentShIdx = null; return; }
var d = STRONGHOLDS[idx], s = strongholds[idx];
if (!s || (!s.captured && idx !== 0)) { currentShIdx = null; renderStrongholds(); return; } // Сендер-Хутор — стартовый лагерь и без захвата (SPEC §9)
var html = '<button class="sh-back" data-action="sh-back">← Все твердыни</button>';
html += '<div class="sh-panel-head"><div class="sh-panel-title">' + d.icon + ' ' + d.name + '</div>' +
'<div class="sh-panel-sub">Налог +' + d.tax + ' 💰/день · слоты ' + builtList(idx).length + '/' + d.slots + ' · ' + PROVINCES[d.prov] + '</div></div>';
html += '<div class="sh-sec-title">🏗 Постройки</div>';
var built = builtList(idx);
if (built.length === 0) html += '<div class="empty-state">Пока ничего не построено.</div>';
built.forEach(function(id) {
var bd = BUILDINGS[id], b = s.buildings[id];
html += '<div class="sh-build-row"><div class="sh-build-icon">' + shSpriteImg('img/tract/buildings/' + id + '.png', bd.icon) + '</div>' +
'<div class="sh-build-body"><div class="sh-build-name">' + bd.name + '</div>' +
'<div class="sh-build-meta">' + buildingEffectText(bd) + ' · содержание ' + bd.upkeep + ' 💰/день</div></div>' +
stageBadgeHtml(b.corruptionStage) + '</div>';
});
var slotLeft = d.slots - built.length;
html += '<div class="sh-sec-title">📓 Каталог (свободно слотов: ' + slotLeft + ')</div>';
var anyShown = false;
Object.keys(BUILDINGS).forEach(function(id) {
var bd = BUILDINGS[id];
if (bd.min > idx + 1) return;
if (s.buildings[id] && s.buildings[id].built) return;
anyShown = true;
var reqOk = !bd.req || (s.buildings[bd.req] && s.buildings[bd.req].built);
var can = reqOk && slotLeft > 0 && (HERO.gold || 0) >= bd.cost;
html += '<div class="sh-build-row buy"><div class="sh-build-icon">' + shSpriteImg('img/tract/buildings/' + id + '.png', bd.icon) + '</div>' +
'<div class="sh-build-body"><div class="sh-build-name">' + bd.name + (reqOk ? '' : ' <span class="sh-req">нужна: ' + BUILDINGS[bd.req].name + '</span>') + '</div>' +
'<div class="sh-build-meta">' + buildingEffectText(bd) + ' · ' + bd.cost + ' 💰 · содержание ' + bd.upkeep + ' 💰/день</div></div>' +
(can ? '<button class="sh-buy" data-action="sh-buy" data-idx="' + idx + '" data-bid="' + id + '">🏗 ' + bd.cost + '</button>' : '<span class="sh-stage lock">🔒</span>') +
'</div>';
});
if (!anyShown) html += '<div class="empty-state">Каталог пуст — захватывай новые земли.</div>';
html += '<div class="sh-sec-title">⚔ Найм (пул недели · скидка 🎭 ' + Math.round(Math.min(0.30, 0.005 * STATS.cha.value) * 100) + '%)</div>';
var hireRows = '';
Object.keys(BUILDINGS).forEach(function(id) {
var bd = BUILDINGS[id];
if (!bd.grow) return;
var b = s.buildings[id];
if (!b || !b.built) return;
var tier = bd.tier, u = UNIT_TIERS[tier];
hireRows += '<div class="sh-hire-row"><div class="sh-build-icon">' + shSpriteImg('img/units/' + tier + '.png', u.icon) + '</div>' +
'<div class="sh-build-body"><div class="sh-build-name">' + u.name + ' (Т' + tier.slice(1) + ') · сила ' + u.power + '</div>' +
'<div class="sh-build-meta">Пул недели: <b>' + (hirePool[tier] || 0) + '</b> · цена ' + hireCostOf(tier) + ' 💰</div></div>' +
'<div class="sh-hire-actions">' +
'<button class="sh-mini" data-action="sh-hire-army" data-idx="' + idx + '" data-tier="' + tier + '">В армию</button>' +
'<button class="sh-mini" data-action="sh-hire-garrison" data-idx="' + idx + '" data-tier="' + tier + '">В гарнизон</button>' +
'</div></div>';
});
html += hireRows || '<div class="empty-state">Построй жилище, чтобы нанимать существ.</div>';
var garDef = SM.defensePower(d, s.garrison, STATS.end.value, defBonusOf(idx));
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
t.status = 'done'; t.doneAt = Date.now();
sfxGoalComplete(); haptic('success');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 60, { color: '#fbbf24', speed: 10, decay: 0.01, size: 3, shape: 'star', gravity: 0.08 });
showToast('✅ Сделано!', 'Открой сундук: +💰 или +XP', 'crit');
renderTasks(); renderDashboard(); saveGameState();
}
function claimTaskChest(id, choice) {
var t = findTask(id);
if (!t || t.status !== 'done') return;
var tier = TASK_TIERS[t.tier] || TASK_TIERS.normal;
if (choice === 'gold') {
HERO.gold = (HERO.gold || 0) + tier.gold;
showToast('🎁 Сундук открыт', '+' + tier.gold + ' 💰 в казну', 'save');
sfxEquip();
} else {
addXpReward(tier.xp);
showToast('🎁 Сундук открыт', '+' + tier.xp + ' XP', 'save');
sfxCrit();
}
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
var penaltyCount = 0;
TASKS.forEach(function(t) {
var tier = TASK_TIERS[t.tier] || TASK_TIERS.normal;
var dlDay = t.deadline ? getMSKDayKey(t.deadline) : yesterdayKey;
if (t.status === 'active' && dlDay <= yesterdayKey) {
t.status = 'ghost'; t.ghostSince = Date.now(); penaltyCount++; changed = true;
} else if (t.status === 'done' && t.doneAt) {
if (daysBetween(getMSKDayKey(t.doneAt), yesterdayKey) >= tier.doneGraceDays) {
var half = Math.floor(tier.gold / 2);
HERO.gold = (HERO.gold || 0) + half;
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
if (penaltyCount > 0) {
var p = Math.min(5, penaltyCount);
siege.wkTaskFails = (siege.wkTaskFails || 0) + penaltyCount;
HERO.gold = Math.max(0, (HERO.gold || 0) - p);
showToast('👻 Призраки ночи', penaltyCount + ' просроченных задач: −' + p + ' 💰', 'blood');
sfxFail(); haptic('error');
spawnBloodRain(15);
}
if (changed || penaltyCount > 0) { renderTasks(); renderDashboard(); updateHeroUI(); saveGameState(); }
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
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
function getMSKDate(ts) { return new Date((ts || Date.now()) + MSK_OFFSET_MS); }
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
var all = [
{ id: 'first_card', icon: '⚔', name: 'Первая ковка', desc: 'Выковать первую карточку', check: FORGED.length >= 1 },
{ id: 'cards_10', icon: '📖', name: 'Коллекционер', desc: '10 карточек в колоде', check: FORGED.length >= 10 },
{ id: 'cards_25', icon: '📚', name: 'Архивариус', desc: '25 карточек в колоде', check: FORGED.length >= 25 },
{ id: 'rank_b', icon: '🛡', name: 'Воин', desc: 'Карточка ранга B', check: FORGED.some(function(c) { return ['B','BB','BBB','A','AA','AAA','S','SS','SSS'].indexOf(c.rank) >= 0; }) },
{ id: 'rank_a', icon: '⚡', name: 'Мастер', desc: 'Карточка ранга A', check: FORGED.some(function(c) { return ['A','AA','AAA','S','SS','SSS'].indexOf(c.rank) >= 0; }) },
{ id: 'rank_s', icon: '👑', name: 'Легенда', desc: 'Карточка ранга S', check: FORGED.some(function(c) { return ['S','SS','SSS'].indexOf(c.rank) >= 0; }) },
{ id: 'lvl5', icon: '🗡', name: 'Искатель', desc: 'Достичь 5 уровня', check: HERO.level >= 5 },
{ id: 'lvl10', icon: '🛡', name: 'Страж', desc: 'Достичь 10 уровня', check: HERO.level >= 10 },
{ id: 'lvl15', icon: '🏰', name: 'Архонт', desc: 'Достичь 15 уровня', check: HERO.level >= 15 },
{ id: 'xp_1k', icon: '✨', name: 'Первая тысяча', desc: 'Набрать 1000 XP', check: HERO.totalXp >= 1000 },
{ id: 'xp_10k', icon: '💎', name: 'Десять тысяч', desc: 'Набрать 10 000 XP', check: HERO.totalXp >= 10000 },
{ id: 'xp_100k', icon: '🌟', name: 'Сто тысяч', desc: 'Набрать 100 000 XP', check: HERO.totalXp >= 100000 },
{ id: 'goal_1', icon: '🎯', name: 'Первая цель', desc: 'Выполнить первую цель', check: GOALS.filter(function(g) { return g.completed; }).length >= 1 },
{ id: 'goal_10', icon: '🏆', name: 'Десятка', desc: 'Выполнить 10 целей', check: GOALS.filter(function(g) { return g.completed; }).length >= 10 },
{ id: 'equip_all', icon: '🎒', name: 'Полный комплект', desc: 'Заполнить все слоты экипировки', check: Object.values(INVENTORY.equipped).filter(function(e) { return e; }).length >= 9 },
{ id: 'sh_10', icon: '🏰', name: 'Полкоролевства', desc: 'Захватить 10 твердынь', check: capturedCount() >= 10 },
{ id: 'sh_all', icon: '👑', name: 'Владыка Твердынь', desc: 'Захватить все 20 твердынь', check: capturedCount() >= STRONGHOLDS.length },
{ id: 'streak_7', icon: '🔥', name: 'Неделя дисциплины', desc: '7-дневный стрик на карточке', check: FORGED.some(function(c) { return (c.streak || 0) >= 7; }) },
{ id: 'streak_30', icon: '🔥', name: 'Месяц железа', desc: '30-дневный стрик на карточке', check: FORGED.some(function(c) { return (c.streak || 0) >= 30; }) },
{ id: 'completions_100', icon: '💯', name: 'Сотня', desc: '100 выполнений карточек', check: totalCompletions >= 100 },
];
var totalCompletions = FORGED.reduce(function(a, c) { return a + (c.totalCompletions || 0); }, 0);
all[all.length - 1].check = totalCompletions >= 100;
var unlocked = all.filter(function(a) { return a.check; }).length;
var html = '<div style="background:rgba(0,0,0,0.3);border:1px solid var(--border);padding:16px;margin-bottom:20px;">';
html += '<div style="font-size:11px;letter-spacing:2px;color:var(--text-dim);text-transform:uppercase;margin-bottom:12px;">🏆 Достижения (' + unlocked + '/' + all.length + ')</div>';
html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;">';
all.forEach(function(a) {
if (a.check) {
html += '<div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);padding:10px;border-radius:6px;text-align:center;">';
html += '<div style="font-size:24px;">' + a.icon + '</div>';
html += '<div style="font-size:11px;color:var(--gold-bright);font-weight:bold;margin-top:4px;">' + a.name + '</div>';
html += '<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">' + a.desc + '</div>';
html += '</div>';
} else {
html += '<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);padding:10px;border-radius:6px;text-align:center;opacity:0.4;">';
html += '<div style="font-size:24px;filter:grayscale(1);">' + a.icon + '</div>';
html += '<div style="font-size:11px;color:var(--text-dim);margin-top:4px;">' + a.name + '</div>';
html += '<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">' + a.desc + '</div>';
html += '</div>';
}
});
html += '</div></div>';
return html;
}
function exportJson() {
try {
var data = {
exportedAt: new Date().toISOString(),
hero: HERO, stats: STATS, forged: FORGED, goals: GOALS, inventory: INVENTORY,
xpHistory: xpHistory
};
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
    saveGameState();
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

function renderDashboard() {
    var bar = document.getElementById('dashboardBar');
    if (!bar) return;
    var isBeginner = (HERO.level || 1) <= 2 && FORGED.length > 0 && FORGED.length <= 5;
    var html = '<button class="info-btn" data-action="toggle-help" title="Что получишь и чем рискуешь" style="position:absolute; right:6px; top:6px;">?</button>';
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
        '<div style="margin-top:6px;">📖 Сегодня сделано: <b>' + doneToday + '</b> из <b>' + FORGED.length + '</b> · осталось <b>' + remaining + '</b>' + (openTasks > 0 ? ' · 📋 задач в работе: <b>' + openTasks + '</b>' : '') + '</div>' +
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
        '<div class="dashboard-row"><span>💰 Казна: <b style="color:var(--gold-bright)">' + (HERO.gold || 0) + '</b></span><span>🏰 Твердыней: <b>' + capturedCount() + '/20</b> · доход <b style="color:#34d399">+' + revenue + ' 💰/день</b>' + toNext + '</span></div>' +
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

function showEvolutionChoices(card) {
    var modal = document.getElementById('evolutionModal');
    if (!modal) return;
    modal.querySelector('.evolution-card-name').textContent = card.name;
    modal.dataset.cardId = card.id;
    modal.classList.add('show');
    sfxRankUp(); haptic('medium');
}
function closeEvolutionModal() { document.getElementById('evolutionModal').classList.remove('show'); }
function applyEvolution(path) {
    var modal = document.getElementById('evolutionModal');
    var cardId = parseInt(modal.dataset.cardId);
    var card = findCard(cardId);
    if (!card) { closeEvolutionModal(); return; }
    card.evolutionPath = path;
    var labels = { depth: '🧘 Глубже', frequency: '⚡ Чаще', stability: '🌟 Стабильнее' };
    var effects = {
        depth: '+50% мастерства',
        frequency: '+1 к пулу стата за выполнение',
        stability: 'Двойная защита стрика для этой карточки'
    };
    showToast('🌟 Эволюция!', labels[path] + ': ' + effects[path], 'crit');
    spiritSay('«Карточка эволюционировала. Её суть изменилась навсегда.»');
    closeEvolutionModal();
    renderCards();
    saveGameState();
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
        if (k > todayKey) break;
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
    var barChart = weekDays.map(function(n, i) {
        var h = Math.max(2, n * 8);
        var dayName = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i];
        return '<div style="display:flex; flex-direction:column; align-items:center; gap:2px; flex:1;">' +
            '<div style="height:' + h + 'px; width:100%; max-width:24px; background:linear-gradient(to top, var(--gold), var(--gold-bright)); border-radius:2px 2px 0 0; min-height:2px;"></div>' +
            '<div style="font-size:10px; color:var(--text-dim);">' + dayName + '</div>' +
            '</div>';
    }).join('');
    var html = '<div style="text-align:center; font-size:18px; color:var(--gold-bright); margin-bottom:12px;">📊 Недельный отчёт</div>' +
        '<div style="display:flex; gap:12px; justify-content:center; align-items:flex-end; height:60px; margin-bottom:16px;">' + barChart + '</div>' +
        '<div style="font-size:13px; line-height:2; color:var(--text-bright);">' +
        '<div>✓ <b>Выполнено:</b> ' + doneCount + '/' + totalCount + ' карточек (' + rate + '%)</div>' +
        '<div>🔥 <b>Лучший стрик:</b> ' + bestStreak + ' дней</div>' +
        '<div>🎯 <b>Цели:</b> ' + goalsDone + ' выполнено' + (goalsFailed > 0 ? ', ' + goalsFailed + ' провалено' : '') + '</div>' +
        '<div>💰 <b>Казна:</b> ' + (HERO.gold || 0) + ' · 🏰 <b>Твердыни:</b> ' + capturedCount() + '/20 (+' + strongholdTaxPerDay() + ' 💰/день)</div>' +
        '</div>' +
        '<div style="text-align:center; margin-top:12px; color:var(--text-dim); font-size:11px;">Новая неделя начинается. Используй опыт прошлой.</div>';
    var modal = document.getElementById('weeklyReportModal');
    if (modal) {
        modal.querySelector('.modal-body').innerHTML = html;
        modal.classList.add('show');
    }
    saveGameState();
}
function closeWeeklyReportModal() { document.getElementById('weeklyReportModal').classList.remove('show'); }

function checkDailyReset() {
const todayKey = getMSKDayKey();
const yesterdayKey = getMSKDayKey(Date.now() - 86400000);
if (lastDayReset !== todayKey) {
var _prevDay = lastDayReset;
lastDayReset = todayKey;
if (_prevDay !== null) {
var gapDays = Math.max(1, daysBetween(_prevDay, todayKey));
if (gapDays > 7) gapDays = 7; // ponytail: backfill cap — пропуск >7 дней докручивается как 7 (ADR §5: кап 7 суток)
var revenue = 0, upkeepTotal = 0, unpaid = 0;
for (var gd = gapDays; gd >= 1; gd--) {
expireGhostTasks(getMSKDayKey(Date.now() - gd * 86400000));
var tr = strongholdsDailyTick();
revenue += tr.income;
upkeepTotal += tr.upkeep;
if (!tr.paid) unpaid++;
}
if (revenue > 0) {
showToast('💰 Тьма копила для тебя', '+' + revenue + ' 💰 за ' + gapDays + ' ' + pluralDays(gapDays) + ' отсутствия. Твои твердыни ждали.', 'save');
sfxEquip(); haptic('success');
}
if (unpaid > 0) {
showToast('🏚 Не хватило на содержание', unpaid + ' дн. дефицита — постройки ветшают (grace ' + (2 + Math.floor(STATS.wil.value / 20)) + ' дн.)', 'blood');
sfxFail(); haptic('error');
}
        // Ежедневное событие: 1 из 5 (Vаrban, Кузнец, Рынок, Тайна, Тихий день)
var _isBackfill = gapDays > 1;
var dailyEvents = [
{ id: 'caravan', icon: '🐎', name: 'Караван', text: 'Торговцы из-за гор: +' + Math.max(20, capturedCount() * 15) + ' 💰 мгновенно!' },
{ id: 'smith', icon: '⚒', name: 'Бродячий кузнец', text: 'Наём сегодня дешевле на 25%.' },
{ id: 'market', icon: '🏪', name: 'Ярмарка', text: 'Налоги твердынь ×1.5 сегодня!' },
{ id: 'ghostfree', icon: '👻', name: 'Духи дремлют', text: 'Призраки задач сегодня безобидны.' },
{ id: 'quiet', icon: '🌙', name: 'Тихий день', text: 'Ничего не произошло. Но золото капает.' }
];
var ev = dailyEvents[Math.floor(Math.random() * dailyEvents.length)];
dailyEvent = ev;
if (ev.id === 'caravan' && !_isBackfill) { var bonus = Math.max(20, capturedCount() * 15); HERO.gold = (HERO.gold || 0) + bonus; }
if (!_isBackfill) showToast(ev.icon + ' ' + ev.name, ev.text, 'save');
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
siege.assaultDay = null; // новый день = новый штурм
var currentMonday = getThisMondayKey();
if (lastWeekReset !== currentMonday) {
lastWeekReset = currentMonday;
showToast('🗓 Новая неделя', 'Путь продолжается', 'save');
recalcHirePool(); // понедельник: пул = Σ прироста жилищ, непокупленное сгорает (SPEC §3)
runWeeklySiege();
siege.wkSkips = 0; siege.wkTaskFails = 0;
setTimeout(showWeeklyReport, 2000);
}
FORGED.forEach(c => {
if (c.firstCompletedAt) {
c.daysActive = getCardDaysActive(c);
}
var lastPlayKey = c.lastCompletedAt ? getMSKDayKey(c.lastCompletedAt) : null;
if (c.streak && lastPlayKey !== yesterdayKey && lastPlayKey !== todayKey) c.streak = 0;
});
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
saveGameState();
}
}
var lastNotifDay = getMSKDayKey();
setInterval(function() {
checkDailyReset(); checkBloodOath();
var dayKey = getMSKDayKey();
if (dayKey !== lastNotifDay) { lastNotifDay = dayKey; scheduleNotifs(); }
}, 60 * 1000);
setInterval(checkGoalDeadlines, 30000);
checkGoalDeadlines();
window.addEventListener('beforeunload', function() { saveGameState(); forceCloudSave(); });
var notifEnabled = localStorage.getItem('neurodeck_notif') === '1';
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
new Notification('NeuroDeck ⚔', { body: 'Осталось ' + uncompleted.length + ' карточек! Доход тракта капает каждый день.', icon: '🗡', tag: 'nd-warn' });
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
document.getElementById('siegeReportModal').addEventListener('click', (e) => { if (e.target.id === 'siegeReportModal') closeSiegeReport(); });
document.getElementById('syncFileInput').addEventListener('change', importSyncFile);
document.addEventListener('keydown', (e) => {
if ((e.ctrlKey || e.metaKey) && e.key === 's') {
e.preventDefault();
openSyncModal();
}
});
var MODAL_CLOSE_FNS = {
goalModal: closeGoalModal, forgeModal: closeForge, editCardModal: closeEditCard,
syncModal: closeSyncModal, returnModal: closeReturnModal,
evolutionModal: closeEvolutionModal, weeklyReportModal: closeWeeklyReportModal,
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
function animateDust() {
if (!dustRunning) return;
dustCtx.clearRect(0, 0, dustCanvas.width, dustCanvas.height);
dustCanvas.style.opacity = 0.6;
dustParticles.forEach(d => { d.update(); d.draw(dustCtx); });
requestAnimationFrame(animateDust);
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
function animate() { if (!particlesRunning) return; ctx.clearRect(0, 0, canvas.width, canvas.height); particles = particles.filter(p => p.life > 0); particles.forEach(p => { p.update(); p.draw(ctx); }); requestAnimationFrame(animate); }
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
function showToast(title, body, type) {
if (toastQueue.length >= 3) toastQueue.shift();
toastQueue.push({ title: title, body: body, type: type });
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
el.style.borderLeftColor = type === 'blood' ? 'var(--blood-bright)' : type === 'crit' || type === 'save' ? '#fbbf24' : 'var(--gold-bright)';
el.style.borderColor = type === 'blood' ? 'var(--blood)' : type === 'crit' || type === 'save' ? '#fbbf24' : 'var(--gold)';
el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
setTimeout(() => { el.classList.remove('show'); setTimeout(playNextToast, 200); }, 2500);
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
var ONBOARDING_STEPS = [
{ icon: '⚔', title: 'Добро пожаловать в NeuroDeck', text: 'Геймифицированный трекер привычек.<br>Ты — Владыка, зарабатывающий свою свободу дисциплиной.' },
{ icon: '📖', title: 'Колода карточек', text: 'Каждая карточка — привычка, которую нужно выполнять ежедневно.<br>Нажми <b>✓</b> чтобы выполнить, <b>✕</b> чтобы пропустить.<br>Выполнение = <b style="color:var(--gold-bright)">+1 💰</b>. Пропуск = <b style="color:var(--blood-bright)">−1 💰</b> и сброс стрика.' },
{ icon: '💰', title: 'Казна', text: 'Золото капает за каждую выполненную карточку.<br>Твердыни платят налоги каждый день, а постройки требуют <b>содержания</b> — забросишь казну, начнут ветшать.' },
{ icon: '🏰', title: 'Твердыни', text: '20 твердыен ждут завоевателя: найми армию и штурмуй <b>по одной в бою</b>.<br>Каждое воскресенье тьма осаждает твой фронт — держи гарнизоны.<br>От Сендер-Хутора до Тернового Трона — путь длиной в месяцы дисциплины.' },
{ icon: '📋', title: 'Задачи дня', text: 'Дела с дедлайном — отдельная система: «сдать отчёт до 13:00».<br>Успел — открой <b>сундук</b> (золото или XP).<br>Просрочил — призрак задачи навещает тебя каждый день, −1 💰 за ночь.' },
{ icon: '🎯', title: 'Цели', text: 'Крупные дела с дедлайном и шагами.<br>Выполнение = опыт + очки атрибута + золото.<br>Провал по дедлайну = потеря золота.' },
{ icon: '🔥', title: 'Ранги и мастерство', text: 'Выполняй карточку — растёт Мастерство.<br>Ранг растёт: C → CC → ... → SSS.<br>Ранг-ап = +1 к пулу атрибута.' },
{ icon: '👑', title: 'Начни свой путь', text: 'От Sender-Хутора до Тронного Зала — 11 локаций.<br>Каждая привычка — кирпич в твою дорогу к свободе.<br><br><span style="color:var(--gold-bright)">Дисциплина — твоя армия.</span>' }
];
function startOnboarding() {
var step = 0;
var overlay = document.createElement('div');
overlay.className = 'onboarding-overlay';
function render() {
var s = ONBOARDING_STEPS[step];
var dots = ONBOARDING_STEPS.map(function(_, i) {
return '<div class="onboarding-dot' + (i === step ? ' active' : '') + '"></div>';
}).join('');
overlay.innerHTML =
'<div class="onboarding-card">' +
'<div class="onboarding-step">Шаг ' + (step + 1) + ' из ' + ONBOARDING_STEPS.length + '</div>' +
'<div class="onboarding-icon">' + s.icon + '</div>' +
'<div class="onboarding-title">' + s.title + '</div>' +
'<div class="onboarding-text">' + s.text + '</div>' +
'<div class="onboarding-dots">' + dots + '</div>' +
(step < ONBOARDING_STEPS.length - 1
? '<button class="demo-btn primary" style="width:100%;">Далее →</button>'
: '<button class="demo-btn primary" style="width:100%;">⚔ Начать!</button>') +
'</div>';
overlay.querySelector('button').addEventListener('click', function() {
step++;
if (step >= ONBOARDING_STEPS.length) {
overlay.classList.remove('show');
setTimeout(function() { overlay.remove(); }, 300);
localStorage.setItem('neurodeck_onboarding_done', '1');
spiritSay('«Дорога ждёт, Владыка. Отбей своё золото у лени.»');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 30, { color: '#d4a574', speed: 4, decay: 0.015, size: 2, shape: 'spark', gravity: 0.05 });
} else {
render();
}
});
}
document.body.appendChild(overlay);
render();
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
siege = { week: 1, lastResult: null, assaultDay: null, wkSkips: 0, wkTaskFails: 0 };
hirePool = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 };
dailyQuests = null; lastDayReset = null; lastWeekReset = getThisMondayKey();
xpHistory = []; bloodOath = null;
try { localStorage.removeItem('neurodeck_full_save'); localStorage.removeItem('neurodeck_backup'); localStorage.removeItem('neurodeck_cards_backup'); localStorage.removeItem('neurodeck_onboarding_done'); } catch(e) {}
try { var csR = getCloudStorage(); if (csR) csR.removeItem(CLOUD_META_KEY, function(){}); } catch(e) {}
saveGameState();
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
siege = { week: 1, lastResult: null, assaultDay: null, wkSkips: 0, wkTaskFails: 0 };
hirePool = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 };
TASKS = []; taskIdCounter = 1;
dailyQuests = null; lastDayReset = null; lastWeekReset = getThisMondayKey();
xpHistory = []; bloodOath = null;
try { localStorage.removeItem('neurodeck_full_save'); localStorage.removeItem('neurodeck_backup'); localStorage.removeItem('neurodeck_cards_backup'); } catch(e) {}
localStorage.removeItem('neurodeck_onboarding_done');
try { var csR = getCloudStorage(); if (csR) { csR.removeItem(CLOUD_META_KEY, function(){}); } } catch(e) {}
saveGameState();
HERO.xpToNext = getXpToNext(HERO.level);
renderCards(); renderDashboard(); renderStrongholds(); renderTasks(); updateHeroUI(); renderGoals(); renderStats();
spiritSay('«С чистого листа, Владыка. Дорога ждёт.»');
localStorage.removeItem('neurodeck_onboarding_done');
showToast('🔄 Новая игра', 'Карточки сохранены. Прогресс сброшен.', 'save');
});
}
loadGameState();
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
importFromHash();
try{ var tg=window.Telegram&&Telegram.WebApp; if(tg){ tg.ready&&tg.ready(); tg.expand&&tg.expand(); tg.setHeaderColor&&tg.setHeaderColor('#0a0a0f'); tg.setBackgroundColor&&tg.setBackgroundColor('#0a0a0f'); tg.disableVerticalSwipes&&tg.disableVerticalSwipes(); } }catch(e){}
if (!hasEverSaved() && FORGED.length === 0) {
    pendingOnboarding = !localStorage.getItem('neurodeck_onboarding_done');
    setTimeout(showStarterDeck, 900);
} else {
if (FORGED.length === 0) { setTimeout(deepRecovery, 1000); }
if (!getCloudStorage()) { setTimeout(function() { updateSyncBadge('offline'); }, 1500); }
else { setTimeout(function() { updateSyncBadge('syncing'); smartCloudSync(); }, 2500); }
if (HERO.lastSessionAt && Date.now() - HERO.lastSessionAt > 86400000 && FORGED.length > 0) {
setTimeout(showReturnScreen, 1500);
} else {
HERO.lastSessionAt = Date.now();
}
setTimeout(() => {
spiritSay('«Дорога ждёт, Владыка. Отбей своё золото у лени.»');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 30, { color: '#d4a574', speed: 4, decay: 0.015, size: 2, shape: 'spark', gravity: 0.05 });
}, 800);
}