# QA-Infra отчёт — NeuroDeck

**Дата:** 2026-09-15 · **Роль:** QA-Infra · **HEAD:** `679dbbb` · **Кэш-пины:** `?v=59`
**Артефакты:** `/tmp/opencode/qa-infra/` (e2e-скрипт, JSON-результаты, probes, pages.html)
**Ограничения соблюдены:** продукт не изменён; systemd-сервисы не перезапускались; /etc не изменялся; npm run ci не запускался.

---

## Чек-лист

### 1. Кэш-пины (index.html) — PASS
- 8 ссылок с `?v=`: style.css, perf.js, perf-compat.js, stronghold-data.js, state-guards.js, storage.js, stronghold-model.js, app.js — **все `?v=59`**, версия едина.
- Все 8 файлов существуют на диске.
- Внешние ссылки: Google Fonts (preconnect ×2 + stylesheet, `display=swap`), `telegram-web-app.js` (без пина — внешний, корректно).
- **Отказ сети (route abort, fail-fast):** не блокирует — приложение грузится.
- ⚠️ **Slow-hang сеть — БЛОКИРУЕТ, см. находку P2-1.**

### 2. Бот (/opt/neurodeck-bot, neurodeck-bot.service) — PASS c находкой
- `systemctl status`: **active (running)**, uptime 5h56m, restart counter 5 (исторический, сейчас стабилен).
- `systemd-analyze verify neurodeck-bot.service` → **exit 0** (единственный warning — про `xray.service`, не наш юнит).
- Юнит-тесты `tests/bot-unit.test.js` (node --test): **5/5 pass** (включая «token never committed», «restart policy and token env wired»).
- Токен: `/etc/neurodeck-bot/token.conf` → **600, neurodeck-bot:neurodeck-bot**; в git отсутствует: `git log --all -- '*.conf'` пусто, rg паттерна Telegram-токена `[0-9]{8,10}:[A-Za-z0-9_-]{30,}` по репо (вкл. hidden, без node_modules) — 0 совпадений.
- Юнит-файл `/etc/systemd/system/neurodeck-bot.service` == repo `bot/neurodeck-bot.service` (in sync).
- ⚠️ **Drift `polling.js` (P2-2):** `/opt/neurodeck-bot/polling.js` ≠ `bot/polling.js` — в проде старый текст напоминания, см. находки.

### 3. Telegram-деградация — PASS
Условия: `route abort '**/telegram-web-app.js'` + abort Google Fonts (эмуляция отсутствия сети), viewport 390×844, fresh storage.
- `.app-wrap` загрузился; `window.Telegram` действительно отсутствует.
- Все 6 вкладок (deck/quests/hero/inv/strongholds/stats) открываются через `bottom-nav .bnav-btn` (на 390px сайдбар-навигация скрыта by design, `css/style.css:491`).
- Сейв работает: `saveGameState()` → `neurodeck_full_save` v=9 записан.
- Стартер-модалка (accept) и onboarding-overlay («⚔ Начать!») закрываются без Telegram API (проверено probe2/probe3).
- **0 pageerror** за сессию; критических console.error нет (только ожидаемые `net::ERR_FAILED` от abort-ов).
- ⚠️ Slow-hang сценарий — см. P2-1.

### 4. Perf-цепочки — PASS (с уточнением механики)
Переключение через syncModal (`#perfAutoBtn` / `#perfLowBtn` / `#perfOffBtn`, `data-action="set-perf"`):
- Авто→**Экономный (low)**: `:root.perf-eco` ✓, `body.low-effect` + `body.reduced-motion` ✓, `data-perf-mode=low` ✓, LS `neurodeck_perf_mode=low` ✓, animation-duration 0.01ms ✓, dustCanvas скрыт ✓.
- **Без эффектов**: `body.effects-off` ✓, `data-perf-mode=effects-off` ✓, dust `display:none` ✓.
- Возврат в **Авто**: `perf-eco`/`effects-off` сняты ✓, LS очищен ✓, dust восстановлен ✓; анимации восстановлены ✓.
- `perfStatus` корректен: «Активно: auto · low-effect».
- 0 pageerror при переключениях.
- **Уточнение:** класса `:root.perf-low` НЕ существует (ни в perf.js, ни в style.css) — low-режим выражается через `body.low-effect` + `:root.perf-eco`. См. P3-2.
- Наблюдение: в auto на этой VM (2 ядра) срабатывает lowSpec-автодетект → `body.low-effect` остаётся — **by design** (`perf.js: _detectLowSpec`, cores<4), perfStatus честно отражает.

### 5. GitHub Pages смоук — PASS
- URL из remote: `https://serwaksus.github.io/neurodeck/`
- `curl --proxy socks5h://127.0.0.1:1080 -sI` → **HTTP/2 200**, last-modified 2026-09-15 15:09 UTC (свежий деплой).
- В HTML ровно **8× `?v=59`**, все совпадают с локальным index.html (включая `js/app.js?v=59`).

---

## Находки

### P1 — нет

### P2-1: Внешние ресурсы блокируют загрузку приложения при «висящей» сети
- **Что:** `telegram-web-app.js` подключён синхронно (`index.html:1379`, без `async/defer`), Google Fonts stylesheet — в `<head>` (`index.html:13`). При мгновенном отказе сети (offline) всё работает (проверено). Но при **медленном зависании** запроса (типично для RF без прокси: telegram.org / fonts.googleapis.com могут висеть на TCP-таймаутах) JS-бут приложения не происходит: `data-perf-mode` не выставляется, `document.readyState='loading'` ≥ 12 с — пользователь видит статичный «мёртвый» экран до таймаута fetch.
- **Доказательство:** probes 8–10 (`/tmp/opencode/qa-infra/`): route-hang 60s на telegram-web-app.js или на fonts → JS boot отсутствует 12+ с; abort (fail-fast) → boot 0.4–1.0 с. GoToF(DCL) без маршрутов — timeout 20 c.
- **Рекомендация (dev, не QA):** `async` для telegram-web-app.js (app.js уже толерантен к отсутствию `window.Telegram`); для fonts — паттерн `media="print" onload="this.media='all'"` / preload+onload, либо self-host.
- **Приоритет P2:** реальный сценарий для части RF-пользователей Telegram Mini App; при fail-fast (полный offline) не воспроизводится.

### P2-2: Drift прода бота от репозитория (старый текст напоминания в проде)
- **Что:** `/opt/neurodeck-bot/polling.js:91` содержит старый `REMINDER_TEXT` («…твердыен капают…» — с опечаткой), репозиторий `bot/polling.js:91` — новый исправленный («Твои твердыни накопили налоги…»). Рестарт для деплоя QA-Infra запрещён — накопился drift.
- **Доказательство:** `diff /root/neurodeck/bot/polling.js /opt/neurodeck-bot/polling.js` → 1 блок (REMINDER_TEXT).
- **Рекомендация:** при следующем согласованном рестарте `neurodeck-bot` задеплоить `bot/polling.js` из HEAD; рассмотреть drift-guard тест (аналог юнит-файла).

### P3-1: Опечатка «твердыен» в проде
- Присутствует только в живом тексте напоминания на `/opt` (в repo уже исправлена) — закрывается вместе с P2-2.

### P3-2: Класс `:root.perf-low` не существует
- Роль/доки описывают `perf-eco/perf-low`; фактически `:root` получает только `perf-eco` (все reduce-режимы), low-специфика — на `body.low-effect`. Работает корректно, но внутренняя документация расходится с реализацией — синхронизировать доку (`qa-infra.md`, скиллы) или ввести класс.

### P3-3 (наблюдение): restart counter=5 у neurodeck-bot
- Исторические рестарты (сейчас 5h56m stable). Причина не выяснялась (вне мандата — логи ротированы). Мониторить при следующем QA.

---

## SKIP-пометки
- **SKIP-infra: нет.** Все 5 шагов протокола выполнены; прокси, Pages, бот и порт 8850 были доступны.

## Окружение проверки
- Сервер QA: `/tmp/opencode/qa-infra/serve8850.cjs` (порт 8850, root=/root/neurodeck, копия e2e serve.cjs — прод не тронут).
- E2E: `/tmp/opencode/qa-infra/qa-infra.e2e.cjs` — 20 проверок (18 PASS / 2 FAIL=strictness-ассерты auto+lowSpec, переквалифицированы в PASS-by-design, см. §4), результаты: `e2e-results.json`.
