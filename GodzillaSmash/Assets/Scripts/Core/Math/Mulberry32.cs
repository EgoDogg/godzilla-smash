// Godzilla.Core/Math/Mulberry32.cs — pure C#, NO UnityEngine.
// Bit-exact port of js/utils.js U.rng (gz-v32) — mulberry32 seeded RNG returning [0,1) doubles.
// The deterministic backbone of city generation (WORLD_SEED 0x9E3779B1). One wrong bit => a different city.
//
// JS keeps state in a number coerced to int32 each step ('s = (s + k) | 0'); we hold it as int32 directly.
// Modular add/mul mod 2^32 is identical whether the bits are read signed or unsigned, so int32 state is exact.
// uint32 / 2^32 is exactly representable in double (32-bit numerator), so the returned double is bit-identical.

namespace Godzilla.Core
{
    public struct Mulberry32
    {
        private int _s;

        // JS: 'let s = seed >>> 0'. We store the same 32 bits as int32; the first Next() applies '| 0'.
        public Mulberry32(uint seed) { _s = unchecked((int)seed); }
        public Mulberry32(int seed)  { _s = seed; }

        // [utils.js:51-54]
        public double NextDouble()
        {
            unchecked
            {
                _s = _s + 0x6D2B79F5;                                   // (s + 0x6D2B79F5) | 0
                int t = (_s ^ (int)((uint)_s >> 15)) * (1 | _s);        // imul(s ^ s>>>15, 1 | s)
                t = (t + (t ^ (int)((uint)t >> 7)) * (61 | t)) ^ t;     // (t + imul(t ^ t>>>7, 61 | t)) ^ t
                return (uint)(t ^ (int)((uint)t >> 14)) / 4294967296.0; // ((t ^ t>>>14) >>> 0) / 2^32
            }
        }
    }
}
