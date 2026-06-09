# Godzilla Smash v3 — Build Contract (data-driven refactor + full content)

Goal: turn bespoke per-form/per-building CODE into DATA + generic interpreters, then add all new content as data. **Steps A1–A4 are behavior-preserving** (game must stay identical). Vanilla JS, Canvas2D, no build, classic `<script>` on `window.GAME`, instant-load PWA. Read the existing `js/*.js` before editing; KEEP all working systems (FX pool, `bakeOrGet`/cache key, `FACING_MAP`, locomotion/collision, iso projection, audio).

## 0. Economy rule (IMPORTANT — universal claws)
`Stronger Claws` (×2/level) now multiplies EVERY form: `attackPower() = activeForm.base × CLAWS_MULT^clawsLevel`. Each form has a flat `base`. Godzilla forms `base` = `START_ATTACK(6) × evoMult` → **6, 48, 240, 3000, 18000**. Titan forms `base` = the damage values below. (This keeps Titans relevant late-game and is the balanced choice.)

## 1. Unified schema — `Config.FORMS` (replaces EVOLUTIONS + TITANS)
```
{ id, name, label, family:'wyrm'|'mothra'|'ghidorah'|'rodan'|'mecha',
  archetype:'wyrm'|'flyer'|'hydra'|'mecha', tier, base, cost,
  palette:{ skin,skinDark,skinLight, plate,plateEdge,plateGlow, breath:[c1,c2],breathGlow, eye, aura, fxMotes:'heat'|'pink'|'cosmic'|null },
  shape:{ ...archetype params... },
  attack:{ kind:'beam'|'bolts'|'cloud'|'dive'|'volley', hits?, aoeRadius?, dot?:{frac,ticks,intervalMs}, cooldown, color?, shake? } }
```
`palette` = today's EVOLUTIONS palette shape (reuse). Keep Godzilla's 5 existing palettes/params verbatim (behavior-preserving). Titan palettes: invent in the existing style per the colour hints below.

### Archetype shape params
- **wyrm** (Godzilla): `{plates:9, tail:1.0, bulk:1.0}` — current `buildBody` parameterized.
- **flyer** (Mothra, Rodan): `{wingSpan, wingStyle:'moth'|'pteranodon', plates:0, bulk}`.
- **hydra** (Ghidorah): `{heads:3, neckSpread, wingSpan, mech:false|true, tails:2}`.
- **mecha** (Mechagodzilla): `{plates, antennae:1..2, panel:true}` (hard panels + seam lines + rivets + specular edge instead of skin gradient).

### The 20 forms (id · family/archetype · tier · base damage · cost · colour hint)
**Godzilla (wyrm)** — keep existing 5: gz2014/burning/gvk/gxk/supernova · base 6/48/240/3000/18000 · cost 0/50k/200k/12M/100M.
**Mothra (flyer)**: mothra_gvm t1 base 1.5e6 cost 3.5e9 (cyan body, blue glow wings); mothra_gxk t2 3e6 8e9 (cyan+orange tinge); mothra_supernova t3 7.6e6 18e9 (white-gold radiant). attack `kind:'cloud'` dot{frac:.06,ticks:10,intervalMs:300} cooldown .46; fxMotes 'pink'.
**King Ghidorah (hydra, heads:3)**: ghidorah t1 350000 1e9 (gold, purple-glow); king_ghidorah t2 750000 2.5e9 (richer gold); mecha_ghidorah t3 900000 5e9 (`shape.mech:true`, steel+gold, blue glow); grand_king t4 1.2e6 10e9 (bright gold); void_ghidorah t5 2.6e6 22e9 (dark body, blue-flame, fxMotes 'cosmic'). attack `kind:'bolts'` hits:3 color:'eye' cooldown .5.
**Rodan (flyer, pteranodon)**: rodan t1 4e6 7e9 (red-brown); rodan_mv t2 6.5e6 16e9 (darker red); rodan_fire t3 12e6 36e9 (magma glow, fxMotes 'heat'). attack `kind:'dive'` aoeRadius:2.6 shake:11 cooldown .7.
**Mechagodzilla (mecha)** — ASCENDING: mecha_1 t1 9e6 10e9 (steel/silver); mecha_2 t2 13.9e6 22e9 (blue-steel); mecha_3 t3 15e6 48e9 (black+red); super_mecha t4 16.8e6 100e9 (gold+steel). attack `kind:'volley'` hits:5..6 cooldown .42.

## 2. Module APIs (NEW files attach to window.GAME)
- **`js/archetypes.js` → `GAME.Archetypes`**: `build(ctx,w,h, pal, shape, base, frame, fsm)` dispatches on `shape.archetype` → `buildWyrm/buildFlyer/buildHydra/buildMecha`. `buildWyrm` = today's `entities.js buildBody` moved here + parameterized by `shape`. Reuse the shared helpers' STYLE (gradient-AO torso, rim light, baked plate glow, contact-ellipse). Flyer = light body + 2 wing quads flapped off `walkPhase`, no dorsal plates. Hydra = wyrm body + `heads` necks (loop `drawHead`) + fan tail; `mech:true` adds steel paneling. Mecha = wyrm silhouette with flat panels + seam strokes + rivet dots + a hard specular edge + laser eye.
- **`js/sprites_special.js` → `GAME.SpriteBuilders`**: `{ statue, pyramid, field, sandpile, plane, houseTint }` each `(ctx,w,h, params)` drawing an iso prism/shape. Statue=tall obelisk + torch; pyramid=triangular prism sand-coloured; field=flat green rect + yard lines; sandpile=low mound; plane=small iso aircraft; houseTint=recolour the generic house prism by `params.tint` ('gold'|'rainbow'|'diamond') with a sheen.
- **`js/world_events.js` → `GAME.Env`**: `update(dtMs)` advances a 0..1 clock (cycle `Config.ENV.dayLengthMs` ~120000); `phase()` → interpolated `{sky:[c1,c2], tint:'rgba()', sun?, moon?, ambient}`; `announce(text)` → drives the `#toast`. Wire `Env.update` into `game.js` loop; `render.js` reads `phase()`.

## 3. Per-file refactor (one owner each)
- **config.js**: `FORMS` (above) + `CLAWS` (keep ×2, base cost curve) + `SPECIALS` + `RARE_SPAWNS` + `ENV` + `JUMP` + `ROW_HP` rescaled so tier 18 = **1e9** (smoothed ~2.3×/tier: 10,28,78,215,600,1650,4500,12500,34000,95000,260000,720000,2e6,5.5e6,15e6,42e6,115e6,340e6,1e9).
- **entities.js**: move `buildBody`→`GAME.Archetypes.buildWyrm`; `buildBody` now calls `GAME.Archetypes.build(...,shape,...)` (read `shape` from the active form). Add `ATTACK_KINDS={beam:fireBeam,bolts:fireBolts,cloud:fireCloud,dive:fireDive,volley:fireVolley}` (salvage the 5 `sigX` bodies); `startAttack`/`targetCount`/`attackCooldownFor` read `form.attack`; delete `if(kind===…)` chains. `MOTE_FX={heat,pink,cosmic}` keyed by `palette.fxMotes`. Add JUMP: `pos.z` kinematics (`Config.JUMP={vEscape:8.5,gravity:26}`) on `intent.jump`; while airborne, attacks may target `flying` planes. Add a ground contact-shadow draw (or expose so render draws it).
- **economy.js**: `attackPower`/`activeUnit`/shop on `Config.FORMS` grouped by `family` (universal claws per §0). Save → `godzilla-save-v3` FRESH (no migration; default money 0, owned `['gz2014']`, active `'gz2014'`). Shop: Evolutions tab = wyrm forms; Characters tab = the 4 Titan families (buy base to unlock the character, then buy each evolution; switch to any owned form).
- **assets.js**: `buildingSprite(b)` keyed by `b.sprite||'generic'` + tier + footprint + stage (+ tintShift) via a `SPRITE_BUILDERS` lookup (generic prism = today's path, unchanged); special sprites delegate to `GAME.SpriteBuilders`.
- **world.js**: `makeBuilding(col,row,special?)` — generic default unchanged; `special` overlay sets hp/footprint/height/sprite/tint/flying/altitude from `Config.SPECIALS`. Place Statue (top-middle), pyramids+sand (sides), football field (somewhere) deterministically. `updateFlyers(dt)` moves airplanes + wraps; rare-spawn roll in the respawn→standing transition fires `Config.RARE_SPAWNS` → overlay golden/rainbow/diamond + `Env.announce`.
- **render.js**: `drawBuilding(b)`→`A.buildingSprite(b)`; day/night sky from `Env.phase()` + one full-screen ambient-tint rect + sun/moon disc; flyer depth via `b.altitude`→`wz`; draw the ground contact-shadow pass for kaiju (and planes). KEEP the dpr/blit/anchor fixes already in place.
- **input.js**: add a `jumpLatched` one-shot (key e.g. Shift/J + a touch jump disc) → `intent.jump`.
- **index.html**: add `<script>` tags for `js/archetypes.js`, `js/sprites_special.js`, `js/world_events.js` in dependency order (archetypes after assets/before entities; world_events after world/before render; all before game.js).

## 4. Data tables
```
Config.SPECIALS = {
  statue:{hp:5e8, footprint:{w:2,h:2}, height:7, sprite:'statue', place:'topmid', unique:true},
  pyramid:{hp:2e8, footprint:{w:2,h:2}, height:3.5, sprite:'pyramid', place:'sides', count:4},
  sandpile:{hp:5e4, footprint:{w:1,h:1}, height:0.5, sprite:'sandpile', place:'sides', scatter:10},
  football:{hp:6.5e4, footprint:{w:3,h:2}, height:0.2, sprite:'field', place:'mid'},
  airplane:{hp:500, footprint:{w:1,h:1}, sprite:'plane', flying:true, altitude:6.5, speed:1.4, count:5},
  golden:{sprite:'house', tint:'gold', hpMult:3, announce:'A golden house has been generated!'},
  rainbow:{sprite:'house', tint:'rainbow', hpMult:5, announce:'A rainbow house has been generated!'},
  diamond:{sprite:'house', tint:'diamond', hpMult:10, announce:'A diamond house has been generated!'},
};
Config.RARE_SPAWNS = [ {special:'golden',chance:1/900}, {special:'rainbow',chance:1/4000}, {special:'diamond',chance:1/12000} ];
Config.ENV = { dayLengthMs:120000, day:{sky:['#1a3a6e','#4f8fe0'], sun:'#fff3c0', tint:'rgba(255,250,220,0)', ambient:1}, night:{sky:['#05070f','#142a55'], moon:'#cfe0ff', tint:'rgba(18,28,66,0.30)', ambient:0.6} };
Config.JUMP = { vEscape:8.5, gravity:26 };
```

## 5. Verification (each step, behavior-preserving first)
`node --check` all; preview: clear SW+caches, reload 1024×768, console clean. After A-steps: a Godzilla + each existing Titan must attack/damage/bank EXACTLY as before. After content: forms render distinctly, specials/rare/planes spawn, day/night cross-fades, jump reaches planes. Deploy bumps SW cache to `gz-v4`.
