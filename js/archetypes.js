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
  function drawFissures(ctx, BH, BW, fg, coreCol, glowCol, intensity, flyerMode) {
    if (fg && fg.show === 'back') return;
    var n = Math.max(3, Math.round(4 + (intensity != null ? intensity : 0.5) * 4));
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < n; i++) {
      var hx = hash(i * 2.0 + 1.0), hy = hash(i * 3.0 + 7.0), hl = hash(i * 5.0 + 3.0);
      var sx, sy, len, ang;
      if (flyerMode) {                                  // §5 slim horizontal flyer body — keep cracks ON the lozenge (no vertical magma trunk)
        sx = lerp(-BW * 0.30, BW * 0.34, hx);
        sy = lerp(-BH * 0.66, -BH * 0.46, hy);          // clamp start-y to the body band
        len = (0.06 + hl * 0.05) * BH;                  // short seams (vs the wyrm's long torso cracks)
        ang = (hy - 0.5) * 1.1;                         // fan ACROSS the lozenge (mostly horizontal)
      } else {
        sx = lerp(-BW * 0.26, BW * 0.30, hx);
        sy = lerp(-BH * 0.74, -BH * 0.22, hy);
        len = (0.16 + hl * 0.18) * BH;
        ang = (hx - 0.5) * 1.4 + Math.PI * 0.5;         // mostly vertical, jittered
      }
      var mx = sx + Math.cos(ang) * len * 0.5 + (hl - 0.5) * BW * 0.10;
      var my = sy + Math.sin(ang) * len * 0.5;
      var ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
      ctx.strokeStyle = glowCol; ctx.lineWidth = flyerMode ? 3.4 : 5.0;   // wider faint under-stroke
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.strokeStyle = coreCol; ctx.lineWidth = flyerMode ? 2.2 : 2.6;   // bright opaque core (>=2.2px)
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
      if (opts.leadPlate != null && i === Math.round(N * opts.leadPlate)) size *= 1.35;  // burning: one skyline-breaking hot lead-plate
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
                      leadPlate: (s.leadPlate != null ? s.leadPlate : null), // burning: index round(N*leadPlate) gets a ×1.35 spike
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
  /* FLYERMEGA §7 shared airborne helpers ------------------------------------ */
  var FLAP_PERIOD = 8;   // frames; one shared idle-flap cadence for both airborne families

  // §7.5 — detached altitude shadow (replaces the feet-contact ellipse): a soft ellipse pushed
  // down + slightly forward, the gap from the body reads "flying over buildings". One recipe, both families.
  function drawAltitudeShadow(ctx, BH, BW, fg) {
    ctx.save();
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(BW * 0.30 * fg.dir, BH * 0.12, BW * 0.55, BH * 0.05, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  // §3 — Mothra furred OVAL thorax (compact horizontal egg + fuzzy fur edge + short abdomen).
  function drawMothThorax(ctx, BH, BW, fg, pal, shape) {
    var s = shape || {};
    var thick = (s.furThorax === 'thick');
    var cy = -BH * 0.46, rx = BW * 0.34, ry = BH * 0.30;
    var g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    g.addColorStop(0, pal.skinLight); g.addColorStop(0.5, pal.skin); g.addColorStop(1, pal.skinDark);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = pal.skinDark;                       // short tapering abdomen below
    ctx.beginPath(); ctx.ellipse(BW * 0.03 * fg.dir, cy + ry * 0.95, rx * 0.42, ry * 0.7, 0, 0, 6.2832); ctx.fill();
    ctx.save();                                         // fuzzy fur edge
    ctx.globalAlpha = 0.5; ctx.strokeStyle = pal.skinLight; ctx.lineWidth = thick ? 2.8 : 1.8;
    ctx.beginPath(); ctx.ellipse(0, cy, rx * 1.04, ry * 1.04, 0, 0, 6.2832); ctx.stroke();
    if (thick) {                                        // GxK/Supernova thicker fur — a 2nd outer fuzz ring
      ctx.globalAlpha = 0.28; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(0, cy, rx * 1.12, ry * 1.12, 0, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
    if (s.joints) {                                     // GxK 2024 bioluminescent JOINT spots — opaque eye-blue pinpoints
      ctx.fillStyle = pal.eye;
      var sp = [[rx * 0.92, cy - ry * 0.15], [-rx * 0.92, cy - ry * 0.15],     // wing-root joints
                [0, cy - ry * 0.40], [rx * 0.30, cy + ry * 0.28], [-rx * 0.30, cy + ry * 0.28]]; // chest + abdomen
      for (var j = 0; j < sp.length; j++) { ctx.beginPath(); ctx.arc(sp[j][0], sp[j][1], BH * 0.022, 0, 6.2832); ctx.fill(); }
    }
  }

  // §5 — Rodan slim near-horizontal body lozenge (beak-leading +X → stub tail −X, 3-stop gradient).
  function drawPteranoBody(ctx, BH, BW, fg, pal) {
    var cy = -BH * 0.55, hw = BW * 0.55, hh = BH * 0.12;   // §5 narrowed so the wings dwarf the slim body
    var g = ctx.createLinearGradient(0, cy - hh, 0, cy + hh);
    g.addColorStop(0, pal.skinLight); g.addColorStop(0.5, pal.skin); g.addColorStop(1, pal.skinDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(hw, cy);
    ctx.quadraticCurveTo(hw * 0.3, cy - hh, -hw * 0.4, cy - hh * 0.7);
    ctx.quadraticCurveTo(-hw, cy - hh * 0.2, -hw * 1.05, cy);
    ctx.quadraticCurveTo(-hw, cy + hh * 0.3, -hw * 0.4, cy + hh * 0.7);
    ctx.quadraticCurveTo(hw * 0.3, cy + hh, hw, cy);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rimCol(0.2); ctx.lineWidth = 1.8;   // back/top rim
    ctx.beginPath(); ctx.moveTo(hw, cy); ctx.quadraticCurveTo(hw * 0.3, cy - hh, -hw * 0.4, cy - hh * 0.7); ctx.stroke();
  }

  // §5/§7 — a small pair of curled tucked talons under the abdomen (no planted feet / walk swing).
  function drawTuckedTalons(ctx, BH, BW, fg, col) {
    ctx.fillStyle = col;
    for (var s = -1; s <= 1; s += 2) {
      var tx = s * BW * 0.12, ty = -BH * 0.34;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + s * BW * 0.05, ty + BH * 0.07, tx, ty + BH * 0.10);
      ctx.lineTo(tx - s * BW * 0.035, ty + BH * 0.07);
      ctx.closePath(); ctx.fill();
    }
  }

  // §5 — Rodan craggy sternum: 3 downward spikes stepping toward the beak along the leading underside.
  // Self-contained (only sets ctx.fillStyle); optional dark `edge` backing gives value separation on warm bodies.
  function drawChestSpikes(ctx, BH, BW, fg, col, edge) {
    for (var i = 0; i < 3; i++) {
      var bx = BW * (0.12 + i * 0.13);                  // step toward the beak (+X leading)
      var by = -BH * 0.49 + i * BH * 0.015;
      var sz = BH * 0.06;
      if (edge) {                                       // slightly larger dark triangle behind for value separation
        ctx.fillStyle = edge;
        ctx.beginPath();
        ctx.moveTo(bx - BW * 0.065, by - BH * 0.004);
        ctx.lineTo(bx + BW * 0.065, by - BH * 0.004);
        ctx.lineTo(bx, by + sz + BH * 0.008);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(bx - BW * 0.05, by);
      ctx.lineTo(bx + BW * 0.05, by);
      ctx.lineTo(bx, by + sz);                          // tip points down
      ctx.closePath(); ctx.fill();
    }
  }

  // §5 — Rodan crest horns at the skull rear; 'vsplit' (t2/t3) forks from a common base, tips hooked.
  function drawCrestHorns(ctx, BH, BW, hx, hy, style, col) {
    ctx.fillStyle = col;
    var n = 2;
    for (var i = 0; i < n; i++) {
      var len = BH * (0.16 - i * 0.03);
      var ang = (style === 'vsplit') ? (-0.5 - i * 0.5) : (-0.6 - i * 0.35);   // vsplit fans wider
      var ex = hx - Math.cos(ang) * len * 0.2, ey = hy + Math.sin(ang) * len * 0.2;
      var tx = hx - Math.cos(ang) * len, ty = hy - len * (style === 'vsplit' ? 0.9 : 1.0);
      var hook = (style === 'vsplit') ? (i === 0 ? BW * 0.05 : -BW * 0.05) : 0;   // tips curl toward each other
      ctx.beginPath();
      ctx.moveTo(ex - BW * 0.03, ey);
      ctx.lineTo(tx + hook, ty);
      ctx.lineTo(ex + BW * 0.03, ey);
      ctx.closePath(); ctx.fill();
    }
  }

  function buildFlyer(ctx, w, h, pal, shape, base, frame, fsm) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ANCHOR_X, ANCHOR_Y);

    var s         = shape || {};
    var wingSpan  = s.wingSpan != null ? s.wingSpan : 2.2;
    var wingStyle = s.wingStyle || 'moth';
    var bulkMult  = s.bulk     != null ? s.bulk     : 0.85;
    var isMoth = wingStyle === 'moth';

    var BH = h * 0.74 * bulkMult;
    var BW = BH * 0.5;

    var TAU = 6.2832;
    var flapPhase = (frame % FLAP_PERIOD) / FLAP_PERIOD * TAU;
    var atk = (fsm === 'attack') ? Math.sin(Math.min(1, frame / 5) * Math.PI) : 0;
    var flapAmp = s.flapAmp != null ? s.flapAmp : (isMoth ? 1.0 : 0.8);
    var wingFlap = Math.sin(flapPhase) * flapAmp + atk * flapAmp * 0.6;   // constant idle flap + additive attack downstroke (§7.4)
    var hover = Math.sin(flapPhase * 0.5) * BH * 0.02;                    // gentle floating oscillation

    var fg = facingGeom(base);
    ctx.translate(0, -hover);

    /* §7.5 detached altitude shadow (replaces the feet-contact ellipse) */
    drawAltitudeShadow(ctx, BH, BW, fg);

    var dark = pal.skinDark, skin = pal.skin, light = pal.skinLight;
    // half-span in px, scaled by wingSpan but CAPPED so the widest tip stays inside the 150px
    // canvas (anchor 75); wingSpan escalates relative size within that bound (§3.4/§5.4 feasibility).
    var WH = Math.min(BH * wingSpan * 0.125, s.godrays ? 55 : 50);   // supernova uncaps so its 3.3 span reads widest

    /* Supernova angelic aura halo behind the body (§3 apotheosis) */
    if (isMoth && pal.aura) {
      ctx.save();
      var ag = ctx.createRadialGradient(0, -BH * 0.46, 0, 0, -BH * 0.46, WH);
      ag.addColorStop(0, pal.aura); ag.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(0, -BH * 0.46, WH, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    /* back wing */
    if (isMoth) drawMothWing(ctx, WH, BH, fg, pal, wingFlap, false, dark, s);
    else        drawPteranoWing(ctx, WH, BH, fg, pal, wingFlap, false, dark, s);

    /* airborne body (horizontal — moth furred oval / rodan slim lozenge) */
    if (isMoth) drawMothThorax(ctx, BH, BW, fg, pal, s);
    else        drawPteranoBody(ctx, BH, BW, fg, pal);

    /* belly highlight (small underside sheen §1.8) */
    ctx.save(); ctx.globalAlpha = 0.30; ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(0, -BH * 0.40, BW * 0.16, BH * 0.10, 0, 0, 6.2832);
    ctx.fill(); ctx.restore();

    /* Rodan craggy sternum (§5) — bone/rock/gold spikes, pteranodon-only */
    if (wingStyle === 'pteranodon') {
      var spikeCol, spikeEdge;
      if (s.goldCrest)               { spikeCol = '#ffd24a'; spikeEdge = pal.skinDark; }   // Fire Rodan gold + dark backing
      else if (s.crest === 'vsplit') { spikeCol = '#9a6a50'; spikeEdge = pal.skinDark; }   // MV rock (lightened for legibility) + backing
      else                           { spikeCol = '#d8b070'; spikeEdge = null; }           // Showa bone-tan
      drawChestSpikes(ctx, BH, BW, fg, spikeCol, spikeEdge);
    }

    /* Rodan heat: magma cracks confined to the body band (flyerMode kills the wyrm vertical trunk §5) */
    if (s.fissures && pal.fissureCore) drawFissures(ctx, BH, BW, fg, pal.fissureCore, pal.fissureGlow, s.fissures, true);

    /* tucked talons (no planted feet / walk swing) */
    drawTuckedTalons(ctx, BH, BW, fg, dark);

    /* front wing */
    if (isMoth) drawMothWing(ctx, WH, BH, fg, pal, wingFlap, true, skin, s);
    else        drawPteranoWing(ctx, WH, BH, fg, pal, wingFlap, true, skin, s);

    /* Supernova GOD-RAYS overlay (after the wings, subtle gold spokes) */
    if (isMoth && s.godrays) drawGodRays(ctx, BH, WH, pal.plateEdge || pal.eye);

    /* head — lowered + nudged forward to attach to the airborne body */
    ctx.save();
    ctx.translate(isMoth ? 0 : BW * 0.12, BH * 0.30);
    drawFlyerHead(ctx, BH, BW, fg, pal, atk, wingStyle, s);
    ctx.restore();

    ctx.restore();
  }

  /* (drawFlyerTorso removed UH3 — buildFlyer's §7 rewrite uses drawMothThorax/drawPteranoBody.) */

  /* Moth wing: two overlapping quads, upper and lower lobe per wing.
     front=false → draw the far (back) side; front=true → near (front) side. */
  /* one moth wing LOBE — a rounded membrane from root to (tipX,tipY), scaled toward the root
     so concentric bands (border → field → root colour) nest for the banded-wing read (§3). */
  function mothLobe(ctx, rootX, rootY, tipX, tipY, side, BH, col, scale) {
    var tx = rootX + (tipX - rootX) * scale, ty = rootY + (tipY - rootY) * scale;
    var midUX = rootX + (tx - rootX) * 0.55 + side * BH * 0.10 * scale, midUY = (rootY + ty) * 0.5 - BH * 0.14 * scale;
    var midLX = rootX + (tx - rootX) * 0.5,  midLY = (rootY + ty) * 0.5 + BH * 0.14 * scale;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.quadraticCurveTo(midUX, midUY, tx, ty);                 // leading edge
    ctx.quadraticCurveTo(midLX, midLY, rootX + side * BH * 0.02, rootY + BH * 0.06 * scale);   // trailing
    ctx.closePath(); ctx.fill();
  }

  /* Mothra FOUR-wing (large fore + smaller hind per side) with a per-forewing EYESPOT (§3). */
  function drawMothWing(ctx, WH, BH, fg, pal, flap, front, baseCol, shape) {
    var lean = fg.dir, side = front ? 1 : -1;
    var flapAmt = flap * BH * 0.16;
    var nearW = WH * (front ? 1.0 : 0.85);
    var compress = front ? 1.0 : clamp(1.0 - lean * 0.5, 0.40, 1.0);
    var rootX = side * BW_from_BH(BH) * 0.16, rootY = -BH * 0.48;
    var alpha = front ? 0.95 : 0.82;                 // raised far-wing alpha (§7.6)
    var border = pal.plate || '#1a1a22';
    var field = (shape && shape.wingField) ? shape.wingField[0] : '#e88a2c';
    var rootCol = (shape && shape.wingField) ? shape.wingField[1] : '#f0c050';
    ctx.save();
    ctx.globalAlpha = alpha;
    /* FOREwing — large, swept high/forward; tip outward-offset so far/near read distinct */
    var level = !!(shape && shape.godrays);                     // supernova: forewings raised toward a descending-angel level
    var fTipX = side * nearW * 1.0 * compress + lean * side * BH * (level ? 0.04 : 0.10);
    var fTipY = (level ? -BH * 0.78 : -BH * 0.92) + flapAmt;
    mothLobe(ctx, rootX, rootY, fTipX, fTipY, side, BH, border, 1.0);
    mothLobe(ctx, rootX, rootY, fTipX, fTipY, side, BH, field, 0.80);
    mothLobe(ctx, rootX, rootY, fTipX, fTipY, side, BH, rootCol, 0.45);
    /* HINDwing — smaller, lower/back */
    var hTipX = side * nearW * 0.70 * compress;                 // pushed out so the 4-wing count resolves on all forms
    var hTipY = -BH * 0.04 + flapAmt * 1.1;
    mothLobe(ctx, rootX, rootY + BH * 0.05, hTipX, hTipY, side, BH, border, 1.0);
    mothLobe(ctx, rootX, rootY + BH * 0.05, hTipX, hTipY, side, BH, field, 0.78);
    /* EYESPOT on the forewing tip (the brand) — concentric border/iris/pale */
    var er = (shape && shape.eyespot != null ? shape.eyespot : 0.85);
    var ex = rootX + (fTipX - rootX) * 0.72, ey = rootY + (fTipY - rootY) * 0.62;
    ctx.fillStyle = border; ctx.beginPath(); ctx.arc(ex, ey, BH * 0.14 * er, 0, 6.2832); ctx.fill();
    ctx.fillStyle = pal.eyespotIris || pal.eye; ctx.beginPath(); ctx.arc(ex, ey, BH * 0.09 * er, 0, 6.2832); ctx.fill();
    ctx.fillStyle = pal.skinLight; ctx.beginPath(); ctx.arc(ex, ey, BH * 0.038 * er, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  function BW_from_BH(BH) { return BH * 0.5; }

  /* §3 — Supernova angelic GOD-RAYS: flat low-alpha gold spokes radiating from the thorax (baked,
     no composite/blur — opaque gold at low globalAlpha per §1.6). */
  function drawGodRays(ctx, BH, WH, col) {
    ctx.save();
    var cy = -BH * 0.46, rays = 7;
    ctx.fillStyle = col; ctx.globalAlpha = 0.13;
    for (var i = 0; i < rays; i++) {
      var a = (i / rays) * 6.2832 + 0.2, len = WH * (i % 2 ? 1.15 : 0.82), wsp = 0.10;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(Math.cos(a - wsp) * len, cy + Math.sin(a - wsp) * len);
      ctx.lineTo(Math.cos(a + wsp) * len, cy + Math.sin(a + wsp) * len);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /* Pteranodon wing (§5): one broad single-spar membrane with a SCALLOPED trailing edge (hard
     concave cuts — instantly not-Mothra). opts.scallops sets the notch count; opts.fireRim adds
     a glowing molten bottom-edge (rodan_mv/fire). */
  function drawPteranoWing(ctx, WH, BH, fg, pal, flap, front, baseCol, shape) {
    var lean = fg.dir, side = front ? 1 : -1;
    var flapAmt = flap * BH * 0.18;
    var nearW = WH * (front ? 1.0 : 0.80);
    var compress = front ? 1.0 : clamp(1.0 - lean * 0.5, 0.35, 1.0);
    var rootX = side * BW_from_BH(BH) * 0.22, rootY = -BH * 0.56;
    var tipX = side * nearW * 1.10 * compress + lean * side * BH * 0.06;
    var tipY = -BH * 0.62 + flapAmt;
    var alpha = front ? 0.92 : 0.80;
    var scallops = (shape && shape.scallops) ? shape.scallops : 2;
    var trailRootX = rootX + side * BH * 0.02, trailRootY = rootY + BH * 0.24;
    ctx.save();
    ctx.globalAlpha = alpha;
    var wg = ctx.createLinearGradient(rootX, rootY, tipX, tipY);
    wg.addColorStop(0, pal.skinLight); wg.addColorStop(0.45, baseCol); wg.addColorStop(1, pal.skinDark);
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.quadraticCurveTo(tipX * 0.5 + side * BH * 0.02, rootY - BH * 0.18 + flapAmt * 0.3, tipX, tipY);   // leading edge → tip
    for (var k = 0; k < scallops; k++) {                                  // SCALLOPED trailing edge (concave notches)
      var t1 = (k + 1) / scallops;
      var ax = lerp(tipX, trailRootX, t1), ay = lerp(tipY, trailRootY, t1) + BH * 0.04;   // §5 flatter trailing edge (less drooping skirt)
      var cxs = lerp(tipX, trailRootX, (k + 0.5) / scallops) - side * BH * 0.05;
      var cys = lerp(tipY, trailRootY, (k + 0.5) / scallops) + BH * 0.02;
      ctx.quadraticCurveTo(cxs, cys, ax, ay);
    }
    ctx.quadraticCurveTo(trailRootX, trailRootY, rootX, rootY);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = pal.skinDark; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.globalAlpha = alpha * 0.9;   // bold spar
    ctx.beginPath(); ctx.moveTo(rootX, rootY); ctx.quadraticCurveTo(tipX * 0.5, rootY - BH * 0.18 + flapAmt * 0.3, tipX, tipY); ctx.stroke();
    if (shape && shape.fireRim && pal.plateGlow) {                        // glowing molten trailing edge (heat tiers)
      ctx.strokeStyle = pal.plateGlow; ctx.lineWidth = BH * 0.03; ctx.lineJoin = 'round'; ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.moveTo(tipX, tipY);
      for (var m = 0; m < scallops; m++) { var tt = (m + 1) / scallops; ctx.lineTo(lerp(tipX, trailRootX, tt), lerp(tipY, trailRootY, tt) + BH * 0.04); }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* (drawBirdLeg removed UH3 — flyers no longer have planted walk legs; buildFlyer uses drawTuckedTalons.) */

  /* Flyer head: moth = round with large compound-eye suggestion;
     pteranodon = elongated crest + beak. */
  function drawFlyerHead(ctx, BH, BW, fg, pal, atk, wingStyle, shape) {
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
        if (shape && shape.joints) {                    // GxK forehead "third-eye" biolum spot
          ctx.fillStyle = pal.eye;
          ctx.beginPath(); ctx.arc(hx + BW * 0.24, -BH * 0.90, BW * 0.03, 0, 6.2832); ctx.fill();
        }
      }
      /* antennae — white feathery, swept back (§3 must-have) */
      ctx.strokeStyle = pal.skinLight; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx + BW * 0.22, -BH * 0.87);
      ctx.quadraticCurveTo(hx + BW * 0.10, -BH * 1.00, hx + BW * 0.05, -BH * 1.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx + BW * 0.34, -BH * 0.88);
      ctx.quadraticCurveTo(hx + BW * 0.26, -BH * 1.00, hx + BW * 0.22, -BH * 1.04);
      ctx.stroke();
    } else {
      /* pteranodon: rear-skull crest horns (drawCrestHorns) — straight bone (t1) vs forked rock (t2) vs forked gold (t3) */
      var crestStyle = (shape && shape.crest) || 'straight';
      var crestCol, crestBack;
      if (shape && shape.goldCrest)     { crestCol = '#ffd24a'; crestBack = pal.skinDark; }   // Fire Rodan gold + dark backing sliver
      else if (crestStyle === 'vsplit') { crestCol = '#9a6a50'; crestBack = pal.skinDark; }   // MV rock (lightened for legibility) + backing
      else                              { crestCol = '#d8b070'; crestBack = null; }           // Showa bone-tan reads on the brown body
      if (crestBack) drawCrestHorns(ctx, BH, BW, hx + BW * 0.30, -BH * 0.86 + BH * 0.012, crestStyle, crestBack);
      drawCrestHorns(ctx, BH, BW, hx + BW * 0.30, -BH * 0.86, crestStyle, crestCol);
      ctx.fillStyle = pal.skin;       /* head blob */
      ctx.beginPath();
      ctx.ellipse(hx + BW * 0.26, -BH * 0.84, BW * 0.18 * fg.headScale, BH * 0.08, 0, 0, 6.2832);
      ctx.fill();
      /* beak — long, down-hooked; shape.beakColor overrides (Fire Rodan charcoal-black, the #1 t3 cue) */
      ctx.fillStyle = (shape && shape.beakColor) || pal.skinDark;
      ctx.beginPath();
      ctx.moveTo(hx + BW * 0.34, -BH * 0.845);
      ctx.quadraticCurveTo(hx + BW * 0.56, -BH * 0.83 + mo, hx + BW * 0.58, -BH * 0.785 + mo * 0.5);   // long sweep to a drooped tip
      ctx.quadraticCurveTo(hx + BW * 0.52, -BH * 0.79 + mo, hx + BW * 0.40, -BH * 0.80);               // lower jaw back to the head
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

    var s          = shape || {};
    var heads      = s.heads      != null ? s.heads      : 3;
    var neckSpread = s.neckSpread != null ? s.neckSpread : 1.0;
    var wingSpan   = s.wingSpan   != null ? s.wingSpan   : 2.5;
    var isMech     = !!s.mech;
    var tails      = s.tails      != null ? s.tails      : 2;
    var bodyBulk   = s.bodyBulk   != null ? s.bodyBulk   : 1.0;

    var BH = h * 0.74 * 0.74 * bodyBulk;   /* smaller body so the tall neck-fan + crowns clear the canvas top; bodyBulk per tier (§4.5) */
    var BW = BH * 0.5;

    var walkT    = (frame % 6) / 6;
    var step     = Math.sin(walkT * Math.PI * 2);
    var bob      = (fsm === 'walk') ? Math.abs(step) * BH * 0.014 : 0;
    var atk      = (fsm === 'attack') ? Math.sin(Math.min(1, frame / 5) * Math.PI) : 0;
    var legSwing = (fsm === 'walk') ? step : 0;

    var fg = facingGeom(base);
    ctx.translate(0, -bob);

    /* ground contact ellipse OR void wormhole (void_ghidorah §4.6) */
    if (s.voidPortal) {
      var pr = BW * 0.85, pcy = -BH * 0.28;
      var pg = ctx.createRadialGradient(0, pcy, BW * 0.06, 0, pcy, pr);
      pg.addColorStop(0, 'rgba(0,224,255,0.50)'); pg.addColorStop(0.5, 'rgba(60,40,120,0.32)'); pg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(0, pcy, pr, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(0,224,255,0.45)'; ctx.lineWidth = 2.0;
      ctx.beginPath(); ctx.arc(0, pcy, pr * 0.55, 0, 6.2832); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath();
      ctx.ellipse(0, 2, BW * 1.20, BH * 0.05, 0, 0, 6.2832);
      ctx.fill();
    }

    var dark = pal.skinDark, skin = pal.skin, light = pal.skinLight;

    var WH = BH * wingSpan;

    /* void_ghidorah (§4.6) is a NO-BODY extra-dimensional being: ONLY the wormhole + the long
       writhing necks descending from it. Every other form draws the full Ghidorah body. */
    if (!s.voidPortal) {
      /* fan of tails (drawn behind everything) */
      for (var ti = 0; ti < tails; ti++) {
        var tFrac = tails > 1 ? (ti / (tails - 1) - 0.5) * 0.6 : 0;
        ctx.save();
        ctx.rotate(tFrac);
        drawTail(ctx, BH, BW, fg, dark);
        ctx.restore();
      }

      /* bat wings (Ghidorah forelimbs, drawn behind torso) — mechanical for mecha_ghidorah */
      drawBatWing(ctx, WH, BH, fg, pal, false, dark, { mech: isMech, spars: 4 });

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
      drawBatWing(ctx, WH, BH, fg, pal, true, skin, { mech: isMech, spars: 4 });
    }

    /* necks + heads fanned from the torso top (or descending from the void portal) */
    drawHydraHeads(ctx, BH, BW, fg, pal, s, atk, walkT);

    ctx.restore();
  }

  /* (A §4) TAPERED FILLED neck — replaces the flat round-cap stroke. Samples the quadratic
     spine root→ctrl→tip, offsets each sample along the curve NORMAL by halfWidth(t) (Canvas2D
     has no per-point lineWidth, so offset-fill is the only way), builds the outline, and fills
     with a root→tip gradient. opts.crestRim strokes the upper (crest) edge; opts.thorns studs
     the rose-thorn signature (void); opts.midVein draws a thin center vein (void gold). */
  function drawHydraNeck(ctx, p0x, p0y, cx, cy, p1x, p1y, nwBase, nwTip, gradTop, gradMid, gradBot, opts) {
    opts = opts || {};
    var N = 8, up = [], lo = [], mid = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N, mt = 1 - t;
      var px = mt * mt * p0x + 2 * mt * t * cx + t * t * p1x;
      var py = mt * mt * p0y + 2 * mt * t * cy + t * t * p1y;
      var tx = 2 * mt * (cx - p0x) + 2 * t * (p1x - cx);
      var ty = 2 * mt * (cy - p0y) + 2 * t * (p1y - cy);
      var len = Math.hypot(tx, ty) || 1;
      var nx = -ty / len, ny = tx / len;                 // unit normal
      var hw = lerp(nwBase, nwTip, t) * 0.5;
      up.push([px + nx * hw, py + ny * hw]);
      lo.push([px - nx * hw, py - ny * hw]);
      mid.push([px, py, nx, ny, hw]);
    }
    var g = ctx.createLinearGradient(p0x, p0y, p1x, p1y);
    g.addColorStop(0, gradBot); g.addColorStop(0.55, gradMid); g.addColorStop(1, gradTop);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(up[0][0], up[0][1]);
    for (var u = 1; u <= N; u++) ctx.lineTo(up[u][0], up[u][1]);
    for (var l = N; l >= 0; l--) ctx.lineTo(lo[l][0], lo[l][1]);
    ctx.closePath(); ctx.fill();
    /* rose thorns (void §4.6) — small outward triangles on alternating sides */
    if (opts.thorns) {
      ctx.fillStyle = opts.thornCol || gradTop;
      for (var k = 2; k < N; k += 1) {
        var m = mid[k], side = (k % 2 === 0) ? 1 : -1;
        var ex = m[0] + m[2] * m[4] * side, ey = m[1] + m[3] * m[4] * side;   // base on edge
        var tl = m[4] * 1.7;                                                   // thorn length
        // tangent dir for the thorn base spread
        var dxn = -m[3], dyn = m[2];
        ctx.beginPath();
        ctx.moveTo(ex - dxn * m[4] * 0.5, ey - dyn * m[4] * 0.5);
        ctx.lineTo(ex + m[2] * tl * side, ey + m[3] * tl * side);             // apex outward
        ctx.lineTo(ex + dxn * m[4] * 0.5, ey + dyn * m[4] * 0.5);
        ctx.closePath(); ctx.fill();
      }
    }
    /* RIM crest stroke on the upper edge (§1.1 / cyan-gold void rim) */
    if (opts.crestRim) {
      ctx.strokeStyle = opts.crestRim; ctx.lineWidth = opts.crestW || 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(up[0][0], up[0][1]);
      for (var u2 = 1; u2 <= N; u2++) ctx.lineTo(up[u2][0], up[u2][1]);
      ctx.stroke();
    }
    if (opts.midVein) {   // thin gold center vein (void)
      ctx.strokeStyle = opts.midVein; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mid[0][0], mid[0][1]);
      ctx.quadraticCurveTo(cx, cy, p1x, p1y); ctx.stroke();
    }
  }

  /* (B §4) Ghidorah head — small skull + back-swept HORN-CROWN (drawRidgeElement prongs) +
     golden eye. headHornStyle: 'crown' (3/side) · 'crown_tall' (4/side, +1 hooked tip) ·
     'asymmetric' (center forked, sides straight) · 'thorns' (many short spikes, void).
     Drawn in head-local space (caller translates/rotates/scales to the neck tip). */
  function drawGhidorahHead(ctx, BH, BW, pal, atk, style, isCenter) {
    var hw = BH * 0.11, hh = BH * 0.075;
    var face = pal.skinLight, core = pal.skinDark, tip = pal.skinLight, eyeCol = pal.eye;
    // skull ellipse + small snout (points +x)
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.ellipse(0, 0, hw, hh, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hw * 0.6, -hh * 0.4); ctx.lineTo(hw * 1.7, 0); ctx.lineTo(hw * 0.6, hh * 0.5);
    ctx.closePath(); ctx.fill();
    if (atk > 0.01) {                       // open-jaw beam-charge glow
      ctx.fillStyle = eyeCol; ctx.globalAlpha = 0.5 + atk * 0.4;
      ctx.beginPath(); ctx.arc(hw * 1.5, 0, hh * 0.6 * atk, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // HORN CROWN — prongs fan back-up over the skull; drawRidgeElement = dark core + lit tip
    var perSide = (style === 'crown_tall') ? 4 : (style === 'thorns') ? 6 : 3;
    var plen = BH * (style === 'thorns' ? 0.05 : 0.085) * (style === 'crown_tall' ? 1.3 : 1.0);
    for (var p = 0; p < perSide; p++) {
      var len2 = plen * (1 + (p === perSide - 1 && style === 'crown_tall' ? 0.55 : 0));   // hooked tip
      var px = -hw * (0.2 + p * 0.28);                          // step back along the skull
      var py = -hh * (0.3 + p * 0.10);
      var prongLean = -0.5 - p * 0.12;                          // sweep rearward
      drawRidgeElement(ctx, px, py, len2, prongLean, tip, core, 0.45);
      if (style === 'asymmetric' && isCenter) {                // forked antler on the center head
        drawRidgeElement(ctx, px - len2 * 0.16, py - len2 * 0.4, len2 * 0.6, prongLean - 0.3, tip, core, 0.4);
      }
    }
    // golden eye + white-hot core
    ctx.fillStyle = eyeCol;
    ctx.beginPath(); ctx.arc(hw * 0.5, -hh * 0.1, Math.max(1.8, BH * 0.024), 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(hw * 0.5, -hh * 0.1, Math.max(0.8, BH * 0.011), 0, 6.2832); ctx.fill();
  }

  /* (C §4) Bat wing — finger-spars from a wrist + smooth gold membrane (gradient) + a
     SCALLOPED trailing edge (distinct from Rodan's single-point membrane). opts.mech =
     hard straight spars + flat panel membrane + cyan edge (mecha_ghidorah). */
  function drawBatWing(ctx, WH, BH, fg, pal, front, baseCol, opts) {
    opts = opts || {};
    var side = front ? 1 : -1;
    var dir = fg.dir;
    var rootX = -BW_from_BH(BH) * 0.3 * 0, rootY = -BH * 0.55;
    var wx = side * WH * 0.22, wy = -BH * 0.70;                 // wrist — outward + UP so the wing droops as a leathery bat-wing, not a flat horizontal fan
    var spars = (opts.spars || 4);
    var tipsX = [], tipsY = [];
    for (var s = 0; s <= spars; s++) {
      var f = s / spars;
      var ex = wx + side * WH * (0.16 + f * 0.34);
      var ey = wy + (f - 0.5) * BH * 0.90 - (opts.mech ? 0 : Math.sin(f * Math.PI) * BH * 0.05);   // taller spar arc (0.55->0.90) → drooping membrane
      tipsX.push(ex); tipsY.push(ey);
    }
    // membrane fill
    var g = ctx.createLinearGradient(wx, wy - BH * 0.2, wx, wy + BH * 0.3);
    g.addColorStop(0, pal.skinLight); g.addColorStop(0.5, pal.skin); g.addColorStop(1, pal.skinDark);
    ctx.fillStyle = opts.mech ? pal.skin : g;
    ctx.beginPath();
    ctx.moveTo(0, rootY);
    ctx.lineTo(wx, wy);
    ctx.lineTo(tipsX[0], tipsY[0]);
    for (var t2 = 1; t2 <= spars; t2++) {
      if (opts.mech) ctx.lineTo(tipsX[t2], tipsY[t2]);
      else {                                                    // scalloped concave trailing edge
        var mxv = (tipsX[t2 - 1] + tipsX[t2]) / 2 - side * BH * 0.06;
        var myv = (tipsY[t2 - 1] + tipsY[t2]) / 2 + BH * 0.07;   // deeper concave scallop
        ctx.quadraticCurveTo(mxv, myv, tipsX[t2], tipsY[t2]);
      }
    }
    ctx.lineTo(0, rootY); ctx.closePath(); ctx.fill();
    // finger spars
    ctx.strokeStyle = opts.mech ? pal.plateEdge : pal.skinDark; ctx.lineWidth = opts.mech ? 1.8 : 2.0; ctx.lineCap = 'round';
    for (var sp = 0; sp <= spars; sp++) { ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(tipsX[sp], tipsY[sp]); ctx.stroke(); }
    // RIM leading edge
    ctx.strokeStyle = rimCol(0.22); ctx.lineWidth = 2.0;
    ctx.beginPath(); ctx.moveTo(0, rootY); ctx.lineTo(wx, wy); ctx.lineTo(tipsX[0], tipsY[0]); ctx.stroke();
  }

  /* Fan `nHeads` necks from the top of the torso, each with its own head.
     The central neck points along the body facing; outer necks sweep left/right.
     Walk animation gives each neck a gentle independent bob. */
  function drawHydraHeads(ctx, BH, BW, fg, pal, shape, atk, walkT) {
    var s = shape || {};
    var nHeads     = s.heads      != null ? s.heads      : 3;
    var neckSpread = s.neckSpread != null ? s.neckSpread : 1.0;
    var neckLenMul = s.neckLenMul != null ? s.neckLenMul : 1.0;
    var widthMul   = s.neckWidthMul != null ? s.neckWidthMul : 1.0;
    var hornStyle  = s.headHornStyle || 'crown';
    var thorns     = !!s.neckThorns;
    var cyborg     = !!s.cyborgCenter;
    var lean = fg.dir;
    var totalArc = 0.90 * neckSpread;
    var centerIdx = Math.floor(nHeads / 2);
    var goldPal = cyborg ? { skin: s.goldSkin, skinDark: s.goldDark, skinLight: s.goldLight, eye: pal.goldEye || '#ffd24a' } : null;
    var order = [];                                          // paint OUTER necks first, CENTER LAST (on top) — the MV asymmetric-trident depth cue
    for (var oi2 = 0; oi2 < nHeads; oi2++) if (oi2 !== centerIdx) order.push(oi2);
    order.push(centerIdx);
    for (var ord = 0; ord < order.length; ord++) {
      var n = order[ord];
      var frac = nHeads > 1 ? (n / (nHeads - 1) - 0.5) : 0;
      var arc  = frac * totalArc;
      var neckBob = Math.sin(walkT * Math.PI * 2 + n * 0.55) * BH * 0.05;   // idle (frame0)=0
      var rootX = BW * (0.10 + lean * 0.12) + frac * BW * 0.40 * neckSpread;
      var rootY = -BH * (s.voidPortal ? 0.32 : 0.82);        // void necks descend from the portal, not a torso top
      if (n === centerIdx && s.centerForward) { rootX += BW * 0.06 * (1 + lean); rootY += BH * 0.03; }  // Ichi (center) nudged forward
      var neckLen = BH * (0.32 + (1 - Math.abs(frac)) * 0.10) * neckLenMul;
      var sBend = thorns ? (hash(n + 1) - 0.5) * neckLen * 0.45 : 0;        // void: static S-curve
      var tipX = rootX + Math.sin(arc) * neckLen + sBend * 0.5;
      var tipY = rootY - Math.cos(arc) * neckLen + neckBob;
      var cx = rootX + Math.sin(arc * 0.5) * neckLen * 0.55 + sBend;
      var cy = rootY - neckLen * 0.55 + neckBob * 0.5;
      var isCenter = (n === centerIdx);
      var useMech = cyborg && isCenter;
      var np = (cyborg && !isCenter) ? goldPal : pal;
      var nwBase = BH * 0.11  * widthMul * (1 - Math.abs(frac) * 0.22);
      var nwTip  = BH * 0.045 * widthMul * (1 - Math.abs(frac) * 0.22);
      /* neck */
      var nopts = {};
      if (thorns) { nopts.thorns = true; nopts.thornCol = np.skinLight; nopts.crestRim = pal.neckRim || 'rgba(0,224,255,0.7)'; nopts.crestW = 2.0; nopts.midVein = '#ffcf3a'; }
      else nopts.crestRim = rimCol(isCenter ? 0.45 : 0.30);
      drawHydraNeck(ctx, rootX, rootY, cx, cy, tipX, tipY, nwBase, nwTip,
                    isCenter ? np.skinLight : np.skin, np.skin, np.skinDark, nopts);
      if (useMech) {                          /* steel neck braces (cyborg center) */
        ctx.strokeStyle = pal.skinDark; ctx.lineWidth = Math.max(1.5, nwBase * 0.35); ctx.lineCap = 'butt';
        for (var b = 1; b <= 3; b++) { var bt = b / 4, bx = lerp(rootX, tipX, bt), by = lerp(rootY, tipY, bt);
          ctx.beginPath(); ctx.moveTo(bx - nwBase * 0.5, by); ctx.lineTo(bx + nwBase * 0.5, by); ctx.stroke(); }
      }
      /* head at the tip */
      ctx.save();
      ctx.translate(tipX, tipY);
      ctx.rotate(arc * 0.35 + lean * 0.10);
      var headScale = (0.92 + (1 - Math.abs(frac)) * 0.20) * (isCenter ? 1.12 : 1.0);
      ctx.scale(headScale, headScale);
      if (useMech) {                          /* cyborg CENTER = mecha helmet head + cyan visor */
        var fakeFg = { show: 'side', headX: 0, headScale: 1, dir: lean, snout: 0.4 };
        var cyberPal = { skin: pal.skin, skinDark: pal.skinDark, skinLight: pal.skinLight, plate: pal.plate, plateEdge: pal.plateEdge, eye: pal.eye };
        drawMechHead(ctx, BH * 0.60, BW * 0.60, fakeFg, cyberPal, atk, 0, { headStyle: 'helmet' });
      } else {
        drawGhidorahHead(ctx, BH * 0.62, BW * 0.62, np, isCenter ? atk : atk * 0.6, hornStyle, isCenter);
      }
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

    var s        = shape || {};
    var plateN   = s.plates   != null ? s.plates   : 9;
    var antennae = s.antennae != null ? s.antennae : 1;
    var bulk     = s.bulk     != null ? s.bulk     : 1.0;   // per-tier over-built mass (§6.1)

    var BH = h * 0.74 * bulk;
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
    var torsoOpts = { joints: s.joints, leanPose: s.leanPose };
    var spineOpts = { spineSize: s.spineSize, leadFin: s.leadFin };
    var headOpts  = { headStyle: s.headStyle, cybanek: s.cybanek, horns: s.horns };

    /* backpack thruster cluster (super_mecha) — FIRST, behind the body */
    if (s.backpack) drawMechBackpack(ctx, BH, BW, fg, pal);

    /* tail — angular mech version (+ drill tip for mecha_3) */
    drawMechTail(ctx, BH, BW, fg, dark, pal, { drillTail: s.drillTail });

    /* far leg */
    ctx.fillStyle = dark;
    drawLeg(ctx, fg.farLegX * BW, BH, BW, -legSwing, fg);
    drawMechLegPanel(ctx, fg.farLegX * BW, BH, BW, pal, false);

    /* far arm */
    ctx.fillStyle = dark;
    drawArm(ctx, fg.farArmX * BW, -BH * 0.5, BH, BW, fg, -1, atk);

    /* torso silhouette — HARD BLOCK */
    drawMechTorso(ctx, BH, BW, fg, skin, dark, light, pal, torsoOpts);

    /* outward shoulder cannon pods (mecha_2) — the load-bearing silhouette break */
    if (s.shoulderCannon) drawShoulderCannon(ctx, BH, BW, fg, pal);

    /* panel overlays on torso */
    drawMechPanels(ctx, BH, BW, fg, pal, 1.0);

    /* dorsal spine array (replaces organic plates) */
    drawMechSpines(ctx, BH, BW, fg, pal, plateN, spineOpts);

    /* near leg */
    ctx.fillStyle = skin;
    drawLeg(ctx, fg.nearLegX * BW, BH, BW, legSwing, fg);
    drawMechLegPanel(ctx, fg.nearLegX * BW, BH, BW, pal, true);

    /* near arm */
    ctx.fillStyle = skin;
    drawArm(ctx, fg.nearArmX * BW, -BH * 0.5, BH, BW, fg, 1, atk);
    drawMechArmPanel(ctx, fg.nearArmX * BW, -BH * 0.5, BH, BW, pal);

    /* head */
    drawMechHead(ctx, BH, BW, fg, pal, atk, antennae, headOpts);

    ctx.restore();
  }

  /* mecha_2 §6.3 — a boxy launcher POD proud of the near shoulder; breaks the silhouette
     OUTWARD (the single most important mecha_2 add — changes the outline, not the surface). */
  function drawShoulderCannon(ctx, BH, BW, fg, pal) {
    var lean = fg.dir;
    var px = BW * (0.40 + lean * 0.08), py = -BH * 0.82;
    var pw = BW * 0.30, ph = BH * 0.22;
    ctx.fillStyle = pal.plate || pal.skinDark;
    ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.fill();
    ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 2.0; ctx.stroke();
    ctx.fillStyle = pal.skinDark;   // 2 muzzle bores on the outer face
    ctx.beginPath(); ctx.arc(px + pw * 0.74, py + ph * 0.32, BW * 0.045, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(px + pw * 0.74, py + ph * 0.68, BW * 0.045, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = rimCol(0.5); ctx.lineWidth = 1.6;   // RIM top
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + pw, py); ctx.stroke();
  }

  /* super_mecha §6.5 — upper-back thruster/missile cluster (the "Super" silhouette add). */
  function drawMechBackpack(ctx, BH, BW, fg, pal) {
    var bx = -BW * 0.54, by = -BH * 0.80, bw = BW * 0.34, bh = BH * 0.22;
    ctx.fillStyle = pal.plate || pal.skinDark;
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.fill();
    ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 2.0; ctx.stroke();
    ctx.fillStyle = pal.plateEdge;   // 3 thruster nozzles — opaque bright (§1.6, no blend)
    for (var n = 0; n < 3; n++) {
      ctx.beginPath(); ctx.arc(bx + bw * (0.22 + n * 0.28), by + bh, BW * 0.04, 0, 6.2832); ctx.fill();
    }
  }

  /* HARD-BLOCK mech torso (ARTP3 §6.1): a beveled-trapezoid robot chest — straight back
     edge, FLAT-TOP broad shoulder line, boxy taper to the waist — so the OUTLINE reads
     "machine" at iso (the old code reused the organic wyrm egg). opts.joints==='round'
     softens the top corners (mecha_1 crude/bulbous); opts.leanPose drops the block forward
     (mecha_3 predator crouch). Specular = the shared RIM token, NOT pal.skinLight (§1.1). */
  function drawMechTorso(ctx, BH, BW, fg, skin, dark, light, pal, opts) {
    opts = opts || {};
    var lean = fg.dir, round = opts.joints === 'round', lp = opts.leanPose ? BH * 0.05 : 0;
    var topY = -BH * (0.84 - (opts.leanPose ? 0.03 : 0));   // flat-top shoulder line
    ctx.fillStyle = pal.skin;
    ctx.beginPath();
    ctx.moveTo(-BW * 0.34, -BH * 0.28 + lp);               // back-bottom
    ctx.lineTo(-BW * 0.42, -BH * 0.72);                    // straight back rise
    if (round) ctx.quadraticCurveTo(-BW * 0.40, topY, -BW * 0.14, topY);   // bulbous top-left
    else       ctx.lineTo(-BW * 0.14, topY);              // sharp flat-top corner
    ctx.lineTo(BW * (0.24 + lean * 0.06), topY);          // FLAT broad shoulder top
    if (round) ctx.quadraticCurveTo(BW * (0.46 + lean * 0.08), -BH * 0.74, BW * (0.50 + lean * 0.06), -BH * 0.58);
    else { ctx.lineTo(BW * (0.50 + lean * 0.08), -BH * 0.72); ctx.lineTo(BW * (0.48 + lean * 0.06), -BH * 0.56); }
    ctx.lineTo(BW * (0.42 + lean * 0.04), -BH * 0.30 + lp);   // chest side (straight)
    ctx.lineTo(BW * 0.06, -BH * 0.13 + lp);               // waist bottom
    ctx.closePath(); ctx.fill();
    /* RIM specular on the top/shoulder edge (§1.1 — one key light, neutral warm-white) */
    ctx.save();
    ctx.strokeStyle = rimCol(0.5); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-BW * 0.14, topY);
    ctx.lineTo(BW * (0.24 + lean * 0.06), topY);
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
  function drawMechTail(ctx, BH, BW, fg, dark, pal, opts) {
    opts = opts || {};
    var d = fg.tailDir;
    /* base organic shape */
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(d * BW * 0.10, -BH * 0.30);
    ctx.quadraticCurveTo(d * BW * 0.85, -BH * 0.40, d * BW * 1.25, -BH * 0.06);
    ctx.quadraticCurveTo(d * BW * 1.12, BH * 0.02, d * BW * 0.95, -BH * 0.05);
    ctx.quadraticCurveTo(d * BW * 0.55, -BH * 0.20, d * BW * 0.08, -BH * 0.16);
    ctx.closePath(); ctx.fill();
    /* twin DRILL blades at the tip (mecha_3 §6.4) — two converging RIM-edged points */
    if (opts.drillTail) {
      var tx = d * BW * 1.25, ty = -BH * 0.06;
      ctx.fillStyle = pal.plate || pal.skinDark;
      for (var db = 0; db < 2; db++) {
        var oy = (db === 0 ? -BH * 0.05 : BH * 0.02);
        ctx.beginPath();
        ctx.moveTo(tx - d * BW * 0.10, ty + oy - BH * 0.02);
        ctx.lineTo(tx + d * BW * 0.22, ty + oy);                  // sharp drill point
        ctx.lineTo(tx - d * BW * 0.10, ty + oy + BH * 0.02);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rimCol(0.55); ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(tx - d * BW * 0.10, ty + oy - BH * 0.02);
        ctx.lineTo(tx + d * BW * 0.22, ty + oy); ctx.stroke();
      }
    }
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

  /* Mech dorsal spines: FLAT-TOPPED angular robot fins (distinct from the wyrm's pointed
     maple-leaf plates) with a dark CORE behind a lit FACE (§1.7 figure-ground separation,
     applied to the flat-top shape). opts.spineSize scales height per tier (0.7..1.15);
     opts.leadFin doubles the first (head-end) fin = super_mecha's giant lead dorsal fin.
     Specular = RIM (§1.1). */
  function drawMechSpines(ctx, BH, BW, fg, pal, N, opts) {
    if (N == null) N = 9;
    opts = opts || {};
    var spineSize = opts.spineSize != null ? opts.spineSize : 1.0;
    var lean = fg.plateLean;
    var core = pal.plate || pal.skinDark;
    for (var i = 0; i <= N; i++) {
      var t    = i / N;
      var x    = lerp(BW * (0.24 - lean * 0.10), -BW * (0.52 + lean * 0.05), t);
      var y    = -(lerp(0.80, 0.36, t) + Math.sin(t * Math.PI) * 0.06) * BH;
      var size = (Math.sin(t * Math.PI) * 0.10 + 0.045) * BH * spineSize;
      if (opts.leadFin && i === 0) size *= 1.7;   // giant lead dorsal fin (capped to fit the canvas)
      var bw = BW * 0.07;
      /* dark CORE — wider flat-top trapezoid behind (separation survives baking) */
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.moveTo(x - bw * 1.28, y + size * 0.32);
      ctx.lineTo(x - bw * 0.55, y - size * 1.10);
      ctx.lineTo(x + bw * 0.55, y - size * 1.10);
      ctx.lineTo(x + bw * 1.28, y + size * 0.32);
      ctx.closePath(); ctx.fill();
      /* lit FACE flat-topped fin */
      ctx.fillStyle = pal.skinLight;
      ctx.beginPath();
      ctx.moveTo(x - bw, y + size * 0.30);
      ctx.lineTo(x - bw * 0.35, y - size);
      ctx.lineTo(x + bw * 0.35, y - size);
      ctx.lineTo(x + bw, y + size * 0.30);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 1.8; ctx.stroke();
      /* RIM flat-top specular (§1.1) */
      ctx.save();
      ctx.strokeStyle = rimCol(0.5); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - bw * 0.35, y - size); ctx.lineTo(x + bw * 0.35, y - size); ctx.stroke();
      ctx.restore();
    }
  }

  /* Mech head (ARTP3 §6) — headStyle FINALIZED here (v19 Ghidorah cyborg consumes the
     'ghidorah' branch): 'box' (default) · 'roundShowa' (mecha_1 crude, + red Cybanek orbs) ·
     'helmet' (mecha_2/super sharp wedge snout) · 'ghidorah' (mecha_3 predator: backswept
     horns + twin red eyes, no visor). opts.cybanek/horns are the per-form silhouette adds.
     Specular = RIM (§1.1). */
  function drawMechHead(ctx, BH, BW, fg, pal, atk, antennae, opts) {
    opts = opts || {};
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

    /* skull — shape per headStyle */
    var hw = BW * 0.40 * hs;
    var hh = BH * 0.12 * hs;
    var hlx = hx + BW * 0.16;
    var hly = -BH * 0.90;
    var style = opts.headStyle || 'box';
    var ghid = style === 'ghidorah';
    ctx.fillStyle = pal.skin;
    ctx.beginPath();
    if (style === 'roundShowa') {                 // crude rounded skull (Showa)
      var rr = hh * 0.42;
      ctx.moveTo(hlx, hly + hh); ctx.lineTo(hlx, hly + rr);
      ctx.quadraticCurveTo(hlx, hly, hlx + rr, hly);
      ctx.lineTo(hlx + hw - rr, hly);
      ctx.quadraticCurveTo(hlx + hw, hly, hlx + hw, hly + rr);
      ctx.lineTo(hlx + hw, hly + hh); ctx.closePath();
    } else if (ghid || style === 'helmet') {       // angular wedge w/ forward snout point
      ctx.moveTo(hlx, hly + hh * 0.32);
      ctx.lineTo(hlx + hw * 0.26, hly);
      ctx.lineTo(hlx + hw * 0.94, hly + hh * 0.16);
      ctx.lineTo(hlx + hw + (ghid ? hw * 0.14 : hw * 0.05), hly + hh * 0.54);  // snout (ghidorah longer)
      ctx.lineTo(hlx + hw * 0.90, hly + hh);
      ctx.lineTo(hlx, hly + hh); ctx.closePath();
    } else {
      ctx.rect(hlx, hly, hw, hh);
    }
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

    /* eyes — twin red predator dots (ghidorah) or the visor bar+slit (others) */
    if (fg.show !== 'back34') {
      if (ghid) {
        ctx.fillStyle = pal.eye;
        var er = Math.max(2.0, hh * 0.17);
        ctx.beginPath(); ctx.arc(hlx + hw * 0.56, hly + hh * 0.46, er, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(hlx + hw * 0.84, hly + hh * 0.52, er, 0, 6.2832); ctx.fill();
      } else {
        ctx.fillStyle = pal.plate || pal.skinDark;
        ctx.beginPath(); ctx.rect(hlx + BW * 0.04, hly + hh * 0.35, hw * 0.80, hh * 0.28); ctx.fill();
        ctx.fillStyle = pal.eye; ctx.globalAlpha = 0.90;
        ctx.beginPath(); ctx.rect(hlx + BW * 0.06, hly + hh * 0.38, hw * 0.74, hh * 0.22); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    /* CYBANEK orbs (mecha_1) — two red temple domes outside the visor; THE Showa identifier */
    if (opts.cybanek) {
      var cr = Math.max(2.2, hw * 0.13);
      ctx.fillStyle = pal.eye;
      ctx.beginPath(); ctx.arc(hlx + hw * 0.04, hly + hh * 0.28, cr, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(hlx + hw * 0.96, hly + hh * 0.28, cr, 0, 6.2832); ctx.fill();
      ctx.fillStyle = rimCol(0.75);   // specular pinprick
      ctx.beginPath(); ctx.arc(hlx + hw * 0.04 - cr * 0.3, hly + hh * 0.28 - cr * 0.3, cr * 0.34, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(hlx + hw * 0.96 - cr * 0.3, hly + hh * 0.28 - cr * 0.3, cr * 0.34, 0, 6.2832); ctx.fill();
    }

    /* RIM specular edge on skull top (§1.1) */
    ctx.save();
    ctx.strokeStyle = rimCol(0.5); ctx.lineWidth = 2.2; ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(hlx, hly); ctx.lineTo(hlx + hw, hly);
    ctx.stroke(); ctx.restore();

    if (opts.horns) {
      /* backswept predator horns (ghidorah) — replace antennae; RIM-tipped */
      for (var hn = 0; hn < opts.horns; hn++) {
        var hxr = hlx + hw * (hn === 0 ? 0.30 : 0.64);
        ctx.strokeStyle = pal.skinDark; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hxr, hly + hh * 0.18);
        ctx.quadraticCurveTo(hxr - BW * 0.04, hly - BH * 0.05, hxr - BW * 0.15, hly - BH * 0.11);
        ctx.stroke();
        ctx.strokeStyle = rimCol(0.6); ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(hxr - BW * 0.09, hly - BH * 0.045);
        ctx.lineTo(hxr - BW * 0.15, hly - BH * 0.11);
        ctx.stroke();
      }
    } else {
      /* antennae */
      for (var an = 0; an < antennae; an++) {
        var ax = hlx + hw * (antennae === 1 ? 0.50 : (an === 0 ? 0.28 : 0.72));
        ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ax, hly);
        ctx.lineTo(ax + (an === 0 ? -BW * 0.06 : BW * 0.06), hly - BH * 0.09);
        ctx.stroke();
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.arc(ax + (an === 0 ? -BW * 0.06 : BW * 0.06), hly - BH * 0.09, 2.2, 0, 6.2832);
        ctx.fill();
      }
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
    drawHydraNeck:    drawHydraNeck,
    drawGhidorahHead: drawGhidorahHead,
    drawBatWing:      drawBatWing,

    /* Sprite canvas constants — entities.js must match these exactly. */
    SPR_W:    SPR_W,
    SPR_H:    SPR_H,
    ANCHOR_X: ANCHOR_X,
    ANCHOR_Y: ANCHOR_Y
  };

  G.Archetypes = Archetypes;

})(window.GAME);
