---
name: neurodeck-edit-protocol
description: Token-efficient editing protocol for NeuroDeck. Use when making ANY code change to enforce surgical workflow: grep→targeted-read→edit→syntax-check→cache-bump→commit. Updated to v39 with PixiJS combat.
---

# NeuroDeck Edit Protocol

> **GOAL:** Every edit in <500 tokens. Never read the whole file.
> **THREE JS FILES:** pixi.js (CDN) + combat-pixi.js (renderer) + app.js (game logic)

## WORKFLOW
1. **LOCATE:** grep -n in the RIGHT file (app.js or combat-pixi.js)
2. **TARGETED READ:** read(offset=line-5, limit=30)
3. **EDIT:** one edit per call, unique oldString
4. **SYNTAX:** node -c js/app.js AND/OR node -c js/combat-pixi.js
5. **CACHE BUMP:** THREE replacements in index.html (css + combat-pixi.js + app.js)
6. **COMMIT:** git add -A && git commit && git push

## WHICH FILE?
| Task | File |
|------|------|
| Game logic, cards, stats, goals | js/app.js |
| Combat rendering, sprites, animations | js/combat-pixi.js |
| HTML structure | index.html |
| Styling | css/style.css |

## CHECKLIST
- [ ] New state field in saveGameState + applySyncData?
- [ ] New data-action in event delegation?
- [ ] Boss logic gated by getBattlePhase()?
- [ ] Combat API: window.* calls (NOT old functions)?
- [ ] node -c BOTH js files if unsure which is affected?
- [ ] Cache bump ALL THREE ?v=N refs?
