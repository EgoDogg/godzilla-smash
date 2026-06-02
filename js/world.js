/* GAME.World — island grid + building lifecycle (data model §3).
 *
 * Owns the 12×19 isometric city: spawns deterministic procedural buildings,
 * runs the destruction lifecycle (standing → crumbling → rubble → respawning),
 * and is the SINGLE damage entry point (`hitBuilding`) through which every
 * attack — direct hit, AOE, DoT tick — must flow.
 *
 * Time base: `dt` is MILLISECONDS everywhere (matches Config.RESPAWN.*_MS and
 * Config.COMBO.WINDOW_MS / Economy.tickCombo(dtMs)).
 *
 * Coupling (all guarded so this module stays headless-testable per build plan §8):
 *   on destroy → GAME.Economy.bankDestroy(maxHp)  (returns combo-scaled payout)
 *              + GAME.FX.debris(b)
 *              + GAME.Audio.crumble(tier)
 *   frontier advance → pushed to Economy for the save (maxReachedRow).
 *
 * Standing buildings are SOLID footprints (collision / targeting); crumbling
 * and rubble are PASSABLE — the kaiju walks over the wreckage.
 *
 * Deps: Config, Utils, iso (tileToWorld), Economy, FX, Audio.
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Config = G.Config;
  var Utils = G.Utils;

  var GRID = Config.GRID;          // { cols, rows, TILE_W, TILE_H, WZ_PX }
  var ROW_HP = Config.ROW_HP;      // per-row HP === payout
  var RESPAWN = Config.RESPAWN;    // { CRUMBLE_MS, RUBBLE_MS, RUBBLE_PER_TIER, RISE_MS }

  // World seed — fixed so a city is reproducible across reloads/sessions.
  // (Layout determinism comes entirely from hashing this with col/row.)
  var WORLD_SEED = 0x9E3779B1;

  // 5 visual style bands mapped across the 19 rows (shack → neon skyscraper).
  // Renderer/assets key sprites by `style`; we only assign the band index here.
  var STYLE_BANDS = 5;

  // -------------------------------------------------------------------------
  // Building factory (canonical data model §3).
  // -------------------------------------------------------------------------
  // Building = { id, col, row, tier, hp, maxHp, footprint:{w,h}, height,
  //   style, seed, state, t, shake, hitFlash, dot }
  //
  // `t`        — ms elapsed in the current lifecycle state (drives crumble/rise).
  // `shake`    — 0..1 trauma used by the renderer for a per-building wobble.
  // `hitFlash` — 0..1, decays each frame; renderer additively whitens the prism.
  // `dot`      — null | { perTick, ticks, intervalMs, acc } applied damage-over-time.
  function makeBuilding(col, row) {
    // Deterministic per-cell seed → identical city every spawn for this seed.
    var seed = Utils.hash((WORLD_SEED ^ Utils.hash(col * 73856093)) ^ Utils.hash(row * 19349663)) >>> 0;
    var rnd = Utils.rng(seed);

    var L = Config.LAYOUT;
    var tier = Math.min(L.bands - 1, Math.floor(row / (L.blockD + L.street)));  // depth band 0..18
    var maxHp = Math.floor(ROW_HP[tier]) || 0;   // Math.floor (not `| 0`) so HP can exceed 2.1B

    // Footprint: deep rows trend wider. Mostly 1×1, with a chance at 2-WIDE
    // (2×1) for the back-rows so downtown reads denser. Footprints are kept
    // 1-tall on purpose: a 2-wide building only consumes columns *within its
    // own row*, so every row can always self-fill to its 8-building floor —
    // a 2-TALL footprint would steal cells from the row behind it and could
    // starve that row below the minimum (an avoidable cross-row coupling).
    var fw = 1, fh = 1;
    if (tier >= 6 && rnd() > 0.74) fw = 2;

    // Height (in world-Z tiles) scales with tier so the back rows tower.
    // Front shacks ~0.7, neon skyscrapers ~5.2 — plus per-building jitter.
    var heightBase = 0.7 + (tier / (L.bands - 1)) * 4.2;
    var height = heightBase * (0.82 + rnd() * 0.42);

    // Style band: which of the 5 procedural palettes the renderer uses.
    var style = Math.min(STYLE_BANDS - 1, Math.floor((tier / L.bands) * STYLE_BANDS));

    return {
      id: row * GRID.cols + col,      // stable cell id (one resident per cell)
      col: col,
      row: row,
      tier: tier,                     // depth-band tier (0..18)
      hp: maxHp,
      maxHp: maxHp,
      footprint: { w: fw, h: fh },
      height: height,
      style: style,
      seed: seed,                     // renderer re-derives its own variation rng
      state: 'standing',
      t: 0,                           // ms in current state
      shake: 0,
      hitFlash: 0,
      dot: null,
    };
  }

  // -------------------------------------------------------------------------
  // Grid storage. Sparse — only the head cell of a footprint holds a building;
  // multi-tile footprints additionally register their occupied cells in a
  // separate occupancy map so collision/targeting see the whole base.
  // -------------------------------------------------------------------------
  var buildings = [];                 // dense iterable list (render + cull + update)
  var grid = [];                      // grid[row*cols+col] -> building | undefined (head cell)
  var occupancy = [];                 // occupancy[row*cols+col] -> building (any covered cell)

  function cellIndex(col, row) { return row * GRID.cols + col; }

  function inBounds(col, row) {
    return col >= 0 && col < GRID.cols && row >= 0 && row < GRID.rows;
  }

  // Register every cell a building's footprint covers into the occupancy map.
  function occupy(b) {
    for (var dy = 0; dy < b.footprint.h; dy++) {
      for (var dx = 0; dx < b.footprint.w; dx++) {
        var c = b.col + dx, r = b.row + dy;
        if (inBounds(c, r)) occupancy[cellIndex(c, r)] = b;
      }
    }
  }

  // Frontier the player has reached. Render reads it; Input clamps movement to
  // `wy <= maxReachedRow + 1.5`; UI shows depth. Persisted via Economy save.
  var maxReachedRow = 0;

  // Place one building at (col,row) if the head cell is free. When `allowWide`
  // is false the footprint is forced to 1×1 (used by the backfill pass that
  // guarantees the per-row minimum). Returns true if a building was placed.
  function placeBuilding(col, row, cols, allowWide) {
    if (occupancy[cellIndex(col, row)]) return false; // taken (e.g. wide neighbour)

    var b = makeBuilding(col, row);

    if (!allowWide) {
      b.footprint.w = 1; // backfill pass plants only 1×1 to guarantee the floor
    } else if (b.footprint.w > 1 && (col + 1 >= cols || occupancy[cellIndex(col + 1, row)])) {
      // Shrink a 2-wide footprint that would spill off-grid or onto a taken cell.
      b.footprint.w = 1;
    }

    grid[cellIndex(col, row)] = b;
    occupy(b);
    buildings.push(b);
    return true;
  }

  // -------------------------------------------------------------------------
  // spawnCity — build the whole island (Config.GRID cols×rows).
  // Row r: hp = maxHp = ROW_HP[r]; 8–12 buildings across the cols with street
  // gaps; tier = r; deterministic style/layout from the seed.
  // -------------------------------------------------------------------------
  function spawnCity() {
    buildings.length = 0;
    grid.length = 0;
    occupancy.length = 0;

    var cols = GRID.cols, rows = GRID.rows;
    var L = Config.LAYOUT;
    var pcol = L.blockW + L.street, prow = L.blockD + L.street;

    // Block-and-street grid: solid blockW×blockD clusters separated by 1-tile
    // streets so the player can roam the avenues and pick targets. A cell is a
    // STREET (left empty) when its position within the period lands on the street
    // lane. Tier/HP comes from the depth band (see makeBuilding).
    for (var row = 0; row < rows; row++) {
      if ((row % prow) >= L.blockD) continue;        // horizontal street — skip whole row
      for (var col = 0; col < cols; col++) {
        if ((col % pcol) >= L.blockW) continue;       // vertical street lane — skip
        placeBuilding(col, row, cols, false);         // 1×1 only → clean block edges
      }
    }

    // Reset / restore the frontier. Economy is the save owner; if a prior run
    // persisted a deeper frontier, adopt it so the camera/clamp start there.
    maxReachedRow = 0;
    var saved = readSavedFrontier();
    if (saved > maxReachedRow) maxReachedRow = Math.min(saved, rows - 1);

    return buildings;
  }

  // Pull the persisted frontier from Economy (guarded — Economy may not be
  // present in a headless unit test).
  function readSavedFrontier() {
    var E = G.Economy;
    if (!E) return 0;
    if (typeof E.maxReachedRow === 'number') return E.maxReachedRow;
    if (typeof E.getMaxReachedRow === 'function') return E.getMaxReachedRow() | 0;
    return 0;
  }

  // Push an advanced frontier into Economy so the next save persists it.
  // Tries, in order: a setter, then a plain mutable field. Fully guarded.
  function pushFrontier(row) {
    var E = G.Economy;
    if (!E) return;
    if (typeof E.setMaxReachedRow === 'function') { E.setMaxReachedRow(row); return; }
    if ('maxReachedRow' in E) { E.maxReachedRow = row; }
  }

  // Public: advance the frontier as the player moves forward (Input calls this
  // with the kaiju's current row each step). Only ever moves forward; on a real
  // advance it pushes to Economy for the save.
  function advanceFrontier(row) {
    row = row | 0;
    if (row > maxReachedRow) {
      maxReachedRow = Math.min(row, GRID.rows - 1);
      pushFrontier(maxReachedRow);
    }
    return maxReachedRow;
  }

  // -------------------------------------------------------------------------
  // tileToWorld — cell → world units. World units ARE tiles (wx=col, wy=row),
  // anchored at the CENTER of the (possibly multi-tile) footprint when given a
  // building, or the cell center for a bare col/row. The renderer / iso layer
  // turns these into screen space.
  // -------------------------------------------------------------------------
  function tileToWorld(col, row) {
    // Prefer the iso layer's own mapping if it exposes one (keeps a single
    // source of truth for the grid→world convention); else identity (tiles).
    var iso = G.iso;
    if (iso && typeof iso.tileToWorld === 'function') return iso.tileToWorld(col, row);
    return { wx: col + 0.5, wy: row + 0.5 };
  }

  // World-space center of a building accounting for its footprint extent.
  function buildingCenter(b) {
    return { wx: b.col + b.footprint.w * 0.5, wy: b.row + b.footprint.h * 0.5 };
  }

  // -------------------------------------------------------------------------
  // getBuildingAt — resident at a cell, or null. Returns the building covering
  // (col,row) including the body of a multi-tile footprint, regardless of state
  // (callers decide whether crumbling/rubble counts).
  // -------------------------------------------------------------------------
  function getBuildingAt(col, row) {
    if (!inBounds(col, row)) return null;
    var b = occupancy[cellIndex(col, row)];
    return b || null;
  }

  // -------------------------------------------------------------------------
  // footprintsNear — STANDING buildings whose center lies within `band` world
  // units (tiles) of (wx,wy). Used for collision (circle-vs-footprint) and
  // targeting. Crumbling/rubble/respawning are excluded — they're passable.
  //
  // `band` is a radius in world units; we scan the cell neighbourhood that band
  // can possibly cover (no full-grid sweep) and dedupe multi-cell footprints.
  // -------------------------------------------------------------------------
  var _nearScratch = [];              // reused result array (no per-call alloc)
  var _nearSeen = [];                 // reused id-dedupe scratch
  function footprintsNear(wx, wy, band) {
    _nearScratch.length = 0;
    _nearSeen.length = 0;

    var reach = Math.ceil(band) + 2;  // +2 to safely cover wide footprints
    var c0 = Math.max(0, Math.floor(wx) - reach);
    var c1 = Math.min(GRID.cols - 1, Math.floor(wx) + reach);
    var r0 = Math.max(0, Math.floor(wy) - reach);
    var r1 = Math.min(GRID.rows - 1, Math.floor(wy) + reach);
    var band2 = band * band;

    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var b = occupancy[cellIndex(c, r)];
        if (!b || b.state !== 'standing') continue;
        if (_nearSeen[b.id]) continue;
        _nearSeen[b.id] = 1;
        var dx = (b.col + b.footprint.w * 0.5) - wx;
        var dy = (b.row + b.footprint.h * 0.5) - wy;
        if (dx * dx + dy * dy <= band2) _nearScratch.push(b);
      }
    }
    return _nearScratch;
  }

  // -------------------------------------------------------------------------
  // Destruction. Centralised so a direct hit, an AOE hit, and a DoT tick all
  // converge here and bank/FX/audio fire exactly once per building.
  // -------------------------------------------------------------------------
  function destroy(b) {
    // Bank the kill (combo-scaled inside Economy). Guarded for headless tests.
    var payout = b.maxHp;
    var E = G.Economy;
    if (E && typeof E.bankDestroy === 'function') {
      var p = E.bankDestroy(b.maxHp);
      if (typeof p === 'number') payout = p;
    }

    // Procedural feedback — debris burst + tiered crumble SFX (guarded).
    if (G.FX && typeof G.FX.debris === 'function') G.FX.debris(b);
    if (G.Audio && typeof G.Audio.crumble === 'function') G.Audio.crumble(b.tier);

    // Enter the crumble lifecycle. hp pinned to 0; DoT cleared (it's gone).
    b.hp = 0;
    b.dot = null;
    b.state = 'crumbling';
    b.t = 0;
    b.hitFlash = 1;
    // Stronger crumble trauma for taller towers (renderer clamps to 0..1).
    b.shake = Utils.reducedMotion ? 0 : Math.min(1, 0.5 + b.tier * 0.03);

    // Flattening a building opens the city forward: advance the explorable frontier
    // to this row so the player can push past it (balance §4 — power is the gate).
    advanceFrontier(b.row);

    return payout;
  }

  // -------------------------------------------------------------------------
  // hitBuilding — THE SINGLE damage entry point. Subtracts hp, flashes, and on
  // depletion runs the destroy() pipeline (bank + FX + audio + crumble state).
  // Returns the payout banked this hit (0 if the building survived or wasn't a
  // valid standing target).
  // -------------------------------------------------------------------------
  function hitBuilding(b, rawDamage) {
    if (!b || b.state !== 'standing') return 0;     // only standing takes damage
    var dmg = Math.floor(rawDamage);   // NOT `| 0`: bitwise truncates to 32-bit and wraps
    if (!(dmg > 0)) return 0;          // huge damage (>2.1B, e.g. Supernova+claws) to negative

    b.hp -= dmg;

    // Hit feedback (skip the jolt under reduced-motion, keep the flash subtle).
    b.hitFlash = 1;
    if (!Utils.reducedMotion) b.shake = Math.min(1, b.shake + 0.28);

    if (b.hp <= 0) return destroy(b);

    return 0; // survived — no payout
  }

  // -------------------------------------------------------------------------
  // applyDot — attach (or refresh) a damage-over-time effect to a STANDING
  // building. Called by Titan signatures (Mothra powder, Mecha missiles).
  // `spec` accepts either { perTick, ticks, intervalMs } (precomputed) or the
  // Config form { frac, ticks, intervalMs } which we resolve against maxHp.
  // Refreshing an existing DoT takes the stronger perTick and the longer
  // remaining ticks (so re-spraying tops it up rather than stacking unbounded).
  // -------------------------------------------------------------------------
  function applyDot(b, spec) {
    if (!b || b.state !== 'standing' || !spec) return;

    var perTick = (typeof spec.perTick === 'number')
      ? spec.perTick
      : Math.max(1, Math.ceil(b.maxHp * (spec.frac || 0)));
    var ticks = spec.ticks | 0;
    if (ticks <= 0 || perTick <= 0) return;
    var hasInterval = (typeof spec.intervalMs === 'number' && spec.intervalMs > 0);
    var intervalMs = hasInterval ? spec.intervalMs : 300;

    if (b.dot) {
      // Refresh tops up rather than stacks: keep the stronger perTick and the
      // longer remaining duration. acc/cadence are left continuous, and the
      // existing interval is preserved unless the refresh explicitly sets one
      // (so a top-up spec that omits intervalMs doesn't reset the tick rate).
      b.dot.perTick = Math.max(b.dot.perTick, perTick);
      b.dot.ticks = Math.max(b.dot.ticks, ticks);
      if (hasInterval) b.dot.intervalMs = intervalMs;
    } else {
      // Pure time accumulator: each tick fires after one full intervalMs of
      // accumulated game time (the first tick lands intervalMs after the cloud
      // lands). This is the standard, frame-rate-independent DoT model — no
      // contact-frame special case, so it behaves identically whether the
      // frame is 16ms or a 100000ms tab-resume.
      b.dot = { perTick: perTick, ticks: ticks, intervalMs: intervalMs, acc: 0 };
    }
  }

  // Tick one building's DoT on its own ms accumulator. Each tick is routed
  // through the same hp path as a direct hit, so a DoT kill banks/destroys
  // correctly (and stops once the building is no longer standing).
  function tickDot(b, dt) {
    var d = b.dot;
    if (!d) return;

    // Accumulate real game time and fire one tick per full intervalMs elapsed.
    d.acc += dt;
    // The remaining-ticks count is the real cap (DoTs are short, ≤10 ticks);
    // bound the loop anyway so a pathological dt (tab resume) can't spin —
    // leftover acc simply carries to the next frame.
    var guard = 16;
    while (d.acc >= d.intervalMs && d.ticks > 0 && guard-- > 0) {
      d.acc -= d.intervalMs;
      d.ticks--;
      hitBuilding(b, d.perTick);     // routes through the single damage entry
      if (b.state !== 'standing') { b.dot = null; return; } // killed by the tick
    }
    if (d.ticks <= 0) { b.dot = null; return; } // expired
    // Don't let acc balloon past one interval of credit once it's caught up.
    if (d.acc > d.intervalMs) d.acc = d.intervalMs;
  }

  // -------------------------------------------------------------------------
  // updateBuildings — advance every building's lifecycle by `dt` ms:
  //   standing   : decay hitFlash/shake; tick any DoT.
  //   crumbling  : sink/tilt for CRUMBLE_MS → rubble.
  //   rubble     : sit for (RUBBLE_MS + tier*RUBBLE_PER_TIER) → respawning.
  //   respawning : rise for RISE_MS → restored standing at full HP.
  // -------------------------------------------------------------------------
  function updateBuildings(dt) {
    if (!(dt > 0)) return;
    // Frame-decay factors (per ~16.7ms baseline) for visual settle.
    var flashDecay = dt / 120;       // hitFlash fully fades in ~120ms
    var shakeDecay = dt / 220;       // shake settles in ~220ms

    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      b.t += dt;

      switch (b.state) {
        case 'standing':
          if (b.hitFlash > 0) { b.hitFlash -= flashDecay; if (b.hitFlash < 0) b.hitFlash = 0; }
          if (b.shake > 0) { b.shake -= shakeDecay; if (b.shake < 0) b.shake = 0; }
          if (b.dot) tickDot(b, dt);
          break;

        case 'crumbling':
          if (b.hitFlash > 0) { b.hitFlash -= flashDecay; if (b.hitFlash < 0) b.hitFlash = 0; }
          if (b.shake > 0) { b.shake -= shakeDecay; if (b.shake < 0) b.shake = 0; }
          if (b.t >= RESPAWN.CRUMBLE_MS) { b.state = 'rubble'; b.t = 0; b.shake = 0; b.hitFlash = 0; }
          break;

        case 'rubble':
          if (b.t >= RESPAWN.RUBBLE_MS + b.tier * RESPAWN.RUBBLE_PER_TIER) {
            b.state = 'respawning';
            b.t = 0;
          }
          break;

        case 'respawning':
          if (b.t >= RESPAWN.RISE_MS) {
            // Fully risen — restored to a pristine standing building.
            b.state = 'standing';
            b.t = 0;
            b.hp = b.maxHp;
            b.shake = 0;
            b.hitFlash = 0;
            b.dot = null;
          }
          break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Render/cull helpers — expose the building set without leaking the internal
  // array (callers must not mutate it). `forEach` is alloc-free for hot loops.
  // -------------------------------------------------------------------------
  function getBuildings() { return buildings; }          // live ref (read-only contract)
  function eachBuilding(fn) {                              // alloc-free iterator
    for (var i = 0; i < buildings.length; i++) fn(buildings[i], i);
  }

  // 0..1 lifecycle progress for the renderer (sink on crumble, scale on rise).
  function lifecyclePhase(b) {
    switch (b.state) {
      case 'crumbling':  return Utils.clamp(b.t / RESPAWN.CRUMBLE_MS, 0, 1);
      case 'respawning': return Utils.clamp(b.t / RESPAWN.RISE_MS, 0, 1);
      default:           return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Export.
  // -------------------------------------------------------------------------
  G.World = {
    // lifecycle
    spawnCity: spawnCity,
    updateBuildings: updateBuildings,

    // the single damage entry point + DoT plumbing
    hitBuilding: hitBuilding,
    applyDot: applyDot,

    // queries
    getBuildingAt: getBuildingAt,
    footprintsNear: footprintsNear,
    tileToWorld: tileToWorld,
    buildingCenter: buildingCenter,

    // frontier (player progress → save)
    advanceFrontier: advanceFrontier,
    get maxReachedRow() { return maxReachedRow; },
    set maxReachedRow(v) { advanceFrontier(v); },

    // render / cull access
    getBuildings: getBuildings,
    eachBuilding: eachBuilding,
    lifecyclePhase: lifecyclePhase,

    // exposed grid dims for convenience (mirror of Config.GRID)
    cols: GRID.cols,
    rows: GRID.rows,
  };
})(window.GAME);
