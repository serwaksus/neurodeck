const { test, expect } = require('@playwright/test');

// Behavioral e2e regression for NEW Crucible combat (js/app.js ~740-1259,
// rules mirror tools/combat-lab/combat_model.gd). Combat functions are driven
// DIRECTLY via page.evaluate — bare globals work (same mechanism logic.test.js uses).
//
// Determinism contract:
// - STATS.cha.value = 0 and zero focus stacks => critChance 0.
// - Math.random is pinned to 0.99 around any call that rolls internally
//   (attackBoss crit/agi-double, endBossTurn trailing rollIntent) => no crits,
//   no agi doubles, no accidental intent flips mid-assertion.
// - The Fri-Sun battle-phase gate lives in crucibleAction(); we invoke the
//   layer below it (crucibleHeroAction/attackBoss/endBossTurn/crucibleFightCleared/
//   crucibleRunFailed), reproducing crucibleAction's own kill/death checks inline.
// - Gear cleared => getCrucibleStats() === STATS values.

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

// Shared in-page preamble: neutralize gear, set stats, reset transients,
// pin a known boss/stage/hp. Concatenated before each test snippet.
// page.evaluate(string) parses the string as ONE expression, so the shared
// preamble opens an IIFE; each snippet below closes it with `})()`.
const SETUP = `
  (() => {
  function pin(fn) {
    const o = Math.random; Math.random = () => 0.99;
    try { return fn(); } finally { Math.random = o; }
  }
  function clearGear() {
    Object.keys(INVENTORY.equipped).forEach(k => { INVENTORY.equipped[k] = null; });
  }
  function setStats(s) {
    Object.keys(s).forEach(k => { STATS[k].value = s[k]; });
  }
  function prime(opts) {
    clearGear();
    setStats(opts.stats);
    escapeProgress = opts.escape !== undefined ? opts.escape : 90;
    bossDefeated = false;
    bossStage = opts.stage || 0;
    crucibleResetTransient();
    cStanceCount = 0;
    cIntent = opts.intent || 'quick';
    bossHp = getCurrentBoss().stages[bossStage].maxHp;
  }
`;

test('GUARD PIN: end-deck strike chips 30% for one charge; str-deck burns both charges', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(SETUP + `
    prime({ stats: { str: 5, end: 15, int: 0, cha: 0, wil: 3, agi: 1 } }); // end-dominant, cha=0 => no crit
    const deckEnd = getDeckStat() === 'end'; // captured BEFORE str mutation below
    const dmgEnd = 5 + STATS.str.value + 10;
    cGuard = 2;
    const hp0 = bossHp;
    pin(attackBoss);
    const chipEnd = hp0 - bossHp;
    const guardNonStr = cGuard;

    STATS.str.value = 20; // str-dominant now
    const deckStr = getDeckStat() === 'str';
    const dmgStr = 5 + 20 + 10;
    cGuard = 2;
    const hp1 = bossHp;
    pin(attackBoss);
    const chipStr = hp1 - bossHp;
    const guardStr = cGuard;

    return { deckEnd: deckEnd, deckStr: deckStr,
      guardNonStr: guardNonStr, chipEnd: chipEnd, expChipEnd: Math.round(dmgEnd * 0.3),
      guardStr: guardStr, chipStr: chipStr, expChipStr: Math.round(dmgStr * 0.3) };
  })()`);
  expect(r.deckEnd).toBe(true);
  expect(r.guardNonStr).toBe(1);
  expect(r.chipEnd).toBe(r.expChipEnd);
  expect(r.deckStr).toBe(true);
  expect(r.guardStr).toBe(0);
  expect(r.chipStr).toBe(r.expChipStr);
});

test('STRIKE MATH: focus x2 adds exactly int*0.5*2 and is consumed by the strike', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(SETUP + `
    prime({ stats: { str: 7, end: 3, int: 6, cha: 0, wil: 2, agi: 1 } }); // str-dominant deck
    crucibleHeroAction('focus');
    crucibleHeroAction('focus');
    const focusStacks = cFocus; // 2 (cap for non-int deck)

    const expFocused = Math.max(1, Math.round(5 + STATS.str.value + 10 + STATS.int.value * 0.5 * 2));
    const hp0 = bossHp;
    pin(attackBoss);
    const deltaFocused = hp0 - bossHp;
    const focusAfterStrike = cFocus;

    const expBare = Math.max(1, Math.round(5 + STATS.str.value + 10));
    const hp1 = bossHp;
    pin(attackBoss);
    const deltaBare = hp1 - bossHp;

    return { focusStacks: focusStacks, deltaFocused: deltaFocused, expFocused: expFocused,
      focusAfterStrike: focusAfterStrike, deltaBare: deltaBare, expBare: expBare };
  })()`);
  expect(r.focusStacks).toBe(2);
  expect(r.deltaFocused).toBe(r.expFocused);
  expect(r.focusAfterStrike).toBe(0);
  expect(r.deltaBare).toBe(r.expBare);
});

test('FOCUS CAP: int-dominant deck sticks at 3, str-dominant at 2', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(SETUP + `
    prime({ stats: { str: 3, end: 2, int: 12, cha: 0, wil: 1, agi: 0 } }); // int-dominant
    const intCap = cFocusMax;
    for (let i = 0; i < 4; i++) crucibleHeroAction('focus');
    const intStacked = cFocus;

    prime({ stats: { str: 14, end: 2, int: 3, cha: 0, wil: 1, agi: 0 } }); // str-dominant
    const strCap = cFocusMax;
    for (let i = 0; i < 3; i++) crucibleHeroAction('focus');
    const strStacked = cFocus;

    return { intCap: intCap, intStacked: intStacked, strCap: strCap, strStacked: strStacked };
  })()`);
  expect(r.intCap).toBe(3);
  expect(r.intStacked).toBe(3);
  expect(r.strCap).toBe(2);
  expect(r.strStacked).toBe(2);
});

test('STANCE SUITE: shield formula, wil 1st costs 1 AP / 2nd free, poison cleanse, AP=0 auto-focus', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(SETUP + `
    prime({ stats: { str: 2, end: 4, int: 1, cha: 0, wil: 10, agi: 0 } }); // wil-dominant
    const expShield = Math.round(STATS.wil.value * 1.6 + STATS.end.value * 0.9);
    HERO.actionPoints = 5;

    crucibleHeroAction('stance'); // 1st: costs 1 AP
    const shield1 = cHeroShield, ap1 = HERO.actionPoints, count1 = cStanceCount;

    crucibleHeroAction('stance'); // 2nd: free for wil deck
    const ap2 = HERO.actionPoints, count2 = cStanceCount;

    cPoisonTicks = 2; cPoisonDmg = 3;
    crucibleHeroAction('stance'); // 3rd: costs 1 again, cleanses a tick
    const ticksAfter = cPoisonTicks, ap3 = HERO.actionPoints;

    crucibleResetTransient(); cStanceCount = 0; // fresh fight, shield 0
    HERO.actionPoints = 0; cFocus = 0;
    crucibleHeroAction('stance'); // cannot pay => auto-focus fallback
    const fbFocus = cFocus, fbAp = HERO.actionPoints, fbShield = cHeroShield;

    return { expShield: expShield, shield1: shield1, ap1: ap1, count1: count1,
      ap2: ap2, count2: count2, ticksAfter: ticksAfter, ap3: ap3,
      fbFocus: fbFocus, fbAp: fbAp, fbShield: fbShield };
  })()`);
  expect(r.shield1).toBe(r.expShield);
  expect(r.ap1).toBe(4);
  expect(r.count1).toBe(1);
  expect(r.ap2).toBe(4);
  expect(r.count2).toBe(2);
  expect(r.ticksAfter).toBe(1);
  expect(r.ap3).toBe(3);
  expect(r.fbFocus).toBe(1);
  expect(r.fbAp).toBe(0);
  expect(r.fbShield).toBe(0);
});

test('FLASK ONCE: heals round(maxHp*0.5) capped, decrements stock, latched for the fight', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(SETUP + `
    prime({ stats: { str: 5, end: 5, int: 5, cha: 0, wil: 5, agi: 0 } });
    HERO.maxHp = 100; HERO.hp = 10; HERO.flasks = 2;
    const expHeal = Math.round(HERO.maxHp * 0.5);

    crucibleFlask();
    const hp1 = HERO.hp, flasks1 = HERO.flasks, latched1 = cFlaskUsed;

    crucibleFlask(); // rejected: one flask per fight
    const hp2 = HERO.hp, flasks2 = HERO.flasks;

    crucibleResetTransient(); // new fight => latch cleared
    HERO.hp = 90; HERO.flasks = 1;
    crucibleFlask(); // capped at maxHp
    const hp3 = HERO.hp, flasks3 = HERO.flasks;

    return { expHeal: expHeal, hp1: hp1, flasks1: flasks1, latched1: latched1,
      hp2: hp2, flasks2: flasks2, hp3: hp3, flasks3: flasks3, maxHp: HERO.maxHp };
  })()`);
  expect(r.hp1).toBe(10 + r.expHeal);
  expect(r.flasks1).toBe(1);
  expect(r.latched1).toBe(true);
  expect(r.hp2).toBe(r.hp1);
  expect(r.flasks2).toBe(1);
  expect(r.hp3).toBe(r.maxHp);
  expect(r.flasks3).toBe(0);
});

test('INTENT TABLE: heavy/quick/enrage exact deltas; snake poison ticks; demon burn ignores shield; chimera guards', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(SETUP + `
    const NEUTRAL = { str: 5, end: 5, int: 5, cha: 0, wil: 5, agi: 0 };
    function case_(esc, intent, extra) {
      prime({ stats: NEUTRAL, escape: esc, intent: intent });
      HERO.hp = 1000; cRage = 0;
      if (extra) extra();
      const hp0 = HERO.hp;
      pin(endBossTurn);
      return { delta: hp0 - HERO.hp, rage: cRage, ticks: cPoisonTicks,
        pdmg: cPoisonDmg, guard: cGuard, shield: cHeroShield };
    }

    const heavy = case_(0, 'heavy');            // snake stage0: round(9*1.6)
    const quick = case_(0, 'quick');            // round(9*0.9)
    const enrage = case_(0, 'enrage');          // rage +2 then -1 decay
    const poison = case_(0, 'special');         // snake: 3 ticks x (2+stage), first tick same turn
    const burn = case_(50, 'special', function() { cHeroShield = 999; }); // demon: ignores shield
    const guard = case_(90, 'special');         // chimera: 2 guard charges, no damage

    return {
      heavyDelta: heavy.delta, expHeavy: Math.round(9 * 1.6),
      quickDelta: quick.delta, expQuick: Math.round(9 * 0.9),
      enrageDelta: enrage.delta, enrageRage: enrage.rage,
      poisonDelta: poison.delta, poisonTicks: poison.ticks, poisonDmg: poison.pdmg,
      burnDelta: burn.delta, burnShieldKept: burn.shield,
      guardDelta: guard.delta, guardCharges: guard.guard
    };
  })()`);
  expect(r.heavyDelta).toBe(r.expHeavy); // 14
  expect(r.quickDelta).toBe(r.expQuick); // 8
  expect(r.enrageDelta).toBe(0);
  expect(r.enrageRage).toBe(1); // +2 then -1 decay
  expect(r.poisonTicks).toBe(2); // 3 set, one tick fires same turn
  expect(r.poisonDmg).toBe(2); // 2 + stage0
  expect(r.poisonDelta).toBe(2);
  expect(r.burnDelta).toBe(4); // 4 + stage0, straight through 999 shield
  expect(r.burnShieldKept).toBe(999);
  expect(r.guardDelta).toBe(0);
  expect(r.guardCharges).toBe(2);
});

test('LIFECYCLE: kill advances stage with breather (+60% HP, +3 AP, +150 XP); lethal turn resets the run', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(SETUP + `
    prime({ stats: { str: 12, end: 5, int: 0, cha: 0, wil: 2, agi: 1 } });
    HERO.level = 15; HERO.xp = 0; HERO.xpToNext = getXpToNext(15); // headroom vs level-up
    // maxHp is a DERIVED stat: updateHeroUI() re-syncs it to calcMaxHp() and grants
    // the diff as HP — seed the derived value instead of fighting the invariant.
    HERO.maxHp = calcMaxHp(); HERO.hp = 30; HERO.actionPoints = 2;

    bossHp = 1; // lethal strike
    pin(attackBoss);
    const killed = bossHp <= 0;
    const xpBefore = HERO.xp;
    if (killed) crucibleFightCleared(); // crucibleAction's own kill branch
    const advanced = {
      stage: bossStage,
      hp: bossHp,
      expectedStageHp: getCurrentBoss().stages[bossStage].maxHp,
      hpHeal: HERO.hp - 30,
      expHeal: Math.min(HERO.maxHp, 30 + Math.round(HERO.maxHp * 0.6)) - 30,
      ap: HERO.actionPoints,
      xpGain: HERO.xp - xpBefore
    };

    // Run failure: lethal boss turn => crucibleRunFailed semantics
    prime({ stats: { str: 12, end: 5, int: 0, cha: 0, wil: 2, agi: 1 }, stage: 2, intent: 'heavy' });
    HERO.hp = 5; cFlaskUsed = true; cPoisonTicks = 1; cPoisonDmg = 4; cRage = 0;
    pin(endBossTurn); // chimera stage2 heavy: round(16*1.6)=26 + poison tick 4 => hp<0
    const wentLethal = HERO.hp <= 0;
    if (wentLethal) crucibleRunFailed();

    return { killed: killed, advanced: advanced, wentLethal: wentLethal,
      failed: { hp: HERO.hp, stage: bossStage,
        bossHp: bossHp, expectedFreshHp: getCurrentBoss().stages[0].maxHp,
        flaskLatch: cFlaskUsed, ticks: cPoisonTicks } };
  })()`);
  expect(r.advanced.stage).toBe(1);
  expect(r.advanced.hp).toBe(r.advanced.expectedStageHp);
  expect(r.advanced.hpHeal).toBe(r.advanced.expHeal);
  expect(r.advanced.ap).toBe(5);
  expect(r.advanced.xpGain).toBe(150);
  expect(r.wentLethal).toBe(true);
  expect(r.failed.hp).toBe(1);
  expect(r.failed.stage).toBe(0);
  expect(r.failed.bossHp).toBe(r.failed.expectedFreshHp);
  expect(r.failed.flaskLatch).toBe(false);
  expect(r.failed.ticks).toBe(0);
});

test('SHOP + PERSISTENCE: flask economy, artifact purchase, save/reload, v5=>v6 flask migration', async ({ page }) => {
  test.setTimeout(60000); // 3 navigations x ~3s boot wait; 30s default is too tight under load
  await boot(page);
  const shop = await page.evaluate(() => {
    HERO.shards = 25; HERO.flasks = 0;
    buyFlask(); buyFlask();
    const afterTwo = { shards: HERO.shards, flasks: HERO.flasks };

    HERO.flasks = 5; HERO.shards = 100;
    buyFlask(); // rejected: stock full
    const fullRej = { shards: HERO.shards, flasks: HERO.flasks };

    HERO.flasks = 0; HERO.shards = 9;
    buyFlask(); // rejected: too poor
    const poorRej = { shards: HERO.shards, flasks: HERO.flasks };

    HERO.shards = 50;
    const unowned = !itemOwned('bootsWanderer');
    buyArtifact('bootsWanderer');
    return { afterTwo: afterTwo, fullRej: fullRej, poorRej: poorRej, unowned: unowned,
      priceB: SHOP_PRICES.B,
      shardsAfterArt: HERO.shards,
      inBackpack: INVENTORY.backpack.some(i => i.id === 'bootsWanderer') };
  });
  expect(shop.afterTwo).toEqual({ shards: 5, flasks: 2 });
  expect(shop.fullRej).toEqual({ shards: 100, flasks: 5 });
  expect(shop.poorRej).toEqual({ shards: 9, flasks: 0 });
  expect(shop.unowned).toBe(true);
  expect(shop.priceB).toBe(8);
  expect(shop.shardsAfterArt).toBe(42);
  expect(shop.inBackpack).toBe(true);

  // Persistence across reload
  await page.evaluate(() => { HERO.flasks = 3; HERO.shards = 41; saveGameState(); });
  await page.reload();
  await boot(page);
  const persisted = await page.evaluate(() => ({
    flasks: HERO.flasks, shards: HERO.shards,
    boots: INVENTORY.backpack.some(i => i.id === 'bootsWanderer'),
  }));
  expect(persisted.flasks).toBe(3);
  expect(persisted.shards).toBe(41);
  expect(persisted.boots).toBe(true);

  // v5-shaped payload (no v, no hero.flasks) => schema v6 migration grants 2 flasks
  const raw = await page.evaluate(() => localStorage.getItem('neurodeck_full_save'));
  const legacy = JSON.parse(raw);
  delete legacy.v;
  delete legacy.hero.flasks;
  // Block exit-time autosave (visibilitychange/beforeunload handlers call
  // saveGameState on navigation) from re-writing the seeded legacy payload
  // with the current in-memory HERO.
  await page.evaluate(json => {
    window.saveGameState = function() {};
    localStorage.setItem('neurodeck_full_save', json);
  }, JSON.stringify(legacy));
  await page.reload();
  await boot(page);
  const migrated = await page.evaluate(() => ({
    flasks: HERO.flasks,
    storedV: JSON.parse(localStorage.getItem('neurodeck_full_save')).v,
  }));
  expect(migrated.flasks).toBe(2);
  expect(migrated.storedV).toBe(6);
});

test('OUT-OF-COMBAT FLASK: backpack drink heals 50%, decrements, guards full-hp', async ({ page }) => {
  await boot(page);
  const r1 = await page.evaluate(() => {
    HERO.flasks = 2;
    HERO.maxHp = calcMaxHp();
    HERO.hp = 10;
    drinkFlaskOutside();
    return { hp: HERO.hp, maxHp: HERO.maxHp, flasks: HERO.flasks };
  });
  expect(r1.hp).toBe(10 + Math.round(r1.maxHp * 0.5));
  expect(r1.flasks).toBe(1);
  const r2 = await page.evaluate(() => {
    HERO.hp = HERO.maxHp;
    drinkFlaskOutside();
    return { hp: HERO.hp, maxHp: HERO.maxHp, flasks: HERO.flasks };
  });
  expect(r2.hp).toBe(r2.maxHp);
  expect(r2.flasks).toBe(1);
});

test('RUN LOCK: strike blocked after run-fail until flask drink or Monday', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(SETUP + `
    prime({ stats: { str: 12, end: 5, int: 0, cha: 0, wil: 2, agi: 1 }, stage: 0, intent: 'quick' });
    HERO.hp = 5; HERO.flasks = 1; HERO.maxHp = calcMaxHp();
    bossHp = getCurrentBoss().stages[0].maxHp;
    cRunLocked = true;
    const hpBeforeLock = HERO.hp, bossBeforeLock = bossHp;
    crucibleAction('strike');
    const lockedBlocked = bossHp === bossBeforeLock && HERO.hp === hpBeforeLock;
    drinkFlaskOutside();
    const unlockedAfterFlask = !cRunLocked;
    var hpBeforeStrike = HERO.hp, bossBeforeStrike = bossHp;
    attackBoss(); // напрямую: гейт фазы схватки не должен мешать проверке удара
    const strikeLanded = bossHp < bossBeforeStrike || HERO.hp < hpBeforeStrike;
    return { lockedBlocked, unlockedAfterFlask, strikeLanded };
  })()`);
  expect(r.lockedBlocked).toBe(true);
  expect(r.unlockedAfterFlask).toBe(true);
  expect(r.strikeLanded).toBe(true);
});
