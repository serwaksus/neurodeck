// tests/wave-g5t.test.js — Г5-Т «Технологии провинций»: каталог, гейты покупки, мультипликаторы, дневной тик
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function techCore() {
  const start = app.indexOf('Г5-Т: технологии провинций');
  assert.ok(start > -1, 'Г5-Т ядро найдено');
  const begin = app.indexOf('var TECHS', start); // объявления идут ПОСЛЕ маркера — поиск вперёд (lastIndexOf дал -1)
  const end = app.indexOf('function showTechs');
  assert.ok(end > begin, 'срез ядра валиден');
  return app.slice(begin, end);
}

// Харнесс: techDailyTick зовёт provOrder/hasTech (Г4-функции вне среза) — подставляем управляемые стабы
function build(picks, state) {
  const stubs =
    'var hasTech = function(id) { return !!(state.TECHS[id]); };' +
    'var provOrder = function(p) { var v = state.order[String(p)]; return (typeof v === "number") ? v : 75; };' +
    'var provEdict = function(p) { return state.edicts && state.edicts[String(p)] || null; };'; // Г5-Т: рост ресурса требует активного Указа о порядке (канон-пины)
  const body = stubs + '\n' + techCore() + '\nTECHS = state.TECHS; TECH_PTS = state.pts;\nreturn [' + picks.join(',') + '];'; // реассайн ПОСЛЕ var-деклараций ядра (var перезаписывает параметр — зонд доказал 0/2)
  const fn = new Function('state', 'provCapturedCount', 'provResource', 'ensureSeasonFields', 'provKey', 'TECHS', 'TECH_PTS', 'showToast', 'sfxForge', 'haptic', 'saveSoon', body);
  const resObj = state.resObj || {};
  return fn(
    state,
    state.pc || (() => 5),
    (p) => resObj[String(p)] || 0, // читает ТОТ ЖЕ resObj, куда spendRes списывает (state.res — расщепление, зонд 100≠12)
    (k) => { if (k === 'resource') return { resource: resObj }; return {}; },
    (p) => String(p),
    state.TECHS || {},
    state.pts || 0,
    () => {}, () => {}, () => {}, () => {}
  );
}

test('Г5-Т: каталог 12 технологий, 3 ветви × 4 тира, цены валидны', () => {
  const TREE = new Function(techCore() + '\nreturn TECH_TREE;')();
  assert.equal(Object.keys(TREE).length, 12, '12 нод дерева');
  const branches = {};
  for (const [id, t] of Object.entries(TREE)) {
    branches[t.br] = branches[t.br] || [];
    branches[t.br].push(t.tier);
    assert.ok(t.res > 0 && t.pts > 0, t.name + ': цены положительны');
    assert.ok(t.desc.length > 5, t.name + ': описан');
  }
  assert.deepEqual(Object.keys(branches).length, 3, '3 ветви');
  for (const b of Object.values(branches)) assert.deepEqual(b.sort().join(''), '1234', '4 тира в ветви');
  assert.equal(TREE.w1.res, 8, 'тир 1 = 8 ресурсов');
  assert.equal(TREE.w4.pts, 9, 'тир 4 = 9 очков');
});

test('Г5-Т: buyTech — гейты (тир-цепь, очки, ресурсы) и списание', () => {
  const s1 = { TECHS: {}, pts: 2, res: 20, resObj: { 1: 20 } };
  const b1 = build(['buyTech', 'resPool', 'TECHS', 'TECH_PTS'], s1);
  assert.equal(b1[0]('e1'), null, 'тир 1 куплен');
  assert.equal(b1[2].e1, true, 'флаг выставлен');
  assert.equal(b1[1](), 12, 'списано 8 ресурсов (20−8)');
  const b2 = build(['buyTech'], { TECHS: {}, pts: 9, res: 50 });
  assert.ok(String(b2[0]('e2')).includes('предыдущий'), 'без тир-1 тир-2 не купить');
  const b3 = build(['buyTech'], { TECHS: {}, pts: 1, res: 50 });
  assert.ok(String(b3[0]('e1')).includes('очков'), 'мало очков');
  const b4 = build(['buyTech'], { TECHS: {}, pts: 9, res: 4 });
  assert.ok(String(b4[0]('e1')).includes('ресурсов'), 'мало ресурсов');
  const b5 = build(['buyTech'], { TECHS: { e1: true }, pts: 9, res: 50 });
  assert.ok(String(b5[0]('e1')).includes('изучено'), 'дабл-пей закрыт');
});

test('Г5-Т: мультипликаторы — полный набор и нейтральный дефолт (симы/пины живы)', () => {
  const full = build(['techTaxMult', 'techAtkMult', 'techAttrMult', 'techDefMult', 'techEdictCostMult', 'techRevoltMult', 'techOrderDrift', 'techOrderFloor'], { TECHS: { e1: true, e4: true, w2: true, w3: true, w4: true, w1: true, c2: true, c3: true, c1: true, c4: true } });
  assert.equal(full[0](), 1.05 * 1.07, 'налог 1.05×1.07');
  assert.equal(full[1](), 1.10 * 1.05, 'атака 1.10×1.05');
  assert.equal(full[2](), 0.9, 'аттриция ×0.9');
  assert.equal(full[3](), 1.10, 'оборона ×1.1');
  assert.equal(full[4](), 0.75, 'эдикты ×0.75');
  assert.equal(full[5](), 0.75, 'восстания ×0.75');
  assert.equal(full[6](), 2, 'дрейф порядка +2');
  assert.equal(full[7](), 50, 'пол порядка 50');
  const none = build(['techTaxMult', 'techAtkMult', 'techAttrMult', 'techDefMult', 'techOrderDrift', 'techOrderFloor'], { TECHS: {} });
  assert.equal(none[0](), 1, 'налог ×1');
  assert.equal(none[1](), 1, 'атака ×1');
  assert.equal(none[2](), 1, 'аттриция ×1');
  assert.equal(none[3](), 1, 'оборона ×1');
  assert.equal(none[4](), 1, 'дрейф +1');
  assert.equal(none[5](), 0, 'пол 0');
});

test('Г5-Т: techDailyTick — ресурсы +2 (+1 за e3) ТОЛЬКО под Указом о порядке (нейтрал не растёт — канон-пины), кап 999; очки +1/пров при ≥85', () => {
  const order = { 1: 99, 2: 80, 3: 60, 4: 75 }; // ≥85: только 1 → 1 очко; ≥70+эдикт: 1,2 → рост
  const resObj = { 1: 998, 2: 10, 3: 0, 4: 500 };
  const f = build(['techDailyTick'], { TECHS: { e3: true }, order, resObj, resArr: resObj, edicts: { 1: 'order', 2: 'order' } });
  const out = f[0]('2026-09-21');
  assert.equal(out.pts, 1, 'очки только за порядок ≥85 (пров. 1)');
  assert.equal(resObj[1], 999, 'кап 999 (998+3: +2 база +1 e3)');
  assert.equal(resObj[2], 13, '10+3 (e3) — эдикт есть');
  assert.equal(resObj[3], 0, 'порядок 60 — не растёт');
  assert.equal(resObj[4], 500, 'порядок 75 без эдикта — нейтрал не растёт (канон-пины)');
});
