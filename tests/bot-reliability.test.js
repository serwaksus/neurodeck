// Аудит 2026-10-02 R2 (M1/M2): гонка /stop vs рассылка, атомарная запись chats.json,
// блокировка бота пользователем, наложение тиков. Каждый тест красный на bot/polling.js до фикса.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-bot-rel-'));
process.env.ND_BOT_DATA_DIR = DATA_DIR;
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-token-for-unit';
const bot = require('../bot/polling.js');

const FILE = path.join(DATA_DIR, 'chats.json');
const write = (db) => fs.writeFileSync(FILE, JSON.stringify(db));
const read = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOW = Date.UTC(2026, 9, 2, 18, 31, 0); // 21:31 МСК, пятница
const daily = () => ({ mode: 'daily', hour: 21, minute: 30, lastFire: '' });

test.beforeEach(() => {
    for (const f of fs.readdirSync(DATA_DIR)) fs.rmSync(path.join(DATA_DIR, f), { force: true });
});

test('M1: /stop во время рассылки не затирается тиком и не получает напоминание', async () => {
    write({ A: daily(), B: daily() });
    const sent = [];
    bot.setApiForTests(async (method, body) => {
        if (method === 'sendMessage') { sent.push(body.chat_id + '|' + body.text.slice(0, 12)); await sleep(80); }
        return {};
    });
    const tick = bot.schedulerTick(NOW);
    await sleep(20); // тик уже отправляет A
    await bot.handleMessage({ chat: { id: 'B' }, text: '/stop' });
    await tick;
    assert.equal(read().B.mode, 'off', 'отписка пережила тик');
    assert.ok(!sent.some((x) => x.startsWith('B|🏰')), 'напоминание отписавшемуся не отправлено: ' + JSON.stringify(sent));
    assert.equal(read().A.lastFire, '2026-10-2', 'lastFire отправленного чата записан');
});

test('M1: наложившиеся тики не дублируют рассылку', async () => {
    write({ A: daily() });
    let n = 0;
    bot.setApiForTests(async (method) => { if (method === 'sendMessage') { n++; await sleep(60); } return {}; });
    await Promise.all([bot.schedulerTick(NOW), bot.schedulerTick(NOW), bot.schedulerTick(NOW)]);
    assert.equal(n, 1);
});

test('M1: lastFire пишется сразу после каждой отправки (падение посреди тика не дублирует)', async () => {
    write({ A: daily(), B: daily() });
    let calls = 0;
    bot.setApiForTests(async (method, body) => {
        if (method !== 'sendMessage') return {};
        calls++;
        if (body.chat_id === 'B') { assert.equal(read().A.lastFire, '2026-10-2', 'к моменту отправки B запись A уже сохранена'); }
        return {};
    });
    await bot.schedulerTick(NOW);
    assert.equal(calls, 2);
});

test('M2: запись chats.json атомарна — после сохранения нет временных файлов, есть .bak', () => {
    bot.saveChats({ A: daily() });
    bot.saveChats({ A: daily(), B: daily() });
    const names = fs.readdirSync(DATA_DIR);
    assert.ok(!names.some((n) => n.includes('.tmp-')), 'tmp убран переименованием: ' + names);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(FILE + '.bak', 'utf8'))), ['A'], '.bak — предыдущая валидная версия');
});

test('M2: битый chats.json не считается пустым — улика сохранена, подписки возвращены из .bak', () => {
    bot.saveChats({ A: daily() });
    bot.saveChats({ A: daily(), B: daily() }); // .bak = {A}
    fs.writeFileSync(FILE, '{"A":{"mode":"da'); // обрыв записи
    const db = bot.loadChats();
    assert.deepEqual(Object.keys(db), ['A']);
    assert.ok(fs.readdirSync(DATA_DIR).some((n) => n.startsWith('chats.json.corrupt-')), 'битый файл сохранён рядом');
});

test('M2: пользователь заблокировал бота (403) → режим off, без повторов в окне догона', async () => {
    write({ A: daily(), B: daily() });
    let toA = 0;
    bot.setApiForTests(async (method, body) => {
        if (method === 'sendMessage' && body.chat_id === 'A') { toA++; throw new Error('sendMessage: Forbidden: bot was blocked by the user'); }
        return {};
    });
    await bot.schedulerTick(NOW);
    assert.equal(read().A.mode, 'off');
    assert.equal(read().B.lastFire, '2026-10-2', 'остальные доставлены');
    await bot.schedulerTick(NOW + 60000);
    assert.equal(toA, 1, 'к заблокировавшему больше не стучимся');
});

test('M2: временный сбой (таймаут) НЕ выключает подписку', async () => {
    write({ A: daily() });
    bot.setApiForTests(async () => { throw new Error('sendMessage: http timeout'); });
    await bot.schedulerTick(NOW);
    assert.equal(read().A.mode, 'daily');
    assert.ok(!bot.isPermanentSendError(new Error('socks timeout')));
    assert.ok(bot.isPermanentSendError(new Error('sendMessage: Bad Request: chat not found')));
});

test('M2: 403 не от Telegram (HTML-заглушка прокси/блокировки) НЕ отписывает всех разом', async () => {
    write({ A: daily(), B: daily() });
    bot.setApiForTests(async () => { throw new Error('sendMessage: плохой ответ 403'); });
    await bot.schedulerTick(NOW);
    assert.equal(read().A.mode, 'daily');
    assert.equal(read().B.mode, 'daily');
});

test('M2: у HTTPS-запроса есть таймаут (req.setTimeout) — pollLoop не виснет навсегда', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'bot', 'polling.js'), 'utf8');
    assert.match(src, /req\.setTimeout\(/);
});
