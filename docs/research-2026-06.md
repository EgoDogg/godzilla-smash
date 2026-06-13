# Godzilla Smash — Research-Locked Numbers (UR · 2026-06-13)

Produced by the UR research-lock workflow (4 web-research agents → 3-lens adversarial verify [source-quality / fit-to-game / math-consistency] → synthesis; 8 agents, run `wf_dfb40cf9-aa4`). 23 params: **17 locked ≥0.97**, 6 documented fallbacks (ship-value given). The path to ≥0.97 here is code-grounded / arithmetic certainty, not source authority alone.

These numbers are the source of truth for campaign units **U1–U5** and the v14 touch geometry. The report body (tables, comparables, fallback rationale) follows the apply-spec.

---

## APPLY-THESE — exact config keys (what the units write)

### U1 · Attack-Speed track (`Config.ATKSPD`)
```js
ATKSPD: { FLOOR: 0.075, DECAY: 0.70, LEVELS: 6, BASE: 10, GROWTH: 3.2 }
```
- Cost curve `round(10·3.2^lvl)` = **10 / 32 / 102 / 328 / 1049 / 3355** (total 4876) — verified; step 3.2 > claws 2.6 (accelerating price for a capped reward). ≥0.97.
- Gate `g' = FLOOR + (g−FLOOR)·DECAY^lvl`; wyrm base gate 0.126s → **L6 ≈ 0.081s = ×1.56 DPS ceiling (12.35/s)** — verified (NOT 75ms; that would give ×1.68). ≥0.97.
- Keep the reduction **smooth/continuous** (6 even steps, no breakpoints — `attackGateFor` already is). ≥0.97.
- Shop framing: do NOT use a "30–50% of damage track" label (false — 4876 is 211% of claws-L6 cum 2309). Sell on feel; the ordering rule (uncapped claws ×2.0/lvl always wins DPS/coin) holds automatically.

### U2 · Move-Speed track (`Config.MOVESPD`)
```js
MOVESPD: { PER_LEVEL: 0.08, LEVELS: 6, BASE: 40, GROWTH: 2.4 }
```
- Cost `round(40·2.4^lvl)` = **40 / 96 / 230 / 553 / 1327 / 3185** (total 5431) — verified; sits above ATKSPD, preserving claws(2309) < AS(4876) < move(5431) least-efficiency ordering. ≥0.97.
- **+8%/level ×6 → cap ×1.59**; collision-safe (7.38 tiles/s = 0.123 tiles/substep @60fps, 0.246 @30fps, both ≪ 1.0-tile footprint — no tunneling). ≥0.97.

### U3 · Nova Slam (`Config.FINISHER`) + disc geometry
- Unlock **350 coins**, one-time (sits just past CLAWS L4 cum 335; = 0.58× a row-4 building). ≥0.97.
- Cooldown **8s** + charge + **visible depleting cooldown ring**; NO cooldown-reduction upgrade this release. (0.92 — ship 8s, rationale leans on the verified Survivor.io second-scale-active comparable.)
- NOVA disc **76pt** diameter (secondary tier, matches JUMP), placed **left of SMASH** (L-shape: SMASH bottom-right, JUMP above, NOVA left); SMASH↔NOVA center distance ≈108pt. (0.90 geometry — see disc-geometry note.)

### U4 · Touch geometry (`input.js`)
```js
JOY_DEADZONE = 0.12   // was 0.18 — rescale (mag-DZ)/(1-DZ) already present, pure crispness win
JOY_RADIUS   = 70     // KEEP (fallback 0.85 — 80 is a marginal gain, no constraint interaction)
LEFT_ZONE    = 0.42   // was 0.55 — frees the center band so tap-to-target works (LOCKED pillar)
// delete RIGHT_ZONE (dead variable, audit)
SMASH_MIN    = 96     // was 64 — floor fix; runtime r≈70 (140pt) already dominates on iPad
JUMP_MIN     = 76     // was 56 — SMASH:JUMP = 96:76 = 1.26 hierarchy reads clearly secondary
FINISHER_MIN = 76     // NOVA matches JUMP
```
- **NEW — safe-area insets in `layoutSmash()` (input.js ~L151-152):** currently flat `insetX=insetY=r+26` with NO `env(safe-area-inset)`; on a full-bleed iPad PWA the SMASH rim sits in the home-indicator strip. Add `env(safe-area-inset-right)` to insetX and `env(safe-area-inset-bottom)` to insetY (read via a hidden probe div + `getComputedStyle`, since layout is Canvas2D). Reconcile the base `r+26` vs the spec's 28pt. ≥0.97.
- Re-run the 3-disc clearance at **actual runtime radii** (rS≈70, rN≈62): clearance from the LEFT_ZONE=0.42 edge ≈ +350pt landscape (1180×820) / +162pt portrait (820×1180) — both safely positive.

### U5 · Balance tuning
```js
COMBO: { WINDOW_MS: 3250, STEP: 0.12, MAX: 2.0 }   // was 1600 / 0.04 / 2.0
RESPAWN.RUBBLE_MS       = 2800   // was 6500
RESPAWN.RUBBLE_PER_TIER = 150    // was 450  ← REQUIRED with the dwell cut (see rubble note)
```
- COMBO.STEP +0.12 → caps in ~9 destroys (mid the 8–12 band); CAP stays 2.0 (locked). STEP ≥0.97; WINDOW 3250 is 0.90 (feel-tunable, coupled to rubble: 3250 > 2800 so combo survives one respawn gap).
- Hit-stop (world.js:509 `40 + min(tier,18)·3`): **floor 60, cap 95ms** → e.g. `Math.min(95, 60 + Math.min(tier,18)·2)`. Cap MUST stay < 125ms refire gate or it stalls autofire. ≥0.97.
- **Rubble — both levers required** (math lens): RUBBLE_MS→2800 alone leaves tier-18 downtime at 12.15s because `RUBBLE_PER_TIER·18 = 8.1s` is untouched; cutting per-tier to 150 gives tier-18 = 6.75s (within the 4–8s genre ceiling). The higher-order fix (always keep fresh targets in the smash arc) is noted for a future world-gen pass, not this release.

---


Synthesis of the research deltas + 3-lens adversarial verdicts (source-quality, fit-to-game, math-consistency). Every PRIORS parameter is covered. A value is **locked>=97** only if no lens rejected it AND surviving confidence >=0.97; the path to >=0.97 here is **code-grounded / arithmetic certainty** (the number is deterministic given inputs verified in `config.js`/`input.js`/`entities.js`). Values resting on refuted, soft, or unverifiable external sources, on a feel/playtest judgment, or that the math lens found incomplete, are marked **fallback<97** with the drafted value to ship and why research could not reach 97.

All code claims below were re-verified this session against the live files.

## Code verification ledger (this session)

| Claim | Verified value | File:line |
|---|---|---|
| CLAWS growth / mult | `CLAWS_GROWTH=2.6`, `CLAWS_MULT=2.0`, `CLAWS_BASE=12` | config.js L30-32 |
| CLAWS ladder / cum L6 | 12/31/81/211/548/1426, cum **2309**; step ratios 2.58-2.61 | recompute |
| ROW_HP | `[10,28,78,215,600,1650,4500,...]` | config.js L23 |
| COMBO baseline | `WINDOW_MS:1600, STEP:0.04, MAX:2.0` | config.js L35 |
| Wyrm base cooldown | `attack.cooldown: 0.30` | config.js L60 |
| Gate formula | `clamp(base*0.42, 0.11, 0.20)` => 0.126s = 7.94/s | entities.js L819-828 |
| RESPAWN | `CRUMBLE 550, RUBBLE 6500, RUBBLE_PER_TIER 450, RISE 700` | config.js L46 |
| Total downtime | tier0 **7.75s** → tier18 **15.85s** | recompute |
| Joystick / discs | `JOY_RADIUS=70, JOY_DEADZONE=0.18, SMASH_MIN=64, JUMP_MIN=56, LEFT_ZONE=0.55` | input.js L46-50 |
| layoutSmash inset | `insetX=insetY=r+26`, NO `env(safe-area-inset)` | input.js L151-152 |
| Deadzone rescale | `(mag-DZ)/(1-DZ)` present | input.js L441 |
| MAX_SPEED | `260/PX_PER_TILE` = 4.64 tiles/s | entities.js L795 |
| New tracks exist? | only `clawsLevel`; ATKSPD/MOVESPD/NOVA are NEW | economy.js |

## Balance

| Param | Final value | Status | Conf | Note |
|---|---|---|---|---|
| ATKSPD cost curve | `round(10*3.2^lvl)` = 10/32/102/328/1049/3355, **total 4876** | locked>=97 | 0.97 | Sum + step ratio (3.2 > claws 2.6) verified; KEEP-4876 survives all lenses |
| ATKSPD rationale framing | Clicker-Heroes efficiency + accelerating-price-for-capped-reward; **strike** the "30-50% of damage track" label and the itch.io "go infinite" citation | fallback<97 | 0.90 | The itch.io source is **refuted** (unrelated Shapebuster devlog) |
| ATKSPD positioning (ordering) | Ordering rule (claws DPS/coin > AS at every tier), validate by spreadsheet not % | locked>=97 | 0.97 | 4876/2309 = 211% disproves the % label |
| MOVESPD cost curve | `round(40*2.4^lvl)` = 40/96/230/553/1327/3185, **total 5431** (or hand-set 40/100/250/600/1400/3200 = 5590) | locked>=97 | 0.97 | Least-efficient ordering enforced; drop "20-40% of DPS" label |
| MOVESPD +%/level + cap | +8%/lvl over 6 (x1.59) OR +10%/lvl over 5 (+50%, literal Wings value) | locked>=97 | 0.97 | Cap collision-safe: 0.123 tiles/frame @60fps << 1.0 footprint |
| Damage track ratio (claws) | KEEP x2.6 cost / x2.0 power | locked>=97 | 0.97 | Verified config; refute any steepening |
| NOVA unlock price | **350 coins** one-time; framing = "just past CLAWS L4 cum (335)" | locked>=97 | 0.97 | Grounded in verified ROW_HP math (0.58 of row4) |
| NOVA cooldown | **~8s** + charge + visible ring; no CDR upgrade this release | fallback<97 | 0.92 | Cited CD sources soft; lean on verified Survivor.io comparable |
| ATKSPD gate floor / ceiling | L6 at **~81ms** (not 75ms) => **x1.56** ceiling; cap the track | locked>=97 | 0.97 | 0.126/0.081=1.5556 verified; 75ms would give x1.68 |
| COMBO.STEP | **+0.12** / destroy (caps in ~9) | locked>=97 | 0.97 | 1.0/0.12=8.33, mid 8-12 band |
| COMBO.WINDOW | **3.25s** (3250ms); ship with the rubble cut | fallback<97 | 0.90 | Exact window is a feel value; DMC sources evidence the pattern not a number |
| COMBO.CAP | **2.0x** hard cap, unchanged | locked>=97 | 0.97 | LOCKED design; make it reachable, not higher |
| RESPAWN.RUBBLE_DWELL | RUBBLE_MS **~2800ms** AND cut RUBBLE_PER_TIER (450/tier) + always-fresh-targets | fallback<97 | 0.92 | Dwell cut alone leaves tier18 at 12.15s — incomplete without the per-tier cut |
| ATKSPD flatten-to-1405 variant | **DROP** | locked>=97 | 0.97 | Rejected by fit lens; would invert damage-first ordering |
| AS granularity (smooth vs breakpoint) | Keep **smooth** continuous gate reduction | locked>=97 | 0.97 | Code already smooth; Archero 2 breakpoint is a cautionary, not a copy |

### Why the ATKSPD "30-50% of the damage track" label was struck
The damage (claws) track is uncapped x2.0 power per level at x2.6 cost growth, so its **cumulative** spend to L6 is only **2309 coins** — cost growth lags power compounding, making claws a deflationary DPS bargain by mid-game. The proposed AS total of 4876 is therefore **211%** of full claws-L6 spend, the opposite of "30-50% of." You cannot price a flat, capped +56% utility as a percentage of an infinitely-scaling super-efficient damage ladder. The correct frame is an **ordering rule** (claws always wins DPS/coin) + an **accelerating price** (base 3.2 > claws' 2.6) so the capped AS top level is never a no-brainer. Move-speed (zero DPS) is priced highest of the three, deliberately the least coin-efficient buy.

### Rubble-dwell — the deep-tier flaw the math lens caught
Total per-building downtime = `CRUMBLE 550 + RUBBLE_MS + RUBBLE_PER_TIER*tier + RISE 700` (ms). Cutting `RUBBLE_MS` to 2800 alone:
- tier 0: **4.05s** (good)
- tier 18: **12.15s** (still broken — `RUBBLE_PER_TIER*18 = 8.1s` dominates and is untouched)

To honor the genre "never exceed ~4-8s" ceiling at depth you must ALSO cut/cap `RUBBLE_PER_TIER` (e.g. 450→150ms gives tier18 = **6.75s**). And the real fix is the higher-order lever the destruction genre actually uses: **keep fresh non-rubble targets in the smash arc at all times** so the player never faces an empty screen — in-place respawn timing alone is the wrong model.

## Touch

| Param | Final value | Status | Conf | Note |
|---|---|---|---|---|
| JOY_DEADZONE | **0.12** (0.10-0.15) | locked>=97 | 0.97 | Rescale formula already in code; pure crispness win, no snap |
| JOY_RADIUS | keep **~70-85** (mid 80) | fallback<97 | 0.85 | Weakest prior; low-stakes feel tunable |
| LEFT_ZONE | **0.42** (0.40-0.45) | locked>=97 | 0.97 | Protects LOCKED tap-to-target; frees a center band |
| SMASH diameter | `SMASH_MIN=96` (floor fix; runtime already ~140pt on iPad) | locked>=97 | 0.97 | 96>44pt HIG; affects small viewports only |
| JUMP diameter | `JUMP_MIN=76` (96:76 = 1.26 hierarchy) | locked>=97 | 0.97 | Reads clearly secondary; clears 44pt with margin |
| NOVA diameter + L-shape + inset | **76pt**, SMASH bottom-right / JUMP above / NOVA left; centers + env(safe-area-inset) | fallback<97 | 0.90 | Clearances restated at runtime radii (~+350pt landscape / ~+162pt portrait) |
| Safe-area inset in layoutSmash() | add `env(safe-area-inset-right/bottom)` via probe + getComputedStyle | locked>=97 | 0.97 | Code-grounded gap; correctness fix |

### Disc geometry — corrected clearance numbers
The prior's clearance figures (+462pt landscape / +254pt portrait) were computed at the **fixed-floor** radii (rS=48, rN=38). At **actual iPad runtime radii** (rS≈70, rN≈62, from the `*0.085`/`*0.075` proportional terms), the right L-cluster is larger and clearance from the joystick spawn-zone edge (LEFT_ZONE=0.42) drops to **~+350pt (landscape 1180×820)** and **~+162pt (portrait 820×1180)** — both still safely positive, no overlap. The SMASH↔NOVA center distance (108pt) is far above the 24pt WCAG non-overlap threshold under either radius regime. Landscape NOVA rim is at x≈938 (not 958) once the right safe-area term is included.

### HITSTOP — the Vlambeer figure correction
Keep the tier-scaled curve; raise floor 40→60ms, cap ~95ms. Verified the cap must stay under the 125ms refire interval (gate 0.126s) — a fighting-game-length 200-250ms freeze would exceed it and STALL autofire. **Correction to the prior:** Vlambeer's `sleep(20)` in "The Art of Screenshake" is **~20ms** (GameMaker `sleep()` takes milliseconds), NOT "~333ms at 60fps." The corrected, shorter number reinforces — does not weaken — the "short per-kill freeze for a rapid-fire loop" conclusion. SFV's 8/12/15 frames (~133/200/250ms, confirmed via Shoryuken/SuperCombo) are deliberate single-hit exchanges, not a model for an 8/sec loop.

## Three closest comparable games (real numbers)

**1. Vampire Survivors** — Wings move-speed upgrade: **+10% per level, +50% cap at L5** (base 100%). Confirmed verbatim on the VS wiki. This is the directly-shipped value the MOVESPD track mirrors, and the canonical proof that utility tracks are small flat capped steps, not geometric. Spawn system: per-wave **minimum enemy count** with refill-to-quota, periodic spawning stopping only at a **300-alive cap** — i.e. the design problem is always *too many* targets, never an empty screen. This is the model behind the rubble-dwell "always fresh targets" fix.

**2. Survivor.io** — Energy Cube: **-8%/level cooldown to a -40% cap** (40% confirmed; 8%/level is the 40÷5 inference). Active/evolved skills run on **second-scale cooldowns** with cooldown-reduction stacking — the action-survivor cadence that validates NOVA's ~8s (vs the idle-game antipattern). Sustained on-screen density is core: clearing a wave gives only "brief respite before the next, larger horde."

**3. Clicker Heroes** (+ Cookie Clicker / Tap Titans 2 as economy brackets) — Cost = `BaseCost × 1.07^Level`, DPS-per-cost decaying `Static × 0.988^L` (~1.2%/level less efficient): the canonical proof that the **primary damage line stays the most coin-efficient path** and utilities ride on top. Cookie Clicker's `1.15^owned` building cost (flat CpS add) and Tap Titans 2's sparse every-20-level x2 milestones bracket our claws **2.6-cost-for-2.0-power** as a normal, slightly player-friendly curve. (Smashy City / City Smash — endless procedurally-generated cities, "instant wreck/reset/repeat, no downtime" — anchor the destruction-loop "zero forced dead time" principle for the rubble fix.)

## Fallbacks (research could not reach >=0.97)

- **ATKSPD rationale framing (0.90):** ship the curve, but the rationale's load-bearing "attack speed goes infinite, devs cap it" source (`itch.io/post/13448315`) was **refuted twice** as an unrelated Shapebuster active-vs-idle devlog. Justify the cap on first principles (bounded reward needs accelerating price) + the internal `COOLDOWN_FLOOR` config, and remove the citation.
- **NOVA cooldown 8s (0.92):** the cited cooldown sources (TV Tropes, Game Design Snacks Fandom wiki, G2A glossary) are soft/low-authority and unverified-in-session. Ship 8s, but lean the rationale on the **verified Survivor.io** second-scale comparable, contrasted against Tap Titans 2's wrong 10-60-minute idle cadence.
- **COMBO.WINDOW 3.25s (0.90):** the exact window is a playtest-tunable feel value. DMC sources evidence the *pattern* (short reset, accelerating decay) not a portable number, and the comparables-batch sibling self-rated 0.48. The cross-system coupling to the 2800ms rubble cut (3250 > 2800) is arithmetically sound; the absolute 3250ms is the soft part — tune in playtest.
- **RESPAWN.RUBBLE_DWELL 2800ms (0.92):** ship 2800ms, but it is **incomplete alone** — deep-tier downtime stays ~12s unless `RUBBLE_PER_TIER` (450ms/tier) is also cut and fresh adjacent targets are guaranteed. The genre's "always-fresh-targets" principle is the real fix; the single dwell number is a feel tunable.
- **JOY_RADIUS ~80 (0.85):** weakest prior in the set (self-rated 0.62). Unity "range/2" is an interpretation not a spec; PUBG "size 100" is visual diameter not throw. 70 ships safely; ~80 is a marginal resolution gain. No locked-constraint interaction.
- **NOVA disc geometry (0.90):** sizing (76pt), L-shape, and 108pt spacing are solid, but the prior's clearance numbers were at fixed-floor radii; restate at runtime radii (~+350pt landscape / ~+162pt portrait). No shipped game publishes exact 3-disc inset math, so the geometry is HIG-derived rather than copied — keeps it below 97.