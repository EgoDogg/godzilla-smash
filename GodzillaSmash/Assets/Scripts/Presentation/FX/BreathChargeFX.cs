// Godzilla.Presentation/FX/BreathChargeFX.cs — muzzle-flash 2-stop radial (spec Step 6; entities.js:1616-1626).
//
// Quad on FXBreath.mat (the baked 2-stop breath_grad.png: core breath[1] -> mid breathGlow -> transparent), child of
// MuzzleSocket at localPos 0, INACTIVE until gated. Web center = mouth (headX*BW + BW*(0.5+snout), -BH*0.77);
// radius BW*0.4 = 24.864px -> diameter 1.2432u @ PXU=100. Gate: Fsm==Attack && AttackFrame<=2 && Facing!=Back
// (back34 still shows). chg = 1 - AttackFrame/3 -> frame0=0.9, frame1=0.6, frame2=0.3, >=3 hidden; alpha = chg*0.9.
//
// The quad vertex color is WHITE so the baked 2-stop texture supplies BOTH the gradient color AND the falloff
// (strictly more faithful than a single breathGlow tint over the colored texture). Alpha is scaled by re-uploading
// vertex colors (NOT _Color.a / NOT an MPB -> both fork the material and break the SRP Batcher).

using UnityEngine;

namespace Godzilla.Presentation.FX
{
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public class BreathChargeFX : MonoBehaviour
    {
        const float BH = 124.32f, BW = 62.16f, PXU = 100f;

        [SerializeField] Material breathMaterial; // FXBreath.mat (baker assigns)

        FxDirector _dir;
        MeshRenderer _mr;
        Mesh _mesh;
        Color[] _scaled;

        void Awake()
        {
            _dir = GetComponentInParent<FxDirector>();
            _mesh = FxMesh.Quad(new Color32(255, 255, 255, 255));
            GetComponent<MeshFilter>().sharedMesh = _mesh;
            _scaled = new Color[_mesh.vertexCount];
            float diaU = (BW * 0.4f * 2f) / PXU; // 0.49728u (BW*0.4=24.864px radius -> 49.728px diameter; the spec's 1.2432u is an arithmetic slip)
            transform.localScale = new Vector3(diaU, diaU, 1f);
            _mr = GetComponent<MeshRenderer>();
            if (breathMaterial != null) _mr.sharedMaterial = breathMaterial;
            _mr.sortingLayerName = "FX";
            _mr.sortingOrder = 60;
            _mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _mr.receiveShadows = false;
            _mr.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.Off;
            _mr.reflectionProbeUsage = UnityEngine.Rendering.ReflectionProbeUsage.Off;
            _mr.enabled = false;
        }

        void LateUpdate()
        {
            bool show = _dir != null
                && _dir.Fsm == FxFsm.Attack
                && _dir.AttackFrame <= 2
                && _dir.Facing != FacingShow.Back;
            if (_mr.enabled != show) _mr.enabled = show;
            if (!show) return;
            float a = (1f - _dir.AttackFrame / 3f) * 0.9f;
            for (int i = 0; i < _scaled.Length; i++) _scaled[i] = new Color(1f, 1f, 1f, a);
            _mesh.colors = _scaled; // re-upload vertex colors (keeps SRP Batcher; never _Color.a / MPB)
        }
    }
}
