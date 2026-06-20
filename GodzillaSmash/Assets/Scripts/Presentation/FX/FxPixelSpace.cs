// Godzilla.Presentation/FX/FxPixelSpace.cs — the FXSPIKE px<->world mapping (spec Step 8a).
//
// The web draws in design pixels with +y DOWN; the spike camera is ortho size 5 over a 720px design height, +y UP.
// UnitsPerPx = (OrthoSize*2)/DesignHeightPx. ToWorld flips Y. FxZ keeps FX a hair in front of the body plane.
// Phase-1 (P1) re-confirms DesignHeightPx/OrthoSize against the chosen sprite import PPU and reads
// Camera.orthographicSize live (asserting it == OrthoSize).

using UnityEngine;

namespace Godzilla.Presentation.FX
{
    public static class FxPixelSpace
    {
        public const float OrthoSize = 5f;
        public const float DesignHeightPx = 720f;
        public const float UnitsPerPx = (OrthoSize * 2f) / DesignHeightPx; // 0.013888889f
        public const float FxZ = -1f;

        public static Vector3 ToWorld(in Vector2 px) => new Vector3(px.x * UnitsPerPx, -px.y * UnitsPerPx, FxZ); // Y flip
        public static float ToWorldLen(float lenPx) => lenPx * UnitsPerPx;
    }
}
