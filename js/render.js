/* GAME.Render — painter's loop for Godzilla Smash v3 (2.5D isometric, Canvas2D).
 *
 * Owns NOTHING but drawing: every number from GAME.Config, helpers from GAME.Utils,
 * coordinates from GAME.iso / GAME.camera, sprites from GAME.Assets,
 * entities from GAME.World / player unit / GAME.FX, HUD values from
 * GAME.Economy / GAME.Input, day/night phase from GAME.Env.
 *
 * Contract (v3-build-contract §3):
 *   GAME.Render.frame(dt) — paint one frame
 *   GAME.Render.setPlayer(unit) — called once at boot
 *
 * Per-frame order:
 *   1. Clear full backing store (device px, transform-independent)
 *   2. Sky: dynamic gradient from Env.phase() (or static fallback) + sun/moon disc
 *   3. Parallax skyline (3 baked layers, x-scrolled by camera.x)
 *   4. Ambient tint rect (one full-screen rgba overlay from Env.phase())
 *   5. ctx.save + camera.apply → enter world space
 *   6. Ground (island image or tiled diamond)
 *   7. Contact-shadow pass: ground ellipses under kaiju and flying buildings
 *   8. Build visible list (culled buildings + player), depth-sort, blit
 *      (buildings via Assets.buildingSprite(b); kaiju via unit.draw)
 *   9. World-space FX (GAME.FX.draw)
 *  10. ctx.restore → leave world space
 *  11. HUD overlay: combo pip, floating damage text, touch controls
 *      (joystick + smash + optional jump disc if Input exposes one)
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Cfg = G.Config;
  var U = G.Utils;
  var GRID = Cfg.GRID;                 // { cols, rows, TILE_W, TILE_H, WZ_PX }
  var COLS = GRID.cols;
  var ROWS = GRID.rows;
  var TILE_W = GRID.TILE_W;
  var TILE_H = GRID.TILE_H;
  var WZ_PX = GRID.WZ_PX;
  var reduced = !!U.reducedMotion;

  // --- Module-level mutable state (no per-frame allocation) -----------------
  var canvas = null;
  var ctx = null;
  var player = null;

  // Cached parallax skyline layers (built once per logical size).
  var sky = null;                      // { layers:[{cv, speed}], w, h }

  // Reused per-frame scratch so the hot loop allocates nothing.
  var visible = [];
  var visCount = 0;
  var dkProbe = { wx: 0, wy: 0, wz: 0, depthBias: 0 };
  var aabb = { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 };
  var scrCorner = { x: 0, y: 0 };     // unused scratch kept for compat

  // Cull pads — consolidated into Config.RENDER (U9); literal fallbacks behavior-identical.
  var CULL_PAD = (Cfg.RENDER && Cfg.RENDER.CULL_PAD != null) ? Cfg.RENDER.CULL_PAD : 3;
  var CULL_RISE_ROWS = (Cfg.RENDER && Cfg.RENDER.CULL_RISE_ROWS != null) ? Cfg.RENDER.CULL_RISE_ROWS : 14;

  // Pre-allocated corner scratch for computeCull.
  var TMP_CORNERS = [
    { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
  ];

  // ------------------------------------------------------------------------
  // Boot helpers
  // ------------------------------------------------------------------------

  function ensureCtx() {
    if (ctx) return true;
    canvas = document.getElementById('scene');
    if (!canvas) return false;
    ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.imageSmoothingEnabled = false;
    return true;
  }

  function deviceW() { return canvas.width || Math.round(canvas.clientWidth || window.innerWidth); }
  function deviceH() { return canvas.height || Math.round(canvas.clientHeight || window.innerHeight); }
  function cssW() { return canvas.clientWidth || window.innerWidth; }
  function cssH() { return canvas.clientHeight || window.innerHeight; }

  // ------------------------------------------------------------------------
  // Day/night phase — read GAME.Env.phase(); defensive fallback to static night.
  // Returns { sky:[c1,c2], tint:'rgba()', sun?:{col}, moon?:{col}, ambient:0..1 }
  // ------------------------------------------------------------------------
  var _fallbackPhase = {
    sky: ['#05070f', '#142a55'],
    tint: 'rgba(0,0,0,0)',
    moon: { col: '#cfe0ff' },
    ambient: 0.8
  };

  function envPhase() {
    var Env = G.Env;
    if (Env && typeof Env.phase === 'function') {
      var p = Env.phase();
      if (p) return p;
    }
    return _fallbackPhase;
  }

  // ------------------------------------------------------------------------
  // Sky gradient — dynamic sky colours from Env.phase(), drawn behind everything.
  // Two-stop vertical gradient across the full CSS canvas.
  // ------------------------------------------------------------------------
  function drawSkyClear(w, h, phase) {
    var cols = (phase && phase.sky) ? phase.sky : _fallbackPhase.sky;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, cols[0] || '#05070f');
    g.addColorStop(1, cols[1] || '#142a55');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Sun or moon disc (drawn in screen space above the horizon, un-transformed).
  // phase.sun / phase.moon = { col } — whichever is present gets drawn.
  function drawCelestialDisc(w, h, phase) {
    var disc = null;
    var isSun = false;
    if (phase && phase.sun && phase.sun.col) { disc = phase.sun; isSun = true; }
    else if (phase && phase.moon && phase.moon.col) { disc = phase.moon; isSun = false; }
    if (!disc) return;

    // Anchor: upper-left quadrant for sun, upper-right for moon.
    var cx = isSun ? (w * 0.25) : (w * 0.72);
    var cy = h * 0.15;
    var r = Math.round(w * 0.038);
    if (r < 8) r = 8;

    ctx.save();
    ctx.globalAlpha = isSun ? 0.92 : 0.75;

    if (isSun) {
      // Radial glow then disc.
      var sg = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2.2);
      sg.addColorStop(0, disc.col);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Soft glow for moon.
      var mg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.0);
      mg.addColorStop(0, disc.col);
      mg.addColorStop(0.45, disc.col);
      mg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Solid disc on top.
    ctx.globalAlpha = isSun ? 0.95 : 0.70;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = disc.col;
    ctx.fill();

    ctx.restore();
  }

  // ------------------------------------------------------------------------
  // Parallax skyline — three baked gradient/silhouette layers.
  // Built to CSS dimensions; x-scrolled by camera.x, tiled horizontally.
  // Rebuilt only when the logical size changes.
  // Colours are static (the sky gradient behind already provides day/night hue).
  // ------------------------------------------------------------------------
  function buildSky(w, h) {
    var layers = [];
    // U11: bake at device resolution (mirror assets.makeCanvas) so the skyline is
    // crisp on retina. dp matches the capped ratio Main applies to the base ctx
    // transform, so the device-sized layers blit back 1:1 (see drawSkyLayers).
    var dp = (typeof G.dpr === 'number' && G.dpr > 0) ? G.dpr : Math.min(window.devicePixelRatio || 1, 2);
    var defs = [
      { speed: 0.18, top: '#0a1430', bot: '#142a55', sil: '#0c1838', minH: 0.10, maxH: 0.20, density: 26, y: 0.46 },
      { speed: 0.34, top: '#0c1c44', bot: '#1d3e74', sil: '#10224a', minH: 0.16, maxH: 0.34, density: 20, y: 0.54 },
      { speed: 0.58, top: '#0e2452', bot: '#22518f', sil: '#142a5a', minH: 0.24, maxH: 0.52, density: 15, y: 0.66 }
    ];
    for (var d = 0; d < defs.length; d++) {
      var def = defs[d];
      var lw = Math.max(2, Math.ceil(w));            // CSS authoring dims (draw code below unchanged)
      var lh = Math.max(2, Math.ceil(h));
      var cv = document.createElement('canvas');
      cv.width = Math.max(2, Math.round(lw * dp));   // device-px backing
      cv.height = Math.max(2, Math.round(lh * dp));
      var c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.setTransform(dp, 0, 0, dp, 0, 0);            // author in CSS units, bake at device res

      // Layer 0: the silhouette is dark, drawn transparently over the dynamic sky.
      // We skip filling a background gradient here so the live sky shows through.

      // Faint stars in the upper band (layer 0 only; hidden by sun in daytime via tint).
      if (d === 0) {
        var sr = U.rng(0x5747 + d);
        c.fillStyle = 'rgba(180,205,255,0.55)';
        for (var s = 0; s < 70; s++) {
          var stx = Math.floor(sr() * lw);
          var sty = Math.floor(sr() * lh * 0.4);
          var ss = sr() < 0.85 ? 1 : 2;
          c.globalAlpha = 0.25 + sr() * 0.55;
          c.fillRect(stx, sty, ss, ss);
        }
        c.globalAlpha = 1;
      }

      // Building silhouette band.
      var baseY = Math.floor(lh * def.y);
      var rng = U.rng(0x1000 * (d + 1) + 0x33);
      var sg = c.createLinearGradient(0, baseY - lh * def.maxH, 0, lh);
      sg.addColorStop(0, U.shade(def.sil, 1.35));
      sg.addColorStop(1, U.shade(def.sil, 0.7));
      c.fillStyle = sg;

      var x = 0;
      while (x < lw) {
        var bw = Math.floor((lw / def.density) * (0.6 + rng() * 0.9));
        if (bw < 6) bw = 6;
        var bh = Math.floor(lh * (def.minH + rng() * (def.maxH - def.minH)));
        var by = baseY - bh;
        c.fillRect(x, by, bw - 2, bh + lh);
        if (d > 0 && rng() < 0.8) {
          c.fillStyle = (d === 2) ? 'rgba(120,200,255,0.30)' : 'rgba(110,170,255,0.22)';
          var wcols = Math.max(1, Math.floor((bw - 6) / 7));
          var wrows = Math.max(2, Math.floor(bh / 9));
          for (var wy = 0; wy < wrows; wy++) {
            for (var wx = 0; wx < wcols; wx++) {
              if (rng() < 0.5) continue;
              c.fillRect(x + 3 + wx * 7, by + 4 + wy * 9, 3, 3);
            }
          }
          c.fillStyle = sg;
        }
        x += bw;
      }
      layers.push({ cv: cv, speed: def.speed });
    }
    return { layers: layers, w: w, h: h, d: dp };
  }

  // Draw the parallax skyline (untransformed CSS space).
  function drawSkyLayers(camX, w, h) {
    var dp = (typeof G.dpr === 'number' && G.dpr > 0) ? G.dpr : Math.min(window.devicePixelRatio || 1, 2);
    // Rebuild on size OR dpr change — the module-local `sky` isn't an Assets
    // cache, so resize()'s Assets.invalidate('') never reaches it (U11).
    if (!sky || sky.w !== w || sky.h !== h || sky.d !== dp) sky = buildSky(w, h);
    var L = sky.layers;
    // Tile by CSS width (each device-sized layer blits back into a w×h CSS box).
    // Snap the dest origin to a whole device pixel so 1px stars/silhouette edges
    // stay crisp (no sub-pixel nearest-neighbour shimmer) while scrolling (U11).
    for (var i = 0; i < L.length; i++) {
      var layer = L[i];
      var off = -((camX * layer.speed) % w);
      if (off > 0) off -= w;
      off = Math.round(off * dp) / dp;
      ctx.drawImage(layer.cv, off, 0, w, h);
      ctx.drawImage(layer.cv, off + w, 0, w, h);
    }
  }

  // One full-screen ambient tint rect over the world (drawn untransformed,
  // after the parallax but before the camera transform).
  function drawAmbientTint(w, h, phase) {
    var tint = (phase && phase.tint) ? phase.tint : null;
    if (!tint || tint === 'rgba(0,0,0,0)') return;
    ctx.save();
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // ------------------------------------------------------------------------
  // Ground — prefer one cached island image; else tile a ground diamond.
  // Drawn inside the camera transform (world space) at world origin.
  // ------------------------------------------------------------------------
  function drawGround() {
    var A = G.Assets;
    if (!A) return;

    var island =
      (typeof A.islandImage === 'function' ? A.islandImage() : A.islandImage) ||
      (typeof A.island === 'function' ? A.island() : A.island) ||
      (typeof A.groundImage === 'function' ? A.groundImage() : A.groundImage) ||
      (typeof A.get === 'function' ? A.get('island') : null);

    if (island && island.width) {
      var ax = (island.anchorX != null) ? island.anchorX : (island.width >> 1);
      var ay = (island.anchorY != null) ? island.anchorY : 0;
      var origin = G.iso.worldToScreen(0, 0, 0);
      ctx.drawImage(island, origin.x - ax, origin.y - ay);
      return;
    }

    var tile =
      (typeof A.groundTile === 'function' ? A.groundTile() : A.groundTile) ||
      (typeof A.get === 'function' ? A.get('ground') : null);
    if (!tile || !tile.width) return;

    var tw = tile.width;
    var th = tile.height;
    var halfW = tw >> 1;
    var minC = Math.max(0, aabb.minCol | 0);
    var maxC = Math.min(COLS - 1, aabb.maxCol | 0);
    var minR = Math.max(0, aabb.minRow | 0);
    var maxR = Math.min(ROWS - 1, aabb.maxRow | 0);
    var p;
    for (var r = minR; r <= maxR; r++) {
      for (var cc = minC; cc <= maxC; cc++) {
        p = G.iso.worldToScreen(cc, r, 0);
        ctx.drawImage(tile, p.x - halfW, p.y - (th - TILE_H));
      }
    }
  }

  // ------------------------------------------------------------------------
  // Contact-shadow pass — drawn in world space, BEFORE the entity blit, so
  // shadows appear under buildings/kaiju. One soft ellipse per kaiju (and per
  // flying building) at its ground-projected cell.
  // ------------------------------------------------------------------------
  var _shadowRX = TILE_W * 0.38;      // ellipse half-width  (world x extent)
  var _shadowRY = TILE_H * 0.32;      // ellipse half-height (world y extent)

  function drawContactShadows() {
    if (reduced) return;

    // Kaiju shadow.
    if (player && player.pos) {
      var pos = player.pos;
      var gp = G.iso.worldToScreen(pos.wx, pos.wy, 0); // project at z=0 (ground)
      drawEllipseShadow(gp.x | 0, gp.y | 0, _shadowRX, _shadowRY, 0.45);
    }

    // Flying buildings (planes) — project their col/row to ground (wz=0).
    var World = G.World;
    if (World && typeof World.getFlyers === 'function') {
      var flyers = World.getFlyers();
      if (flyers) {
        for (var i = 0; i < flyers.length; i++) {
          var b = flyers[i];
          if (!b || b.state === 'destroyed') continue;
          var fp = G.iso.worldToScreen(b.col + 0.5, b.row + 0.5, 0);
          drawEllipseShadow(fp.x | 0, fp.y | 0, _shadowRX * 0.55, _shadowRY * 0.55, 0.28);
        }
      }
    }
  }

  // Draw a single dark ellipse at (cx,cy) in world space.
  function drawEllipseShadow(cx, cy, rx, ry, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------------
  // Cull box — un-project four viewport corners to a world-tile AABB.
  // ------------------------------------------------------------------------
  function computeCull(w, h) {
    var iso = G.iso;
    if (!iso || typeof iso.screenToWorld !== 'function') {
      aabb.minCol = 0; aabb.maxCol = COLS - 1;
      aabb.minRow = 0; aabb.maxRow = ROWS - 1;
      return;
    }
    var minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
    var corners = TMP_CORNERS;
    corners[0].x = 0; corners[0].y = 0;
    corners[1].x = w; corners[1].y = 0;
    corners[2].x = 0; corners[2].y = h;
    corners[3].x = w; corners[3].y = h;
    var ok = false;
    for (var i = 0; i < 4; i++) {
      var p = iso.screenToWorld(corners[i].x, corners[i].y);
      if (!p) continue;
      ok = true;
      if (p.wx < minCol) minCol = p.wx;
      if (p.wx > maxCol) maxCol = p.wx;
      if (p.wy < minRow) minRow = p.wy;
      if (p.wy > maxRow) maxRow = p.wy;
    }
    if (!ok) {
      aabb.minCol = 0; aabb.maxCol = COLS - 1;
      aabb.minRow = 0; aabb.maxRow = ROWS - 1;
      return;
    }
    aabb.minCol = Math.floor(minCol) - CULL_PAD;
    aabb.maxCol = Math.ceil(maxCol) + CULL_PAD;
    aabb.minRow = Math.floor(minRow) - CULL_PAD - CULL_RISE_ROWS;
    aabb.maxRow = Math.ceil(maxRow) + CULL_PAD;
  }

  // ------------------------------------------------------------------------
  // Visible list — gather culled buildings + player unit, depth-sorted.
  // ------------------------------------------------------------------------
  function buildVisible() {
    visCount = 0;
    var World = G.World;
    var iso = G.iso;

    if (World && typeof World.getBuildingAt === 'function') {
      var minC = Math.max(0, aabb.minCol);
      var maxC = Math.min(COLS - 1, aabb.maxCol);
      var minR = Math.max(0, aabb.minRow);
      var maxR = Math.min(ROWS - 1, aabb.maxRow);
      for (var r = minR; r <= maxR; r++) {
        for (var c = minC; c <= maxC; c++) {
          var b = World.getBuildingAt(c, r);
          if (!b) continue;
          if (b.col !== c || b.row !== r) continue;
          pushBuilding(b);
        }
      }
    }

    // Flyers (planes) — they live at altitude and are NOT in the grid cell scan.
    // World exposes getFlyers() so we add them to the depth-sorted list separately.
    var World2 = G.World;
    if (World2 && typeof World2.getFlyers === 'function') {
      var flyers = World2.getFlyers();
      if (flyers) {
        for (var fi = 0; fi < flyers.length; fi++) {
          var fb = flyers[fi];
          if (!fb) continue;
          // De-dup: flyers are unique objects; always push (they won't be in grid scan).
          pushBuilding(fb);
        }
      }
    }

    if (player && player.pos) {
      pushPlayer(player);
    }
  }

  // Push a building entry with the correct depth key.
  // For flying buildings: use b.altitude as wz so they sort into the sky layer.
  function pushBuilding(b) {
    dkProbe.wx = b.col;
    dkProbe.wy = b.row;
    // Flyers sort by altitude (world-Z), ground buildings sort at z=0.
    dkProbe.wz = (b.flying && b.altitude != null) ? b.altitude : 0;
    dkProbe.depthBias = 0;
    var dk = G.iso.depthKey(dkProbe);
    var e = pool(visCount);
    e.kind = 0;
    e.ref = b;
    e._dk = dk;
    visCount++;
  }

  // Push the player unit entry (kind 1), depthBias +1.
  function pushPlayer(unit) {
    var pos = unit.pos;
    dkProbe.wx = pos.wx;
    dkProbe.wy = pos.wy;
    dkProbe.wz = pos.z || 0;
    dkProbe.depthBias = 1;
    var dk = G.iso.depthKey(dkProbe);
    var e = pool(visCount);
    e.kind = 1;
    e.ref = unit;
    e._dk = dk;
    visCount++;
  }

  function pool(i) {
    var e = visible[i];
    if (!e) { e = { kind: 0, ref: null, _dk: 0 }; visible[i] = e; }
    return e;
  }

  // ------------------------------------------------------------------------
  // Building blit — fetch the cached sprite from Assets.buildingSprite(b)
  // and draw it anchored so the building's ground-tile apex meets the sprite foot.
  // Assets v3 API: buildingSprite(b) — passes the whole building object so assets
  // can read sprite/tier/footprint/stage/tint/seed etc.
  // Fallback: positional buildingSprite(tier, fw, stage) for a v2 assets.js.
  // ------------------------------------------------------------------------
  function stageFor(b) {
    var f = b.maxHp ? (b.hp / b.maxHp) : 1;
    return f > 0.66 ? 0 : (f > 0.33 ? 1 : 2);
  }

  function drawBuilding(b) {
    var A = G.Assets;
    if (!A || typeof A.buildingSprite !== 'function') return;

    // v3 contract: pass the full building object.
    var spr = A.buildingSprite(b);

    // Fallback to v2 positional API if the v3 call returned falsy
    // (assets.js not yet updated — graceful degradation during integration).
    if (!spr || !spr.width) {
      var fw = (b.footprint && b.footprint.w) || 1;
      spr = A.buildingSprite(b.tier, fw, stageFor(b));
    }
    if (!spr || !spr.width) return;

    // For flying buildings: project at their altitude so they appear airborne.
    var wz = (b.flying && b.altitude != null) ? b.altitude : 0;
    var p = G.iso.worldToScreen(b.col, b.row, wz);

    // _cssW/_cssH/_anchorX/_anchorY: the oversize/anchor fix (dpr blit).
    var cw = (spr._cssW != null) ? spr._cssW : spr.width;
    var ch = (spr._cssH != null) ? spr._cssH : spr.height;
    var ax = (spr._anchorX != null) ? spr._anchorX : (cw / 2);
    var ay = (spr._anchorY != null) ? spr._anchorY : (ch - (TILE_H >> 1));

    var dx = p.x - ax;
    var dy = p.y - ay;

    if (!reduced && b.shake) {
      var s = b.shake;
      dx += (((b.col * 13 + b.row * 7) & 3) - 1.5) * s;
      dy += (((b.col * 5 + b.row * 11) & 3) - 1.5) * s;
    }

    ctx.drawImage(spr, dx | 0, dy | 0, cw, ch);
  }

  // ------------------------------------------------------------------------
  // Kaiju blit — delegate to unit.draw.
  // ------------------------------------------------------------------------
  function drawKaiju(unit) {
    if (typeof unit.draw !== 'function') return;
    var pos = unit.pos;
    var p = G.iso.worldToScreen(pos.wx, pos.wy, pos.z || 0);
    unit.draw(ctx, p.x | 0, p.y | 0, 1);
  }

  // ------------------------------------------------------------------------
  // HUD overlay (untransformed, CSS space) — combo pip, floating damage text,
  // and touch controls. Drawn after ctx.restore so nothing is camera-shaken.
  // ------------------------------------------------------------------------
  function drawHud(w, h) {
    drawComboPip(w, h);
    drawDamageText();
    drawTouchControls(w, h);
  }

  // Combo pip — small ring at mid-screen, fills as combo ramps.
  function drawComboPip(w, h) {
    var Eco = G.Economy;
    if (!Eco || typeof Eco.comboMult !== 'function') return;
    var mult = Eco.comboMult();
    var maxMult = (Cfg.COMBO && Cfg.COMBO.MAX) || 2.0;
    var t = (mult - 1) / Math.max(0.0001, (maxMult - 1));
    if (t <= 0.001) return;
    t = U.clamp(t, 0, 1);

    var cx = w * 0.5;
    var cy = (h * 0.5) - 4;
    var R = 22;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20,24,34,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    var col = mixHex('#ffd24a', '#ff4a4a', t);
    ctx.strokeStyle = col;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.font = '800 15px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('x' + (Math.round(mult * 10) / 10).toFixed(1), cx, cy + 1);
    ctx.restore();
  }

  // Floating damage text layer.
  function drawDamageText() {
    var FX = G.FX;
    if (!FX) return;
    if (typeof FX.drawOverlay === 'function') {
      FX.drawOverlay(ctx);
    } else if (typeof FX.drawText === 'function') {
      FX.drawText(ctx);
    }
  }

  // Touch controls — joystick, SMASH disc, optional jump disc.
  function drawTouchControls(w, h) {
    var Input = G.Input;
    if (!Input) return;
    // Display modality (UP / research-2026-06b note 2): touch UI = discs; desktop UI =
    // a key-legend + the surfaced Nova pip. Drive off Input.currentInput ('touch'|'desktop',
    // a DISPLAY field decoupled from the sticky isTouch INPUT-routing flag); fall back to
    // isTouch if an older input.js (no currentInput) is loaded.
    var touchUI = (Input.currentInput != null) ? (Input.currentInput === 'touch') : (Input.isTouch === true);
    if (!touchUI) { drawDesktopControls(w, h); return; }

    var j = Input.joystick;
    if (j && (j.active || j.visible)) {
      var bx = (j.baseX != null ? j.baseX : (j.cx != null ? j.cx : j.x)) || 0;
      var by = (j.baseY != null ? j.baseY : (j.cy != null ? j.cy : j.y)) || 0;
      var rad = (j.radius != null ? j.radius : (j.r != null ? j.r : 70));
      var kx = (j.knobX != null ? j.knobX : (j.kx != null ? j.kx : bx + (j.dx || 0) * rad));
      var ky = (j.knobY != null ? j.knobY : (j.ky != null ? j.ky : by + (j.dy || 0) * rad));
      drawJoystick(bx, by, kx, ky, rad);
    }

    var sb = Input.smashBtn;
    if (sb) {
      var sx = (sb.x != null ? sb.x : (sb.cx != null ? sb.cx : (w - 92)));
      var sy = (sb.y != null ? sb.y : (sb.cy != null ? sb.cy : (h - 92)));
      var sr = (sb.r != null ? sb.r : (sb.radius != null ? sb.radius : 46));
      var pressed = !!(sb.pressed || sb.down || sb.active);
      drawSmash(sx, sy, sr, pressed);
    }

    // Jump disc — hidden for FLYER forms (Mothra/Rodan hover, no ground jump — FLYERMEGA);
    // otherwise shown if Input exposes a jumpBtn (contract §3 / input §44).
    var jb = Input.jumpBtn;
    if (jb && !(player && player._formDef && player._formDef.shape && player._formDef.shape.archetype === 'flyer')) {
      var jx = (jb.x != null ? jb.x : (jb.cx != null ? jb.cx : (w - 200)));
      var jy = (jb.y != null ? jb.y : (jb.cy != null ? jb.cy : (h - 92)));
      var jr = (jb.r != null ? jb.r : (jb.radius != null ? jb.radius : 36));
      var jPressed = !!(jb.pressed || jb.down || jb.active);
      drawJump(jx, jy, jr, jPressed);
    }

    // NOVA disc — only once the finisher is owned. Shows the charge fill (while held)
    // or the depleting cooldown arc (while recharging), read from the live player.
    var fb = Input.finisherBtn;
    if (fb && G.Economy && G.Economy.finisherOwned) {
      var fx2 = (fb.x != null ? fb.x : (w - 320));
      var fy2 = (fb.y != null ? fb.y : (h - 92));
      var fr2 = (fb.r != null ? fb.r : 38);
      drawFinisher(fx2, fy2, fr2,
                   player ? (player.chargeT || 0) : 0,
                   player ? Math.max(0, player.finisherCd || 0) : 0);
    }
  }

  // Floating joystick.
  function drawJoystick(bx, by, kx, ky, rad) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, rad, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,28,46,0.30)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(120,160,220,0.45)';
    ctx.stroke();
    var kr = Math.max(18, rad * 0.42);
    ctx.beginPath();
    ctx.arc(kx, ky, kr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(90,150,230,0.55)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(180,215,255,0.75)';
    ctx.stroke();
    ctx.restore();
  }

  // SMASH disc.
  function drawSmash(sx, sy, sr, pressed) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = pressed ? 'rgba(255,90,70,0.85)' : 'rgba(180,55,45,0.55)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = pressed ? 'rgba(255,200,180,0.95)' : 'rgba(255,140,120,0.7)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 ' + Math.round(sr * 0.46) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SMASH', sx, sy + 1);
    ctx.restore();
  }

  // Jump disc — a green-tinted disc to the left of SMASH.
  function drawJump(jx, jy, jr, pressed) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(jx, jy, jr, 0, Math.PI * 2);
    ctx.fillStyle = pressed ? 'rgba(80,220,130,0.85)' : 'rgba(40,140,80,0.55)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = pressed ? 'rgba(180,255,210,0.95)' : 'rgba(120,220,160,0.7)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 ' + Math.round(jr * 0.50) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('JUMP', jx, jy + 1);
    ctx.restore();
  }

  // NOVA disc — violet; brightens while charging. Charge fill arc (hot, sweeps 0→full)
  // while held; depleting gray arc while on cooldown.
  function drawFinisher(fx, fy, fr, charge, cd) {
    var COOLD = (Cfg.FINISHER && Cfg.FINISHER.COOLDOWN_S) || 8;
    var charging = charge > 0.001;
    var onCd = cd > 0.001;
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fillStyle = charging ? 'rgba(150,80,230,0.85)'
                  : (onCd ? 'rgba(70,45,110,0.45)' : 'rgba(120,60,200,0.55)');
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = charging ? 'rgba(220,180,255,0.95)' : 'rgba(170,120,235,0.7)';
    ctx.stroke();
    if (charging) {
      ctx.strokeStyle = mixHex('#c08aff', '#ff5af0', U.clamp(charge, 0, 1));
      ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(fx, fy, fr - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * U.clamp(charge, 0, 1));
      ctx.stroke();
    } else if (onCd) {
      ctx.strokeStyle = 'rgba(165,165,185,0.7)';
      ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(fx, fy, fr - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * U.clamp(cd / COOLD, 0, 1));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 ' + Math.round(fr * 0.42) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NOVA', fx, fy + 1);
    ctx.restore();
  }

  // ------------------------------------------------------------------------
  // Desktop control affordances (UP / research-2026-06b note 2): the actions all
  // WORK on desktop (Space/click=Atomic Breath, Shift/J=Jump, F=Nova, WASD=Move) but
  // were undiscoverable — drawTouchControls early-returned. This draws a key-legend
  // for discoverability + surfaces the Nova charge/cooldown pip (the touch path's
  // drawFinisher reuse, so keyboard-F charging finally gets on-screen feedback).
  // Each fragment is wrapped in its own balanced save/restore — drawHud paints the
  // combo pip + damage text AFTER this, so a leaked ctx state would corrupt them.
  // ------------------------------------------------------------------------
  function drawDesktopControls(w, h) {
    var Input = G.Input;
    var Eco = G.Economy;
    var owned = !!(Eco && Eco.finisherOwned);

    // Nova pip — same disc + live player state the touch path uses; 'F' is the keybind hook.
    if (owned && Input && Input.finisherBtn) {
      var fb = Input.finisherBtn;
      var fx = (fb.x != null ? fb.x : (w - 320));
      var fy = (fb.y != null ? fb.y : (h - 92));
      var fr = (fb.r != null ? fb.r : 38);
      var charge = player ? (player.chargeT || 0) : 0;
      var cd = player ? Math.max(0, player.finisherCd || 0) : 0;
      drawFinisher(fx, fy, fr, charge, cd);          // internally balanced
      if (!reduced && charge <= 0.001 && cd <= 0.001) {
        var pulse = 0.30 + 0.30 * Math.sin(performance.now() * 0.006);   // ready-flash
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(210,170,255,0.95)';
        ctx.beginPath();
        ctx.arc(fx, fy, fr + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();                                    // 'F' keybind badge above the pip
      ctx.fillStyle = 'rgba(235,225,255,0.95)';
      ctx.font = '800 14px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('F', fx, fy - fr - 7);
      ctx.restore();
    }

    // Key legend (bottom-left) — informational; mouse/keys already drive the game.
    var flyer = !!(player && player._formDef && player._formDef.shape && player._formDef.shape.archetype === 'flyer');
    var rows = [['SPACE / CLICK', 'Atomic Breath']];
    if (!flyer) rows.push(['SHIFT / J', 'Jump']);     // flyers hover — no jump
    rows.push(['WASD / ARROWS', 'Move']);
    if (owned) rows.push(['F', 'Nova Slam']);
    rows.push(['SHOP ↗', 'Upgrades']);          // points at the always-visible #shop-btn (top-right); no key bound (research §90)

    ctx.save();
    ctx.textBaseline = 'middle';
    var pad = 12, lh = 21, keyW = 124, lblW = 116;
    var panelW = pad * 2 + keyW + lblW;
    var panelH = pad * 2 + rows.length * lh - 5;
    var px = 12, py = h - panelH - 12;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(14,18,28,0.80)';
    ctx.fillRect(px, py, panelW, panelH);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120,150,200,0.32)';
    ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    for (var i = 0; i < rows.length; i++) {
      var ry = py + pad + i * lh + lh * 0.5 - 4;
      ctx.font = '800 12px ui-monospace, Menlo, monospace';
      ctx.fillStyle = 'rgba(150,200,255,0.96)';
      ctx.fillText(rows[i][0], px + pad, ry);
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(222,230,242,0.92)';
      ctx.fillText(rows[i][1], px + pad + keyW, ry);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------------
  // Color helpers (hex lerp for combo pip tint).
  // ------------------------------------------------------------------------
  function hx2(h) {
    h = ('' + h).replace('#', '');
    if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    return parseInt(h, 16);
  }
  function mixHex(a, b, t) {
    var na = hx2(a), nb = hx2(b);
    var ar = (na >> 16) & 255, ag = (na >> 8) & 255, ab = na & 255;
    var br = (nb >> 16) & 255, bg = (nb >> 8) & 255, bb = nb & 255;
    var r = (ar + (br - ar) * t) | 0;
    var g = (ag + (bg - ag) * t) | 0;
    var bl = (ab + (bb - ab) * t) | 0;
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  // ------------------------------------------------------------------------
  // PUBLIC API
  // ------------------------------------------------------------------------
  function setPlayer(unit) {
    player = unit || null;
  }

  function frame(dt) {
    if (!ensureCtx()) return;

    var w = cssW();
    var h = cssH();

    // 1) Clear the full backing store in device px, transform-independent.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, deviceW(), deviceH());
    ctx.restore();

    ctx.imageSmoothingEnabled = false;

    // Read the environment phase once per frame.
    var phase = envPhase();

    // Camera scroll reference for parallax.
    var cam = G.camera;
    var camX = (cam && typeof cam.x === 'number') ? cam.x : 0;

    // 2) Dynamic sky gradient (full screen, behind everything).
    drawSkyClear(w, h, phase);

    // 3) Celestial disc (sun or moon) above the horizon.
    drawCelestialDisc(w, h, phase);

    // 4) Parallax silhouette skyline layers.
    drawSkyLayers(camX, w, h);

    // Compute the world-tile cull AABB once per frame.
    computeCull(w, h);

    // 4b) Full-screen ambient tint rect (one rgba fill over the whole canvas).
    drawAmbientTint(w, h, phase);

    // 5) Enter world space.
    ctx.save();
    if (cam && typeof cam.apply === 'function') cam.apply(ctx);

    // 6) Ground (island image or tiled diamond).
    drawGround();

    // 7) Contact-shadow pass (ground ellipses under kaiju and planes).
    drawContactShadows();

    // 7b) Aim-highlight ring — a flat ground decal under the building the player
    //     is about to smash. Drawn here (not in the entity list) so it never
    //     touches the depth sort.
    drawAimRing();

    // 8) Visible list → depth sort → blit.
    buildVisible();
    if (visCount > 1) {
      sortLive();
    }
    for (var i = 0; i < visCount; i++) {
      var e = visible[i];
      if (e.kind === 1) drawKaiju(e.ref);
      else drawBuilding(e.ref);
    }

    // 9) World-space FX (debris, particles, signature-attack effects).
    var FX = G.FX;
    if (FX && typeof FX.draw === 'function') FX.draw(ctx);

    // 10) Leave world space.
    ctx.restore();

    // 10b) Full-screen kill flash (untransformed, over the scene, under the HUD).
    drawScreenFlash(w, h);

    // 11) HUD overlay (untransformed): combo pip, floating damage text, touch controls.
    drawHud(w, h);
  }

  // Aim-highlight ring: a breathing gold ellipse at the target footprint base.
  // World-space (call inside the camera transform). Skips non-standing targets.
  function drawAimRing() {
    if (!player || !player.aimBuilding) return;
    var b = player.aimBuilding;
    if (b.state !== 'standing') return;
    var fw = (b.footprint && b.footprint.w) || 1;
    var fh = (b.footprint && b.footprint.h) || 1;
    var p = G.iso.worldToScreen(b.col + fw * 0.5, b.row + fh * 0.5, 0);
    var pulse = reduced ? 0.6 : (0.55 + 0.45 * Math.sin(performance.now() * 0.006));
    ctx.save();
    ctx.globalAlpha = pulse * 0.9;
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, TILE_W * 0.42 * fw, TILE_H * 0.42 * fh, 0, 0, 6.2832);
    ctx.stroke();
    ctx.restore();
  }

  // Full-screen white flash on a kill — alpha owned + decayed by FX.
  function drawScreenFlash(w, h) {
    var FX = G.FX;
    if (!FX || typeof FX.flashAmount !== 'function') return;
    var a = FX.flashAmount();
    if (!(a > 0)) return;
    ctx.save();
    ctx.globalAlpha = U.clamp(a, 0, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Insertion sort over the live slice (mostly-presorted; beats Array.sort for ~40-60 items).
  function sortLive() {
    for (var i = 1; i < visCount; i++) {
      var cur = visible[i];
      var key = cur._dk;
      var j = i - 1;
      while (j >= 0 && visible[j]._dk > key) {
        visible[j + 1] = visible[j];
        j--;
      }
      visible[j + 1] = cur;
    }
  }

  G.Render = {
    frame: frame,
    setPlayer: setPlayer
  };
})(window.GAME);
