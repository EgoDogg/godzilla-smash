# Godzilla Smash — Next-Session Handoff (as of 2026-06-09, gz-v13 + audit complete)

Paste the **Continuation Prompt** at the bottom into a fresh session to resume.

## Current state
- Live PWA: https://egodogg.github.io/godzilla-smash/ · repo `EgoDogg/godzilla-smash` (push to `main`, Pages rebuilds in ~1 min). Played on an **M1 iPad** (Add to Home Screen).
- Vanilla JS, **no build step**, `window.GAME`, 15 modules in `js/`. Save key `godzilla-save-v3`. **Cache version: `gz-v13`** (sync `sw.js CACHE` + `js/config.js CACHE_VERSION`; bump both to ship).
- gz-v13 signed off on iPad. **No game code has changed since gz-v13** — this session was audit + planning only.

## What happened this session (2026-06-09, audit session)
A 10-agent verified audit swarm (5 code finders + 2 web researchers → 2 adversarial verifiers → synthesis) ran over the whole game: 50 raw findings → **42 confirmed/revised, 8 refuted with proof, 18 research deltas**. Headlines: stuck-Space autofire P0; tap-to-target dead on the left 55% of the touch screen; airborne targeting broken twice; all 6 special sprites drawn with wrong iso geometry (HW 32/16 vs real 28/14); skyline blurry at dpr 2; PWA hygiene trio (SW serves HTML for failed JS, cache-version dead link, silent save failures).

**Everything is planned and batched for an autonomous implementation run:**
- `docs/next-run-execution-plan.md` — THE plan. Batch 1 (gz-v14): Attack-Speed + Move-Speed tracks + Nova Slam finisher + research-tuned balance riders. Batch 2 (gz-v15): P0 + PWA hardening + behavior-identical consolidations + save-system work. Batch 3 (gz-v16): sprite/dpr/facing visual fixes + touch-feel retune + airborne targeting. Batch 4 (no bump): KMP Kotlin scaffold in `kmp/`.
- `docs/audit-2026-06.md` — verified findings, research deltas, refuted-findings appendix (do not re-find these).
- `docs/kmp-architecture-roadmap.md` — portable-core architecture, seam contract, M0-M5 migration to Kotlin Multiplatform.

## Working conventions (unchanged, important)
- **Preview verification gotcha (READ memory `godzilla-preview-verification-gotcha`):** clear localStorage + unregister SW + delete caches, refetch with `cache:'reload'`, navigate with `location.href='./?fresh='+Date.now()` — **NOT `location.reload()`**. Verify LIVE objects. The preview tab is `document.hidden` → drive frames manually. `iso.js` is chronically stale — re-run its IIFE in-page if needed.
- **Deploy:** bump `sw.js CACHE` + `config.CACHE_VERSION` together, `node --check` every edited file, Conventional Commits + `Co-Authored-By: Claude <noreply@anthropic.com>`, push, poll live `sw.js`.
- Memory: `godzilla-game-concept` (full history) + `godzilla-preview-verification-gotcha`.

---

## ▶ CONTINUATION PROMPT (paste into a fresh session)
> Continue work on **Godzilla Smash** — 2.5D isometric Canvas2D incremental PWA at `/Users/MGitk/Projects/godzilla-smash/` (vanilla JS, no build, `window.GAME`, 15 modules in `js/`; live at https://egodogg.github.io/godzilla-smash/ · repo `EgoDogg/godzilla-smash` via `gh`; played on an M1 iPad). Currently **gz-v13**.
>
> A verified 10-agent audit + full implementation plan already exist. **Read in order:** `docs/next-run-execution-plan.md` (THE plan — every change has file:line anchors verified at gz-v13), `docs/audit-2026-06.md` (findings + refuted appendix), `docs/next-session-handoff.md` (conventions), and memories `godzilla-game-concept` + `godzilla-preview-verification-gotcha` (preview cache traps — follow exactly).
>
> **Execute the plan autonomously, batch by batch, to ≥90% confidence per area:** Batch 1 → deploy **gz-v14** (Attack-Speed "Rapid Fire Breath", Move-Speed "Titan Stride", "Nova Slam" charged finisher disc + the research-tuned balance riders — flag every tuning change in the ship notes for my iPad playtest). Batch 2 → deploy **gz-v15** (P0 spaceHeld fix, PWA hardening trio, pointer-cancel leak, save-system work incl. version+lastSeen fields, consolidations C1/C2/C3/C6 + small guards). Batch 3 → deploy **gz-v16** (sprite-geometry + dpr-sky + facing-unify visual fixes, touch-feel retune, airborne-targeting fixes). Batch 4 → KMP scaffold in `kmp/` (no cache bump; check `java -version` first, skip with a note if no JDK).
>
> Per batch: `node --check` everything, verify in the preview against LIVE objects per the gotcha memory, deploy (bump both cache versions, commit, push, poll live sw.js), then move on. Don't re-litigate decisions already settled in the plan; don't re-find anything in the refuted appendix. The one open design call (`world-thin-tier-rows`) is deferred — present options at the end, don't implement. Finish by updating `docs/next-session-handoff.md` + memory with what shipped.
