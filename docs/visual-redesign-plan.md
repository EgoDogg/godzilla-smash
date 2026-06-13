# Godzilla Smash — Character Visual Redesign Plan

A foundational art-direction specification for a full procedural redesign of all 20 kaiju forms in `js/archetypes.js` + `js/config.js`. This document is the single source of truth for a large later implementation effort. It is exhaustive by design: every form's concrete draw changes, palette tokens, escalation logic, and feasibility guardrail is reproduced in full. No external assets — everything is vector Canvas2D (paths, quadratics, arcs, linear/radial gradients, flat fills) baked once per (form, facing, frame) to offscreen canvases.

The core problem this plan solves (audit §0): **all four archetypes currently share ONE silhouette skeleton.** `buildWyrm`, `buildHydra`, and `buildMecha` draw the *identical* hunched-lizard torso/leg/arm/tail; `buildFlyer` is a 20%-narrower copy of the same biped. At ~40px iso scale, distinctness is dominated by silhouette, and the silhouette is shared — so Godzilla, Ghidorah, and Mechagodzilla read as the same gray lizard with different decals. **Distinctness must come from genuinely different OUTLINES, not surface treatment.** Every family section below exists to break that shared skeleton and to make each 5-form evolution arc escalate the BODY, not just the palette.

---

## 1. House style & shared conventions

These rules govern every form. They exist to make 20 procedurally-drawn kaiju read as one coherent art-directed roster lit by one art team — not five. Where the per-family DESIGNS conflicted with each other, the critique's roster-consistency fixes are folded in here as the authoritative rule.

### 1.1 Key-light model (one light source for the whole roster) [critique]

There is ONE implied key light: a neutral warm-white source above and slightly behind the camera. Consequences, enforced roster-wide:

- **Specular/highlight color is always the same neutral warm-white token.** Define a single shared constant `RIM = 'rgba(255,250,235,A)'`. The wyrm/flyer back-edge rim already uses `rgba(255,250,235,0.22)`/`0.20`; the mecha specular currently uses `pal.skinLight` (L817/L959/L1029) and the ghidorah neck spec in the DESIGNS used a literal `#fffbe0`. **All of these collapse to the one `RIM` token.** [critique] The key light does not change color per form — a gold mecha and a violet wyrm are both lit by the same white light. Replace every `pal.skinLight`-as-specular call in mecha and every literal `#fffbe0` in ghidorah with `RIM`.
- **`pal.skinLight` reverts to its true role:** the *lit local surface color* used inside the AO body gradient (light→skin→dark), NOT the specular edge.

### 1.2 The rim-tier rule (the single most important shared convention) [critique]

There are exactly **two** kinds of edge light in this roster, and no form may invent a third:

1. **House rim (every form, all 20).** A neutral warm-white back-edge stroke, `RIM` at alpha 0.20–0.22, applied to the back/top silhouette edge. This is the baseline figure separation. Unchanged from today's wyrm L125 / flyer L404.
2. **Self-illumination rim (granted ONLY to canonically self-lit forms).** A full-silhouette colored rim, color derived from `pal.aura`, fixed width band ~2.5px, alpha ~0.5. **Granted to exactly these forms: burning, gxk, supernova, rodan_mv, rodan_fire, void_ghidorah, mecha_3.** It is ALWAYS full-silhouette (or, for cost reasons on the heaviest forms, the dominant-mass torso path — see §1.6), never a one-off "ridge-only" flourish.

This rule **overrides** several per-form DESIGNS that asked for bespoke ridge-only colored rims. Specifically: gvk's "thin cyan rim along the ridge top" and gxk's "pink rim along the dorsal ridge" are **re-spec'd** — gxk (self-lit, powered-up) gets the full self-illum rim (pink, aura-derived); gvk is NOT canonically self-lit, so its cyan "energized edge" is **dropped to a normal house rim** and gvk's escalation rides on silhouette (leaner torso + sharper/broken plates) instead. "Colored rim" now means exactly one thing across the roster: the form is self-illuminating.

### 1.3 Contact shadow vs. altitude shadow

- **Grounded forms (wyrm, hydra, mecha):** keep the contact-shadow ellipse at the feet anchor.
- **Airborne forms (all of mothra + all of rodan):** replace the contact ellipse with a single shared **`drawAltitudeShadow(ctx, BH, BW, fg)`** helper (§7). [critique] The two airborne families MUST use the *same* shadow recipe — one offset formula (with `fg.dir` nudge), one alpha (~0.16), one size ratio. A moth and a pteranodon at the same cruise altitude cast the same kind of shadow. This is pulled out of the per-family flight-pose prose into the shared `buildFlyer` contract so the two airborne groups read as one flight system.

### 1.4 The 2px legibility floor

Any feature whose drawn thickness falls below **~2px at gameplay iso scale is wasted** — it blurs out and reads as noise (audit §6, mecha rivets/seams at 1.0–1.8px, moth antennae at 1.8px). Roster rule:

- Identity-bearing features must be **cut silhouette shapes** (filled triangles/lozenges/arcs), not thin strokes: horns, crests, chest spikes, thorns, eyespots, Cybanek orbs, shoulder pods, drill blades.
- Strokes used for identity (magma cracks, fissures, neck specular, gap-glow seams) must be **≥2px** (raise the DESIGNS' "1.5–2px" cracks to **≥2.2px**, confined to 4–5 thick seams so at least one survives — [critique], burning/rodan_mv).
- Genuinely fine detail (rivets, panel seams, scale chevrons, double-bevel plate tips) is **portrait/upgrade-screen only** — cheap to keep if it costs nothing when it doesn't read, but never the load-bearing differentiator. The gxk per-plate "double-bevel faceted tip" is **dropped at iso** (sub-pixel; reserve for portrait — [critique]).

### 1.5 Night-visibility invariant (hard rule) [critique]

The night sky is `#05070f`. **No form may sink into it.** Three near-black forms sit at near-sky luminance — supernova (`skinDark #0d011a`), void_ghidorah (`skin #1a1a2e`), and mecha_3 (`skin #1a1a1a`). All three get the SAME mechanism: a faint self-illumination silhouette rim (per §1.2) that lifts the outline off the sky:

- supernova → violet rim (`rgba(220,176,255,~0.5)`).
- void_ghidorah → cyan+gold crest rim (`#00e0ff ~0.7` upper edge + thin `#ffcf3a` center vein).
- mecha_3 → thin red rim (`rgba(255,32,32,~0.4)`), consistent with its gap-glow palette. mecha_3 keeps its black FILL, but gets the same edge-separation guarantee as the other two. (The DESIGNS left mecha_3 with edge/gap glow only and no full-silhouette rim — this fixes that inconsistency.)

Additionally, raise the AO gradient's dark stop **above pure black** on these forms (supernova: use `~#2a1448` not `#0d011a` for the gradient bottom) so the body interior never matches the sky either.

Note for implementers: supernova's violet rim and void_ghidorah's cyan rim are a deliberate twin-pair of "dark body saved by a self-lit rim" — they are safely separated by archetype silhouette (single hunched plated wyrm vs three-neck fan) AND rim hue. **Do not later "harmonize" the two rim colors** — the hue difference is load-bearing. [critique]

### 1.6 Bake-pass guardrails (non-negotiable engine constraints) [critique]

These constrain HOW every draw instruction is implemented. The DESIGNS use words like "glow", "halo", "additive", "blink" — none may be taken literally in the bake pass:

- **NO `shadowBlur`, NO `ctx.filter`, NO `globalCompositeOperation`** in any builder. `assets.js` forbids per-frame `shadowBlur`. The live additive glow (`globalCompositeOperation='screen'`) happens ONLY in the entities.js `drawGlow` overlay, never in the baked sprite.
- **"Soft glow / halo" = a `createRadialGradient`** (color core → transparent), drawn at normal alpha. **"Additive / incandescent / hot" = an opaque bright color** (e.g. `#ffd24a` hot-spots over `#ff7a1a` veins), which reads as glowing against a dark/scorched body at iso WITHOUT any compositing trick. Audit every "glow" word in the per-form specs against this rule.
- **Animated pulses/blinks do NOT animate in the dominant idle pose.** The idle sprite bakes at `frame=0` only. Anything keyed to `frame` (glowSpines blink, neckBob writhe) freezes at its frame-0 value in idle. Therefore: bake such effects at a **static mid-value** that always looks energized, and defer real animation to the live `drawGlow` overlay. The "writhing" Void necks must be baked as a **fixed deterministic S-curve** in the control points (per neck index, not per frame) so the writhe is present in EVERY frame including idle.
- **Fixed canvas: `SPR_W=150`, `SPR_H=168`, anchor `(75, 144.5)`.** This is the single most likely feasibility failure mode (not draw capability). The widest wings (Mothra 3.3, Rodan 3.6 × BH), tallest plates (supernova ×1.4 height ×16), and outward-breaking elements (god-rays, flame trails, super_mecha lead fin × bulk, shoulder pods) all push toward the fixed edges. **Add a bounds/clip check per heavy form during implementation.** Concrete caps are stated per-form below.
- **`walkT`-keyed idle-freeze:** `walkT = (frame%6)/6` only advances in the WALK fsm. In idle (frame=0) and attack there is no walk phase. Any motion built on `walkT` (the existing `neckBob`) bakes static in the dominant idle pose — do not promise per-frame motion from it.
- **No retained `Path2D`:** the code does not cache path objects. A full-silhouette rim re-stroke must re-issue the torso path; budget that re-trace.
- **Deterministic hashing:** per-index jitter uses the standard GLSL hash `fract(sin(i*12.9898)*43758.5)` — pure arithmetic, no RNG state, stable across frames/facings. This is the correct and approved tool for plate jitter, crack seeds, thorn placement.

### 1.7 Shared new primitives (extracted to avoid five divergent implementations) [critique]

To keep the roster coherent, the following are **shared helpers**, written once and reused with per-family parameters:

- **`drawRidgeElement(ctx, x, y, size, lean, faceCol, coreCol)`** — the wyrm's "dark CORE triangle behind a lit FACE triangle" figure-ground separation. Reused for: wyrm dorsal plates, mecha dorsal spines, and ghidorah horn-crown prongs. One separation model for every pointed dorsal/cranial feature across the roster.
- **`drawFissures(ctx, BH, BW, fg, coreCol, glowCol, intensity)`** — branching glowing cracks. Reused for: burning (orange), supernova (white-violet), AND rodan_mv/rodan_fire as `drawMagmaCracks` (do NOT write a parallel routine — same "bright opaque core ≥2.2px + wider faint under-stroke" recipe).
- **`drawAltitudeShadow(ctx, BH, BW, fg)`** — the single shared flyer shadow (§1.3, §7).
- **`drawHydraNeck` / `drawGhidorahHead` / `drawBatWing`** — Ghidorah's three structural reforms (§4).
- **`drawPteranoBody` / `drawMothThorax` / `drawTuckedTalons`** — the airborne flyer bodies (§5, §6, §7).
- **`joints` / `organicSeams` param branches** in the shared mecha panel/limb routines — data-driven, so all four mecha forms share one code path (§6).
- **`RIM` constant** (§1.1).

### 1.8 Belly-highlight house element [critique]

The soft belly-highlight ellipse (wyrm L285 α0.38, hydra L653 α0.32, flyer L363 α0.35) is an **organic** sheen. Roster rule: **kept** on wyrm + hydra + the new flyer bodies (as a small thorax/underside sheen); **dropped** on the mecha family (machines get specular edges, not soft belly glow). Each family section states retain/remove explicitly so it doesn't drift silently when torsos are rewritten.

### 1.9 Back-facing (N-view) invariant [critique]

Today every archetype collapses to a featureless dark ellipse facing away (`fg.show==='back'`: wyrm L166, flyer L526, mecha L968). Roster rule: **no form collapses to a bare ellipse on the N facing.** Each shows its brand feature from behind:

- wyrm → the back of the dorsal ridge (plate backs).
- mothra → four-wing spread from behind + two white antennae as rear stubs + furred thorax.
- ghidorah → three neck-stubs + horn-crown backs (prongs toward viewer as a dark fan) + wing backs.
- rodan → full wing spread from behind + two crest horns as rear stubs.
- mecha → visor-bar back / antennae / the dorsal spine backs.

### 1.10 Escalation discipline (the wyrm is the template) [critique]

The wyrm arc is the model: a single shared primitive escalated by a **monotonic named param** (`plateJag` 0.35→0.45→0.6→0.8→1.0). Every family escalates through named shape fields the builder reads, not prose adjectives. Where a family's primary knob is non-monotonic (mecha spine count/size), the family preamble states explicitly which axis is the roster-comparable escalation signal so the non-monotonic count is understood as intentional, not a regression (§6).

---

## 2. Wyrm family — Godzilla (5 forms)

### 2.1 Family silhouette identity

A hunched **mountain of mass** topped by an UNMISTAKABLE sawtooth dorsal ridge. At iso scale Godzilla = a heavy bear/sauropod body (thick elephantine legs, deep barrel chest, a deliberately SMALL low-slung head on a thick neck, vestigial T-rex arms) crowned by a row of jagged **broken-slate "maple-leaf" plates** running crest-of-back down a thick low tail. The plate ridge is the brand; everything else is bulk. The five forms are ONE animal evolving — distinctness rides on (a) plate jaggedness/height/count, (b) body bulk/lean, and (c) palette + self-illumination, NOT a different silhouette.

**Shared redesign primitives for all 5 wyrms:**
- Replace the single uniform-triangle `drawPlates` with a **parameterized broken-slate ridge** built on `drawRidgeElement` (§1.7): keep the sine-arc placement math, add deterministic per-index jitter (`fract(sin(i*12.9898)*43758.5)`) so each plate's width/height/lean varies ±25%, and draw a **dark plate-CORE** (new `pal.plate`) behind each lit `skinLight` face so plates separate from the back regardless of palette value-step (critical: this is the figure-ground fix; it survives on baked sprites where the live glow is absent).
- Add `drawFissures(intensity, coreCol, glowCol)` (§1.7) — thin glowing crack veins (≥2.2px) across chest/belly/thigh, used by burning + supernova.
- **Thicken `drawLeg`** (elephantine): `w` from `BH*0.075` → `~BH*0.105`, round the foot wider (elephant/sauropod pads).
- **Widen `drawArm`** ~1.6× and add a small claw notch so the tiny T-rex arms read as anatomy, not noise (audit: current `~BH*0.04` arm vanishes).
- **Lower the head anchor** ~`BH*0.02` and reduce headScale ~3% to sell scale.
- Drive escalation through three shape params the builder reads: **`bulk`**, **`plates`**, and a new **`plateJag`** (0..1 jaggedness/height/sharpness multiplier).

**Belly-highlight:** KEPT (organic). **Back-facing:** show plate backs (§1.9). **Escalation knob:** `plateJag` is monotonic (0.35/0.45/0.6/0.8/1.0); `bulk` traces a deliberate heavy→lean→biggest curve (1.05/1.05/1.0/0.98/1.15). This is the roster template (§1.10).

### 2.2 gz2014 — the baseline anchor (Tier 0)

- **Canonical ref:** GareGoji (Edwards 2014). Charcoal volcanic-rock skin; bulky bear-like body, thick limbs, deep torso; SMALL noble head; wide elephant/sauropod feet; ~89 dorsal fins in an ANGULAR BROKEN-SLATE look (shorter/jaggeder than later films, echoing 1954). Atomic breath glows BLUE.
- **Current problem:** `shape={plates:9, tail:1.0, bulk:1.0}`; `drawPlates` renders 9 uniform smooth triangles on a clean sine arc (too regular for broken-slate); body reads as a generic crouched mass, not bear/elephantine; head not low enough; `drawArm` (~`BH*0.04`) vanishes; `skinLight #565656` vs `skin #3c3c3c` is a weak value step so plate FACES muddy on the baked sprite (only the blue `plateEdge` stroke carries them).
- **Shape:** `plates:10, tail:1.0, bulk:1.05, plateJag:0.35`.
- **Draw changes:** (1) Broken-slate ridge via `drawRidgeElement` — per-index jitter on width/height/lean ±25%; SHORT, blunt plates for this tier (height scalar ~0.85); dark `pal.plate #2b2b2b` core behind each `skinLight` face. (2) Thicken `drawLeg` per family rule (elephantine pads). (3) Widen `drawArm` ~1.6× + claw notch. (4) Lower head ~`BH*0.02`, headScale −3%.
- **Palette:** keep `skin #3c3c3c`, bump `skinLight` to `~#646464` for a stronger AO value-break on the rocky torso; blue `plateGlow`/`breath` stay; add `plate #2b2b2b` core. House rim only (not self-lit).
- **Escalation role:** Tier 0 anchor — shortest/bluntest plates, lowest plate-glow intensity, no fissures, no aura. The reference mass all others escalate from.

### 2.3 burning — molten overlay (Tier 1)

- **Canonical ref:** Burning Godzilla GKotM 2019 (DougheGoji). Scorched near-black/brown body "leaking active fire from every inch"; glowing-orange lava FISSURE rashes across chest/thighs/abdomen; dorsal spines incandescent orange (re-sharpened toward 1954 jaggedness); smoke; red-gold eyes.
- **Current problem:** palette is right (`skin #2c2622`, orange `plateEdge`/glow, aura + heat motes) but there are NO fissure cracks in the code — the signature "magma leaking through cracked skin" read does not exist; body geometry byte-identical to 2014.
- **Shape:** `plates:10, tail:1.0, bulk:1.05, plateJag:0.55`. [critique — the gz2014→burning gap was only 0.35→0.45, leaving color as the *only* iso differentiator; bumped to 0.55 and burning gets 1 visibly taller hot lead-plate to give a real silhouette delta.]
- **Draw changes:** (1) `drawFissures`: 4–5 THICK chest/belly/thigh seams (≥2.2px), branching quadratic strokes, **opaque** hot core `#ffd24a` hot-spots over `#ff7a1a` veins fading to `rgba(255,40,0,0)` — opaque so it reads on the baked sprite without additive compositing (§1.6). Deterministic seed per form, stable across frames. Suppress on `fg.show==='back'`; instead put 2–3 cracks between the dorsal plate roots. (2) **Plate FACES are the primary iso differentiator** [critique]: fill each with a hot 2-stop gradient (base `#ff5a14` → tip `#ffd24a`) so they read incandescent (hottest at base); keep the dark plate-CORE behind for separation. (3) Eyes → red-gold `#ff8a2a`. (4) Self-illumination rim GRANTED (full-silhouette, aura-derived orange, §1.2). Keep heat motes + aura (live FX).
- **Escalation vs gz2014:** same animal mid-fight; surface goes from dull rock to cracked-and-glowing magma; plates a notch taller/sharper (plateJag 0.35→0.55) + 1 tall hot lead-plate; gains the self-illum rim.

### 2.4 gvk — the lean warrior (Tier 2)

- **Canonical ref:** GvK 2021 (DougheGoji revised), battle-hardened warrior. Dorsal fins re-shaped SHARPER and SLIMMER (razor maple-leaf, echoing G2000); charcoal/brown-gray skin; spikes "constantly growing and breaking" so an irregular SCARRED ridge is on-canon.
- **Current problem:** identical `bulk:1.0/plates:9` to every tier; uniform triangles, not slimmer/sharper razor maple-leaf; no battle-scar asymmetry; distinct only by the (decent) cyan palette; body never gets leaner.
- **Shape:** `plates:11, tail:1.05, bulk:1.0, plateJag:0.6`.
- **Draw changes:** (1) **Narrow the torso ~6–8% horizontally** via a `torsoWidth` multiplier into `drawTorso` (the athletic-warrior read). NOTE: `drawTorso`'s outline is duplicated verbatim in `drawMechTorso`; keep this change LOCAL to the wyrm `drawTorso` so the two copies don't desync. (2) Plates SHARPER+SLIMMER: in `drawRidgeElement`, reduce per-plate base width ~25%, increase height ~15% (razor maple-leaf); flag **2 plate indices as "broken"** — rendered ~50% height with a chipped flat top + a small notch (battle-scar asymmetry; a 2-extra-vertex change, cheapest possible). (3) **Rim: HOUSE rim only.** [critique — gvk is NOT canonically self-lit; the DESIGNS' "cyan ridge rim" is dropped per §1.2. gvk's escalation is carried entirely by the leaner torso + sharper/more-numerous/broken plates, which survive at iso.] Cyan `plateGlow`/`breath` stay as live-FX glow color, not a baked rim. No fissures.
- **Escalation vs burning:** from molten chaos back to a sleeker, scarred, weaponized profile — visibly leaner torso, more + sharper plates (11 vs 10, plateJag 0.6), 2 broken plates; the seasoned fighter.

### 2.5 gxk — peak-power pink form (Tier 3)

- **Canonical ref:** GxK 2024 EVOLVED/pink form (Krichevsky, Kaio-Ken + Showa nostalgia). After absorbing Tiamat energy: vibrant MAGENTA/PINK colorway, glowing pink dorsal fins, SHARPER and more plates, increased agility (leaner/faster), PINK Heat Ray. **NOTE: the icy-blue frostbitten arm belongs to KONG (Shimo's beam) — do NOT put frostbite on Godzilla.**
- **Current problem:** palette/glow excellent and on-canon (`skin #2c2731`, `plateEdge #ff6cc6`, pink motes+aura) but body and plates byte-identical to base 2014 (`bulk:1.0, plates:9`) — a pink-lit 2014, not an evolved form.
- **Shape:** `plates:13, tail:1.05, bulk:0.98, plateJag:0.8` (leanest of the practical forms).
- **Draw changes:** (1) Tallest+sharpest plates of the "real" forms — slim base, tall height. **Drop the per-tip double-bevel** [critique — sub-pixel at iso; reserve for portrait]; the crystalline read is carried by the rim alone. (2) **Self-illumination rim GRANTED** (full-silhouette pink, aura-derived, §1.2) — this REPLACES the DESIGNS' "pink ridge rim + per-plate inner-glow gradient." For the plate-face energized look, reuse ONE shared linear gradient computed in plate-local space and re-fill each plate translated, OR fill plate faces flat hot-pink and let the single full-silhouette rim carry the powered-up look [critique — cheaper, reads the same; avoids 13 gradient allocations]. (3) Whole-body pink aura already set — lean on it. (4) Slightly more upright/forward lean via existing `fg.dir` torso lean. Do NOT add a blue ice arm.
- **Escalation vs gvk:** clearly more energized — more plates (13), sharpest tips, leanest body (0.98), hot-magenta full-silhouette self-illum rim; the unmistakable powered-up read.

### 2.6 supernova — radiant overload final form (Tier 4)

- **Canonical ref:** speculative endpoint (no film design). Anchors: Heisei Burning Godzilla MELTDOWN (critical mass, glowing red, near-explosion) + the GxK:Supernova (2027) title. The radiant overload BEYOND gxk pink — about to go nova.
- **Current problem:** same frozen `bulk:1.0/plates:9` as 2014 — the "radically overgrown crystalline endpoint" is entirely palette. CRITICAL: `skinDark #0d011a` is near-black against night sky `#05070f` — may be invisible at night.
- **Shape:** `plates:16, tail:1.15, bulk:1.15, plateJag:1.0` (biggest + tallest + max jag).
- **Draw changes:** (1) Overgrown CRYSTAL ridge — tallest, most jagged plates (height scalar ~1.4), each a violet-white 3-stop gradient (`#2a1448` base → `#a55ae6` mid → `#dcb0ff` tip — note base raised off pure black per §1.5). **COST TRIMS [critique], this is the heaviest sprite in the roster:** (a) replace per-plate "blur-glow halo" with the self-illum rim + a SINGLE wide `createRadialGradient` violet wash behind the whole ridge (one radial, not 16) — same glowing-spine read, 1/16th the cost; (b) cap the 3-stop gradient faces to the FRONT-facing visible plates; back-row plates on a given facing use flat violet; (c) the full-silhouette rim re-strokes the TORSO path only (the dominant mass) — limbs don't need individual rims to lift off the sky. (2) `drawFissures` in WHITE-VIOLET, brighter/denser than burning (8–10 seams, ≥2.2px, opaque cores) reading as energy splitting the skin. (3) **NIGHT-VISIBILITY FIX (mandatory, §1.5):** self-illum violet rim `rgba(220,176,255,~0.5)` around the torso silhouette; AO gradient dark stop raised to `~#2a1448` (never pure black). (4) White-hot eyes `#ffffff`, strong violet aura, cosmic motes (live FX).
- **Feasibility note (open risk, §9):** even after trims this is by far the heaviest sprite; ~13 baked frames; watch LRU cache thrash (§9.1). Also verify the ×1.4-height ×16 plates on a `bulk:1.15` body do not clip the top of the 150×168 canvas.
- **Escalation vs gxk:** same animal, now a walking supernova — biggest body, tallest crystalline overgrown plates, glowing white-violet seams, self-illuminated so it dominates the night sky. (gxk 13 vs supernova 16 plates is only ~23% more — rely on bulk+glow to carry the count delta, which it does.)

---

## 3. Mothra family — flyer (3 forms)

### 3.1 Family silhouette identity

A divine, near-bilateral MOTH read as an **AIRBORNE** silhouette: a small furred thorax/head centered between **FOUR wings** whose combined span is the dominant mass — large pointed FOREwings high/forward + smaller scalloped HINDwings lower/back — two thick swept-back WHITE antennae, and a short tapering abdomen. The **non-negotiable brand feature is one round EYESPOT (ocellus) per forewing tip** (concentric black ring / colored iris / pale center), framed by a dark wingtip border over an orange/amber pattern field. She must NEVER read as a hunched lizard, and the near/far wings must NEVER smear into one translucent blob. Identity is carried 100% by the four-wing bilateral layout + wing pattern; fine detail is portrait-only.

**Flight pose:** uses the shared `buildFlyer` airborne contract (§7). The thorax is a compact furred OVAL (new `drawMothThorax`) — a horizontal egg ~`BW*0.34 × BH*0.30` with a fuzzy stroked fur edge, NOT the tall tapered quad. Tier escalation in-pose: t1 moderate spread + slight forward sweep; t2 wider span + glowing joints visible at the wing roots; t3 widest + most symmetric, wings held level (the "descending angel" read).

**Belly-highlight:** KEPT (small thorax/underside sheen). **Back-facing [critique]:** explicit Mothra N-view — four-wing spread from behind + two white antennae as rear stubs + furred thorax; never a bare ellipse. **Blue ACCENT token locked [critique]:** `plateEdge = #2ec8ff` is the SAME literal across t1 AND t2 (eyespot iris + joint bioluminescence) so "blue is the accent" reads as one species, then transitions deliberately to gold at t3.

**Cross-family note [critique]:** mothra_gxk's orange-bronze body sits near the warm-brown Rodan tiers (both airborne). The distinguishing load is 100% wing SHAPE — rounded 4-lobe + ocelli (Mothra) vs angular single-spar scalloped triangle (Rodan). Implementation must verify both signatures survive the far-wing/iso pass (Mothra eyespots ≥`BH*0.09` even on the FAR wing at α0.82; Rodan scallops as a hard cut, not a stroke).

### 3.2 mothra_gvm — cool white+blue (Tier 1)

- **Canonical ref:** Mothra (2019, GKotM) imago. Four wings = large pointed FOREwings + smaller rounded scalloped HINDwings; WHITE fur over body with brown-orange forehead tuft; two large WHITE antennae laid flat; large oval BLUE eyes; wing pattern orange/yellow/black/white with round EYESPOTS at forewing tips and black wingtip borders; stained-glass translucent membranes; bright BLUE under-skin bioluminescence; blue God-ray beam.
- **Current problem:** wrong hue entirely — `skin/skinDark/skinLight` all high-chroma cyan (`#00d9ff` family), so the BODY glows cyan instead of being white+orange fur with a blue GLOW accent. Only 3 plain veins, zero eyespots/bands, single 2-lobe quad per side. Drawn as a grounded hunched biped with feet-contact shadow + walk legs + bob. Antennae 1.8px (clip at iso). IDENTICAL skin palette to the GxK form.
- **Palette (config L132–135):** `skin '#f3ede0'` (warm white fur), `skinDark '#b8aa92'`, `skinLight '#fffaf0'`; move blue to ACCENT only — `plate '#1a1a22'` (wingtip-border black), `plateEdge '#2ec8ff'` (blue glow/joint/antenna accent), `plateGlow 'rgba(46,200,255,0.7)'`, `breath ['#2ec8ff','#ffffff']`, `eye '#2ec8ff'`.
- **Shape:** `wingSpan 2.8→2.7`; new keys `wingPair:'double'`, `eyespot:0.85`, `furThorax:true`, `joints:false`, `antenna:'white'`.
- **Draw changes:** Rewrite `drawMothWing` into a FOUR-wing routine — TWO membranes per side: a large pointed FOREwing (swept high/forward, ~`nearW*1.0`) and a smaller rounded HINDwing below/back (~`nearW*0.6`, scalloped trailing edge via 2 shallow quad notches). Fill each wing in banded LAYERS (nested flat-fill paths — cheaper than gradients and avoids per-wing gradient allocations): outer black wingtip border (`plate`, ~18% of wing area at tip), inner amber field (`#e88a2c`), root warm yellow (`#f0c050`). **PER-WING EYESPOT (the brand, currently absent):** concentric ellipses on each FOREwing tip — black ring (`plate`) r≈`BH*0.14`, blue iris (`eye #2ec8ff`) r≈`BH*0.09`, pale center (`#fffaf0`) r≈`BH*0.035`. ANTENNAE: thicken to lineWidth ~3.2, color `skinLight` (white), two swept-back curves topping at ~`-BH*0.98` (pulled in from −1.04 so they don't clip). FLIGHT POSE per §7. **Far/near blob fix:** raise back-wing globalAlpha 0.70→0.82, offset the far forewing tip outward by `+lean*side*BH*0.10` so both wings read distinct.
- **Escalation role:** Tier 1 — cool white+blue, ONE eyespot per forewing, restrained single amber/yellow banding.

### 3.3 mothra_gxk — warm orange-bronze + joint bioluminescence (Tier 2)

- **Canonical ref:** Mothra (2024, GxK) — same imago anatomy, upgraded: noticeably THICKER fur; MUCH brighter ORANGE-BRONZE body; discrete BLUE BIOLUMINESCENT SPOTS across body (around mouth, chest, eyebrows, a round forehead "third-eye" spot, and at EACH JOINT); richer multi-layered orange/yellow/black eyespot wings; golden-yellow revival glow.
- **Current problem:** EXACT same cyan skin palette as mothra_gvm — only `plate`/`breath` flip cyan→orange, so it reads as the same blue moth with a different vein tint. No fur upgrade, no orange-bronze body, no joint bioluminescence, no eyespot pattern.
- **Palette (config L139–142):** `skin '#c8772a'` (orange-bronze fur), `skinDark '#8a4d18'`, `skinLight '#e6a04a'`; `plate '#1a1410'` (warmer wingtip black), `plateEdge '#2ec8ff'` (SAME blue accent token as t1 — locked, §3.1), `plateGlow 'rgba(46,200,255,0.8)'`, `breath ['#ffb84a','#ffffff']`, `eye '#2ec8ff'`.
- **Shape:** `wingSpan 2.9→3.0`, `eyespot 0.85→1.0`, `furThorax:'thick'`, `joints:true`.
- **Draw changes:** Same four-wing layout as t1 but render the fur THICKER — `drawMothThorax` adds a denser fuzzy outline (a second offset stroked ring ~+2px, chunkier forehead tuft). Wings enrich to FOUR banded layers — black border / deep orange (`#c8772a`) / amber (`#e88a2c`) / yellow (`#f0c050`); forewing eyespot slightly LARGER (iris r≈`BH*0.10`), brighter/more-saturated blue. **SIGNATURE 2024 FEATURE (currently absent) — discrete BLUE BIOLUMINESCENT SPOTS:** when `shape.joints`, draw small bright dots (`plateEdge #2ec8ff`, r≈`BH*0.018`, opaque at α0.9) at: the two wing roots, the two tucked-leg joints, two on the chest, and ONE larger round spot on the forehead (r≈`BH*0.03`, the "third-eye"). Cheap, high-identity, survive at iso as bright pinpoints. Same airborne flight pose, slightly wider spread.
- **Escalation vs t1:** "same goddess, warmer and powered-up" — orange-bronze body + glowing joints/forehead vs t1's cool white+blue.

### 3.4 mothra_supernova — golden god-ray apotheosis (Tier 3)

- **Canonical ref:** speculative apotheosis (GxK: Supernova, 2027 — no Mothra design revealed). Anchored to Mothra's canonical PEAK: her ANGELIC GOLDEN-WHITE "GOD RAYS" emanating off her whole body + the golden-yellow 2024 revival glow. The divine golden apotheosis of the canon blue→golden god-ray escalation.
- **Current problem:** palette already correctly cream/gold (`#fffacd`, `#ffd700` glow, gold aura) — right DIRECTION — but sits on the SAME flat 2-lobe geometry with no eyespots, no pattern, no escalated silhouette; reads as a yellow recolor of t1.
- **Palette (config L146–149) refine:** `skin '#fff6d8'` (radiant cream fur), `skinDark '#e8cf88'`, `skinLight '#ffffff'`; `plate '#5a4416'` (dark-gold wingtip border, warmer than black), `plateEdge '#ffd700'` (gold radiance accent — deliberate transition off the blue token), `plateGlow 'rgba(255,215,0,0.92)'`, `breath ['#ffffff','#ffd700']`, `eye '#ffffff'`, `aura 'rgba(255,215,0,0.24)'`.
- **Shape:** `wingSpan 3.0→3.3` (LARGEST of the three), `eyespot 1.0→1.15`, `furThorax:'thick'`, `joints:true`, `godrays:true`.
- **Draw changes:** widest, most symmetric four-wing spread held LEVEL (reduce forward-sweep — "descending angel"). Pattern fields shift to GOLD-LEAF / amber (`#e8b020` over `#f5d878`) — stained glass lit from behind. EYESPOTS become GOLDEN-WHITE RADIANT OCELLI: dark-gold ring → gold ring (`#ffd700`) → white-hot center (`#ffffff`), largest of the arc. **ESCALATION FEATURES absent from t1/t2:** (a) `godrays:true` — **bake as low-alpha (0.10–0.16) FLAT triangular spokes** (NOT 10 individual gradient objects — invisible distinction at iso, and a cost item) fanning off each forewing tip; **keep spokes SHORT (< `BH*0.4`)** to avoid clipping the 150×168 canvas at the widest wingspan [critique — clipping risk + cost]; (b) all-over radiance via a soft gold `createRadialGradient` behind the thorax (one radial, cheap); (c) the most prominent forehead glow-spot of the three (r≈`BH*0.04`, white core + gold halo); (d) brightest/most-defined white antennae (lineWidth ~3.6). Same airborne pose, wings widest/most level.
- **Feasibility note:** measure widest extent — `WH = (h*0.74*1.0)*3.3` plus god-ray spokes; verify tip + ray stays within `x∈[0,150]` from anchor 75 after iso compress, or reduce ray length, else the god-ray motif looks chopped on E/SE facings (§9).
- **Escalation payoff:** t1 cool-blue restrained → t2 warm orange-bronze + joint glow → t3 radiant golden-white god-ray apotheosis.

---

## 4. Ghidorah family — hydra (5 forms)

### 4.1 Family silhouette identity

A **FAN of three serpentine necks** spreading from a single small body — the only silhouette in the roster nameable from outline alone. Read order at iso: (1) three-prong tapered neck-fan crowned with horned heads, (2) twin bat-wings spread behind, (3) twin forked tails below. **ZERO arms** — wings ARE the forelimbs; never draw the wyrm arm nubs (`buildHydra` already omits `drawArm` — keep it that way). Body is deliberately small/upright, dwarfed by the neck+wing mass. Brand color GOLD with golden gravity-beam lightning.

**Three builder-level structural reforms unlock the family (all shared helpers, §1.7):**

- **(A) `drawHydraNeck`** — replace the flat round-cap stroke (current L698–711) with a **TAPERED FILLED neck**: width `nw_base=BH*0.11` at root tapering to `nw_tip=BH*0.045` at the head. Feasible recipe [critique]: sample the existing quadratic spine at ~6–8 t-values, compute the tangent by finite difference, rotate 90° for the normal, push out by `halfWidth(t)`, build the outline `moveTo(first upper) → lineTo upper samples → lineTo lower samples reversed → close`, then fill with a per-neck `linearGradient` (rootY→tipY: `skinLight` crest → `skin` → `skinDark` underside). ~3 necks × ~16 points = ~48 lineTo per sprite — negligible. **Do NOT attempt per-point lineWidth stroking — Canvas2D has none; the offset-fill is the only feasible approach.** Overlay a `RIM`-color crest stroke (upper edge only, §1.1). Center neck uses the brighter gradient; outer two skew to `skinDark`.
- **(B) `drawGhidorahHead`** — replace the reused wyrm `drawHead` (call at L724) with: a small skull ellipse (`BH*0.10 × BH*0.07`) + a back-swept HORN-CROWN of vector prongs built on `drawRidgeElement` (§1.7, dark core + lit tip) + a golden eye (`pal.eye`) as a `BH*0.025` dot with white-hot core; open-jaw + beam-charge glow on attack.
- **(C) `drawBatWing`** — replace the reused `drawPteranoWing` (calls at L641/L664) with finger-spar strokes radiating from a wrist + a SMOOTH gold membrane fill (`skinLight→skin→skinDark`) + a SCALLOPED trailing edge (concave arcs between spar tips) — visually distinct from Rodan's single-point membrane.

**Back-facing fallback [critique + DESIGNS]:** branch `drawHydraHeads` on `fg.show==='back'||'back34'` to draw three short tapered neck-STUBS + the backs of each horn-crown (prongs toward viewer as a dark fan) + the wing backs — so the 3-prong signature survives the N view instead of collapsing to one dark ellipse (the current worst collapse).

**Belly-highlight:** KEPT. **Escalation knob:** named shared fields — `neckLenMul`, `headHornStyle`, `neckThorns`, `bodyBulk`, `voidPortal` — read by the new helpers, mirroring the wyrm template (§1.10).

**Gold-token rule [critique]:** the three organic gold tiers (ghidorah, king_ghidorah, grand_king) all currently carry a non-canonical PURPLE beam (`#9b6bff`). Correct all three to GOLD, and make the beam/eye/glow values use ONE shared gold token across the three so the family reads as one species — not three near-but-not-equal golds.

### 4.2 ghidorah — establish the skeleton (Tier 1)

- **Canonical ref:** MonsterVerse King Ghidorah (GKotM 2019): three heads on long necks (Ichi center/dominant, Ni right, San left/submissive), each with a back-swept Heisei HORN CROWN; necks ridged/skin-textured; SMOOTH golden bat-wing membrane; TWO tails each ending in a spiky SICKLE tip; two legs, NO arms; GOLDEN gravity beams.
- **Current problem:** necks are flat single-color round-cap strokes (read as garden-hose, no taper/volume/shading); heads reuse wyrm `drawHead` and collapse to one empty ellipse on back facing; wings reuse `drawPteranoWing` (pixel-identical to Rodan); eye/beam/glow are PURPLE `#9b6bff` (non-canonical — brand is GOLDEN lightning); no horn crown.
- **Shape/config:** add `neckLenMul:1.0`, `headHornStyle:'crown'`, `neckThorns:false`, `bodyArmor:false`, `sickleTail:true`; keep `heads:3, tails:2, neckSpread:1.25, wingSpan:2.4`.
- **Draw changes:** Necks via `drawHydraNeck` (A); center neck brighter gradient, outer two skew dark. Heads via `drawGhidorahHead` (B): skull + back-swept HORN CROWN = 3 prongs per side as thin filled triangles fanning rearward (prong length ~`BH*0.10`, splay 25–55°), `drawRidgeElement` dark core + `RIM`-lit tip; small forward snout + golden eye; one right-head horn gets a tiny CHIPPED notch (canon asymmetry, free identity). Center head sits ~`BH*0.06` higher, 1.12× larger. Wings via `drawBatWing` (C). Tails keep the `drawTail` fan + a small filled sickle barb triangle at each tip.
- **Palette FIX (config L155–158):** GOLD — `eye '#ffd24a'`, `plateEdge '#ffcf3a'`, `plateGlow 'rgba(255,200,60,0.78)'`, `breath ['#ffd24a','#ffffff']`, `breathGlow 'rgba(255,200,60,0.95)'` (shared gold token). Keep `skin #d4a000 / skinDark #8b6914 / skinLight #f0d070`.
- **Escalation role:** Tier 1 baseline — establishes the family skeleton and fixes the four structural defects.

### 4.3 king_ghidorah — organic escalation (Tier 2)

- **Canonical ref:** Heisei King Ghidorah (1991): the fully-organic apex — brighter, MORE METALLIC gold, sharper angular scale detail, more defined neck musculature, LARGER/longer horns, wider 175m wingspan.
- **Current problem:** palette nearly DUPLICATES T1 (`#e6b800` vs `#d4a000`, audit §5); only differentiators are `neckSpread 1.3 vs 1.2` (near-invisible) + `wingSpan 2.6 vs 2.4`; same purple beam; no body/horn escalation — reads as the identical dragon at iso.
- **Shape/config:** `neckSpread 1.25→1.45` [critique — widen MORE than the DESIGNS' 1.40 so the fan footprint visibly differs from T1], `wingSpan 2.4→2.9`, `neckLenMul 1.0→1.15` (taller fan), `headHornStyle:'crown_tall'` (prong length +30%, +1 prong per side → 4-per-side denser crown), and give T2 ONE cut-shape signature beyond "brighter+taller" [critique] — **make the 4th prong per side a distinctly longer hooked crown tip** (a clear silhouette cue, not just graded gold). `bodyArmor:false`, `sickleTail:true`.
- **Palette FIX (config L162–163):** push VALUE + add a metallic cool specular — `skin '#f2c200'`, `skinDark '#a07000'`, `skinLight '#fff0a0'` (clearly brighter than T1). In `drawHydraNeck` add a thin near-white specular crest stroke using the shared `RIM` token (§1.1, NOT a bespoke `#fffbe0`). Add 3–4 short `skinDark` chevron scale-ticks along each neck crest (cheap "polished" touch — fine if they don't read at iso; NOT the sole differentiator). Beam/eye stay the shared gold token (`eye '#ffd24a'`).
- **Escalation vs T1:** visibly taller+wider neck fan (1.45 spread, 1.15 length), larger 4-prong crown with a hooked signature tip, brighter metallic gold — the same dragon LEVELED UP. Confirm `#d4a000` (T1) vs `#f2c200` (T2) value gap reads at iso; push apart if needed.

### 4.4 mecha_ghidorah — gold/silver cyborg (Tier 3)

- **Canonical ref:** Mecha-King Ghidorah (1991): a CYBORG, not a full robot — built around King Ghidorah's body. The MIDDLE head is replaced with a mechanical head; the two OUTER heads stay organic gold. WINGS/TORSO/chest armored in cold SILVER-GREY plating with neck braces on the cyber neck. Center cyber head fires a triple-beam gravity laser. Signature is the GOLD-organic vs SILVER-machine CONTRAST.
- **Current problem:** a UNIFORM grey body with a half-strength (α0.55) panel wash over everything — reads as a grey-PAINTED dragon, not a gold/silver cyborg; the gold-organic-outer vs silver-machine-center contrast entirely absent; all three heads identical; wings still the reused organic pteranodon membrane.
- **Shape/config:** keep `heads:3, tails:2, neckSpread:1.45, wingSpan:2.6, mech:true`; add `cyborgCenter:true`. Add a SECOND palette channel for the organics so the builder renders outer necks gold while body/center go steel: `goldSkin '#e6b800'`, `goldDark '#996600'`, `goldLight '#ffdd00'` alongside steel `skin '#808080' / skinDark '#4a4a4a' / skinLight '#c0c0c0'`.
- **Draw changes — load-bearing builder change [critique]:** `drawHydraHeads` MUST accept a **per-neck palette override** (today it picks `pal.skin` vs `pal.skinDark` by index only) — thread this or the cyborg contrast can't be expressed. When `cyborgCenter`: render the TWO OUTER necks+heads with the GOLD sub-palette (organic `drawHydraNeck` + `drawGhidorahHead`, gold horn-crowns), and the CENTER as MACHINE. **The center machine head REUSES the mecha family's `drawMechHead` (headStyle:'helmet') [critique — roster has exactly ONE "machine" look applied to two families]** — a boxy angular silver skull, a glowing CYAN visor slit (`eye #00d6ff`) instead of an organic eye, and segmented neck braces (3–4 horizontal `skinDark` bands across the center neck). BODY: replace the α0.55 wash with **FULL hard-edged silver plating** — but do NOT overload the shared `drawMechPanels` with a new full-plating mode `buildMecha` doesn't want [critique]; pass an explicit alpha/style param (the routine already takes alpha) or write a small hydra-specific panel routine, called at α1.0 over a flat (non-gradient) steel torso. WINGS: `drawBatWing` in MECHANICAL mode — hard straight finger-spars (no scallop), flat silver membrane panels with a seam per panel, a `plateEdge` cyan edge-stroke.
- **Palette:** cyan eye/beam `#00d6ff`, `plateGlow 'rgba(0,200,255,0.85)'`. The gold organics + cyan-machine contrast IS the read. Optional thin `skinDark` cable/restraint hint from torso if it survives at scale.
- **Implementation watch:** ensure the two OUTER necks actually render gold and only the CENTER greys out — if the whole body greys, it regresses to the current "grey-painted dragon" problem.
- **Escalation role:** the single jarring machine-vs-organic form between smooth-gold T2 and radiant-gold T4. Cross-family safe: steel+cyan+gold on a three-neck HYDRA fan vs the single-head blocky mecha bipeds; cyan beam shared with void but void is dark+thorny+wormhole.

### 4.5 grand_king — muscular gold king (Tier 4)

- **Canonical ref:** Grand King Ghidorah (Rebirth of Mothra III, 1998): the most physically distinct organic Ghidorah — MORE MUSCULAR/beefier, necks slightly SHORTER and THICKER, wings more intricate. SIGNATURE: ASYMMETRIC HORNS — the CENTER head has FORKED/antler-like (branching) horns while LEFT and RIGHT heads have STRAIGHT antler horns. Radiant powerful gold.
- **Current problem:** identical 3-head/2-tail geometry as every tier; only `neckSpread 1.5 + wingSpan 2.8` differ (invisible); the defining forked-vs-straight horn asymmetry completely absent; no extra bulk; purple beam/aura (should be gold); pale-yellow palette fine but zero shape identity vs T1/T2.
- **Shape/config:** biggest body + thickest necks of the gold tiers — `bodyBulk:1.18` (scale BH ~18% in `buildHydra`, or thicken neck base widths to `BH*0.135`), `neckLenMul:0.92` (shorter, beefier per canon), `neckSpread 1.5`, `wingSpan 2.8→3.0`. **HORNS — THE differentiator:** `headHornStyle:'asymmetric'` so `drawGhidorahHead` branches — the CENTER head gets a FORKED/branching crown (each prong splits into 2 sub-prongs near the tip, a clear antler fork built as filled triangles sharing a base, NOT thin strokes, so it reads as mass at ~40px) while the two SIDE heads get STRAIGHT swept antler prongs (longer T1 crown style). Wings: `drawBatWing` with +1 finger-spar and deeper trailing scallops ("more intricate").
- **Palette:** brightest richest gold — keep `skin #ffee77 / skinLight #ffffbb`; bump `skinDark` to `#d4a000` for contrast against the pale body. FIX the purple beam (config L178–179): `eye '#ffe680'`, `plateEdge '#ffd24a'`, `plateGlow 'rgba(255,210,80,0.88)'`, `breath ['#ffe680','#ffffff']`. RECOLOR the existing `aura` from purple to GOLD (`rgba(255,200,60,0.18)`).
- **Escalation vs T2:** heavier muscled body (bodyBulk 1.18), shorter thicker necks (0.92), the unique forked-center horn crown (the load-bearing iso signature), deepest gold + gold aura.

### 4.6 void_ghidorah — cosmic void god (Tier 5)

- **Canonical ref:** Void Ghidorah / God of the Void (GODZILLA: The Planet Eater, 2018): an extra-dimensional energy being — canonically NO solid body, manifesting as three EXTREMELY LONG, thin, WRITHING golden necks descending from a suspended WORMHOLE/singularity. Patterned after ROSES — necks and heads bristle with NUMEROUS SPIKES/THORNS. Cosmic horror, not a normal dragon. Game tints it dark-indigo + cyan void-flame.
- **Current problem:** just a near-black recolor of the same smooth 3-head/2-tail dragon; `skin #1a1a2e` has near-zero value contrast vs night sky `#05070f` — Void VANISHES at night (audit §5); no thorns (the rose-thorn signature), no wormhole manifestation; reads as "dark Ghidorah," not "cosmic void god"; `neckSpread 1.6` is the only escalation.
- **Shape/config:** longest+thinnest necks of all tiers — `neckLenMul:1.45`, neck base width thinned to `BH*0.07` tapering to `BH*0.03`, `neckSpread 1.6`. **Bake a FIXED sinuous S-curve into each neck's control points [critique]** — deterministic per neck index, NOT per frame (the DESIGNS' "amplify neckBob" fails: `neckBob` is `walkT`-keyed and won't animate in the idle/attack bakes; a static baked S-curve gives the writhing-rose silhouette in EVERY frame including idle). `neckThorns:true`: in `drawHydraNeck`, stud each neck with 5–7 small THORN triangles along its length (alternating sides, length `BH*0.03`, pointing outward — the rose-thorn signature; these are the brand, watch they survive iso). Heads get a bristly spiked crown (`headHornStyle:'thorns'` = many short jagged prongs). **WORMHOLE:** `voidPortal:true` — replace the ground-contact ellipse (buildHydra L622–626) with a glowing SINGULARITY DISC at the neck-root origin: a `createRadialGradient` ring (cyan `#00d6ff` core → dark falloff) ~`BW*0.9` radius from which the three necks emerge. **Watch:** this disc sits near the canvas bottom (anchor Y 144.5/168) — nudge it up slightly if the `~BW*0.9` radius clips the bottom edge (§9).
- **Palette FIX (§1.5 night-visibility, mandatory):** lift value via RIM-LIGHT, not bulk fill — keep the dark body but in `drawHydraNeck` add a bright CYAN+GOLD crest rim (`#00e0ff` α0.7 upper edge + a thin gold `#ffcf3a` center vein) so the necks read as a "golden void entity" with luminous edges; thorn tips catch the cyan rim. Bump `skinLight #3a3a52→#5a5a82` for internal contrast. Keep `aura 'rgba(0,204,255,0.20)'` + `fxMotes 'cosmic'` (live FX). Beam = cyan void-flame `eye '#00e0ff'`, `plateGlow 'rgba(0,224,255,0.9)'`.
- **Escalation vs T4:** the ONLY form that breaks the dragon mold — impossibly long thorny writhing necks emerging from a glowing wormhole, cyan-rimmed against the night, no normal body.

---

## 5. Rodan family — flyer (3 forms)

### 5.1 Family silhouette identity

A pteranodon read at iso from a 3/4-front angle: ONE dominant horizontal mass = the broad single-finger-spar wing spread, a NARROW horizontal body slung between the wings (NOT the hunched upright wyrm torso), a backswept pointed HEAD-CREST, a long DOWN-ANGLED BEAK leading the body, two small TUCKED talons under the chest, and a near-absent tail. The non-negotiable silhouette triangle is **WING + CREST + BEAK**, angular and raptor-like — it must never smear into Mothra's rounded two-lobe blob (enforced by a SCALLOPED trailing edge on every wing, drawn as a hard cut, not a thin stroke). Across the 3-tier arc the constant is that triangle; what escalates is HEAT: cold brown rock-pteranodon (no glow) → dark volcanic-rock fire demon with magma-crack seams + glowing wing underside → incandescent vermilion magma-comet with gold crest/spikes, black beak, white-hot cracks, flame trail.

**Flight pose:** uses the shared `buildFlyer` airborne contract (§7), gated on `wingStyle==='pteranodon'`. Body via new `drawPteranoBody`: a slim near-horizontal lozenge, long axis +X (beak/head leading) → −X (stub tail), centered at `y=-BH*0.55` (constant cruise altitude), width ~`BW*1.5 long × BH*0.30 tall`, 3-stop linear gradient light(top)→skin→dark(belly).

**Belly-highlight:** KEPT (small underside sheen on the lozenge). **Back-facing [critique]:** N-view shows the full WING SPREAD from behind + the two crest horns as rear stubs; never a bare ellipse.

**Escalation knob:** `wingSpan` (2.8/3.1/3.4) + `bulk` (0.95/1.1/1.2) + HEAT (palette + shared adds). [critique — wingSpan steps of ~0.3 (~10%) and bulk steps are near-invisible at iso; the LOAD-BEARING differentiators are silhouette cues + the t3 color contract, not the span/bulk numbers. Specifically: the **V-split inward-curl crest** (t2/t3) vs **two straight back-horns** (t1) is the differentiator that separates t1 from t2 — it must be a bold cut shape; and the **t3 gold-crest + gold-spikes + black-beak** triple contract is what separates t3 from t2.]

**Distinctive drawn features (new helpers, all silhouette-cut fills, survive ~40px):**
- `drawCrestHorns` — at the skull rear, swept-back filled triangular horns in bone-tan; gains a `'vsplit'` variant (t2/t3) that forks from a common base and hooks the tips back toward each other (the #1 instant-recognition cue for MV Rodan).
- `drawChestSpikes` — 3 short outward-pointing filled triangles along the leading underside, stepping down front-to-back.
- `drawTuckedTalons` — a single small pair of curled tucked talons under the chest (no planted feet, no walk swing).
- Reworked `drawPteranoWing` — broad single bold spar (`skinDark`), trailing edge from 2–3 shallow quadratic SCALLOPS (finger notches) — instantly not-Mothra.

### 5.2 rodan — cold rock-pteranodon (Tier 1)

- **Canonical ref:** Toho Showa Rodan (1956/1964). BROWN-to-BURGUNDY craggy hide with NO glow; SLIM body with ENORMOUS disproportionate wings; TWO-HORN backswept skull crest; a short row of SHARP BONE SPIKES down the chest/sternum; long down-curved beak; in flight a fast horizontal glider with legs tucked.
- **Current problem:** drawn as a grounded upright biped (hunched wyrm-egg `drawFlyerTorso`, feet-on-ground contact ellipse, walk legs, walk-FSM flap/bob — all wrong for an always-airborne flyer); `drawPteranoWing` is one plain swept membrane with a single smooth trailing edge + one spar, NO scallops, NO chest spikes, NO real horn-crest (the L565 crest is a flat skinDark sliver); browns `#8b4513/#654321/#a0522d` have weak value spread; only differentiators are skin hue + a 0.1 wingSpan bump.
- **Shape:** `wingStyle:'pteranodon'`, `wingSpan 2.8` (LOWERED from 3.2 so tiers escalate visibly: 2.8→3.1→3.4), `bulk 0.95` (lowest of three). Tail: stub only.
- **Draw changes:** Airborne base pose per §7. `drawPteranoBody` (slim horizontal lozenge, 3-stop gradient). `drawCrestHorns` (two swept-back filled triangles in bone-tan `#d8b070`, lengths ~`BH*0.18` and `BH*0.14`, both raked back). `drawChestSpikes` (3 triangles, `#d8b070`, ~`BH*0.06` stepping down). Reworked `drawPteranoWing` with 2 scallops + single bold spar.
- **Palette FIX (kill the muddy low-contrast brown):** `skin '#8a5a30'`, `skinDark '#5a3818'`, `skinLight '#b07a45'` (real value spread); `eye '#ffaa00'` (warm amber); `aura null`, `fxMotes null` — this tier is COLD (no magma, no glow). House rim only.
- **Escalation role:** Tier 1 floor — cold rock-bird, two STRAIGHT back-horns (the t1-vs-t2 differentiator), no heat.

### 5.3 rodan_mv — fire demon (Tier 2)

- **Canonical ref:** MonsterVerse "Titanus Rodan" (2019 KotM / GxK Supernova). DARK-RED skin encrusted in a secondary crust of sharp VOLCANIC ROCK/charcoal; RED-GLOWING MAGMA CRACKS run through the body between plates (Smaug-style); the BOTTOM EDGE of the wings glows fiery orange and DRIPS magma; a distinctive V-SPLIT head crest whose two tips CURL INWARD; largest-wingspan bird-of-prey physique.
- **Current problem:** nearly identical to base rodan — same single-membrane wing, same head, just slightly darker brown (`#704214`) +0.05 bulk / +0.2 wingSpan; NONE of the MV signatures exist (no dark-red volcanic-rock skin, no magma cracks, no glowing wing-underside, no V-split crest, aura/fxMotes null).
- **Shape:** `wingSpan 3.1` (visible step up), `bulk 1.1`, charred jaggier scallop count (3 vs base's 2), slightly broader membrane, `fireRim:true`.
- **Draw changes:** Inherits the airborne pose from rodan. (1) `drawMagmaCracks` — REUSE the shared `drawFissures` helper (§1.7), NOT a parallel routine: 3–4 short branching crack polylines in `plateEdge` with a wider lower-alpha `plateGlow` under-stroke; each crack **≥2.2px opaque core** (the glow read at iso comes from the bright opaque core, not blur — none available in bake), confined to the lit upper body. (2) Wing HOT-RIM (`fireRim`): stroke the trailing scalloped edge with a `plateGlow` rim (lineWidth ~`BH*0.03`) + 2–3 short magma DRIP triangles hanging off the lowest scallop points (the canonical glowing wing underside). (3) **RESHAPE THE CREST to the V-SPLIT INWARD-CURLING variant** [critique — the load-bearing t1-vs-t2 silhouette differentiator; must be a bold CUT shape, not a stroke]: `drawCrestHorns` `'vsplit'` — two prongs fork from a common base and hook their tips back toward each other. Chest spikes stay (dark-rock colored with hot crack accents). (4) Self-illumination rim GRANTED (full-silhouette, aura-derived orange, §1.2).
- **Palette → dark volcanic charcoal-red:** `skin '#5c1e14'`, `skinDark '#2e0f0a'` (rock crust), `skinLight '#8a2e1c'`; `eye '#ff9933'`; `aura 'rgba(255,90,20,0.12)'`, `fxMotes 'heat'` (both currently null); magma channel `plateEdge '#ff6a1e'`, `plateGlow 'rgba(255,90,20,0.85)'`; breath stays orange.
- **Escalation vs t1:** cold rock-bird → living volcano — dark-red volcanic skin, magma crack seams, glowing/dripping wing underside, the V-split inward-curl crest (vs t1's straight horns), heat aura + self-illum rim.

### 5.4 rodan_fire — incandescent magma comet (Tier 3)

- **Canonical ref:** Heisei FIRE RODAN (1993 GvMechagodzilla II), the radiation-supercharged form. Skin turns VERMILION RED; the HORNS/CREST and CHEST SPINES turn BRIGHT GOLD; the BEAK turns BLACK; gains a uranium HEAT-RAY. Same pteranodon silhouette as base but fully incandescent — for this arc, MV Rodan pushed to a self-igniting magma comet, wings emitting lava.
- **Current problem:** best-differentiated of the three (orange skin `#ff6b35`, aura + 'heat' motes set) but still just an orange-skinned version of the same plain membrane: NO unique shapes — no gold horns/crest, no gold chest spikes, no black beak, no white-hot crack seams, no glowing molten wing-edge, no flame trail; the Heisei gold-spikes / black-beak / vermilion-body color contract is entirely absent.
- **Shape:** `wingSpan 3.4` (largest), `bulk 1.2` (highest), most/most-numerous wing scallops, brightest/widest molten trailing rim, biggest brightest magma drips. `fireRim:true`.
- **Draw changes:** Inherits airborne pose + magma cracks + hot-wing-rim + V-split crest from rodan_mv, then maxes every channel. **THE HEISEI COLOR CONTRACT (3 hard accent reads — the load-bearing t3-vs-t2 differentiator [critique]):** (1) recolor the CREST/HORNS to BRIGHT GOLD `#ffd24a`; (2) recolor the CHEST SPIKES to the same gold `#ffd24a`; (3) darken the BEAK toward charcoal-black `#1a0e08` (`drawPteranoBeak` gains a `colorOverride` param). White-hot crack core: a thin `#fff6cc` center stroke over the `plateEdge` crack (cheap). **Flame/comet trail — decide ONE layer, don't double [critique]:** if BAKED, a single low-alpha `plateGlow` tapered triangle off −X, kept SHORT (< `BW*0.6`) to avoid clipping the 150px-wide canvas (this is already the widest sprite at wingSpan 3.4 + bulk 1.2); if LIVE, leave it to the existing `fxMotes:'heat'` system and bake nothing. Self-illumination rim GRANTED (full-silhouette, strongest aura).
- **Palette → glowing-coal vermilion:** `skin '#ff5a1e'`, `skinDark '#c23008'`, `skinLight '#ffb066'` (whole body a hot ember, not rock); magma cracks WHITE-HOT — `plateEdge '#ffcc33'`, `plateGlow 'rgba(255,140,0,0.98)'`, near-white crack core `#fff6cc`; `eye '#ffdd00'`; `aura 'rgba(255,80,0,0.20)'` (strongest); `fxMotes 'heat'` (live).
- **Escalation vs t2:** peak incandescence — body lit from inside out, gold crest + gold chest-spikes + black beak (the Heisei contract), white-hot cracks, biggest molten wing-edge + drips, optional comet trail; the self-igniting magma comet. Cross-family: gold accents sit near super_mecha/burning in palette, but archetype silhouette (airborne pteranodon triangle vs grounded blocky robot vs hunched plated wyrm) resolves it cleanly.

---

## 6. Mecha family — Mechagodzilla (4 forms)

### 6.1 Family silhouette identity

A bipedal robot-Godzilla whose **OUTLINE — not its surface decals — must read "machine"** at ~40px. Brand silhouette: a straight/upright back (not the wyrm's hunch), a hard BLOCKY chest cross-section, ANGULAR joints (rectangular shoulder caps and shin/forearm blocks, not organic taper), a BOX skull with a bright horizontal VISOR bar or paired pinpoint eyes, a vertical row of flat-topped angular dorsal fins, antennae, a SEGMENTED rigid tail. The current code borrows the organic wyrm torso/leg/arm/tail verbatim and stamps rivets/panels on top — so at distance Mecha collapses into "lighter-gray Godzilla."

**The redesign HARDENS the actual paths:** replace `drawMechTorso`'s curved egg with a **beveled-trapezoid hard-shoulder block**; swap `drawLeg`/`drawArm` calls for **angular mech limb routines**; make the dorsal/joint geometry escalate per tier. Shape becomes the read; rivets/seams (sub-2px) are portrait/upgrade-scale only (§1.4).

**Belly-highlight:** DROPPED (machines get specular edges, not soft belly sheen — §1.8). **Specular:** uses the shared `RIM` token, NOT `pal.skinLight` (§1.1). **Back-facing:** visor-bar back / antennae / spine backs (§1.9). **Data-driven joints:** the `joints:'round'|'angular'` and `organicSeams:true` switches are read as shape params in the SHARED `drawMechLegPanel`/`drawMechArmPanel`/`drawMechPanels` routines so all four forms share one code path (a clean param branch — never a fork that regresses siblings).

**Escalation knob [critique]:** the primary dorsal `plates` count/`spineSize` is **non-monotonic** (plates 5/7/10/11, spineSize 0.7/0.95/0.75/1.15) — this is INTENTIONAL and stated here so it doesn't read as a regression: **mecha escalates on DIFFERENT axes per tier** (t1 crude/round, t2 outward shoulder weapons, t3 sharpness/multi-row, t4 over-built mass). The roster-comparable escalation signal is **total over-built silhouette complexity / weapon-mass**, which rises every tier even where raw spine count dips (t3's multi-row 10 sums to more visible blade area than t2's 7). Four maximally-separated palettes (chrome / steel-blue / black-red / gold) prevent cross-tier color confusion.

### 6.2 mecha_1 — crude Showa robot (Tier 1)

- **Canonical ref:** Showa Mechagodzilla (1974/75), the original "fake Godzilla." PURE SILVER/CHROME Space-Titanium body (no hue tint); a ROUND, crude, almost smooth mechanical Godzilla skull with a wide grinning missile mouth; the signature TWO RED CYBANEK control orbs at the head temples; ROUNDED riveted bulbous shoulder caps + a shallow shoulder frill; stub finger-missile hands; a single crude row of silver dorsal fins; multicolored eye Space Beam. The crudest, roundest, most "bolted-together" robot.
- **Current problem:** head is a generic box+single-visor with zero Showa identity and NO red Cybanek orbs (THE Showa identifier); shoulders are thin flat rects, not rounded riveted caps; no finger missiles; shares the identical 9-spine array + organic torso/leg/arm with every other tier (zero silhouette escalation); chrome palette correct but the round crude "first robot" character never comes through.
- **Shape:** `{ plates:5, antennae:1, panel:true, joints:'round', cybanek:true, fingerMissiles:true, headStyle:'roundShowa', bulk:0.95, spineSize:0.7 }`.
- **Draw changes:** (1) `drawMechTorso` — replace the wyrm egg-curve with the new hard mech-block path (straighter back edge, flat top shoulder line); for THIS tier soften the top corners with short quadratics so the chest reads bulbous/crude vs the sharp later tiers. (2) `joints:'round'` branch in the shared limb/shoulder routines: shoulder caps as filled SEMICIRCLES (`ctx.arc`, `pal.skinLight` fill + `RIM` stroke) instead of rects — the rounded bulbous cap is the Showa read. (3) `headStyle:'roundShowa'`: round the skull box top corners (quadraticCurveTo) and ADD the two CYBANEK ORBS — two small filled `pal.eye`-red domes (radius ~`hw*0.18`, with a `RIM` specular dot) flanking the skull at temple height, OUTSIDE the visor (the strongest cheap identity add — must not be overdrawn by the visor). (4) jaw: widen + add 3 tiny `pal.plateEdge` dots = grinning missile-mouth ports. (5) `fingerMissiles`: at the near-arm hand tip, 3 short stub barrels (thin `pal.skinDark` rects ~`BH*0.015` wide). (6) `drawMechSpines` N=5, spineSize 0.7 — fewest, shortest fins via `drawRidgeElement` (§1.7).
- **Palette:** purer/brighter chrome with value spread for the new flat-fill torso — `skin '#b8b8b8'`, `skinDark '#6e6e6e'`, `skinLight '#f0f0f0'`; KEEP `eye '#ff0000'`. Change `plateEdge` from near-white `#e8e8e8` (rivets vanish) to a darker steel `#8a8a8a` so seams/rivets read as metal lines not glow; keep `plate '#c0c0c0'`. Verify the chrome value spread (`#6e6e6e`→`#f0f0f0`) is wide enough that the hard-block torso reads as flat-paneled robot, not gradient-shaded organic body.
- **Escalation role:** the baseline — round joints, round skull + red orbs, 5 short fins, heaviest visible rivets (the bolted tier). The red Cybanek orbs are the strongest separator from both a plain wyrm AND from mecha_ghidorah's cyan-visor center head — must survive iso.

### 6.3 mecha_2 — sleek military-jet (Tier 2)

- **Canonical ref:** Heisei MechaGodzilla 2 / Super MechaGodzilla (1993, with Garuda). SLEEKER streamlined steel-blue/gunmetal body (NT-1 alloy); a sharper, more ANGULAR HELMET-like head with a defined snout + thin mouth; LARGE blocky paired SHOULDER CANNON pods (paralysis missiles fire from the shoulders) — the oversized shoulders are THE signature; dorsal plates that GLOW/BLINK right before the rainbow Mega-Buster mouth beam; wrist launchers; Garuda chin/shoulder aircraft prow.
- **Current problem:** body identical outline to t1/t3 with NO enlarged shoulders (the Heisei signature missing); only shape diff from t1 is +1 antenna (invisible at iso); head the same soft box (no "sharper next-gen" read); dorsal spines don't glow; palette (steel blue) does all the work alone.
- **Shape:** `{ plates:7, antennae:2, panel:true, joints:'angular', shoulderCannon:true, headStyle:'helmet', glowSpines:true, bulk:1.05, spineSize:0.95 }`.
- **Draw changes:** (1) `shoulderCannon:true` branch in the shared panel routine — replace small shoulder rects with PROMINENT boxy launcher PODS that break the silhouette OUTWARD beyond the torso edge: a near-shoulder block ~`BW*0.30 × BH*0.22` proud of the shoulder line, filled `pal.plate`, stroked `pal.plateEdge`, with 2 small dark muzzle circles on its outer face. **This outward-breaking shoulder is the single most important add — it changes the SILHOUETTE, not the surface.** (2) `drawMechTorso joints:'angular'` — sharp beveled hard-block path (no softened corners) so it reads sharper/sleeker than t1. (3) `headStyle:'helmet'` — angular wedge skull: bevel the front-top corner into a defined snout point, thin the visor into a narrower angled slit. (4) `glowSpines:true` — **bake STATIC at a mid-pulse value [critique]:** fill each spike's top third with `pal.plateGlow` at a fixed mid-alpha (NOT keyed to `frame` — the idle sprite bakes at frame=0 and a real blink would freeze there anyway, §1.6). The actual animated Mega-Buster blink is the live `drawGlow` overlay's job in entities.js. `plates:7` via `drawRidgeElement`. (5) keep 2 antennae but thinner (lineWidth 1.2). (6) optional Garuda nod: one small forward-pointing chin prow fin under the snout.
- **Palette:** deepen the steel-blue value spread — `skin '#4a86bd'`, `skinDark '#1c3858'`, `skinLight '#86bade'`; keep `eye '#0080ff'`; `plateEdge '#bfe3ff'` (tighter cyan-white so the new pod edges + glowing spines pop); `plateGlow 'rgba(100,180,255,0.8)'`.
- **Escalation role:** shoulders grow outward (the load-bearing silhouette change — prioritize it), head sharpens to a helmet wedge, spine count rises 5→7 and starts (statically) glowing.

### 6.4 mecha_3 — lean red-on-black predator (Tier 3)

- **Canonical ref:** MonsterVerse Mechagodzilla (GvK 2021), Apex-built on a Ghidorah skull. BRIGHT GUNMETAL + small black armor with intense NEON-RED energy glowing through the GAPS between plates; small bright RED eyes; head and toes resemble GHIDORAH — angular, horned, predatory, spikier than a Godzilla skull; back carries THREE rows of small square axe-blade dorsal fins with red-lit tips, converging to a single row down the tail; long SEGMENTED tail ending in twin spinning DRILL blades; X-shaped panel lines down arms/legs (Showa Cross-Attack-Beam homage); lean, aggressive, T-800-endoskeleton posture.
- **Current problem:** NO Ghidorah head (soft box+visor), NO drill-tip tail (blunt segmented end), the same single 9-spine row as everyone instead of the bladed multi-row back; red glow is on EDGES only (canon shows red bleeding through panel GAPS); none of the defining MV silhouette cues present; near-black body must stay dark to separate from chrome t1.
- **Shape:** `{ plates:10, antennae:0, horns:2, panel:true, joints:'angular', headStyle:'ghidorah', drillTail:true, xPanels:true, gapGlow:true, bulk:1.0, leanPose:true, spineSize:0.75 }`.
- **Draw changes:** (1) `headStyle:'ghidorah'` — swap the box skull for an angular predatory WEDGE: forward-pointed snout (triangle nose), two BACKSWEPT HORNS replacing antennae (two tapering `RIM`-tipped lines curving back over the skull), and TWO small twin `pal.eye`-red eye dots instead of the single visor bar. (2) `drillTail:true` in `drawMechTail` — replace the blunt rounded tip with TWO converging blade/drill triangles (a vertical pair of sharp `RIM`-edged points) + 2 extra segment stripes. (3) `drawMechSpines plates:10, spineSize 0.75` (small + sharp), **trim the "three rows" to one full row + a half-count smaller offset row [critique — a literal third row is sub-pixel-redundant cost; one full + one half reads "bladed multi-row" at ~40px]**, every tip a `pal.plateGlow` red dot. (4) `gapGlow:true` — fill the SEAM strokes (+2–3 short seam slivers) with `pal.plateGlow` red instead of `plateEdge`, so red reads as bleeding through gaps; **widen gap-glow strokes to ≥2px on the near-black body [critique — thin 1.5px red on `#1a1a1a` vanishes at iso]**. (5) `xPanels:true` — replace the limb rect+stroke with an X-cross seam (two diagonal `pal.plateEdge` strokes). (6) `leanPose:true` — shift the torso block lower/more forward (reduce top Y ~`BH*0.04`, lengthen) for an aggressive crouch. (7) **NIGHT-VISIBILITY (§1.5, mandatory):** thin red self-illum rim `rgba(255,32,32,~0.4)` around the silhouette — mecha_3 keeps its black FILL but gets the same edge-separation guarantee as supernova/void.
- **Palette:** excellent and on-canon — KEEP `skin '#1a1a1a' / skinDark '#0d0d0d' / skinLight '#4a4a4a'`, `plateEdge '#ff2020'`, `eye '#ff0000'`, `plateGlow 'rgba(255,50,50,0.85)'`. Body STAYS near-black so it separates from chrome t1.
- **Escalation role:** silhouette sharpens hardest — horned wedge head, bladed multi-row back, drill tail, red glow bleeding everywhere; the predator peak before the over-built apex.

### 6.5 super_mecha — organic-armor over-built apex (Tier 4)

- **Canonical ref:** KIRYU / MFS-3 Type-3 Mechagodzilla (2002) — organic-armor pinnacle built on Godzilla's real skeleton. Smooth shining LIGHT-SILVER/WHITE body whose armor follows BIOLOGICAL MUSCLE LINES (armored anatomy, curved seams, not a tank's boxes); bone-like exposed detailing at teeth/claws/tail-tip; a MASSIVE single lead dorsal fin + three rows of spines; a thicker, longer, organic segmented tail; exposed THICK BLACK WIRING/cables through armor gaps; a backpack FLIGHT PACK with rocket boosters + back/wrist cannons; rounded chest freeze-ray cannon. The game's GOLD/tan palette legitimately reads as the gold "final/ultimate" MechaG.
- **Current problem:** identical body outline + 9-spine array to all other tiers — nothing about its SHAPE says ultimate; no backpack weapons, no enlarged lead dorsal fin, no organic/anatomical curved seams (still rectangular panels), no exposed-wiring detail, no extra bulk; the gold palette is the ONLY thing carrying the apex read.
- **Shape:** `{ plates:11, antennae:2, panel:true, joints:'angular', headStyle:'helmet', backpack:true, organicSeams:true, leadFin:true, wiring:true, bulk:1.2, spineSize:1.15 }`.
- **Draw changes:** (1) `backpack:true` — drawn FIRST after the torso (behind the spines): a boxy thruster+missile-battery cluster on the upper back (a `pal.plate` block ~`BW*0.34 × BH*0.20` behind/above the shoulder line, with 2–3 small `pal.skinLight` thruster-nozzle circles glowing **opaque bright gold** `pal.plateGlow` at the bottom — NOT a blend mode, §1.6). This "super-armed" add is what makes "Super" read; nothing earlier has it. (2) `leadFin:true` in `drawMechSpines` — the FIRST (head-end) fin at ~2× size = a giant single lead dorsal fin, then `plates:11` of the normal array behind it; escalate spine MASS, spineSize 1.15. (3) `organicSeams:true` — **gate behind the shape param in the shared panel/limb routines [critique]** (if `organicSeams`: curved `quadraticCurveTo` muscle-line seams following the limb taper; else: existing rects) so mecha_1/2/3 are untouched — same pattern as `joints:round`. (4) `wiring:true` — 2–3 thick dark `wire` strokes (lineWidth ~`BH*0.02`) at neck-to-shoulder and hip gaps (exposed-cable hints); add palette key `wire '#241a10'`. (5) `bulk:1.2` — scale BH/BW so it is visibly the heaviest, most over-built of the five. (6) `headStyle:'helmet'` with a slightly bone-detailed jaw (3 `pal.skinLight` teeth like wyrm attack).
- **Palette:** keep GOLD (clearest "final" signal; separates cleanly from chrome t1 / blue t2 / black-red t3) — `skin '#d4a574'`, `skinDark '#8b6f47'`, `skinLight '#f0dcc0'`, `plateEdge '#ffd700'`, `eye '#ffd700'`, `plateGlow 'rgba(255,215,0,0.9)'`, `aura 'rgba(255,215,0,0.18)'`; add `wire '#241a10'`.
- **Feasibility note:** `bulk:1.2` + the lead fin (spineSize 1.15 × 2) is the tallest point in the roster — verify it fits the 150×168 canvas (anchor Y 144.5 leaves ~144px above for a body of BH≈`h*0.74*1.2`); the backpack-extended silhouette must also fit (§9).
- **Escalation role:** the ceiling — giant lead fin, backpack weapons, anatomical curved armor, exposed wiring, gold ultimate finish, heaviest bulk; unmistakably the most over-built of the ladder. Cross-family GOLD safe: vs grand_king (hydra fan) vs mothra_supernova (four-wing moth) — different archetype silhouettes disambiguate the shared gold instantly (the correct use of palette convergence at the "ultimate form" tier).

---

## 7. Flyer airborne flight-pose — the shared `buildFlyer` hover/flap contract

Mothra and Rodan now ALWAYS hover/fly over buildings at altitude. This is implemented ONCE in `buildFlyer`, with the body/legs/shadow rewrite gated on `wingStyle` so Mothra gets its moth treatment and Rodan gets its pteranodon treatment. **This is a real structural refactor of `buildFlyer`, not a drop-in** [critique] — today `buildFlyer` branches moth-vs-pterano only at the WING call but uses the SAME `drawFlyerTorso`/`drawBirdLeg`/contact-ellipse for both; the `wingStyle` gate must be added at the BODY / legs / shadow level too, or deleting the bird legs breaks Mothra.

The shared contract (the audit's CRITICAL flyer finding: today they are grounded bipeds — feet-contact shadow, walk legs, walk-FSM flap, hunched upright torso):

1. **Body axis horizontal, wings = dominant mass.** Replace `drawFlyerTorso` (the hunched wyrm egg). Mothra → `drawMothThorax` (compact furred horizontal oval ~`BW*0.34 × BH*0.30`, fuzzy stroked fur edge); Rodan → `drawPteranoBody` (slim near-horizontal lozenge, long axis +X beak-leading → −X stub-tail, 3-stop top→skin→belly gradient). Both centered at altitude (~`y=-BH*0.55`). Wing root drops from `rootY=-BH*0.62` to attach at thorax mid (~`-BH*0.55`) so wings are the platform, not held-up arms.

2. **Body tilt.** A `flightTilt` rotates the thorax/wing-root draw ~−0.18rad (slight nose-up hover). **Scope the rotation tightly** [critique] — wrap ONLY the thorax/wing-root draw in `save/rotate/restore`; if it rotates the whole frame, the detached shadow and eyespot geometry tilt too.

3. **Legs tucked.** DELETE the two `drawBirdLeg` calls and the `bob`. Add `drawTuckedTalons` — a small pair of curled tucked talons / short hanging stubs (~`BH*0.10`) near the abdomen, dark fill, no walk swing, no planted feet.

4. **Constant idle flap, decoupled from FSM** [critique — unify the two families]. Hoist ONE shared `FLAP_PERIOD` constant (~8 frames) and ONE idle-flap expression into the shared gate: `wingFlap = Math.sin((frame % FLAP_PERIOD)/FLAP_PERIOD * TAU)` in ALL fsm states (this is the same deterministic frame-keyed math the bake already uses, so idle-flap sprites bake correctly per frame). Each family scales only AMPLITUDE via `shape.flapAmp` (moth slower/wider, pteranodon faster/shallower). The attack overlay is unified to ONE gesture — an **additive deeper downstroke** `wingFlap += atk * flapAmp_attack` (NOT one family using `+atk*0.5` and the other a "negative pulse"). So both airborne groups hover at the same cadence skeleton and punch the same way on attack. Remove the walk `bob`; add a tiny vertical hover oscillation `y += sin(phase)*BH*0.02` so they idle like floating.

5. **Detached altitude shadow** [critique — ONE shared helper]. Replace the feet-contact ellipse with `drawAltitudeShadow(ctx, BH, BW, fg)`: a single soft ellipse pushed DOWN and slightly FORWARD, smaller/more transparent than the body, one offset formula (with `fg.dir` nudge for BOTH families — same altitude → same shadow), one alpha (~0.16), one size ratio (~`ctx.ellipse(BW*0.30, BH*0.55, BW*0.55, BH*0.05)` at `rgba(0,0,0,0.16)`). The visible gap between body and shadow reads "flying over buildings."

6. **Far-wing legibility.** Raise the far/back wing alpha (Mothra 0.70→0.82; Rodan 0.66→~0.80) and reduce the `compress` clamp floor so the full double-wing spread holds at iso. The two wings must not overlap at >50% mutual alpha (else they smear into one blob — the current failure).

7. **Back (N) facing** [critique — both families, never a bare ellipse]. For the airborne pose, the N view shows the full WING SPREAD from behind: Mothra → four-wing spread + two white antennae as rear stubs + furred thorax; Rodan → wing spread + two crest horns as rear stubs.

8. **Heat escalation of the pose** (Rodan t2/t3): a glowing bottom-edge rim-light on the spread wings (`fireRim`), and t3 the optional short flame/comet trail behind the body (§5.4, baked-or-live, not doubled).

---

## 8. Implementation sequencing

Five dependency-ordered phases. Build shared helpers first, then the wyrm as the proving-ground template, then the families in order of how much they reuse vs rewrite. The flyer rewrite is last because it is the deepest structural change to `buildFlyer`.

### Phase 1 — Shared helpers & house-style scaffolding (no visible form changes yet)
- Add the `RIM` constant (§1.1) and refactor existing wyrm/flyer rim + mecha specular + (future) ghidorah neck spec to use it.
- Write `drawRidgeElement` (dark core + lit face, §1.7) — the figure-ground primitive for wyrm plates, mecha spines, ghidorah horns.
- Write `drawFissures` (branching opaque ≥2.2px cracks + wider faint under-stroke, §1.7) — reused by wyrm burning/supernova AND rodan magma.
- Add the deterministic hash helper `fract(sin(i*12.9898)*43758.5)`.
- Establish the two-tier rim rule (§1.2), night-visibility invariant (§1.5), belly-highlight per-family policy (§1.8), back-facing invariant (§1.9), and the bake guardrails (§1.6) as documented conventions every later phase obeys.
- **Baking-impact:** none yet; pure infrastructure. Land this phase fully tested before any form changes so all five families share one set of primitives.

### Phase 2 — Wyrm template (the proving ground)
- Rebuild `drawPlates` on `drawRidgeElement` with per-index jitter + `plateJag` param; thicken `drawLeg`, widen `drawArm`, lower the head.
- Wire `bulk`/`plates`/`plateJag` into `buildWyrm` and the 5 wyrm FORMS.
- Apply `drawFissures` (burning orange, supernova white-violet), the self-illum rim (burning/gxk/supernova), the gvk lean-torso `torsoWidth` multiplier + 2 broken plates, the supernova night-visibility fix + cost trims.
- **Clipping note:** verify supernova (×1.4-height ×16 plates, bulk 1.15) fits the canvas top.
- **Why second:** the wyrm exercises every shared primitive (ridge, fissures, rim tiers, AO gradient, night fix) on the simplest archetype. It is the escalation-discipline template (§1.10) the other families mirror. **`drawTorso` is duplicated verbatim in `drawMechTorso`** — when narrowing the wyrm torso for gvk, keep the change LOCAL so the mecha copy doesn't desync (Phase 3 will replace `drawMechTorso` entirely anyway).

### Phase 3 — Mecha (hardens the shared torso/limb paths; defines the "machine" look)
- Replace `drawMechTorso` with the beveled-trapezoid hard-block; add the `joints:'round'|'angular'` and `organicSeams` param branches to the shared panel/limb routines.
- Build per-tier silhouette breakers: Cybanek orbs + round caps + finger missiles (mecha_1); outward shoulder pods + helmet wedge + static glow-spines (mecha_2); Ghidorah wedge head + drill tail + multi-row back + gap-glow + red night-rim (mecha_3); backpack + lead fin + organic seams + wiring + bulk (super_mecha).
- Drop the belly-highlight for the family; switch specular to `RIM`.
- **Why third, and a CROSS-DEPENDENCY with Phase 4:** mecha_3's `headStyle:'ghidorah'` wedge head and, critically, mecha_ghidorah's **reuse of `drawMechHead` (headStyle:'helmet') for its machine center head** mean the mecha "machine head" routines must exist and be stable BEFORE the Ghidorah cyborg form is built. **`drawMechHead` → Ghidorah cyborg is the key cross-family dependency** — Phase 3 must finalize `drawMechHead`'s `headStyle` branches and the steel palette token so Phase 4's mecha_ghidorah can call them rather than inventing a bespoke skull. [critique]
- **Clipping note:** super_mecha (bulk 1.2 + lead fin ×2) is the tallest roster point — verify canvas fit.

### Phase 4 — Hydra / Ghidorah (the three structural reforms + the cyborg cross-dependency)
- Write `drawHydraNeck` (offset-fill tapered neck), `drawGhidorahHead` (skull + horn-crown via `drawRidgeElement`), `drawBatWing` (scalloped gold membrane). Add the back-facing fallback.
- Thread the **per-neck palette override** into `drawHydraHeads` (load-bearing for mecha_ghidorah).
- Build the arc: T1 crown + gold-token fix; T2 taller/wider fan + hooked 4th prong + RIM crest specular; T3 cyborg (gold outer necks + steel center reusing `drawMechHead` + α1.0 hydra-specific panels + mechanical bat-wings); T4 bodyBulk + forked-center horns; T5 void (fixed S-curve writhe + thorns + wormhole disc + cyan/gold night-rim).
- **Cross-dependency consumed here:** mecha_ghidorah calls Phase 3's `drawMechHead`/steel palette — Phase 4 must come AFTER Phase 3 closes.
- **Clipping note:** void_ghidorah's wormhole disc (~`BW*0.9`) sits near the canvas bottom — nudge up if it clips.

### Phase 5 — Flyer rewrite (deepest structural change, done last)
- Refactor `buildFlyer` per §7: add the `wingStyle` gate at BODY/legs/shadow level (not just the wing call); delete `drawBirdLeg`+`bob`; add `drawMothThorax`, `drawPteranoBody`, `drawTuckedTalons`, `drawAltitudeShadow`; hoist the shared `FLAP_PERIOD` + idle-flap + unified attack overlay; scope `flightTilt` tightly.
- Rewrite `drawMothWing` into the four-wing routine (forewing+hindwing, banded flat-fill layers, per-forewing eyespot ocelli); rework `drawPteranoWing` (scalloped trailing edge, single bold spar); add `drawCrestHorns` (+ `'vsplit'` variant), `drawChestSpikes`, the Rodan magma reuse of `drawFissures`, fireRim wing edge.
- Build the arcs: Mothra t1 white+blue / t2 orange-bronze + joint dots / t3 gold god-rays; Rodan t1 cold rock / t2 fire-demon V-split + magma / t3 vermilion gold-contract comet.
- Far-wing alpha fix, back-facing N-view for both, self-illum rims for the heat tiers.
- **Why last:** it is the only archetype whose entire body, leg, shadow, and animation model are replaced (grounded biped → airborne platform), and it depends on `drawFissures` (Phase 1) and the rim/night conventions being settled. It touches no other family's code, so isolating it last minimizes regression surface.
- **Clipping note:** mothra_supernova (wingSpan 3.3 + god-rays) and rodan_fire (wingSpan 3.4 + bulk 1.2 + flame trail) are the widest sprites — cap god-ray spokes (< `BH*0.4`) and flame trail (< `BW*0.6`); verify wing tips stay within `x∈[0,150]` from anchor 75 on E/SE facings.

---

## 9. Open risks

Ordered by likelihood × impact. The first two are the dominant concerns.

### 9.1 supernova bake-cost / LRU thrash (highest risk)
supernova is by far the heaviest sprite in the roster even after the §2.6 cost trims: 16 plates × (dark-core + face) + the white-violet fissures + the full-silhouette violet rim re-stroke + the single ridge radial wash + the overgrown crystalline geometry — all baked across ~13 frames. The bake itself is one-time and fine, but with a **96-entry LRU cache shared across all on-screen kaiju**, a supernova plus other titans on screen can thrash the cache and re-trigger these expensive bakes mid-frame, causing hitches. Mitigations already folded in: single radial wash instead of 16 halos, gradient faces capped to front-facing plates, rim re-stroke limited to the torso path. Residual mitigation to evaluate at implementation: consider a higher per-form bake budget or pinning the heaviest forms in the LRU when active.

### 9.2 Canvas clipping at the fixed 150×168 sprite (most likely outright failure)
This is the single most likely feasibility failure — not draw capability, but bounds. The fixed canvas + anchor (75, 144.5) is pressured from every direction by the redesign: Mothra wingSpan 3.3 + god-ray spokes (E/SE facings), Rodan wingSpan 3.4 + bulk 1.2 + flame trail, supernova ×1.4 plates × bulk 1.15 (top edge), super_mecha bulk 1.2 + lead fin ×2 (tallest roster point, top edge), mecha_2 outward shoulder pods (side edges), void_ghidorah wormhole disc ~`BW*0.9` (bottom edge). Mitigation: per-heavy-form bounds check during implementation; keep all outward elements short (god-rays < `BH*0.4`, flame trail < `BW*0.6`); nudge the void disc up.

### 9.3 mecha_ghidorah dual-palette regression
The cyborg gold/silver contrast depends on threading a **per-neck palette override** into `drawHydraHeads` (today indexed by `pal.skin`/`pal.skinDark` only). If not threaded, OR if the whole body greys out instead of just the center, the form regresses to the current "grey-painted dragon." Load-bearing builder change; flagged as the Phase-4 critical path. Also: do not overload the shared `drawMechPanels` with a full-plating α1.0 mode that `buildMecha` doesn't want — use the explicit alpha param or a hydra-specific panel routine.

### 9.4 Within-family twinning that rides on sub-iso cues
- **Ghidorah gold trio (T1/T2/T4):** the biggest twinning risk. T1 vs T2 must read at iso on the brighter metallic value (`#d4a000` vs `#f2c200`) + wider fan (1.25→1.45) + the hooked 4th-prong signature — if the value gap is too small, push apart. T4's forked-center horns are its safe anchor.
- **Rodan t1 vs t2:** twins if the V-split inward-curl crest is cut at iso — it is the load-bearing differentiator; must be a bold cut shape, not a stroke.
- **Rodan t3 vs t2:** twins unless the gold-crest + gold-spikes + black-beak triple contract all land.
- **mecha_1 vs mecha_3:** both could read as "lighter/darker Godzilla" if the silhouette breakers (Cybanek orbs; Ghidorah wedge + drill tail) don't survive iso; the four maximally-separated palettes are the safety net.

### 9.5 "Glow" words taken literally in the bake
Every per-form spec uses "glow / halo / additive / blink." If implemented as `shadowBlur`/`globalCompositeOperation`/`frame`-keyed pulses in the BAKE pass, they will either error against the pipeline constraints or freeze at frame-0 in the idle sprite. Mitigation: audit every "glow" word against §1.6 — soft glow = radial gradient; additive = opaque bright color; animated pulse = static mid-value baked + real animation deferred to the live `drawGlow` overlay.

### 9.6 Far-wing legibility on the airborne flyers
The two-wing-smearing-into-one-blob problem (current α0.70/0.66) is mitigated by raising far-wing alpha (0.82/0.80) and reducing the compress floor, but must be verified per-facing: the eyespot ocelli (Mothra) and the scallops (Rodan) must both survive on the compressed FAR wing, or the two airborne families risk briefly twinning (warm-bronze Mothra-GxK vs brown Rodan). Verify in the bake; flag if either signature drops on the far wing.

### 9.7 Determinism across frames/facings
Plate jitter, fissure seeds, thorn placement, and the Void S-curve must all be keyed to a stable index (plate index, neck index, form id) — NOT to `frame` or any RNG — or features will jitter/flicker between the baked frames and facings. The GLSL hash is the approved tool; the Void writhe is explicitly a fixed per-neck-index S-curve, not animated.

### 9.8 Roster-consistency drift during a long phased build
Because the families are built across five phases, the shared conventions (rim tiers, RIM token, night rim, belly-highlight policy, altitude shadow, flap timing, back-facing) can silently diverge if each phase re-implements them. Mitigation: Phase 1 lands ALL shared helpers and conventions first; every later phase consumes them and adds NO bespoke variant. Treat any per-form "ridge-only colored rim," bespoke shadow recipe, or per-family flap period that reappears in a later phase as a regression against §1.

### Key file references
- `/Users/MGitk/Projects/Godzilla Game/js/archetypes.js` — `facingGeom` L47, `drawTorso` L109, `drawPlates` L135, `drawHead` L165, `buildWyrm` L244, `buildFlyer` L322, `drawMothWing` L414, `drawPteranoWing` L466, `drawFlyerHead` L525, `buildHydra` L599, `drawHydraHeads` L675, `buildMecha` L736, `drawMechTorso` L802, `drawMechPanels` L825, `drawMechSpines` L940, `drawMechHead` L967.
- `/Users/MGitk/Projects/Godzilla Game/js/config.js` — `FORMS[]` L92–242 (per-form palette + shape; frozen `bulk`/`plates`, duplicate palettes, and non-canonical purple Ghidorah beams to correct per the family sections above).