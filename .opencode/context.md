# NeuroDeck — Project Context

## Skill Profile
12 skills in `.opencode/skills/` (the 18 gamedev skills below load via the `swap-skills gamedev-all` profile, not as directories here):

### Gamedev (18, symlinked from `gamedev-all`)
| Skill | Load when |
|---|---|
| `router` | Entry point for complex/ambiguous game-dev tasks |
| `card-game` | Deck/hand/discard mechanics, card effects, turn structure, costs |
| `pixijs-rendering` | PixiJS v8 combat renderer, scene graph, textures, ticker |
| `save-systems` | Save/load, localStorage, CloudStorage, schema migration, autosave |
| `game-ai` | Boss AI, FSM, behavior trees, enemy decisions, pathfinding |
| `game-feel` | Screen shake, hit-stop, tweens, juice, knockback, VFX |
| `camera-systems` | Camera follow, deadzones, smoothing, shake, bounds clamping |
| `game-ui-ux` | HUD, health bars, menus, responsive layout, safe areas |
| `input-systems` | Touch, keyboard, action mapping, rebinding, deadzones |
| `performance-optimization` | Profiling, draw calls, object pooling, frame budget, GC |
| `procedural-gen` | Room generation, loot tables, seeded RNG, dungeons |
| `shader-programming` | Visual shader effects, GLSL, dissolve, outline, post-processing |
| `audio-design` | Audio mixing, SFX variation, adaptive music, ducking |
| `dialogue-systems` | Branching dialogue, NPC text, choices, Ink/Yarn |
| `level-design` | Encounter design, pacing, blockout, critical path |
| `physics-tuning` | Physics feel, collision, fixed timestep, jitter |
| `game-jam` | Scoping, deadlines, shipping workflow |
| `prototype-fast` | Rapid prototyping, MVP, greyboxing |

### NeuroDeck-native (12, in `.opencode/skills/`)
| Skill | Load when |
|---|---|
| `neurodeck-architecture` | Any NeuroDeck system change |
| `neurodeck-edit-protocol` | Making code changes |
| `neurodeck-state-schema` | Game state / save data |
| `neurodeck-game-balance` | Balance formulas, stats, XP, HP |
| `neurodeck-data-sync` | Save/load, localStorage, cloud sync |
| `neurodeck-daily-cycles` | Time-based mechanics, daily reset |
| `neurodeck-qa-checklist` | Pre-commit quality gate |
| `souls-like-ui-design` | CSS, UI components, themes |
| `canvas-particle-effects` | Particle system, canvas effects |
| `shader-dev` | GLSL shaders, visual effects |
| `telegram-miniapp-ops` | Telegram WebView, caching, deployment |
| `telegram-rf-ops` | Telegram connectivity from RF servers |

## Global Skills (always available, 21)
`android-native-dev`, `buddy-sings`, `conventional-commits`, `flutter-dev`, `frontend-dev`, `fullstack-dev`, `gif-sticker-maker`, `glm-quota`, `ios-application-dev`, `minimax-docx`, `mmx-cli`, `minimax-music-gen`, `minimax-music-playlist`, `minimax-pdf`, `minimax-xlsx`, `opencode-skill-creator`, `pptx-generator`, `prompt-injection-defense`, `react-native-dev`, `vision-analysis`

## Кампания 3.0 (включена по умолчанию с 2026-10-03; выключить: `localStorage.nd_c3='0'` или `?c3=0`)
Стратегический слой «реальные дела → очки движения героев → карта против фракций пороков»; работает параллельно с твердынями 2.0, сейв — необязательный ключ `c3` при схеме v14.

- Дизайн и статус: [docs/plan/CAMPAIGN-3.0.md](../docs/plan/CAMPAIGN-3.0.md) · незакрытые пункты: [docs/audit/AUDIT-2026-10-03-CAMPAIGN3.md](../docs/audit/AUDIT-2026-10-03-CAMPAIGN3.md)
- Флаг: по умолчанию включён; `localStorage.nd_c3 = '0'` или `?c3=0` выключает, `'1'` или `?c3=1` включает; тумблер — «Синхронизация» → «Кампания 3.0 (бета)».
- Модули: `js/campaign3/c3-{data,model,runtime}.js` (чистая модель тестируется в Node) + ленивый `js/campaign3/c3-loader.js` (≈1 КБ в index.html, остальные ≈75 КБ грузятся только при бете и не в прекэше); UI — `js/ui/campaign3.js` + `css/campaign3.css`; санитайзер `sanitizeC3` в `js/state-guards.js`.
- Проверки: юниты `tests/c3-*.test.js` (`npm test`), симулятор `npm run test:sim:c3` (гейты C1–C13), e2e `tests/e2e/campaign3-*.test.js` (`ND_E2E_PORT=<порт> npx playwright test tests/e2e/campaign3-<файл>`).
- Не трогать без решения владельца: условие победы (`lairsLeft`/`allLairsFallen`), объявленный отдых (`declareRest`/`cancelRest`/`isRestDay`), буфер `window.__ndC3Early`/`ND_SPHERE_OF_STAT` в app.js.
