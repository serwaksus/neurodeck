# Lead-draft — сводный QA-отчёт «Твердыни v2» (ФАЗА 1, черновик)

**QA-Lead** · 2026-09-15 · Собран в 15:33 (10/10 попыток опроса QA_REPORTS/, шаг 60с, старт 15:23).
**Это черновик Фазы 1. Финальный вердикт НЕ выносится** — фаза 2 после центральных фиксов.

---

## 1. Матрица «зона × статус × находки»

| Зона | Отчёт | Статус | Находки P1 | Находки P2 | Находки P3 | Порт |
|---|---|---|---|---|---|---|
| qa-visual (скрин-матрица, перекрытия/обрезания/контраст) | `qa-visual.md` | **НЕ СДАН** | — | — | — | 8810 |
| qa-data (сейвы, миграции v7→v9, экспорт/импорт, мульти-вкладка) | `qa-data.md` | **НЕ СДАН** | — | — | — | 8820 |
| qa-economy (parity продукт ↔ stronghold-model/sim) | `qa-economy.md` | **НЕ СДАН** | — | — | — | 8830 |
| qa-chaos (границы времени, даблклики, стекинг модалок) | `qa-chaos.md` | **НЕ СДАН** | — | — | — | 8840 |
| qa-infra (кэш-пины, бот/systemd, Pages-смоук, perf) | `qa-infra.md` | **НЕ СДАН** | — | — | — | 8850 |
| **lead (этот файл)** | `lead-draft.md` | сдан | — | — | — | — |

Сводка находок зон: **0/5 отчётов получено** — находки P1–P3 недоступны, все поля «—» до поступления отчётов.
Координационная заметка: отчёты пишутся параллельно; при опоздании зоны в фазу 2 вход — «не сдан», финальный вердикт формируется по фактической выборке.

---

## 2. Текущее состояние базы

### 2.1 Git-контекст (на момент сборки)

```
679dbbb test: QA process hardening — visual baselines for card/hero/map, legacy-strings gate, overflow audit   ← HEAD
8080018 fix(visual): card bottom overlap + kingdom path overflow + last 'tract' strings
b39bccf fix(ux): sync modal settings row 2x2 grid — Сброс was overflowing off-screen
c84f1a6 fix(p1): trapped modals (forge/edit/sync/siege) invisible under .app-wrap stacking; quest done resets on F5
174f4a9 docs: session handoff 2026-09-15 — 5 phases shipped, QA debt cleared, schema v9, all gates green
edfe17b feat: trade routes + season system (B4+B3, schema v9)
452581f feat: rich sunday digest + trophy gallery (B1+B2)
039168c feat(onboarding): 8-screen lecture -> 1 welcome + contextual first-touch hints (A1)
```

Рабочее дерево: только новые роли QA-агентов (`.opencode/agent/qa-*.md`, untracked) + правка `qa.md` — продукт чист.

### 2.2 База приёмки (QA_REPORT.md, раунд 2 — вердикт PASS)

- `npm run ci` → exit 0: unit **183/183** · e2e **15/15** · visual **2/2** · strongholds **18/18** · acceptance **40/40**.
- `playtest-full` → exit 0: **36/37 OK + 1 SKIP** (I2 — каталог на sh01 по дизайну не рендерится; покрыт на sh02).
- Консоль: 0 pageerror, 0 console.error, 0×404.
- Все 6 находок раунда 1 (2×P1, 2×P2, P3 + флейк 3.2) верифицированы и починены: c84f1a6 (модалки, F5-квесты), b39bccf/8080018 (UX/visual), 679dbbb (хардненинг тест-кода).

### 2.3 Гейты баланса (BALANCE.md, круг 6)

Круг 6 (после trade routes, seed 20260913): **ALL GATES PASS** — G1 (средний 20/20 к нед. 34; диск. нед. 19), G2 (руино-ночей 0), G3 (ленивый: потеря нед. 1, D3 возвраты 46/46; средний/диск. потери тыла 11/0). Trade-бонус +2%/путь, кап +38%.

### 2.4 Известные ограничения (хандофф SESSION-2026-09-15, актуальны для фазы 2)

1. События дня «Кузнец/Рынок/Духи» — объявление есть, эффекта нет (заглушки, by-design дефект функциональности).
2. Оффлайн-докрутка кап 7 дней — by design.
3. SPEC-таблица sh01 (gar 10/def 5/total 15) расходится с данными (3/2/5); канон — данные (sim).
4. e2e инфра-флак «browser has been closed» (~1/5 прогонов) — не продукт.
5. Эндгейм-ком золота (~3.4M) — задел под v9, продюсером багом не признан.
6. Т6 сила/💰 0.563 < Т7 0.778 — немонотонный стык (замечание дизайн-ревью, вне мандата).

---

## 3. Заготовка сводного отчёта (фаза 2 — заполнить)

- [ ] Получить/дождаться 5 зональных отчётов; отсутствующим — статус «не сдан» с пометкой в вердикте.
- [ ] Дедуп находок (один баг от двух зон = одна запись).
- [ ] Приоритизация P1 (блокер/потеря данных) / P2 (неверное поведение) / P3 (косметика).
- [ ] Полный `npm run ci` (эксклюзив QA-lead).
- [ ] Перепрогон харнесов с FAIL по ситуации: `tools/playtest-data.cjs`, `tools/playtest-chaos.cjs`, `tools/qa-economy-parity.cjs`.
- [ ] Гейт v2: 100% шагов OK + 0 ошибок консоли + overflow-аудит + legacy-гейт + гейты баланса PASS.
- [ ] Перезаписать `docs/strongholds-v2/QA_REPORT.md`, вынести вердикт.
