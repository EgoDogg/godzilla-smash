/* GAME.Env — day/night cycle + toast announcements.
 *
 * Contract (v3-build-contract §2):
 *   GAME.Env.update(dtMs)    — advance the day clock; call once per sim step from game.js.
 *   GAME.Env.phase()         — returns interpolated sky/tint/celestial/ambient for render.js.
 *   GAME.Env.announce(text)  — drives the existing #toast element from index.html.
 *
 * Clock: a scalar t in [0, 1) cycling over Config.ENV.dayLengthMs.
 *   t = 0.0  → midnight (darkest)
 *   t = 0.25 → dawn
 *   t = 0.5  → noon (brightest)
 *   t = 0.75 → dusk
 *
 * Reads: GAME.Config.ENV  { dayLengthMs, day:{sky,sun,tint,ambient}, night:{sky,moon,tint,ambient} }
 * Writes: nothing outside this module except the #toast DOM element.
 * Deps:   none (zero imports — runs before render.js).
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------
  var _t = 0;              // day-clock scalar [0, 1)
  var _toastEl = null;     // cached #toast reference (looked up lazily)
  var _toastTimer = null;  // setTimeout handle for hide

  // ---------------------------------------------------------------------------
  // Color helpers — parse '#rrggbb' and lerp between two hex colors.
  // No per-frame allocation beyond a short return string.
  // ---------------------------------------------------------------------------
  function parseHex(h) {
    // Normalise: strip '#', expand 3-char shorthand to 6 chars.
    h = (h || '#000000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function lerpHex(a, b, t) {
    var ca = parseHex(a);
    var cb = parseHex(b);
    var r = (ca[0] + (cb[0] - ca[0]) * t) | 0;
    var gn = (ca[1] + (cb[1] - ca[1]) * t) | 0;
    var bl = (ca[2] + (cb[2] - ca[2]) * t) | 0;
    return 'rgb(' + r + ',' + gn + ',' + bl + ')';
  }

  // Parse a CSS rgba/rgb alpha from a tint string like 'rgba(18,28,66,0.30)'.
  // Returns the alpha channel only (0..1). Falls back to 0 if none.
  function parseTintAlpha(tintStr) {
    if (!tintStr) return 0;
    var m = tintStr.match(/rgba?\s*\([^)]*,\s*([\d.]+)\s*\)/);
    return m ? parseFloat(m[1]) : 0;
  }

  // Parse the RGB part of a tint string 'rgba(r,g,b,a)' → 'r,g,b'.
  // Falls back to '0,0,0' so rgba construction always works.
  function parseTintRGB(tintStr) {
    if (!tintStr) return '0,0,0';
    var m = tintStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return m ? (m[1] + ',' + m[2] + ',' + m[3]) : '0,0,0';
  }

  // ---------------------------------------------------------------------------
  // dayness(t) — smooth scalar 0..1 indicating how "daytime" the current moment
  // is.  Uses a smoothstep-shaped cosine so transitions are gentle rather than
  // linear.  Peak (1.0) at t=0.5 (noon), trough (0.0) at t=0.0 / t=1.0 (midnight).
  // ---------------------------------------------------------------------------
  function dayness(t) {
    // cos maps: t=0 → cos(π)=-1, t=0.5 → cos(0)=+1, t=1 → cos(2π)=+1 (wraps).
    // Normalise to [0,1]: (1 + cos(2πt - π)) / 2  =  (1 - cos(2πt)) / 2.
    var raw = (1 - Math.cos(Math.PI * 2 * t)) * 0.5;
    // Apply a mild gamma to tighten the midday plateau and deepen the night valley.
    return Math.pow(raw, 0.7);
  }

  // ---------------------------------------------------------------------------
  // update(dtMs) — advance clock; call every sim step.
  // ---------------------------------------------------------------------------
  function update(dtMs) {
    var cfg = (G.Config && G.Config.ENV) || {};
    var period = cfg.dayLengthMs || 120000;
    _t = (_t + dtMs / period) % 1;
    if (_t < 0) _t = 0;
  }

  // ---------------------------------------------------------------------------
  // phase() — interpolate between Config.ENV.day and Config.ENV.night.
  // Returns:
  //   sky      [topColor, botColor]  — gradient endpoints for the sky fill.
  //   tint     'rgba(r,g,b,a)'       — full-screen ambient overlay colour.
  //   ambient  number 0..1           — global brightness scalar (render may apply).
  //   sun?     { color, alpha }      — present when sun is visible (day half).
  //   moon?    { color, alpha }      — present when moon is visible (night half).
  // ---------------------------------------------------------------------------
  function phase() {
    var cfg = (G.Config && G.Config.ENV) || {};
    var D = cfg.day   || { sky: ['#1a3a6e', '#4f8fe0'], sun:  '#fff3c0', tint: 'rgba(255,250,220,0)', ambient: 1 };
    var N = cfg.night || { sky: ['#05070f', '#142a55'], moon: '#cfe0ff', tint: 'rgba(18,28,66,0.30)',  ambient: 0.6 };

    var dn = dayness(_t);          // 0=full night, 1=full day
    var ni = 1 - dn;               // inverse for night weight

    // Sky: lerp top and bottom colour stops independently.
    var dSky  = D.sky || ['#1a3a6e', '#4f8fe0'];
    var nSky  = N.sky || ['#05070f', '#142a55'];
    var skyTop = lerpHex(nSky[0], dSky[0], dn);
    var skyBot = lerpHex(nSky[1], dSky[1], dn);

    // Tint: lerp the alpha channel; keep the dominant colour for each half.
    // We cross-fade: day tint fades in with dn, night tint fades in with ni.
    var dAlpha = parseTintAlpha(D.tint) * dn;
    var nAlpha = parseTintAlpha(N.tint) * ni;
    // Blend the RGB channels too so mixed tones look right at transitions.
    var dRgb   = parseTintRGB(D.tint);
    var nRgb   = parseTintRGB(N.tint);
    // Choose the weightier tint as the dominant colour; mix by their alphas.
    var totalA = dAlpha + nAlpha;
    var tintRgb, tintA;
    if (totalA < 0.001) {
      tintRgb = nRgb;
      tintA   = 0;
    } else {
      var tD   = dAlpha / totalA;
      var tN   = nAlpha / totalA;
      var dParts = dRgb.split(',').map(Number);
      var nParts = nRgb.split(',').map(Number);
      var mr   = ((dParts[0] * tD + nParts[0] * tN) | 0);
      var mg   = ((dParts[1] * tD + nParts[1] * tN) | 0);
      var mb   = ((dParts[2] * tD + nParts[2] * tN) | 0);
      tintRgb  = mr + ',' + mg + ',' + mb;
      tintA    = Math.min(1, totalA);
    }
    var tintStr = 'rgba(' + tintRgb + ',' + (Math.round(tintA * 100) / 100) + ')';

    // Ambient brightness: lerp between night.ambient and day.ambient.
    var dayAmb  = (D.ambient != null) ? D.ambient : 1.0;
    var nightAmb= (N.ambient != null) ? N.ambient : 0.6;
    var ambient = nightAmb + (dayAmb - nightAmb) * dn;

    // Celestial bodies: sun visible during the day half (dn > 0), moon during night (ni > 0).
    // Alpha ramps through a narrow band so they don't linger too long at twilight.
    var result = {
      sky:     [skyTop, skyBot],
      tint:    tintStr,
      ambient: ambient
    };

    // Sun — peaks at noon (t=0.5), hidden at t=0/1.
    // Clamp alpha: only show above dn threshold to avoid a faint ghost during deep night.
    var sunAlpha = Math.max(0, (dn - 0.15) / 0.85);   // fade-in starts when dn > 0.15
    sunAlpha = Math.pow(sunAlpha, 0.6);                // ease the ramp
    if (sunAlpha > 0.01) {
      result.sun = {
        color: D.sun || '#fff3c0',
        alpha: sunAlpha
      };
    }

    // Moon — peaks at midnight, hidden at noon.
    var moonAlpha = Math.max(0, (ni - 0.15) / 0.85);
    moonAlpha = Math.pow(moonAlpha, 0.6);
    if (moonAlpha > 0.01) {
      result.moon = {
        color: N.moon || '#cfe0ff',
        alpha: moonAlpha
      };
    }

    // Convenience: expose the raw clock for callers that want to compute their own curves.
    result.t = _t;

    return result;
  }

  // ---------------------------------------------------------------------------
  // announce(text) — flash a toast notification using the existing #toast element.
  //
  // The element must already exist in the DOM (it is defined in index.html with
  // transitions on opacity + transform).  We add/remove the CSS class 'show'
  // to trigger those transitions.  A pending hide is cancelled so rapid calls
  // never leave a stale message.
  // ---------------------------------------------------------------------------
  function announce(text) {
    if (!_toastEl) {
      _toastEl = document.getElementById('toast');
    }
    if (!_toastEl) return;   // DOM not ready or element removed — silent no-op.

    // Cancel any in-progress hide timer.
    if (_toastTimer !== null) {
      clearTimeout(_toastTimer);
      _toastTimer = null;
    }

    _toastEl.textContent = text;
    _toastEl.classList.add('show');

    // Auto-hide after 2.5 s.
    _toastTimer = setTimeout(function () {
      if (_toastEl) _toastEl.classList.remove('show');
      _toastTimer = null;
    }, 2500);
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  G.Env = {
    update:   update,
    phase:    phase,
    announce: announce
  };

})(window.GAME);
