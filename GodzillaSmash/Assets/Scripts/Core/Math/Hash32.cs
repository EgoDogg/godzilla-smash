// Godzilla.Core/Math/Hash32.cs — pure C#, NO UnityEngine.
// Bit-exact port of js/utils.js U.hash (gz-v32) — deterministic per-building variation seed.
// JS '|0' = int32, '>>>16' = logical (unsigned) shift, 'Math.imul' = 32-bit signed multiply with wrap.

namespace Godzilla.Core
{
    public static class Hash32
    {
        // [utils.js:39-45]  x|0; x = imul(x ^ x>>>16, 0x45d9f3b) (twice); x ^= x>>>16; return x>>>0
        public static uint Mix(int x)
        {
            unchecked
            {
                x = (x ^ (int)((uint)x >> 16)) * 0x45d9f3b;
                x = (x ^ (int)((uint)x >> 16)) * 0x45d9f3b;
                x = x ^ (int)((uint)x >> 16);
                return (uint)x;
            }
        }
    }
}
