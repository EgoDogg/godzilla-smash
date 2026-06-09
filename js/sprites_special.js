/* GAME.SpriteBuilders — special-building draw functions (sprites_special.js).
 *
 * Each builder: (ctx, w, h, params) → draws into the provided offscreen context.
 * The context is already scaled to dpr (via assets.js bakeOrGet / Assets.get);
 * draw in CSS-pixel units with (0,0) at top-left. The canvas dimensions w×h and
 * anchor offsets are computed by assets.js prismMetrics before calling in; these
 * functions do NOT allocate their own canvases.
 *
 * Iso geometry conventions (matching assets.js exactly):
 *   TILE_W = 64, HW = 32  (iso diamond half-width in px)
 *   TILE_H = 32, HH = 16  (iso diamond half-height in px)
 *   WZ_PX  = 44           (screen-rise per world-Z height unit)
 *
 *   prismMetrics(wTiles, riseH):
 *     halfW  = wTiles * HW
 *     halfH  = wTiles * HH
 *     margin = 4
 *     w      = halfW*2 + margin*2
 *     h      = riseH + halfH*2 + margin*2
 *     ax     = w/2                       (foot-diamond center X)
 *     ay     = margin + riseH + halfH    (foot-diamond center Y)
 *
 * Lighting convention: right/SE wall light (×1.12), left/SW wall dark (×0.74),
 * top face brightest (×1.32). Matches all generic buildings; keeps a coherent
 * sun direction across every sprite in the scene.
 *
 * Public API: GAME.SpriteBuilders.{ statue, pyramid, field, sandpile, plane, houseTint }
 * Deps: GAME.Utils (shade, rng, hash, clamp, lerp). No GAME.Config reads — all
 * geometry is derived from w/h/params passed in by assets.js.
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var U = G.Utils;

  /* ------------------------------------------------------------------ *
   *  Iso geometry helpers (mirrored from assets.js so this file is      *
   *  self-contained; assets.js is the only caller so no divergence risk)*
   * ------------------------------------------------------------------ */
  var HW = 32;   // iso diamond half-width  (TILE_W/2)
  var HH = 16;   // iso diamond half-height (TILE_H/2)
  var MARGIN = 4;

  /* Reconstruct prismMetrics from canvas dimensions w×h.
   * assets.js always uses the same formula, so we can invert it:
   *   halfW = (w - MARGIN*2) / 2
   *   riseH = h - halfH*2 - MARGIN*2
   * wTiles is also available via params.footprint.w; use it directly.      */
  function metrics(w, h, wTiles) {
    var wt = wTiles || 1;
    var halfW = wt * HW;
    var halfH = wt * HH;
    var riseH = h - halfH * 2 - MARGIN * 2;
    var ax = w / 2;
    var ay = MARGIN + riseH + halfH;
    return { halfW: halfW, halfH: halfH, riseH: riseH, ax: ax, ay: ay };
  }

  /* Diamond vertex helpers given a center (ax, ay) and rise offset rz. */
  function diamondPts(ax, ay, halfW, halfH, rz) {
    rz = rz || 0;
    return {
      top: { x: ax,        y: ay - halfH - rz },
      rgt: { x: ax + halfW, y: ay         - rz },
      bot: { x: ax,        y: ay + halfH - rz },
      lft: { x: ax - halfW, y: ay         - rz }
    };
  }

  /* Fill an iso diamond (4-point path). */
  function fillDiamond(ctx, pts, color) {
    ctx.beginPath();
    ctx.moveTo(pts.top.x, pts.top.y);
    ctx.lineTo(pts.rgt.x, pts.rgt.y);
    ctx.lineTo(pts.bot.x, pts.bot.y);
    ctx.lineTo(pts.lft.x, pts.lft.y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /* Draw a standard iso box-prism.
   *   ax, ay       — foot-diamond center (from prismMetrics)
   *   halfW, halfH — foot diamond extents
   *   riseH        — vertical height in px
   *   bodyHex      — base body colour (#hex string)
   *   topHex       — optional override for top face (null → derive from body)
   *   roofStyle    — 'flat' | 'pitch'
   * Returns the six key diamond-point objects {foot, top} for callers to overlay. */
  function drawPrism(ctx, ax, ay, halfW, halfH, riseH, bodyHex, topHex, roofStyle) {
    var bodyR = U.shade(bodyHex, 1.12);
    var bodyL = U.shade(bodyHex, 0.74);
    var bodyT = topHex ? topHex : U.shade(bodyHex, 1.32);
    var edgeC = U.shade(bodyHex, 0.50);

    var foot = diamondPts(ax, ay, halfW, halfH, 0);
    var top  = diamondPts(ax, ay, halfW, halfH, riseH);

    /* Left / SW wall */
    ctx.beginPath();
    ctx.moveTo(top.lft.x, top.lft.y);
    ctx.lineTo(top.bot.x, top.bot.y);
    ctx.lineTo(foot.bot.x, foot.bot.y);
    ctx.lineTo(foot.lft.x, foot.lft.y);
    ctx.closePath();
    ctx.fillStyle = bodyL;
    ctx.fill();

    /* Right / SE wall */
    ctx.beginPath();
    ctx.moveTo(top.bot.x, top.bot.y);
    ctx.lineTo(top.rgt.x, top.rgt.y);
    ctx.lineTo(foot.rgt.x, foot.rgt.y);
    ctx.lineTo(foot.bot.x, foot.bot.y);
    ctx.closePath();
    ctx.fillStyle = bodyR;
    ctx.fill();

    /* Top face */
    if (roofStyle === 'pitch' && riseH > 0) {
      var ridgeH = halfH * 0.9;
      var ridgeBk = { x: ax, y: top.top.y - ridgeH };
      var ridgeFt = { x: ax, y: top.bot.y - ridgeH };
      ctx.beginPath();
      ctx.moveTo(top.lft.x, top.lft.y);
      ctx.lineTo(ridgeBk.x, ridgeBk.y);
      ctx.lineTo(ridgeFt.x, ridgeFt.y);
      ctx.lineTo(top.bot.x, top.bot.y);
      ctx.closePath();
      ctx.fillStyle = U.shade(bodyHex, 0.90);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(ridgeBk.x, ridgeBk.y);
      ctx.lineTo(top.rgt.x, top.rgt.y);
      ctx.lineTo(top.bot.x, top.bot.y);
      ctx.lineTo(ridgeFt.x, ridgeFt.y);
      ctx.closePath();
      ctx.fillStyle = U.shade(bodyHex, 1.15);
      ctx.fill();
    } else {
      fillDiamond(ctx, top, bodyT);
      /* Parapet rim */
      ctx.strokeStyle = U.shade(bodyHex, 1.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(top.lft.x, top.lft.y);
      ctx.lineTo(top.bot.x, top.bot.y);
      ctx.lineTo(top.rgt.x, top.rgt.y);
      ctx.stroke();
    }

    /* Vertical corner edges */
    ctx.strokeStyle = edgeC;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(foot.bot.x, foot.bot.y); ctx.lineTo(top.bot.x, top.bot.y);
    ctx.moveTo(foot.lft.x, foot.lft.y); ctx.lineTo(top.lft.x, top.lft.y);
    ctx.moveTo(foot.rgt.x, foot.rgt.y); ctx.lineTo(top.rgt.x, top.rgt.y);
    ctx.stroke();

    return { foot: foot, top: top };
  }

  /* ------------------------------------------------------------------ *
   *  1. STATUE — tall stone obelisk with a small torch flame on top     *
   * ------------------------------------------------------------------ */
  /* Config.SPECIALS.statue: footprint w:2 h:2, height:7 → riseH = 7×WZ_PX = 308px.
   * Rendered as a narrow stone obelisk (shaft) centred on the 2×2 footprint, with
   * a pyramidal capstone and a torch glow baked at the top.                       */
  function statue(ctx, w, h, params) {
    var wt  = (params && params.footprint && params.footprint.w) || 2;
    var m   = metrics(w, h, wt);
    var ax = m.ax, ay = m.ay, halfW = m.halfW, halfH = m.halfH, riseH = m.riseH;

    /* Base platform — wide, short, stone-grey */
    var baseRise = Math.round(riseH * 0.07);
    var basePts = drawPrism(ctx, ax, ay, halfW, halfH, baseRise, '#7a7268', null, 'flat');

    /* Shaft — narrow iso prism (1/3 the footprint width) */
    var shaftHW = Math.round(halfW * 0.32);
    var shaftHH = Math.round(halfH * 0.32);
    var shaftBase = ay - baseRise;   /* sits on top of the base platform */
    var shaftRise = Math.round(riseH * 0.78);
    drawPrism(ctx, ax, shaftBase, shaftHW, shaftHH, shaftRise, '#9b9284', null, 'flat');

    /* Capstone — tiny pyramid on top of the shaft */
    var capBase = shaftBase - shaftRise;
    var capHW = Math.round(shaftHW * 1.15);
    var capHH = Math.round(shaftHH * 1.15);
    var capRise = Math.round(riseH * 0.10);
    drawPrism(ctx, ax, capBase, capHW, capHH, capRise, '#b8ac9e', null, 'pitch');

    /* Torch flame glow — baked radial, no shadowBlur */
    var torchY = capBase - capRise - capHH * 0.5;
    var fr = Math.max(6, halfW * 0.22);
    var fg = ctx.createRadialGradient(ax, torchY, 0, ax, torchY, fr);
    fg.addColorStop(0,   'rgba(255,240,100,0.95)');
    fg.addColorStop(0.35,'rgba(255,140,20,0.80)');
    fg.addColorStop(1,   'rgba(255,80,0,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(ax - fr, torchY - fr, fr * 2, fr * 2);

    /* Torch core dot */
    ctx.fillStyle = 'rgba(255,255,200,0.9)';
    ctx.beginPath();
    ctx.arc(ax, torchY, Math.max(2, fr * 0.22), 0, Math.PI * 2);
    ctx.fill();

    /* Relief bands on the shaft (horizontal iso lines, purely decorative) */
    var bandCount = 4;
    var shaftTopY = shaftBase - shaftRise;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (var i = 1; i <= bandCount; i++) {
      var bFrac = i / (bandCount + 1);
      var bY = shaftBase - shaftRise * bFrac;
      /* Short horizontal tick marks at the shaft mid-line */
      ctx.beginPath();
      ctx.moveTo(ax - shaftHW * 0.8, bY + shaftHH * 0.2);
      ctx.lineTo(ax, bY);
      ctx.lineTo(ax + shaftHW * 0.8, bY - shaftHH * 0.2);
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ *
   *  2. PYRAMID — sand-coloured iso triangular prism                    *
   * ------------------------------------------------------------------ */
  /* Config.SPECIALS.pyramid: footprint w:2 h:2, height:3.5 → riseH ~154px.
   * A genuine iso pyramid: the four base corners form the foot diamond; the apex
   * converges to a single top point (the foot center lifted by riseH). The two
   * visible side triangles receive the same light/dark shading as the generic prism.*/
  function pyramid(ctx, w, h, params) {
    var wt   = (params && params.footprint && params.footprint.w) || 2;
    var m    = metrics(w, h, wt);
    var ax = m.ax, ay = m.ay, halfW = m.halfW, halfH = m.halfH, riseH = m.riseH;

    var foot = diamondPts(ax, ay, halfW, halfH, 0);
    var apex = { x: ax, y: ay - riseH };

    var sand      = '#d4b483';
    var sandLight = U.shade(sand, 1.18);
    var sandDark  = U.shade(sand, 0.68);
    var sandEdge  = U.shade(sand, 0.50);

    /* Left / SW face — darker */
    ctx.beginPath();
    ctx.moveTo(foot.lft.x, foot.lft.y);
    ctx.lineTo(apex.x,     apex.y);
    ctx.lineTo(foot.bot.x, foot.bot.y);
    ctx.closePath();
    ctx.fillStyle = sandDark;
    ctx.fill();

    /* Right / SE face — lighter */
    ctx.beginPath();
    ctx.moveTo(foot.bot.x, foot.bot.y);
    ctx.lineTo(apex.x,     apex.y);
    ctx.lineTo(foot.rgt.x, foot.rgt.y);
    ctx.closePath();
    ctx.fillStyle = sandLight;
    ctx.fill();

    /* Near edges from apex down to base corners */
    ctx.strokeStyle = sandEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(foot.bot.x, foot.bot.y);
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(foot.lft.x, foot.lft.y);
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(foot.rgt.x, foot.rgt.y);
    /* Base outline (front two edges only, back edges hidden) */
    ctx.moveTo(foot.lft.x, foot.lft.y);
    ctx.lineTo(foot.bot.x, foot.bot.y);
    ctx.lineTo(foot.rgt.x, foot.rgt.y);
    ctx.stroke();

    /* Subtle horizontal layering on the lit face — evokes stone courses */
    var courseCount = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.8;
    for (var i = 1; i < courseCount; i++) {
      var t = i / courseCount;          /* 0 = foot, 1 = apex */
      /* Interpolate along the right face: foot.bot→apex and foot.rgt→apex */
      var lx = foot.bot.x + (apex.x - foot.bot.x) * t;
      var ly = foot.bot.y + (apex.y - foot.bot.y) * t;
      var rx = foot.rgt.x + (apex.x - foot.rgt.x) * t;
      var ry = foot.rgt.y + (apex.y - foot.rgt.y) * t;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(rx, ry);
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ *
   *  3. FIELD — flat green iso rect + gridiron yard lines               *
   * ------------------------------------------------------------------ */
  /* Config.SPECIALS.football: footprint w:3 h:2, height:0.2 → riseH ~9px.
   * Very flat prism (turf pad) with a top face painted with yard stripes.
   * The field is landscape-oriented; only the two visible walls + top are drawn. */
  function field(ctx, w, h, params) {
    var wt  = (params && params.footprint && params.footprint.w) || 3;
    var m   = metrics(w, h, wt);
    var ax = m.ax, ay = m.ay, halfW = m.halfW, halfH = m.halfH, riseH = m.riseH;

    /* Low flat prism — field green base */
    drawPrism(ctx, ax, ay, halfW, halfH, riseH, '#2d6a2d', null, 'flat');

    /* Top face geometry (same as drawPrism flat top) */
    var top = diamondPts(ax, ay, halfW, halfH, riseH);

    /* Re-fill top with turf gradient: brighter center-strip (lit) */
    var tg = ctx.createLinearGradient(top.lft.x, top.lft.y, top.rgt.x, top.rgt.y);
    tg.addColorStop(0,   '#2d6a2d');
    tg.addColorStop(0.5, '#3a8c3a');
    tg.addColorStop(1,   '#2d6a2d');
    ctx.beginPath();
    ctx.moveTo(top.top.x, top.top.y);
    ctx.lineTo(top.rgt.x, top.rgt.y);
    ctx.lineTo(top.bot.x, top.bot.y);
    ctx.lineTo(top.lft.x, top.lft.y);
    ctx.closePath();
    ctx.fillStyle = tg;
    ctx.fill();

    /* Yard lines: iso stripes across the diamond top face.
     * We draw 11 equidistant lines from lft→top (left side) to bot→rgt (right side),
     * parametrically across the diamond using u = 0..1.                           */
    var lineCount = 11;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.8;
    for (var i = 0; i <= lineCount; i++) {
      var u = i / lineCount;
      /* Left edge: lerp from top.lft to top.top (back-left to back vertex) */
      var lx = top.lft.x + (top.top.x - top.lft.x) * u;
      var ly = top.lft.y + (top.top.y - top.lft.y) * u;
      /* Right edge: lerp from top.bot to top.rgt (front vertex to front-right) */
      var rx = top.bot.x + (top.rgt.x - top.bot.x) * u;
      var ry = top.bot.y + (top.rgt.y - top.bot.y) * u;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(rx, ry);
      ctx.stroke();
    }

    /* Centre line — brighter */
    ctx.strokeStyle = 'rgba(255,255,255,0.80)';
    ctx.lineWidth = 1.2;
    var cx5 = top.lft.x + (top.top.x - top.lft.x) * 0.5;
    var cy5 = top.lft.y + (top.top.y - top.lft.y) * 0.5;
    var cx6 = top.bot.x + (top.rgt.x - top.bot.x) * 0.5;
    var cy6 = top.bot.y + (top.rgt.y - top.bot.y) * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx5, cy5);
    ctx.lineTo(cx6, cy6);
    ctx.stroke();

    /* End-zone hash marks (near the two short edges) */
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.8;
    var ezFracs = [0.08, 0.92];
    for (var e = 0; e < ezFracs.length; e++) {
      var ef = ezFracs[e];
      var elx = top.lft.x + (top.top.x - top.lft.x) * ef;
      var ely = top.lft.y + (top.top.y - top.lft.y) * ef;
      var erx = top.bot.x + (top.rgt.x - top.bot.x) * ef;
      var ery = top.bot.y + (top.rgt.y - top.bot.y) * ef;
      ctx.beginPath();
      ctx.moveTo(elx, ely);
      ctx.lineTo(erx, ery);
      ctx.stroke();
    }

    /* Goal posts — two small upright stubs at each end (front two end-zones) */
    var postCol = 'rgba(255,220,50,0.85)';
    ctx.strokeStyle = postCol;
    ctx.lineWidth = 1.5;
    /* Front end-zone center (near end, u≈0.08) */
    var fez = 0.08;
    var pCx = top.lft.x + (top.top.x - top.lft.x) * fez;
    var pCy = top.lft.y + (top.top.y - top.lft.y) * fez;
    var pRx = top.bot.x + (top.rgt.x - top.bot.x) * fez;
    var pRy = top.bot.y + (top.rgt.y - top.bot.y) * fez;
    var pMx = (pCx + pRx) * 0.5, pMy = (pCy + pRy) * 0.5;
    ctx.beginPath();
    ctx.moveTo(pMx, pMy);
    ctx.lineTo(pMx, pMy - 8);
    ctx.moveTo(pMx - 4, pMy - 8);
    ctx.lineTo(pMx + 4, pMy - 8);
    ctx.stroke();
  }

  /* ------------------------------------------------------------------ *
   *  4. SANDPILE — low mound on a small footprint                       *
   * ------------------------------------------------------------------ */
  /* Config.SPECIALS.sandpile: footprint w:1 h:1, height:0.5 → riseH ~22px.
   * Drawn as a low convex dome (approximated as a squat ellipse) over the foot
   * diamond, sand-coloured with an AO shadow at the base.                        */
  function sandpile(ctx, w, h, params) {
    var wt  = (params && params.footprint && params.footprint.w) || 1;
    var m   = metrics(w, h, wt);
    var ax = m.ax, ay = m.ay, halfW = m.halfW, halfH = m.halfH, riseH = m.riseH;

    /* AO contact shadow on the ground — soft radial ring */
    var aoG = ctx.createRadialGradient(ax, ay, 0, ax, ay, halfW);
    aoG.addColorStop(0,   'rgba(0,0,0,0.22)');
    aoG.addColorStop(0.6, 'rgba(0,0,0,0.10)');
    aoG.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = aoG;
    /* Draw it as an iso-ellipse (scale Y by HH/HW ratio ≈ 0.5) */
    ctx.save();
    ctx.translate(ax, ay);
    ctx.scale(1, HH / HW);
    ctx.beginPath();
    ctx.arc(0, 0, halfW * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* Mound body: iso-ellipse centred slightly above the foot center.
     * Gradient: top-lit warm sand at the crown, darker at the toe. */
    var moundCY = ay - riseH * 0.55;
    var moundRX = halfW * 0.82;
    var moundRY = (halfH + riseH * 0.5) * 0.72;

    var mg = ctx.createRadialGradient(ax - moundRX * 0.2, moundCY - moundRY * 0.3, 0,
                                       ax, moundCY, Math.max(moundRX, moundRY));
    mg.addColorStop(0,   '#e8d8a8');   /* lit crown */
    mg.addColorStop(0.45,'#d4b870');   /* mid sand  */
    mg.addColorStop(1,   '#a07840');   /* toe/base  */

    ctx.save();
    ctx.translate(ax, moundCY);
    ctx.scale(1, moundRY / moundRX);
    ctx.beginPath();
    ctx.arc(0, 0, moundRX, 0, Math.PI * 2);
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.restore();

    /* Subtle dark rim at the base to separate mound from ground */
    ctx.strokeStyle = 'rgba(100,72,30,0.35)';
    ctx.lineWidth = 1;
    ctx.save();
    ctx.translate(ax, ay - riseH * 0.1);
    ctx.scale(1, HH / HW);
    ctx.beginPath();
    ctx.arc(0, 0, halfW * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   *  5. PLANE — small iso aircraft (flying building)                    *
   * ------------------------------------------------------------------ */
  /* Config.SPECIALS.airplane: footprint w:1 h:1, altitude:6.5.
   * Rendered as a top-down iso aircraft silhouette: fuselage + swept wings +
   * tail. The whole sprite fits within the 1×1 footprint canvas.
   * Colour: light pearl-grey with a metallic sheen.                             */
  function plane(ctx, w, h, params) {
    /* Ignore prismMetrics — the plane is a flat sprite, not a box. Draw centred. */
    var cx = w / 2;
    var cy = h / 2;
    var sc = Math.min(w, h) * 0.38;   /* overall scale; fits the tile */

    var hull = '#d8dce4';
    var dark = '#9aa4b0';
    var lite = '#f0f3f8';
    var wing = '#c4cdd8';

    /* Fuselage — elongated iso ellipse along the iso SE axis */
    var fLen = sc * 1.6;
    var fWid = sc * 0.28;
    /* SE direction in iso: (1, 0.5) normalised. Use ctx rotation. */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(0.5, 1));    /* ≈ 26.6° — iso SE angle */

    /* Fuselage body */
    ctx.beginPath();
    ctx.ellipse(0, 0, fLen * 0.5, fWid * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = hull;
    ctx.fill();
    /* Fuselage lit top strip */
    ctx.beginPath();
    ctx.ellipse(0, -fWid * 0.12, fLen * 0.42, fWid * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = lite;
    ctx.fill();

    /* Main wings — swept back, flat quads above fuselage */
    ctx.beginPath();
    ctx.moveTo(-fLen * 0.05,  0);
    ctx.lineTo(-fLen * 0.35, -sc * 0.70);
    ctx.lineTo(-fLen * 0.25, -sc * 0.72);
    ctx.lineTo( fLen * 0.12,  0);
    ctx.closePath();
    ctx.fillStyle = wing;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-fLen * 0.05,  0);
    ctx.lineTo(-fLen * 0.35,  sc * 0.70);
    ctx.lineTo(-fLen * 0.25,  sc * 0.72);
    ctx.lineTo( fLen * 0.12,  0);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();

    /* Tail fin */
    ctx.beginPath();
    ctx.moveTo( fLen * 0.40,  0);
    ctx.lineTo( fLen * 0.32, -sc * 0.28);
    ctx.lineTo( fLen * 0.22,  0);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo( fLen * 0.40,  0);
    ctx.lineTo( fLen * 0.32,  sc * 0.28);
    ctx.lineTo( fLen * 0.22,  0);
    ctx.closePath();
    ctx.fillStyle = wing;
    ctx.fill();

    /* Cockpit glint */
    ctx.beginPath();
    ctx.ellipse(-fLen * 0.42, 0, fWid * 0.40, fWid * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(150,220,255,0.70)';
    ctx.fill();

    /* Engine nacelles (two dots under the wings) */
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(-fLen * 0.18, -sc * 0.32, fWid * 0.22, fWid * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-fLen * 0.18,  sc * 0.32, fWid * 0.22, fWid * 0.12, 0, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    /* Thin edge outline for contrast against bright sky */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(0.5, 1));
    ctx.beginPath();
    ctx.ellipse(0, 0, fLen * 0.5, fWid * 0.5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(80,90,110,0.40)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   *  6. HOUSETINT — recolour the generic house prism for rare spawns    *
   * ------------------------------------------------------------------ */
  /* params.tint: 'gold' | 'rainbow' | 'diamond'
   * Draws the same house-band prism (wz:1.5, pitch roof, 2×2 windows) but in a
   * special palette, then overlays a type-specific sheen.
   *   gold    — rich golden body, warm window glow, radial gold sheen on roof.
   *   rainbow — iridescent HSL-cycle gradient overlaid on a neutral body.
   *   diamond — cold near-white body, ice-blue windows, specular hard edge.     */
  function houseTint(ctx, w, h, params) {
    var tint = (params && params.tint) || 'gold';
    var wt   = (params && params.footprint && params.footprint.w) || 1;
    var m    = metrics(w, h, wt);
    var ax = m.ax, ay = m.ay, halfW = m.halfW, halfH = m.halfH, riseH = m.riseH;

    /* ---- choose palette ---- */
    var bodyHex, glowCol, roofMul;
    switch (tint) {
      case 'rainbow':
        bodyHex = '#7a7a8a';
        glowCol = '#ffffff';
        roofMul = 1.10;
        break;
      case 'diamond':
        bodyHex = '#c8d8e8';
        glowCol = '#9be8ff';
        roofMul = 1.40;
        break;
      case 'gold':
      default:
        bodyHex = '#b8860b';
        glowCol = '#ffd700';
        roofMul = 1.25;
        break;
    }

    var bodyR   = U.shade(bodyHex, 1.12);
    var bodyL   = U.shade(bodyHex, 0.74);
    var edgeC   = U.shade(bodyHex, 0.50);
    var winDark = U.shade(bodyHex, 0.42);

    var foot = diamondPts(ax, ay, halfW, halfH, 0);
    var top  = diamondPts(ax, ay, halfW, halfH, riseH);

    /* ---- Left/SW wall ---- */
    ctx.beginPath();
    ctx.moveTo(top.lft.x, top.lft.y);
    ctx.lineTo(top.bot.x, top.bot.y);
    ctx.lineTo(foot.bot.x, foot.bot.y);
    ctx.lineTo(foot.lft.x, foot.lft.y);
    ctx.closePath();
    ctx.fillStyle = bodyL;
    ctx.fill();

    /* ---- Right/SE wall ---- */
    ctx.beginPath();
    ctx.moveTo(top.bot.x, top.bot.y);
    ctx.lineTo(top.rgt.x, top.rgt.y);
    ctx.lineTo(foot.rgt.x, foot.rgt.y);
    ctx.lineTo(foot.bot.x, foot.bot.y);
    ctx.closePath();
    ctx.fillStyle = bodyR;
    ctx.fill();

    /* ---- Windows (2×2, matching house band) ---- */
    var cols = 2, rows = 2;
    var winQuads = [
      [top.lft, top.bot, foot.bot, foot.lft],  /* left wall */
      [top.bot, top.rgt, foot.rgt, foot.bot]   /* right wall */
    ];
    var winFills = [U.shade(bodyL, 0.78), bodyR];
    var lit = 0.65;

    for (var side = 0; side < 2; side++) {
      var q = winQuads[side];
      var tl = q[0], tr = q[1], br = q[2], bl = q[3];
      var mx = 0.22, my = 0.16, ww = 0.56, wh = 0.62;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var u0 = (c + mx) / cols, v0 = (r + my) / rows;
          var u1 = (c + mx + ww) / cols, v1 = (r + my + wh) / rows;
          var p00 = bilerp4(tl, tr, bl, br, u0, v0);
          var p10 = bilerp4(tl, tr, bl, br, u1, v0);
          var p11 = bilerp4(tl, tr, bl, br, u1, v1);
          var p01 = bilerp4(tl, tr, bl, br, u0, v1);
          ctx.beginPath();
          ctx.moveTo(p00.x, p00.y);
          ctx.lineTo(p10.x, p10.y);
          ctx.lineTo(p11.x, p11.y);
          ctx.lineTo(p01.x, p01.y);
          ctx.closePath();
          ctx.fillStyle = glowCol;
          ctx.fill();
        }
      }
    }

    /* ---- Pitched roof ---- */
    var ridgeH  = halfH * 0.9;
    var ridgeBk = { x: ax, y: top.top.y - ridgeH };
    var ridgeFt = { x: ax, y: top.bot.y - ridgeH };
    /* Left slope */
    ctx.beginPath();
    ctx.moveTo(top.lft.x, top.lft.y);
    ctx.lineTo(ridgeBk.x, ridgeBk.y);
    ctx.lineTo(ridgeFt.x, ridgeFt.y);
    ctx.lineTo(top.bot.x, top.bot.y);
    ctx.closePath();
    ctx.fillStyle = U.shade(bodyHex, 0.90 * roofMul);
    ctx.fill();
    /* Right slope (lit) */
    ctx.beginPath();
    ctx.moveTo(ridgeBk.x, ridgeBk.y);
    ctx.lineTo(top.rgt.x, top.rgt.y);
    ctx.lineTo(top.bot.x, top.bot.y);
    ctx.lineTo(ridgeFt.x, ridgeFt.y);
    ctx.closePath();
    ctx.fillStyle = U.shade(bodyHex, 1.15 * roofMul);
    ctx.fill();

    /* ---- Vertical edges ---- */
    ctx.strokeStyle = edgeC;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(foot.bot.x, foot.bot.y); ctx.lineTo(top.bot.x, top.bot.y);
    ctx.moveTo(foot.lft.x, foot.lft.y); ctx.lineTo(top.lft.x, top.lft.y);
    ctx.moveTo(foot.rgt.x, foot.rgt.y); ctx.lineTo(top.rgt.x, top.rgt.y);
    ctx.stroke();

    /* ---- Tint-specific sheen overlays ---- */
    if (tint === 'gold') {
      /* Warm radial glow centered on the roof ridge */
      var midRidgeX = (ridgeBk.x + ridgeFt.x) * 0.5;
      var midRidgeY = (ridgeBk.y + ridgeFt.y) * 0.5;
      var gg = ctx.createRadialGradient(midRidgeX, midRidgeY, 0, midRidgeX, midRidgeY, halfW * 0.9);
      gg.addColorStop(0,   'rgba(255,220,80,0.45)');
      gg.addColorStop(0.5, 'rgba(255,180,0,0.22)');
      gg.addColorStop(1,   'rgba(255,150,0,0)');
      ctx.fillStyle = gg;
      /* Clip to visible prism area with a bounding rect */
      ctx.fillRect(ax - halfW, top.top.y - ridgeH, halfW * 2, riseH + halfH * 2);

      /* Hard specular edge on the right SE vertical */
      var sg = ctx.createLinearGradient(foot.bot.x, foot.bot.y, top.bot.x, top.bot.y);
      sg.addColorStop(0,   'rgba(255,240,100,0)');
      sg.addColorStop(0.5, 'rgba(255,240,100,0.55)');
      sg.addColorStop(1,   'rgba(255,240,100,0)');
      ctx.strokeStyle = sg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(foot.bot.x, foot.bot.y);
      ctx.lineTo(top.bot.x, top.bot.y);
      ctx.stroke();
    }

    if (tint === 'rainbow') {
      /* HSL-cycle gradient overlay: sweep hue across the prism top-to-bottom */
      var rbSteps = 8;
      var rbTop = top.top.y - ridgeH;
      var rbBot = ay + halfH;
      var rbH = rbBot - rbTop;
      for (var ri = 0; ri < rbSteps; ri++) {
        var hue = (ri / rbSteps) * 360;
        var rg = ctx.createLinearGradient(0, rbTop + rbH * (ri / rbSteps),
                                           0, rbTop + rbH * ((ri + 1) / rbSteps));
        rg.addColorStop(0,   'hsla(' + hue + ',90%,58%,0.25)');
        rg.addColorStop(1,   'hsla(' + ((hue + 45) % 360) + ',90%,58%,0.25)');
        ctx.fillStyle = rg;
        ctx.fillRect(ax - halfW - 2, rbTop + rbH * (ri / rbSteps),
                     halfW * 2 + 4, rbH / rbSteps + 1);
      }
      /* Bright rainbow edge along SE vertical */
      var reSeg = 6;
      var reH = riseH / reSeg;
      for (var ei = 0; ei < reSeg; ei++) {
        var ehue = (ei / reSeg) * 360;
        var ey0 = foot.bot.y - (ei + 1) * reH;
        var ey1 = foot.bot.y - ei * reH;
        var emx = (foot.bot.x + top.bot.x) * 0.5 + (foot.bot.x - top.bot.x) * ((ei + 0.5) / reSeg - 0.5);
        /* approximate the SE vertical midpoint; just stroke a tiny segment */
        var t0 = ei / reSeg, t1 = (ei + 1) / reSeg;
        var ex0 = foot.bot.x + (top.bot.x - foot.bot.x) * t0;
        var ey0b = foot.bot.y + (top.bot.y - foot.bot.y) * t0;
        var ex1 = foot.bot.x + (top.bot.x - foot.bot.x) * t1;
        var ey1b = foot.bot.y + (top.bot.y - foot.bot.y) * t1;
        ctx.strokeStyle = 'hsla(' + ehue + ',100%,65%,0.70)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ex0, ey0b);
        ctx.lineTo(ex1, ey1b);
        ctx.stroke();
      }
    }

    if (tint === 'diamond') {
      /* Ice-blue specular band along SE vertical */
      var dg = ctx.createLinearGradient(foot.bot.x, foot.bot.y, top.bot.x, top.bot.y);
      dg.addColorStop(0,   'rgba(155,232,255,0)');
      dg.addColorStop(0.40,'rgba(155,232,255,0.75)');
      dg.addColorStop(0.55,'rgba(255,255,255,0.95)');
      dg.addColorStop(1,   'rgba(155,232,255,0)');
      ctx.strokeStyle = dg;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(foot.bot.x, foot.bot.y);
      ctx.lineTo(top.bot.x, top.bot.y);
      ctx.stroke();

      /* Faceted glint on the right roof slope */
      ctx.strokeStyle = 'rgba(200,240,255,0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(top.rgt.x, top.rgt.y);
      ctx.lineTo(ridgeBk.x, ridgeBk.y);
      ctx.stroke();

      /* Cool ambient fill over the right wall */
      var daw = ctx.createLinearGradient(top.bot.x, top.bot.y, top.rgt.x, top.rgt.y);
      daw.addColorStop(0,   'rgba(155,232,255,0.18)');
      daw.addColorStop(1,   'rgba(155,232,255,0)');
      ctx.beginPath();
      ctx.moveTo(top.bot.x, top.bot.y);
      ctx.lineTo(top.rgt.x, top.rgt.y);
      ctx.lineTo(foot.rgt.x, foot.rgt.y);
      ctx.lineTo(foot.bot.x, foot.bot.y);
      ctx.closePath();
      ctx.fillStyle = daw;
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------------ *
   *  Internal helpers                                                   *
   * ------------------------------------------------------------------ */
  /* Bilinear interpolate inside a quad (tl,tr,bl,br) at (u,v) ∈ [0,1]. */
  function bilerp4(tl, tr, bl, br, u, v) {
    var topx = tl.x + (tr.x - tl.x) * u;
    var topy = tl.y + (tr.y - tl.y) * u;
    var botx = bl.x + (br.x - bl.x) * u;
    var boty = bl.y + (br.y - bl.y) * u;
    return { x: topx + (botx - topx) * v, y: topy + (boty - topy) * v };
  }

  /* ------------------------------------------------------------------ *
   *  Export                                                             *
   * ------------------------------------------------------------------ */
  G.SpriteBuilders = {
    statue:    statue,
    pyramid:   pyramid,
    field:     field,
    sandpile:  sandpile,
    plane:     plane,
    houseTint: houseTint,
  };

})(window.GAME);
