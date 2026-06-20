// Godzilla.Tests.EditMode/MathPortTests.cs — canonical headless NUnit gate (Unity batchmode -runTests).
// Proves the Godzilla.Core/Math bit-exact ports compile + run GREEN inside Unity's asmdef + test framework,
// referencing Core ONLY (no UnityEngine in the system under test). Values are the REAL js/utils.js ground
// truth (the same vectors the exhaustive standalone dotnet harness in tools/core-tests round-trips).
// Astral/CJK chars use \U / \u escapes so this source stays ASCII-clean.

using NUnit.Framework;
using Godzilla.Core;

namespace Godzilla.Tests.EditMode
{
    public class MathPortTests
    {
        // The realistic GZS1-ish payload (exact bytes JSON.stringify produced in node).
        const string Payload =
            "{\"v\":4,\"money\":12345678901,\"claws\":7,\"forms\":[\"gz2014\",\"supernova\"],\"rev\":42}";

        [Test]
        public void Clamp_matches_js()
        {
            Assert.That(MathUtil.Clamp(15, 0, 10), Is.EqualTo(10.0));
            Assert.That(MathUtil.Clamp(-3, 0, 10), Is.EqualTo(0.0));
            Assert.That(MathUtil.Clamp(7.5, 1.2, 9.8), Is.EqualTo(7.5));
        }

        [Test]
        public void Lerp_matches_js()
        {
            Assert.That(MathUtil.Lerp(0, 10, 0.5), Is.EqualTo(5.0));
            Assert.That(MathUtil.Lerp(2, 8, 0.25), Is.EqualTo(3.5));
        }

        [Test]
        public void Fmt_reproduces_js_number_strings()
        {
            Assert.That(Fmt.Compact(0), Is.EqualTo("0"));
            Assert.That(Fmt.Compact(999), Is.EqualTo("999"));
            Assert.That(Fmt.Compact(1500), Is.EqualTo("1.5k"));
            Assert.That(Fmt.Compact(1750000), Is.EqualTo("1.8M"));
            Assert.That(Fmt.Compact(9999999), Is.EqualTo("10M"));     // 9.999999 -> round -> 10
            Assert.That(Fmt.Compact(16777217), Is.EqualTo("16.8M"));  // past the float-int boundary
            Assert.That(Fmt.Compact(1050000000), Is.EqualTo("1.1B"));
            Assert.That(Fmt.Compact(12000000000), Is.EqualTo("12B")); // WORLD2_COST
            Assert.That(Fmt.Compact(1000000000), Is.EqualTo("1B"));   // ROW_HP
            Assert.That(Fmt.Compact(999000000000), Is.EqualTo("999B"));
            Assert.That(Fmt.Compact(1e12), Is.EqualTo("1T"));
            Assert.That(Fmt.Compact(1250000000000), Is.EqualTo("1.3T"));
            Assert.That(Fmt.Compact(-5), Is.EqualTo("0"));            // Math.max(0, floor)
            // band-crossing: trim rounds up to "1000X" WITHOUT promoting the band (matches JS exactly)
            Assert.That(Fmt.Compact(999960000000), Is.EqualTo("1000B"));
            Assert.That(Fmt.Compact(999950000), Is.EqualTo("1000M"));
            Assert.That(Fmt.Compact(9999990000), Is.EqualTo("10B"));
        }

        [Test]
        public void Hash32_matches_js()
        {
            Assert.That(Hash32.Mix(0), Is.EqualTo(0u));
            Assert.That(Hash32.Mix(1), Is.EqualTo(824515495u));
            // WORLD_SEED 0x9E3779B1 coerced via x|0 to int32 = -1640531535
            Assert.That(Hash32.Mix(unchecked((int)0x9E3779B1)), Is.EqualTo(1051910520u));
        }

        [Test]
        public void Mulberry32_matches_js_world_seed()
        {
            var rng = new Mulberry32(0x9E3779B1u); // WORLD_SEED
            Assert.That(rng.NextDouble(), Is.EqualTo(0.5464560757391155));
            Assert.That(rng.NextDouble(), Is.EqualTo(0.45955629041418433));
            Assert.That(rng.NextDouble(), Is.EqualTo(0.2470416973810643));
            Assert.That(rng.NextDouble(), Is.EqualTo(0.5192999374121428));
        }

        [Test]
        public void Mulberry32_matches_js_seed0()
        {
            var rng = new Mulberry32(0u);
            Assert.That(rng.NextDouble(), Is.EqualTo(0.26642920868471265));
            Assert.That(rng.NextDouble(), Is.EqualTo(0.0003297457005828619));
            Assert.That(rng.NextDouble(), Is.EqualTo(0.2232720274478197));
        }

        [Test]
        public void Utf8_matches_text_encoder()
        {
            Assert.That(Utf8.Bytes("\U0001F996"), Is.EqualTo(new byte[] { 240, 159, 166, 150 })); // trex
            Assert.That(Utf8.Bytes("日本語"),                                          // CJK
                Is.EqualTo(new byte[] { 230, 151, 165, 230, 156, 172, 232, 170, 158 }));
            Assert.That(Utf8.Bytes(""), Is.EqualTo(new byte[0]));
        }

        [Test]
        public void Crc32_matches_js()
        {
            Assert.That(Crc32.Hex(""), Is.EqualTo("00000000"));
            Assert.That(Crc32.Hex("\U0001F996"), Is.EqualTo("b05c1b68"));
            Assert.That(Crc32.Hex(Payload), Is.EqualTo("825795e9"));
        }

        [Test]
        public void Base64Url_encodes_like_js()
        {
            Assert.That(Base64Url.Encode("\U0001F996rawr"), Is.EqualTo("8J-mlnJhd3I"));
            Assert.That(Base64Url.Encode(Payload), Is.EqualTo(
                "eyJ2Ijo0LCJtb25leSI6MTIzNDU2Nzg5MDEsImNsYXdzIjo3LCJmb3JtcyI6WyJnejIwMTQiLCJzdXBlcm5vdmEiXSwicmV2Ijo0Mn0"));
        }

        [Test]
        public void Base64Url_round_trips_unicode()
        {
            foreach (var s in new[] { "", "\U0001F996rawr", "日本語", Payload, "a+b/c=d" })
                Assert.That(Base64Url.Decode(Base64Url.Encode(s)), Is.EqualTo(s));
            // decode-only of known url-safe inputs
            Assert.That(Base64Url.Decode("8J-mlg"), Is.EqualTo("\U0001F996"));
            Assert.That(Base64Url.Decode("aGVsbG8"), Is.EqualTo("hello"));
        }
    }
}
