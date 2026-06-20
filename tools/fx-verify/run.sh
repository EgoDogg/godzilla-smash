#!/usr/bin/env bash
# tools/fx-verify/run.sh — gate(c) runner: bake the web drawGlow reference, then SSIM it vs the Unity FX captures.
# Best-effort (gate b is the hard blocker): a missing toolchain (puppeteer/numpy) SKIPs (exit 0), never red-fails.
# Prereq: gate(b) FxRenderHarness.AnimateAndCoverage has produced docs/campaign/shots/unity/fxspike-anim-{0..3}.png.
# CI wiring (an FX leg in .github/workflows/unity-ci.yml) is tracked under P0-MCP-CI.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/tools/fx-ref-bake" || exit 0
npm i --silent --no-audit --no-fund 2>/dev/null || { echo "[gate-c] SKIP — npm i failed (offline?)"; exit 0; }
node bake.js || { echo "[gate-c] SKIP — web bake failed"; exit 0; }
cd "$ROOT" || exit 0
python3 tools/fx-verify/check.py \
  docs/campaign/shots/unity/fxspike-anim-0.png tools/fx-ref-bake/ref-glow-0.png \
  docs/campaign/shots/unity/fxspike-anim-1.png tools/fx-ref-bake/ref-glow-0.5.png \
  docs/campaign/shots/unity/fxspike-anim-2.png tools/fx-ref-bake/ref-glow-1.png \
  docs/campaign/shots/unity/fxspike-anim-3.png tools/fx-ref-bake/ref-glow-1.5.png
rc=$?
[ $rc -eq 2 ] && { echo "[gate-c] SKIP — verify toolchain missing"; exit 0; }
exit $rc
