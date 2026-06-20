// Godzilla.Editor/FxAssetBaker.cs — batchmode baker: textures + materials + the SupernovaFxRig prefab + FxSpike.unity
// (spec Step 2). Idempotent; mirrors BuildScript's hard-exit discipline. Run:
//   Unity -batchmode -projectPath GodzillaSmash -executeMethod Godzilla.Editor.FxAssetBaker.BakeAll -logFile -
//
// GAMMA NOTE (corrections #6/#8/#14): all three FX textures import sRGB=false (raw) so the texture and the raw-sRGB
// vertex-color tints multiply in the SAME space -> whole-FX coherence + the gamma-robust gate. URP blends LINEAR; the
// absolute pow(2.2) gamma-match is the G2 toggle, not this unit. NEVER AssetDatabase.Refresh mid prefab/scene build
// (6000.x can domain-reload mid-method and abort the -executeMethod static call) — Refresh once at the very end.

using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using Godzilla.Presentation.FX;

namespace Godzilla.Editor
{
    public static class FxAssetBaker
    {
        const string FXDir = "Assets/Presentation/FX";
        const string MatPath = FXDir + "/FXSoftAdditive.mat";
        const string BreathMatPath = FXDir + "/FXBreath.mat";
        const string BeamMatPath = FXDir + "/FXBeamRamp.mat";
        const string SoftRadialPath = FXDir + "/soft_radial.png";
        const string BreathPath = FXDir + "/breath_grad.png";
        const string BeamRampPath = FXDir + "/beam_ramp.png";
        const string PrefabPath = FXDir + "/SupernovaFxRig.prefab";
        const string ScenePath = "Assets/Scenes/FxSpike.unity";

        const float PXU = 100f, BH = 124.32f, BW = 62.16f;

        // supernova palette (config.js:161), as raw sRGB bytes
        static readonly Color32 BREATH0 = new Color32(255, 255, 255, 255); // breath[0] white
        static readonly Color32 BREATH1 = new Color32(176, 125, 255, 255); // breath[1] #b07dff
        static readonly Color32 BREATHGLOW = new Color32(200, 120, 255, 255);

        [MenuItem("Godzilla/FX/Bake Spike Assets")]
        public static void BakeAll()
        {
            try
            {
                AddFxSortingLayer.EnsureFx();
                EnsureFolders();
                BakeSoftRadial();
                BakeBreathGrad();
                BakeBeamRamp();
                var soft = MakeMat(MatPath, SoftRadialPath);
                var breath = MakeMat(BreathMatPath, BreathPath);
                var beam = MakeMat(BeamMatPath, BeamRampPath);
                BuildPrefab(soft, breath, beam);
                BuildScene();
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
                Debug.Log("[FxAssetBaker] OK");
                Exit(0);
            }
            catch (Exception e)
            {
                Debug.LogError("[FxAssetBaker] EXCEPTION: " + e);
                Exit(2);
            }
        }

        // ---- folders ----
        static void EnsureFolders()
        {
            if (!AssetDatabase.IsValidFolder("Assets/Presentation")) AssetDatabase.CreateFolder("Assets", "Presentation");
            if (!AssetDatabase.IsValidFolder(FXDir)) AssetDatabase.CreateFolder("Assets/Presentation", "FX");
            if (!AssetDatabase.IsValidFolder("Assets/Scenes")) AssetDatabase.CreateFolder("Assets", "Scenes");
        }

        // ---- textures (Step 2c/2d/2e) ----
        static void BakeSoftRadial()
        {
            const int S = 256;
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, false, true); // linear data
            var px = new Color32[S * S]; float c = (S - 1) * 0.5f;
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float dx = (x - c) / c, dy = (y - c) / c; float d = Mathf.Sqrt(dx * dx + dy * dy);
                    float a = Mathf.Clamp01(1f - d); a *= a; // r^2 falloff
                    px[y * S + x] = new Color32(255, 255, 255, (byte)(a * 255f));
                }
            tex.SetPixels32(px); tex.Apply();
            WritePng(SoftRadialPath, tex);
            UnityEngine.Object.DestroyImmediate(tex);
            ImportTex(SoftRadialPath);
        }

        static void BakeBreathGrad()
        {
            const int S = 64;
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, false, true);
            var px = new Color32[S * S]; float c = (S - 1) * 0.5f;
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float dx = (x - c) / c, dy = (y - c) / c; float d = Mathf.Clamp01(Mathf.Sqrt(dx * dx + dy * dy));
                    // 2-stop: center breath[1] -> edge breathGlow (faithful-in-spirit of the web 3-stop), alpha (1-d)*0.98
                    byte r = (byte)Mathf.Lerp(BREATH1.r, BREATHGLOW.r, d);
                    byte g = (byte)Mathf.Lerp(BREATH1.g, BREATHGLOW.g, d);
                    byte b = (byte)Mathf.Lerp(BREATH1.b, BREATHGLOW.b, d);
                    byte a = (byte)((1f - d) * 0.98f * 255f);
                    px[y * S + x] = new Color32(r, g, b, a);
                }
            tex.SetPixels32(px); tex.Apply();
            WritePng(BreathPath, tex);
            UnityEngine.Object.DestroyImmediate(tex);
            ImportTex(BreathPath);
        }

        static void BakeBeamRamp()
        {
            const int W = 256, H = 4;
            const float coreHalf = 0.20f, edgeHalf = 0.45f; // 1.8*0.5/4.5, 4.05*0.5/4.5
            var tex = new Texture2D(W, H, TextureFormat.RGBA32, false, true);
            var px = new Color32[W * H];
            for (int x = 0; x < W; x++)
            {
                float d = Mathf.Abs(x / (float)(W - 1) * 2f - 1f); // 0 center (core) .. 1 edges (rim)
                Color32 col; float aBase;
                if (d <= coreHalf) { col = BREATH1; aBase = 1.00f; }
                else if (d <= edgeHalf) { col = BREATH0; aBase = 0.92f; }
                else { col = BREATHGLOW; aBase = (1f - (d - edgeHalf) / (1f - edgeHalf)) * 0.98f; }
                float a = aBase * (1f - Smoothstep(0.92f, 1.0f, d));
                var c32 = new Color32(col.r, col.g, col.b, (byte)(Mathf.Clamp01(a) * 255f));
                for (int y = 0; y < H; y++) px[y * W + x] = c32;
            }
            tex.SetPixels32(px); tex.Apply();
            WritePng(BeamRampPath, tex);
            UnityEngine.Object.DestroyImmediate(tex);
            ImportTex(BeamRampPath);
        }

        static float Smoothstep(float a, float b, float x)
        {
            float t = Mathf.Clamp01((x - a) / (b - a));
            return t * t * (3f - 2f * t);
        }

        static void WritePng(string assetPath, Texture2D tex)
        {
            string full = Path.GetFullPath(Path.Combine(Application.dataPath, "../" + assetPath));
            File.WriteAllBytes(full, tex.EncodeToPNG());
        }

        // sRGB=false on ALL FX textures (raw, coherent with the raw-sRGB vertex tints; G2 owns absolute gamma).
        static void ImportTex(string path)
        {
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            var imp = (TextureImporter)AssetImporter.GetAtPath(path); // importer exists only after import
            imp.textureType = TextureImporterType.Default;
            imp.sRGBTexture = false;
            imp.alphaIsTransparency = true;
            imp.alphaSource = TextureImporterAlphaSource.FromInput;
            imp.wrapMode = TextureWrapMode.Clamp;
            imp.filterMode = FilterMode.Bilinear;
            imp.mipmapEnabled = false;
            imp.npotScale = TextureImporterNPOTScale.None;
            imp.textureCompression = TextureImporterCompression.Uncompressed;
            imp.SaveAndReimport();
        }

        // ---- materials (Step 2f) ----
        static Material MakeMat(string matPath, string texPath)
        {
            var sh = Shader.Find("Godzilla/FXSoftAdditive"); // shader NAME, not the filename
            if (sh == null) Fail("shader Godzilla/FXSoftAdditive not found");
            if (AssetDatabase.LoadAssetAtPath<Material>(matPath) != null) AssetDatabase.DeleteAsset(matPath);
            var mat = new Material(sh);
            mat.SetColor("_Color", Color.white); // per-form tint rides vertex color, not _Color (keeps SRP Batcher)
            mat.SetTexture("_MainTex", AssetDatabase.LoadAssetAtPath<Texture2D>(texPath));
            AssetDatabase.CreateAsset(mat, matPath);
            return mat;
        }

        // ---- prefab (Step 2g) ----
        static void BuildPrefab(Material soft, Material breath, Material beam)
        {
            var root = new GameObject("SupernovaFxRig");
            root.AddComponent<FxDirector>();

            var aura = Child(root, "Aura", new Vector3(0f, BH * 0.5f / PXU, 0f));   // web center (0,-BH*0.5)
            SetField(aura.AddComponent<AuraHalo>(), "fxMaterial", soft);

            var plates = Child(root, "Plates", Vector3.zero);                        // verts are absolute in local space
            SetField(plates.AddComponent<PlateGlow>(), "fxMaterial", soft);

            float eyeCx = (0.30f * BW + BW * 0.47f) / PXU, eyeCy = BH * 0.842f / PXU; // base-2 rest (Place overrides at play)
            var eye = Child(root, "Eye", new Vector3(eyeCx, eyeCy, 0f));
            SetField(eye.AddComponent<EyeGlowFX>(), "fxMaterial", soft);

            var motes = Child(root, "CosmicMotes", Vector3.zero);
            SetField(motes.AddComponent<CosmicMotes>(), "fxMaterial", soft);

            // MuzzleSocket — shared by breath-charge AND the beam (must be EQUAL by construction). base-2: snout .46 headX .30
            float muzX = (0.30f * BW + BW * (0.5f + 0.46f)) / PXU, muzY = BH * 0.77f / PXU; // web (...,-BH*0.77)
            var muzzle = Child(root, "MuzzleSocket", new Vector3(muzX, muzY, 0f));
            var breathGo = Child(muzzle, "BreathCharge", Vector3.zero);
            SetField(breathGo.AddComponent<BreathChargeFX>(), "breathMaterial", breath);

            var pool = root.AddComponent<BeamPool>();
            SetField(pool, "rampMaterial", beam);
            SetField(pool, "softMaterial", soft);

            var killGo = Child(root, "KillFlash", Vector3.zero);
            SetField(killGo.AddComponent<KillFlashRenderer>(), "fxMaterial", soft);

            bool ok;
            PrefabUtility.SaveAsPrefabAsset(root, PrefabPath, out ok);
            if (!ok) Fail("SaveAsPrefabAsset failed for " + PrefabPath);
            UnityEngine.Object.DestroyImmediate(root);
        }

        static GameObject Child(GameObject parent, string name, Vector3 localPos)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent.transform, false);
            go.transform.localPosition = localPos;
            return go;
        }

        static void SetField(Component c, string field, UnityEngine.Object val)
        {
            var so = new SerializedObject(c);
            var p = so.FindProperty(field);
            if (p == null) Fail($"field '{field}' not found on {c.GetType().Name}");
            p.objectReferenceValue = val;
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        // ---- scene (Step 2h) ----
        static void BuildScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var camGO = new GameObject("Main Camera"); camGO.tag = "MainCamera";
            var cam = camGO.AddComponent<Camera>();
            cam.orthographic = true; cam.orthographicSize = FxPixelSpace.OrthoSize;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.78f, 0.78f, 0.82f, 1f);
            cam.allowHDR = false; // correction #8
            cam.transform.position = new Vector3(0, 0, -10);
            camGO.AddComponent<UniversalAdditionalCameraData>();

            var lightGO = new GameObject("Global Light2D");
            var l2d = lightGO.AddComponent<Light2D>();
            l2d.lightType = Light2D.LightType.Global; l2d.intensity = 1f; // unlit content ignores this; defensive for the Phase-1 body

            // backdrop patches (pale / mid / dark) so the screen-blend self-limit is visible over varied bg (Mike's G2 eye)
            var unlit = Shader.Find("Universal Render Pipeline/Unlit");
            Backdrop(unlit, new Color(0.78f, 0.78f, 0.82f), new Vector3(-2.5f, 0, 2f), 3.5f);
            Backdrop(unlit, new Color(0.30f, 0.30f, 0.34f), new Vector3(0f, 0, 2.5f), 3.5f);
            Backdrop(unlit, new Color(0.06f, 0.06f, 0.10f), new Vector3(2.5f, 0, 3f), 3.5f);

            var rig = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath));
            rig.transform.position = Vector3.zero;

            if (!EditorSceneManager.SaveScene(scene, ScenePath)) Fail("SaveScene failed: " + ScenePath);

            var scenes = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            if (scenes.TrueForAll(s => s.path != ScenePath))
                scenes.Add(new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();
        }

        static void Backdrop(Shader unlit, Color col, Vector3 pos, float scale)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            go.name = "Backdrop";
            var coll = go.GetComponent<Collider>(); if (coll != null) UnityEngine.Object.DestroyImmediate(coll);
            go.transform.position = pos; go.transform.localScale = new Vector3(scale, scale * 1.4f, 1f);
            var mr = go.GetComponent<MeshRenderer>();
            if (unlit != null)
            {
                var m = new Material(unlit);
                if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", col); else m.color = col;
                mr.sharedMaterial = m; // embedded in the scene (cosmetic, not an asset)
            }
        }

        // ---- exit discipline (mirrors BuildScript) ----
        static void Fail(string msg) { Debug.LogError("[FxAssetBaker] " + msg); Exit(1); throw new Exception(msg); }
        static void Exit(int code) { if (Application.isBatchMode) EditorApplication.Exit(code); }
    }
}
