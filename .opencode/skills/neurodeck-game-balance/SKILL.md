---
name: neurodeck-game-balance
description: All NeuroDeck game balance formulas and progression design. Use when tweaking XP, HP, damage, rage, loot, mastery, stat growth, streak bonus, boss phases, blood oath, combo, prestige, or evolution. Updated to v39.
---

# NeuroDeck Game Balance & Formulas

> **LAST UPDATED:** v39 (commit d5c63b2)

## XP Curve (Souls-like)
```
1→2:50 2→3:100 3→4:200 4→5:380 5→6:700 6→7:1.3k 7→8:2.4k
8→9:4.5k 9→10:8.5k 10→11:16k 11→12:30k 12→13:58k
13→14:110k 14→15:360k. Post-15: prev × 1.8
```

## Card XP = round(15 × streakMult × intBonus × comboMult × prestigeMult)
- streakMult: 1.0 + min(1.0, streak × 0.05), cap ×2.0
- comboMult: 1.20 if 3+ unique stats today
- prestigeMult: 1 + sum(prestige levels of same-stat cards) × 0.05

## XP Sources: Goal 30/80/200 | Boss kill 800/1200/1600 | Blood oath 500

## STAT GROWTH (Morrowind): threshold = 5 + floor(val × 1.5). Level-up: NO stats.
## HP: maxHp = 80 + (level-1)×6 + end×2. Card +1 HP. Level-up 50% heal.
## DAMAGE: baseDmg = 5 + floor(sumStats×0.5) + floor(gearStr/5). Crit: min(50%, cha×2%).
## BOSS: rage ×(8+stage×4). HP: Snake 450, Demon 550, Chimera 670.
## MASTERY: start 5, grows ×1.2. ~140 completions to SSS.
## LOOT: 5% + min(5%, streak×0.25%). Weights S=1,A=3,B=6,C=10.
## ARTIFACTS: C=none, B=2×BBB+, A=2×AAA+, S=2×SSS+
## BLOOD OATH: 5 days or destroy. Break-even 87% completion.
## COMBO: 3+ unique stats/day → ×1.20 XP
## PRESTIGE: SSS→C, +5% XP same-stat permanently (max 3×)
