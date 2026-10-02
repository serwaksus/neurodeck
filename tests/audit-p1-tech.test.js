'use strict';
// Аудит 2026-10-02, раздел 2 (дерево технологий):
//   2.3 — ветви 🕯 (s), 🏗 (g), 🕊 (d) проверяли пререквизиты ветви ⚖ (c): techBranchLetter знал только w/e/c;
//   + потеря купленных технологий на загрузке: `.slice(0, 21)` в applySyncData/MIGRATIONS[11] оставлял первые 21 ключ
//     из до 48 нод дерева, остальное молча пропадало (каждая загрузка, каждая облачная синхронизация).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SG = require('../js/state-guards.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'js', 'storage.js'), 'utf8');

// ---- харнесс ядра технологий (как в wave-g5t): срез app.js от `var TECHS` до `function showTechs` ----
function techCore() {
  const start = app.indexOf('Г5-Т: технологии провинций');
  assert.ok(start > -1, 'Г5-Т ядро найдено');
  const begin = app.indexOf('var TECHS', start);
  const end = app.indexOf('function showTechs');
  assert.ok(end > begin, 'срез ядра валиден');
  return app.slice(begin, end);
}
function build(picks, state) {
  const stubs =
    'var hasTech = function(id) { return !!(state.TECHS[id]); };' +
    'var provOrder = function() { return 75; };' +
    'var provEdict = function() { return null; };';
  const body = stubs + '\n' + techCore() + '\nTECHS = { owned: state.TECHS, lvl: state.LVL || {} }; TECH_PTS = state.pts || 0; TECH_IDEA = null;\nreturn [' + picks.join(',') + '];';
  const resObj = state.resObj || {};
  const fn = new Function('state', 'capturedCount', 'provCapturedCount', 'provResource', 'ensureSeasonFields', 'provKey', 'TECHS', 'TECH_PTS', 'showToast', 'sfxForge', 'haptic', 'saveSoon', body);
  return fn(
    state,
    state.cap || (() => 20),
    state.pc || (() => 5),
    (p) => resObj[String(p)] || 0,
    (k) => (k === 'resource' ? { resource: resObj } : {}),
    (p) => String(p),
    state.TECHS || {}, state.pts || 0,
    () => {}, () => {}, () => {}, () => {}
  );
}
const own = (letter, upTo) => { const o = {}; for (let i = 1; i <= upTo; i++) o[letter + i] = true; return o; };
const merge = (...parts) => Object.assign({}, ...parts);
const gate = (techs) => build(['techPrevOwnedStrict'], { TECHS: techs })[0];

// ===================== 2.3: буква ветви и пререквизиты =====================
test('2.3: techBranchLetter — шесть значков → шесть букв; буква и тир каждой ноды дерева совпадают с её id', () => {
  const [letter, TREE] = build(['techBranchLetter', 'TECH_TREE'], { TECHS: {} });
  const map = { '⚔': 'w', '💰': 'e', '⚖': 'c', '🕯': 's', '🏗': 'g', '🕊': 'd' };
  for (const [br, L] of Object.entries(map)) assert.equal(letter(br), L, 'значок ' + br);
  assert.equal(letter('?'), '', 'неизвестная ветвь не маскируется под c');
  assert.equal(Object.keys(TREE).length, 48);
  for (const [id, t] of Object.entries(TREE)) {
    assert.equal(letter(t.br), id[0], id + ': ветвь ' + t.br + ' → буква id');
    assert.equal(t.tier, Number(id[1]), id + ': тир');
  }
});

test('2.3: s/g/d — тир N открывается своим тиром N−1 (раньше — тиром ветви c); c1 не открывает s2/g2/d2', () => {
  for (const L of ['s', 'g', 'd']) {
    assert.equal(gate({ [L + '1']: true })(L + '2'), true, L + '1 открывает ' + L + '2');
    assert.equal(gate({ c1: true })(L + '2'), false, 'c1 не открывает ' + L + '2 (чужая ветвь)');
    assert.equal(gate({})(L + '2'), false, 'без тира 1 тир 2 закрыт');
    assert.equal(gate({})(L + '1'), true, 'тир 1 всегда доступен');
  }
});

test('2.3: цепь тиров 1–4 линейна во всех шести ветвях; пропуск тира закрывает следующий', () => {
  for (const L of ['w', 'e', 'c', 's', 'g', 'd']) {
    for (let t = 2; t <= 4; t++) {
      assert.equal(gate(own(L, t - 1))(L + t), true, L + t + ': своя цепь до ' + (t - 1));
      const gap = own(L, t - 2); // нет тира t−1
      assert.equal(gate(gap)(L + t), false, L + t + ': без ' + L + (t - 1));
    }
  }
});

test('2.3: кросс-требование тиров 5–8 — развитие в ДВУХ других ветвях из пяти; свои тиры не считаются; c — не особая ветвь', () => {
  // s5: своя цепь до s4 + в двух других ветвях сумма освоенных тиров ≥ 3 (тиры 1+2)
  assert.equal(gate(merge(own('s', 4), own('g', 2), own('d', 2)))('s5'), true, 's5 ← g и d');
  assert.equal(gate(merge(own('s', 4), own('c', 2), own('w', 2)))('s5'), true, 's5 ← c и w');
  assert.equal(gate(merge(own('s', 4), own('g', 2)))('s5'), false, 's5 с одной ветвью — закрыт');
  assert.equal(gate(own('s', 4))('s5'), false, 's5: свои тиры в кросс-счёт не входят');
  assert.equal(gate(merge(own('s', 4), own('g', 1), own('d', 1)))('s5'), false, 'тир 1 в двух ветвях — мало');
  // d5/g5 симметричны (раньше проверяли только w и e)
  assert.equal(gate(merge(own('g', 4), own('s', 2), own('d', 2)))('g5'), true, 'g5 ← s и d');
  assert.equal(gate(merge(own('d', 4), own('w', 2), own('e', 2)))('d5'), true, 'd5 ← w и e');
  // тир 6: ≥ 4 (тиры 1–3 = 6; 1+2 = 3 мало)
  assert.equal(gate(merge(own('s', 5), own('g', 3), own('d', 3)))('s6'), true, 's6 ← g и d (по 3 тира)');
  assert.equal(gate(merge(own('s', 5), own('g', 2), own('d', 3)))('s6'), false, 's6: в g только 3 очка < 4');
  // тиры 7–8 держат ту же планку
  assert.equal(gate(merge(own('s', 6), own('g', 3), own('d', 3)))('s7'), true, 's7 ← g и d');
  assert.equal(gate(merge(own('s', 6), own('g', 3)))('s7'), false, 's7 с одной ветвью — закрыт');
  assert.equal(gate(merge(own('g', 7), own('s', 3), own('d', 3)))('g8'), true, 'g8 ← s и d');
  // прежние w/e/c-пины остаются: w5 ← e и c
  assert.equal(gate(merge(own('w', 4), own('e', 2), own('c', 2)))('w5'), true, 'w5 ← e и c');
});

test('2.3: buyTech — s2/g2/d2 покупаются после своего тира 1 и не покупаются после c1', () => {
  for (const L of ['s', 'g', 'd']) {
    const ok = build(['buyTech', 'TECHS'], { TECHS: { [L + '1']: true }, pts: 9, resObj: { 1: 50 } });
    assert.equal(ok[0](L + '2'), null, L + '2 куплена после ' + L + '1');
    assert.equal(ok[1].owned[L + '2'], true, 'флаг ' + L + '2 выставлен');
    const bad = build(['buyTech'], { TECHS: { c1: true }, pts: 9, resObj: { 1: 50 } });
    assert.ok(String(bad[0](L + '2')).includes('предыдущий'), L + '2 после c1 — отказ с подсказкой про предыдущий тир');
  }
});

test('2.3: SVG-дерево показывает то же состояние, что и покупка (s2 доступна после s1, не после c1)', () => {
  const svg = (TECHS) => build(['techSvgHtml'], { TECHS })[0]();
  const a = svg({ s1: true });
  assert.match(a, /km-tree-node owned" data-tree-id="s1"/, 's1 — изучена');
  assert.match(a, /km-tree-node can" data-tree-id="s2"/, 's2 — доступна');
  assert.match(a, /km-tree-node locked" data-tree-id="g2"/, 'g2 — закрыта');
  const b = svg({ c1: true });
  for (const id of ['s2', 'g2', 'd2']) assert.match(b, new RegExp('km-tree-node locked" data-tree-id="' + id + '"'), id + ' закрыта при одном c1');
  assert.match(b, /km-tree-node can" data-tree-id="c2"/, 'c2 — доступна');
});

test('2.3: techPrevOwned (мёртвый и неверный) удалён', () => {
  assert.ok(!/function techPrevOwned\(/.test(app), 'функции techPrevOwned в app.js больше нет');
});

// ===================== потеря технологий на загрузке: sanitizeTechs =====================
const ALL_IDS = [];
for (const L of ['w', 'e', 'c', 's', 'g', 'd']) for (let t = 1; t <= 8; t++) ALL_IDS.push(L + t);

test('sanitizeTechs: все 48 нод каталога проходят (белый список = каталог)', () => {
  const [TREE] = build(['TECH_TREE'], { TECHS: {} });
  assert.deepEqual(Object.keys(TREE).sort(), ALL_IDS.slice().sort(), 'каталог дерева = 6 букв × 8 тиров');
  const all = {}; ALL_IDS.forEach((id) => { all[id] = true; });
  const out = SG.sanitizeTechs({ owned: all, lvl: {} });
  assert.equal(Object.keys(out.owned).length, 48);
  assert.deepEqual(out.owned, all);
});

test('sanitizeTechs: 30 купленных нод переживают очистку (раньше резалось до 21 первых по порядку покупки)', () => {
  const owned = {}; ALL_IDS.slice(0, 30).forEach((id) => { owned[id] = true; });
  const out = SG.sanitizeTechs({ owned, lvl: { w1: 3 } });
  assert.equal(Object.keys(out.owned).length, 30);
  assert.deepEqual(Object.keys(out.owned), ALL_IDS.slice(0, 30), 'порядок и состав сохранены');
  assert.deepEqual(out.lvl, { w1: 3 });
});

test('sanitizeTechs: чужие и мусорные ключи/значения отбрасываются', () => {
  const out = SG.sanitizeTechs({
    owned: { w1: true, w9: true, w0: true, x1: true, W1: true, '': true, __proto__x: true, constructor: true, e2: 1, e3: 'yes', c1: false, d1: true },
    lvl: {},
  });
  assert.deepEqual(Object.keys(out.owned).sort(), ['d1', 'w1'], 'остались только w1 и d1: id вне каталога и значения не === true — прочь');
  assert.ok(!Object.prototype.hasOwnProperty.call(out.owned, 'constructor'));
  const forged = JSON.parse('{"owned":{"__proto__":true,"w1":true},"lvl":{"__proto__":3}}');
  const f = SG.sanitizeTechs(forged);
  assert.deepEqual(Object.keys(f.owned), ['w1']);
  assert.deepEqual(Object.keys(f.lvl), []);
});

test('sanitizeTechs: уровни — 1..5 и только у купленных нод; нечисловые отбрасываются', () => {
  const out = SG.sanitizeTechs({
    owned: { w1: true, e1: true, c1: true, s1: true },
    lvl: { w1: 1, e1: 5, c1: 6, s1: 0, d1: 3, g1: 2, w2: 'x', e2: NaN },
  });
  assert.deepEqual(out.lvl, { w1: 1, e1: 5 }, 'c1=6, s1=0, d1/g1 (не куплены), нечисла — отброшены');
  assert.deepEqual(SG.sanitizeTechs({ owned: { w1: true }, lvl: { w1: 2.6 } }).lvl, { w1: 3 }, 'дробный уровень округляется');
});

test('sanitizeTechs: легаси-плоская карта {id: true} → owned; не-объекты → пустое дерево; идемпотентность', () => {
  assert.deepEqual(SG.sanitizeTechs({ w1: true, e1: true, zz: true, c1: 'no' }), { owned: { w1: true, e1: true }, lvl: {} });
  for (const bad of [null, undefined, 5, 'w1', [], [['w1', true]], true]) {
    assert.deepEqual(SG.sanitizeTechs(bad), { owned: {}, lvl: {} }, 'вход ' + JSON.stringify(bad));
  }
  assert.deepEqual(SG.sanitizeTechs({ owned: 'w1' }), { owned: {}, lvl: {} }, 'owned не объект → пусто (ключ "owned" не id)');
  const once = SG.sanitizeTechs({ owned: { w1: true, s2: true }, lvl: { w1: 2 } });
  assert.deepEqual(SG.sanitizeTechs(once), once);
});

test('sanitizeTechs: не меняет входной объект и возвращает новые вложенные карты', () => {
  const input = { owned: { w1: true }, lvl: { w1: 2 } };
  const copy = JSON.parse(JSON.stringify(input));
  const out = SG.sanitizeTechs(input);
  assert.deepEqual(input, copy);
  assert.notEqual(out.owned, input.owned);
  assert.notEqual(out.lvl, input.lvl);
});

// ===================== проводка в storage.js =====================
test('storage.js: срез `.slice(0, 21)` удалён; applySyncData и MIGRATIONS[11] идут через STATE_GUARDS.sanitizeTechs', () => {
  assert.ok(!/\.slice\(0,\s*21\)/.test(storage), 'ни одного .slice(0, 21) в storage.js');
  assert.equal((storage.match(/STATE_GUARDS\.sanitizeTechs\(/g) || []).length, 2, 'два места: миграция v11 и applySyncData');
});

test('MIGRATIONS[11]: 30 купленных технологий (схема Т3 и легаси-плоская карта) не теряются', () => {
  const a = storage.indexOf('MIGRATIONS[11] = function(data) {');
  assert.ok(a > -1, 'миграция v11 найдена');
  const b = storage.indexOf('\n};\n', a);
  const mig = new Function('STATE_GUARDS', 'var MIGRATIONS = {};\n' + storage.slice(a, b + 4) + '\nreturn MIGRATIONS[11];')(SG);
  const thirty = {}; ALL_IDS.slice(0, 30).forEach((id) => { thirty[id] = true; });
  const t3 = { TECHS: { owned: Object.assign({}, thirty), lvl: { w1: 2 } }, TECH_PTS: 7 };
  mig(t3);
  assert.equal(Object.keys(t3.TECHS.owned).length, 30, 'схема Г5-Т3: 30 → 30');
  assert.deepEqual(t3.TECHS.lvl, { w1: 2 });
  const legacy = { TECHS: Object.assign({}, thirty), TECH_PTS: 7 };
  mig(legacy);
  assert.equal(Object.keys(legacy.TECHS.owned).length, 30, 'легаси-плоская карта: 30 → 30');
  assert.equal(legacy.TECH_PTS, 7);
});
