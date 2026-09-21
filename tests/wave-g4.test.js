// tests/wave-g4.test.js — Г4 «Total War: управление провинциями»: эдикты, порядок, восстания, стойки, ресурсы
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { STRONGHOLDS } = require(path.join(__dirname, '..', 'js', 'stronghold-data.js'));

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const sgSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'state-guards.js'), 'utf8');

function g4Core() {
  const marker = app.indexOf('Г4 «Total War: управление провинциями»');
  const start = app.lastIndexOf('/*', marker);
  const end = app.indexOf('function requestEdict'); // включает grantRevoltTask/tryResolveRevoltTask/revoltResolvable
  assert.ok(marker > -1 && end > start, 'Г4-ядро найдено');
  return app.slice(start, end);
}

const CLAMP = (sgSrc.match(/function clampNumber[\s\S]*?\n    \}/) || [null, null])[0]; // реальный хелпер из state-guards
function sg(m) {
  const body = (CLAMP || 'function clampNumber(v,min,max,f){var n=Number(v);if(!Number.isFinite(n))return f;return Math.max(min,Math.min(max,n));}') + '\n' + m[0] + '\nreturn { sanitizeSeason: (typeof sanitizeSeason !== "undefined") ? sanitizeSeason : null, sanitizeSiege: (typeof sanitizeSiege !== "undefined") ? sanitizeSiege : null };';
  return new Function(body + '')();
}
const MATH_WITH = (rand) => { // статик-методы Math не enumerable — Object.assign их не копирует
  const m = {};
  for (const k of Object.getOwnPropertyNames(Math)) m[k] = (typeof Math[k] === 'function') ? Math[k].bind(Math) : Math[k];
  m.random = rand;
  return m;
};

function core(picks) {
  const body = g4Core() + '\nvar hasTech = (typeof hasTech === "function") ? hasTech : function() { return false; };' +
    '\nvar techOrderDrift = (typeof techOrderDrift === "function") ? techOrderDrift : function() { return 1; };' +
    '\nvar techOrderFloor = (typeof techOrderFloor === "function") ? techOrderFloor : function() { return 0; };' +
    '\nvar techRevoltMult = (typeof techRevoltMult === "function") ? techRevoltMult : function() { return 1; };' + // Г5-Т-стабы: нейтральные дефолты
    '\nvar TECH_IDEA = (typeof TECH_IDEA !== "undefined") ? TECH_IDEA : null;' + // Г5-Т2: идея не выбрана в стабах
    '\nreturn [' + picks.join(',') + '];';
  const fn = new Function('STRONGHOLDS', 'strongholds', 'ensureSeason', 'HERO', 'EDICTS_LABEL_PROV', 'TASKS', 'taskIdCounter', 'builtList', 'ruinAllBuildings', 'showToast', 'sfxFail', 'haptic', 'saveSoon', 'siege', 'Math', 'document', 'addChronicle', body);
  return fn;
}

const season = { num: 1, start: '2026-09-01', crownBonus: 0, snapshot: {}, edicts: {}, order: {}, lastRevoltDay: {}, resource: {} };
const SH = STRONGHOLDS;

test('Г4: sanitizeSeason принимает Г4-поля (edicts/order/lastRevoltDay/resource) с клампом', () => {
  const m = sgSrc.match(/function sanitizeSeason[\s\S]*?\n    \}/);
  assert.ok(m, 'sanitizeSeason извлечён');
  const SG = sg(m);
  const s = SG.sanitizeSeason({
    num: 2, start: '2026-09-01', crownBonus: 1, snapshot: {},
    edicts: { 1: 'tax', 2: 'hack', 3: 'order' },
    order: { 1: 120, 2: -5 },
    lastRevoltDay: { 1: '2026-09-20', 2: 'nope' },
    resource: { 1: 555, 2: -1 }
  }, '2026-09-20');
  assert.deepEqual(s.edicts, { 1: 'tax', 3: 'order' }, 'мусорный эдикт отброшен');
  assert.equal(s.order[1], 100, 'order кламп ≤100');
  assert.equal(s.order[2], 0, 'order кламп ≥0');
  assert.equal(s.lastRevoltDay[1], '2026-09-20');
  assert.equal(s.lastRevoltDay['2'], undefined, 'битый день отброшен');
  assert.equal(s.resource[1], 555, 'resource в норме сохраняется');
  assert.equal(s.resource[2], 0, 'resource кламп ≥0');
  const sBig = SG.sanitizeSeason({ num: 1, start: '2026-09-01', snapshot: {}, resource: { 1: 5555 } }, '2026-09-20');
  assert.equal(sBig.resource[1], 999, 'resource кламп ≤999');
  const s2 = SG.sanitizeSeason({ num: 1, start: '2026-09-01', crownBonus: 0, snapshot: {} }, '2026-09-20');
  assert.equal(s2.edicts, undefined, 'без Г4-полей во входе — поля не добавляются (байт-стабильный раундтрип старых сейвов)');
});

test('Г4: sanitizeSiege stance — whitelist', () => {
  const m = sgSrc.match(/function sanitizeSiege[\s\S]*?\n    \}/);
  const SG = sg(m);
  assert.equal(SG.sanitizeSiege({ stance: 'defend' }).stance, 'defend');
  assert.equal(SG.sanitizeSiege({ stance: 'hack' }).stance, null);
  assert.equal(SG.sanitizeSiege({}).stance, null);
});

test('Г4: provOrder/provResource дефолты 75/0; revoltRisk 0 при order≥70 или неполной провинции, до 30% при 0', () => {
  const picks = ['provOrder', 'provResource', 'revoltRisk', 'provEdict'];
  const f = core(picks);
  const [provOrder, provResource, revoltRisk, provEdict] = f(SH, SH.map(() => ({ captured: true })), () => season, { gold: 1000 });
  assert.equal(provOrder(1), 75, 'нейтральный дефолт порядка 75');
  assert.equal(provResource(2), 0, 'нейтральный дефолт ресурса 0');
  assert.equal(provEdict(3), null, 'без эдикта');
  assert.equal(revoltRisk(1), 0, '75 ≥ 70 → риск 0');
  const partial = f(SH, SH.map((d, i) => ({ captured: i < 4 })), () => season, { gold: 1000 }); // 4 из 5 в пров I
  assert.equal(partial[2](1), 0, 'неполная провинция не бунтует');
  const angry = core(['provOrder', 'revoltRisk'])(SH, SH.map(() => ({ captured: true })), () => ({ ...season, order: { 1: 10 } }), { gold: 1000 }, null, [], 1, null, null, null, null, null, null, {}, MATH_WITH(() => 0), {});
  assert.equal(angry[1](1), 0.30, 'order 10 → риск 60% клампится до 30%');
  const calm = core(['provOrder', 'revoltRisk'])(SH, SH.map(() => ({ captured: true })), () => ({ ...season, order: { 1: 69 } }), { gold: 1000 }, null, [], 1, null, null, null, null, null, null, {}, MATH_WITH(() => 0.5), {});
  assert.ok(calm[1](1) > 0 && calm[1](1) <= 0.01 + 1e-9, 'order 69 → 1%');
});

test('Г4: roll-контракт восстания — Math.random>=0.7 не бунтует (пины симов живы)', () => {
  const f = core(['revoltRisk']);
  const strong = SH.map(() => ({ captured: true }));
  [0, 0.2, 0.4, 0.6, 0.8, 0.99].forEach((pin) => {
    const [revoltRisk] = f(SH, strong, () => season, { gold: 1000 }, null, [], 1, null, null, null, null, null, null, {}, { random: () => pin }, {});
    assert.equal(revoltRisk(1), 0, 'нейтральный order=75: любое зерно не бунтует (пин ' + pin + ')');
  });
});

test('Г4: мультипликаторы — tax ×1.25, levy ×1.5, resources +2%/ед, стойки upkeep/atk/def', () => {
  const f = core(['edictTaxMult', 'edictLevyMult', 'provResourceMult', 'stanceUpkeepMult', 'stanceAtkMult', 'stanceDefMult', 'stanceFogPierce']);
  const cap = SH.map(() => ({ captured: true }));
  const [edictTaxMult, edictLevyMult, provResourceMult, stanceUpkeepMult, stanceAtkMult, stanceDefMult, stanceFogPierce] =
    f(SH, cap, () => ({ ...season, edicts: { 1: 'tax', 2: 'levy', 3: 'order' }, resource: { 1: 3 } }), { gold: 1000 }, null, [], 1, null, null, null, null, null, null, { stance: 'assault' });
  assert.equal(edictTaxMult(1), 1.25, 'Военный налог ×1.25');
  assert.equal(edictTaxMult(3), 0.9, 'Указ о порядке ×0.9');
  assert.equal(edictTaxMult(4), 1, 'без эдикта ×1 (нейтральный дефолт симов)');
  assert.equal(edictLevyMult(2), 1.5, 'Набор ×1.5');
  assert.equal(provResourceMult(1), 1.06, '3 ед ресурса → ×1.06');
  assert.equal(stanceUpkeepMult(), 1.25, 'Штурм: содержание ×1.25');
  assert.equal(stanceAtkMult(), 1.15, 'Штурм: атака ×1.15');
  assert.equal(stanceDefMult(), 1, 'Штурм: оборона без бонуса');
  const eco = core(['stanceUpkeepMult', 'stanceAtkMult', 'stanceDefMult', 'stanceFogPierce'])(SH, cap, () => season, { gold: 1000 }, null, [], 1, null, null, null, null, null, null, { stance: 'economy' });
  assert.equal(eco[0](), 0.75, 'Экономия: содержание ×0.75');
  assert.equal(eco[1](), 0.90, 'Экономия: атака ×0.9');
  assert.equal(eco[2](), 0.90, 'Экономия: оборона ×0.9');
  const scout = core(['stanceFogPierce'])(SH, cap, () => season, { gold: 1000 }, null, [], 1, null, null, null, null, null, null, { stance: 'scout' });
  assert.equal(scout[0](), true, 'Разведка прокалывает туман');
});

test('Г4: revolt-задача — normal, без награды, терминальное снятие через chest_open', () => {
  const cap = SH.map(() => ({ captured: true }));
  const cap2 = SH.map((d, i) => ({ captured: i < 6, buildings: i === 5 ? { zh1: { built: true }, zh2: { built: true } } : {} })); // sh06 (i=5, Нагорье) захвачен с 2 постройками
  const TASKS = [];
  let counter = 1;
  const fn = core(['grantRevoltTask', 'tryResolveRevoltTask', 'revoltResolvable', 'provOrder'])(
    SH, cap2, () => ({ ...season, order: { 2: 65 } }), { gold: 0 },
    (p) => ({ 1: 'Низовья', 2: 'Нагорье', 3: 'Приморье', 4: 'Пепельный Чертог' })[p] || ('Провинция ' + p),
    TASKS, counter, (i) => Object.keys((cap2[i] && cap2[i].buildings) || {}),
    null, // ruinAllBuildings
    () => {}, null, null, null, { week: 3 }, MATH_WITH(() => 0.01), null
  );
  const [grantRevoltTask, tryResolveRevoltTask, revoltResolvable] = fn;
  grantRevoltTask(2);
  assert.equal(TASKS.length, 1, 'revolt-задача создана');
  assert.equal(TASKS[0].tier, 'normal', 'тир normal (владелец: без награды)');
  assert.ok(TASKS[0].name.indexOf('🔥 Восстание:') === 0 && TASKS[0].name.indexOf('Нагорье') > 0, 'имя с провинцией');
  grantRevoltTask(2);
  assert.equal(TASKS.length, 1, 'без дублей');
  const t = { name: '🔥 Восстание: подавить мятеж в Нагорье' };
  assert.equal(revoltResolvable(t), true, 'sh06 captured c 2 постройками → разрешима');
  assert.equal(tryResolveRevoltTask(t), true, 'разрешение прошло');
  assert.equal(t.status, 'chest_open', 'терминальный статус без сундука и награды');
  const t2 = { name: '🔥 Восстание: подавить мятеж в Приморье' };
  assert.equal(revoltResolvable(t2), false, 'Приморье не захвачено — не разрешима');
});

test('Г4: провинциальный order — resolveProvinceOrder двигает к эдиктам (клампы), revolt ставит lastRevoltDay+сброс week', () => {
  const cap = SH.map(() => ({ captured: true }));
  const season2 = { num: 1, start: '2026-09-01', crownBonus: 0, snapshot: {}, edicts: { 1: 'order' }, order: { 1: 100, 2: 50 }, lastRevoltDay: {}, resource: {} };
  const TASKS = [];
  const fn = core(['resolveProvinceOrder', 'checkRevolts', 'provOrder', 'provLastRevoltDay'])(
    SH, cap, () => season2, { gold: 1000 },
    (p) => ({ 1: 'Низовья', 2: 'Нагорье' })[p] || 'X',
    TASKS, 1, null, () => {}, () => {},     () => {}, () => {}, () => {}, { week: 5 }, MATH_WITH(() => 0.0), { getElementById: () => null }, () => {}
  );
  const [resolveProvinceOrder, checkRevolts] = fn;
  resolveProvinceOrder();
  const s = season2;
  assert.equal(s.order[1], 100, 'Указ о порядке у потолка: +1 клампится к 100');
  assert.equal(s.order[2], 51, 'базовый дрейф +1');
  assert.equal(s.order[3], 76, 'новая провинция стартует с дефолта 75 и растёт');
  const fired = checkRevolts('2026-09-20'); // random=0.0 < риск при order 51 пров II
  void resolveProvinceOrder;
  assert.ok(fired, 'восстание вспыхнуло при нулевом зерне и порядке 51');
  assert.equal(s.lastRevoltDay[2], '2026-09-20', 'lastRevoltDay записан');
  assert.equal(cap[fired.idx].captured, false, 'твердыня пала');
});
