# NeuroDeck Telegram Notification Backend

HTTP-сервис, который отправляет **настоящие Telegram-уведомления** игрокам
[NeuroDeck Mini App](https://github.com/serwaksus/neurodeck) за 1.5 часа до наказания
босса (21:30 МСК) и за 30 минут до дедлайна цели.

## Архитектура

```
┌────────────────────────┐      POST /api/register-user      ┌──────────────────────┐
│  Telegram Mini App     │ ─────────────────────────────────▶ │  neurodeck-bot       │
│  (GitHub Pages)        │      POST /api/notify              │  (this service)      │
│                        │ ─────────────────────────────────▶ │                      │
│  initData (HMAC签的)    │                                    │  Express + fetch     │
└────────────────────────┘                                    │  scheduler 21:30 МСК │
                                                              └──────────┬───────────┘
                                                                         │
                                                                         │ HTTPS POST
                                                                         │ /bot<TOKEN>/sendMessage
                                                                         ▼
                                                              ┌──────────────────────┐
                                                              │  api.telegram.org    │
                                                              └──────────────────────┘
```

- **Bot в Mini App**: пользователь открывает приложение → Mini App вызывает `/api/register-user` с `initData` → backend верифицирует HMAC → сохраняет `chat_id`.
- **Scheduler**: каждый день в 21:30 МСК отправляет напоминание всем зарегистрированным пользователям.
- **Goal alerts**: за 30 мин до дедлайна каждой цели отправляется дополнительное уведомление.

## Почему отдельный сервис?

`serwaksus.github.io/neurodeck/` — это статический сайт на GitHub Pages. Он не может
выполнять серверный код. Поэтому уведомления через `Notification.requestPermission()`
работают только когда игрок держит вкладку открытой. Для **надёжных** уведомлений
нужен backend, который вы сами деплоите.

## Деплой

### Render.com (рекомендую для прототипа, free tier)

1. Откройте https://render.com → New Web Service.
2. Подключите форк/клон этого репо.
3. Branch: `feature/bot-backend`.
4. Root directory: `bot/`.
5. Build command: `npm install`.
6. Start command: `node src/index.js`.
7. Добавьте Environment Variables:
   - `TELEGRAM_BOT_TOKEN` — от `@BotFather`.
   - `ALLOWED_ORIGIN` — `https://serwaksus.github.io`.
   - `SECRET_TOKEN` (опционально) — random 32-char hex.
8. Persistent Disk: `/app/data` (для `db.json`).
9. После деплоя получите URL вида `https://neurodeck-bot.onrender.com`. Это значение
   нужно вставить в frontend (см. ниже).

### Railway.app

Аналогично: подключите репо, укажите `bot/` как root, добавьте `TELEGRAM_BOT_TOKEN`,
включите Volume для `/app/data`. URL вида `https://neurodeck-bot.up.railway.app`.

### VPS (Digital Ocean / Hetzner / обычный Linux)

```bash
git clone https://github.com/serwaksus/neurodeck
cd neurodeck/bot
cp .env.example .env
# edit .env with your values
docker build -t neurodeck-bot .
docker run -d --restart always --env-file .env -v neurodeck-data:/app/data -p 3000:3000 neurodeck-bot
```

## Подключение к frontend

После деплоя впишите URL бекенда в `js/app.js` в начале файла:

```js
const USE_BACKEND_NOTIF = true;
const BOT_URL = 'https://neurodeck-bot.onrender.com';  // твой URL
```

Затем в `js/app.js` измените функцию `toggleNotif()`:

```js
async function toggleNotif() {
    if (USE_BACKEND_NOTIF && BOT_URL) {
        try {
            const r = await fetch(BOT_URL + '/api/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initData: window.Telegram.WebApp.initData,
                    plan: buildPlan()
                })
            });
            notifEnabled = r.ok;
        } catch (e) { notifEnabled = false; }
    } else {
        // fallback to Browser Notification API
        if (Notification.permission === 'granted') notifEnabled = true;
        else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            notifEnabled = permission === 'granted';
        }
    }
    localStorage.setItem('neurodeck_notif', notifEnabled ? '1' : '0');
    updateNotifBtn();
}
```

`buildPlan()` — функция, которая собирает JSON из текущего состояния:

```js
function buildPlan() {
    const incomplete = FORGED.filter(c => /* ваша логика 'не сделано сегодня' */);
    return {
        incompleteCount: incomplete.length,
        untilMinutesLeft: 90,
        untitledGoals: [],
        deadlineAlerts: GOALS.filter(g => {
            const m = (new Date(g.deadline).getTime() - Date.now()) / 60_000;
            return m > 0 && m <= 31;
        }).map(g => ({ id: g.id, name: g.name, atMinutes: 21 * 60 + 0 }))
    };
}
```

> ⚠️ **TODO**: код выше в `js/app.js` надо добавить руками. Я готовил backend полностью,
> фронт-интеграция осталась как чистая инструкция, чтобы я мог случайно не
> сломать ваши сохранения на main.

## API Reference

### `GET /api/health`

```bash
curl https://neurodeck-bot.onrender.com/api/health
# { "ok": true, "service": "neurodeck-bot", "ts": 1717000000000, "users": 12, "plans": 8 }
```

### `POST /api/register-user`

Регистрирует chat_id пользователя через Telegram-initData (с HMAC проверкой).

```bash
curl -X POST https://neurodeck-bot.onrender.com/api/register-user \
  -H "Content-Type: application/json" \
  -d '{"initData": "query_id=...&user=...&auth_date=...&hash=..."}'
```

Ответ: `{ ok, chat_id, first_name } | { ok: false, err }`.

### `POST /api/notify`

Загружает "план" пользователя (сколько карточек не сделано, какие цели на грани).
Scheduler будет использовать последний присланный план в 21:30 МСК.

```bash
curl -X POST .../api/notify \
  -H "Content-Type: application/json" \
  -d '{"initData": "...", "plan": { "incompleteCount": 3, "untilMinutesLeft": 90, ... }}'
```

### `POST /api/disable`

Пользователь отключает уведомления (сохраняем флаг `enabled: false` в db, но chat_id оставляем).

## Безопасность

- Все входящие initData проверяются HMAC-SHA256 согласно алгоритму Telegram
  (`https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app`).
- Timing-safe сравнение хэшей (`crypto.timingSafeEqual`).
- CORS ограничен `ALLOWED_ORIGIN` (default — github pages домен).
- SMS rate-limit: 60 req/min per IP.
- 403/400 от Telegram → пользователь автоматически помечается `enabled: false`.

## Разработка

```bash
cd bot
cp .env.example .env
# edit .env
npm install
npm test         # 13 тестов, ~250ms
npm run dev      # hot-reload
```

## Лицензия

ISC
