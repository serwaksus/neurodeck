var ND = window.ND || {};

ND.renderStatsView = function() {
  var container = document.getElementById('statsContent');
  if (!container) return;
  var hero = ND.Store.hero || {};
  var goals = ND.Store.goals || [];
  var escape = ND.Store.escape || {};
  var boss = ND.Store.boss || {};
  var cards = ND.Store.cards || {};
  var history = ND.Store.history || [];
  var gear = ND.getTotalGearBonuses ? ND.getTotalGearBonuses() : {};

  var totalXp = hero.xp || 0;
  var level = hero.level || 1;
  var attrs = hero.attributes || {};
  var attrSum = 0;
  var attrKeys = ['str', 'dex', 'int', 'wis', 'con', 'cha'];
  for (var a = 0; a < attrKeys.length; a++) {
    attrSum += (attrs[attrKeys[a]] || 0);
  }

  var allCards = cards.all || [];
  var totalForged = 0;
  var totalCompleted = 0;
  var longestStreak = 0;
  var earliestDate = null;

  for (var c = 0; c < allCards.length; c++) {
    var card = allCards[c];
    if (card.forged) {
      totalForged++;
      if (card.totalCompletions) {
        totalCompleted += card.totalCompletions;
      }
      if (card.streak && card.streak > longestStreak) {
        longestStreak = card.streak;
      }
      if (card.firstCompletedAt) {
        if (!earliestDate || card.firstCompletedAt < earliestDate) {
          earliestDate = card.firstCompletedAt;
        }
      }
    }
  }

  var totalGoalsCreated = goals.length;
  var totalGoalsCompleted = 0;
  for (var g = 0; g < goals.length; g++) {
    if (goals[g].completed) totalGoalsCompleted++;
  }

  var escapeProgress = escape.progress || 0;
  var escapeMax = ND.CONST.ESCAPE_MAX || 100;

  var bossName = boss.name || 'Неизвестно';
  var bossStage = boss.stage || 1;

  var daysActive = 'N/A';
  if (earliestDate) {
    var start = new Date(earliestDate);
    var now = new Date();
    var diffMs = now.getTime() - start.getTime();
    var diffDays = Math.ceil(diffMs / 86400000);
    daysActive = diffDays;
  }

  var rankInfo = ND.getRankColorInfo ? ND.getRankColorInfo() : { name: 'N/A', color: '#888' };
  var adaptMult = ND.getAdaptationMultiplier ? ND.getAdaptationMultiplier() : 1;
  var adaptLabel = ND.getAdaptationLabel ? ND.getAdaptationLabel() : 'N/A';

  var html = '';
  html += '<div class="stats-section">';
  html += '<h3 class="stats-title">Статистика и Дневник</h3>';
  html += '<div class="stats-grid">';

  html += '<div class="stat-card"><div class="stat-label">Всего XP</div><div class="stat-value">' + totalXp + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Уровень</div><div class="stat-value">' + level + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Сумма атрибутов</div><div class="stat-value">' + attrSum + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Ранг</div><div class="stat-value" style="color:' + rankInfo.color + '">' + rankInfo.name + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Адаптация</div><div class="stat-value">' + adaptLabel + ' (x' + adaptMult.toFixed(2) + ')</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Карт создано</div><div class="stat-value">' + totalForged + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Карт выполнено</div><div class="stat-value">' + totalCompleted + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Макс. серия карт</div><div class="stat-value">' + longestStreak + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Целей создано</div><div class="stat-value">' + totalGoalsCreated + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Целей выполнено</div><div class="stat-value">' + totalGoalsCompleted + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Побег</div><div class="stat-value">' + escapeProgress + ' / ' + escapeMax + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Босс</div><div class="stat-value">' + bossName + ' (Этап ' + bossStage + ')</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Дней активно</div><div class="stat-value">' + daysActive + '</div></div>';

  html += '</div>';
  html += '</div>';

  html += '<div class="stats-section">';
  html += '<h3 class="stats-title">XP за последние 7 дней</h3>';
  html += '<div class="stats-chart-container">';
  html += '<canvas id="xpChartCanvas" width="500" height="200"></canvas>';
  html += '</div>';
  html += '</div>';

  container.innerHTML = html;

  ND.renderXpChart(history);
};

ND.renderXpChart = function(history) {
  var canvas = document.getElementById('xpChartCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var W = canvas.width;
  var H = canvas.height;
  var padding = 40;
  var chartW = W - padding * 2;
  var chartH = H - padding * 2;

  ctx.clearRect(0, 0, W, H);

  var today = new Date();
  var days = [];
  for (var d = 6; d >= 0; d--) {
    var dt = new Date(today);
    dt.setDate(dt.getDate() - d);
    var key = ND.getMSKDayKey ? ND.getMSKDayKey(dt) : ND.formatDayKey ? ND.formatDayKey(dt) : (dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'));
    var xp = 0;
    if (history && history.length) {
      for (var h = 0; h < history.length; h++) {
        if (history[h].date === key) {
          xp += history[h].xp || 0;
        }
      }
    }
    var label = String(dt.getDate()).padStart(2, '0') + '.' + String(dt.getMonth() + 1).padStart(2, '0');
    days.push({ date: key, xp: xp, label: label });
  }

  var maxXp = 0;
  for (var i = 0; i < days.length; i++) {
    if (days[i].xp > maxXp) maxXp = days[i].xp;
  }
  if (maxXp === 0) maxXp = 100;

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#333355';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, H - padding);
  ctx.lineTo(W - padding, H - padding);
  ctx.stroke();

  var gridLines = 4;
  ctx.fillStyle = '#666688';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  for (var gl = 0; gl <= gridLines; gl++) {
    var yVal = Math.round(maxXp / gridLines * gl);
    var yPos = H - padding - (chartH / gridLines * gl);
    ctx.fillText(yVal.toString(), padding - 5, yPos + 3);
    ctx.strokeStyle = '#222244';
    ctx.beginPath();
    ctx.moveTo(padding, yPos);
    ctx.lineTo(W - padding, yPos);
    ctx.stroke();
  }

  var barWidth = chartW / days.length;
  var hasData = false;
  for (var b = 0; b < days.length; b++) {
    if (days[b].xp > 0) hasData = true;
    var barH = maxXp > 0 ? (days[b].xp / maxXp) * chartH : 0;
    var x = padding + b * barWidth;
    var y = H - padding - barH;

    var gradient = ctx.createLinearGradient(x, y, x, H - padding);
    gradient.addColorStop(0, '#6c5ce7');
    gradient.addColorStop(1, '#2d1b69');
    ctx.fillStyle = gradient;
    ctx.fillRect(x + 4, y, barWidth - 8, barH);

    ctx.fillStyle = '#aaaacc';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(days[b].label, x + barWidth / 2, H - padding + 15);

    if (days[b].xp > 0) {
      ctx.fillStyle = '#ddddee';
      ctx.fillText(days[b].xp.toString(), x + barWidth / 2, y - 5);
    }
  }

  if (!hasData) {
    ctx.fillStyle = '#666688';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Нет данных', W / 2, H / 2);
  }
};

window.ND = ND;
