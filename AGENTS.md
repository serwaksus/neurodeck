# NeuroDeck — Project Rules

## Skill Workflow
For game development tasks: start with `router` skill unless the required domain is obvious from the user's request.

## Skill Profile
30 skills available via `.opencode/skills/`:
- 18 from `gamedev-all` (card-game, pixijs-rendering, save-systems, game-ai, game-feel, camera-systems, game-ui-ux, input-systems, performance-optimization, procedural-gen, shader-programming, router, audio-design, dialogue-systems, level-design, physics-tuning, game-jam, prototype-fast)
- 12 NeuroDeck-specific (canvas-particle-effects, shader-dev, souls-like-ui-design, neurodeck-architecture, neurodeck-edit-protocol, neurodeck-state-schema, neurodeck-game-balance, neurodeck-data-sync, neurodeck-daily-cycles, neurodeck-qa-checklist, telegram-miniapp-ops, telegram-rf-ops)

## To load all 67 gamedev skills globally
```bash
swap-skills gamedev-all
swap-skills none     # remove profile skills
swap-skills --budget # show token estimate
```

## Verification
- `npm run check:js` — JS syntax check
- `npm test` — full test suite
- E2E: `npx playwright test tests/e2e/`
