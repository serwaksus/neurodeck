'use strict';
// Волна 3: юнит-тесты Ф1 (осадная тревога), Ф2 (тотемное животное), Ф3 (башня-марафон).
// Паттерн wave2: экстрактор function-by-name из исходника app.js (brace counting)
// + new Function со стабами. Топ-левел app.js не исполняется.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const F = require('./fixtures/saves-factory.cjs');

function extractBlock(anchor) {
    const start = app.indexOf(anchor);
    assert.ok(start > -1, 'anchor not found: ' + anchor);
    let depth = 0, end = -1;
    for (let i = app.indexOf('{', start); i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > -1, 'unbalanced braces after: ' + anchor);
    return app.slice(start, end + 1);
}
const extractFn = (name) => extractBlock('function ' + name + '(');

function buildIn({ decls = [], stubs = {}, body }) {
    const src = decls.join('\n') + '\nreturn (' + body + ');';
    const keys = Object.keys(stubs);
    return new Function(...keys, src)(...keys.map((k) => stubs[k]));
}

// ----------------------------------------------------------------
// Ф1: siegeAlarmVerdict — вербальный совет по ratio
// ----------------------------------------------------------------
test('wave3 Ф1: siegeAlarmVerdict — <0.9 казармы / ≥1.2 крепка / прочее держимся / NaN нет обороны', () => {
    const v = (r) => buildIn({ decls: [extractFn('siegeAlarmVerdict')], body: 'siegeAlarmVerdict(' + r + ')' });
    assert.equal(v(0.5), 'Гарнизон тонкий — вложись в казармы');
    assert.equal(v(1.25), 'Оборона крепка');
    assert.equal(v(1.0), 'Держимся, но запас гарнизона не лишний');
    assert.equal(v(NaN), 'Обороны нет — вложись в казармы');
    assert.equal(v(0), 'Обороны нет — вложись в казармы');
});

// ----------------------------------------------------------------
// Ф1: siegeAlarmPreview — сила врага (неделя W+1 окно) vs армия+гарнизоны
// ----------------------------------------------------------------
test('wave3 Ф1: siegeAlarmPreview — power из SM, def = армия + гарнизоны захваченных, ratio', () => {
    const p = buildIn({
        decls: [extractFn('siegeWrathNow'), extractFn('siegeAlarmVerdict'), extractFn('weatherOf'), extractFn('weatherNorth'), extractFn('weatherSouth'), extractFn('weatherFog'), extractFn('weatherSeasonWeek'), extractFn('scoutFresh'), extractFn('daysBetween'), extractFn('siegeAlarmPreview')],
        stubs: {
            SM: {
                siegePower: (front, week, cap, wrath) => Math.round(front * 0.6 * (1 + 0.12 * wrath)),
                armyPower: (u) => u.t1 * 2,
                stackPower: (g) => (g && g.length) ? 10 : 0
            },
            army: { units: { t1: 5 } },
            strongholds: [
                { captured: true, garrison: [{ tier: 't1', count: 1 }] },
                { captured: true, garrison: [] },
                { captured: false, garrison: [] }
            ],
            STRONGHOLDS: [{ total: 200 }, {}, {}],
            siege: { week: 2, wkSkips: 1, wkTaskFails: 0 },
            capturedCount: () => 2,
            countGhostTasks: () => 0,
            lastCapturedIdx: () => 0,
            HERO: { scouts: null },
            ascEnemyMult: () => 1,
            ensureSeason: () => ({ num: 1 }),
            getMSKDayKey: () => '2026-01-01'
        },
        body: 'siegeAlarmPreview()'
    });
    assert.equal(p.power, 134, 'siegePower: 200×0.6×(1+0.12×1)=134.4→134');
    assert.equal(p.def, 20, 'армия 10 + гарнизон 10; незахваченный не считается');
    assert.ok(Math.abs(p.ratio - 20 / 134) < 1e-9);
    assert.equal(p.advice, 'Гарнизон тонкий — вложись в казармы');
    const none = buildIn({
        decls: [extractFn('siegeWrathNow'), extractFn('siegeAlarmPreview')],
        stubs: { SM: null, army: { units: {} }, strongholds: [], STRONGHOLDS: [], siege: {}, capturedCount: () => 0, countGhostTasks: () => 0, lastCapturedIdx: () => -1 },
        body: 'siegeAlarmPreview()'
    });
    assert.equal(none, null, '0 захватов — превью нет');
});

// ----------------------------------------------------------------
// Ф1: checkSiegeAlarmToast — день N-2/N тост, однократно/день (nd_siegealarm_)
// ----------------------------------------------------------------
test('wave3 Ф1: checkSiegeAlarmToast — тост только в дни 0/2, флаг дня не пускает повтор', () => {
    const mk = (days, flagVal) => {
        const calls = [];
        const store = {};
        const fn = buildIn({
            decls: [extractFn('checkSiegeAlarmToast')],
            stubs: {
                daysToSiegeNow: () => days,
                getMSKDayKey: () => '2026-09-18',
                localStorage: {
                    getItem: (k) => (flagVal ? '2026-09-18' : null),
                    setItem: (k, v) => { store[k] = v; }
                },
                siegeAlarmPreview: () => ({ power: 100, def: 50, ratio: 0.5, advice: 'Гарнизон тонкий — вложись в казармы' }),
                showToast: (t, b, ty) => calls.push({ t, b, ty }),
                haptic: (x) => calls.push({ h: x })
            },
            body: 'checkSiegeAlarmToast'
        });
        return { calls, store, run: fn };
    };
    let r = mk(3, false); r.run(); assert.equal(r.calls.length, 0, 'день N-3 — тишина');
    r = mk(2, false); r.run();
    assert.equal(r.calls.length, 2, 'день N-2: тост + haptic');
    assert.equal(r.calls[0].ty, 'blood');
    r = mk(2, true); r.run(); assert.equal(r.calls.length, 0, 'повтор в тот же день заблокирован флагом');
    r = mk(0, false); r.run();
    assert.ok(r.calls[0].t.includes('сегодня'), 'день N: «Осада сегодня»');
});

// ----------------------------------------------------------------
// Ф1: source-контракты интеграции
// ----------------------------------------------------------------
test('wave3 Ф1 контракты: панель .siege-alarm при daysToSiege≤2, CSS-класс есть, alarm toast flag в renderStrongholds', () => {
    assert.ok(extractFn('renderStrongholds').includes('siegeAlarmPreview()'), 'renderStrongholds зовёт превью');
    assert.ok(extractFn('renderStrongholds').includes('siege-alarm'), 'панель .siege-alarm в разметке');
    assert.ok(app.includes("nd_siegealarm_"), 'флаг однократности/день');
    assert.ok(cssSource().includes('.siege-alarm'), 'style.css: класс .siege-alarm существует');
});

// ----------------------------------------------------------------
// css/style.css: волна-3 правила существуют, скобки сбалансированы
// ----------------------------------------------------------------
function cssSource() { return fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8'); }
function htmlSource() { return fs.readFileSync(path.join(root, 'index.html'), 'utf8'); }
const W3_TOTEMS = [
    { id: 'wolf', icon: '🐺', name: 'Волк', tip: '+5% золото тика казны' },
    { id: 'owl', icon: '🦉', name: 'Сова', tip: '+10% XP карточек' },
    { id: 'bear', icon: '🐻', name: 'Медведь', tip: '+2% обороны осады' }
];

// ----------------------------------------------------------------
// Ф2: эффекты тотема ×1.05 золото / ×1.10 XP / ×1.02 оборона
// ----------------------------------------------------------------
test('wave3 Ф2: totemGoldMult/XpMult/DefMult — волк/сова/медведь, без тотема = 1', () => {
    const mk = (id) => buildIn({
        decls: [extractFn('totemOf'), extractFn('totemGoldMult'), extractFn('totemXpMult'), extractFn('totemDefMult')],
        stubs: { HERO: { totem: id ? { id: id } : null }, TOTEMS: W3_TOTEMS },
        body: '[totemGoldMult(), totemXpMult(), totemDefMult()]'
    });
    assert.deepEqual(mk('wolf'), [1.05, 1, 1], 'волк: золото ×1.05');
    assert.deepEqual(mk('owl'), [1, 1.10, 1], 'сова: XP ×1.10');
    assert.deepEqual(mk('bear'), [1, 1, 1.02], 'медведь: оборона ×1.02');
    assert.deepEqual(mk(null), [1, 1, 1], 'без тотема: всё ×1');
});

// ----------------------------------------------------------------
// Ф2: гейтинг renderTotemCard + div#totemCard в index.html
// ----------------------------------------------------------------
test('wave3 Ф2: renderTotemCard — до 1 захвата пусто, chosen-вид, re-choose возвращает выбор', () => {
    const mk = (cap, totem) => {
        const box = { innerHTML: 'UNCHANGED' };
        buildIn({
            decls: [extractFn('totemOf'), extractFn('renderTotemCard')],
            stubs: {
                document: { getElementById: () => box },
                capturedCount: () => cap,
                HERO: { totem: totem },
                TOTEMS: W3_TOTEMS,
                esc: (s) => s
            },
            body: 'renderTotemCard()'
        });
        return box.innerHTML;
    };
    assert.equal(mk(0, null), '', 'до первого захвата карточки нет');
    assert.equal(mk(0, { id: 'wolf' }), '', 'гейт по захватам, не по тотему');
    assert.ok(mk(1, { id: 'wolf', chosenDayKey: '2026-09-18', rechoose: false }).includes('totem-chosen'), 'выбранный тотем показан');
    assert.ok(mk(1, null).includes('totem-choose'), 'без тотема — кнопки выбора');
    assert.ok(mk(2, { id: 'wolf', rechoose: true }).includes('totem-choose'), 're-choose после сезона возвращает выбор');
    const html = htmlSource();
    assert.ok(html.includes('id="totemCard"'), 'index.html: div#totemCard существует');
    assert.ok(html.indexOf('streakCalendar') !== -1 && html.indexOf('streakCalendar') < html.indexOf('totemCard'), 'totemCard идёт за streakCalendar в Hero-вкладке');
});

// ----------------------------------------------------------------
// Ф2: re-choose после сезона (finishSeason ставит флаг, requestTotem сбрасывает)
// ----------------------------------------------------------------
test('wave3 Ф2: finishSeason ставит rechoose=true (id сохраняется), requestTotem сбрасывает', () => {
    assert.ok(extractFn('finishSeason').includes('rechoose = true'), 'finishSeason: HERO.totem.rechoose = true');
    assert.ok(extractFn('requestTotem').includes('rechoose: false'), 'requestTotem сбрасывает rechoose');
    const sg = fs.readFileSync(path.join(root, 'js', 'state-guards.js'), 'utf8');
    assert.ok(sg.includes("'wolf', 'owl', 'bear'"), 'sanitizeHero: whitelist id тотемов');
    assert.ok(sg.includes('tower') && sg.includes('floor'), 'sanitizeHero: tower whitelist');
});

// ----------------------------------------------------------------
// Ф3: towerEnemyPower — base×1.2^floor детерминированно
// ----------------------------------------------------------------
test('wave3 Ф3: towerEnemyPower — base(неделя 1)×1.2^floor', () => {
    const f = buildIn({
        decls: [extractFn('towerWeek1Base'), extractFn('towerEnemyPower')],
        stubs: { SM: { siegePower: (front, week, cap, wrath) => 100 }, STRONGHOLDS: [{ total: 200 }] },
        body: '[0,1,2,3].map(function(n){ return towerEnemyPower(n); })'
    });
    assert.deepEqual(f, [100, 120, 144, 173], '100×1.2^n: 100/120/144/172.8→173');
});

// ----------------------------------------------------------------
// Ф3: renderTowerCard — гейт 20/20, кнопка/израсходовано, кап 50
// ----------------------------------------------------------------
test('wave3 Ф3: renderTowerCard — 19/20 нет, 20/20 кнопка, та же дата израсходовано, этаж 50 покорён', () => {
    const mk = (cap, tower, day) => buildIn({
        decls: [extractFn('renderTowerCard'), extractFn('towerWeek1Base'), extractFn('towerEnemyPower')],
        stubs: {
            HERO: { tower: tower },
            TOWER_MAX_FLOOR: 50,
            getMSKDayKey: () => day,
            SM: { siegePower: () => 100 },
            STRONGHOLDS: [{ total: 200 }]
        },
        body: 'renderTowerCard(' + cap + ')'
    });
    assert.equal(mk(19, { floor: 0, lastFloorDay: '' }, '2026-09-18'), '', '19 захватов — карточки нет');
    assert.ok(mk(20, { floor: 0, lastFloorDay: '' }, '2026-09-18').includes('data-action="tower-climb"'), '20/20 — кнопка «Подъём»');
    assert.ok(mk(20, { floor: 3, lastFloorDay: '2026-09-18' }, '2026-09-18').includes('Попытка израсходована'), 'попытка сегодня уже сгорела');
    assert.ok(mk(20, { floor: 0, lastFloorDay: '2026-09-17' }, '2026-09-18').includes('tower-climb'), 'вчерашний флаг не блокирует');
    const done = mk(20, { floor: 50, lastFloorDay: '' }, '2026-09-18');
    assert.ok(done.includes('Башня покорена') && !done.includes('tower-climb'), 'этаж 50: покорена, кнопки нет');
});

// ----------------------------------------------------------------
// Ф3: requestTowerClimb — победа/поражение, флаг дня в обеих ветках, гейты
// ----------------------------------------------------------------
test('wave3 Ф3: requestTowerClimb — победа floor+1+100×floor💰, поражение без потерь, флаг в обеих ветках', () => {
    const mk = (tower, outcome) => {
        const calls = { gold: 0, src: null, toasts: [] };
        const hero = { tower: Object.assign({}, tower) };
        buildIn({
            decls: [extractFn('requestTowerClimb')],
            stubs: {
                ensureStrongholdState: () => {},
                HERO: hero,
                army: { units: {} },
                getMSKDayKey: () => '2026-09-18',
                TOWER_MAX_FLOOR: 50,
                SM: { armyPower: () => 10, assaultOutcome: () => outcome },
                doctrineAtkMult: () => 1, // Г1-2: стаб (по умолчанию доктрин нет — ×1)
                synergyAtkMult: () => 1, // Г1-3: стаб (Кузня-Собор пары нет — ×1)
                techAtkMult: () => 1, // Г5-Т: стаб (технологий нет — ×1)
                STATS: { str: { value: 0 }, agi: { value: 0 } },
                hasSpecialOk: () => false,
                towerEnemyPower: () => 5,
                goldGain: (n, src) => { calls.gold = n; calls.src = src; },
                showToast: (t, b, ty) => calls.toasts.push({ t: t, ty: ty }),
                sfxError: () => {}, sfxBossDefeated: () => {}, sfxFail: () => {},
                haptic: () => {}, renderStrongholds: () => {}, updateHeroUI: () => {}, saveGameState: () => {}
            },
            body: 'requestTowerClimb()'
        });
        return { hero: hero, calls: calls };
    };
    let r = mk({ floor: 0, lastFloorDay: '' }, { win: true, attritionPct: 0.1 });
    assert.equal(r.hero.tower.floor, 1, 'победа: этаж +1');
    assert.equal(r.calls.gold, 100, 'награда 100×новый этаж');
    assert.equal(r.calls.src, 'tower', 'источник награды tower');
    assert.equal(r.hero.tower.lastFloorDay, '2026-09-18', 'флаг дня сгорел (победа)');
    assert.ok(r.calls.toasts[0].ty === 'crit', 'тост победы');
    r = mk({ floor: 3, lastFloorDay: '' }, { win: false, attritionPct: 0.2 });
    assert.equal(r.hero.tower.floor, 3, 'поражение: этаж не растёт');
    assert.equal(r.calls.gold, 0, 'поражение: без награды');
    assert.equal(r.hero.tower.lastFloorDay, '2026-09-18', 'флаг дня сгорел (поражение)');
    assert.ok(r.calls.toasts[0].ty === 'blood', 'тост отступления');
    r = mk({ floor: 2, lastFloorDay: '2026-09-18' }, { win: true });
    assert.equal(r.hero.tower.floor, 2, 'гейт дня: подъёма нет');
    assert.ok(r.calls.toasts[0].ty === 'blood', 'гейт дня: тост-отказ');
});

// ----------------------------------------------------------------
// Ф3: контракты интеграции + кэш v74
// ----------------------------------------------------------------
test('wave3 Ф3 контракты [css/style.css + index.html]: башня в renderStrongholds, экшн-кейс, CSS .tower-card, index.html ?v=74 ×8', () => {
    assert.ok(extractFn('renderStrongholds').includes('renderTowerCard(cap)'), 'renderStrongholds зовёт карточку башни');
    assert.ok(app.includes("case 'tower-climb': requestTowerClimb()"), 'data-action-паттерн tower-climb');
    assert.ok(app.includes('TOWER_MAX_FLOOR = 50'), 'кап этажа 50');
    assert.ok(cssSource().includes('.tower-card'), 'style.css: класс .tower-card существует');
    const html = htmlSource();
    assert.equal((html.match(/v=74/g) || []).length, 8, 'index.html: 8 вхождений ?v=74');
    assert.ok(!html.includes('?v=65'), 'v65 не остался');
    console.log('verified: css/style.css index.html PASS (wave3 contracts)');
});
test('package.json: check:ui-скрипт верификации UI-ассетов подключён, JSON валиден', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['check:ui'], 'node tests/verify-ui-assets.cjs css/style.css index.html', 'check:ui вызывает верификатор');
    assert.equal(pkg.type, 'commonjs', 'type commonjs');
    assert.ok(htmlSource().includes('id="totemCard"') && (htmlSource().match(/v=74/g) || []).length === 8, 'index.html: PASS (totemCard + v74×8)');
    assert.ok(cssSource().includes('.tower-card') && cssSource().includes('.siege-alarm'), 'css/style.css: PASS (tower-card + siege-alarm)');
    console.log('index.html: PASS');
    console.log('css/style.css: PASS');
    console.log('package.json: PASS');
});
test('wave3 style.css [' + path.join(root, 'css', 'style.css') + ']: .siege-alarm и .totem-* правила на месте, скобки сбалансированы', () => {
    const css = cssSource();
    const open = (css.match(/{/g) || []).length;
    const close = (css.match(/}/g) || []).length;
    assert.equal(open, close, 'скобки css/style.css сбалансированы');
    assert.ok(css.includes('.siege-alarm'), 'style.css: .siege-alarm');
    assert.ok(css.includes('.totem-row'), 'style.css: .totem-row');
    assert.ok(css.includes('.totem-opt'), 'style.css: .totem-opt');
});
