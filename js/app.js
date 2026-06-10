// ============ СИСТЕМА LEARN BY DOING ============
const ATTR_POOL_THRESHOLD = 5;
const HERO_XP_CURVE = [100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000, 1024000, 2048000];
function getXpToNext(level) {
if (level - 1 < HERO_XP_CURVE.length) return HERO_XP_CURVE[level - 1];
return HERO_XP_CURVE[HERO_XP_CURVE.length - 1] * Math.pow(2, level - HERO_XP_CURVE.length);
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
level: 1, xp: 0, xpToNext: 100, totalXp: 0,
hp: 100, maxHp: 100, isHollow: false,
consecutivePerfectDays: 0, estus: 3,
lastEstusReset: new Date().getMonth(),
estusUsedToday: false, dailyCompletions: 0, dailySkips: 0
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
const LOOT_CHANCE = 0.08;
const BOSS_HEAL_ON_FAIL = 8;
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
case 'download-sync-file': downloadSyncFile(); break;
case 'choose-sync-file': document.getElementById('syncFileInput').click(); break;
case 'export-json': exportJson(); break;
case 'reset-all-data': resetAllData(); break;
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
case 'drink-estus': drinkEstus(); break;
case 'complete-card': completeCard(e, parseInt(el.dataset.id)); break;
case 'fail-card': failCard(e, parseInt(el.dataset.id)); break;
case 'edit-card': openEditCardDirect(parseInt(el.dataset.id)); break;
case 'delete-card': deleteCard(parseInt(el.dataset.id)); break;
case 'equip-item': equipItem(el.dataset.uid); break;
case 'unequip-item': unequipItem(el.dataset.slot); break;
case 'discard-item': discardItem(el.dataset.uid); break;
case 'advance-goal': advanceGoal(parseInt(el.dataset.id)); break;
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
function getAdaptationMultiplier(card) {
const days = card.daysActive || 0;
if (days < 7) return 1.0;
if (days < 15) return 0.5;
return 0.1;
}
function getAdaptationLabel(mult) {
if (mult >= 1.0) return { label: '100%', cls: 'adapt-100' };
if (mult >= 0.5) return { label: '50%', cls: 'adapt-50' };
return { label: '10%', cls: 'adapt-10' };
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
const adaptationMult = getAdaptationMultiplier(card);
const adaptInfo = getAdaptationLabel(adaptationMult);
const st = STATS[card.stat] || STATS.str;
const progressPct = Math.min(100, Math.round((card.mastery / card.masteryThreshold) * 100));
const el = document.createElement('div');
el.className = 'card rank-' + card.rank;
const doneToday = card.lastCompletedAt && getMSKDayKey(card.lastCompletedAt) === getMSKDayKey();
if (doneToday) el.className += ' done-today';
const nextRankText = getNextRank(card.rank) || 'MAX';
el.innerHTML =
'<div class="card-actions">' +
    (doneToday ? '<div class="card-btn done-today-btn" title="Уже выполнено сегодня">✓</div>' : '<div class="card-btn" data-action="complete-card" data-id="' + card.id + '" title="Выполнить">✓</div>') +
   '<div class="card-btn fail" data-action="fail-card" data-id="' + card.id + '" title="Пропустить">✕</div>' +
   '<div class="card-btn edit" data-action="edit-card" data-id="' + card.id + '" title="Редактировать">✎</div>' +
   '<div class="card-btn delete" data-action="delete-card" data-id="' + card.id + '" title="Удалить">🗑</div>' +
'</div>' +
'<div class="card-rank">' + card.rank + '</div>' +
'<div class="card-name">' + esc(card.name) + '</div>' +
'<div class="card-meta">' + esc(card.meta || '') + '</div>' +
'<div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">' +
  '<span class="card-stat-tag" style="color: ' + st.color + '; border-color: ' + st.color + '40;">' +
    '<span>' + st.icon + '</span> ' + st.name +
  '</span>' +
  '<span class="card-adaptation-tag ' + adaptInfo.cls + '">⚡ ' + adaptInfo.label + '</span>' +
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
return;
}
const btn = e.target.closest('[data-action]') || e.target;
const rect = btn.getBoundingClientRect();
const x = rect.left + rect.width/2, y = rect.top + rect.height/2;
burstParticles(x, y, 28, { color: '#f4c896', speed: 5, decay: 0.02, size: 3, shape: 'spark', gravity: 0.08 });
card.daysActive = getCardDaysActive(card);
const adaptationMult = getAdaptationMultiplier(card);
if (!card.firstCompletedAt) {
card.firstCompletedAt = Date.now();
card.daysActive = 0;
}
const baseCardXp = 15;
const gear = getTotalGearBonuses();
const totalInt = STATS.int.value + gear.int;
const heroIntBonus = 1 + (totalInt - 3) * 0.01;
const finalXp = Math.round(baseCardXp * adaptationMult * heroIntBonus);
HERO.xp += finalXp; HERO.totalXp += finalXp;
recordXpEvent(finalXp);
spawnFloatNumber(x, y - 20, '+' + finalXp + ' XP', '#f4c896');
const masteryGain = adaptationMult;
card.mastery += masteryGain;
card.totalCompletions = (card.totalCompletions || 0) + 1;
card.streak = (card.streak || 0) + 1;
card.lastCompletedAt = Date.now();
HERO.hp = Math.min(calcMaxHp(), HERO.hp + 2);
HERO.dailyCompletions++;
let rankUpHappened = false;
if (card.mastery >= card.masteryThreshold) {
const nextRank = getNextRank(card.rank);
if (nextRank) {
const oldRank = card.rank;
card.rank = nextRank;
card.mastery = card.mastery - card.masteryThreshold;
card.masteryThreshold = Math.max(2, Math.round(card.masteryThreshold * 1.15));
if (card.stat && STATS[card.stat]) {
STATS[card.stat].attributePoints = (STATS[card.stat].attributePoints || 0) + 1;
checkAttributePoolGrowth(card.stat);
}
rankUpHappened = true;
escapeProgress = Math.min(ESCAPE_MAX, escapeProgress + 1);
updateEscapeDisplay();
renderMap(escapeProgress);
setTimeout(() => triggerRankUpEffect(card, oldRank, nextRank, x, y), 300);
} else {
card.mastery = card.masteryThreshold;
showToast('👑 МАКСИМУМ!', card.name + ' достигла SSS', 'crit');
spiritSay('«Легенда... Твоя дисциплина несокрушима.»');
}
}
const totalStr = STATS.str.value + gear.str;
const totalCha = STATS.cha.value + gear.cha;
const sumAllStats = Object.values(STATS).reduce((a, s) => a + s.value, 0);
let baseDmg = BASE_DAMAGE + Math.floor(sumAllStats * 0.5) + Math.floor(gear.str / 5);
const critChance = Math.min(0.5, totalCha * 0.02);
const crit = Math.random() < critChance;
let dmg = crit ? baseDmg * 2 : baseDmg;
if (HERO.isHollow) dmg = Math.floor(dmg * 0.5);
changeBossHp(-dmg);
if (Math.random() < LOOT_CHANCE) dropRandomLoot(x, y);
checkHeroLevelUp();
renderCards();
updateHeroUI();
renderStats();
if (!rankUpHappened) {
if (crit) {
showToast('⚡ КРИТ!', '-' + dmg + ' HP боссу (шанс: ' + Math.round(critChance*100) + '%)', 'crit');
burstParticles(x, y, 40, { color: '#fbbf24', speed: 8, decay: 0.015, size: 4, shape: 'star', gravity: 0.1 });
screenShake(6, 300);
} else {
const adaptTxt = adaptationMult < 1 ? ' (адаптация ' + Math.round(adaptationMult*100) + '%)' : '';
showToast('✅ Выполнено', '+' + finalXp + ' XP' + adaptTxt + ' · +' + masteryGain.toFixed(1) + ' Мастерства');
}
}
saveGameState();
}
function failCard(e, id) {
spawnBloodRain(25);
screenShake(10, 500);
const card = findCard(id);
HERO.dailySkips++;
const gear = getTotalGearBonuses();
const totalWil = STATS.wil.value + gear.wil;
if (Math.random() < (totalWil / 300)) {
showToast('🧘 Воля!', 'Стрик защищён.', 'save');
return;
}
changeBossHp(BOSS_HEAL_ON_FAIL);
if (card) { card.streak = 0; renderCards(); }
showToast('💀 Пропуск', 'Босс восстановил +' + BOSS_HEAL_ON_FAIL + ' HP', 'blood');
updateHeroUI();
saveGameState();
}
function deleteCard(id) {
const card = findCard(id);
if (!card) return;
if (!confirm('Удалить карточку «' + card.name + '»? Мастерство будет потеряно.')) return;
FORGED = FORGED.filter(c => c.id !== id);
renderCards();
showToast('🗑 Удалено', card.name, 'blood');
saveGameState();
}
function checkAttributePoolGrowth(statKey) {
const stat = STATS[statKey];
let leveledUp = false;
while (stat.attributePoints >= ATTR_POOL_THRESHOLD && stat.value < stat.max) {
stat.attributePoints -= ATTR_POOL_THRESHOLD;
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
let segmentsHtml = '';
for (let i = 0; i < ATTR_POOL_THRESHOLD; i++) {
segmentsHtml += '<div class="stat-attr-segment ' + (i < st.attributePoints ? 'filled' : '') + '"></div>';
}
el.innerHTML =
'<div class="stat-card-head">' +
  '<div class="stat-icon">' + st.icon + '<div class="stat-value-big" id="statVal-' + key + '">' + st.value + '</div></div>' +
  '<div class="stat-info"><div class="stat-name">' + st.name + '</div><div class="stat-desc">' + st.desc + '</div></div>' +
'</div>' +
'<div class="stat-bar"><div class="stat-bar-fill" id="statBar-' + key + '" style="width:' + pct + '%"></div></div>' +
'<div class="stat-bar-label"><span>Атрибут</span><span><b>' + st.value + '</b> / ' + st.max + '</span></div>' +
'<div class="stat-attr-pool">' +
  '<div class="stat-attr-label"><span>Пул очков</span><span><b>' + st.attributePoints + '</b> / ' + ATTR_POOL_THRESHOLD + '</span></div>' +
  '<div class="stat-attr-bar">' + segmentsHtml + '</div>' +
  '<div class="stat-attr-hint">Растёт при повышении ранга карточек ' + st.name + '</div>' +
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
let segmentsHtml = '';
for (let i = 0; i < ATTR_POOL_THRESHOLD; i++) {
segmentsHtml += '<div class="stat-attr-segment ' + (i < stat.attributePoints ? 'filled' : '') + '"></div>';
}
poolEl.innerHTML = segmentsHtml;
}
const poolLabelEl = document.querySelector('#stat-' + statKey + ' .stat-attr-label');
if (poolLabelEl) {
poolLabelEl.innerHTML = '<span>Пул очков</span><span><b>' + stat.attributePoints + '</b> / ' + ATTR_POOL_THRESHOLD + '</span>';
}
}
function calcMaxHp() { return 100 + Math.max(0, (HERO.level - 1) * 5) + STATS.end.value; }
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
document.getElementById('estusCount').textContent = HERO.estus;
const estusBtn = document.getElementById('estusBtn');
if (HERO.estusUsedToday || HERO.estus <= 0) estusBtn.disabled = true;
else estusBtn.disabled = false;
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
'Итого: <b style="color:var(--blood-bright)">' + total + '</b> за ✓';
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
document.getElementById('lvlNum').textContent = HERO.level;
const ov = document.getElementById('lvlOverlay'), bn = document.getElementById('lvlBanner');
document.getElementById('lvlSub').textContent = (HERO.level - 1) + ' → ' + HERO.level;
ov.classList.remove('show'); bn.classList.remove('show'); void ov.offsetWidth;
ov.classList.add('show'); bn.classList.add('show');
const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
burstParticles(cx, cy, 100, { color: '#fbbf24', speed: 14, decay: 0.008, size: 4, shape: 'star', gravity: 0.12, life: 1.3 });
screenShake(8, 400);
Object.keys(STATS).forEach(k => {
STATS[k].value = Math.min(STATS[k].max, STATS[k].value + 1);
updateStatUI(k);
});
HERO.maxHp = calcMaxHp();
const hpGain = HERO.maxHp - HERO.hp;
HERO.hp = HERO.maxHp;
document.getElementById('lvlSub2').textContent = '+' + hpGain + ' HP · Все статы +1';
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
poolHint.textContent = '+1 к пулу ' + st.name + ' (' + st.attributePoints + '/' + ATTR_POOL_THRESHOLD + ')';
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
const adaptationMult = getAdaptationMultiplier(card);
const adaptInfo = getAdaptationLabel(adaptationMult);
const hintEl = document.getElementById('editCardAdaptHint');
hintEl.innerHTML = 'Текущая адаптация: <b style="color:var(--blood-bright)">' + adaptInfo.label + '</b>. Усложни карточку (увеличь время или порог), чтобы вернуть 100%!';
const warningEl = document.getElementById('editCardWarning');
if (adaptationMult < 1.0) {
warningEl.style.display = 'block';
warningEl.innerHTML = '⚠ Ранг повышен! Текущая адаптация ' + adaptInfo.label + ' — усложни карточку, чтобы вернуть 100% эффективности!';
} else {
warningEl.style.display = 'block';
warningEl.innerHTML = '⚠ Ранг повышен! Усложни карточку, чтобы предотвратить снижение эффективности в будущем.';
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
    const adaptationMult = getAdaptationMultiplier(card);
    const adaptInfo = getAdaptationLabel(adaptationMult);
    const hintEl = document.getElementById('editCardAdaptHint');
    hintEl.innerHTML = 'Текущая адаптация: <b style="color:var(--blood-bright)">' + adaptInfo.label + '</b>. Усложни карточку (увеличь время или порог), чтобы вернуть 100%!';
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
card.daysActive = 0;
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
document.getElementById('bossHpFill').style.width = pct + '%';
document.getElementById('bossHpText').textContent = Math.round(pct) + '%';
const ff = document.getElementById('bossHpFillFull'), ft = document.getElementById('bossHpTextFull');
if (ff) ff.style.width = pct + '%';
if (ft) ft.textContent = Math.round(pct) + '%';
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
addXpReward(1000);
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
swordDiscipline: { id: 'swordDiscipline', name: 'Меч Дисциплины', icon: '⚔', rank: 'A', slot: 'weapon', type: 'Оружие', category: 'weapon', lore: 'Выкован из стали тех обещаний, что ты сдержал.', bonuses: [{ stat: 'str', value: 5, label: '⚔ Сила' }, { stat: 'wil', value: 2, label: '🧘 Воля' }], special: '+10% к урону по боссам' },
shieldWill: { id: 'shieldWill', name: 'Щит Воли', icon: '🛡', rank: 'A', slot: 'shield', type: 'Щит', category: 'armor', lore: 'Тяжесть этого щита — вес твоих решений.', bonuses: [{ stat: 'end', value: 6, label: '🛡 Стойкость' }, { stat: 'wil', value: 3, label: '🧘 Воля' }], special: 'Защита стрика +15%' },
amuletFocus: { id: 'amuletFocus', name: 'Амулет Фокуса', icon: '💠', rank: 'S', slot: 'amulet', type: 'Амулет', category: 'accessory', lore: 'Кристалл, в котором застыло мгновение полной концентрации.', bonuses: [{ stat: 'int', value: 8, label: '🧠 Интеллект' }, { stat: 'wil', value: 3, label: '🧘 Воля' }], special: '+15% XP за привычки' },
ringCharisma: { id: 'ringCharisma', name: 'Кольцо Обаяния', icon: '💍', rank: 'B', slot: 'ring1', type: 'Кольцо', category: 'accessory', lore: 'Тёплое на ощупь. Люди оборачиваются, когда ты проходишь.', bonuses: [{ stat: 'cha', value: 5, label: '🎭 Харизма' }], special: 'Шанс крита +5%' },
bootsWanderer: { id: 'bootsWanderer', name: 'Сапоги Странника', icon: '👢', rank: 'B', slot: 'boots', type: 'Обувь', category: 'armor', lore: 'Сто тысяч шагов впитались в эту кожу.', bonuses: [{ stat: 'agi', value: 5, label: '⚡ Ловкость' }, { stat: 'end', value: 2, label: '🛡 Стойкость' }], special: null },
crownArchon: { id: 'crownArchon', name: 'Корона Архонта', icon: '👑', rank: 'S', slot: 'head', type: 'Головной убор', category: 'armor', lore: 'Не для слабых. Надевший её уже не сможет вернуться.', bonuses: [{ stat: 'str', value: 3, label: '⚔ Сила' }, { stat: 'end', value: 3, label: '🛡 Стойкость' }, { stat: 'int', value: 3, label: '🧠 Интеллект' }, { stat: 'cha', value: 3, label: '🎭 Харизма' }, { stat: 'wil', value: 3, label: '🧘 Воля' }, { stat: 'agi', value: 3, label: '⚡ Ловкость' }], special: 'Все атрибуты +3' },
capeShadows: { id: 'capeShadows', name: 'Плащ Теней', icon: '🧣', rank: 'A', slot: 'cape', type: 'Плащ', category: 'armor', lore: 'Соткан из тех ночей, когда ты не сдался.', bonuses: [{ stat: 'wil', value: 5, label: '🧘 Воля' }, { stat: 'agi', value: 3, label: '⚡ Ловкость' }], special: 'Невидимость от искушений' },
chestVirtue: { id: 'chestVirtue', name: 'Кираса Доблести', icon: '🧥', rank: 'A', slot: 'chest', type: 'Нагрудник', category: 'armor', lore: 'Каждая пластина — выигранная битва с собой.', bonuses: [{ stat: 'end', value: 8, label: '🛡 Стойкость' }, { stat: 'str', value: 3, label: '⚔ Сила' }], special: null },
ringInsight: { id: 'ringInsight', name: 'Кольцо Прозрения', icon: '💎', rank: 'A', slot: 'ring2', type: 'Кольцо', category: 'accessory', lore: 'В его грани отражаются мысли, что ты не успел забыть.', bonuses: [{ stat: 'int', value: 5, label: '🧠 Интеллект' }, { stat: 'cha', value: 2, label: '🎭 Харизма' }], special: null },
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
'<div class="item-actions">' +
(isEquipped
? '<button class="item-btn danger" data-action="unequip-item" data-slot="' + item.slot + '">↶ Снять</button>'
: '<button class="item-btn" data-action="equip-item" data-uid="' + item.uid + '">⚔ Экипировать</button><button class="item-btn danger" data-action="discard-item" data-uid="' + item.uid + '">✕ Выбросить</button>') +
'</div>';
}
function equipItem(uid) {
const item = INVENTORY.backpack.find(i => i.uid === uid);
if (!item) return;
let targetSlot = item.slot;
if (item.slot === 'ring1' && INVENTORY.equipped.ring1 && !INVENTORY.equipped.ring2) targetSlot = 'ring2';
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
selectedItemId = null;
renderBackpack(); renderSlots(); updateTotalBonuses(); updateDamageInfo(); renderStats();
renderItemPanel(INVENTORY.equipped[targetSlot], 'equipped');
saveGameState();
}
function unequipItem(slotName) {
const item = INVENTORY.equipped[slotName];
if (!item) return;
if (INVENTORY.backpack.length >= INVENTORY.maxSlots) { showToast('🎒 Рюкзак полон', 'Освободи место', 'blood'); return; }
INVENTORY.backpack.push(Object.assign({}, item, { slot: item.slot === 'ring2' ? 'ring1' : item.slot }));
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
if (!confirm('Точно выбросить «' + item.name + '»?')) return;
INVENTORY.backpack = INVENTORY.backpack.filter(i => i.uid !== uid);
showToast('✕ Выброшено', item.name, 'blood');
selectedItemId = null;
renderBackpack();
document.getElementById('itemPanelContent').innerHTML = '<div class="empty-state">Слот пуст.</div>';
saveGameState();
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
short:  { xp: 20, dmg: 5, statXp: 1, label: 'Краткая' },
medium: { xp: 50, dmg: 12, statXp: 2, label: 'Средняя' },
long:   { xp: 120, dmg: 25, statXp: 5, label: 'Долгая' },
};
let GOALS = [], goalIdCounter = 1, selectedGoalType = 'short', selectedGoalStat = 'str', currentGoalFilter = 'all';
try { const saved = localStorage.getItem('neurodeck_goals'); if (saved) { const p = JSON.parse(saved); GOALS = p.goals || []; goalIdCounter = p.counter || 1; } } catch (e) {}
function saveGoals() { try { localStorage.setItem('neurodeck_goals', JSON.stringify({ goals: GOALS, counter: goalIdCounter })); } catch (e) {} }
function openGoalModal() {
document.getElementById('goalModal').classList.add('show');
const d = new Date(); d.setDate(d.getDate() + 7);
document.getElementById('goalDeadline').value = d.toISOString().split('T')[0];
setTimeout(() => document.getElementById('goalName').focus(), 100);
}
function closeGoalModal() {
document.getElementById('goalModal').classList.remove('show');
document.getElementById('goalName').value = '';
document.getElementById('goalDesc').value = '';
document.getElementById('goalSteps').value = '5';
selectedGoalType = 'short'; selectedGoalStat = 'str';
updateGoalTypeSelection(); updateGoalStatChips();
}
function updateGoalTypeSelection() { document.querySelectorAll('#goalTypeSelector .goal-type-option').forEach(o => o.classList.toggle('selected', o.dataset.type === selectedGoalType)); }
function updateGoalStatChips() { document.querySelectorAll('#goalStatChips .stat-chip').forEach(c => c.classList.toggle('selected', c.dataset.stat === selectedGoalStat)); }
updateGoalTypeSelection(); updateGoalStatChips();
function createGoal() {
const name = document.getElementById('goalName').value.trim();
if (!name) { showToast('⚠ Ошибка', 'Введите название', 'blood'); return; }
const deadline = document.getElementById('goalDeadline').value;
const totalSteps = parseInt(document.getElementById('goalSteps').value) || 5;
const desc = document.getElementById('goalDesc').value.trim();
const rewards = GOAL_REWARDS[selectedGoalType];
const goal = { id: goalIdCounter++, type: selectedGoalType, name, desc, deadline, totalSteps, currentStep: 0, stat: selectedGoalStat, xp: rewards.xp, dmg: rewards.dmg, statBonus: rewards.statXp, completed: false, createdAt: Date.now(), lastStepAt: null };
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
const progressPct = (goal.currentStep / goal.totalSteps) * 100;
const daysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
const daysText = daysLeft === null ? '' : daysLeft > 0 ? daysLeft + ' дн.' : daysLeft === 0 ? 'Сегодня!' : 'Просрочено';
const el = document.createElement('div');
el.className = 'goal-card ' + goal.type + ' ' + (goal.completed ? 'completed' : '');
    el.innerHTML =
    '<div class="goal-head"><div class="goal-name">' + esc(goal.name) + '</div><div class="goal-type-badge">' + rewards.label + '</div></div>' +
    (goal.desc ? '<div style="font-size: 11px; color: var(--text-dim); font-style: italic; margin-bottom: 8px;">' + esc(goal.desc) + '</div>' : '') +
'<div class="goal-meta">' +
(daysText ? '<span>📅 <b>' + daysText + '</b></span>' : '') +
'<span>✨ <b>+' + goal.xp + ' XP</b></span>' +
'<span class="dmg">⚔ <b>-' + goal.dmg + ' HP</b></span>' +
'<span style="color:' + st.color + '">' + st.icon + ' <b>+' + goal.statBonus + ' пул</b></span>' +
'</div>' +
'<div class="goal-progress-wrap"><div class="goal-progress-bar"><div class="goal-progress-fill" style="width:' + progressPct + '%"></div></div><div class="goal-progress-label"><b>' + goal.currentStep + '</b>/' + goal.totalSteps + '</div></div>' +
'<div class="goal-actions">' +
(!goal.completed ? (goal.currentStep < goal.totalSteps - 1 ? '<button class="goal-btn" data-action="advance-goal" data-id="' + goal.id + '">+ Шаг</button>' : '<button class="goal-btn complete" data-action="complete-goal" data-id="' + goal.id + '">✓ Выполнить</button>') : '<button class="goal-btn" disabled style="opacity: 0.5;">✓ Выполнено</button>') +
'<button class="goal-btn delete" data-action="delete-goal" data-id="' + goal.id + '">✕</button>' +
'</div>';
list.appendChild(el);
});
updateHeroSummary();
}
function advanceGoal(id) {
const goal = GOALS.find(g => g.id === id);
if (!goal || goal.completed) return;
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
if (!goal || goal.completed) return;
goal.completed = true; goal.currentStep = goal.totalSteps;
    const color = goal.type === 'short' ? '#34d399' : goal.type === 'medium' ? '#60a5fa' : '#fbbf24';
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 120, { color, speed: 12, decay: 0.008, size: 4, shape: 'star', gravity: 0.1, life: 1.3 });
screenShake(10, 500);
addXpReward(goal.xp);
if (goal.stat && STATS[goal.stat]) {
STATS[goal.stat].attributePoints = (STATS[goal.stat].attributePoints || 0) + goal.statBonus;
checkAttributePoolGrowth(goal.stat);
}
    changeBossHp(-goal.dmg);
    const statIcon = goal.stat && STATS[goal.stat] ? STATS[goal.stat].icon + ' ' + STATS[goal.stat].name : '';
    showToast('🏆 Цель достигнута!', '+' + goal.xp + ' XP · -' + goal.dmg + ' HP' + (statIcon ? ' · +' + goal.statBonus + ' к пулу ' + statIcon : ''), 'crit');
spiritSay('«' + goal.name + '... Ты стал сильнее.»');
renderGoals();
saveGameState();
}
function deleteGoal(id) {
const goal = GOALS.find(g => g.id === id);
if (!goal) return;
if (!confirm('Удалить цель «' + goal.name + '»?')) return;
GOALS = GOALS.filter(g => g.id !== id);
saveGoals(); renderGoals();
showToast('✕ Удалено', goal.name, 'blood');
saveGameState();
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
const masteryThreshold = Math.max(2, parseInt(document.getElementById('forgeMastery').value) || 7);
const st = STATS[selectedStat];
const card = {
id: forgedIdCounter++, name, meta: st.icon + ' ' + duration + ' мин · ' + time,
rank, streak: 0, stat: selectedStat, progress: 0,
mastery: 0, masteryThreshold, totalCompletions: 0,
daysActive: 0, firstCompletedAt: null, lastCompletedAt: null
};
FORGED.unshift(card);
    renderCards(); closeForge();
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
const tabEl = document.querySelector('.tab[data-view="' + view + '"]');
const bnavEl = document.querySelector('.bnav-btn[data-view="' + view + '"]');
if (tabEl) tabEl.classList.add('active');
if (bnavEl) bnavEl.classList.add('active');
document.getElementById('view-' + view).classList.add('active');
if (view === 'hero') { renderStats(); updateHeroUI(); renderGoals(); }
if (view === 'map') renderMap(escapeProgress);
if (view === 'inv') { renderBackpack(); renderSlots(); updateTotalBonuses(); }
if (view === 'deck') renderCards();
if (view === 'boss') updateBossDisplay();
if (view === 'stats') renderStatsView();
}
const ROOMS = [
{ name: 'Камера заключенного', icon: '⛓', lore: 'Здесь начинается твой путь.' },
{ name: 'Коридор Забытых', icon: '🚪', lore: 'Шаги эхом в пустоте.' },
{ name: 'Склеп Обетов', icon: '💀', lore: 'Здесь погребены обещания.' },
{ name: 'Зал Разбитых Зеркал', icon: '🪞', lore: 'Отражения лжи.' },
{ name: 'Катакомбы Сомнений', icon: '🕳', lore: 'Там, где живут страхи.' },
{ name: 'Пещера Теней', icon: '🌑', lore: 'Тени шепчут твоё имя.' },
{ name: 'Библиотека Рун', icon: '📜', lore: 'Знание — оружие.' },
{ name: 'Тронный Зал', icon: '👑', lore: 'Здесь правил страх.' },
{ name: 'Сад Забытых', icon: '🌺', lore: 'Мечты, что не сбылись.' },
{ name: 'Мост Раскаяния', icon: '🌉', lore: 'Переправа через сомнения.' },
{ name: 'Башня Снов', icon: '🗼', lore: 'Верх мира.' },
{ name: 'Кузница Воли', icon: '⚒', lore: 'Здесь закаляется характер.' },
{ name: 'Алтарь Истины', icon: '🕯', lore: 'Правда о себе.' },
{ name: 'Врата Свободы', icon: '🌅', lore: 'Выход из подземелья.' },
];
const ESCAPE_MAX = 140;
const ROOMS_STEP = 10;
let escapeProgress = 0;
let lastDayReset = null;
let lastPunishDate = null;
function renderMap(progress) {
const container = document.getElementById('mapRooms');
if (!container) return;
container.innerHTML = '';
document.getElementById('mapProgressNum').textContent = progress;
document.getElementById('mapProgressFill').style.width = ((progress / ESCAPE_MAX) * 100) + '%';
const idx = Math.min(Math.floor(progress / ROOMS_STEP), ROOMS.length - 1);
document.getElementById('mapRoomText').textContent = 'Ты в: ' + ROOMS[idx].name;
ROOMS.forEach((room, i) => {
const unlocked = progress >= (i + 1) * ROOMS_STEP;
const current = progress >= i * ROOMS_STEP && progress < (i + 1) * ROOMS_STEP;
const el = document.createElement('div');
el.className = 'map-room ' + (unlocked ? 'unlocked' : current ? 'current' : 'locked');
const remaining = current ? ((i + 1) * ROOMS_STEP - progress) : 0;
el.innerHTML =
'<div class="map-room-icon" style="filter: ' + (unlocked || current ? 'none' : 'grayscale(1) blur(1px)') + ';">' + room.icon + '</div>' +
'<div class="map-room-name">' + room.name + '</div>' +
'<div class="map-room-status">' + (unlocked ? '✓ ' + room.lore : current ? '▶ ' + room.lore + ' (ещё ' + remaining + ')' : '🔒 ' + ((i + 1) * ROOMS_STEP - progress) + ' ранг-апов') + '</div>';
container.appendChild(el);
});
}
renderMap(0);
function updateEscapeDisplay() {
document.getElementById('progressVal').textContent = escapeProgress + ' / ' + ESCAPE_MAX;
document.getElementById('mapProgressNum').textContent = escapeProgress;
document.getElementById('mapProgressFill').style.width = ((escapeProgress / ESCAPE_MAX) * 100) + '%';
const idx = Math.min(Math.floor(escapeProgress / ROOMS_STEP), ROOMS.length - 1);
document.getElementById('mapRoomText').textContent = 'Ты в: ' + ROOMS[idx].name;
updateAtmosphereByEscape();
}
function updateAtmosphereByEscape() {
const pct = escapeProgress / ESCAPE_MAX;
const root = document.documentElement.style;
let hue, light, sat, mist, torch, rays;
if (pct < 0.2) { hue = 0; light = 0; sat = 0; mist = 0.8; torch = 0.2; rays = 0; }
else if (pct < 0.5) { const p = (pct - 0.2) / 0.3; hue = p * 60; light = p * 15; sat = p * 30; mist = 0.8 - p * 0.25; torch = 0.2 + p * 0.4; rays = 0; }
else if (pct < 0.8) { const p = (pct - 0.5) / 0.3; hue = 60 + p * 140; light = 15 + p * 25; sat = 30 + p * 20; mist = 0.55 - p * 0.25; torch = 0.6 - p * 0.2; rays = p * 0.3; }
else { const p = (pct - 0.8) / 0.2; hue = 200 - p * 170; light = 40 + p * 40; sat = 50 - p * 20; mist = 0.3 - p * 0.2; torch = 0.4 + p * 0.3; rays = 0.3 + p * 0.5; }
root.setProperty('--atmosphere-hue', hue);
root.setProperty('--atmosphere-light', light);
root.setProperty('--atmosphere-sat', sat);
root.setProperty('--mist-opacity', mist);
root.setProperty('--torch-intensity', torch);
root.setProperty('--light-rays-opacity', rays);
}
function drinkEstus() {
if (HERO.estus > 0 && !HERO.estusUsedToday) {
HERO.estus--;
HERO.estusUsedToday = true;
updateHeroUI();
showToast('🧪 Эстус выпит', 'Босс не нанесёт урон сегодня в 23:00', 'save');
spiritSay('«Теплое пламя наполняет тебя решимостью...»');
saveGameState();
} else if (HERO.estusUsedToday) {
showToast('⚠ Уже выпито сегодня', 'Эстус действует только раз в день', 'blood');
} else {
showToast('⚠ Нет фляг', 'Дождитесь следующего месяца', 'blood');
}
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
document.getElementById('bossPanelTitle').textContent = boss.icon + ' ' + boss.name + (bossDefeated ? ' (ПОВЕРЖЕН)' : ' (Стадия ' + (bossStage + 1) + '/3)');
const viewBossTitle = document.querySelector('#view-boss .view-title');
    if (viewBossTitle) viewBossTitle.textContent = boss.icon + ' Босс локации';
    document.getElementById('bossSubtitle').textContent = boss.name + ' · ' + (boss.type === 'chimera' ? 'Имеет щит. Нужно 5 карточек за день.' : boss.type === 'social' ? 'Двойной урон за пропуск Воли/Интеллекта' : 'Он ждёт твоего провала');
document.getElementById('bossLoreText').innerHTML =
'<b style="color:var(--blood-bright)">«' + stage.desc + '»</b><br><br>' +
'Каждый день в 23:00 МСК я наказываю тебя:<br>' +
'• <b style="color:var(--blood-bright)">-' + (10 * stage.dmgMult) + ' HP</b> за каждую невыполненную карточку<br>' +
'• <b style="color:var(--blood-bright)">-' + (15 * stage.dmgMult) + ' HP</b> за каждую невыполненную цель<br><br>' +
'Каждая выполненная карточка — удар, от которого я трескаюсь. Экипируй артефакты в <b style="color:var(--gold-bright)">Инвентаре</b> для увеличения урона.';
}
function updatePunishCountdown() { /* stub */ }
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
const todayKey = getMSKDayKey();
if (xpHistory.length === 0 || xpHistory[xpHistory.length - 1].date !== todayKey) {
xpHistory.push({ date: todayKey, xp: 0 });
}
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
'</div></div>';
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
function checkDailyReset() {
const todayKey = getMSKDayKey();
if (lastDayReset !== todayKey) {
        if (lastDayReset !== null) {
            const allCards = [...FORGED];
            const uncompletedCards = allCards.filter(c => {
                if (!c.lastCompletedAt) return true;
                return getMSKDayKey(c.lastCompletedAt) !== lastDayReset;
            });
            const uncompletedGoals = GOALS.filter(g => !g.completed && getMSKDayKey(g.createdAt) < lastDayReset);
            if ((uncompletedCards.length > 0 || uncompletedGoals.length > 0) && !HERO.estusUsedToday) {
                const boss = getCurrentBoss();
                const stage = boss.stages[bossStage];
                const cardDmg = uncompletedCards.length * Math.round(10 * stage.dmgMult);
                const goalDmg = uncompletedGoals.length * Math.round(15 * stage.dmgMult);
                const totalDmg = cardDmg + goalDmg;
                if (totalDmg > 0) {
                    HERO.hp = Math.max(0, HERO.hp - totalDmg);
                    spawnBloodRain(15);
                    screenShake(8, 500);
                    showToast('💀 Наказание!', 'Босс нанёс -' + totalDmg + ' HP (' + uncompletedCards.length + ' карточек, ' + uncompletedGoals.length + ' целей)', 'blood');
                    spiritSay('«Боль — учитель. Завтра будь сильнее.»');
                    if (HERO.hp <= 0 && !HERO.isHollow) {
                        HERO.isHollow = true;
                        HERO.hp = Math.floor(HERO.maxHp * 0.25);
                        showToast('💀 ТЫ ПАЛ', 'Стань Полым. Урон -50%. 3 идеальных дня для искупления.', 'blood');
                    }
                }
            }
        }
        if (HERO.dailyCompletions > 0 && HERO.dailySkips === 0) {
HERO.consecutivePerfectDays = (HERO.consecutivePerfectDays || 0) + 1;
} else {
HERO.consecutivePerfectDays = 0;
}
if (HERO.isHollow && HERO.consecutivePerfectDays >= 3) {
HERO.isHollow = false;
HERO.hp = Math.floor(HERO.maxHp * 0.5);
showToast('✨ Искупление совершено!', 'Вы вернули свою человечность. HP восстановлено.', 'crit');
spiritSay('«Тьма отступает. Ты снова чувствуешь тепло.»');
screenShake(8, 400);
}
HERO.dailyCompletions = 0;
HERO.dailySkips = 0;
HERO.estusUsedToday = false;
chimeraShield = 5;
const currentMonth = new Date().getMonth();
if (currentMonth !== HERO.lastEstusReset) {
HERO.estus = 3;
HERO.lastEstusReset = currentMonth;
showToast('🧪 Эстус обновлён', 'Фляги восстановлены на новый месяц', 'save');
}
FORGED.forEach(c => {
if (c.firstCompletedAt) {
c.daysActive = getCardDaysActive(c);
}
});
recordDailySnapshot();
lastDayReset = todayKey;
saveGameState();
renderCards();
}
}
function saveGameState() {
try {
const snapshot = {
hero: HERO, stats: STATS, forged: FORGED, goals: GOALS, inventory: INVENTORY,
escapeProgress, bossHp, bossStage, bossDefeated, lastPunishDate, lastDayReset, chimeraShield,
forgedIdCounter, uidCounter, goalIdCounter, xpHistory, savedAt: Date.now()
};
localStorage.setItem('neurodeck_full_save', JSON.stringify(snapshot));
saveGoals();
} catch (e) { console.warn('Save failed:', e); }
}
function loadGameState() {
try {
const raw = localStorage.getItem('neurodeck_full_save');
if (!raw) return;
const data = JSON.parse(raw);
if (data.hero) Object.assign(HERO, data.hero);
if (data.stats) {
Object.keys(data.stats).forEach(k => {
if (STATS[k]) {
Object.assign(STATS[k], data.stats[k]);
if (typeof STATS[k].attributePoints !== 'number') STATS[k].attributePoints = 0;
}
});
}
if (data.forged) FORGED = data.forged;
if (data.goals) GOALS = data.goals;
if (data.inventory) {
INVENTORY.backpack = data.inventory.backpack || [];
INVENTORY.equipped = data.inventory.equipped || INVENTORY.equipped;
}
if (typeof data.escapeProgress === 'number') escapeProgress = data.escapeProgress;
if (typeof data.bossHp === 'number') bossHp = data.bossHp;
if (typeof data.bossStage === 'number') bossStage = Math.min(Math.max(data.bossStage, 0), 2);
if (typeof data.bossDefeated === 'boolean') bossDefeated = data.bossDefeated;
if (data.lastPunishDate) lastPunishDate = data.lastPunishDate;
if (data.lastDayReset) lastDayReset = data.lastDayReset;
if (typeof data.chimeraShield === 'number') chimeraShield = data.chimeraShield;
if (data.forgedIdCounter) forgedIdCounter = data.forgedIdCounter;
if (data.uidCounter) uidCounter = data.uidCounter;
if (data.goalIdCounter) goalIdCounter = data.goalIdCounter;
if (Array.isArray(data.xpHistory)) xpHistory = data.xpHistory;
} catch (e) { console.warn('Load failed:', e); }
}
setInterval(() => { checkDailyReset(); updatePunishCountdown(); }, 60 * 1000);
window.addEventListener('beforeunload', saveGameState);
const CLOUD_MAX_CHUNK = 4000;
const CLOUD_META_KEY = 'nd_meta';
const CLOUD_DATA_PREFIX = 'nd_';
function getCloudStorage() {
try { return window.Telegram && Telegram.WebApp && Telegram.WebApp.CloudStorage ? Telegram.WebApp.CloudStorage : null; } catch(e) { return null; }
}
function buildSyncData() {
return {
v: 'nd-sync-v4', t: Date.now(),
hero: HERO, stats: STATS, forged: FORGED, goals: GOALS, inventory: INVENTORY,
escapeProgress, bossHp, bossStage, bossDefeated, lastPunishDate, lastDayReset, chimeraShield,
forgedIdCounter, uidCounter, goalIdCounter, xpHistory
};
}
function updateCloudStatus() {
var cs = getCloudStorage();
var el = document.getElementById('cloudStatus');
if (!el) return;
if (!cs) {
el.innerHTML = '⚠ <b style="color:var(--gold-bright)">Откройте в Telegram</b> для облачной синхронизации<br><span style="font-size:10px">Файловый способ доступен всегда</span>';
return;
}
el.innerHTML = '☁ Проверяю облако...';
cs.getItem(CLOUD_META_KEY, function(err, val) {
if (!el) return;
if (err) {
el.innerHTML = '⚠ Ошибка доступа к облаку';
return;
}
if (val) {
try {
var meta = JSON.parse(val);
var date = new Date(meta.savedAt).toLocaleString('ru');
el.innerHTML = '☁ Сохранено: <b style="color:var(--gold-bright)">' + date + '</b>' + (meta.chunks > 1 ? ' (' + meta.chunks + ' ч.)' : '');
} catch(e) {
el.innerHTML = '☁ Облако доступно';
}
} else {
el.innerHTML = '☁ Облако доступно. Сохранений нет.';
}
});
}
function cloudRemoveOld(cs, callback) {
cs.getKeys(function(err, keys) {
if (err || !keys || keys.length === 0) { callback(); return; }
var oldKeys = keys.filter(function(k) { return k === CLOUD_META_KEY || k.indexOf(CLOUD_DATA_PREFIX) === 0; });
if (oldKeys.length === 0) { callback(); return; }
var pending = oldKeys.length;
oldKeys.forEach(function(k) {
cs.removeItem(k, function() { pending--; if (pending === 0) callback(); });
});
});
}
function saveToCloud() {
var cs = getCloudStorage();
if (!cs) { showToast('⚠ Недоступно', 'Откройте в Telegram', 'blood'); return; }
var statusEl = document.getElementById('cloudStatus');
if (statusEl) statusEl.innerHTML = '☁ Сохраняю...';
var data = buildSyncData();
var json = JSON.stringify(data);
var chunks = [];
for (var i = 0; i < json.length; i += CLOUD_MAX_CHUNK) {
chunks.push(json.slice(i, i + CLOUD_MAX_CHUNK));
}
cloudRemoveOld(cs, function() {
var done = 0;
var ok = 0;
chunks.forEach(function(chunk, idx) {
cs.setItem(CLOUD_DATA_PREFIX + idx, chunk, function(err, success) {
done++;
if (!err && success !== false) ok++;
if (done === chunks.length) {
cs.setItem(CLOUD_META_KEY, JSON.stringify({chunks: chunks.length, savedAt: Date.now()}), function(err2) {
updateCloudStatus();
if (!err2 && ok === chunks.length) {
showToast('☁ Сохранено в облако', 'Доступно на всех устройствах');
spiritSay('«Облако запомнило твой путь.»');
} else {
showToast('⚠ Ошибка облака', ok + '/' + chunks.length + ' частей', 'blood');
}
});
}
});
});
});
}
function loadFromCloud() {
var cs = getCloudStorage();
if (!cs) { showToast('⚠ Недоступно', 'Откройте в Telegram', 'blood'); return; }
if (!confirm('⚠ Текущие данные будут перезаписаны из облака. Продолжить?')) return;
var statusEl = document.getElementById('cloudStatus');
if (statusEl) statusEl.innerHTML = '☁ Загружаю...';
cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
if (err || !metaStr) {
showToast('⚠ Пусто', 'В облаке нет сохранений', 'blood');
updateCloudStatus();
return;
}
var meta;
try { meta = JSON.parse(metaStr); } catch(e) { showToast('⚠ Ошибка', 'Повреждённые данные', 'blood'); return; }
var chunks = new Array(meta.chunks);
var loaded = 0;
function checkDone() {
if (loaded < meta.chunks) return;
var fullJson = chunks.join('');
try {
var data = JSON.parse(fullJson);
applySyncData(data);
showToast('☁ Загружено', 'Из облака: ' + new Date(data.t).toLocaleString('ru'));
spiritSay('«Облако поделилось воспоминаниями...»');
screenShake(6, 400);
closeSyncModal();
saveGameState();
} catch(e) { showToast('⚠ Ошибка', 'Данные повреждены', 'blood'); updateCloudStatus(); }
}
for (var i = 0; i < meta.chunks; i++) {
(function(idx) {
cs.getItem(CLOUD_DATA_PREFIX + idx, function(err2, val) {
if (!err2 && val) chunks[idx] = val;
loaded++;
checkDone();
});
})(i);
}
});
}
function openSyncModal() { document.getElementById('syncModal').classList.add('show'); updateCloudStatus(); }
function closeSyncModal() { document.getElementById('syncModal').classList.remove('show'); }
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
const data = JSON.parse(e.target.result);
if (!confirm('⚠ Текущие данные будут перезаписаны. Продолжить?')) return;
applySyncData(data);
showToast('✅ Импортировано', 'Данные из файла');
spiritSay('«Чужие воспоминания... но теперь они твои.»');
screenShake(6, 400);
closeSyncModal();
saveGameState();
} catch(err) { showToast('⚠ Ошибка', 'Неверный формат файла', 'blood'); }
};
reader.readAsText(file);
event.target.value = '';
}
function applySyncData(data) {
if (data.hero) Object.assign(HERO, data.hero);
if (data.stats) {
Object.keys(data.stats).forEach(k => {
if (STATS[k]) {
Object.assign(STATS[k], data.stats[k]);
if (typeof STATS[k].attributePoints !== 'number') STATS[k].attributePoints = 0;
}
});
}
if (data.forged) FORGED = data.forged;
if (data.goals) GOALS = data.goals;
if (data.inventory) {
INVENTORY.backpack = data.inventory.backpack || [];
INVENTORY.equipped = data.inventory.equipped || INVENTORY.equipped;
}
if (typeof data.escapeProgress === 'number') escapeProgress = data.escapeProgress;
if (typeof data.bossHp === 'number') bossHp = data.bossHp;
if (typeof data.bossStage === 'number') bossStage = Math.min(Math.max(data.bossStage, 0), 2);
if (typeof data.bossDefeated === 'boolean') bossDefeated = data.bossDefeated;
if (data.lastPunishDate) lastPunishDate = data.lastPunishDate;
if (data.lastDayReset) lastDayReset = data.lastDayReset;
if (typeof data.chimeraShield === 'number') chimeraShield = data.chimeraShield;
if (data.forgedIdCounter) forgedIdCounter = data.forgedIdCounter;
if (data.uidCounter) uidCounter = data.uidCounter;
if (data.goalIdCounter) goalIdCounter = data.goalIdCounter;
if (Array.isArray(data.xpHistory)) xpHistory = data.xpHistory;
renderCards(); renderStats(); updateHeroUI(); renderGoals();
renderBackpack(); renderSlots(); updateTotalBonuses(); updateDamageInfo();
updateEscapeDisplay(); renderMap(escapeProgress);
changeBossHp(0);
}
function resetAllData() {
if (!confirm('🗑 Удалить ВСЕ данные? Это действие нельзя отменить.')) return;
if (!confirm('⚠ ТОЧНО удалить весь прогресс?')) return;
localStorage.removeItem('neurodeck_goals');
localStorage.removeItem('neurodeck_full_save');
location.reload();
}
document.getElementById('syncModal').addEventListener('click', (e) => { if (e.target.id === 'syncModal') closeSyncModal(); });
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
resizeDust(); window.addEventListener('resize', resizeDust);
class Dust {
constructor() { this.x = Math.random() * dustCanvas.width; this.y = Math.random() * dustCanvas.height; this.vx = (Math.random() - 0.5) * 0.3; this.vy = -0.1 - Math.random() * 0.2; this.size = 0.5 + Math.random() * 1.5; this.alpha = 0.2 + Math.random() * 0.4; }
update() { this.x += this.vx; this.y += this.vy; this.vx += (Math.random() - 0.5) * 0.02; if (this.y < -10 || this.x < -10 || this.x > dustCanvas.width + 10) { this.x = Math.random() * dustCanvas.width; this.y = dustCanvas.height + 10; } }
draw(ctx) { ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = '#f4c896'; ctx.shadowBlur = 6; ctx.shadowColor = '#f4c896'; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
}
for (let i = 0; i < 60; i++) dustParticles.push(new Dust());
function animateDust() {
dustCtx.clearRect(0, 0, dustCanvas.width, dustCanvas.height);
const pct = parseInt(document.getElementById('progressSlider').value) / 140;
dustCanvas.style.opacity = pct > 0.4 ? Math.min(1, (pct - 0.4) * 1.5) : 0;
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
function burstParticles(x, y, count, o) { o = o || {}; const MAX_PARTICLES = 500; if (particles.length > MAX_PARTICLES) return; count = Math.min(count, MAX_PARTICLES - particles.length); for (let i = 0; i < count; i++) { const a = (i / count) * Math.PI * 2; const sp = (o.speed !== undefined ? o.speed : 6) * (0.5 + Math.random() * 0.5); particles.push(new Particle(x, y, Object.assign({}, o, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp }))); } }
function animate() { ctx.clearRect(0, 0, canvas.width, canvas.height); particles = particles.filter(p => p.life > 0); particles.forEach(p => { p.update(); p.draw(ctx); }); requestAnimationFrame(animate); }
animate();
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
const progressSlider = document.getElementById('progressSlider');
progressSlider.addEventListener('input', () => {
const v = parseInt(progressSlider.value);
escapeProgress = v;
updateEscapeDisplay();
renderMap(v);
});
document.addEventListener('mousemove', (e) => {
const r1 = document.getElementById('mistRect1');
const r2 = document.getElementById('mistRect2');
if (!r1 || !r2) return;
const x = (e.clientX / window.innerWidth - 0.5) * 40;
const y = (e.clientY / window.innerHeight - 0.5) * 25;
r1.setAttribute('transform', 'translate(' + x + ', ' + y + ')');
r2.setAttribute('transform', 'translate(' + (-x * 0.5) + ', ' + (-y * 0.5) + ')');
});
loadGameState();
checkDailyReset();
if (bossDefeated) {
    bossDefeated = false;
    bossStage = 0;
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
updateBossDisplay();
changeBossHp(0);
setTimeout(() => {
spiritSay('«Ты очнулся в Камере заключенного... Выкуй первое испытание.»');
burstParticles(window.innerWidth / 2, window.innerHeight / 2, 30, { color: '#d4a574', speed: 4, decay: 0.015, size: 2, shape: 'spark', gravity: 0.05 });
}, 800);
