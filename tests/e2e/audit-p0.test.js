// ============================================================
// P0-ХОТФИКС аудита 2026-10-02 — e2e-регрессии (NeuroDeck-audit-2026-10-02.md, разд. 1)
//   1.1 клятва на крови не уничтожает карточку, выполненную вчера (сверка со вчерашним днём, а не с lastDayReset)
//   1.4 эндгейм 20/20 в «осадные» дни (пт–вс МСК): вкладка твердынь не падает (frontIdx() = −1)
//   1.5 импорт/облако: HTML из чужого файла не превращается в разметку; CSP не блокирует штатную работу;
//       фолбэк спрайтов без inline onerror
//   1.2 устаревшее устройство не затирает чужой прогресс в облаке (диалог «Облако изменилось»)
//   1.3 SDK Telegram синхронно: «пустое» устройство видит облако и держит старт-колоду, пока открыт диалог восстановления
// Грабли: playwright сериализует ТОЛЬКО исходник функции addInitScript — данные идут аргументом (один объект).
// Облако — in-memory мок CloudStorage; SDK отдаётся через route() (с задержкой) — как настоящий синхронный <script>.
// ============================================================
const { test, expect } = require('@playwright/test');
const seedSave = require('./seed.cjs');

test.use({ serviceWorkers: 'block' }); // route() на SDK/картинки не должен обходиться service worker-ом

const HOUR = 3600000, DAY = 86400000;

// seed.cjs считает даты от Date.now() — на время вызова подменяем «сейчас» (сид «на момент iso»)
function seedAt(iso, over) {
    const real = Date.now;
    Date.now = () => Date.parse(iso);
    try { return seedSave(over); } finally { Date.now = real; }
}

// Сид localStorage. Только при ПЕРВОМ открытии вкладки: location.reload() (принятие восстановления)
// не должен затирать то, что приложение успело сохранить (sessionStorage переживает reload).
function SEED_IN_PAGE(arg) {
    if (sessionStorage.getItem('__ndSeeded')) return;
    sessionStorage.setItem('__ndSeeded', '1');
    localStorage.clear();
    localStorage.setItem('neurodeck_perf_mode', 'eco');
    localStorage.setItem('neurodeck_onboarding_done', '1');
    if (arg.starterDone !== false) localStorage.setItem('neurodeck_starter_done', '1');
    if (arg.save) {
        localStorage.setItem('neurodeck_full_save', arg.save);
        localStorage.setItem('neurodeck_gen', String(JSON.parse(arg.save).gen || 1));
    }
    Object.keys(arg.ls || {}).forEach((k) => localStorage.setItem(k, arg.ls[k]));
}

// In-memory CloudStorage + Telegram.WebApp. Выполняется в странице (исходник функции уходит в route-скрипт SDK).
function CLOUD_MOCK_IN_PAGE(arg) {
    var store = Object.assign({}, arg.store);
    var log = [];
    var later = function (fn) { setTimeout(fn, arg.latency || 0); };
    var cs = {
        getItem: function (k, cb) { later(function () { cb(null, k in store ? store[k] : ''); }); },
        setItem: function (k, v, cb) { log.push('set ' + k); later(function () { store[k] = String(v); if (cb) cb(null, true); }); },
        removeItem: function (k, cb) { log.push('rm ' + k); later(function () { delete store[k]; if (cb) cb(null, true); }); },
        removeItems: function (ks, cb) { ks.forEach(function (k) { log.push('rm ' + k); }); later(function () { ks.forEach(function (k) { delete store[k]; }); if (cb) cb(null, true); }); },
        getKeys: function (cb) { later(function () { cb(null, Object.keys(store)); }); },
    };
    window.__cloud = { store: store, log: log };
    window.Telegram = { WebApp: { platform: 'ios', version: '8.0', initData: '', initDataUnsafe: {}, CloudStorage: cs,
        ready: function () {}, expand: function () {}, close: function () {}, setHeaderColor: function () {}, setBackgroundColor: function () {},
        onEvent: function () {}, offEvent: function () {} } };
}

// SDK как настоящий <script src> (синхронный, в конце body): отдаём мок через route, опционально — с задержкой
async function serveSdk(page, arg, delayMs) {
    const body = '(' + CLOUD_MOCK_IN_PAGE.toString() + ')(' + JSON.stringify(arg) + ');';
    await page.route('**/telegram-web-app.js', async (route) => {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        await route.fulfill({ status: 200, contentType: 'application/javascript', body });
    });
}

// Облачный конверт v2 без отпечатка: чанки nd_<i> по 4096 + nd_meta {n, t = savedAt, id, sz}
function cloudStore(save, id) {
    const json = JSON.stringify(save);
    const n = Math.ceil(json.length / 4096);
    const store = {};
    for (let i = 0; i < n; i++) store['nd_' + i] = json.slice(i * 4096, (i + 1) * 4096);
    store.nd_meta = JSON.stringify({ n, t: save.savedAt, id, sz: json.length });
    return store;
}

const savedState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('neurodeck_full_save') || 'null'));
const confirmTitle = (page) => page.evaluate(() => {
    const o = document.getElementById('confirmOverlay');
    return o && o.classList.contains('show') ? document.getElementById('confirmTitle').textContent : null;
});

// ------------------------------------------------------------ 1.4 эндгейм в «осадные» дни
test('1.4 эндгейм 20/20 в пятницу (осадная тревога): вкладка твердынь рендерится, ошибок нет', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/telegram-web-app.js', (r) => r.abort());
    const NOW = '2026-10-02T09:00:00Z'; // пятница 12:00 МСК → до осады 2 дня → ветка siegeAlarm (до фикса: STRONGHOLDS[-1].prov → TypeError)
    const s = seedAt(NOW, { throne: 5 });
    s.strongholds.forEach((x) => { x.captured = true; });
    await page.clock.setFixedTime(new Date(NOW));
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(s) });
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.locator('.bnav-btn[data-view="strongholds"]').click();
    await expect(page.locator('#view-strongholds .sh-treasury')).toBeVisible();
    await expect(page.locator('#view-strongholds .sh-context-anchor')).toContainText('Фронт: —');
    await expect(page.locator('#view-strongholds .siege-alarm')).toBeVisible(); // ветка с _frontI действительно выполнена
    expect(errors).toEqual([]);
});

// ------------------------------------------------------------ 1.1 клятва на крови
async function oathScenario(page, lastCompletedDay, lastCompletedAt) {
    const NOW = '2026-09-30T07:00:00Z'; // среда 10:00 МСК; сейв остановился вчера → при загрузке сработает суточный сброс
    const s = seedAt(NOW, { lastDayReset: '2026-09-29', lastWeekReset: '2026-09-28' });
    s.forged[0].lastCompletedAt = lastCompletedAt;
    s.bloodOath = { cardId: 101, cardName: 'Карточка', streak: 2, requiredDays: 5, status: 'active', assignedMonday: '2026-09-28', lastCompletedDay };
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/telegram-web-app.js', (r) => r.abort());
    await page.clock.setFixedTime(new Date(NOW));
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(s) });
    await page.goto('/');
    await page.waitForTimeout(2500);
    return { errors, state: await savedState(page) };
}

test('1.1 клятва: карточка выполнена вчера (вт), сегодня (ср) ещё нет — после суточного сброса клятва и карточка живы', async ({ page }) => {
    const { errors, state } = await oathScenario(page, '2026-09-29', Date.parse('2026-09-29T09:00:00Z'));
    expect(errors).toEqual([]);
    expect(state.forged.some((c) => c.id === 101)).toBe(true); // до фикса: карточка уничтожена
    expect(state.bloodOath && state.bloodOath.status).toBe('active');
    expect(state.bloodOath.streak).toBe(2);
});

test('1.1 клятва: пропущен вчерашний день — карточка по-прежнему уничтожается (проверка не отключена)', async ({ page }) => {
    const { errors, state } = await oathScenario(page, '2026-09-28', Date.parse('2026-09-28T09:00:00Z'));
    expect(errors).toEqual([]);
    expect(state.forged.some((c) => c.id === 101)).toBe(false);
    expect(state.bloodOath).toBeNull();
});

// ------------------------------------------------------------ 1.5 импорт: HTML из файла не становится разметкой
test('1.5 импорт файла: HTML в name/icon/uid/date/quests/oath/event не превращается в разметку и не исполняется', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/telegram-web-app.js', (r) => r.abort());
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(seedSave()) });
    await page.goto('/');
    await page.waitForTimeout(2000);

    const ids = await page.evaluate(() => ({ quest: DQ_POOL[0].id, artifact: Object.keys(ARTIFACTS)[0], day: getMSKDayKey() }));
    const X = (n) => '<img src=x onerror="window.__xss' + n + '=1">';
    const evil = seedSave();
    evil.hero.name = X(7);
    evil.forged[0].name = X(8);
    evil.forged[0].meta = X(8);
    evil.stats = { str: { name: X(1), icon: X(1), color: 'red;" onmouseover="window.__xss1=1', value: 5, max: 100, attributePoints: 1 } };
    evil.xpHistory = [{ date: X(3), xp: 5 }, { date: ids.day, xp: 7 }];
    evil.dailyQuests = { day: ids.day, quests: [{ id: ids.quest, icon: X(2), text: X(2), title: X(2) }], done: {}, progress: {} };
    evil.inventory = { backpack: [{ id: ids.artifact, uid: '"><img src=x onerror="window.__xss4=1">' }], equipped: {}, maxSlots: 30 };
    evil.bloodOath = { cardId: 101, cardName: X(5), status: 'active', streak: 1, requiredDays: 5, assignedMonday: X(5), lastCompletedDay: X(5) };
    evil.dailyEvent = { id: 'evil', icon: X(6), title: X(6), name: X(6), text: X(6), day: ids.day };

    await page.setInputFiles('#syncFileInput', { name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(evil)) });
    await expect(page.locator('#confirmOverlay.show')).toBeVisible();
    await page.locator('#confirmYes').click();
    await page.waitForTimeout(800);
    for (const v of ['strongholds', 'dashboard', 'forge', 'cards', 'stats', 'hero']) { // прогон по вкладкам, если есть (рендер идёт сразу по nd:state-applied)
        const tab = page.locator('.bnav-btn[data-view="' + v + '"]');
        if (await tab.count()) { await tab.click(); await page.waitForTimeout(150); }
    }

    const probe = await page.evaluate(() => ({
        xss: [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => window['__xss' + n] !== undefined),
        handlers: [...document.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => /^on/i.test(a.name))).map((el) => el.tagName),
        injectedImgs: [...document.querySelectorAll('img[src="x"]')].length,
        statName: STATS.str.name, statValue: STATS.str.value,
    }));
    expect(probe.xss).toEqual([]);
    expect(probe.handlers).toEqual([]);
    expect(probe.injectedImgs).toBe(0);
    expect(probe.statName).not.toContain('<'); // имя стата — из кода, не из файла
    expect(probe.statValue).toBe(5); // а числа импортируются штатно
    expect(errors).toEqual([]);
});

// ------------------------------------------------------------ 1.5 CSP: штатная работа без нарушений
test('CSP: загрузка, обход всех вкладок и твердынь — ни одного securitypolicyviolation', async ({ page }) => {
    const consoleCsp = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (/Content Security Policy|violates the following/i.test(m.text())) consoleCsp.push(m.text()); });
    await page.route('**/telegram-web-app.js', (r) => r.abort());
    await page.addInitScript(() => {
        window.__cspv = [];
        document.addEventListener('securitypolicyviolation', (e) => window.__cspv.push(e.violatedDirective + ' <- ' + e.blockedURI));
    });
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(seedSave()) });
    await page.goto('/');
    await page.waitForTimeout(2000);
    const tabs = await page.$$eval('.bnav-btn[data-view]', (els) => els.map((e) => e.dataset.view));
    expect(tabs.length).toBeGreaterThanOrEqual(4);
    for (const v of tabs) { await page.locator('.bnav-btn[data-view="' + v + '"]').click(); await page.waitForTimeout(250); }
    await page.evaluate(() => { renderStrongholds(); renderCards(); renderDashboard(); }); // перерисовка = innerHTML-шаблоны, где жили inline-обработчики
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__cspv)).toEqual([]);
    expect(consoleCsp).toEqual([]);
    expect(errors).toEqual([]);
});

test('1.5 спрайты: упавшая картинка заменяется эмодзи из data-nd-fb без inline onerror', async ({ page }) => {
    await page.route('**/telegram-web-app.js', (r) => r.abort());
    await page.route('**/img/__missing__/*', (r) => r.fulfill({ status: 404, body: 'nope' }));
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(seedSave()) });
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
        const d = document.createElement('div');
        d.id = '__spriteProbe';
        d.innerHTML = shSpriteImg('img/__missing__/a.png', '🏰') + shSpriteImg('img/__missing__/b.png', '<b>&"\'');
        document.body.appendChild(d);
    });
    await expect(page.locator('#__spriteProbe img')).toHaveCount(0);
    const probe = await page.evaluate(() => {
        const d = document.getElementById('__spriteProbe');
        return { text: d.textContent, children: d.children.length };
    });
    expect(probe.text).toBe('🏰<b>&"\''); // эмодзи — текстовым узлом (textContent), а не разметкой
    expect(probe.children).toBe(0);
});

// ------------------------------------------------------------ 1.2 устаревшее устройство не затирает облако
async function staleDeviceScenario(page, withBase) {
    const now = Date.now();
    const local = seedSave();
    local.hero.gold = 10;
    local.savedAt = now - 3 * DAY; // это устройство не открывали 3 дня
    const cloud = seedSave();
    cloud.hero.gold = 99999;
    cloud.forged[0].name = 'Облачная';
    cloud.savedAt = now - HOUR; // за это время другое устройство записало в облако свой прогресс
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await serveSdk(page, { store: cloudStore(cloud, 'REMOTE01'), latency: 5 });
    const ls = withBase ? { nd_cloud_base: JSON.stringify({ id: 'MINE0001', pid: '', t: local.savedAt }) } : {};
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(local), ls });
    await page.goto('/');
    return errors;
}

for (const withBase of [false, true]) {
    test('1.2 устаревшее устройство (' + (withBase ? 'есть база: облако записал не я' : 'легаси, без базы') + '): облако НЕ перезаписывается, спрашиваем', async ({ page }) => {
        const errors = await staleDeviceScenario(page, withBase);
        await expect.poll(() => confirmTitle(page), { timeout: 8000 }).toBe('☁ Облако изменилось');
        await page.waitForTimeout(2500); // пост-бутовые автосохранения, таймер сверки (2.5 с) — всё, что раньше затирало облако
        const cloud = await page.evaluate(() => ({ log: window.__cloud.log.slice(), nd0: window.__cloud.store.nd_0 }));
        expect(cloud.log).toEqual([]); // ни одной записи в облако (до фикса: 99999 заменялось на 10)
        expect(cloud.nd0).toContain('99999');
        const body = await page.evaluate(() => document.getElementById('confirmBody').textContent);
        expect(body).toContain('Облако:');
        expect(body).toContain('Локально:');
        expect(errors).toEqual([]);
    });
}

test('1.2 «Взять облако»: прогресс из облака принят, база обновлена, чужая версия не затёрта', async ({ page }) => {
    await staleDeviceScenario(page, false);
    await expect.poll(() => confirmTitle(page), { timeout: 8000 }).toBe('☁ Облако изменилось');
    await page.locator('#confirmYes').click();
    await expect.poll(async () => (await savedState(page)).hero.gold, { timeout: 5000 }).toBeGreaterThanOrEqual(99999);
    await page.waitForTimeout(1500); // после принятия штатное сохранение может запушить слитый сейв под новым id — база обязана за ним следовать
    const after = await page.evaluate(() => ({
        meta: JSON.parse(window.__cloud.store.nd_meta), nd0: window.__cloud.store.nd_0, base: JSON.parse(localStorage.getItem('nd_cloud_base') || 'null'),
    }));
    expect(after.nd0).toContain('99999'); // чужой прогресс в облаке на месте
    expect(after.base).not.toBeNull();
    expect([after.base.id, after.base.pid]).toContain(after.meta.id); // база = то, что сейчас лежит в облаке (до фикса базы не было вовсе)
});

test('1.2 «Оставить моё»: осознанный выбор перезаписывает облако и становится базой', async ({ page }) => {
    await staleDeviceScenario(page, false);
    await expect.poll(() => confirmTitle(page), { timeout: 8000 }).toBe('☁ Облако изменилось');
    await page.locator('#confirmNo').click();
    await expect.poll(() => page.evaluate(() => window.__cloud.log.includes('set nd_meta')), { timeout: 8000 }).toBe(true);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ meta: JSON.parse(window.__cloud.store.nd_meta), base: JSON.parse(localStorage.getItem('nd_cloud_base') || 'null') }));
    expect(after.meta.id).not.toBe('REMOTE01');
    expect(after.base && after.base.id).toBe(after.meta.id);
});

test('1.2 контроль: устройство в синхроне с облаком (база = версия облака) — диалога нет, локальное изменение уходит в облако', async ({ page }) => {
    const now = Date.now();
    const local = seedSave();
    local.savedAt = now - 2 * HOUR;
    const cloud = seedSave();
    cloud.savedAt = now - 2 * HOUR;
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await serveSdk(page, { store: cloudStore(cloud, 'SAME0001'), latency: 5 });
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(local), ls: { nd_cloud_base: JSON.stringify({ id: 'SAME0001', pid: '', t: cloud.savedAt }) } });
    await page.goto('/');
    await page.waitForTimeout(3500); // загрузка + таймер сверки (2.5 с): в синхроне и без правок — тишина, диалога нет
    expect(await confirmTitle(page)).toBeNull();
    await page.evaluate(() => { HERO.gold += 1; saveGameState(); }); // обычное локальное изменение → штатный автопуш
    await expect.poll(() => page.evaluate(() => window.__cloud.log.includes('set nd_meta')), { timeout: 8000 }).toBe(true);
    expect(await confirmTitle(page)).toBeNull();
    expect(errors).toEqual([]);
});

// ------------------------------------------------------------ 1.3 SDK синхронно + восстановление ⟂ старт-колода
test('1.3 новое устройство: SDK приходит с задержкой — диалог восстановления виден, старт-колода не лезет поверх, облако не затёрто', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const cloud = seedSave();
    cloud.hero.gold = 77777;
    cloud.hero.level = 9;
    cloud.forged[0].name = 'Облачная';
    cloud.savedAt = Date.now() - 2 * HOUR;
    await serveSdk(page, { store: cloudStore(cloud, 'REMOTE02'), latency: 1200 }, 1500); // и SDK медленный, и облако медленное
    await page.addInitScript(SEED_IN_PAGE, { save: null, starterDone: false }); // чистое хранилище: ни сейва, ни флагов
    await page.goto('/');

    await expect.poll(() => confirmTitle(page), { timeout: 10000 }).toBe('☁ Найдено облачное сохранение!');
    // диалог держим дольше 5-секундного fail-safe проверки облака: раньше он снимал блокировку и старт-колода открывалась поверх диалога
    const deckShown = [];
    for (let i = 0; i < 14; i++) {
        deckShown.push(await page.evaluate(() => document.getElementById('starterDeckModal').classList.contains('show')));
        await page.waitForTimeout(500);
    }
    expect(deckShown.some(Boolean)).toBe(false);
    expect(await confirmTitle(page)).toBe('☁ Найдено облачное сохранение!');
    const mid = await page.evaluate(() => ({ log: window.__cloud.log.slice(), nd0: window.__cloud.store.nd_0, local: localStorage.getItem('neurodeck_full_save') }));
    expect(mid.log).toEqual([]); // чистое устройство ничего не пишет в облако
    expect(mid.nd0).toContain('77777');
    expect(mid.local).toBeNull(); // и ничего не сохраняет поверх (старт-колоды нет)

    const reloaded = page.waitForEvent('load');
    await page.locator('#confirmYes').click();
    await reloaded;
    await page.waitForTimeout(2500);
    const after = await savedState(page);
    expect(after.hero.gold).toBeGreaterThanOrEqual(77777);
    expect(after.forged.some((c) => c.name === 'Облачная')).toBe(true);
    expect(await page.evaluate(() => document.getElementById('starterDeckModal').classList.contains('show'))).toBe(false);
    expect(errors).toEqual([]);
});

test('1.3 новое устройство, облако пусто: старт-колода показывается (проверка облака её не блокирует)', async ({ page }) => {
    await serveSdk(page, { store: {}, latency: 5 }, 300);
    await page.addInitScript(SEED_IN_PAGE, { save: null, starterDone: false });
    await page.goto('/');
    await expect(page.locator('#starterDeckModal.show')).toBeVisible({ timeout: 8000 });
});
