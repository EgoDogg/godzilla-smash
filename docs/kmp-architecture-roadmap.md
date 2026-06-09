# Godzilla Smash — KMP Architecture Roadmap (written 2026-06-09, state gz-v13)

Goal: make the JS codebase **port-shaped**, then grow a Kotlin Multiplatform core beside it — NOT rewrite the game. The vanilla-JS PWA remains the shipping web target indefinitely. KMP is how the same game eventually runs native on iPad/iPhone/Android/desktop.

## 1. Goals & non-goals

**Goals**
- A portable core (sim + economy + world + balance data) with zero DOM/Canvas/WebAudio/localStorage references, consumable from Kotlin `commonMain`.
- Platform adapters with a thin, explicit seam: render, audio, input, persistence, frame loop.
- A golden-master harness so ported logic can be proven equivalent, not eyeballed.

**Non-goals — explicitly NOT now (the no-build constraint is load-bearing)**
- No ES modules / import maps — breaks classic-script load order, sw.js plain-file caching, and the eval-reload debugging workflow.
- No TypeScript, no bundler, no minifier — no build step, period.
- No splitting entities.js into separate sim/render FILES yet (load-order churn + cache invalidation risk). Instead: `/* ==== PORTABLE SIM ==== */` vs `/* ==== FX/RENDER (adapter) ==== */` banner sections to make the seam visible.
- No sw.js↔config.js cache-version single-sourcing via importScripts — config.js writes to `window`, which doesn't exist in a SW. Keep the documented bump-both convention.
- No save-migration framework — the `version` field (consolidation C6) is the entire investment.

## 2. Target architecture: portable core vs platform adapters

Current classification (from the 2026-06-09 architecture audit, 8,684 lines / 15 modules):

**PORTABLE CORE (~60% of logic today)**
| Piece | Today | Purity status |
|---|---|---|
| Balance data | config.js (246) | Pure data already — the keystone. Translates mechanically to Kotlin data classes once C1 lands. |
| Math/helpers | utils.js (73) | Pure except localStorage wrappers + matchMedia (adapter calls). |
| Iso projection | iso.js worldToScreen/pick/depth-sort | Pure functions of `Config.GRID`. Camera trauma model is pure state math. |
| Kaiju sim | entities.js locomotion/FSM/attack gating/jump kinematics | Pure, but FILE mixes in FX pool + sprite baking (seam violation #1). |
| World lifecycle | world.js building state machine, spawn tables, rare rolls | Pure except FX/Audio/Env.announce calls (event emissions). |
| Economy | economy.js money/combo/claws/forms | Pure except shop DOM building (seam violation #2 — DOM in economy.js, not ui.js). |
| Env clock | world_events.js phase math | Pure except #toast DOM. |

**PLATFORM ADAPTERS**
| Adapter | Today (web) | KMP later |
|---|---|---|
| Render | render.js + assets.js + archetypes.js + sprites_special.js (Canvas2D) | Compose Multiplatform Canvas / Skia, replaying the same painter algorithm |
| Audio | audio.js (WebAudio synth + iOS keepalive) | platform synth behind an `AudioEvent` enum (smash/crumble/evolve/recruit/buy/deny/finisher) |
| Input | input.js pointer/keyboard handlers | native touch/gesture → the same `Intent` struct |
| Persistence | localStorage via Utils.safeSave/safeLoad | expect/actual KV store (DataStore / UserDefaults) |
| Frame loop | rAF in game.js | Choreographer / CADisplayLink |

**THE SEAM CONTRACT** (this is the architecture in one sentence):
> Core consumes `{Intent, dt}`; emits `{sim state, AudioEvent[], announcements}`. The renderer reads sim state and never mutates it. Adapters never compute gameplay.

Today's two named seam violations to keep visible (banner-comment now, file-split only at port time):
1. **entities.js (1,574 lines)** mixes kaiju sim + FX particle pool + sprite-bake calls.
2. **input.js (632 lines)** mixes intent math (portable: screenDirToWorld, facing index) + pointer plumbing. economy.js's shop-DOM building is the third, smaller one.

## 3. How KMP consumes it

- **`commonMain`**: Config as Kotlin data classes (mechanical translation once tunables are consolidated), Utils (clamp/lerp/fmt/hash/rng), iso math as pure functions, then sim/economy/world ported function-for-function.
- **`expect/actual`**: persistence (KV store), time source, RNG, audio sink.
- **UI**: Compose Multiplatform canvas (Android/iOS/desktop) replaying the painter algorithm. The web PWA stays vanilla JS; Kotlin/JS is an option later, not a plan.
- **Art decision point (defer until M4)**: port the procedural archetype drawing (archetypes.js is 1,110 lines of canvas calls — biggest port-cost unknown) **vs** pre-bake sprite atlases from the JS game via a one-off capture page. The atlas fallback caps the cost.

## 4. Migration sequence

- **M0 — NOW (next-run consolidations, see docs/next-run-execution-plan.md):** scattered tunables → Config sub-objects; single-source iso constants; stale-comment sweep (comments are the spec a porter reads); save `version` field; sprites_special HW/HH fix; facing-table unification.
- **M1 — Golden-master harness:** seedable RNG seam (`U.rng` mulberry32 already exists; route the ~9 unseeded `Math.random` SIM call sites in entities/world through an injectable source — audio/visual jitter may stay unseeded). Then a dev-only console snippet: run N scripted-intent sim steps, hash `{money, building states, kaiju pos}` → JSON fixtures committed to `kmp/fixtures/`.
- **M2 — First Kotlin (the scaffold, next run):** Gradle KMP project in `kmp/`; `commonMain` with Config data classes + Utils + iso math; unit tests asserting parity against fixtures exported from the JS game. No platform UI.
- **M3 — Port sim:** economy → world → kaiju sim, each gated on golden traces.
- **M4 — First adapter set:** likely Android (Compose canvas + DataStore); art decision point resolves here.
- **M5 — Save interop:** the versioned save blob lets a KMP build import a web save.

## 5. Risks & mitigations

- **Float determinism** (Math.hypot/pow across JS/JVM/Native): golden masters compare with epsilon, never equality; keep sim math to `+−×÷` where possible.
- **Canvas2D-specific semantics** (gradients, shadowBlur, composite ops): confined to adapters; the core never references them.
- **The 20-form procedural art** is the biggest port-cost unknown → atlas fallback (§3) bounds it.
- **Divergence while both codebases live:** balance changes go in Config ONLY; the Kotlin Config is generated/translated from it, never edited independently.
