# Device Certification Matrix (фаза 0 «Trust»)

> Статус: шаблон готов; автоматизируемая часть (Playwright, desktop-эмуляция) заполнена фактами прогона — раздел 6.
> Прогоны на живых устройствах не выполнены (правило 16: физические строки — только владелец).
> Owner: @evgenijsimakov · Создан: 2026-09-29 · Проверять: каждый релизный деплой.
> Дополняет ручной чек-лист: [docs/qa/MANUAL-CHECKLIST.md](../qa/MANUAL-CHECKLIST.md).

Headless-тесты (unit/E2E/visual/chaos) не заменяют живые устройства: Telegram WebView
(iOS WKWebView / Android WebView), ITP-чистка Safari, safe area и реальный FPS
проверяются только здесь. Матрица — обязательный шлюз перед выпуском волны.

## 1. Устройства

| # | Устройство / среда | Обязательно | Заметки |
|---|--------------------|-------------|---------|
| 1 | iPhone Safari (актуальный iOS) | ✅ P0 | базовая веб-сессия |
| 2 | iPhone Telegram (Mini App) | ✅ P0 | основной прод-канал |
| 3 | iPhone PWA («На экран Домой») | ✅ P0 | вывод из-под ITP-чистки |
| 4 | Android Telegram (Mini App) | ✅ P0 | второй по объёму канал |
| 5 | Android Chrome (веб) | ⬜ P1 | дешёвая проверка WebView-различий |
| 6 | Слабый Android (2–3 ГБ RAM) | ⬜ P1 | perf-mode `low` / `eco` |
| 7 | Desktop Chrome + DevTools mobile-эмуляция | ✅ P0 | быстрый дым перед живыми устройствами |
| 8 | Desktop Safari (WebKit-санity) | ⬜ P1 | качественные отличия WebKit |

## 2. Сценарии (каждое устройство)

| # | Сценарий | Что ловит |
|---|----------|-----------|
| S1 | Холодный старт офлайн (SW-кэш) | offline shell, чёрный экран |
| S2 | Холодный старт онлайн | boot-цепочка, старт-колода, `holdStarterDeck` |
| S3 | Выполнение карточки → XP → сохранение | игровой цикл, save latency |
| S4 | Облачный пуш и загрузка (Telegram CloudStorage) | envelope v2: push → meta-last, чек-самма |
| S5 | ITP-чистка: очистить данные сайта, перезапуск | recovery: `tryCloudRecovery`, IDB, бэкапы |
| S6 | Обрыв сети во время пуша | commit-pointer не сдвинут, бейдж offline |
| S7 | Поворот экрана / safe area / notch | layout, перекрытия (P2 из brief) |
| S8 | Крупный системный шрифт 120–200% | переполнения, тапы |
| S9 | Reduced Motion + eco-режим | анимации, живая карта, авто-режим perf |
| S10 | Клавиатура (задачи/редактор карточки) | viewport-resize, фокус |
| S11 | 30-минутная сессия | память, FPS-деградация, нагрев |
| S12 | Обновление SW между версиями (v79→v80 и далее) | смешанных поколений кэша нет |

## 3. Метрики и целевые пороги (baseline — заполнить при первом прогоне)

> Desktop-эмуляция (строка 7 матрицы) замеряется автоматически — факты в разделе 6;
> колонки ниже — только для живых iPhone/Android (правило 16: не выдумывать).

| Метрика | Инструмент | Порог (целевой) | Факт iPhone | Факт Android |
|---------|-----------|-----------------|-------------|--------------|
| Cold boot → интерактив | секундомер/метка `dom_ready` | ≤ 3.5 c | TBD | TBD |
| Выполнение карточки → тост + сохранение | по ощущению | ≤ 1 c | TBD | TBD |
| FPS на живой карте (обычный режим) | скринкаст 60fps / визуально | без рывков ~60 | TBD | TBD |
| FPS живой карты в eco-режиме | визуально | стабильно | TBD | TBD |
| Cloud push (облако, S4) | диагностический журнал | ≤ 5 c | TBD | TBD |
| Cloud push офлайн (S6) | журнал | meta не сдвинут | TBD | TBD |
| Восстановление после ITP (S5) | журнал + скрины | диалог ≤ 5 c, прогресс возвращён | TBD | TBD |
| Память после 30 мин (S11) | Xcode Instruments / Android Profiler | без утечек видимых | TBD | TBD |
| Нагрев/батарея (S11) | по ощущению | без заметного нагрева | TBD | TBD |

## 4. Диагностика на устройстве

Начиная с фазы 0 в консоль WebView можно вывести diag-журнал:

```js
copy(JSON.stringify(NDTelemetry.dump(), null, 2)) // настольный DevTools
JSON.stringify(NDTelemetry.dump())               // мобильный (читать в консоли)
```

Ключевые события: `save_ok`, `cloud_push_ok`, `cloud_push_interrupted`,
`CLOUD_CHECKSUM_MISMATCH`, `recovery_*`, `migration_applied`, `RUNTIME_ERROR`.
Коды и схема: [docs/operations/TELEMETRY.md](../operations/TELEMETRY.md).

## 5. Правило релиза

- P0-устройства (1–4, 7): все сценарии S1–S6 + S9–S10 обязаны пройти.
- Любой провал P0 → фикс или откат деплоя; wave не объявляется выпущенной.
- Baseline-прогон сделать на первом же доступном iPhone и Android, результаты
  вписать в раздел 3 и продублировать в session handoff.

## 6. Автоматизируемая часть (Playwright, desktop-эмуляция — строка 7 матрицы)

Прогон: `npx playwright test tests/e2e/device-matrix.test.js` (входит в `npm run ci`
через `test:e2e`; вёрстка-гейты S7/S8 — `tests/e2e/responsive-gates.test.js`).
Окружение фактов ниже: VPS (Linux, headless Chromium через Playwright), стенд
`localhost:8099`, viewport 390×844, дата 2026-09-30, HEAD 964ed68 (v89).

| Сценарий | Гейт (файл теста) | Факт прогона |
|----------|-------------------|--------------|
| S1 холодный старт офлайн (SW-кэш) | device-matrix | boot из SW-кэша 356 мс до `.app-wrap` (network-first → cache fallback); поколений кэша ровно одно (`nd-shell-v89`); canvas/интерактив живы |
| S2 холодный старт онлайн | device-matrix | 501 мс до `.app-wrap`, метка `dom_ready` телеметрии 189 мс; цель ≤3.5 c ✓ (CI-гейт 8 c — запас на медленный раннер) |
| S2 warm boot (кэш контекста) | device-matrix | 345 мс (холодный в том же контексте 533 мс): warm стабильно быстрее cold |
| S7 короткий viewport (landscape <600h, 667×375) | responsive-gates | deck и strongholds: без горизонтального скролла, нав виден целиком, перекрытий нет |
| S8 крупный шрифт 200% (textZoom×2 эмуляция) | responsive-gates | deck и strongholds: без hscroll/клипов/перекрытий при удвоенном computed font-size |
| S9 Reduced Motion | device-matrix | boot чистый 370 мс; `NeuroDeckPerf.prefersReducedMotion()`=true, `body.reduced-motion` + `html.perf-eco` применены (режим auto → eco-эквивалент), ошибок JS нет |
| S12 обновление SW между версиями | device-matrix | симуляция деплоя v89→v89+suffix: ровно одно поколение кэша через ~2.2 с (skipWaiting→activate чистит старое), controller переключился, офлайн-бут после обновления интерактивен |
| safe-area/notch (часть S7) | responsive-gates | статический контракт `viewport-fit=cover` + `env(safe-area-inset-*)` в наве/шеле; runtime при нулевых инсетах — вёрстка чистая |

Особенность стенда: `playwright.config.js` маппит `telegram.org` в `~NOTFOUND` —
SW-прекэш Telegram SDK рассчитан на недоступность (best-effort try/catch), но
висящее соединение держало SW в `installing`. Маппинг даёт мгновенный отказ —
тот же путь кода, что и реальная недоступность SDK; page-запросы SDK и так
перехватываются `route.abort()` до сети, прочие тесты не затронуты.

Вне автоматизации (только живые устройства): S3–S6 (игровой цикл с реальным
сохранением/облаком, ITP-чистка, обрыв сети во время пуша), S10 (реальная
клавиатура/фокус), S11 (30-мин сессия: память, FPS, нагрев), Telegram WebView
и PWA-инсталляция, реальные safe-area-инсеты и FPS.
