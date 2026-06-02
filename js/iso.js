/* GAME.iso + GAME.camera — 2:1 isometric projection, inverse picking, depth sort,
   and a critically-damped follow camera with additive shake + view culling.
   Blueprint §5. Deps: GAME.Config (GRID), GAME.Utils (clamp, reducedMotion). */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Cfg = G.Config;
  var U = G.Utils;
  var GRID = Cfg.GRID;

  // --- Iso constants from Config.GRID (never hardcode). ---
  // worldToScreen: x = (wx - wy) * HW ; y = (wx + wy) * HH - wz * WZ
  var HW = GRID.TILE_W / 2;   // 32  half-tile width  (x spread per +1 col/-1 row)
  var HH = GRID.TILE_H / 2;   // 16  half-tile height (y spread per +1 col/+1 row)
  var WZ = GRID.WZ_PX;        // 44  screen pixels of rise per +1 world-Z
  var COLS = GRID.cols;       // 12
  var ROWS = GRID.rows;       // 19

  // Inverse of the 2x2 iso matrix [[HW,-HW],[HH,HH]] for screen→ground (wz=0).
  //   sx = (wx-wy)*HW           → wx = sx/(2HW) + sy/(2HH)
  //   sy = (wx+wy)*HH           → wy = sy/(2HH) - sx/(2HW)
  var INV_X = 1 / (2 * HW);   // 1/64
  var INV_Y = 1 / (2 * HH);   // 1/32

  // ======================================================================
  // GAME.camera — screen-space origin offset (ox,oy) + decaying shake.
  // apply(ctx) translates so the followed world point sits at the focus
  // screen anchor (0.5 W, 0.62 H). World-space drawing happens after apply().
  // ======================================================================
  var camera = {
    x: 0, y: 0,            // current applied screen origin (smoothed + shake)
    ox: 0, oy: 0,          // smoothed origin (no shake) — the damped state
    tx: 0, ty: 0,          // target origin (where ox/oy chase toward)
    W: 1, H: 1,            // viewport CSS pixels
    dpr: 1,                // capped device pixel ratio (set by resize)
    focusX: 0.5,           // horizontal focus anchor (fraction of W)
    focusY: 0.62,          // vertical focus anchor (corridor-ahead bias)
    shakeX: 0, shakeY: 0,  // current shake offset
    shakeMag: 0,           // current shake amplitude (decays each frame)
    _init: false,          // snap to target on first follow (no easing pop-in)

    // Reusable visible-AABB result (no per-call alloc for cull()).
    _aabb: { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 }
  };

  // World-screen extent of the grid corners (constant; used to clamp origin
  // so the camera never reveals void beyond the diamond). Corners at wz=0:
  //   (0,0) (COLS-1,0) (0,ROWS-1) (COLS-1,ROWS-1).
  // x ∈ [-(ROWS-1)*HW, (COLS-1)*HW] ; y ∈ [0, (COLS-1+ROWS-1)*HH].
  var WORLD_MIN_X = -(ROWS - 1) * HW;
  var WORLD_MAX_X = (COLS - 1) * HW;
  var WORLD_MIN_Y = 0;
  var WORLD_MAX_Y = (COLS - 1 + ROWS - 1) * HH;
  // Vertical pad so tall buildings / kaiju near the far edge aren't clipped
  // by the origin clamp, and so the ground diamond fully covers the screen.
  var CLAMP_PAD_X = HW * 6;
  var CLAMP_PAD_TOP = WZ * 4;     // headroom above (tall skyscrapers rise up)
  var CLAMP_PAD_BOTTOM = HH * 6;

  // Set viewport size + device pixel ratio. Called on boot and every resize.
  camera.resize = function (W, H) {
    camera.W = Math.max(1, W | 0);
    camera.H = Math.max(1, H | 0);
    camera.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Re-clamp current origin to the new viewport so nothing jumps off-grid.
    clampOrigin();
    camera.x = camera.ox + camera.shakeX;
    camera.y = camera.oy + camera.shakeY;
  };

  // Clamp the smoothed origin so the visible window stays inside the grid
  // world-screen box (+ padding). Origin maps world point P to screen S via
  // S = P + origin, so the *screen* spans world-x in [-ox, W-ox] (before focus
  // bake-in, focus is already part of the target). We clamp the origin range.
  function clampOrigin() {
    // Allowed origin.x keeps [WORLD_MIN_X, WORLD_MAX_X] reachable on screen.
    // Right edge of world should not pull left of screen-right; left edge not
    // right of screen-left. Solve for ox bounds:
    //   screenLeftWorldX  = -ox            ≥ WORLD_MIN_X - pad
    //   screenRightWorldX = W - ox         ≤ WORLD_MAX_X + pad
    var oxMin = camera.W - (WORLD_MAX_X + CLAMP_PAD_X);
    var oxMax = -(WORLD_MIN_X - CLAMP_PAD_X);
    if (oxMin > oxMax) { var mx = (oxMin + oxMax) * 0.5; oxMin = oxMax = mx; }
    camera.ox = U.clamp(camera.ox, oxMin, oxMax);

    var oyMin = camera.H - (WORLD_MAX_Y + CLAMP_PAD_BOTTOM);
    var oyMax = -(WORLD_MIN_Y - CLAMP_PAD_TOP);
    if (oyMin > oyMax) { var my = (oyMin + oyMax) * 0.5; oyMin = oyMax = my; }
    camera.oy = U.clamp(camera.oy, oyMin, oyMax);
  }

  // Critically-damped follow toward `target` (world pos {wx,wy,z?}|{pos:{...}}).
  // k = 1 - 0.0008^dt is the frame-rate-independent smoothing factor.
  camera.follow = function (target, dt) {
    if (!target) return;
    // Accept either a bare {wx,wy,z} or an entity with a .pos.
    var p = target.pos || target;
    var wx = p.wx || 0, wy = p.wy || 0, wz = p.z || p.wz || 0;

    // Where the target projects in world-screen space, then the origin needed
    // to land it on the focus anchor.
    var px = (wx - wy) * HW;
    var py = (wx + wy) * HH - wz * WZ;
    camera.tx = camera.W * camera.focusX - px;
    camera.ty = camera.H * camera.focusY - py;

    if (!camera._init) {
      // Snap on first frame so the camera doesn't sail in from (0,0).
      camera.ox = camera.tx;
      camera.oy = camera.ty;
      camera._init = true;
    } else {
      var k = 1 - Math.pow(0.0008, Math.max(0, dt));
      if (k < 0) k = 0; else if (k > 1) k = 1;
      camera.ox += (camera.tx - camera.ox) * k;
      camera.oy += (camera.ty - camera.oy) * k;
    }
    clampOrigin();

    // --- Decay + integrate additive shake (skipped under reduced-motion). ---
    if (camera.shakeMag > 0.01 && !U.reducedMotion) {
      // Exponential decay (~ -7/s); jitter scaled by current amplitude.
      camera.shakeMag *= Math.pow(0.0009, Math.max(0, dt));
      if (camera.shakeMag < 0.01) camera.shakeMag = 0;
      camera.shakeX = (Math.random() * 2 - 1) * camera.shakeMag;
      camera.shakeY = (Math.random() * 2 - 1) * camera.shakeMag;
    } else {
      camera.shakeMag = 0; camera.shakeX = 0; camera.shakeY = 0;
    }

    camera.x = camera.ox + camera.shakeX;
    camera.y = camera.oy + camera.shakeY;
  };

  // Add an impulse to the shake amplitude (stomp, evolve, AOE). No-op under
  // reduced-motion. Additive so rapid hits stack, then decay in follow().
  camera.shake = function (mag) {
    if (U.reducedMotion || !(mag > 0)) return;
    camera.shakeMag = Math.min(camera.shakeMag + mag, 64); // clamp runaway
  };

  // Translate the context into world-screen space (call inside save/restore).
  // dpr is applied separately by the renderer's setTransform; here we add the
  // integer-rounded origin to keep cached sprites pixel-crisp.
  camera.apply = function (ctx) {
    ctx.translate(Math.round(camera.x), Math.round(camera.y));
  };

  // Visible world AABB in tile coords (inclusive), padded 2 tiles for safety
  // and for tall buildings whose tops poke into view from below. Reuses one
  // object — callers must read it before the next cull() call.
  camera.cull = function () {
    // Unproject the 4 screen corners to the ground plane (camera-relative),
    // then take the tile-coord bounding box. The screen box in world-screen
    // space is x∈[-ox, W-ox], y∈[-oy, H-oy].
    var ox = camera.x, oy = camera.y;
    var L = -ox, R = camera.W - ox, T = -oy, B = camera.H - oy;

    // Ground-plane inverse (wz=0) of the 4 corners. Min/max over them.
    var minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
    var corners = _cullCorners;
    corners[0] = L; corners[1] = T;
    corners[2] = R; corners[3] = T;
    corners[4] = L; corners[5] = B;
    corners[6] = R; corners[7] = B;
    for (var i = 0; i < 8; i += 2) {
      var sx = corners[i], sy = corners[i + 1];
      var c = sx * INV_X + sy * INV_Y;   // wx
      var r = sy * INV_Y - sx * INV_X;   // wy
      if (c < minCol) minCol = c;
      if (c > maxCol) maxCol = c;
      if (r < minRow) minRow = r;
      if (r > maxRow) maxRow = r;
    }
    // Pad 2 tiles; the bottom screen edge maps to small rows but tall buildings
    // at higher rows rise into view, so extend maxRow generously upward too.
    var a = camera._aabb;
    a.minCol = Math.max(0, Math.floor(minCol) - 2);
    a.maxCol = Math.min(COLS - 1, Math.ceil(maxCol) + 2);
    a.minRow = Math.max(0, Math.floor(minRow) - 2);
    a.maxRow = Math.min(ROWS - 1, Math.ceil(maxRow) + 2);
    return a;
  };
  var _cullCorners = [0, 0, 0, 0, 0, 0, 0, 0];

  G.camera = camera;

  // ======================================================================
  // GAME.iso — projection, inverse, picking, depth sort.
  // ======================================================================
  var iso = {};

  // Expose iso constants so render/input/assets can read them without
  // re-deriving from Config (single definition lives here).
  iso.HW = HW; iso.HH = HH; iso.WZ = WZ;
  iso.COLS = COLS; iso.ROWS = ROWS;

  // World (tile col=wx, row=wy, height=wz) → world-screen point (no camera).
  // Returns a fresh object; use worldToScreenInto in hot loops.
  iso.worldToScreen = function (wx, wy, wz) {
    return {
      x: (wx - wy) * HW,
      y: (wx + wy) * HH - (wz || 0) * WZ
    };
  };

  // No-alloc variant: writes into `out` ({x,y}) and returns it.
  iso.worldToScreenInto = function (wx, wy, wz, out) {
    out.x = (wx - wy) * HW;
    out.y = (wx + wy) * HH - (wz || 0) * WZ;
    return out;
  };

  // Screen point → world ground tile-coords (camera-relative, wz=0).
  // sx,sy are *device-independent* screen pixels (CSS px, pre-dpr); the camera
  // origin is removed so the result is true world tile space.
  iso.screenToWorld = function (sx, sy) {
    var lx = sx - camera.x;   // into world-screen space (undo camera translate)
    var ly = sy - camera.y;
    return {
      wx: lx * INV_X + ly * INV_Y,
      wy: ly * INV_Y - lx * INV_X
    };
  };

  // Raw pointer (clientX/clientY) → integer tile {col,row} or null if outside
  // the grid. Accounts for the canvas bounding rect; works in CSS pixels so no
  // dpr math is needed (clientX/Y and camera are both CSS-space).
  iso.pickTile = function (clientX, clientY) {
    var cv = camera._canvas;
    var sx = clientX, sy = clientY;
    if (cv && cv.getBoundingClientRect) {
      var rect = cv.getBoundingClientRect();
      sx = clientX - rect.left;
      sy = clientY - rect.top;
    }
    var w = iso.screenToWorld(sx, sy);
    var col = Math.floor(w.wx + 0.5);   // tiles centered on integer coords
    var row = Math.floor(w.wy + 0.5);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return { col: col, row: row };
  };

  // Painter's-order key. Larger = drawn later (in front). Footprint depth is
  // (wx+wy); wz lifts a hair so stacked things over the same tile resolve;
  // depthBias is the explicit tie-breaker (kaiju +1 over its tile, ground-FX -1).
  iso.depthKey = function (e) {
    return (e.wx + e.wy) * 1024 + (e.wz || 0) * 4 + (e.depthBias || 0);
  };

  // Let input/render hand us the canvas element so pickTile can read its rect.
  // (Camera is created before the canvas is known; this wires it in at init.)
  iso.attachCanvas = function (canvas) { camera._canvas = canvas; };

  G.iso = iso;
})(window.GAME);
