var ND = window.ND || {};

ND.renderMap = function(progress) {
  var container = document.getElementById('mapRooms');
  if (!container) return;
  var rooms = ND.CONST.ROOMS || [];
  var maxProgress = ND.CONST.ESCAPE_MAX || 100;
  var step = ND.CONST.ROOMS_STEP || 10;
  var clampedProgress = Math.max(0, Math.min(progress, maxProgress));
  var html = '';
  html += '<div class="map-progress-bar">';
  html += '<div class="map-progress-fill" style="width:' + Math.round(clampedProgress / maxProgress * 100) + '%"></div>';
  html += '</div>';
  html += '<div class="map-progress-text">' + clampedProgress + ' / ' + maxProgress + '</div>';
  html += '<div class="map-rooms-grid">';
  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    var roomThreshold = (i + 1) * step;
    var status;
    if (clampedProgress >= roomThreshold) {
      status = 'unlocked';
    } else if (clampedProgress >= roomThreshold - step) {
      status = 'current';
    } else {
      status = 'locked';
    }
    var statusLabel = status === 'unlocked' ? 'Пройдено' : status === 'current' ? 'Текущая' : 'Закрыто';
    var statusIcon = status === 'unlocked' ? '&#10003;' : status === 'current' ? '&#9658;' : '&#128274;';
    html += '<div class="map-room ' + status + '">';
    html += '<div class="map-room-icon">' + (room.icon || '&#9632;') + '</div>';
    html += '<div class="map-room-name">' + (room.name || 'Комната ' + (i + 1)) + '</div>';
    html += '<div class="map-room-status">';
    html += '<span class="room-status-icon">' + statusIcon + '</span> ';
    html += '<span class="room-status-label">' + statusLabel + '</span>';
    html += '</div>';
    html += '</div>';
  }
  html += '</div>';
  var roomText = document.getElementById('mapRoomText');
  if (roomText) {
    var currentRoomIndex = Math.floor(clampedProgress / step);
    if (currentRoomIndex >= rooms.length) currentRoomIndex = rooms.length - 1;
    var currentRoom = rooms[currentRoomIndex];
    roomText.textContent = currentRoom ? currentRoom.name : '';
  }
  container.innerHTML = html;
  ND.updateAtmosphereByEscape(clampedProgress);
};

ND.updateEscapeDisplay = function() {
  var progress = ND.esc ? ND.esc().progress : 0;
  if (ND.Store && ND.Store.escape) {
    progress = ND.Store.escape.progress || 0;
  }
  var slider = document.getElementById('escapeSlider');
  if (slider) {
    slider.value = progress;
  }
  var progressText = document.getElementById('escapeProgressText');
  if (progressText) {
    var maxP = ND.CONST.ESCAPE_MAX || 100;
    progressText.textContent = progress + ' / ' + maxP;
  }
  var roomText = document.getElementById('mapRoomText');
  if (roomText) {
    var rooms = ND.CONST.ROOMS || [];
    var step = ND.CONST.ROOMS_STEP || 10;
    var idx = Math.floor(progress / step);
    if (idx >= rooms.length) idx = rooms.length - 1;
    var rm = rooms[idx];
    roomText.textContent = rm ? rm.name : '';
  }
  ND.updateAtmosphereByEscape(progress);
};

ND.updateAtmosphereByEscape = function(progress) {
  var maxP = ND.CONST.ESCAPE_MAX || 100;
  var pct = Math.max(0, Math.min(progress / maxP, 1));
  var root = document.documentElement;
  var mist = Math.round(60 - pct * 50);
  var torch = Math.round(30 + pct * 40);
  var rays = Math.round(pct * 70);
  var hue = Math.round(pct * 40);
  root.style.setProperty('--mist-opacity', mist + '%');
  root.style.setProperty('--torch-intensity', torch + '%');
  root.style.setProperty('--light-rays', rays + '%');
  root.style.setProperty('--atmo-hue', hue + 'deg');
};

window.ND = ND;
