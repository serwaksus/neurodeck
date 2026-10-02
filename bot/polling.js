#!/usr/bin/env node
'use strict';
// NeuroDeck polling bot v2: подписка, режимы (daily/sunday/off), время напоминания,
// персист lastFire в chats.json (без дублей при рестарте), догоняющая отправка после
// простоя (≤2 ч). Без зависимостей: node >= 18 (global fetch). Токен — в env.

const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const https = require('https');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_HOST = 'api.telegram.org';
const PROXY = process.env.TELEGRAM_PROXY || 'socks5h://127.0.0.1:1080'; // xray SOCKS5 (VPS в РФ: прямой выход к TG заблокирован)
const SOCKS_PORT = parseInt((process.env.TELEGRAM_PROXY || 'socks5h://127.0.0.1:1080').split(':')[2], 10) || 1080;
const DATA_DIR = process.env.ND_BOT_DATA_DIR || path.join(__dirname, 'data'); // QA-6: песочница для юнит-тестов (контракт draft-теста)
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const WEBAPP_URL = process.env.NEURODECK_WEBAPP_URL || 'https://serwaksus.github.io/neurodeck/';
// Прямая ссылка на Mini App после BotFather /newapp (https://t.me/<bot>/<app>):
// тогда напоминание получает вторую кнопку с контекстом (startapp=strongholds).
const TG_LINK = process.env.NEURODECK_TG_LINK || '';
const REMIND_HOUR = 21, REMIND_MIN = 30; // дефолт, МСК
const FIRE_WINDOW_MIN = 5;    // штатное окно срабатывания
const CATCHUP_MIN = 120;      // бот молчал ≤2 ч — догоняем пропущенное

if (!TOKEN) {
  console.error('[bot] TELEGRAM_BOT_TOKEN не задан. Запуск: TELEGRAM_BOT_TOKEN=xxx node polling.js');
  process.exit(1);
}

// --- chats.json v2: { "<chatId>": { mode, hour, minute, lastFire } } ---
// Легаси v1 читается на лету: true → daily 21:30, false → off.
function loadChats() {
  let raw;
  try { raw = fs.readFileSync(CHATS_FILE, 'utf8'); } catch (e) { return {}; } // файла нет — подписчиков нет
  try {
    const db = JSON.parse(raw);
    if (db && typeof db === 'object' && !Array.isArray(db)) return db;
    throw new Error('chats.json не объект');
  } catch (e) {
    // Битый файл не считаем пустым: иначе следующая запись молча сотрёт все подписки.
    // Сохраняем улику рядом и пробуем последнюю хорошую копию.
    console.error('[bot] chats.json повреждён:', e.message);
    try { fs.writeFileSync(CHATS_FILE + '.corrupt-' + Date.now(), raw); } catch (e2) {}
    try {
      const bak = JSON.parse(fs.readFileSync(CHATS_FILE + '.bak', 'utf8'));
      if (bak && typeof bak === 'object' && !Array.isArray(bak)) { console.error('[bot] восстановлено из chats.json.bak'); return bak; }
    } catch (e3) {}
    return {};
  }
}
// Атомарная запись: tmp + rename — падение посреди записи не оставляет битый chats.json.
// Перед заменой текущий (заведомо валидный) файл остаётся как .bak.
function saveChats(db) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = CHATS_FILE + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(db));
    try { fs.copyFileSync(CHATS_FILE, CHATS_FILE + '.bak'); } catch (e) {}
    fs.renameSync(tmp, CHATS_FILE);
  } catch (e) { console.error('[bot] saveChats:', e.message); }
}
function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  return (Number.isFinite(n) && n >= lo && n <= hi) ? n : dflt;
}
function normEntry(v) {
  if (v && typeof v === 'object') {
    return {
      mode: ['daily', 'sunday', 'off'].indexOf(v.mode) >= 0 ? v.mode : 'daily',
      hour: clampInt(v.hour, 0, 23, REMIND_HOUR),
      minute: clampInt(v.minute, 0, 59, REMIND_MIN),
      lastFire: typeof v.lastFire === 'string' ? v.lastFire : ''
    };
  }
  if (v === true) return { mode: 'daily', hour: REMIND_HOUR, minute: REMIND_MIN, lastFire: '' };
  return { mode: 'off', hour: REMIND_HOUR, minute: REMIND_MIN, lastFire: '' };
}
function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}
function hhmm(e) { return String(e.hour).padStart(2, '0') + ':' + String(e.minute).padStart(2, '0'); }

// --- Минимальный SOCKS5 CONNECT без зависимостей (socks5h: DNS на стороне прокси) ---
function socks5Connect(targetHost, targetPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: new URL(PROXY).hostname, port: SOCKS_PORT });
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('socks timeout')); }, timeoutMs || 15000);
    const fail = (e) => { clearTimeout(timer); sock.destroy(); reject(e); };
    sock.once('error', fail);
    sock.once('connect', () => {
      sock.write(Buffer.from([0x05, 0x01, 0x00])); // приветствие: v5, метод "без авторизации"
    });
    let stage = 0;
    sock.on('data', function onData(chunk) {
      if (stage === 0) {
        if (chunk.length < 2 || chunk[0] !== 0x05 || chunk[1] !== 0x00) return fail(new Error('socks handshake отказ: ' + chunk.toString('hex')));
        stage = 1;
        const host = Buffer.from(targetHost, 'ascii'); // CONNECT по домену (ATYP=3)
        const req = Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]), host, Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff])]);
        sock.write(req);
      } else {
        clearTimeout(timer);
        sock.removeListener('data', onData);
        sock.removeListener('error', fail);
        if (chunk.length < 4 || chunk[1] !== 0x00) return reject(new Error('socks CONNECT отказ, код: ' + (chunk[1] !== undefined ? chunk[1] : '??')));
        let off = 4;
        const atyp = chunk[3];
        if (atyp === 0x01) off += 4; else if (atyp === 0x03) off += 1 + chunk[4]; else if (atyp === 0x04) off += 16; else return reject(new Error('socks: неизвестный ATYP ' + atyp));
        sock.pause();
        resolve(sock); // сырой туннель, TLS — сверху
      }
    });
  });
}

// API-запрос через SOCKS-туннель + TLS. let + сеттер: юнит-тесты подменяют транспорт (setApiForTests), прод не трогает.
let api = async function (method, body) {
  const payload = JSON.stringify(body || {});
  const timeoutMs = method === 'getUpdates' ? 70000 : 15000;
  const sock = await socks5Connect(API_HOST, 443, timeoutMs);
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: API_HOST, path: '/bot' + TOKEN + '/' + method, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      createConnection: () => tls.connect({ servername: API_HOST, socket: sock })
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        sock.destroy();
        try { const json = JSON.parse(data); if (json.ok) resolve(json.result); else reject(new Error(method + ': ' + (json.description || res.statusCode))); }
        catch (e) { reject(new Error(method + ': плохой ответ ' + res.statusCode)); }
      });
    });
    req.on('error', (e) => { sock.destroy(); reject(e); });
    // Без таймаута «молчащий» прокси вешает pollLoop навсегда, а systemd видит живой процесс.
    req.setTimeout(timeoutMs, () => req.destroy(new Error(method + ': http timeout')));
    req.end(payload);
  });
};
function setApiForTests(fn) { api = fn; }

function mskParts(ts) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date(ts || Date.now()));
  const g = (t) => parseInt(p.find((x) => x.type === t).value, 10);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', weekday: 'short' }).format(new Date(ts || Date.now()));
  return { key: `${g('year')}-${g('month')}-${g('day')}`, hour: g('hour'), minute: g('minute'), dow: wd };
}

const REMINDER_TEXT = '🏰 NeuroDeck\nТвои твердыни накопили налоги за день. Заходи забрать золото и закрыть день с достоинством.\nТвой фронт ждёт, Владыка.';
const SIEGE_TEXT = '🛡 NeuroDeck: воскресная осада!\nНейтралы идут на твердыни. Проверь гарнизон и стойку недели — фронт держит тот, кто в строю.';

function webAppButton() {
  return { text: '⚔ Открыть NeuroDeck', web_app: { url: WEBAPP_URL } };
}
function keyboard(ctx) {
  const rows = [[webAppButton()]];
  // Контекстная кнопка появляется, только если задана прямая ссылка на Mini App
  // (BotFather /newapp, env NEURODECK_TG_LINK) — иначе startapp не работает.
  if (TG_LINK && ctx) rows.push([{ text: ctx.label, url: TG_LINK + (TG_LINK.indexOf('?') >= 0 ? '&' : '?') + 'startapp=' + ctx.startapp }]);
  return { inline_keyboard: rows };
}

async function sendReminder(chatId, mode) {
  const siege = mode === 'sunday';
  await api('sendMessage', {
    chat_id: chatId,
    text: siege ? SIEGE_TEXT : REMINDER_TEXT,
    reply_markup: keyboard(siege ? { label: '🏰 К твердыням', startapp: 'strongholds' } : null)
  });
}

function _resetForTests() { /* lastFire теперь персистится в chats.json — сброс через фикстуру */ }

// Постоянный отказ доставки: пользователь заблокировал бота / чат удалён — повторять бессмысленно.
// Решаем только по описанию ошибки из JSON-ответа Telegram: голый HTTP 403 без JSON (заглушка прокси,
// блокировка) — сбой канала, а не отказ пользователя; иначе один такой тик выключил бы напоминания всем.
function isPermanentSendError(err) {
  return /forbidden: bot was blocked|forbidden: user is deactivated|forbidden: bot was kicked|forbidden: bot can't initiate|chat not found/i.test(String(err && err.message || err));
}

let tickRunning = false; // setInterval не должен запускать второй тик поверх идущего (дубли рассылки)
async function schedulerTick(now = Date.now()) {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const p = mskParts(now);
    const minutesNow = p.hour * 60 + p.minute;
    const ids = Object.keys(loadChats());
    let sent = 0;
    for (const id of ids) {
      // Свежая запись на КАЖДЫЙ чат: /stop, пришедший во время предыдущих отправок, обязан сработать.
      const db0 = loadChats();
      if (!Object.prototype.hasOwnProperty.call(db0, id)) continue;
      const e = normEntry(db0[id]);
      if (e.mode === 'off') continue;
      if (e.mode === 'sunday' && p.dow !== 'Sun') continue;
      const target = e.hour * 60 + e.minute;
      const inWindow = minutesNow >= target && minutesNow < target + FIRE_WINDOW_MIN;
      const catchup = minutesNow >= target + FIRE_WINDOW_MIN && minutesNow < target + CATCHUP_MIN; // бот был мёртв в окне
      if ((!inWindow && !catchup) || e.lastFire === p.key) continue;
      try {
        await sendReminder(id, e.mode);
        // Пишем ТОЛЬКО эту запись поверх свежего файла и сразу — рестарт не дублирует, чужие правки не затираются.
        const db1 = loadChats();
        if (Object.prototype.hasOwnProperty.call(db1, id)) {
          const cur = normEntry(db1[id]);
          cur.lastFire = p.key;
          db1[id] = cur;
          saveChats(db1);
        }
        sent++;
      } catch (err) {
        console.error('[bot] reminder ->', id, err.message);
        if (isPermanentSendError(err)) {
          const db2 = loadChats();
          if (Object.prototype.hasOwnProperty.call(db2, id)) { const cur = normEntry(db2[id]); cur.mode = 'off'; db2[id] = cur; saveChats(db2); }
          console.error('[bot] чат', id, 'недоступен — напоминания выключены');
        }
      }
    }
    if (sent > 0) console.log('[bot] reminder', p.key, 'sent:', sent);
  } finally { tickRunning = false; }
}

const HELP_TEXT = [
  '🏰 NeuroDeck — напоминания.',
  '/start — напоминание каждый день в 21:30 МСК',
  '/start daily | sunday | off — режим: каждый день / только воскресные осады / выключить',
  '/start ЧЧ:ММ — время напоминания в МСК, например /start 20:00',
  '/stop — выключить, /status — текущие настройки, /help — это меню'
].join('\n');

async function handleMessage(msg) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();
  const kb = { inline_keyboard: [[webAppButton()]] };
  if (text === '/start' || text.startsWith('/start ')) {
    const db = loadChats();
    const cur = normEntry(db[chatId]);
    const arg = text.slice(6).trim();
    if (arg === 'daily' || arg === 'sunday' || arg === 'off') {
      cur.mode = arg;
      cur.lastFire = ''; // смена режима — разрешаем немедленное подтверждение доставки по новому режиму
      db[chatId] = cur;
      saveChats(db);
      const says = {
        daily: '🔔 Напоминание каждый день в ' + hhmm(cur) + ' МСК включено.',
        sunday: '🛡 Буду писать только по воскресеньям — к осаде, в ' + hhmm(cur) + ' МСК.',
        off: '🔕 Напоминания выключены. /start — включить обратно.'
      };
      await api('sendMessage', { chat_id: chatId, text: says[arg], reply_markup: kb });
    } else if (parseHHMM(arg)) {
      const t = parseHHMM(arg);
      cur.hour = t.h;
      cur.minute = t.m;
      if (cur.mode === 'off') cur.mode = 'daily';
      cur.lastFire = '';
      db[chatId] = cur;
      saveChats(db);
      await api('sendMessage', { chat_id: chatId, text: '⏰ Время напоминания: ' + hhmm(cur) + ' МСК (режим: ' + (cur.mode === 'sunday' ? 'воскресные осады' : 'каждый день') + ').', reply_markup: kb });
    } else {
      cur.mode = 'daily';
      cur.lastFire = '';
      db[chatId] = cur;
      saveChats(db);
      await api('sendMessage', { chat_id: chatId, text: '🔔 Подписка включена: напоминание каждый день в ' + hhmm(cur) + ' МСК.\n\n' + HELP_TEXT, reply_markup: kb });
    }
  } else if (text === '/stop') {
    const db = loadChats();
    const cur = normEntry(db[chatId]);
    cur.mode = 'off';
    db[chatId] = cur;
    saveChats(db);
    await api('sendMessage', { chat_id: chatId, text: '🔕 Напоминания выключены. /start — включить обратно.', reply_markup: kb });
  } else if (text === '/status') {
    const db = loadChats();
    const cur = normEntry(db[chatId]);
    const state = cur.mode === 'off' ? '🔕 ВЫКЛ' : '🔔 ВКЛ (' + (cur.mode === 'sunday' ? 'воскресные осады' : 'каждый день') + ', ' + hhmm(cur) + ' МСК)';
    await api('sendMessage', { chat_id: chatId, text: 'Напоминания: ' + state + '. /help — все команды.', reply_markup: kb });
  } else if (text === '/help') {
    await api('sendMessage', { chat_id: chatId, text: HELP_TEXT, reply_markup: kb });
  }
  // прочие сообщения и неизвестные команды — молча (контракт QA-теста)
}

async function pollOnce(offset, opts) {
  const sleepMs = (opts && opts.sleepMs) || 5000;
  for (;;) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 50 });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message && u.message.text) await handleMessage(u.message).catch((e) => console.error('[bot] msg:', e.message));
      }
      return offset;
    } catch (e) {
      console.error('[bot] poll:', e.message);
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  }
}
async function pollLoop() {
  let offset = 0;
  for (;;) offset = await pollOnce(offset);
}

async function main() {
  const me = await api('getMe');
  console.log('[bot] запущен как @' + me.username + ' | режимы: daily/sunday/off, время настраивается /start ЧЧ:МСК | webapp: ' + WEBAPP_URL + (TG_LINK ? '' : ' | hint: задай NEURODECK_TG_LINK после BotFather /newapp для контекстных кнопок'));
  setInterval(() => schedulerTick().catch((e) => console.error('[bot] tick:', e.message)), 30 * 1000);
  pollLoop();
}
if (require.main === module) {
  main().catch((e) => { console.error('[bot] fatal:', e.message); process.exit(1); });
}
module.exports = { loadChats, saveChats, isPermanentSendError, mskParts, schedulerTick, handleMessage, pollOnce, setApiForTests, _resetForTests, normEntry, parseHHMM, REMIND_HOUR, REMIND_MIN };
