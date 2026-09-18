# NeuroDeck — Project Rules

## Skill Workflow
For game development tasks: start with `router` skill unless the required domain is obvious from the user's request.

## Skill Profile
12 skills in `.opencode/skills/` (actual dirs, сверено 2026-09-17):
canvas-particle-effects, e2e-testing-patterns, neurodeck-architecture, neurodeck-daily-cycles, neurodeck-data-sync, neurodeck-edit-protocol, neurodeck-game-balance, neurodeck-qa-checklist, neurodeck-state-schema, souls-like-ui-design, telegram-miniapp-ops, telegram-rf-ops

The 18 `gamedev-all` skills (card-game, pixijs-rendering, save-systems, game-ai, game-feel, camera-systems, game-ui-ux, input-systems, performance-optimization, procedural-gen, shader-programming, router, audio-design, dialogue-systems, level-design, physics-tuning, game-jam, prototype-fast) are NOT directories here — they load via the `swap-skills` profile, not via `.opencode/skills/`.

## To load all 67 gamedev skills globally
```bash
swap-skills gamedev-all
swap-skills none     # remove profile skills
swap-skills --budget # show token estimate
```

## Verification
- `npm run check:js` — JS syntax check (covers 4 core files; stronghold-data/stronghold-model/perf-compat indirectly via tests)
- `npm test` — full test suite
- E2E: `npx playwright test tests/e2e/`
- **Full chain = `npm run ci`** — check:js + unit + e2e + visual + playtest:strongholds/acceptance + qa:data/chaos/parity (same 9 steps run in GitHub Actions; visual stays continue-on-error there)
