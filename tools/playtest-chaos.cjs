// NeuroDeck QA-Chaos — разрушитель. Роль: .opencode/agent/qa-chaos.md. Каркас — tools/playtest-acceptance.cjs.
// Продукт НЕ меняется: краш/зависание = находка (P1), фиксируется, не чинится. Порт 8840.
const { chromium } = require('/root/neurodeck/node_modules/@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/root/neurodeck';
const OUT = '/tmp/opencode/qa-chaos';
fs.mkdirSync(OUT, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const d = fs.readFileSync(path.join(ROOT, p)); res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'text/plain' }); res.end(d); }
  catch (e) { res.writeHead(404); res.end('nf'); urls404.push(p); }
});
const urls404 = [];

const results = [];
const hangs = [];        // шаги >15 c — кандидаты «зависание»
const findings = [];     // { id, sev, title, evidence }
const crashes = [];      // pageerror/консольные ошибки за сессию
let shotN = 0;

async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); const d = Date.now() - t0; results.push(['OK  ', name, d > 8000 ? 'SLOW ' + d + 'ms' : '']); if (d > 15000) hangs.push(name + ' ' + d + 'ms'); }
  catch (e) { const d = Date.now() - t0; results.push(['FAIL', name, e.message.split('\n')[0].slice(0, 220)]); if (d > 15000) hangs.push(name + ' ' + d + 'ms'); }
}
async function shot(pg, label) {
  shotN++;
  await pg.screenshot({ path: `${OUT}/shot${String(shotN).padStart(2, '0')}_${label}.png` }).catch(() => {});
}
function finding(sev, title, evidence) { findings.push({ sev, title, evidence }); }

(async () => {
  let infraUp = false, infraTried = 0;
  while (!infraUp && infraTried < 2) { // инфра-протокол: падение = 1 повтор
    infraTried++;
    try { await new Promise((res, rej) => { srv.once('error', rej); srv.listen(8840, res); }); infraUp = true; }
    catch (e) { console.error('INFRA: listen 8840 attempt ' + infraTried + ' failed: ' + e.message); }
  }
  if (!infraUp) { console.error('SKIP-infra: порт 8840 недоступен после 1 повтора'); process.exit(3); }

  let b;
  try { b = await chromium.launch(); }
  catch (e) {
    console.error('INFRA: browser launch attempt 1 failed: ' + e.message.split('\n')[0] + ' — повтор…');
    try { b = await chromium.launch(); }
    catch (e2) { console.error('SKIP-infra: браузер не поднялся после 1 повтора: ' + e2.message.split('\n')[0]); process.exit(3); }
  }
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  pg.on('pageerror', (e) => { const m = 'PAGEERROR: ' + e.message; errors.push(m); crashes.push(m); });
  pg.on('console', (m) => {
    if (m.type() !== 'error' || m.text().includes('ERR_FAILED')) return;
    const t = 'CONSOLE: ' + m.text();
    errors.push(t);
    if (!/Failed to load resource|404/.test(t)) crashes.push(t);
  });
  await pg.route('**/*', (r) => { r.request().url().includes('localhost') ? r.continue() : r.abort(); });
  await pg.goto('http://localhost:8840/', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1500);

  // ---------- Хелперы ----------
  const ev = (fn, arg) => pg.evaluate(fn, arg);

  // Даблклик: 2 подряд .click({force:true}) без waitForTimeout. Второй клик может легально не найти кнопку (DOM-removal guard) — фиксируем.
  async function dblClick(sel) {
    await pg.locator(sel).first().click({ force: true, timeout: 2500 });
    try { await pg.locator(sel).first().click({ force: true, timeout: 2500 }); return { second: 'clicked' }; }
    catch (e) { return { second: 'btn-gone (' + e.message.split('\n')[0].slice(0, 60) + ')' }; }
  }

  // QA-чит: пин Math.random (восстанавливать ОБЯЗАТЕЛЬНО).
  async function pinRandom(v) { await ev((p) => { window.__origRandom = Math.random; Math.random = function () { return p; }; }, v); }
  async function unpinRandom() { await ev(() => { if (window.__origRandom) { Math.random = window.__origRandom; delete window.__origRandom; } }); }

  // QA-чит: подмена clock (Date.now) на MSK 23:59:59 «сегодня». Восстановление обязательно.
  async function fakeClockToMidnightEdge() {
    return ev(() => {
      window.__realNow = Date.now;
      const real = Date.now();
      const mskMs = ((real + 3 * 3600000) % 86400000 + 86400000) % 86400000;
      const target = 23 * 3600000 + 59 * 60000 + 59 * 1000; // 23:59:59.000
      window.__fakeOffset = (target - mskMs + 86400000) % 86400000;
      Date.now = function () { return window.__realNow.call(Date) + window.__fakeOffset; };
      const d = new Date(Date.now() + 3 * 3600000);
      return { fakeDay: d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'), offset: window.__fakeOffset };
    });
  }
  async function restoreClock() {
    await ev(() => {
      if (window.__realNow) { Date.now = window.__realNow; delete window.__realNow; delete window.__fakeOffset; }
    });
    await ev(() => { lastDayReset = getMSKDayKey(); }); // нейтрализация: реальный «сегодня», чтобы интервальный тик был no-op
  }

  // Ручной дневной тик (прод-путь): lastDayReset = вчера → checkDailyReset().
  async function manualTick() {
    return ev(() => {
      lastDayReset = getMSKDayKey(Date.now() - 86400000);
      const before = HERO.gold;
      checkDailyReset();
      return { delta: HERO.gold - before, reset: lastDayReset, event: dailyEvent ? dailyEvent.id : null };
    });
  }

  // Фикстура v8 через прод-миграцию applySyncData (skipRender=true).
  function v8payload(mut) {
    const strongholds = [];
    for (let i = 0; i < 20; i++) strongholds.push({ id: 'sh' + String(i + 1).padStart(2, '0'), captured: false, garrison: [], buildings: {}, corruption: { stage: 'ok', debtDays: 0 } });
    const p = {
      v: 8,
      hero: { name: 'QA-CH', level: 1, xp: 0, xpToNext: 5000, totalXp: 0, gold: 100 },
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
      renderStrongholds(); updateHeroUI(); updateStrongholdProgress(); renderTasks(); renderDashboard(); renderCards();
    }, p);
    await pg.waitForTimeout(300);
  }

  // ===================== БЛОК C0. Даблклик «Принять» старт-колоды (на свежем профиле) =====================
  await step('C0.1 даблклик «Принять» старт-колоды: ровно 2 карточки, не 4', async () => {
    await pg.waitForSelector('#starterDeckModal.show', { timeout: 6000 });
    const boxes = pg.locator('#starterDeckList input[type="checkbox"]');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await boxes.nth(i).uncheck();
    await boxes.nth(0).check(); await boxes.nth(1).check();
    const r = await dblClick('[data-action="accept-starter-deck"]');
    await pg.waitForTimeout(400);
    const st = await ev(() => ({ forged: FORGED.length, names: FORGED.map((c) => c.name), modalOpen: document.getElementById('starterDeckModal').classList.contains('show') }));
    if (st.forged !== 2) {
      finding('P2', 'Даблклик «Принять» старт-колоды выдаёт 4 карточки вместо 2 (двойной acceptStarterDeck: нет re-entry guard, список чекбоксов не очищается в closeStarterDeck — app.js acceptStarterDeck/closeStarterDeck)', '2 быстрых клика по [data-action="accept-starter-deck"]; FORGED.length=' + st.forged + '; второй клик: ' + r.second + '; имена: ' + JSON.stringify(st.names));
      throw new Error('старт-колода: ' + st.forged + ' карточек (ожидалось 2), второй клик: ' + r.second);
    }
    if (st.modalOpen) throw new Error('модалка не закрылась');
  });
  await shot(pg, 'c0_starter_double');
  await step('C0.2 онбординг закрыт (если показан)', async () => {
    for (let i = 0; i < 14; i++) {
      if (await ev(() => !document.querySelector('.onboarding-overlay'))) break;
      await ev(() => { const btn = document.querySelector('.onboarding-overlay button'); if (btn) btn.click(); });
      await pg.waitForTimeout(150);
    }
    if (await pg.locator('.onboarding-overlay.show').isVisible().catch(() => false)) throw new Error('онбординг не закрылся');
  });

  // ===================== БЛОК A. Переход суток 23:59:59 → 00:00:10 =====================
  await step('A.1 фиксстура: sh01 захвачена (налог 1), построек нет, казна 100; неделя «текущая» (осада подавлена)', async () => {
    await applyFixture(v8payload((p) => { p.strongholds[0].captured = true; p.hero.gold = 100; }));
    await ev(() => { lastWeekReset = getThisMondayKey(); });
  });
  await step('A.2 clock=MSK 23:59:59, lastDayReset=вчера → тик: ровно один, налог ровно +1, событие «quiet» (пин 0.8)', async () => {
    const fc = await fakeClockToMidnightEdge();
    if (!fc.fakeDay) throw new Error('фейк-клок не встал: ' + JSON.stringify(fc));
    await pinRandom(0.8); // floor(0.8*5)=4 → quiet
    const r = await manualTick();
    await unpinRandom();
    if (r.delta !== 1) throw new Error('дельта ' + r.delta + ', ожидался ровно +1 налог');
    if (r.reset !== fc.fakeDay) throw new Error('lastDayReset=' + r.reset + ', ожидался ' + fc.fakeDay);
    if (r.event !== 'quiet') throw new Error('пин 0.8 дал событие ' + r.event + ' (ожидался quiet)');
  });
  await shot(pg, 'a2_morning_tick');
  await step('A.3 clock +11с = 00:00:10 следующего дня → второй суточный тик: снова ровно +1, без дублей (пин quiet)', async () => {
    await ev(() => { window.__fakeOffset += 11000; });
    await pinRandom(0.8); // quiet — иначе случайное событие (например caravan +20) меняет дельту недетерминированно
    const r = await manualTick();
    await unpinRandom();
    if (r.delta !== 1) throw new Error('дельта за новые сутки ' + r.delta + ' — двойной налог?');
    const st = await ev(() => ({ quests: dailyQuests && dailyQuests.quests ? dailyQuests.quests.length : -1, qday: dailyQuests ? dailyQuests.day : null, assault: siege.assaultDay }));
    if (st.quests !== 3) throw new Error('дейли-квесты: ' + JSON.stringify(st));
  });
  await step('A.4 повторный вызов checkDailyReset в тех же сутках = no-op (дельта 0, событие не перебрасывается)', async () => {
    const evBefore = await ev(() => (dailyEvent || {}).id);
    const r = await ev(() => { const before = HERO.gold; checkDailyReset(); return { delta: HERO.gold - before }; }); // lastDayReset === «сегодня» → ветка не выполняется
    const evAfter = await ev(() => (dailyEvent || {}).id);
    if (r.delta !== 0) throw new Error('повторный тик в тот же день списал/начислил ' + r.delta);
    if (evBefore !== evAfter) throw new Error('событие перегенерировано в тот же день: ' + evBefore + ' → ' + evAfter);
    await restoreClock();
  });

  // ===================== БЛОК B. Оффлайн −7/−8/−30 =====================
  await step('B.1 оффлайн −7 дней: докрутка ровно 7 (налог 1×7), осада ровно 1 раз (week 1→2), reset=сегодня', async () => {
    await applyFixture(v8payload((p) => { p.strongholds[0].captured = true; p.hero.gold = 0; p.siege.week = 1; }));
    const r = await ev(() => {
      lastDayReset = getMSKDayKey(Date.now() - 7 * 86400000);
      lastWeekReset = '2000-01-03';
      const before = HERO.gold;
      checkDailyReset();
      return { delta: HERO.gold - before, week: siege.week, reset: lastDayReset, today: getMSKDayKey() };
    });
    await pg.waitForTimeout(2300);
    await ev(() => { closeSiegeReport(); closeWeeklyReportModal(); });
    if (r.delta !== 7) throw new Error('докручено ' + r.delta + ', ожидалось 7');
    if (r.week !== 2) throw new Error('осада отработала не ровно один раз: week=' + r.week);
    if (r.reset !== r.today) throw new Error('lastDayReset не довёрнут: ' + r.reset);
  });
  await step('B.2 оффлайн −8 дней: кап — докручено те же 7, не 8', async () => {
    await applyFixture(v8payload((p) => { p.strongholds[0].captured = true; p.hero.gold = 0; p.siege.week = 1; }));
    const r = await ev(() => {
      lastDayReset = getMSKDayKey(Date.now() - 8 * 86400000);
      lastWeekReset = getThisMondayKey();
      const before = HERO.gold;
      checkDailyReset();
      return { delta: HERO.gold - before };
    });
    if (r.delta !== 7) throw new Error('−8 дней докрутило ' + r.delta + ' (кап 7 нарушен?)');
  });
  await step('B.3 оффлайн −30 дней: кап 7, без спирали и без зависания (zh1+df1+ec1, казна 0 → дефицит)', async () => {
    await applyFixture(v8payload((p) => {
      p.strongholds[0].captured = true; p.hero.gold = 0;
      p.strongholds[0].buildings.zh1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      p.strongholds[0].buildings.df1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      p.strongholds[0].buildings.ec1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      p.siege.week = 1;
    }));
    const t0 = Date.now();
    const r = await ev(() => {
      lastDayReset = getMSKDayKey(Date.now() - 30 * 86400000);
      lastWeekReset = getThisMondayKey();
      const before = HERO.gold;
      checkDailyReset();
      return {
        delta: HERO.gold - before, gold: HERO.gold, reset: lastDayReset, today: getMSKDayKey(),
        debts: strongholds[0] ? Object.values(strongholds[0].buildings).map((b) => b.debtDays) : [],
        stages: Object.values(strongholds[0].buildings).map((b) => b.corruptionStage),
      };
    });
    const ms = Date.now() - t0;
    if (ms > 5000) throw new Error('тик −30 дней занял ' + ms + 'ms — признак спирали/зависания');
    if (r.delta > 7) throw new Error('докручено ' + r.delta + ' — кап 7 нарушен');
    if (r.gold < 0) throw new Error('казна ушла в минус: ' + r.gold);
    if (r.reset !== r.today) throw new Error('reset не довёрнут: ' + r.reset);
    if (r.debts.some((d) => d > 7)) throw new Error('СПИРАЛЬ: debtDays ' + JSON.stringify(r.debts) + ' > 7 (бэкфилл не капнут)');
    // Стадии НЕ обязаны быть ruin: «руина не ест» (у руины upkeep 0) → paid → сброс долга и лечение ступени —
    // осцилляция ruin↔worn без накопления долга больше ~5-6 (доказано трассировкой 7 тиков: debts 1..5 → paid-сброс → 1).
    if (!r.stages.every((s) => s === 'worn' || s === 'ruin' || s === 'ok')) throw new Error('стадии: ' + JSON.stringify(r.stages));
  });
  await shot(pg, 'b3_offline30');

  // ===================== БЛОК C. Даблклики по UI =====================
  await step('C.1 фиксстура: sh01, казна 500, карточка id1 (C, mastery 0/5)', async () => {
    await applyFixture(v8payload((p) => { p.strongholds[0].captured = true; p.hero.gold = 500; }));
    await ev(() => { lastWeekReset = getThisMondayKey(); lastDayReset = getMSKDayKey(); });
    await ev(() => { switchView('deck'); });
    await pg.waitForTimeout(300);
  });
  await step('C.2 даблклик «Выполнить» карточки: XP/💰/мастерство начислены РОВНО один раз', async () => {
    const before = await ev(() => ({ gold: HERO.gold, xp: HERO.totalXp, mastery: findCard(1).mastery, comp: findCard(1).totalCompletions || 0 }));
    const r = await dblClick('.card-complete-btn[data-id="1"]');
    await pg.waitForTimeout(300);
    const after = await ev(() => ({ gold: HERO.gold, xp: HERO.totalXp, mastery: findCard(1).mastery, comp: findCard(1).totalCompletions || 0 }));
    if (after.comp !== 1 || after.mastery !== before.mastery + 1 || after.gold !== before.gold + 1) {
      throw new Error('двойное начисление? до ' + JSON.stringify(before) + ' после ' + JSON.stringify(after) + ', 2й клик: ' + r.second);
    }
  });
  await step('C.3 даблклик покупки zh1: списано ровно 60, построено 1 раз', async () => {
    await ev(() => { switchView('strongholds'); currentShIdx = 0; renderStrongholdPanel(0); });
    await pg.waitForTimeout(200);
    const g0 = await ev(() => HERO.gold);
    const r = await dblClick('.sh-buy[data-bid="zh1"]');
    await pg.waitForTimeout(300);
    const g1 = await ev(() => ({ gold: HERO.gold, built: strongholds[0].buildings.zh1 && strongholds[0].buildings.zh1.built }));
    if (g1.gold !== g0 - 60 || !g1.built) throw new Error('списание ' + (g0 - g1.gold) + ' (ожидалось 60), built=' + g1.built + ', 2й клик: ' + r.second);
  });
  await step('C.4 даблклик найма «В армию» (t1): пул −2, казна −2 — корректно на каждый клик', async () => {
    const before = await ev(() => ({ pool: hirePool.t1, gold: HERO.gold }));
    const r = await dblClick('.sh-mini[data-action="sh-hire-army"][data-tier="t1"][data-idx="0"]');
    await pg.waitForTimeout(300);
    const after = await ev(() => ({ pool: hirePool.t1, gold: HERO.gold }));
    if (after.pool !== before.pool - 2) throw new Error('пул ' + before.pool + '→' + after.pool + ' (ожидалось −2), 2й клик: ' + r.second);
    if (after.gold !== before.gold - 2) throw new Error('списание ' + (before.gold - after.gold) + ' за 2 клика (ожидалось 2)');
  });
  await step('C.5 даблклик «Да» в конфирме штурма: ровно ОДИН штурм (пин rand 0.99 → детерминированные потери)', async () => {
    await ev(() => { army.units.t1 = 40; siege.assaultDay = null; currentShIdx = null; renderStrongholds(); });
    await pinRandom(0.99);
    const before = await ev(() => ({ army: army.units.t1, atk: Math.round(SM.armyPower(army.units) * (1 + 0.02 * STATS.str.value)) }));
    await pg.locator('.sh-assault[data-idx="1"]').first().click({ force: true, timeout: 3000 });
    await pg.waitForSelector('#confirmOverlay.show', { timeout: 3000 });
    await dblClick('#confirmYes');
    await pg.waitForTimeout(600);
    await unpinRandom();
    const after = await ev(() => ({ army: army.units.t1, captured: strongholds[1].captured, day: siege.assaultDay, today: getMSKDayKey() }));
    const exp = await ev((atk) => SM.assaultOutcome(atk, STRONGHOLDS[1].total, { agi: STATS.agi.value, banner: hasSpecialOk('sp2'), rand: () => 0.99 }), before.atk);
    const expLoss = Math.min(Math.floor(before.army * exp.attritionPct), before.army - 1);
    if (after.army !== before.army - expLoss) throw new Error('армия ' + before.army + '→' + after.army + ', ожидалась одна кампания (−' + expLoss + ') — ДВОЙНОЙ ШТУРМ?');
    if (after.captured !== exp.win) throw new Error('captured=' + after.captured + ', по модели ' + exp.win);
    if (after.day !== after.today) throw new Error('assaultDay не записан: ' + after.day);
  });
  await shot(pg, 'c5_assault_single');

  // ===================== БЛОК D. Стекинг модалок =====================
  await step('D.1 фиксстура: 2 карточки; edit-card открыт', async () => {
    await applyFixture(v8payload((p) => {
      p.strongholds[0].captured = true; p.hero.gold = 100;
      p.forged = [
        { id: 1, name: 'QA-модалка', rank: 'C', stat: 'str', mastery: 0, masteryThreshold: 5, streak: 0, totalCompletions: 0 },
        { id: 2, name: 'QA-вторая', rank: 'C', stat: 'agi', mastery: 0, masteryThreshold: 5, streak: 0, totalCompletions: 0 },
      ];
      p.forgedIdCounter = 3;
    }));
    await ev(() => { lastWeekReset = getThisMondayKey(); lastDayReset = getMSKDayKey(); switchView('deck'); });
    await pg.waitForTimeout(300);
    await ev(() => openEditCardDirect(1));
    const open = await ev(() => document.getElementById('editCardModal').classList.contains('show'));
    if (!open) throw new Error('editCardModal не открылся');
  });
  await step('D.2 edit-card → ранг-ап (QA-чит mastery) → вторая волна edit поверх; поверх — sync; закрытие в обратном порядке', async () => {
    const dom = await ev(() => {
      const el = document.querySelector('[data-id="1"]');
      return { first: el ? el.tagName + '|' + el.className : null, inCard: el ? !!el.closest('.card') : null, cnt: document.querySelectorAll('[data-id="1"]').length };
    });
    const res = await ev(() => {
      try {
        const c = findCard(1); c.mastery = c.masteryThreshold;
        completeCard({ target: document.body, stopPropagation() {} }, 1);
        return { ok: true };
      } catch (e) { return { ok: false, err: e.message, stack: (e.stack || '').split('\n').slice(0, 5).join(' || ') }; }
    });
    if (!res.ok) throw new Error('completeCard упал: ' + res.err + ' | DOM: ' + JSON.stringify(dom) + ' | stack: ' + res.stack);
    await pg.waitForTimeout(1900); // 300ms до rankup-оверлея + 1000ms до openEditCardAfterRankup
    const st = await ev(() => ({
      edit: document.getElementById('editCardModal') && document.getElementById('editCardModal').classList.contains('show'),
      rankOverlay: document.getElementById('rankupOverlay') && document.getElementById('rankupOverlay').classList.contains('show'),
      banner: document.getElementById('rankupBanner') && document.getElementById('rankupBanner').classList.contains('show'),
      rank: findCard(1) ? findCard(1).rank : null,
    }));
    if (!st.edit) throw new Error('вторая волна edit не открылась: ' + JSON.stringify({ st, dom }));
    if (st.rankOverlay || st.banner) throw new Error('ранг-ап оверлей не погас: ' + JSON.stringify(st));
    if (st.rank === 'C') throw new Error('ранг-ап не произошёл');
    await ev(() => openSyncModal());
    const stack = await ev(() => ({ sync: document.getElementById('syncModal').classList.contains('show'), edit: document.getElementById('editCardModal').classList.contains('show') }));
    if (!stack.sync || !stack.edit) throw new Error('стек модалок: ' + JSON.stringify(stack));
    await ev(() => { closeSyncModal(); closeEditCard(); });
    await pg.waitForTimeout(200);
    const closed = await ev(() => ({ sync: document.getElementById('syncModal').classList.contains('show'), edit: document.getElementById('editCardModal').classList.contains('show') }));
    if (closed.sync || closed.edit) throw new Error('модалки не закрылись в обратном порядке: ' + JSON.stringify(closed));
    await ev(() => { renderCards(); switchView('deck'); }); // «всё живо» (view 'dashboard' не существует — только deck/hero/inv/quests/stats/strongholds)
  });
  await shot(pg, 'd2_modals_recovered');
  await step('D.3 sync → штурм-конфирм поверх → отмена → всё живо', async () => {
    await ev(() => { army.units.t1 = 5; siege.assaultDay = null; switchView('strongholds'); currentShIdx = null; renderStrongholds(); });
    await ev(() => openSyncModal());
    await ev(() => requestAssault(1)); // конфирм поверх sync (UI-клик сквозь модалку невозможен по hit-test — зовём прод-функцию)
    await pg.waitForSelector('#confirmOverlay.show', { timeout: 3000 });
    await pg.locator('#confirmNo').click({ force: true });
    await pg.waitForTimeout(200);
    const st = await ev(() => ({ confirm: document.getElementById('confirmOverlay').classList.contains('show'), sync: document.getElementById('syncModal').classList.contains('show'), day: siege.assaultDay, today: getMSKDayKey() }));
    if (st.confirm) throw new Error('конфирм не закрылся');
    if (!st.sync) throw new Error('sync под конфирмом потерялся');
    if (st.day === st.today) throw new Error('отмена конфирма всё равно записала штурм-день');
    await ev(() => { closeSyncModal(); renderStrongholds(); });
  });

  // ===================== БЛОК E. Все 5 событий дня принудительно =====================
  const EV = [
    { pin: 0.0, id: 'caravan' }, { pin: 0.2, id: 'smith' }, { pin: 0.4, id: 'market' }, { pin: 0.6, id: 'ghostfree' }, { pin: 0.8, id: 'quiet' },
  ];
  const evReport = [];
  for (const e of EV) {
    await step(`E.${e.id} (пин Math.random=${e.pin}): событие=${e.id}, фактическая механика`, async () => {
      await applyFixture(v8payload((p) => {
        p.strongholds[0].captured = true; p.hero.gold = 100;
        p.hero.gold = 500; // для замера цены найма
      }));
      if (e.id === 'ghostfree') {
        await ev(() => { TASKS.unshift({ id: taskIdCounter++, name: 'QA-просрочка', tier: 'urgent', deadline: Date.now() - 3 * 86400000, status: 'active', createdAt: Date.now() - 4 * 86400000, doneAt: null, ghostSince: null }); });
      }
      const pre = await ev(() => ({
        cost2: hireCostOf('t2'), income: shIncomePerDay(), gold: HERO.gold, fails: siege.wkTaskFails || 0,
      }));
      await ev(() => { lastWeekReset = getThisMondayKey(); }); // неделя не мешает
      await pinRandom(e.pin);
      const r = await manualTick();
      await unpinRandom();
      const post = await ev(() => ({
        cost2: hireCostOf('t2'), income: shIncomePerDay(), gold: HERO.gold,
        taskStatus: TASKS.length ? TASKS[0].status : null, fails: siege.wkTaskFails || 0,
        evObj: dailyEvent ? JSON.parse(JSON.stringify(dailyEvent)) : null,
      }));
      if (r.event !== e.id) throw new Error('пин ' + e.pin + ' дал событие ' + r.event + ', ожидалось ' + e.id);
      const row = { event: e.id, delta: r.delta, toastText: post.evObj ? post.evObj.text : '', cost2_before: pre.cost2, cost2_after: post.cost2, income_before: pre.income, income_after: post.income, taskStatus: post.taskStatus, wkTaskFails: post.fails - pre.fails };
      evReport.push(row);
      if (e.id === 'caravan' && r.delta !== 21) throw new Error('caravan: дельта ' + r.delta + ', ожидалось 21 (налог 1 + бонус 20)');
      if (e.id === 'smith' && post.cost2 !== pre.cost2) throw new Error('smith РАБОТАЕТ: цена t2 ' + pre.cost2 + ' → ' + post.cost2 + ' — обнови вердикт');
      if (e.id === 'market' && post.income !== pre.income) throw new Error('market РАБОТАЕТ: доход ' + pre.income + ' → ' + post.income);
      if (e.id === 'ghostfree') {
        if (post.taskStatus !== 'ghost') throw new Error('ghostfree: задача не стала призраком: ' + post.taskStatus);
        if (row.wkTaskFails !== 1 || r.delta !== 0) throw new Error('ghostfree РАБОТАЕТ (штраф подавлен?): дельта ' + r.delta + ', wkTaskFails +' + row.wkTaskFails);
      }
    });
  }
  await shot(pg, 'e_daily_events');
  // Вердикты по событиям — на основе собранных доказательств.
  const caravan = evReport.find((x) => x.event === 'caravan');
  const smith = evReport.find((x) => x.event === 'smith');
  const market = evReport.find((x) => x.event === 'market');
  const ghostfree = evReport.find((x) => x.event === 'ghostfree');
  if (caravan && caravan.delta === 21) finding('OK', 'Караван (caravan) — РАБОТАЕТ', 'казна +21 приCaptured=1 (налог 1 + бонус max(20, 1×15)=20); bonus в checkDailyReset app.js:2815');
  if (smith && smith.cost2_before === smith.cost2_after) finding('P3', 'Бродячий кузнец (smith) — ЗАГЛУШКА: скидки найма −25% нет', 'текст события обещает «дешевле на 25%», но цена найма t2 до/после = ' + smith.cost2_before + '/' + smith.cost2_after + '; dailyEvent нигде не читается (grep: только запись app.js:2814)');
  if (market && market.income_before === market.income_after) finding('P3', 'Ярмарка (market) — ЗАГЛУШКА: налоги ×1.5 не применяются', 'доход твердынь до/после = ' + market.income_before + '/' + market.income_after + ' (ожидалось ×1.5); shIncomePerDay не читает dailyEvent');
  if (ghostfree && ghostfree.wkTaskFails === 1) finding('P3', 'Духи дремлют (ghostfree) — ЗАГЛУШКА: призраки обычные (штраф −1💰 и wkTaskFails применены)', 'просрочка ушла в ghost, дельта казны ' + ghostfree.delta + ' (налог 1 − штраф 1), wkTaskFails +1 — как в обычный день; expireGhostTasks не читает dailyEvent');

  // ===================== БЛОК F. Инъекции ввода =====================
  await step('F.1 forge: пустое имя — блокируется', async () => {
    const before = await ev(() => FORGED.length);
    await ev(() => { openForge(); document.getElementById('forgeName').value = '   '; forgeCard(); });
    const after = await ev(() => FORGED.length);
    if (after !== before) throw new Error('пустое имя (пробелы) прошло валидацию');
    await ev(() => closeForge());
  });
  await step('F.2 forge: имя 1000 символов — создано (лимита нет), сейв не падает', async () => {
    await ev(() => { openForge(); document.getElementById('forgeName').value = 'Ж'.repeat(1000); forgeCard(); });
    const st = await ev(() => ({ n: FORGED.length, len: FORGED[0].name.length, saved: (localStorage.getItem('neurodeck_full_save') || '').length }));
    if (st.n < 1 || st.len !== 1000) throw new Error('карточка с 1000 символов не создана: ' + JSON.stringify({ n: st.n, len: st.len }));
    finding('P3', 'forge принимает имя 1000 символов (лимита длины нет) — раздувает сейв и верстку', 'FORGED[0].name.length=1000 создан; save OK, neurodeck_full_save=' + st.saved + ' байт');
    await shot(pg, 'f2_longname');
    await ev(() => { FORGED.shift(); renderCards(); closeForge(); saveGameState(); }); // прибираем читом
  });
  await step('F.3 forge: имя только эмодзи — создано (нет блокировки)', async () => {
    await ev(() => { openForge(); document.getElementById('forgeName').value = '🔥🩸💀⚔️🪦'; forgeCard(); });
    const st = await ev(() => ({ name: FORGED[0] ? FORGED[0].name : null }));
    if (!st.name) throw new Error('эмодзи-карточка не создана');
    finding('P3', 'forge принимает имя только из эмодзи (валидация только на пустоту после trim)', 'создана карточка с именем ' + JSON.stringify(st.name));
    await ev(() => { FORGED.shift(); renderCards(); closeForge(); });
  });
  await step('F.4 задача с именем-эмодзи — создается без краша', async () => {
    await ev(() => { document.getElementById('taskName').value = '🌊😄👉'; createTask(); });
    const st = await ev(() => ({ name: TASKS[0] ? TASKS[0].name : null, status: TASKS[0] ? TASKS[0].status : null }));
    if (st.name !== '🌊😄👉') throw new Error('задача-эмодзи: ' + JSON.stringify(st));
    await ev(() => { TASKS = TASKS.filter((t) => t.name !== '🌊😄👉'); renderTasks(); });
  });
  await step('F.5 цель с 50 шагами — создается, рендер без краша', async () => {
    await ev(() => {
      document.getElementById('goalName').value = 'QA-цель-50';
      document.getElementById('goalDeadline').value = '';
      document.getElementById('goalSteps').value = '50';
      createGoal();
    });
    const st = await ev(() => ({ steps: GOALS[0] ? GOALS[0].steps.length : -1, name: GOALS[0] ? GOALS[0].name : null }));
    if (st.steps !== 50) throw new Error('шагов: ' + JSON.stringify(st));
    await ev(() => { renderGoals(); GOALS.shift(); saveGoals(); renderGoals(); });
  });

  // ===================== БЛОК G. Кровавая Клятва × удаление карточки =====================
  await step('G.1 фиксстура: карточка id1; Клятва назначена на неё (QA-чит = assignBloodOath-объект)', async () => {
    await applyFixture(v8payload((p) => { p.hero.gold = 100; }));
    await ev(() => { lastWeekReset = getThisMondayKey(); lastDayReset = getMSKDayKey(); });
    await ev(() => {
      const c = findCard(1);
      bloodOath = { cardId: c.id, cardName: c.name, streak: 0, requiredDays: BLOOD_OATH_REQUIRED, status: 'active', assignedMonday: getThisMondayKey(), lastCompletedDay: null };
      renderCards();
    });
    const badge = await ev(() => document.querySelector('.blood-oath-badge') ? document.querySelector('.blood-oath-badge').textContent : '');
    if (!badge.includes('Клятва')) throw new Error('бейдж клятвы не отрисовался: ' + JSON.stringify(badge));
  });
  await step('G.2 удаление карточки с активной Клятвой: клятва отменяется, без краша', async () => {
    await ev(() => { switchView('deck'); });
    await pg.waitForTimeout(300);
    const diag = await ev(() => {
      const btn = document.querySelector('[data-action="delete-card"][data-id="1"]');
      if (!btn) return { btn: false };
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const badges = [...document.querySelectorAll('.blood-oath-badge')];
      return {
        btn: true, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        hit: hit ? hit.tagName + '|' + hit.className : null, cardExists: !!findCard(1), badgeCount: badges.length,
        badgeRect: badges[0] ? (function () { const b = badges[0].getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; })() : null,
      };
    });
    if (diag.btn && diag.hit && !diag.hit.includes('delete-card')) {
      finding('P2', 'Бейдж Клятвы перекрывает кнопки ✎/🗑 карточки: тап по 🗑 на карточке с активной Клятвой не проходит (делегированный обработчик получает бейдж без data-action — клик умирает)', 'geometry: кнопка ' + JSON.stringify(diag.rect) + ', бейдж ' + JSON.stringify(diag.badgeRect) + ', elementFromPoint(центр кнопки) = ' + diag.hit + '; .blood-oath-badge position:absolute (css) — z над .card-corner-actions');
    }
    // Логика удаления — прямой DOM-клик той же кнопки (мимо перекрытия, тот же делегированный обработчик)
    await ev(() => { const b = document.querySelector('[data-action="delete-card"][data-id="1"]'); if (b) b.click(); });
    await pg.waitForSelector('#confirmOverlay.show', { timeout: 3000 });
    await pg.locator('#confirmYes').click({ force: true });
    await pg.waitForTimeout(500);
    const st = await ev(() => ({ oath: bloodOath, cards: FORGED.length, badge: !!document.querySelector('.blood-oath-badge'), saved: JSON.parse(localStorage.getItem('neurodeck_full_save') || '{}').forged ? JSON.parse(localStorage.getItem('neurodeck_full_save')).forged.length : -1 }));
    if (st.oath !== null) throw new Error('клятва не отменена: ' + JSON.stringify({ oath: st.oath, diag }));
    if (st.cards !== 0) {
      // Клятва отменена, но карточка «воскресла» — поздний applySyncData из cloud-callback перекрыл свежий локальный стейт
      finding('P3', 'Гонка облачной синхронизации: поздний applySyncData из async-колбэка storage.js восстанавливает удалённую карточку (lost-update)', 'после удаления: FORGED.length=' + st.cards + ' (в localStorage сейв: ' + st.saved + '), bloodOath=null — колбэк принёс устаревший снапшот (места вызовов applySyncData внутри async getItem: storage.js:293/304/372/458/636/700/734)');
    }
    if (st.cards > 1) throw new Error('карточек после удаления: ' + st.cards);
  });
  await shot(pg, 'g2_oath_cancelled');

  // ===================== БЛОК H. Негатив: казна −500 =====================
  await step('H.1 HERO.gold = −500 (QA-чит): найм блокирован, пул и постройки не тронуты', async () => {
    await applyFixture(v8payload((p) => {
      p.strongholds[0].captured = true;
      p.strongholds[0].buildings.zh1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
    }));
    await ev(() => { lastWeekReset = getThisMondayKey(); lastDayReset = getMSKDayKey(); recalcHirePool(); HERO.gold = -500; });
    const pre = await ev(() => ({ pool: hirePool.t1, gold: HERO.gold }));
    await ev(() => { hireUnit('t1', false, 0); hireUnit('t1', true, 0); });
    await ev(() => { buyBuilding(0, 'ec1'); });
    const post = await ev(() => ({ pool: hirePool.t1, gold: HERO.gold, army: army.units.t1, gar: strongholds[0].garrison.length, ec1: !!(strongholds[0].buildings.ec1 && strongholds[0].buildings.ec1.built) }));
    if (post.gold !== -500) throw new Error('золото изменилось при заблокированных операциях: ' + pre.gold + ' → ' + post.gold);
    if (post.pool !== pre.pool || post.army || post.gar) throw new Error('найм прошел в минус: ' + JSON.stringify(post));
    if (post.ec1) throw new Error('покупка прошла в минус');
  });
  await step('H.2 при казне −500: выполнение карточки +1💰 и пропуск (clamp max(0,…)) — без краша', async () => {
    await ev(() => { switchView('deck'); });
    await pg.waitForTimeout(200);
    await ev(() => { completeCard({ target: document.body, stopPropagation() {} }, 1); });
    const g1 = await ev(() => HERO.gold);
    if (g1 !== -499) throw new Error('после выполнения карточки казна ' + g1 + ', ожидалось −499');
    await ev(() => { failCard({ stopPropagation() {} }, 1); });
    const g2 = await ev(() => ({ gold: HERO.gold, streak: findCard(1).streak }));
    if (g2.gold !== 0) throw new Error('failCard при отрицательной казне дал ' + g2.gold + ' (ожидался clamp на 0)');
    if (g2.streak !== 0) throw new Error('стрик не сброшен: ' + g2.streak);
  });
  await shot(pg, 'h2_negative_gold');

  // ===================== Итоги =====================
  console.log('\n===== QA-CHAOS ПРОГОН =====');
  for (const [st, name, err] of results) console.log(`${st} ${name}${err ? '\n     -> ' + err : ''}`);
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\nИТОГО: ${results.length - fails}/${results.length} OK, провалено: ${fails}`);
  console.log('Крашей (pageerror/консоль): ' + crashes.length);
  crashes.slice(0, 10).forEach((c) => console.log('  CRASH: ' + c.slice(0, 200)));
  console.log('Зависаний (шаг >15с): ' + hangs.length);
  hangs.forEach((h) => console.log('  HANG: ' + h));
  console.log('\n--- СОБЫТИЯ ДНЯ (доказательства) ---');
  console.log(JSON.stringify(evReport, null, 1));
  console.log('\n--- НАХОДКИ ---');
  findings.forEach((f) => console.log(`[${f.sev}] ${f.title}\n   ${f.evidence}`));
  const uniq404 = [...new Set(urls404)];
  console.log('404 URL: ' + JSON.stringify(uniq404.slice(0, 15)));

  fs.writeFileSync(`${OUT}/findings.json`, JSON.stringify({ findings, evReport, crashes, hangs, results }, null, 2));
  await b.close(); srv.close();
  process.exit(crashes.length > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });
