// Godzilla.Core/Iso/TraumaModel.cs — pure C#, NO UnityEngine, double throughout.
// Bit-exact scalar envelope of js/iso.js camera trauma (gz-v32, IMMUTABLE ref). This is the anti-quake FIX ported
// VERBATIM: clamp-on-add (min(t+mag/85,1)) kills the autofire compounding, EXPONENTIAL decay gives a stable mid
// steady-state under sustained fire. reducedMotion lives in the Presentation adapter (NOT here — Core stays engine-free).
// The 0.004 Floor IS real here (iso.js:137/139) — it is the value the FX kill-flash spec correctly flagged as
// *fabricated* for _flash; trauma legitimately floors at 0.004, kill-flash floors at 0.
namespace Godzilla.Core
{
    public struct TraumaModel
    {
        public const double ShakeMaxPx   = 12.0;        // [iso.js:35]
        public const double ShakeDecay   = 0.02;        // [iso.js:36] half-life 0.17718382013555792s
        public const double ShakeTraumaK = 1.0 / 85.0;  // [iso.js:37] 0.011764705882352941
        public const double Floor        = 0.004;       // [iso.js:137,139]

        public double Trauma;

        // [iso.js:154-156] camera.shake: add. mag<=0 no-op. clamp to 1. (reducedMotion gate is in the adapter.)
        public void Add(double mag)
        { if (!(mag > 0)) return; double t = Trauma + mag * ShakeTraumaK; Trauma = t < 1 ? t : 1; }

        // [iso.js:137-140] STRICT > guard + else-zero. NOTE: the literal web has NO else (a sub-floor trauma is
        // SKIPPED/left untouched), but sub-floor (0,0.004] is UNREACHABLE at frame boundaries — every write lands in
        // {0} U (0.004,1] (smallest add mag>0 -> >=0.0059; the inner `<Floor -> 0` zeroes on the decay crossing). So
        // else-zero is identical to the web in real operation and the cleaner invariant (a sub-floor value can't leak in).
        public void Decay(double dt)
        {
            if (Trauma > Floor)
            { double e = dt > 0 ? dt : 0; Trauma *= System.Math.Pow(ShakeDecay, e); if (Trauma < Floor) Trauma = 0; }
            else Trauma = 0;
        }

        // [iso.js:140] screen-px offset magnitude (the View turns this into jitter).
        public double OffsetPx => ShakeMaxPx * Trauma;
    }
}
