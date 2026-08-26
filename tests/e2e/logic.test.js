const { test, expect } = require('@playwright/test');

// Behavioral e2e tests driving REAL game logic via page.evaluate().
// app.js is a classic script: functions/var are on window; top-level let/const
// (FORGED, GOALS, chimeraShield, bossRagePoints, escapeProgress, bossDefeated)
// live in the shared global lexical scope — readable/writable by bare name here.
// Each test gets a fresh browser context (clean localStorage) => state restored by isolation.

test.beforeEach(async ({ page }) => {
  await page.route('**/telegram-web-app.js', route => route.abort());
});

async function boot(page) {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const closeBtn = page.locator('#starterDeckModal .modal-close');
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
    await page.waitForTimeout(500);
  }
}

test('crucible guard: blocked strike chips 30% and consumes charge; str pierces extra; legacy API inert', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    escapeProgress = 90; // >=80 => getCurrentBoss().type === 'chimera'
    bossDefeated = false;
    STATS.str.value = 5; STATS.end.value = 15; STATS.int.value = 0;
    STATS.cha.value = 0; STATS.wil.value = 3; STATS.agi.value = 1; // end-dominant, no crit
    crucibleResetTransient();
    cIntent = 'quick';
    bossStage = 0;
    bossHp = getCurrentBoss().stages[0].maxHp;
    const dmgEnd = 5 + STATS.str.value + 10;
    cGuard = 2;
    const hp0 = bossHp;
    attackBoss();
    const chipEnd = hp0 - bossHp;
    const guardNonStr = cGuard;
    STATS.str.value = 20; // str-dominant now
    const dmgStr = 5 + 20 + 10;
    cGuard = 2;
    const hp1 = bossHp;
    attackBoss();
    const chipStr = hp1 - bossHp;
    const guardStr = cGuard;
    changeBossHp(-1); // legacy API: no longer mutates any shield
    return { chipEnd, guardNonStr, chipStr, guardStr, legacyGuard: cGuard, legacyChimera: chimeraShield,
      expChipEnd: Math.round(dmgEnd * 0.3), expChipStr: Math.round(dmgStr * 0.3) };
  });
  expect(r.guardNonStr).toBe(1);
  expect(r.chipEnd).toBe(r.expChipEnd);
  expect(r.guardStr).toBe(0);
  expect(r.chipStr).toBe(r.expChipStr);
  expect(r.legacyGuard).toBe(0);
  expect(r.legacyChimera).toBe(3);
});

test('failCard: twice same MSK day adds exactly +1 bossRagePoints', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    // Neutralize will-save RNG: save chance = totalWil / divisor => 0 with wil 0 and no gear.
    STATS.wil.value = 0;
    Object.keys(INVENTORY.equipped).forEach(k => { INVENTORY.equipped[k] = null; });
    FORGED.push({
      id: 'e2e-fail-1', name: 'E2E Fail Card', stat: 'str', streak: 0,
      meta: '', createdAt: Date.now(),
    });
    bossRagePoints = 0;
    failCard(null, 'e2e-fail-1');
    const afterFirst = bossRagePoints;
    failCard(null, 'e2e-fail-1'); // same day => lastFailDay guard => early return
    return { afterFirst, afterSecond: bossRagePoints };
  });
  expect(r.afterFirst).toBe(1);
  expect(r.afterSecond).toBe(1);
});

// Real goal flow: 4 steps x round(100/(4*2))=13 => 52, completeGoal round(100/2)=50 => 102 total.
async function runE2EGoal(page) {
  await boot(page);
  return page.evaluate(() => {
    // Headroom so no level-up consumes XP mid-test (L1 xpToNext=50 < 102).
    HERO.level = 15; HERO.xp = 0; HERO.xpToNext = getXpToNext(15);
    HERO.actionPoints = 0;
    GOALS.unshift({
      id: goalIdCounter++, type: 'short', name: 'E2E Goal', desc: '', deadline: null,
      totalSteps: 4, currentStep: 0,
      steps: [
        { text: 's1', done: false }, { text: 's2', done: false },
        { text: 's3', done: false }, { text: 's4', done: false },
      ],
      stat: 'str', xp: 100, dmg: 5, statBonus: 1, completed: false, failed: false,
      createdAt: Date.now(), lastStepAt: null,
    });
    const g = GOALS[0];
    const xpBefore = HERO.xp;
    const apBefore = HERO.actionPoints;
    for (let i = 0; i < 4; i++) toggleGoalStep(g.id, i);
    completeGoal(g.id); // idempotent vs the setTimeout(completeGoal,500) armed by step 4
    return Promise.resolve(new Promise(res => setTimeout(() => res({
      xpDelta: HERO.xp - xpBefore,
      apAfter: HERO.actionPoints,
      apBefore,
      completed: g.completed,
    }), 700))); // let the armed timer fire to prove no double-count
  });
}

test('goal XP exact split: 4 steps + completion ~= 100 XP, no 1.5x inflation', async ({ page }) => {
  const r = await runE2EGoal(page);
  expect(r.completed).toBe(true);
  expect(Math.abs(r.xpDelta - 100)).toBeLessThanOrEqual(4);
  expect(r.xpDelta).toBeLessThan(110);
});

test('completeGoal does NOT increase HERO.actionPoints', async ({ page }) => {
  const r = await runE2EGoal(page);
  expect(r.completed).toBe(true);
  expect(r.apAfter).toBe(r.apBefore);
});

test('buildBossWinStats handles string/number kill values, no NaN', async ({ page }) => {
  await boot(page);
  const html = await page.evaluate(() => {
    window._bossKills = { snake: '3', social: 2 };
    return buildBossWinStats();
  });
  expect(html).toContain('3 побед');
  expect(html).toContain('2 побед');
  expect(html).not.toContain('NaN');
});

test('getPrestigeXPBonus caps at 1.5 with high prestige values', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    FORGED.push({
      id: 'e2e-prestige', name: 'Prestige Card', stat: 'str', prestige: 1000,
      streak: 0, meta: '', createdAt: Date.now(),
    });
    return { capped: getPrestigeXPBonus('str'), untouched: getPrestigeXPBonus('int') };
  });
  expect(r.capped).toBe(1.5);
  expect(r.capped).toBeLessThanOrEqual(1.5);
  expect(r.untouched).toBe(1);
});

test('XP curve pinned: getXpToNext(15)=68000, (16)=round(68000*1.65)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({ l15: getXpToNext(15), l16: getXpToNext(16) }));
  expect(r.l15).toBe(68000);
  expect(r.l16).toBe(Math.round(68000 * 1.65));
});

test('boss scaling: piecewise ×0.10/lvl, +0.18/lvl past L10', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const base = [{ hp: 100, maxHp: 100 }];
    HERO.level = 1; const l1 = scaleBossStages(base)[0].hp;
    HERO.level = 6; const l6 = scaleBossStages(base)[0].hp;
    HERO.level = 11; const l11 = scaleBossStages(base)[0].hp;
    const bossStageHpL11 = getCurrentBoss().stages[0].maxHp; // escapeProgress 0 => snake
    return { l1, l6, l11, bossStageHpL11 };
  });
  expect(r.l1).toBe(100); // factor 1.0
  expect(r.l6).toBe(150); // factor 1 + 5*0.10
  expect(r.l11).toBe(218); // factor 1 + 10*0.10 + 1*0.18
  expect(r.bossStageHpL11).toBe(218);
});
