# KAIJU-BOOT · Godzilla Smash → Kaiju Smash (browser rebuild)

**The "where am I?" doc for the Kaiju Smash campaign. Read first on every session boot.**
Plan of record: `~/.claude/plans/users-mgitk-downloads-godzilla-smash-au-dreamy-lemon.md` (approved 2026-07-27).
Branch: `kaiju-smash` (off `main`; live gz-v32 on `main` is UNTOUCHED until the week-3 MVP merge, Mike-gated).
Ledger: `docs/campaign/kaiju/progress.json` (default-FAIL units W0–W3). Shared `../STEER.md` / `../BLOCKERS.md`.
The Unity campaign is PARKED on `unity-port` (`ccb1026`) — do not touch it.

## Canon (must hold)
- Game = **Kaiju Smash** (in-product name only; repo/URL stay `godzilla-smash`).
- Boss = **"Biosaurus"** — NOT "Bigsaurus".
- 12 dinosaurs replace the 20 kaiju · hazard combat (no chase AI) · shade coin-drop death (merge on repeat)
- Economy: HP 2–95, prices $60–$1800, save v5 fresh-start (no migration, no notice).
- Notches: max 20 · 5 start · World 1 sells 2 · price ramps $64→$100. Charms: Money Shape $78 / Shape of Heart $90, 3 notches each, store $190.

## Harness
- Orchestrator = Fable 5 (session). Build agents = **Opus 5 · medium effort, plain-markdown reports
  with a mandated heading skeleton — NEVER strict schemas** (wf_3d8fa26f lesson). Verify/research fleets = Fable 5 (schemas OK).
- Budget ≤1M tokens/week (~700k Opus build · ~200k Fable · ~100k glue+reserve). Never start a unit
  that can't finish; park at a clean tagged commit.
- Weekly loop workers, continuous-until-parked. **Every week gates on Mike** — park with ONE
  consolidated notification; next week arms on his go / STEER directive.
- Ships = tag `kj-s0`…`kj-s3` on the branch + fresh-port local preview (SW-stick gotcha: NEW port every verify cycle).

## SESSION-START RITUAL
1. `git -C /Users/MGitk/Projects/godzilla-smash branch --show-current` → must be `kaiju-smash`; `git log --oneline -5`.
2. Read `progress.json` → first unit with `passes:false` = resume point. Read `../STEER.md` tail + `../BLOCKERS.md`.
3. Re-ground: refute the unit's spec vs current HEAD before executing.
4. Per-unit gate: `node --check` every edited js · fresh-port browser boot clean · save round-trip OK · commit + tag + ledger flip.

## ART STYLE — DECIDED 2026-07-27: **`silhouette`** (Rim-Lit Silhouette)
Mike picked it at facing 0 (S) in the gvk-blue palette, city context on — overriding the hybrid
recommendation. `tools/styleforge/style-silhouette.js` is the shipping source; it registers into
`archetypes.js`'s dispatch rather than being ported. Do NOT build the bone rig.
Before scaling to 12 species: (1) fix SE/NE — near-identical outlines by construction, they need
authored point lists, not the x-squash derivation; (2) prove 5–6 dark masses stay distinguishable
before committing to all 12; (3) move the form-progression signal into accents/rim/eye, since the
body collapses to one tone. See `progress.json _gates.art_style.consequences`.

## WEEK MAP
- **W0 ✅ SHIPPED `kj-s0`:** economy rescale + v5 → Fable verify fleet → StyleForge → art gate CLOSED.
- **W1 (gated):** level architecture (parity gate first) + player HP + hazards → `kj-s1`.
- **W2 (gated):** gauntlet enemies + charms/notches + shade; art species batches in parallel → `kj-s2`.
- **W3 (gated):** finish roster + Teleport + Map + Biosaurus + tuning + rename → `kj-s3` = MVP → merge to `main` (Mike-gated).
