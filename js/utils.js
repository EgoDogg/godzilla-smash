/* GAME.Utils — shared pure helpers. Deps: Config (optional). */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';
  const U = {};

  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };

  // Clamp a 2D vector to a max length (returns a fresh {x,y}).
  U.clampLen = function (x, y, max) {
    const m = Math.hypot(x, y);
    if (m > max && m > 0) { const k = max / m; return { x: x * k, y: y * k }; }
    return { x: x, y: y };
  };

  // Compact number formatting up to trillions (handles 12B+ cleanly).
  // W0.1 KAIJU RESCALE: the `k` threshold moved 1e3 → 1e5. The whole economy now lives in the
  // $60–$2500 band, where abbreviating destroys the number people are actually reading — a $1330
  // price rendered as "1.3k" is both less precise AND harder to compare against a $1250 balance.
  // Below 1e5 we print the exact integer. M/B/T are kept: nothing reaches them today, but combo
  // stacking and any future world could, and a silently-wrong wide number is worse than a
  // needlessly-precise one. (No thousands separators — the HUD's fixed-width badges are tight.)
  function trim(x) { return (Math.round(x * 10) / 10).toString(); }
  U.fmt = function (n) {
    n = Math.max(0, Math.floor(n));
    if (n >= 1e12) return trim(n / 1e12) + 'T';
    if (n >= 1e9) return trim(n / 1e9) + 'B';
    if (n >= 1e6) return trim(n / 1e6) + 'M';
    if (n >= 1e5) return trim(n / 1e3) + 'k';
    return '' + n;
  };

  // Lighten/darken a #hex by factor f (>1 lighter, <1 darker) → 'rgb(...)'. Ported from v1.
  U.shade = function (hex, f) {
    const c = ('' + hex).replace('#', '');
    const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c, 16);
    const r = U.clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
    const g = U.clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
    const b = U.clamp(Math.round((n & 255) * f), 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  };

  // Integer hash (for deterministic per-building variation).
  U.hash = function (x) {
    x = x | 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = x ^ (x >>> 16);
    return x >>> 0;
  };

  // Seeded RNG (mulberry32) → function returning [0,1).
  U.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Robust localStorage wrappers.
  U.safeLoad = function (key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  };
  U.safeSave = function (key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  };

  // UTF-8 bytes of a string (TextEncoder where available).
  U.utf8 = function (str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else if (c >= 0xd800 && c <= 0xdbff) {
        const c2 = str.charCodeAt(++i), u = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
        out.push(0xf0 | (u >> 18), 0x80 | ((u >> 12) & 0x3f), 0x80 | ((u >> 6) & 0x3f), 0x80 | (u & 0x3f));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return out;
  };

  // CRC32 over a string's UTF-8 bytes → 8-char lowercase hex (export-code corruption detection).
  U.crc32 = function (str) {
    const bytes = U.utf8(str);
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
  };

  // base64url of a UNICODE string (TextEncoder/TextDecoder — never btoa(JSON), which mangles emoji).
  U.b64u = {
    enc: function (str) {
      const bytes = U.utf8(str);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec: function (s) {
      let b64 = ('' + s).replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return (typeof TextDecoder !== 'undefined') ? new TextDecoder().decode(bytes) : decodeURIComponent(escape(bin));
    }
  };

  // prefers-reduced-motion (read once; modules cut shake/particles when true).
  U.reducedMotion = (function () {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  })();

  G.Utils = U;
})(window.GAME);
