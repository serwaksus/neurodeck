'use strict';
// Бот v2 (волна 2, 2026-09-28): режимы daily/sunday/off, время /start ЧЧ:ММ,
// персист lastFire (без дублей при рестарте), догоняющая отправка после простоя.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const BOT_PATH = path.join(__dirname, '..', 'bot', 'polling.js');
const DATA_DIR = process.env.ND_BOT_DATA_DIR || path.join(os.tmpdir(), 'neurodeck-bot-v2-' + process.pid);
process.env.ND_BOT_DATA_DIR = DATA_DIR;
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-token-for-unit';
const bot = require(BOT_PATH);

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

// --- опорные моменты МСК: 2026-09-20 — воскресенье, 2026-09-21 — понедельник ---
const SUN_2131 = Date.UTC(2026, 8, 20, 18, 31, 0);
const MON_2131 = Date.UTC(2026, 8, 21, 18, 31, 0);
const THU_2131 = Date.UTC(2026, 8, 17, 18, 31, 0);

test('normEntry: легаси true/false читаются как daily/off, мусор — дефолты', () => {
    assert.deepEqual(bot.normEntry(true), { mode: 'daily', hour: 21, minute: 30, lastFire: '' });
    assert.equal(bot.normEntry(false).mode, 'off');
    assert.equal(bot.normEntry({ mode: 'sunday', hour: 8, minute: 5 }).hour, 8);
    assert.equal(bot.normEntry({ mode: 'weird' }).mode, 'daily', 'неизвестный режим → daily');
    assert.equal(bot.normEntry({ hour: 99 }).hour, 21, 'час вне 0..23 → дефолт');
    assert.equal(bot.normEntry(undefined).mode, 'off');
});

test('parseHHMM: ЧЧ:ММ валидируется', () => {
    assert.deepEqual(bot.parseHHMM('20:05'), { h: 20, m: 5 });
    assert.equal(bot.parseHHMM('24:00'), null);
    assert.equal(bot.parseHHMM('20:60'), null);
    assert.equal(bot.parseHHMM('вечером'), null);
    assert.equal(bot.parseHHMM(''), null);
});

test('schedulerTick: режим sunday — только воскресенье', async () => {
    writeChats({ '777': { mode: 'sunday', hour: 21, minute: 30, lastFire: '' } });
    bot.setApiForTests(mockApi());
    await bot.schedulerTick(THU_2131);
    assert.equal(calls.filter((c) => c.method === 'sendMessage').length, 0, 'в четверг тишина');
    await bot.schedulerTick(MON_2131);
    assert.equal(calls.filter((c) => c.method === 'sendMessage').length, 0, 'в понедельник тишина');
    await bot.schedulerTick(SUN_2131);
    const sent = calls.filter((c) => c.method === 'sendMessage');
    assert.equal(sent.length, 1, 'в воскресенье напоминание об осаде');
    assert.ok(sent[0].body.text.includes('осада'), 'текст про осаду');
    assert.equal(readChats()['777'].lastFire, '2026-9-20', 'lastFire персистится');
});

test('schedulerTick: кастомное время /start 08:15 срабатывает в 08:15, а не в 21:30', async () => {
    writeChats({ '555': { mode: 'daily', hour: 8, minute: 15, lastFire: '' } });
    bot.setApiForTests(mockApi());
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 5, 16, 0)); // 08:16 МСК
    assert.equal(calls.filter((c) => c.method === 'sendMessage').length, 1, 'напоминание в 08:15+окно');
    await bot.schedulerTick(THU_2131); // 21:31 — не время этого чата
    assert.equal(calls.filter((c) => c.method === 'sendMessage').length, 1);
});

test('schedulerTick: рестарт не дублирует, простой ≤2 ч — догоняет', async () => {
    writeChats({ '888': { mode: 'daily', hour: 21, minute: 30, lastFire: '' } });
    bot.setApiForTests(mockApi());
    await bot.schedulerTick(THU_2131);
    assert.equal(calls.filter((c) => c.method === 'sendMessage').length, 1);
    // «рестарт»: новый вызов tick в тот же день в окне — lastFire уже в chats.json
    bot.setApiForTests(mockApi());
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 18, 33, 0));
    assert.equal(calls.filter((c) => c.method === 'sendMessage').length, 1, 'дубля нет после рестарта');
    // «простой»: бот ожил в 22:00 (target+30 мин) на СЛЕДУЮЩИЙ день — догоняет
    writeChats({ '888': { mode: 'daily', hour: 21, minute: 30, lastFire: '' } });
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 19, 0, 0));
    assert.equal(calls.filter((c) => c.method === 'sendMessage').length, 2, 'догоняющая отправка после простоя');
    // слишком поздно (>2 ч) — молчим
    writeChats({ '888': { mode: 'daily', hour: 21, minute: 30, lastFire: '' } });
    await bot.schedulerTick(Date.UTC(2026, 8, 17, 20, 59, 0)); // 23:59 МСК = target+149 мин
    assert.equal(calls.filter((c) => c.method === 'sendMessage').length, 2, 'за окном догоняния — тишина');
});

test('handleMessage: /start daily|sunday|off и /start ЧЧ:ММ применяются и подтверждаются', async () => {
    writeChats({});
    bot.setApiForTests(mockApi());
    await bot.handleMessage({ chat: { id: 9 }, text: '/start sunday' });
    assert.equal(readChats()['9'].mode, 'sunday');
    assert.ok(calls[0].body.text.includes('воскресеньям'));
    await bot.handleMessage({ chat: { id: 9 }, text: '/start 07:00' });
    assert.equal(readChats()['9'].hour, 7);
    assert.equal(readChats()['9'].minute, 0);
    assert.ok(calls[1].body.text.includes('07:00'), 'подтверждение с установленным временем');
    await bot.handleMessage({ chat: { id: 9 }, text: '/start off' });
    assert.equal(readChats()['9'].mode, 'off');
    await bot.handleMessage({ chat: { id: 9 }, text: '/status' });
    assert.ok(calls[3].body.text.includes('ВЫКЛ'));
    await bot.handleMessage({ chat: { id: 9 }, text: '/help' });
    assert.ok(calls[4].body.text.includes('/start ЧЧ:ММ'), 'в справке есть настройка времени');
});

test('handleMessage: /start при выключенном чате снова включает (v2 поверх легаси false)', async () => {
    writeChats({ '5': false });
    bot.setApiForTests(mockApi());
    await bot.handleMessage({ chat: { id: 5 }, text: '/start' });
    assert.equal(readChats()['5'].mode, 'daily');
});
