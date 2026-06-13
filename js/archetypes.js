/* =====================================================================
   GAME.Archetypes  ·  js/archetypes.js
   Loads AFTER assets.js, BEFORE entities.js.

   Exposes GAME.Archetypes.build(ctx, w, h, pal, shape, base, frame, fsm)
   which dispatches on shape.archetype to one of:
     buildWyrm  — Godzilla-family (extracted verbatim from entities.js buildBody,
                  parameterised by shape.plates / shape.tail / shape.bulk)
     buildFlyer — Mothra / Rodan (wings + light body, no dorsal plates)
     buildHydra — Ghidorah (wyrm body + N looped heads + fan tail;
                  shape.mech:true adds steel paneling over the body)
     buildMecha — Mechagodzilla (wyrm silhouette → flat panels + seam strokes
                  + rivet dots + hard specular edge + laser eye)

   All share the same procedural style as buildWyrm: gradient-AO torso,
   rim-light stroke, baked plate glow (for wyrm/hydra), contact ellipse.
   Facing convention, mirror-X, bakeOrGet / ANCHOR_X / ANCHOR_Y are
   all owned by entities.js; we only author the pixels for one frame.

   Dependencies: GAME.Config, GAME.Utils only (zero DOM, zero Assets calls
   — those live in entities.js). Canvas2D + ES2020.
   ===================================================================== */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Cfg = G.Config;
  var U   = G.Utils;

  /* tiny local helpers -------------------------------------------------- */
  function lerp(a, b, t)  { return a + (b - a) * t; }
  function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }

  /* ======================================================================
     ART HOUSE STYLE — shared primitives (visual-redesign-plan.md §1).
     ADDED in ARTP1 as the scaffolding the v17-v20 family rewrites consume
     (ARTP2 wyrm, ARTP3 mecha, ARTP4 ghidorah, FLYERMEGA flyers). They draw
     nothing on their own yet; this unit only wires the RIM token into the two
     existing house-rim strokes (behavior-identical) so the roster collapses to
     ONE specular token going forward.

     §1.6 BAKE GUARDRAILS (every builder MUST obey — these bake to a static sprite):
       • NO shadowBlur / ctx.filter / globalCompositeOperation in any builder.
         "soft glow/halo" = createRadialGradient(color→transparent) at normal alpha;
         "additive/incandescent/hot" = an OPAQUE bright color over a dark body.
       • Idle bakes frame=0 only — anything keyed to `frame`/`walkT` freezes at its
         frame-0 value; bake energized effects at a static mid-value, defer real
         animation to the live entities.js drawGlow overlay.
       • Fixed canvas SPR_W=150 SPR_H=168, anchor (75,144.5) — bounds-check heavy forms.
       • No retained Path2D; a full-silhouette rim must re-issue the torso path.
       • Per-index jitter uses the deterministic hash() below (no RNG state).
     ====================================================================== */

  // §1.1 — ONE key light for the whole roster: a single neutral warm-white specular/rim
  // token. Alpha varies by use (house back-edge rim 0.20-0.22 §1.2; self-illum rim ~0.5).
  // Collapses the old rgba(255,250,235,*) literals + mecha pal.skinLight-as-specular +
  // ghidorah #fffbe0 into this one token (the per-form specular swaps land in their phases).
  var RIM_RGB = '255,250,235';
  function rimCol(a) { return 'rgba(' + RIM_RGB + ',' + a + ')'; }

  // §1.6 — deterministic GLSL hash for per-index jitter (plate width/lean, crack seeds,
  // thorn placement). Pure arithmetic, no RNG state; stable across frames/facings. Returns [0,1).
  function hash(i) { var s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); }

  // §1.7 — shared pointed dorsal/cranial element: a dark CORE triangle drawn BEHIND a lit
  // FACE triangle, so the figure-ground separation survives on the baked sprite where the live
  // glow is absent. Reused for wyrm dorsal plates, mecha dorsal spines, ghidorah horn-crown
  // prongs — one separation model for every pointed feature. x,y = base center; size = height;
  // lean = apex horizontal offset as a fraction of size (toward the facing dir). coreCol null
  // → face only (a plain plate). Pure fills (no stroke/composite) per §1.6.
  function drawRidgeElement(ctx, x, y, size, lean, faceCol, coreCol, widthMul) {
    var halfW = size * 0.42 * (widthMul != null ? widthMul : 1);   // ARTP2: independent width (razor vs blunt)
    var apexX = x + lean * size;        // lean shifts the tip toward the facing direction
    var apexY = y - size;
    if (coreCol) {                      // CORE: a wider/taller dark triangle behind the face
      ctx.fillStyle = coreCol;
      ctx.beginPath();
      ctx.moveTo(x - halfW * 1.30, y + size * 0.14);
      ctx.lineTo(apexX + lean * size * 0.18, apexY - size * 0.12);
      ctx.lineTo(x + halfW * 1.30, y + size * 0.14);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = faceCol;            // FACE: the lit triangle on top
    ctx.beginPath();
    ctx.moveTo(x - halfW, y);
    ctx.lineTo(apexX, apexY);
    ctx.lineTo(x + halfW, y);
    ctx.closePath(); ctx.fill();
  }

  // §1.7 — branching glowing cracks across chest/belly/thigh. A wider faint under-stroke
  // (glowCol) beneath a bright OPAQUE core stroke (coreCol) so it reads incandescent on the
  // baked sprite with no additive compositing (§1.6); core lineWidth 2.6 clears the 2px floor
  // (§1.4). Deterministic per-index seeds (stable across frames). intensity ~0..1 scales count
  // (burning ~0.5 → 5 seams, supernova ~1.0 → 8). Suppressed facing away (drawn on the back §2.3).
  function drawFissures(ctx, BH, BW, fg, coreCol, glowCol, intensity) {
    if (fg && fg.show === 'back') return;
    var n = Math.max(3, Math.round(4 + (intensity != null ? intensity : 0.5) * 4));
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < n; i++) {
      var hx = hash(i * 2.0 + 1.0), hy = hash(i * 3.0 + 7.0), hl = hash(i * 5.0 + 3.0);
      var sx = lerp(-BW * 0.26, BW * 0.30, hx);
      var sy = lerp(-BH * 0.74, -BH * 0.22, hy);
      var len = (0.16 + hl * 0.18) * BH;
      var ang = (hx - 0.5) * 1.4 + Math.PI * 0.5;       // mostly vertical, jittered
      var mx = sx + Math.cos(ang) * len * 0.5 + (hl - 0.5) * BW * 0.10;
      var my = sy + Math.sin(ang) * len * 0.5;
      var ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
      ctx.strokeStyle = glowCol; ctx.lineWidth = 5.0;   // wider faint under-stroke
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.strokeStyle = coreCol; ctx.lineWidth = 2.6;   // bright opaque core (>=2.2px)
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    }
    ctx.restore();
  }

  /* sprite canvas geometry — MUST match entities.js constants exactly so
     blit anchor alignment is identical when entities.js calls our builders. */
  var SPR_W    = 150;
  var SPR_H    = 168;
  var ANCHOR_X = SPR_W * 0.5;   // 75
  var ANCHOR_Y = SPR_H * 0.86;  // ~144.5

  /* ======================================================================
     SHARED GEOMETRY HELPERS — copied verbatim from entities.js so behaviour
     is pixel-identical whether entities.js or archetypes.js draws the frame.
     ====================================================================== */

  /* Facing-dependent geometry. base: 0 S, 1 SE, 2 E, 3 NE, 4 N. */
  function facingGeom(base) {
    switch (base) {
      case 0:
        return { dir: 0.0, headX: 0.0, headFwd: 0.0, snout: 0.10, plateLean: 0.0,
                 farLegX: -0.22, nearLegX: 0.22, farArmX: -0.30, nearArmX: 0.30,
                 bellyX: 0.0, tailDir: -1, show: 'front', headScale: 1.06 };
      case 1:
        return { dir: 0.6, headX: 0.16, headFwd: 0.22, snout: 0.30, plateLean: 0.18,
                 farLegX: -0.26, nearLegX: 0.18, farArmX: -0.22, nearArmX: 0.34,
                 bellyX: 0.10, tailDir: -1, show: 'front', headScale: 1.0 };
      case 2:
        return { dir: 1.0, headX: 0.30, headFwd: 0.40, snout: 0.46, plateLean: 0.30,
                 farLegX: -0.18, nearLegX: 0.20, farArmX: -0.10, nearArmX: 0.34,
                 bellyX: 0.16, tailDir: -1, show: 'side', headScale: 0.96 };
      case 3:
        return { dir: 0.7, headX: 0.18, headFwd: 0.20, snout: 0.24, plateLean: 0.42,
                 farLegX: -0.20, nearLegX: 0.22, farArmX: -0.30, nearArmX: 0.26,
                 bellyX: 0.06, tailDir: 1, show: 'back34', headScale: 0.9 };
      default: /* 4 N */
        return { dir: 0.0, headX: 0.0, headFwd: 0.0, snout: 0.0, plateLean: 0.55,
                 farLegX: -0.22, nearLegX: 0.22, farArmX: -0.30, nearArmX: 0.30,
                 bellyX: 0.0, tailDir: 1, show: 'back', headScale: 0.72 };
    }
  }

  function drawTail(ctx, BH, BW, fg, dark) {
    var d = fg.tailDir;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(d * BW * 0.10, -BH * 0.30);
    ctx.quadraticCurveTo(d * BW * 0.85, -BH * 0.40, d * BW * 1.25, -BH * 0.06);
    ctx.quadraticCurveTo(d * BW * 1.12, BH * 0.02, d * BW * 0.95, -BH * 0.05);
    ctx.quadraticCurveTo(d * BW * 0.55, -BH * 0.20, d * BW * 0.08, -BH * 0.16);
    ctx.closePath(); ctx.fill();
  }

  function drawLeg(ctx, x, BH, BW, swing, fg, wMul) {
    var w = BH * 0.075 * (wMul != null ? wMul : 1);   // wMul: wyrm elephantine pads §2.1 (hydra/mecha default 1)
    var lift    = -swing * BH * 0.05;
    var footFwd =  swing * BW * 0.10;
    ctx.beginPath();
    ctx.moveTo(x - w, -BH * 0.34);
    ctx.quadraticCurveTo(x - w * 1.1, -BH * 0.15 + lift, x - w * 0.8 + footFwd, -BH * 0.02 + lift);
    ctx.lineTo(x - w * 0.85 + footFwd, lift);
    ctx.lineTo(x + w * 1.5  + footFwd, lift);
    ctx.quadraticCurveTo(x + w * 1.1 + footFwd, -BH * 0.05 + lift, x + w, -BH * 0.14 + lift);
    ctx.quadraticCurveTo(x + w * 1.1, -BH * 0.27, x + w * 0.85, -BH * 0.34);
    ctx.closePath(); ctx.fill();
  }

  function drawArm(ctx, x, y, BH, BW, fg, side, atk, wMul) {
    var w     = BH * 0.040 * (wMul != null ? wMul : 1);   // wMul: wyrm widens the vestigial arms §2.1 (mecha default 1)
    var reach = (side > 0) ? atk * BW * 0.28 : atk * BW * 0.06;
    var drop  = (side > 0) ? (BH * 0.14 - atk * BH * 0.05) : BH * 0.13;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x + w * 2.4 + reach, y + BH * 0.02, x + w * 2.1 + reach, y + drop);
    ctx.lineTo(x + w * 0.9 + reach * 0.7, y + drop + BH * 0.004);
    ctx.quadraticCurveTo(x - w * 0.2, y + BH * 0.05, x - w, y);
    ctx.closePath(); ctx.fill();
  }

  /* widthMul (default 1): horizontal narrowing — WYRM-ONLY (gvk warrior §2.4). hydra passes
     nothing so its torso is byte-identical. rimGlow (default null): §1.2 self-illumination rim
     — re-strokes the FULL torso outline in the form's aura color (burning/gxk/supernova). */
  function drawTorso(ctx, BH, BW, fg, skin, dark, light, widthMul, rimGlow) {
    var lean = fg.dir;
    ctx.save();
    if (widthMul != null && widthMul !== 1) ctx.scale(widthMul, 1);
    var bg = ctx.createLinearGradient(0, -BH * 0.9, 0, -BH * 0.1);
    bg.addColorStop(0, light); bg.addColorStop(0.5, skin); bg.addColorStop(1, dark);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-BW * 0.36, -BH * 0.30);
    ctx.quadraticCurveTo(-BW * 0.50, -BH * 0.68, -BW * 0.14, -BH * 0.80);
    ctx.quadraticCurveTo( BW * 0.04, -BH * 0.88,  BW * (0.22 + lean * 0.06), -BH * 0.82);
    ctx.quadraticCurveTo( BW * (0.40 + lean * 0.10), -BH * 0.78, BW * (0.46 + lean * 0.08), -BH * 0.62);
    ctx.quadraticCurveTo( BW * (0.56 + lean * 0.06), -BH * 0.46, BW * (0.46 + lean * 0.04), -BH * 0.30);
    ctx.quadraticCurveTo( BW * 0.40, -BH * 0.13, BW * 0.08, -BH * 0.13);
    ctx.quadraticCurveTo(-BW * 0.18, -BH * 0.13, -BW * 0.36, -BH * 0.30);
    ctx.closePath(); ctx.fill();
    /* §1.1 house rim on the back/top edge */
    ctx.strokeStyle = rimCol(0.22); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-BW * 0.14, -BH * 0.80);
    ctx.quadraticCurveTo( BW * 0.04, -BH * 0.88, BW * (0.22 + lean * 0.06), -BH * 0.82);
    ctx.quadraticCurveTo( BW * (0.40 + lean * 0.10), -BH * 0.78, BW * (0.46 + lean * 0.08), -BH * 0.62);
    ctx.stroke();
    /* §1.2 self-illumination rim — full silhouette outline in the aura hue (granted forms) */
    if (rimGlow) {
      ctx.strokeStyle = rimGlow; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(-BW * 0.36, -BH * 0.30);
      ctx.quadraticCurveTo(-BW * 0.50, -BH * 0.68, -BW * 0.14, -BH * 0.80);
      ctx.quadraticCurveTo( BW * 0.04, -BH * 0.88,  BW * (0.22 + lean * 0.06), -BH * 0.82);
      ctx.quadraticCurveTo( BW * (0.40 + lean * 0.10), -BH * 0.78, BW * (0.46 + lean * 0.08), -BH * 0.62);
      ctx.quadraticCurveTo( BW * (0.56 + lean * 0.06), -BH * 0.46, BW * (0.46 + lean * 0.04), -BH * 0.30);
      ctx.quadraticCurveTo( BW * 0.40, -BH * 0.13, BW * 0.08, -BH * 0.13);
      ctx.quadraticCurveTo(-BW * 0.18, -BH * 0.13, -BW * 0.36, -BH * 0.30);
      ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* Broken-slate dorsal ridge (ARTP2, visual-redesign-plan §2.1). Keeps the original
     sine-arc placement, but each plate is a drawRidgeElement (dark pal.plate CORE behind a
     lit pal.skinLight FACE — figure-ground that survives baking) with DETERMINISTIC per-index
     hash jitter on width/height/lean (±0.25·jag) so the row reads as irregular broken slate,
     not uniform triangles. opts (all optional, defaults = a gentle baseline):
       jag       0..1   jaggedness: jitter magnitude + razor narrowing + height boost (escalation knob)
       heightMul        per-form plate-height scalar (gz2014 0.85 … supernova 1.4)
       broken    int    N battle-scar plates rendered ~50% height (gvk)
       faceGrad  bool    hot 2-stop face gradient base→tip (burning incandescent plates)
     glowPass=true keeps the additive live-overlay triangle (archetypes fallback path). */
  function drawPlates(ctx, BH, BW, fg, pal, glowPass, shimmer, N, opts) {
    if (N == null) N = 9;
    opts = opts || {};
    var jag       = opts.jag != null ? opts.jag : 0.45;
    var heightMul = opts.heightMul != null ? opts.heightMul : 1.0;
    var broken    = opts.broken | 0;
    var lean = fg.plateLean;
    var core = pal.plate || pal.skinDark;
    // pick `broken` deterministic interior indices for the gvk battle-scar (skip ends)
    var brokenSet = null;
    if (broken > 0) {
      brokenSet = {};
      for (var b = 0; b < broken; b++) brokenSet[1 + Math.floor(hash(b * 7 + 2) * (N - 1))] = 1;
    }
    for (var i = 0; i <= N; i++) {
      var t     = i / N;
      var x     = lerp(BW * (0.24 - lean * 0.10), -BW * (0.52 + lean * 0.05), t);
      var y     = -(lerp(0.80, 0.36, t) + Math.sin(t * Math.PI) * 0.06) * BH;
      var arc   = (Math.sin(t * Math.PI) * 0.13 + 0.05) * BH;          // sine-arc base height
      var jH    = 1 + (hash(i * 2 + 3) - 0.5) * 0.5 * jag;             // ±0.25·jag height jitter
      var jW    = 1 + (hash(i + 1)     - 0.5) * 0.5 * jag;             // ±0.25·jag width jitter
      var jL    = (hash(i * 3 + 5) - 0.5) * 0.5 * jag;                 // lean jitter
      var size  = arc * heightMul * jH;
      if (brokenSet && brokenSet[i]) size *= 0.5;                      // battle-scar half-plate
      var widthMul = (1 - jag * 0.32) * jW;                           // higher jag → razor-narrow base
      var pLean = lean * 0.9 + jL;
      if (glowPass) {
        var a = 0.30 + 0.5 * (shimmer != null ? shimmer : 0.5) * Math.sin(t * Math.PI);
        ctx.globalAlpha = clamp(a, 0, 1);
        drawRidgeElement(ctx, x, y, size, pLean, pal.plateGlow, null, widthMul);
      } else {
        var faceCol = pal.skinLight;
        if (opts.faceGrad) {                                           // burning: hot base→tip gradient
          var g = ctx.createLinearGradient(0, y, 0, y - size);
          g.addColorStop(0, opts.faceGrad[0]); g.addColorStop(1, opts.faceGrad[1]);
          faceCol = g;
        }
        drawRidgeElement(ctx, x, y, size, pLean, faceCol, core, widthMul);
        // thin plateEdge keyline (kept; >=2px) for crisp separation on the lit side
        ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.42 * widthMul, y);
        ctx.lineTo(x + pLean * size, y - size);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawHead(ctx, BH, BW, fg, pal, atk) {
    if (fg.show === 'back') {
      ctx.fillStyle = pal.skinDark;
      ctx.beginPath();
      ctx.ellipse(0, -BH * 0.86, BW * 0.16, BH * 0.07, 0, 0, 6.2832);
      ctx.fill();
      return;
    }
    var hx = fg.headX * BW;
    var hs = fg.headScale;
    var mo = atk * BH * 0.05;
    var skin = pal.skin, dark = pal.skinDark;
    var sn = fg.snout;

    /* neck */
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(hx + BW * 0.10, -BH * 0.78);
    ctx.quadraticCurveTo(hx + BW * 0.30, -BH * 0.86, hx + BW * 0.42, -BH * 0.84);
    ctx.lineTo(hx + BW * 0.44, -BH * 0.68);
    ctx.quadraticCurveTo(hx + BW * 0.30, -BH * 0.66, hx + BW * 0.18, -BH * 0.66);
    ctx.closePath(); ctx.fill();

    /* skull + snout */
    ctx.beginPath();
    ctx.moveTo(hx + BW * 0.30, -BH * 0.84);
    ctx.quadraticCurveTo(hx + BW * 0.46,       -BH * 0.92 * hs, hx + BW * (0.40 + sn), -BH * 0.85);
    ctx.quadraticCurveTo(hx + BW * (0.52 + sn), -BH * 0.82, hx + BW * (0.52 + sn), -BH * 0.795);
    ctx.lineTo(hx + BW * (0.46 + sn), -BH * 0.785);
    ctx.quadraticCurveTo(hx + BW * 0.40, -BH * 0.78, hx + BW * 0.32, -BH * 0.79);
    ctx.quadraticCurveTo(hx + BW * 0.26, -BH * 0.80, hx + BW * 0.24, -BH * 0.81);
    ctx.closePath(); ctx.fill();

    /* lower jaw */
    ctx.beginPath();
    ctx.moveTo(hx + BW * 0.30, -BH * 0.775);
    ctx.quadraticCurveTo(hx + BW * (0.46 + sn), -BH * 0.745 + mo,       hx + BW * (0.50 + sn), -BH * 0.765 + mo * 0.6);
    ctx.quadraticCurveTo(hx + BW * (0.42 + sn), -BH * 0.725 + mo,       hx + BW * 0.30,         -BH * 0.745 + mo * 0.4);
    ctx.closePath(); ctx.fill();

    /* teeth when mouth open */
    if (atk > 0.25 && fg.show !== 'back34') {
      ctx.fillStyle = '#f3ead7';
      for (var ti = 0; ti < 3; ti++) {
        var tx = hx + BW * (0.40 + sn * 0.5 + ti * 0.05);
        ctx.beginPath();
        ctx.moveTo(tx, -BH * 0.785); ctx.lineTo(tx + BW * 0.018, -BH * 0.785);
        ctx.lineTo(tx + BW * 0.009, -BH * 0.762); ctx.closePath(); ctx.fill();
      }
    }

    /* brow */
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(hx + BW * 0.40, -BH * 0.86);
    ctx.quadraticCurveTo(hx + BW * 0.50, -BH * 0.885, hx + BW * 0.55, -BH * 0.84);
    ctx.lineTo(hx + BW * 0.51, -BH * 0.825);
    ctx.quadraticCurveTo(hx + BW * 0.44, -BH * 0.84, hx + BW * 0.40, -BH * 0.84);
    ctx.closePath(); ctx.fill();

    /* eye */
    if (fg.show !== 'back34') {
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.ellipse(hx + BW * 0.47, -BH * 0.842, BW * 0.034, BH * 0.022, 0, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = '#140a00';
      ctx.beginPath();
      ctx.ellipse(hx + BW * 0.485, -BH * 0.842, BW * 0.013, BH * 0.015, 0, 0, 6.2832);
      ctx.fill();
    }
  }

  /* ======================================================================
     buildWyrm — Godzilla family.
     IDENTICAL to entities.js buildBody; parameterised by shape so future
     forms can vary plate count, tail length, and body bulk.
     shape: { plates:9, tail:1.0, bulk:1.0 }
     ====================================================================== */
  function buildWyrm(ctx, w, h, pal, shape, base, frame, fsm) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ANCHOR_X, ANCHOR_Y);

    var plateN = (shape && shape.plates != null) ? shape.plates : 9;
    var tailMult = (shape && shape.tail  != null) ? shape.tail  : 1.0;
    var bulkMult = (shape && shape.bulk  != null) ? shape.bulk  : 1.0;
    /* ARTP2 §2 escalation knobs (data-driven; absent → gentle baseline so other forms are safe) */
    var s         = shape || {};
    var legMul    = s.legMul != null ? s.legMul : 1.0;       // elephantine pads (§2.1)
    var armMul    = s.armMul != null ? s.armMul : 1.0;       // widened vestigial arms (§2.1)
    var torsoW    = s.torsoWidth != null ? s.torsoWidth : 1; // gvk warrior narrowing (§2.4)
    var rimGlow   = (s.selfIllum && pal.rimGlow) ? pal.rimGlow : null;  // §1.2 self-illum (burning/gxk/supernova)
    var plateOpts = { jag: (s.plateJag != null ? s.plateJag : 0.45),
                      heightMul: (s.plateHeightMul != null ? s.plateHeightMul : 1.0),
                      broken: (s.broken | 0),
                      faceGrad: pal.plateHot || null };       // burning hot plate-face gradient

    var BH = h * 0.74 * bulkMult;
    var BW = BH * 0.5;

    var walkT    = (frame % 6) / 6;
    var step     = Math.sin(walkT * Math.PI * 2);
    var bob      = (fsm === 'walk') ? Math.abs(Math.sin(walkT * Math.PI * 2)) * BH * 0.018 : 0;
    var atk      = (fsm === 'attack') ? Math.sin(Math.min(1, frame / 5) * Math.PI) : 0;
    var legSwing = (fsm === 'walk') ? step : 0;

    var fg = facingGeom(base);
    ctx.translate(0, -bob);

    /* ground contact ellipse */
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 2, BW * 0.95, BH * 0.05, 0, 0, 6.2832);
    ctx.fill();

    var dark = pal.skinDark, skin = pal.skin, light = pal.skinLight;

    /* back-to-front draw order */
    /* 1) tail */
    drawTailScaled(ctx, BH, BW, fg, dark, tailMult);
    /* 2) far leg */
    ctx.fillStyle = dark;
    drawLeg(ctx, fg.farLegX * BW, BH, BW, -legSwing, fg, legMul);
    /* 3) far arm */
    ctx.fillStyle = dark;
    drawArm(ctx, fg.farArmX * BW, -BH * 0.5, BH, BW, fg, -1, atk, armMul);
    /* 4) torso (torsoW narrows gvk; rimGlow adds the self-illum silhouette rim) */
    drawTorso(ctx, BH, BW, fg, skin, dark, light, torsoW, rimGlow);
    /* 5) belly highlight (organic, KEPT §1.8) */
    ctx.save(); ctx.globalAlpha = 0.38; ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(fg.bellyX * BW, -BH * 0.34, BW * 0.20, BH * 0.16, 0.15 * fg.dir, 0, 6.2832);
    ctx.fill(); ctx.restore();
    /* 5b) magma/energy fissures across chest/belly/thigh (burning + supernova, §2.3/§2.6) */
    if (s.fissures && pal.fissureCore) {
      drawFissures(ctx, BH, BW, fg, pal.fissureCore, pal.fissureGlow, s.fissures);
    }
    /* 6) dorsal broken-slate ridge (static bodies; live glow drawn by entities.js) */
    drawPlates(ctx, BH, BW, fg, pal, false, null, plateN, plateOpts);
    /* 7) near leg */
    ctx.fillStyle = skin;
    drawLeg(ctx, fg.nearLegX * BW, BH, BW, legSwing, fg, legMul);
    /* 8) near arm */
    ctx.fillStyle = skin;
    drawArm(ctx, fg.nearArmX * BW, -BH * 0.5, BH, BW, fg, 1, atk, armMul);
    /* 9) head — lowered ~BH*0.02 to sell scale (small low-slung head §2.1; wyrm-local translate) */
    ctx.save(); ctx.translate(0, BH * 0.02);
    drawHead(ctx, BH, BW, fg, pal, atk);
    ctx.restore();

    ctx.restore();
  }

  /* tail with a length multiplier applied to the horizontal extent only,
     so shape.tail=1.5 makes a longer tail without changing body proportions. */
  function drawTailScaled(ctx, BH, BW, fg, dark, tailMult) {
    var d  = fg.tailDir;
    var tm = tailMult || 1.0;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(d * BW * 0.10, -BH * 0.30);
    ctx.quadraticCurveTo(d * BW * 0.85 * tm, -BH * 0.40, d * BW * 1.25 * tm, -BH * 0.06);
    ctx.quadraticCurveTo(d * BW * 1.12 * tm,  BH * 0.02,  d * BW * 0.95 * tm, -BH * 0.05);
    ctx.quadraticCurveTo(d * BW * 0.55 * tm, -BH * 0.20,  d * BW * 0.08, -BH * 0.16);
    ctx.closePath(); ctx.fill();
  }

  /* ======================================================================
     buildFlyer — Mothra / Rodan.
     Light body (no dorsal plates), two swept wing quads flapped off walkPhase.
     shape: { wingSpan, wingStyle:'moth'|'pteranodon', plates:0, bulk }
     ====================================================================== */
  function buildFlyer(ctx, w, h, pal, shape, base, frame, fsm) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ANCHOR_X, ANCHOR_Y);

    var wingSpan  = (shape && shape.wingSpan  != null) ? shape.wingSpan  : 2.2;
    var wingStyle = (shape && shape.wingStyle) ? shape.wingStyle : 'moth';
    var bulkMult  = (shape && shape.bulk       != null) ? shape.bulk      : 0.75;

    var BH = h * 0.74 * bulkMult;
    var BW = BH * 0.5;

    var walkT    = (frame % 6) / 6;
    var step     = Math.sin(walkT * Math.PI * 2);
    var bob      = (fsm === 'walk') ? Math.abs(step) * BH * 0.015 : 0;
    var atk      = (fsm === 'attack') ? Math.sin(Math.min(1, frame / 5) * Math.PI) : 0;
    var wingFlap = (fsm === 'walk' || fsm === 'attack') ? step : Math.sin(walkT * Math.PI * 2);

    var fg = facingGeom(base);
    ctx.translate(0, -bob);

    /* ground contact ellipse */
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 2, BW * 0.90, BH * 0.04, 0, 0, 6.2832);
    ctx.fill();

    var dark = pal.skinDark, skin = pal.skin, light = pal.skinLight;
    var WH = BH * wingSpan;   /* half-span in px for each wing */

    /* back wings (drawn behind body) */
    if (wingStyle === 'moth') {
      drawMothWing(ctx, WH, BH, fg, pal, wingFlap, false, dark);
    } else {
      drawPteranoWing(ctx, WH, BH, fg, pal, wingFlap, false, dark);
    }

    /* torso (slimmer for flyers: narrower belly clip) */
    drawFlyerTorso(ctx, BH, BW, fg, skin, dark, light);

    /* belly highlight */
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(fg.bellyX * BW, -BH * 0.34, BW * 0.18, BH * 0.14, 0.15 * fg.dir, 0, 6.2832);
    ctx.fill(); ctx.restore();

    /* front legs (thin, drawn over torso) */
    ctx.fillStyle = dark;
    drawBirdLeg(ctx, fg.farLegX * BW, BH, BW, fg);
    ctx.fillStyle = skin;
    drawBirdLeg(ctx, fg.nearLegX * BW, BH, BW, fg);

    /* front wings (drawn in front of body) */
    if (wingStyle === 'moth') {
      drawMothWing(ctx, WH, BH, fg, pal, wingFlap, true, skin);
    } else {
      drawPteranoWing(ctx, WH, BH, fg, pal, wingFlap, true, skin);
    }

    /* head — no snout extension for flyers (beak-ish) */
    drawFlyerHead(ctx, BH, BW, fg, pal, atk, wingStyle);

    ctx.restore();
  }

  /* Flyer torso: slimmer, more tapered than wyrm */
  function drawFlyerTorso(ctx, BH, BW, fg, skin, dark, light) {
    var lean = fg.dir;
    var bg = ctx.createLinearGradient(0, -BH * 0.9, 0, -BH * 0.1);
    bg.addColorStop(0, light); bg.addColorStop(0.45, skin); bg.addColorStop(1, dark);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-BW * 0.28, -BH * 0.25);
    ctx.quadraticCurveTo(-BW * 0.40, -BH * 0.60, -BW * 0.10, -BH * 0.74);
    ctx.quadraticCurveTo( BW * 0.04, -BH * 0.84, BW * (0.18 + lean * 0.06), -BH * 0.78);
    ctx.quadraticCurveTo( BW * (0.34 + lean * 0.08), -BH * 0.72, BW * (0.40 + lean * 0.06), -BH * 0.58);
    ctx.quadraticCurveTo( BW * (0.46 + lean * 0.04), -BH * 0.42, BW * (0.36 + lean * 0.02), -BH * 0.25);
    ctx.quadraticCurveTo( BW * 0.28, -BH * 0.10, BW * 0.04, -BH * 0.10);
    ctx.quadraticCurveTo(-BW * 0.14, -BH * 0.10, -BW * 0.28, -BH * 0.25);
    ctx.closePath(); ctx.fill();
    /* rim light */
    ctx.save();
    ctx.strokeStyle = rimCol(0.20); ctx.lineWidth = 2.0; ctx.lineCap = 'round';   // §1.1 house rim (was rgba(255,250,235,0.20))
    ctx.beginPath();
    ctx.moveTo(-BW * 0.10, -BH * 0.74);
    ctx.quadraticCurveTo( BW * 0.04, -BH * 0.84, BW * (0.18 + lean * 0.06), -BH * 0.78);
    ctx.quadraticCurveTo( BW * (0.34 + lean * 0.08), -BH * 0.72, BW * (0.40 + lean * 0.06), -BH * 0.58);
    ctx.stroke(); ctx.restore();
  }

  /* Moth wing: two overlapping quads, upper and lower lobe per wing.
     front=false → draw the far (back) side; front=true → near (front) side. */
  function drawMothWing(ctx, WH, BH, fg, pal, flap, front, baseCol) {
    /* iso wing angle: when facing S (base=0) wings read as symmetric;
       SE/E/NE cause far wing to compress. */
    var lean   = fg.dir;
    var side   = front ? 1 : -1;
    var flapAmt = flap * BH * 0.22;
    var nearW  = WH * (front ? 1.0 : 0.85);

    /* wing root attaches mid-torso */
    var rootX = side * BW_from_BH(BH) * 0.36;
    var rootY = -BH * 0.62;

    /* compress far wing by lean for iso depth illusion */
    var compress = front ? 1.0 : clamp(1.0 - lean * 0.55, 0.30, 1.0);

    /* upper lobe */
    var tipUX = side * nearW * 0.80 * compress + lean * side * BH * 0.08;
    var tipUY = -BH * 0.90 + flapAmt * 0.4;
    var tipLX = side * nearW * 1.05 * compress + lean * side * BH * 0.04;
    var tipLY = -BH * 0.30 + flapAmt;

    ctx.save();
    /* wing gradient: bright near root, dark at tips */
    var wg = ctx.createLinearGradient(rootX, rootY, tipLX, tipLY);
    wg.addColorStop(0, pal.skinLight);
    wg.addColorStop(0.5, baseCol);
    wg.addColorStop(1, pal.skinDark);
    ctx.fillStyle = wg;
    ctx.globalAlpha = front ? 0.95 : 0.70;
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.quadraticCurveTo(tipUX * 0.7, -BH * 1.02 + flapAmt * 0.2, tipUX, tipUY);
    ctx.quadraticCurveTo(tipLX * 0.95, -BH * 0.60 + flapAmt * 0.7, tipLX, tipLY);
    ctx.quadraticCurveTo(rootX + side * BH * 0.04, -BH * 0.42, rootX, rootY);
    ctx.closePath(); ctx.fill();

    /* wing vein strokes */
    ctx.globalAlpha = front ? 0.30 : 0.18;
    ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (var v = 0; v < 3; v++) {
      var vt = (v + 1) / 4;
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.lineTo(lerp(rootX, tipLX, vt) + lerp(0, tipUX - rootX, vt * 0.6),
                 lerp(rootY, tipLY, vt) + lerp(0, tipUY - rootY, vt * 0.5));
      ctx.stroke();
    }
    ctx.restore();
  }
  function BW_from_BH(BH) { return BH * 0.5; }

  /* Pteranodon wing: single swept membrane, longer and more angular. */
  function drawPteranoWing(ctx, WH, BH, fg, pal, flap, front, baseCol) {
    var lean    = fg.dir;
    var side    = front ? 1 : -1;
    var flapAmt = flap * BH * 0.26;
    var nearW   = WH * (front ? 1.0 : 0.80);
    var compress = front ? 1.0 : clamp(1.0 - lean * 0.55, 0.25, 1.0);

    var rootX = side * BW_from_BH(BH) * 0.30;
    var rootY = -BH * 0.66;

    /* pointed wing tip */
    var tipX = side * nearW * 1.10 * compress + lean * side * BH * 0.06;
    var tipY = -BH * 0.72 + flapAmt;

    /* membrane trailing edge (lower) */
    var trailX = side * nearW * 0.55 * compress;
    var trailY = -BH * 0.20 + flapAmt * 0.8;

    ctx.save();
    var wg = ctx.createLinearGradient(rootX, rootY, tipX, tipY);
    wg.addColorStop(0, pal.skinLight);
    wg.addColorStop(0.45, baseCol);
    wg.addColorStop(1, pal.skinDark);
    ctx.fillStyle = wg;
    ctx.globalAlpha = front ? 0.92 : 0.66;
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.quadraticCurveTo(tipX * 0.55 + side * BH * 0.02, -BH * 0.95 + flapAmt * 0.3, tipX, tipY);
    ctx.quadraticCurveTo(lerp(tipX, trailX, 0.6), -BH * 0.44 + flapAmt * 0.9, trailX, trailY);
    ctx.quadraticCurveTo(rootX + side * BH * 0.02, -BH * 0.30, rootX, rootY);
    ctx.closePath(); ctx.fill();

    /* single spar stroke */
    ctx.globalAlpha = front ? 0.35 : 0.20;
    ctx.strokeStyle = pal.skinDark; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.quadraticCurveTo(tipX * 0.55, -BH * 0.95 + flapAmt * 0.3, tipX, tipY);
    ctx.stroke();
    ctx.restore();
  }

  /* Flyer legs: thin bird-style talons */
  function drawBirdLeg(ctx, x, BH, BW, fg) {
    var w = BH * 0.045;
    ctx.beginPath();
    ctx.moveTo(x, -BH * 0.22);
    ctx.quadraticCurveTo(x + w * 0.5, -BH * 0.10, x, -BH * 0.02);
    ctx.lineTo(x + w * 1.2, -BH * 0.02);
    ctx.lineTo(x + w * 1.5, BH * 0.00);   /* talon forward */
    ctx.lineTo(x + w * 0.3, -BH * 0.05);
    ctx.lineTo(x - w * 0.8, -BH * 0.02);  /* talon back */
    ctx.lineTo(x - w, -BH * 0.05);
    ctx.quadraticCurveTo(x - w * 0.4, -BH * 0.12, x - w * 0.2, -BH * 0.22);
    ctx.closePath(); ctx.fill();
  }

  /* Flyer head: moth = round with large compound-eye suggestion;
     pteranodon = elongated crest + beak. */
  function drawFlyerHead(ctx, BH, BW, fg, pal, atk, wingStyle) {
    if (fg.show === 'back') {
      ctx.fillStyle = pal.skinDark;
      ctx.beginPath();
      ctx.ellipse(0, -BH * 0.82, BW * 0.12, BH * 0.05, 0, 0, 6.2832);
      ctx.fill();
      return;
    }
    var hx = fg.headX * BW * 0.8;
    var mo = atk * BH * 0.03;

    if (wingStyle === 'moth') {
      /* round fluffy moth head */
      ctx.fillStyle = pal.skin;
      ctx.beginPath();
      ctx.ellipse(hx + BW * 0.28, -BH * 0.82, BW * 0.22 * fg.headScale, BH * 0.11, -0.12, 0, 6.2832);
      ctx.fill();
      /* compound eye */
      if (fg.show !== 'back34') {
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.ellipse(hx + BW * 0.36, -BH * 0.835, BW * 0.07, BH * 0.040, 0, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = pal.skinDark;
        ctx.beginPath();
        ctx.ellipse(hx + BW * 0.38, -BH * 0.836, BW * 0.025, BH * 0.020, 0, 0, 6.2832);
        ctx.fill();
      }
      /* antennae */
      ctx.strokeStyle = pal.skinDark; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx + BW * 0.22, -BH * 0.87);
      ctx.quadraticCurveTo(hx + BW * 0.10, -BH * 1.00, hx + BW * 0.05, -BH * 1.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx + BW * 0.34, -BH * 0.88);
      ctx.quadraticCurveTo(hx + BW * 0.26, -BH * 1.00, hx + BW * 0.22, -BH * 1.04);
      ctx.stroke();
    } else {
      /* pteranodon: long crest + narrow beak */
      ctx.fillStyle = pal.skinDark;   /* crest */
      ctx.beginPath();
      ctx.moveTo(hx + BW * 0.10, -BH * 0.86);
      ctx.quadraticCurveTo(hx + BW * 0.18, -BH * 0.96, hx + BW * 0.50, -BH * 1.02);
      ctx.quadraticCurveTo(hx + BW * 0.55, -BH * 1.03, hx + BW * 0.54, -BH * 0.99);
      ctx.quadraticCurveTo(hx + BW * 0.24, -BH * 0.94, hx + BW * 0.14, -BH * 0.84);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = pal.skin;       /* head blob */
      ctx.beginPath();
      ctx.ellipse(hx + BW * 0.26, -BH * 0.84, BW * 0.18 * fg.headScale, BH * 0.08, 0, 0, 6.2832);
      ctx.fill();
      /* beak */
      ctx.fillStyle = pal.skinDark;
      ctx.beginPath();
      ctx.moveTo(hx + BW * 0.36, -BH * 0.82);
      ctx.quadraticCurveTo(hx + BW * 0.56, -BH * 0.815 + mo, hx + BW * 0.60, -BH * 0.812 + mo * 0.5);
      ctx.quadraticCurveTo(hx + BW * 0.52, -BH * 0.800 + mo, hx + BW * 0.38, -BH * 0.800);
      ctx.closePath(); ctx.fill();
      if (fg.show !== 'back34') {
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.ellipse(hx + BW * 0.30, -BH * 0.846, BW * 0.030, BH * 0.019, 0, 0, 6.2832);
        ctx.fill();
      }
    }
  }

  /* ======================================================================
     buildHydra — King Ghidorah family.
     Wyrm body (no dorsal plates by default) + shape.heads looped drawHead
     calls fanned out on necks, + a fan-tail (tails:2). When shape.mech:true,
     a steel-panel overlay is drawn over the torso (matching buildMecha style).
     shape: { heads:3, neckSpread:1.0, wingSpan:2.5, mech:false, tails:2 }
     ====================================================================== */
  function buildHydra(ctx, w, h, pal, shape, base, frame, fsm) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ANCHOR_X, ANCHOR_Y);

    var heads      = (shape && shape.heads      != null) ? shape.heads      : 3;
    var neckSpread = (shape && shape.neckSpread != null) ? shape.neckSpread : 1.0;
    var wingSpan   = (shape && shape.wingSpan   != null) ? shape.wingSpan   : 2.5;
    var isMech     = (shape && shape.mech) ? true : false;
    var tails      = (shape && shape.tails      != null) ? shape.tails      : 2;

    var BH = h * 0.74 * 0.82;   /* slightly smaller body so necks have room */
    var BW = BH * 0.5;

    var walkT    = (frame % 6) / 6;
    var step     = Math.sin(walkT * Math.PI * 2);
    var bob      = (fsm === 'walk') ? Math.abs(step) * BH * 0.014 : 0;
    var atk      = (fsm === 'attack') ? Math.sin(Math.min(1, frame / 5) * Math.PI) : 0;
    var legSwing = (fsm === 'walk') ? step : 0;

    var fg = facingGeom(base);
    ctx.translate(0, -bob);

    /* ground contact ellipse */
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(0, 2, BW * 1.20, BH * 0.05, 0, 0, 6.2832);
    ctx.fill();

    var dark = pal.skinDark, skin = pal.skin, light = pal.skinLight;

    /* fan of tails (drawn behind everything) */
    for (var ti = 0; ti < tails; ti++) {
      var tFrac = tails > 1 ? (ti / (tails - 1) - 0.5) * 0.6 : 0;
      ctx.save();
      ctx.rotate(tFrac);
      drawTail(ctx, BH, BW, fg, dark);
      ctx.restore();
    }

    /* wings (Ghidorah is also a flyer, drawn behind torso) */
    var WH = BH * wingSpan;
    drawPteranoWing(ctx, WH, BH, fg, pal, step, false, dark);

    /* legs */
    ctx.fillStyle = dark;
    drawLeg(ctx, fg.farLegX * BW * 0.9, BH, BW, -legSwing, fg);
    ctx.fillStyle = skin;
    drawLeg(ctx, fg.nearLegX * BW * 0.9, BH, BW, legSwing, fg);

    /* torso */
    drawTorso(ctx, BH, BW, fg, skin, dark, light);

    /* belly highlight */
    ctx.save(); ctx.globalAlpha = 0.32; ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(fg.bellyX * BW, -BH * 0.34, BW * 0.20, BH * 0.14, 0.15 * fg.dir, 0, 6.2832);
    ctx.fill(); ctx.restore();

    /* mech-ghidorah steel panel overlay on torso */
    if (isMech) {
      drawMechPanels(ctx, BH, BW, fg, pal, 0.55);   /* partial opacity for gold-steel mix */
    }

    /* front wings */
    drawPteranoWing(ctx, WH, BH, fg, pal, step, true, skin);

    /* necks + heads fanned from torso top */
    drawHydraHeads(ctx, BH, BW, fg, pal, heads, neckSpread, atk, walkT, isMech);

    ctx.restore();
  }

  /* Fan `nHeads` necks from the top of the torso, each with its own head.
     The central neck points along the body facing; outer necks sweep left/right.
     Walk animation gives each neck a gentle independent bob. */
  function drawHydraHeads(ctx, BH, BW, fg, pal, nHeads, neckSpread, atk, walkT, isMech) {
    var lean = fg.dir;
    /* fan spread in radians: ±60° for 3 heads → 0.55 rad each step */
    var totalArc = 0.90 * neckSpread;
    for (var n = 0; n < nHeads; n++) {
      var frac = nHeads > 1 ? (n / (nHeads - 1) - 0.5) : 0;
      var arc  = frac * totalArc;    /* radians: –0.45 .. 0 .. +0.45 for 3 heads */

      /* bob each neck slightly out of phase */
      var phaseOff = n * 0.55;
      var neckBob  = Math.sin(walkT * Math.PI * 2 + phaseOff) * BH * 0.05;

      /* neck base: top of torso, biased toward facing lean */
      var rootX = BW * (0.10 + lean * 0.12) + frac * BW * 0.40 * neckSpread;
      var rootY = -BH * 0.82;

      /* neck length (centre slightly longer) */
      var neckLen = BH * (0.38 + (1 - Math.abs(frac)) * 0.12);

      /* neck tip position: sweep by arc from the root upward */
      var tipX = rootX + Math.sin(arc) * neckLen;
      var tipY = rootY - Math.cos(arc) * neckLen + neckBob;

      /* draw neck as a thick curved stroke */
      var nw = BH * 0.09 * (1 - Math.abs(frac) * 0.25);
      ctx.strokeStyle = n === Math.floor(nHeads / 2) ? pal.skin : pal.skinDark;
      ctx.lineWidth   = nw;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      /* control point: midway, slightly angled */
      ctx.quadraticCurveTo(
        rootX + Math.sin(arc * 0.5) * neckLen * 0.55,
        rootY - neckLen * 0.55 + neckBob * 0.5,
        tipX, tipY
      );
      ctx.stroke();

      /* draw a head at the tip */
      ctx.save();
      ctx.translate(tipX, tipY);
      ctx.rotate(arc * 0.4);  /* head turns with the neck angle */
      var headScale = 0.75 + (1 - Math.abs(frac)) * 0.18;
      ctx.scale(headScale, headScale);
      /* give each outer head a slight facing variation so they don't stack */
      var fakeFg = Object.assign({}, fg);
      fakeFg.dir   = clamp(lean + frac * 0.5, -1, 1);
      fakeFg.headX = 0;
      fakeFg.snout = fg.snout * 0.90;
      drawHead(ctx, BH * 0.62, BW * 0.62, fakeFg, pal, n === Math.floor(nHeads / 2) ? atk : atk * 0.6);
      ctx.restore();
    }
  }

  /* ======================================================================
     buildMecha — Mechagodzilla family.
     Same silhouette as buildWyrm but with: flat panel fills (no skin gradient),
     seam strokes, rivet dot pattern, a hard specular edge highlight, and a
     laser eye beam during attack. shape.mech:true already implied by archetype.
     shape: { plates, antennae:1..2, panel:true }
     ====================================================================== */
  function buildMecha(ctx, w, h, pal, shape, base, frame, fsm) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ANCHOR_X, ANCHOR_Y);

    var plateN   = (shape && shape.plates   != null) ? shape.plates   : 9;
    var antennae = (shape && shape.antennae != null) ? shape.antennae : 1;

    var BH = h * 0.74;
    var BW = BH * 0.5;

    var walkT    = (frame % 6) / 6;
    var step     = Math.sin(walkT * Math.PI * 2);
    var bob      = (fsm === 'walk') ? Math.abs(step) * BH * 0.016 : 0;
    var atk      = (fsm === 'attack') ? Math.sin(Math.min(1, frame / 5) * Math.PI) : 0;
    var legSwing = (fsm === 'walk') ? step : 0;

    var fg = facingGeom(base);
    ctx.translate(0, -bob);

    /* ground contact ellipse */
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 2, BW * 0.95, BH * 0.05, 0, 0, 6.2832);
    ctx.fill();

    var dark = pal.skinDark, skin = pal.skin, light = pal.skinLight;

    /* tail — angular mech version */
    drawMechTail(ctx, BH, BW, fg, dark, pal);

    /* far leg */
    ctx.fillStyle = dark;
    drawLeg(ctx, fg.farLegX * BW, BH, BW, -legSwing, fg);
    drawMechLegPanel(ctx, fg.farLegX * BW, BH, BW, pal, false);

    /* far arm */
    ctx.fillStyle = dark;
    drawArm(ctx, fg.farArmX * BW, -BH * 0.5, BH, BW, fg, -1, atk);

    /* torso silhouette — filled flat with armour base colour */
    drawMechTorso(ctx, BH, BW, fg, skin, dark, light, pal);

    /* panel overlays on torso */
    drawMechPanels(ctx, BH, BW, fg, pal, 1.0);

    /* dorsal spine array (replaces organic plates) */
    drawMechSpines(ctx, BH, BW, fg, pal, plateN);

    /* near leg */
    ctx.fillStyle = skin;
    drawLeg(ctx, fg.nearLegX * BW, BH, BW, legSwing, fg);
    drawMechLegPanel(ctx, fg.nearLegX * BW, BH, BW, pal, true);

    /* near arm */
    ctx.fillStyle = skin;
    drawArm(ctx, fg.nearArmX * BW, -BH * 0.5, BH, BW, fg, 1, atk);
    drawMechArmPanel(ctx, fg.nearArmX * BW, -BH * 0.5, BH, BW, pal);

    /* head */
    drawMechHead(ctx, BH, BW, fg, pal, atk, antennae);

    ctx.restore();
  }

  /* Flat panel armour torso: no gradient, uses flat skin+panel colour. */
  function drawMechTorso(ctx, BH, BW, fg, skin, dark, light, pal) {
    var lean = fg.dir;
    /* base silhouette — same outline as drawTorso for identical hitbox feel */
    ctx.fillStyle = pal.skin;
    ctx.beginPath();
    ctx.moveTo(-BW * 0.36, -BH * 0.30);
    ctx.quadraticCurveTo(-BW * 0.50, -BH * 0.68, -BW * 0.14, -BH * 0.80);
    ctx.quadraticCurveTo( BW * 0.04, -BH * 0.88, BW * (0.22 + lean * 0.06), -BH * 0.82);
    ctx.quadraticCurveTo( BW * (0.40 + lean * 0.10), -BH * 0.78, BW * (0.46 + lean * 0.08), -BH * 0.62);
    ctx.quadraticCurveTo( BW * (0.56 + lean * 0.06), -BH * 0.46, BW * (0.46 + lean * 0.04), -BH * 0.30);
    ctx.quadraticCurveTo( BW * 0.40, -BH * 0.13, BW * 0.08, -BH * 0.13);
    ctx.quadraticCurveTo(-BW * 0.18, -BH * 0.13, -BW * 0.36, -BH * 0.30);
    ctx.closePath(); ctx.fill();
    /* hard specular top-edge */
    ctx.save();
    ctx.strokeStyle = light; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-BW * 0.14, -BH * 0.80);
    ctx.quadraticCurveTo( BW * 0.04, -BH * 0.88, BW * (0.22 + lean * 0.06), -BH * 0.82);
    ctx.stroke(); ctx.restore();
  }

  /* Flat rectangular panels drawn over the mech torso. */
  function drawMechPanels(ctx, BH, BW, fg, pal, alpha) {
    var lean = fg.dir;
    ctx.save();
    ctx.globalAlpha = alpha * 0.65;
    ctx.fillStyle = pal.plate || pal.skinDark;

    /* chest centre panel */
    ctx.beginPath();
    ctx.rect(BW * (0.02 + lean * 0.04) - BW * 0.22, -BH * 0.62, BW * 0.44, BH * 0.30);
    ctx.fill();

    /* shoulder left panel */
    ctx.beginPath();
    ctx.rect(-BW * 0.46, -BH * 0.72, BW * 0.20, BH * 0.14);
    ctx.fill();

    /* shoulder right panel */
    ctx.beginPath();
    ctx.rect(BW * (0.28 + lean * 0.08), -BH * 0.76, BW * 0.18, BH * 0.14);
    ctx.fill();

    /* lower belly panel */
    ctx.beginPath();
    ctx.rect(-BW * 0.18, -BH * 0.28, BW * 0.38, BH * 0.14);
    ctx.fill();

    ctx.globalAlpha = alpha * 0.90;

    /* seam strokes between panels */
    ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 1.5;
    /* horizontal chest seam */
    ctx.beginPath();
    ctx.moveTo(-BW * 0.22 + BW * (0.02 + lean * 0.04), -BH * 0.62);
    ctx.lineTo( BW * 0.22 + BW * (0.02 + lean * 0.04), -BH * 0.62);
    ctx.stroke();
    /* vertical centre seam */
    ctx.beginPath();
    ctx.moveTo(BW * (0.02 + lean * 0.04), -BH * 0.62);
    ctx.lineTo(BW * (0.02 + lean * 0.04), -BH * 0.32);
    ctx.stroke();
    /* belly seam */
    ctx.beginPath();
    ctx.moveTo(-BW * 0.18, -BH * 0.28);
    ctx.lineTo( BW * 0.20, -BH * 0.28);
    ctx.stroke();

    /* rivets — small filled dots at panel corners */
    ctx.fillStyle = pal.plateEdge;
    ctx.globalAlpha = alpha * 0.80;
    var rivetPts = [
      [-BW * 0.20, -BH * 0.61], [BW * 0.18, -BH * 0.61],
      [-BW * 0.20, -BH * 0.33], [BW * 0.18, -BH * 0.33],
      [-BW * 0.16, -BH * 0.27], [BW * 0.18, -BH * 0.27],
      [-BW * 0.43, -BH * 0.715], [-BW * 0.28, -BH * 0.715],
    ];
    for (var rp = 0; rp < rivetPts.length; rp++) {
      ctx.beginPath();
      ctx.arc(rivetPts[rp][0], rivetPts[rp][1], 1.8, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
  }

  /* Mech leg panel overlay */
  function drawMechLegPanel(ctx, x, BH, BW, pal, isNear) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pal.plate || pal.skinDark;
    ctx.beginPath();
    ctx.rect(x - BH * 0.055, -BH * 0.30, BH * 0.10, BH * 0.18);
    ctx.fill();
    ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 1.2;
    ctx.strokeRect(x - BH * 0.055, -BH * 0.30, BH * 0.10, BH * 0.18);
    ctx.restore();
  }

  /* Mech arm panel overlay */
  function drawMechArmPanel(ctx, x, y, BH, BW, pal) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pal.plate || pal.skinDark;
    ctx.beginPath();
    ctx.rect(x + BH * 0.02, y + BH * 0.04, BH * 0.12, BH * 0.07);
    ctx.fill();
    ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 1.2;
    ctx.strokeRect(x + BH * 0.02, y + BH * 0.04, BH * 0.12, BH * 0.07);
    ctx.restore();
  }

  /* Mech tail: angular segmented look */
  function drawMechTail(ctx, BH, BW, fg, dark, pal) {
    var d = fg.tailDir;
    /* base organic shape */
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(d * BW * 0.10, -BH * 0.30);
    ctx.quadraticCurveTo(d * BW * 0.85, -BH * 0.40, d * BW * 1.25, -BH * 0.06);
    ctx.quadraticCurveTo(d * BW * 1.12, BH * 0.02, d * BW * 0.95, -BH * 0.05);
    ctx.quadraticCurveTo(d * BW * 0.55, -BH * 0.20, d * BW * 0.08, -BH * 0.16);
    ctx.closePath(); ctx.fill();
    /* segmented panel stripes */
    ctx.save();
    ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 1.0; ctx.globalAlpha = 0.55;
    for (var seg = 0; seg < 4; seg++) {
      var st = 0.2 + seg * 0.18;
      var sx0 = lerp(d * BW * 0.10, d * BW * 1.25, st);
      var sy0 = lerp(-BH * 0.30, -BH * 0.06, st);
      var sx1 = lerp(d * BW * 0.08, d * BW * 0.95, st);
      var sy1 = lerp(-BH * 0.16, -BH * 0.05, st);
      ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.stroke();
    }
    ctx.restore();
  }

  /* Mech dorsal spines: hard angular triangles instead of organic plates */
  function drawMechSpines(ctx, BH, BW, fg, pal, N) {
    if (N == null) N = 9;
    var lean = fg.plateLean;
    for (var i = 0; i <= N; i++) {
      var t    = i / N;
      var x    = lerp( BW * (0.24 - lean * 0.10), -BW * (0.52 + lean * 0.05), t);
      var y    = -(lerp(0.80, 0.36, t) + Math.sin(t * Math.PI) * 0.06) * BH;
      var size = (Math.sin(t * Math.PI) * 0.10 + 0.04) * BH;
      /* flat-topped angular spike */
      ctx.fillStyle = pal.plate || pal.skinDark;
      ctx.beginPath();
      ctx.moveTo(x - BW * 0.07, y + size * 0.30);
      ctx.lineTo(x - BW * 0.02, y - size);         /* left edge */
      ctx.lineTo(x + BW * 0.02, y - size);          /* flat top */
      ctx.lineTo(x + BW * 0.07, y + size * 0.30);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 1.8; ctx.stroke();
      /* specular top edge */
      ctx.save();
      ctx.strokeStyle = pal.skinLight; ctx.lineWidth = 1.0; ctx.globalAlpha = 0.70;
      ctx.beginPath();
      ctx.moveTo(x - BW * 0.02, y - size); ctx.lineTo(x + BW * 0.02, y - size);
      ctx.stroke(); ctx.restore();
    }
  }

  /* Mech head: angular box + visor eye + antennae */
  function drawMechHead(ctx, BH, BW, fg, pal, atk, antennae) {
    if (fg.show === 'back') {
      ctx.fillStyle = pal.skinDark;
      ctx.beginPath();
      ctx.rect(-BW * 0.14, -BH * 0.89, BW * 0.28, BH * 0.07);
      ctx.fill();
      return;
    }
    var hx = fg.headX * BW;
    var hs = fg.headScale;
    var mo = atk * BH * 0.04;   /* jaw open */
    var lean = fg.dir;

    /* neck (angular block) */
    ctx.fillStyle = pal.skinDark;
    ctx.beginPath();
    ctx.rect(hx + BW * 0.08, -BH * 0.80, BW * 0.28, BH * 0.12);
    ctx.fill();

    /* skull box */
    var hw = BW * 0.40 * hs;
    var hh = BH * 0.12 * hs;
    var hlx = hx + BW * 0.16;
    var hly = -BH * 0.90;
    ctx.fillStyle = pal.skin;
    ctx.beginPath();
    ctx.rect(hlx, hly, hw, hh);
    ctx.fill();

    /* panel lines on skull */
    ctx.save();
    ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.70;
    ctx.beginPath();
    ctx.moveTo(hlx + hw * 0.5, hly);
    ctx.lineTo(hlx + hw * 0.5, hly + hh);
    ctx.stroke();
    ctx.restore();

    /* jaw (lower block, opens with atk) */
    ctx.fillStyle = pal.skinDark;
    ctx.beginPath();
    ctx.rect(hlx + hw * 0.08, hly + hh + mo * 0.3, hw * 0.80, BH * 0.04 + mo);
    ctx.fill();

    /* visor eye slit */
    if (fg.show !== 'back34') {
      /* visor bar */
      ctx.fillStyle = pal.plate || pal.skinDark;
      ctx.beginPath();
      ctx.rect(hlx + BW * 0.04, hly + hh * 0.35, hw * 0.80, hh * 0.28);
      ctx.fill();
      /* glowing eye (will be overdrawn by entities.js live-glow) */
      ctx.fillStyle = pal.eye;
      ctx.globalAlpha = 0.90;
      ctx.beginPath();
      ctx.rect(hlx + BW * 0.06, hly + hh * 0.38, hw * 0.74, hh * 0.22);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* hard specular edge on skull top */
    ctx.save();
    ctx.strokeStyle = pal.skinLight; ctx.lineWidth = 2.2; ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(hlx, hly); ctx.lineTo(hlx + hw, hly);
    ctx.stroke(); ctx.restore();

    /* antennae */
    for (var an = 0; an < antennae; an++) {
      var ax = hlx + hw * (antennae === 1 ? 0.50 : (an === 0 ? 0.28 : 0.72));
      ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, hly);
      ctx.lineTo(ax + (an === 0 ? -BW * 0.06 : BW * 0.06), hly - BH * 0.09);
      ctx.stroke();
      /* antenna tip */
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.arc(ax + (an === 0 ? -BW * 0.06 : BW * 0.06), hly - BH * 0.09, 2.2, 0, 6.2832);
      ctx.fill();
    }

    /* laser eye trace during attack (drawn in bake pass as a dim streak;
       entities.js live-glow adds the full additive bloom on top) */
    if (atk > 0.15 && fg.show !== 'back' && fg.show !== 'back34') {
      var eyeCx = hlx + BW * 0.06 + (hw * 0.74) * 0.5;
      var eyeCy = hly + hh * 0.38 + hh * 0.11;
      var laserEndX = eyeCx + Math.cos(lean * 0.6) * BW * 1.8;
      var laserEndY = eyeCy + Math.sin(lean * 0.3) * BH * 0.15;
      ctx.save();
      ctx.globalAlpha = atk * 0.55;
      ctx.strokeStyle = pal.eye; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(eyeCx, eyeCy);
      ctx.lineTo(laserEndX, laserEndY);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ======================================================================
     PUBLIC API — GAME.Archetypes
     ====================================================================== */
  var Archetypes = {
    /* Main dispatch: calls the archetype builder matched by shape.archetype.
       ctx: 2D context of an offscreen canvas sized (w, h).
       pal: palette object (skin, skinDark, skinLight, plate, plateEdge,
            plateGlow, breath[], breathGlow, eye, aura, fxMotes).
       shape: archetype-specific param object (see contract §1).
       base: authored facing index 0..4.
       frame: pose frame 0..5.
       fsm: 'idle'|'walk'|'attack'. */
    build: function (ctx, w, h, pal, shape, base, frame, fsm) {
      var arch = (shape && shape.archetype) ? shape.archetype : 'wyrm';
      switch (arch) {
        case 'wyrm':  buildWyrm (ctx, w, h, pal, shape, base, frame, fsm); break;
        case 'flyer': buildFlyer(ctx, w, h, pal, shape, base, frame, fsm); break;
        case 'hydra': buildHydra(ctx, w, h, pal, shape, base, frame, fsm); break;
        case 'mecha': buildMecha(ctx, w, h, pal, shape, base, frame, fsm); break;
        default:      buildWyrm (ctx, w, h, pal, shape, base, frame, fsm); break;
      }
    },

    /* Named builder access (entities.js calls buildWyrm directly after refactor). */
    buildWyrm:  buildWyrm,
    buildFlyer: buildFlyer,
    buildHydra: buildHydra,
    buildMecha: buildMecha,

    /* Re-export geometry so entities.js can call facingGeom/drawPlates for the
       live glow pass without duplicating the code. */
    facingGeom:  facingGeom,
    drawPlates:  drawPlates,

    /* ART HOUSE-STYLE primitives (ARTP1, visual-redesign-plan §1) — consumed by the
       v17-v20 family rewrites + verifiable in isolation. */
    rimCol:           rimCol,
    hash:             hash,
    drawRidgeElement: drawRidgeElement,
    drawFissures:     drawFissures,

    /* Sprite canvas constants — entities.js must match these exactly. */
    SPR_W:    SPR_W,
    SPR_H:    SPR_H,
    ANCHOR_X: ANCHOR_X,
    ANCHOR_Y: ANCHOR_Y
  };

  G.Archetypes = Archetypes;

})(window.GAME);
