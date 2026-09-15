// NeuroDeck QA: полный плейтест свежих фич (ранг-ап модалка, квест-доска, hintOnce, дайджест,
// трофеи, торговые пути, сезоны) + сквозной сценарий нового игрока.
// Каркас — tools/playtest-acceptance.cjs (http-сервер, step/shot, ловушка ошибок консоли).
// Формулы — только через stronghold-model (SM)/StrongholdData; продукт-баги фиксируются, НЕ чинятся.
const { chromium } = require('/root/neurodeck/node_modules/@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/root/neurodeck';
const OUT = '/tmp/opencode/qa-full';
fs.mkdirSync(OUT, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const d = fs.readFileSync(path.join(ROOT, p)); res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'text/plain' }); res.end(d); }
  catch (e) { res.writeHead(404); res.end('nf'); urls404.push(p); }
});
const urls404 = [];

const results = [];
let shotN = 0;
async function step(name, fn) {
  try { await fn(); results.push(['OK  ', name, '']); }
  catch (e) {
    const m = e.message.split('\n')[0].slice(0, 220);
    if (/^SKIP:/.test(m)) results.push(['SKIP', name, m]);
    else results.push(['FAIL', name, m]);
  }
}
async function shot(pg, label) {
  shotN++;
  await pg.screenshot({ path: `${OUT}/shot${String(shotN).padStart(2, '0')}_${label}.png` }).catch(() => {});
}

(async () => {
  srv.listen(8801);
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];       // гейт: pageerror + console.error
  const errors404 = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  pg.on('console', (m) => {
    if (m.type() !== 'error' || m.text().includes('ERR_FAILED')) return;
    errors.push('CONSOLE: ' + m.text());
    if (/Failed to load resource|404/.test(m.text())) errors404.push(m.text());
  });
  await pg.route('**/*', (r) => { r.request().url().includes('localhost') ? r.continue() : r.abort(); });
  await pg.goto('http://localhost:8801/', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1800);

  // ---------- Хелперы ----------
  const ev = (fn, arg) => pg.evaluate(fn, arg);
  const drainToasts = async () => { try { await pg.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), { timeout: 4500 }); } catch (e) {} await pg.waitForTimeout(300); };

  // Тост: ждём появления тоста с ожидаемым подстроком в заголовке (#toast — один элемент,
  // очередь тостов живёт по ~2.7с: матч по тексту устойчив к хвосту предыдущей очереди;
  // таймаут 20с — с расчётом на бэклог очереди после шагов с пачками тостов).
  async function waitToast(substr, timeout = 20000) {
    await pg.waitForFunction(
      (s) => { const t = document.getElementById('toast'); return t.classList.contains('show') && t.querySelector('.t-title').textContent.includes(s); },
      substr, { timeout }
    );
    return ev(() => ({ title: document.querySelector('#toast .t-title').textContent, body: document.querySelector('#toast .t-body').textContent }));
  }
  // Клик по элементу внутри модалок, перекрытых контентом (editCardModal/syncModal вложены
  // в .app-wrap — Chromium: position:fixed = stacking context, хит-тест проходит мимо; см. находку P1).
  // Программный el.click() идёт через штатный делегированный обработчик продукта.
  const clickEl = (sel) => ev((s) => { const el = document.querySelector(s); if (!el) throw new Error('нет элемента ' + s); el.click(); }, sel);
  // Дневной тик без недельной осады (QA-чит: сдвиг lastDayReset — только манипуляция временем).
  async function dayTick() {
    await ev(() => { lastDayReset = getMSKDayKey(Date.now() - 86400000); checkDailyReset(); });
    await pg.waitForTimeout(300);
    await ev(() => { const m = document.getElementById('weeklyReportModal'); if (m && m.classList.contains('show')) closeWeeklyReportModal(); });
    await pg.waitForTimeout(200);
  }

  // ===================== БЛОК A. Загрузка =====================
  // Факт по коду (app.js:3284-3288): сначала старт-колода (+900мс), welcome-оверлей стартует
  // из closeStarterDeck → pendingOnboarding. Т.е. фактический порядок «колода → welcome».
  await step('A1 старт-колода: модалка #starterDeckModal, выбрать 2 карточки, «Взять выбранные» → FORGED.length === 2', async () => {
    await pg.waitForSelector('#starterDeckModal.show', { timeout: 6000 });
    await shot(pg, 'A1_starter_deck');
    const boxes = pg.locator('#starterDeckList input.starter-cb');
    const n = await boxes.count();
    if (n < 2) throw new Error('чекбоксов в старт-колоде: ' + n);
    for (let i = 0; i < n; i++) await boxes.nth(i).uncheck();
    await boxes.nth(0).check(); await boxes.nth(1).check();
    await pg.locator('[data-action="accept-starter-deck"]').click();
    await pg.waitForTimeout(500);
    const st = await ev(() => ({ n: FORGED.length, open: document.getElementById('starterDeckModal').classList.contains('show') }));
    if (st.n !== 2) throw new Error('FORGED.length: ' + st.n + ', ожидалось 2');
    if (st.open) throw new Error('модалка старт-колоды не закрылась');
  });
  await step('A2 welcome-оверлей (.onboarding-overlay): 1 экран, кнопка «⚔ Начать!», один клик закрывает', async () => {
    await pg.waitForSelector('.onboarding-overlay', { timeout: 4000 });
    await pg.waitForTimeout(300);
    const info = await ev(() => {
      const ov = document.querySelector('.onboarding-overlay');
      const btns = ov ? ov.querySelectorAll('button') : [];
      return { shown: !!(ov && ov.classList.contains('show')), btnText: btns[0] ? btns[0].textContent : '', btnCount: btns.length };
    });
    if (!info.shown) throw new Error('оверлей не показан');
    if (!info.btnText.includes('Начать')) throw new Error('кнопка: ' + JSON.stringify(info));
    if (info.btnCount !== 1) throw new Error('кнопок на онбординге: ' + info.btnCount + ' (ожидался 1 экран с 1 кнопкой)');
    await shot(pg, 'A2_welcome');
    await pg.locator('.onboarding-overlay button').click();
    await pg.waitForTimeout(600);
    const gone = await ev(() => !document.querySelector('.onboarding-overlay'));
    if (!gone) throw new Error('welcome-оверлей не закрылся после одного клика');
  });

  // ===================== БЛОК B. Подсказки hintOnce =====================
  await step('B1 первый переход на вкладку «Квесты» → тост «💡 Подсказка» (hintOnce)', async () => {
    await drainToasts();
    await pg.locator('.bnav-btn[data-view="quests"]').click({ force: true });
    const t = await waitToast('Подсказка');
    const body = await ev(() => document.querySelector('#toast .t-body').textContent);
    if (!body.includes('дедлайн')) throw new Error('тело подсказки не про задачи: ' + body + ' / ' + t.title);
  });
  await step('B2 повторный переход «Квесты» → второй подсказки нет (localStorage-флаг)', async () => {
    const flag = await ev(() => localStorage.getItem('neurodeck_hint_view_quests'));
    if (flag !== '1') throw new Error('флаг neurodeck_hint_view_quests: ' + flag);
    await pg.locator('.bnav-btn[data-view="deck"]').click({ force: true });
    await drainToasts();
    await pg.locator('.bnav-btn[data-view="quests"]').click({ force: true });
    await pg.waitForTimeout(800);
    const read1 = await ev(() => ({ shown: document.getElementById('toast').classList.contains('show'), title: document.querySelector('#toast .t-title').textContent }));
    await pg.waitForTimeout(800);
    const read2 = await ev(() => ({ shown: document.getElementById('toast').classList.contains('show'), title: document.querySelector('#toast .t-title').textContent }));
    for (const r of [read1, read2]) {
      if (r.shown && r.title.includes('Подсказка')) throw new Error('подсказка повторилась: ' + JSON.stringify(r));
    }
  });

  // ===================== БЛОК C. Карточки: ✓ и ✕ =====================
  let cardA, cardB;
  await step('C1 клик ✓ на карточке: gold +1, dailyCompletions +1, cardHistory за сегодня, streak 1, totalCompletions 1, стат-пул +1', async () => {
    await pg.locator('.bnav-btn[data-view="deck"]').click({ force: true });
    await pg.waitForTimeout(300);
    const pre = await ev(() => ({ gold: HERO.gold, dc: HERO.dailyCompletions }));
    cardA = await ev(() => {
      const el = document.querySelector('.card-complete-btn[data-action="complete-card"]');
      const card = FORGED.find((c) => c.id === parseInt(el.dataset.id));
      return { id: card.id, stat: card.stat, ap: STATS[card.stat].attributePoints };
    });
    await pg.locator(`.card-complete-btn[data-action="complete-card"][data-id="${cardA.id}"]`).click({ force: true });
    await pg.waitForTimeout(500);
    const post = await ev((d) => {
      const card = FORGED.find((c) => c.id === d.id);
      const today = getMSKDayKey();
      return { gold: HERO.gold, dc: HERO.dailyCompletions, ap: STATS[d.stat].attributePoints, hist: !!(HERO.cardHistory[today] && HERO.cardHistory[today][d.id]), streak: card.streak, tot: card.totalCompletions };
    }, { id: cardA.id, stat: cardA.stat });
    if (post.gold !== pre.gold + 1) throw new Error(`gold ${pre.gold}→${post.gold}, ожидалось +1`);
    if (post.dc !== pre.dc + 1) throw new Error('dailyCompletions: ' + JSON.stringify({ pre, post }));
    if (!post.hist) throw new Error('cardHistory за сегодня не содержит id ' + cardA.id);
    if (post.streak !== 1 || post.tot !== 1) throw new Error('streak/total: ' + JSON.stringify(post));
    if (post.ap !== cardA.ap + 1) throw new Error(`Morrowind-пул ${cardA.stat}: ${cardA.ap}→${post.ap}, ожидалось +1 за выполнение`);
  });
  await step('C2 клик ✕ на другой карточке: gold −1, streak сброшен в 0', async () => {
    const pre = await ev(() => HERO.gold);
    cardB = await ev((skipId) => {
      const els = [...document.querySelectorAll('.card-skip-btn[data-action="fail-card"]')];
      const el = els.map((e) => parseInt(e.dataset.id)).find((x) => x !== skipId);
      const card = FORGED.find((c) => c.id === el);
      return { id: card.id, stat: card.stat };
    }, cardA.id);
    await ev((id) => { const c = FORGED.find((x) => x.id === id); c.streak = 3; renderCards(); }, cardB.id); // QA-чит: даём стрик, чтобы проверить его сброс
    await pg.locator(`.card-skip-btn[data-action="fail-card"][data-id="${cardB.id}"]`).click({ force: true });
    await pg.waitForTimeout(500);
    const post = await ev((id) => ({ gold: HERO.gold, streak: FORGED.find((x) => x.id === id).streak }), cardB.id);
    if (post.gold !== pre - 1) throw new Error(`gold ${pre}→${post.gold}, ожидалось −1`);
    if (post.streak !== 0) throw new Error('streak после ✕: ' + post.streak + ', ожидался 0');
  });

  // ===================== БЛОК D. Редактор карточки =====================
  await step('D1 редактор через UI (✎ → editCardModal): сменить время/порог → сохранить → card.meta обновлён', async () => {
    await pg.locator(`.card-btn.edit[data-action="edit-card"][data-id="${cardA.id}"]`).click({ force: true });
    await pg.waitForSelector('#editCardModal.show', { timeout: 3000 });
    const title = await ev(() => document.getElementById('editCardTitle').textContent);
    if (!title.includes('Редактировать')) throw new Error('заголовок: ' + title);
    await pg.locator('#editCardTime').selectOption('вечер');
    await pg.locator('#editCardDuration').fill('25');
    await pg.locator('#editCardMastery').fill('7');
    await clickEl('[data-action="save-edit-card"]'); // P1: модалка перекрыта контентом — клик через штатный обработчик
    await pg.waitForTimeout(400);
    const st = await ev((id) => { const c = FORGED.find((x) => x.id === id); return { meta: c.meta, thr: c.masteryThreshold, open: document.getElementById('editCardModal').classList.contains('show') }; }, cardA.id);
    if (st.open) throw new Error('модалка не закрылась');
    if (!st.meta.includes('25 мин') || !st.meta.includes('вечер')) throw new Error('meta: ' + st.meta);
    if (st.thr !== 7) throw new Error('порог: ' + st.thr);
  });

  // ===================== БЛОК E. Единая модалка ранг-апа (на cardB — cardA уже выполнена сегодня) =====================
  await step('E1 QA-чит: card.mastery = masteryThreshold → клик ✓ → rankup-баннер показан', async () => {
    await ev((id) => { const c = FORGED.find((x) => x.id === id); c.mastery = c.masteryThreshold; renderCards(); }, cardB.id); // QA-чит: фикстура мастерства
    cardB.ap = await ev((s) => STATS[s].attributePoints, cardB.stat);
    await drainToasts();
    await pg.locator(`.card-complete-btn[data-action="complete-card"][data-id="${cardB.id}"]`).click({ force: true });
    await pg.waitForFunction(() => document.getElementById('rankupOverlay').classList.contains('show') && document.getElementById('rankupBanner').classList.contains('show'), { timeout: 4000 });
    await shot(pg, 'E1_rankup_banner');
  });
  await step('E2 через ~1.2с открыта editCardModal с #editEvolutionSection видимым, заголовок «⚔ Ранг повышен — эволюция и усложнение»', async () => {
    await pg.waitForSelector('#editCardModal.show', { timeout: 5000 });
    const st = await ev(() => ({
      title: document.getElementById('editCardTitle').textContent,
      secShown: document.getElementById('editEvolutionSection').style.display !== 'none',
      chips: document.querySelectorAll('#editEvolutionChips .stat-chip').length,
    }));
    if (st.title !== '⚔ Ранг повышен — эволюция и усложнение') throw new Error('заголовок: ' + st.title);
    if (!st.secShown) throw new Error('#editEvolutionSection скрыт');
    if (st.chips !== 3) throw new Error('чипов эволюции: ' + st.chips);
    await shot(pg, 'E2_rankup_edit_modal');
  });
  await step('E3 клик чипа data-path="frequency" (.selected), усложнение порога, сохранить → evolutionPath=frequency, masteryThreshold вырос, ранг вырос', async () => {
    await clickEl('#editEvolutionChips .stat-chip[data-path="frequency"]'); // P1: клик через штатный обработчик
    const sel = await ev(() => document.querySelector('#editEvolutionChips .stat-chip[data-path="frequency"]').classList.contains('selected'));
    if (!sel) throw new Error('чип frequency не получил .selected');
    await pg.locator('#editCardMastery').fill('12');
    await clickEl('[data-action="save-edit-card"]'); // P1: клик через штатный обработчик
    await pg.waitForTimeout(400);
    const st = await ev((id) => { const c = FORGED.find((x) => x.id === id); return { path: c.evolutionPath, thr: c.masteryThreshold, rank: c.rank, open: document.getElementById('editCardModal').classList.contains('show') }; }, cardB.id);
    if (st.path !== 'frequency') throw new Error('evolutionPath: ' + st.path);
    if (st.thr !== 12) throw new Error('порог после усложнения: ' + st.thr);
    if (st.rank === 'C') throw new Error('ранг не вырос: ' + st.rank);
    if (st.open) throw new Error('модалка не закрылась после сохранения');
  });
  await step('E4/F ранг-ап дал бонус +1 к стат-пулу (за клик ✓ с ранг-апом: +2 = выполнение + ранг)', async () => {
    const ap = await ev((s) => STATS[s].attributePoints, cardB.stat);
    if (ap !== cardB.ap + 2) throw new Error(`пул ${cardB.stat} ${cardB.ap}→${ap}, ожидалось +2 (1 выполнение + 1 ранг-ап)`);
  });

  // ===================== БЛОК G1. Квест-доска: гейт самозабора =====================
  await step('G1 квест-доска на карте: тексты «(0/N)»; клик по невыполненному «Построй что-нибудь» → тост «Ещё не выполнено», done не выставлен, золото не выросло', async () => {
    await pg.locator('.bnav-btn[data-view="strongholds"]').click({ force: true });
    await pg.waitForTimeout(400);
    const hasBuild = await ev(() => ((dailyQuests && dailyQuests.quests) || []).some((q) => q.id === 'dq_build'));
    if (!hasBuild) {
      // QA-чит: фикстура доски — гарантируем наличие квеста dq_build в ротации сегодняшнего дня
      await ev(() => {
        dailyQuests = { day: getMSKDayKey(), quests: [DQ_POOL.find((q) => q.id === 'dq_build'), DQ_POOL[0], DQ_POOL[2]], done: {}, progress: {} };
        renderStrongholds();
      });
      await pg.waitForTimeout(300);
    }
    const board = await ev(() => ({
      quests: [...document.querySelectorAll('.sh-quest[data-action="sh-daily-quest"]')].map((el) => ({ qid: el.dataset.qid, txt: el.textContent })),
      gold: HERO.gold,
    }));
    if (board.quests.length < 3) throw new Error('квестов на доске: ' + board.quests.length);
    // Чек-лист ожидал «(0/N)» у всех: по факту счётчики честно копят дневной прогресс
    // (dq_gold уже 2/30 после выполнений карточек в блоке C/E) — проверяем формат и ноль у dq_build.
    if (!board.quests.every((q) => /\(\d+\/\d+\)/.test(q.txt))) throw new Error('нет счётчика «(x/y)» у квестов: ' + JSON.stringify(board.quests));
    const build = board.quests.find((q) => q.qid === 'dq_build');
    if (!build) throw new Error('квест dq_build не найден на доске');
    if (!/\(0\/1\)/.test(build.txt)) throw new Error('dq_build не в (0/1): ' + build.txt);
    await drainToasts();
    await pg.locator('.sh-quest[data-action="sh-daily-quest"][data-qid="dq_build"]').click({ force: true });
    const t = await waitToast('Ещё не выполнено');
    if (!t.title.includes('Ещё не выполнено')) throw new Error('тост: ' + JSON.stringify(t));
    const post = await ev(() => ({ done: !!(dailyQuests.done && dailyQuests.done.dq_build), gold: HERO.gold }));
    if (post.done) throw new Error('квест отмечен done без прогресса');
    if (post.gold !== board.gold) throw new Error(`золото изменилось: ${board.gold}→${post.gold}`);
  });

  // ===================== БЛОК H. Задачи =====================
  await step('H1 создание задачи tier urgent через модалку → status active', async () => {
    await pg.locator('.bnav-btn[data-view="quests"]').click({ force: true });
    await pg.waitForTimeout(300);
    await pg.locator('[data-action="open-task-modal"]').click({ force: true });
    await pg.waitForSelector('#taskModal.show', { timeout: 3000 });
    await pg.locator('#taskName').fill('QA-задача срочно');
    await pg.locator('#taskTierChips .stat-chip[data-tier="urgent"]').click();
    const sel = await ev(() => document.querySelector('#taskTierChips .stat-chip[data-tier="urgent"]').classList.contains('selected'));
    if (!sel) throw new Error('чип urgent не выбрался');
    await pg.locator('[data-action="create-task"]').click();
    await pg.waitForTimeout(400);
    const st = await ev(() => { const t = TASKS[0]; return { tier: t.tier, status: t.status, open: document.getElementById('taskModal').classList.contains('show') }; });
    if (st.tier !== 'urgent' || st.status !== 'active') throw new Error('задача: ' + JSON.stringify(st));
    if (st.open) throw new Error('модалка задачи не закрылась');
  });
  await step('H2 complete через UI → status done; сундук: выбрать золото → +20💰 (urgent), статус chest_open', async () => {
    await drainToasts();
    const pre = await ev(() => HERO.gold);
    await pg.locator('.task-btn.primary[data-action="complete-task"]').first().click({ force: true });
    await pg.waitForTimeout(300);
    const done = await ev(() => TASKS[0].status);
    if (done !== 'done') throw new Error('статус после ✓: ' + done);
    await pg.locator('.task-btn.gold[data-action="claim-task-gold"]').first().click({ force: true });
    const t = await waitToast('Сундук открыт');
    if (!t.title.includes('Сундук')) throw new Error('тост: ' + JSON.stringify(t));
    await pg.waitForTimeout(300);
    const post = await ev(() => ({ gold: HERO.gold, status: TASKS[0].status }));
    if (post.gold !== pre + 20) throw new Error(`gold ${pre}→${post.gold}, ожидалось +20 (urgent)`);
    if (post.status !== 'chest_open') throw new Error('статус после сундука: ' + post.status);
  });
  await step('H3 QA-чит: задача с просроченным дедлайном → день тикает → expireGhostTasks: статус ghost, −1💰 за ночь', async () => {
    await ev(() => {
      TASKS.unshift({ id: taskIdCounter++, name: 'QA-просрочка ' + Date.now(), tier: 'normal', deadline: Date.now() - 3 * 86400000, status: 'active', createdAt: Date.now() - 4 * 86400000, doneAt: null, ghostSince: null });
    });
    const pre = await ev(() => HERO.gold);
    await ev(() => { window.__origRandom = Math.random; Math.random = function() { return 0.99; }; }); // пин события дня «Тихий день»: Караван (+20💰) рандомно ломает delta-проверку
    await dayTick();
    await ev(() => { if (window.__origRandom) { Math.random = window.__origRandom; delete window.__origRandom; } });
    const post = await ev(() => ({ gold: HERO.gold, ghost: TASKS.filter((t) => t.status === 'ghost').length }));
    if (post.ghost < 1) throw new Error('призраков: ' + post.ghost);
    if (post.gold !== pre - 1) throw new Error(`gold ${pre}→${post.gold}, ожидалось −1 (1 призрак × 1💰)`);
  });

  // ===================== БЛОК I. Панель твердыни: каталог и покупка =====================
  await step('I1 QA-чит: HERO.gold = 500; панель Сендер-Хутора: «Что построить сейчас» — ровно топ-3, первый «Ополченческий Двор» (cheapest 60)', async () => {
    await ev(() => { HERO.gold = 500; updateHeroUI(); }); // QA-чит: казна
    await pg.locator('.bnav-btn[data-view="strongholds"]').click({ force: true });
    await pg.waitForTimeout(300);
    await pg.locator('.sh-card.front[data-action="sh-open"]').first().click({ force: true });
    await pg.waitForTimeout(400);
    const st = await ev(() => ({
      title: (document.querySelector('.sh-panel-title') || {}).textContent || '',
      sec: [...document.querySelectorAll('.sh-sec-title')].map((e) => e.textContent).find((t) => t.includes('построить сейчас')) || '',
      rows: [...document.querySelectorAll('.sh-build-row.buy .sh-build-name')].map((e) => e.textContent),
    }));
    if (!st.title.includes('Сендер-Хутор')) throw new Error('панель: ' + st.title);
    if (st.rows.length !== 3) throw new Error('рядов в рекомендации: ' + st.rows.length + ' — ' + JSON.stringify(st.rows));
    if (!st.rows[0].includes('Ополченческий Двор')) throw new Error('первый ряд: ' + st.rows[0]);
    if (!st.sec.includes('свободно слотов')) throw new Error('секция: ' + st.sec);
    await shot(pg, 'I1_panel_top3');
  });
  await step('I2 кнопка «Открыть весь каталог» на sh01 — чек-лист ожидал «доступных >3»', async () => {
    const st = await ev(() => ({
      avail: Object.keys(BUILDINGS).filter((id) => BUILDINGS[id].min <= 1 && !(strongholds[0].buildings[id] && strongholds[0].buildings[id].built)).length,
      btn: !!document.querySelector('[data-action="sh-catalog-toggle"]'),
    }));
    // SKIP: на sh01 доступно ровно 3 постройки (zh1/ec1/df1: фильтр min<=idx+1, app.js:1965), поэтому
    // кнопка каталога по дизайну не рендерится (app.js:1983 требует avail>3). Ожидание чек-листа
    // «>3 доступных на sh01» невыполнимо; функциональность каталога покрываем на sh02 в шаге L2.
    if (st.avail !== 3) throw new Error('доступных построек на sh01: ' + st.avail);
    throw new Error('SKIP: на sh01 доступных построек ровно ' + st.avail + ' — кнопки каталога нет по дизайну (app.js:1983); поведение каталога проверено в L2');
  });
  await step('I3 покупка Ж1 через UI: gold −60, built, builtAt — число, тост «Первый прирост», hirePool.t1 = 14', async () => {
    await drainToasts();
    const pre = await ev(() => HERO.gold);
    await pg.locator('.sh-buy[data-bid="zh1"]').first().click({ force: true });
    const t = await waitToast('Первый прирост');
    if (!t.title.includes('Первый прирост')) throw new Error('тост: ' + JSON.stringify(t));
    await pg.waitForTimeout(300);
    const st = await ev(() => ({ gold: HERO.gold, zh1: strongholds[0].buildings.zh1, pool: hirePool.t1 }));
    if (st.gold !== pre - 60) throw new Error(`gold ${pre}→${st.gold}, ожидалось −60`);
    if (!st.zh1 || !st.zh1.built) throw new Error('zh1 не построен');
    if (typeof st.zh1.builtAt !== 'number') throw new Error('builtAt: ' + st.zh1.builtAt);
    if (st.pool !== 14) throw new Error('hirePool.t1: ' + st.pool);
  });

  // ===================== G2. Самозабор квеста после постройки =====================
  await step('G2 после постройки: прогресс «(1/1)»; клик по квесту → done, +20💰 награда', async () => {
    await pg.locator('.sh-back[data-action="sh-back"]').first().click({ force: true });
    await pg.waitForTimeout(400);
    const q = await ev(() => {
      const el = document.querySelector('.sh-quest[data-action="sh-daily-quest"][data-qid="dq_build"]');
      return { txt: el ? el.textContent : '' };
    });
    if (!q.txt.includes('(1/1)')) throw new Error('текст квеста: ' + q.txt);
    await drainToasts();
    const pre = await ev(() => HERO.gold);
    await pg.locator('.sh-quest[data-action="sh-daily-quest"][data-qid="dq_build"]').click({ force: true });
    const t = await waitToast('Квест выполнен');
    if (!t.title.includes('Квест выполнен')) throw new Error('тост: ' + JSON.stringify(t));
    const post = await ev(() => ({ gold: HERO.gold, done: !!(dailyQuests.done && dailyQuests.done.dq_build) }));
    if (post.gold !== pre + 20) throw new Error(`gold ${pre}→${post.gold}, ожидалось +20`);
    if (!post.done) throw new Error('квест не отмечен done');
  });

  // ===================== БЛОК J. Найм =====================
  let costT1;
  await step('J1 «В армию» ×3 через UI: army.units.t1 = 3, пул −3, списание = 3×hireCostOf (ceil с харизмой)', async () => {
    await pg.locator('.sh-card.front[data-action="sh-open"]').first().click({ force: true });
    await pg.waitForTimeout(400);
    costT1 = await ev(() => hireCostOf('t1'));
    const pre = await ev(() => ({ gold: HERO.gold, army: army.units.t1, pool: hirePool.t1 }));
    for (let i = 0; i < 3; i++) {
      await pg.locator('.sh-mini[data-action="sh-hire-army"][data-tier="t1"]').first().click({ force: true });
      await pg.waitForTimeout(250);
    }
    const post = await ev(() => ({ gold: HERO.gold, army: army.units.t1, pool: hirePool.t1 }));
    if (post.army !== 3) throw new Error('армия: ' + JSON.stringify(post));
    if (post.pool !== pre.pool - 3) throw new Error(`пул ${pre.pool}→${post.pool}`);
    if (post.gold !== pre.gold - 3 * costT1) throw new Error(`gold ${pre.gold}→${post.gold}, ожидалось −3×${costT1}`);
  });
  await step('J2 «В гарнизон» ×2 через UI: strongholds[0].garrison суммарно 2, пул −2', async () => {
    const pre = await ev(() => ({ gold: HERO.gold, pool: hirePool.t1 }));
    for (let i = 0; i < 2; i++) {
      await pg.locator('.sh-mini[data-action="sh-hire-garrison"][data-tier="t1"]').first().click({ force: true });
      await pg.waitForTimeout(250);
    }
    const post = await ev(() => ({
      gar: strongholds[0].garrison.reduce((a, s) => a + s.count, 0),
      pool: hirePool.t1, gold: HERO.gold,
    }));
    if (post.gar !== 2) throw new Error('гарнизон: ' + JSON.stringify(post));
    if (post.pool !== pre.pool - 2) throw new Error(`пул ${pre.pool}→${post.pool}`);
    if (post.gold !== pre.gold - 2 * costT1) throw new Error(`gold ${pre.gold}→${post.gold}, ожидалось −2×${costT1}`);
  });

  // ===================== БЛОК K. Штурм =====================
  await step('K1 добор армии остатком пула через UI-клики', async () => {
    const pre = await ev(() => ({ army: army.units.t1, pool: hirePool.t1, gold: HERO.gold }));
    for (let i = 0; i < pre.pool; i++) {
      await pg.locator('.sh-mini[data-action="sh-hire-army"][data-tier="t1"]').first().click({ force: true });
      await pg.waitForTimeout(200);
    }
    const post = await ev(() => ({ army: army.units.t1, pool: hirePool.t1, gold: HERO.gold }));
    if (post.army !== pre.army + pre.pool || post.pool !== 0) throw new Error('добор: ' + JSON.stringify({ pre, post }));
    if (post.gold !== pre.gold - pre.pool * costT1) throw new Error(`gold: ожидалось −${pre.pool}×${costT1}, факт ${pre.gold}→${post.gold}`);
  });
  await step('K2 кнопка «Штурм» на фронте → confirm-оверлей с прогнозом (атакующие против защитников)', async () => {
    await pg.locator('.sh-back[data-action="sh-back"]').first().click({ force: true });
    await pg.waitForTimeout(400);
    await pg.locator('.sh-assault[data-action="sh-assault"][data-idx="0"]').first().click({ force: true });
    await pg.waitForSelector('#confirmOverlay.show', { timeout: 3000 });
    const body = await ev(() => ({ title: document.getElementById('confirmTitle').textContent, body: document.getElementById('confirmBody').textContent }));
    if (!body.title.includes('Штурм') || !body.title.includes('Сендер-Хутор')) throw new Error('confirm: ' + JSON.stringify(body));
    if (!/против/.test(body.body)) throw new Error('нет прогноза в confirm: ' + body.body);
  });
  await step('K3 подтвердить → strongholds[0].captured, потери армии = floor(n×attritionPct) по SM.assaultOutcome (win)', async () => {
    const model = await ev(() => {
      const atk = Math.round(SM.armyPower(army.units) * (1 + 0.02 * STATS.str.value));
      const out = SM.assaultOutcome(atk, STRONGHOLDS[0].total, { agi: STATS.agi.value, banner: hasSpecialOk('sp2'), rand: Math.random });
      const n = army.units.t1;
      return { win: out.win, expArmy: n - Math.min(Math.floor(n * out.attritionPct), n - 1), n };
    });
    if (!model.win) throw new Error('по SM штурм не выигрывается: ' + JSON.stringify(model));
    await pg.locator('#confirmYes').click();
    await pg.waitForTimeout(600);
    const post = await ev(() => ({ captured: strongholds[0].captured, army: army.units.t1 }));
    if (!post.captured) throw new Error('sh01 не захвачена');
    if (post.army !== model.expArmy) throw new Error(`армия ${model.n}→${post.army}, по SM ожидалось ${model.expArmy}`);
  });
  await step('K4 повторный штурм в сутки заблокирован: тост «Штурм уже был», confirm не открывается', async () => {
    await pg.waitForTimeout(300);
    await drainToasts();
    await pg.locator('.sh-assault[data-action="sh-assault"][data-idx="1"]').first().click({ force: true });
    const t = await waitToast('Штурм уже был');
    if (!t.title.includes('Штурм уже был')) throw new Error('тост: ' + JSON.stringify(t));
    const open = await ev(() => document.getElementById('confirmOverlay').classList.contains('show'));
    if (open) throw new Error('confirm-оверлей открылся — гейт 1 штурм/сутки не сработал');
  });

  // ===================== БЛОК L. Торговые пути =====================
  await step('L1 QA-чит захвата strongholds[1] → строка «🛃 Торговые пути: 1 · налоги +2%», shIncomePerDay по формуле round(taxes×1.02)', async () => {
    await ev(() => { strongholds[1].captured = true; renderStrongholds(); }); // QA-чит: захват соседней твердыни
    await pg.waitForTimeout(300);
    const st = await ev(() => {
      const el = document.querySelector('.sh-trade');
      const routes = SM.tradeRoutes(strongholds.map((s) => !!s.captured));
      let taxes = 0, econ = 0, market = 0;
      strongholds.forEach((s, i) => {
        if (!s.captured) return;
        taxes += STRONGHOLDS[i].tax;
        builtList(i).forEach((id) => {
          const d = BUILDINGS[id], b = s.buildings[id];
          const m = b.corruptionStage === 'ruin' ? 0 : b.corruptionStage === 'worn' ? 0.5 : 1;
          if (d.gold) econ += d.gold * m;
          if (d.market) market += d.market * m;
        });
      });
      const t2 = Math.round(taxes * (1 + SM.tradeBonus(routes)));
      const expIncome = Math.round((t2 + Math.round(econ)) * (1 + Math.min(0.5, market)));
      return { row: el ? el.textContent : '', income: shIncomePerDay(), expIncome, routes };
    });
    if (!st.row.includes('Торговые пути: 1')) throw new Error('строка: ' + st.row);
    if (!st.row.includes('+2%')) throw new Error('бонус в строке: ' + st.row);
    if (st.routes !== 1) throw new Error('SM.tradeRoutes: ' + st.routes);
    if (st.income !== st.expIncome) throw new Error(`доход ${st.income} ≠ формуле ${st.expIncome}`);
  });
  await step('L2 каталог построек на sh02 (доступных 5 > 3): кнопка есть → «Каталог» (5 рядов) → «Свернуть» (3 ряда)', async () => {
    await pg.locator('.sh-card.owned[data-action="sh-open"][data-idx="1"]').first().click({ force: true });
    await pg.waitForTimeout(400);
    let st = await ev(() => ({ btn: !!document.querySelector('[data-action="sh-catalog-toggle"]'), btnTxt: (document.querySelector('[data-action="sh-catalog-toggle"]') || {}).textContent || '' }));
    if (!st.btn) throw new Error('кнопка каталога не найдена');
    if (!st.btnTxt.includes('Открыть весь каталог')) throw new Error('кнопка: ' + st.btnTxt);
    await pg.locator('[data-action="sh-catalog-toggle"]').click({ force: true });
    await pg.waitForTimeout(300);
    st = await ev(() => ({ rows: document.querySelectorAll('.sh-build-row.buy').length, sec: [...document.querySelectorAll('.sh-sec-title')].map((e) => e.textContent).find((t) => t.includes('Каталог')) || '' }));
    if (st.rows !== 5) throw new Error('рядов в каталоге: ' + st.rows);
    if (!st.sec.includes('Каталог')) throw new Error('секция: ' + st.sec);
    await shot(pg, 'L2_catalog_open');
    await pg.locator('[data-action="sh-catalog-toggle"]').click({ force: true });
    await pg.waitForTimeout(300);
    st = await ev(() => ({ rows: document.querySelectorAll('.sh-build-row.buy').length, btnTxt: (document.querySelector('[data-action="sh-catalog-toggle"]') || {}).textContent || '' }));
    if (st.rows !== 3) throw new Error('после сворачивания рядов: ' + st.rows);
    if (!st.btnTxt.includes('Открыть весь каталог')) throw new Error('кнопка после сворачивания: ' + st.btnTxt);
    await pg.locator('.sh-back[data-action="sh-back"]').first().click({ force: true });
    await pg.waitForTimeout(300);
  });

  // ===================== БЛОК M. Сезоны =====================
  await step('M1 чип «🍂 Сезон 1: Пробуждение» на карте, «осталось 29–30 дн.»', async () => {
    await pg.waitForTimeout(300);
    const st = await ev(() => {
      const el = document.querySelector('.sh-season-line');
      const m = el ? el.textContent.match(/осталось\s*(\d+)\s*дн/) : null;
      return { txt: el ? el.textContent : '', days: m ? parseInt(m[1]) : -1 };
    });
    if (!st.txt.includes('Сезон 1: Пробуждение')) throw new Error('чип: ' + st.txt);
    if (st.days < 29 || st.days > 30) throw new Error('осталось дней: ' + st.days + ' (ожидалось 29–30 для свежего сезона)');
    await shot(pg, 'M1_season_chip');
  });
  await step('M2 QA-чит: season.start = −31 день + lastDayReset = вчера + checkDailyReset → #seasonModal «Сезон 1: Пробуждение — завершён»', async () => {
    await ev(() => {
      season = STATE_GUARDS.sanitizeSeason({ num: 1, start: getMSKDayKey(Date.now() - 31 * 86400000) }, getMSKDayKey()); // QA-чит: время сезона
      lastDayReset = getMSKDayKey(Date.now() - 86400000); // QA-чит: время суток
      checkDailyReset();
    });
    await pg.waitForSelector('#seasonModal.show', { timeout: 4000 });
    const st = await ev(() => ({
      head: document.querySelector('#seasonModal .digest-head').textContent,
      tiles: document.querySelectorAll('#seasonModal .digest-tile').length,
      seasonNum: season.num,
    }));
    if (!st.head.includes('Сезон 1: Пробуждение — завершён')) throw new Error('заголовок: ' + st.head);
    if (st.tiles !== 4) throw new Error('плиток дельт: ' + st.tiles);
    if (st.seasonNum !== 2) throw new Error('season.num после finishSeason: ' + st.seasonNum);
    await shot(pg, 'M2_season_finished');
    await pg.locator('#seasonModal [data-action="close-season-report"]').first().click();
    await pg.waitForTimeout(300);
  });
  await step('M3 после закрытия чип показывает «Сезон 2: Закалка»', async () => {
    await ev(() => renderStrongholds());
    await pg.waitForTimeout(300);
    const txt = await ev(() => (document.querySelector('.sh-season-line') || {}).textContent || '');
    if (!txt.includes('Сезон 2: Закалка')) throw new Error('чип: ' + txt);
  });

  // ===================== БЛОК N. Дайджест недели =====================
  await step('N QA-чит: cardHistory за прошедшие дни недели + lastWeeklyReport = null → showWeeklyReport: «Дайджест недели», колонки = прошедшим дням, 4 .digest-tile, .digest-kp', async () => {
    const res = await ev(() => {
      // QA-чит: фикстура истории и флага еженедельного отчёта
      HERO.cardHistory = {};
      const monday = new Date(getThisMondayKey() + 'T00:00:00+03:00');
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setUTCDate(d.getUTCDate() + i);
        const k = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
        if (k > getMSKDayKey()) break;
        HERO.cardHistory[k] = i === 0 ? { 1: true } : { 1: true, 2: true };
      }
      HERO.lastWeeklyReport = null;
      showWeeklyReport();
      const cols = [...document.querySelectorAll('#weeklyReportModal .digest-col')];
      return {
        head: document.querySelector('#weeklyReportModal .digest-head').textContent,
        colVals: cols.map((c) => c.querySelector('.digest-val').textContent),
        tiles: document.querySelectorAll('#weeklyReportModal .digest-tile').length,
        kp: !!document.querySelector('#weeklyReportModal .digest-kp'),
        elapsedDays: Object.keys(HERO.cardHistory).length,
      };
    });
    if (!res.head.includes('Дайджест недели')) throw new Error('заголовок: ' + res.head);
    if (res.tiles !== 4) throw new Error('плиток: ' + res.tiles);
    if (!res.kp) throw new Error('.digest-kp отсутствует');
    // Чек-лист ожидал 7 колонок: по дизайну (app.js:2734 — break на будущих днях) колонок ровно
    // сколько прошло с понедельника включительно. Вторник → 2 колонки со значениями 1 и 2.
    if (res.colVals.length !== res.elapsedDays) throw new Error('колонок ' + res.colVals.length + ' ≠ прошедшим дням ' + res.elapsedDays);
    if (res.colVals[0] !== '1' || res.colVals[res.colVals.length - 1] !== '2') throw new Error('значения колонок: ' + JSON.stringify(res.colVals));
    await shot(pg, 'N_weekly_digest');
    await pg.locator('#weeklyReportModal [data-action="close-weekly-report"]').first().click();
    await pg.waitForTimeout(300);
  });

  // ===================== БЛОК O. Галерея трофеев =====================
  await step('O вкладка «Стат»: .ach-wrap есть, .ach-card = 20, есть .unlocked (Первая ковка), у locked с max>1 есть .ach-prog', async () => {
    await pg.locator('.bnav-btn[data-view="stats"]').click({ force: true });
    await pg.waitForTimeout(500);
    const st = await ev(() => {
      const cards = [...document.querySelectorAll('.ach-card')];
      const unlocked = cards.filter((c) => c.classList.contains('unlocked'));
      const lockedWithMax = cards.filter((c) => !c.classList.contains('unlocked') && c.querySelector('.ach-prog'));
      const firstForge = cards.find((c) => c.querySelector('.ach-name') && c.querySelector('.ach-name').textContent === 'Первая ковка');
      return {
        wrap: !!document.querySelector('.ach-wrap'),
        total: cards.length,
        unlockedN: unlocked.length,
        lockedWithProg: lockedWithMax.length,
        firstForgeUnlocked: !!(firstForge && firstForge.classList.contains('unlocked')),
      };
    });
    if (!st.wrap) throw new Error('.ach-wrap отсутствует');
    if (st.total !== 20) throw new Error('ach-card: ' + st.total + ', ожидалось 20');
    if (st.unlockedN < 1) throw new Error('нет разблокированных трофеев');
    if (!st.firstForgeUnlocked) throw new Error('«Первая ковка» не разблокирована при 2 карточках');
    if (st.lockedWithProg === 0) throw new Error('нет locked-карточек с .ach-prog');
    await shot(pg, 'O_achievements');
  });

  // ===================== БЛОК P. Персистентность =====================
  await step('P saveGameState → reload: FORGED, gold, season.num=2, захваты, постройка, армия, квесты — на месте', async () => {
    const snap = await ev(() => ({
      forged: FORGED.length,
      gold: HERO.gold,
      seasonNum: season.num,
      s0: strongholds[0].captured, s1: strongholds[1].captured,
      zh1: !!(strongholds[0].buildings.zh1 && strongholds[0].buildings.zh1.built),
      army: army.units.t1,
      gar: strongholds[0].garrison.reduce((a, s) => a + s.count, 0),
      dqDone: !!(dailyQuests && dailyQuests.done && dailyQuests.done.dq_build),
      pool: hirePool.t1,
      v: JSON.parse(localStorage.getItem('neurodeck_full_save')).v,
    }));
    await ev(() => saveGameState());
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1800);
    const post = await ev((s) => ({
      forged: FORGED.length,
      gold: HERO.gold,
      seasonNum: season.num,
      s0: strongholds[0].captured, s1: strongholds[1].captured,
      zh1: !!(strongholds[0].buildings.zh1 && strongholds[0].buildings.zh1.built),
      army: army.units.t1,
      gar: strongholds[0].garrison.reduce((a, sg) => a + sg.count, 0),
      dqDone: !!(dailyQuests && dailyQuests.done && dailyQuests.done.dq_build),
      pool: hirePool.t1,
      v: JSON.parse(localStorage.getItem('neurodeck_full_save')).v,
      onboard: !!document.querySelector('.onboarding-overlay'),
      starter: document.getElementById('starterDeckModal').classList.contains('show'),
    }), snap);
    for (const k of ['forged', 'gold', 'seasonNum', 's0', 's1', 'zh1', 'army', 'gar', 'dqDone', 'pool', 'v']) {
      if (JSON.stringify(post[k]) !== JSON.stringify(snap[k])) throw new Error(`${k}: ${JSON.stringify(snap[k])} → ${JSON.stringify(post[k])}`);
    }
    if (post.seasonNum !== 2) throw new Error('season.num после загрузки: ' + post.seasonNum);
    if (post.onboard || post.starter) throw new Error('интро-модалки вылезли после reload');
  });

  // ===================== БЛОК Q. Сброс «Новая игра» =====================
  await step('Q1 кнопка «Новая игра» (data-action=new-game-keep-cards) доступна в UI', async () => {
    const st = await ev(() => ({ btn: !!document.querySelector('[data-action="new-game-keep-cards"]') }));
    if (!st.btn) throw new Error('элемента [data-action="new-game-keep-cards"] нет в DOM: в index.html кнопка отсутствует, есть только обработчик case в app.js:138 (мёртвая точка входа). Логика функции проверена отдельно в Q2');
  });
  await step('Q2 (компенсация, QA-чит: прямой вызов) newGameKeepCards → confirm → gold 30, уровень 1, захватов 0, карточки сохранены', async () => {
    const forgedBefore = await ev(() => FORGED.length);
    await ev(() => newGameKeepCards());
    await pg.waitForSelector('#confirmOverlay.show', { timeout: 3000 });
    const t = await ev(() => document.getElementById('confirmTitle').textContent);
    if (!t.includes('Новая игра')) throw new Error('confirm: ' + t);
    await pg.locator('#confirmYes').click();
    await pg.waitForTimeout(600);
    const post = await ev((n) => ({
      gold: HERO.gold, level: HERO.level,
      captured: strongholds.filter((s) => s.captured).length,
      forged: FORGED.length,
    }), forgedBefore);
    if (post.gold !== 30) throw new Error('gold: ' + post.gold);
    if (post.level !== 1) throw new Error('level: ' + post.level);
    if (post.captured !== 0) throw new Error('захвачено: ' + post.captured);
    if (post.forged !== forgedBefore) throw new Error(`карточки потеряны: ${forgedBefore} → ${post.forged}`);
  });

  // ===================== Q3. Malformed HTML в sync-модалке (попутная проба) =====================
  await step('Q3 проба DOM sync-модалки: кнопка «Сброс» (full-wipe-all) на месте, секция «Напоминания» не вклеена в тег кнопки', async () => {
    await pg.locator('[data-action="open-sync-modal"]').click({ force: true });
    await pg.waitForTimeout(400);
    const st = await ev(() => {
      const btn = document.querySelector('[data-action="full-wipe-all"]');
      return {
        btnExists: !!btn,
        btnText: btn ? btn.textContent.trim().slice(0, 30) : '',
        syncInBtn: btn ? !!btn.querySelector('.sync-section') : false,
        reminderChips: [...document.querySelectorAll('[data-action="set-reminder-freq"]')].length,
      };
    });
    await pg.locator('#syncModal [data-action="close-sync-modal"]').first().click({ force: true });
    await pg.waitForTimeout(300);
    // index.html:685-702 — <div class="sync-section"> вклеен ВНУТРЬ открывающего тега
    // <button data-action="full-wipe-all">; HTML-парсер выворачивает разметку. Фиксируем факт.
    if (!st.btnExists) throw new Error('P2: кнопки [data-action="full-wipe-all"] НЕТ в DOM — malformed HTML (index.html:685-702, div внутри тега button) съедает кнопку; чипов «Напоминания»: ' + st.reminderChips);
    if (st.syncInBtn) throw new Error('P2: .sync-section вложена внутрь кнопки «Сброс» (malformed HTML index.html:685-702)');
  });

  // ===================== БЛОК R. Консоль =====================
  await step('R 0 pageerror; 404 отсутствуют', async () => {
    if (errors.length > 0) throw new Error('ошибок консоли: ' + errors.length + ' → ' + errors.slice(0, 3).join(' | '));
    if (urls404.length > 0) throw new Error('404: ' + [...new Set(urls404)].join(', '));
  });

  // ===================== БЛОК S. Аудит переполнений вёрстки =====================
  await step('S  overflow-аудит: ни на одной вкладке нет горизонтального переполнения элементов', async () => {
    const views = ['deck', 'quests', 'hero', 'inv', 'strongholds', 'stats'];
    const bad = [];
    for (const v of views) {
      await pg.evaluate((vv) => { document.querySelector('.bnav-btn[data-view="' + vv + '"]').click(); }, v);
      await pg.waitForTimeout(250);
      const list = await pg.evaluate(() => {
        const out = [];
        const clippedByAncestor = (el) => {
          let q = el.parentElement;
          while (q && !q.classList.contains('view')) {
            if (getComputedStyle(q).overflowX === 'hidden') return true;
            q = q.parentElement;
          }
          return false;
        };
        document.querySelectorAll('.view.active, .view.active *').forEach((el) => {
          if (el.offsetParent === null) return;
          const pos = getComputedStyle(el).position;
          if (pos === 'absolute' || pos === 'fixed') return; // вне потока: декор/оверлеи, вёрстку не ломают
          const ox = getComputedStyle(el).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return; // намеренные скроллеры/клипы
          if (clippedByAncestor(el)) return; // переполнение невидимо (клипается предком)
          if (el.scrollWidth > el.clientWidth + 8) out.push(((el.className && el.className.toString()) || el.tagName).slice(0, 40) + ' sw=' + el.scrollWidth + '/cw=' + el.clientWidth);
        });
        return [...new Set(out)].slice(0, 8);
      });
      list.forEach((x) => bad.push(v + ': ' + x));
    }
    if (bad.length) throw new Error('горизонтальные переполнения: ' + bad.join(' | '));
  });

  await shot(pg, 'final');

  // ---------- Итоги ----------
  console.log('\n===== ПОЛНЫЙ ПЛЕЙТЕСТ NeuroDeck (свежие фичи) =====');
  results.forEach(([s, n, e]) => console.log(s + ' ' + n + (e ? '\n     -> ' + e : '')));
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  const skips = results.filter((r) => r[0] === 'SKIP').length;
  console.log(`\nИТОГО: ${results.length - fails - skips}/${results.length} OK, провалено: ${fails}, SKIP: ${skips}`);
  console.log('JS-ошибки консоли за сессию: ' + errors.length + ' (из них 404-ресурсы: ' + errors404.length + ')');
  console.log('404 URL (' + urls404.length + ' запросов, уникальных ' + new Set(urls404).size + '): [' + [...new Set(urls404)].join(', ') + ']');
  await b.close();
  srv.close();
  process.exit(fails > 0 || errors.length > 0 ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
