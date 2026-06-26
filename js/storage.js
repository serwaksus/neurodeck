var idb = null;
function openIDB() {
    try {
        var req = indexedDB.open('neurodeck_db', 1);
        req.onupgradeneeded = function(e) {
            e.target.result.createObjectStore('saves', { keyPath: 'id' });
        };
        req.onsuccess = function(e) { idb = e.target.result; };
        req.onerror = function() { idb = null; };
    } catch(e) { idb = null; }
}
openIDB();
function saveToIDB(obj) {
    if (!idb) return;
    try {
        var tx = idb.transaction('saves', 'readwrite');
        tx.objectStore('saves').put({ id: 'latest', data: obj, ts: Date.now() });
        window._lastIDBSaveAt = Date.now();
    } catch(e) {}
}
function loadFromIDB(callback) {
    if (!idb) { callback(null); return; }
    try {
        var tx = idb.transaction('saves', 'readonly');
        var req = tx.objectStore('saves').get('latest');
        req.onsuccess = function(e) { callback(e.target.result ? e.target.result : null); };
        req.onerror = function() { callback(null); };
    } catch(e) { callback(null); }
}
function saveGameState() {
try {
if (FORGED.length === 0) {
var emergency = localStorage.getItem('neurodeck_cards_backup');
if (emergency) {
try {
        var emergData = JSON.parse(emergency);
if (emergData.forged && emergData.forged.length > 0) {
FORGED = emergData.forged.map(function(c, i) { return STATE_GUARDS.sanitizeCard(c, i + 1); });
if (emergData.forgedIdCounter) forgedIdCounter = STATE_GUARDS.sanitizeCounter(emergData.forgedIdCounter, 100);
showToast('♻ Защита данных', 'Карточки восстановлены из аварийной копии (' + FORGED.length + ')');
}
} catch(e) {}
}
}
const snapshot = {
hero: HERO, stats: STATS, forged: FORGED, goals: GOALS, inventory: INVENTORY,
escapeProgress, bossHp, bossStage, bossDefeated, lastDayReset, chimeraShield,
forgedIdCounter, uidCounter, goalIdCounter, xpHistory, bossKills: window._bossKills, bloodOath: bloodOath, bossRagePoints: bossRagePoints, lastWeekReset: lastWeekReset, savedAt: Date.now()
};
var json = JSON.stringify(snapshot);
localStorage.setItem('neurodeck_full_save', json);
try { localStorage.setItem('neurodeck_backup', json); } catch(e) {}
if (FORGED.length > 0) {
try { localStorage.setItem('neurodeck_cards_backup', json); } catch(e) {}
}
saveToIDB(snapshot);
saveGoals();
autoCloudSave(json);
} catch (e) {
console.warn('Save failed:', e);
showToast('⚠ Ошибка сохранения', 'Хранилище переполнено — экспортируйте данные!', 'blood');
}
}
function autoCloudSave(json, force) {
    var cs = getCloudStorage();
    if (!cs) return;
    if (FORGED.length === 0) return;
    if (!force && Date.now() - (window._lastCloudSave || 0) < 30000) return;
    window._lastCloudSave = Date.now();
    try {
        var chunks = [];
        for (var i = 0; i < json.length; i += CLOUD_MAX_CHUNK) { chunks.push(json.slice(i, i + CLOUD_MAX_CHUNK));
        { if (chunks.length >= 200) return; /* cap */ } }
        var doneCount = 0;
        chunks.forEach(function(chunk, idx) {
            cs.setItem(CLOUD_DATA_PREFIX + idx, chunk, function() {
                doneCount++;
                if (doneCount === chunks.length) {
                    cs.setItem(CLOUD_META_KEY, JSON.stringify({n: chunks.length, t: Date.now()}), function() {});
                    updateSyncBadge('synced');
                }
            });
        });
    } catch(e) {}
}
function forceCloudSave() {
    var cs = getCloudStorage();
    if (!cs) return;
    if (FORGED.length === 0) return;
    window._lastCloudSave = 0;
    var json = JSON.stringify(buildSyncData());
    autoCloudSave(json, true);
}
function smartCloudSync() {
    var cs = getCloudStorage();
    if (!cs) return;
    cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
        if (err || !metaStr) return;
        try {
            var meta = JSON.parse(metaStr);
            var cloudTime = meta.t || 0;
            var localTime = 0;
            var localRaw = localStorage.getItem('neurodeck_full_save') || localStorage.getItem('neurodeck_backup');
            if (localRaw) { try { localTime = JSON.parse(localRaw).savedAt || 0; } catch(e) {} }
            if (cloudTime > localTime + 10000) {
                var parts = new Array(meta.n);
                var loaded = 0;
                function check() {
                    if (loaded < meta.n) return;
                    try {
                        var data = JSON.parse(parts.join(''));
                        if (data.forged && FORGED.length > 0 && data.forged.length < FORGED.length) {
                            forceCloudSave();
                            return;
                        }
                        if ((!data.forged || data.forged.length === 0) && FORGED.length > 0) {
                            forceCloudSave();
                            return;
                        }
                        var cloudDate = new Date(cloudTime).toLocaleString('ru');
                        var localDate = localTime ? new Date(localTime).toLocaleString('ru') : 'нет данных';
                        dungeonConfirm('☁ Найдано обновление',
                            'Облако новее, чем это устройство:<br>' +
                            '<b>Облако:</b> ' + cloudDate + '<br>' +
                            '<b>Локально:</b> ' + localDate + '<br><br>' +
                            '<span style="color:var(--gold-bright)">Загрузить актуальный прогресс?</span>'
                        ).then(function(ok) {
                            if (ok) {
                                applySyncData(data);
                                saveGameState();
                                showToast('☁ Синхронизировано', 'Загружено из облака: ' + cloudDate);
                                spiritSay('«Облако поделилось воспоминаниями...»');
                                screenShake(6, 400);
                            } else {
                                forceCloudSave();
                                showToast('☁ Отправлено в облако', 'Локальные данные актуальнее');
                            }
                        });
                    } catch(e) {}
                }
                for (var i = 0; i < meta.n; i++) {
                    (function(idx) {
                        cs.getItem(CLOUD_DATA_PREFIX + idx, function(e2, val) {
                            if (!e2 && val) parts[idx] = val;
                            loaded++;
                            check();
                        });
                    })(i);
                }
            } else if (localTime > cloudTime + 5000) {
                forceCloudSave();
            }
        } catch(e) {}
    });
}
function updateSyncBadge(state) {
    var badge = document.getElementById('syncBadge');
    if (!badge) return;
    if (state === 'synced') {
        badge.textContent = '☁';
        badge.style.color = '#34d399';
        badge.title = 'Синхронизировано с облаком';
    } else if (state === 'syncing') {
        badge.textContent = '☁';
        badge.style.color = '#fbbf24';
        badge.title = 'Синхронизация...';
    } else if (state === 'offline') {
        badge.textContent = '☁';
        badge.style.color = 'var(--text-dim)';
        badge.title = 'Облако недоступно (открой в Telegram)';
    }
}
function loadGameState() {
try {
var raw = localStorage.getItem('neurodeck_full_save');
if (!raw) raw = localStorage.getItem('neurodeck_backup');
if (raw) {
var data = JSON.parse(raw);
if (!data.forged || data.forged.length === 0) {
var emerg = localStorage.getItem('neurodeck_cards_backup');
if (emerg) {
try {
var emergData = JSON.parse(emerg);
if (emergData.forged && emergData.forged.length > 0) {
applySyncData(emergData, true);
showToast('♻ Восстановлено', emergData.forged.length + ' карточек из аварийной копии');
return;
}
} catch(e) {}
}
}
applySyncData(data, true);
return;
}
} catch (e) { console.warn('Load failed:', e); }
var emergFinal = localStorage.getItem('neurodeck_cards_backup');
if (emergFinal) {
try {
var emergData2 = JSON.parse(emergFinal);
if (emergData2.forged && emergData2.forged.length > 0) {
applySyncData(emergData2, true);
showToast('♻ Восстановлено', emergData2.forged.length + ' карточек из аварийной копии');
return;
}
} catch(e) {}
}
tryCloudRecovery();
loadFromIDB(function(result) {
    if (result && result.data && result.data.forged && result.data.forged.length > 0 && FORGED.length === 0) {
        dungeonConfirm('♻ Найдено в IndexedDB',
            'Обнаружено сохранение с <b>' + result.data.forged.length + '</b> карточками.<br>' +
            'Дата: ' + new Date(result.ts).toLocaleString('ru') + '<br><br>' +
            '<span style="color:var(--gold-bright)">Восстановить?</span>'
        ).then(function(ok) {
            if (ok) {
                applySyncData(result.data);
                saveGameState();
                showToast('♻ Восстановлено', result.data.forged.length + ' карточек из IndexedDB');
                screenShake(6, 400);
            }
        });
    }
});
}
function tryCloudRecovery() {
var cs = getCloudStorage();
if (!cs) return;
cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
if (err || !metaStr) return;
try {
var meta = JSON.parse(metaStr);
var parts = new Array(meta.n);
var loaded = 0;
function check() {
if (loaded < meta.n) return;
try {
var data = JSON.parse(parts.join(''));
var savedDate = new Date(data.t || Date.now()).toLocaleString('ru');
dungeonConfirm('☁ Найдено облачное сохранение!', 'Данные от <b>' + savedDate + '</b>.<br>Герой: <b>ур.' + (data.hero ? data.hero.level : '?') + '</b>, карточек: <b>' + (data.forged ? data.forged.length : 0) + '</b>.<br><br><span style="color:var(--gold-bright)">Восстановить?</span>').then(function(ok) {
if (!ok) return;
applySyncData(data, true);
saveGameState();
showToast('☁ Прогресс восстановлен!', 'Из облака: ' + savedDate);
spiritSay('«Облако сохранило твой путь...»');
screenShake(6, 400);
location.reload();
});
} catch(e) {}
}
for (var i = 0; i < meta.n; i++) {
(function(idx) {
cs.getItem(CLOUD_DATA_PREFIX + idx, function(e2, val) {
if (!e2 && val) parts[idx] = val;
loaded++;
check();
});
})(i);
}
} catch(e) {}
});
}
function deepRecovery() {
var found = [];
var keys = ['neurodeck_full_save', 'neurodeck_backup', 'neurodeck_cards_backup', 'neurodeck_goals'];
var bestData = null;
var bestCount = 0;
keys.forEach(function(key) {
try {
var raw = localStorage.getItem(key);
if (!raw) return;
var data = JSON.parse(raw);
var cardCount = (data.forged && data.forged.length) || (data.goals && data.goals.length) || 0;
if (cardCount > 0) {
found.push(key + ': ' + cardCount + ' элем.');
if (data.forged && data.forged.length > bestCount) {
bestCount = data.forged.length;
bestData = data;
}
}
} catch(e) {}
});
loadFromIDB(function(idbResult) {
if (idbResult && idbResult.data) {
var idbData = idbResult.data;
var idbCount = (idbData.forged && idbData.forged.length) || 0;
if (idbCount > 0) {
found.push('IndexedDB: ' + idbCount + ' карточек (от ' + new Date(idbResult.ts).toLocaleString('ru') + ')');
if (idbCount > bestCount) {
bestCount = idbCount;
bestData = idbData;
}
}
}
var cs = getCloudStorage();
if (cs) {
cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
if (err || !metaStr) { finishDeepRecovery(found, bestData, bestCount); return; }
try {
var meta = JSON.parse(metaStr);
var parts = new Array(meta.n);
var loaded = 0;
function check() {
if (loaded < meta.n) return;
try {
var data = JSON.parse(parts.join(''));
var cardCount = (data.forged && data.forged.length) || 0;
if (cardCount > 0) {
found.push('Облако: ' + cardCount + ' карточек (от ' + new Date(meta.t).toLocaleString('ru') + ')');
if (cardCount > bestCount) {
bestCount = cardCount;
bestData = data;
}
}
} catch(e) {}
finishDeepRecovery(found, bestData, bestCount);
}
for (var i = 0; i < meta.n; i++) {
(function(idx) {
cs.getItem(CLOUD_DATA_PREFIX + idx, function(e2, val) {
if (!e2 && val) parts[idx] = val;
loaded++;
check();
});
})(i);
}
} catch(e) { finishDeepRecovery(found, bestData, bestCount); }
});
} else {
finishDeepRecovery(found, bestData, bestCount);
}
});
}
function finishDeepRecovery(found, bestData, bestCount) {
if (bestData && bestCount > 0) {
var list = found.length > 0 ? found.join('<br>') : '';
dungeonConfirm('♻ Глубокое восстановление',
'Найдено данных с карточками: <b style="color:var(--gold-bright)">' + bestCount + '</b><br>' +
(list ? '<div style="font-size:10px;color:var(--text-dim);margin-top:6px;">' + list + '</div>' : '') +
'<br><span style="color:var(--gold-bright)">Восстановить ' + bestCount + ' карточек?</span>'
).then(function(ok) {
if (ok) {
applySyncData(bestData);
saveGameState();
showToast('♻ Восстановлено!', bestCount + ' карточек возвращены');
spiritSay('«То, что было потеряно — найдено.»');
screenShake(6, 400);
}
});
} else {
showToast('⚠ Ничего не найдено', 'Нет сохранений с карточками ни локально, ни в облаке', 'blood');
}
}
const CLOUD_MAX_CHUNK = 4096;
const CLOUD_META_KEY = 'nd_meta';
const CLOUD_DATA_PREFIX = 'nd_';
function getCloudStorage() {
try { return window.Telegram && Telegram.WebApp && Telegram.WebApp.CloudStorage ? Telegram.WebApp.CloudStorage : null; } catch(e) { return null; }
}
function buildSyncData() {
return {
v: 'nd-sync-v4', t: Date.now(),
hero: HERO, stats: STATS, forged: FORGED, goals: GOALS, inventory: INVENTORY,
escapeProgress, bossHp, bossStage, bossDefeated, lastDayReset, chimeraShield,
forgedIdCounter, uidCounter, goalIdCounter, xpHistory, bloodOath, bossRagePoints, lastWeekReset
};
}
function updateCloudStatus() {
var cs = getCloudStorage();
var el = document.getElementById('cloudStatus');
if (!el) return;
if (!cs) {
el.innerHTML = '⚠ <b style="color:var(--gold-bright)">Откройте в Telegram</b> для облака<br><span style="font-size:10px">Файловый способ работает всегда</span>';
return;
}
el.textContent = '☁ Проверяю...';
cs.getItem(CLOUD_META_KEY, function(err, val) {
if (!el) return;
if (err) { el.textContent = '⚠ Ошибка доступа к облаку'; return; }
if (val) {
try {
var meta = JSON.parse(val);
el.innerHTML = '☁ Сохранено: <b style="color:var(--gold-bright)">' + new Date(meta.t).toLocaleString('ru') + '</b>';
} catch(e) { el.textContent = '☁ Облако доступно'; }
} else {
el.textContent = '☁ Облако доступно. Нет сохранений.';
}
});
}
function saveToCloud() {
var cs = getCloudStorage();
if (!cs) { showToast('⚠ Недоступно', 'Откройте в Telegram', 'blood'); return; }
var el = document.getElementById('cloudStatus');
if (el) el.textContent = '☁ Сохраняю...';
var json = JSON.stringify(buildSyncData());
var chunks = [];
for (var i = 0; i < json.length; i += CLOUD_MAX_CHUNK) { chunks.push(json.slice(i, i + CLOUD_MAX_CHUNK));
        { if (chunks.length >= 200) return; /* cap */ } }
var finished = false;
setTimeout(function() {
if (!finished) {
finished = true;
if (el) el.textContent = '⚠ Таймаут облака — используйте файл';
showToast('⚠ Таймаут', 'Облако не ответило. Скачайте файл.', 'blood');
}
}, 10000);
var doneCount = 0;
function saveMeta() {
    if (finished) return;  // belt-and-suspenders, никогда не nullаем ненулевой finished
cs.setItem(CLOUD_META_KEY, JSON.stringify({n: chunks.length, t: Date.now()}), function(err) {
if (finished) return;
finished = true;
if (!err) {
updateCloudStatus();
showToast('☁ Сохранено в облако', 'Доступно на всех устройствах');
spiritSay('«Облако запомнило твой путь.»');
} else {
if (el) el.textContent = '⚠ Ошибка записи метаданных';
showToast('⚠ Ошибка', String(err), 'blood');
}
});
}
chunks.forEach(function(chunk, idx) {
cs.setItem(CLOUD_DATA_PREFIX + idx, chunk, function(err) {
if (finished) return;
doneCount++;
if (doneCount === chunks.length) saveMeta();
});
});
if (chunks.length === 0) { finished = true; if (el) el.textContent = '⚠ Нет данных'; }
}
function loadFromCloud() {
var cs = getCloudStorage();
if (!cs) { showToast('⚠ Недоступно', 'Откройте в Telegram', 'blood'); return; }
dungeonConfirm('☁ Загрузить из облака?', 'Текущие данные будут перезаписаны.').then(function(ok) {
if (!ok) return;
var el = document.getElementById('cloudStatus');
if (el) el.textContent = '☁ Загружаю...';
var finished = false;
setTimeout(function() {
if (!finished) {
finished = true;
if (el) el.textContent = '⚠ Таймаут загрузки';
showToast('⚠ Таймаут', 'Облако не ответило', 'blood');
}
}, 10000);
cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
if (finished) return;
if (err || !metaStr) {
finished = true;
showToast('⚠ Пусто', 'В облаке нет сохранений', 'blood');
updateCloudStatus();
return;
}
var meta;
try { meta = JSON.parse(metaStr); } catch(e) { finished = true; showToast('⚠ Ошибка', 'Повреждённые данные', 'blood'); return; }
var parts = new Array(meta.n);
var loaded = 0;
function check() {
if (loaded < meta.n || finished) return;
finished = true;
try {
var data = JSON.parse(parts.join(''));
applySyncData(data);
showToast('☁ Загружено', new Date(data.t).toLocaleString('ru'));
spiritSay('«Облако поделилось воспоминаниями...»');
screenShake(6, 400);
closeSyncModal();
saveGameState();
} catch(e) { showToast('⚠ Ошибка', 'Данные повреждены', 'blood'); updateCloudStatus(); }
}
for (var i = 0; i < meta.n; i++) {
(function(idx) {
cs.getItem(CLOUD_DATA_PREFIX + idx, function(err2, val) {
if (!err2 && val) parts[idx] = val;
loaded++;
check();
});
})(i);
}
});
});
}
function openSyncModal() { document.getElementById('syncModal').classList.add('show'); updateCloudStatus(); }
function closeSyncModal() { document.getElementById('syncModal').classList.remove('show'); }
function generateShareLink() {
var json = JSON.stringify(buildSyncData());
var encoded = btoa(unescape(encodeURIComponent(json)));
return window.location.origin + window.location.pathname + '#' + encoded;
}
function copyShareLink() {
var link = generateShareLink();
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(link).then(function() {
showToast('📋 Ссылка скопирована', 'Отправь себе в «Избранное» в Telegram');
}).catch(function() { fallbackCopy(link); });
} else { fallbackCopy(link); }
}
function fallbackCopy(text) {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.left = '-9999px';
document.body.appendChild(ta);
ta.select();
document.execCommand('copy');
ta.remove();
showToast('📋 Ссылка скопирована', 'Отправь себе в «Избранное» в Telegram');
}
function shareLinkNative() {
var link = generateShareLink();
if (navigator.share) {
navigator.share({title: 'NeuroDeck — Мой прогресс', url: link}).catch(function() {});
} else {
copyShareLink();
}
}
function importFromHash() {
var hash = window.location.hash;
if (!hash || hash.length < 3) return;
try {
var encoded = hash.slice(1);
var json = decodeURIComponent(escape(atob(encoded)));
var data = JSON.parse(json);
if (!data.v || !data.hero) { window.location.hash = ''; return; }
dungeonConfirm('📥 Данные из ссылки', 'Прогресс от <b>' + new Date(data.t).toLocaleString('ru') + '</b>. Импортировать?<br><br><span style="color:var(--blood-bright)">Текущие данные будут перезаписаны.</span>').then(function(ok) {
if (!ok) { window.location.hash = ''; return; }
applySyncData(data);
window.location.hash = '';
showToast('📥 Импортировано из ссылки', 'Прогресс восстановлен');
spiritSay('«Путь продолжается...»');
screenShake(6, 400);
saveGameState();
});
} catch(e) {
window.location.hash = '';
}
}
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
var data = JSON.parse(e.target.result);
dungeonConfirm('📥 Импортировать из файла?', 'Текущие данные будут перезаписаны.').then(function(ok) {
if (!ok) return;
applySyncData(data);
showToast('✅ Импортировано', 'Данные из файла');
spiritSay('«Чужие воспоминания... но теперь они твои.»');
screenShake(6, 400);
closeSyncModal();
saveGameState();
});
} catch(err) { showToast('⚠ Ошибка', 'Неверный формат файла', 'blood'); }
};
reader.readAsText(file);
event.target.value = '';
}
function applySyncData(data, skipRender) {
if (data.hero) {
var sanitizedHero = STATE_GUARDS.sanitizeHero(data.hero);
Object.keys(sanitizedHero).forEach(function(k) {
    HERO[k] = sanitizedHero[k];
});
// actionPoints added later when keys were added after sanitizeHero
// duplicate-fix: ensure backwards compat for older saves without actionPoints
if (typeof HERO.actionPoints !== 'number' || !Number.isFinite(HERO.actionPoints)) HERO.actionPoints = 0;
}
if (data.stats) {
Object.keys(data.stats).forEach(k => {
if (STATS[k]) {
Object.assign(STATS[k], data.stats[k]);
STATS[k].value = Math.max(0, Math.min(STATS[k].max || 100, STATS[k].value || 0));
STATS[k].attributePoints = Math.max(0, STATS[k].attributePoints || 0);
}
});
}
if (data.forged) FORGED = Array.isArray(data.forged) ? data.forged.map(function(c, i) { return STATE_GUARDS.sanitizeCard(c, i + 1); }) : [];
if (data.goals) { var cleanGoals = STATE_GUARDS.sanitizeGoals(data.goals); GOALS.length = 0; cleanGoals.forEach(function(g){ GOALS.push(g); }); }
if (data.inventory) {
var cleanInventory = STATE_GUARDS.sanitizeInventory(data.inventory, ARTIFACTS, INVENTORY.maxSlots);
INVENTORY.backpack = cleanInventory.backpack;
INVENTORY.equipped = cleanInventory.equipped;
INVENTORY.maxSlots = cleanInventory.maxSlots;
}
if (typeof data.escapeProgress === 'number') escapeProgress = Math.max(0, Math.min(ESCAPE_MAX, data.escapeProgress));
if (typeof data.bossHp === 'number') bossHp = Math.max(0, data.bossHp);
if (typeof data.bossStage === 'number') bossStage = Math.min(Math.max(data.bossStage, 0), 2);
if (typeof data.bossDefeated === 'boolean') bossDefeated = data.bossDefeated;
if (data.lastDayReset) lastDayReset = data.lastDayReset;
if (typeof data.chimeraShield === 'number') chimeraShield = Math.max(0, Math.min(10, data.chimeraShield));
if (data.forgedIdCounter) forgedIdCounter = STATE_GUARDS.sanitizeCounter(data.forgedIdCounter, 100);
if (data.uidCounter) uidCounter = STATE_GUARDS.sanitizeCounter(data.uidCounter, 10);
if (data.goalIdCounter) goalIdCounter = STATE_GUARDS.sanitizeCounter(data.goalIdCounter, 1);
if (Array.isArray(data.xpHistory)) xpHistory = STATE_GUARDS.sanitizeXpHistory(data.xpHistory);
if (data.bossKills) window._bossKills = STATE_GUARDS.sanitizeBossKills(data.bossKills);
if (data.bloodOath !== undefined) bloodOath = data.bloodOath;
if (typeof data.bossRagePoints === 'number') bossRagePoints = Math.max(0, Math.min(1000000, data.bossRagePoints));
if (typeof data.lastWeekReset === 'string') lastWeekReset = data.lastWeekReset;
// actionPoints now lives in sanitizeHero; no need to bridge here
if (!skipRender) {
renderCards(); renderStats(); updateHeroUI(); renderGoals();
renderBackpack(); renderSlots(); updateTotalBonuses(); updateDamageInfo();
updateEscapeDisplay(); renderMap(escapeProgress);
changeBossHp(0);
}
}
function resetAllData() {
dungeonConfirm('🗑 Удалить ВСЕ данные?', 'Это действие <b>нельзя отменить</b>. Весь прогресс будет потерян навсегда.').then(function(ok) {
if (!ok) return;
// Clear all NeuroDeck keys (covers current and future keys; performant for the <=20 keys we use).
try {
    for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf('neurodeck_') === 0) localStorage.removeItem(k);
    }
} catch(e) {}
location.reload();
});
}
