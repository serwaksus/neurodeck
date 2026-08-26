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
function sfxBossHit() { playTone(100, 0.2, 'sawtooth', 0.15, 50); setTimeout(function() { playTone(80, 0.3, 'sawtooth', 0.12, 40); }, 100); }
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
level: 1, xp: 0, xpToNext: 50, totalXp: 0, shards: 0, flasks: 0,
hp: 80, maxHp: 80, isHollow: false,
consecutivePerfectDays: 0,
dailyCompletions: 0, dailySkips: 0, actionPoints: 0,
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
const BASE_DAMAGE = 5;
function getLootChance(card) { return 0.05 + Math.min(0.05, (card.streak || 0) * 0.0025); }
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
case 'toggle-notif': toggleNotif(); break;
case 'deep-recovery': deepRecovery(); break;
case 'set-perf': if (el.dataset.mode && window.NeuroDeckPerf && window.NeuroDeckPerf.setMode(el.dataset.mode)) { renderPerfStatus(); showToast('⚡ Режим изменён', { 'auto': 'Авто — эффекты зависят от системных настроек', 'eco': 'Эко — минимальная графика', 'performance': 'Все эффекты включены', 'low': 'Экономный режим — меньше анимаций', 'effects-off': 'Анимации отключены' }[el.dataset.mode] || el.dataset.mode); } break;
case 'close-return-modal': closeReturnModal(); break;
case 'close-evolution-modal': closeEvolutionModal(); break;
case 'apply-evolution-depth': applyEvolution('depth'); break;
case 'apply-evolution-frequency': applyEvolution('frequency'); break;
case 'apply-evolution-stability': applyEvolution('stability'); break;
case 'evolution-skip': closeEvolutionModal(); var ecid = parseInt(document.getElementById('evolutionModal').dataset.cardId); if (ecid) openEditCardAfterRankup(ecid); break;
case 'prestige-card': prestigeCard(parseInt(el.dataset.id)); break;
case 'close-weekly-report': closeWeeklyReportModal(); break;
case 'close-room-detail': closeRoomDetail(); break;
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
case 'c-strike': crucibleAction('strike'); break;
case 'c-stance': crucibleAction('stance'); break;
case 'c-focus': crucibleAction('focus'); break;
case 'c-flask': crucibleAction('flask'); break;
case 'open-shop': openShop(); break;
case 'drink-flask': drinkFlaskOutside(); break;
case 'close-shop': closeShop(); break;
case 'buy-flask': buyFlask(); break;
default:
if (action.indexOf('buy-artifact-') === 0) buyArtifact(action.slice('buy-artifact-'.length));
break;
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
'<div class="card-actions">' +
    (doneToday ? '<div class="card-btn done-today-btn" title="Уже выполнено сегодня">✓</div>' : '<div class="card-btn" data-action="complete-card" data-id="' + card.id + '" title="Выполнить">✓</div>') +
   '<div class="card-btn fail" data-action="fail-card" data-id="' + card.id + '" title="Пропустить">✕</div>' +
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
'<div class="card-progress"><div class="card-progress-bar" style="width:' + progressPct + '%"></div></div>';
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
burstParticles(x, y, 28, { color: '#f4c896', speed: 5, decay: 0.02, size: 3, shape: 'spark', gravity: 0.08 });
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
HERO.hp = Math.min(calcMaxHp(), HERO.hp + 1);
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
escapeProgress = Math.min(ESCAPE_MAX, escapeProgress + 1);
updateEscapeDisplay();
renderMap(escapeProgress);
setTimeout(() => triggerRankUpEffect(card, oldRank, nextRank, x, y), 300);
var rankUpCard = document.querySelector('[data-id="' + card.id + '"]');
if (rankUpCard) { rankUpCard.closest('.card').classList.add('rankup-glow'); setTimeout(function() { rankUpCard.closest('.card').classList.remove('rankup-glow'); }, 1800); }
} else {
card.mastery = card.masteryThreshold;
showToast('👑 МАКСИМУМ!', card.name + ' достигла SSS', 'crit');
spiritSay('«Легенда... Твоя дисциплина несокрушима.»');
}
}
HERO.actionPoints = (HERO.actionPoints || 0) + 1;
if (Math.random() < getLootChance(card)) dropRandomLoot(x, y);
checkHeroLevelUp();
renderCards();
renderDashboard();
updateHeroUI();
if (!rankUpHappened) {
const streakBonusTxt = streakMult > 1.0 ? ' (🔥 ×' + streakMult.toFixed(2) + ')' : '';
showToast('✅ Выполнено', '+' + finalXp + ' XP' + streakBonusTxt + ' · +1 ОД · 🔥 ' + card.streak + ' дней');
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
const gear = getTotalGearBonuses();
const totalWil = STATS.wil.value + gear.wil;
var saveDivisor = card.evolutionPath === 'stability' ? 150 : 300;
if (Math.random() < (totalWil / saveDivisor)) {
showToast('🧘 Воля!', 'Стрик защищён. Ярости нет.', 'save');
return;
}
bossRagePoints++;
if (card) { card.streak = 0; renderCards(); }
showToast('💢 Ярость босса +1', 'Пропуск «' + card.name + '» — босс копит силу (' + bossRagePoints + ')', 'blood');
updateHeroUI();
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
spiritSay('«' + stat.name + ' крепнет... Ты стал сильнее.»');
if (statKey === 'end') {
HERO.maxHp = calcMaxHp();
HERO.hp = Math.min(HERO.maxHp, HERO.hp + 5);
}
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
updateHeroSummary(); updateDamageInfo();
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
function calcMaxHp() { return 80 + Math.max(0, (HERO.level - 1) * 6) + STATS.end.value * 2; }
function updateHeroUI() {
const newMaxHp = calcMaxHp();
if (newMaxHp !== HERO.maxHp) {
const diff = newMaxHp - HERO.maxHp;
HERO.maxHp = newMaxHp;
if (diff > 0) HERO.hp = Math.min(HERO.maxHp, HERO.hp + diff);
else HERO.hp = Math.min(HERO.maxHp, HERO.hp);
}
HERO.hp = Math.max(0, Math.min(HERO.maxHp, HERO.hp));
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
if (HERO.isHollow) {
document.getElementById('heroTitle').textContent = '«Полый, потерявший цель»';
document.getElementById('heroAvatar').classList.add('hollow');
document.getElementById('atonementBar').style.display = 'block';
for (let i = 1; i <= 3; i++) {
document.getElementById('at' + i).classList.toggle('filled', i <= HERO.consecutivePerfectDays);
}
} else {
document.getElementById('heroTitle').textContent = HERO.title;
document.getElementById('heroAvatar').classList.remove('hollow');
document.getElementById('atonementBar').style.display = 'none';
}
const ringR = parseFloat(document.getElementById('ringFill').getAttribute('r')) || 74;
const ringCirc = 2 * Math.PI * ringR;
document.getElementById('ringFill').setAttribute('stroke-dasharray', ringCirc);
document.getElementById('ringFill').setAttribute('stroke-dashoffset', ringCirc * (1 - HERO.xp / HERO.xpToNext));
document.getElementById('heroHpCur').textContent = HERO.hp;
document.getElementById('heroHpMax').textContent = HERO.maxHp;
const hpPct = (HERO.hp / HERO.maxHp) * 100;
const hpFill = document.getElementById('heroHpFill');
hpFill.style.width = hpPct + '%';
hpFill.classList.toggle('low', hpPct <= 30);
const warnEl = document.getElementById('heroHpWarn');
if (hpPct <= 0) warnEl.innerHTML = '<span class="hp-warn" style="color: var(--blood-bright)">💀 Ты пал...</span>';
else if (hpPct <= 30) warnEl.innerHTML = '<span class="hp-warn">⚠ Критическое состояние</span>';
else warnEl.textContent = '';
document.getElementById('heroEndStat').textContent = STATS.end.value;
updateHeroSummary(); updateDamageInfo(); updatePunishCountdown();
updateBossDisplay();
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
document.getElementById('statRankups').textContent = escapeProgress;
document.getElementById('statEscape').textContent = escapeProgress + ' / ' + ESCAPE_MAX;
}
function updateDamageInfo() {
const s = getCrucibleStats();
const critChance = Math.min(0.5, s.cha * 0.02);
document.getElementById('damageInfo').innerHTML =
'Удар: <b style="color:var(--gold-bright)">' + (5 + s.str + 10) + '</b><br>' +
'Шанс крита: <b style="color:var(--gold-bright)">' + Math.round(critChance*100) + '%</b><br>' +
'Концентрация (×2): до <b style="color:var(--gold-bright)">+' + Math.round(s.int) + '</b> урона и +10% крита<br>' +
'Стиль деки: <b style="color:var(--gold-bright)">' + getDeckStat() + '</b>';
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
HERO.maxHp = calcMaxHp();
var healAmount = Math.floor(HERO.maxHp * 0.5);
HERO.hp = Math.min(HERO.maxHp, HERO.hp + healAmount);
document.getElementById('lvlSub2').textContent = '+' + healAmount + ' HP · maxHP вырос';
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
let bossHp = 100;
let bossStage = 0;
let bossDefeated = false;
let chimeraShield = 3;
let bossRagePoints = 0;
var lastWeekReset = getThisMondayKey();
// === CRUCIBLE COMBAT v2: транзиентное состояние боя (не сохраняется —
// при перезагрузке текущий бой начинается заново; mirror tools/combat-lab/combat_model.gd) ===
var cHeroShield = 0, cFocus = 0, cFocusMax = 2, cFlaskUsed = false;
var cRound = 0, cRage = 0, cIntent = 'quick';
var cPoisonTicks = 0, cPoisonDmg = 0, cStanceCount = 0, cGuard = 0;
var C_ATTACK = { normal: [9, 11, 13], social: [10, 12, 14], chimera: [12, 14, 16] };
var C_SPECIAL = { normal: 'poison', social: 'burn', chimera: 'guard' };
window._bossKills = { snake: 0, social: 0, chimera: 0 };
function getBattlePhase() {
var msk = new Date(Date.now() + 3 * 3600000);
var day = msk.getUTCDay();
return (day >= 5 || day === 0) ? 'battle' : 'accumulate';
}
function getBattlePhaseLabel() {
var phase = getBattlePhase();
if (phase === 'battle') {
return '⚔ Фаза схватки (Пт–Вс)';
}
return '⛏ Фаза накопления (Пн–Чт)';
}
function scaleBossStages(stages) {
var lvl = HERO.level || 1;
var mult = 1 + (lvl - 1) * 0.10;
if (lvl > 10) mult += (lvl - 10) * 0.18;
return stages.map(function(s) {
var hp = Math.round(s.hp * mult);
return Object.assign({}, s, { hp: hp, maxHp: hp });
});
}
function getCurrentBoss() {
if (escapeProgress < 40) return {
name: 'Змей Лени', icon: '🐍', type: 'normal',
stages: scaleBossStages([
{ hp: 100, maxHp: 100, animClass: 'boss-anim-stage1', desc: '«Я питаюсь твоим бездействием.»' },
{ hp: 150, maxHp: 150, animClass: 'boss-anim-stage2', desc: '«Ты думаешь, это было сложно? Я лишь разогревался.»' },
{ hp: 200, maxHp: 200, animClass: 'boss-anim-stage3', desc: '«НЕВОЗМОЖНО! Я ПОГЛОЩУ ТЕБЯ ЦЕЛИКОМ!»' }
])
};
if (escapeProgress < 80) return {
name: 'Демон Соцсетей', icon: '📱', type: 'social',
stages: scaleBossStages([
{ hp: 120, maxHp: 120, animClass: 'boss-anim-stage1', desc: '«Твой скролл — моя пища.»' },
{ hp: 180, maxHp: 180, animClass: 'boss-anim-stage2', desc: '«Ещё один свайп, и ты мой!»' },
{ hp: 250, maxHp: 250, animClass: 'boss-anim-stage3', desc: '«ТЫ НЕ МОЖЕШЬ УЙТИ ОТ ЛЕНТЫ!»' }
])
};
return {
name: 'Химера Выгорания', icon: '🔥', type: 'chimera',
stages: scaleBossStages([
{ hp: 90, maxHp: 90, animClass: 'boss-anim-stage1', desc: '«У тебя нет сил...»' },
{ hp: 130, maxHp: 130, animClass: 'boss-anim-stage2', desc: '«Твоя мотивация иссякла.»' },
{ hp: 175, maxHp: 175, animClass: 'boss-anim-stage3', desc: '«СГОРИ В ПЕПЛЕ РУТИНЫ!»' }
])
};
}
function changeBossHp(delta) {
if (bossDefeated) return;
const boss = getCurrentBoss();
    const stage = boss.stages[bossStage];
    bossHp = Math.max(0, Math.min(stage.maxHp, bossHp + delta));
const pct = (bossHp / stage.maxHp) * 100;
var fillEl = document.getElementById('bossHpFill');
var textEl = document.getElementById('bossHpText');
if (fillEl) fillEl.style.width = pct + '%';
if (textEl) textEl.textContent = Math.round(pct) + '%';
updateCombatHpBars();
const crackPct = Math.max(0, (stage.maxHp - bossHp) / stage.maxHp);
const crackEl = document.getElementById('bossCracks');
const crackFullEl = document.getElementById('bossCracksFull');
if (crackEl) crackEl.style.opacity = crackPct * 0.95;
if (crackFullEl) crackFullEl.style.opacity = crackPct * 0.95;
const bloodEl = document.getElementById('bossBlood');
const bloodFullEl = document.getElementById('bossBloodFull');
const bloodPct = bossHp < stage.maxHp * 0.3 ? (stage.maxHp * 0.3 - bossHp) / (stage.maxHp * 0.3) : 0;
if (bloodEl) bloodEl.style.opacity = bloodPct * 0.8;
if (bloodFullEl) bloodFullEl.style.opacity = bloodPct * 0.8;
document.querySelectorAll('.boss-sprite').forEach(sprite => {
sprite.style.filter = 'hue-rotate(' + (crackPct * -20) + 'deg) saturate(' + (1 + crackPct * 0.5) + ') brightness(' + (1 - crackPct * 0.2) + ')';
});
if (bossHp <= 0) {
if (bossStage < 2) {
bossStage++;
const nextStage = boss.stages[bossStage];
bossHp = nextStage.maxHp;
screenShake(12, 600);
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 100, { color: '#c73e4d', speed: 12, decay: 0.01, size: 4, shape: 'star', gravity: 0.1 });
showToast('⚠ БОСС ЭВОЛЮЦИОНИРУЕТ!', boss.name + ' переходит в стадию ' + (bossStage + 1) + '!', 'blood');
spiritSay('«' + nextStage.desc + '»');
sfxBossHit(); haptic('heavy');
document.getElementById('bossInfo').textContent = nextStage.desc;
document.querySelectorAll('.boss-sprite').forEach(sprite => {
sprite.className = 'boss-sprite ' + nextStage.animClass;
});
updateBossDisplay();
} else {
triggerBossExecution();
}
}
saveGameState();
}
function triggerBossExecution() {
bossDefeated = true;
if (window.setBossDefeated) window.setBossDefeated(true);
bossRagePoints = 0;
HERO.actionPoints = 0;
sfxBossDefeated(); haptic('heavy');
const boss = getCurrentBoss();
// Запускаем анимацию смерти на спрайтах
document.querySelectorAll('.boss-sprite').forEach(s => s.classList.add('boss-anim-execution'));
screenShake(25, 1500);
// Взрыв частиц
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 300, { color: '#fbbf24', speed: 15, decay: 0.005, size: 5, shape: 'star', gravity: 0.15, life: 2.0 });
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 200, { color: '#c73e4d', speed: 12, decay: 0.008, size: 4, shape: 'spark', gravity: 0.1, life: 1.5 });
// Награды
showToast('💀 БОСС КАЗНЁН', boss.name + ' повержен! Тьма отступает.', 'crit');
spiritSay('«Невозможное совершено. Твоя душа стала крепче.»');
if (boss.type === 'chimera') window._bossKills.chimera++;
else if (boss.type === 'social') window._bossKills.social++;
else window._bossKills.snake++;
var bossKillXp = boss.type === 'chimera' ? 1600 : boss.type === 'social' ? 1200 : 800;
addXpReward(bossKillXp);
HERO.shards = (HERO.shards || 0) + 3;
dropRandomLoot(window.innerWidth / 2, window.innerHeight / 2);
dropRandomLoot(window.innerWidth / 2 + 50, window.innerHeight / 2 - 50);
// Постепенное затухание трещин и крови
const crackEl = document.getElementById('bossCracks');
const crackFullEl = document.getElementById('bossCracksFull');
const bloodEl = document.getElementById('bossBlood');
const bloodFullEl = document.getElementById('bossBloodFull');
if (crackEl) crackEl.style.opacity = '0';
if (crackFullEl) crackFullEl.style.opacity = '0';
if (bloodEl) bloodEl.style.opacity = '0';
if (bloodFullEl) bloodFullEl.style.opacity = '0';
// Глаза гаснут
document.querySelectorAll('.boss-eye').forEach(eye => {
eye.style.opacity = '0';
});
// После завершения анимации (3 сек) - показываем оверлей "ПОВЕРЖЕН" и скрываем босса
setTimeout(() => {
document.getElementById('bossHpText').textContent = '0%';
document.getElementById('bossHpTextFull').textContent = '0%';
// Показываем оверлей с черепом
const defeatedFull = document.getElementById('bossDefeatedFull');
const defeatedPanel = document.getElementById('bossDefeatedPanel');
if (defeatedFull) defeatedFull.classList.add('show');
if (defeatedPanel) defeatedPanel.classList.add('show');
// Помечаем HP блоки как defeated
const hpBlockFull = document.getElementById('bossHpBlockFull');
const hpBlockPanel = document.getElementById('bossHpBlockPanel');
if (hpBlockFull) hpBlockFull.classList.add('defeated');
if (hpBlockPanel) hpBlockPanel.classList.add('defeated');
// Обновляем info
document.getElementById('bossInfo').innerHTML = '<span class="boss-defeated-text">☠ ПОВЕРЖЕН ☠</span>';
}, 3000);
// Через 8 секунд - возрождение нового босса
setTimeout(() => {
bossDefeated = false;
if (window.setBossDefeated) window.setBossDefeated(false);
bossStage = 0;
chimeraShield = 3;
bossRagePoints = 0;
HERO.actionPoints = 0;
const newBoss = getCurrentBoss();
if (window.setBossType) window.setBossType(newBoss.type);
bossHp = newBoss.stages[0].maxHp;
// Скрываем оверлеи
const defeatedFull = document.getElementById('bossDefeatedFull');
const defeatedPanel = document.getElementById('bossDefeatedPanel');
if (defeatedFull) defeatedFull.classList.remove('show');
if (defeatedPanel) defeatedPanel.classList.remove('show');
// Восстанавливаем HP блоки
const hpBlockFull = document.getElementById('bossHpBlockFull');
const hpBlockPanel = document.getElementById('bossHpBlockPanel');
if (hpBlockFull) hpBlockFull.classList.remove('defeated');
if (hpBlockPanel) hpBlockPanel.classList.remove('defeated');
// Восстанавливаем спрайты
document.querySelectorAll('.boss-sprite').forEach(sprite => {
sprite.classList.remove('boss-anim-execution');
sprite.className = 'boss-sprite ' + newBoss.stages[0].animClass;
sprite.style.filter = '';
});
// Возвращаем глаза
document.querySelectorAll('.boss-eye').forEach(eye => {
eye.style.opacity = '1';
});
// Сбрасываем трещины и кровь
const crackEl = document.getElementById('bossCracks');
const crackFullEl = document.getElementById('bossCracksFull');
const bloodEl = document.getElementById('bossBlood');
const bloodFullEl = document.getElementById('bossBloodFull');
if (crackEl) crackEl.style.opacity = '0';
if (crackFullEl) crackFullEl.style.opacity = '0';
if (bloodEl) bloodEl.style.opacity = '0';
if (bloodFullEl) bloodFullEl.style.opacity = '0';
// Обновляем инфо о боссе
document.getElementById('bossInfo').textContent = newBoss.stages[0].desc;
// Обновляем отображение
changeBossHp(0);
updateBossDisplay();
// Эффект появления нового босса
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 80, { color: '#8b2635', speed: 10, decay: 0.012, size: 3, shape: 'spark', gravity: 0.08 });
showToast('⚠ Новый враг!', newBoss.name + ' появляется из тьмы...', 'blood');
spiritSay('«' + newBoss.stages[0].desc + '»');
screenShake(8, 400);
}, 8000);
}
function initCombatCanvas() {
    var boss = getCurrentBoss();
    if (window.setBossType) window.setBossType(boss.type);
    updateCombatHpBars();
}
function updateCombatHpBars() {
    var boss = getCurrentBoss();
    var stage = boss.stages[bossStage];
    if (window.updateHP) window.updateHP(
        Math.max(0, HERO.hp), HERO.maxHp,
        Math.max(0, bossHp), stage.maxHp,
        boss.name, bossStage, boss.type
    );
    if (bossDefeated && window.setBossDefeated) window.setBossDefeated(true);
}
// === CRUCIBLE COMBAT v2: правила 1:1 из tools/combat-lab/combat_model.gd ===
function getCrucibleStats() {
var gear = getTotalGearBonuses();
var s = {};
Object.keys(STATS).forEach(function(k) { s[k] = STATS[k].value + gear[k]; });
return s;
}
function getDeckStat() {
var s = getCrucibleStats();
var best = 'str';
['str', 'end', 'int', 'cha', 'wil', 'agi'].forEach(function(k) {
if (s[k] > s[best]) best = k;
});
return best;
}
function intentLabel(intent) {
if (intent === 'heavy') return 'Тяжёлый удар ⚠';
if (intent === 'quick') return 'Быстрый удар';
if (intent === 'enrage') return 'Ярость 💢';
var type = getCurrentBoss().type;
return type === 'chimera' ? 'Гард 🛡' : type === 'social' ? 'Выжигание 🔥' : 'Яд ☠';
}
function updateBossIntentUI() {
var el = document.getElementById('bossIntent');
if (!el) return;
el.textContent = (!bossDefeated && getBattlePhase() === 'battle') ? 'Ход босса: ' + intentLabel(cIntent) : '';
}
function rollIntent(first) {
if (first) return 'quick';
if (cRound > 0 && cRound % 5 === 0) return 'special';
var r = Math.random();
if (r < 0.30) return 'heavy';
if (r < 0.65) return 'quick';
if (r < 0.80) return 'enrage';
return C_SPECIAL[getCurrentBoss().type] ? 'special' : 'quick';
}
function crucibleResetTransient() {
cHeroShield = 0; cFocus = 0; cFlaskUsed = false;
cPoisonTicks = 0; cPoisonDmg = 0;
cRage = 0; cGuard = 0; cRound = 0;
cFocusMax = getDeckStat() === 'int' ? 3 : 2;
}
function crucibleStartFight(fight) {
bossStage = Math.min(Math.max(fight, 0), 2);
crucibleResetTransient();
var stage = getCurrentBoss().stages[bossStage];
bossHp = stage.maxHp;
cIntent = rollIntent(true);
updateBossIntentUI();
changeBossHp(0);
updateCombatHpBars();
updateBossDisplay();
saveGameState();
}
function crucibleAction(action) {
if (bossDefeated) { showToast('☠ Босс повержен', 'Нечего атаковать', 'blood'); return; }
if (getBattlePhase() !== 'battle') { showToast('⛏ Не время', 'Фаза схватки: пятница — воскресенье', 'blood'); return; }
crucibleHeroAction(action);
updateBossBattleUI(); updateCombatHpBars(); updateHeroUI();
if (bossHp <= 0) { crucibleFightCleared(); return; }
endBossTurn();
if (bossHp <= 0) { crucibleFightCleared(); return; }
if (HERO.hp <= 0) { crucibleRunFailed(); return; }
updateBossBattleUI(); updateCombatHpBars(); updateHeroUI(); updateBossIntentUI();
saveGameState();
}
function crucibleHeroAction(action) {
var s = getCrucibleStats();
var deck = getDeckStat();
if (action === 'strike') { attackBoss(s, deck); return; }
if (action === 'stance') { crucibleStance(s, deck); return; }
if (action === 'flask') { crucibleFlask(); return; }
cFocus = Math.min(cFocus + 1, cFocusMax);
sfxEquip();
showToast('✳ Концентрация', 'Фокус: ' + cFocus + '/' + cFocusMax + ' (+урон и крит)', 'save');
}
function attackBoss(s, deck) {
s = s || getCrucibleStats();
deck = deck || getDeckStat();
var stacks = cFocus;
var base = 5 + s.str * 1.0 + 10 + s.int * 0.5 * stacks;
var critChance = Math.min(0.5, s.cha * 0.02 + 0.05 * stacks);
var critMult = deck === 'cha' ? 2.5 : 2.0;
var crit = Math.random() < critChance;
var dmg = base * (crit ? critMult : 1.0);
if (deck === 'agi' && Math.random() < 0.25) dmg *= 2;
dmg = Math.max(1, Math.round(dmg));
cFocus = 0;
var blocked = false;
if (deck === 'str' && cGuard > 0) cGuard--;
if (cGuard > 0) {
cGuard--;
blocked = true;
bossHp = Math.max(0, bossHp - Math.round(dmg * 0.3));
} else {
bossHp = Math.max(0, bossHp - dmg);
}
if (window.startHeroAttack) window.startHeroAttack(dmg, crit);
if (crit) { sfxCrit(); haptic('heavy'); } else { sfxHit(); haptic('medium'); }
showToast(blocked ? '🛡 Гард поглотил удар' : crit ? '💥 КРИТ!' : '⚔ Удар',
'Урон: ' + dmg + (blocked ? ' (30% сквозь гард)' : ''), blocked ? 'blood' : (crit ? 'crit' : undefined));
}
function crucibleStance(s, deck) {
var cost = 1;
if (deck === 'wil') {
cStanceCount++;
if (cStanceCount % 2 === 0) cost = 0;
}
if ((HERO.actionPoints || 0) < cost) {
cFocus = Math.min(cFocus + 1, cFocusMax);
showToast('✳ Авто-концентрация', 'Не хватило ОД на стойку. Фокус: ' + cFocus + '/' + cFocusMax, 'save');
return;
}
HERO.actionPoints -= cost;
cHeroShield = Math.round((s.wil * 1.6 + s.end * 0.9) * (deck === 'end' ? 1.5 : 1));
var cleansed = '';
if (cPoisonTicks > 0) { cPoisonTicks--; cleansed = ' · Яд ослаблен (' + cPoisonTicks + ' тик.)'; }
sfxEquip(); haptic('medium');
showToast('🛡 Стойка', 'Щит: ' + cHeroShield + cleansed, 'save');
}
function crucibleFlask() {
if (cFlaskUsed) { showToast('🧪 Фляга уже использована', 'Одна фляга на бой', 'blood'); sfxError(); return; }
if (!(HERO.flasks > 0)) { showToast('🧪 Нет фляг', 'Купи флягу в лавке осколков', 'blood'); sfxError(); return; }
HERO.flasks--;
cFlaskUsed = true;
var heal = Math.round(HERO.maxHp * 0.5);
HERO.hp = Math.min(HERO.maxHp, HERO.hp + heal);
sfxGoalComplete(); haptic('medium');
showToast('🧪 Фляга', '+' + heal + ' HP', 'save');
}
function crucibleApplyHit(raw, ignoreShield) {
var dmg = Math.round(raw);
if (!ignoreShield && cHeroShield > 0) {
if (cHeroShield >= dmg) {
cHeroShield -= dmg;
var reflect = Math.round(getCrucibleStats().agi * 0.4);
bossHp = Math.max(0, bossHp - reflect);
showToast('🛡 Полный блок!', 'Урон поглощён · Отражено ' + reflect + ' HP', 'save');
return dmg;
}
dmg -= cHeroShield;
cHeroShield = 0;
showToast('💔 Щит разбит', 'Часть урона поглощена щитом', 'blood');
}
HERO.hp -= dmg;
return dmg;
}
function endBossTurn() {
var type = getCurrentBoss().type;
var base = C_ATTACK[type][bossStage] + cRage * 2;
var dmg = 0;
if (cIntent === 'heavy') {
dmg = crucibleApplyHit(base * 1.6, false);
showToast('⚠ Тяжёлый удар!', '-' + dmg + ' HP', 'blood');
} else if (cIntent === 'quick') {
dmg = crucibleApplyHit(base * 0.9, false);
showToast('⚡ Быстрый удар', '-' + dmg + ' HP', 'blood');
} else if (cIntent === 'enrage') {
cRage += 2;
showToast('💢 Босс ярится', 'Ярость: ' + cRage + ' — удары становятся сильнее', 'blood');
} else {
if (type === 'social') {
dmg = crucibleApplyHit(4 + bossStage, true);
showToast('🔥 Выжигание', '-' + dmg + ' HP сквозь щит', 'blood');
} else if (type === 'chimera') {
cGuard = 2;
showToast('🛡 Гард', 'Химера закрылась (2 заряда): удары наносят лишь 30%', 'blood');
} else {
cPoisonTicks = 3;
cPoisonDmg = 2 + bossStage;
showToast('☠ Яд', '3 тика по ' + cPoisonDmg + ' HP', 'blood');
}
}
cRound++;
cRage = Math.max(0, cRage - 1);
if (cPoisonTicks > 0) {
cPoisonTicks--;
HERO.hp -= cPoisonDmg;
showToast('☠ Яд действует', '-' + cPoisonDmg + ' HP (осталось: ' + cPoisonTicks + ')', 'blood');
}
if (dmg > 0) {
if (window.startBossAttack) window.startBossAttack(dmg);
sfxBossHit(); haptic('heavy');
}
cIntent = rollIntent(false);
}
function crucibleFightCleared() {
addXpReward(150);
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 120, { color: '#fbbf24', speed: 10, decay: 0.01, size: 4, shape: 'star', gravity: 0.12 });
screenShake(10, 500);
if (bossStage < 2) {
var heal = Math.round(HERO.maxHp * 0.6);
HERO.hp = Math.min(HERO.maxHp, HERO.hp + heal);
HERO.actionPoints = (HERO.actionPoints || 0) + 3;
showToast('⚔ Бой ' + (bossStage + 1) + '/3 пройден!', '+150 XP · Передышка: +' + heal + ' HP, +3 ОД', 'crit');
spiritSay('«Передышка. Дыши — впереди ещё два круга.»');
crucibleStartFight(bossStage + 1);
updateBossBattleUI();
updateHeroUI();
} else {
triggerBossExecution();
}
saveGameState();
}
function crucibleRunFailed() {
var failedStage = bossStage;
HERO.hp = 1;
bossStage = 0;
crucibleResetTransient();
cStanceCount = 0;
cIntent = 'quick';
bossHp = getCurrentBoss().stages[0].maxHp;
sfxFail(); haptic('heavy');
updateCombatHpBars();
updateBossIntentUI();
saveGameState();
showToast('☠ Ран провален', getCurrentBoss().name + ' восстановил все силы.', 'blood');
dungeonConfirm('☠ Ран провален',
'Ты пал в бою <b>' + (failedStage + 1) + '/3</b>.<br><br>' +
'Босс полностью восстановил силы — весь ран сгорел.<br>' +
'<span style="color:var(--gold-bright)">Копи ОД и фляги до пятницы и попробуй снова.</span>'
).then(function() { switchView('deck'); });
updateBossBattleUI();
}
function triggerHollowIfFallen() {
if (HERO.hp <= 1 && !HERO.isHollow) {
HERO.isHollow = true;
HERO.hp = 1;
showToast('💀 ТЫ ПАЛ', 'Герой выжил с 1 HP, но стал Полым. Урон -50%.', 'blood');
spiritSay('«Тьма поглотила твою силу... Но ты всё ещё дышишь.»');
var masteryCards = FORGED.filter(function(c) { return c.mastery > 0; });
if (masteryCards.length > 0) {
var victim = masteryCards[Math.floor(Math.random() * masteryCards.length)];
var lostMastery = victim.mastery;
victim.mastery = 0;
showToast('🔥 Жертва', '«' + victim.name + '» потеряла ' + lostMastery + ' мастерства (ранг сохранён)', 'blood');
renderCards();
}
}
}
function updateBossBattleUI() {
var area = document.getElementById('bossBattleArea');
if (!area) return;
var phase = getBattlePhase();
var ap = HERO.actionPoints || 0;
var boss = getCurrentBoss();
if (bossDefeated) {
area.innerHTML = '<div style="text-align:center; padding: 16px; color: var(--gold-bright); font-size: 14px;">☠ Босс повержен. Ожидание нового врага...</div>';
return;
}
if (phase === 'accumulate') {
area.innerHTML =
'<div style="display:flex; gap:12px; justify-content:center; margin-bottom:12px;">' +
'<div style="flex:1; text-align:center; padding:10px; background:rgba(96,165,250,0.1); border:1px solid rgba(96,165,250,0.3); border-radius:4px;">' +
'<div style="font-size:24px; color:#60a5fa; font-weight:bold;">' + ap + '</div>' +
'<div style="font-size:10px; color:var(--text-dim); letter-spacing:1px;">⚔ ОЧКИ ДЕЙСТВИЯ</div>' +
'</div>' +
'<div style="flex:1; text-align:center; padding:10px; background:rgba(199,62,77,0.1); border:1px solid rgba(199,62,77,0.3); border-radius:4px;">' +
'<div style="font-size:24px; color:var(--blood-bright); font-weight:bold;">' + bossRagePoints + '</div>' +
'<div style="font-size:10px; color:var(--text-dim); letter-spacing:1px;">💢 ОЧКИ ЯРОСТИ</div>' +
'</div>' +
'</div>' +
'<div style="text-align:center; font-size:11px; color:var(--text-dim); padding:8px;">' +
'⛏ Накапливай силы. Выполняй карточки — каждый успех даёт <b style="color:#60a5fa">+1 ОД</b>.<br>' +
'Пропуски дают боссу <b style="color:var(--blood-bright)">+1 Ярости</b>.<br>' +
'Схватка откроется в <b>пятницу</b>.' +
'</div>';
} else {
var deckStat = getDeckStat();
var stanceCost = (deckStat === 'wil' && (cStanceCount + 1) % 2 === 0) ? 0 : 1;
var canStance = ap >= stanceCost;
var flaskReady = !cFlaskUsed && HERO.flasks > 0;
area.innerHTML =
'<div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">' +
'<button class="action-btn" data-action="c-strike"><span>⚔</span><span>Удар</span><span class="ap-cost">—</span></button>' +
'<button class="action-btn" data-action="c-stance"' + (canStance ? '' : ' disabled') + '><span>🛡</span><span>Стойка</span><span class="ap-cost">' + (stanceCost === 0 ? 'свободно' : '1 ОД') + '</span></button>' +
'<button class="action-btn" data-action="c-focus"><span>✳</span><span>Концентрация</span><span class="ap-cost">✳</span></button>' +
'<button class="action-btn" data-action="c-flask"' + (flaskReady ? '' : ' disabled') + '><span>🧪</span><span>Фляга</span><span class="ap-cost">×' + (HERO.flasks || 0) + '</span></button>' +
'</div>' +
'<div style="text-align:center; font-size:11px; color:var(--text-dim); padding:8px; line-height:1.8;">' +
'Бой <b style="color:var(--gold-bright)">' + (bossStage + 1) + '/3</b> · ОД: <b style="color:#60a5fa">' + ap + '</b>' +
(cHeroShield > 0 ? ' · 🛡 Щит: <b style="color:#60a5fa">' + cHeroShield + '</b>' : '') +
(cFocus > 0 ? ' · ✳ Фокус: <b style="color:#c084fc">' + cFocus + '/' + cFocusMax + '</b>' : '') +
(cGuard > 0 ? ' · 🛡 Гард босса: <b style="color:var(--blood-bright)">' + cGuard + '</b>' : '') +
(cRage > 0 ? ' · 💢 Ярость: <b style="color:var(--blood-bright)">' + cRage + '</b>' : '') +
(cPoisonTicks > 0 ? ' · ☠ Яд: <b style="color:#34d399">' + cPoisonTicks + ' тик.</b>' : '') +
'<br>Колода: <b style="color:var(--gold-bright)">' + STATS[deckStat].name + '</b> · Одно действие за раунд — после него босс отвечает.' +
'</div>';
}
}
function addXpReward(amount) {
HERO.xp += amount;
HERO.totalXp += amount;
recordXpEvent(amount);
checkHeroLevelUp();
updateHeroUI();
}
document.addEventListener('mousemove', (e) => {
if (ecoOn()) return;
document.querySelectorAll('.boss-eye').forEach(eye => {
const r = eye.parentElement.getBoundingClientRect();
const cx = r.left + r.width / 2, cy = r.top + r.height * 0.32;
const dx = e.clientX - cx, dy = e.clientY - cy;
const d = Math.min(5, Math.sqrt(dx * dx + dy * dy) * 0.02);
const a = Math.atan2(dy, dx);
eye.style.transform = 'translate(' + (Math.cos(a) * d) + 'px, ' + (Math.sin(a) * d) + 'px)';
});
});
const ARTIFACTS = {
swordDiscipline: { id: 'swordDiscipline', name: 'Меч Дисциплины', icon: '⚔', rank: 'A', slot: 'weapon', type: 'Оружие', category: 'weapon', reqLevel: 6, lore: 'Выкован из стали тех обещаний, что ты сдержал.', bonuses: [{ stat: 'str', value: 5, label: '⚔ Сила' }, { stat: 'wil', value: 2, label: '🧘 Воля' }], special: '+10% к урону по боссам' },
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
if (pool.length === 0) { HERO.shards = (HERO.shards || 0) + 2; return; }
const weights = pool.map(a => a.rank === 'S' ? 1 : a.rank === 'A' ? 3 : a.rank === 'B' ? 6 : 10);
const total = weights.reduce((a, b) => a + b, 0);
let r = Math.random() * total;
let picked = pool[0];
for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { picked = pool[i]; break; } }
addArtifactToBackpack(picked);
const rc = getRankColorInfo(picked.rank);
burstParticles(x, y, 40, { color: rc.color, speed: 7, decay: 0.015, size: 3, shape: 'star', gravity: 0.1 });
}
// === Лавка осколков (CRUCIBLE ECONOMY: фляга 10💰 макс 5 · артефакты S=25/A=15/B=8💰) ===
var SHOP_PRICES = { S: 25, A: 15, B: 8 };
function itemOwned(id) {
return INVENTORY.backpack.some(b => b.id === id) || Object.values(INVENTORY.equipped).some(e => e && e.id === id);
}
function openShop() {
renderShop();
document.getElementById('shopModal').classList.add('show');
}
function closeShop() {
document.getElementById('shopModal').classList.remove('show');
}
function renderShop() {
var bal = document.getElementById('shopBalance');
if (bal) bal.textContent = 'Осколки: ' + (HERO.shards || 0);
var list = document.getElementById('shopList');
if (!list) return;
var shards = HERO.shards || 0;
var html =
'<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px; border:1px solid var(--border); border-radius:4px; margin-bottom:8px;">' +
'<div><div style="font-size:13px;">🧪 Фляга</div><div style="font-size:10px; color:var(--text-dim);">Лечит 50% HP в бою · максимум 5</div></div>' +
'<button class="demo-btn primary" data-action="buy-flask"' + ((HERO.flasks || 0) >= 5 || shards < 10 ? ' disabled' : '') + ' style="font-size:11px;">10💰</button>' +
'</div>';
Object.values(ARTIFACTS).forEach(function(a) {
if (itemOwned(a.id)) return;
var price = SHOP_PRICES[a.rank] || 15;
html +=
'<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px; border:1px solid var(--border); border-radius:4px; margin-bottom:8px;">' +
'<div><div style="font-size:13px;">' + a.icon + ' ' + esc(a.name) + ' <span style="color:' + getRankColorInfo(a.rank).color + '">[' + a.rank + ']</span></div>' +
'<div style="font-size:10px; color:var(--text-dim);">' + esc(a.type) + (a.special ? ' · ★ ' + a.special : '') + '</div></div>' +
'<button class="demo-btn primary" data-action="buy-artifact-' + a.id + '"' + (shards < price ? ' disabled' : '') + ' style="font-size:11px;">' + price + '💰</button>' +
'</div>';
});
list.innerHTML = html;
}
function buyFlask() {
if ((HERO.flasks || 0) >= 5) { showToast('🧪 Фляги полны', 'Максимум 5 фляг', 'blood'); return; }
if ((HERO.shards || 0) < 10) { showToast('💰 Мало осколков', 'Фляга стоит 10 осколков', 'blood'); sfxError(); return; }
HERO.shards -= 10;
HERO.flasks = (HERO.flasks || 0) + 1;
sfxEquip();
showToast('🧪 Фляга куплена', 'В запасе: ' + HERO.flasks + '/5', 'save');
renderShop(); renderBackpack(); updateHeroUI(); saveGameState();
}
function buyArtifact(id) {
var a = ARTIFACTS[id];
if (!a || itemOwned(id)) return;
var price = SHOP_PRICES[a.rank] || 15;
if ((HERO.shards || 0) < price) { showToast('💰 Мало осколков', 'Нужно ' + price + ' осколков', 'blood'); sfxError(); return; }
if (INVENTORY.backpack.length >= INVENTORY.maxSlots) { showToast('🎒 Рюкзак полон', 'Освободи место', 'blood'); return; }
HERO.shards -= price;
addArtifactToBackpack(a);
renderShop();
updateHeroUI();
saveGameState();
}
function drinkFlaskOutside() {
if ((HERO.flasks || 0) <= 0) { showToast('🧪 Фляг нет', 'Купи в Лавке за осколки', 'blood'); sfxError(); return; }
if (HERO.hp >= HERO.maxHp) { showToast('❤ Здоровье полное', 'Фляга не нужна'); return; }
HERO.flasks--;
var healed = Math.min(HERO.maxHp - HERO.hp, Math.round(HERO.maxHp * 0.5));
HERO.hp += healed;
haptic('light');
showToast('🧪 Фляга выпита', '+' + healed + ' HP');
renderBackpack();
updateHeroUI();
saveGameState();
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
if (shardEl) shardEl.textContent = 'Осколки: ' + (HERO.shards || 0);
var flaskBtn = document.getElementById('bpFlaskBtn');
if (flaskBtn) {
flaskBtn.textContent = '🧪 Фляга ×' + (HERO.flasks || 0);
flaskBtn.disabled = (HERO.flasks || 0) <= 0;
}
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
renderBackpack(); renderSlots(); updateTotalBonuses(); updateDamageInfo(); renderStats();
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
renderBackpack(); renderSlots(); updateTotalBonuses(); updateDamageInfo(); renderStats();
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
short:  { xp: 30, dmg: 5, statXp: 1, label: 'Краткая' },
medium: { xp: 80, dmg: 12, statXp: 2, label: 'Средняя' },
long:   { xp: 200, dmg: 25, statXp: 5, label: 'Долгая' },
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
    const goal = { id: goalIdCounter++, type: selectedGoalType, name, desc, deadline: deadline ? deadline.getTime() : null, totalSteps, currentStep: 0, steps: steps, stat: selectedGoalStat, xp: rewards.xp, dmg: rewards.dmg, statBonus: rewards.statXp, completed: false, failed: false, createdAt: Date.now(), lastStepAt: null };
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
        '<span class="dmg">⚔ <b>-' + goal.dmg + ' HP</b></span>' +
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
if (view === 'map') renderMap(escapeProgress);
if (view === 'boss') { updateBossDisplay(); updateBossBattleUI(); updateCombatHpBars(); updateBossIntentUI(); }
if (view === 'deck') renderDashboard();
if (view === 'inv') { renderBackpack(); renderSlots(); updateTotalBonuses(); }
if (view === 'deck') renderCards();
if (view === 'boss') updateBossDisplay();
if (view === 'stats') renderStatsView();
if (typeof window.__ndSetCombatActive === 'function') window.__ndSetCombatActive(view === 'boss');
}
var VIEW_ORDER = ['deck', 'hero', 'inv', 'boss', 'map', 'stats'];
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
const ROOMS = [
{ name: 'Камера заключенного', icon: '⛓', lore: 'Сырые стены, запах ржавчины и отчаяния. Здесь начинается твой путь.' },
{ name: 'Коридор Забытых', icon: '🚪', lore: 'Шаги эхом в пустоте. Здесь бродят те, кто забыл кто они.' },
{ name: 'Склеп Обетов', icon: '💀', lore: 'Здесь погребены обещания, которые ты так и не сдержал.' },
{ name: 'Зал Разбитых Зеркал', icon: '🪞', lore: 'Отражения лжи. Каждое зеркало показывает то, чем ты не стал.' },
{ name: 'Катакомбы Сомнений', icon: '🕳', lore: 'Там, где живут страхи. Узкие ходы сжимаются вокруг тебя.' },
{ name: 'Пещера Теней', icon: '🌑', lore: 'Тени шепчут твоё имя. Они знают все твои слабости.' },
{ name: 'Библиотека Рун', icon: '📜', lore: 'Знание — оружие. Книги здесь пишутся кровью прошлых узников.' },
{ name: 'Тронный Зал', icon: '👑', lore: 'Здесь правил страх. Трон пуст, но он ждёт нового хозяина.' },
{ name: 'Сад Забытых', icon: '🌺', lore: 'Мечты, что не сбылись. Цветы здесь пахнут тоской и упущенными шансами.' },
{ name: 'Мост Раскаяния', icon: '🌉', lore: 'Переправа через сомнения. Под мостом — бездна твоих ошибок.' },
{ name: 'Башня Снов', icon: '🗼', lore: 'Верх мира. Отсюда видно то, чего ты боишься больше всего.' },
{ name: 'Кузница Воли', icon: '⚒', lore: 'Здесь закаляется характер. Огонь не щадит слабых.' },
{ name: 'Алтарь Истины', icon: '🕯', lore: 'Правда о себе. Она горькая, но необходимая.' },
{ name: 'Врата Свободы', icon: '🌅', lore: 'Выход из подземелья. Свет за дверью ждёт только достойных.' }
];
const ROOM_THEMES = [
{ hue: 25, light: 3, sat: 12, mist: 0.7, torch: 0.3, rays: 0, particleColor: '#d4a574' },
{ hue: 220, light: 5, sat: 18, mist: 0.8, torch: 0.15, rays: 0, particleColor: '#8090b0' },
{ hue: 355, light: 5, sat: 22, mist: 0.65, torch: 0.25, rays: 0, particleColor: '#c04040' },
{ hue: 280, light: 7, sat: 28, mist: 0.5, torch: 0.35, rays: 0.1, particleColor: '#b060e0' },
{ hue: 120, light: 4, sat: 18, mist: 0.75, torch: 0.2, rays: 0, particleColor: '#60a060' },
{ hue: 260, light: 3, sat: 22, mist: 0.85, torch: 0.1, rays: 0, particleColor: '#7050a0' },
{ hue: 195, light: 10, sat: 35, mist: 0.4, torch: 0.4, rays: 0.2, particleColor: '#40c0e0' },
{ hue: 45, light: 14, sat: 42, mist: 0.3, torch: 0.5, rays: 0.3, particleColor: '#f0c060' },
{ hue: 160, light: 12, sat: 32, mist: 0.35, torch: 0.4, rays: 0.25, particleColor: '#50c0a0' },
{ hue: 210, light: 14, sat: 12, mist: 0.7, torch: 0.3, rays: 0.15, particleColor: '#a0b0c0' },
{ hue: 240, light: 12, sat: 38, mist: 0.3, torch: 0.45, rays: 0.4, particleColor: '#7070e0' },
{ hue: 15, light: 10, sat: 42, mist: 0.25, torch: 0.6, rays: 0.2, particleColor: '#f08030' },
{ hue: 50, light: 20, sat: 32, mist: 0.2, torch: 0.5, rays: 0.5, particleColor: '#f0e0a0' },
{ hue: 38, light: 35, sat: 45, mist: 0.1, torch: 0.7, rays: 0.7, particleColor: '#f0d080' },
];
const ESCAPE_MAX = 140;
const ROOMS_STEP = 10;
let escapeProgress = 0;
let lastDayReset = null;
function renderMap(progress) {
var container = document.getElementById('mapRooms');
if (!container) return;
container.innerHTML = '';
document.getElementById('mapProgressNum').textContent = progress;
document.getElementById('mapProgressFill').style.width = ((progress / ESCAPE_MAX) * 100) + '%';
var idx = Math.min(Math.floor(progress / ROOMS_STEP), ROOMS.length - 1);
document.getElementById('mapRoomText').textContent = ROOMS[idx].icon + ' Ты в ' + ROOMS[idx].name;
var fog = document.getElementById('mapFog');
if (fog) {
var fogPct = 20 + (progress / ESCAPE_MAX) * 60;
fog.style.background = 'radial-gradient(circle at 50% 50%, transparent ' + fogPct + '%, rgba(10,10,15,0.92) 95%)';
}
ROOMS.forEach(function(room, i) {
var unlocked = progress >= (i + 1) * ROOMS_STEP;
var current = progress >= i * ROOMS_STEP && progress < (i + 1) * ROOMS_STEP;
var el = document.createElement('div');
el.className = 'map-room ' + (unlocked ? 'unlocked' : current ? 'current' : 'locked');
el.id = 'map-room-' + i;
var remaining = current ? ((i + 1) * ROOMS_STEP - progress) : 0;
var progressInRoom = current ? (progress - i * ROOMS_STEP) : (unlocked ? ROOMS_STEP : 0);
var progressPct = Math.round((progressInRoom / ROOMS_STEP) * 100);
var badgeHtml;
if (current) badgeHtml = '<div class="map-room-badge current-badge">▶ Сейчас</div>';
else if (unlocked) badgeHtml = '<div class="map-room-badge unlocked-badge">✓</div>';
else badgeHtml = '<div class="map-room-badge locked-badge">🔒 ' + ((i + 1) * ROOMS_STEP - progress) + '</div>';
var statusHtml;
if (unlocked) statusHtml = '<div class="map-room-status">' + room.lore.split('.')[0] + '</div>';
else if (current) statusHtml = '<div class="map-room-status">Осталось ' + remaining + ' ранг-апов</div><div class="map-room-progress"><div class="map-room-progress-fill" style="width:' + progressPct + '%"></div></div>';
else statusHtml = '<div class="map-room-status">' + ((i + 1) * ROOMS_STEP - progress) + ' ранг-апов</div>';
el.innerHTML = badgeHtml +
'<div class="map-room-icon-wrap"><div class="map-room-icon">' + room.icon + '</div></div>' +
'<div class="map-room-name">' + room.name + '</div>' +
statusHtml;
el.addEventListener('click', function() {
if (unlocked || current) openRoomDetail(i);
});
container.appendChild(el);
});
setTimeout(function() { updatePlayerMarker(idx); }, 50);
}
function updatePlayerMarker(idx) {
var marker = document.getElementById('playerMarker');
if (!marker) {
marker = document.createElement('div');
marker.id = 'playerMarker';
marker.className = 'player-marker';
marker.textContent = '🗡';
document.getElementById('mapContainer').appendChild(marker);
}
var room = document.getElementById('map-room-' + idx);
var mapContainer = document.getElementById('mapContainer');
if (room && mapContainer) {
var rect = room.getBoundingClientRect();
var containerRect = mapContainer.getBoundingClientRect();
marker.style.left = (rect.left - containerRect.left + rect.width / 2 - 18) + 'px';
marker.style.top = (rect.top - containerRect.top - 28) + 'px';
}
}
function openRoomDetail(idx) {
var room = ROOMS[idx];
var currentIdx = Math.min(Math.floor(escapeProgress / ROOMS_STEP), ROOMS.length - 1);
var isCurrent = idx === currentIdx;
var unlocked = escapeProgress >= (idx + 1) * ROOMS_STEP;
var progressInRoom = isCurrent ? (escapeProgress - idx * ROOMS_STEP) : (unlocked ? ROOMS_STEP : 0);
var progressPct = Math.round((progressInRoom / ROOMS_STEP) * 100);
var statusLabel = isCurrent ? 'Текущая локация' : unlocked ? 'Пройдена' : 'Закрыта';
var statusColor = (isCurrent || unlocked) ? 'var(--green)' : 'var(--text-dim)';
document.getElementById('roomDetailTitle').textContent = room.icon + ' ' + room.name;
document.getElementById('roomDetailBody').innerHTML =
'<div class="room-detail-icon">' + room.icon + '</div>' +
'<div class="room-detail-name">' + room.name + '</div>' +
'<div class="room-detail-lore">' + room.lore + '</div>' +
'<div class="room-detail-stats">' +
'<div class="room-detail-stat"><div class="room-detail-stat-label">Позиция</div><div class="room-detail-stat-value">' + (idx + 1) + ' / ' + ROOMS.length + '</div></div>' +
'<div class="room-detail-stat"><div class="room-detail-stat-label">Статус</div><div class="room-detail-stat-value" style="color:' + statusColor + '">' + statusLabel + '</div></div>' +
'</div>' +
(isCurrent ? '<div style="padding: 10px; background: rgba(251, 191, 36, 0.1); border: 1px solid var(--gold); border-radius: 4px; text-align: center;"><div style="font-size: 10px; letter-spacing: 2px; color: var(--gold); text-transform: uppercase; margin-bottom: 4px;">Прогресс локации</div><div style="font-size: 22px; color: var(--gold-bright); font-weight: bold;">' + progressPct + '%</div></div>' : '');
document.getElementById('roomDetailModal').classList.add('show');
}
function closeRoomDetail() { document.getElementById('roomDetailModal').classList.remove('show'); }
renderMap(0);
function updateEscapeDisplay() {
document.getElementById('progressVal').textContent = escapeProgress + ' / ' + ESCAPE_MAX;
document.getElementById('mapProgressNum').textContent = escapeProgress;
document.getElementById('mapProgressFill').style.width = ((escapeProgress / ESCAPE_MAX) * 100) + '%';
updateProgressFill((escapeProgress / ESCAPE_MAX) * 100);
const idx = Math.min(Math.floor(escapeProgress / ROOMS_STEP), ROOMS.length - 1);
document.getElementById('mapRoomText').textContent = 'Ты в: ' + ROOMS[idx].name;
updateAtmosphereByEscape();
}
var currentRoomIndex = 0;
function updateAtmosphereByEscape() {
var idx = Math.min(Math.floor(escapeProgress / ROOMS_STEP), ROOM_THEMES.length - 1);
if (idx === currentRoomIndex) return;
currentRoomIndex = idx;
var theme = ROOM_THEMES[idx];
var root = document.documentElement.style;
root.setProperty('--atmosphere-hue', theme.hue);
root.setProperty('--atmosphere-light', theme.light);
root.setProperty('--atmosphere-sat', theme.sat);
root.setProperty('--mist-opacity', theme.mist);
root.setProperty('--torch-intensity', theme.torch);
root.setProperty('--light-rays-opacity', theme.rays);
dustParticles.forEach(function(d) { d.color = theme.particleColor; });
document.querySelectorAll('.boss-sprite').forEach(function(s) {
s.style.filter = 'hue-rotate(' + (theme.hue - 25) + 'deg)';
});
}
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
function getMSKDate(ts) { return new Date((ts || Date.now()) + MSK_OFFSET_MS); }
function getMSKDayKey(ts) {
const d = getMSKDate(ts);
return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
function updateBossDisplay() {
const boss = getCurrentBoss();
const stage = boss.stages[bossStage];
var phase = getBattlePhase();
var phaseLabel = getBattlePhaseLabel();
document.getElementById('bossPanelTitle').textContent = boss.icon + ' ' + boss.name + (bossDefeated ? ' (ПОВЕРЖЕН)' : ' (Стадия ' + (bossStage + 1) + '/3)');
const viewBossTitle = document.querySelector('#view-boss .view-title');
    if (viewBossTitle) viewBossTitle.textContent = boss.icon + ' Босс локации · ' + phaseLabel;
    document.getElementById('bossSubtitle').textContent = boss.name + ' · ' + phaseLabel;
document.getElementById('bossLoreText').innerHTML =
'<b style="color:var(--blood-bright)">«' + stage.desc + '»</b><br><br>' +
'<b style="color:#60a5fa">⛏ Пн–Чт: Накопление</b><br>' +
'• Выполняй карточки → <b style="color:#60a5fa">+1 ОД</b> за каждую<br>' +
'• Пропуски → <b style="color:var(--blood-bright)">+1 Ярость</b> боссу<br>' +
'• Невыполненные за день → <b style="color:var(--blood-bright)">+1 Ярость</b> каждая<br><br>' +
'<b style="color:var(--gold-bright)">⚔ Пт–Вс: Схватка — ран из 3 боёв</b><br>' +
'• Одно действие за раунд: ⚔ Удар · 🛡 Стойка (1 ОД) · ✳ Концентрация · 🧪 Фляга<br>' +
'• Босс телеграфирует удар — стойка и фляга решают, кто переживёт ран<br>' +
'• Победа в бою: +150 XP и передышка (+60% HP, +3 ОД)<br>' +
'• Падение в бою = ран провален: босс восстанавливает все силы<br><br>' +
'Экипируй артефакты в <b style="color:var(--gold-bright)">Инвентаре</b> для увеличения урона.';
}
function updatePunishCountdown() {
var el = document.getElementById('punishCountdown');
if (!el) return;
var phase = getBattlePhase();
el.textContent = phase === 'battle' ? '⚔ Фаза схватки активна!' : '⛏ Накопление сил. Схватка в пятницу.';
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
var bossWins = buildBossWinStats();
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
bossWins +
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
function buildBossWinStats() {
var bosses = [
{ name: '🐍 Змей Лени', range: '0-39', kills: 0 },
{ name: '📱 Демон Соцсетей', range: '40-79', kills: 0 },
{ name: '🔥 Химера Выгорания', range: '80+', kills: 0 }
];
var bk = window._bossKills;
if (bk && typeof bk === 'object' && !Array.isArray(bk)) {
    bosses[0].kills = Number(bk.snake) || 0;
    bosses[1].kills = Number(bk.social) || 0;
    bosses[2].kills = Number(bk.chimera) || 0;
}
var html = '<div style="background:rgba(0,0,0,0.3);border:1px solid var(--border);padding:16px;margin-bottom:20px;">';
html += '<div style="font-size:11px;letter-spacing:2px;color:var(--text-dim);text-transform:uppercase;margin-bottom:12px;">💀 Победы над боссами</div>';
bosses.forEach(function(b) {
var barW = Math.min(100, b.kills * 20);
html += '<div style="margin-bottom:8px;">';
html += '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;"><span>' + b.name + '</span><span style="color:var(--blood-bright);">' + b.kills + ' побед</span></div>';
html += '<div style="height:6px;background:rgba(255,255,255,0.05);border-radius:3px;"><div style="height:100%;width:' + barW + '%;background:var(--blood-bright);border-radius:3px;"></div></div>';
html += '</div>';
});
html += '</div>';
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
{ id: 'escape_half', icon: '🗝', name: 'Полпути', desc: 'Прогресс побега 50%+', check: escapeProgress >= 70 },
{ id: 'escape_full', icon: '🌅', name: 'Свобода', desc: 'Достичь Врат Свободы', check: escapeProgress >= ESCAPE_MAX },
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
escapeProgress: escapeProgress, bossHp: bossHp, bossStage: bossStage,
bossDefeated: bossDefeated, xpHistory: xpHistory
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
    var phase = getBattlePhase();
    var phaseLabel = phase === 'battle' ? '⚔ Фаза схватки' : '⛏ Фаза накопления';
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
        '<div>📊 <b>Текущая фаза:</b> ' + phaseLabel + '</div>' +
        '<div>⚔ <b>Очки действия:</b> ' + (HERO.actionPoints || 0) + ' · 💢 <b>Ярость:</b> ' + bossRagePoints + '</div>' +
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
                '✅ За выполнение: +15 XP, +1 ОД, +1 очко атрибута',
                '✅ За ранг-ап: карточка растёт, +1 очко атрибута, +1 к побегу',
                '⚠️ За пропуск: босс получает +1 ярость (минус твоё HP в пятницу)',
                '⚠️ За пропуск: стрик сбрасывается (но Волей можно защитить)',
                '🔥 Стрик: каждый день делает карточку сильнее (макс ×2)',
                '⛏ Пн–Чт: копишь ОД. ⚔ Пт–Вс: тратишь ОД на удары боссу'
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
                '✅ За выполнение: +15 XP, +1 ОД, +1 очко атрибута',
                '✅ За ранг-ап: +1 очко атрибута, +1 к побегу',
                '⚠️ За пропуск: +1 ярость боссу',
                '⚠️ За пропуск: стрик сбрасывается (но Волей можно защитить)',
                '🔥 Стрик: каждый день делает карточку сильнее (макс ×2)'
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
    var phaseText = (getBattlePhase() === 'battle') ? '⚔ Сейчас фаза схватки — атакуй босса.' : '⛏ Копишь силы: каждый день даёт тебе ОД.';
    return '<div style="padding-right:22px;">' +
        '<div style="color:var(--gold-bright); font-size:13px; margin-bottom:4px;">⚔ УРОВЕНЬ ' + Math.max(1, HERO.level) + '</div>' +
        '<div>' + phaseText + '</div>' +
        '<div style="margin-top:6px;">📖 Сегодня сделано: <b>' + doneToday + '</b> из <b>' + FORGED.length + '</b> · осталось <b>' + remaining + '</b></div>' +
        '<div style="margin-top:6px; font-size:10px; color:var(--text-dim);">✅ За выполнение: <b style="color:#34d399">+15 XP · +1 ОД · +1 очко атрибута</b></div>' +
        '<div style="font-size:10px; color:var(--text-dim);">⚠️ За пропуск: <b style="color:var(--blood-bright)">+1 ярость боссу</b> и стрик сбросится</div>' +
        '</div>';
}

function renderDashboardVeteran() {
    var phase = getBattlePhase();
    var todayKey = getMSKDayKey();
    var doneToday = FORGED.filter(function(c) { return c.lastCompletedAt && getMSKDayKey(c.lastCompletedAt) === todayKey; }).length;
    var remaining = FORGED.length - doneToday;
    var phaseIcon = phase === 'battle' ? '⚔' : '⛏';
    var phaseText = phase === 'battle' ? 'Фаза схватки (Пт–Вс)' : 'Фаза накопления (Пн–Чт)';
    var daysToBattle = '';
    if (phase !== 'battle') {
        var msk = new Date(Date.now() + 3 * 3600000);
        var day = msk.getUTCDay();
        var daysLeft = day === 0 ? 0 : day === 1 ? 4 : day === 2 ? 3 : day === 3 ? 2 : day === 4 ? 1 : 0;
        daysToBattle = ' · До схватки: ' + (daysLeft === 0 ? 'завтра!' : daysLeft + ' дн.');
    }
    var oathProgress = bloodOath && bloodOath.status === 'active' ? ' · 🩸 Клятва ' + bloodOath.streak + '/' + bloodOath.requiredDays : '';
    var comboMult = getComboMultiplier();
    var comboInfo = comboMult > 1.0 ? ' · 🎯 Комбо ×' + comboMult.toFixed(2) : '';
    var maxStreak = FORGED.reduce(function(m, c) { return Math.max(m, c.streak || 0); }, 0);
    return '<div style="padding-right:22px;">' +
        '<div class="dashboard-row"><span>' + phaseIcon + ' ' + phaseText + daysToBattle + '</span></div>' +
        '<div class="dashboard-row"><span>⚔ ОД: <b style="color:#60a5fa">' + (HERO.actionPoints||0) + '</b></span><span>💢 Ярость: <b style="color:var(--blood-bright)">' + bossRagePoints + '</b></span><span>📖 ' + doneToday + '/' + FORGED.length + ' сегодня' + (remaining > 0 ? ' (осталось ' + remaining + ')' : '') + '</span></div>' +
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
        '<div>⚔ <b>ОД накоплено:</b> ' + (HERO.actionPoints||0) + ' · 💢 <b>Ярость:</b> ' + bossRagePoints + '</div>' +
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
if (lastDayReset !== null) {
const allCards = [...FORGED];
const uncompletedCards = allCards.filter(c => {
if (!c.lastCompletedAt) return true;
return getMSKDayKey(c.lastCompletedAt) !== lastDayReset;
});
if (uncompletedCards.length > 0) {
bossRagePoints += uncompletedCards.length;
showToast('💢 Ярость босса', '+' + uncompletedCards.length + ' очков ярости за невыполненные карточки (всего: ' + bossRagePoints + ')', 'blood');
}
}
        if (HERO.dailyCompletions > 0 && HERO.dailySkips === 0) {
HERO.consecutivePerfectDays = (HERO.consecutivePerfectDays || 0) + 1;
} else {
HERO.consecutivePerfectDays = 0;
}
if (HERO.isHollow && HERO.consecutivePerfectDays >= 3) {
HERO.isHollow = false;
HERO.hp = Math.floor(HERO.maxHp * 0.3);
showToast('✨ Искупление совершено!', 'Вы вернули свою человечность. HP восстановлено.', 'crit');
spiritSay('«Тьма отступает. Ты снова чувствуешь тепло.»');
screenShake(8, 400);
}
HERO.dailyCompletions = 0;
HERO.dailySkips = 0;
HERO.dailyUniqueStats = {};
chimeraShield = 3;
var currentMonday = getThisMondayKey();
if (lastWeekReset !== currentMonday) {
if (bossRagePoints > 0) {
var weeklyRageDmg = bossRagePoints * (8 + bossStage * 4);
HERO.hp = Math.max(1, HERO.hp - weeklyRageDmg);
sfxBossHit(); haptic('heavy');
showToast('💢 Ночная расплата', 'Босс обрушил накопленную ярость: -' + weeklyRageDmg + ' HP (Ярость: ' + bossRagePoints + ')', 'blood');
triggerHollowIfFallen();
updateHeroUI();
}
HERO.actionPoints = 0;
bossRagePoints = 0;
lastWeekReset = currentMonday;
showToast('🗓 Новая неделя', 'Очки действия и ярости сброшены', 'save');
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
lastDayReset = todayKey;
saveGameState();
renderCards();
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
            var rageGain = goal.dmg;
            bossRagePoints += rageGain;
            screenShake(10, 600);
            spawnBloodRain(20);
            sfxFail(); haptic('error');
            showToast('💀 Цель провалена!', '«' + goal.name + '» — треснула. +' + rageGain + ' Ярости боссу', 'blood');
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
checkDailyReset(); updatePunishCountdown(); checkBloodOath();
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
new Notification('NeuroDeck ⚔', { body: 'Осталось ' + uncompleted.length + ' карточек! Босс атакует через 1 час.', icon: '🗡', tag: 'nd-warn' });
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
    ['perfAutoBtn','perfLowBtn','perfOffBtn'].forEach(function(id){
        var b = document.getElementById(id);
        if (b) { b.style.borderColor = (b.dataset.mode === m) ? 'var(--gold-bright)' : ''; b.style.background = (b.dataset.mode === m) ? 'rgba(212,165,116,0.15)' : ''; }
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
document.getElementById('roomDetailModal').addEventListener('click', (e) => { if (e.target.id === 'roomDetailModal') closeRoomDetail(); });
document.getElementById('syncFileInput').addEventListener('change', importSyncFile);
document.addEventListener('keydown', (e) => {
if ((e.ctrlKey || e.metaKey) && e.key === 's') {
e.preventDefault();
openSyncModal();
}
});
var MODAL_CLOSE_FNS = {
goalModal: closeGoalModal, forgeModal: closeForge, editCardModal: closeEditCard,
syncModal: closeSyncModal, roomDetailModal: closeRoomDetail, returnModal: closeReturnModal,
evolutionModal: closeEvolutionModal, weeklyReportModal: closeWeeklyReportModal,
starterDeckModal: closeStarterDeck, shopModal: closeShop
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
resizeDust(); window.addEventListener('resize', function() { resizeDust(); var idx = Math.min(Math.floor(escapeProgress / ROOMS_STEP), ROOMS.length - 1); setTimeout(function() { updatePlayerMarker(idx); }, 100); });
class Dust {
constructor() { this.x = Math.random() * dustCanvas.width; this.y = Math.random() * dustCanvas.height; this.vx = (Math.random() - 0.5) * 0.3; this.vy = -0.1 - Math.random() * 0.2; this.size = 0.5 + Math.random() * 1.5; this.alpha = 0.2 + Math.random() * 0.4; this.color = ROOM_THEMES[currentRoomIndex].particleColor; }
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
{ icon: '⚔', title: 'Добро пожаловать в NeuroDeck', text: 'Это геймифицированный трекер привычек.<br>Ты — узник подземелья. Твоё оружие — дисциплина.' },
{ icon: '📖', title: 'Колода карточек', text: 'Каждая карточка — привычка, которую нужно выполнять ежедневно.<br>Нажми <b>✓</b> чтобы выполнить, <b>✕</b> чтобы пропустить.<br>Пропуск = босс копит <b style="color:var(--blood-bright)">Ярость</b>.' },
{ icon: '🔥', title: 'Ранги и мастерство', text: 'Выполняй карточку — растёт Мастерство.<br>При достижении порога карточка повышает ранг: C → CC → CCC → B → ... → SSS.<br>Ранг-ап = +1 к пулу атрибута.' },
{ icon: '🐍', title: 'Босс подземелья', text: 'Бой идёт <b>понедельно</b>:<br>⛏ <b>Пн–Чт</b> — накапливай <b style="color:#60a5fa">Очки Действия</b> за выполнение карточек.<br>⚔ <b>Пт–Вс</b> — босс-ран из 3 боёв: Удар бесплатен, Стойка — 1 ОД, следи за телеграфами босса.' },
{ icon: '👤', title: 'Герой и атрибуты', text: '5 очков пула = +1 к атрибуту.<br>Сила = урон, Интеллект = XP бонус, Харизма = шанс крита.<br>Уровень даёт +6 к максимальному HP и лечение.' },
{ icon: '🎯', title: 'Цели', text: 'Ставь цели с дедлайном и текстовыми шагами.<br>Выполнение цели = опыт + очки атрибута.<br>Провал по дедлайну = +Ярость боссу.' },
{ icon: '🎒', title: 'Инвентарь', text: 'Случайные артефакты падают при выполнении карточек.<br>Экипируй их для бонусов к атрибутам.<br>Все бонусы суммируются.' },
{ icon: '🚀', title: 'Начни свой побег', text: 'Ты в Камере заключенного. Выкуй первую карточку — и начни свой путь к Вратам Свободы.<br><br><span style="color:var(--gold-bright)">Да пребудет с тобой дисциплина.</span>' }
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
spiritSay('«Ты очнулся в Камере заключенного... Выкуй первое испытание.»');
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
loadGameState();
checkDailyReset();
checkBloodOath();
if (bossDefeated) {
bossDefeated = false;
bossStage = 0;
chimeraShield = 3;
const newBoss = getCurrentBoss();
    bossHp = newBoss.stages[0].maxHp;
    saveGameState();
}
// Crucible: транзиент боя не сохраняется — текущий бой начинается заново
crucibleResetTransient();
cStanceCount = 0;
cIntent = 'quick';
bossHp = getCurrentBoss().stages[bossStage].maxHp;
updateBossIntentUI();
HERO.maxHp = calcMaxHp();
if (HERO.hp > HERO.maxHp) HERO.hp = HERO.maxHp;
HERO.xpToNext = getXpToNext(HERO.level);
renderStats();
updateHeroUI();
renderGoals();
updateDamageInfo();
updateEscapeDisplay();
renderMap(escapeProgress);
renderCards();
renderDashboard();
updateBossDisplay();
changeBossHp(0);
initCombatCanvas();
updateCombatHpBars();
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
spiritSay('«Ты очнулся в Камере заключенного... Выкуй первое испытание.»');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 30, { color: '#d4a574', speed: 4, decay: 0.015, size: 2, shape: 'spark', gravity: 0.05 });
}, 800);
}