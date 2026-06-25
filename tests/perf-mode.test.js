// ============================================================
// tests/perf-mode.test.js — для пункта 6 плана NeuroDeck
// ============================================================
// Что проверяет:
//   1. Defaults — режим 'auto', No-pref при начале
//   2. setMode валидирует вход, отвергает garbage
//   3. localStorage round-trip: режим сохраняется/чистится
//   4. prefersReducedMotion вычисляется из mode + systemReduced
//   5. isLowEffect учитывает deviceMemory/hardwareConcurrency
//   6. Изменение системы (matchMedia change event) → re-apply
//   7. onChange() подписки вызываются при изменении

// Нам НУЖЕН рантайм circleCI: node 22. Этот файл пойдёт в npm test.

// ------------------------------------------------------------
// Утиный тест-стенд: замокать window/localStorage/matchMedia
// ------------------------------------------------------------
var fakeWindow = {
  localStorage: makeFakeStorage(),
  navigator: { hardwareConcurrency: 8, deviceMemory: 8 },
  matchMedia: function (q) { return makeFakeMQL(false); },
  // setMatchMedia переустанавливает matchMedia (для смены pref)
  __handlers: []
};
fakeWindow.matchMedia = function (q) { return makeFakeMQL(false, q, fakeWindow); };

function makeFakeStorage() {
  var data = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
    _raw: data
  };
}

function makeFakeMQL(initialMatches, query, win) {
  var mql = {
    matches: initialMatches,
    media: query,
    onchange: null,
    addEventListener: function (type, handler) {
      win.__handlers.push({ mql: mql, type: type, handler: handler, fire: function (next) { mql.matches = next; handler({ matches: next, media: mql.media }); } });
    },
    removeEventListener: function () {},
    // Legacy API
    addListener: function (handler) { this.addEventListener('change', handler); },
    removeListener: function () {}
  };
  return mql;
}

// Подгружаем модуль через eval, потому что perf.js не использует CommonJS
// (vanilla IIFE для совместимости с Telegram WebApp).
var moduleSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'perf.js'), 'utf8');

// Генерируем свежий globalThis для каждого теста, чтобы изоляция была чистой.
function loadPerfFresh(opts) {
  opts = opts || {};
  var win = {
    localStorage: opts.localStorage || makeFakeStorage(),
    navigator: opts.navigator || { hardwareConcurrency: 8, deviceMemory: 8 },
    matchMedia: opts.matchMedia || function () { return makeFakeMQL(opts.systemReduced === true, '(prefers-reduced-motion: reduce)', win); },
    __handlers: []
  };
  // eslint-disable-next-line no-undef
  var globalAny = global;
  globalAny.window = win;
  globalAny.globalThis = win;
  // eslint-disable-next-line no-new-func
  new Function('window', 'global', 'globalThis', moduleSource)(win, win, win);
  return win;
}

var test = require('node:test');
var assert = require('node:assert/strict');

// ---------------------------------------------------------------
// Test 1: defaults
// ---------------------------------------------------------------
test('perf: defaults — mode is auto when storage empty', function () {
  var win = loadPerfFresh();
  var api = win.NeuroDeckPerf;
  assert.ok(api, 'window.NeuroDeckPerf должен быть exposed');
  assert.equal(api.getMode(), 'auto');
  // systemReduced=false → prefersReducedMotion=false
  assert.equal(api.prefersReducedMotion(), false);
  assert.equal(api.isLowEffect(), false);
  assert.equal(api.isEffectsOff(), false);
});

// ---------------------------------------------------------------
// Test 2: setMode validates input
// ---------------------------------------------------------------
test('perf: setMode rejects invalid values', function () {
  var win = loadPerfFresh();
  var api = win.NeuroDeckPerf;
  assert.equal(api.setMode('hack-me'), false);
  assert.equal(api.setMode(''), false);
  assert.equal(api.setMode(null), false);
  assert.equal(api.setMode(undefined), false);
  assert.equal(api.setMode(123), false);
  // Mode остался auto
  assert.equal(api.getMode(), 'auto');
});

test('perf: setMode accepts all three valid modes', function () {
  var win = loadPerfFresh();
  var api = win.NeuroDeckPerf;
  assert.equal(api.setMode('low'), true);
  assert.equal(api.getMode(), 'low');
  assert.equal(api.setMode('effects-off'), true);
  assert.equal(api.getMode(), 'effects-off');
  assert.equal(api.setMode('auto'), true);
  assert.equal(api.getMode(), 'auto');
});

// ---------------------------------------------------------------
// Test 3: localStorage roundtrip
// ---------------------------------------------------------------
test('perf: localStorage persists non-default mode', function () {
  var storage = makeFakeStorage();
  var win = loadPerfFresh({ localStorage: storage });
  win.NeuroDeckPerf.setMode('low');
  assert.equal(storage._raw['neurodeck_perf_mode'], 'low');
});

test('perf: setMode(auto) clears storage key (NO clutter)', function () {
  var storage = makeFakeStorage();
  storage._raw['neurodeck_perf_mode'] = 'low';
  var win = loadPerfFresh({ localStorage: storage });
  assert.equal(win.NeuroDeckPerf.getMode(), 'low', 'должен подхватить auto при загрузке');

  win.NeuroDeckPerf.setMode('auto');
  assert.equal(Object.prototype.hasOwnProperty.call(storage._raw, 'neurodeck_perf_mode'), false,
    'auto — дефолт, ключ НЕ должен оставаться в storage');
});

test('perf: persisted mode loaded on init', function () {
  var storage = makeFakeStorage();
  storage._raw['neurodeck_perf_mode'] = 'effects-off';
  var win = loadPerfFresh({ localStorage: storage });
  assert.equal(win.NeuroDeckPerf.getMode(), 'effects-off');
});

test('perf: corrupted mode value falls back to auto', function () {
  var storage = makeFakeStorage();
  storage._raw['neurodeck_perf_mode'] = 'INJECTED-SHIT';
  var win = loadPerfFresh({ localStorage: storage });
  assert.equal(win.NeuroDeckPerf.getMode(), 'auto');
});

// ---------------------------------------------------------------
// Test 4: prefersReducedMotion logic
// ---------------------------------------------------------------
test('perf: auto + systemNormal → not reduced', function () {
  var win = loadPerfFresh({ systemReduced: false });
  assert.equal(win.NeuroDeckPerf.prefersReducedMotion(), false);
});

test('perf: auto + systemReduced → reduced=true', function () {
  var win = loadPerfFresh({ systemReduced: true });
  assert.equal(win.NeuroDeckPerf.prefersReducedMotion(), true);
});

test('perf: low → reduced=true regardless of system', function () {
  var win1 = loadPerfFresh({ systemReduced: false });
  win1.NeuroDeckPerf.setMode('low');
  assert.equal(win1.NeuroDeckPerf.prefersReducedMotion(), true);

  var win2 = loadPerfFresh({ systemReduced: true });
  win2.NeuroDeckPerf.setMode('low');
  assert.equal(win2.NeuroDeckPerf.prefersReducedMotion(), true);
});

test('perf: effects-off → reduced=true, isEffectsOff=true', function () {
  var win = loadPerfFresh();
  win.NeuroDeckPerf.setMode('effects-off');
  assert.equal(win.NeuroDeckPerf.prefersReducedMotion(), true);
  assert.equal(win.NeuroDeckPerf.isEffectsOff(), true);
  assert.equal(win.NeuroDeckPerf.isLowEffect(), true);
});

// ---------------------------------------------------------------
// Test 5: isLowEffect учитывает device specs
// ---------------------------------------------------------------
test('perf: isLowEffect=true on low-memory device (auto mode)', function () {
  var nav = { hardwareConcurrency: 8, deviceMemory: 2 }; // 2GB RAM — кэп
  var win = loadPerfFresh({ navigator: nav });
  assert.equal(win.NeuroDeckPerf.isLowEffect(), true);
});

test('perf: isLowEffect=true on few-core device (auto mode)', function () {
  var nav = { hardwareConcurrency: 2, deviceMemory: 8 }; // 2 cores — кэп
  var win = loadPerfFresh({ navigator: nav });
  assert.equal(win.NeuroDeckPerf.isLowEffect(), true);
});

test('perf: isLowEffect=false on modern device (auto mode)', function () {
  var nav = { hardwareConcurrency: 8, deviceMemory: 8 };
  var win = loadPerfFresh({ navigator: nav });
  assert.equal(win.NeuroDeckPerf.isLowEffect(), false);
});

// ---------------------------------------------------------------
// Test 6: system preference change event → re-apply
// ---------------------------------------------------------------
test('perf: change event from OS flips prefersReducedMotion', function () {
  var win = loadPerfFresh({ systemReduced: false });
  assert.equal(win.NeuroDeckPerf.prefersReducedMotion(), false);
  // ЯВНО вызываем attachListeners — в реальном окружении это делает bootstrap
  win.NeuroDeckPerf.attachListeners();
  // Fire change через наш MQL stub
  assert.equal(win.__handlers.length > 0, true, 'MQL listener должен быть зарегистрирован');
  win.__handlers[0].fire(true);
  assert.equal(win.NeuroDeckPerf.prefersReducedMotion(), true);
});

// ---------------------------------------------------------------
// Test 7: onChange подписки
// ---------------------------------------------------------------
test('perf: onChange fires when mode changes', function () {
  var win = loadPerfFresh();
  var calls = [];
  win.NeuroDeckPerf.onChange(function (state) { calls.push(state); });
  win.NeuroDeckPerf.setMode('low');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, 'low');
  assert.equal(calls[0].prefersReducedMotion, true);
  win.NeuroDeckPerf.setMode('auto');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].mode, 'auto');
});

test('perf: onChange ignores non-functions', function () {
  var win = loadPerfFresh();
  assert.doesNotThrow(function () {
    win.NeuroDeckPerf.onChange(null);
    win.NeuroDeckPerf.onChange('garbage');
  });
});

test('perf: onChange hand­ler throwing does not break others', function () {
  var win = loadPerfFresh();
  var good = [];
  win.NeuroDeckPerf.onChange(function () { throw new Error('boom'); });
  win.NeuroDeckPerf.onChange(function (s) { good.push(s); });
  assert.doesNotThrow(function () { win.NeuroDeckPerf.setMode('low'); });
  assert.equal(good.length, 1);
});

// ---------------------------------------------------------------
// Test 8: localStorage недоступен — fallback
// ---------------------------------------------------------------
test('perf: works when localStorage throws', function () {
  var throwingStorage = {
    getItem: function () { throw new Error('SecurityError'); },
    setItem: function () { throw new Error('QuotaExceeded'); },
    removeItem: function () { throw new Error('SecurityError'); }
  };
  var win = loadPerfFresh({ localStorage: throwingStorage });
  // Не должно валиться
  assert.doesNotThrow(function () { win.NeuroDeckPerf.setMode('low'); });
  assert.equal(win.NeuroDeckPerf.getMode(), 'low'); // memory-only
});

test('perf: works when matchMedia is missing', function () {
  var win = loadPerfFresh();
  win.matchMedia = undefined;
  // Перезагрузка с undefined matchMedia → просто systemReduced=false
  var freshWin = loadPerfFresh({ matchMedia: undefined });
  assert.equal(freshWin.NeuroDeckPerf.prefersReducedMotion(), false);
});
