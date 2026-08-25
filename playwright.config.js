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
    launchOptions: {
      args: [...(process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []), '--use-gl=angle'],
    },
  },
  webServer: {
    command: 'node tests/e2e/serve.cjs',
    url: 'http://localhost:8099',
    reuseExistingServer: false,
    timeout: 10000,
  },
});
