var ND = window.ND || {};

ND.switchView = function(view) {
  var validViews = ['deck', 'hero', 'inv', 'boss', 'map', 'stats'];
  if (validViews.indexOf(view) === -1) return;

  ND.Store.ui.currentView = view;

  var tabs = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-view') === view);
  }

  var navBtns = document.querySelectorAll('.bottom-nav button');
  for (var j = 0; j < navBtns.length; j++) {
    navBtns[j].classList.toggle('active', navBtns[j].getAttribute('data-view') === view);
  }

  var sections = document.querySelectorAll('.view-section');
  for (var k = 0; k < sections.length; k++) {
    sections[k].classList.toggle('active', sections[k].id === 'view-' + view);
  }

  if (view === 'deck') {
    ND.renderCards();
  } else if (view === 'hero') {
    ND.renderStats();
    ND.updateHeroUI();
  } else if (view === 'inv') {
    ND.renderBackpack();
    ND.renderSlots();
    ND.updateTotalBonuses();
  } else if (view === 'boss') {
    ND.updateBossDisplay();
    ND.updateDamageInfo();
    ND.updateEscapeDisplay();
  } else if (view === 'map') {
    ND.renderMap();
  } else if (view === 'stats') {
    ND.renderGoals();
    ND.renderStats();
    ND.updateHeroUI();
  }
};

(function() {
  document.addEventListener('click', function(e) {
    var el = e.target;
    while (el && el !== document) {
      if (el.hasAttribute('data-action')) {
        var action = el.getAttribute('data-action');
        break;
      }
      el = el.parentElement;
    }
    if (!el || el === document) return;

    var action = el.getAttribute('data-action');

    switch (action) {
      case 'complete-card':
        ND.completeCard(parseInt(el.getAttribute('data-card-id')));
        break;
      case 'fail-card':
        ND.failCard(parseInt(el.getAttribute('data-card-id')));
        break;
      case 'edit-card':
        ND.openEditCardDirect(parseInt(el.getAttribute('data-card-id')));
        break;
      case 'delete-card':
        ND.deleteCard(parseInt(el.getAttribute('data-card-id')));
        break;
      case 'select-item':
        ND.selectItem(el.getAttribute('data-uid'));
        break;
      case 'click-slot': {
        var slot = el.getAttribute('data-slot');
        var hero = ND.Store.hero;
        if (hero.equipment[slot]) {
          ND.Store.ui.selectedItem = hero.equipment[slot];
          ND.renderBackpack();
        }
        break;
      }
      case 'equip-item':
        ND.equipItem(el.getAttribute('data-uid'));
        break;
      case 'unequip-item':
        ND.unequipItem(el.getAttribute('data-slot'));
        break;
      case 'discard-item':
        ND.discardItem(el.getAttribute('data-uid'));
        break;
      case 'advance-goal':
        ND.advanceGoal(parseInt(el.getAttribute('data-goal-id')));
        break;
      case 'complete-goal':
        ND.completeGoal(parseInt(el.getAttribute('data-goal-id')));
        break;
      case 'delete-goal':
        ND.deleteGoal(parseInt(el.getAttribute('data-goal-id')));
        break;
      case 'filter-goals': {
        var filter = el.getAttribute('data-filter');
        ND.Store.ui.goalFilter = filter;
        ND.renderGoals();
        break;
      }
      case 'select-goal-type':
        ND.Store.ui.selectedGoalType = el.getAttribute('data-type');
        break;
      case 'select-goal-stat':
        ND.Store.ui.selectedGoalStat = el.getAttribute('data-stat');
        break;
      case 'select-stat':
        ND.Store.ui.selectedStat = el.getAttribute('data-stat');
        break;
      case 'open-forge':
        ND.openForge();
        break;
      case 'close-forge':
        ND.closeForge();
        break;
      case 'forge-card':
        ND.forgeCard();
        break;
      case 'open-goal-modal':
        ND.openGoalModal();
        break;
      case 'close-goal-modal':
        ND.closeGoalModal();
        break;
      case 'create-goal':
        ND.createGoal();
        break;
      case 'open-edit-card-direct':
        ND.openEditCardDirect(parseInt(el.getAttribute('data-card-id')));
        break;
      case 'save-edit-card':
        ND.saveEditCard();
        break;
      case 'skip-edit-card':
        ND.skipEditCard();
        break;
      case 'open-sync-modal':
        ND.openSyncModal();
        break;
      case 'close-sync-modal':
        ND.closeSyncModal();
        break;
      case 'generate-sync-code':
        ND.generateSyncCode();
        break;
      case 'copy-sync-code':
        ND.copySyncCode();
        break;
      case 'download-sync-file':
        ND.downloadSyncFile();
        break;
      case 'import-sync-code':
        ND.importSyncCode();
        break;
      case 'reset-all-data':
        ND.resetAllData();
        break;
      case 'export-json':
        ND.exportJSON();
        break;
      case 'drink-estus':
        ND.drinkEstus();
        break;
      case 'switch-view':
        ND.switchView(el.getAttribute('data-view'));
        break;
    }
  });

  var modalIds = ['goalModal', 'forgeModal', 'editCardModal', 'syncModal'];
  for (var m = 0; m < modalIds.length; m++) {
    (function(modalId) {
      var modal = document.getElementById(modalId);
      if (modal) {
        modal.addEventListener('click', function(e) {
          if (e.target === modal) {
            if (modalId === 'goalModal') ND.closeGoalModal();
            else if (modalId === 'forgeModal') ND.closeForge();
            else if (modalId === 'editCardModal') ND.skipEditCard();
            else if (modalId === 'syncModal') ND.closeSyncModal();
          }
        });
      }
    })(modalIds[m]);
  }

  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      ND.openSyncModal();
    }
  });
})();

ND.init = function() {
  ND.loadGameState();
  ND.checkDailyReset();

  var hero = ND.Store.hero;
  var boss = ND.Store.boss;

  if (boss && boss.defeated) {
    ND.spawnBoss();
  }

  hero.maxHp = ND.calculateMaxHp(hero);
  if (hero.hp > hero.maxHp) hero.hp = hero.maxHp;
  if (hero.hp < 0) hero.hp = 0;

  hero.xpToNext = ND.calculateXpToNext(hero.level);

  ND.renderStats();
  ND.updateHeroUI();
  ND.renderGoals();
  ND.updateDamageInfo();
  ND.updateEscapeDisplay();
  ND.renderMap();
  ND.renderCards();
  ND.updateBossDisplay();
  ND.renderBackpack();
  ND.renderSlots();
  ND.updateTotalBonuses();

  setInterval(function() {
    ND.checkDailyReset();
  }, 60000);

  setInterval(function() {
    ND.updatePunishCountdown();
  }, 60000);

  window.addEventListener('beforeunload', function() {
    ND.saveGameState();
  });

  var progressSlider = document.getElementById('progressSlider');
  if (progressSlider) {
    progressSlider.addEventListener('input', function() {
      var val = parseInt(this.value);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        ND.Store.ui.progressValue = val;
      }
    });
  }

  var bossEl = document.getElementById('bossSprite');
  if (bossEl) {
    document.addEventListener('mousemove', function(e) {
      var rect = bossEl.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = (e.clientX - cx) / rect.width;
      var dy = (e.clientY - cy) / rect.height;
      var leftEye = bossEl.querySelector('.boss-eye-left');
      var rightEye = bossEl.querySelector('.boss-eye-right');
      if (leftEye) leftEye.style.transform = 'translate(' + (dx * 4) + 'px,' + (dy * 4) + 'px)';
      if (rightEye) rightEye.style.transform = 'translate(' + (dx * 4) + 'px,' + (dy * 4) + 'px)';
    });
  }

  var mistEl = document.querySelector('.boss-mist');
  if (mistEl) {
    document.addEventListener('mousemove', function(e) {
      var x = (e.clientX / window.innerWidth - 0.5) * 20;
      var y = (e.clientY / window.innerHeight - 0.5) * 10;
      mistEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    });
  }

  var dustCanvas = document.getElementById('dustCanvas');
  if (dustCanvas) {
    window.addEventListener('resize', function() {
      dustCanvas.width = dustCanvas.parentElement ? dustCanvas.parentElement.offsetWidth : window.innerWidth;
      dustCanvas.height = dustCanvas.parentElement ? dustCanvas.parentElement.offsetHeight : window.innerHeight;
    });
  }

  var particleCanvas = document.getElementById('particleCanvas');
  if (particleCanvas) {
    window.addEventListener('resize', function() {
      particleCanvas.width = particleCanvas.parentElement ? particleCanvas.parentElement.offsetWidth : window.innerWidth;
      particleCanvas.height = particleCanvas.parentElement ? particleCanvas.parentElement.offsetHeight : window.innerHeight;
    });
  }

  setTimeout(function() {
    ND.showSpiritMessage();
  }, 800);

  ND.initDust();

  function animateDust() {
    ND.updateDust();
    ND.drawDust();
    requestAnimationFrame(animateDust);
  }
  animateDust();

  function animateParticles() {
    ND.updateParticles();
    ND.drawParticles();
    requestAnimationFrame(animateParticles);
  }
  animateParticles();

  ND.switchView(ND.Store.ui.currentView || 'deck');
};

window.addEventListener('DOMContentLoaded', ND.init);

window.ND = ND;
