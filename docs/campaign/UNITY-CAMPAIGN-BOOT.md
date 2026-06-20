# UNITY-CAMPAIGN-BOOT · Godzilla Smash → Unity (S3 Hybrid) — NOT STARTED (ledger ready to launch)

**The "where am I?" doc. Read first on every session boot.** ≤130 lines.
Build source (LOCKED plan): `docs/campaign/unity-migration-plan.md` (§0/§3/§4/§5/§8/§9 + Appendix A = authoritative S3; §1/§7 atlas-bake is **superseded first-fleet residue**).
Branch: `unity-port` (NEW, off `main`) · Pre-campaign anchor: `gz-v32` (`729d36d`).
Repo: `/Users/MGitk/Projects/Godzilla Game/` · Web PWA stays LIVE on `main`: https://egodogg.github.io/godzilla-smash/
Ledger: `docs/campaign/unity-campaign-progress.json` (42 units · all default-FAIL).
**The web save-system campaign (`campaign-progress.json` + `CAMPAIGN-BOOT.md`) is SUSPENDED — do not touch it.**

## SESSION-START RITUAL (in order)
1. **HALT-check** `unity-campaign-progress.json._halt`. If non-null → read the matching `BLOCKERS.md` envelope first.
2. `git -C "/Users/MGitk/Projects/Godzilla Game" log --oneline -8 && git status --short && git branch --show-current`
3. Read `STEER.md` (human override: PAUSE/SKIP/PIVOT/DEFER/NOTE + queued feel/fidelity feedback). Honor unprocessed directives first. **Gate the Unity-vs-Spine call + every FX/feel verdict here.**
4. Read `BLOCKERS.md` — pick up any block whose `### Resolution` is populated.
5. Read `unity-campaign-progress.json` → first unit in `_run_policy.sequence` with `passes:false` = resume point. If it's `human_gate:true`, check its gate in the table below; if still open, drive the next un-gated unit instead.
6. **Re-ground gate (MANDATORY):** before executing the resumed unit, refute its plan scope vs current Unity HEAD (anchors drift as units land). The web `js/*.js` + `config.js` are the IMMUTABLE reference spec — re-read the relevant module before porting.
7. **Verify-green baseline:** Core asmdef compiles with NO `UnityEngine` ref; EditMode tests green; MCP bridge live (L1/L2/L3 loop) before applying new edits.
8. Echo a 3-line summary: phase/unit · last tag · next action.

## MIKE GATE QUEUE (async · the run NEVER idles on a gate while un-gated work exists)
| # | Gate | Human does | Unblocks | Run does meanwhile | Status |
|---|------|-----------|----------|--------------------|--------|
| G0 | Unity Hub/GUI install + Personal license + MCP click-through + Mac runner reg | Install + activate + connect | The whole loop (P0-MCP-CI) | Claude stages asmdef skeleton, CLAUDE.md, BuildScript, GameCI YAML to apply instantly | ⏳ open (Mike logged in, ready) |
| G1 | Headless license activation w/ a REAL token, by hand, ONCE | Activate on the Mac runner | CI-green (the #1 silent CI failure) | Claude writes all CI glue; verify after | ⏳ open |
| G2 | Subjective FX-glow / feel / fidelity VERDICTS (the eye call) | Eyeball side-by-side, reply via STEER | P0-FXGATE, P1-GATE, per-form sign-off, P5 feel | Claude stages the exact side-by-side + the SSIM≥0.85 floor | ⏳ recurring |
| G3 | On-device perf/overdraw on a real low-end ~2020 Android | Supply phone, run the profile | Gate 3 (P1-PERF-DEVICE, P2, P5 multi-thumb) | Claude ports particle caps + stages the checklist | ⏳ open |
| G4 | The hand-rig ART CRAFT — trace + bone-skin + weight-paint 4 rigs | The ~15 irreducible human days | P1-WYRM-RIG, P2-RIGS-3X | Claude writes the ref-baker + skin SOs + FormAssetRebuilder + ALL plumbing | ⏳ open (serial bottleneck) |
| G5 | Unity-2D-vs-Spine decision on rig #1 + hydra-3-neck escalation | Eyeball whether bone-only sells | P1-WYRM-RIG, P2-RIGS-3X (hydra) | Default = Unity 2D Animation; Spine only on a failure | ⏳ pre-registered |
| G6 | Camera-angle/zoom + shop-layout taste | Quick judgment | P1-ISO-DEPTHKEY, P4-SHOP-UI, P5-HUD | Claude builds against the web look | ⏳ async |
| G7 | Apple/Play accounts + provisioning/keystore + questionnaires + submit | The store bureaucracy | P6 | Claude owns BuildScript/Fastfile/GH-Actions/metadata-drafts | ⏳ opens at P6 |

## OPERATING MODE
- **Session policy · CONTINUOUS.** Durable state (JSON + this doc + tag) lands at EVERY unit; harness summarization carries context; the post-clear prompt is crash-recovery ONLY.
- **Model · ONE exclusively** (`claude-opus-4-8[1m]`). Every `agent()` inherits — omit `model`, no pins, no downgrade. FM-1 = inherit → (tighten schema · reduce width · backoff-retry) same model → abort+restart. Effort = the session-global Ultracode dial.
- **FULL ULTRACODE POOLS.** Every non-trivial unit = re-ground → design → 3-lens adversarial verify (ALWAYS) → 3-vote → implement → per-commit gate; capstone loops til 2 dry (cap 4). Solo only for trivial mechanical edits. HIGH-stakes panel: P0-FXGATE, P1-GATE, P4-SAVE-CONTAINER (allowlist boundary), P4-GZS1-CODEC (attacker input), P6-PRESHIP-REVIEW.
- **Bit-exact ports round-trip a REAL live-PWA vector** (the live-spike-beats-mock lesson): P1-ISO-DEPTHKEY, P1-TRAUMA-FEEL, P3-CITYGEN-RNG, P4-SAVE-CONTAINER, P4-GZS1-CODEC. Float/byte parity is the test, not a vibe.
- **Port don't re-derive · rebuild the art.** Lift proven logic (economy/save/world-FSM/RNG/codec/trauma) to tested C# behind invariant-tests-written-first; re-author all art natively (4 rigs × 20 data-skins + URP soft-additive FX). DROP only the v3→v4 migration branch.
- **Cleanup authorized.** Deleting the iOS WebAudio keepalive + the hand-rolled accumulator/insertion-sort/camera is requested work.
- **Budget governor.** Park at a clean tag boundary on quota near-exhaustion; never START a unit that can't finish before the wall.
- **Self-wake parking.** When un-gated work is exhausted, ScheduleWakeup (~1800-3600s) carrying the resume prompt; each wake probes G0-G7 + re-reads STEER/BLOCKERS. SUSPEND while quota near-exhausted.
- **Dispatch notifications.** One consolidated PushNotification per stopping point (gate opens · park · HIGH blocker · GO/NO-GO decision staged).
- **TRUE STOP CONDITIONS (exhaustive):** ① all un-gated work done + blocked only on a Mike gate + self-wake pending (park) · ② HIGH security finding · ③ a human-locked pick that looks wrong (BLOCKERS HIGH + pivot) · ④ a P0/P1 GO/NO-GO genuinely fails after the corrected-spec re-check → stage the re-scope · ⑤ quota near-exhausted → park · ⑥ final pre-ship review before P6. **Nothing else stops the run.**

## PER-COMMIT GATE (all green; one finding/tight-cluster per commit)
1. compile clean (L1 console via MCP); **Core compiles with NO `UnityEngine` ref** · 2. EditMode NUnit green (bit-exact ports assert parity vs a real web vector) · 3. L2 Play-Mode no-exceptions + L3 screenshot to `shots/unity/` (visual/FX units) · 4. named cross-subsystem regression checks (the 10 invariants nothing may lose) · 5. (build units) gitignore/LFS/manifest hygiene + JSON+this-doc updated in the ship commit. Commit cites unit-id + plan-§ + best-practice; ends `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Never `--force`/`--amend`/`--no-verify`. Rollback = `git reset --hard <prev-unit-tag>` (FM-2), never fix-forward. Flip JSON (passes:true + evidence+tag+SHA) in the commit AFTER the work.

## CHANGELOG (newest first · top = LIVE anchor)
- 2026-06-20 · **LEDGER BUILT, campaign NOT started** — turned the LOCKED S3-Hybrid plan into this 42-unit default-FAIL ledger (`unity-campaign-progress.json`) + this boot doc. Verified to 100%: every invariant in the plan confirmed against repo source (depthKey iso.js:264 · trauma clamp+decay iso.js:36-37,138-140 · mulberry32/crc32/b64u utils.js · FORM_BONUS===63 game.js:62-63 · cancel-invariant economy.js:198-201 · GZS1 economy.js:774 · sanitizeGame allowlist economy.js:449). Launch verdict = **READY-WITH-NOTES**: residual is BUILD-EMPIRICAL (only the P0/P1 spike resolves FX-fidelity + sim/draw-cut + Unity↔Xcode-26 mapping); no further research helps. One Mike pre-launch micro-decision: confirm the **new `unity-port` branch** name + that the SSIM≥0.85 silhouette floor is the agreed P1-GATE sanity bar (plan open-Q #3).

## RESUME ANCHOR (next concrete action)
**Resume point = `P0-SKELETON`** (first `passes:false` in the sequence). Nothing built yet. The whole loop is gated on **G0** (Mike's Unity install + license + MCP click-through) — but Claude can/should immediately stage everything G0-independent: the 5-asmdef skeleton + `CLAUDE.md` + `.gitignore`/LFS + `BuildScript.cs` + GameCI YAML + the Puppeteer reference-baker (`tools/bake-refs`) + the first EditMode test, so the bridge going live unblocks an instant `P0-SKELETON`/`P0-MCP-CI`. Then **build the soft-additive screen-blend Shader Graph FIRST** (P0-FXSPIKE-BUILD, before any body) so the P0-FXGATE eye-call (G2) and the rig (P1-WYRM-RIG) are judged against a correct glow.

**THE POST-CLEAR / CRASH-RECOVERY PROMPT (paste verbatim):**
*Resume the Godzilla→Unity (S3 Hybrid) autonomous run. Read in order: (1) `docs/campaign/UNITY-CAMPAIGN-BOOT.md` (ritual + changelog top = live anchor + gate table); (2) `docs/campaign/unity-migration-plan.md` §0/§3/§4/§5/§8/§9 + Appendix A (the authoritative S3 build source — §1/§7 atlas-bake is SUPERSEDED residue); (3) `unity-campaign-progress.json` (default-FAIL, 42 units); (4) `STEER.md`/`BLOCKERS.md`. The web `js/*.js`+`config.js` is the IMMUTABLE reference spec; the web PWA (gz-v32) stays live on `main` and the web save-system campaign is SUSPENDED — do not touch either. Model = `claude-opus-4-8[1m]` EXCLUSIVELY · every agent inherits · NO downgrade · FM-1 = same-model backoff → abort+restart · effort = Ultracode session dial. Every non-trivial unit = re-ground → design → 3-lens adversarial verify ALWAYS → 3-vote → implement → per-commit gate + tag + flip JSON + push; capstone loops til 2 dry. Bit-exact ports round-trip a REAL live-PWA vector. human_gate units flip true ONLY on Mike's recorded artifact — drive un-gated work around the G0-G7 queue, never block. Resume point = the first `passes:false` unit. If interrupted: resume there.*
