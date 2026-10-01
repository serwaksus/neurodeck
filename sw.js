/* NeuroDeck service worker (волна 3, 2026-09-28):
   — precache app-shell: холодный старт офлайн и при флапающем pages.github.io;
   — network-first для навигации (свежий index.html при сети), cache-first для версионированной статики (?v=);
   — PWA-исключение из 7-дневной ITP-чистки Safari при установке на «экран Домой».
   При новом деплое: бампни ?v= в index.html И VERSION ниже — старый кэш удалится в activate. */
'use strict';

const VERSION = 'nd-shell-v94';
const SHELL = [
  './',
  'index.html',
  'css/style.css?v=93',
  'fonts/fonts.css?v=93',
  'fonts/cinzel-var.woff2',
  'fonts/CrimsonText-400.woff2',
  'fonts/CrimsonText-400i.woff2',
  'fonts/CrimsonText-600.woff2',
  'js/perf.js?v=93',
  'js/perf-compat.js?v=93',
  'js/event-bus.js?v=93',
  'js/telemetry.js?v=93',
  'js/stronghold-data.js?v=93',
  'js/state-guards.js?v=93',
  'js/storage.js?v=93',
  'js/stronghold-model.js?v=93',
  'js/app.js?v=93',
  'manifest.json',
  'img/icon-192.png',
  'img/icon-512.png'
];
const TG_SDK = 'https://telegram.org/js/telegram-web-app.js';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // по одному, а не addAll: одна упавшая ссылка не должна хоронить весь shell
    await Promise.all(SHELL.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch((err) => console.warn('[sw] precache miss:', url, String(err)))
    ));
    try { await cache.add(TG_SDK); } catch (err) {} // SDK Telegram — для офлайн-перезапуска в клиенте TG
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    // сеть первая — новый деплой подхватывается без ручного обновления
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  if (url.origin !== location.origin && url.href !== TG_SDK) return; // прочие кросс-домены не трогаем

  // статика (в т.ч. версионированная ?v=) — cache-first
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./'));
    })
  );
});
