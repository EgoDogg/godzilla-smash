// Godzilla.Presentation/FX/KillFlashRenderer.cs — full-screen white kill-flash (spec Step 9b, correction #1).
//
// Holds the Core KillFlash struct (FIELD). The web re-blits roughly-uniform white pixels, so this is the ONE FX quad
// that must read FLAT (a radial would vignette). To stay within the <=3-material budget (correction #6) it reuses the
// shared FXSoftAdditive.mat but collapses ALL quad UVs to the soft-radial CENTER texel (white, alpha~1) -> uniform
// white across the screen, no 4th material. Drawn LAST (sortingOrder 32760), NOT through Bloom (off).
//
// Self-contained for the spike: Update() ticks the decay so a triggered flash fades on its own; OnFormChanged() and
// Charge(chargeT) are the external triggers Phase-1 wires to the KaijuSim port.

using UnityEngine;
using Godzilla.Core.FX;

namespace Godzilla.Presentation.FX
{
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public class KillFlashRenderer : MonoBehaviour
    {
        [SerializeField] Material fxMaterial; // shared FXSoftAdditive.mat (baker assigns)
        [SerializeField] Camera cam;

        KillFlash _flash;          // FIELD
        bool _charging;
        double _chargeT;
        MeshRenderer _mr;
        Mesh _mesh;
        Color[] _cols;
        Transform _t;

        void Awake()
        {
            _t = transform;
            if (cam == null) cam = Camera.main;
            _mesh = FlatWhiteQuad();
            GetComponent<MeshFilter>().sharedMesh = _mesh;
            _cols = new Color[_mesh.vertexCount];
            _mr = GetComponent<MeshRenderer>();
            if (fxMaterial != null) _mr.sharedMaterial = fxMaterial;
            _mr.sortingLayerName = "FX";
            _mr.sortingOrder = 32760; // drawn last
            _mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _mr.receiveShadows = false;
            _mr.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.Off;
            _mr.reflectionProbeUsage = UnityEngine.Rendering.ReflectionProbeUsage.Off;
            _mr.enabled = false;
        }

        // ±0.5 quad, UVs all collapsed to (0.5,0.5) -> samples the soft-radial center (flat white), no 4th material.
        static Mesh FlatWhiteQuad()
        {
            var m = new Mesh { name = "FxKillFlash" };
            m.vertices = new[] { new Vector3(-.5f, -.5f, 0), new Vector3(.5f, -.5f, 0), new Vector3(-.5f, .5f, 0), new Vector3(.5f, .5f, 0) };
            var c = new Vector2(0.5f, 0.5f);
            m.uv = new[] { c, c, c, c };
            m.colors32 = new[] { (Color32)Color.white, (Color32)Color.white, (Color32)Color.white, (Color32)Color.white };
            m.triangles = new[] { 0, 1, 2, 2, 1, 3 };
            m.bounds = new Bounds(Vector3.zero, new Vector3(1f, 1f, 1f));
            return m;
        }

        public void OnFormChanged() => _flash.TriggerFull();
        public void SetCharge(bool charging, double chargeT) { _charging = charging; _chargeT = chargeT; }

        void LateUpdate()
        {
            _flash.Tick(Time.deltaTime);
            if (_charging) _flash.FloorCharge(_chargeT); // Tick FIRST, then floor (correction #1 order)

            bool vis = _flash.Visible;
            if (_mr.enabled != vis) _mr.enabled = vis;
            if (!vis) return;

            if (cam == null) cam = Camera.main;
            if (cam != null && cam.orthographic)
            {
                float h = cam.orthographicSize * 2f;
                _t.localScale = new Vector3(h * cam.aspect, h, 1f);
                _t.position = new Vector3(cam.transform.position.x, cam.transform.position.y, FxPixelSpace.FxZ);
            }
            float a = (float)_flash.Alpha;
            for (int i = 0; i < _cols.Length; i++) _cols[i] = new Color(1f, 1f, 1f, a);
            _mesh.colors = _cols;
        }
    }
}
