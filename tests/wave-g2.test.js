'use strict';
// Волна Г2 стадия 1 «Поверенные Тьмы»: боссы провинций (очередь I..XI по 4 провинциям каталога),
// фазы 4 типов, 1 попытка/день, победа+артефакт, провинциальные пассивы, эскалация ×1.5 к XI.
// Паттерн wave-g1: extractFn + buildIn — топ-левел app.js не исполняется.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const SD = require('../js/stronghold-data.js');
const SG = require('../js/state-guards.js');
const STRONGHOLDS = SD.STRONGHOLDS;
const BOSSES = SD.BOSSES;
const BOSS_ARTIFACTS = SD.BOSS_ARTIFACTS;

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

const BOSS_FNS = ['ensureBossesState', 'bossEscalation', 'bossOf', 'provCaptured', 'provBossNum', 'bossNodeIdx', 'bossActiveFor', 'bossAttemptAvailable', 'requestBossChallenge', 'bossTodayStats', 'bossPhaseCheck', 'bossPhaseLabel', 'bossProgressTick', 'bossArtifactMult', 'bossCardHtml'];

function bossEnv({ day = 'D1', capturedN = 20, hero = null, quests = null, goldGoal = 50 } = {}) {
    const calls = { toast: [], panel: [] };
    const strongholds = STRONGHOLDS.map((d, i) => ({ captured: i < capturedN }));
    const H = hero || { bosses: null };
    const decls = BOSS_FNS.map(extractFn);
    const stubs = {
        HERO: H, STRONGHOLDS: STRONGHOLDS, BOSSES: BOSSES, BOSS_ARTIFACTS: BOSS_ARTIFACTS,
        strongholds: strongholds, ensureStrongholdState: () => {},
        getMSKDayKey: () => day, dailyGoldGoal: () => goldGoal,
        dailyQuests: quests, currentShIdx: null,
        showToast: (t, b, k) => calls.toast.push({ t: t, b: b, k: k }),
        sfxError: () => {}, sfxGoalComplete: () => {}, haptic: () => {}, saveSoon: () => {},
        renderStrongholdPanel: (i) => calls.panel.push(i)
    };
    const keys = Object.keys(stubs);
    const fns = new Function(...keys, decls.join('\n') + '\nreturn { ensureBossesState: ensureBossesState, bossEscalation: bossEscalation, bossOf: bossOf, provCaptured: provCaptured, provBossNum: provBossNum, bossNodeIdx: bossNodeIdx, bossActiveFor: bossActiveFor, bossAttemptAvailable: bossAttemptAvailable, requestBossChallenge: requestBossChallenge, bossTodayStats: bossTodayStats, bossPhaseCheck: bossPhaseCheck, bossPhaseLabel: bossPhaseLabel, bossProgressTick: bossProgressTick, bossArtifactMult: bossArtifactMult, bossCardHtml: bossCardHtml };')(...keys.map((k) => stubs[k]));
    return { fns: fns, HERO: H, calls: calls };
}

// ----------------------------------------------------------------
// Каталог: 11 боссов, артефакты 4/3/2/1/1, очередь по 4 провинциям
// ----------------------------------------------------------------
test('Г2-1: каталог 11 боссов — имена, 3 фазы валидных типов, артефакты 4×tax/3×attrition/2×def/1×xp/1×cost', () => {
    assert.equal(BOSSES.length, 11);
    assert.equal(BOSS_ARTIFACTS.length, 11);
    const validTypes = ['cards', 'quests', 'gold', 'streak'];
    BOSSES.forEach((b) => {
        assert.ok(b.name && b.icon && b.lore, 'имя/иконка/лор у ' + b.num);
        assert.equal(b.phases.length, 3, '3 фазы у ' + b.name);
        b.phases.forEach((ph) => assert.ok(validTypes.indexOf(ph.type) !== -1, 'тип фазы ' + ph.type));
    });
    const kinds = {};
    BOSS_ARTIFACTS.forEach((a) => { kinds[a.kind] = (kinds[a.kind] || 0) + 1; });
    assert.deepEqual(kinds, { tax: 4, attrition: 3, def: 2, xp: 1, cost: 1 });
    // очередь по провинциям: I–III→пров.1, IV–VI→пров.2, VII–IX→пров.3, X–XI→пров.4
    assert.deepEqual(BOSSES.map((b) => b.prov), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4]);
    assert.equal(BOSSES[0].name, 'Гнилоух, Пастух Чумных Стад');
    assert.equal(BOSSES[10].name, 'Царь-Облупленный');
});

// ----------------------------------------------------------------
// Доступность: провинция собрана → корона на первом узле провинции
// ----------------------------------------------------------------
test('Г2-1: доступность — босс доступен на первом узле собранной провинции, недобор/частичная очередь закрывают', () => {
    const full = bossEnv({ capturedN: 20 });
    assert.equal(full.fns.bossNodeIdx(1), 0);
    assert.equal(full.fns.bossNodeIdx(4), 15, 'первый узел пров.4 = sh16 (idx 15)');
    assert.equal(full.fns.bossActiveFor(0), 1, 'пров.1 собрана → босс I на узле 0');
    assert.equal(full.fns.bossActiveFor(1), null, 'корона только на первом узле провинции');
    assert.equal(full.fns.bossActiveFor(15), 10, 'пров.4 → босс X на узле 15');
    const partial = bossEnv({ capturedN: 4 }); // sh05 (idx 4) не захвачена — пров.1 не собрана
    assert.equal(partial.fns.bossActiveFor(0), null);
    // босс I побеждён → очередь двигается к II, потом пусто
    const queue = bossEnv({ capturedN: 20, hero: { bosses: { defeated: [1], activeNum: null, phase: 0, attemptDay: null, closedDay: null } } });
    assert.equal(queue.fns.bossActiveFor(0), 2);
    const done = bossEnv({ capturedN: 20, hero: { bosses: { defeated: [1, 2, 3], activeNum: null, phase: 0, attemptDay: null, closedDay: null } } });
    assert.equal(done.fns.bossActiveFor(0), null, 'все боссы пров.1 повержены — короны нет');
});

// ----------------------------------------------------------------
// Фазы 4 типов: cards / quests / gold / streak (+эскалация)
// ----------------------------------------------------------------
test('Г2-1: фазы 4 типов закрываются/проваливаются на статах дня', () => {
    const e = bossEnv({});
    const st = { cards: 3, questsAll: true, gold: 100, streakAlive: true };
    assert.equal(e.fns.bossPhaseCheck({ type: 'cards', n: 3 }, st, 1), true);
    assert.equal(e.fns.bossPhaseCheck({ type: 'cards', n: 3 }, Object.assign({}, st, { cards: 2 }), 1), false);
    assert.equal(e.fns.bossPhaseCheck({ type: 'quests' }, st, 1), true);
    assert.equal(e.fns.bossPhaseCheck({ type: 'quests' }, Object.assign({}, st, { questsAll: false }), 1), false);
    assert.equal(e.fns.bossPhaseCheck({ type: 'gold', mult: 2 }, st, 1), true, 'цель 2×50=100, заработано 100');
    assert.equal(e.fns.bossPhaseCheck({ type: 'gold', mult: 2 }, Object.assign({}, st, { gold: 99 }), 1), false);
    assert.equal(e.fns.bossPhaseCheck({ type: 'streak' }, st, 1), true);
    assert.equal(e.fns.bossPhaseCheck({ type: 'streak' }, Object.assign({}, st, { streakAlive: false }), 1), false);
});

test('Г2-1: эскалация ×1.5 к XI — цели фаз масштабируются', () => {
    const e = bossEnv({});
    assert.equal(e.fns.bossEscalation(1), 1);
    assert.ok(Math.abs(e.fns.bossEscalation(11) - 1.5) < 1e-9, 'XI = ×1.5');
    assert.equal(e.fns.bossPhaseCheck({ type: 'cards', n: 5 }, { cards: 8 }, 1.5), true, 'ceil(5×1.5)=8');
    assert.equal(e.fns.bossPhaseCheck({ type: 'cards', n: 5 }, { cards: 7 }, 1.5), false);
    assert.equal(e.fns.bossPhaseCheck({ type: 'gold', mult: 3 }, { gold: 225 }, 1.5), true, 'ceil(3×50×1.5)=225');
    assert.equal(e.fns.bossPhaseCheck({ type: 'gold', mult: 3 }, { gold: 224 }, 1.5), false);
    assert.ok(e.fns.bossPhaseLabel({ type: 'gold', mult: 2 }, 1).indexOf('100') !== -1, 'лейбл показывает эскалированную цель');
});

// ----------------------------------------------------------------
// 1 попытка/день: вызов, повтор в тот же день, продолжение завтра
// ----------------------------------------------------------------
test('Г2-1: 1 попытка/день — повтор отклонён, завтра попытка обновлена, босс продолжается', () => {
    const e = bossEnv({ day: 'D1', capturedN: 20 });
    assert.equal(e.fns.bossAttemptAvailable(), true);
    e.fns.requestBossChallenge(1);
    assert.equal(e.HERO.bosses.activeNum, 1);
    assert.equal(e.HERO.bosses.phase, 0);
    assert.equal(e.HERO.bosses.attemptDay, 'D1');
    assert.equal(e.fns.bossAttemptAvailable(), false);
    e.fns.requestBossChallenge(1); // повтор в тот же день
    assert.equal(e.HERO.bosses.attemptDay, 'D1', 'попытка не сбрасывается');
    assert.equal(e.calls.toast.some((x) => x.k === 'blood'), true, 'отказ с тостом');
    // фаза прогрессирует только в день попытки
    e.fns.bossProgressTick({ cards: 3, questsAll: false, gold: 0, streakAlive: true });
    assert.equal(e.HERO.bosses.phase, 1, 'фаза 1/3 закрыта');
    // завтра: попытка снова доступна, тот же босс продолжается с фазы 1
    const e2 = bossEnv({ day: 'D2', capturedN: 20, hero: e.HERO });
    assert.equal(e2.fns.bossAttemptAvailable(), true);
    e2.fns.requestBossChallenge(1);
    assert.equal(e2.HERO.bosses.activeNum, 1, 'босс не сбрасывается');
    assert.equal(e2.HERO.bosses.phase, 1, 'продолжение с закрытой фазы');
    assert.equal(e2.HERO.bosses.attemptDay, 'D2');
});

// ----------------------------------------------------------------
// Победа: все 3 фазы → defeated + артефакт; closedDay — 1 фаза/день; провал дня сжигает попытку, фаза цела
// ----------------------------------------------------------------
test('Г2-1: победа над боссом I (cards→streak→gold×2 по дням) — defeated+тост артефакта', () => {
    const e = bossEnv({ day: 'D1', capturedN: 20 });
    e.fns.requestBossChallenge(1);
    e.fns.bossProgressTick({ cards: 3, questsAll: false, gold: 0, streakAlive: true });
    assert.equal(e.HERO.bosses.phase, 1);
    e.fns.bossProgressTick({ cards: 99, streakAlive: true }); // closedDay D1: вторая фаза в тот же день закрыться не может
    assert.equal(e.HERO.bosses.phase, 1, 'closedDay — одна фаза в день');
    const e2 = bossEnv({ day: 'D2', capturedN: 20, hero: e.HERO });
    e2.fns.requestBossChallenge(1);
    e2.fns.bossProgressTick({ cards: 5, streakAlive: true });
    assert.equal(e2.HERO.bosses.phase, 2);
    const e3 = bossEnv({ day: 'D3', capturedN: 20, hero: e2.HERO, goldGoal: 50 });
    e3.fns.requestBossChallenge(1);
    e3.fns.bossProgressTick({ cards: 0, gold: 99 }); // цель 2×50×1=100 — провал дня
    assert.equal(e3.HERO.bosses.phase, 2, 'провал дня не трогает фазу');
    e3.fns.bossProgressTick({ cards: 0, gold: 100 });
    assert.deepEqual(e3.HERO.bosses.defeated, [1], 'босс I повержен');
    assert.equal(e3.HERO.bosses.activeNum, null);
    assert.equal(e3.HERO.bosses.phase, 0);
    assert.ok(e3.calls.toast.some((x) => x.t.indexOf('повержен') !== -1 && x.b.indexOf('Пастуший Посох') !== -1), 'тост победы с артефактом');
    // без попытки дня тик не работает
    const e4 = bossEnv({ day: 'D9', capturedN: 20, hero: e3.HERO });
    e4.fns.bossProgressTick({ cards: 9, gold: 999 });
    assert.deepEqual(e4.HERO.bosses.defeated, [1], 'attemptDay ≠ сегодня — тишина');
});

// ----------------------------------------------------------------
// Пассивы артефактов: провинциальные tax/attrition/def, глобальные xp/cost, вкл/выкл
// ----------------------------------------------------------------
test('Г2-1: пассивы артефактов — вкл/выкл, провинциальный скоуп, xp/cost глобальные', () => {
    const off = bossEnv({ hero: { bosses: { defeated: [], activeNum: null, phase: 0, attemptDay: null, closedDay: null } } });
    ['tax', 'attrition', 'def', 'xp', 'cost'].forEach((k) => assert.equal(off.fns.bossArtifactMult(k, 1), 1, k + ' выключен'));
    const on = bossEnv({ hero: { bosses: { defeated: [1, 2, 6, 9, 11], activeNum: null, phase: 0, attemptDay: null, closedDay: null } } });
    assert.equal(on.fns.bossArtifactMult('tax', 1), 1.05, 'артефакт I: +5% налог пров.1');
    assert.equal(on.fns.bossArtifactMult('tax', 2), 1, 'артефакт I не действует в пров.2');
    assert.equal(on.fns.bossArtifactMult('attrition', 1), 0.9, 'артефакт II: −10% потерь');
    assert.equal(on.fns.bossArtifactMult('def', 2), 1.05, 'артефакт VI (пров.2): +5% обороны');
    assert.equal(on.fns.bossArtifactMult('xp', 3), 1.10, 'артефакт IX: +10% XP глобально');
    assert.equal(on.fns.bossArtifactMult('cost', 4), 0.85, 'артефакт XI: −15% цена построек');
});

// ----------------------------------------------------------------
// Карточка босса в панели + whitelist sanitizeHero
// ----------------------------------------------------------------
test('Г2-1: карточка босса рендерится сверху панели — вызов/фазы/артефакт', () => {
    const e = bossEnv({ day: 'D1', capturedN: 20 });
    const card = e.fns.bossCardHtml(0);
    assert.ok(card.indexOf('boss-card') !== -1 && card.indexOf('Гнилоух') !== -1, 'карточка с боссом пров.1');
    assert.ok(card.indexOf('⚔ Бросить вызов') !== -1, 'кнопка вызова');
    assert.ok(card.indexOf('Фаза 1/3') !== -1 && card.indexOf('Фаза 3/3') !== -1, '3 фазы в карточке');
    assert.ok(card.indexOf('Пастуший Посох') !== -1, 'артефакт в карточке');
    e.fns.requestBossChallenge(1);
    const active = e.fns.bossCardHtml(0);
    assert.ok(active.indexOf('Вызов принят') !== -1 && active.indexOf('Бросить вызов') === -1, 'вызов принят — фаза активна, кнопки нет');
    const burned = bossEnv({ day: 'D1', capturedN: 20, hero: { bosses: { defeated: [], activeNum: null, phase: 0, attemptDay: 'D1', closedDay: null } } }).fns.bossCardHtml(0);
    assert.ok(burned.indexOf('Попытка сегодня использована') !== -1, 'попытка дня израсходована вне активного вызова');
    const empty = bossEnv({ capturedN: 4 }).fns.bossCardHtml(0);
    assert.equal(empty, '', 'провинция не собрана — карточки нет');
});

test('Г2-1: sanitizeHero whitelist bosses — мусор → безопасная форма', () => {
    const out = SG.sanitizeHero({ bosses: { defeated: [1, 'x', 11, 11, 99], activeNum: 5, phase: 7, attemptDay: '2026-09-19', closedDay: null } });
    assert.deepEqual(out.bosses.defeated, [1, 11], 'только валидные num, дедуп');
    assert.equal(out.bosses.activeNum, 5);
    assert.equal(out.bosses.phase, 2, 'кламп 0..2');
    assert.equal(out.bosses.attemptDay, '2026-09-19');
    const junk = SG.sanitizeHero({ bosses: 'garbage' });
    assert.deepEqual(junk.bosses, { defeated: [], activeNum: null, phase: 0, attemptDay: null, closedDay: null });
    const none = SG.sanitizeHero({});
    assert.deepEqual(none.bosses.defeated, []);
});

// ----------------------------------------------------------------
// Интеграции-контракты (source pins, паттерн wave2)
// ----------------------------------------------------------------
test('Г2-1: интеграции пассивов и хуков в app.js', () => {
    assert.ok(app.indexOf("bossArtifactMult('xp')") !== -1, 'XP completeCard');
    assert.equal((app.match(/bossArtifactMult\('tax'/g) || []).length, 2, 'налог: тик + панель-превью');
    assert.ok(app.indexOf("bossArtifactMult('attrition'") !== -1, 'штурм: attrition');
    assert.ok(app.indexOf("bossArtifactMult('def'") !== -1, 'defBonusOf');
    assert.ok(app.indexOf("bossArtifactMult('cost'") !== -1, 'buildCostOf');
    assert.equal((app.match(/bossProgressTick\(\)/g) || []).length, 3, 'хуки: completeCard/goldGain/completeDailyQuest');
    assert.ok(extractFn('kingdomMapHtml').indexOf('km-boss') !== -1 && extractFn('kingdomMapHtml').indexOf('Босс доступен') !== -1, 'маркер короны на карте');
    assert.ok(app.indexOf('bossCardHtml(idx)') !== -1, 'карточка сверху панели');
    assert.ok(app.indexOf("case 'boss-challenge'") !== -1, 'кейс диспетчера');
    const sg = fs.readFileSync(path.join(root, 'js', 'state-guards.js'), 'utf8');
    assert.ok(sg.indexOf('bosses: (function(bs)') !== -1, 'whitelist в sanitizeHero');
});

// ===================== Г2-2 «Глазами ворона»: погода; Г2-3: лазутчик =====================

const WEATHER_FNS = ['weatherOf', 'weatherNorth', 'weatherSouth', 'weatherUpkeepMult', 'weatherTaxMult', 'weatherFog'];
const extractWeather = () => new Function(WEATHER_FNS.map(extractFn).join('\n') + '\nreturn { weatherOf: weatherOf, weatherNorth: weatherNorth, weatherSouth: weatherSouth, weatherUpkeepMult: weatherUpkeepMult, weatherTaxMult: weatherTaxMult, weatherFog: weatherFog };')();

test('Г2-2: weatherOf детерминирован — типы ясно/туман/засуха/метель, чистая функция без сейва', () => {
    const w = extractWeather();
    assert.deepEqual(w.weatherOf(1, 1, 1), { id: 'clear', icon: '☀', name: 'Ясно' }, 'пров1 сезон1 нед1 ясно');
    assert.equal(w.weatherOf(3, 1, 1).id, 'fog', 'пров3 сезон1 нед1 туман');
    assert.equal(w.weatherOf(2, 1, 1).id, 'drought', 'пров2 сезон1 нед1 засуха');
    assert.equal(w.weatherOf(1, 1, 13).id, 'blizzard', 'пров1 сезон1 нед13 метель');
    assert.deepEqual(w.weatherOf(2, 2, 7), w.weatherOf(2, 2, 7), 'детерминизм: одинаковый вызов = одинаковый результат');
});

test('Г2-2: эффекты погоды вкл/выкл — гейт север/юг (метель ×2 upkeep только север 1-2, засуха ×0.75 налог только юг 3-4)', () => {
    const w = extractWeather();
    assert.equal(w.weatherUpkeepMult(1, 1, 13), 2, 'метель+север: содержание ×2');
    assert.equal(w.weatherUpkeepMult(2, 1, 12), 2, 'метель+север (пров2): содержание ×2');
    assert.equal(w.weatherUpkeepMult(4, 1, 3), 1, 'не метель: содержание ×1');
    assert.equal(w.weatherTaxMult(4, 1, 3), 0.75, 'засуха+юг (пров4): налог ×0.75');
    assert.equal(w.weatherTaxMult(3, 1, 4), 0.75, 'засуха+юг (пров3): налог ×0.75');
    assert.equal(w.weatherTaxMult(2, 1, 1), 1, 'засуха на севере: налог без эффекта');
    assert.equal(w.weatherFog(3, 1, 1), true, 'пров3 сезон1 нед1 — туман');
    assert.equal(w.weatherFog(1, 1, 1), false, 'пров1 сезон1 нед1 — не туман');
});

test('Г2-2: пин-окна симов — сезон 1, недели 1-4: захваты пров 1-2 без метели, неделя 1 без эффектной засухи (контракт acceptance/parity/strongholds)', () => {
    const w = extractWeather();
    const hits = [];
    for (let wk = 1; wk <= 4; wk++) for (let p = 1; p <= 2; p++) {
        if (w.weatherOf(p, 1, wk).id === 'blizzard') hits.push('upkeep/sn1/wk' + wk + '/prov' + p); // фиксстуры симов держат captured prov 1-2 (sh01-sh06/sh10): метель севера сдвинула бы пины upkeep 21/28/31
    }
    for (let p = 1; p <= 4; p++) {
        if (w.weatherOf(p, 1, 1).id === 'drought' && w.weatherSouth(p)) hits.push('tax/sn1/wk1/prov' + p); // parity 20/20 (11526) и кампания 50 дней сидированы на неделю 1: засуха юга сдвинула бы налог
    }
    assert.deepEqual(hits, [], 'в пин-окнах экономика не сдвигается — пороги фичи сжаты под симы (засухи wk3-4 на пров 3-4 безопасны: там не захвачено в эконом-пинах)');
});

test('Г2-2: frontPowerText — туман прячет силу фронта, свежая тень её прокалывает', () => {
    const decls = WEATHER_FNS.concat(['weatherSeasonWeek', 'frontPowerText', 'scoutFresh', 'daysBetween']).map(extractFn);
    const strongholds = STRONGHOLDS.map((d, i) => ({ captured: i < 11 }));
    const H = { scouts: null };
    const stubs = {
        STRONGHOLDS: STRONGHOLDS, strongholds: strongholds, HERO: H,
        ensureSeason: () => ({ num: 1, start: '2026-09-01' }), siege: { week: 1 },
        getMSKDayKey: () => '2026-01-05'
    };
    const keys = Object.keys(stubs);
    const fns = new Function(...keys, decls.join('\n') + '\nreturn { frontPowerText: frontPowerText };')(...keys.map((k) => stubs[k]));
    assert.ok(fns.frontPowerText(10).indexOf('туман: сила скрыта') !== -1, 'туман: сила скрыта (sh11 пров3, сезон1 нед1)');
    assert.ok(fns.frontPowerText(10).indexOf('отправь тень') !== -1, 'совет «отправь тень»');
    H.scouts = { idx: 10, readyDayKey: '2026-01-05' }; // свежая тень (готова сегодня)
    assert.ok(fns.frontPowerText(10).indexOf('Сила нейтралов: 1100') !== -1, 'тень проколола туман: точная сила');
    assert.ok(fns.frontPowerText(11).indexOf('туман: сила скрыта') !== -1, 'тень другой твердыни не прокалывает');
});

function scoutEnv({ day = '2026-01-05', gold = 100, scouts = null, capturedN = 11 } = {}) {
    const calls = { toast: [] };
    const H = { gold: gold, scouts: scouts };
    const decls = WEATHER_FNS.concat(['weatherSeasonWeek', 'scoutFresh', 'scoutAdvice', 'requestScout', 'daysBetween']).map(extractFn);
    const stubs = {
        STRONGHOLDS: STRONGHOLDS, HERO: H,
        strongholds: STRONGHOLDS.map((d, i) => ({ captured: i < capturedN })),
        ensureSeason: () => ({ num: 1, start: '2026-09-01' }), siege: { week: 1 },
        getMSKDayKey: (ts) => (ts === undefined ? day : '2026-01-06'),
        esc: (s) => s,
        showToast: (t, b, k) => calls.toast.push({ t: t, b: b }),
        sfxError: () => {}, haptic: () => {}, saveSoon: () => {}, renderStrongholds: () => {},
        techScoutCost: () => 50, // Г5-Т3: стаб (Сеть Осведомителей не куплена — канон 50💰)
        hasTech: () => false // Г5-Т3: технологий нет
    };
    const keys = Object.keys(stubs);
    const fns = new Function(...keys, decls.join('\n') + '\nreturn { requestScout: requestScout, scoutFresh: scoutFresh, scoutAdvice: scoutAdvice };')(...keys.map((k) => stubs[k]));
    return { fns: fns, HERO: H, calls: calls };
}

test('Г2-3: лазутчик — совет тактики по ratio (штурм/ложный отход/казармы)', () => {
    const e = scoutEnv();
    assert.ok(e.fns.scoutAdvice(1.5).indexOf('штурмуй') !== -1, 'ratio >1.2: штурм');
    assert.ok(e.fns.scoutAdvice(1.0).indexOf('Ложный отход') !== -1, 'ratio 0.9-1.2: ложный отход');
    assert.ok(e.fns.scoutAdvice(0.5).indexOf('казармы') !== -1, 'ratio <0.9: казармы');
    assert.ok(e.fns.scoutAdvice(0).indexOf('Обороны нет') !== -1, 'ratio 0: без обороны');
});

test('Г2-3: гейт 50💰 + одна тень за раз + срок годности 3 дня', () => {
    const poor = scoutEnv({ gold: 40, capturedN: 10 });
    poor.fns.requestScout(10);
    assert.equal(poor.HERO.gold, 40, 'без 50💰 тень не уходит');
    assert.equal(poor.HERO.scouts, null, 'разведка не назначена');
    assert.ok(poor.calls.toast.some((t) => t.t.indexOf('Казна пуста') !== -1), 'тост про казну');

    const e = scoutEnv({ gold: 100, capturedN: 10 });
    e.fns.requestScout(10);
    assert.equal(e.HERO.gold, 50, 'списано ровно 50💰');
    assert.deepEqual(e.HERO.scouts, { idx: 10, readyDayKey: '2026-01-06' }, 'тень: idx + завтра');
    e.fns.requestScout(10); // вторая тень в тот же день (idx 10 не захвачен — доходит до гейта «одна тень за раз»)
    assert.equal(e.HERO.gold, 50, 'вторая тень за день не списывает');
    assert.equal(e.HERO.scouts.idx, 10, 'первая тень не перезаписана');
    assert.ok(e.calls.toast.some((t) => t.t.indexOf('уже в деле') !== -1), 'тост «одна тень за раз»');

    const cap = scoutEnv({ gold: 100, capturedN: 6 });
    cap.fns.requestScout(5); // sh06 захвачена
    assert.equal(cap.HERO.gold, 100, 'захваченную твердыню не разведывают');

    const f = scoutEnv().fns;
    assert.equal(f.scoutFresh({ idx: 1, readyDayKey: '2026-01-06' }, '2026-01-05'), 'pending', 'готова завтра');
    assert.equal(f.scoutFresh({ idx: 1, readyDayKey: '2026-01-05' }, '2026-01-05'), 'fresh', 'готова сегодня');
    assert.equal(f.scoutFresh({ idx: 1, readyDayKey: '2026-01-03' }, '2026-01-05'), 'fresh', 'день готовности +2 ещё свежа');
    assert.equal(f.scoutFresh({ idx: 1, readyDayKey: '2026-01-02' }, '2026-01-05'), null, 'день готовности +3 — истекла');
});

test('Г2-2/Г2-3: интеграционные пины — экономика/тревога/карта/кейс/сброс тени/whitelist', () => {
    assert.equal((app.match(/weatherTaxMult\(/g) || []).length, 3, 'налог: shIncomePerDay + тик + 1 внутри самой функции');
    assert.equal((app.match(/weatherUpkeepMult\(/g) || []).length, 3, 'upkeep: определение + shUpkeepPerDay + тик');
    assert.equal((app.match(/weatherTaxMult\(STRONGHOLDS\[i\]\.prov/g) || []).length, 2, 'налог-интеграции: панель + тик');
    assert.equal((app.match(/weatherUpkeepMult\(STRONGHOLDS\[i\]\.prov/g) || []).length, 2, 'upkeep-интеграции: панель + тик');
    assert.ok(extractFn('siegeAlarmPreview').indexOf('weatherFog') !== -1 && extractFn('siegeAlarmPreview').indexOf('🌫 ?') !== -1, 'туман прячет силу в осадной тревоге');
    assert.ok(extractFn('kingdomMapHtml').indexOf('km-weather') !== -1 && extractFn('kingdomMapHtml').indexOf('km-wi') !== -1, 'полоса погоды на карте');
    assert.ok(extractFn('frontPowerText').indexOf('туман: сила скрыта') !== -1, 'фронт-карточка прячет силу в тумане');
    assert.ok(app.indexOf("case 'sh-scout'") !== -1, 'кейс диспетчера sh-scout');
    assert.ok(app.indexOf('Тень (50💰)') !== -1, 'кнопка лазутчика в панели');
    assert.ok(app.indexOf("scoutFresh(HERO.scouts, todayKey) === null") !== -1, 'сброс истёкшей тени в checkDailyReset');
    const sg = fs.readFileSync(path.join(root, 'js', 'state-guards.js'), 'utf8');
    assert.ok(sg.indexOf('scouts: (function(sc)') !== -1, 'whitelist scouts в sanitizeHero');
    const SGA = require('../js/state-guards.js');
    const hero = SGA.sanitizeHero ? SGA.sanitizeHero({ scouts: { idx: 7, readyDayKey: '2026-01-06' } }) : null;
    if (hero) assert.deepEqual(hero.scouts, { idx: 7, readyDayKey: '2026-01-06' }, 'sanitizeHero пропускает валидную тень');
});
// Г2-2/Г2-3 конец стадии 2

// ================================================================
// Г2-4: Комбо-гримуар — 8 комбо статов за один день, whitelist, UI
// ================================================================
const ST = { str: 1, end: 1, int: 1, cha: 1, wil: 1, agi: 1 };
const COMBOS_SRC = (app.match(/var COMBOS = \[[\s\S]*?\n\];/) || [null])[0];
assert.ok(COMBOS_SRC, 'COMBOS literal found');
const COMBOS = new Function('return ' + COMBOS_SRC.replace(/^var COMBOS = /, ''))();

function comboEnv({ counts = {}, found = [], day = 'D1', done = {}, gold = 0, shields = 0 } = {}) {
    const calls = { toast: [], gold: [], xp: [], grimoire: [] };
    const H = { dayStatCounts: JSON.parse(JSON.stringify(counts)), combosFound: found.slice(), combosToday: JSON.parse(JSON.stringify(done)), comboDayXp: null, gold: gold, streakShields: shields, xp: 0, totalXp: 0 };
    const siege = { wkSkips: 0, wkTaskFails: 0 };
    const decls = ['comboCountsMet', 'checkCombos', 'comboApplyEffect', 'renderGrimoire', 'comboHint'].map(extractFn);
    const stubs = { HERO: H, COMBOS: COMBOS, STATS: ST, siege: siege, getMSKDayKey: () => day,
        showToast: (t, b, k) => calls.toast.push({ t: t, b: b, k: k }),
        goldGain: (n) => calls.gold.push(n), recordXpEvent: (n) => calls.xp.push(n),
        document: { getElementById: (id) => { var box = { innerHTML: '' }; calls.grimoire.push(box); return box; } }, // реальный renderGrimoire: контейнер есть → рисует HTML
        sfxGoalComplete: () => {}, haptic: () => {} };
    const keys = Object.keys(stubs);
    const fns = new Function(...keys, decls.join('\n') + '\nreturn { comboCountsMet: comboCountsMet, checkCombos: checkCombos, comboApplyEffect: comboApplyEffect, renderGrimoire: renderGrimoire, comboHint: comboHint };')(...keys.map((k) => stubs[k]));
    return { fns: fns, HERO: H, siege: siege, calls: calls };
}

test('Г2-4: каталог COMBOS — 8 шт, id уникальны, need валиден (пара/тройка/3-разных/any)', () => {
    assert.equal(COMBOS.length, 8);
    const ids = COMBOS.map((c) => c.id);
    assert.deepEqual(ids, ['fortress', 'blades', 'axis', 'focus', 'harmony', 'triumvirate', 'vortex', 'dawn']);
    COMBOS.forEach((c) => {
        assert.ok(c.name && c.icon && c.desc, c.id + ': name/icon/desc заполнены');
        if (c.need === 3) return; // «Гармония» — три разных
        assert.ok(Array.isArray(c.need) && c.need.length >= 1 && c.need.length <= 3, c.id + ': need массив 1..3');
        c.need.forEach((s) => assert.ok(ST[s], c.id + ': стат ' + s + ' существует'));
    });
    const fns = comboEnv().fns;
    assert.ok(fns.comboCountsMet(COMBOS.find((c) => c.id === 'fortress'), { str: 1, end: 1 }));
});

test('Г2-4: comboCountsMet — пары, Триумвират ×3, Гармония 3-разных, Фокус wil+any', () => {
    const { comboCountsMet: met } = comboEnv().fns;
    const by = (id) => COMBOS.find((c) => c.id === id);
    assert.equal(met(by('fortress'), { str: 1, end: 1 }), true, 'str+end');
    assert.equal(met(by('fortress'), { str: 1, agi: 1 }), false, 'нет vit');
    assert.equal(met(by('triumvirate'), { str: 3 }), true, 'str×3');
    assert.equal(met(by('triumvirate'), { str: 2, agi: 1 }), false, '2×str не хватает');
    assert.equal(met(by('harmony'), { str: 1, agi: 1, wil: 1 }), true, '3 разных');
    assert.equal(met(by('harmony'), { str: 3 }), false, '1 стат ×3 не Гармония');
    assert.equal(met(by('focus'), { wil: 1, agi: 1 }), true, 'wil+any');
    assert.equal(met(by('focus'), { wil: 1 }), false, 'wil без пары');
    assert.equal(met(by('vortex'), { agi: 2 }), true, 'agi+agi');
    assert.equal(met(by('vortex'), { agi: 1 }), false, '1×agi');
    assert.equal(met(by('dawn'), { wil: 1, end: 1 }), true, 'wil+vit');
});

test('Г2-4: checkCombos — срабатывание → эффект+тост+combosFound, однократно в день, завтра снова', () => {
    const e = comboEnv({ counts: { str: 1, end: 1 }, day: 'D1' });
    e.fns.checkCombos(20);
    assert.deepEqual(e.HERO.combosFound, ['fortress'], 'открыт в гримуаре');
    assert.equal(e.calls.toast.length, 1, 'тост при комбо');
    assert.ok(e.calls.toast[0].t.indexOf('Крепость духа') !== -1);
    assert.ok(e.calls.xp.length === 1 && e.calls.xp[0] > 0, 'фортресс: +30% XP обеим (one-shot по факту пары)');
    assert.equal(e.calls.grimoire.length, 1, 'гримуар перерисован');
    assert.ok(e.calls.grimoire[0].innerHTML.indexOf('Крепость духа') !== -1, 'найденное комбо — полное имя');
    e.fns.checkCombos(20); // повторно в тот же день
    assert.equal(e.calls.toast.length, 1, 'однократность в день');
    assert.deepEqual(e.HERO.combosFound, ['fortress']);
    // завтра: счётчики дня сброшены — не срабатывает; повтор пары — срабатывает
    const e2 = comboEnv({ counts: {}, found: ['fortress'], day: 'D2' });
    e2.fns.checkCombos(20);
    assert.equal(e2.calls.toast.length, 0, 'новый день без карт — тишина');
    const e3 = comboEnv({ counts: { str: 1, end: 1 }, found: ['fortress'], day: 'D2' });
    e3.fns.checkCombos(20);
    assert.equal(e3.calls.toast.length, 1, 'комбо повторяемо на новый день');
    assert.deepEqual(e3.HERO.combosFound, ['fortress'], 'без дублей в гримуаре');
});

test('Г2-4: эффекты комбо — blades/triumvirate/dawn золото, axis гнев, focus щит, vortex dayXp', () => {
    const e1 = comboEnv({ counts: { agi: 1, str: 1 } });
    e1.fns.checkCombos(0);
    assert.ok(e1.calls.gold.indexOf(4) !== -1, 'Танец клинков: +2💰 каждая (×2)');
    const e2 = comboEnv({ counts: { str: 3 } });
    e2.fns.checkCombos(0);
    assert.ok(e2.calls.gold.indexOf(20) !== -1, 'Триумвират: +20💰');
    const e3 = comboEnv({ counts: { end: 2 }, });
    e3.siege.wkSkips = 2;
    e3.fns.checkCombos(0);
    assert.equal(e3.siege.wkSkips, 1, 'Ось покоя: −1 гнев');
    const e4 = comboEnv({ counts: { wil: 1, end: 1 }, shields: 5 });
    e4.fns.checkCombos(0);
    assert.equal(e4.HERO.streakShields, 6, 'Фокус: +1 щит');
    assert.ok(e4.calls.gold.indexOf(5) !== -1, 'Страж рассвета: +5💰');
    const e5 = comboEnv({ counts: { agi: 2 } });
    e5.fns.checkCombos(0);
    assert.equal(e5.HERO.comboDayXp, 1.1, 'Вихрь: +10% XP дня');
});

test('Г2-4: sanitizeHero whitelist — combosFound/dayStatCounts/combosToday/comboDayXp', () => {
    const out = SG.sanitizeHero({ combosFound: ['fortress', 'nope', 'fortress', 42], dayStatCounts: { str: 2, bad: -5, agi: 1 }, combosToday: { fortress: 'D1', junk: 'D2' }, comboDayXp: 1.1 });
    assert.deepEqual(out.combosFound, ['fortress'], 'мусор отфильтрован, дедуп');
    assert.deepEqual(out.dayStatCounts, { str: 2, agi: 1 }, 'кламп/чистка счётчика');
    assert.deepEqual(out.combosToday, { fortress: 'D1' }, 'ключи-мусор отброшены');
    assert.equal(out.comboDayXp, 1.1);
    const bad = SG.sanitizeHero({ combosFound: 'junk', dayStatCounts: [1], combosToday: null, comboDayXp: 99 });
    assert.deepEqual(bad.combosFound, []);
    assert.deepEqual(bad.dayStatCounts, {});
    assert.deepEqual(bad.combosToday, {});
    assert.equal(bad.comboDayXp, null, 'Вихрь-множитель только 1.1 или null');
});

test('Г2-4: интеграционные пины — completeCard/checkDailyReset/renderCards/index.html/css', () => {
    assert.ok(app.indexOf('HERO.dayStatCounts[card.stat] = (HERO.dayStatCounts[card.stat] || 0) + 1;') !== -1, 'счётчик статов дня в completeCard');
    assert.ok(app.indexOf('checkCombos(finalXp)') !== -1, 'триггер комбо в completeCard');
    assert.ok(/finalXp = [^;]*HERO\.comboDayXp/.test(app), 'Вихрь-множитель в finalXp');
    assert.ok(app.indexOf('HERO.dayStatCounts = {}; HERO.combosToday = {}; HERO.comboDayXp = null;') !== -1, 'сутки комбо сброшены в checkDailyReset');
    assert.ok(/renderOneCard\(all\[_ri\], grid\);\n    if \(_ri < all\.length\) requestAnimationFrame\(renderChunk\); else renderGrimoire\(\);/.test(app), 'чанк-рендер завершает гримуаром');
    assert.ok(app.indexOf('renderGrimoire();\nreturn;') !== -1, 'пустая колода рисует гримуар');
    const TDZ_OK = app.indexOf('var COMBOS = [') < app.indexOf('renderCards();');
    assert.ok(TDZ_OK, 'COMBOS объявлен выше первого топ-левел вызова renderCards()');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(html.indexOf('id="grimoireBox"') !== -1, 'контейнер гримуара в Колоде');
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    assert.ok(css.indexOf('.grimoire-box') !== -1 && css.indexOf('.grimoire-cell.found') !== -1, 'CSS гримуара');
});

// ===================== Г2-5: ВОЗНЕСЕНИЕ =====================
const ascEnv = (N, captured = 10) => new Function('HERO', 'DAILY_GOLD_BASE', 'capturedCount',
    extractFn('ascEnemyMult') + '\n' + extractFn('bossEscalation') + '\n' + extractFn('dailyGoldGoal') + '\n' + extractFn('ascensionPalClass') +
    '\nreturn { ascEnemyMult: ascEnemyMult, bossEscalation: bossEscalation, dailyGoldGoal: dailyGoldGoal, ascensionPalClass: ascensionPalClass };'
)({ ascension: N }, 50, () => captured);

test('Г2-5: множители — ascEnemyMult ×(1+0.25N), bossEscalation ×1.2^N, dailyGoldGoal ×1.2^N (кап тоже ×1.2^N)', () => {
    const e0 = ascEnv(0), e1 = ascEnv(1), e2 = ascEnv(2, 20);
    assert.equal(e0.ascEnemyMult(), 1, 'N=0 → ×1');
    assert.ok(Math.abs(e1.ascEnemyMult() - 1.25) < 1e-9, 'N=1 → ×1.25');
    assert.ok(Math.abs(e2.ascEnemyMult() - 1.5) < 1e-9, 'N=2 → ×1.5');
    assert.ok(Math.abs(e0.bossEscalation(11) - 1.5) < 1e-9, 'N=0: XI ×1.5');
    assert.ok(Math.abs(e1.bossEscalation(11) - 1.8) < 1e-9, 'N=1: XI ×1.8');
    assert.equal(e1.dailyGoldGoal(), 180, 'цель (50+10×10)=150 ×1.2 = 180');
    assert.equal(e2.dailyGoldGoal(), 288, 'цель 250×1.44=360 > кап 200×1.44=288');
});

test('Г2-5: артефакты ×0.5 (bossArtifactMult Half-режим)', () => {
    const xpNum = SD.BOSS_ARTIFACTS.filter(function(a) { return a.kind === 'xp'; })[0].num;
    const mk = (N, nums) => bossEnv({ hero: { bosses: { defeated: nums, activeNum: null, phase: 0, attemptDay: null, closedDay: null }, ascension: N }, capturedN: 4 });
    assert.ok(Math.abs(mk(0, [1]).fns.bossArtifactMult('tax', 1) - 1.05) < 1e-9, 'до вознесения +5%');
    assert.ok(Math.abs(mk(1, [1]).fns.bossArtifactMult('tax', 1) - 1.025) < 1e-9, 'после ×0.5: +2.5%');
    assert.ok(Math.abs(mk(1, [xpNum]).fns.bossArtifactMult('xp') - 1.05) < 1e-9, 'xp +10% → +5%');
});

test('Г2-5: палитра asc-N по N%3 (пепел/кровь/звёзды)', () => {
    const e = ascEnv(0);
    assert.equal(e.ascensionPalClass(0), '');
    assert.equal(e.ascensionPalClass(1), 'asc-1');
    assert.equal(e.ascensionPalClass(2), 'asc-2');
    assert.equal(e.ascensionPalClass(3), 'asc-3');
    assert.equal(e.ascensionPalClass(4), 'asc-1', 'цикл %3');
    assert.ok(extractFn('applyAscensionPalette').indexOf('classList.add(cls)') !== -1, 'apply на буте');
});

test('Г2-5: инварианты вознесения — сохранено/сброшено (source-контракты)', () => {
    const src = extractFn('performAscension');
    assert.ok(src.indexOf('Math.floor((HERO.gold || 0) * 0.1)') !== -1, 'казна 10%');
    assert.ok(src.indexOf('HERO.ascension = (HERO.ascension || 0) + 1') !== -1, 'N++');
    assert.ok(src.indexOf('strongholds = null; ensureStrongholdState()') !== -1, 'твердыни/постройки заново');
    assert.ok(src.indexOf('retriedThisWeek: false') !== -1, 'siege fresh');
    assert.ok(src.indexOf('sanitizeSeason({ num: 1') !== -1, 'Сезон 1 нового круга');
    assert.ok(src.indexOf('HERO.doctrines[keptTier] = keepId') !== -1, 'одна доктрина на выбор');
    assert.ok(src.indexOf('throne = 0') !== -1, 'трон 5/5 → 0');
    assert.ok(src.indexOf('tower.floor') === -1, 'башня сохраняется (не упоминается в сбросе)');
    assert.ok(src.indexOf('combosFound') === -1, 'гримуар сохраняется (не тронут)');
});

test('Г2-5: интеграции — гейт throne 5/5, кнопка, кейс, ×3 call-site врага, бут-палитра, whitelist', () => {
    assert.ok(extractFn('requestAscension').indexOf('throne < 5') !== -1, 'гейт трон 5/5');
    assert.ok(extractFn('renderStrongholdPanel').indexOf('data-action="ascend"') !== -1, 'кнопка «✨ Вознестись» в трон-панели');
    assert.ok(app.indexOf("case 'ascend': requestAscension();") !== -1 && app.indexOf("case 'asc-doctrine': pickAscensionDoctrine(el.dataset.id);") !== -1, 'кейсы диспетчера');
    assert.equal((app.match(/\* ascEnemyMult\(\)/g) || []).length, 3, '3 call-site SM.siegePower ×множитель');
    assert.ok(app.indexOf('Math.pow(1.2, HERO.ascension || 0)') !== -1, '×1.2^N в bossEscalation/dailyGoldGoal');
    assert.ok(app.indexOf('applyAscensionPalette(); // Г2-5') !== -1, 'палитра на буте после loadGameState');
    const sg = fs.readFileSync(path.join(root, 'js', 'state-guards.js'), 'utf8');
    assert.ok(sg.indexOf('ascension: Math.max(0, Math.round(clampNumber') !== -1, 'whitelist в sanitizeHero');
    const out = SG.sanitizeHero({ ascension: 7 });
    assert.equal(out.ascension, 7, 'валидный N проходит');
    assert.equal(SG.sanitizeHero({ ascension: -3 }).ascension, 0, 'отрицательное → 0');
    assert.equal(SG.sanitizeHero({ ascension: 'x' }).ascension, 0, 'мусор → 0');
    assert.equal(SG.sanitizeHero({}).ascension, 0, 'нет поля → 0');
});
