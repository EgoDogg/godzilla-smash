// Godzilla.Presentation/FX/AuraHalo.cs — supernova aura halo (spec Step 3; entities.js:330,1582-1601).
//
// ONE static MeshRenderer disc (circular FAN, correction #7 — drops the ~21-40% dead-corner texels a quad would
// shade under ZTest-Always additive), tint baked on VERTEX COLOR (not MPB -> SRP Batcher stays on), scalar radius
// pulse each frame. Reads the ONE shared clock (FxDirector.GlowPhase) so it is phase-locked with the other effects.
//
// Web: gradient center (0,-BH*0.5); r = BH*(0.62 + pulse*0.05), pulse=(sin(phase*1.6)+1)*0.5 -> 77.08..83.30px;
// pal.aura rgba(157,78,221,0.24) (config.js:161) * ctx.globalAlpha 0.85 (:1598) -> a = round(0.24*0.85*255) = 52.

using UnityEngine;

namespace Godzilla.Presentation.FX
{
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public class AuraHalo : MonoBehaviour
    {
        const float BH = 124.32f, R_BASE = BH * 0.62f, R_PULSE = BH * 0.05f;
        static readonly Color32 AURA_SRGB = new Color32(157, 78, 221, 52); // authored sRGB; URP converts to linear

        [SerializeField] Material fxMaterial;   // shared FXSoftAdditive.mat (baker assigns)
        [SerializeField] float pxPerUnit = 100f; // MUST match the Phase-1 body SpriteRenderer PPU

        FxDirector _dir;
        double _localPhase;
        Transform _t;

        void Awake()
        {
            _t = transform;
            _dir = GetComponentInParent<FxDirector>();
            var mf = GetComponent<MeshFilter>();
            mf.sharedMesh = FxMesh.Disc(AURA_SRGB, 28);
            var mr = GetComponent<MeshRenderer>();
            if (fxMaterial != null) mr.sharedMaterial = fxMaterial;
            mr.sortingLayerName = "FX";
            mr.sortingOrder = 10;
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
            float pulse = (Mathf.Sin(Phase() * 1.6f) + 1f) * 0.5f;
            float rPx = R_BASE + R_PULSE * pulse;
            float diaU = (rPx * 2f) / pxPerUnit;     // baked radial reaches a=0 at the disc rim -> scale = DIAMETER
            _t.localScale = new Vector3(diaU, diaU, 1f);
        }
    }
}
