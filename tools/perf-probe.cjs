// tools/perf-probe.cjs — Г5-Ф: перф-проба fps main (замена утерянного board2/perf-harness.cjs; DETERMINISTIC_INIT как в visual-тестах)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let consoleErrors = 0;
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors++; });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('neurodeck_onboarding_done', '1');
    localStorage.setItem('neurodeck_starter_done', '1');
  });
  await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    (function tick() {
      n++;
      const dt = performance.now() - t0;
      if (dt < 5000) requestAnimationFrame(tick);
      else res(n / (dt / 1000));
    })();
  }));
  console.log(JSON.stringify({ fps: Math.round(fps * 10) / 10, consoleErrors }));
  await browser.close();
})().catch((e) => { console.error('PROBE_FAIL', e.message); process.exit(1); });
