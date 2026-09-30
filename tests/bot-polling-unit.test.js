// ============================================================
// Юнит-тесты bot/polling.js — QA-6 (п.62). Аудит скипов P3 (2026-10-01):
// рефакторинг из бывшего draft-патча ПРИМЕНЁН коммитом fdd9a94 — polling.js
// экспортирует mskParts/schedulerTick/handleMessage/pollOnce/setApiForTests,
// бутстрап укрыт require.main-guard, DATA_DIR читается из ND_BOT_DATA_DIR.
// Оба прежних скип-маркера (ND_BOT_PATH, «pollOnce не выделен») устарели и
// удалены: они регистрировали фантомные скипы, хотя функционал на месте.
// ND_BOT_PATH остался как ОПЦИОНАЛЬНОЕ переопределение тестируемой копии.
//
// Страховка от регресса в монолит: до require статически проверяем
// экспорт-контракт (module.exports + require.main-guard). Непатченный файл
// при require запускает бутстрап и умирает по process.exit(1), убивая
// файл-процесс раннера — вместо тихой смерти: документированный скип
// функциональных тестов + красный контракт-тест ниже.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const BOT_PATH = process.env.ND_BOT_PATH || path.join(__dirname, '..', 'bot', 'polling.js');
// Песочница по умолчанию — tmpdir: require патченного файла безопасен, а chats.json
// не должен мусорить в bot/data внутри репозитория.
const DATA_DIR = process.env.ND_BOT_DATA_DIR || path.join(os.tmpdir(), 'neurodeck-bot-unit-' + process.pid);
// Контракт патча: бот-модуль берёт DATA_DIR из env — синхронизируем ДО require,
// иначе тест пишет в песочницу, а бот читает дефолт bot/data (рассылка видит {}).
process.env.ND_BOT_DATA_DIR = DATA_DIR;
// Токен тоже до require: бутстрап непатченной копии без токена делает process.exit(1).
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-token-for-unit';

// Экспорт-контракт рефакторинга fdd9a94, статически и ДО require (см. шапку).
const REFACTOR_OK = (() => {
    try {
        const src = fs.readFileSync(BOT_PATH, 'utf8');
        return /module\.exports\s*=/.test(src) && /require\.main\s*===\s*module/.test(src);
    } catch (e) {
        return false;
    }
})();
const SKIP_MONOLITH = REFACTOR_OK ? false
    : 'polling.js без экспорт-контракта fdd9a94 (регресс в монолит?): require запустит бутстрап и убьёт раннер — чинить продукт, не тест';

test('polling.js: экспорт-контракт на месте (module.exports + require.main-guard)', () => {
    assert.equal(REFACTOR_OK, true, 'polling.js регресснул в монолит без экспортов — вернуть контракт fdd9a94 (см. шапку теста)');
});

const bot = REFACTOR_OK ? require(BOT_PATH) : null;

// --- фикстура chats.json в песочнице ---
function writeChats(db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, 'chats.json'), JSON.stringify(db));
}
function readChats() {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'chats.json'), 'utf8'));
}
const calls = [];
function mockApi(reply) {
    return async (method, body) => {
        calls.push({ method, body });
        if (reply && reply[method]) return reply[method](body);
        return {};
    };
}

test.beforeEach(() => {
    calls.length = 0;
    if (bot && bot._resetForTests) bot._resetForTests();
});

// ---------- чистая функция: MSK-время ----------
test('mskParts: ключ даты и MSK-часы (UTC+3)', { skip: SKIP_MONOLITH }, () => {
    const p = bot.mskParts(Date.UTC(2026, 8, 17, 18, 31, 0)); // 21:31 МСК
    // Ключ реализации НЕ паддирован ('2026-9-17': parseInt('09')=9 в шаблоне);
    // для контракта lastFireKey (де-дубль) это некритично — фиксируем фактическую форму.
    assert.match(p.key, /^\d{4}-\d{1,2}-\d{1,2}$/);
    assert.equal(p.key, '2026-9-17');
    assert.equal(p.hour, 21);
    assert.equal(p.minute, 31);
    const winter = bot.mskParts(Date.UTC(2026, 0, 15, 20, 0, 0)); // 23:00 МСК зимой
    assert.equal(winter.hour, 23, 'зимой MSK тоже UTC+3');
});

// ---------- schedulerTick: окно напоминания 21:30–21:34 МСК ----------
test('schedulerTick: в окне 21:31 шлёт только подписанным, отписанные скипает', { skip: SKIP_MONOLITH }, async () => {
    writeChats({ '111': true, '222': false, '333': true });
    bot.setApiForTests(mockApi());
    // 2026-09-17T18:31:00Z = 21:31 МСК — внутри окна
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 18, 31, 0));
    const sent = calls.filter(c => c.method === 'sendMessage');
    assert.deepEqual(sent.map(c => c.body.chat_id), ['111', '333']);
    assert.ok(sent[0].body.text.includes('твердыни'), 'текст напоминания');
    assert.ok(sent[0].body.reply_markup.inline_keyboard[0][0].web_app.url, 'кнопка WebApp');
    assert.equal(readChats()['222'], false, 'отписка не мутируется');
});

test('schedulerTick: вне окна — тишина; повторно в тот же день — не дублирует', { skip: SKIP_MONOLITH }, async () => {
    writeChats({ '111': true });
    bot.setApiForTests(mockApi());
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 10, 0, 0)); // 13:00 МСК — мимо окна
    assert.equal(calls.length, 0);
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 18, 31, 0)); // в окне
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 18, 33, 0)); // снова в окне, тот же день
    assert.equal(calls.filter(c => c.method === 'sendMessage').length, 1, 'lastFireKey защитил от дубля');
});

test('schedulerTick: ошибка API на одном чате не валит рассылку остальных', { skip: SKIP_MONOLITH }, async () => {
    writeChats({ '111': true, '333': true });
    bot.setApiForTests(async (method, body) => {
        if (body.chat_id === '111') throw new Error('socks timeout');
        calls.push({ method, body });
        return {};
    });
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 18, 31, 0));
    assert.deepEqual(calls.filter(c => c.method === 'sendMessage').map(c => c.body.chat_id), ['333']);
});

// ---------- handleMessage: команды ----------
test('handleMessage /start: подписка сохраняется + ответ с инструкцией', { skip: SKIP_MONOLITH }, async () => {
    writeChats({});
    bot.setApiForTests(mockApi());
    await bot.handleMessage({ chat: { id: 42 }, text: ' /start ' });
    assert.equal(readChats()['42'].mode, 'daily', 'v2: /start включает daily (легаси true читается на лету)');
    assert.equal(calls[0].method, 'sendMessage');
    assert.ok(calls[0].body.text.includes('/stop'), 'в ответе есть команда отписки');
});

test('handleMessage /stop: отписка сохраняется, /status отражает состояние', { skip: SKIP_MONOLITH }, async () => {
    writeChats({ '42': true });
    bot.setApiForTests(mockApi());
    await bot.handleMessage({ chat: { id: 42 }, text: '/stop' });
    assert.equal(readChats()['42'].mode, 'off', 'v2: off вместо легаси false');
    await bot.handleMessage({ chat: { id: 42 }, text: '/status' });
    assert.ok(calls[1].body.text.includes('ВЫКЛ'));
    await bot.handleMessage({ chat: { id: 42 }, text: '/start' });
    await bot.handleMessage({ chat: { id: 42 }, text: '/status' });
    assert.ok(calls[3].body.text.includes('ВКЛ'));
});

test('handleMessage: неизвестная команда — ничего не шлёт и не пишет', { skip: SKIP_MONOLITH }, async () => {
    writeChats({});
    bot.setApiForTests(mockApi());
    await bot.handleMessage({ chat: { id: 7 }, text: '/foo bar' });
    assert.equal(calls.length, 0);
    assert.deepEqual(readChats(), {});
});

test('handleMessage: сообщение без текста — игнор', { skip: SKIP_MONOLITH }, async () => {
    writeChats({});
    bot.setApiForTests(mockApi());
    await bot.handleMessage({ chat: { id: 7 } }); // стикер/фото: msg.text undefined
    assert.equal(calls.length, 0);
});

// ---------- ретраи pollLoop: pollOnce выделен и экспортирован (fdd9a94) ----------
test('pollLoop: ошибка API → ретрай, offset не теряется', { skip: SKIP_MONOLITH }, async () => {
    assert.equal(typeof bot.pollOnce, 'function', 'контракт fdd9a94: pollLoop обязан быть выделен в экспортируемый pollOnce');
    writeChats({});
    let n = 0;
    bot.setApiForTests(async (method, body) => {
        if (method === 'getUpdates') {
            if (++n < 3) throw new Error('socks timeout');
            return [{ update_id: 10, message: { chat: { id: 5 }, text: '/status' } }];
        }
        calls.push({ method, body });
        return {};
    });
    const off = await bot.pollOnce(0, { sleepMs: 1 });
    assert.equal(off, 11);
    assert.equal(calls[calls.length - 1].body.chat_id, '5');
});
