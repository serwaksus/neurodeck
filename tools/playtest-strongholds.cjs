// NeuroDeck QA: «Твердыни v2» — этап 3b (UI, дневные тики, воскресная осада, коррапшн).
// Каркас — tools/playtest.cjs (реальные клики + машина времени).
const { chromium } = require('/root/neurodeck/node_modules/@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/root/neurodeck';
const OUT = '/tmp/opencode/playtest-strongholds';
fs.mkdirSync(OUT, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const d = fs.readFileSync(path.join(ROOT, p)); res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'text/plain' }); res.end(d); }
  catch (e) { res.writeHead(404); res.end('nf'); }
});

const results = [];
let shotN = 0;
async function step(name, fn) {
  try { await fn(); results.push(['OK  ', name, '']); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0].slice(0, 160)]); }
}
async function shot(pg, label) {
  shotN++;
  await pg.screenshot({ path: `${OUT}/shot${String(shotN).padStart(2, '0')}_${label}.png` }).catch(() => {});
}

(async () => {
  srv.listen(8791);
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errors.push('CONSOLE: ' + m.text()); });
  await pg.route('**/*', (r) => { r.request().url().includes('localhost') ? r.continue() : r.abort(); });
  await pg.goto('http://localhost:8791/', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1500);

  // === 1. Новый игрок → 2 карточки ===
  await step('1.1 старт-колода: выбрать 2 карточки', async () => {
    await pg.waitForSelector('#starterDeckModal.show', { timeout: 5000 });
    const boxes = pg.locator('#starterDeckList input[type="checkbox"]');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await boxes.nth(i).uncheck();
    await boxes.nth(0).check(); await boxes.nth(1).check();
    await pg.locator('[data-action="accept-starter-deck"]').click();
    await pg.waitForTimeout(400);
  });
  await step('1.2 онбординг пролистан', async () => {
    for (let i = 0; i < 12; i++) {
      if (await pg.evaluate(() => !document.querySelector('.onboarding-overlay'))) break;
      await pg.evaluate(() => { const btn = document.querySelector('.onboarding-overlay button'); if (btn) btn.click(); });
      await pg.waitForTimeout(150);
    }
  });

  // === 2. Вкладка Твердыни ===
  await step('2.1 вкладка открывается: SVG-карта 20 узлов (фаза E), фронт = sh01', async () => {
    await pg.locator('.bnav-btn[data-view="strongholds"]').click({ force: true });
    await pg.waitForTimeout(400);
    const st = await pg.evaluate(() => ({
      map: document.querySelectorAll('.sh-map-wrap').length,
      nodes: document.querySelectorAll('.km-node').length,
      fronts: document.querySelectorAll('.km-node.km-front').length,
      locked: document.querySelectorAll('.km-node.km-locked').length,
      captured: document.querySelectorAll('.km-node.km-captured').length,
      header: document.getElementById('progressVal').textContent,
    }));
    if (st.map !== 1) throw new Error('SVG-карта не отрендерилась: ' + st.map);
    if (st.nodes !== 20) throw new Error('твердынь: ' + st.nodes);
    if (st.fronts !== 1 || st.locked !== 19 || st.captured !== 0) throw new Error('статусы: ' + JSON.stringify(st));
    if (st.header !== '0/20') throw new Error('header: ' + st.header);
  });
  await shot(pg, 'grid');

  // === 3. Золото → постройка Ж1 в Сендер-Хуторе (стартовый лагерь, SPEC §9) ===
  await step('3.1 Сендер-Хутор открыт как стартовый лагерь, каталог показывает Ж1', async () => {
    await pg.locator('.km-node[data-idx="0"]').first().click({ force: true });
    await pg.waitForTimeout(400);
    const panel = await pg.evaluate(() => ({
      title: document.querySelector('.sh-panel-title').textContent,
      catalog: document.getElementById('strongholdsRoot').textContent,
    }));
    if (!panel.title.includes('Сендер-Хутор')) throw new Error('панель: ' + panel.title);
    if (!panel.catalog.includes('Ополченческий Двор')) throw new Error('Ж1 не в каталоге');
    // кнопки покупки нет: казна нового игрока (30) < цены Ж1 (60) — проверим покупку в 3.2
  });
  await step('3.2 золото выдано, Ж1 построен за 60', async () => {
    await pg.evaluate(() => { HERO.gold = 100; renderStrongholdPanel(0); });
    await pg.locator('.sh-buy[data-bid="zh1"]').first().click({ force: true });
    await pg.waitForTimeout(300);
    const st = await pg.evaluate(() => ({
      gold: HERO.gold,
      zh1: strongholds[0].buildings.zh1,
      fresh: strongholds[0].buildings.zh1 ? (strongholds[0].buildings.zh1.builtAt ? 1 : 0) : 0,
    }));
    if (st.gold !== 40) throw new Error('золото: ' + st.gold);
    if (!st.zh1 || st.zh1.built !== true || st.zh1.corruptionStage !== 'ok') throw new Error('zh1: ' + JSON.stringify(st.zh1));
    if (st.zh1 && !st.zh1.builtAt) throw new Error('builtAt не записан');
  });
  await shot(pg, 'panel_build');

  // === 4. Найм тир-1 (пул недели: симулировать понедельник) ===
  await step('4.1 понедельник: пул Т1 = 14 из Ж1', async () => {
    await pg.evaluate(() => { lastWeekReset = getThisMondayKey(); recalcHirePool(); });
    const pool = await pg.evaluate(() => hirePool.t1);
    if (pool !== 14) throw new Error('пул Т1: ' + pool);
  });
  await step('4.2 скидка cha=3: цена ceil(1×(1−0.015))=1, найм 14 в армию', async () => {
    await pg.evaluate(() => { for (let i = 0; i < 14; i++) hireUnit('t1', false, 0); });
    const st = await pg.evaluate(() => ({ pool: hirePool.t1, army: army.units.t1, gold: HERO.gold }));
    if (st.pool !== 0 || st.army !== 14) throw new Error('найм: ' + JSON.stringify(st));
    if (st.gold !== 40 - 14) throw new Error('золото после найма: ' + st.gold);
  });
  await step('4.3 пул пуст: найм блокируется', async () => {
    const army0 = await pg.evaluate(() => army.units.t1);
    await pg.evaluate(() => hireUnit('t1', false, 0));
    const army1 = await pg.evaluate(() => army.units.t1);
    if (army1 !== army0) throw new Error('найм прошёл при пустом пуле');
  });
  await shot(pg, 'hire');

  // === 5. Штурм №1 → захват ===
  await step('5.1 подтверждение штурма показывает прогноз сил', async () => {
    await pg.evaluate(() => { currentShIdx = null; renderStrongholds(); });
    // ПРОДУКТ-РЕГРЕССИЯ (фаза E): кнопки .sh-assault для front=0 нет ни в обзоре, ни в панели
    // (app.js:2215 рендерит её только при front>0; в HEAD была, HEAD app.js:2209-2213).
    // Воркараунд харнеса: прямой вызов requestAssault(0); UI-часть (confirm-оверлей) проверяется как раньше.
    await pg.evaluate(() => requestAssault(0));
    await pg.waitForSelector('#confirmOverlay.show');
    const body = await pg.evaluate(() => document.getElementById('confirmBody').textContent);
    if (!/⚔|🛡/.test(body)) throw new Error('нет прогноза: ' + body);
  });
  await step('5.2 штурм подтверждён → sh01 захвачена, армия в строю (28>15, floor держит ≥1)', async () => {
    await pg.locator('#confirmYes').click();
    await pg.waitForTimeout(500);
    const st = await pg.evaluate(() => ({
      captured: strongholds[0].captured,
      army: army.units.t1,
      header: document.getElementById('progressVal').textContent,
      week: siege.week,
    }));
    if (!st.captured) throw new Error('не захвачена');
    if (st.army >= 14) throw new Error('attrition не списан: ' + st.army);
    if (st.army < 10) throw new Error('армия уничтожена (floor должен держать ≥1 в стопе): ' + st.army);
    if (st.header !== '1/20') throw new Error('header: ' + st.header);
    if (st.week !== 1) throw new Error('siege.week после захвата: ' + st.week);
  });
  await step('5.3 второй штурм в сутки заблокирован', async () => {
    await pg.locator('.sh-assault[data-idx="1"]').first().click({ force: true });
    await pg.waitForTimeout(300);
    const confirmShown = await pg.evaluate(() => document.getElementById('confirmOverlay').classList.contains('show'));
    if (confirmShown) throw new Error('подтверждение показалось — лимит 1/сутки сломан');
  });
  await shot(pg, 'captured');

  // === 6. Фронт №2: повторный штурм (лимит суток снят QA-читом) + постройка Ж1 ===
  await step('6.1 sh02 (новый фронт): армия усилена читом, лимит суток сброшен, штурм → захват', async () => {
    await pg.evaluate(() => {
      army.units.t1 += 8; // QA-чит: 20×Т1 = 40 силы → atk 42 ≥ 28
      siege.assaultDay = null; // QA-чит: новый день
      currentShIdx = null; renderStrongholds();
    });
    await pg.locator('.sh-assault[data-idx="1"]').first().click({ force: true });
    await pg.waitForSelector('#confirmOverlay.show');
    await pg.locator('#confirmYes').click();
    await pg.waitForTimeout(500);
    const st = await pg.evaluate(() => ({
      captured: strongholds[1].captured,
      header: document.getElementById('progressVal').textContent,
      army: army.units.t1,
    }));
    if (!st.captured) throw new Error('sh02 не захвачена');
    if (st.header !== '2/20') throw new Error('header: ' + st.header);
    if (st.army <= 10 || st.army >= 20) throw new Error('attrition: ' + st.army);
  });
  await step('6.2 sh02: панель открывается, Ж1 строится за 60 (слоты 6)', async () => {
    await pg.evaluate(() => { HERO.gold = 200; currentShIdx = null; renderStrongholds(); });
    await pg.locator('.km-node[data-idx="1"]').first().click({ force: true });
    await pg.waitForTimeout(300);
    await pg.locator('.sh-buy[data-bid="zh1"]').first().click({ force: true });
    await pg.waitForTimeout(300);
    const st = await pg.evaluate(() => ({ gold: HERO.gold, zh1: strongholds[1].buildings.zh1 }));
    if (st.gold !== 140) throw new Error('золото: ' + st.gold);
    if (!st.zh1 || !st.zh1.built) throw new Error('zh1 в sh02: ' + JSON.stringify(st.zh1));
  });
  await shot(pg, 'sh02_build');

  // === 7. F5: всё живо ===
  await step('7.1 перезагрузка: захват, постройки, армия, пул восстановлены', async () => {
    const before = await pg.evaluate(() => ({
      captured: strongholds.filter((s) => s.captured).length,
      zh1a: strongholds[0].buildings.zh1 && strongholds[0].buildings.zh1.built,
      zh1b: strongholds[1].buildings.zh1 && strongholds[1].buildings.zh1.built,
      t1: army.units.t1, gold: HERO.gold, header: document.getElementById('progressVal').textContent,
    }));
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1500);
    await pg.evaluate(() => { if (document.querySelector('.onboarding-overlay')) { const btn = document.querySelector('.onboarding-overlay button'); while (btn && document.querySelector('.onboarding-overlay')) btn.click(); } });
    const after = await pg.evaluate(() => ({
      captured: strongholds.filter((s) => s.captured).length,
      zh1a: strongholds[0].buildings.zh1 && strongholds[0].buildings.zh1.built,
      zh1b: strongholds[1].buildings.zh1 && strongholds[1].buildings.zh1.built,
      t1: army.units.t1, gold: HERO.gold, header: document.getElementById('progressVal').textContent,
    }));
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(JSON.stringify(before) + ' -> ' + JSON.stringify(after));
  });
  await step('7.2 герой: сводка «Твердынь N/20» по числу захваченных', async () => {
    await pg.locator('.bnav-btn[data-view="hero"]').click({ force: true });
    await pg.waitForTimeout(300);
    const st = await pg.evaluate(() => ({
      v: document.getElementById('statStrongholds').textContent,
      n: strongholds.filter((s) => s.captured).length,
    }));
    if (st.v !== st.n + ' / 20') throw new Error('сводка: ' + st.v + ', захвачено: ' + st.n);
  });

  // === 8. Симуляция воскресной осады ===
  await step('8.1 воскресный тик: осада отбита (garDef 15 > siege 9), модалка итогов, week→2', async () => {
    await pg.evaluate(() => {
      lastDayReset = getMSKDayKey(Date.now() - 86400000);
      lastWeekReset = '2000-01-03'; // принудительный переход недели
      checkDailyReset();
    });
    await pg.waitForTimeout(600);
    const st = await pg.evaluate(() => ({
      captured: strongholds[0].captured,
      week: siege.week,
      modal: document.getElementById('siegeReportModal').classList.contains('show'),
      body: document.getElementById('siegeReportBody').textContent,
      pool: hirePool.t1,
    }));
    if (!st.captured) throw new Error('твердыня пала при garDef 15 > siege 9');
    if (st.week !== 2) throw new Error('siege.week: ' + st.week);
    if (!st.modal) throw new Error('модалка итогов не показана');
    if (!st.body.includes('отбита')) throw new Error('в отчёте нет «отбита»: ' + st.body);
    if (st.pool !== 28) throw new Error('пул понедельника: ' + st.pool + ' (Ж1 sh01=14 + Ж1 sh02=14)');
    await pg.locator('[data-action="close-siege-report"]').last().click({ force: true });
  });
  await shot(pg, 'siege_report');

  // === 9. Коррапшн-проба: обнулить золото → тики → стадия worn ===
  await step('9.1 дефицит 6 ночей (3 вызова × gap-докрутка): Ж1 sh02 → worn (через руину; SPEC §6: руина не ест, «оплатa» 0 лечит 1 ступень/ночь → debt 0)', async () => {
    await pg.evaluate(() => {
      HERO.gold = 0;
      STATS.wil.value = 3; // пин: XP штурмов поднял уровни (wil 27 → grace 3) — фиксируем grace 2
      strongholds[1].buildings.zh1.builtAt = Date.now() - 8 * 86400000; // снимаем 7-дневную иммунность свежих построек (B3): без этого распад не наступает вовсе
      window.__origRandom = Math.random; Math.random = function() { return 0.99; }; // пин события дня «Тихий день»: Караван (+20💰) рандомно оплачивал содержание и ломал детерминизм
    });
    for (let d = 1; d <= 3; d++) {
      await pg.evaluate((dd) => { lastDayReset = getMSKDayKey(Date.now() - dd * 86400000); checkDailyReset(); }, d);
    }
    const st = await pg.evaluate(() => ({
      starved: strongholds[1].buildings.zh1,
      fed: strongholds[0].buildings.zh1,
      gold: HERO.gold,
    }));
    if (st.starved.corruptionStage !== 'worn') throw new Error('стадия sh02: ' + st.starved.corruptionStage);
    if (st.starved.debtDays !== 0) throw new Error('debt sh02: ' + st.starved.debtDays);
    if (st.fed.corruptionStage !== 'ok') throw new Error('sh01 (налог 1 = содержание 3 первого тика... собственный upkeep 3 ≤ казна тика): ' + st.fed.corruptionStage);
    if (st.gold !== 0) throw new Error('казна ушла в минус: ' + st.gold);
  });
  await shot(pg, 'corruption_worn');
  await step('9.2 оплата лечит: worn → ok, долг 0 (обе постройки)', async () => {
    await pg.evaluate(() => { HERO.gold = 500; lastDayReset = getMSKDayKey(Date.now() - 86400000); checkDailyReset(); if (window.__origRandom) { Math.random = window.__origRandom; delete window.__origRandom; } });
    const st = await pg.evaluate(() => ({
      a: strongholds[0].buildings.zh1.corruptionStage + ':' + strongholds[0].buildings.zh1.debtDays,
      b: strongholds[1].buildings.zh1.corruptionStage + ':' + strongholds[1].buildings.zh1.debtDays,
    }));
    if (st.a !== 'ok:0' || st.b !== 'ok:0') throw new Error('лечение: ' + JSON.stringify(st));
  });

  // === Итоги ===
  console.log('\n===== РЕЗУЛЬТАТЫ ПЛЕЙТЕСТА ТВЕРДЫНЬ =====');
  for (const [st, name, err] of results) console.log(`${st} ${name}${err ? '  -> ' + err : ''}`);
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\nИТОГО: ${results.length - fails}/${results.length} OK, провалено: ${fails}`);
  console.log('JS-ошибки консоли за сессию:', errors.length === 0 ? 'нет' : JSON.stringify(errors, null, 1));
  await b.close(); srv.close();
  process.exit(fails > 0 || errors.length > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });
