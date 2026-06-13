# Godzilla Smash — Feedback Research (2026-06-13, post-gz-v14 playtest)

7-agent workflow (4 research → 2 adversarial lenses → synthesis, run wf_60ad6a93-5f1) on Mike's two gz-v14 notes. Respawn dir conf 0.86, parity conf 0.88 — both <0.97, residual is FEEL (needs device playtest) + one design fork (off-screen respawn gate). Drives the gz-v15 respawn unit + a v16 desktop-parity unit.

## RESPAWN / DENSITY (Mike: both levers)

**Slower respawn (config):** Two-number Config edit at js/config.js:80 — RESPAWN.RUBBLE_MS 2800 -> 4500, RUBBLE_PER_TIER 150 -> 250 (leave CRUMBLE_MS 550 and RISE_MS 700). The destroy->respawn formula at world.js:653 already reads `RESPAWN.RUBBLE_MS + b.tier * RESPAWN.RUBBLE_PER_TIER` verbatim, so this is zero new code. Resulting full cycle (crumble+rubble+rise): tier0 ~5.75s, tier9 (mid) ~8.0s, tier18 ~10.25s — squarely in the documented 'meaningful but not empty' band (genre target 4-8s for the bread-and-butter mid tiers, with the deep-tier tail acceptable because those rows are rarely camped). Rationale: a moderate bump adds the 'palette-cleanser' downtime the level-design literature endorses without over-correcting into a dead map. Watch-item: COMBO.WINDOW_MS=3250 (config.js:40) is now SHORTER than RUBBLE_MS=4500, so a combo no longer survives sitting on a single freshly-flattened block — which is FINE and on-purpose: it nudges the player off the rubble to keep the chain alive. Verified 2800<3250 today flips to 4500>3250 after the change; re-confirm combo feel in a playtest.

**Fewer structures (config):** Two-number Config edit at js/config.js:21 — LAYOUT.street 2 -> 3, LAYOUT.streetW 3 -> 4. Verified by replaying the spawn loop (world.js derives pcol=blockW+streetW, prow=blockD+street; skip-tests at L247/L249): generic structures drop 270 -> 192 (-28.9%), block coverage 22.2% -> 15.8% (so ~84% non-block area; do NOT cite '~46% street area', that figure in the research draft is wrong). KEEP LAYOUT.tierRows:3 — tier=floor(row/period) at world.js:69-70 is fully decoupled from street width, so the HP/payout ladder (ROW_HP, world.js:71) is untouched and the change is income-neutral by construction. Two caveats from the verification pass: (1) the cited Strong Towns source actually emphasizes SMALLER BLOCKS over wider streets as the stronger walkability lever, so if Mike wants maximum movement-per-area the complementary/alternative knob is blockW/blockD 2 -> 1 (also a config-only edit) — wider streets is still directionally valid and lower-risk (clean block edges, long sightline runways) but is the weaker of the two levers per the source. (2) Hold a FLOOR of ~190-213 total structures (192 generic + ~21 specials); do not cut below ~160. Going sparser would require a NEW 0.85 spawn-probability gate in world.js placeBuilding (~L157) that MUST roll from the seeded per-cell rng (Utils.rng), not Math.random(), or the city changes every reload and breaks the WORLD_SEED determinism contract — flag this as new code, not a tweak.

**Recommendation:** Ship BOTH config edits together, but the load-bearing fix is the off-screen respawn GATE, not either number alone. The slower timer and fewer structures both help, yet neither stops camping: with respawn an in-place pure timer (world.js:652-657 has no position check), a player who flattens a block can simply wait the longer timer out standing on the rubble — a slower timer just makes camping slower, not impossible. The change that actually delivers Mike's stated goal ('must roam to find fresh targets') is to GATE the rubble->respawning transition on the building being off-screen / >~1.5 screen-widths from the kaiju (EarthBound/Wario-World/S.T.A.L.K.E.R. off-screen-respawn pattern; Smashy City's endless-city-ahead): the block you just leveled stays flat while you stand on it, targets quietly refill behind you as you move on. This is feasible with no new infra — it slots into the single `if` at world.js:653; player position is reachable (input.js exposes G._activeUnit.pos, and iso.js:167 already has a camera-cull AABB you can reuse for the in-frame test). Guard it (skip-gate-if-no-player) to preserve world.js headless-testability. RECOMMENDED ORDER for our dense city: (a) the off-screen gate is the movement driver — ship it; (b) RUBBLE_MS 4500 / PER_TIER 250 as the low-risk complement; (c) the street-widening density cut (street3/streetW4) is the cleanest way to honor 'fewer structures' since it gently slows income via fewer simultaneous payouts while keeping the smash-walk-smash loop tight (crossing a widened avenue is ~0.6-0.9s at 4.64 tiles/s, well inside the combo window). With 200+ structures we have the density budget to run the gate AND never go dry — best of both: no dead zones AND no farm-in-place. The off-screen gate is the only NEW code; everything else is config.

## DESKTOP/WEB PARITY (Mike: research decides)

**Approach:** Hybrid: a persistent low-profile desktop KEY LEGEND for discoverability PLUS the existing Nova ring surfaced on desktop — NOT clickable replicas of the touch discs. Detect the active input PER EVENT via e.pointerType (touch/pen -> draw the touch discs; mouse/keyboard -> draw the legend), and seed the first frame from a CSS media query so a never-touched mouse user is NEVER left with a blank screen. Why: rafgraph/detect-it (the de-facto web standard) is explicit that media-query classification happens ONCE at import with no listeners — a one-time flag like our Input.isTouch cannot represent a hybrid iPad-with-trackpad or a mouse-only session, so live input must be read off pointerType per event; UE5 CommonUI and Unity's Input System codify the same 'swap prompts on last-used device' answer. A legend (not on-screen thumbsticks) is the platform-native affordance MDN and Apple HIG endorse — a stationary virtual stick fights a mouse user's natural click-to-target. Lowest-risk MVP: ALWAYS show the legend, and ADD the touch discs once a touch/pen pointer is seen — this removes the blank-screen failure mode entirely without betting on detection.

**Desktop controls:** Render a small Canvas2D legend strip in a HUD corner (same drawing idiom as drawComboPip at render.js:538), or a DOM strip inside the existing #hud. List each action with its REAL key, mirroring the touch discs: 'Hold SPACE / click — Atomic Breath', 'SHIFT or J — Jump', 'F — Nova Slam' (only after Economy.finisherOwned, matching the disc's ownership gate at render.js:622). CRITICAL CORRECTION verified in code: there is NO KeyB handler in input.js (onKeyDown L533-557 binds only WASD/arrows, Space, Shift/J, F) — the Shop is a DOM button only (index.html #shop-btn). So do NOT print 'B Shop' in the legend. Either (a) list 'Shop button, top-right' for the shop line, or (b) add a real KeyB case to onKeyDown that toggles the DOM #shop before advertising it. The legend is informational (not clickable); mouse clicks continue to drive aim+attack exactly as today (input.js:388-397). The actions already WORK on desktop — the legend just makes the hidden Space/Shift/J/F verbs discoverable, which is the entire substance of Mike's note (2).

**Nova on desktop:** This is the sharpest parity break and the literal cause of 'on PC I can't see how to use the upgrades': drawFinisher (render.js:691) already renders the violet disc + the hot charge-fill arc + the gray depleting cooldown arc, but it is only reached through drawTouchControls, which early-returns on desktop at render.js:588 — so the F-charge (input.js KeyF, L550-572; player.chargeT/finisherCd live on the unit every frame, entities.js:865-866) has ZERO on-screen feedback on PC. Fix: draw a desktop Nova pip whenever Economy.finisherOwned (economy.js:885), regardless of isTouch, by factoring the early-return so the Nova path runs on desktop and calling drawFinisher with the SAME player.chargeT / player.finisherCd already passed on touch (render.js:626-628) — direct reuse, no new state. Two desktop deltas: (1) replace the 'NOVA' label (render.js:721) with a prominent 'F' (or 'NOVA' + small 'F' badge) since the keybind is the discoverability hook on keyboard; (2) anchor it near Input.finisherBtn.x/.y (computed every refreshSize by layoutSmash, input.js:196-199, regardless of input mode) so it groups with the action controls. FINISHER.COOLDOWN_S=8 (config.js:73) matches the existing ring math. Add a one-frame ready-flash when cd hits 0, plus a one-shot 'Press F — Nova Slam' hint the first frame Nova is owned-and-ready (small new hasShownNovaHint flag; trigger fully observable from finisherOwned && finisherCd<=0), then collapse to the steady pip. Do NOT give the passive attack-speed/move-speed tracks any HUD pip — the DOM shop is the correct surface; at most a one-time purchase-confirmation toast (they auto-apply, nothing to monitor).

**Implementation:** (1) render.js:588 — replace the hard `if (Input.isTouch === false) return;` with input-mode branching. Add an Input.currentInput field; seed it at load from `window.matchMedia('(any-pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches` (coarse-only = touch, else = pointer/keyboard so controls are visible on frame 1). (2) input.js — set Input.currentInput per event in the existing onPointerDown (L331) and onPointerMove (L400) handlers (they already read e.pointerType / e.button) and on any mapped keydown (onKeyDown L533). KEEP Input.isTouch for the touch INPUT path (it gates the multi-thumb branch at input.js:337) but stop using `=== false` as the draw-nothing gate. (3) In drawTouchControls: when currentInput is touch -> draw the existing discs; otherwise -> draw the legend + the desktop Nova pip via the drawFinisher reuse above. The MVP can ship without the per-event swap: always draw the legend, add discs once isTouch flips — that alone fixes the blank-desktop and the invisible-Nova problems. OPTIONAL, separate slightly-larger sub-task: making the desktop Nova pip mouse-CLICKABLE (mouse-down=charge, mouse-up=release) needs a new hit-test in the desktop pointerdown branch (input.js:388-397, currently hardwired to aim+attack via mouseAtkPointerId) wired to the existing _intent.charge / chargeRelease plumbing (input.js:708-709, entities.js:972-981). Feasible but not free reuse — keyboard F already works fully, so the clickable pip is a parity nicety, not a blocker.

---

## Respawn pacing vs. city density

Mike's note (1) gives two directions — *slower respawns* or *fewer structures*. Both are directionally fine, but the research + two-lens verification converge on a sharper conclusion: **neither timer nor count alone stops camping.** The high-leverage lever for roaming is *where* buildings respawn, not just *when*.

### Branch A — Slower respawn (config-only)

A two-number edit at `js/config.js:80`:

```
RESPAWN: { CRUMBLE_MS: 550, RUBBLE_MS: 4500, RUBBLE_PER_TIER: 250, RISE_MS: 700 }
```

The destroy→respawn math at `world.js:653` already reads `RESPAWN.RUBBLE_MS + b.tier * RESPAWN.RUBBLE_PER_TIER` verbatim, so this is **zero new code**. Resulting full cycle: **tier0 ~5.75s, mid (tier9) ~8.0s, tier18 ~10.25s** — squarely in the documented "meaningful but not empty" band. The level-design literature endorses *moderate* downtime as a palette-cleanser but warns that over-long delays make a map "empty and boring," so this is a deliberate small bump, not a wholesale slow-down.

**Watch-item:** `COMBO.WINDOW_MS` is 3250 (`config.js:40`). Today `RUBBLE_MS` (2800) < window, so a combo survives sitting on one block. After the bump, 4500 > 3250 — a chain no longer survives camping a single freshly-flattened block. That is on-purpose: it nudges the player to move to keep the chain alive. Re-confirm the feel in a playtest.

### Branch B — Fewer structures (config-only)

A two-number edit at `js/config.js:21`:

```
LAYOUT: { blockW: 2, blockD: 2, street: 3, streetW: 4, bands: 19, tierRows: 3 }
```

Replaying the spawn loop confirms generic structures drop **270 → 192 (−28.9%)**, block coverage **22.2% → 15.8%** (≈84% non-block area). Keep `tierRows:3`: `tier = floor(row / period)` at `world.js:69-70` is fully decoupled from street width, so the HP/payout ladder (`ROW_HP`, `world.js:71`) is untouched — **the cut is income-neutral by construction** and can ship independently of any economy retune. Fewer simultaneous payouts gently *slows* income, which is exactly the "slower, more movement" feel Mike asked for, achieved through layout rather than nerfing numbers.

Two corrections surfaced in verification:

- The "~46% street area" figure in the research draft is **wrong** — do not cite it. The verified numbers are 15.8% block coverage / ~84% non-block area.
- The load-bearing Strong Towns source actually treats **smaller blocks** as the stronger walkability lever, not wider streets. Wider streets is still valid and lower-risk (clean block edges, long sightline runways), but if Mike wants maximum movement-per-area, the alternative/complementary knob is `blockW/blockD 2 → 1` (also config-only).

**Floor:** hold ~190–213 total structures (192 generic + ~21 specials). Do not cut below ~160 — the genre design problem is *never* "too few targets," it is keeping fresh targets in the smash arc while requiring travel. Going sparser needs a **new** 0.85 spawn-probability gate in `world.js placeBuilding` that must roll from the seeded per-cell `Utils.rng` (not `Math.random()`) or it breaks the `WORLD_SEED` determinism contract — that is new code, not a tweak.

### Recommendation — which better drives movement in OUR dense city

**Ship both config edits, but the real fix is an off-screen respawn GATE — and that is the only new code.**

Respawn today is a pure in-place timer: `world.js:652-657` flips rubble→respawning with no position check, so a player who flattens a block can simply wait the (now longer) timer out standing on the rubble. A slower timer makes camping *slower*, not impossible. What is unanimously documented to drive roaming is off-screen / out-of-sight respawn (EarthBound respawns a short distance off-screen, Wario World refills once the spawn point leaves frame, S.T.A.L.K.E.R. spawns at the map edge so cleared ground stays cleared, Smashy City pulls you forward with an endless city *ahead*).

Gate the rubble→respawning transition on the building being **off-screen / >~1.5 screen-widths from the kaiju**: the block you just leveled stays flat while you stand on it, targets quietly refill behind you as you move on. This slots into the single `if` at `world.js:653`; player position is reachable (`G._activeUnit.pos`), and `iso.js:167` already exposes a camera-cull AABB to reuse for the in-frame test. Guard it (skip-gate-if-no-player) to preserve `world.js` headless-testability. With 200+ structures we have the density budget to run the gate AND never go dry.

Order: (a) off-screen gate — the movement driver; (b) `RUBBLE_MS 4500 / PER_TIER 250` — low-risk complement; (c) street-widening density cut — honors "fewer structures" while keeping the smash-walk-smash loop tight (a widened avenue crosses in ~0.6–0.9s at base 4.64 tiles/s, well inside the combo window).

---

## Cross-platform parity (note 2)

### Root cause

`render.js:588` is literally `if (Input.isTouch === false) return;`. On desktop `Input.isTouch` starts false and only flips true on a touch/pen `pointerdown` (`input.js:332`), as a one-shot latch with no path back and no hybrid representation. A mouse-only player therefore sees **zero on-screen controls** and no hint that Space / left-click-hold / Shift / J / F exist. The actions all *work* (mouse clicks drive aim+attack at `input.js:388-397`) — they are simply undiscoverable. The sharpest break: `drawFinisher` (the Nova charge/cooldown ring, `render.js:691`) is reached *only* through the touch path, so the one active bought ability has rich feedback on touch and **none** on desktop — the literal cause of "on PC I can't see how to use the upgrades."

### Recommended approach — hybrid: key legend + surfaced Nova ring (not clickable disc replicas)

Detect the active input *per event* via `e.pointerType` and render the matching affordance, seeding the first frame from a CSS media query so a never-touched mouse user is never blank. `rafgraph/detect-it` (the de-facto web standard) is explicit that media-query classification runs once at import with no listeners — a one-time flag cannot represent a hybrid device, so live input must be read off `pointerType`; UE5 CommonUI and Unity's Input System codify the same "swap prompts on last-used device." A **legend**, not on-screen thumbsticks, is the platform-native affordance MDN and Apple HIG endorse — a stationary virtual stick fights a mouse user's natural click-to-target.

**Lowest-risk MVP:** always show the legend, and *add* the touch discs once a touch/pen pointer is seen. This removes the blank-screen failure mode entirely without betting on detection.

### Desktop control plan

A small Canvas2D legend strip in a HUD corner (same idiom as `drawComboPip`, `render.js:538`) or a DOM strip in `#hud`, mirroring the discs:

- **Hold SPACE / click** — Atomic Breath
- **SHIFT or J** — Jump
- **F** — Nova Slam (only after `Economy.finisherOwned`, matching `render.js:622`)

**Correction (verified in code):** there is **no `KeyB` handler** — `onKeyDown` (`input.js:533-557`) binds only WASD/arrows, Space, Shift/J, F. The Shop is a DOM button only. **Do not print "B Shop"** in the legend. Either list "Shop button, top-right" for the shop line, or add a real `KeyB` case that toggles the DOM `#shop` before advertising it.

### Nova on desktop

Draw a desktop Nova pip whenever `Economy.finisherOwned` (`economy.js:885`), regardless of `isTouch`, by factoring the early-return so the Nova path runs on desktop and calling `drawFinisher` with the same `player.chargeT` / `player.finisherCd` already passed on touch (`render.js:626-628`) — direct reuse, no new state (both live on the unit every frame, `entities.js:865-866`). Two deltas: (1) swap the `'NOVA'` label (`render.js:721`) for a prominent **`F`**, since the keybind is the discoverability hook on keyboard; (2) anchor near `Input.finisherBtn.x/.y` (computed every refresh by `layoutSmash`, `input.js:196-199`, regardless of input mode). Add a one-frame ready-flash when `cd` hits 0, and a one-shot "Press F — Nova Slam" hint the first frame Nova is owned-and-ready, then collapse to the steady pip.

**Do not** give passive attack-speed / move-speed tracks a HUD pip — they auto-apply and need no monitoring; the DOM shop is the correct surface, with at most a one-time purchase-confirmation toast.

### Implementation given our architecture

1. `render.js:588` — replace the hard `if (Input.isTouch === false) return;` with input-mode branching. Add `Input.currentInput`, seeded at load from `matchMedia('(any-pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches`.
2. `input.js` — set `currentInput` per event in the existing `onPointerDown` (L331) and `onPointerMove` (L400) handlers (they already read `e.pointerType`/`e.button`) and on any mapped keydown (`onKeyDown` L533). Keep `Input.isTouch` for the touch *input* path (it gates the multi-thumb branch at `input.js:337`); just stop using it as the draw-nothing gate.
3. In `drawTouchControls`: touch → existing discs; otherwise → legend + desktop Nova pip via the `drawFinisher` reuse.

The MVP can ship without the per-event swap. A *separate, slightly larger* sub-task makes the desktop Nova pip mouse-clickable (mouse-down=charge / up=release): it needs a new hit-test in the desktop `pointerdown` branch (`input.js:388-397`, currently hardwired to aim+attack via `mouseAtkPointerId`) wired to the existing `_intent.charge` / `chargeRelease` plumbing (`input.js:708-709`, `entities.js:972-981`). Keyboard F already works fully, so the clickable pip is a parity nicety, not a blocker.

---

## Fallbacks (claims that did not clear ≥0.97, with best available guidance)

No claim reached ≥0.97 — incremental/level-design balance is inherently judgment-driven and several specifics were corrected by the verification lenses. The strongest, most code-grounded claims (income-neutrality of the density cut, the desktop-affordance diagnosis) sit at ~0.85–0.90 and are safe to act on. Caveats to carry forward:

- **Street-area figure:** the "~46% street area" in the research draft is incorrect; the verified figures are 15.8% block coverage / ~84% non-block area. Cite the verified numbers only.
- **Stronger walkability lever:** the cited urban-grid source favors smaller blocks over wider streets. Treat wider streets as the lower-risk first move and `blockW/blockD 2 → 1` as the stronger (also config-only) alternative if movement still feels insufficient after playtest.
- **Off-screen respawn gate:** the *principle* transfers cleanly from EarthBound / Wario World / Smashy City, but the S.T.A.L.K.E.R. comparable operates on a 24–48 in-game-hour timescale far from an autofire incremental — lean on the closer comparables. This is the one piece requiring new code; ship behind a no-player guard and verify in playtest.
- **Shop keybind:** `B` is **not** bound. Any legend or "Press B" copy is wrong until a `KeyB` handler is added. Verify-then-advertise.
- **Clickable desktop Nova pip:** feasible but not free reuse (new hit-test in the hardwired desktop click path). Ship the *visible* pip first; treat clickability as a follow-up.
- **One-shot Nova hint timing/duration:** a subjective polish detail to tune in playtest, not a correctness claim.