# G0 — Unity-MCP bridge + CI approach

**Goal:** let Claude drive the Unity Editor over MCP — compile/read-console (L1), enter Play Mode (L2), screenshot the Game View (L3) — so the visual FX gates can be verified; and lock the (zero-cost) build/CI approach.

**Decision:** **CoplayDev/unity-mcp** (v9.7.x, stable, full L1/L2/L3, Claude-Code-proven). Unity's official AI Assistant MCP is still pre-release (~Q3 2026) — revisit then. **CI:** local Fastlane now → Unity Build Automation free tier later (see G1 + the store runbooks); keep the license-free Core CI leg green.

## Prerequisites
- **G0a done** (space-free path — both MCP bridges forbid spaces).
- The `GodzillaSmash` project opens in Unity 6000.5.
- Python 3 + `uv` on the Mac (the MCP server uses them; the install wizard checks). `python3 --version`; install uv if missing: `curl -LsSf https://astral.sh/uv/install.sh | sh`.

## Steps (Mike, in the Unity Editor)
1. **Confirm the OpenUPM scoped registry** is present (the skeleton ships `manifest-scopedRegistries.json`; Project Settings → Package Manager → Scoped Registries should list OpenUPM `https://package.openupm.com`). If not, add it.
2. **Install CoplayDev/unity-mcp.** Easiest: Window → Package Manager → **+** → *Add package by name* → `com.coplaydev.unity-mcp` (OpenUPM). **VERIFY the exact id + latest version on the OpenUPM page first** (it ships weekly): https://openupm.com/packages/com.coplaydev.unity-mcp/ . Alternative (git URL, pin a release tag NOT `#main`): `https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#v9.7.3`.
3. **Configure the client:** Window → **MCP for Unity** → *Configure All Detected Clients* (it auto-detects Claude Code). If it offers stdio vs http, take the default; note you must **restart Claude Code after switching modes**.
4. **Restart Claude Code** (so it picks up the MCP server config).

## You'll know it worked when
In a fresh Claude session, the CoplayDev MCP tools are available and Claude can run this **L1/L2/L3 smoke** over the bridge (ask Claude to):
- **L1:** list the GameObjects in the open scene + read the console (no compile errors).
- **L2:** run the EditMode tests → returns **20 passed, 0 failed** (matches the headless gate).
- **L3:** screenshot the Game View → a non-blank PNG.

## Done-when → unblocks
The L1/L2/L3 smoke green = the **MCP-bridge half of `P0-MCP-CI`** (record it in `STEER.md`). The *other* half (git-clone → CI → AAB unattended) needs **G1** (license) + a runner — that stays gated; pre-launch, local Fastlane builds cover it (the license-free `core-bitexact` CI leg is already green on Actions run 27865744261, so "git clone → CI green for Core" is met).

## CI approach (locked, zero-cost)
- **Now → soft-launch:** build locally via `BuildScript` + Fastlane on your Mac (Personal-license-legal; no cloud). Keep the free Core CI leg green.
- **Later:** Unity **Build Automation** free tier (100 Mac min/mo, Personal-supported) when you want automated releases. Self-hosted-Mac GitHub runner is the free fallback if you outgrow the free minutes. **Avoid GitHub-hosted macOS CI on a Personal license** — Unity's EULA requires Plus/Pro for cloud CI.

## Re-verify-on-the-day
CoplayDev ships weekly — confirm the **exact OpenUPM package id + newest version** on the package page, and **pin a release tag** (not `#main`). Re-check Unity 6000.5 compatibility in its release notes. If the official Unity AI Assistant MCP has hit GA by the time you read this, re-compare (it may have become the better pick).

## Sources (accessed 2026-06-20)
github.com/CoplayDev/unity-mcp (+ /releases, /wiki "Fix Unity MCP and Claude Code") · openupm.com/packages/com.coplaydev.unity-mcp · Unity AI Assistant MCP (still pre-release): docs.unity3d.com/Packages/com.unity.ai.assistant@2.7 · GameCI: game.ci/docs.
