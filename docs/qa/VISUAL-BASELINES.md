# Визуальные базлайны

Скриншотные тесты (`tests/e2e/visual-regression*.test.js`) сравнивают пиксели, поэтому базлайн валиден только в том окружении, где снят.

| Где | Папка | Кто снимает |
|-----|-------|-------------|
| Локально / VPS | `tests/e2e/snapshots/` | `npm run test:e2e:visual:update` |
| GitHub Actions (блокирующий гейт) | `tests/e2e/snapshots-ci/` | job `visual` в контейнере `mcr.microsoft.com/playwright:v<версия @playwright/test>` |

До аудита R2 CI сравнивал с VPS-базлайнами и стабильно краснел (8 из 25 на `main`), а красное скрывал `continue-on-error`. Теперь:

1. Нет `tests/e2e/snapshots-ci/` (первый запуск) или запуск вручную с `update_visual=true` → job собирает базлайны, кладёт их в артефакт `visual-baselines-ci` и пишет предупреждение. Job при этом зелёный: сравнивать не с чем.
2. Скачать артефакт, положить содержимое в `tests/e2e/snapshots-ci/`, закоммитить. С этого момента любой дрейф пикселей — красный CI, деплой блокируется (`deploy` ждёт `visual`).
3. Намеренное изменение внешнего вида: PR с правкой → запуск `update_visual` на ветке → ревью диффов → коммит новых `snapshots-ci/`. Скриншоты «до/после» — в описание PR.

Тег контейнера обязан совпадать с версией `@playwright/test` в `package-lock.json` (проверяет `tests/ci-config.test.js`): другой браузер даёт другой антиалиасинг. При обновлении Playwright — обновить тег в `ci.yml` и пересобрать базлайны.

Настройка репозитория (делает владелец, см. аудит 1.6): Settings → Pages → Source = **GitHub Actions**. Пока источник — ветка, GitHub публикует каждый push в `main` отдельным «pages build and deployment» до окончания тестов.
