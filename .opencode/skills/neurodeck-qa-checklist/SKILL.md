---
name: neurodeck-qa-checklist
description: Mandatory pre-commit quality gate for NeuroDeck. Use after ANY edit to index.html, css/style.css, or js/app.js, before committing. Covers JS syntax, cache-bust, save/load round-trip, event delegation completeness, boss phase gating, blood oath edge cases, and Morrowind stat growth. Updated for v29.
---

# NeuroDeck QA Checklist

> **USE:** After every code change, before `git commit`
> **LAST UPDATED:** v29 (commit 504cbc2)

## 1. JavaScript Syntax
```bash
node -c js/app.js
```
- MUST pass with no output
- Run after EVERY edit, not just at the end

## 2. Cache-Bust
- Check `?v=N` in index.html for BOTH `style.css` and `app.js`
- Bump by +1 from previous version
- Telegram WebView caches aggressively — missing bump = stale app

## 3. Event Delegation Check
- Any new `data-action="X"` in HTML MUST have `case 'X':` in the click handler (L.107-160)
- Check: `grep "data-action" index.html` vs `grep "case '" js/app.js`

## 4. Save/Load Round-Trip
New state fields MUST be in BOTH:
- `saveGameState()` (L.2138) — add to snapshot object
- `applySyncData()` (L.2705) — add restore line
- `buildSyncData()` (L.2493) — add to sync snapshot
- If IDB-backed: saveToIDB happens automatically in saveGameState

## 5. Boss Phase Gating
- Does the new logic check `getBattlePhase()`?
- Damage to boss ONLY in `attackBoss()` (battle phase)
- Card completion gives `actionPoints`, NOT boss damage
- Card skip gives `bossRagePoints`, NOT boss heal
- Goal completion gives `actionPoints`, NOT boss damage

## 6. Blood Oath Edge Cases
- If editing `completeCard`: does `onBloodOathComplete(id)` still get called?
- If editing `failCard`: does `onBloodOathSkip(id)` still get called?
- If editing `deleteCard`: does oath cancel when target card deleted?
- If editing `checkDailyReset`: does `checkBloodOathDaily()` still run?

## 7. Morrowind Stat Growth
- Every card completion MUST give +1 to `STATS[card.stat].attributePoints`
- `checkAttributePoolGrowth()` uses `getStatThreshold(stat.value)` (dynamic)
- Level-up does NOT increase stats (only maxHP + 50% heal)
- Rank-up gives bonus +1 to stat pool

## 8. Weekly Reset
- `lastWeekReset` in saveGameState snapshot
- `lastWeekReset` restored in applySyncData
- On Monday transition: actionPoints=0, bossRagePoints=0

## 9. Estus Removed (v25+)
- NO references to estus, estusUsedToday, lastEstusReset, drinkEstus
- If found in new code: REMOVE
- `grep -rn "estus\|Estus\|Эстус" js/app.js index.html css/style.css` → should be empty

## 10. Adaptation Decay Removed (v28+)
- NO references to getAdaptationMultiplier, getAdaptationLabel, adaptationMult
- Streak bonus replaces it: `getStreakBonus(card)`
- `grep -rn "getAdaptation\|adaptationMult\|adaptInfo\|adapt-" js/app.js css/style.css` → should be empty

## 11. Hollow Safety
- `endBossTurn()` uses `Math.max(1, ...)` — hero cannot die below 1 HP
- `checkGoalDeadlines()` adds bossRagePoints, does NOT damage HP directly
- If HP ≤ 1 from rage: trigger isHollow + random card mastery reset

## 12. Data Loss Protections (5 layers)
- saveGameState: auto-restore from neurodeck_cards_backup if FORGED empty
- neurodeck_cards_backup: only written when FORGED.length > 0
- autoCloudSave: returns early if FORGED empty
- smartCloudSync: won't load cloud with fewer cards than local
- loadGameState: auto deepRecovery if FORGED empty after load

## 13. Visual Effects Present
- If adding celebration: `burstParticles(x, y, count, opts)`
- If adding punishment: `spawnBloodRain(n)` + `screenShake(intensity, duration)`
- If adding feedback: `showToast(title, body, type)` + `haptic(type)`
- Types for showToast: 'blood' (red), 'crit' (gold), 'save' (green), default

## QUICK COMMAND
```bash
cd /tmp/neurodeck && node -c js/app.js && grep "?v=" index.html && grep -c "estus\|getAdaptation\|adaptationMult" js/app.js
```
All three should succeed with v=29+ and count=0.
