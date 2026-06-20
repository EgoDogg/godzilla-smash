# P0-FXSPIKE-BUILD — Supernova FX Body Build Sheet

> ✅ **SHIPPED — reference only** (`uz-P0-FXSPIKE`, commit `ac7dd6f`, 2026-06-20). Built + verified on 5 gates + a 4-lens adversarial verify. **Implementation deviations from this sheet (recorded in the ledger evidence):** KillFlash `dt` clamp is **0.05** not 0.1 (entities.js:954); the sorting layer is added via **SerializedObject** (the spec's `InternalEditorUtility.AddSortingLayer` is gone in 6000.5); the "File 2" `Godzilla.Core.csproj` edit is **moot** (Unity-generated + gitignored); cosmic-mote/halo centers are **Y-flipped** (the spec's Step-7 constant omitted the flip); a **PrefabValidity** gate (b2) was added. This sheet is retained as the FX spec of record; consult the shipped code + ledger for the as-built truth.

Build source for the post-clear autonomous run. Ordered, each step carries the concrete C#/shader/editor-API recipe, the exact web numbers, and the verify command. Builds on the LOCKED foundation (P0-SKELETON + FXSPIKE gate(a) green @ commit 7530d50). Do **not** re-derive proven facts or re-introduce fixed bugs.

## Corrections applied (folded into the recipes below)

These supersede the raw FX-body specs wherever they conflict. Every one is baked into the steps.

1. **kill-flash decay (HIGH):** DELETE the fabricated `Floor=0.004` snap-to-zero. Web `_flash` decays with guard `> 0` and floors at `0` naturally (`entities.js:957`). The 0.004 was mis-lifted from iso.js trauma. Decay is `if (Value > 0) Value = max(0, Value - dt*1.8)`; visibility gate is `> 0.001`.
2. **plate-glow count (HIGH):** bake **10** glints, never 16. `drawPlates` hardcodes `var N=9; for(i=0;i<=N;i++)` → 10. `config plates:16` is DEAD for the FX (opaque-skin path only). Annotate every palette citation `plates:16 (DEAD for FX)`.
3. **plate-glow renderer (HIGH/perf):** plate-glow is **ONE MeshRenderer with a single 10-triangle (30-vert) mesh**, NOT a ParticleSystem. Reject the PS path — it orphans a draw call (PROVEN #5) and adds a per-frame `GetParticles`/`SetParticles` native marshal. Drive shimmer by rewriting the 30 cached vertex-color alphas in `LateUpdate`.
4. **cosmic-motes source fn (MED):** copy `MOTE_FX.cosmic` (`entities.js:778-792`, `aa=c*1.7+phase`, radii `BW*0.42`/`BH*0.52`/`BH*0.26`), NOT `MOTE_FX.pink` (`glowPhase*2`, `BW*0.4`/`BH*0.5`/`BH*0.25`).
5. **breath-charge inner ramp (MED):** web inner radius is **1px** (no plateau). Acceptable to bake a near-flat core band as faithful-in-spirit; if the fidelity gate flags center over-bright, drop the flat coreHalf band and ramp `breath[1]→breathGlow` linearly from center. Stop COLORS are exact and immutable.
6. **shared materials/textures (LOW/perf):** bake exactly ONE canonical soft-radial (`soft_radial.png`, 256px, linear mask, mips off) bound on ONE shared `FXSoftAdditive.mat`; ALL of aura/eye/motes/halo/plate-glow/bloom/kill-flash use it. Only breath-charge (2-stop) and the beam (V-ramp) get a SECOND/THIRD shared material. Target ≤3 FX materials total; per-form tint always on vertex color.
7. **overdraw budget (HIGH/perf):** the assembled stack is ~21 additive layers in a ~160px torso (ZTest Always = zero early-Z). The FXSPIKE gate must measure **peak per-pixel additive layer count** over the torso ROI and assert `≤24`. Trim aura/halo dead corners (fan mesh or scale-to-`a<1/255`). Kill-flash is the ONLY full-screen layer.
8. **HDR off (MED/perf):** set `Camera.allowHDR=false` in FxSpike.unity AND the device build (Bloom is off, screen-blend self-limits in LDR — HDR is pure FP16 fillrate waste and makes the `allowHDR=false` capture faithful to the target). Assert the rig camera's HDR matches the harness capture mode.
9. **beam pool size (MED):** POOL = **3** in BOTH the beam-quad component and FxAssetBaker (single source of truth; `ceil(0.18/0.126)+1=3`). Not 8.
10. **beam zero-alloc leaks (MED):** drop `RecalculateBounds` from the per-fire path (set a fixed large `mesh.bounds` once in Init — additive FX with ZTest Always must never frustum-cull). Bloom is a quad on the SAME shared material + soft-radial, tinted via vertex color — NO separate bloom material/MPB (folds 6 draws → 0 extra batches).
11. **shared SortingLayer helper (LOW):** SEVEN specs each append "FX". Write ONE canonical helper `AddFxSortingLayer.EnsureFx()` and have everything CALL it (idempotent name-scan guard). Prefer `InternalEditorUtility.AddSortingLayer()` + `SetSortingLayerName(count-1,"FX")` (engine-assigned uniqueID, zero collision risk) over hand-rolled uniqueIDs.
12. **control-shader name (LOW):** the shipped verification control is `Godzilla/FXAdditiveControl` (shader name), NOT `_FXBlendControl`. The harness already uses it.
13. **gate(b) dedicated camera (LOW):** `AnimateAndCoverage` must instantiate its OWN offscreen camera (ortho size = RTheight/2 so 1unit==1px, own targetTexture) — do NOT reuse `BlendCorrectness`'s `orthographicSize=1f` camera.
14. **LOCKED carries (do not regress):** tint on VERTEX COLOR not MPB (SRP Batcher ON); beam V-ramp CORE=`breath[1]`#b07dff purple / MID=`breath[0]`#ffffff white / RIM=breathGlow; re-fire gate `clamp(0.30*0.42,0.11,0.20)=0.126s`; URP blends LINEAR → gate the self-limiting SHAPE not absolute gamma; ParticleSystem ⊥ MeshRenderer co-batch; validate capture non-blank before trusting any gate; plate glint is an UP-POINTING TRIANGLE; cosmic mote/halo colors are HARDCODED; Mulberry32 is a struct → hold in a FIELD.

Foundation facts confirmed on disk: shader `Godzilla/FXSoftAdditive` GUID `d69a85262b8b046ec8bdbbf955da9d36`, frag `a=tex.a*IN.color.a*_Color.a`, `rgb=tex.rgb*IN.color.rgb*_Color.rgb`, premultiplied. Editor asmdef `Godzilla.Editor` lives at `Assets/Scripts/Editor/` (`BuildScript.cs`, `FxRenderHarness.cs`). `TagManager.asset` has only `Default(uniqueID:0)`. Harness `ShotsDir()` → `docs/campaign/shots/unity`; helpers `AvgBlock/QuadMesh/Quad`; `W=512,H=256`.

---

## Step 0 — branch + clean baseline

Run git-clean per CLAUDE.md ("commit before every agent session"). Work on `unity-port`.

```bash
cd "/Users/MGitk/Projects/Godzilla Game" && git status --porcelain && git log --oneline -1
```
**Verify:** working tree clean; HEAD at or after `7530d50`.

---

## Step 1 — canonical FX SortingLayer helper (shared by all FX)

**File:** `GodzillaSmash/Assets/Scripts/Editor/AddFxSortingLayer.cs` (namespace `Godzilla.Editor`).

```csharp
using UnityEditor;
using UnityEditorInternal;
using UnityEngine;

namespace Godzilla.Editor {
  public static class AddFxSortingLayer {
    [MenuItem("Godzilla/Setup/Add FX Sorting Layer")]
    public static void Run() => EnsureFx();

    // Idempotent. Prefer the engine-managed API (no hand-rolled uniqueID -> zero collision risk).
    public static void EnsureFx() {
      var tm = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset")[0]);
      var layers = tm.FindProperty("m_SortingLayers");
      for (int i = 0; i < layers.arraySize; i++)
        if (layers.GetArrayElementAtIndex(i).FindPropertyRelative("name").stringValue == "FX") return; // already present
      InternalEditorUtility.AddSortingLayer();                                  // engine assigns uniqueID
      tm.Update();
      var last = layers.arraySize - 1;
      InternalEditorUtility.SetSortingLayerName(last, "FX");                    // name the appended (last) layer
      AssetDatabase.SaveAssets();
    }
  }
}
```

Every FX component/baker calls `AddFxSortingLayer.EnsureFx()` (never re-implements the append). FX layer is appended LAST = topmost = draws over `Default` sprites. **Z-order table (intra-FX `sortingOrder`):** aura 10 < plateGlow 20 < eye 50 < breath 60 < motes 65 < halo 66 < beam strip 90 < bloom 91 < kill-flash 32760.

**Web mapping:** web draws `drawGlow` as a `globalCompositeOperation='screen'` overlay on top of the body each frame (`entities.js:1587`); Unity maps to the appended FX layer.

**Verify:**
```bash
cd "/Users/MGitk/Projects/Godzilla Game" && "$UNITY" -batchmode -projectPath GodzillaSmash -executeMethod Godzilla.Editor.AddFxSortingLayer.Run -logFile - -quit ; grep -A8 m_SortingLayers GodzillaSmash/ProjectSettings/TagManager.asset
```
Expect a `- name: FX / uniqueID: <nonzero>` entry appended after `Default`. Re-run once; assert NOT doubled.

---

## Step 2 — FxAssetBaker.cs (the editor batchmode baker: textures + materials + prefab + scene)

**File:** `GodzillaSmash/Assets/Scripts/Editor/FxAssetBaker.cs` (namespace `Godzilla.Editor`, in the existing `Godzilla.Editor` asmdef — NO new asmdef). Entry `[MenuItem("Godzilla/FX/Bake Spike Assets")] public static void BakeAll()`. Mirror `BuildScript` exit discipline verbatim: `static void Exit(int c){ if(Application.isBatchMode) EditorApplication.Exit(c); }`, `Fail(msg)→LogError+Exit(1)`, wrap body in try/catch→`Exit(2)`, success `Debug.Log("[FxAssetBaker] OK"); Exit(0)`. Idempotent.

**Constants:** `FXDir="Assets/Presentation/FX"`, `MatPath=FXDir+"/FXSoftAdditive.mat"`, `BreathMatPath=FXDir+"/FXBreath.mat"`, `BeamMatPath=FXDir+"/FXBeamRamp.mat"`, `SoftRadialPath=FXDir+"/soft_radial.png"`, `BreathPath=FXDir+"/breath_grad.png"`, `BeamRampPath=FXDir+"/beam_ramp.png"`, `PrefabPath=FXDir+"/SupernovaFxRig.prefab"`, `ScenePath="Assets/Scenes/FxSpike.unity"`. `const float PXU=100f`; `const float BH=124.32f` (=SPR_H 168×0.74); `const float BW=62.16f`. **COORD RULE:** `Unity.localX = webX/PXU`, `Unity.localY = -webY/PXU` (web canvas +y is DOWN, Unity +y UP).

### 2a — SortingLayer first
Call `AddFxSortingLayer.EnsureFx()` (renderers reference it by name). **GOTCHA:** TagManager is outside `Assets/` — cannot `ImportAsset` it; the helper's `SerializedObject`+`SaveAssets` is the only batchmode-safe write.

### 2b — folders
`if(!AssetDatabase.IsValidFolder("Assets/Scenes")) AssetDatabase.CreateFolder("Assets","Scenes");` (FXDir already holds the shaders; guard anyway.)

### 2c — bake `soft_radial.png` (the ONE canonical radial, correction #6)
256×256, RGB=white, A=`a*a` (r² falloff). **Resolve the falloff-curve disagreement once:** use `a=clamp01(1-d); a=a*a` for the shared asset (re-validate each consumer against it).
```csharp
int S=256; var tex=new Texture2D(S,S,TextureFormat.RGBA32,false,true); // mips off, LINEAR (alpha is a data mask)
var px=new Color32[S*S]; float c=(S-1)*0.5f;
for(int y=0;y<S;y++)for(int x=0;x<S;x++){ float dx=(x-c)/c,dy=(y-c)/c; float d=Mathf.Sqrt(dx*dx+dy*dy);
  float a=Mathf.Clamp01(1f-d); a*=a; px[y*S+x]=new Color32(255,255,255,(byte)(a*255f)); }
tex.SetPixels32(px); tex.Apply();
File.WriteAllBytes(Path.GetFullPath(Path.Combine(Application.dataPath,"../"+SoftRadialPath)), tex.EncodeToPNG());
Object.DestroyImmediate(tex);
AssetDatabase.ImportAsset(SoftRadialPath, ImportAssetOptions.ForceUpdate);
var imp=(TextureImporter)AssetImporter.GetAtPath(SoftRadialPath);  // importer exists ONLY after import
imp.textureType=TextureImporterType.Default; imp.sRGBTexture=false; imp.alphaIsTransparency=true;
imp.alphaSource=TextureImporterAlphaSource.FromInput; imp.wrapMode=TextureWrapMode.Clamp;
imp.filterMode=FilterMode.Bilinear; imp.mipmapEnabled=false; imp.npotScale=TextureImporterNPOTScale.None;
imp.SaveAndReimport();
```
**GOTCHA:** `sRGBTexture=false` — it is an alpha falloff mask; sRGB-decoding warps the ramp into a hard ring. Set importer props AFTER `ImportAsset` (no-op before first import).

### 2d — bake `breath_grad.png` (64×64, 2-stop, correction #5)
CORE=`breath[1]` `#b07dff`(176,125,255) → MID(0.5)=breathGlow(200,120,255,0.98) → edge transparent. RGB = lerp(core,mid) by normalized radius; A = `(1-d)*0.98`. Importer identical to 2c. Note open-q: web inner r is 1px; flat-core band is a slight center over-bright — drop it for a linear ramp if the gate flags.

### 2e — bake `beam_ramp.png` (256×4, V-ramp, correction #14)
Sampled by mesh V across width (0.5=spine). `Wmax`=half of glow width 9 = 4.5. Bands as fraction of half-width: `coreHalf=1.8*0.5/4.5=0.20`, `edgeHalf=4.05*0.5/4.5=0.45`, `glowHalf=1.0`. Colors: CORE=`breath[1]`(176,125,255), MID=`breath[0]`(255,255,255), RIM=breathGlow(200,120,255). For texel u, `d=|u/255*2-1|`:
- `d<=coreHalf` → CORE, aBase=1.00
- `d<=edgeHalf` → MID, aBase=0.92
- else → RIM, aBase=`(1-(d-edgeHalf)/(1-edgeHalf))*0.98`

`a = aBase*(1-smoothstep(0.92,1.0,d))`. Bake as **sRGB import** (write sRGB Color32 bytes), `wrapMode=Clamp`, `mipmapEnabled=false`, `textureCompression=Uncompressed`.

### 2f — materials (correction #6)
```csharp
var sh=Shader.Find("Godzilla/FXSoftAdditive"); if(sh==null) Fail("shader Godzilla/FXSoftAdditive not found"); // NAME not filename
// idempotent: DeleteAsset if present, then CreateAsset
var mat=new Material(sh); mat.SetColor("_Color",Color.white); mat.SetTexture("_MainTex", LoadTex(SoftRadialPath));
AssetDatabase.CreateAsset(mat, MatPath);
// FXBreath.mat -> same shader, _MainTex=breath_grad.png ; FXBeamRamp.mat -> same shader, _MainTex=beam_ramp.png
AssetDatabase.SaveAssets();
```
**GOTCHA:** `Shader.Find` takes the shader-name string `"Godzilla/FXSoftAdditive"`, NOT the filename `GodzillaFXAdditive`. `_Color=white`; per-form tint rides vertex color (MPB breaks SRP Batcher, m_UseSRPBatcher:1).

### 2g — build `SupernovaFxRig.prefab`
Build the hierarchy as live GameObjects, then `PrefabUtility.SaveAsPrefabAsset(root, PrefabPath, out bool ok); if(!ok) Fail(...); Object.DestroyImmediate(root);`. Root `SupernovaFxRig` carries a minimal `FxDirector` stub MonoBehaviour (Presentation; Step 9). All children: `sortingLayerName="FX"` + the Step-1 order. One empty child `MuzzleSocket` at web mouth `(headX*BW+BW*(0.5+snout), -BH*0.77)` → both breath-charge quad and beam origin read it (one socket; must be EQUAL by construction). Children placed per Steps 3-8 (transforms baked at rest phase; FxDirector animates at runtime).

### 2h — build `FxSpike.unity`
```csharp
var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
var camGO=new GameObject("Main Camera"); var cam=camGO.AddComponent<Camera>();
cam.orthographic=true; cam.orthographicSize=5f; cam.clearFlags=CameraClearFlags.SolidColor;
cam.backgroundColor=new Color(0.78f,0.78f,0.82f,1f); cam.allowHDR=false;  // correction #8: HDR OFF
cam.transform.position=new Vector3(0,0,-10); camGO.AddComponent<UniversalAdditionalCameraData>();
var lightGO=new GameObject("Global Light2D"); var l2d=lightGO.AddComponent<Light2D>();
l2d.lightType=Light2D.LightType.Global; l2d.intensity=1f;   // URP 2D: without a global light, lit content renders black
// 3-4 backdrop quads (pale #c8c8d2 / mid #8a8a90 / dark #303036) on an UNLIT material at z=+1..+3 (NOT FXSoftAdditive)
var rig=(GameObject)PrefabUtility.InstantiatePrefab(LoadGO(PrefabPath)); rig.transform.position=Vector3.zero;
if(!EditorSceneManager.SaveScene(scene, ScenePath)) Fail("SaveScene failed");
var scenes=new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
if(scenes.TrueForAll(s=>s.path!=ScenePath)) scenes.Add(new EditorBuildSettingsScene(ScenePath,true));
EditorBuildSettings.scenes=scenes.ToArray();
```

### 2i — finalize
`AssetDatabase.SaveAssets(); AssetDatabase.Refresh();` ONCE at the very end. **GOTCHA:** NEVER `Refresh` mid prefab/scene construction (6000.x can domain-reload mid-method and abort the `-executeMethod` static call). All `PrefabUtility`/`EditorSceneManager` work in one synchronous pass, Refresh last.

**Verify:**
```bash
cd "/Users/MGitk/Projects/Godzilla Game" && "$UNITY" -batchmode -projectPath GodzillaSmash -executeMethod Godzilla.Editor.FxAssetBaker.BakeAll -logFile - ; echo "exit=$?"; ls -la GodzillaSmash/Assets/Presentation/FX/*.png GodzillaSmash/Assets/Presentation/FX/*.mat GodzillaSmash/Assets/Presentation/FX/SupernovaFxRig.prefab GodzillaSmash/Assets/Scenes/FxSpike.unity
```
Expect `exit=0`, `[FxAssetBaker] OK`, all 3 PNGs + 3 mats + prefab + scene present, FX layer in TagManager.

---

## Step 3 — AuraHalo.cs (supernova aura halo)

**File:** `GodzillaSmash/Assets/Scripts/Presentation/FX/AuraHalo.cs` (`Godzilla.Presentation`). Static MeshRenderer quad, scalar radius pulse, tint on vertex color (a COPY of the shared quad mesh, painted once at Init — copy the MESH not the material).

**Web constants** (`entities.js:330,1582-1601`): `SPR_H=168`; `BH=SPR_H*0.74=124.32`; gradient center `(0,-BH*0.5)=(0,-62.16)` → Unity child offset `+62.16px=+0.6216u` (Y flip); `R_BASE=BH*0.62=77.0784`; `R_PULSE=BH*0.05=6.216`; `pulse=(sin(phase*1.6)+1)*0.5` (`:1590`); `r=BH*(0.62+pulse*0.05)` → 77.08..83.30px; `pal.aura=rgba(157,78,221,0.24)` (`config.js:161`); `ctx.globalAlpha=0.85` (`:1598`). Fold both web alphas: `vertexColor.a = round(0.24*0.85*255) = 52` → `Color32(157,78,221,52)` authored sRGB (URP converts to linear; do NOT pow).

```csharp
const float BH=124.32f, R_BASE=BH*0.62f, R_PULSE=BH*0.05f, CENTER_Y_PX=-BH*0.5f;
static readonly Color32 AURA_SRGB = new Color32(157,78,221,52);
[SerializeField] float pxPerUnit=100f;  // MUST match Phase-1 body SpriteRenderer PPU
// Init(sharedFxMat, sharedQuad): child "AuraQuad" at localPos (0, (-CENTER_Y_PX)/pxPerUnit, 0);
//   mesh=Instantiate(sharedQuad); paint colors32[*]=AURA_SRGB; sharedMaterial=ONE FXSoftAdditive.mat;
//   sortingLayerName="FX"; sortingOrder=10; shadowCasting Off; receive/probe/reflection Off.
void LateUpdate(){
  float pulse=(Mathf.Sin(_phase*1.6f)+1f)*0.5f;
  float rPx=R_BASE+R_PULSE*pulse;
  float diaU=(rPx*2f)/pxPerUnit;             // baked radial reaches a=0 at quad half-extent -> scale = DIAMETER
  _aura.localScale=new Vector3(diaU,diaU,1f);
}
```
`_phase` fed by the ONE shared FX clock (FxDirector `_glowPhase`). sharedQuad = the FxAssetBaker unit quad (centered ±0.5, UV 0..1).

**Correction #7 trim:** the radial hits `a<1/255` well inside the quad corner — use a circular-fan mesh (or clamp scale) to drop ~21-40% dead-corner shaded texels. Same for the head halo.

**Open-q (documented, not blocking):** inner-plateau ~8% wobble from uniform-scaling a baked mask vs the web's pulse-invariant fixed inner r; below perceptual threshold under screen-blend; escape hatch = two shader params if a pixel-diff gate flags.

**Verify:** captured by the Step 10 gate (aura ROI lit, purple-ish, self-limits over mid-gray).

---

## Step 4 — PlateGlow.cs (10 dorsal glints, ONE mesh — correction #2,#3)

**File:** `GodzillaSmash/Assets/Scripts/Presentation/FX/PlateGlow.cs` (`Godzilla.Presentation`). ONE MeshRenderer, ONE static mesh of **10 up-pointing triangles (30 verts)**. NO ParticleSystem.

**Web geometry** (`entities.js:591-607`, GLOW pass, lean=0): N=9 → `i=0..9` = 10 triangles. Per plate `t=i/9`:
```
cx   = lerp(BW*0.24, -BW*0.52, t)
cy   = -(lerp(0.80,0.36,t) + sin(t*PI)*0.06) * BH      // web -y up
size = (sin(t*PI)*0.13 + 0.05) * BH
A(base-R) = (cx + BW*0.07, cy + size*0.30)
B(apex)   = (cx - BW*0.01, cy - size*1.08)              // GLOW apex -1.08 (NOT body -1.0)
C(base-L) = (cx - BW*0.11, cy + size*0.30)
```
Convert each vert: `localX=vx/100`, `localY=-vy/100`. Color `plateGlow rgba(165,90,230,0.98)` (`config.js:159`) → linear `(0.371,0.106,0.764)`. Per-plate alpha `clamp(0.30 + 0.5*shimmer*sin(t*PI), 0, 1)`; `shimmer=(sin(phase*3)+1)*0.5` (`:1589`).

```csharp
// Awake: build mesh (30 verts, 10 tris, vertex colors = plateGlow linear, alpha baked at shimmer=0.5).
//   Cache _baseT[10] (the t per plate) and _cols (Color[30]) for the per-frame alpha rewrite.
void LateUpdate(){
  float shimmer=(Mathf.Sin(_phase*3f)+1f)*0.5f;
  for(int p=0;p<10;p++){ float t=p/9f; float a=Mathf.Clamp01(0.30f+0.5f*shimmer*Mathf.Sin(t*Mathf.PI));
    for(int v=0;v<3;v++){ var c=_cols[p*3+v]; c.a=a; _cols[p*3+v]=c; } }
  _mesh.colors=_cols;   // 30 verts, zero-alloc (reused array)
}
```
`sortingOrder=20`. **GOTCHA:** GLOW triangle ≠ body triangle (don't copy body verts +0.06/-0.10/apex `-size`). The dim-ends/bright-mid gradient is `sin(t*PI)` baked into `t`, NOT a curve.

**Verify:** Step 10 gate — exactly 10 clusters on a descending arc, mid-row brighter than ends, purple-dominant.

---

## Step 5 — EyeGlowFX.cs (white head disc, back-facing suppressed)

**File:** `GodzillaSmash/Assets/Scripts/Presentation/FX/EyeGlowFX.cs` (`Godzilla.Presentation`). Child MeshRenderer quad on the shared material; drives white-alpha each frame; hidden on back/back34.

**Web** (`entities.js:1606-1613`): center `(hx + BW*0.47, -BH*0.842)`, `hx=fg.headX*BW`; radius `BW*0.06=3.7296px`; color `#ffffff`; `alpha=0.55 + shimmer*0.45` (0.55..1.0); suppressed when `fg.show=='back' || 'back34'`. Per-base headX `0.00/0.16/0.30/0.18/0.00` for base `0/1/2/3/4`; suppress bases 3 (back34) & 4 (back).

```csharp
public System.Func<int> FacingBase;   // 0..4; FXSPIKE hardcodes ()=>2 (side, shown)
double _glowPhase;
void Update(){
  _glowPhase += Time.deltaTime;
  int b = FacingBase!=null ? FacingBase() : 2;
  bool shown = (b!=3 && b!=4); if(_mr.enabled!=shown) _mr.enabled=shown; if(!shown) return;
  float shimmer=(float)((System.Math.Sin(_glowPhase*3.0)+1.0)*0.5);
  float a=0.55f+shimmer*0.45f;
  for(int i=0;i<_cols.Length;i++) _cols[i]=new Color(1,1,1,a);
  _mesh.colors=_cols;
}
```
Use `GetComponent<MeshFilter>().mesh` (instance copy, not sharedMesh) so per-eye colors don't clobber the shared asset. `sortingOrder=50`. Author offset via px*K where K = body PPU (FXSPIKE: K=1/100). **GOTCHA:** negate web Y (`+BH*0.842*K`) or the eye lands at the feet.

**Verify:** Step 10 gate — eye ROI lit at phase=pi/6 strictly brighter than phase=0; dark when FacingBase returns 3/4.

---

## Step 6 — BreathChargeFX.cs (muzzle-flash 2-stop radial)

**File:** `GodzillaSmash/Assets/Scripts/Presentation/FX/BreathChargeFX.cs` (`Godzilla.Presentation`). Quad on `FXBreath.mat` (breath_grad.png), child of `MuzzleSocket` at localPos 0. INACTIVE until gated.

**Web** (`entities.js:1616-1626`): center = mouth `(headX*BW+BW*(0.5+snout), -BH*0.77)`; radius `BW*0.4=24.864px` → diameter `1.2432u` at PXU=100; gate `fsm=='attack' && attackFrame<=2 && fg.show!='back'` (back34 still shows). `attackFrame=clamp(floor((1-attackT/dur)*6),0,5)` (`:1068`). `chg=1-attackFrame/3.0; alpha=chg*0.9` → frame0=0.9, frame1=0.6, frame2=0.3, ≥3 hidden.

```csharp
void LateUpdate(){
  bool show = owner.Fsm==Fsm.Attack && owner.AttackFrame<=2 && owner.FacingShow!=FacingShow.Back;
  _mr.enabled=show; if(!show) return;
  float a=(1f - owner.AttackFrame/3f)*0.9f;
  for(int i=0;i<baseCols.Length;i++){ scaled[i]=baseCols[i]; scaled[i].a=baseCols[i].a*a; }
  mesh.SetColors(scaled);   // re-upload vertex colors (NOT _Color.a / NOT MPB -> both fork the material & break SRP Batcher)
}
```
v1: a 4-vert quad with all verts = breathGlow linear is acceptable (texture supplies falloff). If the gate wants the core hue, use a 17-vert ring (1 center=`breath[1]` linear + 8 mid=breathGlow + 8 outer alpha 0). `sortingOrder=60`. **GOTCHA:** driving alpha via `material.SetFloat("_Color")` breaks the SRP Batcher exactly like an MPB — re-upload vertex colors instead.

**MuzzleSocket** (shared, recomputed on facing change): localPos `((mir?-1:1)*((headX*BW)+BW*(0.5+snout))/PXU, (-BH*0.77)/PXU, 0)`. Per-base (snout,headX): `0:(0.10,0.0)`, `1:(0.30,0.16)`, `2:(0.46,0.30)`, `3:(0.24,0.18)`. MUST equal the beam muzzle by construction.

**Verify:** Step 10 gate cap5 (breath ROI dark in caps 1-4, lit in cap5 → proves the fsm gate).

---

## Step 7 — CosmicMotes.cs (8 orbiting motes + halo — correction #4)

**File:** `GodzillaSmash/Assets/Scripts/Presentation/FX/CosmicMotes.cs` (`Godzilla.Presentation`). 8 child quads + 1 halo quad on the shared material. NO Shuriken.

**COPY FROM `MOTE_FX.cosmic` (`entities.js:778-792`) NOT `MOTE_FX.pink` (`:769-777`).** PPU=56 here (PX_PER_TILE=TILE_W=56, `config.js:15`). Per mote `c=0..7`: `aa=c*1.7+phase`; `x=cos(aa)*BW*0.42`; `y=-BH*0.52+sin(aa*1.3)*BH*0.26`; size px `cr=(sin(phase*3+c)+1)*0.5*3+1` (1..4px) → quad DIAMETER `2*cr/56`. Color HARDCODED `rgba(210,150,255,0.95)*globalAlpha 0.85` → vertex rgb `(0.8235,0.5882,1.0).linear`, alpha `0.8075` (set ONCE). Head halo at `(0,-BH*0.5)`, radius `BW*0.7=43.512px`, white→purple, `alpha=0.25+pulse*0.4` (animated).

```csharp
const float PPU=56f, ORBIT_R=BW*0.42f/56f, MOTE_Y0=-BH*0.52f/56f, MOTE_YAMP=BH*0.26f/56f, HALO_Y=-BH*0.5f/56f;
void LateUpdate(){
  float p=(float)body.GlowPhase;
  for(int c=0;c<8;c++){ float aa=c*1.7f+p;
    moteTf[c].localPosition=new Vector3(Mathf.Cos(aa)*ORBIT_R, MOTE_Y0+Mathf.Sin(aa*1.3f)*MOTE_YAMP, MOTE_Z);
    float d=((Mathf.Sin(p*3f+c)+1f)*0.5f*3f+1f)*2f/56f; moteTf[c].localScale=new Vector3(d,d,1f); }
  float haloA=0.25f+((Mathf.Sin(p*1.6f)+1f)*0.5f)*0.4f;
  for(int i=0;i<4;i++) _haloCols[i].a=haloA; haloMesh.colors=_haloCols;
}
```
Mote color set once (constant); halo alpha rewritten each frame. `sortingOrder`: motes 65, halo 66. Pool: `SetActive(false)` on non-supernova forms (gate on `active==supernova && pal.fxMotes=='cosmic'`), never Destroy/Instantiate. **GOTCHA:** quad scale = DIAMETER (2×radius); NO RNG (pure periodic trig — Mulberry32 is beam-only); halo reuses the white shared radial (purple is subtle under screen-blend; bake a dedicated white→purple radial only if the fidelity gate flags it).

**Verify:** Step 10 gate — mote annulus shifts per phase; halo present.

---

## Step 8 — Beam: FxPixelSpace + BeamMesh + BeamQuad + BeamPool (corrections #9,#10,#14)

**Files** (all `Godzilla.Presentation`): `FxPixelSpace.cs`, `BeamMesh.cs`, `BeamQuad.cs`, `BeamPool.cs`. Material `FXBeamRamp.mat` (beam_ramp.png).

**8a — FxPixelSpace.cs:**
```csharp
public const float OrthoSize=5f, DesignHeightPx=720f, UnitsPerPx=(OrthoSize*2f)/DesignHeightPx /*0.013888889f*/, FxZ=-1f;
public static Vector3 ToWorld(in Vector2 px)=>new Vector3(px.x*UnitsPerPx, -px.y*UnitsPerPx, FxZ);  // Y flip
public static float ToWorldLen(float lenPx)=>lenPx*UnitsPerPx;
```

**8b — BeamMesh.cs (zero-alloc):** 9 spine pts → 18 verts (±halfWidth), 8 quads → 48 indices. ALL arrays (`_v,_uv,_c,_i,_spine`) pre-alloced in ctor; `mesh.MarkDynamic()`; index buffer + UVs (U=spine progress i/8, V=side 0/1) set ONCE. `Rebuild(muzzle,target,jitteredSpine,halfWidthWorld,tint)` overwrites positions + per-vert tint, `SetVertices`/`SetColors` (no realloc). **Correction #10:** set a fixed large `mesh.bounds` once in ctor; DROP `RecalculateBounds` from the per-fire path entirely (additive ZTest-Always FX must never frustum-cull mid-screen). Add `SetAlpha(float a)`: rewrite cached `_c[*].a=a`, `SetColors(_c)`.

**8c — jitter (Mulberry32 in a FIELD):**
```csharp
Godzilla.Core.Mulberry32 _rng;  // FIELD. NEVER `var r=_rng; r.NextDouble()` (struct copy forks the stream).
// per Fire: _rng=new Mulberry32(unchecked((uint)(0x9E3779B9u ^ (uint)fireIndex)));  // reproducible spike captures
float ampW=FxPixelSpace.ToWorldLen(5f);   // GLOW stroke amp (entities.js strokeJagged)
for(int i=0;i<9;i++){ var p=Vector3.Lerp(muzzleW,targetW,i/8f);
  if(i!=0&&i!=8){ p.x+=(float)(_rng.NextDouble()*2-1)*ampW; p.y+=(float)(_rng.NextDouble()*2-1)*ampW; } _spine[i]=p; }
_spine[0]=muzzleW; _spine[8]=targetW;   // re-LOCK endpoints (defensive)
```
Jitter BOTH x AND y at the 8 interior verts; endpoints locked.

**8d — BeamQuad.cs:** `LIFE=0.18f` (`entities.js:153`). Per frame `a=clamp01(_t/LIFE)`; `_bm.SetAlpha(a)`; impact bloom = a child quad on the **SAME shared material + soft-radial**, tinted via vertex color (correction #10 — NO separate bloom material/MPB), `_bloom.localScale=ToWorldLen(12*a+4)*2` (`r=12*alpha+4`, `:274`), at `_target`. Strip `sortingOrder=90`, bloom `91`.

**8e — BeamPool.cs:** `POOL=3` (correction #9), `REFIRE_GATE=0.126f` (correction #14 — `clamp(0.30*0.42,0.11,0.20)`). `Update` decrements `_gateT`; `TryFire(muzzlePx,targetPx,tint)` returns false if `_gateT>0`, else arms 0.126s, acquires (first dead, else `fireIndex%POOL`), fires. FXSPIKE: harness supplies explicit `muzzlePx`/`targetPx`; Phase-1 reads `MuzzleSocket`.

**Web mapping:** V-ramp CORE=`breath[1]`#b07dff / MID=`breath[0]`#ffffff / RIM=breathGlow (`fireBeam` args `:1233`); strokes glow w9 amp±5 / edge w4.05 amp±2.5 / core w1.8 straight (`:261-275`), collapsed to ONE jittered spine at amp 5; impact bloom `r=12*alpha+4`. `BeamMesh` and bloom are mesh quads → fold into the single SRP mesh-FX batch.

**Verify:**
```bash
cd "/Users/MGitk/Projects/Godzilla Game" && "$UNITY" -batchmode -projectPath GodzillaSmash -executeMethod Godzilla.Editor.FxRenderHarness.BlendCorrectness -logFile - ; echo "exit=$?"
```
Gate(a) must stay green (no regression). Beam jitter/V-ramp asserted in Step 10.

---

## Step 9 — FxDirector.cs + KillFlash (Core) + KillFlashRenderer (corrections #1,#11)

**9a — KillFlash struct** (`GodzillaSmash/Assets/Scripts/Core/FX/KillFlash.cs`, namespace `Godzilla.Core`, NO UnityEngine, `double`):
```csharp
public struct KillFlash {
  public double Value;
  public void TriggerFull(){ Value = 1.0; }                                   // setForm (entities.js:893)
  public void FloorCharge(double chargeT){ double f=0.25+0.35*chargeT; if(f>Value) Value=f; } // :994
  public void Tick(double dt){ if(dt>0.05) dt=0.05; if(Value>0){ Value-=dt*1.8; if(Value<0) Value=0; } } // :954,:957
  public bool   Visible => Value > 0.001;   // :1555
  public double Alpha   => Value * 0.75;    // :1557
}
```
**Correction #1:** NO `Floor=0.004`. Guard is `>0`, floors at 0 naturally. Per-frame order: `Tick(dt)` FIRST, then `if(charging) FloorCharge(chargeT)`.

**NUnit test** (`Assets/Tests/EditMode/KillFlashTests.cs`, refs Core only): from 1.0, step dt=1/60 ×10 → assert `Value == 1.0 - 10*(1/60)*1.8` within 1e-12; assert Tick stops at exactly 0 not negative; assert dt=0.1 treated as 0.05.

**9b — KillFlashRenderer** (`Assets/Scripts/Presentation/FX/KillFlashRenderer.cs`): full-screen quad on `FXSoftAdditive.mat` with a **flat white** `_MainTex` (the ONE FX quad that does NOT use the radial — web re-blits roughly-uniform pixels; a radial would vignette). `KillFlash _flash` is a FIELD. `LateUpdate`: cover viewport (`scale=(camOrthoSize*2*aspect, camOrthoSize*2,1)`), write `vertexColor.a=round(Alpha*255)`, `_mr.enabled=Visible`. `sortingOrder=32760` (drawn last). `OnFormChanged()→_flash.TriggerFull()`. `TickFlash(dt,charging,chargeT)→_flash.Tick(dt); if(charging) _flash.FloorCharge(chargeT)`. NOT through Bloom (off in DefaultVolumeProfile; raw additive quad).

**9c — FxDirector** (`Assets/Scripts/Presentation/FX/FxDirector.cs`): owns the ONE `double _glowPhase += Time.deltaTime` (`entities.js:961`) shared by aura/eye/motes/halo/plate-glow/breath (phase-lock). Exposes `GlowPhase`. The minimal stub referenced by the prefab (Step 2g) lives here.

**Verify (Core gate — runs without graphics):**
```bash
cd "/Users/MGitk/Projects/Godzilla Game" && "$UNITY" -batchmode -projectPath GodzillaSmash -runTests -testPlatform EditMode -testResults /tmp/fx-editmode.xml -logFile - ; echo "exit=$?"; grep -c 'result="Passed"' /tmp/fx-editmode.xml
```
Expect KillFlash decay tests passing; no `Floor=0.004` anywhere.

---

## Step 10 — Gate (b): FxRenderHarness.AnimateAndCoverage (correction #7,#13)

Add ONE public static method to the EXISTING `FxRenderHarness.cs` (reuse `ShotsDir`/`AvgBlock`; do NOT touch `BlendCorrectness`). **Correction #13:** instantiate a DEDICATED offscreen camera (ortho size = RTheight/2 so 1unit==1px; own 256×320 targetTexture; `allowHDR=false`, sRGB ARGB32) — do NOT reuse the size-1 BlendCorrectness camera.

**Captures:** 5 — phases `{0,0.5,1,1.5}` fsm=idle, then 1 at phase=0.6 fsm=attack/frame0 (fires breath-charge). Build a soft-radial `_MainTex` once (64px, linear, smoothstep). Place 5 effect quads per the Steps 3-7 web math (Y-flipped), tint via vertex color. Effects + ROIs (RT 256w×320h, anchor at px 128,300, 1px==1unit):

| effect | center (px) | box | color | per-phase |
|---|---|---|---|---|
| aura | 128,238 | 60 | (157,78,221) | r=BH*(0.62+pulse*0.05) |
| plates (1 rep @ t=0.5) | 119,220 | 20 | (165,90,230) up-triangle | α=clamp(0.30+0.5·shimmer,0,1) |
| eye | 157,195 | 8 | white | α=0.55+shimmer·0.45 |
| breath (cap5 only) | 165,204 | 18 | breath[1]#b07dff | α=0.9 |
| motes (8)+halo | 128,235 annulus | 30 | (210,150,255) hardcoded | aa=c·1.7+phase |

**Asserts:**
1. **non-blank first** (PROVEN #6): assert `bg != center`, else a black frame passes vacuously.
2. **coverage**: each lit region's non-bg-lit pixel count `> 0` for that capture (breath only in cap5).
3. **animation**: aura/plates/eye/motes region mean-luma `max-min > 3/255` across caps 1-4; breath DARK cap1 (`~0`) & LIT cap5 (`>0`) → proves the fsm gate.
4. **overdraw budget** (correction #7): after compositing ALL effects for the supernova capture, count quads whose AABB covers each torso-ROI pixel; assert **peak ≤ 24** (aura+plates+eye+breath+8motes+halo+beam.glow+beam.edge+beam.core+bloom+killflash). Log the peak as a tracked metric.

Mirror BlendCorrectness exactly: sRGB RT, `allowHDR=false`, `cam.Render`, `ReadPixels`, `EncodeToPNG` → `ShotsDir()/fxspike-anim-{i}.png`; try/finally `DestroyImmediate` all + `rt.Release()`; `EditorApplication.Exit(exit)` only under `Application.isBatchMode`. NO `-nographics`. Mulberry32 not needed (deterministic-in-phase); if added, hold in a FIELD.

**Verify:**
```bash
cd "/Users/MGitk/Projects/Godzilla Game" && "$UNITY" -batchmode -projectPath GodzillaSmash -executeMethod Godzilla.Editor.FxRenderHarness.AnimateAndCoverage -logFile - ; echo "exit=$?"; ls docs/campaign/shots/unity/fxspike-anim-*.png
```
Expect `exit=0`, 5 PNGs, `[FxGate]` logs showing 5 coverage + 4 animation asserts pass and peak-overdraw ≤24.

---

## Step 11 — Gate (c): Puppeteer FX-ref bake + numpy/PIL SSIM

**11a — `tools/fx-ref-bake/bake.js`** (`tools/fx-ref-bake/package.json`: `{"name":"fx-ref-bake","private":true,"type":"commonjs","dependencies":{"puppeteer":"^23"}}`; `npm i`). Headless Chromium renders the REAL web FX as ground truth. Load modules in dependency order `js/utils.js → js/config.js → js/archetypes.js → js/entities.js` (wrong order → ReferenceError → blank canvas → silently lowers SSIM). 256×320 canvas, fill bg `#0f0d1a`, `ctx.translate(128,300)` (web +y down, no flip on the canvas side), `k=G.Kaiju.create({id:'supernova'})`, set `k._glowPhase`, call `k.drawGlow(ctx, base, frame)` (FX-only). Bake phases `{0,0.5,1,1.5}` → `ref-glow-{p}.png` + one beam frame (seed `Math.random` for a stable beam ref OR compare only the blend-stat for the beam). Muzzle must equal `kaiju.muzzle` (`entities.js:1441`) so the C# side matches the one MuzzleSocket.

**11b — `tools/fx-verify/check.py`** (numpy + PIL; scipy NOT installed → Gaussian blur via numpy separable `np.convolve` reflect-pad). FX-region SSIM between Unity capture and web ref, crop both to the union FX bbox `y[150..300], x[64..200]`. `FLOOR=0.55` (URP linear vs web sRGB → absolute pixels differ; gate the gamma-robust SHAPE; pow(2.2) is the G2 toggle not a blocker). Also a blend-stat: neither FX region clips flat white over >2% of region. Exit 0 if `S>=FLOOR`.

**Wiring:** gate(c) is gated on `npm i puppeteer` succeeding; if install fails, SKIP the SSIM with a logged WARN (never red-fail CI on a missing optional toolchain). Gate(b) stays the hard blocker.

**Verify:**
```bash
cd "/Users/MGitk/Projects/Godzilla Game/tools/fx-ref-bake" && npm i --silent && node bake.js && ls ref-glow-*.png && cd "/Users/MGitk/Projects/Godzilla Game" && python3 tools/fx-verify/check.py docs/campaign/shots/unity/fxspike-anim-1.png tools/fx-ref-bake/ref-glow-0.5.png ; echo "ssim-exit=$?"
```
Smoke-run `bake.js` once and eyeball `ref-glow-0.5.png` is non-blank BEFORE trusting `check.py`. On first green, print the 4 idle-phase SSIMs and tighten FLOOR to `(min observed - 0.05)`.

---

## Step 12 — full-stack regression + tag

```bash
cd "/Users/MGitk/Projects/Godzilla Game" && \
"$UNITY" -batchmode -projectPath GodzillaSmash -executeMethod Godzilla.Editor.FxRenderHarness.BlendCorrectness -logFile - ; echo "gate-a=$?" ; \
"$UNITY" -batchmode -projectPath GodzillaSmash -executeMethod Godzilla.Editor.FxRenderHarness.AnimateAndCoverage -logFile - ; echo "gate-b=$?" ; \
"$UNITY" -batchmode -projectPath GodzillaSmash -runTests -testPlatform EditMode -testResults /tmp/fx.xml -logFile - ; echo "core=$?"
```
All exits 0 + Core EditMode green → commit (`feat(unity-P0-FXSPIKE): FxDirector + 5 effects + beam + kill-flash + FxAssetBaker + gates b/c`) and tag. Each commit message ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Phase-1 carries (NOT this build — documented so they don't drift)

- `pxPerUnit`/K = the Phase-1 body SpriteRenderer PPU (FXSPIKE placeholder 100; relative math is PPU-invariant).
- Re-parent FX root + the 10 plate local positions + MuzzleSocket to the real wyrm rig bones; wire `EyeGlowFX.FacingBase`/`BreathChargeFX.owner` to the rig adapter; supply real `facingGeom(0)` headX/snout for the supernova wyrm muzzle.
- Confirm `DesignHeightPx=720` / `OrthoSize=5` against the chosen sprite import PPU; read `Camera.orthographicSize` live and assert it equals `FxPixelSpace.OrthoSize`.
- `BreathChargeFX.AttackFrame` seam: confirm the C# attack-FSM port owns `attackFrame` (`entities.js:1068`) and exposes it + `FacingShow` to the view layer.