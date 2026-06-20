# Bounded Economy + Win-Finale — Final Design (research-2026-06c · 2026-06-13)

6-agent workflow (wf_45dd62aa-cc7), confidence 0.93. Resolves the tester QA guidance: price the damage upgrade to its damage, cap it at one-shotting the strongest building, make that the win. Drives campaign unit UE (economy-finale).

## Pricing model
FINAL: clawsCost() = Math.round(formDef(activeFormId).base × Math.pow(CLAWS_MULT, clawsLevel + 1)) — i.e. KEEP Mike's literal "cost = new TOTAL attack power after the buy" (it equals attackPower-after-purchase). This replaces the broken round(12 × 2.6^level) curve at economy.js:168-170. CLAWS_MULT stays 2.0 (the constant that makes the curve self-balance — do NOT change it).

Per-level numbers, active form gz2014 (base 6): L1=12, L2=24, L3=48, L4=96, L10=6,144, L16=393,216, L20=6,291,456, L24=100,663,296, L25=201,326,592, L26=402,653,184, L27=805,306,368, L28=1,610,612,736. Each cost equals the new total power. Total lifetime spend to finale = 3,221,225,460 (~3.22 finale-buildings).

It overrules "cost=new total" only cosmetically: at ×2/level the three candidate formulas (new-total / current-damage / damage-gained) are the SAME curve scaled by a constant (cumulative 3.22e9 : 1.61e9 : 1.61e9 = 2:1:1), identical pacing/step-count/feel — only the printed price differs. Kept A (new total) verbatim because with HP===payout the building funding the upgrade is literally the one whose damage you're matching, so the contract reads true on-screen, and the existing shop subtitle (curPow → nxtPow ×2) already shows it. Live broken curve at L28 = 4.99e12 (~5000× max payout) is the confirmed stall.

## Cap + forms reconciliation
CAP IS ON TOTAL attackPower, NEVER per-form. attackPower() = form.base × 2^clawsLevel (economy.js:99-103) means form and claws are ONE multiplicative axis, so a per-form cap is incoherent. Cap condition (data-derived, survives ROW_HP retuning): CAP_HP = Math.max.apply(null, Cfg.ROW_HP) = 1e9. In buyClaws() add `if (attackPower() >= CAP_HP) { sfxDeny(); return false; }` at top — mirrors the shipped buyAtkSpeed:227 / buyMoveSpeed:242 LEVELS-cap deny.

FORMS coexist as base-jump SHORTCUTS on the same single ladder, KEPT MULTIPLICATIVE (form.base stays the damage driver). A base-B form lands you on rung log2(B/6); higher form = fewer remaining claws levels: gz2014 base6=28 levels, burning48=25, gvk240=22, gxk3000=19, supernova18k=16, ghidorah350k=12, super_mecha16.8M=6 (all converge on one-shotting 1e9). REJECTED the cosmetic-decouple (all forms deal base-6 damage) — cleanest math but guts the "bigger monster hits harder" power fantasy the shop is built on (economy.js:601/609). The beam/cloud/bolts/dive/volley attack.kind variety is the family-identity flavor layer on top. Critical: switchForm must PRESERVE clawsLevel and the WIN must gate on the global attackPower()>=1e9 check, never on form purchase.

TITAN forms >1e9 RESOLVED via HYBRID re-price (not pure post-finale gating): 15 of 20 forms currently cost ≥1e9 (ghidorah 1e9 → super_mecha 100e9, config.js:131-241) and are literally unpurchasable in a bounded economy. Re-price EVERY form below 1e9 as alternate base-jumps (≈1.5–2× the cumulative-claws cost the jump skips) so all 20 stay reachable as mid-game content with distinct attack styles — pure post-finale gating would strand 75% of the roster. Hard rule: NO form may cost ≥ the finale prize. Suggested: burning 150, gvk 700, gxk 10k, supernova 80k, ghidorah 2M, super_mecha 95M, etc. isFormUnlocked tier-chain gate (economy.js:201-210) needs no change.

## Finale mechanic
Finale = a SCRIPTED ONE-SHOT of the unique statue landmark. Promote SPECIALS.statue from hp:5e8 → hp:1e9 (config.js:260; already unique:true, place:'topmid', placed once at center-far). First time attackPower()>=1e9 AND the player destroys the statue: (1) CLIMAX BEAT reusing the evolution-transition machinery — full-screen white flash, max trauma shake, held slow-mo frame, evolution/roar SFX (spend the juice on this frame; a silent number flip is the documented anticlimax failure); (2) WIN CARD "CITY LEVELLED — 100%" with run stats (time, HP banked, forms owned, peak combo); (3) CAPSTONE CHOICE — Unlock World 2 (forward hook → existing "Coming soon" stub) or Free Roam/Victory Lap. NO prestige reset; World 2 is the NG+ analog.

Anchor to the FIXED statue, not "any 1e9 building," because rare houses carry hpMult up to 10 (diamond, config.js:267) → a diamond tier-18 is 1e10, and L28 power 1.611e9 one-shots a plain tier-18 but NOT a diamond. The unique 1e9 statue sidesteps both.

HARD-STOP on upgrading: the claws cap (attackPower()>=1e9 → sfxDeny) is the stop; shop row shows MAX (reuse atk-speed/move-speed MAX-tag pattern, economy.js:521-527) and telegraphs "Next: one-shots EVERY building" on the final purchasable level (L28 on base6, power 1.611e9 — L27=8.05e8 is allowed, L28 crosses 1e9, 28 buys total). WORLD2_COST=12e9 exceeds the 3.22e9 lifetime climb, so present the World-2 unlock as a post-finale gated affordance, not a mid-climb purchase.

## Steps & feel
28 steps base→1e9 from base 6 (fewer with higher forms: gxk=19, supernova=16, super_mecha=6). Affordability is a BOUNDED, FLAT sawtooth: 2.07–5.46 buildings of the tier you can currently one-shot per upgrade, mean 3.52 — the "a few kills per upgrade" feel-good band the whole way, never one building, never dozens. NO stall: ROW_HP grows ~2.78×/tier (geo-mean, range 2.72–2.96 — NOT the 2.3× in earlier notes; corrected) while cost grows ×2/level, so effective income slightly LEADS cost (log2(2.78)=1.48 → clear ~1 HP tier per 1.48 claws levels) and upgrades get cheaper in real playtime as you descend. Combo (payout ×1→×2, economy.js:144-157) scales payout not damage, so it tightens affordability ~1.0–1.5× without perturbing the damage ceiling. Verdict: a satisfying finite session-length arc; ×2/level is the sweet spot (don't go below ~1.6 — too granular — or above 2.0 — too coarse and loses self-balance). The old 2.6-growth curve (4.99e12 at L28) was the ONLY thing stalling the game.

---

# Bounded-Economy Final Design — Godzilla Smash (research-2026-06c)

**Status:** synthesis lock, >=97% on mechanics; two feel items flagged below at ~90%.
**Date:** 2026-06-13
**Verified against live code:** `js/config.js` + `js/economy.js` (all line refs confirmed).
**Full doc written to:** `/Users/MGitk/Projects/godzilla-smash/docs/research-2026-06c.md`

---

## 0. The decision in one paragraph

Make damage a **single bounded track**. Replace the broken claws cost curve (`round(12 × 2.6^level)`, which outruns income ~5000× by the finale) with **cost = the new TOTAL attack power the level grants** = `base × 2^(clawsLevel+1)`. Flat-marginal-price, self-balancing: from base 6 it is exactly **28 steps** to one-shot the 1e9 finale, total lifetime spend **3.22e9** (~3.2 finale-buildings), each step affordable from a bounded **2.07–5.46 buildings** (mean 3.52) of the tier you can currently one-shot — never stalls. Forms stay **multiplicative** (bigger monster hits harder) but become **base-jump shortcuts** onto the same ladder, re-priced below 1e9; the 15 forms priced ≥1e9 are re-scoped. The **cap** denies `buyClaws()` once `attackPower() >= max(ROW_HP)`, mirroring the shipped atk-speed/move-speed deny. The **finale** is a scripted one-shot of the unique `statue` (promoted to 1e9 HP) → climax beat → win card → capstone (World 2 / Free Roam). No prestige.

## 1. Pricing model (FINAL)

`clawsCost() = Math.round(formDef(activeFormId).base × Math.pow(CLAWS_MULT, clawsLevel + 1))` — Mike's literal "cost = new TOTAL after buy," kept verbatim. Replaces economy.js:168-170. `CLAWS_MULT` stays **2.0**.

At ×2/level the three formulas are the same curve scaled by a constant:

| Formula | Per-level | Cumulative (base 6) |
|---|---|---|
| **A — new total** (kept) | `6×2^L` | **3.22e9** |
| B — current damage | `6×2^(L-1)` | 1.61e9 |
| C — damage gained | `6×2^(L-1)` | 1.61e9 |

Pacing/steps/feel invariant; only headline price differs. Keep A — with HP===payout the contract reads true on-screen.

**Per-level (gz2014, base 6):** L1=12, L4=96, L10=6,144, L16=393,216, L20=6.29M, L24=100.7M, L27=805M, **L28=1.611e9 → one-shots 1e9 (last purchasable, 28 buys total).** Cum. spend 3.22e9. Live broken curve at L28 = 4.99e12 (~4994× max payout) = the stall.

**No stall:** ROW_HP grows ~**2.78×/tier** (geo-mean; range 2.72–2.96 — corrected from earlier 2.3×). Cost ×2/level. Affordability `cost_next / HP(best one-shottable tier)` = bounded **2.07–5.46, mean 3.52**. Combo scales payout not damage (economy.js:144-157), never perturbs the ceiling.

## 2. Cap + claws + forms under 1e9

**Cap on TOTAL attackPower, never per-form** (form × claws = one axis, economy.js:99-103). `CAP_HP = Math.max.apply(null, Cfg.ROW_HP)` = 1e9. In `buyClaws()` (economy.js:216):

```js
function buyClaws() {
  if (attackPower() >= CAP_HP) { sfxDeny(); return false; }   // MAXED
  var cost = clawsCost();
  if (!canAfford(cost)) { sfxDeny(); return false; }
  state.money -= cost; state.clawsLevel += 1; sfxBuy(); afterPurchase(); return true;
}
```

Deny on current power (not next-level test) so the level that *first* crosses 1e9 (L28) is the last buy and arms the finale.

**Forms = base-jump shortcuts, KEPT multiplicative** (`ceil(log2(1e9/base))`):

| Form | base | levels to finale | bare one-shots |
|---|---|---|---|
| gz2014 | 6 | **28** | tier 0 |
| burning | 48 | 25 | tier 2 |
| gvk | 240 | 22 | tier 4 |
| gxk | 3,000 | 19 | tier 6 |
| supernova | 18,000 | 16 | tier 8 |
| ghidorah | 350,000 | 12 | tier 12 |
| super_mecha | 16,800,000 | 6 | tier 14 |

> **Rejected: cosmetic-decouple.** Cleanest math but guts the "each form MULTIPLIES base attack" power fantasy (economy.js:601/609). Keep `form.base` as driver; attack.kind variety is the flavor layer. **Critical:** `switchForm` preserves `clawsLevel`; WIN gates on global `attackPower()>=1e9`, never on form purchase.

## 3. Titan costs > 1e9 — RESOLUTION (hybrid re-price)

**15 of 20 forms cost ≥ 1e9** (ghidorah 1e9 → super_mecha 100e9, config.js:131-241) — unpurchasable in a bounded economy. **Re-price EVERY form below 1e9** as alternate base-jumps (≈1.5–2× the cumulative-claws cost the jump skips) so all 20 stay reachable mid-game. Pure post-finale gating rejected (strands 75% of roster). Hard rule: **no form may cost ≥ the finale prize.**

| Form | base | suggested cost | | Form | base | suggested cost |
|---|---|---|---|---|---|---|
| gz2014 | 6 | 0 | | ghidorah | 350k | 2M |
| burning | 48 | 150 | | void_ghidorah | 2.6M | 15M |
| gvk | 240 | 700 | | rodan_fire | 12M | 70M |
| gxk | 3,000 | 10,000 | | mecha_3 | 15M | 88M |
| supernova | 18,000 | 80,000 | | super_mecha | 16.8M | 95M |

`isFormUnlocked` tier-chain (economy.js:201-210) unchanged — it already enforces the rung order.

## 4. Finale + hard-stop

Promote `SPECIALS.statue` hp 5e8 → **1e9** (config.js:260; already unique, center-far). **Finale = one-shotting the statue.** On first `attackPower()>=1e9` AND statue destroyed: (1) **climax beat** — reuse evolution-transition FX (white flash, max shake, slow-mo frame, roar SFX); (2) **win card** "CITY LEVELLED — 100%" + run stats; (3) **capstone** — Unlock World 2 (→ "Coming soon" stub) or Free Roam. No prestige.

> Anchor to the fixed statue, NOT "any 1e9 building": diamond rare houses are `hpMult:10` (config.js:267) → tier-18 diamond = 1e10, which L28's 1.611e9 cannot one-shot. The unique statue sidesteps this.

**Hard-stop:** claws cap (`attackPower()>=1e9 → sfxDeny`) → shop shows MAX (reuse economy.js:521-527) and telegraphs "Next: one-shots EVERY building" on L28. `WORLD2_COST=12e9` exceeds the 3.22e9 climb → present as post-finale gated affordance, not mid-climb purchase.

## 5. Progression-feel verdict

- **Steps:** 28 from base 6 (gxk 19, supernova 16). ×2/level is the sweet spot (don't go <1.6 or >2.0).
- **Affordability:** bounded 2.07–5.46 buildings/upgrade (mean 3.52) — flat across the whole ladder.
- **Stall:** none. Income ~×2.78/tier slightly leads cost ×2/level (`log2(2.78)=1.48`); upgrades get cheaper in real playtime.
- **Coherence:** one axis, one ceiling, one cap, one win action; all 20 forms reachable.

**Residual <97% (flag, don't block):**
1. *Forms multiplicative vs cosmetic* (~90%) — kept multiplicative for fit; cosmetic-decouple is the fallback if 20 base-jumps feel redundant.
2. *Titan hybrid re-price vs post-finale* (~88%) — re-priced below 1e9; if main game feels too shortcut-heavy (95M super_mecha trivially skips the ladder), raise the Titan premium to 2–3× or gate the top mecha tier behind the finale. Watch in first playtest.

## 6. Implementation checklist

| File / line | Change |
|---|---|
| economy.js:168-170 `clawsCost()` | → `Math.round(formDef(state.activeFormId).base × Math.pow(Cfg.CLAWS_MULT, state.clawsLevel + 1))` |
| economy.js:216 `buyClaws()` | add `if (attackPower() >= CAP_HP)` deny (`CAP_HP = Math.max.apply(null, Cfg.ROW_HP)`) |
| economy.js:496-515 `buildUpgrades` | MAX tag at cap (copy :521-527); telegraph "one-shots EVERY building" on final level |
| config.js:36-37 `CLAWS_BASE`/`CLAWS_GROWTH` | remove (unreferenced after recurve) |
| config.js:245-256 `CLAWS[]` table | **delete** — dead/unused data, stale trap |
| config.js:94-241 `FORMS[].cost` | re-price all per §3 (every cost < 1e9) |
| config.js:260 `SPECIALS.statue.hp` | `5e8` → `1e9`; mark finale target |
| economy.js (new) | finale state on first `attackPower()>=1e9` + statue destroyed; reuse evolution FX + world2 flag |
| config.js:35 `CLAWS_MULT` | **leave at 2.0** |

## 7. Comparables (finite / bounded incrementals)

- **Universal Paperclips** — single bounded number; free final-stage projects play as a cutscene → Accept (NG+) / Reject. One number, many flavors. ([Wikipedia](https://en.wikipedia.org/wiki/Universal_Paperclips))
- **A Dark Room** — win is a scripted action (ship launch) → completion fade. ([FAQ](https://www.vintageisthenewold.com/faq/how-does-a-dark-room-end))
- **Candy Box 2** — discrete completion action (open the box) → post-win unlocks. ([Wiki](https://candybox2.fandom.com/wiki/A_code_for_ending_the_game))
- **Cookie Clicker (counter-example)** — no true end; infinite number-go-up gets boring → supports bounded direction. ([ScreenRant](https://screenrant.com/cookie-clicker-ending-story-how-long-over-when/))
- **Clicker Heroes / AdVenture Capitalist** — `cost = base × g^level` tuned so price-per-DPS *worsens* (infinite grind). Our ×2/×2 holds price-per-damage *flat* — generous, finite, fits a one-shot finale + hard cap. ([Formulas](https://clickerheroes.fandom.com/wiki/Formulas), [Math of Idle Games I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i))
- **Genre framing** — infinite (prestige loops) vs finite (victory condition); both have demand. We are finite. ([Incremental game — Wikipedia](https://en.wikipedia.org/wiki/Incremental_game))