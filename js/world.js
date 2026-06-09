/* GAME.World — island grid + building lifecycle (v3 data-driven refactor §3+§4).
 *
 * Owns the 12×19 isometric city: spawns deterministic procedural buildings,
 * special landmark buildings (statue, pyramids, sand piles, football field),
 * and airplanes as flying entities. Runs the destruction lifecycle
 * (standing → crumbling → rubble → respawning), rolls rare-spawn overlays on
 * respawn→standing, and is the SINGLE damage entry point (`hitBuilding`)
 * through which every attack — direct hit, AOE, DoT tick — must flow.
 *
 * Time base: `dt` is MILLISECONDS everywhere (matches Config.RESPAWN.*_MS and
 * Config.COMBO.WINDOW_MS / Economy.tickCombo(dtMs)).
 *
 * Coupling (all guarded so this module stays headless-testable):
 *   on destroy → GAME.Economy.bankDestroy(maxHp)  (returns combo-scaled payout)
 *              + GAME.FX.debris(b)
 *              + GAME.Audio.crumble(tier)
 *   rare spawn  → GAME.Env.announce(text)
 *   frontier   → pushed to Economy for the save (maxReachedRow).
 *
 * Standing buildings are SOLID footprints (collision / targeting); crumbling
 * and rubble are PASSABLE — the kaiju walks over the wreckage.
 *
 * Special buildings (Config.SPECIALS) overlay hp/footprint/height/sprite/tint/
 * flying/altitude onto the generic building factory.
 *
 * Flyers (Config.SPECIALS.airplane): separate array, updated via updateFlyers(dt),
 * wrapped at grid boundaries. Exposed via getFlyers() / eachFlyer().
 *
 * Deps: Config, Utils, iso (tileToWorld), Economy, FX, Audio, Env (announce).
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Config = G.Config;
  var Utils = G.Utils;

  var GRID = Config.GRID;          // { cols, rows, TILE_W, TILE_H, WZ_PX }
  var ROW_HP = Config.ROW_HP;      // per-row HP === payout (19 tiers)
  var RESPAWN = Config.RESPAWN;    // { CRUMBLE_MS, RUBBLE_MS, RUBBLE_PER_TIER, RISE_MS }

  // World seed — fixed so a city is reproducible across reloads/sessions.
  var WORLD_SEED = 0x9E3779B1;

  // 5 visual style bands mapped across the 19 rows.
  var STYLE_BANDS = 5;

  // -------------------------------------------------------------------------
  // Building factory — canonical data model §3.
  // Building = { id, col, row, tier, hp, maxHp, footprint:{w,h}, height,
  //   style, seed, state, t, shake, hitFlash, dot,
  //   sprite?, tint?, flying?, altitude?, special? }
  //
  // `special?` — string key into Config.SPECIALS, set when this building is a
  //   landmark; the overlay fields (hp, footprint, height, sprite, tint,
  //   flying, altitude) are applied on top of the generic defaults.
  // `flying`   — true for airplanes; flyers live in a separate `flyers` array
  //   but share the same schema so hitBuilding / FX work uniformly.
  // -------------------------------------------------------------------------
  function makeBuilding(col, row, specialKey) {
    // Deterministic per-cell seed — identical city every spawn.
    var seed = Utils.hash((WORLD_SEED ^ Utils.hash(col * 73856093)) ^ Utils.hash(row * 19349663)) >>> 0;
    var rnd = Utils.rng(seed);

    var L = Config.LAYOUT;
    // Depth band: which of the 19 HP tiers this row belongs to. `tierRows`
    // decouples band depth from street width (falls back to the old block+street
    // period when absent) so widening streets doesn't stretch the HP curve.
    var period = L.tierRows || (L.blockD + L.street);
    var tier = Math.min(L.bands - 1, Math.floor(row / period));
    var maxHp = Math.floor(ROW_HP[tier]) || 0;

    // Footprint: deep rows trend wider (2×1 at higher tiers). Kept 1-tall.
    var fw = 1, fh = 1;
    if (!specialKey && tier >= 6 && rnd() > 0.74) fw = 2;

    // Height scales with tier; deep back rows tower higher.
    var heightBase = 0.7 + (tier / (L.bands - 1)) * 4.2;
    var height = heightBase * (0.82 + rnd() * 0.42);

    // Style band (0..4) the renderer uses for palette/prism style.
    var style = Math.min(STYLE_BANDS - 1, Math.floor((tier / L.bands) * STYLE_BANDS));

    var b = {
      id: row * GRID.cols + col,   // stable cell id
      col: col,
      row: row,
      tier: tier,
      hp: maxHp,
      maxHp: maxHp,
      footprint: { w: fw, h: fh },
      height: height,
      style: style,
      seed: seed,
      state: 'standing',
      t: 0,
      shake: 0,
      hitFlash: 0,
      dot: null,
      sprite: null,                // null → generic prism
      tint: null,                  // null → no tint overlay
      flying: false,
      altitude: 0,
      special: specialKey || null,
    };

    // Apply special overlay if requested.
    if (specialKey) {
      var spec = Config.SPECIALS && Config.SPECIALS[specialKey];
      if (spec) {
        if (typeof spec.hp === 'number')             { b.hp = spec.hp; b.maxHp = spec.hp; }
        if (spec.footprint)                           b.footprint = { w: spec.footprint.w, h: spec.footprint.h };
        if (typeof spec.height === 'number')          b.height = spec.height;
        if (spec.sprite)                              b.sprite = spec.sprite;
        if (spec.tint)                                b.tint = spec.tint;
        if (spec.flying)                              b.flying = !!spec.flying;
        if (typeof spec.altitude === 'number')        b.altitude = spec.altitude;
        if (typeof spec.hpMult === 'number')          { b.hp = Math.floor(maxHp * spec.hpMult); b.maxHp = b.hp; }
        // Tier stays row-derived so depth sorting / payout curve still make sense;
        // the special overrides HP independently.
      }
    }

    return b;
  }

  // -------------------------------------------------------------------------
  // Grid storage. Sparse — only the head cell of a footprint holds a building;
  // multi-tile footprints additionally register their occupied cells in a
  // separate occupancy map so collision/targeting see the whole base.
  // -------------------------------------------------------------------------
  var buildings = [];                  // dense iterable list (standing + lifecycle)
  var flyers = [];                     // airplane entities (flying:true, managed separately)
  var grid = [];                       // grid[row*cols+col] -> building (head cell only)
  var occupancy = [];                  // occupancy[row*cols+col] -> building (any covered cell)

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

  // Frontier the player has reached.
  var maxReachedRow = 0;

  // Place one generic building at (col,row). Returns true if placed.
  function placeBuilding(col, row, cols, allowWide) {
    if (occupancy[cellIndex(col, row)]) return false;

    var b = makeBuilding(col, row, null);

    if (!allowWide) {
      b.footprint.w = 1;
    } else if (b.footprint.w > 1 && (col + 1 >= cols || occupancy[cellIndex(col + 1, row)])) {
      b.footprint.w = 1;
    }

    grid[cellIndex(col, row)] = b;
    occupy(b);
    buildings.push(b);
    return true;
  }

  // Place a special building at (col,row). Returns the building or null if cell taken.
  function placeSpecial(col, row, specialKey) {
    if (!inBounds(col, row)) return null;
    if (occupancy[cellIndex(col, row)]) return null;

    var b = makeBuilding(col, row, specialKey);
    var spec = Config.SPECIALS && Config.SPECIALS[specialKey];

    // Check that all footprint cells are free before committing.
    for (var dy = 0; dy < b.footprint.h; dy++) {
      for (var dx = 0; dx < b.footprint.w; dx++) {
        var cc = col + dx, rr = row + dy;
        if (!inBounds(cc, rr) || occupancy[cellIndex(cc, rr)]) return null;
      }
    }

    grid[cellIndex(col, row)] = b;
    occupy(b);
    buildings.push(b);
    return b;
  }

  // -------------------------------------------------------------------------
  // spawnCity — build the whole island (Config.GRID cols×rows).
  // Deterministic block-and-street layout + specials (statue, pyramids, sand,
  // football field) placed at fixed grid positions, then airplanes spawned.
  // -------------------------------------------------------------------------
  function spawnCity() {
    buildings.length = 0;
    flyers.length = 0;
    grid.length = 0;
    occupancy.length = 0;

    var cols = GRID.cols, rows = GRID.rows;
    var L = Config.LAYOUT;
    var pcol = L.blockW + (L.streetW != null ? L.streetW : L.street), prow = L.blockD + L.street;
    var SPEC = Config.SPECIALS || {};

    // --- Determine special cell reservations before filling generic buildings ---

    // Statue: top-middle (deepest row near the center column, 2×2).
    // Place it at col=(cols/2)-1, row=(rows-4) to sit in the back-centre block.
    var statueCol = Math.floor((cols - 2) / 2);  // centres a 2-wide footprint
    var statueRow = rows - 4;                    // 4 rows from the far edge

    // Football field: 3×2 footprint, mid-depth somewhere central.
    // Place it deterministically: col=cols/2-1, row=rows/2 (roughly mid-city).
    var fieldCol = Math.floor((cols - 3) / 2);
    var fieldRow = Math.floor(rows / 2);

    // Pyramids: 4 total, one near each corner of the city on the sides.
    // Use rows near 1/5 and 4/5 depth, columns near col 0 and col cols-2.
    var pyramidPositions = [
      { col: 0, row: Math.floor(rows * 0.15) },
      { col: cols - 2, row: Math.floor(rows * 0.15) },
      { col: 0, row: Math.floor(rows * 0.85) },
      { col: cols - 2, row: Math.floor(rows * 0.85) },
    ];

    // Sand piles: 10 scattered positions near the sides (cols 0..1 and cols-2..cols-1).
    var sandPositions = [];
    var sandRng = Utils.rng(WORLD_SEED ^ 0xABCDEF);
    var SPEC_SAND = SPEC.sandpile;
    var sandCount = (SPEC_SAND && SPEC_SAND.scatter) || 10;
    for (var si = 0; si < sandCount; si++) {
      // Alternate left/right sides; distribute across rows.
      var sandSide = si % 2 === 0 ? 0 : cols - 1;
      var sandRow = Math.floor(sandRng() * rows);
      sandPositions.push({ col: sandSide, row: sandRow });
    }

    // --- Block-and-street grid pass (generic buildings) ---
    for (var row = 0; row < rows; row++) {
      if ((row % prow) >= L.blockD) continue;        // horizontal street — skip whole row
      for (var col = 0; col < cols; col++) {
        if ((col % pcol) >= L.blockW) continue;       // vertical street lane — skip
        placeBuilding(col, row, cols, false);          // 1×1 only → clean block edges
      }
    }

    // --- Place specials (after generic so they can evict / override) ---

    // Statue (top-middle, 2×2). Remove any generic buildings in those 4 cells first.
    _clearCells(statueCol, statueRow, 2, 2);
    placeSpecial(statueCol, statueRow, 'statue');

    // Football field (mid, 3×2). Clear first.
    _clearCells(fieldCol, fieldRow, 3, 2);
    placeSpecial(fieldCol, fieldRow, 'football');

    // Pyramids (sides, 2×2 each).
    for (var pi = 0; pi < pyramidPositions.length; pi++) {
      var pp = pyramidPositions[pi];
      _clearCells(pp.col, pp.row, 2, 2);
      placeSpecial(pp.col, pp.row, 'pyramid');
    }

    // Sand piles (1×1, scattered).
    for (var sci = 0; sci < sandPositions.length; sci++) {
      var sp = sandPositions[sci];
      _clearCells(sp.col, sp.row, 1, 1);
      placeSpecial(sp.col, sp.row, 'sandpile');
    }

    // --- Spawn airplanes ---
    _spawnAirplanes();

    // --- Restore frontier from Economy save ---
    maxReachedRow = 0;
    var saved = readSavedFrontier();
    if (saved > maxReachedRow) maxReachedRow = Math.min(saved, rows - 1);

    return buildings;
  }

  // Remove existing generic buildings in a rect so a special can take their cells.
  // Does NOT remove other specials already placed there.
  function _clearCells(col, row, fw, fh) {
    for (var dy = 0; dy < fh; dy++) {
      for (var dx = 0; dx < fw; dx++) {
        var c = col + dx, r = row + dy;
        if (!inBounds(c, r)) continue;
        var idx = cellIndex(c, r);
        var existing = occupancy[idx];
        if (!existing) continue;
        // Only remove non-special buildings. Don't stomp another special.
        if (existing.special) continue;
        // Remove the building's head cell and all its occupancy entries.
        delete grid[cellIndex(existing.col, existing.row)];
        for (var edy = 0; edy < existing.footprint.h; edy++) {
          for (var edx = 0; edx < existing.footprint.w; edx++) {
            var ec = existing.col + edx, er = existing.row + edy;
            if (inBounds(ec, er)) delete occupancy[cellIndex(ec, er)];
          }
        }
        // Remove from the buildings array.
        for (var bi = buildings.length - 1; bi >= 0; bi--) {
          if (buildings[bi] === existing) { buildings.splice(bi, 1); break; }
        }
      }
    }
  }

  // Spawn the initial airplane fleet. Each plane starts at a random position
  // spread across the grid and moves in a deterministic direction.
  function _spawnAirplanes() {
    var SPEC = Config.SPECIALS || {};
    var planSpec = SPEC.airplane;
    if (!planSpec) return;

    var count = planSpec.count || 5;
    var cols = GRID.cols, rows = GRID.rows;
    var planeRng = Utils.rng(WORLD_SEED ^ 0x12345678);

    for (var i = 0; i < count; i++) {
      var col = Math.floor(planeRng() * cols);
      var row = Math.floor(planeRng() * rows);

      // Build a flyer entity (not in grid/occupancy — flies above).
      var plane = {
        id: 10000 + i,                    // high id to avoid collision with ground buildings
        col: col,
        row: row,
        tier: 0,
        hp: planSpec.hp || 500,
        maxHp: planSpec.hp || 500,
        footprint: { w: planSpec.footprint ? planSpec.footprint.w : 1,
                     h: planSpec.footprint ? planSpec.footprint.h : 1 },
        height: 0.5,
        style: 0,
        seed: Utils.hash(i * 997 + 0xBEEF),
        state: 'standing',
        t: 0,
        shake: 0,
        hitFlash: 0,
        dot: null,
        sprite: planSpec.sprite || 'plane',
        tint: null,
        flying: true,
        altitude: planSpec.altitude || 6.5,
        special: 'airplane',
        // Movement: world-units per second (converted from dt ms in updateFlyers).
        _vx: (planeRng() < 0.5 ? 1 : -1) * (planSpec.speed || 1.4),
        _vy: (planeRng() - 0.5) * 0.3,   // slight diagonal drift
      };
      flyers.push(plane);
    }
  }

  // -------------------------------------------------------------------------
  // updateFlyers(dt) — advance airplane positions by dt ms; wrap at grid edges.
  // Called from game.js main loop alongside updateBuildings.
  // -------------------------------------------------------------------------
  function updateFlyers(dt) {
    if (!(dt > 0)) return;
    var dtSec = dt / 1000;
    var cols = GRID.cols, rows = GRID.rows;
    var flashDecay = dt / 120;
    var shakeDecay = dt / 220;

    for (var i = 0; i < flyers.length; i++) {
      var f = flyers[i];
      f.t += dt;

      // Visual decay
      if (f.hitFlash > 0) { f.hitFlash -= flashDecay; if (f.hitFlash < 0) f.hitFlash = 0; }
      if (f.shake > 0)    { f.shake    -= shakeDecay;  if (f.shake < 0)    f.shake = 0; }

      if (f.state !== 'standing') continue;  // destroyed planes don't move

      // Move in world-tile units.
      f.col += f._vx * dtSec;
      f.row += f._vy * dtSec;

      // Wrap horizontally.
      if (f.col < -1) f.col += cols + 2;
      if (f.col > cols + 1) f.col -= cols + 2;

      // Bounce (reflect) vertically so planes stay in the city band.
      if (f.row < 0) { f.row = -f.row; f._vy = Math.abs(f._vy); }
      if (f.row > rows - 1) { f.row = (rows - 1) * 2 - f.row; f._vy = -Math.abs(f._vy); }
    }
  }

  // -------------------------------------------------------------------------
  // readSavedFrontier / pushFrontier / advanceFrontier — frontier persistence.
  // -------------------------------------------------------------------------
  function readSavedFrontier() {
    var E = G.Economy;
    if (!E) return 0;
    if (typeof E.maxReachedRow === 'number') return E.maxReachedRow;
    if (typeof E.getMaxReachedRow === 'function') return E.getMaxReachedRow() | 0;
    return 0;
  }

  function pushFrontier(row) {
    var E = G.Economy;
    if (!E) return;
    if (typeof E.setMaxReachedRow === 'function') { E.setMaxReachedRow(row); return; }
    if ('maxReachedRow' in E) { E.maxReachedRow = row; }
  }

  function advanceFrontier(row) {
    row = row | 0;
    if (row > maxReachedRow) {
      maxReachedRow = Math.min(row, GRID.rows - 1);
      pushFrontier(maxReachedRow);
    }
    return maxReachedRow;
  }

  // -------------------------------------------------------------------------
  // tileToWorld / buildingCenter — coordinate helpers.
  // -------------------------------------------------------------------------
  function tileToWorld(col, row) {
    var iso = G.iso;
    if (iso && typeof iso.tileToWorld === 'function') return iso.tileToWorld(col, row);
    return { wx: col + 0.5, wy: row + 0.5 };
  }

  function buildingCenter(b) {
    return { wx: b.col + b.footprint.w * 0.5, wy: b.row + b.footprint.h * 0.5 };
  }

  // -------------------------------------------------------------------------
  // getBuildingAt — resident at a cell, or null. Works for both ground buildings
  // and flyers (flyers have fractional col/row so round to nearest).
  // -------------------------------------------------------------------------
  function getBuildingAt(col, row) {
    if (!inBounds(col, row)) return null;
    var b = occupancy[cellIndex(col, row)];
    return b || null;
  }

  // -------------------------------------------------------------------------
  // footprintsNear — STANDING buildings whose center lies within `band` world
  // units of (wx,wy). Includes flyers when `includeFlyers` is true.
  // -------------------------------------------------------------------------
  var _nearScratch = [];
  var _nearSeen = [];
  function footprintsNear(wx, wy, band, includeFlyers) {
    _nearScratch.length = 0;
    _nearSeen.length = 0;

    var reach = Math.ceil(band) + 2;
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

    // Optionally include flying targets (airplanes).
    if (includeFlyers) {
      for (var fi = 0; fi < flyers.length; fi++) {
        var f = flyers[fi];
        if (f.state !== 'standing') continue;
        if (_nearSeen[f.id]) continue;
        _nearSeen[f.id] = 1;
        var fdx = f.col - wx;
        var fdy = f.row - wy;
        if (fdx * fdx + fdy * fdy <= band2) _nearScratch.push(f);
      }
    }

    return _nearScratch;
  }

  // -------------------------------------------------------------------------
  // Destruction pipeline — centralised so direct hit, AOE, and DoT all
  // converge here and bank/FX/audio fire exactly once per building.
  // -------------------------------------------------------------------------
  function destroy(b) {
    var payout = b.maxHp;
    var E = G.Economy;
    if (E && typeof E.bankDestroy === 'function') {
      var p = E.bankDestroy(b.maxHp);
      if (typeof p === 'number') payout = p;
    }

    if (G.FX && typeof G.FX.debris === 'function') G.FX.debris(b);
    if (G.Audio && typeof G.Audio.crumble === 'function') G.Audio.crumble(b.tier);
    // Kill juice: a brief freeze-frame + screen flash (scaled by tier). Both are
    // no-ops under reduced-motion (guarded inside FX). Destroy only — never per-hit.
    if (G.FX && typeof G.FX.hitStop === 'function') G.FX.hitStop(40 + Math.min(b.tier || 0, 18) * 3);
    if (G.FX && typeof G.FX.screenFlash === 'function') G.FX.screenFlash((b.tier || 0) >= 14 ? 0.28 : 0.18);

    b.hp = 0;
    b.dot = null;
    b.state = 'crumbling';
    b.t = 0;
    b.hitFlash = 1;
    b.shake = Utils.reducedMotion ? 0 : Math.min(1, 0.5 + b.tier * 0.03);

    // Airplanes don't advance the frontier.
    if (!b.flying) advanceFrontier(b.row);

    return payout;
  }

  // -------------------------------------------------------------------------
  // hitBuilding — THE SINGLE damage entry point. Returns payout banked this
  // hit (0 if the building survived or wasn't a valid standing target).
  // -------------------------------------------------------------------------
  function hitBuilding(b, rawDamage) {
    if (!b || b.state !== 'standing') return 0;
    var dmg = Math.floor(rawDamage);   // NOT `| 0`: bitwise truncates to 32-bit
    if (!(dmg > 0)) return 0;

    b.hp -= dmg;
    b.hitFlash = 1;
    if (!Utils.reducedMotion) b.shake = Math.min(1, b.shake + 0.28);

    if (b.hp <= 0) return destroy(b);

    return 0;
  }

  // -------------------------------------------------------------------------
  // applyDot — attach or refresh a damage-over-time effect on a STANDING building.
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
      b.dot.perTick = Math.max(b.dot.perTick, perTick);
      b.dot.ticks = Math.max(b.dot.ticks, ticks);
      if (hasInterval) b.dot.intervalMs = intervalMs;
    } else {
      b.dot = { perTick: perTick, ticks: ticks, intervalMs: intervalMs, acc: 0 };
    }
  }

  // Tick one building's DoT — routes back through hitBuilding for correctness.
  function tickDot(b, dt) {
    var d = b.dot;
    if (!d) return;

    d.acc += dt;
    var guard = 16;
    while (d.acc >= d.intervalMs && d.ticks > 0 && guard-- > 0) {
      d.acc -= d.intervalMs;
      d.ticks--;
      hitBuilding(b, d.perTick);
      if (b.state !== 'standing') { b.dot = null; return; }
    }
    if (d.ticks <= 0) { b.dot = null; return; }
    if (d.acc > d.intervalMs) d.acc = d.intervalMs;
  }

  // -------------------------------------------------------------------------
  // Rare-spawn roll — called at the respawn→standing transition for ordinary
  // (non-special) buildings. Rolls Config.RARE_SPAWNS; on a hit, overlays the
  // rare tint/hpMult onto the building and announces via GAME.Env.
  // -------------------------------------------------------------------------
  function rollRareSpawn(b) {
    var RARE = Config.RARE_SPAWNS;
    var SPEC = Config.SPECIALS;
    if (!RARE || !SPEC) return;
    // Don't overlay an already-special building.
    if (b.special) return;

    for (var i = 0; i < RARE.length; i++) {
      var entry = RARE[i];
      if (!entry || typeof entry.chance !== 'number') continue;
      if (Math.random() < entry.chance) {
        // Apply the special overlay (tint + hpMult) in-place.
        var spec = SPEC[entry.special];
        if (!spec) continue;
        b.special = entry.special;
        if (spec.tint)    b.tint = spec.tint;
        if (typeof spec.hpMult === 'number') {
          // Rebase maxHp and current hp to the rare multiplier.
          b.maxHp = Math.floor(b.maxHp * spec.hpMult);
          b.hp    = b.maxHp;
        }
        // Announce to the player via GAME.Env.announce (guarded).
        if (spec.announce) {
          var Env = G.Env;
          if (Env && typeof Env.announce === 'function') Env.announce(spec.announce);
        }
        return; // only one rare variant per respawn
      }
    }
  }

  // -------------------------------------------------------------------------
  // updateBuildings — advance every building's lifecycle by `dt` ms.
  //   standing   : decay hitFlash/shake; tick any DoT.
  //   crumbling  : sink/tilt for CRUMBLE_MS → rubble.
  //   rubble     : sit for (RUBBLE_MS + tier*RUBBLE_PER_TIER) → respawning.
  //   respawning : rise for RISE_MS → standing at full HP (+ rare-spawn roll).
  // -------------------------------------------------------------------------
  function updateBuildings(dt) {
    if (!(dt > 0)) return;
    var flashDecay = dt / 120;
    var shakeDecay = dt / 220;

    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      b.t += dt;

      switch (b.state) {
        case 'standing':
          if (b.hitFlash > 0) { b.hitFlash -= flashDecay; if (b.hitFlash < 0) b.hitFlash = 0; }
          if (b.shake > 0)    { b.shake    -= shakeDecay;  if (b.shake < 0)    b.shake = 0; }
          if (b.dot) tickDot(b, dt);
          break;

        case 'crumbling':
          if (b.hitFlash > 0) { b.hitFlash -= flashDecay; if (b.hitFlash < 0) b.hitFlash = 0; }
          if (b.shake > 0)    { b.shake    -= shakeDecay;  if (b.shake < 0)    b.shake = 0; }
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
            // Reset rare-spawn overlays so the new standing building is clean
            // before the roll (in case it previously had a rare tint).
            var wasRare = !!b.special && b.special !== 'statue' && b.special !== 'pyramid'
                          && b.special !== 'sandpile' && b.special !== 'football';
            if (wasRare) {
              // Re-derive base maxHp from the tier (strip the rare hpMult).
              b.special = null;
              b.tint = null;
              b.maxHp = Math.floor(ROW_HP[b.tier]) || 0;
            }

            b.state = 'standing';
            b.t = 0;
            b.hp = b.maxHp;
            b.shake = 0;
            b.hitFlash = 0;
            b.dot = null;

            // Roll rare-spawn for ordinary (non-permanent-special) buildings.
            rollRareSpawn(b);
          }
          break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Render/cull helpers.
  // -------------------------------------------------------------------------
  function getBuildings() { return buildings; }
  function eachBuilding(fn) {
    for (var i = 0; i < buildings.length; i++) fn(buildings[i], i);
  }

  function getFlyers() { return flyers; }
  function eachFlyer(fn) {
    for (var i = 0; i < flyers.length; i++) fn(flyers[i], i);
  }

  // Pick the standing flyer (airplane) whose on-screen sprite is nearest a raw
  // client point, within ~PICK px. Planes float at `altitude`, so iso.pickTile
  // (ground plane only) can't find them — project each flyer at its altitude and
  // add the camera origin to get its canvas-px position, then take the nearest.
  function pickFlyer(clientX, clientY) {
    var iso = G.iso, cam = G.camera;
    if (!iso || !iso.worldToScreen || !cam) return null;
    var sx = clientX, sy = clientY;
    var cv = cam._canvas;
    if (cv && cv.getBoundingClientRect) { var r = cv.getBoundingClientRect(); sx = clientX - r.left; sy = clientY - r.top; }
    var PICK = 40, best = null, bestD = PICK * PICK;
    for (var i = 0; i < flyers.length; i++) {
      var f = flyers[i];
      if (f.state !== 'standing') continue;
      var p = iso.worldToScreen(f.col + 0.5, f.row + 0.5, f.altitude || 0);
      var dx = (p.x + cam.x) - sx, dy = (p.y + cam.y) - sy;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  // Pick the STANDING building whose DRAWN SPRITE is under a raw client point —
  // height-aware so you can hit ANY part of a tall building, not just its base.
  // Mirrors drawBuilding's rect math (worldToScreen + the assets sprite stamps);
  // frontmost (largest col+row, i.e. painter-order top) wins where sprites overlap.
  function pickBuildingAtScreen(clientX, clientY) {
    var iso = G.iso, cam = G.camera, A = G.Assets;
    if (!iso || !iso.worldToScreen || !cam || !A || typeof A.buildingSprite !== 'function') return null;
    var sx = clientX, sy = clientY;
    var cv = cam._canvas;
    if (cv && cv.getBoundingClientRect) { var r = cv.getBoundingClientRect(); sx = clientX - r.left; sy = clientY - r.top; }
    var wx = sx - cam.x, wy = sy - cam.y;   // → world-screen space (undo camera translate)
    var best = null, bestDK = -Infinity;
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (b.state !== 'standing') continue;
      var spr = A.buildingSprite(b);
      if (!spr || !spr.width) continue;
      var p = iso.worldToScreen(b.col, b.row, 0);
      var cw = (spr._cssW != null) ? spr._cssW : spr.width;
      var ch = (spr._cssH != null) ? spr._cssH : spr.height;
      var ax = (spr._anchorX != null) ? spr._anchorX : (cw / 2);
      var ay = (spr._anchorY != null) ? spr._anchorY : ch;
      var dx = p.x - ax, dy = p.y - ay;
      if (wx >= dx && wx < dx + cw && wy >= dy && wy < dy + ch) {
        var dk = b.col + b.row;           // monotonic with painter order → frontmost wins
        if (dk > bestDK) { bestDK = dk; best = b; }
      }
    }
    return best;
  }

  // Explicit-aim target resolver: the ground building at a cell, else a standing
  // flyer occupying that rounded cell (so a tapped/aimed plane resolves to the plane).
  function getTargetAt(col, row) {
    var b = getBuildingAt(col, row);
    if (b && b.state === 'standing') return b;
    for (var i = 0; i < flyers.length; i++) {
      var f = flyers[i];
      if (f.state === 'standing' && Math.round(f.col) === col && Math.round(f.row) === row) return f;
    }
    return null;
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
    updateFlyers: updateFlyers,

    // the single damage entry point + DoT plumbing
    hitBuilding: hitBuilding,
    applyDot: applyDot,

    // queries
    getBuildingAt: getBuildingAt,
    getTargetAt: getTargetAt,
    pickFlyer: pickFlyer,
    pickBuildingAtScreen: pickBuildingAtScreen,
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
    getFlyers: getFlyers,
    eachFlyer: eachFlyer,
    lifecyclePhase: lifecyclePhase,

    // grid dims (mirror of Config.GRID)
    cols: GRID.cols,
    rows: GRID.rows,
  };
})(window.GAME);
