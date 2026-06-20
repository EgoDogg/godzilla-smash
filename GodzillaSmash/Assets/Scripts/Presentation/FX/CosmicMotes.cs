// Godzilla.Presentation/FX/CosmicMotes.cs — 8 orbiting motes + head halo (spec Step 7; MOTE_FX.cosmic entities.js:778-792).
//
// Correction #4: copy MOTE_FX.cosmic (aa=c*1.7+phase, radii BW*0.42 / BH*0.52 / BH*0.26), NOT MOTE_FX.pink.
// PPU = 56 (PX_PER_TILE = TILE_W, config.js). NO Shuriken, NO RNG (pure periodic trig — Mulberry32 is beam-only).
//
// SOURCE-FAITHFULNESS FIX (the spec Step-7 constant un-flipped Y, contradicting its own COORD RULE): web cyp =
// -BH*0.52 + sin(aa*1.3)*BH*0.26 sits ABOVE center (canvas +y is DOWN). Applying localY = -webY/PPU gives
// localY = +BH*0.52/56 - sin(aa*1.3)*BH*0.26/56 (center POSITIVE = up). Halo center (0,-BH*0.5) -> localY +BH*0.5/56.
//
// Mote color HARDCODED rgba(210,150,255,0.95) * globalAlpha 0.85 -> Color32(210,150,255, 206) set once.
// Halo: white shared radial, alpha = 0.9 (web stop0) * (0.25 + pulse*0.4); pulse = (sin(phase*1.6)+1)*0.5.

using UnityEngine;

namespace Godzilla.Presentation.FX
{
    public class CosmicMotes : MonoBehaviour
    {
        const float BH = 124.32f, BW = 62.16f, PPU = 56f;
        const float ORBIT_R = BW * 0.42f / PPU;
        const float MOTE_Y0 = BH * 0.52f / PPU;    // +up (Y-flipped from web -BH*0.52)
        const float MOTE_YAMP = BH * 0.26f / PPU;
        const float HALO_Y = BH * 0.5f / PPU;      // +up (Y-flipped from web -BH*0.5)
        static readonly Color32 MOTE_SRGB = new Color32(210, 150, 255, 206); // 0.95*0.85*255 = 206

        [SerializeField] Material fxMaterial;

        FxDirector _dir;
        double _localPhase;
        Transform[] _motes;
        Mesh _haloMesh;
        Color[] _haloCols;

        void Awake()
        {
            _dir = GetComponentInParent<FxDirector>();
            var moteMesh = FxMesh.Disc(MOTE_SRGB, 12); // shared — motes differ only by transform
            _motes = new Transform[8];
            for (int c = 0; c < 8; c++)
            {
                var go = new GameObject("mote" + c);
                go.transform.SetParent(transform, false);
                go.AddComponent<MeshFilter>().sharedMesh = moteMesh;
                Setup(go.AddComponent<MeshRenderer>(), 65);
                _motes[c] = go.transform;
            }
            var halo = new GameObject("halo");
            halo.transform.SetParent(transform, false);
            halo.transform.localPosition = new Vector3(0f, HALO_Y, 0f);
            float haloDia = (BW * 0.7f * 2f) / PPU;
            halo.transform.localScale = new Vector3(haloDia, haloDia, 1f);
            _haloMesh = FxMesh.Disc(new Color32(255, 255, 255, 64), 24); // instance (per-frame alpha)
            _haloCols = new Color[_haloMesh.vertexCount];
            halo.AddComponent<MeshFilter>().sharedMesh = _haloMesh;
            Setup(halo.AddComponent<MeshRenderer>(), 66);
        }

        void Setup(MeshRenderer mr, int order)
        {
            if (fxMaterial != null) mr.sharedMaterial = fxMaterial;
            mr.sortingLayerName = "FX";
            mr.sortingOrder = order;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
            mr.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.Off;
            mr.reflectionProbeUsage = UnityEngine.Rendering.ReflectionProbeUsage.Off;
        }

        float Phase()
        {
            if (_dir != null) return (float)_dir.GlowPhase;
            _localPhase += Time.deltaTime; return (float)_localPhase;
        }

        void LateUpdate()
        {
            float p = Phase();
            for (int c = 0; c < 8; c++)
            {
                float aa = c * 1.7f + p;
                float lx = Mathf.Cos(aa) * ORBIT_R;
                float ly = MOTE_Y0 - Mathf.Sin(aa * 1.3f) * MOTE_YAMP; // Y-flipped oscillation
                _motes[c].localPosition = new Vector3(lx, ly, 0f);
                float crPx = (Mathf.Sin(p * 3f + c) + 1f) * 0.5f * 3f + 1f; // 1..4px
                float d = (crPx * 2f) / PPU;
                _motes[c].localScale = new Vector3(d, d, 1f);
            }
            float pulse = (Mathf.Sin(p * 1.6f) + 1f) * 0.5f;
            float haloA = 0.9f * (0.25f + pulse * 0.4f); // web stop0 alpha 0.9 * globalAlpha
            byte ha = (byte)(Mathf.Clamp01(haloA) * 255f);
            for (int i = 0; i < _haloCols.Length; i++) _haloCols[i] = new Color(1f, 1f, 1f, ha / 255f);
            _haloMesh.colors = _haloCols;
        }
    }
}
