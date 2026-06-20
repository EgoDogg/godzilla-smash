# Godzilla Smash → Unity (S3 Hybrid) — project conventions

Master plan: `../docs/campaign/unity-migration-plan.md` (§0/§3/§4/§5/§8/§9 + Appendix A).
Campaign ledger: `../docs/campaign/unity-campaign-progress.json` · boot: `../docs/campaign/UNITY-CAMPAIGN-BOOT.md`.
Reference spec (IMMUTABLE): the live web game at `../js/*.js` + `../config.js` (gz-v32). The web PWA stays live on `main`.

## The load-bearing rules
- **`Godzilla.Core` references NO `UnityEngine`** (`"noEngineReferences": true`). All pure logic + math live here, NUnit-testable headless. Verify by deleting the ref and recompiling. This is the seam the whole port hangs on.
- **`double`/`long`, never `float`/`int`** for money/HP/power: `ROW_HP` reaches 1e9, `WORLD2_COST` 12e9; `float` corrupts above 16.7M.
- **Bit-exact ports** (round-trip a REAL live-PWA vector as the test, not a vibe): `Mulberry32`, `Hash32`, `Crc32` (poly `0xEDB88320`), the `GZS1:` save codec (base64url-of-UTF-8 + `.`+crc32hex), `IsoMath.DepthKey = (wx+wy)*1024 + wz*4 + depthBias`, `TraumaModel` (clamp-on-add `min(t+mag/85,1)` + `*= 0.02^dt`, 12px peak — the anti-quake fix, port verbatim).
- **Port the logic, REBUILD the art** natively (Unity 2D Animation: 4 family rigs × ~20 data-skins; URP **soft-additive `OneMinusDstColor One` screen-blend** FX, NOT plain `One/One`; pooled-quad beams, NOT per-frame LineRenderer). DROP only the v3→v4 save-migration branch.
- **MCP = verification, not authoring.** Generate C# to disk; use the Unity-MCP bridge to compile/play/test/screenshot (L1/L2/L3). Run only git-clean; commit before every agent session.

## Layout (asmdef, one-way deps Core ← Data ← Presentation ← App)
`Assets/Scripts/Core` (no UnityEngine) · `Data` (ScriptableObjects) · `Presentation` (MonoBehaviour adapters) · `App` · `Editor` · `Assets/Tests/EditMode` (refs Core only).
