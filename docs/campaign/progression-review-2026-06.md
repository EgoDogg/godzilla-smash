# Progression Review — Earned vs Dopamine (2026-06-14)

8-lens agent-swarm walkthrough of the player journey (first-60s → early-form → mid-tracks →
late-climb → finale → post-finale, plus feedback + friction lenses). Scope (Mike): **analyze
AND auto-tune the clear wins**; surface the judgment calls. Raw swarm output:
`docs/campaign/progression-swarm-raw.json`.

## Verdict
**MIXED, leaning DOPAMINE-rich / EARNED-undersold.** The *economics* are tuned correctly
(HP === payout funds the exact upgrade that one-shots that building; combo ramps in ~9 kills;
claws double power on a clean bounded 1e9 cap with a designed win-finale). The weaknesses are
almost entirely **legibility**, not math: the game is built right but doesn't **show** the
player they're climbing. Re-grinding or steepening the curve would make it *worse*. Wire the
existing-but-disconnected feedback and it snaps into the intended balance with ~no difficulty
change.

### Journey by phase
| Phase | Balance | One-line |
|---|---|---|
| First 60s | too-easy | Numbers tuned (2-tap kills, first upgrade ~3s in) but the LOOP IS INVISIBLE — no onboarding, combo pip hidden on kill 1. |
| Early form | mixed | Grind length fine, but the first-form *moment* is a silent badge-swap and (at L0) 1.78× worse per-$ than claws — teaches forms are a trap. |
| Mid (tracks/combo) | mixed | Claws strictly dominates atkSpeed/moveSpeed; combo payoff was invisible (dead popup). Real earn, missing reward-dopamine. |
| Late climb | too-easy | Income (~2.78×/tier) outpaces cost (2×/level) so the approach *accelerates*; real friction is the un-signposted finale, not economics. |
| Finale | mixed | Climax beat is great but gated behind an undiscoverable statue with misleading guidance copy. |
| Post-finale | mixed | finaleSeen read nowhere; only sink is a 12e9 World-2 "Coming soon!" dead-buy, purchasable *before* the win. |

---

## SHIPPED — AUTO fixes (gz-v24, verified live)
- ✅ **AUTO-1 · Combo reward popup wired.** `FX.spawnRewardText` was fully built but had **zero
  callers**; `dealDamage` discarded the combo-scaled payout. Now fired from `world.destroy()`
  (covers DoT/AoE kills too) → green `+$N` pops on every kill, bigger with combo. *The single
  highest-leverage change — the chief number-go-up was invisible.* Verified: 21 kills → 21 pops,
  combo-scaled.
- ✅ **AUTO-2 · Form fanfare.** `buyForm` now `Env.announce`s "Recruited/Evolved to X!" (was
  SFX-only). Verified: "Evolved to Burning Godzilla — 2019!".
- ✅ **AUTO-3 · First-upgrade hint reframed** to the felt 2-tap→1-tap payoff (end-game as a
  parenthetical), not abstract finale framing.
- ✅ **AUTO-4 · Win-card copy fixed.** Dropped the false "CITY LEVELLED 100% / rubble" claim
  (city respawns) → "🗽 THE STATUE FALLS — CITY CONQUERED" + free-roam named as intentional.
- ✅ **Power N/19 meter** (Mike-requested = TASTE-7-B). The HUD "📍 Tier X/19" badge read the
  geographic frontier (`maxReachedRow`) — it showed 19/19 while attack was base-6. Replaced with
  **"⚡ Power N/19"** = how many ROW_HP tiers the current attackPower one-shots (19/19 ⟺
  attackPower ≥ CAP_HP ⟺ `canFinale`). Verified live: base power → 0/19, +1 claws → 1/19.

> **Deferred from AUTO:** AUTO-5 (gate World-2 buy behind `finaleSeen`) — entangled with TASTE-2
> below (if World-2 becomes a free finale grant, the buy button goes away entirely). Folded into
> that decision rather than shipped standalone.

---

## DECISIONS FOR MIKE — TASTE backlog
Each is a genuine character/product call. My recommendation in **bold**.

### TASTE-1 · Signpost the finale *(top priority)*
The win fires on smashing an **undiscoverable** statue (row 54, back-center, no marker) and the
only guidance copy actively points players away from it. Every lens that touched the finale
flagged this as the #1 issue — the game's single best dopamine beat (flash 0.95 / shake 22 /
hitStop 260) is left to a needle-in-a-54-row-haystack search; most likely place a *finished*
player quits one screen short.
- **A) Copy + one-time toast** when attackPower first crosses 1e9: "MAXIMUM POWER — find and
  smash the Statue at the city's heart to win." (cheap, reversible) — **recommended now.**
- B) A + a persistent off-screen arrow/beam toward the statue, gated on `canFinale()` (needs
  render work) — if A isn't enough.
- C) Keep fully discovered (no signpost).

### TASTE-2 · The 12e9 World-2 dead-sink
Post-win, the only purchase is World 2 at 12e9 (~3.2× everything else combined) and it buys a
"Coming soon!" tag — buyable *before* the finale, deflating the run-up.
- **A) Auto-grant World 2 as a FREE teaser at the finale** (set `world2Unlocked` in `markFinale`,
  remove the buy button) — **recommended.**
- B) Drop cost to 0, reframe "you've earned a peek."
- C) Keep 12e9 but only if re-pointed at a real NG+ payoff (see TASTE-4).

### TASTE-4 · NG+ / Prestige loop *(core product question)*
The game is strictly finite — one win card, exactly one playthrough, no reset hook. Highest-
leverage retention lever and the natural home for the dead 12e9.
- A) Add NG+ (wipe claws/forms/frontier, keep a persistent prestige multiplier, e.g. +20%/tier;
  needs save v4). Converts "bounded" → "bounded-but-loopable."
- B) Stay finite — "beat it once and you're done"; only clean up the ending.
- **C) Cheap hedge: a re-viewable 🏆 win card** (HUD button after finale) so the climax recurs
  without committing to a loop — **ship now, decide A vs B later.**

### TASTE-6 · Forms-vs-claws value inversion *(core economy character)*
At clawsL0, burning (cost 150) buys the same power 84 of claws buys — the first time the
aspirational "become a new monster" buy is affordable, it's 1.78× worse/$, training players
that forms are a rip-off.
- **A) Cheap de-trap: drop burning ~150 → ~90** (break-even with the claws it replaces) — keeps
  the curve. **Recommended** unless you want forms as a real axis.
- B) Structural: give each owned form a small permanent multiplier (forms become a distinct
  power axis) — touches the core damage formula, all 20 forms, the cap, the finale. Big rebalance.
- C) Leave it.

### TASTE-3 · The 3 upgrade tracks
Claws strictly dominates — one claws level (flat 2.0×) beats the entire atkSpeed track (~1.56×)
for less than that track's last level; both utilities go worthless once you one-shot a tier.
- **A) Accept they're flavor — re-price atkSpeed/moveSpeed as cheap impulse buys** (not a
  parallel "track" implying a tradeoff). **Recommended.**
- B) Make them a real choice — a coin-efficient "bridge" buy at a damage wall (structural; could
  flatten claws pacing; needs playtesting).
- C) Leave as-is.

### TASTE-5 · First-run onboarding (esp. touch)
Zero onboarding — touch players are never told tap-to-target or that a shop exists. Economics
make the first upgrade affordable ~3s in, but an untaught player may smash aimlessly and never
open the shop.
- **A) Minimal nudges: pulse the Shop button the first time any upgrade is affordable + show the
  combo pip from kill 1** (move it off screen-center). **Recommended floor.**
- B) A + a 2-step coachmark ("Drag to move / Tap to smash") + a touch tap-to-target ring.
- C) Keep pure-discovery.

### TASTE-7 · Other milestone signals (the badge is already done)
- A) Live "Collection X/20" in the Evolutions/Characters hints + a tier-up `Env.announce` gated
  to genuinely-new HP tiers (not every row — avoid spam in the dense city). **Both low-risk —
  recommended.** (The misleading badge — option B — already shipped as the Power N/19 meter.)
- C) Keep the ceiling hidden for idle-game mystery.

### TASTE-8 · Combo window character *(from open questions)*
Should the 3.25s window stay strictly anti-camp, or get a small grace (~3.75s, still < 4.5s
rubble dwell) so a clean chain survives normal roaming? And a stretch goal above the ×2 cap for
in-run mastery? — **judgment call, low-risk either way.**

---

## Open product questions (highest-leverage first)
1. **Finale guidance** — guided (toast, ≥ rec) or discovered? (TASTE-1)
2. **World 2** — real roadmap placeholder or permanent flavor? Either way the 12e9-for-a-tag goes. (TASTE-2)
3. **Product shape** — finite "beat it once" or a retention loop (NG+)? Decides the whole post-game. (TASTE-4)
4. **Forms as an axis** — distinct power source (per-form multiplier) or fixed-chunk claws? Several items hang off this. (TASTE-6)
5. **Tracks** — intentional flavor sinks or a real tradeoff? (TASTE-3)
6. **Onboarding** — explicit teaching or pure-discovery? (TASTE-5)
