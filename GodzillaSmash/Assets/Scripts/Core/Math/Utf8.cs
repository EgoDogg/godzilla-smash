// Godzilla.Core/Math/Utf8.cs — pure C#, NO UnityEngine.
// Bit-exact port of js/utils.js U.utf8 (gz-v32) = TextEncoder().encode(str) — standard UTF-8.
// System.Text.Encoding.UTF8.GetBytes emits no BOM and replaces lone surrogates with U+FFFD,
// matching TextEncoder for all well-formed strings (verified: 'trex' U+1F996 -> 240,159,166,150).

using System.Text;

namespace Godzilla.Core
{
    public static class Utf8
    {
        // [utils.js:67-80]
        public static byte[] Bytes(string s) => Encoding.UTF8.GetBytes(s);
    }
}
