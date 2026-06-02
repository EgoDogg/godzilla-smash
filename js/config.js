/* GAME.Config — single source of truth: balance, costs, forms, titans, grid. Pure data, zero deps. */
window.GAME = window.GAME || {};
window.GAME.Config = {
  saveKey: 'godzilla-save-v2',
  CACHE_VERSION: 'gz-v2',

  // --- Isometric grid (world units = tiles). Sized for a block-and-street city:
  //     19 depth bands × (blockD 2 + street 1) ≈ 58 rows; ~4 blocks wide. ---
  GRID: { cols: 13, rows: 58, TILE_W: 64, TILE_H: 32, WZ_PX: 44 },

  // --- Block-and-street layout. A cell is a STREET when its index within the
  //     period (block + street) lands on the street lane. Tier = depth band. ---
  LAYOUT: { blockW: 2, blockD: 2, street: 1, bands: 19 },

  // --- Building HP ladder by TIER (depth band). HP === money payout. 19 tiers,
  //     SMOOTHED ~2.3×/tier (expert flow-channel curve), ~10 → 42M. ---
  ROW_HP: [10, 25, 60, 140, 320, 750, 1700, 4000, 9000, 21000,
           50000, 115000, 270000, 620000, 1400000, 3300000, 7600000, 18000000, 42000000],

  // --- Godzilla loom + growth: base draw scale, ×1.15 per evolution tier. ---
  GZ: { baseScale: 1.5, evoGrowth: 1.15, titanScale: 1.6 },

  // --- Godzilla attack: power = START_ATTACK * evo.mult * CLAWS_MULT^clawsLevel ---
  START_ATTACK: 6,
  CLAWS_MULT: 2.0,            // each Stronger Claws level DOUBLES damage
  CLAWS_BASE: 12,            // cost = round(CLAWS_BASE * CLAWS_GROWTH^level)
  CLAWS_GROWTH: 2.6,

  // --- Combo: the only damage multiplier (chain smashes to ramp ×1 → ×2) ---
  COMBO: { WINDOW_MS: 1600, STEP: 0.04, MAX: 2.0 },
  PASSIVE: 0,                // no passive income (would trivialize deep rows)

  // --- Destruction / respawn timing (ms) ---
  RESPAWN: { CRUMBLE_MS: 550, RUBBLE_MS: 6500, RUBBLE_PER_TIER: 450, RISE_MS: 700 },

  WORLD2_COST: 12e9,         // capstone unlock → "Coming soon" stub

  // --- Godzilla evolution forms (Godzilla-only progression) ---
  EVOLUTIONS: [
    { id: 'gz2014', name: 'Godzilla', year: '2014', cost: 0, mult: 1,
      skin: '#3c3c3c', skinDark: '#1e1e1e', skinLight: '#565656',
      plate: '#2b2b2b', plateEdge: '#8fc2ee', plateGlow: 'rgba(70,160,235,0.45)',
      breath: ['#9bdcff', '#ffffff'], breathGlow: 'rgba(70,170,255,0.9)', eye: '#ffbe3a', aura: null, fx: null },
    { id: 'burning', name: 'Burning Godzilla', year: '2019', cost: 50000, mult: 8,
      skin: '#2c2622', skinDark: '#150f0b', skinLight: '#54381f',
      plate: '#3a1c0e', plateEdge: '#ff7a1a', plateGlow: 'rgba(255,110,20,0.95)',
      breath: ['#9ad0ff', '#ffffff'], breathGlow: 'rgba(90,170,255,0.85)', eye: '#ffd24a', aura: 'rgba(255,90,20,0.16)', fx: 'heat' },
    { id: 'gvk', name: 'Godzilla · GvK', year: '2021', cost: 200000, mult: 40,
      skin: '#3e444b', skinDark: '#21262b', skinLight: '#647682',
      plate: '#33424c', plateEdge: '#cdecff', plateGlow: 'rgba(70,180,255,0.65)',
      breath: ['#36c9ff', '#ffffff'], breathGlow: 'rgba(54,201,255,0.95)', eye: '#ffcf4a', aura: 'rgba(60,160,255,0.13)', fx: null },
    { id: 'gxk', name: 'Godzilla × Kong', year: '2024', cost: 12000000, mult: 500,
      skin: '#2c2731', skinDark: '#16101a', skinLight: '#4c2942',
      plate: '#2a2330', plateEdge: '#ff6cc6', plateGlow: 'rgba(255,70,185,0.9)',
      breath: ['#ff7ad0', '#ffe1f4'], breathGlow: 'rgba(255,60,180,0.95)', eye: '#ffd6f2', aura: 'rgba(255,40,160,0.18)', fx: 'pink' },
    { id: 'supernova', name: 'Supernova Godzilla', year: '2027', cost: 100000000, mult: 3000,
      skin: '#251440', skinDark: '#0d011a', skinLight: '#522485',
      plate: '#2a0a55', plateEdge: '#dcb0ff', plateGlow: 'rgba(165,90,230,0.98)',
      breath: ['#ffffff', '#b07dff'], breathGlow: 'rgba(200,120,255,0.98)', eye: '#ffffff', aura: 'rgba(157,78,221,0.24)', fx: 'cosmic' },
  ],

  // --- Playable Titans (separate units; own flat base power + signature attack) ---
  TITANS: [
    { id: 'ghidorah', name: 'King Ghidorah', cost: 1e9, base: 2e6, sig: 'lightning', hitsN: 3,
      desc: 'Triple lightning — strikes 3 buildings at once', tint: '#ffd24a', accent: '#9b6bff' },
    { id: 'mothra', name: 'Mothra', cost: 3.5e9, base: 7e6, sig: 'powder', dot: { frac: 0.06, ticks: 10, intervalMs: 300 },
      desc: 'Flight + powder cloud (damage over time)', tint: '#6fe0ff', accent: '#ffe06a' },
    { id: 'rodan', name: 'Rodan', cost: 7e9, base: 16e6, sig: 'dive', aoe: { radius: 2.2 },
      desc: 'Dive-bomb shockwave (area damage)', tint: '#d6452f', accent: '#ffb347' },
    { id: 'mecha', name: 'Mechagodzilla', cost: 10e9, base: 30e6, sig: 'missiles', hitsN: 5,
      desc: 'Missile spray — hits 5 buildings', tint: '#b9c2cc', accent: '#ff5a5a' },
  ],
};
