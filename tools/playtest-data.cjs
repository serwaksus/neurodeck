// NeuroDeck QA: QA-Data — целостность данных (сейвы v9, миграции v7→v9, 5 слоёв защиты, экспорт/импорт, мульти-вкладка, квота, вайп).
// Роль: .opencode/agent/qa-data.md. Каркас — tools/playtest-acceptance.cjs (http-сервер, step/shot, ловушка ошибок консоли).
// Продукт НЕ меняется: только чтение состояния через прод-функции (saveGameState/applySyncData/exportJson/...).
const { chromium } = require('/root/neurodeck/node_modules/@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/root/neurodeck';
const OUT = '/tmp/opencode/qa-data';
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8820; // инфра-протокол qa-data.md
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const urls404 = [];
let srv = null;
function startServer(attempt) {
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
      try { const d = fs.readFileSync(path.join(ROOT, p)); res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'text/plain' }); res.end(d); }
      catch (e) { res.writeHead(404); res.end('nf'); urls404.push(p); }
    });
    s.once('error', (e) => { try { s.close(); } catch (x) {} if (attempt < 1) resolve(startServer(attempt + 1)); else reject(e); });
    s.listen(PORT, () => resolve(s));
  });
}

const results = [];
const findings = [];
let shotN = 0;
async function step(name, fn) {
  try { await fn(); results.push(['OK  ', name, '']); console.log('OK   ' + name); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0].slice(0, 220)]); console.log('FAIL ' + name + ' :: ' + e.message.split('\n')[0].slice(0, 220)); }
}
async function shot(pg, label) {
  shotN++;
  await pg.screenshot({ path: `${OUT}/shot${String(shotN).padStart(02, '0')}_${label}.png` }).catch(() => {});
}

// ============================================================
// БЛОК A. Node-фаззинг санитайзеров + миграции (без браузера)
// ============================================================
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function nodePhase() {
  const SG = require(ROOT + '/js/state-guards.js');
  const DATA = require(ROOT + '/js/stronghold-data.js');
  globalThis.StrongholdData = DATA;
  globalThis.STATE_GUARDS = SG;
  globalThis.window = globalThis;
  const S = require(ROOT + '/js/storage.js');
  const IV = S.__storageInternals;

  await step('A1 [node] фаззинг санитайзеров: 100 случайных мутаций валидного state — STATE_GUARDS.* не бросают, выход в норме', async () => {
    const rnd = mulberry32(20260915);
    const JUNK = [null, undefined, NaN, Infinity, -Infinity, 'x', '', 0, -1, 1e9, 1e21, -99999, [], [1, 2], {}, { a: 1 }, true, 3.7, '99999999999999999999'];
    function junk() { return JUNK[Math.floor(rnd() * JUNK.length)]; }
    function mangle(obj, depth) {
      const keys = Object.keys(obj);
      if (!keys.length) return;
      const k = keys[Math.floor(rnd() * keys.length)];
      const mode = Math.floor(rnd() * 3);
      if (mode === 0) obj[k] = junk();
      else if (mode === 1) delete obj[k];
      else if (depth < 2 && obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) mangle(obj[k], depth + 1);
      else obj[k] = junk();
    }
    function baseState() {
      return {
        hero: { name: 'QA', level: 5, xp: 100, xpToNext: 500, totalXp: 3000, gold: 777, lastSessionAt: Date.now(), dailyUniqueStats: {}, cardHistory: {} },
        forged: [{ id: 1, name: 'Зарядка', meta: '⚔ 15 мин', rank: 'B', streak: 4, stat: 'str', progress: 10, mastery: 2, masteryThreshold: 7, totalCompletions: 9 }],
        goals: [{ id: 1, type: 'short', name: 'Цель', deadline: Date.now() + 86400000, steps: [{ text: 'шаг', done: false }], stat: 'wil', failed: false }],
        inventory: { backpack: [], equipped: {}, maxSlots: 30 },
        xpHistory: [{ date: '2026-09-14', xp: 55 }],
        strongholds: DATA.STRONGHOLDS.map((d) => ({ id: d.id, captured: false, garrison: [{ tier: 't1', count: 3 }], buildings: { zh1: { built: true, builtAt: 1726000000000, corruptionStage: 'worn', debtDays: 3 } }, corruption: { stage: 'ok', debtDays: 0 } })),
        army: { units: { t1: 5, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 3 },
        siege: { week: 4, lastResult: { won: true }, assaultDay: '2026-09-14', wkSkips: 1, wkTaskFails: 2 },
        hirePool: { t1: 14, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 },
        season: { num: 2, start: '2026-09-14', snapshot: { totalXp: 100, gold: 50, captured: 1, completions: 2, level: 2 } },
      };
    }
    const RANKS = SG.RANK_PROGRESSION;
    const STATS_OK = { str: 1, end: 1, int: 1, cha: 1, wil: 1, agi: 1 };
    let throws = 0, badShape = 0;
    const firstErr = [];
    for (let i = 0; i < 100; i++) {
      const st = JSON.parse(JSON.stringify(baseState()));
      const nMut = 1 + Math.floor(rnd() * 5);
      for (let m = 0; m < nMut; m++) {
        const target = ['hero', 'forged', 'goals', 'inventory', 'xpHistory', 'strongholds', 'army', 'siege', 'hirePool', 'season'][Math.floor(rnd() * 10)];
        const arr = Array.isArray(st[target]) ? st[target][Math.floor(rnd() * st[target].length)] : st[target];
        mangle(Array.isArray(st[target]) && arr ? arr : st[target], 0);
      }
      try {
        // через полный санитайзерный конвейер прод-входа: клон, чтобы мутации не протекали между итерациями
        const c = JSON.parse(JSON.stringify(st));
        const hero = SG.sanitizeHero(c.hero);
        if (!(hero.gold >= 0 && hero.gold <= 1e9 && hero.level >= 1 && hero.level <= 99)) { badShape++; if (firstErr.length < 3) firstErr.push(i + ':hero ' + JSON.stringify(hero).slice(0, 80)); }
        const cards = (Array.isArray(c.forged) ? c.forged : []).map((x, j) => SG.sanitizeCard(x, j + 1));
        if (cards.some((cd) => !RANKS.includes(cd.rank) || !STATS_OK[cd.stat] || cd.mastery > cd.masteryThreshold)) { badShape++; if (firstErr.length < 3) firstErr.push(i + ':card'); }
        const goals = SG.sanitizeGoals(c.goals);
        if (goals.some((g) => !['short', 'medium', 'long'].includes(g.type))) badShape++;
        if (c.strongholds !== undefined) {
          const shs = SG.sanitizeStrongholds(Array.isArray(c.strongholds) ? c.strongholds : c.strongholds, DATA);
          if (shs.length !== DATA.STRONGHOLDS.length) { badShape++; if (firstErr.length < 3) firstErr.push(i + ':sh len ' + shs.length); }
          if (shs.some((s) => !/^(ok|worn|ruin)$/.test(s.corruption.stage))) badShape++;
        }
        const army = SG.sanitizeArmy(c.army);
        if (Object.keys(army.units).length !== 7 || army.week < 0 || army.week > 520) badShape++;
        const siege = SG.sanitizeSiege(c.siege);
        if (siege.week < 1 || siege.week > 520) { badShape++; if (firstErr.length < 3) firstErr.push(i + ':siege ' + siege.week); }
        const pool = SG.sanitizeHirePool(c.hirePool);
        if (Object.keys(pool).length !== 7) badShape++;
        const season = SG.sanitizeSeason(c.season, '2026-09-15');
        if (!(season.num >= 1) || !/^\d{4}-\d{2}-\d{2}$/.test(season.start)) badShape++;
        SG.sanitizeXpHistory(c.xpHistory);
        SG.sanitizeInventory(c.inventory, { qa1: { id: 'qa1', slot: 'ring1', name: 'x' } }, c.inventory && c.inventory.maxSlots);
        SG.sanitizeCounter(c.hero && c.hero.gold, 1);
      } catch (e) { throws++; if (firstErr.length < 3) firstErr.push(i + ':THROW ' + e.message.slice(0, 80)); }
    }
    if (throws > 0) throw new Error('санитайзеры бросили исключений: ' + throws + ' :: ' + firstErr.join(' | '));
    if (badShape > 0) throw new Error('выход санитайзеров вне инвариантов: ' + badShape + ' :: ' + firstErr.join(' | '));
    fs.writeFileSync(OUT + '/fuzz-sanitizers-100.json', JSON.stringify({ seed: 20260915, iterations: 100, throws, badShape }, null, 2));
  });

  await step('A2 [node] миграция v7 → v9: regions→captured (порядок каталога), золото/карточки/задачи целы, army/siege созданы, season посеян (MIGRATIONS[7] для входа v7 не вызывается — он для v≤6)', async () => {
    const d = {
      v: 7, savedAt: 1726000000000,
      hero: { name: 'Мигрант', level: 12, gold: 4321, xp: 100, xpToNext: 200, totalXp: 3000, lastSessionAt: 1726000000000, dailyUniqueStats: {}, cardHistory: {} },
      stats: {},
      forged: [{ id: 1, name: 'Зарядка', meta: '⚔ 15 мин · день', rank: 'B', streak: 4, stat: 'str', progress: 10, mastery: 2, masteryThreshold: 7 }],
      goals: [], inventory: { backpack: [], equipped: {} },
      escapeProgress: 42,
      lastDayReset: '2026-09-12', forgedIdCounter: 2, uidCounter: 10, goalIdCounter: 1,
      xpHistory: [], bloodOath: null, lastWeekReset: '2026-09-07',
      tasks: [{ id: 1, name: 'Тест-задача', tier: 'normal', deadline: null, status: 'active', createdAt: 1, doneAt: null, ghostSince: null }],
      taskIdCounter: 2, tractState: { regions: 7, building: null },
    };
    IV.migrateSyncData(d);
    if (d.v !== 9) throw new Error('v: ' + d.v);
    if (!Array.isArray(d.strongholds) || d.strongholds.length !== 20) throw new Error('strongholds: ' + (d.strongholds || []).length);
    const cap = d.strongholds.filter((s) => s.captured).length;
    if (cap !== 7) throw new Error('captured: ' + cap);
    d.strongholds.forEach((s, i) => { if (s.id !== DATA.STRONGHOLDS[i].id) throw new Error('id[' + i + ']: ' + s.id + ' ≠ ' + DATA.STRONGHOLDS[i].id); });
    if (d.hero.gold !== 4321) throw new Error('золото мигранта: ' + d.hero.gold);
    if (d.tasks.length !== 1 || d.tasks[0].name !== 'Тест-задача') throw new Error('задачи потеряны');
    if (!d.army || d.army.units.t1 !== 0) throw new Error('army не создан');
    if (!d.siege || d.siege.week !== 1) throw new Error('siege не создан');
    if (!d.season || d.season.num !== 1) throw new Error('season не посеян (MIGRATIONS[9]): ' + JSON.stringify(d.season));
    if (d.season.snapshot.captured !== 7 || d.season.snapshot.gold !== 4321) throw new Error('снапшот сезона: ' + JSON.stringify(d.season.snapshot));
    fs.writeFileSync(OUT + '/fixture-v7-migrated.json', JSON.stringify(d, null, 2));
  });

  await step('A2b [node] миграция v5 (+мусорные поля v≤6: shards/flasks/hp/isHollow/boss*) → v9: MIGRATIONS[7] вычищает легаси, tractState отсутствует → regions 0', async () => {
    const d = {
      v: 5, savedAt: 1726000000000,
      hero: { name: 'Легаси', level: 9, gold: 250, xp: 10, xpToNext: 100, totalXp: 900, shards: 12, flasks: 3, hp: 100, maxHp: 100, isHollow: true, actionPoints: 3, estus: 5, dailyUniqueStats: {}, cardHistory: {} },
      stats: {},
      forged: [{ id: 1, name: 'Древняя карточка', rank: 'C', stat: 'end', mastery: 0, masteryThreshold: 5 }],
      goals: [], inventory: { backpack: [], equipped: {} },
      bossHp: 999, bossStage: 2, bossDefeated: false, bossRunLocked: true, bossKills: {}, bossRagePoints: 5,
      lastDayReset: '2026-09-12', forgedIdCounter: 2, uidCounter: 10, goalIdCounter: 1,
      xpHistory: [], bloodOath: null, lastWeekReset: '2026-09-07',
      tasks: [], taskIdCounter: 1,
    };
    IV.migrateSyncData(d);
    if (d.v !== 9) throw new Error('v: ' + d.v);
    const h = d.hero;
    if (h.shards !== undefined || h.flasks !== undefined || h.hp !== undefined || h.isHollow !== undefined || h.estus !== undefined) throw new Error('легаси-мусор в hero остался: ' + JSON.stringify(h));
    if (d.bossHp !== undefined || d.bossKills !== undefined || d.bossRagePoints !== undefined) throw new Error('легаси-мусор верхнего уровня остался');
    if (h.gold !== 250) throw new Error('золото изменилось: ' + h.gold);
    if (d.tractState && d.tractState.regions !== 0) throw new Error('regions: ' + d.tractState.regions);
    const cap = d.strongholds.filter((s) => s.captured).length;
    if (cap !== 0) throw new Error('без tractState все твердыни нейтральны, а захвачено: ' + cap);
    if (!d.season || d.season.num !== 1) throw new Error('season не посеян');
    fs.writeFileSync(OUT + '/fixture-v5-migrated.json', JSON.stringify(d, null, 2));
  });

  await step('A3 [node] миграция v8 (без season) → v9: Сезон 1 со снапшотом текущего прогресса', async () => {
    const strongholds = [];
    for (let i = 0; i < 20; i++) strongholds.push({ id: 'sh' + String(i + 1).padStart(2, '0'), captured: i < 3, garrison: i === 1 ? [{ tier: 't2', count: 4 }] : [], buildings: i === 0 ? { zh1: { built: true, builtAt: 1726000000000, corruptionStage: 'ok', debtDays: 0 } } : {}, corruption: { stage: 'ok', debtDays: 0 } });
    const d = {
      v: 8, hero: { name: 'QA', level: 7, xp: 10, xpToNext: 200, totalXp: 7000, gold: 1234 },
      stats: {}, forged: [{ id: 1, name: 'Карта', rank: 'C', stat: 'int', mastery: 0, masteryThreshold: 5, totalCompletions: 9 }],
      forgedIdCounter: 2, goals: [], inventory: { backpack: [], equipped: {} },
      tasks: [], taskIdCounter: 1, tractState: { regions: 3, building: null },
      xpHistory: [], bloodOath: null, lastDayReset: null, lastWeekReset: '2000-01-03', savedAt: Date.now(),
      strongholds, army: { units: { t1: 2, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 1 },
      siege: { week: 2, lastResult: null },
    };
    IV.migrateSyncData(d);
    if (d.v !== 9) throw new Error('v: ' + d.v);
    if (!d.season || d.season.num !== 1) throw new Error('season: ' + JSON.stringify(d.season));
    const sn = d.season.snapshot;
    const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
    if (d.season.start !== today) throw new Error('start: ' + d.season.start + ' ≠ сегодня ' + today);
    if (sn.totalXp !== 7000 || sn.gold !== 1234 || sn.captured !== 3 || sn.completions !== 9 || sn.level !== 7) throw new Error('снапшот: ' + JSON.stringify(sn));
    fs.writeFileSync(OUT + '/fixture-v8-migrated.json', JSON.stringify(d, null, 2));
  });
}

// ============================================================
// БЛОК B. Браузер (порт 8820, один браузер)
// ============================================================
(async () => {
  await nodePhase();

  let srv, b, pg;
  try {
    srv = await startServer(0);
  } catch (e) {
    console.log('SKIP-infra: http-сервер :8820 не поднялся после 1 повтора :: ' + e.message);
    results.push(['SKIP', 'SKIP-infra: браузерная фаза (сервер :8820 недоступен)', e.message.split('\n')[0].slice(0, 200)]);
    await report();
    process.exit(3);
  }
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    pg = await ctx.newPage(); // общий контекст: вкладки (B12) должны видеть общий localStorage
    pg._ctx = ctx;
  } catch (e) {
    console.log('SKIP-infra: chromium не запустился после 1 попытки :: ' + e.message);
    results.push(['SKIP', 'SKIP-infra: браузерная фаза (chromium)', e.message.split('\n')[0].slice(0, 200)]);
    try { await b.close(); } catch (x) {} srv.close();
    await report();
    process.exit(3);
  }
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errors.push('CONSOLE: ' + m.text()); });
  await pg.route('**/*', (r) => { r.request().url().includes('localhost') ? r.continue() : r.abort(); });

  const ev = (fn, arg) => pg.evaluate(fn, arg);

  async function dismissOverlays() {
    await ev(() => {
      const c = document.getElementById('confirmOverlay');
      if (c && c.classList.contains('show')) { const n = document.getElementById('confirmNo'); if (n) n.click(); }
    }).catch(() => {});
  }
  async function reloadApp() {
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1500);
    await dismissOverlays();
  }
  const stable = (o) => Array.isArray(o) ? o.map(stable) : (o && typeof o === 'object' ? Object.keys(o).sort().reduce((a, k) => { a[k] = stable(o[k]); return a; }, {}) : o);
  // нормализация как acceptance 10.2: builtAt:null → отсутствует (санитайзер пишет null, прод-код — undefined)
  const norm = (s) => { const o = JSON.parse(JSON.stringify(s)); (o.strongholds || []).forEach((sh) => { Object.values(sh.buildings || {}).forEach((bb) => { if (bb && bb.builtAt === null) delete bb.builtAt; }); }); return o; };
  const grabKeys = () => ev(() => ({
    gold: HERO.gold,
    strongholds: JSON.parse(JSON.stringify(strongholds)),
    army: JSON.parse(JSON.stringify(army)),
    siege: JSON.parse(JSON.stringify(siege)),
    tasks: JSON.parse(JSON.stringify(TASKS)),
    quests: JSON.parse(JSON.stringify(dailyQuests)),
    season: JSON.parse(JSON.stringify(season)),
    hirePool: JSON.parse(JSON.stringify(hirePool)),
  }));
  const grabStr = async () => JSON.stringify(stable(norm(await grabKeys())));
  function diffPos(a, b2) { let i = 0; while (i < a.length && a[i] === b2[i]) i++; return i; }

  // Богатое детерминированное состояние через прод-глобалы (форма — как у санитайзеров, чтобы F5-срез совпадал).
  async function richState(gold) {
    await ev((g) => {
      HERO.gold = (g === undefined ? 777 : g);
      FORGED.length = 0;
      [{ name: 'Карта Альфа', rank: 'C', stat: 'str', streak: 2 }, { name: 'Карта Бета', rank: 'B', stat: 'wil', streak: 5 }, { name: 'Карта Гамма', rank: 'CCC', stat: 'int', streak: 0 }].forEach((c, i) => {
        FORGED.push(STATE_GUARDS.sanitizeCard(Object.assign({ id: i + 1, meta: '⚔ 15 мин · день', mastery: 1, masteryThreshold: 7, totalCompletions: 3 + i }, c), i + 1));
      });
      forgedIdCounter = 10;
      strongholds.forEach((s) => { s.captured = false; s.garrison = []; s.buildings = {}; });
      strongholds[0].captured = true;
      strongholds[1].captured = true;
      strongholds[1].buildings.zh1 = { built: true, builtAt: Date.now() - 5000, corruptionStage: 'worn', debtDays: 3 };
      strongholds[1].garrison = [{ tier: 't1', count: 5 }];
      army.units.t1 = 8; army.week = 2;
      siege.week = 3; siege.lastResult = null; siege.assaultDay = null; siege.wkSkips = 0; siege.wkTaskFails = 1;
      hirePool = { t1: 14, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 };
      TASKS = [
        { id: 1, name: 'QA задача', tier: 'normal', deadline: Date.now() + 86400000, status: 'active', createdAt: Date.now(), doneAt: null, ghostSince: null },
        { id: 2, name: 'QA призрак', tier: 'light', deadline: Date.now() - 86400000, status: 'ghost', createdAt: Date.now() - 2 * 86400000, doneAt: null, ghostSince: Date.now() - 86400000 },
      ];
      taskIdCounter = 3;
      season = { num: 2, start: getMSKDayKey(), snapshot: { totalXp: 500, gold: 400, captured: 2, completions: 7, level: 4 } };
      dailyQuests = { day: getMSKDayKey(), done: { q1: true }, progress: { q1: 2 }, quests: [{ id: 'q1', name: 'QA квест' }] };
      lastDayReset = getMSKDayKey();
      lastWeekReset = getThisMondayKey();
      saveGameState();
    }, gold);
    await pg.waitForTimeout(200);
  }

  // ---------- B0. Старт: онбординг нового игрока ----------
  await step('B1 онбординг: старт-колода принимается (2 карточки), онбординг закрывается — база для слоёв защиты', async () => {
    await pg.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1500);
    await pg.waitForSelector('#starterDeckModal.show', { timeout: 6000 });
    const boxes = pg.locator('#starterDeckList input[type="checkbox"]');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await boxes.nth(i).uncheck();
    await boxes.nth(0).check(); await boxes.nth(1).check();
    await pg.locator('[data-action="accept-starter-deck"]').click();
    await pg.waitForTimeout(400);
    if (await pg.locator('#starterDeckModal.show').isVisible().catch(() => false)) throw new Error('модалка старт-колоды не закрылась');
    for (let i = 0; i < 14; i++) {
      if (await ev(() => !document.querySelector('.onboarding-overlay'))) break;
      await ev(() => { const btn = document.querySelector('.onboarding-overlay button'); if (btn) btn.click(); });
      await pg.waitForTimeout(150);
    }
    if (await pg.locator('.onboarding-overlay.show').isVisible().catch(() => false)) throw new Error('онбординг не закрылся');
  });

  await step('B2 обогащение состояния v9: золото 777, 3 карточки, 2 твердыни (zh1 worn, builtAt), гарнизон, осада w3, задачи+призрак, квесты с progress, Сезон 2 — saveGameState OK', async () => {
    await richState(777);
    const st = await ev(() => ({
      saved: !!localStorage.getItem('neurodeck_full_save'),
      v: JSON.parse(localStorage.getItem('neurodeck_full_save') || '{}').v,
      gold: HERO.gold, cards: FORGED.length, cap: strongholds.filter((s) => s.captured).length,
      season: season.num, quests: dailyQuests && dailyQuests.progress.q1,
    }));
    if (!st.saved || st.v !== 9) throw new Error('сейв v9 не записан: ' + JSON.stringify(st));
    if (st.gold !== 777 || st.cards !== 3 || st.cap !== 2 || st.season !== 2 || st.quests !== 2) throw new Error('состояние: ' + JSON.stringify(st));
  });

  // ---------- Шаг 1. Round-trip v9 байт-в-контент ----------
  await step('B3 [шаг1] F5 round-trip v9 байт-в-контент: gold/strongholds/army/siege/tasks/quests(progress)/season/hirePool — stable stringify идентичен (норма builtAt null→undefined)', async () => {
    await ev(() => saveGameState());
    const before = await grabStr();
    await reloadApp();
    const after = await grabStr();
    if (before !== after) {
      const d = diffPos(before, after);
      throw new Error('состояние разошлось на позиции ' + d + ': …' + before.slice(Math.max(0, d - 60), d + 60) + ' || …' + after.slice(Math.max(0, d - 60), d + 60));
    }
    await shot(pg, 'b3_roundtrip');
  });

  // ---------- Шаг 2а. Миграция v7 (+мусор) в браузере ----------
  await step('B4 [шаг2а] v7-фикстура с мусором (shards/boss*/isHollow) → applySyncData: v9, 7 захватов, мусор вычищен, золото 4321, задачи целы, Сезон 1 посеян', async () => {
    await ev(() => {
      const v7 = {
        v: 7, savedAt: 1726000000000,
        hero: { name: 'Мигрант', level: 5, xp: 10, xpToNext: 200, totalXp: 610, gold: 555, shards: 12, hp: 100, maxHp: 100, isHollow: true, estus: 5, dailyUniqueStats: {}, cardHistory: {} },
        stats: {}, forged: [{ id: 1, name: 'Старая карточка', rank: 'B', stat: 'wil', mastery: 2, masteryThreshold: 5 }],
        forgedIdCounter: 2, goals: [], inventory: { backpack: [], equipped: {} },
        tasks: [{ id: 1, name: 'Задача v7', tier: 'normal', deadline: Date.now() + 86400000, status: 'active', createdAt: Date.now(), doneAt: null, ghostSince: null }],
        taskIdCounter: 2, tractState: { regions: 7, building: null },
        bossHp: 999, bossStage: 2, bossKills: {}, junkUnknown: [1, 2],
        lastDayReset: getMSKDayKey(), lastWeekReset: getThisMondayKey(), xpHistory: [], bloodOath: null, savedAt: Date.now(),
      };
      applySyncData(v7, true);
      saveGameState();
    });
    await pg.waitForTimeout(200);
    const st = await ev(() => {
      const saved = JSON.parse(localStorage.getItem('neurodeck_full_save'));
      return {
        v: saved.v, cap: strongholds.filter((s) => s.captured).length, gold: HERO.gold,
        shards: HERO.shards, hollow: HERO.isHollow, boss: saved.bossHp,
        tasks: TASKS.length, taskName: TASKS[0] && TASKS[0].name, season: season.num, snap: season.snapshot,
        savedNoShards: !JSON.stringify(saved).includes('"shards"'),
      };
    });
    if (st.v !== 9) throw new Error('schemaVersion: ' + st.v);
    if (st.cap !== 7) throw new Error('захвачено: ' + st.cap);
    if (st.gold !== 555) throw new Error('золото: ' + st.gold);
    if (st.shards !== undefined || st.hollow !== undefined || st.boss !== undefined) throw new Error('мусор остался: ' + JSON.stringify(st));
    if (st.tasks !== 1 || st.taskName !== 'Задача v7') throw new Error('задачи: ' + st.tasks + '/' + st.taskName);
    if (st.season !== 1 || st.snap.captured !== 7 || st.snap.gold !== 555) throw new Error('сезон v9-миграции: ' + JSON.stringify(st.snap));
    if (!st.savedNoShards) throw new Error('shards протекли в сейв');
  });

  // ---------- Шаг 2б. Миграция v8 без season → Сезон 1 ----------
  await step('B5 [шаг2б] v8-фикстура без season → v9: сеется Сезон 1 (start=сегодня MSK) со снапшотом {totalXp 7000, gold 1234, captured 3, completions 9, level 7}', async () => {
    await ev(() => {
      const strongholdsArr = [];
      for (let i = 0; i < 20; i++) strongholdsArr.push({ id: 'sh' + String(i + 1).padStart(2, '0'), captured: i < 3, garrison: [], buildings: {}, corruption: { stage: 'ok', debtDays: 0 } });
      applySyncData({
        v: 8,
        hero: { name: 'QA', level: 7, xp: 10, xpToNext: 200, totalXp: 7000, gold: 1234, dailyUniqueStats: {}, cardHistory: {} },
        stats: {}, forged: [{ id: 1, name: 'Карта', rank: 'C', stat: 'int', mastery: 0, masteryThreshold: 5, totalCompletions: 9 }],
        forgedIdCounter: 2, goals: [], inventory: { backpack: [], equipped: {} },
        tasks: [], taskIdCounter: 1, tractState: { regions: 3, building: null },
        xpHistory: [], bloodOath: null, lastDayReset: getMSKDayKey(), lastWeekReset: getThisMondayKey(), savedAt: Date.now(),
        strongholds: strongholdsArr,
        army: { units: { t1: 2, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }, week: 1 },
        siege: { week: 2, lastResult: null },
      }, true);
    });
    await pg.waitForTimeout(200);
    const st = await ev(() => ({ season: season, today: getMSKDayKey(), v: JSON.parse(localStorage.getItem('neurodeck_full_save')).v }));
    const s = st.season;
    if (!s || s.num !== 1) throw new Error('season: ' + JSON.stringify(s));
    if (s.start !== st.today) throw new Error('start: ' + s.start + ' ≠ сегодня ' + st.today);
    const sn = s.snapshot;
    if (sn.totalXp !== 7000 || sn.gold !== 1234 || sn.captured !== 3 || sn.completions !== 9 || sn.level !== 7) throw new Error('снапшот: ' + JSON.stringify(sn));
    await richState(777); // восстанавливаем богатое состояние для следующих шагов
  });

  // ---------- Шаг 2в. Битые JSON ×20 ----------
  await step('B6 [шаг2в] битые JSON ×20 (детерминированные мутации валидного сейва) → applySyncData: приложение не падает, санитайзеры держат инварианты', async () => {
    const variants = [];
    for (let i = 0; i < 20; i++) variants.push({ i, mut: `
      const st = JSON.parse(window.__qaValidSave);
      const rnd = mulberry32(${1000 + i});
      const paths = [
        (o) => { o.hero = null }, (o) => { o.hero.gold = '999999999999' }, (o) => { delete o.hero },
        (o) => { o.forged = { bad: 1 } }, (o) => { o.forged[0].rank = 'Z'; o.forged[0].mastery = 1e9 },
        (o) => { o.forged[0] = null }, (o) => { o.stats = { str: { value: -50, max: -5 } } },
        (o) => { o.strongholds = 'junk' }, (o) => { o.strongholds[3].garrison = [{ tier: 't99', count: -5 }, { tier: 't1', count: 'abc' }] },
        (o) => { o.strongholds[4].buildings.zh1 = { built: true, builtAt: -3, corruptionStage: 'money', debtDays: 99999 } },
        (o) => { o.army = [1,2,3] }, (o) => { o.army.units.t1 = -100; o.army.week = 9999 },
        (o) => { o.siege = null }, (o) => { o.siege.week = -50; o.siege.assaultDay = 42; o.siege.lastResult = [] },
        (o) => { o.season = 'x' }, (o) => { o.season.num = 0; o.season.start = null; o.season.snapshot = [] },
        (o) => { o.tasks = [{ id: -5, name: '', tier: 'x', status: 'y' }, null] }, (o) => { delete o.tasks },
        (o) => { o.hirePool = 'junk' }, (o) => { o.xpHistory = [{ date: null, xp: -5 }, 'x'] },
      ];
      paths[Math.floor(rnd()*paths.length)](st);
      if (rnd() < 0.5) { st.savedAt = 'not-a-number'; }
      return JSON.stringify(st);
    ` });
    await ev(() => {
      window.mulberry32 = function (seed) {
        let a = seed >>> 0;
        return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      };
      saveGameState();
      window.__qaValidSave = localStorage.getItem('neurodeck_full_save');
    });
    const errsBefore = errors.length;
    for (const v of variants) {
      const json = await ev(new Function(v.mut)); // БЕЗ 'return '+... : mut начинается с \n — ASI превратил бы 'return \n' в return undefined
      if (typeof json !== 'string') throw new Error('вариант ' + v.i + ': мутатор вернул ' + typeof json);
      await ev((j) => { applySyncData(JSON.parse(j), true); }, json);
      const ok = await ev(() => {
        const RANKS = STATE_GUARDS.RANK_PROGRESSION;
        const shIds = new Set(strongholds.map((s) => s.id));
        const goldOk = typeof HERO.gold === 'number' && Number.isFinite(HERO.gold) && HERO.gold >= 0 && HERO.gold <= 1e9;
        const lvlOk = HERO.level >= 1 && HERO.level <= 99;
        const shOk = strongholds.length === 20 && strongholds.every((s) => typeof s.id === 'string' && s.corruption && ['ok', 'worn', 'ruin'].includes(s.corruption.stage) && Array.isArray(s.garrison) && s.garrison.every((u) => /^t[1-7]$/.test(u.tier) && u.count >= 0));
        const armyOk = army && army.units && ['t1','t2','t3','t4','t5','t6','t7'].every((t) => typeof army.units[t] === 'number' && army.units[t] >= 0);
        const siegeOk = siege && siege.week >= 1 && siege.week <= 520;
        const cardsOk = FORGED.every((c) => RANKS.includes(c.rank) && c.mastery <= c.masteryThreshold && ['str','end','int','cha','wil','agi'].includes(c.stat));
        const seasonOk = season && season.num >= 1 && season.snapshot && typeof season.snapshot.gold === 'number';
        return { goldOk, lvlOk, shOk, armyOk, siegeOk, cardsOk, seasonOk, uniq: shIds.size };
      });
      const bad = Object.entries(ok).filter(([k, val]) => k !== 'uniq' && !val);
      if (bad.length) throw new Error('вариант ' + v.i + ': инварианты нарушены: ' + bad.map((x) => x[0]).join(',') + ' :: ' + json.slice(0, 140));
      if (ok.uniq !== 20) throw new Error('вариант ' + v.i + ': id твердынь неуникальны/не 20: ' + ok.uniq);
    }
    if (errors.length > errsBefore) throw new Error('консоль/JS-ошибки во время фаззинга: ' + errors.slice(errsBefore).join(' | ').slice(0, 200));
    fs.writeFileSync(OUT + '/broken-json-20-applied.json', JSON.stringify({ count: variants.length, errors: 0 }, null, 2));
    await richState(777);
  });

  // ---------- Шаг 2г. Битый сейв через полный reload ×3 ----------
  await step('B7 [шаг2г] битый сейв в localStorage через полный F5 ×3 (обрезка/порча символов/v:999): приложение не падает, UI рендерится', async () => {
    await ev(() => saveGameState());
    const valid = await ev(() => localStorage.getItem('neurodeck_full_save'));
    const kinds = [
      ['truncate', valid.slice(0, Math.floor(valid.length * 0.6))],
      ['chars', (() => { let s = valid.split(''); for (let k = 0; k < 40; k++) s[Math.floor((valid.length / 40) * k)] = 'x'; return s.join(''); })()],
      ['futurev', valid.replace('"v":9', '"v":999')],
    ];
    for (const [kind, broken] of kinds) {
      const errsBefore = errors.length;
      await ev((j) => {
        localStorage.setItem('neurodeck_full_save', j);
        localStorage.setItem('neurodeck_backup', j);
        localStorage.setItem('neurodeck_cards_backup', j);
      }, broken);
      await reloadApp();
      await pg.waitForTimeout(800);
      const st = await ev(() => ({
        header: (document.getElementById('progressVal') || {}).textContent || '',
        gold: typeof HERO.gold === 'number' && Number.isFinite(HERO.gold) && HERO.gold >= 0,
        modalStuck: !!(document.getElementById('confirmOverlay') || {}).classList || false,
      }));
      if (!st.header || !/^\d+\/20$/.test(st.header)) throw new Error(kind + ': прогресс-хедер не отрендерился: "' + st.header + '"');
      if (!st.gold) throw new Error(kind + ': золото вне инварианта');
      if (errors.length > errsBefore) throw new Error(kind + ': JS-ошибки: ' + errors.slice(errsBefore).join(' | ').slice(0, 200));
      await shot(pg, 'b7_broken_' + kind);
    }
  });

  // ---------- Шаг 3. 5 слоёв защиты ----------
  await step('B8 [шаг3, слой 1] удалён neurodeck_full_save при живом cards_backup → после F5 карточки и прогресс восстановлены из аварийной копии', async () => {
    await richState(777);
    await ev(() => {
      localStorage.removeItem('neurodeck_full_save');
      localStorage.removeItem('neurodeck_backup');
      if (!localStorage.getItem('neurodeck_cards_backup')) throw new Error('тест-раскладка: cards_backup отсутствует');
    });
    await reloadApp();
    await pg.waitForTimeout(500);
    const st = await ev(() => ({
      cards: FORGED.length, gold: HERO.gold,
      savedV: (JSON.parse(localStorage.getItem('neurodeck_full_save') || '{}').v) || null,
      cap: strongholds.filter((s) => s.captured).length, season: season.num,
    }));
    if (st.cards !== 3) throw new Error('карточки не восстановлены: ' + st.cards);
    if (st.gold !== 777 || st.cap !== 2 || st.season !== 2) throw new Error('восстановлено неполно: ' + JSON.stringify(st));
    if (st.savedV !== null && st.savedV !== 9) throw new Error('сейв после восстановления не v9: ' + st.savedV);
    await shot(pg, 'b8_cards_backup_restore');
  });

  await step('B9 [шаг3, слой 2] FORGED пуст + ever_saved=1 → онбординг не заблокирован: старт-колода не навязывается, UI жив, ошибок нет', async () => {
    const errsBefore = errors.length;
    await ev(() => {
      localStorage.removeItem('neurodeck_full_save');
      localStorage.removeItem('neurodeck_backup');
      localStorage.removeItem('neurodeck_cards_backup');
      localStorage.setItem('neurodeck_ever_saved', '1');
    });
    await reloadApp();
    await pg.waitForTimeout(2200); // deepRecovery срабатывает через 1с
    await dismissOverlays();
    const st = await ev(() => ({
      starter: (document.getElementById('starterDeckModal') || {}).classList.contains('show'),
      onboard: !!document.querySelector('.onboarding-overlay'),
      header: (document.getElementById('progressVal') || {}).textContent || '',
      cards: FORGED.length, gold: HERO.gold,
      interactive: !!document.querySelector('.bnav-btn'),
    }));
    if (st.starter) throw new Error('старт-колода показана при ever_saved (должна быть только на чистом онбординге)');
    if (st.onboard) throw new Error('онбординг-оверлей застрял');
    if (!/^\d+\/20$/.test(st.header)) throw new Error('дашборд не жив: ' + st.header);
    if (!st.interactive) throw new Error('навигация недоступна');
    if (errors.length > errsBefore) throw new Error('JS-ошибки: ' + errors.slice(errsBefore).join(' | ').slice(0, 200));
    await shot(pg, 'b9_eversaved_noblock');
  });

  // ---------- Шаг 4. Экспорт/импорт JSON ----------
  await step('B10 [шаг4] export-json → скачивание контента → импорт через file input (syncModal) → экспортированное подмножество восстановлено (gold 777, 3 карточки, цели)', async () => {
    await richState(777);
    await ev(() => { GOALS.push({ id: 1, type: 'short', name: 'QA-цель', description: '', deadline: new Date(Date.now() + 86400000).toISOString(), steps: [{ text: 'шаг 1', done: false }], stat: 'str', failed: false, completedAt: null }); goalIdCounter = 2; });
    const dlP = pg.waitForEvent('download', { timeout: 10000 });
    await ev(() => exportJson());
    const dl = await dlP;
    const expPath = OUT + '/export.json';
    await dl.saveAs(expPath);
    const exported = JSON.parse(fs.readFileSync(expPath, 'utf8'));
    if (!exported.hero || exported.hero.gold !== 777 || !Array.isArray(exported.forged)) throw new Error('в экспорте нет hero/forged');
    // ломаем состояние и импортируем файл обратно через прод-путь (file input в syncModal)
    await ev(() => { HERO.gold = 1; FORGED.length = 0; GOALS.length = 0; });
    await ev(() => openSyncModal());
    await pg.setInputFiles('#syncFileInput', { name: 'export.json', mimeType: 'application/json', buffer: fs.readFileSync(expPath) });
    await pg.waitForSelector('#confirmOverlay.show', { timeout: 5000 });
    await pg.locator('#confirmYes').click();
    await pg.waitForTimeout(600);
    const st = await ev(() => ({
      gold: HERO.gold, cards: FORGED.length, goals: GOALS.length,
      xpHist: Array.isArray(xpHistory),
      capAfter: strongholds.filter((s) => s.captured).length,
      seasonAfter: season && season.num,
    }));
    if (st.gold !== 777) throw new Error('золото не восстановлено: ' + st.gold);
    if (st.cards !== 3) throw new Error('карточки не восстановлены: ' + st.cards);
    if (st.goals !== 1) throw new Error('цели не восстановлены: ' + st.goals);
    // Фиксация НАХОДКИ (не гейт): export-json не содержит strongholds/army/siege/season/tasks,
    // а импорт через applySyncData прогоняет файл через миграцию v4→v8 и пересоздаёт пустые твердыни.
    if (st.capAfter !== 2 || st.seasonAfter !== 2) {
      findings.push({ sev: 'P2', text: 'export-json (' + path.basename(expPath) + ') экспортирует только hero/stats/forged/goals/inventory/xpHistory; импорт такого файла через syncModal сбрасывает твердыни (' + st.capAfter + '/2), армию, осаду и сезон (' + st.seasonAfter + ') — данные LIVE-прогресса теряются при «официальном» экспортно-импортном цикле. Полный бэкап — только «💾 Скачать» (.ndsync, download-sync-file).', evidence: 'B10: captured до=2 после=' + st.capAfter + ', season до=2 после=' + st.seasonAfter });
    }
    await shot(pg, 'b10_export_import');
  });

  await step('B11 [шаг4б] полный бэкап .ndsync (download-sync-file) → импорт через file input: байт-в-контент восстановление ВСЕГО состояния (твердыни, сезон, квесты, builtAt)', async () => {
    await richState(555);
    await ev(() => saveGameState());
    const before = await grabStr();
    const dlP = pg.waitForEvent('download', { timeout: 10000 });
    await ev(() => downloadSyncFile());
    const dl = await dlP;
    const bakPath = OUT + '/backup.ndsync';
    await dl.saveAs(bakPath);
    // портим состояние
    await ev(() => { HERO.gold = 111; strongholds[0].captured = false; strongholds[1].buildings = {}; season.num = 7; TASKS = []; hirePool.t1 = 0; });
    await ev(() => openSyncModal());
    await pg.setInputFiles('#syncFileInput', { name: 'backup.ndsync', mimeType: 'application/json', buffer: fs.readFileSync(bakPath) });
    await pg.waitForSelector('#confirmOverlay.show', { timeout: 5000 });
    await pg.locator('#confirmYes').click();
    await pg.waitForTimeout(600);
    const after = await grabStr();
    if (before !== after) {
      const d = diffPos(before, after);
      throw new Error('бэкап-restore разошёлся на позиции ' + d + ': …' + before.slice(Math.max(0, d - 60), d + 60) + ' || …' + after.slice(Math.max(0, d - 60), d + 60));
    }
    await shot(pg, 'b11_ndsync_roundtrip');
  });

  // ---------- Шаг 5. Две вкладки (last-write-wins) ----------
  await step('B12 [шаг5] мульти-вкладка: свежая вкладка видит запись A; живая вкладка B адоптирует её через storage-event; LWW-гвард не даёт устаревшему сейву B затереть запись A', async () => {
    await richState(1000);
    const openTab = async () => {
      const p = await pg._ctx.newPage();
      p.on('pageerror', (e) => errors.push('PAGEERROR(tab): ' + e.message));
      await p.route('**/*', (r) => { r.request().url().includes('localhost') ? r.continue() : r.abort(); });
      await p.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1200);
      return p;
    };
    await ev(() => { HERO.gold = 3210; saveGameState(); });
    const freshB = await openTab();
    const gB = await freshB.evaluate(() => HERO.gold);
    if (gB !== 3210) throw new Error('свежая вкладка B не увидила запись A: ' + gB);
    // живой синк: A пишет 777 при открытой B → storage-event → B адоптирует без перезагрузки
    await ev(() => { HERO.gold = 777; saveGameState(); });
    await freshB.waitForTimeout(1000);
    const gBsync = await freshB.evaluate(() => HERO.gold);
    if (gBsync !== 777) throw new Error('живой синк: вкладка B не адоптировала 777, у неё ' + gBsync);
    // LWW-гвард: устаревшее сохранение B не затирает 777 — B адоптирует чужое состояние и сохраняет его же
    await freshB.evaluate(() => saveGameState());
    const gGuard = await ev(() => (JSON.parse(localStorage.getItem('neurodeck_full_save') || '{}').hero || {}).gold);
    if (gGuard !== 777) throw new Error('LWW-гвард: устаревшее сохранение B затёрло запись A: ' + gGuard);
    // честная запись из B (новое действие пользователя) → A видит через живой синк
    await freshB.evaluate(() => { HERO.gold = 65; saveGameState(); });
    await pg.waitForTimeout(1000);
    const gA = await ev(() => HERO.gold);
    if (gA !== 65) throw new Error('A не увидила запись B (живой синк): ' + gA);
    await freshB.close();
    await shot(pg, 'b12_two_tabs_lww');
  });

  // ---------- Шаг 6. Квота ----------
  await step('B13 [шаг6] квота: localStorage забит до отказа → saveGameState не роняет приложение; после очистки сохранение снова работает', async () => {
    await richState(900);
    const fill = await ev(() => {
      let i = 0;
      try { for (; i < 40; i++) localStorage.setItem('qa_fill_' + i, 'x'.repeat(1024 * 1024)); } catch (e) { return { filled: i, err: String(e && e.message || e).slice(0, 80) }; }
      return { filled: i, err: 'не переполнилось' };
    });
    if (fill.filled === 40) throw new Error('квоту не удалось переполнить (40×1МБ влез?)');
    const errsBefore = errors.length;
    await ev(() => { HERO.gold = 4242; saveGameState(); }); // не должно выбросить исключение наружу
    await pg.waitForTimeout(300);
    const st = await ev(() => ({
      goldLive: HERO.gold,
      savedKeep: (() => { try { return (JSON.parse(localStorage.getItem('neurodeck_full_save') || '{}').hero || {}).gold; } catch (e) { return null; } })(),
      toast: (typeof toastQueue !== 'undefined') ? toastQueue.some((t) => /сохранени|переполн/i.test((t.title || '') + (t.body || ''))) : null,
      alive: !!document.getElementById('progressVal'),
    }));
    if (!st.alive) throw new Error('приложение не пережило переполнение квоты');
    if (st.goldLive !== 4242) throw new Error('in-memory состояние потеряно: ' + st.goldLive);
    // старый сейв не должен быть уничтожен неудачной записью
    if (st.savedKeep !== 900 && st.savedKeep !== 4242 && st.savedKeep !== undefined) throw new Error('сейв повреждён переполнением: ' + st.savedKeep);
    // очистка → сохранение снова работает
    await ev(() => { for (let i = 0; i < 40; i++) localStorage.removeItem('qa_fill_' + i); HERO.gold = 4242; saveGameState(); });
    const goldSaved = await ev(() => (JSON.parse(localStorage.getItem('neurodeck_full_save')).hero || {}).gold);
    if (goldSaved !== 4242) throw new Error('после очистки квоты сохранение не восстановилось: ' + goldSaved);
    console.log('     [i] квота: забито ключей=' + fill.filled + ', ошибка=' + fill.err + ', тост-очередь=' + JSON.stringify(st.toast));
    await shot(pg, 'b13_quota');
  });

  // ---------- Шаг 7. Вайпы ----------
  await step('B14 [шаг7] new-game-keep-cards: прогресс сброшен (золото 30, ур.1, захваты 0), карточки живы (3)', async () => {
    await richState(500);
    await ev(() => newGameKeepCards());
    await pg.waitForSelector('#confirmOverlay.show', { timeout: 5000 });
    await pg.locator('#confirmYes').click();
    await pg.waitForTimeout(600);
    const st = await ev(() => ({
      gold: HERO.gold, lvl: HERO.level, cards: FORGED.length,
      cap: strongholds.filter((s) => s.captured).length, tasks: TASKS.length,
      header: document.getElementById('progressVal').textContent,
      saved: !!localStorage.getItem('neurodeck_full_save'),
    }));
    if (st.gold !== 30 || st.lvl !== 1) throw new Error('прогресс не сброшен: ' + JSON.stringify(st));
    if (st.cards !== 3) throw new Error('карточки потеряны при keep-cards: ' + st.cards);
    if (st.cap !== 0 || st.tasks !== 0) throw new Error('прогресс не вычищен: ' + JSON.stringify(st));
    if (!st.saved) throw new Error('после сброса сейв не перезаписан');
    // НАБЛЮДЕНИЕ (нахдока, не гейт): хедер прогресса может остаться stale — newGameKeepCards
    // вызывает renderStrongholds(), но НЕ updateStrongholdProgress()
    const afterRender = await ev(() => { updateStrongholdProgress(); return document.getElementById('progressVal').textContent; });
    if (st.header !== '0/20' && afterRender === '0/20') {
      findings.push({ sev: 'P2', text: 'newGameKeepCards() сбрасывает данные твердынь (captured=0, сейв 0/20), но НЕ обновляет хедер прогресса: в render-списке нет updateStrongholdProgress() — сразу после операции показывается stale «' + st.header + '». Данные корректны, дисплей — нет.', evidence: 'B14: header сразу=' + st.header + ', после updateStrongholdProgress()=' + afterRender });
    }
    if (afterRender !== '0/20') throw new Error('после явного рендера хедер всё ещё ' + afterRender + ' — данные реально не сброшены');
    await shot(pg, 'b14_keep_cards');
  });

  await step('B15 [шаг7] full-wipe-all: чистое состояние после перезагрузки (золото 30, карточек 0, сейв без прогресса) + наблюдение онбординга', async () => {
    const errsBefore = errors.length;
    await ev(() => fullWipeAll());
    await pg.waitForSelector('#confirmOverlay.show', { timeout: 5000 });
    await pg.locator('#confirmYes').click();
    await pg.waitForTimeout(2500); // внутри location.reload()
    await dismissOverlays();
    await pg.waitForTimeout(1500);
    const st = await ev(() => ({
      gold: HERO.gold, lvl: HERO.level, cards: FORGED.length,
      cap: strongholds.filter((s) => s.captured).length, tasks: TASKS.length,
      season: season && season.num,
      starter: (document.getElementById('starterDeckModal') || {}).classList.contains('show'),
      everSaved: localStorage.getItem('neurodeck_ever_saved'),
      header: document.getElementById('progressVal').textContent,
    }));
    if (st.gold !== 30 || st.lvl !== 1 || st.cards !== 0 || st.cap !== 0 || st.tasks !== 0) throw new Error('вайп неполный: ' + JSON.stringify(st));
    if (!(st.season >= 1)) throw new Error('сезон после вайпа сломан: ' + st.season);
    if (errors.length > errsBefore) throw new Error('JS-ошибки: ' + errors.slice(errsBefore).join(' | ').slice(0, 200));
    // НАБЛЮДЕНИЕ: сезон переживает полный вайп (num/start/snapshot не сбрасываются fullWipeAll)
    if (st.season !== 1) {
      findings.push({ sev: 'P3', text: 'fullWipeAll() не сбрасывает сезон: после полного вайпа season.num=' + st.season + ' (до вайпа был Сезон 2 из B14-фикстуры), start/snapshot сохраняются. Возможно «сезон глобален» by design — но прогресс-счётчик сезонов переживает полный вайп, в отличие от всего остального.', evidence: 'B15: season после вайпа = ' + st.season });
    }
    // НАБЛЮДЕНИЕ (нахдока, не гейт): ever_saved='1' после вайпа → ветка 3277 не показывает старт-колоду
    if (st.everSaved === '1' && !st.starter && st.cards === 0) {
      findings.push({ sev: 'P3', text: 'После full-wipe-all старт-колода не предлагается: fullWipeAll() вызывает saveGameState() с пустым FORGED → neurodeck_ever_saved=1 → условие app.js:3277 (!hasEverSaved() && FORGED.length===0) ложно. Игрок остаётся без карточек и без онбординга (deepRecovery ничего не находит).', evidence: 'B15: everSaved=1, starter=false, cards=0' });
    }
    await shot(pg, 'b15_full_wipe');
  });

  // ---------- Шаг 8. Гонка облачной синхронизации (эпоха) ----------
  await step('B17 [шаг8] гонка облака: локальные изменения при открытом диалоге smartCloudSync → устаревший applySyncData отбрасывается (облачный снапшот не затирает живое состояние)', async () => {
    await richState(5000);
    await ev(() => {
      FORGED.length = 0;
      FORGED.push({ id: 1, name: 'Живая-1', rank: 'C', stat: 'str', mastery: 0, masteryThreshold: 5, meta: '⚔ 10 мин · утро', streak: 0, totalCompletions: 0, prestige: 0, evolutionPath: null, daysActive: 0, firstCompletedAt: null, lastCompletedAt: null }, { id: 2, name: 'Живая-2', rank: 'C', stat: 'int', mastery: 0, masteryThreshold: 5, meta: '🧠 10 мин · день', streak: 0, totalCompletions: 0, prestige: 0, evolutionPath: null, daysActive: 0, firstCompletedAt: null, lastCompletedAt: null });
      saveGameState(); // эпоха E1
      const oldSnap = buildSyncData(); // «облако»: устаревший снапшот с 1 карточкой
      oldSnap.forged = [FORGED[0]];
      window.Telegram = { WebApp: { CloudStorage: {
        getItem: function(k, cb) { setTimeout(function() {
          if (String(k).indexOf('meta') !== -1) cb(null, JSON.stringify({ n: 1, t: Date.now() + 60000 }));
          else cb(null, JSON.stringify(oldSnap));
        }, 250); },
        setItem: function(k, v, cb) { setTimeout(function() { if (cb) cb(null); }, 50); },
        removeItem: function(k, cb) { setTimeout(function() { if (cb) cb(null); }, 50); }
      } } };
    });
    await ev(() => smartCloudSync()); // myEpoch = E1; облако «новее» → loadCloudChunks → диалог
    await pg.waitForTimeout(1300);
    const dialogUp = await pg.evaluate(() => { const c = document.getElementById('confirmOverlay'); return !!(c && c.classList.contains('show')); });
    if (!dialogUp) throw new Error('диалог «Найдано обновление» не открылся (стаб облака не сработал)');
    // локальное изменение, ПОКА диалог открыт: новая карточка + сохранение → эпоха E2
    await ev(() => { FORGED.push({ id: 3, name: 'Живая-3', rank: 'C', stat: 'wil', mastery: 0, masteryThreshold: 5, meta: '🧘 5 мин · вечер', streak: 0, totalCompletions: 0, prestige: 0, evolutionPath: null, daysActive: 0, firstCompletedAt: null, lastCompletedAt: null }); saveGameState(); });
    await pg.locator('#confirmYes').click({ force: true }).catch(() => {});
    await pg.waitForTimeout(800);
    const after = await ev(() => ({ cards: FORGED.length, has3: FORGED.some((c) => c.id === 3), alive: !!document.getElementById('progressVal') }));
    if (!after.alive) throw new Error('приложение не пережило гонку облака');
    if (after.cards !== 3 || !after.has3) throw new Error('гонка облака: устаревший облачный снапшот наложился поверх локальных изменений (карточек ' + after.cards + ', has3=' + after.has3 + ')');
    await ev(() => { delete window.Telegram; });
    await shot(pg, 'b17_cloud_race');
  });

  // ---------- Итоги ----------
  await report();
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  const skips = results.filter((r) => r[0] === 'SKIP').length;
  console.log('\n===== QA-DATA: ЦЕЛОСТНОСТЬ ДАННЫХ =====');
  for (const [st, name, err] of results) console.log(`${st} ${name}${err ? '\n     -> ' + err : ''}`);
  console.log(`\nИТОГО: ${results.length - fails - skips}/${results.length} OK, провалено: ${fails}, skip: ${skips}`);
  console.log('JS-ошибки консоли за сессию: ' + errors.length);
  if (errors.length) console.log('Ошибки (первые 5): ' + JSON.stringify(errors.slice(0, 5), null, 1));
  if (findings.length) { console.log('НАХОДКИ:'); findings.forEach((f) => console.log('  ' + f.sev + ': ' + f.text)); }
  const uniq404 = [...new Set(urls404)];
  if (uniq404.length) console.log('404 URL: ' + JSON.stringify(uniq404.slice(0, 10)));
  await b.close(); srv.close();
  process.exit(fails > 0 ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e); try { await report(); } catch (x) {} process.exit(2); });

async function report() {
  fs.writeFileSync(OUT + '/results.json', JSON.stringify({ at: new Date().toISOString(), results, findings }, null, 2));
}
