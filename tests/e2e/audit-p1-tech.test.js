const { test, expect } = require('@playwright/test');

// Аудит 2026-10-02, раздел 2 «Дерево технологий» в браузере:
//  2.3 — ветви 🕯 (s), 🏗 (g), 🕊 (d) открывались тирами ветви ⚖ (c): купленный s1 не открывал s2, зато c1 открывал s2/g2/d2;
//        панель и SVG-дерево показывали то же неверное состояние;
//  + 30 купленных нод теряли хвост на каждой загрузке (`.slice(0, 21)` в applySyncData): после перезагрузки оставались первые 21.
// Сид — v13-сейв (паттерн weekly-modifier): lastDayReset = сегодня, автотик на буте не срабатывает, состояние детерминировано.

const DAY = (offset = 0) => new Date(Date.now() + 3 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const MONDAY = (() => {
  const d = new Date(Date.now() + 3 * 3600000);
  const diff = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
})();

const CAPTURED = 14; // эпоха «Угасание» (тиры 4–6) открыта с 8 захватов
function shState(captured) {
  return Array.from({ length: 20 }, (_, i) => ({
    id: 'sh' + String(i + 1).padStart(2, '0'),
    captured: i < captured,
    garrison: [],
    buildings: {},
    corruption: { stage: 'ok', debtDays: 0 },
  }));
}
const ownedMap = (ids) => { const o = {}; ids.forEach((id) => { o[id] = true; }); return o; };
const chain = (L, n) => Array.from({ length: n }, (_, i) => L + (i + 1));

function makeSave({ owned = [], lvl = {}, pts = 50, res = 99 } = {}) {
  return {
    v: 13, gen: 1, savedAt: Date.now(), t: Date.now(),
    hero: {
      name: 'Технолог', level: 5, xp: 10, xpToNext: 200, totalXp: 500, gold: 5000,
      lastSessionAt: Date.now(), consecutivePerfectDays: 0, dailyCompletions: 0, dailySkips: 0,
      bosses: { defeated: [], activeNum: null, phase: 0, attemptDay: null, closedDay: null, closedCount: 0, introSeen: [], rewardChoice: {}, pendingReward: null },
    },
    stats: {},
    forged: [{
      id: 1, name: 'Карта-технолог', rank: 'C', stat: 'str', streak: 0, mastery: 0, masteryThreshold: 5,
      totalCompletions: 1, progress: 0, prestige: 0, evolutionPath: null, daysActive: 1, meta: '',
      firstCompletedAt: 1750000000000, lastCompletedAt: null, lastFailDay: null,
    }],
    goals: [], tasks: [], taskIdCounter: 1, forgedIdCounter: 2, uidCounter: 1, goalIdCounter: 1,
    xpHistory: [], bloodOath: null, hirePool: null,
    lastDayReset: DAY(0), lastWeekReset: MONDAY,
    strongholds: shState(CAPTURED),
    army: { units: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 50 }, week: 3 },
    siege: { week: 1, lastResult: null, assaultDay: DAY(-1), wkSkips: 0, wkTaskFails: 0, retriedThisWeek: false, rams: 0, ladders: 0 },
    season: { num: 1, start: DAY(0), crownBonus: 0, snapshot: { totalXp: 500, gold: 5000, captured: CAPTURED, completions: 1, level: 5 }, resource: { 1: res } },
    throne: 0,
    TECHS: { owned: ownedMap(owned), lvl },
    TECH_PTS: pts,
  };
}

async function bootWithSave(page, save) {
  await page.route('**/telegram-web-app.js', route => route.abort());
  await page.addInitScript(() => {
    const j = sessionStorage.getItem('__nd_e2e_save');
    if (j) {
      sessionStorage.removeItem('__nd_e2e_save');
      localStorage.setItem('neurodeck_full_save', j);
      try { localStorage.setItem('neurodeck_gen', String(JSON.parse(j).gen || 1)); } catch (e) {}
      localStorage.setItem('neurodeck_onboarding_done', '1');
    }
  });
  await page.goto('/e2e-prologue'); // 404 на том же origin: приложение не грузится
  await page.evaluate((s) => sessionStorage.setItem('__nd_e2e_save', JSON.stringify(s)), save);
  await page.goto('/');
  await page.waitForSelector('.bnav-btn[data-view="strongholds"]', { state: 'visible' });
  await page.click('.bnav-btn[data-view="strongholds"]');
  await page.waitForSelector('#view-strongholds.active');
}
async function openTechs(page) {
  await page.click('[data-action="km-techs-open"]');
  await page.waitForSelector('#techModal.show #techBody .km-tech');
}
const ownedCount = (page) => page.evaluate(() => Object.keys(TECHS.owned).length);

// ===================== потеря хвоста дерева на загрузке =====================
test('аудит 2.3: 30 купленных технологий не теряются на загрузке; покупка 31-й и перезагрузка сохраняют все', async ({ page }) => {
  const thirty = [].concat(chain('w', 8), chain('e', 8), chain('c', 8), chain('s', 6));
  expect(thirty.length).toBe(30);
  await bootWithSave(page, makeSave({ owned: thirty, lvl: { w1: 2, e1: 3 }, pts: 100, res: 999 }));

  expect(await ownedCount(page), 'после загрузки сейва с 30 нодами осталось 30 (раньше — первые 21)').toBe(30);
  await openTechs(page);
  await expect(page.locator('#techBody .km-tree-node.owned'), 'SVG-дерево: изучено 30 нод').toHaveCount(30);
  await expect(page.locator('#techBody .km-tech[data-action="km-tech-buy"].owned'), 'список: изучено 30 нод').toHaveCount(30);
  await expect(page.locator('#techBody .km-tech[data-tech="s6"]'), 's6 — из «хвоста» (раньше пропадала)').toHaveClass(/owned/);

  // реальная покупка → автосохранение → перезагрузка: ничего не потеряно, уровни на месте
  await page.click('#techBody .km-tech[data-tech="g1"]');
  await expect.poll(async () => page.evaluate(() => {
    try { return Object.keys(JSON.parse(localStorage.getItem('neurodeck_full_save')).TECHS.owned).length; } catch (e) { return -1; }
  }), { message: 'сейв в localStorage содержит 31 технологию' }).toBe(31);

  await page.reload();
  await page.waitForSelector('.bnav-btn[data-view="strongholds"]', { state: 'visible' });
  const after = await page.evaluate(() => ({ n: Object.keys(TECHS.owned).length, g1: TECHS.owned.g1 === true, s6: TECHS.owned.s6 === true, lvl: TECHS.lvl }));
  expect(after.n, 'после перезагрузки — все 31').toBe(31);
  expect(after.g1 && after.s6).toBe(true);
  expect(after.lvl.w1).toBe(2);
  expect(after.lvl.e1).toBe(3);
});

// ===================== 2.3: пререквизиты ветвей s/g/d =====================
test('аудит 2.3: s1 открывает s2 — в панели, в SVG и при покупке (раньше s2 требовала c1)', async ({ page }) => {
  await bootWithSave(page, makeSave({ owned: ['s1'], pts: 50, res: 99 }));
  await openTechs(page);

  const s2 = page.locator('#techBody .km-tech[data-tech="s2"]');
  await expect(s2, 's2: доступна к покупке').toHaveClass(/\bcan\b/);
  await expect(s2, 'ветвь в панели — s, а не c').toHaveAttribute('data-br', 's');
  await expect(page.locator('#techBody .km-tree-node[data-tree-id="s2"]'), 'SVG: s2 доступна').toHaveClass(/\bcan\b/);
  await expect(page.locator('#techBody .km-tech[data-tech="g2"]'), 'g2 закрыта (нет g1)').toHaveClass(/\blocked\b/);
  await expect(page.locator('#techBody .km-tech[data-tech="d2"]'), 'd2 закрыта (нет d1)').toHaveClass(/\blocked\b/);
  for (const [id, br] of [['w1', 'w'], ['e1', 'e'], ['c1', 'c'], ['s1', 's'], ['g1', 'g'], ['d1', 'd'], ['g8', 'g'], ['d8', 'd']]) {
    await expect(page.locator('#techBody .km-tech[data-tech="' + id + '"]'), id + ': data-br').toHaveAttribute('data-br', br);
  }

  const before = await page.evaluate(() => ({ pts: TECH_PTS, res: resPool() }));
  await s2.click();
  const st = await page.evaluate(() => ({ s2: TECHS.owned.s2 === true, pts: TECH_PTS, res: resPool() }));
  expect(st.s2, 's2 куплена').toBe(true);
  expect(before.pts - st.pts, 'списано 4 очка').toBe(4);
  expect(before.res - st.res, 'списано 16 ресурсов').toBe(16);
  await expect(page.locator('#techBody .km-tech[data-tech="s3"]'), 'после s2 открылась s3').toHaveClass(/\bcan\b/);
});

test('аудит 2.3: c1 НЕ открывает s2/g2/d2 (чужая ветвь) — карточки закрыты, покупка отклонена с подсказкой', async ({ page }) => {
  await bootWithSave(page, makeSave({ owned: ['c1'], pts: 50, res: 99 }));
  await openTechs(page);

  for (const id of ['s2', 'g2', 'd2']) {
    await expect(page.locator('#techBody .km-tech[data-tech="' + id + '"]'), id + ' закрыта при одном c1').toHaveClass(/\blocked\b/);
    await expect(page.locator('#techBody .km-tree-node[data-tree-id="' + id + '"]'), 'SVG: ' + id + ' закрыта').toHaveClass(/\blocked\b/);
  }
  await expect(page.locator('#techBody .km-tech[data-tech="c2"]'), 'c2 доступна — своя ветвь').toHaveClass(/\bcan\b/);

  const before = await page.evaluate(() => ({ pts: TECH_PTS, res: resPool() }));
  await page.click('#techBody .km-tech[data-tech="s2"]');
  const st = await page.evaluate(() => ({ s2: TECHS.owned.s2 === true, pts: TECH_PTS, res: resPool() }));
  expect(st.s2, 's2 не куплена').toBe(false);
  expect(st.pts, 'очки не списаны').toBe(before.pts);
  expect(st.res, 'ресурсы не списаны').toBe(before.res);
  await expect(page.locator('#toast .t-body'), 'подсказка про предыдущий тир').toContainText('предыдущий тир');
});
