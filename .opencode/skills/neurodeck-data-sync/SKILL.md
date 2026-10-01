---
name: neurodeck-data-sync
description: Data synchronization and persistence guardian for NeuroDeck. Use when editing saveGameState(), loadGameState(), applySyncData(), autoCloudSave(), tryCloudRecovery(), saveToCloud(), loadFromCloud(), generateShareLink(), importFromHash(), downloadSyncFile(), importSyncFile(), or any code touching localStorage, Telegram CloudStorage, or data import/export. Covers the multi-level backup strategy (full_save + backup + cloud + goals), CloudStorage chunking (envelope v3: generation-isolated nd_<gen>_<i> chunk keys with nd_meta commit-pointer, CAS writer conflicts, prev-rollback, legacy nd_N read path), auto-save throttling (30 s), share link base64 encoding, .ndsync file format, and the critical applySyncData() sanitization guards. Prevents data loss, corruption from bad imports, and CloudStorage callback signature errors.
---

# NeuroDeck Data Sync Guide

## Multi-Level Backup Strategy

```
saveGameState()
  ├── localStorage['neurodeck_full_save']   ← PRIMARY (always)
  ├── localStorage['neurodeck_backup']      ← FALLBACK (always, same data)
  ├── localStorage['neurodeck_goals']       ← LEGACY (goals only)
  ├── autoCloudSave() → CloudStorage        ← CLOUD (throttled 2 min)
  └── window.beforeunload → saveGameState() ← ON CLOSE
```

**NEVER** write to localStorage directly. Always go through `saveGameState()`.

## localStorage Keys

| Key | Content | Written by |
|-----|---------|------------|
| `neurodeck_full_save` | Full JSON snapshot | `saveGameState()` |
| `neurodeck_backup` | Same as full_save | `saveGameState()` |
| `neurodeck_goals` | `{ goals, counter }` only | `saveGoals()` |
| `neurodeck_onboarding_done` | `'1'` flag | onboarding completion |
| `neurodeck_notif` | `'1'` or `'0'` | `toggleNotif()` |

## Telegram CloudStorage

### Key Structure (envelope v3, R2 — очередь 4)
- Meta (commit-pointer): `nd_meta` → `JSON.stringify({ v: 3, g: gen, n: chunkCount, t: savedAt, c: checksum64, id: gen, sz: size, prev?: prevDescriptor })`
- Data (поколенческие): `nd_<gen>_0`, `nd_<gen>_1`, ... → each ≤ 4096 chars (`CLOUD_MAX_CHUNK`); `gen` = id сохранения
- Legacy (envelope ≤ v2, только ЧТЕНИЕ): плоские `nd_0`, `nd_1`, ... — meta без `g`
- Гарантии: чанки нового поколения не трогают ключи закоммиченного (изоляция); `nd_meta` пишется строго ПОСЛЕДНИМ; перед meta — CAS re-read (writer conflict: чужое более свежее поколение не затираем); читатель при повреждении откатывается на `prev` (глубина 1). Никогда не пиши в плоские `nd_<i>` — только поколенческие ключи через `writeCloudGeneration()`.

### CRITICAL: Callback Signature
```js
// CORRECT — (error, result) order
cs.setItem(key, value, function(error, result) { ... });
cs.getItem(key, function(error, result) { ... });

// WRONG — will break silently
cs.setItem(key, value, function(result, error) { ... });
```

### autoCloudSave() Throttling
```js
function autoCloudSave(json, force, bypassConflictCheck) {
    if (_pushInFlight) { if (force) window._pendingCloudForce = {...}; return; } // без параллельных пушей
    if (!force && Date.now() - (window._lastCloudSave || 0) < 30000) return; // 30 c
    window._lastCloudSave = Date.now();
    // ... conflict pre-check по meta.t, затем pushCloudChunks → writeCloudGeneration
}
```
- Fires automatically inside `saveGameState()`
- **Only saves, never loads** (load is manual or via recovery)
- If CloudStorage unavailable (not in Telegram), silently returns

### Chunking Logic
```js
var chunks = [];
for (var i = 0; i < json.length; i += CLOUD_MAX_CHUNK) {
    chunks.push(json.slice(i, i + CLOUD_MAX_CHUNK));  // cap: 200 чанков
}
// Save each chunk as nd_<gen>_0, nd_<gen>_1, ... (fresh gen per push)
// CAS re-read nd_meta (writer conflict) → save nd_meta LAST as commit-pointer {v:3,g,n,t,c,id,sz,prev}
```

### Loading from Cloud
```js
// 1. Read nd_meta → { g, n, c, prev? } (v3) или { n } (legacy ≤ v2)
// 2. v3: read nd_<g>_0..nd_<g>_(n-1); legacy: read nd_0..nd_(n-1)
// 3. parts.join('') → checksum `c` verify → JSON.parse
// 4. Повреждение текущего поколения (v3) → rollback на prev (глубина 1)
```

## Share Link System

### Encoding
```js
function generateShareLink() {
    var json = JSON.stringify(buildSyncData());
    var encoded = btoa(unescape(encodeURIComponent(json)));
    return window.location.origin + window.location.pathname + '#' + encoded;
}
```

### Decoding (on page load)
```js
function importFromHash() {
    var encoded = hash.slice(1); // remove #
    var json = decodeURIComponent(escape(atob(encoded)));
    var data = JSON.parse(json);
    // → dungeonConfirm → applySyncData
}
```

**WARNING:** `btoa(unescape(encodeURIComponent(json)))` handles Cyrillic. Do NOT simplify to `btoa(json)` — will throw on non-ASCII.

## .ndsync File Format
- Extension: `.ndsync` (also accepts `.json`)
- Content: raw JSON (same as `buildSyncData()` output)
- Download: `Blob([json], { type: 'application/json' })`
- Upload: `FileReader.readAsText()` → `JSON.parse()` → `applySyncData()`

## applySyncData() — The ONLY Safe Import

```js
function applySyncData(data, skipRender) {
    // HERO sanitization
    HERO.hp = Math.max(0, HERO.hp || 0);
    HERO.maxHp = Math.max(1, HERO.maxHp || 1);
    HERO.level = Math.max(1, Math.min(99, HERO.level || 1));
    HERO.estus = Math.max(0, Math.min(3, HERO.estus || 0));

    // STATS sanitization
    STATS[k].value = Math.max(0, Math.min(max, value));
    STATS[k].attributePoints = Math.max(0, attributePoints);

    // FORGED defaults
    card.rank = card.rank || 'C';
    card.mastery = card.mastery || 0;
    card.masteryThreshold = card.masteryThreshold || 7;

    // escapeProgress bounds
    escapeProgress = Math.max(0, Math.min(ESCAPE_MAX, data.escapeProgress));

    // ... then full re-render (unless skipRender)
}
```

**When adding new saveable fields:** ALWAYS add corresponding guards in `applySyncData()`.

## tryCloudRecovery() — Emergency Recovery

Triggered when `loadGameState()` finds nothing in localStorage:
1. Check if CloudStorage is available
2. Read `nd_meta` for chunk info
3. If data exists → show `dungeonConfirm()` dialog with save details
4. On confirm → `applySyncData(data, true)` → `saveGameState()` → `location.reload()`

**IMPORTANT:** This prevents total data loss when Telegram WebView clears localStorage cache.

## Snapshot Structure (saveGameState)

```js
{
    hero: HERO,                    // Full hero object
    stats: STATS,                  // All 6 stats
    forged: FORGED,               // All cards
    goals: GOALS,                 // All goals
    inventory: INVENTORY,         // Backpack + equipped
    escapeProgress,               // 0-140
    bossHp, bossStage, bossDefeated,
    lastDayReset,                 // MSK date key
    chimeraShield,                // 0-5
    forgedIdCounter, uidCounter, goalIdCounter,
    xpHistory,                    // Last 90 days
    bossKills: window._bossKills, // { snake, social, chimera }
    savedAt: Date.now()
}
```

**buildSyncData()** adds version tag: `{ v: 'nd-sync-v4', t: Date.now(), ... }`

## Common Pitfalls

1. **NEVER** call `localStorage.setItem` without also updating backup
2. **NEVER** skip `saveGoals()` — legacy code reads `neurodeck_goals`
3. **NEVER** parse cloud chunks without checking for errors/null
4. **NEVER** apply imported data without going through `applySyncData()`
5. **NEVER** forget the 10-second timeout on manual cloud operations
6. Always clear `window.location.hash` after importing from share link
