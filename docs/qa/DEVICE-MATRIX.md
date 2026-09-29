# Device Certification Matrix (фаза 0 «Trust»)

> Статус: шаблон готов, прогоны на живых устройствах не выполнены.
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
