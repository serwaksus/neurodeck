// ============================================================
// Аудит 2026-10-02, раунд 2 — e2e-регрессии сохранности данных:
//   M3 резерв IndexedDB: предлагается при загрузке и не затирается пустым сейвом при закрытии
//   M4 старт-колода не перекрывает диалог импорта по ссылке на новом устройстве
//   M5 откат импорта: точка отката + кнопка в окне «Синхронизация»
// Грабли те же, что в audit-p0: данные в addInitScript — одним аргументом, сид один раз на вкладку.
// ============================================================
const { test, expect } = require('@playwright/test');
const seedSave = require('./seed.cjs');

test.use({ serviceWorkers: 'block' });

function SEED_IN_PAGE(arg) {
    if (sessionStorage.getItem('__ndSeeded')) return;
    sessionStorage.setItem('__ndSeeded', '1');
    localStorage.clear();
    localStorage.setItem('neurodeck_perf_mode', 'eco');
    localStorage.setItem('neurodeck_onboarding_done', '1');
    if (arg.starterDone !== false) localStorage.setItem('neurodeck_starter_done', '1');
    if (arg.save) { localStorage.setItem('neurodeck_full_save', arg.save); localStorage.setItem('neurodeck_gen', '1'); }
}

test.beforeEach(async ({ page }) => {
    await page.route('**/telegram-web-app.js', (r) => r.abort());
});

const idbCards = (page) => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('neurodeck_db', 1);
    r.onsuccess = (e) => {
        try {
            const g = e.target.result.transaction('saves', 'readonly').objectStore('saves').get('latest');
            g.onsuccess = () => res(g.result && g.result.data && g.result.data.forged ? g.result.data.forged.length : 0);
            g.onerror = () => res(-1);
        } catch (err) { res(-2); }
    };
    r.onerror = () => res(-3);
}));
const ui = (page) => page.evaluate(() => {
    const o = document.getElementById('confirmOverlay'), sd = document.getElementById('starterDeckModal'), yes = document.getElementById('confirmYes');
    let top = null;
    if (o.classList.contains('show')) { const r = yes.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); top = el ? (el.id || (el.closest('[id]') || {}).id) : null; }
    return { confirm: o.classList.contains('show') ? document.getElementById('confirmTitle').textContent : null, starter: sd.classList.contains('show'), top, forged: FORGED.length };
});

test('M3: localStorage пуст, карточки в IndexedDB → при загрузке предлагается восстановление, старт-колода ждёт', async ({ page }) => {
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(seedSave()) });
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.evaluate(() => saveGameState());
    await page.waitForTimeout(400);
    expect(await idbCards(page)).toBe(1);
    // имитация ITP-чистки: localStorage стёрт, IDB жив; сохранение на выгрузке подавляем
    await page.evaluate(() => { window.saveGameState = function () {}; window.forceCloudSave = function () {}; localStorage.clear(); });
    await page.goto('/');
    await expect.poll(async () => (await ui(page)).confirm, { timeout: 5000 }).toContain('IndexedDB');
    expect((await ui(page)).starter, 'старт-колода не перекрывает диалог').toBe(false);
    await page.waitForTimeout(1500);
    const st = await ui(page);
    expect(st.starter, 'и через 1.5 с старт-колода всё ещё ждёт ответа игрока').toBe(false);
    expect(st.top, 'кнопка диалога доступна для клика').toBe('confirmYes');
    await page.evaluate(() => document.getElementById('confirmYes').click());
    await expect.poll(() => page.evaluate(() => FORGED.length)).toBe(1);
});

test('M3: закрыли приложение, не ответив на диалог — резерв IndexedDB не затёрт пустым сейвом', async ({ page, context }) => {
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(seedSave()) });
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.evaluate(() => saveGameState());
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.saveGameState = function () {}; window.forceCloudSave = function () {}; localStorage.clear(); });
    await page.goto('/');
    await expect.poll(async () => (await ui(page)).confirm, { timeout: 5000 }).toContain('IndexedDB');
    // закрытие вкладки: здесь штатные pagehide/beforeunload пишут пустой снапшот
    await page.close({ runBeforeUnload: true });
    const p2 = await context.newPage();
    await p2.route('**/telegram-web-app.js', (r) => r.abort());
    await p2.goto('/');
    await p2.waitForTimeout(800);
    expect(await idbCards(p2), 'карточка в резерве жива').toBe(1);
});

test('M3: явное удаление последней карточки и полный вайп очищают резерв (нет «зомби»-восстановления)', async ({ page }) => {
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(seedSave()) });
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.evaluate(() => saveGameState());
    await page.waitForTimeout(400);
    expect(await idbCards(page)).toBe(1);
    await page.evaluate(() => deleteCard(FORGED[0].id));
    await page.evaluate(() => document.getElementById('confirmYes').click());
    await page.waitForTimeout(600);
    expect(await idbCards(page), 'после удаления последней карточки резерв пуст').toBe(0);
});

test('M4: новый девайс + ссылка с прогрессом — диалог импорта сверху, старт-колода не показывается поверх', async ({ page }) => {
    const save = seedSave();
    const hash = Buffer.from(JSON.stringify(save), 'utf8').toString('base64');
    await page.addInitScript(SEED_IN_PAGE, { starterDone: false });
    await page.goto('/#' + hash);
    await expect.poll(async () => (await ui(page)).confirm, { timeout: 5000 }).toContain('Данные из ссылки');
    await page.waitForTimeout(2200); // дольше 0.9 c таймера старт-колоды
    const st = await ui(page);
    expect(st.starter, 'старт-колода ждёт ответа на импорт').toBe(false);
    expect(st.top, 'над кнопкой подтверждения — сам диалог').toBe('confirmYes');
    await page.evaluate(() => document.getElementById('confirmYes').click());
    await expect.poll(() => page.evaluate(() => FORGED.length)).toBe(1);
    expect((await ui(page)).starter, 'после импорта старт-колода не нужна').toBe(false);
});

test('M4: #confirmOverlay лежит выше остальных модалок (z-index)', async ({ page }) => {
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(seedSave()) });
    await page.goto('/');
    await page.waitForTimeout(1200);
    const z = await page.evaluate(() => ({ c: +getComputedStyle(document.getElementById('confirmOverlay')).zIndex, s: +getComputedStyle(document.getElementById('starterDeckModal')).zIndex }));
    expect(z.c).toBeGreaterThan(z.s);
});

test('M5: импорт файлом сохраняет точку отката; «Вернуть состояние до импорта» возвращает прежние карточки', async ({ page }) => {
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(seedSave()) });
    await page.goto('/');
    await page.waitForTimeout(1200);
    const foreign = seedSave();
    foreign.forged = [{ ...foreign.forged[0], id: 301, name: 'Чужая карточка' }, { ...foreign.forged[0], id: 302, name: 'Чужая вторая' }];
    foreign.forgedIdCounter = 400;
    await page.evaluate(() => openSyncModal());
    expect(await page.locator('#undoImportSection').isVisible(), 'до импорта откатывать нечего').toBe(false);
    await page.setInputFiles('#syncFileInput, input[type=file]', { name: 'x.ndsync', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(foreign)) });
    await page.evaluate(() => document.getElementById('confirmYes').click());
    await expect.poll(() => page.evaluate(() => FORGED.map((c) => c.name).join('|'))).toBe('Чужая карточка|Чужая вторая');
    await page.evaluate(() => openSyncModal());
    await expect(page.locator('#undoImportSection')).toBeVisible();
    await page.locator('[data-action="undo-import"]').click();
    await expect.poll(() => page.evaluate(() => FORGED.map((c) => c.name).join('|'))).toBe('Карточка');
    expect(await page.evaluate(() => localStorage.getItem('neurodeck_pre_import')), 'точка отката использована').toBeNull();
});

test('M6: на загрузке реально запрашивается config/weekly-modifiers.v1.json и каталог применяется', async ({ page }) => {
    const asked = [];
    page.on('request', (r) => { if (r.url().includes('weekly-modifiers')) asked.push(r.url()); });
    await page.addInitScript(SEED_IN_PAGE, { save: JSON.stringify(seedSave()) });
    await page.goto('/');
    await expect.poll(() => asked.length, { timeout: 5000 }).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => !!(window.StrongholdData && window.StrongholdData.WEEKLY_MODS_REMOTE)), { timeout: 5000 }).toBe(true);
});
