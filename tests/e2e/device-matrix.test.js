// ============================================================
// P4 — DEVICE-MATRIX: автоматизируемая часть (desktop Chrome
// эмуляция, headless). Замеры и факты для docs/qa/DEVICE-MATRIX.md
// (раздел Automation); физические устройства — только владельцу
// (правило 16 контракта очереди №3).
//
// Здесь НЕ визуальные снапшоты — тайминги и поведенческие контракты:
//  • S2  cold boot → интерактив (метка dom_ready телеметрии + .app-wrap);
//  •     warm boot (HTTP-кэш того же контекста) — факт для матрицы;
//  • S1  офлайн-старт из SW-кэша (SW включён override-ом webdriver:
//        index.html:1502 не регистрирует SW под automation);
//  • S12 SW-update v89→v90: ровно одно поколение кэша, офлайн-бут жив;
//  • S9  reduced-motion: boot + eco-эквивалент (NeuroDeckPerf).
// Шрифт 200% и короткий viewport — гейты P2 (responsive-gates.test.js),
// в матрице цитируются ими.
//
// Пороги таймингов — из целевых порогов матрицы (≤ 3.5 c) с запасом
// на медленный CI-раннер: гейт 8 c ловит регрессии, факт в матрицу
// пишется фактическим числом прогона (значительно ниже порога).
// ============================================================

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');

const SW_VERSION_PREFIX = 'nd-shell-';
// Тестовая «следующая» версия для S12: реальный VERSION из sw.js с суффиксом,
// чтобы не зависеть от номера текущего деплоя.
const SW_NEXT_SUFFIX = '-update-probe';

// index.html не регистрирует SW при navigator.webdriver=true; для честного
// прохождения прод-ветки регистрации включаем её override-ом.
const ENABLE_SW = () => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
};

const BOOT_GATE_MS = 8000; // CI-гейт (целевой порог матрицы 3.5 c — см. док)

test.beforeEach(async ({ page }) => {
  await page.route('**/telegram-web-app.js', route => route.abort());
});

async function bootToInteractive(page) {
  // Возврат: { wrapMs, domReadyMs } — мс от navigation start до .app-wrap
  // и до метки dom_ready из телеметрии (если она уже записана).
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('.app-wrap', { timeout: BOOT_GATE_MS });
  const wrapMs = Math.round(await page.evaluate(() => performance.now()));
  const domReadyMs = await page.evaluate(() => {
    try {
      const dump = window.NDTelemetry && window.NDTelemetry.dump();
      const ev = dump && Array.isArray(dump.events) && dump.events.find((e) => e.n === 'dom_ready');
      if (!ev || typeof ev.t !== 'number' || !performance.timeOrigin) return null;
      return Math.round(ev.t - performance.timeOrigin);
    } catch (e) { return null; }
  });
  return { wrapMs, domReadyMs };
}

// Ждём активный SW + заполненный precache-кэш текущей версии.
async function waitForShellCache(page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect
    .poll(() => page.evaluate(() => caches.keys().then((k) => k.filter((n) => n.startsWith('nd-shell-')))), { timeout: 15000 })
    .not.toEqual([]);
  return page.evaluate(() => caches.keys().then((k) => k.filter((n) => n.startsWith('nd-shell-'))));
}

// --- S2: cold/warm boot до интерактива --------------------------------------
test.describe('boot timings (S2)', () => {
  test('cold boot → интерактив: .app-wrap + метка dom_ready телеметрии', async ({ page }) => {
    const { wrapMs, domReadyMs } = await bootToInteractive(page);
    console.log(`[device-matrix] S2 cold boot → .app-wrap: ${wrapMs} ms (dom_ready: ${domReadyMs} ms)`);
    expect(wrapMs, 'cold boot обязан укладываться в CI-гейт').toBeLessThan(BOOT_GATE_MS);
    // метка из матрицы (инструмент «метка dom_ready») обязана писаться
    expect(domReadyMs, 'телеметрия обязана записать dom_ready с таймстампом').not.toBeNull();
    expect(domReadyMs).toBeLessThan(BOOT_GATE_MS);
  });

  test('warm boot (кэш контекста) → интерактив, не медленнее холодного', async ({ page }) => {
    const cold = await bootToInteractive(page);
    const warm = await bootToInteractive(page); // тот же контекст: статика из HTTP-кэша
    console.log(`[device-matrix] S2 warm boot → .app-wrap: ${warm.wrapMs} ms (cold в этом же контексте: ${cold.wrapMs} ms)`);
    expect(warm.wrapMs, 'warm boot обязан укладываться в CI-гейт').toBeLessThan(BOOT_GATE_MS);
    expect(warm.wrapMs, 'warm boot не должен быть медленнее холодного (+50 мс допуск джиттера)')
      .toBeLessThanOrEqual(cold.wrapMs + 50);
  });
});

// --- S9: reduced motion ------------------------------------------------------
test.describe('reduced motion (S9)', () => {
  test('prefers-reduced-motion: boot чистый, eco-эквивалент применён', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { wrapMs } = await bootToInteractive(page);
    console.log(`[device-matrix] S9 reduced-motion boot → .app-wrap: ${wrapMs} ms`);
    const applied = await page.evaluate(() => ({
      prm: !!(window.NeuroDeckPerf && window.NeuroDeckPerf.prefersReducedMotion()),
      bodyClass: document.body.classList.contains('reduced-motion'),
      perfEco: document.documentElement.classList.contains('perf-eco'),
      mode: document.body.getAttribute('data-perf-mode'),
      motionOk: (typeof ndMotionOk === 'function') ? ndMotionOk() : null, // P22: гейт game-feel секвенций
    }));
    console.log('[device-matrix] S9 perf-состояние:', JSON.stringify(applied));
    // дефолтный режим auto → prm=true обязан вырасти в eco-эквивалент (правило 19)
    expect(applied.mode).toBe('auto');
    expect(applied.prm, 'prefersReducedMotion() обязан true при системном reduce').toBe(true);
    expect(applied.bodyClass, 'тело обязано получить класс reduced-motion (CSS-гейты анимаций)').toBe(true);
    expect(applied.perfEco, 'documentElement обязан получить perf-eco (eco-эквивалент)').toBe(true);
    expect(applied.motionOk, 'P22: ndMotionOk() обязан закрыться при reduce (секвенции не играют)').toBe(false);
    // P22: обратная сторона гейта — без reduce и вне eco секвенции разрешены
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(150); // mql-change слушатель perf.js применяет классы асинхронно
    expect(await page.evaluate(() => (typeof ndMotionOk === 'function') ? ndMotionOk() : null)).toBe(true);
    expect(errors.filter((e) => !e.includes('favicon') && !e.includes('Telegram'))).toEqual([]);
    expect(wrapMs).toBeLessThan(BOOT_GATE_MS);
  });
});

// --- S1 + S12: service worker (офлайн-старт и обновление) --------------------
test.describe('service worker (S1/S12)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(ENABLE_SW);
  });

  test('S1: офлайн-старт — shell из SW-кэша, приложение интерактивно', async ({ page }) => {
    await page.goto('/');
    const gens = await waitForShellCache(page);
    console.log('[device-matrix] S1 поколения кэша после precache:', JSON.stringify(gens));

    await contextOffline(page, true);
    const t0 = Date.now();
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('.app-wrap', { timeout: BOOT_GATE_MS });
    const offlineMs = Date.now() - t0;
    console.log(`[device-matrix] S1 офлайн cold-boot → .app-wrap: ${offlineMs} ms (SW network-first → cache fallback)`);
    // никаких сетевых ошибок не должно упасть в рендер: приложение живо и рисует
    await expect(page.locator('#particles')).toBeVisible();
    await contextOffline(page, false);
  });

  test('S12: SW-update на стенде — одно поколение кэша, офлайн-бут после обновления жив', async ({ page }) => {
    await page.goto('/');
    const firstGen = await waitForShellCache(page);
    expect(firstGen.length).toBe(1);

    // Симуляция нового деплоя: кладём на стенд sw.js следующей версии
    // (тот же скрипт, VERSION+суффикс) и обновляем регистрацию по НОВОМУ url —
    // это реальный путь обновления: install нового SW → skipWaiting → activate
    // удаляет старые кэши. Browser-internal update-check перехватывать route'ом
    // нельзя, поэтому файл на стенде (поэтому же — cleanup в afterEach).
    const swSource = await fs.promises.readFile(path.join(REPO_ROOT, 'sw.js'), 'utf8');
    const currentVersion = (swSource.match(/VERSION = '(nd-shell-[^']+)'/) || [])[1];
    expect(currentVersion, 'sw.js обязан объявлять VERSION nd-shell-*').toBeTruthy();
    const nextVersion = currentVersion + SW_NEXT_SUFFIX;
    const nextSource = swSource.split(`'${currentVersion}'`).join(`'${nextVersion}'`);
    expect(nextSource).not.toBe(swSource);
    const probePath = path.join(REPO_ROOT, 'sw-update-probe.js');
    await fs.promises.writeFile(probePath, nextSource);

    const t0 = Date.now();
    await page.evaluate(() => navigator.serviceWorker.register('sw-update-probe.js'));
    // install (precache ~20 файлов) → skipWaiting → activate удаляет старые кэши:
    // в конце обязано остаться ровно одно поколение — нового SW.
    await expect
      .poll(() => page.evaluate(() => caches.keys()), { timeout: 20000 })
      .toEqual([nextVersion]);
    console.log(`[device-matrix] S12 SW-update ${currentVersion} → ${nextVersion}: кэш ровно одного поколения (${Date.now() - t0} мс)`);

    // Клиент уже под новым контроллером (activate → clients.claim)
    const controllerUrl = await page.evaluate(() =>
      navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL);
    expect(controllerUrl, 'после activate+claim страницей обязан управлять новый SW').toContain('sw-update-probe.js');

    // Обновлённый shell целен: офлайн-бут работает и после обновления (нет смеси поколений)
    await contextOffline(page, true);
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('.app-wrap', { timeout: BOOT_GATE_MS });
    console.log('[device-matrix] S12 офлайн-бут после обновления: интерактивен');
    await contextOffline(page, false);
  });

  test.afterEach(async () => {
    // стенд-файл симуляции деплоя не должен переживать тест
    await fs.promises.rm(path.join(REPO_ROOT, 'sw-update-probe.js'), { force: true });
  });
});

// context.setOffline у Playwright живёт на контексте; хелпер для симметрии
async function contextOffline(page, offline) {
  await page.context().setOffline(offline);
}
