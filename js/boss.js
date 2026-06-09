var ND = window.ND || {};

ND.getCurrentBoss = function() {
  var progress = (ND.Store.escape && ND.Store.escape.progress) || 0;
  if (progress >= 80) {
    return {
      type: 'chimera',
      name: 'Chimera of Despair',
      maxHp: 300,
      hasShield: true,
      shieldMax: 50,
      stages: [
        { subtitle: 'Triumvirate', lore: 'Three beasts bound by cursed flesh, united in hatred and despair.' },
        { subtitle: 'Shattered Will', lore: 'The shield cracks but the beast endures. Despair deepens within.' },
        { subtitle: 'Desperate Union', lore: 'All three heads scream as one. The end draws near.' }
      ]
    };
  }
  if (progress >= 40) {
    return {
      type: 'demon',
      name: 'Demon of the Abyss',
      maxHp: 200,
      hasShield: false,
      shieldMax: 0,
      stages: [
        { subtitle: 'Emerging', lore: 'A demon tears through the veil of reality, drawn by your fear.' },
        { subtitle: 'Infernal Rage', lore: 'The abyss itself burns with hatred. Flames consume all in their path.' },
        { subtitle: 'Final Ember', lore: 'Even in death, the embers refuse to die. One last eruption of fury.' }
      ]
    };
  }
  return {
    type: 'snake',
    name: 'Serpent of Ashen Roots',
    maxHp: 100,
    hasShield: false,
    shieldMax: 0,
    stages: [
      { subtitle: 'Stirring', lore: 'An ancient serpent stirs beneath the ashen roots, sensing weakness.' },
      { subtitle: 'Coiled Fury', lore: 'It strikes with venomous precision, coiling tighter around your resolve.' },
      { subtitle: 'Death Fangs', lore: 'In its final moments, the true fangs emerge. Death is inevitable.' }
    ]
  };
};

ND.changeBossHp = function(delta) {
  var boss = ND.Store.boss;
  if (!boss || !boss.alive) return;

  var bossPanel = document.getElementById('bossPanel');

  if (delta < 0) {
    var damage = Math.abs(delta);
    if (boss.shield && boss.shield > 0) {
      var absorbed = Math.min(damage, boss.shield);
      boss.shield -= absorbed;
      damage -= absorbed;
      if (damage <= 0) {
        ND.updateBossDisplay();
        return;
      }
    }
    boss.hp = Math.max(0, boss.hp - damage);

    if (bossPanel) {
      bossPanel.classList.add('hit');
      setTimeout(function() { bossPanel.classList.remove('hit'); }, 200);
    }

    var hpPct = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    if (bossPanel) {
      bossPanel.classList.remove('crack-1', 'crack-2', 'crack-3');
      if (hpPct <= 0.33) bossPanel.classList.add('crack-3');
      else if (hpPct <= 0.66) bossPanel.classList.add('crack-2');
      else if (hpPct <= 0.9) bossPanel.classList.add('crack-1');
    }

    if (damage >= 15) {
      ND.spawnBloodRain();
    }
  } else if (delta > 0) {
    boss.hp = Math.min(boss.hp + delta, boss.maxHp);
  }

  var hpPct2 = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
  var newStage = hpPct2 > 0.66 ? 1 : (hpPct2 > 0.33 ? 2 : 3);
  if (newStage > boss.stage) {
    boss.stage = newStage;
    ND.screenShake();
    ND.burstParticles();
    ND.spiritSay('The beast transforms... Stage ' + newStage + '!');
  }

  if (boss.hp <= 0) {
    boss.hp = 0;
    ND.triggerBossExecution();
    return;
  }

  ND.updateBossDisplay();
  ND.saveGameState();
};

ND.triggerBossExecution = function() {
  var boss = ND.Store.boss;
  boss.alive = false;

  ND.screenShake();
  ND.burstParticles();

  setTimeout(function() {
    ND.burstParticles();
  }, 500);

  var bossDef = ND.getCurrentBoss();
  var xpReward = bossDef.type === 'chimera' ? 300 : (bossDef.type === 'demon' ? 200 : 100);
  ND.addXpReward(xpReward);

  var lootItem = {
    id: 'loot_' + Date.now(),
    type: bossDef.type,
    name: bossDef.name + ' Trophy',
    acquired: ND.getMSKDayKey()
  };
  if (ND.Store.forged) {
    ND.Store.forged.push(lootItem);
  }

  var overlay = document.getElementById('bossDefeatedOverlay');
  if (overlay) {
    var nameEl = overlay.querySelector('.boss-defeated-name');
    var xpEl = overlay.querySelector('.boss-defeated-xp');
    if (nameEl) nameEl.textContent = bossDef.name;
    if (xpEl) xpEl.textContent = '+' + xpReward + ' XP';
    overlay.classList.add('active');
  }

  ND.showToast(bossDef.name + ' defeated! +' + xpReward + ' XP');
  ND.spiritSay('The beast falls... but darkness always returns.');

  var bossPanel = document.getElementById('bossPanel');
  if (bossPanel) bossPanel.classList.add('defeated');

  ND.updateBossDisplay();
  ND.saveGameState();

  setTimeout(function() {
    if (overlay) overlay.classList.remove('active');
    if (bossPanel) bossPanel.classList.remove('defeated', 'crack-1', 'crack-2', 'crack-3');

    var newDef = ND.getCurrentBoss();
    boss.hp = newDef.maxHp;
    boss.maxHp = newDef.maxHp;
    boss.stage = 1;
    boss.alive = true;
    boss.shield = newDef.hasShield ? newDef.shieldMax : 0;

    ND.updateBossDisplay();
    ND.saveGameState();
  }, 8000);
};

ND.updateBossDisplay = function() {
  var boss = ND.Store.boss;
  if (!boss) return;
  var bossDef = ND.getCurrentBoss();
  var stageIdx = Math.min(Math.max(0, boss.stage - 1), bossDef.stages.length - 1);
  var stageInfo = bossDef.stages[stageIdx];

  var title = document.getElementById('bossTitle');
  if (title) title.textContent = bossDef.name;

  var subtitle = document.getElementById('bossSubtitle');
  if (subtitle) subtitle.textContent = stageInfo.subtitle;

  var lore = document.getElementById('bossLore');
  if (lore) lore.textContent = stageInfo.lore;

  var hpBar = document.getElementById('bossHpBar');
  if (hpBar && boss.maxHp > 0) {
    hpBar.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
  }

  var hpText = document.getElementById('bossHpText');
  if (hpText) hpText.textContent = Math.ceil(boss.hp) + ' / ' + boss.maxHp;

  var shieldBar = document.getElementById('bossShieldBar');
  if (shieldBar) {
    if (boss.shield > 0) {
      shieldBar.style.display = 'block';
      var maxShield = bossDef.shieldMax || 1;
      shieldBar.style.width = Math.max(0, (boss.shield / maxShield) * 100) + '%';
    } else {
      shieldBar.style.display = 'none';
    }
  }

  var bossPanel = document.getElementById('bossPanel');
  if (bossPanel) {
    if (!boss.alive) {
      bossPanel.classList.add('defeated');
    } else {
      bossPanel.classList.remove('defeated');
    }
  }
};

ND.updatePunishCountdown = function() {};

ND.checkDailyReset = function() {
  var today = ND.getMSKDayKey();
  var lastReset = ND.Store.lastDailyReset;
  if (lastReset === today) return;

  ND.Store.lastDailyReset = today;
  var todayDate = ND.getMSKDate();
  var isMonthStart = todayDate && todayDate.getDate() === 1;

  var uncompletedCards = 0;
  var uncompletedGoals = 0;

  var allCards = ND.Store.cards || (ND.Store.inventory && ND.Store.inventory.cards) || [];
  for (var i = 0; i < allCards.length; i++) {
    var c = allCards[i];
    if (c.active && !c.completedToday) {
      uncompletedCards += 1;
    }
    c.daysActive = ND.getCardDaysActive(c);
    c.completedToday = false;
  }

  var goals = ND.Store.goals || [];
  for (var j = 0; j < goals.length; j++) {
    if (goals[j].active && !goals[j].completedToday) {
      uncompletedGoals += 1;
    }
    goals[j].completedToday = false;
  }

  var totalUncompleted = uncompletedCards + uncompletedGoals;
  var hero = ND.Store.hero;

  if (totalUncompleted > 0) {
    var punishDmg = totalUncompleted * 5;
    hero.hp = Math.max(1, hero.hp - punishDmg);
    ND.showToast('Daily punishment: -' + punishDmg + ' HP (' + totalUncompleted + ' uncompleted)');
    ND.spiritSay('You failed to complete ' + totalUncompleted + ' tasks. The darkness punishes you.');
    ND.spawnBloodRain();
  } else {
    hero.perfectDays = (hero.perfectDays || 0) + 1;
    ND.showToast('Perfect day! Streak: ' + hero.perfectDays);
    ND.spiritSay('A perfect day. Your resolve strengthens.');
    ND.burstParticles();
  }

  hero.estus = hero.maxEstus;

  var boss = ND.Store.boss;
  if (boss) {
    var bossDef = ND.getCurrentBoss();
    if (bossDef.hasShield) {
      boss.shield = bossDef.shieldMax;
    }
  }

  if (isMonthStart) {
    hero.perfectDays = 0;
    hero.estus = hero.maxEstus;
    if (boss) {
      var bossDef2 = ND.getCurrentBoss();
      boss.shield = bossDef2.hasShield ? bossDef2.shieldMax : 0;
    }
  }

  ND.updateHeroUI();
  ND.updateBossDisplay();
  ND.renderCards();
  ND.renderGoals();
  ND.renderBackpack();
  ND.renderSlots();
  ND.updateTotalBonuses();
  ND.updateEscapeDisplay();
  ND.saveGameState();
};

window.ND = ND;
