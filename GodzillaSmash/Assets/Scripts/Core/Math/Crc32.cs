// Godzilla.Core/Math/Crc32.cs — pure C#, NO UnityEngine.
// Bit-exact port of js/utils.js U.crc32 (gz-v32) — corruption check for GZS1: export codes.
// Standard CRC-32: reflected poly 0xEDB88320, init/final XOR 0xFFFFFFFF; -> 8-char lowercase hex.
// The 32-bit accumulator MUST be unsigned (JS '>>>1' is a logical shift).

namespace Godzilla.Core
{
    public static class Crc32
    {
        // [utils.js:83-91]
        public static string Hex(string s)
        {
            byte[] bytes = Utf8.Bytes(s);
            uint c = 0xFFFFFFFF;
            for (int i = 0; i < bytes.Length; i++)
            {
                c ^= bytes[i];
                for (int k = 0; k < 8; k++)
                    c = (c >> 1) ^ (0xEDB88320u & (uint)(-(int)(c & 1))); // 0xedb88320 & -(c & 1)
            }
            return (c ^ 0xFFFFFFFF).ToString("x8");
        }
    }
}
