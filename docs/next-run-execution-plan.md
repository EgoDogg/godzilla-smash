# Godzilla Smash — Next-Run Autonomous Execution Plan (authored 2026-06-09 @ gz-v13)

This plan was researched and verified by a 12-agent audit swarm + 5 planning/exploration agents on 2026-06-09. Every file:line anchor below was re-read against source before being written here. Execute autonomously; target ≥90% confidence per area before each deploy. Companion docs: `docs/audit-2026-06.md` (verified findings + research deltas), `docs/kmp-architecture-roadmap.md` (architecture), `docs/v3-build-contract.md` (original contract).

## Conventions (non-negotiable)

- **Verify in preview before every deploy.** The 3-layer cache trap (memory `godzilla-preview-verification-gotcha`): in ONE preview_eval — unregister SWs → delete all CacheStorage keys → `fetch` each `./js/*.js` with `{cache:'reload'}` → navigate with `location.href='./?fresh='+Date.now()` (NEVER `location.reload()` from eval). Verify LIVE objects, not fetched text. The preview tab is `document.hidden` → drive frames manually: `GAME.camera._init=false; GAME.camera.follow(player,0.016); GAME.Render.frame(0.016)`. If iso.js sticks stale, re-run its IIFE in-page: `(0,eval)(await (await fetch('./js/iso.js?v='+Date.now(),{cache:'reload'})).text())`.
- **Deploy:** bump `sw.js CACHE` AND `js/config.js CACHE_VERSION` together (gz-vN → gz-v(N+1)), `node --check` every edited file, conventional commit + `Co-Authored-By: Claude <noreply@anthropic.com>`, push to main, poll live `https://egodogg.github.io/godzilla-smash/sw.js` until the new cache name appears.
- **Save compatibility:** key stays `godzilla-save-v3`; `Economy.load()` (economy.js:284-315) back-fills missing fields — new fields need defaults + clamps there, NO key bump.

---

## Batch 1 → gz-v14: Three features

### 1A. Attack Speed track ("Rapid Fire Breath")

**Config** — add after `COOLDOWN_*` (config.js:43), matching comment style:
```js
// --- Attack Speed track: gate' = FLOOR + (gate − FLOOR) × DECAY^level.
//     Asymptotes to the 75ms perceptual floor; every level always shows a gain.
ATKSPD: { FLOOR: 0.075, DECAY: 0.70, LEVELS: 6, BASE: 10, GROWTH: 3.2 },
```
Costs `round(10×3.2^lvl)`: **10, 32, 102, 328, 1049, 3355** (total ≈4,876) — audit research delta: a utility track should cost 30-50% of the equivalent damage-track spend; the original BASE 25 totaled ~12k ≈ 35× worse DPS/coin than CLAWS. Interleaves the CLAWS ladder (12, 31, 81, 211, 549, 1428, 3713, 9655, 25103). Wyrm gate 0.126s (7.9/s) → L6 0.081s (12.3/s) ≈ ×1.56 total DPS; capped-gate forms (ghidorah/rodan at 0.20) gain more by design (5.0 → 11.1/s).

Note: `Config.CLAWS` table at config.js:205-216 is **dead data** — `clawsCost()` (economy.js:150-152) computes from `CLAWS_BASE/CLAWS_GROWTH`. Follow the formula-constants style; don't add tables.

**economy.js**: state field `atkSpeedLevel: 0` (state block ~:48-56); `atkSpeedCost()` next to `clawsCost()` (:150); `buyAtkSpeed()` mirroring `buyClaws()` (:177-185) + deny at `LEVELS` cap; `gateForLevel(level)` helper for the shop label (replicates the gate formula from Config data for the active form); shop row in `buildUpgrades()` (~:400-420): title "Rapid Fire Breath · Lv N", sub `(1/gate(lvl)).toFixed(1) + ' → ' + (1/gate(lvl+1)).toFixed(1) + ' attacks/sec'`, `MAX` tag at cap; add to `save()` payload (:269-280); in `load()` clamp `s.atkSpeedLevel|0` to `[0, LEVELS]`; expose `buyAtkSpeed/atkSpeedCost/atkSpeedLevel` on the public API (~:658-746).

**entities.js** — `attackGateFor` (:819-828), after the existing clamp:
```js
var A = Cfg.ATKSPD;
var lvl = (G.Economy && G.Economy.atkSpeedLevel) | 0;
if (A && lvl > 0) g = A.FLOOR + (g - A.FLOOR) * Math.pow(A.DECAY, lvl);
```

### 1B. Move Speed track ("Titan Stride")

**Config**: `MOVESPD: { PER_LEVEL: 0.08, LEVELS: 6, BASE: 40, GROWTH: 2.4 }` — costs `round(40×2.4^lvl)`: **40, 96, 230, 553, 1327, 3186** (total ≈5.4k — audit research delta: mobility tracks price at 20-40% of same-tier DPS spend; the original GROWTH 3.0 totaled ~14.5k). Max ×1.587 (MAX_SPEED 4.64 → 7.37 tiles/s = 0.123 tiles/substep — far under footprint+COLLIDE_R(≈0.32) margins; no tunneling).

**economy.js**: `moveSpeedLevel` state + cost + buy (same pattern); **cached multiplier** — module var `moveMult=1`, `recalcMoveMult()` = `(1+PER_LEVEL)^level`, called from `load()` and `buyMoveSpeed()`; expose `moveSpeedMult()` (entities reads at 60Hz — no per-frame `pow`). Shop row "Titan Stride · Lv N", sub `'Move speed ×' + cur.toFixed(2) + ' → ×' + next.toFixed(2)`.

**entities.js** — locomotion (:963-970) + walkPhase (:1027). Constants live at :793-798 (`ACCEL = 1060/PX_PER_TILE`, `MAX_SPEED = 260/PX_PER_TILE`). In `update()`:
```js
var spdMult = (G.Economy && G.Economy.moveSpeedMult) ? G.Economy.moveSpeedMult() : 1;
// (finisher charging multiplies spdMult by FIN.SLOW — see 1C)
var accel = ACCEL * spdMult, maxSp = MAX_SPEED * spdMult;
```
Use `accel` in both `vel +=` lines, `maxSp` in the clamp, and `sp/maxSp` in the walkPhase line so stride animation keeps pace.

### 1C. Nova Slam — charged finisher

Prior research (v7, in memory): keep autofire as the core loop; the finisher is a SEPARATE charged AoE that never touches `atkCooldown`.

**Config**:
```js
FINISHER: {
  COST: 350,            // one-time unlock — lands between CLAWS L3 (81) and L4 (211) era
  CHARGE_S: 1.2, COOLDOWN_S: 8,
  RADIUS_T: 2.5, RADIUS_MAX_T: 3.2,   // tiles, lerped by charge
  DMG_MIN: 3, DMG_MAX: 10,            // × Economy.attackPower(), scaled by charge
  MIN_CHARGE: 0.15,                   // sub-frame taps still fire weakly
  SLOW: 0.5,                          // move multiplier while charging
  SHAKE: 14
}
```
Full charge = 10× attackPower over r=3.2 tiles every 8s ≈ 1-2 autofire-seconds of DPS as burst AoE — a frontier tool, not a DPS replacement.

**Save**: `finisherOwned: false` (+ load coercion `!!s.finisherOwned`). `chargeT`/`finisherCd` are transient (reset on reload — fine).

**economy.js**: `buyFinisher()` (deny if owned/unaffordable); shop row — unowned: sub "Hold the NOVA disc (or F) — charge, release: massive area slam", buy 350; owned: `OWNED` tag.

**input.js** (pointer ids at :75-81, tunables at :46-53, zones LEFT/RIGHT 0.55/0.55):
- `var FINISHER_MIN = 56;` `Input.finisherBtn = {x:0,y:0,r:0};` `var finisherPointerId = null; var keyFHeld = false; var chargeReleaseLatched = false;`
- `layoutSmash()` (~:147-163): NOVA goes **LEFT of SMASH** (L-shape: JUMP above, NOVA left) — `rf = max(FINISHER_MIN/2, round(min(W,H)*0.075)); x = W - insetX - (r + rf + 24); y = H - insetY;`. Geometry verified: iPad landscape 1180×820 → NOVA (928,724), clears the 649px joystick boundary; portrait 820×1180 → NOVA (568,1084), clears 451px. (Stacking a third disc above JUMP was rejected — landscape thumb stretch at y≈425.)
- `inFinisher(x,y)` clone of `inJump` (:171-175) but returns false unless `G.Economy.finisherOwned` (disc inert pre-purchase; taps fall through to tap-to-target).
- `onPointerDown` (~:285-343): between the JUMP and SMASH branches — claim pointer, capture, preventDefault. No latch on press; charge is level-state.
- `onPointerMove` (~:347): add to the filter + swallow branch. `onPointerUp` (~:388-413): clear id, `chargeReleaseLatched = true`. **`onPointerCancel` (~:415-420): clear id, NO latch** — OS-gesture cancel silently discards the charge, never an accidental detonation.
- Keyboard (~:460-498): `KeyF` down (ignore `e.repeat`) → `keyFHeld=true`; up → latch release. `clearAllHeld` (~:580-588): clear both, no latch (blur cancels charge).
- `consume()` (~:591-629): `_intent.charge = (finisherPointerId !== null || keyFHeld)`, `_intent.chargeRelease = chargeReleaseLatched` (reset with the other one-shots).

**entities.js**:
- Constructor (~:840-864): `this.chargeT = 0; this.finisherCd = 0;`. Timer decrement with the others (~:942).
- Charge block in `update()` (after jump kinematics, before locomotion):
```js
var FIN = Cfg.FINISHER;
var canCharge = FIN && intent.charge && this.finisherCd <= 0 &&
                G.Economy && G.Economy.finisherOwned;
if (canCharge) {
  this.chargeT = Math.min(1, this.chargeT + dt / FIN.CHARGE_S);
  this._flash = Math.max(this._flash, 0.25 + 0.35 * this.chargeT); // reuse form-change glow
} else if (intent.chargeRelease && this.finisherCd <= 0 &&
           G.Economy && G.Economy.finisherOwned) {
  this.fireFinisher(Math.max(FIN.MIN_CHARGE, this.chargeT));
  this.chargeT = 0;
} else if (this.chargeT > 0 && !intent.charge) {
  this.chargeT = 0;   // cancel path (pointercancel / blur / shop)
}
if (canCharge) spdMult *= FIN.SLOW;   // charging slows movement 50% — weight + tradeoff
```
The `finisherCd` guard makes release self-consuming across game.js's up-to-5 substeps sharing one intent — **no game.js change needed** (loop clears only `intent.attack`; verified game.js:107-116).
- `fireFinisher(charge)` next to `startAttack` (:1293), modeled on `fireDive` (:1233-1267): set `finisherCd = COOLDOWN_S`; borrow the attack pose (`this._attackDur=0.4; this.attackT=0.4; this.attackFrame=0; this.fsm='attack'`) but DO NOT touch `atkCooldown`; epicenter **1.2 tiles ahead of facing** (`facingToWorldVec`) — kaiju stays inside the blast ring, damage circle leans into unsmashed buildings; `radius = lerp(RADIUS_T, RADIUS_MAX_T, charge)`; damage loop = `World.footprintsNear(ccol,crow,radius+1)` → skip non-standing → radius check → `falloff = lerp(1, 0.55, clamp(dist/radius,0,1))` → `dealDamage(b, round(attackPower() × (DMG_MIN+(DMG_MAX−DMG_MIN)×charge) × falloff))` — money/combo flow through the existing `hitBuilding → bankDestroy` path automatically. FX: double `FX.shockwave` (radius×TILE_W×0.9 in `pal.plateEdge`, ×1.25 in `pal.eye`), `FX.shake(SHAKE×(0.5+0.5×charge))`, `FX.debris({col,row,height:1.5})`, `FX.screenFlash(0.15+0.15×charge)`, `FX.hitStop(50)` — all reduced-motion-safe internally (verified entities.js:79-93). Audio: `G.Audio.finisher(charge)`.

**render.js** — `drawTouchControls` (~:585-618), after the jump disc, only when `finisherOwned`: `drawFinisher(x,y,r,charge,cd)` modeled on `drawJump` (~:660-675) + the combo-pip arc (~:552-563): violet disc (`rgba(120,60,200,…)`), label "NOVA", charge fill = arc from −π/2 sweeping `2π×charge` hot-colored; cooldown = dimmed with a depleting gray arc `2π×(cd/COOLDOWN_S)`. render.js already holds `player` via `setPlayer()` (:698-700) — read `player.chargeT/finisherCd` directly. Desktop F-key users get the kaiju `_flash` glow as charge feedback (v1-acceptable; follow-up: small HUD arc).

**audio.js** — `finisher(charge)` following `crumble`'s recipe (~:170-187) (`evolve()` is a power-up roar, wrong shape; `crumble` already fires from destroyed buildings):
```js
finisher: function (charge) {
  if (!live()) return;
  var t = now(), k = (typeof charge === 'number') ? charge : 1;
  osc('sine', 110, 38, 0.55 + 0.25 * k, 0.7, t);        // deep slam body
  noise('lowpass', 500, 0.8, 0.6 + 0.3 * k, 0.55, t);   // ground rumble
  osc('sawtooth', 900, 180, 0.22, 0.20, t);             // detonation zap
}
```

**Edge cases (all designed, all must hold):** finisher while airborne = allowed (AoE is 2D, `footprintsNear` ignores z); pointercancel mid-charge = silent cancel; blur/tab-hide mid-charge = `clearAllHeld` no-latch → cancel; shop-open mid-charge = charge freezes (paused), release edge drains while paused → cancels on resume (intended); release during substep loop = single fire (cd guard); sub-frame NOVA tap = fires at MIN_CHARGE; charge during cooldown = ignored, disc dimmed; purchase mid-session = `Main.syncForm` recreates kaiju with zeroed transients (harmless, shop is paused); old v3 saves = back-filled defaults, clamps prevent NaN.

### 1D. gz-v14 tuning riders (research-informed, playtest-flagged)

From `docs/audit-2026-06.md` §Research deltas — these ride gz-v14 because three tune the new features directly. All single-constant changes; flag each in the ship notes for Mike's iPad playtest:
- **Combo made visible:** `Config.COMBO` STEP 0.04 → 0.12, WINDOW_MS 1600 → 4000 (MAX 2.0 unchanged) — genre norm is destroy-event triggers, 3-6s gap tolerance, cap reached in 8-12 events. (The "cap unreachable" finding was REFUTED — the window is rolling per-kill — but practical visibility is still poor at 0.04/1.6s.)
- **Respawn dead-zone:** `Config.RESPAWN.RUBBLE_MS` 6500 → 3200 (genre keeps total downtime 4-8s; ours is 7.75-15.85s). Rubble is also the anti-camping lever — if camping a high-tier block feels exploitable, revert toward 4500, not all the way.
- **Hit-stop:** world.js:509 kill freeze `40 + min(tier,18)×3` → `60 + min(tier,18)×2.2` (≈60-100ms; <50ms is imperceptible, genre kill-stops run 80-120ms).
- **Optional, only if the dive feels mushy in play:** `Config.COOLDOWN_CAP` 0.20 → 0.30 (affects only rodan 0.294 / ghidorah 0.21 — restores their intended slower cadence).
- Nova Slam pricing (350) was independently confirmed by research ("1-3× one income unit, burst hook — correctly priced"); the disc cooldown arc satisfies the "visible cooldown" delta.

### Batch 1 verification
1. `node --check` js/config.js js/economy.js js/entities.js js/input.js js/render.js js/audio.js.
2. Preview cache-bust navigation (conventions above), console clean.
3. Eval-drive: `GAME.Economy.bankDestroy(5e4)` (only mutation path into closed-over state) → `buyAtkSpeed()` → `var p=GAME.Main.getPlayer(); p.startAttack([]); p.atkCooldown` ≈0.111 (L1) … ≈0.081 (L6); buy past cap returns false. `buyMoveSpeed(); GAME.Economy.moveSpeedMult()` → 1.08; visual roam check, no clipping along block edges. `buyFinisher()`; `p.chargeT=1; p.fireFinisher(1)` → double shockwave, multi-building damage text, `p.finisherCd≈8` ticking. Live: hold F 1.2s → big blast ahead of facing; quick-tap → MIN_CHARGE blast; press during cd → nothing.
4. Touch geometry: `preview_resize` 1180×820 + 820×1180, `GAME.Input.isTouch=true`, screenshot → 3 discs, no joystick-zone overlap, NOVA absent pre-purchase, charge arc fills, cooldown arc depletes.
5. Shop UI: rows show rate/multiplier transitions, MAX tags, gray-when-unaffordable.
6. Persistence: save JSON contains the 3 new fields; reload keeps them; hand-strip fields → clean defaults (no NaN).
7. Regression: SMASH autofire cadence unchanged at L0; desktop click-hold + Space unchanged; jump unaffected; finisher kills bank + combo normally.
8. Deploy gz-v14 per conventions; relaunch iPad PWA.

---

## Batch 2 → gz-v15: P0 audit fixes + behavior-identical consolidations

### P0 + hardening fixes (verifier-confirmed; full evidence in docs/audit-2026-06.md)

1. **input-clearAllHeld-spaceHeld-not-cleared (P0, 0.97):** add `spaceHeld = false;` inside `clearAllHeld()` (input.js:580-588, after `keyJump`). Verify: hold Space → blur → release unfocused → refocus: no autofire; consume() re-latch at input.js:600 stays quiet.
2. **pwa-fetch-fallback-html-as-js (0.95):** sw.js:25 catch — serve `./index.html` only when `e.request.destination === 'document'`; otherwise return 503 with `Content-Type: application/javascript`. Same pass: stop caching non-OK responses (sw.js:21-24).
3. **pwa-cache-version-dead-link (0.95):** KEEP `Config.CACHE_VERSION` (config.js:5 — it is the console version probe the preview workflow relies on); sw.js:2 `CACHE` is the authority; add a boot `console.warn` on mismatch + cross-comments on both constants.
4. **pwa-savefail-silent (0.95):** economy.js `save()` (:269-280) — check `U.safeSave`'s return; on first failure `G.Env.announce('Progress is not saving (storage full or private mode)')` exactly once. (**`G.UI.toast` does not exist** — use Env.announce.)
5. **input-pointer-cancel-mouseAtk-leak (0.95):** add the missing `mouseAtkPointerId` branch to `onPointerCancel` (input.js:415-420), mirroring onPointerUp :407-412.
6. **Save work (merge with C6):** add `version: 3` AND a `lastSeen` timestamp (research: enables a future offline-income floor with no second migration); dirty-flag `bankDestroy` + the `maxReachedRow` setter (economy.js:141, :733-740 — currently hits localStorage EVERY kill, twice on frontier kills); flush on a 2s timer + visibilitychange/pagehide; keep immediate save for purchases/setMuted.
7. **Small guards riding along (P2s, all verified):** `buyClaws` cap at `Cfg.CLAWS.length - 1` (keep the existing cost constants — the finder's replacement values would shift the curve); `typeof atkDef.shake === 'number'` guard at entities.js:1189 + `// shake:0 = intentionally silent` comment at config.js:60; audio closed-ctx teardown/rebuild in unlock()/tick() (audio.js:127, :146); delete dead `keyJump` (input.js:85, 493, 582).

### Consolidations (behavior-preserving; from the KMP plan — see docs/kmp-architecture-roadmap.md M0)
- **C1 — tunables → Config sub-objects:** `Config.LOCO` {ACCEL 1060, MAX_SPEED 260, FRICTION 12, COLLIDE_R 18, WALK_SPEED 0.22 — keep ÷PX_PER_TILE at the use site}; `Config.CAMERA` {focusX .5, focusY .66, SHAKE_MAX_PX 12, SHAKE_DECAY .02, SHAKE_TRAUMA_K 1/85}; `Config.INPUT_GEO` {the 8 constants at input.js:46-53}; `Config.AUDIO` {MASTER_GAIN .5}; `Config.RENDER` {CULL_PAD 3, CULL_RISE_ROWS 14}. Files: config/entities/iso/input/audio/render. All read-once module-init constants; config loads first. Verify: live-equality per moved value (`GAME.Config.LOCO.ACCEL===1060` …), one driven-frame screenshot, walk+shake eval spot-check.
- **C2 — single-source iso math:** consumers read `G.iso.HW/HH/WZ` (already exported, iso.js:210); hoist input.js:109's per-call re-derivation to module consts; keep entities.js `projectInto` fallback as the documented exception. Rider (audit, 0.90): swap render.js's 7 per-frame `worldToScreen` allocations (:281, :301, :321, :333, :497, :523, :786) to the **already-existing** `iso.worldToScreenInto` (iso.js:223) + two module scratch points — ~40-70 allocs/frame saved.
- **C3 — stale-comment sweep (the porter-spec fix — audit confirmed these stale comments are the ROOT CAUSE of the sprite bug):** assets.js:38-42 (claims 64/32/16/44; actual 56/28/14/40), entities.js:33-34, input.js:88-103 (delete the stale "NOT the inverse" docblock — the implementation IS the true inverse since gz-v12; keep the canonical comment at :104-114), sprites_special.js header lines 10-12 ("no divergence risk" — there was), config.js:220 (note statue hp 5e8 intentionally undercuts ROW_HP[18]=1e9).
- **C6 — save `version: 3` field** in the blob (one line in state + save(); load() already tolerates). Future migrations get a hook, zero framework.

Verify: `node --check` ×all; full cache-bust preview; live-object equality sweep; deploy gz-v15.

---

## Batch 3 → gz-v16: visual + touch-feel verification batch

All items verifier-confirmed ≥0.90; per-item evidence in `docs/audit-2026-06.md`.

**Rendering fixes (screenshot-gated):**
- **C4 — sprites_special HW/HH (live bug):** set `HW = 28; HH = 14;` at sprites_special.js:41-42 — the file's line-28 contract forbids Config reads, so a corrected hardcode is right per contract; add a "must equal Config.GRID TILE_W/2, TILE_H/2 (56/28)" cross-comment. Fixes all 6 special sprites (statue/pyramid/field/sandpile/plane/rare-house tints); statue/pyramid stop clipping 4px per side; `metrics()` (:50-58) inherits the fix — no other change. Verify: screenshots of statue, pyramid, field, plane, rare house (force one: set a standing building's `sprite='house', tint='gold'`, invalidate its bake, drive a frame) — iso taper on both faces, right diamond vertex at 60+56=116 < 120px canvas.
- **render-dpr-mismatch-sky-layers (0.90):** `buildSky()` (render.js:180-183) bakes at 1× CSS px under the dpr=2 transform (game.js:23) — the skyline is blurry on the iPad while buildings are crisp. Bake at `w*d`/`h*d` (d = min(dpr,2)), draw back at CSS size in drawSkyLayers (:240-251), include dpr in the rebuild check (:241). Verify: retina screenshot — 1px stars (:198-200) and 3×3 window dots (:227) crisp.
- **render-bakespecial-footprint-key-missing (0.95, latent):** add `footprint: { w: fw }` to the params literal at assets.js:527 (the five builders read it at sprites_special.js:173/236/307/405/564 with OR-defaults that currently coincide with Config — keep it from ever diverging).
- **C5 — unify facing tables (0.99 — verified byte-identical today):** facingGeom duplicated at archetypes.js:47-70 and entities.js:498-521; unify via the **existing `_wyrmHelpers` export hook** (entities.js:495). Facing was bug-fixed twice (gz-v12) — regression-sensitive: eval-drive all 8 facings + screenshot strip; assert both consumers use one table object.

**Touch-feel retune (research-informed; one combined iPad playtest pass):**
- **input-zone-overlap-center-strip (0.90):** `LEFT_ZONE` 0.55 → 0.42 (input.js:50) + delete dead `RIGHT_ZONE` (:51) — restores tap-to-target across the center screen (dead on touch since gz-v10: any non-disc touch at x ≤ 0.55·W spawned the joystick before `resolveAimAt` could run). Optional M upgrade: in the left zone, try `resolveAimAt` on standing-building sprites BEFORE spawning the joystick (branch order input.js:308 vs :324).
- **Joystick:** JOY_RADIUS 70 → 85, JOY_DEADZONE 0.18 → 0.12 (genre medians).
- **Discs:** SMASH_MIN 64 → 96, JUMP_MIN 56 → 72 (HIG + genre norms); scale NOVA proportionally (FINISHER_MIN 56 → 72) and RE-RUN the Batch-1 L-shape geometry for both orientations with the larger radii — insets may need +8-16px so NOVA still clears the joystick zone (now 0.42·W, which HELPS).
- **hud-button-touch-target (0.95):** `min-height:44px; min-width:44px;` on the `#hud button` rule (index.html:37); confirm the HUD strip (:27) still clears.

**Airborne-targeting fixes (play-verified):**
- **combat-acquireTargets-dead-code-airborne (0.97):** entities.js:1068-1069 — honor explicit ground taps while airborne (`if (tb.state === 'standing') primary = tb;`, matching the dead line's own `// ground always ok` comment); delete the unreachable line.
- **combat-airborne-footprintsNear-misses-flyers (0.95):** one token — pass `airborne` as the existing `includeFlyers` param at entities.js:1088 (world.js:454, :478-488); the downstream prefer-flying logic then works as written. Verify: jump near a plane with autofire held → plane auto-acquired.

Deploy gz-v16. **Deferred design call (NOT in this batch):** `world-thin-tier-rows` — 8 of 19 tiers have only 1 building row (prow=4 vs tierRows=3 phase mismatch); any fix reshapes mid-save difficulty (`maxReachedRow` persists). Present options to Mike after he's played v14-v16.

---

## Batch 4 (no cache bump): KMP scaffold

Out-of-tree — `kmp/` dir; PWA + sw.js asset list untouched.
1. `kmp/` Gradle Kotlin Multiplatform project (commonMain + jvmTest is enough to start; no Android/iOS targets yet — add when M4 begins).
2. `commonMain`: `Config.kt` — GRID/ROW_HP/COOLDOWN_*/ATKSPD/MOVESPD/FINISHER/RESPAWN/COMBO/RARE_SPAWNS as data classes/objects translated from config.js (post-C1, so the tunables are all there); `Utils.kt` (clamp/lerp/fmt/hash/mulberry32 rng); `Iso.kt` (worldToScreen/screenToWorld/depth-key as pure functions of Grid).
3. Fixtures: a dev-only JS console snippet (documented in the kmp/ README, not shipped in the game) exports `{GRID, ROW_HP, sample worldToScreen results for a grid of inputs, fmt() cases, rng(seed) sequences}` as JSON → `kmp/fixtures/`.
4. `jvmTest`: parity tests — Kotlin iso math reproduces the JS fixture outputs within epsilon 1e-9; fmt() string-equal; mulberry32 sequence-equal.
5. `./gradlew test` green = done. Commit (no cache bump).

---

## Confidence statement

- Features (Batch 1): every integration point read and quoted from source at gz-v13; geometry checked for both iPad orientations; edge-case table enumerated. **≥95%.**
- Consolidations C1-C3/C6: read-once constants + comments + one save field. **≥95%.**
- C4/C5: bug confirmed by direct read; visual outcome needs screenshots (hence its own batch). **≥90% pre-screenshot.**
- P0 fixes: per-item confidence recorded in docs/audit-2026-06.md (verifier-gated ≥0.90).
- KMP scaffold: standard Gradle KMP; risk is environment (JDK present?) — check `java -version` first; if no JDK, install via `brew install --cask temurin` (ask Mike if brew prompts) or defer Batch 4 with a note.
