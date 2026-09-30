# План №3 — полный roadmap до production-ready (01.10.2026)

> Рабочий контракт автономной очереди. Старт: HEAD 9de0a22 (v88, CI EXIT=0, parity 217/217 честно, chaos 29/29).
> Действуют правила 1–15 из docs/plan/AAA-CONTINUE-2026-09-30.md и AAA-CONTINUE-2-2026-09-30.md + правила 16–22 ниже.
> Каноничные источники: AGENTS.md, docs/design/CAMPAIGN-2.0.md, docs/qa/DEVICE-MATRIX.md, docs/operations/TELEMETRY.md.

## ПРАВИЛА 16–22 (добавка, обязательны)
16. Физические строки DEVICE-MATRIX (живые iPhone/Android) — только владельцу. НЕ выдумывать данные;
    автоматизируемая часть (Playwright-эмуляция) заполняется фактами прогона.
17. Прод-бот neurodeck-bot.service: НЕ модифицировать и НЕ рестартовать. Новые сервисы — только
    отдельные unit-файлы, с документированным rollback.
18. Схема сейва сейчас v13. Миграция v14 разрешена ТОЛЬКО в пакете P11; бамп ровно на 1,
    миграция + sanitize + обновления storage-v8/regression-qa3 обязательны.
19. Каждое UI-изменение: reduced-motion/eco-эквивалент + typeof-гварды (extract-харнесы тянут функции поодиночке).
20. Аудио: без автозапуска до первого взаимодействия; музыка по умолчанию выключена, SFX — тихо.
21. Ноль новых npm-зависимостей и фреймворков — только vanilla JS + существующий Playwright.
22. OWNER-пункты (нужны продуктовые решения владельца) — НЕ кодить: писать предложение в финальный отчёт.
    Стоп-условия прежние: два подряд одинаковых падения CI → отчёт в docs/session-handoff/ и стоп.

## ОЧЕРЕДЬ P1–P23 (строго по порядку; пакет = работы + полный npm run ci + commit + push)

### P1 — Расширенные браузерные гейты (tests/e2e/campaign-flows.test.js)
Выбор цели развилки (модалка: открыть/подтвердить/отменить); boss reward-choice (артефакт, disabled
венец при cap 5, pending reward после reload); weekly modifier 19/20 скрыт / 20/20 виден и меняет доход;
покупка тарана/лестниц и списание после штурма; approach preview до/после подхода.
Commit: "test: extended browser gates for campaign flows (C2/C4/C5/C6)".

### P2 — Visual/адаптив: дрфт 318px и extended-набор в CI
Найти причину дрфта deck-view ~318px (погодный блок), починить по существу; обновить базлайны
tab-deck-mobile/tablet (осознанно, причина в commit); safe-area/notch (viewport-fit + env()), короткий
viewport (landscape <600 высоты), шрифт 200% — Playwright-проверки отсутствия перекрытий и
горизонтального скролла. Commit: "fix: deck drift + responsive gates, extended visual in CI".

### P3 — Аудит advisory-скипов
bot-unit host-state (2 skip) и draft bot-polling-unit (pollOnce/ND_BOT_PATH): либо включить с корректными
стабами, либо честно задокументировать в самом тесте, почему скип легитимен. Ноль молчаливых skip.
Commit: "test: advisory skips audit — enabled or documented".

### P4 — DEVICE-MATRIX автоматизируемая часть
Playwright-замеры: cold/warm boot (до интерактива), офлайн-старт (SW-кэш), reduced-motion, font 200%,
короткий viewport, SW-update симуляция на стенде. Заполнить автоматизируемые колонки фактами в
docs/qa/DEVICE-MATRIX.md (раздел Automation). Физические строки — TBD (правило 16).
Commit: "docs: device matrix automation results (desktop emulation)".

### P5 — Подключить provinceSiegeMult
Применить в weekly siege тик + siege preview + parity-эталоны (осознанный repin с комментарием) +
юнит-тест равенства preview/tick + строка правила провинции в панели Твердынь. Правило 14: не молча.
Commit: "feat: provinceSiegeMult wired into siege tick/preview (+parity repin)".

### P6 — Объяснимость экономики
Брейкдауны/тултипы: здания (текущая→после, цена, окупаемость, upkeep-дельта) и штурм (ratio, worst-case
потери по attrition-формуле, эффект подхода/ресурсов) — переиспользовать существующие preview-функции;
source-тесты + 1 браузерный. Commit: "feat: economy explainability (building/siege breakdowns)".

### P7 — Коррупция по-человечески
Прогноз «до руины N дн.» в панели; emergency maintenance (оплата upkeep×2 → лечение на ступень —
через существующую механику оплаты); причина разрушения в тосте; rebuild-скидка 25% на восстановление
worn/ruin (чистая функция + тест). Плейтесты strongholds не меняются (дефолт прежний).
Commit: "feat: corruption care (forecast, emergency maintenance, reason, rebuild discount)".

### P8 — Симуляция: горизонты и эндгейм
tools/sim-economy.cjs: прогон 180/365 дней, prestige-цикл, эндгейм с модификаторами, метрика роста
сейва (оценка снапшота vs порог 160 чанков). Старые гейты не ослаблять. Commit: "test: economy sim horizons (180/365d, prestige, endgame, save-size)".

### P9 — Branch UX полировка
Доступные/недоступные цели (disabled-состояния), тултипы safe/war/trade с последствиями, aria-атрибуты;
браузерный тест на disabled. Commit: "feat: branch targets UX (states, tooltips, a11y)".

### P10 — Панель подготовки осады (консолидация)
Разведка-статус, подход недели, ресурсы, preview до/после, «рискованно»-подтверждение при ratio<1.2,
отмена подготовки до тика. Только из существующих функций, без новых полей состояния.
Commit: "feat: siege preparation panel consolidated".

### P11 — Миграция v14: персистентный подход недели
siege.approach в схеме (sanitize + миграция v13→v14, дефолт "assault"), UI уважает сохранённый выбор,
обновить storage-v8/regression-qa3. Commit: "feat: persistent weekly approach; schema v14".

### P12 — Boss flow e2e
Открытие модалки, intro-лор ровно один раз, фазовый переход, reward-choice, reload → pending reward
предлагается снова. Commit: "test: boss flow browser e2e".

### P13 — Weekly modifier UI e2e
19/20 скрыт и не применяется; 20/20 виден; доход/upkeep/preview соответствуют тику (браузерно).
Commit: "test: weekly modifier UI e2e (19/20 vs 20/20)".

### P14 — Weekly score (детерминированный)
Чистая функция: захваты, потери гарнизона, нулевые дни, восстановление после риска; показ при 20/20
в панели сезона; юнит-тесты. Commit: "feat: weekly endgame score (deterministic)".

### P15 — C6-full static: versioned remote config
config/weekly-modifiers.v1.json (+ schema, version, checksum, expires), лоадер с валидацией и безопасным
фоллбэком на встроенный каталог; тесты: валидный/битый/просроченный/tampered → fallback.
Commit: "feat: versioned remote config for endgame modifiers (safe fallback)".

### P16 — C6-full service: минимальный read-only сервис
Новый юнит nd-config.service (localhost:8095): versioned config + opt-in telemetry ingestion (токен из
env-файла; клиентский экспорт DEFAULT OFF). Прод-бота не трогать (правило 17). Runbook
docs/operations/CONFIG-SERVICE.md с rollback. Commit: "feat: minimal config/telemetry service (isolated unit)".

### P17 — Characterization-тесты ядра
Зафиксировать текущее поведение stronghold/economy/siege чистых потоков (extract-харнесы на реальные
функции app.js/stronghold-model) как базу рефакторинга P18–P20. Commit: "test: characterization suite for state-store refactor".

### P18 — State Store 2.0 шаг 1: stronghold reducer
js/state/store.js + commands + stronghold reducer поверх существующих данных; app.js читает stronghold
через адаптер (поведение неизменно, characterization зелёные). Commit: "feat: state store step 1 (stronghold reducer)".

### P19 — Шаг 2: economy+siege reducers, селекторы; storage-адаптер
Снапшот strongholds/army/siege собирается из стора (поля схемы v14 без изменений).
Commit: "feat: state store step 2 (economy/siege reducers, storage adapter)".

### P20 — Шаг 3: UI-подписки по доменам; вынос stronghold-UI модуля
Рендеры твердынь — отдельный файл js/ui/strongholds.js (app.js худеет), подписки через NDDBus;
visual-базлайны не меняются. Commit: "refactor: stronghold UI module + domain subscriptions".

### P21 — Аудио-микшер
Категории master/music/ui/siege/reward; громкости/мьюты в localStorage (без изменения схемы), секция в
модалке настроек; существующие тоны разнесены по категориям; правило 20. Commit: "feat: audio mixer (categories, volumes, mutes, settings)".

### P22 — Game feel + бюджеты
Reward reveal (секвенция 0.5–2с, гейты reduced-motion/eco), анимация подготовки осады, haptics-матрица;
проверка perf-бюджета в существующем perf-тесте. Commit: "feat: reward reveal + siege prep animation (motion-gated)".

### P23 — Социалка (дизайн) + финальный отчёт
docs/design/SOCIAL.md (общий фронт без PvP: weekly community goal, rival-репорты, opt-in кооп; требует
backend — только предложение, правило 22). Итоговый отчёт docs/session-handoff/SESSION-VPS-AUTO-2026-10-01.md:
все коммиты, финальные счётчики, открытые хвосты, OWNER-вопросы (физическая device-сертификация,
соц-backend, продуктовые решения IA), rollback-заметки. Commit: "docs: social design + final handoff 2026-10-01".

## ФИНАЛ
Последний полный ci перед отчётом обязан быть зелёным. Очередь считается выполненной, когда P1–P23
закоммичены с зелёным ci и запушены.
