'use strict';
function rateLimit(opts) {
  opts = opts || {};
  const windowMs = opts.windowMs || 60_000;
  const max = opts.max || 60;
  const buckets = new Map();
  return function take(key) {
    const k = String(key || 'anon');
    const now = Date.now();
    let arr = buckets.get(k);
    if (!arr) { arr = []; buckets.set(k, arr); }
    const cutoff = now - windowMs;
    while (arr.length && arr[0] < cutoff) arr.shift();
    if (arr.length >= max) {
      const retryMs = Math.max(0, arr[0] + windowMs - now);
      return { ok: false, retryMs };
    }
    arr.push(now);
    return { ok: true, retryMs: 0 };
  };
}
module.exports = { rateLimit };
