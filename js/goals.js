var ND = window.ND || {};

ND.openGoalModal = function() {
  var modal = document.getElementById('goalModal');
  if (!modal) return;
  modal.style.display = 'flex';
  var deadlineInput = document.getElementById('goalDeadline');
  if (deadlineInput) {
    var d = new Date();
    d.setDate(d.getDate() + 7);
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    deadlineInput.value = yyyy + '-' + mm + '-' + dd;
  }
  var nameInput = document.getElementById('goalName');
  if (nameInput) {
    setTimeout(function() { nameInput.focus(); }, 100);
  }
  ND.Store.ui = ND.Store.ui || {};
  ND.Store.ui.selectedGoalType = 'daily';
  ND.Store.ui.selectedGoalStat = 'str';
  ND.renderGoalTypeSelector();
  ND.renderGoalStatChips();
};

ND.closeGoalModal = function() {
  var modal = document.getElementById('goalModal');
  if (modal) modal.style.display = 'none';
  var nameInput = document.getElementById('goalName');
  if (nameInput) nameInput.value = '';
  var stepsInput = document.getElementById('goalSteps');
  if (stepsInput) stepsInput.value = '';
  var deadlineInput = document.getElementById('goalDeadline');
  if (deadlineInput) deadlineInput.value = '';
};

ND.createGoal = function() {
  var nameInput = document.getElementById('goalName');
  var stepsInput = document.getElementById('goalSteps');
  var deadlineInput = document.getElementById('goalDeadline');
  var name = nameInput ? nameInput.value.trim() : '';
  var steps = stepsInput ? parseInt(stepsInput.value, 10) : 0;
  var deadline = deadlineInput ? deadlineInput.value : '';
  if (!name) {
    ND.showToast('Введите название цели');
    return;
  }
  if (!steps || steps < 1) steps = 1;
  var type = (ND.Store.ui && ND.Store.ui.selectedGoalType) || 'daily';
  var stat = (ND.Store.ui && ND.Store.ui.selectedGoalStat) || 'str';
  var reward = ND.CONST.GOAL_REWARDS[type] || ND.CONST.GOAL_REWARDS.daily;
  ND.Store.goalIdCounter = ND.Store.goalIdCounter || 1;
  var goal = {
    id: ND.Store.goalIdCounter++,
    name: name,
    type: type,
    stat: stat,
    steps: steps,
    currentStep: 0,
    completed: false,
    deadline: deadline || null,
    createdAt: Date.now(),
    xpReward: reward.xp || 50,
    dmgReward: reward.dmg || 0,
    statBonus: reward.statBonus || 0
  };
  ND.Store.goals.push(goal);
  ND.closeGoalModal();
  ND.burstParticles();
  ND.showToast('Цель создана: ' + name);
  ND.saveGameState();
  ND.renderGoals();
  ND.switchView('hero');
};

ND.renderGoals = function() {
  var container = document.getElementById('goalsList');
  if (!container) return;
  ND.Store.ui = ND.Store.ui || {};
  var filter = ND.Store.ui.currentGoalFilter || 'all';
  var goals = ND.Store.goals || [];
  var filtered = goals;
  if (filter === 'active') {
    filtered = goals.filter(function(g) { return !g.completed; });
  } else if (filter === 'completed') {
    filtered = goals.filter(function(g) { return g.completed; });
  } else if (filter === 'daily') {
    filtered = goals.filter(function(g) { return g.type === 'daily'; });
  } else if (filter === 'weekly') {
    filtered = goals.filter(function(g) { return g.type === 'weekly'; });
  } else if (filter === 'monthly') {
    filtered = goals.filter(function(g) { return g.type === 'monthly'; });
  }
  var html = '';
  html += '<div class="goal-filters">';
  var filters = [
    { key: 'all', label: 'Все' },
    { key: 'active', label: 'Активные' },
    { key: 'completed', label: 'Завершённые' },
    { key: 'daily', label: 'Дневные' },
    { key: 'weekly', label: 'Недельные' },
    { key: 'monthly', label: 'Месячные' }
  ];
  for (var i = 0; i < filters.length; i++) {
    var f = filters[i];
    var cls = filter === f.key ? 'goal-filter-btn active' : 'goal-filter-btn';
    html += '<button class="' + cls + '" data-action="filter-goals" data-filter="' + f.key + '">' + f.label + '</button>';
  }
  html += '</div>';
  if (filtered.length === 0) {
    html += '<div class="goals-empty">Нет целей</div>';
  } else {
    for (var j = 0; j < filtered.length; j++) {
      var g = filtered[j];
      var progress = g.steps > 0 ? Math.min(g.currentStep / g.steps, 1) : 0;
      var pct = Math.round(progress * 100);
      var deadlineText = '';
      if (g.deadline) {
        var now = new Date();
        var dl = new Date(g.deadline + 'T23:59:59');
        var diff = dl.getTime() - now.getTime();
        if (diff < 0) {
          deadlineText = '<span class="goal-deadline overdue">Просрочено</span>';
        } else {
          var daysLeft = Math.ceil(diff / 86400000);
          deadlineText = '<span class="goal-deadline">' + daysLeft + ' дн. осталось</span>';
        }
      }
      var typeLabel = { daily: 'Дневная', weekly: 'Недельная', monthly: 'Месячная' };
      html += '<div class="goal-card' + (g.completed ? ' completed' : '') + '">';
      html += '<div class="goal-header">';
      html += '<span class="goal-type-badge ' + g.type + '">' + (typeLabel[g.type] || g.type) + '</span>';
      html += '<span class="goal-name">' + g.name + '</span>';
      html += deadlineText;
      html += '</div>';
      html += '<div class="goal-progress-bar"><div class="goal-progress-fill" style="width:' + pct + '%"></div></div>';
      html += '<div class="goal-progress-text">' + g.currentStep + ' / ' + g.steps + ' (' + pct + '%)</div>';
      html += '<div class="goal-rewards">';
      html += '<span class="goal-reward">XP: ' + g.xpReward + '</span>';
      if (g.dmgReward) html += '<span class="goal-reward">Урон: ' + g.dmgReward + '</span>';
      if (g.statBonus) html += '<span class="goal-reward stat-' + g.stat + '">' + g.stat.toUpperCase() + ': +' + g.statBonus + '</span>';
      html += '</div>';
      html += '<div class="goal-actions">';
      if (!g.completed) {
        html += '<button class="goal-btn advance" data-action="advance-goal" data-goal-id="' + g.id + '">Шаг</button>';
        html += '<button class="goal-btn complete" data-action="complete-goal" data-goal-id="' + g.id + '">Завершить</button>';
      }
      html += '<button class="goal-btn delete" data-action="delete-goal" data-goal-id="' + g.id + '">Удалить</button>';
      html += '</div>';
      html += '</div>';
    }
  }
  container.innerHTML = html;
};

ND.advanceGoal = function(id) {
  var goals = ND.Store.goals || [];
  var goal = null;
  for (var i = 0; i < goals.length; i++) {
    if (goals[i].id === id) { goal = goals[i]; break; }
  }
  if (!goal || goal.completed) return;
  goal.currentStep++;
  var partialXp = Math.round(goal.xpReward / goal.steps);
  ND.addXpReward(partialXp);
  ND.checkAttributePoolGrowth();
  ND.showToast('+1 шаг — +' + partialXp + ' XP');
  if (goal.currentStep >= goal.steps) {
    ND.completeGoal(id);
    return;
  }
  ND.saveGameState();
  ND.renderGoals();
  ND.updateHeroUI();
};

ND.completeGoal = function(id) {
  var goals = ND.Store.goals || [];
  var goal = null;
  for (var i = 0; i < goals.length; i++) {
    if (goals[i].id === id) { goal = goals[i]; break; }
  }
  if (!goal || goal.completed) return;
  goal.completed = true;
  goal.currentStep = goal.steps;
  ND.addXpReward(goal.xpReward);
  if (goal.dmgReward) {
    ND.changeBossHp(-goal.dmgReward);
  }
  if (goal.statBonus) {
    var attrs = ND.Store.hero && ND.Store.hero.attributes;
    if (attrs && attrs[goal.stat] !== undefined) {
      attrs[goal.stat] += goal.statBonus;
    }
  }
  ND.checkAttributePoolGrowth();
  ND.burstParticles();
  ND.screenShake();
  ND.showToast('Цель завершена: ' + goal.name + '!');
  ND.spiritSay('Отличная работа! Цель достигнута!');
  ND.saveGameState();
  ND.renderGoals();
  ND.updateHeroUI();
};

ND.deleteGoal = function(id) {
  if (!confirm('Удалить эту цель?')) return;
  var goals = ND.Store.goals || [];
  ND.Store.goals = goals.filter(function(g) { return g.id !== id; });
  ND.saveGameState();
  ND.renderGoals();
};

ND.renderGoalTypeSelector = function() {
  var container = document.getElementById('goalTypeSelector');
  if (!container) return;
  var selected = (ND.Store.ui && ND.Store.ui.selectedGoalType) || 'daily';
  var types = [
    { key: 'daily', label: 'Дневная' },
    { key: 'weekly', label: 'Недельная' },
    { key: 'monthly', label: 'Месячная' }
  ];
  var html = '';
  for (var i = 0; i < types.length; i++) {
    var t = types[i];
    var cls = t.key === selected ? 'goal-type-btn active' : 'goal-type-btn';
    html += '<button class="' + cls + '" data-action="select-goal-type" data-type="' + t.key + '">' + t.label + '</button>';
  }
  container.innerHTML = html;
};

ND.renderGoalStatChips = function() {
  var container = document.getElementById('goalStatChips');
  if (!container) return;
  var selected = (ND.Store.ui && ND.Store.ui.selectedGoalStat) || 'str';
  var stats = [
    { key: 'str', label: 'СИЛ' },
    { key: 'dex', label: 'ЛОВ' },
    { key: 'int', label: 'ИНТ' },
    { key: 'wis', label: 'МДР' },
    { key: 'con', label: 'ВЫН' },
    { key: 'cha', label: 'ХАР' }
  ];
  var html = '';
  for (var i = 0; i < stats.length; i++) {
    var s = stats[i];
    var cls = s.key === selected ? 'goal-stat-chip active' : 'goal-stat-chip';
    html += '<button class="' + cls + '" data-action="select-goal-stat" data-stat="' + s.key + '">' + s.label + '</button>';
  }
  container.innerHTML = html;
};

(function() {
  document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (action === 'close-goal-modal') {
      ND.closeGoalModal();
    } else if (action === 'create-goal') {
      ND.createGoal();
    } else if (action === 'advance-goal') {
      var gid1 = parseInt(el.getAttribute('data-goal-id'), 10);
      if (gid1) ND.advanceGoal(gid1);
    } else if (action === 'complete-goal') {
      var gid2 = parseInt(el.getAttribute('data-goal-id'), 10);
      if (gid2) ND.completeGoal(gid2);
    } else if (action === 'delete-goal') {
      var gid3 = parseInt(el.getAttribute('data-goal-id'), 10);
      if (gid3) ND.deleteGoal(gid3);
    } else if (action === 'select-goal-type') {
      ND.Store.ui = ND.Store.ui || {};
      ND.Store.ui.selectedGoalType = el.getAttribute('data-type') || 'daily';
      ND.renderGoalTypeSelector();
    } else if (action === 'select-goal-stat') {
      ND.Store.ui = ND.Store.ui || {};
      ND.Store.ui.selectedGoalStat = el.getAttribute('data-stat') || 'str';
      ND.renderGoalStatChips();
    } else if (action === 'filter-goals') {
      ND.Store.ui = ND.Store.ui || {};
      ND.Store.ui.currentGoalFilter = el.getAttribute('data-filter') || 'all';
      ND.renderGoals();
    }
  });
})();

window.ND = ND;
