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
- 2026-06-13 · U3 nova-slam-finisher · tag `gz-u03-novaslam` — Nova Slam across 6 files (config/economy/entities/input/render/audio): charged AoE disc, `fireFinisher` parallel to startAttack (autofire untouched), NOVA disc L-shape left of SMASH + F-key, charge/cooldown ring. Preview-verified: charge→release fires (cd=8, AoE hit 4 buildings), atkCooldown independent, move-slow ×0.5, silent-cancel, geometry both orientations, screenshot confirms 3 discs, shop row. Cache still gz-v13.
- 2026-06-13 · U2 move-speed-track · tag `gz-u02-movespeed` — `Config.MOVESPD` + cached `moveSpeedMult()` in economy + entities scales accel/maxSp/walkPhase. Preview empirical drive: terminal-speed ratio L0→max = 1.587 (=cap); costs 40/96/230/553/1327/3185; shop 'Titan Stride' row. Cache still gz-v13. (Gate caught a missing Config.MOVESPD def — fixed pre-ship.)
- 2026-06-13 · U1 atk-speed-track · tag `gz-u01-atkspeed` — `Config.ATKSPD` + asymptotic `attackGateFor` reduction + `buyAtkSpeed`/cost/shop-row/save in economy.js. Preview-verified: gz2014 gate 0.126→0.081s (×1.56) at L6, costs 10/32/102/328/1049/3355, cap enforced, L0 unchanged. Cache still gz-v13.
- 2026-06-13 · UR research-lock · tag `gz-ur-research-lock` — `docs/research-2026-06.md`; 23 params (17 locked≥.97 + 6 fallbacks); apply-spec drives U1-U5. Refinements: RUBBLE_PER_TIER 450→150, hit-stop cap 95, combo window 3250, + safe-area insets.
- 2026-06-13 · campaign bootstrap · anchor `3a81b40` — durable state scaffolded.

## RESUME ANCHOR (next concrete action)
**Resume point = U4 (touch-geometry).** U1+U2+U3 shipped (both speed tracks + Nova Slam). Run the per-unit loop on U4: re-ground vs HEAD → implement the research-locked touch geometry in input.js (tunables ~:46-53 + layoutSmash): `JOY_DEADZONE 0.18→0.12`, `LEFT_ZONE 0.55→0.42` + delete dead `RIGHT_ZONE`, `SMASH_MIN 64→96`, `JUMP_MIN 56→76`, `FINISHER_MIN` already 76 (keep); keep `JOY_RADIUS 70`. **NEW safe-area insets:** in `layoutSmash` (~:151-152) the inset is flat `r+26` with NO `env(safe-area-inset)` — add `env(safe-area-inset-right)` to insetX and `env(safe-area-inset-bottom)` to insetY (hidden probe div + getComputedStyle; Canvas2D layout). Re-verify 3-disc clearance at the new sizes + 0.42 zone, both orientations. Tap-to-target now works center-screen (LEFT_ZONE 0.42). Apply-spec: docs/research-2026-06.md U4. → 5-gate → tag `gz-u04-touch` → flip JSON → push. Cache still gz-v13 (U5 = the gz-v14 deploy). Local preview save cleared at U3 close.

**THE POST-CLEAR / CRASH-RECOVERY PROMPT (paste verbatim):**
*Resume the Godzilla Smash autonomous campaign. Read in order: (1) docs/campaign/CAMPAIGN-BOOT.md (ritual + changelog top = live anchor); (2) docs/next-run-execution-plan.md (build source) + docs/research-2026-06.md (locked numbers, if it exists); (3) docs/campaign/campaign-progress.json (default-FAIL); (4) docs/campaign/STEER.md + BLOCKERS.md. Model = `claude-opus-4-8[1m]` EXCLUSIVELY · every agent inherits · NO downgrade · FM-1 = same-model backoff → abort+restart · effort = Ultracode session dial. Every non-trivial unit runs FULL ULTRACODE POOLS: re-ground → design → 3-lens adversarial verify ALWAYS → 3-vote → implement → 5-gate + tag + flip JSON + push; capstone loops til 2 dry. Resume point = the first passes:false unit in _run_policy.sequence. Continuous + async feel-queue; G1 feel verdicts never block; deploys bump sw.js CACHE + config.CACHE_VERSION together at v14/v15/v16 boundaries; D1 is Mike-gated (present, don't implement). If interrupted, resume at the first passes:false unit.*
