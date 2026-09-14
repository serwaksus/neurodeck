// NeuroDeck QA: «Твердыни v2» — ФИНАЛЬНАЯ ПРИЁМКА (Фаза 5), сценарий «месяц жизни королевства».
// Роль: .opencode/agent/qa.md. Каркас — tools/playtest.cjs (http-сервер, step/shot, ловушка ошибок консоли).
// Числа/формулы — ТОЛЬКО через stronghold-model (SM) и StrongholdData; баги фиксируются, НЕ чинятся.
const { chromium } = require('/root/neurodeck/node_modules/@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/root/neurodeck';
const OUT = '/tmp/opencode/qa-strongholds';
fs.mkdirSync(OUT, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const d = fs.readFileSync(path.join(ROOT, p)); res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'text/plain' }); res.end(d); }
  catch (e) { res.writeHead(404); res.end('nf'); urls404.push(p); }
});
const urls404 = []; // доказательная база: какие пути давали 404 (кандидат — баг дубля shSprite)

const results = [];
let shotN = 0;
async function step(name, fn) {
  try { await fn(); results.push(['OK  ', name, '']); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0].slice(0, 200)]); }
}
async function shot(pg, label) {
  shotN++;
  await pg.screenshot({ path: `${OUT}/shot${String(shotN).padStart(2, '0')}_${label}.png` }).catch(() => {});
}

(async () => {
  srv.listen(8792);
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];       // все ошибки консоли (гейт)
  const errors404 = [];    // из них: 404 ресурсов (кандидат — баг дубля shSprite)
  pg.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  pg.on('console', (m) => {
    if (m.type() !== 'error' || m.text().includes('ERR_FAILED')) return;
    errors.push('CONSOLE: ' + m.text());
    if (/Failed to load resource|404/.test(m.text())) errors404.push(m.text());
  });
  await pg.route('**/*', (r) => { r.request().url().includes('localhost') ? r.continue() : r.abort(); });
  await pg.goto('http://localhost:8792/', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1500);

  // ---------- Хелперы (QA-читы помечены; числа — только через прод-функции) ----------
  const ev = (fn, arg) => pg.evaluate(fn, arg);

  // Воскресный тик: -1 день + принудительная неделя → checkDailyReset (дневной бэкфилл + осада + пул понедельника).
  async function sundayTick() {
    const res = await ev(() => {
      lastDayReset = getMSKDayKey(Date.now() - 86400000);
      lastWeekReset = '2000-01-03';
      checkDailyReset();
      const m = document.getElementById('siegeReportModal');
      return {
        week: siege.week,
        shown: !!(m && m.classList.contains('show')),
        body: m ? document.getElementById('siegeReportBody').innerHTML : '',
        rows: m ? [...document.querySelectorAll('#siegeReportBody .sh-siege-row')].map(function (el) { return { cls: el.className, txt: el.textContent }; }) : [],
        gold: HERO.gold,
        captured: strongholds.filter(function (s) { return s.captured; }).length,
      };
    });
    await pg.waitForTimeout(2300); // showWeeklyReport setTimeout(2000) — прибить, чтобы не перекрывал клики
    await ev(() => {
      const m = document.getElementById('siegeReportModal');
      if (m && m.classList.contains('show') && typeof closeSiegeReport === 'function') closeSiegeReport();
      if (typeof closeWeeklyReportModal === 'function') closeWeeklyReportModal();
    });
    return res;
  }

  // Дневной тик без недели.
  async function dayTick() { await ev(() => { lastDayReset = getMSKDayKey(Date.now() - 86400000); checkDailyReset(); }); await pg.waitForTimeout(200); }

  // Штурм через UI (реальные клики). QA-чит: assaultUsedDay = null — «новые сутки» (лимит 1/день персистится только в сессии).
  async function assaultUI(idx) {
    await pg.locator('.bnav-btn[data-view="strongholds"]').click({ force: true });
    await pg.waitForTimeout(200);
    await ev((i) => { currentShIdx = null; assaultUsedDay = null; renderStrongholds(); }, idx);
    await pg.locator(`.sh-assault[data-idx="${idx}"]`).first().click({ force: true });
    await pg.waitForSelector('#confirmOverlay.show', { timeout: 3000 });
    await pg.locator('#confirmYes').click();
    await pg.waitForTimeout(500);
    return ev((i) => ({ captured: strongholds[i].captured, army: JSON.parse(JSON.stringify(army.units)), gold: HERO.gold }), idx);
  }

  async function hireN(tier, n, toGarrison, idx) {
    await ev(({ t, n, g, i }) => { for (let k = 0; k < n; k++) hireUnit(t, g, i); }, { t: tier, n, g: toGarrison, i: idx });
  }

  // Инжект просроченных задач → дневной тик истекает их в призраков (реальный поток expireGhostTasks).
  async function makeGhosts(n) {
    await ev((n) => {
      for (let k = 0; k < n; k++) TASKS.unshift({ id: taskIdCounter++, name: 'QA-просрочка ' + k + ':' + Date.now() + ':' + Math.random(), tier: 'urgent', deadline: Date.now() - 3 * 86400000, status: 'active', createdAt: Date.now() - 4 * 86400000, doneAt: null, ghostSince: null });
    }, n);
    await dayTick();
    const g = await ev(() => countGhostTasks());
    if (g < n) throw new Error('призраков после тика: ' + g + ', ожидалось ≥ ' + n);
  }

  // Фикстура v8 через прод-миграцию applySyncData (skipRender=true → рендерим сами).
  function v8payload(mut) {
    const strongholds = [];
    for (let i = 0; i < 20; i++) strongholds.push({ id: 'sh' + String(i + 1).padStart(2, '0'), captured: false, garrison: [], buildings: {}, corruption: { stage: 'ok', debtDays: 0 } });
    const p = {
      v: 8,
      hero: { name: 'QA', level: 1, xp: 0, xpToNext: 100, totalXp: 0, gold: 300 },
      stats: {},
      forged: [{ id: 1, name: 'QA-карточка', rank: 'C', stat: 'str', mastery: 0, masteryThreshold: 5 }],
      forgedIdCounter: 2, goals: [], inventory: { backpack: [], equipped: {} },
      tasks: [], taskIdCounter: 1,
      tractState: { regions: 0, building: null },
      xpHistory: [], bloodOath: null,
      lastDayReset: null, lastWeekReset: '2000-01-03',
      savedAt: Date.now(),
      strongholds,
      army: { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 0 },
      siege: { week: 1, lastResult: null },
    };
    if (mut) mut(p);
    return p;
  }
  async function applyFixture(p) {
    await ev((d) => {
      applySyncData(d, true);
      renderStrongholds(); updateHeroUI(); updateStrongholdProgress(); renderTasks(); renderDashboard(); renderCards(); renderTract();
    }, p);
    await pg.waitForTimeout(300);
  }

  // Покупка постройки через UI-панель твердыни.
  async function buildUI(idx, bid) {
    await pg.locator('.bnav-btn[data-view="strongholds"]').click({ force: true });
    await pg.waitForTimeout(200);
    await ev((i) => { currentShIdx = i; renderStrongholdPanel(i); }, idx);
    await pg.locator(`.sh-buy[data-bid="${bid}"]`).first().click({ force: true });
    await pg.waitForTimeout(300);
  }

  const cap10 = (s) => String(s).slice(0, 160);

  // ===================== БЛОК 0. Новый игрок (qa.md п.1) =====================
  await step('0.1 старт-колода: выбор 2 карточек и принятие', async () => {
    await pg.waitForSelector('#starterDeckModal.show', { timeout: 5000 });
    const boxes = pg.locator('#starterDeckList input[type="checkbox"]');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await boxes.nth(i).uncheck();
    await boxes.nth(0).check(); await boxes.nth(1).check();
    await pg.locator('[data-action="accept-starter-deck"]').click();
    await pg.waitForTimeout(400);
    if (await pg.locator('#starterDeckModal.show').isVisible().catch(() => false)) throw new Error('модалка не закрылась');
  });
  await step('0.2 онбординг пролистан до конца', async () => {
    for (let i = 0; i < 14; i++) {
      if (await ev(() => !document.querySelector('.onboarding-overlay'))) break;
      await ev(() => { const btn = document.querySelector('.onboarding-overlay button'); if (btn) btn.click(); });
      await pg.waitForTimeout(150);
    }
    if (await pg.locator('.onboarding-overlay.show').isVisible().catch(() => false)) throw new Error('онбординг не закрылся');
  });
  await step('0.3 вкладка «Твердыни»: 4 провинции, 20 твердынь, фронт sh01, прогресс 0/20', async () => {
    await pg.locator('.bnav-btn[data-view="strongholds"]').click({ force: true });
    await pg.waitForTimeout(400);
    const st = await ev(() => ({
      provs: document.querySelectorAll('.sh-prov').length,
      cards: document.querySelectorAll('.sh-card').length,
      fronts: document.querySelectorAll('.sh-card.front').length,
      owned: document.querySelectorAll('.sh-card.owned').length,
      header: document.getElementById('progressVal').textContent,
      frontName: (document.querySelector('.sh-card.front .sh-name') || {}).textContent || '',
      frontPower: (document.querySelector('.sh-card.front .sh-meta') || {}).textContent || '',
    }));
    if (st.provs !== 4 || st.cards !== 20 || st.fronts !== 1 || st.owned !== 0) throw new Error('сетка: ' + JSON.stringify(st));
    if (st.header !== '0/20') throw new Error('header: ' + st.header);
    if (!st.frontName.includes('Сендер-Хутор')) throw new Error('фронт: ' + st.frontName);
    if (!st.frontPower.includes('15')) throw new Error('сила нейтралов фронта: ' + st.frontPower);
  });
  await shot(pg, 'b0_grid_new_player');

  // ===================== БЛОК 1. Долгая кампания, недели 1–6 (сценарий 1) =====================
  await step('1.1 казна выдана (чит 500), Ж1 в Сендер-Хуторе построен через UI, иммунитет записан', async () => {
    await ev(() => { HERO.gold = 500; });
    await pg.locator('.sh-card.front[data-action="sh-open"]').first().click({ force: true });
    await pg.waitForTimeout(300);
    await pg.locator('.sh-buy[data-bid="zh1"]').first().click({ force: true });
    await pg.waitForTimeout(300);
    const st = await ev(() => ({ gold: HERO.gold, zh1: strongholds[0].buildings.zh1, fresh: Object.keys(strongholds[0].buildings).filter(function(bid) { var bb = strongholds[0].buildings[bid]; return bb.builtAt && Date.now() - bb.builtAt < 7 * 86400000; }).length }));
    if (st.gold !== 440) throw new Error('золото: ' + st.gold);
    if (!st.zh1 || !st.zh1.built || st.zh1.corruptionStage !== 'ok') throw new Error('zh1: ' + JSON.stringify(st.zh1));
    if (st.zh1.builtAt === undefined || st.zh1.builtAt === null) throw new Error('builtAt не записан');
  });
  await step('1.2 неделя 1, понедельник: пул Т1 = 14 из Ж1; осада при 0 захваченных не приходит (week=1)', async () => {
    const r = await sundayTick();
    const pool = await ev(() => hirePool.t1);
    if (pool !== 14) throw new Error('пул: ' + pool);
    if (r.week !== 1) throw new Error('week: ' + r.week);
    if (r.shown) throw new Error('модалка осады при нуле захватов: ' + cap10(r.body));
  });
  await step('1.3 неделя 1: найм 6 в гарнизон + 8 в армию (−14💰, delta-проверка), штурм sh01 → захват (atk по SM > 15)', async () => {
    const g0 = await ev(() => HERO.gold);
    await hireN('t1', 6, true, 0);
    await hireN('t1', 8, false, 0);
    const pre = await ev(() => ({ atk: Math.round(SM.armyPower(army.units) * (1 + 0.02 * STATS.str.value)), defN: STRONGHOLDS[0].total, gold: HERO.gold }));
    if (pre.atk <= pre.defN) throw new Error('атаке не хватит: ' + JSON.stringify(pre));
    if (pre.gold !== g0 - 14) throw new Error(`найм списал ${g0 - pre.gold}, ожидалось 14`);
    const r = await assaultUI(0);
    if (!r.captured) throw new Error('sh01 не захвачена');
    const armyAfter = await ev(() => army.units.t1);
    if (armyAfter <= 0 || armyAfter >= 8) throw new Error('attrition не списан/армия обнулена: ' + armyAfter);
  });
  await step('1.4 БАГ-ПРОБА: иконки захваченных твердынь не содержат «undefined» (дубль shSprite app.js:1608/1709)', async () => {
    await ev(() => { currentShIdx = null; renderStrongholds(); });
    await pg.waitForTimeout(700); // ждём onerror/img-404
    const bad = await ev(() => [...document.querySelectorAll('.sh-card.owned .sh-icon')].filter((el) => el.textContent.includes('undefined')).length);
    if (bad > 0) throw new Error('owned-иконок с текстом «undefined»: ' + bad + ' — shSprite(idx) перекрыт вторым объявлением shSprite(path,emoji): <img src="0"> → 404 → onerror пишет «undefined»');
  });
  await step('1.5 воскресенье 1: осада отбита гарнизоном (garDef ≥ power по SM), гарнизон −15% c floor, week→2', async () => {
    const model = await ev(() => ({
      garDef: SM.defensePower(STRONGHOLDS[0], strongholds[0].garrison, STATS.end.value, defBonusOf(0)),
      power: SM.siegePower(STRONGHOLDS[0].total, siege.week - 1, capturedCount(), Math.min(10, 2 * countGhostTasks() + (siege.wkSkips || 0) + (siege.wkTaskFails || 0))),
      gar: strongholds[0].garrison.length ? strongholds[0].garrison[0].count : 0,
    }));
    const r = await sundayTick();
    if (!r.body.includes('отбита')) throw new Error('в отчёте нет «отбита»: ' + cap10(r.body));
    if (r.week !== 2) throw new Error('week: ' + r.week);
    if (model.garDef < model.power) throw new Error('модель говорила «падение», а UI отбил: ' + JSON.stringify(model));
    const garAfter = await ev(() => (strongholds[0].garrison[0] || {}).count || 0);
    const expected = model.gar - Math.min(Math.floor(model.gar * 0.15), model.gar - 1);
    if (garAfter !== expected) throw new Error(`гарнизон ${model.gar} → ${garAfter}, по формуле −15% floor: ${expected}`);
  });
  await step('1.6 неделя 2: пул 14, штурм sh02 → захват, Ж1 в sh02, гарнизон 4', async () => {
    const pool = await ev(() => hirePool.t1);
    if (pool !== 14) throw new Error('пул недели 2: ' + pool);
    await hireN('t1', 10, false, 0);
    const r = await assaultUI(1);
    if (!r.captured) throw new Error('sh02 не захвачена');
    await buildUI(1, 'zh1');
    await hireN('t1', 4, true, 1);
    const st = await ev(() => ({ h: document.getElementById('progressVal').textContent, zh1: strongholds[1].buildings.zh1 && strongholds[1].buildings.zh1.built }));
    if (st.h !== '2/20' || !st.zh1) throw new Error('после недели 2: ' + JSON.stringify(st));
  });
  await step('1.7 воскресенье 2: отбито (фронт sh02 «Лаголь»); захват sh02 сбросил счётчик → week 1+1 = 2 (SPEC §5: W от захвата фронта)', async () => {
    const s = await sundayTick();
    if (!s.body.includes('отбита') || !s.body.includes('Лаголь')) throw new Error('отчёт: ' + cap10(s.body));
    if (s.week !== 2) throw new Error('week: ' + s.week);
  });
  await step('1.8 неделя 3: штурм sh03 → захват, Ж1, гарнизон 4; воскресенье 3: отбито «Лесопилка», week 2', async () => {
    await hireN('t1', 12, false, 0);
    const r = await assaultUI(2);
    if (!r.captured) throw new Error('sh03 не захвачена (атака слаба?)');
    await buildUI(2, 'zh1');
    await hireN('t1', 4, true, 2);
    const s = await sundayTick();
    if (!s.body.includes('отбита') || !s.body.includes('Лесопилка') || s.week !== 2) throw new Error('воскресенье 3: week=' + s.week + ', ' + cap10(s.body));
  });
  await step('1.9 неделя 4: штурм sh04 → захват, Ж1, гарнизон 6; воскресенье 4: отбито «Медные Копи», week 2', async () => {
    await hireN('t1', 15, false, 0);
    const r = await assaultUI(3);
    if (!r.captured) throw new Error('sh04 не захвачена');
    await buildUI(3, 'zh1');
    await hireN('t1', 6, true, 3);
    const s = await sundayTick();
    if (!s.body.includes('отбита') || !s.body.includes('Медные') || s.week !== 2) throw new Error('воскресенье 4: week=' + s.week + ', ' + cap10(s.body));
  });
  await step('1.10 неделя 5 + ГНЕВ: 1 просрочка → призрак (гнев 3), штурм sh05 → захват, гарнизон 8; воскресенье 5: отбито «Житницы» при гневе (power 90 = SM-формуле), week 2', async () => {
    await makeGhosts(1);
    const pool = await ev(() => hirePool.t1);
    if (pool < 56) throw new Error('пул недели 5: ' + pool + ' (4 жилищ по 14)');
    await hireN('t1', 33, false, 0);
    const r = await assaultUI(4);
    if (!r.captured) throw new Error('sh05 не захвачена');
    await buildUI(4, 'zh1');
    await hireN('t1', 8, true, 4);
    const model = await ev(() => ({
      garDef: SM.defensePower(STRONGHOLDS[4], strongholds[4].garrison, STATS.end.value, defBonusOf(4)),
      expPower: SM.siegePower(STRONGHOLDS[4].total, 0, capturedCount(), 3),
      wrath: Math.min(10, 2 * countGhostTasks() + (siege.wkSkips || 0) + (siege.wkTaskFails || 0)),
    }));
    if (model.wrath !== 3) throw new Error('гнев: ' + model.wrath + ' (1 призрак ×2 + 1 провал задачи)');
    if (model.garDef < model.expPower) throw new Error('гарнизон слабее осады: ' + JSON.stringify(model));
    const s = await sundayTick();
    if (!s.body.includes('отбита') || !s.body.includes('Житницы') || s.week !== 2) throw new Error('воскресенье 5: week=' + s.week + ', ' + cap10(s.body));
    if (!s.body.includes('Гнев: 3/10')) throw new Error('в отчёте нет «Гнев: 3/10»: ' + cap10(s.body));
    const mm = s.body.match(/оборона (\d+) против (\d+)/);
    if (!mm || +mm[2] !== model.expPower) throw new Error(`power в отчёте ${mm && mm[2]} ≠ SM (w=0, гнев 3) = ${model.expPower}`);
  });
  await step('1.11 неделя 6 без захватов: счётчик копится (w=1), осада отбита (power = SM при живом гневе), week 3', async () => {
    const model = await ev(() => ({
      exp: SM.siegePower(STRONGHOLDS[4].total, 1, capturedCount(), Math.min(10, 2 * countGhostTasks() + (siege.wkSkips || 0) + (siege.wkTaskFails || 0))),
      garDef: SM.defensePower(STRONGHOLDS[4], strongholds[4].garrison, STATS.end.value, defBonusOf(4)),
    }));
    if (model.garDef < model.exp) throw new Error('гарнизон не удержит: ' + JSON.stringify(model));
    const s = await sundayTick();
    if (!s.body.includes('отбита') || s.week !== 3) throw new Error('воскресенье 6: week=' + s.week + ', ' + cap10(s.body));
    const mm = s.body.match(/оборона (\d+) против (\d+)/);
    if (!mm || +mm[2] !== model.exp) throw new Error(`power ${mm && mm[2]} ≠ SM ${model.exp}`);
  });
  await step('1.12 неделя 7 без захватов: w=2, отбита (power = SM), week 4 — счётчик готов к каскаду', async () => {
    const model = await ev(() => ({
      exp: SM.siegePower(STRONGHOLDS[4].total, 2, capturedCount(), Math.min(10, 2 * countGhostTasks() + (siege.wkSkips || 0) + (siege.wkTaskFails || 0))),
      garDef: SM.defensePower(STRONGHOLDS[4], strongholds[4].garrison, STATS.end.value, defBonusOf(4)),
    }));
    if (model.garDef < model.exp) throw new Error('гарнизон не удержит: ' + JSON.stringify(model));
    const s = await sundayTick();
    if (!s.body.includes('отбита') || s.week !== 4) throw new Error('воскресенье 7: week=' + s.week + ', ' + cap10(s.body));
    const mm = s.body.match(/оборона (\d+) против (\d+)/);
    if (!mm || +mm[2] !== model.exp) throw new Error(`power ${mm && mm[2]} ≠ SM ${model.exp}`);
  });
  await step('1.13 неделя 8 — КАСКАД: гарнизоны слиты в армию, +4 призрака (гнев 10), w=3: прорыв 1.5× сносит sh05→sh04→sh03, на sh03 гаснет (58 ≤ 1.5×47), week→1', async () => {
    await ev(() => { for (let i = 0; i <= 4; i++) moveStack('t1', false, i); });
    await makeGhosts(4);
    const model = await ev(() => ({ wrath: Math.min(10, 2 * countGhostTasks() + (siege.wkSkips || 0) + (siege.wkTaskFails || 0)), week: siege.week }));
    if (model.wrath !== 10 || model.week !== 4) throw new Error('до каскада: ' + JSON.stringify(model));
    const r = await sundayTick();
    if (r.week !== 1) throw new Error('после падений week должен сброситься в 1: ' + r.week);
    if (!r.shown) throw new Error('модалка каскада не показана');
    const lost = r.rows.filter((x) => x.cls.includes('lost'));
    const refuge = r.rows.filter((x) => x.cls.includes('refuge'));
    // SPEC §5: максимум 3 твердыни за ночь; прорыв — если power > 1.5×garDef
    if (lost.length !== 3) throw new Error('потерь в отчёте: ' + lost.length + ', ожидалось 3 (лимит ударов за ночь)');
    if (refuge.length !== 0) throw new Error('refuge не должно быть — sh01/sh02 выжили');
    // Модельная сверка каждого удара: power_i = round(SM.siegePower(total_i, 3, captured_i, 10) × 0.85^i)
    // Парность по ИМЕНИ твердыни из строки отчёта (порядок chk — по индексу, порядок lost — по ударам).
    const parse = (t) => {
      const nm = (t.match(/(?:💀|🛡)\s*(.+?)\s+—/) || [])[1];
      const m = t.match(/оборона (\d+) против (\d+)/);
      return nm && m ? { nm, garDef: +m[1], power: +m[2] } : null;
    };
    for (let i = 0; i < lost.length; i++) {
      const p = parse(lost[i].txt);
      if (!p) throw new Error('не распарсен отчёт: ' + cap10(lost[i].txt));
      const capturedAtHit = 5 - i;
      const exp = await ev(({ total, capturedAtHit, i }) => Math.round(SM.siegePower(total, 3, capturedAtHit, 10) * Math.pow(0.85, i)), { total: (await ev((nm) => STRONGHOLDS.find((d) => d.name === nm).total, p.nm)), capturedAtHit, i });
      if (exp !== p.power) throw new Error(`удар ${i} (${p.nm}): power ${p.power} ≠ SM ${exp}`);
      if (p.power <= p.garDef) throw new Error(`удар ${i}: power ${p.power} ≤ garDef ${p.garDef} — не должен был пасть`);
      const isLast = i === lost.length - 1;
      if (!isLast && !(p.power > 1.5 * p.garDef)) throw new Error(`удар ${i}: power ${p.power} ≤ 1.5×garDef ${p.garDef} — прорыва не было, каскад должен был погаснуть раньше`);
    }
    if (!r.body.includes('Гнев: 10/10')) throw new Error('нет «Гнев: 10/10»: ' + cap10(r.body));
  });
  await step('1.14 после каскада: sh03/sh04/sh05 пали (постройки в руине), sh01+sh02 целы, фронт sh03 — нейтралы по таблице (40)', async () => {
    await ev(() => { closeSiegeReport(); renderStrongholds(); });
    await pg.waitForTimeout(300);
    const st = await ev(() => ({
      captured: strongholds.filter((s) => s.captured).length,
      s1: strongholds[1].captured,
      s2: strongholds[2].captured,
      s4: strongholds[4].captured,
      ruin: strongholds[2].buildings.zh1 ? strongholds[2].buildings.zh1.corruptionStage : 'none',
      frontMeta: (document.querySelector('.sh-card.front .sh-meta') || {}).textContent || '',
    }));
    if (st.captured !== 2 || !st.s1 || st.s2 || st.s4) throw new Error('захвачено: ' + JSON.stringify(st));
    if (st.ruin !== 'ruin') throw new Error('постройка павшей не в руине: ' + st.ruin);
    if (!st.frontMeta.includes('40')) throw new Error('нейтралы фронта не табличные: ' + st.frontMeta);
  });
  await shot(pg, 'b1_after_cascade');

  // ===================== БЛОК 2. Анти-тупик D3 (сценарий 4) =====================
  await step('2.1 фиксстура: sh01+sh02 без гарнизонов, неделя 2; фронт sh03 — нейтралы базовые 40 (не накопленные)', async () => {
    await applyFixture(v8payload((p) => {
      p.siege.week = 2;
      p.strongholds[0].captured = true;
      p.strongholds[1].captured = true;
    }));
    const st = await ev(() => ({
      h: document.getElementById('progressVal').textContent,
      frontMeta: (document.querySelector('.sh-card.front .sh-meta') || {}).textContent || '',
      week: siege.week,
    }));
    if (st.h !== '2/20' || !st.frontMeta.includes('40') || st.week !== 2) throw new Error(JSON.stringify(st));
  });
  await step('2.2 осада с гневом 10: ОБЕ падают с прорывом → refuge: sh01 захвачена той же ночью, гарнизон 0, постройки в руине, week→1', async () => {
    await makeGhosts(5); // гнев = 2×5 + 5 провалов = 15 → кап 10
    const r = await sundayTick();
    const st = await ev(() => ({
      s0: strongholds[0].captured,
      s1: strongholds[1].captured,
      gar0: strongholds[0].garrison.length,
      ruin0: strongholds[0].buildings.zh1 ? strongholds[0].buildings.zh1.corruptionStage : 'нет построек',
      week: siege.week,
    }));
    if (!st.s0 || st.s1) throw new Error('анти-тупик не сработал: ' + JSON.stringify(st));
    if (st.gar0 !== 0) throw new Error('гарнизон прибежища не пуст: ' + st.gar0);
    if (st.week !== 1) throw new Error('week: ' + st.week);
    if (!r.body.includes('прибежище')) throw new Error('в отчёте нет refuge-строки: ' + cap10(r.body));
  });
  await step('2.3 возврат возможен: починка Ж1 + неделя (осада отбита, гнев 0) → пул 14 → найм 14 → штурм sh02 → захват (2/20)', async () => {
    await applyFixture(v8payload((p) => {
      p.strongholds[0].captured = true;
      p.strongholds[0].buildings.zh1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      p.siege.week = 1;
    }));
    const s = await sundayTick();
    if (!s.body.includes('отбита') || s.week !== 2) throw new Error('воскресенье: ' + cap10(s.body));
    await hireN('t1', 14, false, 0);
    const r = await assaultUI(1);
    if (!r.captured) throw new Error('перезахват sh02 не удался — путь возврата закрыт!');
    const h = await ev(() => document.getElementById('progressVal').textContent);
    if (h !== '2/20') throw new Error('header: ' + h);
  });
  await shot(pg, 'b2_deadlock_recovery');

  // ===================== БЛОК 3. Отступление ×5 (сценарий 3) =====================
  await step('3.1 фиксстура: 10 захваченных, фронт sh11 (нейтралы 1100), армия 500 т1 → atk 1060 < 1100 (поражение гарантировано по SM)', async () => {
    await applyFixture(v8payload((p) => {
      for (let i = 0; i < 10; i++) p.strongholds[i].captured = true;
      p.army.units.t1 = 500;
    }));
    const m = await ev(() => ({ atk: Math.round(SM.armyPower(army.units) * (1 + 0.02 * STATS.str.value)), defN: STRONGHOLDS[10].total }));
    if (m.atk >= m.defN) throw new Error('атака не слабее обороны: ' + JSON.stringify(m));
  });
  await step('3.2 отступлений 5 подряд: потери каждой стопы 10–30% (равномерно), армия никогда не в ноль', async () => {
    for (let run = 1; run <= 5; run++) {
      const before = await ev(() => army.units.t1);
      const r = await assaultUI(10);
      if (r.captured) throw new Error(`прогон ${run}: sh11 захвачена — ожидалось отступление`);
      const after = await ev(() => army.units.t1);
      const pct = (before - after) / before;
      if (pct < 0.0999 || pct > 0.3001) throw new Error(`прогон ${run}: потери ${(pct * 100).toFixed(1)}% вне коридора 10–30% (${before}→${after})`);
      if (after <= 0) throw new Error(`прогон ${run}: армия обнулена`);
    }
    const fin = await ev(() => army.units.t1);
    if (fin < 50) throw new Error('финальная армия подозрительно мала: ' + fin);
  });
  await step('3.3 фронт не сдвинулся: штурмовать sh11 снова можно (нейтралы на месте, захватов всё ещё 10)', async () => {
    const st = await ev(() => ({
      h: document.getElementById('progressVal').textContent,
      front: !!document.querySelector('.sh-assault[data-idx="10"]'),
    }));
    if (st.h !== '10/20' || !st.front) throw new Error(JSON.stringify(st));
  });
  await shot(pg, 'b3_retreat');

  // ===================== БЛОК 4. Коррапшн полный цикл + иммунитет (сценарии 2 и 9а) =====================
  // Изоляция: только sh01 (налог 1💰), постройки zh1+df1+ec1 (апкип 21, доход 0) → каждый тик гарантированный
  // дефицит (1 < 21); иммунитеты сброшены (без наследства от блока 1); lastWeekReset = текущий понедельник (осада/XP/уровни не мешают).
  await step('4.1 фиксстура: sh01; Ж1+Частокол+Рынок; иммунитеты сброшены; wil 3 → grace 2; апкип 21, доход 1', async () => {
    await applyFixture(v8payload((p) => {
      p.strongholds[0].captured = true;
      p.strongholds[0].buildings.zh1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      p.strongholds[0].buildings.df1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      p.strongholds[0].buildings.ec1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      p.hero.gold = 0;
    }));
    await ev(() => {
      
      lastWeekReset = getThisMondayKey();                      // QA-чит: неделя «текущая» — воскресный блок не сработает
      STATS.wil.value = 3;                                     // grace = 2 + floor(3/20) = 2
    });
    const m = await ev(() => ({ grace: Math.min(7, 2 + Math.floor(STATS.wil.value / 20)), upkeep: shUpkeepPerDay(), income: shIncomePerDay(), fresh: Object.keys(strongholds[0].buildings).filter(function(bid) { var bb = strongholds[0].buildings[bid]; return bb.builtAt && Date.now() - bb.builtAt < 7 * 86400000; }).length }));
    if (m.grace !== 2) throw new Error('grace: ' + m.grace);
    if (m.upkeep !== 21) throw new Error('содержание: ' + m.upkeep);
    if (m.income !== 1) throw new Error('доход: ' + m.income);
    if (m.fresh !== 0) throw new Error('shFresh не очищен');
  });
  await step('4.2 дефицит, ночь 1: upkeep первым, казна → 0 (доход 1 < апкипа 21), все debt 1, стадия ещё Целое (grace 2)', async () => {
    await dayTick();
    const st = await ev(() => ({
      gold: HERO.gold,
      zh1: strongholds[0].buildings.zh1, df1: strongholds[0].buildings.df1, ec1: strongholds[0].buildings.ec1,
    }));
    if (st.gold !== 0) throw new Error('казна не обнулилась: ' + st.gold);
    for (const [k, b] of [['zh1', st.zh1], ['df1', st.df1], ['ec1', st.ec1]]) {
      if (b.corruptionStage !== 'ok' || b.debtDays !== 1) throw new Error(k + ': ' + JSON.stringify(b));
    }
  });
  await step('4.3 ИММУНИТЕТ + Обветшало: zh1 помечен «свежим» (чит) → ночи 2–3 его не трогают (debt 1), df1/ec1 → debt 3 Обветшало; пул полон (zh1 цел), формула −50% = 7; оборона +10, апкип 21', async () => {
    await ev(() => { shFresh['0:zh1'] = Date.now(); }); // QA-чит: «построена только что»
    await dayTick();
    await dayTick();
    await ev(() => { delete shFresh['0:zh1']; }); // снимаем иммунитет СРАЗУ — до ассертов (иначе каскад)
    const st = await ev(() => ({
      zh1: strongholds[0].buildings.zh1, df1: strongholds[0].buildings.df1, ec1: strongholds[0].buildings.ec1,
      pool: (recalcHirePool(), hirePool.t1),
      wornPoolFormula: Math.round(BUILDINGS.zh1.grow * stageMult('worn')),
      defBonus: defBonusOf(0),
      upkeep: shUpkeepPerDay(),
      income: shIncomePerDay(),
    }));
    if (st.zh1.corruptionStage !== 'ok' || st.zh1.debtDays !== 1) throw new Error('иммунный zh1: ' + JSON.stringify(st.zh1));
    for (const [k, b] of [['df1', st.df1], ['ec1', st.ec1]]) {
      if (b.corruptionStage !== 'worn' || b.debtDays !== 3) throw new Error(k + ': ' + JSON.stringify(b));
    }
    if (st.pool !== 14) throw new Error('пул: ' + st.pool + ' (zh1 иммунен-цел → полный пул 14)');
    if (st.wornPoolFormula !== 7) throw new Error('формула −50% пула: ' + st.wornPoolFormula);
    if (st.defBonus !== 10) throw new Error('бонус обороны при worn: ' + st.defBonus);
    if (st.upkeep !== 21) throw new Error('Обветшало должно платить полный апкип: ' + st.upkeep);
    if (st.income !== 1) throw new Error('доход при worn (рынок 10%→5% на базе 1): ' + st.income);
  });
  await shot(pg, 'b4_worn_badges');
  await step('4.4 восстановление: оплата лечит 1 ступень/день → Обветшало → Целое, долг 0; арифметика дня = +доход −апкип', async () => {
    const m = await ev(() => ({ inc: shIncomePerDay(), up: shUpkeepPerDay() }));
    await ev(() => { HERO.gold = 500; });
    await dayTick();
    const st = await ev(() => ({
      gold: HERO.gold,
      zh1: strongholds[0].buildings.zh1, df1: strongholds[0].buildings.df1, ec1: strongholds[0].buildings.ec1,
    }));
    if (st.gold !== 500 + m.inc - m.up) throw new Error(`золото ${st.gold}, ожидалось 500+${m.inc}−${m.up}`);
    for (const [k, b] of [['zh1', st.zh1], ['df1', st.df1], ['ec1', st.ec1]]) {
      if (b.corruptionStage !== 'ok' || b.debtDays !== 0) throw new Error(k + ': ' + JSON.stringify(b));
    }
  });
  await step('4.5 руина: 5 ночей дефицита (debt 5 > grace+step 4) → Руина; «руина не ест»: содержание 0, эффекты 0', async () => {
    await ev(() => { HERO.gold = 0; });
    for (let d = 0; d < 5; d++) await dayTick();
    const st = await ev(() => ({
      zh1: strongholds[0].buildings.zh1, df1: strongholds[0].buildings.df1, ec1: strongholds[0].buildings.ec1,
      upkeep: shUpkeepPerDay(), defBonus: defBonusOf(0),
      pool: (recalcHirePool(), hirePool.t1),
      income: shIncomePerDay(),
    }));
    for (const [k, b] of [['zh1', st.zh1], ['df1', st.df1], ['ec1', st.ec1]]) {
      if (b.corruptionStage !== 'ruin' || b.debtDays !== 5) throw new Error(k + ': ' + JSON.stringify(b));
    }
    if (st.upkeep !== 0) throw new Error('руина ест содержание: ' + st.upkeep);
    if (st.defBonus !== 0 || st.pool !== 0) throw new Error('эффекты руины не нулевые: bonus=' + st.defBonus + ' pool=' + st.pool);
    if (st.income !== 1) throw new Error('доход при руине: ' + st.income + ' (только налог 1)');
  });
  await step('4.6 «руина не ест» + лечение: оплаченный день поднимает на 1 ступень (Руина→Обветшало), при upkeep 0 — даже с пустой казной', async () => {
    await dayTick(); // upkeep 0 → paid = (1 ≥ 0) → восстановление без золота
    const a = await ev(() => ({ stage: strongholds[0].buildings.zh1.corruptionStage, gold: HERO.gold, debt: strongholds[0].buildings.zh1.debtDays }));
    if (a.stage !== 'worn' || a.debt !== 0) throw new Error('шаг 1 восстановления: ' + JSON.stringify(a));
    if (a.gold < 1) throw new Error('налог за ночь пропал: ' + a.gold);
    await ev(() => { HERO.gold = 500; }); // оплачиваем следующий день штатно
    await dayTick();
    const b = await ev(() => ({ stage: strongholds[0].buildings.zh1.corruptionStage, gold: HERO.gold, ec1: strongholds[0].buildings.ec1.corruptionStage }));
    if (b.stage !== 'ok' || b.ec1 !== 'ok') throw new Error('шаг 2 восстановления: ' + JSON.stringify(b));
  });
  await shot(pg, 'b4_recovered');

  // ===================== БЛОК 5. П4 «Врата Ветров» ×1.4 (сценарий 9б) =====================
  await step('5.1 пул найма: без П4 — 14/нед; sp4 в sh13 (ок) → round(14×1.4) = 20/нед', async () => {
    await applyFixture(v8payload((p) => {
      for (let i = 0; i < 13; i++) p.strongholds[i].captured = true;
      p.strongholds[0].buildings.zh1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      p.hero.gold = 10000;
    }));
    const base = await ev(() => (recalcHirePool(), hirePool.t1));
    if (base !== 14) throw new Error('базовый пул: ' + base);
    const st = await ev(() => {
      strongholds[12].buildings.sp4 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      return { wind: hasSpecialOk('sp4'), pool: (recalcHirePool(), hirePool.t1), cost: BUILDINGS.sp4.cost };
    });
    if (!st.wind) throw new Error('hasSpecialOk(sp4) = false');
    if (st.pool !== 20) throw new Error('пул с П4: ' + st.pool + ' (ожидалось round(14×1.4)=20)');
  });

  // ===================== БЛОК 6. Оффлайн 10 дней (сценарий 5) =====================
  await step('6.1 фиксстура: 1 захваченная без построек, казна 100, неделя 1; уровень 5 (xpToNext 5000 — воскресная осада +100 XP НЕ даст level-up +30💰)', async () => {
    await applyFixture(v8payload((p) => {
      p.strongholds[0].captured = true;
      p.hero.gold = 100;
      p.hero.level = 5;
      p.hero.xp = 100;
      p.hero.xpToNext = 5000;
      p.hero.totalXp = 500;
    }));
  });
  await step('6.2 lastDayReset −10 дней: докрутка капом 7 (налог +7💰, НЕ +10), осадное воскресенье внутри окна отработано ровно один раз (week 1→2), без спирали', async () => {
    const r = await ev(() => {
      lastDayReset = getMSKDayKey(Date.now() - 10 * 86400000);
      lastWeekReset = '2000-01-03';
      const before = HERO.gold;
      checkDailyReset();
      return { delta: HERO.gold - before, week: siege.week, reset: lastDayReset, today: getMSKDayKey(), stages: strongholds.flatMap((s) => Object.values(s.buildings).map((b) => b.corruptionStage)) };
    });
    await pg.waitForTimeout(2300);
    await ev(() => { closeSiegeReport(); closeWeeklyReportModal(); });
    if (r.delta !== 7) throw new Error(`докручено ${r.delta}💰, ожидалось 7 (кап 7 суток × налог 1) — кап 10 дней НЕ должен был пройти целиком`);
    if (r.week !== 2) throw new Error('осада отработала не ровно один раз: week=' + r.week);
    if (r.reset !== r.today) throw new Error('lastDayReset не довёрнут до сегодня');
    if (r.stages.some((s) => s !== 'ok')) throw new Error('спираль: ' + JSON.stringify(r.stages));
  });

  // ===================== БЛОК 7. W_eff: кап по прогрессу, не по календарю (сценарий 7) =====================
  await step('7.1 captured=6, календарная неделя 13: осада считалась с W_eff=9 (floor(6×1.5)), НЕ 12; отбита, power в отчёте = SM-формуле', async () => {
    await applyFixture(v8payload((p) => {
      for (let i = 0; i < 6; i++) p.strongholds[i].captured = true;
      p.strongholds[5].garrison = [{ tier: 't5', count: 5 }];
      p.siege.week = 13;
      p.hero.gold = 500;
    }));
    const m = await ev(() => ({
      wr: Math.min(10, 2 * countGhostTasks() + (siege.wkSkips || 0) + (siege.wkTaskFails || 0)),
      garDef: SM.defensePower(STRONGHOLDS[5], strongholds[5].garrison, STATS.end.value, defBonusOf(5)),
      pAt12: SM.siegePower(STRONGHOLDS[5].total, 12, 6, 0),
      pAt9: SM.siegePower(STRONGHOLDS[5].total, 9, 6, 0),
      pAt8: SM.siegePower(STRONGHOLDS[5].total, 8, 6, 0),
      pUncapped12: SM.siegePower(STRONGHOLDS[5].total, 12, 20, 0),
    }));
    if (m.pAt12 !== m.pAt9) throw new Error(`SM: неделя 12 (${m.pAt12}) ≠ неделя 9 (${m.pAt9}) — кап W_eff=9 не работает`);
    if (!(m.pAt8 < m.pAt9)) throw new Error('рост до капа сломан: ' + m.pAt8 + ' ≥ ' + m.pAt9);
    if (!(m.pAt12 < m.pUncapped12)) throw new Error('календарная неделя 12 должна была бы дать больше: ' + JSON.stringify(m));
    if (m.garDef < m.pAt12) throw new Error('гарнизон не удержит: ' + JSON.stringify(m));
    const r = await sundayTick();
    if (r.week !== 14) throw new Error('week: ' + r.week);
    const mm = r.body.match(/оборона (\d+) против (\d+)/);
    if (!mm) throw new Error('не распарсен отчёт: ' + cap10(r.body));
    if (+mm[2] !== m.pAt12) throw new Error(`power в отчёте ${mm[2]} ≠ SM(week12→cap9) ${m.pAt12}`);
    if (+mm[2] === m.pUncapped12) throw new Error('отчёт показал силу некапнутой 12-й недели');
    if (!r.body.includes('отбита')) throw new Error('осада не отбита: ' + cap10(r.body));
  });
  await shot(pg, 'b7_weff_report');

  // ===================== БЛОК 8. Скидка 🎭 и бесплатные переводы (сценарий 8) =====================
  await step('8.1 cha=40: цена Т2 = ceil(5×0.8) = 4 (hireCostOf), найм списывает ровно 4', async () => {
    await applyFixture(v8payload((p) => {
      p.strongholds[0].captured = true;
      p.strongholds[1].captured = true;
      p.strongholds[1].buildings.zh1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      p.strongholds[1].buildings.zh2 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      p.hero.gold = 500;
    }));
    await ev(() => { STATS.cha.value = 40; recalcHirePool(); });
    const m = await ev(() => ({ cost2: hireCostOf('t2'), cost1: hireCostOf('t1'), pool2: hirePool.t2, g: HERO.gold }));
    if (m.cost2 !== Math.ceil(5 * 0.8) || m.cost2 !== 4) throw new Error('цена Т2: ' + m.cost2);
    if (m.cost1 !== 1) throw new Error('цена Т1: ' + m.cost1);
    if (m.pool2 !== 12) throw new Error('пул Т2: ' + m.pool2);
    await hireN('t2', 1, false, 1);
    const g = await ev(() => HERO.gold);
    if (g !== m.g - 4) throw new Error(`найм списал ${m.g - g}, ожидалось 4`);
  });
  await step('8.2 переводы армия↔гарнизон бесплатны (золото не трогается), стек доезжает целиком', async () => {
    const g0 = await ev(() => HERO.gold);
    await ev(() => moveStack('t2', true, 1));
    const mid = await ev(() => ({ gar: strongholds[1].garrison, army: army.units.t2, gold: HERO.gold }));
    await ev(() => moveStack('t2', false, 1));
    const back = await ev(() => ({ army: army.units.t2, gar: strongholds[1].garrison.length, gold: HERO.gold }));
    if (mid.gold !== g0 || back.gold !== g0) throw new Error(`перевод списал золото: ${g0} → ${mid.gold} → ${back.gold}`);
    if (!mid.gar.some((s) => s.tier === 't2' && s.count === 1) || mid.army !== 0) throw new Error('перевод в гарнизон: ' + JSON.stringify(mid));
    if (back.army !== 1 || back.gar !== 0) throw new Error('перевод обратно: ' + JSON.stringify(back));
  });
  await step('8.3 F5: гарнизон переживает перезагрузку', async () => {
    await ev(() => { moveStack('t2', true, 1); });
    const before = await ev(() => JSON.stringify({ gar: strongholds[1].garrison, army: army.units.t2, gold: HERO.gold }));
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1500);
    await ev(() => { if (document.querySelector('.onboarding-overlay')) { const btn = document.querySelector('.onboarding-overlay button'); while (btn && document.querySelector('.onboarding-overlay')) btn.click(); } });
    const after = await ev(() => JSON.stringify({ gar: strongholds[1].garrison, army: army.units.t2, gold: HERO.gold }));
    if (before !== after) throw new Error(before + ' -> ' + after);
  });

  // ===================== БЛОК 9. Миграция v7 → v8 (сценарий 6) =====================
  await step('9.1 фиксстура v7 (tractState.regions=7, золото 555, задача) → миграция: ровно 7 захваченных, золото цело, армия пуста, неделя осады 1, схема 8', async () => {
    const v7 = {
      v: 7,
      hero: { name: 'Мигрант', level: 5, xp: 10, xpToNext: 200, totalXp: 610, gold: 555 },
      stats: {},
      forged: [{ id: 1, name: 'Старая карточка', rank: 'B', stat: 'wil', mastery: 2, masteryThreshold: 5 }],
      forgedIdCounter: 2, goals: [], inventory: { backpack: [], equipped: {} },
      tasks: [{ id: 1, name: 'Задача v7', tier: 'normal', deadline: Date.now() + 86400000, status: 'active', createdAt: Date.now(), doneAt: null, ghostSince: null }],
      taskIdCounter: 2,
      tractState: { regions: 7, building: null },
      xpHistory: [], bloodOath: null,
      lastDayReset: new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10), // MSK-день «сегодня» (getMSKDayKey в node нет)
      lastWeekReset: '2000-01-03',
      savedAt: Date.now(),
    };
    await ev((d) => { applySyncData(d, true); renderStrongholds(); updateHeroUI(); updateStrongholdProgress(); renderTasks(); }, v7);
    await pg.waitForTimeout(300);
    const st = await ev(() => ({
      v: JSON.parse(localStorage.getItem('neurodeck_full_save')).v,
      captured: strongholds.filter((s) => s.captured).length,
      first7: strongholds.slice(0, 7).every((s) => s.captured),
      rest: strongholds.slice(7).every((s) => !s.captured),
      gold: HERO.gold,
      army: Object.values(army.units).reduce((a, b) => a + b, 0),
      week: siege.week,
      buildingsEmpty: strongholds.every((s) => Object.keys(s.buildings).length === 0),
      header: document.getElementById('progressVal').textContent,
      tasks: TASKS.length,
    }));
    if (st.v !== 8) throw new Error('schemaVersion: ' + st.v);
    if (st.captured !== 7 || !st.first7 || !st.rest) throw new Error('захвачено: ' + JSON.stringify(st));
    if (st.gold !== 555) throw new Error('золото мигранта изменилось: ' + st.gold);
    if (st.army !== 0) throw new Error('армия не пуста: ' + st.army);
    if (st.week !== 1) throw new Error('неделя осады: ' + st.week);
    if (!st.buildingsEmpty) throw new Error('постройки не пустые');
    if (st.header !== '7/20') throw new Error('header: ' + st.header);
    if (st.tasks !== 1) throw new Error('v7-задачи потеряны: ' + st.tasks);
  });
  await step('9.2 F5 после миграции: 7 захватов и золото 555 переживают перезагрузку', async () => {
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1500);
    const st = await ev(() => ({ captured: strongholds.filter((s) => s.captured).length, gold: HERO.gold, v: JSON.parse(localStorage.getItem('neurodeck_full_save')).v }));
    if (st.captured !== 7 || st.gold !== 555 || st.v !== 8) throw new Error(JSON.stringify(st));
  });
  await shot(pg, 'b9_migrated');

  // ===================== БЛОК 10. Полный F5-цикл байт-в-байт (сценарий 10) =====================
  await step('10.1 обогащение состояния: Ж1 в sh01, Амбары (worn, debt 3) в sh02, гарнизон т1×5 в sh02, неделя осады 3', async () => {
    await buildUI(0, 'zh1');
    await ev(() => {
      strongholds[1].buildings.ec2 = { built: true, corruptionStage: 'worn', debtDays: 3 };
      strongholds[1].garrison = [{ tier: 't1', count: 5 }];
      siege.week = 3;
      renderStrongholds();
    });
    const st = await ev(() => ({ zh1: strongholds[0].buildings.zh1.built, ec2: strongholds[1].buildings.ec2, gar: strongholds[1].garrison, week: siege.week }));
    if (!st.zh1 || st.ec2.corruptionStage !== 'worn' || st.gar.length !== 1 || st.week !== 3) throw new Error(JSON.stringify(st));
  });
  await step('10.2 F5 байт-в-байт: золото, твердыни, гарнизоны, стадии коррапшна, неделя осады — строка JSON идентична до и после', async () => {
    const before = await ev(() => JSON.stringify({ gold: HERO.gold, strongholds: strongholds, army: army, siege: siege }));
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1500);
    await ev(() => { if (document.querySelector('.onboarding-overlay')) { const btn = document.querySelector('.onboarding-overlay button'); while (btn && document.querySelector('.onboarding-overlay')) btn.click(); } });
    const after = await ev(() => JSON.stringify({ gold: HERO.gold, strongholds: strongholds, army: army, siege: siege }));
    if (before !== after) {
      let d = 0; while (d < before.length && before[d] === after[d]) d++;
      throw new Error('состояние разошлось на позиции ' + d + ': …' + before.slice(Math.max(0, d - 60), d + 60) + ' || …' + after.slice(Math.max(0, d - 60), d + 60));
    }
  });
  await shot(pg, 'b10_final_state');

  // ===================== Итоги =====================
  console.log('\n===== ПРИЁМОЧНЫЙ ПРОГОН «МЕСЯЦ ЖИЗНИ КОРОЛЕВСТВА» =====');
  for (const [st, name, err] of results) console.log(`${st} ${name}${err ? '\n     -> ' + err : ''}`);
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\nИТОГО: ${results.length - fails}/${results.length} OK, провалено: ${fails}`);
  const other = errors.filter((e) => !errors404.includes(e));
  console.log('JS-ошибки консоли за сессию: ' + errors.length + ' (из них 404-ресурсы: ' + errors404.length + ', прочие: ' + other.length + ')');
  const uniq404 = [...new Set(urls404)];
  console.log('404 URL (' + urls404.length + ' запросов, уникальных ' + uniq404.length + '): ' + JSON.stringify(uniq404.slice(0, 25)));
  if (errors404.length) console.log('404 (первые 5): ' + JSON.stringify(errors404.slice(0, 5), null, 1));
  if (other.length) console.log('ПРОЧИЕ (первые 10): ' + JSON.stringify(other.slice(0, 10), null, 1));
  await b.close(); srv.close();
  process.exit(fails > 0 || errors.length > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });
