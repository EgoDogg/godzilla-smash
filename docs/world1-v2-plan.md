# Godzilla Smash — World 1 v2 · Master Build Blueprint

Good — the v1 reality is now clear. Key facts that resolve the conflicts between the 6 designs:

- **`game.js` is 596 lines (31KB), flat, NO `GAME` namespace** — uses bare `const CONFIG`, `const EVOLUTIONS`, `const state`, `function hitBuilding(b,px,py)`, `function attackPower()`, `function shade(hex,f)`, `function loop(ts)`. The controls/perf authors were right; the iso/entities authors were wrong to assume `GAME` exists. EVOLUTIONS exists but with `body` color keys, not the rich `skin/plate/...` schema entities.js assumed.
- **`index.html`** canvas is `#scene` (not `#scene` vs `#scene` — confirmed `#scene`), shop modal `#shop` with 4 tabs + `.shop-item` CSS already present, viewport meta already has `user-scalable=no, viewport-fit=cover` but is missing `maximum-scale` is present. PWA (`sw.js`, `manifest.json`, icons) exists.
- Tile-size conflict (96/48 vs 64/32) and path conflict (`iso.js` vs `js/iso.js`) are mine to resolve as lead.

I have everything I need. Producing the master blueprint.

---

# GODZILLA SMASH — WORLD 1 v2 · MASTER BUILD BLUEPRINT

v1 (`game.js`, 596 lines, flat, single-strip tap game) is **deleted**, not refactored. v2 is greenfield on one `window.GAME` namespace. All paths root at `/Users/MGitk/Projects/godzilla-smash/`; new code lives in `js/`. Reused verbatim: `index.html` shell, `#scene` canvas, `#shop` modal + `.shop-item` CSS, `manifest.json`, icons, `sw.js`.

## 1 · Architecture + Module File List (load order)

Single global, each file `window.GAME = window.GAME || {};` then attaches its export. Loaded in `index.html` as classic `<script>` (no `defer`, order is the dependency order). **`js/` prefix wins** (controls/perf convention) over bare `iso.js`.

1. **`js/config.js` → `GAME.Config`** — ROW_HP ladder, all costs, EVOLUTIONS, TITANS, tuning constants, `CACHE_VERSION`, `saveKey`. Pure data, zero deps.
2. **`js/utils.js` → `GAME.Utils`** — `fmt()`, seeded RNG/`hash`, `clamp/lerp/clampLen`, `shade()` (ported from v1), `safeSave/safeLoad`, scratch-vector pool. Deps: Config.
3. **`js/iso.js` → `GAME.iso` + `GAME.camera`** — projection, inverse, `pickTile`, depth sort, camera follow/shake/cull, `apply(ctx)`. Deps: Utils.
4. **`js/assets.js` → `GAME.Assets`** — procedural offscreen caches (ground diamond, building sprite per `tier|w|stage`, kaiju/titan sprite-sheets), `get(key)`, LRU evict. Deps: Config, Utils, iso.
5. **`js/audio.js` → `GAME.Audio`** — Web Audio graph, gesture unlock, procedural SFX (`crumble(tier)`, evolve, recruit), mute. Deps: Config.
6. **`js/economy.js` → `GAME.Economy`** — money, claws, evolutions, titans, active-unit power, combo, save v2, shop DOM. Deps: Config, Utils, Audio.
7. **`js/world.js` → `GAME.World`** — 19×12 grid, `spawnCity`, building lifecycle, `hitBuilding`, `getBuildingAt`, collision footprints, frontier/`maxReachedRow`. Deps: Config, Utils, iso, Economy, Assets, Audio, FX.
8. **`js/entities.js` → `GAME.Kaiju` + `GAME.FX`** — kaiju/titan FSM + iso draw, signature attacks via `dealDamage`→`World.hitBuilding`; **`GAME.FX`** (debris/shake/particle pool) lives here so `Audio`/`World` can call it. Deps: Config, Utils, iso, Assets, Economy, Audio.
8.5 **`js/input.js` → `GAME.Input`** — Pointer/keyboard → one intent struct; joystick + SMASH; targeting. Deps: iso, World (for footprint hit-test). Load after world/entities, before render.
9. **`js/render.js` → `GAME.Render`** — per-frame: clear, parallax, `camera.apply`, ground blit, z-sorted entity blits, FX, HUD-canvas overlay (combo pip, damage text). Deps: World, Kaiju, Assets, iso, Utils.
10. **`js/ui.js` → `GAME.UI`** — DOM HUD (money/depth), shop tabs glue to Economy, pause/mute, World-2 stub, dirty-flag updates. Deps: Economy, World.
11. **`js/game.js` → `GAME.Main`** — rAF loop, `dt` clamp + fixed-step accumulator, blur/visibility pause, resize/DPR + cache rebuild, boot wiring. Deps: all. **Loaded last.** `sw.js` precaches files 1–11 + shell, keyed by `CACHE_VERSION`.

**Circular-dep resolution:** `World.hitBuilding` calls `Economy.bankDestroy` + `FX.debris`; `entities.js` (which owns FX) loads before `world.js`, and `Economy` before both — clean. `Input` hit-tests `World` footprints, so it loads after `World`.

## 2 · Global API Contract (signatures, conflicts resolved)

```js
GAME.Config = { ROW_HP[], CLAWS_*, EVOLUTIONS[], TITANS[], RESPAWN_MS, COMBO_*, WORLD2_COST, GRID, CACHE_VERSION, saveKey }

GAME.iso.worldToScreen(wx,wy,wz) -> {x,y}     // fresh obj
GAME.iso.worldToScreenInto(wx,wy,wz,out)      // hot-loop, no alloc
GAME.iso.screenToWorld(sx,sy) -> {wx,wy}      // camera-relative, ground plane
GAME.iso.pickTile(clientX,clientY) -> {col,row}|null   // raw pointer → cell
GAME.iso.depthKey(e) -> number
GAME.camera.follow(target,dt); .apply(ctx); .shake(mag); .resize(W,H)

GAME.Economy.attackPower() -> n               // gz: START*evo.mult*2^claws ; titan: base
GAME.Economy.activeUnit() -> {kind,formId|titanId,signature,...}
GAME.Economy.bankDestroy(rowHp) -> payout     // ×comboMult, save, refresh HUD
GAME.Economy.comboMult() -> 1..2 ; .tickCombo(dtMs)
GAME.Economy.clawsCost(); .buyClaws(); .nextEvo(); .buyEvolution()
GAME.Economy.buyTitan(id); .switchChar(id); .buyWorld2(); .canAfford(n)

GAME.World.spawnCity(); .updateBuildings(dt)
GAME.World.hitBuilding(b, rawDamage) -> payout   // SINGLE damage entry point
GAME.World.getBuildingAt(col,row) -> b|null ; .footprintsNear(wx,wy,band) -> [b]
GAME.World.tileToWorld(col,row) -> {wx,wy} ; .maxReachedRow

GAME.Kaiju.create({kind,formId}) -> unit
unit.update(dt,intent); .draw(ctx,sx,sy,scaleBucket); .setForm(id)
unit.startAttack(targets); .facingTo(wx,wy); .bounds(); .pos{wx,wy,z}; .facing
GAME.FX.debris(b); .shake(mag); .spawnDamageText(b,dmg); .update(dt); .draw(ctx)

GAME.Input.init(canvas,camera); .consume() -> intent ; .isTouch ; .facing
// intent = {moveX,moveY, attack:bool, target:{col,row}|null}

GAME.Audio.crumble(tier); .evolve(); .recruit(); .unlock(); .mute(b)
GAME.Render.frame(dt) ; GAME.UI.init(); .refresh(); .openShop(tab)
GAME.Main.boot()
```

**Resolved conflicts:** (a) damage flows through `World.hitBuilding(b, rawDamage)` only — entities' `dealDamage` and economy's `bankDestroy` are *called by* it, never duplicated. (b) `attack` intent is **edge-true one frame**, rate-gated by economy cooldown. (c) **Combo lives in Economy** (single source); HUD pip reads `comboMult()`. (d) `maxReachedRow` persisted in save; both World (movement clamp) and UI (depth readout) read it.

## 3 · Canonical Data Models

```js
Building = { id, col, row, tier,           // tier 0..18 = row index
  hp, maxHp, footprint:{w,h}, height, style, seed,
  state:'standing'|'crumbling'|'rubble'|'respawning', t, shake, hitFlash, dot:null|{perTick,ticks} }

Player(kaiju) = { kind:'gz'|titanId, formId, pos:{wx,wy,z}, vel:{x,y},
  facing:0..7, fsm:'idle'|'walk'|'attack'|'hurt', walkPhase, attackFrame, atkCooldown }

TitanDef = { id, name, cost, base, sig, hitsN?|dot?|aoe?, desc }   // GAME.Config.TITANS

Save v2 = { v:2, money, clawsLevel, evoTier, ownedTitans:[ids], activeChar:'gz'|titanId,
  maxReachedRow, world2Unlocked, muted }   // load() returns false if v!==2 (no v1 migration)
```

EVOLUTIONS schema is **extended**, not the v1 `{body}`: each form gets `{id,name,year,cost,mult, skin,skinDark,skinLight,plate,plateGlow,eye,aura,fx}` so entities.js renders rich forms. Porting v1's single `body` → `skin` is a one-line map.

## 4 · Config / Balance (with pacing math)

```js
ROW_HP = [10,20,65,120,600,1000,10000,20000,65000,120000,
  750000,900000,1300000,6200000,12000000,16800000,24000000,30500000,45000000]; // HP===payout
START_ATTACK=6; CLAWS_MULT=2.0; CLAWS_BASE=12; CLAWS_GROWTH=2.6;  // cost=round(12*2.6^lvl)
RESPAWN: CRUMBLE_MS=550; RUBBLE_MS=6500 + tier*450; RESPAWN_RISE_MS=700;
COMBO_WINDOW_MS=1600; COMBO_STEP=0.04; COMBO_MAX=2.0; PASSIVE=0;
EVOLUTIONS.cost = 0 / 50k / 200k / 12M / 100M ;  mult = 1 / 8 / 40 / 500 / 3000;
TITANS: Ghidorah 1B base 2M (×3 hit) · Mothra 3.5B base 7M (DoT) · Rodan 7B base 16M (AOE) · Mecha 10B base 30M (×5);
WORLD2_COST = 12B;
```

**Rationale:** HP=payout 1:1 + respawn means **attack power, not cash, is the gate** — the moment you can chip a deep row its payout dwarfs every sub-World-2 price. Claws ×2/level with a steep 2.6^level cost makes each level *earned*; START=6 surfaces the shop in <60s (row 1 = 10 HP, 2 smashes). **Frontier ladder:** Evo0+claws5→row4, Evo1+claws5→row6, Evo2+claws10→row10, Evo3+claws10→row13, Evo4+claws10→row16; each Titan one-shots a fresh band (Ghidorah→13, Mothra→14, Rodan→15, Mecha→17). **Time-to-World-2:** greedy lower bound ~2 min; realistic active play **20–40 min**. Combo (×1→×2 over ~1.6s of chaining) is the only juice multiplier — a passive trickle would trivialize deep rows, so it stays 0.

## 5 · Iso Projection + Render Order + Camera

**Tile size resolved: `TILE_W=64, TILE_H=32` (2:1)** — controls/world consensus; 96/48 rejected (fewer rows on iPad screen). `WZ_PX=44` screen-rise per world-Z. World units = tiles: `(wx=col, wy=row 0..18, wz=height above ground)`.

```js
worldToScreen: x=(wx-wy)*32 ;  y=(wx+wy)*16 - wz*44
depthKey(e) = (e.wx+e.wy)*1024 + (e.wz||0)*4 + (e.depthBias||0)   // kaiju +1, ground-FX -1
```

Camera: critically-damped follow `k = 1 - 0.0008^dt`, focus biased low (`sx=W*0.5, sy=H*0.62`) so the corridor ahead shows; clamped to grid AABB (no void), additive shake on stomp/evolve. **Cull** by un-projecting the 4 viewport corners → world AABB padded 2 tiles + tallest building → ~40–60 visible buildings of 228.

**Per-frame order:** clear (device px) → cached parallax skyline (3 layers, x-scrolled by `camera.x`) → `save; camera.apply` → blit cached **ground diamond** (1 `drawImage`) → build visibleList, cache `_dk`, `sort((a,b)=>a._dk-b._dk)`, blit each (buildings = cached sprite per `tier|w|stage`; kaiju = cached body + **live glow overlay**; FX) → `restore` → HUD-canvas (combo pip, damage text) untransformed. `dpr=min(devicePixelRatio,2)`, `setTransform(dpr,...)` once per resize, `imageSmoothingEnabled=false`, **no `shadowBlur` in loop** (bake glows).

## 6 · Controls

**One intent struct, consumed once at top of `update`:** `{moveX,moveY,attack,target}`. **Touch:** floating joystick on first pointerdown in left 55% (base at touch, radius 70, deadzone 0.18); screen-vector **un-projected through iso** so up-screen = forward (+wy). SMASH = fixed bottom-right ≥64px disc, own `pointerId` (two-thumb), rate-gated to cooldown. **Desktop:** WASD/arrows → 8-way digital, **rotated into iso** (W=+wy forward, D=+wx); Space=attack (ignore `e.repeat`); click→`pickTile`→`getBuildingAt`→`target`+attack; pointermove=hover highlight. **Targeting priority:** clicked target if standing → faced building (point 28px ahead along heading) → nearest standing within 40px. **Locomotion (sim):** accel 900, maxSpeed 220 px/s, exp friction 12; **per-axis collision** vs standing footprints (circle r≈18, wall-slide), crumbling/rubble non-solid; movement clamped to `wx∈[0.5,cols-0.5]`, `wy∈[0,maxReachedRow+1.5]`. **Hardening:** Pointer Events `{passive:false}` + `preventDefault` on control pointers only; `touch-action:none`; suppress `contextmenu`/`gesturestart`/`wheel`; listeners on canvas (HUD/shop DOM stays scrollable). `index.html` viewport meta gets `maximum-scale=1` added (currently missing).

## 7 · Art / Animation

All procedural, baked to offscreen, animated by blit. **Kaiju:** 8 facings = author 4 {S,SE,E,NE}, mirror-X for the rest; chunky 3/4 stack drawn back-to-front (tail→far leg→far arm→torso gradient→belly→dorsal ridge→near leg→near arm→head), anchored at foot centroid, flattened-ellipse shadow. **Frames cached** per `(formId/titanId, facing, frame, scaleBucket)`: walk 6 / idle 1 / attack 6 ≈ 52 sprites/form, lazy + LRU(64). **Animated glow NOT baked** — plate shimmer/aura/breath/Supernova heartbeat drawn live via `globalCompositeOperation:'screen'` over the cached body. **5 forms** = palette swap from EVOLUTIONS (2014 charcoal, Burning orange-crack, GvK steel-blue, GxK pink-iridescent, Supernova violet-white); evolve = cache-invalidate + 60-frame skin lerp + white flash. **Signatures:** GZ atomic-breath polyline (1 ahead); Ghidorah 3 gold bolts (`quadraticCurveTo` jitter, 3 buildings); Mothra cyan-powder cone → `dot{perTick,ticks}` ~3s; Rodan z-arc dive → radial shockwave ring AOE + big shake; Mecha 4–6 homing missile dots. **Buildings:** box prisms, 5 style bands (shack→neon-skyscraper), 3 damage stages re-baked only on stage cross. **Crumble FX:** 0.55s sink+tilt+debris burst → rubble → 0.7s rise (scale 0→1). Respect `prefers-reduced-motion` (cut shake/particles).

## 8 · Ordered Build Plan

**Phase A — independent, parallel (pure modules, unit-testable headless, no canvas):**
1. `config.js` — data only. **[INDEP]**
2. `utils.js` — port `shade`, add `fmt/RNG/safe*`. **[INDEP]**
3. `economy.js` — power/combo/save/buy logic + shop DOM against existing `#shop`. **[INDEP, testable via console]**
4. `audio.js` — procedural SFX. **[INDEP]**
5. `iso.js` — projection + camera math; verify with a coord-roundtrip test. **[INDEP]**
6. `world.js` — grid/lifecycle/`hitBuilding`; testable headless (spawn, smash, assert payout/respawn). **[INDEP]**

**Phase B — needs canvas, build sequentially:**
7. `assets.js` — ground + building sprite bakes (visual: confirm one diamond + one prism). **[INTEGRATION]**
8. `entities.js` + `FX` — kaiju draw/FSM; **first on-canvas visual tuning** (silhouette, walk bob, glow). **[INTEGRATION + LIVE TUNE]**
9. `render.js` — wire iso+world+assets+entities into the painter loop; depth-sort correctness. **[INTEGRATION]**
10. `input.js` — joystick/WASD → intent → locomotion+collision feel. **[INTEGRATION]**

**Phase C — assembly + human-driven live tuning (main loop):**
11. `ui.js` — HUD/shop/combo-pip/depth/World-2 stub. **[INTEGRATION]**
12. `game.js` — rAF loop, dt clamp + fixed-step, blur/resize/DPR, boot wiring. **[INTEGRATION]**
13. **Live pacing + feel pass** (camera damping, claws curve, combo window, shake magnitudes, frontier ladder) — **HUMAN-DRIVEN on device (iPad), the explicit "is this too complex?" gate.**
14. PWA finalize: bump `CACHE_VERSION`, precache files 1–11 + shell, verify install + 60fps on iPad. **[INTEGRATION]**

Files 1–6 are six engineers in parallel; 7–10 integrate one-at-a-time behind the canvas; 11–14 are the human-in-the-loop tuning the project's lessons demand (live device > mock confidence). Replace `index.html`'s single `<script src="game.js">` with the 11-file ordered list; delete v1 `game.js`.