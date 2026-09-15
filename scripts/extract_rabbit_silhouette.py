"""Extract the rabbit silhouette from the reference PNG and emit a compact
binary grid (base64 in a TS module) that the particle system samples from.

Run from repo root:
    python scripts/extract_rabbit_silhouette.py
"""
import base64
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(r"C:\Users\DELL\Desktop\RABBIT IA\03-resources\Imagen de Codex 11 sept 2026, 20_36_28.png")
OUT = Path("src/three/rabbitSilhouette.ts")

GRID_W = 128
GRID_H = 220
CELL_OCC = 0.32  # fraction of lit pixels required to mark a cell occupied


def otsu(hist):
    total = hist.sum()
    w = np.arange(len(hist), dtype=float)
    sum_all = (w * hist).sum()
    sum_b = 0.0
    w_b = 0.0
    var_max = -1.0
    thr = 127
    for t in range(1, 256):
        w_b += hist[t - 1]
        if w_b == 0:
            continue
        w_f = total - w_b
        if w_f == 0:
            break
        sum_b += (t - 1) * hist[t - 1]
        m_b = sum_b / w_b
        m_f = (sum_all - sum_b) / w_f
        var = w_b * w_f * (m_b - m_f) ** 2
        if var > var_max:
            var_max = var
            thr = t
    return thr


def largest_component(mask):
    from collections import deque

    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best = np.zeros_like(mask, dtype=bool)
    best_n = 0
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            comp = []
            q = deque([(y, x)])
            seen[y, x] = True
            while q:
                cy, cx = q.popleft()
                comp.append((cy, cx))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
            if len(comp) > best_n:
                best_n = len(comp)
                best.fill(False)
                for cy, cx in comp:
                    best[cy, cx] = True
    return best


def main():
    im = Image.open(SRC).convert("L")
    a = np.asarray(im, dtype=np.uint8)
    hist = np.bincount(a.ravel(), minlength=256)
    thr = otsu(hist)
    print("otsu threshold:", thr)

    mask = a > thr
    if mask.sum() == 0 or mask.sum() > a.size * 0.9:
        print("WARN: threshold produced empty/dominant mask; fallback fixed thr=40")
        thr = 40
        mask = a > thr

    # morphological close (dilate then erode) to fill fur speckles
    from scipy import ndimage  # optional; fall back to pure-numpy close below

    try:
        mask = ndimage.binary_closing(mask, structure=np.ones((5, 5), dtype=bool))
        mask = ndimage.binary_opening(mask, structure=np.ones((3, 3), dtype=bool))
    except Exception:
        pass
    mask = largest_component(mask)

    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        sys.exit("no subject pixels found")
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    print(f"subject bbox: x[{x0}:{x1}] y[{y0}:{y1}] size={(x1-x0)}x{(y1-y0)}")

    crop = mask[y0:y1, x0:x1]
    ch, cw = crop.shape
    sy = GRID_H / ch
    sx = GRID_W / cw
    grid = np.zeros((GRID_H, GRID_W), dtype=np.uint8)
    for gy in range(GRID_H):
        p0 = int(gy / sy)
        p1 = min(ch, int((gy + 1) / sy) + 1)
        for gx in range(GRID_W):
            q0 = int(gx / sx)
            q1 = min(cw, int((gx + 1) / sx) + 1)
            frac = crop[p0:p1, q0:q1].mean()
            if frac > CELL_OCC:
                grid[gy, gx] = 1

    occ = int(grid.sum())
    print(f"grid occupancy: {occ}/{GRID_W*GRID_H} = {occ/(GRID_W*GRID_H)*100:.1f}%")

    # ASCII sanity check (rows spaced by 4 => 55 lines)
    print("--- sampled grid preview ---")
    for gyy in range(0, GRID_H, 4):
        row = "".join("#" if grid[gyy, gxx] else "." for gxx in range(0, GRID_W, 2))
        print(row)

    # store bitmap: bit set => occupied; MSB-first bit order
    bits = np.packbits(grid.reshape(-1), bitorder="big").tobytes()
    b64 = base64.b64encode(bits).decode("ascii")

    ts = f"""// AUTO-GENERATED from the rabbit silhouette reference
// ({SRC.name}). Do not edit by hand.
// Bitmap of the rabbit silhouette in a {GRID_W}x{GRID_H} grid, 1 = surface.
export const RABBIT_SILHOUETTE = {{
  width: {GRID_W},
  height: {GRID_H},
  data: "{b64}",
}} as const;

export type RabbitSilhouette = typeof RABBIT_SILHOUETTE;

export function decodeRabbitSilhouette(): Uint8Array {{
  const bin = atob(RABBIT_SILHOUETTE.data);
  const out = new Uint8Array((RABBIT_SILHOUETTE.width * RABBIT_SILHOUETTE.height + 7) >> 3);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}}
"""
    OUT.write_text(ts, encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()