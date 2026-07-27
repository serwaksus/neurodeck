---
name: telegram-miniapp-ops
description: Telegram Mini App platform operations for NeuroDeck. Use when deploying, debugging WebView issues, configuring cache-busting, working with Telegram WebApp API (CloudStorage, HapticFeedback, themeParams), or dealing with Telegram-specific quirks. Covers cache-busting strategy (?v=N versioning), WebView aggressive caching behavior, CloudStorage callback signatures, HapticFeedback types, BotFather configuration, GitHub Pages deployment, and the critical differences between running in Telegram vs regular browser. Prevents cache-related bugs where users see stale versions, broken CloudStorage callbacks, and missing haptic feedback.
---

# Telegram Mini App Operations

## Deployment Chain
```
Local (/tmp/neurodeck/)
  → git push → GitHub (serwaksus/neurodeck)
  → GitHub Pages → https://serwaksus.github.io/neurodeck/
  → BotFather → Telegram Mini App URL
  → User opens in Telegram WebView
```

## Cache-Busting (CRITICAL)

Telegram WebView caches HTML/CSS/JS **aggressively**. Users WILL see stale versions unless you bump versions.

### Current Strategy: `?v=N` Query Strings
```html
<link rel="stylesheet" href="css/style.css?v=18">
<script src="js/app.js?v=18"></script>
```

### When to Bump Version
- **ALWAYS bump `?v=N` when editing CSS or JS**
- Bump in `index.html` for BOTH `style.css` and `app.js`
- Current version: check the highest `?v=N` in index.html

### Cache-Bump Checklist
```diff
- href="css/style.css?v=OLD"
+ href="css/style.css?v=NEW"
- src="js/app.js?v=OLD"
+ src="js/app.js?v=NEW"
```

**HTML itself:** Telegram WebView may cache the HTML. The `?v=N` on CSS/JS inside the HTML forces refresh of those resources even if HTML is stale.

## Telegram WebApp API

### CloudStorage
```js
var cs = Telegram.WebApp.CloudStorage;

// Check availability
function getCloudStorage() {
    try {
        return window.Telegram && Telegram.WebApp && Telegram.WebApp.CloudStorage
            ? Telegram.WebApp.CloudStorage : null;
    } catch(e) { return null; }
}

// SET: callback(error, result)
cs.setItem(key, value, function(error, result) { ... });

// GET: callback(error, result)
cs.getItem(key, function(error, result) { ... });
```

**CRITICAL:** Callback parameter order is `(error, result)`, NOT `(result, error)`.

**Outside Telegram:** `getCloudStorage()` returns `null`. All cloud operations gracefully degrade.

### HapticFeedback
```js
var tg = Telegram.WebApp.HapticFeedback;

// Impact types (physical feedback)
tg.impactOccurred('light');    // taps, card completion
tg.impactOccurred('medium');   // rank-up, forge, equip
tg.impactOccurred('heavy');    // crit, boss defeat, stage evolve
tg.impactOccurred('rigid');

// Notification types (success/warning/error)
tg.notificationOccurred('success');  // level up, goal complete
tg.notificationOccurred('warning');  // duplicate completion
tg.notificationOccurred('error');    // skip, goal fail
```

### NeuroDeck haptic() wrapper
```js
function haptic(type) {
    // type: 'light', 'medium', 'heavy', 'rigid', 'success', 'warning', 'error'
    try {
        var tg = Telegram.WebApp.HapticFeedback;
        if (!tg) return;
        if (['light','medium','heavy','rigid'].includes(type)) tg.impactOccurred(type);
        else tg.notificationOccurred(type);
    } catch(e) {}
}
```

**Always use the wrapper** — it has try/catch and null checks.

## WebView vs Browser Differences

| Feature | Telegram WebView | Regular Browser |
|---------|-----------------|----------------|
| CloudStorage | ✅ Available | ❌ `getCloudStorage()` returns null |
| HapticFeedback | ✅ Available | ❌ Silently skipped |
| `confirm()` | ⚠️ Unreliable | ✅ Works |
| `alert()` | ⚠️ Unreliable | ✅ Works |
| `navigator.share()` | ⚠️ May not work | ✅ Works |
| Cache behavior | **Aggressive** | Normal |
| localStorage | Can be cleared by WebView | Persistent |
| `window.open()` | ❌ Blocked | ✅ Works |

### NEVER use `confirm()` or `alert()`
Telegram WebView handles native dialogs poorly. Use `dungeonConfirm()` instead:
```js
dungeonConfirm('Title', 'Body HTML').then(function(ok) {
    if (ok) doSomething();
});
```

## GitHub Pages Deployment

### URL Structure
```
https://USERNAME.github.io/REPO_NAME/
↓
https://serwaksus.github.io/neurodeck/
```

### Files served from `main` branch root:
- `/index.html`
- `/css/style.css`
- `/js/app.js`

### Share Link must use origin + pathname:
```js
return window.location.origin + window.location.pathname + '#' + encoded;
// Produces: https://serwaksus.github.io/neurodeck/#<base64data>
```

## BotFather Configuration

- Bot URL: set to `https://serwaksus.github.io/neurodeck/`
- Mini App opens in WebView (not external browser)
- Domain must match GitHub Pages domain

## Common Debugging

### "User sees old version"
1. Check `?v=N` was bumped in index.html
2. Ask user to fully close and reopen Telegram (not just minimize)
3. On extreme cache: clear Telegram cache in Settings → Data & Storage

### "CloudStorage not working"
1. Check user is actually in Telegram (not browser)
2. Check `getCloudStorage()` returns non-null
3. Add timeout (10s) — CloudStorage can hang
4. Fallback: suggest file-based sync

### "Sound not playing"
- Web Audio API requires user interaction first
- `getAudioCtx()` is called on first click (`{ once: true }`)
- If audio still fails: it's a WebView restriction, sounds gracefully degrade

## Git Configuration
```
user.name: serwaksus
user.email: serwaksus@users.noreply.github.com
remote: https://serwaksus:<PAT>@github.com/serwaksus/neurodeck.git
branch: main
```

**PAT is pre-configured in the remote URL.** Do NOT change it.
