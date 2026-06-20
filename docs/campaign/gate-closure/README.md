# Gate-closure runbooks — Godzilla → Unity (S3 Hybrid)

Step-by-step, current-as-of-June-2026 instructions for the human gates (G0–G7) that block the campaign. Each runbook is self-contained: **Goal · Prerequisites · Steps · "You'll know it worked when…" · Done-when (which ledger gate it flips) · Sources · Re-verify-on-the-day.** Walk them with Claude via chat.

## What Mike already has (tailors these runbooks)
Xcode 27 + macOS 27 (above the iOS-26 SDK floor) · active Apple Developer account (Team `83T4PJ5UV6`) · a Google Play developer account · a low-end ~2020 Android test device. So these are mostly "use it / verify it," not "go acquire it" — except: the **Google Play verified-developer** check (new Sept-2026 requirement) and the **repo rename**.

## Locked decisions (from the approved plan)
- **MCP bridge:** CoplayDev/unity-mcp now; official Unity AI Assistant MCP later (still pre-release).
- **Unity version:** stay on 6000.5 for the spike; ship on the **latest LTS** (migrate at Phase-1 GO; re-verify at P6).
- **Build/CI:** local Fastlane now → Unity Build Automation free tier later (both zero-cost, Personal-legal).
- **Spine:** tabled (Phase-2 contingency only).

## Order to tackle them
| # | Runbook | Blocks | Status |
|---|---------|--------|--------|
| 0a | [G0a-repo-rename-cutover.md](G0a-repo-rename-cutover.md) | everything (do FIRST — space-free path) | ⏳ |
| 0 | [G0-mcp-bridge-ci.md](G0-mcp-bridge-ci.md) | the MCP verify loop + CI | ⏳ |
| 1 | [G1-unity-license.md](G1-unity-license.md) | unattended CI builds | ⏳ |
| 2 | [G2-fx-verdict.md](G2-fx-verdict.md) | P0-FXGATE (eye half) → the Phase-1 slice | ⏳ |
| 3 | [G3-on-device-perf.md](G3-on-device-perf.md) | P0-FXGATE (perf half) + P1-PERF-DEVICE | ⏳ |
| 4–7 | [G4-G7-later-gates.md](G4-G7-later-gates.md) | art rigs · Spine · camera/shop taste · store submission | 🔜 outlines (expanded at their phase) |

**Critical path right now:** G0a (rename) → G0 (bridge) unblocks Claude's visual verify loop; **G2 + G3 are the make-or-break** — they flip `P0-FXGATE`, which gates the entire Phase-1 parallel build. G1 + CI can lag (local builds suffice pre-launch). G4–G7 are months out.

> Fast-movers (MCP packages, store policies) ship weekly — each runbook has a **Re-verify-on-the-day** box. Sources are cited with dates; confirm before acting if it's been a while.
