// Godzilla.Presentation/FX/FxMesh.cs — tiny shared mesh builders for the FX components.
// Disc = a circular fan inscribed in the soft-radial texture (correction #7: the radial's alpha is ~0 outside the
// inscribed circle, so a fan drops the dead-corner texels a full quad would shade under ZTest-Always additive).
// Quad = the unit ±0.5 quad with UV 0..1 (used where the texture itself supplies the falloff inside the quad, e.g.
// breath-charge and the full-screen kill-flash). Each mesh gets its own instance (never the shared asset) so a
// component can rewrite vertex colors per-frame without clobbering siblings.

using UnityEngine;

namespace Godzilla.Presentation.FX
{
    public static class FxMesh
    {
        // Radius-0.5 disc fan, UV mapped to the texture's inscribed circle. seg >= 8.
        public static Mesh Disc(Color32 color, int seg)
        {
            if (seg < 8) seg = 8;
            var verts = new Vector3[seg + 1];
            var uvs = new Vector2[seg + 1];
            var cols = new Color32[seg + 1];
            verts[0] = Vector3.zero; uvs[0] = new Vector2(0.5f, 0.5f); cols[0] = color;
            for (int i = 0; i < seg; i++)
            {
                float a = (i / (float)seg) * Mathf.PI * 2f;
                float c = Mathf.Cos(a), s = Mathf.Sin(a);
                verts[i + 1] = new Vector3(c * 0.5f, s * 0.5f, 0f);
                uvs[i + 1] = new Vector2(0.5f + 0.5f * c, 0.5f + 0.5f * s);
                cols[i + 1] = color;
            }
            var tris = new int[seg * 3];
            for (int i = 0; i < seg; i++)
            {
                tris[i * 3] = 0;
                tris[i * 3 + 1] = 1 + i;
                tris[i * 3 + 2] = 1 + (i + 1) % seg;
            }
            var m = new Mesh { name = "FxDisc" };
            m.vertices = verts; m.uv = uvs; m.colors32 = cols; m.triangles = tris;
            m.bounds = new Bounds(Vector3.zero, new Vector3(1f, 1f, 1f)); // additive ZTest-Always FX: never frustum-cull
            return m;
        }

        // Unit ±0.5 quad, UV 0..1.
        public static Mesh Quad(Color32 color)
        {
            var m = new Mesh { name = "FxQuad" };
            m.vertices = new[] { new Vector3(-.5f, -.5f, 0), new Vector3(.5f, -.5f, 0), new Vector3(-.5f, .5f, 0), new Vector3(.5f, .5f, 0) };
            m.uv = new[] { Vector2.zero, Vector2.right, Vector2.up, Vector2.one };
            m.colors32 = new[] { color, color, color, color };
            m.triangles = new[] { 0, 1, 2, 2, 1, 3 };
            m.bounds = new Bounds(Vector3.zero, new Vector3(1f, 1f, 1f));
            return m;
        }
    }
}
