/* =====================================================================
   StyleForge · species-data.js
   Shared harness glue: engine bootstrap stub, the species registry, the
   palette registry (pulled live from GAME.Config.FORMS) and the sprite
   constants every style module bakes against.

   LOAD ORDER: after ../../js/{config,utils,iso,assets}.js, BEFORE the
   style modules. It creates window.STYLEFORGE so the style files can do
   `window.STYLEFORGE = window.STYLEFORGE || { styles: {} }` and register.

   IMPORTANT: the STYLE MODULES DO NOT DEPEND ON THIS FILE. They read only
   window.GAME.Utils (U.shade / U.clamp / U.lerp), so the winning module can
   be dropped straight into the game's archetype dispatch with no harness
   baggage. Everything here is preview-only scaffolding.
   ===================================================================== */
window.GAME = window.GAME || {};
window.STYLEFORGE = window.STYLEFORGE || { styles: {} };

(function (G, SF) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. Engine bootstrap stub                                            *
   *                                                                     *
   * assets.js reads the render device-pixel-ratio LAZILY at bake time via
   * `G.dpr` (assets.js:47 `dpr()` → clamp(G.dpr, 1, 3), default 2). game.js
   * normally sets it on resize; there is no game.js here, so pin it to 1 so
   * every baked building canvas is 1 device px per CSS px and the
   * nearest-neighbour blits stay honest. Nothing else in
   * config/utils/iso/assets touches the DOM at IIFE time (iso.js only reads
   * devicePixelRatio inside camera.resize(), which we never call).
   * ------------------------------------------------------------------ */
  if (typeof G.dpr !== 'number') G.dpr = 1;

  /* ------------------------------------------------------------------ *
   * 2. Sprite contract constants (must match entities.js:330-332)        *
   * ------------------------------------------------------------------ */
  SF.SPR_W = 150;
  SF.SPR_H = 168;
  SF.ANCHOR_X = SF.SPR_W * 0.5;    // 75
  SF.ANCHOR_Y = SF.SPR_H * 0.86;   // 144.48

  /* Facing table — verbatim from entities.js FACING_MAP (:336-345).
     0..4 are AUTHORED bases (S, SE, E, NE, N); 5..7 are engine-side
     mirror-X blits of 3, 2, 1. The harness reproduces the mirror exactly:
     translate(sx,0); scale(-1,1); translate(-sx,0) around the blit. */
  SF.FACING_MAP = [
    { base: 0, mir: false, label: 'S  (authored)' },
    { base: 1, mir: false, label: 'SE (authored)' },
    { base: 2, mir: false, label: 'E  (authored)' },
    { base: 3, mir: false, label: 'NE (authored)' },
    { base: 4, mir: false, label: 'N  (authored)' },
    { base: 3, mir: true, label: 'NW (MIRROR of NE)' },
    { base: 2, mir: true, label: 'W  (MIRROR of E)' },
    { base: 1, mir: true, label: 'SW (MIRROR of SE)' }
  ];

  SF.FSMS = ['idle', 'walk', 'attack'];

  /* ------------------------------------------------------------------ *
   * 3. Species registry                                                  *
   *                                                                      *
   * `shape` is the object handed to build() as the 5th arg. Every style
   * module dispatches on shape.species and owns its own geometry data
   * internally (the formats genuinely differ — box lists vs point lists),
   * so this registry stays deliberately thin: identity + the silhouette
   * class each species has to read as at a glance.
   * ------------------------------------------------------------------ */
  SF.SPECIES = [
    {
      key: 'trex',
      name: 'T-Rex',
      note: 'biped · long counterweight tail',
      shape: { species: 'trex', gait: 'biped', bulk: 1.0 }
    },
    {
      key: 'triceratops',
      name: 'Triceratops',
      note: 'quadruped · frill + 3 horns',
      shape: { species: 'triceratops', gait: 'quad', bulk: 1.08 }
    },
    {
      key: 'stegosaurus',
      name: 'Stegosaurus',
      note: 'quadruped · dorsal plate row',
      shape: { species: 'stegosaurus', gait: 'quad', bulk: 1.04 }
    }
  ];

  /* ------------------------------------------------------------------ *
   * 4. Palette registry — pulled live from Config.FORMS                  *
   *                                                                      *
   * These are the real shipping FORMS palettes, so "does this style hold
   * up under the dark 2014 grey AND the supernova violet?" is a real test
   * and not a mock. Falls back to a built-in copy if config.js is missing
   * a given id (so the page still renders rather than white-screening).
   * ------------------------------------------------------------------ */
  var WANT = [
    { id: 'gz2014', name: 'gz2014 · flat grey' },
    { id: 'burning', name: 'burning · ember' },
    { id: 'gvk', name: 'gvk · blue' },
    { id: 'gxk', name: 'gxk · magenta' },
    { id: 'mecha_3', name: 'mecha_3 · steel' },
    { id: 'supernova', name: 'supernova · violet' }
  ];

  var FALLBACK = {
    skin: '#3c3c3c', skinDark: '#2b2b2b', skinLight: '#646464',
    plate: '#2b2b2b', plateEdge: '#8fc2ee', plateGlow: 'rgba(70,160,235,0.45)',
    eye: '#e8e8e8'
  };

  function formById(id) {
    var F = (G.Config && G.Config.FORMS) || [];
    for (var i = 0; i < F.length; i++) if (F[i].id === id) return F[i];
    return null;
  }

  SF.PALETTES = (function () {
    var out = [];
    for (var i = 0; i < WANT.length; i++) {
      var f = formById(WANT[i].id);
      if (!f || !f.palette) continue;         // silently skip ids this build doesn't have
      out.push({ id: WANT[i].id, name: WANT[i].name, palette: f.palette });
    }
    if (!out.length) out.push({ id: 'fallback', name: 'fallback (Config.FORMS missing)', palette: FALLBACK });
    return out;
  })();

  /* Guarantee the five keys every style module is contractually allowed to
     read. A FORMS palette that omits e.g. plateEdge would otherwise draw
     `undefined` into fillStyle and silently no-op. */
  SF.normalizePalette = function (p) {
    var q = {};
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) q[k] = p[k];
    if (!q.skin) q.skin = FALLBACK.skin;
    if (!q.skinDark) q.skinDark = FALLBACK.skinDark;
    if (!q.skinLight) q.skinLight = FALLBACK.skinLight;
    if (!q.plate) q.plate = q.skinDark;
    if (!q.plateEdge) q.plateEdge = q.skinLight;
    if (!q.eye) q.eye = FALLBACK.eye;
    return q;
  };

  /* ------------------------------------------------------------------ *
   * 5. City backdrop descriptors (the clash test)                        *
   *                                                                      *
   * Real Assets.buildingSprite() prisms — the exact drawPrismBuilding
   * 0.74 / 1.12 / 1.32 three-flat-tone language the creature has to sit
   * inside without looking pasted on. Offsets are in sprite-space CSS px
   * relative to the creature's ground anchor.
   * ------------------------------------------------------------------ */
  SF.CITY = [
    /* a low wide block just off the creature's left shoulder, a tall tower
       clear on the right, and a HALF-SMASHED (frac 0.45 -> damage stage 2)
       block deliberately drawn IN FRONT so the creature has to survive being
       overlapped by the city's own tone language, not just sit beside it. */
    { tier: 2, w: 2, frac: 1.00, dx: -118, dy: -6, behind: true },
    { tier: 7, w: 1, frac: 1.00, dx: 112, dy: -18, behind: true },
    { tier: 4, w: 1, frac: 0.45, dx: 62, dy: 18, behind: false }
  ];

  /* Bake one CITY descriptor into a canvas via the REAL game code path.
     Returns null if assets.js isn't present (page must still work). */
  SF.cityCanvas = function (d) {
    if (!G.Assets || typeof G.Assets.buildingSprite !== 'function') return null;
    try {
      return G.Assets.buildingSprite({
        tier: d.tier,
        footprint: { w: d.w },
        hp: d.frac * 100,
        maxHp: 100
      });
    } catch (e) {
      return null;
    }
  };

  /* ------------------------------------------------------------------ *
   * 6. Bake-cost projection constants (roster the game actually ships)   *
   * ------------------------------------------------------------------ */
  SF.PROJECTION = { facings: 5, states: 13, species: 13 };  // 5 × 13 × 13 = 845 bakes

})(window.GAME, window.STYLEFORGE);
