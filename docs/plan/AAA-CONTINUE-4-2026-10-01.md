# Очередь №4 — release trust + maximum visual pass (01.10.2026)

> Канонический VPS `/root/neurodeck`, старт HEAD b59ac16. Всё по порядку, каждый пакет: implementation + tests + full CI + commit + push.
> Правила: не трогать прод-бот; новые state fields только migration; no new npm deps; reduced-motion/eco; visual changes require intentional baselines; physical device facts never invented.

## Release Trust

### R1 — Remote-config browser fix
Исправить global fetch lookup без injected fetch; браузерный e2e с реальным request/application, timeout/size/expiry/reset/cache policy; tests for fallback/tamper/expired. Commit.

### R2 — Generation-atomic Cloud Save
Поколенческие chunk keys, commit pointer, previous generation rollback, writer conflict handling; сохранять nd_0 legacy read compatibility; fault injection per chunk/meta/concurrent writer; update docs and recovery. Commit.

### R3 — Blocking release gates
Вынести release verify: visual blocking, economy sim included, explicit retries/flakes, complete artifact with SHA/env/commands/exit; GitHub workflow deploy only after release gate. Commit.

### R4 — Config service upgrade/rollback + privacy gates
Atomic staging/symlink upgrade and rollback, owner/port health checks; server event allowlist, redaction, retention/delete contract, telemetry default off. Never restart bot. Commit.

### R5 — Fresh evidence + release audit
Fresh full CI, exact evidence artifact; correct pin/haptic counts and stale docs; independent static audit notes. Commit.

## Maximum visual pass

### V1 — Art direction system
Document and enforce visual tokens: palette, materials, light, depth, typography, states, icon roles; CSS tokens and visual test helpers. No gameplay changes.

### V2 — Kingdom map 2.0
Layered parallax, province atmosphere, branch edges, route glow, weather/night/season, hover/focus/selected/frontier states, readable labels, reduced-motion/eco equivalent, performance budget.

### V3 — Card/deck art pass
Authored frames by rank, stat color/material language, card hierarchy, oath/day/mastery states, reward-ready state, hover/pressed/focus, responsive composition, stronger typography and whitespace.

### V4 — Stronghold/army/siege art pass
Province identity, building state illustrations, garrison silhouettes/icons, siege preparation staging, forecast visualization, damage/repair states, readable breakdowns.

### V5 — Boss/reward presentation
Boss icon treatment, intro/reveal, phase transitions, reward-choice presentation, relic reveal, crown/ruin options, motion-gated effects.

### V6 — HUD/IA visual hierarchy
Today/Kingdom/Arsenal/Progress visual system, priority action, command hierarchy, compact mobile layout, safe area, 200% text, keyboard focus, no overflow.

### V7 — Audio/feel visual integration
Map/card/siege/reward feedback choreography, haptics mapping, audio category affordances, no autoplay, reduced-motion equivalence, perf budgets.

### V8 — Visual QA and polish
Expanded visual matrix: mobile/tablet/desktop, short viewport, 200% font, reduced-motion, dark Telegram WebView; intentional snapshots; visual diff review; final independent audit.

## Final
Write docs/session-handoff/SESSION-VPS-AUTO-2026-10-01-RELEASE-VISUAL.md with commits, CI evidence, known owner device checks, visual debt, rollback notes. Do not claim physical certification.
