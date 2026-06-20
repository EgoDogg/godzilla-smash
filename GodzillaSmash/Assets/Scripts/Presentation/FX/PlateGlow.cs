// Godzilla.Presentation/FX/PlateGlow.cs — 10 dorsal glints in ONE mesh (spec Step 4; entities.js:591-607 GLOW pass).
//
// Correction #2: bake 10 glints (N=9 -> i=0..9), NEVER config plates:16 (DEAD for FX — opaque-skin path only).
// Correction #3: ONE MeshRenderer with a single 10-triangle (30-vert) mesh, NOT a ParticleSystem (a PS orphans a
// draw call and adds a per-frame GetParticles/SetParticles marshal). Shimmer drives the 30 cached vertex-color
// alphas in LateUpdate (zero-alloc, reused array).
//
// Vertex color = the config.js plateGlow sRGB byte triple (165,90,230) used directly (the uniform "do NOT pow"
// convention shared with the gate(b) harness + the other effects; the URP-linear absolute-gamma match is the G2
// pow(2.2) toggle, not a blocker). The dim-ends/bright-mid gradient is sin(t*PI) folded into the per-plate alpha.

using UnityEngine;

namespace Godzilla.Presentation.FX
{
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public class PlateGlow : MonoBehaviour
    {
        const float BH = 124.32f, BW = 62.16f, PXU = 100f;
        static readonly Color32 PLATE_SRGB = new Color32(165, 90, 230, 255); // config.js:159 (alpha overridden per-frame)

        [SerializeField] Material fxMaterial;

        FxDirector _dir;
        double _localPhase;
        Mesh _mesh;
        Color32[] _cols;        // 30 verts
        readonly float[] _baseT = new float[10];

        void Awake()
        {
            _dir = GetComponentInParent<FxDirector>();
            BuildMesh();
            var mr = GetComponent<MeshRenderer>();
            if (fxMaterial != null) mr.sharedMaterial = fxMaterial;
            mr.sortingLayerName = "FX";
            mr.sortingOrder = 20;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
            mr.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.Off;
            mr.reflectionProbeUsage = UnityEngine.Rendering.ReflectionProbeUsage.Off;
        }

        void BuildMesh()
        {
            var verts = new Vector3[30];
            var uvs = new Vector2[30];
            _cols = new Color32[30];
            var tris = new int[30];
            for (int p = 0; p < 10; p++)
            {
                float t = p / 9f; _baseT[p] = t;
                float cx = Mathf.Lerp(BW * 0.24f, -BW * 0.52f, t);
                float cy = -(Mathf.Lerp(0.80f, 0.36f, t) + Mathf.Sin(t * Mathf.PI) * 0.06f) * BH; // web -y up
                float size = (Mathf.Sin(t * Mathf.PI) * 0.13f + 0.05f) * BH;
                // A base-R, B apex, C base-L (web px)
                Vector2 A = new Vector2(cx + BW * 0.07f, cy + size * 0.30f);
                Vector2 B = new Vector2(cx - BW * 0.01f, cy - size * 1.08f);   // GLOW apex -1.08 (not body -1.0)
                Vector2 C = new Vector2(cx - BW * 0.11f, cy + size * 0.30f);
                int b = p * 3;
                verts[b + 0] = W2L(A); verts[b + 1] = W2L(B); verts[b + 2] = W2L(C);
                uvs[b + 0] = new Vector2(0f, 0f); uvs[b + 1] = new Vector2(0.5f, 1f); uvs[b + 2] = new Vector2(1f, 0f);
                byte a0 = AlphaAt(t, 0.5f); // baked at shimmer=0.5
                _cols[b + 0] = _cols[b + 1] = _cols[b + 2] = new Color32(PLATE_SRGB.r, PLATE_SRGB.g, PLATE_SRGB.b, a0);
                tris[b + 0] = b + 0; tris[b + 1] = b + 1; tris[b + 2] = b + 2;
            }
            _mesh = new Mesh { name = "FxPlates" };
            _mesh.vertices = verts; _mesh.uv = uvs; _mesh.colors32 = _cols; _mesh.triangles = tris;
            _mesh.bounds = new Bounds(Vector3.zero, new Vector3(4f, 4f, 1f)); // never frustum-cull
            GetComponent<MeshFilter>().sharedMesh = _mesh;
        }

        static Vector3 W2L(Vector2 webPx) => new Vector3(webPx.x / PXU, -webPx.y / PXU, 0f); // localX=webX/PXU, localY=-webY/PXU

        static byte AlphaAt(float t, float shimmer)
        {
            // *0.98 = the plateGlow rgba alpha (config.js:159) folded into the canvas globalAlpha (entities.js:600-601),
            // mirroring how the aura folds its 0.85. Effective web alpha = 0.98 * clamp(0.30+0.5*shimmer*sin(t*PI)).
            float a = Mathf.Clamp01(0.30f + 0.5f * shimmer * Mathf.Sin(t * Mathf.PI)) * 0.98f;
            return (byte)(a * 255f);
        }

        float Phase()
        {
            if (_dir != null) return (float)_dir.GlowPhase;
            _localPhase += Time.deltaTime; return (float)_localPhase;
        }

        void LateUpdate()
        {
            float shimmer = (Mathf.Sin(Phase() * 3f) + 1f) * 0.5f;
            for (int p = 0; p < 10; p++)
            {
                byte a = AlphaAt(_baseT[p], shimmer);
                for (int v = 0; v < 3; v++) { var c = _cols[p * 3 + v]; c.a = a; _cols[p * 3 + v] = c; }
            }
            _mesh.colors32 = _cols; // 30 verts, reused array
        }
    }
}
