'use strict';
const TELEGRAM_API = 'https://api.telegram.org/bot';

function getBot(token) {
  if (!token) return { sendMessage: async () => { throw new Error('BOT_TOKEN not set'); } };
  const base = TELEGRAM_API + token;
  return {
    async sendMessage(chatId, text, opts) {
      const url = base + '/sendMessage';
      const body = {
        chat_id: String(chatId),
        text: String(text || '').slice(0, 4096),
        parse_mode: opts && opts.parseMode ? opts.parseMode : undefined,
        disable_web_page_preview: true
      };
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: (opts && opts.signal) ? opts.signal : AbortSignal.timeout(10_000)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const err = new Error('telegram_error ' + resp.status);
        err.status = resp.status;
        err.description = data && data.description;
        throw err;
      }
      return true;
    }
  };
}

module.exports = { getBot };
