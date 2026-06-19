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
const HERO_XP_CURVE = [50, 100, 200, 380, 700, 1300, 2400, 4500, 8500, 16000, 30000, 58000, 110000, 200000, 360000];
function getXpToNext(level) {
if (level - 1 < HERO_XP_CURVE.length) return HERO_XP_CURVE[level - 1];
return Math.floor(HERO_XP_CURVE[HERO_XP_CURVE.length - 1] * Math.pow(1.8, level - HERO_XP_CURVE.length));
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
level: 1, xp: 0, xpToNext: 50, totalXp: 0,
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
const LOOT_CHANCE = 0.05;
function getLootChance(card) { return 0.05 + Math.min(0.05, (card.streak || 0) * 0.0025); }
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
case 'close-return-modal': closeReturnModal(); break;
case 'close-evolution-modal': closeEvolutionModal(); break;
case 'apply-evolution-depth': applyEvolution('depth'); break;
case 'apply-evolution-frequency': applyEvolution('frequency'); break;
case 'apply-evolution-stability': applyEvolution('stability'); break;
case 'evolution-skip': closeEvolutionModal(); var ecid = parseInt(document.getElementById('evolutionModal').dataset.cardId); if (ecid) openEditCardAfterRankup(ecid); break;
case 'prestige-card': prestigeCard(parseInt(el.dataset.id)); break;
case 'close-weekly-report': closeWeeklyReportModal(); break;
case 'close-room-detail': closeRoomDetail(); break;
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
case 'attack-boss': attackBoss(); break;
case 'end-boss-turn': endBossTurn(); break;
case 'complete-card': completeCard(e, parseInt(el.dataset.id)); break;
case 'fail-card': failCard(e, parseInt(el.dataset.id)); break;
case 'edit-card': openEditCardDirect(parseInt(el.dataset.id)); break;
case 'delete-card': deleteCard(parseInt(el.dataset.id)); break;
case 'equip-item': equipItem(el.dataset.uid); break;
case 'unequip-item': unequipItem(el.dataset.slot); break;
case 'discard-item': discardItem(el.dataset.uid); break;
case 'advance-goal': advanceGoal(parseInt(el.dataset.id)); break;
case 'toggle-goal-step': toggleGoalStep(parseInt(el.dataset.id), parseInt(el.dataset.step)); break;
case 'complete-goal': completeGoal(parseInt(el.dataset.id)); break;
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
const r = el.getBoundingClientRect();
const x = e.clientX - r.left, y = e.clientY - r.top;
el.style.transform = 'perspective(800px) rotateX(' + (-(y-r.height/2)/r.height*14) + 'deg) rotateY(' + ((x-r.width/2)/r.width*14) + 'deg) translateZ(4px)';
el.style.setProperty('--mx', ((x/r.width)*100) + '%');
el.style.setProperty('--my', ((y/r.height)*100) + '%');
});
el.addEventListener('mouseleave', () => { el.style.transform = ''; });
el.addEventListener('touchmove', (e) => {
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
spawnBloodRain(15);
screenShake(6, 300);
sfxFail(); haptic('error');
HERO.dailySkips++;
const gear = getTotalGearBonuses();
const totalWil = STATS.wil.value + gear.wil;
if (Math.random() < (totalWil / 300)) {
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
if (bloodOath && bloodOath.cardId === id) {
bloodOath = null;
showToast('🩸 Клятва отменена', 'Карточка клятвы удалена вручную', 'blood');
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
const gear = getTotalGearBonuses();
const sumAllStats = Object.values(STATS).reduce((a, s) => a + s.value, 0);
const totalStr = STATS.str.value + gear.str;
const totalCha = STATS.cha.value + gear.cha;
const bonus = Math.floor(sumAllStats * 0.5) + Math.floor(gear.str / 5);
const total = BASE_DAMAGE + bonus;
const critChance = Math.min(0.5, totalCha * 0.02);
document.getElementById('damageInfo').innerHTML =
'Базовый: <b style="color:var(--gold-bright)">' + BASE_DAMAGE + '</b><br>' +
'Сумма атрибутов × 0.5: <b style="color:var(--gold-bright)">+' + Math.floor(sumAllStats*0.5) + '</b><br>' +
'+ снаряга: <b style="color:var(--gold-bright)">+' + Math.floor(gear.str/5) + '</b><br>' +
'Шанс крита: <b style="color:var(--gold-bright)">' + Math.round(critChance*100) + '%</b><br>' +
(HERO.isHollow ? '<b style="color:var(--blood-bright)">Полый: урон -50%</b><br>' : '') +
'Итого: <b style="color:var(--blood-bright)">' + total + '</b> за атаку (фаза схватки)';
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
showToast('🏆 Уровень ' + HERO.level, '+1 ко всем атрибутам · HP восстановлено · Следующий: ' + HERO.xpToNext + ' XP');
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
hintEl.innerHTML = '🔥 Бонус стика: <b style="color:var(--gold-bright)">' + streakInfo1.label + '</b>. Каждый день выполнения = +5% XP (макс ×2.0). Пропуск обнуляет стик!';
const warningEl = document.getElementById('editCardWarning');
if (streakMult1 > 1.0) {
warningEl.style.display = 'block';
warningEl.innerHTML = '⚠ Ранг повышен! Усложни карточку (увеличь время/порог). Текущий стик: <b>' + (card.streak || 0) + ' дней</b>.';
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
    hintEl.innerHTML = '🔥 Бонус стика: <b style="color:var(--gold-bright)">' + streakInfo.label + '</b>. Каждый день выполнения = +5% XP (макс ×2.0). Пропуск обнуляет стик!';
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
let chimeraShield = 5;
let bossRagePoints = 0;
var lastWeekReset = getThisMondayKey();
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
function getCurrentBoss() {
if (escapeProgress < 40) return {
name: 'Змей Лени', icon: '🐍', type: 'normal',
stages: [
{ hp: 100, maxHp: 100, dmgMult: 1, animClass: 'boss-anim-stage1', desc: '«Я питаюсь твоим бездействием.»' },
{ hp: 150, maxHp: 150, dmgMult: 1.5, animClass: 'boss-anim-stage2', desc: '«Ты думаешь, это было сложно? Я лишь разогревался.»' },
{ hp: 200, maxHp: 200, dmgMult: 2.0, animClass: 'boss-anim-stage3', desc: '«НЕВОЗМОЖНО! Я ПОГЛОЩУ ТЕБЯ ЦЕЛИКОМ!»' }
]
};
if (escapeProgress < 80) return {
name: 'Демон Соцсетей', icon: '📱', type: 'social',
stages: [
{ hp: 120, maxHp: 120, dmgMult: 1, animClass: 'boss-anim-stage1', desc: '«Твой скролл — моя пища.»' },
{ hp: 180, maxHp: 180, dmgMult: 1.5, animClass: 'boss-anim-stage2', desc: '«Ещё один свайп, и ты мой!»' },
{ hp: 250, maxHp: 250, dmgMult: 2.0, animClass: 'boss-anim-stage3', desc: '«ТЫ НЕ МОЖЕШЬ УЙТИ ОТ ЛЕНТЫ!»' }
]
};
return {
name: 'Химера Выгорания', icon: '🔥', type: 'chimera',
stages: [
{ hp: 150, maxHp: 150, dmgMult: 1, animClass: 'boss-anim-stage1', desc: '«У тебя нет сил...»' },
{ hp: 220, maxHp: 220, dmgMult: 1.5, animClass: 'boss-anim-stage2', desc: '«Твоя мотивация иссякла.»' },
{ hp: 300, maxHp: 300, dmgMult: 2.0, animClass: 'boss-anim-stage3', desc: '«СГОРИ В ПЕПЛЕ РУТИНЫ!»' }
]
};
}
function changeBossHp(delta) {
if (bossDefeated) return;
const boss = getCurrentBoss();
    const stage = boss.stages[bossStage];
    if (boss.type === 'chimera' && chimeraShield > 0) {
        chimeraShield--;
        if (chimeraShield > 0) {
            showToast('🛡 Щит Химеры!', 'Осталось ударов: ' + chimeraShield, 'blood');
            return;
        }
    }
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
bossStage = 0;
chimeraShield = 5;
bossRagePoints = 0;
HERO.actionPoints = 0;
const newBoss = getCurrentBoss();
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
var combatCanvas = null, combatCtx = null, combatRafId = null;
var combatImages = { bg: null, hero: null, boss: null };
var combatLoaded = false;
var combatState = {
    heroX: 0.18, heroBaseY: 0.88,
    bossX: 0.78, bossBaseY: 0.88,
    heroScale: 1.0, bossScale: 1.15,
    heroAnim: 'idle', bossAnim: 'idle',
    heroAnimStart: 0, bossAnimStart: 0,
    heroOffsetX: 0, heroOffsetY: 0, heroRot: 0,
    bossOffsetX: 0, bossOffsetY: 0, bossRot: 0,
    heroSquashX: 1, heroSquashY: 1, bossSquashX: 1, bossSquashY: 1,
    heroFilter: '', bossFilter: '',
    flashAlpha: 0, flashColor: '255,255,255',
    shakeX: 0, shakeY: 0, shakeAmount: 0,
    hitStop: 0,
    torchFlicker: 1.0, fogOffset: 0,
    slashArc: null,
    impactRings: [],
    chromaticAberration: 0,
    bossAuraAlpha: 0, rageVignette: 0,
    heroHpPct: 1.0, bossHpPct: 1.0,
    heroHpText: '', bossHpText: '',
    bossName: 'Змей Лени',
    particles: [], embers: [], damageNumbers: [],
    defeated: false
};
function initCombatCanvas() {
    combatCanvas = document.getElementById('combatCanvas');
    if (!combatCanvas) return;
    combatCtx = combatCanvas.getContext('2d');
    var loaded = 0;
    var urls = {
        bg: 'bg-optimized.jpg?v=34',
        hero: 'hero-cutout.png?v=34',
        boss: 'snake-cutout.png?v=34'
    };
    Object.keys(urls).forEach(function(key) {
        var img = new Image();
        img.onload = function() {
            combatImages[key] = img;
            loaded++;
            if (loaded === 3) {
                combatLoaded = true;
                var el = document.getElementById('combatLoading');
                if (el) el.style.display = 'none';
                if (!combatRafId) combatRafId = requestAnimationFrame(renderCombat);
            }
        };
        img.onerror = function() { loaded++; };
        img.src = urls[key];
    });
    for (var i = 0; i < 20; i++) spawnEmber();
    setInterval(function() { if (Math.random() < 0.3) spawnEmber(); }, 300);
}
function spawnEmber() {
    combatState.embers.push({
        x: Math.random(), y: 0.9 + Math.random() * 0.1,
        vx: (Math.random() - 0.5) * 0.0008,
        vy: -0.002 - Math.random() * 0.003,
        size: 1 + Math.random() * 2.5,
        life: 1, decay: 0.003 + Math.random() * 0.004,
        color: Math.random() < 0.5 ? '255,160,60' : '255,100,40'
    });
}
function spawnCombatParticles(x, y, count, color, speed) {
    for (var i = 0; i < count; i++) {
        var a = Math.random() * Math.PI * 2;
        var sp = speed * (0.3 + Math.random() * 0.7);
        combatState.particles.push({
            x: x, y: y,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            size: 2 + Math.random() * 4,
            life: 1, decay: 0.015 + Math.random() * 0.02,
            color: color, gravity: 0.15
        });
    }
}
function spawnDamageNumber(x, y, text, color) {
    combatState.damageNumbers.push({
        x: x, y: y, vy: -0.015,
        text: text, color: color || '#fbbf24',
        life: 1, decay: 0.012
    });
}
function renderCombat(ts) {
    if (!combatLoaded) { combatRafId = requestAnimationFrame(renderCombat); return; }
    var w = combatCanvas.width, h = combatCanvas.height;
    var frozen = ts < combatState.hitStop;
    combatCtx.clearRect(0, 0, w, h);
    if (!frozen) {
        combatState.torchFlicker = 0.85 + Math.sin(ts * 0.008) * 0.08 + Math.sin(ts * 0.023) * 0.05 + Math.random() * 0.04;
        combatState.fogOffset = (combatState.fogOffset + 0.0003) % 1;
    }
    var flicker = combatState.torchFlicker;
    if (!frozen) {
        if (combatState.shakeAmount > 0.5) {
            combatState.shakeX = (Math.random() - 0.5) * combatState.shakeAmount;
            combatState.shakeY = (Math.random() - 0.5) * combatState.shakeAmount;
            combatState.shakeAmount *= 0.85;
        } else { combatState.shakeX = 0; combatState.shakeY = 0; }
        if (combatState.heroSquashX !== 1) { combatState.heroSquashX += (1 - combatState.heroSquashX) * 0.2; combatState.heroSquashY += (1 - combatState.heroSquashY) * 0.2; }
        if (combatState.bossSquashX !== 1) { combatState.bossSquashX += (1 - combatState.bossSquashX) * 0.2; combatState.bossSquashY += (1 - combatState.bossSquashY) * 0.2; }
        if (combatState.chromaticAberration > 0.5) combatState.chromaticAberration *= 0.8; else combatState.chromaticAberration = 0;
        if (combatState.slashArc) { combatState.slashArc.progress += 0.08; if (combatState.slashArc.progress >= 1) combatState.slashArc = null; }
        for (var ri = combatState.impactRings.length - 1; ri >= 0; ri--) { combatState.impactRings[ri].radius += 8; combatState.impactRings[ri].alpha -= 0.04; if (combatState.impactRings[ri].alpha <= 0) combatState.impactRings.splice(ri, 1); }
        if (bossStage >= 1) { combatState.bossAuraAlpha = 0.15 + Math.sin(ts * 0.004) * 0.08; } else combatState.bossAuraAlpha = 0;
        combatState.rageVignette = combatState.bossHpPct < 0.3 ? 0.2 + Math.sin(ts * 0.006) * 0.1 : 0;
    }
    combatCtx.save();
    combatCtx.translate(combatState.shakeX, combatState.shakeY);
    if (combatImages.bg) combatCtx.drawImage(combatImages.bg, 0, 0, w, h);
    var torchX = w * 0.12, torchY = h * 0.35;
    var grad = combatCtx.createRadialGradient(torchX, torchY, 30, torchX, torchY, w * 0.55 * flicker);
    grad.addColorStop(0, 'rgba(255,160,60,' + (0.15 * flicker) + ')');
    grad.addColorStop(0.5, 'rgba(180,80,20,' + (0.05 * flicker) + ')');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    combatCtx.fillStyle = grad;
    combatCtx.fillRect(0, 0, w, h);
    var grad2 = combatCtx.createRadialGradient(w*0.78, h*0.5, 40, w*0.78, h*0.5, w*0.45);
    grad2.addColorStop(0, 'rgba(80,20,20,0.18)');
    grad2.addColorStop(1, 'rgba(0,0,0,0)');
    combatCtx.fillStyle = grad2;
    combatCtx.fillRect(0, 0, w, h);
    if (!frozen) updateCombatAnim(ts);
    if (combatState.bossAuraAlpha > 0) {
        var bx = combatState.bossX * w, by = (combatState.bossBaseY - 0.25) * h;
        var auraGrad = combatCtx.createRadialGradient(bx, by, 20, bx, by, w * 0.25);
        var auraCol = bossStage >= 2 ? '180,40,40' : '120,40,160';
        auraGrad.addColorStop(0, 'rgba(' + auraCol + ',' + combatState.bossAuraAlpha + ')');
        auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
        combatCtx.fillStyle = auraGrad;
        combatCtx.fillRect(0, 0, w, h);
    }
    drawCombatShadow(combatState.heroX * w, combatState.heroBaseY * h, 80 * combatState.heroScale, flicker);
    drawCombatShadow(combatState.bossX * w, combatState.bossBaseY * h, 100 * combatState.bossScale, 1);
    drawCombatChar('boss', ts);
    drawCombatChar('hero', ts);
    drawCombatChar('boss', ts, true);
    if (combatState.slashArc) drawSlashArc(w, h);
    for (var i2 = 0; i2 < combatState.impactRings.length; i2++) {
        var ring = combatState.impactRings[i2];
        combatCtx.save();
        combatCtx.globalAlpha = ring.alpha;
        combatCtx.strokeStyle = ring.color;
        combatCtx.lineWidth = 3;
        combatCtx.shadowBlur = 15;
        combatCtx.shadowColor = ring.color;
        combatCtx.beginPath();
        combatCtx.arc(ring.x * w, ring.y * h, ring.radius, 0, Math.PI * 2);
        combatCtx.stroke();
        combatCtx.restore();
    }
    for (var i = combatState.particles.length - 1; i >= 0; i--) {
        var p = combatState.particles[i];
        if (!frozen) { p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.life -= p.decay; }
        if (p.life <= 0) { combatState.particles.splice(i, 1); continue; }
        combatCtx.save();
        combatCtx.globalAlpha = p.life;
        combatCtx.fillStyle = 'rgb(' + p.color + ')';
        combatCtx.shadowBlur = 10;
        combatCtx.shadowColor = 'rgb(' + p.color + ')';
        combatCtx.beginPath();
        combatCtx.arc(p.x * w, p.y * h, p.size * p.life, 0, Math.PI * 2);
        combatCtx.fill();
        if (p.trail) { combatCtx.globalAlpha = p.life * 0.3; combatCtx.beginPath(); combatCtx.arc((p.x - p.vx*3) * w, (p.y - p.vy*3) * h, p.size * 0.5, 0, Math.PI * 2); combatCtx.fill(); }
        combatCtx.restore();
    }
    for (var j = combatState.embers.length - 1; j >= 0; j--) {
        var e = combatState.embers[j];
        if (!frozen) { e.x += e.vx; e.y += e.vy; e.life -= e.decay; e.flicker = 0.7 + Math.random() * 0.3; }
        if (e.life <= 0 || e.y < -0.1) { combatState.embers.splice(j, 1); continue; }
        combatCtx.save();
        combatCtx.globalAlpha = e.life * 0.7 * (e.flicker || 1);
        combatCtx.fillStyle = 'rgb(' + e.color + ')';
        combatCtx.shadowBlur = 8;
        combatCtx.shadowColor = 'rgb(' + e.color + ')';
        combatCtx.beginPath();
        combatCtx.arc(e.x * w, e.y * h, e.size, 0, Math.PI * 2);
        combatCtx.fill();
        if (e.life > 0.3) { combatCtx.globalAlpha = e.life * 0.2; combatCtx.beginPath(); combatCtx.arc((e.x - e.vx * 4) * w, (e.y - e.vy * 4) * h, e.size * 0.4, 0, Math.PI * 2); combatCtx.fill(); }
        combatCtx.restore();
    }
    if (!frozen) {
        combatCtx.save();
        var fogY = h * 0.7;
        for (var fi = 0; fi < 3; fi++) {
            var fOff = (combatState.fogOffset + fi * 0.33) % 1;
            var fogAlpha = 0.04 + Math.sin(ts * 0.001 + fi) * 0.02;
            combatCtx.fillStyle = 'rgba(200,200,210,' + fogAlpha + ')';
            var fogX = fOff * w * 2 - w * 0.5;
            combatCtx.beginPath();
            combatCtx.ellipse(fogX, fogY + fi * 30, w * 0.4, 40, 0, 0, Math.PI * 2);
            combatCtx.fill();
        }
        combatCtx.restore();
    }
    if (combatState.flashAlpha > 0.01) {
        combatCtx.fillStyle = 'rgba(' + combatState.flashColor + ',' + combatState.flashAlpha + ')';
        combatCtx.fillRect(0, 0, w, h);
        if (!frozen) combatState.flashAlpha *= 0.80;
    }
    var vignette = combatCtx.createRadialGradient(w/2, h/2, w*0.25, w/2, h/2, w*0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    combatCtx.fillStyle = vignette;
    combatCtx.fillRect(0, 0, w, h);
    if (combatState.rageVignette > 0) {
        var rVig = combatCtx.createRadialGradient(w/2, h/2, w*0.2, w/2, h/2, w*0.6);
        rVig.addColorStop(0, 'rgba(0,0,0,0)');
        rVig.addColorStop(1, 'rgba(180,20,20,' + combatState.rageVignette + ')');
        combatCtx.fillStyle = rVig;
        combatCtx.fillRect(0, 0, w, h);
    }
    drawCombatHpBar(20, 18, w * 0.4, 'Герой', combatState.heroHpPct, combatState.heroHpText, '#c73e4d', false);
    drawCombatHpBar(w - w * 0.4 - 20, 18, w * 0.4, combatState.bossName, combatState.bossHpPct, combatState.bossHpText, '#8b2635', true);
    for (var k = combatState.damageNumbers.length - 1; k >= 0; k--) {
        var d = combatState.damageNumbers[k];
        if (!frozen) { d.y += d.vy; d.life -= d.decay; }
        if (d.life <= 0) { combatState.damageNumbers.splice(k, 1); continue; }
        combatCtx.save();
        combatCtx.globalAlpha = Math.min(1, d.life * 1.5);
        combatCtx.font = 'bold ' + (d.crit ? 36 : 26) + 'px serif';
        combatCtx.textAlign = 'center';
        combatCtx.fillStyle = d.color;
        combatCtx.shadowBlur = 12;
        combatCtx.shadowColor = '#000';
        combatCtx.fillText(d.text, d.x * w, d.y * h);
        combatCtx.restore();
    }
    if (combatState.defeated) {
        combatCtx.save();
        combatCtx.fillStyle = 'rgba(0,0,0,0.75)';
        combatCtx.fillRect(0, 0, w, h);
        combatCtx.font = 'bold 52px serif';
        combatCtx.textAlign = 'center';
        combatCtx.fillStyle = '#666';
        combatCtx.shadowBlur = 20;
        combatCtx.shadowColor = '#000';
        combatCtx.fillText('☠ ПОВЕРЖЕН ☠', w/2, h/2);
        combatCtx.restore();
    }
    combatCtx.restore();
    if (combatState.chromaticAberration > 0.5) {
        combatCtx.save();
        combatCtx.globalCompositeOperation = 'screen';
        var ca = combatState.chromaticAberration;
        combatCtx.globalAlpha = 0.3;
        combatCtx.drawImage(combatCanvas, ca, 0, w, h, 0, 0, w, h);
        combatCtx.drawImage(combatCanvas, -ca, 0, w, h, 0, 0, w, h);
        combatCtx.restore();
    }
    combatRafId = requestAnimationFrame(renderCombat);
}
function drawCombatShadow(x, y, radius, flicker) {
    combatCtx.save();
    var alpha = 0.45 * (flicker || 1);
    combatCtx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
    combatCtx.beginPath();
    var rx = radius * (0.9 + (flicker || 1) * 0.15);
    combatCtx.ellipse(x, y, rx, rx * 0.22, 0, 0, Math.PI * 2);
    combatCtx.fill();
    combatCtx.restore();
}
function updateCombatAnim(ts) {
    var which = [['hero', 'heroAnim', 'heroAnimStart', 'heroOffsetX', 'heroOffsetY', 'heroRot'],
                 ['boss', 'bossAnim', 'bossAnimStart', 'bossOffsetX', 'bossOffsetY', 'bossRot']];
    which.forEach(function(arr) {
        var key = arr[0], animProp = arr[1], startProp = arr[2], oxProp = arr[3], oyProp = arr[4], rotProp = arr[5];
        var anim = combatState[animProp];
        var t = (ts - combatState[startProp]) / 1000;
        if (anim === 'idle') {
            combatState[oxProp] = 0;
            combatState[oyProp] = Math.sin(ts * 0.002 + (key === 'boss' ? 1.5 : 0)) * 0.005;
            combatState[rotProp] = Math.sin(ts * 0.0015 + (key === 'boss' ? 1 : 0)) * 1;
            if (key === 'hero') combatState.heroFilter = '';
            if (key === 'boss') combatState.bossFilter = '';
        } else if (anim === 'attacking') {
            var dir = key === 'hero' ? 1 : -1;
            if (t < 0.15) {
                var p = t / 0.15;
                combatState[oxProp] = -0.02 * dir * p;
                combatState[rotProp] = -3 * dir * p;
            } else if (t < 0.28) {
                var p2 = (t - 0.15) / 0.13;
                combatState[oxProp] = (-0.02 + 0.15 * p2) * dir;
                combatState[rotProp] = (-3 + 5 * p2) * dir;
            } else if (t < 0.40) {
                combatState[oxProp] = 0.13 * dir;
            } else if (t < 0.65) {
                var p3 = (t - 0.40) / 0.25;
                combatState[oxProp] = 0.13 * (1 - p3) * dir;
                combatState[rotProp] = 2 * (1 - p3) * dir;
            } else {
                combatState[animProp] = 'idle';
                combatState[startProp] = ts;
            }
        } else if (anim === 'hurt') {
            var hdir = key === 'hero' ? -1 : 1;
            if (t < 0.15) {
                var hp = t / 0.15;
                combatState[oxProp] = 0.04 * hdir * hp;
                combatState[rotProp] = 5 * hdir * hp;
            } else if (t < 0.45) {
                var hp2 = (t - 0.15) / 0.30;
                combatState[oxProp] = 0.04 * hdir * (1 - hp2);
                combatState[rotProp] = 5 * hdir * (1 - hp2);
            } else {
                combatState[animProp] = 'idle';
                combatState[startProp] = ts;
            }
            if (key === 'hero') combatState.heroFilter = t < 0.2 ? 'brightness(2.5) saturate(0.2)' : '';
            if (key === 'boss') combatState.bossFilter = t < 0.2 ? 'brightness(2) saturate(0.3)' : '';
        }
    });
}
function drawCombatChar(which, ts, overlayOnly) {
    var img = combatImages[which];
    if (!img) return;
    var w = combatCanvas.width, h = combatCanvas.height;
    var baseX, baseY, scale, ox, oy, rot, filter, sqX, sqY;
    if (which === 'hero') {
        baseX = combatState.heroX; baseY = combatState.heroBaseY;
        scale = combatState.heroScale;
        ox = combatState.heroOffsetX; oy = combatState.heroOffsetY;
        rot = combatState.heroRot; filter = combatState.heroFilter;
        sqX = combatState.heroSquashX; sqY = combatState.heroSquashY;
    } else {
        baseX = combatState.bossX; baseY = combatState.bossBaseY;
        scale = combatState.bossScale;
        ox = combatState.bossOffsetX; oy = combatState.bossOffsetY;
        rot = combatState.bossRot; filter = combatState.bossFilter;
        sqX = combatState.bossSquashX; sqY = combatState.bossSquashY;
    }
    var charH = h * 0.55 * scale * sqY;
    var charW = charH * (img.width / img.height) * sqX;
    var cx = (baseX + ox) * w;
    var cy = (baseY + oy) * h;
    if (!overlayOnly) {
        combatCtx.save();
        combatCtx.translate(cx, cy);
        combatCtx.rotate(rot * Math.PI / 180);
        if (filter) combatCtx.filter = filter;
        combatCtx.drawImage(img, -charW/2, -charH, charW, charH);
        combatCtx.restore();
    }
    combatCtx.save();
    combatCtx.translate(cx, cy);
    combatCtx.rotate(rot * Math.PI / 180);
    var lightGrad = combatCtx.createLinearGradient(-charW/2, 0, charW/2, 0);
    var lightIntensity = 0.18 * combatState.torchFlicker;
    if (which === 'hero') {
        lightGrad.addColorStop(0, 'rgba(0,0,0,0)');
        lightGrad.addColorStop(0.6, 'rgba(0,0,0,' + (lightIntensity * 0.3) + ')');
        lightGrad.addColorStop(1, 'rgba(0,0,0,' + lightIntensity + ')');
    } else {
        lightGrad.addColorStop(0, 'rgba(0,0,0,' + lightIntensity + ')');
        lightGrad.addColorStop(0.4, 'rgba(0,0,0,' + (lightIntensity * 0.3) + ')');
        lightGrad.addColorStop(1, 'rgba(0,0,0,0)');
    }
    combatCtx.fillStyle = lightGrad;
    combatCtx.fillRect(-charW/2, -charH, charW, charH);
    var warmGrad = combatCtx.createRadialGradient(-charW * 0.3, -charH * 0.7, 10, -charW * 0.3, -charH * 0.7, charW * 0.8);
    var warmAlpha = 0.08 * combatState.torchFlicker;
    warmGrad.addColorStop(0, 'rgba(255,140,40,' + warmAlpha + ')');
    warmGrad.addColorStop(1, 'rgba(0,0,0,0)');
    combatCtx.fillStyle = warmGrad;
    combatCtx.fillRect(-charW/2, -charH, charW, charH);
    combatCtx.restore();
}
function drawSlashArc(w, h) {
    var arc = combatState.slashArc;
    if (!arc) return;
    combatCtx.save();
    var progress = arc.progress;
    var startX = arc.fromX * w, startY = arc.fromY * h;
    var endX = arc.toX * w, endY = arc.toY * h;
    var midX = (startX + endX) / 2, midY = (startY + endY) / 2 - 60;
    var alpha = Math.sin(progress * Math.PI);
    combatCtx.globalAlpha = alpha;
    combatCtx.strokeStyle = arc.color;
    combatCtx.lineWidth = 4 + (1 - progress) * 6;
    combatCtx.shadowBlur = 20;
    combatCtx.shadowColor = arc.color;
    combatCtx.lineCap = 'round';
    combatCtx.beginPath();
    var steps = 20;
    for (var s = 0; s <= steps * progress; s++) {
        var t = s / steps;
        var x = (1-t)*(1-t)*startX + 2*(1-t)*t*midX + t*t*endX;
        var y = (1-t)*(1-t)*startY + 2*(1-t)*t*midY + t*t*endY;
        if (s === 0) combatCtx.moveTo(x, y);
        else combatCtx.lineTo(x, y);
    }
    combatCtx.stroke();
    combatCtx.globalAlpha = alpha * 0.5;
    combatCtx.lineWidth = 1;
    combatCtx.strokeStyle = '#fff';
    combatCtx.stroke();
    combatCtx.restore();
}
function drawCombatHpBar(x, y, width, name, pct, text, color, rightAlign) {
    pct = Math.max(0, Math.min(1, pct));
    combatCtx.save();
    combatCtx.font = 'bold 14px serif';
    combatCtx.textAlign = rightAlign ? 'right' : 'left';
    combatCtx.fillStyle = '#d4a574';
    combatCtx.shadowBlur = 4;
    combatCtx.shadowColor = '#000';
    combatCtx.fillText(name, rightAlign ? x + width : x, y);
    var barY = y + 8;
    var barH = 12;
    combatCtx.shadowBlur = 0;
    combatCtx.fillStyle = 'rgba(0,0,0,0.7)';
    combatCtx.fillRect(x - 1, barY - 1, width + 2, barH + 2);
    combatCtx.fillStyle = 'rgba(40,40,40,0.8)';
    combatCtx.fillRect(x, barY, width, barH);
    combatCtx.fillStyle = color;
    combatCtx.fillRect(x, barY, width * pct, barH);
    var gradColor = color === '#c73e4d' ? '199,62,77' : '139,38,53';
    var hpGrad = combatCtx.createLinearGradient(x, barY, x, barY + barH);
    hpGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
    hpGrad.addColorStop(0.5, 'rgba(' + gradColor + ',0)');
    hpGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
    combatCtx.fillStyle = hpGrad;
    combatCtx.fillRect(x, barY, width * pct, barH);
    combatCtx.strokeStyle = 'rgba(212,165,116,0.4)';
    combatCtx.lineWidth = 1;
    combatCtx.strokeRect(x, barY, width, barH);
    combatCtx.font = '11px monospace';
    combatCtx.textAlign = rightAlign ? 'right' : 'left';
    combatCtx.fillStyle = 'rgba(255,255,255,0.8)';
    combatCtx.shadowBlur = 3;
    combatCtx.shadowColor = '#000';
    combatCtx.fillText(text, rightAlign ? x + width : x, barY + barH + 14);
    combatCtx.restore();
}
function triggerHeroAttack(dmg, crit) {
    var ts = performance.now();
    combatState.heroAnim = 'attacking'; combatState.heroAnimStart = ts;
    setTimeout(function() {
        combatState.bossAnim = 'hurt'; combatState.bossAnimStart = performance.now();
        combatState.flashAlpha = crit ? 0.85 : 0.6; combatState.flashColor = '255,255,255';
        combatState.shakeAmount = crit ? 22 : 12;
        combatState.hitStop = performance.now() + (crit ? 100 : 70);
        combatState.bossSquashX = crit ? 0.75 : 0.85; combatState.bossSquashY = crit ? 1.2 : 1.1;
        combatState.slashArc = { fromX: 0.25, fromY: 0.45, toX: 0.72, toY: 0.4, progress: 0, color: crit ? '251,191,36' : '255,240,200' };
        combatState.impactRings.push({ x: 0.74, y: 0.38, radius: 10, alpha: 0.9, color: crit ? 'rgba(251,191,36,1)' : 'rgba(255,200,150,1)' });
        if (crit) { combatState.impactRings.push({ x: 0.74, y: 0.38, radius: 20, alpha: 0.6, color: 'rgba(255,100,50,1)' }); combatState.chromaticAberration = 8; }
        spawnDamageNumber(0.72, 0.35, '-' + dmg + (crit ? ' КРИТ!' : ''), crit ? '#fbbf24' : '#e74c3c');
        if (crit) spawnDamageNumber.crit = true;
        combatState.damageNumbers[combatState.damageNumbers.length - 1].crit = crit;
        var pColor = crit ? '251,191,36' : '199,62,77';
        var pCount = crit ? 40 : 20;
        for (var i = 0; i < pCount; i++) {
            var a = Math.random() * Math.PI * 2;
            var sp = 0.005 + Math.random() * 0.015;
            combatState.particles.push({
                x: 0.74 + (Math.random()-0.5)*0.04, y: 0.38 + (Math.random()-0.5)*0.08,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.003,
                size: 2+Math.random()*5, life: 1, decay: 0.015+Math.random()*0.025,
                color: pColor, gravity: 0.008, trail: true
            });
        }
    }, 240);
}
function triggerBossAttack(dmg) {
    var ts = performance.now();
    combatState.bossAnim = 'attacking'; combatState.bossAnimStart = ts;
    setTimeout(function() {
        combatState.heroAnim = 'hurt'; combatState.heroAnimStart = performance.now();
        combatState.flashAlpha = 0.65; combatState.flashColor = '199,62,77';
        combatState.shakeAmount = 26;
        combatState.hitStop = performance.now() + 120;
        combatState.heroSquashX = 0.8; combatState.heroSquashY = 1.15;
        combatState.chromaticAberration = 5;
        combatState.impactRings.push({ x: 0.2, y: 0.4, radius: 15, alpha: 0.8, color: 'rgba(199,62,77,1)' });
        spawnDamageNumber(0.22, 0.35, '-' + dmg + ' HP', '#c73e4d');
        combatState.damageNumbers[combatState.damageNumbers.length - 1].crit = false;
        for (var i = 0; i < 30; i++) {
            var a = Math.random() * Math.PI * 2;
            var sp = 0.004 + Math.random() * 0.012;
            combatState.particles.push({
                x: 0.2 + (Math.random()-0.5)*0.04, y: 0.4 + (Math.random()-0.5)*0.08,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.002,
                size: 2+Math.random()*5, life: 1, decay: 0.012+Math.random()*0.02,
                color: '139,20,20', gravity: 0.012, trail: true
            });
        }
    }, 280);
}
function updateCombatHpBars() {
    combatState.heroHpPct = HERO.hp / HERO.maxHp;
    combatState.heroHpText = Math.max(0, Math.round(HERO.hp)) + '/' + HERO.maxHp;
    var boss = getCurrentBoss();
    var stage = boss.stages[bossStage];
    combatState.bossHpPct = bossHp / stage.maxHp;
    combatState.bossHpText = Math.max(0, Math.round(bossHp)) + '/' + stage.maxHp;
    combatState.bossName = boss.name;
    combatState.defeated = bossDefeated;
}
function attackBoss() {
if (bossDefeated) { showToast('☠ Босс повержен', 'Нечего атаковать', 'blood'); return; }
if (getBattlePhase() !== 'battle') { showToast('⛏ Не время', 'Фаза схватки: пятница — воскресенье', 'blood'); return; }
if (!HERO.actionPoints || HERO.actionPoints <= 0) { showToast('⚔ Нет ОД', 'Очки действия закончились. Заверши ход.', 'blood'); sfxError(); return; }
HERO.actionPoints--;
var gear = getTotalGearBonuses();
var totalStr = STATS.str.value + gear.str;
var totalCha = STATS.cha.value + gear.cha;
var sumAllStats = Object.values(STATS).reduce(function(a, s) { return a + s.value; }, 0);
var baseDmg = BASE_DAMAGE + Math.floor(sumAllStats * 0.5) + Math.floor(gear.str / 5);
var critChance = Math.min(0.5, totalCha * 0.02);
var crit = Math.random() < critChance;
var dmg = crit ? baseDmg * 2 : baseDmg;
if (HERO.isHollow) dmg = Math.floor(dmg * 0.5);
dmg = Math.max(1, dmg);
changeBossHp(-dmg);
triggerHeroAttack(dmg, crit);
if (crit) { sfxCrit(); haptic('heavy'); }
else { sfxHit(); haptic('medium'); }
updateBossBattleUI();
updateCombatHpBars();
updateHeroUI();
saveGameState();
}
function endBossTurn() {
if (bossDefeated) { showToast('☠ Босс повержен', 'Бой окончен', 'save'); return; }
var rageMult = 8 + bossStage * 4;
var rageDmg = bossRagePoints * rageMult;
var boss = getCurrentBoss();
if (rageDmg > 0) {
HERO.hp = Math.max(1, HERO.hp - rageDmg);
triggerBossAttack(rageDmg);
sfxBossHit(); haptic('heavy');
showToast('💢 Ответный удар!', boss.name + ' наносит -' + rageDmg + ' HP (Ярость: ' + bossRagePoints + ')', 'blood');
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
} else {
showToast('🛡 Босс спокоен', 'Нет очков ярости — удар слабый.', 'save');
}
bossRagePoints = 0;
HERO.actionPoints = 0;
updateBossBattleUI();
updateHeroUI();
saveGameState();
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
var canAttack = ap > 0 && !bossDefeated;
var canEnd = ap === 0 && !bossDefeated;
area.innerHTML =
'<div style="display:flex; gap:12px; justify-content:center; margin-bottom:12px;">' +
'<div style="flex:1; text-align:center; padding:10px; background:rgba(96,165,250,0.1); border:1px solid rgba(96,165,250,0.3); border-radius:4px;">' +
'<div style="font-size:24px; color:#60a5fa; font-weight:bold;">' + ap + '</div>' +
'<div style="font-size:10px; color:var(--text-dim); letter-spacing:1px;">⚔ ОЧКИ ДЕЙСТВИЯ</div>' +
'</div>' +
'<div style="flex:1; text-align:center; padding:10px; background:rgba(199,62,77,0.1); border:1px solid rgba(199,62,77,0.3); border-radius:4px;">' +
'<div style="font-size:24px; color:var(--blood-bright); font-weight:bold;">' + bossRagePoints + '</div>' +
'<div style="font-size:10px; color:var(--text-dim); letter-spacing:1px;">💢 ОЧКИ ЯРОСТИ (' + (bossRagePoints * (8 + bossStage * 4)) + ' урона)</div>' +
'</div>' +
'</div>' +
(canAttack ?
'<button class="demo-btn primary" data-action="attack-boss" style="width:100%; margin-bottom:8px; font-size:16px;">⚔ АТАКОВАТЬ (-1 ОД)</button>' : '') +
(canEnd ?
'<button class="demo-btn" data-action="end-boss-turn" style="width:100%; margin-bottom:8px; font-size:14px; border-color:var(--blood-bright); color:var(--blood-bright);">💢 Завершить ход (принять удар: -' + (bossRagePoints * (8 + bossStage * 4)) + ' HP)</button>' : '') +
(ap === 0 && !canEnd && !bossDefeated ?
'<div style="text-align:center; padding:8px; color:var(--text-dim); font-size:11px;">ОД закончились. Заверши ход, чтобы босс ответил.</div>' : '');
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
if (pool.length === 0) return;
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
        var partialXp = Math.round(goal.xp / goal.totalSteps / 2);
        HERO.xp = Math.max(0, HERO.xp - partialXp);
        HERO.totalXp = Math.max(0, HERO.totalXp - partialXp);
        if (goal.stat && STATS[goal.stat]) {
            STATS[goal.stat].attributePoints = Math.max(0, (STATS[goal.stat].attributePoints || 0) - 1);
        }
        updateHeroUI();
        renderGoals();
        showToast('↩ Шаг отменён', '-' + partialXp + ' XP · -1 пул ' + (STATS[goal.stat] ? STATS[goal.stat].name : ''), 'blood');
        saveGameState();
        return;
    }
    step.done = true;
    goal.currentStep = goal.steps.filter(function(s) { return s.done; }).length;
    addXpReward(Math.round(goal.xp / goal.totalSteps / 2));
    if (goal.stat && STATS[goal.stat]) {
        STATS[goal.stat].attributePoints = (STATS[goal.stat].attributePoints || 0) + 1;
        checkAttributePoolGrowth(goal.stat);
    }
    goal.lastStepAt = Date.now();
    sfxEquip(); haptic('light');
    renderGoals();
    showToast('✓ Шаг выполнен', goal.name + ': ' + goal.currentStep + '/' + goal.totalSteps);
    if (goal.currentStep >= goal.totalSteps) setTimeout(function() { completeGoal(id); }, 500);
    saveGameState();
}
function advanceGoal(id) {
const goal = GOALS.find(g => g.id === id);
if (!goal || goal.completed || goal.failed) return;
goal.currentStep = Math.min(goal.totalSteps, goal.currentStep + 1);
addXpReward(Math.round(goal.xp / goal.totalSteps / 2));
if (goal.stat && STATS[goal.stat]) {
STATS[goal.stat].attributePoints = (STATS[goal.stat].attributePoints || 0) + 1;
checkAttributePoolGrowth(goal.stat);
}
goal.lastStepAt = Date.now();
    renderGoals();
    showToast('📈 Шаг выполнен', goal.name + ': ' + goal.currentStep + '/' + goal.totalSteps);
if (goal.currentStep >= goal.totalSteps) setTimeout(() => completeGoal(id), 600);
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
addXpReward(goal.xp);
if (goal.stat && STATS[goal.stat]) {
STATS[goal.stat].attributePoints = (STATS[goal.stat].attributePoints || 0) + goal.statBonus;
checkAttributePoolGrowth(goal.stat);
}
    HERO.actionPoints = (HERO.actionPoints || 0) + goal.dmg;
    const statIcon = goal.stat && STATS[goal.stat] ? STATS[goal.stat].icon + ' ' + STATS[goal.stat].name : '';
    showToast('🏆 Цель достигнута!', '+' + goal.xp + ' XP · +' + goal.dmg + ' ОД' + (statIcon ? ' · +' + goal.statBonus + ' к пулу ' + statIcon : ''), 'crit');
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
const rank = document.getElementById('forgeRank').value;
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
    if (FORGED.length <= 50) addXpReward(10);
    showToast('🔥 Выковано!', name + ' (ранг ' + rank + ', ' + masteryThreshold + ' выполн. до след. ранга)');
spiritSay('«Новое испытание выковано. Покажи, на что ты способен.»');
switchView('deck');
saveGameState();
}
document.getElementById('forgeModal').addEventListener('click', (e) => { if (e.target.id === 'forgeModal') closeForge(); });
function switchView(view) {
document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
document.querySelectorAll('.bnav-btn').forEach(t => t.classList.remove('active'));
document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
var tabEl = document.querySelector('.tab[data-view="' + view + '"]');
var bnavEl = document.querySelector('.bnav-btn[data-view="' + view + '"]');
if (tabEl) tabEl.classList.add('active');
if (bnavEl) bnavEl.classList.add('active');
document.getElementById('view-' + view).classList.add('active');
if (view === 'hero') { renderStats(); updateHeroUI(); renderGoals(); }
if (view === 'map') renderMap(escapeProgress);
if (view === 'boss') { updateBossDisplay(); updateBossBattleUI(); updateCombatHpBars(); var hf=document.getElementById('heroFigure'); var bf=document.getElementById('bossFigure'); if(hf) hf.classList.add('idle'); if(bf) bf.classList.add('idle'); }
if (view === 'deck') renderDashboard();
if (view === 'inv') { renderBackpack(); renderSlots(); updateTotalBonuses(); }
if (view === 'deck') renderCards();
if (view === 'boss') updateBossDisplay();
if (view === 'stats') renderStatsView();
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
(isCurrent ? '<div style="padding: 10px; background: rgba(251, 191, 36, 0.1); border: 1px solid var(--gold); border-radius: 4px; text-align: center;"><div style="font-size: 9px; letter-spacing: 2px; color: var(--gold); text-transform: uppercase; margin-bottom: 4px;">Прогресс локации</div><div style="font-size: 22px; color: var(--gold-bright); font-weight: bold;">' + progressPct + '%</div></div>' : '');
document.getElementById('roomDetailModal').classList.add('show');
}
function closeRoomDetail() { document.getElementById('roomDetailModal').classList.remove('show'); }
renderMap(0);
function updateEscapeDisplay() {
document.getElementById('progressVal').textContent = escapeProgress + ' / ' + ESCAPE_MAX;
document.getElementById('mapProgressNum').textContent = escapeProgress;
document.getElementById('mapProgressFill').style.width = ((escapeProgress / ESCAPE_MAX) * 100) + '%';
const slider = document.getElementById('progressSlider');
if (slider) slider.value = escapeProgress;
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
'<b style="color:var(--gold-bright)">⚔ Пт–Вс: Схватка</b><br>' +
'• Трать ОД на атаки вручную<br>' +
'• Когда ОД = 0 → <b>Завершить ход</b><br>' +
'• Босс бьёт на <b style="color:var(--blood-bright)">' + (bossRagePoints * (8 + bossStage * 4)) + ' HP</b> (Ярость × ' + (8 + bossStage * 4) + ')<br>' +
'• HP ≤ 0 → становишься Полым, случайная карточка теряет мастерство<br><br>' +
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
function recordDailySnapshot() {
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
'<div style="font-size: 9px; color: var(--gold-bright);">' + d.xp + '</div>' +
'<div style="width: 100%; height: ' + h + 'px; background: linear-gradient(to top, var(--gold), var(--gold-bright)); border-radius: 3px 3px 0 0; min-height: 2px;"></div>' +
'<div style="font-size: 9px; color: var(--text-dim);">' + dayLabel + '</div>' +
'</div>';
}).join('') +
'</div></div>' +
'<div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); padding: 16px; margin-bottom: 20px;">' +
'<div style="font-size: 11px; letter-spacing: 2px; color: var(--text-dim); text-transform: uppercase; margin-bottom: 12px;">🔥 Тепловая карта стиков (последние 8 недель)</div>' +
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
var today = new Date();
var days = [];
for (var i = 55; i >= 0; i--) {
var d = new Date(today);
d.setDate(d.getDate() - i);
var key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
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
if (Array.isArray(window._bossKills)) {
bosses[0].kills = window._bossKills.snake || 0;
bosses[1].kills = window._bossKills.social || 0;
bosses[2].kills = window._bossKills.chimera || 0;
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
html += '<div style="font-size:9px;color:var(--text-dim);margin-top:2px;">' + a.desc + '</div>';
html += '</div>';
} else {
html += '<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);padding:10px;border-radius:6px;text-align:center;opacity:0.4;">';
html += '<div style="font-size:24px;filter:grayscale(1);">' + a.icon + '</div>';
html += '<div style="font-size:11px;color:var(--text-dim);margin-top:4px;">' + a.name + '</div>';
html += '<div style="font-size:9px;color:var(--text-dim);margin-top:2px;">' + a.desc + '</div>';
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
    var now = new Date();
    var mskHours = (now.getUTCHours() + 3) % 24;
    var mskDay = new Date(now);
    mskDay.setUTCHours(now.getUTCHours() + 3);
    var dayOfWeek = mskDay.getUTCDay();
    if (bloodOath && bloodOath.status === 'active') return;
    if (dayOfWeek !== 1) return;
    if (FORGED.length === 0) return;
    if (bloodOath && bloodOath.status === 'active') return;
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
    bloodOath.status = 'completed';
    addXpReward(BLOOD_OATH_BONUS_XP);
    sfxBossDefeated(); haptic('success');
    burstParticles(window.innerWidth / 2, window.innerHeight / 2, 150, { color: '#fbbf24', speed: 12, decay: 0.008, size: 4, shape: 'star', gravity: 0.08, life: 1.3 });
    burstParticles(window.innerWidth / 2, window.innerHeight / 2, 80, { color: '#c73e4d', speed: 8, decay: 0.01, size: 3, shape: 'spark', gravity: 0.05 });
    screenShake(12, 600);
    showToast('🩸⚠️ КЛЯТВА ВЫПОЛНЕНА!', '+' + BLOOD_OATH_BONUS_XP + ' XP! «' + cardName + '» — ты выстоял!', 'crit');
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
        '<div>📈 <b>Completion rate за неделю:</b> ' + completionRate + '</div>' +
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

function renderDashboard() {
    var bar = document.getElementById('dashboardBar');
    if (!bar) return;
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
    bar.innerHTML =
        '<div class="dashboard-row"><span>' + phaseIcon + ' ' + phaseText + daysToBattle + '</span></div>' +
        '<div class="dashboard-row"><span>⚔ ОД: <b style="color:#60a5fa">' + (HERO.actionPoints||0) + '</b></span><span>💢 Ярость: <b style="color:var(--blood-bright)">' + bossRagePoints + '</b></span><span>📖 ' + doneToday + '/' + FORGED.length + ' сегодня' + (remaining > 0 ? ' (осталось ' + remaining + ')' : '') + '</span></div>' +
        '<div class="dashboard-row"><span>🔥 Макс. стик: <b>' + maxStreak + '</b> дн.' + comboInfo + oathProgress + '</span></div>';
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
        depth: '+50% мастерства, но XP -20%',
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
    return 1 + bonus;
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
        '<div style="overflow-x:auto;"><table style="font-size:9px; border-collapse:collapse; width:100%;">';
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
            '<div style="font-size:8px; color:var(--text-dim);">' + dayName + '</div>' +
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
chimeraShield = 5;
var currentMonday = getThisMondayKey();
if (lastWeekReset !== currentMonday) {
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
});
recordDailySnapshot();
checkBloodOathDaily();
lastDayReset = todayKey;
saveGameState();
renderCards();
}
}
var idb = null;
function openIDB() {
    try {
        var req = indexedDB.open('neurodeck_db', 1);
        req.onupgradeneeded = function(e) {
            e.target.result.createObjectStore('saves', { keyPath: 'id' });
        };
        req.onsuccess = function(e) { idb = e.target.result; };
        req.onerror = function() { idb = null; };
    } catch(e) { idb = null; }
}
openIDB();
function saveToIDB(obj) {
    if (!idb) return;
    try {
        var tx = idb.transaction('saves', 'readwrite');
        tx.objectStore('saves').put({ id: 'latest', data: obj, ts: Date.now() });
    } catch(e) {}
}
function loadFromIDB(callback) {
    if (!idb) { callback(null); return; }
    try {
        var tx = idb.transaction('saves', 'readonly');
        var req = tx.objectStore('saves').get('latest');
        req.onsuccess = function(e) { callback(e.target.result ? e.target.result : null); };
        req.onerror = function() { callback(null); };
    } catch(e) { callback(null); }
}
function saveGameState() {
try {
if (FORGED.length === 0) {
var emergency = localStorage.getItem('neurodeck_cards_backup');
if (emergency) {
try {
var emergData = JSON.parse(emergency);
if (emergData.forged && emergData.forged.length > 0) {
FORGED = emergData.forged;
if (emergData.forgedIdCounter) forgedIdCounter = emergData.forgedIdCounter;
showToast('♻ Защита данных', 'Карточки восстановлены из аварийной копии (' + FORGED.length + ')');
}
} catch(e) {}
}
}
const snapshot = {
hero: HERO, stats: STATS, forged: FORGED, goals: GOALS, inventory: INVENTORY,
escapeProgress, bossHp, bossStage, bossDefeated, lastDayReset, chimeraShield,
forgedIdCounter, uidCounter, goalIdCounter, xpHistory, bossKills: window._bossKills, bloodOath: bloodOath, bossRagePoints: bossRagePoints, lastWeekReset: lastWeekReset, savedAt: Date.now()
};
var json = JSON.stringify(snapshot);
localStorage.setItem('neurodeck_full_save', json);
try { localStorage.setItem('neurodeck_backup', json); } catch(e) {}
if (FORGED.length > 0) {
try { localStorage.setItem('neurodeck_cards_backup', json); } catch(e) {}
}
saveToIDB(snapshot);
saveGoals();
autoCloudSave(json);
} catch (e) {
console.warn('Save failed:', e);
showToast('⚠ Ошибка сохранения', 'Хранилище переполнено — экспортируйте данные!', 'blood');
}
}
function autoCloudSave(json, force) {
    var cs = getCloudStorage();
    if (!cs) return;
    if (FORGED.length === 0) return;
    if (!force && Date.now() - (window._lastCloudSave || 0) < 30000) return;
    window._lastCloudSave = Date.now();
    try {
        var chunks = [];
        for (var i = 0; i < json.length; i += CLOUD_MAX_CHUNK) { chunks.push(json.slice(i, i + CLOUD_MAX_CHUNK)); }
        var doneCount = 0;
        chunks.forEach(function(chunk, idx) {
            cs.setItem(CLOUD_DATA_PREFIX + idx, chunk, function() {
                doneCount++;
                if (doneCount === chunks.length) {
                    cs.setItem(CLOUD_META_KEY, JSON.stringify({n: chunks.length, t: Date.now()}), function() {});
                    updateSyncBadge('synced');
                }
            });
        });
    } catch(e) {}
}
function forceCloudSave() {
    var cs = getCloudStorage();
    if (!cs) return;
    if (FORGED.length === 0) return;
    window._lastCloudSave = 0;
    var json = JSON.stringify(buildSyncData());
    autoCloudSave(json, true);
}
function smartCloudSync() {
    var cs = getCloudStorage();
    if (!cs) return;
    cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
        if (err || !metaStr) return;
        try {
            var meta = JSON.parse(metaStr);
            var cloudTime = meta.t || 0;
            var localTime = 0;
            var localRaw = localStorage.getItem('neurodeck_full_save') || localStorage.getItem('neurodeck_backup');
            if (localRaw) { try { localTime = JSON.parse(localRaw).savedAt || 0; } catch(e) {} }
            if (cloudTime > localTime + 10000) {
                var parts = new Array(meta.n);
                var loaded = 0;
                function check() {
                    if (loaded < meta.n) return;
                    try {
                        var data = JSON.parse(parts.join(''));
                        if (data.forged && FORGED.length > 0 && data.forged.length < FORGED.length) {
                            forceCloudSave();
                            return;
                        }
                        if ((!data.forged || data.forged.length === 0) && FORGED.length > 0) {
                            forceCloudSave();
                            return;
                        }
                        var cloudDate = new Date(cloudTime).toLocaleString('ru');
                        var localDate = localTime ? new Date(localTime).toLocaleString('ru') : 'нет данных';
                        dungeonConfirm('☁ Найдано обновление',
                            'Облако новее, чем это устройство:<br>' +
                            '<b>Облако:</b> ' + cloudDate + '<br>' +
                            '<b>Локально:</b> ' + localDate + '<br><br>' +
                            '<span style="color:var(--gold-bright)">Загрузить актуальный прогресс?</span>'
                        ).then(function(ok) {
                            if (ok) {
                                applySyncData(data);
                                saveGameState();
                                showToast('☁ Синхронизировано', 'Загружено из облака: ' + cloudDate);
                                spiritSay('«Облако поделилось воспоминаниями...»');
                                screenShake(6, 400);
                            } else {
                                forceCloudSave();
                                showToast('☁ Отправлено в облако', 'Локальные данные актуальнее');
                            }
                        });
                    } catch(e) {}
                }
                for (var i = 0; i < meta.n; i++) {
                    (function(idx) {
                        cs.getItem(CLOUD_DATA_PREFIX + idx, function(e2, val) {
                            if (!e2 && val) parts[idx] = val;
                            loaded++;
                            check();
                        });
                    })(i);
                }
            } else if (localTime > cloudTime + 5000) {
                forceCloudSave();
            }
        } catch(e) {}
    });
}
function updateSyncBadge(state) {
    var badge = document.getElementById('syncBadge');
    if (!badge) return;
    if (state === 'synced') {
        badge.textContent = '☁';
        badge.style.color = '#34d399';
        badge.title = 'Синхронизировано с облаком';
    } else if (state === 'syncing') {
        badge.textContent = '☁';
        badge.style.color = '#fbbf24';
        badge.title = 'Синхронизация...';
    } else if (state === 'offline') {
        badge.textContent = '☁';
        badge.style.color = 'var(--text-dim)';
        badge.title = 'Облако недоступно (открой в Telegram)';
    }
}
function loadGameState() {
try {
var raw = localStorage.getItem('neurodeck_full_save');
if (!raw) raw = localStorage.getItem('neurodeck_backup');
if (raw) {
var data = JSON.parse(raw);
if (!data.forged || data.forged.length === 0) {
var emerg = localStorage.getItem('neurodeck_cards_backup');
if (emerg) {
try {
var emergData = JSON.parse(emerg);
if (emergData.forged && emergData.forged.length > 0) {
applySyncData(emergData, true);
showToast('♻ Восстановлено', emergData.forged.length + ' карточек из аварийной копии');
return;
}
} catch(e) {}
}
}
applySyncData(data, true);
return;
}
} catch (e) { console.warn('Load failed:', e); }
var emergFinal = localStorage.getItem('neurodeck_cards_backup');
if (emergFinal) {
try {
var emergData2 = JSON.parse(emergFinal);
if (emergData2.forged && emergData2.forged.length > 0) {
applySyncData(emergData2, true);
showToast('♻ Восстановлено', emergData2.forged.length + ' карточек из аварийной копии');
return;
}
} catch(e) {}
}
tryCloudRecovery();
loadFromIDB(function(result) {
    if (result && result.data && result.data.forged && result.data.forged.length > 0 && FORGED.length === 0) {
        dungeonConfirm('♻ Найдено в IndexedDB',
            'Обнаружено сохранение с <b>' + result.data.forged.length + '</b> карточками.<br>' +
            'Дата: ' + new Date(result.ts).toLocaleString('ru') + '<br><br>' +
            '<span style="color:var(--gold-bright)">Восстановить?</span>'
        ).then(function(ok) {
            if (ok) {
                applySyncData(result.data);
                saveGameState();
                showToast('♻ Восстановлено', result.data.forged.length + ' карточек из IndexedDB');
                screenShake(6, 400);
            }
        });
    }
});
}
function tryCloudRecovery() {
var cs = getCloudStorage();
if (!cs) return;
cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
if (err || !metaStr) return;
try {
var meta = JSON.parse(metaStr);
var parts = new Array(meta.n);
var loaded = 0;
function check() {
if (loaded < meta.n) return;
try {
var data = JSON.parse(parts.join(''));
var savedDate = new Date(data.t || Date.now()).toLocaleString('ru');
dungeonConfirm('☁ Найдено облачное сохранение!', 'Данные от <b>' + savedDate + '</b>.<br>Герой: <b>ур.' + (data.hero ? data.hero.level : '?') + '</b>, карточек: <b>' + (data.forged ? data.forged.length : 0) + '</b>.<br><br><span style="color:var(--gold-bright)">Восстановить?</span>').then(function(ok) {
if (!ok) return;
applySyncData(data, true);
saveGameState();
showToast('☁ Прогресс восстановлен!', 'Из облака: ' + savedDate);
spiritSay('«Облако сохранило твой путь...»');
screenShake(6, 400);
location.reload();
});
} catch(e) {}
}
for (var i = 0; i < meta.n; i++) {
(function(idx) {
cs.getItem(CLOUD_DATA_PREFIX + idx, function(e2, val) {
if (!e2 && val) parts[idx] = val;
loaded++;
check();
});
})(i);
}
} catch(e) {}
});
}
function deepRecovery() {
var found = [];
var keys = ['neurodeck_full_save', 'neurodeck_backup', 'neurodeck_cards_backup', 'neurodeck_goals'];
var bestData = null;
var bestCount = 0;
keys.forEach(function(key) {
try {
var raw = localStorage.getItem(key);
if (!raw) return;
var data = JSON.parse(raw);
var cardCount = (data.forged && data.forged.length) || (data.goals && data.goals.length) || 0;
if (cardCount > 0) {
found.push(key + ': ' + cardCount + ' элем.');
if (data.forged && data.forged.length > bestCount) {
bestCount = data.forged.length;
bestData = data;
}
}
} catch(e) {}
});
loadFromIDB(function(idbResult) {
if (idbResult && idbResult.data) {
var idbData = idbResult.data;
var idbCount = (idbData.forged && idbData.forged.length) || 0;
if (idbCount > 0) {
found.push('IndexedDB: ' + idbCount + ' карточек (от ' + new Date(idbResult.ts).toLocaleString('ru') + ')');
if (idbCount > bestCount) {
bestCount = idbCount;
bestData = idbData;
}
}
}
var cs = getCloudStorage();
if (cs) {
cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
if (err || !metaStr) { finishDeepRecovery(found, bestData, bestCount); return; }
try {
var meta = JSON.parse(metaStr);
var parts = new Array(meta.n);
var loaded = 0;
function check() {
if (loaded < meta.n) return;
try {
var data = JSON.parse(parts.join(''));
var cardCount = (data.forged && data.forged.length) || 0;
if (cardCount > 0) {
found.push('Облако: ' + cardCount + ' карточек (от ' + new Date(meta.t).toLocaleString('ru') + ')');
if (cardCount > bestCount) {
bestCount = cardCount;
bestData = data;
}
}
} catch(e) {}
finishDeepRecovery(found, bestData, bestCount);
}
for (var i = 0; i < meta.n; i++) {
(function(idx) {
cs.getItem(CLOUD_DATA_PREFIX + idx, function(e2, val) {
if (!e2 && val) parts[idx] = val;
loaded++;
check();
});
})(i);
}
} catch(e) { finishDeepRecovery(found, bestData, bestCount); }
});
} else {
finishDeepRecovery(found, bestData, bestCount);
}
});
}
function finishDeepRecovery(found, bestData, bestCount) {
if (bestData && bestCount > 0) {
var list = found.length > 0 ? found.join('<br>') : '';
dungeonConfirm('♻ Глубокое восстановление',
'Найдено данных с карточками: <b style="color:var(--gold-bright)">' + bestCount + '</b><br>' +
(list ? '<div style="font-size:10px;color:var(--text-dim);margin-top:6px;">' + list + '</div>' : '') +
'<br><span style="color:var(--gold-bright)">Восстановить ' + bestCount + ' карточек?</span>'
).then(function(ok) {
if (ok) {
applySyncData(bestData);
saveGameState();
showToast('♻ Восстановлено!', bestCount + ' карточек возвращены');
spiritSay('«То, что было потеряно — найдено.»');
screenShake(6, 400);
}
});
} else {
showToast('⚠ Ничего не найдено', 'Нет сохранений с карточками ни локально, ни в облаке', 'blood');
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
setInterval(function() { checkDailyReset(); updatePunishCountdown(); checkBloodOath(); }, 60 * 1000);
setInterval(checkGoalDeadlines, 30000);
checkGoalDeadlines();
window.addEventListener('beforeunload', function() { saveGameState(); forceCloudSave(); });
const CLOUD_MAX_CHUNK = 4096;
const CLOUD_META_KEY = 'nd_meta';
const CLOUD_DATA_PREFIX = 'nd_';
function getCloudStorage() {
try { return window.Telegram && Telegram.WebApp && Telegram.WebApp.CloudStorage ? Telegram.WebApp.CloudStorage : null; } catch(e) { return null; }
}
function buildSyncData() {
return {
v: 'nd-sync-v4', t: Date.now(),
hero: HERO, stats: STATS, forged: FORGED, goals: GOALS, inventory: INVENTORY,
escapeProgress, bossHp, bossStage, bossDefeated, lastDayReset, chimeraShield,
forgedIdCounter, uidCounter, goalIdCounter, xpHistory, bloodOath, bossRagePoints, lastWeekReset
};
}
function updateCloudStatus() {
var cs = getCloudStorage();
var el = document.getElementById('cloudStatus');
if (!el) return;
if (!cs) {
el.innerHTML = '⚠ <b style="color:var(--gold-bright)">Откройте в Telegram</b> для облака<br><span style="font-size:10px">Файловый способ работает всегда</span>';
return;
}
el.textContent = '☁ Проверяю...';
cs.getItem(CLOUD_META_KEY, function(err, val) {
if (!el) return;
if (err) { el.textContent = '⚠ Ошибка доступа к облаку'; return; }
if (val) {
try {
var meta = JSON.parse(val);
el.innerHTML = '☁ Сохранено: <b style="color:var(--gold-bright)">' + new Date(meta.t).toLocaleString('ru') + '</b>';
} catch(e) { el.textContent = '☁ Облако доступно'; }
} else {
el.textContent = '☁ Облако доступно. Нет сохранений.';
}
});
}
function saveToCloud() {
var cs = getCloudStorage();
if (!cs) { showToast('⚠ Недоступно', 'Откройте в Telegram', 'blood'); return; }
var el = document.getElementById('cloudStatus');
if (el) el.textContent = '☁ Сохраняю...';
var json = JSON.stringify(buildSyncData());
var chunks = [];
for (var i = 0; i < json.length; i += CLOUD_MAX_CHUNK) { chunks.push(json.slice(i, i + CLOUD_MAX_CHUNK)); }
var finished = false;
setTimeout(function() {
if (!finished) {
finished = true;
if (el) el.textContent = '⚠ Таймаут облака — используйте файл';
showToast('⚠ Таймаут', 'Облако не ответило. Скачайте файл.', 'blood');
}
}, 10000);
var doneCount = 0;
function saveMeta() {
cs.setItem(CLOUD_META_KEY, JSON.stringify({n: chunks.length, t: Date.now()}), function(err) {
if (finished) return;
finished = true;
if (!err) {
updateCloudStatus();
showToast('☁ Сохранено в облако', 'Доступно на всех устройствах');
spiritSay('«Облако запомнило твой путь.»');
} else {
if (el) el.textContent = '⚠ Ошибка записи метаданных';
showToast('⚠ Ошибка', String(err), 'blood');
}
});
}
chunks.forEach(function(chunk, idx) {
cs.setItem(CLOUD_DATA_PREFIX + idx, chunk, function(err) {
if (finished) return;
doneCount++;
if (doneCount === chunks.length) saveMeta();
});
});
if (chunks.length === 0) { finished = true; if (el) el.textContent = '⚠ Нет данных'; }
}
function loadFromCloud() {
var cs = getCloudStorage();
if (!cs) { showToast('⚠ Недоступно', 'Откройте в Telegram', 'blood'); return; }
dungeonConfirm('☁ Загрузить из облака?', 'Текущие данные будут перезаписаны.').then(function(ok) {
if (!ok) return;
var el = document.getElementById('cloudStatus');
if (el) el.textContent = '☁ Загружаю...';
var finished = false;
setTimeout(function() {
if (!finished) {
finished = true;
if (el) el.textContent = '⚠ Таймаут загрузки';
showToast('⚠ Таймаут', 'Облако не ответило', 'blood');
}
}, 10000);
cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
if (finished) return;
if (err || !metaStr) {
finished = true;
showToast('⚠ Пусто', 'В облаке нет сохранений', 'blood');
updateCloudStatus();
return;
}
var meta;
try { meta = JSON.parse(metaStr); } catch(e) { finished = true; showToast('⚠ Ошибка', 'Повреждённые данные', 'blood'); return; }
var parts = new Array(meta.n);
var loaded = 0;
function check() {
if (loaded < meta.n || finished) return;
finished = true;
try {
var data = JSON.parse(parts.join(''));
applySyncData(data);
showToast('☁ Загружено', new Date(data.t).toLocaleString('ru'));
spiritSay('«Облако поделилось воспоминаниями...»');
screenShake(6, 400);
closeSyncModal();
saveGameState();
} catch(e) { showToast('⚠ Ошибка', 'Данные повреждены', 'blood'); updateCloudStatus(); }
}
for (var i = 0; i < meta.n; i++) {
(function(idx) {
cs.getItem(CLOUD_DATA_PREFIX + idx, function(err2, val) {
if (!err2 && val) parts[idx] = val;
loaded++;
check();
});
})(i);
}
});
});
}
function openSyncModal() { document.getElementById('syncModal').classList.add('show'); updateCloudStatus(); }
function closeSyncModal() { document.getElementById('syncModal').classList.remove('show'); }
function generateShareLink() {
var json = JSON.stringify(buildSyncData());
var encoded = btoa(unescape(encodeURIComponent(json)));
return window.location.origin + window.location.pathname + '#' + encoded;
}
function copyShareLink() {
var link = generateShareLink();
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(link).then(function() {
showToast('📋 Ссылка скопирована', 'Отправь себе в «Избранное» в Telegram');
}).catch(function() { fallbackCopy(link); });
} else { fallbackCopy(link); }
}
function fallbackCopy(text) {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.left = '-9999px';
document.body.appendChild(ta);
ta.select();
document.execCommand('copy');
ta.remove();
showToast('📋 Ссылка скопирована', 'Отправь себе в «Избранное» в Telegram');
}
function shareLinkNative() {
var link = generateShareLink();
if (navigator.share) {
navigator.share({title: 'NeuroDeck — Мой прогресс', url: link}).catch(function() {});
} else {
copyShareLink();
}
}
function importFromHash() {
var hash = window.location.hash;
if (!hash || hash.length < 3) return;
try {
var encoded = hash.slice(1);
var json = decodeURIComponent(escape(atob(encoded)));
var data = JSON.parse(json);
if (!data.v || !data.hero) { window.location.hash = ''; return; }
dungeonConfirm('📥 Данные из ссылки', 'Прогресс от <b>' + new Date(data.t).toLocaleString('ru') + '</b>. Импортировать?<br><br><span style="color:var(--blood-bright)">Текущие данные будут перезаписаны.</span>').then(function(ok) {
if (!ok) { window.location.hash = ''; return; }
applySyncData(data);
window.location.hash = '';
showToast('📥 Импортировано из ссылки', 'Прогресс восстановлен');
spiritSay('«Путь продолжается...»');
screenShake(6, 400);
saveGameState();
});
} catch(e) {
window.location.hash = '';
}
}
function downloadSyncFile() {
try {
const data = buildSyncData();
const json = JSON.stringify(data);
const blob = new Blob([json], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'neurodeck-backup-' + new Date().toISOString().split('T')[0] + '.ndsync';
a.click();
URL.revokeObjectURL(url);
showToast('💾 Файл сохранён', 'Резервная копия загружена');
} catch (e) { showToast('⚠ Ошибка', 'Не удалось сохранить файл', 'blood'); }
}
function importSyncFile(event) {
const file = event.target.files[0];
if (!file) return;
const reader = new FileReader();
reader.onload = function(e) {
try {
var data = JSON.parse(e.target.result);
dungeonConfirm('📥 Импортировать из файла?', 'Текущие данные будут перезаписаны.').then(function(ok) {
if (!ok) return;
applySyncData(data);
showToast('✅ Импортировано', 'Данные из файла');
spiritSay('«Чужие воспоминания... но теперь они твои.»');
screenShake(6, 400);
closeSyncModal();
saveGameState();
});
} catch(err) { showToast('⚠ Ошибка', 'Неверный формат файла', 'blood'); }
};
reader.readAsText(file);
event.target.value = '';
}
function applySyncData(data, skipRender) {
if (data.hero) {
Object.assign(HERO, data.hero);
HERO.hp = Math.max(0, HERO.hp || 0);
HERO.maxHp = Math.max(1, HERO.maxHp || 1);
HERO.xp = Math.max(0, HERO.xp || 0);
HERO.xpToNext = Math.max(1, HERO.xpToNext || 1);
HERO.level = Math.max(1, Math.min(99, HERO.level || 1));
}
if (data.stats) {
Object.keys(data.stats).forEach(k => {
if (STATS[k]) {
Object.assign(STATS[k], data.stats[k]);
STATS[k].value = Math.max(0, Math.min(STATS[k].max || 100, STATS[k].value || 0));
STATS[k].attributePoints = Math.max(0, STATS[k].attributePoints || 0);
}
});
}
if (data.forged) FORGED = data.forged.map(function(c) {
if (!c.rank) c.rank = 'C';
if (typeof c.mastery !== 'number') c.mastery = 0;
if (typeof c.masteryThreshold !== 'number') c.masteryThreshold = 7;
if (typeof c.streak !== 'number') c.streak = 0;
return c;
});
if (data.goals) GOALS = Array.isArray(data.goals) ? data.goals : [];
if (data.inventory) {
INVENTORY.backpack = Array.isArray(data.inventory.backpack) ? data.inventory.backpack : [];
INVENTORY.equipped = data.inventory.equipped || INVENTORY.equipped;
}
if (typeof data.escapeProgress === 'number') escapeProgress = Math.max(0, Math.min(ESCAPE_MAX, data.escapeProgress));
if (typeof data.bossHp === 'number') bossHp = Math.max(0, data.bossHp);
if (typeof data.bossStage === 'number') bossStage = Math.min(Math.max(data.bossStage, 0), 2);
if (typeof data.bossDefeated === 'boolean') bossDefeated = data.bossDefeated;
if (data.lastDayReset) lastDayReset = data.lastDayReset;
if (typeof data.chimeraShield === 'number') chimeraShield = data.chimeraShield;
if (data.forgedIdCounter) forgedIdCounter = data.forgedIdCounter;
if (data.uidCounter) uidCounter = data.uidCounter;
if (data.goalIdCounter) goalIdCounter = data.goalIdCounter;
if (Array.isArray(data.xpHistory)) xpHistory = data.xpHistory;
if (data.bossKills) window._bossKills = data.bossKills;
if (data.bloodOath !== undefined) bloodOath = data.bloodOath;
if (typeof data.bossRagePoints === 'number') bossRagePoints = data.bossRagePoints;
if (typeof data.lastWeekReset === 'string') lastWeekReset = data.lastWeekReset;
if (typeof HERO.actionPoints !== 'number') HERO.actionPoints = 0;
if (!skipRender) {
renderCards(); renderStats(); updateHeroUI(); renderGoals();
renderBackpack(); renderSlots(); updateTotalBonuses(); updateDamageInfo();
updateEscapeDisplay(); renderMap(escapeProgress);
changeBossHp(0);
}
}
function resetAllData() {
dungeonConfirm('🗑 Удалить ВСЕ данные?', 'Это действие <b>нельзя отменить</b>. Весь прогресс будет потерян навсегда.').then(function(ok) {
if (!ok) return;
localStorage.removeItem('neurodeck_goals');
localStorage.removeItem('neurodeck_full_save');
localStorage.removeItem('neurodeck_backup');
localStorage.removeItem('neurodeck_cards_backup');
location.reload();
});
}
document.getElementById('syncModal').addEventListener('click', (e) => { if (e.target.id === 'syncModal') closeSyncModal(); });
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
}, remaining - 1800000);
}
});
}, 5000);
}
function initNotifs() {
updateNotifBtn();
if (notifEnabled && Notification.permission === 'granted') scheduleNotifs();
}
initNotifs();
document.getElementById('syncModal').addEventListener('click', (e) => { if (e.target.id === 'syncModal') closeSyncModal(); });
document.getElementById('roomDetailModal').addEventListener('click', (e) => { if (e.target.id === 'roomDetailModal') closeRoomDetail(); });
document.getElementById('syncFileInput').addEventListener('change', importSyncFile);
document.addEventListener('keydown', (e) => {
if ((e.ctrlKey || e.metaKey) && e.key === 's') {
e.preventDefault();
openSyncModal();
}
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
function spawnBloodRain(n) { for (let i = 0; i < n; i++) { setTimeout(() => { const d = document.createElement('div'); d.className = 'blood-drop'; d.style.left = (Math.random() * 100) + 'vw'; d.style.animationDuration = (1 + Math.random() * 1.5) + 's'; d.style.opacity = 0.4 + Math.random() * 0.6; document.body.appendChild(d); setTimeout(() => d.remove(), 3000); }, i * 30); } }
function showToast(title, body, type) {
type = type || '';
const el = document.getElementById('toast');
el.querySelector('.t-title').textContent = title;
el.querySelector('.t-body').textContent = body;
el.style.borderLeftColor = type === 'blood' ? 'var(--blood-bright)' : type === 'crit' || type === 'save' ? '#fbbf24' : 'var(--gold-bright)';
el.style.borderColor = type === 'blood' ? 'var(--blood)' : type === 'crit' || type === 'save' ? '#fbbf24' : 'var(--gold)';
el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
setTimeout(() => el.classList.remove('show'), 3500);
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
const progressSlider = document.getElementById('progressSlider');
progressSlider.disabled = true;
document.addEventListener('mousemove', (e) => {
const r1 = document.getElementById('mistRect1');
const r2 = document.getElementById('mistRect2');
if (!r1 || !r2) return;
const x = (e.clientX / window.innerWidth - 0.5) * 40;
const y = (e.clientY / window.innerHeight - 0.5) * 25;
r1.setAttribute('transform', 'translate(' + x + ', ' + y + ')');
r2.setAttribute('transform', 'translate(' + (-x * 0.5) + ', ' + (-y * 0.5) + ')');
});
var ONBOARDING_STEPS = [
{ icon: '⚔', title: 'Добро пожаловать в NeuroDeck', text: 'Это геймифицированный трекер привычек.<br>Ты — узник подземелья. Твоё оружие — дисциплина.' },
{ icon: '📖', title: 'Колода карточек', text: 'Каждая карточка — привычка, которую нужно выполнять ежедневно.<br>Нажми <b>✓</b> чтобы выполнить, <b>✕</b> чтобы пропустить.<br>Пропуск = босс копит <b style="color:var(--blood-bright)">Ярость</b>.' },
{ icon: '🔥', title: 'Ранги и мастерство', text: 'Выполняй карточку — растёт Мастерство.<br>При достижении порога карточка повышает ранг: C → CC → CCC → B → ... → SSS.<br>Ранг-ап = +1 к пулу атрибута.' },
{ icon: '🐍', title: 'Босс подземелья', text: 'Бой идёт <b>понедельно</b>:<br>⛏ <b>Пн–Чт</b> — накапливай <b style="color:#60a5fa">Очки Действия</b> за выполнение карточек.<br>⚔ <b>Пт–Вс</b> — атакуй босса вручную, тратя ОД.<br>Когда ОД = 0 — босс бьёт в ответ (Ярость × 15 HP).' },
{ icon: '👤', title: 'Герой и атрибуты', text: '5 очков пула = +1 к атрибуту.<br>Сила = урон, Интеллект = XP бонус, Харизма = шанс крита.<br>Уровень даёт +1 ко всем статам.' },
{ icon: '🎯', title: 'Цели', text: 'Ставь цели с дедлайном и текстовыми шагами.<br>Выполнение цели = XP + Очки Действия + очки атрибута.<br>Провал по дедлайну = +Ярость боссу.' },
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
chimeraShield = 5;
const newBoss = getCurrentBoss();
    bossHp = newBoss.stages[0].maxHp;
    saveGameState();
}
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
if (FORGED.length === 0) { setTimeout(deepRecovery, 1000); }
if (!getCloudStorage()) { setTimeout(function() { updateSyncBadge('offline'); }, 1500); }
else { setTimeout(function() { updateSyncBadge('syncing'); smartCloudSync(); }, 2500); }
if (HERO.lastSessionAt && Date.now() - HERO.lastSessionAt > 86400000 && FORGED.length > 0) {
setTimeout(showReturnScreen, 1500);
} else {
HERO.lastSessionAt = Date.now();
}
if (!localStorage.getItem('neurodeck_full_save') && !localStorage.getItem('neurodeck_onboarding_done')) {
setTimeout(function() { startOnboarding(); }, 1200);
} else {
setTimeout(() => {
spiritSay('«Ты очнулся в Камере заключенного... Выкуй первое испытание.»');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 30, { color: '#d4a574', speed: 4, decay: 0.015, size: 2, shape: 'spark', gravity: 0.05 });
}, 800);
}
