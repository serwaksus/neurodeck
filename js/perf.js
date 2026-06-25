/**
 * NeuroDeck Performance Controller
 * -------------------------------
 * Модуль чтения и применения двух ортогональных режимов:
 *
 *  - prefers-reduced-motion (CSS media query): автоматически из ОС/браузера.
 *    При reduce — отключаем анимации, screen-shake, hit-stop, частицы-trail,
 *    но НЕ боевой UX (меч всё равно машет — ток быстрее).
 *
 *  - Performance Mode (localStorage): пользовательский переключатель.
 *    'auto'  — следуем prefers-reduced-motion + auto-detect по deviceMemory
 *    'low'   — экономия: меньше частиц, без PixiJS фильтров, mute sfx
 *    'effects-off' — то же что 'low' + все bloom/grain/chromatic-aberration
 *
 * Public API (window.NeuroDeckPerf):
 *   getMode(): 'auto'|'low'|'effects-off'
 *   setMode(mode): void
 *   prefersReducedMotion(): boolean (computed: depends on (auto+OS) | low | off)
 *   isLowEffect(): boolean (computed: prefersReducedMotion OR mode=low)
 *   isEffectsOff(): boolean (computed: effects-off режим включен всегда)
 *   attachListeners(): применить CSS-классы к body, emit 'change'
 *
 * State:
 *   localStorage['neurodeck_perf_mode'] = 'auto' (default) | 'low' | 'effects-off'
 *
 * Зависимости — никаких (vanilla JS, без npm). Совместим с Telegram WebApp и без.
 *
 * Версия: 1.0 / кэш-bump 45 (для проекта NeuroDeck)
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'neurodeck_perf_mode';
  var VALID_MODES = ['auto', 'low', 'effects-off'];
  var DEFAULT_MODE = 'auto';

  // ---- State ---------------------------------------------------------
  var _mode = DEFAULT_MODE;
  var _systemReduced = false;
  var _listenersAttached = false;
  var _mql = null; // MediaQueryList для reduced-motion
  var _changeHandlers = [];

  // ---- Storage -------------------------------------------------------
  function _loadMode() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_MODE;
      if (VALID_MODES.indexOf(raw) === -1) return DEFAULT_MODE;
      return raw;
    } catch (e) {
      // localStorage недоступен (приватный режим, Safari ITP) — fallback
      return DEFAULT_MODE;
    }
  }

  function _saveMode(mode) {
    try {
      if (!root.localStorage) return;
      if (mode === DEFAULT_MODE) {
        root.localStorage.removeItem(STORAGE_KEY);
      } else {
        root.localStorage.setItem(STORAGE_KEY, mode);
      }
    } catch (e) {
      // Тихий fallback — не критично, режим только в оперативной памяти
    }
  }

  function _detectSystemPref() {
    if (typeof root.matchMedia !== 'function') return false;
    try {
      _mql = root.matchMedia('(prefers-reduced-motion: reduce)');
      _systemReduced = !!_mql.matches;
      return _systemReduced;
    } catch (e) {
      return false;
    }
  }

  function _detectLowSpec() {
    // deviceMemory доступен только в браузерах на Chromium (некоторые WebView Telegram работают)
    // Возвращаем true если устройство явно слабое
    try {
      var cores = root.navigator && root.navigator.hardwareConcurrency;
      var mem = root.navigator && root.navigator.deviceMemory;
      // Телефон 2018 года: 4 ядра, <2 GB → фоллбек
      if (typeof mem === 'number' && mem > 0 && mem < 4) return true;
      if (typeof cores === 'number' && cores > 0 && cores < 4) return true;
    } catch (e) {
      // нет доступа — не предполагаем
    }
    return false;
  }

  // ---- API -----------------------------------------------------------
  function getMode() {
    return _mode;
  }

  function setMode(mode) {
    if (VALID_MODES.indexOf(mode) === -1) return false;
    if (mode === _mode) return true;
    _mode = mode;
    _saveMode(mode);
    _applyBodyClasses();
    _emitChange();
    return true;
  }

  /**
   * Возвращает true если:
   *  - mode = 'low' или 'effects-off' ИЛИ
   *  - mode = 'auto' И _systemReduced = true (ОС сигналит reduce)
   *
   * Это «исходник истины» для всех модулей: PixiJS combat, Particles, CSS, audio.
   * Если true → отключаем анимации переходов, hit-stop, screenShake, particle trails,
   * bloom/grain/chromatic, fx homo. Сохраняем: damage numbers, HP bars, базовые tweens.
   */
  function prefersReducedMotion() {
    if (_mode === 'low' || _mode === 'effects-off') return true;
    if (_mode === 'auto' && _systemReduced) return true;
    return false;
  }

  function isLowEffect() {
    // 'low' или 'effects-off' ИЛИ auto+reduce → низкие эффекты для производительности
    if (_mode === 'low' || _mode === 'effects-off') return true;
    if (_mode === 'auto') {
      // Если устройство слабое, автоматически экономим
      var lowSpec = _detectLowSpec();
      if (lowSpec) return true;
      if (_systemReduced) return true;
    }
    return false;
  }

  function isEffectsOff() {
    // Полное отключение эффектов — только если пользователь явно выбрал
    return _mode === 'effects-off';
  }

  // Кэш: closure-captured функция (стрелка во избежание this-проблем)
  var _applyBodyClasses = function () {
    if (typeof document === 'undefined') return;
    var body = document.body;
    if (!body) return;
    body.classList.toggle('reduced-motion', prefersReducedMotion());
    body.classList.toggle('low-effect', isLowEffect());
    body.classList.toggle('effects-off', isEffectsOff());
    // mode-* для удобства отладки
    body.setAttribute('data-perf-mode', _mode);
  };

  function attachListeners() {
    if (_listenersAttached) return;
    _listenersAttached = true;

    // Подписаться на изменение системной настройки reduced-motion
    if (_mql && typeof _mql.addEventListener === 'function') {
      _mql.addEventListener('change', function (e) {
        _systemReduced = !!e.matches;
        _applyBodyClasses();
        _emitChange();
      });
    } else if (_mql && typeof _mql.addListener === 'function') {
      // Safari < 14 / старые WebView
      _mql.addListener(function (e) {
        _systemReduced = !!e.matches;
        _applyBodyClasses();
        _emitChange();
      });
    }

    _applyBodyClasses();
  }

  function onChange(handler) {
    if (typeof handler === 'function') {
      _changeHandlers.push(handler);
    }
  }

  function _emitChange() {
    for (var i = 0; i < _changeHandlers.length; i++) {
      try {
        _changeHandlers[i]({
          mode: _mode,
          prefersReducedMotion: prefersReducedMotion(),
          isLowEffect: isLowEffect(),
          isEffectsOff: isEffectsOff()
        });
      } catch (e) {
        // не валимся на одном битом слушателе
      }
    }
  }

  // ---- Bootstrap -----------------------------------------------------
  _mode = _loadMode();
  _detectSystemPref();

  // Авто-attach при DOMContentLoaded — без этого MQL-handlers не работают
  // (matchMedia change events не доходят, OS-настройки игнорируются).
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachListeners, { once: true });
    } else {
      // DOM уже готов (наш script после DOMContentLoaded) — запуститься сразу
      // но если body ещё нет, делаем это безопасным rAF
      if (document.body) attachListeners();
      else {
        var _attachAfterBody = function () {
          if (document.body) attachListeners();
          else setTimeout(_attachAfterBody, 10);
        };
        _attachAfterBody();
      }
    }
  }

  // Экспонируем API рано — до DOMContentLoaded — чтобы модули могли спросить
  // «применять ли мне эффекты?» уже во время загрузки.
  root.NeuroDeckPerf = {
    getMode: getMode,
    setMode: setMode,
    prefersReducedMotion: prefersReducedMotion,
    isLowEffect: isLowEffect,
    isEffectsOff: isEffectsOff,
    attachListeners: attachListeners,
    onChange: onChange,
    // Полезно для тестов: получить raw состояние системы
    _state: function () {
      return {
        mode: _mode,
        systemReduced: _systemReduced,
        storageKey: STORAGE_KEY,
        defaultMode: DEFAULT_MODE,
        validModes: VALID_MODES.slice()
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
