// tools/fx-ref-bake/bake.js — bake the REAL web supernova drawGlow FX as the gate(c) ground truth (spec Step 11a).
//
// Headless Chromium (Blink/Skia) loads the IMMUTABLE web modules in index.html order, creates the supernova kaiju,
// and renders ONLY the FX overlay (drawGlow) at the 4 idle phases the Unity AnimateAndCoverage harness captures.
//
// ALIGNMENT: the Unity capture anchors the body-local origin at px (128,160) in a 256x320 sRGB RT; Unity's
// EncodeToPNG flips bottom-left->top-left, so a web-local point (wx,wy) lands at PNG (128+wx, 159-wy). The web canvas
// is already y-down/top-left, so translating to (128,159) puts the SAME effect at the SAME PNG pixel -> the two
// images overlay and the SSIM is meaningful (gamma-robust shape; absolute color is the G2 pow(2.2) toggle).

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '../..');
// index.html order, prefix up through entities.js (drawGlow's deps); gameplay/audio/sw modules omitted.
const JS = ['js/config.js', 'js/utils.js', 'js/iso.js', 'js/assets.js', 'js/archetypes.js', 'js/entities.js'];
const W = 256, H = 320, AX = 128, AY = 159, BASE = 2, FRAME = 0;
const IDLE = [0, 0.5, 1, 1.5];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setContent(`<!doctype html><html><body><canvas id="c" width="${W}" height="${H}"></canvas></body></html>`);
  for (const f of JS) await page.addScriptTag({ path: path.join(ROOT, f) });

  const setup = await page.evaluate((W, H, AX, AY, BASE, FRAME) => {
    const G = window.GAME;
    if (!G || !G.Kaiju || !G.Kaiju.create) return { err: 'window.GAME.Kaiju.create missing' };
    const cv = document.getElementById('c');
    const ctx = cv.getContext('2d');
    let k;
    try { k = G.Kaiju.create({ id: 'supernova' }); } catch (e) { return { err: 'create threw: ' + e }; }
    if (!k || !k.drawGlow) return { err: 'kaiju/drawGlow missing' };
    window.__bake = (phase) => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0f0d1a'; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(AX, AY);
      k._glowPhase = phase;
      k.fsm = 'idle';
      k.drawGlow(ctx, BASE, FRAME);
      ctx.restore();
      // non-blank probe: max luma over the FX band
      const d = ctx.getImageData(0, 0, W, H).data;
      let mx = 0;
      for (let i = 0; i < d.length; i += 4) { const l = d[i] + d[i + 1] + d[i + 2]; if (l > mx) mx = l; }
      return { png: cv.toDataURL('image/png'), maxLuma: mx };
    };
    return { ok: true };
  }, W, H, AX, AY, BASE, FRAME);

  if (setup.err) { console.error('BAKE-ERR', setup.err, errors.slice(0, 4)); await browser.close(); process.exit(2); }

  let minMax = 1e9;
  for (const p of IDLE) {
    const r = await page.evaluate(ph => window.__bake(ph), p);
    const b64 = r.png.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(__dirname, `ref-glow-${p}.png`), Buffer.from(b64, 'base64'));
    if (r.maxLuma < minMax) minMax = r.maxLuma;
  }
  await browser.close();
  if (errors.length) console.error('BAKE-WARN page errors:', errors.slice(0, 4));
  if (minMax < 60) { console.error('BAKE-ERR refs look blank (minMaxLuma=' + minMax + ')'); process.exit(2); }
  console.log('BAKE-OK minMaxLuma=' + minMax);
})().catch(e => { console.error('BAKE-FATAL', e); process.exit(3); });
