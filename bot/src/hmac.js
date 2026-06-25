'use strict';
const crypto = require('crypto');

function parseInitData(initData) {
  const out = {};
  if (typeof initData !== 'string') return out;
  for (const pair of initData.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    const val = eq >= 0 ? pair.slice(eq + 1) : '';
    try { out[decodeURIComponent(key)] = decodeURIComponent(val.replace(/\+/g, ' ')); }
    catch (e) { out[key] = val; }
  }
  return out;
}

function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const parsed = parseInitData(initData);
  const hash = parsed.hash;
  if (!hash) return null;
  const pairs = [];
  for (const key of Object.keys(parsed)) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${parsed[key]}`);
  }
  pairs.sort();
  const dataCheck = pairs.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheck).digest('hex');
  const buf1 = Buffer.from(hash, 'hex');
  const buf2 = Buffer.from(computed, 'hex');
  if (buf1.length !== buf2.length) return null;
  if (!crypto.timingSafeEqual(buf1, buf2)) return null;
  let user = null;
  if (parsed.user) {
    try { user = JSON.parse(parsed.user); } catch (e) { user = null; }
  }
  if (!user) return null;
  if (typeof user.id !== 'number' || !Number.isFinite(user.id) || user.id <= 0) return null;
  return user;
}

function verifySecretToken(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function makeSecretFromToken(botToken) {
  if (!botToken) return '';
  return crypto.createHash('sha256').update(botToken + '|neurodeck-secret').digest('hex');
}

module.exports = { verifyInitData, verifySecretToken, makeSecretFromToken };
