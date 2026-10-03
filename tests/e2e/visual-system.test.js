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

test('D1: знак NEURODECK на десктопе — Cinzel (латиница), подпись — фирменный шрифт', async ({ page }) => {
    await boot(page, { width: 1280, height: 800 }); // на телефоне знак скрыт ради компактной шапки
    const fonts = await renderedFonts(page, '.logo');
    expect(fonts, 'знак виден на десктопе').not.toBeNull();
    expect(fonts.share, fonts.fonts).toBeGreaterThanOrEqual(MIN_BRAND_SHARE);
});

// ---------- Шапка и карточка v3 ----------
function seedWithRanks() {
    const s = seedSave();
    const base = s.forged[0];
    s.forged = ['C', 'BBB', 'AA', 'SSS'].map((rank, i) => ({ ...base, id: 101 + i, name: 'Карта ' + rank, rank }));
    s.forgedIdCounter = 300;
    return s;
}
async function bootSeed(page, seed, viewport, fx) {
    await page.setViewportSize(viewport || { width: 390, height: 844 });
    await page.route('**/telegram-web-app.js', (r) => r.abort());
    await page.emulateMedia({ reducedMotion: fx ? 'no-preference' : 'reduce' });
    await page.addInitScript(SEED_IN_PAGE, JSON.stringify(seed));
    if (fx) await page.addInitScript(() => { localStorage.setItem('neurodeck_perf_mode', 'auto'); }); // полные эффекты: иначе eco прячет туман
    await page.addInitScript(() => { localStorage.setItem('nd_force_compact', '1'); }); // в webdriver сжатие шапки выключено по умолчанию
    await page.goto('/');
    await page.waitForSelector('.app-wrap');
    await page.waitForTimeout(2800);
    await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show')); });
}

test('Фаза 1: шапка на телефоне ≤ 100 px, при прокрутке контента сжимается до ≤ 72 px и возвращается', async ({ page }) => {
    await bootSeed(page, seedWithRanks());
    const h = () => page.evaluate(() => Math.round(document.querySelector('.app > .header').getBoundingClientRect().height));
    expect(await h()).toBeLessThanOrEqual(100);
    await page.evaluate(() => { const c = document.querySelector('.content'); const sp = document.createElement('div'); sp.id = 'testSpacer'; sp.style.height = '2000px'; c.appendChild(sp); c.scrollTop = 400; });
    await expect.poll(h).toBeLessThanOrEqual(72);
    await page.evaluate(() => { document.querySelector('.content').scrollTop = 0; });
    await expect.poll(h).toBeLessThanOrEqual(100);
    await expect.poll(async () => (await h()) > 72).toBe(true);
});

test('Фаза 1: подписи нижней навигации — слова, без обрезки и капса; цель нажатия ≥ 44 px', async ({ page }) => {
    await bootSeed(page, seedWithRanks());
    const r = await page.evaluate(() => [...document.querySelectorAll('.bottom-nav .bnav-btn')].map((b) => ({ t: b.textContent.trim(), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height, sw: b.scrollWidth, cw: b.clientWidth, tt: getComputedStyle(b).textTransform })));
    expect(r.map((x) => x.t)).toEqual(['Колода', 'Квесты', 'Герой', 'Реликвии', 'Твердыни', 'Дневник']);
    for (const x of r) { expect(x.h, x.t).toBeGreaterThanOrEqual(44); expect(x.sw, x.t + ' не обрезан').toBeLessThanOrEqual(x.cw + 1); expect(x.tt).toBe('none'); }
});

test('Фаза 2: карточка — печать ранга, материал по рангу, ступень --lvl, действия ≥ 44 px', async ({ page }) => {
    await bootSeed(page, seedWithRanks());
    const info = await page.evaluate(() => {
        const out = {};
        document.querySelectorAll('.cards .card').forEach((c) => {
            const rank = c.querySelector('.card-rank').textContent;
            const cs = getComputedStyle(c);
            out[rank] = { lvl: cs.getPropertyValue('--lvl').trim(), edge: cs.getPropertyValue('--m-edge').trim(), seal: !!c.querySelector('.card-seal'), track: !!c.querySelector('.card-progress-bar') };
        });
        const cb = document.querySelector('.card .card-complete-btn').getBoundingClientRect();
        const sk = document.querySelector('.card .card-skip-btn').getBoundingClientRect();
        return { out, cb: [cb.width, cb.height], sk: [sk.width, sk.height] };
    });
    expect(info.out.C.lvl).toBe('1'); expect(info.out.BBB.lvl).toBe('3'); expect(info.out.AA.lvl).toBe('2'); expect(info.out.SSS.lvl).toBe('3');
    const edges = new Set(Object.values(info.out).map((x) => x.edge));
    expect(edges.size, 'четыре ранга → четыре материала').toBe(4);
    for (const v of Object.values(info.out)) { expect(v.seal).toBe(true); expect(v.track).toBe(true); }
    expect(info.cb[1]).toBeGreaterThanOrEqual(44);
    expect(info.sk[0]).toBeGreaterThanOrEqual(44); expect(info.sk[1]).toBeGreaterThanOrEqual(44);
});

test('Фаза 2: карточка компактна (≤ 160 px при полной ширине телефона), колода начинается на первом экране', async ({ page }) => {
    await bootSeed(page, seedWithRanks());
    const m = await page.evaluate(() => {
        const c = document.querySelector('.cards .card').getBoundingClientRect();
        const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
        return { h: Math.round(c.height), top: Math.round(c.top), navTop: Math.round(nav.top) };
    });
    expect(m.h).toBeLessThanOrEqual(160);
    expect(m.top, 'первая карточка начинается не ниже ~12% высоты экрана до навигации').toBeLessThanOrEqual(m.navTop - 100);
});

test('Фаза 2: на 320 px колода без горизонтального скролла и без перекрытия кнопок карточки', async ({ page }) => {
    await bootSeed(page, seedWithRanks(), { width: 320, height: 640 });
    const r = await page.evaluate(() => {
        const sc = document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth;
        const content = document.querySelector('.content');
        const over = content.scrollWidth - content.clientWidth;
        const card = document.querySelector('.cards .card');
        const cr = card.getBoundingClientRect();
        const kids = [...card.querySelectorAll('.card-complete-btn, .card-skip-btn, .card-btn')].map((b) => b.getBoundingClientRect());
        const outside = kids.filter((k) => k.right > cr.right + 1 || k.left < cr.left - 1).length;
        return { sc, over, outside };
    });
    expect(r.sc).toBeLessThanOrEqual(1); expect(r.over).toBeLessThanOrEqual(1); expect(r.outside).toBe(0);
});

test('Фаза 1: «Приоритет дня» — героическая карточка с печатью и кнопкой ≥ 44 px; плитки-показатели вместо строк', async ({ page }) => {
    await bootSeed(page, seedWithRanks());
    const r = await page.evaluate(() => {
        const t = document.querySelector('#dashboardBar .today');
        const btn = t && t.querySelector('[data-action="complete-card"]');
        return { has: !!t, seal: !!(t && t.querySelector('.card-seal')), h: btn ? btn.getBoundingClientRect().height : 0, tiles: document.querySelectorAll('#dashboardBar .dash-stat').length, inline: document.querySelectorAll('#dashboardBar [style*="padding-right"]').length };
    });
    expect(r.has).toBe(true); expect(r.seal).toBe(true); expect(r.h).toBeGreaterThanOrEqual(44);
    expect(r.tiles).toBeGreaterThanOrEqual(5);
    expect(r.inline, 'inline-стили убраны из дашборда').toBe(0);
});

// ---------- Королевство v3 ----------
test('Фаза 3: «Твердыни» — порядок: казна → карта → фронт → тактика; казна и якорь — чипы на токенах', async ({ page }) => {
    const s = seedWithRanks();
    for (let i = 0; i < 7; i++) s.strongholds[i].captured = true;
    await bootSeed(page, s);
    await page.evaluate(() => document.querySelector('.bnav-btn[data-view="strongholds"]').click());
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
        const root = document.getElementById('strongholdsRoot');
        const q = (sel) => root.querySelector(sel);
        const map = q('.km-node') && q('.km-node').closest('svg');
        const els = { treasury: q('.sh-treasury'), map, front: q('.km-front-card'), stance: q('.km-stance-row') };
        const order = Object.entries(els).filter(([, e]) => e).sort((a, b) => (a[1].compareDocumentPosition(b[1]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).map(([k]) => k);
        const tr = getComputedStyle(els.treasury);
        const anchor = [...root.querySelectorAll('.sh-context-anchor .ctx')].map((c) => c.textContent.trim());
        const btn = q('.sh-assault').getBoundingClientRect();
        return { order, trDisplay: tr.display, anchor, assaultH: btn.height, over: root.scrollWidth - root.clientWidth };
    });
    expect(r.order).toEqual(['treasury', 'map', 'front', 'stance']);
    expect(r.trDisplay).toBe('grid');
    expect(r.anchor.join('|')).toContain('Фронт:');
    expect(r.anchor.join('|')).toContain('Гнев:');
    expect(r.assaultH).toBeGreaterThanOrEqual(44);
    expect(r.over).toBeLessThanOrEqual(1);
});

// ---------- Атмосфера v3 ----------
test('Фаза 4: туман — текстура, а не SVG-фильтры; свет меняется по вкладкам; мир светлеет с числом твердынь', async ({ page }) => {
    const reqs = [];
    page.on('request', (r) => { if (r.url().includes('fog.webp')) reqs.push(r.url()); });
    const poor = seedWithRanks();
    await bootSeed(page, poor, null, true);
    const r = await page.evaluate(() => ({
        svgInMist: document.querySelectorAll('#mistLayer svg, #mistLayer feTurbulence, #mistRect1').length,
        bg: getComputedStyle(document.getElementById('mistLayer'), '::before').backgroundImage,
        light: getComputedStyle(document.documentElement).getPropertyValue('--atmosphere-light').trim(),
    }));
    expect(r.svgInMist).toBe(0);
    expect(r.bg).toContain('fog.webp');
    expect(reqs.length, 'текстура тумана загружена').toBeGreaterThan(0);
    const hues = {};
    for (const v of ['deck', 'strongholds', 'hero', 'inv']) {
        await page.evaluate((vv) => document.querySelector('.bnav-btn[data-view="' + vv + '"]').click(), v);
        hues[v] = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--amb-h').trim());
    }
    expect(new Set(Object.values(hues)).size, 'у каждой вкладки свой оттенок: ' + JSON.stringify(hues)).toBe(4);
    // прогрессия: 0 твердынь → тьма, 10 → светлее
    const rich = seedWithRanks();
    for (let i = 0; i < 10; i++) rich.strongholds[i].captured = true;
    const p2 = await page.context().newPage();
    await p2.route('**/telegram-web-app.js', (x) => x.abort());
    await p2.addInitScript(SEED_IN_PAGE, JSON.stringify(rich));
    await p2.goto('/');
    await p2.waitForTimeout(2500);
    const l2 = await p2.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--atmosphere-light')));
    expect(l2).toBeGreaterThan(Number(r.light || 0));
    expect(l2).toBe(15);
});

// ---------- Слой эффектов ----------
test('Фаза 5: тосты и реплики духа видны поверх интерфейса (раньше их перекрывал .app из-за контекста наложения)', async ({ page }) => {
    await bootSeed(page, seedWithRanks());
    const r = await page.evaluate(async () => {
        showToast('Проверка слоя', 'Тост должен быть сверху', 'save');
        spiritSay('Реплика духа');
        await new Promise((res) => setTimeout(res, 900));
        const top = (id) => { const e = document.getElementById(id); e.style.pointerEvents = 'auto'; /* иначе elementFromPoint пропускает pointer-events:none */ const b = e.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!(hit && (hit === e || e.contains(hit))); };
        return { toast: top('toast'), spirit: top('spiritMsg'), parents: ['toast', 'spiritMsg', 'lvlBanner', 'rankupBanner', 'lvlOverlay', 'rankupOverlay', 'tooltip'].map((id) => document.getElementById(id).parentElement === document.body) };
    });
    expect(r.toast, 'тост — верхний элемент в своей точке').toBe(true);
    expect(r.spirit, 'реплика духа — верхний элемент').toBe(true);
    expect(r.parents.every(Boolean), 'слой эффектов — на уровне body, вне .app-wrap').toBe(true);
});

// ---------- Доступность (фаза 7) ----------
test('Фаза 7: цели нажатия ≥ 44 px на всех вкладках (мелкие иконки — с расширенной зоной ::after), у фокуса есть видимая рамка', async ({ page }) => {
    await bootSeed(page, seedWithRanks());
    const small = [];
    for (const v of ['deck', 'quests', 'hero', 'inv', 'strongholds', 'stats']) {
        await page.evaluate((vv) => document.querySelector('.bnav-btn[data-view="' + vv + '"]').click(), v);
        await page.waitForTimeout(500);
        const bad = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('button,a[href],[role=button],input,select,textarea').forEach((e) => {
                const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
                if (!r.width || !r.height || cs.visibility === 'hidden' || cs.pointerEvents === 'none' || e.closest('.modal-overlay:not(.show)')) return;
                const hit = getComputedStyle(e, '::after').content !== 'none';
                if ((r.width < 44 || r.height < 44) && !(hit && r.width >= 24 && r.height >= 24)) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
            });
            return out;
        });
        bad.forEach((b) => small.push(v + ': ' + b));
    }
    expect(small, 'цели < 44 px').toEqual([]);
    await page.evaluate(() => document.querySelector('.bnav-btn[data-view="deck"]').click());
    const noRing = [];
    await page.keyboard.press('Tab');
    for (let i = 0; i < 40; i++) {
        const r = await page.evaluate(() => {
            const e = document.activeElement; if (!e || e === document.body) return null;
            const cs = getComputedStyle(e); const b = e.getBoundingClientRect();
            return { n: String(e.id || e.className || e.tagName), vis: b.width > 0, ol: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, bs: cs.boxShadow !== 'none' };
        });
        if (r && r.vis && !r.ol && !r.bs) noRing.push(r.n);
        await page.keyboard.press('Tab');
    }
    expect(noRing, 'элементы без рамки фокуса').toEqual([]);
});

test('Фаза 5: церемонии — один баннер за раз, затемнение фона, видны и при reduced-motion; шёпот духа на подложке', async ({ page }) => {
    await bootSeed(page, seedWithRanks()); // reduced-motion
    await page.evaluate(() => { onLevelUp(); triggerRankUpEffect(FORGED[0], 'C', 'CC', 100, 100); });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
        const vis = (id) => { const cs = getComputedStyle(document.getElementById(id)); return cs.display !== 'none' && parseFloat(cs.opacity) > 0.5; };
        const lvl = document.getElementById('lvlBanner');
        const sp = getComputedStyle(document.getElementById('spiritMsg'));
        return { lvl: vis('lvlBanner'), rank: vis('rankupBanner'), scrim: getComputedStyle(lvl).boxShadow, spiritBg: sp.backgroundColor, spiritBorder: sp.borderTopStyle };
    });
    expect(r.lvl, 'первая церемония видна и при reduced-motion').toBe(true);
    expect(r.rank, 'вторая церемония не накладывается на первую (о ней сообщает тост)').toBe(false);
    expect(r.scrim, 'баннер затемняет фон').toMatch(/\d+px 0px 0px \d{3,}px|0px 0px 0px \d{3,}px/);
    expect(r.spiritBg).not.toBe('rgba(0, 0, 0, 0)');
});
