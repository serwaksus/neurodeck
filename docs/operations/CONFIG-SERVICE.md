# nd-config.service — runbook (P16 / C6-full)

> Статус: введён 2026-10-01 · Owner: @evgenijsimakov · Код: [service/nd-config/server.cjs](../../service/nd-config/server.cjs)
> Смотрите также: [TELEMETRY.md](TELEMETRY.md) (приватность-принципы), [remote-config.js](../../js/remote-config.js) (клиентский валидатор).

## 1. Что это

Минимальный read-only сервис NeuroDeck на VPS: раздача версионированных конфиг-артефактов
(`config/weekly-modifiers.vN.json`) и opt-in приём телеметрии. Vanilla Node.js, ноль
npm-зависимостей. **Слушает только 127.0.0.1:8095** — наружу не выставлен; доступ снаружи VPS
невозможен без отдельного решения владельца (reverse-proxy НЕ настраивать без решения).

### Изоляция от прод-бота (правило 17)

- Отдельный unit `nd-config.service`; `neurodeck-bot.service` не модифицируется и не перезапускается
  (его код, данные и пользователь не используются; `daemon-reload` состояние чужих юнитов не трогает).
- Транзиентный пользователь от systemd (`DynamicUser=yes`) — постоянного юзера не создаём.
- Свой код-каталог `/opt/neurodeck-config` (как у бота свой `/opt/neurodeck-bot`), своё env-хранилище
  `/etc/neurodeck-config/env`, свой стейт `/var/lib/neurodeck-config`.
- Харднинг юнита: `ProtectSystem=strict` (запись только в StateDirectory), `ProtectHome`,
  `PrivateTmp`, `NoNewPrivileges`, `RestrictSUIDSGID`.

## 2. Эндпоинты

| Метод и путь | Поведение |
|---|---|
| `GET /healthz` | `200 {"ok":true,"service":"nd-config","version":1,"telemetry":"disabled\|enabled"}` |
| `GET /` | JSON-описание эндпоинтов |
| `GET /config/<name>` | только имена вида `weekly-modifiers.vN.json` (regex-whitelist, обход каталога невозможен). `200` + байты 1:1 артефакту, `ETag` (sha1) + `If-None-Match`→`304`, `Cache-Control: public, max-age=300`. Иначе `404`. |
| `POST /v1/telemetry` | **opt-in, DEFAULT OFF**: выключен → `503 {"error":"telemetry_disabled"}`. Включен: без/с неверным токеном → `401`; тело >64 КиБ → `413`; не-JSON/не-объект → `400`; >60 запросов/мин → `429`; успех → `202`, строка JSONL `{receivedAt, payload}` в `/var/lib/neurodeck-config/telemetry.jsonl`. |

Токен принимается в `Authorization: Bearer <token>` или `X-ND-Token: <token>`; сравнение
timing-safe (sha256-дайджесты). Ротация хранилища: после 5 МиБ `telemetry.jsonl` → `.1` → `.2`
(итого ≤ ~15 МиБ). Файл создаётся с правами 0600. В лог пишутся только метод/путь/статус/мс —
без IP и содержимого payload.

**Fail-safe:** приёмник считается включённым ТОЛЬКО при `ND_TELEMETRY_ENABLED=1` И токене ≥16
символов. Любое другое сочетание = выключен.

## 3. Установка / обновление

Из корня репо на VPS (нужен root):

```bash
sudo bash service/nd-config/deploy.sh            # install — идемпотентно
```

Скрипт: `node --check` кода → проверка что порт 8095 свободен → копия `server.cjs` и всех
`config/weekly-modifiers.v*.json` в `/opt/neurodeck-config/` → создание `/etc/neurodeck-config/env`
(токен `openssl`-grade случайный, `ND_TELEMETRY_ENABLED=0`) **только при первом запуске** (повторные
установки токен не перегенерируют) → `daemon-reload` + `enable --now` → healthz-проверка с ретраями.

Обновление кода/артефактов = тот же запуск `deploy.sh` (unit уже enable — просто перезапустится
новой копией; env сохранится).

### Проверка после установки

```bash
curl -s http://127.0.0.1:8095/healthz
curl -s http://127.0.0.1:8095/config/weekly-modifiers.v1.json | head -c 200
systemctl status nd-config --no-pager
journalctl -u nd-config -n 20 --no-pager -o cat
# телеметрия выключена по умолчанию — убедиться:
curl -s -X POST http://127.0.0.1:8095/v1/telemetry -d '{}'   # → 503 telemetry_disabled
```

## 4. Включение телеметрии (владелец, осознанно)

1. `sudo systemctl edit nd-config` НЕ нужен — правим env-файл: `sudo nano /etc/neurodeck-config/env`
   → `ND_TELEMETRY_ENABLED=1` (токен уже там с установки; ротация токена — заменить `ND_CONFIG_TOKEN`
   на новый `openssl rand -hex 24`).
2. `sudo systemctl restart nd-config` (это НЕ прод-бот; рестарт nd-config безопасен в любой момент).
3. Проверка: `curl -s -X POST -H 'X-ND-Token: <токен>' -d '{"events":[]}' http://127.0.0.1:8095/v1/telemetry` → `202`.

Включение приёмника **не включает** отправку на клиентах: клиентский экспорт — DEFAULT OFF и
остаётся отдельным продуктовым решением (TELEMETRY.md §1, §7). Приёмник без клиентов просто пишет
ничего.

### Данные

`/var/lib/neurodeck-config/telemetry.jsonl[.1|.2]`. Приватность: в файл попадает только то, что
прислал клиент в конверте; сервер НЕ добавляет IP/UA. Удаление: `sudo rm` файлов (ротация
пересоздаст при необходимости). Полный снос вместе с данными — `rollback --purge-data`.

## 5. Откат (rollback)

Полный, ~30 секунд, прод-бота не касается:

```bash
sudo bash service/nd-config/deploy.sh rollback                # остановить, снять unit, убрать /opt и env
# данные телеметрии СОХРАНЯЮТСЯ в /var/lib/neurodeck-config; полный снос:
sudo bash service/nd-config/deploy.sh rollback --purge-data
```

Что делает rollback: `systemctl disable --now nd-config` → удаление unit-файла → `daemon-reload` →
`rm -rf /opt/neurodeck-config /etc/neurodeck-config` → (опция) `rm -rf /var/lib/neurodeck-config`.
После отката порт 8095 свободен, автозагрузки нет. Игроки ничего не замечают: клиент
(js/remote-config.js) читает конфиг same-origin с GitHub Pages и имеет встроенный safe-fallback —
VPS-сервис в клиентском пути не участвует.

## 6. Почему сервис вообще не в клиентском пути (важно)

Прод-клиент грузит `config/weekly-modifiers.v1.json` с GitHub Pages (same-origin, кэш SW).
nd-config.service — источник правды на VPS для будущего «конфиг-пайплайна» (v2+ артефакты,
проверка перед публикацией, телеметрия). Миграция клиента на VPS-источник = отдельное решение
владельца (CORS, доступность, домен) — в клиентских правилах не менять без OWNER-решения.

## 7. Инциденты

| Симптом | Диагностика | Действие |
|---|---|---|
| `healthz` не отвечает | `journalctl -u nd-config -n 50` | `systemctl restart nd-config`; порт занят чужим процессом → `ss -tlnp \| grep 8095`, разбираться, кто |
| `503 telemetry_disabled` при включённом флаге | env: токен пустой/короткий (<16) — fail-safe | вписать валидный токен, restart |
| Телеметрия не пишется | `ls -la /var/lib/neurodeck-config/`; права юнита | `journalctl` смотреть ошибки `appendTelemetry` |
| Подозрение на утечку токена | — | ротация: новый `openssl rand -hex 24` в env + restart (старые данные остаются читаемыми — токен только на приём) |
