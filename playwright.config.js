const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 10000, toHaveScreenshot: { maxDiffPixels: 500, threshold: 0.2 } },
  fullyParallel: false,
  workers: 1,
  snapshotPathTemplate: '{testDir}/snapshots/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: 'http://localhost:8099',
    headless: true,
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure', // QA-6 п.60: трейсы падений уезжают в test-results/ (upload-artifact в CI)
    launchOptions: {
      args: [
        ...(process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
        '--use-gl=angle',
        // Стенд-сеть: telegram.org с VPS/CI-раннера может висеть (не fast-fail) —
        // sw.js precache-ит SDK best-effort (try/catch), но висящее соединение
        // держит SW в installing. Маппинг в ~NOTFOUND даёт мгновенный ERR_NAME_NOT_RESOLVED —
        // тот же путь кода, что и реальная недоступность SDK. Page-запросы SDK
        // и так перехватываются route.abort() до сети — поведение прочих тестов не меняется.
        '--host-resolver-rules=MAP telegram.org ~NOTFOUND',
      ],
    },
  },
  webServer: {
    command: 'node tests/e2e/serve.cjs',
    url: 'http://localhost:8099',
    reuseExistingServer: false,
    timeout: 10000,
  },
});
