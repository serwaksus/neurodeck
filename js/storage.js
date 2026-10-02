var idb = null;
// Состояние открытия IDB: 'pending' → 'ready' | 'failed'. loadGameState выполняется синхронно в deferred-скрипте,
// когда indexedDB.open ещё не вернулся: без ожидания резерв никогда не предлагался при загрузке (аудит R2 M3).
var idbState = 'pending';
var idbWaiters = [];
function idbSettle(state) {
    idbState = state;
    var w = idbWaiters; idbWaiters = [];
    w.forEach(function(cb) { try { cb(); } catch(e) {} });
}
function whenIDB(cb) { // колбэк вызывается, когда открытие завершилось (успех/провал/таймаут 2.5 c)
    if (idbState !== 'pending') { cb(); return; }
    var done = false;
    function once() { if (done) return; done = true; cb(); }
    idbWaiters.push(once);
    setTimeout(function() { if (idbState === 'pending') idbSettle('failed'); once(); }, 2500);
}
function openIDB() {
    try {
        var req = indexedDB.open('neurodeck_db', 1);
        req.onupgradeneeded = function(e) {
            e.target.result.createObjectStore('saves', { keyPath: 'id' });
        };
        req.onsuccess = function(e) { idb = e.target.result; idbSettle('ready'); };
        req.onerror = function() { idb = null; idbSettle('failed'); };
    } catch(e) { idb = null; idbSettle('failed'); }
}
openIDB();
function saveToIDB(obj) {
    if (!idb) return;
    try {
        var tx = idb.transaction('saves', 'readwrite');
        var st = tx.objectStore('saves');
        var cards = obj && obj.forged && obj.forged.length;
        if (cards || typeof st.get !== 'function') {
            st.put({ id: 'latest', data: obj, ts: Date.now() });
            window._lastIDBSaveAt = Date.now();
            return;
        }
        // Пустой снапшот (закрыли приложение до ответа на диалог восстановления) не вправе затирать
        // резерв с карточками — иначе IndexedDB умирает ровно в сценарии, ради которого существует (R2 M3).
        var g = st.get('latest');
        g.onsuccess = function() {
            var cur = g.result;
            var had = cur && cur.data && cur.data.forged && cur.data.forged.length;
            if (had) return;
            st.put({ id: 'latest', data: obj, ts: Date.now() });
            window._lastIDBSaveAt = Date.now();
        };
    } catch(e) {}
}
function clearIDBSave(done) { // явное удаление (последняя карточка, полный вайп) — единственный законный способ очистить резерв
    var fin = false;
    function finish() { if (fin) return; fin = true; if (typeof done === 'function') done(); }
    if (!idb) { finish(); return; }
    try {
        var tx = idb.transaction('saves', 'readwrite');
        tx.objectStore('saves').delete('latest');
        tx.oncomplete = finish; tx.onerror = finish; tx.onabort = finish;
        setTimeout(finish, 1500);
    } catch(e) { finish(); }
}
function loadFromIDB(callback) {
    whenIDB(function() {
        if (!idb) { callback(null); return; }
        try {
            var tx = idb.transaction('saves', 'readonly');
            var req = tx.objectStore('saves').get('latest');
            req.onsuccess = function(e) { callback(e.target.result ? e.target.result : null); };
            req.onerror = function() { callback(null); };
        } catch(e) { callback(null); }
    });
}
const EVER_SAVED_KEY = 'neurodeck_ever_saved';
const GEN_KEY = 'neurodeck_gen';
var stateGen = 0;   // поколение состояния: растёт при каждом сохранении этой вкладки
var localEpoch = 0; // страж гонок: инкремент при каждом локальном сохранении; отложенные async-применения с чужим epoch отбрасываются
function hasEverSaved() {
    try { return localStorage.getItem(EVER_SAVED_KEY) === '1'; } catch(e) { return false; }
}
function ndSyncHaptic() { // волна 2: тактильное подтверждение успешной синхронизации
    try { if (typeof haptic === 'function') haptic('success'); } catch(e) {}
}
function ndClosingGuard(on) { // волна 2: на время облачного пуша TG спрашивает подтверждение закрытия
    try {
        var tg = window.Telegram && window.Telegram.WebApp;
        if (!tg) return;
        if (on && tg.enableClosingConfirmation) tg.enableClosingConfirmation();
        else if (!on && tg.disableClosingConfirmation) tg.disableClosingConfirmation();
    } catch(e) {}
}
// Фаза 0 «Trust»: диагностические события (js/telemetry.js). typeof-гварды обязательны:
// тестовые харнессы вытаскивают функции storage.js поодиночке, где NDTelemetry/ndTel не определены.
function ndTel(name, data) {
    try { if (typeof NDTelemetry !== 'undefined' && NDTelemetry && typeof NDTelemetry.event === 'function') NDTelemetry.event(name, data); } catch(e) {}
}
function ndTelErr(code, message, detail) {
    try { if (typeof NDTelemetry !== 'undefined' && NDTelemetry && typeof NDTelemetry.error === 'function') NDTelemetry.error(code, message, detail); } catch(e) {}
}
// Канонический отпечаток снапшота: 2×FNV-1a 32-bit → 64-bit hex. Детерминирован между
// устройствами (charCodeAt по UTF-16). Вызывается typeof-гвардом из pushCloudChunks /
// loadCloudChunks / saveToCloud (в вырезанных тестовых харнессах функции нет — проверка
// мягко пропускается). Держать синхронно с ожиданием в tests/cloud-envelope.test.js.
function ndSnapshotChecksum(s) {
    var a = 0x811c9dc5, b = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
        var ch = s.charCodeAt(i);
        a = Math.imul(a ^ ch, 16777619) >>> 0;
        b = Math.imul(b ^ (ch + i), 16777619) >>> 0;
    }
    return ('0000000' + a.toString(16)).slice(-8) + ('0000000' + b.toString(16)).slice(-8);
}
const SCHEMA_VERSION = 14;
var strongholds = null, army = null, siege = null;
function strongholdCatalog() {
    return (typeof globalThis !== 'undefined' && globalThis.StrongholdData) || null;
}
function ensureStrongholdState() {
    if (!Array.isArray(strongholds)) strongholds = STATE_GUARDS.sanitizeStrongholds(null, strongholdCatalog());
    if (!army || typeof army !== 'object') army = STATE_GUARDS.sanitizeArmy(null);
    if (!siege || typeof siege !== 'object') siege = STATE_GUARDS.sanitizeSiege(null);
}
const MIGRATIONS = {};
MIGRATIONS[7] = function(data) {
    try {
        if (!data || typeof data !== 'object') return;
        if (data.hero && typeof data.hero === 'object') {
            var h = data.hero;
            if (typeof h.gold !== 'number' || !Number.isFinite(h.gold)) {
                h.gold = Math.max(0, Math.round((Number(h.shards) || 0) * 2 + 30));
            }
            delete h.shards; delete h.flasks;
            delete h.hp; delete h.maxHp; delete h.isHollow;
            delete h.actionPoints; delete h.estus; delete h.estusUsedToday; delete h.lastEstusReset;
        }
        delete data.bossHp; delete data.bossStage; delete data.bossDefeated;
        delete data.bossRunLocked; delete data.bossKills; delete data.bossRagePoints;
        if (!Array.isArray(data.tasks)) data.tasks = [];
        if (!data.tractState || typeof data.tractState !== 'object') data.tractState = { regions: 0, building: null };
        if (typeof data.taskIdCounter !== 'number' || !Number.isFinite(data.taskIdCounter)) data.taskIdCounter = 1;
    } catch(e) {}
};
// v7→v8 (SPEC §9, ADR §10): tractState.regions N → strongholds: первые N (0..N-1) captured; золото/карточки/задачи не трогаем.
MIGRATIONS[8] = function(data) {
    try {
        if (!data || typeof data !== 'object') return;
        var cat = strongholdCatalog();
        var regions = 0;
        if (data.tractState && typeof data.tractState === 'object' && Number.isFinite(Number(data.tractState.regions))) {
            regions = Math.max(0, Math.min(10, Math.round(Number(data.tractState.regions)))); // guard: вне 0..10 → clamp
        }
        var ids = (cat && Array.isArray(cat.STRONGHOLDS)) ? cat.STRONGHOLDS.map(function(s) { return s && s.id; }) : [];
        var strongholdsArr = [];
        for (var i = 0; i < 20; i++) {
            strongholdsArr.push({
                id: ids[i] || ('sh' + String(i + 1).padStart(2, '0')),
                captured: i < regions,
                garrison: [],
                buildings: {},
                corruption: { stage: 'ok', debtDays: 0 }
            });
        }
        data.strongholds = strongholdsArr;
        var units = {};
        ['t1', 't2', 't3', 't4', 't5', 't6', 't7'].forEach(function(t) { units[t] = 0; });
        data.army = { units: units, week: 0 };
        data.siege = { week: 1, lastResult: null };
    } catch(e) {}
};
// v8→v9 (B3 сезоны): season {num, start, snapshot}; мигранты получают Сезон 1 со снапшотом текущего прогресса.
MIGRATIONS[9] = function(data) {
    try {
        if (!data || typeof data !== 'object') return;
        if (data.season && typeof data.season === 'object' && data.season.num) return;
        var today = (typeof getMSKDayKey === 'function') ? getMSKDayKey() : new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); // МСК-день даже без app.js
        var captured = 0;
        if (Array.isArray(data.strongholds)) data.strongholds.forEach(function(s) { if (s && s.captured) captured++; });
        var completions = 0;
        if (Array.isArray(data.forged)) data.forged.forEach(function(c) { completions += (c && c.totalCompletions) || 0; });
        data.season = {
            num: 1,
            start: today,
            snapshot: {
                totalXp: (data.hero && Number.isFinite(data.hero.totalXp)) ? data.hero.totalXp : 0,
                gold: (data.hero && Number.isFinite(data.hero.gold)) ? data.hero.gold : 0,
                captured: captured,
                completions: completions,
                level: (data.hero && Number.isFinite(data.hero.level)) ? data.hero.level : 1
            }
        };
    } catch(e) {}
};
// v9→v10 (эндгейм): трон Вечного трона (throne 0..5) + копилки венцов сезонов в season.crownBonus
MIGRATIONS[10] = function(data) {
    try {
        if (!data || typeof data !== 'object') return;
        if (typeof data.throne !== 'number' || !Number.isFinite(data.throne)) data.throne = 0;
        data.throne = Math.max(0, Math.min(5, Math.round(data.throne)));
        if (data.season && typeof data.season === 'object') {
            if (typeof data.season.crownBonus !== 'number' || !Number.isFinite(data.season.crownBonus)) data.season.crownBonus = 0;
            data.season.crownBonus = Math.max(0, Math.min(5, Math.round(data.season.crownBonus)));
        }
    } catch(e) {}
};
// v10→v11 (C5): санитизация технологий Г5-Т/Т2/Т3 — своя ступень миграции, а не довесок к v10:
// битый v не реплеит её как часть v10, а новые тех-поля получают явный дом.
MIGRATIONS[11] = function(data) {
    try {
        if (!data || typeof data !== 'object') return;
        if (data.TECHS && typeof data.TECHS === 'object' && !Array.isArray(data.TECHS)) {
          var _ct;
          if (data.TECHS.owned && typeof data.TECHS.owned === 'object') { // Г5-Т3 схема {owned, lvl}
            _ct = { owned: {}, lvl: {} };
            Object.keys(data.TECHS.owned).slice(0, 21).forEach(function(k) { if (data.TECHS.owned[k] === true) _ct.owned[k] = true; });
            if (data.TECHS.lvl && typeof data.TECHS.lvl === 'object') Object.keys(data.TECHS.lvl).slice(0, 21).forEach(function(k) { var v = Math.round(Number(data.TECHS.lvl[k])); if (v >= 1 && v <= 5) _ct.lvl[k] = v; });
          } else { // Г5-Т/Г5-Т2 легаси: плоская карта → owned
            _ct = { owned: {}, lvl: {} };
            Object.keys(data.TECHS).slice(0, 21).forEach(function(k) { if (data.TECHS[k] === true) _ct.owned[k] = true; });
          }
          data.TECHS = _ct;
        }
        if (typeof data.TECH_PTS !== 'number' || !Number.isFinite(data.TECH_PTS)) data.TECH_PTS = 0;
        data.TECH_PTS = Math.max(0, Math.min(999, Math.round(data.TECH_PTS))); // Г5-Т
        if (typeof data.TECH_IDEA !== 'undefined' && data.TECH_IDEA !== null && (typeof data.TECH_IDEA !== 'string' || ['idea_might', 'idea_wealth', 'idea_order'].indexOf(data.TECH_IDEA) < 0)) data.TECH_IDEA = null; // Г5-Т2
        if (data.TECH_ACTIVES && typeof data.TECH_ACTIVES === 'object' && !Array.isArray(data.TECH_ACTIVES)) { var _ca = {}; Object.keys(data.TECH_ACTIVES).slice(0, 4).forEach(function(k) { if (typeof data.TECH_ACTIVES[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.TECH_ACTIVES[k])) _ca[k] = data.TECH_ACTIVES[k]; }); data.TECH_ACTIVES = _ca; } // Г5-Т3 Ф2
    } catch(e) {}
};
// v11→v12 (Campaign 2.0 C4): осадные ресурсы — счётчики siege.rams / siege.ladders (дефолт 0).
// Подход недели («Штурм/Осада/Хитрость») на момент v12 в сейве НЕ хранился: выбор в UI
// применялся в тике и жил только сессию (с v14 — хранится, см. MIGRATIONS[14]).
MIGRATIONS[12] = function(data) {
    try {
        if (!data || typeof data !== 'object') return;
        if (!data.siege || typeof data.siege !== 'object' || Array.isArray(data.siege)) data.siege = { week: 1, lastResult: null };
        ['rams', 'ladders'].forEach(function(k) {
            var n = Math.round(Number(data.siege[k]));
            data.siege[k] = (isFinite(n) && n > 0) ? Math.min(999, n) : 0;
        });
    } catch(e) {}
};
// v12→v13 (Campaign 2.0 C5): босс-арки — поля HERO.bosses:
//   introSeen [] — номера боссов с показанным лор-вступлением;
//   rewardChoice {} — num → 'artifact'|'crown'|'ruin' (отсутствие записи = легаси-артефакт);
//   pendingReward null — босс, ждущий выбора награды в модалке итогов.
MIGRATIONS[13] = function(data) {
    try {
        if (!data || typeof data !== 'object') return;
        var bs = (data.hero && typeof data.hero === 'object' && data.hero.bosses && typeof data.hero.bosses === 'object' && !Array.isArray(data.hero.bosses)) ? data.hero.bosses : null;
        if (!bs) return; // боссов не было — ensureBossesState в app.js даст дефолты лениво
        if (!Array.isArray(bs.introSeen)) bs.introSeen = [];
        bs.introSeen = bs.introSeen.filter(function(n) { return Number.isInteger(n) && n >= 1 && n <= 11; })
            .filter(function(n, i, a) { return a.indexOf(n) === i; });
        if (!bs.rewardChoice || typeof bs.rewardChoice !== 'object' || Array.isArray(bs.rewardChoice)) bs.rewardChoice = {};
        Object.keys(bs.rewardChoice).slice(0, 11).forEach(function(k) {
            if (!/^\d+$/.test(k) || +k < 1 || +k > 11 || ['artifact', 'crown', 'ruin'].indexOf(bs.rewardChoice[k]) === -1) delete bs.rewardChoice[k];
        });
        if (!Number.isInteger(bs.pendingReward) || bs.pendingReward < 1 || bs.pendingReward > 11) bs.pendingReward = null;
    } catch(e) {}
};
// v13→v14 (P11): персистентный подход недели — siege.approach ('assault'|'siege'|'trick',
// дефолт 'assault'). До v14 выбор жил только в сессии и терялся на перезагрузке; теперь
// UI уважает сохранённый выбор, но по-прежнему сгорает вместе с неделей — app.js сбрасывает
// в 'assault' после воскресного тика, поэтому «Осада»/«Хитрость» не множат неделю вечность.
MIGRATIONS[14] = function(data) {
    try {
        if (!data || typeof data !== 'object') return;
        if (!data.siege || typeof data.siege !== 'object' || Array.isArray(data.siege)) data.siege = { week: 1, lastResult: null };
        if (['assault', 'siege', 'trick'].indexOf(data.siege.approach) === -1) data.siege.approach = 'assault';
    } catch(e) {}
};
function migrateSyncData(data) {
    // QA3-H1: битый/отсутствующий v (строка/0/NaN) больше не реплеит миграции
    // вниз как v4: MIGRATIONS[8] пересобирал strongholds с нуля и терял
    // захваты/гарнизоны (вплоть до 20/20), MIGRATIONS[9] сносил season.
    // Нет валидного числа → считаем сейв текущей схемы; признаки v10
    // (strongholds/season/throne) тем более исключают откат.
    var v = (typeof data.v === 'number' && Number.isFinite(data.v) && data.v > 0) ? data.v : SCHEMA_VERSION;
    var v0 = v;
    while (v < SCHEMA_VERSION) {
        v++;
        if (typeof MIGRATIONS[v] === 'function') MIGRATIONS[v](data);
    }
    if (v0 < SCHEMA_VERSION && typeof ndTel === 'function') ndTel('migration_applied', { from: v0, to: SCHEMA_VERSION });
    data.v = SCHEMA_VERSION;
    return data;
}
const HERO_KEYS = Object.assign(Object.create(null), {
    name: true, title: true, level: true, xp: true, xpToNext: true, totalXp: true,
    gold: true, consecutivePerfectDays: true,
    dailyCompletions: true, dailySkips: true, lastSessionAt: true,
    dailyUniqueStats: true, cardHistory: true, lastWeeklyReport: true
});
function mskDayKey(ts) {
    var d = new Date((ts || Date.now()) + 3 * 3600000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
function pruneAgedHistory(hero, keepDays) {
    try {
        if (!hero || typeof hero !== 'object') return;
        var cutoffKey = mskDayKey(Date.now() - keepDays * 86400000);
        ['cardHistory', 'dailyUniqueStats'].forEach(function(field) {
            var map = hero[field];
            if (!map || typeof map !== 'object') return;
            Object.keys(map).forEach(function(key) {
                if (/^\d{4}-\d{2}-\d{2}$/.test(key) && key < cutoffKey) delete map[key];
            });
        });
    } catch(e) {}
}
function maxExistingId(arr) {
    var m = 0;
    (Array.isArray(arr) ? arr : []).forEach(function(item) {
        var n = Number(item && item.id);
        if (Number.isFinite(n) && n > m) m = n;
    });
    return m;
}
function safeTs(v, fallback) { // T2-M3: битые даты (NaN/строки/1e300) → null, иначе призраки зависают навсегда
    var n = Number(v);
    return (Number.isFinite(n) && n > 0 && n < 8.64e15) ? Math.round(n) : (fallback === undefined ? null : fallback);
}
function saveGameState() {
try {
// Мульти-вкладка (LWW-гвард): если другая вкладка сохранила свежее поколение —
// принимаем её состояние (adopt) перед сборкой своего снапшота, а не перетираем вслепую.
var remoteGen = 0;
try { remoteGen = parseInt(localStorage.getItem(GEN_KEY), 10) || 0; } catch(e) {}
if (remoteGen > stateGen && typeof applySyncData === 'function') {
try {
var theirs = JSON.parse(localStorage.getItem('neurodeck_full_save') || 'null');
if (theirs && typeof theirs.v === 'number') {
applySyncData(theirs, true);
showToast('🔄 Синхронизировано между вкладками', 'Принято состояние из другой вкладки', 'save');
}
} catch(e) {}
stateGen = remoteGen;
}
stateGen++; // живой LWW-гвард: поколение растёт при каждом сохранении (T1-H2)
localEpoch++;
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
v: SCHEMA_VERSION, gen: stateGen, hero: HERO, stats: STATS, forged: FORGED, goals: GOALS, inventory: INVENTORY,
lastDayReset,
forgedIdCounter, uidCounter, goalIdCounter, xpHistory, bloodOath, lastWeekReset,
tasks: TASKS, taskIdCounter, hirePool, savedAt: Date.now()
};
// P19 (State Store 2.0, шаг 2): снапшот доменов strongholds/army/siege собирается ИЗ СТОРА
// (NDStore.snapshot() — живые ссылки, поля схемы v14 без изменений, сейв байт-в-байт тот же);
// typeof-гвард — стор может быть не привязан (unit-харнессы storage.js без app.js) или ещё не
// загружен (storage.js в index.html стоит раньше js/state/store.js — сейв в рантайме, не в парсе).
try { var _ndSnap = null; try { _ndSnap = (typeof NDStore !== 'undefined' && NDStore && typeof NDStore.snapshot === 'function' && typeof NDStore.ready === 'function' && NDStore.ready() === true) ? NDStore.snapshot() : null; } catch (e2) {}
ensureStrongholdState();
snapshot.strongholds = (_ndSnap && _ndSnap.strongholds) ? _ndSnap.strongholds : strongholds;
snapshot.army = (_ndSnap && _ndSnap.army) ? _ndSnap.army : army;
snapshot.siege = (_ndSnap && _ndSnap.siege) ? _ndSnap.siege : siege; snapshot.dailyQuests = dailyQuests; snapshot.dailyEvent = (typeof dailyEvent !== 'undefined') ? dailyEvent : null; snapshot.season = (typeof season !== 'undefined') ? season : null; snapshot.throne = (typeof throne !== 'undefined') ? throne : 0; snapshot.TECHS = (typeof TECHS !== 'undefined') ? TECHS : {}; snapshot.TECH_PTS = (typeof TECH_PTS !== 'undefined') ? TECH_PTS : 0; snapshot.TECH_IDEA = (typeof TECH_IDEA !== 'undefined') ? TECH_IDEA : null; snapshot.TECH_ACTIVES = (typeof TECH_ACTIVES !== 'undefined') ? TECH_ACTIVES : {}; } catch(e) {}
try { var _c3s = (typeof NDC3 !== 'undefined' && NDC3 && typeof NDC3.serialize === 'function') ? NDC3.serialize() : undefined; if (_c3s) snapshot.c3 = _c3s; } catch(e) {} // кампания 3.0
pruneAgedHistory(HERO, 120);
var json = JSON.stringify(snapshot);
if (FORGED.length > 0) { try { localStorage.setItem(EVER_SAVED_KEY, '1'); } catch(e) {} } // ever_saved = «игрок с карточками»: пустой сейв не должен блокировать старт-колоду (O-10)
try { localStorage.setItem('neurodeck_backup', json); } catch(e) {}
if (FORGED.length > 0) {
try { localStorage.setItem('neurodeck_cards_backup', json); } catch(e) {}
}
try { localStorage.setItem(GEN_KEY, String(stateGen)); } catch(e) {}
saveToIDB(snapshot); // IDB/cloud/backup до full_save: квота localStorage не должна обрывать цепочку бэкапов (T5-M1)
saveGoals();
try { autoCloudSave(json); } catch(e) {}
localStorage.setItem('neurodeck_full_save', json);
if (typeof ndTel === 'function') ndTel('save_ok', { gen: stateGen, sz: json.length });
} catch (e) {
console.warn('Save failed:', e);
if (typeof ndTelErr === 'function') ndTelErr('STORAGE_WRITE_FAILED', String(e), { gen: stateGen });
showToast('⚠ Ошибка сохранения', 'Хранилище переполнено — экспортируйте данные!', 'blood');
}
}
var _pushInFlight = false;
function autoCloudSave(json, force, bypassConflictCheck) {
    var cs = getCloudStorage();
    if (!cs) return;
    if (FORGED.length === 0) return;
    if (_pushInFlight) {
        // форс-пуш (pagehide/ручной) во время летящего пуша: ставим в очередь,
        // а не роняем — и не допускаем два параллельных пуша (перепутанные чанки)
        if (force) window._pendingCloudForce = { json: json, bypass: !!bypassConflictCheck };
        return;
    }
    if (!force && Date.now() - (window._lastCloudSave || 0) < 30000) return;
    window._lastCloudSave = Date.now();
    var savedAt = 0;
    try { savedAt = JSON.parse(json).savedAt || 0; } catch(e) {}
    cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
        if ((!force || !bypassConflictCheck) && !err && metaStr) {
            try {
                var meta = JSON.parse(metaStr);
                var _div = (typeof ndCloudDiverged === 'function') && ndCloudDiverged(meta); // P0 1.2: облако менял не этот девайс — не затираем, спрашиваем
                if (meta && (meta.t > savedAt + 10000 || _div)) {
                    if (_div && !window._cloudDialogOpen && typeof smartCloudSync === 'function' && Date.now() - (window._lastReconcileTry || 0) >= 20000) setTimeout(smartCloudSync, 0);
                    if (force) { updateSyncBadge('offline'); return; }
                    if (!window._cloudNewerToastShown) {
                        window._cloudNewerToastShown = true;
                        if (typeof ndTel === 'function') ndTel('cloud_push_deferred', { cloudT: meta.t, savedAt: savedAt });
                        showToast('☁ Синхронизация', 'Облако новее — синхронизация отложена');
                    }
                    return;
                }
            } catch(e) {}
        }
        if (_pushInFlight) {
            if (force) window._pendingCloudForce = { json: json, bypass: !!bypassConflictCheck };
            return;
        }
        _pushInFlight = true;
        pushCloudChunks(cs, json, function() {
            _pushInFlight = false;
            var pending = window._pendingCloudForce;
            if (pending) { window._pendingCloudForce = null; autoCloudSave(pending.json, true, pending.bypass); }
        });
    });
}
function pushCloudChunks(cs, json, onDone) {
    var settled = false;
    var pushOk = false;
    var t0 = Date.now();
    ndClosingGuard(true); // пуш в облаке — не даём свайп-закрытию оборвать его молча
    var hangTimer = setTimeout(function() { settle(); }, 15000);
    function settle() {
        if (settled) return;
        settled = true;
        ndClosingGuard(false);
        clearTimeout(hangTimer);
        if (!pushOk && typeof ndTel === 'function') ndTel('cloud_push_interrupted', { ms: Date.now() - t0 }); // meta не перезаписан — старое поколение живо
        if (typeof onDone === 'function') onDone();
    }
    try {
        var savedAt = Date.now(); // метка времени снапшота, а не завершения пуша:
        try { savedAt = JSON.parse(json).savedAt || savedAt; } catch(e) {} // иначе поздний старый пуш выглядит «новее» локального удаления (анти-воскрешение)
        var chunks = [];
        for (var i = 0; i < json.length; i += CLOUD_MAX_CHUNK) { chunks.push(json.slice(i, i + CLOUD_MAX_CHUNK));
        { if (chunks.length >= 200) { updateSyncBadge('offline'); if (typeof showToast === 'function') showToast('⚠ Слишком много данных', 'Сейв не помещается в облако — используйте файл', 'blood'); settle(); return; } } }
        // Envelope v2 («Trust»): чанки пишутся первыми, nd_meta — ПОСЛЕДНИМ как commit-pointer
        // с отпечатком c, id поколения и размером. Обрыв прошлого пуша, поверх старых данных,
        // больше не читается как валидный сейв — контрольная сумма его отсекает.
        var saveId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var checksum = (typeof ndSnapshotChecksum === 'function') ? ndSnapshotChecksum(json) : '';
        if (typeof ndTel === 'function') ndTel('cloud_push_started', { n: chunks.length, sz: json.length });
        var doneCount = 0;
        var aborted = false;
        function failChunk(err) {
            if (aborted) return;
            aborted = true;
            updateSyncBadge('offline');
            if (typeof showToast === 'function') showToast('⚠ Ошибка облака', 'Часть данных не сохранена: ' + String(err), 'blood');
            if (typeof ndTelErr === 'function') ndTelErr('CLOUD_PUSH_FAILED', String(err), { n: chunks.length });
            settle();
        }
        chunks.forEach(function(chunk, idx) {
            cs.setItem(CLOUD_DATA_PREFIX + idx, chunk, function(err) {
                doneCount++;
                if (err) { failChunk(err); return; }
                if (!aborted && doneCount === chunks.length) {
                    if (typeof ndCloudBaseSet === 'function') ndCloudBaseSet(null, saveId); // P0 1.2: meta мог записаться, а колбэк не дойти — id «в полёте» тоже наш
                    cs.setItem(CLOUD_META_KEY, JSON.stringify({n: chunks.length, t: savedAt, c: checksum, id: saveId, sz: json.length}), function(err2) {
                        if (err2 || aborted) { updateSyncBadge('offline'); settle(); return; }
                        pushOk = true;
                        if (typeof ndCloudBaseSet === 'function') ndCloudBaseSet({ id: saveId, t: savedAt });
                        clearSurplusChunks(chunks.length);
                        updateSyncBadge('synced');
                        if (typeof ndTel === 'function') ndTel('cloud_push_ok', { n: chunks.length, ms: Date.now() - t0 });
                        settle();
                    });
                }
            });
        });
    } catch(e) { if (typeof ndTelErr === 'function') ndTelErr('CLOUD_PUSH_FAILED', String(e), {}); settle(); }
}
function forceCloudSave(bypassConflictCheck) {
    var cs = getCloudStorage();
    if (!cs) return;
    if (FORGED.length === 0) return;
    window._lastCloudSave = 0;
    var json = JSON.stringify(buildSyncData());
    autoCloudSave(json, true, !!bypassConflictCheck);
}
function smartCloudSync() {
    var cs = getCloudStorage();
    if (!cs) return;
    if (FORGED.length === 0) return; // пустое устройство обслуживает tryCloudRecovery — без второго диалога поверх
    if (window._cloudDialogOpen) return; // игрока уже спрашивают
    if (Date.now() - (window._lastReconcileTry || 0) < 20000) return; // boot-таймер и запрос из autoCloudSave не плодят дубли
    window._lastReconcileTry = Date.now();
    var myEpoch = localEpoch; // страж гонки: локальные изменения во время полёта делают ответ устаревшим
    cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
        if (err || !metaStr) return;
        var meta;
        try { meta = JSON.parse(metaStr); } catch(e) { return; }
        var cloudTime = (meta && meta.t) || 0;
        if (!(cloudTime > 0)) return;
        // P0 аудита (1.2): конфликт определяет «база» (кто писал облако последним), а не savedAt: загрузочный
        // ресейв каждый раз штампует локальный сейв «сейчас» — устаревшее устройство выглядело новее облака и затирало его.
        var diverged = (typeof ndCloudDiverged === 'function') && ndCloudDiverged(meta);
        if (!diverged && typeof localEpoch !== 'undefined' && localEpoch !== myEpoch) return;
        var localTime = 0;
        var localRaw = localStorage.getItem('neurodeck_full_save') || localStorage.getItem('neurodeck_backup');
        if (localRaw) { try { localTime = JSON.parse(localRaw).savedAt || 0; } catch(e) {} }
        if (!diverged) {
            if (localTime > cloudTime + 5000) { if (typeof ndTel === 'function') ndTel('sync_local_newer_push', { cloudT: cloudTime, localT: localTime }); forceCloudSave(true); return; }
            if (!(cloudTime > localTime + 10000)) return;
        }
        loadCloudChunks(meta, function(chunkErr, data) {
            if (chunkErr || !data) { updateSyncBadge('offline'); return; }
            if (!diverged && typeof localEpoch !== 'undefined' && localEpoch !== myEpoch) return; // пока летали — локально изменилось
            var cloudDate = new Date(cloudTime).toLocaleString('ru');
            var localDate = localTime ? new Date(localTime).toLocaleString('ru') : 'нет данных';
            if (typeof dungeonConfirm === 'function') {
                var dialogEpoch = localEpoch;
                var cloudInfo = '', localInfo = '';
                if (diverged) { // только числа: тело диалога идёт в innerHTML
                    cloudInfo = ' · ур. ' + (Math.round(Number(data.hero && data.hero.level)) || '?') + ' · карточек ' + ((data.forged && data.forged.length) || 0);
                    localInfo = ' · ур. ' + (Math.round(Number(HERO.level)) || '?') + ' · карточек ' + FORGED.length;
                }
                window._cloudDialogOpen = true;
                dungeonConfirm(diverged ? '☁ Облако изменилось' : '☁ Найдено обновление',
                    (diverged ? 'В облаке другой прогресс (с другого устройства или после долгого перерыва):<br>' : 'Облако новее, чем это устройство:<br>') +
                    '<b>Облако:</b> ' + cloudDate + cloudInfo + '<br>' +
                    '<b>Локально:</b> ' + localDate + localInfo + '<br><br>' +
                    (diverged ? '<span style="color:var(--gold-bright)">Что оставить? «Моё» — перезапишет облако.</span>' : '<span style="color:var(--gold-bright)">Загрузить актуальный прогресс?</span>'),
                    diverged ? '☁ Взять облако' : undefined, diverged ? 'Оставить моё' : undefined
                ).then(function(ok) {
                    window._cloudDialogOpen = false;
                    if (!diverged && typeof localEpoch !== 'undefined' && localEpoch !== dialogEpoch) {
                        // пока думали — локально изменилось: чужие (облачные) данные не накладываем
                        forceCloudSave(true);
                        showToast('☁ Облако устарело', 'Локальные изменения сохранены и отправлены', 'save');
                        return;
                    }
                    if (ok) {
                        ndSnapshotBeforeImport();
                        applySyncData(data);
                        if (typeof ndCloudBaseSet === 'function') ndCloudBaseSet(meta); // база = эта версия облака, иначе saveGameState снова решит, что облако чужое
                        saveGameState();
                        ndSyncHaptic();
                        showToast('☁ Синхронизировано', 'Загружено из облака: ' + cloudDate);
                        spiritSay('«Облако поделилось воспоминаниями...»');
                        screenShake(6, 400);
                        ndOfferUndoImport('Загрузка облака');
                    } else {
                        forceCloudSave(true);
                        showToast('☁ Отправлено в облако', 'Локальные данные актуальнее');
                    }
                });
            } else {
                if (!diverged && typeof localEpoch !== 'undefined' && localEpoch !== myEpoch) return;
                applySyncData(data);
                if (typeof ndCloudBaseSet === 'function') ndCloudBaseSet(meta);
                saveGameState();
                ndSyncHaptic();
                showToast('☁ Синхронизировано', 'Загружено из облака: ' + cloudDate);
            }
        }, 15000);
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
window.__ndBootSavedAt = Number(data && data.savedAt) || 0; // P0 1.2: savedAt последнего сохранения ДО загрузочного ресейва — опора легаси-правила конфликта
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
} catch (e) { console.warn('Load failed:', e); if (typeof ndTelErr === 'function') ndTelErr('LOAD_FAILED', String(e), {}); }
var emergFinal = null;
try { emergFinal = localStorage.getItem('neurodeck_cards_backup'); } catch(e) {}
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
window.__ndIdbCheckPending = true; // boot придерживает старт-колоду, пока идёт проверка IndexedDB (R2 M3)
loadFromIDB(function(result) {
    if (!(result && result.data && result.data.forged && result.data.forged.length > 0 && FORGED.length === 0)) { window.__ndIdbCheckPending = false; return; }
    window.__ndRecoveryOpen = true;
    window.__ndIdbCheckPending = false;
    dungeonConfirm('♻ Найдено в IndexedDB',
        'Обнаружено сохранение с <b>' + result.data.forged.length + '</b> карточками.<br>' +
        'Дата: ' + new Date(result.ts).toLocaleString('ru') + '<br><br>' +
        '<span style="color:var(--gold-bright)">Восстановить?</span>'
    ).then(function(ok) {
        window.__ndRecoveryOpen = false;
        if (ok) {
            applySyncData(result.data);
            saveGameState();
            if (typeof checkCapturedRecovery === 'function') checkCapturedRecovery(); // #49: recovery-экран твердынь
            showToast('♻ Восстановлено', result.data.forged.length + ' карточек из IndexedDB');
            screenShake(6, 400);
        }
    });
});
}
function tryCloudRecovery() {
// Пустая колода — это не только новый игрок: после ITP-чистки iOS (7 дней) localStorage
// пустеет целиком вместе с флагом «когда-либо сохранялся», а облако живо. Раньше этот
// случай молча отключал восстановление — прогресс терялся. Теперь: предлагаем восстановление
// всегда, когда колода пуста, а в облаке есть карточки; отказ запоминаем по метке сейва.
if (FORGED.length > 0) return;
var cs = getCloudStorage();
if (!cs) return;
window.__ndCloudCheckPending = true; // boot придерживает старт-колоду, пока идёт проверка
var pendingDone = function() { window.__ndCloudCheckPending = false; };
var failSafe = setTimeout(pendingDone, 5000); // облако молчит — не блокируем онбординг дольше 5 c
cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
if (err || !metaStr) { clearTimeout(failSafe); pendingDone(); return; }
var meta;
try { meta = JSON.parse(metaStr); } catch(e) { clearTimeout(failSafe); pendingDone(); return; }
var cloudT = (meta && meta.t) || 0;
if (!(cloudT > 0)) { clearTimeout(failSafe); pendingDone(); return; }
try { if (localStorage.getItem('neurodeck_cloud_declined_t') === String(cloudT)) { clearTimeout(failSafe); pendingDone(); return; } } catch(e) {} // от этого сейва уже отказывались
clearTimeout(failSafe); // P0 1.3: облако ответило и в нём есть сейв — старт-колоду держим до конца загрузки (loadCloudChunks сам ограничен 15 c) и до ответа на диалог
loadCloudChunks(meta, function(chunkErr, data) {
pendingDone();
if (chunkErr || !data) return;
var cardCount = (data.forged && data.forged.length) || 0;
if (cardCount === 0) return; // пустое облако не должно блокировать старт-колоду (O-10)
if (typeof ndTel === 'function') ndTel('recovery_offered', { cards: cardCount, t: cloudT });
var savedDate = new Date(cloudT).toLocaleString('ru');
window.__ndRecoveryOpen = true; // P0 1.3: старт-колода не показывается поверх диалога восстановления
dungeonConfirm('☁ Найдено облачное сохранение!', 'Данные от <b>' + savedDate + '</b>.<br>Герой: <b>ур.' + (Math.round(Number(data.hero && data.hero.level)) || '?') + '</b>, карточек: <b>' + cardCount + '</b>.<br><br><span style="color:var(--gold-bright)">Восстановить?</span>').then(function(ok) {
window.__ndRecoveryOpen = false;
if (!ok) { if (typeof ndTel === 'function') ndTel('recovery_declined', { t: cloudT }); try { localStorage.setItem('neurodeck_cloud_declined_t', String(cloudT)); } catch(e) {} return; }
if (typeof ndTel === 'function') ndTel('recovery_accepted', { cards: cardCount, t: cloudT });
applySyncData(data, true);
if (typeof ndCloudBaseSet === 'function') ndCloudBaseSet(meta);
saveGameState();
if (typeof checkCapturedRecovery === 'function') checkCapturedRecovery(); // #49: recovery-экран твердынь
ndSyncHaptic();
showToast('☁ Прогресс восстановлен!', 'Из облака: ' + savedDate);
spiritSay('«Облако сохранило твой путь...»');
screenShake(6, 400);
location.reload();
});
}, 15000);
});
}
function deepRecovery() {
// Ручная кнопка «♻ Восстановить» — явное намерение игрока: сканируем все слои
// независимо от флага ever_saved (тот может быть стёрт ITP-чисткой iOS).
var found = [];
var bestData = null;
var bestTs = 0;
var bestCount = 0;
function consider(data, ts, label) {
    var count = (data.forged && data.forged.length) || (data.goals && data.goals.length) || 0;
    if (count <= 0) return;
    found.push(label);
    if (ts > bestTs || !bestData) { bestTs = ts; bestData = data; bestCount = count; }
}
var keys = ['neurodeck_full_save', 'neurodeck_backup', 'neurodeck_cards_backup', 'neurodeck_goals'];
keys.forEach(function(key) {
try {
var raw = localStorage.getItem(key);
if (!raw) return;
var data = JSON.parse(raw);
consider(data, data.savedAt || data.t || 0, key + ': ' + (((data.forged && data.forged.length) || (data.goals && data.goals.length)) || 0) + ' элем.');
} catch(e) {}
});
loadFromIDB(function(idbResult) {
if (idbResult && idbResult.data) {
var idbData = idbResult.data;
var idbCount = (idbData.forged && idbData.forged.length) || 0;
if (idbCount > 0) {
consider(idbData, idbResult.ts || 0, 'IndexedDB: ' + idbCount + ' карточек (от ' + new Date(idbResult.ts).toLocaleString('ru') + ')');
}
}
var cs = getCloudStorage();
if (!cs) { finishDeepRecovery(found, bestData, bestCount); return; }
cs.getItem(CLOUD_META_KEY, function(err, metaStr) {
if (err || !metaStr) { finishDeepRecovery(found, bestData, bestCount); return; }
var meta;
try { meta = JSON.parse(metaStr); } catch(e) { finishDeepRecovery(found, bestData, bestCount); return; }
loadCloudChunks(meta, function(chunkErr, data) {
if (!chunkErr && data) {
consider(data, (meta && meta.t) || 0, 'Облако: ' + ((data.forged && data.forged.length) || 0) + ' карточек (от ' + new Date(meta.t).toLocaleString('ru') + ')');
}
                finishDeepRecovery(found, bestData, bestCount);
        }, 15000);
        });
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
ndSnapshotBeforeImport();
applySyncData(bestData);
saveGameState();
if (typeof checkCapturedRecovery === 'function') checkCapturedRecovery(); // #49: recovery-экран твердынь
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
// Аудит 2026-10-02 (P0 1.2): «база» синхронизации — версия облака (nd_meta.id), которую ЭТО устройство
// последней записало или прочитало. Пуш поверх чужой версии молча стирает чужой прогресс, а по времени
// конфликт не определить: savedAt пере-штампуется при каждой загрузке (checkDailyReset → saveGameState).
// pid — id пуша «в полёте»: meta мог записаться, а колбэк не дойти.
var CLOUD_BASE_KEY = 'nd_cloud_base';
function ndCloudBaseGet() {
    try {
        var b = JSON.parse(localStorage.getItem(CLOUD_BASE_KEY) || 'null');
        if (!b || typeof b !== 'object') return null;
        return { id: b.id ? String(b.id) : '', pid: b.pid ? String(b.pid) : '', t: Number(b.t) || 0 };
    } catch (e) { return null; }
}
function ndCloudBaseSet(meta, pendingId) { // meta — разобранный nd_meta; pendingId — id пуша, чей meta ещё пишется
    try {
        var prev = ndCloudBaseGet();
        if (pendingId) {
            if (!prev) return; // базы не было — остаётся легаси-правило по честной метке
            localStorage.setItem(CLOUD_BASE_KEY, JSON.stringify({ id: prev.id, pid: String(pendingId), t: prev.t }));
            return;
        }
        if (!meta || typeof meta !== 'object') return;
        localStorage.setItem(CLOUD_BASE_KEY, JSON.stringify({ id: meta.id ? String(meta.id) : '', pid: '', t: Number(meta.t) || 0 }));
    } catch (e) {}
}
function ndCloudDiverged(meta) { // true — после последней синхронизации облако менял не этот девайс
    if (!meta || typeof meta !== 'object') return false;
    var base = ndCloudBaseGet();
    if (base && (base.id || base.pid || base.t)) {
        if (meta.id) return String(meta.id) !== base.id && String(meta.id) !== base.pid;
        return Number(meta.t) !== base.t; // легаси-конверт без id
    }
    // базы ещё нет (обновление со старой версии / новое устройство): честная метка — savedAt последнего
    // сохранения ДО этой сессии, а не свежий штамп загрузочного ресейва
    return Number(meta.t) > (Number(window.__ndBootSavedAt) || 0) + 10000;
}
function getCloudStorage() {
    try {
        var tg = window.Telegram && window.Telegram.WebApp;
        if (!tg || !tg.CloudStorage) return null;
        // В обычном браузере telegram-web-app.js создаёт WebApp-заглушку с CloudStorage,
        // чьи колбэки не приходят никогда (platform='unknown') — не считаем это облаком.
        if (!tg.platform || tg.platform === 'unknown') return null;
        return tg.CloudStorage;
    } catch(e) { return null; }
}
function loadCloudChunks(meta, onDone, timeoutMs) {
    var cs = getCloudStorage();
    if (!cs || !meta || !(meta.n > 0)) { onDone(new Error('облако недоступно или плохие метаданные'), null); return; }
    var parts = new Array(meta.n);
    var loaded = 0;
    var settled = false;
    var timer = null;
    function settle(err, data) {
        if (settled) return;
        settled = true;
        if (timer !== null) { clearTimeout(timer); timer = null; }
        onDone(err, data);
    }
    if (timeoutMs) timer = setTimeout(function() { if (typeof ndTelErr === 'function') ndTelErr('CLOUD_LOAD_TIMEOUT', String(timeoutMs), {}); settle(new Error('таймаут загрузки из облака'), null); }, timeoutMs);
    function check() {
        if (loaded < meta.n) return;
        for (var i = 0; i < meta.n; i++) {
            if (typeof parts[i] !== 'string') {
                if (typeof ndTelErr === 'function') ndTelErr('CLOUD_CHUNK_MISSING', String(i), { n: meta.n });
                settle(new Error('чанк ' + i + '/' + meta.n + ' отсутствует'), null); return;
            }
        }
        var joined = parts.join('');
        // Envelope v2 («Trust»): если в meta есть отпечаток c — сверяем его со склеенными
        // чанками. Несовпадение = смешанное поколение (обрыв пуша поверх старых данных)
        // или повреждение: такой сейв не отдаём, работают recovery-потоки.
        if (meta.c) {
            var got = (typeof ndSnapshotChecksum === 'function') ? ndSnapshotChecksum(joined) : '';
            if (got && got !== meta.c) {
                if (typeof ndTelErr === 'function') ndTelErr('CLOUD_CHECKSUM_MISMATCH', got, { id: String(meta.id || ''), n: meta.n });
                settle(new Error('контрольная сумма облака не совпала'), null); return;
            }
        }
        try { settle(null, JSON.parse(joined)); }
        catch(e) { settle(e, null); }
    }
    for (var i = 0; i < meta.n; i++) {
        (function(idx) {
            cs.getItem(CLOUD_DATA_PREFIX + idx, function(e2, val) {
                loaded++;
                if (!e2 && typeof val === 'string') parts[idx] = val;
                check();
            });
        })(i);
    }
}
function clearSurplusChunks(n) {
    var cs = getCloudStorage();
    if (!cs || !(n > 0)) return;
    for (var i = n; i < n + 64; i++) {
        (function(idx) {
            try { cs.removeItem(CLOUD_DATA_PREFIX + idx, function() {}); } catch(e) {}
        })(i);
    }
}
function buildSyncData() {
var data = {
v: SCHEMA_VERSION, t: Date.now(), gen: stateGen,
hero: HERO, stats: STATS, forged: FORGED, goals: GOALS, inventory: INVENTORY,
lastDayReset,
forgedIdCounter, uidCounter, goalIdCounter, xpHistory, bloodOath, lastWeekReset,
tasks: TASKS, taskIdCounter, hirePool, dailyQuests,
season: (typeof season !== 'undefined') ? season : null,
savedAt: Date.now(),
throne: (typeof throne !== 'undefined') ? throne : 0,
TECHS: (typeof TECHS !== 'undefined') ? TECHS : {},
TECH_PTS: (typeof TECH_PTS !== 'undefined') ? TECH_PTS : 0,
TECH_IDEA: (typeof TECH_IDEA !== 'undefined') ? TECH_IDEA : null,
TECH_ACTIVES: (typeof TECH_ACTIVES !== 'undefined') ? TECH_ACTIVES : {},
dailyEvent: (typeof dailyEvent !== 'undefined') ? dailyEvent : null
};
try {
    ensureStrongholdState();
    data.strongholds = strongholds;
    data.army = army;
    data.siege = siege;
} catch(e) {}
try { var _c3 = (typeof NDC3 !== 'undefined' && NDC3 && typeof NDC3.serialize === 'function') ? NDC3.serialize() : undefined; if (_c3) data.c3 = _c3; } catch(e) {} // кампания 3.0: ключа нет, пока флаг не включали
return data;
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
ndClosingGuard(true);
var el = document.getElementById('cloudStatus');
if (el) el.textContent = '☁ Сохраняю...';
var json = JSON.stringify(buildSyncData());
var savedAt = Date.now();
try { savedAt = JSON.parse(json).savedAt || savedAt; } catch(e) {}
var checksum = (typeof ndSnapshotChecksum === 'function') ? ndSnapshotChecksum(json) : ''; // envelope v2, как в pushCloudChunks
var saveId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
var chunks = [];
for (var i = 0; i < json.length; i += CLOUD_MAX_CHUNK) { chunks.push(json.slice(i, i + CLOUD_MAX_CHUNK));
        { if (chunks.length >= 200) { finished = true; ndClosingGuard(false); if (el) el.textContent = '⚠ Слишком много данных'; showToast('⚠ Слишком много данных', 'Сейв не помещается в облако — используйте файл', 'blood'); return; } } }
var finished = false;
setTimeout(function() {
if (!finished) {
finished = true; ndClosingGuard(false);
if (el) el.textContent = '⚠ Таймаут облака — используйте файл';
showToast('⚠ Таймаут', 'Облако не ответило. Скачайте файл.', 'blood');
}
}, 10000);
var doneCount = 0;
function saveMeta() {
    if (finished) return;  // belt-and-suspenders, никогда не nullаем ненулевой finished
cs.setItem(CLOUD_META_KEY, JSON.stringify({n: chunks.length, t: savedAt, c: checksum, id: saveId, sz: json.length}), function(err) {
if (finished) return;
finished = true; ndClosingGuard(false);
if (!err) {
if (typeof ndCloudBaseSet === 'function') ndCloudBaseSet({ id: saveId, t: savedAt });
clearSurplusChunks(chunks.length);
updateCloudStatus();
ndSyncHaptic();
showToast('☁ Сохранено в облако', 'Доступно на всех устройствах');
spiritSay('«Облако запомнило твой путь.»');
} else {
updateSyncBadge('offline');
if (el) el.textContent = '⚠ Ошибка записи метаданных';
showToast('⚠ Ошибка', String(err), 'blood');
}
});
}
chunks.forEach(function(chunk, idx) {
cs.setItem(CLOUD_DATA_PREFIX + idx, chunk, function(err) {
if (finished) return;
if (err) {
finished = true; ndClosingGuard(false);
updateSyncBadge('offline');
if (el) el.textContent = '⚠ Ошибка записи в облако';
showToast('⚠ Ошибка облака', String(err), 'blood');
return;
}
doneCount++;
if (doneCount === chunks.length) saveMeta();
});
});
if (chunks.length === 0) { finished = true; ndClosingGuard(false); if (el) el.textContent = '⚠ Нет данных'; }
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
            loadCloudChunks(meta, function(chunkErr, data) {
                if (finished) return;
                finished = true;
                if (chunkErr || !data) { showToast('⚠ Ошибка', 'Данные повреждены', 'blood'); updateCloudStatus(); return; }
                try {
                    ndSnapshotBeforeImport();
                    applySyncData(data);
                    if (typeof ndCloudBaseSet === 'function') ndCloudBaseSet(meta);
                    ndSyncHaptic();
                    showToast('☁ Загружено', new Date(data.t).toLocaleString('ru'));
                    spiritSay('«Облако поделилось воспоминаниями...»');
                    screenShake(6, 400);
                    closeSyncModal();
                    saveGameState();
                    ndOfferUndoImport('Загрузка из облака');
                } catch(e) { showToast('⚠ Ошибка', 'Данные повреждены', 'blood'); updateCloudStatus(); }
            }, 10000);
});
});
}
// R2 M5: импорт/загрузка из облака перезаписывают все слои сохранения разом — перед применением кладём
// прежнее состояние в отдельный ключ (1 шт.) и даём откатить: тост с действием + кнопка в окне синхронизации.
// Откат живёт 7 дней и всегда спрашивает подтверждение с датой: иначе через месяц одно нажатие молча стирает месяц прогресса.
var PRE_IMPORT_KEY = 'neurodeck_pre_import';
var PRE_IMPORT_TTL = 7 * 86400000;
function ndSnapshotBeforeImport() {
    try {
        if (!FORGED || FORGED.length === 0) return false; // терять нечего
        localStorage.setItem(PRE_IMPORT_KEY, JSON.stringify({ t: Date.now(), data: buildSyncData() }));
        return true;
    } catch(e) { return false; } // квота — импорт всё равно возможен, просто без отката
}
function ndReadUndoImport() { // { t, data } или null; устаревший/битый снимок удаляется
    var snap = null;
    try { snap = JSON.parse(localStorage.getItem(PRE_IMPORT_KEY) || 'null'); } catch(e) {}
    var ok = snap && typeof snap === 'object' && snap.data && typeof snap.data === 'object' && Number(snap.t) > 0 && Date.now() - Number(snap.t) < PRE_IMPORT_TTL;
    if (!ok) { try { localStorage.removeItem(PRE_IMPORT_KEY); } catch(e) {} return null; }
    return snap;
}
function ndOfferUndoImport(what) {
    if (!ndReadUndoImport()) return;
    if (typeof showToast === 'function') showToast('📥 ' + (what || 'Импорт') + ' применён', 'Прежнее состояние сохранено — откат в окне «Синхронизация»', 'save', { label: '↩ Отменить', fn: ndUndoImport });
}
function ndUndoImport() {
    var snap = ndReadUndoImport();
    if (!snap) { showToast('⚠ Нет точки отката', 'Прежнее состояние не найдено', 'blood'); ndRefreshUndoSection(); return; }
    var n = (snap.data.forged && snap.data.forged.length) || 0;
    dungeonConfirm('↩ Откатить импорт?',
        'Вернуть состояние от <b>' + new Date(snap.t).toLocaleString('ru') + '</b> (' + n + ' карт.).<br><br>' +
        '<span style="color:var(--blood-bright)">Всё, что сделано после импорта, будет потеряно.</span>'
    ).then(function(ok) {
        if (!ok) return;
        applySyncData(snap.data);
        saveGameState();
        try { localStorage.removeItem(PRE_IMPORT_KEY); } catch(e) {}
        ndRefreshUndoSection();
        showToast('↩ Импорт отменён', 'Состояние до импорта восстановлено', 'save');
    });
}
function ndRefreshUndoSection() {
    var sec = document.getElementById('undoImportSection');
    if (!sec) return;
    var snap = ndReadUndoImport();
    sec.style.display = snap ? '' : 'none';
    var desc = document.getElementById('undoImportDesc');
    if (desc && snap) desc.textContent = 'Состояние до импорта от ' + new Date(snap.t).toLocaleString('ru') + ' (' + ((snap.data.forged && snap.data.forged.length) || 0) + ' карт.) — хранится 7 дней.';
}
function openSyncModal() { document.getElementById('syncModal').classList.add('show'); updateCloudStatus(); ndRefreshUndoSection(); }
function closeSyncModal() { document.getElementById('syncModal').classList.remove('show'); }
function generateShareLink() {
var data = buildSyncData();
delete data.xpHistory;
if (data.hero && typeof data.hero === 'object') {
var heroCopy = Object.assign({}, data.hero);
delete heroCopy.cardHistory;
data.hero = heroCopy;
}
var encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
if (encoded.length > 15000 && typeof showToast === 'function') {
showToast('⚠ Ссылка очень большая', 'Может не поместиться в сообщение Telegram');
}
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
ndSnapshotBeforeImport();
applySyncData(data);
window.location.hash = '';
showToast('📥 Импортировано из ссылки', 'Прогресс восстановлен');
ndOfferUndoImport('Импорт из ссылки');
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
ndSnapshotBeforeImport();
applySyncData(data);
showToast('✅ Импортировано', 'Данные из файла');
spiritSay('«Чужие воспоминания... но теперь они твои.»');
screenShake(6, 400);
closeSyncModal();
saveGameState();
ndOfferUndoImport('Импорт из файла');
});
} catch(err) { showToast('⚠ Ошибка', 'Неверный формат файла', 'blood'); }
};
reader.readAsText(file);
event.target.value = '';
}
function applySyncData(data, skipRender) {
if (!data || typeof data !== 'object') return;
if (typeof data.v === 'number' && data.v > SCHEMA_VERSION) {
if (typeof showToast === 'function') showToast('⚠ Слишком новая версия', 'Данные из более новой версии игры — обновите приложение', 'blood');
if (typeof ndTelErr === 'function') ndTelErr('SAVE_FROM_FUTURE', String(data.v), { current: SCHEMA_VERSION });
return;
}
if (typeof data.gen === 'number' && Number.isFinite(data.gen) && data.gen > stateGen) stateGen = Math.floor(data.gen);
migrateSyncData(data);
if (data.hero && typeof data.hero === 'object') {
var sanitizedHero = STATE_GUARDS.sanitizeHero(data.hero);
Object.keys(sanitizedHero).forEach(function(k) { HERO[k] = sanitizedHero[k]; });
}
if (data.stats && typeof data.stats === 'object') {
Object.keys(data.stats).forEach(k => {
if (!Object.prototype.hasOwnProperty.call(STATS, k)) return;
var srcStat = data.stats[k];
if (!srcStat || typeof srcStat !== 'object') return;
// P0 аудита: только числовые поля — name/icon/color статов рисуются через innerHTML, из импорта их брать нельзя
var maxCap = STATS[k].max;
if (typeof srcStat.max === 'number' && Number.isFinite(srcStat.max)) STATS[k].max = Math.max(1, Math.min(maxCap, Math.round(srcStat.max)));
if (Number.isFinite(Number(srcStat.value))) STATS[k].value = Number(srcStat.value);
if (Number.isFinite(Number(srcStat.attributePoints))) STATS[k].attributePoints = Number(srcStat.attributePoints);
STATS[k].value = Math.max(0, Math.min(STATS[k].max || 100, STATS[k].value || 0));
STATS[k].attributePoints = Math.max(0, STATS[k].attributePoints || 0);
});
}
if (data.forged) FORGED = Array.isArray(data.forged) ? data.forged.map(function(c, i) { return STATE_GUARDS.sanitizeCard(c, i + 1); }) : [];
if (data.goals) GOALS = Array.isArray(data.goals) ? data.goals.map(function(g, i) { return STATE_GUARDS.sanitizeGoal(g, i + 1); }) : [];
if (data.inventory) {
var cleanInventory = STATE_GUARDS.sanitizeInventory(data.inventory, ARTIFACTS, INVENTORY.maxSlots);
INVENTORY.backpack = cleanInventory.backpack;
INVENTORY.equipped = cleanInventory.equipped;
INVENTORY.maxSlots = cleanInventory.maxSlots;
}
if (data.forgedIdCounter) forgedIdCounter = Math.max(STATE_GUARDS.sanitizeCounter(data.forgedIdCounter, 100), maxExistingId(FORGED) + 1);
if (data.uidCounter) {
var maxUid = 0;
(INVENTORY.backpack || []).forEach(function(it) {
var n = parseInt(String(it && it.uid ? it.uid : '').replace(/^[^\d]*/, ''), 10);
if (Number.isFinite(n) && n > maxUid) maxUid = n;
});
uidCounter = Math.max(STATE_GUARDS.sanitizeCounter(data.uidCounter, 10), maxUid + 1);
}
if (data.goalIdCounter) goalIdCounter = Math.max(STATE_GUARDS.sanitizeCounter(data.goalIdCounter, 1), maxExistingId(GOALS) + 1);
else if (data.counter != null) goalIdCounter = Math.max(STATE_GUARDS.sanitizeCounter(data.counter, 1), maxExistingId(GOALS) + 1);
if (Array.isArray(data.xpHistory)) xpHistory = STATE_GUARDS.sanitizeXpHistory(data.xpHistory);
if (data.bloodOath !== undefined) {
bloodOath = STATE_GUARDS.sanitizeBloodOath(data.bloodOath);
}
// QA3-M2: только строго датированные строки; мусор → null (= «сброс»: дневной/
// недельный цикл сам выставит свежий ключ при следующем тике, app.js:2820)
var RESET_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
if (typeof data.lastWeekReset === 'string') lastWeekReset = RESET_DATE_RE.test(data.lastWeekReset) ? data.lastWeekReset : null;
if (typeof data.lastDayReset === 'string') lastDayReset = RESET_DATE_RE.test(data.lastDayReset) ? data.lastDayReset : null;
if (Array.isArray(data.strongholds)) strongholds = STATE_GUARDS.sanitizeStrongholds(data.strongholds, strongholdCatalog());
if (data.army && typeof data.army === 'object') army = STATE_GUARDS.sanitizeArmy(data.army);
if (data.siege) siege = STATE_GUARDS.sanitizeSiege(data.siege);
if (data.c3 !== undefined && typeof NDC3 !== 'undefined' && NDC3 && typeof NDC3.load === 'function') NDC3.load(data.c3); // кампания 3.0: необязательный ключ, схема v14 не меняется
if (data.hirePool) hirePool = STATE_GUARDS.sanitizeHirePool(data.hirePool);
    if (typeof dailyQuests !== 'undefined' && data.dailyQuests && typeof data.dailyQuests === 'object') {
        var _dq = STATE_GUARDS.sanitizeDailyQuests(data.dailyQuests, (typeof DQ_POOL !== 'undefined') ? DQ_POOL : null); // P0: квесты по каталогу, не как есть
        if (_dq.day) dailyQuests = { day: _dq.day, quests: _dq.quests, done: _dq.done, progress: _dq.progress };
    }
if (typeof dailyEvent !== 'undefined' && data.dailyEvent && typeof data.dailyEvent === 'object' && typeof data.dailyEvent.id === 'string') { // P0: событие дня — объект из каталога, не из импорта
    var _evId = data.dailyEvent.id;
    var _evCat = (typeof buildDailyEvents === 'function') ? buildDailyEvents().filter(function(x) { return x.id === _evId; }) : [];
    if (_evCat.length) dailyEvent = _evCat[0];
}
if (typeof season !== 'undefined' && data.season && typeof data.season === 'object') { season = STATE_GUARDS.sanitizeSeason(data.season, (typeof getMSKDayKey === 'function') ? getMSKDayKey() : null); }
if (typeof throne !== 'undefined' && typeof data.throne === 'number' && Number.isFinite(data.throne)) throne = Math.max(0, Math.min(5, Math.round(data.throne)));
if (typeof TECHS !== 'undefined' && data.TECHS && typeof data.TECHS === 'object' && !Array.isArray(data.TECHS)) {
  var _ct;
  if (data.TECHS.owned && typeof data.TECHS.owned === 'object') { // Г5-Т3 схема
    _ct = { owned: {}, lvl: {} };
    Object.keys(data.TECHS.owned).slice(0, 21).forEach(function(k) { if (data.TECHS.owned[k] === true) _ct.owned[k] = true; });
    if (data.TECHS.lvl && typeof data.TECHS.lvl === 'object') Object.keys(data.TECHS.lvl).slice(0, 21).forEach(function(k) { var v = Math.round(Number(data.TECHS.lvl[k])); if (v >= 1 && v <= 5) _ct.lvl[k] = v; });
  } else { // легаси
    _ct = { owned: {}, lvl: {} };
    Object.keys(data.TECHS).slice(0, 21).forEach(function(k) { if (data.TECHS[k] === true) _ct.owned[k] = true; });
  }
  TECHS = _ct;
}
if (typeof TECH_PTS !== 'undefined' && typeof data.TECH_PTS === 'number' && Number.isFinite(data.TECH_PTS)) TECH_PTS = Math.max(0, Math.min(999, Math.round(data.TECH_PTS))); // Г5-Т
if (typeof TECH_IDEA !== 'undefined' && data.TECH_IDEA !== undefined) { if (data.TECH_IDEA === null || ['idea_might', 'idea_wealth', 'idea_order'].indexOf(data.TECH_IDEA) >= 0) TECH_IDEA = data.TECH_IDEA; } // Г5-Т2
if (typeof TECH_ACTIVES !== 'undefined' && data.TECH_ACTIVES && typeof data.TECH_ACTIVES === 'object' && !Array.isArray(data.TECH_ACTIVES)) { var _caa = {}; Object.keys(data.TECH_ACTIVES).slice(0, 4).forEach(function(k) { if (typeof data.TECH_ACTIVES[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.TECH_ACTIVES[k])) _caa[k] = data.TECH_ACTIVES[k]; }); TECH_ACTIVES = _caa; } // Г5-Т3 Ф2
if (Array.isArray(data.tasks)) {
TASKS = data.tasks.filter(function(t) {
return t && typeof t === 'object' && typeof t.name === 'string' && t.name.length > 0 &&
['active', 'done', 'ghost', 'chest_open'].indexOf(t.status) >= 0;
}).map(function(t, i) {
var _tk = { id: (Number.isFinite(Number(t.id)) && Number(t.id) >= 1) ? Math.min(1000000000, Math.round(Number(t.id))) : (i + 1), name: t.name.slice(0, 200), tier: ['light', 'normal', 'urgent'].indexOf(t.tier) >= 0 ? t.tier : 'normal', deadline: safeTs(t.deadline), status: t.status, createdAt: safeTs(t.createdAt, Date.now()), doneAt: safeTs(t.doneAt), ghostSince: safeTs(t.ghostSince) };
if (['body', 'mind', 'spirit', 'ties'].indexOf(t.sphere) >= 0) _tk.sphere = t.sphere; // кампания 3.0: сфера задачи (лениво — старые сейвы байт-стабильны)
return _tk;
});
}
TASKS = TASKS.filter(function(t, i) { return TASKS.findIndex(function(x) { return x.id === t.id; }) === i; });
if (typeof data.taskIdCounter === 'number') taskIdCounter = Math.max(STATE_GUARDS.sanitizeCounter(data.taskIdCounter, 1), TASKS.reduce(function(m, t) { return Math.max(m, t.id); }, 0) + 1);
if (!skipRender) {
// Фаза 2 (шаг state-store №1): storage больше не зовёт UI напрямую — app.js
// подписан на 'nd:state-applied' (js/event-bus.js). typeof-гвард обязателен:
// extract-харнессы тестов исполняют storage.js без шины.
if (typeof NDDBus !== 'undefined' && NDDBus && typeof NDDBus.emit === 'function') NDDBus.emit('nd:state-applied', { gen: (typeof data.gen === 'number') ? data.gen : null, savedAt: data.savedAt || null });
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
try { var csR = getCloudStorage(); if (csR) csR.removeItem(CLOUD_META_KEY, function() {}); } catch(e) {}
try {
    if (!idb) { location.reload(); return; }
    var tx = idb.transaction('saves', 'readwrite');
    tx.objectStore('saves').delete('latest');
    tx.oncomplete = function() { location.reload(); };
    tx.onerror = function() { location.reload(); };
} catch(e) { location.reload(); }
});
}
if (typeof module === 'object' && module.exports) {
    module.exports.__storageInternals = {
        migrateSyncData: migrateSyncData,
        applySyncData: applySyncData,
        getStrongholds: function() { return strongholds; },
        getArmy: function() { return army; },
        getSiege: function() { return siege; },
        setStrongholds: function(v) { strongholds = v; },
        setArmy: function(v) { army = v; },
        setSiege: function(v) { siege = v; },
        SCHEMA_VERSION: SCHEMA_VERSION
    };
}

// Мульти-вкладка: живой синк — чужое сохранение подхватывается этой вкладкой автоматически
if (typeof window !== 'undefined' && window.addEventListener) {
    var _tabSyncTimer = null;
    window.addEventListener('storage', function(e) {
        if (!e || e.key !== 'neurodeck_full_save' || !e.newValue) return;
        if (_tabSyncTimer) return; // дебаунс: серия записей другой вкладки = один apply
        _tabSyncTimer = setTimeout(function() {
            _tabSyncTimer = null;
            try {
                var data = JSON.parse(localStorage.getItem('neurodeck_full_save') || 'null');
                if (!data || typeof applySyncData !== 'function') return;
                applySyncData(data, true);
                // фаза 2: рендер через шину (storage не знает о UI-функциях)
                if (typeof NDDBus !== 'undefined' && NDDBus && typeof NDDBus.emit === 'function') NDDBus.emit('nd:state-applied', { gen: (typeof data.gen === 'number') ? data.gen : null, savedAt: data.savedAt || null });
            } catch (err) {}
        }, 400);
    });
}
