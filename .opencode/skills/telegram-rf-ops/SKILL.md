---
name: telegram-rf-ops
description: Telegram Bot API operations for Russian-server environment. Use when editing tg_sender.py, configuring Telegram connectivity from RF IPs, handling HTTP 429 rate limits, managing message queues, or debugging Telegram delivery failures. Covers DNS patching to 149.154.167.220, SOCKS5/ALL_PROXY setup, Retry-After handling, persistent queue with file_lock, and token sanitization in logs.
---

# Telegram RF Operations Skill

## When to use this skill

Use when:
- Editing `tg_sender.py` (send, queue, flush logic)
- Debugging Telegram delivery failures from the RF server
- Handling HTTP 429 "Too Many Requests" rate limiting
- Configuring DNS workaround for Telegram API on Russian IPs
- Setting up SOCKS5 proxy (Dante) as fallback
- Managing the persistent message queue
- Editing any module that calls `send_telegram()`

## Architecture

```
Any module → send_telegram(msg) → _send_once() → Telegram API
                                        ↓ fail
                                   _enqueue() → tg_queue.json
                                        ↓ cron */30
                                   flush_queue() → retry
```

All Telegram sends in the project go through `tg_sender.send_telegram()` — no direct `requests.post` to Telegram API elsewhere.

## RF server connectivity

### Problem
- IPv6 resolution of `api.telegram.org` may be blocked/unreachable on RF IPs
- Some RF ISPs block Telegram at DNS level

### Solution 1: DNS patch (CURRENT — active in tg_sender.py)

```python
import socket

TG_WORKING_IP = "149.154.167.220"
TG_API_HOST = "api.telegram.org"

_orig_getaddrinfo = socket.getaddrinfo
def _patched_getaddrinfo(host, port, *args, **kwargs):
    if host == TG_API_HOST:
        results = _orig_getaddrinfo(TG_WORKING_IP, port, *args, **kwargs)
        return [results[0]] if results else _orig_getaddrinfo(host, port, *args, **kwargs)
    return _orig_getaddrinfo(host, port, *args, **kwargs)
socket.getaddrinfo = _patched_getaddrinfo
```

This forces IPv4 to the known-working Telegram server IP, bypassing DNS/IPv6 issues.

### Solution 2: SOCKS5 proxy (fallback)

If `149.154.167.220` is also blocked, use Dante SOCKS5 proxy:

```bash
# Install Dante
apt install dante-server

# Configure /etc/danted.conf for local SOCKS5
# Then set environment variable:
export ALL_PROXY=socks5://127.0.0.1:1080
```

In Python:
```python
# requests automatically picks up ALL_PROXY if urllib3 supports it
# Or use PySocks:
pip install pysocks
# proxies={"all": "socks5://127.0.0.1:1080"}
```

### Solution 3: /etc/hosts

```bash
echo "149.154.167.220 api.telegram.org" >> /etc/hosts
```

## HTTP 429 rate limiting

```python
def _send_once(token, chat_id, message, timeout=15):
    resp = requests.post(
        f"https://{TG_API_HOST}/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": message[:4096], "parse_mode": "HTML",
              "disable_web_page_preview": True},
        timeout=timeout,
    )
    if resp.status_code == 429:
        retry_after = int(resp.headers.get("Retry-After", 30))
        logger.warning(f"[TG] Rate limited, retrying after {retry_after}s")
        time.sleep(retry_after)
        return False
    return resp.ok
```

Key points:
- **Always respect `Retry-After` header** — never retry immediately on 429
- **Default 30s** if header missing
- **Return False** so the message gets queued for later flush
- **Queue flush runs every 30 min via cron** — messages will eventually deliver

## Persistent queue

### Write to queue

```python
def _enqueue(message):
    with file_lock("/tmp/tg_queue.json.lock"):
        queue = load_json(QUEUE_FILE, [])
        queue.append({"message": message, "queued_at": datetime.now().isoformat(), "attempts": 0})
        # Purge old messages (> 48h)
        cutoff = datetime.now().timestamp() - MAX_AGE_HOURS * 3600
        queue = [m for m in queue if datetime.fromisoformat(m["queued_at"]).timestamp() > cutoff]
        # Cap at 100 messages
        if len(queue) > MAX_QUEUE_SIZE:
            queue = queue[:MAX_QUEUE_SIZE]
        save_json(QUEUE_FILE, queue)
```

### Flush queue

```python
def flush_queue(max_messages=10):
    with file_lock("/tmp/tg_queue.json.lock"):
        queue = load_json(QUEUE_FILE, [])
        # ... send each, track attempts
        # Drop after 10 failed attempts
```

Cron: `*/30 * * * * python3 tg_sender.py --flush`

## Retry strategy

```
send_telegram(msg, max_retries=3)
  → attempt 1: immediate
  → attempt 2: after 5s
  → attempt 3: after 15s
  → if all fail: enqueue for later flush
```

Queue flush: up to 10 messages per run, max 10 attempts per message before drop.

## Security

- **NEVER log the bot token** — `token` must not appear in any log line
- **Token sanitization** — if logging API URLs, mask the token: `bot****:****`
- **Credentials from `.env`** — `TG_BOT_TOKEN` and `TG_CHAT_ID` loaded from `EnvironmentFile`
- **`file_lock` for queue** — prevents concurrent writes from sniper + hermes + cron

## Common issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `ConnectionRefusedError` | IPv6 blocked | DNS patch to `149.154.167.220` |
| `timeout` after 15s | Server unreachable | Check IP, try SOCKS5 proxy |
| HTTP 429 | Too many messages | Respect `Retry-After`, use queue |
| Messages lost | Queue overflow (> 100) | Increase `MAX_QUEUE_SIZE` or flush more often |
| Duplicate messages | Queue not cleared after send | `save_json(QUEUE_FILE, remaining)` in flush |
| Token in logs | Logging full URL | Mask token in all log lines |
| `file_lock` contention | Sniper + Hermes writing queue | Lock is process-safe via `fcntl.flock` |

## Integration points

- `tg_sender.send_telegram()` — called by: sniper (buy/sell alerts), hermes (emergency exits), health_monitor (alerts), dotm_report (daily summary)
- `tg_sender.flush_queue()` — called by cron `*/30 * * * *`
- `tg_sender.get_queue_size()` — called by metrics_server for dashboard
- Queue file: `tg_queue.json` (path from `config.TG_QUEUE_FILE`)
- Credentials: `.env` file (`TG_BOT_TOKEN`, `TG_CHAT_ID`)
