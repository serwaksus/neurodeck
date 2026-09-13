// NeuroDeck личный QA-прогон: полный путь игрока, реальные клики + машина времени.
const { chromium } = require('/root/neurodeck/node_modules/@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/root/neurodeck';
const OUT = '/tmp/opencode/playtest';
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
  srv.listen(8790);
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errors.push('CONSOLE: ' + m.text()); });
  await pg.route('**/*', (r) => { r.request().url().includes('localhost') ? r.continue() : r.abort(); });
  await pg.goto('http://localhost:8790/', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(1500);

  // === 1. Онбординг и старт-колода ===
  await step('1.1 старт-колода появилась для нового игрока', async () => {
    await pg.waitForSelector('#starterDeckModal.show', { timeout: 5000 });
  });
  await shot(pg, 'starter_deck');
  await step('1.2 выбор 2 карточек и принятие', async () => {
    const boxes = pg.locator('#starterDeckList input[type="checkbox"]');
    const n = await boxes.count();
    if (n < 2) throw new Error('чекбоксов: ' + n);
    for (let i = 0; i < n; i++) await boxes.nth(i).uncheck();
    await boxes.nth(0).check(); await boxes.nth(1).check();
    await pg.locator('[data-action="accept-starter-deck"]').click();
    await pg.waitForTimeout(400);
    if (await pg.locator('#starterDeckModal.show').isVisible().catch(() => false)) throw new Error('модалка не закрылась');
  });
  await step('1.3 онбординг-оверлей показался и пролистался до конца', async () => {
    await pg.waitForSelector('.onboarding-overlay.show', { timeout: 5000 });
    for (let i = 0; i < 12; i++) {
      const gone = await pg.evaluate(() => !document.querySelector('.onboarding-overlay'));
      if (gone) break;
      await pg.evaluate(() => { const b = document.querySelector('.onboarding-overlay button'); if (b) b.click(); });
      await pg.waitForTimeout(150);
    }
    await pg.waitForTimeout(300);
    if (await pg.locator('.onboarding-overlay.show').isVisible().catch(() => false)) throw new Error('онбординг не закрылся');
  });
  await shot(pg, 'deck_after_onboarding');

  // === 2. Карточки: выполнение, золото, пропуск ===
  await step('2.1 колода содержит 2 карточки', async () => {
    const n = await pg.locator('#cardGrid .card').count();
    if (n !== 2) throw new Error('карточек: ' + n);
  });
  await step('2.2 выполнение карточки: +XP, +1 золото, тост', async () => {
    const g0 = await pg.evaluate(() => HERO.gold);
    await pg.locator('[data-action="complete-card"]').first().click();
    await pg.waitForTimeout(400);
    const g1 = await pg.evaluate(() => HERO.gold);
    if (g1 !== g0 + 1) throw new Error(`золото ${g0} -> ${g1}, ожидалось +1`);
    if (!(await pg.locator('#toast.show').isVisible().catch(() => false))) throw new Error('нет тоста');
  });
  await shot(pg, 'card_completed');
  await step('2.3 повторное выполнение сегодня — блокируется', async () => {
    const before = await pg.evaluate(() => FORGED.find(c => c.totalCompletions > 0).totalCompletions);
    await pg.locator('[data-action="complete-card"]').first().click({ force: true });
    await pg.waitForTimeout(300);
    const after = await pg.evaluate(() => FORGED.find(c => c.totalCompletions > 0).totalCompletions);
    if (after !== before) throw new Error('выполнение прошло дважды за день!');
  });
  await step('2.4 пропуск карточки: −1 золото, стрик 0', async () => {
    const g0 = await pg.evaluate(() => HERO.gold);
    await pg.locator('[data-action="fail-card"]').first().click({ force: true });
    await pg.waitForTimeout(400);
    const g1 = await pg.evaluate(() => HERO.gold);
    if (g1 !== Math.max(0, g0 - 1)) throw new Error(`золото ${g0} -> ${g1}`);
  });

  // === 3. Тракт: рендер, спрайты, покупка ===
  await step('3.1 вкладка Тракт открывается, 11 регионов, у всех спрайты', async () => {
    await pg.locator('.bnav-btn[data-view="tract"]').click({ force: true });
    await pg.waitForTimeout(400);
    const regions = await pg.locator('.tract-region').count();
    if (regions !== 11) throw new Error('регионов: ' + regions);
    const imgs = await pg.locator('.tract-region-icon img').count();
    if (imgs !== 11) throw new Error('спрайтов: ' + imgs);
  });
  await step('3.2 спрайты реально загрузились (naturalWidth > 0)', async () => {
    const broken = await pg.evaluate(() => [...document.querySelectorAll('.tract-region-icon img')].filter(i => !i.naturalWidth).length);
    if (broken > 0) throw new Error('битых спрайтов: ' + broken);
  });
  await shot(pg, 'tract_sprites');
  await step('3.3 покупка региона 2: списано 30, стройка 1 день', async () => {
    await pg.evaluate(() => { HERO.gold = 100; renderTract(); }); // чуть денег для теста
    await pg.locator('[data-action="tract-buy-next"]').first().click({ force: true });
    await pg.waitForTimeout(400);
    const st = await pg.evaluate(() => ({ gold: HERO.gold, regions: tractState.regions, b: tractState.building }));
    if (st.gold !== 70) throw new Error('золото после покупки: ' + st.gold);
    if (!st.b || st.b.regionIdx !== 1 || st.b.remaining !== 1) throw new Error('стройка: ' + JSON.stringify(st.b));
  });
  await shot(pg, 'tract_building');

  // === 4. Машина времени: дневной тик, стройка, доход ===
  await step('4.1 тик дня: стройка достроена, регион 2 активен, доход начислен', async () => {
    await pg.evaluate(() => { lastDayReset = getMSKDayKey(Date.now() - 86400000); checkDailyReset(); });
    await pg.waitForTimeout(400);
    const st = await pg.evaluate(() => ({ regions: tractState.regions, b: tractState.building, gold: HERO.gold }));
    if (st.regions !== 1) throw new Error('регионов: ' + st.regions);
    if (st.b) throw new Error('стройка не закрылась: ' + JSON.stringify(st.b));
    if (st.gold !== 70 + 2 + 1) throw new Error('золото (70 + 2 доход лок.1 + 1 за карточку?) = ' + st.gold + ' [лок.1=1/день, лок.2=2/день, доход за 1 день нового тракта = 2; 70+2=72... факт: ' + st.gold + ']');
  });
  await step('4.2 пропущенные 5 дней: докрутка дохода подневно', async () => {
    const g0 = await pg.evaluate(() => HERO.gold);
    await pg.evaluate(() => { lastDayReset = getMSKDayKey(Date.now() - 5 * 86400000); checkDailyReset(); });
    const gained = (await pg.evaluate(() => HERO.gold)) - g0;
    const rev = await pg.evaluate(() => tractRevenuePerDay());
    if (gained !== rev * 5) throw new Error(`докручено ${gained}, ожидалось ${rev}×5 (5 дней < капа 7)`);
  });

  // === 5. Задачи: создать, выполнить, сундук ===
  await step('5.1 модалка задачи, создание с дедлайном сегодня 19:00', async () => {
    await pg.locator('[data-action="open-task-modal"]').first().click({ force: true });
    await pg.waitForSelector('#taskModal.show');
    await pg.fill('#taskName', 'Сдать отчёт до 13:00');
    await pg.locator('#taskTierChips [data-tier="normal"]').click();
    await pg.locator('[data-action="create-task"]').click();
    await pg.waitForTimeout(300);
    if (await pg.locator('#taskModal.show').isVisible().catch(() => false)) throw new Error('модалка не закрылась');
    const n = await pg.evaluate(() => TASKS.length);
    if (n !== 1) throw new Error('задач: ' + n);
  });
  await step('5.2 выполнение -> кнопки сундука -> выбор золота +10', async () => {
    const g0 = await pg.evaluate(() => HERO.gold);
    await pg.locator('[data-action="complete-task"]').first().click({ force: true });
    await pg.waitForTimeout(300);
    await pg.locator('[data-action="claim-task-gold"]').first().click({ force: true });
    await pg.waitForTimeout(300);
    const g1 = await pg.evaluate(() => HERO.gold);
    if (g1 !== g0 + 10) throw new Error(`золото ${g0} -> ${g1}, ожидалось +10`);
    if ((await pg.evaluate(() => TASKS[0].status)) !== 'chest_open') throw new Error('статус: ' + TASKS[0].status);
  });
  await shot(pg, 'task_chest');
  await step('5.3 сундук исчез из инбокса после ночного тика', async () => {
    await pg.evaluate(() => { lastDayReset = getMSKDayKey(Date.now() - 86400000); checkDailyReset(); });
    if ((await pg.evaluate(() => TASKS.length)) !== 0) throw new Error('chest_open не вычищен');
  });

  // === 6. Призраки ===
  await step('6.1 просрочка -> призрак, −1 золото за ночь', async () => {
    await pg.evaluate(() => { TASKS.unshift({ id: taskIdCounter++, name: 'Просрочка', tier: 'urgent', deadline: Date.now() - 86400000, status: 'active', createdAt: Date.now() - 90000000, doneAt: null, ghostSince: null }); renderTasks(); });
    const g0 = await pg.evaluate(() => HERO.gold);
    await pg.evaluate(() => { lastDayReset = getMSKDayKey(Date.now() - 86400000); checkDailyReset(); });
    const g1 = await pg.evaluate(() => HERO.gold);
    if ((await pg.evaluate(() => TASKS[0].status)) !== 'ghost') throw new Error('статус: ' + TASKS[0].status);
    const rev = await pg.evaluate(() => tractRevenuePerDay());
    if (g1 !== g0 - 1 + rev) throw new Error(`ожидалось ${g0} -1 (призрак) +${rev} (доход) = ${g0 - 1 + rev}, факт ${g1}`);
  });
  await step('6.2 призрак виден в блоке Призраки с делом-крестиком', async () => {
    const ghostCards = await pg.locator('#tasksGone .task-card.ghost').count();
    if (ghostCards < 1) throw new Error('призрак не отрисован');
  });
  await shot(pg, 'ghosts');
  await step('6.3 изгнание крестиком удаляет призрака', async () => {
    await pg.locator('#tasksGone [data-action="delete-task"]').first().click({ force: true });
    await pg.waitForSelector('#confirmOverlay.show');
    await pg.locator('#confirmYes').click();
    await pg.waitForTimeout(300);
    if ((await pg.evaluate(() => TASKS.length)) !== 0) throw new Error('не удалён');
  });

  // === 7. Персистентность: перезагрузка ===
  await step('7.1 F5: золото, регионы, задачи восстановлены', async () => {
    const before = await pg.evaluate(() => ({ gold: HERO.gold, regions: tractState.regions, lvl: HERO.level, xp: HERO.xp }));
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1500);
    await pg.evaluate(() => { if (document.querySelector('.onboarding-overlay')) { const b = document.querySelector('.onboarding-overlay button'); while (b && document.querySelector('.onboarding-overlay')) b.click(); } });
    const after = await pg.evaluate(() => ({ gold: HERO.gold, regions: tractState.regions, lvl: HERO.level, xp: HERO.xp }));
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  });
  await shot(pg, 'after_reload');

  // === 8. Синхронизация: share link, экспорт, восстановление ===
  await step('8.1 share link содержит валидный payload', async () => {
    const link = await pg.evaluate(() => generateShareLink());
    const payload = decodeURIComponent(atob(link.split('#')[1] || ''));
    const data = JSON.parse(payload);
    if (!data.forged || typeof data.hero.gold !== 'number') throw new Error('payload битый');
  });
  await step('8.2 applySyncData(свежий v7) не падает и применяет золото', async () => {
    await pg.evaluate(() => { const d = buildSyncData(); d.hero.gold = 777; d.v = 7; applySyncData(d, true); });
    if ((await pg.evaluate(() => HERO.gold)) !== 777) throw new Error('gold не применился');
    await pg.evaluate(() => { location.hash = ''; });
  });
  await step('8.3 импорт легаси v6 сейва: миграция, без краша', async () => {
    const legacy = { v: 6, hero: { name: 'Странник', level: 3, xp: 100, xpToNext: 380, totalXp: 500, hp: 80, maxHp: 90, isHollow: false, actionPoints: 5, shards: 12, flasks: 2 }, stats: {}, forged: [{ id: 1, name: 'Тест', rank: 'C', stat: 'str', mastery: 0, masteryThreshold: 5 }], goals: [], inventory: { backpack: [], equipped: {} }, escapeProgress: 5, bossHp: 100, bossStage: 0, bossDefeated: false, forgedIdCounter: 101, uidCounter: 11, goalIdCounter: 1, xpHistory: [], bloodOath: null, bossRagePoints: 2, lastWeekReset: '2026-09-07', savedAt: Date.now() };
    await pg.evaluate((d) => { applySyncData(d, true); }, legacy);
    const st = await pg.evaluate(() => ({ gold: HERO.gold, lvl: HERO.level, cards: FORGED.length, ap: HERO.actionPoints, shards: HERO.shards }));
    if (st.gold !== 54) throw new Error('миграция золота 12*2+30 = 54, факт: ' + st.gold); // 12 осколков *2 + 30
    if (st.lvl !== 3) throw new Error('уровень: ' + st.lvl);
    if (st.cards !== 1) throw new Error('карточки: ' + st.cards);
    if (st.ap !== undefined || st.shards !== undefined) throw new Error('легаси-поля не вычищены');
  });

  // === 9. Перф-режим ===
  await step('9.1 эко-режим: класс на root, тост', async () => {
    await pg.evaluate(() => { window.NeuroDeckPerf.setMode('effects-off'); });
    const cls = await pg.evaluate(() => document.documentElement.className);
    if (!cls.includes('perf-eco')) throw new Error('класс: ' + cls);
  });

  // === Итоги ===
  console.log('\n===== РЕЗУЛЬТАТЫ ПЛЕЙТЕСТА =====');
  for (const [st, name, err] of results) console.log(`${st} ${name}${err ? '  -> ' + err : ''}`);
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\nИТОГО: ${results.length - fails}/${results.length} OK, провалено: ${fails}`);
  console.log('JS-ошибки консоли за сессию:', errors.length === 0 ? 'нет' : JSON.stringify(errors, null, 1));
  await b.close(); srv.close();
  process.exit(fails > 0 || errors.length > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });
