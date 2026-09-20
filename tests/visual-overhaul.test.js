// tests/visual-overhaul.test.js — Г3 «Политическая карта Total War»: KG-тайлы (мир 780×1120, сталь/кровь/туман)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { STRONGHOLDS, BOSSES } = require(path.join(__dirname, '..', 'js', 'stronghold-data.js'));

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

function kgSource() {
  const start = app.indexOf('var KG = (function');
  assert.ok(start > -1, 'KG модуль найден в app.js');
  const end = app.indexOf('})();', start);
  assert.ok(end > start, 'KG IIFE закрыт');
  return app.slice(start, end + 5);
}

function kmCamSource() {
  const start = app.indexOf('var KM_CAM');
  const end = app.indexOf('function kingdomMapHtml');
  assert.ok(start > -1 && end > start, 'KM_CAM блок найден в app.js');
  return app.slice(start, end);
}

function withState(capturedN, front, siegeToday, stageOf) {
  const strongholds = STRONGHOLDS.map((_, i) => ({ captured: i < capturedN }));
  const body = kgSource() + '\n' + kmCamSource() + '\n' + extractFn('weatherOf') + '\n' + extractFn('weatherNorth') + '\n' + extractFn('weatherSouth') + '\n' + extractFn('weatherSeasonWeek') + '\n' + extractFn('kmStatusLabel') + '\n' + extractFn('kingdomMapHtml') + '\nreturn kingdomMapHtml;';
  const fn = new Function('STRONGHOLDS', 'strongholds', 'frontIdx', 'daysToSiegeNow', 'shWorstStage', 'bossActiveFor', 'BOSSES', 'ensureSeason', 'siege', body);
  return fn(STRONGHOLDS, strongholds, () => front, () => (siegeToday ? 0 : 3), stageOf || (() => 'ok'), () => null, BOSSES, () => ({ num: 1, start: '2026-09-01' }), { week: 1 }).bind(null, siegeToday); // Г2-1: боссы в карту не мешают контрактам; Г2-2: погода сезона 1 недели 1 (пин-окно)
}

test('KG: 20 тайлов watertight, 4 провинции по 5, центры в полигонах, смежность-цепь, мир 780×1120', () => {
  const KG = new Function(kgSource() + '\nreturn KG;')();
  assert.equal(KG.WORLD.w, 780);
  assert.equal(KG.WORLD.h, 1120);
  assert.equal(KG.tiles.length, 20, '20 тайлов');
  for (let pv = 1; pv <= 4; pv++) assert.equal(KG.tiles.filter((t) => t.prov === pv).length, 5, 'провинция ' + pv + ': 5 тайлов');
  const vertices = (poly) => { const n = poly.match(/-?\d+(?:\.\d+)?/g).map(Number); const vs = []; for (let i = 0; i < n.length; i += 2) vs.push([n[i], n[i + 1]]); return vs; };
  const pip = (vs, x, y) => { let ins = false; for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) { const [xi, yi] = vs[i], [xj, yj] = vs[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
  const area = (vs) => { let s = 0; for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) s += (vs[j][0] + vs[i][0]) * (vs[j][1] - vs[i][1]); return Math.abs(s / 2); };
  let tilesArea = 0;
  for (const t of KG.tiles) {
    const vs = vertices(t.poly);
    assert.ok(!t.poly.includes('NaN'), 'полигон ' + t.idx + ' без NaN');
    assert.ok(pip(vs, t.center.x, t.center.y), 'центр ' + t.idx + ' внутри полигона');
    assert.ok(area(vs) > 0, 'площадь ' + t.idx + ' > 0');
    tilesArea += area(vs);
  }
  let framesArea = 0;
  for (const p of KG.provinces) {
    assert.ok(!p.outline.includes('NaN'), 'outline ' + p.id + ' без NaN');
    framesArea += (p.frame.x1 - p.frame.x0) * (p.frame.y1 - p.frame.y0);
  }
  const dev = Math.abs(tilesArea - framesArea) / framesArea;
  assert.ok(dev < 0.03, 'watertight: |тайлы−рамки|/рамки = ' + (dev * 100).toFixed(2) + '% < 3%');
  for (let i = 1; i < 20; i++) {
    assert.ok(KG.adj[i].includes(i - 1) && KG.adj[i - 1].includes(i), 'смежность ' + (i - 1) + '↔' + i);
  }
  assert.ok(!app.includes('mapNodePos'), 'mapNodePos удалена');
  const html0 = withState(0, 0, false)();
  assert.ok(html0.includes('viewBox="0 0 780 1120"'), 'SVG в координатах мира KG');
});

test('карта рендерит 20 узлов role=button + aria-label + legend 4 состояния', () => {
  const html = withState(0, 3, false)();
  assert.equal((html.match(/class="km-node /g) || []).length, 20, '20 узлов');
  assert.equal((html.match(/role="button"/g) || []).length, 20, 'все узлы role=button');
  assert.equal((html.match(/aria-label="/g) || []).length, 22, 'aria-label на каждом узле + SVG-корень + кнопка сброса камеры');
  assert.ok(html.includes('km-lg-cap') && html.includes('km-lg-front') && html.includes('km-lg-siege') && html.includes('km-lg-lock'), 'легенда 4 состояний');
  assert.ok(html.includes('Сендер-Хутор'), 'имена из STRONGHOLDS');
  assert.ok(html.includes('km-terr km-locked') && html.includes('km-fog'), 'полит-слой: кровь+туман у запертых');
  assert.equal((html.match(/km-prov-out/g) || []).length, 4, '4 границы провинций');
});

test('статусы: captured/locked/front/siege + connector owned + corruption arc + полит-заливки', () => {
  const stages = { 2: 'worn', 4: 'ruin' };
  const html = withState(5, 7, true, (i) => stages[i] || 'ok')();
  assert.equal((html.match(/km-node km-captured/g) || []).length, 5, '5 захваченных узлов');
  assert.equal((html.match(/km-terr km-captured/g) || []).length, 5, '5 стальных заливок');
  assert.equal((html.match(/km-connector owned/g) || []).length, 4, '4 захваченных сегмента');
  assert.ok(html.includes('km-node km-locked') && html.includes('aria-disabled="true"'), 'запертые приглушены');
  const noSiege = withState(5, 7, false, () => 'ok')();
  assert.ok(noSiege.includes('km-node km-front'), 'следующая цель есть (вне дня осады)');
  assert.ok(noSiege.includes('km-terr km-front'), 'штриховка фронта на полит-слое');
  assert.ok(!noSiege.includes('km-badge'), 'без осады бейджа нет');
  assert.ok(html.includes('stroke-dasharray="50 100"'), 'коррупция worn = 50%');
  assert.ok(html.includes('stroke-dasharray="100 100"'), 'коррупция ruin = 100%');
  const KG = new Function(kgSource() + '\nreturn KG;')();
  assert.ok(KG.adj[7].includes(6), 'фронт 7 смежен последней захваченной 6');
});

test('тап по узлу открывает панель + keydown Enter/Space (контракты диспетчера)', () => {
  const html = withState(0, 0, false)();
  assert.ok(html.includes('data-action="sh-open" data-idx="2"'), 'узлы ведут на панель твердыни');
  assert.ok(app.includes("t.dataset.action !== 'sh-open'"), 'keydown-делегат sh-open');
  assert.ok(app.includes("el.dataset.idx); shCatalogOpen = false; renderStrongholdPanel"), 'sh-open открывает панель');
  assert.ok(!app.includes("html += '<div class=\"sh-grid\">'"), 'sh-grid лента удалена из обзорного рендера');
  for (const sel of ['.km-node', '.km-connector', '.km-legend', '.sh-map-wrap', '.km-terr', '.km-fog', '.km-prov-out', '.km-town', '.km-hit', '.km-viewport']) assert.ok(css.includes(sel), 'css ' + sel);
  assert.ok(css.includes('.km-terr.km-front'), 'штриховка фронта в CSS');
  assert.ok(css.includes('.km-terr.km-captured'), 'сталь captured в CSS');
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

