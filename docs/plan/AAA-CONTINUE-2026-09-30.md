# План автономного продолжения AAA-дорожной карты NeuroDeck (30.09.2026)

> Этот файл — рабочий контракт для автономной ZCode-сессии на VPS. Выполняй пакеты по порядку.
> Каноничные источники: AGENTS.md (правила репо), docs/design/CAMPAIGN-2.0.md (следующий большой пакет),
> docs/operations/TELEMETRY.md (схема диагностики), docs/qa/DEVICE-MATRIX.md (живые устройства — вне скоупа автономии).

## Статус на момент передачи (v81, HEAD 8b3f33f, CI EXIT:0)

Выполнено пакетами, все с зелёным полным `npm run ci`:
1. Фаза 0 «Trust»: js/telemetry.js (локальный diag ring buffer, без сети), Cloud envelope v2
   (nd_meta = commit-pointer {n,t,c,id,sz}, c = 2×FNV-1a 64-bit, loadCloudChunks сверяет), device-matrix док.
2. Today Loop 2.0 шаг 1: панель «Приоритет дня» в renderDashboard (pickTodayCard/todayKingdomLine/renderTodayPriority).
3. Economy: tools/sim-economy.cjs (6 сценариев × 3 сида × 90 дней на реальном stronghold-model, гейты G1–G6,
   подключён в npm run ci); ревизия daysToSiegeNow (штурм = воскресная ночь; Вс→0 … Сб→1; тесты в today-panel).
4. State-store шаг 1: js/event-bus.js (NDDBus), storage.js БОЛЬШЕ НЕ зовёт UI напрямую —
   эмитит "nd:state-applied", подписка в конце app.js; a11y-фикс бейджа Клятв (P2); docs/design/CAMPAIGN-2.0.md.

## ОЧЕРЕДЬ (делай по порядку, пакет = ветка работ + полный CI + commit)

### Пакет A — Campaign 2.0, шаг C1 (см. docs/design/CAMPAIGN-2.0.md §1 и §6)
- В каталоге stronghold-data.js: поля branch ("safe"|"war"|"trade") и next (массив id) для 20 твердынь
  (заполни согласованно: линейный порядок по умолчанию, развилки в пров. 2 и 4).
- В stronghold-model.js: tradeRoutesGraph(flags, edges) — подсчёт маршрутов по графу; tradeRoutes()
  (по индексам) оставить как фоллбэк/совместимость.
- Обновить эталон manualRoutes в tools/qa-economy-parity.cjs ТОЛЬКО если меняется семантика подсчёта
  (при линейном дефолте результаты должны совпасть 1:1 — parity 216/216 обязан остаться зелёным).
- В tools/sim-economy.cjs добавить сценарий «Ветвление» или расширить «Дисциплину» выбором ветки —
  гейты не должны ослабнуть.
- Юнит-тесты: tests/campaign-graph.test.js (граф: развилки, циклы запрещены, next ссылается только на соседей).
- Гейт: полный npm run ci EXIT:0 → commit "feat: campaign 2.0 C1 — branching map schema + graph trade routes".

### Пакет B — Campaign 2.0, шаг C3: правила провинций
- PROVINCES в stronghold-data.js (4 записи, см. CAMPAIGN-2.0.md §2), модификаторы — чистые функции
  в stronghold-model.js (incomeMult/upkeepMult/siegeMult), юнит-тесты на каждый.
- Интеграция в app.js — минимальная (один вызов модификатора в расчетах дохода/содержания), UI-текст правила в панели Твердынь.
- Гейт: полный ci → commit.

### Пакет C — документация
- docs/strongholds-v2/README.md: устранить дубли BALANCE.md и прочерченный ART_MANIFEST.md (он существует).
- Найти судьбу ENDGAME.md (упомянут в docs/session-handoff/SESSION-2026-09-28.md, в репо отсутствует) —
  поиск по git log/архивам; если не найден — пометить в README strongholds-v2 как утраченный, содержимое
  восстановить конспектом из ссылок (T8–T9, zh8/zh9).
- Гейт: ci → commit "docs: strongholds-v2 index cleanup, endgame doc status".

## ЖЁСТКИЕ ПРАВИЛА (нарушение = провал всей автономии)

1. Тесты только на VPS, только ПОСЛЕДОВАТЕЛЬНО (порт 8099); параллельные npm run ci запрещены.
2. НЕ запускать pkill -f "serve.cjs" (убивает собственную ssh/tmux-сессию); если сервер завис —
   pkill -f "[s]erve.cjs".
3. Пины: изменение любого js/css → синхронно ?v= в index.html И VERSION в sw.js (прекэш-лист) И
   контракты счётчика пинов (tests/verify-ui-assets.cjs и tests/wave3.test.js — сейчас ×11).
4. Контракты, которые НЕЛЬЗЯ молча менять: regression-T5M1 (ключ nd_0), wave-g2 (фазы боссов 2/день,
   weatherTaxMult=3), ux-first-day (isBeginner-ветвление, holdStarterDeck), qa-economy-parity (формулы SPEC),
   storage-v8 (миграции), recovery-cloud (pushCloudChunks: meta последним, t=savedAt снапшота).
5. Сейв-схема: v11 заморожена; новые поля состояния — только через новую миграцию + sanitize в state-guards.
6. Все вызовы между слоями — typeof-гварды (extract-харнессы тестов тянут функции поодиночке).
7. Телеметрия: typeof ndTel/ndTelErr; приватность — ничего по сети.
8. После каждого пакета: полный `npm run ci`; при EXIT=0 — git commit (осмысленное сообщение) и
   `git push origin main` (деплой GitHub Pages). Пуш только после зелёного ci.
9. СТОП-УСЛОВИЕ: два подряд падения ci на одной и той же ошибке → прекратить работу,
   записать отчёт в docs/session-handoff/SESSION-VPS-AUTO-<дата>.md (что сделано, что упало, гипотезы),
   commit + push отчёта.
10. Продолжать до исчерпания очереди A→B→C. Не начинать UI-переработки вне C1–C3 (визуальные базлайны
    и живые устройства — вне автономного скоупа).

## Как проверить прогресс (владельцу)

    ssh vps
    tmux ls && tmux attach -t ndgoal      # живая сессия (выход Ctrl-b d)
    tail -f /root/zcode-cli/ndgoal.log
    cd /root/neurodeck && git log --oneline -10
