const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// P21: аудио-микшер (js/audio.js, глобаль NDAudio). Контракты:
// - категории master/music/ui/siege/reward; громкости/мьюты в localStorage (neurodeck_audio),
//   НЕ в сейве (storage.js не трогаем, схема v13 без изменений);
// - правило 20: никакого автозапуска до первого взаимодействия (tone() молчит до unlock,
//   unlock вешается одноразовыми слушателями), музыка по умолчанию выключена, SFX тихие;
// - существующие тоны app.js разнесены по категориям: ui (sfxHit/sfxForge/sfxEquip/sfxError),
//   siege (sfxFail), reward (sfxCrit/sfxRankUp/sfxLevelUp/sfxGoalComplete/sfxBossDefeated).

const root = path.join(__dirname, '..');
const AUDIO_PATH = path.join(root, 'js', 'audio.js');

function mkLS(seed) {
    const m = Object.assign({}, seed || {});
    return {
        getItem: (k) => (k in m ? m[k] : null),
        setItem: (k, v) => { m[k] = String(v); },
        removeItem: (k) => { delete m[k]; },
        _dump: () => m
    };
}

// Свежий инстанс UMD-фабрики с подсунутым localStorage (паттерн state-store: снести кэш require).
function freshA(seed) {
    delete require.cache[require.resolve(AUDIO_PATH)];
    globalThis.localStorage = mkLS(seed);
    return require(AUDIO_PATH);
}

const appSrc = () => fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const audioSrc = () => fs.readFileSync(AUDIO_PATH, 'utf8');
const htmlSrc = () => fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const swSrc = () => fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('P21 дефолты по правилу 20: музыка выключена, SFX тихо, без сохранённого состояния', () => {
    const A = freshA();
    assert.deepEqual(A.CATS, ['master', 'music', 'ui', 'siege', 'reward'], 'ровно 5 категорий');
    assert.equal(A.get('music').muted, true, 'музыка muted по умолчанию (правило 20)');
    for (const c of ['master', 'ui', 'siege', 'reward']) {
        assert.equal(A.get(c).muted, false, c + ' не замьючен по умолчанию');
        assert.ok(A.get(c).vol > 0 && A.get(c).vol <= 0.6, c + ' тихая громкость по умолчанию (≤0.6)');
    }
    assert.equal(A.get('reward').vol, 0.6);
    assert.equal(A.get('master').vol, 0.5);
});

test('P21 mix(): мьют категории/мастера глушит, иначе произведение; SFX-эффект ≤ 0.3', () => {
    const A = freshA();
    assert.equal(A.mix('ui'), 0.25, 'дефолт ui = 0.5×0.5');
    assert.equal(A.mix('reward'), 0.3, 'дефолт reward = 0.6×0.5');
    assert.equal(A.mix('music'), 0, 'дефолт music замьючен → 0');
    A.toggleMute('siege');
    assert.equal(A.mix('siege'), 0, 'мьют категории глушит');
    A.setMuted('siege', false);
    A.setMuted('master', true);
    assert.equal(A.mix('siege'), 0, 'мьют мастера глушит всё');
    A.setMuted('master', false);
    assert.ok(Math.abs(A.mix('siege') - 0.25) < 1e-9);
});

test('P21 setVol клампит и квантует к 5%; сохранение переживает перезагрузку (localStorage)', () => {
    const A = freshA();
    assert.equal(A.setVol('ui', 1.7), true);
    assert.equal(A.get('ui').vol, 1, 'сверху клампится к 1');
    assert.equal(A.setVol('ui', -3), true);
    assert.equal(A.get('ui').vol, 0, 'снизу клампится к 0');
    A.setVol('ui', 0.333);
    assert.equal(A.get('ui').vol, 0.35, 'квантование к шагу 0.05 (слайдер step=5)');
    assert.equal(A.setVol('nosuchcat', 1), false, 'неизвестная категория отвергается');
    const raw = JSON.parse(globalThis.localStorage._dump()[A.LS_KEY]);
    assert.equal(raw.v, 1);
    assert.deepEqual(raw.ui, { vol: 0.35, muted: false }, 'формат хранения {v:1,<cat>:{vol,muted}}');

    // перезагрузка: свежий инстанс читает то же состояние
    const B = freshA({ [A.LS_KEY]: globalThis.localStorage._dump()[A.LS_KEY] });
    assert.equal(B.get('ui').vol, 0.35, 'vol пережил reload');
    B.toggleMute('ui');
    const C = freshA({ [A.LS_KEY]: globalThis.localStorage._dump()[A.LS_KEY] });
    assert.equal(C.get('ui').muted, true, 'мьют пережил reload');
});

test('P21 sanitize: битый JSON/чужие ключи/вне диапазона → дефолты-меш, без throw', () => {
    const bad = freshA({ 'neurodeck_audio': '{не json' });
    assert.equal(bad.get('music').muted, true, 'битый JSON → дефолты (music muted)');
    const alien = freshA({ 'neurodeck_audio': JSON.stringify({ v: 1, hacker: { vol: 1, muted: false }, ui: { vol: 42, muted: 'yes' } }) });
    assert.equal(alien.get('hacker'), undefined, 'неизвестная категория не попадает в state');
    assert.equal(alien.get('ui').vol, 1, 'vol вне диапазона клампится');
    assert.equal(alien.get('ui').muted, false, 'небулев muted → дефолт категории');
    const partial = freshA({ 'neurodeck_audio': JSON.stringify({ v: 1, master: { vol: 1, muted: true } }) });
    assert.equal(partial.get('master').muted, true, 'сохранённое читается');
    assert.equal(partial.get('music').muted, true, 'отсутствующая категория добирается дефолтом');
    assert.equal(freshA().get('siege').vol, 0.5, 'пустой LS → чистые дефолты');
});

test('P21 reset(): дефолты (правило 20) + сразу в localStorage', () => {
    const A = freshA();
    A.setVol('ui', 1);
    A.setMuted('master', true);
    A.setMuted('music', false);
    A.reset();
    assert.deepEqual(A.get('ui'), { vol: 0.5, muted: false });
    assert.deepEqual(A.get('master'), { vol: 0.5, muted: false });
    assert.deepEqual(A.get('music'), { vol: 0.5, muted: true }, 'reset возвращает music-muted (правило 20)');
    const B = freshA({ 'neurodeck_audio': globalThis.localStorage._dump()[A.LS_KEY] });
    assert.equal(B.get('music').muted, true, 'reset записан в LS');
});

test('P21 правило 20 (юнит-часть): tone() до unlock — тихий no-op, WebAudio в Node нет', () => {
    const A = freshA();
    assert.equal(A.unlocked(), false, 'без взаимодействия не разблокирован');
    assert.doesNotThrow(() => A.tone('ui', 440, 0.1, 'square', 0.1), 'tone без окна/WebAudio не бросает');
    A.unlock();
    assert.equal(A.unlocked(), true, 'unlock() переключает флаг (слушатели в браузере)');
    assert.doesNotThrow(() => A.tone('ui', 440, 0.1, 'square', 0.1), 'tone без AudioContext молчит');
});

test('P21 правило 20 (source): одноразовые unlock-слушатели + гейт _unlocked в tone', () => {
    const a = audioSrc();
    assert.ok(a.includes("['click', 'keydown', 'touchstart'].forEach"), 'unlock на click/keydown/touchstart');
    assert.ok(a.includes('{ once: true, passive: true, capture: true }'), 'слушатели одноразовые (без накопления)');
    assert.ok(a.includes('if (!_unlocked) return; // правило 20'), 'tone() молчит до первого взаимодействия');
    assert.ok(!/document\.addEventListener\('click'[\s\S]{0,60}getAudioCtx/.test(appSrc()), 'app.js больше не создаёт AudioContext на клик');
});

test('P21 app.js: все 10 sfx разнесены по категориям через ndSfx (typeof-гвард)', () => {
    const app = appSrc();
    assert.ok(app.includes("typeof NDAudio !== 'undefined' && NDAudio && typeof NDAudio.tone === 'function'"), 'гвард ndSfx (правило 6: extract-харнессы)');
    const map = {
        sfxHit: 'ui', sfxForge: 'ui', sfxEquip: 'ui', sfxError: 'ui',
        sfxFail: 'siege',
        sfxCrit: 'reward', sfxRankUp: 'reward', sfxLevelUp: 'reward', sfxGoalComplete: 'reward', sfxBossDefeated: 'reward'
    };
    for (const [fn, cat] of Object.entries(map)) {
        const line = app.split('\n').find((l) => l.startsWith('function ' + fn + '('));
        assert.ok(line, fn + ' объявлена в app.js');
        assert.ok(line.includes("ndSfx('" + cat + "'"), fn + ' → категория ' + cat);
    }
    assert.ok(!app.includes('playTone'), 'playTone ушёл из app.js (микшер в js/audio.js)');
    assert.ok(!/var audioCtx|getAudioContext|new \(window\.AudioContext/.test(app), 'WebAudio-граф не строится в app.js');
});

test('P21 app.js: клик-кейсы микшера + рендер секции; секция в syncModal (index.html)', () => {
    const app = appSrc();
    assert.ok(app.includes("case 'audio-mute': toggleAudioMute"), 'клик-кейс audio-mute');
    assert.ok(app.includes("case 'audio-reset': resetAudioMixer"), 'клик-кейс audio-reset');
    assert.ok(app.includes('function renderAudioSettings()'), 'рендер состояния секции');
    assert.ok(app.includes("classList.contains('audio-vol')"), 'input-слушатель слайдеров (drag, не только change)');
    assert.ok(app.includes('function toggleAudioMute(cat)'), 'typeof-гварды в обработчиках');

    const html = htmlSrc();
    assert.ok(html.includes('id="audioSection"'), 'секция 🔊 Звук в модалке настроек');
    for (const cat of ['master', 'music', 'ui', 'siege', 'reward']) {
        assert.ok(html.includes('id="audio-vol-' + cat + '"'), 'слайдер ' + cat);
        assert.ok(html.includes('id="audio-mute-' + cat + '"'), 'кнопка мьюта ' + cat);
        assert.ok(html.includes('data-cat="' + cat + '"'), 'data-cat=' + cat);
    }
    assert.ok((html.match(/class="audio-row"/g) || []).length === 5, 'ровно 5 строк категорий');
    assert.ok(html.includes('data-action="audio-reset"'), 'кнопка сброса');
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    for (const cls of ['.audio-row', '.audio-vol', '.audio-mute-btn']) assert.ok(css.includes(cls), 'css ' + cls);
});

test('P21 подключение: audio.js грузится до app.js и в SW-прекэше; схема сейва не тронута', () => {
    const html = htmlSrc();
    const aPos = html.indexOf('js/audio.js');
    const appPos = html.indexOf('js/app.js');
    assert.ok(aPos > -1 && appPos > aPos, 'audio.js грузится раньше app.js');
    assert.ok(/js\/audio\.js\?v=\d+/.test(html), 'версионированный тег скрипта');
    assert.ok(swSrc().includes("'js/audio.js?v=155'"), 'audio.js в SW-прекэше (v102, ре-пин P22; v101 — P21)');
    const storage = fs.readFileSync(path.join(root, 'js', 'storage.js'), 'utf8');
    assert.ok(!storage.includes('neurodeck_audio'), 'ключ микшера НЕ в storage.js (сейв не трогаем)');
    assert.ok(!storage.includes('NDAudio'), 'storage.js не зависит от микшера');
});

test('P21 app.js: категория тона не меняет вызовы — sfx-имена и call-сайты целы', () => {
    const app = appSrc();
    // все прежние имена функций на месте (харнессы стабируют их по имени)
    for (const fn of ['sfxHit', 'sfxCrit', 'sfxRankUp', 'sfxLevelUp', 'sfxFail', 'sfxForge', 'sfxGoalComplete', 'sfxBossDefeated', 'sfxEquip', 'sfxError']) {
        assert.ok(app.includes('function ' + fn + '('), fn + ' объявлена');
    }
    // частотные параметры первых тонов не дрейфят (байтовые значения прежнего playTone)
    assert.ok(app.includes("ndSfx('ui', 200, 0.12, 'square', 0.12, 100)"), 'sfxHit тон 200 Гц как прежде');
    assert.ok(app.includes("ndSfx('siege', 300, 0.15, 'sawtooth', 0.1, 100)"), 'sfxFail тон 300 Гц как прежде');
    assert.ok(app.includes("ndSfx('reward', 500, 0.1, 'square', 0.1)"), 'sfxGoalComplete тон 500 Гц как прежде');
});
