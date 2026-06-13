# CAMPAIGN-BOOT · Godzilla Smash gz-v14→v15→v16

**The "where am I?" doc. Read first on every session boot.** ≤130 lines.
Plan: `docs/next-run-execution-plan.md` · Branch: `main` · Anchor: `3a81b40` (pre-campaign tip).
Repo: `/Users/MGitk/Projects/Godzilla Game/` · Live: https://egodogg.github.io/godzilla-smash/ · `EgoDogg/godzilla-smash`.

## SESSION-START RITUAL (in order)
1. **HALT-check** `docs/campaign/campaign-progress.json._halt`. If non-null → read the matching `docs/campaign/BLOCKERS.md` envelope before anything.
2. `git -C "/Users/MGitk/Projects/Godzilla Game" log --oneline -8 && git status --short && git tag --list 'gz-*'`
3. Read `docs/campaign/STEER.md` (human override: PAUSE/SKIP/PIVOT/DEFER/NOTE + queued feel feedback). Honor unprocessed directives first.
4. Read `docs/campaign/BLOCKERS.md` — pick up any block whose `### Resolution` is populated.
5. Read `docs/campaign/campaign-progress.json` → first unit in `_run_policy.sequence` with `passes:false` = resume point.
6. **Re-ground gate (MANDATORY):** before executing the resumed unit, run an inherit-session-model re-ground workflow that refutes the unit's plan scope vs current HEAD (anchors were checked at gz-v13; they drift as units land). If scope changed, re-find before fixing.
7. **Verify-green baseline:** `node --check js/*.js` clean; load the preview clean (cache-bust per the gotcha memory) before applying new edits.
8. Echo a 3-line summary: phase/unit · last tag · next action.

## MIKE GATE QUEUE (async · the run NEVER idles on a gate while un-gated work exists)

| # | Gate | Human does | Unblocks | Run does meanwhile | Status |
|---|------|------------|----------|--------------------|--------|
| G1 | Feel verdict per live deploy (gz-v14/v15/v16) | Play on iPad, reply with feel notes | A tuning pass at the next version boundary | Keeps driving the next units; feedback queues in STEER.md | ⏳ |
| G2 | D1 tier-rows design pick | Choose `street:1` vs `tier=floor(row/prow)` | The deferred density fix (own future run) | Everything else — D1 is the only gated unit | ⏳ |

G1 is **non-blocking** (continuous mode). No other gates.

## OPERATING MODE
- **Session policy · CONTINUOUS.** Durable state (JSON + this doc + tag) lands at EVERY unit; harness summarization carries context; the post-clear prompt is crash-recovery ONLY. Context heaviness is never itself a reason to stop.
- **Model · ONE exclusively** (`claude-opus-4-8[1m]`). Every `agent()` inherits it — omit `model`, no pins, no downgrade. FM-1 = inherit → (tighten schema · reduce width · backoff-retry) same model → abort+restart. Effort = the session-global Ultracode dial.
- **FULL ULTRACODE POOLS.** Every non-trivial unit = re-ground → design → 3-lens adversarial verify (ALWAYS) → 3-vote → implement → 5-gate; capstone loops til 2 dry (cap 4). Solo only for trivial mechanical edits. High-stakes units: U3 nova-slam, U9 consolidations, U12 facing-unify.
- **Cleanup authorized** — deletion/consolidation of dead+duplicated code is requested work (C1-C3, dead keyJump, etc.).
- **Budget governor.** Ultracode on (cost not a constraint). Park at a clean tag boundary on quota near-exhaustion; never START a unit that can't finish before the wall.
- **Self-wake parking.** When un-gated work is exhausted, ScheduleWakeup long-fallback (~1800-3600s) carrying the resume prompt; each wake probes gates + re-reads STEER/BLOCKERS. SUSPEND while quota near-exhausted.
- **Dispatch notifications.** One consolidated PushNotification per stopping point (deploy live · park · HIGH blocker).
- **Model-behavioral tuning:** report findings with confidence+severity · explicitly trigger subagents/cleanup/memory · pick-and-note on minor choices · silence-default narration · authorize cleanup explicitly.
- **TRUE STOP CONDITIONS (exhaustive):** ① U1..U13 shipped + self-wake pending (park) · ② HIGH security finding · ③ a human-locked pick that looks wrong (BLOCKERS HIGH + pivot) · ④ quota near-exhausted → park + resume on refresh · ⑤ final pre-ship review after gz-v16. **Nothing else stops the run.** Each session summary carries a one-line stoppage audit.

## PER-COMMIT GATE (all green; one finding/tight-cluster per commit)
1. `node --check` every edited `js/*.js` · 2. preview cache-bust + console clean · 3. behavior eval-drive vs LIVE objects (or screenshot for visual units) · 4. named regression checks · 5. (deploy units) `sw.js CACHE`===`config.CACHE_VERSION` + JSON/boot updated in the ship commit. Commit cites finding-id/unit + canon + best-practice; ends with `Co-Authored-By: Claude <noreply@anthropic.com>`. Never `--force`/`--amend`/`--no-verify`. Rollback = `git reset --hard <prev-tag>` (FM-2), never fix-forward. Flip `campaign-progress.json` (passes:true + evidence+tag+SHA) in the commit AFTER the fix.

## CHANGELOG (newest first · the top entries are the LIVE anchor)
- 2026-06-13 · UR research-lock · tag `gz-ur-research-lock` — `docs/research-2026-06.md` written; 23 params (17 locked≥.97 + 6 fallbacks); apply-spec drives U1-U5. Drafted numbers confirmed; refinements: RUBBLE_PER_TIER 450→150, hit-stop cap 95, combo window 3250, + safe-area insets.
- 2026-06-13 · campaign bootstrap · anchor `3a81b40` — durable state scaffolded.

## RESUME ANCHOR (next concrete action)
**Resume point = U1 (atk-speed-track).** UR done — numbers locked in `docs/research-2026-06.md` (read its APPLY-THESE spec). Run the per-unit loop on U1: re-ground vs HEAD → design → adversarial verify → implement `Config.ATKSPD {FLOOR .075, DECAY .70, LEVELS 6, BASE 10, GROWTH 3.2}` + `attackGateFor` asymptote + economy `buyAtkSpeed`/cost/shop-row/save-field → 5-gate → tag `gz-u01-atkspeed` → flip JSON → push. Cache still at gz-v13 (no bump until U5 deploy).

**THE POST-CLEAR / CRASH-RECOVERY PROMPT (paste verbatim):**
*Resume the Godzilla Smash autonomous campaign. Read in order: (1) docs/campaign/CAMPAIGN-BOOT.md (ritual + changelog top = live anchor); (2) docs/next-run-execution-plan.md (build source) + docs/research-2026-06.md (locked numbers, if it exists); (3) docs/campaign/campaign-progress.json (default-FAIL); (4) docs/campaign/STEER.md + BLOCKERS.md. Model = `claude-opus-4-8[1m]` EXCLUSIVELY · every agent inherits · NO downgrade · FM-1 = same-model backoff → abort+restart · effort = Ultracode session dial. Every non-trivial unit runs FULL ULTRACODE POOLS: re-ground → design → 3-lens adversarial verify ALWAYS → 3-vote → implement → 5-gate + tag + flip JSON + push; capstone loops til 2 dry. Resume point = the first passes:false unit in _run_policy.sequence. Continuous + async feel-queue; G1 feel verdicts never block; deploys bump sw.js CACHE + config.CACHE_VERSION together at v14/v15/v16 boundaries; D1 is Mike-gated (present, don't implement). If interrupted, resume at the first passes:false unit.*
