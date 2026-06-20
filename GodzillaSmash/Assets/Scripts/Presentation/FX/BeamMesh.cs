// Godzilla.Presentation/FX/BeamMesh.cs — zero-alloc beam triangle-strip (spec Step 8b, corrections #10,#14).
//
// 10 spine points (web strokeJagged segs=9 -> points at i/9; entities.js:311) x 2 verts (+-halfWidth) = 20 verts,
// 9 quads = 54 indices. ALL arrays pre-alloced; UVs (U = side 0..1 -> rim/core/rim, V = spine progress i/9) + index
// buffer set ONCE in the ctor; Rebuild overwrites only positions + tint. The beam_ramp ramps along U so the strip
// edges sample rim and the interpolated center samples core (deviation #6).
// Correction #10: a fixed large mesh.bounds set once -> NEVER RecalculateBounds per fire (additive ZTest-Always FX
// must never frustum-cull mid-screen).

using UnityEngine;

namespace Godzilla.Presentation.FX
{
    public class BeamMesh
    {
        public const int SPINE = 10;
        public const int SEG = SPINE - 1; // 9

        public readonly Mesh Mesh;
        readonly Vector3[] _v = new Vector3[SPINE * 2];
        readonly Vector2[] _uv = new Vector2[SPINE * 2];
        readonly Color[] _c = new Color[SPINE * 2];
        readonly int[] _i = new int[SEG * 6];

        public BeamMesh()
        {
            Mesh = new Mesh { name = "FxBeam" };
            Mesh.MarkDynamic();
            // beam_ramp.png ramps rim->core->rim along its U (256px) axis, so the SIDE coordinate maps to texture U
            // (the two edges sample U=0 and U=1 = rim; the interpolated strip center samples U=0.5 = core). V carries
            // spine progress (the ramp is uniform along the beam length).
            for (int i = 0; i < SPINE; i++)
            {
                float prog = i / (float)SEG;
                _uv[i * 2] = new Vector2(0f, prog);     // +perp edge -> U=0 (rim)
                _uv[i * 2 + 1] = new Vector2(1f, prog); // -perp edge -> U=1 (rim); center -> U=0.5 (core)
            }
            for (int s = 0; s < SEG; s++)
            {
                int b = s * 6, l = s * 2;
                _i[b] = l; _i[b + 1] = l + 2; _i[b + 2] = l + 1;
                _i[b + 3] = l + 1; _i[b + 4] = l + 2; _i[b + 5] = l + 3;
            }
            for (int k = 0; k < _c.Length; k++) _c[k] = Color.white;
            Mesh.vertices = _v; Mesh.uv = _uv; Mesh.colors = _c; Mesh.triangles = _i;
            Mesh.bounds = new Bounds(Vector3.zero, new Vector3(1000f, 1000f, 1f)); // never frustum-cull
        }

        // spine has SPINE points (endpoints already locked to muzzle/target). halfWidthWorld = beam half-width.
        public void Rebuild(Vector3[] spine, float halfWidthWorld, Color tint)
        {
            Vector3 a = spine[0], b = spine[SPINE - 1];
            Vector3 dir = b - a; dir.z = 0f;
            if (dir.sqrMagnitude < 1e-9f) dir = Vector3.right; else dir.Normalize();
            Vector3 perp = new Vector3(-dir.y, dir.x, 0f) * halfWidthWorld;
            for (int i = 0; i < SPINE; i++)
            {
                Vector3 p = spine[i];
                _v[i * 2] = p + perp; _v[i * 2 + 1] = p - perp;
                _c[i * 2] = tint; _c[i * 2 + 1] = tint;
            }
            Mesh.vertices = _v; Mesh.colors = _c;
        }

        public void SetAlpha(float a)
        {
            for (int k = 0; k < _c.Length; k++) { var c = _c[k]; c.a = a; _c[k] = c; }
            Mesh.colors = _c;
        }
    }
}
