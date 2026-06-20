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

        // ---- iso constants ----
        var ic = root.GetProperty("isoConst");
        Check("iso.HW", IsoMath.HW == ic.GetProperty("HW").GetDouble());
        Check("iso.HH", IsoMath.HH == ic.GetProperty("HH").GetDouble());
        Check("iso.WZ", IsoMath.WZ == ic.GetProperty("WZ").GetDouble());
        Check("iso.COLS", IsoMath.COLS == ic.GetProperty("COLS").GetInt32());
        Check("iso.ROWS", IsoMath.ROWS == ic.GetProperty("ROWS").GetInt32());

        // ---- worldToScreen ---- (wz omitted in JS -> JSON null -> 0)
        foreach (var c in root.GetProperty("worldToScreen").EnumerateArray())
        {
            var a = c.GetProperty("in");
            double wx = a[0].GetDouble(), wy = a[1].GetDouble();
            double wz = a[2].ValueKind == JsonValueKind.Null ? 0.0 : a[2].GetDouble();
            var (gx, gy) = IsoMath.WorldToScreen(wx, wy, wz);
            double ex = c.GetProperty("x").GetDouble(), ey = c.GetProperty("y").GetDouble();
            Check($"w2s({wx},{wy},{wz})", gx == ex && gy == ey, $"got ({gx:R},{gy:R}) exp ({ex:R},{ey:R})");
        }
        // ---- depthKey ---- (wz/depthBias omitted -> 0)
        foreach (var c in root.GetProperty("depthKey").EnumerateArray())
        {
            var e = c.GetProperty("in");
            double wx = e.GetProperty("wx").GetDouble(), wy = e.GetProperty("wy").GetDouble();
            double wz = e.TryGetProperty("wz", out var wzp) ? wzp.GetDouble() : 0.0;
            double db = e.TryGetProperty("depthBias", out var dbp) ? dbp.GetDouble() : 0.0;
            double got = IsoMath.DepthKey(wx, wy, wz, db), exp = c.GetProperty("out").GetDouble();
            Check($"depthKey({wx},{wy},{wz},{db})", got == exp, $"got {got:R} exp {exp:R}");
        }
        // ---- trauma add / decay / offset / seq ---- (V8<->.NET parity; exact ==, never loosen Math.pow)
        foreach (var c in root.GetProperty("trauma_add").EnumerateArray())
        {
            double t = c.GetProperty("t").GetDouble(), mag = c.GetProperty("mag").GetDouble(), exp = c.GetProperty("out").GetDouble();
            var m = new TraumaModel { Trauma = t }; m.Add(mag);
            Check($"trauma.add({t},{mag})", m.Trauma == exp, $"got {m.Trauma:R} exp {exp:R}");
        }
        foreach (var c in root.GetProperty("trauma_decay").EnumerateArray())
        {
            double t = c.GetProperty("t").GetDouble(), dt = c.GetProperty("dt").GetDouble(), exp = c.GetProperty("out").GetDouble();
            var m = new TraumaModel { Trauma = t }; m.Decay(dt);
            Check($"trauma.decay({t},{dt})", m.Trauma == exp, $"got {m.Trauma:R} exp {exp:R}");
        }
        foreach (var c in root.GetProperty("trauma_offset").EnumerateArray())
        {
            double t = c.GetProperty("t").GetDouble(), exp = c.GetProperty("out").GetDouble();
            var m = new TraumaModel { Trauma = t };
            Check($"trauma.offset({t})", m.OffsetPx == exp, $"got {m.OffsetPx:R} exp {exp:R}");
        }
        {
            var sq = root.GetProperty("trauma_seq");
            double add = sq.GetProperty("add").GetDouble(), dt = sq.GetProperty("dt").GetDouble();
            int steps = sq.GetProperty("steps").GetInt32();
            var vals = sq.GetProperty("vals");
            var m = new TraumaModel(); m.Add(add);
            Check("trauma.seq[0]", m.Trauma == vals[0].GetDouble(), $"got {m.Trauma:R} exp {vals[0].GetDouble():R}");
            for (int i = 0; i < steps; i++)
            {
                m.Decay(dt);
                Check($"trauma.seq[{i + 1}]", m.Trauma == vals[i + 1].GetDouble(), $"got {m.Trauma:R} exp {vals[i + 1].GetDouble():R}");
            }
        }

        Console.WriteLine($"\nCore/Math bit-exact: {_pass} passed, {_fail} failed.");
        return _fail == 0 ? 0 : 1;
    }
}
