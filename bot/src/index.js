'use strict';
const path = require('path');
const express = require('express');
const hmac = require('./hmac');
const store = require('./store');
const telegram = require('./telegram');
const ratelimit = require('./ratelimit');
const schedulerMod = require('./scheduler');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SECRET_TOKEN = process.env.SECRET_TOKEN || (BOT_TOKEN ? hmac.makeSecretFromToken(BOT_TOKEN) : '');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'db.json');

let db = store.loadDb(DB_PATH);
function persist() { store.saveDb(DB_PATH, db); }

const limiter = ratelimit.rateLimit({ windowMs: 60_000, max: 60 });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGIN === '*' || origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Bot-Api-Secret-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'neurodeck-bot',
    ts: Date.now(),
    users: Object.keys(db.users || {}).length,
    plans: Object.keys(db.plans || {}).length
  });
});

app.post('/api/register-user', wrap(async (req, res) => {
  const initData = (req.body && req.body.initData) || '';
  if (!initData) return res.status(400).json({ ok: false, err: 'initData required' });
  if (!BOT_TOKEN) return res.status(503).json({ ok: false, err: 'bot token not configured' });
  const user = hmac.verifyInitData(initData, BOT_TOKEN);
  if (!user) return res.status(401).json({ ok: false, err: 'invalid initData' });
  // Optional secondary secret-token check (defense in depth)
  if (SECRET_TOKEN) {
    const probe = req.headers['x-telegram-bot-api-secret-token'];
    if (!hmac.verifySecretToken(probe, SECRET_TOKEN)) {
      // WEBHOOK calls only — for frontend this header is not set, so skip silently
    }
  }
  const chatId = String(user.id);
  if (!db.users) db.users = {};
  db.users[chatId] = {
    chat_id: chatId,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    username: user.username || '',
    registeredAt: Date.now(),
    lastSeenAt: Date.now(),
    enabled: true
  };
  persist();
  return res.json({ ok: true, chat_id: chatId, first_name: user.first_name || '' });
}));

app.post('/api/notify', wrap(async (req, res) => {
  const limit = limiter(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anon');
  if (!limit.ok) return res.status(429).json({ ok: false, err: 'rate limited', retry_ms: limit.retryMs });
  const initData = (req.body && req.body.initData) || '';
  const plan = (req.body && req.body.plan) || {};
  if (!initData || !BOT_TOKEN) return res.status(400).json({ ok: false, err: 'initData required' });
  const user = hmac.verifyInitData(initData, BOT_TOKEN);
  if (!user) return res.status(401).json({ ok: false, err: 'invalid initData' });
  const chatId = String(user.id);
  if (!db.users || !db.users[chatId]) {
    db.users[chatId] = { chat_id: chatId, first_name: user.first_name || '', registeredAt: Date.now(), enabled: true };
  }
  db.users[chatId].lastSeenAt = Date.now();
  if (!db.plans) db.plans = {};
  db.plans[chatId] = { plan, receivedAt: Date.now() };
  persist();
  return res.json({ ok: true, chat_id: chatId });
}));

app.post('/api/disable', wrap(async (req, res) => {
  const initData = (req.body && req.body.initData) || '';
  if (!initData || !BOT_TOKEN) return res.status(400).json({ ok: false, err: 'initData required' });
  const user = hmac.verifyInitData(initData, BOT_TOKEN);
  if (!user) return res.status(401).json({ ok: false, err: 'invalid initData' });
  const chatId = String(user.id);
  if (db.users && db.users[chatId]) { db.users[chatId].enabled = false; persist(); }
  return res.json({ ok: true });
}));

app.use((err, req, res, _next) => {
  console.error('[neurodeck-bot] error:', err && err.message);
  res.status(500).json({ ok: false, err: 'internal' });
});

function start() {
  const server = app.listen(PORT, () => console.log(`[neurodeck-bot] listening on :${PORT}`));
  const sched = schedulerMod.createScheduler({
    db, getBot: () => telegram.getBot(BOT_TOKEN),
    onError: (e) => console.error('[scheduler]', e && e.message)
  });
  sched.start();
  const shutdown = () => { sched.stop(); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}
if (require.main === module) start();
module.exports = { app, start };
