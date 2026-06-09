var ND = window.ND || {};

function _nd_cloneObj(src) {
  var out = {};
  for (var k in src) {
    if (src.hasOwnProperty(k)) out[k] = src[k];
  }
  return out;
}

var _nd_slotOrder = ['head', 'amulet', 'body', 'cape', 'weapon', 'boots', 'gloves', 'ring1', 'ring2'];

var _nd_slotDefaults = {
  head:   { icon: '\uD83C\uDFA9', label: 'Head' },
  amulet: { icon: '\uD83D\uDCFF', label: 'Amulet' },
  body:   { icon: '\uD83E\uDDE5', label: 'Body' },
  cape:   { icon: '\uD83E\uDDF5', label: 'Cape' },
  weapon: { icon: '\u2694\uFE0F', label: 'Weapon' },
  boots:  { icon: '\uD83D\uDC62', label: 'Boots' },
  gloves: { icon: '\uD83E\uDDE4', label: 'Gloves' },
  ring1:  { icon: '\uD83D\uDC8D', label: 'Ring' },
  ring2:  { icon: '\uD83D\uDC8D', label: 'Ring' }
};

ND.addArtifactToBackpack = function(artifact) {
  var inv = ND.Store.inventory;
  if (inv.backpack.length >= inv.maxSlots) {
    ND.showToast('Backpack is full!');
    return false;
  }
  var item = _nd_cloneObj(artifact);
  item.uid = 'i' + ND.Store.uidCounter++;
  inv.backpack.push(item);
  ND.burstParticles();
  ND.showToast('Found: ' + item.name);
  ND.spiritSay('Nice find! ' + item.name + ' added to your backpack.');
  return true;
};

ND.dropRandomLoot = function(x, y) {
  var inv = ND.Store.inventory;
  var ownedIds = [];
  var i;
  for (i = 0; i < inv.backpack.length; i++) {
    ownedIds.push(inv.backpack[i].id);
  }
  var slotKeys = Object.keys(inv.equipped);
  for (i = 0; i < slotKeys.length; i++) {
    if (inv.equipped[slotKeys[i]]) {
      ownedIds.push(inv.equipped[slotKeys[i]].id);
    }
  }
  var available = [];
  var arts = ND.CONST.ARTIFACTS;
  for (i = 0; i < arts.length; i++) {
    if (ownedIds.indexOf(arts[i].id) === -1) {
      available.push(arts[i]);
    }
  }
  if (available.length === 0) {
    ND.showToast('No more artifacts to find!');
    return null;
  }
  var weighted = [];
  for (i = 0; i < available.length; i++) {
    var art = available[i];
    var w = 10;
    if (art.rank === 'S') w = 1;
    else if (art.rank === 'A') w = 3;
    else if (art.rank === 'B') w = 6;
    for (var j = 0; j < w; j++) {
      weighted.push(art);
    }
  }
  var chosen = weighted[Math.floor(Math.random() * weighted.length)];
  ND.addArtifactToBackpack(chosen);
  return chosen;
};

ND.renderBackpack = function() {
  var grid = document.getElementById('backpackGrid');
  if (!grid) return;
  grid.innerHTML = '';
  var inv = ND.Store.inventory;
  var items = inv.backpack.slice();
  var filter = (ND.Store.ui && ND.Store.ui.currentFilter) || 'all';
  if (filter !== 'all') {
    items = items.filter(function(it) {
      return it.type === filter || it.rank === filter;
    });
  }
  for (var i = 0; i < items.length; i++) {
    (function(item) {
      var cell = document.createElement('div');
      cell.className = 'bp-cell';
      cell.setAttribute('data-uid', item.uid);
      cell.setAttribute('data-action', 'select-item');
      var colorInfo = ND.getRankColorInfo(item.rank);
      if (colorInfo) {
        cell.style.borderColor = typeof colorInfo === 'string' ? colorInfo : (colorInfo.color || '');
      }
      if (ND.Store.ui && ND.Store.ui.selectedItemId === item.uid) {
        cell.className += ' selected';
      }
      var iconEl = document.createElement('span');
      iconEl.className = 'item-icon';
      iconEl.textContent = item.icon || '?';
      cell.appendChild(iconEl);
      var nameEl = document.createElement('span');
      nameEl.className = 'item-name';
      nameEl.textContent = item.name;
      cell.appendChild(nameEl);
      cell.addEventListener('mouseenter', function(e) {
        ND.showTooltip(e, item);
      });
      cell.addEventListener('mousemove', function(e) {
        ND.moveTooltip(e);
      });
      cell.addEventListener('mouseleave', function() {
        ND.hideTooltip();
      });
      grid.appendChild(cell);
    })(items[i]);
  }
  var totalCells = Math.max(items.length, 18);
  for (var j = items.length; j < totalCells; j++) {
    var empty = document.createElement('div');
    empty.className = 'bp-cell empty';
    grid.appendChild(empty);
  }
  var countEl = document.getElementById('backpackCount');
  if (countEl) {
    countEl.textContent = inv.backpack.length + ' / ' + inv.maxSlots;
  }
};

ND.renderSlots = function() {
  var inv = ND.Store.inventory;
  for (var i = 0; i < _nd_slotOrder.length; i++) {
    var slotName = _nd_slotOrder[i];
    var slotEl = document.querySelector('.slot[data-slot="' + slotName + '"]');
    if (!slotEl) continue;
    var item = inv.equipped[slotName];
    slotEl.innerHTML = '';
    slotEl.setAttribute('data-action', 'click-slot');
    slotEl.setAttribute('data-slot', slotName);
    if (item) {
      var iconEl = document.createElement('span');
      iconEl.className = 'slot-icon';
      iconEl.textContent = item.icon || '?';
      slotEl.appendChild(iconEl);
      var colorInfo = ND.getRankColorInfo(item.rank);
      if (colorInfo) {
        slotEl.style.borderColor = typeof colorInfo === 'string' ? colorInfo : (colorInfo.color || '');
      }
      slotEl.className = slotEl.className.replace(/\s*empty/g, '').replace(/\s*equipped/g, '') + ' equipped';
      (function(it, el) {
        el.addEventListener('mouseenter', function(e) {
          ND.showTooltip(e, it);
        });
        el.addEventListener('mousemove', function(e) {
          ND.moveTooltip(e);
        });
        el.addEventListener('mouseleave', function() {
          ND.hideTooltip();
        });
      })(item, slotEl);
    } else {
      var def = _nd_slotDefaults[slotName] || { icon: '?', label: slotName };
      var defIcon = document.createElement('span');
      defIcon.className = 'slot-icon default';
      defIcon.textContent = def.icon;
      slotEl.appendChild(defIcon);
      slotEl.style.borderColor = '';
      slotEl.className = slotEl.className.replace(/\s*equipped/g, '').replace(/\s*empty/g, '') + ' empty';
    }
  }
};

ND.renderItemPanel = function(item, source) {
  var panel = document.getElementById('itemPanelContent');
  if (!panel) return;
  var colorInfo = ND.getRankColorInfo(item.rank);
  var borderColor = '';
  if (colorInfo) {
    borderColor = typeof colorInfo === 'string' ? colorInfo : (colorInfo.color || '');
  }
  var html = '';
  html += '<div class="item-detail"';
  if (borderColor) html += ' style="border-color:' + ND.esc(borderColor) + '"';
  html += '>';
  html += '<div class="item-detail-icon">' + ND.esc(item.icon || '?') + '</div>';
  html += '<div class="item-detail-name">' + ND.esc(item.name) + '</div>';
  html += '<div class="item-detail-type">' + ND.esc(item.type || '') + '</div>';
  html += '<div class="item-detail-rank">' + ND.esc(item.rank || '') + '</div>';
  if (item.lore) {
    html += '<div class="item-detail-lore">' + ND.esc(item.lore) + '</div>';
  }
  if (item.bonuses) {
    html += '<div class="item-detail-bonuses">';
    var bonusKeys = Object.keys(item.bonuses);
    for (var i = 0; i < bonusKeys.length; i++) {
      var key = bonusKeys[i];
      var val = item.bonuses[key];
      html += '<div class="bonus-row"><span class="bonus-label">' + ND.esc(key) + '</span><span class="bonus-value">+' + ND.esc(String(val)) + '</span></div>';
    }
    html += '</div>';
  }
  html += '<div class="item-detail-actions">';
  if (source === 'backpack') {
    html += '<button class="btn-equip" data-action="equip-item" data-uid="' + ND.esc(item.uid) + '">Equip</button>';
    html += '<button class="btn-discard" data-action="discard-item" data-uid="' + ND.esc(item.uid) + '">Discard</button>';
  } else if (source === 'equipped') {
    html += '<button class="btn-unequip" data-action="unequip-item" data-slot="' + ND.esc(item.slot || '') + '">Unequip</button>';
  }
  html += '</div>';
  html += '</div>';
  panel.innerHTML = html;
};

ND.equipItem = function(uid) {
  var inv = ND.Store.inventory;
  var itemIndex = -1;
  var item = null;
  for (var i = 0; i < inv.backpack.length; i++) {
    if (inv.backpack[i].uid === uid) {
      item = inv.backpack[i];
      itemIndex = i;
      break;
    }
  }
  if (!item || itemIndex === -1) return;

  var targetSlot = item.slot;
  if (targetSlot === 'ring1' && inv.equipped.ring1 && !inv.equipped.ring2) {
    targetSlot = 'ring2';
  }

  var currentEquipped = inv.equipped[targetSlot];
  if (currentEquipped) {
    var swapped = currentEquipped;
    if (targetSlot === 'ring2' && swapped.slot === 'ring2') {
      swapped = _nd_cloneObj(swapped);
      swapped.slot = 'ring1';
    }
    inv.backpack.push(swapped);
  }

  inv.backpack.splice(itemIndex, 1);

  var toEquip = item;
  if (targetSlot === 'ring2' && item.slot === 'ring1') {
    toEquip = _nd_cloneObj(item);
    toEquip.slot = 'ring2';
  }

  inv.equipped[targetSlot] = toEquip;

  ND.saveGameState();
  ND.renderBackpack();
  ND.renderSlots();
  ND.renderItemPanel(toEquip, 'equipped');
  ND.renderStats();
  ND.updateDamageInfo();
  ND.updateTotalBonuses();
  ND.showToast('Equipped: ' + toEquip.name);
};

ND.unequipItem = function(slotName) {
  var inv = ND.Store.inventory;
  if (inv.backpack.length >= inv.maxSlots) {
    ND.showToast('Backpack is full!');
    return;
  }
  var item = inv.equipped[slotName];
  if (!item) return;

  var toBackpack = item;
  if (slotName === 'ring2') {
    toBackpack = _nd_cloneObj(item);
    toBackpack.slot = 'ring1';
  }

  inv.backpack.push(toBackpack);
  delete inv.equipped[slotName];

  ND.saveGameState();
  ND.renderBackpack();
  ND.renderSlots();
  ND.renderStats();
  ND.updateDamageInfo();
  ND.updateTotalBonuses();
  ND.showToast('Unequipped: ' + toBackpack.name);
};

ND.discardItem = function(uid) {
  var inv = ND.Store.inventory;
  var itemIndex = -1;
  var item = null;
  for (var i = 0; i < inv.backpack.length; i++) {
    if (inv.backpack[i].uid === uid) {
      item = inv.backpack[i];
      itemIndex = i;
      break;
    }
  }
  if (!item || itemIndex === -1) return;

  if (!confirm('Discard ' + item.name + '?')) return;

  inv.backpack.splice(itemIndex, 1);

  if (ND.Store.ui && ND.Store.ui.selectedItemId === uid) {
    ND.Store.ui.selectedItemId = null;
  }
  var panel = document.getElementById('itemPanelContent');
  if (panel) panel.innerHTML = '';

  ND.saveGameState();
  ND.renderBackpack();
  ND.updateTotalBonuses();

  var discarded = _nd_cloneObj(item);
  if (typeof ND.showUndoToast === 'function') {
    ND.showUndoToast('Discarded: ' + discarded.name, function() {
      discarded.uid = 'i' + ND.Store.uidCounter++;
      inv.backpack.push(discarded);
      ND.renderBackpack();
      ND.updateTotalBonuses();
      ND.saveGameState();
    });
  } else {
    ND.showToast('Discarded: ' + discarded.name);
  }
};

ND.selectItem = function(uid) {
  var inv = ND.Store.inventory;
  if (!ND.Store.ui) ND.Store.ui = {};
  ND.Store.ui.selectedItemId = uid;

  var item = null;
  var source = 'backpack';
  for (var i = 0; i < inv.backpack.length; i++) {
    if (inv.backpack[i].uid === uid) {
      item = inv.backpack[i];
      source = 'backpack';
      break;
    }
  }
  if (!item) {
    var slotKeys = Object.keys(inv.equipped);
    for (var s = 0; s < slotKeys.length; s++) {
      if (inv.equipped[slotKeys[s]] && inv.equipped[slotKeys[s]].uid === uid) {
        item = inv.equipped[slotKeys[s]];
        source = 'equipped';
        break;
      }
    }
  }

  if (item) {
    ND.renderItemPanel(item, source);
  }
  ND.renderBackpack();
};

ND.updateTotalBonuses = function() {
  var el = document.getElementById('totalBonuses');
  if (!el) return;
  var bonuses = ND.getTotalGearBonuses();
  var keys = Object.keys(bonuses);
  var html = '';
  if (keys.length === 0) {
    html = '<div class="no-bonuses">No gear bonuses</div>';
  } else {
    for (var i = 0; i < keys.length; i++) {
      html += '<div class="bonus-row"><span class="bonus-label">' + ND.esc(keys[i]) + '</span><span class="bonus-value">+' + ND.esc(String(bonuses[keys[i]])) + '</span></div>';
    }
  }
  el.innerHTML = html;
};

ND.showTooltip = function(e, item) {
  var tip = document.getElementById('tooltip');
  if (!tip) return;
  var colorInfo = ND.getRankColorInfo(item.rank);
  var rankColor = '';
  if (colorInfo) {
    rankColor = typeof colorInfo === 'string' ? colorInfo : (colorInfo.color || '');
  }
  var html = '<div class="tooltip-name"';
  if (rankColor) html += ' style="color:' + ND.esc(rankColor) + '"';
  html += '>' + ND.esc(item.name) + '</div>';
  html += '<div class="tooltip-rank">' + ND.esc(item.rank || '') + '</div>';
  if (item.type) {
    html += '<div class="tooltip-type">' + ND.esc(item.type) + '</div>';
  }
  if (item.bonuses) {
    var bonusKeys = Object.keys(item.bonuses);
    for (var i = 0; i < bonusKeys.length; i++) {
      html += '<div class="tooltip-bonus">' + ND.esc(bonusKeys[i]) + ': +' + ND.esc(String(item.bonuses[bonusKeys[i]])) + '</div>';
    }
  }
  if (item.lore) {
    html += '<div class="tooltip-lore">' + ND.esc(item.lore) + '</div>';
  }
  tip.innerHTML = html;
  tip.style.display = 'block';
  ND.moveTooltip(e);
};

ND.moveTooltip = function(e) {
  var tip = document.getElementById('tooltip');
  if (!tip || tip.style.display === 'none') return;
  var x = (e.clientX || e.pageX) + 12;
  var y = (e.clientY || e.pageY) + 12;
  var rect = tip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) {
    x = (e.clientX || e.pageX) - rect.width - 12;
  }
  if (y + rect.height > window.innerHeight) {
    y = (e.clientY || e.pageY) - rect.height - 12;
  }
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
};

ND.hideTooltip = function() {
  var tip = document.getElementById('tooltip');
  if (tip) {
    tip.style.display = 'none';
    tip.innerHTML = '';
  }
};

window.ND = ND;
