#!/usr/bin/env bash
# Деплой nd-config.service (P16 / C6-full). Запуск из корня репо: bash service/nd-config/deploy.sh
#   install (по умолчанию) — копирует server.cjs + конфиг-артефакты в /opt/neurodeck-config,
#                              создаёт /etc/neurodeck-config/env (токен генерируется один раз),
#                              ставит unit, daemon-reload, enable --now, healthz-проверка.
#   rollback               — disable --now, удаляет unit, /opt/neurodeck-config и env.
#                              Данные телеметрии (/var/lib/neurodeck-config) СОХРАНЯЮТСЯ;
#                              полный снос — «rollback --purge-data».
# Изоляция (правило 17): neurodeck-bot.service не модифицируется и не перезапускается —
# ниже нет ни одного обращения к нему; daemon-reload его не трогает.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_DIR="$REPO_ROOT/service/nd-config"
UNIT_NAME="nd-config.service"
OPT_DIR="/opt/neurodeck-config"
ENV_DIR="/etc/neurodeck-config"
ENV_FILE="$ENV_DIR/env"
UNIT_DST="/etc/systemd/system/$UNIT_NAME"
STATE_DIR="/var/lib/neurodeck-config"
PORT="${ND_CONFIG_PORT:-8095}"

log() { echo "[nd-config-deploy] $*"; }

require_root() {
    if [[ "$(id -u)" -ne 0 ]]; then log "нужен root (sudo)"; exit 1; fi
}

check_port_free() {
    if ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${PORT}\$"; then
        log "ПОРТ $PORT ЗАНЯТ — отказ (узанял не мы):"; ss -tlnp 2>/dev/null | grep ":${PORT} " || true
        exit 1
    fi
}

cmd_install() {
    require_root
    [[ -f "$SRC_DIR/server.cjs" ]] || { log "нет $SRC_DIR/server.cjs"; exit 1; }
    node --check "$SRC_DIR/server.cjs"
    check_port_free

    # 1) код + конфиг-артефакты (read-only для сервиса: ProtectSystem=strict + ReadOnlyPaths не нужны, /opt и так RO)
    install -d -m 0755 "$OPT_DIR/config"
    install -m 0644 "$SRC_DIR/server.cjs" "$OPT_DIR/server.cjs"
    local copied=0
    for f in "$REPO_ROOT"/config/weekly-modifiers.v*.json; do
        [[ -f "$f" ]] || continue
        install -m 0644 "$f" "$OPT_DIR/config/"
        copied=$((copied+1))
    done
    [[ "$copied" -gt 0 ]] || { log "в config/ нет ни одного weekly-modifiers.vN.json"; exit 1; }
    log "скопировано конфиг-артефактов: $copied"

    # 2) env: создаётся ОДИН раз (токен не перегенерируется при повторных установках)
    if [[ ! -f "$ENV_FILE" ]]; then
        local tok
        tok="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
        install -d -m 0755 "$ENV_DIR"
        {
            echo "# создано deploy.sh $(date -u +%FT%TZ); формат — service/nd-config/env.example"
            echo "ND_CONFIG_TOKEN=$tok"
            echo "ND_TELEMETRY_ENABLED=0"
            echo "ND_CONFIG_HOST=127.0.0.1"
            echo "ND_CONFIG_PORT=$PORT"
        } > "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        log "создан $ENV_FILE (токен сгенерирован, телеметрия OFF)"
    else
        log "env уже существует — токен/флаги не трогаем"
    fi

    # 3) unit
    install -m 0644 "$SRC_DIR/nd-config.service" "$UNIT_DST"
    systemctl daemon-reload
    systemctl enable --now "$UNIT_NAME"

    # 4) healthz
    sleep 1
    local i
    for i in 1 2 3 4 5; do
        if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
            log "OK: healthz отвечает на 127.0.0.1:${PORT}"
            systemctl --no-pager --lines=0 status "$UNIT_NAME" || true
            return 0
        fi
        sleep 1
    done
    log "ОШИБКА: healthz не ответил"; journalctl -u "$UNIT_NAME" --no-pager -n 30 || true
    exit 1
}

cmd_rollback() {
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
    log "rollback завершён. ${UNIT_NAME} и neurodeck-bot.service: $(systemctl is-active "$UNIT_NAME" || true) / $(systemctl is-active neurodeck-bot.service || true)"
}

case "${1:-install}" in
    install)  cmd_install ;;
    rollback) shift || true; cmd_rollback "${1:-}" ;;
    *) echo "использование: $0 [install|rollback [--purge-data]]" >&2; exit 2 ;;
esac
