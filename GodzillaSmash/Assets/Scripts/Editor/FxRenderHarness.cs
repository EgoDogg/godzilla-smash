// Godzilla.Editor/FxRenderHarness.cs — Editor-GUI-independent objective verification for P0-FXSPIKE.
// Run headless: Unity -batchmode -projectPath GodzillaSmash -executeMethod Godzilla.Editor.FxRenderHarness.BlendCorrectness -logFile -
// (NOTE: NO -nographics — we need a real graphics context to render. -quit is implied by EditorApplication.Exit.)
//
// Step-0 + Gate (a): validates (1) the headless capture path actually renders non-blank, and (2) the load-bearing
// blend idiom. Over a PALE opaque background a bright FX with "One One" (control) clips to pure white; the same FX
// with "OneMinusDstColor One" (production) mathematically CANNOT reach pure white (it self-limits). That qualitative
// distinction is gamma-robust (holds in linear or sRGB blend space), so it is the honest §9.5 Gate-2 discriminator.

using System;
using System.IO;
using UnityEditor;
using UnityEngine;

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
    }
}
