/* GAME.Economy — money, claws, active-unit power, combo, save v3, shop DOM.
 * Deps: GAME.Config (Config.FORMS + all balance/costs), GAME.Utils (fmt/safeSave/safeLoad/clamp),
 *       GAME.Audio (buy/evolve/recruit/deny SFX + mute), existing #shop DOM in index.html.
 *
 * v3 changes (contract §0 + §3):
 *   - attackPower() = activeForm.base × CLAWS_MULT^clawsLevel  (UNIVERSAL claws — every form)
 *   - activeUnit() / shop built from Config.FORMS grouped by family
 *   - Save key 'godzilla-save-v3' (FRESH — no migration from v2)
 *   - Default save: money 0, ownedFormIds ['gz2014'], activeFormId 'gz2014'
 *   - Shop: Evolutions tab = wyrm (Godzilla) forms gated in tier order
 *           Characters tab = the 4 Titan families (buy base form to unlock character,
 *                            then buy each evolution in tier order; switch any owned form)
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Cfg = G.Config;
  var U   = G.Utils;

  // Bounded-economy ceiling (research-2026-06c): the game is finite — once attack power can
  // one-shot the strongest building, the damage upgrade hard-stops and the win-finale is in
  // reach. Data-derived from the HP ladder so it survives ROW_HP retuning (currently 1e9).
  var CAP_HP = Math.max.apply(null, Cfg.ROW_HP);

  // ---- FORMS helpers -------------------------------------------------------------------------
  // formDef(id) — look up a form by id in Config.FORMS.
  function formDef(id) {
    var F = Cfg.FORMS;
    for (var i = 0; i < F.length; i++) { if (F[i].id === id) return F[i]; }
    return null;
  }

  // formsByFamily(family) — all forms with matching family, sorted ascending by tier.
  function formsByFamily(family) {
    return Cfg.FORMS.filter(function (f) { return f.family === family; })
                    .sort(function (a, b) { return a.tier - b.tier; });
  }

  // wyrm forms = Godzilla evolution chain (family:'wyrm')
  function wyrmForms() { return formsByFamily('wyrm'); }

  // Titan families = the four non-wyrm families, each as an ordered array of forms.
  var TITAN_FAMILIES = ['mothra', 'ghidorah', 'rodan', 'mecha'];

  // ---- Persistent state ----------------------------------------------------------------------
  // ownedFormIds  : array of form ids the player owns
  // activeFormId  : the id of the currently active form
  // clawsLevel    : Stronger-Claws purchases (each ×CLAWS_MULT = ×2 by default)
  // maxReachedRow : frontier depth
  // world2Unlocked: capstone purchase flag
  // muted         : persisted audio-mute flag
  var state = {
    money:          0,
    clawsLevel:     0,
    atkSpeedLevel:  0,          // Attack-Speed upgrade track (Config.ATKSPD), 0..LEVELS
    moveSpeedLevel: 0,          // Move-Speed upgrade track (Config.MOVESPD), 0..LEVELS
    finisherOwned:  false,      // Nova Slam charged finisher unlocked (one-time)
    ownedFormIds:   ['gz2014'],
    activeFormId:   'gz2014',
    maxReachedRow:  0,
    world2Unlocked: false,
    muted:          false,
    lastSeen:       0,          // ms timestamp of last save (for a future offline-income floor)
    finaleSeen:     false,      // win-finale played once (attackPower>=CAP_HP + statue destroyed)
    maxPowerSeen:   false,      // one-time "find the Statue" toast fired (attackPower first >= CAP_HP)
    formAxisSeen:   true,       // forms-as-axis rebalance ack'd (default true → fresh players never toast; a pre-formula save lacks the field → toast once)
    peakCombo:      1           // highest combo multiplier reached this save (win-card stat)
  };

  // HUD dirty flag — UI polls and repaints when set.
  var hudDirty = true;

  // ---- Combo ---------------------------------------------------------------------------------
  var comboT       = 0;   // ms remaining in the current combo window
  var comboMultVal = 1;   // current multiplier, clamped to [1, COMBO.MAX]

  // ---- Move-Speed multiplier (cached; entities reads moveSpeedMult() at 60Hz) ----------------
  var moveMult = 1;       // (1 + MOVESPD.PER_LEVEL)^moveSpeedLevel
  function recalcMoveMult() {
    moveMult = Math.pow(1 + Cfg.MOVESPD.PER_LEVEL, state.moveSpeedLevel);
  }

  // ---- Save cadence ---------------------------------------------------------------------------
  // High-frequency events (bankDestroy on every kill, frontier advance) set a dirty flag
  // instead of writing localStorage each time; a 2s timer + visibilitychange/pagehide flush it.
  // Purchases / mute keep an IMMEDIATE save (never risk losing a paid upgrade on a crash).
  var _saveDirty = false;
  function markSaveDirty() { _saveDirty = true; }
  function flushSave() { if (_saveDirty) { _saveDirty = false; save(); } }

  // ===========================================================================================
  // Audio helpers
  // ===========================================================================================
  function audio(method, arg) {
    var A = G.Audio;
    if (A && typeof A[method] === 'function') {
      try { A[method](arg); } catch (e) { /* never let SFX break gameplay */ }
    }
  }
  function sfxBuy()  { if (G.Audio && typeof G.Audio.buy  === 'function') audio('buy');  else audio('recruit'); }
  function sfxDeny() { if (G.Audio && typeof G.Audio.deny === 'function') audio('deny'); }

  // ===========================================================================================
  // Power  (contract §0 — UNIVERSAL claws)
  // attackPower() = activeForm.base × CLAWS_MULT^clawsLevel
  // ===========================================================================================
  // Forms-as-axis (Collection Multiplier + Option B): 1 + Σ FORM_BONUS[owned] + FORM_BONUS[active].
  // Memoized — recomputed on every ownedFormIds OR activeFormId change (afterPurchase covers
  // buyForm/switchForm/buyClaws; load recomputes at boot). NEVER persisted (derives from state).
  var _collMult = 1;
  function formBonusOf(id) { var m = Cfg.FORM_BONUS; return (m && m[id]) || 0; }
  function recomputeCollMult() {
    var s = 0, ids = state.ownedFormIds, i;
    for (i = 0; i < ids.length; i++) s += formBonusOf(ids[i]);
    if (Cfg.ACTIVE_DOUBLE_COUNT) s += formBonusOf(state.activeFormId);   // Option B felt-switch
    _collMult = 1 + s;
    return _collMult;
  }
  function collectionMult() { return _collMult; }
  function formContribLabel(f) {
    var b = formBonusOf(f && f.id);
    return b > 0 ? ('+' + b + ' collection power · permanent') : 'Starter form';
  }

  function attackPower() {
    return Cfg.START_ATTACK * Math.pow(Cfg.CLAWS_MULT, state.clawsLevel) * _collMult;
  }

  // activeUnit() → {kind, formId, family, signature, base, attack}
  // Describes the currently controlled unit for the entities/render layer.
  //   kind = activeFormId (always a form id; callers that previously tested ==='gz' should
  //          check family==='wyrm' instead, but 'gz2014'/'burning'/etc. are distinct)
  //   For backward compat with callers that tested kind==='gz', expose formId as well.
  function activeUnit() {
    var f = formDef(state.activeFormId);
    if (!f) {
      // Defensive: fall back to first wyrm form.
      var fallback = wyrmForms()[0];
      return { kind: fallback.id, formId: fallback.id, family: fallback.family,
               signature: fallback.attack ? fallback.attack.kind : 'beam',
               base: attackPower(), attack: fallback.attack };
    }
    // For entities.js compatibility: if the form is wyrm family, expose kind='gz' as well
    // so legacy callers can still test kind==='gz'.
    var kind = (f.family === 'wyrm') ? 'gz' : f.id;
    return {
      kind:      kind,
      formId:    f.id,
      family:    f.family,
      signature: f.attack ? f.attack.kind : 'beam',
      base:      attackPower(),
      attack:    f.attack
    };
  }

  // ===========================================================================================
  // Combo
  // ===========================================================================================
  function comboMult() { return comboMultVal; }

  function tickCombo(dtMs) {
    if (comboT > 0) {
      comboT -= dtMs;
      if (comboT <= 0) { comboT = 0; comboMultVal = 1; }
    }
  }

  function bumpCombo() {
    var C = Cfg.COMBO;
    comboT = C.WINDOW_MS;
    comboMultVal = U.clamp(comboMultVal + C.STEP, 1, C.MAX);
    if (comboMultVal > state.peakCombo) state.peakCombo = comboMultVal;  // win-card stat
  }

  // ===========================================================================================
  // Banking destroys
  // ===========================================================================================
  function bankDestroy(rowHp) {
    var base   = Math.max(0, Math.floor(rowHp));
    var payout = Math.floor(base * comboMultVal);
    state.money += payout;
    bumpCombo();
    hudDirty = true;
    markSaveDirty();   // batched (was save() every kill) — flushed on a 2s timer + page-hide
    return payout;
  }

  // ===========================================================================================
  // Affordability + costs
  // ===========================================================================================
  function canAfford(n) { return state.money >= n; }

  // Bounded-economy pricing (research-2026-06c): cost = the NEW TOTAL attack power the buy
  // grants = base × CLAWS_MULT^(level+1). With HP===payout, the building worth D funds the
  // upgrade that makes you deal D. Replaces the old round(CLAWS_BASE×CLAWS_GROWTH^level) curve
  // (which outran income ~5000× by the finale). Back-compat: gz2014 L0 = round(6×2^1)=12 == old.
  function clawsCost() {
    // Carries the SAME collection multiplier as attackPower so it cancels in the cost:income
    // ratio — the bounded invariant (clawsCost === CLAWS_MULT × attackPower) holds at every mult.
    return Math.round(Cfg.START_ATTACK * Math.pow(Cfg.CLAWS_MULT, state.clawsLevel + 1) * _collMult);
  }

  function atkSpeedCost() {
    return Math.round(Cfg.ATKSPD.BASE * Math.pow(Cfg.ATKSPD.GROWTH, state.atkSpeedLevel));
  }

  // ---- Win-finale (research-2026-06c) --------------------------------------------------------
  // The game is finite: when attack power can one-shot the strongest building (>=CAP_HP) AND
  // the player destroys the unique statue, the one-time completion beat fires.
  function canFinale() { return attackPower() >= CAP_HP && !state.finaleSeen; }
  function markFinale() {
    if (!state.finaleSeen) {
      state.finaleSeen = true;
      state.world2Unlocked = true;   // World 2 is the FREE reward for winning (Mike: TASTE-2A)
      save();
    }
  }
  function finaleStats() {
    return {
      formsOwned:  state.ownedFormIds.length,
      formsTotal:  (Cfg.FORMS ? Cfg.FORMS.length : 20),
      attackPower: attackPower(),
      clawsLevel:  state.clawsLevel,
      money:       state.money,
      peakCombo:   state.peakCombo
    };
  }

  // Re-fire gate (seconds) for the ACTIVE form at a given attack-speed level — display only.
  // Mirrors entities.js attackGateFor (the engine is authoritative); kept here for the shop
  // rate label since economy has no kaiju handle. NOTE: duplicated gate math — consolidation
  // candidate if a shared Config-driven helper is later extracted.
  function atkGateForLevel(level) {
    var f  = formDef(state.activeFormId);
    var cd = (f && f.attack && typeof f.attack.cooldown === 'number') ? f.attack.cooldown : 0.30;
    var g  = cd * (Cfg.COOLDOWN_SCALE != null ? Cfg.COOLDOWN_SCALE : 0.42);
    var lo = (Cfg.COOLDOWN_FLOOR != null) ? Cfg.COOLDOWN_FLOOR : 0.11;
    var hi = (Cfg.COOLDOWN_CAP != null) ? Cfg.COOLDOWN_CAP : 0.20;
    if (g < lo) g = lo;
    if (g > hi) g = hi;
    var A = Cfg.ATKSPD;
    if (A && level > 0) g = A.FLOOR + (g - A.FLOOR) * Math.pow(A.DECAY, level);
    return g;
  }

  // ===========================================================================================
  // Ownership helpers
  // ===========================================================================================
  function ownsForm(id) { return state.ownedFormIds.indexOf(id) !== -1; }

  // isFormUnlocked(form) — a form can be purchased when:
  //   - all lower-tier forms in its family are already owned
  //   - it is not yet owned
  function isFormUnlocked(form) {
    if (ownsForm(form.id)) return false; // already owned
    var chain = formsByFamily(form.family);
    // Every form with a lower tier index must be owned.
    for (var i = 0; i < chain.length; i++) {
      if (chain[i].tier >= form.tier) break;
      if (!ownsForm(chain[i].id)) return false;
    }
    return true; // immediate next in order
  }

  // ===========================================================================================
  // Purchases
  // ===========================================================================================

  function buyClaws() {
    if (attackPower() >= CAP_HP) { sfxDeny(); return false; } // bounded: already one-shots the strongest
    var cost = clawsCost();
    if (!canAfford(cost)) { sfxDeny(); return false; }
    state.money -= cost;
    state.clawsLevel += 1;
    sfxBuy();
    afterPurchase();
    return true;
  }

  function buyAtkSpeed() {
    if (state.atkSpeedLevel >= Cfg.ATKSPD.LEVELS) { sfxDeny(); return false; } // capped track
    var cost = atkSpeedCost();
    if (!canAfford(cost)) { sfxDeny(); return false; }
    state.money -= cost;
    state.atkSpeedLevel += 1;
    sfxBuy();
    afterPurchase();
    return true;
  }

  function moveSpeedCost() {
    return Math.round(Cfg.MOVESPD.BASE * Math.pow(Cfg.MOVESPD.GROWTH, state.moveSpeedLevel));
  }

  function buyMoveSpeed() {
    if (state.moveSpeedLevel >= Cfg.MOVESPD.LEVELS) { sfxDeny(); return false; } // capped track
    var cost = moveSpeedCost();
    if (!canAfford(cost)) { sfxDeny(); return false; }
    state.money -= cost;
    state.moveSpeedLevel += 1;
    recalcMoveMult();   // make the new multiplier live before the HUD/sim next read it
    sfxBuy();
    afterPurchase();
    return true;
  }

  function buyFinisher() {
    if (state.finisherOwned) { sfxDeny(); return false; }   // one-time unlock
    var cost = Cfg.FINISHER.COST;
    if (!canAfford(cost)) { sfxDeny(); return false; }
    state.money -= cost;
    state.finisherOwned = true;
    sfxBuy();
    afterPurchase();
    return true;
  }

  // buyForm(id) — buy any form that passes the unlock gate.
  //   Wyrm forms: play 'evolve' SFX (Godzilla evolution).
  //   Titan base forms (tier 1): play 'recruit' SFX (new character unlocked).
  //   Titan evolution forms: play 'evolve' SFX.
  function buyForm(id) {
    var f = formDef(id);
    if (!f) { sfxDeny(); return false; }
    if (!isFormUnlocked(f)) { sfxDeny(); return false; }
    if (!canAfford(f.cost)) { sfxDeny(); return false; }
    state.money -= f.cost;
    state.ownedFormIds.push(id);
    var chain = formsByFamily(f.family);
    var isBaseForm = (chain[0] && chain[0].id === f.id);
    var recruit = (f.family !== 'wyrm' && isBaseForm);
    audio(recruit ? 'recruit' : 'evolve');
    // On-screen fanfare to match the SFX — the biggest power + visual leap in the game
    // deserves a toast, not a silent badge-swap. Env.announce already drives rare-house toasts.
    if (G.Env && typeof G.Env.announce === 'function') {
      G.Env.announce(recruit
        ? ('Recruited ' + f.name + '!')
        : ('Evolved to ' + f.name + (f.label ? ' — ' + f.label : '') + '!'));
    }
    afterPurchase();
    return true;
  }

  // switchForm(id) — switch active form to any owned form.
  function switchForm(id) {
    if (!ownsForm(id)) { sfxDeny(); return false; }
    if (state.activeFormId === id) return false; // already active
    state.activeFormId = id;
    sfxBuy();
    afterPurchase();
    return true;
  }

  // buyWorld2() — capstone unlock.
  function buyWorld2() {
    if (state.world2Unlocked) { sfxDeny(); return false; }
    if (!canAfford(Cfg.WORLD2_COST)) { sfxDeny(); return false; }
    state.money -= Cfg.WORLD2_COST;
    state.world2Unlocked = true;
    sfxBuy();
    afterPurchase();
    return true;
  }

  // Legacy shim: buyEvolution() and buyTitan()/switchChar() for any caller that hasn't yet
  // been updated to the v3 API. They delegate to buyForm/switchForm.
  function buyEvolution() {
    var chain = wyrmForms();
    for (var i = 0; i < chain.length; i++) {
      if (isFormUnlocked(chain[i])) return buyForm(chain[i].id);
    }
    sfxDeny(); return false;
  }

  function buyTitan(id) { return buyForm(id); }

  function switchChar(id) {
    // v2 used 'gz' as the key for Godzilla. Map it to the first owned wyrm form.
    if (id === 'gz') {
      var chain = wyrmForms();
      // Switch to the highest-tier owned wyrm form (most natural for "switch to Godzilla").
      var best = null;
      for (var i = chain.length - 1; i >= 0; i--) {
        if (ownsForm(chain[i].id)) { best = chain[i]; break; }
      }
      if (!best) { sfxDeny(); return false; }
      return switchForm(best.id);
    }
    return switchForm(id);
  }

  function afterPurchase() {
    recomputeCollMult();   // forms-as-axis: refresh the memoized multiplier before any power read
    // First time the player can one-shot the strongest building, point them at the win — the
    // finale statue is otherwise undiscoverable (Mike: TASTE-1B). One-time toast; the render
    // beacon then keeps guiding them until they smash it.
    if (!state.maxPowerSeen && !state.finaleSeen && attackPower() >= CAP_HP) {
      state.maxPowerSeen = true;
      if (G.Env && typeof G.Env.announce === 'function') {
        G.Env.announce('MAXIMUM POWER! Find and smash the Statue at the city\'s heart to WIN.');
      }
    }
    hudDirty = true;
    save();
    refreshShop();
    if (window.GAME.Main && window.GAME.Main.syncForm) window.GAME.Main.syncForm();
  }

  // ===========================================================================================
  // Save / Load  (v4 multi-slot container — docs/campaign/save-system-plan.md, Phase 1)
  //
  // ONE localStorage key holds the WHOLE container, written as a single atomic setItem so slots
  // can never cross-corrupt and quota is all-or-nothing. The container is the synchronous source
  // of truth, read once at boot. A legacy v3 (single flat) save is migrated into a v4 container
  // with one slot, CRASH-SAFELY: the v3 key is KEPT as a safety net and only reaped on a LATER
  // boot that re-parsed a well-formed v4 (never deleting the only good copy after a failed write).
  //
  //   v4 = { v:4, rev, activeSlot:<id>, migratedFrom?, slots:[ {id,name,createdAt,lastPlayed,
  //          lastBackupAt,backupPromptSeen,prestige, game:{<the 15 flat fields>} } ] }
  // ===========================================================================================
  var SAVE      = Cfg.SAVE || {};
  var KEY_V4    = SAVE.KEY_V4 || 'godzilla-save-v4';
  var V3_KEY    = SAVE.V3_KEY || 'godzilla-save-v3';

  var container      = null;    // the live v4 container = the in-memory source of truth (set in load())
  var _saveWarnShown = false;   // surface a save failure (quota / private mode) once

  // String slot ids (never an array index, so delete/switch can't alias a stale slot).
  function newSlotId() {
    var t = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
    var r = (typeof Math !== 'undefined' && Math.random) ? Math.random() : 0;
    return 's' + t.toString(36) + '-' + r.toString(36).slice(2, 8);
  }

  // freshGame() — the 15 default persisted fields (mirrors the initial `state` defaults).
  function freshGame() {
    return {
      money: 0, clawsLevel: 0, atkSpeedLevel: 0, moveSpeedLevel: 0, finisherOwned: false,
      ownedFormIds: ['gz2014'], activeFormId: 'gz2014', maxReachedRow: 0,
      world2Unlocked: false, muted: false, lastSeen: 0, finaleSeen: false,
      maxPowerSeen: false, formAxisSeen: true, peakCombo: 1
    };
  }

  // sanitizeGame(raw) → a FRESH clean game object. An ALLOWLIST build: reads ONLY the 15 known
  // fields BY NAME (never spreads raw → prototype-pollution-proof) and clamps every one, so an
  // imported / migrated / corrupt save can never carry a state a normal play session couldn't.
  function sanitizeGame(raw) {
    var s = raw || {};
    var owned = [];
    if (Array.isArray(s.ownedFormIds)) {
      for (var i = 0; i < s.ownedFormIds.length; i++) {
        var id = s.ownedFormIds[i];
        if (formDef(id) && owned.indexOf(id) === -1) owned.push(id);
      }
    }
    if (owned.indexOf('gz2014') === -1) owned.unshift('gz2014');   // gz2014 is always owned
    var active = (typeof s.activeFormId === 'string' && owned.indexOf(s.activeFormId) !== -1) ? s.activeFormId : 'gz2014';
    return {
      money:          (typeof s.money === 'number' && isFinite(s.money)) ? Math.max(0, s.money) : 0,
      clawsLevel:     U.clamp(s.clawsLevel | 0, 0, 64),   // normal ceiling ~28; 64 keeps attackPower finite
      atkSpeedLevel:  U.clamp(s.atkSpeedLevel | 0, 0, Cfg.ATKSPD.LEVELS),
      moveSpeedLevel: U.clamp(s.moveSpeedLevel | 0, 0, Cfg.MOVESPD.LEVELS),
      finisherOwned:  !!s.finisherOwned,
      ownedFormIds:   owned,
      activeFormId:   active,
      maxReachedRow:  U.clamp(s.maxReachedRow | 0, 0, Cfg.GRID.rows - 1),
      world2Unlocked: !!s.world2Unlocked,
      muted:          !!s.muted,
      lastSeen:       (typeof s.lastSeen === 'number' && isFinite(s.lastSeen)) ? s.lastSeen : 0,
      finaleSeen:     !!s.finaleSeen,
      maxPowerSeen:   !!s.maxPowerSeen,
      formAxisSeen:   true,
      peakCombo:      (typeof s.peakCombo === 'number' && s.peakCombo >= 1) ? s.peakCombo : 1
    };
  }

  // serializeState() → the 15 flat fields read out of live `state` (for writing into a slot).
  function serializeState() {
    return {
      money: state.money, clawsLevel: state.clawsLevel, atkSpeedLevel: state.atkSpeedLevel,
      moveSpeedLevel: state.moveSpeedLevel, finisherOwned: state.finisherOwned,
      ownedFormIds: state.ownedFormIds.slice(), activeFormId: state.activeFormId,
      maxReachedRow: state.maxReachedRow, world2Unlocked: state.world2Unlocked,
      muted: state.muted, lastSeen: state.lastSeen, finaleSeen: state.finaleSeen,
      maxPowerSeen: state.maxPowerSeen, formAxisSeen: state.formAxisSeen, peakCombo: state.peakCombo
    };
  }

  function makeSlot(name, game, now) {
    return { id: newSlotId(), name: name, createdAt: now, lastPlayed: now,
             lastBackupAt: 0, backupPromptSeen: false, prestige: 0, game: game };
  }

  function freshContainer(game) {
    var now = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
    var slot = makeSlot('Slot 1', game, now);
    return { v: 4, rev: 0, activeSlot: slot.id, migratedFrom: null, slots: [slot] };
  }

  // readContainer() → a structurally-valid v4 container, or null.
  function readContainer() {
    var c = U.safeLoad(KEY_V4);
    if (!c || c.v !== 4 || !Array.isArray(c.slots) || c.slots.length < 1) return null;
    return c;
  }

  // activeSlotOf(c) → the active slot, self-healing a dangling activeSlot id to the first slot.
  function activeSlotOf(c) {
    for (var i = 0; i < c.slots.length; i++) { if (c.slots[i].id === c.activeSlot) return c.slots[i]; }
    c.activeSlot = c.slots[0].id;
    return c.slots[0];
  }

  // writeContainer(c) → atomic single-key write; bumps the monotonic rev (the conflict authority,
  // immune to clock skew — used by the Phase-5 IDB mirror to decide which copy is newer).
  function writeContainer(c) {
    c.rev = (c.rev | 0) + 1;
    var ok = U.safeSave(KEY_V4, c);
    // safeSave returns false on quota / private-mode / ITP eviction — tell the player ONCE rather
    // than silently losing progress. (G.UI.toast does not exist — use Env.announce.)
    if (!ok && !_saveWarnShown) {
      _saveWarnShown = true;
      if (G.Env && typeof G.Env.announce === 'function') {
        G.Env.announce('Progress is not saving (storage full or private mode)');
      }
    }
    return ok;
  }

  // applySlotToState(game) → sanitize the slot's game, assign into live `state`, recompute the
  // memoized multipliers. ALWAYS sanitizes, so no apply path can install a state a load couldn't.
  function applySlotToState(game) {
    var g = sanitizeGame(game);
    state.money          = g.money;
    state.clawsLevel     = g.clawsLevel;
    state.atkSpeedLevel  = g.atkSpeedLevel;
    state.moveSpeedLevel = g.moveSpeedLevel;
    state.finisherOwned  = g.finisherOwned;
    state.ownedFormIds   = g.ownedFormIds;
    state.activeFormId   = g.activeFormId;
    state.maxReachedRow  = g.maxReachedRow;
    state.world2Unlocked = g.world2Unlocked;
    state.muted          = g.muted;
    state.lastSeen       = g.lastSeen;
    state.finaleSeen     = g.finaleSeen;
    state.maxPowerSeen   = g.maxPowerSeen;
    state.formAxisSeen   = g.formAxisSeen;
    state.peakCombo      = g.peakCombo;
    recalcMoveMult();
    recomputeCollMult();
    hudDirty = true;
  }

  // The forms-as-axis "power rebalanced, progress intact" toast (gz-v26) — fires ONCE for a save
  // that PREDATES the formula (formAxisSeen absent). Preserved across the v4 migration: a pre-
  // formula v3 toasts at migration, then the v4 slot.game carries formAxisSeen:true forever.
  function fireRebalanceToast() {
    if (typeof setTimeout !== 'function') return;
    setTimeout(function () {
      if (G.Env && typeof G.Env.announce === 'function') {
        G.Env.announce('Power rebalanced — your claws and collection are intact; every monster you own now permanently boosts your damage.');
      }
    }, 1600);
  }

  // maybeReapV3(c) — once a well-formed v4 (migrated from v3) has been RE-READ on a later boot,
  // the v3 safety-net is provably redundant → remove it. Idempotent (guards on getItem) and never
  // runs on the migrating boot itself (that boot takes the migrate branch, not readContainer).
  function maybeReapV3(c) {
    if (c.migratedFrom !== 'v3') return;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(V3_KEY) !== null) {
        localStorage.removeItem(V3_KEY);
      }
    } catch (e) { /* private mode / blocked — leave the net in place */ }
  }

  // save() — persist live state into the active slot of the v4 container, atomically.
  function save() {
    if (!container) container = freshContainer(freshGame());   // safety: load() normally runs first
    state.lastSeen = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
    var slot = activeSlotOf(container);
    slot.game = serializeState();
    slot.lastPlayed = state.lastSeen;
    writeContainer(container);
  }

  // load() → bool (an existing save was found). Establishes the in-memory container (reading v4,
  // else migrating a v3 save, else seeding a fresh one), points at the active slot, applies it.
  function load() {
    var existing = readContainer();
    if (existing) {
      container = existing;
      maybeReapV3(container);                              // a later boot after a v3 migration → reap the net
      applySlotToState(activeSlotOf(container).game);
      return true;
    }
    // No v4 container yet — migrate a legacy v3 save if present, else seed a fresh container.
    var raw3  = U.safeLoad(V3_KEY);
    var hasV3 = !!(raw3 && raw3.v === 3);
    var toast = hasV3 && (raw3.formAxisSeen === undefined);   // pre-formula save → rebalance toast once
    container = freshContainer(hasV3 ? sanitizeGame(raw3) : freshGame());
    if (hasV3) {
      container.migratedFrom = 'v3';
      writeContainer(container);                           // persist the migration now; KEEP v3 (reap next boot)
    }
    // Fresh new player: leave the container in memory only; the first save() writes it (so a
    // brand-new private-mode player isn't warned at boot before they've done anything).
    applySlotToState(activeSlotOf(container).game);
    if (toast) fireRebalanceToast();
    return hasV3;
  }

  // ===========================================================================================
  // Mute
  // ===========================================================================================
  function isMuted()    { return state.muted; }
  function setMuted(b)  { state.muted = !!b; audio('mute', state.muted); save(); hudDirty = true; return state.muted; }
  function toggleMute() { return setMuted(!state.muted); }

  // ===========================================================================================
  // Shop DOM
  // ===========================================================================================
  var currentTab = 'upgrades';
  var wired      = false;

  function $(id) { return document.getElementById(id); }

  // itemRow(opts) — build one .shop-item row.
  // opts: swatch, title, sub, tag, button:{label,affordable,disabled,onClick}, cls
  function itemRow(opts) {
    var row = document.createElement('div');
    row.className = 'shop-item' + (opts.cls ? ' ' + opts.cls : '');

    var left = document.createElement('div');
    left.className = 'si-l';

    if (opts.swatch) {
      var sw = document.createElement('div');
      sw.className = 'sw';
      sw.style.background = opts.swatch;
      sw.style.color = opts.swatch;
      left.appendChild(sw);
    }

    var txt = document.createElement('div');
    txt.style.minWidth = '0';
    var t = document.createElement('div');
    t.className = 'si-t';
    t.textContent = opts.title;
    txt.appendChild(t);
    if (opts.sub) {
      var s = document.createElement('div');
      s.className = 'si-s';
      s.textContent = opts.sub;
      txt.appendChild(s);
    }
    left.appendChild(txt);
    row.appendChild(left);

    if (opts.button) {
      var b = document.createElement('button');
      b.className = 'buy' + (opts.button.affordable ? ' aff' : '');
      b.textContent = opts.button.label;
      if (opts.button.disabled) b.disabled = true;
      if (opts.button.onClick && !opts.button.disabled) {
        b.addEventListener('click', opts.button.onClick);
      }
      row.appendChild(b);
    } else if (opts.tag != null) {
      var tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = opts.tag;
      row.appendChild(tag);
    }

    return row;
  }

  function hintLine(text) {
    var h = document.createElement('div');
    h.className = 'hint';
    h.textContent = text;
    return h;
  }

  // swatch color for a form — prefer plateEdge, fall back to skin, then palette.skin.
  function formSwatch(f) {
    if (f.palette) return f.palette.plateEdge || f.palette.skin || '#888';
    return f.plateEdge || f.skin || '#888';
  }

  // ---- Tab builders --------------------------------------------------------------------------

  // Upgrades: Stronger Atomic Breath (internal keys stay `claws*` — display name only).
  // Subtitle shows current attack → next attack so the player sees the universal boost.
  function buildUpgrades(body) {
    var cost   = clawsCost();
    var curPow = attackPower();
    var f      = formDef(state.activeFormId);
    var nxtPow = Cfg.START_ATTACK * Math.pow(Cfg.CLAWS_MULT, state.clawsLevel + 1) * collectionMult();
    body.appendChild(hintLine(
      'Doubles your attack — buy this and you will smash buildings in ONE hit. (Keep upgrading to one-shot the whole city.)'
    ));
    if (curPow >= CAP_HP) {
      // Bounded-economy cap reached: one-shots everything; nothing left to upgrade.
      body.appendChild(itemRow({
        swatch: '#36c9ff',
        title:  'Stronger Atomic Breath · MAX',
        sub:    U.fmt(curPow) + ' attack — one-shots EVERY building',
        tag:    'MAX'
      }));
    } else {
      var crosses = nxtPow >= CAP_HP;   // this buy crosses the one-shot threshold
      body.appendChild(itemRow({
        swatch: '#36c9ff',
        title:  'Stronger Atomic Breath · Lv ' + state.clawsLevel,
        sub:    crosses
          ? (U.fmt(curPow) + ' → ' + U.fmt(nxtPow) + ' · one-shots EVERY building!')
          : (U.fmt(curPow) + ' → ' + U.fmt(nxtPow) + ' attack (×2)'),
        button: {
          label:      '💰 ' + U.fmt(cost),
          affordable: canAfford(cost),
          disabled:   !canAfford(cost),
          onClick:    function () { buyClaws(); }
        }
      }));
    }

    // Attack-Speed track — "Rapid Fire Breath". Sub shows the attacks/sec transition.
    var asLvl  = state.atkSpeedLevel;
    var asMax  = Cfg.ATKSPD.LEVELS;
    var asRate = 1 / atkGateForLevel(asLvl);
    if (asLvl >= asMax) {
      body.appendChild(itemRow({
        swatch: '#ffd24a',
        title:  'Rapid Fire Breath · MAX',
        sub:    asRate.toFixed(1) + ' attacks/sec (max)',
        tag:    'MAX'
      }));
    } else {
      var asCost = atkSpeedCost();
      var asNext = 1 / atkGateForLevel(asLvl + 1);
      body.appendChild(itemRow({
        swatch: '#ffd24a',
        title:  'Rapid Fire Breath · Lv ' + asLvl,
        sub:    asRate.toFixed(1) + ' → ' + asNext.toFixed(1) + ' attacks/sec',
        button: {
          label:      '💰 ' + U.fmt(asCost),
          affordable: canAfford(asCost),
          disabled:   !canAfford(asCost),
          onClick:    function () { buyAtkSpeed(); }
        }
      }));
    }

    // Move-Speed track — "Titan Stride". Sub shows the speed multiplier transition.
    var msLvl = state.moveSpeedLevel;
    var msMax = Cfg.MOVESPD.LEVELS;
    var msCur = Math.pow(1 + Cfg.MOVESPD.PER_LEVEL, msLvl);
    if (msLvl >= msMax) {
      body.appendChild(itemRow({
        swatch: '#7cfc68',
        title:  'Titan Stride · MAX',
        sub:    'Move speed ×' + msCur.toFixed(2) + ' (max)',
        tag:    'MAX'
      }));
    } else {
      var msCost = moveSpeedCost();
      var msNext = Math.pow(1 + Cfg.MOVESPD.PER_LEVEL, msLvl + 1);
      body.appendChild(itemRow({
        swatch: '#7cfc68',
        title:  'Titan Stride · Lv ' + msLvl,
        sub:    'Move speed ×' + msCur.toFixed(2) + ' → ×' + msNext.toFixed(2),
        button: {
          label:      '💰 ' + U.fmt(msCost),
          affordable: canAfford(msCost),
          disabled:   !canAfford(msCost),
          onClick:    function () { buyMoveSpeed(); }
        }
      }));
    }

    // Nova Slam — one-time charged-finisher unlock.
    if (state.finisherOwned) {
      body.appendChild(itemRow({
        swatch: '#9a5cff',
        title:  'Nova Slam',
        sub:    'Hold the NOVA disc (or F) — charge, release: massive area slam',
        cls:    'owned',
        tag:    'OWNED'
      }));
    } else {
      var fCost = Cfg.FINISHER.COST;
      body.appendChild(itemRow({
        swatch: '#9a5cff',
        title:  'Nova Slam',
        sub:    'Hold the NOVA disc (or F) — charge, release: massive area slam',
        button: {
          label:      '💰 ' + U.fmt(fCost),
          affordable: canAfford(fCost),
          disabled:   !canAfford(fCost),
          onClick:    function () { buyFinisher(); }
        }
      }));
    }
  }

  // Evolutions tab: all wyrm (Godzilla) forms in tier order.
  //   - Owned tiers: OWNED tag (or ACTIVE if currently selected)
  //   - Immediate next unlocked tier: buy button
  //   - Later locked tiers: LOCKED tag
  function buildEvolutions(body) {
    body.appendChild(hintLine('Each form you OWN permanently multiplies ALL your attack — wielding it hits harder still.'));
    body.appendChild(hintLine('Collection ' + state.ownedFormIds.length + '/' + (Cfg.FORMS ? Cfg.FORMS.length : 20) + ' · ×' + collectionMult().toFixed(2) + ' power'));
    var forms = wyrmForms();
    for (var i = 0; i < forms.length; i++) {
      (function (f) {
        var owned    = ownsForm(f.id);
        var active   = state.activeFormId === f.id;
        var unlocked = isFormUnlocked(f);  // immediate purchasable next
        var pal      = f.palette || f;     // support both old EVOLUTIONS shape and new FORMS shape
        var sub      = (f.year ? f.year + ' · ' : '') + formContribLabel(f);

        var opts = {
          swatch: formSwatch(f),
          title:  f.name,
          sub:    sub,
          cls:    owned ? 'owned' : (unlocked ? '' : 'locked')
        };

        if (active) {
          opts.tag = 'ACTIVE';
        } else if (owned) {
          // Owned but not active: offer a Switch button.
          opts.button = {
            label:      'Switch',
            affordable: true,
            disabled:   false,
            onClick:    (function (fid) { return function () { switchForm(fid); }; })(f.id)
          };
        } else if (unlocked) {
          opts.button = {
            label:      '💰 ' + U.fmt(f.cost),
            affordable: canAfford(f.cost),
            disabled:   !canAfford(f.cost),
            onClick:    (function (fid) { return function () { buyForm(fid); }; })(f.id)
          };
        } else {
          opts.tag = 'LOCKED';
        }

        body.appendChild(itemRow(opts));
      })(forms[i]);
    }
  }

  // Characters tab: the 4 Titan families.
  //   For each family:
  //     - If no form owned: show the base (tier-1) form as a recruitable entry.
  //       All higher tiers in that family are hidden until the base is owned.
  //     - If the base is owned: show all forms in the family. Owned = ACTIVE or SWITCH;
  //       immediate next unlocked = buy button; later = LOCKED.
  //   Family header shows the family display name.
  function buildCharacters(body) {
    body.appendChild(hintLine('Recruit Titans and evolve them. Buy the base form to unlock a character.'));

    var FAMILY_LABEL = { mothra: 'Mothra', ghidorah: 'King Ghidorah', rodan: 'Rodan', mecha: 'Mechagodzilla' };

    for (var fi = 0; fi < TITAN_FAMILIES.length; fi++) {
      var family = TITAN_FAMILIES[fi];
      var chain  = formsByFamily(family);
      if (!chain.length) continue;

      var baseForm   = chain[0];
      var baseOwned  = ownsForm(baseForm.id);

      // Family header.
      var hdr = document.createElement('div');
      hdr.className = 'hint';
      hdr.style.marginTop = '8px';
      hdr.style.fontWeight = 'bold';
      hdr.textContent = '— ' + (FAMILY_LABEL[family] || family) + ' —';
      body.appendChild(hdr);

      if (!baseOwned) {
        // Recruit entry: only the base form is visible.
        (function (f) {
          body.appendChild(itemRow({
            swatch: formSwatch(f),
            title:  f.name,
            sub:    formContribLabel(f) + ' · Recruit to unlock',
            button: {
              label:      '💰 ' + U.fmt(f.cost),
              affordable: canAfford(f.cost),
              disabled:   !canAfford(f.cost),
              onClick:    function () { buyForm(f.id); }
            }
          }));
        })(baseForm);
      } else {
        // Full evolution chain visible.
        for (var ci = 0; ci < chain.length; ci++) {
          (function (f) {
            var owned    = ownsForm(f.id);
            var active   = state.activeFormId === f.id;
            var unlocked = isFormUnlocked(f);
            var sub      = formContribLabel(f) + (f.attack ? ' · ' + f.attack.kind : '');

            var opts = {
              swatch: formSwatch(f),
              title:  f.name,
              sub:    sub,
              cls:    owned ? 'owned' : (unlocked ? '' : 'locked')
            };

            if (active) {
              opts.tag = 'ACTIVE';
            } else if (owned) {
              opts.button = {
                label:      'Switch',
                affordable: true,
                disabled:   false,
                onClick:    (function (fid) { return function () { switchForm(fid); }; })(f.id)
              };
            } else if (unlocked) {
              opts.button = {
                label:      '💰 ' + U.fmt(f.cost),
                affordable: canAfford(f.cost),
                disabled:   !canAfford(f.cost),
                onClick:    (function (fid) { return function () { buyForm(fid); }; })(f.id)
              };
            } else {
              opts.tag = 'LOCKED';
            }

            body.appendChild(itemRow(opts));
          })(chain[ci]);
        }
      }
    }
  }

  // Worlds tab.
  function buildWorlds(body) {
    body.appendChild(hintLine('Conquer World 1, then unlock what\'s next.'));

    body.appendChild(itemRow({
      swatch: '#4fe08a',
      title:  'World 1 · Smashville',
      sub:    'The city is yours to level.',
      cls:    'owned',
      tag:    'ACTIVE'
    }));

    // World 2 is the FREE reward for the win-finale (Mike: TASTE-2A), auto-granted in
    // markFinale — never a pre-buy that could empty the shop before the climax.
    var w2 = {
      swatch: '#b07dff',
      title:  'World 2',
      sub:    state.world2Unlocked ? 'Unlocked — Coming soon!' : 'Win the city to unlock — smash the Statue at its heart.',
      cls:    state.world2Unlocked ? 'owned' : '',
      tag:    state.world2Unlocked ? 'COMING SOON' : 'LOCKED'
    };
    body.appendChild(itemRow(w2));
  }

  // ---- Shop render / open --------------------------------------------------------------------

  function syncTabButtons() {
    var tabs = $('shop-tabs');
    if (!tabs) return;
    var btns = tabs.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.getAttribute('data-tab') === currentTab) b.classList.add('active');
      else b.classList.remove('active');
    }
  }

  function refreshShop() {
    var shop = $('shop');
    var body = $('shop-body');
    if (!body) return;
    if (shop && shop.classList.contains('hidden')) return;

    syncTabButtons();
    body.innerHTML = '';
    switch (currentTab) {
      case 'evolutions': buildEvolutions(body); break;
      case 'characters': buildCharacters(body);  break;
      case 'worlds':     buildWorlds(body);      break;
      case 'upgrades':
      default:           buildUpgrades(body);    break;
    }
  }

  function wireShop() {
    if (wired) return;
    wired = true;

    var tabs = $('shop-tabs');
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('button[data-tab]') : null;
        if (!btn) return;
        currentTab = btn.getAttribute('data-tab');
        refreshShop();
      });
    }

    var closeBtn = $('shop-close');
    if (closeBtn) closeBtn.addEventListener('click', closeShop);

    var backdrop = $('shop-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeShop);

    var shopBtn = $('shop-btn');
    if (shopBtn) shopBtn.addEventListener('click', function () { openShop(); });
  }

  function openShop(tab) {
    wireShop();
    if (tab) currentTab = tab;
    audio('unlock');
    var shop = $('shop');
    if (shop) shop.classList.remove('hidden');
    refreshShop();
  }

  function closeShop() {
    var shop = $('shop');
    if (shop) shop.classList.add('hidden');
  }

  // ===========================================================================================
  // Public API
  // ===========================================================================================
  G.Economy = {
    // power
    attackPower: attackPower,
    activeUnit:  activeUnit,

    // banking + combo
    bankDestroy: bankDestroy,
    comboMult:   comboMult,
    tickCombo:   tickCombo,

    // costs + purchases (v3 primary API)
    clawsCost:     clawsCost,
    buyClaws:      buyClaws,
    atkSpeedCost:  atkSpeedCost,
    buyAtkSpeed:   buyAtkSpeed,
    moveSpeedCost: moveSpeedCost,
    buyMoveSpeed:  buyMoveSpeed,
    moveSpeedMult: function () { return moveMult; },
    buyFinisher:   buyFinisher,
    canFinale:     canFinale,
    markFinale:    markFinale,
    finaleStats:   finaleStats,
    buyForm:    buyForm,
    switchForm: switchForm,
    buyWorld2:  buyWorld2,
    canAfford:  canAfford,

    // legacy shims (v2 callers — delegate to v3 equivalents)
    nextEvo:     function () {
      var chain = wyrmForms();
      for (var i = 0; i < chain.length; i++) { if (isFormUnlocked(chain[i])) return chain[i]; }
      return null;
    },
    buyEvolution: buyEvolution,
    buyTitan:     buyTitan,
    switchChar:   switchChar,

    // shop DOM
    refreshShop: refreshShop,
    openShop:    openShop,
    closeShop:   closeShop,

    // save / load (v4 multi-slot container)
    save: save,
    load: load,
    sanitizeGame: sanitizeGame,   // shared allowlist (Phase 4 import + tests)

    // mute
    isMuted:    isMuted,
    setMuted:   setMuted,
    toggleMute: toggleMute,

    // ---- state getters (read-only views) ----
    get money()          { return state.money; },
    get clawsLevel()     { return state.clawsLevel; },
    get atkSpeedLevel()  { return state.atkSpeedLevel; },
    get moveSpeedLevel() { return state.moveSpeedLevel; },
    get finisherOwned()  { return state.finisherOwned; },
    get finaleSeen()     { return state.finaleSeen; },
    get peakCombo()      { return state.peakCombo; },
    get lastSeen()       { return state.lastSeen; },
    flushSave:           flushSave,   // exposed so the boot/host can force a flush
    get activeFormId()   { return state.activeFormId; },
    get ownedFormIds()   { return state.ownedFormIds.slice(); },
    get world2Unlocked() { return state.world2Unlocked; },
    get muted()          { return state.muted; },

    // v2-compat getters (entities/render may read these)
    get evoTier() {
      // Return the tier index of the active form within its family chain (0-based).
      var f = formDef(state.activeFormId);
      if (!f) return 0;
      var chain = formsByFamily(f.family);
      for (var i = 0; i < chain.length; i++) { if (chain[i].id === f.id) return i; }
      return 0;
    },
    get activeChar() {
      // v2 callers expect 'gz' for any Godzilla form, or the titan id.
      var f = formDef(state.activeFormId);
      if (!f) return 'gz';
      return (f.family === 'wyrm') ? 'gz' : f.id;
    },
    get ownedTitans() {
      // v2 callers: return owned non-wyrm form ids.
      return state.ownedFormIds.filter(function (id) {
        var f = formDef(id);
        return f && f.family !== 'wyrm';
      });
    },

    // ---- maxReachedRow getter + setter ----
    get maxReachedRow() { return state.maxReachedRow; },
    set maxReachedRow(v) {
      var row = U.clamp(v | 0, 0, Cfg.GRID.rows - 1);
      if (row > state.maxReachedRow) {
        state.maxReachedRow = row;
        hudDirty = true;
        markSaveDirty();   // batched with bankDestroy (was a 2nd save() on every frontier kill)
      }
    },

    // ---- HUD dirty flag ----
    get hudDirty()    { return hudDirty; },
    clearHudDirty:    function () { hudDirty = false; },
    markHudDirty:     function () { hudDirty = true; }
  };

  // Flush the batched save on a 2s cadence + whenever the page is hidden/closed, so the
  // dirty-flagged bankDestroy/frontier writes can't strand more than ~2s of progress.
  try {
    if (typeof window !== 'undefined') {
      setInterval(flushSave, 2000);
      document.addEventListener('visibilitychange', function () { if (document.hidden) flushSave(); });
      window.addEventListener('pagehide', flushSave);
    }
  } catch (e) { /* no window/timer — flushes still fire on explicit save() paths */ }

})(window.GAME);
