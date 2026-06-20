// Editor-independent bit-exact gate for Godzilla.Core/Math.
// Round-trips the REAL ground-truth vectors (js/utils.js executed in node -> vectors.json) against the
// C# ports. Exit 0 = every vector bit-exact; exit 1 = any divergence (so it gates CI with no Unity license).
using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using Godzilla.Core;

static class Program
{
    static int _pass, _fail;

    static void Check(string label, bool ok, string detail = "")
    {
        if (ok) { _pass++; }
        else { _fail++; Console.WriteLine($"  FAIL  {label}   {detail}"); }
    }

    static int Main()
    {
        string path = Path.Combine(AppContext.BaseDirectory, "vectors.json");
        if (!File.Exists(path)) { Console.WriteLine("vectors.json not found at " + path); return 2; }
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var root = doc.RootElement;

        // ---- clamp ----
        foreach (var c in root.GetProperty("clamp").EnumerateArray())
        {
            var a = c.GetProperty("in").EnumerateArray().Select(e => e.GetDouble()).ToArray();
            double got = MathUtil.Clamp(a[0], a[1], a[2]);
            double exp = c.GetProperty("out").GetDouble();
            Check($"clamp({a[0]},{a[1]},{a[2]})", got == exp, $"got {got} exp {exp}");
        }

        // ---- lerp ----
        foreach (var c in root.GetProperty("lerp").EnumerateArray())
        {
            var a = c.GetProperty("in").EnumerateArray().Select(e => e.GetDouble()).ToArray();
            double got = MathUtil.Lerp(a[0], a[1], a[2]);
            double exp = c.GetProperty("out").GetDouble();
            Check($"lerp({a[0]},{a[1]},{a[2]})", got == exp, $"got {got} exp {exp}");
        }

        // ---- fmt ----
        foreach (var c in root.GetProperty("fmt").EnumerateArray())
        {
            double inp = c.GetProperty("in").GetDouble();
            string got = Fmt.Compact(inp);
            string exp = c.GetProperty("out").GetString();
            Check($"fmt({inp.ToString(CultureInfo.InvariantCulture)})", got == exp, $"got '{got}' exp '{exp}'");
        }

        // ---- hash (input is a JS number coerced via x|0 to int32) ----
        foreach (var c in root.GetProperty("hash").EnumerateArray())
        {
            long raw = (long)c.GetProperty("in").GetDouble();
            int xi = unchecked((int)raw);             // ToInt32 / '| 0'
            uint got = Hash32.Mix(xi);
            uint exp = (uint)c.GetProperty("out").GetUInt64();
            Check($"hash({raw})", got == exp, $"got {got} exp {exp}");
        }

        // ---- mulberry32 (rng) ----
        var seeds = new (string key, uint seed)[] {
            ("WORLD_SEED_0x9E3779B1", 0x9E3779B1u), ("seed0", 0u), ("seed1", 1u),
            ("seed12345", 12345u), ("seedMax", 0xFFFFFFFFu),
        };
        var rngObj = root.GetProperty("rng");
        foreach (var (key, seed) in seeds)
        {
            var arr = rngObj.GetProperty(key).EnumerateArray().Select(e => e.GetDouble()).ToArray();
            var rng = new Mulberry32(seed);
            for (int i = 0; i < arr.Length; i++)
            {
                double got = rng.NextDouble();
                Check($"rng[{key}][{i}]", got == arr[i],
                      $"got {got:R} exp {arr[i]:R}");
            }
        }

        // ---- utf8 ----
        foreach (var c in root.GetProperty("utf8").EnumerateArray())
        {
            string inp = c.GetProperty("in").GetString();
            byte[] got = Utf8.Bytes(inp);
            byte[] exp = c.GetProperty("out").EnumerateArray().Select(e => (byte)e.GetInt32()).ToArray();
            Check($"utf8({c.GetProperty("key").GetString()})", got.SequenceEqual(exp),
                  $"got [{string.Join(",", got)}] exp [{string.Join(",", exp)}]");
        }

        // ---- crc32 ----
        foreach (var c in root.GetProperty("crc32").EnumerateArray())
        {
            string inp = c.GetProperty("in").GetString();
            string got = Crc32.Hex(inp);
            string exp = c.GetProperty("out").GetString();
            Check($"crc32({c.GetProperty("key").GetString()})", got == exp, $"got '{got}' exp '{exp}'");
        }

        // ---- b64u enc + dec round-trip ----
        foreach (var c in root.GetProperty("b64u").EnumerateArray())
        {
            string inp = c.GetProperty("in").GetString();
            string encGot = Base64Url.Encode(inp);
            string encExp = c.GetProperty("enc").GetString();
            string key = c.GetProperty("key").GetString();
            Check($"b64u.enc({key})", encGot == encExp, $"got '{encGot}' exp '{encExp}'");
            // decode our own encoding AND the reference encoding -> must both equal the original
            Check($"b64u.dec(enc({key}))", Base64Url.Decode(encExp) == inp, "round-trip mismatch");
        }
        foreach (var c in root.GetProperty("b64u_dec_only").EnumerateArray())
        {
            string inp = c.GetProperty("in").GetString();
            string exp = c.GetProperty("out").GetString();
            Check($"b64u.dec({inp})", Base64Url.Decode(inp) == exp, $"got '{Base64Url.Decode(inp)}' exp '{exp}'");
        }

        Console.WriteLine($"\nCore/Math bit-exact: {_pass} passed, {_fail} failed.");
        return _fail == 0 ? 0 : 1;
    }
}
