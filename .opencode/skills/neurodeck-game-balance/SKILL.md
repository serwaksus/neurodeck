---
name: neurodeck-game-balance
description: All NeuroDeck game balance formulas and progression design. Use when tweaking XP, HP, damage, rage, loot, mastery, stat growth, streak bonus, boss phases, blood oath, combo, prestige, evolution, goals, or shards. Updated to v41 (combat 2.0 / Crucible).
---

# NeuroDeck Game Balance & Formulas

> **LAST UPDATED:** v41 (combat 2.0 / Crucible)

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
## CRUCIBLE COMBAT v2 (боевка 2.0) — current combat model. Sim polygon: tools/combat-lab (baseline v1).
## CRUCIBLE FORMAT: босс-ран = 3 боя (стадия = бой); передышка между боями: +60% maxHp и +3 ОД; смерть героя = провал всего рана (жёсткое наказание).
## CRUCIBLE ACTIONS (одно действие за раунд): Удар (бесплатно): 5 + str + 10 (снаряжение) + int×0.5×фокус, крит min(0.5, cha×0.02 + 0.05×фокус) ×2 | Стойка (1 ОД): щит wil×1.6 + end×0.9, снимает 1 тик яда | Концентрация (бесплатно, ≤2 стаков): +crit и +урон | Фляга (бесплатно, 1/бой): лечит 50% maxHp.
## CRUCIBLE DECK STYLE (доминирующий атрибут героя): str — пробивает 1 заряд гарда | end — щит ×1.5 | int — фокус ≤3 | cha — крит ×2.5 | wil — каждая 2-я стойка бесплатна | agi — 25% двойной удар.
## CRUCIBLE INTENTS (телеграфируются): Тяжёлый ×1.6 | Быстрый ×0.9 | Ярость +2 (спад −1/раунд) | Спец каждые 5 раундов — змея: яд 3 тика × (2+стадия); демон: выжигание 4+стадия сквозь щит; химера: гард 2 заряда, блокированные удары наносят 30% чипа.
## CRUCIBLE AP CYCLE: +1 ОД за выполнение карточки в будни; бой пятница–воскресенье; ярость обязательна как раньше.
## CRUCIBLE HP SCALING: ×(1 + (lvl−1)×0.10), после L10 дополнительно ×0.18/уровень.
## CRUCIBLE ECONOMY: фляги только за осколки (10💰, макс 5); лавка: недостающие артефакты S=25/A=15/B=8💰. Фляги пьются и ВНЕ боя из рюкзака (кнопка 🧪, +50% maxHp, −1 фляга) — валюта ретрая после провала рана. Perf-режимы: пять (auto/eco/performance/low/effects-off), eco≡low, performance≡effects-on.
## CRUCIBLE BASELINE (400 прогонов/конфиг, tactical, 28 ОД):
```
змея   L3/L8/L15 = 20%/58%/86%
демон  L3/L8/L15 = 2%/5%/55% (стена против агрессии)
химера L3/L8/L15 = 20%/47%/77%
деки L15 змея: agi 98% | end 99% | cha 97% | wil 94% | int 87%
```
## DAMAGE (ЗАМЕНЕНО → CRUCIBLE COMBAT v2): baseDmg = 5 + floor(sumStats×0.5) + floor(gearStr/5). Crit: min(50%, cha×2%). Cannot attack while rage > 0.
## RAGE (mandatory; действует и в Crucible, цикл боя → CRUCIBLE AP CYCLE): unspent rage converts to HP damage at Monday reset — 8+stage×4 per point. HP clamped min 1 (Hollow possible).
## BOSS (ЗАМЕНЕНО → CRUCIBLE HP SCALING / CRUCIBLE FORMAT): HP scales ×(1 + floor((level-1)/5) × 0.25). Base HP: Snake 450, Demon 550, Chimera 670. Chimera shield 3 hits (was 5).
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
