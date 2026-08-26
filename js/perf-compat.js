/**
 * NeuroDeck Perf Legacy Compat
 * ----------------------------
 * Старый API эко-режима (Crucible-порт) поверх нового Performance Controller.
 * Грузится сразу после js/perf.js. Держит perf.js компактным (<300 строк):
 * весь легаси-слой живёт здесь и расширяет публичный объект NeuroDeckPerf.
 */
(function(root) {
  'use strict';
  var P = root.NeuroDeckPerf;
  if (!P) return;

  var _legacy = [];
  var _last = null;

  function computeEco() {
    var mode = P.getMode();
    return mode === 'eco' || mode === 'low' || mode === 'effects-off' || (mode === 'auto' && P.prefersReducedMotion());
  }

  P.isEco = function () { return computeEco(); };

  P.onEcoModeChange = function (fn) {
    if (typeof fn === 'function') _legacy.push(fn);
  };

  P.applyToCanvasRenderer = function (renderer) {
    if (!renderer) return;
    try {
      var target = computeEco() ? 1 : Math.min(2, root.devicePixelRatio || 1);
      if (typeof renderer.resolution === 'number') renderer.resolution = target;
    } catch (e) {}
  };

  var _nativeReset = P._resetForTests;
  P._resetForTests = function () {
    _nativeReset();
    _legacy.length = 0;
    _last = computeEco();
    P.onChange(_bridge); // нативный сброс чистит _changeHandlers — переподписываем мост
  };

  // Базлайн фиксируется при загрузке: подписчики получают только переходы.
  _last = computeEco();
  P.onChange(_bridge);
  function _bridge(status) {
    var eco = status.isLowEffect || status.mode === 'eco';
    if (_last === null) { _last = eco; return; }
    if (eco === _last) return;
    _last = eco;
    for (var i = 0; i < _legacy.length; i++) {
      try { _legacy[i](eco, status.mode); } catch (e) {}
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
