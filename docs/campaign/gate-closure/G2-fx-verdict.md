# G2 — FX glow / feel / fidelity verdict (the eye call)

**Goal:** your subjective call on whether the ported supernova FX reads **faithful-in-spirit** (incandescent + alive — not flat, not blown-out neon) vs the web original, plus the gamma-match decision. This is the half of `P0-FXGATE` that can't be automated; the SSIM floor backs it objectively.

## Prerequisites
- G0a done (space-free path). Optionally G0 (MCP) for in-editor screenshots, but not required.
- FX already baked + shipped (`uz-P0-FXSPIKE`): `GodzillaSmash/Assets/Scenes/FxSpike.unity`, the `SupernovaFxRig` prefab, and 5 capture PNGs in `docs/campaign/shots/unity/fxspike-anim-*.png`.
- The live web reference: https://egodogg.github.io/godzilla-smash/ (switch to the **supernova** form).

## Steps
1. **See the Unity FX.** Open `FxSpike.unity` and press Play — the `SupernovaFxRig` renders the 5 effects (aura / 10 dorsal plate-glints / eye / cosmic motes + halo / breath-charge) over pale/mid/dark backdrop patches so you can judge the screen-blend over different backgrounds. (Quick alternative without Unity: open the 5 `fxspike-anim-*.png` captures.)
2. **Side-by-side vs web.** On the live PWA, get a supernova kaiju idling + firing; eyeball the aura pulse, the plate shimmer, the eye, the orbiting motes, and the beam against the Unity version.
3. **Run the objective floor:**
   ```bash
   cd /Users/MGitk/Projects/godzilla-smash && bash tools/fx-verify/run.sh   # bakes the web ref + SSIM vs the Unity captures
   ```
   Expect `mean SSIM ≈ 0.61 ≥ 0.55`. (URP blends LINEAR vs web sRGB, so this gates the gamma-robust *shape*, not pixel identity.)
4. **Gamma-match call.** If the Unity glow reads slightly off in absolute color/brightness vs web, that's the linear-vs-sRGB gap — the fix is a `pow(2.2)` toggle on the FX (noted in the FX spec). Decide: accept faithful-in-spirit as-is, or request the gamma toggle.

## You'll know it worked when
You can say "yes, that reads like the web's incandescent supernova" (GO), and SSIM ≥ 0.55. If it reads flat/neon: first confirm it isn't the desktop bloom (bloom is OFF by design); the residual is the gamma toggle (desktop-only halo is pre-authorized to be dropped on low-end).

## Done-when → unblocks
Record your verdict in `docs/campaign/STEER.md` (e.g. `## 2026-XX-XX · NOTE · G2 FX verdict · GO — faithful; gamma fine` or `· NO-GO — <what's wrong>`). GO = the **eye half of `P0-FXGATE`**. Combined with **G3** (on-device), `P0-FXGATE` flips → unblocks the entire Phase-1 parallel build.

## Re-verify-on-the-day
None — this is a human judgment + an automated SSIM. If `run.sh` SKIPs (missing puppeteer/numpy), it's best-effort; the editor side-by-side is the real call.

## Sources
In-repo: `tools/fx-verify/run.sh` + `tools/fx-ref-bake/bake.js` (the web ground-truth bake); the FX spec `docs/campaign/fxspike-build-spec.md` (gamma toggle, bloom-off rationale).
