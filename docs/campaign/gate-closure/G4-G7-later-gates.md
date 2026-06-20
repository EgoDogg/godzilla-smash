# G4–G7 — Later gates (outlines)

Months out (art rigs, Spine, taste, store). Outlines now; each expands into a full runbook when its phase arrives. Current-version facts (June 2026) captured so they're not lost.

---

## G4 — Hand-rig art craft (the ~15 irreducible human days)
**Goal:** trace + bone-skin + weight-paint the 4 family rigs (wyrm, flyer, hydra, mecha); the serial human bottleneck. Rig #1 (wyrm) = the learning tax (budget 1.5–2 weeks); rigs 2–4 hit a 3–5-day pace.
**Pipeline (current, Unity 6000.5):** 2D Animation **15.1.0** + 2D PSD Importer **14.0.3** + the Skinning Editor.
1. Claude runs the JS ref-baker once (`A.buildWyrm` on a scratch canvas → a frame-0 reference PNG) — the executable spec for the silhouette.
2. Hand-trace + part-split into a layered **PSB** (torso/head/neck/tail/near+far limbs); import via PSD Importer (`Use Layer Grouping`, `Import Hidden` as needed) → Unity builds the layered prefab.
3. Skinning Editor: Create Bones → Auto Geometry (Generate for Selected) → weight-paint (Weight Slider/Brush); hand-fix the dorsal + tail.
4. 3 clips (idle/walk/attack) driven by the sim FSM; pivot honors ANCHOR_X/Y; author S/SE/E facings, mirror the rest.
**Claude does:** the ref-baker + skin SOs + FormAssetRebuilder + all plumbing. **Mike does:** the trace/skin/weight craft (G4) + the Unity-2D-vs-Spine call (G5).
**Done-when → `P1-WYRM-RIG`** (rig #1), then `P2-RIGS-3X`.
**Sources:** Unity 2D Animation docs + "Rigging a Sprite with the 2D Animation Package" (learn.unity.com); PSD Importer blog. Skinning Editor workflow stable through June 2026.

## G5 — Unity-2D-Animation vs Spine (decided on rig #1, not abstractly)
**Goal:** does Unity's own 2D Animation sell organic motion, or is Spine needed — specifically for the **hydra's 3 neck chains** (the pre-registered escalation trigger)?
**Default:** Unity 2D Animation. **Escalate to Spine ONLY if** 2D IK can't sell the 3 necks.
**Spine facts (current):** spine-unity **4.3**, Unity-6 compatible; license is **one-time perpetual, royalty-free** — Essential **$69** (no mesh deform) / Pro **$379** (mesh deform — what the hydra would need). Tabled until the trigger fires; zero cost to defer.
**Done-when → unblocks `P2-RIGS-3X`** (hydra path). Decided live on the rig, by Mike's eye.
**Sources:** esotericsoftware.com/spine-purchase + /spine-unity-download (accessed 2026-06-20).

## G6 — Camera-angle/zoom + shop-layout taste
**Goal:** the iso camera matches the web look; the shop UI layout reads well. Minor taste calls.
**Camera (current):** Cinemachine **3.1.4/3.1.5** on Unity 6 — `CinemachineCamera` (vcam), `CinemachinePositionComposer` (damped follow), `CinemachineConfiner2D` (bounds), `CinemachineBasicMultiChannelPerlin` (trauma-shake amplitude). Match the web GRID (TILE_W 56 / TILE_H 28 / WZ_PX 40). Run the phase1-prep Step-3a API grep before writing `IsoCameraRig.cs`.
**Done-when → informs `P1-ISO-DEPTHKEY` (camera) + `P4-SHOP-UI`.** Claude builds against the web look; Mike eyeballs.

## G7 — Store submission (Apple + Google) — the compliance gate
**Goal:** both store binaries accepted. Mike owns accounts/agreements/questionnaires; Claude owns BuildScript/Fastfile/metadata drafts.

**Ship-version pre-flight:** migrate off the 6000.5 Tech Stream to the **newest stable LTS** and re-verify it builds under **Xcode 27 / iOS-26+ SDK** + **Android API 35** before submitting (see plan decision #2).

**Apple (you have Xcode 27 + an active account):**
- **SDK floor:** Xcode 26 / iOS 26 SDK is in effect (Apr 28 2026) — Xcode 27 clears it; just confirm the Unity build uses the iOS-26+ SDK.
- **Privacy manifest:** Unity 6 auto-generates `PrivacyInfo.xcprivacy`; an on-device-only game declares no data collection (confirm no third-party SDKs sneak one in).
- **App Privacy questionnaire:** "Data Not Collected" / no tracking / no ads / no IAP.
- **Age rating (new bands since Jan 2026: 4+/9+/13+/16+/18+):** cartoon kaiju destruction → likely **4+ or 9+**.
- **Encryption export compliance:** HTTPS-only → declare exempt/mass-market; reuse your existing compliance key if you have one.
- TestFlight → App Store Connect via Fastlane gym/pilot/deliver (local, Personal-legal).

**Google Play (you have a dev account):**
- 🔴 **Verified-developer identity requirement — enforced Sept 2026.** Verify your Play Console account identity (individual: ID verification; org: a free **D-U-N-S**, up to 28-day lead). **Do this early.**
- **Target API 35**, **AAB** + Play App Signing.
- **Data Safety form** — required even with zero data; needs a **privacy-policy URL** (you'll need to host a short one) + "no data collected."
- **IARC content rating:** cartoon violence is explicitly allowed.
- Fastlane `supply` to internal-test → production (local, Personal-legal).

**Ship v1 with NO real-money IAP** (the bounded economy forbids selling the power track → sidesteps Apple 3.1.1).
**Done-when → the P6 units** (`P6-IOS-PIPELINE`, `P6-ANDROID-PIPELINE`, `P6-STORE-COMPLIANCE`, `P6-SUBMIT-CUTOVER`). Run the `app-store-prep` checklist.
**Re-verify-on-the-day:** store policies move constantly — re-confirm the SDK floor, age-rating questionnaire, Play target-API, and the verified-developer status at submission. **Sources (2026-06-20):** developer.apple.com/news/upcoming-requirements + /help (age ratings, privacy, encryption); support.google.com/googleplay (target API, Data Safety, developer verification).
