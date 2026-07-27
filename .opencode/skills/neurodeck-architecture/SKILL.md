---
name: neurodeck-architecture
description: Master architecture guide for NeuroDeck. Use when editing ANY file, discussing any game system, or needing function locations. Updated to v39 with PixiJS combat renderer, AI sprites, combo, prestige, evolution. ALWAYS grep for line numbers.
---

# NeuroDeck Architecture & Function Index

> **LAST UPDATED:** v39 (commit d5c63b2)
> **ALWAYS grep for line number** — they shift after every edit

## Files
```
index.html      ~460 lines — HTML, modals, views, data-actions
css/style.css   ~815 lines — styles, animations, room themes
js/app.js       ~3380 lines — game logic (cards, stats, goals, boss state, storage)
js/combat-pixi.js ~430 lines — PixiJS combat renderer (IIFE, window.* API)
```

## THREE SCRIPT FILES (load order)
1. `pixi.js@7` + `pixi-filters@5` via CDN
2. `js/combat-pixi.js` — IIFE, exposes window.* combat API
3. `js/app.js` — game logic, calls combat API

## Image Assets (AI-generated via Pollinations.ai)
- `dd-bg-final.jpg` (74KB) — dungeon background
- `dd-hero-cutout.png` (441KB) — hero sprite, black bg removed, 60% transparent
- `dd-snake-cutout.png` (506KB) — boss sprite, black bg removed, 60% transparent
- OLD: hero-cutout.png, snake-cutout.png, bg-optimized.jpg — UNUSED, can delete

## Combat Renderer (combat-pixi.js)
- **PixiJS v7** — Application, Sprite, Graphics, Text, ColorMatrixFilter
- Sprites: ColorMatrixFilter (brightness 0.35, saturate 0.3, contrast 1.3)
- Lighting: Graphics with ADD blend (torch glow, hero light, boss aura)
- Animations: custom tween system (windup → lunge → impact → return)
- Effects: particles, slash arc, HP bars, damage numbers, fog, embers
- Render ONLY when #view-boss active (visibility check)
- **STATUS: user reports "still bad" — needs visual debugging**

### Combat API (window.*)
```
startHeroAttack(dmg, isCrit)  — 3-phase tween animation
startBossAttack(dmg)          — mirror animation
updateHP(hp, maxHp, bHp, bMaxHp, name, stage, type)
setBossDefeated(true/false)
setBossType('normal'|'social'|'chimera')
```

## Systems Overview (app.js)
- Cards: forge → complete (+AP, +stat, +combo) → rank-up (evolution) → SSS (prestige)
- Boss: weekly phases (Mon-Thu accumulate / Fri-Sun battle), rage ×(8+stage×4)
- Stats: Morrowind (use-based, threshold 5+floor(val×1.5))
- Goals: text steps, toggle with ±XP (anti-farm)
- Blood oath: weekly event (5 days or destroy)
- Storage: 4 layers (localStorage×3 + IndexedDB + CloudStorage)
- Analytics: card heatmap, insights, weekly report
- UX: return screen, dashboard, combo bonus
- Artifacts: reqRank-based (C=none, B=2×BBB+, A=2×AAA+, S=2×SSS+)
- Streak bonus: 1.0 + min(1.0, streak×0.05), cap ×2.0

## FUNCTION INDEX (grep for line numbers)
Cards: completeCard, failCard, deleteCard, forgeCard, renderCards
Stats: checkAttributePoolGrowth, getStatThreshold, calcMaxHp, onLevelUp
Boss: getBattlePhase, getCurrentBoss, changeBossHp, triggerBossExecution, attackBoss, endBossTurn
Boss integration: initCombatCanvas (stub), updateCombatHpBars (→window.updateHP)
Goals: createGoal, renderGoals, toggleGoalStep, completeGoal
Inventory: equipItem, getArtifactReqRank, countCardsAtRankOrHigher
Blood Oath: checkBloodOath, assignBloodOath, failBloodOath, completeBloodOath
Daily: checkDailyReset, checkGoalDeadlines
Combo/Evolution/Prestige: getComboMultiplier, showEvolutionChoices, prestigeCard
Analytics: renderCardHeatmap, renderInsights, showWeeklyReport
UX: showReturnScreen, renderDashboard
Storage: saveGameState, loadGameState, applySyncData, deepRecovery

## CROSS-MODULE CONTRACTS
| Change... | Must check... |
|-----------|--------------|
| attackBoss | calls window.startHeroAttack (NOT old triggerHeroAttack) |
| endBossTurn | calls window.startBossAttack |
| changeBossHp | calls updateCombatHpBars → window.updateHP |
| triggerBossExecution | calls window.setBossDefeated(true) |
| Boss respawn | calls window.setBossDefeated(false) + setBossType |
| combat-pixi.js changes | node -c js/combat-pixi.js separately |
| Cache bump | THREE ?v=N refs in index.html (css + combat-pixi.js + app.js) |
