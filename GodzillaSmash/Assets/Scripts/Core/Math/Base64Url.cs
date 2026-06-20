// Godzilla.Core/Math/Base64Url.cs — pure C#, NO UnityEngine.
// Bit-exact port of js/utils.js U.b64u (gz-v32) — base64url of a UNICODE string (the GZS1: payload codec).
// enc: standard base64 of the UTF-8 bytes, then +/ -> -_ and strip '=' padding.
// dec: restore -_ -> +/ and '=' padding to a multiple of 4, decode, then UTF-8.

using System;
using System.Text;

namespace Godzilla.Core
{
    public static class Base64Url
    {
        // [utils.js:95-100]
        public static string Encode(string s)
        {
            string b64 = Convert.ToBase64String(Utf8.Bytes(s));
            return b64.Replace('+', '-').Replace('/', '_').TrimEnd('=');
        }

        // [utils.js:101-107]
        public static string Decode(string s)
        {
            string b64 = s.Replace('-', '+').Replace('_', '/');
            switch (b64.Length % 4) // JS: while (len % 4) b64 += '='
            {
                case 2: b64 += "=="; break;
                case 3: b64 += "=";  break;
            }
            byte[] bytes = Convert.FromBase64String(b64);
            return Encoding.UTF8.GetString(bytes);
        }
    }
}
