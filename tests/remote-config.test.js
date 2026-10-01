const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// P15 / C6-full шаг 1: versioned remote-config эндгейм-модификаторов (js/remote-config.js +
// config/weekly-modifiers.v1.json). Контракт: валидный конфиг применяется (каталог WEEKLY_MODS_REMOTE
// получает приоритет в weeklyModifierOf), ЛЮБОЙ сбой — битый/просроченный/tampered/сеть — оставляет
// встроенный каталог WEEKLY_MODS (stronghold-data.js). Побочный инвариант parity: remote v1 —
// побайтовая копия встроенного каталога (тот же порядок записей = те же индексы ротации).
const RC = require('../js/remote-config.js');
const SM = require('../js/stronghold-model.js');
const DATA = require('../js/stronghold-data.js');
globalThis.StrongholdData = DATA; // catalog() модели
const BUILTIN = DATA.WEEKLY_MODS;

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'weekly-modifiers.v1.json');
const committedText = fs.readFileSync(CONFIG_PATH, 'utf8');
const committed = JSON.parse(committedText);
// «сейчас» внутри срока действия закоммиченного файла (просроченность проверяем отдельным синтетическим временем)
const NOW = Date.parse('2026-10-01T00:00:00Z');
const AFTER_EXPIRY = Date.parse(committed.expires) + 1;

function cleanup() { RC.resetWeeklyModifiers(); }

// Синтетический валидный конфиг (2 записи — отличноимо от встроенных 7 по длине ротации)
function syntheticConfig(mods) {
    const list = [
        { id: 'syn-a', icon: '🧪', name: 'Синтет А', desc: 'тест', mods: { incomeMult: 1.1, upkeepMult: 1.0, siegeMult: 1.0 } },
        { id: 'syn-b', icon: '🧬', name: 'Синтет Б', desc: 'тест', mods: mods || { incomeMult: 0.9, upkeepMult: 0.9, siegeMult: 0.9 } }
    ];
    return { schema: RC.SCHEMA_ID, version: 2, expires: '2099-01-01T00:00:00Z', modifiers: list, checksum: RC.checksumOf(list) };
}

test('закоммиченный config/weekly-modifiers.v1.json валиден сейчас и = побайтовая копия встроенного каталога', () => {
    const v = RC.validateWeeklyConfig(committedText, Date.now());
    assert.ok(v.ok, 'валиден: ' + JSON.stringify(v));
    assert.equal(v.version, 1);
    assert.equal(v.modifiers.length, BUILTIN.length, '7 записей, как встроенный');
    assert.deepEqual(v.modifiers, BUILTIN, 'содержимое и ПОРЯДОК 1:1 со встроенным WEEKLY_MODS (parity-якорь (1,1)=«Жадность» не дрейфает)');
    assert.equal(v.checksum, committed.checksum, 'checksum файла = пересчитанный');
    assert.equal(committed.checksum, 'fnv1a64:d9fe61b8f37276bf', 'пин checksum каталога v1');
});

test('fnv1a64: вектор-пины алгоритма (синхрон с ndSnapshotChecksum storage.js — charCodeAt/imul)', () => {
    assert.equal(RC.fnv1a64(''), '811c9dc5811c9dc5');
    assert.equal(RC.fnv1a64('neurodeck'), '77895af58650a909');
    assert.equal(RC.checksumOf(BUILTIN), committed.checksum, 'checksumOf(встроенный) = checksum файла');
});

test('валидный конфиг → applied, каталог установлен, модель берёт WEEKLY_MODS_REMOTE; reset возвращает встроенный', async () => {
    try {
        const r = await RC.loadWeeklyConfig({ fetch: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(syntheticConfig())) }), now: NOW });
        assert.ok(r.applied, 'применился');
        assert.equal(r.version, 2);
        assert.equal(r.count, 2);
        assert.equal(SM.weeklyModifierOf(1, 1).id, 'syn-a', 'ротация по синтет-каталогу длины 2: (1,1) → первая запись');
        assert.equal(SM.weeklyModifierOf(1, 4).id, 'syn-b', '(1,4) → вторая запись (индекс sin-хеша при длине 2)');
        assert.equal(SM.weeklyIncomeMult(1, 1, true), 1.1, 'множители из remote');
        assert.equal(SM.weeklySiegeMult(1, 4, true), 0.9);
        assert.equal(SM.weeklyIncomeMult(1, 1, false), 1, 'гейт 20/20 никто не отменял');
    } finally { cleanup(); }
    assert.equal(SM.weeklyModifierOf(1, 1).id, 'greed', 'после reset — встроенный каталог, (1,1)=«Жадность»');
});

test('fallback-приоритет: пустой/кривой WEEKLY_MODS_REMOTE НЕ ломает выбор — модель идёт во встроенный', () => {
    try {
        DATA.WEEKLY_MODS_REMOTE = [];
        assert.equal(SM.weeklyModifierOf(1, 1).id, 'greed', 'пустой remote → встроенный');
        DATA.WEEKLY_MODS_REMOTE = 'не массив';
        assert.equal(SM.weeklyModifierOf(1, 1).id, 'greed', 'кривой remote → встроенный');
        DATA.WEEKLY_MODS_REMOTE = [{ id: 'x', name: 'x', desc: 'x', icon: 'x', mods: { incomeMult: 9, upkeepMult: 1, siegeMult: 1 } }];
        assert.equal(SM.weeklyModifierOf(1, 1).id, 'x');
        assert.equal(SM.weeklyIncomeMult(1, 1, true), 1, 'кламп модели (0;3] защищает даже от кривого remote');
    } finally { cleanup(); }
});

test('битый JSON / не объект / чужая schema / кривая version → ok:false с точным reason', () => {
    assert.equal(RC.validateWeeklyConfig('{не json', NOW).reason, 'parse');
    assert.equal(RC.validateWeeklyConfig('[1,2,3]', NOW).reason, 'shape');
    assert.equal(RC.validateWeeklyConfig(JSON.stringify({ ...syntheticConfig(), schema: 'evil@9' }), NOW).reason, 'schema');
    assert.equal(RC.validateWeeklyConfig(JSON.stringify({ ...syntheticConfig(), version: 'x' }), NOW).reason, 'version');
    assert.equal(RC.validateWeeklyConfig(JSON.stringify({ ...syntheticConfig(), version: 0 }), NOW).reason, 'version');
});

test('кривые modifiers: не массив / пусто / кап 16 / кривой mods / не-строки / дубль id → reason modifiers|modifier', () => {
    const base = syntheticConfig();
    const cases = [
        [{ ...base, modifiers: 'нет' }, 'modifiers'],
        [{ ...base, modifiers: [] }, 'modifiers'],
        [{ ...base, modifiers: Array.from({ length: 17 }, (_, i) => base.modifiers[0]) }, 'modifiers'],
        [{ ...base, modifiers: [{ ...base.modifiers[0], id: '' }] }, 'modifier'],
        [{ ...base, modifiers: [{ ...base.modifiers[0], name: 5 }] }, 'modifier'],
        [{ ...base, modifiers: [{ ...base.modifiers[0], mods: { incomeMult: 0, upkeepMult: 1, siegeMult: 1 } }] }, 'modifier'],
        [{ ...base, modifiers: [{ ...base.modifiers[0], mods: { incomeMult: 4, upkeepMult: 1, siegeMult: 1 } }] }, 'modifier'],
        [{ ...base, modifiers: [base.modifiers[0], base.modifiers[0]] }, 'modifier']
    ];
    for (const [cfg, reason] of cases) assert.equal(RC.validateWeeklyConfig(JSON.stringify(cfg), NOW).reason, reason, JSON.stringify(cfg.modifiers).slice(0, 60));
});

test('просроченный: синтетическое «сейчас» после expires → reason expired; кривая дата → reason expires', () => {
    assert.equal(RC.validateWeeklyConfig(committedText, AFTER_EXPIRY).reason, 'expired');
    assert.equal(RC.validateWeeklyConfig(JSON.stringify({ ...syntheticConfig(), expires: 'завтра' }), NOW).reason, 'expires');
});

test('tampered: правка множителя/имени без пересчёта checksum → reason checksum, каталог НЕ устанавливается', async () => {
    const tampered = JSON.parse(JSON.stringify(syntheticConfig()));
    tampered.modifiers[0].mods.incomeMult = 2.9; // подмена внутри тех же (0;3] — ловит только checksum
    let r = RC.validateWeeklyConfig(JSON.stringify(tampered), NOW);
    assert.equal(r.reason, 'checksum');
    tampered.modifiers[1].name = 'Захвачено';
    r = RC.validateWeeklyConfig(JSON.stringify(tampered), NOW);
    assert.equal(r.reason, 'checksum', 'переименование тоже меняет каноническую строку');
    // полный лоадер: tampered-ответ → applied:false, встроенный каталог на месте
    try {
        const lr = await RC.loadWeeklyConfig({ fetch: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(tampered)) }), now: NOW });
        assert.equal(lr.applied, false);
        assert.equal(lr.reason, 'checksum');
        assert.equal(SM.weeklyModifierOf(1, 1).id, 'greed', 'встроенный каталог нетронут');
        assert.ok(!DATA.WEEKLY_MODS_REMOTE, 'remote-каталог не установлен');
    } finally { cleanup(); }
});

test('canonical: перестановка ключей в JSON не меняет checksum (канонический порядок фиксирован)', () => {
    const reordered = JSON.parse(JSON.stringify(syntheticConfig()));
    reordered.modifiers = reordered.modifiers.map((m) => ({ mods: m.mods, desc: m.desc, name: m.name, icon: m.icon, id: m.id }));
    const v = RC.validateWeeklyConfig(JSON.stringify({ ...reordered, checksum: syntheticConfig().checksum }), NOW);
    assert.ok(v.ok, 'другой порядок ключей исходника → тот же канонический checksum: ' + JSON.stringify(v));
});

test('лоадер-фоллбэки: сеть/HTTP/нет fetch → applied:false, встроенный каталог остаётся', async () => {
    try {
        let r = await RC.loadWeeklyConfig({ fetch: () => Promise.reject(new Error('offline')), now: NOW });
        assert.equal(r.applied, false); assert.equal(r.reason, 'network');
        r = await RC.loadWeeklyConfig({ fetch: () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') }), now: NOW });
        assert.equal(r.applied, false); assert.equal(r.reason, 'network'); assert.ok(/404/.test(r.detail));
        r = await RC.loadWeeklyConfig({ fetch: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('это не конфиг') }), now: NOW });
        assert.equal(r.applied, false); assert.equal(r.reason, 'parse');
        const savedFetch = globalThis.fetch;
        globalThis.fetch = undefined;
        try {
            r = await RC.loadWeeklyConfig({ now: NOW });
            assert.equal(r.applied, false); assert.equal(r.reason, 'no-fetch');
        } finally { globalThis.fetch = savedFetch; }
        assert.equal(SM.weeklyModifierOf(1, 1).id, 'greed', 'все фоллбэки оставили встроенный каталог');
    } finally { cleanup(); }
});

test('проводка: remote-config.js в index.html ДО app.js, в прекэше SW вместе с config-артефактом; вызов в app.js', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const rcPos = html.indexOf('js/remote-config.js?v=');
    const appPos = html.indexOf('js/app.js?v=');
    assert.ok(rcPos > -1 && appPos > rcPos, 'remote-config грузится раньше app.js (NDRemoteConfig должен существовать к буту)');
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    assert.ok(app.includes('NDRemoteConfig.loadWeeklyConfig()'), 'бут вызывает лоадер');
    assert.ok(app.includes('typeof NDRemoteConfig === \'undefined\''), 'typeof-гвард вызова лоадера');
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    assert.ok(sw.includes('js/remote-config.js?v='), 'лоадер в прекэше SW (офлайн-старт)');
    assert.ok(sw.includes('config/weekly-modifiers.v1.json'), 'config-артефакт в прекэше SW (офлайн-фоллбэк того же контента)');
});


test('live global fetch keeps receiver and bypasses HTTP cache', async () => {
    const previous = globalThis.fetch;
    try {
        globalThis.fetch = function(url, options) {
            assert.equal(this, globalThis); assert.equal(options.cache, 'no-store');
            return Promise.resolve({ok: true, text: async () => committedText});
        };
        assert.equal((await RC.loadWeeklyConfig({now: NOW})).applied, true);
    } finally { globalThis.fetch = previous; cleanup(); }
});
test('deadline covers fetch and body; late completion never installs', async () => {
    let finish;
    const result = await RC.loadWeeklyConfig({timeout: 15, fetch: async () => ({ok:true, text: () => new Promise(r => {finish=r;})})});
    assert.equal(result.reason, 'timeout');
    finish(committedText); await new Promise(r => setTimeout(r, 10));
    assert.equal(DATA.WEEKLY_MODS_REMOTE, undefined);
    assert.equal((await RC.loadWeeklyConfig({timeout:15, fetch: () => new Promise(() => {})})).reason, 'timeout');
});
test('response byte cap checks header, UTF8 text and streamed body', async () => {
    for (const response of [
        {ok:true, headers:{get:()=> '65537'}, text:async()=>committedText},
        {ok:true, text:async()=> 'я'.repeat(32769)},
        new Response(new Uint8Array(65537))
    ]) assert.equal((await RC.loadWeeklyConfig({fetch:async()=>response})).reason, 'size');
    assert.equal(DATA.WEEKLY_MODS_REMOTE, undefined);
});
