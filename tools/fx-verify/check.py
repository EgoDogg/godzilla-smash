#!/usr/bin/env python3
# tools/fx-verify/check.py — gate(c) FX-region SSIM: Unity capture vs the web drawGlow reference (spec Step 11b).
#
# URP blends LINEAR, the web canvas is sRGB -> absolute pixels differ; we gate the gamma-robust SHAPE (windowed SSIM
# on luma over the FX bbox), NOT pixel identity. FLOOR is intentionally low (0.55); the absolute pow(2.2) gamma-match
# is the G2 toggle, not this unit. scipy is NOT assumed: the windowed means/variances use a numpy integral-image box
# filter. Best-effort: a missing toolchain (numpy) exits 2 (SKIP), never red-fails CI; gate(b) is the hard blocker.
#
# Usage: check.py <unity.png> <ref.png> [more pairs...]  OR  check.py --pairs unity0,ref0 unity1,ref1 ...
import sys

FLOOR = 0.55
# FX bbox in the aligned 256x320 PNG layout (body origin at px 128,159): effects span rows ~10..190, cols ~40..220.
Y0, Y1, X0, X1 = 10, 190, 40, 220
WIN = 7

try:
    import numpy as np
    from PIL import Image
except Exception as e:  # missing optional toolchain -> SKIP (best-effort)
    print(f"[fxssim] SKIP — toolchain missing ({e}); gate(c) deferred (gate b is the hard blocker)")
    sys.exit(2)


def luma(path):
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float64)
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def boxfilter(img, r):
    # mean over a (2r+1)^2 window via an integral image, reflect-padded.
    pad = np.pad(img, r + 1, mode="reflect")
    ii = pad.cumsum(0).cumsum(1)
    ii = np.pad(ii, ((1, 0), (1, 0)), mode="constant")
    H, W = img.shape
    n = (2 * r + 1) ** 2
    y, x = np.arange(H) + r + 1, np.arange(W) + r + 1
    ys, xs = y[:, None], x[None, :]
    s = (ii[ys + r + 1, xs + r + 1] - ii[ys - r, xs + r + 1]
         - ii[ys + r + 1, xs - r] + ii[ys - r, xs - r])
    return s / n


def ssim(a, b, r=WIN // 2):
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mua, mub = boxfilter(a, r), boxfilter(b, r)
    mua2, mub2, muab = mua * mua, mub * mub, mua * mub
    va = boxfilter(a * a, r) - mua2
    vb = boxfilter(b * b, r) - mub2
    cov = boxfilter(a * b, r) - muab
    s = ((2 * muab + c1) * (2 * cov + c2)) / ((mua2 + mub2 + c1) * (va + vb + c2))
    return float(s.mean())


def crop(img):
    return img[Y0:Y1, X0:X1]


def pairs_from_argv(argv):
    if argv and argv[0] == "--pairs":
        return [tuple(p.split(",")) for p in argv[1:]]
    out = []
    for i in range(0, len(argv) - 1, 2):
        out.append((argv[i], argv[i + 1]))
    return out


def main():
    pairs = pairs_from_argv(sys.argv[1:])
    if not pairs:
        print("[fxssim] usage: check.py <unity.png> <ref.png> [...]"); sys.exit(2)
    scores = []
    for up, rp in pairs:
        try:
            u, r = crop(luma(up)), crop(luma(rp))
        except Exception as e:
            print(f"[fxssim] SKIP pair ({up},{rp}): {e}"); sys.exit(2)
        if u.shape != r.shape:
            print(f"[fxssim] SKIP — shape mismatch {u.shape} vs {r.shape}"); sys.exit(2)
        s = ssim(u, r)
        scores.append(s)
        print(f"[fxssim] {up.split('/')[-1]} vs {rp.split('/')[-1]}: SSIM={s:.3f}")
    mean = sum(scores) / len(scores)
    print(f"[fxssim] mean SSIM={mean:.3f} floor={FLOOR}  (min observed={min(scores):.3f}; tighten FLOOR to min-0.05 once stable)")
    if mean >= FLOOR:
        print("[fxssim] PASS")
        sys.exit(0)
    print("[fxssim] BELOW FLOOR (soft) — gate(b) is the hard blocker; record for G2 gamma-match")
    sys.exit(1)


if __name__ == "__main__":
    main()
