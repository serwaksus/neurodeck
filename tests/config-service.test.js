const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
// P16 / C6-full шаг 2: минимальный read-only сервис nd-config (service/nd-config/server.cjs).
// Контракты: конфиг-артефакты только из whitelist-regex (обход каталога невозможен), байты 1:1
// с закоммиченным артефактом; телеметрия opt-in — DEFAULT OFF (503), fail-safe без токена (503),
// без/с неверным токеном — 401, валидный — 202 + JSONL; перелимит 413; rate-limit 429;
// ротация telemetry.jsonl → .1. Слушает только 127.0.0.1 (пин DEFAULTS).
const { createApp, DEFAULTS, CONFIG_FILE_RE } = require('../service/nd-config/server.cjs');

const CONFIG_SRC = path.join(__dirname, '..', 'config', 'weekly-modifiers.v1.json');
const committedBytes = fs.readFileSync(CONFIG_SRC);
const TOKEN = 't'.repeat(32); // ≥16 — валидная длина для fail-safe

const running = [];
function mkdtemp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

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

test.after(() => Promise.all(running.map((s) => new Promise((r) => s.close(r)))));

// ---------- инварианты изоляции (правила 17/21 и спека P16) ----------

test('DEFAULTS: только localhost:8095, телеметрия default off, ноль npm-зависимостей', async () => {
    assert.equal(DEFAULTS.host, '127.0.0.1', 'пин: слушать только loopback');
    assert.equal(DEFAULTS.port, 8095, 'пин: порт из спеки P16');
    assert.equal(DEFAULTS.telemetryEnabled, false, 'opt-in телеметрия DEFAULT OFF');
    assert.ok(CONFIG_FILE_RE.test('weekly-modifiers.v1.json'));
    assert.ok(!CONFIG_FILE_RE.test('weekly-modifiers.v1.json.bak'));
    assert.ok(!CONFIG_FILE_RE.test('../env'), 'обход каталога режется регуляркой');
    assert.ok(!CONFIG_FILE_RE.test('a/weekly-modifiers.v1.json'), 'сепараторы путей запрещены');
    // vanilla: все require — встроенные модули node
    const src = fs.readFileSync(path.join(__dirname, '..', 'service', 'nd-config', 'server.cjs'), 'utf8');
    const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
    assert.ok(requires.every((x) => /^(node:)?(http|fs|path|crypto)$/.test(x)), 'только node-встроенные: ' + requires.join(','));
});

test('unit-файл nd-config.service изолирован от прод-бота (правило 17)', () => {
    const unitRaw = fs.readFileSync(path.join(__dirname, '..', 'service', 'nd-config', 'nd-config.service'), 'utf8');
    const unit = unitRaw.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'); // комментарии не в счёт
    assert.ok(!/neurodeck-bot/.test(unit), 'активные директивы не ссылаются на бота (пути/юзер/зависимости)');
    assert.ok(!/8099/.test(unit), 'не занимает порт тестового стенда');
    assert.ok(/DynamicUser=yes/.test(unit), 'транзиентный пользователь, не юзер бота');
    assert.ok(/ProtectSystem=strict/.test(unit) && /NoNewPrivileges=true/.test(unit), 'харднинг юнита');
    const deploy = fs.readFileSync(path.join(__dirname, '..', 'service', 'nd-config', 'deploy.sh'), 'utf8');
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

test('GET / и /healthz: самопрезентация и живость (telemetry: disabled)', async () => {
    const { base } = await startApp();
    const h = await (await fetch(base + '/healthz')).json();
    assert.equal(h.ok, true);
    assert.equal(h.telemetry, 'disabled');
    assert.equal(h.service, 'nd-config');
    const i = await (await fetch(base + '/')).json();
    assert.ok(i.endpoints['POST /v1/telemetry']);
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
    const post = (i) => fetch(base + '/v1/telemetry', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify({ i }) });
    assert.equal((await post(1)).status, 202);
    assert.equal((await post(2)).status, 202); // вторая запись: размер ≥ maxStore → ротация
    assert.ok(fs.existsSync(store(dataDir) + '.1'), 'прошлый файл сдвинут в .1');
    assert.deepEqual(lines(dataDir).map((l) => l.payload.i), [2], 'в активном файле — последняя запись');
    const rotated = fs.readFileSync(store(dataDir) + '.1', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(rotated.map((l) => l.payload.i), [1], 'в .1 — первая запись');
});
