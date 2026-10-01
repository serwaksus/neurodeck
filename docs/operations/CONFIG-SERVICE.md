# nd-config.service — runbook (P16 / C6-full; атомарные релизы + privacy-гейты — R4)

> Статус: введён 2026-10-01 · R4 (очередь 4) 2026-10-01: релизная раскладка, автооткат, allowlist/redaction/retention/DELETE · Owner: @evgenijsimakov · Код: [service/nd-config/server.cjs](../../service/nd-config/server.cjs)
> Смотрите также: [TELEMETRY.md](TELEMETRY.md) (приватность-принципы), [remote-config.js](../../js/remote-config.js) (клиентский валидатор).

## 1. Что это

Минимальный read-only сервис NeuroDeck на VPS: раздача версионированных конфиг-артефактов
(`config/weekly-modifiers.vN.json`) и opt-in приём телеметрии. Vanilla Node.js, ноль
npm-зависимостей. **Слушает только 127.0.0.1:8095** — наружу не выставлен; доступ снаружи VPS
невозможен без отдельного решения владельца (reverse-proxy НЕ настраивать без решения).

### Изоляция от прод-бота (правило 17)

- Отдельный unit `nd-config.service`; `neurodeck-bot.service` не модифицируется и не перезапускается
  (deploy.sh вообще не содержит обращений к нему; `daemon-reload` состояние чужих юнитов не трогает).
- Транзиентный пользователь от systemd (`DynamicUser=yes`) — постоянного юзера не создаём.
- Свой код-каталог `/opt/neurodeck-config` (как у бота свой `/opt/neurodeck-bot`), своё env-хранилище
  `/etc/neurodeck-config/env`, свой стейт `/var/lib/neurodeck-config`.
- Харднинг юнита: `ProtectSystem=strict` (запись только в StateDirectory), `ProtectHome`,
  `PrivateTmp`, `NoNewPrivileges`, `RestrictSUIDSGID`.

## 2. Релизная раскладка и атомарность (R4)

```
/opt/neurodeck-config/
  releases/<epoch-ns>Z/{server.cjs, config/weekly-modifiers.v*.json}   # готовые релизы
  current → releases/<имя>                                             # атомарный symlink
```

- Имена релизов — epoch-наносекунды: лексикографический порядок = хронологический
  (откат и хранение порядка релизов полагаются на сортировку имён).
- **Смена current атомарна**: symlink создаётся рядом и переименовывается поверх
  (`ln -s … && mv -T` — один `rename(2)`); читатели никогда не видят отсутствующий
  или полуобновлённый current. Unit стартует `current/server.cjs`.
- Хранятся `ND_DEPLOY_KEEP_RELEASES=3` новейших релизов (текущий не удаляется никогда);
  провалившийся релиз НЕ удаляется — остаётся для разбора.

### Гейты после каждого activate/restart (`check_service` в deploy.sh)

| Гейт | Что проверяет |
|---|---|
| `unit-active` | `systemctl is-active nd-config` |
| `healthz` | реальный HTTP: `ok=true`, `service=nd-config`, **`version` == версии кода релиза** (поднялся именно новый код) |
| `main-pid` | `systemctl show -p MainPID` > 0 |
| `port-owner` | `ss -tlnp`: порт 8095 слушает именно MainPID (не чужой процесс) |
| `symlink` | `current` → ожидаемый релиз |
| `owner` | файлы релиза принадлежат root, ничего world-writable |

Провал любого гейта при upgrade = **автооткат** (current на прежний релиз → restart →
повтор гейтов); при release-rollback = **накат обратно** (roll-forward). Оба провала —
не-0 exit и внятная причина в stderr; бот не трогается ни при каком исходе.

## 3. Эндпоинты (сервисная версия 2)

| Метод и путь | Поведение |
|---|---|
| `GET /healthz` | `200 {"ok":true,"service":"nd-config","version":2,"telemetry":"disabled\|enabled","retention_days":30}` |
| `GET /` | JSON-описание эндпоинтов |
| `GET /config/<name>` | только имена вида `weekly-modifiers.vN.json` (regex-whitelist, обход каталога невозможен). `200` + байты 1:1 артефакту, `ETag` (sha1) + `If-None-Match`→`304`, `Cache-Control: public, max-age=300`. Иначе `404`. |
| `POST /v1/telemetry` | **opt-in, DEFAULT OFF**: выключен → `503 {"error":"telemetry_disabled"}`. Включен: без/с неверным токеном → `401`; тело >64 КиБ → `413`; не-JSON/не-объект → `400`; >60 запросов/мин (общее окно с DELETE) → `429`; нарушение allowlist → `400` с кодом (`envelope_field_not_allowed` / `event_not_allowed` / `error_code_not_allowed` / `counter_not_allowed` / `invalid_envelope` / `invalid_events` / `too_many_events`); успех → `202`, строка JSONL `{receivedAt, payload}` в `/var/lib/neurodeck-config/telemetry.jsonl`. |
| `DELETE /v1/telemetry` | контракт удаления: стирает `telemetry.jsonl` + ротированные. Токен обязателен (`401` без/с неверным); работает и при выключенном приёмнике (флаг выключает ПРИЁМ, не удаление). `200 {"ok":true,"deleted":…,"files_removed":N}`. |

Токен принимается в `Authorization: Bearer <token>` или `X-ND-Token: <token>`; сравнение
timing-safe (sha256-дайджесты). Ротация хранилища: после 5 МиБ `telemetry.jsonl` → `.1` → `.2`
(итого ≤ ~15 МиБ). Файл создаётся с правами 0600. В лог пишутся только метод/путь/статус/мс —
без IP и содержимого payload.

**Fail-safe:** приёмник считается включённым ТОЛЬКО при `ND_TELEMETRY_ENABLED=1` И токене ≥16
символов. Любое другое сочетание = выключен.

### Privacy-гейты приёмника (R4)

1. **Allowlist.** Принимаются только имена событий и коды ошибок из клиентского каталога
   (js/telemetry.js + js/storage.js, полный список — TELEMETRY.md §4–§5). Неизвестное поле
   конверта, имя события, код ошибки или счётчика → `400`, payload не пишется. Дрейф клиентского
   каталога против серверного allowlist ловит unit-тест `tests/config-service.test.js`
   («allowlist drift»): новое клиентское событие без обновления сервера = красный тест.
2. **Redaction.** На диск пишется не присланное тело, а его sanitized-проекция: `href` без
   query/fragment (там могут быть token/user_id), любые строки ≤200 символов, значения вида
   `Bearer …`/`token=…` замазаны `[redacted]`, данные событий (`d`) — только плоские примитивы
   ≤8 полей, вложенные структуры не хранятся вовсе. Сервер НЕ добавляет IP/UA от себя.
3. **Retention.** Записи старше `ND_TELEMETRY_RETENTION_DAYS` (default 30; `0` = не вычищать)
   вычищаются лениво — при очередной записи, но не чаще раза в час; ротированные файлы старше
   срока удаляются по mtime. Перезапись атомарна (tmp + rename), права 0600 сохраняются.
4. **Delete.** `DELETE /v1/telemetry` (токен) стирает всё накопленное немедленно — для
   исполнения запроса на удаление данных; без настроенного токена авторизация невозможна
   (`401`), но данных в этой конфигурации быть не могло.

## 4. Установка / обновление / откат кода

Из корня репо на VPS (нужен root):

```bash
sudo bash service/nd-config/deploy.sh install             # первая установка (+миграция со старой плоской раскладки)
sudo bash service/nd-config/deploy.sh upgrade             # атомарный апгрейд кода/артефактов (+автооткат при провале гейтов)
sudo bash service/nd-config/deploy.sh release-rollback    # откат кода на предыдущий релиз (или: release-rollback <имя>)
sudo bash service/nd-config/deploy.sh rollback            # ПОЛНЫЙ снос (данные телеметрии сохраняются)
sudo bash service/nd-config/deploy.sh rollback --purge-data
```

- **install**: `node --check` кода → порт свободен (или занят самим nd-config — переустановка
  живого сервиса) → stage релиза → атомарный current → env создаётся **только при первом
  запуске** (токен `openssl`-grade случайный, `ND_TELEMETRY_ENABLED=0`,
  `ND_TELEMETRY_RETENTION_DAYS=30`) → unit → enable + start/restart → гейты.
  Повторный install на живом сервисе делает restart (enable --now активный unit НЕ
  перезапускает — без явного restart остался бы старый код) и не трогает env.
  Старая (до-R4) плоская раскладка `/opt/neurodeck-config/{server.cjs,config}` автоматически
  нормализуется в релиз `0-legacy-…` — код не теряется, на него можно откатиться.
- **upgrade**: только для установленной копии (иначе отказ): stage → атомарная смена current →
  restart nd-config → гейты. Провал → автооткат на предыдущий релиз + повтор гейтов →
  не-0 exit (сервис остаётся здоровым на прежнем коде; провалившийся релиз сохранён).
- **release-rollback**: без аргумента — на предыдущий релиз; с аргументом — на именованный
  (список имён: `ls /opt/neurodeck-config/releases`). Провал гейтов → накат обратно.
  Более новые релизы сохраняются — вернуться вперёд можно тем же `release-rollback <имя>`.
- **rollback** (снос): `disable --now` → удаление unit → `daemon-reload` →
  `rm -rf /opt/neurodeck-config /etc/neurodeck-config` → (опция) `rm -rf /var/lib/neurodeck-config`.
  Игроки ничего не замечают: клиент (js/remote-config.js) читает конфиг same-origin с GitHub
  Pages и имеет встроенный safe-fallback — VPS-сервис в клиентском пути не участвует.

**Никогда не рестартуется** `neurodeck-bot.service` — deploy.sh не содержит к нему обращений
(пинится тестами `tests/config-service.test.js` и `tests/config-service-deploy.test.js`).

### Проверка после установки

```bash
curl -s http://127.0.0.1:8095/healthz          # {"ok":true,...,"version":2,"telemetry":"disabled","retention_days":30}
curl -s http://127.0.0.1:8095/config/weekly-modifiers.v1.json | head -c 200
systemctl status nd-config --no-pager
journalctl -u nd-config -n 20 --no-pager -o cat
# телеметрия выключена по умолчанию — убедиться:
curl -s -X POST http://127.0.0.1:8095/v1/telemetry -d '{}'   # → 503 telemetry_disabled
```

## 5. Включение телеметрии (владелец, осознанно)

1. `sudo systemctl edit nd-config` НЕ нужен — правим env-файл: `sudo nano /etc/neurodeck-config/env`
   → `ND_TELEMETRY_ENABLED=1` (токен уже там с установки; ротация токена — заменить `ND_CONFIG_TOKEN`
   на новый `openssl rand -hex 24`).
2. `sudo systemctl restart nd-config` (это НЕ прод-бот; рестарт nd-config безопасен в любой момент).
3. Проверка: `curl -s -X POST -H 'X-ND-Token: <токен>' -d '{"ts":1,"events":[]}' http://127.0.0.1:8095/v1/telemetry` → `202`.

Включение приёмника **не включает** отправку на клиентах: клиентский экспорт — DEFAULT OFF и
остаётся отдельным продуктовым решением (TELEMETRY.md §1, §7). Приёмник без клиентов ничего
не пишет. Всё, что приходит, проходит allowlist + redaction (§3 выше).

### Данные и их жизненный цикл

`/var/lib/neurodeck-config/telemetry.jsonl[.1|.2]` — только sanitized-проекции (§3). Срок
жизни записи — `ND_TELEMETRY_RETENTION_DAYS` (30 по умолчанию). Немедленное удаление всего:

```bash
curl -s -X DELETE -H 'X-ND-Token: <токен>' http://127.0.0.1:8095/v1/telemetry
# → {"ok":true,"deleted":true,"files_removed":1}
```

Полный снос вместе с данными — `rollback --purge-data`.

## 6. Почему сервис вообще не в клиентском пути (важно)

Прод-клиент грузит `config/weekly-modifiers.v1.json` с GitHub Pages (same-origin, кэш SW).
nd-config.service — источник правды на VPS для будущего «конфиг-пайплайна» (v2+ артефакты,
проверка перед публикацией, телеметрия). Миграция клиента на VPS-источник = отдельное решение
владельца (CORS, доступность, домен) — в клиентских правилах не менять без OWNER-решения.

## 7. Инциденты

| Симптом | Диагностика | Действие |
|---|---|---|
| `healthz` не отвечает | `journalctl -u nd-config -n 50` | `systemctl restart nd-config`; порт занят чужим процессом → `ss -tlnp \| grep 8095`, разбираться, кто |
| upgrade провалился | stderr deploy.sh: какой гейт не прошёл | сервис уже откачен автоматически на прежний релиз; править код и повторить `upgrade` |
| и оба релиза нездоровы (`КРИТИЧНО`) | `journalctl -u nd-config -n 100`; `ls -l /opt/neurodeck-config/releases` | `release-rollback <имя>` на заведомо рабочий релиз; крайний случай — `rollback` и `install` заново |
| `503 telemetry_disabled` при включённом флаге | env: токен пустой/короткий (<16) — fail-safe | вписать валидный токен, restart |
| Телеметрия не пишется | `ls -la /var/lib/neurodeck-config/`; права юнита | `journalctl` смотреть ошибки `appendTelemetry`/`pruneStore` |
| `400 event_not_allowed` в логе | клиент новее серверного allowlist | обновить каталог в server.cjs (TELEMETRY.md §4–§5), прогнать тест дрейфа, `upgrade` |
| Нужено удалить собранные данные (запрос субъекта) | — | `DELETE /v1/telemetry` с токеном (§5) |
| Подозрение на утечку токена | — | ротация: новый `openssl rand -hex 24` в env + restart (старые данные остаются читаемыми — токен только на приём/удаление) |
