---
name: neurodeck-game-balance
description: All NeuroDeck game balance formulas and progression design. Use when tweaking XP, HP, damage, rage, loot, mastery, stat growth, streak bonus, boss phases, blood oath, combo, prestige, evolution, goals, or shards. Updated to v40 (balance v2).
---

# NeuroDeck Game Balance & Formulas

> **LAST UPDATED:** v40 (balance v2)

## XP Curve v2 (Souls-like)
```
L→L+1 thresholds, levels 1–15:
50 100 200 380 700 1300 2400 4500 8500 16000 22000 30000 40000 52000 68000
Post-15: prev × 1.65. L10→15 total ≈ 228k (was 774k on the old curve).
```

## Card XP = round(15 × streakMult × intBonus × comboMult × prestigeMult)
- streakMult: 1.0 + min(1.0, streak × 0.05), cap ×2.0. Streak decays to 0 if a card is missed a full day (no completion yesterday or today).
- comboMult: 1.20 if 3+ unique stats today
- prestigeMult: 1 + sum(prestige levels of same-stat cards) × 0.05, total bonus capped at ×1.5

## XP Sources: Goal (half across steps + half on completion) | Boss kill 800/1200/1600 | Blood oath 500 × (rank index+1)

## GOAL ECONOMY: goals grant NO action points (goal.dmg AP exploit removed). Attribute points by goal type: short +1, medium +2, long +5 (GOAL_REWARDS.statXp, granted once on completion, not per step). Goal XP split: half across steps, half on completion.

## STAT GROWTH (Morrowind): threshold = 5 + floor(val × 1.5). Level-up: NO stats.
## HP: maxHp = 80 + (level-1)×6 + end×2. Card +1 HP. Level-up 50% heal.
## DAMAGE: baseDmg = 5 + floor(sumStats×0.5) + floor(gearStr/5). Crit: min(50%, cha×2%). Cannot attack while rage > 0.
## RAGE (mandatory): unspent rage converts to HP damage at Monday reset — 8+stage×4 per point. HP clamped min 1 (Hollow possible).
## BOSS: HP scales ×(1 + floor((level-1)/5) × 0.25). Base HP: Snake 450, Demon 550, Chimera 670. Chimera shield 3 hits (was 5).
## MASTERY: start 5, grows ×1.2. ~140 completions to SSS on base growth; depth evolution (gain ×1.5) cuts that proportionally.
## LOOT: 5% + min(5%, streak×0.25%). Weights S=1,A=3,B=6,C=10. Artifact pool exhausted → shards currency instead (+3 boss kill, +2 completion proc), shown in backpack.
## ARTIFACTS: C=none, B=2×BBB+, A=2×AAA+, S=2×SSS+
## BLOOD OATH: 5 days or destroy. Reward scales: 500 × (rank index+1). Deleting the oath card fails the oath.
## COMBO: 3+ unique stats/day → ×1.20 XP
## PRESTIGE: SSS→C, +5% XP same-stat permanently, total bonus capped at ×1.5
## EVOLUTIONS (all three implemented): depth = mastery gain ×1.5 | frequency = +1 stat point per completion | stability = double Will-save chance on skip
## FAILCARD: once per card per day.
## HOLLOW: triggers at 1 HP (boss turn or Monday rage damage). Redemption: 3 perfect days → 30% maxHp.
## ESTUS: NOT IMPLEMENTED — removed from the balance model (obsolete, do not design around it).
