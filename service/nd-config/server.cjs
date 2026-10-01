#!/usr/bin/env node
'use strict';
// nd-config — минимальный read-only сервис NeuroDeck (P16 / C6-full шаг 2; R4 очередь 4).
//
// Назначение:
//   1) раздача версионированных конфиг-артефактов (config/weekly-modifiers.vN.json) — источник
//      правды на VPS; клиент (js/remote-config.js) валидирует их сам и имеет safe-fallback;
//   2) opt-in приём телеметрии (POST /v1/telemetry) — по умолчанию ВЫКЛЮЧЕН (ND_TELEMETRY_ENABLED=0),
//      включается только владельцем; клиентский экспорт тоже DEFAULT OFF — игра ничего не шлёт,
//      пока продуктовое решение не принято (docs/operations/TELEMETRY.md §1, §7).
//
// Privacy-гейты приёмника (R4, сервисная версия 2):
//   — ALLOWLIST: принимаются только имена событий/кодов ошибок из клиентского каталога
//     (js/telemetry.js + js/storage.js; синхронность пинится тестом на дрейф);
//   — REDACTION: на диск пишется не присыланное тело, а его sanitized-проекция:
//     href без query/fragment, строки ≤200, секрет-подобные значения замазаны,
//     данные событий — только плоские примитивы ≤8 полей;
//   — RETENTION: записи старше ND_TELEMETRY_RETENTION_DAYS (default 30) вычищаются
//     при ближайшей записи; ротированные файлы старше срока удаляются;
//   — DELETE: DELETE /v1/telemetry (токен) стирает всё накопленное — контракт
//     удаления данных субъекта; работает и при выключенном приёмнике, если задан токен.
//
// Изоляция (правило 17): отдельный unit nd-config.service, никакого пересечения с
// neurodeck-bot.service. Слушает ТОЛЬКО 127.0.0.1 — наружу не выставляется.
// Правило 21: vanilla node (http/fs/crypto), ноль npm-зависимостей.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SERVICE_NAME = 'nd-config';
const SERVICE_VERSION = 2; // v2 (R4): allowlist/redaction/retention/DELETE-контракт

// Дефолты: env переопределяет (см. env.example и unit-файл).
const DEFAULTS = {
    host: '127.0.0.1',
    port: 8095,
    configDir: '/opt/neurodeck-config/current/config', // current → releases/<ts> (атомарный symlink, R4)
    dataDir: '/var/lib/neurodeck-config',      // StateDirectory= юнита (telemetry.jsonl)
    token: '',                                  // ND_CONFIG_TOKEN; пустой = приёмник выключен
    telemetryEnabled: false,                    // opt-in, DEFAULT OFF
    retentionDays: 30,                          // записи старше N дней вычищаются (0 = не вычищать)
    maxBody: 64 * 1024,        // потолок тела POST (клиентский dump() заведённо меньше)
    maxStore: 5 * 1024 * 1024, // ротация telemetry.jsonl после 5 МиБ
    keepRotated: 2,            // хранить .1 .2 (итого ≤ ~15 МиБ)
    rateLimit: 60              // POST/мин суммарно: защита от расшедшейся петли клиента
};

// Privacy-гейт R4: каталог телеметрии. Ровно те имена, которые умеет строить клиент
// (js/telemetry.js: api.event(...), record('error', ...); js/storage.js: ndTel/ndTelErr).
// Дрейф клиентского каталога против серверного allowlist ловит тест
// tests/config-service.test.js («allowlist drift»). Всё, чего здесь нет, — не принимается.
const ENVELOPE_KEYS = ['ts', 'ua', 'href', 'counters', 'events'];
const TELEMETRY_EVENT_NAMES = new Set([
    // js/telemetry.js (самодиагностика среды)
    'diag_boot', 'dom_ready',
    // js/storage.js (diag-события сохранения/облака/recovery)
    'save_ok', 'cloud_push_started', 'cloud_push_ok', 'cloud_push_interrupted',
    'cloud_push_deferred', 'cloud_push_conflict', 'cloud_rollback_used',
    'sync_local_newer_push', 'recovery_offered', 'recovery_accepted',
    'recovery_declined', 'migration_applied',
    // js/telemetry.js error() пишет событие с именем 'error' и кодом в d.code
    'error'
]);
const TELEMETRY_ERROR_CODES = new Set([
    // docs/operations/TELEMETRY.md §4 — полный каталог кодов ошибок клиента
    'STORAGE_WRITE_FAILED', 'LOAD_FAILED', 'SAVE_FROM_FUTURE',
    'CLOUD_PUSH_FAILED', 'CLOUD_META_WRITE_FAILED', 'CLOUD_PUSH_INTERRUPTED',
    'CLOUD_CHUNK_MISSING', 'CLOUD_CHECKSUM_MISMATCH', 'CLOUD_LOAD_TIMEOUT',
    'RUNTIME_ERROR', 'UNHANDLED_REJECTION'
]);

// Разрешены ТОЛЬКО имена артефактов этого вида — путь собрать невозможно (нет сепараторов),
// каталог-обход исключён регуляркой, а не фильтрацией.
const CONFIG_FILE_RE = /^weekly-modifiers\.v\d+\.json$/;

function envBool(v) {
    return v === '1' || v === 'true' || v === 'yes';
}

function envOptions() {
    const port = parseInt(process.env.ND_CONFIG_PORT, 10);
    const retention = parseFloat(process.env.ND_TELEMETRY_RETENTION_DAYS);
    return {
        host: process.env.ND_CONFIG_HOST || DEFAULTS.host,
        port: (Number.isFinite(port) && port > 0 && port < 65536) ? port : DEFAULTS.port,
        configDir: process.env.ND_CONFIG_DIR || DEFAULTS.configDir,
        dataDir: process.env.ND_CONFIG_DATA_DIR || DEFAULTS.dataDir,
        token: process.env.ND_CONFIG_TOKEN || '',
        telemetryEnabled: envBool(process.env.ND_TELEMETRY_ENABLED),
        retentionDays: (Number.isFinite(retention) && retention >= 0) ? retention : DEFAULTS.retentionDays
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

// ---------- privacy-гейты R4 ----------

const REDACTED = '[redacted]';
const MAX_STR = 200;             // потолок любой хранимой строки (клиент режет так же)
const MAX_EVENT_FIELDS = 8;      // потолок полей в d события (как в клиенте)
const MAX_EVENTS = 250;          // клиентское кольцо ≤200; запас на границы
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // полноценная чистка не чаще раза в час
// секрет-подобное содержимое значения: не храним ни в каком поле
const SECRET_VALUE_RE = /(bearer\s|token\s*[=:]|secret\s*[=:]|password\s*[=:]|authorization\s*:)/i;

// Redaction одной строки: секрет-подобное → замазано, длинное → обрезано.
function redactString(s) {
    if (SECRET_VALUE_RE.test(s)) return REDACTED;
    return s.length > MAX_STR ? s.slice(0, MAX_STR) : s;
}

// href: query/fragment могут нести token/user_id — срезаем, храним origin+path.
function redactHref(href) {
    if (typeof href !== 'string' || !href) return '';
    const noFrag = href.split('#')[0].split('?')[0];
    return noFrag.length > MAX_STR ? noFrag.slice(0, MAX_STR) : noFrag;
}

// d события: только плоские примитивы ≤8 полей; объекты/массивы не храним вовсе.
function redactDetail(d) {
    if (d === undefined || d === null) return undefined;
    if (typeof d !== 'object' || Array.isArray(d)) return REDACTED;
    const out = {};
    for (const k of Object.keys(d).slice(0, MAX_EVENT_FIELDS)) {
        const v = d[k];
        if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
        else if (typeof v === 'string') out[k] = redactString(v);
        else out[k] = REDACTED; // вложенные структуры — не храним
    }
    return out;
}

// ALLOWLIST + REDACTION конверта. На диск попадает ТОЛЬКО возвращаемая здесь проекция.
// {ok:true, clean} | {ok:false, error, detail?} — detail несёт имя поля/события (не значение).
function sanitizeEnvelope(p) {
    for (const k of Object.keys(p)) {
        if (ENVELOPE_KEYS.indexOf(k) === -1) return { ok: false, error: 'envelope_field_not_allowed', detail: k };
    }
    const clean = {};
    if ('ts' in p) {
        if (typeof p.ts !== 'number' || !Number.isFinite(p.ts)) return { ok: false, error: 'invalid_envelope', detail: 'ts' };
        clean.ts = p.ts;
    }
    if ('ua' in p) clean.ua = (typeof p.ua === 'string') ? redactString(p.ua) : '';
    if ('href' in p) clean.href = redactHref(p.href);
    if ('counters' in p) {
        if (!p.counters || typeof p.counters !== 'object' || Array.isArray(p.counters)) {
            return { ok: false, error: 'invalid_envelope', detail: 'counters' };
        }
        const counters = {};
        for (const name of Object.keys(p.counters)) {
            if (!TELEMETRY_EVENT_NAMES.has(name)) return { ok: false, error: 'counter_not_allowed', detail: name };
            const v = p.counters[name];
            if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: 'invalid_envelope', detail: 'counters.' + name };
            counters[name] = v;
        }
        clean.counters = counters;
    }
    if ('events' in p) {
        if (!Array.isArray(p.events)) return { ok: false, error: 'invalid_envelope', detail: 'events' };
        if (p.events.length > MAX_EVENTS) return { ok: false, error: 'too_many_events', detail: String(p.events.length) };
        const events = [];
        for (const ev of p.events) {
            if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return { ok: false, error: 'invalid_events' };
            if (typeof ev.t !== 'number' || !Number.isFinite(ev.t)) return { ok: false, error: 'invalid_events', detail: 't' };
            if (typeof ev.n !== 'string' || !TELEMETRY_EVENT_NAMES.has(ev.n)) {
                return { ok: false, error: 'event_not_allowed', detail: (typeof ev.n === 'string') ? ev.n : null };
            }
            if (ev.n === 'error') {
                // ошибка обязана нести код из каталога — иначе это произвольные данные под видом ошибки
                const code = ev && ev.d && typeof ev.d === 'object' ? ev.d.code : undefined;
                if (typeof code !== 'string' || !TELEMETRY_ERROR_CODES.has(code)) {
                    return { ok: false, error: 'error_code_not_allowed', detail: (typeof code === 'string') ? code : null };
                }
            }
            const rec = { t: ev.t, n: ev.n };
            const d = redactDetail(ev.d);
            if (d !== undefined) rec.d = d;
            events.push(rec);
        }
        clean.events = events;
    }
    return { ok: true, clean };
}

// RETENTION: убрать из активного файла записи с receivedAt старее cutoff (mtime-эвристика
// для ротированных), битые строки вычищаются заодно. Перезапись атомарна (tmp + rename),
// права 0600 сохраняются. Возвращает факт вычищенного.
function pruneStore(storePath, keepRotated, retentionDays, nowMs) {
    if (!(retentionDays > 0)) return { droppedLines: 0, removedRotated: 0 }; // 0 = retention выключен
    const cutoff = nowMs - retentionDays * 86400000;
    let droppedLines = 0;
    try {
        const raw = fs.readFileSync(storePath, 'utf8');
        const kept = [];
        for (const line of raw.split('\n')) {
            if (!line) continue;
            let keep = false;
            try {
                const rec = JSON.parse(line);
                keep = !rec.receivedAt || Date.parse(rec.receivedAt) >= cutoff; // без receivedAt — не наше, вычищаем
            } catch (e) { keep = false; }
            if (keep) kept.push(line); else droppedLines++;
        }
        if (droppedLines > 0) {
            const tmp = storePath + '.prune-tmp';
            fs.writeFileSync(tmp, kept.length ? kept.join('\n') + '\n' : '', { mode: 0o600 });
            fs.renameSync(tmp, storePath);
        }
    } catch (e) { /* активного файла нет — чистить нечего */ }
    let removedRotated = 0;
    for (let i = 1; i <= keepRotated; i++) {
        const rp = storePath + '.' + i;
        try {
            const st = fs.statSync(rp);
            if (st.mtimeMs < cutoff) { fs.rmSync(rp); removedRotated++; }
        } catch (e) { /* нет файла — норма */ }
    }
    return { droppedLines, removedRotated };
}

// Фабрика приложения: options сливаются с DEFAULTS (тесты передают свои каталоги/лимиты).
// Возвращает http.Server (не слушает — listen/подписки на сигналы делает main()).
function createApp(options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    // fail-safe: телеметрия считается включённой ТОЛЬКО при явном флаге И токене ≥16 символов.
    const telemetryOn = !!opts.telemetryEnabled && typeof opts.token === 'string' && opts.token.length >= 16;
    const storePath = path.join(opts.dataDir, 'telemetry.jsonl');

    // Rate limit: скользящее окно в 60 с, счётчик общий (сервис localhost + токен —
    // задача лимита не авторизация, а страховка от клиентской петли). Одно окно на POST
    // и DELETE — вместе это страховка от брутфорса токена.
    const windowMs = 60 * 1000;
    let windowStart = Date.now();
    let postCount = 0;
    // RETENTION: чистка ленивая — при очередной записи и не чаще раза в час.
    let lastPruneMs = 0;

    function bumpRateLimit() {
        const now = Date.now();
        if (now - windowStart > windowMs) { windowStart = now; postCount = 0; }
        postCount++;
        return postCount > opts.rateLimit;
    }

    // RETENTION поверх успешной записи; чистка не должна ронять приём (ошибка — в лог).
    function maybePrune() {
        if (!(opts.retentionDays > 0)) return;
        const now = Date.now();
        if (now - lastPruneMs < PRUNE_INTERVAL_MS) return;
        lastPruneMs = now;
        try {
            pruneStore(storePath, opts.keepRotated, opts.retentionDays, now);
        } catch (e) {
            console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', where: 'pruneStore', message: String(e && e.message || e) }));
        }
    }

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
            return finish(200, {
                ok: true, service: SERVICE_NAME, version: SERVICE_VERSION,
                telemetry: telemetryOn ? 'enabled' : 'disabled',
                retention_days: opts.retentionDays
            });
        }
        if (method === 'GET' && url === '/') {
            return finish(200, {
                service: SERVICE_NAME, version: SERVICE_VERSION,
                endpoints: {
                    'GET /healthz': 'живость',
                    'GET /config/<weekly-modifiers.vN.json>': 'read-only конфиг-артефакт',
                    'POST /v1/telemetry': 'opt-in приём (токен; default off; allowlist+redaction)',
                    'DELETE /v1/telemetry': 'удаление всех накопленных записей (токен)'
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
                if (bumpRateLimit()) {
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
                // ALLOWLIST + REDACTION: на диск идёт только sanitized-проекция конверта
                const checked = sanitizeEnvelope(payload);
                if (!checked.ok) {
                    return finish(400, { error: checked.error, detail: checked.detail === undefined ? null : checked.detail });
                }
                try {
                    appendTelemetry(opts.dataDir, storePath, checked.clean, opts.maxStore, opts.keepRotated);
                } catch (e) {
                    console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', where: 'appendTelemetry', message: String(e && e.message || e) }));
                    return finish(500, { error: 'storage_failed' });
                }
                maybePrune();
                return finish(202, { ok: true, stored: true });
            });
            return;
        }
        if (method === 'DELETE' && url === '/v1/telemetry') {
            // Контракт удаления (R4): стереть всё накопленное. Токен-гейт — обязателен;
            // работает и при выключенном приёмнике (флаг выключает ПРИЁМ, не удаление):
            // данные могли быть собраны ранее. Без настроенного токена авторизовать
            // удаление нельзя — 401 (данных при этом быть не могло: приём требует токен).
            readBody(req, opts.maxBody).then((r) => {
                if (!r.ok) {
                    return finish(r.over ? 413 : 400, { error: r.over ? 'payload_too_large' : 'bad_request' });
                }
                if (bumpRateLimit()) {
                    return finish(429, { error: 'rate_limited' });
                }
                if (!tokenOk(extractToken(req), opts.token)) {
                    return finish(401, { error: 'unauthorized' });
                }
                let removed = 0;
                try {
                    const targets = [storePath];
                    for (let i = 1; i <= opts.keepRotated; i++) targets.push(storePath + '.' + i);
                    for (const t of targets) {
                        if (fs.existsSync(t)) { fs.rmSync(t); removed++; }
                    }
                } catch (e) {
                    console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', where: 'deleteTelemetry', message: String(e && e.message || e) }));
                    return finish(500, { error: 'storage_failed' });
                }
                return finish(200, { ok: true, deleted: removed > 0, files_removed: removed });
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

module.exports = {
    createApp, main, DEFAULTS, CONFIG_FILE_RE, tokenOk, rotateStore,
    sanitizeEnvelope, pruneStore, redactString, redactHref, redactDetail,
    ENVELOPE_KEYS, TELEMETRY_EVENT_NAMES, TELEMETRY_ERROR_CODES
};
