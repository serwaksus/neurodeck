'use strict';
// Волна «Campaign 2.0 C5» — босс-арки: game-иконки 11 боссов, одноразовый лор-тост вступления,
// reward-choice в модалке итогов (артефакт / +1 венец сезона / снятие 1 руины), схема v13.
// Паттерн wave-g2: extractFn + new Function-харнесс — топ-левел app.js не исполняется.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const SD = require('../js/stronghold-data.js');
const SG = require('../js/state-guards.js');
const S = require('../js/storage.js');
const IV = S.__storageInternals;
const STRONGHOLDS = SD.STRONGHOLDS;
const BOSSES = SD.BOSSES;
const BOSS_ARTIFACTS = SD.BOSS_ARTIFACTS;
const BUILDINGS = SD.BUILDINGS;

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

function iconPathsMap() { // ICON_PATHS из app.js — валидный JSON (все ключи/строки в кавычках)
    const m = app.match(/const ICON_PATHS = (\{[\s\S]*?\});\n/);
    assert.ok(m, 'ICON_PATHS найден');
    return JSON.parse(m[1]);
}

// ----------------------------------------------------------------
// Арт: 11 боссов на game-иконках (ICON_PATHS + файлы-исходники)
// ----------------------------------------------------------------

test('C5: у всех 11 боссов есть artIcon из ICON_PATHS, файлы gameicons на месте и без чёрного фона', () => {
    const paths = iconPathsMap();
    assert.equal(BOSSES.length, 11);
    BOSSES.forEach((b) => {
        assert.ok(b.artIcon, 'artIcon у босса ' + b.num);
        assert.ok(paths[b.artIcon], 'artIcon «' + b.artIcon + '» есть в ICON_PATHS (app.js)');
        assert.ok(paths[b.artIcon].length > 200, 'путь иконки не пустышка');
        const svgPath = path.join(root, 'img', 'gameicons', b.artIcon + '.svg');
        assert.ok(fs.existsSync(svgPath), 'исходник img/gameicons/' + b.artIcon + '.svg');
        const svg = fs.readFileSync(svgPath, 'utf8');
        assert.ok(svg.indexOf('M0 0h512v512H0z') === -1, 'чёрный фон-прямоугольник удалён');
        assert.ok(svg.indexOf('viewBox="0 0 512 512"') !== -1, 'viewBox 512');
    });
    const uniq = new Set(BOSSES.map((b) => b.artIcon));
    assert.equal(uniq.size, 11, 'иконки боссов уникальны');
});

test('C5: bossCardHtml — game-icon портрет с эмодзи-фолббэком (extract-харнесс без artIconHtml)', () => {
    // без artIconHtml (нет в скоупе) — эмодзи-фолббэк, контракт wave-g2 не ломается
    const e = env({ capturedN: 20 });
    const card = e.fns.bossCardHtml(0);
    assert.ok(card.indexOf('🐀') !== -1, 'фолббэк-эмодзи при отсутствии artIconHtml');
    // с artIconHtml — SVG-портрет
    const e2 = env({ capturedN: 20, extra: { artIconHtml: (n) => '<svg class="nd-art" data-icon="' + n + '"></svg>' } });
    const card2 = e2.fns.bossCardHtml(0);
    assert.ok(card2.indexOf('data-icon="animal-skull"') !== -1, 'SVG-портрет animal-skull для Гнилоуха');
    assert.ok(card2.indexOf('🐀') === -1, 'эмодзи заменён иконкой');
});

// ----------------------------------------------------------------
// Вступление: одноразовый лор-тост при первом открытии босс-фазы
// ----------------------------------------------------------------

test('C5: maybeBossIntro — лор-тост один раз на босса, только когда провинция собрана', () => {
    const e = env({ capturedN: 20, day: 'D1' });
    e.fns.maybeBossIntro(0); // первый узел пров.1, босс I
    assert.deepEqual(e.HERO.bosses.introSeen, [1], 'босс I отмечен');
    assert.ok(e.calls.toast.some((x) => x.t.indexOf('Гнилоух') !== -1 && x.b.indexOf('Стада мора') !== -1), 'тост с именем и лором');
    e.fns.maybeBossIntro(0);
    assert.equal(e.calls.toast.filter((x) => x.t.indexOf('Гнилоух') !== -1).length, 1, 'повторное открытие — тишина');
    const locked = env({ capturedN: 4, day: 'D1' }); // пров.1 не собрана
    locked.fns.maybeBossIntro(0);
    assert.deepEqual(locked.HERO.bosses.introSeen, [], 'провинция не собрана — вступления нет');
    const junkIdx = env({ capturedN: 20, day: 'D1' });
    junkIdx.fns.maybeBossIntro(99);
    assert.equal(junkIdx.HERO.bosses, null, 'мусорный idx — тишина, состояние даже не создаётся');
});

// ----------------------------------------------------------------
// Победа над боссом: pendingReward + reward-choice (артефакт/венец/руина)
// ----------------------------------------------------------------

function defeatBoss1(e, day) { // 3 фазы за день не пройти (кап 2) — D1: 2 фазы, D2: финал
    e.fns.requestBossChallenge(1);
    e.fns.bossProgressTick({ cards: 3, questsAll: false, gold: 0, streakAlive: true });
    e.fns.bossProgressTick({ cards: 99, streakAlive: true });
    return e; // phase 2
}

test('C5: победа — defeated + pendingReward, тост ведёт к выбору награды (пин волны Г2: имя артефакта в тосте)', () => {
    const e = defeatBoss1(env({ capturedN: 20, day: 'D1', goldGoal: 50 }), 'D1');
    const e2 = env({ capturedN: 20, day: 'D2', goldGoal: 50, hero: e.HERO });
    e2.fns.requestBossChallenge(1);
    e2.fns.bossProgressTick({ cards: 0, gold: 100 }); // финальная gold-фаза
    assert.deepEqual(e2.HERO.bosses.defeated, [1]);
    assert.equal(e2.HERO.bosses.pendingReward, 1, 'босс ждёт выбора награды');
    assert.ok(e2.calls.toast.some((x) => x.t.indexOf('повержен') !== -1 && x.b.indexOf('Пастуший Посох') !== -1 && x.b.indexOf('венец') !== -1), 'тост: повержен + артефакт упомянут + выбор');
});

test('C5: bossArtifactMult — pending гасит артефакт, выбор crown снимает, artifact возвращает, легаси-дефолт цел', () => {
    // легаси: побеждён до C5, записи о выборе нет — артефакт работает (контракт wave-g2)
    const legacy = env({ capturedN: 20, hero: { bosses: { defeated: [1], activeNum: null, phase: 0, attemptDay: null, closedDay: null } } });
    assert.equal(legacy.fns.bossArtifactMult('tax', 1), 1.05, 'легаси-дефолт: артефакт без записи о выборе');
    // pending: выбор висит — артефакт не активен
    const pend = env({ capturedN: 20, hero: { bosses: { defeated: [1], pendingReward: 1 } } });
    assert.equal(pend.fns.bossArtifactMult('tax', 1), 1, 'pending: награда не выбрана — пассива нет');
    // выбран венец — артефакта нет
    const crown = env({ capturedN: 20, hero: { bosses: { defeated: [1], rewardChoice: { 1: 'crown' } } } });
    assert.equal(crown.fns.bossArtifactMult('tax', 1), 1, 'выбран венец — артефакта нет');
    // выбран артефакт — работает
    const art = env({ capturedN: 20, hero: { bosses: { defeated: [1], rewardChoice: { 1: 'artifact' } } } });
    assert.equal(art.fns.bossArtifactMult('tax', 1), 1.05, 'выбран артефакт — пассив работает');
});

test('C5: chooseBossReward crown — венец сезона +1 (кап 5), повторное предложение гаснет', () => {
    const e = env({ capturedN: 20, day: 'D1', season: { num: 1, start: 'D1', crownBonus: 0 }, hero: { bosses: { defeated: [1], pendingReward: 1 } } });
    e.fns.chooseBossReward('crown');
    assert.equal(e.HERO.bosses.pendingReward, null, 'выбор сделан');
    assert.equal(e.HERO.bosses.rewardChoice[1], 'crown');
    assert.equal(e.season.crownBonus, 1, 'венец сезона +1');
    assert.ok(e.calls.toast.some((x) => x.t.indexOf('Венец сезона') !== -1), 'тост венца');
    // кап: 5/5 — отказ, pending остаётся
    const capped = env({ capturedN: 20, day: 'D1', season: { num: 1, start: 'D1', crownBonus: 5 }, hero: { bosses: { defeated: [2], pendingReward: 2 } } });
    capped.fns.chooseBossReward('crown');
    assert.equal(capped.season.crownBonus, 5, 'кап не пробит');
    assert.equal(capped.HERO.bosses.pendingReward, 2, 'отказ — выбор остаётся висеть');
    assert.ok(capped.calls.toast.some((x) => x.k === 'blood'), 'отказ с ошибкой');
    // мусорный choice — игнор
    const junk = env({ capturedN: 20, day: 'D1', hero: { bosses: { defeated: [1], pendingReward: 1 } } });
    junk.fns.chooseBossReward('hack');
    assert.equal(junk.HERO.bosses.pendingReward, 1, 'неизвестный выбор проигнорирован');
});

test('C5: chooseBossReward ruin — восстанавливается самая дорогая руина; без руин — отказ', () => {
    const sh = [
        { captured: true, buildings: { zh1: { built: true, corruptionStage: 'ruin' }, df1: { built: true, corruptionStage: 'ruin' } } },
        { captured: true, buildings: { ec1: { built: true, corruptionStage: 'ok' } } }
    ];
    const e = env({ capturedN: 20, day: 'D1', strongholds: sh, hero: { bosses: { defeated: [1], pendingReward: 1 } } });
    assert.equal(e.fns.bossRuinCandidates().length, 2, 'две руины-кандидата');
    const best = e.fns.bestBossRuin(e.fns.bossRuinCandidates());
    assert.equal(best.id, 'df1', 'самая дорогая руина (df1 — Частокол дороже zh1)');
    e.fns.chooseBossReward('ruin');
    assert.equal(sh[0].buildings.df1.corruptionStage, 'ok', 'руина снята — постройка целая');
    assert.equal(sh[0].buildings.df1.debtDays, 0, 'долг обнулён (как новая постройка)');
    assert.equal(sh[0].buildings.zh1.corruptionStage, 'ruin', 'вторая руина не тронута');
    assert.equal(e.HERO.bosses.rewardChoice[1], 'ruin');
    // руин нет — отказ
    const clean = env({ capturedN: 20, day: 'D1', strongholds: [{ captured: true, buildings: { ec1: { built: true, corruptionStage: 'ok' } } }], hero: { bosses: { defeated: [2], pendingReward: 2 } } });
    clean.fns.chooseBossReward('ruin');
    assert.equal(clean.HERO.bosses.pendingReward, 2, 'без руин — отказ, выбор остаётся');
    assert.ok(clean.calls.toast.some((x) => x.k === 'blood'), 'отказ с ошибкой');
});

test('C5: chooseBossReward artifact — легаси-поведение награды, пассив включается', () => {
    const e = env({ capturedN: 20, day: 'D1', hero: { bosses: { defeated: [1], pendingReward: 1 } } });
    assert.equal(e.fns.bossArtifactMult('tax', 1), 1, 'до выбора пассива нет');
    e.fns.chooseBossReward('artifact');
    assert.equal(e.HERO.bosses.rewardChoice[1], 'artifact');
    assert.equal(e.fns.bossArtifactMult('tax', 1), 1.05, 'после выбора артефакт работает');
    assert.ok(e.calls.toast.some((x) => x.t.indexOf('Артефакт твой') !== -1), 'тост артефакта');
});

test('C5: maybePendingBossReward — висящий выбор предлагается снова, битый pending очищается', () => {
    const e = env({ capturedN: 20, day: 'D1', hero: { bosses: { defeated: [1], pendingReward: 1 } } });
    e.fns.maybePendingBossReward();
    assert.ok(e.calls.modal.some((x) => x === 1), 'модалка предложена (num=1)');
    const stale = env({ capturedN: 20, day: 'D1', hero: { bosses: { defeated: [], pendingReward: 42 } } });
    stale.fns.maybePendingBossReward();
    assert.equal(stale.HERO.bosses.pendingReward, null, 'битый номер вычищен');
});

// ----------------------------------------------------------------
// Схема v13: sanitizeHero + миграция v12→v13
// ----------------------------------------------------------------

test('C5: sanitizeHero bosses — introSeen/rewardChoice/pendingReward в whitelist, мусор вычищается', () => {
    const out = SG.sanitizeHero({ bosses: { defeated: [1], introSeen: [1, 2, 99, 'x', 2], rewardChoice: { 1: 'crown', 3: 'junk', 12: 'ruin', 5: 'artifact' }, pendingReward: 3 } });
    assert.deepEqual(out.bosses.introSeen, [1, 2], 'только валидные номера, дедуп');
    assert.deepEqual(out.bosses.rewardChoice, { 1: 'crown', 5: 'artifact' }, 'junk-значения и номера >11 выкинуты');
    assert.equal(out.bosses.pendingReward, 3);
});

test('C5: миграция v12→v13 — дефолты полей босс-арок, мусор клэмпится, idempotent', () => {
    const d = { v: 12, hero: { bosses: { defeated: [1], activeNum: null, phase: 0 } } };
    IV.migrateSyncData(d);
    assert.equal(d.v, 13);
    assert.deepEqual(d.hero.bosses.introSeen, [], 'дефолт introSeen');
    assert.deepEqual(d.hero.bosses.rewardChoice, {}, 'дефолт rewardChoice');
    assert.equal(d.hero.bosses.pendingReward, null, 'дефолт pendingReward');
    assert.deepEqual(d.hero.bosses.defeated, [1], 'победы не потеряны');
    const junk = { v: 12, hero: { bosses: { defeated: [1], introSeen: [99, 2, 2, 'x'], rewardChoice: { 1: 'crown', 2: 'hack', 15: 'ruin' }, pendingReward: 77 } } };
    IV.migrateSyncData(junk);
    assert.deepEqual(junk.hero.bosses.introSeen, [2], 'мусор выкинут, дедуп');
    assert.deepEqual(junk.hero.bosses.rewardChoice, { 1: 'crown' });
    assert.equal(junk.hero.bosses.pendingReward, null, 'битый pending → null');
    const noBosses = { v: 12, hero: { name: 'Безымянный' } };
    IV.migrateSyncData(noBosses);
    assert.ok(!noBosses.hero.bosses, 'без bosses-объекта — ленивые дефолты отдаются app.js');
    const snap = JSON.stringify(d.hero.bosses);
    IV.migrateSyncData(d);
    assert.equal(JSON.stringify(d.hero.bosses), snap, 'idempotent');
});

// ----------------------------------------------------------------
// Интеграции-контракты (source pins, паттерн wave-g2)
// ----------------------------------------------------------------

test('C5: интеграции в app.js — модалка, диспетчер, хук вступления, возврат pending', () => {
    assert.ok(app.indexOf('id="bossRewardModal"') === -1 && fs.readFileSync(path.join(root, 'index.html'), 'utf8').indexOf('id="bossRewardModal"') !== -1, 'модалка в index.html');
    assert.ok(app.indexOf("case 'boss-reward'") !== -1, 'кейс диспетчера выбора награды');
    assert.ok(app.indexOf("case 'close-boss-reward'") !== -1, 'кейс закрытия модалки');
    assert.ok(app.indexOf('maybeBossIntro(currentShIdx)') !== -1, 'хук вступления в sh-open');
    assert.ok(app.indexOf("if (view === 'strongholds' && typeof maybePendingBossReward === 'function') maybePendingBossReward();") !== -1, 'возврат незакрытого выбора при входе в Твердыни');
    assert.ok(app.indexOf('bossRewardModal: closeBossRewardModal') !== -1, 'Esc/оверлей-закрытие в MODAL_CLOSE_FNS');
    const sg = fs.readFileSync(path.join(root, 'js', 'state-guards.js'), 'utf8');
    assert.ok(sg.indexOf('introSeen') !== -1 && sg.indexOf('pendingReward') !== -1, 'sanitize новых полей');
    assert.equal(IV.SCHEMA_VERSION, 13, 'SCHEMA_VERSION 13');
});

// ----------------------------------------------------------------
// Харнесс (паттерн wave-g2: new Function + стабы)
// ----------------------------------------------------------------

const ARC_FNS = ['ensureBossesState', 'bossOf', 'provCaptured', 'provBossNum', 'bossAttemptAvailable', 'requestBossChallenge', 'bossEscalation', 'bossTodayStats', 'bossPhaseCheck', 'bossPhaseLabel', 'bossProgressTick', 'bossArtifactMult', 'bossCardHtml', 'maybeBossIntro', 'bossRuinCandidates', 'bestBossRuin', 'bossRewardOptionHtml', 'showBossRewardChoice', 'closeBossRewardModal', 'chooseBossReward', 'maybePendingBossReward', 'ensureSeason'];

function env({ day = 'D1', capturedN = 20, hero = null, goldGoal = 50, strongholds = null, season = null, extra = {} } = {}) {
    const calls = { toast: [], panel: [], modal: [] };
    const sh = strongholds || STRONGHOLDS.map((d, i) => ({ captured: i < capturedN }));
    const H = hero || { bosses: null };
    const stubs = Object.assign({
        HERO: H, STRONGHOLDS: STRONGHOLDS, BOSSES: BOSSES, BOSS_ARTIFACTS: BOSS_ARTIFACTS, BUILDINGS: BUILDINGS,
        strongholds: sh, ensureStrongholdState: () => {},
        getMSKDayKey: () => day, dailyGoldGoal: () => goldGoal, dailyQuests: null, currentShIdx: null,
        season: season, STATE_GUARDS: SG,
        document: { getElementById: function(id) { return null; } },
        showToast: (t, b, k) => calls.toast.push({ t: t, b: b, k: k }),
        sfxError: () => {}, sfxGoalComplete: () => {}, haptic: () => {}, saveSoon: () => {},
        renderStrongholdPanel: (i) => calls.panel.push(i)
    }, extra);
    const keys = Object.keys(stubs);
    const vals = keys.map((k) => stubs[k]);
    const decls = ARC_FNS.map(extractFn);
    // showBossRewardChoice в харнессе подменяется счётчиком вызовов (DOM-модалке нечего делать в node);
    // повторная декларация в sloppy-скоупе new Function перекрывает извлечённую — все вызовы идут в шим.
    const shim = 'function showBossRewardChoice(b) { if (b && typeof b.num === "number") (typeof __modalSink === "function") && __modalSink(b.num); }';
    const names = ARC_FNS.map((n) => n + ': ' + n).join(', ');
    const fns = new Function(...keys, '__modalSink', decls.join('\n') + '\n' + shim + '\nreturn { ' + names + ' };')(...vals, (num) => calls.modal.push(num));
    return { fns: fns, HERO: H, season: stubs.season, calls: calls, strongholds: sh };
}
