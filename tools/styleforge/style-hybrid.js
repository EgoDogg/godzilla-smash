/* =====================================================================
   StyleForge · HYBRID RIG  —  tools/styleforge/style-hybrid.js
   "Rig + Flat-Tone" — the shipping candidate for the 12-dinosaur roster.

   WHY THIS STYLE
     • BONES make facings + walk cycles ANALYTIC. One rig, one pose solver,
       one projection → 5 facings × 3 fsm × 6 frames fall out of the math.
       No per-facing hand-tuned curve soup (which is what makes the legacy
       wyrm/flyer builders expensive to extend to 12 species).
     • FLAT TONES make overlapping parts MERGE. Because every near-side part
       is filled with the identical three colors, a leg drawn over a torso
       has no visible seam — which is what makes procedural limb assembly
       viable at all under the bake guardrails.
     • The three tones are the SAME multipliers assets.js drawPrismBuilding
       uses for the city (0.74 / 1.12 / 1.32, 0.5 edge), so the creature
       shares the skyline's key light BY CONSTRUCTION, not by eyeballing.

   BAKE GUARDRAILS OBEYED (archetypes.js §1.6): no shadowBlur, no ctx.filter,
   no globalCompositeOperation, no Math.random (nothing random at all here —
   the rig is fully determined by species/base/frame/fsm). Fixed 150×168
   canvas, anchor (75,144.5).

   If Mike picks this style, `buildHybrid` below drops straight into the
   archetypes.js dispatch as buildRig(ctx,w,h,pal,shape,base,frame,fsm).
   ===================================================================== */
(function () {
  'use strict';

  var SPR_W = 150, SPR_H = 168;
  var AX = SPR_W * 0.5;          // 75
  var AY = SPR_H * 0.86;         // 144.5
  var D2R = Math.PI / 180;
  var HALF = Math.PI / 2;

  var FACE_RAD = [0, 45 * D2R, 90 * D2R, 135 * D2R, 180 * D2R];  // S SE E NE N
  var TILT = 0.28;               // iso 2:1 foreshortening on the depth axis
  var FAR_T = 3.5;               // depth (body units) beyond which a limb/tail is "far"

  /* ── tone rule (city-matched) ────────────────────────────────────────── */
  var T_TOP = 1.32, T_LIT = 1.12, T_SHA = 0.74, T_EDGE = 0.5;
  var SHA_DX = -2.4, SHA_DY = 2.4;   // shadow band: key light is upper-RIGHT
  var TOP_DX = 0.9, TOP_DY = -2.4;   // top band
  var RIM = 'rgba(255,250,235,0.22)';

  /* Multiplicative shading has no headroom on a near-black skin: supernova's
     '#0d011a' × 1.32 is still black, so the three tones collapse into one and
     the creature reads as a hole in the skyline. Guard: when the skin is that
     dark, derive the tone TRIPLE from a lifted base (skin mixed toward the
     palette's own skinLight). The 0.74 / 1.12 / 1.32 RATIOS are untouched —
     only the base they multiply moves into a range where they're visible. */
  function hexN(h) {
    var c = ('' + h).replace('#', '');
    if (c.length === 3) c = c.replace(/(.)/g, '$1$1');
    return parseInt(c, 16) | 0;
  }
  function toneBase(pal) {
    var n = hexN(pal.skin), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (Math.max(r, g, b) >= 48) return pal.skin;
    var m = hexN(pal.skinLight || '#8a8a8a'), t = 0.55;
    function ch(a, c) { return Math.round(a + (c - a) * t); }
    var o = (ch(r, (m >> 16) & 255) << 16) | (ch(g, (m >> 8) & 255) << 8) | ch(b, m & 255);
    return '#' + ('000000' + o.toString(16)).slice(-6);
  }

  /* Signature features (plates, frill, horns) are drawn in the plate family —
     but in the real FORMS palettes pal.plate is often within a few points of
     pal.skin (gz2014: #2b2b2b vs #3c3c3c), which under flat tones means the
     feature MERGES with the body and only its 1px rim survives. Everything
     turns into wireframe. So: keep the plate HUE, but force its luminance a
     guaranteed distance away from the body's lit tone. Returns the multiplier
     to apply to pal.plate. */
  function lum(n) { return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); }
  function plateFactor(skinHex, plateHex) {
    var sl = lum(hexN(skinHex)) * T_LIT, pl = lum(hexN(plateHex));
    if (pl < 1) return 1;                       // pure black plate: nothing to scale
    var fl = pl * 1.15;
    if (Math.abs(fl - sl) >= 34) return 1.15;   // already separated — leave it alone
    /* Prefer the LIGHTER direction: plates, frills and horns are bone, and a
       dark feature on a dark body against a night skyline loses its silhouette
       twice over. Fall back to darker only when lighter would clip. */
    var target = sl + 50;
    if (target > 214) target = sl - 50;
    target = target < 20 ? 20 : target;
    return target / pl;
  }

  /* ── rig authoring helper ────────────────────────────────────────────────
     n parent len pitch(deg,0=+x fwd,+90=up) t0 t1 role gaitGroup seg zOff */
  function B(n, p, len, pitch, t0, t1, role, g, seg, z) {
    return { n: n, p: p, len: len, pitch: pitch, yaw: 0, t0: t0, t1: t1,
             role: role, g: g || null, seg: seg == null ? -1 : seg, z: z || 0 };
  }
  function legs(pre, par, L, hip, ln, pit, th, zo, gA, gB) {
    var o = [];
    for (var s = 0; s < 2; s++) {
      var sfx = s ? 'R' : 'L', z = s ? -zo : zo, g = s ? gB : gA;
      o.push(B(pre + 'Thigh' + sfx, par, ln[0], pit[0], th[0], th[1], 'limb', g, 0, z));
      o.push(B(pre + 'Shin' + sfx, pre + 'Thigh' + sfx, ln[1], pit[1], th[1] * 0.8, th[2], 'limb', g, 1, 0));
      o.push(B(pre + 'Foot' + sfx, pre + 'Shin' + sfx, ln[2], pit[2], th[2] * 0.9, th[2] * 0.75, 'limb', g, 2, 0));
    }
    return o;
  }

  /* ══ RIGS ════════════════════════════════════════════════════════════════
     Three body plans. Proportions are the identity: read the silhouette
     numbers, not the code. Every length is in "body units" = px before the
     per-species FIT scale. ROOT is the hip; y=0 is the ground plane. */
  var RIGS = {
    /* bipedLongTail — massive skull, vestigial arms, horizontal spine over
       huge hind legs. Hip is 64u up: the tallest of the three. */
    trex: {
      root: { x: 0, y: 64, z: 0 }, fit: 0.94, shiftX: -15, shadowR: 24,
      core: ['spine', 'chest', 'neck', 'skull'],
      bones: [
        B('spine', null, 24, 6, 13, 12, 'core'),
        B('chest', 'spine', 19, -3, 12, 9.5, 'core'),
        B('neck', 'chest', 16, 30, 8, 6.5, 'core'),
        B('skull', 'neck', 22, -20, 9.5, 6, 'core'),
        B('jaw', 'neck', 19, -36, 4.6, 2.6, 'core'),
        B('tail1', null, 22, 174, 11, 8, 'tail'),
        B('tail2', 'tail1', 20, 186, 8, 5, 'tail'),
        B('tail3', 'tail2', 14, 196, 5, 1.8, 'tail'),
        B('armL', 'chest', 16, -26, 4.0, 3.0, 'limb', null, -1, 9),
        B('handL', 'armL', 10, -74, 3.0, 2.0, 'limb', null, -1, 0),
        B('armR', 'chest', 16, -26, 4.0, 3.0, 'limb', null, -1, -9),
        B('handR', 'armR', 10, -74, 3.0, 2.0, 'limb', null, -1, 0)
      ].concat(legs('h', null, 2, 64, [32, 30, 14], [-74, -106, -12], [11, 8.5, 5], 10, 'A', 'B')),
      head: ['neck', 'skull', 'jaw'], headYaw: 14,
      scutes: [['spine', 0.25, 6], ['spine', 0.7, 7], ['tail1', 0.2, 6.5], ['tail1', 0.62, 5], ['tail2', 0.35, 3.5]],
      eyeOn: 'skull', eyeT: 0.34, eyeZ: 0.60
    },

    /* quadruped — frill disc + 3 horns + a LOW head slung forward off a
       barrel chest. Shortest, widest, heaviest-fronted of the three. */
    triceratops: {
      root: { x: 0, y: 42, z: 0 }, fit: 1.14, shiftX: -25, shadowR: 26,
      core: ['spine', 'shoulders', 'neck', 'skull'],
      bones: [
        B('spine', null, 26, 2, 14, 13, 'core'),
        B('shoulders', 'spine', 21, 1, 13, 11.5, 'core'),
        B('neck', 'shoulders', 9, 4, 11, 10, 'core'),
        B('skull', 'neck', 19, -12, 10, 7, 'core'),
        B('beak', 'skull', 9, -30, 5, 2, 'core'),
        B('tail1', null, 18, 176, 10, 6.5, 'tail'),
        B('tail2', 'tail1', 14, 190, 6.5, 2.5, 'tail')
      ].concat(legs('h', null, 2, 42, [22, 19, 9], [-80, -98, -8], [9.5, 7.5, 4.8], 10, 'A', 'B'))
       .concat(legs('f', 'shoulders', 2, 43, [21, 18, 8], [-86, -93, -6], [9, 6.5, 4.5], 9, 'B', 'A')),
      head: ['neck', 'skull', 'beak'], headYaw: 14,
      frill: { on: 'neck', hy: 22, hz: 20, tilt: -16, back: 7, thick: 4, camYaw: 34 },
      horns: [['neck', 1.0, 26, 15, 4.6, 6.5], ['neck', 1.0, 26, 15, 4.6, -6.5], ['skull', 0.95, 38, 10, 4.0, 0]],
      eyeOn: 'skull', eyeT: 0.42, eyeZ: 0.62
    },

    /* quadruped + plates — hip-arched back, tiny head at the end of a
       downward neck ramp, 10-plate row, spiked tail. */
    stegosaurus: {
      root: { x: 0, y: 46, z: 0 }, fit: 1.03, shiftX: -5, shadowR: 25,
      core: ['spine', 'shoulders', 'neck', 'skull'],
      bones: [
        B('spine', null, 24, -14, 14, 12.5, 'core'),
        B('shoulders', 'spine', 22, -17, 12, 9, 'core'),
        B('neck', 'shoulders', 13, -16, 8, 5.5, 'core'),
        B('skull', 'neck', 11, -2, 5, 3.5, 'core'),
        B('tail1', null, 22, 172, 12, 8, 'tail'),
        B('tail2', 'tail1', 20, 179, 8, 4.5, 'tail'),
        B('tail3', 'tail2', 15, 187, 4.5, 2.2, 'tail')
      ].concat(legs('h', null, 2, 46, [25, 19, 9], [-78, -96, -8], [10.5, 8, 5], 10, 'A', 'B'))
       .concat(legs('f', 'shoulders', 2, 34, [17, 15, 7], [-88, -93, -6], [8.5, 6, 4.2], 9, 'B', 'A')),
      head: ['neck', 'skull'], headYaw: 12,
      plates: [['shoulders', 0.74, 11], ['shoulders', 0.36, 15], ['spine', 0.86, 18],
               ['spine', 0.52, 22], ['spine', 0.16, 24], ['tail1', 0.20, 23],
               ['tail1', 0.62, 18], ['tail2', 0.26, 14], ['tail2', 0.66, 10], ['tail3', 0.34, 6]],
      spikes: [['tail3', 0.42, 11, 4], ['tail3', 0.42, 11, -4], ['tail3', 0.78, 9, 3.4], ['tail3', 0.78, 9, -3.4]],
      eyeOn: 'skull', eyeT: 0.45, eyeZ: 0.55
    }
  };

  /* ══ POSE ════════════════════════════════════════════════════════════════
     6 frames = one gait cycle. Biped alternates L/R; quadrupeds move
     diagonal pairs (gait groups A/B are wired that way in the rig above). */
  var ATK_K = [0, 0.25, 0.7, 1, 0.8, 0.4];

  function poseAdj(sp, rig, fsm, frame, phi) {
    var adj = {}, root = { dx: 0, dy: 0 }, i, b;
    function add(n, dp, dy) { var a = adj[n] || (adj[n] = { p: 0, y: 0 }); a.p += dp || 0; a.y += dy || 0; }

    if (fsm === 'walk') {
      var ph = (frame % 6) / 6 * Math.PI * 2;
      for (i = 0; i < rig.bones.length; i++) {
        b = rig.bones[i]; if (!b.g) continue;
        var pp = ph + (b.g === 'B' ? Math.PI : 0);
        if (b.seg === 0) add(b.n, Math.sin(pp) * 20);
        else if (b.seg === 1) add(b.n, -Math.sin(pp + 0.9) * 16);
        else add(b.n, Math.sin(pp + 1.7) * 13);
      }
      root.dy = Math.sin(ph * 2) * (sp === 'trex' ? 3 : 2);
      add('spine', 0, -Math.sin(ph) * 4);
      add('tail1', Math.sin(ph * 2) * 3, Math.sin(ph) * 7);
      add('tail2', 0, Math.sin(ph - 0.5) * 12);
      add('tail3', 0, Math.sin(ph - 1.0) * 16);
      add('neck', Math.sin(ph * 2) * 2.5);
    } else if (fsm === 'attack') {
      var k = ATK_K[frame % 6];
      if (sp === 'trex') {                       // BITE: neck drives forward, jaw drops
        root.dx = k * 5; root.dy = -k * 2;
        add('spine', k * 5); add('chest', k * 4);
        add('neck', -k * 16); add('skull', -k * 8); add('jaw', -k * 26);
        add('tail1', -k * 6); add('tail2', -k * 6);
        add('armL', -k * 22); add('armR', -k * 22);
      } else if (sp === 'triceratops') {         // HEAD TOSS: rear up, gore upward
        root.dy = k * 3;
        add('spine', k * 4); add('shoulders', k * 6);
        add('neck', k * 20); add('skull', k * 24); add('beak', k * 10);
        add('tail1', -k * 8);
        add('fThighL', -k * 26); add('fThighR', -k * 22);
        add('fShinL', -k * 14); add('fShinR', -k * 12);
      } else {                                   // THAGOMIZER: tail sweeps to viewer side
        root.dx = -k * 3;
        add('spine', 0, -k * 8); add('shoulders', 0, -k * 5);
        add('tail1', k * 8, -k * 18); add('tail2', k * 10, -k * 26); add('tail3', k * 12, -k * 34);
        add('neck', -k * 6); add('skull', -k * 4);
      }
    } else {                                     // idle — one static breath offset
      add('chest', -1.5); add('neck', 2); root.dy = 0.6;
    }
    /* The one deliberate sprite cheat: turn the HEAD toward the camera at the
       3/4 and profile facings. Costs nothing (it is just another yaw) and it is
       what keeps a face-mounted signature — the frill, the horns, the eye —
       readable at base 1/2/3 instead of collapsing edge-on. Zero at S (already
       facing us) and at N (facing away is the point). */
    if (rig.headYaw) {
      var hy = -rig.headYaw * Math.sin(phi);
      for (i = 0; i < rig.head.length; i++) add(rig.head[i], 0, hy);
    }
    return { adj: adj, root: root };
  }

  /* ══ SOLVE ══ resolve every bone to world endpoints (x fwd, y up, z lateral) */
  function solve(rig, p) {
    var out = {}, i;
    for (i = 0; i < rig.bones.length; i++) {
      var b = rig.bones[i];
      var par = b.p ? out[b.p] : null;
      var bx = par ? par.x1 : rig.root.x + p.root.dx;
      var by = par ? par.y1 : rig.root.y + p.root.dy;
      var bz = (par ? par.z1 : rig.root.z) + b.z;
      var a = p.adj[b.n] || { p: 0, y: 0 };
      var pit = (b.pitch + a.p) * D2R, yaw = (b.yaw + a.y) * D2R;
      var h = Math.cos(pit) * b.len;
      out[b.n] = { b: b, x0: bx, y0: by, z0: bz,
                   x1: bx + h * Math.cos(yaw), y1: by + Math.sin(pit) * b.len, z1: bz + h * Math.sin(yaw) };
    }
    return out;
  }

  /* ══ PROJECT ══ rotate about the vertical axis, fold iso tilt into screen y */
  function makeProj(rig, phi) {
    var sn = Math.sin(phi), cs = Math.cos(phi), S = rig.fit, sx = rig.shiftX;
    return function (x, y, z) {
      var X = (x + sx) * sn + z * cs;
      var D = -(x + sx) * cs + z * sn;
      return { x: AX + X * S, y: AY - y * S - D * S * TILT, d: D };
    };
  }
  /* Orthonormal basis of a bone: fwd along the bone, side lateral (turns with
     the bone's yaw), up = side × fwd. Frill + horns are built in this basis so
     they follow the head yaw instead of staying stuck to the world axes. */
  function basisOf(j) {
    var fx = j.x1 - j.x0, fy = j.y1 - j.y0, fz = j.z1 - j.z0;
    var L = Math.hypot(fx, fy, fz) || 1; fx /= L; fy /= L; fz /= L;
    var yaw = Math.atan2(fz, fx);
    var sx = -Math.sin(yaw), sz = Math.cos(yaw);
    return { fx: fx, fy: fy, fz: fz, sx: sx, sy: 0, sz: sz,
             ux: sz * fy, uy: sz * -fx - sx * fz, uz: sx * fy };
  }
  function yawBasis(b, a) {                 // rotate a basis about the vertical axis
    var c = Math.cos(a), n = Math.sin(a);
    return { fx: b.fx * c - b.fz * n, fy: b.fy, fz: b.fx * n + b.fz * c,
             sx: b.sx * c - b.sz * n, sy: b.sy, sz: b.sx * n + b.sz * c,
             ux: b.ux * c - b.uz * n, uy: b.uy, uz: b.ux * n + b.uz * c };
  }
  function lerpPt(j, t) {
    return { x: j.x0 + (j.x1 - j.x0) * t, y: j.y0 + (j.y1 - j.y0) * t, z: j.z0 + (j.z1 - j.z0) * t };
  }

  /* ══ PATHS ══ (re-issued per tone offset — no retained Path2D, §1.6) */
  function pathCap(ctx, s, dx, dy) {
    var ax = s.a.x + dx, ay = s.a.y + dy, bx = s.b.x + dx, by = s.b.y + dy;
    var th = Math.atan2(by - ay, bx - ax);
    ctx.beginPath();
    ctx.arc(bx, by, s.r1, th + HALF, th - HALF, true);
    ctx.arc(ax, ay, s.r0, th - HALF, th + HALF, true);
    ctx.closePath();
  }
  function pathPoly(ctx, s, dx, dy) {
    var p = s.pts; ctx.beginPath(); ctx.moveTo(p[0].x + dx, p[0].y + dy);
    for (var i = 1; i < p.length; i++) ctx.lineTo(p[i].x + dx, p[i].y + dy);
    ctx.closePath();
  }
  function issue(ctx, s, dx, dy) { (s.pts ? pathPoly : pathCap)(ctx, s, dx, dy); }

  /* one flat-tone group: STROKE every member first, then fill — interior
     strokes get painted over, so only the union boundary keeps its edge. */
  function paintGroup(ctx, list, tri, edge, sha, top, lit) {
    var i;
    ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    for (i = 0; i < list.length; i++) {
      if (tri) { issue(ctx, list[i], SHA_DX, SHA_DY); ctx.stroke(); issue(ctx, list[i], TOP_DX, TOP_DY); ctx.stroke(); }
      issue(ctx, list[i], 0, 0); ctx.stroke();
    }
    if (tri) {
      ctx.fillStyle = sha; for (i = 0; i < list.length; i++) { issue(ctx, list[i], SHA_DX, SHA_DY); ctx.fill(); }
      ctx.fillStyle = top; for (i = 0; i < list.length; i++) { issue(ctx, list[i], TOP_DX, TOP_DY); ctx.fill(); }
    }
    ctx.fillStyle = tri ? lit : sha;
    for (i = 0; i < list.length; i++) { issue(ctx, list[i], 0, 0); ctx.fill(); }
  }

  /* pointed dorsal element — the archetypes.js drawRidgeElement figure-ground
     idea (dark CORE triangle behind a lit FACE triangle), reimplemented in
     screen space so it survives a flat-tone neighbourhood. */
  function ridge(ctx, base0, base1, apex, faceC, coreC, edgeC) {
    var cx = (base0.x + base1.x) * 0.5, cy = (base0.y + base1.y) * 0.5;
    function tri(a, b, c) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.closePath(); }
    var g0 = { x: cx + (base0.x - cx) * 1.3, y: cy + (base0.y - cy) * 1.3 };
    var g1 = { x: cx + (base1.x - cx) * 1.3, y: cy + (base1.y - cy) * 1.3 };
    var ga = { x: cx + (apex.x - cx) * 1.14, y: cy + (apex.y - cy) * 1.14 };
    ctx.fillStyle = coreC; tri(g0, ga, g1); ctx.fill();
    ctx.fillStyle = faceC; tri(base0, apex, base1); ctx.fill();
    if (!edgeC) return;
    ctx.strokeStyle = edgeC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(base1.x, base1.y); ctx.lineTo(apex.x, apex.y); ctx.stroke();
  }

  /* ══ BUILD ══════════════════════════════════════════════════════════════ */
  function buildHybrid(ctx, w, h, pal, shape, base, frame, fsm) {
    var U = (window.GAME && window.GAME.Utils) || null;
    if (!U) return;
    // Honor the contract's w/h: geometry is authored in 150×168 body space, so a lo-res bake
    // (e.g. 50×56) is a real scaled bake, not a blank canvas (W0.3 harness finding).
    var sclX = (w || SPR_W) / SPR_W, sclY = (h || SPR_H) / SPR_H;
    var scaled = (sclX !== 1 || sclY !== 1);
    if (scaled) { ctx.save(); ctx.scale(sclX, sclY); }
    try {
      buildHybridBody(ctx, U, pal, shape, base, frame, fsm);
    } finally {
      if (scaled) ctx.restore();
    }
  }

  function buildHybridBody(ctx, U, pal, shape, base, frame, fsm) {
    var sp = (shape && shape.species) || 'trex';
    var rig = RIGS[sp] || RIGS.trex;
    var skin = toneBase({ skin: pal.skin || '#3c3c3c', skinLight: pal.skinLight });
    var C_TOP = U.shade(skin, T_TOP), C_LIT = U.shade(skin, T_LIT),
        C_SHA = U.shade(skin, T_SHA), C_EDGE = U.shade(skin, T_EDGE);
    var plate = pal.plate || U.shade(skin, 0.6), pEdge = pal.plateEdge || U.shade(skin, 1.5);
    var PF = plateFactor(skin, plate);
    var P_FACE = U.shade(plate, PF), P_CORE = U.shade(plate, PF * 0.46);

    var phi = FACE_RAD[U.clamp(base | 0, 0, 4)];
    var P = makeProj(rig, phi);
    var joints = solve(rig, poseAdj(sp, rig, fsm || 'idle', frame | 0, phi));

    var near = [], far = [], feats = [], i, j, k, nm;
    function cap(j0, r0, r1, forceFar) {
      var a = P(j0.x0, j0.y0, j0.z0), b = P(j0.x1, j0.y1, j0.z1);
      var d = (a.d + b.d) * 0.5, S = rig.fit;
      var s = { a: a, b: b, r0: r0 * S, r1: r1 * S, d: d };
      (forceFar || (j0.b.role !== 'core' && d > FAR_T) ? far : near).push(s);
      return s;
    }

    /* ── skin mass ── */
    for (nm in joints) {
      if (!Object.prototype.hasOwnProperty.call(joints, nm)) continue;
      j = joints[nm]; cap(j, j.b.t0, j.b.t1, false);
    }

    /* ── triceratops frill: a tilted ellipse shell in the HEAD basis, so it
         turns with the skull (plus its own camYaw cheat). Rendered in the
         plate family, NOT skin: a skin-toned frill merges with the neck it
         overlaps and collapses to a bare hoop. Painted between the far and
         near passes so the skull correctly overlaps its leading edge. ── */
    var frillDraw = null;
    if (rig.frill) {
      var f = rig.frill, fj = joints[f.on], bs = basisOf(fj);
      if (f.camYaw) bs = yawBasis(bs, -f.camYaw * D2R * Math.sin(phi));
      var ct = Math.cos(f.tilt * D2R), st = Math.sin(f.tilt * D2R);
      /* frill "up" = head-up tilted back about the side axis */
      var ax2 = bs.ux * ct - bs.fx * st, ay2 = bs.uy * ct - bs.fy * st, az2 = bs.uz * ct - bs.fz * st;
      var shells = [], sh, t, u, v, off, cx2, cy2, cz2;
      for (sh = 0; sh < 2; sh++) {
        off = -f.back + (sh ? f.thick : -f.thick);
        cx2 = fj.x1 + bs.fx * off; cy2 = fj.y1 + bs.fy * off; cz2 = fj.z1 + bs.fz * off;
        var pts = [], scal = [];
        for (i = 0; i < 20; i++) {
          t = i / 20 * Math.PI * 2; u = Math.cos(t) * f.hy; v = Math.sin(t) * f.hz;
          var pt = P(cx2 + ax2 * u + bs.sx * v, cy2 + ay2 * u + bs.sy * v, cz2 + az2 * u + bs.sz * v);
          pts.push(pt);
          if (i >= 3 && i <= 7) scal.push(pt);
        }
        shells.push({ pts: pts, scal: scal, d: P(cx2, cy2, cz2).d });
      }
      /* rim + scallops only on the NEARER shell — one clean contour, not two */
      frillDraw = { shells: shells, lead: shells[0].d <= shells[1].d ? shells[0] : shells[1] };
    }
    function paintFrill() {
      if (!frillDraw) return;
      var sl = frillDraw.shells, q;
      ctx.strokeStyle = U.shade(plate, PF * 0.32); ctx.lineWidth = 2; ctx.lineJoin = 'round';
      for (q = 0; q < 2; q++) { pathPoly(ctx, sl[q], SHA_DX, SHA_DY); ctx.stroke(); pathPoly(ctx, sl[q], 0, 0); ctx.stroke(); }
      ctx.fillStyle = P_CORE; for (q = 0; q < 2; q++) { pathPoly(ctx, sl[q], SHA_DX, SHA_DY); ctx.fill(); }
      ctx.fillStyle = P_FACE; for (q = 0; q < 2; q++) { pathPoly(ctx, sl[q], 0, 0); ctx.fill(); }
      ctx.strokeStyle = pEdge; ctx.lineWidth = 1.4;
      pathPoly(ctx, frillDraw.lead, 0, 0); ctx.stroke();
      ctx.fillStyle = U.shade(plate, PF * 0.52);
      for (q = 0; q < frillDraw.lead.scal.length; q++) {
        ctx.beginPath(); ctx.arc(frillDraw.lead.scal[q].x, frillDraw.lead.scal[q].y, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    }

    /* ── ridge features (steg plates + spikes, trex scutes, trike horns) ── */
    function mountRidge(spec, hMul, wMul, zFix) {
      var jj = joints[spec[0]]; if (!jj) return;
      var t = spec[1], hgt = spec[2] * hMul;
      var m = lerpPt(jj, t), dx = jj.x1 - jj.x0, dy = jj.y1 - jj.y0;
      var L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      var halfW = hgt * wMul;
      var z = zFix != null ? zFix : (spec[3] != null ? spec[3] : 0);
      var b0 = P(m.x - dx * halfW, m.y - dy * halfW, m.z + z);
      var b1 = P(m.x + dx * halfW, m.y + dy * halfW, m.z + z);
      var ap = P(m.x - dx * hgt * 0.22, m.y + hgt, m.z + z);
      var vx = b1.x - b0.x, vy = b1.y - b0.y, vL = Math.hypot(vx, vy), minW = 5.2;
      var thin = vL < minW * 0.92;
      if (vL < minW) {                       // edge-on: spread along screen-x
        var ux2 = vL > 0.01 ? vx / vL : 1, uy2 = vL > 0.01 ? vy / vL : 0, gap = (minW - vL) * 0.5;
        b0 = { x: b0.x - ux2 * gap, y: b0.y - uy2 * gap, d: b0.d };
        b1 = { x: b1.x + ux2 * gap, y: b1.y + uy2 * gap, d: b1.d };
      }
      feats.push({ kind: 'ridge', b0: b0, b1: b1, ap: ap, thin: thin, d: P(m.x, m.y, m.z + z).d });
    }
    if (rig.plates) for (i = 0; i < rig.plates.length; i++) mountRidge(rig.plates[i], 1, 0.40, (i % 2 ? -3.5 : 3.5));
    if (rig.spikes) for (i = 0; i < rig.spikes.length; i++) mountRidge(rig.spikes[i], 1, 0.20, rig.spikes[i][3]);
    if (rig.scutes) for (i = 0; i < rig.scutes.length; i++) mountRidge(rig.scutes[i], 1, 0.55, 0);
    if (rig.horns) for (i = 0; i < rig.horns.length; i++) {
      var hn = rig.horns[i], hj = joints[hn[0]]; if (!hj) continue;
      var hb = basisOf(hj), hm = lerpPt(hj, hn[1]), ha = hn[2] * D2R, hl = hn[3], hz = hn[5];
      var dcx = hb.fx * Math.cos(ha) + hb.ux * Math.sin(ha);
      var dcy = hb.fy * Math.cos(ha) + hb.uy * Math.sin(ha);
      var dcz = hb.fz * Math.cos(ha) + hb.uz * Math.sin(ha);
      var bx2 = hm.x + hb.sx * hz, by2 = hm.y + hb.sy * hz, bz2 = hm.z + hb.sz * hz;
      var hp0 = P(bx2, by2, bz2);
      var hp1 = P(bx2 + dcx * hl, by2 + dcy * hl, bz2 + dcz * hl);
      feats.push({ kind: 'horn', a: hp0, b: hp1, r: hn[4] * rig.fit, d: hp0.d });
    }

    /* ══ PAINT ══════════════════════════════════════════════════════════ */
    /* ground contact ellipse — derived from the PROJECTED feet, so it tracks
       the iso stagger (near feet sit lower on screen than far ones). */
    var fx0 = 1e9, fx1 = -1e9, fy0 = 1e9, fy1 = -1e9, fn = 0, fp;
    for (nm in joints) {
      if (!/Foot/.test(nm)) continue;
      fp = P(joints[nm].x1, joints[nm].y1, joints[nm].z1); fn++;
      if (fp.x < fx0) fx0 = fp.x; if (fp.x > fx1) fx1 = fp.x;
      if (fp.y < fy0) fy0 = fp.y; if (fp.y > fy1) fy1 = fp.y;
    }
    if (!fn) { fx0 = fx1 = AX; fy0 = fy1 = AY; }
    var shRY = (fy1 - fy0) * 0.5 + 5.5 * rig.fit;
    var shCY = Math.min((fy0 + fy1) * 0.5 + 1, SPR_H - 2 - shRY);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse((fx0 + fx1) * 0.5, shCY,
                (fx1 - fx0) * 0.5 + rig.shadowR * rig.fit * 0.42, shRY, 0, 0, Math.PI * 2);
    ctx.fill();

    feats.sort(function (a, b) { return b.d - a.d; });
    function paintFeats(wantFar) {
      for (k = 0; k < feats.length; k++) {
        var ft = feats[k], isFar = ft.d > FAR_T;
        if (isFar !== wantFar) continue;
        var fc = isFar ? U.shade(plate, PF * 0.66) : P_FACE, cc = isFar ? U.shade(plate, PF * 0.32) : P_CORE;
        if (ft.kind === 'ridge') ridge(ctx, ft.b0, ft.b1, ft.ap, fc, cc, ft.thin ? null : (isFar ? cc : pEdge));
        else if (ft.kind === 'horn') {
          ctx.fillStyle = fc; pathCap(ctx, { a: ft.a, b: ft.b, r0: ft.r, r1: ft.r * 0.18 }, 0, 0); ctx.fill();
          ctx.strokeStyle = isFar ? cc : pEdge; ctx.lineWidth = 1;
          pathCap(ctx, { a: ft.a, b: ft.b, r0: ft.r, r1: ft.r * 0.18 }, 0, 0); ctx.stroke();
        }
      }
    }

    paintGroup(ctx, far, false, U.shade(skin, 0.4), C_SHA);
    paintFeats(true);
    paintFrill();
    paintGroup(ctx, near, true, C_EDGE, C_SHA, C_TOP, C_LIT);
    paintFeats(false);

    /* ── rim: thin bright polyline along the top contour of the core chain ── */
    if (base >= 1 && base <= 3) {
    ctx.strokeStyle = RIM; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (i = 0; i < rig.core.length; i++) {
      j = joints[rig.core[i]]; if (!j) continue;
      var rp = P(j.x1, j.y1, j.z1);
      var rr = j.b.t1 * rig.fit * 0.92;
      if (i === 0) {
        var r0 = P(j.x0, j.y0, j.z0);
        ctx.moveTo(r0.x, r0.y - j.b.t0 * rig.fit * 0.92);
      }
      ctx.lineTo(rp.x, rp.y - rr);
    }
    ctx.stroke();
    }

    /* ── eye: correct side per facing; both at S, one at SE/E/NE, none at N ── */
    var ej = joints[rig.eyeOn];
    if (ej && -Math.cos(phi) < 0.85) {
      var em = lerpPt(ej, rig.eyeT), er = ej.b.t0 * rig.eyeZ;
      for (i = 0; i < 2; i++) {
        var ez = i ? -er : er;
        var ep = P(em.x, em.y + ej.b.t0 * 0.30, em.z + ez);
        if (ep.d > 0.5) continue;
        var rad = 2.6 * rig.fit;
        ctx.fillStyle = pal.eye || '#e8e8e8';
        ctx.beginPath(); ctx.arc(ep.x, ep.y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = U.shade(pal.eye || '#e8e8e8', 0.42); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ep.x, ep.y, rad, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  /* ── registration ──────────────────────────────────────────────────────── */
  window.STYLEFORGE = window.STYLEFORGE || { styles: {} };
  window.STYLEFORGE.styles.hybrid = {
    name: 'Rig + Flat-Tone (shipping candidate)',
    blurb: 'Bone-rig creatures in the city\'s own three-tone light. Bones make every facing and ' +
           'walk frame analytic; strict flat tones (0.74 / 1.12 / 1.32 of skin, exactly the ' +
           'drawPrismBuilding multipliers) let overlapping limbs merge into one silhouette — ' +
           'which is what makes 12 procedurally-assembled species affordable.',
    build: buildHybrid
  };
  window.STYLEFORGE.styles.hybrid._rigs = RIGS;   // harness/tooling introspection
})();
