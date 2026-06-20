// Godzilla.Core/Math/Fmt.cs — pure C#, NO UnityEngine.
// Bit-exact port of js/utils.js U.fmt (gz-v32). Compact number formatting up to trillions.
// Reproduces JS Number->string semantics: round-half-UP, drop trailing zeros (12.0 -> "12", 1.5 -> "1.5").

using System.Globalization;

namespace Godzilla.Core
{
    public static class Fmt
    {
        // [utils.js:18]  trim(x) = (Math.round(x*10)/10).toString()
        // Inputs here are always x >= 1 (n >= scale), so Math.round == Math.floor(x*10 + 0.5) (half toward +inf).
        // We carry the result as an integer count of tenths and assemble the string BY HAND — this sidesteps every
        // JS-Number.toString vs C#-double.ToString shortest-roundtrip divergence (e.g. an emitted "1.2000000000000002").
        // After round/10 the value is provably an exact multiple of 0.1 with exactly one fractional digit, so the
        // whole "." frac form reproduces JS's trailing-zero drop exactly (12.0 -> "12", 1.5 -> "1.5", 1000.0 -> "1000").
        private static string Trim(double x)
        {
            long tenths = (long)System.Math.Floor(x * 10.0 + 0.5); // Math.round(x*10), x >= 1
            long whole = tenths / 10;
            long frac = tenths % 10;
            return frac == 0
                ? whole.ToString(CultureInfo.InvariantCulture)
                : whole.ToString(CultureInfo.InvariantCulture) + "." + frac.ToString(CultureInfo.InvariantCulture);
        }

        // [utils.js:19-26]
        public static string Compact(double n)
        {
            n = System.Math.Max(0.0, System.Math.Floor(n));
            if (n >= 1e12) return Trim(n / 1e12) + "T";
            if (n >= 1e9)  return Trim(n / 1e9)  + "B";
            if (n >= 1e6)  return Trim(n / 1e6)  + "M";
            if (n >= 1e3)  return Trim(n / 1e3)  + "k";
            return ((long)n).ToString(CultureInfo.InvariantCulture); // '' + n  (n is an integer 0..999 here)
        }
    }
}
