# Phase-1 Vertical Slice — Build-Ready Spec (Post-FXSPIKE Run)

> 🟡 **PARTIALLY SHIPPED.** Steps 1–2 (the **IsoMath** depthKey/worldToScreen/GRID + **TraumaModel** Core ports) are DONE + dual-gate green (`uz-P1-COREPORTS`, commit `d74f720`). **As-built deviations:** the gen-vectors trauma vectors are a faithful node mirror (V8↔.NET parity); the spec's "File 2" `Godzilla.Core.csproj` edit is **moot** (Unity-generated/gitignored — the asmdef + CoreTests glob auto-include); TraumaModel's `else Trauma=0` is a documented normalization (sub-floor is unreachable at frame boundaries). Steps 3–7 (iso camera + Cinemachine + sort + sim/view seam + building FSM) are **NOT built** — gated on P0-FXGATE; pin Cinemachine `@3.1.4` and run the Step-3a pre-flight API grep before writing `IsoCameraRig.cs`.

**Scope:** the §9.3 / §9.4 vertical slice — depthKey + trauma bit-exact ports, iso ortho camera + Cinemachine rig, depthKey painter sort, fixed-step FixedUpdate loop + sim/view seam, building lifecycle FSM + tap targeting. Execute this **only after P0-FXSPIKE passes** (blend foundation already SHIPPED, gate(a) green at commit `7530d50`).

**Pattern:** every Core port follows the PROVEN P0-SKELETON dual gate — node ground-truth → `tools/core-tests/vectors.json` → license-free standalone dotnet round-trip (Leg A, CI core-bitexact, currently 144/144) **and** in-Unity NUnit EditMode (Leg B). Both green before tag/flip.

**Locked invariants (do NOT regress):** Core is `double`/`long`, NO `UnityEngine`, NO `Mathf` (it's `float`). `System.Math` everywhere. `Mulberry32`/structs held in **fields** (copying forks the stream). Per-form FX tint rides **vertex color**, never an MPB (SRP Batcher is ON, `m_UseSRPBatcher:1`). JS `Math.round` is **round-half-up**; C# `Math.Round` is banker's — always use `(int)Math.Floor(x+0.5)`.

---

## STEP 0 — Reconcile the iso ownership collision FIRST (blocks 3 specs)

**Finding `bitexact-seam/MED` + `web-fidelity/MED`:** three Phase-1 specs write overlapping projection/depth math into `Godzilla.Core` under two type names (`IsoMath` vs `IsoProjection`) → guaranteed duplicate-symbol / divergent-const drift. **Resolution (LOCKED): ONE canonical type, `Godzilla.Core/Iso/IsoMath.cs`.** No `IsoProjection` type is ever created.

| Unit | Adds to `IsoMath` | Must NOT re-declare |
|---|---|---|
| Step 1 (depthkey-port) | `HW HH WZ COLS ROWS TILE_W TILE_H INV_X INV_Y` consts, `WorldToScreen`, `DepthKey` | — (owns them) |
| Step 4 (depthkey-sort) | `PlayerDepthBias(z)`, `SortingOrder(dk)` | `DepthKey`, consts |
| Step 3 (iso-cam) | `ScreenToWorld`, clamp-box consts, `FOCUS_X/Y`, `FOLLOW_RESIDUAL` | `HW/HH/WZ/WorldToScreen` |

All consts derive from one place. `SortingOrder(dk)` is a single shared method; **raw `Math.Round` is banned at every sort call site.**

---

## STEP 1 — `IsoMath.cs` (depthKey + worldToScreen + GRID consts) — dual-gate

**File 1 (NEW):** `GodzillaSmash/Assets/Scripts/Core/Iso/IsoMath.cs` — pure C#, NO `UnityEngine`, `namespace Godzilla.Core`, mirror `MathUtil.cs`/`Mulberry32.cs` header style.

```csharp
// Godzilla.Core/Iso/IsoMath.cs — pure C#, NO UnityEngine.
// Bit-exact port of js/iso.js worldToScreen/depthKey + Config.GRID iso constants (gz-v32, IMMUTABLE ref).
// double EVERYWHERE: depthKey is FLOATING-POINT — real call sites pass fractional wx+0.5 / altitude.
// DepthKey(0.1,0,0,0) -> 102.4. A long/int return would truncate building-center keys & re-order the painter's list.
namespace Godzilla.Core
{
    public static class IsoMath
    {
        // [config.js:15] GRID — single source of truth (never hardcode elsewhere).
        public const int    COLS   = 21;        // GRID.cols
        public const int    ROWS   = 58;        // GRID.rows
        public const double TILE_W = 56.0;      // GRID.TILE_W
        public const double TILE_H = 28.0;      // GRID.TILE_H
        public const double HW = TILE_W / 2;    // [iso.js:14] 28
        public const double HH = TILE_H / 2;    // [iso.js:15] 14
        public const double WZ = 40.0;          // [iso.js:16] GRID.WZ_PX
        public const double INV_X = 1.0 / (2 * HW); // [iso.js:23] 1/56  (consumed by Step 3 ScreenToWorld)
        public const double INV_Y = 1.0 / (2 * HH); // [iso.js:24] 1/28

        // [iso.js:217-222] alloc form parity with iso.worldToScreen. wz omitted -> 0 (JS `wz||0`).
        public static (double x, double y) WorldToScreen(double wx, double wy, double wz = 0.0)
            => ((wx - wy) * HW, (wx + wy) * HH - wz * WZ);

        // [iso.js:225-229] no-alloc twin (worldToScreenInto).
        public static void WorldToScreen(double wx, double wy, double wz, out double sx, out double sy)
        { sx = (wx - wy) * HW; sy = (wx + wy) * HH - wz * WZ; }

        // [iso.js:264-266] painter's-order key. Larger = drawn later (in front). FLOATING-POINT.
        // JS reads e.wz||0 and e.depthBias||0; callers pass them explicitly here.
        public static double DepthKey(double wx, double wy, double wz, double depthBias)
            => (wx + wy) * 1024.0 + wz * 4.0 + depthBias;
    }
}
```

**File 2 (EDIT):** `GodzillaSmash/Godzilla.Core.csproj` — add inside the explicit `<Compile>` list (after line 60):
```xml
<Compile Include="Assets/Scripts/Core/Iso/IsoMath.cs" />
```
> Leg A's `tools/core-tests/CoreTests.csproj` globs `Core/**/*.cs` (verified line 21) — the new file is auto-compiled there; NO Leg-A csproj edit. The Tests asmdef already refs `Godzilla.Core` — NO asmdef edit. Commit the Unity-generated `.meta` on first import.

**File 3 (EDIT):** `tools/core-tests/gen-vectors.js` — after the existing `require('.../js/utils.js')` line, add the iso deps; append the iso block before `process.stdout.write` (line ~62):
```js
require('/Users/MGitk/Projects/Godzilla Game/js/config.js'); // iso.js dep: Config.GRID — MUST load before iso.js
require('/Users/MGitk/Projects/Godzilla Game/js/iso.js');    // attaches GAME.iso
const ISO = global.GAME.iso;

// --- iso.worldToScreen --- integer tiles, fractional centers, statue lift z=4, flyer altitude, corners, wz-omitted.
const wtsIn = [[0,0,0],[1,0,0],[0,1,0],[10,20,0],[20,57,0],[0.5,0.5,0],[10.5,20.5,0],
               [0,0,4],[5,5,2],[3.5,9.25,1.75],[0,57,0],[20,0,0],[10,20,undefined]];
out.worldToScreen = wtsIn.map(a=>{ const p=ISO.worldToScreen(a[0],a[1],a[2]); return {in:a,x:p.x,y:p.y}; });

// --- iso.depthKey --- building bias0, player +1, flyer alt+bias, lifted-flyer big bias, statue z=4, omitted fields.
const dkIn = [
  {wx:0,wy:0,wz:0,depthBias:0},{wx:0,wy:0,wz:0,depthBias:1},
  {wx:10,wy:20,wz:0,depthBias:0},{wx:10,wy:20,wz:0,depthBias:1},
  {wx:10.5,wy:20.5,wz:1.75,depthBias:1},
  {wx:5,wy:5,wz:2,depthBias:1+Math.ceil(Math.min(3,2*ISO.WZ/ISO.HH))*1024},
  {wx:3,wy:40,wz:0,depthBias:0},{wx:20,wy:57,wz:0,depthBias:0},
  {wx:0,wy:0,wz:4,depthBias:0},{wx:0,wy:0},{wx:2,wy:2,wz:0.5,depthBias:0}];
out.depthKey = dkIn.map(e=>({in:e,out:ISO.depthKey(e)}));
out.isoConst = {HW:ISO.HW,HH:ISO.HH,WZ:ISO.WZ,COLS:ISO.COLS,ROWS:ISO.ROWS};
```
Regenerate: `node tools/core-tests/gen-vectors.js > tools/core-tests/vectors.json`

**File 4 (EDIT):** `tools/core-tests/Program.cs` — insert before the final summary `Console.WriteLine`:
```csharp
// ---- iso constants ----
var ic = root.GetProperty("isoConst");
Check("iso.HW", IsoMath.HW == ic.GetProperty("HW").GetDouble());
Check("iso.HH", IsoMath.HH == ic.GetProperty("HH").GetDouble());
Check("iso.WZ", IsoMath.WZ == ic.GetProperty("WZ").GetDouble());
Check("iso.COLS", IsoMath.COLS == ic.GetProperty("COLS").GetInt32());
Check("iso.ROWS", IsoMath.ROWS == ic.GetProperty("ROWS").GetInt32());

// ---- worldToScreen ---- (wz omitted in JS -> JSON null -> 0)
foreach (var c in root.GetProperty("worldToScreen").EnumerateArray())
{
    var a = c.GetProperty("in");
    double wx = a[0].GetDouble(), wy = a[1].GetDouble();
    double wz = a[2].ValueKind == JsonValueKind.Null ? 0.0 : a[2].GetDouble();
    var (gx, gy) = IsoMath.WorldToScreen(wx, wy, wz);
    double ex = c.GetProperty("x").GetDouble(), ey = c.GetProperty("y").GetDouble();
    Check($"w2s({wx},{wy},{wz})", gx == ex && gy == ey, $"got ({gx:R},{gy:R}) exp ({ex:R},{ey:R})");
}
// ---- depthKey ---- (wz/depthBias omitted -> 0)
foreach (var c in root.GetProperty("depthKey").EnumerateArray())
{
    var e = c.GetProperty("in");
    double wx = e.GetProperty("wx").GetDouble(), wy = e.GetProperty("wy").GetDouble();
    double wz = e.TryGetProperty("wz", out var wzp) ? wzp.GetDouble() : 0.0;
    double db = e.TryGetProperty("depthBias", out var dbp) ? dbp.GetDouble() : 0.0;
    double got = IsoMath.DepthKey(wx, wy, wz, db), exp = c.GetProperty("out").GetDouble();
    Check($"depthKey({wx},{wy},{wz},{db})", got == exp, $"got {got:R} exp {exp:R}");
}
```

**File 5 (EDIT):** `GodzillaSmash/Assets/Tests/EditMode/MathPortTests.cs` — append inside the `MathPortTests` class (REAL ground-truth literals, all verified empirically):
```csharp
[Test] public void Iso_constants_match_grid()
{
    Assert.That(IsoMath.HW, Is.EqualTo(28.0));   Assert.That(IsoMath.HH, Is.EqualTo(14.0));
    Assert.That(IsoMath.WZ, Is.EqualTo(40.0));   Assert.That(IsoMath.COLS, Is.EqualTo(21));
    Assert.That(IsoMath.ROWS, Is.EqualTo(58));
}
[Test] public void WorldToScreen_matches_js()
{
    Assert.That(IsoMath.WorldToScreen(1, 0, 0),         Is.EqualTo((28.0, 14.0)));
    Assert.That(IsoMath.WorldToScreen(0, 1, 0),         Is.EqualTo((-28.0, 14.0)));
    Assert.That(IsoMath.WorldToScreen(10, 20, 0),       Is.EqualTo((-280.0, 420.0)));
    Assert.That(IsoMath.WorldToScreen(0, 0, 4),         Is.EqualTo((0.0, -160.0)));    // statue lift
    Assert.That(IsoMath.WorldToScreen(3.5, 9.25, 1.75), Is.EqualTo((-161.0, 108.5)));  // flyer
    Assert.That(IsoMath.WorldToScreen(20, 57, 0),       Is.EqualTo((-1036.0, 1078.0)));// far corner
    Assert.That(IsoMath.WorldToScreen(10, 20),          Is.EqualTo((-280.0, 420.0)));  // wz default 0
}
[Test] public void DepthKey_matches_js()
{
    Assert.That(IsoMath.DepthKey(0, 0, 0, 0),          Is.EqualTo(0.0));
    Assert.That(IsoMath.DepthKey(0, 0, 0, 1),          Is.EqualTo(1.0));       // player +1
    Assert.That(IsoMath.DepthKey(10, 20, 0, 0),        Is.EqualTo(30720.0));   // building
    Assert.That(IsoMath.DepthKey(10, 20, 0, 1),        Is.EqualTo(30721.0));
    Assert.That(IsoMath.DepthKey(10.5, 20.5, 1.75, 1), Is.EqualTo(31752.0));   // flyer center
    Assert.That(IsoMath.DepthKey(5, 5, 2, 3073),       Is.EqualTo(13321.0));   // lifted flyer big bias
    Assert.That(IsoMath.DepthKey(20, 57, 0, 0),        Is.EqualTo(78848.0));   // far row
    Assert.That(IsoMath.DepthKey(0, 0, 4, 0),          Is.EqualTo(16.0));      // wz*4 statue
    Assert.That(IsoMath.DepthKey(2, 2, 0.5, 0),        Is.EqualTo(4098.0));    // fractional wz
    Assert.That(IsoMath.DepthKey(0.1, 0, 0, 0),        Is.EqualTo(102.4));     // FLOATING-POINT proof
}
```

**Gotchas (all carried):** return `double` not `long`/`int` (the single load-bearing decision; fractional inputs → `(0.1,0,0,0)=102.4`). `depthBias` is `double` even though observed values are integers. NO `UnityEngine.Vector2` overload in Core — a Vector2 adapter belongs in `Godzilla.Presentation` later. `config.js` MUST be required before `iso.js` (else `GRID` undefined → HW/HH/WZ NaN). Don't port `screenToWorld`/`pickTile`/`cull`/`camera` here (Step 3 owns `ScreenToWorld`; camera-state is Cinemachine's).

**Gate (both green):**
```
# LEG A (license-free CI core-bitexact)
node tools/core-tests/gen-vectors.js > tools/core-tests/vectors.json
DOTNET="/Applications/Unity/Hub/Editor/6000.5.0f1/Unity.app/Contents/Resources/Scripting/DotNetSdk/dotnet"
"$DOTNET" run -c Release --project tools/core-tests   # exit 0; pass count up from 144
# LEG B (in-Unity NUnit) via BuildScript/GameCI -runTests EditMode
```

---

## STEP 2 — `TraumaModel.cs` (camera-shake envelope) — dual-gate + Cinemachine Perlin adapter

**File (NEW):** `GodzillaSmash/Assets/Scripts/Core/Iso/TraumaModel.cs` — `struct Godzilla.Core.TraumaModel`, NO `UnityEngine`, `double` throughout.

```csharp
namespace Godzilla.Core
{
    // Bit-exact scalar envelope of js/iso.js camera trauma (gz-v32). reducedMotion lives in the adapter.
    public struct TraumaModel
    {
        public const double ShakeMaxPx   = 12.0;        // [iso.js:35]
        public const double ShakeDecay   = 0.02;        // [iso.js:36] half-life 0.17718382013555792s
        public const double ShakeTraumaK = 1.0 / 85.0;  // [iso.js:37] 0.011764705882352941
        public const double Floor        = 0.004;       // [iso.js:137,139]

        public double Trauma;

        // [iso.js:154-156] add. mag<=0 no-op. clamp to 1.
        public void Add(double mag)
        { if (!(mag > 0)) return; double t = Trauma + mag * ShakeTraumaK; Trauma = t < 1 ? t : 1; }

        // [iso.js:137-145] STRICT > guard + else-zero (trauma==0.004 snaps to 0).
        public void Decay(double dt)
        {
            if (Trauma > Floor)
            { double e = dt > 0 ? dt : 0; Trauma *= System.Math.Pow(ShakeDecay, e); if (Trauma < Floor) Trauma = 0; }
            else Trauma = 0;
        }

        // [iso.js:140] screen-px offset magnitude (the View turns this into jitter).
        public double OffsetPx => ShakeMaxPx * Trauma;
    }
}
```

**Dual-gate** (mirror Mulberry32 trio):
- `gen-vectors.js`: add `out.trauma_add` / `trauma_decay` / `trauma_offset` / `trauma_seq` from the VERIFIED node values below.
- `Program.cs`: loop arrays, build `new TraumaModel{Trauma=t}`, call `Add`/`Decay`/`OffsetPx`, `Check(... == exp)` exact `:R`.
- `MathPortTests.cs`: hardcode the same values.

**VERIFIED ground-truth (node round-trip ==, do NOT recompute):**
- ADD `(trauma,mag)->out`: `(0,3)->0.03529411764705882`; `(0,9)->0.10588235294117647`; `(0,13)->0.15294117647058825`; `(0,14)->0.16470588235294117` [FINISHER.SHAKE config.js:110]; `(0.9,14)->1.0` clamp; `(0,0.5)->0.0058823529411764705`; `(0.5,-3)->0.5` no-op.
- DECAY `(trauma,dt)->out`: `(1,1/60)->0.9368797094027784`; `(1,1/30)->0.8777435898906345`; `(0.5,1/60)->0.4684398547013892`; `(0.0041,1/60)->0`; `(0.004,1/60)->0` (==floor snaps); `(0.003,1/60)->0`; `(0.106,0.1)->0.07168179380746158`.
- OFFSET `12*t`: `0->0`; `0.0035->0.042`; `0.106->1.272`; `0.153->1.8359999999999999`; `0.5->6`; `1->12`.
- SEQ `add(0,13)` then 30× `decay@1/60`: `[0]=0.15294117647058825`, `[1]=0.14328748496748378`, `[30]=0.021629148601000295`.

**Cinemachine adapter** (Presentation, `TraumaShake : MonoBehaviour`): holds `TraumaModel _model` **in a FIELD**. Use `CinemachineBasicMultiChannelPerlin` (NOT Impulse — Impulse double-decays over our ported exp-decay). `AddTrauma(mag){ if(!_reducedMotion) _model.Add(mag); }`. `LateUpdate`: if `_reducedMotion` zero both `Trauma` and `AmplitudeGain` and return; else `_model.Decay(Time.deltaTime)`; `_perlin.AmplitudeGain = (float)(_model.OffsetPx * 2 * _orthoSize / _refScreenH)`. `_orthoSize=5`, `_refScreenH=720` as SerializeFields. Per-frame jitter waveform is a TASTE call (faithful-not-bit-exact); gate ONLY the scalar envelope.

**Gotchas:** `Math.Pow` is the only divergence risk — gate with `==` exact; a future pow divergence is a REAL finding, do NOT loosen to `.Within(eps)`. Decay guard is asymmetric (`>` strict, else-zero) — a `>=` or multiply-then-floor port wrongly keeps `0.004`. Struct → hold in a FIELD. Gate BOTH reducedMotion legs (Add no-op + LateUpdate zeroes) or trauma accumulates invisibly. `_refScreenH` is an FX-feel tunable, NEVER leak it into the bit-exact gate. Do NOT port `Math.random` into Core.

---

## STEP 3 — Iso ortho camera + Cinemachine rig (extends `IsoMath`)

**3a — PACKAGE + ASMDEF (do first).** Pin Cinemachine in `GodzillaSmash/Assets/Editor/SetupPackages.cs` (already lists `com.unity.cinemachine` unpinned, line 11) → `"com.unity.cinemachine@3.1.4"`. Run `<Editor>/Unity -batchmode -quit -projectPath GodzillaSmash -executeMethod GodzillaSetup.SetupPackages.Run` (writes the version into `Packages/manifest.json` — commit the diff). Edit `Godzilla.Presentation.asmdef` references from `["Godzilla.Core","Godzilla.Data"]` → `["Godzilla.Core","Godzilla.Data","Unity.Cinemachine"]`. Core/Data/Tests asmdefs UNTOUCHED.

> **BUILD-EMPIRICAL pre-flight (`unity-batchmode-api/LOW` — Cinemachine not yet installed, names from training knowledge):** after pin+resolve, confirm the exact 3.x symbols BEFORE writing `IsoCameraRig.cs`:
> ```
> grep -rl 'class CinemachineCamera\|class PositionComposer\|class CinemachineConfiner2D' \
>   GodzillaSmash/Library/PackageCache/com.unity.cinemachine*/Runtime
> grep -rh 'AssemblyName\|"name"' GodzillaSmash/Library/PackageCache/com.unity.cinemachine*/Runtime/*.asmdef
> ```
> If `3.1.4` doesn't resolve on 6000.5, fall back to bare `com.unity.cinemachine` and re-pin to whatever the resolver picks. The pure-Core half (3b) is independent of Cinemachine and gates first.

**3b — EXTEND `IsoMath.cs`** (do NOT create `IsoProjection`). Add to the same class:
```csharp
public struct ScreenPt { public double X, Y; public ScreenPt(double x,double y){X=x;Y=y;} }
public struct WorldXY  { public double Wx, Wy; public WorldXY(double wx,double wy){Wx=wx;Wy=wy;} }
// (place these structs in the Godzilla.Core namespace alongside IsoMath)

// in IsoMath:
// screenToWorld ground-plane inverse (caller already removed camera origin) [iso.js:234-241]
public static WorldXY ScreenToWorld(double lx, double ly)
    => new WorldXY(lx * INV_X + ly * INV_Y, ly * INV_Y - lx * INV_X);

// --- origin-clamp world-screen box (iso.js:65-73). Confiner2D polygon derives from these. ---
public const double WORLD_MIN_X = -(ROWS - 1) * HW;          // -1596
public const double WORLD_MAX_X =  (COLS - 1) * HW;          //   560
public const double WORLD_MIN_Y = 0.0;
public const double WORLD_MAX_Y = (COLS - 1 + ROWS - 1) * HH;// 1078
public const double CLAMP_PAD_X      = HW * 6.0;             //   168
public const double CLAMP_PAD_TOP    = WZ * 4.0;             //   160
public const double CLAMP_PAD_BOTTOM = HH * 6.0;             //    84
public const double FOCUS_X = 0.5, FOCUS_Y = 0.66;          // [config.js:66]
public const double FOLLOW_RESIDUAL = 0.0008;               // [iso.js:128] tau = -1/ln(0.0008) ≈ 0.1402s
```

**Dual-gate the new math** (extend the same trio):
- `gen-vectors.js`: emit `out.iso_s2w` (camera-free ground inverse — compute `wx=lx/56+ly/28, wy=ly/28-lx/56` inline as ground truth so the test round-trips `W2S∘S2W==identity` AND matches literals): inputs `[[0,0],[28,14],[-1596,0],[560,1078],[100,250]]`. The `iso_w2s` vectors from Step 1 already cover `WorldToScreen`.
- `Program.cs` + `MathPortTests.cs`: assert `ScreenToWorld` and the clamp-box consts (`WORLD_MAX_X==560`, `WORLD_MIN_X==-1596`, `WORLD_MAX_Y==1078`) with `==`.

**3c — `IsoCameraRig.cs`** (Presentation MonoBehaviour). Locked dimension: flat XY plane, sort axis does depth — each actor's `Transform.position = WorldToScreen(wx,wy,wz)/PPU`, **Y-flipped** `(sx/PPU, -sy/PPU)`. **PPU = 100.**
```csharp
using UnityEngine;
using Unity.Cinemachine;   // 3.x namespace (NOT Cinemachine)
using Godzilla.Core;

[DefaultExecutionOrder(50)]
public sealed class IsoCameraRig : MonoBehaviour
{
    public const float PPU = 100f;
    [SerializeField] Transform _followTarget;   // kaiju root (KaijuView sets its pos)
    void Awake()
    {
        float refH = Screen.height > 0 ? Screen.height : 1080f;
        Camera.main.orthographic = true;
        Camera.main.orthographicSize = (refH * 0.5f) / PPU;  // 1080 -> 5.4 ; 720 -> 3.6
        Camera.main.allowHDR = false;   // see Step-6 HDR note: LDR-faithful to the FXSPIKE capture
    }
}
```

**Cinemachine in-scene config (flat XY, NOT a 3D-tilt rig):**
- `CinemachineCamera` (3.x component; NOT `CinemachineVirtualCamera`), `Priority 10`, Lens.Orthographic inherits from Main Camera.
- `CinemachineBrain` on Main Camera, `DefaultBlend = Cut`.
- `PositionComposer` extension (3.x rebrand of FramingTransposer): `Damping = (0.14, 0.14, 0)` seconds (the continuous τ = −1/ln(0.0008) ≈ 0.1402s — frame-rate-independent, reproducing the web `k=1-0.0008^dt`; **do NOT paste the per-frame `0.112`**), `DeadZone = 0`, `Composition.ScreenPosition = (0.0, -0.16)` (focusX 0.5→0.0; focusY 0.66→`-(0.66-0.5)=-0.16` since Cinemachine +Y is up and web focusY is top-relative — **VERIFY sign in the Play-Mode screenshot**, magnitude `|0.66-0.5|` is exact).
- Tracking Target = kaiju root.

**CinemachineConfiner2D** (origin clamp → polygon). Add the extension; `BoundingShape2D` = a real `PolygonCollider2D` on a `CameraBounds` GameObject (an empty GO with only the script will NOT confine). Corners (÷PPU=100, Y negated per the flip — feed the FULL visible box; Confiner2D insets by ortho half-extents itself, matching the web `oxMin/oxMax` algebra incl. center-collapse):
```
minX = (WORLD_MIN_X - CLAMP_PAD_X)/100      = -17.64
maxX = (WORLD_MAX_X + CLAMP_PAD_X)/100      =   7.28
minY = -(WORLD_MAX_Y + CLAMP_PAD_BOTTOM)/100= -11.62
maxY = -(WORLD_MIN_Y - CLAMP_PAD_TOP)/100   =   1.60
polygon CCW: (-17.64,-11.62)(7.28,-11.62)(7.28,1.60)(-17.64,1.60)
```

**Gotchas:** 3.x rename — asmdef ref `Unity.Cinemachine`, `using Unity.Cinemachine`, `CinemachineCamera`, `PositionComposer`; 2.x names compile against nothing → fail L1. **Y-axis flip is load-bearing** — bake actor transforms `(sx/PPU, -sy/PPU)` so the depthKey sort axis (+Y) and the negated Confiner Y stay consistent; flipping the camera instead inverts the painter order. `ScreenPosition` is center-relative `[-0.5,0.5]`, NOT top-relative — copying `0.66` parks the cam off-screen. `Damping` is seconds, not a per-frame lerp constant. Ortho size is per-DEVICE `(Screen.height/2)/PPU`, not a magic 5. `IsoMath` MUST stay UnityEngine-free (no Vector2/Mathf — use `double` + `ScreenPt`/`WorldXY`).

**Scene wiring (MCP-verifiable):** after compile-clean (L1 console) → enter Play Mode (L2) → screenshot Game View (L3): kaiju sits at screen-fraction `(0.5, 0.66)`, camera does not pan past grid edges. **Does NOT** add the FX sorting layer or set Transparency Sort Axis (Step 4 owns those).

---

## STEP 4 — depthKey painter sort (extends `IsoMath`)

**Extend `IsoMath.cs`** (no re-declaration of `DepthKey`/consts):
```csharp
// player/airborne depth bias [render.js:474-475]
public static double PlayerDepthBias(double z)
    => 1.0 + System.Math.Ceiling(System.Math.Min(3.0, z * WZ / HH)) * 1024.0;

// depthKey -> SpriteRenderer.sortingOrder. JS Math.round = half-up; (int)Math.Round = banker's. Use Floor(dk+0.5).
public static int SortingOrder(double dk) => (int)System.Math.Floor(dk + 0.5);
```

**Renderer/scene:** Renderer2D `Transparency Sort Mode` Custom Axis `(1,1,0)` (coarse tie-break only — per-entity `sortingOrder` is the real authority). Append `"FX"` SortingLayer LAST via TagManager (Step 6 canonical helper); **buildings stay on `Default`**, only FX on `FX`. `EntityDepth.LateUpdate`: `sortingOrder = IsoMath.SortingOrder(IsoMath.DepthKey(wx,wy,wz,bias))`; player bias = `IsoMath.PlayerDepthBias(z)` (gz-v23 over/under fly). Drive `sortingOrder`, never an MPB (SRP Batcher ON).

**Corrected vectors** (`bitexact-seam/LOW` — the terse spec's `(0,0,0.625,0)->3` was WRONG; verified `ceil(min(3,0.625*40/14))=2`, `PlayerDepthBias(0.625)=2049`):
```
PlayerDepthBias(0.125) == 1025    // ceil(min(3,0.357))=1
PlayerDepthBias(0.625) == 2049    // ceil(min(3,1.785))=2  (was mis-stated as 3)
PlayerDepthBias(0.75)  == 3073    // ceil(min(3,2.143))=3
SortingOrder(30720.5)  == 30721   // half-UP (banker's Round would give 30720)
SortingOrder(0.1*... )            // any .5 key rounds up
```
Gate these in `gen-vectors.js` (emit `PlayerDepthBias`/`SortingOrder` from node) + `Program.cs` + `MathPortTests.cs`.

**Gotchas:** `(int)Floor(dk+0.5)` NOT `Math.Round` (the cross-spec inconsistency — Building-FSM Part B MUST call `IsoMath.SortingOrder`, never `Math.Round`). `SortingLayer` dominates `sortingOrder`. `double` not `float`; round only at the SpriteRenderer. dk max `(21+58)*1024 + wz*4 ≈ 80896` fits int32. `SetDepth` in LateUpdate.

---

## STEP 5 — Fixed-step loop + sim/view seam + `KaijuSim` (Core) + `KaijuView` (Presentation)

**NEW Core files** (`Godzilla.Core.asmdef`, NO UnityEngine): `Core/Sim/{FacingMath.cs, SimContracts.cs, FxEvent.cs, KaijuSim.cs}`.
**NEW Presentation files** (refs Core+Data): `Presentation/Sim/{KaijuView.cs, GameLoopDriver.cs, FxEventConsumer.cs}` (P1 stub).
**NEW Tests:** `Assets/Tests/EditMode/KaijuSimPortTests.cs` (refs Core only).
Dual-gate: EXTEND `tools/core-tests`, do NOT add a new harness.

**`FacingMath.cs`** — `HALF_W=28.0, HALF_H=14.0` [config.js:15]. `FacingMap[8]` exactly [entities.js:336]. 
```
int HeadingToFacing(double sx,double sy):
  a=Atan2(sx,sy); if(a<0)a+=2*PI; return ((int)Floor(a/(PI/4)+0.5))%8;   // Floor(x+0.5) NOT Math.Round
int FacingTo(double pwx,double pwy,double wx,double wy):                 // [entities.js:897]
  dwx=wx-pwx; dwy=wy-pwy; if(Abs(dwx)<1e-4 && Abs(dwy)<1e-4) return -1;  // sentinel = keep current
  return HeadingToFacing((dwx-dwy)*HALF_W,(dwx+dwy)*HALF_H);
(double wx,double wy) FacingToWorldVec(int f):                           // [entities.js:1214]
  ang=f*(PI/4); sx=Sin(ang); sy=Cos(ang);
  wx=(sx/HALF_W+sy/HALF_H)*0.5; wy=(sy/HALF_H-sx/HALF_W)*0.5;
  m = Hypot(wx,wy); if(m==0)m=1; return (wx/m,wy/m);                     // SEE HIGH finding below
```

> **`bitexact-seam/HIGH` — hypot vs sqrt:** web normalizes with `Math.hypot` [entities.js:1219]; V8's two-arg hypot differs from `Sqrt(wx*wx+wy*wy)` by 1–2 ULP at 6 of 8 facings. **Do NOT silently substitute sqrt under a `==` gate.** Choose ONE, gated explicitly:
> - **(a) Port hypot semantics** (recommended for `==`): `m=Max(Abs(wx),Abs(wy)); if(m==0) return 0; t=Min(Abs(wx),Abs(wy))/m; m*Sqrt(1+t*t)`.
> - **(b)** Loosen ONLY this vector to `.Within(1e-15)`, documented as S3-sanctioned faithful-not-bit-exact normalization.
> Add a dedicated `FacingToWorldVec` vector (all 8 facings) to `gen-vectors.js` so the choice is gated, not assumed.

**`SimContracts.cs`** — `struct Intent { double MoveX,MoveY; bool Attack,Jump; long? TargetCol,TargetRow; }`. `struct TargetRef { long Col,Row; double Height; bool Flying; double Altitude; bool Standing; }`. `interface ITargetWorld { TryGetTargetAt; TryGetBuildingAt; FootprintsNear(buf); BlockedAt; DealDamage; }`. `SimConfig` (double, derived & verified): `ACCEL=18.928571428571427`, `MAX_SPEED=4.642857142857143`, `FRICTION=12.0`, `COLLIDE_R=0.32142857142857145`, `WALK_SPEED=0.22`, `COOLDOWN_SCALE=0.42`, `COOLDOWN_FLOOR=0.11`, `COOLDOWN_CAP=0.20`, `JUMP_VESCAPE=8.5`, `JUMP_GRAVITY=26.0`, `FLYER_ALTITUDE=1.0`, `cols=21`, `rows=58`, `PX_PER_TILE=56`. Friction per step `Exp(-12/60)=0.8187307530779818`.

**`FxEvent.cs`** — `enum FxKind { BeamFired, Shake, DamageDealt }`. `readonly struct FxEvent` carries `Ax,Ay,Az` (muzzleWorld) `Bx,By,Bz` (targetWorld) **in WORLD units**, `Mag`, `DmgCol,DmgRow,DmgAmount`, `PaletteId Pal`. Sim writes into a caller-supplied `List<FxEvent>` (no per-fire alloc). BeamFired tint → vertex color downstream (NOT MPB).

**`KaijuSim.cs`** — fields `double/int`: `PosWx,PosWy,PosZ,VelX,VelY,VelZ, Facing, Fsm, WalkPhase, AttackT, AttackDur, AtkCooldown, FinisherCd(0@P1), HurtT, Flash, GlowPhase, PrevAttack, PrevJump`. `AttackPower` injected each Update. RNG `Mulberry32 _rng` **in a FIELD** (reserved for FX-spread parity).

`Update(double dt, in Intent, ITargetWorld, List<FxEvent> outFx)`:
- `if(dt>0.05)dt=0.05;` [entities.js:954]
- decay: `Flash=Max(0,Flash-dt*1.8); HurtT=Max(0,HurtT-dt); GlowPhase+=dt;`
- **`bitexact-seam/HIGH` — atkCooldown is GUARDED** [verified entities.js:959]: `if(AtkCooldown>0) AtkCooldown-=dt;` (and `if(FinisherCd>0) FinisherCd-=dt;`). The spec's "decremented UNCONDITIONALLY" NOTE was WRONG with a wrong citation — an unguarded decrement diverges to ever-more-negative. Gate predicate stays `<=0`; do NOT add a `Max(0,...)` clamp (would change the trajectory).
- JUMP: `jumpEdge = Jump && !PrevJump; PrevJump=Jump; if(jumpEdge && PosZ<=0.05) VelZ=8.5; if(PosZ>0.05||VelZ>0){VelZ-=26*dt; PosZ+=VelZ*dt; if(PosZ<0){PosZ=0;VelZ=0;}}` [entities.js:972-981]; `airborne = PosZ>0.05`.
- LOCOMOTION [entities.js:1002-1047]: normalize move if mag>1; `VelX+=mx*ACCEL*dt; VelY+=my*ACCEL*dt; fr=Exp(-FRICTION*dt); VelX*=fr; VelY*=fr;` speed-cap to `MAX_SPEED`.
- clamp+collide: `loX=0.5,hiX=cols-0.5,loY=-1.0,hiY=rows-0.5`; `wedged=BlockedAt(preX,preY)`; per-axis `if(wedged || !BlockedAt(...)) accept; else vel*=0.2`.
- facing-from-movement ONLY when `sp>WALK_SPEED && AttackT<=0` [entities.js:1053].
- FSM `attack/hurt/walk/idle`; `AttackFrame=Clamp(Floor((1-AttackT/AttackDur)*6),0,5)`; walkPhase advance.
- ATTACK (level-triggered) [entities.js:1086]: `PrevAttack=Attack; if(Attack && AtkCooldown<=0) FireAttack(...)`.

`StartAttack` [entities.js:1344]: `AttackDur=AttackT=0.30` (wyrm beam anim); `AtkCooldown = Clamp(0.30*0.42, 0.11, 0.20) = 0.126` EXACT (matches LOCKED correction #3 — NOT 0.11). Set Facing via `FacingTo(target+0.5)` if `!=-1`. Emit ONE `BeamFired{A=muzzleWorld, B=(col+0.5,row+0.5, flying?altitude:height*0.45), Pal=form}`; `world.DealDamage(t, AttackPower)`; emit `DamageDealt`; emit `Shake{Mag}`.
- **`web-fidelity/LOW` — Shake.Mag** = `(atkDef.shake != null ? atkDef.shake : 3.2)` [entities.js:1239]. gz2014 sets `shake:0` explicitly → `Mag=0`, NOT the 3.2 fallback (which applies only to forms with no `shake` key). supernova=12. Feeds the already-ported `TraumaModel.Add`.

`Muzzle` P1 simplification: emit `muzzleWorld=(PosWx,PosWy,PosZ+0.77*muzzleHeightWorld)` — the exact sprite-pixel snout (`SPR_H`, `facingGeom`, `drawScale`) is a VIEW-space anchor offset computed in `KaijuView`, NOT Core (documented seam split). `AcquireTargets` order: explicit → faced (`fwd*0.7`) → nearest (radius 2.6); `n=1` for beam.

**`KaijuView.cs`** (two-lane bridge): holds `KaijuSim _sim`, `ITargetWorld _world`, `_prevPos/_pos` (sim lane, world units), `List<FxEvent> _fx=new(64)`.
```
Sim_Step(double step, in Intent): _prevPos=_pos; _fx.Clear(); _sim.Update(step,intent,_world,_fx);
   _pos=new Vector3((float)PosWx,(float)PosWy,(float)PosZ); DrainFx(_fx);
Render(float alpha): renderPos=Vector3.LerpUnclamped(_prevPos,_pos,alpha);  // LerpUnclamped, not Lerp
   transform from IsoMath.WorldToScreen(renderPos) Y-flipped /PPU; sortingOrder via IsoMath.SortingOrder.
```
`DrainFx` → `FxEventConsumer` (P1 stub: Shake → `TraumaModel.Add`; BeamFired → assert non-null palette + log; DamageDealt → noop). Beam pooled-quad render is a LATER unit; P1 only proves the event crosses the seam with correct WORLD vectors + palette.

**`GameLoopDriver.cs`** (port js/game.js:6-147) — `STEP=1.0/60.0`, `MAX_SUBSTEPS=5`. Drive off `Time.unscaledDeltaTime`/`unscaledTimeAsDouble`, **NOT Unity FixedUpdate** (we own the accumulator to reproduce the exact 5-substep cap + the attack-edge-once rule + the `acc=0` spiral/freeze resets):
```
dt=Time.unscaledDeltaTime; if(dt<0||NaN)dt=0; if(dt>0.1)dt=0.1;       // [game.js:113]
if(_paused){ConsumeInputEdges(); _acc=0; Render(1); return;}
double hs=_fx.ConsumeHitStop(); now=unscaledTimeAsDouble;
if(hs>0)_freezeUntil=now+hs/1000.0; bool frozen=now<_freezeUntil;
if(!frozen){ _acc+=dt; Intent it=_input.Consume(); int n=0;
  while(_acc>=STEP && n<MAX_SUBSTEPS){ _view.Sim_Step(STEP,it); StepBuildings(STEP*1000.0);  // <-- see seam fix
    it.Attack=false; /* consume attack edge after first substep [game.js:136] */ _acc-=STEP; n++; }
  if(n==MAX_SUBSTEPS)_acc=0; }
else { ConsumeInputEdges(); _acc=0; }
float alpha = frozen?1f:(float)(_acc/STEP); _view.Render(alpha);
```
**Hit-stop is an unscaled-clock accumulator FREEZE, NOT `Time.timeScale=0`** — the web never touches timeScale; skip `Sim_Step` while frozen.

> **`bitexact-seam/LOW` — building cadence seam fix:** the Building-FSM (Step 6) `DamageRouter.UpdateOne`/`TickDot` MUST be driven from the SAME `while(acc>=STEP)` body at `STEP_MS=16.666…` (`StepBuildings(STEP*1000)` above), mirroring `game.js:131` — NOT a frame-rate `WorldController.Update`. A variable-rate building tick desyncs DoT boundaries from the kaiju sim and breaks determinism.

**Tests (`KaijuSimPortTests.cs`) + dual-gate:** `gen-vectors.js` `sim` block (set `global.window=global`, require `config.js`, inline the 3 pure facing fns from the SAME `HALF_W=28/HALF_H=14` literals — entities.js can't be required standalone): `sim.facingTo` (11 cases), `sim.headingToFacing` (8 screen vectors), `sim.facingToWorldVec` (8 facings — gated per the hypot decision), `sim.gate` (`0.30→0.126`, `0.42→0.1764`, `0.46→0.1932`, `0.50/0.62/0.70→0.20` CAP), `sim.frictionStep` (`0.8187307530779818`), `sim.loco` (derived consts). `Program.cs` asserts FacingMath + SimConfig constants. NUnit adds 2 behavioral tests: **(a) gate test** — `Attack=true` at a fake world with one standing faced building → after StartAttack `AtkCooldown==0.126` (`Within 1e-12`), exactly ONE BeamFired + ONE DamageDealt; second Update `dt=0.05` held → NO new beam (gate closed); accumulate `AtkCooldown<=0` → exactly one more. **(b) loop-seam test** — a tiny C# accumulator replica feeding `dt=0.1`, `MAX_SUBSTEPS=5`, Attack held → Update called 5×, attack edge consumed after step 1 → `DamageDealt count<=1`.

**Gotchas:** `Floor(a/(PI/4)+0.5)` NOT `Math.Round` (banker's mis-buckets diagonals). hypot per HIGH finding. atkCooldown guarded per HIGH finding. Mulberry32 in a FIELD. tint→vertex color (no MPB). FxEvent carries WORLD coords (View projects). Muzzle seam split. `double` everywhere; cast to `float` only at the `Vector3` boundary. `LerpUnclamped` is a Unity-side smoothness ADDITION (faithful-in-spirit, must never alter sim state). FacingTo `-1` sentinel is a Unity-side convention — exclude dead-zone cases from the `facingTo` `==` vector set (web returns current facing int, never `-1`).

---

## STEP 6 — Building lifecycle FSM + DamageRouter (Core) + BuildingView + tap pick + "+$" reward

**NEW Core files** (`Godzilla.Core`, NO UnityEngine, `noEngineReferences:true`): `Core/World/{BuildingState.cs, Building.cs, RespawnConfig.cs, BuildingFactory.cs, DamageRouter.cs, IDestroySink.cs}`.

**`BuildingState.cs`:** `enum { Standing, Crumbling, Rubble, Respawning }`.

**`Building.cs`** [world.js:84-105] — `int Id (row*cols+col), Col, Row, Tier; double Hp, MaxHp` (DOUBLE — ROW_HP→1e9 overflows float/int32), `int FootW=1,FootH=1; double Height; int Style; uint Seed; BuildingState State; double T, Shake, HitFlash; Dot Dot; string Special; bool Flying; double Altitude`. `class Dot { double PerTick; int Ticks; double IntervalMs, Acc; }`.

**`RespawnConfig.cs`** [config.js:118, ms]: `CrumbleMs=550, RubbleMs=4500, RubblePerTier=250, RiseMs=700`.

**`BuildingFactory.cs`** [world.js:60-125] — `WorldSeed=0x9E3779B1u`, `StyleBands=5`.
> **`bitexact-seam/LOW` + `web-fidelity/LOW` — delete the bogus first-draft seed line.** Use ONLY the corrected expression (matches world.js:62 exactly; `Hash32.Mix` is bit-exact to `U.hash`, applying `x|0` internally):
```csharp
uint a = Hash32.Mix(col * 73856093);   // col<=20 => <2^31, no wrap (write (int)((long)col*73856093) defensively)
uint b = Hash32.Mix(row * 19349663);   // row<=57 => <2^31, no wrap
uint mixed = (WorldSeed ^ a) ^ b;      // uint XOR == JS ^ on >>>0 operands
uint seed  = Hash32.Mix(unchecked((int)mixed));
var rng = new Mulberry32(seed);        // local OK; if persisted -> FIELD
int period = (L.TierRows != 0) ? L.TierRows : (L.BlockD + L.Street);       // 3 [world.js:69]
int tier   = Min(L.Bands - 1, (int)Floor((double)row / period));            // min(18, floor(row/3)) [world.js:70]
double maxHp = Floor(rowHp[tier]);                                          // [world.js:71]
int fw = 1, fh = 1;
if (specialKey == null && tier >= 6 && rng.NextDouble() > 0.74) fw = 2;     // FIRST draw, GATED [world.js:75]
double height = (0.7 + (tier/(double)(L.Bands-1))*4.2) * (0.82 + rng.NextDouble()*0.42); // SECOND draw [world.js:78-79]
int style = Min(StyleBands-1, (int)Floor((tier/(double)L.Bands)*StyleBands));// [world.js:82]
```
**Draw ORDER is tier-dependent** — for `tier<6`/specials the FIRST `rng()` consumed is the height draw, so vectors MUST cover BOTH a tier-0 cell and a tier≥6 cell or the height bits diverge.

**`IDestroySink.cs`** (headless seam; Presentation implements): `double BankDestroy(double maxHp)` (combo-scaled payout), `Debris`, `Crumble(tier)`, `HitStop(ms)`, `ScreenFlash(a)`, `SpawnRewardText(b,payout)`, `AdvanceFrontier(row)`, `bool CanFinale()`, `TriggerFinale()`, `bool ReducedMotion {get;}`.

**`DamageRouter.cs`** — THE single damage entry. `HitBuilding` [world.js:561-573]: guard `State!=Standing→0`; `dmg=Floor(rawDamage)` (NOT `(int)`/`|0` — HP>2^31); `if(!(dmg>0))return 0`; `Hp-=dmg; HitFlash=1; if(!ReducedMotion) Shake=Min(1,Shake+0.28); if(Hp<=0) return Destroy(b);`. `Destroy` [world.js:518-555] fires each side-effect ONCE: `BankDestroy(MaxHp)→payout`, `Debris`, `Crumble(Tier)`, `HitStop(Min(95,60+Min(Tier,18)*2))`, `ScreenFlash(Tier>=14?0.28:0.18)`, `SpawnRewardText(b,payout)`, then `Hp=0; Dot=null; State=Crumbling; T=0; HitFlash=1; Shake=ReducedMotion?0:Min(1,0.5+Tier*0.03); if(!Flying) AdvanceFrontier(Row); if(Special=="statue" && CanFinale()) TriggerFinale(); return payout`. `ApplyDot` (refresh=max). `TickDot` routes BACK through `HitBuilding` (single-entry invariant), `guard=16`. `UpdateOne` advances ONE building's FSM [world.js:684-736]: `flashDecay=dt/120, shakeDecay=dt/220`; Crumbling→Rubble at `T>=CrumbleMs`; Rubble→Respawning at `T>=RubbleMs+Tier*RubblePerTier && offscreenClear`; Respawning→Standing at `T>=RiseMs` (strips RARE overlays only — excludes statue/pyramid/sandpile/football; re-derives MaxHp; `rollRare?.Invoke`).

**`bitexact-seam/MED` — Part B sortingOrder:** `BuildingView` MUST use `IsoMath.SortingOrder(IsoMath.DepthKey(...))`, **never `(int)Math.Round`** (differs at `.5` keys → z-fighting). Single shared helper from Step 4.

**Part B `BuildingView`** (MonoBehaviour): 4 child roots keyed by state (stage-swap via `SetActive`); crumble sink/respawn rise driven by `LifecyclePhase` (`Crumbling: Clamp(T/CrumbleMs,0,1)`, `Respawning: Clamp(T/RiseMs,0,1)`, `MathUtil.Clamp`); hitFlash tint = `Color.Lerp(base, white, (float)HitFlash)` on the SpriteRenderer **vertex color** (never MPB); shake = small jitter × `Shake`. World→Unity position via `IsoMath.WorldToScreen` Y-flipped /PPU. Buildings on `Default` layer. **Driven from the Step-5 substep loop at `STEP_MS`, NOT a frame-rate Update** (per the cadence seam fix).

**Part C tap pick:** Standing root carries a `PolygonCollider2D` (Sprite Editor "Custom Physics Shape" silhouette; lives on the Standing root so it follows the swap) on a dedicated `Tap` layer. `TapPicker`: `wp=cam.ScreenToWorldPoint(pos); hits=Physics2D.OverlapPointAll(wp, _tapLayerMask)`; iterate, skip non-Standing, frontmost = `max(Col+Row)` tie-break [world.js:798]. On a confirmed target the attack path calls `router.HitBuilding(target, attackPower)` (NOT the view) — single-entry invariant. Reward "+$" fires from inside `Destroy` via the sink, NOT from the tap. (Zero-alloc option: `OverlapPoint(Vector2, ContactFilter2D, List<Collider2D>)` if tap GC matters — not a blocker.)

**Part D "+$" reward text** [entities.js:143-150]: anchor `(col+0.5,row+0.5,height+0.3)` → iso-projected; text `"+"+Fmt(payout)` (combo-scaled); color `#6dffa0`, big, `sy-10`, rise `vy=-38px/s`, life `1.5s`. Pooled world-space TMP on the `FX` layer. Fires ONLY from `Destroy()` (so DoT/AoE kills surface it). Per-HIT damage text (`-`+fmt, `#ffe08a`) is the OTHER pop, from the attack path — out of scope here.

**Part E dual-gate:** `gen-vectors.js` runs the REAL `world.js` (shim `window` + stub FX/Audio/Env/Economy deps; **do NOT re-implement the math** — that tests the port against itself), emitting a `buildingFsm` block: `factory` (seed/tier/maxHp/fw/fh/style + height float-bit round-trip for the order-sensitive draws), `lifecycle` (HitBuilding→Crumbling then UpdateOne tick boundaries at 550/4500/250/700; e.g. `dt→549.9` stays Crumbling, `550.0`→Rubble), `single-entry` (FakeSink counts BankDestroy/Debris/Crumble/SpawnRewardText each **==1** per kill, AND a DoT kill also ==1, not per-tick), `dot` (ApplyDot then N×`dt=300` → N hits, refresh=max). `Program.cs` adds the `buildingFsm` foreach + FakeSink call-count asserts (`.csproj` glob covers the new `Core/World/*.cs`). `BuildingFsmTests.cs` (NUnit, Core only) replays the same vectors. Verified tier vectors: `(0,0):tier 0,maxHp 10`; `(5,18):tier 6`; `(8,40):tier 13`; `(0,57):floor(57/3)=19→clamped 18, maxHp 1e9` (ROW_HP has 19 entries 0..18; the clamp is load-bearing).

**Gotchas:** DOUBLE not float; `Math.Floor` not `(int)`/`|0` (HP>2^31). Mulberry32 struct — same local var, ordered draws, tier-dependent first draw. SINGLE DAMAGE ENTRY — DoT routes through `HitBuilding`→`Destroy` once; AoE/Nova still single-enters per building; FakeSink `==1` test in BOTH gates. Reward text in `Destroy()` not the attack path; consumes combo-scaled payout. hitFlash via vertex Color, never MPB. Off-screen respawn gate passed as a bool param (camera lives in Presentation); **EditMode tests MUST pass `offscreenClear=true`** or the FSM deadlocks in Rubble. Respawn strips RARE only (keeps permanent specials). tier clamp `min(18,...)` (off-by-one IndexOutOfRange on row 57 otherwise). PolygonCollider2D silhouette is TIGHTER than the web bbox (intentional; use BoxCollider2D if a parity test needs the rect; keep `max(col+row)` tie-break). Batchmode-safe (pure Core); `UpdateOne(dt ms)` never reads `Time.deltaTime`. `rollRareSpawn` uses `Math.random` → keep it NON-deterministic (out of the bit-exact gate). VERIFY node ground-truth runs the REAL `world.js` (live-spike-beats-mock).

---

## STEP 7 — Cross-cutting FX overdraw + HDR budget (assembled-stack gate)

These fold the `perf-overdraw` findings into the slice's FX assembly (relevant once Step 5/6 wire FX into the live scene).

- **`HIGH` — stack overdraw budget (NOT per-component).** `Blend OneMinusDstColor One` + `ZWrite Off` + `ZTest Always` ⇒ zero early-Z reject; the supernova torso (~160px) is shaded ~15–21× before beam/kill-flash. FILLRATE is the SUM, not the max. Add a stack-level metric to the FXSPIKE gate: composite ALL effects, compute peak per-pixel additive layer count over the torso ROI, **assert peak ≤ ~24** (aura+plates+eye+breath+8 motes+halo+beam.glow/edge/core+bloom+killflash). Shrink the two biggest hogs (aura + halo): clamp quad scale to where `a<1/255`, or use a circular-fan mesh (~21% fewer shaded texels). Gate the kill-flash full-screen quad behind `_flash>0.001` and confirm it is the ONLY full-screen layer.
- **`HIGH` — plate-glow as ONE MeshRenderer, not a ParticleSystem.** A 10-element static ring through a PS is an ORPHANED draw (ParticleSystemRenderer never co-batches with MeshRenderer FX, locked correction #5) + a per-frame `GetParticles`/`SetParticles` native marshal. Build plate-glow as a single static 10-triangle mesh (30 verts); drive per-plate shimmer by rewriting cached `mesh.colors[].a` in LateUpdate (zero-alloc) → collapses into the shared SRP mesh-FX batch with aura/eye/halo/breath. Reserve Shuriken only for real dying systems (sparks, debris, kill-flash dust). Reject the cosmic-motes "idiomatic Shuriken" the same way.
- **`MED` — HDR off on the live scene.** SampleScene Camera has HDR on; FP16 doubles bandwidth of every additive blend on the bandwidth-bound low-end target. Bloom is off and `OneMinusDstColor One` self-limits toward 1.0 → HDR buys nothing. Set `Camera.allowHDR=false` (done in `IsoCameraRig.Awake`, Step 3c) so the device matches the harness's `allowHDR=false` capture. Add a rig-setup assert that `Camera.allowHDR` == harness capture mode.
- **`MED` — beam fold-in (when the beam unit lands):** drop `mesh.RecalculateBounds()` from the per-fire path (set a generous static `mesh.bounds` once — additive ZTest-Always FX wants to never frustum-cull mid-screen); make the impact-bloom a quad on the SAME shared `M_FxSoftAdditive.mat` tinted via vertex color (forbid a separate bloom material/MPB). Pin the beam pool to **3** in BOTH specs (`ceil(0.18/0.126)+1`); FxAssetBaker's "e.g. 8" is over-provisioned.
- **`LOW` — one canonical soft-radial.** Bake ONE 256px clamp/linear/no-mip radial; aura+eye+motes+halo+plate-glow ALL bind it as `_MainTex` on the ONE shared `M_FxSoftAdditive.mat`. Breath 2-stop and beam V-ramp ride a SECOND shared material. Target: 2–3 FX materials total across all 20 forms, tinted by vertex color. Resolve the falloff-curve disagreement (r² vs smoothstep vs plateau) to one curve and re-validate each capture.

---

## STEP 8 — Other folded findings (kept so a builder doesn't reintroduce them)

- **`web-fidelity/HIGH` — kill-flash has NO 0.004 floor.** If/when the kill-flash struct is built, its `Tick` is simply `if(dt>0.05)dt=0.05; if(Value>0) Value=Max(0, Value-dt*1.8);` [entities.js:957, guard `>0`, floors at 0 naturally]. Delete any `Floor=0.004`/else-zero logic — that constant was mis-lifted from the iso.js TRAUMA decay (a DIFFERENT scalar). Keep `Visible => Value>0.001`, `Alpha => Value*0.75`, `FloorCharge => Max(Value, 0.25+0.35*chargeT)`. (The 0.004 floor is CORRECT only in `TraumaModel`, Step 2.)
- **`web-fidelity/MED` — `plates:16` is DEAD for FX.** `drawPlates` hardcodes `N=9` ⇒ 10 glints; `plates:16` is consumed only by the opaque body-bake path. Anywhere a spec lists the supernova palette for FX, annotate `plates:16 (DEAD for FX — drawPlates hardcodes N=9 => 10 glints)`; bake 10.
- **`web-fidelity/MED` — cosmic-motes source.** Copy from `MOTE_FX.cosmic` (entities.js:778-792: bare `glowPhase`, `BW*0.42/BH*0.52/BH*0.26`), NOT `MOTE_FX.pink` (entities.js:769-777: `glowPhase*2`, `BW*0.4/BH*0.5/BH*0.25`).
- **`web-fidelity/MED` — breath-charge inner radius is 1px** (no plateau; continuous center→edge ramp). The baked flat-core band is a slight center over-bright; acceptable faithful-in-spirit. If the FX-fidelity gate flags it, drop the flat `coreHalf` band and ramp `breath[1]→breathGlow` linearly. Stop COLORS (core=`#b07dff`, mid=`rgba(200,120,255,0.98)`, edge transparent) are exact — do not change.
- **`unity-batchmode-api/LOW` — ONE canonical SortingLayer helper.** Seven FX specs each append `"FX"` idempotently with a name-scan guard; only the first to run wins. Pick ONE shared Editor static (FxAssetBaker's `AddFxSortingLayer`) and have the others CALL it. Prefer the engine-managed-ID path `InternalEditorUtility.AddSortingLayer() + SetSortingLayerName(count-1,"FX")` over hand-rolled uniqueIDs (no collision risk). Commit the `TagManager.asset` diff.
- **`unity-batchmode-api/LOW` — ParticleSystem module mutation:** capture the module in a local first (`var main = ps.main; main.loop = true;`) — `ps.main.loop = true` inline is a CS1612 compile error. The back-pointer writes through (NOT a copy-forks hazard). `Emit(10)` BEFORE the first `GetParticles` or the ring reads empty.
- **`unity-batchmode-api/LOW` — texture bake order:** `ImportAsset`/`AssetDatabase.Refresh` BEFORE `AssetImporter.GetAtPath`, then set importer props, then `SaveAndReimport()`. `new Texture2D(N,N,RGBA32,false,true)` = no-mips + LINEAR (correct for an alpha mask). One `AssetDatabase.Refresh` at the very END of prefab/scene construction (a mid-method Refresh can trigger a domain reload that aborts the `-executeMethod` static). `EditorApplication.Exit` only under `Application.isBatchMode`.

---

## Build order & gating summary

1. **Step 0** reconcile `IsoMath` ownership (paper decision, blocks 1/3/4/6).
2. **Step 1** `IsoMath` depthKey+w2s → dual-gate green (Leg A pass count up from 144; Leg B NUnit green).
3. **Step 2** `TraumaModel` → dual-gate green. (Cinemachine Perlin adapter waits on Step 3 package.)
4. **Step 3** Cinemachine pin + asmdef + `ScreenToWorld`/clamp consts dual-gate + `IsoCameraRig` + Confiner → MCP scene-verify (L1 compile / L2 play / L3 screenshot: kaiju at `(0.5,0.66)`, no over-pan). **Pre-flight grep the 3.x symbols.**
5. **Step 4** depthKey sort (PlayerDepthBias+SortingOrder) → dual-gate green + FX SortingLayer appended.
6. **Step 5** loop + sim/view seam + `KaijuSim` → dual-gate green incl. the 2 behavioral NUnit tests (gate-closes-after-fire, attack-edge-once-across-5-substeps). **hypot decision gated; atkCooldown guarded.**
7. **Step 6** building FSM + DamageRouter + BuildingView + TapPicker + reward text → dual-gate green incl. FakeSink single-entry `==1` (direct + DoT). Driven from the Step-5 substep loop.
8. **Step 7** assembled-stack overdraw + HDR budget folded into the live FX scene; peak-overdraw metric tracked in the FXSPIKE gate.

**Every Core port:** `node gen-vectors.js > vectors.json` → `"$DOTNET" run -c Release --project tools/core-tests` (exit 0) → Unity `-runTests EditMode` (green) → tag → push → flip. Leg A needs NO Unity license (CI core-bitexact); adding ports only grows the pass count, it cannot regress the no-license path.