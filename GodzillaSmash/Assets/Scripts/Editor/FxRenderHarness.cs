// Godzilla.Editor/FxRenderHarness.cs — Editor-GUI-independent objective verification for P0-FXSPIKE.
// Run headless: Unity -batchmode -projectPath GodzillaSmash -executeMethod Godzilla.Editor.FxRenderHarness.BlendCorrectness -logFile -
// (NOTE: NO -nographics — we need a real graphics context to render. -quit is implied by EditorApplication.Exit.)
//
// Step-0 + Gate (a): validates (1) the headless capture path actually renders non-blank, and (2) the load-bearing
// blend idiom. Over a PALE opaque background a bright FX with "One One" (control) clips to pure white; the same FX
// with "OneMinusDstColor One" (production) mathematically CANNOT reach pure white (it self-limits). That qualitative
// distinction is gamma-robust (holds in linear or sRGB blend space), so it is the honest §9.5 Gate-2 discriminator.

using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using Godzilla.Presentation.FX;

namespace Godzilla.Editor
{
    public static class FxRenderHarness
    {
        const int W = 512, H = 256;

        static string ShotsDir()
        {
            var dir = Path.GetFullPath(Path.Combine(Application.dataPath, "../../docs/campaign/shots/unity"));
            Directory.CreateDirectory(dir);
            return dir;
        }

        static Color32 AvgBlock(Texture2D tex, int cx, int cy, int half)
        {
            long r = 0, g = 0, b = 0; int n = 0;
            for (int y = cy - half; y <= cy + half; y++)
                for (int x = cx - half; x <= cx + half; x++)
                {
                    if (x < 0 || y < 0 || x >= tex.width || y >= tex.height) continue;
                    var p = tex.GetPixel(x, y); r += (int)(p.r * 255); g += (int)(p.g * 255); b += (int)(p.b * 255); n++;
                }
            n = Mathf.Max(1, n);
            return new Color32((byte)(r / n), (byte)(g / n), (byte)(b / n), 255);
        }

        static Mesh QuadMesh()
        {
            var m = new Mesh();
            m.vertices = new[] { new Vector3(-.5f, -.5f, 0), new Vector3(.5f, -.5f, 0), new Vector3(-.5f, .5f, 0), new Vector3(.5f, .5f, 0) };
            m.uv = new[] { Vector2.zero, Vector2.right, Vector2.up, Vector2.one };
            m.colors = new[] { Color.white, Color.white, Color.white, Color.white }; // tint rides _Color here; vertex color = white
            m.triangles = new[] { 0, 1, 2, 2, 1, 3 };
            m.RecalculateBounds();
            return m;
        }

        static GameObject Quad(Mesh mesh, Material mat, Vector3 pos, float scale)
        {
            var go = new GameObject("fxQuad");
            go.transform.position = pos;
            go.transform.localScale = new Vector3(scale, scale, 1);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            return go;
        }

        public static void BlendCorrectness()
        {
            int exit = 0;
            var trash = new System.Collections.Generic.List<UnityEngine.Object>();
            RenderTexture rt = null;
            try
            {
                var prodSh = Shader.Find("Godzilla/FXSoftAdditive");
                var ctrlSh = Shader.Find("Godzilla/FXAdditiveControl");
                if (prodSh == null || ctrlSh == null)
                    throw new Exception($"shader not found (prod={prodSh}, ctrl={ctrlSh})");

                var fxColor = new Color(0.80f, 0.60f, 0.90f, 1f); // bright FX
                var prod = new Material(prodSh) { hideFlags = HideFlags.HideAndDontSave }; prod.SetColor("_Color", fxColor);
                var ctrl = new Material(ctrlSh) { hideFlags = HideFlags.HideAndDontSave }; ctrl.SetColor("_Color", fxColor);
                trash.Add(prod); trash.Add(ctrl);

                var camGO = new GameObject("FxHarnessCam");
                trash.Add(camGO);
                var cam = camGO.AddComponent<Camera>();
                cam.orthographic = true;
                cam.orthographicSize = 1f;
                cam.aspect = (float)W / H;
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0.80f, 0.80f, 0.80f, 1f); // OPAQUE pale (alpha 1 — avoids premult-alpha halos)
                cam.allowHDR = false; // capture in LDR ARGB32 so ReadPixels is unambiguous (HDR/FP16 readback is the G3-era concern)
                cam.transform.position = new Vector3(0, 0, -10);

                var mesh = QuadMesh();
                trash.Add(mesh);
                trash.Add(Quad(mesh, prod, new Vector3(-0.7f, 0, 0), 0.9f)); // left  = production (self-limiting)
                trash.Add(Quad(mesh, ctrl, new Vector3(0.7f, 0, 0), 0.9f));  // right = control (One One, blows out)

                rt = new RenderTexture(W, H, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
                cam.targetTexture = rt;
                cam.Render();

                var prev = RenderTexture.active;
                RenderTexture.active = rt;
                var tex = new Texture2D(W, H, TextureFormat.RGBA32, false);
                trash.Add(tex);
                tex.ReadPixels(new Rect(0, 0, W, H), 0, 0);
                tex.Apply();
                RenderTexture.active = prev;

                File.WriteAllBytes(Path.Combine(ShotsDir(), "fxspike-blend-gate.png"), tex.EncodeToPNG());

                // Sample at the quads' computed screen centers (ortho size 1, aspect 2 => world x[-2,2] -> px*128 + 256).
                // Quads are at world x=-0.7 (production) and +0.7 (control); average a 9x9 block to dodge AA edges.
                Color32 bg = AvgBlock(tex, W / 2, H - 10, 5);                 // background strip (above the quads)
                Color32 P = AvgBlock(tex, (int)((-0.7f + 2f) / 4f * W), H / 2, 9); // production quad center (~166)
                Color32 C = AvgBlock(tex, (int)((0.7f + 2f) / 4f * W), H / 2, 9);  // control quad center (~346)

                int clipped(Color32 c) => (c.r >= 255 ? 1 : 0) + (c.g >= 255 ? 1 : 0) + (c.b >= 255 ? 1 : 0);
                int minCh(Color32 c) => Mathf.Min(c.r, Mathf.Min(c.g, c.b));
                int brighten(Color32 a, Color32 b) => (a.r > b.r ? 1 : 0) + (a.g > b.g ? 1 : 0) + (a.b > b.b ? 1 : 0);

                // Gamma-space-robust discriminator: URP blends in LINEAR, so One One is less catastrophic than the web's
                // sRGB screen — but the IDIOM distinction still holds: OneMinusDstColor One clips FEWER channels and stays
                // further from pure white than One One, while both brighten the pale bg.
                bool bgIsPale = bg.r > 150 && bg.r < 240;
                bool prodBrightens = brighten(P, bg) >= 2;       // FX still adds light
                bool prodSelfLimits = clipped(P) < clipped(C);   // production clips fewer channels than the control
                bool ctrlOvershoots = clipped(C) >= 1;           // control blows >=1 channel toward white
                bool ctrlWhiter = minCh(C) > minCh(P);           // control is closer to pure white

                Debug.Log($"[FxGate] bg={bg.r},{bg.g},{bg.b}  production={P.r},{P.g},{P.b} (clip {clipped(P)})  control={C.r},{C.g},{C.b} (clip {clipped(C)})");
                Debug.Log($"[FxGate] bgIsPale={bgIsPale} prodBrightens={prodBrightens} prodSelfLimits={prodSelfLimits} ctrlOvershoots={ctrlOvershoots} ctrlWhiter={ctrlWhiter}");

                bool pass = bgIsPale && prodBrightens && prodSelfLimits && ctrlOvershoots && ctrlWhiter;
                if (pass) Debug.Log("[FxGate] PASS — OneMinusDstColor One self-limits over pale; One One overshoots toward white. Capture path renders non-blank.");
                else { Debug.LogError("[FxGate] FAIL — blend-correctness discriminator not satisfied (see values above)."); exit = 1; }
            }
            catch (Exception e)
            {
                Debug.LogError("[FxGate] EXCEPTION: " + e);
                exit = 2;
            }
            finally
            {
                if (rt != null) { RenderTexture.active = null; rt.Release(); UnityEngine.Object.DestroyImmediate(rt); }
                foreach (var o in trash) if (o) UnityEngine.Object.DestroyImmediate(o);
                if (Application.isBatchMode) EditorApplication.Exit(exit);
            }
        }

        // ---- Gate (b): 5-effect coverage + animation + overdraw budget (spec Step 10) ----
        // Renders the 5 supernova FX (aura / plate / eye / cosmic motes+halo / breath-charge) with the EXACT web math
        // (Y-flipped) on a DEDICATED offscreen camera (ortho size = RH/2 so 1unit==1px). Asserts: (1) non-blank,
        // (2) each effect lights its ROI, (3) aura/plate/eye/motes region luma changes across the 4 idle phases while
        // breath is dark idle + lit on the attack frame (proves the fsm gate), (4) peak additive overdraw <= 24 in the
        // torso ROI. NO -nographics. Mirrors BlendCorrectness's sRGB-RT / allowHDR=false / try-finally capture path.
        public static void AnimateAndCoverage()
        {
            int exit = 0;
            var trash = new List<UnityEngine.Object>();
            var live = new List<GameObject>();
            RenderTexture rt = null;
            try
            {
                const int RW = 256, RH = 320;
                const float BHc = 124.32f, BWc = 62.16f;
                var sh = Shader.Find("Godzilla/FXSoftAdditive");
                if (sh == null) throw new Exception("shader Godzilla/FXSoftAdditive not found");

                var radial = BuildRadial(64); trash.Add(radial);
                var mat = new Material(sh) { hideFlags = HideFlags.HideAndDontSave };
                mat.SetColor("_Color", Color.white); mat.SetTexture("_MainTex", radial); trash.Add(mat);

                var camGO = new GameObject("FxAnimCam"); trash.Add(camGO);
                var cam = camGO.AddComponent<Camera>();
                cam.orthographic = true; cam.orthographicSize = RH / 2f; cam.aspect = (float)RW / RH; // 1unit==1px
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0.12f, 0.10f, 0.16f, 1f); // dark scene bg -> additive reads clearly
                cam.allowHDR = false;
                cam.transform.position = new Vector3(0, 0, -10);

                rt = new RenderTexture(RW, RH, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
                cam.targetTexture = rt;

                // web-local centers -> WORLD (wx, -wy_web). Camera maps world (X,Y) -> px (128+X, 160+Y).
                Vector2 auraW = new Vector2(0f, BHc * 0.5f);
                Vector2 eyeW = new Vector2(0.30f * BWc + BWc * 0.47f, BHc * 0.842f);
                Vector2 breathW = new Vector2(0.30f * BWc + BWc * (0.5f + 0.46f), BHc * 0.77f);
                Vector2 motesW = new Vector2(0f, BHc * 0.52f);
                float orbitR = BWc * 0.42f, moteYAmp = BHc * 0.26f;
                const float pt = 0.5f;
                float pcx = Mathf.Lerp(BWc * 0.24f, -BWc * 0.52f, pt);
                float pcy = -(Mathf.Lerp(0.80f, 0.36f, pt) + Mathf.Sin(pt * Mathf.PI) * 0.06f) * BHc;
                Vector2 plateW = new Vector2(pcx, -pcy); // ROI center = the mid (t=0.5) plate of the descending arc

                float[] idlePhases = { 0f, 0.5f, 1f, 1.5f };
                var texes = new Texture2D[5];

                for (int i = 0; i < 5; i++)
                {
                    foreach (var g in live) UnityEngine.Object.DestroyImmediate(g);
                    live.Clear();
                    bool attack = (i == 4);
                    float phase = attack ? 0.6f : idlePhases[i];
                    float shimmer = (Mathf.Sin(phase * 3f) + 1f) * 0.5f;
                    float pulse = (Mathf.Sin(phase * 1.6f) + 1f) * 0.5f;

                    float ar = BHc * (0.62f + pulse * 0.05f);
                    live.Add(Disc(mat, auraW, ar * 2f, new Color32(157, 78, 221, 52)));

                    // ALL 10 dorsal plate glints (verifies correction #2: 10 not 16); alpha folds 0.98 (config.js:159)
                    for (int p = 0; p < 10; p++)
                    {
                        float t = p / 9f;
                        float cx = Mathf.Lerp(BWc * 0.24f, -BWc * 0.52f, t);
                        float cy = -(Mathf.Lerp(0.80f, 0.36f, t) + Mathf.Sin(t * Mathf.PI) * 0.06f) * BHc;
                        float size = (Mathf.Sin(t * Mathf.PI) * 0.13f + 0.05f) * BHc;
                        byte pa = (byte)(Mathf.Clamp01(0.30f + 0.5f * shimmer * Mathf.Sin(t * Mathf.PI)) * 0.98f * 255f);
                        live.Add(Tri(mat, new Vector2(cx, -cy), new Vector2(BWc * 0.18f, size * 1.38f), new Color32(165, 90, 230, pa)));
                    }

                    byte ea = (byte)((0.55f + shimmer * 0.45f) * 255f);
                    live.Add(Disc(mat, eyeW, BWc * 0.06f * 2f, new Color32(255, 255, 255, ea)));

                    for (int c = 0; c < 8; c++)
                    {
                        float aa = c * 1.7f + phase;
                        float mx = Mathf.Cos(aa) * orbitR;
                        float my = motesW.y - Mathf.Sin(aa * 1.3f) * moteYAmp;
                        float cr = (Mathf.Sin(phase * 3f + c) + 1f) * 0.5f * 3f + 1f; // 1..4px
                        live.Add(Disc(mat, new Vector2(mx, my), cr * 2f, new Color32(210, 150, 255, 206)));
                    }
                    byte ha = (byte)(Mathf.Clamp01(0.9f * (0.25f + pulse * 0.4f)) * 255f);
                    live.Add(Disc(mat, motesW, BWc * 0.7f * 2f, new Color32(255, 255, 255, ha)));

                    if (attack)
                        live.Add(Disc(mat, breathW, BWc * 0.4f * 2f, new Color32(176, 125, 255, (byte)(0.9f * 255f))));

                    cam.Render();
                    texes[i] = ReadRT(rt, RW, RH); trash.Add(texes[i]);
                    File.WriteAllBytes(Path.Combine(ShotsDir(), $"fxspike-anim-{i}.png"), texes[i].EncodeToPNG());
                }
                foreach (var g in live) UnityEngine.Object.DestroyImmediate(g);
                live.Clear();

                // ---- asserts ----
                int Px(float wx) => Mathf.RoundToInt(128f + wx);
                int Py(float wy) => Mathf.RoundToInt(160f + wy);
                float Luma(Texture2D t, int cx, int cy, int half) { var b = AvgBlock(t, cx, cy, half); return (b.r + b.g + b.b) / 3f; }

                float bg = Luma(texes[0], 15, 15, 6); // far corner = pure scene bg

                int auraCx = Px(auraW.x), auraCy = Py(auraW.y);
                int plateCx = Px(plateW.x), plateCy = Py(plateW.y);
                int eyeCx = Px(eyeW.x), eyeCy = Py(eyeW.y);
                int breCx = Px(breathW.x), breCy = Py(breathW.y);
                int moteCx = Px(motesW.x), moteCy = Py(motesW.y);

                float[] auraL = new float[4], plateL = new float[4], eyeL = new float[4], moteL = new float[4];
                for (int i = 0; i < 4; i++)
                {
                    auraL[i] = Luma(texes[i], auraCx, auraCy, 60);
                    plateL[i] = Luma(texes[i], plateCx, plateCy, 20);
                    eyeL[i] = Luma(texes[i], eyeCx, eyeCy, 4); // half matched to the ~3.7px eye disc (not bg-diluted)
                    moteL[i] = Luma(texes[i], moteCx, moteCy, 30);
                }
                float breIdle = Luma(texes[0], breCx, breCy, 18);
                float breAtk = Luma(texes[4], breCx, breCy, 18);

                float Range(float[] a) { float lo = a[0], hi = a[0]; foreach (var v in a) { if (v < lo) lo = v; if (v > hi) hi = v; } return hi - lo; }
                float Max(float[] a) { float hi = a[0]; foreach (var v in a) if (v > hi) hi = v; return hi; }

                const float COVER = 4f, ANIM = 2f; // provisional floors (tuned to observed ranges)

                float globalMax = GlobalMaxLuma(texes[0]); // whole-frame, ROI-independent (correction #14: capture non-blank)
                bool nonBlank = globalMax > bg + 20f;
                bool covAura = (Max(auraL) - bg) > COVER;
                bool covPlate = (Max(plateL) - bg) > COVER;
                bool covEye = (Max(eyeL) - bg) > COVER;
                bool covMote = (Max(moteL) - bg) > COVER;
                bool covBreath = (breAtk - bg) > COVER;

                bool animAura = Range(auraL) > ANIM;
                bool animPlate = Range(plateL) > ANIM;
                bool animEye = Range(eyeL) > ANIM;
                bool animMote = Range(moteL) > ANIM;
                bool breathGate = (breAtk - breIdle) > COVER && breIdle < bg + COVER; // dark idle, lit on attack

                int peak = OverdrawPeak(BHc, BWc, auraW, eyeW, breathW, motesW, orbitR, moteYAmp);
                bool overdrawOk = peak <= 24;

                Debug.Log($"[FxGate] bg={bg:F1} globalMax={globalMax:F1} nonBlank={nonBlank}");
                Debug.Log($"[FxGate] aura L=[{auraL[0]:F1},{auraL[1]:F1},{auraL[2]:F1},{auraL[3]:F1}] range={Range(auraL):F1} cover={Max(auraL) - bg:F1}");
                Debug.Log($"[FxGate] plate L=[{plateL[0]:F1},{plateL[1]:F1},{plateL[2]:F1},{plateL[3]:F1}] range={Range(plateL):F1} cover={Max(plateL) - bg:F1}");
                Debug.Log($"[FxGate] eye L=[{eyeL[0]:F1},{eyeL[1]:F1},{eyeL[2]:F1},{eyeL[3]:F1}] range={Range(eyeL):F1} cover={Max(eyeL) - bg:F1}");
                Debug.Log($"[FxGate] mote L=[{moteL[0]:F1},{moteL[1]:F1},{moteL[2]:F1},{moteL[3]:F1}] range={Range(moteL):F1} cover={Max(moteL) - bg:F1}");
                Debug.Log($"[FxGate] breath idle={breIdle:F1} attack={breAtk:F1} (gate={breathGate})");
                Debug.Log($"[FxGate] overdraw peak={peak} (<=24: {overdrawOk})");

                bool pass = nonBlank && covAura && covPlate && covEye && covMote && covBreath
                    && animAura && animPlate && animEye && animMote && breathGate && overdrawOk;
                if (pass) Debug.Log("[FxGate] PASS — 5 effects present + animated (breath fsm-gated) + overdraw within budget.");
                else { Debug.LogError($"[FxGate] FAIL — cover(a{covAura} p{covPlate} e{covEye} m{covMote} b{covBreath}) anim(a{animAura} p{animPlate} e{animEye} m{animMote}) breathGate={breathGate} overdraw={overdrawOk}"); exit = 1; }
            }
            catch (Exception e)
            {
                Debug.LogError("[FxGate] EXCEPTION: " + e);
                exit = 2;
            }
            finally
            {
                foreach (var g in live) if (g) UnityEngine.Object.DestroyImmediate(g);
                if (rt != null) { RenderTexture.active = null; rt.Release(); UnityEngine.Object.DestroyImmediate(rt); }
                foreach (var o in trash) if (o) UnityEngine.Object.DestroyImmediate(o);
                if (Application.isBatchMode) EditorApplication.Exit(exit);
            }
        }

        // ---- Gate (b2): shipped-prefab validity (the system under test, not the harness re-derivation) ----
        // Loads the BAKED SupernovaFxRig.prefab and asserts its component graph + material wiring + FX layer are correct.
        // Edit-mode feasible; full component RENDER verification (Awake builds meshes) is Phase-1 Play-mode (L2/L3).
        public static void PrefabValidity()
        {
            int exit = 0;
            try
            {
                const string PrefabPath = "Assets/Presentation/FX/SupernovaFxRig.prefab";
                var root = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
                if (root == null) throw new Exception("prefab not found: " + PrefabPath + " (run FxAssetBaker.BakeAll first)");

                var fails = new List<string>();
                void Need(bool ok, string msg) { if (!ok) fails.Add(msg); }

                Need(root.GetComponent<FxDirector>() != null, "root missing FxDirector");
                Need(root.GetComponent<BeamPool>() != null, "root missing BeamPool");
                Need(root.GetComponentInChildren<AuraHalo>(true) != null, "missing AuraHalo");
                Need(root.GetComponentInChildren<PlateGlow>(true) != null, "missing PlateGlow");
                Need(root.GetComponentInChildren<EyeGlowFX>(true) != null, "missing EyeGlowFX");
                Need(root.GetComponentInChildren<CosmicMotes>(true) != null, "missing CosmicMotes");
                Need(root.GetComponentInChildren<BreathChargeFX>(true) != null, "missing BreathChargeFX");
                Need(root.GetComponentInChildren<KillFlashRenderer>(true) != null, "missing KillFlashRenderer");

                // MuzzleSocket shared by breath-charge + beam (the muzzle-matches-glow invariant).
                Need(FindChild(root.transform, "MuzzleSocket") != null, "missing MuzzleSocket");
                var breath = root.GetComponentInChildren<BreathChargeFX>(true);
                Need(breath != null && breath.transform.parent != null && breath.transform.parent.name == "MuzzleSocket",
                     "BreathChargeFX is not parented to MuzzleSocket");

                // every FX renderer component's serialized material field must be WIRED to a real asset (baker's job).
                NeedMat(fails, root.GetComponentInChildren<AuraHalo>(true), "fxMaterial");
                NeedMat(fails, root.GetComponentInChildren<PlateGlow>(true), "fxMaterial");
                NeedMat(fails, root.GetComponentInChildren<EyeGlowFX>(true), "fxMaterial");
                NeedMat(fails, root.GetComponentInChildren<CosmicMotes>(true), "fxMaterial");
                NeedMat(fails, root.GetComponentInChildren<BreathChargeFX>(true), "breathMaterial");
                NeedMat(fails, root.GetComponentInChildren<KillFlashRenderer>(true), "fxMaterial");
                NeedMat(fails, root.GetComponent<BeamPool>(), "rampMaterial");
                NeedMat(fails, root.GetComponent<BeamPool>(), "softMaterial");

                bool fxLayer = false;
                foreach (var l in SortingLayer.layers) if (l.name == "FX") fxLayer = true;
                Need(fxLayer, "FX sorting layer missing");

                if (fails.Count == 0) Debug.Log("[FxPrefab] PASS — SupernovaFxRig component graph + material wiring + FX layer all present.");
                else { Debug.LogError("[FxPrefab] FAIL — " + string.Join(" | ", fails)); exit = 1; }
            }
            catch (Exception e)
            {
                Debug.LogError("[FxPrefab] EXCEPTION: " + e);
                exit = 2;
            }
            finally
            {
                if (Application.isBatchMode) EditorApplication.Exit(exit);
            }
        }

        static Transform FindChild(Transform root, string name)
        {
            if (root.name == name) return root;
            foreach (Transform c in root) { var r = FindChild(c, name); if (r != null) return r; }
            return null;
        }

        static void NeedMat(List<string> fails, Component c, string field)
        {
            if (c == null) { fails.Add($"{field}: component missing"); return; }
            var so = new SerializedObject(c);
            var p = so.FindProperty(field);
            if (p == null) { fails.Add($"{c.GetType().Name}.{field}: no such field"); return; }
            if (p.objectReferenceValue == null) fails.Add($"{c.GetType().Name}.{field}: NOT wired (null)");
        }

        static Texture2D BuildRadial(int s)
        {
            var t = new Texture2D(s, s, TextureFormat.RGBA32, false, true);
            var px = new Color32[s * s]; float c = (s - 1) * 0.5f;
            for (int y = 0; y < s; y++)
                for (int x = 0; x < s; x++)
                {
                    float dx = (x - c) / c, dy = (y - c) / c; float d = Mathf.Clamp01(Mathf.Sqrt(dx * dx + dy * dy));
                    float a = 1f - (d * d * (3f - 2f * d)); // 1 - smoothstep(0,1,d)
                    px[y * s + x] = new Color32(255, 255, 255, (byte)(Mathf.Clamp01(a) * 255f));
                }
            t.SetPixels32(px); t.Apply(); return t;
        }

        // Whole-frame max luma — ROI-independent capture-non-blank guard (correction #14): a black render can never
        // pass vacuously, even if every per-effect ROI somehow lit.
        static float GlobalMaxLuma(Texture2D t)
        {
            var px = t.GetPixels32();
            int mx = 0;
            for (int i = 0; i < px.Length; i++) { int l = px[i].r + px[i].g + px[i].b; if (l > mx) mx = l; }
            return mx / 3f;
        }

        static Texture2D ReadRT(RenderTexture rt, int w, int h)
        {
            var prev = RenderTexture.active; RenderTexture.active = rt;
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0); tex.Apply();
            RenderTexture.active = prev; return tex;
        }

        static GameObject Disc(Material m, Vector2 world, float dia, Color32 col)
        {
            var go = new GameObject("d");
            go.transform.position = new Vector3(world.x, world.y, 0);
            go.transform.localScale = new Vector3(dia, dia, 1);
            var mesh = new Mesh();
            mesh.vertices = new[] { new Vector3(-.5f, -.5f, 0), new Vector3(.5f, -.5f, 0), new Vector3(-.5f, .5f, 0), new Vector3(.5f, .5f, 0) };
            mesh.uv = new[] { Vector2.zero, Vector2.right, Vector2.up, Vector2.one };
            mesh.colors32 = new[] { col, col, col, col };
            mesh.triangles = new[] { 0, 1, 2, 2, 1, 3 };
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = m;
            return go;
        }

        static GameObject Tri(Material m, Vector2 world, Vector2 size, Color32 col)
        {
            var go = new GameObject("t");
            go.transform.position = new Vector3(world.x, world.y, 0);
            go.transform.localScale = new Vector3(size.x, size.y, 1);
            var mesh = new Mesh();
            mesh.vertices = new[] { new Vector3(0, 0.5f, 0), new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0) }; // up-pointing
            mesh.uv = new[] { new Vector2(0.5f, 1f), new Vector2(0f, 0f), new Vector2(1f, 0f) };
            mesh.colors32 = new[] { col, col, col };
            mesh.triangles = new[] { 0, 1, 2 };
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = m;
            return go;
        }

        // Honest peak additive-layer count over the torso ROI: circles for discs, a band for the 3 beam strips,
        // +1 everywhere for the full-screen kill-flash. Models the worst-case SIMULTANEOUS stack (correction #7).
        static int OverdrawPeak(float BH, float BW, Vector2 auraW, Vector2 eyeW, Vector2 breathW, Vector2 motesW, float orbitR, float moteYAmp)
        {
            int Px(float wx) => Mathf.RoundToInt(128f + wx);
            int Py(float wy) => Mathf.RoundToInt(160f + wy);

            var circles = new List<Vector3>(); // (cx, cy, radius) — fan/disc footprints
            circles.Add(new Vector3(Px(auraW.x), Py(auraW.y), BH * (0.62f + 0.05f)));        // aura (max radius)
            circles.Add(new Vector3(Px(motesW.x), Py(motesW.y), BW * 0.7f));                  // halo
            circles.Add(new Vector3(Px(eyeW.x), Py(eyeW.y), BW * 0.06f));                     // eye
            circles.Add(new Vector3(Px(breathW.x), Py(breathW.y), BW * 0.4f));               // breath-charge
            for (int c = 0; c < 8; c++)                                                       // 8 motes @ phase 0
            {
                float aa = c * 1.7f;
                float mx = Mathf.Cos(aa) * orbitR;
                float my = motesW.y - Mathf.Sin(aa * 1.3f) * moteYAmp;
                circles.Add(new Vector3(Px(mx), Py(my), 4f));
            }

            // 10 plate glints by their TRUE up-triangle footprint (apex extends size*1.08; a circle under-counts the
            // tall overlap along the dorsal arc — the gate-validity finding).
            var tris = new List<Vector2[]>();
            for (int p = 0; p < 10; p++)
            {
                float t = p / 9f;
                float cx = Mathf.Lerp(BW * 0.24f, -BW * 0.52f, t);
                float cy = -(Mathf.Lerp(0.80f, 0.36f, t) + Mathf.Sin(t * Mathf.PI) * 0.06f) * BH;
                float size = (Mathf.Sin(t * Mathf.PI) * 0.13f + 0.05f) * BH;
                Vector2 A = new Vector2(Px(cx + BW * 0.07f), Py(-(cy + size * 0.30f)));
                Vector2 B = new Vector2(Px(cx - BW * 0.01f), Py(-(cy - size * 1.08f)));
                Vector2 C = new Vector2(Px(cx - BW * 0.11f), Py(-(cy + size * 0.30f)));
                tris.Add(new[] { A, B, C });
            }

            // beam: muzzle (== MuzzleSocket) -> a representative target crossing the torso; 3 strips => +3 along the band,
            // plus the impact-bloom disc at the target (BeamQuad order 91, r=12a+4 -> 16 at a=1).
            Vector2 muzzle = new Vector2(Px(breathW.x), Py(breathW.y));
            Vector2 target = new Vector2(Px(-BW * 1.2f), Py(BH * 0.1f));
            float beamHalf = 4.5f;
            circles.Add(new Vector3(target.x, target.y, 16f));

            int peak = 0;
            for (int py = 160; py <= 260; py++)
                for (int px = 78; px <= 178; px++)
                {
                    int n = 1; // kill-flash (full-screen)
                    foreach (var cc in circles)
                    {
                        float dx = px - cc.x, dy = py - cc.y;
                        if (dx * dx + dy * dy <= cc.z * cc.z) n++;
                    }
                    foreach (var tr in tris)
                        if (PointInTri(px, py, tr[0], tr[1], tr[2])) n++;
                    if (DistToSeg(px, py, muzzle, target) <= beamHalf) n += 3; // 3 overlaid beam strips
                    if (n > peak) peak = n;
                }
            return peak;
        }

        static bool PointInTri(float px, float py, Vector2 a, Vector2 b, Vector2 c)
        {
            float d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
            float d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
            float d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
            bool neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
            bool pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
            return !(neg && pos);
        }

        static float DistToSeg(float px, float py, Vector2 a, Vector2 b)
        {
            float vx = b.x - a.x, vy = b.y - a.y;
            float wx = px - a.x, wy = py - a.y;
            float len2 = vx * vx + vy * vy;
            float t = len2 < 1e-6f ? 0f : Mathf.Clamp01((wx * vx + wy * vy) / len2);
            float cx = a.x + t * vx, cy = a.y + t * vy;
            float dx = px - cx, dy = py - cy;
            return Mathf.Sqrt(dx * dx + dy * dy);
        }
    }
}
