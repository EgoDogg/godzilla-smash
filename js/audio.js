/* GAME.Audio — procedural Web Audio SFX, zero asset files.
 *
 * Everything is synthesized live from oscillators + filtered noise bursts.
 * The AudioContext is LAZY: it does not exist until unlock() is called from a
 * real user gesture (browsers block audio otherwise). Every play method is a
 * no-op while the context is missing/suspended or while muted.
 *
 * Mute source of truth: GAME.Economy.muted if that module is present (single
 * source), otherwise a local flag toggled via mute(b).
 *
 * Deps: GAME.Config (optional read). No per-call buffer allocations in the hot
 * path — the noise buffer is built once and reused. No reliance on any other
 * module being loaded; degrades to silence rather than throwing.
 */
window.GAME = window.GAME || {};
(function (G) {
  'use strict';

  // ---- Module state -------------------------------------------------------
  var ctx = null;          // AudioContext, created lazily in unlock()
  var master = null;       // master GainNode (everything routes through here)
  var noiseBuf = null;     // shared mono white-noise AudioBuffer (built once)
  var keepAlive = null;    // silent looping source that keeps iOS from suspending the ctx
  var localMuted = false;  // fallback mute flag when GAME.Economy is absent

  var MASTER_GAIN = 0.5;   // global headroom so stacked SFX never clip hard

  // ---- Mute resolution ----------------------------------------------------
  // Economy owns persisted `muted`; honor it when present, else use localMuted.
  function isMuted() {
    var eco = G.Economy;
    if (eco && typeof eco.muted === 'boolean') return eco.muted;
    return localMuted;
  }

  // True only when we can actually make sound: ctx exists, is running, unmuted.
  function live() {
    return !!ctx && ctx.state === 'running' && !isMuted();
  }

  // `now` helper (audio clock). Safe even pre-unlock (returns 0).
  function now() { return ctx ? ctx.currentTime : 0; }

  // ---- One-time noise buffer ---------------------------------------------
  // ~1s of white noise, looped/offset per use. Built once on first unlock so
  // crumble/powder/etc. never allocate a buffer per hit.
  function buildNoise() {
    if (noiseBuf || !ctx) return;
    var len = Math.floor(ctx.sampleRate * 1.0);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // ---- iOS keepalive ------------------------------------------------------
  // A truly-silent (gain 0) looping 1-sample buffer source keeps the context's
  // render graph active so iOS Safari is far less likely to idle-suspend it.
  // That kills the "first SFX after a few idle seconds lags on async resume()"
  // problem. Connected straight to destination (not master) so mute can't stop
  // it. Started once on unlock; iOS still suspends on backgrounding, which the
  // per-frame Audio.tick()/resume-on-visibility path recovers.
  function startKeepAlive() {
    if (keepAlive || !ctx) return;
    try {
      var src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.loop = true;
      var g = ctx.createGain();
      g.gain.value = 0.0;
      src.connect(g).connect(ctx.destination);
      src.start(0);
      keepAlive = src;
    } catch (e) { /* keepalive is best-effort */ }
  }

  // ---- Tiny node factories ------------------------------------------------
  // Short oscillator "ping" with its own gain envelope.
  // type: waveform; f0/f1: start/end freq (ramps if f1 given); dur: seconds;
  // peak: gain peak; t0: start time; detune optional.
  function osc(type, f0, f1, dur, peak, t0, detune) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 != null && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    if (detune) o.detune.setValueAtTime(detune, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + dur * 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    return { o: o, g: g };
  }

  // Filtered noise burst (boom/crack/powder). type: 'lowpass'|'highpass'|'bandpass';
  // freq: filter cutoff; q: resonance; dur: seconds; peak: gain; t0: start time.
  function noise(type, freq, q, dur, peak, t0) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    // Random offset into the shared buffer so repeated bursts don't phase-lock.
    var off = Math.random() * 0.9;
    var flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(freq, t0);
    if (q != null) flt.Q.setValueAtTime(q, t0);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + dur * 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt).connect(g).connect(master);
    src.start(t0, off, dur + 0.05);
    src.stop(t0 + dur + 0.05);
    return { src: src, flt: flt, g: g };
  }

  // ---- Public API ---------------------------------------------------------
  var Audio = {
    // Expose so other modules / tests can introspect (read-only intent).
    get ctx() { return ctx; },

    // Resume or create the AudioContext on the first user gesture. Idempotent:
    // safe to call on every pointerdown — resumes if the browser suspended it.
    unlock: function () {
      try {
        if (!ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;                 // no Web Audio support → stay silent
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = MASTER_GAIN;
          master.connect(ctx.destination);
          buildNoise();
          startKeepAlive();
        }
        if (ctx.state !== 'running' && ctx.resume) ctx.resume();
      } catch (e) { /* never let audio break the game */ }
    },

    // Per-frame cheap nudge from the game loop. iOS can move the context to
    // 'suspended' OR the non-standard 'interrupted' state (call, route change,
    // backgrounding) — both are non-'running', so resume whenever it isn't
    // running. Resume is async: the frame that fires it still reads !live(), so
    // a single SFX may drop on the recovery frame; that's expected iOS behavior.
    tick: function () {
      if (ctx && ctx.state !== 'running' && ctx.resume) {
        try { ctx.resume(); } catch (e) { /* ignore */ }
      }
    },

    // Per-hit thud — short pitched body + a click transient. Plays on every
    // building hit, so it's deliberately cheap and punchy.
    smash: function () {
      if (!live()) return;
      var t = now();
      // ±6% pitch + ±8% level variance so rapid-fire smashes don't sound robotic.
      var v = 1 + (Math.random() * 2 - 1) * 0.06;
      var gv = 1 + (Math.random() * 2 - 1) * 0.08;
      // Low body thump that drops in pitch.
      osc('sine', 150 * v, 60 * v, 0.13, 0.55 * gv, t);
      // Mid "knock" for impact definition.
      osc('triangle', 320 * v, 150 * v, 0.07, 0.22 * gv, t);
      // Tight low-noise crack transient.
      noise('lowpass', 1200 * v, 1, 0.06, 0.30 * gv, t);
    },

    // Building destroyed. Bigger / lower / longer boom as the tier climbs.
    // tier 0..18 (row index) → scales depth, body weight, and rumble length.
    crumble: function (tier) {
      if (!live()) return;
      var t = now();
      tier = (typeof tier === 'number' && tier >= 0) ? tier : 0;
      var k = Math.min(1, tier / 18);          // 0..1 normalized tier
      var dur = 0.35 + k * 0.55;               // 0.35s → 0.90s
      var baseF = 130 - k * 70;                // 130Hz → 60Hz fundamental
      var rumbleF = 320 - k * 200;             // lowpass sweep target

      // Sub thump — the weight of the collapse.
      osc('sine', baseF * 1.4, baseF * 0.5, dur, 0.6, t);
      // Layered low-noise rumble (the debris boom).
      noise('lowpass', rumbleF + 500, 0.8, dur, 0.5 + k * 0.25, t);
      // Mid-frequency crackle of breaking structure, fading quickly.
      noise('bandpass', 900 - k * 300, 1.2, dur * 0.55, 0.22, t + 0.02);
      // Bigger tiers get a second delayed aftershock thud.
      if (k > 0.45) osc('sine', baseF * 1.1, baseF * 0.45, dur * 0.7, 0.4, t + 0.12);
    },

    // Evolution — rising roar sweep + bright shimmer + white-flash whoosh.
    evolve: function () {
      if (!live()) return;
      var t = now();
      var dur = 0.95;
      // Two detuned saws sweeping UP = the "powering up" roar.
      osc('sawtooth', 90, 520, dur, 0.34, t, -8);
      osc('sawtooth', 92, 540, dur, 0.34, t, +8);
      // Filtered noise whoosh rising alongside (sweep the lowpass up).
      var n = noise('lowpass', 400, 0.7, dur, 0.28, t);
      if (n && n.flt) n.flt.frequency.exponentialRampToValueAtTime(4200, t + dur);
      // Bright bloom near the peak — the flash.
      osc('triangle', 700, 1500, 0.5, 0.26, t + dur * 0.55);
      osc('sine', 1400, 2600, 0.4, 0.18, t + dur * 0.6);
    },

    // Titan recruited — triumphant two-note rise with a shimmer tail.
    recruit: function () {
      if (!live()) return;
      var t = now();
      // Ascending triad-ish fanfare.
      osc('square', 392, 392, 0.16, 0.24, t);            // G4
      osc('square', 523, 523, 0.16, 0.24, t + 0.13);     // C5
      osc('square', 784, 784, 0.30, 0.26, t + 0.26);     // G5 (held)
      // Sparkle on top of the final note.
      osc('triangle', 1568, 2100, 0.35, 0.16, t + 0.28); // G6 shimmer
      // Soft airy noise swell underneath for body.
      noise('highpass', 2000, 0.6, 0.5, 0.10, t + 0.24);
    },

    // Purchase confirm — clean two-step "blip" (UI affirmative).
    buy: function () {
      if (!live()) return;
      var t = now();
      osc('square', 660, 660, 0.07, 0.22, t);
      osc('square', 990, 990, 0.10, 0.22, t + 0.06);
    },

    // Cannot afford / invalid — short low buzz (UI negative).
    deny: function () {
      if (!live()) return;
      var t = now();
      // Detuned low square pair = dissonant buzz.
      osc('square', 150, 130, 0.16, 0.26, t);
      osc('square', 158, 138, 0.16, 0.22, t, +12);
    },

    // Toggle / set mute. Updates the local fallback flag; when GAME.Economy is
    // present it owns the persisted state, so we mirror onto it too if writable.
    // Passing no argument toggles. Returns the resulting muted boolean.
    mute: function (b) {
      var next = (b === undefined) ? !isMuted() : !!b;
      localMuted = next;
      // On UNMUTE, resume a suspended context (callers invoke this from a user
      // gesture, which iOS requires). We do NOT write back to Economy here —
      // Economy owns the persisted flag and calls us to APPLY it; writing back
      // would recurse infinitely (Audio.mute → Economy.setMuted → Audio.mute …).
      if (!next && ctx && ctx.state === 'suspended' && ctx.resume) {
        try { ctx.resume(); } catch (e) { /* ignore */ }
      }
      return next;
    }
  };

  G.Audio = Audio;
})(window.GAME);
