/* =====================================================================
   GAME.Kaiju  +  GAME.FX   ·  js/entities.js  (v3 refactor)
   Loads AFTER archetypes.js, assets.js; BEFORE world.js.

   v3 changes vs v2:
   - buildBody now delegates drawing to GAME.Archetypes.build(); the
     wyrm drawing functions (drawTail/drawLeg/drawArm/drawTorso/
     drawPlates/drawHead/drawGlow) still live here as shared helpers
     that archetypes.js calls back into via the GAME.Archetypes
     registration in archetypes.js; locally they are used directly
     while archetypes.js is not yet loaded (graceful fallback).
   - ATTACK_KINDS = { beam, bolts, cloud, dive, volley } maps the 5
     attack kinds to their implementation; startAttack reads
     form.attack.kind to dispatch instead of if(kind==='gz')…
   - targetCount() reads form.attack.hits (if any).
   - attackCooldownFor() reads form.attack.cooldown.
   - MOTE_FX = { heat, pink, cosmic } keyed by palette.fxMotes.
   - JUMP: pos.z kinematics (Config.JUMP.vEscape / .gravity) on
     intent.jump; while airborne, acquireTargets also considers flying.
   - Ground contact-shadow exposed via kaiju.drawShadow(ctx,sx,sy,scale).

   KEPT: FX pool, bakeOrGet/cache key, FACING_MAP, locomotion/collision,
         drawScale, all 5 attack visuals, drawGlow, baked plate glow.
   ===================================================================== */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Cfg = G.Config;
  var U = G.Utils;
  var GRID = Cfg.GRID;
  var TILE_W = GRID.TILE_W, TILE_H = GRID.TILE_H, WZ_PX = GRID.WZ_PX;
  var HALF_W = TILE_W / 2;   // 32
  var HALF_H = TILE_H / 2;   // 16
  var REDUCED = U.reducedMotion;

  var clamp = U.clamp, lerp = U.lerp;
  function rand(a, b) { return a + Math.random() * (b - a); }
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  var _proj = { x: 0, y: 0 };
  function projectInto(wx, wy, wz, out) {
    if (G.iso && G.iso.worldToScreenInto) { G.iso.worldToScreenInto(wx, wy, wz, out); return out; }
    out.x = (wx - wy) * HALF_W;
    out.y = (wx + wy) * HALF_H - (wz || 0) * WZ_PX;
    return out;
  }

  /* =====================================================================
     GAME.FX
     ===================================================================== */
  var FX = (function () {
    var fx = {};

    var MAX_P = REDUCED ? 90 : 320;
    var pool = new Array(MAX_P);
    for (var i = 0; i < MAX_P; i++) {
      pool[i] = { live: false, sx: 0, sy: 0, vx: 0, vy: 0, g: 0, size: 0, t: 0, life: 0, col: '#000', shape: 0 };
    }
    var pCursor = 0;
    function acquire() {
      for (var n = 0; n < MAX_P; n++) {
        var idx = (pCursor + n) % MAX_P;
        if (!pool[idx].live) { pCursor = (idx + 1) % MAX_P; return pool[idx]; }
      }
      var p = pool[pCursor]; pCursor = (pCursor + 1) % MAX_P; return p;
    }

    var beams = [];
    var bolts = [];
    var puffs = [];
    var rings = [];
    var missiles = [];
    var texts = [];
    var shakeMag = 0;
    var hitStopMs = 0;     // pending hit-stop the game loop consumes (max-wins)
    var flashA = 0;        // full-screen white flash alpha (decays); drawn untransformed by render

    fx.shake = function (mag) {
      if (REDUCED) return;
      if (mag > shakeMag) shakeMag = mag;
      if (G.camera && G.camera.shake) G.camera.shake(mag);
    };
    fx.shakeAmount = function () { return shakeMag; };

    // Brief freeze-frame on a satisfying kill. Max-wins so overlapping kills
    // don't stack into a long stall. No-op under reduced-motion.
    fx.hitStop = function (ms) { if (REDUCED) return; if (ms > hitStopMs) hitStopMs = ms; };
    fx.consumeHitStop = function () { var v = hitStopMs; hitStopMs = 0; return v; };

    // Full-screen white flash on destroy. Render reads flashAmount() and draws
    // an untransformed rect over the scene; this just owns the value + decay.
    fx.screenFlash = function (a) { if (REDUCED) return; if (a > flashA) flashA = a; };
    fx.flashAmount = function () { return flashA; };

    fx.debris = function (b) {
      if (!b) return;
      var count = REDUCED ? 6 : (24 + Math.min(b.row || b.tier || 0, 16));
      var col = (b.style && b.style.body) || b.bodyColor || '#6f6a63';
      projectInto((b.col || 0) + 0.5, (b.row || 0) + 0.5, 0, _proj);
      var ax = _proj.x, ay = _proj.y;
      var h = (b.height || 1) * WZ_PX;
      for (var k = 0; k < count; k++) {
        var p = acquire();
        p.live = true;
        p.sx = ax + rand(-HALF_W * 0.7, HALF_W * 0.7);
        p.sy = ay - rand(0, h);
        p.vx = rand(-180, 180);
        p.vy = rand(-360, -80);
        p.g = 900;
        p.size = rand(4, 11);
        p.life = p.t = rand(0.6, 1.4);
        p.col = (k & 3) === 0 ? U.shade(col, 1.25) : col;
        p.shape = 0;
        p.floorY = ay;
      }
    };

    fx.sparks = function (sx, sy, col, n) {
      if (REDUCED) { n = Math.min(n, 4); }
      for (var k = 0; k < n; k++) {
        var p = acquire();
        p.live = true;
        p.sx = sx; p.sy = sy;
        p.vx = rand(-180, 180); p.vy = rand(-220, 40);
        p.g = 520; p.size = rand(2, 5);
        p.life = p.t = rand(0.25, 0.6); p.col = col; p.shape = 1;
        p.floorY = sy + 9999;
      }
    };

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

    fx.spawnRewardText = function (b, amount) {
      var wx = (b.col || 0) + 0.5, wy = (b.row || 0) + 0.5;
      projectInto(wx, wy, (b.height || 1) + 0.3, _proj);
      texts.push({
        sx: _proj.x, sy: _proj.y - 10, vy: -38,
        t: 1.5, life: 1.5, txt: '+' + U.fmt(amount), col: '#6dffa0', big: true
      });
    };

    fx.beam = function (sx0, sy0, sx1, sy1, coreCol, edgeCol, glow, width) {
      beams.push({ x0: sx0, y0: sy0, x1: sx1, y1: sy1, t: 0.18, life: 0.18, coreCol: coreCol, edgeCol: edgeCol, glow: glow, width: width || 8 });
      fx.sparks(sx1, sy1, glow, REDUCED ? 4 : 10);
    };

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

    fx.powder = function (sx, sy, col) {
      var n = REDUCED ? 2 : 4;
      for (var i = 0; i < n; i++) {
        puffs.push({ sx: sx + rand(-14, 14), sy: sy + rand(-10, 10), r: rand(6, 14), t: 1.0, life: 1.0, col: col });
      }
    };

    fx.shockwave = function (sx, sy, maxR, col) {
      rings.push({ sx: sx, sy: sy, r0: 8, r1: maxR, t: 0.5, life: 0.5, col: col });
    };

    fx.missile = function (sx0, sy0, sx1, sy1, col) {
      missiles.push({ sx: sx0, sy: sy0, tx: sx1, ty: sy1, t: 0.34, life: 0.34, col: col });
    };

    fx.update = function (dt) {
      if (shakeMag > 0.05) { shakeMag *= Math.pow(0.0015, dt); if (shakeMag < 0.05) shakeMag = 0; }
      else shakeMag = 0;
      if (flashA > 0) { flashA -= dt / 0.12; if (flashA < 0) flashA = 0; }   // ~120ms linear fade

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

      for (var b = beams.length - 1; b >= 0; b--) { beams[b].t -= dt; if (beams[b].t <= 0) beams.splice(b, 1); }
      for (var z = bolts.length - 1; z >= 0; z--) { bolts[z].t -= dt; if (bolts[z].t <= 0) bolts.splice(z, 1); }
      for (var u = puffs.length - 1; u >= 0; u--) {
        var pf = puffs[u]; pf.t -= dt; pf.sy -= 14 * dt; pf.r += 18 * dt;
        if (pf.t <= 0) puffs.splice(u, 1);
      }
      for (var r = rings.length - 1; r >= 0; r--) { rings[r].t -= dt; if (rings[r].t <= 0) rings.splice(r, 1); }
      for (var m = missiles.length - 1; m >= 0; m--) {
        var ms = missiles[m]; ms.t -= dt;
        var prog = 1 - ms.t / ms.life;
        if (!REDUCED && (m & 1) === 0 && Math.random() < 0.6) {
          fx.sparks(lerp(ms.sx, ms.tx, prog), lerp(ms.sy, ms.ty, prog), ms.col, 1);
        }
        if (ms.t <= 0) { fx.sparks(ms.tx, ms.ty, ms.col, REDUCED ? 3 : 7); missiles.splice(m, 1); }
      }
      for (var t = texts.length - 1; t >= 0; t--) {
        var tx = texts[t]; tx.t -= dt; tx.sy += tx.vy * dt; tx.vy *= 0.9;
        if (tx.t <= 0) texts.splice(t, 1);
      }
    };

    fx.draw = function (ctx) {
      for (var r = 0; r < rings.length; r++) {
        var rg = rings[r], pr = 1 - rg.t / rg.life;
        var rad = lerp(rg.r0, rg.r1, pr);
        ctx.globalAlpha = (1 - pr) * 0.85;
        ctx.strokeStyle = rg.col; ctx.lineWidth = lerp(7, 1.5, pr);
        ctx.beginPath();
        ctx.ellipse(rg.sx, rg.sy, rad, rad * 0.5, 0, 0, 6.2832);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (var i = 0; i < MAX_P; i++) {
        var p = pool[i];
        if (!p.live) continue;
        ctx.globalAlpha = p.t > p.life * 0.4 ? 1 : clamp(p.t / (p.life * 0.4), 0, 1);
        ctx.fillStyle = p.col;
        var s = p.size;
        if (p.shape === 1) {
          ctx.beginPath();
          ctx.moveTo(p.sx, p.sy - s); ctx.lineTo(p.sx + s, p.sy);
          ctx.lineTo(p.sx, p.sy + s); ctx.lineTo(p.sx - s, p.sy); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillRect(p.sx - s * 0.5, p.sy - s * 0.5, s, s);
        }
      }
      ctx.globalAlpha = 1;

      for (var u = 0; u < puffs.length; u++) {
        var pf = puffs[u];
        ctx.globalAlpha = clamp(pf.t / pf.life, 0, 1) * 0.5;
        ctx.fillStyle = pf.col;
        ctx.beginPath(); ctx.arc(pf.sx, pf.sy, pf.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;

      var prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'screen';
      ctx.lineCap = 'round';

      for (var b = 0; b < beams.length; b++) {
        var bm = beams[b], a = clamp(bm.t / bm.life, 0, 1);
        ctx.globalAlpha = a;
        ctx.lineWidth = bm.width;
        ctx.strokeStyle = bm.glow;
        strokeJagged(ctx, bm.x0, bm.y0, bm.x1, bm.y1, 9, 5);
        ctx.lineWidth = bm.width * 0.45;
        ctx.strokeStyle = bm.edgeCol;
        strokeJagged(ctx, bm.x0, bm.y0, bm.x1, bm.y1, 9, 2.5);
        ctx.lineWidth = bm.width * 0.2;
        ctx.strokeStyle = bm.coreCol;
        ctx.beginPath(); ctx.moveTo(bm.x0, bm.y0); ctx.lineTo(bm.x1, bm.y1); ctx.stroke();
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

    function strokeJagged(ctx, x0, y0, x1, y1, segs, amp) {
      ctx.beginPath(); ctx.moveTo(x0, y0);
      for (var i = 1; i < segs; i++) {
        var tt = i / segs;
        ctx.lineTo(lerp(x0, x1, tt) + rand(-amp, amp), lerp(y0, y1, tt) + rand(-amp, amp));
      }
      ctx.lineTo(x1, y1); ctx.stroke();
    }

    fx._poolSize = MAX_P;
    return fx;
  })();

  G.FX = FX;

  /* =====================================================================
     KAIJU SPRITE BAKING
     ===================================================================== */

  var SPR_W = 150, SPR_H = 168;
  var ANCHOR_X = SPR_W * 0.5;
  var ANCHOR_Y = SPR_H * 0.86;

  // Facing index 0=S(toward camera) .. 7=SW, CCW.
  // Authored: S(0),SE(1),E(2),NE(3),N(4). Mirror for 5,6,7.
  var FACING_MAP = [
    { base: 0, mir: false }, // 0 S
    { base: 1, mir: false }, // 1 SE
    { base: 2, mir: false }, // 2 E
    { base: 3, mir: false }, // 3 NE
    { base: 4, mir: false }, // 4 N
    { base: 3, mir: true },  // 5 NW = NE mirrored
    { base: 2, mir: true },  // 6 W  = E  mirrored
    { base: 1, mir: true }   // 7 SW = SE mirrored
  ];

  // ---- bakeOrGet / local LRU fallback (kept verbatim from v2) ----
  var _localCache = {};
  var _localOrder = [];
  var LOCAL_LRU_MAX = 96;
  var _assetsMode = 0;
  function bakeOrGet(key, w, h, builder) {
    if (_assetsMode === -1 || !G.Assets || typeof G.Assets.get !== 'function') {
      return localBake(key, w, h, builder);
    }
    var selfBuilder = function (ctx2, bw, bh) {
      if (ctx2 && typeof ctx2.drawImage === 'function') { builder(ctx2, bw || w, bh || h); return; }
      var cc = makeCanvas(w, h); builder(cc.getContext('2d'), w, h); return cc;
    };
    if (_assetsMode === 1) { var r1 = tryGet(function () { return G.Assets.get(key, w, h, selfBuilder); }); if (r1) return r1; }
    else if (_assetsMode === 2) { var r2 = tryGet(function () { return G.Assets.get(key, selfBuilder); }); if (r2) return r2; }
    else if (_assetsMode === 3) { var r3 = tryGet(function () { return G.Assets.get(key); }); if (r3) return r3; }
    else {
      var a = tryGet(function () { return G.Assets.get(key, w, h, selfBuilder); });
      if (a) { _assetsMode = 1; return a; }
      var b2 = tryGet(function () { return G.Assets.get(key, selfBuilder); });
      if (b2) { _assetsMode = 2; return b2; }
      var c = tryGet(function () { return G.Assets.get(key); });
      if (c) { _assetsMode = 3; return c; }
      _assetsMode = -1;
    }
    return localBake(key, w, h, builder);
  }
  function tryGet(fn) { try { var g = fn(); return (g && g.width) ? g : null; } catch (e) { return null; } }
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

  /* =====================================================================
     PALETTE — resolve from FORMS (v3) falling back to EVOLUTIONS/TITANS (v2)
     ===================================================================== */

  /* Return the form definition from Config.FORMS (v3 schema) or fall back to
     the legacy EVOLUTIONS / TITANS arrays (v2 schema). Always returns an object
     with at least { palette, attack, shape } so callers can safely destructure. */
  function formDefFor(kind, formId) {
    // v3 path: Config.FORMS is the unified array
    if (Cfg.FORMS) {
      var id = (kind === 'gz') ? formId : kind;
      for (var fi = 0; fi < Cfg.FORMS.length; fi++) {
        if (Cfg.FORMS[fi].id === id) return Cfg.FORMS[fi];
      }
    }
    // v2 fallback — synthesise a minimal FORMS-shaped object
    if (kind === 'gz') {
      var evos = Cfg.EVOLUTIONS || [];
      var evo = evos[0];
      for (var ei = 0; ei < evos.length; ei++) { if (evos[ei].id === formId) { evo = evos[ei]; break; } }
      if (!evo) evo = {};
      return {
        id: evo.id, family: 'wyrm', archetype: 'wyrm',
        palette: {
          skin: evo.skin, skinDark: evo.skinDark, skinLight: evo.skinLight,
          plate: evo.plate, plateEdge: evo.plateEdge, plateGlow: evo.plateGlow,
          breath: evo.breath, breathGlow: evo.breathGlow, eye: evo.eye,
          aura: evo.aura, fxMotes: evo.fx
        },
        shape: { archetype: 'wyrm', plates: 9, tail: 1.0, bulk: 1.0 },
        attack: { kind: 'beam', hits: 1, cooldown: 0.30,
                  color: null, shake: 3.2,
                  dot: null, aoeRadius: 0 }
      };
    }
    // titan fallback
    var titans = Cfg.TITANS || [];
    var tdef = titans[0];
    for (var ti = 0; ti < titans.length; ti++) { if (titans[ti].id === kind) { tdef = titans[ti]; break; } }
    if (!tdef) tdef = { id: kind, tint: '#888', accent: '#fff' };
    var t = tdef.tint, acc = tdef.accent;
    // map v2 sig to v3 kind
    var sigMap = { lightning: 'bolts', powder: 'cloud', dive: 'dive', missiles: 'volley' };
    var atkKind = sigMap[tdef.sig] || 'beam';
    return {
      id: tdef.id, family: tdef.id, archetype: 'wyrm',
      palette: {
        skin: U.shade(t, 0.62), skinDark: U.shade(t, 0.34), skinLight: U.shade(t, 0.92),
        plate: U.shade(t, 0.5), plateEdge: t, plateGlow: rgbaFrom(t, 0.75),
        breath: [acc, '#ffffff'], breathGlow: rgbaFrom(acc, 0.9), eye: acc,
        aura: rgbaFrom(acc, 0.14), fxMotes: null
      },
      shape: { archetype: 'wyrm', plates: 9, tail: 1.0, bulk: 1.0 },
      attack: {
        kind: atkKind,
        hits: tdef.hitsN || 1,
        cooldown: atkKind === 'dive' ? 0.62 : atkKind === 'cloud' ? 0.46 : atkKind === 'volley' ? 0.50 : 0.42,
        color: null, shake: atkKind === 'dive' ? 9 : 4.5,
        dot: tdef.dot || null,
        aoeRadius: (tdef.aoe && tdef.aoe.radius) || 0
      }
    };
  }

  /* Build the drawing palette from a form definition. */
  function paletteFromFormDef(fd) {
    var p = fd.palette || {};
    return {
      skin:        p.skin       || '#3c3c3c',
      skinDark:    p.skinDark   || '#1e1e1e',
      skinLight:   p.skinLight  || '#565656',
      plate:       p.plate      || '#2b2b2b',
      plateEdge:   p.plateEdge  || '#8fc2ee',
      plateGlow:   p.plateGlow  || 'rgba(70,160,235,0.45)',
      breath:      p.breath     || ['#9bdcff', '#ffffff'],
      breathGlow:  p.breathGlow || 'rgba(70,170,255,0.9)',
      eye:         p.eye        || '#ffbe3a',
      aura:        p.aura       || null,
      fxMotes:     p.fxMotes    || null,
      // legacy fx alias — drawGlow reads both
      fx:          p.fxMotes    || null,
      isTitan:     fd.archetype !== 'wyrm',
      id:          fd.id
    };
  }

  function rgbaFrom(hex, a) {
    var c = ('' + hex).replace('#', '');
    if (c.length === 3) c = c.replace(/(.)/g, '$1$1');
    var n = parseInt(c, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* =====================================================================
     WYRM BODY DRAWING HELPERS
     Shared with archetypes.js — exported via G.Kaiju._wyrmHelpers below.
     ===================================================================== */

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
      default:
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

  function drawLeg(ctx, x, BH, BW, swing, fg) {
    var w = BH * 0.075;
    var lift = -swing * BH * 0.05;
    var footFwd = swing * BW * 0.10;
    ctx.beginPath();
    ctx.moveTo(x - w, -BH * 0.34);
    ctx.quadraticCurveTo(x - w * 1.1, -BH * 0.15 + lift, x - w * 0.8 + footFwd, -BH * 0.02 + lift);
    ctx.lineTo(x - w * 0.85 + footFwd, lift);
    ctx.lineTo(x + w * 1.5 + footFwd, lift);
    ctx.quadraticCurveTo(x + w * 1.1 + footFwd, -BH * 0.05 + lift, x + w, -BH * 0.14 + lift);
    ctx.quadraticCurveTo(x + w * 1.1, -BH * 0.27, x + w * 0.85, -BH * 0.34);
    ctx.closePath(); ctx.fill();
  }

  function drawArm(ctx, x, y, BH, BW, fg, side, atk) {
    var w = BH * 0.040;
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
    var lean = fg.dir;
    var bg = ctx.createLinearGradient(0, -BH * 0.9, 0, -BH * 0.1);
    bg.addColorStop(0, light); bg.addColorStop(0.5, skin); bg.addColorStop(1, dark);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-BW * 0.36, -BH * 0.30);
    ctx.quadraticCurveTo(-BW * 0.50, -BH * 0.68, -BW * 0.14, -BH * 0.80);
    ctx.quadraticCurveTo(BW * 0.04, -BH * 0.88, BW * (0.22 + lean * 0.06), -BH * 0.82);
    ctx.quadraticCurveTo(BW * (0.40 + lean * 0.10), -BH * 0.78, BW * (0.46 + lean * 0.08), -BH * 0.62);
    ctx.quadraticCurveTo(BW * (0.56 + lean * 0.06), -BH * 0.46, BW * (0.46 + lean * 0.04), -BH * 0.30);
    ctx.quadraticCurveTo(BW * 0.40, -BH * 0.13, BW * 0.08, -BH * 0.13);
    ctx.quadraticCurveTo(-BW * 0.18, -BH * 0.13, -BW * 0.36, -BH * 0.30);
    ctx.closePath(); ctx.fill();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,250,235,0.22)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-BW * 0.14, -BH * 0.80);
    ctx.quadraticCurveTo(BW * 0.04, -BH * 0.88, BW * (0.22 + lean * 0.06), -BH * 0.82);
    ctx.quadraticCurveTo(BW * (0.40 + lean * 0.10), -BH * 0.78, BW * (0.46 + lean * 0.08), -BH * 0.62);
    ctx.stroke(); ctx.restore();
  }

  function drawPlates(ctx, BH, BW, fg, pal, glowPass, shimmer) {
    var N = 9;
    var lean = fg.plateLean;
    for (var i = 0; i <= N; i++) {
      var t = i / N;
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

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(hx + BW * (0.10), -BH * 0.78);
    ctx.quadraticCurveTo(hx + BW * 0.30, -BH * 0.86, hx + BW * 0.42, -BH * 0.84);
    ctx.lineTo(hx + BW * 0.44, -BH * 0.68);
    ctx.quadraticCurveTo(hx + BW * 0.30, -BH * 0.66, hx + BW * 0.18, -BH * 0.66);
    ctx.closePath(); ctx.fill();

    var sn = fg.snout;
    ctx.beginPath();
    ctx.moveTo(hx + BW * 0.30, -BH * 0.84);
    ctx.quadraticCurveTo(hx + BW * (0.46), -BH * 0.92 * hs, hx + BW * (0.40 + sn), -BH * 0.85);
    ctx.quadraticCurveTo(hx + BW * (0.52 + sn), -BH * 0.82, hx + BW * (0.52 + sn), -BH * 0.795);
    ctx.lineTo(hx + BW * (0.46 + sn), -BH * 0.785);
    ctx.quadraticCurveTo(hx + BW * 0.40, -BH * 0.78, hx + BW * 0.32, -BH * 0.79);
    ctx.quadraticCurveTo(hx + BW * 0.26, -BH * 0.80, hx + BW * 0.24, -BH * 0.81);
    ctx.closePath(); ctx.fill();

    ctx.beginPath();
    ctx.moveTo(hx + BW * 0.30, -BH * 0.775);
    ctx.quadraticCurveTo(hx + BW * (0.46 + sn), -BH * 0.745 + mo, hx + BW * (0.50 + sn), -BH * 0.765 + mo * 0.6);
    ctx.quadraticCurveTo(hx + BW * (0.42 + sn), -BH * 0.725 + mo, hx + BW * 0.30, -BH * 0.745 + mo * 0.4);
    ctx.closePath(); ctx.fill();

    if (atk > 0.25 && fg.show !== 'back34') {
      ctx.fillStyle = '#f3ead7';
      for (var ti = 0; ti < 3; ti++) {
        var tx = hx + BW * (0.40 + sn * 0.5 + ti * 0.05);
        ctx.beginPath();
        ctx.moveTo(tx, -BH * 0.785); ctx.lineTo(tx + BW * 0.018, -BH * 0.785);
        ctx.lineTo(tx + BW * 0.009, -BH * 0.762); ctx.closePath(); ctx.fill();
      }
    }

    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(hx + BW * 0.40, -BH * 0.86);
    ctx.quadraticCurveTo(hx + BW * (0.50), -BH * 0.885, hx + BW * (0.55), -BH * 0.84);
    ctx.lineTo(hx + BW * 0.51, -BH * 0.825);
    ctx.quadraticCurveTo(hx + BW * 0.44, -BH * 0.84, hx + BW * 0.40, -BH * 0.84);
    ctx.closePath(); ctx.fill();

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

  /* =====================================================================
     buildBody — STATIC body frame. In v3 this calls GAME.Archetypes.build()
     when the module is loaded, falling back to the local wyrm implementation
     when archetypes.js is absent (graceful degradation for incremental deploy).
     ===================================================================== */
  function buildBody(ctx, w, h, pal, base, frame, fsm, shape) {
    // Try GAME.Archetypes first (v3 path)
    if (G.Archetypes && typeof G.Archetypes.build === 'function') {
      G.Archetypes.build(ctx, w, h, pal, shape || { archetype: 'wyrm', plates: 9, tail: 1.0, bulk: 1.0 }, base, frame, fsm);
      return;
    }
    // Fallback: local wyrm implementation (identical to v2 buildBody)
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ANCHOR_X, ANCHOR_Y);

    var BH = h * 0.74;
    var BW = BH * 0.5;

    var walkT = (frame % 6) / 6;
    var step = Math.sin(walkT * Math.PI * 2);
    var bob = (fsm === 'walk') ? Math.abs(Math.sin(walkT * Math.PI * 2)) * BH * 0.018 : 0;
    var atk = (fsm === 'attack') ? Math.sin(Math.min(1, frame / 5) * Math.PI) : 0;
    var legSwing = (fsm === 'walk') ? step : 0;
    var fg = facingGeom(base);
    ctx.translate(0, -bob);

    // ground shadow (drawn under body)
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 2, BW * 0.95, BH * 0.05, 0, 0, 6.2832);
    ctx.fill();

    var skin = pal.skin, dark = pal.skinDark, light = pal.skinLight;

    drawTail(ctx, BH, BW, fg, dark);

    ctx.fillStyle = dark;
    drawLeg(ctx, fg.farLegX * BW, BH, BW, -legSwing, fg);

    ctx.fillStyle = dark;
    drawArm(ctx, fg.farArmX * BW, -BH * 0.5, BH, BW, fg, -1, atk);

    drawTorso(ctx, BH, BW, fg, skin, dark, light);

    ctx.save(); ctx.globalAlpha = 0.38; ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(fg.bellyX * BW, -BH * 0.34, BW * 0.20, BH * 0.16, 0.15 * fg.dir, 0, 6.2832);
    ctx.fill(); ctx.restore();

    drawPlates(ctx, BH, BW, fg, pal, false);

    ctx.fillStyle = skin;
    drawLeg(ctx, fg.nearLegX * BW, BH, BW, legSwing, fg);

    ctx.fillStyle = skin;
    drawArm(ctx, fg.nearArmX * BW, -BH * 0.5, BH, BW, fg, 1, atk);

    drawHead(ctx, BH, BW, fg, pal, atk);

    ctx.restore();
  }

  /* =====================================================================
     MOTE_FX — per-form mote drawing, keyed by palette.fxMotes.
     Each entry is fn(ctx, BH, BW, glowPhase, shimmer, pulse, pal).
     ===================================================================== */
  var MOTE_FX = {
    heat: function (ctx, BH, BW, glowPhase, shimmer, pulse, pal) {
      ctx.globalAlpha = 0.5 + shimmer * 0.3;
      ctx.strokeStyle = pal.plateEdge; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        var px = (i - 1) * BW * 0.18 + Math.sin(glowPhase * 4 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(px, -BH * 0.5);
        ctx.lineTo(px + Math.sin(glowPhase * 6 + i) * 5, -BH * 0.5 - BW * 0.22);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    pink: function (ctx, BH, BW, glowPhase, shimmer, pulse, pal) {
      ctx.fillStyle = pal.plateGlow; ctx.globalAlpha = 0.6;
      for (var p = 0; p < 4; p++) {
        var a = p * 1.7 + glowPhase * 2;
        var ix = Math.cos(a) * BW * 0.4, iy = -BH * 0.5 + Math.sin(a * 1.3) * BH * 0.25;
        var rr = ((Math.sin(glowPhase * 3 + p) + 1) * 0.5) * 3 + 1;
        ctx.beginPath(); ctx.arc(ix, iy, rr, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    cosmic: function (ctx, BH, BW, glowPhase, shimmer, pulse, pal) {
      ctx.fillStyle = 'rgba(210,150,255,0.95)'; ctx.globalAlpha = 0.85;
      for (var c = 0; c < 8; c++) {
        var aa = c * 1.7 + glowPhase;
        var cxp = Math.cos(aa) * BW * 0.42, cyp = -BH * 0.52 + Math.sin(aa * 1.3) * BH * 0.26;
        var cr = ((Math.sin(glowPhase * 3 + c) + 1) * 0.5) * 3 + 1;
        ctx.beginPath(); ctx.arc(cxp, cyp, cr, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 0.25 + pulse * 0.4;
      var hg = ctx.createRadialGradient(0, -BH * 0.5, 1, 0, -BH * 0.5, BW * 0.7);
      hg.addColorStop(0, 'rgba(255,255,255,0.9)');
      hg.addColorStop(1, 'rgba(160,90,255,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, -BH * 0.5, BW * 0.7, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
  };

  /* =====================================================================
     KAIJU UNIT FACTORY
     ===================================================================== */

  var PX_PER_TILE = TILE_W;
  var ACCEL = 1060 / PX_PER_TILE;     // +18% — keep pace with the wider city / faster smashing
  var MAX_SPEED = 260 / PX_PER_TILE;  // +18% roam speed so more separation isn't more walking
  var FRICTION = 12;
  var COLLIDE_R = 18 / PX_PER_TILE;
  var WALK_SPEED = 0.22;

  /* ------------ data-driven attack helpers ------------ */

  /* Attack cooldown: reads from form.attack.cooldown; falls back to legacy table. */
  function attackCooldownFor(kaiju) {
    var fd = formDefFor(kaiju.kind, kaiju.formId);
    if (fd && fd.attack && typeof fd.attack.cooldown === 'number') return fd.attack.cooldown;
    // v2 legacy fallback
    switch (kaiju.kind) {
      case 'rodan':    return 0.62;
      case 'mecha':    return 0.50;
      case 'mothra':   return 0.46;
      case 'ghidorah': return 0.42;
      default:         return 0.30;
    }
  }

  /* Re-fire GATE — how soon the NEXT attack may start. Decoupled from the attack
     animation length (attackCooldownFor): a short, clamped fraction so tapping/
     holding feels rapid and responsive without becoming mush. Tunable via Config. */
  function attackGateFor(kaiju) {
    var base = attackCooldownFor(kaiju);
    var scale = (Cfg.COOLDOWN_SCALE != null) ? Cfg.COOLDOWN_SCALE : 0.42;
    var floor = (Cfg.COOLDOWN_FLOOR != null) ? Cfg.COOLDOWN_FLOOR : 0.11;
    var cap = (Cfg.COOLDOWN_CAP != null) ? Cfg.COOLDOWN_CAP : 0.20;
    var g = base * scale;
    if (g < floor) g = floor;
    if (g > cap) g = cap;
    // Attack-Speed upgrade track: asymptotic reduction toward ATKSPD.FLOOR (Config-driven).
    // gate' = FLOOR + (gate - FLOOR) * DECAY^level. Level 0 leaves g untouched.
    var A = Cfg.ATKSPD;
    var lvl = (G.Economy && typeof G.Economy.atkSpeedLevel === 'number') ? G.Economy.atkSpeedLevel : 0;
    if (A && lvl > 0) g = A.FLOOR + (g - A.FLOOR) * Math.pow(A.DECAY, lvl);
    return g;
  }

  /* Number of direct targets: reads from form.attack.hits. */
  function targetCountFor(kaiju) {
    var fd = formDefFor(kaiju.kind, kaiju.formId);
    if (fd && fd.attack && typeof fd.attack.hits === 'number') return fd.attack.hits;
    // v2 fallback
    if (kaiju.kind === 'ghidorah') return 3;
    if (kaiju.kind === 'mecha')    return 5;
    return 1;
  }

  function Kaiju(opts) {
    opts = opts || {};
    this.kind = opts.kind || 'gz';
    this.formId = opts.formId || ((Cfg.FORMS && Cfg.FORMS[0]) ? Cfg.FORMS[0].id : (Cfg.EVOLUTIONS[0].id));
    this.pos = { wx: opts.wx != null ? opts.wx : GRID.cols * 0.5, wy: opts.wy != null ? opts.wy : -0.6, z: 0 };
    this.vel = { x: 0, y: 0 };
    this.velZ = 0;        // vertical (jump) velocity, world-units/s
    this.facing = 0;
    this.fsm = 'idle';
    this.walkPhase = 0;
    this.attackFrame = 0;
    this.attackT = 0;
    this.atkCooldown = 0;
    this.depthBias = 1;
    this.hurtT = 0;
    this._glowPhase = 0;
    this._flash = 0;
    this.aimBuilding = null;  // building the aim-highlight ring tracks (set in update)
    this._prevAttack = false;
    this._prevJump = false;   // edge detector for jump intent
    this.chargeT = 0;         // Nova Slam charge 0..1 (held); finisherCd gates re-fire
    this.finisherCd = 0;      // Nova Slam cooldown remaining (s)
    // Resolve palette from unified form def
    this._formDef = formDefFor(this.kind, this.formId);
    this.pal = paletteFromFormDef(this._formDef);
    this._formToken = (this.kind === 'gz') ? this.formId : this.kind;
  }

  Kaiju.prototype.setForm = function (id) {
    if (this.kind === 'gz') {
      this.formId = id;
      this._formToken = id;
    } else {
      this.kind = id;
      this._formToken = id;
    }
    this._formDef = formDefFor(this.kind, this._formToken);
    this.pal = paletteFromFormDef(this._formDef);
    this._flash = 1;
    FX.shake(8);
  };

  Kaiju.prototype.facingTo = function (wx, wy) {
    var dwx = wx - this.pos.wx, dwy = wy - this.pos.wy;
    if (Math.abs(dwx) < 1e-4 && Math.abs(dwy) < 1e-4) return this.facing;
    var sx = (dwx - dwy) * HALF_W;
    var sy = (dwx + dwy) * HALF_H;
    this.facing = headingToFacing(sx, sy);
    return this.facing;
  };

  function headingToFacing(sx, sy) {
    var ang = Math.atan2(sx, sy);
    if (ang < 0) ang += Math.PI * 2;
    var idx = Math.round(ang / (Math.PI / 4)) % 8;
    return idx;
  }

  Kaiju.prototype.screenAnchor = function (out) {
    out = out || { x: 0, y: 0 };
    projectInto(this.pos.wx, this.pos.wy, this.pos.z, out);
    return out;
  };

  Kaiju.prototype.bounds = function () {
    var w = 1.4, hgt = 3.2;
    return {
      wx: this.pos.wx, wy: this.pos.wy, z: this.pos.z,
      minWx: this.pos.wx - w * 0.5, maxWx: this.pos.wx + w * 0.5,
      minWy: this.pos.wy - w * 0.5, maxWy: this.pos.wy + w * 0.5,
      height: hgt
    };
  };

  /* True if the kaiju is airborne (pos.z > 0). */
  Kaiju.prototype.isAirborne = function () { return this.pos.z > 0.05; };

  function blockedAt(wx, wy) {
    if (!G.World || !G.World.footprintsNear) return false;
    var list = G.World.footprintsNear(wx, wy, 1.4);
    if (!list || !list.length) return false;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b) continue;
      if (b.state && b.state !== 'standing') continue;
      var fw = (b.footprint && b.footprint.w) ? b.footprint.w : 0.8;
      var fh = (b.footprint && b.footprint.h) ? b.footprint.h : 0.8;
      var halfX = fw * 0.5 + COLLIDE_R;
      var halfY = fh * 0.5 + COLLIDE_R;
      var cx = b.col + 0.5, cy = b.row + 0.5;
      if (Math.abs(wx - cx) < halfX && Math.abs(wy - cy) < halfY) return true;
    }
    return false;
  }

  /* =====================================================================
     UPDATE
     ===================================================================== */
  Kaiju.prototype.update = function (dt, intent) {
    if (dt > 0.05) dt = 0.05;
    intent = intent || EMPTY_INTENT;

    if (this._flash > 0) this._flash = Math.max(0, this._flash - dt * 1.8);
    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.atkCooldown > 0) this.atkCooldown -= dt;
    if (this.finisherCd > 0) this.finisherCd -= dt;
    this._glowPhase += dt;

    // ---- JUMP kinematics (pos.z, velZ) ----
    var JUMP = Cfg.JUMP || { vEscape: 8.5, gravity: 26 };
    var jumpEdge = !!intent.jump && !this._prevJump;
    this._prevJump = !!intent.jump;
    if (jumpEdge && !this.isAirborne()) {
      this.velZ = JUMP.vEscape;
    }
    if (this.isAirborne() || this.velZ > 0) {
      this.velZ -= JUMP.gravity * dt;
      this.pos.z += this.velZ * dt;
      if (this.pos.z < 0) { this.pos.z = 0; this.velZ = 0; }
    }

    // ---- Nova Slam charge / release (finisher) ----
    // Hold → charge toward 1; release → fireFinisher (which sets finisherCd, so the
    // up-to-5 substeps that share one intent can't double-fire). Cancel (pointercancel /
    // blur / shop) silently drops the charge. NEVER touches atkCooldown — autofire is
    // an independent loop. fireFinisher borrows only the attack POSE.
    var FIN = Cfg.FINISHER;
    var ownFin = !!(G.Economy && G.Economy.finisherOwned);
    var canCharge = !!(FIN && ownFin && intent.charge && this.finisherCd <= 0);
    if (canCharge) {
      this.chargeT = Math.min(1, this.chargeT + dt / FIN.CHARGE_S);
      this._flash = Math.max(this._flash, 0.25 + 0.35 * this.chargeT); // charging glow
    } else if (FIN && ownFin && intent.chargeRelease && this.finisherCd <= 0) {
      this.fireFinisher(Math.max(FIN.MIN_CHARGE, this.chargeT));
      this.chargeT = 0;
    } else if (this.chargeT > 0 && !intent.charge) {
      this.chargeT = 0;   // cancelled (no release latch — pointercancel/blur/shop)
    }

    // ---- horizontal locomotion ----
    var mx = intent.moveX || 0, my = intent.moveY || 0;
    var moveMag = Math.hypot(mx, my);
    if (moveMag > 1) { mx /= moveMag; my /= moveMag; moveMag = 1; }

    // Move-Speed upgrade track: scale ACCEL + MAX_SPEED by the cached economy multiplier
    // (×1 at level 0). Cached → no per-frame Math.pow. Charging Nova Slam slows you ×FIN.SLOW.
    var spdMult = (G.Economy && G.Economy.moveSpeedMult) ? G.Economy.moveSpeedMult() : 1;
    if (canCharge) spdMult *= FIN.SLOW;
    var accel = ACCEL * spdMult, maxSp = MAX_SPEED * spdMult;

    if (moveMag > 0.001) {
      this.vel.x += mx * accel * dt;
      this.vel.y += my * accel * dt;
    }
    var fr = Math.exp(-FRICTION * dt);
    this.vel.x *= fr; this.vel.y *= fr;
    var sp = Math.hypot(this.vel.x, this.vel.y);
    if (sp > maxSp) { var ks = maxSp / sp; this.vel.x *= ks; this.vel.y *= ks; sp = maxSp; }

    var dwx = this.vel.x * dt, dwy = this.vel.y * dt;
    var hadInput = moveMag > 0.001;

    var cols = GRID.cols;
    var frontier = (G.World && G.World.maxReachedRow != null) ? G.World.maxReachedRow : GRID.rows - 1;
    var loX = 0.5, hiX = cols - 0.5;
    var loY = -1.0, hiY = GRID.rows - 0.5;

    var preX = this.pos.wx, preY = this.pos.wy;
    var wedged = blockedAt(preX, preY);

    var nx = clamp(preX + dwx, loX, hiX);
    if (wedged || !blockedAt(nx, this.pos.wy)) { this.pos.wx = nx; }
    else { this.vel.x *= 0.2; }

    var ny = clamp(preY + dwy, loY, hiY);
    if (wedged || !blockedAt(this.pos.wx, ny)) { this.pos.wy = ny; }
    else { this.vel.y *= 0.2; }

    if (G.World) {
      var reachedRow = Math.min(Math.floor(this.pos.wy), frontier);
      if (G.World.maxReachedRow == null || reachedRow > G.World.maxReachedRow) {
        if (typeof G.World.advanceFrontier === 'function') G.World.advanceFrontier(reachedRow);
        else G.World.maxReachedRow = Math.max(G.World.maxReachedRow || 0, reachedRow);
      }
    }

    // Take facing from movement ONLY when not mid-attack — so while blasting he faces
    // the TARGET (set by startAttack→facingTo), not his walk direction. (startAttack
    // runs after this each fire; this keeps the attack facing steady between shots
    // during autofire instead of flickering back to the movement heading.)
    if (sp > WALK_SPEED && this.attackT <= 0) {
      if (G.Input && typeof G.Input.facing === 'number') {
        this.facing = G.Input.facing;
      } else {
        var hsx = (this.vel.x - this.vel.y) * HALF_W;
        var hsy = (this.vel.x + this.vel.y) * HALF_H;
        this.facing = headingToFacing(hsx, hsy);
      }
    }

    var moving = sp > WALK_SPEED;
    if (this.attackT > 0) {
      this.attackT -= dt;
      this.fsm = 'attack';
      var dur = this._attackDur || 0.34;
      this.attackFrame = clamp(Math.floor((1 - this.attackT / dur) * 6), 0, 5);
      if (this.attackT <= 0) { this.fsm = (moving ? 'walk' : 'idle'); this.attackFrame = 0; }
    } else if (this.hurtT > 0) {
      this.fsm = 'hurt';
    } else {
      this.fsm = moving ? 'walk' : 'idle';
    }

    if (this.fsm === 'walk') {
      this.walkPhase += dt * (1.4 + sp / maxSp * 1.6);
      if (this.walkPhase >= 1) this.walkPhase -= 1;
    } else if (this.fsm === 'idle') {
      this.walkPhase = 0;
    }

    // Level-triggered (not edge): fire whenever attack is held/tapped AND the
    // re-fire gate is open. Enables hold-to-autofire + rapid tapping, and no longer
    // waits for the attack ANIMATION (attackT) to finish, so smashes are interruptible.
    this._prevAttack = !!intent.attack;
    if (intent.attack && this.atkCooldown <= 0) {
      this.fireAttack(intent.target);
    }

    // Track the building we'd hit next for the aim-highlight ring. Recompute
    // only when not mid-attack so the ring holds steady through a smash instead
    // of flickering off (the rendered ring re-checks state==='standing').
    if (this.attackT <= 0) this.aimBuilding = this.aimTarget();
  };

  var EMPTY_INTENT = { moveX: 0, moveY: 0, attack: false, target: null, jump: false, charge: false, chargeRelease: false };

  Kaiju.prototype.fireAttack = function (targetCell) {
    var targets = this.acquireTargets(targetCell);
    this.startAttack(targets);
  };

  /* acquireTargets: as before, but when airborne also include flying buildings. */
  Kaiju.prototype.acquireTargets = function (targetCell) {
    var primary = null;
    var W = G.World;
    if (!W) return [];

    var airborne = this.isAirborne();

    // 1) explicit target (ground building OR an aimed flyer/plane)
    if (targetCell && (W.getTargetAt || W.getBuildingAt)) {
      var tb = W.getTargetAt ? W.getTargetAt(targetCell.col, targetCell.row)
                             : W.getBuildingAt(targetCell.col, targetCell.row);
      if (tb && (tb.state === 'standing')) {
        // allow flying target if airborne, or ground target if on ground
        if (airborne ? (tb.flying) : true) primary = tb;
        if (!primary && !airborne && tb.state === 'standing') primary = tb; // ground always ok
      }
    }

    // 2) faced building
    if (!primary) {
      var fwd = facingToWorldVec(this.facing);
      var ax = this.pos.wx + fwd.wx * 0.7;
      var ay = this.pos.wy + fwd.wy * 0.7;
      if (W.getBuildingAt) {
        var fb = W.getBuildingAt(Math.floor(ax), Math.floor(ay));
        if (fb && fb.state === 'standing') {
          if (!airborne || fb.flying) primary = fb;
        }
      }
    }

    // 3) nearest standing (on ground: prefer ground; airborne: prefer flying)
    //    Band widened 2.2→2.6 for a more forgiving "grab what's near me" pick.
    var near = (W.footprintsNear ? W.footprintsNear(this.pos.wx, this.pos.wy, 2.6) : []) || [];
    if (!primary) {
      var best = null, bestD = Infinity;
      for (var i = 0; i < near.length; i++) {
        var b = near[i];
        if (!b || b.state !== 'standing') continue;
        // airborne: prefer flying targets; fall back to any if none
        if (airborne && !b.flying) continue;
        var dx = (b.col + 0.5) - this.pos.wx, dy = (b.row + 0.5) - this.pos.wy;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = b; }
      }
      // if airborne and no flying targets found, fall back to ground targets
      if (!best && airborne) {
        for (var ii = 0; ii < near.length; ii++) {
          var bb = near[ii];
          if (!bb || bb.state !== 'standing') continue;
          var ddx = (bb.col + 0.5) - this.pos.wx, ddy = (bb.row + 0.5) - this.pos.wy;
          var dd = ddx * ddx + ddy * ddy;
          if (dd < bestD) { bestD = dd; best = bb; }
        }
      }
      primary = best;
    }
    if (!primary) return [];

    var n = targetCountFor(this);
    if (n <= 1) return [primary];

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

  /* Lightweight primary-target pick for the aim highlight ring — mirrors steps
     2-3 of acquireTargets (faced building, else nearest standing) but allocates
     nothing and skips the multi-target sort. Returns a ground building or null.
     (Airborne aims at planes — no ground ring then.) */
  Kaiju.prototype.aimTarget = function () {
    var W = G.World;
    if (!W || this.isAirborne()) return null;

    var fwd = facingToWorldVec(this.facing);
    if (W.getBuildingAt) {
      var fb = W.getBuildingAt(Math.floor(this.pos.wx + fwd.wx * 0.7), Math.floor(this.pos.wy + fwd.wy * 0.7));
      if (fb && fb.state === 'standing' && !fb.flying) return fb;
    }
    var near = (W.footprintsNear ? W.footprintsNear(this.pos.wx, this.pos.wy, 2.6) : []) || [];
    var best = null, bestD = Infinity;
    for (var i = 0; i < near.length; i++) {
      var b = near[i];
      if (!b || b.state !== 'standing' || b.flying) continue;
      var dx = (b.col + 0.5) - this.pos.wx, dy = (b.row + 0.5) - this.pos.wy;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  };

  /* ------------- data-driven targetCount / cooldown passthrough ------------- */
  Kaiju.prototype.targetCount = function () { return targetCountFor(this); };
  Kaiju.prototype.attackCooldownFor = function () { return attackCooldownFor(this); };

  function facingToWorldVec(facing) {
    var ang = facing * (Math.PI / 4);
    var sx = Math.sin(ang), sy = Math.cos(ang);
    var wx = (sx / HALF_W + sy / HALF_H) * 0.5;
    var wy = (sy / HALF_H - sx / HALF_W) * 0.5;
    var m = Math.hypot(wx, wy) || 1;
    return { wx: wx / m, wy: wy / m };
  }

  /* =====================================================================
     ATTACK_KINDS — 5 attack-signature implementations, keyed by kind string.
     startAttack reads form.attack.kind to dispatch (no more if/else chain).
     ===================================================================== */
  function fireBeam(kaiju, targets, power, atkDef) {
    var b = targets[0];
    var pal = kaiju.pal;
    var mz = kaiju.muzzle({ x: 0, y: 0 });
    if (b) {
      var bs = buildingScreen(b, { x: 0, y: 0 });
      FX.beam(mz.x, mz.y, bs.x, bs.y, pal.breath[1] || '#fff', pal.breath[0] || '#9bdcff', pal.breathGlow, 9);
      dealDamage(b, power);
    } else {
      var fwd = facingToWorldVec(kaiju.facing);
      projectInto(kaiju.pos.wx + fwd.wx * 2, kaiju.pos.wy + fwd.wy * 2, 0.5, _proj);
      FX.beam(mz.x, mz.y, _proj.x, _proj.y, pal.breath[1] || '#fff', pal.breath[0] || '#9bdcff', pal.breathGlow, 8);
    }
    FX.shake(atkDef && atkDef.shake != null ? atkDef.shake : 3.2);
  }

  function fireBolts(kaiju, targets, power, atkDef) {
    var pal = kaiju.pal;
    var mz = kaiju.muzzle({ x: 0, y: 0 });
    var boltsCol = (atkDef && atkDef.color === 'eye') ? pal.eye : (pal.eye);
    for (var i = 0; i < targets.length; i++) {
      var b = targets[i];
      var bs = buildingScreen(b, { x: 0, y: 0 });
      FX.bolt(mz.x + (i - 1) * 10, mz.y, bs.x, bs.y, boltsCol, pal.plateGlow);
      dealDamage(b, power);
    }
    FX.shake(atkDef && atkDef.shake != null ? atkDef.shake : 6);
  }

  function fireCloud(kaiju, targets, power, atkDef) {
    var b = targets[0];
    var pal = kaiju.pal;
    var mz = kaiju.muzzle({ x: 0, y: 0 });
    // dot config: read from atkDef, fall back to form's attack.dot, then legacy TITANS
    var dotDef = (atkDef && atkDef.dot) || null;
    if (!dotDef) {
      // fallback: legacy TITANS mothra dot
      var titanM = Cfg.TITANS ? Cfg.TITANS.find(function (t) { return t.id === 'mothra'; }) : null;
      dotDef = titanM ? titanM.dot : null;
    }
    if (b) {
      var bs = buildingScreen(b, { x: 0, y: 0 });
      var puffN = REDUCED ? 2 : 5;
      for (var i = 0; i < puffN; i++) {
        var tt = i / (puffN - 1 || 1);
        FX.powder(lerp(mz.x, bs.x, tt), lerp(mz.y, bs.y, tt), pal.breath[0] || '#6fe0ff');
      }
      var tickFrac = dotDef ? dotDef.frac : 0.06;
      var ticks = dotDef ? dotDef.ticks : 10;
      var intervalMs = dotDef ? (dotDef.intervalMs || 300) : 300;
      var perTick = Math.max(1, Math.round((b.maxHp || power) * tickFrac));
      applyDot(b, perTick, ticks, intervalMs);
      dealDamage(b, Math.round(power * 0.4));
    }
    FX.shake(atkDef && atkDef.shake != null ? atkDef.shake : 3.5);
  }

  function fireDive(kaiju, targets, power, atkDef) {
    var pal = kaiju.pal;
    var center = targets[0];
    var ccol, crow;
    if (center) { ccol = center.col + 0.5; crow = center.row + 0.5; }
    else {
      var fwd = facingToWorldVec(kaiju.facing);
      ccol = kaiju.pos.wx + fwd.wx * 0.8; crow = kaiju.pos.wy + fwd.wy * 0.8;
    }
    projectInto(ccol, crow, 0, _proj);
    var cx = _proj.x, cy = _proj.y;

    // read aoe radius from atkDef, then legacy TITANS
    var radius = (atkDef && atkDef.aoeRadius) ? atkDef.aoeRadius : 0;
    if (!radius) {
      var titanR = Cfg.TITANS ? Cfg.TITANS.find(function (t) { return t.id === 'rodan'; }) : null;
      radius = (titanR && titanR.aoe) ? titanR.aoe.radius : 2.2;
    }

    FX.shockwave(cx, cy, radius * TILE_W * 0.9, pal.eye);
    FX.shake(REDUCED ? 0 : (atkDef && atkDef.shake != null ? atkDef.shake : 9));
    FX.debris({ col: Math.floor(ccol), row: Math.floor(crow), height: 1, style: null });

    var near = (G.World && G.World.footprintsNear) ? G.World.footprintsNear(ccol, crow, radius + 1) : [];
    for (var i = 0; i < near.length; i++) {
      var b = near[i];
      if (!b || b.state !== 'standing') continue;
      var dx = (b.col + 0.5) - ccol, dy = (b.row + 0.5) - crow;
      if (dx * dx + dy * dy <= radius * radius) {
        var dist = Math.sqrt(dx * dx + dy * dy);
        var falloff = lerp(1, 0.55, clamp(dist / radius, 0, 1));
        dealDamage(b, Math.round(power * falloff));
      }
    }
  }

  function fireVolley(kaiju, targets, power, atkDef) {
    var pal = kaiju.pal;
    var mz = kaiju.muzzle({ x: 0, y: 0 });
    for (var i = 0; i < targets.length; i++) {
      var b = targets[i];
      var bs = buildingScreen(b, { x: 0, y: 0 });
      FX.missile(mz.x + (i - 2) * 6, mz.y, bs.x, bs.y, pal.eye);
      dealDamage(b, power);
    }
    FX.shake(REDUCED ? 0 : (atkDef && atkDef.shake != null ? atkDef.shake : 7));
  }

  /* Public registry — archetypes/external callers can read this. */
  var ATTACK_KINDS = {
    beam:   fireBeam,
    bolts:  fireBolts,
    cloud:  fireCloud,
    dive:   fireDive,
    volley: fireVolley
  };

  /* =====================================================================
     startAttack — data-driven dispatch via form.attack.kind
     ===================================================================== */
  Kaiju.prototype.startAttack = function (targets) {
    targets = targets || [];
    var fd = this._formDef || formDefFor(this.kind, this.formId);
    var atkDef = (fd && fd.attack) ? fd.attack : {};
    var kindStr = atkDef.kind || 'beam';

    var animDur = attackCooldownFor(this);
    this._attackDur = animDur;
    this.attackT = animDur;                  // visual pose length (per-form; interruptible)
    this.atkCooldown = attackGateFor(this);  // re-fire gate — short + decoupled from the anim
    this.attackFrame = 0;
    this.fsm = 'attack';

    if (targets.length && targets[0]) {
      this.facingTo(targets[0].col + 0.5, targets[0].row + 0.5);
      // Track the building we're ACTUALLY attacking (close, ranged, or autofire) so the
      // top HP bar + aim ring follow it. Without this, aimBuilding only refreshed when
      // attackT<=0 (never, under rapid autofire) and only tracked faced/nearest — so the
      // bar went stale / showed the wrong building when zapping at range.
      this.aimBuilding = targets[0];
    }

    // Crisp per-smash thud — ONE per attack action (not per target: a 5-6 missile
    // volley calling smash() per hit would clip at the same currentTime). This is
    // the per-hit sound that was previously unwired (only crumble fired, on destroy).
    if (targets.length && G.Audio && typeof G.Audio.smash === 'function') G.Audio.smash();

    var power = (G.Economy && G.Economy.attackPower) ? G.Economy.attackPower() : Cfg.START_ATTACK;

    var attackFn = ATTACK_KINDS[kindStr];
    if (typeof attackFn === 'function') {
      attackFn(this, targets, power, atkDef);
    } else {
      // unknown kind — default to beam
      fireBeam(this, targets, power, atkDef);
    }
  };

  /* =====================================================================
     fireFinisher — Nova Slam charged AoE. PARALLEL to startAttack: it borrows
     the attack pose but NEVER touches atkCooldown (the autofire loop is undisturbed).
     Epicenter ~1.2 tiles ahead of facing (kaiju sits inside the ring; damage circle
     leans into the unsmashed buildings). Modeled on fireDive. charge ∈ [MIN_CHARGE,1].
     ===================================================================== */
  Kaiju.prototype.fireFinisher = function (charge) {
    var FIN = Cfg.FINISHER;
    this.finisherCd = FIN.COOLDOWN_S;        // set FIRST → self-consuming across substeps
    // Borrow the attack pose only (does NOT gate autofire via atkCooldown).
    this._attackDur = 0.4; this.attackT = 0.4; this.attackFrame = 0; this.fsm = 'attack';

    var pal = this.pal;
    var fwd = facingToWorldVec(this.facing);
    var ccol = this.pos.wx + fwd.wx * 1.2, crow = this.pos.wy + fwd.wy * 1.2;
    projectInto(ccol, crow, 0, _proj);
    var cx = _proj.x, cy = _proj.y;
    var radius = lerp(FIN.RADIUS_T, FIN.RADIUS_MAX_T, charge);

    // FX — bigger than a dive: a double shockwave, scaled shake/flash, debris, hit-stop.
    FX.shockwave(cx, cy, radius * TILE_W * 0.9, pal.plateEdge || pal.eye);
    FX.shockwave(cx, cy, radius * TILE_W * 1.25, pal.eye);
    FX.shake(REDUCED ? 0 : FIN.SHAKE * (0.5 + 0.5 * charge));
    FX.debris({ col: Math.floor(ccol), row: Math.floor(crow), height: 1.5, style: null });
    FX.screenFlash(0.15 + 0.15 * charge);
    FX.hitStop(50);
    if (G.Audio && typeof G.Audio.finisher === 'function') G.Audio.finisher(charge);

    // AoE damage with distance falloff (fireDive pattern). Money/combo flow through
    // dealDamage → World.hitBuilding → bankDestroy automatically.
    var power = (G.Economy && G.Economy.attackPower) ? G.Economy.attackPower() : Cfg.START_ATTACK;
    var dmgMult = FIN.DMG_MIN + (FIN.DMG_MAX - FIN.DMG_MIN) * charge;
    var near = (G.World && G.World.footprintsNear) ? G.World.footprintsNear(ccol, crow, radius + 1) : [];
    for (var i = 0; i < near.length; i++) {
      var b = near[i];
      if (!b || b.state !== 'standing') continue;
      var dx = (b.col + 0.5) - ccol, dy = (b.row + 0.5) - crow;
      if (dx * dx + dy * dy <= radius * radius) {
        var dist = Math.sqrt(dx * dx + dy * dy);
        var falloff = lerp(1, 0.55, clamp(dist / radius, 0, 1));
        dealDamage(b, Math.round(power * dmgMult * falloff));
      }
    }
  };

  /* Legacy instance-method aliases (still work for any external callers). */
  Kaiju.prototype.sigAtomicBreath = function (t, p) { fireBeam(this, t, p, {}); };
  Kaiju.prototype.sigGoldBolts    = function (t, p) { fireBolts(this, t, p, {}); };
  Kaiju.prototype.sigPowder       = function (t, p) { fireCloud(this, t, p, {}); };
  Kaiju.prototype.sigDive         = function (t, p) { fireDive(this, t, p, {}); };
  Kaiju.prototype.sigMissiles     = function (t, p) { fireVolley(this, t, p, {}); };

  /* muzzle position */
  var _muz = { x: 0, y: 0 };
  // Muzzle = the MOUTH on screen. Must match the breath-glow drawn in drawGlow()
  // EXACTLY: local mouth = ( headX·BW + BW·(0.5+snout), -BH·0.77 ), scaled by
  // drawScale() and mirrored for facings 5-7. (The old version used a crude fixed
  // ±22 side-offset + fixed head height that ignored per-facing geometry and broke
  // when the tile/sprite scale changed — beam appeared to leave the back.)
  Kaiju.prototype.muzzle = function (out) {
    out = out || _muz;
    projectInto(this.pos.wx, this.pos.wy, this.pos.z, out);  // (sx,sy) at the sprite anchor
    var scale = this.drawScale();
    var BH = SPR_H * 0.74, BW = BH * 0.5;
    var fm = FACING_MAP[this.facing & 7];
    var fg = facingGeom(fm.base);
    var lx = (fg.headX * BW) + BW * (0.5 + fg.snout);
    out.x += (fm.mir ? -1 : 1) * scale * lx;
    out.y += scale * (-BH * 0.77);
    return out;
  };

  function buildingScreen(b, out) {
    out = out || { x: 0, y: 0 };
    // Flyers (planes) sit at altitude — aim the beam UP to the sprite, not the ground.
    var wz = (b.flying && b.altitude != null) ? b.altitude : (b.height || 1) * 0.45;
    projectInto(b.col + 0.5, b.row + 0.5, wz, out);
    return out;
  }

  function dealDamage(b, raw) {
    if (!b) return;
    if (raw < 1) raw = 1;
    raw = Math.floor(raw);   // prevent 32-bit truncation on very large floats
    FX.spawnDamageText(b, raw);
    if (G.World && G.World.hitBuilding) G.World.hitBuilding(b, raw);
  }

  function applyDot(b, perTick, ticks, intervalMs) {
    if (!b) return;
    if (G.World && typeof G.World.applyDot === 'function') {
      G.World.applyDot(b, { perTick: perTick, ticks: ticks, intervalMs: intervalMs || 300 });
    } else {
      b.dot = { perTick: perTick, ticks: ticks, intervalMs: intervalMs || 300, acc: 0 };
    }
  }

  /* =====================================================================
     DRAW — cached static body + LIVE glow
     ===================================================================== */

  var SCALE_BUCKETS = [1.0];
  function bucketScale(scaleBucket) {
    if (typeof scaleBucket === 'number') return scaleBucket;
    return 1.0;
  }

  Kaiju.prototype.drawScale = function () {
    var gz = Cfg.GZ; if (!gz) return 1;
    if (this.kind !== 'gz') return gz.titanScale || 1.5;
    // v3: find index in FORMS (wyrm family); fall back to EVOLUTIONS
    if (Cfg.FORMS) {
      var wyrmForms = Cfg.FORMS.filter(function (f) { return f.family === 'wyrm'; });
      for (var fi = 0; fi < wyrmForms.length; fi++) {
        if (wyrmForms[fi].id === this.formId) {
          return (gz.baseScale || 1.5) * Math.pow(gz.evoGrowth || 1.15, fi);
        }
      }
    }
    // v2 fallback
    var ei = 0;
    for (var i = 0; i < (Cfg.EVOLUTIONS || []).length; i++) {
      if (Cfg.EVOLUTIONS[i].id === this.formId) { ei = i; break; }
    }
    return (gz.baseScale || 1.5) * Math.pow(gz.evoGrowth || 1.15, ei);
  };

  /* drawShadow(ctx, sx, sy, scale) — ground contact ellipse.
     Render calls this BEFORE drawing the kaiju so the shadow sits underneath. */
  Kaiju.prototype.drawShadow = function (ctx, sx, sy, scaleBucket) {
    var scale = bucketScale(scaleBucket) * this.drawScale();
    var BH = SPR_H * 0.74 * scale;
    var BW = BH * 0.5;
    // project foot to screen; scale determines how far below the sprite centre
    var alpha = this.isAirborne() ? clamp(0.55 - this.pos.z * 0.04, 0.08, 0.55) : 0.32;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, BW * 0.90, BH * 0.05, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  };

  Kaiju.prototype.draw = function (ctx, sx, sy, scaleBucket) {
    var scale = bucketScale(scaleBucket) * this.drawScale();
    var fm = FACING_MAP[this.facing & 7];
    var base = fm.base, mir = fm.mir;

    var frame;
    if (this.fsm === 'attack') frame = this.attackFrame;
    else if (this.fsm === 'walk') frame = Math.floor(this.walkPhase * 6) % 6;
    else frame = 0;

    var token = this._formToken;
    var fd = this._formDef || formDefFor(this.kind, this.formId);
    var shape = (fd && fd.shape) ? fd.shape : { archetype: 'wyrm', plates: 9, tail: 1.0, bulk: 1.0 };
    var key = 'kj:' + token + ':' + base + ':' + this.fsm + ':' + frame + ':' + (scale === 1 ? '1' : ('' + scale));
    var pal = this.pal;
    var cv = bakeOrGet(key, SPR_W, SPR_H, makeBodyBuilder(pal, base, frame, this.fsm, shape));

    var dw = SPR_W * scale, dh = SPR_H * scale;
    var ox = sx - ANCHOR_X * scale;
    var oy = sy - ANCHOR_Y * scale;

    ctx.save();
    if (mir) {
      ctx.translate(sx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-sx, 0);
    }
    if (cv) ctx.drawImage(cv, ox, oy, dw, dh);

    if (this._flash > 0.001 && cv) {
      ctx.save();
      ctx.globalAlpha = this._flash * 0.75;
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(cv, ox, oy, dw, dh);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(ox + ANCHOR_X * scale, oy + ANCHOR_Y * scale);
    ctx.scale(scale, scale);
    this.drawGlow(ctx, base, frame);
    ctx.restore();

    ctx.restore();
  };

  function makeBodyBuilder(pal, base, frame, fsm, shape) {
    return function (ctx, w, h) {
      ctx.imageSmoothingEnabled = false;
      buildBody(ctx, w, h, pal, base, frame, fsm, shape);
    };
  }

  /* LIVE glow overlay — drawGlow now reads palette.fxMotes (v3) with pal.fx alias (v2). */
  Kaiju.prototype.drawGlow = function (ctx, base, frame) {
    var pal = this.pal;
    var BH = SPR_H * 0.74;
    var BW = BH * 0.5;
    var fg = facingGeom(base);

    var prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'screen';

    var shimmer = (Math.sin(this._glowPhase * 3.0) + 1) * 0.5;
    var pulse   = (Math.sin(this._glowPhase * 1.6) + 1) * 0.5;

    // aura halo
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

    drawPlates(ctx, BH, BW, fg, pal, true, shimmer);

    if (fg.show !== 'back' && fg.show !== 'back34') {
      var hx = fg.headX * BW;
      ctx.globalAlpha = 0.55 + shimmer * 0.45;
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.arc(hx + BW * 0.47, -BH * 0.842, BW * 0.06, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

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

    // MOTE_FX dispatch: read fxMotes (v3), fall back to fx (v2 alias)
    var motesKey = pal.fxMotes || pal.fx || null;
    if (motesKey && MOTE_FX[motesKey]) {
      MOTE_FX[motesKey](ctx, BH, BW, this._glowPhase, shimmer, pulse, pal);
    }

    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = 1;
  };

  Kaiju.prototype.depthKey = function () {
    if (G.iso && G.iso.depthKey) return G.iso.depthKey(this);
    return (this.pos.wx + this.pos.wy) * 1024 + (this.pos.z || 0) * 4 + this.depthBias;
  };

  /* =====================================================================
     PUBLIC FACTORY + EXPORTS
     ===================================================================== */
  var Kaiju_ns = {
    create: function (opts) { return new Kaiju(opts); },
    SPR_W: SPR_W, SPR_H: SPR_H, ANCHOR_X: ANCHOR_X, ANCHOR_Y: ANCHOR_Y,
    headingToFacing: headingToFacing,
    ATTACK_KINDS: ATTACK_KINDS,
    MOTE_FX: MOTE_FX,
    FACING_MAP: FACING_MAP,
    // Wyrm drawing helpers exposed for archetypes.js
    _wyrmHelpers: {
      facingGeom: facingGeom,
      drawTail: drawTail,
      drawLeg: drawLeg,
      drawArm: drawArm,
      drawTorso: drawTorso,
      drawPlates: drawPlates,
      drawHead: drawHead,
      SPR_W: SPR_W, SPR_H: SPR_H,
      ANCHOR_X: ANCHOR_X, ANCHOR_Y: ANCHOR_Y
    }
  };

  G.Kaiju = Kaiju_ns;

})(window.GAME);
