var ND = window.ND || {};

ND.checkAttributePoolGrowth = function(statKey) {
  var stat = ND.Store.stats[statKey];
  if (!stat) return;
  while (stat.pool >= ND.CONST.ATTR_POOL_THRESHOLD) {
    stat.value += 1;
    stat.pool -= ND.CONST.ATTR_POOL_THRESHOLD;
  }
  ND.updateStatUI(statKey);
  ND.updateHeroUI();
};

ND.checkHeroLevelUp = function() {
  var hero = ND.Store.hero;
  var changed = false;
  while (hero.xp >= ND.getXpToNext(hero.level)) {
    hero.xp -= ND.getXpToNext(hero.level);
    hero.level += 1;
    changed = true;
    ND.onLevelUp();
  }
  if (hero.level >= 15) {
    hero.name = 'Soul of Cinder';
    hero.title = 'Monarch';
  } else if (hero.level >= 10) {
    hero.name = 'Lord of Cinder';
    hero.title = 'Champion';
  } else if (hero.level >= 6) {
    hero.name = 'Chosen Undead';
    hero.title = 'Seeker';
  } else if (hero.level >= 3) {
    hero.name = 'Ashen One';
    hero.title = 'Bearer';
  }
  if (changed) {
    ND.saveGameState();
  }
};

ND.onLevelUp = function() {
  var hero = ND.Store.hero;
  var stats = ND.Store.stats;
  var keys = Object.keys(stats);
  var oldHp = hero.hp;

  for (var i = 0; i < keys.length; i++) {
    stats[keys[i]].value += 1;
  }

  var newMaxHp = ND.calcMaxHp();
  var hpGained = newMaxHp - oldHp;
  hero.hp = newMaxHp;
  hero.maxHp = newMaxHp;

  ND.burstParticles();
  ND.screenShake();
  ND.showToast('Level Up! Level ' + hero.level);
  ND.spiritSay('Your soul grows stronger... Level ' + hero.level + ' reached.');

  var overlay = document.getElementById('levelUpOverlay');
  if (overlay) {
    var lvlEl = overlay.querySelector('.level-number');
    var hpEl = overlay.querySelector('.hp-gained');
    if (lvlEl) lvlEl.textContent = hero.level;
    if (hpEl) hpEl.textContent = '+' + hpGained + ' HP';
    overlay.classList.add('active');
    setTimeout(function() {
      overlay.classList.remove('active');
    }, 3000);
  }

  if (hero.level === 5) {
    ND.Store.inventory.crownArchon = true;
    ND.showToast('Artifact acquired: Crown of the Archon!');
  }
  if (hero.level === 10) {
    ND.Store.inventory.capeShadows = true;
    ND.showToast('Artifact acquired: Cape of Shadows!');
  }

  ND.renderStats();
  ND.updateHeroUI();
  ND.saveGameState();
};

ND.addXpReward = function(amount) {
  var hero = ND.Store.hero;
  hero.xp += amount;
  ND.checkHeroLevelUp();
  ND.updateHeroUI();
  ND.renderStats();
  ND.saveGameState();
};

ND.renderStats = function() {
  var grid = document.getElementById('statsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  var stats = ND.Store.stats;
  var keys = Object.keys(stats);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var stat = stats[key];
    var card = document.createElement('div');
    card.className = 'stat-card';
    card.setAttribute('data-stat', key);

    var label = document.createElement('div');
    label.className = 'stat-label';
    label.textContent = (stat.label || key).toUpperCase();

    var value = document.createElement('div');
    value.className = 'stat-value';
    value.textContent = stat.value;

    var poolBar = document.createElement('div');
    poolBar.className = 'stat-pool-bar';
    var poolFill = document.createElement('div');
    poolFill.className = 'stat-pool-fill';
    var pct = ND.CONST.ATTR_POOL_THRESHOLD > 0
      ? Math.min(100, (stat.pool / ND.CONST.ATTR_POOL_THRESHOLD) * 100)
      : 0;
    poolFill.style.width = pct + '%';
    poolBar.appendChild(poolFill);

    card.appendChild(label);
    card.appendChild(value);
    card.appendChild(poolBar);
    grid.appendChild(card);
  }
};

ND.updateStatUI = function(statKey) {
  var card = document.querySelector('.stat-card[data-stat="' + statKey + '"]');
  if (!card) return;
  var stat = ND.Store.stats[statKey];
  if (!stat) return;
  var valEl = card.querySelector('.stat-value');
  if (valEl) valEl.textContent = stat.value;
  var fillEl = card.querySelector('.stat-pool-fill');
  if (fillEl) {
    var pct = ND.CONST.ATTR_POOL_THRESHOLD > 0
      ? Math.min(100, (stat.pool / ND.CONST.ATTR_POOL_THRESHOLD) * 100)
      : 0;
    fillEl.style.width = pct + '%';
  }
};

ND.updateHeroUI = function() {
  var hero = ND.Store.hero;
  var maxHp = ND.calcMaxHp();
  hero.maxHp = maxHp;
  if (hero.hp > maxHp) hero.hp = maxHp;

  var avatar = document.getElementById('heroAvatar');
  if (avatar) avatar.textContent = (hero.title || hero.name || '?').charAt(0);

  var hpBar = document.getElementById('heroHpBar');
  if (hpBar) hpBar.style.width = Math.max(0, (hero.hp / maxHp) * 100) + '%';

  var hpText = document.getElementById('heroHpText');
  if (hpText) hpText.textContent = Math.ceil(hero.hp) + ' / ' + maxHp;

  var xpNeeded = ND.getXpToNext(hero.level);
  var xpBar = document.getElementById('heroXpBar');
  if (xpBar) {
    xpBar.style.width = (xpNeeded > 0
      ? Math.min(100, (hero.xp / xpNeeded) * 100)
      : 100) + '%';
  }

  var xpText = document.getElementById('heroXpText');
  if (xpText) xpText.textContent = hero.xp + ' / ' + xpNeeded + ' XP';

  var ring = document.getElementById('levelRing');
  if (ring) {
    var circle = ring.querySelector('.progress-ring');
    if (circle) {
      var r = parseFloat(circle.getAttribute('r')) || 40;
      var c = 2 * Math.PI * r;
      var xpPct = xpNeeded > 0 ? hero.xp / xpNeeded : 1;
      circle.style.strokeDasharray = (xpPct * c) + ' ' + c;
    }
    var lvlText = ring.querySelector('.level-text');
    if (lvlText) lvlText.textContent = hero.level;
  }

  var estusEl = document.getElementById('estusCount');
  if (estusEl) estusEl.textContent = hero.estus + ' / ' + hero.maxEstus;

  var atoneBar = document.getElementById('atonementBar');
  if (atoneBar) {
    var atonePct = Math.min(100, ((hero.atonement || 0) / 10) * 100);
    atoneBar.style.width = atonePct + '%';
  }

  ND.updateHeroSummary();
  ND.updateDamageInfo();
};

ND.updateHeroSummary = function() {
  var el = document.getElementById('heroSummary');
  if (!el) return;
  var hero = ND.Store.hero;
  var gear = ND.getTotalGearBonuses();
  var bonusDmg = (gear && gear.damage) || 0;
  el.textContent = 'Lv.' + hero.level + ' ' + hero.name + ' | +' + bonusDmg + ' from gear';
};

ND.updateDamageInfo = function() {
  var el = document.getElementById('damageInfo');
  if (!el) return;
  var stats = ND.Store.stats;
  var gear = ND.getTotalGearBonuses();
  var bonusDmg = (gear && gear.damage) || 0;
  var keys = Object.keys(stats);
  var totalStats = 0;
  for (var i = 0; i < keys.length; i++) {
    totalStats += stats[keys[i]].value;
  }
  el.innerHTML = '';

  var base = document.createElement('div');
  base.className = 'dmg-base';
  base.textContent = 'Base: ' + totalStats;
  el.appendChild(base);

  var gearEl = document.createElement('div');
  gearEl.className = 'dmg-gear';
  gearEl.textContent = 'Gear: +' + bonusDmg;
  el.appendChild(gearEl);

  var total = document.createElement('div');
  total.className = 'dmg-total';
  total.textContent = 'Total: ' + (totalStats + bonusDmg);
  el.appendChild(total);
};

ND.drinkEstus = function() {
  var hero = ND.Store.hero;
  if (hero.estus <= 0 || hero.hp >= hero.maxHp) return;
  hero.estus -= 1;
  var healAmount = Math.floor(hero.maxHp * 0.4);
  var oldHp = hero.hp;
  hero.hp = Math.min(hero.hp + healAmount, hero.maxHp);
  var actualHeal = Math.floor(hero.hp - oldHp);
  ND.spawnFloatNumber('+' + actualHeal, '#4fc3f7');
  ND.showToast('Estus Flask used! +' + actualHeal + ' HP');
  ND.updateHeroUI();
  ND.saveGameState();
};

ND.triggerRankUpEffect = function(card, oldRank, newRank, x, y) {
  var oldInfo = ND.getRankColorInfo(oldRank);
  var newInfo = ND.getRankColorInfo(newRank);
  var oldIdx = ND.CONST.RANK_PROGRESSION.indexOf(oldRank);
  var newIdx = ND.CONST.RANK_PROGRESSION.indexOf(newRank);
  var oldPhrase = oldIdx >= 0 ? ND.CONST.RANK_PHRASES[oldIdx] : oldRank;
  var newPhrase = newIdx >= 0 ? ND.CONST.RANK_PHRASES[newIdx] : newRank;

  var overlay = document.getElementById('rankUpOverlay');
  if (overlay) {
    var oldEl = overlay.querySelector('.rank-old');
    var newEl = overlay.querySelector('.rank-new');
    if (oldEl) {
      oldEl.textContent = oldPhrase;
      oldEl.style.color = (typeof oldInfo === 'string') ? oldInfo : (oldInfo && oldInfo.color) || '';
    }
    if (newEl) {
      newEl.textContent = newPhrase;
      newEl.style.color = (typeof newInfo === 'string') ? newInfo : (newInfo && newInfo.color) || '';
    }
    overlay.classList.add('active');
    setTimeout(function() {
      overlay.classList.remove('active');
    }, 2500);
  }

  ND.burstParticles(x, y);

  setTimeout(function() {
    ND.openEditCardAfterRankup(card);
  }, 2600);
};

window.ND = ND;
