const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const app = read('js/app.js');
const storage = read('js/storage.js');
const stateGuards = read('js/state-guards.js');
const combatPixi = read('js/combat-pixi.js');
const html = read('index.html');

test('App.js no longer declares storage functions (extracted to storage.js)', () => {
    ['saveGameState', 'loadGameState', 'applySyncData', 'buildSyncData',
     'saveToCloud', 'loadFromCloud', 'deepRecovery', 'resetAllData',
     'downloadSyncFile', 'importSyncFile', 'openSyncModal',
     'generateShareLink', 'importFromHash', 'tryCloudRecovery', 'forceCloudSave',
     'autoCloudSave', 'smartCloudSync', 'saveToIDB', 'loadFromIDB'
    ].forEach(fn => {
        const re = new RegExp('function\\s+' + fn + '\\b');
        assert.equal(re.test(app), false, fn + ' should not be in app.js');
    });
});

test('Storage.js declares all storage functions', () => {
    ['saveGameState', 'loadGameState', 'applySyncData', 'buildSyncData',
     'saveToCloud', 'loadFromCloud', 'deepRecovery', 'resetAllData',
     'downloadSyncFile', 'importSyncFile', 'openSyncModal',
     'generateShareLink', 'importFromHash'
    ].forEach(fn => {
        const re = new RegExp('function\\s+' + fn + '\\b');
        assert.equal(re.test(storage), true, fn + ' should be in storage.js');
    });
});

test('App.js no longer has dead Canvas 2D combat code', () => {
    ['renderCombat', 'triggerHeroAttack', 'triggerBossAttack',
     'drawCombatShadow', 'drawCombatSilhouette', 'spawnEmber',
     'combatCanvas', 'combatCtx', 'combatLoading', 'extractSilhouette',
     'generateGrain', 'combatLoaded'
    ].forEach(token => {
        assert.equal(app.indexOf(token) === -1, true,
            'dead combat token ' + token + ' should not be in app.js');
    });
});

test('App.js retains PIXI combat bridge functions', () => {
    ['initCombatCanvas', 'updateCombatHpBars', 'attackBoss',
     'endBossTurn', 'changeBossHp'
    ].forEach(fn => {
        const re = new RegExp('function\\s+' + fn + '\\b');
        assert.equal(re.test(app), true, fn + ' should stay in app.js');
    });
});

test('attackBoss calls window.startHeroAttack (PIXI API, not old)', () => {
    assert.ok(app.indexOf('window.startHeroAttack') > -1,
        'attackBoss must call window.startHeroAttack');
    // No standalone triggerHeroAttack (without window.) anywhere
    const total = (app.match(/\btriggerHeroAttack\b/g) || []).length;
    const windowed = (app.match(/\bwindow\.triggerHeroAttack\b/g) || []).length;
    assert.equal(total, windowed, 'triggerHeroAttack must be window-scoped only');
});

test('endBossTurn calls window.startBossAttack (PIXI API, not old)', () => {
    assert.ok(app.indexOf('window.startBossAttack') > -1,
        'endBossTurn must call window.startBossAttack');
    const total = (app.match(/\btriggerBossAttack\b/g) || []).length;
    const windowed = (app.match(/\bwindow\.triggerBossAttack\b/g) || []).length;
    assert.equal(total, windowed, 'triggerBossAttack must be window-scoped only');
});

test('updateCombatHpBars calls window.updateHP (PIXI API)', () => {
    assert.ok(app.indexOf('window.updateHP') > -1,
        'must call window.updateHP');
});

test('Rank-up flow chains evolution menu', () => {
    const start = app.indexOf('function triggerRankUpEffect');
    assert.ok(start > -1, 'triggerRankUpEffect missing');
    // Find matching brace using depth counter (handles nested braces).
    let depth = 0, end = -1, i = app.indexOf('{', start);
    for (; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = app.slice(start, end + 1);
    assert.ok(body.includes('showEvolutionChoices'),
        'triggerRankUpEffect must call showEvolutionChoices');
    assert.ok(body.includes('openEditCardAfterRankup'),
        'triggerRankUpEffect must branch on evolutionPath');
});

test('Evolution modal exists in HTML with selector', () => {
    assert.ok(html.indexOf('id="evolutionModal"') > -1,
        'evolutionModal missing in HTML');
    assert.ok(html.indexOf('evolution-card-name') > -1,
        '.evolution-card-name selector missing in HTML');
    assert.ok(html.indexOf('apply-evolution-depth') > -1,
        'apply-evolution-depth data-action missing');
    assert.ok(html.indexOf('apply-evolution-frequency') > -1,
        'apply-evolution-frequency data-action missing');
    assert.ok(html.indexOf('apply-evolution-stability') > -1,
        'apply-evolution-stability data-action missing');
});

test('Evolution handlers wired in app.js event delegation', () => {
    ['apply-evolution-depth', 'apply-evolution-frequency',
     'apply-evolution-stability', 'evolution-skip'
    ].forEach(action => {
        assert.ok(app.indexOf("case '" + action + "'") > -1,
            'event delegation missing case for ' + action);
    });
});

test('Forge card locks starting rank to C (anti-exploit)', () => {
    assert.ok(app.indexOf("rank = 'C'") > -1,
        "forgeCard must lock rank to 'C'");
});

test('Forge card mints evolutionPath correctly', () => {
    assert.ok(app.indexOf('evolutionPath: null') > -1,
        'forgeCard must initialize evolutionPath: null');
});

test('All data-action handlers wired in app.js click delegation', () => {
    const dataActions = [...html.matchAll(/data-action="([^"]+)"/g)]
        .map(m => m[1])
        .filter((v, i, a) => a.indexOf(v) === i);
    const dataActionsToCheck = dataActions.filter(a =>
        !['select-forge-stat', 'select-edit-stat', 'filter-goals',
          'filter-backpack', 'select-goal-stat', 'select-goal-type',
          'switch-view'].includes(a)
    );
    dataActionsToCheck.forEach(action => {
        assert.ok(app.indexOf("case '" + action + "'") > -1,
            'data-action=' + action + ' not wired in event delegation');
    });
});

test('Storage.js references STATE_GUARDS but only inside function bodies', () => {
    // All STATE_GUARDS uses should be inside functions, not as top-level statements.
    const lines = storage.split('\n');
    let depth = 0;
    let problems = [];
    let current = '';
    let startedAt = -1;
    lines.forEach((line, idx) => {
        // Update brace depth
        for (const ch of line) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
        }
        // We're tracking multi-line statements at the top level of the file.
        // depth === 0 with STATE_GUARDS reference is a problem.
        if (/\bSTATE_GUARDS\b/.test(line) && !line.trim().startsWith('//')) {
            if (depth === 0) problems.push('L' + (idx+1) + ': ' + line.trim());
        }
    });
    assert.deepEqual(problems, [],
        'STATE_GUARDS used at top-level (load-time): ' + problems.join(' | '));
});

test('State guards UMD wrapper is present', () => {
    assert.ok(stateGuards.includes('module.exports'),
        'state-guards must support CommonJS for tests');
});

test('Database schema survives JSON round-trip', () => {
    const guards = require('../js/state-guards.js');
    const card = guards.sanitizeCard({
        id: 1,
        name: 'Test Card',
        meta: '⚔ 15 мин · утро',
        rank: 'B',
        stat: 'str',
        mastery: 7,
        masteryThreshold: 7,
        streak: 5,
        stat_allocs: 'extra-allocation-allowed',
        evolutionPath: 'depth'
    }, 1);
    // Round-trip through JSON
    const json = JSON.stringify(card);
    const restored = JSON.parse(json);
    const reSanitized = guards.sanitizeCard(restored, 1);
    assert.equal(reSanitized.rank, 'B');
    assert.equal(reSanitized.evolutionPath, 'depth');
    assert.equal(reSanitized.stat, 'str');
});

test('All Animation API references in app.js use window globals', () => {
    // Find all function body patterns that look like combat animation calls.
    // They must use window.* API to talk to PIXI combat-pixi.js.
    // File-wide check: any reference to startHeroAttack, startBossAttack, updateHP must be window.X
    const tokens = ['startHeroAttack', 'startBossAttack', 'updateHP',
        'setBossDefeated', 'setBossType'];
    tokens.forEach(t => {
        // Search for ALL occurrences
        const matches = [...app.matchAll(new RegExp('\\b' + t + '\\b', 'g'))];
        matches.forEach(m => {
            // Window calls are OK
            if (m.index > 0 && app.slice(m.index - 7, m.index).includes('window.')) {
                return;
            }
        });
        // Count occurrences: only window-scoped usage allowed
        const total = (app.match(new RegExp('\\b' + t + '\\b', 'g')) || []).length;
        const windowed = (app.match(new RegExp('window\\.' + t + '\\b', 'g')) || []).length;
        assert.equal(total, windowed,
            t + ' must be called only via window.' + t + ' (' + total + ' vs ' + windowed + ')');
    });
});

test('No estus (removed in v25) references remain', () => {
    ['estus', 'Estus', 'Эстус'].forEach(token => {
        assert.equal(app.indexOf(token) === -1, true,
            'estus references found in app.js');
    });
});

test('Cache bust versions are consistent', () => {
    const htmlMatch = html.match(/v=(\d{2,})/g);
    assert.ok(htmlMatch, 'no version found in HTML');
    const versions = htmlMatch.map(v => v.replace('v=', ''));
    const uniq = [...new Set(versions)];
    assert.equal(uniq.length, 1,
        'cache-bust versions should be unified, got: ' + versions.join(', '));
});

test('State-guards sanitizeCard skips unknown fields safely', () => {
    const guards = require('../js/state-guards.js');
    const dirty = {
        id: 1, name: 'X', rank: 'C', stat: 'str', mastery: 0, masteryThreshold: 5,
        evolutionPath: null,
        injected: 'evil', __proto__: { polluted: true }
    };
    const clean = guards.sanitizeCard(dirty, 1);
    assert.equal(clean.injected, undefined,
        'should drop injected fields');
    assert.equal(Object.keys(clean).indexOf('__proto__'), -1);
});

test('Stat values are clamped during import to safe range', () => {
    const guards = require('../js/state-guards.js');
    // sanity check of state-guards
    const card = guards.sanitizeCard({
        id: 1, name: 'X', rank: 'S',
        mastery: 999999,  // > threshold
        masteryThreshold: 5
    }, 1);
    assert.ok(card.mastery <= card.masteryThreshold,
        'mastery must be clamped to threshold');
});

test('Forge form does not expose SSS rank option in HTML', () => {
    const forgeForm = html.match(/id="forgeRank"[\s\S]*?<\/select>/);
    assert.ok(forgeForm, 'forge rank select not found');
    assert.equal(forgeForm[0].indexOf('SSS') === -1, true,
        'forge rank select should not expose SSS');
});

test('Storage snapshot includes all critical game fields', () => {
    // Decode the snapshot object literal in saveGameState
    const m = storage.match(/const snapshot = \{([\s\S]*?)\};/);
    assert.ok(m, 'snapshot object literal missing in storage.js');
    const fields = ['hero', 'stats', 'forged', 'goals', 'inventory',
        'escapeProgress', 'bossHp', 'bossStage', 'bossDefeated',
        'lastDayReset', 'bossRunLocked', 'forgedIdCounter', 'uidCounter',
        'goalIdCounter', 'xpHistory', 'bossKills', 'bloodOath',
        'bossRagePoints', 'lastWeekReset', 'savedAt'];
    fields.forEach(f => {
        assert.ok(m[1].indexOf(f) > -1, 'snapshot missing field: ' + f);
    });
});

// ============================================================
// v47 audit fixes — tests for chunk cap, IDB timestamp, saveMeta guard
// ============================================================

test('Storage: chunks.push loop has emergency cap at 200 iterations', function () {
    // Verify that the chunk-slice loop has the emergency guard
    const matches = storage.match(/chunks\.push\(json\.slice\(i, i \+ CLOUD_MAX_CHUNK\)\);/g);
    assert.ok(matches && matches.length >= 2, 'should have at least 2 chunk loops');
    assert.ok(matches.length === 2, 'expected exactly 2: in autoCloudSave and saveToCloud');
    // Check the emergency cap exists
    const cap = storage.match(/chunks\.length >= 200.*?return/);
    assert.ok(cap, 'chunk-loop emergency cap should exist');
});

test('Storage: saveToIDB sets window._lastIDBSaveAt hook', function () {
    // After a successful IDB write, we set a timestamp so callers can
    // detect duplicate-writes; this is purely informational.
    assert.ok(storage.indexOf('window._lastIDBSaveAt = Date.now()') !== -1,
        'saveToIDB should expose window._lastIDBSaveAt');
});

test('Storage: saveMeta guards against finished=true (defensive)', function () {
    // The defensive guard prevents re-entrancy under race (chunks.length === 0 edge)
    assert.ok(storage.indexOf('if (finished) return;') !== -1,
        'saveMeta should have finished guard');
});
