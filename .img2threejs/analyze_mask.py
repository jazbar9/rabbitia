"""Deterministic mask-profile analysis of rabbit.png (no PIL).

Computes per-row and per-column foreground coverage and prints a coarse
ASCII silhouette so the shape of the rabbit can be described without vision.
Pure stdlib: parses non-interlaced PNG color type 6 / 2 / 0.
"""
import struct
import sys
import zlib


def read_png(path):
    with open(path, "rb") as fh:
        data = fh.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a png"
    pos = 8
    width = height = bitdepth = colortype = None
    idat = b""
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        ctype = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, bitdepth, colortype = struct.unpack(">IIBB", chunk[:10])
        elif ctype == b"IDAT":
            idat += chunk
        elif ctype == b"IEND":
            break
    assert width and height, "no IHDR"
    assert not (bitdepth != 8 or colortype not in (0, 2, 6)), f"unsupported png {bitdepth}/{colortype}"
    raw = zlib.decompress(idat)
    bpp = {0: 1, 2: 3, 6: 4}[colortype]
    stride = width * bpp
    out = bytearray()
    prev = bytearray(stride)
    pos_byte = 0
    for _ in range(height):
        f = raw[pos_byte]
        pos_byte += 1
        line = bytearray(raw[pos_byte : pos_byte + stride])
        pos_byte += stride
        if f == 1:  # Sub
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif f == 2:  # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:  # Average
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                line[i] = (line[i] + ((a + b) >> 1)) & 255
        elif f == 4:  # Paeth
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out += line
        prev = line
    return width, height, bpp, colortype, out


def profile(path):
    w, h, bpp, ct, px = read_png(path)
    rows = []
    for y in range(h):
        cover = 0
        for x in range(w):
            off = (y * w + x) * bpp
            a = px[off + 3] if bpp == 4 else 255
            if a > 64:
                cover += 1
        rows.append(cover)
    cols = []
    for x in range(w):
        cover = 0
        for y in range(h):
            off = (y * w + x) * bpp
            a = px[off + 3] if bpp == 4 else 255
            if a > 64:
                cover += 1
        cols.append(cover)

    def ascii(data, size, label):
        mx = max(data) if data else 1
        step = max(1, len(data) // size)
        buckets = [max(data[i : i + step]) if i < len(data) else 0 for i in range(0, len(data), step)]
        out = []
        for b in buckets:
            bar = "".join("#" if i < int(b / mx * 20) else "." for i in range(20))
            out.append(bar)
        print(f"{label}:")
        for i in range(0, len(out), 8):
            print("  " + "  ".join(out[i : i + 8]))

    print(f"size={w}x{h} bpp={bpp} colorType={ct}")
    print(f"foreground rows: min={min(rows)} max={max(rows)} mean={sum(rows)/len(rows):.1f}")
    print("row coverage (top->bottom, each char block = 1/20 of max):")
    ascii(rows, 40, "rows  (y profile, high=wide)")
    print("col coverage (left->right):")
    ascii(cols, 40, "cols  (x profile)")
    # find limbs: widest and narrowest vertical bands
    band = [max(rows[i : i + min(10, h)]) for i in range(0, h, max(1, h // 20))]
    print("vertical bands (0=top): " + ", ".join(str(round(b / mxx * 100)) for b in band) if (mxx := max(band)) else "")

    gx, gy = 80, 50
    cw = max(1, w // gx)
    ch = max(1, h // gy)
    print(f"\nsilhouette ({gx} x {gy}, '#' = foreground):")
    for yy in range(0, h, ch):
        line = []
        for xx in range(0, w, cw):
            covered = 0
            total = 0
            for y in range(yy, min(yy + ch, h)):
                for x in range(xx, min(xx + cw, w)):
                    off = (y * w + x) * bpp
                    a = px[off + 3] if bpp == 4 else 255
                    total += 1
                    if a > 64:
                        covered += 1
            line.append("#" if total and covered / total >= 0.18 else ".")
        print("  " + "".join(line))


if __name__ == "__main__":
    profile(sys.argv[1])