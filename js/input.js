/* GAME.Input — Pointer + keyboard collapsed into ONE intent struct (blueprint §6).
 *
 * Public surface (API contract §3):
 *   GAME.Input.init(canvas, camera)
 *   GAME.Input.consume() -> { moveX, moveY, attack:bool, target:{col,row}|null, jump:bool }
 *   GAME.Input.isTouch        (bool — true once any touch/pen pointer is seen)
 *   GAME.Input.facing         (0..7 — last meaningful heading, for the player/HUD)
 *
 * Control-visual state for the renderer (read-only, read once per frame):
 *   GAME.Input.joystick = { active, baseX, baseY, dx, dy }   // screen-space, normalized dx/dy
 *   GAME.Input.smashBtn = { x, y, r }                         // screen-space disc
 *   GAME.Input.jumpBtn  = { x, y, r }                         // screen-space jump disc
 *   GAME.Input.hovered  = {col,row}|null                     // desktop hover highlight
 *
 * Deps (called by name, never constructed here):
 *   GAME.iso.pickTile(clientX,clientY) -> {col,row}|null   (click/hover → cell)
 *   GAME.World.getBuildingAt(col,row) -> b|null
 *   GAME.World.footprintsNear(wx,wy,band) -> [b]
 *   GAME.World.tileToWorld(col,row) -> {wx,wy}
 *   GAME.Config.GRID (TILE_W, for px→world conversion in targeting)
 *
 * Note: Input owns no shake/particles, so it has nothing to gate on
 * GAME.Utils.reducedMotion — that lives in Render/FX. All World/iso deps are
 * called defensively (guarded) so Input degrades gracefully if a sibling module
 * loads late or is stubbed during integration.
 *
 * Integration notes:
 *   - `moveX/moveY` is a WORLD-space unit-ish direction (+moveY = forward/deeper rows,
 *     +moveX = screen-right). The player/kaiju update owns the locomotion sim
 *     (accel/maxSpeed/friction/collision per §6) — Input only emits the desired heading.
 *   - `attack` is edge-true for exactly ONE consume(): it latches on Space / SMASH-press /
 *     left-click, and clears the instant consume() reads it. Rate-gating to the attack
 *     cooldown is the economy/kaiju's job, not Input's.
 *   - `target` is the clicked/SMASH-resolved building cell (or null); it is also one-shot,
 *     cleared on consume so a stale target never re-fires.
 *   - `jump` is edge-true for exactly ONE consume(): it latches on Shift/KeyJ / jump-disc-press,
 *     and clears the instant consume() reads it. Rate-gating is the kaiju's job.
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Input = {};

  // ---- Tunables (control geometry; gameplay numbers stay in Config) -----------
  // Touch-control geometry — consolidated into Config.INPUT_GEO (U9, research-locked U4);
  // literal fallbacks keep this behavior-identical if Config is older.
  var _GEO = (G.Config && G.Config.INPUT_GEO) || {};
  var JOY_RADIUS = (_GEO.JOY_RADIUS != null ? _GEO.JOY_RADIUS : 70);
  var JOY_DEADZONE = (_GEO.JOY_DEADZONE != null ? _GEO.JOY_DEADZONE : 0.12);
  var SMASH_MIN = (_GEO.SMASH_MIN != null ? _GEO.SMASH_MIN : 96);
  var JUMP_MIN = (_GEO.JUMP_MIN != null ? _GEO.JUMP_MIN : 76);
  var FINISHER_MIN = (_GEO.FINISHER_MIN != null ? _GEO.FINISHER_MIN : 76);
  var LEFT_ZONE = (_GEO.LEFT_ZONE != null ? _GEO.LEFT_ZONE : 0.42);   // left band spawns the joystick (rest = tap-to-target)
  var FACE_AHEAD_PX = (_GEO.FACE_AHEAD_PX != null ? _GEO.FACE_AHEAD_PX : 28);
  var NEAR_TARGET_PX = (_GEO.NEAR_TARGET_PX != null ? _GEO.NEAR_TARGET_PX : 40);

  // ---- Wiring -----------------------------------------------------------------
  var canvas = null;
  var camera = null;
  var W = 0, H = 0;        // CSS pixels (client size), refreshed lazily

  // ---- Intent accumulators (collapsed to one struct on consume) ---------------
  // Desired world-space move direction, already un-projected through iso.
  var moveX = 0, moveY = 0;
  var attackLatched = false;          // edge-true; cleared on consume
  var jumpLatched = false;            // edge-true; cleared on consume
  var pendingTarget = null;           // {col,row}; cleared on consume

  // ---- Public visual state ----------------------------------------------------
  Input.isTouch = false;
  // DISPLAY modality ('touch'|'desktop') — decoupled from the sticky isTouch INPUT-routing
  // flag (UP / research-2026-06b note 2). Render reads this to pick discs vs key-legend.
  // Seeded from a media query in init; flips to 'touch' on the first touch/pen pointer.
  // Routing is NEVER driven by this — only isTouch gates the multi-thumb branch — so a
  // hybrid (touch+mouse) laptop keeps correct mouse handling regardless of what's drawn.
  Input.currentInput = 'desktop';
  Input.facing = 2;                   // default look forward (+wy); see facing table below
  Input.joystick = { active: false, baseX: 0, baseY: 0, dx: 0, dy: 0 };
  Input.smashBtn = { x: 0, y: 0, r: 0 };
  Input.jumpBtn = { x: 0, y: 0, r: 0 };
  Input.finisherBtn = { x: 0, y: 0, r: 0 };   // NOVA disc (left of SMASH); inert until owned
  Input.hovered = null;

  // ---- Pointer bookkeeping (multi-thumb: joystick id vs smash id vs jump id) -----
  var joyPointerId = null;            // pointerId driving the joystick
  var joyCurX = 0, joyCurY = 0;       // current touch position for that pointer
  var smashPointerId = null;          // pointerId holding the SMASH disc
  var jumpPointerId = null;           // pointerId holding the JUMP disc
  var finisherPointerId = null;       // pointerId holding the NOVA disc (charging Nova Slam)
  var mouseAtkPointerId = null;       // desktop left button held → autofire + cursor-aim
  var cursorClientX = null, cursorClientY = null;  // last desktop cursor pos (raw client px)

  // ---- Keyboard state (8-way digital + jump) --------------------------------
  var keyUp = false, keyDown = false, keyLeft = false, keyRight = false;
  var keyJump = false;                // Shift or KeyJ
  var spaceHeld = false;              // Space held → autofire (rate-gated downstream by the kaiju)
  var keyFHeld = false;               // F held → charging Nova Slam (level state, read in consume)
  var chargeReleaseLatched = false;   // one-shot: NOVA disc/F released → fire the finisher

  /* --------------------------------------------------------------------------
   * SCREEN → WORLD direction mapping  (blueprint §6: "up-screen = forward (+wy)").
   *
   * IMPORTANT: this is NOT the geometric inverse of the §5 projection. In a 2:1
   * iso the +wy axis visually descends toward the bottom-left of the screen
   * (worldToScreen(0,1,0) = (-32,+16)), so inverting the projection would make
   * pushing UP on screen walk BACKWARD. The control contract instead pins a fixed,
   * intuitive relabel of the screen axes onto the world axes:
   *
   *     screen-up    (dys < 0)  ->  +wy   (forward, deeper rows)   ["W = +wy"]
   *     screen-right (dxs > 0)  ->  +wx   (screen-right)           ["D = +wx"]
   *
   * i.e.  wx =  dxs ,  wy = -dys , then normalize. The renderer applies the iso
   * slant when it projects this world heading back to the screen, so movement
   * still LOOKS isometric while the stick stays "up = into the scene".
   * ------------------------------------------------------------------------ */
  function screenDirToWorld(dxs, dys, out) {
    // Screen-relative controls: produce the WORLD direction whose on-screen motion
    // equals the stick's screen direction (push up = go up on screen). This is the
    // TRUE inverse of the 2:1 iso projection (x=(wx-wy)*HW, y=(wx+wy)*HH):
    //   dwx = ½(dxs/HW + dys/HH),  dwy = ½(dys/HH − dxs/HW).
    var GG = window.GAME.Config.GRID, HW = GG.TILE_W * 0.5, HH = GG.TILE_H * 0.5;
    var wx = 0.5 * (dxs / HW + dys / HH);
    var wy = 0.5 * (dys / HH - dxs / HW);
    var m = Math.hypot(wx, wy);
    if (m > 1e-6) { out.x = wx / m; out.y = wy / m; }
    else { out.x = 0; out.y = 0; }
  }
  var _wdir = { x: 0, y: 0 }; // scratch (no per-frame alloc in the touch path)

  /* --------------------------------------------------------------------------
   * Facing: 8 sectors from a world-space heading.
   * atan2(wy, wx): 0 == +wx (screen-right), PI/2 == +wy (forward), stepping CCW
   * by 45°. Entities author {S,SE,E,NE} and mirror-X for the rest, so the only
   * requirement is that this index is stable and continuous around the circle.
   *   idx 0:+wx  1:+wx+wy  2:+wy(forward)  3:-wx+wy  4:-wx  5:-wx-wy  6:-wy  7:+wx-wy
   * ------------------------------------------------------------------------ */
  function facingFromWorld(wx, wy) {
    if (wx === 0 && wy === 0) return Input.facing;
    // The sprite poses (FACING_MAP) live in SCREEN space, and world→screen is the
    // 2:1 iso SKEW — not a rotation. Indexing the raw world angle gave facings ~opposite
    // to the real on-screen motion (push right → faced down-left). So project the world
    // heading to screen first, then index in the sprite basis (matches entities
    // headingToFacing: atan2(screenX, screenY), 0=S/down, 2=E/right).
    var GG = window.GAME.Config.GRID, HW = GG.TILE_W * 0.5, HH = GG.TILE_H * 0.5;
    var sx = (wx - wy) * HW, sy = (wx + wy) * HH;
    var idx = Math.round(Math.atan2(sx, sy) / (Math.PI / 4));
    return ((idx % 8) + 8) % 8;
  }

  // ---- Geometry helpers -------------------------------------------------------
  function refreshSize() {
    // Client (CSS) size; cheap, avoids stale layout after a resize.
    if (!canvas) return;
    W = canvas.clientWidth || canvas.width || 0;
    H = canvas.clientHeight || canvas.height || 0;
    layoutSmash();
  }

  // Read env(safe-area-inset-*) via a hidden probe element — Canvas2D layout can't use
  // CSS env() directly, and on a full-bleed iPad PWA (viewport-fit=cover) the bottom-right
  // discs would otherwise sit under the home-indicator strip. Probe created once, lazily.
  var _saiProbe = null;
  function safeAreaInsets() {
    if (!_saiProbe) {
      try {
        _saiProbe = document.createElement('div');
        _saiProbe.style.cssText =
          'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
          'padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);' +
          'padding-left:env(safe-area-inset-left);padding-top:env(safe-area-inset-top);';
        document.body.appendChild(_saiProbe);
      } catch (_) { return { right: 0, bottom: 0, left: 0, top: 0 }; }
    }
    var cs = window.getComputedStyle(_saiProbe);
    return {
      right:  parseFloat(cs.paddingRight)  || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left:   parseFloat(cs.paddingLeft)   || 0,
      top:    parseFloat(cs.paddingTop)    || 0
    };
  }

  function layoutSmash() {
    // Fixed bottom-right discs: SMASH (lower) and JUMP (upper), NOVA left of SMASH.
    // Inset from safe edges + the home-indicator/notch via env(safe-area-inset-*).
    var r = Math.max(SMASH_MIN / 2, Math.round(Math.min(W, H) * 0.085));
    var sai = safeAreaInsets();
    var insetX = r + 26 + sai.right;
    var insetY = r + 26 + sai.bottom;

    Input.smashBtn.r = r;
    Input.smashBtn.x = W - insetX;
    Input.smashBtn.y = H - insetY;

    var rj = Math.max(JUMP_MIN / 2, Math.round(Math.min(W, H) * 0.075));
    var gapVertical = r + rj + 24;  // space between disc centres
    Input.jumpBtn.r = rj;
    Input.jumpBtn.x = W - insetX;
    Input.jumpBtn.y = H - insetY - gapVertical;

    // NOVA disc — L-shape: left of SMASH, same baseline (research-locked geometry).
    var rf = Math.max(FINISHER_MIN / 2, Math.round(Math.min(W, H) * 0.075));
    Input.finisherBtn.r = rf;
    Input.finisherBtn.x = W - insetX - (r + rf + 24);
    Input.finisherBtn.y = H - insetY;
  }

  function inSmash(x, y) {
    var b = Input.smashBtn;
    var dx = x - b.x, dy = y - b.y;
    return (dx * dx + dy * dy) <= (b.r * b.r);
  }

  function inJump(x, y) {
    var b = Input.jumpBtn;
    var dx = x - b.x, dy = y - b.y;
    return (dx * dx + dy * dy) <= (b.r * b.r);
  }

  // NOVA disc hit-test — inert (returns false) until the finisher is purchased, so
  // taps there fall through to tap-to-target before the player owns Nova Slam.
  function inFinisher(x, y) {
    if (!(G.Economy && G.Economy.finisherOwned)) return false;
    var b = Input.finisherBtn;
    var dx = x - b.x, dy = y - b.y;
    return (dx * dx + dy * dy) <= (b.r * b.r);
  }

  function localPoint(e) {
    // clientX/Y -> canvas-local CSS pixels.
    var rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ---- Targeting (blueprint §6 priority) --------------------------------------
  // 1) explicit clicked cell if it holds a STANDING building
  // 2) the building ~FACE_AHEAD_PX ahead along current heading
  // 3) nearest standing building within NEAR_TARGET_PX
  function isStanding(b) { return b && b.state === 'standing'; }

  function resolveClickTarget(col, row) {
    if (col == null) return null;
    var b = G.World && G.World.getBuildingAt ? G.World.getBuildingAt(col, row) : null;
    if (isStanding(b)) return { col: col, row: row };
    return null; // not standing → fall through to facing/nearest at attack time
  }

  // Explicit aim at a raw client point. Sprite-hitbox first: the building whose
  // DRAWN sprite is under the point (so ANY part of a tall building targets it, not
  // just its base), else a flyer (plane) at altitude. Returns {col,row} or null
  // (null → caller falls to faced/nearest at fire time).
  function resolveAimAt(cx, cy) {
    if (G.World && G.World.pickBuildingAtScreen) {
      var b = G.World.pickBuildingAtScreen(cx, cy);
      if (b && b.state === 'standing') return { col: b.col, row: b.row };
    }
    if (G.World && G.World.pickFlyer) {
      var f = G.World.pickFlyer(cx, cy);
      if (f && f.state === 'standing') return { col: Math.round(f.col), row: Math.round(f.row) };
    }
    return null;
  }

  // World position of the player, if discoverable (entities own the unit; we ask
  // the active unit through a light global hook the integrator sets, else use the
  // current move heading from the player's last known tile). We keep this defensive.
  function playerWorldPos() {
    var u = G._activeUnit; // optional hook: game.js may set GAME._activeUnit = unit
    if (u && u.pos) return { wx: u.pos.wx, wy: u.pos.wy };
    return null;
  }

  // Pick a building ahead of / nearest to the player using World.footprintsNear.
  function facedOrNearestTarget(headX, headY) {
    var p = playerWorldPos();
    if (!p || !G.World || !G.World.footprintsNear) return null;

    var GRID = G.Config.GRID;
    // Convert "px ahead" to world units (TILE_W maps 1 world-x to TILE_W/2 px → use ratio).
    var aheadW = FACE_AHEAD_PX / (GRID.TILE_W * 0.5); // ~world units forward
    var nearW = NEAR_TARGET_PX / (GRID.TILE_W * 0.5);

    // (2) faced: sample a point ahead along the heading.
    if (headX !== 0 || headY !== 0) {
      var hm = Math.hypot(headX, headY) || 1;
      var fx = p.wx + (headX / hm) * aheadW;
      var fy = p.wy + (headY / hm) * aheadW;
      var listF = G.World.footprintsNear(fx, fy, 1.2);
      var bestF = null, bestFd = Infinity;
      for (var i = 0; i < listF.length; i++) {
        var bf = listF[i];
        if (!isStanding(bf)) continue;
        var c = footprintCenterWorld(bf);
        if (!c) continue;
        var d = (c.wx - fx) * (c.wx - fx) + (c.wy - fy) * (c.wy - fy);
        if (d < bestFd) { bestFd = d; bestF = bf; }
      }
      if (bestF) return { col: bestF.col, row: bestF.row };
    }

    // (3) nearest standing within range of the player.
    var listN = G.World.footprintsNear(p.wx, p.wy, nearW + 1.5);
    var bestN = null, bestNd = Infinity;
    var nearW2 = nearW * nearW;
    for (var j = 0; j < listN.length; j++) {
      var bn = listN[j];
      if (!isStanding(bn)) continue;
      var cn = footprintCenterWorld(bn);
      if (!cn) continue;
      var dn = (cn.wx - p.wx) * (cn.wx - p.wx) + (cn.wy - p.wy) * (cn.wy - p.wy);
      if (dn < bestNd && dn <= nearW2) { bestNd = dn; bestN = bn; }
    }
    if (bestN) return { col: bestN.col, row: bestN.row };
    return null;
  }

  function footprintCenterWorld(b) {
    // Buildings expose {col,row,footprint:{w,h}}; center = tileToWorld + half-footprint.
    if (!G.World || !G.World.tileToWorld) return null;
    var t = G.World.tileToWorld(b.col, b.row);
    if (!t) return null;
    var fw = (b.footprint && b.footprint.w) ? b.footprint.w : 1;
    var fh = (b.footprint && b.footprint.h) ? b.footprint.h : 1;
    return { wx: t.wx + (fw - 1) * 0.5, wy: t.wy + (fh - 1) * 0.5 };
  }

  /* ==========================================================================
   * POINTER EVENTS  (Pointer Events API; control pointers only get preventDefault)
   * ======================================================================== */
  function isControlPointer(e) {
    // Anything that lands on the canvas is a control pointer. HUD/#shop DOM sit
    // above the canvas with their own pointer-events, so their events never reach
    // these listeners — leaving them scrollable/clickable as required.
    return e.target === canvas;
  }

  function onPointerDown(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') { Input.isTouch = true; Input.currentInput = 'touch'; }
    if (!isControlPointer(e)) return;

    var p = localPoint(e);

    if (Input.isTouch) {
      // ---- Touch: multi-thumb. JUMP and SMASH discs claim their own pointerIds. ----
      if (inJump(p.x, p.y) && jumpPointerId === null) {
        jumpPointerId = e.pointerId;
        fireJump();                         // press-to-jump (rate-gated downstream)
        capture(e);
        e.preventDefault();
        return;
      }
      if (inSmash(p.x, p.y) && smashPointerId === null) {
        smashPointerId = e.pointerId;
        fireAttack();                       // press-to-smash (rate-gated downstream)
        capture(e);
        e.preventDefault();
        return;
      }
      // NOVA disc (only when owned): claim the pointer; charge accrues in consume()
      // while held (no latch on press). Checked before the joystick/tap fallthrough.
      if (inFinisher(p.x, p.y) && finisherPointerId === null) {
        finisherPointerId = e.pointerId;
        capture(e);
        e.preventDefault();
        return;
      }
      // Floating joystick: only in the left zone, only if not already active.
      if (p.x <= W * LEFT_ZONE && joyPointerId === null) {
        joyPointerId = e.pointerId;
        Input.joystick.active = true;
        Input.joystick.baseX = p.x;
        Input.joystick.baseY = p.y;
        Input.joystick.dx = 0;
        Input.joystick.dy = 0;
        joyCurX = p.x; joyCurY = p.y;
        capture(e);
        e.preventDefault();
        return;
      }
      // Touch elsewhere (right/upper zone, not on a control disc): TAP a structure to
      // target it — sprite-hitbox pick, so ANY part of a (tall) building counts, not
      // just its base; planes too. (Left zone is the joystick; discs handled above.)
      // Empty street → no target → no-op (the disc smashes what's in front).
      var ttgt = resolveAimAt(e.clientX, e.clientY);
      if (ttgt) {
        pendingTarget = ttgt;
        faceTowardCell(ttgt.col, ttgt.row);
        fireAttack();
      }
      e.preventDefault();
      return;
    }

    // ---- Desktop: left button = aim (building OR plane) + attack; HOLD = autofire. ----
    if (e.button === 0) {
      cursorClientX = e.clientX; cursorClientY = e.clientY;
      var t = resolveAimAt(e.clientX, e.clientY);
      if (t) { pendingTarget = t; faceTowardCell(t.col, t.row); }
      fireAttack();                          // press fires immediately
      mouseAtkPointerId = e.pointerId;        // held → continuous autofire (consume re-latches + re-aims)
      capture(e);
      e.preventDefault();
    }
  }

  function onPointerMove(e) {
    if (!isControlPointer(e) && e.pointerId !== joyPointerId && e.pointerId !== smashPointerId && e.pointerId !== jumpPointerId && e.pointerId !== finisherPointerId && e.pointerId !== mouseAtkPointerId) {
      // Move that isn't over the canvas and isn't one of our captured control
      // pointers → ignore (let DOM handle hover/scroll).
      return;
    }

    if (e.pointerId === mouseAtkPointerId) {
      // Desktop left button held + dragging → the beam follows the cursor.
      cursorClientX = e.clientX; cursorClientY = e.clientY;
      e.preventDefault();
      return;
    }

    if (e.pointerId === joyPointerId) {
      var p = localPoint(e);
      joyCurX = p.x; joyCurY = p.y;
      updateJoystickVector();
      e.preventDefault();
      return;
    }

    if (e.pointerId === smashPointerId) {
      // Holding SMASH; nothing positional to do, just swallow.
      e.preventDefault();
      return;
    }

    if (e.pointerId === jumpPointerId) {
      // Holding JUMP; nothing positional to do, just swallow.
      e.preventDefault();
      return;
    }

    if (e.pointerId === finisherPointerId) {
      // Holding NOVA (charging); nothing positional, just swallow.
      e.preventDefault();
      return;
    }

    // Desktop hover highlight (no buttons held).
    if (!Input.isTouch && e.target === canvas) {
      cursorClientX = e.clientX; cursorClientY = e.clientY;
      var cell = G.iso && G.iso.pickTile ? G.iso.pickTile(e.clientX, e.clientY) : null;
      Input.hovered = cell || null;
    }
  }

  function onPointerUp(e) {
    if (e.pointerId === joyPointerId) {
      releaseJoystick();
      release(e);
      e.preventDefault();
      return;
    }
    if (e.pointerId === smashPointerId) {
      smashPointerId = null;
      release(e);
      e.preventDefault();
      return;
    }
    if (e.pointerId === jumpPointerId) {
      jumpPointerId = null;
      release(e);
      e.preventDefault();
      return;
    }
    if (e.pointerId === finisherPointerId) {
      finisherPointerId = null;
      chargeReleaseLatched = true;          // deliberate release → fire the charged slam
      release(e);
      e.preventDefault();
      return;
    }
    if (e.pointerId === mouseAtkPointerId) {
      mouseAtkPointerId = null;             // release → autofire stops
      release(e);
      e.preventDefault();
      return;
    }
  }

  function onPointerCancel(e) {
    // Treat cancel/leave like up for our control pointers (robust against OS gestures).
    if (e.pointerId === joyPointerId) { releaseJoystick(); release(e); return; }
    if (e.pointerId === smashPointerId) { smashPointerId = null; release(e); return; }
    if (e.pointerId === jumpPointerId) { jumpPointerId = null; release(e); return; }
    // NOVA cancel: drop the pointer WITHOUT latching a release — an OS-gesture cancel
    // silently discards the charge instead of detonating an unintended slam.
    if (e.pointerId === finisherPointerId) { finisherPointerId = null; release(e); return; }
    // Desktop autofire pointer: a cancel without a blur (e.g. an iPadOS trackpad gesture
    // on the captured pointer) otherwise leaves mouseAtkPointerId set → stuck autofire.
    if (e.pointerId === mouseAtkPointerId) { mouseAtkPointerId = null; release(e); return; }
  }

  function capture(e) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
  function release(e) { try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} }

  // ---- Joystick math ----------------------------------------------------------
  function updateJoystickVector() {
    var dx = joyCurX - Input.joystick.baseX;
    var dy = joyCurY - Input.joystick.baseY;
    var dist = Math.hypot(dx, dy);
    if (dist > JOY_RADIUS) { var k = JOY_RADIUS / dist; dx *= k; dy *= k; dist = JOY_RADIUS; }
    // Store normalized stick offset for the renderer (visual knob position).
    Input.joystick.dx = dx / JOY_RADIUS;
    Input.joystick.dy = dy / JOY_RADIUS;

    var mag = dist / JOY_RADIUS;
    if (mag < JOY_DEADZONE) {
      moveX = 0; moveY = 0;
      return;
    }
    // Re-scale past the deadzone so the first active push isn't a jump.
    var scaled = (mag - JOY_DEADZONE) / (1 - JOY_DEADZONE); // 0..1
    // Un-project the SCREEN stick direction → WORLD direction (up = forward).
    screenDirToWorld(dx, dy, _wdir);
    moveX = _wdir.x * scaled;
    moveY = _wdir.y * scaled;
    Input.facing = facingFromWorld(_wdir.x, _wdir.y);
  }

  function releaseJoystick() {
    joyPointerId = null;
    Input.joystick.active = false;
    Input.joystick.dx = 0;
    Input.joystick.dy = 0;
    moveX = 0; moveY = 0;
  }

  /* ==========================================================================
   * KEYBOARD  (WASD / arrows → 8-way digital, rotated into iso; Space = attack; Shift/J = jump)
   * ======================================================================== */
  function onKeyDown(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    keyUp = true; break;
      case 'KeyS': case 'ArrowDown':  keyDown = true; break;
      case 'KeyA': case 'ArrowLeft':  keyLeft = true; break;
      case 'KeyD': case 'ArrowRight': keyRight = true; break;
      case 'Space':
        e.preventDefault();
        if (e.repeat) return;          // OS key-repeat ignored; autofire is handled in consume()
        spaceHeld = true;              // held → autofire each consume (gate rate-limits)
        fireAttack();                  // immediate first hit on the press frame
        return;
      case 'ShiftLeft': case 'ShiftRight': case 'KeyJ':
        if (e.repeat) return;          // ignore auto-repeat (one jump per press)
        fireJump();
        e.preventDefault();
        return;
      case 'KeyF':
        e.preventDefault();
        if (e.repeat) return;          // hold = charge; OS key-repeat ignored
        keyFHeld = true;               // charging Nova Slam (read each consume)
        return;
      default: return;
    }
    e.preventDefault();
    updateKeyboardVector();
  }

  function onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    keyUp = false; break;
      case 'KeyS': case 'ArrowDown':  keyDown = false; break;
      case 'KeyA': case 'ArrowLeft':  keyLeft = false; break;
      case 'KeyD': case 'ArrowRight': keyRight = false; break;
      case 'Space':
        spaceHeld = false;             // release → autofire stops
        return;
      case 'KeyF':
        keyFHeld = false;
        chargeReleaseLatched = true;   // release → fire the charged slam
        return;
      case 'ShiftLeft': case 'ShiftRight': case 'KeyJ':
        keyJump = false;
        return;
      default: return;
    }
    updateKeyboardVector();
  }

  function updateKeyboardVector() {
    // Build a SCREEN-space intent from the keys (W = screen-up), then un-project
    // it into WORLD so W maps to forward(+wy) and D to +wx — exactly the §6 note.
    var sx = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
    var sy = (keyDown ? 1 : 0) - (keyUp ? 1 : 0); // screen-down positive
    if (sx === 0 && sy === 0) { moveX = 0; moveY = 0; return; }
    screenDirToWorld(sx, sy, _wdir);
    moveX = _wdir.x; moveY = _wdir.y;
    Input.facing = facingFromWorld(_wdir.x, _wdir.y);
  }

  /* ==========================================================================
   * ATTACK latching + JUMP latching + facing helpers
   * ======================================================================== */
  function fireAttack() { attackLatched = true; }

  function fireJump() { jumpLatched = true; }

  function faceTowardCell(col, row) {
    var p = playerWorldPos();
    if (!p || !G.World || !G.World.tileToWorld) return;
    var t = G.World.tileToWorld(col, row);
    if (!t) return;
    var dx = t.wx - p.wx, dy = t.wy - p.wy;
    if (dx !== 0 || dy !== 0) Input.facing = facingFromWorld(dx, dy);
  }

  /* ==========================================================================
   * PUBLIC: init / consume
   * ======================================================================== */
  Input.init = function (cv, cam) {
    canvas = cv;
    camera = cam;

    // Crisp pixels + kill native gestures ON THE CANVAS ONLY.
    try { canvas.style.touchAction = 'none'; } catch (_) {}

    refreshSize();

    // Seed the DISPLAY modality from the pointer media queries (research-2026-06b §21/§100):
    // coarse-ONLY (phone/tablet) -> 'touch'; anything with a fine pointer (desktop, AND
    // hybrid touch-laptops) -> 'desktop' so the key-legend is visible on frame 1. A real
    // touch later flips it to 'touch' (onPointerDown). Routing is unaffected (isTouch).
    try {
      if (window.matchMedia &&
          window.matchMedia('(any-pointer: coarse)').matches &&
          !window.matchMedia('(any-pointer: fine)').matches) {
        Input.currentInput = 'touch';
      }
    } catch (_) {}

    // Pointer Events — passive:false so preventDefault works on control pointers.
    var optsNP = { passive: false };
    canvas.addEventListener('pointerdown', onPointerDown, optsNP);
    canvas.addEventListener('pointermove', onPointerMove, optsNP);
    canvas.addEventListener('pointerup', onPointerUp, optsNP);
    canvas.addEventListener('pointercancel', onPointerCancel, optsNP);
    // pointerleave on the canvas should drop a desktop hover (and bail mid-drag safely).
    canvas.addEventListener('pointerleave', function (e) {
      if (!Input.isTouch && e.pointerId !== joyPointerId && e.pointerId !== smashPointerId) {
        Input.hovered = null;
      }
    }, optsNP);

    // Keyboard is global (canvas isn't focusable by default); harmless on touch.
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // Safety: if focus/visibility is lost mid-press, clear held keys so the player
    // doesn't "walk forever".
    window.addEventListener('blur', clearAllHeld);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearAllHeld();
    });

    // Suppress context menu / gesture / wheel ONLY on the canvas (HUD stays scrollable).
    canvas.addEventListener('contextmenu', prevent, optsNP);
    canvas.addEventListener('gesturestart', prevent, optsNP);
    canvas.addEventListener('gesturechange', prevent, optsNP);
    canvas.addEventListener('gestureend', prevent, optsNP);
    canvas.addEventListener('wheel', prevent, optsNP);
    // Double-tap zoom / selection guards.
    canvas.addEventListener('dblclick', prevent, optsNP);
    canvas.addEventListener('selectstart', prevent, optsNP);

    // Keep SMASH disc placed across orientation/resize. camera.resize handles the
    // canvas; we just re-read client size on the next consume via the resize flag.
    window.addEventListener('resize', refreshSize);
    window.addEventListener('orientationchange', refreshSize);
  };

  function prevent(e) { e.preventDefault(); }

  function clearAllHeld() {
    keyUp = keyDown = keyLeft = keyRight = false;
    keyJump = false;
    moveX = 0; moveY = 0;
    if (joyPointerId !== null) releaseJoystick();
    smashPointerId = null;
    jumpPointerId = null;
    finisherPointerId = null;
    keyFHeld = false;              // blur/hide mid-charge → cancel (no release latch)
    spaceHeld = false;             // P0: blur with Space held left autofire stuck on refocus
    mouseAtkPointerId = null;
  }

  // Reusable intent object — one allocation total, never per-frame.
  var _intent = { moveX: 0, moveY: 0, attack: false, target: null, jump: false, charge: false, chargeRelease: false };

  Input.consume = function () {
    _intent.moveX = moveX;
    _intent.moveY = moveY;

    // Hold-to-autofire: while the SMASH disc (touch), Space (kbd), or the left mouse
    // button (desktop) is held, keep the attack latched every frame. The kaiju's
    // re-fire gate rate-limits it → "smash continuously at the gate cadence".
    if (smashPointerId !== null || spaceHeld || mouseAtkPointerId !== null) attackLatched = true;

    // Desktop hold: keep aiming at whatever's under the cursor (building or plane),
    // re-resolved each frame so the beam follows the pointer. Empty → null → faced/nearest.
    if (mouseAtkPointerId !== null && cursorClientX != null) {
      var held = resolveAimAt(cursorClientX, cursorClientY);
      if (held) pendingTarget = held;
    }

    var atk = attackLatched;
    var tgt = pendingTarget;
    var jmp = jumpLatched;

    if (atk && !tgt) {
      // No explicit standing click-target: resolve faced → nearest at fire time,
      // using the live heading so a moving player smashes what's in front.
      tgt = facedOrNearestTarget(moveX, moveY);
    }

    _intent.attack = atk;
    _intent.target = tgt;
    _intent.jump = jmp;
    // Nova Slam: charge is level-state (disc/F held); release is a one-shot edge.
    _intent.charge = (finisherPointerId !== null || keyFHeld);
    _intent.chargeRelease = chargeReleaseLatched;

    // One-shot edge signals reset after each consume.
    attackLatched = false;
    pendingTarget = null;
    jumpLatched = false;
    chargeReleaseLatched = false;

    return _intent;
  };

  G.Input = Input;
})(window.GAME);
