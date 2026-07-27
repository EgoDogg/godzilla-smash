/* =====================================================================
   StyleForge candidate A · style-boxstack.js  —  "Iso Box-Stack"
   ---------------------------------------------------------------------
   SHIPPING CODE. If this style wins, register `build` in the game's
   archetype dispatch (js/archetypes.js Archetypes.build) unchanged.

   Dependencies: window.GAME.Utils ONLY (shade / clamp / lerp). No DOM, no
   Assets, no harness glue — the same dependency budget archetypes.js has.

   THE IDEA
   Each species is a stack of axis-aligned boxes in BODY SPACE
   (+x = forward/snout, +y = the creature's LEFT, +z = up). The stack is
   rotated about the vertical axis per facing (S=0 SE=45 E=90 NE=135 N=180),
   projected with the SAME 2:1 iso foreshortening the city prisms use, then
   painter-sorted and drawn as iso prisms with EXACTLY the city's three flat
   tones (U.shade 0.74 shadow-side / 1.12 lit-side / 1.32 top) plus 1px
   U.shade(...,0.5) edge strokes — assets.js drawPrismBuilding:305-309.

   BAKE GUARDRAILS honoured (archetypes.js §1.6):
     · no shadowBlur, no ctx.filter, no globalCompositeOperation
     · no Math.random — per-index jitter uses the deterministic hash()
     · fixed 150x168 canvas, anchor (75, 144.5)
   ===================================================================== */
window.STYLEFORGE = window.STYLEFORGE || { styles: {} };

(function (SF) {
  'use strict';

  var U = (window.GAME && window.GAME.Utils) || null;
  function shade(hex, f) {
    if (U && U.shade) return U.shade(hex, f);
    return hex;                                  // degrade, never throw
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* deterministic per-index jitter (archetypes.js §1.6 hash) */
  function hash(i) { var s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); }

  /* ---- sprite contract (entities.js:330-332) ------------------------- */
  var SPR_W = 150, SPR_H = 168;
  var ANCHOR_X = SPR_W * 0.5;     // 75
  var ANCHOR_Y = SPR_H * 0.86;    // 144.48

  /* ---- projection --------------------------------------------------- *
   * Identical shape to iso.js worldToScreen: x=(wx-wy)*HW, y=(wx+wy)*HH-wz*WZ
   * with HH = HW/2 (the 2:1 city foreshortening). KZ is the per-unit rise.
   * Tuned so a 5.8-unit-long body fills the 150px plate at E facing and a
   * ~2.3-unit-tall body reads ~97px — dinosaurs are long, not tall.        */
  var KX = 17, KY = 8.5, KZ = 42;

  /* body heading angle: base 0..4 -> S, SE, E, NE, N.
     phi = (1-base)*45deg puts forward at world (1,1) for S (screen-down),
     (1,0) for SE, (1,-1) for E (screen-right), (0,-1) for NE, (-1,-1) for N. */
  function phiFor(base) { return (1 - clamp(base | 0, 0, 4)) * (Math.PI / 4); }

  /* ---- palette tone keys -------------------------------------------- */
  function toneColor(pal, key) {
    switch (key) {
      case 'dark': return pal.skinDark;
      case 'light': return pal.skinLight;
      case 'plate': return pal.plate || pal.skinDark;
      case 'edge': return pal.plateEdge || pal.skinLight;
      case 'eye': return pal.eye || '#e8e8e8';
      default: return pal.skin;
    }
  }

  /* =====================================================================
     SPECIES GEOMETRY (internal to this style)
     Box = { x,y,z centre · sx,sy,sz full size · t tone key
             · tp taper (top face scale, 1 = box) · g group · pv leg pivot
             · ph gait phase · e edge tone override }
     ===================================================================== */
  function B(x, y, z, sx, sy, sz, t, o) {
    var b = { x: x, y: y, z: z, sx: sx, sy: sy, sz: sz, t: t || 'skin', tp: 1, g: null, pv: null, ph: 0, e: null };
    if (o) for (var k in o) b[k] = o[k];
    return b;
  }

  /* --- T-REX · biped, long counterweight tail (19 boxes) -------------- */
  function trexBoxes() {
    return [
      B(-0.20, 0, 1.00, 1.05, 0.86, 0.80, 'skin'),
      B(0.62, 0, 1.10, 0.95, 0.80, 0.80, 'skin'),
      B(1.35, 0, 1.20, 0.65, 0.66, 0.68, 'light'),
      B(1.80, 0, 1.52, 0.50, 0.44, 0.50, 'skin', { g: 'head' }),
      B(2.26, 0, 1.82, 0.88, 0.58, 0.52, 'skin', { g: 'head' }),
      B(2.82, 0, 1.80, 0.52, 0.44, 0.34, 'light', { g: 'head', tp: 0.78 }),
      B(2.50, 0, 1.52, 0.94, 0.42, 0.20, 'dark', { g: 'jaw' }),
      B(2.30, 0, 2.11, 0.46, 0.62, 0.14, 'edge', { g: 'head' }),
      B(2.48, 0.29, 1.96, 0.20, 0.12, 0.17, 'eye', { g: 'head' }),
      B(2.48, -0.29, 1.96, 0.20, 0.12, 0.17, 'eye', { g: 'head' }),
      B(1.42, 0.38, 1.02, 0.22, 0.20, 0.44, 'dark'),
      B(1.42, -0.38, 1.02, 0.22, 0.20, 0.44, 'dark'),
      B(-0.98, 0, 1.02, 0.86, 0.52, 0.52, 'skin', { g: 'tail' }),
      B(-1.72, 0, 0.96, 0.72, 0.34, 0.34, 'skin', { g: 'tail' }),
      B(-2.46, 0, 0.88, 0.72, 0.24, 0.24, 'dark', { g: 'tail', tp: 0.5 }),
      B(-0.10, 0.40, 0.62, 0.44, 0.30, 0.76, 'skin', { g: 'leg', pv: [-0.10, 1.00], ph: 0.0 }),
      B(-0.10, -0.40, 0.62, 0.44, 0.30, 0.76, 'skin', { g: 'leg', pv: [-0.10, 1.00], ph: 0.5 }),
      B(0.16, 0.40, 0.10, 0.62, 0.28, 0.20, 'dark', { g: 'leg', pv: [-0.10, 1.00], ph: 0.0 }),
      B(0.16, -0.40, 0.10, 0.62, 0.28, 0.20, 'dark', { g: 'leg', pv: [-0.10, 1.00], ph: 0.5 })
    ];
  }

  /* --- TRICERATOPS · quadruped, frill slab + 3 horns (18 boxes) ------- */
  function triceratopsBoxes() {
    return [
      B(-0.75, 0, 1.00, 1.20, 1.00, 0.86, 'skin'),
      B(0.30, 0, 1.02, 1.10, 1.06, 0.90, 'skin'),
      B(1.20, 0, 1.06, 0.80, 0.98, 0.86, 'light'),
      B(1.80, 0, 1.10, 0.50, 0.62, 0.56, 'skin', { g: 'head' }),
      /* the frill: thin in x, WIDE in y, tall — the read-at-a-glance element */
      B(2.10, 0, 1.42, 0.22, 1.50, 1.10, 'plate', { g: 'head', e: 'edge' }),
      B(2.14, 0, 2.00, 0.26, 1.36, 0.14, 'edge', { g: 'head' }),
      B(2.55, 0, 1.16, 0.80, 0.62, 0.52, 'skin', { g: 'head' }),
      B(3.05, 0, 1.06, 0.42, 0.34, 0.34, 'dark', { g: 'jaw', tp: 0.45 }),
      B(2.88, 0, 1.42, 0.26, 0.26, 0.36, 'edge', { g: 'head', tp: 0.22 }),
      B(2.56, 0.32, 1.50, 0.26, 0.26, 0.54, 'edge', { g: 'head', tp: 0.26 }),
      B(2.56, -0.32, 1.50, 0.26, 0.26, 0.54, 'edge', { g: 'head', tp: 0.26 }),
      B(2.74, 0.30, 1.28, 0.14, 0.10, 0.12, 'eye', { g: 'head' }),
      B(2.74, -0.30, 1.28, 0.14, 0.10, 0.12, 'eye', { g: 'head' }),
      B(-1.62, 0, 0.92, 0.90, 0.50, 0.46, 'skin', { g: 'tail', tp: 0.55 }),
      B(1.10, 0.46, 0.48, 0.40, 0.34, 0.96, 'skin', { g: 'leg', pv: [1.10, 0.98], ph: 0.0 }),
      B(1.10, -0.46, 0.48, 0.40, 0.34, 0.96, 'skin', { g: 'leg', pv: [1.10, 0.98], ph: 0.5 }),
      B(-0.86, 0.48, 0.46, 0.44, 0.36, 0.94, 'skin', { g: 'leg', pv: [-0.86, 0.96], ph: 0.5 }),
      B(-0.86, -0.48, 0.46, 0.44, 0.36, 0.94, 'skin', { g: 'leg', pv: [-0.86, 0.96], ph: 0.0 })
    ];
  }

  /* --- STEGOSAURUS · quadruped, arched back + dorsal plate row -------- *
   * 16 body boxes + 8 procedurally-placed plate WEDGES (taper 0.12 boxes
   * riding the spine arch, alternating left/right like the real animal).  */
  function stegoBoxes() {
    var a = [
      B(-0.85, 0, 1.10, 1.15, 0.95, 1.00, 'skin'),
      B(0.20, 0, 1.15, 1.10, 1.00, 1.05, 'skin'),
      B(1.15, 0, 0.98, 0.85, 0.86, 0.80, 'light'),
      B(1.75, 0, 0.92, 0.55, 0.50, 0.44, 'skin', { g: 'head' }),
      B(2.20, 0, 0.86, 0.55, 0.38, 0.34, 'skin', { g: 'head' }),
      B(2.55, 0, 0.80, 0.30, 0.28, 0.22, 'dark', { g: 'jaw', tp: 0.5 }),
      B(2.24, 0.20, 0.94, 0.12, 0.09, 0.11, 'eye', { g: 'head' }),
      B(2.24, -0.20, 0.94, 0.12, 0.09, 0.11, 'eye', { g: 'head' }),
      B(-1.70, 0, 1.00, 0.90, 0.52, 0.48, 'skin', { g: 'tail' }),
      B(-2.45, 0, 0.92, 0.70, 0.32, 0.30, 'skin', { g: 'tail', tp: 0.6 }),
      B(-2.62, 0.26, 1.10, 0.18, 0.18, 0.55, 'edge', { g: 'tail', tp: 0.12 }),
      B(-2.62, -0.26, 1.10, 0.18, 0.18, 0.55, 'edge', { g: 'tail', tp: 0.12 }),
      B(1.05, 0.44, 0.36, 0.36, 0.32, 0.72, 'skin', { g: 'leg', pv: [1.05, 0.72], ph: 0.0 }),
      B(1.05, -0.44, 0.36, 0.36, 0.32, 0.72, 'skin', { g: 'leg', pv: [1.05, 0.72], ph: 0.5 }),
      B(-0.85, 0.46, 0.52, 0.44, 0.36, 1.04, 'skin', { g: 'leg', pv: [-0.85, 1.04], ph: 0.5 }),
      B(-0.85, -0.46, 0.52, 0.44, 0.36, 1.04, 'skin', { g: 'leg', pv: [-0.85, 1.04], ph: 0.0 })
    ];
    for (var i = 0; i < 8; i++) {
      var u = i / 7;                                  // 0..1 along the spine
      var px = -1.60 + u * 3.05;
      var spineZ = 1.68 - 0.16 * Math.pow(px / 1.6, 2);
      var big = Math.sin(u * Math.PI);                // biggest over the hips/mid
      var hgt = 0.34 + big * 0.50 + (hash(i * 3.1) - 0.5) * 0.10;
      var wid = 0.26 + big * 0.34;
      a.push(B(px, (i % 2 ? 0.07 : -0.07), spineZ + hgt * 0.5, wid, 0.10, hgt, 'plate',
        { tp: 0.12, e: 'edge' }));
    }
    return a;
  }

  var GEOM = { trex: trexBoxes, triceratops: triceratopsBoxes, stegosaurus: stegoBoxes };
  /* footprint of the ground-contact ellipse, in body units: [fore, lateral] */
  var FOOT = { trex: [1.9, 0.72], triceratops: [2.0, 0.86], stegosaurus: [2.1, 0.82] };

  /* =====================================================================
     POSE — deterministic per (frame, fsm). Mutates a fresh box copy.
     walk : legs rotate about their hip pivot in the body XZ plane, diagonal
            gait for quadrupeds (phase 0 / 0.5), alternating for the biped.
     attack: head+jaw group lunges forward, jaw box drops open, tail
            counterweights back and up.
     idle : subtle bob (0 at frame 0 — the game bakes idle at frame 0 only,
            so in-game this is a neutral pose; the harness scrubber shows it
            breathing).
     ===================================================================== */
  function pose(boxes, frame, fsm) {
    var walkT = (frame % 6) / 6;
    var wave = Math.sin(walkT * Math.PI * 2);
    var atk = (fsm === 'attack') ? Math.sin(Math.min(1, frame / 5) * Math.PI) : 0;
    var bob = (fsm === 'walk') ? Math.abs(wave) * 0.055
      : (fsm === 'idle' ? wave * 0.035 : 0);

    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.g === 'leg') {
        if (fsm === 'walk') {
          var ang = Math.sin((walkT + b.ph) * Math.PI * 2) * 0.55;
          var dx = b.x - b.pv[0], dz = b.z - b.pv[1];
          var ca = Math.cos(ang), sa = Math.sin(ang);
          b.x = b.pv[0] + dx * ca - dz * sa;
          b.z = b.pv[1] + dx * sa + dz * ca;
        }
        b.x += atk * 0.06;                       // brace into the lunge
        continue;                                // legs keep ground contact: no bob
      }
      b.z += bob;
      b.x += atk * 0.12;
      if (b.g === 'tail') {
        b.y += Math.sin((walkT + 0.25) * Math.PI * 2) * 0.10 * (fsm === 'walk' ? 1 : 0);
        b.x -= atk * 0.22;
        b.z += atk * 0.16;
      } else if (b.g === 'head') {
        b.x += atk * 0.46;
        b.z -= atk * 0.20;
      } else if (b.g === 'jaw') {
        b.x += atk * 0.58;                       // jaw swings forward AND down = open
        b.z -= atk * 0.46;
      }
    }
  }

  /* =====================================================================
     PRISM RENDER — one box, city tone language
     ===================================================================== */
  function rot(x, y, c, s, out) { out.x = x * c - y * s; out.y = x * s + y * c; }

  var _p = { x: 0, y: 0 };
  function proj(wx, wy, wz) { return { x: (wx - wy) * KX, y: (wx + wy) * KY - wz * KZ }; }

  var CORNERS = [[1, 1], [1, -1], [-1, -1], [-1, 1]];

  function drawBox(ctx, b, pal, c, s) {
    var hx = b.sx * 0.5, hy = b.sy * 0.5;
    var zb = b.z - b.sz * 0.5, zt = b.z + b.sz * 0.5;
    var base = [], top = [], i, k;
    for (i = 0; i < 4; i++) {
      k = CORNERS[i];
      rot(b.x + k[0] * hx, b.y + k[1] * hy, c, s, _p);
      base.push(proj(_p.x, _p.y, zb));
      rot(b.x + k[0] * hx * b.tp, b.y + k[1] * hy * b.tp, c, s, _p);
      top.push(proj(_p.x, _p.y, zt));
    }

    var col = toneColor(pal, b.t);
    var lit = shade(col, 1.12), sha = shade(col, 0.74), tp = shade(col, 1.32);
    var edg = shade(b.e ? toneColor(pal, b.e) : col, b.e ? 1.0 : 0.5);

    /* footprint centroid in screen space — the visibility + lighting oracle */
    var cx = 0, cy = 0;
    for (i = 0; i < 4; i++) { cx += base[i].x; cy += base[i].y; }
    cx *= 0.25; cy *= 0.25;

    ctx.lineWidth = 1;
    ctx.strokeStyle = edg;
    for (i = 0; i < 4; i++) {
      var j = (i + 1) & 3;
      var mx = (base[i].x + base[j].x) * 0.5, my = (base[i].y + base[j].y) * 0.5;
      if (my <= cy + 1e-9) continue;               // face points away from the viewer
      ctx.beginPath();
      ctx.moveTo(base[i].x, base[i].y);
      ctx.lineTo(base[j].x, base[j].y);
      ctx.lineTo(top[j].x, top[j].y);
      ctx.lineTo(top[i].x, top[i].y);
      ctx.closePath();
      ctx.fillStyle = (mx >= cx - 1e-9) ? lit : sha;   // right-facing quad = lit (city rule)
      ctx.fill();
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    for (i = 1; i < 4; i++) ctx.lineTo(top[i].x, top[i].y);
    ctx.closePath();
    ctx.fillStyle = tp;
    ctx.fill();
    ctx.stroke();
  }

  /* =====================================================================
     build(ctx, w, h, pal, shape, base, frame, fsm)
     ===================================================================== */
  function build(ctx, w, h, pal, shape, base, frame, fsm) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    /* scale so the style is resolution-independent if ever baked lo-res */
    ctx.translate(ANCHOR_X * (w / SPR_W), ANCHOR_Y * (h / SPR_H));
    ctx.scale(w / SPR_W, h / SPR_H);

    var species = (shape && shape.species) || 'trex';
    var mk = GEOM[species] || GEOM.trex;
    var boxes = mk();
    var bulk = (shape && shape.bulk) || 1;
    var f = phiFor(base), c = Math.cos(f), s = Math.sin(f);

    pose(boxes, frame | 0, fsm || 'idle');

    var i, b;
    for (i = 0; i < boxes.length; i++) {
      b = boxes[i];
      b.x *= bulk; b.y *= bulk; b.z *= bulk;
      b.sx *= bulk; b.sy *= bulk; b.sz *= bulk;
    }

    /* ---- FIT PASS ---------------------------------------------------- *
     * A 5.8-unit dinosaur projected at S (forward runs screen-DOWN) or at
     * E (forward runs screen-RIGHT) does not fit the 150x168 plate on its
     * own — measured overruns were 12px below the anchor at S and 2px off
     * the right edge at E. Project every corner, then uniformly shrink (only
     * if needed) and clamp the AABB inside the plate, so NO facing/pose/frame
     * can ever clip. Ground-anchored whenever it already fits.                */
    var PAD_X = 73, PAD_TOP = ANCHOR_Y - 3, PAD_BOT = SPR_H - ANCHOR_Y - 3;
    var mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, j, kk, q;

    /* ground contact shadow ring — the body ellipse projected through the
       same 2:1 matrix, so it lies flat on the iso ground plane. Built first
       because it is the widest thing on the plate and MUST be inside the
       fit AABB or it clips at the bottom edge on the S facing. */
    var ft = FOOT[species] || FOOT.trex, ring = [];
    for (var t = 0; t < 24; t++) {
      var ta = t / 24 * Math.PI * 2;
      rot(Math.cos(ta) * ft[0] * bulk, Math.sin(ta) * ft[1] * bulk, c, s, _p);
      q = proj(_p.x, _p.y, 0); q.y += 2;
      ring.push(q);
      if (q.x < mnx) mnx = q.x; if (q.x > mxx) mxx = q.x;
      if (q.y < mny) mny = q.y; if (q.y > mxy) mxy = q.y;
    }

    for (i = 0; i < boxes.length; i++) {
      b = boxes[i];
      for (j = 0; j < 4; j++) {
        kk = CORNERS[j];
        rot(b.x + kk[0] * b.sx * 0.5, b.y + kk[1] * b.sy * 0.5, c, s, _p);
        q = proj(_p.x, _p.y, b.z - b.sz * 0.5);
        if (q.x < mnx) mnx = q.x; if (q.x > mxx) mxx = q.x;
        if (q.y < mny) mny = q.y; if (q.y > mxy) mxy = q.y;
        rot(b.x + kk[0] * b.sx * 0.5 * b.tp, b.y + kk[1] * b.sy * 0.5 * b.tp, c, s, _p);
        q = proj(_p.x, _p.y, b.z + b.sz * 0.5);
        if (q.x < mnx) mnx = q.x; if (q.x > mxx) mxx = q.x;
        if (q.y < mny) mny = q.y; if (q.y > mxy) mxy = q.y;
      }
    }
    var fk = Math.min(1, (PAD_X * 2) / Math.max(1, mxx - mnx),
      (PAD_TOP + PAD_BOT) / Math.max(1, mxy - mny));
    var fdx = 0, fdy = 0;
    if (mxx * fk > PAD_X) fdx = PAD_X - mxx * fk;
    if (mnx * fk + fdx < -PAD_X) fdx = -PAD_X - mnx * fk;
    if (mxy * fk > PAD_BOT) fdy = PAD_BOT - mxy * fk;
    if (mny * fk + fdy < -PAD_TOP) fdy = -PAD_TOP - mny * fk;
    ctx.translate(fdx, fdy);
    ctx.scale(fk, fk);

    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.moveTo(ring[0].x, ring[0].y);
    for (i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
    ctx.closePath();
    ctx.fill();

    /* painter sort: iso depth (wx+wy) dominant, height as the tie-break so a
       stacked box always lands on top of the one it rides. */
    for (i = 0; i < boxes.length; i++) {
      b = boxes[i];
      rot(b.x, b.y, c, s, _p);
      b._k = (_p.x + _p.y) + b.z * 0.15;
    }
    boxes.sort(function (p, q) { return p._k - q._k; });

    for (i = 0; i < boxes.length; i++) drawBox(ctx, boxes[i], pal, c, s);

    ctx.restore();
  }

  SF.styles = SF.styles || {};
  SF.styles.boxstack = {
    name: 'Iso Box-Stack',
    blurb: 'Crossy-Road chunky prisms in the city\'s exact 0.74 / 1.12 / 1.32 flat-tone language.',
    build: build,
    /* exported for the harness / future unit tests; not part of the contract */
    _geom: GEOM
  };

})(window.STYLEFORGE);
