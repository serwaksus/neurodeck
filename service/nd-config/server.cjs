#!/usr/bin/env node
'use strict';
// nd-config — минимальный read-only сервис NeuroDeck (P16 / C6-full шаг 2).
//
// Назначение:
//   1) раздача версионированных конфиг-артефактов (config/weekly-modifiers.vN.json) — источник
//      правды на VPS; клиент (js/remote-config.js) валидирует их сам и имеет safe-fallback;
//   2) opt-in приём телеметрии (POST /v1/telemetry) — по умолчанию ВЫКЛЮЧЕН (ND_TELEMETRY_ENABLED=0),
//      включается только владельцем; клиентский экспорт тоже DEFAULT OFF — игра ничего не шлёт,
//      пока продуктовое решение не принято (docs/operations/TELEMETRY.md §1, §7).
//
// Изоляция (правило 17): отдельный unit nd-config.service, никакого пересечения с
// neurodeck-bot.service. Слушает ТОЛЬКО 127.0.0.1 — наружу не выставляется.
// Правило 21: vanilla node (http/fs/crypto), ноль npm-зависимостей.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SERVICE_NAME = 'nd-config';
const SERVICE_VERSION = 1;

// Дефолты: env переопределяет (см. env.example и unit-файл).
const DEFAULTS = {
    host: '127.0.0.1',
    port: 8095,
    configDir: '/opt/neurodeck-config/config', // развёрнутая deploy.sh копия config/ из репо
    dataDir: '/var/lib/neurodeck-config',      // StateDirectory= юнита (telemetry.jsonl)
    token: '',                                  // ND_CONFIG_TOKEN; пустой = приёмник выключен
    telemetryEnabled: false,                    // opt-in, DEFAULT OFF
    maxBody: 64 * 1024,        // потолок тела POST (клиентский dump() заведённо меньше)
    maxStore: 5 * 1024 * 1024, // ротация telemetry.jsonl после 5 МиБ
    keepRotated: 2,            // хранить .1 .2 (итого ≤ ~15 МиБ)
    rateLimit: 60              // POST/мин суммарно: защита от расшедшейся петли клиента
};

// Разрешены ТОЛЬКО имена артефактов этого вида — путь собрать невозможно (нет сепараторов),
// каталог-обход исключён регуляркой, а не фильтрацией.
const CONFIG_FILE_RE = /^weekly-modifiers\.v\d+\.json$/;

function envBool(v) {
    return v === '1' || v === 'true' || v === 'yes';
}

function envOptions() {
    const port = parseInt(process.env.ND_CONFIG_PORT, 10);
    return {
        host: process.env.ND_CONFIG_HOST || DEFAULTS.host,
        port: (Number.isFinite(port) && port > 0 && port < 65536) ? port : DEFAULTS.port,
        configDir: process.env.ND_CONFIG_DIR || DEFAULTS.configDir,
        dataDir: process.env.ND_CONFIG_DATA_DIR || DEFAULTS.dataDir,
        token: process.env.ND_CONFIG_TOKEN || '',
        telemetryEnabled: envBool(process.env.ND_TELEMETRY_ENABLED)
    };
}

// timing-safe сравнение токена: сравниваем sha256-дайджесты — длина ответа не течёт,
// несовпадение ловится за константное время.
function tokenOk(provided, expected) {
    if (typeof provided !== 'string' || !provided || !expected) return false;
    const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
    const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
    return crypto.timingSafeEqual(a, b);
}

function extractToken(req) {
    const auth = req.headers['authorization'];
    if (typeof auth === 'string' && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '');
    const hdr = req.headers['x-nd-token'];
    return (typeof hdr === 'string' && hdr) ? hdr : null;
}

function sendJson(res, status, obj, extraHeaders) {
    const body = JSON.stringify(obj);
    const headers = Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(body)
    }, extraHeaders || {});
    res.writeHead(status, headers);
    res.end(body);
}

// Читает тело с потолком; resolve({ok, body}) | resolve({ok:false, over:true}).
// Сверх лимита данные не накапливаются (читаются и игнорируются), ответ успевает дойти клиенту.
function readBody(req, maxBody) {
    return new Promise((resolve) => {
        const chunks = [];
        let size = 0;
        let over = false;
        req.on('data', (c) => {
            if (over) return;
            size += c.length;
            if (size > maxBody) { over = true; resolve({ ok: false, over: true }); return; }
            chunks.push(c);
        });
        req.on('end', () => { if (!over) resolve({ ok: true, body: Buffer.concat(chunks) }); });
        req.on('error', () => { if (!over) resolve({ ok: false, over: false }); });
    });
}

// Ротация: main → .1 → .2 … старейший (.keepRotated) удаляется. Вызывается до append при переполнении.
function rotateStore(storePath, keepRotated) {
    try { fs.rmSync(storePath + '.' + keepRotated, { force: true }); } catch (e) {}
    for (let i = keepRotated - 1; i >= 1; i--) {
        try { fs.renameSync(storePath + '.' + i, storePath + '.' + (i + 1)); } catch (e) {} // отсутстующий файл — норма
    }
    try { fs.renameSync(storePath, storePath + '.1'); } catch (e) {}
}

function appendTelemetry(dataDir, storePath, payload, maxStore, keepRotated) {
    fs.mkdirSync(dataDir, { recursive: true });
    try {
        const st = fs.statSync(storePath);
        if (st.size >= maxStore) rotateStore(storePath, keepRotated);
    } catch (e) { /* файла ещё нет — ротировать нечего */ }
    const line = JSON.stringify({ receivedAt: new Date().toISOString(), payload }) + '\n';
    fs.appendFileSync(storePath, line, { encoding: 'utf8', mode: 0o600 });
}

// Фабрика приложения: options сливаются с DEFAULTS (тесты передают свои каталоги/лимиты).
// Возвращает http.Server (не слушает — listen/подписки на сигналы делает main()).
function createApp(options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    // fail-safe: телеметрия считается включённой ТОЛЬКО при явном флаге И токене ≥16 символов.
    const telemetryOn = !!opts.telemetryEnabled && typeof opts.token === 'string' && opts.token.length >= 16;
    const storePath = path.join(opts.dataDir, 'telemetry.jsonl');

    // Rate limit: скользящее окно в 60 с, счётчик общий (сервис localhost + токен —
    // задача лимита не авторизация, а страховка от клиентской петли).
    const windowMs = 60 * 1000;
    let windowStart = Date.now();
    let postCount = 0;

    const server = http.createServer((req, res) => {
        const started = Date.now();
        const url = (req.url || '/').split('?')[0];
        const method = (req.method || 'GET').toUpperCase();

        function finish(status, obj, extraHeaders) {
            sendJson(res, status, obj, extraHeaders);
            // одна строка в journald: без IP (localhost), без содержимого payload
            console.log(JSON.stringify({ t: new Date().toISOString(), method, path: url, status, ms: Date.now() - started }));
        }

        if (method === 'GET' && url === '/healthz') {
            return finish(200, { ok: true, service: SERVICE_NAME, version: SERVICE_VERSION, telemetry: telemetryOn ? 'enabled' : 'disabled' });
        }
        if (method === 'GET' && url === '/') {
            return finish(200, {
                service: SERVICE_NAME, version: SERVICE_VERSION,
                endpoints: {
                    'GET /healthz': 'живость',
                    'GET /config/<weekly-modifiers.vN.json>': 'read-only конфиг-артефакт',
                    'POST /v1/telemetry': 'opt-in приём (токен; default off)'
                }
            });
        }
        if (method === 'GET' && url.indexOf('/config/') === 0) {
            const name = url.slice('/config/'.length);
            if (!CONFIG_FILE_RE.test(name)) {
                return finish(404, { error: 'not_found' });
            }
            const file = path.join(opts.configDir, name);
            fs.readFile(file, (e, buf) => {
                if (e) {
                    return finish(404, { error: 'not_found' });
                }
                const etag = '"' + crypto.createHash('sha1').update(buf).digest('hex') + '"';
                const inm = req.headers['if-none-match'];
                if (inm && inm.indexOf(etag) !== -1) {
                    res.writeHead(304, { ETag: etag });
                    res.end();
                    console.log(JSON.stringify({ t: new Date().toISOString(), method, path: url, status: 304, ms: Date.now() - started }));
                    return;
                }
                // имя файла уже версионировано (.vN.json) — кэшировать можно, ETag добивает консистентность
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'public, max-age=300',
                    'ETag': etag
                });
                res.end(buf);
                console.log(JSON.stringify({ t: new Date().toISOString(), method, path: url, status: 200, ms: Date.now() - started }));
            });
            return;
        }
        if (method === 'POST' && url === '/v1/telemetry') {
            // Тело вычитываем ДО ответов-отказов (кроме перелимита) — клиент гарантированно
            // получает статус вместо обрыва соединения.
            readBody(req, opts.maxBody).then((r) => {
                if (!r.ok) {
                    return finish(r.over ? 413 : 400, { error: r.over ? 'payload_too_large' : 'bad_request' });
                }
                if (!telemetryOn) {
                    // приёмник выключен (default): payload разобран? НЕТ — не парсим и не пишем.
                    return finish(503, { error: 'telemetry_disabled' });
                }
                const now = Date.now();
                if (now - windowStart > windowMs) { windowStart = now; postCount = 0; }
                postCount++;
                if (postCount > opts.rateLimit) {
                    return finish(429, { error: 'rate_limited' });
                }
                const provided = extractToken(req);
                if (!tokenOk(provided, opts.token)) {
                    return finish(401, { error: 'unauthorized' });
                }
                let payload;
                try { payload = JSON.parse(r.body.toString('utf8')); } catch (e) { return finish(400, { error: 'invalid_json' }); }
                if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                    return finish(400, { error: 'invalid_envelope' });
                }
                try {
                    appendTelemetry(opts.dataDir, storePath, payload, opts.maxStore, opts.keepRotated);
                } catch (e) {
                    console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', where: 'appendTelemetry', message: String(e && e.message || e) }));
                    return finish(500, { error: 'storage_failed' });
                }
                return finish(202, { ok: true, stored: true });
            });
            return;
        }
        return finish(404, { error: 'not_found' });
    });
    server.ndOptions = opts; // для тестов/диагностики
    return server;
}

function main() {
    const opts = Object.assign({}, DEFAULTS, envOptions());
    const server = createApp(opts);
    server.listen(opts.port, opts.host, () => {
        console.log(JSON.stringify({
            t: new Date().toISOString(), msg: 'nd-config listening',
            host: opts.host, port: opts.port, configDir: opts.configDir, dataDir: opts.dataDir,
            telemetry: (opts.telemetryEnabled && opts.token.length >= 16) ? 'enabled' : 'disabled (default off)'
        }));
    });
    const shutdown = (sig) => {
        console.log(JSON.stringify({ t: new Date().toISOString(), msg: 'shutdown', sig: sig }));
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 2000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) main();

module.exports = { createApp, main, DEFAULTS, CONFIG_FILE_RE, tokenOk, rotateStore };
