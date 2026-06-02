/* GAME.Render — the painter's loop for World 1 v2 (2.5D isometric, procedural Canvas2D).
 *
 * Owns NOTHING but drawing: every number comes from GAME.Config, every helper from
 * GAME.Utils, every coordinate from GAME.iso/GAME.camera, every sprite from GAME.Assets,
 * every entity from GAME.World / the player unit / GAME.FX, every HUD value from
 * GAME.Economy / GAME.Input.
 *
 * Contract (blueprint §2): GAME.Render.frame(dt) and GAME.Render.setPlayer(unit).
 *
 * Per-frame order (blueprint §5):
 *   1. clear in device px (full backing store, transform-independent)
 *   2. cached parallax skyline — 3 layers, x-scrolled by camera.x (untransformed)
 *   3. ctx.save + GAME.camera.apply(ctx)  → enter world space
 *   4. blit cached ground (single island image, else tile GAME.Assets.groundTile)
 *   5. build visible list (culled buildings + player unit), set ._dk = iso.depthKey,
 *      sort ascending, blit (buildings via Assets.buildingSprite, kaiju via unit.draw)
 *   6. world-space FX  (GAME.FX.draw)   → debris / particles inside the camera transform
 *   7. ctx.restore  → leave world space
 *   8. untransformed HUD overlay: combo pip (Economy.comboMult), floating damage text
 *      (GAME.FX), touch controls (GAME.Input.joystick / .smashBtn)
 *
 * Performance discipline:
 *   - imageSmoothingEnabled=false (crisp pixels)
 *   - NO per-frame allocations in the hot path: the visible list, the depth-key scratch
 *     object, and the cull AABB are all module-level and reused every frame.
 *   - NO ctx.shadowBlur anywhere (glows are baked by GAME.Assets / drawn live by entities).
 *   - DPR / setTransform is owned by GAME.Main; frame() inherits whatever transform Main
 *     installed on resize and never touches it (except a transient identity reset to clear).
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
  var canvas = null;                   // #scene, looked up lazily on first frame
  var ctx = null;
  var player = null;                   // the active kaiju unit (set via setPlayer)

  // Cached parallax skyline layers (built once, on first frame, sized to the canvas).
  var sky = null;                      // { layers:[{cv, speed, y}], w, h, dpr }

  // Reused per-frame scratch so the hot loop allocates nothing.
  var visible = [];                    // entries pushed/cleared each frame
  var visCount = 0;                    // live length (we never shrink the array)
  var dkProbe = { wx: 0, wy: 0, wz: 0, depthBias: 0 }; // fed to iso.depthKey
  var aabb = { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 }; // world cull box (tiles)
  var scrCorner = { x: 0, y: 0 };      // reused screen-point for un-projection

  // Tallest building rise in *rows* — used to pad the cull box so a tall tower whose
  // footprint sits just below the viewport still draws its top. ROWS rises ≈ tier height;
  // a generous constant (worst tower ≈ 9 world-Z → 9*44/32 ≈ 12 rows of screen rise).
  var CULL_PAD = 3;                    // base padding in tiles on every side
  var CULL_RISE_ROWS = 14;            // extra rows added to the "far" edge for tall towers

  // ------------------------------------------------------------------------
  // Boot helpers
  // ------------------------------------------------------------------------

  // Resolve the canvas/context the first time we draw (Main may attach late).
  function ensureCtx() {
    if (ctx) return true;
    canvas = document.getElementById('scene');
    if (!canvas) return false;
    ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.imageSmoothingEnabled = false;
    return true;
  }

  // Backing-store pixel size (device px). Falls back to CSS size if unset.
  function deviceW() { return canvas.width || Math.round(canvas.clientWidth || window.innerWidth); }
  function deviceH() { return canvas.height || Math.round(canvas.clientHeight || window.innerHeight); }
  // Logical (CSS) size — the coordinate space the DPR base transform draws in.
  function cssW() { return canvas.clientWidth || window.innerWidth; }
  function cssH() { return canvas.clientHeight || window.innerHeight; }

  // ------------------------------------------------------------------------
  // Parallax skyline — three baked gradient/silhouette layers (blueprint §5/§7).
  // Built to CSS dimensions; x-scrolled by camera.x, tiled horizontally.
  // Rebuilt only when the logical size changes (resize handled by Main).
  // ------------------------------------------------------------------------
  function buildSky(w, h) {
    var layers = [];
    // Layer descriptors: parallax speed (fraction of camera.x), silhouette palette,
    // building band height, and vertical anchor (0..1 of screen height).
    var defs = [
      { speed: 0.18, top: '#0a1430', bot: '#142a55', sil: '#0c1838', minH: 0.10, maxH: 0.20, density: 26, y: 0.46 },
      { speed: 0.34, top: '#0c1c44', bot: '#1d3e74', sil: '#10224a', minH: 0.16, maxH: 0.34, density: 20, y: 0.54 },
      { speed: 0.58, top: '#0e2452', bot: '#22518f', sil: '#142a5a', minH: 0.24, maxH: 0.52, density: 15, y: 0.66 }
    ];
    for (var d = 0; d < defs.length; d++) {
      var def = defs[d];
      // Each layer canvas is one screen-width wide; we tile it horizontally to scroll.
      var lw = Math.max(2, Math.ceil(w));
      var lh = Math.max(2, Math.ceil(h));
      var cv = document.createElement('canvas');
      cv.width = lw;
      cv.height = lh;
      var c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;

      // Sky gradient for the deepest layer only (others are transparent overlays).
      if (d === 0) {
        var g = c.createLinearGradient(0, 0, 0, lh);
        g.addColorStop(0, '#05070f');
        g.addColorStop(0.42, def.top);
        g.addColorStop(1, def.bot);
        c.fillStyle = g;
        c.fillRect(0, 0, lw, lh);
        // Faint stars in the upper band.
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

      // Building silhouette band — deterministic per layer so tiling seams line up.
      var baseY = Math.floor(lh * def.y);
      var rng = U.rng(0x1000 * (d + 1) + 0x33);
      // Silhouette fill with a soft top→bottom darkening for depth.
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
        c.fillRect(x, by, bw - 2, bh + lh); // +lh so the band reaches the bottom edge
        // Sparse lit windows for the nearer two layers (cheap rects, baked once).
        if (d > 0 && rng() < 0.8) {
          c.fillStyle = (d === 2) ? 'rgba(120,200,255,0.30)' : 'rgba(110,170,255,0.22)';
          var cols = Math.max(1, Math.floor((bw - 6) / 7));
          var rowsW = Math.max(2, Math.floor(bh / 9));
          for (var wy = 0; wy < rowsW; wy++) {
            for (var wx = 0; wx < cols; wx++) {
              if (rng() < 0.5) continue;
              c.fillRect(x + 3 + wx * 7, by + 4 + wy * 9, 3, 3);
            }
          }
          c.fillStyle = sg; // restore silhouette fill for the next tower
        }
        x += bw;
      }
      layers.push({ cv: cv, speed: def.speed, y: 0 });
    }
    return { layers: layers, w: w, h: h };
  }

  // Draw the parallax skyline, untransformed (device-independent CSS space).
  // camX = camera world-x scroll; we tile each layer so it wraps seamlessly.
  function drawSky(camX, w, h) {
    if (!sky || sky.w !== w || sky.h !== h) sky = buildSky(w, h);
    var L = sky.layers;
    for (var i = 0; i < L.length; i++) {
      var layer = L[i];
      var lw = layer.cv.width;
      // Horizontal offset from camera; modulo into [0,lw) and draw two copies to wrap.
      var off = -((camX * layer.speed) % lw);
      if (off > 0) off -= lw;
      // Two blits cover the whole width regardless of scroll phase.
      ctx.drawImage(layer.cv, off, 0);
      ctx.drawImage(layer.cv, off + lw, 0);
    }
  }

  // ------------------------------------------------------------------------
  // Ground — prefer one cached island image; else tile a ground diamond.
  // Drawn inside the camera transform (world space) at world origin.
  // ------------------------------------------------------------------------
  function drawGround() {
    var A = G.Assets;
    if (!A) return;

    // Preferred: a single pre-composited island image (1 drawImage). Assets may expose
    // it as a getter, a property, or via get('island'); support all without assuming.
    var island =
      (typeof A.islandImage === 'function' ? A.islandImage() : A.islandImage) ||
      (typeof A.island === 'function' ? A.island() : A.island) ||
      (typeof A.groundImage === 'function' ? A.groundImage() : A.groundImage) ||
      (typeof A.get === 'function' ? A.get('island') : null);

    if (island && island.width) {
      // The island image is authored anchored so its world-origin tile (col0,row0 top)
      // sits at the image's stored anchor. Assets convention: anchorX/anchorY mark where
      // world point (0,0,0) lands inside the image; default to the image's natural top.
      var ax = (island.anchorX != null) ? island.anchorX : (island.width >> 1);
      var ay = (island.anchorY != null) ? island.anchorY : 0;
      var origin = G.iso.worldToScreen(0, 0, 0);
      ctx.drawImage(island, origin.x - ax, origin.y - ay);
      return;
    }

    // Fallback: tile the ground diamond across the whole grid (cull to AABB so we only
    // blit visible tiles). One cached tile, many cheap drawImage calls.
    var tile =
      (typeof A.groundTile === 'function' ? A.groundTile() : A.groundTile) ||
      (typeof A.get === 'function' ? A.get('ground') : null);
    if (!tile || !tile.width) return;

    // The diamond tile is TILE_W wide, (TILE_H + a small rise) tall; its top-apex maps to
    // the cell's worldToScreen point. Center the tile on that apex.
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
        // Anchor: tile's horizontal center on the cell apex; small vertical nudge so the
        // diamond's top edge meets the apex (apex sits TILE_H/2 below the tile top).
        ctx.drawImage(tile, p.x - halfW, p.y - (th - TILE_H));
      }
    }
  }

  // ------------------------------------------------------------------------
  // Cull box — un-project the four viewport corners to a world-tile AABB,
  // padded for safety + tall-tower rise. Camera position is read indirectly
  // via iso.screenToWorld (camera-relative ground plane), so we never need
  // the camera's private fields. Result written into module-level `aabb`.
  // ------------------------------------------------------------------------
  function computeCull(w, h) {
    var iso = G.iso;
    // If the inverse projection isn't available (e.g. iso loaded out of order), fall back
    // to the full grid so we never crash the loop — correctness over cull tightness.
    if (!iso || typeof iso.screenToWorld !== 'function') {
      aabb.minCol = 0; aabb.maxCol = COLS - 1;
      aabb.minRow = 0; aabb.maxRow = ROWS - 1;
      return;
    }
    var minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
    // Four corners; screenToWorld returns {wx,wy} on the ground plane.
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
      // screenToWorld unavailable — fall back to the entire grid (correctness over cull).
      aabb.minCol = 0; aabb.maxCol = COLS - 1;
      aabb.minRow = 0; aabb.maxRow = ROWS - 1;
      return;
    }
    // Pad: base padding all sides; extra rows on the bottom (far) edge so tall towers
    // whose footprint is just past the bottom of the screen still draw their crown.
    aabb.minCol = Math.floor(minCol) - CULL_PAD;
    aabb.maxCol = Math.ceil(maxCol) + CULL_PAD;
    aabb.minRow = Math.floor(minRow) - CULL_PAD - CULL_RISE_ROWS; // top edge: towers rise up
    aabb.maxRow = Math.ceil(maxRow) + CULL_PAD;
  }
  // Pre-allocated corner scratch for computeCull (no per-frame alloc).
  var TMP_CORNERS = [
    { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
  ];

  // ------------------------------------------------------------------------
  // Visible list — gather culled standing/animating buildings + the player unit.
  // Buildings come from World.getBuildingAt(col,row) over the culled cell range
  // (contract-only; no private "all buildings" accessor assumed). Each entry gets
  // a ._dk depth key, then we sort ascending and blit back-to-front.
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
          // A building can span a footprint; getBuildingAt may return the same object for
          // several cells. De-dupe by only accepting it from its anchor cell (col===c,row===r).
          if (b.col !== c || b.row !== r) continue;
          // 'respawning'/'rubble' still draw (rubble pile, rising shell); Assets decides the
          // stage sprite. We render every non-null building in range.
          push(b);
        }
      }
    }

    // Player unit (kaiju). Drawn via unit.draw; depth-biased +1 so it sorts in front of a
    // building sharing its tile (blueprint §5 depthKey note).
    if (player && player.pos) {
      pushPlayer(player);
    }
  }

  // Push a building entry, computing its depth key from its world tile (z=0 base).
  function push(b) {
    dkProbe.wx = b.col;
    dkProbe.wy = b.row;
    dkProbe.wz = 0;
    dkProbe.depthBias = 0;
    var dk = G.iso.depthKey(dkProbe);
    var e = pool(visCount);
    e.kind = 0;          // 0 = building
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
    dkProbe.depthBias = 1;             // kaiju sorts ahead of co-tile buildings
    var dk = G.iso.depthKey(dkProbe);
    var e = pool(visCount);
    e.kind = 1;          // 1 = kaiju
    e.ref = unit;
    e._dk = dk;
    visCount++;
  }

  // Reusable entry pool: grow on demand, never shrink. Each entry is a stable object.
  function pool(i) {
    var e = visible[i];
    if (!e) { e = { kind: 0, ref: null, _dk: 0 }; visible[i] = e; }
    return e;
  }

  // Ascending depth-key comparator (back-to-front). Operates on the live slice only.
  function byDepth(a, b) { return a._dk - b._dk; }

  // ------------------------------------------------------------------------
  // Building blit — fetch the cached sprite from Assets and draw it anchored so the
  // building's ground-tile apex (worldToScreen at z=0) meets the sprite's foot anchor.
  // Assets owns the sprite cache keyed by tier|w|stage; we pass the building so Assets
  // can read tier/footprint/stage/seed, with a positional fallback for a leaner API.
  // ------------------------------------------------------------------------
  // Damage stage (0 healthy → 2 wrecked) from current HP fraction. World owns hp; we derive.
  function stageFor(b) {
    var f = b.maxHp ? (b.hp / b.maxHp) : 1;
    return f > 0.66 ? 0 : (f > 0.33 ? 1 : 2);
  }

  function drawBuilding(b) {
    var A = G.Assets;
    if (!A || typeof A.buildingSprite !== 'function') return;
    // Positional call: Assets keys the cache by tier|footprintW|stage (NOT the object).
    var fw = (b.footprint && b.footprint.w) || 1;
    var spr = A.buildingSprite(b.tier, fw, stageFor(b));
    if (!spr || !spr.width) return;

    var p = G.iso.worldToScreen(b.col, b.row, 0);
    // Sprites are baked at device-pixel resolution; Assets stamps the CSS-unit size
    // (_cssW/_cssH) and foot anchor (_anchorX/_anchorY). Blit at CSS size so the dpr
    // transform isn't double-counted, and anchor the foot on the cell apex.
    var cw = (spr._cssW != null) ? spr._cssW : spr.width;
    var ch = (spr._cssH != null) ? spr._cssH : spr.height;
    var ax = (spr._anchorX != null) ? spr._anchorX : (cw / 2);
    var ay = (spr._anchorY != null) ? spr._anchorY : (ch - (TILE_H >> 1));

    var dx = p.x - ax;
    var dy = p.y - ay;

    // Optional hit-flash / shake jitter the building itself reports (World writes b.shake).
    if (!reduced && b.shake) {
      var s = b.shake;
      dx += (((b.col * 13 + b.row * 7) & 3) - 1.5) * s;
      dy += (((b.col * 5 + b.row * 11) & 3) - 1.5) * s;
    }

    ctx.drawImage(spr, dx | 0, dy | 0, cw, ch);
  }

  // ------------------------------------------------------------------------
  // Kaiju blit — delegate to the unit's own iso renderer. We compute the screen
  // anchor (foot centroid) and pass a constant scaleBucket (no dynamic zoom in W1).
  // The unit draws its cached body + live glow overlay internally.
  // ------------------------------------------------------------------------
  function drawKaiju(unit) {
    if (typeof unit.draw !== 'function') return;
    var pos = unit.pos;
    var p = G.iso.worldToScreen(pos.wx, pos.wy, pos.z || 0);
    unit.draw(ctx, p.x | 0, p.y | 0, 1); // scaleBucket = 1
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

  // Combo pip — a small ring at top-center that fills 0→1 as comboMult goes 1→MAX,
  // tinted from gold→red. Hidden at rest (mult ≈ 1). Pure rects/arcs, no shadowBlur.
  function drawComboPip(w, h) {
    var Eco = G.Economy;
    if (!Eco || typeof Eco.comboMult !== 'function') return;
    var mult = Eco.comboMult();
    var maxMult = (Cfg.COMBO && Cfg.COMBO.MAX) || 2.0;
    var t = (mult - 1) / Math.max(0.0001, (maxMult - 1)); // 0..1
    if (t <= 0.001) return;                                 // idle → nothing to show
    t = U.clamp(t, 0, 1);

    var cx = w * 0.5;
    var cy = (h * 0.5) - 4;          // mid-screen, just above center (out of the action)
    var R = 22;
    ctx.save();
    ctx.globalAlpha = 0.9;
    // Track ring (dim).
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20,24,34,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // Filled arc proportional to combo, gold→red.
    var col = mixHex('#ffd24a', '#ff4a4a', t);
    ctx.strokeStyle = col;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
    ctx.stroke();
    // Multiplier readout in the middle.
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.font = '800 15px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('x' + (Math.round(mult * 10) / 10).toFixed(1), cx, cy + 1);
    ctx.restore();
  }

  // Floating damage text — owned by GAME.FX. FX may draw it itself in world-space via
  // FX.draw(ctx) OR expose a screen-space overlay. We prefer an explicit overlay hook so
  // numbers stay crisp and un-shaken; if absent, FX.draw already handled it in-world.
  function drawDamageText() {
    var FX = G.FX;
    if (!FX) return;
    if (typeof FX.drawOverlay === 'function') {
      FX.drawOverlay(ctx);              // FX renders its floating-text layer, screen-space
    } else if (typeof FX.drawText === 'function') {
      FX.drawText(ctx);                 // alternate name some builds may use
    }
    // If neither exists, damage text is part of FX.draw(ctx) (already called in-world) —
    // nothing to do here. We never reach into FX's internal particle arrays.
  }

  // Touch controls — render the floating joystick and SMASH disc reported by GAME.Input.
  // Input owns the state (position/pressed/visibility); we only paint. Skipped entirely
  // when Input reports non-touch (desktop) or the controls are inactive.
  function drawTouchControls(w, h) {
    var Input = G.Input;
    if (!Input) return;
    // Only paint touch controls on touch devices.
    if (Input.isTouch === false) return;

    var j = Input.joystick;
    if (j && (j.active || j.visible)) {
      // base position + knob; tolerate a few field-name conventions defensively.
      var bx = (j.baseX != null ? j.baseX : (j.cx != null ? j.cx : j.x)) || 0;
      var by = (j.baseY != null ? j.baseY : (j.cy != null ? j.cy : j.y)) || 0;
      var rad = (j.radius != null ? j.radius : (j.r != null ? j.r : 70));
      // Input exposes a normalized offset dx/dy; derive the knob travel from it.
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
  }

  // Floating joystick: translucent base ring + brighter knob.
  function drawJoystick(bx, by, kx, ky, rad) {
    ctx.save();
    // Base ring.
    ctx.beginPath();
    ctx.arc(bx, by, rad, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,28,46,0.30)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(120,160,220,0.45)';
    ctx.stroke();
    // Knob.
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

  // SMASH disc: bottom-right, brightens when pressed.
  function drawSmash(sx, sy, sr, pressed) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = pressed ? 'rgba(255,90,70,0.85)' : 'rgba(180,55,45,0.55)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = pressed ? 'rgba(255,200,180,0.95)' : 'rgba(255,140,120,0.7)';
    ctx.stroke();
    // Label.
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 ' + Math.round(sr * 0.46) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SMASH', sx, sy + 1);
    ctx.restore();
  }

  // ------------------------------------------------------------------------
  // Small color helpers (hex→hex lerp) for the combo pip tint. No allocation in
  // steady state beyond a short string; only runs while a combo is active.
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
  // PUBLIC: setPlayer(unit) — Main calls this once at boot with the active kaiju.
  // ------------------------------------------------------------------------
  function setPlayer(unit) {
    player = unit || null;
  }

  // ------------------------------------------------------------------------
  // PUBLIC: frame(dt) — paint one frame. dt is seconds (clamped by Main).
  // ------------------------------------------------------------------------
  function frame(dt) {
    if (!ensureCtx()) return;

    var w = cssW();
    var h = cssH();

    // 1) Clear the full backing store in device px, transform-independent. We reset to
    //    identity just for the clear so Main's DPR base transform is untouched afterward.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, deviceW(), deviceH());
    ctx.restore();

    // Re-assert crisp pixels (cheap; guards against external state churn).
    ctx.imageSmoothingEnabled = false;

    // 2) Parallax skyline, untransformed. Scroll by camera.x (world units → pixels via the
    //    layer speeds). camera.x may be undefined very early; default to 0.
    var cam = G.camera;
    var camX = (cam && typeof cam.x === 'number') ? cam.x : 0;
    drawSky(camX, w, h);

    // Compute the world-tile cull AABB once per frame (used by ground + buildings).
    computeCull(w, h);

    // 3) Enter world space.
    ctx.save();
    if (cam && typeof cam.apply === 'function') cam.apply(ctx);

    // 4) Ground (island image or tiled diamond).
    drawGround();

    // 5) Visible list → depth sort → blit.
    buildVisible();
    if (visCount > 1) {
      // Sort only the live slice. We splice a temporary length so Array.sort touches just
      // the populated entries, then the array retains its capacity (no realloc next frame).
      sortLive();
    }
    for (var i = 0; i < visCount; i++) {
      var e = visible[i];
      if (e.kind === 1) drawKaiju(e.ref);
      else drawBuilding(e.ref);
    }

    // 6) World-space FX (debris, particles, signature-attack effects) inside the transform.
    var FX = G.FX;
    if (FX && typeof FX.draw === 'function') FX.draw(ctx);

    // 7) Leave world space.
    ctx.restore();

    // 8) HUD overlay (untransformed): combo pip, floating damage text, touch controls.
    drawHud(w, h);
  }

  // Insertion sort over the live slice — for ~40-60 mostly-presorted entries this beats
  // Array.prototype.sort (no comparator-call overhead, no temp array, stable, no GC).
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
