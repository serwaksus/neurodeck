'use strict';
// P22: game feel — reward reveal (секвенция 0.5–2с за гейтом ndMotionOk), анимация подготовки
// осады (siegePrepAnimate) и haptics-матрица (ND_HAPTICS/hapticFor + navigator.vibe-фоллбэк).
// Харнессы — extract-паттерн wave3/P6: функции поодиночке, same-layer зависимости — стабами.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js', 'ui', 'strongholds.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'js', 'storage.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

function extractBlock(src, anchor) {
    const start = src.indexOf(anchor);
    assert.ok(start > -1, 'anchor not found: ' + anchor);
    let depth = 0, end = -1;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > -1, 'unbalanced braces after: ' + anchor);
    return src.slice(start, end + 1);
}
const extractFn = (name) => extractBlock(app, 'function ' + name + '(');

function buildIn({ decls = [], stubs = {}, body }) {
    const src = decls.join('\n') + '\nreturn (' + body + ');';
    const keys = Object.keys(stubs);
    return new Function(...keys, src)(...keys.map((k) => stubs[k]));
}

const VALID_TYPES = ['light', 'medium', 'heavy', 'rigid', 'success', 'warning', 'error'];

// ----------------------------------------------------------------
// ndMotionOk: гейт reduced-motion/eco (правило 19)
// ----------------------------------------------------------------

function motionWith({ eco, prm }) {
    return buildIn({
        decls: [extractFn('ndMotionOk')],
        stubs: { ecoOn: () => eco, NeuroDeckPerf: { prefersReducedMotion: () => prm } },
        body: 'ndMotionOk()',
    });
}

test('P22 ndMotionOk: сводка гейта — 4 комбинации eco × reduced-motion', () => {
    assert.equal(motionWith({ eco: false, prm: false }), true, 'чистое окружение — секвенции разрешены');
    assert.equal(motionWith({ eco: true, prm: false }), false, 'eco выключает секвенции');
    assert.equal(motionWith({ eco: false, prm: true }), false, 'prefers-reduced-motion выключает секвенции');
    assert.equal(motionWith({ eco: true, prm: true }), false, 'оба гейта — тем более выключены');
});

test('P22 ndMotionOk: самодостаточен для extract-харнессов (typeof-гварды, правило 19)', () => {
    const fn = extractFn('ndMotionOk');
    assert.ok(fn.includes("typeof ecoOn === 'function'"), 'ecoOn за гвардом');
    assert.ok(fn.includes("typeof NeuroDeckPerf !== 'undefined'"), 'NeuroDeckPerf за гвардом');
    assert.ok(fn.includes("typeof NeuroDeckPerf.prefersReducedMotion === 'function'"), 'метод за гвардом');
    // без единого стаба функция не падает и разрешает анимации (браузерный дефолт auto/no-preference)
    assert.equal(buildIn({ decls: [fn], stubs: {}, body: 'ndMotionOk()' }), true);
});

// ----------------------------------------------------------------
// haptics-матрица: ND_HAPTICS / ND_HAPTIC_VIBES / hapticFor / haptic-фоллбэк
// ----------------------------------------------------------------

function evalDecl(name) {
    const m = app.match(new RegExp('var ' + name + ' = \\{[\\s\\S]*?\\};'));
    assert.ok(m, 'объявление ' + name + ' не найдено в app.js');
    return new Function(m[0] + '; return ' + name + ';')();
}

test('P22 матрица ND_HAPTICS: все значения — валидные типы HapticFeedback', () => {
    const m = evalDecl('ND_HAPTICS');
    const keys = Object.keys(m);
    assert.ok(keys.length >= 15, 'матрица покрывает ключевые события (факт: ' + keys.length + ')');
    keys.forEach((k) => assert.ok(VALID_TYPES.includes(m[k]), k + ' → ' + m[k] + ' — невалидный тип'));
});

test('P22 матрица ND_HAPTICS: P22-события reward/prep заведены', () => {
    const m = evalDecl('ND_HAPTICS');
    assert.equal(m['boss.reward.reveal'], 'success');
    assert.equal(m['boss.reward.claim'], 'success');
    assert.equal(m['siege.prep.set'], 'light');
    assert.equal(m['siege.prep.cancel'], 'light');
    assert.equal(m['siege.store.buy'], 'light');
});

test('P22 ND_HAPTIC_VIBES: 7 типов, notification-паттерны — массивы мс', () => {
    const v = evalDecl('ND_HAPTIC_VIBES');
    VALID_TYPES.forEach((t) => assert.ok(v[t] !== undefined, 'вибрационный паттерн для ' + t));
    ['success', 'warning', 'error'].forEach((t) => {
        assert.ok(Array.isArray(v[t]) && v[t].length >= 2 && v[t].every((x) => typeof x === 'number'), t + ' — паттерн-массив');
    });
    ['light', 'medium', 'heavy', 'rigid'].forEach((t) => assert.ok(typeof v[t] === 'number' && v[t] > 0, t + ' — одиночный импульс мс'));
});

test('P22 hapticFor: известное событие зовёт haptic(тип) и возвращает тип; неизвестное — тишина', () => {
    const calls = [];
    const out = buildIn({
        decls: [extractFn('hapticFor'), "var ND_HAPTICS = { 'test.ok': 'success', 'siege.prep.set': 'light' };"],
        stubs: { haptic: (t) => calls.push(t) },
        body: '(function(){ return [hapticFor("test.ok"), hapticFor("no.such.event"), hapticFor("siege.prep.set")]; })',
    })();
    assert.deepEqual(out, ['success', null, 'light']);
    assert.deepEqual(calls, ['success', 'light'], 'haptic вызван ровно для известных событий');
});

test('P22 haptic: браузерный фоллбэк navigator.vibrate по паттерну из матрицы', () => {
    const vibes = [];
    buildIn({
        decls: [extractFn('haptic'), 'var ND_HAPTIC_VIBES = { success: [15, 40, 30], light: 15, medium: 30 };'],
        stubs: {
            window: {}, // без Telegram.WebApp → ветка navigator.vibrate
            navigator: { vibrate: (p) => { vibes.push(p); return true; } },
        },
        body: '(function(){ haptic("success"); haptic("light"); haptic("medium"); haptic("nope"); })',
    })();
    assert.deepEqual(vibes, [[15, 40, 30], 15, 30], 'паттерны из матрицы; неизвестный тип — тишина');
});

// ----------------------------------------------------------------
// siegePrepAnimate: гейт + класс вспышки + самоочистка
// ----------------------------------------------------------------

function fakePrepEl() {
    const added = [], removed = [];
    return {
        added, removed, offsetWidth: 0,
        classList: { add: (c) => added.push(c), remove: (c) => removed.push(c), contains: (c) => added.indexOf(c) >= 0 && removed.indexOf(c) < 0 },
    };
}

test('P22 siegePrepAnimate: motion разрешён → класс вспышки на панели', () => {
    const el = fakePrepEl();
    const ok = buildIn({
        decls: [extractFn('siegePrepAnimate')],
        stubs: { ndMotionOk: () => true, document: { querySelector: () => el } },
        body: 'siegePrepAnimate()',
    });
    assert.equal(ok, true);
    assert.deepEqual(el.added, ['sh-prep-flash'], 'класс вспышки добавлен');
});

test('P22 siegePrepAnimate: гейт закрыт (reduced-motion/eco) → false, класс не вешается', () => {
    const el = fakePrepEl();
    const ok = buildIn({
        decls: [extractFn('siegePrepAnimate')],
        stubs: { ndMotionOk: () => false, document: { querySelector: () => el } },
        body: 'siegePrepAnimate()',
    });
    assert.equal(ok, false);
    assert.equal(el.added.length, 0, 'класс не добавляется под гейтом');
});

test('P22 siegePrepAnimate: панели нет в DOM → false без исключения', () => {
    const out = buildIn({
        decls: [extractFn('siegePrepAnimate')],
        stubs: { ndMotionOk: () => true, document: { querySelector: () => null } },
        body: 'siegePrepAnimate()',
    });
    assert.equal(out, false);
});

// ----------------------------------------------------------------
// Пины проводок (правило 19: typeof-гварды для extract-харнессов)
// ----------------------------------------------------------------

test('P22 пины: reveal-секвенция в showBossRewardChoice ограждена ndMotionOk', () => {
    const fn = extractFn('showBossRewardChoice');
    assert.ok(fn.includes("typeof ndMotionOk === 'function' && ndMotionOk()"), 'гейт motion/eco перед секвенцией');
    assert.ok(fn.includes("classList.add('reveal')"), 'класс секвенции');
    assert.ok(fn.includes("classList.remove('reveal')"), 'самоочистка класса');
    assert.ok(fn.includes("hapticFor('boss.reward.reveal')"), 'тактильный отклик из матрицы');
});

test('P22 пины: подход/отмена/склад — siegePrepAnimate за typeof-гвардом, haptic-фоллбек сохранён', () => {
    ['requestApproach', 'requestApproachCancel', 'buySiegeStore'].forEach((n) => {
        const fn = extractFn(n);
        assert.ok(fn.includes("typeof siegePrepAnimate === 'function'"), n + ': гвард анимации');
        assert.ok(fn.includes("hapticFor('siege."), n + ': haptic через матрицу');
        assert.ok(fn.includes("haptic('light')"), n + ': фоллбек haptic для харнессов');
    });
});

test('P22 пины: chooseBossReward — haptic через матрицу с фоллбеком', () => {
    const fn = extractFn('chooseBossReward');
    assert.ok(fn.includes("hapticFor('boss.reward.claim')"), 'матрица: boss.reward.claim');
    assert.ok(fn.includes("haptic('success')"), 'фоллбек haptic для харнессов');
});

test('P22 CSS: секвенция reveal ≤ 2с, вспышка подготовки без сдвига лэйаута', () => {
    assert.ok(/#bossRewardModal\.reveal \.boss-reward-opt \.boss-reward-emoji/.test(css), 'reveal-правила для детей кнопки');
    assert.ok(/@keyframes ndRevealFade/.test(css), 'keyframes ndRevealFade');
    assert.ok(/\.siege-prep\.sh-prep-flash\s*\{\s*animation: ndPrepPulse/.test(css), 'вспышка панели подготовки');
    const pulse = (css.match(/@keyframes ndPrepPulse[\s\S]*?\}/) || [''])[0];
    assert.ok(pulse, 'keyframes ndPrepPulse');
    assert.ok(pulse.includes('box-shadow') && !pulse.includes('transform'), 'пульс только box-shadow — без геометрии');
    const delays = [...css.matchAll(/--nd-rv: ([\d.]+)s;/g)].map((m) => parseFloat(m[1])).sort((a, b) => a - b);
    assert.deepEqual(delays, [0.45, 0.85, 1.25, 1.6], 'четыре ступени секвенции');
    const dur = parseFloat((css.match(/animation: ndRevealFade ([\d.]+)s/) || [])[1]);
    assert.equal(dur, 0.4, 'длительность ступени');
    assert.ok(Math.max(...delays) + dur <= 2, 'секвенция целиком укладывается в 2с');
    assert.ok(delays[0] >= 0.4 && delays[0] <= 0.5, 'первая награда появляется ~0.5с');
});

test('P22 аудит call-sites: все сырые haptic(\'тип\') в продукте — валидные типы', () => {
    const names = ['app.js', 'ui/strongholds.js', 'storage.js'];
    [app, ui, storage].forEach((src, i) => {
        [...src.matchAll(/haptic\('([a-z]+)'\)/g)].forEach((m) => {
            assert.ok(VALID_TYPES.includes(m[1]), names[i] + ': невалидный тип haptic(' + m[1] + ')');
        });
    });
});
