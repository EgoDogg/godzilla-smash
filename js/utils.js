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
  function trim(x) { return (Math.round(x * 10) / 10).toString(); }
  U.fmt = function (n) {
    n = Math.max(0, Math.floor(n));
    if (n >= 1e12) return trim(n / 1e12) + 'T';
    if (n >= 1e9) return trim(n / 1e9) + 'B';
    if (n >= 1e6) return trim(n / 1e6) + 'M';
    if (n >= 1e3) return trim(n / 1e3) + 'k';
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

  // prefers-reduced-motion (read once; modules cut shake/particles when true).
  U.reducedMotion = (function () {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  })();

  G.Utils = U;
})(window.GAME);
