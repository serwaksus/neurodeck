// ============================================================
// РЕГРЕССИИ АУДИТА №1 — e2e-черновики QA-6 (п.56)
// T2-H1: 20/20 твердынь захвачено → вкладка рендерится, якорь «Фронт» присутствует
//        (фикс app.js:1897 — скобки вокруг тернарника; до фикса renderStrongholds
//         падал TypeError на эндгейме: STRONGHOLDS[-1].name)
// T1-H2: multi-tab конфликт — живой LWW-гард по stateGen
//        (фикс storage.js:189 stateGen++; до фикса вкладки слепо перетирали друг друга)
// T1-H3: exit-sync — beforeunload пишет в облако
//        (фикс storage.js:572 savedAt в buildSyncData; до фикса конфликт-чек
//         meta.t > 0+10000 всегда отбрасывал exit-запись)
//
// Черновик QA-6: положить в tests/e2e/ без правок (самодостаточен).
// ВАЖНО (грабли, найдены при верификации): playwright сериализует ТОЛЬКО исходник
// функции addInitScript — свободные переменные замыкания НЕ доезжают до страницы.
// Поэтому сид передаётся аргументом (arg-сериализация поддерживается).
// До применения фиксов все три теста красные — это и есть их регрессионная ценность.
// ============================================================

const { test, expect } = require('@playwright/test');

// --- сид сейва (v10): общий хелпер tests/e2e/seed.cjs (Fix-A, Round 2) ---
const seedSave = require('./seed.cjs');

// Сид-функция для addInitScript: всё, что нужно — внутри (arg-сериализация)
function SEED_IN_PAGE(seedJson) {
  localStorage.clear();
  localStorage.setItem('neurodeck_onboarding_done', '1');
  localStorage.setItem('neurodeck_starter_done', '1');
  localStorage.setItem('neurodeck_perf_mode', 'eco');
  localStorage.setItem('neurodeck_full_save', seedJson);
  localStorage.setItem('neurodeck_gen', String(JSON.parse(seedJson).gen || 1));
}

test.beforeEach(async ({ page }) => {
  await page.route('**/telegram-web-app.js', route => route.abort());
});

// ------------------------------------------------------------
// T2-H1: эндгейм (20/20) — вкладка твердынь рендерится, якорь «Фронт» есть
// ------------------------------------------------------------
test('T2-H1: endgame 20/20 — strongholds tab renders, Фронт anchor present', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const endgame = seedSave({ throne: 5 });
  endgame.strongholds = endgame.strongholds.map(s => Object.assign(s, { captured: true }));
  await page.addInitScript(SEED_IN_PAGE, JSON.stringify(endgame));
  await page.goto('/');
  await page.waitForTimeout(2500);
  await page.locator('.bnav-btn[data-view="strongholds"]').click();
  // (а) вкладка реально отрендерилась: казна на месте (рендер дошёл дальше якоря)
  await expect(page.locator('#view-strongholds .sh-treasury')).toBeVisible();
  // (б) якорь «Фронт» присутствует; при 20/20 frontIdx()=-1 → «Фронт: —» (фикс тернарника)
  const anchor = page.locator('#view-strongholds .sh-context-anchor');
  await expect(anchor).toBeVisible();
  await expect(anchor).toContainText('Фронт: —');
  // (в) renderStrongholds не упал (до фикса: TypeError … reading 'name')
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------
// T1-H2: multi-tab — новая семантика stateGen: adopt при remoteGen > stateGen
// Порядок критичен: B открывается ДО сохранения A (иначе boot B подтянет
// свежий gen и adopt-ветка станет недостижимой — грабли верификации).
// B.save идёт сразу после A.save, внутри 400мс-дебаунса storage-event,
// чтобы live-sync не обновил состояние B незаметно для теста.
// ------------------------------------------------------------
test('T1-H2: multi-tab — tab B adopts A\u2019s newer generation on save', async ({ page }) => {
  await page.addInitScript(SEED_IN_PAGE, JSON.stringify(seedSave()));
  await page.goto('/');
  await page.waitForTimeout(2500);

  // Вкладка B: та же страница-контекст (общий localStorage), boot на СТАРОМ gen=1
  const pageB = await page.context().newPage();
  await pageB.route('**/telegram-web-app.js', route => route.abort());
  await pageB.addInitScript(SEED_IN_PAGE, JSON.stringify(seedSave()));
  await pageB.goto('/');
  await pageB.waitForTimeout(2500);

  // Вкладка A: изменение + сохранение → gen 1 → 2
  await page.evaluate(() => {
    window.__toasts = [];
    const orig = window.showToast;
    window.showToast = function (t, d, k) { window.__toasts.push(String(t)); return orig.call(window, t, d, k); };
    TASKS.push({ id: 9001, name: 'multi-tab probe', tier: 'normal', deadline: null,
      status: 'active', createdAt: Date.now(), doneAt: null, ghostSince: null });
    saveGameState();
  });
  const genA = await page.evaluate(() => Number(localStorage.getItem('neurodeck_gen')));
  expect(genA).toBeGreaterThan(1); // фикс: stateGen++ жив; до фикса gen навсегда 1

  // Вкладка B: сохраняем ПОКА её stateGen=1 (внутри 400мс-дебаунса) → adopt
  const adopted = await pageB.evaluate(() => {
    window.__toasts = [];
    const orig = window.showToast;
    window.showToast = function (t, d, k) { window.__toasts.push(String(t)); return orig.call(window, t, d, k); };
    saveGameState();
    return {
      toasts: window.__toasts,
      hasTask: TASKS.some(t => t.id === 9001),
      gen: Number(localStorage.getItem('neurodeck_gen')),
      saved: JSON.parse(localStorage.getItem('neurodeck_full_save')),
    };
  });
  // adopt-ветка: тост «Синхронизировано между вкладками» + задача A в B
  expect(adopted.toasts).toContain('🔄 Синхронизировано между вкладками');
  expect(adopted.hasTask).toBe(true);
  // B сохранила ПОСЛЕДНЕЕ поколение (строго больше A) — до фикса gen замирал на 1
  expect(adopted.gen).toBeGreaterThan(genA);
  expect(adopted.saved.tasks.some(t => t.id === 9001)).toBe(true);
  await pageB.close();
});

// ------------------------------------------------------------
// T1-H3: exit-sync — page.close(runBeforeUnload) пишет сейв в облако.
// Стаб зеркалирует облачные записи в localStorage['__cs_writes'] — консоль
// может глохнуть во время teardown страницы; localStorage переживает close
// в том же контексте. Ассерт — через свежую страницу того же контекста.
// ------------------------------------------------------------
test('T1-H3: beforeunload exit-sync writes to cloud (setItem logged)', async ({ page }) => {
  const seed = JSON.stringify(seedSave());
  const metaSeed = JSON.stringify({ n: 1, t: Date.now() - 86400000 }); // облако: вчерашняя метка
  await page.addInitScript(([seedJson, metaJson]) => {
    // CloudStorage-стаб ДО app.js: колбэки синхронные → вся цепочка успевает
    // внутри beforeunload; каждая запись зеркалится в localStorage (переживёт close)
    const store = { nd_meta: metaJson, nd_0: seedJson };
    window.Telegram = { WebApp: { platform: 'desktop', CloudStorage: {
      getItem: (k, cb) => cb(null, k in store ? store[k] : null),
      setItem: (k, v, cb) => {
        store[k] = String(v);
        try { const l = JSON.parse(localStorage.getItem('__cs_writes') || '[]'); l.push('setItem ' + k); localStorage.setItem('__cs_writes', JSON.stringify(l)); } catch (e) {}
        cb(null);
      },
      removeItem: (k, cb) => {
        delete store[k];
        try { const l = JSON.parse(localStorage.getItem('__cs_writes') || '[]'); l.push('removeItem ' + k); localStorage.setItem('__cs_writes', JSON.stringify(l)); } catch (e) {}
        cb(null);
      },
    } } };
    localStorage.clear();
    localStorage.setItem('neurodeck_onboarding_done', '1');
    localStorage.setItem('neurodeck_starter_done', '1');
    localStorage.setItem('neurodeck_perf_mode', 'eco');
    localStorage.setItem('neurodeck_full_save', seedJson);
    localStorage.setItem('neurodeck_gen', '1');
    localStorage.setItem('__cs_writes', '[]');
    window._lastCloudSave = Date.now(); // гасим boot-запись (throttle 30с): любая запись дальше = exit-sync
  }, [seed, metaSeed]);
  await page.goto('/');
  await page.waitForTimeout(2500);
  await page.evaluate(() => localStorage.setItem('__cs_writes', '[]')); // форс-очистка пост-бутовой активности
  await page.close({ runBeforeUnload: true });
  // Читаем лог из ТОГО ЖЕ контекста (localStorage персистентен между страницами).
  // about:blank не имеет origin (localStorage → SecurityError), поэтому открываем
  // 404-URL того же origin — документ получает origin сервера без boot приложения.
  const pageLog = await page.context().newPage();
  await pageLog.goto('/robots.txt');
  const writes = await pageLog.evaluate(() => JSON.parse(localStorage.getItem('__cs_writes') || '[]'));
  // Фикс: savedAt=now в buildSyncData → конфликт-чек пропускает → nd_0 записан.
  // До фикса: savedAt||0 → meta.t(вчера) > 0+10000 → return без записи → 0 setItem.
  expect(writes.some(l => l === 'setItem nd_0')).toBe(true);
  expect(writes.some(l => l === 'setItem nd_meta')).toBe(true);
});
