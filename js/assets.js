/* GAME.Assets — procedural offscreen-canvas cache (v3 refactor §3).
 *
 * All baking is offscreen-canvas + drawImage, never per-frame shadowBlur.
 * buildingSprite(b) dispatches on b.sprite ('generic' or a special key) to
 * either the built-in prism builder or GAME.SpriteBuilders[b.sprite].
 *
 * Public API:
 *   GAME.Assets.get(key, w, h, drawFn) -> HTMLCanvasElement
 *        Memoised offscreen bake. LRU cap ~64. drawFn(ctx,w,h) in CSS units.
 *   GAME.Assets.groundTile() -> canvas
 *        64×32 iso ground diamond, baked once.
 *   GAME.Assets.buildingSprite(b) -> canvas
 *        Accepts a building object: { tier, footprint:{w}, hp, maxHp,
 *        sprite?, tint? }. Generic buildings render the iso prism (unchanged);
 *        special buildings with b.sprite set dispatch to GAME.SpriteBuilders.
 *        Cache key = sprite|tier|footprintW|stage|tint.
 *        BACKWARD COMPAT: buildingSprite(tier, wTiles, stage) (positional) still
 *        works so render.js continues to function until it is updated to pass b.
 *   GAME.Assets.invalidate(prefix)
 *        Drop every key starting with prefix ('' / null clears all).
 *   GAME.Assets.bandFor(tier) -> band
 *        Style-band descriptor for a given depth tier.
 *
 * Deps: GAME.Config (GRID), GAME.Utils (shade/clamp/lerp/hash/rng).
 *       GAME.SpriteBuilders (optional at call time; loaded by sprites_special.js).
 *
 * Canvas stamps: every returned canvas has ._cssW, ._cssH, ._anchorX, ._anchorY
 * set so render.js can blit with the foot-diamond center on the tile apex:
 *   ctx.drawImage(cv, sx - cv._anchorX, sy - cv._anchorY, cv._cssW, cv._cssH)
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Cfg = G.Config;
  var U = G.Utils;
  var GRID = Cfg.GRID;
  var TILE_W = GRID.TILE_W;   // 56
  var TILE_H = GRID.TILE_H;   // 28
  var HW = TILE_W / 2;        // 28
  var HH = TILE_H / 2;        // 14
  var WZ_PX = GRID.WZ_PX;     // 40 — screen-rise per world-Z unit

  // Read the render dpr lazily at bake time (game.js sets GAME.dpr on resize).
  function dpr() {
    var d = (typeof G.dpr === 'number' && G.dpr > 0) ? G.dpr : 2;
    return U.clamp(d, 1, 3);
  }

  /* ------------------------------------------------------------------ *
   *  LRU memo cache                                                      *
   * ------------------------------------------------------------------ */
  var LRU_CAP = 64;
  var cache = new Map();
  var bakedDpr = new Map();   // tracks the dpr each key was baked at

  function makeCanvas(w, h, d) {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * d));
    cv.height = Math.max(1, Math.round(h * d));
    cv._cssW = w;
    cv._cssH = h;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(d, 0, 0, d, 0, 0);  // drawFn works in CSS units
    return cv;
  }

  /**
   * get(key, w, h, drawFn) -> canvas
   * Memoised. drawFn(ctx, w, h) draws in CSS units; do NOT clear (canvas is fresh).
   * LRU bump on hit; evicts oldest when size exceeds LRU_CAP.
   */
  function get(key, w, h, drawFn) {
    var d = dpr();
    var hit = cache.get(key);
    if (hit && bakedDpr.get(key) === d) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    if (typeof drawFn !== 'function') return hit || null;
    var cv = makeCanvas(w, h, d);
    drawFn(cv.getContext('2d'), w, h);
    cache.set(key, cv);
    bakedDpr.set(key, d);
    while (cache.size > LRU_CAP) {
      var oldest = cache.keys().next().value;
      cache.delete(oldest);
      bakedDpr.delete(oldest);
    }
    return cv;
  }

  /** invalidate(prefix) — drop every cached key beginning with prefix.
   *  No arg / null / '' → clear everything (e.g. on full resize/dpr change). */
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
   *  Ground tile — 64×32 iso diamond                                    *
   * ------------------------------------------------------------------ */
  function drawGroundDiamond(ctx, w, h) {
    var cx = w / 2, cy = h / 2;
    var top = cy - HH, bot = cy + HH, lft = cx - HW, rgt = cx + HW;

    var g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#20242f');
    g.addColorStop(0.5, '#2b3140');
    g.addColorStop(1, '#333a4b');
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(rgt, cy);
    ctx.lineTo(cx, bot);
    ctx.lineTo(lft, cy);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();

    var tint = ctx.createRadialGradient(cx, cy + 4, 2, cx, cy + 4, HW);
    tint.addColorStop(0, 'rgba(90,74,52,0.18)');
    tint.addColorStop(1, 'rgba(90,74,52,0)');
    ctx.fillStyle = tint;
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120,140,170,0.22)';
    ctx.beginPath();
    ctx.moveTo(lft, cy); ctx.lineTo(cx, bot); ctx.lineTo(rgt, cy);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.moveTo(lft, cy); ctx.lineTo(cx, top); ctx.lineTo(rgt, cy);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(cx - 0.5, cy - 0.5, 1, 1);
  }

  function groundTile() {
    return get('ground', TILE_W, TILE_H, drawGroundDiamond);
  }

  /* ------------------------------------------------------------------ *
   *  Building style bands                                                *
   * ------------------------------------------------------------------ */
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

  function bandFor(tier) {
    var t = U.clamp(tier | 0, 0, GRID.rows - 1);
    var b = BANDS[0];
    for (var i = 0; i < BANDS.length; i++) {
      if (t >= BANDS[i].top) b = BANDS[i]; else break;
    }
    return b;
  }

  /* ---- iso box-prism geometry helpers ---- */
  function prismMetrics(wTiles, riseH) {
    var halfW = wTiles * HW;
    var halfH = wTiles * HH;
    var margin = 4;
    var w = halfW * 2 + margin * 2;
    var h = riseH + halfH * 2 + margin * 2;
    var ax = w / 2;
    var ay = margin + riseH + halfH;
    return { w: w, h: h, halfW: halfW, halfH: halfH, ax: ax, ay: ay, riseH: riseH };
  }

  function paintWindows(ctx, quad, cols, rows, baseCol, glowCol, lit, stage, rnd) {
    if (cols <= 0 || rows <= 0) return;
    var tl = quad[0], tr = quad[1], br = quad[2], bl = quad[3];
    var mx = 0.22, my = 0.16, ww = 0.56, wh = 0.62;
    var dark = U.shade(baseCol, 0.42);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var u0 = (c + mx) / cols, v0 = (r + my) / rows;
        var u1 = (c + mx + ww) / cols, v1 = (r + my + wh) / rows;
        var p00 = bilerp(tl, tr, bl, br, u0, v0);
        var p10 = bilerp(tl, tr, bl, br, u1, v0);
        var p11 = bilerp(tl, tr, bl, br, u1, v1);
        var p01 = bilerp(tl, tr, bl, br, u0, v1);
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

  function bilerp(tl, tr, bl, br, u, v) {
    var topx = tl.x + (tr.x - tl.x) * u, topy = tl.y + (tr.y - tl.y) * u;
    var botx = bl.x + (br.x - bl.x) * u, boty = bl.y + (br.y - bl.y) * u;
    return { x: topx + (botx - topx) * v, y: topy + (boty - topy) * v };
  }

  function drawGreeble(ctx, m, band, topPts, rnd) {
    var cx = m.ax, cy = m.ay - m.riseH;
    var k = m.halfW;
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
        var bg = ctx.createRadialGradient(ax2, cy - k * 0.55, 0, ax2, cy - k * 0.55, 3);
        bg.addColorStop(0, 'rgba(255,90,90,0.95)');
        bg.addColorStop(1, 'rgba(255,90,90,0)');
        ctx.fillStyle = bg;
        ctx.fillRect(ax2 - 3, cy - k * 0.55 - 3, 6, 6);
        ctx.fillStyle = dark;
        ctx.fillRect(cx - k * 0.30, cy - k * 0.04, k * 0.22, k * 0.12);
        break;
      }
      case 'neon': {
        var ny = cy - k * 0.10, nw = k * 0.6, nx = cx - nw / 2;
        var ng = ctx.createLinearGradient(nx, ny, nx + nw, ny);
        ng.addColorStop(0, 'rgba(55,214,255,0.0)');
        ng.addColorStop(0.5, band.glow);
        ng.addColorStop(1, 'rgba(55,214,255,0.0)');
        ctx.fillStyle = ng;
        ctx.fillRect(nx, ny - 2, nw, 4);
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

  function drawPrismBuilding(ctx, m, band, tier, stage) {
    var rnd = U.rng(U.hash(tier * 97 + stage * 13 + 7));

    var ax = m.ax, ay = m.ay, hw = m.halfW, hh = m.halfH, rise = m.riseH;

    var fTop = { x: ax, y: ay - hh };
    var fRgt = { x: ax + hw, y: ay };
    var fBot = { x: ax, y: ay + hh };
    var fLft = { x: ax - hw, y: ay };
    var tTop = { x: ax, y: ay - hh - rise };
    var tRgt = { x: ax + hw, y: ay - rise };
    var tBot = { x: ax, y: ay + hh - rise };
    var tLft = { x: ax - hw, y: ay - rise };

    var damMul = stage === 0 ? 1 : (stage === 1 ? 0.82 : 0.62);
    var bodyR = U.shade(band.body, 1.12 * damMul);
    var bodyL = U.shade(band.body, 0.74 * damMul);
    var bodyT = U.shade(band.body, 1.32 * damMul);
    var edgeC = U.shade(band.body, 0.5 * damMul);

    var lQuad = [tLft, tBot, fBot, fLft];
    ctx.beginPath();
    ctx.moveTo(tLft.x, tLft.y);
    ctx.lineTo(tBot.x, tBot.y);
    ctx.lineTo(fBot.x, fBot.y);
    ctx.lineTo(fLft.x, fLft.y);
    ctx.closePath();
    ctx.fillStyle = bodyL;
    ctx.fill();

    var rQuad = [tBot, tRgt, fRgt, fBot];
    ctx.beginPath();
    ctx.moveTo(tBot.x, tBot.y);
    ctx.lineTo(tRgt.x, tRgt.y);
    ctx.lineTo(fRgt.x, fRgt.y);
    ctx.lineTo(fBot.x, fBot.y);
    ctx.closePath();
    ctx.fillStyle = bodyR;
    ctx.fill();

    if (band.win) {
      var lit = U.clamp(0.5 + band.top * 0.02, 0.35, 0.8) * (stage === 2 ? 0.5 : 1);
      var glow = band.glow;
      paintWindows(ctx, lQuad, band.winCols, band.winRows, bodyL, U.shade(glow, 0.78), lit, stage, rnd);
      paintWindows(ctx, rQuad, band.winCols, band.winRows, bodyR, glow, lit, stage, rnd);
    }

    if (band.roof === 'pitch' && rise > 0) {
      var ridgeH = hh * 0.9;
      var ridgeBk = { x: ax, y: tTop.y - ridgeH };
      var ridgeFt = { x: ax, y: tBot.y - ridgeH };
      var roofCol = U.shade(band.body, 0.9 * damMul);
      var roofHi = U.shade(band.body, 1.15 * damMul);
      ctx.beginPath();
      ctx.moveTo(tLft.x, tLft.y);
      ctx.lineTo(ridgeBk.x, ridgeBk.y);
      ctx.lineTo(ridgeFt.x, ridgeFt.y);
      ctx.lineTo(tBot.x, tBot.y);
      ctx.closePath();
      ctx.fillStyle = roofCol;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ridgeBk.x, ridgeBk.y);
      ctx.lineTo(tRgt.x, tRgt.y);
      ctx.lineTo(tBot.x, tBot.y);
      ctx.lineTo(ridgeFt.x, ridgeFt.y);
      ctx.closePath();
      ctx.fillStyle = roofHi;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(tTop.x, tTop.y);
      ctx.lineTo(tRgt.x, tRgt.y);
      ctx.lineTo(tBot.x, tBot.y);
      ctx.lineTo(tLft.x, tLft.y);
      ctx.closePath();
      ctx.fillStyle = bodyT;
      ctx.fill();
      ctx.strokeStyle = U.shade(band.body, 1.45 * damMul);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tLft.x, tLft.y);
      ctx.lineTo(tBot.x, tBot.y);
      ctx.lineTo(tRgt.x, tRgt.y);
      ctx.stroke();
      drawGreeble(ctx, m, band, [tTop, tRgt, tBot, tLft], rnd);
    }

    ctx.strokeStyle = edgeC;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fBot.x, fBot.y); ctx.lineTo(tBot.x, tBot.y);
    ctx.moveTo(fLft.x, fLft.y); ctx.lineTo(tLft.x, tLft.y);
    ctx.moveTo(fRgt.x, fRgt.y); ctx.lineTo(tRgt.x, tRgt.y);
    ctx.stroke();

    if (stage >= 1) {
      drawDamage(ctx, m, stage, rnd);
    }

    if (band.greeble === 'neon' && stage < 2) {
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
    if (stage === 2) {
      var scg = ctx.createRadialGradient(ax, top + rise * 0.3, 2, ax, top + rise * 0.3, hw);
      scg.addColorStop(0, 'rgba(0,0,0,0.5)');
      scg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = scg;
      ctx.fillRect(ax - hw, top, hw * 2, rise * 0.7);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Damage stage helper (derives from building hp/maxHp)               *
   * ------------------------------------------------------------------ */
  function stageFrom(b) {
    var f = b.maxHp ? (b.hp / b.maxHp) : 1;
    return f > 0.66 ? 0 : (f > 0.33 ? 1 : 2);
  }

  /* ------------------------------------------------------------------ *
   *  buildingSprite — public dispatch point (§3 contract)               *
   * ------------------------------------------------------------------ */
  /**
   * buildingSprite(b) -> canvas
   *
   * b must be a building object: { tier, footprint:{w}, hp, maxHp, sprite?, tint? }
   *
   * Dispatch:
   *   b.sprite == null/'generic'/undefined → generic iso prism (UNCHANGED path)
   *   b.sprite == 'house' + b.tint set     → GAME.SpriteBuilders.houseTint
   *   b.sprite == anything else            → GAME.SpriteBuilders[b.sprite]
   *
   * If a SpriteBuilder is not yet loaded (sprites_special.js not yet executed),
   * the call transparently falls back to the generic prism so the game never
   * throws on a missing builder.
   *
   * BACKWARD COMPAT: if the first argument is a number (old positional call from
   * a not-yet-updated render.js: buildingSprite(tier, wTiles, stage)), the call
   * is normalised into a minimal building object so existing callers keep working.
   *
   * Returns a canvas with ._cssW, ._cssH, ._anchorX, ._anchorY stamped.
   */
  function buildingSprite(b, _wTilesPositional, _stagePositional) {
    // --- backward-compat normalisation (positional call) ---
    if (typeof b === 'number') {
      var tier_p = b;
      var w_p    = Math.max(1, (_wTilesPositional | 0) || 1);
      var st_p   = U.clamp((_stagePositional | 0) || 0, 0, 2);
      return _bakeGenericPrism(tier_p, w_p, st_p);
    }

    // --- new object-based call ---
    var spriteKey = (b.sprite && b.sprite !== 'generic') ? b.sprite : 'generic';
    var tier  = b.tier | 0;
    var fw    = Math.max(1, (b.footprint && b.footprint.w) ? (b.footprint.w | 0) : 1);
    var stage = U.clamp(stageFrom(b), 0, 2);

    // For generic and houseTint-without-builder, fall through to prism.
    if (spriteKey === 'generic') {
      return _bakeGenericPrism(tier, fw, stage);
    }

    // houseTint: recolour the house prism by tint key ('gold'|'rainbow'|'diamond').
    // Delegate to SpriteBuilders.houseTint if available; else fall back to prism.
    var tint = b.tint || '';
    if (spriteKey === 'house' && tint) {
      return _bakeSpecial('houseTint', tier, fw, stage, tint,
        function (ctx, w, h, params) { return _callBuilder('houseTint', ctx, w, h, params); },
        function (params) { return _genericFallback(tier, fw, stage); });
    }

    // All other specials (statue, pyramid, field, sandpile, plane).
    return _bakeSpecial(spriteKey, tier, fw, stage, '',
      function (ctx, w, h, params) { return _callBuilder(spriteKey, ctx, w, h, params); },
      function (params) { return _genericFallback(tier, fw, stage); });
  }

  /* -- internal: bake or return cached generic prism -- */
  function _bakeGenericPrism(tier, fw, stage) {
    var band  = bandFor(tier);
    var riseH = Math.round(band.wz * WZ_PX);
    var m     = prismMetrics(fw, riseH);
    var key   = 'bld|generic|' + tier + '|' + fw + '|' + stage;
    var cv = get(key, m.w, m.h, function (ctx) {
      drawPrismBuilding(ctx, m, band, tier, stage);
    });
    cv._anchorX = m.ax;
    cv._anchorY = m.ay;
    return cv;
  }

  /* -- internal: bake or return cached special sprite -- */
  function _bakeSpecial(spriteKey, tier, fw, stage, tintStr, bakeFn, fallbackFn) {
    // Canvas dimensions for special sprites: match the prism footprint so
    // special buildings slot into the same positional frame as generics.
    var band  = bandFor(tier);
    var riseH = Math.round(band.wz * WZ_PX);
    var m     = prismMetrics(fw, riseH);

    var cacheKey = 'bld|' + spriteKey + '|' + tier + '|' + fw + '|' + stage +
                   (tintStr ? '|' + tintStr : '');

    var SB = G.SpriteBuilders;
    if (!SB || typeof SB[spriteKey !== 'houseTint' ? spriteKey : 'houseTint'] !== 'function') {
      // Builder not loaded yet — fall back silently to prism.
      return _genericFallback(tier, fw, stage);
    }

    var cv = get(cacheKey, m.w, m.h, function (ctx) {
      bakeFn(ctx, m.w, m.h, { tier: tier, fw: fw, footprint: { w: fw }, stage: stage, tint: tintStr, metrics: m, band: band });
    });
    cv._anchorX = m.ax;
    cv._anchorY = m.ay;
    return cv;
  }

  /* -- internal: silent generic fallback (builder not yet available) -- */
  function _genericFallback(tier, fw, stage) {
    return _bakeGenericPrism(tier, fw, stage);
  }

  /* -- internal: call a SpriteBuilder safely -- */
  function _callBuilder(name, ctx, w, h, params) {
    var SB = G.SpriteBuilders;
    if (SB && typeof SB[name] === 'function') {
      SB[name](ctx, w, h, params);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Export                                                              *
   * ------------------------------------------------------------------ */
  G.Assets = {
    get: get,
    invalidate: invalidate,
    groundTile: groundTile,
    buildingSprite: buildingSprite,
    bandFor: bandFor,
    _size: function () { return cache.size; },
  };

})(window.GAME);
