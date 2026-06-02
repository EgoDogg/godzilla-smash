/* GAME.Economy — money, claws, evolutions, titans, active-unit power, combo, save v2, shop DOM.
 * Deps: GAME.Config (all balance/costs/forms/titans), GAME.Utils (fmt/safeSave/safeLoad/clamp),
 *       GAME.Audio (buy/evolve/recruit/deny SFX + mute), and the existing #shop DOM in index.html.
 *
 * Single source of truth for the economy: power formula, combo multiplier, the persisted save,
 * all purchase gating, and the shop UI (reuses #shop / #shop-tabs / #shop-body / .shop-item CSS).
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Cfg = G.Config;
  var U = G.Utils;

  // ---- Persistent state (mirrors Save v2 in the blueprint §3) -------------------------------
  // money         : current cash (HP===payout, so this scales into the trillions)
  // clawsLevel    : Stronger-Claws purchases (each DOUBLES Godzilla damage)
  // evoTier       : Godzilla evolution index into Cfg.EVOLUTIONS (0..4), gated by cost + order
  // ownedTitans   : array of titan ids the player has recruited
  // activeChar    : 'gz' (Godzilla) or a titan id — which unit is currently controlled
  // maxReachedRow : deepest row reached (frontier); World clamps movement, UI reads depth
  // world2Unlocked: capstone purchase → World 2 "Coming soon" stub
  // muted         : persisted audio-mute flag (Economy owns it; Audio.mute applies it)
  var state = {
    money: 0,
    clawsLevel: 0,
    evoTier: 0,
    ownedTitans: [],
    activeChar: 'gz',
    maxReachedRow: 0,
    world2Unlocked: false,
    muted: false
  };

  // HUD dirty flag — UI module polls this and repaints money/form readouts when set.
  var hudDirty = true;

  // ---- Combo (the ONLY damage multiplier; lives here as the single source of truth) ----------
  // comboT counts DOWN in ms from COMBO.WINDOW_MS after each banked destroy; while > 0 the
  // multiplier ramps by COMBO.STEP per destroy toward COMBO.MAX. When it hits 0 the chain resets.
  var comboT = 0;            // ms remaining in the current combo window
  var comboMultVal = 1;      // current multiplier, clamped to [1, COMBO.MAX]

  // ===========================================================================================
  // Helpers — safe Audio dispatch (the contract guarantees evolve/recruit/mute; buy/deny are
  // optional flourishes, so we guard every call and never throw if Audio or a method is absent).
  // ===========================================================================================
  function audio(method, arg) {
    var A = G.Audio;
    if (A && typeof A[method] === 'function') {
      try { A[method](arg); } catch (e) { /* never let SFX break gameplay */ }
    }
  }
  // "buy" / "deny" are not in the hard contract; fall back gracefully if unavailable.
  function sfxBuy()  { if (G.Audio && typeof G.Audio.buy  === 'function') audio('buy');  else audio('recruit'); }
  function sfxDeny() { if (G.Audio && typeof G.Audio.deny === 'function') audio('deny'); /* else: silent */ }

  function evoDef(tier) { return Cfg.EVOLUTIONS[tier]; }
  function titanDef(id) {
    var T = Cfg.TITANS;
    for (var i = 0; i < T.length; i++) { if (T[i].id === id) return T[i]; }
    return null;
  }

  // ===========================================================================================
  // Power
  // ===========================================================================================

  // Godzilla power = START_ATTACK * EVOLUTIONS[evoTier].mult * CLAWS_MULT^clawsLevel.
  function godzillaPower() {
    return Cfg.START_ATTACK * evoDef(state.evoTier).mult * Math.pow(Cfg.CLAWS_MULT, state.clawsLevel);
  }

  // attackPower() -> n : Godzilla uses the evo/claws formula; an active Titan uses its flat base.
  function attackPower() {
    if (state.activeChar === 'gz') return godzillaPower();
    var t = titanDef(state.activeChar);
    return t ? t.base : godzillaPower(); // defensive: unknown active char falls back to Godzilla
  }

  // activeUnit() -> {kind, formId|titanId, signature, base}
  // Describes the currently controlled unit for the entities/render layer.
  //  - Godzilla:  {kind:'gz',    formId, signature:'breath', base}
  //  - Titan:     {kind:titanId, titanId, signature:<sig>,   base}
  function activeUnit() {
    if (state.activeChar === 'gz') {
      var ev = evoDef(state.evoTier);
      return { kind: 'gz', formId: ev.id, signature: 'breath', base: godzillaPower() };
    }
    var t = titanDef(state.activeChar);
    if (t) return { kind: t.id, titanId: t.id, signature: t.sig, base: t.base };
    // Fallback (should not happen): treat as Godzilla so callers always get a valid unit.
    var ev0 = evoDef(state.evoTier);
    return { kind: 'gz', formId: ev0.id, signature: 'breath', base: godzillaPower() };
  }

  // ===========================================================================================
  // Combo
  // ===========================================================================================

  // comboMult() -> current multiplier in [1, COMBO.MAX].
  function comboMult() { return comboMultVal; }

  // tickCombo(dtMs) : decay the combo window; reset to ×1 when it lapses.
  function tickCombo(dtMs) {
    if (comboT > 0) {
      comboT -= dtMs;
      if (comboT <= 0) { comboT = 0; comboMultVal = 1; }
    }
  }

  // Bump the combo on a successful destroy: refresh the window and step the multiplier up.
  function bumpCombo() {
    var C = Cfg.COMBO;
    comboT = C.WINDOW_MS;
    comboMultVal = U.clamp(comboMultVal + C.STEP, 1, C.MAX);
  }

  // ===========================================================================================
  // Banking destroys
  // ===========================================================================================

  // bankDestroy(rowHp) -> payout
  // Called by World.hitBuilding when a building is fully destroyed. rowHp IS the base payout
  // (HP===payout). We multiply by the live combo, add to money, step the combo, persist, and
  // flag the HUD. Returns the actual credited payout (so callers can show floaters).
  function bankDestroy(rowHp) {
    var base = Math.max(0, Math.floor(rowHp));
    var payout = Math.floor(base * comboMultVal);
    state.money += payout;
    bumpCombo();      // reward chaining: step AFTER computing this payout
    hudDirty = true;
    save();
    return payout;
  }

  // ===========================================================================================
  // Affordability + costs
  // ===========================================================================================

  function canAfford(n) { return state.money >= n; }

  // clawsCost() : cost of the NEXT Stronger-Claws level = round(CLAWS_BASE * CLAWS_GROWTH^level).
  function clawsCost() {
    return Math.round(Cfg.CLAWS_BASE * Math.pow(Cfg.CLAWS_GROWTH, state.clawsLevel));
  }

  // nextEvo() -> evolution def for the next tier, or null if already at the final form.
  function nextEvo() {
    var n = state.evoTier + 1;
    return n < Cfg.EVOLUTIONS.length ? Cfg.EVOLUTIONS[n] : null;
  }

  // ===========================================================================================
  // Purchases — each deducts money, mutates state, plays SFX, persists, flags HUD, refreshes shop.
  // Every buy returns true on success / false on denial (insufficient funds or invalid request).
  // ===========================================================================================

  // buyClaws() : +1 Stronger-Claws level (doubles Godzilla damage).
  function buyClaws() {
    var cost = clawsCost();
    if (!canAfford(cost)) { sfxDeny(); return false; }
    state.money -= cost;
    state.clawsLevel += 1;
    sfxBuy();
    afterPurchase();
    return true;
  }

  // buyEvolution() : advance Godzilla one evolution tier. Gated by cost AND strict order
  // (you can only buy the immediate next tier).
  function buyEvolution() {
    var next = nextEvo();
    if (!next) { sfxDeny(); return false; }            // already maxed
    if (!canAfford(next.cost)) { sfxDeny(); return false; }
    state.money -= next.cost;
    state.evoTier += 1;
    audio('evolve');                                    // dedicated evolution SFX
    afterPurchase();
    return true;
  }

  // buyTitan(id) : recruit a Titan (one-time purchase). Does NOT auto-switch — the player
  // switches via switchChar(id) afterward (matches the shop's "buy then switch" flow).
  function buyTitan(id) {
    var t = titanDef(id);
    if (!t) { sfxDeny(); return false; }
    if (state.ownedTitans.indexOf(id) !== -1) { sfxDeny(); return false; } // already owned
    if (!canAfford(t.cost)) { sfxDeny(); return false; }
    state.money -= t.cost;
    state.ownedTitans.push(id);
    audio('recruit');                                   // dedicated recruit SFX
    afterPurchase();
    return true;
  }

  // switchChar(id) : set the active controlled unit. 'gz' is always available; a titan id must
  // be owned. Returns true if the active char actually changed to a valid unit.
  function switchChar(id) {
    if (id === 'gz') {
      if (state.activeChar === 'gz') return false;      // already active
      state.activeChar = 'gz';
      sfxBuy();
      afterPurchase();
      return true;
    }
    if (state.ownedTitans.indexOf(id) === -1) { sfxDeny(); return false; } // not owned
    if (state.activeChar === id) return false;          // already active
    state.activeChar = id;
    sfxBuy();
    afterPurchase();
    return true;
  }

  // buyWorld2() : capstone unlock (12B). On success the Worlds tab shows the "Coming soon" stub.
  function buyWorld2() {
    if (state.world2Unlocked) { sfxDeny(); return false; }
    if (!canAfford(Cfg.WORLD2_COST)) { sfxDeny(); return false; }
    state.money -= Cfg.WORLD2_COST;
    state.world2Unlocked = true;
    sfxBuy();
    afterPurchase();
    return true;
  }

  // Common tail for every purchase: persist, flag HUD, and repaint the open shop.
  function afterPurchase() {
    hudDirty = true;
    save();
    refreshShop();
    // Keep the on-screen unit's form/character in sync (position-preserving).
    if (window.GAME.Main && window.GAME.Main.syncForm) window.GAME.Main.syncForm();
  }

  // ===========================================================================================
  // Save / Load (v2 only — no v1 migration)
  // ===========================================================================================

  function save() {
    U.safeSave(Cfg.saveKey, {
      v: 2,
      money: state.money,
      clawsLevel: state.clawsLevel,
      evoTier: state.evoTier,
      ownedTitans: state.ownedTitans.slice(),
      activeChar: state.activeChar,
      maxReachedRow: state.maxReachedRow,
      world2Unlocked: state.world2Unlocked,
      muted: state.muted
    });
  }

  // load() -> bool. Returns false (and leaves defaults intact) when there is no save or it isn't
  // v2 — v1 saves are ignored, not migrated. Validates/sanitizes every field defensively.
  function load() {
    var s = U.safeLoad(Cfg.saveKey);
    if (!s || s.v !== 2) return false;

    state.money = (typeof s.money === 'number' && isFinite(s.money)) ? Math.max(0, s.money) : 0;
    state.clawsLevel = (s.clawsLevel | 0) >= 0 ? (s.clawsLevel | 0) : 0;

    var et = s.evoTier | 0;
    state.evoTier = U.clamp(et, 0, Cfg.EVOLUTIONS.length - 1);

    // Keep only known titan ids, de-duplicated, order preserved.
    state.ownedTitans = [];
    if (Array.isArray(s.ownedTitans)) {
      for (var i = 0; i < s.ownedTitans.length; i++) {
        var id = s.ownedTitans[i];
        if (titanDef(id) && state.ownedTitans.indexOf(id) === -1) state.ownedTitans.push(id);
      }
    }

    // activeChar must be 'gz' or an owned titan; otherwise fall back to Godzilla.
    if (s.activeChar === 'gz' || state.ownedTitans.indexOf(s.activeChar) !== -1) {
      state.activeChar = s.activeChar;
    } else {
      state.activeChar = 'gz';
    }

    state.maxReachedRow = U.clamp(s.maxReachedRow | 0, 0, Cfg.GRID.rows - 1);
    state.world2Unlocked = !!s.world2Unlocked;
    state.muted = !!s.muted;

    hudDirty = true;
    return true;
  }

  // ===========================================================================================
  // Mute (persisted in the save; Audio applies the actual gain change)
  // ===========================================================================================

  function isMuted() { return state.muted; }

  // setMuted(b) : persist + apply via Audio.mute. toggleMute() flips and returns the new state.
  function setMuted(b) {
    state.muted = !!b;
    audio('mute', state.muted);
    save();
    hudDirty = true;
    return state.muted;
  }
  function toggleMute() { return setMuted(!state.muted); }

  // ===========================================================================================
  // Shop DOM — reuses the existing #shop modal, #shop-tabs, #shop-body and .shop-item CSS.
  // Tabs: upgrades | evolutions | characters | worlds (matching index.html data-tab values).
  // ===========================================================================================

  var currentTab = 'upgrades';
  var wired = false;

  function $(id) { return document.getElementById(id); }

  // Build one .shop-item row. opts:
  //   swatch  : color for the left .sw chip (string) | null
  //   title   : main label (string)
  //   sub     : subtitle line (string) | null
  //   tag     : right-side status pill text (string) | null      (mutually exclusive w/ button)
  //   button  : { label, affordable, disabled, onClick } | null  (right-side buy button)
  //   cls     : extra class on the row ('owned' | 'locked') | ''
  function itemRow(opts) {
    var row = document.createElement('div');
    row.className = 'shop-item' + (opts.cls ? ' ' + opts.cls : '');

    var left = document.createElement('div');
    left.className = 'si-l';

    if (opts.swatch) {
      var sw = document.createElement('div');
      sw.className = 'sw';
      sw.style.background = opts.swatch;
      sw.style.color = opts.swatch; // .sw uses box-shadow:0 0 10px currentColor
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

  // ---- Tab builders --------------------------------------------------------------------------

  // Upgrades: Stronger Claws. Shows the ×2 jump in attack power as the subtitle.
  function buildUpgrades(body) {
    var cost = clawsCost();
    var cur = godzillaPower();
    var next = cur * Cfg.CLAWS_MULT;
    body.appendChild(hintLine(
      'Each level DOUBLES Godzilla’s attack. Power, not cash, is the gate — dig deeper, earn more.'
    ));
    body.appendChild(itemRow({
      swatch: '#36c9ff',
      title: 'Stronger Claws · Lv ' + state.clawsLevel,
      sub: U.fmt(cur) + ' → ' + U.fmt(next) + ' attack (×2)',
      button: {
        label: '💰 ' + U.fmt(cost),
        affordable: canAfford(cost),
        disabled: !canAfford(cost),
        onClick: function () { buyClaws(); }
      }
    }));
  }

  // Evolutions: the 5 Godzilla forms. The current/owned tier shows ACTIVE; the immediate next
  // is buyable when affordable; later tiers are LOCKED (order-gated).
  function buildEvolutions(body) {
    body.appendChild(hintLine('Evolve Godzilla through the eras. Each form multiplies base attack.'));
    var forms = Cfg.EVOLUTIONS;
    for (var i = 0; i < forms.length; i++) {
      var f = forms[i];
      var owned = i <= state.evoTier;          // current + all earlier forms are owned
      var isNext = i === state.evoTier + 1;    // the only purchasable tier
      var sub = f.year + ' · ×' + U.fmt(f.mult) + ' attack';

      var opts = {
        swatch: f.plateEdge || f.skin,
        title: f.name,
        sub: sub,
        cls: owned ? 'owned' : (isNext ? '' : 'locked')
      };

      if (owned) {
        opts.tag = (i === state.evoTier) ? 'ACTIVE' : 'OWNED';
      } else if (isNext) {
        opts.button = {
          label: '💰 ' + U.fmt(f.cost),
          affordable: canAfford(f.cost),
          disabled: !canAfford(f.cost),
          onClick: function () { buyEvolution(); }
        };
      } else {
        // Locked: needs the prior evolution first.
        opts.tag = 'LOCKED';
      }
      body.appendChild(itemRow(opts));
    }
  }

  // Characters: Godzilla + the 4 Titans. Godzilla is always present/owned. Titans: buy → switch.
  // The active unit shows ACTIVE; owned-but-inactive shows a SWITCH button; unowned shows a buy.
  function buildCharacters(body) {
    body.appendChild(hintLine('Recruit Titans, then switch between them. Each has a signature attack.'));

    // Godzilla card (always owned).
    var gzActive = state.activeChar === 'gz';
    var ev = evoDef(state.evoTier);
    var gzOpts = {
      swatch: ev.plateEdge || ev.skin,
      title: 'Godzilla · ' + ev.name,
      sub: 'Atomic breath · ' + U.fmt(godzillaPower()) + ' attack',
      cls: 'owned'
    };
    if (gzActive) {
      gzOpts.tag = 'ACTIVE';
    } else {
      gzOpts.button = {
        label: 'Switch',
        affordable: true,
        disabled: false,
        onClick: function () { switchChar('gz'); }
      };
    }
    body.appendChild(itemRow(gzOpts));

    // Titan cards.
    var T = Cfg.TITANS;
    for (var i = 0; i < T.length; i++) {
      (function (t) {
        var owned = state.ownedTitans.indexOf(t.id) !== -1;
        var active = state.activeChar === t.id;
        var opts = {
          swatch: t.tint,
          title: t.name,
          sub: t.desc + ' · ' + U.fmt(t.base) + ' attack',
          cls: owned ? 'owned' : ''
        };
        if (active) {
          opts.tag = 'ACTIVE';
        } else if (owned) {
          opts.button = {
            label: 'Switch',
            affordable: true,
            disabled: false,
            onClick: function () { switchChar(t.id); }
          };
        } else {
          opts.button = {
            label: '💰 ' + U.fmt(t.cost),
            affordable: canAfford(t.cost),
            disabled: !canAfford(t.cost),
            onClick: function () { buyTitan(t.id); }
          };
        }
        body.appendChild(itemRow(opts));
      })(T[i]);
    }
  }

  // Worlds: World 1 is always ACTIVE. World 2 (12B) is buyable; once unlocked it shows "Coming soon".
  function buildWorlds(body) {
    body.appendChild(hintLine('Conquer World 1, then unlock what’s next.'));

    body.appendChild(itemRow({
      swatch: '#4fe08a',
      title: 'World 1 · Smashville',
      sub: 'The city is yours to level.',
      cls: 'owned',
      tag: 'ACTIVE'
    }));

    var w2 = {
      swatch: '#b07dff',
      title: 'World 2',
      sub: state.world2Unlocked ? 'Unlocked — Coming soon!' : 'Unlock the next frontier.',
      cls: state.world2Unlocked ? 'owned' : ''
    };
    if (state.world2Unlocked) {
      w2.tag = 'COMING SOON';
    } else {
      w2.button = {
        label: '💰 ' + U.fmt(Cfg.WORLD2_COST),
        affordable: canAfford(Cfg.WORLD2_COST),
        disabled: !canAfford(Cfg.WORLD2_COST),
        onClick: function () { buyWorld2(); }
      };
    }
    body.appendChild(itemRow(w2));
  }

  // ---- Shop render / open --------------------------------------------------------------------

  // Reflect the active tab in #shop-tabs button styling.
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

  // refreshShop() : repaint #shop-body for the current tab (no-op if the shop is closed/missing).
  function refreshShop() {
    var shop = $('shop');
    var body = $('shop-body');
    if (!body) return;
    // Skip the DOM work entirely while hidden — openShop() repaints on show.
    if (shop && shop.classList.contains('hidden')) return;

    syncTabButtons();
    body.innerHTML = '';
    switch (currentTab) {
      case 'evolutions': buildEvolutions(body); break;
      case 'characters': buildCharacters(body); break;
      case 'worlds':     buildWorlds(body); break;
      case 'upgrades':
      default:           buildUpgrades(body); break;
    }
  }

  // Wire the static shop chrome once (tab buttons, close button, backdrop, shop button).
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

  // openShop(tab) : show the modal on the given tab (defaults to the last/active tab). Ensures
  // wiring, unlocks audio (first gesture), then renders.
  function openShop(tab) {
    wireShop();
    if (tab) currentTab = tab;
    audio('unlock'); // opening the shop is a user gesture — a safe spot to unlock Web Audio
    var shop = $('shop');
    if (shop) shop.classList.remove('hidden');
    refreshShop();
  }

  function closeShop() {
    var shop = $('shop');
    if (shop) shop.classList.add('hidden');
  }

  // ===========================================================================================
  // Public API (matches blueprint §2 exactly) + state getters/setters
  // ===========================================================================================
  G.Economy = {
    // power
    attackPower: attackPower,
    activeUnit: activeUnit,

    // banking + combo
    bankDestroy: bankDestroy,
    comboMult: comboMult,
    tickCombo: tickCombo,

    // costs + purchases
    clawsCost: clawsCost,
    buyClaws: buyClaws,
    nextEvo: nextEvo,
    buyEvolution: buyEvolution,
    buyTitan: buyTitan,
    switchChar: switchChar,
    buyWorld2: buyWorld2,
    canAfford: canAfford,

    // shop DOM
    refreshShop: refreshShop,
    openShop: openShop,
    closeShop: closeShop,

    // save / load
    save: save,
    load: load,

    // mute (persisted here; Audio applies it)
    isMuted: isMuted,
    setMuted: setMuted,
    toggleMute: toggleMute,

    // ---- state getters (read-only views for HUD/world/render) ----
    get money() { return state.money; },
    get clawsLevel() { return state.clawsLevel; },
    get evoTier() { return state.evoTier; },
    get activeChar() { return state.activeChar; },
    get ownedTitans() { return state.ownedTitans.slice(); }, // defensive copy
    get world2Unlocked() { return state.world2Unlocked; },
    get muted() { return state.muted; },

    // ---- maxReachedRow: getter + setter (World advances it; persists only on increase) ----
    get maxReachedRow() { return state.maxReachedRow; },
    set maxReachedRow(v) {
      var row = U.clamp(v | 0, 0, Cfg.GRID.rows - 1);
      if (row > state.maxReachedRow) {
        state.maxReachedRow = row;
        hudDirty = true;
        save();
      }
    },

    // ---- HUD dirty flag (UI polls + clears) ----
    get hudDirty() { return hudDirty; },
    clearHudDirty: function () { hudDirty = false; },
    markHudDirty: function () { hudDirty = true; }
  };

})(window.GAME);
