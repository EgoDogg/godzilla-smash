// Godzilla.Core/Iso/IsoMath.cs — pure C#, NO UnityEngine.
// Bit-exact port of js/iso.js worldToScreen/depthKey + Config.GRID iso constants (gz-v32, IMMUTABLE ref).
// double EVERYWHERE: depthKey is FLOATING-POINT — real call sites pass fractional wx+0.5 / altitude.
// DepthKey(0.1,0,0,0) -> 102.4. A long/int return would truncate building-center keys & re-order the painter's list.
namespace Godzilla.Core
{
    public static class IsoMath
    {
        // [config.js:15] GRID — single source of truth (never hardcode elsewhere).
        public const int    COLS   = 21;        // GRID.cols
        public const int    ROWS   = 58;        // GRID.rows
        public const double TILE_W = 56.0;      // GRID.TILE_W
        public const double TILE_H = 28.0;      // GRID.TILE_H
        public const double HW = TILE_W / 2;    // [iso.js:14] 28
        public const double HH = TILE_H / 2;    // [iso.js:15] 14
        public const double WZ = 40.0;          // [iso.js:16] GRID.WZ_PX
        public const double INV_X = 1.0 / (2 * HW); // [iso.js:23] 1/56  (consumed by Step 3 ScreenToWorld)
        public const double INV_Y = 1.0 / (2 * HH); // [iso.js:24] 1/28

        // [iso.js:217-222] alloc form parity with iso.worldToScreen. wz omitted -> 0 (JS `wz||0`).
        public static (double x, double y) WorldToScreen(double wx, double wy, double wz = 0.0)
            => ((wx - wy) * HW, (wx + wy) * HH - wz * WZ);

        // [iso.js:225-229] no-alloc twin (worldToScreenInto).
        public static void WorldToScreen(double wx, double wy, double wz, out double sx, out double sy)
        { sx = (wx - wy) * HW; sy = (wx + wy) * HH - wz * WZ; }

        // [iso.js:264-266] painter's-order key. Larger = drawn later (in front). FLOATING-POINT.
        // JS reads e.wz||0 and e.depthBias||0; callers pass them explicitly here.
        public static double DepthKey(double wx, double wy, double wz, double depthBias)
            => (wx + wy) * 1024.0 + wz * 4.0 + depthBias;
    }
}
