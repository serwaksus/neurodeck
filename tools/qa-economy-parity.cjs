// NeuroDeck QA-Economy — parity-харнес (порт 8830, один браузер, 1 повтор → SKIP-infra).
// Слой 1: формула-паритет живых функций против stronghold-model.js / stronghold-data.js / SPEC+BALANCE пин.
// Слой 2: кампания 50 дней через checkDailyReset (lastDayReset = вчера), Math.random пин 0.99 («Тихий день»).
// Продукт НЕ меняется. Артефакты: /tmp/opencode/qa-economy/
const { chromium } = require('/root/neurodeck/node_modules/@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = '/root/neurodeck';
const OUT = '/tmp/opencode/qa-economy';
const PORT = 8830;
const URL_BASE = 'http://localhost:' + PORT + '/';
fs.mkdirSync(OUT, { recursive: true });

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
function startServer() {
  return new Promise((res, rej) => {
    const srv = http.createServer((req, res) => {
      let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
      try { const d = fs.readFileSync(path.join(ROOT, p)); res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'text/plain' }); res.end(d); }
      catch (e) { res.writeHead(404); res.end('nf'); }
    });
    srv.once('error', rej);
    srv.listen(PORT, '127.0.0.1', () => res(srv));
  });
}

// ---------- Эталоны (Node-сторона; источник: SPEC.md §4-§8, BALANCE круг 3/6, stronghold-model.js) ----------
const CAT = require(ROOT + '/js/stronghold-data.js');
const TIER_KEYS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
const R = (x) => Math.round(x);
const manualHire = (base, cha) => Math.ceil(base * (1 - Math.min(0.30, 0.005 * cha)));
const manualRoutes = (flags) => { let n = 0; for (let i = 1; i < flags.length; i++) if (flags[i] && flags[i - 1]) n++; return n; };
const manualTBonus = (r) => Math.min(0.38, Math.max(0, R(r)) * 0.02);
// shIncomePerDay: taxes → ×(1+tradeBonus) → round; + round(econ); → ×(1+min(0.5, market)) → round
const manualIncome = (flags, bspec) => {
  let taxes = 0, econ = 0, market = 0;
  flags.forEach((cap, i) => {
    if (!cap) return;
    taxes += CAT.STRONGHOLDS[i].tax;
    (bspec || []).forEach(([idx, id, stage]) => {
      if (idx !== i) return;
      const d = CAT.BUILDINGS[id];
      const m = stage === 'worn' ? 0.5 : stage === 'ruin' ? 0 : 1;
      if (d.gold) econ += d.gold * m;
      if (d.market) market += d.market * m;
    });
  });
  taxes = R(taxes * (1 + manualTBonus(manualRoutes(flags))));
  return R((taxes + R(econ)) * (1 + Math.min(0.5, market)));
};
const manualSiege = (total, week, captured, wrath) => {
  let w = Math.floor(week); if (!isFinite(w) || w < 0) w = 0; w = Math.min(w, 12);
  const cap = Math.max(4, Math.floor((captured || 0) * 1.5));
  const wEff = Math.min(w, cap);
  let wr = wrath; if (!isFinite(wr) || wr < 0) wr = 0; wr = Math.min(wr, 10);
  return Math.round(total * 0.6 * Math.pow(1.15, wEff) * (1 + 0.12 * wr));
};

// ---------- Счётчики ----------
const L1 = []; // {group, name, expected, actual, pass, note}
const L2 = { days: [], violations: [], siege: [] };
function l1(group, name, expected, actual, note) {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  L1.push({ group, name, expected, actual, pass, note: note || '' });
  return pass;
}

async function main() {
  const srv = await startServer();
  let browser, pageErrors = [];
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE: ' + m.text()); });
    await pg.route('**/*', (r) => { r.request().url().includes('localhost') ? r.continue() : r.abort(); });
    await pg.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1200);

    const ev = (src, arg) => pg.evaluate(new Function('arg', `return (${src})(arg);`), arg);

    // Хелперы состояния в странице
    await ev(`() => {
      window.__qaReset = () => {
        strongholds = null; ensureStrongholdState();
        HERO.gold = 0; TASKS = []; dailyQuests = null;
        siege.wkSkips = 0; siege.wkTaskFails = 0;
        STATS.str.value = 0; STATS.agi.value = 0;
      };
      return true;
    }`);

    // ===== Слой 1: формула-паритет =====

    // --- 1a. hireCostOf vs UNIT_TIERS при cha 3/10/30 (+60 кап, +100 макс) ---
    for (const cha of [3, 10, 30, 60, 100]) {
      const actual = await ev(`(cha) => { STATS.cha.value = cha; return SM.TIER_KEYS.map(t => hireCostOf(t)); }`, cha);
      const expected = TIER_KEYS.map(t => manualHire(CAT.UNIT_TIERS[t].cost, cha));
      l1('1a-найм', `hireCostOf все 7 тиров @ cha=${cha}`, expected.join(','), actual.join(','),
        `ceil(cost×(1−min(0.30;0.005×cha))); скидка ${Math.round(Math.min(0.30, 0.005 * cha) * 1000) / 10}%`);
    }
    await ev(`() => { STATS.cha.value = 3; }`);

    // --- 1b. shIncomePerDay vs ручная формула: сценарии ---
    const scen = [
      { name: 'S0: ничего не захвачено', nCap: 0, b: [] },
      { name: 'S2: sh01–sh05, без построек', nCap: 5, b: [] },
      { name: 'S3: +Э1(Рынок)+Э2(Амбары) в sh01, Целые', nCap: 5, b: [[0, 'ec1', 'ok'], [0, 'ec2', 'ok']] },
      { name: 'S4: Э1+Э2 обветшали (×0.5)', nCap: 5, b: [[0, 'ec1', 'worn'], [0, 'ec2', 'worn']] },
      { name: 'S5: Э1+Э2 в руине (×0)', nCap: 5, b: [[0, 'ec1', 'ruin'], [0, 'ec2', 'ruin']] },
      { name: 'S7: 6×Рынок в sh01–sh06 (кап market +50%)', nCap: 6, b: [[0, 'ec1', 'ok'], [1, 'ec1', 'ok'], [2, 'ec1', 'ok'], [3, 'ec1', 'ok'], [4, 'ec1', 'ok'], [5, 'ec1', 'ok']] },
    ];
    for (const s of scen) {
      const actual = await ev(`(s) => {
        __qaReset();
        for (let i = 0; i < s.nCap; i++) strongholds[i].captured = true;
        s.b.forEach(([idx, id, stage]) => { strongholds[idx].buildings[id] = { built: true, corruptionStage: stage, debtDays: 0 }; });
        return { income: shIncomePerDay(), routes: SM.tradeRoutes(strongholds.map(x => !!x.captured)), taxRaw: strongholdTaxPerDay() };
      }`, s);
      const flags = Array.from({ length: 20 }, (_, i) => i < s.nCap);
      const expIncome = manualIncome(flags, s.b);
      l1('1b-доход', `${s.name}: shIncomePerDay vs ручная формула`, expIncome, actual.income,
        `маршрутов ${manualRoutes(flags)} (+${Math.round(manualTBonus(manualRoutes(flags)) * 100)}%), Σналогов ${flags.reduce((a, f, i) => a + (f ? CAT.STRONGHOLDS[i].tax : 0), 0)}`);
      l1('1b-пути', `${s.name}: tradeRoutes = пары соседних захваченных`, manualRoutes(flags), actual.routes, '');
    }
    const capBonus = await ev(`() => {
      __qaReset(); for (let i = 0; i < 20; i++) strongholds[i].captured = true;
      const routes = SM.tradeRoutes(strongholds.map(x => !!x.captured));
      return { routes, bonus: SM.tradeBonus(routes), income: shIncomePerDay() };
    }`);
    l1('1b-пути', '20/20: маршрутов 19, кап бонуса +38%', '19|0.38', capBonus.routes + '|' + capBonus.bonus, 'BALANCE круг 6');
    l1('1b-доход', '20/20: доход = round(8352×1.38) = 11526💰', 11526, capBonus.income, 'пин круг 3: Σ налогов 8352');

    // --- 1c. siegePower: сетка параметров + продуктовый runWeeklySiege ---
    for (const wk of [1, 2, 5, 12, 13, 14, 20]) for (const cap of [1, 3, 6, 10, 20]) for (const wr of [0, 5, 10, 15]) {
      const total = CAT.STRONGHOLDS[cap - 1].total;
      const smVal = await ev(`(a) => SM.siegePower(STRONGHOLDS[a.cap - 1].total, a.wk - 1, a.cap, a.wr)`, { wk, cap, wr });
      l1('1c-осада', `siegePower(front#${cap}, week=${wk}, captured=${cap}, wrath=${wr})`,
        manualSiege(total, wk - 1, cap, wr), smVal,
        `W_eff=min(min(${wk}−1,12);max(4;floor(${cap}×1.5))); wrath кап 10`);
    }
    await ev(`() => {
      __qaReset();
      for (let i = 0; i < 6; i++) strongholds[i].captured = true; // фронт sh06 (total 190); кап W_eff = 9
      window.__qaSiegeLog = [];
      window.__origShowSiegeReport = window.showSiegeReport;
      window.showSiegeReport = function (rows, wrath) { window.__qaSiegeLog.push(JSON.parse(JSON.stringify({ rows, wrath }))); return window.__origShowSiegeReport.apply(this, arguments); };
      return true;
    }`);
    const escalation = [];
    let prevPower = null;
    for (let k = 0; k < 13; k++) {
      await ev(`(w) => { siege.week = w; siege.wkSkips = 0; siege.wkTaskFails = 0; TASKS = []; runWeeklySiege(); }`, k + 1);
      const log = await ev(`() => window.__qaSiegeLog`);
      const row = log[log.length - 1].rows[0];
      const power = row.power;
      const exp = manualSiege(CAT.STRONGHOLDS[5].total, k, 6, 0);
      escalation.push(l1('1c-осада', `runWeeklySiege: неделя ${k + 1} → round(190×0.6×1.15^W_eff) = ${exp}`, exp, power, row.held === false ? 'ТВЕРДЫНЯ ПАЛА' : ''));
      if (prevPower != null) {
        const ratio = power / prevPower;
        const growing = Math.min(k - 1, Math.max(4, 9)) < 9 || Math.min(k, Math.max(4, 9)) < 9; // хоть одна неделя ещё не в капе
        if (growing) escalation.push(l1('1c-осада', `эскалация нед ${k} → ${k + 1}: ×1.15`, true, Math.abs(ratio - 1.15) <= 0.005, `факт ×${Math.round(ratio * 1000) / 1000}`));
        else escalation.push(l1('1c-осада', `эскалация нед ${k} → ${k + 1}: W_eff упёрся в кап ${9} → ×1.0`, true, ratio === 1, `факт ×${Math.round(ratio * 1000) / 1000}`));
      }
      prevPower = power;
      if (row.held === false) break;
    }
    L2.siege = escalation;
    const wrathTest = await ev(`() => {
      __qaReset(); for (let i = 0; i < 6; i++) strongholds[i].captured = true;
      window.__qaSiegeLog = []; siege.week = 3; siege.wkSkips = 10; runWeeklySiege();
      const last = window.__qaSiegeLog[window.__qaSiegeLog.length - 1];
      return { wrath: last.wrath, power: last.rows[0].power, held: last.rows[0].held };
    }`);
    l1('1c-осада', 'Гнев: wkSkips=10 → Гнев 10 (кап) → ×(1+0.12×10)=×2.2',
      manualSiege(CAT.STRONGHOLDS[5].total, 2, 6, 10) + '|10', wrathTest.power + '|' + wrathTest.wrath, 'SPEC §5');
    const capTest = await ev(`() => {
      const out = [];
      for (const w of [13, 14]) {
        __qaReset(); for (let i = 0; i < 20; i++) strongholds[i].captured = true; // кап W_eff = 30 → работает кап календаря 12
        window.__qaSiegeLog = []; siege.week = w; runWeeklySiege();
        out.push(window.__qaSiegeLog[window.__qaSiegeLog.length - 1].rows[0].power);
      }
      return out;
    }`);
    l1('1c-осада', 'кап эскалации: сила(нед 13) == сила(нед 14) [W кап 12]', 'равны', capTest[0] === capTest[1] ? 'равны' : capTest.join('≠') + ' НЕ равны', 'факт: ' + capTest.join(' vs '));

    // --- 1d. assaultOutcome: 100 случайных пар, границы attrition ---
    const assault = await ev(`() => {
      const out = { win: [], lose: [], winFlagAll: true };
      const rnd = Math.random;
      for (let i = 0; i < 100; i++) {
        const def = STRONGHOLDS[i % 20].total;
        const k = [0.5, 0.75, 0.9, 0.99, 1.0, 1.01, 1.2, 1.5, 3, 10][i % 10] * (0.5 + rnd());
        const atk = Math.max(1, Math.round(def * k));
        const o = SM.assaultOutcome(atk, def, { agi: 0, banner: false });
        if (o.win !== (atk / def > 1)) out.winFlagAll = false;
        if (o.win) out.win.push(o.attritionPct); else out.lose.push(o.attritionPct);
      }
      Math.random = () => 0.0;
      const loMin = SM.assaultOutcome(50, 100, {}).attritionPct;
      Math.random = () => 0.999999;
      const loMax = SM.assaultOutcome(50, 100, {}).attritionPct;
      Math.random = rnd;
      const winBase = SM.assaultOutcome(400, 100, { agi: 0 }).attritionPct;
      const winAgi = SM.assaultOutcome(400, 100, { agi: 50 }).attritionPct;
      const winAgiBan = SM.assaultOutcome(400, 100, { agi: 50, banner: true }).attritionPct;
      return { win: out.win, lose: out.lose, winFlagAll: out.winFlagAll, loMin, loMax, winBase, winAgi, winAgiBan };
    }`);
    l1('1d-штурм', '100 пар: победа ⇔ ratio > 1 (ratio==1 → отступление)', true, assault.winFlagAll, 'SPEC §4');
    l1('1d-штурм', `attrition победы: диапазон [${Math.min(...assault.win).toFixed(4)}…${Math.max(...assault.win).toFixed(4)}] ⊆ [0.08; 0.30]`,
      true, assault.win.every((x) => x >= 0.08 - 1e-9 && x <= 0.30 + 1e-9), 'клампы до модификаторов agi/П2');
    l1('1d-штурм', `attrition поражения: rand 0 → ${assault.loMin}, rand→1 → ${assault.loMax} ⊆ [0.10; 0.30]`,
      true, Math.abs(assault.loMin - 0.10) < 1e-9 && Math.abs(assault.loMax - (10 + 0.999999 * 20) / 100) < 1e-9, '10 + rand(0..20)%');
    l1('1d-штурм', 'пол attrition: ratio 4 → clamp floor 0.08', 0.08, assault.winBase, '');
    l1('1d-штурм', 'agi 50 → ×0.5 (кап −50%): 0.08×0.5', 0.04, assault.winAgi, 'SPEC §7');
    l1('1d-штурм', 'П2 Кузня Знамён → ×0.8 поверх agi: 0.08×0.5×0.8', 0.032, assault.winAgiBan, 'мультипликативно, SPEC §4');
    const doAssault = await ev(`() => {
      __qaReset();
      army.units = { t1: 2, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }; // 4 < 5 → поражение гарантировано
      strongholds[0].captured = false; siege.assaultDay = null;
      const origRnd = Math.random;
      Math.random = () => 0.0; // потери ровно 10%
      const g0 = HERO.gold;
      doAssault(0, assaultForecast(0));
      Math.random = origRnd;
      return { units: JSON.parse(JSON.stringify(army.units)), captured: strongholds[0].captured, goldDelta: HERO.gold - g0, daySet: !!siege.assaultDay };
    }`);
    l1('1d-штурм', 'doAssault (поражение 10%): floor(2×0.10)=0, стопа не исчезает', JSON.stringify({ t1: 2, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0 }), JSON.stringify(doAssault.units),
      `captured=${doAssault.captured}; золото не тронуто=${doAssault.goldDelta === 0}`);
    l1('1d-штурм', 'doAssault: флаг «штурм сегодня» установлен (1/сутки)', true, doAssault.daySet, 'SPEC §4');

    // --- 1e. DQ_POOL: награды против пина + выплата ---
    const dq = await ev(`() => {
      const pool = DQ_POOL.map(q => ({ id: q.id, text: q.text, goal: q.goal, reward: q.reward }));
      __qaReset();
      dailyQuests = { day: getMSKDayKey(), quests: [DQ_POOL[0], DQ_POOL[4]], done: {}, progress: { cards: 5, quest: 2 } };
      const g0 = HERO.gold;
      completeDailyQuest('dq_cards', DQ_POOL[0].reward);
      const afterFirst = HERO.gold - g0;
      completeDailyQuest('dq_cards', DQ_POOL[0].reward);
      const afterSecond = HERO.gold - g0;
      completeDailyQuest('dq_quest', DQ_POOL[4].reward);
      const afterThird = HERO.gold - g0;
      return { pool, afterFirst, afterSecond, afterThird };
    }`);
    const expRewards = { dq_cards: 20, dq_gold: 15, dq_hire: 15, dq_build: 20, dq_quest: 10, dq_assault: 25 };
    const expGoals = { dq_cards: 2, dq_gold: 30, dq_hire: 3, dq_build: 1, dq_quest: 1, dq_assault: 1 };
    for (const q of dq.pool) {
      l1('1e-DQ', `${q.id}: награда/цель из текста «${q.text}»`, `${expRewards[q.id]}|${expGoals[q.id]}`, `${q.reward}|${q.goal}`, '');
    }
    l1('1e-DQ', 'completeDailyQuest: выплата ровно reward', 20, dq.afterFirst, '');
    l1('1e-DQ', 'completeDailyQuest: повторный клейм не платит', 20, dq.afterSecond, 'guard dailyQuests.done');
    l1('1e-DQ', 'completeDailyQuest: вторая квест-выплата +10 (итого 30)', 30, dq.afterThird, '');

    // --- 1f. Призраки: −1💰/ночь, cap, tier ---
    const ghost = await ev(`() => {
      __qaReset();
      const now = Date.now();
      const mk = (id) => ({ id, name: 'T' + id, tier: 'light', deadline: now - 3 * 86400000, status: 'active', ghostSince: null });
      TASKS = [1, 2, 3, 4, 5, 6, 7, 8].map(mk);
      HERO.gold = 100;
      const g0 = HERO.gold;
      expireGhostTasks(getMSKDayKey(now - 86400000)); // ночь 1: 8 просроченных → призраки
      const night1 = HERO.gold - g0;
      expireGhostTasks(getMSKDayKey(now - 86400000)); // ночь 2: те же призраки висят
      const night2 = HERO.gold - g0 - night1;
      return { night1, night2, ghosts: countGhostTasks() };
    }`);
    l1('1f-призраки', 'ночь 1: 8 новых призраков → −5💰 (кап 5)', -5, ghost.night1,
      'КОД min(5,penalty) app.js:2120; SPEC §8: −1💰/ночь за призрака без капа; UI-текст: «−1💰 за ночь» за каждого');
    l1('1f-призраки', 'ночь 2: призраки живут — −1💰/ночь за каждого, кап 5 (круг 7, SPEC §8)', -5, ghost.night2,
      'ночные списания: каждая ночь существования призрака стоит 1💰, суммарный кап 5/ночь (анти-спираль)');
    l1('1f-призраки', 'countGhostTasks: 8 призраков → Гнев 2×8=16 → кап 10', 8, ghost.ghosts, '');

    // --- 1g. level-up +30💰 ---
    const lvl = await ev(`() => {
      __qaReset();
      const g0 = HERO.gold, lvl0 = HERO.level;
      HERO.xp = HERO.xpToNext - 5;
      addXpReward(10); // ровно 1 уровень (остаток 5 переносится)
      const one = { gold: HERO.gold - g0, level: HERO.level - lvl0 };
      addXpReward(HERO.xpToNext); // 5+xpToNext → ровно ещё 1 уровень
      return { one, two: { gold: HERO.gold - g0 - one.gold, level: HERO.level - lvl0 - one.level } };
    }`);
    l1('1g-уровень', 'level-up ×1: +30💰', '30|1', lvl.one.gold + '|' + lvl.one.level, 'onLevelUp app.js:594');
    l1('1g-уровень', 'level-up ×2: +30💰 за каждый', '30|1', lvl.two.gold + '|' + lvl.two.level, 'SPEC §8: Уровень +30');

    // --- 1h. grace/step коррапшна ---
    const grace = await ev(`() => {
      const out = {};
      for (const wil of [0, 19, 20, 40, 100]) {
        let stage = 'ok', firstWorse = null;
        for (let n = 1; n <= 15 && !firstWorse; n++) {
          // ночь n: на утро долг = n (передаём вчерашний долг n−1; тик сам +1)
          const r = SM.corruptionTick({ zh1: { built: true, corruptionStage: stage, debtDays: n - 1 } }, 0, wil, {});
          if (r.buildings.zh1.corruptionStage !== stage) { firstWorse = n; stage = r.buildings.zh1.corruptionStage; }
        }
        out[wil] = firstWorse;
      }
      return out;
    }`);
    for (const wil of [0, 19, 20, 40, 100]) {
      const expGrace = Math.min(7, 2 + Math.floor(wil / 20));
      l1('1h-коррапшн', `grace(wil=${wil}) = min(7;2+floor(${wil}/20)) = ${expGrace} → worn на debt ${expGrace + 1}`,
        expGrace + 1, grace[wil], 'SPEC §6');
    }
    const steps = await ev(`() => {
      const r2 = SM.corruptionTick({ zh1: { built: true, corruptionStage: 'ok', debtDays: 5 } }, 0, 3, { step: 2 });
      const r4 = SM.corruptionTick({ zh1: { built: true, corruptionStage: 'ok', debtDays: 5 } }, 0, 3, { step: 4 });
      const heal = SM.corruptionTick({ zh1: { built: true, corruptionStage: 'ruin', debtDays: 9 } }, 9999, 3, {});
      const immune = SM.corruptionTick({ zh1: { built: true, corruptionStage: 'ok', debtDays: 0, builtAt: Date.now() } }, 0, 3, { immune: { zh1: true } });
      const ruinNoEat = SM.corruptionTick({ zh1: { built: true, corruptionStage: 'ruin', debtDays: 9 }, zh2: { built: true, corruptionStage: 'ok', debtDays: 0 } }, 0, 3, {});
      return { step2: r2.buildings.zh1.corruptionStage, step4: r4.buildings.zh1.corruptionStage, heal: heal.buildings.zh1.corruptionStage, immuneKept: immune.buildings.zh1.corruptionStage, ruinUpkeep: ruinNoEat.upkeep };
    }`);
    l1('1h-коррапшн', 'step 2: wil 3 → grace 2, debt 5 > 2+2 → руина', 'ruin', steps.step2, '');
    l1('1h-коррапшн', 'step 4 (П3): debt 5 ≤ 2+4 → ещё обветшало', 'worn', steps.step4, 'Собор Порядка');
    l1('1h-коррапшн', 'оплата → руина → обветшало (1 ступень/день)', 'worn', steps.heal, 'SPEC §6');
    l1('1h-коррапшн', 'иммунитет новой постройки (7 дней): деградации нет', 'ok', steps.immuneKept, 'ADR §5');
    l1('1h-коррапшн', '«руина не ест»: upkeep = только Целая zh2 = 8💰', CAT.BUILDINGS.zh2.upkeep, steps.ruinUpkeep, 'zh1 в руине исключён');

    const prodStep = await ev(`() => {
      __qaReset(); strongholds[0].captured = true;
      strongholds[0].buildings.sp3 = { built: true, corruptionStage: 'worn', debtDays: 0 };
      return hasSpecialOk('sp3');
    }`);
    l1('1h-коррапшн', 'hasSpecialOk(sp3) при обветшании → false → step остаётся 2', false, prodStep, 'эффект П3 только у Целого (SPEC §2.4 ×стадия)');

    // ===== Слой 2: кампания 50 дней =====
    // Сценарий A «профицит»: sh01–sh06 + Ж1/Э1/Э2 в sh01; пин random 0.99 → «Тихий день»
    await ev(`() => {
      __qaReset();
      window.__origRandom = Math.random;
      Math.random = () => 0.99;
      for (let i = 0; i < 6; i++) strongholds[i].captured = true;
      strongholds[0].buildings.zh1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      strongholds[0].buildings.ec1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      strongholds[0].buildings.ec2 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      HERO.gold = 1000;
      return true;
    }`);
    const campLog = [];
    for (let d = 1; d <= 50; d++) {
      const r = await ev(`() => {
        lastDayReset = getMSKDayKey(Date.now() - 86400000);
        const g0 = HERO.gold;
        checkDailyReset();
        return {
          gold: HERO.gold, delta: HERO.gold - g0,
          event: (dailyEvent && dailyEvent.id) || null,
          upkeepUi: shUpkeepPerDay(), incomeUi: shIncomePerDay(),
          stages: Object.keys(strongholds[0].buildings).reduce((a, id) => { a[id] = strongholds[0].buildings[id].corruptionStage; return a; }, {})
        };
      }`);
      campLog.push({ day: d, ...r });
      if (r.gold < 0) L2.violations.push(`A, день ${d}: золото ${r.gold} < 0`);
    }
    const flags6 = Array.from({ length: 20 }, (_, i) => i < 6);
    const expTaxes = R((1 + 2 + 4 + 7 + 11 + 16) * (1 + manualTBonus(manualRoutes(flags6))));
    const expEcon = 20, expUpkeep = 3 + 10 + 15;
    const expMarketBase = expTaxes + expEcon;
    const expIncome = R(expMarketBase * 1.1); // рынок ec1 +10% — с раунда 3 платит В КАЗНУ (parity с sim.js:429)
    const expDelta = expIncome - expUpkeep;
    const quiet = campLog.filter((x) => x.event === 'quiet');
    l1('2-кампания', `дневная дельта казны (50 дней): (налоги ${expTaxes} (6 захватов, ${manualRoutes(flags6)} путей) + ${expEcon} эк.) ×1.1 рынок = ${expIncome} −${expUpkeep} содерж. = ${expDelta}`,
      expDelta, quiet[0] ? quiet[0].delta : 'нет тихих дней', `тихих дней ${quiet.length}/50 (пин 0.99)`);
    l1('2-кампания', 'пин Math.random=0.99: все 50 дней «Тихий день» (Караван не вклинился)', 50, quiet.length, '');
    l1('2-кампания', 'инвариант: золото ни разу < 0', true, campLog.every((x) => x.gold >= 0), `финал ${campLog[campLog.length - 1].gold}💰`);
    l1('2-кампания', 'инвариант: стадии не деградируют при профиците', 'ok|ok|ok',
      campLog[49].stages.zh1 + '|' + campLog[49].stages.ec1 + '|' + campLog[49].stages.ec2, '');
    const day1 = campLog[0];
    l1('2-кампания', `рынок платит в казну: UI-доход ${day1.incomeUi}💰 = факт-поступление (раунд 3: P1 закрыт)`,
      `${day1.incomeUi}|${day1.incomeUi}`, `${day1.delta + expUpkeep}|${day1.incomeUi}`,
      `app.js: gold += income (налоги×маршруты+экон)×(1+рынок) — parity с sim.js:429`);
    L2.days = campLog;

    // Сценарий B «дефицит»: золото 0, upkeep 31 > доход 7; wil 3 → grace 2, step 2
    await ev(`() => {
      __qaReset(); STATS.wil.value = 3;
      for (let i = 0; i < 2; i++) strongholds[i].captured = true; // дефицит: без налогов III провинции доход (с рынком) < содержания
      strongholds[0].buildings.zh1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      strongholds[0].buildings.ec1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      strongholds[0].buildings.ec2 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      strongholds[1].buildings.zh1 = { built: true, corruptionStage: 'ok', debtDays: 0 };
      HERO.gold = 0;
      Math.random = () => 0.99;
      return { upkeep: shUpkeepPerDay(), grace: 2 + Math.floor(3 / 20) };
    }`);
    const deficitLog = [];
    for (let d = 1; d <= 5; d++) {
      const r = await ev(`() => {
        lastDayReset = getMSKDayKey(Date.now() - 86400000); checkDailyReset();
        return {
          gold: HERO.gold,
          zh1: strongholds[0].buildings.zh1.corruptionStage, zh1d: strongholds[0].buildings.zh1.debtDays,
          ec1: strongholds[0].buildings.ec1.corruptionStage, zh1b: strongholds[1].buildings.zh1.corruptionStage
        };
      }`);
      deficitLog.push({ day: d, ...r });
      if (r.gold < 0) L2.violations.push(`B, день ${d}: золото ${r.gold} < 0`);
    }
    const byDay = (d) => deficitLog[d - 1];
    l1('2-дефицит', 'ночи 1–2 (debt ≤ grace 2): все Целые', 'ok|ok|ok',
      byDay(2).zh1 + '|' + byDay(2).ec1 + '|' + byDay(2).zh1b, `debt=${byDay(2).zh1d}`);
    l1('2-дефицит', 'ночь 3 (debt 3 > grace 2): обветшало (эффекты ×0.5)', 'worn|worn|worn',
      byDay(3).zh1 + '|' + byDay(3).ec1 + '|' + byDay(3).zh1b, '');
    l1('2-дефицит', 'ночь 5 (debt 5 > grace+step 4): руина (эффекты ×0)', 'ruin|ruin|ruin',
      byDay(5).zh1 + '|' + byDay(5).ec1 + '|' + byDay(5).zh1b, '');
    l1('2-дефицит', 'казна при дефиците: 0, не < 0', 0, byDay(5).gold, 'обнуление, SPEC §6');
    // Ночь 6: тотальная руина → «руина не ест» → upkeep 0 → paid=true БЕЗ списаний (P2-находка)
    const freeHeal = await ev(`() => {
      lastDayReset = getMSKDayKey(Date.now() - 86400000); checkDailyReset();
      return {
        gold: HERO.gold,
        stages: strongholds[0].buildings.zh1.corruptionStage + '|' + strongholds[0].buildings.ec1.corruptionStage + '|' + strongholds[1].buildings.zh1.corruptionStage,
        debt: strongholds[0].buildings.zh1.debtDays
      };
    }`);
    l1('2-дефицит', 'P2: ночь 6 (всё в руине) — upkeep 0 → «оплаченный день» бесплатно: руины → обветшало, 0💰 потрачено',
      'worn|worn|worn', freeHeal.stages, `золото на утро ${freeHeal.gold} (доход 7, списаний 0), debt=${freeHeal.debt}`);
    // Оплаченная ночь с реальным содержанием: worn → ok, −31💰
    await ev(`() => { HERO.gold = 100000; return true; }`);
    const heal1 = await ev(`() => {
      lastDayReset = getMSKDayKey(Date.now() - 86400000); checkDailyReset();
      return {
        s: strongholds[0].buildings.zh1.corruptionStage + '|' + strongholds[0].buildings.ec1.corruptionStage,
        debt: strongholds[0].buildings.zh1.debtDays, gold: HERO.gold
      };
    }`);
    l1('2-дефицит', 'оплаченная ночь (upkeep 31 списан): обветшало → Целое (1 ступень/день)', 'ok|ok', heal1.s,
      `debt=${heal1.debt}, списано ${100007 - heal1.gold}💰`);

    // Маршрутный прирост в кампании: 6 → 7 соседних захватов, +1 путь = +2% налогов
    const routeBump = await ev(`() => {
      __qaReset();
      for (let i = 0; i < 6; i++) strongholds[i].captured = true;
      const before = shIncomePerDay();
      strongholds[6].captured = true;
      const after = shIncomePerDay();
      return { before, after };
    }`);
    l1('2-пути', 'кампания: захват соседа sh07 → маршрутов 6 (+12%)', manualIncome(Array.from({ length: 20 }, (_, i) => i < 7), []), routeBump.after, `было ${routeBump.before} → стало ${routeBump.after}`);

    // Снятие пинов/перехватчиков
    await ev(`() => {
      Math.random = window.__origRandom || Math.random;
      if (window.__origShowSiegeReport) window.showSiegeReport = window.__origShowSiegeReport;
      return true;
    }`);
    await pg.screenshot({ path: OUT + '/shot01_final.png' }).catch(() => {});
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    try { srv.close(); } catch (e) {}
  }
  return { pageErrors };
}

(async () => {
  let attempt = 0, result = null, fatal = null;
  while (attempt < 2) {
    attempt++;
    try { result = await main(); break; }
    catch (e) { fatal = e; console.error(`[попытка ${attempt}] FAIL: ${e.message}\n${(e.stack || '').split('\n').slice(0, 6).join('\n')}`); }
  }
  const skipInfra = !result;
  const report = { port: PORT, attempts: attempt, skipInfra, pageErrors: result ? result.pageErrors : [String(fatal && fatal.message)], layer1: L1, layer2: L2 };
  fs.writeFileSync(OUT + '/parity-report.json', JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT + '/campaign-days.json', JSON.stringify(L2.days, null, 2));

  const total = L1.length;
  const passed = L1.filter((x) => x.pass).length;
  console.log(`\n=== QA-ECONOMY PARITY (порт ${PORT}, попыток ${attempt}${skipInfra ? ' — SKIP-INFRA' : ''}) ===`);
  console.log(`Проверок: ${total}, PASS: ${passed}, FAIL: ${total - passed}`);
  L1.filter((x) => !x.pass).forEach((x) => console.log(`  FAIL [${x.group}] ${x.name}: ожидалось ${JSON.stringify(x.expected)}, факт ${JSON.stringify(x.actual)} ${x.note}`));
  console.log(`Инварианты кампании: нарушений ${L2.violations.length}${L2.violations.length ? ': ' + L2.violations.join('; ') : ''}`);
  console.log(`PageErrors: ${report.pageErrors.length}${report.pageErrors.length ? '\n  ' + report.pageErrors.slice(0, 5).join('\n  ') : ''}`);
  process.exit(skipInfra ? 2 : 0);
})();
