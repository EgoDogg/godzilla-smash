# Godzilla Smash — Next-Session Handoff (as of 2026-06-09, gz-v13)

Paste the **Continuation Prompt** at the bottom into a fresh session to resume.

## Current state
- Live PWA: https://egodogg.github.io/godzilla-smash/ · repo `EgoDogg/godzilla-smash` (push to `main`, Pages rebuilds in ~1 min). Played on an **M1 iPad** (Add to Home Screen).
- Vanilla JS, **no build step**, `window.GAME` namespace, 15 modules in `js/`, instant-load. Data-driven: `Config.FORMS` (20 forms / 4 archetypes), `Config.SPECIALS`/`RARE_SPAWNS`/`ENV`/`JUMP`. Architecture: `docs/v3-build-contract.md`. Save key `godzilla-save-v3` (money/forms/frontier).
- **Cache version: `gz-v13`** (in `sw.js` `CACHE` + `js/config.js CACHE_VERSION` — keep them in sync; bump both to ship).

### Shipped this session (gz-v3 → gz-v13)
Wider→denser asymmetric-street city · smash juice (debris, hit-stop, screen-flash, gold aim ring) · iOS audio fix (per-hit `smash()` wired + keepalive) · **trauma-based screen shake** (GvK toned down — gentle) · rapid **hold-to-autofire** on touch disc + Space + **trackpad** (with cursor-aim) · top-center **target HP bar** (tracks the building actually being attacked) · "Stronger Claws" → **"Stronger Atomic Breath"** · atomic-breath anchored to the **mouth** · **screen-space facing** (faces the way he attacks) · **sprite-hitbox tap-targeting** (tap any part of a building) · **ground-zappable planes** (worth 500) · **visible rare houses** (golden/rainbow/diamond on respawn; 3/5/10× HP).

## Backlog for next time (suggested priority)
1. **iPad feel sign-off (reactive — do first, based on Mike's play of gz-v13):**
   - GvK+ **camera shake** is deliberately gentle (~1.7px sustained). One-number bump if wanted: `js/iso.js SHAKE_TRAUMA_K` (currently `1/85`; larger = stronger).
   - Confirm: touch tap-to-zap distant buildings/planes; trackpad/touch hold-aim follows the pointer; character faces the attack direction.
2. **Rare-house locator** — the golden/rainbow/diamond toast has **no location**; the house spawns wherever a destroyed building respawns. Add an on-screen arrow/edge-marker (or minimap ping) pointing to a freshly-spawned rare house. (`world.js rollRareSpawn` knows the cell; render a HUD marker in `render.js`/`ui.js`.)
3. **Upgrade tracks (money sinks):**
   - **Attack Speed** — purchasable track lowering the re-fire gate toward the ~75ms floor over exponential-cost tiers (`Config.COOLDOWN_*` / `entities.js attackGateFor`). Mike floated this; research said add it but keep a generous base.
   - **Move Speed** — companion track (`entities.js ACCEL/MAX_SPEED`).
4. **Charged "finisher" (optional)** — a SEPARATE charged-AoE disc, leaving the core autofire loop untouched (research's recommended way to add charge without starving the combo).
5. **Shake intensity slider** (accessibility) — 0–100% multiplier on the trauma offset, in addition to the reduced-motion zero.
6. **Tier coverage gap** — with the wide-street spacing, a few HP tiers (≈4, 9, 14) have no buildings (row spacing > tier-band depth). Decouple if smoother progression matters (re-tune `LAYOUT.tierRows` vs row period).

## Working conventions (important)
- **Always research → verify in preview → deploy.** Use dynamic agents (Sonnet/Haiku) for research/audit; verify in the preview before committing.
- **Preview verification gotcha (READ memory `godzilla-preview-verification-gotcha`):** to pick up edits, clear localStorage + unregister SW + clear caches, refetch with `cache:'reload'`, and **navigate with `location.href = './?fresh='+Date.now()` — NOT `location.reload()`** (reload-from-eval doesn't re-navigate). `iso.js` is chronically stale-cached; to test its new code, re-run its IIFE in-page: `(0,eval)(await (await fetch('./js/iso.js?v='+Date.now(),{cache:'reload'})).text())`. Verify against **live objects**, not fetched text. The preview tab is `document.hidden` (loop paused) — drive a frame manually (`camera.follow` + `Render.frame`) for screenshots.
- **Deploy:** bump `sw.js CACHE` + `config.CACHE_VERSION` (gz-vN → gz-v(N+1)), `git add -A && commit && push origin main`, poll the live `sw.js` until the new cache appears, then relaunch the iPad PWA.
- `node --check` every edited file. Commit style: Conventional Commits + `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Memory: project facts in `godzilla-game-concept` (full v3→v13 history) + the preview gotcha note — auto-loads next session.

---

## ▶ CONTINUATION PROMPT (paste into a fresh session)
> Continue work on **Godzilla Smash** — a 2.5D isometric Canvas2D incremental "smash the city" PWA at `/Users/MGitk/Projects/Godzilla Game/` (vanilla JS, no build, `window.GAME`, 15 modules in `js/`; live at https://egodogg.github.io/godzilla-smash/ · repo `EgoDogg/godzilla-smash` via `gh`; played on an M1 iPad). Currently **gz-v13**. **First read `docs/next-session-handoff.md`** (state + backlog + conventions) and `docs/v3-build-contract.md` (architecture), and check memory `godzilla-game-concept` + `godzilla-preview-verification-gotcha`.
>
> I've now played gz-v13 on the iPad. Here's my feedback: **[describe what feels good / off — e.g. shake intensity, facing, tap-targeting, anything new you want]**.
>
> Work the way we have been: research with dynamic agents + 2026 best practices, **verify in the preview** (clear SW+caches, navigate via `location.href=./?fresh=`, console clean, screenshot/eval-drive), then **deploy** (bump `sw.js`+`config` cache gz-v13→gz-v14, commit + push, poll live). The open backlog (pick per my feedback): rare-house on-screen locator; Attack-Speed + Move-Speed upgrade tracks; optional charged "finisher" disc; shake-intensity slider; tier-coverage gap. Plan first if it's non-trivial, then implement to >95% confidence.
