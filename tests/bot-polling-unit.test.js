// ============================================================
// ЮНИТ-ЧЕРНОВИКИ bot/polling.js — QA-6 (п.62)
// Проблема: polling.js — монолит без экспортов, при require запускает IIFE
// и process.exit(1) без токена. Тестируемые чистые функции недоступны.
//
// МИНИМАЛЬНЫЙ РЕФАКТОРИНГ (draft, применять фикс-батчу; полный дифф в
// polling-refactor.draft.patch):
//   1. `const api = ...` → `let api = ...` + `function setApiForTests(fn) { api = fn; }`
//   2. IIFE-бутстрап → `async function main() {...}` + `if (require.main === module) main()...`
//   3. DATA_DIR: `path.join(process.env.ND_BOT_DATA_DIR || DATA_DIR_DEFAULT, 'data')`
//   4. `module.exports = { mskParts, schedulerTick, handleMessage, setApiForTests, loadChats, saveChats, REMIND_HOUR, REMIND_MIN };`
//   5. lastFireKey: экспортировать `_resetForTests()` (schedulerTick — stateful)
//
// Этот тестовый файл: ND_BOT_PATH (путь к refactor-копии polling.js) и
// ND_BOT_DATA_DIR (песочница chats.json) берутся из env — репо не трогается.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const BOT_PATH = process.env.ND_BOT_PATH || path.join(__dirname, '..', 'bot', 'polling.js');
// Песочница по умолчанию — tmpdir: после применения патча require репо-файла
// безопасен, а chats.json не должен мусорить в bot/data внутри репозитория.
const DATA_DIR = process.env.ND_BOT_DATA_DIR || path.join(os.tmpdir(), 'neurodeck-bot-unit-' + process.pid);
// Контракт патча: бот-модуль берёт DATA_DIR из env — синхронизируем ДО require,
// иначе тест пишет в песочницу, а бот читает дефолт bot/data (рассылка видит {}).
process.env.ND_BOT_DATA_DIR = DATA_DIR;

// Патч обязателен для запуска: без него require выйдет по process.exit(1)
test.skip(!process.env.ND_BOT_PATH, 'требуется ND_BOT_PATH на refactor-копию (draft-патч)');
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-token-for-unit';

const bot = require(BOT_PATH);

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
    if (bot._resetForTests) bot._resetForTests();
});

// ---------- чистая функция: MSK-время ----------
test('mskParts: ключ даты и MSK-часы (UTC+3)', () => {
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
test('schedulerTick: в окне 21:31 шлёт только подписанным, отписанные скипает', async () => {
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

test('schedulerTick: вне окна — тишина; повторно в тот же день — не дублирует', async () => {
    writeChats({ '111': true });
    bot.setApiForTests(mockApi());
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 10, 0, 0)); // 13:00 МСК — мимо окна
    assert.equal(calls.length, 0);
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 18, 31, 0)); // в окне
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 18, 33, 0)); // снова в окне, тот же день
    assert.equal(calls.filter(c => c.method === 'sendMessage').length, 1, 'lastFireKey защитил от дубля');
});

test('schedulerTick: ошибка API на одном чате не валит рассылку остальных', async () => {
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
test('handleMessage /start: подписка сохраняется + ответ с инструкцией', async () => {
    writeChats({});
    bot.setApiForTests(mockApi());
    await bot.handleMessage({ chat: { id: 42 }, text: ' /start ' });
    assert.equal(readChats()['42'], true);
    assert.equal(calls[0].method, 'sendMessage');
    assert.ok(calls[0].body.text.includes('/stop'), 'в ответе есть команда отписки');
});

test('handleMessage /stop: отписка сохраняется, /status отражает состояние', async () => {
    writeChats({ '42': true });
    bot.setApiForTests(mockApi());
    await bot.handleMessage({ chat: { id: 42 }, text: '/stop' });
    assert.equal(readChats()['42'], false);
    await bot.handleMessage({ chat: { id: 42 }, text: '/status' });
    assert.ok(calls[1].body.text.includes('ВЫКЛ'));
    await bot.handleMessage({ chat: { id: 42 }, text: '/start' });
    await bot.handleMessage({ chat: { id: 42 }, text: '/status' });
    assert.ok(calls[3].body.text.includes('ВКЛ'));
});

test('handleMessage: неизвестная команда — ничего не шлёт и не пишет', async () => {
    writeChats({});
    bot.setApiForTests(mockApi());
    await bot.handleMessage({ chat: { id: 7 }, text: '/foo bar' });
    assert.equal(calls.length, 0);
    assert.deepEqual(readChats(), {});
});

test('handleMessage: сообщение без текста — игнор', async () => {
    writeChats({});
    bot.setApiForTests(mockApi());
    await bot.handleMessage({ chat: { id: 7 } }); // стикер/фото: msg.text undefined
    assert.equal(calls.length, 0);
});

// ---------- ретраи pollLoop (после рефакторинга: выделить pollOnce) ----------
test.skip(!bot.pollOnce, 'pollLoop не выделен в pollOnce — добавить в патч: while(offset){ try{updates=await api()}catch{ await sleep(5000); continue } }');
test('pollLoop: ошибка API → ретрай, offset не теряется', async () => {
    if (!bot.pollOnce) return;
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
