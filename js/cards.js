var ND = window.ND || {};

document.addEventListener('click', function(e) {
  var el = e.target;
  if (!el || !el.closest) return;
  var target = el.closest('[data-action]');
  if (!target) return;
  var action = target.getAttribute('data-action');
  var cardId = parseInt(target.getAttribute('data-card-id'), 10);
  switch (action) {
    case 'complete-card':
      if (!isNaN(cardId)) ND.completeCard(cardId);
      break;
    case 'fail-card':
      if (!isNaN(cardId)) ND.failCard(cardId);
      break;
    case 'edit-card':
      if (!isNaN(cardId)) ND.openEditCardDirect(cardId);
      break;
    case 'delete-card':
      if (!isNaN(cardId)) ND.deleteCard(cardId);
      break;
    case 'save-edit-card':
      ND.saveEditCard();
      break;
    case 'skip-edit-card':
      ND.skipEditCard();
      break;
  }
});

ND.renderCards = function() {
  var grid = document.getElementById('cardGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (var i = 0; i < ND.Store.forged.length; i++) {
    grid.appendChild(ND.renderOneCard(ND.Store.forged[i]));
  }
};

ND.renderOneCard = function(card) {
  var el = document.createElement('div');
  var rankInfo = ND.getRankColorInfo(card.rank);
  var mult = ND.getAdaptationMultiplier(card);
  var adaptLabel = ND.getAdaptationLabel(mult);
  var threshold = ND.CONST.MASTERY_TO_RANK_UP;
  var masteryPct = Math.min((card.mastery / threshold) * 100, 100);
  var masteryText = card.mastery + ' / ' + threshold;

  var cssClass = 'nd-card';
  if (rankInfo) {
    if (rankInfo.class) cssClass += ' ' + rankInfo.class;
    else if (rankInfo.className) cssClass += ' ' + rankInfo.className;
  }

  el.className = cssClass;
  el.setAttribute('data-card-id', card.id);

  el.innerHTML =
    '<div class="nd-card-inner">' +
      '<div class="nd-card-header">' +
        '<span class="nd-card-rank">' + ND.esc(card.rank) + '</span>' +
        '<span class="nd-card-stat-badge">' + ND.esc(card.stat) + '</span>' +
      '</div>' +
      '<h3 class="nd-card-name">' + ND.esc(card.name) + '</h3>' +
      (card.meta ? '<p class="nd-card-meta">' + ND.esc(card.meta) + '</p>' : '') +
      '<div class="nd-card-progress-wrap">' +
        '<div class="nd-card-progress-bar" style="width:' + masteryPct + '%"></div>' +
      '</div>' +
      '<div class="nd-card-info">' +
        '<span class="nd-card-mastery">' + masteryText + '</span>' +
        '<span class="nd-card-streak">Streak: ' + card.streak + '</span>' +
        (adaptLabel ? '<span class="nd-card-adaptation">' + adaptLabel + '</span>' : '') +
      '</div>' +
      '<div class="nd-card-actions">' +
        '<button data-action="complete-card" data-card-id="' + card.id + '">Complete</button>' +
        '<button data-action="fail-card" data-card-id="' + card.id + '">Fail</button>' +
        '<button data-action="edit-card" data-card-id="' + card.id + '">Edit</button>' +
        '<button data-action="delete-card" data-card-id="' + card.id + '">Delete</button>' +
      '</div>' +
    '</div>';

  el.addEventListener('mousemove', function(e) {
    var rect = el.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width;
    var y = (e.clientY - rect.top) / rect.height;
    var inner = el.querySelector('.nd-card-inner');
    if (inner) {
      inner.style.transform = 'perspective(600px) rotateY(' + ((x - 0.5) * 20) + 'deg) rotateX(' + ((0.5 - y) * 20) + 'deg)';
    }
  });

  el.addEventListener('mouseleave', function() {
    var inner = el.querySelector('.nd-card-inner');
    if (inner) {
      inner.style.transform = '';
    }
  });

  return el;
};

ND.updateCardInDOM = function(card) {
  var el = document.querySelector('[data-card-id="' + card.id + '"]');
  if (!el) return;

  var rankInfo = ND.getRankColorInfo(card.rank);
  var mult = ND.getAdaptationMultiplier(card);
  var adaptLabel = ND.getAdaptationLabel(mult);
  var threshold = ND.CONST.MASTERY_TO_RANK_UP;
  var masteryPct = Math.min((card.mastery / threshold) * 100, 100);
  var masteryText = card.mastery + ' / ' + threshold;

  var cssClass = 'nd-card';
  if (rankInfo) {
    if (rankInfo.class) cssClass += ' ' + rankInfo.class;
    else if (rankInfo.className) cssClass += ' ' + rankInfo.className;
  }
  el.className = cssClass;

  var progressBar = el.querySelector('.nd-card-progress-bar');
  if (progressBar) progressBar.style.width = masteryPct + '%';

  var masteryEl = el.querySelector('.nd-card-mastery');
  if (masteryEl) masteryEl.textContent = masteryText;

  var rankEl = el.querySelector('.nd-card-rank');
  if (rankEl) rankEl.textContent = card.rank;

  var streakEl = el.querySelector('.nd-card-streak');
  if (streakEl) streakEl.textContent = 'Streak: ' + card.streak;

  var adaptEl = el.querySelector('.nd-card-adaptation');
  if (adaptEl) {
    if (adaptLabel) {
      adaptEl.textContent = adaptLabel;
      adaptEl.style.display = '';
    } else {
      adaptEl.style.display = 'none';
    }
  }

  var nameEl = el.querySelector('.nd-card-name');
  if (nameEl) nameEl.textContent = card.name;

  var metaEl = el.querySelector('.nd-card-meta');
  if (metaEl) metaEl.textContent = card.meta || '';

  var statEl = el.querySelector('.nd-card-stat-badge');
  if (statEl) statEl.textContent = card.stat;
};

ND.addCardToDOM = function(card) {
  var grid = document.getElementById('cardGrid');
  if (!grid) return;
  var el = ND.renderOneCard(card);
  if (grid.firstChild) {
    grid.insertBefore(el, grid.firstChild);
  } else {
    grid.appendChild(el);
  }
};

ND.removeCardFromDOM = function(cardId) {
  var el = document.querySelector('[data-card-id="' + cardId + '"]');
  if (el && el.parentNode) el.parentNode.removeChild(el);
};

ND.completeCard = function(cardId) {
  var card = ND.findCard(cardId);
  if (!card) return;

  card.streak += 1;
  card.mastery += ND.CONST.MASTERY_PER_COMPLETE;

  var heroStats = (ND.Store.hero && ND.Store.hero.stats) || {};
  var intVal = heroStats.INT || 0;
  var mult = ND.getAdaptationMultiplier(card);
  var intBonus = 1 + intVal * (ND.CONST.INT_XP_FACTOR || 0.05);
  var gear = ND.getTotalGearBonuses();
  var xpGain = Math.round(ND.CONST.BASE_XP * mult * intBonus * (1 + (gear.xp || 0)));
  ND.addXpReward(xpGain);

  var didRankUp = false;
  if (card.mastery >= ND.CONST.MASTERY_TO_RANK_UP) {
    var nextRank = ND.getNextRank(card.rank);
    if (nextRank) {
      card.rank = nextRank;
      card.mastery = card.mastery - ND.CONST.MASTERY_TO_RANK_UP;
      didRankUp = true;
    } else {
      card.mastery = ND.CONST.MASTERY_TO_RANK_UP;
    }
  }

  var strVal = heroStats.STR || 0;
  var chaVal = heroStats.CHA || 0;
  var baseDmg = ND.CONST.BOSS_DAMAGE_BASE || 10;
  var critChance = (strVal + chaVal) * (ND.CONST.CRIT_FACTOR || 0.02);
  var isCrit = Math.random() < critChance;
  var critMult = isCrit ? (ND.CONST.CRIT_MULT || 2) : 1;
  var dmg = Math.round(baseDmg * (1 + (gear.damage || 0)) * critMult);
  ND.changeBossHp(-dmg);

  if (isCrit) {
    ND.burstParticles();
    ND.screenShake();
    ND.spawnFloatNumber(dmg, 'crit');
  } else {
    ND.spawnFloatNumber(dmg, 'damage');
  }

  if (Math.random() < (ND.CONST.LOOT_CHANCE || 0.2)) {
    ND.dropRandomLoot();
  }

  if (didRankUp) {
    ND.burstParticles();
    ND.showToast(card.name + ' ranked up to ' + card.rank + '!');
    ND.renderCards();
    ND.openEditCardAfterRankup(card.id);
  } else {
    ND.updateCardInDOM(card);
  }

  ND.checkHeroLevelUp();
  ND.renderStats();
  ND.updateHeroUI();
  ND.checkAttributePoolGrowth();
  ND.updateEscapeDisplay();
  ND.saveGameState();
};

ND.failCard = function(cardId) {
  var card = ND.findCard(cardId);
  if (!card) return;

  var prevStreak = card.streak;
  card.streak = 0;

  var healAmount = ND.CONST.BOSS_HEAL_ON_FAIL || 5;
  ND.changeBossHp(healAmount);

  ND.showUndoToast('Card failed! Streak reset.', function() {
    var c = ND.findCard(cardId);
    if (c) {
      c.streak = prevStreak;
      ND.updateCardInDOM(c);
    }
    ND.changeBossHp(-healAmount);
    ND.saveGameState();
  });

  ND.updateCardInDOM(card);
  ND.saveGameState();
};

ND.deleteCard = function(cardId) {
  var card = ND.findCard(cardId);
  if (!card) return;

  if (!confirm('Delete "' + card.name + '"? This cannot be undone.')) return;

  for (var i = 0; i < ND.Store.forged.length; i++) {
    if (ND.Store.forged[i].id === cardId) {
      ND.Store.forged.splice(i, 1);
      break;
    }
  }

  ND.removeCardFromDOM(cardId);
  ND.showToast(card.name + ' deleted.');
  ND.saveGameState();
};

ND.openForge = function() {
  var modal = document.getElementById('forgeModal');
  if (!modal) return;
  var nameEl = document.getElementById('forgeName');
  var metaEl = document.getElementById('forgeMeta');
  var statEl = document.getElementById('forgeStat');
  if (nameEl) nameEl.value = '';
  if (metaEl) metaEl.value = '';
  if (statEl) statEl.value = ND.Store.ui.selectedStat || (ND.CONST.STAT_KEYS && ND.CONST.STAT_KEYS[0]) || '';
  modal.classList.add('active');
  if (nameEl) nameEl.focus();
};

ND.closeForge = function() {
  var modal = document.getElementById('forgeModal');
  if (modal) modal.classList.remove('active');
};

ND.forgeCard = function() {
  var nameEl = document.getElementById('forgeName');
  var metaEl = document.getElementById('forgeMeta');
  var statEl = document.getElementById('forgeStat');

  var name = nameEl ? nameEl.value.trim() : '';
  var meta = metaEl ? metaEl.value.trim() : '';
  var stat = statEl ? statEl.value : '';

  if (!name) {
    ND.showToast('Card name is required.');
    return;
  }
  if (!stat) {
    ND.showToast('Select a stat.');
    return;
  }

  ND.Store.forgedIdCounter += 1;
  var card = {
    id: ND.Store.forgedIdCounter,
    name: name,
    meta: meta,
    stat: stat,
    rank: ND.CONST.RANKS ? ND.CONST.RANKS[0] : 'Novice',
    mastery: 0,
    streak: 0,
    adaptation: 0,
    created: Date.now()
  };

  ND.Store.forged.push(card);
  ND.addCardToDOM(card);
  ND.closeForge();

  if (ND.Store.forged.length <= (ND.CONST.MAX_FORGE_XP_CARDS || 50)) {
    ND.addXpReward(ND.CONST.FORGE_XP_BONUS || 25);
    ND.checkHeroLevelUp();
    ND.updateHeroUI();
  }

  ND.showToast(card.name + ' forged!');
  ND.spiritSay('A new card joins your deck.');
  ND.renderMap();
  ND.saveGameState();
};

ND.openEditCardAfterRankup = function(cardId) {
  var card = ND.findCard(cardId);
  if (!card) return;
  ND.Store.ui.editingCardId = cardId;

  var modal = document.getElementById('editCardModal');
  if (!modal) return;

  var nameEl = document.getElementById('editCardName');
  var metaEl = document.getElementById('editCardMeta');
  var statEl = document.getElementById('editCardStat');

  if (nameEl) nameEl.value = card.name;
  if (metaEl) metaEl.value = card.meta || '';
  if (statEl) statEl.value = card.stat;

  var titleEl = modal.querySelector('.nd-modal-title');
  if (titleEl) titleEl.textContent = card.name + ' Ranked Up!';

  modal.classList.add('active');
  modal.classList.add('rankup-edit');
};

ND.openEditCardDirect = function(cardId) {
  var card = ND.findCard(cardId);
  if (!card) return;
  ND.Store.ui.editingCardId = cardId;

  var modal = document.getElementById('editCardModal');
  if (!modal) return;

  var nameEl = document.getElementById('editCardName');
  var metaEl = document.getElementById('editCardMeta');
  var statEl = document.getElementById('editCardStat');

  if (nameEl) nameEl.value = card.name;
  if (metaEl) metaEl.value = card.meta || '';
  if (statEl) statEl.value = card.stat;

  var titleEl = modal.querySelector('.nd-modal-title');
  if (titleEl) titleEl.textContent = 'Edit Card';

  modal.classList.add('active');
  modal.classList.remove('rankup-edit');
};

ND.closeEditCard = function() {
  var modal = document.getElementById('editCardModal');
  if (modal) {
    modal.classList.remove('active');
    modal.classList.remove('rankup-edit');
  }
  ND.Store.ui.editingCardId = null;
};

ND.skipEditCard = function() {
  ND.closeEditCard();
};

ND.saveEditCard = function() {
  var cardId = ND.Store.ui.editingCardId;
  var card = ND.findCard(cardId);
  if (!card) {
    ND.closeEditCard();
    return;
  }

  var nameEl = document.getElementById('editCardName');
  var metaEl = document.getElementById('editCardMeta');
  var statEl = document.getElementById('editCardStat');

  var newName = nameEl ? nameEl.value.trim() : card.name;
  var newMeta = metaEl ? metaEl.value.trim() : (card.meta || '');
  var newStat = statEl ? statEl.value : card.stat;

  if (!newName) {
    ND.showToast('Card name is required.');
    return;
  }

  var metaChanged = (newMeta !== (card.meta || ''));
  var statChanged = (newStat !== card.stat);

  card.name = newName;
  card.meta = newMeta;
  card.stat = newStat;

  if (metaChanged || statChanged) {
    card.adaptation = 0;
  }

  ND.updateCardInDOM(card);
  ND.closeEditCard();
  ND.showToast(card.name + ' updated.');
  ND.saveGameState();
};

window.ND = ND;
