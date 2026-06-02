/* GAME.Assets — procedural offscreen-canvas cache (Phase B integration module).
 *
 * Everything in v2 is drawn with code, never loaded — so anything expensive to
 * rasterise (the iso ground diamond, every building prism, every kaiju body
 * frame) is baked ONCE into an offscreen <canvas> and thereafter slammed onto
 * the scene with a single drawImage. This module owns that bake-and-memoize
 * layer.
 *
 * Public API (per blueprint §2 / §7):
 *   GAME.Assets.get(key, w, h, drawFn) -> HTMLCanvasElement
 *        Memoised. If `key` is already cached, returns it untouched (LRU bump).
 *        Otherwise allocates a w×h CSS-pixel canvas backed at device-pixel
 *        resolution (dpr), pre-scales the context so drawFn works in CSS units
 *        with origin (0,0) = top-left, calls drawFn(ctx, w, h), caches, returns.
 *        Kaiju / Titan modules call this with their own body-frame draw fns.
 *   GAME.Assets.groundTile() -> canvas        // the 64×32 iso ground diamond
 *   GAME.Assets.buildingSprite(tier, wTiles, stage) -> canvas
 *        Iso box-prism for the tier's style band, damage stage 0|1|2, with
 *        baked windows / edges / roof / rooftop greebles. NO live shadowBlur.
 *   GAME.Assets.invalidate(prefix)            // drop every key starting prefix
 *
 * Deps: GAME.Config (grid + EVOLUTIONS/style sizing), GAME.Utils (shade/clamp/
 * lerp/hash/rng). Reads GAME.dpr (set by game.js on resize) or defaults to 2.
 *
 * Perf contract: no shadowBlur in the render loop — glows here are baked with
 * radial gradients at bake time, never per frame. imageSmoothingEnabled=false
 * on every offscreen ctx for crisp pixels. Bakes are lazy (first request) and
 * evicted LRU once the cache passes its cap, so memory stays bounded even as
 * kaiju lazily fill it with ~52 frames/form.
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Cfg = G.Config;
  var U = G.Utils;
  var GRID = Cfg.GRID;
  var TILE_W = GRID.TILE_W;   // 64
  var TILE_H = GRID.TILE_H;   // 32
  var HW = TILE_W / 2;        // 32 — half-width of the ground diamond
  var HH = TILE_H / 2;        // 16 — half-height
  var WZ_PX = GRID.WZ_PX;     // 44 — screen-rise per world-Z unit (building height)

  // Read the render dpr lazily at bake time (game.js sets GAME.dpr on resize).
  // Clamp to a sane range so a 3× phone doesn't blow the cache budget.
  function dpr() {
    var d = (typeof G.dpr === 'number' && G.dpr > 0) ? G.dpr : 2;
    return U.clamp(d, 1, 3);
  }

  /* ------------------------------------------------------------------ *
   *  LRU memo cache                                                      *
   * ------------------------------------------------------------------ */
  // A Map preserves insertion order; we treat front = least-recently-used and
  // re-insert on hit to bump to the most-recent position. Cap ~64 entries.
  var LRU_CAP = 64;
  var cache = new Map();
  // The dpr a given key was baked at — if the device dpr changes (e.g. window
  // dragged between monitors) we must re-bake rather than return a stale-res
  // canvas. game.js also calls invalidate() on resize, but this is a safety net.
  var bakedDpr = new Map();

  function makeCanvas(w, h, d) {
    var cv = document.createElement('canvas');
    // Floor to whole device pixels; never below 1 so drawImage can't throw.
    cv.width = Math.max(1, Math.round(w * d));
    cv.height = Math.max(1, Math.round(h * d));
    // Expose the logical CSS size so callers anchor in CSS units, not device px.
    cv._cssW = w;
    cv._cssH = h;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;     // crisp procedural pixels
    ctx.setTransform(d, 0, 0, d, 0, 0);    // drawFn works in CSS units
    return cv;
  }

  /**
   * get(key, w, h, drawFn) -> canvas
   * Memoised offscreen bake. drawFn(ctx, w, h) draws in CSS-pixel units with the
   * ctx already scaled to dpr; do NOT clear — the canvas is fresh & transparent.
   */
  function get(key, w, h, drawFn) {
    var d = dpr();
    var hit = cache.get(key);
    if (hit && bakedDpr.get(key) === d) {
      // LRU bump: delete + re-set moves it to the most-recent slot.
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    // Lookup-only call (no draw fn): return a (possibly stale-dpr) hit, else null.
    if (typeof drawFn !== 'function') return hit || null;
    // Miss (or dpr changed) — bake fresh.
    var cv = makeCanvas(w, h, d);
    drawFn(cv.getContext('2d'), w, h);
    cache.set(key, cv);
    bakedDpr.set(key, d);
    // Evict least-recently-used until back under cap.
    while (cache.size > LRU_CAP) {
      var oldest = cache.keys().next().value;
      cache.delete(oldest);
      bakedDpr.delete(oldest);
    }
    return cv;
  }

  /** invalidate(prefix) — drop every cached key beginning with `prefix`.
   *  No arg / empty → clear everything (used on full resize / dpr rebuild). */
  function invalidate(prefix) {
    if (prefix == null || prefix === '') {
      cache.clear();
      bakedDpr.clear();
      return;
    }
    var doomed = [];
    cache.forEach(function (_v, k) {
      if (typeof k === 'string' && k.indexOf(prefix) === 0) doomed.push(k);
    });
    for (var i = 0; i < doomed.length; i++) {
      cache.delete(doomed[i]);
      bakedDpr.delete(doomed[i]);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Ground tile — the 64×32 iso diamond                                *
   * ------------------------------------------------------------------ */
  // A single diamond, tiled by render.js across the grid. Subtle top-face
  // gradient (faux ambient occlusion toward the back), a hairline grid edge so
  // the lattice reads without screaming, and a faint warm "island" tint so the
  // city plate feels like land rather than void.
  function drawGroundDiamond(ctx, w, h) {
    var cx = w / 2, cy = h / 2;
    // Diamond vertices (top, right, bottom, left).
    var top = cy - HH, bot = cy + HH, lft = cx - HW, rgt = cx + HW;

    // Fill: vertical gradient, lighter at the near (bottom) edge.
    var g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#20242f');   // back — darker (recedes)
    g.addColorStop(0.5, '#2b3140');
    g.addColorStop(1, '#333a4b');   // near — lighter
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(rgt, cy);
    ctx.lineTo(cx, bot);
    ctx.lineTo(lft, cy);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();

    // Island tint — a warm radial wash centered low, very low alpha, so the
    // plate carries a hint of earthy color under the cool gradient.
    var tint = ctx.createRadialGradient(cx, cy + 4, 2, cx, cy + 4, HW);
    tint.addColorStop(0, 'rgba(90,74,52,0.18)');
    tint.addColorStop(1, 'rgba(90,74,52,0)');
    ctx.fillStyle = tint;
    ctx.fill();   // reuses the diamond path still on the stack

    // Grid edges — two hairlines: a lit near pair and a shadowed far pair, so
    // adjacent diamonds seam into a readable lattice without a heavy outline.
    ctx.lineWidth = 1;
    // Near edges (bottom-left, bottom-right) — subtle highlight.
    ctx.strokeStyle = 'rgba(120,140,170,0.22)';
    ctx.beginPath();
    ctx.moveTo(lft, cy); ctx.lineTo(cx, bot); ctx.lineTo(rgt, cy);
    ctx.stroke();
    // Far edges (top-left, top-right) — subtle shadow.
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.moveTo(lft, cy); ctx.lineTo(cx, top); ctx.lineTo(rgt, cy);
    ctx.stroke();

    // A single dim center dot anchors the eye to the tile pivot — barely there.
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(cx - 0.5, cy - 0.5, 1, 1);
  }

  function groundTile() {
    return get('ground', TILE_W, TILE_H, drawGroundDiamond);
  }

  /* ------------------------------------------------------------------ *
   *  Building style bands                                                *
   * ------------------------------------------------------------------ */
  // 5 visual bands smeared across the 19 tiers (row index 0..18), shack at the
  // shallow frontier to neon megatower at the deep end. `top` = tier where the
  // band starts. `wz` = building height in world-Z units (× WZ_PX = screen px).
  // Colors are base; Utils.shade derives the 3 prism faces. `glow` lights the
  // window grid (and, for neon, edge piping). `roof` picks a capped/pitched top.
  var BANDS = [
    { name: 'shack',      top: 0,  wz: 0.9, body: '#7d6b5e', roof: 'pitch', win: false,
      winCols: 0, winRows: 0, glow: '#ffcf7a', greeble: 'chimney' },
    { name: 'house',      top: 2,  wz: 1.5, body: '#8a7a6b', roof: 'pitch', win: true,
      winCols: 2, winRows: 2, glow: '#ffd98a', greeble: 'chimney' },
    { name: 'midrise',    top: 5,  wz: 2.6, body: '#6f7c88', roof: 'flat',  win: true,
      winCols: 3, winRows: 5, glow: '#bfe8ff', greeble: 'tank' },
    { name: 'tower',      top: 9,  wz: 4.0, body: '#5f6b78', roof: 'flat',  win: true,
      winCols: 3, winRows: 8, glow: '#cde6ff', greeble: 'antenna' },
    { name: 'skyscraper', top: 14, wz: 5.8, body: '#3a4250', roof: 'flat',  win: true,
      winCols: 4, winRows: 11, glow: '#37d6ff', greeble: 'neon' },
  ];

  // Map a tier (0..18) → its band definition.
  function bandFor(tier) {
    var t = U.clamp(tier | 0, 0, GRID.rows - 1);
    var b = BANDS[0];
    for (var i = 0; i < BANDS.length; i++) {
      if (t >= BANDS[i].top) b = BANDS[i]; else break;
    }
    return b;
  }

  /* ---- iso box-prism geometry helpers ----
   * A building occupies a wTiles×wTiles footprint. Its top face is an iso
   * diamond of half-extents (wTiles*HW, wTiles*HH); the box rises `riseH` px.
   * We render the two visible side faces (right/SE-facing "light" wall and
   * left/SW-facing "dark" wall) plus the top, back-to-front. The sprite canvas
   * is sized to bound the whole prism with a small margin; the foot diamond's
   * center sits at a fixed anchor we expose so render.js can place it.
   */
  function prismMetrics(wTiles, riseH) {
    var halfW = wTiles * HW;          // diamond half-width  (foot)
    var halfH = wTiles * HH;          // diamond half-height (foot)
    var margin = 4;                   // breathing room for greebles/edges
    var w = halfW * 2 + margin * 2;
    var h = riseH + halfH * 2 + margin * 2;
    // Foot-diamond center in sprite space: horizontally centered; vertically the
    // foot's mid lies `riseH + halfH` down from top (box rises above it).
    var ax = w / 2;
    var ay = margin + riseH + halfH;
    return { w: w, h: h, halfW: halfW, halfH: halfH, ax: ax, ay: ay, riseH: riseH };
  }

  // Window grid painter for a single side face. `quad` = [tl,tr,br,bl] corner
  // points (each {x,y}); we lay an even cols×rows lattice in that quad's local
  // parametric space so windows shear correctly with the iso wall. `lit` is the
  // fraction of windows glowing (rest are dark glass). Damage `stage` knocks
  // windows out (dark + cracked) progressively.
  function paintWindows(ctx, quad, cols, rows, baseCol, glowCol, lit, stage, rnd) {
    if (cols <= 0 || rows <= 0) return;
    var tl = quad[0], tr = quad[1], br = quad[2], bl = quad[3];
    // Inset margins (fraction of a cell) so windows don't touch the edges.
    var mx = 0.22, my = 0.16, ww = 0.56, wh = 0.62;
    var dark = U.shade(baseCol, 0.42);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        // Parametric position of this window's top-left & size within the quad.
        var u0 = (c + mx) / cols, v0 = (r + my) / rows;
        var u1 = (c + mx + ww) / cols, v1 = (r + my + wh) / rows;
        // Bilerp the four quad corners → 4 window corners.
        var p00 = bilerp(tl, tr, bl, br, u0, v0);
        var p10 = bilerp(tl, tr, bl, br, u1, v0);
        var p11 = bilerp(tl, tr, bl, br, u1, v1);
        var p01 = bilerp(tl, tr, bl, br, u0, v1);
        // Damage knocks out more windows as stage rises.
        var knockChance = stage === 0 ? 0.0 : (stage === 1 ? 0.30 : 0.62);
        var roll = rnd();
        var on = roll < lit && !(rnd() < knockChance);
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fillStyle = on ? glowCol : dark;
        ctx.fill();
      }
    }
  }

  // Bilinear interpolate a point inside a quad (tl,tr,bl,br) at (u,v) in [0,1].
  function bilerp(tl, tr, bl, br, u, v) {
    var topx = tl.x + (tr.x - tl.x) * u, topy = tl.y + (tr.y - tl.y) * u;
    var botx = bl.x + (br.x - bl.x) * u, boty = bl.y + (br.y - bl.y) * u;
    return { x: topx + (botx - topx) * v, y: topy + (boty - topy) * v };
  }

  /* ---- rooftop greebles (baked, no shadow) ---- */
  function drawGreeble(ctx, m, band, topPts, rnd) {
    var cx = m.ax, cy = m.ay - m.riseH;     // top-face center
    var k = m.halfW;                         // scale ref
    var dark = U.shade(band.body, 0.6);
    var lite = U.shade(band.body, 1.1);
    switch (band.greeble) {
      case 'chimney': {
        var bx = cx + k * 0.18, by = cy - k * 0.10, bw = k * 0.16, bh = k * 0.34;
        ctx.fillStyle = U.shade('#5a4636', 0.9);
        ctx.fillRect(bx, by - bh, bw, bh);
        ctx.fillStyle = U.shade('#5a4636', 0.6);
        ctx.fillRect(bx, by - bh, bw * 0.4, bh);
        break;
      }
      case 'tank': {
        // squat cylinder water tank
        var tx = cx - k * 0.05, ty = cy - k * 0.18, tw = k * 0.34, th = k * 0.28;
        ctx.fillStyle = dark;
        ctx.fillRect(tx, ty, tw, th);
        ctx.fillStyle = lite;
        ctx.beginPath();
        ctx.ellipse(tx + tw / 2, ty, tw / 2, tw / 4, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'antenna': {
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1.5;
        var ax2 = cx + k * 0.10;
        ctx.beginPath();
        ctx.moveTo(ax2, cy); ctx.lineTo(ax2, cy - k * 0.55);
        ctx.stroke();
        // beacon dot (baked, faint halo via a tiny radial — no shadowBlur)
        var bg = ctx.createRadialGradient(ax2, cy - k * 0.55, 0, ax2, cy - k * 0.55, 3);
        bg.addColorStop(0, 'rgba(255,90,90,0.95)');
        bg.addColorStop(1, 'rgba(255,90,90,0)');
        ctx.fillStyle = bg;
        ctx.fillRect(ax2 - 3, cy - k * 0.55 - 3, 6, 6);
        // small rooftop HVAC block
        ctx.fillStyle = dark;
        ctx.fillRect(cx - k * 0.30, cy - k * 0.04, k * 0.22, k * 0.12);
        break;
      }
      case 'neon': {
        // glowing rooftop crown bar — baked gradient, evokes a neon megatower
        var ny = cy - k * 0.10, nw = k * 0.6, nx = cx - nw / 2;
        var ng = ctx.createLinearGradient(nx, ny, nx + nw, ny);
        ng.addColorStop(0, 'rgba(55,214,255,0.0)');
        ng.addColorStop(0.5, band.glow);
        ng.addColorStop(1, 'rgba(55,214,255,0.0)');
        ctx.fillStyle = ng;
        ctx.fillRect(nx, ny - 2, nw, 4);
        // twin spire antennas
        ctx.strokeStyle = U.shade(band.body, 1.3);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - k * 0.18, cy); ctx.lineTo(cx - k * 0.18, cy - k * 0.6);
        ctx.moveTo(cx + k * 0.18, cy); ctx.lineTo(cx + k * 0.18, cy - k * 0.48);
        ctx.stroke();
        break;
      }
    }
  }

  /* ---- the prism itself ---- */
  function drawBuilding(ctx, m, band, tier, stage) {
    // Deterministic per-(tier,stage) jitter so re-bakes are stable and windows
    // / crack patterns don't reshuffle when a building crosses a damage stage.
    var rnd = U.rng(U.hash(tier * 97 + stage * 13 + 7));

    var ax = m.ax, ay = m.ay, hw = m.halfW, hh = m.halfH, rise = m.riseH;

    // Foot diamond corners (top,right,bottom,left) at ground level.
    var fTop = { x: ax, y: ay - hh };
    var fRgt = { x: ax + hw, y: ay };
    var fBot = { x: ax, y: ay + hh };
    var fLft = { x: ax - hw, y: ay };
    // Top diamond corners (lifted by `rise`).
    var tTop = { x: ax, y: ay - hh - rise };
    var tRgt = { x: ax + hw, y: ay - rise };
    var tBot = { x: ax, y: ay + hh - rise };
    var tLft = { x: ax - hw, y: ay - rise };

    // Damage darkening — soot/scorch deepens with stage.
    var damMul = stage === 0 ? 1 : (stage === 1 ? 0.82 : 0.62);
    var bodyR = U.shade(band.body, 1.12 * damMul);  // right (light) wall
    var bodyL = U.shade(band.body, 0.74 * damMul);  // left  (dark)  wall
    var bodyT = U.shade(band.body, 1.32 * damMul);  // top face (lit)
    var edgeC = U.shade(band.body, 0.5 * damMul);

    // --- LEFT / SW wall (drawn first, it's the farther-lit shadow side) ---
    // quad corners: tl=tLft, tr=tBot, br=fBot, bl=fLft  (note iso orientation)
    var lQuad = [tLft, tBot, fBot, fLft];
    ctx.beginPath();
    ctx.moveTo(tLft.x, tLft.y);
    ctx.lineTo(tBot.x, tBot.y);
    ctx.lineTo(fBot.x, fBot.y);
    ctx.lineTo(fLft.x, fLft.y);
    ctx.closePath();
    ctx.fillStyle = bodyL;
    ctx.fill();

    // --- RIGHT / SE wall ---
    // quad corners: tl=tBot, tr=tRgt, br=fRgt, bl=fBot
    var rQuad = [tBot, tRgt, fRgt, fBot];
    ctx.beginPath();
    ctx.moveTo(tBot.x, tBot.y);
    ctx.lineTo(tRgt.x, tRgt.y);
    ctx.lineTo(fRgt.x, fRgt.y);
    ctx.lineTo(fBot.x, fBot.y);
    ctx.closePath();
    ctx.fillStyle = bodyR;
    ctx.fill();

    // Windows on both visible walls (only for win:true bands).
    if (band.win) {
      // Deeper bands read "more alive" → higher lit fraction; scorch dims it.
      var lit = U.clamp(0.5 + band.top * 0.02, 0.35, 0.8) * (stage === 2 ? 0.5 : 1);
      var glow = band.glow;
      paintWindows(ctx, lQuad, band.winCols, band.winRows, bodyL, U.shade(glow, 0.78), lit, stage, rnd);
      paintWindows(ctx, rQuad, band.winCols, band.winRows, bodyR, glow, lit, stage, rnd);
    }

    // --- TOP face ---
    if (band.roof === 'pitch' && rise > 0) {
      // Pitched roof: a ridge line lifts above the top diamond → gable look.
      var ridgeH = hh * 0.9;
      var ridgeBk = { x: ax, y: tTop.y - ridgeH };
      var ridgeFt = { x: ax, y: tBot.y - ridgeH };
      var roofCol = U.shade(band.body, 0.9 * damMul);
      var roofHi = U.shade(band.body, 1.15 * damMul);
      // left roof slope
      ctx.beginPath();
      ctx.moveTo(tLft.x, tLft.y);
      ctx.lineTo(ridgeBk.x, ridgeBk.y);
      ctx.lineTo(ridgeFt.x, ridgeFt.y);
      ctx.lineTo(tBot.x, tBot.y);
      ctx.closePath();
      ctx.fillStyle = roofCol;
      ctx.fill();
      // right roof slope (lit)
      ctx.beginPath();
      ctx.moveTo(ridgeBk.x, ridgeBk.y);
      ctx.lineTo(tRgt.x, tRgt.y);
      ctx.lineTo(tBot.x, tBot.y);
      ctx.lineTo(ridgeFt.x, ridgeFt.y);
      ctx.closePath();
      ctx.fillStyle = roofHi;
      ctx.fill();
    } else {
      // Flat top diamond.
      ctx.beginPath();
      ctx.moveTo(tTop.x, tTop.y);
      ctx.lineTo(tRgt.x, tRgt.y);
      ctx.lineTo(tBot.x, tBot.y);
      ctx.lineTo(tLft.x, tLft.y);
      ctx.closePath();
      ctx.fillStyle = bodyT;
      ctx.fill();
      // Parapet rim hint along the front two top edges.
      ctx.strokeStyle = U.shade(band.body, 1.45 * damMul);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tLft.x, tLft.y);
      ctx.lineTo(tBot.x, tBot.y);
      ctx.lineTo(tRgt.x, tRgt.y);
      ctx.stroke();
      // Rooftop greeble (tank / antenna / neon crown).
      drawGreeble(ctx, m, band, [tTop, tRgt, tBot, tLft], rnd);
    }

    // --- vertical corner edges (the three visible verticals + silhouette) ---
    ctx.strokeStyle = edgeC;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // front vertical (bottom-most corner of the box)
    ctx.moveTo(fBot.x, fBot.y); ctx.lineTo(tBot.x, tBot.y);
    // left vertical
    ctx.moveTo(fLft.x, fLft.y); ctx.lineTo(tLft.x, tLft.y);
    // right vertical
    ctx.moveTo(fRgt.x, fRgt.y); ctx.lineTo(tRgt.x, tRgt.y);
    ctx.stroke();

    // --- damage overlay: cracks + scorch streaks (stage 1/2) ---
    if (stage >= 1) {
      drawDamage(ctx, m, stage, rnd);
    }

    // --- neon edge piping for the skyscraper band (baked gradient glow) ---
    if (band.greeble === 'neon' && stage < 2) {
      // A subtle cyan rim along the front-right vertical evokes lit edge piping.
      var pg = ctx.createLinearGradient(fBot.x, fBot.y, tBot.x, tBot.y);
      pg.addColorStop(0, 'rgba(55,214,255,0.0)');
      pg.addColorStop(0.5, 'rgba(55,214,255,0.35)');
      pg.addColorStop(1, 'rgba(55,214,255,0.0)');
      ctx.strokeStyle = pg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fBot.x, fBot.y); ctx.lineTo(tBot.x, tBot.y);
      ctx.stroke();
    }
  }

  // Cracks (dark jagged polylines) + a scorch smear, scaled to the box rect.
  function drawDamage(ctx, m, stage, rnd) {
    var ax = m.ax, ay = m.ay, rise = m.riseH, hw = m.halfW, hh = m.halfH;
    var top = ay - hh - rise, bot = ay + hh;
    var cracks = stage === 1 ? 2 : 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    for (var i = 0; i < cracks; i++) {
      var sx = ax + (rnd() - 0.5) * hw * 1.2;
      var sy = U.lerp(top, bot, 0.2 + rnd() * 0.5);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      var segs = 3 + (rnd() * 3 | 0);
      var x = sx, y = sy;
      for (var s = 0; s < segs; s++) {
        x += (rnd() - 0.5) * hw * 0.4;
        y += rnd() * (bot - sy) / segs;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Scorch smear near the top for stage 2 — a soft dark radial, baked.
    if (stage === 2) {
      var scg = ctx.createRadialGradient(ax, top + rise * 0.3, 2, ax, top + rise * 0.3, hw);
      scg.addColorStop(0, 'rgba(0,0,0,0.5)');
      scg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = scg;
      ctx.fillRect(ax - hw, top, hw * 2, rise * 0.7);
    }
  }

  /**
   * buildingSprite(tier, wTiles, stage) -> canvas
   * Baked iso box-prism for the tier's style band at damage `stage` (0|1|2).
   * The returned canvas exposes ._cssW/._cssH (logical size) and ._anchorX/Y
   * (the foot-diamond center in CSS px) so render.js can blit it so the foot
   * lands on the tile's screen position: drawImage(cv, sx-anchorX, sy-anchorY).
   */
  function buildingSprite(tier, wTiles, stage) {
    var w = Math.max(1, wTiles | 0);
    var st = U.clamp(stage | 0, 0, 2);
    var band = bandFor(tier);
    var riseH = Math.round(band.wz * WZ_PX);
    var m = prismMetrics(w, riseH);
    var key = 'bld|' + tier + '|' + w + '|' + st;
    var cv = get(key, m.w, m.h, function (ctx) {
      drawBuilding(ctx, m, band, tier, st);
    });
    // Attach anchor (idempotent — get() may return a cached canvas).
    cv._anchorX = m.ax;
    cv._anchorY = m.ay;
    return cv;
  }

  /* ------------------------------------------------------------------ *
   *  Export                                                              *
   * ------------------------------------------------------------------ */
  G.Assets = {
    get: get,
    invalidate: invalidate,
    groundTile: groundTile,
    buildingSprite: buildingSprite,
    // Introspection helpers (handy for render.js / debugging; not in the hot path).
    bandFor: bandFor,
    _size: function () { return cache.size; },
  };

})(window.GAME);
