// Godzilla.Presentation/FX/EyeGlowFX.cs — white head-eye disc (spec Step 5; entities.js:1606-1613).
//
// Web: center (hx + BW*0.47, -BH*0.842), hx = headX*BW; radius BW*0.06 = 3.7296px; color #ffffff;
// alpha = 0.55 + shimmer*0.45 (0.55..1.0); SUPPRESSED when facing show is back/back34 (base 3 or 4).
// Per-base headX: 0:0.00 1:0.16 2:0.30 3:0.18 4:0.00. Reads facing + the shared clock from FxDirector.
// Uses an instance mesh (never the shared asset) so the per-frame white-alpha rewrite stays local.

using UnityEngine;

namespace Godzilla.Presentation.FX
{
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public class EyeGlowFX : MonoBehaviour
    {
        const float BH = 124.32f, BW = 62.16f, PXU = 100f;
        static readonly float[] HEADX = { 0.00f, 0.16f, 0.30f, 0.18f, 0.00f };

        [SerializeField] Material fxMaterial;

        FxDirector _dir;
        double _localPhase;
        MeshRenderer _mr;
        Mesh _mesh;
        Color[] _cols;
        Transform _t;
        int _placedBase = -1;

        void Awake()
        {
            _t = transform;
            _dir = GetComponentInParent<FxDirector>();
            _mesh = FxMesh.Disc(new Color32(255, 255, 255, 255), 20);
            GetComponent<MeshFilter>().sharedMesh = _mesh;
            _cols = new Color[_mesh.vertexCount];
            _mr = GetComponent<MeshRenderer>();
            if (fxMaterial != null) _mr.sharedMaterial = fxMaterial;
            _mr.sortingLayerName = "FX";
            _mr.sortingOrder = 50;
            _mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _mr.receiveShadows = false;
            _mr.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.Off;
            _mr.reflectionProbeUsage = UnityEngine.Rendering.ReflectionProbeUsage.Off;
        }

        int Base() => _dir != null ? _dir.FacingBaseIndex : 2;

        void Place(int b)
        {
            float hx = HEADX[Mathf.Clamp(b, 0, 4)] * BW;
            float cxPx = hx + BW * 0.47f, cyPx = -BH * 0.842f;
            _t.localPosition = new Vector3(cxPx / PXU, -cyPx / PXU, 0f); // negate web Y or the eye lands at the feet
            float diaU = (BW * 0.06f * 2f) / PXU;
            _t.localScale = new Vector3(diaU, diaU, 1f);
            _placedBase = b;
        }

        float Phase()
        {
            if (_dir != null) return (float)_dir.GlowPhase;
            _localPhase += Time.deltaTime; return (float)_localPhase;
        }

        void LateUpdate()
        {
            int b = Base();
            bool shown = (b != 3 && b != 4);
            if (_mr.enabled != shown) _mr.enabled = shown;
            if (!shown) return;
            if (b != _placedBase) Place(b);
            float shimmer = (Mathf.Sin(Phase() * 3f) + 1f) * 0.5f;
            float a = 0.55f + shimmer * 0.45f;
            for (int i = 0; i < _cols.Length; i++) _cols[i] = new Color(1f, 1f, 1f, a);
            _mesh.colors = _cols;
        }
    }
}
