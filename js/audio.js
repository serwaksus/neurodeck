(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else { root.NeuroDeckAudio = factory(); root.NDAudio = root.NeuroDeckAudio; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    // P21: аудио-микшер. Категории master/music/ui/siege/reward; громкости и мьюты живут в
    // localStorage (ключ LS_KEY, формат {v:1,<cat>:{vol,muted}}) — ВНЕ сейва, схему не трогаем.
    // Правило 20: никакого автозапуска до первого взаимодействия — AudioContext создаётся ТОЛЬКО
    // внутри unlock() (одноразовые слушатели click/keydown/touchstart), tone() до unlock молчит;
    // музыка по умолчанию выключена (muted), SFX-категории по умолчанию тихие (эфф. громкость =
    // vol тона × vol категории × master ≈ 0.25 от прежней).
    var LS_KEY = 'neurodeck_audio';
    var LS_VER = 1;
    var CATS = ['master', 'music', 'ui', 'siege', 'reward'];
    var DEFAULTS = {
        master: { vol: 0.5, muted: false },
        music:  { vol: 0.5, muted: true  }, // правило 20: музыка выключена по умолчанию
        ui:     { vol: 0.5, muted: false },
        siege:  { vol: 0.5, muted: false },
        reward: { vol: 0.6, muted: false }
    };
    var VOL_STEPS = 20; // слайдер 0..100 с шагом 5 → 20 шагов; квант через /20 держит точные 0.05/0.1/…/1

    // sanitize: любые данные (null/битый JSON/чужие ключи/вне диапазона) → мешем с дефолтами.
    // vol квантуется к 1/20, чтобы localStorage не обрастал 0.30000000000000004.
    function quant(v) { return Math.round(Math.max(0, Math.min(1, v)) * VOL_STEPS) / VOL_STEPS; }
    function sanitize(raw) {
        var src = raw && typeof raw === 'object' ? raw : {};
        var out = {};
        for (var i = 0; i < CATS.length; i++) {
            var c = CATS[i], d = DEFAULTS[c], r = src[c] && typeof src[c] === 'object' ? src[c] : null;
            out[c] = {
                vol: r && isFinite(+r.vol) ? quant(+r.vol) : d.vol,
                muted: r && typeof r.muted === 'boolean' ? r.muted : d.muted
            };
        }
        return out;
    }

    var state = sanitize(null);
    var _unlocked = false;      // было ли первое взаимодействие (правило 20)
    var _unlockBound = false;
    var _ctx = null;            // AudioContext (лениво, только из unlock/тона после unlock)
    var _masterGain = null;
    var _catGain = {};          // cat → GainNode → _masterGain → destination

    function ls() {
        try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
    }

    function load() {
        var box = ls();
        if (box) {
            try { state = sanitize(JSON.parse(box.getItem(LS_KEY) || 'null')); }
            catch (e) { state = sanitize(null); }
        }
        applyGains();
        return state;
    }

    function save() {
        var box = ls();
        if (!box) return;
        var dump = { v: LS_VER };
        for (var i = 0; i < CATS.length; i++) dump[CATS[i]] = state[CATS[i]];
        try { box.setItem(LS_KEY, JSON.stringify(dump)); } catch (e) {}
    }

    function ensureCtx() {
        if (_ctx) return _ctx;
        try {
            var AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
            if (!AC) return null;
            _ctx = new AC();
            _masterGain = _ctx.createGain();
            _masterGain.connect(_ctx.destination);
            applyGains();
        } catch (e) { _ctx = null; }
        return _ctx;
    }

    function catNode(ctx, cat) {
        if (_catGain[cat]) return _catGain[cat];
        var g = ctx.createGain();
        g.connect(_masterGain);
        _catGain[cat] = g;
        applyGains();
        return g;
    }

    // Громкости узлов синхронны с state (setVol/setMuted меняют и state, и живые GainNode).
    function applyGains() {
        if (_masterGain && _ctx) {
            _masterGain.gain.value = state.master.muted ? 0 : state.master.vol;
            for (var cat in _catGain) {
                if (!_catGain.hasOwnProperty(cat) || !state[cat]) continue;
                _catGain[cat].gain.value = state[cat].muted ? 0 : state[cat].vol;
            }
        }
    }

    function unlock() {
        _unlocked = true;
        var ctx = ensureCtx();
        if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    }

    function attachUnlock() {
        if (_unlockBound || typeof document === 'undefined' || !document.addEventListener) return;
        _unlockBound = true;
        ['click', 'keydown', 'touchstart'].forEach(function(ev) {
            try { document.addEventListener(ev, unlock, { once: true, passive: true, capture: true }); } catch (e) {}
        });
    }

    // Эффективный множитель категории (чистая функция от state — тестится без WebAudio).
    function mix(cat) {
        if (!state[cat] || !state.master) return 0;
        if (state[cat].muted || state.master.muted) return 0;
        return state[cat].vol * state.master.vol;
    }

    function tone(cat, freq, duration, type, vol, slide) {
        if (!_unlocked) return; // правило 20: тишина до первого взаимодействия
        if (!state[cat]) cat = 'ui';
        if (mix(cat) <= 0) return; // мьют/нулевая громкость — даже не строим граф
        var ctx = ensureCtx();
        if (!ctx) return;
        try {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = type || 'square';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            if (slide) osc.frequency.linearRampToValueAtTime(slide, ctx.currentTime + duration);
            gain.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(catNode(ctx, cat));
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch (e) {}
    }

    attachUnlock();
    load();

    return {
        CATS: CATS.slice(),
        LS_KEY: LS_KEY,
        DEFAULTS: DEFAULTS,
        // состояние (копия для чтения UI/тестами)
        get: function(cat) { return cat ? state[cat] : state; },
        unlocked: function() { return _unlocked; },
        mix: mix,
        load: load,
        setVol: function(cat, v) {
            if (!state[cat] || !isFinite(+v)) return false;
            state[cat].vol = quant(+v);
            applyGains(); save();
            return true;
        },
        setMuted: function(cat, m) {
            if (!state[cat]) return false;
            state[cat].muted = !!m;
            applyGains(); save();
            return true;
        },
        toggleMute: function(cat) {
            if (!state[cat]) return null;
            state[cat].muted = !state[cat].muted;
            applyGains(); save();
            return state[cat].muted;
        },
        reset: function() {
            state = sanitize(null);
            applyGains(); save();
            return state;
        },
        tone: tone,
        // прод-код не зовёт unlock вручную (только слушатели); expose для e2e/отладки
        unlock: unlock
    };
});
