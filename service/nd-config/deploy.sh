#!/usr/bin/env bash
# Деплой nd-config.service (P16 / C6-full; атомарные релизы + гейты — R4, очередь 4).
# Запуск из корня репо: bash service/nd-config/deploy.sh
#
# Команды:
#   install                          — первая установка ИЛИ переход со старой (плоской)
#                                      раскладки: stage релиза → атомарный symlink current →
#                                      env (токен генерируется один раз) → unit → enable →
#                                      start/restart → гейты (healthz/owner/port).
#   upgrade                          — АТОМАРНЫЙ апгрейд кода/артефактов: stage нового
#                                      релиза в releases/<ts>/ → атомарная смена symlink
#                                      current (ln+mv -T) → restart nd-config → гейты.
#                                      Провал гейтов = автооткат на предыдущий релиз
#                                      (symlink назад → restart → повтор гейтов).
#   release-rollback [имя-релиза]    — откат кода на предыдущий релиз (или именованный);
#                                      при провале гейтов — накат обратно (roll-forward).
#   rollback [--purge-data]          — ПОЛНЫЙ снос: stop/disable, unit, /opt, env.
#                                      Данные телеметрии (/var/lib/neurodeck-config)
#                                      СОХРАНЯЮТСЯ; полный снос — «rollback --purge-data».
#
# Гейты после каждого activate/restart (check_service):
#   unit-active (systemctl is-active) · healthz (curl + JSON: ok/service/version==релизу)
#   main-pid (systemctl show MainPID>0) · port-owner (ss -tlnp: порт держит MainPID,
#   не чужой процесс) · symlink (current → releases/<имя>) · owner (файлы root,
#   ничего world-writable).
#
# Раскладка (R4):
#   $OPT_DIR/releases/<UTC-ts>-<pid>-<rand>/{server.cjs, config/weekly-modifiers.v*.json}
#   $OPT_DIR/current → releases/<имя>   (атомарный symlink; unit стартует current/server.cjs)
#   Старые релизы хранятся KEEP_RELEASES шт. (текущий не удаляется никогда).
#
# Переопределения для тестов (в проде не задавать): ND_DEPLOY_OPT_DIR, ND_DEPLOY_ENV_DIR,
# ND_DEPLOY_UNIT_DST, ND_DEPLOY_STATE_DIR, ND_DEPLOY_KEEP_RELEASES, ND_CONFIG_PORT.
#
# Изоляция (правило 17): neurodeck-bot.service не модифицируется и не перезапускается —
# ниже нет ни одного обращения к нему; daemon-reload его состояние не трогает.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_DIR="$REPO_ROOT/service/nd-config"
UNIT_NAME="nd-config.service"
OPT_DIR="${ND_DEPLOY_OPT_DIR:-/opt/neurodeck-config}"
ENV_DIR="${ND_DEPLOY_ENV_DIR:-/etc/neurodeck-config}"
ENV_FILE="$ENV_DIR/env"
UNIT_DST="${ND_DEPLOY_UNIT_DST:-/etc/systemd/system/$UNIT_NAME}"
STATE_DIR="${ND_DEPLOY_STATE_DIR:-/var/lib/neurodeck-config}"
PORT="${ND_CONFIG_PORT:-8095}"
RELEASES_DIR="$OPT_DIR/releases"
CURRENT_LINK="$OPT_DIR/current"
KEEP_RELEASES="${ND_DEPLOY_KEEP_RELEASES:-3}"

# Весь человеческий вывод — в stderr: stdout функций (stage_release/current_release)
# используется как значение.
log() { echo "[nd-config-deploy] $*" >&2; }
die() { log "ОШИБКА: $*"; exit 1; }

require_root() {
    if [[ "$(id -u)" -ne 0 ]]; then die "нужен root (sudo)"; fi
}

# ---------- версии/релизы ----------

# Версию сервиса читаем из server.cjs релиза: healthz обязан совпасть с ней —
# гейт ловит «поднялся не тот код».
release_version() { # $1 = каталог релиза
    node -e 'const fs=require("fs");const m=fs.readFileSync(process.argv[1]+"/server.cjs","utf8").match(/SERVICE_VERSION\s*=\s*(\d+)/);if(!m)process.exit(1);process.stdout.write(m[1])' "$1"
}

current_release() {
    local link
    link="$(readlink "$CURRENT_LINK" 2>/dev/null)" || return 1
    [[ -n "$link" ]] || return 1
    basename "$link"
}

releases_list() {
    ls -1 "$RELEASES_DIR" 2>/dev/null | LC_ALL=C sort
}

# Атомарная смена current: symlink создаётся рядом и переименовывается поверх —
# rename(2), читатели никогда не видят отсутствующий/полуобновлённый current.
activate_release() { # $1 = имя релиза
    local tmp="$OPT_DIR/.current.tmp.$$"
    ln -sfn "releases/$1" "$tmp"
    mv -T "$tmp" "$CURRENT_LINK"
}

# Stage нового релиза: копия кода+артефактов, node --check, JSON-парс артефактов.
# Печатает имя релиза в stdout. Умирает при любой проблеме — активация не нужна вовсе.
# Имя = epoch-наносекунды: фиксированная длина ⇒ лексикографический порядок хронологичен
# (откат/поддержка порядка релизов полагаются на сортировку имён).
stage_release() {
    local name rel f copied=0
    name="$(date -u +%s%N)Z"
    rel="$RELEASES_DIR/$name"
    install -d -m 0755 "$rel" "$rel/config"
    install -m 0644 "$SRC_DIR/server.cjs" "$rel/server.cjs"
    for f in "$REPO_ROOT"/config/weekly-modifiers.v*.json; do
        [[ -f "$f" ]] || continue
        install -m 0644 "$f" "$rel/config/"
        copied=$((copied+1))
    done
    [[ "$copied" -gt 0 ]] || die "в config/ нет ни одного weekly-modifiers.vN.json"
    node --check "$rel/server.cjs" || die "staged server.cjs не парсится"
    for f in "$rel"/config/*.json; do
        node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$f" \
            || die "артефакт не JSON: $f"
    done
    log "stage: releases/$name (артефактов: $copied, версия сервиса: $(release_version "$rel"))"
    echo "$name"
}

# Старая (до-R4) плоская раскладка становится обычным релизом — тогда откат/апгрейд
# работают единообразно, а unit-путь current/server.cjs валиден для обоих.
# Префикс «0-»: лексикографически старше любого epoch-нс релиза.
normalize_legacy() {
    [[ -f "$OPT_DIR/server.cjs" && -d "$OPT_DIR/config" && ! -L "$CURRENT_LINK" ]] || return 0
    local name
    name="0-legacy-$(date -u +%s%N)Z"
    install -d -m 0755 "$RELEASES_DIR/$name"
    mv "$OPT_DIR/server.cjs" "$RELEASES_DIR/$name/server.cjs"
    mv "$OPT_DIR/config" "$RELEASES_DIR/$name/config"
    activate_release "$name"
    log "легаси-раскладка нормализована в releases/$name"
}

prune_releases() { # храним новейшие KEEP_RELEASES + текущий (его — никогда)
    local cur name keep
    cur="$(current_release 2>/dev/null || true)"
    [[ -d "$RELEASES_DIR" ]] || return 0
    keep="$(releases_list | tail -n "$KEEP_RELEASES")"
    while IFS= read -r name; do
        [[ -z "$name" ]] && continue
        [[ "$name" == "$cur" ]] && continue
        if ! printf '%s\n' "$keep" | grep -qxF "$name"; then
            rm -rf "${RELEASES_DIR:?}/$name"
            log "pruned release $name"
        fi
    done < <(releases_list)
}

# ---------- гейты ----------

verify_port_owner() { # $1 = pid: порт PORT слушает именно этот процесс
    ss -tlnp 2>/dev/null | awk -v port=":${PORT}" -v pid="pid=${1}," \
        '$4 ~ port "$" && index($0, pid) { found=1 } END { exit found ? 0 : 1 }'
}

verify_owner() { # $1 = каталог релиза: владелец root, ничего world-writable
    local dir="$1"
    [[ "$(stat -c '%U' "$dir")" == "root" ]] || return 1
    [[ "$(stat -c '%U' "$dir/server.cjs")" == "root" ]] || return 1
    [[ -z "$(find "$dir" -perm -0002 -print -quit)" ]] || return 1
    return 0
}

# healthz с ретраями: сервис мог стартовать дольше секунды. Гейт сверяет не только
# 200 OK, но и JSON: ok=true, service=nd-config, version==версии релиза (поднялся
# именно новый код, а не застрявший старый процесс).
healthz_wait() { # $1 = ожидаемая версия
    local i body verdict
    for i in 1 2 3 4 5; do
        if body="$(curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/healthz" 2>/dev/null)"; then
            verdict="$(node -e '
                const exp = process.argv[1];
                try {
                    const j = JSON.parse(process.argv[2]);
                    if (j.ok !== true) { console.log("ok!=true"); process.exit(0); }
                    if (j.service !== "nd-config") { console.log("service=" + j.service); process.exit(0); }
                    if (String(j.version) !== String(exp)) { console.log("version " + j.version + "!=" + exp); process.exit(0); }
                    console.log("OK");
                } catch (e) { console.log("unparsable"); }
            ' "$1" "$body")"
            if [[ "$verdict" == "OK" ]]; then return 0; fi
            log "healthz ответила, но не прошла гейт: $verdict"
        fi
        sleep 1
    done
    return 1
}

check_service() { # $1 = имя релиза, которое обязано быть current и здоровым
    local rel="$1" pid ver
    systemctl is-active --quiet "$UNIT_NAME" 2>/dev/null || { log "[gate] FAIL unit-active"; return 1; }
    log "[gate] ok unit-active"
    ver="$(release_version "$RELEASES_DIR/$rel")" || { log "[gate] FAIL version-read ($rel)"; return 1; }
    healthz_wait "$ver" || { log "[gate] FAIL healthz (ожидание версии $ver)"; return 1; }
    log "[gate] ok healthz (version=$ver)"
    pid="$(systemctl show -p MainPID --value "$UNIT_NAME" 2>/dev/null || echo 0)"
    [[ "$pid" =~ ^[0-9]+$ && "$pid" -gt 0 ]] || { log "[gate] FAIL main-pid"; return 1; }
    log "[gate] ok main-pid=$pid"
    verify_port_owner "$pid" || { log "[gate] FAIL port-owner (pid=$pid port=$PORT)"; return 1; }
    log "[gate] ok port-owner (pid=$pid держит :$PORT)"
    [[ "$(current_release)" == "$rel" ]] || { log "[gate] FAIL symlink (current → $(current_release 2>/dev/null || echo nothing))"; return 1; }
    log "[gate] ok symlink current→releases/$rel"
    verify_owner "$RELEASES_DIR/$rel" || { log "[gate] FAIL owner (root? world-writable?)"; return 1; }
    log "[gate] ok owner (root, ничего world-writable)"
    return 0
}

# ---------- unit / env / restart ----------

ensure_unit() {
    if [[ ! -f "$UNIT_DST" ]] || ! cmp -s "$SRC_DIR/nd-config.service" "$UNIT_DST"; then
        install -m 0644 "$SRC_DIR/nd-config.service" "$UNIT_DST"
        systemctl daemon-reload
        log "unit обновлён + daemon-reload"
    fi
}

create_env_if_missing() {
    if [[ -f "$ENV_FILE" ]]; then
        log "env уже существует — токен/флаги не трогаем"
        return 0
    fi
    local tok
    tok="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
    install -d -m 0755 "$ENV_DIR"
    {
        echo "# создано deploy.sh $(date -u +%FT%TZ); формат — service/nd-config/env.example"
        echo "ND_CONFIG_TOKEN=$tok"
        echo "ND_TELEMETRY_ENABLED=0"
        echo "ND_TELEMETRY_RETENTION_DAYS=30"
        echo "ND_CONFIG_HOST=127.0.0.1"
        echo "ND_CONFIG_PORT=$PORT"
    } > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log "создан $ENV_FILE (токен сгенерирован, телеметрия OFF, retention 30 дней)"
}

restart_service() {
    systemctl restart "$UNIT_NAME"
    log "restart $UNIT_NAME"
}

start_or_restart_service() { # enable всегда; живому сервису — restart (enable --now
    # НЕ перезапускает уже активный unit — без явного restart старый код остался бы)
    local was_active=0
    systemctl is-active --quiet "$UNIT_NAME" 2>/dev/null && was_active=1 || true
    systemctl enable "$UNIT_NAME" >/dev/null 2>&1
    if [[ "$was_active" == "1" ]]; then
        restart_service
    else
        systemctl start "$UNIT_NAME"
        log "start $UNIT_NAME"
    fi
}

check_port_usable() { # install: порт свободен ИЛИ занят самим nd-config (переустановка)
    if ! ss -tln 2>/dev/null | awk -v port=":${PORT}" '$4 ~ port "$" {found=1} END {exit found?0:1}'; then
        return 0 # nobody не слушает — свободен
    fi
    # порт занят: допустимо, только если это наш собственный MainPID (переустановка живого сервиса)
    if systemctl is-active --quiet "$UNIT_NAME" 2>/dev/null; then
        local pid
        pid="$(systemctl show -p MainPID --value "$UNIT_NAME" 2>/dev/null || echo 0)"
        if [[ "$pid" =~ ^[0-9]+$ && "$pid" -gt 0 ]] && verify_port_owner "$pid"; then
            log "порт $PORT занят самим $UNIT_NAME — переустановка живого сервиса"
            return 0
        fi
    fi
    log "ПОРТ $PORT ЗАНЯТ — отказ (занял не мы):"
    ss -tlnp 2>/dev/null | grep ":${PORT} " || true
    exit 1
}

# ---------- команды ----------

cmd_install() {
    require_root
    [[ -f "$SRC_DIR/server.cjs" ]] || die "нет $SRC_DIR/server.cjs"
    node --check "$SRC_DIR/server.cjs" || die "server.cjs не парсится"
    check_port_usable

    normalize_legacy
    local prev=""
    prev="$(current_release 2>/dev/null || true)"

    local new
    new="$(stage_release)"
    activate_release "$new"
    create_env_if_missing
    ensure_unit
    start_or_restart_service

    if check_service "$new"; then
        prune_releases
        log "install OK: current → releases/$new"
        return 0
    fi
    log "гейты НЕ прошли на свежем релизе $new"
    if [[ -n "$prev" ]]; then
        log "автооткат на предыдущий релиз $prev"
        activate_release "$prev"
        restart_service
        if check_service "$prev"; then
            die "install провален, сервис здоров на прежнем релизе $prev"
        fi
    fi
    systemctl disable --now "$UNIT_NAME" 2>/dev/null || true
    die "install провален, сервис остановлен (disable --now); релизы сохранены в $RELEASES_DIR для разбора"
}

cmd_upgrade() {
    require_root
    [[ -L "$CURRENT_LINK" && -d "$RELEASES_DIR" ]] || die "нет установленной копии (current/releases) — сначала install"

    local prev
    prev="$(current_release)" || die "current указывает в никуда"
    local new
    new="$(stage_release)"
    activate_release "$new"      # атомарно: rename(2)
    ensure_unit
    restart_service

    if check_service "$new"; then
        prune_releases
        log "upgrade OK: releases/$prev → releases/$new"
        return 0
    fi
    log "гейты НЕ прошли на новом релизе $new — АВТООТКАТ на $prev"
    activate_release "$prev"
    restart_service
    if check_service "$prev"; then
        die "upgrade провален, сервис здоров на прежнем релизе $prev (новый релиз $new сохранён для разбора)"
    fi
    die "КРИТИЧНО: после отката гейты не прошли и на $prev — разбираться вручную: journalctl -u $UNIT_NAME"
}

cmd_release_rollback() { # $1 = имя релиза (пусто = предыдущий)
    require_root
    [[ -L "$CURRENT_LINK" ]] || die "нет установленной копии — сначала install"
    local cur target name prev_found=0
    cur="$(current_release)" || die "current указывает в никуда"
    if [[ -n "${1:-}" ]]; then
        [[ -d "$RELEASES_DIR/$1" ]] || die "релиза $1 нет в $RELEASES_DIR"
        [[ "$1" != "$cur" ]] || die "релиз $1 уже текущий"
        target="$1"
    else
        target=""
        while IFS= read -r name; do
            if [[ "$name" == "$cur" ]]; then prev_found=1; break; fi
            target="$name"
        done < <(releases_list)
        [[ -n "$target" ]] || die "нет релиза старее текущего $cur (откатывать некуда)"
    fi
    log "откат кода: releases/$cur → releases/$target"
    activate_release "$target"
    ensure_unit
    restart_service
    if check_service "$target"; then
        log "release-rollback OK: current → releases/$target (более новые релизы сохранены — можно вернуться)"
        return 0
    fi
    log "гейты НЕ прошли на $target — накат обратно (roll-forward) на $cur"
    activate_release "$cur"
    restart_service
    if check_service "$cur"; then
        die "release-rollback провален, сервис здоров на прежнем текущем $cur"
    fi
    die "КРИТИЧНО: гейты не прошли ни на $target, ни на $cur — разбираться вручную"
}

cmd_rollback() { # полный снос (данные телеметрии — по умолчанию сохранить)
    require_root
    if systemctl is-active --quiet "$UNIT_NAME" 2>/dev/null; then
        systemctl disable --now "$UNIT_NAME"
        log "сервис остановлен и снят с автозапуска"
    else
        systemctl disable "$UNIT_NAME" 2>/dev/null || true
    fi
    rm -f "$UNIT_DST"
    systemctl daemon-reload
    rm -rf "$OPT_DIR"
    rm -rf "$ENV_DIR"
    if [[ "${1:-}" == "--purge-data" ]]; then
        rm -rf "$STATE_DIR"
        log "данные телеметрии удалены (--purge-data)"
    else
        log "данные телеметрии СОХРАНЕНЫ в $STATE_DIR (полный снос: rollback --purge-data)"
    fi
    log "rollback завершён"
}

case "${1:-install}" in
    install)           cmd_install ;;
    upgrade)           cmd_upgrade ;;
    release-rollback)  shift || true; cmd_release_rollback "${1:-}" ;;
    rollback)          shift || true; cmd_rollback "${1:-}" ;;
    *) echo "использование: $0 [install|upgrade|release-rollback [имя-релиза]|rollback [--purge-data]]" >&2; exit 2 ;;
esac
