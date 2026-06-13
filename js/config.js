/* GAME.Config — single source of truth: balance, forms, titans, grid, content. Pure data, zero deps. */
window.GAME = window.GAME || {};
window.GAME.Config = {
  saveKey: 'godzilla-save-v3',
  // In-page console probe of the live asset version. The AUTHORITY is sw.js `CACHE`;
  // bump BOTH together to ship (game.js warns at boot if they drift out of sync).
  CACHE_VERSION: 'gz-v20',

  // --- Isometric grid (world units = tiles). Wide, open, zoomed-out city:
  //     21 cols of 2×2 blocks split by wide streets; 58 rows. TILE_*/WZ_PX are
  //     the zoom lever (smaller = pulled back); iso + sprite baking both read these. ---
  GRID: { cols: 21, rows: 58, TILE_W: 56, TILE_H: 28, WZ_PX: 40 },

  // --- Block-and-street layout. A cell is a STREET when its index within the
  //     period (block + street) lands on the street lane. ASYMMETRIC streets (real
  //     NYC-grid feel): `streetW` = wide avenues on the col axis, `street` = narrower
  //     cross-streets on the row axis — averaging +75% more separation than the old
  //     2-tile streets, with long sightline "runways". `tierRows` decouples the
  //     HP/difficulty depth-band from street width: tier = floor(row / tierRows),
  //     still 0..18 over 58 rows regardless of how wide the streets get. ---
  // street 2→3, streetW 3→4 (gz-v15, docs/research-2026-06b.md): a thinner city (~270→192
  // structures, coverage 22%→16%) so movement is rewarded; tierRows:3 keeps tier=floor(row/3)
  // decoupled from street width → ROW_HP/income ladder UNCHANGED (income-neutral by construction).
  LAYOUT: { blockW: 2, blockD: 2, street: 3, streetW: 4, bands: 19, tierRows: 3 },

  // --- Building HP ladder by TIER (depth band). HP === money payout. 19 tiers,
  //     SMOOTHED ~2.3×/tier (expert flow-channel curve), 10 → 1e9 at tier 18. ---
  ROW_HP: [10, 28, 78, 215, 600, 1650, 4500, 12500, 34000, 95000,
           260000, 720000, 2000000, 5500000, 15000000, 42000000, 115000000, 340000000, 1000000000],

  // --- Godzilla loom + growth: base draw scale, ×1.15 per evolution tier. ---
  GZ: { baseScale: 1.5, evoGrowth: 1.15, titanScale: 1.6 },

  // --- Universal claws (multiplies all forms): power = form.base × CLAWS_MULT^clawsLevel ---
  CLAWS_MULT: 2.0,            // each Stronger Claws level DOUBLES damage
  // Fallback attack base = gz2014.base, used ONLY if the active form id is ever unknown
  // (formDef -> null). Without it the defensive `: Cfg.START_ATTACK` paths in economy/entities
  // computed undefined*2^n = NaN. Unreachable in normal play (load() pins a valid owned form).
  START_ATTACK: 6,
  // (CLAWS_BASE/CLAWS_GROWTH removed in U9 — UE1's clawsCost = base×CLAWS_MULT^(L+1) made
  //  the old round(CLAWS_BASE×CLAWS_GROWTH^level) curve dead.)

  // --- Consolidated module tunables (U9 / KMP-prep M0): scattered constants moved here from
  //     entities/iso/input/audio/render so the portable core reads ONE source. Behavior-
  //     identical to the prior in-module literals; each consumer keeps a literal fallback. ---
  LOCO:      { ACCEL: 1060, MAX_SPEED: 260, FRICTION: 12, COLLIDE_R: 18, WALK_SPEED: 0.22 }, // ACCEL/MAX_SPEED/COLLIDE_R are px → entities ÷PX_PER_TILE at use site
  CAMERA:    { focusX: 0.5, focusY: 0.66, SHAKE_MAX_PX: 12, SHAKE_DECAY: 0.02, SHAKE_TRAUMA_K: 1 / 85 },
  INPUT_GEO: { JOY_RADIUS: 70, JOY_DEADZONE: 0.12, SMASH_MIN: 96, JUMP_MIN: 76, FINISHER_MIN: 76, LEFT_ZONE: 0.42, FACE_AHEAD_PX: 28, NEAR_TARGET_PX: 40 },
  AUDIO:     { MASTER_GAIN: 0.5 },
  RENDER:    { CULL_PAD: 3, CULL_RISE_ROWS: 14 },

  // --- Combo: the only damage multiplier (chain smashes to ramp ×1 → ×2) ---
  // Combo (research-locked docs/research-2026-06.md): STEP 0.12 → cap reached in ~9
  // destroys (was 0.04 → ~25, practically invisible). WINDOW 3250ms is now SHORTER than
  // RUBBLE_MS 4500 (gz-v15) — intentional: a chain no longer survives camping a freshly
  // flattened block, nudging the player to keep moving. CAP 2.0 unchanged (locked).
  COMBO: { WINDOW_MS: 3250, STEP: 0.12, MAX: 2.0 },
  PASSIVE: 0,                // no passive income (would trivialize deep rows)

  // --- Attack cadence: the re-fire GATE is decoupled from the attack ANIMATION.
  //     gate = clamp(form.attack.cooldown × SCALE, FLOOR, CAP) seconds. Much shorter
  //     than the old "wait for the whole animation" gate → rapid, responsive tapping
  //     (and hold-to-autofire). FLOOR/CAP keep every form snappy without becoming
  //     audio/visual mush (~75-80ms is the perceptual mush floor; we sit above it). ---
  COOLDOWN_SCALE: 0.42, COOLDOWN_FLOOR: 0.11, COOLDOWN_CAP: 0.20,

  // --- Attack-Speed upgrade track (research-locked, docs/research-2026-06.md).
  //     Purchasable utility track: asymptotic re-fire-gate reduction toward FLOOR.
  //     gate' = FLOOR + (gate - FLOOR) * DECAY^level. Wyrm base gate 0.126s → L6 ≈ 0.081s
  //     (×1.56 DPS ceiling, 12.35/s). Cost = round(BASE * GROWTH^level): 10/32/102/328/1049/3355.
  //     GROWTH 3.2 > claws 2.6 (accelerating price for a capped reward keeps damage the
  //     coin-efficient path). Smooth/continuous — no breakpoints. ---
  ATKSPD: { FLOOR: 0.075, DECAY: 0.70, LEVELS: 6, BASE: 10, GROWTH: 3.2 },

  // --- Move-Speed upgrade track (research-locked, docs/research-2026-06.md).
  //     Purchasable utility track: ACCEL + MAX_SPEED × (1 + PER_LEVEL)^level.
  //     +8%/level over 6 levels → cap ×1.587 (7.37 tiles/s = 0.123 tiles/substep @60fps,
  //     0.246 @30fps — well under the 1.0-tile footprint, no tunneling).
  //     Cost = round(BASE * GROWTH^level): 40/96/230/553/1327/3185 (total 5431) — sits
  //     above ATKSPD, preserving claws < atk-speed < move-speed coin-efficiency ordering. ---
  MOVESPD: { PER_LEVEL: 0.08, LEVELS: 6, BASE: 40, GROWTH: 2.4 },

  // --- Nova Slam (charged finisher, research-locked docs/research-2026-06.md).
  //     One-time unlock (COST). Hold the NOVA disc / F to charge 0→1 over CHARGE_S;
  //     release fires an AoE slam centered ~1.2 tiles ahead of facing: radius
  //     lerp(RADIUS_T, RADIUS_MAX_T, charge) tiles, damage = (DMG_MIN+(DMG_MAX-DMG_MIN)
  //     ×charge) × attackPower with distance falloff. COOLDOWN_S real cooldown (a
  //     finisher, not a spam loop) — NEVER touches the autofire gate. MIN_CHARGE = a
  //     tap still fires weak; SLOW = move multiplier while charging; SHAKE peak. ---
  FINISHER: { COST: 350, CHARGE_S: 1.2, COOLDOWN_S: 8, RADIUS_T: 2.5, RADIUS_MAX_T: 3.2,
              DMG_MIN: 3, DMG_MAX: 10, MIN_CHARGE: 0.15, SLOW: 0.5, SHAKE: 14 },

  // --- Destruction / respawn timing (ms) ---
  // Respawn (Mike G1 verdict + docs/research-2026-06b.md): the dense city made the v5 dead-zone
  // research backwards — fast respawn just lets you camp. SLOWER now (RUBBLE_MS 2800→4500,
  // PER_TIER 150→250: full cycle ~5.75s tier0 / ~8s mid / ~10.25s tier18) AND an off-screen
  // respawn GATE (world.js updateBuildings) so cleared blocks refill only once you roam away —
  // the actual movement driver. Paired with the thinner city (LAYOUT street/streetW below).
  RESPAWN: { CRUMBLE_MS: 550, RUBBLE_MS: 4500, RUBBLE_PER_TIER: 250, RISE_MS: 700 },

  WORLD2_COST: 12e9,         // capstone unlock → "Coming soon" stub

  // --- Unified forms schema (replaces EVOLUTIONS + TITANS) ---
  // Each form has: id, name, label, family, archetype, tier, base, cost, palette, shape, attack
  FORMS: [
    // ============ Godzilla (wyrm) — keep existing 5 palettes verbatim ============
    { id: 'gz2014', name: 'Godzilla', label: '2014', family: 'wyrm', archetype: 'wyrm', tier: 0, base: 6, cost: 0,
      palette: {
        skin: '#3c3c3c', skinDark: '#1e1e1e', skinLight: '#646464',
        plate: '#2b2b2b', plateEdge: '#8fc2ee', plateGlow: 'rgba(70,160,235,0.45)',
        breath: ['#9bdcff', '#ffffff'], breathGlow: 'rgba(70,170,255,0.9)', eye: '#ffbe3a', aura: null, fxMotes: null },
      shape: { archetype: 'wyrm', plates: 10, tail: 1.0, bulk: 1.05, plateJag: 0.35, plateHeightMul: 0.85, legMul: 1.4, armMul: 1.6 },
      attack: { kind: 'beam', cooldown: 0.30, color: 'breath', shake: 0 } },
    { id: 'burning', name: 'Burning Godzilla', label: '2019', family: 'wyrm', archetype: 'wyrm', tier: 1, base: 48, cost: 150,
      palette: {
        skin: '#2c2622', skinDark: '#150f0b', skinLight: '#54381f',
        plate: '#3a1c0e', plateEdge: '#ff7a1a', plateGlow: 'rgba(255,110,20,0.95)',
        rimGlow: '#ff7a1a', fissureCore: '#ffd24a', fissureGlow: 'rgba(255,122,26,0.5)', plateHot: ['#ff5a14', '#ffd24a'],
        breath: ['#9ad0ff', '#ffffff'], breathGlow: 'rgba(90,170,255,0.85)', eye: '#ff8a2a', aura: 'rgba(255,90,20,0.16)', fxMotes: 'heat' },
      shape: { archetype: 'wyrm', plates: 10, tail: 1.0, bulk: 1.05, plateJag: 0.55, legMul: 1.4, armMul: 1.6, fissures: 0.5, selfIllum: true },
      attack: { kind: 'beam', cooldown: 0.30, color: 'breath', shake: 6 } },
    { id: 'gvk', name: 'Godzilla · GvK', label: '2021', family: 'wyrm', archetype: 'wyrm', tier: 2, base: 240, cost: 1200,
      palette: {
        skin: '#3e444b', skinDark: '#21262b', skinLight: '#647682',
        plate: '#33424c', plateEdge: '#cdecff', plateGlow: 'rgba(70,180,255,0.65)',
        breath: ['#36c9ff', '#ffffff'], breathGlow: 'rgba(54,201,255,0.95)', eye: '#ffcf4a', aura: 'rgba(60,160,255,0.13)', fxMotes: null },
      shape: { archetype: 'wyrm', plates: 11, tail: 1.05, bulk: 1.0, plateJag: 0.6, legMul: 1.4, armMul: 1.6, torsoWidth: 0.93, broken: 2 },
      attack: { kind: 'beam', cooldown: 0.30, color: 'breath', shake: 8 } },
    { id: 'gxk', name: 'Godzilla × Kong', label: '2024', family: 'wyrm', archetype: 'wyrm', tier: 3, base: 3000, cost: 10000,
      palette: {
        skin: '#2c2731', skinDark: '#16101a', skinLight: '#4c2942',
        plate: '#2a2330', plateEdge: '#ff6cc6', plateGlow: 'rgba(255,70,185,0.9)',
        rimGlow: '#ff6cc6',
        breath: ['#ff7ad0', '#ffe1f4'], breathGlow: 'rgba(255,60,180,0.95)', eye: '#ffd6f2', aura: 'rgba(255,40,160,0.18)', fxMotes: 'pink' },
      shape: { archetype: 'wyrm', plates: 13, tail: 1.05, bulk: 0.98, plateJag: 0.8, plateHeightMul: 1.2, legMul: 1.4, armMul: 1.6, selfIllum: true },
      attack: { kind: 'beam', cooldown: 0.30, color: 'breath', shake: 10 } },
    { id: 'supernova', name: 'Supernova Godzilla', label: '2027', family: 'wyrm', archetype: 'wyrm', tier: 4, base: 18000, cost: 80000,
      palette: {
        skin: '#251440', skinDark: '#1a0d33', skinLight: '#522485',
        plate: '#2a0a55', plateEdge: '#dcb0ff', plateGlow: 'rgba(165,90,230,0.98)',
        rimGlow: '#dcb0ff', fissureCore: '#f0e0ff', fissureGlow: 'rgba(165,90,230,0.5)',
        breath: ['#ffffff', '#b07dff'], breathGlow: 'rgba(200,120,255,0.98)', eye: '#ffffff', aura: 'rgba(157,78,221,0.24)', fxMotes: 'cosmic' },
      shape: { archetype: 'wyrm', plates: 16, tail: 1.15, bulk: 1.08, plateJag: 1.0, plateHeightMul: 1.18, legMul: 1.4, armMul: 1.6, fissures: 1.0, selfIllum: true },
      attack: { kind: 'beam', cooldown: 0.30, color: 'breath', shake: 12 } },

    // ============ Mothra (flyer) — t1, t2, t3 ============
    { id: 'mothra_gvm', name: 'Mothra', label: 'GvM', family: 'mothra', archetype: 'flyer', tier: 5, base: 1500000, cost: 5500000,
      palette: {
        skin: '#f3ede0', skinDark: '#b8aa92', skinLight: '#fffaf0',
        plate: '#1a1a22', plateEdge: '#2ec8ff', plateGlow: 'rgba(46,200,255,0.7)',
        breath: ['#2ec8ff', '#ffffff'], breathGlow: 'rgba(46,200,255,0.95)', eye: '#2ec8ff', aura: null, fxMotes: 'pink' },
      shape: { archetype: 'flyer', wingSpan: 2.7, wingStyle: 'moth', plates: 0, bulk: 0.9, eyespot: 0.85, furThorax: true, wingField: ['#e88a2c', '#f0c050'] },
      attack: { kind: 'cloud', cooldown: 0.46, dot: { frac: 0.06, ticks: 10, intervalMs: 300 } } },
    { id: 'mothra_gxk', name: 'Mothra', label: 'GxK', family: 'mothra', archetype: 'flyer', tier: 6, base: 3000000, cost: 11000000,
      palette: {
        skin: '#c8772a', skinDark: '#8a4d18', skinLight: '#e6a04a',
        plate: '#1a1410', plateEdge: '#2ec8ff', plateGlow: 'rgba(46,200,255,0.8)',
        breath: ['#ffb84a', '#ffffff'], breathGlow: 'rgba(46,200,255,0.95)', eye: '#2ec8ff', aura: null, fxMotes: 'pink' },
      shape: { archetype: 'flyer', wingSpan: 3.0, wingStyle: 'moth', plates: 0, bulk: 0.95, eyespot: 1.0, furThorax: 'thick', joints: true, wingField: ['#c8772a', '#e88a2c'] },
      attack: { kind: 'cloud', cooldown: 0.46, dot: { frac: 0.06, ticks: 10, intervalMs: 300 } } },
    { id: 'mothra_supernova', name: 'Mothra', label: 'Supernova', family: 'mothra', archetype: 'flyer', tier: 7, base: 7600000, cost: 40000000,
      palette: {
        skin: '#fff6d8', skinDark: '#e8cf88', skinLight: '#ffffff',
        plate: '#5a4416', plateEdge: '#ffd700', plateGlow: 'rgba(255,215,0,0.92)',
        breath: ['#ffffff', '#ffd700'], breathGlow: 'rgba(255,215,0,0.98)', eye: '#ffffff', aura: 'rgba(255,215,0,0.24)', fxMotes: 'pink' },
      shape: { archetype: 'flyer', wingSpan: 3.3, wingStyle: 'moth', plates: 0, bulk: 1.0, eyespot: 1.15, furThorax: 'thick', joints: true, godrays: true, wingField: ['#e8b020', '#f5d878'] },
      attack: { kind: 'cloud', cooldown: 0.46, dot: { frac: 0.06, ticks: 10, intervalMs: 300 } } },

    // ============ King Ghidorah (hydra, 3 heads) — t1, t2, t3, t4, t5 ============
    { id: 'ghidorah', name: 'King Ghidorah', label: 'T1', family: 'ghidorah', archetype: 'hydra', tier: 8, base: 350000, cost: 1300000,
      palette: {
        skin: '#d4a000', skinDark: '#8b6914', skinLight: '#f0d070',
        plate: '#d4a000', plateEdge: '#ffcf3a', plateGlow: 'rgba(255,200,60,0.78)',
        breath: ['#ffd24a', '#ffffff'], breathGlow: 'rgba(255,200,60,0.95)', eye: '#ffd24a', aura: null, fxMotes: null },
      shape: { archetype: 'hydra', heads: 3, neckSpread: 1.25, wingSpan: 2.4, mech: false, tails: 2, neckLenMul: 1.0, headHornStyle: 'crown' },
      attack: { kind: 'bolts', hits: 3, cooldown: 0.5, color: 'eye' } },
    { id: 'king_ghidorah', name: 'King Ghidorah', label: 'T2', family: 'ghidorah', archetype: 'hydra', tier: 9, base: 750000, cost: 2600000,
      palette: {
        skin: '#f2c200', skinDark: '#a07000', skinLight: '#fff0a0',
        plate: '#f2c200', plateEdge: '#ffcf3a', plateGlow: 'rgba(255,200,60,0.80)',
        breath: ['#ffd24a', '#ffffff'], breathGlow: 'rgba(255,200,60,0.98)', eye: '#ffd24a', aura: null, fxMotes: null },
      shape: { archetype: 'hydra', heads: 3, neckSpread: 1.45, wingSpan: 2.9, mech: false, tails: 2, neckLenMul: 1.15, headHornStyle: 'crown_tall' },
      attack: { kind: 'bolts', hits: 3, cooldown: 0.5, color: 'eye' } },
    { id: 'mecha_ghidorah', name: 'Mecha King Ghidorah', label: 'T3', family: 'ghidorah', archetype: 'hydra', tier: 10, base: 900000, cost: 5200000,
      palette: {
        skin: '#808080', skinDark: '#4a4a4a', skinLight: '#c0c0c0',
        plate: '#606060', plateEdge: '#00d6ff', plateGlow: 'rgba(0,214,255,0.85)',
        breath: ['#00d6ff', '#ffffff'], breathGlow: 'rgba(0,214,255,0.98)', eye: '#00d6ff', aura: null, fxMotes: null },
      shape: { archetype: 'hydra', heads: 3, neckSpread: 1.45, wingSpan: 2.6, mech: true, tails: 2, cyborgCenter: true, goldSkin: '#e6b800', goldDark: '#996600', goldLight: '#ffdd00', headHornStyle: 'crown' },
      attack: { kind: 'bolts', hits: 3, cooldown: 0.5, color: 'eye' } },
    { id: 'grand_king', name: 'Grand King Ghidorah', label: 'T4', family: 'ghidorah', archetype: 'hydra', tier: 11, base: 1200000, cost: 5400000,
      palette: {
        skin: '#ffee77', skinDark: '#d4a000', skinLight: '#ffffbb',
        plate: '#ffee77', plateEdge: '#ffd24a', plateGlow: 'rgba(255,210,80,0.88)',
        breath: ['#ffe680', '#ffffff'], breathGlow: 'rgba(255,210,80,0.98)', eye: '#ffe680', aura: 'rgba(255,200,60,0.18)', fxMotes: null },
      shape: { archetype: 'hydra', heads: 3, neckSpread: 1.5, wingSpan: 3.0, mech: false, tails: 2, bodyBulk: 1.12, neckLenMul: 0.92, headHornStyle: 'asymmetric' },
      attack: { kind: 'bolts', hits: 3, cooldown: 0.5, color: 'eye' } },
    { id: 'void_ghidorah', name: 'Void Ghidorah', label: 'T5', family: 'ghidorah', archetype: 'hydra', tier: 12, base: 2600000, cost: 11000000,
      palette: {
        skin: '#1a1a2e', skinDark: '#0d0d1a', skinLight: '#5a5a82',
        plate: '#1a1a2e', plateEdge: '#00e0ff', plateGlow: 'rgba(0,224,255,0.9)', neckRim: 'rgba(0,224,255,0.7)',
        breath: ['#00e0ff', '#ffffff'], breathGlow: 'rgba(0,224,255,0.98)', eye: '#00e0ff', aura: 'rgba(0,204,255,0.20)', fxMotes: 'cosmic' },
      shape: { archetype: 'hydra', heads: 3, neckSpread: 1.6, wingSpan: 3.0, mech: false, tails: 2, neckThorns: true, voidPortal: true, neckLenMul: 1.25, neckWidthMul: 0.65, headHornStyle: 'thorns' },
      attack: { kind: 'bolts', hits: 3, cooldown: 0.5, color: 'eye' } },

    // ============ Rodan (flyer, pteranodon) — t1, t2, t3 ============
    { id: 'rodan', name: 'Rodan', label: 'T1', family: 'rodan', archetype: 'flyer', tier: 13, base: 4000000, cost: 22000000,
      palette: {
        skin: '#8a5a30', skinDark: '#5a3818', skinLight: '#b07a45',
        plate: '#5a3818', plateEdge: '#cd853f', plateGlow: 'rgba(205,133,63,0.75)',
        breath: ['#ff8c00', '#ffaa33'], breathGlow: 'rgba(255,140,0,0.9)', eye: '#ffaa00', aura: null, fxMotes: null },
      shape: { archetype: 'flyer', wingSpan: 2.8, wingStyle: 'pteranodon', plates: 0, bulk: 0.95, scallops: 2, crest: 'straight' },
      attack: { kind: 'dive', aoeRadius: 2.6, shake: 11, cooldown: 0.7 } },
    { id: 'rodan_mv', name: 'Rodan', label: 'MV', family: 'rodan', archetype: 'flyer', tier: 14, base: 6500000, cost: 36000000,
      palette: {
        skin: '#5c1e14', skinDark: '#2e0f0a', skinLight: '#8a2e1c',
        plate: '#2e0f0a', plateEdge: '#ff6a1e', plateGlow: 'rgba(255,90,20,0.85)', fissureCore: '#ff6a1e', fissureGlow: 'rgba(255,90,20,0.5)',
        breath: ['#ff8c00', '#ffbb33'], breathGlow: 'rgba(255,140,0,0.95)', eye: '#ff9933', aura: 'rgba(255,90,20,0.12)', fxMotes: 'heat' },
      shape: { archetype: 'flyer', wingSpan: 3.1, wingStyle: 'pteranodon', plates: 0, bulk: 1.1, scallops: 3, fireRim: true, fissures: 0.5, crest: 'vsplit' },
      attack: { kind: 'dive', aoeRadius: 2.7, shake: 12, cooldown: 0.7 } },
    { id: 'rodan_fire', name: 'Rodan', label: 'Fire', family: 'rodan', archetype: 'flyer', tier: 15, base: 12000000, cost: 60000000,
      palette: {
        skin: '#ff5a1e', skinDark: '#c23008', skinLight: '#ffb066',
        plate: '#c23008', plateEdge: '#ffcc33', plateGlow: 'rgba(255,140,0,0.98)', fissureCore: '#fff6cc', fissureGlow: 'rgba(255,140,0,0.6)',
        breath: ['#ff4500', '#ff8c00'], breathGlow: 'rgba(255,100,0,0.98)', eye: '#ffdd00', aura: 'rgba(255,80,0,0.20)', fxMotes: 'heat' },
      shape: { archetype: 'flyer', wingSpan: 3.4, wingStyle: 'pteranodon', plates: 0, bulk: 1.2, scallops: 4, fireRim: true, fissures: 0.8, crest: 'vsplit', goldCrest: true },
      attack: { kind: 'dive', aoeRadius: 2.8, shake: 13, cooldown: 0.7 } },

    // ============ Mechagodzilla (mecha) — t1, t2, t3, t4 (ASCENDING) ============
    { id: 'mecha_1', name: 'Mechagodzilla', label: 'T1', family: 'mecha', archetype: 'mecha', tier: 16, base: 9000000, cost: 44000000,
      palette: {
        skin: '#b8b8b8', skinDark: '#6e6e6e', skinLight: '#f0f0f0',
        plate: '#c0c0c0', plateEdge: '#8a8a8a', plateGlow: 'rgba(200,200,200,0.7)',
        breath: ['#ff0000', '#ffff00'], breathGlow: 'rgba(255,100,0,0.9)', eye: '#ff0000', aura: null, fxMotes: null },
      shape: { archetype: 'mecha', plates: 5, antennae: 1, panel: true, joints: 'round', cybanek: true, headStyle: 'roundShowa', bulk: 0.95, spineSize: 0.7 },
      attack: { kind: 'volley', hits: 5, cooldown: 0.42 } },
    { id: 'mecha_2', name: 'Mechagodzilla', label: 'T2', family: 'mecha', archetype: 'mecha', tier: 17, base: 13900000, cost: 72000000,
      palette: {
        skin: '#4a86bd', skinDark: '#1c3858', skinLight: '#86bade',
        plate: '#36648b', plateEdge: '#bfe3ff', plateGlow: 'rgba(100,180,255,0.8)',
        breath: ['#0080ff', '#ffffff'], breathGlow: 'rgba(0,150,255,0.95)', eye: '#0080ff', aura: null, fxMotes: null },
      shape: { archetype: 'mecha', plates: 7, antennae: 2, panel: true, joints: 'angular', shoulderCannon: true, headStyle: 'helmet', bulk: 1.05, spineSize: 0.95 },
      attack: { kind: 'volley', hits: 5, cooldown: 0.42 } },
    { id: 'mecha_3', name: 'Mechagodzilla', label: 'T3', family: 'mecha', archetype: 'mecha', tier: 18, base: 15000000, cost: 80000000,
      palette: {
        skin: '#1a1a1a', skinDark: '#0d0d0d', skinLight: '#4a4a4a',
        plate: '#2a2a2a', plateEdge: '#ff2020', plateGlow: 'rgba(255,50,50,0.85)',
        breath: ['#ff0000', '#ffaa00'], breathGlow: 'rgba(255,50,0,0.98)', eye: '#ff0000', aura: null, fxMotes: null },
      shape: { archetype: 'mecha', plates: 10, antennae: 0, horns: 2, panel: true, joints: 'angular', headStyle: 'ghidorah', drillTail: true, bulk: 1.0, leanPose: true, spineSize: 0.75 },
      attack: { kind: 'volley', hits: 6, cooldown: 0.42 } },
    { id: 'super_mecha', name: 'Mechagodzilla', label: 'Super', family: 'mecha', archetype: 'mecha', tier: 19, base: 16800000, cost: 90000000,
      palette: {
        skin: '#d4a574', skinDark: '#8b6f47', skinLight: '#e8d7c3',
        plate: '#a9a9a9', plateEdge: '#ffd700', plateGlow: 'rgba(255,215,0,0.88)',
        breath: ['#ffff00', '#ff8c00'], breathGlow: 'rgba(255,150,0,0.98)', eye: '#ffd700', aura: 'rgba(255,215,0,0.18)', fxMotes: null },
      shape: { archetype: 'mecha', plates: 11, antennae: 2, panel: true, joints: 'angular', headStyle: 'helmet', backpack: true, leadFin: true, bulk: 1.12, spineSize: 1.0 },
      attack: { kind: 'volley', hits: 6, cooldown: 0.42 } }
  ],

  // --- Special buildings (non-standard footprints, sprites, effects) ---
  SPECIALS: {
    statue: { hp: 1e9, footprint: { w: 2, h: 2 }, height: 7, sprite: 'statue', place: 'topmid', unique: true },
    pyramid: { hp: 2e8, footprint: { w: 2, h: 2 }, height: 3.5, sprite: 'pyramid', place: 'sides', count: 4 },
    sandpile: { hp: 5e4, footprint: { w: 1, h: 1 }, height: 0.5, sprite: 'sandpile', place: 'sides', scatter: 10 },
    football: { hp: 6.5e4, footprint: { w: 3, h: 2 }, height: 0.2, sprite: 'field', place: 'mid' },
    airplane: { hp: 500, footprint: { w: 1, h: 1 }, sprite: 'plane', flying: true, altitude: 6.5, speed: 1.4, count: 5 },
    golden: { sprite: 'house', tint: 'gold', hpMult: 3, announce: 'A golden house has been generated!' },
    rainbow: { sprite: 'house', tint: 'rainbow', hpMult: 5, announce: 'A rainbow house has been generated!' },
    diamond: { sprite: 'house', tint: 'diamond', hpMult: 10, announce: 'A diamond house has been generated!' }
  },

  // --- Rare spawn table (spawned on destroy during standing→respawn transition) ---
  RARE_SPAWNS: [
    { special: 'golden', chance: 1 / 900 },
    { special: 'rainbow', chance: 1 / 4000 },
    { special: 'diamond', chance: 1 / 12000 }
  ],

  // --- Environment / day-night cycle ---
  ENV: {
    dayLengthMs: 120000,
    day: { sky: ['#1a3a6e', '#4f8fe0'], sun: '#fff3c0', tint: 'rgba(255,250,220,0)', ambient: 1 },
    night: { sky: ['#05070f', '#142a55'], moon: '#cfe0ff', tint: 'rgba(18,28,66,0.30)', ambient: 0.6 }
  },

  // --- Jump mechanics (pos.z kinematics) ---
  JUMP: { vEscape: 8.5, gravity: 26 },
  FLYER_ALTITUDE: 1.0,   // flyers (Mothra/Rodan) hover at this constant world-Z (FLYERMEGA §7)
};
