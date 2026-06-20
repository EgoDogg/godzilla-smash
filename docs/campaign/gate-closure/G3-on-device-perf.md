# G3 — On-device FX perf / overdraw (low-end Android)

**Goal:** the real make-or-break — does the soft-additive FX layer hold up on a **real low-end ~2020 Android** (not the Editor, not a flagship): sustained framerate, overdraw out of the red, no thermal throttle. The static gate said peak ≤24 layers (measured 7); this measures actual GPU cost.

**Targets (from the plan §9.5 Gate 3):** **≥55 fps sustained** (30 hard floor only if visibly smooth) · overdraw profiled **out of the red (≤~3× avg)** · **no thermal throttle over ~5 min** · the particle-cap quality tier honored (320 desktop / 90 reduced-motion).

## Prerequisites
- G0a done (space-free path). G1 local license active (it is).
- **Android Build Support** module installed for 6000.5 (Unity Hub → Installs → 6000.5.0f1 → Add Modules → Android Build Support + OpenJDK + Android SDK/NDK). Target **API 35**.
- The low-end Android device in **Developer Mode + USB debugging** on; `adb devices` lists it.
- Something to render: build `FxSpike.unity` (the shipped supernova FX rig over the backdrops).

## Steps
1. **Switch platform:** Unity → File → Build Settings → Android → *Switch Platform*; add `Assets/Scenes/FxSpike.unity` to *Scenes In Build*.
2. **Development build + profiler:** check *Development Build* + *Autoconnect Profiler*; for Android, also *Build And Run* over USB (a debug keystore is auto-used for dev builds — no release keystore needed for profiling). HDR is already OFF in the scene (correction #8); leave bloom OFF.
3. **Deploy + run** on the device.
4. **Profile framerate + GPU:** attach the Unity **Profiler** (GPU module) and/or the **Rendering Debugger → Overdraw** view; watch sustained fps + the overdraw heatmap over the FX (aura/halo/beam region is the hot zone). On-device GPU tools (e.g. the vendor's, or Android GPU Inspector) are an alternative for overdraw.
5. **Thermal:** leave it running ~5 min with the FX firing; watch for fps decay (throttle).
6. **Particle cap tier:** confirm the FX respects the reduced-motion 90 cap when reduced-motion is on (the 320/90 tier is ported into the FX; for the spike the dominant cost is the additive overdraw).

## You'll know it worked when
The device holds ≥55 fps (or a smooth 30) on the supernova FX, the overdraw view isn't deep-red over the torso/beam, and there's no 5-minute throttle. If it janks: it's the transparent-FX overdraw — the pre-authorized fallbacks are (a) the desktop-only bloom stays off on low-end (already off), (b) trim aura/halo dead corners further, (c) accept faithful-in-spirit-minus-halo on low-end. None of this kills S3.

## Done-when → unblocks
Record the fps + overdraw numbers + verdict in `docs/campaign/STEER.md`. GO = the **perf half of `P0-FXGATE`** + evidence toward **`P1-PERF-DEVICE`**. With **G2**, `P0-FXGATE` flips → the Phase-1 parallel build is unblocked.

## Re-verify-on-the-day
Android Build Support module + API-35 target are stable; confirm the device's API level + that `adb` sees it. No fast-moving version risk here — it's hardware-measured.

## Sources
Plan §9.5 Gate 3 (targets) + §9.6 (the on-device step). Unity Profiler/Rendering Debugger overdraw: docs.unity3d.com (Profiler, Rendering Debugger). Google Play target API 35: support.google.com/googleplay (see G7).
