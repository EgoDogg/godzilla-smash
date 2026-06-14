/* GAME.Main — boot + the rAF loop (fixed-step sim + render). Loaded LAST. Deps: all modules. */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';
  const Main = {};
  const STEP = 1 / 60;            // fixed simulation step (SECONDS) — locomotion/camera/FX
  const STEP_MS = STEP * 1000;    // milliseconds — World lifecycle + Economy combo use ms
  const MAX_SUBSTEPS = 5;

  let canvas, ctx, W = 0, H = 0, dpr = 1;
  let player = null, last = 0, acc = 0, running = true, booted = false;
  let freezeUntil = 0;            // hit-stop: real-time (rAF ts) until which the sim is frozen

  function resize() {
    const nd = Math.min(window.devicePixelRatio || 1, 2);
    const dprChanged = nd !== dpr;
    dpr = nd; G.dpr = dpr;
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);     // Main owns the DPR transform; render inherits it
    if (G.camera && G.camera.resize) G.camera.resize(W, H);
    if (dprChanged && booted && G.Assets && G.Assets.invalidate) G.Assets.invalidate('');
  }

  function setPlayerFromSave() {
    const au = G.Economy.activeUnit();
    player = G.Kaiju.create(au);                 // {kind:'gz'|titanId, formId|titanId, ...}
    G._activeUnit = player;                       // Input reads the player's world pos from here
    if (G.Render.setPlayer) G.Render.setPlayer(player);
    if (G.camera) G.camera._init = false;         // re-snap camera onto the (possibly new) unit
    return player;
  }
  Main.rebuildPlayer = setPlayerFromSave;         // full reset (also re-spawns at the apron)
  Main.getPlayer = function () { return player; };
  // Position-preserving form/character sync — used after a shop purchase so evolving or
  // switching characters updates the on-screen unit WITHOUT teleporting it back to spawn.
  Main.syncForm = function () {
    var au = G.Economy.activeUnit();
    var prev = player;
    player = G.Kaiju.create(au);
    if (prev && prev.pos) {
      player.pos.wx = prev.pos.wx; player.pos.wy = prev.pos.wy; player.pos.z = prev.pos.z || 0;
      player.facing = prev.facing || 0;
    }
    G._activeUnit = player;
    if (G.Render.setPlayer) G.Render.setPlayer(player);
  };

  Main.boot = function () {
    if (booted) return;
    canvas = document.getElementById('scene');
    ctx = canvas.getContext('2d');
    G.canvas = canvas; G.ctx = ctx;

    if (G.Economy && G.Economy.load) G.Economy.load();        // v2 save (ignores v1)
    // Forms-as-axis guard: FORM_BONUS must sum to 63 (→ ×64 at full 20/20). A future World-2 form
    // added without re-balancing would silently break the clean rebate — make any drift LOUD.
    if (G.Config && G.Config.FORM_BONUS) {
      var _fbSum = 0; for (var _k in G.Config.FORM_BONUS) _fbSum += G.Config.FORM_BONUS[_k];
      console.assert(Math.abs(_fbSum - 63) < 1e-9, 'FORM_BONUS sum drift: expected 63, got ' + _fbSum);
    }
    if (G.iso && G.iso.attachCanvas) G.iso.attachCanvas(canvas);
    resize();
    window.addEventListener('resize', resize);

    G.World.spawnCity();
    setPlayerFromSave();
    G.Input.init(canvas, G.camera);
    G.UI.init();

    const unlock = function () { if (G.Audio && G.Audio.unlock) G.Audio.unlock(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });

    const pause = function () { running = false; };
    const run = function () {
      running = true; last = performance.now();
      if (G.Audio && G.Audio.unlock) G.Audio.unlock();   // re-arm/resume audio on focus/visibility
    };
    window.addEventListener('blur', pause);
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', function () { document.hidden ? pause() : run(); });

    // Cache-version drift check: sw.js CACHE is the authority; Config.CACHE_VERSION is the
    // in-page probe. Warn if they diverge (a live gz-v* cache that isn't CACHE_VERSION) —
    // catches bumping only one of the two. No false positive on a fresh first load (no
    // gz-v* cache yet). See the cross-comments in sw.js + config.js.
    try {
      if (window.caches && G.Config && G.Config.CACHE_VERSION) {
        caches.keys().then(function (keys) {
          var gz = keys.filter(function (k) { return /^gz-v/.test(k); });
          if (gz.length && gz.indexOf(G.Config.CACHE_VERSION) === -1) {
            console.warn('[gz] cache-version drift: Config.CACHE_VERSION=' + G.Config.CACHE_VERSION +
                         ' but live SW cache(s)=' + gz.join(',') + ' — bump BOTH sw.js CACHE and config.js CACHE_VERSION.');
          }
        }).catch(function () {});
      }
    } catch (e) { /* caches API unavailable — ignore */ }

    booted = true;
    last = performance.now();
    requestAnimationFrame(loop);
  };

  function loop(ts) {
    requestAnimationFrame(loop);
    if (G.Audio && G.Audio.tick) G.Audio.tick();   // keep iOS ctx alive (cheap; resumes if not running)
    let dt = (ts - last) / 1000; last = ts;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1;                        // clamp big gaps (tab switch)
    if (!running) return;                          // hard pause (blur/hidden): freeze frame

    const paused = !!(G.UI && G.UI.isPaused);       // shop open / Esc — sim frozen, scene still drawn

    // Hit-stop: a brief real-time freeze on a satisfying kill. We skip the sim
    // (kaiju, debris, particles, shake all hold for a beat) but keep RENDERING
    // so the frozen frame is visible. Consume every frame to clear the flag.
    const hs = (G.FX && G.FX.consumeHitStop) ? G.FX.consumeHitStop() : 0;
    if (hs > 0) freezeUntil = ts + hs;
    const frozen = ts < freezeUntil;

    if (!paused && !frozen) {
      acc += dt;
      const intent = G.Input.consume();             // attack/target edge-true for this frame only
      let steps = 0;
      while (acc >= STEP && steps < MAX_SUBSTEPS) {
        player.update(STEP, intent);
        G.World.updateBuildings(STEP_MS);
        if (G.World.updateFlyers) G.World.updateFlyers(STEP_MS);  // airplanes drift + wrap
        if (G.Economy.tickCombo) G.Economy.tickCombo(STEP_MS);
        if (G.FX && G.FX.update) G.FX.update(STEP);
        if (G.camera && G.camera.follow) G.camera.follow(player, STEP);
        intent.attack = false;                      // consume the attack edge once
        acc -= STEP; steps++;
      }
      if (steps === MAX_SUBSTEPS) acc = 0;           // spiral-of-death guard
    } else if (G.Input.consume) {
      G.Input.consume();                              // drain input edges while paused/frozen
      acc = 0;                                        // prevent an accumulator catch-up burst on resume
    }

    G.UI.refresh();
    G.Render.frame(dt);
  }

  G.Main = Main;
})(window.GAME);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { window.GAME.Main.boot(); });
} else {
  window.GAME.Main.boot();
}
