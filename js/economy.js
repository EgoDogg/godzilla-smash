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
    ownedFormIds:   ['gz2014'],
    activeFormId:   'gz2014',
    maxReachedRow:  0,
    world2Unlocked: false,
    muted:          false
  };

  // HUD dirty flag — UI polls and repaints when set.
  var hudDirty = true;

  // ---- Combo ---------------------------------------------------------------------------------
  var comboT       = 0;   // ms remaining in the current combo window
  var comboMultVal = 1;   // current multiplier, clamped to [1, COMBO.MAX]

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
  function attackPower() {
    var f = formDef(state.activeFormId);
    var base = f ? f.base : Cfg.START_ATTACK;
    return base * Math.pow(Cfg.CLAWS_MULT, state.clawsLevel);
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
    save();
    return payout;
  }

  // ===========================================================================================
  // Affordability + costs
  // ===========================================================================================
  function canAfford(n) { return state.money >= n; }

  function clawsCost() {
    return Math.round(Cfg.CLAWS_BASE * Math.pow(Cfg.CLAWS_GROWTH, state.clawsLevel));
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
    var cost = clawsCost();
    if (!canAfford(cost)) { sfxDeny(); return false; }
    state.money -= cost;
    state.clawsLevel += 1;
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
    if (f.family !== 'wyrm' && isBaseForm) {
      audio('recruit');
    } else {
      audio('evolve');
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
    hudDirty = true;
    save();
    refreshShop();
    if (window.GAME.Main && window.GAME.Main.syncForm) window.GAME.Main.syncForm();
  }

  // ===========================================================================================
  // Save / Load  (v3 FRESH — no migration from v2)
  // ===========================================================================================
  var SAVE_KEY = 'godzilla-save-v3';

  function save() {
    U.safeSave(SAVE_KEY, {
      v: 3,
      money:          state.money,
      clawsLevel:     state.clawsLevel,
      ownedFormIds:   state.ownedFormIds.slice(),
      activeFormId:   state.activeFormId,
      maxReachedRow:  state.maxReachedRow,
      world2Unlocked: state.world2Unlocked,
      muted:          state.muted
    });
  }

  // load() → bool. Returns false (leaving fresh defaults) when no v3 save exists.
  // Validates every field defensively; ignores v2 and earlier saves.
  function load() {
    var s = U.safeLoad(SAVE_KEY);
    if (!s || s.v !== 3) return false;

    state.money      = (typeof s.money === 'number' && isFinite(s.money)) ? Math.max(0, s.money) : 0;
    state.clawsLevel = (s.clawsLevel | 0) >= 0 ? (s.clawsLevel | 0) : 0;

    // ownedFormIds: keep only known form ids, de-duplicated, ensure gz2014 is always present.
    var owned = [];
    if (Array.isArray(s.ownedFormIds)) {
      for (var i = 0; i < s.ownedFormIds.length; i++) {
        var id = s.ownedFormIds[i];
        if (formDef(id) && owned.indexOf(id) === -1) owned.push(id);
      }
    }
    if (owned.indexOf('gz2014') === -1) owned.unshift('gz2014');
    state.ownedFormIds = owned;

    // activeFormId must be an owned form; otherwise fall back to gz2014.
    if (typeof s.activeFormId === 'string' && owned.indexOf(s.activeFormId) !== -1) {
      state.activeFormId = s.activeFormId;
    } else {
      state.activeFormId = 'gz2014';
    }

    state.maxReachedRow  = U.clamp(s.maxReachedRow | 0, 0, Cfg.GRID.rows - 1);
    state.world2Unlocked = !!s.world2Unlocked;
    state.muted          = !!s.muted;

    hudDirty = true;
    return true;
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
    var base   = f ? f.base : Cfg.START_ATTACK;
    var nxtPow = base * Math.pow(Cfg.CLAWS_MULT, state.clawsLevel + 1);
    body.appendChild(hintLine(
      'Each level DOUBLES attack power for EVERY form. Power, not cash, is the gate — dig deeper, earn more.'
    ));
    body.appendChild(itemRow({
      swatch: '#36c9ff',
      title:  'Stronger Atomic Breath · Lv ' + state.clawsLevel,
      sub:    U.fmt(curPow) + ' → ' + U.fmt(nxtPow) + ' attack (×2)',
      button: {
        label:      '💰 ' + U.fmt(cost),
        affordable: canAfford(cost),
        disabled:   !canAfford(cost),
        onClick:    function () { buyClaws(); }
      }
    }));
  }

  // Evolutions tab: all wyrm (Godzilla) forms in tier order.
  //   - Owned tiers: OWNED tag (or ACTIVE if currently selected)
  //   - Immediate next unlocked tier: buy button
  //   - Later locked tiers: LOCKED tag
  function buildEvolutions(body) {
    body.appendChild(hintLine('Evolve Godzilla through the eras. Each form multiplies base attack.'));
    var forms = wyrmForms();
    for (var i = 0; i < forms.length; i++) {
      (function (f) {
        var owned    = ownsForm(f.id);
        var active   = state.activeFormId === f.id;
        var unlocked = isFormUnlocked(f);  // immediate purchasable next
        var pal      = f.palette || f;     // support both old EVOLUTIONS shape and new FORMS shape
        var sub      = (f.year ? f.year + ' · ' : '') + 'base ' + U.fmt(f.base) + ' attack';

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
            sub:    'base ' + U.fmt(f.base) + ' attack · Recruit to unlock',
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
            var sub      = 'base ' + U.fmt(f.base) + ' attack' + (f.attack ? ' · ' + f.attack.kind : '');

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

    var w2 = {
      swatch: '#b07dff',
      title:  'World 2',
      sub:    state.world2Unlocked ? 'Unlocked — Coming soon!' : 'Unlock the next frontier.',
      cls:    state.world2Unlocked ? 'owned' : ''
    };
    if (state.world2Unlocked) {
      w2.tag = 'COMING SOON';
    } else {
      w2.button = {
        label:      '💰 ' + U.fmt(Cfg.WORLD2_COST),
        affordable: canAfford(Cfg.WORLD2_COST),
        disabled:   !canAfford(Cfg.WORLD2_COST),
        onClick:    function () { buyWorld2(); }
      };
    }
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
    clawsCost:  clawsCost,
    buyClaws:   buyClaws,
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

    // save / load
    save: save,
    load: load,

    // mute
    isMuted:    isMuted,
    setMuted:   setMuted,
    toggleMute: toggleMute,

    // ---- state getters (read-only views) ----
    get money()          { return state.money; },
    get clawsLevel()     { return state.clawsLevel; },
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
        save();
      }
    },

    // ---- HUD dirty flag ----
    get hudDirty()    { return hudDirty; },
    clearHudDirty:    function () { hudDirty = false; },
    markHudDirty:     function () { hudDirty = true; }
  };

})(window.GAME);
