/* NeuroDeck service worker (волна 3, 2026-09-28):
   — precache app-shell: холодный старт офлайн и при флапающем pages.github.io;
   — network-first для навигации (свежий index.html при сети), cache-first для версионированной статики (?v=);
   — PWA-исключение из 7-дневной ITP-чистки Safari при установке на «экран Домой».
   При новом деплое: бампни ?v= в index.html И VERSION ниже — старый кэш удалится в activate. */
'use strict';

const VERSION = 'nd-shell-v133';
const SHELL = [
  './',
  'index.html',
  'css/style.css?v=133',
  'fonts/fonts.css?v=133',
  'fonts/cinzel-var.woff2',
  'fonts/Philosopher-400-cyrillic.woff2',
  'fonts/Philosopher-400-latin.woff2',
  'fonts/Philosopher-700-cyrillic.woff2',
  'fonts/Philosopher-700-latin.woff2',
  'fonts/Alegreya-cyrillic.woff2',
  'fonts/Alegreya-latin.woff2',
  'fonts/Alegreya-italic-cyrillic.woff2',
  'fonts/Alegreya-italic-latin.woff2',
  'js/perf.js?v=133',
  'js/perf-compat.js?v=133',
  'js/event-bus.js?v=133',
  'js/audio.js?v=133',
  'js/telemetry.js?v=133',
  'js/stronghold-data.js?v=133',
  'js/state-guards.js?v=133',
  'js/storage.js?v=133',
  'js/stronghold-model.js?v=133',
  'js/state/store.js?v=133',
  'js/remote-config.js?v=133',
  'js/ui/strongholds.js?v=133',
  'config/weekly-modifiers.v1.json',
  'js/app.js?v=133',
  'manifest.json',
  'img/fog.webp',
  'img/icon-192.png',
  'img/icon-512.png'
];
const TG_SDK = 'https://telegram.org/js/telegram-web-app.js';
const NAV_TIMEOUT_MS = 4000;

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
    // сеть первая — новый деплой подхватывается без ручного обновления; но не дольше NAV_TIMEOUT_MS:
    // на «флапающем» github.io запрос может висеть десятки секунд — тогда отдаём кэш, а ответ сети
    // всё равно обновит кэш в фоне (аудит R2 M8)
    const net = fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put('index.html', copy)).catch(() => {});
      return res;
    });
    net.catch(() => {}); // отложенный отказ после таймаута не должен быть unhandled rejection
    const timed = new Promise((_, reject) => setTimeout(() => reject(new Error('nav timeout')), NAV_TIMEOUT_MS));
    e.respondWith(
      Promise.race([net, timed]).catch(() =>
        caches.match('index.html').then((r) => r || caches.match('./')).then((r) => r || net)
      )
    );
    return;
  }

  if (url.origin !== location.origin && url.href !== TG_SDK) return; // прочие кросс-домены не трогаем

  // удалённый конфиг (config/*.json) без ?v= — сеть первая, кэш как офлайн-фоллбэк (аудит R2 M6):
  // cache-first закрепил бы первую скачанную версию навсегда
  if (url.origin === location.origin && /\/config\/[^/]+\.json$/.test(url.pathname)) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || Response.error()))
    );
    return;
  }

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
      }).catch(() => Response.error()); // не index.html: подмена MIME ломала бы разбор CSS/JS (аудит R2 L12)
    })
  );
});
