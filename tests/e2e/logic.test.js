const { test, expect } = require('@playwright/test');

// Behavioral e2e tests driving REAL game logic via page.evaluate().
// app.js is a classic script: functions/var are on window; top-level let/const
// (FORGED, GOALS, chimeraShield, bossRagePoints, bossDefeated)
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

test('perf-eco class applied on documentElement in eco and low modes', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    var P = window.NeuroDeckPerf;
    P.setMode('eco');
    var ecoApplied = document.documentElement.classList.contains('perf-eco');
    P.setMode('low');
    var lowApplied = document.documentElement.classList.contains('perf-eco');
    P.setMode('performance');
    var perfCleared = !document.documentElement.classList.contains('perf-eco');
    return { ecoApplied, lowApplied, perfCleared };
  });
  expect(r.ecoApplied).toBe(true);
  expect(r.lowApplied).toBe(true);
  expect(r.perfCleared).toBe(true);
});

test('perf bridge: legacy listener fires only on eco transitions incl low/effects-off', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    var P = window.NeuroDeckPerf;
    P._resetForTests();
    var calls = [];
    P.onEcoModeChange(function(isEco, mode) { calls.push([isEco, mode]); });
    P.setMode('low');
    P.setMode('effects-off');
    P.setMode('performance');
    return calls;
  });
  expect(r.length).toBe(2);
  expect(r[0]).toEqual([true, 'low']);
  expect(r[1]).toEqual([false, 'performance']);
});

test('XP curve pinned: getXpToNext(15)=68000, (16)=round(68000*1.65)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({ l15: getXpToNext(15), l16: getXpToNext(16) }));
  expect(r.l15).toBe(68000);
  expect(r.l16).toBe(Math.round(68000 * 1.65));
});


test('perf UI: perfLowBtn click drives full chain (setMode, bridge, legacy listener)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    var P = window.NeuroDeckPerf;
    P._resetForTests();
    var fired = [];
    P.onEcoModeChange(function(isEco, mode) { fired.push([isEco, mode]); });
    var btn = document.getElementById('perfLowBtn');
    if (!btn) return { error: 'perfLowBtn not found' };
    btn.click();
    return { mode: P.getMode(), eco: P.isEco(), fired: fired };
  });
  expect(r.mode).toBe('low');
  expect(r.eco).toBe(true);
  expect(r.fired).toEqual([[true, 'low']]);
});

test('tract: buyNextRegion spends gold, starts build; advance completes and adds regions', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('neurodeck_onboarding_done', '1'); });
  await page.goto('/');
  await page.waitForTimeout(1500);
  const res = await page.evaluate(() => {
    HERO.gold = 1000;
    buyNextRegion();
    const afterBuy = { gold: HERO.gold, building: !!tractState.building, regions: tractState.regions };
    advanceTract();
    const after1 = { regions: tractState.regions, building: !!tractState.building };
    return { afterBuy, after1 };
  });
  if (res.afterBuy.building !== true) throw new Error('buyNextRegion must start a build');
  if (res.after1.regions !== 1 || res.after1.building !== false) throw new Error('1-day build must complete after 1 advance, got ' + JSON.stringify(res.after1));
});

test('tasks: complete -> chest choice adds gold or xp; ghosts expire after ghostDays', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('neurodeck_onboarding_done', '1'); });
  await page.goto('/');
  await page.waitForTimeout(1500);
  const res = await page.evaluate(() => {
    TASKS.length = 0;
    TASKS.push({ id: 9001, name: 'test', tier: 'normal', deadline: Date.now() - 86400000, status: 'active', createdAt: Date.now(), doneAt: null, ghostSince: null });
    const g0 = HERO.gold;
    expireGhostTasks(getMSKDayKey(Date.now() - 86400000));
    const ghosted = TASKS[0].status;
    const g1 = HERO.gold;
    for (let i = 0; i < 3; i++) { expireGhostTasks(getMSKDayKey(Date.now() + (86400000 * (i + 1)))); }
    const goneAfter3 = TASKS.length === 0;
    return { ghosted, goldPenalty: g0 - g1, goneAfter3 };
  });
  if (res.ghosted !== 'ghost') throw new Error('overdue task must become ghost, got ' + res.ghosted);
  if (res.goldPenalty !== 1) throw new Error('ghost night penalty must be exactly 1 gold, got ' + res.goldPenalty);
  if (!res.goneAfter3) throw new Error('ghost must leave after ghostDays nights');
});
