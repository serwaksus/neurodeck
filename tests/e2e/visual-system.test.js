// ============================================================
// Визуальная система (план docs/plan/VISUAL-MAX-2026-10-02.md): не пиксели, а контракты —
// фирменные шрифты на кириллице, шкала размеров, токены, z-index. Грабли: CDP getPlatformFontsForNode
// возвращает ФАКТИЧЕСКИ отрисованные шрифты (а не объявленные в CSS) — так и поймали, что кириллица уходила в системные.
// ============================================================
const { test, expect } = require('@playwright/test');
const seedSave = require('./seed.cjs');

test.use({ serviceWorkers: 'block' });

function SEED_IN_PAGE(seed) {
    localStorage.clear();
    localStorage.setItem('neurodeck_onboarding_done', '1');
    localStorage.setItem('neurodeck_starter_done', '1');
    localStorage.setItem('neurodeck_perf_mode', 'eco');
    localStorage.setItem('neurodeck_full_save', seed);
}
const BRAND = ['Philosopher', 'Alegreya', 'Cinzel'];
// Символы вроде ⚔ и эмодзи рисуются шрифтом ОС (в фирменных шрифтах таких глифов нет; их вытесняют SVG-иконки, фаза 0.5),
// поэтому проверяем ДОЛЮ глифов: текст обязан быть фирменным, а не «система кое-где».
const MIN_BRAND_SHARE = 0.8;

async function boot(page, viewport) {
    if (viewport) await page.setViewportSize(viewport);
    await page.route('**/telegram-web-app.js', (r) => r.abort());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(SEED_IN_PAGE, JSON.stringify(seedSave()));
    await page.goto('/');
    await page.waitForSelector('.app-wrap');
    await page.waitForTimeout(2800);
    await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show')); });
    await page.evaluate(() => document.fonts.ready);
}

async function renderedFonts(page, selector) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const q = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!q.nodeId) return null;
    const f = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: q.nodeId });
    const total = f.fonts.reduce((a, x) => a + x.glyphCount, 0) || 1;
    const brand = f.fonts.filter((x) => BRAND.includes(x.familyName)).reduce((a, x) => a + x.glyphCount, 0);
    return { share: brand / total, fonts: f.fonts.map((x) => x.familyName + '×' + x.glyphCount).join(', ') };
}

const NODES = {
    'знак NEURODECK': '.logo',
    'заголовок вкладки': '#view-deck .view-title',
    'имя карточки': '.card .card-name',
    'кнопка «Выполнить»': '.card [data-action="complete-card"], .card .card-btn.complete, .card button',
    'подпись навигации': '.bnav-btn[data-view="strongholds"]',
    'число казны': '#goldChipVal',
};

test('D1: кириллица во всех ключевых узлах рисуется фирменными шрифтами, а не системными', async ({ page }) => {
    await boot(page);
    for (const [label, sel] of Object.entries(NODES)) {
        const fonts = await renderedFonts(page, sel);
        expect(fonts, label + ': узел найден (' + sel + ')').not.toBeNull();
        expect(fonts.share, label + ': ' + fonts.fonts).toBeGreaterThanOrEqual(MIN_BRAND_SHARE);
    }
});

test('D1: заголовок модалки и поля форм — фирменные шрифты', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openForge());
    for (const sel of ['#forgeModal .modal-header h3', '#forgeModal .form-input', '#forgeModal .modal-footer .demo-btn.primary']) {
        const fonts = await renderedFonts(page, sel);
        expect(fonts, sel).not.toBeNull();
        expect(fonts.share, sel + ': ' + fonts.fonts).toBeGreaterThanOrEqual(MIN_BRAND_SHARE);
    }
});

test('D1: кнопки и поля наследуют шрифт страницы (не UA-Arial)', async ({ page }) => {
    await boot(page);
    const bad = await page.evaluate(() => {
        const fam = (el) => getComputedStyle(el).fontFamily;
        const out = [];
        document.querySelectorAll('button, input, select, textarea').forEach((el) => {
            const f = fam(el);
            if (/arial|system-ui|sans-serif$/i.test(f) && !/Alegreya|Philosopher|Cinzel/.test(f)) out.push((el.id || el.className || el.tagName) + ' → ' + f);
        });
        return out.slice(0, 8);
    });
    expect(bad).toEqual([]);
});

test('D1: цифры — «ровные» (lining), счётчики — tabular', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
        body: getComputedStyle(document.body).fontVariantNumeric,
        gold: getComputedStyle(document.getElementById('goldChipVal')).fontVariantNumeric,
    }));
    expect(r.body).toContain('lining-nums');
    expect(r.gold).toContain('tabular-nums');
});
