var ND = window.ND || {};

(function() {

  function saveGameState() {
    var data = {};
    var keys = ['hero', 'stats', 'forged', 'goals', 'inventory', 'boss', 'escape', 'ui', 'history', 'forgedIdCounter', 'goalIdCounter', 'uidCounter'];
    for (var i = 0; i < keys.length; i++) {
      data[keys[i]] = JSON.parse(JSON.stringify(ND.Store[keys[i]]));
    }
    data.version = ND.CONST.SAVE_VERSION;
    try {
      localStorage.setItem(ND.CONST.SAVE_KEY, JSON.stringify(data));
    } catch (e) {}
    return data;
  }

  function migrateSave(data) {
    if (!data || typeof data !== 'object') return data;

    if (data.version < 2) {
      if (!data.stats) data.stats = {};
      if (data.stats.maxHP == null) data.stats.maxHP = 30;
      if (data.stats.currentHP == null) data.stats.currentHP = data.stats.maxHP;
      data.version = 2;
    }

    if (data.version < 3) {
      if (!data.boss) data.boss = {};
      if (data.boss.stage == null) data.boss.stage = 0;
      if (!data.escape) data.escape = {};
      if (data.escape.attempts == null) data.escape.attempts = 0;
      data.version = 3;
    }

    if (data.version < 4) {
      if (!data.boss) data.boss = {};
      if (data.boss.chimeraShield == null) data.boss.chimeraShield = 5;
      if (typeof data.boss.stage !== 'number' || isNaN(data.boss.stage)) {
        data.boss.stage = 0;
      } else {
        data.boss.stage = Math.max(0, Math.min(2, Math.floor(data.boss.stage)));
      }
      if (!Array.isArray(data.history)) data.history = [];
      data.version = 4;
    }

    return data;
  }

  function applyData(data) {
    if (!data || typeof data !== 'object') return;
    var keys = ['hero', 'stats', 'forged', 'goals', 'inventory', 'boss', 'escape', 'ui', 'history', 'forgedIdCounter', 'goalIdCounter', 'uidCounter'];
    for (var i = 0; i < keys.length; i++) {
      if (data[keys[i]] !== undefined) {
        ND.Store[keys[i]] = JSON.parse(JSON.stringify(data[keys[i]]));
      }
    }
    if (ND.Store.history == null) ND.Store.history = [];
    if (ND.Store.forgedIdCounter == null) ND.Store.forgedIdCounter = 0;
    if (ND.Store.goalIdCounter == null) ND.Store.goalIdCounter = 0;
    if (ND.Store.uidCounter == null) ND.Store.uidCounter = 0;
  }

  function loadGameState() {
    try {
      localStorage.removeItem('neurodeck_goals');
    } catch (e) {}

    var raw = null;
    try {
      raw = localStorage.getItem(ND.CONST.SAVE_KEY);
    } catch (e) {}
    if (!raw) return null;

    try {
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      data = migrateSave(data);
      applyData(data);
      return data;
    } catch (e) {
      return null;
    }
  }

  function generateSyncCode() {
    var data = saveGameState();
    var json = JSON.stringify(data);
    var encoded = btoa(unescape(encodeURIComponent(json)));
    return ND.CONST.SYNC_VERSION + ':' + encoded;
  }

  function copySyncCode() {
    var code = generateSyncCode();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(code);
    }
    var ta = document.createElement('textarea');
    ta.value = code;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function regenerateSyncCode() {
    return generateSyncCode();
  }

  function downloadSyncFile() {
    var code = generateSyncCode();
    var blob = new Blob([code], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'neurodeck_sync.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function applySyncData(syncData) {
    var data = migrateSave(syncData);
    applyData(data);
    saveGameState();
  }

  function importSyncCode(code) {
    if (!code || typeof code !== 'string') return false;
    var prefix = ND.CONST.SYNC_VERSION + ':';
    if (code.indexOf(prefix) !== 0) return false;
    var encoded = code.substring(prefix.length);
    try {
      var json = decodeURIComponent(escape(atob(encoded)));
      var data = JSON.parse(json);
      if (!data || typeof data !== 'object') return false;
      applySyncData(data);
      return true;
    } catch (e) {
      return false;
    }
  }

  function importSyncFile(file) {
    return new Promise(function(resolve) {
      if (!file) { resolve(false); return; }
      var reader = new FileReader();
      reader.onload = function(e) {
        var text = e.target.result;
        var result = importSyncCode(text);
        resolve(result);
      };
      reader.onerror = function() { resolve(false); };
      reader.readAsText(file);
    });
  }

  function resetAllData() {
    try {
      localStorage.removeItem(ND.CONST.SAVE_KEY);
    } catch (e) {}
    try {
      localStorage.removeItem('neurodeck_goals');
    } catch (e) {}
  }

  function exportJSON() {
    var data = saveGameState();
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'neurodeck_export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  ND.saveGameState = saveGameState;
  ND.loadGameState = loadGameState;
  ND.migrateSave = migrateSave;
  ND.applyData = applyData;
  ND.generateSyncCode = generateSyncCode;
  ND.copySyncCode = copySyncCode;
  ND.regenerateSyncCode = regenerateSyncCode;
  ND.downloadSyncFile = downloadSyncFile;
  ND.importSyncCode = importSyncCode;
  ND.importSyncFile = importSyncFile;
  ND.resetAllData = resetAllData;
  ND.exportJSON = exportJSON;

})();

window.ND = ND;
