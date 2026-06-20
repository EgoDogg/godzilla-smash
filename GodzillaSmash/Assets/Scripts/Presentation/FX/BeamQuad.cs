// Godzilla.Presentation/FX/BeamQuad.cs — one pooled beam instance: jittered strip + impact bloom (spec Step 8d).
//
// Web (entities.js:150-153, 261-276): t starts at life=0.18 and decrements; alpha a = clamp(t/life,0,1) (1 -> 0).
// glow stroke width 9 / amp 5 is the dominant jagged stroke -> the collapsed single spine uses amp 5, halfWidth 4.5px.
// Impact bloom = a child quad on the SAME shared soft-radial material, tinted by VERTEX COLOR (correction #10 — NO
// separate bloom material/MPB), radius 12*a+4 px (entities.js:274). Strip order 90, bloom 91.
// Mulberry32 is held in a FIELD and never copied (a struct copy forks the stream).

using UnityEngine;
using Godzilla.Core;

namespace Godzilla.Presentation.FX
{
    public class BeamQuad
    {
        public const float LIFE = 0.18f;
        const float WIDTH_PX = 9f;       // glow stroke width vs a building
        const float JITTER_AMP_PX = 5f;  // glow stroke amp

        readonly GameObject _root, _bloomGo;
        readonly BeamMesh _bm;
        readonly MeshRenderer _bloomMr;
        readonly Mesh _bloomMesh;
        readonly Color[] _bloomCols;
        readonly Vector3[] _spine = new Vector3[BeamMesh.SPINE];

        Mulberry32 _rng;     // FIELD — never `var r=_rng` (a struct copy forks the stream)
        float _t = -1f;       // <0 = dead; otherwise counts DOWN from LIFE
        Vector3 _targetW;
        Color _bloomTint = new Color(200f / 255f, 120f / 255f, 1f, 1f); // breathGlow

        public bool Alive => _t >= 0f;

        public BeamQuad(Transform parent, Material rampMat, Material softMat)
        {
            _root = new GameObject("beam");
            _root.transform.SetParent(parent, false);
            _bm = new BeamMesh();
            _root.AddComponent<MeshFilter>().sharedMesh = _bm.Mesh;
            Setup(_root.AddComponent<MeshRenderer>(), rampMat, 90);

            _bloomGo = new GameObject("impact");
            _bloomGo.transform.SetParent(parent, false);
            _bloomMesh = FxMesh.Quad(Color.white);
            _bloomGo.AddComponent<MeshFilter>().sharedMesh = _bloomMesh;
            _bloomMr = _bloomGo.AddComponent<MeshRenderer>();
            Setup(_bloomMr, softMat, 91);
            _bloomCols = new Color[_bloomMesh.vertexCount];

            SetActive(false);
        }

        static void Setup(MeshRenderer mr, Material mat, int order)
        {
            if (mat != null) mr.sharedMaterial = mat;
            mr.sortingLayerName = "FX";
            mr.sortingOrder = order;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
            mr.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.Off;
            mr.reflectionProbeUsage = UnityEngine.Rendering.ReflectionProbeUsage.Off;
        }

        void SetActive(bool on)
        {
            if (_root.activeSelf != on) _root.SetActive(on);
            if (_bloomGo.activeSelf != on) _bloomGo.SetActive(on);
        }

        public void Fire(in Vector2 muzzlePx, in Vector2 targetPx, Color stripTint, Color bloomTint, uint fireIndex)
        {
            Vector3 mW = FxPixelSpace.ToWorld(muzzlePx);
            Vector3 tW = FxPixelSpace.ToWorld(targetPx);
            _targetW = tW;
            _bloomTint = bloomTint;
            _rng = new Mulberry32(unchecked(0x9E3779B9u ^ fireIndex)); // reproducible per-fire spine
            float ampW = FxPixelSpace.ToWorldLen(JITTER_AMP_PX);
            for (int i = 0; i < BeamMesh.SPINE; i++)
            {
                Vector3 p = Vector3.Lerp(mW, tW, i / (float)BeamMesh.SEG);
                if (i != 0 && i != BeamMesh.SPINE - 1)
                {
                    p.x += (float)(_rng.NextDouble() * 2.0 - 1.0) * ampW;
                    p.y += (float)(_rng.NextDouble() * 2.0 - 1.0) * ampW;
                }
                _spine[i] = p;
            }
            _spine[0] = mW; _spine[BeamMesh.SPINE - 1] = tW; // re-lock endpoints (defensive)
            _bm.Rebuild(_spine, FxPixelSpace.ToWorldLen(WIDTH_PX * 0.5f), stripTint);
            _bloomGo.transform.position = tW;
            _t = LIFE;
            SetActive(true);
            Apply(1f);
        }

        public void Tick(float dt)
        {
            if (_t < 0f) return;
            _t -= dt;
            if (_t <= 0f) { _t = -1f; SetActive(false); return; }
            Apply(Mathf.Clamp01(_t / LIFE));
        }

        void Apply(float a)
        {
            _bm.SetAlpha(a);
            float rPx = 12f * a + 4f;
            float dia = FxPixelSpace.ToWorldLen(rPx) * 2f;
            _bloomGo.transform.localScale = new Vector3(dia, dia, 1f);
            var c = _bloomTint; c.a = a;
            for (int i = 0; i < _bloomCols.Length; i++) _bloomCols[i] = c;
            _bloomMesh.colors = _bloomCols;
        }
    }
}
