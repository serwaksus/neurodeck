'use strict';
const fs = require('fs');
const path = require('path');

function defaultDb() {
  return { users: {}, plans: {}, _meta: { version: 1, last_write_at: 0 } };
}

function loadDb(filePath) {
  try {
    if (!fs.existsSync(filePath)) return defaultDb();
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return defaultDb();
    return Object.assign(defaultDb(), JSON.parse(raw));
  } catch (e) {
    console.warn('[neurodeck-bot] failed to load db', e && e.message);
    return defaultDb();
  }
}

function saveDb(filePath, db) {
  try {
    if (!db || typeof db !== 'object') throw new Error('db must be object');
    db._meta = db._meta || {};
    db._meta.last_write_at = Date.now();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (e) {
    console.error('[neurodeck-bot] failed to save db', e && e.message);
  }
}

module.exports = { loadDb, saveDb, defaultDb };
