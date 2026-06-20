# G1 — Unity license (local + CI)

**Goal:** have a working Unity license for (a) local batchmode builds/tests — needed now — and (b) unattended CI later.

**Key fact:** a Unity **Personal** license **cannot be activated headlessly via CLI** (no `-serial` flow for Personal — that's Pro/Plus only). It's activated interactively once via Unity Hub, then the resulting `.ulf` is reused. Cloud CI on Personal is EULA-gray (Unity says cloud CI needs Plus/Pro); **local builds + a self-hosted-Mac runner + Unity Build Automation's free tier are Personal-legal.** You use one device at a time → clean.

## Status: the LOCAL path is already cleared
Personal-license batchmode has been **proven working on this Mac** (the campaign runs `Unity -batchmode -runTests` + `-executeMethod` freely; license confirmed `2026-06-20`). So **for local builds + the headless test gates, no action is needed.** Verify any time:
```bash
# A clean batchmode run = the license is active (no licensing error in the log):
UNITY="/Applications/Unity/Hub/Editor/6000.5.0f1/Unity.app/Contents/MacOS/Unity"
"$UNITY" -batchmode -projectPath GodzillaSmash -runTests -testPlatform EditMode -testResults /tmp/lic.xml -logFile - 2>&1 | grep -iE "Successfully (updated|resolved) .*license|Licensing" | head
```
Or visually: Unity Hub → Preferences → **Licenses** → a "Unity Personal" seat is listed.

## Later — only if you set up cloud/GameCI builds
1. Ensure the Personal license is active in Hub (above).
2. Locate the license file (macOS): `~/Library/Application Support/Unity/Unity_lic.ulf`.
3. Add GitHub repo **secrets**: `UNITY_LICENSE` = the full contents of `Unity_lic.ulf`; `UNITY_EMAIL` + `UNITY_PASSWORD` = your Unity account creds. GameCI's `unity-test-runner`/`unity-builder` re-activate from these.
4. Flip the `if: false` guards on the `unity-editmode` + `android-aab` legs in `.github/workflows/unity-ci.yml`.

> ⚠️ **EULA box:** using a Personal license on **GitHub-hosted (cloud) runners** technically requires Plus/Pro. Personal-legal routes: **local builds**, a **self-hosted runner on your own Mac**, and **Unity Build Automation's free tier**. Pre-launch, local Fastlane builds (G0 + the store runbooks) avoid this entirely.

## You'll know it worked when
Local: a batchmode run logs `Successfully resolved/updated license` (no `Failed to handshake`/`no license` error). CI (later): the gated GameCI legs go green + produce an AAB on a fresh clone.

## Done-when → unblocks
Local license active = **local builds + the headless gates** (already true). The CI-secret + green-Unity-CI-leg = the **CI half of `P0-MCP-CI`** (deferred; not needed pre-launch).

## Re-verify-on-the-day
Unity's licensing terms have tightened around cloud CI (2025–2026) — re-read the current EULA before putting a Personal license on any cloud runner. The `.ulf` path + GameCI action names are stable; confirm GameCI's current major (`unity-builder` v5.x, May 2026) if you wire CI.

## Sources (accessed 2026-06-20)
docs.unity3d.com Manage-Your-License (Personal ≠ CLI-activatable) · support.unity.com macOS CLI activation · game.ci/docs/github/activation (UNITY_LICENSE = .ulf) · unity.com legal/terms-of-service (cloud-CI clause).
