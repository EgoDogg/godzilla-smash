/* =====================================================================
   GAME.Kaiju  +  GAME.FX   ·  js/entities.js
   Loads AFTER assets.js, BEFORE world.js (World/Audio call into FX).

   - GAME.FX  : transient juice — debris/particle pool, screen shake,
                floating damage text, and the attack-signature visuals
                (atomic breath, gold bolts, powder cone, dive shockwave,
                 missiles). One flat pool, no per-frame allocations.
   - GAME.Kaiju.create({kind,formId}) -> unit : a playable monster with an
                idle/walk/attack FSM, iso locomotion + footprint collision,
                rate-gated signature attacks (all damage routed through
                GAME.World.hitBuilding), and a 2.5D 3/4 silhouette drawn
                from cached body frames with a LIVE glow/aura/breath overlay.

   Deps: GAME.Config, GAME.Utils, GAME.iso (+ GAME.camera), GAME.Assets,
         GAME.Economy, GAME.World, GAME.Audio. Every number comes from
         Config; every helper from Utils. Respects Utils.reducedMotion.
   ===================================================================== */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Cfg = G.Config;
  var U = G.Utils;
  var GRID = Cfg.GRID;
  var TILE_W = GRID.TILE_W, TILE_H = GRID.TILE_H, WZ_PX = GRID.WZ_PX;
  var HALF_W = TILE_W / 2;   // 32 — iso x half-step
  var HALF_H = TILE_H / 2;   // 16 — iso y half-step
  var REDUCED = U.reducedMotion;

  /* ---- tiny local math helpers (no allocations) ---- */
  var clamp = U.clamp, lerp = U.lerp;
  function rand(a, b) { return a + Math.random() * (b - a); }
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  /* Project a world point (col,row,height) to camera-space screen px.
     Mirrors the blueprint's iso formula but defers to GAME.iso when present
     so there is exactly one projection in the build. */
  var _proj = { x: 0, y: 0 };
  function projectInto(wx, wy, wz, out) {
    if (G.iso && G.iso.worldToScreenInto) { G.iso.worldToScreenInto(wx, wy, wz, out); return out; }
    out.x = (wx - wy) * HALF_W;
    out.y = (wx + wy) * HALF_H - (wz || 0) * WZ_PX;
    return out;
  }

  /* =====================================================================
     GAME.FX  —  particle pool + screen shake + damage text + attack visuals
     ===================================================================== */
  var FX = (function () {
    var fx = {};

    // ----- flat, pre-allocated particle pool (debris chunks, sparks) -----
    var MAX_P = REDUCED ? 90 : 320;
    var pool = new Array(MAX_P);
    for (var i = 0; i < MAX_P; i++) {
      // sx/sy = screen-space position (already projected); we age them in 2D
      pool[i] = { live: false, sx: 0, sy: 0, vx: 0, vy: 0, g: 0, size: 0, t: 0, life: 0, col: '#000', shape: 0 };
    }
    var pCursor = 0;
    function acquire() {
      // ring-buffer reuse: oldest slot recycled if we wrap (bounded cost)
      for (var n = 0; n < MAX_P; n++) {
        var idx = (pCursor + n) % MAX_P;
        if (!pool[idx].live) { pCursor = (idx + 1) % MAX_P; return pool[idx]; }
      }
      var p = pool[pCursor]; pCursor = (pCursor + 1) % MAX_P; return p;
    }

    // ----- effect lists (beams, bolts, powder puffs, shockwaves, missiles) -----
    // Each kept tiny and self-expiring; reused via simple free-list arrays.
    var beams = [];     // {x0,y0,x1,y1,t,life,coreCol,edgeCol,glow,width}
    var bolts = [];     // {pts:[{x,y}..],t,life,col,glow}
    var puffs = [];     // {sx,sy,r,t,life,col}  (powder cloud billow)
    var rings = [];     // {sx,sy,r0,r1,t,life,col}  (radial shockwave)
    var missiles = [];  // {sx,sy,tx,ty,t,life,col,trail}
    var texts = [];     // {sx,sy,vy,t,life,txt,col,big}

    // ----- screen shake (additive magnitude, decays; routed to camera) -----
    var shakeMag = 0;

    /* Public: bump the screen shake. Also forwards to GAME.camera.shake so the
       render transform jitters even though FX tracks its own decay for fallback. */
    fx.shake = function (mag) {
      if (REDUCED) return;
      if (mag > shakeMag) shakeMag = mag;
      if (G.camera && G.camera.shake) G.camera.shake(mag);
    };
    fx.shakeAmount = function () { return shakeMag; };

    /* Public: burst of debris from a destroyed/struck building `b`.
       Reads the building's iso world cell to find a screen anchor; colour from
       its baked palette if exposed, else a neutral concrete tone. */
    fx.debris = function (b) {
      if (!b) return;
      var count = REDUCED ? 6 : (18 + Math.min(b.row || b.tier || 0, 12));
      var col = (b.style && b.style.body) || b.bodyColor || '#6f6a63';
      // anchor: building base centre, projected (height 0 = ground footprint)
      projectInto((b.col || 0) + 0.5, (b.row || 0) + 0.5, 0, _proj);
      var ax = _proj.x, ay = _proj.y;
      var h = (b.height || 1) * WZ_PX;
      for (var k = 0; k < count; k++) {
        var p = acquire();
        p.live = true;
        p.sx = ax + rand(-HALF_W * 0.7, HALF_W * 0.7);
        p.sy = ay - rand(0, h);
        p.vx = rand(-150, 150);
        p.vy = rand(-300, -60);
        p.g = 900;
        p.size = rand(3, 8);
        p.life = p.t = rand(0.45, 1.05);
        p.col = (k & 3) === 0 ? U.shade(col, 1.25) : col;
        p.shape = 0;
        p.floorY = ay;   // bounce plane (footprint base)
      }
    };

    /* Public: small spark puff (used by attacks on impact). */
    fx.sparks = function (sx, sy, col, n) {
      if (REDUCED) { n = Math.min(n, 4); }
      for (var k = 0; k < n; k++) {
        var p = acquire();
        p.live = true;
        p.sx = sx; p.sy = sy;
        p.vx = rand(-180, 180); p.vy = rand(-220, 40);
        p.g = 520; p.size = rand(2, 5);
        p.life = p.t = rand(0.25, 0.6); p.col = col; p.shape = 1;
        p.floorY = sy + 9999;   // sparks don't bounce
      }
    };

    /* Public: floating "-<dmg>" text above building `b`. */
    fx.spawnDamageText = function (b, dmg) {
      if (REDUCED && texts.length > 6) return;
      var wx = (b.col || 0) + 0.5, wy = (b.row || 0) + 0.5;
      var hz = (b.height || 1);
      projectInto(wx, wy, hz, _proj);
      texts.push({
        sx: _proj.x + rand(-6, 6), sy: _proj.y - 6, vy: -46,
        t: 0.9, life: 0.9, txt: '-' + U.fmt(dmg), col: '#ffe08a', big: false
      });
    };

    /* Public: floating "+<payout>" reward text (called on destroy). */
    fx.spawnRewardText = function (b, amount) {
      var wx = (b.col || 0) + 0.5, wy = (b.row || 0) + 0.5;
      projectInto(wx, wy, (b.height || 1) + 0.3, _proj);
      texts.push({
        sx: _proj.x, sy: _proj.y - 10, vy: -38,
        t: 1.5, life: 1.5, txt: '+' + U.fmt(amount), col: '#6dffa0', big: true
      });
    };

    // ---- attack-signature visual spawners (called by Kaiju, screen-space) ----

    /* Atomic-breath polyline from muzzle (sx0,sy0) to target (sx1,sy1). */
    fx.beam = function (sx0, sy0, sx1, sy1, coreCol, edgeCol, glow, width) {
      beams.push({ x0: sx0, y0: sy0, x1: sx1, y1: sy1, t: 0.18, life: 0.18, coreCol: coreCol, edgeCol: edgeCol, glow: glow, width: width || 8 });
      fx.sparks(sx1, sy1, glow, REDUCED ? 4 : 10);
    };

    /* A single jagged bolt (Ghidorah) from (sx0,sy0) to (sx1,sy1). */
    fx.bolt = function (sx0, sy0, sx1, sy1, col, glow) {
      var segs = 7, pts = [];
      for (var i = 0; i <= segs; i++) {
        var tt = i / segs;
        var jx = (i === 0 || i === segs) ? 0 : rand(-10, 10);
        var jy = (i === 0 || i === segs) ? 0 : rand(-10, 10);
        pts.push({ x: lerp(sx0, sx1, tt) + jx, y: lerp(sy0, sy1, tt) + jy });
      }
      bolts.push({ pts: pts, t: 0.16, life: 0.16, col: col, glow: glow });
      fx.sparks(sx1, sy1, glow, REDUCED ? 3 : 8);
    };

    /* Expanding powder billow (Mothra) at a screen point. */
    fx.powder = function (sx, sy, col) {
      var n = REDUCED ? 2 : 4;
      for (var i = 0; i < n; i++) {
        puffs.push({ sx: sx + rand(-14, 14), sy: sy + rand(-10, 10), r: rand(6, 14), t: 1.0, life: 1.0, col: col });
      }
    };

    /* Radial ground shockwave ring (Rodan dive). */
    fx.shockwave = function (sx, sy, maxR, col) {
      rings.push({ sx: sx, sy: sy, r0: 8, r1: maxR, t: 0.5, life: 0.5, col: col });
    };

    /* Homing-ish missile streak (Mecha) from muzzle to target. */
    fx.missile = function (sx0, sy0, sx1, sy1, col) {
      missiles.push({ sx: sx0, sy: sy0, tx: sx1, ty: sy1, t: 0.34, life: 0.34, col: col });
    };

    // ----------------------------- update --------------------------------
    fx.update = function (dt) {
      // shake decay (exp)
      if (shakeMag > 0.05) { shakeMag *= Math.pow(0.0015, dt); if (shakeMag < 0.05) shakeMag = 0; }
      else shakeMag = 0;

      // particles
      for (var i = 0; i < MAX_P; i++) {
        var p = pool[i];
        if (!p.live) continue;
        p.t -= dt;
        if (p.t <= 0) { p.live = false; continue; }
        p.vy += p.g * dt;
        p.sx += p.vx * dt;
        p.sy += p.vy * dt;
        if (p.sy > p.floorY) { p.sy = p.floorY; p.vy *= -0.32; p.vx *= 0.6; }
      }

      // beams
      for (var b = beams.length - 1; b >= 0; b--) { beams[b].t -= dt; if (beams[b].t <= 0) beams.splice(b, 1); }
      // bolts
      for (var z = bolts.length - 1; z >= 0; z--) { bolts[z].t -= dt; if (bolts[z].t <= 0) bolts.splice(z, 1); }
      // powder puffs (drift up + grow)
      for (var u = puffs.length - 1; u >= 0; u--) {
        var pf = puffs[u]; pf.t -= dt; pf.sy -= 14 * dt; pf.r += 18 * dt;
        if (pf.t <= 0) puffs.splice(u, 1);
      }
      // rings
      for (var r = rings.length - 1; r >= 0; r--) { rings[r].t -= dt; if (rings[r].t <= 0) rings.splice(r, 1); }
      // missiles
      for (var m = missiles.length - 1; m >= 0; m--) {
        var ms = missiles[m]; ms.t -= dt;
        var prog = 1 - ms.t / ms.life;
        // leave a faint spark trail mid-flight
        if (!REDUCED && (m & 1) === 0 && Math.random() < 0.6) {
          fx.sparks(lerp(ms.sx, ms.tx, prog), lerp(ms.sy, ms.ty, prog), ms.col, 1);
        }
        if (ms.t <= 0) { fx.sparks(ms.tx, ms.ty, ms.col, REDUCED ? 3 : 7); missiles.splice(m, 1); }
      }
      // texts
      for (var t = texts.length - 1; t >= 0; t--) {
        var tx = texts[t]; tx.t -= dt; tx.sy += tx.vy * dt; tx.vy *= 0.9;
        if (tx.t <= 0) texts.splice(t, 1);
      }
    };

    // ------------------------------- draw --------------------------------
    /* Drawn INSIDE the camera transform (screen-space coords already camera-
       relative). Damage text is drawn last, additively legible. No shadowBlur. */
    fx.draw = function (ctx) {
      // --- shockwave rings (ground) ---
      for (var r = 0; r < rings.length; r++) {
        var rg = rings[r], pr = 1 - rg.t / rg.life;
        var rad = lerp(rg.r0, rg.r1, pr);
        ctx.globalAlpha = (1 - pr) * 0.85;
        ctx.strokeStyle = rg.col; ctx.lineWidth = lerp(7, 1.5, pr);
        ctx.beginPath();
        // iso-flattened ellipse so the ring reads as ground, not a flat circle
        ctx.ellipse(rg.sx, rg.sy, rad, rad * 0.5, 0, 0, 6.2832);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // --- debris / sparks ---
      for (var i = 0; i < MAX_P; i++) {
        var p = pool[i];
        if (!p.live) continue;
        ctx.globalAlpha = p.t > p.life * 0.4 ? 1 : clamp(p.t / (p.life * 0.4), 0, 1);
        ctx.fillStyle = p.col;
        var s = p.size;
        if (p.shape === 1) { // spark: small bright diamond
          ctx.beginPath();
          ctx.moveTo(p.sx, p.sy - s); ctx.lineTo(p.sx + s, p.sy);
          ctx.lineTo(p.sx, p.sy + s); ctx.lineTo(p.sx - s, p.sy); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillRect(p.sx - s * 0.5, p.sy - s * 0.5, s, s);
        }
      }
      ctx.globalAlpha = 1;

      // --- powder puffs (Mothra) ---
      for (var u = 0; u < puffs.length; u++) {
        var pf = puffs[u];
        ctx.globalAlpha = clamp(pf.t / pf.life, 0, 1) * 0.5;
        ctx.fillStyle = pf.col;
        ctx.beginPath(); ctx.arc(pf.sx, pf.sy, pf.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // --- atomic-breath beams + bolts + missiles (additive 'screen') ---
      var prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'screen';
      ctx.lineCap = 'round';

      for (var b = 0; b < beams.length; b++) {
        var bm = beams[b], a = clamp(bm.t / bm.life, 0, 1);
        ctx.globalAlpha = a;
        // jittered outer glow stroke
        ctx.lineWidth = bm.width;
        ctx.strokeStyle = bm.glow;
        strokeJagged(ctx, bm.x0, bm.y0, bm.x1, bm.y1, 9, 5);
        // core
        ctx.lineWidth = bm.width * 0.45;
        ctx.strokeStyle = bm.edgeCol;
        strokeJagged(ctx, bm.x0, bm.y0, bm.x1, bm.y1, 9, 2.5);
        ctx.lineWidth = bm.width * 0.2;
        ctx.strokeStyle = bm.coreCol;
        ctx.beginPath(); ctx.moveTo(bm.x0, bm.y0); ctx.lineTo(bm.x1, bm.y1); ctx.stroke();
        // impact bloom
        ctx.fillStyle = bm.glow; ctx.beginPath();
        ctx.arc(bm.x1, bm.y1, 12 * a + 4, 0, 6.2832); ctx.fill();
      }

      for (var z = 0; z < bolts.length; z++) {
        var bo = bolts[z], ba = clamp(bo.t / bo.life, 0, 1);
        ctx.globalAlpha = ba;
        ctx.lineWidth = 5; ctx.strokeStyle = bo.glow;
        ctx.beginPath(); ctx.moveTo(bo.pts[0].x, bo.pts[0].y);
        for (var pi = 1; pi < bo.pts.length; pi++) ctx.lineTo(bo.pts[pi].x, bo.pts[pi].y);
        ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = bo.col; ctx.stroke();
      }

      for (var m = 0; m < missiles.length; m++) {
        var ms = missiles[m], prog = 1 - ms.t / ms.life;
        var cx = lerp(ms.sx, ms.tx, prog), cy = lerp(ms.sy, ms.ty, prog);
        var px = lerp(ms.sx, ms.tx, Math.max(0, prog - 0.12)), py = lerp(ms.sy, ms.ty, Math.max(0, prog - 0.12));
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3; ctx.strokeStyle = ms.col;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, cy); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, 6.2832); ctx.fill();
      }

      ctx.globalCompositeOperation = prevOp;
      ctx.globalAlpha = 1;

      // --- floating damage / reward text (drawn last, opaque) ---
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var t = 0; t < texts.length; t++) {
        var tt = texts[t], al = clamp(tt.t / tt.life, 0, 1);
        ctx.globalAlpha = al;
        ctx.font = (tt.big ? '900 26px ' : '800 19px ') + 'ui-monospace,Menlo,monospace';
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(tt.txt, tt.sx + 1.5, tt.sy + 1.5);
        ctx.fillStyle = tt.col; ctx.fillText(tt.txt, tt.sx, tt.sy);
      }
      ctx.globalAlpha = 1;
    };

    /* Stroke a jagged line between two points with `segs` mid-jitter of ±amp.
       Used so each frame of a beam wiggles without storing per-frame geometry. */
    function strokeJagged(ctx, x0, y0, x1, y1, segs, amp) {
      ctx.beginPath(); ctx.moveTo(x0, y0);
      for (var i = 1; i < segs; i++) {
        var tt = i / segs;
        ctx.lineTo(lerp(x0, x1, tt) + rand(-amp, amp), lerp(y0, y1, tt) + rand(-amp, amp));
      }
      ctx.lineTo(x1, y1); ctx.stroke();
    }

    // expose pool size for tests/debug (read-only)
    fx._poolSize = MAX_P;
    return fx;
  })();

  G.FX = FX;

  /* =====================================================================
     KAIJU SPRITE BAKING  —  cached 3/4 iso body frames per form/facing/frame
     ---------------------------------------------------------------------
     We author 4 facings {S, SE, E, NE} and mirror-X for {SW, W, NW} and the
     back-ish N. The STATIC body (skin, plates, limbs, head) is baked to an
     offscreen canvas via GAME.Assets.get(key, builder). The animated glow
     (plate shimmer / aura / breath / cosmic) is NOT baked — it is drawn live
     over the cached body with globalCompositeOperation='screen'.

     Facing index (0..7), CCW from South (toward camera, +wy screen-down):
       0 S   1 SE  2 E   3 NE  4 N   5 NW  6 W   7 SW
     Authored bases: S=0, SE=1, E=2, NE=3.  Mirror map for 4..7 below.
     ===================================================================== */

  // sprite canvas size (logical px); generous margin for tail + plates + glow
  var SPR_W = 150, SPR_H = 168;
  // foot anchor inside the sprite (where world cell base sits): centre-low
  var ANCHOR_X = SPR_W * 0.5;
  var ANCHOR_Y = SPR_H * 0.86;

  // map facing -> {base authored facing, mirrored?}
  // S(0),SE(1),E(2),NE(3) authored direct; SW(7)<-SE mirror, W(6)<-E mirror,
  // NW(5)<-NE mirror, N(4) authored from NE silhouette mirrored-ish (use NE flat)
  var FACING_MAP = [
    { base: 0, mir: false }, // 0 S
    { base: 1, mir: false }, // 1 SE
    { base: 2, mir: false }, // 2 E
    { base: 3, mir: false }, // 3 NE
    { base: 4, mir: false }, // 4 N  (authored)
    { base: 3, mir: true },  // 5 NW  = NE mirrored
    { base: 2, mir: true },  // 6 W   = E  mirrored
    { base: 1, mir: true }   // 7 SW  = SE mirrored
  ];

  // Shared cache bridge. The blueprint contract names GAME.Assets.get(key) and
  // describes assets.js as the LRU owner of "kaiju/titan sprite-sheets" baked
  // *lazily*. Lazy + foreign art means the cache must call back into OUR
  // builder. We therefore offer the builder via the common conventions and
  // accept whichever the integrator implemented:
  //   • get(key, w, h, builder)   — builder(ctx,w,h) draws into a cache canvas
  //   • get(key, builder)         — same builder, dims implied by us
  //   • get(key)                  — returns a prebaked canvas (or undefined)
  // We pass a self-contained builder that ALSO returns a finished canvas, so a
  // factory-style cache (builder()->canvas) works too. Any miss/throw falls
  // back to our own local LRU so rendering never breaks pre-integration.
  var _localCache = {};
  var _localOrder = [];
  var LOCAL_LRU_MAX = 96;
  // Which Assets.get signature works, discovered once then cached so the hot
  // draw loop never repeats a throw/catch probe. 0=unknown, 1=(key,w,h,fn),
  // 2=(key,fn), 3=(key) prebake, -1=use local cache (no usable shared cache).
  var _assetsMode = 0;
  function bakeOrGet(key, w, h, builder) {
    if (_assetsMode === -1 || !G.Assets || typeof G.Assets.get !== 'function') {
      return localBake(key, w, h, builder);
    }
    // builder usable as builder(ctx,w,h) OR builder()->canvas
    var selfBuilder = function (ctx2, bw, bh) {
      if (ctx2 && typeof ctx2.drawImage === 'function') { builder(ctx2, bw || w, bh || h); return; }
      var cc = makeCanvas(w, h); builder(cc.getContext('2d'), w, h); return cc;
    };
    // Fast path once the signature is known.
    if (_assetsMode === 1) { var r1 = tryGet(function () { return G.Assets.get(key, w, h, selfBuilder); }); if (r1) return r1; }
    else if (_assetsMode === 2) { var r2 = tryGet(function () { return G.Assets.get(key, selfBuilder); }); if (r2) return r2; }
    else if (_assetsMode === 3) { var r3 = tryGet(function () { return G.Assets.get(key); }); if (r3) return r3; }
    else {
      // Probe each convention once; lock onto the first that yields a canvas.
      var a = tryGet(function () { return G.Assets.get(key, w, h, selfBuilder); });
      if (a) { _assetsMode = 1; return a; }
      var b = tryGet(function () { return G.Assets.get(key, selfBuilder); });
      if (b) { _assetsMode = 2; return b; }
      var c = tryGet(function () { return G.Assets.get(key); });
      if (c) { _assetsMode = 3; return c; }
      _assetsMode = -1;   // no usable shared cache — commit to local bakes
    }
    return localBake(key, w, h, builder);
  }
  // Run a getter; return its canvas if it produced one, else null (never throws).
  function tryGet(fn) { try { var g = fn(); return (g && g.width) ? g : null; } catch (e) { return null; } }
  // Our own small LRU so frames are reused even without assets.js.
  function localBake(key, w, h, builder) {
    var hit = _localCache[key];
    if (hit) { touchLocal(key); return hit; }
    var cv = makeCanvas(w, h);
    var c = cv.getContext && cv.getContext('2d');
    if (c) builder(c, w, h);
    _localCache[key] = cv; _localOrder.push(key);
    if (_localOrder.length > LOCAL_LRU_MAX) { var ev = _localOrder.shift(); if (ev !== key) delete _localCache[ev]; }
    return cv;
  }
  function touchLocal(key) {
    var i = _localOrder.indexOf(key);
    if (i >= 0) { _localOrder.splice(i, 1); _localOrder.push(key); }
  }
  function makeCanvas(w, h) {
    var cv;
    if (typeof OffscreenCanvas !== 'undefined') {
      try { cv = new OffscreenCanvas(w, h); } catch (e) { cv = null; }
    }
    if (!cv) { cv = (typeof document !== 'undefined') ? document.createElement('canvas') : { width: w, height: h, getContext: function () { return null; } }; cv.width = w; cv.height = h; }
    var c = cv.getContext && cv.getContext('2d');
    if (c) c.imageSmoothingEnabled = false;
    return cv;
  }

  /* Resolve the palette for a unit: Godzilla -> EVOLUTIONS[formId]; Titan ->
     a synthesized palette from its Config.tint/accent so the same baker works. */
  function paletteFor(kind, formId) {
    if (kind === 'gz') {
      var forms = Cfg.EVOLUTIONS;
      var f = forms.find(function (e) { return e.id === formId; }) || forms[0];
      return {
        skin: f.skin, skinDark: f.skinDark, skinLight: f.skinLight,
        plate: f.plate, plateEdge: f.plateEdge, plateGlow: f.plateGlow,
        breath: f.breath, breathGlow: f.breathGlow, eye: f.eye,
        aura: f.aura, fx: f.fx, isTitan: false, id: f.id
      };
    }
    // Titan: derive shaded greys/colours from tint + accent
    var def = Cfg.TITANS.find(function (t) { return t.id === kind; }) || Cfg.TITANS[0];
    var tint = def.tint, accent = def.accent;
    return {
      skin: U.shade(tint, 0.62), skinDark: U.shade(tint, 0.34), skinLight: U.shade(tint, 0.92),
      plate: U.shade(tint, 0.5), plateEdge: tint, plateGlow: rgbaFrom(tint, 0.75),
      breath: [accent, '#ffffff'], breathGlow: rgbaFrom(accent, 0.9), eye: accent,
      aura: rgbaFrom(accent, 0.14), fx: kind, isTitan: true, id: kind, def: def
    };
  }
  function rgbaFrom(hex, a) {
    var c = ('' + hex).replace('#', '');
    if (c.length === 3) c = c.replace(/(.)/g, '$1$1');
    var n = parseInt(c, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ------- author one STATIC body frame onto an offscreen ctx -------
     pal: palette; base: authored facing 0..4; frame: 0..5 (pose);
     fsm: 'idle'|'walk'|'attack'. Drawn back-to-front in a chunky 3/4 stack.
     Drawn at logical sprite size; world scale applied at blit time. No glow. */
  function buildBody(ctx, w, h, pal, base, frame, fsm) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ANCHOR_X, ANCHOR_Y);

    // overall body height in px (sprite-local)
    var BH = h * 0.74;
    var BW = BH * 0.5;

    // pose params from frame/fsm -----------------------------------------
    var walkT = (frame % 6) / 6;                 // 0..1 walk cycle phase
    var step = Math.sin(walkT * Math.PI * 2);    // -1..1
    var bob = (fsm === 'walk') ? Math.abs(Math.sin(walkT * Math.PI * 2)) * BH * 0.018 : 0;
    var atk = (fsm === 'attack') ? Math.sin(Math.min(1, frame / 5) * Math.PI) : 0; // 0..1 lunge/mouth
    var legSwing = (fsm === 'walk') ? step : 0;

    // facing geometry: how much the body turns away from camera ----------
    //  faceDir: +1 = head leans screen-right (E/SE), 0 = head toward camera (S),
    //           N -> body shows its back (head small, plates dominant).
    var fg = facingGeom(base);

    ctx.translate(0, -bob);

    // ---- ground shadow (flattened ellipse, screen-projected oval) ----
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 2, BW * 0.95, BH * 0.05, 0, 0, 6.2832);
    ctx.fill();

    var skin = pal.skin, dark = pal.skinDark, light = pal.skinLight;

    // ============================ BACK-TO-FRONT ========================
    // 1) tail (curls behind, opposite the facing lean)
    drawTail(ctx, BH, BW, fg, dark);

    // 2) far leg (back leg, darker) — swings opposite near leg
    ctx.fillStyle = dark;
    drawLeg(ctx, fg.farLegX * BW, BH, BW, -legSwing, fg);

    // 3) far arm (small, behind torso)
    ctx.fillStyle = dark;
    drawArm(ctx, fg.farArmX * BW, -BH * 0.5, BH, BW, fg, -1, atk);

    // 4) torso (vertical gradient silhouette)
    drawTorso(ctx, BH, BW, fg, skin, dark, light);

    // 5) belly highlight
    ctx.save(); ctx.globalAlpha = 0.38; ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(fg.bellyX * BW, -BH * 0.34, BW * 0.20, BH * 0.16, 0.15 * fg.dir, 0, 6.2832);
    ctx.fill(); ctx.restore();

    // 6) dorsal ridge (plates) — STATIC base shapes only; glow drawn live
    drawPlates(ctx, BH, BW, fg, pal, false);

    // 7) near leg (front, lit) — swings with legSwing
    ctx.fillStyle = skin;
    drawLeg(ctx, fg.nearLegX * BW, BH, BW, legSwing, fg);

    // 8) near arm (front, lit) — reaches forward on attack
    ctx.fillStyle = skin;
    drawArm(ctx, fg.nearArmX * BW, -BH * 0.5, BH, BW, fg, 1, atk);

    // 9) head + neck (snout points along facing; jaw opens on attack)
    drawHead(ctx, BH, BW, fg, pal, atk);

    ctx.restore();
  }

  /* Facing-dependent geometry. `base`: 0 S,1 SE,2 E,3 NE,4 N.
     Returns multipliers that bias limb x-offsets and head direction so the
     same primitive shapes read as a turned 3/4 figure. dir ∈ [-1..1] head lean. */
  function facingGeom(base) {
    switch (base) {
      case 0: // S — facing camera, head low-centre, symmetric
        return { dir: 0.0, headX: 0.0, headFwd: 0.0, snout: 0.10, plateLean: 0.0,
                 farLegX: -0.22, nearLegX: 0.22, farArmX: -0.30, nearArmX: 0.30,
                 bellyX: 0.0, tailDir: -1, show: 'front', headScale: 1.06 };
      case 1: // SE — three-quarter front, head leans screen-right
        return { dir: 0.6, headX: 0.16, headFwd: 0.22, snout: 0.30, plateLean: 0.18,
                 farLegX: -0.26, nearLegX: 0.18, farArmX: -0.22, nearArmX: 0.34,
                 bellyX: 0.10, tailDir: -1, show: 'front', headScale: 1.0 };
      case 2: // E — profile, head fully to screen-right (v1-style snout)
        return { dir: 1.0, headX: 0.30, headFwd: 0.40, snout: 0.46, plateLean: 0.30,
                 farLegX: -0.18, nearLegX: 0.20, farArmX: -0.10, nearArmX: 0.34,
                 bellyX: 0.16, tailDir: -1, show: 'side', headScale: 0.96 };
      case 3: // NE — three-quarter back, head leans away (smaller, turned up)
        return { dir: 0.7, headX: 0.18, headFwd: 0.20, snout: 0.24, plateLean: 0.42,
                 farLegX: -0.20, nearLegX: 0.22, farArmX: -0.30, nearArmX: 0.26,
                 bellyX: 0.06, tailDir: 1, show: 'back34', headScale: 0.9 };
      default: // 4 N — back to camera: plates dominate, head a small nub
        return { dir: 0.0, headX: 0.0, headFwd: 0.0, snout: 0.0, plateLean: 0.55,
                 farLegX: -0.22, nearLegX: 0.22, farArmX: -0.30, nearArmX: 0.30,
                 bellyX: 0.0, tailDir: 1, show: 'back', headScale: 0.72 };
    }
  }

  function drawTail(ctx, BH, BW, fg, dark) {
    var d = fg.tailDir;     // which side the tail trails
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(d * BW * 0.10, -BH * 0.30);
    ctx.quadraticCurveTo(d * BW * 0.85, -BH * 0.40, d * BW * 1.25, -BH * 0.06);
    ctx.quadraticCurveTo(d * BW * 1.12, BH * 0.02, d * BW * 0.95, -BH * 0.05);
    ctx.quadraticCurveTo(d * BW * 0.55, -BH * 0.20, d * BW * 0.08, -BH * 0.16);
    ctx.closePath(); ctx.fill();
  }

  function drawLeg(ctx, x, BH, BW, swing, fg) {
    var w = BH * 0.075;
    var lift = -swing * BH * 0.05;          // raise foot when swinging forward
    var footFwd = swing * BW * 0.10;        // stride reach
    ctx.beginPath();
    ctx.moveTo(x - w, -BH * 0.34);
    ctx.quadraticCurveTo(x - w * 1.1, -BH * 0.15 + lift, x - w * 0.8 + footFwd, -BH * 0.02 + lift);
    ctx.lineTo(x - w * 0.85 + footFwd, lift);
    ctx.lineTo(x + w * 1.5 + footFwd, lift);                  // toes
    ctx.quadraticCurveTo(x + w * 1.1 + footFwd, -BH * 0.05 + lift, x + w, -BH * 0.14 + lift);
    ctx.quadraticCurveTo(x + w * 1.1, -BH * 0.27, x + w * 0.85, -BH * 0.34);
    ctx.closePath(); ctx.fill();
  }

  function drawArm(ctx, x, y, BH, BW, fg, side, atk) {
    var w = BH * 0.040;
    // near arm (side=+1) reaches forward toward the snout on attack
    var reach = (side > 0) ? atk * BW * 0.28 : atk * BW * 0.06;
    var drop = (side > 0) ? (BH * 0.14 - atk * BH * 0.05) : BH * 0.13;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x + w * 2.4 + reach, y + BH * 0.02, x + w * 2.1 + reach, y + drop);
    ctx.lineTo(x + w * 0.9 + reach * 0.7, y + drop + BH * 0.004);
    ctx.quadraticCurveTo(x - w * 0.2, y + BH * 0.05, x - w, y);
    ctx.closePath(); ctx.fill();
  }

  function drawTorso(ctx, BH, BW, fg, skin, dark, light) {
    var lean = fg.dir;     // -1..1 (we use >=0 here; mirroring handles the rest)
    var bg = ctx.createLinearGradient(0, -BH * 0.9, 0, -BH * 0.1);
    bg.addColorStop(0, light); bg.addColorStop(0.5, skin); bg.addColorStop(1, dark);
    ctx.fillStyle = bg;
    ctx.beginPath();
    // hunched back (upper-left), shoulders, chest/belly bulge toward facing
    ctx.moveTo(-BW * 0.36, -BH * 0.30);
    ctx.quadraticCurveTo(-BW * 0.50, -BH * 0.68, -BW * 0.14, -BH * 0.80);     // back hump
    ctx.quadraticCurveTo(BW * 0.04, -BH * 0.88, BW * (0.22 + lean * 0.06), -BH * 0.82); // shoulders
    ctx.quadraticCurveTo(BW * (0.40 + lean * 0.10), -BH * 0.78, BW * (0.46 + lean * 0.08), -BH * 0.62); // neck base
    ctx.quadraticCurveTo(BW * (0.56 + lean * 0.06), -BH * 0.46, BW * (0.46 + lean * 0.04), -BH * 0.30); // chest
    ctx.quadraticCurveTo(BW * 0.40, -BH * 0.13, BW * 0.08, -BH * 0.13);       // lower belly
    ctx.quadraticCurveTo(-BW * 0.18, -BH * 0.13, -BW * 0.36, -BH * 0.30);
    ctx.closePath(); ctx.fill();

    // rim light on the moonlit back edge
    ctx.save();
    ctx.strokeStyle = 'rgba(255,250,235,0.22)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-BW * 0.14, -BH * 0.80);
    ctx.quadraticCurveTo(BW * 0.04, -BH * 0.88, BW * (0.22 + lean * 0.06), -BH * 0.82);
    ctx.quadraticCurveTo(BW * (0.40 + lean * 0.10), -BH * 0.78, BW * (0.46 + lean * 0.08), -BH * 0.62);
    ctx.stroke(); ctx.restore();
  }

  /* Dorsal plates. When glowPass=false (baking) we draw the solid plate
     bodies + edge strokes only. When glowPass=true (live) we draw ONLY the
     additive shimmer (caller has set composite='screen'). */
  function drawPlates(ctx, BH, BW, fg, pal, glowPass, shimmer) {
    var N = 9;
    var lean = fg.plateLean;
    for (var i = 0; i <= N; i++) {
      var t = i / N;
      // plates march from upper-back (t=0) down toward tail (t=1)
      var x = lerp(BW * (0.24 - lean * 0.10), -BW * (0.52 + lean * 0.05), t);
      var y = -(lerp(0.80, 0.36, t) + Math.sin(t * Math.PI) * 0.06) * BH;
      var size = (Math.sin(t * Math.PI) * 0.13 + 0.05) * BH;
      if (glowPass) {
        var a = 0.30 + 0.5 * (shimmer != null ? shimmer : 0.5) * Math.sin(t * Math.PI);
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.fillStyle = pal.plateGlow;
        ctx.beginPath();
        ctx.moveTo(x + BW * 0.07, y + size * 0.30);
        ctx.lineTo(x - BW * 0.01, y - size * 1.08);
        ctx.lineTo(x - BW * 0.11, y + size * 0.30);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = pal.skinLight;
        ctx.beginPath();
        ctx.moveTo(x + BW * 0.06, y + size * 0.30);
        ctx.lineTo(x - BW * 0.01, y - size);
        ctx.lineTo(x - BW * 0.10, y + size * 0.30);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 2.2; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawHead(ctx, BH, BW, fg, pal, atk) {
    if (fg.show === 'back') {
      // back of skull: small dark nub above the plates
      ctx.fillStyle = pal.skinDark;
      ctx.beginPath();
      ctx.ellipse(0, -BH * 0.86, BW * 0.16 * fgScale(fg), BH * 0.07, 0, 0, 6.2832);
      ctx.fill();
      return;
    }
    var hx = fg.headX * BW;        // head centre x-shift toward facing
    var hs = fg.headScale;          // head scale by facing
    var mo = atk * BH * 0.05;       // jaw open
    var skin = pal.skin, dark = pal.skinDark;

    // neck
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(hx + BW * (0.10), -BH * 0.78);
    ctx.quadraticCurveTo(hx + BW * 0.30, -BH * 0.86, hx + BW * 0.42, -BH * 0.84);
    ctx.lineTo(hx + BW * 0.44, -BH * 0.68);
    ctx.quadraticCurveTo(hx + BW * 0.30, -BH * 0.66, hx + BW * 0.18, -BH * 0.66);
    ctx.closePath(); ctx.fill();

    // skull + snout (extends toward facing by fg.snout)
    var sn = fg.snout;
    ctx.beginPath();
    ctx.moveTo(hx + BW * 0.30, -BH * 0.84);
    ctx.quadraticCurveTo(hx + BW * (0.46), -BH * 0.92 * hs, hx + BW * (0.40 + sn), -BH * 0.85);
    ctx.quadraticCurveTo(hx + BW * (0.52 + sn), -BH * 0.82, hx + BW * (0.52 + sn), -BH * 0.795);
    ctx.lineTo(hx + BW * (0.46 + sn), -BH * 0.785);
    ctx.quadraticCurveTo(hx + BW * 0.40, -BH * 0.78, hx + BW * 0.32, -BH * 0.79);
    ctx.quadraticCurveTo(hx + BW * 0.26, -BH * 0.80, hx + BW * 0.24, -BH * 0.81);
    ctx.closePath(); ctx.fill();

    // lower jaw (opens with atk)
    ctx.beginPath();
    ctx.moveTo(hx + BW * 0.30, -BH * 0.775);
    ctx.quadraticCurveTo(hx + BW * (0.46 + sn), -BH * 0.745 + mo, hx + BW * (0.50 + sn), -BH * 0.765 + mo * 0.6);
    ctx.quadraticCurveTo(hx + BW * (0.42 + sn), -BH * 0.725 + mo, hx + BW * 0.30, -BH * 0.745 + mo * 0.4);
    ctx.closePath(); ctx.fill();

    // teeth when mouth open
    if (atk > 0.25 && fg.show !== 'back34') {
      ctx.fillStyle = '#f3ead7';
      for (var ti = 0; ti < 3; ti++) {
        var tx = hx + BW * (0.40 + sn * 0.5 + ti * 0.05);
        ctx.beginPath();
        ctx.moveTo(tx, -BH * 0.785); ctx.lineTo(tx + BW * 0.018, -BH * 0.785);
        ctx.lineTo(tx + BW * 0.009, -BH * 0.762); ctx.closePath(); ctx.fill();
      }
    }

    // brow
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(hx + BW * 0.40, -BH * 0.86);
    ctx.quadraticCurveTo(hx + BW * (0.50), -BH * 0.885, hx + BW * (0.55), -BH * 0.84);
    ctx.lineTo(hx + BW * 0.51, -BH * 0.825);
    ctx.quadraticCurveTo(hx + BW * 0.44, -BH * 0.84, hx + BW * 0.40, -BH * 0.84);
    ctx.closePath(); ctx.fill();

    // eye (solid colour baked; bright glow added live in overlay)
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
  function fgScale(fg) { return 1; }

  /* =====================================================================
     KAIJU UNIT FACTORY
     ===================================================================== */

  // locomotion constants (blueprint §6). The blueprint specifies the *feel*
  // in px/s (accel 900, maxSpeed 220, exp friction 12, collision r≈18px).
  // Per the contract, Input already rotates the control vector INTO iso world
  // space (W=+wy forward, D=+wx; touch un-projects up-screen→+wy). So intent
  // .moveX/.moveY arrive as WORLD axes and we integrate velocity directly in
  // world-units/s — converting the px feel constants by px-per-tile so motion
  // reads identically regardless of zoom. (1 tile ≈ TILE_W px horizontally.)
  var PX_PER_TILE = TILE_W;                    // 64 px per world tile
  var ACCEL = 900 / PX_PER_TILE;               // tiles/s^2
  var MAX_SPEED = 220 / PX_PER_TILE;           // tiles/s  (~3.4 tiles/s)
  var FRICTION = 12;                           // exp friction coefficient (unit-agnostic)
  var COLLIDE_R = 18 / PX_PER_TILE;            // kaiju collision radius in tiles (~0.28)
  var WALK_SPEED = 0.22;                        // tiles/s above which idle→walk + facing updates

  /* attack cadence (s) — rate-gates the edge-triggered attack intent.
     Slightly slower for AOE/heavy titans so multi-hits feel weighty. */
  function attackCooldownFor(kind) {
    switch (kind) {
      case 'rodan': return 0.62;
      case 'mecha': return 0.50;
      case 'mothra': return 0.46;
      case 'ghidorah': return 0.42;
      default: return 0.30;        // Godzilla breath
    }
  }

  function Kaiju(opts) {
    opts = opts || {};
    this.kind = opts.kind || 'gz';                 // 'gz' | titanId
    this.formId = opts.formId || (Cfg.EVOLUTIONS[0].id);
    this.pos = { wx: opts.wx != null ? opts.wx : GRID.cols * 0.5, wy: opts.wy != null ? opts.wy : -0.6, z: 0 };
    this.vel = { x: 0, y: 0 };                      // px/s in screen-vector space
    this.facing = 0;                                // 0..7 (S default)
    this.fsm = 'idle';                              // 'idle'|'walk'|'attack'|'hurt'
    this.walkPhase = 0;                             // 0..1
    this.attackFrame = 0;                           // 0..5 during attack
    this.attackT = 0;                               // seconds left in attack pose
    this.atkCooldown = 0;                           // seconds until next attack
    this.depthBias = 1;                             // kaiju draw above same-cell ground/FX
    this.hurtT = 0;
    this.pal = paletteFor(this.kind, this.formId);
    this._glowPhase = 0;                            // animates plate shimmer/aura
    this._flash = 0;                                // evolve white-flash (0..1)
    this._prevAttack = false;                       // edge detector for intent.attack
    // cache id token so render/Assets keys stay stable across form swaps
    this._formToken = (this.kind === 'gz') ? this.formId : this.kind;
  }

  /* ----- form / character swap (cache-invalidating) ----- */
  Kaiju.prototype.setForm = function (id) {
    if (this.kind === 'gz') {
      this.formId = id;
      this._formToken = id;
    } else {
      // switching characters entirely (Titan) — caller passes a titanId/kind
      this.kind = id;
      this._formToken = id;
    }
    this.pal = paletteFor(this.kind, this._formToken);
    this._flash = 1;                                // white transition flash
    FX.shake(8);
    // local cache for prior token stays warm; new token bakes lazily on draw.
  };

  /* ----- aim helper: 8-way facing from a world delta (wx,wy) ----- */
  Kaiju.prototype.facingTo = function (wx, wy) {
    // convert world delta to a screen-space heading, then bucket to 8 dirs.
    // screen dx = (dwx - dwy)*HALF_W ; screen dy = (dwx + dwy)*HALF_H
    var dwx = wx - this.pos.wx, dwy = wy - this.pos.wy;
    if (Math.abs(dwx) < 1e-4 && Math.abs(dwy) < 1e-4) return this.facing;
    var sx = (dwx - dwy) * HALF_W;
    var sy = (dwx + dwy) * HALF_H;
    this.facing = headingToFacing(sx, sy);
    return this.facing;
  };

  /* Bucket a screen-space vector into facing 0..7.
     Screen: +x right, +y down. Facing 0=S means moving screen-DOWN (toward
     camera). CCW: 0 S, 1 SE, 2 E, 3 NE, 4 N, 5 NW, 6 W, 7 SW. */
  function headingToFacing(sx, sy) {
    // angle measured from "south" (screen +y), going toward "east" (+x).
    // south vector = (0,+1). east = (+1,0). We want index increasing S->SE->E...
    var ang = Math.atan2(sx, sy);          // 0 at +y(S), +pi/2 at +x(E), ...
    if (ang < 0) ang += Math.PI * 2;       // 0..2pi
    var idx = Math.round(ang / (Math.PI / 4)) % 8;  // 0 S,1 SE,2 E,...
    return idx;
  }

  /* ----- screen anchor (where the foot centroid projects) ----- */
  Kaiju.prototype.screenAnchor = function (out) {
    out = out || { x: 0, y: 0 };
    projectInto(this.pos.wx, this.pos.wy, this.pos.z, out);
    return out;
  };

  /* ----- iso AABB-ish bounds in world units (for cull/targeting) ----- */
  Kaiju.prototype.bounds = function () {
    var w = 1.4, hgt = 3.2;   // ~1.4 tiles footprint, ~3.2 z tall
    return {
      wx: this.pos.wx, wy: this.pos.wy, z: this.pos.z,
      minWx: this.pos.wx - w * 0.5, maxWx: this.pos.wx + w * 0.5,
      minWy: this.pos.wy - w * 0.5, maxWy: this.pos.wy + w * 0.5,
      height: hgt
    };
  };

  /* ----- collision vs standing building footprints (WORLD/tile units) -----
     Per the blueprint this is per-axis "wall-slide" with the kaiju as a circle
     of radius ≈18px. We model each building as its tile cell box inflated by the
     kaiju radius (a Minkowski sum), so the swept obstacle is an axis-aligned box
     in tile space. Per-axis resolution against AABBs gives a perfectly SMOOTH
     slide along a row of buildings (no bumps), which is the canonical and most
     robust tile-collision approach — far cleaner than sliding around discrete
     circles. Crumbling/rubble/respawning footprints are non-solid (walk over
     wreckage). dt is clamped upstream so steps are «1 tile (no tunnelling). */

  // Is the kaiju centre at (wx,wy) inside any solid building's inflated box?
  function blockedAt(wx, wy) {
    if (!G.World || !G.World.footprintsNear) return false;
    var list = G.World.footprintsNear(wx, wy, 1.4);
    if (!list || !list.length) return false;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b) continue;
      if (b.state && b.state !== 'standing') continue;  // only standing is solid
      var fw = (b.footprint && b.footprint.w) ? b.footprint.w : 0.8;
      var fh = (b.footprint && b.footprint.h) ? b.footprint.h : 0.8;
      var halfX = fw * 0.5 + COLLIDE_R;                 // inflate box by kaiju radius
      var halfY = fh * 0.5 + COLLIDE_R;
      var cx = b.col + 0.5, cy = b.row + 0.5;
      if (Math.abs(wx - cx) < halfX && Math.abs(wy - cy) < halfY) return true;
    }
    return false;
  }

  /* =====================================================================
     UPDATE — consume the single intent struct, run FSM + locomotion + attack
     ===================================================================== */
  Kaiju.prototype.update = function (dt, intent) {
    if (dt > 0.05) dt = 0.05;   // clamp to keep collision stable on hitches
    intent = intent || EMPTY_INTENT;

    // ---- decay timers ----
    if (this._flash > 0) this._flash = Math.max(0, this._flash - dt * 1.8);
    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.atkCooldown > 0) this.atkCooldown -= dt;
    this._glowPhase += dt;

    // ---- locomotion: accelerate toward the intent move vector ----
    // intent.moveX/.moveY are WORLD axes (Input rotated them into iso already):
    // +moveY = forward/up-screen (deeper rows), +moveX = screen-right.
    var mx = intent.moveX || 0, my = intent.moveY || 0;
    var moveMag = Math.hypot(mx, my);
    if (moveMag > 1) { mx /= moveMag; my /= moveMag; moveMag = 1; }

    if (moveMag > 0.001) {
      this.vel.x += mx * ACCEL * dt;
      this.vel.y += my * ACCEL * dt;
    }
    // exponential friction (frame-rate independent)
    var fr = Math.exp(-FRICTION * dt);
    this.vel.x *= fr; this.vel.y *= fr;
    // clamp to max speed (world-units/s)
    var sp = Math.hypot(this.vel.x, this.vel.y);
    if (sp > MAX_SPEED) { var ks = MAX_SPEED / sp; this.vel.x *= ks; this.vel.y *= ks; sp = MAX_SPEED; }

    // ---- proposed world delta (velocity already in world-units/s) ----
    var dwx = this.vel.x * dt, dwy = this.vel.y * dt;
    var hadInput = moveMag > 0.001;

    // ---- per-axis collision + grid clamp (wall-slide) ----
    // Capture the frontier ONCE at frame start. The movement ceiling is
    // (frontier + 1.5) rows: the player may nudge 1.5 rows past the cleared
    // frontier, but the frontier itself is advanced by World on destruction
    // (balance §4 — attack power, not walking, is the gate). We must NOT let
    // the kaiju bootstrap the ceiling by walking, or the clamp does nothing.
    var cols = GRID.cols;
    var frontier = (G.World && G.World.maxReachedRow != null) ? G.World.maxReachedRow : GRID.rows - 1;
    var loX = 0.5, hiX = cols - 0.5;
    var loY = -1.0, hiY = GRID.rows - 0.5;   // free roam the whole city (HP gates destruction, not movement)

    // Per-axis AABB resolution = smooth wall-slide (blueprint §6). Resolve X
    // then Y independently: a blocked axis simply doesn't move while the other
    // still does, so the kaiju glides along walls. Buildings are inflated boxes
    // (see blockedAt), giving bump-free sliding.
    var preX = this.pos.wx, preY = this.pos.wy;
    // Depenetration safety: if the centre is already inside a footprint (e.g. a
    // building respawned on top of us), let movement proceed freely so we can walk
    // out instead of being cemented in place.
    var wedged = blockedAt(preX, preY);

    var nx = clamp(preX + dwx, loX, hiX);
    if (wedged || !blockedAt(nx, this.pos.wy)) { this.pos.wx = nx; }
    else { this.vel.x *= 0.2; }            // stopped in X — keep Y to slide along the wall

    var ny = clamp(preY + dwy, loY, hiY);
    if (wedged || !blockedAt(this.pos.wx, ny)) { this.pos.wy = ny; }
    else { this.vel.y *= 0.2; }

    // ---- report deepest row reached so depth HUD/save stay current ----
    // Only report rows AT OR BELOW the captured frontier — never beyond it.
    // This keeps the depth readout honest without raising the gate ceiling
    // (which would create an infinite walk-forward exploit). World decides
    // when the true frontier advances (on destroying the front row).
    if (G.World) {
      var reachedRow = Math.min(Math.floor(this.pos.wy), frontier);
      if (G.World.maxReachedRow == null || reachedRow > G.World.maxReachedRow) {
        if (typeof G.World.advanceFrontier === 'function') G.World.advanceFrontier(reachedRow);
        else G.World.maxReachedRow = Math.max(G.World.maxReachedRow || 0, reachedRow);
      }
    }

    // ---- facing from motion (only when actually moving) ----
    // Project the WORLD-space velocity to a screen-space heading, then bucket.
    if (sp > WALK_SPEED) {
      // Use Input's facing (computed consistently with the stick's screen→world
      // relabel) so the sprite + breath aim match the controls. Fall back to the
      // projected world-velocity heading for non-input motion (knockback, etc.).
      if (G.Input && typeof G.Input.facing === 'number') {
        this.facing = G.Input.facing;
      } else {
        var hsx = (this.vel.x - this.vel.y) * HALF_W;
        var hsy = (this.vel.x + this.vel.y) * HALF_H;
        this.facing = headingToFacing(hsx, hsy);
      }
    }

    // ---- FSM: attack takes priority, else walk/idle from speed ----
    var moving = sp > WALK_SPEED;
    if (this.attackT > 0) {
      this.attackT -= dt;
      this.fsm = 'attack';
      // attackFrame 0..5 across the attack window
      var dur = this._attackDur || 0.34;
      this.attackFrame = clamp(Math.floor((1 - this.attackT / dur) * 6), 0, 5);
      if (this.attackT <= 0) { this.fsm = (moving ? 'walk' : 'idle'); this.attackFrame = 0; }
    } else if (this.hurtT > 0) {
      this.fsm = 'hurt';
    } else {
      this.fsm = moving ? 'walk' : 'idle';
    }

    // ---- walk cycle phase ----
    if (this.fsm === 'walk') {
      this.walkPhase += dt * (1.4 + sp / MAX_SPEED * 1.6);
      if (this.walkPhase >= 1) this.walkPhase -= 1;
    } else if (this.fsm === 'idle') {
      // gentle idle breath drives frame 0; keep phase parked
      this.walkPhase = 0;
    }

    // ---- attack: edge-triggered, rate-gated ----
    var attackEdge = !!intent.attack && !this._prevAttack;
    this._prevAttack = !!intent.attack;
    if (attackEdge && this.atkCooldown <= 0 && this.attackT <= 0) {
      this.fireAttack(intent.target);
    }
  };

  var EMPTY_INTENT = { moveX: 0, moveY: 0, attack: false, target: null };

  /* ----- choose targets, then dispatch to the signature ----- */
  Kaiju.prototype.fireAttack = function (targetCell) {
    // gather candidate standing buildings ahead/around the kaiju
    var targets = this.acquireTargets(targetCell);
    this.startAttack(targets);
  };

  /* Targeting priority (blueprint §6):
       1) explicit clicked target cell if standing
       2) building the kaiju faces (~0.5 tile ahead along heading)
       3) nearest standing building within ~0.7 tiles
     Returns an array (length per signature) of standing buildings. */
  Kaiju.prototype.acquireTargets = function (targetCell) {
    var primary = null;
    var W = G.World;
    if (!W) return [];

    // 1) explicit target
    if (targetCell && W.getBuildingAt) {
      var tb = W.getBuildingAt(targetCell.col, targetCell.row);
      if (tb && (tb.state === 'standing')) primary = tb;
    }
    // 2) faced building (project a point ~0.6 tile ahead along facing)
    if (!primary) {
      var fwd = facingToWorldVec(this.facing);
      var ax = this.pos.wx + fwd.wx * 0.7;
      var ay = this.pos.wy + fwd.wy * 0.7;
      if (W.getBuildingAt) {
        var fb = W.getBuildingAt(Math.floor(ax), Math.floor(ay));
        if (fb && fb.state === 'standing') primary = fb;
      }
    }
    // 3) nearest standing within band
    var near = (W.footprintsNear ? W.footprintsNear(this.pos.wx, this.pos.wy, 2.2) : []) || [];
    if (!primary) {
      var best = null, bestD = Infinity;
      for (var i = 0; i < near.length; i++) {
        var b = near[i];
        if (!b || b.state !== 'standing') continue;
        var dx = (b.col + 0.5) - this.pos.wx, dy = (b.row + 0.5) - this.pos.wy;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = b; }
      }
      primary = best;
    }
    if (!primary) return [];

    // how many targets this signature wants
    var n = this.targetCount();
    if (n <= 1) return [primary];

    // collect the N nearest *standing* (including primary), de-duped
    var pool2 = [];
    pool2.push(primary);
    var standing = [];
    for (var k = 0; k < near.length; k++) {
      var nb = near[k];
      if (nb && nb.state === 'standing' && nb !== primary) standing.push(nb);
    }
    standing.sort(function (a, b) {
      var da = sq(a.col + 0.5 - primary.col - 0.5) + sq(a.row + 0.5 - primary.row - 0.5);
      var db = sq(b.col + 0.5 - primary.col - 0.5) + sq(b.row + 0.5 - primary.row - 0.5);
      return da - db;
    });
    for (var s = 0; s < standing.length && pool2.length < n; s++) pool2.push(standing[s]);
    return pool2;
  };
  function sq(x) { return x * x; }

  /* number of distinct buildings a signature strikes directly */
  Kaiju.prototype.targetCount = function () {
    if (this.kind === 'gz') return 1;
    var def = Cfg.TITANS.find(function (t) { return t.id === this.kind; }, this);
    if (!def) return 1;
    if (def.hitsN) return def.hitsN;            // Ghidorah 3, Mecha 5
    return 1;                                   // Mothra/Rodan single primary (AOE/DoT handled in startAttack)
  };

  /* world-space unit vector for a facing index (for "ahead" probing). */
  function facingToWorldVec(facing) {
    // screen unit vector for facing, then invert iso to world delta
    var ang = facing * (Math.PI / 4);          // 0 S .. CCW
    var sx = Math.sin(ang), sy = Math.cos(ang); // matches headingToFacing(sx,sy)
    var wx = (sx / HALF_W + sy / HALF_H) * 0.5;
    var wy = (sy / HALF_H - sx / HALF_W) * 0.5;
    var m = Math.hypot(wx, wy) || 1;
    return { wx: wx / m, wy: wy / m };
  }

  /* =====================================================================
     startAttack(targets) — play the pose + the kind's signature.
     ALL damage routes through GAME.World.hitBuilding(b, rawDamage).
     ===================================================================== */
  Kaiju.prototype.startAttack = function (targets) {
    targets = targets || [];
    var dur = attackCooldownFor(this.kind);
    this._attackDur = dur;
    this.attackT = dur;
    this.atkCooldown = dur;
    this.attackFrame = 0;
    this.fsm = 'attack';
    // face the primary target if we have one
    if (targets.length && targets[0]) this.facingTo(targets[0].col + 0.5, targets[0].row + 0.5);

    var power = (G.Economy && G.Economy.attackPower) ? G.Economy.attackPower() : Cfg.START_ATTACK;

    if (this.kind === 'gz') this.sigAtomicBreath(targets, power);
    else if (this.kind === 'ghidorah') this.sigGoldBolts(targets, power);
    else if (this.kind === 'mothra') this.sigPowder(targets, power);
    else if (this.kind === 'rodan') this.sigDive(targets, power);
    else if (this.kind === 'mecha') this.sigMissiles(targets, power);
    else this.sigAtomicBreath(targets, power);
  };

  /* muzzle (mouth) screen position — where breath/missiles originate. */
  var _muz = { x: 0, y: 0 };
  Kaiju.prototype.muzzle = function (out) {
    out = out || _muz;
    // head sits ~0.84 of body height up; nudge toward facing in screen-x
    projectInto(this.pos.wx, this.pos.wy, 0, out);
    var bodyTopPx = SPR_H * 0.74 * 0.84;       // matches buildBody head height
    var fwd = facingToWorldVec(this.facing);
    out.x += fwd.wx === 0 && fwd.wy === 0 ? 0 : (sign(fwd.wx - fwd.wy) * 22);
    out.y -= bodyTopPx;
    return out;
  };
  function sign(x) { return x < 0 ? -1 : (x > 0 ? 1 : 0); }

  function buildingScreen(b, out) {
    out = out || { x: 0, y: 0 };
    projectInto(b.col + 0.5, b.row + 0.5, (b.height || 1) * 0.45, out);
    return out;
  }

  // ---- Godzilla: atomic-breath polyline to the single faced target ----
  Kaiju.prototype.sigAtomicBreath = function (targets, power) {
    var b = targets[0];
    var pal = this.pal;
    var mz = this.muzzle({ x: 0, y: 0 });
    if (b) {
      var bs = buildingScreen(b, { x: 0, y: 0 });
      FX.beam(mz.x, mz.y, bs.x, bs.y, pal.breath[1] || '#fff', pal.breath[0] || '#9bdcff', pal.breathGlow, 9);
      dealDamage(b, power);
    } else {
      // fire into the dark ahead (visual only) so taps always feel responsive
      var fwd = facingToWorldVec(this.facing);
      projectInto(this.pos.wx + fwd.wx * 2, this.pos.wy + fwd.wy * 2, 0.5, _proj);
      FX.beam(mz.x, mz.y, _proj.x, _proj.y, pal.breath[1] || '#fff', pal.breath[0] || '#9bdcff', pal.breathGlow, 8);
    }
    FX.shake(3.2);
    if (G.Audio && G.Audio.crumble) { /* impact SFX is World's job on destroy */ }
  };

  // ---- Ghidorah: 3 gold bolts, one per target ----
  Kaiju.prototype.sigGoldBolts = function (targets, power) {
    var pal = this.pal;
    var mz = this.muzzle({ x: 0, y: 0 });
    var per = power;                       // each bolt deals full base (×3 total dmg)
    for (var i = 0; i < targets.length; i++) {
      var b = targets[i];
      var bs = buildingScreen(b, { x: 0, y: 0 });
      FX.bolt(mz.x + (i - 1) * 10, mz.y, bs.x, bs.y, pal.eye, pal.plateGlow);
      dealDamage(b, per);
    }
    FX.shake(4.5);
  };

  // ---- Mothra: powder cone over primary -> applies DoT via building.dot ----
  Kaiju.prototype.sigPowder = function (targets, power) {
    var b = targets[0];
    var pal = this.pal;
    var mz = this.muzzle({ x: 0, y: 0 });
    var def = Cfg.TITANS.find(function (t) { return t.id === 'mothra'; });
    if (b) {
      var bs = buildingScreen(b, { x: 0, y: 0 });
      // powder billow along the path
      var puffN = REDUCED ? 2 : 5;
      for (var i = 0; i < puffN; i++) {
        var tt = i / (puffN - 1 || 1);
        FX.powder(lerp(mz.x, bs.x, tt), lerp(mz.y, bs.y, tt), pal.breath[0] || '#6fe0ff');
      }
      // immediate light tick + schedule DoT on the building (World drains it)
      var tickFrac = (def && def.dot) ? def.dot.frac : 0.06;
      var ticks = (def && def.dot) ? def.dot.ticks : 10;
      var perTick = Math.max(1, Math.round((b.maxHp || power) * tickFrac));
      applyDot(b, perTick, ticks);
      dealDamage(b, Math.round(power * 0.4));   // small direct hit on contact
    }
    FX.shake(2.6);
  };

  // ---- Rodan: dive -> radial shockwave AOE around the impact cell ----
  Kaiju.prototype.sigDive = function (targets, power) {
    var pal = this.pal;
    var center = targets[0];
    var cx, cy, ccol, crow;
    if (center) { ccol = center.col + 0.5; crow = center.row + 0.5; }
    else {
      var fwd = facingToWorldVec(this.facing);
      ccol = this.pos.wx + fwd.wx * 0.8; crow = this.pos.wy + fwd.wy * 0.8;
    }
    projectInto(ccol, crow, 0, _proj); cx = _proj.x; cy = _proj.y;

    var def = Cfg.TITANS.find(function (t) { return t.id === 'rodan'; });
    var radius = (def && def.aoe) ? def.aoe.radius : 2.2;     // tiles
    // big visual ring (screen radius ≈ radius tiles * HALF_W)
    FX.shockwave(cx, cy, radius * TILE_W * 0.9, pal.eye);
    FX.shake(REDUCED ? 0 : 9);
    FX.debris({ col: Math.floor(ccol), row: Math.floor(crow), height: 1, style: null });

    // damage every standing building within `radius` tiles of impact
    var near = (G.World && G.World.footprintsNear) ? G.World.footprintsNear(ccol, crow, radius + 1) : [];
    for (var i = 0; i < near.length; i++) {
      var b = near[i];
      if (!b || b.state !== 'standing') continue;
      var dx = (b.col + 0.5) - ccol, dy = (b.row + 0.5) - crow;
      if (dx * dx + dy * dy <= radius * radius) {
        // linear falloff to 55% at the rim keeps the core punchy
        var dist = Math.sqrt(dx * dx + dy * dy);
        var falloff = lerp(1, 0.55, clamp(dist / radius, 0, 1));
        dealDamage(b, Math.round(power * falloff));
      }
    }
  };

  // ---- Mecha: 5 homing missiles, one per target, each a DoT-free direct hit ----
  Kaiju.prototype.sigMissiles = function (targets, power) {
    var pal = this.pal;
    var mz = this.muzzle({ x: 0, y: 0 });
    var per = power;
    for (var i = 0; i < targets.length; i++) {
      var b = targets[i];
      var bs = buildingScreen(b, { x: 0, y: 0 });
      FX.missile(mz.x + (i - 2) * 6, mz.y, bs.x, bs.y, pal.eye);
      dealDamage(b, per);
    }
    FX.shake(REDUCED ? 0 : 5.5);
  };

  /* SINGLE damage entry point wrapper — always route through World.hitBuilding,
     which banks payout (×combo), spawns its own crumble, and applies respawn.
     We additionally throw a damage number for feedback. */
  function dealDamage(b, raw) {
    if (!b) return;
    if (raw < 1) raw = 1;
    FX.spawnDamageText(b, raw);
    if (G.World && G.World.hitBuilding) G.World.hitBuilding(b, raw);
  }

  /* Apply a damage-over-time tag to a building. World owns the schema
     `dot:{perTick,ticks}` and drains it in updateBuildings(); we just set it
     (or stack onto an existing one). */
  function applyDot(b, perTick, ticks) {
    if (!b) return;
    // Route through World.applyDot so the schema matches what World.tickDot drains
    // ({perTick,ticks,intervalMs,acc}); the bare {perTick,ticks} shape never ticked.
    var md = (Cfg.TITANS.find(function (t) { return t.id === 'mothra'; }) || {}).dot || {};
    var intervalMs = md.intervalMs || 300;
    if (G.World && typeof G.World.applyDot === 'function') {
      G.World.applyDot(b, { perTick: perTick, ticks: ticks, intervalMs: intervalMs });
    } else {
      b.dot = { perTick: perTick, ticks: ticks, intervalMs: intervalMs, acc: 0 };
    }
  }

  /* =====================================================================
     DRAW — cached static body (per form/facing/frame/scale) + LIVE glow
     Called by Render inside the camera transform. (sx,sy) is the screen-space
     foot anchor for THIS kaiju; scaleBucket is a quantized zoom level so the
     Assets LRU stays small. We blit the cached frame so the anchor lines up.
     ===================================================================== */
  // quantized scale buckets so we don't bake a frame per sub-pixel zoom
  var SCALE_BUCKETS = [1.0];
  function bucketScale(scaleBucket) {
    if (typeof scaleBucket === 'number') return scaleBucket;
    return 1.0;
  }

  // Per-unit draw scale: Godzilla looms (GZ.baseScale) and grows ×GZ.evoGrowth per
  // evolution tier; Titans use a fixed large scale. Feet stay anchored as he grows.
  Kaiju.prototype.drawScale = function () {
    var gz = Cfg.GZ; if (!gz) return 1;
    if (this.kind !== 'gz') return gz.titanScale || 1.5;
    var ei = 0;
    for (var i = 0; i < Cfg.EVOLUTIONS.length; i++) { if (Cfg.EVOLUTIONS[i].id === this.formId) { ei = i; break; } }
    return (gz.baseScale || 1.5) * Math.pow(gz.evoGrowth || 1.15, ei);
  };

  Kaiju.prototype.draw = function (ctx, sx, sy, scaleBucket) {
    var scale = bucketScale(scaleBucket) * this.drawScale();
    var fm = FACING_MAP[this.facing & 7];
    var base = fm.base, mir = fm.mir;

    // pose-frame selection
    var frame;
    if (this.fsm === 'attack') frame = this.attackFrame;          // 0..5
    else if (this.fsm === 'walk') frame = Math.floor(this.walkPhase * 6) % 6;  // 0..5
    else frame = 0;                                               // idle/hurt -> frame 0

    var token = this._formToken;
    // cache key: form|facingBase|fsm|frame|scaleBucket  (mirror applied at blit)
    var key = 'kj:' + token + ':' + base + ':' + this.fsm + ':' + frame + ':' + (scale === 1 ? '1' : ('' + scale));
    var pal = this.pal;
    var cv = bakeOrGet(key, SPR_W, SPR_H, makeBodyBuilder(pal, base, frame, this.fsm));

    // ---- blit cached body, anchored at foot centroid (sx,sy), with mirror ----
    var dw = SPR_W * scale, dh = SPR_H * scale;
    var ox = sx - ANCHOR_X * scale;
    var oy = sy - ANCHOR_Y * scale;

    ctx.save();
    if (mir) {
      // mirror about the vertical line through the anchor (facings 5,6,7 = the
      // X-flip of authored NE,E,SE). Everything below is drawn in this flipped
      // frame so body + glow + flash all stay consistent.
      ctx.translate(sx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-sx, 0);
    }
    if (cv) ctx.drawImage(cv, ox, oy, dw, dh);

    // ---- evolve white-flash: re-blit the silhouette with 'screen' composite,
    // which brightens the body toward white (a clean transformation pop). Kept
    // inside the mirror transform so flipped facings flash correctly. ----
    if (this._flash > 0.001 && cv) {
      ctx.save();
      ctx.globalAlpha = this._flash * 0.75;
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(cv, ox, oy, dw, dh);
      ctx.restore();
    }

    // ---- LIVE overlay (NOT baked): aura, plate shimmer, eye/breath glow ----
    // Drawn in the cached body's local space so it tracks the silhouette.
    ctx.save();
    ctx.translate(ox + ANCHOR_X * scale, oy + ANCHOR_Y * scale); // -> sprite anchor origin
    ctx.scale(scale, scale);
    this.drawGlow(ctx, base, frame);
    ctx.restore();

    ctx.restore();
  };

  // build a closure the cache calls once to author the static frame
  function makeBodyBuilder(pal, base, frame, fsm) {
    return function (ctx, w, h) {
      ctx.imageSmoothingEnabled = false;
      buildBody(ctx, w, h, pal, base, frame, fsm);
    };
  }

  /* LIVE glow overlay — additive, animated. Mirrors buildBody's local frame
     (origin at sprite anchor; +y up is -y here). Uses globalCompositeOperation
     'screen' so glows add to the baked body. NO shadowBlur. */
  Kaiju.prototype.drawGlow = function (ctx, base, frame) {
    var pal = this.pal;
    var BH = SPR_H * 0.74;
    var BW = BH * 0.5;
    var fg = facingGeom(base);

    var prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'screen';

    // breathing shimmer 0..1
    var shimmer = (Math.sin(this._glowPhase * 3.0) + 1) * 0.5;
    var pulse = (Math.sin(this._glowPhase * 1.6) + 1) * 0.5;

    // ---- aura halo (forms that have one) ----
    if (pal.aura) {
      var ar = BH * (0.62 + pulse * 0.05);
      var ag = ctx.createRadialGradient(0, -BH * 0.5, BH * 0.06, 0, -BH * 0.5, ar);
      ag.addColorStop(0, pal.aura);
      ag.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(0, -BH * 0.5, ar, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ---- dorsal plate shimmer (the live glow over baked plate bodies) ----
    drawPlates(ctx, BH, BW, fg, pal, true, shimmer);

    // ---- eye glow (skip on back/back34 facings where eye isn't drawn) ----
    if (fg.show !== 'back' && fg.show !== 'back34') {
      var hx = fg.headX * BW, sn = fg.snout;
      ctx.globalAlpha = 0.55 + shimmer * 0.45;
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.arc(hx + BW * 0.47, -BH * 0.842, BW * 0.06, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ---- breath charge glow at the muzzle during attack windup ----
    if (this.fsm === 'attack' && this.attackFrame <= 2 && fg.show !== 'back') {
      var hxx = fg.headX * BW, snn = fg.snout;
      var chg = 1 - this.attackFrame / 3;
      ctx.globalAlpha = chg * 0.9;
      var bg = ctx.createRadialGradient(hxx + BW * (0.5 + snn), -BH * 0.77, 1, hxx + BW * (0.5 + snn), -BH * 0.77, BW * 0.4);
      bg.addColorStop(0, pal.breath[1] || '#fff');
      bg.addColorStop(0.5, pal.breathGlow);
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(hxx + BW * (0.5 + snn), -BH * 0.77, BW * 0.4, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ---- per-form FX flourishes (heat wisps / pink sparks / cosmic motes) ----
    if (pal.fx === 'heat') {
      ctx.globalAlpha = 0.5 + shimmer * 0.3;
      ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        var px = (i - 1) * BW * 0.18 + Math.sin(this._glowPhase * 4 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(px, -BH * 0.5);
        ctx.lineTo(px + Math.sin(this._glowPhase * 6 + i) * 5, -BH * 0.5 - BW * 0.22);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (pal.fx === 'pink') {
      ctx.fillStyle = pal.plateGlow; ctx.globalAlpha = 0.6;
      for (var p = 0; p < 4; p++) {
        var a = p * 1.7 + this._glowPhase * 2;
        var ix = Math.cos(a) * BW * 0.4, iy = -BH * 0.5 + Math.sin(a * 1.3) * BH * 0.25;
        var rr = ((Math.sin(this._glowPhase * 3 + p) + 1) * 0.5) * 3 + 1;
        ctx.beginPath(); ctx.arc(ix, iy, rr, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (pal.fx === 'cosmic') {
      ctx.fillStyle = 'rgba(210,150,255,0.95)'; ctx.globalAlpha = 0.85;
      for (var c = 0; c < 8; c++) {
        var aa = c * 1.7 + this._glowPhase;
        var cxp = Math.cos(aa) * BW * 0.42, cyp = -BH * 0.52 + Math.sin(aa * 1.3) * BH * 0.26;
        var cr = ((Math.sin(this._glowPhase * 3 + c) + 1) * 0.5) * 3 + 1;
        ctx.beginPath(); ctx.arc(cxp, cyp, cr, 0, 6.2832); ctx.fill();
      }
      // supernova heartbeat: bright core pulse
      ctx.globalAlpha = 0.25 + pulse * 0.4;
      var hg = ctx.createRadialGradient(0, -BH * 0.5, 1, 0, -BH * 0.5, BW * 0.7);
      hg.addColorStop(0, 'rgba(255,255,255,0.9)');
      hg.addColorStop(1, 'rgba(160,90,255,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, -BH * 0.5, BW * 0.7, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = 1;
  };

  /* depthKey passthrough so Render can sort a kaiju like any entity.
     Kaiju get a +1 depth bias to draw over same-cell ground FX. */
  Kaiju.prototype.depthKey = function () {
    if (G.iso && G.iso.depthKey) return G.iso.depthKey(this);
    return (this.pos.wx + this.pos.wy) * 1024 + (this.pos.z || 0) * 4 + this.depthBias;
  };

  /* =====================================================================
     PUBLIC FACTORY
     ===================================================================== */
  var Kaiju_ns = {
    create: function (opts) { return new Kaiju(opts); },
    // expose for render/debug if needed
    SPR_W: SPR_W, SPR_H: SPR_H, ANCHOR_X: ANCHOR_X, ANCHOR_Y: ANCHOR_Y,
    headingToFacing: headingToFacing
  };

  G.Kaiju = Kaiju_ns;

})(window.GAME);
