/* GAME.UI — DOM HUD + shop glue (not canvas).
 *
 * Owns the top HUD chrome (#money, #form-badge with active unit + depth) and the
 * open/close/sync lifecycle of the #shop modal. It does NOT build shop CONTENT —
 * GAME.Economy.refreshShop() owns the body markup and its buy buttons. UI only:
 *   - opens/closes #shop (wiring #shop-btn / #shop-close / #shop-backdrop / #shop-tabs)
 *   - keeps the top HUD in sync via a dirty-flag refresh() (only touches DOM on change)
 *   - drives the Pause toggle (keyboard + auto-pause while the shop is open) and
 *     the Mute toggle (#mute-btn -> GAME.Audio.mute + GAME.Economy.save + icon swap)
 *
 * Pause is exposed as state (GAME.UI.isPaused) for GAME.Main to gate the sim; there
 * is no #pause-btn in the existing DOM and UI must not modify index.html, so the
 * toggle is bound to Esc / P / Enter and to the shop's own visibility.
 *
 * Calls: GAME.Economy (openShop, refreshShop, money, activeUnit, attackPower, save),
 *        GAME.World (maxReachedRow), GAME.Audio (mute, unlock),
 *        GAME.Utils (fmt), GAME.Config (GRID, EVOLUTIONS, TITANS).
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  var Utils = G.Utils;
  var Config = G.Config;

  // --- Cached DOM nodes (resolved once in init) ---
  var el = {
    money: null,
    badge: null,
    muteBtn: null,
    shopBtn: null,
    shopClose: null,
    shopBackdrop: null,
    shop: null,
    tabs: null,      // NodeList of #shop-tabs button
    thp: null,       // #target-hp container
    thpName: null, thpNum: null, thpFill: null, thpGhost: null,
    wincard: null, wincardStats: null, wincardContinue: null,  // win-finale card
  };

  // --- Dirty-flag cache: last DOM-written strings, so refresh() only writes on change. ---
  var last = {
    money: null,    // formatted money string actually painted
    badge: null,    // full innerHTML of #form-badge actually painted
    muteIcon: null, // mute glyph actually painted
    // target HP bar:
    thpShow: false, thpId: null, thpFill: null, thpGhost: null, thpName: null, thpNum: null, thpLow: null,
  };

  // --- Local UI state ---
  var state = {
    inited: false,
    paused: false,
    shopOpen: false,
    winCardOpen: false,    // win-finale card owns the keyboard while open (mirrors shopOpen)
    activeTab: 'upgrades', // mirrors which #shop-tabs button is .active
  };

  /* ---------------------------------------------------------------- helpers */

  function muted() {
    // Economy OWNS the persisted mute flag (single source of truth); Audio applies it.
    var Eco = G.Economy;
    if (Eco && typeof Eco.muted === 'boolean') return Eco.muted;
    if (Eco && typeof Eco.isMuted === 'function') return !!Eco.isMuted();
    var A = G.Audio;
    if (A && typeof A.muted === 'boolean') return A.muted;
    return false;
  }

  // Resolve the active unit's display name + form badge bits from Economy, with
  // a robust fallback to Config-by-id (contract: activeUnit() may omit `name`).
  function activeBadgeHTML() {
    var Eco = G.Economy;
    var unit = (Eco && typeof Eco.activeUnit === 'function') ? Eco.activeUnit() : null;

    var name = '';
    var sub = '';     // year (Godzilla forms) or short tag (titans)
    var icon = '🦖';

    if (unit) {
      if (unit.kind === 'gz') {
        // Godzilla form: match v1 badge — 🦖 Name <b>year</b>
        var form = unit.name ? unit : findById(Config.EVOLUTIONS, unit.formId);
        name = (unit.name || (form && form.name) || 'Godzilla');
        sub = (unit.year || (form && form.year) || '');
        icon = '🦖';
      } else {
        // Playable Titan: 🐲 Name
        var tid = unit.titanId || unit.kind;
        var titan = unit.name ? unit : findById(Config.TITANS, tid);
        name = (unit.name || (titan && titan.name) || 'Titan');
        sub = ''; // titans have no "year" field
        icon = '🐲';
      }
    } else {
      // Pre-Economy boot: keep the static default the HTML shipped with.
      name = 'Godzilla';
      sub = '2014';
      icon = '🦖';
    }

    // Power readout (⚔) and depth (Row X/19), matching the v1 badge style.
    var pwr = '';
    if (Eco && typeof Eco.attackPower === 'function') {
      pwr = ' · ⚔ ' + Utils.fmt(Eco.attackPower());
    }
    var depth = depthText();

    var subHtml = sub ? (' <b>' + esc(sub) + '</b>') : '';
    return icon + ' ' + esc(name) + subHtml + pwr + ' · ' + depth;
  }

  // True progression meter: "⚡ Power N/19" = how many of the ROW_HP building-tiers the
  // player's current attackPower can ONE-SHOT. N reaching 19 ⟺ attackPower ≥ CAP_HP ⟺ the
  // win-finale is unlocked (economy.js canFinale). Replaces the old "📍 Tier X/19" badge,
  // which read off the GEOGRAPHIC frontier (maxReachedRow) and could show 19/19 while the
  // player was still at base power — a completion meter that wasn't measuring completion.
  function depthText() {
    var Eco = G.Economy, ROW = (Config && Config.ROW_HP) ? Config.ROW_HP : [];
    var bands = ROW.length || 19;
    if (!Eco || typeof Eco.attackPower !== 'function' || !ROW.length) return '⚡ Power 0/' + bands;
    var pow = Eco.attackPower(), n = 0;
    for (var i = 0; i < ROW.length; i++) { if (pow >= ROW[i]) n++; }
    if (n > bands) n = bands;
    return '⚡ Power ' + n + '/' + bands;
  }

  function findById(arr, id) {
    if (!arr || id == null) return null;
    for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].id === id) return arr[i]; }
    return null;
  }

  // Minimal HTML-escape for any text we inject into innerHTML (names are static
  // config, but escaping keeps the badge robust if Economy ever passes user-ish text).
  function esc(s) {
    return ('' + s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* ---------------------------------------------------------------- HUD sync */

  // Dirty-flag HUD refresh: compute each field, write only when it changed.
  function refresh() {
    if (!state.inited) return;

    // Money
    var Eco = G.Economy;
    var moneyVal = (Eco && typeof Eco.money === 'number') ? Eco.money
                 : (Eco && typeof Eco.money === 'function') ? Eco.money()
                 : 0;
    var moneyStr = '💰 ' + Utils.fmt(moneyVal);
    if (moneyStr !== last.money && el.money) {
      el.money.textContent = moneyStr;
      last.money = moneyStr;
    }

    // Active unit + form/year + power + depth badge
    var badgeStr = activeBadgeHTML();
    if (badgeStr !== last.badge && el.badge) {
      el.badge.innerHTML = badgeStr;
      last.badge = badgeStr;
    }

    // Mute icon (stays in sync even if Audio is toggled elsewhere)
    syncMuteIcon();

    // Target HP bar (boss/target-frame; shown only while smashing the current target)
    syncTargetHp();
  }

  // Human label for the targeted building (specials get names; generics are "Building").
  function buildingLabel(b) {
    if (b.special) {
      var m = { statue: 'Statue', pyramid: 'Pyramid', sandpile: 'Sand Pile', football: 'Football Field',
                golden: 'Golden House', rainbow: 'Rainbow House', diamond: 'Diamond House', airplane: 'Airplane' };
      return m[b.special] || 'Landmark';
    }
    return 'Building';
  }

  // Fixed top-center HP bar bound to player.aimBuilding. Appears once the target is
  // damaged (first hit), drains with a fast front fill + a lagging white "chip" ghost
  // (both via CSS transitions), shifts hot under 25%, and snaps on (re)appear / switch.
  function syncTargetHp() {
    if (!el.thp) return;
    var p = (G.Main && G.Main.getPlayer) ? G.Main.getPlayer() : null;
    var b = p && p.aimBuilding;
    var show = !!(b && b.state === 'standing' && b.maxHp > 0 && b.hp > 0 && b.hp < b.maxHp);

    if (!show) {
      if (last.thpShow) { el.thp.classList.remove('show'); last.thpShow = false; last.thpId = null; }
      return;
    }

    var frac = b.hp / b.maxHp; if (frac < 0) frac = 0; else if (frac > 1) frac = 1;
    var pct = (frac * 100).toFixed(1) + '%';

    // First appearance OR target switch → snap both layers (don't animate in from a stale width).
    if (!last.thpShow || b.id !== last.thpId) {
      el.thp.classList.add('snap');
      el.thpFill.style.width = pct;
      el.thpGhost.style.width = pct;
      void el.thp.offsetWidth;            // commit the snapped width before re-enabling transitions
      el.thp.classList.remove('snap');
      last.thpFill = last.thpGhost = pct;
      last.thpId = b.id;
    } else {
      if (pct !== last.thpFill) { el.thpFill.style.width = pct; last.thpFill = pct; }
      if (pct !== last.thpGhost) { el.thpGhost.style.width = pct; last.thpGhost = pct; }
    }

    var name = buildingLabel(b);
    if (name !== last.thpName) { el.thpName.textContent = name; last.thpName = name; }
    var num = Utils.fmt(b.hp) + ' / ' + Utils.fmt(b.maxHp);
    if (num !== last.thpNum) { el.thpNum.textContent = num; last.thpNum = num; }

    var low = frac < 0.25;
    if (low !== last.thpLow) { el.thp.classList.toggle('low', low); last.thpLow = low; }

    if (!last.thpShow) { el.thp.classList.add('show'); last.thpShow = true; }
  }

  function syncMuteIcon() {
    var icon = muted() ? '🔇' : '🔊';
    if (icon !== last.muteIcon && el.muteBtn) {
      el.muteBtn.textContent = icon;
      last.muteIcon = icon;
    }
  }

  /* ---------------------------------------------------------------- shop glue */

  // Open the shop on the given tab (default: last active, else 'upgrades').
  // CONTENT is Economy's job — we set the active tab chrome, reveal #shop, pause,
  // then hand off to Economy.openShop(tab) which fills #shop-body via refreshShop().
  function openShop(tab) {
    if (!state.inited) return;
    var t = tab || state.activeTab || 'upgrades';
    setActiveTab(t, /*skipEconomy*/ true); // chrome only; Economy.openShop redraws body
    if (el.shop) el.shop.classList.remove('hidden');
    state.shopOpen = true;
    setPaused(true); // shopping pauses the action

    var Eco = G.Economy;
    if (Eco && typeof Eco.openShop === 'function') {
      Eco.openShop(t);              // Economy paints the body for this tab
    } else if (Eco && typeof Eco.refreshShop === 'function') {
      Eco.refreshShop();            // fallback: at least populate the body
    }
    refresh();
  }

  function closeShop() {
    if (el.shop) el.shop.classList.add('hidden');
    state.shopOpen = false;
    setPaused(false);
    refresh();
  }

  function toggleShop() {
    if (state.shopOpen) closeShop(); else openShop();
  }

  /* ---------------------------------------------------------------- win-finale card */

  // Show the one-time completion card with run stats (driven by world.triggerFinale). Pauses
  // the sim while open; "Continue — Free Roam" dismisses it and the player keeps smashing.
  function showWinCard(stats) {
    if (!el.wincard) return;
    if (el.wincardStats) {
      el.wincardStats.innerHTML = '';
      var rows = [];
      if (stats) {
        rows.push(['Forms collected', stats.formsOwned + ' / ' + stats.formsTotal]);
        rows.push(['Peak attack power', Utils.fmt(stats.attackPower)]);
        rows.push(['Peak combo', '×' + (Math.round((stats.peakCombo || 1) * 10) / 10).toFixed(1)]);
        rows.push(['Cash banked', '💰 ' + Utils.fmt(stats.money)]);
      }
      for (var i = 0; i < rows.length; i++) {
        var d = document.createElement('div');
        d.className = 'ws';
        var k = document.createElement('span'); k.textContent = rows[i][0];
        var v = document.createElement('b');    v.textContent = rows[i][1];
        d.appendChild(k); d.appendChild(v);
        el.wincardStats.appendChild(d);
      }
    }
    el.wincard.classList.remove('hidden');
    state.winCardOpen = true;
    setPaused(true);
  }

  function closeWinCard() {
    if (el.wincard) el.wincard.classList.add('hidden');
    state.winCardOpen = false;
    setPaused(false);
  }

  // Update the #shop-tabs button .active chrome and remember the tab.
  // When not skipping Economy, ask it to repaint the body for the new tab.
  function setActiveTab(tab, skipEconomy) {
    state.activeTab = tab;
    if (el.tabs) {
      for (var i = 0; i < el.tabs.length; i++) {
        var b = el.tabs[i];
        var on = b.getAttribute('data-tab') === tab;
        b.classList.toggle('active', on);
      }
    }
    if (!skipEconomy) {
      var Eco = G.Economy;
      // Prefer a dedicated tab API if Economy exposes one; otherwise reopen the
      // shop on this tab so Economy repaints the body. (Economy owns body content.)
      if (Eco && typeof Eco.setShopTab === 'function') Eco.setShopTab(tab);
      else if (Eco && typeof Eco.openShop === 'function') Eco.openShop(tab);
      else if (Eco && typeof Eco.refreshShop === 'function') Eco.refreshShop();
    }
  }

  /* ---------------------------------------------------------------- pause */

  // Pause is state UI owns and Main reads (GAME.UI.isPaused) to gate the sim.
  function setPaused(p) {
    p = !!p;
    if (p === state.paused) return;
    state.paused = p;
    if (typeof G.UI !== 'undefined') G.UI.isPaused = p; // mirror onto the public object
  }

  function togglePause() {
    // Don't let a stray pause key fight the shop's own pause ownership.
    if (state.shopOpen) { closeShop(); return; }
    setPaused(!state.paused);
  }

  /* ---------------------------------------------------------------- mute */

  // Mute toggle: flip Audio, unlock on unmute (first gesture), persist via Economy,
  // then swap the button glyph. (Save key v2 carries `muted`.)
  function toggleMute() {
    var A = G.Audio, Eco = G.Economy;
    var next = !muted();
    // Economy OWNS the persisted mute flag and applies it via Audio.mute (a single,
    // non-looping path). Fall back to Audio.mute directly only if Economy is absent.
    if (Eco && typeof Eco.setMuted === 'function') Eco.setMuted(next);
    else if (A && typeof A.mute === 'function') A.mute(next);
    if (!next && A && typeof A.unlock === 'function') A.unlock(); // resume audio on unmute (this gesture)
    syncMuteIcon();
    refresh();
  }

  /* ---------------------------------------------------------------- keyboard */

  function onKeyDown(e) {
    // Ignore key-repeat and modifier combos; let typing in inputs pass through.
    if (e.repeat) return;
    var k = e.key;
    // While the win-finale card is open it OWNS the keyboard: Escape/Enter dismiss it,
    // everything else is swallowed so Esc/P/B/M can't un-pause or open the shop UNDER the
    // still-visible modal (UH1 — pause/modal desync; mirrors the shop's pause ownership).
    if (state.winCardOpen) {
      if (k === 'Escape' || k === 'Enter') { closeWinCard(); e.preventDefault(); }
      return;
    }
    if (k === 'Escape') {
      // Esc closes the shop if open, else toggles pause.
      if (state.shopOpen) { closeShop(); e.preventDefault(); }
      else { setPaused(!state.paused); e.preventDefault(); }
      return;
    }
    if (k === 'p' || k === 'P') {
      togglePause();
      e.preventDefault();
      return;
    }
    if (k === 'm' || k === 'M') {
      toggleMute();
      e.preventDefault();
      return;
    }
    if ((k === 'b' || k === 'B') && !state.shopOpen) {
      // Quick-open shop (mnemonic: Buy). Doesn't steal movement keys (WASD).
      openShop();
      e.preventDefault();
    }
  }

  /* ---------------------------------------------------------------- init */

  function init() {
    if (state.inited) return;

    el.money = document.getElementById('money');
    el.badge = document.getElementById('form-badge');
    el.muteBtn = document.getElementById('mute-btn');
    el.shopBtn = document.getElementById('shop-btn');
    el.shopClose = document.getElementById('shop-close');
    el.shopBackdrop = document.getElementById('shop-backdrop');
    el.shop = document.getElementById('shop');
    el.tabs = document.querySelectorAll('#shop-tabs button');
    el.thp = document.getElementById('target-hp');
    el.thpName = document.getElementById('thp-name');
    el.thpNum = document.getElementById('thp-num');
    el.thpFill = document.getElementById('thp-fill');
    el.thpGhost = document.getElementById('thp-ghost');
    el.wincard = document.getElementById('wincard');
    el.wincardStats = document.getElementById('wincard-stats');
    el.wincardContinue = document.getElementById('wincard-continue');

    // Seed the active tab from whichever button ships marked .active in the HTML.
    if (el.tabs && el.tabs.length) {
      for (var i = 0; i < el.tabs.length; i++) {
        if (el.tabs[i].classList.contains('active')) {
          state.activeTab = el.tabs[i].getAttribute('data-tab') || state.activeTab;
          break;
        }
      }
    }

    // --- Wire existing HUD / shop controls (no new DOM created) ---
    if (el.shopBtn) el.shopBtn.onclick = function () { openShop(); };
    if (el.shopClose) el.shopClose.onclick = function () { closeShop(); };
    if (el.shopBackdrop) el.shopBackdrop.onclick = function () { closeShop(); };
    if (el.muteBtn) el.muteBtn.onclick = function () { toggleMute(); };
    if (el.wincardContinue) el.wincardContinue.onclick = function () { closeWinCard(); };

    if (el.tabs) {
      for (var j = 0; j < el.tabs.length; j++) {
        (function (btn) {
          btn.onclick = function () { setActiveTab(btn.getAttribute('data-tab')); };
        })(el.tabs[j]);
      }
    }

    // Keyboard: pause / mute / shop. Listener on window so it works regardless of focus.
    window.addEventListener('keydown', onKeyDown);

    state.inited = true;
    G.UI.isPaused = state.paused;

    // Ensure shop starts closed and HUD reflects the loaded save.
    if (el.shop) el.shop.classList.add('hidden');
    state.shopOpen = false;

    // First paint: force a full sync by clearing the dirty cache.
    last.money = null; last.badge = null; last.muteIcon = null;
    syncMuteIcon();
    refresh();
  }

  /* ---------------------------------------------------------------- export */

  G.UI = {
    init: init,
    refresh: refresh,
    openShop: openShop,
    closeShop: closeShop,      // convenience for Main / Economy after a purchase flow
    showWinCard: showWinCard,  // one-time win-finale card (driven by world.triggerFinale)
    togglePause: togglePause,
    setPaused: setPaused,
    toggleMute: toggleMute,
    isPaused: false,           // read by GAME.Main to gate the sim; kept in sync above
    get paused() { return state.paused; },
    get shopOpen() { return state.shopOpen; },
  };
})(window.GAME);
