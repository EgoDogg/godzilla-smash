/* =====================================================================
   StyleForge candidate B · style-silhouette.js  —  "Rim-Lit Silhouette"
   ---------------------------------------------------------------------
   SHIPPING CODE. If this style wins, register `build` in the game's
   archetype dispatch (js/archetypes.js Archetypes.build) unchanged.

   Dependencies: window.GAME.Utils ONLY (shade). No DOM, no Assets, no
   harness glue.

   THE IDEA
   BADLAND / LIMBO: one closed near-black body path per species (pal.skinDark),
   a thin warm rim-light along the UPPER contour only (rgba(255,250,235,0.22)
   — the same RIM token archetypes.js §1.1 uses), and 2-3 accent shapes in
   pal.eye / pal.plateEdge. Everything else is negative space. The bet is that
   a creature reads faster as a shape than as a rendered volume, and that a
   black mass sits cleanly on top of the city's flat prisms.

   FACING DERIVATION (spec'd): each species is authored TWICE as
   index-matched closed point lists — E (side profile) and S (front) — each
   9 upper-contour points followed by 9 lower-contour points. SE / NE are a
   straight elementwise lerp between them (an x-squash), N is the front list
   with x negated and no eye.

   BAKE GUARDRAILS honoured (archetypes.js §1.6):
     · no shadowBlur, no ctx.filter, no globalCompositeOperation
       (the eye halo is a createRadialGradient at normal alpha — allowed)
     · no Math.random
     · fixed 150x168 canvas, anchor (75, 144.5)
   ===================================================================== */
window.STYLEFORGE = window.STYLEFORGE || { styles: {} };

(function (SF) {
  'use strict';

  var U = (window.GAME && window.GAME.Utils) || null;
  function shade(hex, f) { return (U && U.shade) ? U.shade(hex, f) : hex; }

  var SPR_W = 150, SPR_H = 168;
  var ANCHOR_X = SPR_W * 0.5, ANCHOR_Y = SPR_H * 0.86;
  var SCX = 22, SCZ = 38;                     // body-unit -> px (stylised squash)
  var RIM = 'rgba(255,250,235,0.22)';         // archetypes.js §1.1 RIM token

  /* =====================================================================
     SPECIES POINT LISTS — body units, +x forward, +z up.
     top: 9 pts snout->tail (upper contour)   bot: 9 pts tail->snout (lower)
     ===================================================================== */
  var DATA = {
    trex: {
      side: {
        top: [[2.85, 1.88], [2.58, 2.16], [2.16, 2.22], [1.72, 1.98], [1.20, 1.84], [0.30, 1.88], [-0.60, 1.72], [-1.70, 1.34], [-2.90, 0.98]],
        bot: [[-2.90, 0.84], [-1.70, 1.02], [-0.60, 1.00], [0.30, 0.90], [1.05, 1.02], [1.52, 1.34], [2.02, 1.50], [2.52, 1.54], [2.85, 1.72]]
      },
      front: {
        top: [[0.00, 2.30], [-0.42, 2.16], [-0.52, 1.78], [-0.86, 1.58], [-1.05, 1.10], [-0.86, 0.74], [-0.70, 0.30], [-0.58, 0.05], [0.00, 0.00]],
        bot: [[0.00, 0.00], [0.58, 0.05], [0.70, 0.30], [0.86, 0.74], [1.05, 1.10], [0.86, 1.58], [0.52, 1.78], [0.42, 2.16], [0.00, 2.30]]
      },
      head: { top: [0, 1, 2, 3], bot: [6, 7, 8], pivS: [1.55, 1.80], pivF: [0.00, 1.75] },
      eye: { s: [2.42, 1.98], f: [0.30, 2.00], r: 0.115 },
      jaw: { s: [[1.95, 1.52], [2.86, 1.70], [2.60, 1.34]], f: [[-0.24, 1.72], [0.30, 1.88], [0.06, 1.48]] },
      legs: [
        { hs: [-0.10, 1.00], hf: [0.44, 1.05], len: 0.98, w: 0.34, ph: 0.0, far: false },
        { hs: [-0.10, 1.00], hf: [-0.44, 1.05], len: 0.98, w: 0.34, ph: 0.5, far: true }
      ],
      /* dorsal micro-ridge along u of the upper contour (u0,u1,count,height) */
      ridge: { u0: 0.36, u1: 0.80, n: 7, h: 0.16 },
      frill: null, plates: null, spikes: null
    },

    triceratops: {
      side: {
        top: [[3.00, 1.02], [2.72, 1.30], [2.35, 1.34], [2.05, 2.12], [1.68, 2.04], [1.05, 1.62], [0.05, 1.66], [-0.95, 1.58], [-2.10, 1.10]],
        bot: [[-2.10, 0.96], [-0.95, 1.00], [0.05, 0.96], [1.05, 0.94], [1.75, 0.96], [2.20, 0.90], [2.55, 0.86], [2.82, 0.86], [3.00, 0.92]]
      },
      front: {
        top: [[0.00, 2.18], [-0.80, 2.04], [-1.14, 1.60], [-1.02, 1.34], [-1.16, 1.06], [-0.98, 0.72], [-0.82, 0.32], [-0.70, 0.05], [0.00, 0.00]],
        bot: [[0.00, 0.00], [0.70, 0.05], [0.82, 0.32], [0.98, 0.72], [1.16, 1.06], [1.02, 1.34], [1.14, 1.60], [0.80, 2.04], [0.00, 2.18]]
      },
      head: { top: [0, 1, 2, 3, 4], bot: [5, 6, 7, 8], pivS: [1.55, 1.55], pivF: [0.00, 1.55] },
      eye: { s: [2.55, 1.18], f: [0.32, 1.28], r: 0.10 },
      jaw: { s: [[2.55, 0.98], [3.06, 0.96], [2.72, 0.78]], f: [[-0.22, 1.00], [0.22, 1.00], [0.00, 0.78]] },
      legs: [
        { hs: [1.10, 0.98], hf: [0.64, 1.00], len: 0.94, w: 0.32, ph: 0.0, far: false },
        { hs: [1.10, 0.98], hf: [-0.64, 1.00], len: 0.94, w: 0.32, ph: 0.5, far: true },
        { hs: [-0.95, 0.98], hf: [0.76, 1.00], len: 0.94, w: 0.36, ph: 0.5, far: false },
        { hs: [-0.95, 0.98], hf: [-0.76, 1.00], len: 0.94, w: 0.36, ph: 0.0, far: true }
      ],
      /* frill scallops ride the upper contour between these two u values */
      frill: { u0: 0.06, u1: 0.44, n: 5, h: 0.13 },
      /* three horns: [base x,z] -> [tip x,z] in side and front space */
      horns: [
        { s: [[2.80, 1.10], [2.98, 1.62]], f: [[0.00, 1.34], [0.00, 1.80]], w: 0.13 },
        { s: [[2.34, 1.34], [2.62, 2.16]], f: [[-0.38, 1.52], [-0.52, 2.20]], w: 0.13 },
        { s: [[2.26, 1.36], [2.50, 2.06]], f: [[0.38, 1.52], [0.52, 2.20]], w: 0.13 }
      ],
      ridge: null, plates: null, spikes: null
    },

    stegosaurus: {
      side: {
        top: [[2.55, 0.92], [2.28, 1.08], [1.95, 1.02], [1.55, 1.14], [0.90, 1.62], [0.05, 1.82], [-0.90, 1.62], [-1.85, 1.30], [-2.85, 1.18]],
        bot: [[-2.85, 1.06], [-1.85, 1.06], [-0.90, 0.96], [0.05, 0.88], [0.90, 0.88], [1.55, 0.92], [1.95, 0.86], [2.28, 0.84], [2.55, 0.84]]
      },
      front: {
        top: [[0.00, 1.96], [-0.55, 1.88], [-0.94, 1.52], [-1.02, 1.20], [-1.10, 0.92], [-0.94, 0.62], [-0.78, 0.28], [-0.66, 0.05], [0.00, 0.00]],
        bot: [[0.00, 0.00], [0.66, 0.05], [0.78, 0.28], [0.94, 0.62], [1.10, 0.92], [1.02, 1.20], [0.94, 1.52], [0.55, 1.88], [0.00, 1.96]]
      },
      head: { top: [0, 1, 2], bot: [6, 7, 8], pivS: [1.55, 1.10], pivF: [0.00, 1.30] },
      eye: { s: [2.22, 1.02], f: [0.24, 1.30], r: 0.095 },
      jaw: { s: [[2.20, 0.94], [2.62, 0.90], [2.34, 0.76]], f: [[-0.20, 1.02], [0.20, 1.02], [0.00, 0.80]] },
      legs: [
        { hs: [1.15, 0.92], hf: [0.60, 0.94], len: 0.70, w: 0.30, ph: 0.0, far: false },
        { hs: [1.15, 0.92], hf: [-0.60, 0.94], len: 0.70, w: 0.30, ph: 0.5, far: true },
        { hs: [-0.95, 1.02], hf: [0.74, 1.04], len: 1.00, w: 0.36, ph: 0.5, far: false },
        { hs: [-0.95, 1.02], hf: [-0.74, 1.04], len: 1.00, w: 0.36, ph: 0.0, far: true }
      ],
      /* the signature: a row of kite plates riding the arched upper contour */
      plates: { u0: 0.26, u1: 0.86, n: 8, h: 0.62 },
      /* thagomizer */
      spikes: { u0: 0.92, u1: 1.00, n: 2, h: 0.42 },
      frill: null, ridge: null
    }
  };

  /* =====================================================================
     facing -> (blend t, mirror-front, is-back)
     0 S   = front · 1 SE = 50/50 · 2 E = side
     3 NE  = 50/50 vs mirrored front, no eye · 4 N = mirrored front, no eye
     ===================================================================== */
  var FACE = [
    { t: 1.0, mf: false, back: false },
    { t: 0.5, mf: false, back: false },
    { t: 0.0, mf: false, back: false },
    { t: 0.5, mf: true, back: true },
    { t: 1.0, mf: true, back: true }
  ];

  function lerp(a, b, t) { return a + (b - a) * t; }

  /* blend an index-matched side/front list; mf negates front x (back view);
     back facings pull the head end in 10% (the head is turning away). */
  function blend(sideL, frontL, f) {
    var out = [], i, fx;
    for (i = 0; i < sideL.length; i++) {
      fx = f.mf ? -frontL[i][0] : frontL[i][0];
      var x = lerp(sideL[i][0], fx, f.t);
      var z = lerp(sideL[i][1], frontL[i][1], f.t);
      out.push([f.back ? x * 0.90 : x, z]);
    }
    return out;
  }
  function blend1(s, fr, f) {
    var fx = f.mf ? -fr[0] : fr[0];
    var x = lerp(s[0], fx, f.t);
    return [f.back ? x * 0.90 : x, lerp(s[1], fr[1], f.t)];
  }

  /* rotate p about pivot in the (x,z) plane; +a dips the nose DOWN */
  function dip(p, piv, a) {
    var dx = p[0] - piv[0], dz = p[1] - piv[1];
    var c = Math.cos(a), s = Math.sin(a);
    return [piv[0] + dx * c + dz * s, piv[1] - dx * s + dz * c];
  }

  function X(v) { return v * SCX; }
  function Y(v) { return -v * SCZ; }

  /* smoothed closed path through pts (quadratics through edge midpoints) */
  function tracePath(ctx, pts) {
    var n = pts.length, i;
    var mx = (pts[n - 1][0] + pts[0][0]) * 0.5, mz = (pts[n - 1][1] + pts[0][1]) * 0.5;
    ctx.moveTo(X(mx), Y(mz));
    for (i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      ctx.quadraticCurveTo(X(a[0]), Y(a[1]), X((a[0] + b[0]) * 0.5), Y((a[1] + b[1]) * 0.5));
    }
    ctx.closePath();
  }

  /* open smoothed polyline (used for the rim light on the upper contour) */
  function traceOpen(ctx, pts) {
    ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (var i = 1; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      ctx.quadraticCurveTo(X(a[0]), Y(a[1]), X((a[0] + b[0]) * 0.5), Y((a[1] + b[1]) * 0.5));
    }
    var l = pts[pts.length - 1];
    ctx.lineTo(X(l[0]), Y(l[1]));
  }

  /* sample the upper contour at u in [0,1] (piecewise-linear over the 9 pts) */
  function sampleTop(top, u) {
    var f = u * (top.length - 1);
    var i = Math.min(top.length - 2, Math.floor(f)), k = f - i;
    return [lerp(top[i][0], top[i + 1][0], k), lerp(top[i][1], top[i + 1][1], k)];
  }
  /* unit tangent along the contour at u (for perpendicular plate placement) */
  function tangentTop(top, u) {
    var a = sampleTop(top, Math.max(0, u - 0.02)), b = sampleTop(top, Math.min(1, u + 0.02));
    var dx = X(b[0] - a[0]), dz = Y(b[1] - a[1]);
    var m = Math.hypot(dx, dz) || 1;
    return [dx / m, dz / m];
  }

  /* =====================================================================
     build(ctx, w, h, pal, shape, base, frame, fsm)
     ===================================================================== */
  function build(ctx, w, h, pal, shape, base, frame, fsm) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ANCHOR_X * (w / SPR_W), ANCHOR_Y * (h / SPR_H));
    ctx.scale(w / SPR_W, h / SPR_H);

    var key = (shape && shape.species) || 'trex';
    var D = DATA[key] || DATA.trex;
    var f = FACE[Math.max(0, Math.min(4, base | 0))];

    var walkT = ((frame | 0) % 6) / 6;
    var wave = Math.sin(walkT * Math.PI * 2);
    var atk = (fsm === 'attack') ? Math.sin(Math.min(1, (frame | 0) / 5) * Math.PI) : 0;
    var bob = (fsm === 'walk') ? Math.abs(wave) * 0.055 : (fsm === 'idle' ? wave * 0.03 : 0);

    var body = shade(pal.skinDark, 1.0);
    var bodyFar = shade(pal.skinDark, 0.62);
    var accent = pal.plateEdge || pal.skinLight;

    var top = blend(D.side.top, D.front.top, f);
    var bot = blend(D.side.bot, D.front.bot, f);
    var piv = blend1(D.head.pivS, D.head.pivF, f);

    /* attack: the head group rotates down about the neck pivot */
    var i, a = atk * 0.34;
    if (a > 0.0001) {
      for (i = 0; i < D.head.top.length; i++) top[D.head.top[i]] = dip(top[D.head.top[i]], piv, a);
      for (i = 0; i < D.head.bot.length; i++) bot[D.head.bot[i]] = dip(bot[D.head.bot[i]], piv, a);
    }
    if (bob) { for (i = 0; i < top.length; i++) top[i][1] += bob; for (i = 0; i < bot.length; i++) bot[i][1] += bob; }

    /* ---- ground contact ------------------------------------------- */
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 3, X(lerp(2.1, 1.15, f.t)), 5.5, 0, 0, 6.2832);
    ctx.fill();

    /* ---- legs (far pass, behind the body) -------------------------- */
    drawLegs(ctx, D, f, walkT, fsm, atk, bodyFar, true);

    /* ---- dark structural extras that merge into the silhouette ----- */
    ctx.fillStyle = body;
    if (D.plates) drawRow(ctx, top, D.plates, 0.60, false);
    if (D.spikes) drawRow(ctx, top, D.spikes, 1.00, true);
    if (D.horns) drawHorns(ctx, D, f, piv, a, false);

    /* ---- the body: one closed path -------------------------------- */
    var full = top.concat(bot);
    ctx.fillStyle = body;
    ctx.beginPath(); tracePath(ctx, full); ctx.fill();

    /* ---- legs (near pass) ------------------------------------------ */
    drawLegs(ctx, D, f, walkT, fsm, atk, body, false);

    /* ---- jaw wedge (opens on attack) ------------------------------- */
    var jaw = [];
    for (i = 0; i < D.jaw.s.length; i++) jaw.push(blend1(D.jaw.s[i], D.jaw.f[i], f));
    if (a > 0.0001) for (i = 0; i < jaw.length; i++) jaw[i] = dip(jaw[i], piv, a + atk * 0.42);
    if (bob) for (i = 0; i < jaw.length; i++) jaw[i][1] += bob;
    ctx.fillStyle = shade(pal.skinDark, 0.55);
    ctx.beginPath();
    ctx.moveTo(X(jaw[0][0]), Y(jaw[0][1]));
    for (i = 1; i < jaw.length; i++) ctx.lineTo(X(jaw[i][0]), Y(jaw[i][1]));
    ctx.closePath(); ctx.fill();

    /* ---- rim light on the UPPER contour only ----------------------- */
    ctx.strokeStyle = RIM;
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); traceOpen(ctx, top); ctx.stroke();

    /* ---- accents in pal.plateEdge ---------------------------------- */
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    if (D.frill) { ctx.beginPath(); strokeRow(ctx, top, D.frill, 0.55); ctx.stroke(); }
    if (D.ridge) { ctx.beginPath(); strokeRow(ctx, top, D.ridge, 1.00); ctx.stroke(); }
    if (D.plates) { ctx.lineWidth = 1.4; ctx.beginPath(); strokeRow(ctx, top, D.plates, 0.60); ctx.stroke(); }
    if (D.spikes) { ctx.lineWidth = 1.6; ctx.beginPath(); strokeRow(ctx, top, D.spikes, 1.00); ctx.stroke(); }
    if (D.horns) { ctx.fillStyle = accent; drawHorns(ctx, D, f, piv, a, true); }

    /* ---- eye: opaque dot + radial-gradient halo (no composite op) --- */
    if (!f.back) {
      var e = blend1(D.eye.s, D.eye.f, f);
      if (a > 0.0001) e = dip(e, piv, a);
      e[1] += bob;
      var ex = X(e[0]), ey = Y(e[1]), r = D.eye.r * SCZ * 2.6;
      var g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
      g.addColorStop(0, pal.eye || '#e8e8e8');
      g.addColorStop(0.35, shade(pal.eye || '#e8e8e8', 0.7));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ex - r, ey - r, r * 2, r * 2);
      ctx.fillStyle = pal.eye || '#e8e8e8';
      ctx.beginPath(); ctx.arc(ex, ey, D.eye.r * SCZ * 0.62, 0, 6.2832); ctx.fill();
    }

    ctx.restore();
  }

  /* --- a row of kites/spikes standing off the upper contour ---------- */
  function rowPts(top, spec, hMul, spike) {
    var out = [];
    for (var i = 0; i < spec.n; i++) {
      var u = spec.n === 1 ? spec.u0 : spec.u0 + (spec.u1 - spec.u0) * (i / (spec.n - 1));
      var p = sampleTop(top, u), tg = tangentTop(top, u);
      var nx = tg[1], ny = -tg[0];                       // outward normal (up)
      if (ny > 0) { nx = -nx; ny = -ny; }
      var big = spike ? 1 : Math.sin((i / Math.max(1, spec.n - 1)) * Math.PI) * 0.65 + 0.45;
      var hh = spec.h * hMul * big * SCZ;
      var ww = hh * (spike ? 0.30 : 0.46);
      var bx = X(p[0]), by = Y(p[1]);
      out.push([
        [bx - tg[0] * ww, by - tg[1] * ww],
        [bx + nx * hh, by + ny * hh],
        [bx + tg[0] * ww, by + tg[1] * ww]
      ]);
    }
    return out;
  }
  function drawRow(ctx, top, spec, hMul, spike) {
    var R = rowPts(top, spec, hMul, spike);
    ctx.beginPath();
    for (var i = 0; i < R.length; i++) {
      ctx.moveTo(R[i][0][0], R[i][0][1]);
      ctx.lineTo(R[i][1][0], R[i][1][1]);
      ctx.lineTo(R[i][2][0], R[i][2][1]);
      ctx.closePath();
    }
    ctx.fill();
  }
  function strokeRow(ctx, top, spec, hMul) {
    var R = rowPts(top, spec, hMul, false);
    for (var i = 0; i < R.length; i++) {
      ctx.moveTo(R[i][0][0], R[i][0][1]);
      ctx.lineTo(R[i][1][0], R[i][1][1]);
      ctx.lineTo(R[i][2][0], R[i][2][1]);
    }
  }

  /* --- horns: dark cores first, bright tips on the accent pass ------- */
  function drawHorns(ctx, D, f, piv, a, tips) {
    for (var i = 0; i < D.horns.length; i++) {
      var hn = D.horns[i];
      var b = blend1(hn.s[0], hn.f[0], f), t = blend1(hn.s[1], hn.f[1], f);
      if (a > 0.0001) { b = dip(b, piv, a); t = dip(t, piv, a); }
      var bx = X(b[0]), by = Y(b[1]), tx = X(t[0]), ty = Y(t[1]);
      var dx = tx - bx, dy = ty - by, m = Math.hypot(dx, dy) || 1;
      var px = -dy / m * hn.w * SCZ * 0.5, py = dx / m * hn.w * SCZ * 0.5;
      if (tips) {                        // bright distal third only
        bx = bx + dx * 0.62; by = by + dy * 0.62; px *= 0.42; py *= 0.42;
      }
      ctx.beginPath();
      ctx.moveTo(bx + px, by + py);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx - px, by - py);
      ctx.closePath(); ctx.fill();
    }
  }

  /* --- legs: tapered quads swinging about the hip -------------------- */
  function drawLegs(ctx, D, f, walkT, fsm, atk, col, farPass) {
    ctx.fillStyle = col;
    for (var i = 0; i < D.legs.length; i++) {
      var L = D.legs[i];
      if (!!L.far !== !!farPass) continue;
      var hip = blend1(L.hs, L.hf, f);
      var ang = (fsm === 'walk') ? Math.sin((walkT + L.ph) * Math.PI * 2) * 0.52 : 0;
      ang += atk * (L.hs[0] > 0 ? 0.16 : -0.10);
      var hx = X(hip[0]), hy = Y(hip[1]);
      var len = L.len * SCZ, w0 = L.w * SCZ * 0.5, w1 = w0 * 0.62;
      var dx = Math.sin(ang) * len, dy = Math.cos(ang) * len;
      var fx = hx + dx, fy = hy + dy;
      ctx.beginPath();
      ctx.moveTo(hx - w0, hy);
      ctx.lineTo(hx + w0, hy);
      ctx.lineTo(fx + w1, fy);
      ctx.lineTo(fx + w1 * 1.9, fy + w1 * 0.9);      // blocky foot
      ctx.lineTo(fx - w1 * 1.2, fy + w1 * 0.9);
      ctx.closePath();
      ctx.fill();
    }
  }

  SF.styles = SF.styles || {};
  SF.styles.silhouette = {
    name: 'Rim-Lit Silhouette',
    blurb: 'BADLAND-style black mass, warm rim on the top edge, eye + plate accents carry the palette.',
    build: build,
    _data: DATA
  };

})(window.STYLEFORGE);
