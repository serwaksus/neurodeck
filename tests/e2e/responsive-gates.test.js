// ============================================================
// P2 — Responsive-гейты: safe-area/notch, короткий viewport
// (landscape <600 высоты), шрифт 200%. Проверки отсутствия
// перекрытий и горизонтального скролла (не снапшоты — контракты).
//
// Эмуляция шрифта 200%: CDP не умеет font-scale/textZoom, а приложение
// px-типографика (rem бы масштабировался сам). Честный эквивалент
// Android textZoom=2 для ЛЕЙАУТА — инлайн-удвоение computed font-size
// каждого элемента (пады/бордеры не трогаем — textZoom их тоже не трогает).
//
// Safe-area: в headless env(safe-area-inset-*) = 0, поэтому гейт =
// статический контракт (viewport-fit=cover в meta, env() в наве/шеле —
// «не выпилить») + runtime-проверка, что при нулевых инсетах ничего
// не перекошено и нав не вылезает за экран.
// ============================================================

const { test, expect } = require('@playwright/test');
const seedSave = require('./seed.cjs');

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

async function bootAndOpenView(page, view) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(SEED_IN_PAGE, JSON.stringify(seedSave()));
  await page.clock.setFixedTime(new Date('2026-09-15T10:00:00Z'));
  await page.goto('/');
  await page.waitForTimeout(3000);
  await page.waitForSelector('.app-wrap', { timeout: 5000 });
  await page.waitForTimeout(2300); // понедельничная стена модалок — закрыть как пользователь
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show')); });
  await page.locator(`.bnav-btn[data-view="${view}"]`).click();
  await page.waitForTimeout(400);
  await page.evaluate(() => document.fonts.ready);
}

// Сбор нарушений вёрстки в контексте страницы: hscroll, клипы текста,
// выход за правый край, перекрытия соседей в дашборде и наве.
const COLLECT_VIOLATIONS = () => {
  const bad = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1) {
    bad.push('hscroll +' + (doc.scrollWidth - window.innerWidth) + 'px');
  }
  const nav = document.querySelector('.bottom-nav');
  if (nav && getComputedStyle(nav).display !== 'none') {
    const nr = nav.getBoundingClientRect();
    if (nr.bottom > window.innerHeight + 1) bad.push('nav за нижним краем');
    if (nr.height / window.innerHeight > 0.45) bad.push('nav выше 45% экрана (' + Math.round(nr.height) + 'px)');
    nav.querySelectorAll('.bnav-btn').forEach((b) => {
      if (b.scrollWidth > b.clientWidth + 2) bad.push('nav-кнопка clipped: ' + (b.textContent || '').trim().slice(0, 10));
    });
  }
  // nowrap-чипы и все кнопки: текст не должен резаться внутри своего бокса.
  // clip-флаг ставим только при реальном клиппинге (overflow hidden/clip):
  // при overflow:visible spill не режется — его ловит проверка правого края ниже.
  document.querySelectorAll('.dash-chip, .gold-chip, .siege-pill, button').forEach((el) => {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return; // скрытые не считаются
    const cs = getComputedStyle(el);
    if (/(hidden|clip)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2) {
      bad.push('clip: ' + (el.textContent || el.title || el.className || 'btn').trim().slice(0, 20));
    }
    // Легитимные внутренние горизонтальные скроллеры (UX-паттерн) — их детей не флагаем
    let inScroller = false, p = el.parentElement;
    while (p && p !== document.body) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) { inScroller = true; break; }
      p = p.parentElement;
    }
    if (inScroller) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > window.innerWidth + 2) {
      bad.push('за правым краем: ' + (el.textContent || el.title || el.className || 'btn').trim().slice(0, 20));
    }
  });
  // перекрытия Flow-соседей в дашборде и наве (абсолютные оверлеи — легитимны, скипаем)
  [document.getElementById('dashboardBar'), document.querySelector('.bottom-nav')].forEach((c) => {
    if (!c) return;
    const kids = [...c.children].filter((k) => {
      const cs = getComputedStyle(k);
      return cs.position !== 'absolute' && k.getBoundingClientRect().height > 3;
    });
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect();
        const b = kids[j].getBoundingClientRect();
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 2 && oy > 2) {
          bad.push('перекрытие: ' + (kids[i].textContent || '').trim().slice(0, 10) + ' / ' + (kids[j].textContent || '').trim().slice(0, 10));
        }
      }
    }
  });
  return bad;
};

// --- 1. Safe-area / notch: статический контракт + runtime при нулевых инсетах ---
test.describe('safe-area contract', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('viewport-fit=cover в meta, env()-инсеты в наве и шеле приложения', async ({ page, request }) => {
    const html = await (await request.get('/index.html')).text();
    expect(html, 'meta viewport обязан держать viewport-fit=cover (notch-устройства)').toContain('viewport-fit=cover');
    const css = await (await request.get('/css/style.css')).text();
    // нав: нижний инсет (-home-indicator) и боковые (landscape-notch)
    const navRule = css.match(/\.bottom-nav\s*\{[^}]*\}/g) || [];
    const navCss = navRule.join('\n');
    expect(navCss, '.bottom-nav обязан учитывать env(safe-area-inset-bottom)').toContain('env(safe-area-inset-bottom)');
    expect(navCss, '.bottom-nav обязан учитывать боковые инсеты (landscape-notch)').toContain('env(safe-area-inset-left)');
    // шел приложения: боковые инсеты, чтобы контент не уходил под чёлку в landscape
    const appRules = css.match(/\.app\s*\{[^}]*\}/g) || [];
    const appCss = appRules.join('\n');
    expect(appCss, '.app обязан учитывать боковые safe-area-инсеты').toContain('env(safe-area-inset-left)');
  });

  test('runtime: при нулевых инсетах нав внутри экрана, вёрстка чистая', async ({ page }) => {
    await bootAndOpenView(page, 'deck');
    const bad = await page.evaluate(COLLECT_VIOLATIONS);
    expect(bad).toEqual([]);
  });
});

// --- 2. Короткий viewport: landscape <600 высоты ---
test.describe('short viewport (landscape <600h)', () => {
  test.use({ viewport: { width: 667, height: 375 } });

  for (const view of ['deck', 'strongholds']) {
    test(`${view}: без hscroll, нав виден целиком, перекрытий нет`, async ({ page }) => {
      await bootAndOpenView(page, view);
      const bad = await page.evaluate(COLLECT_VIOLATIONS);
      expect(bad).toEqual([]);
    });
  }
});

// --- 3. Шрифт 200%: эмуляция textZoom×2 (двойной computed font-size) ---
test.describe('font 200% (textZoom×2 emulation)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const view of ['deck', 'strongholds']) {
    test(`${view}: без hscroll и перекрытий при удвоенном шрифте`, async ({ page }) => {
      await bootAndOpenView(page, view);
      await page.evaluate(() => {
        // Удваиваем computed font-size КАЖДОГО элемента (одним проходом по t0 —
        // без компаундинга: читаем px до правки, пишем 2×). Инлайновая правка
        // сильнее CSS-правил, поэтому макет пересчитывается честно.
        document.querySelectorAll('body, body *').forEach((el) => {
          const px = parseFloat(getComputedStyle(el).fontSize);
          if (Number.isFinite(px) && px > 0) el.style.fontSize = px * 2 + 'px';
        });
      });
      await page.waitForTimeout(150); // reflow
      const bad = await page.evaluate(COLLECT_VIOLATIONS);
      expect(bad).toEqual([]);
    });
  }
});
