/* GAME.Config — single source of truth: balance, forms, titans, grid, content. Pure data, zero deps. */
window.GAME = window.GAME || {};
window.GAME.Config = {
  saveKey: 'godzilla-save-v3',
  CACHE_VERSION: 'gz-v10',

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
  LAYOUT: { blockW: 2, blockD: 2, street: 2, streetW: 3, bands: 19, tierRows: 3 },

  // --- Building HP ladder by TIER (depth band). HP === money payout. 19 tiers,
  //     SMOOTHED ~2.3×/tier (expert flow-channel curve), 10 → 1e9 at tier 18. ---
  ROW_HP: [10, 28, 78, 215, 600, 1650, 4500, 12500, 34000, 95000,
           260000, 720000, 2000000, 5500000, 15000000, 42000000, 115000000, 340000000, 1000000000],

  // --- Godzilla loom + growth: base draw scale, ×1.15 per evolution tier. ---
  GZ: { baseScale: 1.5, evoGrowth: 1.15, titanScale: 1.6 },

  // --- Universal claws (multiplies all forms): power = form.base × CLAWS_MULT^clawsLevel ---
  CLAWS_MULT: 2.0,            // each Stronger Claws level DOUBLES damage
  CLAWS_BASE: 12,            // cost = round(CLAWS_BASE * CLAWS_GROWTH^level)
  CLAWS_GROWTH: 2.6,

  // --- Combo: the only damage multiplier (chain smashes to ramp ×1 → ×2) ---
  COMBO: { WINDOW_MS: 1600, STEP: 0.04, MAX: 2.0 },
  PASSIVE: 0,                // no passive income (would trivialize deep rows)

  // --- Attack cadence: the re-fire GATE is decoupled from the attack ANIMATION.
  //     gate = clamp(form.attack.cooldown × SCALE, FLOOR, CAP) seconds. Much shorter
  //     than the old "wait for the whole animation" gate → rapid, responsive tapping
  //     (and hold-to-autofire). FLOOR/CAP keep every form snappy without becoming
  //     audio/visual mush (~75-80ms is the perceptual mush floor; we sit above it). ---
  COOLDOWN_SCALE: 0.42, COOLDOWN_FLOOR: 0.11, COOLDOWN_CAP: 0.20,

  // --- Destruction / respawn timing (ms) ---
  RESPAWN: { CRUMBLE_MS: 550, RUBBLE_MS: 6500, RUBBLE_PER_TIER: 450, RISE_MS: 700 },

  WORLD2_COST: 12e9,         // capstone unlock → "Coming soon" stub

  // --- Unified forms schema (replaces EVOLUTIONS + TITANS) ---
  // Each form has: id, name, label, family, archetype, tier, base, cost, palette, shape, attack
  FORMS: [
    // ============ Godzilla (wyrm) — keep existing 5 palettes verbatim ============
    { id: 'gz2014', name: 'Godzilla', label: '2014', family: 'wyrm', archetype: 'wyrm', tier: 0, base: 6, cost: 0,
      palette: {
        skin: '#3c3c3c', skinDark: '#1e1e1e', skinLight: '#565656',
        plate: '#2b2b2b', plateEdge: '#8fc2ee', plateGlow: 'rgba(70,160,235,0.45)',
        breath: ['#9bdcff', '#ffffff'], breathGlow: 'rgba(70,170,255,0.9)', eye: '#ffbe3a', aura: null, fxMotes: null },
      shape: { archetype: 'wyrm', plates: 9, tail: 1.0, bulk: 1.0 },
      attack: { kind: 'beam', cooldown: 0.30, color: 'breath', shake: 0 } },
    { id: 'burning', name: 'Burning Godzilla', label: '2019', family: 'wyrm', archetype: 'wyrm', tier: 1, base: 48, cost: 50000,
      palette: {
        skin: '#2c2622', skinDark: '#150f0b', skinLight: '#54381f',
        plate: '#3a1c0e', plateEdge: '#ff7a1a', plateGlow: 'rgba(255,110,20,0.95)',
        breath: ['#9ad0ff', '#ffffff'], breathGlow: 'rgba(90,170,255,0.85)', eye: '#ffd24a', aura: 'rgba(255,90,20,0.16)', fxMotes: 'heat' },
      shape: { archetype: 'wyrm', plates: 9, tail: 1.0, bulk: 1.0 },
      attack: { kind: 'beam', cooldown: 0.30, color: 'breath', shake: 6 } },
    { id: 'gvk', name: 'Godzilla · GvK', label: '2021', family: 'wyrm', archetype: 'wyrm', tier: 2, base: 240, cost: 200000,
      palette: {
        skin: '#3e444b', skinDark: '#21262b', skinLight: '#647682',
        plate: '#33424c', plateEdge: '#cdecff', plateGlow: 'rgba(70,180,255,0.65)',
        breath: ['#36c9ff', '#ffffff'], breathGlow: 'rgba(54,201,255,0.95)', eye: '#ffcf4a', aura: 'rgba(60,160,255,0.13)', fxMotes: null },
      shape: { archetype: 'wyrm', plates: 9, tail: 1.0, bulk: 1.0 },
      attack: { kind: 'beam', cooldown: 0.30, color: 'breath', shake: 8 } },
    { id: 'gxk', name: 'Godzilla × Kong', label: '2024', family: 'wyrm', archetype: 'wyrm', tier: 3, base: 3000, cost: 12000000,
      palette: {
        skin: '#2c2731', skinDark: '#16101a', skinLight: '#4c2942',
        plate: '#2a2330', plateEdge: '#ff6cc6', plateGlow: 'rgba(255,70,185,0.9)',
        breath: ['#ff7ad0', '#ffe1f4'], breathGlow: 'rgba(255,60,180,0.95)', eye: '#ffd6f2', aura: 'rgba(255,40,160,0.18)', fxMotes: 'pink' },
      shape: { archetype: 'wyrm', plates: 9, tail: 1.0, bulk: 1.0 },
      attack: { kind: 'beam', cooldown: 0.30, color: 'breath', shake: 10 } },
    { id: 'supernova', name: 'Supernova Godzilla', label: '2027', family: 'wyrm', archetype: 'wyrm', tier: 4, base: 18000, cost: 100000000,
      palette: {
        skin: '#251440', skinDark: '#0d011a', skinLight: '#522485',
        plate: '#2a0a55', plateEdge: '#dcb0ff', plateGlow: 'rgba(165,90,230,0.98)',
        breath: ['#ffffff', '#b07dff'], breathGlow: 'rgba(200,120,255,0.98)', eye: '#ffffff', aura: 'rgba(157,78,221,0.24)', fxMotes: 'cosmic' },
      shape: { archetype: 'wyrm', plates: 9, tail: 1.0, bulk: 1.0 },
      attack: { kind: 'beam', cooldown: 0.30, color: 'breath', shake: 12 } },

    // ============ Mothra (flyer) — t1, t2, t3 ============
    { id: 'mothra_gvm', name: 'Mothra', label: 'GvM', family: 'mothra', archetype: 'flyer', tier: 5, base: 1500000, cost: 3500000000,
      palette: {
        skin: '#00d9ff', skinDark: '#009acc', skinLight: '#66ebff',
        plate: '#0080aa', plateEdge: '#00d9ff', plateGlow: 'rgba(0,217,255,0.75)',
        breath: ['#00d9ff', '#ffffff'], breathGlow: 'rgba(0,200,255,0.95)', eye: '#00ffff', aura: null, fxMotes: 'pink' },
      shape: { archetype: 'flyer', wingSpan: 2.8, wingStyle: 'moth', plates: 0, bulk: 0.9 },
      attack: { kind: 'cloud', cooldown: 0.46, dot: { frac: 0.06, ticks: 10, intervalMs: 300 } } },
    { id: 'mothra_gxk', name: 'Mothra', label: 'GxK', family: 'mothra', archetype: 'flyer', tier: 6, base: 3000000, cost: 8000000000,
      palette: {
        skin: '#00d9ff', skinDark: '#009acc', skinLight: '#66ebff',
        plate: '#ff8c00', plateEdge: '#ffaa33', plateGlow: 'rgba(255,140,0,0.75)',
        breath: ['#ff8c00', '#ffffff'], breathGlow: 'rgba(255,140,0,0.95)', eye: '#ffbb00', aura: null, fxMotes: 'pink' },
      shape: { archetype: 'flyer', wingSpan: 2.9, wingStyle: 'moth', plates: 0, bulk: 0.95 },
      attack: { kind: 'cloud', cooldown: 0.46, dot: { frac: 0.06, ticks: 10, intervalMs: 300 } } },
    { id: 'mothra_supernova', name: 'Mothra', label: 'Supernova', family: 'mothra', archetype: 'flyer', tier: 7, base: 7600000, cost: 18000000000,
      palette: {
        skin: '#fffacd', skinDark: '#f0e68c', skinLight: '#ffffff',
        plate: '#daa520', plateEdge: '#ffd700', plateGlow: 'rgba(255,215,0,0.9)',
        breath: ['#ffd700', '#ffffff'], breathGlow: 'rgba(255,215,0,0.98)', eye: '#ffffff', aura: 'rgba(255,215,0,0.20)', fxMotes: 'pink' },
      shape: { archetype: 'flyer', wingSpan: 3.0, wingStyle: 'moth', plates: 0, bulk: 1.0 },
      attack: { kind: 'cloud', cooldown: 0.46, dot: { frac: 0.06, ticks: 10, intervalMs: 300 } } },

    // ============ King Ghidorah (hydra, 3 heads) — t1, t2, t3, t4, t5 ============
    { id: 'ghidorah', name: 'King Ghidorah', label: 'T1', family: 'ghidorah', archetype: 'hydra', tier: 8, base: 350000, cost: 1000000000,
      palette: {
        skin: '#d4a000', skinDark: '#8b6914', skinLight: '#f0d070',
        plate: '#d4a000', plateEdge: '#9b6bff', plateGlow: 'rgba(155,107,255,0.75)',
        breath: ['#9b6bff', '#ffffff'], breathGlow: 'rgba(155,107,255,0.95)', eye: '#9b6bff', aura: null, fxMotes: null },
      shape: { archetype: 'hydra', heads: 3, neckSpread: 1.2, wingSpan: 2.4, mech: false, tails: 2 },
      attack: { kind: 'bolts', hits: 3, cooldown: 0.5, color: 'eye' } },
    { id: 'king_ghidorah', name: 'King Ghidorah', label: 'T2', family: 'ghidorah', archetype: 'hydra', tier: 9, base: 750000, cost: 2500000000,
      palette: {
        skin: '#e6b800', skinDark: '#996600', skinLight: '#ffdd00',
        plate: '#e6b800', plateEdge: '#9b6bff', plateGlow: 'rgba(155,107,255,0.80)',
        breath: ['#9b6bff', '#ffffff'], breathGlow: 'rgba(155,107,255,0.98)', eye: '#9b6bff', aura: null, fxMotes: null },
      shape: { archetype: 'hydra', heads: 3, neckSpread: 1.3, wingSpan: 2.6, mech: false, tails: 2 },
      attack: { kind: 'bolts', hits: 3, cooldown: 0.5, color: 'eye' } },
    { id: 'mecha_ghidorah', name: 'Mecha King Ghidorah', label: 'T3', family: 'ghidorah', archetype: 'hydra', tier: 10, base: 900000, cost: 5000000000,
      palette: {
        skin: '#808080', skinDark: '#4a4a4a', skinLight: '#c0c0c0',
        plate: '#606060', plateEdge: '#00aaff', plateGlow: 'rgba(0,170,255,0.8)',
        breath: ['#00aaff', '#ffffff'], breathGlow: 'rgba(0,170,255,0.98)', eye: '#00aaff', aura: null, fxMotes: null },
      shape: { archetype: 'hydra', heads: 3, neckSpread: 1.4, wingSpan: 2.5, mech: true, tails: 2 },
      attack: { kind: 'bolts', hits: 3, cooldown: 0.5, color: 'eye' } },
    { id: 'grand_king', name: 'Grand King Ghidorah', label: 'T4', family: 'ghidorah', archetype: 'hydra', tier: 11, base: 1200000, cost: 10000000000,
      palette: {
        skin: '#ffee77', skinDark: '#d4a000', skinLight: '#ffffbb',
        plate: '#ffee77', plateEdge: '#9b6bff', plateGlow: 'rgba(155,107,255,0.85)',
        breath: ['#9b6bff', '#ffffff'], breathGlow: 'rgba(155,107,255,0.98)', eye: '#9b6bff', aura: 'rgba(155,107,255,0.15)', fxMotes: null },
      shape: { archetype: 'hydra', heads: 3, neckSpread: 1.5, wingSpan: 2.8, mech: false, tails: 2 },
      attack: { kind: 'bolts', hits: 3, cooldown: 0.5, color: 'eye' } },
    { id: 'void_ghidorah', name: 'Void Ghidorah', label: 'T5', family: 'ghidorah', archetype: 'hydra', tier: 12, base: 2600000, cost: 22000000000,
      palette: {
        skin: '#1a1a2e', skinDark: '#0d0d1a', skinLight: '#3a3a52',
        plate: '#1a1a2e', plateEdge: '#00ccff', plateGlow: 'rgba(0,204,255,0.85)',
        breath: ['#00ccff', '#ffffff'], breathGlow: 'rgba(0,204,255,0.98)', eye: '#00ccff', aura: 'rgba(0,204,255,0.20)', fxMotes: 'cosmic' },
      shape: { archetype: 'hydra', heads: 3, neckSpread: 1.6, wingSpan: 3.0, mech: false, tails: 2 },
      attack: { kind: 'bolts', hits: 3, cooldown: 0.5, color: 'eye' } },

    // ============ Rodan (flyer, pteranodon) — t1, t2, t3 ============
    { id: 'rodan', name: 'Rodan', label: 'T1', family: 'rodan', archetype: 'flyer', tier: 13, base: 4000000, cost: 7000000000,
      palette: {
        skin: '#8b4513', skinDark: '#654321', skinLight: '#a0522d',
        plate: '#8b4513', plateEdge: '#cd853f', plateGlow: 'rgba(205,133,63,0.75)',
        breath: ['#ff8c00', '#ffaa33'], breathGlow: 'rgba(255,140,0,0.9)', eye: '#ffaa00', aura: null, fxMotes: null },
      shape: { archetype: 'flyer', wingSpan: 3.2, wingStyle: 'pteranodon', plates: 0, bulk: 1.1 },
      attack: { kind: 'dive', aoeRadius: 2.6, shake: 11, cooldown: 0.7 } },
    { id: 'rodan_mv', name: 'Rodan', label: 'MV', family: 'rodan', archetype: 'flyer', tier: 14, base: 6500000, cost: 16000000000,
      palette: {
        skin: '#704214', skinDark: '#4a2c0e', skinLight: '#9b6b47',
        plate: '#704214', plateEdge: '#ff8c42', plateGlow: 'rgba(255,140,66,0.80)',
        breath: ['#ff8c00', '#ffbb33'], breathGlow: 'rgba(255,140,0,0.95)', eye: '#ffbb00', aura: null, fxMotes: null },
      shape: { archetype: 'flyer', wingSpan: 3.4, wingStyle: 'pteranodon', plates: 0, bulk: 1.15 },
      attack: { kind: 'dive', aoeRadius: 2.7, shake: 12, cooldown: 0.7 } },
    { id: 'rodan_fire', name: 'Rodan', label: 'Fire', family: 'rodan', archetype: 'flyer', tier: 15, base: 12000000, cost: 36000000000,
      palette: {
        skin: '#ff6b35', skinDark: '#cc5500', skinLight: '#ff9966',
        plate: '#ff6b35', plateEdge: '#ffaa33', plateGlow: 'rgba(255,170,51,0.85)',
        breath: ['#ff4500', '#ff8c00'], breathGlow: 'rgba(255,100,0,0.98)', eye: '#ffdd00', aura: 'rgba(255,100,0,0.18)', fxMotes: 'heat' },
      shape: { archetype: 'flyer', wingSpan: 3.6, wingStyle: 'pteranodon', plates: 0, bulk: 1.2 },
      attack: { kind: 'dive', aoeRadius: 2.8, shake: 13, cooldown: 0.7 } },

    // ============ Mechagodzilla (mecha) — t1, t2, t3, t4 (ASCENDING) ============
    { id: 'mecha_1', name: 'Mechagodzilla', label: 'T1', family: 'mecha', archetype: 'mecha', tier: 16, base: 9000000, cost: 10000000000,
      palette: {
        skin: '#a9a9a9', skinDark: '#696969', skinLight: '#dcdcdc',
        plate: '#c0c0c0', plateEdge: '#e8e8e8', plateGlow: 'rgba(200,200,200,0.7)',
        breath: ['#ff0000', '#ffff00'], breathGlow: 'rgba(255,100,0,0.9)', eye: '#ff0000', aura: null, fxMotes: null },
      shape: { archetype: 'mecha', plates: 9, antennae: 1, panel: true },
      attack: { kind: 'volley', hits: 5, cooldown: 0.42 } },
    { id: 'mecha_2', name: 'Mechagodzilla', label: 'T2', family: 'mecha', archetype: 'mecha', tier: 17, base: 13900000, cost: 22000000000,
      palette: {
        skin: '#4682b4', skinDark: '#1e3a5f', skinLight: '#6fa8dc',
        plate: '#36648b', plateEdge: '#87ceeb', plateGlow: 'rgba(100,180,255,0.8)',
        breath: ['#0080ff', '#ffffff'], breathGlow: 'rgba(0,150,255,0.95)', eye: '#0080ff', aura: null, fxMotes: null },
      shape: { archetype: 'mecha', plates: 9, antennae: 2, panel: true },
      attack: { kind: 'volley', hits: 5, cooldown: 0.42 } },
    { id: 'mecha_3', name: 'Mechagodzilla', label: 'T3', family: 'mecha', archetype: 'mecha', tier: 18, base: 15000000, cost: 48000000000,
      palette: {
        skin: '#1a1a1a', skinDark: '#0d0d0d', skinLight: '#4a4a4a',
        plate: '#2a2a2a', plateEdge: '#ff2020', plateGlow: 'rgba(255,50,50,0.85)',
        breath: ['#ff0000', '#ffaa00'], breathGlow: 'rgba(255,50,0,0.98)', eye: '#ff0000', aura: null, fxMotes: null },
      shape: { archetype: 'mecha', plates: 9, antennae: 2, panel: true },
      attack: { kind: 'volley', hits: 6, cooldown: 0.42 } },
    { id: 'super_mecha', name: 'Mechagodzilla', label: 'Super', family: 'mecha', archetype: 'mecha', tier: 19, base: 16800000, cost: 100000000000,
      palette: {
        skin: '#d4a574', skinDark: '#8b6f47', skinLight: '#e8d7c3',
        plate: '#a9a9a9', plateEdge: '#ffd700', plateGlow: 'rgba(255,215,0,0.88)',
        breath: ['#ffff00', '#ff8c00'], breathGlow: 'rgba(255,150,0,0.98)', eye: '#ffd700', aura: 'rgba(255,215,0,0.18)', fxMotes: null },
      shape: { archetype: 'mecha', plates: 9, antennae: 2, panel: true },
      attack: { kind: 'volley', hits: 6, cooldown: 0.42 } }
  ],

  // --- Stronger Atomic Breath progression (§0 economy rule; internal keys remain CLAWS/claws) ---
  CLAWS: [
    { level: 0, cost: 0 },
    { level: 1, cost: 12 },
    { level: 2, cost: 31 },
    { level: 3, cost: 81 },
    { level: 4, cost: 211 },
    { level: 5, cost: 549 },
    { level: 6, cost: 1428 },
    { level: 7, cost: 3713 },
    { level: 8, cost: 9655 },
    { level: 9, cost: 25103 }
  ],

  // --- Special buildings (non-standard footprints, sprites, effects) ---
  SPECIALS: {
    statue: { hp: 5e8, footprint: { w: 2, h: 2 }, height: 7, sprite: 'statue', place: 'topmid', unique: true },
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
  JUMP: { vEscape: 8.5, gravity: 26 }
};
