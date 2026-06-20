// Godzilla.Core/Math/MathUtil.cs — pure C#, NO UnityEngine.
// Bit-exact port of js/utils.js U.clamp / U.lerp (gz-v32, IMMUTABLE reference spec).
// double everywhere (never float): money/HP/power reach 1e9..12e9; float corrupts above 16.7M.

namespace Godzilla.Core
{
    /// <summary>Scalar helpers ported verbatim from <c>js/utils.js</c>.</summary>
    public static class MathUtil
    {
        // [utils.js:7]  v < lo ? lo : (v > hi ? hi : v)   — NaN flows through unchanged (both JS and C#).
        public static double Clamp(double v, double lo, double hi) => v < lo ? lo : (v > hi ? hi : v);

        // [utils.js:8]  a + (b - a) * t
        public static double Lerp(double a, double b, double t) => a + (b - a) * t;
    }
}
