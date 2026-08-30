---
name: neurodeck-state-schema
description: Exact data schema for all NeuroDeck game state objects. Use when touching HERO, STATS, FORGED cards, GOALS, INVENTORY, ARTIFACTS, bossRagePoints, bloodOath, combo, cardHistory, or save/load logic. Updated to v39.
---

# NeuroDeck State Schema

> **LAST UPDATED:** v39 (commit d5c63b2)

## HERO: { name, title, level, xp, xpToNext, totalXp, hp, maxHp, isHollow, consecutivePerfectDays, dailyCompletions, dailySkips, actionPoints, lastSessionAt, dailyUniqueStats:{}, cardHistory:{}, lastWeeklyReport, shards:0+, flasks:0-5 }

## STATS (6): { name, icon, desc, color, dark, value:3, max:100, attributePoints:0 }
- attributePoints: +1 per completion + rank-up. threshold = 5+floor(val×1.5)

## CARD: { id, name, meta, rank, stat, mastery, masteryThreshold, streak, totalCompletions, daysActive, firstCompletedAt, lastCompletedAt, prestige:0-3, evolutionPath:null|'depth'|'frequency'|'stability' }

## GOAL: { id, type, name, desc, deadline, totalSteps, currentStep, steps:[{text,done}], stat, xp, dmg, statXp, completed, failed, createdAt, lastStepAt }

## ARTIFACT: { id, name, icon, rank, slot, category, bonuses:[{stat,value,label}], special, lore }
- EQUIP: C=none, B=2+BBB+, A=2+AAA+, S=2+SSS+

## Module state: bossHp, bossStage(0-2), bossDefeated, bossRagePoints(0), bossRunLocked(transient), lastWeekReset, escapeProgress(0-140), lastDayReset, bloodOath

## Combat state: SEPARATE in combat-pixi.js (IIFE), synced via window.updateHP()

## Save: { hero, stats, forged, goals, inventory, escapeProgress, bossHp, bossStage, bossDefeated, lastDayReset, bossRunLocked, forgedIdCounter, uidCounter, goalIdCounter, xpHistory, bossKills, bloodOath, bossRagePoints, lastWeekReset, savedAt } — SCHEMA_VERSION 6 (MIGRATIONS[6]: legacy → hero.flasks=2); uidCounter floored above surviving backpack uids on import; bossRunLocked persists run-fail gate across reload
