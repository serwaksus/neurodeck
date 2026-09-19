// tests/visual-overhaul.test.js — ФАЗА E «Тёмная сталь»: карта королевства (SVG-змейка)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { STRONGHOLDS } = require(path.join(__dirname, '..', 'js', 'stronghold-data.js'));

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

function extractFn(name) {
  const start = app.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'fn ' + name + ' найдена в app.js');
  let i = app.indexOf('{', start), depth = 0, end = i;
  for (; i < app.length; i++) {
    if (app[i] === '{') depth++;
    else if (app[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return app.slice(start, end + 1);
}

function withState(capturedN, front, siegeToday, stageOf) {
  const strongholds = STRONGHOLDS.map((_, i) => ({ captured: i < capturedN }));
  const body = extractFn('mapNodePos') + '\n' + extractFn('kmStatusLabel') + '\n' + extractFn('kingdomMapHtml') + '\nreturn kingdomMapHtml;';
  const fn = new Function('STRONGHOLDS', 'strongholds', 'frontIdx', 'daysToSiegeNow', 'shWorstStage', body);
  return fn(STRONGHOLDS, strongholds, () => front, () => (siegeToday ? 0 : 3), stageOf || (() => 'ok')).bind(null, siegeToday);
}

test('mapNodePos: детерминированная змейка 2 колонки, без хардкодов', () => {
  const body = extractFn('mapNodePos') + '\nreturn mapNodePos;';
  const fn = new Function('STRONGHOLDS', 'strongholds', 'frontIdx', 'daysToSiegeNow', 'shWorstStage', body)(STRONGHOLDS, [], null, null, null);
  assert.deepEqual(fn(0), { x: 110, y: 44 });
  assert.deepEqual(fn(1), { x: 280, y: 44 });
  assert.deepEqual(fn(2), { x: 110, y: 108 });
  assert.deepEqual(fn(19), { x: 280, y: 44 + 9 * 64 });
});

test('карта рендерит 20 узлов role=button + aria-label + legend 4 состояния', () => {
  const html = withState(0, 3, false)();
  assert.equal((html.match(/class="km-node /g) || []).length, 20, '20 узлов');
  assert.equal((html.match(/role="button"/g) || []).length, 20, 'все узлы role=button');
  assert.equal((html.match(/aria-label="/g) || []).length, 21, 'aria-label на каждом узле + 1 у SVG-корня');
  assert.ok(html.includes('km-lg-cap') && html.includes('km-lg-front') && html.includes('km-lg-siege') && html.includes('km-lg-lock'), 'легенда 4 состояний');
  assert.ok(html.includes('Сендер-Хутор'), 'имена из STRONGHOLDS');
});

test('статусы: captured/locked/front/siege + connector owned + corruption arc', () => {
  const stages = { 2: 'worn', 4: 'ruin' };
  const html = withState(5, 7, true, (i) => stages[i] || 'ok')();
  assert.equal((html.match(/km-captured/g) || []).length >= 5, true, '5 захваченных');
  assert.equal((html.match(/km-connector owned/g) || []).length, 4, '4 захваченных сегмента');
  assert.ok(html.includes('km-node km-locked') && html.includes('aria-disabled="true"'), 'запертые приглушены');
  const noSiege = withState(5, 7, false, () => 'ok')();
  assert.ok(noSiege.includes('km-node km-front'), 'следующая цель есть (вне дня осады)');
  assert.ok(!noSiege.includes('km-badge'), 'без осады бейджа нет');
  assert.ok(html.includes('stroke-dasharray="50 100"'), 'коррупция worn = 50%');
  assert.ok(html.includes('stroke-dasharray="100 100"'), 'коррупция ruin = 100%');
});

test('тап по узлу открывает панель + keydown Enter/Space (контракты диспетчера)', () => {
  const html = withState(0, 0, false)();
  assert.ok(html.includes('data-action="sh-open" data-idx="2"'), 'узлы ведут на панель твердыни');
  assert.ok(app.includes("t.dataset.action !== 'sh-open'"), 'keydown-делегат sh-open');
  assert.ok(app.includes("el.dataset.idx); shCatalogOpen = false; renderStrongholdPanel"), 'sh-open открывает панель');
  assert.ok(!app.includes("html += '<div class=\"sh-grid\">'"), 'sh-grid лента удалена из обзорного рендера');
  for (const sel of ['.km-node', '.km-connector', '.km-legend', '.sh-map-wrap']) assert.ok(css.includes(sel), 'css ' + sel);
  assert.ok(css.includes(':root.perf-eco .km-node.km-front .km-ring'), 'eco-гейт пульса цели');
  assert.ok(/@media \(prefers-reduced-motion: reduce\)[\s\S]*km-node\.km-front/.test(css), 'reduced-motion гейт пульса');
});

// ФАЗА F: тайлы построек
test('Фаза F: catClass категории zh/ec/df/sp + builtTileHtml img/stageBadge + buyTileHtml reason', () => {
  const catClass = new Function(extractFn('catClass') + '\nreturn catClass;')();
  assert.equal(catClass({ cat: 'house' }), 'cat-zh');
  assert.equal(catClass({ cat: 'econ' }), 'cat-ec');
  assert.equal(catClass({ cat: 'defense' }), 'cat-df');
  assert.equal(catClass({ cat: 'special' }), 'cat-sp');
  assert.equal(catClass({ cat: 'other' }), 'cat-sp', 'неизвестная категория — sp');

  const sprite = (p) => '<img src="' + p + '">';
  const catSrc = extractFn('catClass') + '\n';
  const builtHtml = new Function('shSpriteImg', 'buildingEffectText', 'stageBadgeHtml', catSrc + extractFn('builtTileHtml') + '\nreturn builtTileHtml;')(
    sprite, () => 'эффект', (st) => '<i class="sh-stage">' + st + '</i>'
  )('sawmill', { cat: 'econ', name: 'Пила', icon: '🪚', upkeep: 2 }, { corruptionStage: 2 });
  assert.ok(builtHtml.includes('img/tract/buildings/sawmill.png'), 'img-путь');
  assert.ok(builtHtml.includes('sh-tile built cat-ec'), 'категорийная рамка');
  assert.ok(builtHtml.includes('sh-stage">2'), 'stageBadge');
  assert.ok(builtHtml.includes('содержание 2'), 'upkeep');

  const CAT = { wall: { name: 'Стена' }, fence: { cost: 100 } };
  const mkBuy = new Function('BUILDINGS', 'shSpriteImg', 'buildingEffectText', 'buildCostOf', catSrc + extractFn('buyTileHtml') + '\nreturn buyTileHtml;')(
    CAT, sprite, () => 'эффект', (id) => CAT[id].cost // Г1-2: стаб цены (без доктрины = база, пин 100 сохранён)
  );
  const lockedHtml = mkBuy('3', 'fence', { cat: 'defense', name: 'Забор', icon: '🚧', cost: 100, upkeep: 1, req: 'wall' }, false, false, 'нужна: Стена');
  assert.ok(lockedHtml.includes('sh-tile buy cat-df locked'), 'locked + категория');
  assert.ok(lockedHtml.includes('нужна: Стена'), 'reason виден у недоступного');
  assert.ok(!lockedHtml.includes('data-action="sh-buy"'), 'кнопки нет у недоступного');
  const noGoldHtml = mkBuy('3', 'fence', { cat: 'defense', name: 'Забор', icon: '🚧', cost: 100, upkeep: 1 }, true, false, 'мало золота');
  assert.ok(noGoldHtml.includes('мало золота'), 'reason «мало золота»');
  const canHtml = mkBuy('3', 'fence', { cat: 'defense', name: 'Забор', icon: '🚧', cost: 100, upkeep: 1 }, true, true, '');
  assert.ok(canHtml.includes('data-action="sh-buy" data-idx="3" data-bid="fence"'), 'can даёт .sh-buy data-bid');
  assert.ok(canHtml.includes('🏗 100') && canHtml.includes('−1/день'), 'бейджи cost/upkeep');
});

test('Фаза F: каталог рендерится тайлами — все доступные + reason-логика + CSS сетки', () => {
  const loopStart = app.indexOf('shown.forEach(function(id) {');
  assert.ok(loopStart > -1, 'каталогный цикл на месте');
  const loopBody = app.slice(loopStart, app.indexOf('});', loopStart));
  assert.ok(loopBody.includes('buyTileHtml(idx, id, bd, reqOk, can, reason)'), 'каталог на buyTileHtml (все доступные)');
  assert.ok(!loopBody.includes('sh-build-row'), 'старые ряды удалены из каталога');
  assert.ok(app.includes("var reason = !reqOk ? 'нужна: ' + BUILDINGS[bd.req].name : (slotLeft <= 0 ? 'нет слотов' : 'мало золота');"), 'reason: нет слотов/мало золота/нужна: X');
  for (const sel of ['--cat-zh', '--cat-ec', '--cat-df', '--cat-sp', '.sh-build-grid', '.sh-tile ', '.sh-tile-icon', '.sh-tile-badges', '.sh-tile .sh-buy']) assert.ok(css.includes(sel), 'css ' + sel);
  assert.ok(/\.sh-build-grid\s*{[^}]*repeat\(2/.test(css), 'сетка 2 колонки');
  assert.ok(/@media \(max-width: 420px\)[\s\S]{0,200}\.sh-build-grid\s*{[^}]*1fr/.test(css), 'мобайл ≤420px 1 колонка');
  assert.ok(css.includes(':root.perf-eco .sh-tile'), 'eco-гейт теней тайлов');
  assert.ok(/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,300}\.sh-tile/.test(css), 'reduced-motion гейт тайлов');
});

