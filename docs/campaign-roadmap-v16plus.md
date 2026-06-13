# Godzilla Smash — Campaign Roadmap gz-v16 → gz-v20 (strategic plan, conf 0.97, 2026-06-13)

Determined by the strategic-planning workflow (wf_e72f4a3c-ded, 7 agents, research-decided per Mike). Sequences all remaining work — the tester-QA-driven gameplay changes + the desktop-parity fix + KMP-prep consolidations + the full 20-character art redesign — into 5 versioned live deploys with every dependency knot resolved. Unit SPECS live in: docs/research-2026-06b.md (desktop parity), docs/research-2026-06c.md (bounded economy + finale), docs/visual-redesign-plan.md (art). This doc is the SEQUENCE + the form-economy decision.

## Sequenced deploys


### gz-v16
- **UE1+UE3 · Bounded economy + 1e9 win-finale (HEADLINE)**
  Ships FIRST in v16 as the player-facing headline — the only change that makes the game finishable, so it must not be buried behind the art tail. UE1: switch clawsCost from the explicit config CLAWS[] table (which stops at level 9 / cost 25103) to the formula clawsCost=round(form.base*2^(clawsLevel+1)); buyClaws denies once attackPower()>=Math.max.apply(null,Cfg.ROW_HP)=1e9. Verified back-compatible: gz2014 round(6*2^1)=12 == existing config L1=12. UE3: promote statue hp 5e8->1e9 (config.js:260); first attackPower>=1e9 + statue destroy -> climax beat (reuse evolve FX) + 'CITY LEVELLED 100%' win card + capstone (World 2 free-roam, WORLD2_COST=12e9 stays the sole post-finale gate). Touches ONLY config.js/economy.js/world.js/ui.js + render/audio FX — zero art-code overlap, so no later art deploy can invalidate it. Cap = Math.max(ROW_HP) (data-derived, survives ROW_HP retuning).
- **UE1-FORMS · Re-price all 20 forms below 1e9 (Option A)**
  config.js FORMS[].cost edits ONLY (no logic change; isFormUnlocked tier-chain at economy.js:201-210 already enforces rung order). Ship in the same v16 deploy as UE1/UE3 since pricing is meaningless without the bounded ladder. See form_economy field for the full 20-cost table.
- **U9 · Config consolidations (KMP-prep, behavior-identical)**
  Ships immediately after UE in v16. Scattered tunables -> Config sub-objects LOCO/CAMERA/INPUT_GEO/AUDIO/RENDER (today only Config.JUMP exists at config.js:285); single-source iso math; stale-comment sweep; small guards. KNOT (d) RESOLVED: U9 goes FIRST among structural units so the art rewrite (v17+) is authored against the FINAL Config shape and the comment-sweep cleans OLD code (KMP roadmap M0 mandates this NOW step; §balance-in-Config-only is the keystone for the Kotlin data-class translation). HIGH-stakes behavior-identical: full verify panel + capstone. Intra-v16 ordering: U9's RENDER sub-object MUST land before U11/UP (both touch render.js) to avoid a self-inflicted merge race.
- **U12 · Facing-table unify (dedup only)**
  KNOT (b) RESOLVED: ship the facing-DEDUP in v16 (ahead of art-phase-1 draw primitives), NOT folded whole into v17. Verified duplicate: facingGeom is byte-identical at archetypes.js:47 AND entities.js:498 (the latter commented 'Shared with archetypes.js — exported via _wyrmHelpers'; the export object at entities.js:1637 already plumbs it). Collapse to ONE table via the existing _wyrmHelpers hook. This IS art-phase-1's 'facing' shared helper, pulled forward, so art-phase-1 (v17) then adds ONLY the new DRAW primitives on a quiet, unified facing base — no 'did facing regress?' noise mixed into an art G1 verdict. HIGH-stakes (twice-bug-fixed): full panel + capstone.
- **U10 · Sprite-geometry fix**
  sprites_special HW/HH 32/16->28/14 + bakeSpecial footprint key. Small, isolated; after U9/U12 in v16.
- **U11 · DPR retina sky bake**
  Retina sky bake (render.js ~180-183). Ordered AFTER U9 inside v16 because U9's RENDER sub-object touches render.js — sequencing avoids a merge race.
- **UP · Desktop parity (MVP)**
  render.drawTouchControls: remove the isTouch===false early-return (render.js ~588) -> always-show desktop key legend + surface the Nova charge/cooldown pip on desktop + add touch discs on first touch (matchMedia seed flag). Resolves Mike's G1 review item ('I can't see how to use the upgrades via my PC'). Value-fast, no art risk. Ordered after U9 (shared render.js surface). >>> DEPLOY gz-v16 (directed gameplay + KMP base + parity all shipped, no art yet).

### gz-v17
- **ART-P1 · Art Phase 1: shared draw primitives**
  RIM constant, drawRidgeElement, drawFissures, GLSL-style hash helper + rim-tier/night/belly/back-facing conventions. The 'facing' shared helper is ALREADY unified in v16 (U12), so phase-1 here adds ONLY the new draw primitives on top of the single facing table. No visible per-form change yet — pure scaffolding the families consume.
- **ART-P2 · Art Phase 2: wyrm template (Godzilla x5)**
  buildWyrm rewrite + the 5 Godzilla palettes/shapes. First visible family; the proving ground for the phase-1 primitives. Build dispatch is data-driven (archetypes.js:1080 dispatches on shape.archetype; entities.js:684 graceful-degradation fallback when a builder is absent), so the other 3 families keep their prior draw path — coherent, shippable intermediate. >>> DEPLOY gz-v17.

### gz-v18
- **ART-P3 · Art Phase 3: mecha x4**
  buildMecha rewrite for the 4 Mechagodzilla forms; FINALIZES drawMechHead headStyle branches + steel palette. MUST precede phase-4 (visual-redesign-plan §8 L408-415: drawMechHead is the key cross-family dependency the Ghidorah cyborg center head consumes; drawMechHead exists today at archetypes.js:967, mecha_ghidorah shape.mech:true at config.js:173). Other families unchanged. >>> DEPLOY gz-v18.

### gz-v19
- **ART-P4 · Art Phase 4: hydra/Ghidorah x5**
  buildHydra rewrite for the 5 Ghidorah forms; CONSUMES drawMechHead (finalized in v18) for the mecha_ghidorah cyborg center head. v18-before-v19 is mandatory and now satisfied. Flyers still on prior draw path. >>> DEPLOY gz-v19.

### gz-v20
- **UF+U13+ART-P5 · FLYER MEGA-UNIT (the merge) — campaign finish line**
  ONE combined buildFlyer rewrite. KNOT (a) RESOLVED: MERGE UF flyer-flight INTO art-phase-5, do NOT ship UF mechanics-only first. Verified: buildFlyer (archetypes.js:322-385) uses a SHARED body/leg/shadow/bob skeleton for both moth+pterano (lines 334-372), branching only at the wing call. UF's spec (always-hover, no ground jump, fly freely over buildings, altitude shadow) rewrites EXACTLY the same block art-phase-5 rewrites (delete drawBirdLeg+bob -> add drawTuckedTalons + drawAltitudeShadow + flightTilt + wingStyle gate). Shipping UF first = a throwaway buildFlyer that phase-5 immediately overwrites = double regression surface on the riskiest builder. The locomotion half of UF (entities.js JUMP kinematics ~953-963 + isAirborne L920: flyers hover at altitude, hide jump disc for flyers in input/render, free over-building flight) is NON-archetypes.js, isolated, and co-locates in the same v20 commit. KNOT (c) RESOLVED: U13 airborne-targeting pairs here. RE-SCOPED per verdict: U13 is NOT greenfield — acquireTargets (entities.js:1086-1163) ALREADY has the airborne flag (L1092), airborne-vs-ground explicit gating (L1098-1102), and prefer-flying-then-fall-back-to-ground pick (L1127-1141). U13 is a TIGHTENING pass so includeFlyers/honor-ground-tap-while-airborne behave correctly under UF's new flyer-steady-airborne state — its flyer path is dead until UF lands, hence same deploy. Now 'flyers hover AND target planes above + ground below' is verifiable end-to-end as one feature. Mothra x3 + Rodan x3 art lands with it. >>> DEPLOY gz-v20 (campaign complete).

## Form economy (the bounded re-pricing)

CHOSEN: OPTION A — re-price ALL 20 forms strictly below the 1e9 finale prize as mid-game base-jump shortcuts on the single multiplicative damage axis. Keep the 1e9 ceiling (Option C rejected — it is the locked anchor shared by cap/finale/win). Reject Option B post-finale gating (research-2026-06c §3 already evaluated and rejected it: strands 75% of the roster; and gating 2-3 redesigned Titan sprites behind a finale most players see once undercuts the per-family art investment). Option B's one valid kernel is preserved ONLY as a post-launch tuning lever (below).

CAP VALUE: CAP_HP = Math.max.apply(null, Cfg.ROW_HP) = 1e9 (VERIFIED == max(ROW_HP); data-derived so it survives ROW_HP retuning). buyClaws denies once attackPower() >= CAP_HP. The 1e9 statue is the finale prize. WORLD2_COST = 12e9 remains the only post-finale aspirational gate; NO form sits there.

PER-FORM COSTS (config.js FORMS[].cost; ordered by base damage; levels-to-cap and cost are VERIFIED below):
  gz2014            base 6          cost 0            (28 lvls-to-cap)  starter, free
  burning           base 48         cost 150          (25)
  gvk               base 240        cost 1,200        (22)
  gxk               base 3,000      cost 10,000       (19)
  supernova         base 18,000     cost 80,000       (16)
  ghidorah          base 350,000    cost 1,300,000    (12)
  king_ghidorah     base 750,000    cost 2,600,000    (11)
  mecha_ghidorah    base 900,000    cost 5,200,000    (11)
  grand_king        base 1,200,000  cost 5,400,000    (10)
  mothra_gvm        base 1,500,000  cost 5,500,000    (10)
  void_ghidorah     base 2,600,000  cost 11,000,000   (9)
  mothra_gxk        base 3,000,000  cost 11,000,000   (9)
  rodan             base 4,000,000  cost 22,000,000   (8)
  rodan_mv          base 6,500,000  cost 36,000,000   (8)
  mothra_supernova  base 7,600,000  cost 40,000,000   (8)
  mecha_1           base 9,000,000  cost 44,000,000   (7)
  rodan_fire        base 12,000,000 cost 60,000,000   (7)
  mecha_2           base 13,900,000 cost 72,000,000   (7)
  mecha_3           base 15,000,000 cost 80,000,000   (7)
  super_mecha       base 16,800,000 cost 90,000,000   (6)

VERIFIED (node, against live config.js): (1) cost strictly monotone-NONDECREASING in base = TRUE; (2) every cost < 1e9 = TRUE (max 90M); (3) levels-to-cap descends monotonically 28 -> 6 (bigger monster = fewer claws levels to one-shot the finale = harder hitter, the 'collection shortcut' fantasy); (4) UE1 formula clawsCost=round(base*2^(L+1)) is back-compatible: gz2014 L0->L1 = round(6*2^1) = 12 == the existing config CLAWS[1].cost of 12.

CORRECTION (synthesis-lead, load-bearing): the source finding's stated derivation — 'organicSpendToReach(base) x 1.6-1.8 premium, max 90M = 2.8% of 3.22e9 lifetime spend, premium band 1.43-2.38x' — is ARITHMETICALLY INCONSISTENT with its own table and the live code. The CLAWS cost ladder is round(12*2.6^L), so true cumulative spend to the 28-level finale is ~8.1e12 (NOT 3.22e9), and organicSpendToReach(base) computes to ~3e2 .. 2.6e10 — making the actual cost/organic ratios ~0.003-0.46x, NOT 1.4-2.4x. The COST TABLE is nonetheless correct and adopted unchanged; only the RATIONALE is restated on a defensible basis: a strictly-monotone shortcut ladder where each form's cost is calibrated so a player can AFFORD it from a few kills at the HP tier they are realistically farming when they would want it, with levels-to-cap as the legibility invariant (28->6). Forms stay multiplicative on form.base (the 'bigger monster hits harder' fantasy); attack.kind (beam/cloud/bolts/dive/volley) + silhouette is the horizontal-progression flavor layer (Vampire Survivors / Slay the Spire precedent: distinct style + reachable cost > pure number escalation).

POST-LAUNCH TUNING LEVER (not a launch change): if first playtest shows the mid-game feels too shortcut-heavy (super_mecha at 90M trivially skips to 6 levels-from-finale), raise ONLY the top-mecha premium (super_mecha 90M -> 150-200M, still << 1e9). The monotone ladder absorbs this without disturbing any other form. Do NOT move any form to a post-finale gate (that would re-open the locked finale/cap/win triad).

## Rationale & dependency-knot resolutions

VALUE-FAST without burying directed gameplay: gz-v16 leads with UE economy+finale (the ONLY change that makes the game finishable — Mike's core intent) plus the form re-pricing, then UP desktop-parity (his explicit G1 complaint). All directed gameplay + parity lands in the FIRST deploy, ahead of the 4-deploy art tail. The verdicts flagged that the source sequencing finding omitted UE from its v16 list, creating ambiguity; I make UE the unambiguous headline of v16.

KMP-PORTABILITY front-loaded: U9 (tunables -> Config sub-objects, single-source iso math) and U12 (facing-table dedup) — both behavior-identical — land in v16 BEFORE any art churn. The art rewrite (v17-v20, which heavily edits archetypes.js + config.js FORMS) is therefore authored against the FINAL Config shape and a single unified facing table; the stale-comment sweep cleans OLD code rather than fighting freshly-written art comments. This is exactly the KMP roadmap M0 'consolidate NOW' step and the keystone for the eventual Kotlin data-class translation.

RISK-PER-DEPLOY minimized: every version boundary is independently shippable and verifiable. v16 is all behavior-identical structural work + isolated config/economy (the most testable, lowest-render-risk surface). The art families ship one-per-deploy (Mike's stated per-family live-deploy choice) on a data-driven dispatch with a graceful-degradation fallback, so each intermediate is coherent (redrawn families look new, untouched families look as before — never a broken half-state).

DEPENDENCY-CORRECTNESS — all four knots resolved and code-verified: (a) UF MERGED into the flyer art rewrite (v20) because both touch the identical shared body/leg/shadow block in buildFlyer — shipping UF first = throwaway intermediate + double regression on the riskiest builder. (b) U12 facing-dedup pulled into v16 ahead of the art primitives (it IS phase-1's facing concern; isolates regression-sensitive facing verification from art G1 verdicts). (c) U13 paired with UF in v20 (its flyer path is dead until flyers hover; re-scoped as a tightening pass on the EXISTING airborne acquireTargets branch, not greenfield). (d) U9 first (clean base for the art churn + KMP keystone; ordered before U11/UP inside v16 to avoid a render.js merge race). The art plan's own hard constraint — phase-3 drawMechHead before phase-4 cyborg center head — is honored by v18-before-v19.

FORM ECONOMY: Option A is locked by research-2026-06c §3 and serves the 'all 20 redesigned characters reachable in normal play' intent; B re-opens a locked decision and strands the most expensive redesigned sprites behind a once-seen finale. The cost table is verified sound; I corrected the finding's broken premium/lifetime arithmetic and re-anchored the rationale to affordability + monotone levels-to-cap, flagging the corrected derivation as the residual to confirm in playtest via the top-mecha premium lever only.
