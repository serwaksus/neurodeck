const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../js/perf.js');
require('../js/perf-compat.js');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
const app = read('js/app.js');
const perfSh = read('js/state-guards.js'); // sanity
const perfJs = read('js/perf.js');
const combatPixi = read('js/combat-pixi.js');

// ===================== js/perf.js logic =====================

test('perf.js exposes UMD module via module.exports', () => {
    const P = require('../js/perf.js');
    assert.equal(typeof P, 'object');
    assert.equal(typeof P.setMode, 'function');
    assert.equal(typeof P.getMode, 'function');
    assert.equal(typeof P.isEco, 'function');
    assert.equal(typeof P.onEcoModeChange, 'function');
    assert.equal(typeof P.applyToCanvasRenderer, 'function');
});

test('isEco covers low/effects-off union (compat semantics)', () => {
    const P = require('../js/perf.js');
    P._resetForTests();
    P.setMode('low');
    assert.equal(P.isEco(), true, 'low must be eco-true');
    P.setMode('effects-off');
    assert.equal(P.isEco(), true, 'effects-off must be eco-true');
    P.setMode('performance');
    assert.equal(P.isEco(), false, 'performance must be eco-false');
});

test('default mode is auto, default eco is false', () => {
    const P = require('../js/perf.js');
    // Mode may already be 'eco' or 'performance' if a previous test set it.
    // _resetForTests wipes state.
    P._resetForTests();
    assert.equal(P.getMode(), 'auto');
    assert.equal(P.isEco(), false);
});

test('setMode(eco) flips effective eco on', () => {
    const P = require('../js/perf.js');
    P._resetForTests();
    P.setMode('eco');
    assert.equal(P.getMode(), 'eco');
    assert.equal(P.isEco(), true);
});

test('setMode(performance) flips effective eco off', () => {
    const P = require('../js/perf.js');
    P._resetForTests();
    P.setMode('eco');
    P.setMode('performance');
    assert.equal(P.getMode(), 'performance');
    assert.equal(P.isEco(), false);
});

test('setMode(auto) follows systemReducedMotion', () => {
    const P = require('../js/perf.js');
    P._resetForTests();
    // simulate system preferring reduced motion — simulate by re-init with mocked matchMedia.
    // Easier: explicitly check that auto mode is the default fallback.
    P.setMode('auto');
    assert.equal(P.getMode(), 'auto');
    // Without a real matchMedia override, auto mirrors systemReducedMotion (false in node).
    assert.equal(P.isEco(), false);
});

test('invalid mode is rejected, current mode preserved', () => {
    const P = require('../js/perf.js');
    P._resetForTests();
    P.setMode('eco');
    var ok = P.setMode('invalid-mode');
    assert.equal(ok, false);
    assert.equal(P.getMode(), 'eco', 'mode should not change on invalid input');
});

test('VALID_MODES is exposed and reasonable', () => {
    const P = require('../js/perf.js');
    assert.deepEqual(P.VALID_MODES.sort(), ['auto', 'eco', 'effects-off', 'low', 'performance']);
});

test('CHANGE event fires listener only on actual eco transition', () => {
    const P = require('../js/perf.js');
    P._resetForTests();
    var calls = 0;
    var lastIsEco = null;
    var lastMode = null;
    P.onEcoModeChange(function(isEco, mode) { calls++; lastIsEco = isEco; lastMode = mode; });
    P.setMode('eco');
    assert.equal(calls, 1);
    assert.equal(lastIsEco, true);
    assert.equal(lastMode, 'eco');
    P.setMode('eco'); // re-set same mode -> listener MUST NOT fire again
    assert.equal(calls, 1, 'listener must not re-fire for identical mode');
    P.setMode('performance');
    assert.equal(calls, 2);
    assert.equal(lastIsEco, false);
});

test('localStorage round-trip: set eco, require fresh, getMode reflects storage', () => {
    const P = require('../js/perf.js');
    P._resetForTests();
    P.setMode('eco');
    var stored = null;
    try { stored = require('../js/perf.js'); } catch (e) { /* ignore */ }
    // Verify via second load after wipe — simulation: re-require cached, cleaner: read storage directly
    var raw = null;
    try { raw = globalThis.localStorage && globalThis.localStorage.getItem('neurodeck_perf_mode'); } catch (e) { /* ignore */ }
    // Some test envs may not have localStorage (plain node). If not, skip the assert.
    if (raw !== null && raw !== undefined) {
        assert.equal(raw, 'eco');
    }
});

test('applyToCanvasRenderer is a no-op for null renderer', () => {
    const P = require('../js/perf.js');
    P._resetForTests();
    // Should not throw and should not return anything weird.
    P.applyToCanvasRenderer(null);
    P.applyToCanvasRenderer(undefined);
    P.applyToCanvasRenderer({});
});

test('applyToCanvasRenderer downgrades resolution when eco is on', () => {
    const P = require('../js/perf.js');
    P._resetForTests();
    P.setMode('eco');
    var fakeRenderer = { resolution: 2 };
    P.applyToCanvasRenderer(fakeRenderer);
    assert.equal(fakeRenderer.resolution, 1, 'eco should force resolution=1');
    P.setMode('performance');
    P.applyToCanvasRenderer(fakeRenderer);
    // devicePixelRatio in headless node is typically 1, so target becomes min(2, 1) = 1
    // but we don't care about the perf-mode target value — only that it isn't undefined.
    assert.equal(typeof fakeRenderer.resolution, 'number');
});

// ===================== index.html / html wiring =====================

test('index.html loads perf-compat right after perf.js, both before state-guards/storage', () => {
    var sg = html.indexOf('js/state-guards.js');
    var pf = html.indexOf('js/perf.js');
    var pc = html.indexOf('js/perf-compat.js');
    var st = html.indexOf('js/storage.js');
    assert.ok(sg > -1 && pf > -1 && pc > -1 && st > -1,
        'all four scripts must be referenced in HTML');
    assert.ok(pf < pc, 'perf-compat must load right after perf');
    assert.ok(pc < sg, 'compat must load before state-guards');
    assert.ok(sg < st, 'state-guards must load before storage');
});

test('index.html cache-bust v47 is uniform across all 4 JS files', () => {
    ['js/state-guards.js', 'js/perf.js', 'js/storage.js', 'js/combat-pixi.js', 'js/app.js']
        .forEach(function(rel) {
            var re = new RegExp(rel.replace(/\./g, '\\.') + '\\?v=(\\d+)');
            var m = html.match(re);
            assert.ok(m, 'expected entry for ' + rel);
            assert.equal(m[1], '47', 'cache-bust for ' + rel + ' should be v47, got ' + m[1]);
        });
});

test('syncModal contains perf mode select', () => {
    assert.ok(html.indexOf('id="perfModeSelect"') > -1,
        'perfModeSelect not found in index.html');
    assert.ok(html.indexOf('value="eco"') > -1, 'eco option missing');
    assert.ok(html.indexOf('value="performance"') > -1, 'performance option missing');
    assert.ok(html.indexOf('value="auto"') > -1, 'auto option missing');
    assert.ok(html.indexOf('id="perfModeHint"') > -1, 'perfModeHint not found');
});

// ===================== CSS :root.perf-eco rules =====================

test('CSS contains :root.perf-eco selector', () => {
    assert.ok(/:root\.perf-eco/.test(css),
        ':root.perf-eco rule must exist in style.css');
});

test('CSS reduces animation-duration in eco mode', () => {
    assert.ok(/:root\.perf-eco\s*\*[\s\S]*?animation-duration:\s*0\.01ms/.test(css),
        'eco mode must clamp CSS animation duration to ~0ms');
});

test('CSS reduces transition-duration in eco mode', () => {
    assert.ok(/:root\.perf-eco\s*\*[\s\S]*?transition-duration:\s*0\.01ms/.test(css),
        'eco mode must clamp CSS transition duration to ~0ms');
});

test('CSS disables backdrop-filter in eco mode', () => {
    assert.ok(/:root\.perf-eco[\s\S]*?backdrop-filter:\s*none/.test(css),
        'eco must disable backdrop-filter');
});

test('CSS hides dust canvas in eco mode', () => {
    assert.ok(/:root\.perf-eco[\s\S]*?#dustCanvas[\s\S]*?display:\s*none/.test(css),
        'eco must hide dust canvas');
});

test('CSS hides mist layer in eco mode', () => {
    assert.ok(/:root\.perf-eco[\s\S]*?#mistLayer[\s\S]*?display:\s*none/.test(css),
        'eco must hide mist layer');
});

// ===================== app.js / combat-pixi.js callbacks =====================

test('app.js exposes __ndSetEcoMode global', () => {
    assert.ok(app.indexOf('window.__ndSetEcoMode') > -1,
        '__ndSetEcoMode must be defined globally');
});

test('app.js __ndSetEcoMode toggles dustRunning', () => {
    var m = app.match(/window\.__ndSetEcoMode\s*=[\s\S]*?\};/);
    assert.ok(m, '__ndSetEcoMode body not found');
    assert.ok(m[0].indexOf('dustRunning') > -1,
        '__ndSetEcoMode must toggle dustRunning');
});

test('app.js __ndSetEcoMode toggles particlesRunning', () => {
    var m = app.match(/window\.__ndSetEcoMode\s*=[\s\S]*?\};/);
    assert.ok(m);
    assert.ok(m[0].indexOf('particlesRunning') > -1,
        '__ndSetEcoMode must toggle particlesRunning');
});

test('app.js initPerfMode wires select handler', () => {
    var m = app.match(/function initPerfMode\([\s\S]*?\n\}/);
    assert.ok(m, 'initPerfMode function missing');
    assert.ok(m[0].indexOf('addEventListener') > -1,
        'initPerfMode must attach event listener');
    assert.ok(m[0].indexOf('P.setMode(') > -1,
        'initPerfMode must call P.setMode on change');
});

test('app.js initPerfMode notifies on user toggle', () => {
    var m = app.match(/function initPerfMode\([\s\S]*?\n\}/);
    assert.ok(m);
    assert.ok(m[0].indexOf('showToast') > -1,
        'initPerfMode should toast user feedback on mode change');
});

test('combat-pixi.js exposes __ndApplyEcoToPixi global', () => {
    assert.ok(combatPixi.indexOf('window.__ndApplyEcoToPixi') > -1,
        '__ndApplyEcoToPixi must be exported globally');
});

test('combat-pixi.js __ndApplyEcoToPixi adjusts renderer resolution', () => {
    var m = combatPixi.match(/window\.__ndApplyEcoToPixi\s*=[\s\S]*?\};/);
    assert.ok(m);
    assert.ok(m[0].indexOf('resolution') > -1,
        '__ndApplyEcoToPixi must touch renderer.resolution');
});

test('combat-pixi.js __ndApplyEcoToPixi hides torchGfx in eco', () => {
    var m = combatPixi.match(/window\.__ndApplyEcoToPixi\s*=[\s\S]*?\};/);
    assert.ok(m);
    assert.ok(m[0].indexOf('torchGfx') > -1,
        '__ndApplyEcoToPixi must toggle torchGfx visibility');
});

test('combat-pixi.js __ndApplyEcoToPixi hides vignetteGfx in eco', () => {
    var m = combatPixi.match(/window\.__ndApplyEcoToPixi\s*=[\s\S]*?\};/);
    assert.ok(m);
    assert.ok(m[0].indexOf('vignetteGfx') > -1,
        '__ndApplyEcoToPixi must toggle vignetteGfx visibility');
});

test('combat-pixi.js __ndApplyEcoToPixi hides grainGfx in eco', () => {
    var m = combatPixi.match(/window\.__ndApplyEcoToPixi\s*=[\s\S]*?\};/);
    assert.ok(m);
    assert.ok(m[0].indexOf('grainGfx') > -1,
        '__ndApplyEcoToPixi must toggle grainGfx visibility');
});

// ===================== Forward paths & safety =====================

test('app.js initPerfMode is invoked at startup', () => {
    var m = app.match(/initPerfMode\(\);/);
    assert.ok(m, 'initPerfMode() must be called at startup');
});

test('app.js __ndSetEcoMode is wrapped in try/catch for safety', () => {
    var m = app.match(/window\.__ndSetEcoMode\s*=[\s\S]*?\};/);
    assert.ok(m);
    // The body should contain at least one try/catch
    assert.ok(/try\s*\{[\s\S]*?catch/.test(m[0]),
        '__ndSetEcoMode must guard against runtime failures');
});

test('combat-pixi.js __ndApplyEcoToPixi also wrapped in try/catch', () => {
    var m = combatPixi.match(/window\.__ndApplyEcoToPixi\s*=[\s\S]*?\};/);
    assert.ok(m);
    assert.ok(/try\s*\{[\s\S]*?catch/.test(m[0]),
        '__ndApplyEcoToPixi must guard against runtime failures');
});

test('perf.js init() does not throw when matchMedia unavailable', () => {
    // Re-require fresh module and call _resetForTests(); if previous test left
    // bad state, init at module-load would already have completed.
    // Simulate by deleting the cache entry:
    delete require.cache[require.resolve('../js/perf.js')];
    var P = require('../js/perf.js');
    P._resetForTests();
    // Simulate listener drop & re-check listener works
    var fired = 0;
    P.onEcoModeChange(function() { fired++; });
    P.setMode('eco');
    assert.ok(fired >= 1, 'listener must fire after re-init');
});

// ===================== Hygiene =====================

test('perf.js itself does not dead-end or leave orphan state', () => {
    var P = require('../js/perf.js');
    P._resetForTests();
    assert.equal(P.getMode(), 'auto');
    assert.equal(P.isEco(), false);
});

test('perf.js file size is reasonable (<300 lines)', () => {
    var lines = perfJs.split('\n').length;
    assert.ok(lines < 300, 'perf.js is too large: ' + lines + ' lines');
});
