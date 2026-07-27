---
name: neurodeck-daily-cycles
description: Time-based game mechanics and daily cycle logic for NeuroDeck. Use when editing checkDailyReset(), checkGoalDeadlines(), updatePunishCountdown(), getMSKDayKey(), getMSKDate(), drinkEstus(), the monthly estus reset, consecutivePerfectDays tracking, Hollow transformation, or any code involving timestamps, deadlines, timezones, or periodic intervals. Covers MSK timezone handling (UTC+3), the daily reset boundary (23:00 MSK), punishment calculation, goal deadline checking (every 30s), perfect day tracking, Hollow/Redemption cycle, and the three setInterval timers. Prevents timezone bugs, double punishments, missed deadline checks, and broken streak tracking.
---

# NeuroDeck Daily Cycles Guide

## Timezone: Moscow (MSK = UTC+3)

### Core Functions
```js
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000; // 3 hours in ms

function getMSKDate(ts) {
    return new Date((ts || Date.now()) + MSK_OFFSET_MS);
}

function getMSKDayKey(ts) {
    const d = getMSKDate(ts);
    return d.getUTCFullYear() + '-' +
           String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
           String(d.getUTCDate()).padStart(2, '0');
    // Example: "2026-06-15"
}
```

**CRITICAL:** `getMSKDayKey()` uses `getUTC*` methods because the date was already shifted by MSK_OFFSET_MS. Do NOT use `getHours()`, `getDate()`, etc. — they would double-shift.

### Day Key Usage
- Card daily completion check: `getMSKDayKey(card.lastCompletedAt) === getMSKDayKey()`
- Daily reset tracking: `lastDayReset === todayKey`
- XP history dates: `xpHistory[i].date`
- Heatmap dates

## Three setInterval Timers

| Interval | Function | Purpose |
|----------|----------|---------|
| 60,000 ms (1 min) | `checkDailyReset()` + `updatePunishCountdown()` | Day boundary + countdown display |
| 30,000 ms (30 sec) | `checkGoalDeadlines()` | Goal deadline enforcement |

```js
setInterval(function() { checkDailyReset(); updatePunishCountdown(); }, 60 * 1000);
setInterval(checkGoalDeadlines, 30000);
```

## checkDailyReset() — Nightly Processing

### When It Triggers
The function runs every minute. It compares `lastDayReset` with current `getMSKDayKey()`. When they differ, a new day has started.

### Processing Order (CRITICAL — do not reorder)
```
1. PUNISHMENT PHASE (only if lastDayReset !== null)
   ├── Find cards not completed on lastDayReset day
   │   └── Card is "uncompleted" if: !lastCompletedAt OR
   │       getMSKDayKey(lastCompletedAt) !== lastDayReset
   ├── If uncompletedCards > 0 AND !estusUsedToday:
   │   ├── Calculate damage: count × 10 × stage.dmgMult
   │   ├── HERO.hp -= damage (min 0)
   │   ├── Visual effects: bloodRain, screenShake, boss attack anim
   │   ├── Toast notification
   │   └── If HERO.hp <= 0 AND !isHollow:
   │       └── Transform to Hollow
   └── Skip if estusUsedToday (Estus negates all punishment)

2. PERFECT DAY TRACKING
   ├── if dailyCompletions > 0 AND dailySkips === 0:
   │   └── consecutivePerfectDays++
   └── else:
       └── consecutivePerfectDays = 0

3. HOLLOW REDEMPTION CHECK
   ├── if isHollow AND consecutivePerfectDays >= 3:
   │   ├── isHollow = false
   │   ├── HERO.hp = maxHp * 0.5
   │   └── Show redemption message
   └── else: continue as Hollow

4. DAILY RESETS
   ├── dailyCompletions = 0
   ├── dailySkips = 0
   ├── estusUsedToday = false
   └── chimeraShield = 5 (reset Chimera shield)

5. MONTHLY ESTUS RESET
   ├── Compare current month with lastEstusReset
   ├── If different: estus = 3
   └── Update lastEstusReset

6. CARD DAYS ACTIVE UPDATE
   └── FORGED.forEach: recalculate daysActive

7. SAVE
   ├── lastDayReset = todayKey
   └── saveGameState()
```

### Important Notes
- **lastDayReset starts as null.** First run skips punishment (no previous day to check).
- **Estus fully blocks punishment** — if `estusUsedToday`, no damage applied regardless of uncompleted cards.
- **Punishment uses PAST day's data** (the day that just ended), not the new day.
- **Hollow transformation only happens from punishment**, never from goal failure or card skip.

## checkGoalDeadlines() — Goal Enforcement

```js
function checkGoalDeadlines() {
    var now = Date.now();
    GOALS.forEach(function(goal) {
        if (goal.completed || goal.failed || !goal.deadline) return;
        if (now >= goal.deadline) {
            goal.failed = true;
            var dmg = goal.dmg * 2;  // DOUBLE damage
            HERO.hp = Math.max(0, HERO.hp - dmg);
            // Visual + audio effects
        }
    });
    // Save if any goals changed
}
```

### Key Points
- Runs every **30 seconds**
- Goals without deadline (`deadline: null`) are never auto-failed
- Failed goals deal **2× their normal damage** to the player
- Failed goals are permanent (cannot be retried)
- **This is SEPARATE from boss punishment** — goal damage is direct HP loss

## updatePunishCountdown() — Display Timer

```js
function updatePunishCountdown() {
    // Calculate seconds until 23:00 MSK
    var mskNow = new Date(now + MSK_OFFSET_MS);
    var diff = ((23 - h) * 60 - m) * 60 - s;
    if (diff <= 0) diff += 86400; // next day if past 23:00
    // Display: "⚔ Наказание через H:MM:SS"
}
```

**Note:** The countdown shows time until 23:00 MSK, but `checkDailyReset()` triggers on **date change** (midnight MSK). The 23:00 reference is thematic — the actual day boundary is when `getMSKDayKey()` changes.

## Perfect Day Logic

A "perfect day" requires:
- `dailyCompletions > 0` (at least one card completed)
- `dailySkips === 0` (zero card skips)

**NOT required:**
- All cards completed (only that some were done)
- Goals completed
- Boss damaged

**Edge case:** If player has zero cards and zero skips → NOT perfect (completions = 0).

## Hollow / Redemption Cycle

```
HP reaches 0 from punishment
    ↓
HERO.isHollow = true
HERO.hp = maxHp * 0.25 (revived at quarter HP)
    ↓
Damage output ×0.5 until redeemed
    ↓
Need 3 consecutive perfect days
    ↓
Each perfect day: consecutivePerfectDays++
    ↓
At 3: isHollow = false, hp = maxHp * 0.5
```

**Interrupting the streak:** Any day with `dailySkips > 0` resets `consecutivePerfectDays` to 0.

## Estus System

### Monthly Reset
```js
const currentMonth = new Date().getMonth();
if (currentMonth !== HERO.lastEstusReset) {
    HERO.estus = 3;
    HERO.lastEstusReset = currentMonth;
}
```

**Note:** Uses `new Date().getMonth()` — LOCAL timezone, not MSK. This is acceptable since month boundaries are rarely a problem, but could theoretically differ by a few hours.

### Daily Limit
- `estusUsedToday` flag, reset in `checkDailyReset()`
- Drinking Estus: `estus--`, `estusUsedToday = true`
- Cannot drink twice in one day (button disabled)

## Common Bugs to Prevent

1. **Double punishment:** Only happens if `lastDayReset` isn't updated. Always set it BEFORE saving.
2. **Stale lastDayReset:** If saved as old value, punishment may fire retroactively. The null-check prevents this on first load.
3. **Timezone drift:** Always use `getMSKDayKey()` for day comparisons. Never compare raw timestamps.
4. **Goal deadline in string format:** `renderGoals()` has a migration path for string deadlines → timestamp. New goals always use timestamps.
5. **chimeraShield not resetting:** Only resets in `checkDailyReset()`. If player kills Chimera and new one spawns same day, shield carries over until next daily reset.
