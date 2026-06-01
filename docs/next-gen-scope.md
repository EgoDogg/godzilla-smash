# Godzilla Smash — Next-Generation Scope (autonomous build run)

> **Status: BUILT — 2026-06-01.** Phases 0–5 implemented in `index.html` + `game.js` (v1 slice preserved as `index-v1-slice.html`). World 2 content remains stubbed, as scoped.
> **Date:** 2026-06-01.
> **World 2 *content* is explicitly OUT of scope** — only its locked unlock flow is built this run.

---

## 1. Goal / definition of done

Upgrade the current single-screen slice ([../index.html](../index.html)) into a "next-gen" **World 1** with:

- A polished, fully-procedural **MonsterVerse Godzilla that evolves through 5 forms** as you power up.
- A complete **progression & economy**: money → *Stronger Claws* + *5 Evolutions*; **pay-to-unlock World 2** (shown locked).
- **Everything persists** between sessions (localStorage save).
- Juicy animation & FX (idle breathing, attack lunge, stomp, hit-flash, evolution transition).

**Done when:**
- [ ] Godzilla renders at Tier 1 and visibly transforms when an Evolution is purchased (all 5 tiers).
- [ ] Money, Claws level, Evolution tier, and World-2-unlocked flag survive a page reload.
- [ ] Shop has 4 tabs (Upgrades / Evolutions / Characters / Worlds); buying works; unaffordable items are gated.
- [ ] "Unlock World 2" is purchasable and routes to a **"Coming soon"** stub (no World 2 content).
- [ ] Light SFX play on key actions (stomp / hit / destroy / evolution) with a working mute toggle.
- [ ] Runs 60 fps, no console errors, verified by preview screenshot each phase.

---

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Platform | Web, HTML5 Canvas, **fully procedural — no external/image assets** |
| Core mechanic | Tap to attack (building HP = cash, 1:1) |
| World 2 unlock | **Pay-to-unlock** (capstone shop purchase) |
| Carry-over | **Everything persists** into World 2; World 2 just scales HP/payouts |
| Art | **Legendary MonsterVerse Godzilla, evolving** across 5 forms |
| Godzilla forms | 2014 → Burning '19 → GvK '21 → Evolved/pink '24 → Supernova '27 (speculative) |

---

## 3. Progression & economy

**Currency:** `money` = total HP destroyed (1:1). Everything carries over; saved to localStorage.

**Money sinks (the meta-progression):**
1. **Stronger Claws** — incremental attack upgrade (existing curve). Bridges the gaps between evolutions.
2. **Evolutions** — 5 MonsterVerse forms. Each purchase = **big attack multiplier + full visual transformation**. The headline loop.
3. **Characters** — other kaiju (future money sink). **This run: locked teaser tab only**, not playable.
4. **World 2** — pay-to-unlock capstone. Shown locked / "Coming soon".

**Proposed starting numbers (lift into `CONFIG`, all tunable — balance is its own phase):**

```js
// attack = startAttack(100) * EVOLUTION[tier].mult * powerGrowth(1.55)^clawsLevel
const EVOLUTION = [
  { tier: 1, form: 'Godzilla 2014',     cost: 0,           mult: 1   }, // default
  { tier: 2, form: 'Burning 2019',      cost: 50_000,      mult: 3   },
  { tier: 3, form: 'GvK 2021',          cost: 500_000,     mult: 9   },
  { tier: 4, form: 'Evolved 2024',      cost: 5_000_000,   mult: 36  },
  { tier: 5, form: 'Supernova 2027',    cost: 50_000_000,  mult: 180 },
];
const WORLD2_UNLOCK_COST = 100_000_000;
// Stronger Claws keeps existing CONFIG: baseUpgradeCost 500, costGrowth 1.9, powerGrowth 1.55
```

Shape: claws give a smooth ramp; each evolution is an earned milestone that both transforms Godzilla and unlocks the next HP bracket. World 2 sits beyond Tier 5 so it pulls the player through the whole ladder.

---

## 4. World 2 gate (pay-to-unlock) — flow only

Shop → **Worlds** tab → "Unlock World 2 — `WORLD2_UNLOCK_COST`". Gated until affordable. On purchase: deduct money, set `save.worldsUnlocked = 2`, show a **"World 2 — Coming soon"** panel. Build the transaction + the locked-state UI; **stub the destination.**

---

## 5. Art pass — the evolving Godzilla (procedural canvas)

Full reference: [research/monsterverse-evolution-ladder.md](research/monsterverse-evolution-ladder.md).

- **Approach:** cache static shapes (dorsal-plate geometry, eye masks) to an off-screen canvas; per frame animate only color, glow, and distortion. Batch fills by color. 60 fps.
- **Build features in cost order** (cheap wins first): skin fill + crevice shadow → dorsal plates → glow aura → eyes → breath beam → heat-shimmer/bioluminescence → evolution cross-fade → Supernova pulse.
- **Evolution transition is a *moment*:** cross-fade skin (~60 frames) + white flash + screen shake + (optional) roar SFX when a form is purchased.
- **City polish:** parallax skyline layers, MonsterVerse-grade building shapes, debris on destroy, optional day/night tint. Fix the existing label-overlap nit (draw all bodies, then all labels in a 2nd pass).

---

## 6. Animation & juice checklist

- [ ] Idle breathing — sine wobble on chest/plates, ~0.5 Hz, ±2 px
- [ ] Attack lunge — 0.3 s forward translate + chest scale-up, then recoil
- [ ] Stomp — leg compression (scaleY 0.8) + camera shake
- [ ] Tail sway — root rotation ±15° at ~1 Hz
- [ ] Breath charge — dorsal-plate glow pulse + beam opacity ramp
- [ ] Hit flash — white overlay (rgba 255,255,255,0.4) ~2 frames
- [ ] Impact particles — radiating lines/circles, decay + drift
- [ ] Squash & stretch on stomp
- [ ] Plate shimmer — animate `shadowBlur` + breath together

---

## 7. Character roster — future money sink (locked teaser only this run)

Ranked from the research pass; ability hooks fit the tap-to-destroy loop. Shown as locked "Coming soon" cards.

| # | Kaiju | Ability hook |
|---|---|---|
| 1 | Godzilla (forms above) | Charged atomic beam — single massive directional hit |
| 2 | King Ghidorah | Triple lightning — hits 3 buildings at once |
| 3 | Mothra | Aerial strafe + powder-cloud damage-over-time |
| 4 | Mechagodzilla | Missile spray + laser grid (area denial) |
| 5 | Rodan | Divebomb + impact shockwave |
| 6 | Gigan | Whirling slash — all adjacent targets |
| 7 | Anguirus | Armored charge — knockback, level a row |
| 8 | Destoroyah | Oxygen-destroyer pulse — % max-HP DoT |
| 9 | Biollante | Root entangle — place damaging zones |
| 10 | SpaceGodzilla | Crystal turrets — static auto-damage |
| 11 | King Kong | Ground pound — big AOE + stun |
| 12 | Godzilla (Showa) | Tail-swipe cone — wide, fast cooldown |

---

## 8. Build sequence (ordered phases — verify each before the next)

| Phase | Work | Acceptance |
|---|---|---|
| **0 · Refactor + save** | Section the code; add `CONFIG` economy block; add localStorage save/load (`godzilla-save-v1`, versioned) | Reload preserves money/level |
| **1 · Economy + shop** | Money, Claws, 5 Evolution tiers (logic + placeholder visuals), pay-to-unlock World 2 stub, 4-tab shop UI | Can buy claws, evolve (number jumps), unlock W2 → "Coming soon" |
| **2 · Tier-1 art** | Replace cartoon with polished procedural **MonsterVerse 2014** Godzilla + animations | One great form on screen, 60 fps |
| **3 · Evolutions 2–5** | Remaining forms + transition moment | Each purchase transforms the look |
| **4 · City + FX + audio** | Parallax skyline, building polish, particles, juice checklist, label-overlap fix, light Web-Audio SFX + mute toggle | City reads cleanly; FX + sound land; mute works |
| **5 · Balance + verify** | Tune `CONFIG` so the ladder paces well; final screenshot + console check | Smooth curve, no errors |

**Verification each phase:** start the preview server, screenshot, check console for errors (the loop already used this session).

---

## 9. Guardrails

- **Single self-contained `index.html`** (no build, no deps, no external assets). May split into a few *local* files (e.g. `game.js`) only if it exceeds ~1500 lines — still zero dependencies.
- All balance numbers live in `CONFIG`.
- localStorage key `godzilla-save-v1`, **versioned** so we can migrate the save when World 2 ships.
- **Budget (conservative):** implement in the main loop; use **cheap (Haiku/Sonnet) agents only for verification/review**, not code-gen. No further research spin-ups. Pause and check in if a single phase exceeds its acceptance criteria.
- **OUT of scope:** World 2 content, playable extra characters, audio files (procedural SFX only), multiplayer, monetization.

---

## 10. Confirmed decisions (locked 2026-06-01)

- **Characters this run:** locked teaser tab only — 12 kaiju shown as "Coming soon" cards; not playable.
- **Sound:** light Web-Audio SFX (stomp / hit / destroy / evolution roar) + a mute toggle. No audio files.
- **Budget posture:** **conservative** — main-loop implementation, cheap agents for verification only; pause and check in if any single phase balloons beyond its acceptance criteria.

Scope is locked. Kick off the run (optionally with a `+Nk` budget directive) and it executes Phases 0→5.
