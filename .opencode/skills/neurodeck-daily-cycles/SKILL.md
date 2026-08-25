---
name: neurodeck-daily-cycles
description: Time-based game mechanics and daily cycle logic for NeuroDeck. Use when editing checkDailyReset(), checkGoalDeadlines(), updatePunishCountdown(), getMSKDayKey(), getMSKDate(), consecutivePerfectDays tracking, streak decay, failCard daily guard, Monday rage damage conversion, notification re-arm, Hollow transformation, or any code involving timestamps, deadlines, timezones, or periodic intervals. Covers MSK timezone handling (UTC+3), the daily reset boundary (23:00 MSK), goal deadline checking (every 30s), perfect day tracking, Hollow/Redemption cycle, and the two setInterval timers. Prevents timezone bugs, double punishments, missed deadline checks, and broken streak tracking.
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

## Two setInterval Timers

| Interval | Function | Purpose |
|----------|----------|---------|
| 60,000 ms (1 min) | `checkDailyReset()` + `updatePunishCountdown()` + `checkBloodOath()` | Day boundary + countdown display + blood oath check |
| 30,000 ms (30 sec) | `checkGoalDeadlines()` | Goal deadline enforcement |

```js
setInterval(function() { checkDailyReset(); updatePunishCountdown(); checkBloodOath(); }, 60 * 1000);
setInterval(checkGoalDeadlines, 30000);
```

## checkDailyReset() — Nightly Processing

### When It Triggers
The function runs every minute. It compares `lastDayReset` with current `getMSKDayKey()`. When they differ, a new day has started.

### Processing Order (CRITICAL — do not reorder)
```
1. STREAK DECAY
   ├── FORGED.forEach: card missed for a full day?
   │   └── "Missed" = no completion yesterday AND none today
   │       → card.streak = 0 (streakMult drops back toward 1.0)

2. MONDAY RAGE CONVERSION (only when the new day is Monday)
   ├── If HERO.rage > 0:
   │   ├── Damage per point: 8 + stage × 4
   │   ├── HERO.hp = max(1, HERO.hp - rage × dmgPerPoint)  // clamped min 1
   │   ├── Visual effects + toast
   │   └── If HERO.hp === 1 AND !isHollow:
   │       └── Transform to Hollow
   └── HERO.rage = 0 after conversion

3. PERFECT DAY TRACKING
   ├── if dailyCompletions > 0 AND dailySkips === 0:
   │   └── consecutivePerfectDays++
   └── else:
        └── consecutivePerfectDays = 0

4. HOLLOW REDEMPTION CHECK
   ├── if isHollow AND consecutivePerfectDays >= 3:
   │   ├── isHollow = false
   │   ├── HERO.hp = maxHp * 0.30
   │   └── Show redemption message
   └── else: continue as Hollow

5. DAILY RESETS
   ├── dailyCompletions = 0
   ├── dailySkips = 0
   ├── failCard flags cleared (failCard is once per card per day)
   ├── Notification re-arm: scheduleNotifs() re-registered for the new day
   └── chimeraShield = 3 (reset Chimera shield)

6. CARD DAYS ACTIVE UPDATE
   └── FORGED.forEach: recalculate daysActive

7. SAVE
   ├── lastDayReset = todayKey
   └── saveGameState()
```

### Important Notes
- **lastDayReset starts as null.** First run skips decay/rage phases (no previous day to check).
- **Rage damage fires only on Monday reset** — on other days unspent rage simply carries over; attacking is blocked while rage > 0.
- **Streak/rage use PAST day's data** (the day that just ended), not the new day.
- **Hollow transformation happens at 1 HP** — from a boss turn or Monday rage damage, never from goal failure or card skip.

## checkGoalDeadlines() — Goal Enforcement

```js
function checkGoalDeadlines() {
    var now = Date.now();
    var changed = false;
    GOALS.forEach(function(goal) {
        if (goal.completed || goal.failed || !goal.deadline) return;
        if (now >= goal.deadline) {
            goal.failed = true;         // guard: a failed goal never fails twice
            changed = true;
            bossRagePoints += goal.dmg; // no HP change here
            // Screen shake + blood rain + sfx + haptic + toast
        }
    });
    if (changed) { renderGoals(); updateHeroUI(); saveGameState(); }
}
```

### Key Points
- Runs every **30 seconds**
- Goals without deadline (`deadline: null`) are never auto-failed
- Failed goals are permanent (cannot be retried); the `goal.failed` flag prevents re-fail stacking
- **No direct HP loss** — expiry adds `goal.dmg` to `bossRagePoints`, nothing more
- The rage lands as HP damage later through the standard rage pipeline: boss turn-end (`ragePoints × (8 + stage × 4)`) or Monday reset conversion (same formula, HP clamped min 1 → Hollow possible)

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
HP reaches 1 (boss turn or Monday rage damage; HP clamped min 1)
    ↓
HERO.isHollow = true
HERO.hp = 1 (stays at 1 HP, not revived higher)
    ↓
Damage output ×0.5 until redeemed
    ↓
Need 3 consecutive perfect days
    ↓
Each perfect day: consecutivePerfectDays++
    ↓
At 3: isHollow = false, hp = maxHp * 0.30
```

**Interrupting the streak:** Any day with `dailySkips > 0` resets `consecutivePerfectDays` to 0.

## Estus System

**NOT IMPLEMENTED / OBSOLETE.** Estus was removed from the game in balance v2 — there is no `estus`, `estusUsedToday`, `drinkEstus()` or monthly estus reset in the current code. Do not reference them in new code.

## Common Bugs to Prevent

1. **Double punishment:** Only happens if `lastDayReset` isn't updated. Always set it BEFORE saving.
2. **Stale lastDayReset:** If saved as old value, Monday rage damage may fire retroactively. The null-check prevents this on first load.
3. **Timezone drift:** Always use `getMSKDayKey()` for day comparisons. Never compare raw timestamps.
4. **Goal deadline in string format:** `renderGoals()` has a migration path for string deadlines → timestamp. New goals always use timestamps.
5. **chimeraShield not resetting:** Only resets in `checkDailyReset()`. If player kills Chimera and new one spawns same day, shield carries over until next daily reset.
6. **failCard spam:** failCard is guarded once per card per day — do not remove the daily flag check, or one card could be failed repeatedly for stacked penalties.
7. **Rage conversion on wrong weekday:** Unspent rage converts to HP damage only at the Monday reset; running it daily double-punishes the player.
