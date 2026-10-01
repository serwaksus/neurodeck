const { test, expect } = require('@playwright/test');
const config = require('../../config/weekly-modifiers.v1.json');
async function open(page) {
  await page.route('https://telegram.org/**', r => r.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.NDRemoteConfig && window.StrongholdData);
}
test('boot requests real config, applies it and resets builtin', async ({page}) => {
  const request = page.waitForResponse(r => r.url().includes('/config/weekly-modifiers.v1.json'));
  await open(page);
  expect((await request).status()).toBe(200);
  await page.waitForFunction(() => NDTelemetry.ring().some(e => e.n === 'nd_config_apply'));
  expect(await page.evaluate(() => StrongholdData.WEEKLY_MODS_REMOTE)).toEqual(config.modifiers);
  expect(await page.evaluate(() => { NDRemoteConfig.resetWeeklyModifiers(); return StrongholdData.WEEKLY_MODS_REMOTE === undefined; })).toBe(true);
});
for (const reason of ['checksum', 'expired', 'size', 'timeout', 'network']) {
  test('real global fetch fallback: ' + reason, async ({page}) => {
    await open(page);
    await page.evaluate(() => NDRemoteConfig.resetWeeklyModifiers());
    await page.route('**/config/r1-probe.json', async route => {
      if (reason === 'network') return route.abort();
      if (reason === 'timeout') { await new Promise(r => setTimeout(r, 150)); }
      let body = {...config};
      if (reason === 'checksum') body.checksum = 'tampered';
      if (reason === 'expired') body.expires = '2000-01-01T00:00:00Z';
      await route.fulfill({status:200, body: reason === 'size' ? 'x'.repeat(65537) : JSON.stringify(body)}).catch(() => {});
    });
    const result = await page.evaluate(() => NDRemoteConfig.loadWeeklyConfig({url:'config/r1-probe.json', timeout:50}));
    expect(result.reason).toBe(reason);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => StrongholdData.WEEKLY_MODS_REMOTE === undefined)).toBe(true);
  });
}
test('service worker config uses network, not poisoned shell cache; offline falls back', async ({page, context}) => {
  await open(page);
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.evaluate(async () => {
    const cache = await caches.open('nd-shell-v103');
    await cache.put('/config/weekly-modifiers.v1.json', new Response('poisoned'));
  });
  const text = await page.evaluate(async () => (await fetch('/config/weekly-modifiers.v1.json')).text());
  expect(JSON.parse(text)).toEqual(config);
  await context.setOffline(true);
  expect(await page.evaluate(async () => (await fetch('/config/weekly-modifiers.v1.json')).text())).toBe('poisoned');
  await context.setOffline(false);
});
