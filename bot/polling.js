#!/usr/bin/env node
'use strict';
// NeuroDeck polling bot: /start подписка, /stop отписка, напоминание 21:30 МСК.
// Без зависимостей: node >= 18 (global fetch). Токен — в переменной окружения.

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
function loadChats() {
  try { return JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8')); } catch (e) { return {}; }
}
function saveChats(db) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(CHATS_FILE, JSON.stringify(db)); } catch (e) { console.error('[bot] saveChats:', e.message); }
}
const WEBAPP_URL = process.env.NEURODECK_WEBAPP_URL || 'https://serwaksus.github.io/neurodeck/';
const REMIND_HOUR = 21, REMIND_MIN = 30; // МСК

if (!TOKEN) {
  console.error('[bot] TELEGRAM_BOT_TOKEN не задан. Запуск: TELEGRAM_BOT_TOKEN=xxx node polling.js');
  process.exit(1);
}

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
  const sock = await socks5Connect(API_HOST, 443, method === 'getUpdates' ? 70000 : 15000);
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
  return { key: `${g('year')}-${g('month')}-${g('day')}`, hour: g('hour'), minute: g('minute') };
}

const REMINDER_TEXT = '🏰 NeuroDeck\nТвои твердыни накопили налоги за день. Заходи забрать золото и закрыть день с достоинством.\nТвой фронт ждёт, Владыка.';

async function sendReminder(chatId) {
  await api('sendMessage', {
    chat_id: chatId,
    text: REMINDER_TEXT,
    reply_markup: { inline_keyboard: [[{ text: '⚔ Открыть NeuroDeck', web_app: { url: WEBAPP_URL } }]] }
  });
}

let lastFireKey = '';
function _resetForTests() { lastFireKey = ''; }
async function schedulerTick(now = Date.now()) {
  const p = mskParts(now);
  if (p.hour === REMIND_HOUR && p.minute >= REMIND_MIN && p.minute < REMIND_MIN + 5 && lastFireKey !== p.key) {
    lastFireKey = p.key;
    const db = loadChats();
    let sent = 0;
    for (const id of Object.keys(db)) {
      if (db[id] === false) continue;
      try { await sendReminder(id); sent++; }
      catch (e) { console.error('[bot] reminder ->', id, e.message); }
    }
    console.log('[bot] reminder', p.key, 'sent:', sent);
  }
}

async function handleMessage(msg) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();
  if (text.startsWith('/start')) {
    const db = loadChats();
    db[chatId] = true;
    saveChats(db);
    await api('sendMessage', {
      chat_id: chatId,
      text: 'Подписка на ежедневное напоминание (21:30 МСК) включена.\n/stop — отписаться.',
      reply_markup: { inline_keyboard: [[{ text: '⚔ Открыть NeuroDeck', web_app: { url: WEBAPP_URL } }]] }
    });
  } else if (text.startsWith('/stop')) {
    const db = loadChats();
    db[chatId] = false;
    saveChats(db);
    await api('sendMessage', { chat_id: chatId, text: 'Напоминания выключены. /start — включить обратно.' });
  } else if (text.startsWith('/status')) {
    const db = loadChats();
    const on = db[chatId] === true;
    await api('sendMessage', { chat_id: chatId, text: on ? '🔔 Напоминания: ВКЛ (21:30 МСК)' : '🔕 Напоминания: ВЫКЛ' });
  }
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
  console.log('[bot] запущен как @' + me.username + ' | напоминание в ' + REMIND_HOUR + ':' + String(REMIND_MIN).padStart(2, '0') + ' МСК | webapp: ' + WEBAPP_URL);
  setInterval(() => schedulerTick().catch((e) => console.error('[bot] tick:', e.message)), 30 * 1000);
  pollLoop();
}
if (require.main === module) {
  main().catch((e) => { console.error('[bot] fatal:', e.message); process.exit(1); });
}
module.exports = { mskParts, schedulerTick, handleMessage, pollOnce, setApiForTests, _resetForTests, REMIND_HOUR, REMIND_MIN };
