# Forms as a Power Axis — Design Fleet Recommendation (2026-06-14)

21-agent judge-panel fleet (5 candidate models × 3 lenses → synthesis). Mike leaned toward
"forms as a distinct axis"; this is the validated design. Raw: `forms-axis-design-raw.json`.

## Recommendation: Collection Multiplier + Option B (active double-count)

```
attackPower = START_ATTACK(6) × CLAWS_MULT(2)^clawsLevel × (1 + Σbonus[owned] + bonus[active])
clawsCost   = round(6 × 2^(clawsLevel+1) × (1 + Σbonus + activeBonus))   // = 2 × attackPower
```

**Why this wins all three lenses:**
- **Economy-integrity (the hard gate):** `(1+Σbonus)` appears identically in `attackPower`
  (economy.js:107-111) AND `clawsCost` (economy.js:181-185), so it **cancels** in the
  cost:income ratio — the bounded-economy invariant (ratio 2.000) holds at every multiplier and
  level, for free. No unlock-cost re-pricing.
- **No save migration:** pure formula change; derives entirely from already-persisted
  `ownedFormIds`/`clawsLevel`/`activeFormId`. **Stays save v3** (the fleet corrected my
  workflow's spec, which had wrongly called for v4). One-time "power rebalanced, progress
  intact" toast required (a deep save's *displayed* number restates).
- **Felt switch (the stated goal):** Option B double-counts the **active** form's own bonus, so
  wielding super_mecha hits harder the instant you press Switch — "becoming Ghidorah/Mecha is
  FELT." Owning *any* form is permanently net-positive (additive sum → no dead forms).

**Numbers:** `formBonus` sums to **63** → full 20/20 collection = **×64** base. Per-form:
- WYRM: gz2014 0 · burning 0.25 · gvk 0.5 · gxk 0.75 · supernova 1.5 (Σ3)
- GHIDORAH: ghidorah 1 · king 1.5 · mecha 2 · grand 2.5 · void 3 (Σ10)
- MOTHRA: gvm 2.5 · gxk 3.5 · supernova 5 (Σ11)
- RODAN: rodan 3 · mv 4 · fire 6 (Σ13)
- MECHA: mecha_1 4 · mecha_2 5 · mecha_3 7 · super_mecha 10 (Σ26)

**Cap/finale intact:** CAP_HP=1e9, statue, `canFinale`, `buyClaws` cap-deny all unchanged (read
`attackPower` transparently). Collection alone (×64 at L0 = 444) can't trip the cap. Full
collection = a **6-claws-step head-start** (22 vs 28 to one-shot the statue) — accelerates the
win, never shortcuts the deep-tier income wall. The first-form value-inversion **trap is killed**:
buying burning instantly ×1.25's your power on any active form.

## Implementation plan (when greenlit)
1. **config.js** — add `formBonus` to the 20 forms + `COLLECTION_FULL_MULT:64`, `ACTIVE_DOUBLE_COUNT:true`; boot assert `ΣformBonus===63`.
2. **economy.js** — rewrite `attackPower` (107-111) + `clawsCost` (181-185) with a memoized
   `collectionMult()` (recompute on buyForm/switchForm/load — never persist); fix the shop
   next-power preview (557-558).
3. **Eval-test the invariants BEFORE UI** (the gate): cost:income === 2.000 at mult {1,4,64} ×
   L {0,10,22}; collection-alone-at-L0 = 444 < 1e9; claws-to-cap = 22 at full collection; every
   per-purchase jump > 1.0.
4. **Shop/HUD copy** (load-bearing — the always-worth-it value is invisible without it): reword
   the form subtitles to "Collection power ×… (+… forever)"; add an X/20 live-multiplier meter;
   the "each form multiplies your damage" hint becomes literally true.
5. **Migration toast** + verify a synthetic deep v3 save loads with claws/forms intact.
6. Composite verification + deploy (gz-v2x).

## Runner-up grafts (for later)
- **Active ×2 Rank Ladder** scored best on pure scalability but trivializes form costs ~26× and
  forces a save-reshape — its felt-switch property is already grafted in via Option B.
- For World 2 / a second axis: the live `tier` field (0..19 monotonic) is already a clean global
  rank — `formMult(tier)` composes cleanly with the collection multiplier, zero new fields.
- Family-set milestone UI ("Complete the Ghidorahs — ×N") as a presentation layer over the
  additive sum.

## Open questions for Mike (Phase 0 spec-lock)
1. **Ship Option B from day one?** (felt switch; fleet's strong yes — verified cap-safe.)
2. **Bonus-table feel** — are the relative jumps right, or make the climax forms chunkier?
3. **Existing-save number shift** — explanatory toast (simple), or a power-preserving
   clawsLevel-nudge so the displayed number never drops (more code)?
4. *(deferred)* **World 2 target** — keep the clean 2^N rebate per World, or an auto-derived
   per-cost formula?
