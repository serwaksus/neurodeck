const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
// P16 / C6-full шаг 2 + R4 (очередь 4): read-only сервис nd-config (service/nd-config/server.cjs).
// Контракты: конфиг-артефакты только из whitelist-regex (обход каталога невозможен), байты 1:1
// с закоммиченным артефактом; телеметрия opt-in — DEFAULT OFF (503), fail-safe без токена (503),
// без/с неверным токеном — 401, валидный — 202 + JSONL; перелимит 413; rate-limit 429;
// ротация telemetry.jsonl → .1. Слушает только 127.0.0.1 (пин DEFAULTS).
// R4 privacy-гейты (сервисная версия 2): allowlist событий/кодов ошибок из клиентского
// каталога (+ тест на дрейф), redaction (href без query, строки ≤200, секреты замазаны,
// только плоские d ≤8 полей), retention (ленивая чистка по возрасту), DELETE-контракт
// (токен; работает и при выключенном приёмнике).
const { createApp, DEFAULTS, CONFIG_FILE_RE } = require('../service/nd-config/server.cjs');
const {
    TELEMETRY_EVENT_NAMES, TELEMETRY_ERROR_CODES, sanitizeEnvelope, pruneStore
} = require('../service/nd-config/server.cjs');

const CONFIG_SRC = path.join(__dirname, '..', 'config', 'weekly-modifiers.v1.json');
const committedBytes = fs.readFileSync(CONFIG_SRC);
const TOKEN = 't'.repeat(32); // ≥16 — валидная длина для fail-safe

const running = [];
const tmpDirs = [];
function mkdtemp(prefix) { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); tmpDirs.push(d); return d; }

// Старт приложения на эфемерном порту; overrides — как в createApp.
async function startApp(overrides) {
    const configDir = mkdtemp('nd-cfg-dir-');
    const dataDir = mkdtemp('nd-cfg-data-');
    fs.copyFileSync(CONFIG_SRC, path.join(configDir, 'weekly-modifiers.v1.json'));
    const server = createApp(Object.assign({ configDir, dataDir }, overrides || {}));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    running.push(server);
    return { server, base, configDir, dataDir };
}

function store(dataDir) { return path.join(dataDir, 'telemetry.jsonl'); }
function lines(dataDir) {
    return fs.readFileSync(store(dataDir), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test.after(() => Promise.all(running.map((s) => new Promise((r) => s.close(r))))
    .then(() => { for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} } }));

// ---------- инварианты изоляции (правила 17/21 и спека P16) ----------

test('DEFAULTS: только localhost:8095, телеметрия default off, retention 30, ноль npm-зависимостей', async () => {
    assert.equal(DEFAULTS.host, '127.0.0.1', 'пин: слушать только loopback');
    assert.equal(DEFAULTS.port, 8095, 'пин: порт из спеки P16');
    assert.equal(DEFAULTS.telemetryEnabled, false, 'opt-in телеметрия DEFAULT OFF');
    assert.equal(DEFAULTS.retentionDays, 30, 'пин R4: retention по умолчанию 30 дней');
    assert.equal(DEFAULTS.configDir, '/opt/neurodeck-config/current/config', 'конфиги через атомарный symlink current (R4)');
    assert.ok(CONFIG_FILE_RE.test('weekly-modifiers.v1.json'));
    assert.ok(!CONFIG_FILE_RE.test('weekly-modifiers.v1.json.bak'));
    assert.ok(!CONFIG_FILE_RE.test('../env'), 'обход каталога режется регуляркой');
    assert.ok(!CONFIG_FILE_RE.test('a/weekly-modifiers.v1.json'), 'сепараторы путей запрещены');
    // vanilla: все require — встроенные модули node
    const src = fs.readFileSync(path.join(__dirname, '..', 'service', 'nd-config', 'server.cjs'), 'utf8');
    const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
    assert.ok(requires.every((x) => /^(node:)?(http|fs|path|crypto)$/.test(x)), 'только node-встроенные: ' + requires.join(','));
    assert.match(src, /const SERVICE_VERSION = 2/, 'пин: сервисная версия 2 (allowlist/redaction/retention/delete)');
});

test('unit-файл nd-config.service изолирован от прод-бота (правило 17) и стартует через current', () => {
    const unitRaw = fs.readFileSync(path.join(__dirname, '..', 'service', 'nd-config', 'nd-config.service'), 'utf8');
    const unit = unitRaw.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'); // комментарии не в счёт
    assert.ok(!/neurodeck-bot/.test(unit), 'активные директивы не ссылаются на бота (пути/юзер/зависимости)');
    assert.ok(!/8099/.test(unit), 'не занимает порт тестового стенда');
    assert.ok(/DynamicUser=yes/.test(unit), 'транзиентный пользователь, не юзер бота');
    assert.ok(/ProtectSystem=strict/.test(unit) && /NoNewPrivileges=true/.test(unit), 'харднинг юнита');
    assert.match(unit, /ExecStart=.*\/opt\/neurodeck-config\/current\/server\.cjs/, 'старт через атомарный symlink current (R4)');
    assert.ok(!/ExecStart=.*\/opt\/neurodeck-config\/server\.cjs/.test(unit), 'плоский путь (без current) запрещён');
    const deployRaw = fs.readFileSync(path.join(__dirname, '..', 'service', 'nd-config', 'deploy.sh'), 'utf8');
    const deploy = deployRaw.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'); // комментарии не в счёт
    assert.ok(!/neurodeck-bot/.test(deploy), 'рабочие строки deploy.sh вообще не обращаются к боту (упоминание — только в комментарии-обосновании)');
    assert.ok(!/neurodeck-bot/.test(deployRaw) || !/systemctl[^#\n]*neurodeck-bot/.test(deployRaw), 'никаких systemctl-обращений к боту даже в комментариях');
    assert.ok(!/systemctl\s+(restart|stop|disable|start|enable)\s+neurodeck-bot/.test(deploy), 'deploy.sh не управляет сервисом бота');
    assert.ok(!/\/opt\/neurodeck-bot/.test(deploy), 'deploy.sh не трогает каталоги бота');
});

// ---------- read-only конфиг ----------

test('GET /config/weekly-modifiers.v1.json: 200, байты 1:1 с артефактом, content-type, ETag→304', async () => {
    const { base } = await startApp();
    const r = await fetch(base + '/config/weekly-modifiers.v1.json');
    assert.equal(r.status, 200);
    assert.ok(/^application\/json/.test(r.headers.get('content-type') || ''));
    const buf = Buffer.from(await r.arrayBuffer());
    assert.deepEqual(buf, committedBytes, 'раздача без перегенерации: побайтовая копия артефакта');
    const etag = r.headers.get('etag');
    assert.ok(etag, 'ETag присутствует');
    const r304 = await fetch(base + '/config/weekly-modifiers.v1.json', { headers: { 'If-None-Match': etag } });
    assert.equal(r304.status, 304);
});

test('GET /config/<не-whitelist>: 404 (неизвестное имя, обход, подкаталог)', async () => {
    const { base } = await startApp();
    for (const p of ['/config/unknown.json', '/config/../env', '/config/../server.cjs', '/config/nested/weekly-modifiers.v1.json', '/config/weekly-modifiers.vx.json']) {
        const r = await fetch(base + p);
        assert.equal(r.status, 404, p);
    }
});

test('GET / и /healthz: самопрезентация и живость (telemetry: disabled, retention)', async () => {
    const { base } = await startApp();
    const h = await (await fetch(base + '/healthz')).json();
    assert.equal(h.ok, true);
    assert.equal(h.telemetry, 'disabled');
    assert.equal(h.service, 'nd-config');
    assert.equal(h.version, 2, 'сервисная версия 2 (R4)');
    assert.equal(h.retention_days, 30, 'retention виден в healthz');
    const i = await (await fetch(base + '/')).json();
    assert.ok(i.endpoints['POST /v1/telemetry']);
    assert.ok(i.endpoints['DELETE /v1/telemetry'], 'R4: контракт удаления представлен в self-index');
});

// ---------- телеметрия: opt-in, default off ----------

test('телеметрия выключена (default): POST → 503 telemetry_disabled, файл не создаётся', async () => {
    const { base, dataDir } = await startApp();
    const r = await fetch(base + '/v1/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
        body: JSON.stringify({ events: [] })
    });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'telemetry_disabled');
    assert.ok(!fs.existsSync(store(dataDir)), 'ничего не написано');
});

test('fail-safe: флаг=1, но токен пустой/короткий → приёмник всё равно выключен', async () => {
    for (const bad of ['', 'short']) {
        const { base } = await startApp({ telemetryEnabled: true, token: bad });
        const r = await fetch(base + '/v1/telemetry', { method: 'POST', body: '{}' });
        assert.equal(r.status, 503, 'token=' + JSON.stringify(bad));
    }
});

test('включённая телеметрия: без токена и с неверным → 401; с верным (Bearer и X-ND-Token) → 202 + JSONL', async () => {
    const { base, dataDir } = await startApp({ telemetryEnabled: true, token: TOKEN });
    const dump = { ts: 123, ua: 'ua', href: 'https://x/', counters: { save_ok: 2 }, events: [{ t: 1, n: 'save_ok', d: { gen: 3 } }] };

    assert.equal((await fetch(base + '/v1/telemetry', { method: 'POST', body: JSON.stringify(dump) })).status, 401, 'без заголовка');
    assert.equal((await fetch(base + '/v1/telemetry', { method: 'POST', headers: { Authorization: 'Bearer wrong' }, body: JSON.stringify(dump) })).status, 401, 'неверный токен');
    assert.ok(!fs.existsSync(store(dataDir)), 'после 401 ничего не написано');

    const ok1 = await fetch(base + '/v1/telemetry', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(dump) });
    assert.equal(ok1.status, 202);
    assert.equal((await ok1.json()).stored, true);

    const ok2 = await fetch(base + '/v1/telemetry', { method: 'POST', headers: { 'X-ND-Token': TOKEN }, body: JSON.stringify(dump) });
    assert.equal(ok2.status, 202, 'второй формат заголовка');

    const rows = lines(dataDir);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0].payload, dump, 'payload сохранён как есть, одной строкой JSONL');
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(rows[0].receivedAt), 'конверт receivedAt ISO');
    assert.equal(fs.statSync(store(dataDir)).mode & 0o777, 0o600, 'файл закрыт от других юзеров');
});

test('валидация конверта: битый JSON → 400, массив/строка → 400, перелимит тела → 413', async () => {
    const { base } = await startApp({ telemetryEnabled: true, token: TOKEN, maxBody: 200 });
    assert.equal((await fetch(base + '/v1/telemetry', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: '{oops' })).status, 400);
    assert.equal((await fetch(base + '/v1/telemetry', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: '[1,2]' })).status, 400);
    assert.equal((await fetch(base + '/v1/telemetry', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: '"str"' })).status, 400);
    const big = 'x'.repeat(500);
    assert.equal((await fetch(base + '/v1/telemetry', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: big })).status, 413);
});

test('rate limit: после N валидных POST в окне → 429', async () => {
    const { base } = await startApp({ telemetryEnabled: true, token: TOKEN, rateLimit: 3 });
    const post = () => fetch(base + '/v1/telemetry', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: '{"events":[]}' });
    assert.equal((await post()).status, 202);
    assert.equal((await post()).status, 202);
    assert.equal((await post()).status, 202);
    assert.equal((await post()).status, 429, 'четвёртый в окне — отказ');
});

test('ротация: при переполнении telemetry.jsonl → .1, данные не теряются молча', async () => {
    const { base, dataDir } = await startApp({ telemetryEnabled: true, token: TOKEN, maxStore: 1 });
    const post = (i) => fetch(base + '/v1/telemetry', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + TOKEN },
        body: JSON.stringify({ ts: i, counters: { save_ok: i }, events: [] })
    });
    assert.equal((await post(1)).status, 202);
    assert.equal((await post(2)).status, 202); // вторая запись: размер ≥ maxStore → ротация
    assert.ok(fs.existsSync(store(dataDir) + '.1'), 'прошлый файл сдвинут в .1');
    assert.deepEqual(lines(dataDir).map((l) => l.payload.ts), [2], 'в активном файле — последняя запись');
    const rotated = fs.readFileSync(store(dataDir) + '.1', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(rotated.map((l) => l.payload.ts), [1], 'в .1 — первая запись');
});

// ---------- R4: privacy-гейты (allowlist / redaction / retention / delete) ----------

const postDump = (base, payload, token) => fetch(base + '/v1/telemetry', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (token || TOKEN) },
    body: JSON.stringify(payload)
});

test('allowlist: неизвестное поле конверта → 400 envelope_field_not_allowed (имя, не значение)', async () => {
    const { base } = await startApp({ telemetryEnabled: true, token: TOKEN });
    const r = await postDump(base, { ts: 1, save: { gen: 3 } }); // save_ok под чужим именем
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, 'envelope_field_not_allowed');
    assert.equal(body.detail, 'save', 'detail — имя поля, не содержимое');
});

test('allowlist: неизвестное имя события/счётчика → 400; пустое имя события → 400', async () => {
    const { base } = await startApp({ telemetryEnabled: true, token: TOKEN });
    let r = await postDump(base, { ts: 1, events: [{ t: 1, n: 'arbitrary_exfil', d: { x: 1 } }] });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'event_not_allowed');

    r = await postDump(base, { ts: 1, counters: { total_requests: 5 } });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'counter_not_allowed');

    r = await postDump(base, { ts: 1, events: [{ t: 1, n: 'error', d: { code: 'MADE_UP_CODE' } }] });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'error_code_not_allowed');

    // валидный код ошибки из каталога — проходит
    r = await postDump(base, { ts: 1, events: [{ t: 1, n: 'error', d: { code: 'CLOUD_PUSH_FAILED', message: 'x' } }] });
    assert.equal(r.status, 202);
});

test('allowlist: структурные нарушения конверта → 400 (events не массив, counters не объект, ts не число)', async () => {
    const { base } = await startApp({ telemetryEnabled: true, token: TOKEN });
    for (const bad of [
        { ts: 1, events: {} },
        { ts: 1, counters: [] },
        { ts: 'yesterday' },
        { ts: 1, events: [42] },
        { ts: 1, events: [{ n: 'save_ok' }] }
    ]) {
        const r = await postDump(base, bad);
        assert.equal(r.status, 400, JSON.stringify(bad));
        assert.match((await r.json()).error, /^invalid_(envelope|events)$/, JSON.stringify(bad));
    }
    // d-строка вместо объекта — не отказ, а redaction (безопасное значение)
    const r = await postDump(base, { ts: 1, events: [{ t: 1, n: 'save_ok', d: 'flat-string' }] });
    assert.equal(r.status, 202);
});

test('redaction: на диск пишется только sanitized-проекция (href без query, ≤200, секреты замазаны)', async () => {
    const { base, dataDir } = await startApp({ telemetryEnabled: true, token: TOKEN });
    const r = await postDump(base, {
        ts: 1727600000000,
        ua: 'U'.repeat(500),
        href: 'https://game.example/play?token=SECRETTOKEN&user=42#frag',
        counters: { save_ok: 3 },
        events: [
            { t: 1, n: 'save_ok', d: { gen: 3, auth: 'Bearer abc123', long: 'L'.repeat(500), nested: { a: 1 }, flag: true } },
            { t: 2, n: 'error', d: { code: 'RUNTIME_ERROR', message: 'M'.repeat(500) } }
        ]
    });
    assert.equal(r.status, 202);
    const rows = lines(dataDir);
    assert.equal(rows.length, 1);
    const p = rows[0].payload;
    assert.equal(p.ts, 1727600000000, 'ts хранится как есть');
    assert.equal(p.ua.length, 200, 'ua обрезан до 200');
    assert.equal(p.href, 'https://game.example/play', 'href без query/fragment');
    assert.equal(p.counters.save_ok, 3);
    const d = p.events[0].d;
    assert.equal(d.gen, 3, 'числа проходят');
    assert.equal(d.auth, '[redacted]', 'Bearer-значение замазано');
    assert.equal(d.long.length, 200, 'длинная строка обрезана');
    assert.equal(d.nested, '[redacted]', 'вложенный объект не хранится');
    assert.equal(d.flag, true, 'boolean проходит');
    assert.equal(p.events[1].d.message.length, 200, 'message ошибки обрезан');
    // сырого секрета в файле нет вообще
    assert.ok(!fs.readFileSync(store(dataDir), 'utf8').includes('SECRETTOKEN'));
    assert.ok(!fs.readFileSync(store(dataDir), 'utf8').includes('Bearer abc123'));
});

test('redaction: sanitizeEnvelope чист и детерминирован на реальном клиентском dump()', () => {
    const dump = {
        ts: 123, ua: 'ua', href: 'https://x/',
        counters: { save_ok: 2, error: 1 },
        events: [
            { t: 1, n: 'save_ok', d: { gen: 3 } },
            { t: 2, n: 'cloud_push_conflict', d: {} },
            { t: 3, n: 'error', d: { code: 'CLOUD_PUSH_FAILED', message: 'm' } }
        ]
    };
    const res = sanitizeEnvelope(dump);
    assert.equal(res.ok, true);
    assert.deepEqual(res.clean, dump, 'валидный клиентский dump проходит без искажений');
});

test('retention: записи старше срока вычищаются при очередной записи, свежие остаются', async () => {
    const { base, dataDir } = await startApp({ telemetryEnabled: true, token: TOKEN, retentionDays: 0.25 }); // 6 часов
    const old = new Date(Date.now() - 7 * 3600 * 1000).toISOString();
    fs.appendFileSync(store(dataDir), JSON.stringify({ receivedAt: old, payload: { ts: 1 } }) + '\n', { mode: 0o600 });
    assert.equal((await postDump(base, { ts: 2, events: [] })).status, 202);
    const rows = lines(dataDir);
    assert.deepEqual(rows.map((l) => l.payload.ts), [2], 'старая (7ч) запись вычищена, свежая осталась');
    assert.equal(fs.statSync(store(dataDir)).mode & 0o777, 0o600, 'права 0600 сохранены после атомарной перезаписи');
});

test('retention: ротированные файлы старше срока удаляются; retentionDays=0 — ничего не вычищает', async () => {
    const { base, dataDir } = await startApp({ telemetryEnabled: true, token: TOKEN, retentionDays: 1 });
    const rotated = store(dataDir) + '.1';
    fs.writeFileSync(rotated, JSON.stringify({ receivedAt: new Date().toISOString(), payload: { ts: 0 } }) + '\n', { mode: 0o600 });
    const old = new Date(Date.now() - 48 * 3600 * 1000);
    fs.utimesSync(rotated, old, old);
    assert.equal((await postDump(base, { ts: 1, events: [] })).status, 202);
    assert.ok(!fs.existsSync(rotated), 'ротированный файл старше retention удалён');

    const keep = store(dataDir) + '.1';
    fs.writeFileSync(keep, '{}\n', { mode: 0o600 });
    const res = pruneStore(store(dataDir), 2, 0, Date.now()); // retention 0 = выключено
    assert.ok(fs.existsSync(keep), 'retentionDays=0 — файлы не трогаются');
    assert.deepEqual(res, { droppedLines: 0, removedRotated: 0 });
    fs.rmSync(keep, { force: true });
});

test('DELETE /v1/telemetry: токен-гейт; стирает активный и ротированные; повторная запись работает', async () => {
    const { base, dataDir } = await startApp({ telemetryEnabled: true, token: TOKEN });
    assert.equal((await postDump(base, { ts: 1, events: [] })).status, 202);
    fs.writeFileSync(store(dataDir) + '.1', '{}\n', { mode: 0o600 });

    let r = await fetch(base + '/v1/telemetry', { method: 'DELETE' });
    assert.equal(r.status, 401, 'без токеня — отказ');
    r = await fetch(base + '/v1/telemetry', { method: 'DELETE', headers: { Authorization: 'Bearer wrong' } });
    assert.equal(r.status, 401, 'неверный токен — отказ');
    assert.ok(fs.existsSync(store(dataDir)), 'после 401 данные на месте');

    r = await fetch(base + '/v1/telemetry', { method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN } });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.deleted, true);
    assert.equal(body.files_removed, 2, 'активный + ротированный');
    assert.ok(!fs.existsSync(store(dataDir)));
    assert.ok(!fs.existsSync(store(dataDir) + '.1'));

    r = await fetch(base + '/v1/telemetry', { method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN } });
    assert.equal((await r.json()).deleted, false, 'повторное удаление пустого стора — deleted:false');

    assert.equal((await postDump(base, { ts: 2, events: [] })).status, 202, 'приём работает после удаления');
});

test('DELETE работает и при выключенном приёмнике (флаг выключает приём, не удаление данных)', async () => {
    const { base } = await startApp({ telemetryEnabled: false, token: TOKEN });
    const r = await fetch(base + '/v1/telemetry', { method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).deleted, false, 'файлов не было — но операция валидна');
    // без настроенного токена авторизовать удаление нельзя (и данных быть не могло)
    const { base: noTokenBase } = await startApp({ telemetryEnabled: false, token: '' });
    const r2 = await fetch(noTokenBase + '/v1/telemetry', { method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN } });
    assert.equal(r2.status, 401);
});

test('allowlist drift: серверный каталог синхронен клиентскому коду и документации', () => {
    const telemetrySrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'telemetry.js'), 'utf8');
    const storageSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
    const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'operations', 'TELEMETRY.md'), 'utf8');

    // всё, что клиент реально шлёт (js/telemetry.js + js/storage.js), сервер обязан принимать
    const clientEvents = [
        ...[...telemetrySrc.matchAll(/api\.event\('([^']+)'/g)].map((m) => m[1]),
        ...[...storageSrc.matchAll(/ndTel\('([^']+)'/g)].map((m) => m[1]),
        'error' // js/telemetry.js error() → record('error', ...)
    ];
    for (const name of new Set(clientEvents)) {
        assert.ok(TELEMETRY_EVENT_NAMES.has(name), 'событие клиента не в серверном allowlist: ' + name);
    }
    const clientCodes = [
        ...[...telemetrySrc.matchAll(/api\.error\('([^']+)'/g)].map((m) => m[1]),
        ...[...storageSrc.matchAll(/ndTelErr\('([^']+)'/g)].map((m) => m[1]),
        ...[...storageSrc.matchAll(/rejectGen\('([A-Z_]+)'/g)].map((m) => m[1])
    ];
    for (const code of new Set(clientCodes)) {
        assert.ok(TELEMETRY_ERROR_CODES.has(code), 'код ошибки клиента не в серверном каталоге: ' + code);
    }

    // и наоборот: каждый элемент allowlist реально производится клиентом или документацией —
    // мёртвые имена не накапливаются
    for (const name of TELEMETRY_EVENT_NAMES) {
        const inCode = clientEvents.includes(name);
        const inDoc = new RegExp('`' + name + '`').test(doc);
        assert.ok(inCode || inDoc, 'имя в allowlist не производится клиентом и не в документации: ' + name);
    }
    for (const code of TELEMETRY_ERROR_CODES) {
        const inCode = clientCodes.includes(code);
        const inDoc = new RegExp('`' + code + '`').test(doc);
        assert.ok(inCode || inDoc, 'код в каталоге не производится клиентом и не в документации: ' + code);
    }
});
